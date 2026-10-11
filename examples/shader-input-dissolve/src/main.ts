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
    Texture2D,
    Color,
    Vec4,
    utils,
    director,
    Director,
    game,
    gfx,
    Component,
} from 'cocosair';
import { decodePngLocally, premultipliedImage } from './image-source.js';
import { contentEffectDefinition, dissolveEffectDefinition } from './effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';
import { validate, type Definition, type InputDissolveParams } from './parameters.js';
// Ambient declarations for the WHATWG streams compression APIs (available in Chromium /
// Firefox / WebKit and Node >= 18; TS's ES2022 lib set does not list them yet).
const definition: Definition = await (await fetch('../shader-input-dissolve/parameters.json')).json();
const initial = Object.fromEntries(
    Object.entries(definition.params).map(([key, d]) => [key, (d as { default: number | string }).default]),
) as unknown as InputDissolveParams;
const test = new URLSearchParams(location.search).has('test');
if (test) document.documentElement.classList.add('test');
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 }),
    scene = new Scene('W4-C04-input-dissolve');
const device = director.root!.device,
    gl = canvas.getContext('webgl2')!;
const passCounts = new Map<number, number>();
const nativeBeginPass = device.commandBuffer.beginRenderPass;
device.commandBuffer.beginRenderPass = function (...args: Parameters<typeof nativeBeginPass>) {
    const frame = director.getTotalFrames();
    passCounts.set(frame, (passCounts.get(frame) ?? 0) + 1);
    return nativeBeginPass.apply(this, args);
};
const LAYER_CONTENT = 1 << 21,
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
const contentCamera = makeCamera('content', 0, LAYER_CONTENT, new Color(0, 0, 0, 0));
const mainCamera = makeCamera('main', 1, LAYER_SCREEN, new Color(8, 9, 12, 255));
let params = { ...initial },
    linearDiagnostic = false,
    time = 0,
    paused = false,
    released = false,
    ownerID = 0,
    updates = 0,
    manualSteps = 0;
let background = [8, 9, 12];
// ── Image route: real local decodable PNG loaded through native Texture2D ──
// Decoded straight-sRGB bytes are SHARED read-only evidence; every image-route INSTANCE
// owns its own Texture2D (uploaded premultiplied linear rgba8-grid storage) so retirement
// is always a clean 1->0 with no destroyed-shared-texture reuse.
let imageBytes: { width: number; height: number; data: number[] } | null = null;
let imagePayload: Uint8Array;
let imageReceipt: { width: number; height: number; format: string; bytes: number; sha256: string } | null = null;
async function loadImageRoute() {
    // Fetch the REAL PNG bytes and decode locally with NO canvas: the container is parsed
    // directly and the IDAT stream is inflated through DecompressionStream('deflate'), then
    // the per-row PNG filters are reversed by the pure helper below (Node tests verify the
    // same bytes against pngjs). The decoded straight-sRGB bytes feed BOTH the native
    // Texture2D upload and the CPU oracle contract.
    const response = await fetch('../shader-input-dissolve/assets/input-pattern.png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    imageBytes = await decodePngLocally(bytes);
    imagePayload = premultipliedImage(imageBytes.data);
    const digest = await crypto.subtle.digest('SHA-256', imagePayload as unknown as BufferSource);
    imageReceipt = {
        width: imageBytes.width,
        height: imageBytes.height,
        format: 'premultiplied-linear-rgba8',
        bytes: imagePayload.byteLength,
        sha256: Array.from(new Uint8Array(digest))
            .map((v) => v.toString(16).padStart(2, '0'))
            .join(''),
    };
}
/** Pure local PNG decoder (8-bit RGBA, non-interlaced): parse chunks, inflate IDAT with
 * DecompressionStream, reverse the per-row filters. No canvas / ImageBitmap anywhere. */

type Instance = {
    slabMeshes: ReturnType<typeof utils.createMesh>[];
    lastAspect: number;
    id: number;
    route: InputDissolveParams['route'];
    nodes: Node[];
    renderers: MeshRenderer[];
    mesh: ReturnType<typeof utils.createMesh>;
    materials: Material[];
    effects: EffectAsset[];
    sourceTexture: Texture2D | null;
    sourceRT: ReturnType<typeof createAirRenderTarget> | null;
    detachContentCamera: (() => void) | null;
    unbinds: (() => void)[];
    released: boolean;
};
let instance: Instance | null = null;
const abort = new AbortController(),
    events: { type: string; isTrusted: boolean; frame: number }[] = [];
let listenerAdds = 0,
    listenerRemoves = 0;
const listenerLedger: { target: EventTarget; type: string }[] = [];
function ledgerAdd(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject) {
    target.addEventListener(type, handler, { signal: abort.signal, passive: true });
    listenerLedger.push({ target, type });
    listenerAdds++;
}
const memory = () => ({ bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize });
function routeUsesRT(route: InputDissolveParams['route']) {
    // procedural: shader-generated content rendered to the RT (1 content pass).
    // rendered: real Scene/Camera/MeshRenderer content into the RT (render pass).
    // image: static native texture — no content pass at all.
    return route === 'procedural' || route === 'rendered';
}
function createInstance(route: InputDissolveParams['route']): Instance {
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
    const effects = [contentEffectDefinition, dissolveEffectDefinition].map((d) => {
        const eff = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(d)));
        eff.addRef();
        eff.onLoaded();
        return eff;
    });
    // Source RT for procedural/rendered routes: premultiplied rgba8 storage.
    let sourceRT: ReturnType<typeof createAirRenderTarget> | null = null;
    let detachContentCamera: (() => void) | null = null;
    if (routeUsesRT(route)) {
        sourceRT = createAirRenderTarget({
            name: `C04-source-${route}-${id}`,
            width: canvas.width,
            height: canvas.height,
            colorFormat: 'rgba8',
            depthFormat: 'none',
            samples: 1,
            filter: 'nearest',
            sampleFallback: 'error',
        });
        detachContentCamera = sourceRT.attachCamera(contentCamera);
    }
    const materials: Material[] = [];
    // content material (procedural route only)
    if (route === 'procedural') {
        const m = new Material();
        m.initialize({
            effectAsset: effects[0],
            defines: {},
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: { depthTest: false, depthWrite: false },
                blendState: { targets: [{ blend: false }] },
            },
        });
        m.addRef();
        materials.push(m);
    }
    // dissolve material
    const dm = new Material();
    dm.initialize({
        effectAsset: effects[1],
        defines: {},
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
    dm.addRef();
    materials.push(dm);
    // Content node (rendered route: a real MeshRenderer scene object with a checker material;
    // procedural route: the content shader quad).
    const nodes: Node[] = [];
    const renderers: MeshRenderer[] = [];
    const slabMeshes: ReturnType<typeof utils.createMesh>[] = [];
    if (route === 'procedural') {
        const n = new Node(`c04-content-${id}`);
        n.layer = LAYER_CONTENT;
        scene.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setSharedMaterial(materials[0], 0);
        nodes.push(n);
        renderers.push(r);
    } else if (route === 'rendered') {
        // REAL multi-node scene content: four vertical-slab geometry nodes with distinct
        // colors and transparency, rendered by the content camera into the RT — a genuine
        // rendered layer (the CPU oracle mirrors this exact layout band-by-band).
        const slabs: [string, number, number, number, number][] = [
            ['deep-blue', 0.08, 0.2, 0.65, 1],
            ['amber-half', 0.9, 0.55, 0.1, 0.5],
            ['window', 0, 0, 0, 0], // fully transparent gap (no node drawn)
            ['green', 0.12, 0.7, 0.25, 1],
        ];
        for (const [name, cr, cg, cb, ca] of slabs) {
            if (ca === 0) continue; // transparent band: nothing renders here
            const idx = slabs.findIndex(([n2]) => n2 === name);
            const aspect = canvas.width / canvas.height;
            // Quarter-span baked into the MESH (ortho units): slab i covers x in
            // [-aspect + i*(aspect/2), -aspect + (i+1)*(aspect/2)], y in [-1, 1].
            // The content camera's ortho aspect is 1 (square visible x∈[-1,1]); quarter spans.
            const x0 = -1 + idx * 0.5,
                x1 = -1 + (idx + 1) * 0.5;
            const slabMesh = utils.createMesh(
                {
                    positions: [x0, -1, 0, x1, -1, 0, x0, 1, 0, x1, 1, 0],
                    uvs: [0, 0, 1, 0, 0, 1, 1, 1],
                    indices: [0, 1, 2, 1, 3, 2],
                },
                undefined,
                { calculateBounds: true },
            );
            slabMesh.addRef();
            const rm = new Material();
            rm.initialize({
                effectAsset: effects[0],
                defines: {},
                states: {
                    rasterizerState: { cullMode: gfx.CullMode.NONE },
                    depthStencilState: { depthTest: false, depthWrite: false },
                    blendState:
                        ca < 1
                            ? {
                                  targets: [
                                      {
                                          // Premultiplied content: ONE / ONE_MINUS_SRC_ALPHA.
                                          blend: true,
                                          blendSrc: gfx.BlendFactor.ONE,
                                          blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                          blendSrcAlpha: gfx.BlendFactor.ONE,
                                          blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                      },
                                  ],
                              }
                            : { targets: [{ blend: false }] },
                },
            });
            rm.addRef();
            rm.setProperty('params', new Vec4(0, 4, 0, 0));
            rm.setProperty('flags', new Vec4(aspect, 0, 1, 0)); // solid-color mode
            rm.setProperty('params2', new Vec4(cr, cg, cb, ca));
            for (const pass of rm.passes) pass.update();
            materials.unshift(rm);
            const n = new Node(`c04-scene-${name}-${id}`);
            n.layer = LAYER_CONTENT;
            scene.addChild(n);
            const r = n.addComponent(MeshRenderer);
            r.mesh = slabMesh;
            r.setSharedMaterial(rm, 0);
            nodes.push(n);
            renderers.push(r);
            // Track the slab mesh for paired retirement (owned kinds material0..3).
            slabMeshes.push(slabMesh);
        }
    }
    const dn = new Node(`c04-dissolve-${id}`);
    dn.layer = LAYER_SCREEN;
    scene.addChild(dn);
    const dr = dn.addComponent(MeshRenderer);
    dr.mesh = mesh;
    dr.setSharedMaterial(materials[materials.length - 1], 0);
    nodes.push(dn);
    renderers.push(dr);
    const unbinds: (() => void)[] = [];
    let sourceTexture: Texture2D | null = null;
    if (route === 'image') {
        // Per-instance native texture: PREMULTIPLIED LINEAR bytes on the rgba8 grid — the GPU
        // inverse and the CPU oracle operate on the exact same quantized texels.
        const tex = new Texture2D();
        tex.addRef();
        tex.reset({
            width: imageBytes!.width,
            height: imageBytes!.height,
            format: Texture2D.PixelFormat.RGBA8888,
        });
        // Explicit NEAREST/NEAREST + no mips: the CPU oracle samples texel-exact.
        const { Filter } = Texture2D;
        tex.setFilters(Filter.NEAREST, Filter.NEAREST);
        tex.setMipFilter(Filter.NONE);
        tex.uploadData(imagePayload);
        sourceTexture = tex;
    }
    const result: Instance = {
        id,
        route,
        slabMeshes,
        lastAspect: canvas.width / canvas.height,
        nodes,
        renderers,
        mesh,
        materials,
        effects,
        sourceTexture,
        sourceRT,
        detachContentCamera,
        unbinds,
        released: false,
    };
    if (sourceRT) unbinds.push(sourceRT.bindColor(materials[materials.length - 1], 'sourceTexture'));
    if (sourceTexture) materials[materials.length - 1].setProperty('sourceTexture', sourceTexture);
    // Image route: no content pass — disable the content camera so no extra clear/pass runs.
    contentCamera.enabled = routeUsesRT(route);
    sync(result);
    return result;
}
function sync(target: Instance): void {
    const dissolveMat = target.materials[target.materials.length - 1];
    dissolveMat.setProperty('params', new Vec4(params.progress, params.scale, params.softness, params.seed));
    dissolveMat.setProperty(
        'flags',
        new Vec4(
            params.invert === 'on' ? 1 : 0,
            params.dissolveEnabled === 'on' ? 1 : 0,
            linearDiagnostic ? 1 : 0,
            canvas.width / canvas.height,
        ),
    );
    if (target.route === 'procedural' && target.materials.length >= 2) {
        target.materials[0].setProperty('params', new Vec4(time, 8, 0, 0));
        target.materials[0].setProperty('flags', new Vec4(canvas.width / canvas.height, 0, 0, 0));
    }
    if (target.route === 'image' && target.sourceTexture)
        dissolveMat.setProperty('sourceTexture', target.sourceTexture);
    for (const m of target.materials) for (const pass of m.passes) pass.update();
    updates++;
}
function retire(target: Instance) {
    if (target.released) return { id: target.id, idempotent: true, refs: [] };
    target.released = true;
    for (const unbind of target.unbinds) unbind();
    target.detachContentCamera?.();
    const contentDetached = contentCamera.targetTexture === null;
    target.sourceRT?.dispose();
    for (let i = 0; i < target.renderers.length; i++) {
        target.renderers[i].mesh = null;
        target.renderers[i].setSharedMaterial(null, 0);
        target.nodes[i].removeFromParent();
        target.nodes[i].destroy();
    }
    for (const eff of target.effects) EffectAsset.remove(eff);
    const refs = [
        ['mesh', target.mesh],
        ...target.slabMeshes.map((m, i) => [`slabMesh${i}`, m] as const),
        ...target.materials.map((m, i) => [`material${i}`, m] as const),
        ...target.effects.map((e, i) => [`effect${i}`, e] as const),
        ...(target.sourceTexture ? [['sourceTexture' as const, target.sourceTexture]] : []),
    ] as [string, { refCount: number; decRef: () => void; destroy: () => void; uuid: string }][];
    return {
        id: target.id,
        idempotent: false,
        renderersUnbound: target.renderers.every((r) => r.mesh === null && r.getSharedMaterial(0) === null),
        nodesRemoved: target.nodes.every((n) => n.parent === null),
        contentDetached,
        sourceDisposed: target.sourceRT ? target.sourceRT.info.disposed : true,
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
    if (released) throw Object.assign(new Error('Input Dissolve released'), { code: 'INPUTDISSOLVE_DISPOSED' });
}
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
};
function update(dt: number) {
    const started = performance.now();
    if (instance && !released) {
        // Backing lockstep on EVERY tick (render-only dt 0 included): the source RT and the
        // rendered-route slab geometry follow the live canvas size before anything renders.
        if (
            instance.sourceRT &&
            !instance.sourceRT.info.disposed &&
            (instance.sourceRT.info.width !== canvas.width || instance.sourceRT.info.height !== canvas.height)
        ) {
            instance.sourceRT.resize(canvas.width, canvas.height);
            if (instance.route === 'rendered') relayoutSceneSlabs(instance);
        }
        if (!paused && dt > 0) {
            time += dt;
            sync(instance);
        } else if (instance.lastAspect !== canvas.width / canvas.height) {
            // Render-only tick after a backing change: refresh the aspect-sensitive uniforms.
            instance.lastAspect = canvas.width / canvas.height;
            sync(instance);
        }
    }
    if (perf.active) perf.updateCalls.push({ frame: director.getTotalFrames(), ms: performance.now() - started });
}
/** Re-place the rendered-route scene slabs for the CURRENT viewport aspect (ortho cover). */
function relayoutSceneSlabs(target: Instance) {
    const aspect = canvas.width / canvas.height;
    for (const [index, node] of target.nodes.entries()) {
        if (index === target.nodes.length - 1) continue; // dissolve quad spans the screen
        const cx = -1 + (index * 2) / 4 + 1 / 4;
        node.setPosition(cx * aspect, 0, 0);
        node.setScale(0.25 * aspect, 1, 1);
    }
}
class InputDissolveUpdater extends Component {
    update(dt: number) {
        update(dt);
    }
}
const updater = scene.children[0].addComponent(InputDissolveUpdater);
await loadImageRoute();
instance = createInstance(initial.route);
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
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.125, 0.5],
    [0.375, 0.5],
    [0.625, 0.5],
    [0.875, 0.5],
    [0.5, 0.125],
    [0.5, 0.375],
    [0.5, 0.625],
    [0.5, 0.875],
    [0.25, 0.25],
    [0.75, 0.75],
];
const samplePoints = () =>
    DOMAINS.map(([u, v]) => ({
        x: Math.max(0, Math.min(canvas.width - 1, Math.floor(u * canvas.width))),
        y: Math.max(0, Math.min(canvas.height - 1, Math.floor(v * canvas.height))),
    })).filter((p, i, a) => a.findIndex((q) => q.x === p.x && q.y === p.y) === i);
let gpuPixels: { x: number; y: number; rgba: number[] }[] = [];
let gpuReceipt: any = null;
function afterDraw() {
    const renderedPasses = passCounts.get(director.getTotalFrames()) ?? 0;
    passCounts.clear();
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
        // Route PASS count (not raw draws): image=1 dissolve; procedural/rendered=content+dissolve.
        renderPasses: renderedPasses,
        glError: gl.getError(),
        background: [...background],
        route: instance?.route ?? null,
        sourceAttached: contentCamera.targetTexture !== null,
        mainTargetNull: mainCamera.targetTexture === null,
    };
}
director.on(Director.EVENT_AFTER_DRAW, afterDraw);
listenerAdds++;
listenerLedger.push({ target: director as unknown as EventTarget, type: Director.EVENT_AFTER_DRAW });
function snapshot() {
    return {
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        params: { ...params },
        time,
        paused,
        released,
        background: [...background],
        route: instance?.route ?? params.route,
        frame: director.getTotalFrames(),
        updates,
        instance: instance?.id,
        shaderPasses: instance
            ? instance.materials.flatMap((m) =>
                  m.passes.map((p) => ({ program: p.program, shaderCompiled: !!p.getShaderVariant() })),
              )
            : [],
        canvas: {
            width: canvas.width,
            height: canvas.height,
            css: { width: canvas.clientWidth, height: canvas.clientHeight },
        },
        renderTargets: instance?.sourceRT
            ? {
                  source: {
                      width: instance.sourceRT.info.width,
                      height: instance.sourceRT.info.height,
                      attached: contentCamera.targetTexture !== null,
                      generation: instance.sourceRT.info.generation,
                  },
              }
            : null,
        imageRoute: instance?.sourceTexture ? { ...imageReceipt } : null,
        pixels: gpuPixels,
        gpuReceipt,
        memory: memory(),
        listeners: { adds: listenerAdds, removes: listenerRemoves, ledger: listenerLedger.length },
        events: [...events],
        oneCanvas: document.querySelectorAll('canvas').length,
        linearDiagnostic,
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
    const oldRoute = params.route;
    params = { ...checked.values! };
    let retirement: unknown = null;
    if (oldRoute !== params.route) {
        if (instance) retirement = retire(instance);
        instance = createInstance(params.route);
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
            window.dispatchEvent(new Event('pointermove'));
            return true;
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
    const routes: InputDissolveParams['route'][] = ['image', 'procedural', 'rendered'];
    let warm = createInstance('image');
    await step(0);
    retire(warm);
    await step(0);
    await step(0);
    for (let index = 0; index < 100; index++) {
        const route = routes[index % 3];
        const before = memory();
        const item = createInstance(route);
        await step(0);
        const created = memory();
        const refsBefore = [...item.materials, ...item.effects, item.mesh].map((a) => a.refCount);
        const trace = retire(item) as ReturnType<typeof retire> & { repeat?: unknown };
        const repeat = retire(item); // second retirement is idempotent (same instance)
        trace.repeat = repeat;
        await step(0);
        await step(0);
        rows.push({
            index,
            id: item.id,
            route,
            before,
            created,
            after: memory(),
            refsBefore,
            trace,
            nodeValid: item.nodes.every((n) => n.isValid),
            registryPresent: item.effects.some((e) => EffectAsset.get(e.name) === e),
        });
    }
    instance = createInstance(params.route);
    await step(0);
    return { rows, listeners: { adds: listenerAdds, removes: listenerRemoves } };
}
// Native linear diagnostic (one-shot temp material; same Scene/Canvas; finally-then-return).
async function linearProbe() {
    ensure();
    if (!instance) throw new Error('INPUTDISSOLVE_NO_INSTANCE');
    const target = instance;
    const before = memory();
    const probeRT = createAirRenderTarget({
        name: 'W4-C04-linear-straight-input-dissolve',
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
    let tempMaterial: Material | null = null;
    let tempUnbind: (() => void) | null = null;
    let detach: () => void = () => {};
    let captured: Record<string, unknown> = {};
    const preserved = { instanceEqual: false, framesEqual: false };
    const updatesBeforeProbe = updates;
    let rendererRestored = false;
    let tempRefs: { before: number; after: number } | null = null;
    const dissolveIdx = target.materials.length - 1;
    try {
        detach = probeRT.attachCamera(mainCamera);
        paused = true;
        linearDiagnostic = true;
        tempMaterial = new Material();
        tempMaterial.initialize({
            effectAsset: target.effects[1],
            defines: {},
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: { depthTest: false, depthWrite: false },
                blendState: { targets: [{ blend: false }] },
            },
        });
        tempMaterial.addRef();
        tempMaterial.setProperty('params', new Vec4(params.progress, params.scale, params.softness, params.seed));
        tempMaterial.setProperty(
            'flags',
            new Vec4(
                params.invert === 'on' ? 1 : 0,
                params.dissolveEnabled === 'on' ? 1 : 0,
                1,
                canvas.width / canvas.height,
            ),
        );
        if (target.sourceRT) tempUnbind = target.sourceRT.bindColor(tempMaterial, 'sourceTexture');
        else if (target.sourceTexture) tempMaterial.setProperty('sourceTexture', target.sourceTexture);
        target.renderers[dissolveIdx].setSharedMaterial(tempMaterial, 0);
        for (const pass of tempMaterial.passes) pass.update();
        mainCamera.clearColor = new Color(0, 0, 0, 0);
        await step(0);
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
        captured = { snapshotState, capturedFrame, pixels, info, detached, disposed };
    } finally {
        target.renderers[dissolveIdx].setSharedMaterial(target.materials[dissolveIdx], 0);
        rendererRestored = target.renderers[dissolveIdx].getSharedMaterial(0) === target.materials[dissolveIdx];
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
            instanceEqual: instance?.id === target.id,
            framesEqual: updatesBeforeProbe === updates, // no sync/update ran from the probe tick
        });
        sync(target);
        await step(0);
    }
    const c = captured as any;
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
            glError: gl.getError(),
        },
        preserved,
        tempRefs,
        rendererRestored,
        memoryBefore: before,
        memoryAfter: memory(),
    };
}
function startPerformance() {
    ensure();
    if (perf.active) throw new Error('PERF_ACTIVE');
    if (clock) {
        clock.end();
        clock = null;
    }
    paused = false;
    perf.active = true;
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
        methods: {
            commands: 'CPU native gfx method wall envelope; includes immediate GL dispatch, not pure encoding',
            draws: 'CPU actual GL draw dispatch only, same Cocos context',
            queue: 'CPU statistics bookkeeping, not GPU command submission',
            frames: 'native AFTER_DRAW callback interval, not monitor presentation',
            gpu: 'TOOL_DIAGNOSTIC same-context native BEFORE_DRAW/AFTER_DRAW TIME_ELAPSED_EXT',
            passes: 'image: 1 dissolve pass; procedural: content RT + dissolve; rendered: scene render + dissolve',
            instrumentation:
                'native gfx command wrapping adds CPU envelope cost; instrumented diagnostic window, not an uninstrumented benchmark',
        },
    };
}
/** Cheap frame accessor for the native GL upload hook (no GL/shader reads in timed windows). */
function uploadContext() {
    return { frame: director.getTotalFrames(), sessionGeneration: 1, perfActive: perf.active };
}
const controls = document.querySelector<HTMLElement>('#parameters')!;
for (const [key, d] of Object.entries(definition.params)) {
    if (key === 'time') continue;
    const label = document.createElement('label');
    label.textContent = key;
    let control: HTMLInputElement | HTMLSelectElement;
    if (d.values) {
        control = document.createElement('select');
        for (const option of d.values) {
            const o = document.createElement('option');
            o.value = option;
            o.textContent = option;
            control.append(o);
        }
    } else {
        control = document.createElement('input');
        control.type = 'range';
        control.min = String(d.min);
        control.max = String(d.max);
        control.step = String(d.step);
    }
    control.value = String(d.default);
    control.dataset.parameter = key;
    control.addEventListener(
        'input',
        (e) => {
            events.push({ type: `parameter:${key}`, isTrusted: e.isTrusted, frame: director.getTotalFrames() });
            const value = d.values ? control.value : Number(control.value);
            void set({ ...params, [key]: value });
        },
        { signal: abort.signal },
    );
    label.append(control);
    controls.append(label);
}
for (const action of ['pause', 'resume', 'reset', 'release'])
    ledgerAdd(document.getElementById(action)!, 'click', (event: Event) => {
        events.push({ type: action, isTrusted: (event as MouseEvent).isTrusted, frame: director.getTotalFrames() });
        if (action === 'pause') paused = true;
        else if (action === 'resume') paused = false;
        else if (action === 'reset') {
            time = 0;
            void set(initial);
        } else void release();
    });
Object.assign(window, {
    __inputdissolve: {
        ready: true,
        definition,
        snapshot,
        step,
        set,
        cycles,
        release,
        linearProbe,
        startPerformance,
        stopPerformance,
        uploadContext,
        setTime(value: number) {
            ensure();
            if (!Number.isFinite(value) || value < 0) throw new Error('INPUTDISSOLVE_TIME');
            time = value;
            if (instance) sync(instance);
        },
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
                throw new Error('INPUTDISSOLVE_BACKGROUND');
            background = [...value.background];
            mainCamera.clearColor = new Color(...background, 255);
        },
        recreate: async () => {
            ensure();
            const trace = instance ? retire(instance) : null;
            instance = createInstance(params.route);
            await step(0);
            return { trace, snapshot: snapshot() };
        },
        pause() {
            paused = true;
        },
        resume() {
            paused = false;
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
    label: 'shader-input-dissolve',
    isDisposed: () => released,
    getInstance: () => instance,
    createInstance: () => {
        ensure();
        instance = createInstance(params.route);
        return instance;
    },
    retireInstance: (target) => {
        const trace = retire(target);
        if (instance === target) instance = null;
        return trace;
    },
    ownedAssets: (item) => [
        { name: 'id-mesh', ref: item.mesh },
        ...item.materials.map((m, i) => ({ name: `id-material${i}`, ref: m })),
        ...item.effects.map((e, i) => ({ name: `id-effect${i}`, ref: e })),
        ...(item.sourceTexture ? [{ name: 'id-source-texture', ref: item.sourceTexture }] : []),
    ],
    stepClock: clock
        ? async () => {
              await clock!.step(1 / 60);
          }
        : undefined,
});
