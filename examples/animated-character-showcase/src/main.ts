import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    SphereLight,
    Color,
    Vec3,
    Vec4,
    Component,
    Material,
    MeshRenderer,
    GLTFLoader,
    Animation,
    utils,
    primitives,
    GLTFInstance,
    GLTFAsset,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });
const scene = new Scene('animated-character-showcase');
scene.globals.ambient.skyColor = new Vec4(0.65, 0.7, 0.8, 1);
scene.globals.shadows.enabled = true;
scene.globals.shadows.shadowColor = new Color(12, 17, 25, 80);
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 2.2, 8);
cameraNode.lookAt(new Vec3(0, 1, 0));
const camera = cameraNode.addComponent(Camera);
camera.near = 0.1;
camera.far = 100;
camera.fov = 45;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(29, 37, 50, 255);
const key = new Node('Key');
scene.addChild(key);
key.setRotationFromEuler(-35, -35, 0);
key.addComponent(DirectionalLight).illuminance = 45000;
for (const [index, position] of [
    [4, 3, 4],
    [-2, 4, -3],
].entries()) {
    const node = new Node(['Fill', 'Rim'][index]);
    scene.addChild(node);
    node.setPosition(position[0], position[1], position[2]);
    const light = node.addComponent(SphereLight);
    light.range = 15;
    light.color = index === 0 ? new Color(165, 195, 255, 255) : new Color(255, 237, 210, 255);
    light.luminousFlux = [12000, 16000][index];
}
const floor = new Node('Ground');
scene.addChild(floor);
const renderer = floor.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.plane({ width: 22, length: 20, widthSegments: 1, lengthSegments: 1 }));
const floorMaterial = new Material();
floorMaterial.initialize({ effectName: 'builtin-standard' });
floorMaterial.setProperty('albedo', new Color(70, 82, 96, 255));
floorMaterial.setProperty('roughness', 0.95);
renderer.material = floorMaterial;

type CanonicalClip = 'idle' | 'walk';
type Slot = { instance: GLTFInstance; animation: Animation; sourceName: string };
const slots: { A: Slot | null; B: Slot | null } = { A: null, B: null };
let assetLoaded = false;
let resetCount = 0;
let destroyedInstance: 'A' | null = null;
const frameTimes: number[] = [];
const modelURL = new URL('assets/character.glb', document.baseURI).href;
const response = await fetch(modelURL);
if (!response.ok) throw new Error(`character.glb: HTTP ${response.status}`);
// Only container bytes are retained. Lifecycle verification destroys every parsed/GPU asset.
const cachedBytes = await response.arrayBuffer();
const loader = new GLTFLoader();
let asset: GLTFAsset = await loader.parseAsync(cachedBytes, modelURL);
asset.addRef(); // Application ownership keeps the shared resource alive through resets.
const clipNames = {
    idle: asset.animations.find((clip) => /idle|survey/i.test(clip.name))?.name || asset.animations[0]?.name,
    walk: asset.animations.find((clip) => /walk/i.test(clip.name))?.name,
};
if (!clipNames.idle || !clipNames.walk || asset.skeletons.length === 0)
    throw new Error('E10 needs a skinned GLB with Idle/Walk clips.');

function createSlot(id: 'A' | 'B'): void {
    const instance = asset.instantiate();
    const scale = 0.035;
    instance.root.setScale(scale, scale, scale);
    instance.root.setPosition(id === 'A' ? -2.5 : 2.5, 0, 0);
    instance.setAnimationLoop(true);
    const animation = instance.root.getComponent(Animation)!;
    slots[id] = { instance, animation, sourceName: clipNames.idle! };
    scene.addChild(instance.root);
    instance.root.getComponentsInChildren(MeshRenderer).forEach((mesh) => {
        mesh.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
    });
    animation.play(clipNames.idle);
}
function select(id: 'A' | 'B', canonical: CanonicalClip): void {
    const slot = slots[id];
    if (!slot) return;
    slot.sourceName = clipNames[canonical]!;
    slot.animation.play(slot.sourceName);
}
function dispose(id: 'A' | 'B'): void {
    const slot = slots[id];
    if (!slot) return;
    slot.instance.root.removeFromParent();
    slot.instance.dispose();
    slots[id] = null;
}
function reset(): void {
    if (!assetLoaded) return;
    dispose('A');
    dispose('B');
    createSlot('A');
    createSlot('B');
    destroyedInstance = null;
    resetCount++;
    (document.querySelector('[data-ui="destroy-a"]') as HTMLButtonElement).disabled = false;
}
for (const id of ['A', 'B'] as const)
    for (const clip of ['idle', 'walk'] as const) {
        document
            .querySelector(`[data-ui="anim-${id.toLowerCase()}-${clip}"]`)!
            .addEventListener('click', () => select(id, clip));
    }
document.querySelector('[data-ui="destroy-a"]')!.addEventListener('click', () => {
    dispose('A');
    destroyedInstance = 'A';
    (document.querySelector('[data-ui="destroy-a"]') as HTMLButtonElement).disabled = true;
});
document.querySelector('[data-ui="reset"]')!.addEventListener('click', reset);

function snapshot(id: 'A' | 'B') {
    const slot = slots[id];
    if (!slot) return null;
    const state = slot.animation.getState(slot.sourceName);
    return { clip: state.name === clipNames.walk ? 'walk' : 'idle', time: state.time };
}
function getState() {
    const span = frameTimes.length > 1 ? frameTimes[frameTimes.length - 1] - frameTimes[0] : 0;
    return {
        assetLoaded,
        instanceCount: Number(!!slots.A) + Number(!!slots.B),
        instances: { A: snapshot('A'), B: snapshot('B') },
        destroyedInstance,
        resetCount,
        fps: span > 0 ? ((frameTimes.length - 1) * 1000) / span : 0,
    };
}
class Observe extends Component {
    update(): void {
        frameTimes.push(performance.now());
        if (frameTimes.length > 60) frameTimes.shift();
        document.querySelector('#status')!.textContent =
            `${snapshot('A')?.clip ?? 'removed'} / ${snapshot('B')?.clip ?? 'removed'} · reset ${resetCount} · frame callbacks ${getState().fps.toFixed(1)} fps`;
    }
}
const observer = new Node('Frame observation');
scene.addChild(observer);
observer.addComponent(Observe);
(window as any).__airApp = app;
(window as any).__bench = { getState, reset };
function held(): { name: string; ref: object }[] {
    const values: { name: string; ref: object }[] = [{ name: 'parsed glTF asset', ref: asset }];
    for (const [kind, resources] of Object.entries({
        meshes: asset.meshes,
        materials: asset.materials,
        textures: asset.textures,
        images: asset.images,
        skeletons: asset.skeletons,
        clips: asset.animations,
    }))
        resources.forEach((ref, index) => values.push({ name: `${kind}${index}`, ref }));
    for (const id of ['A', 'B'] as const)
        if (slots[id]) values.push({ name: `instance${id}`, ref: slots[id]!.instance.root });
    for (const id of ['A', 'B'] as const)
        slots[id]?.instance.animations.forEach((ref, index) => values.push({ name: `instance${id}clip${index}`, ref }));
    return values;
}
function releaseParsed(): void {
    assetLoaded = false;
    (window as any).__appReady = false;
    dispose('A');
    dispose('B');
    asset.destroy();
    asset.decRef(false);
}
installAssetLifecycle({
    label: 'animated-character-showcase',
    hold: held,
    release: releaseParsed,
    reacquire: async () => {
        asset = await loader.parseAsync(cachedBytes, modelURL);
        asset.addRef();
        createSlot('A');
        createSlot('B');
        destroyedInstance = null;
        assetLoaded = true;
        (window as any).__appReady = true;
        return held();
    },
});
function skinPose(id: 'A' | 'B'): number[] | null {
    const slot = slots[id];
    if (!slot) return null;
    const values: number[] = [];
    asset.skeletons[0].joints.forEach((path) => {
        const joint = slot.instance.root.getChildByPath(path)!;
        const rotation = joint.rotation;
        values.push(
            joint.position.x,
            joint.position.y,
            joint.position.z,
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w,
        );
    });
    return values;
}
(window as any).__characterProbe = () => ({
    skeletonJoints: asset.skeletons.map((skin) => skin.joints.length),
    sharedMesh:
        !!slots.A &&
        !!slots.B &&
        slots.A.instance.root.getComponentsInChildren(MeshRenderer)[0].mesh ===
            slots.B.instance.root.getComponentsInChildren(MeshRenderer)[0].mesh,
    aAttached: !!slots.A && slots.A.instance.root.parent === scene,
    bAttached: !!slots.B && slots.B.instance.root.parent === scene,
    aPose: skinPose('A'),
    bPose: skinPose('B'),
    assetRefCount: asset.refCount,
});
app.run(scene);
createSlot('A');
createSlot('B');
assetLoaded = true;
(window as any).__appReady = true;
window.addEventListener(
    'pagehide',
    () => {
        releaseParsed();
        floorMaterial.destroy();
    },
    { once: true },
);
