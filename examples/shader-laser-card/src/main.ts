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
} from 'cocosair';
import { holoEffectDefinition, embossEffectDefinition, sparkleEffectDefinition } from './effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';
import { validate, type Definition, type LaserCardParams } from './parameters.js';
const definition: Definition = await (await fetch('../shader-laser-card/parameters.json')).json();
const initial = Object.fromEntries(
    Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]),
) as unknown as LaserCardParams;
const query = new URLSearchParams(location.search),
    test = query.get('test') === '1';
if (test) document.documentElement.classList.add('test');
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 }),
    scene = new Scene('W4-C01-laser-card');
const device = director.root!.device,
    gl = canvas.getContext('webgl2')!;
// ═══════════ Three cameras: holo → emboss → sparkle (ascending priority) ═══════════
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
const LAYER_HOLO = 1 << 21,
    LAYER_EMBOSS = 1 << 22,
    LAYER_SCREEN = 1 << 20;
const holoCamera = makeCamera('holo', 0, LAYER_HOLO, new Color(0, 0, 0, 0));
const embossCamera = makeCamera('emboss', 1, LAYER_EMBOSS, new Color(0, 0, 0, 0));
const mainCamera = makeCamera('main', 2, LAYER_SCREEN, new Color(8, 9, 12, 255));
let params = { ...initial },
    time = 0,
    paused = false,
    released = false,
    ownerID = 0,
    updates = 0;
let background = [8, 9, 12],
    linearDiagnostic = false;
type Instance = {
    id: number;
    nodes: Node[];
    renderers: MeshRenderer[];
    mesh: ReturnType<typeof utils.createMesh>;
    materials: Material[];
    effects: EffectAsset[];
    holoTarget: ReturnType<typeof createAirRenderTarget>;
    embossTarget: ReturnType<typeof createAirRenderTarget>;
    unbinds: (() => void)[];
    detachHoloCamera: () => void;
    detachEmbossCamera: () => void;
    unbindSparkle: (() => void) | null;
    routeEmboss: boolean | null;
    released: boolean;
};
let instance: Instance | null = null;
const abort = new AbortController(),
    events: { type: string; isTrusted: boolean; frame: number }[] = [];
let listenerAdds = 0,
    listenerRemoves = 0,
    manualSteps = 0;
let lastAction: any = { method: 'native-scene-create', sequence: 0 };
const memory = () => ({ bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize });
function makeQuad() {
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
    return mesh;
}
function createInstance(): Instance {
    const id = ++ownerID;
    const mesh = makeQuad();
    const defs = [holoEffectDefinition, embossEffectDefinition, sparkleEffectDefinition];
    const effects = defs.map((d) => {
        const eff = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(d)));
        eff.addRef();
        eff.onLoaded();
        return eff;
    });
    // Both intermediate RTs follow the canvas backing (DPR-aware).
    const rtW = canvas.width,
        rtH = canvas.height;
    const holoTarget = createAirRenderTarget({
        name: `C01-holo-${id}`,
        width: rtW,
        height: rtH,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        samples: 1,
        filter: 'nearest',
        sampleFallback: 'error',
    });
    const detachHoloCamera = holoTarget.attachCamera(holoCamera);
    const embossTarget = createAirRenderTarget({
        name: `C01-emboss-${id}`,
        width: rtW,
        height: rtH,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        samples: 1,
        filter: 'nearest',
        sampleFallback: 'error',
    });
    const detachEmbossCamera = embossTarget.attachCamera(embossCamera);
    const materials = [0, 1, 2].map((i) => {
        const m = new Material();
        m.initialize({
            effectAsset: effects[i],
            defines: { SHAPE_BOX: params.shape === 'rounded-box' },
            states: {
                rasterizerState: { cullMode: gfx.CullMode.NONE },
                depthStencilState: { depthTest: false, depthWrite: false },
                blendState: {
                    targets: [
                        i === 2
                            ? {
                                  blend: !linearDiagnostic,
                                  blendSrc: gfx.BlendFactor.SRC_ALPHA,
                                  blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                  blendSrcAlpha: gfx.BlendFactor.ONE,
                                  blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                              }
                            : { blend: false },
                    ],
                },
            },
        });
        m.addRef();
        return m;
    });
    const layers = [LAYER_HOLO, LAYER_EMBOSS, LAYER_SCREEN];
    const names = [`c01-holo-${id}`, `c01-emboss-${id}`, `c01-sparkle-${id}`];
    const nodes: Node[] = [];
    const renderers: MeshRenderer[] = [];
    for (let i = 0; i < 3; i++) {
        const n = new Node(names[i]);
        n.layer = layers[i];
        scene.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setSharedMaterial(materials[i], 0);
        nodes.push(n);
        renderers.push(r);
    }
    // Bind the RT textures: emboss reads holo, sparkle reads emboss.
    const unbinds: (() => void)[] = [];
    unbinds.push(holoTarget.bindColor(materials[1], 'holoTexture'));
    const result: Instance = {
        id,
        nodes,
        renderers,
        mesh,
        materials,
        effects,
        holoTarget,
        embossTarget,
        unbinds,
        detachHoloCamera,
        detachEmbossCamera,
        unbindSparkle: null,
        routeEmboss: null,
        released: false,
    };
    sync(result);
    return result;
}
function sync(target: Instance): void {
    for (const rt of [target.holoTarget, target.embossTarget])
        if (rt.info.width !== canvas.width || rt.info.height !== canvas.height) rt.resize(canvas.width, canvas.height);
    const routeEmboss = params.embossEnabled === 'on';
    if (target.routeEmboss !== routeEmboss) {
        target.unbindSparkle?.();
        target.unbindSparkle = (routeEmboss ? target.embossTarget : target.holoTarget).bindColor(
            target.materials[2],
            'embossTexture',
        );
        target.routeEmboss = routeEmboss;
    }
    embossCamera.enabled = routeEmboss;
    target.renderers[1].enabled = routeEmboss;
    const [holoMat, embossMat, sparkleMat] = target.materials;
    holoMat.setProperty(
        'hs0',
        new Vec4(params.holoRoughness, params.holoCrinkle, params.holoSparkle, params.holoFoilScale),
    );
    holoMat.setProperty(
        'hs1',
        new Vec4(params.holoSaturation, params.holoHueShift, time, params.holoEnabled === 'on' ? 1 : 0),
    );
    holoMat.setProperty('hs2', new Vec4(canvas.width, canvas.height, 0, 0));
    embossMat.setProperty(
        'es0',
        new Vec4(
            params.embossDepth,
            params.embossLightAngle,
            params.embossShadowIntensity,
            params.embossEnabled === 'on' ? 1 : 0,
        ),
    );
    embossMat.setProperty('es1', new Vec4(canvas.width, canvas.height, time, 0));
    sparkleMat.setProperty(
        'ss0',
        new Vec4(params.sparkleSize, params.sparkleIntensity, params.sparkleThreshold, params.sparkleRayLength),
    );
    sparkleMat.setProperty('ss1', new Vec4(params.sparkleColorize, time, params.sparkleEnabled === 'on' ? 1 : 0, 0));
    sparkleMat.setProperty(
        'ss2',
        new Vec4(canvas.clientWidth, canvas.clientHeight, params.sparkleSeed, linearDiagnostic ? 1 : 0),
    );
    for (const m of target.materials) for (const pass of m.passes) pass.update();
    updates++;
}
function retire(target: Instance) {
    if (target.released) return { id: target.id, idempotent: true, refs: [] };
    target.released = true;
    target.unbindSparkle?.();
    for (const unbind of target.unbinds) unbind();
    target.detachHoloCamera();
    target.detachEmbossCamera();
    const holoDetached = holoCamera.targetTexture === null;
    const embossDetached = embossCamera.targetTexture === null;
    target.holoTarget.dispose();
    target.embossTarget.dispose();
    for (let i = 0; i < 3; i++) {
        target.renderers[i].mesh = null;
        target.renderers[i].setSharedMaterial(null, 0);
        target.nodes[i].removeFromParent();
        target.nodes[i].destroy();
    }
    for (const eff of target.effects) EffectAsset.remove(eff);
    const refs = [
        ['mesh', target.mesh],
        ['holoMaterial', target.materials[0]],
        ['embossMaterial', target.materials[1]],
        ['sparkleMaterial', target.materials[2]],
        ['holoEffect', target.effects[0]],
        ['embossEffect', target.effects[1]],
        ['sparkleEffect', target.effects[2]],
    ] as const;
    return {
        id: target.id,
        idempotent: false,
        renderersUnbound: target.renderers.every((r) => r.mesh === null && r.getSharedMaterial(0) === null),
        nodesRemoved: target.nodes.every((n) => n.parent === null),
        holoDetached,
        embossDetached,
        holoDisposed: target.holoTarget.info.disposed,
        embossDisposed: target.embossTarget.info.disposed,
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
    if (released) throw Object.assign(new Error('Laser Card released'), { code: 'LASER_DISPOSED' });
}
function update(dt: number) {
    const started = performance.now();
    if (!released && instance) {
        if (!paused) time += dt;
        sync(instance);
    }
    if (perf.active) perf.updateCalls.push({ frame: director.getTotalFrames(), ms: performance.now() - started });
}
class LaserUpdater extends Component {
    update(dt: number) {
        update(dt);
    }
}
const updater = scene.children[0].addComponent(LaserUpdater);
let clock: ReturnType<typeof createStepClock> | null = null;
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
    })).filter((p, i, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === i);
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
        glViewport: Array.from(gl.getParameter(gl.VIEWPORT)),
        defaultFramebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) === null,
        drawCalls: device.numDrawCalls,
        glError: gl.getError(),
        background: [...background],
        cameras: [holoCamera.priority, embossCamera.priority, mainCamera.priority],
        holoTargetAttached: holoCamera.targetTexture !== null,
        embossTargetAttached: embossCamera.targetTexture !== null,
        mainTargetNull: mainCamera.targetTexture === null,
    };
}
director.on(Director.EVENT_AFTER_DRAW, afterDraw);
listenerAdds++;
// ── Performance instrumentation (same-context wrappers) ──
const perf = {
    active: false,
    frames: [] as any[],
    updateCalls: [] as { frame: number; ms: number }[],
    commands: [] as any[],
    draws: [] as any[],
    queue: [] as any[],
    queries: [] as { query: WebGLQuery; frame: number }[],
    gpu: [] as { frame: number; ms: number }[],
    queryEvents: [] as any[],
    queryFrame: 0,
    startedAtMs: 0,
    readPixelsDuringWindow: 0,
    fixedStart: null as any,
    restorers: [] as (() => void)[],
    last: 0,
    begin: 0,
    currentQuery: null as WebGLQuery | null,
    extension: null as any,
};
// Instrumentation state and pixel readers must exist before the first engine update/draw.
instance = createInstance();
app.run(scene);
if (test) {
    game.pause();
    clock = createStepClock();
    clock.begin();
    await clock.step(0);
    manualSteps++;
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
        perf.restorers.push(() => (object[key] = original));
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
    perf.restorers.push(() => (gl.readPixels = readPixelsOriginal));
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
        const entry = perf.queries[i],
            q = entry.query;
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            const disjoint = !!gl.getParameter(perf.extension.GPU_DISJOINT_EXT);
            const nanoseconds = gl.getQueryParameter(q, gl.QUERY_RESULT);
            perf.queryEvents.push({ frame: entry.frame, event: 'resolved', disjoint, nanoseconds });
            if (!disjoint) perf.gpu.push({ frame: entry.frame, ms: nanoseconds / 1e6 });
            gl.deleteQuery(q);
            perf.queryEvents.push({ frame: entry.frame, event: 'deleted', nativeIsQueryAfter: gl.isQuery(q) });
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
        if (perf.queries.length) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    for (const entry of perf.queries.splice(0)) {
        perf.queryEvents.push({ frame: entry.frame, event: 'timeout' });
        gl.deleteQuery(entry.query);
        perf.queryEvents.push({ frame: entry.frame, event: 'deleted', nativeIsQueryAfter: gl.isQuery(entry.query) });
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
            passes: 'three-pass composition: holo→RT, emboss→RT, sparkle→screen per frame',
        },
    };
}
function snapshot() {
    return {
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        seed: params.sparkleSeed,
        seedMethod: 'deterministic composition; seed in sparkle hash domain',
        simulationStep: clock?.stepped ?? manualSteps,
        input: { ...lastAction },
        params: { ...params },
        time,
        paused,
        released,
        background: [...background],
        linearDiagnostic,
        routing: {
            holoSource: params.holoEnabled === 'on' ? 'holographic' : 'neutral-checker',
            embossCameraEnabled: embossCamera.enabled,
            sampleSource: instance?.routeEmboss ? 'emboss-target' : 'holo-target',
            expectedPasses: instance?.routeEmboss ? 3 : 2,
            retainedTargets: instance ? 2 : 0,
        },
        layers: {
            holo: params.holoEnabled,
            emboss: params.embossEnabled,
            sparkle: params.sparkleEnabled,
        },
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
        renderTargets: instance
            ? {
                  holo: {
                      width: instance.holoTarget.info.width,
                      height: instance.holoTarget.info.height,
                      attached: holoCamera.targetTexture !== null,
                  },
                  emboss: {
                      width: instance.embossTarget.info.width,
                      height: instance.embossTarget.info.height,
                      attached: embossCamera.targetTexture !== null,
                  },
              }
            : null,
        pixels: gpuPixels,
        gpuReceipt,
        memory: memory(),
        listeners: { adds: listenerAdds, removes: listenerRemoves },
        events: [...events],
        oneCanvas: document.querySelectorAll('canvas').length,
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
    lastAction = { method: 'native-parameter-api', sequence: lastAction.sequence + 1, input: values };
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
    abort.abort();
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) b.disabled = true;
    const retirement = instance ? retire(instance) : null;
    instance = null;
    releasePromise = Promise.resolve(app.close!()).then((receipt) => ({
        retirement,
        receipt,
        listenerAdds,
        listenerRemoves,
        sceneCleared: app.getScene() === null,
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
        const refsBefore = item.materials.map((m) => m.refCount);
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
            assetsValid: [...item.materials, ...item.effects, item.mesh].map((a) => a.isValid),
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
async function linearProbe() {
    ensure();
    const before = memory(),
        previousTarget = mainCamera.targetTexture;
    const clear = mainCamera.clearColor.clone();
    const target = createAirRenderTarget({
        name: 'C01-linear-diagnostic',
        width: canvas.width,
        height: canvas.height,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        samples: 1,
        filter: 'nearest',
    });
    const detach = target.attachCamera(mainCamera);
    let captured: ReturnType<typeof snapshot> | null = null,
        pixels: typeof gpuPixels = [];
    let detached = false;
    try {
        linearDiagnostic = true;
        mainCamera.clearColor = new Color(0, 0, 0, 0);
        if (instance) retire(instance);
        instance = createInstance();
        await step(0);
        target.resolve();
        captured = snapshot();
        pixels = samplePoints().map((p) => ({
            ...p,
            rgba: Array.from(target.readColor({ x: p.x, y: p.y, width: 1, height: 1 })),
        }));
    } finally {
        detach();
        detached = mainCamera.targetTexture === previousTarget;
        target.dispose();
        linearDiagnostic = false;
        mainCamera.clearColor = clear;
        if (instance) retire(instance);
        instance = createInstance();
        await step(0);
        await step(0);
    }
    return {
        ...captured!,
        pixels,
        gpuReceipt: {
            frame: captured!.frame - 1,
            time: captured!.time,
            canvas: { width: captured!.canvas.width, height: captured!.canvas.height },
            targetRGBA8: true,
            transparentClear: true,
            detached,
            disposed: target.info.disposed,
            glError: gl.getError(),
        },
        memoryBefore: before,
        memoryAfter: memory(),
    };
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
            void set({ ...params, [key]: d.type === 'number' ? Number(control.value) : control.value });
        },
        { signal: abort.signal },
    );
    label.append(control);
    controls.append(label);
}
for (const action of ['pause', 'resume', 'reset', 'release'])
    document.getElementById(action)!.addEventListener(
        'click',
        (event) => {
            events.push({ type: action, isTrusted: event.isTrusted, frame: director.getTotalFrames() });
            if (action === 'pause') paused = true;
            else if (action === 'resume') paused = false;
            else if (action === 'reset') {
                time = 0;
                void set(initial);
            } else void release();
        },
        { signal: abort.signal },
    );
Object.assign(window, {
    __laser: {
        ready: true,
        definition,
        snapshot,
        step,
        set,
        setTime(value: number) {
            ensure();
            if (!Number.isFinite(value) || value < 0) throw new Error('LASER_TIME');
            time = value;
            lastAction = { method: 'native-time-api', sequence: lastAction.sequence + 1, input: value };
            if (instance) sync(instance);
        },
        cycles,
        linearProbe,
        release,
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
        setPresentation(value: { background: number[]; linearDiagnostic?: boolean }) {
            ensure();
            if (value.background.length !== 3 || value.background.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
                throw new Error('LASER_BACKGROUND');
            background = [...value.background];
            if (value.linearDiagnostic !== undefined && value.linearDiagnostic !== linearDiagnostic)
                throw new Error('LASER_DIAGNOSTIC_USE_LINEAR_PROBE');
            mainCamera.clearColor = new Color(...background, 255);
            if (instance) sync(instance);
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
    label: 'shader-laser-card',
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
        { name: 'laser-mesh', ref: item.mesh },
        { name: 'laser-holo-material', ref: item.materials[0] },
        { name: 'laser-emboss-material', ref: item.materials[1] },
        { name: 'laser-sparkle-material', ref: item.materials[2] },
        { name: 'laser-holo-effect', ref: item.effects[0] },
        { name: 'laser-emboss-effect', ref: item.effects[1] },
        { name: 'laser-sparkle-effect', ref: item.effects[2] },
    ],
    stepClock: clock
        ? async () => {
              await clock!.step(1 / 60);
          }
        : undefined,
});
