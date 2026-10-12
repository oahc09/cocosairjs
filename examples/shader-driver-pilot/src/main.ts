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
    director,
    Director,
    game,
    gfx,
    Component,
} from 'cocosair';
import { effectDefinition as holoEffectDefinition } from '../../shader-holographic/src/effect.generated.js';
import { effectDefinition as neonEffectDefinition } from '../../shader-neon/src/effect.generated.js';
import { installShaderLifecycle } from '../../shared/shader-lifecycle.js';
import { createDriverState, driverFrame, type DriverParam, type DriverOutput } from './driver.js';
import { consume, uniformValues, validateConsumerBindings, defaultBindings, type Consumer } from './consumer.js';
import { makePerformance } from './performance.generated.js';

const query = new URLSearchParams(location.search);
const selected = query.get('consumer') ?? 'holographic';
if (selected !== 'holographic' && selected !== 'neon') throw new Error('DRIVER_UNKNOWN_CONSUMER');
const selectedConsumer: Consumer = selected;
const testMode = query.has('test');
if (testMode) document.documentElement.classList.add('test');
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas });
const device = director.root!.device;
const gl = canvas.getContext('webgl2')!;
const scene = new Scene('Driver-Pilot');
const LAYER = 1 << 20;
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 3);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 1;
camera.near = 0.1;
camera.far = 10;
camera.visibility = LAYER;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(8, 9, 12, 255);

type Instance = {
    id: number;
    node: Node;
    renderer: MeshRenderer;
    mesh: ReturnType<typeof utils.createMesh>;
    material: Material;
    effect: EffectAsset;
};
let current: Instance | null = null;
let instanceCounter = 0;
const DEFAULT_BINDINGS: DriverParam[] =
    selectedConsumer === 'holographic'
        ? [
              {
                  target: 'holographic.rotation',
                  binding: { source: 'pointer', axis: 'x', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 360 },
                  defaultValue: 0,
              },
          ]
        : [
              {
                  target: 'neon.rotation',
                  binding: { source: 'pointer', axis: 'x', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 360 },
                  defaultValue: 0,
              },
          ];
let bindings: DriverParam[] = structuredClone(DEFAULT_BINDINGS);
let state = createDriverState();
let outputs: DriverOutput = {};
let pointer = { x: 0.5, y: 0.5 };
let pointerSequence = 0;
let updates = 0;
let released = false;
let diagnostic = false;
let resetReceipt: any = null;
let clock: ReturnType<typeof createStepClock> | null = null;
const pointerLog: any[] = [];
const frameLedger: any[] = [];
const events: any[] = [];
const abort = new AbortController();
let listenerAdds = 0,
    listenerRemoves = 0;
const listenerLedger: string[] = [];
const retired = new WeakMap<Instance, any>();
function ensure() {
    if (released) throw new Error('DRIVER_DISPOSED');
}
function memory() {
    return { bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize };
}
function makeMaterial(effect: EffectAsset, blend = true) {
    const material = new Material();
    material.initialize({
        effectAsset: effect,
        defines: { SHAPE_BOX: false },
        states: {
            rasterizerState: { cullMode: gfx.CullMode.NONE },
            depthStencilState: { depthTest: false, depthWrite: false },
            blendState: {
                targets: [
                    {
                        blend,
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
    return material;
}
function sync(target: Instance, material = target.material, linear = false) {
    const used = consume(selectedConsumer, outputs);
    const values = uniformValues(selectedConsumer, used.params, state.time, canvas.width, canvas.height, linear);
    for (const [key, value] of Object.entries(values))
        material.setProperty(key, new Vec4(...(value as [number, number, number, number])));
    for (const pass of material.passes) pass.update();
    target.node.setScale(canvas.width / canvas.height, 1, 1);
    target.node.setPosition(used.position.x, used.position.y, 0);
}
function readUniforms(target: Instance) {
    const used = consume(selectedConsumer, outputs);
    return Object.fromEntries(
        Object.keys(uniformValues(selectedConsumer, used.params, state.time, canvas.width, canvas.height, false)).map(
            (key) => {
                const v = target.material.getProperty(key) as Vec4;
                return [key, [v.x, v.y, v.z, v.w]];
            },
        ),
    );
}
function createInstance(): Instance {
    ensure();
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
    const effect = Object.assign(
        new EffectAsset(),
        JSON.parse(JSON.stringify(selectedConsumer === 'holographic' ? holoEffectDefinition : neonEffectDefinition)),
    );
    // Both mother GLSL vertex variants use full-screen clip-space coordinates. This Pilot consumes node
    // position, so adapt only the vertex transform; the complete mother fragment is kept.
    effect.name = 'driver-' + selectedConsumer;
    for (const shader of effect.shaders) {
        shader.name = 'driver-' + shader.name;
        shader.hash += 100000;
        for (const source of [shader.glsl3, shader.glsl4])
            source.vert = source.vert.replace(
                'gl_Position = vec4(a_position.xy, 0.0, 1.0);',
                'gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);',
            );
    }
    for (const technique of effect.techniques)
        for (const pass of technique.passes) pass.program = 'driver-' + pass.program;
    effect.addRef();
    effect.onLoaded();
    const material = makeMaterial(effect);
    const node = new Node('driver-' + ++instanceCounter);
    node.layer = LAYER;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    const value = { id: instanceCounter, node, renderer, mesh, material, effect };
    sync(value);
    return value;
}
function retireInstance(value: Instance) {
    if (retired.has(value)) return { ...retired.get(value), idempotent: true };
    value.renderer.mesh = null;
    value.renderer.setSharedMaterial(null, 0);
    const renderersUnbound = value.renderer.mesh === null && value.renderer.getSharedMaterial(0) === null;
    value.node.removeFromParent();
    value.node.destroy();
    EffectAsset.remove(value.effect);
    const refs = [
        ['mesh', value.mesh],
        ['material', value.material],
        ['effect', value.effect],
    ].map(([kind, ref]) => {
        const asset = ref as typeof value.effect;
        const before = asset.refCount;
        asset.decRef();
        const after = asset.refCount;
        if (after === 0) asset.destroy();
        return { kind, before, after };
    });
    if (current === value) current = null;
    const trace = {
        id: value.id,
        refs,
        renderersUnbound,
        nodesRemoved: value.node.parent === null,
        registryRemoved: EffectAsset.get(value.effect.name) == null,
        idempotent: false,
    };
    retired.set(value, trace);
    return trace;
}
function snapshot() {
    return {
        selectedConsumer,
        currentInstance: current?.id ?? null,
        frame: director.getTotalFrames(),
        time: state.time,
        driver: { ...state, pointer: { ...state.pointer } },
        bindings: structuredClone(bindings),
        outputs: structuredClone(outputs),
        motherParams: consume(selectedConsumer, outputs).params,
        nodePosition: current ? { x: current.node.position.x, y: current.node.position.y } : null,
        uniformReadback: current ? readUniforms(current) : null,
        updates,
        released,
        diagnostic,
        pointerLog: structuredClone(pointerLog),
        frameLedger: structuredClone(frameLedger),
        events: structuredClone(events),
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        canvas: {
            width: canvas.width,
            height: canvas.height,
            css: { width: canvas.clientWidth, height: canvas.clientHeight },
        },
        oneCanvas: document.querySelectorAll('canvas').length,
        shaders: current?.material.passes.map((p) => ({ compiled: !!p.getShaderVariant(), program: p.program })) ?? [],
        memory: memory(),
        background: [8, 9, 12],
        listeners: { adds: listenerAdds, removes: listenerRemoves, ledger: [...listenerLedger] },
        resetReceipt,
    };
}
const perf = makePerformance({
    director,
    Director,
    game,
    gl,
    device,
    canvas,
    memory,
    snapshot,
    ensure,
    listeners(add: number, remove: number) {
        listenerAdds += add;
        listenerRemoves += remove;
    },
    prepare() {
        if (clock) {
            clock.end();
            clock = null;
        }
        state.paused = false;
    },
});
function update(dt: number) {
    if (released || diagnostic || !current) return;
    const begin = performance.now();
    if (!state.paused) {
        const before = state.time;
        outputs = driverFrame(state, { pointer: { ...pointer }, deltaTime: dt }, bindings);
        sync(current);
        updates++;
        if (dt > 0)
            frameLedger.push({
                frame: director.getTotalFrames(),
                dt,
                pointer: { ...pointer },
                eventSequence: pointerSequence,
                generation: state.generation,
                backing: { width: canvas.width, height: canvas.height },
                timeBefore: before,
                timeAfter: state.time,
                outputs: structuredClone(outputs),
                materialUniforms: readUniforms(current),
                nodePosition: { x: current.node.position.x, y: current.node.position.y },
            });
    } else sync(current);
    perf.recordUpdate(performance.now() - begin);
}
class DriverUpdater extends Component {
    update(dt: number) {
        update(dt);
    }
}
const updater = cameraNode.addComponent(DriverUpdater);
current = createInstance();
app.run(scene);
if (testMode) {
    game.pause();
    clock = createStepClock();
    clock.begin();
    await clock.step(0);
}
async function step(dt = 0) {
    ensure();
    if (!Number.isFinite(dt) || dt < 0) throw new Error('DRIVER_DT');
    if (!clock) {
        game.pause();
        clock = createStepClock();
        clock.begin();
    }
    await clock.step(dt);
    return snapshot();
}
function resetSession() {
    ensure();
    state = createDriverState(state.generation + 1);
    outputs = {};
    pointer = { x: 0.5, y: 0.5 };
    bindings = defaultBindings(selectedConsumer);
    pointerSequence = 0;
    updates = 0;
    pointerLog.length = 0;
    frameLedger.length = 0;
    resetReceipt = {
        time: 0,
        generation: state.generation,
        bindings: structuredClone(bindings),
        frame: director.getTotalFrames(),
    };
    if (current) sync(current);
    return snapshot();
}
function setBindings(input: unknown) {
    ensure();
    const checked = validateConsumerBindings(selectedConsumer, input);
    if (!checked.ok) return checked;
    bindings = checked.values;
    outputs = driverFrame(state, { pointer: { ...pointer }, deltaTime: 0 }, bindings);
    if (current) sync(current);
    return { ok: true, values: structuredClone(bindings), snapshot: snapshot() };
}
function listen(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler, { signal: abort.signal });
    listenerAdds++;
    listenerLedger.push(type);
}
for (const type of ['pointermove', 'pointerdown', 'pointerup'])
    listen(canvas, type, (event) => {
        const e = event as PointerEvent;
        if (released || !e.isPrimary) return;
        const rect = canvas.getBoundingClientRect();
        const uv = { x: (e.clientX - rect.left) / rect.width, y: 1 - (e.clientY - rect.top) / rect.height };
        pointerLog.push({
            type,
            isTrusted: e.isTrusted,
            isPrimary: e.isPrimary,
            pointerId: e.pointerId,
            timeStamp: e.timeStamp,
            clientX: e.clientX,
            clientY: e.clientY,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            uv,
            sequence: ++pointerSequence,
            generation: state.generation,
            frame: director.getTotalFrames(),
        });
        pointer = uv;
    });
let releasePromise: Promise<any> | null = null;
function release() {
    if (releasePromise) return releasePromise;
    if (perf.isActive()) throw new Error('DRIVER_PERF_ACTIVE');
    released = true;
    state.released = true;
    abort.abort();
    listenerRemoves += listenerLedger.length;
    updater.enabled = false;
    for (const b of document.querySelectorAll<HTMLButtonElement>('button')) b.disabled = true;
    const retirement = current ? retireInstance(current) : null;
    const countBeforeDispatch = pointerLog.length;
    canvas.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, clientX: 1, clientY: 1 }));
    const silent = pointerLog.length === countBeforeDispatch;
    releasePromise = Promise.resolve(app.close!()).then(() => ({
        retirement,
        sceneCleared: app.getScene() === null,
        listeners: { adds: listenerAdds, removes: listenerRemoves },
        postReleaseDispatchSilent: silent,
        controlsDisabled: [...document.querySelectorAll<HTMLButtonElement>('button')].every((b) => b.disabled),
    }));
    return releasePromise;
}
for (const action of ['pause', 'resume', 'reset', 'release'])
    listen(document.getElementById(action)!, 'click', (e) => {
        if (released) return;
        events.push({
            type: action,
            isTrusted: e.isTrusted,
            timeStamp: e.timeStamp,
            frame: director.getTotalFrames(),
            sequence: events.length + 1,
        });
        if (action === 'pause') state.paused = true;
        else if (action === 'resume') state.paused = false;
        else if (action === 'reset') resetSession();
        else void release();
    });
async function cycles() {
    ensure();
    if (current) retireInstance(current);
    await step();
    await step();
    const warm = createInstance();
    current = warm;
    await step();
    retireInstance(warm);
    await step();
    await step();
    const baseline = memory(),
        rows: any[] = [];
    for (let index = 0; index < 100; index++) {
        const before = memory();
        const item = createInstance();
        current = item;
        await step();
        const created = memory();
        const trace = retireInstance(item),
            repeat = retireInstance(item);
        await step();
        await step();
        rows.push({
            index,
            id: item.id,
            before,
            created,
            after: memory(),
            trace,
            repeat,
            assetsValid: [item.mesh.isValid, item.material.isValid, item.effect.isValid],
            nodeValid: item.node.isValid,
        });
    }
    current = createInstance();
    await step();
    return { baseline, rows, snapshot: snapshot() };
}
async function linearProbe(points: { x: number; y: number }[]) {
    ensure();
    if (!current) throw new Error('DRIVER_NO_INSTANCE');
    const value = current,
        before = { time: state.time, count: frameLedger.length, updates, outputs: JSON.stringify(outputs) };
    const saved = { paused: state.paused, clear: camera.clearColor.clone(), target: camera.targetTexture };
    const target = createAirRenderTarget({
        width: canvas.width,
        height: canvas.height,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        filter: 'nearest',
    });
    const detach = target.attachCamera(camera),
        temp = makeMaterial(value.effect, false);
    let pixels: any[] = [],
        captured: any,
        tempRefs: any;
    try {
        state.paused = true;
        diagnostic = true;
        sync(value, temp, true);
        value.renderer.setSharedMaterial(temp, 0);
        camera.clearColor = new Color(0, 0, 0, 0);
        await step();
        target.resolve();
        captured = snapshot();
        pixels = points.map((p) => ({ ...p, rgba: Array.from(target.readColor({ ...p, width: 1, height: 1 })) }));
    } finally {
        value.renderer.setSharedMaterial(value.material, 0);
        detach();
        target.dispose();
        const refsBefore = temp.refCount;
        temp.decRef();
        tempRefs = { before: refsBefore, after: temp.refCount };
        if (temp.refCount === 0) temp.destroy();
        state.paused = saved.paused;
        diagnostic = false;
        camera.clearColor = saved.clear;
        sync(value);
        await step();
    }
    return {
        state: captured,
        pixels,
        gpuReceipt: {
            frame: captured.frame - 1,
            time: captured.time,
            canvas: captured.canvas,
            targetRGBA8: true,
            transparentClear: true,
            detached: camera.targetTexture === saved.target,
            disposed: target.info.disposed,
            glError: gl.getError(),
        },
        preserved: {
            instanceEqual: current === value,
            timeEqual: state.time === before.time,
            framesEqual: frameLedger.length === before.count,
            outputsEqual: JSON.stringify(outputs) === before.outputs,
        },
        tempRefs,
        rendererRestored: value.renderer.getSharedMaterial(0) === value.material,
    };
}
Object.assign(window, {
    __driverpilot: {
        ready: true,
        snapshot,
        setBindings,
        step,
        __resetSession: resetSession,
        linearProbe,
        cycles,
        release,
        pause() {
            ensure();
            state.paused = true;
        },
        resume() {
            ensure();
            state.paused = false;
        },
        pausePacer() {
            ensure();
            game.pause();
        },
        resumePacer() {
            ensure();
            if (clock) {
                clock.end();
                clock = null;
            }
            state.paused = false;
            game.resume();
        },
        startPerformance: perf.startPerformance,
        stopPerformance: perf.stopPerformance,
        recreate() {
            ensure();
            const trace = current ? retireInstance(current) : null;
            current = createInstance();
            return { trace, snapshot: snapshot() };
        },
    },
});
installShaderLifecycle({
    label: 'shader-driver-pilot',
    isDisposed: () => released,
    getInstance: () => current,
    createInstance: () => {
        current = createInstance();
        return current;
    },
    retireInstance,
    ownedAssets: (value: Instance) => [
        { name: 'mesh', ref: value.mesh },
        { name: 'material', ref: value.material },
        { name: 'effect', ref: value.effect },
    ],
    stepClock: testMode
        ? async () => {
              await step();
          }
        : undefined,
});
