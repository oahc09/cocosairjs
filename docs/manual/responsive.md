# Responsive Design 响应式设计

> Cocos AIR 把响应式这条链**内建**了：screen-adapter 在模块顶层就把 canvas 尺寸跟到窗口，相机纵横比自动跟随 canvas。你要做的只是**读**尺寸（`screen.windowSize` / `resolution` / `devicePixelRatio`）和**订阅**事件（`screen.on('window-resize' / 'canvas-resize')`），不需要任何手动 setSize / 改 aspect——窗口变化时画面拉伸或留黑边的问题在源头就不存在。
> 本篇讲清"canvas 尺寸从哪来、窗口变化时引擎做了什么、devicePixelRatio 与清晰度的关系、常见拉伸错因"。

> 前置阅读：[Creating a Scene 创建场景](./creating-a-scene.md) §1（HTML 骨架）

## 要点对照

| 关注点          | Cocos AIR                                                           | 说明                                                         |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| canvas 尺寸同步 | **无需手动 setSize**（screen-adapter 自动）                         | 不要改 canvas 的 width/height 属性，引擎会持续同步           |
| 相机纵横比      | **无需手动更新**（自动跟随 canvas）                                 | 相机投影由引擎按当前 canvas 维护                             |
| 窗口变化事件    | `screen.on('window-resize', cb)` / `screen.on('canvas-resize', cb)` | 事件源是 `screen`；`screen.off(type, cb)` 退订               |
| 设备像素比      | `screen.devicePixelRatio`（只读）                                   | 返回**已 clamp** 的 dpr（默认上限 2，见 §3），清晰度策略由引擎按它处理             |
| 渲染分辨率读数  | `canvas.width/height` + `screen.resolution`                         | `resolution` 是引擎认定的渲染分辨率（对象 `{width,height}`） |

**没有 `cc.view`**：老 Cocos 教程里的 `cc.view.setDesignResolutionSize` 一类在 AIR 不存在，视口一律走 `screen`。

## 1. canvas 尺寸从哪来

HTML 里 `#GameCanvas` 的 CSS 是 `width:100%; height:100%`（见示例 index.html），即"铺满父容器"。引擎的 screen-adapter（模块顶层单例）在 import 时读取这个布局尺寸，把 canvas 的**像素**尺寸（`canvas.width/height`）设为布局尺寸 × dpr，并在窗口变化时持续同步。所以：

- 你**不要**给 canvas 写死 `width`/`height` 属性，也不要 JS 手动改 —— 会和 adapter 打架。
- 想让画布只占页面一部分，改**父容器**（`#GameDiv` / `#Cocos3dGameContainer`）的 CSS，而不是改 canvas。

## 2. 窗口变化时引擎做了什么

`window resize` → screen-adapter 重算布局尺寸 → 更新 canvas 像素尺寸 → 触发 `screen` 的 `window-resize` / `canvas-resize` 事件 → 渲染管线按新尺寸重建渲染目标 → 相机按新纵横比投影。整条链自动跑；示例订阅事件只是为了把"当前尺寸"打到覆盖层给你看：

```js
screen.on('window-resize', () => {
    resizeCount++;
    renderInfo();
});
screen.on('canvas-resize', () => {
    resizeCount++;
    renderInfo();
});
```

## 3. devicePixelRatio 与清晰度

`screen.devicePixelRatio` 是**被引擎 clamp 过的** dpr，不是浏览器 dpr：Web adapter 返回
`Math.min(window.devicePixelRatio ?? 1, __CCDPR_CAP__ ?? 2)`，canvas 像素尺寸 = 布局尺寸 × 这个值。
所以高 dpr 屏（Retina/缩放屏/移动端 2.625 或 3）上 1 物理像素 ≠ 1 渲染像素，边缘与文字会比原生渲染糊一档——
这是引擎为填充率做的**默认性能策略**，不是 bug。注意三个量的单位别混：
`canvas.clientWidth/clientHeight` 是 **CSS 像素**；`screen.windowSize` 与 `screen.resolution` 都已经是
**物理像素**（前者 = CSS 尺寸 × 上面那个 clamp 后的 dpr；后者 = `windowSize × resolutionScale`，
Web adapter 的 `resolutionScale` 默认 1，所以**二者相等**，只有渲染离屏缩放时才分开）。

**启动链一致性（W06，GAP-W6-1 修复 2026-09-28）**：此前首帧画布缓冲只写 CSS 像素、窗口 resize 后
才乘有效 DPR——高 DPR 设备首帧实际半分辨率。现 `createAirApp` 启动即按 `CSS × 有效 DPR` 设定
（与 resize 链一致；DPR=1 数值不变）。实测（`docs/evidence/w03-capture.json` dprChain）：
DPR=2 启动缓冲 2560×1440（effectiveBufferRatio=2）。Android 真机性能/电量指标为未测条件。
做性能预算按 `windowSize`/`resolution` 算，按 CSS 尺寸算会低估像素量。

想要原生清晰度（或更低）可以在**引擎模块求值之前**设置全局开关，它同时作用于 framebuffer 尺寸、
输入坐标换算（`pal/input` 也走 `screenAdapter.devicePixelRatio`）与 `safeAreaEdge`，只有一个取值出口：

```html
<script>window.__CCDPR_CAP__ = 3;</script><!-- 必须在 import cocosair 之前 -->
```

值非法（NaN / ≤0）时回落到默认 2。把清晰度与填充率的取舍交给宿主，引擎本身不猜。

## 4. 常见拉伸错因

1. **给 canvas 写了固定 width/height 属性**：adapter 的同步被你的硬编码覆盖，窗口变大时画面被 CSS 拉伸 → 变形。删掉属性，交给 CSS 100%。
2. **改了 canvas 的 CSS 而非父容器**：canvas 的 CSS 应保持 `width:100%;height:100%`；想限尺寸去限 `#GameDiv`。
3. **自己监听 window.resize 又手动改 canvas**：与 adapter 双重驱动，尺寸抖动。只读 `screen` 事件，不写 canvas。
4. **用 CSS 尺寸（`canvas.clientWidth`）当渲染分辨率做预算/截图**：高 dpr 下会低估像素量；用 `screen.windowSize`（已是物理像素）。
5. **以为高 dpr 屏上 1 物理像素 = 1 渲染像素**：默认被 clamp 到 2×CSS，3.0 屏上会糊一档；见 §3 的 `__CCDPR_CAP__`。

## 5. 本页实测

验证器固定 640×480 视口下，覆盖层为：

```text
responsive: drag the window to resize
screen.windowSize : 640x480
screen.resolution : 640x480
devicePixelRatio  : 1
canvas pixels     : 640x480
resize events     : 0
```

**诚实标注**：验证器视口固定，`resize events: 0` 只证明事件订阅建立且初始读数正确；"拖拽窗口数字会跳、立方体不拉伸"这一交互行为需人工目验（本地 `npm run dev` 后拖窗口即可），未纳入自动化门禁。

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-responsive-design/
```

示例工程：`docs/manual/examples/manual-responsive-design/`（index.html + main.ts，零外部资产；参照 cube 故意做成 1×1.4×1 的非正方轮廓，拉伸与否一眼可辨）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-responsive-design`（`app-contract` / `visible-frame` / `no-runtime-error` PASS，3.1s；本页静止，不参与 `frame-diff`），截图 `docs/evidence/examples/manual-responsive-design.png`。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Responsive Design — 响应式设计（docs/manual/responsive.md）</title>
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

## 完整 main.ts

```ts
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
```

## API 参考

`screen.windowSize` / `screen.resolution`（均返回 `{width,height}` 对象）、`screen.devicePixelRatio`、`screen.on(type, cb)` / `screen.off(type, cb)`（type ∈ `window-resize` / `canvas-resize` / 全屏类）、`screen.supportsFullScreen` / `requestFullScreen`。**无 `cc.view`，canvas 尺寸无需手动设置**。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Setup 环境搭建](./setup.md) —— dev server、三频道 watch、构建错误横幅与静态部署。
