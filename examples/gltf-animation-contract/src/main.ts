import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    Color,
    Vec3,
    Vec4,
    Component,
    Animation,
    GLTFLoader,
    MeshRenderer,
    createStepClock,
    GLTFAsset,
    GLTFInstance,
    Material,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });
(window as any).__airApp = app;
const scene = new Scene('gltf-animation-contract');
scene.globals.ambient.skyColor = new Vec4(0.47, 0.55, 0.63, 1);
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 2.5, 10);
cameraNode.lookAt(new Vec3(0, 1, 0));
const camera = cameraNode.addComponent(Camera);
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(25, 33, 50, 255);
// Keep native default visibility: DEFAULT-layer objects must render without a manual assignment.
const lightNode = new Node('Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-55, -35, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;
const morph = new URLSearchParams(location.search).get('model') === 'morph';
const modelURL = new URL(morph ? 'assets/AnimatedMorphCube.glb' : 'assets/Fox.glb', document.baseURI).href;
const response = await fetch(modelURL);
if (!response.ok) throw new Error(`model: HTTP ${response.status}`);
const cachedBytes = await response.arrayBuffer();
const loader = new GLTFLoader();
let asset: GLTFAsset = await loader.parseAsync(cachedBytes, modelURL);
let a: GLTFInstance;
let b: GLTFInstance;
let aa: Animation;
let ba: Animation;
let ar: MeshRenderer;
let br: MeshRenderer;
let variant: Material;
let running = true;
const destroyedVariants = new WeakSet<Material>();
let selected = asset.animations[0].name;
let finishedB = 0;
let updates = 0;
function instantiateInstances(): void {
    a = asset.instantiate();
    b = asset.instantiate();
    a.root.setPosition(-2, 0, 0);
    b.root.setPosition(2, 0, 0);
    const scale = morph ? 1 : 0.025;
    a.root.setScale(scale, scale, scale);
    b.root.setScale(scale, scale, scale);
    a.setAnimationLoop(true);
    scene.addChild(a.root);
    scene.addChild(b.root);
    aa = a.root.getComponent(Animation)!;
    ba = b.root.getComponent(Animation)!;
    ar = a.root.getComponentsInChildren(MeshRenderer)[0];
    br = b.root.getComponentsInChildren(MeshRenderer)[0];
    variant = ar.getMaterialInstance(0)!;
    variant.setProperty('albedo', new Vec4(0.3, 0.65, 1, 1));
    ba.on(Animation.EventType.FINISHED, () => {
        finishedB++;
    });
    running = true;
}
instantiateInstances();
const clips = document.querySelector('#clips') as HTMLSelectElement;
for (const clip of asset.animations) {
    const option = document.createElement('option');
    option.value = option.textContent = clip.name;
    clips.appendChild(option);
}
clips.onchange = () => {
    selected = clips.value;
    aa.play(selected);
    ba.play(selected);
};
document.querySelector('#pause')!.addEventListener('click', () => aa.pause());
document.querySelector('#resume')!.addEventListener('click', () => aa.resume());

function pose(root: Node): number[] {
    const values: number[] = [];
    function visit(node: Node): void {
        const p = node.position;
        const r = node.rotation;
        values.push(p.x, p.y, p.z, r.x, r.y, r.z, r.w);
        node.children.forEach(visit);
    }
    root.children.forEach(visit);
    return values;
}
function instanceState(animation: Animation, root: Node, renderer: MeshRenderer) {
    const state = animation.getState(selected);
    return {
        time: state.time,
        wrapMode: state.wrapMode,
        playing: state.isPlaying,
        paused: state.isPaused,
        pose: pose(root),
        weights: renderer.mesh?.struct.morph ? renderer.getWeight(0, 0) : null,
    };
}
class Playback extends Component {
    start(): void {
        aa.play(selected);
        ba.play(selected);
    }
    update(): void {
        if (!running) return;
        updates++;
        document.querySelector('#status')!.textContent =
            `${selected} · left ${aa.getState(selected).time.toFixed(2)}s · right ${ba.getState(selected).time.toFixed(2)}s · right completed ${finishedB}`;
    }
}
const driver = new Node('Playback');
scene.addChild(driver);
driver.addComponent(Playback);
const clock = createStepClock();
(window as any).__gltfAnimationProbe = () => ({
    ready: running && updates >= 2,
    selected,
    names: asset.animations.map((clip) => clip.name),
    duration: asset.animations.find((clip) => clip.name === selected)!.duration,
    a: running ? instanceState(aa, a.root, ar) : null,
    b: running ? instanceState(ba, b.root, br) : null,
    finishedB,
    sharedMesh: ar.mesh === br.mesh,
    privateMaterial: variant !== br.getSharedMaterial(0),
    sharedClip: a.animations[0] === b.animations[0],
    sourceWrap: asset.animations[0].wrapMode,
    cameraVisibility: camera.visibility,
});
(window as any).__gltfAnimationStep = async (seconds: number, restart = false) => {
    clock.begin();
    if (restart) {
        aa.play(selected);
        ba.play(selected);
        await clock.step(0);
    }
    return clock.step(seconds);
};
window.addEventListener('pagehide', () => releaseParsed(), { once: true });
function held(): { name: string; ref: object; released?: () => boolean }[] {
    const ownedVariant = variant;
    const refs = new Map<object, string>([
        [asset, 'parsed glTF asset'],
        [a.root, 'instance A'],
        [b.root, 'instance B'],
    ]);
    for (const [kind, resources] of Object.entries({
        meshes: asset.meshes,
        materials: asset.materials,
        textures: asset.textures,
        images: asset.images,
        skeletons: asset.skeletons,
        clips: [...asset.animations, ...a.animations, ...b.animations],
    })) {
        resources.forEach((ref, index) => refs.set(ref, `${kind}${index}`));
    }
    return [
        {
            name: 'private material variant',
            ref: ownedVariant,
            released: () => destroyedVariants.has(ownedVariant) && ownedVariant.passes.length === 0,
        },
        ...[...refs].map(([ref, name]) => ({ ref, name })),
    ];
}
function releaseParsed(): void {
    running = false;
    clock.end();
    variant.destroy(); // This example owns the customization; release its native pass buffers explicitly.
    destroyedVariants.add(variant);
    a.root.removeFromParent();
    b.root.removeFromParent();
    a.dispose();
    b.dispose();
    asset.destroy();
}
installAssetLifecycle({
    label: 'gltf-animation-contract',
    hold: held,
    release: releaseParsed,
    reacquire: async () => {
        asset = await loader.parseAsync(cachedBytes, modelURL);
        instantiateInstances();
        aa.play(selected);
        ba.play(selected);
        return held();
    },
});
app.run(scene);
