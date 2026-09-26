/**
 * Cocos AIR 开发手册 — Responsive Design（响应式设计）
 * 配套文章：docs/manual/responsive.md
 *
 * 窗口任意缩放时 canvas 铺满且画面不变形。AIR 的自适应模型：
 *   - screen-adapter 自动把 canvas 尺寸跟到窗口，相机纵横比自动跟随，
 *     你**不需要**手动 setSize / 改 aspect / 重算投影矩阵。
 * 本页做两件事：
 *   1. 覆盖层实时显示 screen.windowSize / screen.resolution / devicePixelRatio / canvas 实际像素；
 *   2. 订阅 screen.on('window-resize' / 'canvas-resize')，尺寸变化时刷新覆盖层，
 *      证明事件链路是通的（引擎内部也靠它驱动自适应）。
 * 拖拽浏览器窗口改变大小，覆盖层数字应随之更新，且立方体不被拉伸。
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
    screen,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('responsive');

// ---- 相机（纵横比由引擎按 canvas 自动维护，无需手动 aspect） ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 2.2, 4.2));
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

// ---- 地面 + 参照 cube（cube 非正方形轮廓，拉伸与否一眼可辨） ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

const cubeNode = new Node('Reference Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.6, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1.4, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(230, 130, 50, 255));
cubeRenderer.material = cubeMaterial;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：实时尺寸 + resize 事件订阅 ============
let resizeCount = 0;
function renderInfo(): void {
    const ws = screen.windowSize || { width: -1, height: -1 };
    const res = screen.resolution || { width: -1, height: -1 };
    (document.querySelector('#info') as HTMLElement).textContent = [
        'responsive: drag the window to resize',
        `screen.windowSize : ${ws.width}x${ws.height}`,
        `screen.resolution : ${res.width}x${res.height}`,
        `devicePixelRatio  : ${screen.devicePixelRatio}`,
        `canvas pixels     : ${canvas.width}x${canvas.height}`,
        `resize events     : ${resizeCount}`,
    ].join('\n');
}
renderInfo();

screen.on('window-resize', () => {
    resizeCount++;
    renderInfo();
});
screen.on('canvas-resize', () => {
    resizeCount++;
    renderInfo();
});

console.log('[manual/responsive] running on cocosair');
