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
import { effectDefinition } from './effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';
import { validate, decodeColor, type Definition, type FilmNeonParams } from './parameters.js';
const definition: Definition = await (await fetch('../shader-film-neon/parameters.json')).json();
const initial = Object.fromEntries(
    Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]),
) as unknown as FilmNeonParams;
const query = new URLSearchParams(location.search),
    test = query.get('test') === '1';
if (test) document.documentElement.classList.add('test');
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 }),
    scene = new Scene('W4-C02-film-neon');
const device = director.root!.device,
    gl = canvas.getContext('webgl2')!;
const cameraNode = new Node('native-camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 3);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 1;
camera.near = 0.1;
camera.far = 10;
camera.visibility = 1 << 20;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(8, 9, 12, 255);
let params = { ...initial },
    time = 0,
    paused = false,
    released = false,
    ownerID = 0,
    updates = 0,
    linearDiagnostic = false;
let background = [8, 9, 12];
type Instance = {
    id: number;
    node: Node;
    renderer: MeshRenderer;
    mesh: ReturnType<typeof utils.createMesh>;
    material: Material;
    effect: EffectAsset;
    released: boolean;
};
let instance: Instance | null = null;
const abort = new AbortController(),
    events: { type: string; isTrusted: boolean; frame: number }[] = [];
let listenerAdds = 0,
    listenerRemoves = 0,
    manualSteps = 0;
let lastAction: any = { method: 'native-scene-create', sequence: 0 };
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
const memory = () => ({ bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize });
function createInstance(): Instance {
    const effect = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(effectDefinition)));
    effect.addRef();
    effect.onLoaded();
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
    const material = new Material();
    material.initialize({
        effectAsset: effect,
        defines: { SHAPE_BOX: params.shape === 'rounded-box' },
        states: {
            rasterizerState: { cullMode: gfx.CullMode.NONE },
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: {
                targets: [
                    {
                        blend: !linearDiagnostic,
                        blendSrc: gfx.BlendFactor.SRC_ALPHA,
                        blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                        blendSrcAlpha: gfx.BlendFactor.ONE,
                        blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    },
                ],
            },
        },
    });
    material.addRef();
    const node = new Node(`owned-film-neon-${++ownerID}`);
    node.layer = 1 << 20;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    const result = { id: ownerID, node, renderer, mesh, material, effect, released: false };
    sync(result);
    return result;
}
function sync(target: Instance): void {
    const tube = decodeColor(params.tubeColor),
        secondary = decodeColor(params.secondaryColor),
        glow = decodeColor(params.glowColor);
    target.material.setProperty(
        'c0',
        new Vec4(params.rimWidth, params.edgeSoftness, params.thickness, params.dispersion),
    );
    target.material.setProperty('c1', new Vec4(params.saturation, params.phase, params.opacity, params.lightAngle));
    target.material.setProperty(
        'c2',
        new Vec4(params.secondaryBlend, params.tubeThickness, params.intensity, params.hotCoreIntensity),
    );
    target.material.setProperty(
        'c3',
        new Vec4(params.glowIntensity, params.glowRadius, params.specularIntensity, params.specularSize),
    );
    target.material.setProperty(
        'c4',
        new Vec4(params.cornerSmoothing, canvas.width, canvas.height, linearDiagnostic ? 1 : 0),
    );
    // c5 = (filmEnabled, neonEnabled, simulationTime, unused) — c5.z carries the absolute
    // simulation time the film's theta consumes (c1.w + c5.z·2π).
    target.material.setProperty(
        'c5',
        new Vec4(params.filmEnabled === 'on' ? 1 : 0, params.neonEnabled === 'on' ? 1 : 0, time, 0),
    );
    target.material.setProperty('tubeColor', new Vec4(...tube, 0));
    target.material.setProperty('secondaryColor', new Vec4(...secondary, 0));
    target.material.setProperty('glowColor', new Vec4(...glow, 0));
    for (const pass of target.material.passes) pass.update();
    updates++;
}
function retire(target: Instance) {
    if (target.released) return { id: target.id, idempotent: true, refs: [] };
    target.released = true;
    target.renderer.mesh = null;
    target.renderer.setSharedMaterial(null, 0);
    target.node.removeFromParent();
    target.node.destroy();
    EffectAsset.remove(target.effect);
    const refs = [
        ['mesh', target.mesh],
        ['material', target.material],
        ['effect', target.effect],
    ] as const;
    return {
        id: target.id,
        idempotent: false,
        rendererUnbound: target.renderer.mesh === null && target.renderer.getSharedMaterial(0) === null,
        nodeRemoved: target.node.parent === null,
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
    if (released) throw Object.assign(new Error('Film+Neon released'), { code: 'FILMNEON_DISPOSED' });
}
function update(dt: number) {
    const started = performance.now();
    if (!paused && instance && !released) {
        time += dt;
        sync(instance);
    }
    if (perf.active) perf.updateCalls.push({ frame: director.getTotalFrames(), ms: performance.now() - started });
}
class FilmNeonUpdater extends Component {
    update(dt: number) {
        update(dt);
    }
}
const updater = cameraNode.addComponent(FilmNeonUpdater);
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
    })).filter((p, index, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === index);
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
        cameraTargetTextureNull: camera.targetTexture === null,
        cameraProjection: camera.projection,
        orthoHeight: camera.orthoHeight,
        drawCalls: device.numDrawCalls,
        glError: gl.getError(),
        background: [...background],
    };
}
director.on(Director.EVENT_AFTER_DRAW, afterDraw);
listenerAdds++;
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
                array.push({ frame: director.getTotalFrames(), operation: key, ms: performance.now() - t });
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
            passes: 'single-pass composition: both layers in one fragment shader',
        },
    };
}
function snapshot() {
    return {
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        seed: 0,
        seedMethod: 'deterministic model; no RNG',
        simulationStep: clock?.stepped ?? manualSteps,
        input: { ...lastAction },
        params: { ...params },
        time,
        paused,
        released,
        background: [...background],
        linearDiagnostic,
        layers: {
            filmEnabled: params.filmEnabled,
            neonEnabled: params.neonEnabled,
        },
        frame: director.getTotalFrames(),
        updates,
        instance: instance?.id,
        shaderPasses:
            instance?.material.passes.map((p) => ({
                program: p.program,
                shaderCompiled: !!p.getShaderVariant(),
            })) ?? [],
        canvas: {
            width: canvas.width,
            height: canvas.height,
            css: { width: canvas.clientWidth, height: canvas.clientHeight },
        },
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
        const refsBefore = [item.mesh.refCount, item.material.refCount, item.effect.refCount];
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
            nodeValid: item.node.isValid,
            assetsValid: [item.mesh.isValid, item.material.isValid, item.effect.isValid],
            registryPresent: EffectAsset.get('air-w4-c02-film-neon') === item.effect,
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
    const before = memory();
    const target = createAirRenderTarget({
        name: 'W4-C02-linear-straight-film-neon',
        width: canvas.width,
        height: canvas.height,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        filter: 'nearest',
    });
    const previous = camera.targetTexture,
        clear = camera.clearColor.clone();
    const detach = target.attachCamera(camera);
    linearDiagnostic = true;
    camera.clearColor = new Color(0, 0, 0, 0);
    if (instance) {
        retire(instance);
        instance = createInstance();
    }
    await step(0);
    target.resolve();
    const captured = snapshot(),
        capturedFrame = director.getTotalFrames() - 1;
    const pixels = samplePoints().map((p) => ({
        ...p,
        rgba: Array.from(target.readColor({ x: p.x, y: p.y, width: 1, height: 1 })),
    }));
    const info = target.info;
    detach();
    const detached = camera.targetTexture === previous;
    target.dispose();
    linearDiagnostic = false;
    camera.clearColor = clear;
    if (instance) {
        retire(instance);
        instance = createInstance();
    }
    await step(0);
    await step(0);
    return {
        ...captured,
        frame: capturedFrame + 1,
        pixels,
        gpuReceipt: {
            frame: capturedFrame,
            time,
            canvas: { width: info.width, height: info.height },
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
    } else if (key === 'tubeColor' || key === 'secondaryColor' || key === 'glowColor') {
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
                key === 'tubeColor' || key === 'secondaryColor' || key === 'glowColor' || d.enum
                    ? control.value
                    : Number(control.value);
            void set({ ...params, [key]: value });
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
            if (action === 'pause') {
                paused = true;
            } else if (action === 'resume') {
                paused = false;
            } else if (action === 'reset') {
                time = 0;
                void set(initial);
            } else void release();
        },
        { signal: abort.signal },
    );
Object.assign(window, {
    __filmneon: {
        ready: true,
        definition,
        snapshot,
        step,
        set,
        setTime(value: number) {
            ensure();
            if (!Number.isFinite(value) || value < 0) throw new Error('FILMNEON_TIME');
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
        setPresentation(value: { background: number[]; linearDiagnostic: boolean }) {
            ensure();
            if (value.background.length !== 3 || value.background.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
                throw new Error('FILMNEON_BACKGROUND');
            background = [...value.background];
            const changed = linearDiagnostic !== value.linearDiagnostic;
            linearDiagnostic = value.linearDiagnostic;
            camera.clearColor = new Color(...background, 255);
            if (changed && instance) {
                retire(instance);
                instance = createInstance();
            } else if (instance) sync(instance);
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

// Gallery lifecycle: bridge instance-level create/retire into __lifecycle/__lifecycleHold.
installShaderLifecycle({
    label: 'shader-film-neon',
    isDisposed: () => released,
    getInstance: () => instance,
    createInstance: () => {
        ensure(); // terminal guard: throws FILMNEON_DISPOSED after release
        instance = createInstance();
        return instance;
    },
    retireInstance: (target) => {
        const trace = retire(target);
        if (instance === target) instance = null; // clear pointer only if it matches
        return trace;
    },
    ownedAssets: (item) => [
        { name: 'film-neon-mesh', ref: item.mesh },
        { name: 'film-neon-material', ref: item.material },
        { name: 'film-neon-effect', ref: item.effect },
    ],
    stepClock: clock
        ? async () => {
              await clock!.step(1 / 60);
          }
        : undefined,
});
