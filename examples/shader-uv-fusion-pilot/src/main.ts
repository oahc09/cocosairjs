import {
    createAirApp,
    createStepClock,
    createAirRenderTarget,
    Scene,
    Node,
    Camera,
    Color,
    MeshRenderer,
    Material,
    EffectAsset,
    utils,
    gfx,
    Vec4,
    Component,
    director,
    Director,
    game,
} from 'cocosair';
import { definitions, parameterDefinitions } from './effect.generated.js';
import { makePerformance } from './performance.generated.js';
import { validateParameters } from './parameters.js';

const search = new URLSearchParams(location.search);
const effect = search.get('effect') || 'emboss';
const mode = search.get('mode') || 'reference';
if (!['emboss', 'glass'].includes(effect) || !['reference', 'fused'].includes(mode)) throw new Error('FUSION_ROUTE');
const reference = mode === 'reference';
const test = search.get('test') === '1';
document.documentElement.classList.toggle('test', test);
document.querySelector('#label')!.textContent = `${effect} · ${reference ? '原生两遍' : '融合单遍'}`;
const definition = (parameterDefinitions as any)[effect];
const initial = Object.fromEntries(Object.entries(definition.params).map(([k, d]) => [k, (d as any).defaultValue]));
let params = { ...initial };
let time = 0,
    paused = false,
    released = false,
    serial = 0;
let diagnostic = false;
let clock: ReturnType<typeof createStepClock> | null = null;
let background = [10, 12, 16];
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 });
const scene = new Scene('w5-uv-fusion');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 1;
camera.near = 0.1;
camera.far = 10;
camera.visibility = 1 << 20;
camera.priority = 1;
camera.clearColor = new Color(...background, 255);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cameraNode.setPosition(0, 0, 3);
const childNode = new Node('child-camera');
scene.addChild(childNode);
const childCamera = childNode.addComponent(Camera);
childCamera.projection = Camera.ProjectionType.ORTHO;
childCamera.orthoHeight = 1;
childCamera.near = 0.1;
childCamera.far = 10;
childCamera.visibility = 1 << 21;
childCamera.priority = 0;
childCamera.clearColor = new Color(0, 0, 0, 0);
childCamera.enabled = reference;
childCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
childNode.setPosition(0, 0, 3);
const device = director.root!.device;
const memory = () => ({ bufferSize: device.memoryStatus.bufferSize, textureSize: device.memoryStatus.textureSize });
const events: any[] = [];
const abort = new AbortController();
let listenerAdds = 0,
    listenerRemoves = 0;
type Route = {
    id: number;
    assets: { kind: string; asset: any }[];
    nodes: Node[];
    renderers: MeshRenderer[];
    material: Material;
    childMaterial: Material | null;
    target: ReturnType<typeof createAirRenderTarget> | null;
    detach: () => void;
    unbind: () => void;
    retired: boolean;
};
let route: Route | null = null;
function ensure() {
    if (released) throw Object.assign(new Error('Fusion pilot disposed'), { code: 'FUSION_DISPOSED' });
}
function createEffect(kind: string) {
    const value = Object.assign(
        new EffectAsset(),
        JSON.parse(JSON.stringify((definitions as any)[`${effect}:${kind}`])),
    );
    value.addRef();
    value.onLoaded();
    return value;
}
function makeMaterial(asset: EffectAsset, blend: boolean) {
    const value = new Material();
    value.initialize({
        effectAsset: asset,
        defines: {
            SHAPE_BOX: params.shape === 'rounded-box',
            USE_BLUR: (params.blur ?? 0) > 0,
            USE_ABERRATION: (params.aberration ?? 0) > 0,
        },
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
    value.addRef();
    return value;
}
function createRoute(): Route {
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
    const mainEffect = createEffect(mode),
        material = makeMaterial(mainEffect, !diagnostic);
    const value: Route = {
        id: ++serial,
        assets: [
            { kind: 'mesh', asset: mesh },
            { kind: 'material', asset: material },
            { kind: 'effect', asset: mainEffect },
        ],
        nodes: [],
        renderers: [],
        material,
        childMaterial: null,
        target: null,
        detach: () => {},
        unbind: () => {},
        retired: false,
    };
    function quad(label: string, layer: number, mat: Material) {
        const n = new Node(label);
        n.layer = layer;
        scene.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setSharedMaterial(mat, 0);
        value.nodes.push(n);
        value.renderers.push(r);
    }
    if (reference) {
        const childEffect = createEffect('pattern'),
            childMaterial = makeMaterial(childEffect, false);
        value.assets.push({ kind: 'childEffect', asset: childEffect }, { kind: 'childMaterial', asset: childMaterial });
        value.childMaterial = childMaterial;
        quad('owned-pattern', 1 << 21, childMaterial);
        value.target = createAirRenderTarget({
            name: `w5-child-${effect}-${value.id}`,
            width: 256,
            height: 256,
            colorFormat: 'rgba8',
            depthFormat: 'none',
            samples: 1,
            filter: 'nearest',
        });
        value.detach = value.target.attachCamera(childCamera);
        value.unbind = value.target.bindColor(material, 'childTexture');
    }
    quad('owned-effect', 1 << 20, material);
    sync(value);
    return value;
}
function sync(value: Route) {
    const mat = value.material,
        blank = params.sourceKind === 'blank' ? 1 : 0;
    value.childMaterial?.setProperty('pattern0', new Vec4(blank, 0, 0, 0));
    if (effect === 'emboss') {
        mat.setProperty('emboss0', new Vec4(params.scale, params.rotation, params.depth, params.lightAngle));
        mat.setProperty('emboss1', new Vec4(params.lightIntensity, params.shadowIntensity, 0, diagnostic ? 1 : 0));
        mat.setProperty('emboss2', new Vec4(canvas.width, canvas.height, blank, 0));
    } else {
        const tint = [1, 3, 5].map((i) => {
            const c = parseInt(params.tintColor.slice(i, i + 2), 16) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        mat.setProperty('glass0', new Vec4(params.scale, params.rotation, params.refraction, params.thickness * 0.5));
        mat.setProperty('glass1', new Vec4(params.blur, params.aberration, params.innerZoom, params.edgeSoftness));
        mat.setProperty(
            'glass2',
            new Vec4(params.lightAngle, params.highlight, params.highlightSoftness, params.fresnel),
        );
        mat.setProperty(
            'glass3',
            new Vec4(
                params.fresnelSoftness,
                params.tintIntensity,
                params.tintPreserveLuminosity,
                params.cutout === 'shape' ? 1 : 0,
            ),
        );
        mat.setProperty('glass4', new Vec4(...tint, diagnostic ? 1 : 0));
        mat.setProperty('glass5', new Vec4(canvas.width, canvas.height, blank, 0));
    }
    for (const p of [...mat.passes, ...(value.childMaterial?.passes ?? [])]) p.update();
}
function retire(value: Route) {
    if (value.retired) return { id: value.id, idempotent: true };
    value.retired = true;
    for (const r of value.renderers) {
        r.mesh = null;
        r.setSharedMaterial(null, 0);
    }
    value.unbind();
    value.detach();
    const detached = childCamera.targetTexture === null;
    value.target?.dispose();
    for (const n of value.nodes) {
        n.removeFromParent();
        n.destroy();
    }
    const refs = value.assets.map(({ kind, asset }) => {
        const before = asset.refCount;
        if (asset instanceof EffectAsset) EffectAsset.remove(asset);
        asset.decRef();
        const after = asset.refCount;
        if (after === 0) asset.destroy();
        return { kind, before, after };
    });
    return {
        id: value.id,
        idempotent: false,
        refs,
        detached,
        targetDisposed: value.target?.info.disposed ?? null,
        renderersUnbound: value.renderers.every((r) => r.mesh === null && r.getSharedMaterial(0) === null),
        nodesRemoved: value.nodes.every((n) => n.parent === null),
    };
}
const perf = makePerformance({
    director,
    Director,
    game,
    gl: canvas.getContext('webgl2')!,
    device,
    canvas,
    memory,
    snapshot,
    ensure,
    listeners(adds: number, removes: number) {
        listenerAdds += adds;
        listenerRemoves += removes;
    },
    prepare() {
        if (clock) {
            clock.end();
            clock = null;
        }
        paused = false;
    },
});
class FusionUpdater extends Component {
    update(dt: number) {
        const begin = performance.now();
        if (!paused && !released) time += dt;
        if (route) sync(route);
        perf.recordUpdate(performance.now() - begin);
    }
}
const updater = cameraNode.addComponent(FusionUpdater);
route = createRoute();
app.run(scene);
if (test) {
    game.pause();
    clock = createStepClock();
    clock.begin();
    await clock.step(0);
}
function snapshot() {
    return {
        effect,
        mode,
        params: { ...params },
        time,
        paused,
        released,
        instance: route?.id ?? null,
        frame: director.getTotalFrames(),
        dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
        canvas: { width: canvas.width, height: canvas.height },
        oneCanvas: document.querySelectorAll('canvas').length,
        background: [...background],
        diagnostic,
        memory: memory(),
        drawCalls: device.numDrawCalls,
        childTarget: route?.target
            ? { ...route.target.info, attached: childCamera.targetTexture === route.target.renderTexture }
            : null,
        shaders:
            route?.assets
                .filter((a) => a.asset instanceof Material)
                .flatMap((a) => a.asset.passes.map((p: any) => ({ compiled: !!p.getShaderVariant() }))) ?? [],
        events: [...events],
    };
}
async function step(dt = 0) {
    ensure();
    if (!Number.isFinite(dt) || dt < 0) throw new Error('FUSION_DT');
    if (!clock) {
        game.pause();
        clock = createStepClock();
        clock.begin();
    }
    await clock.step(dt);
    return snapshot();
}
function validate(input: unknown): { ok: boolean; values?: Record<string, any>; errors: string[] } {
    return validateParameters(definition, input);
}
async function set(input: unknown) {
    ensure();
    const receipt = validate(input);
    if (!receipt.ok) return receipt;
    const next = receipt.values!;
    const rebuild =
        params.shape !== next.shape ||
        params.blur > 0 !== next.blur > 0 ||
        params.aberration > 0 !== next.aberration > 0;
    params = next;
    const retirement = rebuild && route ? retire(route) : null;
    if (rebuild) route = createRoute();
    else if (route) sync(route);
    return { ...receipt, rebuild, retirement, snapshot: snapshot() };
}
async function cycles() {
    ensure();
    if (route) retire(route);
    route = null;
    await step();
    await step();
    const warm = createRoute();
    await step();
    retire(warm);
    await step();
    await step();
    const rows: any[] = [];
    for (let i = 0; i < 100; i++) {
        const before = memory(),
            value = createRoute();
        await step();
        const created = memory();
        const trace = retire(value),
            repeat = retire(value);
        await step();
        await step();
        rows.push({
            index: i,
            before,
            created,
            after: memory(),
            trace,
            repeat,
            valid: value.assets.map((a) => a.asset.isValid),
            nodesValid: value.nodes.map((n) => n.isValid),
        });
    }
    route = createRoute();
    await step();
    return rows;
}
async function probe(points: { x: number; y: number }[]) {
    ensure();
    const before = memory(),
        previous = camera.targetTexture,
        clear = camera.clearColor.clone();
    const target = createAirRenderTarget({
        width: canvas.width,
        height: canvas.height,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        filter: 'nearest',
    });
    const detach = target.attachCamera(camera);
    let pixels: any[] = [],
        state: any,
        trace: any;
    try {
        diagnostic = true;
        camera.clearColor = new Color(0, 0, 0, 0);
        if (route) retire(route);
        route = createRoute();
        await step();
        target.resolve();
        state = snapshot();
        pixels = points.map((p) => ({ ...p, rgba: Array.from(target.readColor({ ...p, width: 1, height: 1 })) }));
    } finally {
        detach();
        target.dispose();
        diagnostic = false;
        camera.clearColor = clear;
        if (route) trace = retire(route);
        route = createRoute();
        await step();
        await step();
    }
    return {
        state,
        pixels,
        before,
        after: memory(),
        detached: camera.targetTexture === previous,
        disposed: target.info.disposed,
        trace,
    };
}
let releasePromise: Promise<any> | null = null;
function release() {
    if (releasePromise) return releasePromise;
    released = true;
    paused = true;
    updater.enabled = false;
    abort.abort();
    listenerRemoves = listenerAdds;
    const trace = route ? retire(route) : null;
    route = null;
    for (const b of document.querySelectorAll<HTMLButtonElement>('button')) b.disabled = true;
    if (clock) {
        clock.end();
        clock = null;
    }
    releasePromise = Promise.resolve(app.close!()).then((receipt) => ({
        trace,
        receipt,
        listenerAdds,
        listenerRemoves,
        sceneCleared: app.getScene() === null,
    }));
    return releasePromise;
}
for (const id of ['pause', 'resume', 'reset', 'release']) {
    document.querySelector('#' + id)!.addEventListener(
        'click',
        (event) => {
            events.push({ type: id, isTrusted: event.isTrusted, frame: director.getTotalFrames(), time });
            if (id === 'pause') paused = true;
            else if (id === 'resume') paused = false;
            else if (id === 'reset') {
                time = 0;
                void set(initial);
            } else void release();
        },
        { signal: abort.signal },
    );
    listenerAdds++;
}
window.addEventListener('pagehide', () => void release(), { once: true, signal: abort.signal });
listenerAdds++;
Object.assign(window, {
    __fusion: {
        ready: true,
        snapshot,
        step,
        set,
        validate,
        cycles,
        probe,
        release,
        startPerformance: perf.startPerformance,
        stopPerformance: perf.stopPerformance,
        setBackground(value: number[]) {
            ensure();
            if (value.length !== 3 || value.some((v) => !Number.isInteger(v) || v < 0 || v > 255))
                throw new Error('FUSION_BG');
            background = [...value];
            camera.clearColor = new Color(...background, 255);
        },
        releaseIdentity() {
            return release() === release();
        },
    },
});
