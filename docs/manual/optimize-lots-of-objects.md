# Optimizing Lots of Objects（优化大量对象）

> 场景里对象成百上千时怎么保住帧率。
> 配套可运行示例：[`examples/manual-lots-of-objects/`](examples/manual-lots-of-objects/)（10×10=100 颗立方体共享 mesh+material，按钮一键静态合批/还原）。

AIR 的答案是**静态合批**：`BatchingUtility.batchStaticModel` 把一棵子树下的所有网格合并成一个 mesh、
禁用原来的每个渲染组件、把合并结果挂到目标节点上。实测对照：

| 路线                 | 入口                                                                            | 实测                               |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| 静态合批（整棵子树） | `BatchingUtility.batchStaticModel`（d.ts 91）/ `unbatchStaticModel`（d.ts 101） | 可用，返回 `true`，可逆（§3 探针） |
| 细粒度合并           | `Mesh.merge`（d.ts 220）                                                        | 入口存在，本篇不展开               |
| 实例化绘制           | **无**用户面 `InstancedMesh`                                                    | N/A —— 本篇标 PARTIAL 的主因       |

## 1. BatchingUtility 的实测契约

签名（d.ts 91）：`static batchStaticModel(staticModelRoot: Node, batchedRoot: Node): boolean`。
d.ts 注释承诺四件事：收集 `staticModelRoot` 下的 Model；把所有 mesh 静态合并成一个；禁用每个组件；
把新 Model 挂到 `batchedRoot` 上，且每个模型的世界变换保留。`unbatchStaticModel`（d.ts 101）承诺全部回退。

示例里用 `window.__inspect` 暴露了 `grid` / `batchedRoot`，探针在按钮两次点击前后各拍一次场景图快照，
四件承诺逐条对账（§3 dump）：合批后 `grid` 下 100 个 `MeshRenderer` 的 `enabled` 全变 `false`、
`batchedRoot` 上多出一个 `MeshRenderer` 组件且其 `mesh` 是合并产物（`subMeshCount=1`，与共享 mesh 不同对象）；
unbatch 后 100 个渲染组件全部复活、`batchedRoot` 恢复空节点。**注释与实测一致**。

两个使用约束，来自契约本身：

- **只适合静态物体**。合批把世界变换烘进合并 mesh，之后单独移动某一颗立方体不会生效（它的组件已禁用）。
  要动就别合，或合之前摆好。
- **合批不等于共享资源**。共享 mesh + material（示例 §2 第一段）是合批之前的日常手段：
  一份 GPU 资源被 100 个渲染组件引用，内存与状态切换开销先降一档；`batchStaticModel` 再进一步把 100 个
  渲染组件换成 1 个。两者叠加使用，示例即如此。

**如实标注**：AIR 没有暴露 draw call / GPU 统计的用户面入口（全仓 grep 无 `renderer.info` 类读数），
所以"合批省了多少 draw"在本篇**无法用实测数字证明**；能实测的是上面的场景图契约与画面不变（合批前后截图同景）。
引擎内部另有 UBO 自动合批通路（`BatchingSchemes`，d.ts 7326），无用户开关、无统计，本篇不承诺其行为。

## 2. 示例拆解

100 颗立方体共用一份 mesh 与一个 material，挂在 `world/grid` 下；`world/batchedRoot` 是合批输出节点：

```js
const sharedMesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const sharedMaterial = new Material();
sharedMaterial.initialize({ effectName: 'builtin-standard' });
sharedMaterial.setProperty('mainColor', new Color(150, 215, 165, 255));

let cubeCount = 0;
for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
        const cubeNode = new Node(`Cube-${ix}-${iz}`);
        cubeNode.layer = Layers.Enum.DEFAULT;
        const x = (ix - (GRID - 1) / 2) * SPACING;
        const z = (iz - (GRID - 1) / 2) * SPACING;
        cubeNode.setPosition(new Vec3(x, 0.5, z));
        grid.addChild(cubeNode);
        const renderer = cubeNode.addComponent(MeshRenderer);
        renderer.mesh = sharedMesh;
        renderer.material = sharedMaterial;
        cubeCount++;
    }
}
```

按钮回调里做合批/还原，返回值直接打进覆盖层（`true`/`false` 肉眼可见，失败走 catch）：

```js
btnBatch.addEventListener('click', () => {
    try {
        if (!batched) {
            batchResult = `batchStaticModel → ${BatchingUtility.batchStaticModel(grid, batchedRoot)}`;
            batched = true;
        } else {
            batchResult = `unbatchStaticModel → ${BatchingUtility.unbatchStaticModel(grid, batchedRoot)}`;
            batched = false;
        }
    } catch (e) {
        batchResult = `error: ${e.name}: ${e.message}`;
    }
    btnBatch.textContent = `Batch: ${batched ? 'ON' : 'OFF'}`;
});
```

相机挂 `Orbit` 组件绕场景公转（12°/s），合批与未合批两种状态下画面都持续变化——
本例在验证器 `ANIMATED` 集合内，公转是 frame-diff 判据的运动来源，与合批开关无关。

## 3. 实测读图与读数

验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.8s，子集运行 partial）。
截图 `docs/evidence/examples/manual-lots-of-objects.png`：10×10 青绿立方体矩阵、斜俯视角，
顶面/两侧面三档受光色；中等亮度色调（与 `manual-primitives` 截图同族）。

探针 dump（按钮 ON → OFF 一轮，场景图快照）：

```
before: enabledRenderers=100, batchedRoot comps=none
on:     batchStaticModel → true
        enabledRenderers=0, batchedRoot comps=MeshRenderer:true, mesh=merged(subMeshes=1)
off:    unbatchStaticModel → true
        enabledRenderers=100, batchedRoot comps=none
```

覆盖层实测（探针读取时刻）：

```
cubes: 100 (10×10, shared mesh+material)
batched: ON  (batchStaticModel → true)
orbit: 61°
click [Batch] to toggle BatchingUtility.batchStaticModel
```

**开发期踩坑（已修）**：首版截图机位太高（`y=12, r=22`）且光照偏弱，画面只剩暗色顶面一片；
压低机位到 `y=8.5, r=19` 露出侧面、`illuminance` 提到 4.5 后读图清晰。
**俯拍大阵列时机位高度决定还能不能看见侧面**，这是本例读图的主要旋钮。

## 4. 能力边界与路线备忘

- instancing（一次 draw 画 N 个实例、每实例矩阵可每帧更新，动态大阵列也吃得下）是常见的另一半答案，
  AIR **没有**用户面 instancing 入口（d.ts 里 `InstancedBuffer` /
  `SkinnedMeshBatchRenderer` 均为引擎内部件），动态大阵列只能靠"共享资源 + 组件更新"，见下一篇
  [Optimizing Lots of Objects Animated](optimize-lots-of-objects-animated.md)。
- AIR 的 `batchStaticModel` 不只是合并几何体，而是**场景图操作**：合并 mesh 之外还自动禁用原组件、挂载结果、保留世界变换，并配 `unbatchStaticModel` 一键回退——
  省去手工管理合并几何体的生命周期，但粒度是"整棵子树"。
- 合并/实例化后包围球与剔除通常要自己留意；
  AIR 合批后是单个 Model，剔除粒度随合并变粗，本篇未实测其代价。
- 边界：静态合批只解决"提交开销"，不解决"每对象逻辑开销"；上千对象的每帧逻辑仍要靠数据化布局
  （TypedArray / 组件池）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-lots-of-objects        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-lots-of-objects/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-lots-of-objects
```

示例目录：`docs/manual/examples/manual-lots-of-objects/`。
验证器 4/4 全 PASS（3.8s，子集运行 partial）；截图 `docs/evidence/examples/manual-lots-of-objects.png`；
合批/还原场景图探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-lots-of-objects/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Optimizing Lots of Objects — 优化大量对象（docs/manual/optimize-lots-of-objects.md）</title>
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
            <button id="btn-batch" type="button">Batch: OFF</button>
        </div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-lots-of-objects/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Optimizing Lots of Objects（优化大量对象）
 * 配套文章：docs/manual/optimize-lots-of-objects.md
 *
 * 10×10 共 100 颗立方体共享同一份 mesh + 同一个 material（静态合批的前提），
 * 按钮切换 BatchingUtility.batchStaticModel / unbatchStaticModel：
 * 合批后 grid 下每个 MeshRenderer 被禁用，合并出的大 mesh 挂到 batchedRoot 上。
 * 相机绕场景缓慢公转，保证任意时刻画面都在变化（frame-diff）。
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
    BatchingUtility,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('lots-of-objects');

// ---- 相机（公转） ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
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

// ---- 100 颗立方体：共享 mesh + material，挂在 world/grid 下 ----
const GRID = 10;
const SPACING = 1.6;

const world = new Node('World');
scene.addChild(world);
const grid = new Node('Grid');
world.addChild(grid);
const batchedRoot = new Node('BatchedRoot');
world.addChild(batchedRoot);

const sharedMesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const sharedMaterial = new Material();
sharedMaterial.initialize({ effectName: 'builtin-standard' });
sharedMaterial.setProperty('mainColor', new Color(150, 215, 165, 255));

let cubeCount = 0;
for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
        const cubeNode = new Node(`Cube-${ix}-${iz}`);
        cubeNode.layer = Layers.Enum.DEFAULT;
        const x = (ix - (GRID - 1) / 2) * SPACING;
        const z = (iz - (GRID - 1) / 2) * SPACING;
        cubeNode.setPosition(new Vec3(x, 0.5, z));
        grid.addChild(cubeNode);
        const renderer = cubeNode.addComponent(MeshRenderer);
        renderer.mesh = sharedMesh;
        renderer.material = sharedMaterial;
        cubeCount++;
    }
}

// ---- 合批开关 ----
const btnBatch = document.querySelector('#btn-batch') as HTMLButtonElement;
let batched = false;
let batchResult = '—';
btnBatch.addEventListener('click', () => {
    try {
        if (!batched) {
            batchResult = `batchStaticModel → ${BatchingUtility.batchStaticModel(grid, batchedRoot)}`;
            batched = true;
        } else {
            batchResult = `unbatchStaticModel → ${BatchingUtility.unbatchStaticModel(grid, batchedRoot)}`;
            batched = false;
        }
    } catch (e) {
        batchResult = `error: ${e.name}: ${e.message}`;
    }
    btnBatch.textContent = `Batch: ${batched ? 'ON' : 'OFF'}`;
});

// ---- 相机公转 + 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
class Orbit extends Component {
    private _angle = 30;

    constructor() {
        super();
        this._angle = 30;
    }
    update(dt: number): void {
        this._angle += dt * 12;
        const rad = (this._angle * Math.PI) / 180;
        const r = 19;
        this.node.setPosition(new Vec3(Math.sin(rad) * r, 8.5, Math.cos(rad) * r));
        this.node.lookAt(new Vec3(0, 0.5, 0));
        info.textContent = [
            `cubes: ${cubeCount} (${GRID}×${GRID}, shared mesh+material)`,
            `batched: ${batched ? 'ON' : 'OFF'}  (${batchResult})`,
            `orbit: ${this._angle.toFixed(0)}°`,
            'click [Batch] to toggle BatchingUtility.batchStaticModel',
        ].join('\n');
    }
}
cameraNode.addComponent(Orbit);

window.__airApp = app;
window.__inspect = { grid, batchedRoot, sharedMesh, sharedMaterial };
app.run(scene);

console.log('[manual/lots-of-objects] running on cocosair');
```

---

上一篇：[Tips（技巧）](tips.md) ｜ 下一篇：[优化大量动画对象（Optimizing Lots of Objects Animated）](optimize-lots-of-objects-animated.md)
