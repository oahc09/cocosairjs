/**
 * Cocos AIR — webgpu-basic
 *
 * 纯 Code First：无 Creator、无 .scene、无 Prefab。
 * 展示 Camera + DirectionalLight + 旋转的 Cube。
 */

import {
    Layers,
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    builtinResMgr,
    utils,
    primitives,
    Vec3,
    Color,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;

const renderer = new URLSearchParams(location.search).get('renderer') === 'webgl2' ? 'webgl2' : 'webgpu';
const assetBaseUrl = new URLSearchParams(location.search).get('assets');
const app = await createAirApp({
    canvas,
    renderer,
    ...(renderer === 'webgpu' && assetBaseUrl ? { webgpu: { assetBaseUrl } } : {}),
});

const scene = new Scene('webgpu-basic');

// Camera
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);

camera.visibility = Layers.Enum.DEFAULT; // 引擎 4.0-alpha 的默认 visibility 为 undefined，必须显式设置
camera.priority = 0;

// Directional light
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

// Cube
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');

if (new URLSearchParams(location.search).has('shadows')) {
    scene.globals.shadows.type = 1; // Frozen Cocos ShadowType.ShadowMap.
    scene.globals.shadows.enabled = true;
    lightNode.setPosition(4, 8, 4);
    lightNode.lookAt(Vec3.ZERO);
    light.shadowEnabled = true;
    light.shadowFixedArea = new URLSearchParams(location.search).get('shadows') !== 'csm';
    light.csmLevel = 4;
    light.shadowDistance = 20;
    light.shadowOrthoSize = 5;
    light.shadowNear = 0.1;
    light.shadowFar = 20;
    meshRenderer.shadowCastingMode = 1; // ModelShadowCastingMode.ON.
    meshRenderer.receiveShadow = 1; // ModelShadowReceivingMode.ON.
    const ground = new Node('Shadow receiver');
    scene.addChild(ground);
    ground.setPosition(0, -0.6, 0);
    const receiver = ground.addComponent(MeshRenderer);
    receiver.mesh = utils.createMesh(primitives.box({ width: 4, height: 0.1, length: 4 }));
    receiver.material = builtinResMgr.get('builtin-standard-material');
    receiver.receiveShadow = 1;
}

(window as any).__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
app.run(scene);

console.log('[webgpu-basic] running on cocosair');
