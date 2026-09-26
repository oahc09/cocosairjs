# 按需渲染（Rendering On Demand）

> 不跑连续动画循环，只在"有东西变了"时才出一帧，省 CPU/GPU。
> 配套可运行示例：[`examples/manual-rendering-on-demand/`](examples/manual-rendering-on-demand/)（dirty 标志 + `game.step()` 按需出帧，覆盖层打印主循环暂停状态与实际渲染帧数）。

**状态：PARTIAL。** AIR 没有 first-class 的"按需渲染模式"——`app.run(scene)` 总是启动一个连续主循环。
但可以用 `game.pause()` 停掉主循环、再用 `game.step()` 手工逐帧推进来**实现**按需渲染，实测可行（§3：`isPaused()=true` 且帧计数只在 step 时增长）。
标 PARTIAL 的原因：这是**叠在连续循环引擎上的 workaround**——`game.pause()` 的副作用不止渲染（还暂停输入派发与音频，d.ts 22474–22486），且 `game.step()` 用固定 dt 而非真实帧间隔，按需出帧要先付出 pause 的代价。

## 1. 有什么

| 成员                         | d.ts          | 说明                                                                     |
| ---------------------------- | ------------- | ------------------------------------------------------------------------ |
| `game.step()`                | 22472         | 以固定帧间隔（匹配设定帧率）执行**一帧**游戏循环——按需渲染的核心         |
| `game.pause()`               | 22488         | 暂停主循环：逻辑 + 渲染 + 输入派发（Web/小游戏平台输入除外）             |
| `game.resume()`              | 22494         | 恢复主循环（逻辑、渲染、事件、音频）                                     |
| `game.isPaused()`            | 22499         | 主循环是否暂停                                                           |
| `game.frameRate`             | 22383–22384   | 设定帧率；`step()` 的固定 dt 由它决定                                    |
| `director.pause()`           | 21847         | **只**暂停游戏逻辑，**不**暂停渲染——做按需渲染要用 `game.pause()` 而非它 |
| `director.resume()`          | 21921         | 恢复逻辑执行                                                             |
| `Director.EVENT_AFTER_DRAW`  | 21781         | 每帧绘制完成事件；用于"首帧落地后再 pause"（§3 的坑）                    |
| `game` / `director` 顶层导出 | 22618 / 22054 | 直接 `import { game, director, Director } from 'cocosair'`               |

## 2. 模式：dirty 标志 + step

核心是一个 dirty 标志：只有"变脏"时才消耗一帧。示例用一个 100ms 的轮询把 dirty 翻译成一次 `game.step()`：

```js
// dirty 驱动：只有 dirty 时才消耗一帧
setInterval(() => {
    if (!dirty) return;
    dirty = false;
    framesRendered++;
    game.step();
    updateOverlay();
}, 100);
```

"变脏"的来源可以是交互（按钮点击转 15° 后 `dirty = true`），也可以是一个节奏源模拟状态变化：

```js
// Auto：有节奏地"变脏"，模拟状态变化触发重绘
setInterval(() => {
    if (!autoMode) return;
    cubeNode.setRotationFromEuler(0, cubeNode.eulerAngles.y + 6, 0);
    dirty = true;
}, 400);
```

停主循环的时机很关键——不能 `app.run` 后同步 pause，要等首帧自然绘制完再停：

```js
// 让引擎自然绘制首帧（画布留下内容），随后停掉连续主循环，改由上面按需 step。
// 若 app.run 后同步 game.pause()，则一帧都不会绘制（EVENT_AFTER_DRAW 永不触发）。
director.once(Director.EVENT_AFTER_DRAW, () => {
    game.pause();
    updateOverlay();
});
```

## 3. 实测读图与读数

示例验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（4.3s，子集 partial；Auto 节奏下立方体逐帧转 6°）。
截图 `docs/evidence/examples/manual-rendering-on-demand.png`（蓝色立方体三面受光可见）。

覆盖层实测（探针 dump，t≈1.2s）：

```
rendering on demand: game.pause() + game.step()
main loop paused: true
frames actually rendered: 3
auto mode: ON (dirty every 400ms)
click "Render one frame" or enable Auto to draw
```

`main loop paused: true` 证明主循环确实停了；`frames actually rendered: 3` 在约 1.2s 内只增长到 3，与 400ms 的 dirty 节奏吻合——**帧不是引擎自动出的，是我们 step 出来的**。关掉 Auto 后画布冻结在最后一帧，不再消耗任何渲染。

**首帧坑（开发期实测）**：`app.run(scene)` 后**同步**调 `game.pause()`，则一帧都不会绘制，`Director.EVENT_AFTER_DRAW` 永不触发——
验证器的 app-contract 正是等这个事件（`tools/verify/manual-examples-verify.cjs:118–122`），首版因此 `runner=FAIL: no rendered frame within 10s`。
解法即 §2 的 `director.once(EVENT_AFTER_DRAW, …)`：先让一帧落地，再切按需。

## 4. 行为边界备忘

- AIR 的 `app.run` 必然启动连续循环，按需渲染必须**先 pause 再 step**；而 `game.pause()` 连带暂停输入派发（Web/小游戏平台除外）与音频（d.ts 22474–22486），副作用不止渲染这一项。
- dt 语义：`game.step()` 用**固定** dt（匹配 `game.frameRate`），所以按需模式下动画速度由 step 次数决定、与墙钟解耦。
- `director.pause()`（只停逻辑、不停渲染）与 `game.pause()`（全停）要分清：做按需渲染必须用后者，否则渲染仍在空转。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-rendering-on-demand        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-rendering-on-demand/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-rendering-on-demand
```

示例目录：`docs/manual/examples/manual-rendering-on-demand/`。
验证器 4/4 全 PASS（4.3s，子集 partial）；截图 `docs/evidence/examples/manual-rendering-on-demand.png`；覆盖层探针 dump 见 §3。

## 附：示例源码（逐字）

`examples/manual-rendering-on-demand/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Rendering On Demand — 按需渲染（docs/manual/rendering-on-demand.md）</title>
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
            #ui {
                position: absolute;
                left: 8px;
                bottom: 8px;
                z-index: 10;
                font:
                    12px/1.4 ui-monospace,
                    Consolas,
                    monospace;
            }
            #ui button {
                margin-right: 6px;
                padding: 4px 10px;
                cursor: pointer;
                font: inherit;
                color: #0b1018;
                background: #d7e3f2;
                border: 1px solid #8fa4bd;
                border-radius: 4px;
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
        <div id="ui">
            <button id="btn-step" type="button">Render one frame</button>
            <button id="btn-auto" type="button">Auto: OFF</button>
        </div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-rendering-on-demand/main.ts`：

```ts
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
```

---

上一篇：[矩阵变换（Matrix Transformations）](matrix-transformations.md) ｜ 下一篇：[调试 JavaScript（Debugging JavaScript）](debugging-javascript.md)
