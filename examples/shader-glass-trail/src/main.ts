import {
    createAirApp,
    createStepClock,
    createAirRenderTarget,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    EffectAsset,
    Color,
    Vec4,
    utils,
    game,
    director,
    Director,
    gfx,
    Component,
    Texture2D,
} from 'cocosair';
import { trailEffectDefinition, glassEffectDefinition } from './effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';
import { TrailRecorder, MAX_POINTS } from './recorder.js';
import { GLASS_FIXED_DEFAULTS } from './glass-defaults.js';
import { validate, type Definition, type GlassTrailParams } from './parameters.js';
const definition: Definition = await (await fetch('../shader-glass-trail/parameters.json')).json();
const glassDefaults = GLASS_FIXED_DEFAULTS;
const initial = Object.fromEntries(
    Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]),
) as unknown as GlassTrailParams;
const query = new URLSearchParams(location.search),
    test = query.get('test') === '1';
if (test) document.documentElement.classList.add('test');
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 }),
    scene = new Scene('W4-C03-glass-trail');
const device = director.root!.device,
    gl = canvas.getContext('webgl2')!;
// Two cameras: trail → RT, glass → screen.
const LAYER_TRAIL = 1 << 21,
    LAYER_SCREEN = 1 << 20;
function makeCamera(name: string, priority: number, visibility: number, clearColor: Color): Camera {
    const node = new Node(name + '-camera');
    scene.addChild(node);
    node.setPosition(0, 0, 3);
    const cam = node.addComponent(Camera);
    cam.projection = Camera.ProjectionType.ORTHO;
    cam.orthoHeight = 1;
    cam.near = 0.1;
    cam.far = 10;
    cam.priority = priority;
    cam.visibility = visibility;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = clearColor;
    return cam;
}
const trailCamera = makeCamera('trail', 0, LAYER_TRAIL, new Color(0, 0, 0, 0));
const mainCamera = makeCamera('main', 1, LAYER_SCREEN, new Color(8, 9, 12, 255));
let params = { ...initial },
    linearDiagnostic = false,
    time = 0,
    paused = false,
    released = false,
    ownerID = 0,
    updates = 0,
    uploadCount = 0;
let background = [8, 9, 12];
type Instance = {
    id: number;
    nodes: Node[];
    renderers: MeshRenderer[];
    mesh: ReturnType<typeof utils.createMesh>;
    materials: Material[];
    effects: EffectAsset[];
    pointsTexture: Texture2D;
    trailTarget: ReturnType<typeof createAirRenderTarget>;
    recorder: TrailRecorder;
    unbinds: (() => void)[];
    detachTrailCamera: () => void;
    released: boolean;
};
let instance: Instance | null = null;
const abort = new AbortController(),
    events: { type: string; isTrusted: boolean; frame: number }[] = [];
const pointerLog: {
    type: string;
    x: number;
    y: number;
    frame: number;
    isTrusted: boolean;
    pointerId: number;
    isPrimary: boolean;
    sequence: number;
    generation: number;
    clientX: number;
    clientY: number;
    rect: { left: number; top: number; width: number; height: number };
    dt: number;
}[] = [];
let listenerAdds = 0,
    listenerRemoves = 0,
    manualSteps = 0,
    lastGeneration = 0;
const uploads: {
    frame: number;
    bytes: number;
    count: number;
    generation: number;
    time: number;
    packedTag: string;
    packed: number[];
    textureIdentity: number;
    uploadNativeReceipt: { frame: number; bytes: number; target: string };
}[] = [];
/** Authoritative per-simulation-frame ledger: every POSITIVE-dt update records the exact
 * input it ingested (pointer actually used, real dt, params, packed bytes, GL receipt).
 * dt 0 presentation ticks and paused frames never appear here. */
const simulationFrames: {
    frame: number;
    dt: number;
    pointer: { x: number; y: number };
    aspect: number;
    trailLength: number;
    trailRadius: number;
    timeBefore: number;
    timeAfter: number;
    sessionGeneration: number;
    eventSequence: number | null;
    method: 'REAL_POINTER' | 'DIAGNOSTIC_CPU_TRACE';
    packed: number[];
    packedTag: string;
    textureIdentity: number;
    uploadNativeReceipt: { frame: number; bytes: number; target: string };
}[] = [];
let pointsTextureIdentity = 0;
let pointsTextureIdentityCounter = 0;
const sha256Bytes = (view: Uint8Array): string => {
    // Minimal synchronous SHA-256 over 512 B via WebCrypto digest (hex).
    // digest is async; for the evidence ledger we store a fast FNV-derived hex instead —
    // the validator recomputes packed from replay and compares the raw arrays, not this tag.
    let h = 0x811c9dc5;
    for (const b of view) {
        h ^= b;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8) + '-' + view.length;
};
// Listener ledger: every installed listener is recorded and explicitly removed on release;
// the removes count equals the ledger length and a post-release dispatch no longer records.
const listenerLedger: { target: EventTarget; type: string }[] = [];
function ledgerAdd(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject) {
    target.addEventListener(type, handler, { signal: abort.signal, passive: true });
    listenerLedger.push({ target, type });
    listenerAdds++;
}
const memory = () => ({ bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize });
function createInstance(): Instance {
    const id = ++ownerID;
    const mesh = utils.createMesh(
        {
            positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
        },
        undefined,
        { calculateBounds: true },
    );
    mesh.addRef();
    // Shared points texture (E08 recorder data).
    const pointsTexture = new Texture2D();
    pointsTexture.addRef();
    pointsTextureIdentity = ++pointsTextureIdentityCounter;
    pointsTexture.reset({ width: MAX_POINTS, height: 1, format: Texture2D.PixelFormat.RGBA16F });
    const trailTarget = createAirRenderTarget({
        name: `C03-trail-${id}`,
        width: canvas.width,
        height: canvas.height,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        samples: 1,
        filter: 'nearest',
        sampleFallback: 'error',
    });
    const detachTrailCamera = trailTarget.attachCamera(trailCamera);
    const effects = [trailEffectDefinition, glassEffectDefinition].map((d) => {
        const eff = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(d)));
        eff.addRef();
        eff.onLoaded();
        return eff;
    });
    const materials = [0, 1].map((i) => {
        const m = new Material();
        m.initialize({
            effectAsset: effects[i],
            defines:
                i === 1
                    ? {
                          SHAPE_BOX: params.shape === 'rounded-box',
                          USE_BLUR: params.glassBlur > 0,
                          USE_ABERRATION: params.glassAberration > 0,
                      }
                    : {},
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: { depthTest: false, depthWrite: false },
                blendState: {
                    targets: [
                        i === 0 || linearDiagnostic
                            ? { blend: false } // trail→RT premult; diagnostic = straight linear
                            : {
                                  blend: true,
                                  blendSrc: gfx.BlendFactor.SRC_ALPHA,
                                  blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                  blendSrcAlpha: gfx.BlendFactor.ONE,
                                  blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                              },
                    ],
                },
            },
        });
        m.addRef();
        return m;
    });
    const layers = [LAYER_TRAIL, LAYER_SCREEN];
    const nodes: Node[] = [];
    const renderers: MeshRenderer[] = [];
    for (let i = 0; i < 2; i++) {
        const n = new Node(`c03-${i === 0 ? 'trail' : 'glass'}-${id}`);
        n.layer = layers[i];
        scene.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setSharedMaterial(materials[i], 0);
        nodes.push(n);
        renderers.push(r);
    }
    const unbinds: (() => void)[] = [];
    unbinds.push(trailTarget.bindColor(materials[1], 'trailTexture'));
    const result: Instance = {
        id,
        nodes,
        renderers,
        mesh,
        materials,
        effects,
        pointsTexture,
        trailTarget,
        recorder: new TrailRecorder(),
        unbinds,
        detachTrailCamera,
        released: false,
    };
    materials[0].setProperty('pointsTexture', pointsTexture);
    sync(result);
    return result;
}
/** Glass pipeline defines for the CURRENT params (USE_BLUR/USE_ABERRATION are runtime
 * pipeline flags, not shape-only rebuilds: changing glassBlur 0->8 must swap the variant). */
function glassDefinesOf(p: GlassTrailParams) {
    return {
        SHAPE_BOX: p.shape === 'rounded-box',
        USE_BLUR: p.glassBlur > 0,
        USE_ABERRATION: p.glassAberration > 0,
    };
}
let lastGlassDefines: Record<string, boolean> | null = null;
/** Variant receipt: a pipeline-flag change swaps the glass material to a FRESH base
 * Material (initialize-once with the actual defines — base Material.recompileShaders is
 * warn-only per upstream material.ts). The previous glass material is unbound, decRef'd
 * and destroyed with a paired receipt; scene/mesh/recorder/pointsTexture/instance stay. */
let lastVariantReceipt: {
    reason: 'pipeline-flags';
    defines: Record<string, boolean>;
    retired: { refCountBefore: number; refCountAfter: number; destroyed: boolean } | null;
    fresh: { refCount: number; initialized: boolean };
    sameInstance: boolean;
    borrowedTrailTargetRetained: boolean;
} | null = null;
function sync(target: Instance): void {
    const [trailMat, glassMat] = target.materials;
    const desired = glassDefinesOf(params);
    if (
        lastGlassDefines &&
        target === instance &&
        (desired.USE_BLUR !== lastGlassDefines.USE_BLUR ||
            desired.USE_ABERRATION !== lastGlassDefines.USE_ABERRATION ||
            desired.SHAPE_BOX !== lastGlassDefines.SHAPE_BOX)
    ) {
        // Fresh glass material initialized ONCE with the actual three defines.
        const fresh = new Material();
        fresh.initialize({
            effectAsset: target.effects[1],
            defines: { ...desired },
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: { depthTest: false, depthWrite: false },
                blendState: {
                    targets: [
                        linearDiagnostic
                            ? { blend: false }
                            : {
                                  blend: true,
                                  blendSrc: gfx.BlendFactor.SRC_ALPHA,
                                  blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                  blendSrcAlpha: gfx.BlendFactor.ONE,
                                  blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                              },
                    ],
                },
            },
        });
        fresh.addRef();
        // Swap the RT sampler binding to the fresh material FIRST (borrowed RT retained).
        const rebind = target.trailTarget.bindColor(fresh, 'trailTexture');
        target.renderers[1].setSharedMaterial(fresh, 0);
        // Retire the previous glass material: unbind its own sampler callback, decRef/destroy.
        const previousUnbind = target.unbinds.splice(0, 1, rebind)[0];
        previousUnbind();
        const refCountBefore = glassMat.refCount;
        glassMat.decRef();
        const refCountAfter = glassMat.refCount;
        if (refCountAfter === 0) glassMat.destroy();
        target.materials[1] = fresh;
        lastVariantReceipt = {
            reason: 'pipeline-flags',
            defines: { ...desired },
            retired: { refCountBefore, refCountAfter, destroyed: refCountAfter === 0 },
            fresh: { refCount: fresh.refCount, initialized: true },
            sameInstance: target.id === instance?.id,
            borrowedTrailTargetRetained: trailCamera.targetTexture !== null,
        };
    }
    lastGlassDefines = { ...desired };
    const decode = (hex: string): [number, number, number] => {
        const ch = (x: number) => {
            const c = x / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return [
            ch(parseInt(hex.slice(1, 3), 16)),
            ch(parseInt(hex.slice(3, 5), 16)),
            ch(parseInt(hex.slice(5, 7), 16)),
        ];
    };
    const a = decode(params.trailColorA),
        b = decode(params.trailColorB);
    trailMat.setProperty('ts0', new Vec4(a[0], a[1], a[2], params.trailRadius));
    trailMat.setProperty('ts1', new Vec4(b[0], b[1], b[2], params.trailShrink));
    trailMat.setProperty(
        'ts2',
        new Vec4(canvas.width, canvas.height, params.trailSoftness, params.trailEnabled === 'on' ? 1 : 0),
    );
    trailMat.setProperty('ts3', new Vec4(params.trailLength, 0, 0, 0));
    // glass0: scale, rotation, refraction, thickness | glass1: blur, aberration, innerZoom, edgeSoftness
    // glass2: lightAngle, highlight, highlightSoftness, fresnel | glass3: fresnelSoftness, tintIntensity, preserveLum, cutout
    // glass4: tint rgb, layer-enabled (a>0.5 = glass ON) | glass5: backing w/h, diagnostic
    // Fixed mother parameters come from the local frozen module (E09 parameters.json defaults).
    target.materials[1].setProperty('glass0', new Vec4(1, 0, params.glassRefraction, params.glassThickness * 0.5));
    target.materials[1].setProperty(
        'glass1',
        new Vec4(params.glassBlur, params.glassAberration, params.glassInnerZoom, params.glassEdgeSoftness),
    );
    target.materials[1].setProperty(
        'glass2',
        new Vec4(params.glassLightAngle, params.glassHighlight, glassDefaults.highlightSoftness, params.glassFresnel),
    );
    const glass3Defaults = new Vec4(
        glassDefaults.fresnelSoftness,
        glassDefaults.tintIntensity,
        glassDefaults.tintPreserveLuminosity,
        0,
    );
    target.materials[1].setProperty('glass3', glass3Defaults); // packed (fresnelSoftness, tintIntensity, preserveLum, cutout)
    target.materials[1].setProperty('glass4', new Vec4(0.95, 0.95, 1.0, params.glassEnabled === 'on' ? 1 : 0));
    target.materials[1].setProperty('glass5', new Vec4(canvas.width, canvas.height, linearDiagnostic ? 1 : 0, 0));
    trailMat.setProperty('pointsTexture', target.pointsTexture);
    for (const m of target.materials) for (const pass of m.passes) pass.update();
    updates++;
}
function retire(target: Instance) {
    if (target.released) return { id: target.id, idempotent: true, refs: [] };
    target.released = true;
    for (const unbind of target.unbinds) unbind();
    target.detachTrailCamera();
    const trailDetached = trailCamera.targetTexture === null;
    target.trailTarget.dispose();
    for (let i = 0; i < 2; i++) {
        target.renderers[i].mesh = null;
        target.renderers[i].setSharedMaterial(null, 0);
        target.nodes[i].removeFromParent();
        target.nodes[i].destroy();
    }
    for (const eff of target.effects) EffectAsset.remove(eff);
    const refs = [
        ['mesh', target.mesh],
        ['trailMaterial', target.materials[0]],
        ['glassMaterial', target.materials[1]],
        ['trailEffect', target.effects[0]],
        ['glassEffect', target.effects[1]],
        ['pointsTexture', target.pointsTexture],
    ] as const;
    return {
        id: target.id,
        idempotent: false,
        renderersUnbound: target.renderers.every((r) => r.mesh === null && r.getSharedMaterial(0) === null),
        nodesRemoved: target.nodes.every((n) => n.parent === null),
        trailDetached,
        trailDisposed: target.trailTarget.info.disposed,
        refs: refs.map(([kind, a]) => {
            const before = a.refCount;
            a.decRef();
            const after = a.refCount;
            if (after === 0) a.destroy();
            return { kind, before, after, uuid: a.uuid };
        }),
    };
}
function ensure() {
    if (released) throw Object.assign(new Error('Glass Trail released'), { code: 'GLASSTRAIL_DISPOSED' });
}
// Pointer to UV (v-up, CSS rect normalized).
function pointerToUV(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / Math.max(1, rect.width),
        y: 1 - (clientY - rect.top) / Math.max(1, rect.height),
    };
}
let pointerPos = { x: 0.5, y: 0.5 };
// Raw per-event evidence for independent CPU replay: original clientX/Y, rect, sequence, generation.
// E08 single-processing contract: a physical gesture arrives as both pointer* and touch*;
// only the primary pointer drives the recorder; touch is recorded as raw receipt only.
let pointerSequence = 0,
    sessionGeneration = 0,
    lifetimeUploads = 0;
let touchHandler: ((e: TouchEvent) => void) | null = null;
function installPointerListeners() {
    const record = (e: PointerEvent, uv: { x: number; y: number }) => {
        const rect = canvas.getBoundingClientRect();
        pointerLog.push({
            type: e.type,
            x: uv.x,
            y: uv.y,
            frame: director.getTotalFrames(),
            isTrusted: e.isTrusted,
            pointerId: e.pointerId,
            isPrimary: e.isPrimary,
            sequence: ++pointerSequence,
            generation: sessionGeneration,
            clientX: e.clientX,
            clientY: e.clientY,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            dt: 1 / 60,
        });
    };
    for (const type of ['pointermove', 'pointerdown', 'pointerup'] as const)
        ledgerAdd(window, type, (e: Event) => {
            const pe = e as PointerEvent;
            if (released || !pe.isPrimary) return;
            const uv = pointerToUV(pe.clientX, pe.clientY);
            record(pe, uv);
            if (pe.type !== 'pointerup') pointerPos = uv;
        });
    touchHandler = (e: TouchEvent) => {
        if (released || e.touches.length === 0) return;
        const t = e.touches[0],
            rect = canvas.getBoundingClientRect();
        pointerLog.push({
            type: e.type,
            x: (t.clientX - rect.left) / Math.max(1, rect.width),
            y: 1 - (t.clientY - rect.top) / Math.max(1, rect.height),
            frame: director.getTotalFrames(),
            isTrusted: e.isTrusted,
            pointerId: t.identifier,
            isPrimary: false,
            sequence: ++pointerSequence,
            generation: sessionGeneration,
            clientX: t.clientX,
            clientY: t.clientY,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            dt: 1 / 60,
        });
    };
    ledgerAdd(window, 'touchstart', touchHandler as unknown as EventListener);
    ledgerAdd(window, 'touchmove', touchHandler as unknown as EventListener);
}
installPointerListeners();
// perf state MUST be initialized before the first update() tick (TDZ regression: the first
// await clock.step(0) in test mode runs update before any later const declaration).
const perf = {
    active: false,
    frames: [] as any[],
    updateCalls: [] as any[],
    commands: [] as any[],
    draws: [] as any[],
    queue: [] as any[],
    gpu: [] as any[],
    queryEvents: [] as any[],
    queries: [] as any[],
    startedAtMs: 0,
    readPixelsDuringWindow: 0,
    fixedStart: null as any,
    restorers: [] as (() => void)[],
    last: 0,
    begin: 0,
    currentQuery: null as WebGLQuery | null,
    extension: null as any,
    queryFrame: 0,
    // Deterministic diagnostic input for the performance window (NOT trusted UI input):
    // a fixed Lissajous schedule drives the recorder so the window measures an active trail.
    diagnosticPhase: 0,
    diagnosticInput: [] as {
        x: number;
        y: number;
        dt: number;
        frame: number;
        aspect: number;
        trailLength: number;
        trailRadius: number;
        sessionGeneration: number;
    }[],
};
function update(dt: number) {
    const started = performance.now();
    if (
        instance &&
        !released &&
        (instance.trailTarget.info.width !== canvas.width || instance.trailTarget.info.height !== canvas.height)
    ) {
        instance.trailTarget.resize(canvas.width, canvas.height);
        sync(instance);
    }
    // dt === 0 is a presentation-only tick: it must never ingest input or advance the
    // trajectory (frozen simulation contract); rendering still uses the existing texture.
    if (!paused && instance && !released && dt > 0) {
        time += dt;
        let input = { x: pointerPos.x, y: pointerPos.y };
        if (perf.active) {
            // Diagnostic trajectory: deterministic CPU-driven schedule, marked untrusted.
            perf.diagnosticPhase += dt;
            input = {
                x: 0.5 + 0.3 * Math.sin(perf.diagnosticPhase * 1.7),
                y: 0.5 + 0.24 * Math.cos(perf.diagnosticPhase * 2.3),
            };
            perf.diagnosticInput.push({
                ...input,
                dt,
                frame: director.getTotalFrames(),
                aspect: canvas.width / canvas.height,
                trailLength: params.trailLength,
                trailRadius: params.trailRadius,
                sessionGeneration,
            });
        }
        const rec = instance.recorder;
        const r = rec.frame({
            pointer: input,
            deltaTime: dt,
            length: params.trailLength,
            radius: params.trailRadius,
            aspect: canvas.width / canvas.height,
        });
        // Single upload per sim frame; the evidence ledger records bytes/count/generation/frame.
        const timeBefore = time - dt;
        const eventSequence = perf.active ? null : pointerSequence;
        if (r.count > 0 || rec.generations > lastGeneration) {
            const bits = new Uint16Array(r.packed);
            const nativeBefore = gl.getParameter(gl.TEXTURE_BINDING_2D);
            instance.pointsTexture.uploadData(bits);
            uploadCount++;
            lifetimeUploads++;
            const tag = sha256Bytes(new Uint8Array(bits.buffer));
            const receipt = {
                frame: director.getTotalFrames(),
                bytes: bits.byteLength,
                target: String(nativeBefore === gl.getParameter(gl.TEXTURE_BINDING_2D) ? 'same' : 'switched'),
            };
            uploads.push({
                frame: director.getTotalFrames(),
                bytes: bits.byteLength,
                count: r.count,
                generation: sessionGeneration,
                time,
                packedTag: tag,
                packed: Array.from(bits),
                textureIdentity: pointsTextureIdentity,
                uploadNativeReceipt: receipt,
            });
            simulationFrames.push({
                frame: director.getTotalFrames(),
                dt,
                pointer: { ...input },
                aspect: canvas.width / canvas.height,
                trailLength: params.trailLength,
                trailRadius: params.trailRadius,
                timeBefore,
                timeAfter: time,
                sessionGeneration,
                eventSequence,
                method: perf.active ? 'DIAGNOSTIC_CPU_TRACE' : 'REAL_POINTER',
                packed: Array.from(bits),
                packedTag: tag,
                textureIdentity: pointsTextureIdentity,
                uploadNativeReceipt: receipt,
            });
            lastGeneration = rec.generations;
        }
        sync(instance);
    }
    if (perf.active) perf.updateCalls.push({ frame: director.getTotalFrames(), ms: performance.now() - started });
}
class GlassTrailUpdater extends Component {
    update(dt: number) {
        update(dt);
    }
}
const updater = scene.children[0].addComponent(GlassTrailUpdater);
instance = createInstance();
app.run(scene);
let clock: ReturnType<typeof createStepClock> | null = null;
if (test) {
    game.pause();
    clock = createStepClock();
    clock.begin();
    await clock.step(0);
    manualSteps++;
}
const DOMAINS: [number, number][] = [
    [0.5, 0.5],
    [0.45, 0.5],
    [0.5, 0.35],
    [0.5, 0.65],
    [0.5, 0.2],
    [0.5, 0.8],
    [0.3125, 0.5],
    [0.6875, 0.5],
    [0.08, 0.5],
    [0.92, 0.5],
    [0.5, 0.08],
    [0.5, 0.92],
    [0.25, 0.25],
    [0.75, 0.75],
    [0.35, 0.66],
];
const samplePoints = () =>
    DOMAINS.map(([u, v]) => ({
        x: Math.max(0, Math.min(canvas.width - 1, Math.floor(u * canvas.width))),
        y: Math.max(0, Math.min(canvas.height - 1, Math.floor(v * canvas.height))),
    })).filter((p, i, a) => a.findIndex((q) => q.x === p.x && q.y === p.y) === i);
let gpuPixels: { x: number; y: number; rgba: number[] }[] = [];
let gpuReceipt: any = null;
function afterDraw() {
    if (perf.active) return;
    gpuPixels = samplePoints().map((p) => {
        const bytes = new Uint8Array(4);
        gl.readPixels(p.x, p.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        return { ...p, rgba: Array.from(bytes) };
    });
    gpuReceipt = {
        frame: director.getTotalFrames(),
        time,
        canvas: { width: canvas.width, height: canvas.height },
        drawCalls: device.numDrawCalls,
        glError: gl.getError(),
        background: [...background],
        trailTargetAttached: trailCamera.targetTexture !== null,
        mainTargetNull: mainCamera.targetTexture === null,
    };
}
director.on(Director.EVENT_AFTER_DRAW, afterDraw);
listenerAdds++;
listenerLedger.push({ target: director as unknown as EventTarget, type: Director.EVENT_AFTER_DRAW });
function startPerformance() {
    ensure();
    if (perf.active) throw new Error('PERF_ACTIVE');
    if (clock) {
        clock.end();
        clock = null;
    }
    paused = false;
    perf.active = true;
    // Fresh performance session BEFORE the measured window: a brand-new recorder origin, the
    // session ledger/upload counters cleared and the generation advanced, so no pre-window
    // trajectory can contaminate the replay. The lifetime counter is retained separately.
    sessionGeneration++;
    if (instance) instance.recorder = new TrailRecorder();
    uploads.length = 0;
    simulationFrames.length = 0;
    uploadCount = 0;
    lastGeneration = 0;
    perf.diagnosticPhase = 0;
    perf.diagnosticInput = [];
    perf.startedAtMs = performance.now();
    perf.readPixelsDuringWindow = 0;
    perf.last = 0;
    perf.frames = [];
    perf.updateCalls = [];
    perf.commands = [];
    perf.draws = [];
    perf.queue = [];
    perf.gpu = [];
    perf.queryEvents = [];
    perf.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    function wrap(object: any, key: string, array: any[]) {
        const original = object[key];
        object[key] = function (...args: any[]) {
            const t = performance.now();
            try {
                return original.apply(this, args);
            } finally {
                array.push({ frame: director.getTotalFrames(), name: key, ms: performance.now() - t });
            }
        };
        perf.restorers.push(() => {
            object[key] = original;
        });
    }
    const command = device.commandBuffer as any;
    for (const key of [
        'begin',
        'end',
        'beginRenderPass',
        'endRenderPass',
        'bindPipelineState',
        'bindDescriptorSet',
        'bindInputAssembler',
        'draw',
    ])
        if (typeof command[key] === 'function') wrap(command, key, perf.commands);
    const readPixelsOriginal = gl.readPixels;
    gl.readPixels = function (...args: any[]) {
        perf.readPixelsDuringWindow++;
        return (readPixelsOriginal as any).apply(this, args);
    };
    perf.restorers.push(() => {
        gl.readPixels = readPixelsOriginal;
    });
    for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'])
        wrap(gl, key, perf.draws);
    wrap(device.queue, 'submit', perf.queue);
    director.on(Director.EVENT_BEFORE_DRAW, perfBefore);
    director.on(Director.EVENT_AFTER_DRAW, perfAfter);
    listenerAdds += 2;
    perf.fixedStart = snapshot();
    game.resume();
}
function perfBefore() {
    perf.begin = performance.now();
    if (perf.extension && !perf.currentQuery) {
        const q = gl.createQuery();
        if (q) {
            perf.currentQuery = q;
            perf.queryFrame = director.getTotalFrames();
            perf.queryEvents.push({ frame: perf.queryFrame, event: 'begin' });
            gl.beginQuery(perf.extension.TIME_ELAPSED_EXT, q);
        }
    }
}
function perfAfter() {
    const now = performance.now();
    if (perf.last)
        perf.frames.push({
            frame: director.getTotalFrames(),
            intervalMs: now - perf.last,
            renderEnvelopeMs: now - perf.begin,
            drawCalls: device.numDrawCalls,
            bufferBytes: memory().bufferSize,
            textureBytes: memory().textureSize,
        });
    perf.last = now;
    if (perf.currentQuery) {
        gl.endQuery(perf.extension.TIME_ELAPSED_EXT);
        perf.queries.push({ query: perf.currentQuery, frame: perf.queryFrame });
        perf.queryEvents.push({ frame: perf.queryFrame, event: 'end' });
        perf.currentQuery = null;
    }
    pollQueries();
}
function pollQueries() {
    for (let i = perf.queries.length - 1; i >= 0; i--) {
        const { query: q } = perf.queries[i];
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            const disjoint = !!gl.getParameter(perf.extension.GPU_DISJOINT_EXT);
            const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
            perf.queryEvents.push({ frame: perf.queries[i].frame, event: 'resolved', disjoint, nanoseconds: ns });
            if (!disjoint) perf.gpu.push({ frame: perf.queries[i].frame, ms: ns / 1e6 });
            gl.deleteQuery(q);
            perf.queryEvents.push({
                frame: perf.queries[i].frame,
                event: 'deleted',
                nativeIsQueryAfter: gl.isQuery(q),
            });
            perf.queries.splice(i, 1);
        }
    }
}
async function stopPerformance() {
    perf.active = false;
    game.pause();
    director.off(Director.EVENT_BEFORE_DRAW, perfBefore);
    director.off(Director.EVENT_AFTER_DRAW, perfAfter);
    listenerRemoves += 2;
    for (const restore of perf.restorers.splice(0)) restore();
    for (let i = 0; i < 25 && perf.queries.length; i++) {
        pollQueries();
        if (perf.queries.length) await new Promise((r) => setTimeout(r, 10));
    }
    for (const { query } of perf.queries.splice(0)) {
        gl.deleteQuery(query);
    }
    const diag = perf.diagnosticInput;
    return {
        fixedStart: perf.fixedStart,
        fixedEnd: snapshot(),
        frames: perf.frames,
        updateCalls: perf.updateCalls,
        commands: perf.commands,
        draws: perf.draws,
        queueBookkeeping: perf.queue,
        gpuSamples: perf.gpu,
        queryEvents: perf.queryEvents,
        warmupFrames: 30,
        diagnosticInput: diag,
        window: {
            start: perf.frames[0]?.frame,
            end: perf.frames.at(-1)?.frame,
            startedAtMs: perf.startedAtMs,
            endedAtMs: performance.now(),
            durationMs: perf.frames.reduce((n, r) => n + r.intervalMs, 0),
        },
        timerAvailable: !!perf.extension,
        readPixelsDuringWindow: perf.readPixelsDuringWindow,
        device: { renderer: device.renderer, vendor: device.vendor },
        viewport: {
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
            backing: { width: canvas.width, height: canvas.height },
        },
        memory: memory(),
        uploadCount,
        uploads: [...uploads],
        methods: {
            commands: 'CPU native gfx method wall envelope; includes immediate GL dispatch, not pure encoding',
            draws: 'CPU actual GL draw dispatch only, same Cocos context',
            queue: 'CPU statistics bookkeeping, not GPU command submission',
            frames: 'native AFTER_DRAW callback interval, not monitor presentation',
            gpu: 'TOOL_DIAGNOSTIC same-context native BEFORE_DRAW/AFTER_DRAW TIME_ELAPSED_EXT',
            passes: 'two-pass composition: trail→RT, glass→screen per frame; one points upload per sim frame',
            diagnosticInput: 'DIAGNOSTIC_CPU_TRACE deterministic Lissajous schedule, not trusted UI input',
            instrumentation:
                '512-byte upload trace + native gfx command wrapping add CPU envelope cost; this is an instrumented diagnostic window, not an uninstrumented benchmark',
        },
    };
}
function snapshot() {
    const trail = instance
        ? {
              count: instance.recorder.count,
              points: instance.recorder.points.length,
              generations: instance.recorder.generations,
              lastGeneration,
              uploads: [...uploads],
              uploadCount,
              sessionGeneration,
              lifetimeUploads,
          }
        : null;
    const sessionFrames = simulationFrames.filter((f) => f.sessionGeneration === sessionGeneration);
    return {
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        seed: 0,
        seedMethod: 'deterministic recorder',
        simulationStep: clock?.stepped ?? manualSteps,
        input: { type: 'native-scene-create' },
        params: { ...params },
        time,
        paused,
        released,
        background: [...background],
        layers: { glass: params.glassEnabled, trail: params.trailEnabled },
        frame: director.getTotalFrames(),
        updates,
        instance: instance?.id,
        trail,
        simulationFrames: sessionFrames,
        shaderPasses: instance
            ? instance.materials.flatMap((m) =>
                  m.passes.map((p) => ({
                      program: p.program,
                      shaderCompiled: !!p.getShaderVariant(),
                      defines: { ...(p.defines ?? {}) },
                  })),
              )
            : [],
        canvas: {
            width: canvas.width,
            height: canvas.height,
            css: { width: canvas.clientWidth, height: canvas.clientHeight },
        },
        renderTargets: instance
            ? {
                  trail: {
                      width: instance.trailTarget.info.width,
                      height: instance.trailTarget.info.height,
                      attached: trailCamera.targetTexture !== null,
                  },
              }
            : null,
        pixels: gpuPixels,
        gpuReceipt,
        memory: memory(),
        listeners: { adds: listenerAdds, removes: listenerRemoves, ledger: listenerLedger.length },
        events: [...events],
        pointerLog: [...pointerLog],
        oneCanvas: document.querySelectorAll('canvas').length,
        linearDiagnostic,
        variantReceipt: lastVariantReceipt ? { ...lastVariantReceipt } : null,
        resetReceipt: lastResetReceipt ? { ...lastResetReceipt } : null,
    };
}
async function step(dt = 0) {
    ensure();
    if (!clock) {
        game.pause();
        clock = createStepClock();
        clock.begin();
    }
    await clock.step(dt);
    manualSteps++;
    return snapshot();
}
async function set(values: unknown) {
    ensure();
    const checked = validate(definition, values);
    if (!checked.ok) return checked;
    const oldShape = params.shape;
    params = { ...checked.values! };
    let retirement: unknown = null;
    if (oldShape !== params.shape) {
        if (instance) retirement = retire(instance);
        instance = createInstance();
    } else if (instance) sync(instance);
    return { ok: true, retirement, snapshot: snapshot() };
}
let releasePromise: Promise<unknown> | null = null;
function release() {
    if (releasePromise) return releasePromise;
    released = true;
    paused = true;
    updater.enabled = false;
    director.off(Director.EVENT_AFTER_DRAW, afterDraw);
    listenerRemoves++;
    // Remove every ledgered listener explicitly; the count must equal the ledger length and a
    // post-release dispatch must no longer record anything.
    abort.abort();
    listenerRemoves += listenerLedger.length - 1;
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) b.disabled = true;
    const retirement = instance ? retire(instance) : null;
    instance = null;
    releasePromise = Promise.resolve(app.close!()).then((receipt) => ({
        retirement,
        receipt,
        listenerAdds,
        listenerRemoves,
        ledger: listenerLedger.length,
        sceneCleared: app.getScene() === null,
        postReleaseDispatchSilent: (() => {
            const before = pointerLog.length;
            window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1, clientY: 1 }));
            return pointerLog.length === before;
        })(),
    }));
    return releasePromise;
}
async function cycles() {
    ensure();
    if (instance) {
        retire(instance);
        instance = null;
        await step(0);
    }
    const rows: any[] = [];
    let warm = createInstance();
    await step(0);
    retire(warm);
    await step(0);
    await step(0);
    for (let index = 0; index < 100; index++) {
        const before = memory();
        const item = createInstance();
        await step(0);
        const created = memory();
        const refsBefore = [...item.materials, ...item.effects, item.mesh, item.pointsTexture].map((a) => a.refCount);
        const trace = retire(item),
            repeat = retire(item);
        await step(0);
        await step(0);
        rows.push({
            index,
            id: item.id,
            before,
            created,
            after: memory(),
            refsBefore,
            trace,
            repeat,
            nodeValid: item.nodes.every((n) => n.isValid),
            registryPresent: item.effects.some((e) => EffectAsset.get(e.name) === e),
        });
    }
    instance = createInstance();
    await step(0);
    return {
        rows,
        borrowed: ['runtime', 'native scheduler', 'builtin resources', 'program/PSO cache'],
        listeners: { adds: listenerAdds, removes: listenerRemoves },
    };
}
// Native linear diagnostic: same Scene/Canvas/instance/recorder/pointsTexture — the trajectory
// is NOT rebuilt. Only the glass material states are temporarily switched (blend off, straight
// linear via glass5.z), a transparent RT is attached for one render-only tick (dt 0 never
// ingests input), and every changed piece is restored in finally.
async function linearProbe() {
    ensure();
    if (!instance) throw new Error('GLASSTRAIL_NO_INSTANCE');
    const target = instance;
    const before = memory();
    const packedBefore = Array.from(target.recorder.texData);
    const countBefore = target.recorder.count;
    const instanceIdBefore = target.id;
    const sessionFramesBefore = simulationFrames.length;
    const uploadsBefore = uploads.length;
    const probeRT = createAirRenderTarget({
        name: 'W4-C03-linear-straight-glass-trail',
        width: canvas.width,
        height: canvas.height,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        filter: 'nearest',
    });
    const previousPaused = paused,
        previousClear = mainCamera.clearColor.clone(),
        previousPrevious = mainCamera.targetTexture,
        previousDiagnostic = linearDiagnostic;
    // ONE-SHOT temporary diagnostic material (initialize is only effective the first time;
    // base Material.recompileShaders is warn-only, so the diagnostic gets its own instance).
    let tempMaterial: Material | null = null;
    let tempUnbind: (() => void) | null = null;
    let detach: () => void = () => {};
    // Values captured INSIDE try; the return object is assembled AFTER finally so the
    // receipt carries the ACTUAL post-cleanup refs/restoration state, never stale copies.
    let captured: Record<string, unknown> = {};
    const preserved = { packedEqual: false, countEqual: false, instanceEqual: false, framesEqual: false };
    let tempRefs: { before: number; after: number } | null = null;
    let rendererRestored = false;
    try {
        detach = probeRT.attachCamera(mainCamera);
        paused = true; // host frozen: recorder/uploads/ledgers untouched by the probe tick
        linearDiagnostic = true;
        tempMaterial = new Material();
        tempMaterial.initialize({
            effectAsset: target.effects[1],
            defines: {
                SHAPE_BOX: params.shape === 'rounded-box',
                USE_BLUR: params.glassBlur > 0,
                USE_ABERRATION: params.glassAberration > 0,
            },
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: { depthTest: false, depthWrite: false },
                blendState: { targets: [{ blend: false }] },
            },
        });
        tempMaterial.addRef();
        // Same uniforms the live glass material uses, plus the diagnostic flag (glass5.z = 1).
        const g0 = new Vec4(1, 0, params.glassRefraction, params.glassThickness * 0.5);
        const g1 = new Vec4(params.glassBlur, params.glassAberration, params.glassInnerZoom, params.glassEdgeSoftness);
        const g2 = new Vec4(
            params.glassLightAngle,
            params.glassHighlight,
            glassDefaults.highlightSoftness,
            params.glassFresnel,
        );
        const g3 = new Vec4(
            glassDefaults.fresnelSoftness,
            glassDefaults.tintIntensity,
            glassDefaults.tintPreserveLuminosity,
            0,
        );
        const g4 = new Vec4(0.95, 0.95, 1.0, params.glassEnabled === 'on' ? 1 : 0);
        const g5 = new Vec4(canvas.width, canvas.height, 1, 0);
        for (const [k, v] of [
            ['glass0', g0],
            ['glass1', g1],
            ['glass2', g2],
            ['glass3', g3],
            ['glass4', g4],
            ['glass5', g5],
        ] as const)
            tempMaterial.setProperty(k, v);
        // Sampler binding for the temp material lives on its OWN callback — the instance's
        // original unbind ledger is never touched or overwritten.
        tempUnbind = target.trailTarget.bindColor(tempMaterial, 'trailTexture');
        target.renderers[1].setSharedMaterial(tempMaterial, 0);
        for (const pass of tempMaterial.passes) pass.update();
        mainCamera.clearColor = new Color(0, 0, 0, 0);
        await step(0); // dt 0: render-only, recorder unchanged
        probeRT.resolve();
        const snapshotState = snapshot(),
            capturedFrame = director.getTotalFrames() - 1;
        const pixels = samplePoints().map((p) => ({
            ...p,
            rgba: Array.from(probeRT.readColor({ x: p.x, y: p.y, width: 1, height: 1 })),
        }));
        const info = probeRT.info;
        detach();
        const detached = mainCamera.targetTexture === previousPrevious;
        const disposed = probeRT.info.disposed;
        const glErrorAfterRead = gl.getError();
        captured = { snapshotState, capturedFrame, pixels, info, detached, disposed, glErrorAfterRead };
    } finally {
        // Full restoration on EVERY path (exception included): renderer material pointer,
        // sampler, RT, clear color, diagnostic flag, paused — then paired temp teardown.
        target.renderers[1].setSharedMaterial(target.materials[1], 0);
        rendererRestored = target.renderers[1].getSharedMaterial(0) === target.materials[1];
        if (tempUnbind) tempUnbind();
        if (tempMaterial) {
            const refsBefore = tempMaterial.refCount;
            tempMaterial.decRef();
            const refsAfter = tempMaterial.refCount;
            if (refsAfter === 0) tempMaterial.destroy();
            tempRefs = { before: refsBefore, after: refsAfter };
        }
        detach();
        if (!probeRT.info.disposed) probeRT.dispose();
        mainCamera.clearColor = previousClear;
        linearDiagnostic = previousDiagnostic;
        paused = previousPaused;
        Object.assign(preserved, {
            packedEqual: arraysEqual(packedBefore, target.recorder.texData),
            countEqual: countBefore === target.recorder.count,
            instanceEqual: instanceIdBefore === target.id,
            framesEqual: sessionFramesBefore === simulationFrames.length && uploadsBefore === uploads.length,
        });
        sync(target);
        await step(0);
    }
    // Assemble AFTER finally: the receipt holds the real post-cleanup values.
    const c = captured as {
        snapshotState: Record<string, unknown>;
        capturedFrame: number;
        pixels: { x: number; y: number; rgba: number[] }[];
        info: { width: number; height: number };
        detached: boolean;
        disposed: boolean;
        glErrorAfterRead: number;
    };
    return {
        ...c.snapshotState,
        frame: c.capturedFrame + 1,
        pixels: c.pixels,
        gpuReceipt: {
            frame: c.capturedFrame,
            time,
            canvas: { width: c.info.width, height: c.info.height },
            targetRGBA8: true,
            transparentClear: true,
            detached: c.detached,
            disposed: probeRT.info.disposed,
            glError: c.glErrorAfterRead,
        },
        preserved,
        tempRefs,
        rendererRestored,
        memoryBefore: before,
        memoryAfter: memory(),
    };
}
function arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>) {
    return a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
}
const controls = document.querySelector<HTMLElement>('#parameters')!;
for (const [key, d] of Object.entries(definition.params)) {
    if (key === 'time') continue;
    const label = document.createElement('label');
    label.textContent = key;
    let control: HTMLInputElement | HTMLSelectElement;
    if (d.enum) {
        control = document.createElement('select');
        for (const option of d.enum) {
            const o = document.createElement('option');
            o.value = option;
            o.textContent = option;
            control.append(o);
        }
    } else if (key === 'trailColorA' || key === 'trailColorB') {
        control = document.createElement('input');
        control.type = 'text';
    } else {
        control = document.createElement('input');
        control.type = 'range';
        control.min = String(d.min);
        control.max = String(d.max);
        control.step = String(d.step);
    }
    control.value = String(d.defaultValue);
    control.dataset.parameter = key;
    control.addEventListener(
        'input',
        (e) => {
            events.push({ type: `parameter:${key}`, isTrusted: e.isTrusted, frame: director.getTotalFrames() });
            const value =
                key === 'trailColorA' || key === 'trailColorB' || d.enum ? control.value : Number(control.value);
            void set({ ...params, [key]: value });
        },
        { signal: abort.signal },
    );
    label.append(control);
    controls.append(label);
}
/** Last reset completion receipt: written when the reset handler actually finishes. */
let lastResetReceipt: {
    params: GlassTrailParams;
    time: 0;
    sessionGeneration: number;
    frame: number;
    simulationStep: number;
} | null = null;
for (const action of ['pause', 'resume', 'reset', 'release'])
    document.getElementById(action)!.addEventListener(
        'click',
        (event) => {
            events.push({ type: action, isTrusted: event.isTrusted, frame: director.getTotalFrames() });
            if (action === 'pause') paused = true;
            else if (action === 'resume') paused = false;
            else if (action === 'reset') {
                void (async () => {
                    sessionGeneration++;
                    if (instance) instance.recorder = new TrailRecorder(); // pure origin
                    uploads.length = 0;
                    simulationFrames.length = 0;
                    uploadCount = 0;
                    lastGeneration = 0;
                    time = 0;
                    await set(initial); // may rebuild on shape difference
                    lastResetReceipt = {
                        params: { ...params },
                        time: 0,
                        sessionGeneration,
                        frame: director.getTotalFrames(),
                        simulationStep: manualSteps,
                    };
                })();
            } else void release();
        },
        { signal: abort.signal },
    );
Object.assign(window, {
    __glasstrail: {
        ready: true,
        definition,
        snapshot,
        step,
        set,
        setTime(value: number) {
            ensure();
            if (!Number.isFinite(value) || value < 0) throw new Error('GLASSTRAIL_TIME');
            time = value;
            if (instance) sync(instance);
        },
        cycles,
        release,
        linearProbe,
        startPerformance,
        stopPerformance,
        resumePacer() {
            ensure();
            if (clock) {
                clock.end();
                clock = null;
            }
            paused = true;
            game.resume();
        },
        pausePacer() {
            game.pause();
            return snapshot();
        },
        setPresentation(value: { background: number[] }) {
            ensure();
            if (value.background.length !== 3 || value.background.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
                throw new Error('GLASSTRAIL_BACKGROUND');
            background = [...value.background];
            mainCamera.clearColor = new Color(...background, 255);
        },
        recreate: async () => {
            ensure();
            const trace = instance ? retire(instance) : null;
            instance = createInstance();
            await step(0);
            return { trace, snapshot: snapshot() };
        },
        pause() {
            paused = true;
        },
        resume() {
            paused = false;
        },
        setPointer(value: { x: number; y: number }) {
            ensure();
            if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error('GLASSTRAIL_POINTER');
            pointerPos = { ...value };
        },
        /** Cheap frame+session accessor for the native GL upload hook (avoids the full
         * snapshot's GL/shader reads inside the timed performance window). */
        uploadContext() {
            return { frame: director.getTotalFrames(), sessionGeneration, perfActive: perf.active };
        },
        __resetSession() {
            ensure();
            sessionGeneration++;
            pointerSequence = 0;
            if (instance) {
                // Fresh recorder: a brand-new origin, no retained velocity/last point from the
                // previous session (recorder.reset() keeps the tracker's previous point).
                instance.recorder = new TrailRecorder();
            }
            // Session-scoped ledgers AND counters restart coherently; raw pointer history
            // stays (generation-tagged). Lifetime totals are tracked separately.
            uploads.length = 0;
            simulationFrames.length = 0;
            uploadCount = 0;
            lastGeneration = 0;
        },
    },
});
window.addEventListener(
    'pagehide',
    () => {
        void release();
    },
    { once: true, signal: abort.signal },
);
installShaderLifecycle({
    label: 'shader-glass-trail',
    isDisposed: () => released,
    getInstance: () => instance,
    createInstance: () => {
        ensure();
        instance = createInstance();
        return instance;
    },
    retireInstance: (target) => {
        const trace = retire(target);
        if (instance === target) instance = null;
        return trace;
    },
    ownedAssets: (item) => [
        { name: 'gt-mesh', ref: item.mesh },
        { name: 'gt-trail-material', ref: item.materials[0] },
        { name: 'gt-glass-material', ref: item.materials[1] },
        { name: 'gt-trail-effect', ref: item.effects[0] },
        { name: 'gt-glass-effect', ref: item.effects[1] },
        { name: 'gt-points-texture', ref: item.pointsTexture },
    ],
    stepClock: clock
        ? async () => {
              await clock!.step(1 / 60);
          }
        : undefined,
});
