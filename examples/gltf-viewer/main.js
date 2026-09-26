import {
    createAirApp,
    Scene,
    Vec3,
    Node,
    Animation,
    AnimationClip,
    GLTFLoader,
    MeshRenderer,
    AirTransmissionCapture,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';

const parameters = new URLSearchParams(location.search);
const embedded = parameters.get('embed') === '1';
function report(state, message) {
    if (embedded)
        parent.postMessage(
            { type: 'gltf-viewer:status', request: parameters.get('request'), state, message },
            location.origin,
        );
}
window.addEventListener('error', (event) => report('error', event.message));
window.addEventListener('unhandledrejection', (event) =>
    report('error', event.reason?.message || String(event.reason)),
);
const app = await createAirApp({ canvas: '#GameCanvas' });
window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
const scene = new Scene('glTF viewer');
const camera = setupCamera(scene, { position: [3, 2, 4], clearColor: [24, 33, 50, 255] });
setupDirectionalLight(scene, { rotationEuler: [-35, -25, 0], illuminance: 20000 });
// KHR_materials_transmission refracts the opaque scene color: arm the two-camera capture at
// startup so the capability is live before assets parse (materials read it at build time).
const captureNode = new Node('transmission-capture');
scene.addChild(captureNode);
const capture = captureNode.addComponent(AirTransmissionCapture);
capture.mainCamera = camera;
app.run(scene);
const loader = new GLTFLoader();
const modelSelect = document.querySelector('#model');
const clipSelect = document.querySelector('#clip');
const time = document.querySelector('#time');
const status = document.querySelector('#status');
let current;
let loading = 0;
const cameraTarget = new Vec3();
let resetCamera = () => {};

// Reproducible front view of official test assets, based on their native mesh bounds.
function fitOfficialModel(root) {
    const min = new Vec3(Infinity, Infinity, Infinity);
    const max = new Vec3(-Infinity, -Infinity, -Infinity);
    for (const renderer of root.getComponentsInChildren(MeshRenderer)) {
        const bounds = renderer.mesh.struct;
        if (!bounds.minPosition || !bounds.maxPosition) continue;
        for (let corner = 0; corner < 8; corner++) {
            const point = new Vec3(
                corner & 1 ? bounds.maxPosition.x : bounds.minPosition.x,
                corner & 2 ? bounds.maxPosition.y : bounds.minPosition.y,
                corner & 4 ? bounds.maxPosition.z : bounds.minPosition.z,
            );
            Vec3.transformMat4(point, point, renderer.node.worldMatrix);
            Vec3.min(min, min, point);
            Vec3.max(max, max, point);
        }
    }
    if (!Number.isFinite(min.x)) throw new Error('Model has no renderable bounds');
    const center = Vec3.multiplyScalar(new Vec3(), Vec3.add(new Vec3(), min, max), 0.5);
    const radius = Math.max(Vec3.distance(min, max) * 0.5, 0.01);
    camera.near = Math.max(radius / 1000, 0.001);
    camera.far = Math.max(radius * 100, 100);
    const halfFov = (camera.fov * Math.PI) / 360;
    const fitDistance = embedded
        ? (Math.max((max.y - min.y) / 2, (max.x - min.x) / ((2 * innerWidth) / innerHeight), 0.01) * 1.3) /
              Math.tan(halfFov) +
          (max.z - min.z) / 2
        : (radius * 1.25) / Math.sin(halfFov);
    camera.node.setPosition(center.x, center.y, center.z + fitDistance);
    camera.node.lookAt(center);
    Vec3.copy(cameraTarget, center);
}

function sample(value) {
    if (!current || !clipSelect.value) return;
    const animation = current.instance.root.getComponent(Animation);
    animation.play(clipSelect.value);
    const state = animation.getState(clipSelect.value);
    state.time = value;
    state.sample();
    animation.pause();
    time.value = String(value);
}
async function load(name, sourceURL) {
    const ticket = ++loading;
    status.removeAttribute('data-error');
    status.textContent = '加载中…';
    report('loading', '正在读取模型与依赖文件…');
    let retained;
    let created;
    try {
        const url = sourceURL ? new URL(sourceURL, location.href) : new URL(`./assets/${name}`, import.meta.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP/HTTPS 模型地址');
        const asset = await loader.loadAsync(url.href);
        if (ticket !== loading) {
            if (current?.asset !== asset) asset.decRef();
            return;
        }
        asset.addRef();
        retained = asset;
        const instance = asset.instantiate();
        created = instance;
        scene.addChild(instance.root);
        const positions = {
            'BoxTextured.glb': [
                [2.5, 1.8, 3.5],
                [0, 0, 0],
            ],
            'SimpleSkin.gltf': [
                [0, 1, 4.5],
                [0, 1, 0],
            ],
            'AnimatedMorphCube.glb': [
                [3, 2, 4],
                [0, 0, 0],
            ],
            'diagnostics.glb': [
                [-1.2, 0, 7.5],
                [-1.2, 0, 0],
            ],
            'combined.glb': [
                [4, 1.5, 6],
                [4, 1, 0],
            ],
            'scene.glb': [
                [0, 1.6, 6],
                [0, 0.8, -0.5],
            ],
        };
        resetCamera = () => {
            if (positions[name] && !embedded) {
                const [position, target] = positions[name];
                camera.near = 0.1;
                camera.far = 1000;
                camera.node.setPosition(new Vec3(...position));
                camera.node.lookAt(new Vec3(...target));
                cameraTarget.set(...target);
            } else {
                fitOfficialModel(instance.root);
            }
        };
        resetCamera();
        const previous = current;
        current = { asset, instance };
        if (previous) {
            previous.instance.dispose();
            previous.asset.decRef();
        }
        clipSelect.replaceChildren(...instance.animations.map((clip) => new Option(clip.name, clip.name)));
        clipSelect.disabled = instance.animations.length === 0;
        document.documentElement.dataset.animated = String(instance.animations.length > 0);
        document.querySelector('#play').disabled =
            document.querySelector('#pause').disabled =
            time.disabled =
                instance.animations.length === 0;
        for (const clip of instance.animations) {
            clip.wrapMode = AnimationClip.WrapMode.Loop;
        }
        time.max = String(instance.animations[0]?.duration || 1);
        time.value = '0';
        sample(0);
        status.textContent = `${asset.meshes.length} 网格 · ${asset.materials.length} 材质\n${asset.skeletons.length} 骨架 · ${instance.animations.length} 动画\n${asset.warnings.length ? asset.warnings.join('\n') : '已加载'}`;
        report('loaded', status.textContent);
        window.gltfViewer = { asset, instance, sample, name, camera };
    } catch (error) {
        if (created && current?.instance !== created) created.dispose();
        if (retained && current?.asset !== retained) retained.decRef();
        if (ticket !== loading) return;
        status.dataset.error = '';
        status.textContent = error.message;
        console.error(error);
        report('error', error.message);
    }
}
modelSelect.addEventListener('change', () => load(modelSelect.value));
clipSelect.addEventListener('change', () => {
    time.max = String(current.instance.animations.find((clip) => clip.name === clipSelect.value)?.duration || 1);
    sample(0);
});
document
    .querySelector('#play')
    .addEventListener('click', () => current?.instance.root.getComponent(Animation).play(clipSelect.value));
document
    .querySelector('#pause')
    .addEventListener('click', () => current?.instance.root.getComponent(Animation).pause());
time.addEventListener('input', () => sample(Number(time.value)));

// Orbit control belongs to the example, not the engine API.
const canvas = document.querySelector('canvas');
let drag;
canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', () => {
    drag = null;
});
canvas.addEventListener('pointercancel', () => {
    drag = null;
});
canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const offset = Vec3.subtract(new Vec3(), camera.node.worldPosition, cameraTarget);
    const radius = offset.length();
    let yaw = Math.atan2(offset.x, offset.z) - (event.clientX - drag.x) * 0.007;
    let pitch = Math.asin(Math.max(-1, Math.min(1, offset.y / radius))) + (event.clientY - drag.y) * 0.007;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
    camera.node.setPosition(
        cameraTarget.x + radius * Math.sin(yaw) * Math.cos(pitch),
        cameraTarget.y + radius * Math.sin(pitch),
        cameraTarget.z + radius * Math.cos(yaw) * Math.cos(pitch),
    );
    camera.node.lookAt(cameraTarget);
    drag = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener(
    'wheel',
    (event) => {
        event.preventDefault();
        const offset = Vec3.subtract(new Vec3(), camera.node.worldPosition, cameraTarget);
        const distance = offset.length();
        const next = Math.max(
            camera.near * 5,
            Math.min(camera.far * 0.6, distance * Math.exp(Math.max(-2, Math.min(2, event.deltaY * 0.001)))),
        );
        offset.multiplyScalar(next / Math.max(distance, 1e-6));
        camera.node.setPosition(Vec3.add(offset, offset, cameraTarget));
        camera.node.lookAt(cameraTarget);
    },
    { passive: false },
);
window.addEventListener('message', (event) => {
    if (
        embedded &&
        event.source === parent &&
        event.origin === location.origin &&
        event.data?.type === 'gltf-viewer:reset'
    )
        resetCamera();
});
if (parameters.has('url')) {
    const name = parameters.get('model') || 'remote.gltf';
    if (![...modelSelect.options].some((option) => option.value === name))
        modelSelect.add(new Option(parameters.get('label') || name, name));
    modelSelect.value = name;
    await load(name, parameters.get('url'));
} else {
    await load(modelSelect.value);
}

// §25 Lifecycle Contract：查看器同一入口路径重取当前模型——释放在显示例资产后必须能再次装载并渲染。
installAssetLifecycle({
    label: 'gltf-viewer',
    hold: () =>
        current
            ? [
                  { name: 'GLTFAsset(current)', ref: current.asset },
                  { name: 'instance.root', ref: current.instance.root },
              ]
            : [],
    release: () => {
        const { asset, instance } = current;
        instance.dispose();
        asset.destroy();
        current = undefined;
    },
    reacquire: async () => {
        await load(modelSelect.value);
        return [
            { name: 'GLTFAsset(current)', ref: current.asset },
            { name: 'instance.root', ref: current.instance.root },
        ];
    },
});
