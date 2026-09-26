# Using Indexed Textures for Picking and Color（索引纹理拾取与着色）

> 把三角形序号写进纹理，用 GPU 读回实现任意网格的逐三角拾取/着色。
> 配套可运行示例：[`examples/manual-indexed-textures/`](examples/manual-indexed-textures/)
> （16×12 球 2048 三角形，CPU 逐三角求交，命中三角形重心坐标处放黄球标记——零外部资产）。

索引纹理的路线是 GPU 的：自定义着色器把 `gl_PrimitiveID`（或顶点索引）编码成 RGB 渲到离屏纹理，
读鼠标处那一像素的颜色反解出三角形序号——同一张"索引纹理"还能顺带驱动逐三角着色。
**AIR 里这条路线不存在**：无用户 GLSL 入口（[shadertoy](shadertoy.md) 篇已用 grep 级证据定 N/A），
Stage 体系也不给自定义 pass 挂着色器（[post-processing](post-processing.md) N/A）。
但本篇的**目标**——逐三角形拾取——有一条诚实的 CPU 等价路线：
`primitives.*` 生成的 `IGeometry` 自带 `positions` + `indices`（索引缓冲，d.ts 32078），
应用层把它展开成三角形列表，用 [picking](picking.md) 同款 `screenPointToRay` 射线做 Möller–Trumbore 求交。要点：

| 路线                      | AIR 现状                                                                                | 实测                 |
| ------------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| 离屏渲 ID 纹理 + GPU 读回 | 无用户 GLSL/自定义 pass → GPU 路线缺                                                    | N/A（升级条件见 §4） |
| 逐三角形拾取任意网格      | CPU：索引缓冲 + Möller–Trumbore                                                         | ✓（本示例核心）      |
| 索引纹理驱动逐三角着色    | `IGeometry.colors` 字段存在（d.ts 32031）；顶点色是否被 builtin-standard 采纳**未取证** | 述而不承诺           |

## 1. 索引数据 API 面（实测锚点）

| 入口                                         | 锚点                                                | 语义（实测）                                                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.sphere(radius, sectors, stance)` | d.ts 31865                                          | 返回 `IGeometry`；本例 `sphere(2, 16, 12)` 实测键集 `positions/indices/normals/uvs/minPos/maxPos/boundingRadius`，`positions.length=3267`（1089 顶点）、`indices.length=6144` → **2048 三角形** |
| `IGeometry.indices`                          | d.ts 32078                                          | 索引绘制用的三角形索引表（每 3 个顶点索引一个三角形）                                                                                                                                           |
| `utils.createMesh(IGeometry)`                | 与 [custom-geometry](custom-buffergeometry.md) 同路 | 同一份 prim 数据既喂渲染又留 CPU 求交，天然对齐                                                                                                                                                 |
| `Camera.screenPointToRay(x, y, out)`         | d.ts 21410                                          | 左下角原点像素 → 射线（翻转约定见 [picking](picking.md) §2，本例逐字沿用）                                                                                                                      |
| `IDynamicGeometry` / 动态网格                | d.ts 32100 起                                       | 存在逐帧更新顶点数据的类型面；本篇未用到，逐帧改顶点场景指路 [canvas-textures](canvas-textures.md) 的纹理更新思路                                                                               |

## 2. 示例拆解

球放在原点、不旋转不缩放——**局部坐标 = 世界坐标**，索引缓冲可以零变换直接喂给射线求交
（这是刻意选的简化；带变换的网格要先 `node.worldMatrix` 变换三角形或逆变换射线，复杂度另说）。
求交核心（Möller–Trumbore，返回距离 `t` 与重心坐标 `u/v`）：

```ts
function rayTriangle(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    v0: number[],
    v1: number[],
    v2: number[],
): { t: number; u: number; v: number } | null {
    const e1x = v1[0] - v0[0],
        e1y = v1[1] - v0[1],
        e1z = v1[2] - v0[2];
    const e2x = v2[0] - v0[0],
        e2y = v2[1] - v0[1],
        e2z = v2[2] - v0[2];
    const px = dy * e2z - dz * e2y,
        py = dz * e2x - dx * e2z,
        pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) return null;
    const inv = 1 / det;
    const tx = ox - v0[0],
        ty = oy - v0[1],
        tz = oz - v0[2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y,
        qy = tz * e1x - tx * e1z,
        qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > 1e-5 ? { t, u, v } : null;
}
```

每帧对 2048 个三角形暴力遍历取最近命中（`t` 最小），命中点用重心坐标
`(1-u-v, u, v)` 插值出来，黄球（`builtin-unlit`，不受光照影响永远醒目）放到该处。
指针约定与 [picking](picking.md) 完全一致：有鼠标跟鼠标，无鼠标 Lissajous 自动扫。

## 3. 实测读数

验证器 3/3：`app-contract / visible-frame / no-runtime-error` 全 PASS（3.1s，子集运行 partial；
本例不在 `ANIMATED` 集）。截图 `docs/evidence/examples/manual-indexed-textures.png`：蓝色球面上黄标记
清晰落在表面（右下象限，与自动扫指针相位一致）。

**正确性探针**（`pointer.source='mouse'` 后逐点写坐标、读回命中三角形与标记世界坐标）：

```
(50%,50%) → tri 1231, marker (0, 0.65, 1.89)   |marker|=2.00（恰在 r=2 球面上）
(5%,95%)  → tri -1（屏幕角落，射线出轮廓外）
(50%,32%) → tri 1487, marker (0, 1.30, 1.52)   指针上移 → 命中点上移，方向与 y 翻转自洽
```

三点合起来证明：索引展开正确（球面处处在 r=2）、求交取最近命中有效、坐标系翻转沿用 picking 篇结论无漂移。
**性能口径**：2048 三角 × 每帧一次 ≈ 现代 JS 单帧 <1ms 量级，本例 60fps 无压力；
万级三角以上该上应用层 BVH/包围球粗筛——GPU 路线本就是为了绕开这个规模问题，
AIR 的 CPU 路线在中小网格舒适区成立，超大网格是它的真实边界。

## 4. 边界与升级条件（为何定 PARTIAL）

本篇主题词"索引纹理"（GPU 路线）在 AIR 整体缺位，示例达成的是**目标**（逐三角拾取）而非**手段**，
故定 PARTIAL 不定 FULL。升级为 FULL 的条件（任一）：

1. 开放用户 GLSL / 自定义 effect 注册并可用于离屏 pass（[shadertoy](shadertoy.md) 升级条件同源）；
2. 引擎级网格求交导出（`geometry.Ray` 补 `computeIntersection` 类 API 并顶层导出，
   现状见 [picking](picking.md) §1：Ray 仅 `o/d/computeHit`）；
3. 官方提供拾取用 ID-buffer / GPU picking 设施。

"and Color" 半边（索引纹理驱动逐三角着色）：`IGeometry.colors` 顶点色字段在类型面上存在，
`utils.createMesh` 是否据此开启 `USE_VERTEX_COLOR`、`builtin-standard` 是否采纳，**本构建未取证**——
想要逐三角着色的读者可先试"每三角一个 unlit 小 quad 覆盖"的应用层笨办法（述而不承诺）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-indexed-textures        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-indexed-textures/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-indexed-textures
```

示例目录：`docs/manual/examples/manual-indexed-textures/`。
验证器 3/3 全 PASS（3.1s，子集运行 partial）；截图 `docs/evidence/examples/manual-indexed-textures.png`；
探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-indexed-textures/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Using Indexed Textures for Picking and Color — 索引纹理（docs/manual/indexed-textures.md）</title>
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

`examples/manual-indexed-textures/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Using Indexed Textures for Picking and Color（索引纹理拾取）
 * 配套文章：docs/manual/indexed-textures.md
 *
 * 任意网格拾取有一条经典 GPU 路线："把三角形序号编码进颜色渲染到离屏纹理再读回"。
 * AIR 无用户 GLSL（shadertoy 篇 N/A 同结论），GPU 路线不存在；但目标（逐三角形拾取）
 * 可以走 CPU 等价路线：primitives 生成的 IGeometry 自带 positions + indices（索引缓冲），
 * 应用层拿 picking 篇同款 screenPointToRay 射线，对索引展开的三角形做 Möller–Trumbore 求交。
 * 本例：一颗 16×12 球（2048 三角形），射线命中哪个三角形，黄球标记就落在其重心坐标处。
 * 覆盖层打印三角形总数与命中序号/重心坐标/距离，供探针取证。
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
    input,
    SystemEventType,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('indexed-textures');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.4));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-45, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 4.5;

// ---- 目标球：保留 IGeometry 的 positions/indices 做 CPU 逐三角求交 ----
const RADIUS = 2;
const prim = primitives.sphere(RADIUS, 16, 12);
const positions = prim.positions;
const indices = prim.indices;
const triCount = indices.length / 3;

const sphereNode = new Node('Sphere');
sphereNode.layer = Layers.Enum.DEFAULT;
scene.addChild(sphereNode);
const sphereR = sphereNode.addComponent(MeshRenderer);
sphereR.mesh = utils.createMesh(prim);
const sphereMat = new Material();
sphereMat.initialize({ effectName: 'builtin-standard' });
sphereMat.setProperty('mainColor', new Color(110, 160, 220, 255));
sphereR.material = sphereMat;

// ---- Möller–Trumbore：射线 × 三角形（应用层，无第三方依赖） ----
function rayTriangle(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    v0: number[],
    v1: number[],
    v2: number[],
): { t: number; u: number; v: number } | null {
    const e1x = v1[0] - v0[0],
        e1y = v1[1] - v0[1],
        e1z = v1[2] - v0[2];
    const e2x = v2[0] - v0[0],
        e2y = v2[1] - v0[1],
        e2z = v2[2] - v0[2];
    const px = dy * e2z - dz * e2y,
        py = dz * e2x - dx * e2z,
        pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) return null;
    const inv = 1 / det;
    const tx = ox - v0[0],
        ty = oy - v0[1],
        tz = oz - v0[2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y,
        qy = tz * e1x - tx * e1z,
        qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > 1e-5 ? { t, u, v } : null;
}

// ---- 指针：有鼠标用鼠标，否则 Lissajous 自动扫（picking 篇同款约定） ----
const info = document.querySelector('#info') as HTMLElement;
const pointer: { x: number; y: number; source: string } = { x: 0.5, y: 0.5, source: 'auto' };
input.on(SystemEventType.MOUSE_MOVE, (e) => {
    const loc = e.getUILocation();
    pointer.x = loc.x / window.innerWidth;
    pointer.y = loc.y / window.innerHeight;
    pointer.source = 'mouse';
});

// ---- 命中标记：builtin-unlit 黄球落在命中三角形重心坐标处 ----
const markerNode = new Node('Marker');
markerNode.layer = Layers.Enum.DEFAULT;
scene.addChild(markerNode);
const markerR = markerNode.addComponent(MeshRenderer);
markerR.mesh = utils.createMesh(primitives.sphere(0.09, 12, 8));
const markerMat = new Material();
markerMat.initialize({ effectName: 'builtin-unlit' });
markerMat.setProperty('mainColor', new Color(255, 230, 60, 255));
markerR.material = markerMat;

const ray: { o: Vec3; d: Vec3 } = { o: new Vec3(), d: new Vec3() };
let hitTri = -1;

class TriPicker extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        if (pointer.source === 'auto') {
            pointer.x = 0.5 + 0.22 * Math.sin(this._t * 0.6) * Math.cos(this._t * 0.23);
            pointer.y = 0.5 + 0.18 * Math.sin(this._t * 0.42);
        }
        const sx = pointer.x * window.innerWidth;
        // screenPointToRay 左下角原点（picking 篇 §2 同款翻转）
        const sy = (1 - pointer.y) * window.innerHeight;
        camera.screenPointToRay(sx, sy, ray);
        // 球在原点且不旋转不缩放 → 局部坐标 = 世界坐标，索引缓冲可直接用
        let best = -1;
        let bestT = Infinity;
        let bu = 0;
        let bv = 0;
        const o = ray.o;
        const d = ray.d;
        for (let i = 0; i < triCount; i++) {
            const a = indices[i * 3] * 3;
            const b = indices[i * 3 + 1] * 3;
            const c = indices[i * 3 + 2] * 3;
            const hit = rayTriangle(
                o.x,
                o.y,
                o.z,
                d.x,
                d.y,
                d.z,
                [positions[a], positions[a + 1], positions[a + 2]],
                [positions[b], positions[b + 1], positions[b + 2]],
                [positions[c], positions[c + 1], positions[c + 2]],
            );
            if (hit && hit.t < bestT) {
                bestT = hit.t;
                best = i;
                bu = hit.u;
                bv = hit.v;
            }
        }
        hitTri = best;
        if (best >= 0) {
            // 重心坐标 (1-u-v, u, v) → 命中点世界坐标（球心在原点，无需再变换）
            const a = indices[best * 3] * 3;
            const b = indices[best * 3 + 1] * 3;
            const c = indices[best * 3 + 2] * 3;
            const w0 = 1 - bu - bv;
            markerNode.setPosition(
                new Vec3(
                    w0 * positions[a] + bu * positions[b] + bv * positions[c],
                    w0 * positions[a + 1] + bu * positions[b + 1] + bv * positions[c + 1],
                    w0 * positions[a + 2] + bu * positions[b + 2] + bv * positions[c + 2],
                ),
            );
        }
        info.textContent = [
            'indexed picking: IGeometry positions+indices + app-layer Moller-Trumbore (CPU)',
            `sphere ${RADIUS}r 16x12: ${triCount} triangles, index buffer length ${indices.length}`,
            `pointer: (${(pointer.x * 100).toFixed(0)}%, ${(pointer.y * 100).toFixed(0)}%) source=${pointer.source}`,
            `hit triangle: ${best} (-1 = none)  bary=(u=${bu.toFixed(2)}, v=${bv.toFixed(2)}) t=${bestT.toFixed(2)}`,
        ].join('\n');
    }
}
cameraNode.addComponent(TriPicker);

window.__airApp = app;
window.__inspect = { camera, triCount, indices, positions, pointer, getHitTri: () => hitTri, markerNode };
app.run(scene);

console.log('[manual/indexed-textures] running on cocosair');
```

---

上一篇：[HTML 元素对齐 3D（Aligning HTML Elements to 3D）](align-html-elements-to-3d.md) ｜ 下一篇：[用 Canvas 做动态纹理（Using A Canvas for Dynamic Textures）](canvas-textures.md)
