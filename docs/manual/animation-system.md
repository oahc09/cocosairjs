# 动画系统（Animation System）

> 让物体随时间动起来。
> 配套可运行示例：[`examples/manual-animation-system/`](examples/manual-animation-system/)（一颗立方体走"右移 → 上移 → 回原点"循环序列，并行一条缩放脉冲）。

AIR 里有**两条**动画路线，本篇以 code-first 的 `tween` 为主线（零资产、最短路径），
clip 路线（`Animation` + `AnimationClip`）**同样可全代码驱动**（§2，play/stop/loop 行为断言实测）：

| 路线     | 入口                                                           | 适用                                               |
| -------- | -------------------------------------------------------------- | -------------------------------------------------- |
| 代码补间 | 顶层 `tween(target)`（d.ts 32323）返回 `Tween`（d.ts 32370）   | 程序化位移/缩放/旋转/属性序列，无需资产            |
| 剪辑播放 | `Animation` 组件 + `AnimationClip`（代码构造或 glTF 内嵌，§2） | 曲线剪辑循环/切换、骨骼动画（`SkeletalAnimation`） |

clip 路线需要构造或加载 `AnimationClip` 资产（曲线/关键帧数据），本篇示例不依赖任何外部资产，
故走 tween；两条路线**可以混用**（tween 管程序化运动，clip 管角色表演）。

## 1. Tween API 面（实测可用）

链式调用，每个方法返回 `Tween` 自身：

| 方法                                          | d.ts          | 语义                                                 |
| --------------------------------------------- | ------------- | ---------------------------------------------------- |
| `to(duration, props, opts?)`                  | 32517         | 在 duration 秒内把目标属性**插值到** props（绝对值） |
| `by(duration, props, opts?)`                  | 32531         | 插值**增量**（相对当前值）                           |
| `set(props)`                                  | 32558         | 瞬时赋值，不插值                                     |
| `delay(duration)`                             | 32568         | 空等                                                 |
| `call(cb, this?, data?)`                      | 32580         | 插入回调（示例用它打阶段标记）                       |
| `sequence(...tweens)`                         | 32590         | 子 tween 串行                                        |
| `parallel(...tweens)`                         | 32600         | 子 tween 并行                                        |
| `repeat(n)` / `repeatForever()`               | 32633 / 32644 | 重复 n 次 / 无限循环                                 |
| `start()` / `stop()` / `pause()` / `resume()` | 32457–32477   | 生命周期控制                                         |
| `union()`                                     | 32503         | 把链上动作合并为一个整体（供 repeat 整段重复）       |

`opts.easing` 接收缓动函数或 lambda（d.ts 32514 注释）。属性写法是**直接给属性名与目标值对象**
（`{ position: new Vec3(...) }`、`{ scale: new Vec3(...) }`），这是 AIR tween 唯一的属性给法，没有字符串路径形式。

**节点生命周期联动**（d.ts 32375–32377 注释，实测语义）：目标节点被 `active=false` 时 tween 自动 pause，
重新激活自动 resume，节点销毁时 tween 自动销毁——不需要手工 `stop()` 防泄漏。

## 2. 剪辑与骨骼动画路线（代码构造 Clip 实测可用）

`AnimationClip` 不只属于 glTF——**纯代码构造 + 播放/停止/循环全链路实测可用**（2026-09-25，
`manual-animation-system` 的 Orbit 球，state-probe 行为断言：位置轨迹越界 + stop 后冻结）。最小骨架
（与示例逐字节一致）：

```ts
const clip = new AnimationClip();
clip.name = 'orbit';
clip.duration = 2.0;
clip.wrapMode = AnimationClip.WrapMode.Loop;
const track = new animation.VectorTrack();
track.path = new animation.TrackPath().toProperty('position');
track.channels()[0].curve.assignSorted([
    [0, 0],
    [1, 0.9],
    [2, 0],
]); // x: 0 → 0.9 → 0
track.channels()[1].curve.assignSorted([
    [0, 0],
    [1, 0],
    [2, 0.7],
]); // y: 0 → 0 → 0.7
clip.addTrack(track);
```

```ts
const orbAnim = orbNode.addComponent(Animation);
orbAnim.defaultClip = clip;
// play 必须等组件激活后再调（app.run 前场景未激活，play 会被激活流程重置）——start() 是规范位置
class OrbStart extends Component {
    start(): void {
        orbAnim.play(clip.name);
    }
}
orbNode.addComponent(OrbStart);
```

实测坑位：`play()` 在 `app.run` 之前调用会被组件激活流程重置（画面纹丝不动）——**在组件 `start()` 里播放**。
停止用 `orbAnim.stop()`，位置冻结在停止时刻；循环用 `WrapMode.Loop`。

三条已验证的剪辑来源：

| 来源      | 入口                                                                           | 证据                                                          |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 代码构造  | `new AnimationClip()` + `animation.VectorTrack`（上文）                        | `manual-animation-system` state-probe（play/stop/loop）       |
| glTF 内嵌 | `GLTFLoader` 加载 → `Animation.play(clipName)`（`WrapMode.Loop`）              | `examples/gltf-viewer`（下拉切换剪辑、播放/暂停，浏览器矩阵） |
| 骨骼动画  | `SkeletalAnimation` 组件；程序化骨骼树 `buildSkeletonTree` + `restoreBindPose` | `examples/skinned-animation`（骨骼链驱动网格逐帧变形）        |

## 3. 示例拆解

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

    constructor() {
        super();
        this._t = 0;
    }
    update(dt: number): void {
        this._t += dt;
        info.textContent = [
            'animation: tween sequence + pulse + code-first clip (orbit, stop@6s)',
            `stage: ${stage}`,
            `elapsed: ${this._t.toFixed(1)}s`,
            'path: (0.6,1,0) → (2.2,1,0) → (2.2,2.2,0) → back, loop',
        ].join('\n');
    }
}
```

## 4. 实测读图与读数

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

## 5. 实现备忘

- **clip 路线是组件式的**：播放控制集中在 `Animation` 组件与 `AnimationState` 上
  （d.ts 30500 / 30313，`play` / `crossFade` 等见 d.ts 30500 起），引擎没有独立的 mixer 中间层。
- **代码补间内置**：顶层 `tween` 不依赖任何第三方库，且与节点生命周期联动（§1 末条）——
  目标节点失活自动 pause、激活自动 resume、销毁自动清理。
- **自动步进**：tween 由 `TweenSystem`（d.ts 32262）随 director 自动推进，用户代码不碰 dt。
- **骨骼动画**走 `SkeletalAnimation`（d.ts 31737），与 clip 路线一样需要资产，本篇不展开。

## 6. 跑示例与验证记录

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
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Animation System — 动画系统（docs/manual/animation-system.md）</title>
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

`examples/manual-animation-system/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Animation System（动画系统）
 * 配套文章：docs/manual/animation-system.md
 *
 * 用顶层导出的 tween 驱动一颗立方体走"右移 → 上移 → 回原点"循环序列（sequence + to + call），
 * 并行一条缩放脉冲（parallel 独立 tween）；覆盖层实时打印当前阶段与已跑秒数。
 * 另放一颗静态锚点立方体（斜视三面受光），使 visible-frame 判定与动画相位无关。
 * 再放一颗 Orbit 球走代码构造的 AnimationClip（VectorTrack + TrackPath，Loop 循环），
 * 6s 后 stop() 冻结——play/stop/loop 全部行为断言（__manualProbe 读回）。
 * 不依赖任何外部 clip 资产：tween 与代码构造 clip 都是 code-first 动画路径。
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
    AnimationClip,
    Animation,
    animation,
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
function showStage(name: string): void {
    stage = name;
}
class Clock extends Component {
    private _t = 0;

    constructor() {
        super();
        this._t = 0;
    }
    update(dt: number): void {
        this._t += dt;
        info.textContent = [
            'animation: tween sequence + pulse + code-first clip (orbit, stop@6s)',
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

// ---- 剪辑路线：代码构造 AnimationClip（VectorTrack + TrackPath），Loop 播放、6s 后 stop 冻结 ----
const clip = new AnimationClip();
clip.name = 'orbit';
clip.duration = 2.0;
clip.wrapMode = AnimationClip.WrapMode.Loop;
const track = new animation.VectorTrack();
track.path = new animation.TrackPath().toProperty('position');
track.channels()[0].curve.assignSorted([
    [0, 0],
    [1, 0.9],
    [2, 0],
]); // x: 0 → 0.9 → 0
track.channels()[1].curve.assignSorted([
    [0, 0],
    [1, 0],
    [2, 0.7],
]); // y: 0 → 0 → 0.7
clip.addTrack(track);

const orbNode = new Node('Orb');
orbNode.layer = Layers.Enum.DEFAULT;
orbNode.setPosition(new Vec3(-1.8, 1.0, 0));
scene.addChild(orbNode);
const orbRenderer = orbNode.addComponent(MeshRenderer);
orbRenderer.mesh = utils.createMesh(primitives.sphere({ radius: 0.28 }));
const orbMaterial = new Material();
orbMaterial.initialize({ effectName: 'builtin-standard' });
orbMaterial.setProperty('mainColor', new Color(150, 220, 120, 255));
orbRenderer.material = orbMaterial;

const orbAnim = orbNode.addComponent(Animation);
orbAnim.defaultClip = clip;
// play 必须等组件激活后再调（app.run 前场景未激活，play 会被激活流程重置）——start() 是规范位置
class OrbStart extends Component {
    start(): void {
        orbAnim.play(clip.name);
    }
}
orbNode.addComponent(OrbStart);

// ---- 行为断言：Orb 在动（位置越界）+ stop 后冻结 ----
type Check = { name: string; pass: boolean; detail: string };
const clipChecks: Check[] = [];
let orbMinX = Infinity;
let orbMaxX = -Infinity;
let stoppedAt = -1;
let frozenX = 0;
let stillMoving = false;
class ClipProbe extends Component {
    private _t = 0;
    update(dt: number): void {
        this._t += dt;
        const x = orbNode.position.x;
        if (stoppedAt < 0) {
            orbMinX = Math.min(orbMinX, x);
            orbMaxX = Math.max(orbMaxX, x);
            if (this._t >= 6) {
                orbAnim.stop();
                stoppedAt = this._t;
                frozenX = orbNode.position.x;
            }
        } else if (Math.abs(orbNode.position.x - frozenX) > 1e-4) {
            stillMoving = true;
        }
    }
}
orbNode.addComponent(ClipProbe);

window.__manualProbe = () => {
    if (stoppedAt < 0) {
        return { ready: false, ok: false, name: 'animation-system' };
    }
    if (clipChecks.length === 0) {
        clipChecks.push(
            {
                name: 'clip-orb-moved',
                pass: orbMaxX - orbMinX > 0.5,
                detail: `x range [${orbMinX.toFixed(2)}, ${orbMaxX.toFixed(2)}]`,
            },
            {
                name: 'clip-stop-froze',
                pass: !stillMoving,
                detail: `stopped at ${stoppedAt.toFixed(1)}s, frozen x=${frozenX.toFixed(2)}`,
            },
        );
    }
    return {
        ready: true,
        ok: clipChecks.every((c) => c.pass),
        name: 'animation-system',
        checks: [...clipChecks],
    };
};

window.__airApp = app;
app.run(scene);

console.log('[manual/animation-system] running on cocosair');
```

---

上一篇：[物理（Physics）](physics.md) ｜ 下一篇：[颜色管理（Color Management）](color-management.md)

## Tween 控制与组合

Gallery 的 `tween-basic` 现含 `examples/tween-basic/src/tween-contract.ts`，覆盖暂停/恢复、顺序/并行、克隆隔离、重复、反转与节点移除。使用直接的 reverseTime() 反转前一个动作；嵌入序列分支的已知终点问题及证据见 [API 场景缺口矩阵](../reference/api-scenario-gap-matrix.md)。
