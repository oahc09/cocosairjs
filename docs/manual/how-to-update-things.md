# 每帧更新（How to update Things）

> 让场景随时间变化的几种驱动方式与它们的取舍。
> 配套可运行示例：[`examples/manual-update-things/`](examples/manual-update-things/)（三颗立方体分别由 `update(dt)` / `lateUpdate(dt)` / `schedule(cb, 0.5)` 驱动，覆盖层打印 dt 统计与阶段顺序验证位）。

AIR 是游戏引擎式**常驻渲染循环**
（`app.run(scene)` 后 director 每帧推进），所以本页的问题变成：**你的逻辑挂在哪一个每帧钩子上**。

## 1. 四个钩子与一个调度器

| 钩子                                           | 位置                                   | 适用                                                                                       |
| ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `start()`                                      | 首帧 update 前一次                     | 初始化里依赖"其它组件已 onLoad"的部分                                                      |
| `update(dt)`                                   | 每帧，组件相位                         | 常规每帧逻辑；dt 单位**秒**                                                                |
| `lateUpdate(dt)`                               | 每帧，**全部 update 之后**、渲染前     | 跟随相机/读取本帧最终变换（d.ts 19926，protected 可选）                                    |
| `this.schedule(cb, interval, repeat?, delay?)` | 调度器间隔回调                         | 不需要每帧的周期任务（示例 0.5s 脉冲）；另有 `scheduleOnce(cb, delay)`（d.ts 19875/19889） |
| `director.getScheduler()`                      | 系统级 `Scheduler`（d.ts 21966/16479） | 给非组件对象挂调度；组件直接用上面的便利方法即可                                           |

组件执行优先级可配（d.ts 14994：优先级影响 `onLoad/onEnable/start/update/lateUpdate` 的组件间顺序，
不影响 `onDisable/onDestroy`）——同相位内谁先谁后默认不保证，**跨相位顺序才保证**（示例 §2 验证的就是这个）。

## 2. 示例拆解与实测读数

三颗立方体各挂一种驱动：A `update(dt)` 自转 60°/s（dt 驱动，帧率无关）；
B `lateUpdate(dt)` 正弦浮动；C `this.schedule(this.pulse, 0.5)` 每半秒切换缩放 1↔1.3。
顺序验证位：`update` 相位里置 `sawUpdateThisFrame=true`，`lateUpdate` 相位里读它并清零——
只要"全 update 先于全 lateUpdate"成立，该位必然置真。

覆盖层实测（探针 dump，t≈5s）：

```
drive: update(dt) spin | lateUpdate(dt) bob | schedule(cb, 0.5) pulse
frames: 305  dt ms: min=8.6 max=356.3 avg=18.3
ticks: update=304 lateUpdate=304 schedule=10
order update→lateUpdate verified: true
```

读数结论：

- **update 与 lateUpdate 严格 1:1**（304/304），顺序验证位 true——阶段顺序实测成立。
- **schedule 按墙钟间隔触发**：约 5s 内 10 次 ≈ 0.5s 间隔，与帧数解耦（帧率抖动不影响间隔语义）。
- **dt 有启动尖峰**（max=356.3ms 来自首帧编译/上传），稳态 min≈8.6ms——
  用 dt 积分的逻辑天然吃掉尖峰（A 的转角不因卡帧跳变），用"每帧固定增量"的写法则会丢进度；
  这是 dt 驱动 vs 帧驱动的核心取舍。

## 3. 取舍清单（何时用哪个）

- **每帧都要跑、且依赖本帧其它组件结果** → `lateUpdate`（相机跟随、HUD 读最终变换）。
- **每帧独立逻辑** → `update(dt)`；一律乘 dt，不要假设固定帧率（实测 dt 波动 8.6–356ms）。
- **周期任务（AI tick、自动保存、闪烁）** → `schedule`，别在 update 里手工累加计时器——
  调度器负责暂停/销毁时清理（组件 destroy 后其 schedule 自动失效）。
- **一次性延迟** → `scheduleOnce`，不要用 tween 的 `delay` 占位（tween 见 [动画系统](animation-system.md)）。
- **完全不需要动** → 本页反面：静态场景每帧重跑 update 是浪费；AIR 当前无"按需渲染"开关，
  见 [按需渲染](rendering-on-demand.md)（PARTIAL）。

## 4. 每帧驱动的补充说明

- `update`/`lateUpdate`/`schedule` 全部由 director 统一推进，用户代码**不碰 rAF**——
  不需要自己写 `requestAnimationFrame` 循环来驱动每帧逻辑。
- 常驻循环下想省算力，手段是**让 update 早退**
  （状态没变就 return）或关掉节点 `active`（组件 update 随之停摆，见 [销毁对象](how-to-dispose-of-objects.md) §1 的 active 语义）。
- `dt` 单位是秒；首帧尖峰明显（shader 编译在首帧内），做计时 UI 时建议前几帧丢弃或 clamp。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-update-things        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-update-things/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-update-things
```

示例目录：`docs/manual/examples/manual-update-things/`。
验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.6s，子集运行 partial；
三驱动同页保证双帧不同）；截图 `docs/evidence/examples/manual-update-things.png`
（A 转角可见、B 浮在中位、C 处于 1.3 脉冲相——右立方体明显大于另两颗，与 schedule 读数自洽）。
覆盖层探针 dump 见 §2。

## 附：示例源码（逐字）

`examples/manual-update-things/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Update Things — 每帧更新（docs/manual/how-to-update-things.md）</title>
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

`examples/manual-update-things/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — How to update Things（每帧更新）
 * 配套文章：docs/manual/how-to-update-things.md
 *
 * 三种每帧驱动同页对照：
 *  1) update(dt)：立方体 A 自转（dt 驱动，帧率无关）；
 *  2) lateUpdate(dt)：立方体 B 上下浮动（在全部 update 之后跑，覆盖层验证顺序）；
 *  3) this.schedule(cb, interval)：立方体 C 每 0.5s 脉冲缩放（调度器间隔回调，非每帧）。
 * 覆盖层打印 dt 统计（min/max/avg）、三类 tick 计数与 update→lateUpdate 顺序验证位。
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
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('update-things');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.0, 6.4));
cameraNode.lookAt(new Vec3(0, 1.1, 0));
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

// ---- 共享 mesh/material ----
const cubeMesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(65, 155, 235, 255));

function makeCube(name: string, x: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 1.0, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    renderer.material = cubeMaterial;
    return node;
}

// ---- 统计 ----
const stats = {
    frames: 0,
    dtMin: Infinity,
    dtMax: 0,
    dtSum: 0,
    updateTicks: 0,
    lateTicks: 0,
    schedTicks: 0,
    orderOk: false,
    sawUpdateThisFrame: false,
};

// ---- 1) update(dt) 自转 ----
class SpinByUpdate extends Component {
    update(dt: number): void {
        stats.updateTicks++;
        stats.sawUpdateThisFrame = true;
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }
}

// ---- 2) lateUpdate(dt) 浮动 ----
class BobByLateUpdate extends Component {
    private _t = 0;
    constructor() {
        super();
        this._t = 0;
    }
    lateUpdate(dt: number): void {
        stats.lateTicks++;
        if (stats.sawUpdateThisFrame) stats.orderOk = true;
        stats.sawUpdateThisFrame = false;
        this._t += dt;
        this.node.setPosition(new Vec3(0, 1.0 + Math.sin(this._t * 2.0) * 0.45, 0));
    }
}

// ---- 3) schedule 间隔脉冲 ----
class PulseBySchedule extends Component {
    private _big = false;
    start(): void {
        this._big = false;
        this.schedule(this.pulse, 0.5);
    }
    pulse(): void {
        stats.schedTicks++;
        this._big = !this._big;
        const s = this._big ? 1.3 : 1.0;
        this.node.setScale(new Vec3(s, s, s));
    }
}

const cubeA = makeCube('A-update', -1.8);
cubeA.addComponent(SpinByUpdate);
const cubeB = makeCube('B-lateUpdate', 0);
cubeB.addComponent(BobByLateUpdate);
const cubeC = makeCube('C-schedule', 1.8);
cubeC.addComponent(PulseBySchedule);

// ---- 覆盖层 + dt 统计 ----
const info = document.querySelector('#info') as HTMLElement;
class Overseer extends Component {
    update(dt: number): void {
        stats.frames++;
        stats.dtMin = Math.min(stats.dtMin, dt);
        stats.dtMax = Math.max(stats.dtMax, dt);
        stats.dtSum += dt;
        info.textContent = [
            'drive: update(dt) spin | lateUpdate(dt) bob | schedule(cb, 0.5) pulse',
            `frames: ${stats.frames}  dt ms: min=${(stats.dtMin * 1000).toFixed(1)} max=${(stats.dtMax * 1000).toFixed(1)} avg=${((stats.dtSum / stats.frames) * 1000).toFixed(1)}`,
            `ticks: update=${stats.updateTicks} lateUpdate=${stats.lateTicks} schedule=${stats.schedTicks}`,
            `order update→lateUpdate verified: ${stats.orderOk}`,
        ].join('\n');
    }
}
cameraNode.addComponent(Overseer);

window.__airApp = app;
app.run(scene);

console.log('[manual/update-things] running on cocosair');
```

---

上一篇：[销毁对象（How to dispose of Objects）](how-to-dispose-of-objects.md) ｜ 下一篇：[后处理（How to use Post Processing）](how-to-use-post-processing.md)

组件生命周期连续教程（onLoad/onEnable/onDisable/onDestroy 与启停、销毁再建）：[Component Lifecycle 组件生命周期](component-lifecycle.md)。
