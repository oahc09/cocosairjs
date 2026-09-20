/**
 * Cocos AIR 开发手册 — Installation（安装与引入）
 * 配套文章：docs/manual/installation.md
 *
 * 目的：证明"importmap 引入 → createAirApp → 一个静止的 cube"这条最短链路能跑通，
 *      并把可查询到的引擎版本/平台/后端信息打在左上角 overlay 上（不硬编码版本号）。
 */

import {
    VERSION,
    sys,
    screen,
    game,
    director,
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
const app = await createAirApp({ canvas });

const scene = new Scene('installation');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(24, 32, 48, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 一个静止的 cube（本篇不转动：证明"装好了"就够） ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');

window.__airApp = app;
app.run(scene);

// ---- overlay：只打印真的查得到的字段，查不到就不显示（不伪造能力） ----
const device = director.root && director.root.device;
const caps = device && device.capabilities;
const facts = {
    VERSION,
    'sys.platform': sys.platform,
    'sys.browserType': sys.browserType,
    'sys.os': sys.os,
    'sys.isMobile': sys.isMobile,
    device: device && device.constructor && device.constructor.name,
    maxTextureSize: caps && caps.maxTextureSize,
    maxColorRenderTargets: caps && caps.maxColorRenderTargets,
    canvas: `${canvas.width}x${canvas.height}`,
    devicePixelRatio: screen.devicePixelRatio,
    frameRate: game.frameRate,
};
(document.querySelector('#info') as HTMLElement).textContent = Object.entries(facts)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

console.log('[manual/installation] running on cocosair', VERSION);
