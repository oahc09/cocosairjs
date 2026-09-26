/**
 * Cocos AIR 开发手册 — Rendering On Demand（按需渲染）
 * 配套文章：docs/manual/rendering-on-demand.md
 *
 * 不跑连续主循环：app.run 让引擎绘制首帧后 game.pause()，把"何时再出一帧"交回调用方。
 * 用 dirty 标志 + game.step() 实现按需渲染——只有 dirty 时才 step 一帧：
 *   - 点击 "Render one frame"：立方体转 15° 后请求一帧；
 *   - 打开 Auto：每 400ms 自动请求一帧（模拟"有变化才重绘"）。
 * 覆盖层打印主循环暂停状态与实际渲染帧数（frame 计数只在真正 step 时 +1）。
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
    game,
    director,
    Director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('rendering-on-demand');

// ---- 相机（斜视，保证三面受光 distinctColors>=3）----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.0, 6.4));
cameraNode.lookAt(new Vec3(0, 1.0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 立方体 ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(90, 170, 235, 255));
renderer.material = material;

// ---- 按需渲染核心 ----
let dirty = true; // 初始请求一帧，保证画布有内容
let framesRendered = 0; // 只在真正 step 时 +1
let autoMode = true; // 默认开：周期性"变脏"→ step，演示按需节奏（可点按钮关成冻结态）

const info = document.querySelector('#info') as HTMLElement;
function updateOverlay(): void {
    info.textContent = [
        'rendering on demand: game.pause() + game.step()',
        `main loop paused: ${game.isPaused()}`,
        `frames actually rendered: ${framesRendered}`,
        `auto mode: ${autoMode ? 'ON (dirty every 400ms)' : 'OFF'}`,
        'click "Render one frame" or enable Auto to draw',
    ].join('\n');
}

// dirty 驱动：只有 dirty 时才消耗一帧
setInterval(() => {
    if (!dirty) return;
    dirty = false;
    framesRendered++;
    game.step();
    updateOverlay();
}, 100);

// Auto：有节奏地"变脏"，模拟状态变化触发重绘
setInterval(() => {
    if (!autoMode) return;
    cubeNode.setRotationFromEuler(0, cubeNode.eulerAngles.y + 6, 0);
    dirty = true;
}, 400);

(document.querySelector('#btn-step') as HTMLElement).addEventListener('click', () => {
    cubeNode.setRotationFromEuler(0, cubeNode.eulerAngles.y + 15, 0);
    dirty = true;
});
const btnAuto = document.querySelector('#btn-auto') as HTMLElement;
btnAuto.textContent = autoMode ? 'Auto: ON' : 'Auto: OFF';
btnAuto.addEventListener('click', () => {
    autoMode = !autoMode;
    btnAuto.textContent = autoMode ? 'Auto: ON' : 'Auto: OFF';
    dirty = true;
});

window.__airApp = app;
app.run(scene);
// 让引擎自然绘制首帧（画布留下内容），随后停掉连续主循环，改由上面按需 step。
// 若 app.run 后同步 game.pause()，则一帧都不会绘制（EVENT_AFTER_DRAW 永不触发）。
director.once(Director.EVENT_AFTER_DRAW, () => {
    game.pause();
    updateOverlay();
});

console.log('[manual/rendering-on-demand] running on cocosair');
