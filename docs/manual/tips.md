# 技巧合集（Tips）

> 话题：截图、阻止清屏、画布键盘输入、画布透明、作为 HTML 背景——五个短条目，
> 按 index.md 的归并约定收进本篇。
> 其中"画布键盘输入"为 FULL 并配可运行示例 [`examples/manual-tips-keyboard/`](examples/manual-tips-keyboard/)；其余 4 个为 PARTIAL（诚实说明边界，不配示例）。

## Taking a screenshot 截图

**PARTIAL。** AIR 的 d.ts 里 grep `toDataURL|preserveDrawingBuffer` **零命中**——引擎不暴露截图 API，也不暴露 WebGL 上下文的 preserveDrawingBuffer 开关；
WebGL 默认 `preserveDrawingBuffer=false`，在绘制回调之外调 `canvas.toDataURL()` 通常得到空白帧。

本仓库实际可行的截图路是**外部抓帧**：验证器用 Playwright 对页面做 canvas-only 截图，落到 `docs/evidence/examples/<id>.png`
（见 [验证工具](../../tools/verify/manual-examples-verify.cjs)）。要在应用内截图，升级条件是 AIR 暴露 readback/截图 API 或允许配置 preserveDrawingBuffer。

## Prevent the Canvas Being Cleared 阻止画布被清除

**PARTIAL。** "保留上一帧做拖尾/累积"这类需求，AIR 的入口是每相机的清屏标志：`camera.clearFlags` 可取 `Camera.ClearFlag.SOLID_COLOR`（默认，全清）/ `DEPTH_ONLY`（只清深度模板）/ `DONT_CLEAR`（不清颜色，module.js 43870–43873）。
设 `camera.clearFlags = Camera.ClearFlag.DONT_CLEAR` 即"不清颜色缓冲"。

标 PARTIAL 的原因：AIR 主循环是连续渲染，`DONT_CLEAR` 在每帧重绘同一批几何体时不会产生拖尾/累积效果（几何体原地重画），
且该组合在本仓库**未做像素级取证**；它只是把"清屏"这个开关如实指出，不承诺累积效果。

## Get Keyboard Input From a Canvas 从画布获取键盘输入

**FULL。** AIR 的键盘事件走 **window 级 `input` 单例**，与 canvas 聚焦无关，**不需要给 canvas 加 tabindex/做聚焦技巧**：

```js
input.on(SystemEventType.KEY_DOWN, (e) => {
    pressed.add(e.keyCode);
    lastKey = KEY_NAMES.get(e.keyCode) || String(e.keyCode);
});
input.on(SystemEventType.KEY_UP, (e) => {
    pressed.delete(e.keyCode);
});
```

维护一个 `pressed` 集合、在组件 `update` 里按集合平移/旋转，是"按住持续生效"的标准写法（事件只给边沿，集合给状态）：

```js
if (pressed.has(KeyCode.KEY_A) || pressed.has(KeyCode.ARROW_LEFT)) dx -= 1;
```

键码用 `KeyCode` 枚举（`KEY_W=87` / `SPACE=32` / `ARROW_UP=38` 等，d.ts 27626 起）；事件对象 `EventKeyboard.keyCode`（d.ts 27160）；
事件类型 `SystemEventType.KEY_DOWN/KEY_UP`（d.ts 26796/26801）；`input` 为顶层导出（d.ts 28294）。

示例验证器 4/4 全 PASS（3.8s，子集 partial；空闲自转 20°/s 保证 frame-diff）。截图 `docs/evidence/examples/manual-tips-keyboard.png`（绿立方体三面受光）。
覆盖层实测（探针 dump，无按键空闲态）：`last key: (none)` / `pressed: (none)` / `cube: (0.00, 1.00, 0.00)`。
**按键驱动的平移属交互行为，自动验证只覆盖到空闲自转与读回结构**——浏览器里按 WASD/方向键可眼见立方体移动（如实标注）。

## Make the Canvas Transparent 让画布透明

**PARTIAL。** AIR 的透明画布开关是 `macro.ENABLE_TRANSPARENT_CANVAS`（d.ts 16275，`macro` 顶层导出 16151），文档明确**必须在 `game.init` 之前**设为 true（d.ts 16267），再配合 `camera.clearColor` 的 alpha=0。

标 PARTIAL 的原因：标准入口 `createAirApp({ canvas })` 内部已完成 init，用户代码拿到 app 时**已错过 pre-init 窗口**；
本仓库没有暴露"在 init 前插一脚"的钩子，因此透明画布在现有入口下**无法可靠达成**，只如实记录开关与前置条件。

## Use as Background in HTML 作为 HTML 背景

**PARTIAL。** 通用做法是 CSS 把 canvas 固定定位、`z-index:-1` 垫在内容后，配合透明画布。
AIR 侧的 CSS 定位部分完全可行（canvas 就是普通 DOM 元素，`position:fixed; z-index:-1` 即可垫底）；
但"看到背后 DOM"依赖**画布透明**，即上一锚点的 `macro.ENABLE_TRANSPARENT_CANVAS` pre-init 限制——因此本锚点继承 PARTIAL。

若只需"内容浮在不透明 3D 场景之上"（不要求透出背后 DOM），则无此限制：正常渲染 + 把 HTML 内容绝对定位叠在 canvas 上层即可（本手册各示例的 `#info` 覆盖层就是该姿势）。

---

上一篇：[调试 GLSL（Debugging GLSL）](debugging-glsl.md) ｜ 下一篇：[优化大量物体（Optimize lots of objects）](optimize-lots-of-objects.md)

## 附：示例源码（逐字）

`examples/manual-tips-keyboard/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Get Keyboard Input From a Canvas — 画布键盘输入（docs/manual/tips.md）</title>
        <style>
            html,
            body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #fff;
            }
            #GameDiv {
                width: 100%;
                height: 100%;
            }
            #Cocos3dGameContainer {
                width: 100%;
                height: 100%;
            }
            #GameCanvas {
                width: 100%;
                display: block;
                height: 100%;
            }
            #info {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                font:
                    12px/1.6 ui-monospace,
                    Consolas,
                    monospace;
                color: #e8eef7;
                background: rgba(10, 16, 26, 0.78);
                padding: 6px 10px;
                border-radius: 4px;
                white-space: pre;
            }
        </style>
        <script type="importmap">
            { "imports": { "cocosair": "/build/cocosair.module.js" } }
        </script>
    </head>
    <body>
        <!-- 官方模板 DOM 结构：pal/screen-adapter 依赖这些 id 做全屏适配 -->
        <div id="GameDiv">
            <div id="Cocos3dGameContainer">
                <!-- #GameCanvas 必须在引擎 import 前存在（pal/screen-adapter 为模块顶层单例） -->
                <canvas id="GameCanvas"></canvas>
            </div>
        </div>
        <div id="info">loading…</div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-tips-keyboard/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Tips / Get Keyboard Input From a Canvas（画布键盘输入）
 * 配套文章：docs/manual/tips.md#get-keyboard-input-from-a-canvas-从画布获取键盘输入
 *
 * AIR 的键盘事件走 window 级 input 单例（input.on(SystemEventType.KEY_DOWN/KEY_UP)），
 * 不需要给 canvas 加 tabindex/聚焦——事件来自全局 input 单例，与页面焦点在哪无关，
 * 任意时刻按下都会被收到。
 * 本例维护一个 pressed 集合：WASD/方向键平移立方体、Space 加速自转，覆盖层实时回显；
 * 无按键时立方体仍空闲自转 20°/s，保证 frame-diff 有帧间差异。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
    input,
    SystemEventType,
    KeyCode,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('tips-keyboard');

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
material.setProperty('mainColor', new Color(120, 205, 150, 255));
renderer.material = material;

// ---- 键盘输入 ----
const KEY_NAMES = new Map<KeyCode, string>([
    [KeyCode.KEY_W, 'W'],
    [KeyCode.KEY_A, 'A'],
    [KeyCode.KEY_S, 'S'],
    [KeyCode.KEY_D, 'D'],
    [KeyCode.ARROW_UP, 'ArrowUp'],
    [KeyCode.ARROW_DOWN, 'ArrowDown'],
    [KeyCode.ARROW_LEFT, 'ArrowLeft'],
    [KeyCode.ARROW_RIGHT, 'ArrowRight'],
    [KeyCode.SPACE, 'Space'],
]);
const pressed = new Set<KeyCode>();
let lastKey = '(none)';

input.on(SystemEventType.KEY_DOWN, (e) => {
    pressed.add(e.keyCode);
    lastKey = KEY_NAMES.get(e.keyCode) || String(e.keyCode);
});
input.on(SystemEventType.KEY_UP, (e) => {
    pressed.delete(e.keyCode);
});

const info = document.querySelector('#info') as HTMLElement;
class KeyboardMover extends Component {
    update(dt: number): void {
        let dx = 0;
        let dz = 0;
        if (pressed.has(KeyCode.KEY_A) || pressed.has(KeyCode.ARROW_LEFT)) dx -= 1;
        if (pressed.has(KeyCode.KEY_D) || pressed.has(KeyCode.ARROW_RIGHT)) dx += 1;
        if (pressed.has(KeyCode.KEY_W) || pressed.has(KeyCode.ARROW_UP)) dz -= 1;
        if (pressed.has(KeyCode.KEY_S) || pressed.has(KeyCode.ARROW_DOWN)) dz += 1;
        const p = this.node.position;
        this.node.setPosition(p.x + dx * dt * 2, p.y, p.z + dz * dt * 2);
        // 空闲自转保证无按键时也有帧间差异（frame-diff）；Space 叠加更快自转
        const spin = pressed.has(KeyCode.SPACE) ? 90 : 20;
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * spin, 0);
        const names = [...pressed].map((k) => KEY_NAMES.get(k) || k).join(',');
        info.textContent = [
            'keyboard: WASD / arrows move, Space spins faster',
            `last key: ${lastKey}`,
            `pressed: ${names || '(none)'}`,
            `cube: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`,
        ].join('\n');
    }
}
cubeNode.addComponent(KeyboardMover);

window.__airApp = app;
app.run(scene);

console.log('[manual/tips-keyboard] running on cocosair');
```
