/**
 * Cocos AIR 开发手册 — Setup（环境搭建）
 * 配套文章：docs/manual/setup.md
 *
 * 本篇的示例只是"跑通载体"：一个最小 hello-cube，重点在文章讲 dev server。
 * 示例自身不 fetch /__build_status —— 该通道由 dev server 注入的 reload 脚本
 * 轮询（见文章 §3），纯静态部署下示例去 fetch 它只会得到 404 控制台噪声。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('setup');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.0));
cameraNode.lookAt(new Vec3(0, 0.5, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 26, 38, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 地面 + hello cube ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

const cubeNode = new Node('Hello Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.6, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(90, 200, 220, 255));
cubeRenderer.material = cubeMaterial;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：starter 自检 ============
// 注：/​__build_status 通道由 dev server 注入的 reload 脚本轮询（见文章 §3），
// 示例自身不去 fetch 它 —— 纯静态部署下该路径 404 会产生控制台噪声。
(document.querySelector('#info') as HTMLElement).textContent = [
    'setup: minimal starter running',
    `scene: ${scene.name}  nodes: ${scene.children.length}`,
    `canvas: ${canvas.width}x${canvas.height}`,
].join('\n');

console.log('[manual/setup] running on cocosair');
