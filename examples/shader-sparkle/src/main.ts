import {
    Component,
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
    gfx,
    game,
    director,
    Director,
} from 'cocosair';
import { effectDefinition, expandedEffectDefinition } from './effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';
import { defaults, validate, type SparkleParams, type Definition } from './parameters.js';
const definition: Definition = await (await fetch('../shader-sparkle/parameters.json')).json();
const query = new URLSearchParams(location.search),
    test = query.get('test') === '1';
if (test) document.documentElement.classList.add('test');
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 }),
    scene = new Scene('E06-native-sparkle');
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
camera.clearColor = new Color(0, 0, 0, 255);
const templates = [effectDefinition, expandedEffectDefinition].map((value) => {
    const asset = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(value)));
    asset.addRef();
    asset.onLoaded();
    return asset;
});
let params = { ...defaults },
    time = 0,
    paused = false,
    released = false,
    ownerID = 0,
    updates = 0,
    rebuilds = 0,
    inputKind = 'bright-region',
    diagnostic = false,
    background = [0, 0, 0];
type Owned = ReturnType<typeof utils.createMesh> | Material | Texture2D;
type Instance = {
    id: number;
    node: Node;
    renderer: MeshRenderer;
    mesh: ReturnType<typeof utils.createMesh>;
    material: Material;
    texture: Texture2D;
    tick: (dt: number) => void;
    driver: SparkleDriver;
    released: boolean;
};
class SparkleDriver extends Component {
    run: ((dt: number) => void) | null = null;
    update(dt: number) {
        this.run?.(dt);
    }
}
let instance: Instance | null = null;
const live = new Set<Instance>();
const abort = new AbortController(),
    events: { type: string; isTrusted: boolean; frame: number }[] = [];
let listenerAdds = 0,
    listenerRemoves = 0;
const memory = () => ({ bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize });
function inputPixel(kind: string, x: number, y: number): number[] {
    if (kind === 'alpha-zero') return [255, 255, 255, 0];
    if (kind === 'half-alpha') return [255, 255, 255, 128];
    if (kind === 'white') return [255, 255, 255, 255];
    if (kind === 'dark') return [0, 0, 0, 255];
    if (kind.startsWith('gray-')) {
        const n = Number(kind.slice(5));
        return [n, n, n, 255];
    }
    if (kind === 'bright-region') {
        const d = Math.hypot((x + 0.5) / 128 - 0.5, (y + 0.5) / 128 - 0.5);
        return d < 0.17 ? [230, 200, 130, 255] : [0, 0, 0, 0];
    }
    return [Math.round((x / 127) * 255), Math.round((y / 127) * 255), 128, 255];
}
function upload(texture: Texture2D) {
    const data = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++) data.set(inputPixel(inputKind, x, y), (y * 128 + x) * 4);
    texture.uploadData(data);
}
function sync(target: Instance): void {
    target.material.setProperty('sparkle0', new Vec4(params.size, params.intensity, params.threshold, params.expand));
    target.material.setProperty('sparkle1', new Vec4(params.rayLength, params.colorize, params.speed, params.seed));
    target.material.setProperty(
        'sparkle2',
        new Vec4(canvas.clientWidth, canvas.clientHeight, time, diagnostic ? 1 : 0),
    );
    target.material.setProperty('sourceTexture', target.texture);
    for (const pass of target.material.passes) pass.update();
    updates++;
}
const perf = {
    active: false,
    frames: [] as any[],
    updateCalls: [] as any[],
    commands: [] as any[],
    draws: [] as any[],
    queue: [] as any[],
    queries: [] as { query: WebGLQuery; frame: number }[],
    gpu: [] as { frame: number; ms: number; disjoint: boolean }[],
    queryTerminal: [] as any[],
    restorers: [] as (() => void)[],
    last: 0,
    begin: 0,
    currentQuery: null as WebGLQuery | null,
    extension: null as any,
};
function createInstance(): Instance {
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
    const texture = new Texture2D();
    texture.reset({ width: 128, height: 128, format: Texture2D.PixelFormat.RGBA8888 });
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.addRef();
    upload(texture);
    const material = new Material();
    material.initialize({
        effectAsset: templates[params.expand > 0 ? 1 : 0],
        states: {
            rasterizerState: { cullMode: 0 },
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: {
                targets: [
                    {
                        blend: true,
                        blendSrc: gfx.BlendFactor.ONE,
                        blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                        blendSrcAlpha: gfx.BlendFactor.ONE,
                        blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    },
                ],
            },
        },
    });
    material.addRef();
    const node = new Node(`owned-sparkle-${++ownerID}`);
    node.layer = 1 << 20;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    const item: Instance = {
        id: ownerID,
        node,
        renderer,
        mesh,
        material,
        texture,
        released: false,
        driver: node.addComponent(SparkleDriver),
        tick: (dt: number) => {
            const started = performance.now();
            if (!released) {
                if (!paused) time += dt * params.speed;
                sync(item);
            }
            if (perf.active)
                perf.updateCalls.push({ frame: director.getTotalFrames(), ms: performance.now() - started });
        },
    };
    item.driver.run = item.tick;
    live.add(item);
    sync(item);
    return item;
}
function retire(target: Instance) {
    if (target.released) return { id: target.id, idempotent: true, refs: [] };
    target.released = true;
    target.driver.run = null;
    target.driver.enabled = false;
    live.delete(target);
    target.renderer.mesh = null;
    target.renderer.setSharedMaterial(null, 0);
    target.node.removeFromParent();
    target.node.destroy();
    const refs: [string, Owned][] = [
        ['mesh', target.mesh],
        ['material', target.material],
        ['texture', target.texture],
    ];
    return {
        id: target.id,
        idempotent: false,
        rendererUnbound: target.renderer.mesh === null && target.renderer.getSharedMaterial(0) === null,
        nodeRemoved: target.node.parent === null,
        refs: refs.map(([kind, a]) => {
            const before = a.refCount;
            a.decRef();
            if (a.isValid) a.destroy();
            return { kind, before, after: a.refCount, id: a.uuid, validAfter: a.isValid };
        }),
    };
}
function ensure() {
    if (released) throw Object.assign(new Error('Sparkle released'), { code: 'SPARKLE_DISPOSED' });
}
const initialBefore = { memory: memory(), counters: counters() };
instance = createInstance();
const initialAfter = { memory: memory(), counters: counters(), id: instance.id };
app.run(scene);
let clock: ReturnType<typeof createStepClock> | null = null;
if (test) {
    game.pause();
    clock = createStepClock();
    clock.begin();
    await clock.step(0);
}
let gpuPixels: { x: number; y: number; rgba: number[] }[] = [];
let capturePoints: { x: number; y: number }[] = [{ x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) }];
function afterDraw() {
    if (perf.active || diagnostic) return;
    gpuPixels = capturePoints.map((p) => {
        const bytes = new Uint8Array(4);
        gl.readPixels(p.x, p.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        return { ...p, rgba: Array.from(bytes) };
    });
}
director.on(Director.EVENT_AFTER_DRAW, afterDraw);
listenerAdds++;
function startPerformance() {
    ensure();
    if (clock) {
        clock.end();
        clock = null;
    }
    paused = false;
    perf.active = true;
    perf.last = 0;
    perf.frames = [];
    perf.updateCalls = [];
    perf.commands = [];
    perf.draws = [];
    perf.queue = [];
    perf.gpu = [];
    perf.queryTerminal = [];
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
    for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'])
        wrap(gl, key, perf.draws);
    wrap(device.queue, 'submit', perf.queue);
    director.on(Director.EVENT_BEFORE_DRAW, perfBefore);
    director.on(Director.EVENT_AFTER_DRAW, perfAfter);
    listenerAdds += 2;
    game.resume();
}
function perfBefore() {
    perf.begin = performance.now();
    if (perf.extension && !perf.currentQuery) {
        const q = gl.createQuery();
        if (q) {
            perf.currentQuery = q;
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
        perf.queries.push({ query: perf.currentQuery, frame: director.getTotalFrames() });
        perf.currentQuery = null;
    }
    for (let i = perf.queries.length - 1; i >= 0; i--) {
        const q = perf.queries[i];
        if (gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) {
            const disjoint = !!gl.getParameter(perf.extension.GPU_DISJOINT_EXT),
                ms = gl.getQueryParameter(q.query, gl.QUERY_RESULT) / 1e6;
            perf.gpu.push({ frame: q.frame, ms, disjoint });
            const aliveBefore = gl.isQuery(q.query);
            gl.deleteQuery(q.query);
            perf.queryTerminal.push({
                frame: q.frame,
                status: disjoint ? 'disjoint' : 'resolved',
                aliveBefore,
                deleted: !gl.isQuery(q.query),
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
    const deadline = performance.now() + 10000;
    while (perf.queries.length && performance.now() < deadline) {
        for (let i = perf.queries.length - 1; i >= 0; i--) {
            const q = perf.queries[i];
            if (gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) {
                const disjoint = !!gl.getParameter(perf.extension.GPU_DISJOINT_EXT),
                    ms = gl.getQueryParameter(q.query, gl.QUERY_RESULT) / 1e6;
                perf.gpu.push({ frame: q.frame, ms, disjoint });
                const aliveBefore = gl.isQuery(q.query);
                gl.deleteQuery(q.query);
                perf.queryTerminal.push({
                    frame: q.frame,
                    status: disjoint ? 'disjoint' : 'resolved',
                    aliveBefore,
                    deleted: !gl.isQuery(q.query),
                });
                perf.queries.splice(i, 1);
            }
        }
        if (perf.queries.length) await new Promise((r) => setTimeout(r, 25));
    }
    for (const q of perf.queries.splice(0)) {
        const aliveBefore = gl.isQuery(q.query);
        gl.deleteQuery(q.query);
        perf.queryTerminal.push({ frame: q.frame, status: 'timeout', aliveBefore, deleted: !gl.isQuery(q.query) });
    }
    return {
        frames: perf.frames,
        updateCalls: perf.updateCalls,
        commands: perf.commands,
        draws: perf.draws,
        queueBookkeeping: perf.queue,
        gpuSamples: perf.gpu,
        queryTerminal: perf.queryTerminal,
        timerAvailable: !!perf.extension,
        device: { renderer: device.renderer, vendor: device.vendor },
        viewport: {
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
            backing: { width: canvas.width, height: canvas.height },
        },
        memory: memory(),
        methods: {
            commands: 'CPU native gfx command method envelope; includes immediate GL dispatch, not pure encoding',
            draws: 'CPU original GL draw dispatch only, same native context; not GPU completion',
            queue: 'Queue.submit statistics bookkeeping; not GPU submission',
            frames: 'native AFTER_DRAW callback interval; not compositor present',
            gpu: 'TOOL_DIAGNOSTIC same-context native draw TIME_ELAPSED_EXT',
        },
    };
}
function bufferCount(x: Instance) {
    return (
        x.mesh.renderingSubMeshes.reduce((v, s) => v + s.vertexBuffers.length + (s.indexBuffer ? 1 : 0), 0) +
        x.material.passes.filter((p) => !!p.descriptorSet.getBuffer(0)).length
    );
}
function counters() {
    return {
        texture: [...live].filter((x) => !!x.texture.getGFXTexture()).length,
        buffer: [...live].reduce((n, x) => n + bufferCount(x), 0),
        material: live.size,
        listener: listenerAdds - listenerRemoves - 1,
        raf: 0,
        gpuResource: [...live].reduce((n, x) => n + 1 + bufferCount(x), 0),
    };
}
function snapshot() {
    return {
        params: { ...params },
        time,
        inputKind,
        paused,
        released,
        frame: director.getTotalFrames(),
        updates,
        rebuilds,
        instance: instance?.id ?? null,
        shaderPasses:
            instance?.material.passes.map((p) => ({ program: p.program, shaderCompiled: !!p.getShaderVariant() })) ??
            [],
        canvas: {
            width: canvas.width,
            height: canvas.height,
            css: { width: canvas.clientWidth, height: canvas.clientHeight },
        },
        pixels: gpuPixels,
        memory: memory(),
        counters: counters(),
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
    return snapshot();
}
async function set(values: unknown) {
    ensure();
    const checked = validate(definition, values);
    if (!checked.ok) return checked;
    const crossed = params.expand > 0 != checked.values!.expand > 0;
    params = { ...checked.values! };
    let retirement: unknown = null;
    if (crossed) {
        if (instance) retirement = retire(instance);
        instance = createInstance();
        rebuilds++;
    } else if (instance) sync(instance);
    return { ok: true, retirement, snapshot: snapshot() };
}
let releasePromise: Promise<unknown> | null = null;
function release() {
    if (releasePromise) return releasePromise;
    released = true;
    paused = true;
    director.off(Director.EVENT_AFTER_DRAW, afterDraw);
    listenerRemoves++;
    abort.abort();
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) b.disabled = true;
    const retirement = instance ? retire(instance) : null;
    instance = null;
    const sharedTemplates = templates.map((effect) => {
        const before = effect.refCount,
            registryMatchesBefore = EffectAsset.get(effect.name) === effect;
        if (registryMatchesBefore) EffectAsset.remove(effect);
        effect.decRef();
        if (effect.isValid) effect.destroy?.();
        return {
            before,
            after: effect.refCount,
            name: effect.name,
            registryMatchesBefore,
            registryRemoved: EffectAsset.get(effect.name) !== effect,
            validAfterClose: effect.isValid,
        };
    });
    releasePromise = Promise.resolve(app.close!()).then((receipt) => {
        sharedTemplates.forEach((row, index) => (row.validAfterClose = templates[index].isValid));
        return {
            retirement,
            sharedTemplates,
            receipt,
            listenerAdds,
            listenerRemoves,
            sceneCleared: app.getScene!() === null,
        };
    });
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
    // Warm borrowed shader/program/PSO caches, then observe a stable owned-resource baseline.
    const warm = createInstance();
    await step(0);
    retire(warm);
    await step(0);
    await step(0);
    for (let index = 0; index < 100; index++) {
        const before = { ...counters() },
            beforeMemory = memory(),
            item = createInstance();
        await step(0);
        const created = { ...counters() },
            createdMemory = memory();
        const trace = retire(item),
            repeat = retire(item);
        await step(0);
        await step(0);
        const after = counters(),
            afterMemory = memory();
        rows.push({
            index,
            id: item.id,
            before,
            created,
            after,
            beforeMemory,
            createdMemory,
            afterMemory,
            trace,
            repeat,
            nodeValid: item.node.isValid,
            assetsValid: [item.mesh.isValid, item.material.isValid, item.texture.isValid],
            allocations: trace.refs.map((r) => ({
                id: `${item.id}-${r.kind}`,
                kind: r.kind === 'mesh' ? 'buffer' : r.kind,
                unit: 'refs',
                baseline: 0,
                allocated: r.before,
                released: r.after,
            })),
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
async function linearRead(points: { x: number; y: number }[]) {
    ensure();
    const diagnosticBefore = memory();
    const target = createAirRenderTarget({
        name: 'sparkle-linear-oracle',
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        scale: canvas.width / canvas.clientWidth,
        colorFormat: 'rgba16f',
        depthFormat: 'none',
        samples: 1,
        filter: 'nearest',
        sampleFallback: 'error',
    });
    const detach = target.attachCamera(camera),
        previous = instance!.material;
    let receipt: any = null;
    const nativeDiagnostic = new Material();
    nativeDiagnostic.initialize({
        effectAsset: templates[params.expand > 0 ? 1 : 0],
        states: {
            rasterizerState: { cullMode: 0 },
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: { targets: [{ blend: false }] },
        },
    });
    nativeDiagnostic.addRef();
    instance!.material = nativeDiagnostic;
    instance!.renderer.setSharedMaterial(nativeDiagnostic, 0);
    try {
        diagnostic = true;
        camera.camera!.clearColor = { x: 0, y: 0, z: 0, w: 0 };
        if (instance) sync(instance);
        await step(0);
        receipt = {
            width: target.info.width,
            height: target.info.height,
            pixels: points.map((p) => ({ ...p, rgba: Array.from(target.readColor({ ...p, width: 1, height: 1 })) })),
            format: target.info.effective.colorFormat,
            diagnosticBefore,
            allocatedMemory: memory(),
            materialRefBefore: nativeDiagnostic.refCount,
        };
        return receipt;
    } finally {
        diagnostic = false;
        detach();
        target.dispose();
        camera.camera!.clearColor = { x: background[0] / 255, y: background[1] / 255, z: background[2] / 255, w: 1 };
        if (instance) {
            instance.material = previous;
            instance.renderer.setSharedMaterial(previous, 0);
            sync(instance);
        }
        nativeDiagnostic.decRef();
        if (nativeDiagnostic.isValid) nativeDiagnostic.destroy();
        await step(0);
        if (receipt)
            receipt.cleanup = {
                materialRefAfter: nativeDiagnostic.refCount,
                targetDisposed: target.info.disposed,
                cameraDetached: camera.targetTexture !== target.renderTexture,
                memoryAfter: memory(),
                cameraTargetRestored: camera.targetTexture === null,
            };
    }
}
async function settleNative() {
    ensure();
    if (clock) {
        clock.end();
        clock = null;
    }
    const before = director.getTotalFrames();
    await new Promise<void>((resolve, reject) => {
        let n = 0;
        const timeout = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, observe);
            listenerRemoves++;
            reject(new Error('Native settle timeout'));
        }, 5000);
        function observe() {
            if (++n >= 3) {
                clearTimeout(timeout);
                director.off(Director.EVENT_AFTER_DRAW, observe);
                listenerRemoves++;
                resolve();
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, observe);
        listenerAdds++;
        game.resume();
    });
    game.pause();
    clock = createStepClock();
    clock.begin();
    await clock.step(0);
    return { before, after: director.getTotalFrames(), snapshot: snapshot() };
}
const controls = document.querySelector<HTMLElement>('#parameters')!;
for (const [key, d] of Object.entries(definition.params)) {
    const label = document.createElement('label');
    label.textContent = key;
    const control = document.createElement('input');
    control.type = 'range';
    control.min = String(d.min);
    control.max = String(d.max);
    control.step = String(d.step);
    control.value = String(d.defaultValue);
    control.dataset.parameter = key;
    control.addEventListener(
        'input',
        (e) => {
            events.push({ type: `parameter:${key}`, isTrusted: e.isTrusted, frame: director.getTotalFrames() });
            void set({ ...params, [key]: Number(control.value) });
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
                void set(defaults);
            } else void release();
        },
        { signal: abort.signal },
    );
Object.assign(window, {
    __sparkle: {
        ready: true,
        definition,
        creationTrace: { before: initialBefore, after: initialAfter },
        snapshot,
        step,
        set,
        setTime(value: number) {
            ensure();
            if (!Number.isFinite(value) || value < 0)
                throw Object.assign(new Error('Invalid time'), { code: 'SPARKLE_TIME' });
            time = value;
            if (instance) sync(instance);
        },
        setInput(value: string) {
            ensure();
            inputKind = value;
            if (instance) {
                upload(instance.texture);
                sync(instance);
            }
        },
        setPoints(value: { x: number; y: number }[]) {
            capturePoints = value;
        },
        setBackground(value: number[]) {
            background = [...value];
            camera.camera!.clearColor = { x: value[0] / 255, y: value[1] / 255, z: value[2] / 255, w: 1 };
        },
        linearRead,
        settleNative,
        cycles,
        release,
        startPerformance,
        performanceProgress() {
            return perf.frames.length;
        },
        stopPerformance,
        destroyInstance: async () => {
            ensure();
            const trace = instance ? retire(instance) : null;
            instance = null;
            await step(0);
            return { trace, snapshot: snapshot() };
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
        resumePacer() {
            ensure();
            if (clock) {
                clock.end();
                clock = null;
            }
            paused = true;
            game.resume();
        },
        resume() {
            paused = false;
        },
        releaseIdentity() {
            return Object.is(release(), release());
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
    label: 'shader-sparkle',
    isDisposed: () => released,
    getInstance: () => instance,
    createInstance: () => {
        ensure(); // terminal guard: throws SPARKLE_DISPOSED after release
        instance = createInstance();
        return instance;
    },
    retireInstance: (target) => {
        const trace = retire(target);
        if (instance === target) instance = null;
        return trace;
    },
    ownedAssets: (item) => [
        { name: 'sparkle-mesh', ref: item.mesh },
        { name: 'sparkle-material', ref: item.material },
        { name: 'sparkle-texture', ref: item.texture },
    ],
    stepClock: clock
        ? async () => {
              await clock!.step(1 / 60);
          }
        : undefined,
});
