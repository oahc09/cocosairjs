# 矩阵变换（Matrix Transformations）

> 世界/本地变换矩阵怎么组合、怎么把一个点从本地空间搬到世界空间。
> 配套可运行示例：[`examples/manual-matrix-transformations/`](examples/manual-matrix-transformations/)（三级节点链 root→mid→tip + 每帧"引擎世界矩阵 vs 手工 Mat4 乘法"对账）。

**状态：FULL。** AIR 导出完整的 `Mat4` 静态运算面与 `Node` 世界变换读回面，本篇把两者**逐帧对账**：
`Mat4.multiply(root.worldMatrix, Mat4.fromRTS(mid 本地 TRS))` 与引擎算出的 `mid.worldMatrix` 逐元素最大差 **0.00e+0**，
`Vec3.transformMat4(tip 本地位移, mid.worldMatrix)` 与 `tip.getWorldPosition()` 差 **0.00e+0**——
证明 AIR 的矩阵乘法约定（`out = a * b`，父世界矩阵在左）与引擎内部世界矩阵完全一致。
唯一的坑是 `Mat4.toEuler` 分解在本构建里不可靠（§3 实测 `ret=false` 返回零向量），读世界欧拉角要走 `node.eulerAngles`。

## 1. 有什么

| 成员                                  | d.ts  | 说明                                                                     |
| ------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `class Mat4`                          | 10102 | 4×4 矩阵；**实例字段是具名的 `m00`…`m15`，没有 `.m` / `.elements` 数组** |
| `Mat4.multiply(out, a, b)`            | 10172 | `out = a * b`；父世界矩阵放 `a`、子本地矩阵放 `b`（§3 实测约定正确）     |
| `Mat4.fromRTS(out, q, v, s)`          | 10310 | 由旋转四元数 + 平移 + 缩放组成本地 TRS 矩阵                              |
| `Mat4.fromRTSOrigin(out, q, v, s, o)` | 10330 | 同上，外加原点偏移                                                       |
| `Mat4.getRotation(out, mat)`          | 10276 | 从矩阵取旋转四元数（比 `toEuler` 可靠）                                  |
| `Mat4.toEuler(out, m)`                | 10304 | 返回 `boolean`；**本构建实测对非零世界旋转返回 `false` + 零向量**（§3）  |
| `node.matrix`（setter）               | 19057 | 直接写本地变换矩阵                                                       |
| `node.worldMatrix`（getter）          | 19062 | 只读世界矩阵                                                             |
| `node.getWorldPosition(out?)`         | 19254 | 世界坐标位置                                                             |
| `node.getWorldRotation(out?)`         | 19284 | 世界旋转四元数                                                           |
| `node.getWorldMatrix(out?)`           | 19312 | 拷贝世界矩阵到 `out`                                                     |
| `Vec3.transformMat4(out, a, m)`       | 8680  | 用矩阵 `m` 变换点 `a`（本地→世界）                                       |

## 2. 三级链与逐帧对账

示例搭一条 `root → mid → tip` 链：`root` 每帧绕 Y 自转 30°/s，`mid` 带本地位移 `(1.5,0,0)` 与本地 Z 旋转 30°，`tip` 再带本地位移 `(0,1,0)`。

手工重建 `mid` 的世界矩阵，与引擎的 `mid.worldMatrix` 对账（以下两段为示例逐字片段）：

```js
        Mat4.fromRTS(midLocalMat, midLocalQuat, MID_LOCAL_POS, Vec3.ONE);
        Mat4.multiply(midWorldManual, root.worldMatrix, midLocalMat);
```

把 `tip` 的本地位移搬进世界空间，与 `tip.getWorldPosition()` 对账：

```js
        Vec3.transformMat4(tipWorldManual, TIP_LOCAL_POS, mid.worldMatrix);
        tip.getWorldPosition(tipWorldEngine);
```

矩阵逐元素比较要遍历**具名字段**（没有数组可 for-of），示例用一个 `MAT_KEYS` 常量表驱动：

```ts
const MAT_KEYS: string[] = [
    'm00',
    'm01',
    'm02',
    'm03',
    'm04',
    'm05',
    'm06',
    'm07',
    'm08',
    'm09',
    'm10',
    'm11',
    'm12',
    'm13',
    'm14',
    'm15',
];
function maxMatDiff(a: Mat4, b: Mat4): number {
    let diff = 0;
    for (const k of MAT_KEYS) {
        diff = Math.max(diff, Math.abs(a[k] - b[k]));
    }
    return diff;
}
```

## 3. 实测读图与读数

示例验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.6s，子集运行 partial；`root` 自转 30°/s）。
截图 `docs/evidence/examples/manual-matrix-transformations.png`（三颗立方体：橙 root、绿 mid、蓝 tip 按链堆叠，三面受光可见）。

覆盖层实测（探针 dump，t≈3s，root angle 136.6°）：

```
chain: root(Y-spin) → mid(loc 1.5,0,0 + Z30°) → tip(loc 0,1,0)
root angle: 136.6°
mid world: engine vs Mat4.multiply(rootWorld, fromRTS) max diff = 0.00e+0
tip world: (-0.73, 1.87, -0.69) vs transformMat4 diff = 0.00e+0
mid world toEuler: ret=false (0.0, 0.0, 0.0)°
mid node euler (node API): (0.0, 0.0, 30.0)°
```

两条 `diff = 0.00e+0` 是本篇的核心证据：**手工矩阵乘法与引擎世界矩阵逐元素完全相等**，`Mat4.multiply` 的 `out = a * b`（父在左）约定得证。

`Mat4.toEuler` 的坑：对 `mid.worldMatrix`（一个明确非零的世界旋转）分解，返回 `ret=false` 且 `eulerOut` 保持零向量——分解在本构建里失效。
同一姿态用节点 API 读 `mid.eulerAngles` 得到正确的 `(0.0, 0.0, 30.0)°`。结论：**读世界/本地欧拉角走 `node.eulerAngles`，取旋转四元数走 `Mat4.getRotation`，不要依赖 `Mat4.toEuler`。**

## 4. 矩阵使用备忘

- AIR 的 `Mat4` **没有 `elements` 数组**，是 16 个具名字段 `m00`…`m15`（gl-matrix 风格），比较/遍历要按字段名。
- 乘法约定：`Mat4.multiply(out, a, b)` 做 `out = a * b`，即"父世界矩阵在左、子本地矩阵在右"，
  `out = parentWorld * childLocal`。层级世界矩阵的心智模型据此建立即可。
- 点变换：`Vec3.transformMat4(out, v, m)`（静态方法，带独立 `out` 参数）。
- 欧拉分解：名义上有 `Mat4.toEuler` 但本构建失效（§3），可靠路径是 `Mat4.getRotation` 取四元数，或直接用 `node.eulerAngles`。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-matrix-transformations        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-matrix-transformations/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-matrix-transformations
```

示例目录：`docs/manual/examples/manual-matrix-transformations/`。
验证器 4/4 全 PASS（3.6s，子集运行 partial）；截图 `docs/evidence/examples/manual-matrix-transformations.png`；覆盖层探针 dump 见 §3（两条 diff=0.00e+0）。

## 附：示例源码（逐字）

`examples/manual-matrix-transformations/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Matrix Transformations — 矩阵变换（docs/manual/matrix-transformations.md）</title>
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

`examples/manual-matrix-transformations/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Matrix Transformations（矩阵变换）
 * 配套文章：docs/manual/matrix-transformations.md
 *
 * 三级节点链 root→mid→tip：root 每帧自转，mid/tip 带本地位移与旋转。
 * 覆盖层做"引擎世界矩阵 vs 手工 Mat4 乘法"的逐帧对账：
 *   midWorldManual = Mat4.multiply(root.worldMatrix, Mat4.fromRTS(mid 本地 TRS))
 *   tipWorldManual = Vec3.transformMat4(tip 本地位移, mid.worldMatrix)
 * 并打印 Mat4.toEuler 分解读回。三颗立方体随链运动，保证 frame-diff。
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
    Quat,
    Mat4,
    Color,
    utils,
    primitives,
    toDegree,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('matrix-transformations');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(4.0, 3.4, 6.8));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
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
const cubeMesh = utils.createMesh(primitives.box({ width: 0.7, height: 0.7, length: 0.7 }));
function attachCube(node: Node, r: number, g: number, b: number): void {
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', new Color(r, g, b, 255));
    renderer.material = material;
}

// ---- 三级链：root → mid → tip ----
const MID_LOCAL_POS = new Vec3(1.5, 0, 0);
const MID_LOCAL_EULER_Z = 30;
const TIP_LOCAL_POS = new Vec3(0, 1.0, 0);

const root = new Node('root');
root.layer = Layers.Enum.DEFAULT;
root.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(root);
attachCube(root, 235, 125, 65);

const mid = new Node('mid');
mid.layer = Layers.Enum.DEFAULT;
mid.setPosition(MID_LOCAL_POS);
mid.setRotationFromEuler(0, 0, MID_LOCAL_EULER_Z);
root.addChild(mid);
attachCube(mid, 95, 205, 120);

const tip = new Node('tip');
tip.layer = Layers.Enum.DEFAULT;
tip.setPosition(TIP_LOCAL_POS);
mid.addChild(tip);
attachCube(tip, 65, 155, 235);

// ---- 对账工具 ----
const midLocalQuat = new Quat();
Quat.fromEuler(midLocalQuat, 0, 0, MID_LOCAL_EULER_Z);
const midLocalMat = new Mat4();
const midWorldManual = new Mat4();
const tipWorldManual = new Vec3();
const tipWorldEngine = new Vec3();
const eulerOut = new Vec3();

const MAT_KEYS: string[] = [
    'm00',
    'm01',
    'm02',
    'm03',
    'm04',
    'm05',
    'm06',
    'm07',
    'm08',
    'm09',
    'm10',
    'm11',
    'm12',
    'm13',
    'm14',
    'm15',
];
function maxMatDiff(a: Mat4, b: Mat4): number {
    let diff = 0;
    for (const k of MAT_KEYS) {
        diff = Math.max(diff, Math.abs(a[k] - b[k]));
    }
    return diff;
}

// ---- 每帧：root 自转 + 对账 + 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
class Orbit extends Component {
    private _angle = 0;

    constructor() {
        super();
        this._angle = 0;
    }
    update(dt: number): void {
        this._angle += dt * 30;
        root.setRotationFromEuler(0, this._angle, 0);

        Mat4.fromRTS(midLocalMat, midLocalQuat, MID_LOCAL_POS, Vec3.ONE);
        Mat4.multiply(midWorldManual, root.worldMatrix, midLocalMat);
        const matDiff = maxMatDiff(midWorldManual, mid.worldMatrix);

        Vec3.transformMat4(tipWorldManual, TIP_LOCAL_POS, mid.worldMatrix);
        tip.getWorldPosition(tipWorldEngine);
        const posDiff = Vec3.distance(tipWorldManual, tipWorldEngine);

        const eulerOk = Mat4.toEuler(eulerOut, mid.worldMatrix);
        info.textContent = [
            'chain: root(Y-spin) → mid(loc 1.5,0,0 + Z30°) → tip(loc 0,1,0)',
            `root angle: ${this._angle.toFixed(1)}°`,
            `mid world: engine vs Mat4.multiply(rootWorld, fromRTS) max diff = ${matDiff.toExponential(2)}`,
            `tip world: (${tipWorldEngine.x.toFixed(2)}, ${tipWorldEngine.y.toFixed(2)}, ${tipWorldEngine.z.toFixed(2)}) vs transformMat4 diff = ${posDiff.toExponential(2)}`,
            `mid world toEuler: ret=${eulerOk} (${toDegree(eulerOut.x).toFixed(1)}, ${toDegree(eulerOut.y).toFixed(1)}, ${toDegree(eulerOut.z).toFixed(1)})°`,
            `mid node euler (node API): (${mid.eulerAngles.x.toFixed(1)}, ${mid.eulerAngles.y.toFixed(1)}, ${mid.eulerAngles.z.toFixed(1)})°`,
        ].join('\n');
    }
}
cameraNode.addComponent(Orbit);

window.__airApp = app;
app.run(scene);

console.log('[manual/matrix-transformations] running on cocosair');
```

---

上一篇：[后处理（How to use Post Processing）](how-to-use-post-processing.md) ｜ 下一篇：[按需渲染（Rendering on Demand）](rendering-on-demand.md)
