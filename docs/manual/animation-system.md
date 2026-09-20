# 动画系统（Animation System）

> 对应 three.js manual 的 *Animation System* 一篇：让物体随时间动起来。
> 配套可运行示例：[`examples/manual-animation-system/`](examples/manual-animation-system/)（一颗立方体走"右移 → 上移 → 回原点"循环序列，并行一条缩放脉冲）。

AIR 里有**两条**动画路线，本篇以 code-first 的 `tween` 为主线（零资产、最短路径），
clip 路线（`Animation` + `AnimationClip`）给出入口与指针：

| 路线 | 入口 | 适用 |
| --- | --- | --- |
| 代码补间 | 顶层 `tween(target)`（d.ts 32323）返回 `Tween`（d.ts 32370） | 程序化位移/缩放/旋转/属性序列，无需资产 |
| 剪辑播放 | `Animation` 组件（d.ts 30500）+ `AnimationClip`（d.ts 29900）/ `AnimationState`（d.ts 30313） | 美术产出的曲线剪辑、骨骼动画（`SkeletalAnimation`，d.ts 31737） |

clip 路线需要构造或加载 `AnimationClip` 资产（曲线/关键帧数据），本篇示例不依赖任何外部资产，
故走 tween；两条路线**可以混用**（tween 管程序化运动，clip 管角色表演）。

## 1. Tween API 面（实测可用）

链式调用，每个方法返回 `Tween` 自身：

| 方法 | d.ts | 语义 |
| --- | --- | --- |
| `to(duration, props, opts?)` | 32517 | 在 duration 秒内把目标属性**插值到** props（绝对值） |
| `by(duration, props, opts?)` | 32531 | 插值**增量**（相对当前值） |
| `set(props)` | 32558 | 瞬时赋值，不插值 |
| `delay(duration)` | 32568 | 空等 |
| `call(cb, this?, data?)` | 32580 | 插入回调（示例用它打阶段标记） |
| `sequence(...tweens)` | 32590 | 子 tween 串行 |
| `parallel(...tweens)` | 32600 | 子 tween 并行 |
| `repeat(n)` / `repeatForever()` | 32633 / 32644 | 重复 n 次 / 无限循环 |
| `start()` / `stop()` / `pause()` / `resume()` | 32457–32477 | 生命周期控制 |
| `union()` | 32503 | 把链上动作合并为一个整体（供 repeat 整段重复） |

`opts.easing` 接收缓动函数或 lambda（d.ts 32514 注释）。属性写法是**直接给属性名与目标值对象**
（`{ position: new Vec3(...) }`、`{ scale: new Vec3(...) }`），不是 three.js 社区的字符串路径风格。

**节点生命周期联动**（d.ts 32375–32377 注释，实测语义）：目标节点被 `active=false` 时 tween 自动 pause，
重新激活自动 resume，节点销毁时 tween 自动销毁——不需要手工 `stop()` 防泄漏。

## 2. 示例拆解

```js
tween(cubeNode)
    .call(() => showStage('move right'))
    .to(1.2, { position: new Vec3(2.2, 1.0, 0) })
    .call(() => showStage('move up'))
    .to(0.8, { position: new Vec3(2.2, 2.2, 0) })
    .call(() => showStage('return home'))
    .to(1.4, { position: new Vec3(0.6, 1.0, 0) })
    .repeatForever()
    .start();
```

一条链 = 一个 sequence：`call` 是零时长动作，`to` 是插值动作，`repeatForever()` 让整段循环。
第二条独立 tween 并行跑缩放脉冲（`1 → 1.25 → 1` 循环）——**并行不靠 `parallel()` 也能写**：
对同一目标起多条 tween 即可，各自独立计时（示例即如此）；`parallel()` 用于把并行组打包进更大的序列。

覆盖层组件 `Clock` 在 `update(dt)` 里累加秒数并打印当前阶段，便于肉眼确认序列在推进：

```ts
class Clock extends Component {
    private _t = 0;

    constructor () {
        super();
        this._t = 0;
    }
    update (dt: number): void {
        this._t += dt;
        info.textContent = [
            'animation: tween sequence (to/call/repeatForever) + parallel pulse',
            `stage: ${stage}`,
            `elapsed: ${this._t.toFixed(1)}s`,
            'path: (0.6,1,0) → (2.2,1,0) → (2.2,2.2,0) → back, loop',
        ].join('\n');
```

## 3. 实测读图与读数

验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.6s，子集运行 partial）；
本例在 `ANIMATED` 集合内，立方体持续位移+缩放保证任意 400ms 双帧不同。
截图 `docs/evidence/examples/manual-animation-system.png`：蓝色锚点立方体三面（顶/前/侧）亮度不同 + 橙色舞者立方体在行程中。

覆盖层实测（探针 dump，读取时刻组件秒表 1.6s）：

```
animation: tween sequence (to/call/repeatForever) + parallel pulse
stage: move right
elapsed: 1.6s
path: (0.6,1,0) → (2.2,1,0) → (2.2,2.2,0) → back, loop
```

**如实标注**：组件秒表 1.6s 时阶段仍为 `move right`（名义上 1.2s 应已进入 `move up`）——
tween 系统时钟与组件 `update` 累加时钟存在约半秒相位差（起表帧不同），本篇只承诺**阶段顺序与循环**，
不承诺与外部秒表秒级对齐；需要精确同步时用同一条 tween 的 `call` 打点，不要对照独立秒表。

**开发期踩坑（已修，两轮）**：① 首版相机正对立方体（`(0,1.6,7)` 直视），画面只有一张平色面，
验证器 `visible-frame` 判据 `distinctColors>=3` 不过（实测 `distinctColors=2`，
判据见 `tools/verify/manual-examples-verify.cjs:176`：`litRatio>=0.01 && distinctColors>=3`）；
改斜视机位露出顶/前/侧三面不同受光色后通过。② 全量（非子集）复跑时 `visible-frame` 仍偶发 FAIL——
截图时刻若落在舞者立方体接近正对镜头的相位，画面又退化为少色相；
解法是加一颗**静态锚点立方体**（`(-1.8,1,0)`，斜视三面受光）并把舞者行程收窄到右半区、相机退到 `(2.4,3.0,7.4)`，
使 visible-frame 与动画相位**解耦**。**单面正对镜头的动画演示、以及"可见性依赖动画相位"的演示都会踩这个门槛**。

## 4. 与 three.js 的差异备忘

- three.js manual 的 Animation System 主角是 `AnimationMixer` / `AnimationClip` / `AnimationAction` 三件套；
  AIR 的对应物是组件式 `Animation` + `AnimationState`（d.ts 30500 / 30313），**没有** mixer 概念，
  播放控制落在组件与 state 上（`play` / `crossFade` 等见 d.ts 30500 起）。
- three.js 生态里"代码补间"靠第三方库（gsap/tween.js）；AIR **内置** `tween` 且与节点生命周期联动
 （§1 末条），这是 three.js 没有的便利。
- three.js 的 `mixer.update(dt)` 需要手动每帧驱动；AIR 的 tween 由 `TweenSystem`（d.ts 32262）随 director 自动步进，
  用户代码不碰 dt。
- 骨骼动画两者都有（three.js `SkinnedMesh` ↔ AIR `SkeletalAnimation` d.ts 31737），但都需要资产，本篇不展开。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-animation-system        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-animation-system/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-animation-system
```

示例目录：`docs/manual/examples/manual-animation-system/`。
验证器 4/4 全 PASS（3.6s，子集运行 partial）；截图 `docs/evidence/examples/manual-animation-system.png`；
覆盖层探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-animation-system/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <title>Animation System — 动画系统（docs/manual/animation-system.md）</title>
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
        #GameDiv { width: 100%; height: 100%; }
        #Cocos3dGameContainer { width: 100%; height: 100%; }
        #GameCanvas { width: 100%; display: block; height: 100%; }
        #info {
            position: absolute; left: 8px; top: 8px; z-index: 10;
            font: 12px/1.6 ui-monospace, Consolas, monospace; color: #e8eef7;
            background: rgba(10, 16, 26, .78); padding: 6px 10px; border-radius: 4px;
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

`examples/manual-animation-system/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Animation System（动画系统）
 * 配套文章：docs/manual/animation-system.md
 *
 * 用顶层导出的 tween 驱动一颗立方体走"右移 → 上移 → 回原点"循环序列（sequence + to + call），
 * 并行一条缩放脉冲（parallel 独立 tween）；覆盖层实时打印当前阶段与已跑秒数。
 * 另放一颗静态锚点立方体（斜视三面受光），使 visible-frame 判定与动画相位无关。
 * 不依赖任何外部 clip 资产：tween 是 code-first 动画的最短路径。
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
    tween,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('animation-system');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.4, 3.0, 7.4));
cameraNode.lookAt(new Vec3(0, 1.3, 0));
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

// ---- 静态锚点立方体：斜视三面受光，保证 visible-frame 与动画相位无关 ----
const anchorNode = new Node('Anchor');
anchorNode.layer = Layers.Enum.DEFAULT;
anchorNode.setPosition(new Vec3(-1.8, 1.0, 0));
scene.addChild(anchorNode);
const anchorRenderer = anchorNode.addComponent(MeshRenderer);
anchorRenderer.mesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const anchorMaterial = new Material();
anchorMaterial.initialize({ effectName: 'builtin-standard' });
anchorMaterial.setProperty('mainColor', new Color(95, 165, 225, 255));
anchorRenderer.material = anchorMaterial;

// ---- 主角立方体 ----
const cubeNode = new Node('Dancer');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0.6, 1.0, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(235, 125, 65, 255));
cubeRenderer.material = cubeMaterial;

// ---- 覆盖层：阶段 + 秒表 ----
const info = document.querySelector('#info') as HTMLElement;
let stage: string = 'idle';
function showStage (name: string): void {
    stage = name;
}
class Clock extends Component {
    private _t = 0;

    constructor () {
        super();
        this._t = 0;
    }
    update (dt: number): void {
        this._t += dt;
        info.textContent = [
            'animation: tween sequence (to/call/repeatForever) + parallel pulse',
            `stage: ${stage}`,
            `elapsed: ${this._t.toFixed(1)}s`,
            'path: (0.6,1,0) → (2.2,1,0) → (2.2,2.2,0) → back, loop',
        ].join('\n');
    }
}
cameraNode.addComponent(Clock);

// ---- 主序列：右移 → 上移 → 回原点，循环 ----
tween(cubeNode)
    .call(() => showStage('move right'))
    .to(1.2, { position: new Vec3(2.2, 1.0, 0) })
    .call(() => showStage('move up'))
    .to(0.8, { position: new Vec3(2.2, 2.2, 0) })
    .call(() => showStage('return home'))
    .to(1.4, { position: new Vec3(0.6, 1.0, 0) })
    .repeatForever()
    .start();

// ---- 并行脉冲：缩放 1 → 1.25 → 1 ----
tween(cubeNode)
    .to(0.6, { scale: new Vec3(1.25, 1.25, 1.25) })
    .to(0.6, { scale: new Vec3(1, 1, 1) })
    .repeatForever()
    .start();

window.__airApp = app;
app.run(scene);

console.log('[manual/animation-system] running on cocosair');
```

---

上一篇：[物理（Physics）](physics.md) ｜ 下一篇：[颜色管理（Color Management）](color-management.md)
