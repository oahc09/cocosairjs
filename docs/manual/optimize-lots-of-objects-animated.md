# Optimizing Lots of Objects Animated（优化大量动画对象）

> 对象又多又每帧在动时怎么组织。
> 配套可运行示例：[`examples/manual-lots-animated/`](examples/manual-lots-animated/)（20×20=400 颗立方体正弦波场，单个管理组件集中写变换，覆盖层实测逻辑耗时）。

大量动态对象的常规解是 instancing（一次 draw 承载数千实例，每帧写实例矩阵再标脏提交），
AIR 已有 `MeshRenderer` + material `USE_INSTANCING` 原生入口，内部 InstancedBuffer 负责分组；
当前没有Three风格的InstancedMesh对象，不应由此认定GPU instancing不存在。
本篇的历史实验采用 **共享资源 + 数据化布局 + 单个管理组件**；
动态网格和实例化的独立像素/draw对照见 [批处理Recipe](batching-recipes.md)。

| 需求                  | AIR 实测                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| N 个动态对象一次 draw | 原生instancing可用；须匹配mesh/material/pass及实例属性，容量等条件会拆批           |
| 每帧逻辑成本收敛      | 单 Component + `Float32Array`，实测 **0.04 ms/frame @400**（§3）                   |
| 提交侧优化            | 本篇只共享mesh/material；可另读device.numDrawCalls，旧实验未采该指标               |
| 其中静态子集          | `BatchingUtility`（[上一篇](optimize-lots-of-objects.md)）；在动的对象不能静态合批 |

## 1. 数据化布局：一个组件管 400 个变换

反模式是给每颗立方体挂一个组件、各自在 `update` 里算自己的波——400 份组件调度与 400 份闭包状态。
本例把状态拍平进三个 `Float32Array`（基准 x/z + 相位），节点引用收进一个数组，
由挂在相机节点上的**单个** `WaveField` 组件集中写：

```ts
const baseX = new Float32Array(GRID * GRID);
const baseZ = new Float32Array(GRID * GRID);
const phase = new Float32Array(GRID * GRID);
for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
        const i = ix * GRID + iz;
        const x = (ix - (GRID - 1) / 2) * SPACING;
        const z = (iz - (GRID - 1) / 2) * SPACING;
        baseX[i] = x;
        baseZ[i] = z;
        phase[i] = Math.sqrt(x * x + z * z) * 0.9;
        const cubeNode = new Node(`Cube-${i}`);
        cubeNode.layer = Layers.Enum.DEFAULT;
        cubeNode.setPosition(new Vec3(x, 0.5, z));
        grid.addChild(cubeNode);
        const renderer = cubeNode.addComponent(MeshRenderer);
        renderer.mesh = sharedMesh;
        renderer.material = sharedMaterial;
        cubes.push(cubeNode);
    }
}
```

相位取"到中心的距离 × 0.9"，于是同半径同相位——画面自然是同心涟漪，读图一眼能确认波场在推进。
每帧循环里**不new任何对象**（`this._v` 是构造期分配的复用 Vec3）：

```js
        const t0 = performance.now();
        this._t += dt;
        this._frames++;
        for (let i = 0; i < cubes.length; i++) {
            const y = 0.6 + Math.sin(this._t * 2.0 - phase[i]) * 0.55;
            this._v.set(baseX[i], y, baseZ[i]);
            cubes[i].setPosition(this._v);
        }
        const ms = performance.now() - t0;
        this._emaMs = this._emaMs === 0 ? ms : this._emaMs * 0.9 + ms * 0.1;
```

`performance.now()` 差值做指数移动平均打进覆盖层——**逻辑侧成本自己测自己**，不靠引擎统计。

**如实标注**：0.04 ms/frame 只证明"每帧逻辑"收敛到可忽略；400 个渲染组件的**提交侧**成本
旧实验未量化，本篇不承诺该实验的提交侧数字。当前device有draw/instance/triangle统计，
该统计不等于GPU耗时。也没做"每立方体组件 vs 单管理器"对照实验（那需要第二个示例页），
只给单管理器方案的实测绝对值。

## 2. 与静态合批的分工

- **能预计算的动作**（循环序列、表演）→ 剪辑/tween 路线（[animation-system](animation-system.md)），
  或干脆烘成静态后合批（[上一篇](optimize-lots-of-objects.md)）。
- **每帧程序化运动**（波场、群集、跟随）→ 本篇的管理器模式：状态在 TypedArray，逻辑在一个循环。
- 两者不冲突：波场里若有一片"底座"永远不动，那片可以 `batchStaticModel` 合掉，动的部分走管理器。

## 3. 实测读图与读数

验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.9s，子集运行 partial；
波场逐帧起伏即 frame-diff 的运动来源）。截图 `docs/evidence/examples/manual-lots-animated.png`：
同心涟漪波场、斜俯视角，波峰波谷立方体高差清晰；中等亮度色调（与本组其他截图同族）。

覆盖层实测（探针 dump，读取时刻 t=2.0s）：

```
cubes: 400 (20×20 wave field, shared mesh+material)
manager: 1 component + Float32Array (no per-cube component)
update cost: 0.04 ms/frame (ema), frames: 86, t=2.0s
AIR: no user InstancedMesh → data-driven single manager
```

运动对账（探针间隔 400ms 读 `cubes[0].position.y`）：`0.952 → 0.543`，波场确在推进而非静止截图态。

**读图设计约束**（非踩坑复盘，是选参依据）：波场类示例要涟漪分明，需"边长 < 间距"
（本例 0.8 < 1.1，波谷不穿插）且波幅取间距一半（本例 0.55：峰谷差 1.1 恰为一个间距，邻峰邻谷不叠死）。

## 4. 能力边界与原则备忘

- AIR 无用户面 instancing，实例化绘制特有的坑（包围球不自动更新要 `computeBoundingSphere()`、
  `frustumCulled` 误剔）在这里不存在；对应地，**动态对象数量的上限也低一个量级**——
  400 颗已在本环境 headless 验证器下顺畅跑通，再往上提交侧会成为瓶颈且无法实测定位，本篇不承诺上限数字。
- "大量动态对象"还有 GPU 粒子/变换纹理等路线；AIR 无用户面 GLSL 与变换纹理入口
  （见 [debugging-glsl](debugging-glsl.md) 的 N/A 结论），不展开。
- 通用原则：循环内零分配、状态数据化、逻辑与提交分离。本篇 §1 的 TypedArray + 复用 Vec3
  即该原则在 AIR 的最小形态。
- AIR 独有便利：节点生命周期与组件调度由引擎托管，管理器组件随节点销毁自动停摆，
  无需手工 dispose 实例属性。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-lots-animated        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-lots-animated/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-lots-animated
```

示例目录：`docs/manual/examples/manual-lots-animated/`。
验证器 4/4 全 PASS（3.9s，子集运行 partial）；截图 `docs/evidence/examples/manual-lots-animated.png`；
覆盖层与运动探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-lots-animated/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>
            Optimizing Lots of Objects Animated — 优化大量动画对象（docs/manual/optimize-lots-of-objects-animated.md）
        </title>
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

`examples/manual-lots-animated/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Optimizing Lots of Objects Animated（优化大量动画对象）
 * 配套文章：docs/manual/optimize-lots-of-objects-animated.md
 *
 * 20×20 = 400 颗立方体做正弦波场动画：不给每颗立方体挂组件，
 * 由单个 WaveField 管理组件持 Float32Array（基准坐标 + 相位）在 update 里集中写 setPosition——
 * 数据化布局把每帧逻辑成本收敛到一处，覆盖层实测该循环的毫秒开销。
 * 全部立方体共享同一份 mesh + 同一个 material；AIR 无用户面 InstancedMesh，
 * 这是"大量动态对象"当前可实测的最短路径（PARTIAL 归因见文章）。
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

const scene = new Scene('lots-animated');

// ---- 相机（固定斜视） ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(13.0, 9.5, 13.0));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 200;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-55, -35, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 4.5;

// ---- 400 颗立方体：共享 mesh + material ----
const GRID = 20;
const SPACING = 1.1;

const grid = new Node('Grid');
scene.addChild(grid);

const sharedMesh = utils.createMesh(primitives.box({ width: 0.8, height: 0.8, length: 0.8 }));
const sharedMaterial = new Material();
sharedMaterial.initialize({ effectName: 'builtin-standard' });
sharedMaterial.setProperty('mainColor', new Color(240, 175, 90, 255));

const cubes: Node[] = [];
const baseX = new Float32Array(GRID * GRID);
const baseZ = new Float32Array(GRID * GRID);
const phase = new Float32Array(GRID * GRID);
for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
        const i = ix * GRID + iz;
        const x = (ix - (GRID - 1) / 2) * SPACING;
        const z = (iz - (GRID - 1) / 2) * SPACING;
        baseX[i] = x;
        baseZ[i] = z;
        phase[i] = Math.sqrt(x * x + z * z) * 0.9;
        const cubeNode = new Node(`Cube-${i}`);
        cubeNode.layer = Layers.Enum.DEFAULT;
        cubeNode.setPosition(new Vec3(x, 0.5, z));
        grid.addChild(cubeNode);
        const renderer = cubeNode.addComponent(MeshRenderer);
        renderer.mesh = sharedMesh;
        renderer.material = sharedMaterial;
        cubes.push(cubeNode);
    }
}

// ---- 单个管理组件：数据化布局，集中写 400 个变换 ----
const info = document.querySelector('#info') as HTMLElement;
class WaveField extends Component {
    private _t = 0;
    private _frames = 0;
    private _emaMs = 0;
    private _v: Vec3;

    constructor() {
        super();
        this._t = 0;
        this._frames = 0;
        this._emaMs = 0;
        this._v = new Vec3();
    }
    update(dt: number): void {
        const t0 = performance.now();
        this._t += dt;
        this._frames++;
        for (let i = 0; i < cubes.length; i++) {
            const y = 0.6 + Math.sin(this._t * 2.0 - phase[i]) * 0.55;
            this._v.set(baseX[i], y, baseZ[i]);
            cubes[i].setPosition(this._v);
        }
        const ms = performance.now() - t0;
        this._emaMs = this._emaMs === 0 ? ms : this._emaMs * 0.9 + ms * 0.1;
        info.textContent = [
            `cubes: ${cubes.length} (${GRID}×${GRID} wave field, shared mesh+material)`,
            `manager: 1 component + Float32Array (no per-cube component)`,
            `update cost: ${this._emaMs.toFixed(2)} ms/frame (ema), frames: ${this._frames}, t=${this._t.toFixed(1)}s`,
            'AIR: no user InstancedMesh → data-driven single manager',
        ].join('\n');
    }
}
cameraNode.addComponent(WaveField);

window.__airApp = app;
window.__inspect = { grid, cubes };
app.run(scene);

console.log('[manual/lots-animated] running on cocosair');
```

---

上一篇：[优化大量对象（Optimizing Lots of Objects）](optimize-lots-of-objects.md) ｜ 下一篇：[在 Worker 中使用 OffscreenCanvas（Using OffscreenCanvas in a Web Worker）](offscreencanvas.md)
