import * as air from '/runtime.mjs';

const width = 480;
const height = 270;
const canvas = document.querySelector('canvas');
const template = 'air-gltf-template';
let registrations = 0;
const loaded = air.EffectAsset.prototype.onLoaded;
air.EffectAsset.prototype.onLoaded = function () {
    const result = loaded.call(this);
    if (this.name === template) registrations++;
    return result;
};
const start = performance.now();
air.macro.ENABLE_WEBGL_ANTIALIAS = false;
const app = await air.createAirApp({ canvas, pixelRatioCap: 1, designResolution: { width, height, policy: 0 } });
const scene = new air.Scene('glTF startup proof');
scene.globals.postSettings.toneMappingType = 1;
const cameraNode = new air.Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 5);
const camera = cameraNode.addComponent(air.Camera);
camera.projection = air.Camera.ProjectionType.ORTHO;
camera.orthoHeight = 1.4;
camera.near = 0.1;
camera.far = 20;
camera.clearColor = new air.Color(32, 40, 54, 255);
camera.clearFlags = air.Camera.ClearFlag.SOLID_COLOR;
camera.visibility = air.Layers.Enum.DEFAULT;
const lit = new air.Node('Light');
scene.addChild(lit);
const light = lit.addComponent(air.DirectionalLight);
light.illuminance = 65000;
const cube = new air.Node('Startup cube');
scene.addChild(cube);
const ownMesh = cube.addComponent(air.MeshRenderer);
ownMesh.mesh = air.utils.createMesh(air.primitives.box());
const ownMaterial = new air.Material();
ownMaterial.initialize({ effectName: 'builtin-unlit' });
ownMaterial.setProperty('mainColor', new air.Color(255, 120, 40, 255));
ownMesh.setMaterial(ownMaterial, 0);
cube.active = false;
const afterDraw = () => new Promise((resolve) => air.director.once(air.Director.EVENT_AFTER_DRAW, resolve));
let physical = false;
let lease;
let instance;
let disposedMeshes = [];
const states = { init: performance.now() - start, texturePhases: 0 };
const snapshot = () => ({
    template: Boolean(air.EffectAsset.get(template)),
    registrations,
    physicalEffect: Boolean(air.EffectAsset.get('air-gltf-physical')),
    states: { ...states },
    resources: performance.getEntriesByType('resource').map((entry) => ({
        path: new URL(entry.name).pathname,
        encoded: entry.encodedBodySize,
        responseEnd: entry.responseEnd,
    })),
});

function model(physical) {
    const data = new Float32Array([-0.85, -0.62, 0, 0.85, -0.62, 0, 0, 0.85, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const buffer = btoa(String.fromCharCode(...new Uint8Array(data.buffer)));
    const primitive = { attributes: { POSITION: 0, NORMAL: 1 } };
    const json = {
        asset: { version: '2.0' },
        buffers: [{ uri: 'data:application/octet-stream;base64,' + buffer, byteLength: 72 }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36 },
            { buffer: 0, byteOffset: 36, byteLength: 36 },
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                type: 'VEC3',
                count: 3,
                min: [-0.85, -0.62, 0],
                max: [0.85, 0.85, 0],
            },
            { bufferView: 1, componentType: 5126, type: 'VEC3', count: 3 },
        ],
        meshes: [{ primitives: [primitive] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
    };
    if (physical) {
        primitive.material = 0;
        json.extensionsUsed = ['KHR_materials_clearcoat'];
        json.materials = [
            {
                pbrMetallicRoughness: {
                    baseColorFactor: [0.9, 0.25, 0.04, 1],
                    metallicFactor: 0,
                    roughnessFactor: 0.4,
                },
                extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.8 } },
            },
        ];
    }
    return JSON.stringify(json);
}

const parse = (physical, signal) =>
    new air.GLTFLoader({
        signal,
        onProgress: ({ phase }) => {
            if (phase === 'textures') states.texturePhases++;
        },
    }).parseAsync(model(physical), location.href);
const status = (task) =>
    task.then(
        (value) => ({ value }),
        (error) => ({ error: String(error), name: error.name }),
    );
const latch = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function present(asset) {
    lease = asset;
    instance = asset.instantiate();
    disposedMeshes = [...asset.meshes];
    cube.active = false;
    scene.addChild(instance.root);
    if (!app.getScene()) app.run(scene);
    await afterDraw();
    states.modelDraw = performance.now();
    await latch();
    return snapshot();
}

async function cleanup() {
    instance?.dispose();
    lease?.destroy();
    await afterDraw();
    await afterDraw();
    return { modelValid: lease?.isValid, anyMeshValid: disposedMeshes.some((value) => value.isValid), ...snapshot() };
}

let pending;
let sibling;
let abort;
window.probe = {
    snapshot,
    async run(cold, usePhysical) {
        physical = usePhysical;
        if (!cold) {
            cube.active = true;
            app.run(scene);
            await afterDraw();
            states.cubeDraw = performance.now();
            await latch();
        }
        return snapshot();
    },
    begin(pair) {
        states.request = performance.now();
        if (pair) abort = new AbortController();
        pending = status(parse(physical, abort?.signal));
        if (pair) sibling = status(parse(physical));
    },
    async cancel() {
        abort.abort();
        const result = await pending;
        return { aborted: result.name === 'AbortError', unexpectedlyAllocated: Boolean(result.value), ...snapshot() };
    },
    async finish(pair) {
        const result = await (pair ? sibling : pending);
        if (result.error) return { error: result.error, ...snapshot() };
        return present(result.value);
    },
    cleanup,
};
