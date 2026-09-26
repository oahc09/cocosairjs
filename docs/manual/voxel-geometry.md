# Making Voxel Geometry (Minecraft)（体素几何）

> 把成千上万个 cube 用"邻居挡住就丢面"的可见性剔除合并成一个几何体，一次 draw call 画一座山。
> 配套可运行示例：[`examples/manual-voxel/`](examples/manual-voxel/)
> （12×12 sin/cos 高度场、只发暴露面、按高度染顶点色、整体自转——零外部资产）。

体素几何的核心是三件事：几何合并、顶点色、手写可见面剔除。
AIR 没有专门的 merge 工具，但 `primitives.*` 直接吐**数据形态的 IGeometry**
（positions/normals/uvs/indices，[indexed-textures](indexed-textures.md) 篇已用过），
合并就是纯 JS 数组拼接，不需要额外的对象包装。要点：

| AIR                                                                                         | 实测                           |
| ------------------------------------------------------------------------------------------- | ------------------------------ |
| `primitives.box({width:1,...})` 一张模板 + 应用层数组拼接 + `utils.createMesh(大IGeometry)` | ✓（本示例，410 体素合 1 Mesh） |
| 六向邻居判定 `solid(x±1,y±1,z±1)`：邻居占了就丢面                                           | ✓（2460 面剔到 374，砍 85%）   |
| `defines: { USE_VERTEX_COLOR: true }`（a_color 通道进 albedo）                              | ✓（§2 有归一化坑）             |
| 默认 colors 属性是 **RGBA32F**，分量按 0..1 浮点写                                          | ✗→✓ 修正后（§2 踩坑）          |
| 节点自转（本例）或 [camera](cameras.md) 篇轨道相机环绕                                      | ✓                              |

## 1. 合并几何 API 面（实测锚点）

| 入口                      | 锚点                       | 语义（实测）                                                                                                                          |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.box(opts)`    | build js 54805 `box()`     | 6 面按 `_buildPlane(0,4,1,5,3,2)` 顺序构建 → 顶点布局**每面 4 顶点连续、每面 6 索引连续**，面序法线 +Z,+X,−Z,−X,−Y,+Y——拆面模板的依据 |
| `IGeometry.colors`        | d.ts 32031                 | `number[]`，随 `utils.createMesh` 进顶点缓冲                                                                                          |
| `createMesh` 默认属性表   | create-mesh.ts `_defAttrs` | colors 默认 **`Format.RGBA32F`**（不是 RGBA8！）→ 分量按 0..1 浮点写                                                                  |
| `writeBuffer`             | buffer.ts 44               | 按属性 format 原样写入 DataView，**不做 0..255→0..1 归一**——数值口径错了不报错                                                        |
| `USE_VERTEX_COLOR`        | builtin-effects.ts 628/668 | `builtin-standard` 宏表含此宏 + `a_color`(format 44, location 14) 顶点输入                                                            |
| `Mesh.renderingSubMeshes` | d.ts 157                   | 探针读回 `length=1`——合并后确实只有一个 submesh/一次 draw                                                                             |

## 2. 示例拆解：模板拆面 → 六向剔除 → 索引重映射

面模板直接从引擎自己的 box 上"解剖"下来——连三角形绕序都继承（cocos 的绕序约定
由引擎保证，手搓绕序是额外的踩坑面，别自己发明）：

```ts
const boxPrim = primitives.box({ width: 1, height: 1, length: 1 });
const faces: { dir: number[]; vbase: number; idxStart: number }[] = [];
for (let f = 0; f < 6; f++) {
    const n = f * 12; // 该面首顶点的 normal 起点：(f*4 顶点)*3 分量
    faces.push({
        dir: [Math.round(boxPrim.normals[n]), Math.round(boxPrim.normals[n + 1]), Math.round(boxPrim.normals[n + 2])],
        vbase: f * 4,
        idxStart: f * 6,
    });
}
```

主循环对每个体素的每个面问一句"邻居占了吗"，没占才把 4 顶点+6 索引搬进大缓冲，
索引按当前顶点数重映射：

```js
                if (solid(x + face.dir[0], y + face.dir[1], z + face.dir[2])) continue; // 邻居挡住 → 丢面
                const base = positions.length / 3;
                const c = PALETTE[y % PALETTE.length];
                for (let k = 0; k < 4; k++) {
                    // 4 顶点：平移复制 + 法线 + uv + 色
                    const vp = (face.vbase + k) * 3;
                    positions.push(
                        boxPrim.positions[vp] + x - OFF,
                        boxPrim.positions[vp + 1] + y,
                        boxPrim.positions[vp + 2] + z - OFF,
                    );
                    normals.push(boxPrim.normals[vp], boxPrim.normals[vp + 1], boxPrim.normals[vp + 2]);
                    const vt = (face.vbase + k) * 2;
                    uvs.push(boxPrim.uvs[vt], boxPrim.uvs[vt + 1]);
                    colors.push(c[0], c[1], c[2], 1); // RGBA32F 归一浮点（见 PALETTE 处实测坑注释）
                }
                for (let k = 0; k < 6; k++) {
                    // 6 索引：面内局部索引重映射到合并缓冲
                    indices.push(base + boxPrim.indices[face.idxStart + k] - face.vbase);
                }
```

`solid()` 里 `y < 0` 返回 true 是常见的地面约定：底面永不暴露，白省一层。

**踩坑（截图实锤）**：首版按 0..255 写 colors → 山体整体**纯白**（4/4 里 visible-frame
照样 PASS，像素全是"有效颜色"，这 bug 验证器抓不住，靠肉眼看截图）。归因链：
`createMesh` 默认 colors 属性是 `RGBA32F`（create-mesh.ts `_defAttrs[4]`），
`writeBuffer` 原样写入不归一，shader 拿到 70/150/210 这种 >1 的值乘 albedo，
输出截断成白。修法一行：调色板 `.map(v => v / 255)`。

```js
// 实测坑：createMesh 默认 colors 属性是 RGBA32F（create-mesh.ts _defAttrs[4]），
// 分量必须给 0..1 归一浮点——写 0..255 会被 shader 当 >1 截断成纯白（首版截图实锤）
```

（如想省顶点内存，可在 `IGeometry.attributes` 里显式声明 RGBA8 属性——本例未取证，述而不承诺。）

## 3. 实测读数

验证器 4/4：`app-contract / visible-frame / no-runtime-error / frame-diff` 全 PASS
（3.7s，子集运行 partial；`ANIMATED` 集，自转即持续变化源）。
截图 `docs/evidence/examples/manual-voxel.png`：山体呈水→草→岩分层色带、
阶梯状体素轮廓、侧面暴露墙可见——剔除与顶点色同时成立。

**探针 dump**：`voxels=410, maxH=5, grid=12×12`；朴素全建 `naiveFaces=2460` →
实际只发 `exposedFaces=374`（**剔除 85%**）；合并缓冲 `verts=1496, indices=2244`；
`mergedMesh.renderingSubMeshes.length=1`（单 submesh=单 draw call 的直接证据）；
自转相位可钉（`spin._a=0` 后 euler.y≈0.5°）。

**draw call 的账**：410 个体素若各挂一个 MeshRenderer 就是 410 次 draw call +
410 份 model 缓冲（[cleanup](cleanup.md) 篇 `_model` 一节）；合并后 1 次 draw、
一份 15 KB 级顶点缓冲。这就是体素/城市/地图类场景"先合再画"的全部动机。

## 4. 扩展与边界

- **挖洞/改造**：`heights[]` 改一格 → 重跑合并 → `createMesh(geo, oldMesh)` 传 `out`
  原地 reset（d.ts 204），旧 GPU 资源随 reset 释放——小场景每帧重建都扛得住；
  动态改体素的官方设施（如 chunk 管理）没有，全是应用层自己的账。
- **贪心合并（greedy meshing）**：相邻同色暴露面可再并成大矩形，本例未做——
  剔除 85% 已是主要收益，贪心合并省的是常数级顶点量，复杂度另算。
- **贴图版**：把调色板换成纹理图集（uv 按方块类型选格）即可走 Minecraft 外观路线，
  机制 = [canvas-textures](canvas-textures.md) 篇上传 + 本例 uv 重映射，未逐图取证。
- 与 [optimize-lots-of-objects](optimize-lots-of-objects.md) 篇的合批路线互补：
  几何合并是"从源头少画"，批处理是"多对象少切换"。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-voxel        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-voxel/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-voxel
```

示例目录：`docs/manual/examples/manual-voxel/`。
验证器 4/4 全 PASS（3.7s，子集运行 partial）；截图 `docs/evidence/examples/manual-voxel.png`；
探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-voxel/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Making Voxel Geometry (Minecraft) — 体素几何（docs/manual/voxel-geometry.md）</title>
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

`examples/manual-voxel/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Making Voxel Geometry (Minecraft)（体素几何）
 * 配套文章：docs/manual/voxel-geometry.md
 *
 * 目标场景：12×24×12 体素山，用"邻居不透明就丢面"的可见性剔除把数千 cube 合并成
 * 单个大网格，再按高度染顶点色，环绕观看。AIR 侧逐件实现：primitives.box() 现造 6 面模板（面序 +Z,+X,-Z,-X,-Y,+Y，源码
 * build js 54805 faceNormals 实锤）→ 应用层手工合并 positions/normals/uvs/colors/
 * indices 成一个大 IGeometry → utils.createMesh 一次建 Mesh → 一个 MeshRenderer
 * 一次 draw call；顶点色走 USE_VERTEX_COLOR 宏（builtin-standard 着色器面已含
 * a_color 通道，builtin-effects.ts 628/668）。
 * 本例：12×12 网格 sin/cos 高度场，只保留暴露面，按高度分层调色板（水→草→沙→岩→雪），
 * 整体匀速自转（持续变化源，供帧差取证）。覆盖层打印"体素数/暴露面数/顶点数"对照
 * 朴素 6 面全建的浪费倍数——draw call 与顶点量的账，当面算给你看。
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

const scene = new Scene('voxel');

// ---- 方向光 + 相机（俯角看山体轮廓） ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-35, 30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 10;

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(11.5, 9.5, 12.5));
cameraNode.lookAt(new Vec3(0, 1.5, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 高度场：12×12 网格，sin/cos 混合，高度 1..8 ----
const GRID = 12;
const heights = new Int16Array(GRID * GRID);
for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
        const wave =
            0.5 + 0.5 * Math.sin(x * 0.55 + 0.3) * Math.cos(z * 0.42) + 0.5 * (0.5 + 0.5 * Math.sin(z * 0.6 - x * 0.2));
        heights[z * GRID + x] = 1 + Math.floor(3.2 * wave); // 1..8 名义区间，实测本波形 1..5
    }
}
const maxH = Math.max(...heights);

// 体素占据判定：网格外=空；y<0 视为实心（底面永不暴露，通用地面约定）
function solid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (x < 0 || x >= GRID || z < 0 || z >= GRID) return false;
    return y < heights[z * GRID + x];
}

// ---- 面模板：primitives.box(1) 的 6 个面拆成 6 个 quad（4 顶点+6 索引/面，面序固定） ----
const boxPrim = primitives.box({ width: 1, height: 1, length: 1 });
const faces: { dir: number[]; vbase: number; idxStart: number }[] = [];
for (let f = 0; f < 6; f++) {
    const n = f * 12; // 该面首顶点的 normal 起点：(f*4 顶点)*3 分量
    faces.push({
        dir: [Math.round(boxPrim.normals[n]), Math.round(boxPrim.normals[n + 1]), Math.round(boxPrim.normals[n + 2])],
        vbase: f * 4,
        idxStart: f * 6,
    });
}

// ---- 高度分层调色板（0..maxH-1 循环），亮色系：sRGB→linear 会压暗（cleanup 篇同款口径） ----
// 实测坑：createMesh 默认 colors 属性是 RGBA32F（create-mesh.ts _defAttrs[4]），
// 分量必须给 0..1 归一浮点——写 0..255 会被 shader 当 >1 截断成纯白（首版截图实锤）
const PALETTE = [
    [70, 150, 210], // 水
    [90, 190, 120], // 草
    [170, 205, 110], // 浅草
    [215, 195, 140], // 沙岩
    [200, 200, 205], // 岩
    [245, 248, 255], // 雪
].map((c) => c.map((v) => v / 255));

// ---- 合并：只发暴露面，顶点色按层 ----
const positions: number[] = [];
const normals: number[] = [];
const uvs: number[] = [];
const colors: number[] = [];
const indices: number[] = [];
let voxelCount = 0;
let exposedFaces = 0;
const OFF = (GRID - 1) / 2; // 居中：格坐标 → 世界坐标偏移

for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
        const h = heights[z * GRID + x];
        for (let y = 0; y < h; y++) {
            voxelCount++;
            for (let f = 0; f < 6; f++) {
                const face = faces[f];
                if (solid(x + face.dir[0], y + face.dir[1], z + face.dir[2])) continue; // 邻居挡住 → 丢面
                const base = positions.length / 3;
                const c = PALETTE[y % PALETTE.length];
                for (let k = 0; k < 4; k++) {
                    // 4 顶点：平移复制 + 法线 + uv + 色
                    const vp = (face.vbase + k) * 3;
                    positions.push(
                        boxPrim.positions[vp] + x - OFF,
                        boxPrim.positions[vp + 1] + y,
                        boxPrim.positions[vp + 2] + z - OFF,
                    );
                    normals.push(boxPrim.normals[vp], boxPrim.normals[vp + 1], boxPrim.normals[vp + 2]);
                    const vt = (face.vbase + k) * 2;
                    uvs.push(boxPrim.uvs[vt], boxPrim.uvs[vt + 1]);
                    colors.push(c[0], c[1], c[2], 1); // RGBA32F 归一浮点（见 PALETTE 处实测坑注释）
                }
                for (let k = 0; k < 6; k++) {
                    // 6 索引：面内局部索引重映射到合并缓冲
                    indices.push(base + boxPrim.indices[face.idxStart + k] - face.vbase);
                }
                exposedFaces++;
            }
        }
    }
}

const geometry: primitives.IGeometry = {
    positions,
    normals,
    uvs,
    colors,
    indices,
    minPos: new Vec3(-OFF - 0.5, 0, -OFF - 0.5),
    maxPos: new Vec3(OFF + 0.5, maxH, OFF + 0.5),
};
const mergedMesh = utils.createMesh(geometry);

// ---- 单节点单材质单 draw call ----
const terrain = new Node('VoxelTerrain');
terrain.layer = Layers.Enum.DEFAULT;
scene.addChild(terrain);
const renderer = terrain.addComponent(MeshRenderer);
renderer.mesh = mergedMesh;
const mat = new Material();
mat.initialize({
    effectName: 'builtin-standard',
    defines: { USE_VERTEX_COLOR: true }, // 顶点色宏：a_color 通道进 albedo（builtin-effects 628/668）
});
renderer.material = mat;

// ---- 自转（持续变化源）+ 覆盖层算账 ----
const info = document.querySelector('#info') as HTMLElement;

class Spin extends Component {
    private _a = 0;
    update(dt: number): void {
        this._a = ((this._a || 0) + 16 * dt) % 360;
        this.node.setRotationFromEuler(0, this._a, 0);
        info.textContent = [
            'voxel merge: 12x12 heightfield, exposed faces only -> ONE IGeometry -> ONE Mesh -> ONE draw call',
            `voxels=${voxelCount}  maxH=${maxH}  grid=${GRID}x${GRID}`,
            `naive faces=${voxelCount * 6}  exposed faces=${exposedFaces}  culled=${Math.round((1 - exposedFaces / (voxelCount * 6)) * 100)}%`,
            `verts=${positions.length / 3}  indices=${indices.length}  (per-face 4v+6i, hidden neighbors dropped)`,
            `spin=${this._a.toFixed(0)} deg/s=16, USE_VERTEX_COLOR palette=${PALETTE.length} levels`,
        ].join('\n');
    }
}
const spin = terrain.addComponent(Spin);

window.__airApp = app;
window.__inspect = {
    camera,
    terrain,
    mergedMesh,
    spin,
    stats: {
        voxelCount,
        exposedFaces,
        verts: positions.length / 3,
        indices: indices.length,
        maxH,
        naiveFaces: voxelCount * 6,
    },
    heights: Array.from(heights),
};
app.run(scene);

console.log('[manual/voxel] running on cocosair');
```

---

上一篇：[释放资源（Freeing Resources）](cleanup.md) ｜ 下一篇：[开始做游戏（Start Making a Game）](game.md)
