# 自定义几何（Custom BufferGeometry）

> 不用内置生成器，手写顶点数组造网格。
> 配套可运行示例：[`examples/manual-custom-geometry/`](examples/manual-custom-geometry/)（手写 IGeometry 正弦波纹网格）。

AIR 的这条路很直接：**拼一个普通 JS 对象（IGeometry）交给 `utils.createMesh`**——
没有顶点属性包装类，数组就是数组。

## 1. IGeometry 的四组数组

| 字段                | 内容       | 布局                                                                       |
| ------------------- | ---------- | -------------------------------------------------------------------------- |
| `positions`         | 顶点位置   | 扁平 `number[]`，每顶点 3 分量（x,y,z）                                    |
| `normals`           | 顶点法线   | 同上，决定受光朝向                                                         |
| `uvs`               | 纹理坐标   | 每顶点 2 分量                                                              |
| `indices`           | 三角形索引 | 每三角形 3 个顶点下标                                                      |
| `minPos` / `maxPos` | 包围盒     | `Vec3`，**必须与数据一致**（见 [图元一篇](primitives.md) §3 的 circle 坑） |

示例造一张 25×25 顶点、1152 三角形的正弦波纹面：

```ts
const AMP = 0.35;
const FREQ = 1.6;
const SEG = 24;
const HALF = 2.0;

function heightAt(x: number, z: number): number {
    return AMP * Math.sin(FREQ * x) * Math.cos(FREQ * z);
}
```

```js
        // 解析法线：n = normalize(-df/dx, 1, -df/dz)
        const dfdx = AMP * FREQ * Math.cos(FREQ * x) * Math.cos(FREQ * z);
        const dfdz = -AMP * FREQ * Math.sin(FREQ * x) * Math.sin(FREQ * z);
        const len = Math.hypot(dfdx, 1, dfdz);
        normals.push(-dfdx / len, 1 / len, -dfdz / len);
```

索引按格推进、每格两三角形（`a,c,b` / `b,c,d`），绕序与 `primitives.plane` 一致保证正面朝上：

```js
for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i;
        const b = a + 1;
        const c = a + (SEG + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
    }
}
```

## 2. 变成可渲染 Mesh

```js
const waveGeometry = {
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-HALF, -AMP, -HALF),
    maxPos: new Vec3(HALF, AMP, HALF),
};
```

```js
waveRenderer.mesh = utils.createMesh(waveGeometry);
```

`utils.createMesh` 是唯一入口：它把 IGeometry 上传成 GPU 缓冲并返回 `Mesh`，
之后与 `primitives.*` 产出的 mesh 用法完全相同（赋给 `MeshRenderer.mesh` 即可）。
想改顶点动画就重建 IGeometry 再 `createMesh`（或走 [动态纹理/顶点动画](canvas-textures.md) 的思路），
AIR 未暴露"就地改写顶点缓冲"的细粒度 API。

## 3. 实测读图与覆盖层

截图 `docs/evidence/examples/manual-custom-geometry.png`：波纹面的**起伏轮廓**在剪影边清晰可辨
（左/上边缘的正弦波浪形），证明数组被正确消费；本帧方向光贡献弱（环境光为主），
明暗起伏不如轮廓直观——这是当前环境的照明特性（参见 [光源一篇](lights.md) §4），非几何问题。

覆盖层实测（探针 dump）：

```
custom geometry: hand-written IGeometry (no primitives.*)
verts: 625  indices: 3456  tris: 1152
y = 0.35*sin(1.6x)*cos(1.6z), normals = analytic partials
utils.createMesh(IGeometry) → MeshRenderer.mesh
```

625 = (24+1)²、3456 = 24×24×6，与手写循环自洽。

## 4. 边界与注意点

- 没有顶点属性包装类与索引/法线的自动工具：法线要自己算（示例用解析偏导），
  包围盒要自己给（`minPos`/`maxPos`）。
- 没有绘制区间裁剪（draw range）、无多 draw call 分组；一个 IGeometry = 一个 mesh = 一次 draw。
- 顶点色字段存在（`colors`），但启用需材质宏配合，踩坑记录见 [图元一篇](primitives.md)。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-custom-geometry
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-custom-geometry
```

示例目录：`docs/manual/examples/manual-custom-geometry/`。
验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.8s，子集运行 partial）；
本例在 `ANIMATED` 集合内（网格自转 20°/s 保证双帧不同）。

## 附：示例源码（逐字）

`examples/manual-custom-geometry/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Custom BufferGeometry — 自定义几何（docs/manual/custom-buffergeometry.md）</title>
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

`examples/manual-custom-geometry/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Custom BufferGeometry（自定义几何）
 * 配套文章：docs/manual/custom-buffergeometry.md
 *
 * 不用任何 primitives 生成器：手写 IGeometry 的四组数组（positions / normals / uvs / indices）
 * 造一张正弦波纹网格 y = 0.35·sin(1.6x)·cos(1.6z)，法线用解析偏导归一化求得，
 * 再经 utils.createMesh 变成可渲染 Mesh。覆盖层打印顶点/索引数自证数组规模。
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
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('custom-geometry');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3.4, 5.2));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光让波纹明暗起伏 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 手写 IGeometry：正弦波纹网格 ----
const AMP = 0.35;
const FREQ = 1.6;
const SEG = 24;
const HALF = 2.0;

function heightAt(x: number, z: number): number {
    return AMP * Math.sin(FREQ * x) * Math.cos(FREQ * z);
}

const positions: number[] = [];
const normals: number[] = [];
const uvs: number[] = [];
const indices: number[] = [];
for (let j = 0; j <= SEG; j++) {
    for (let i = 0; i <= SEG; i++) {
        const x = -HALF + (i / SEG) * HALF * 2;
        const z = -HALF + (j / SEG) * HALF * 2;
        positions.push(x, heightAt(x, z), z);
        // 解析法线：n = normalize(-df/dx, 1, -df/dz)
        const dfdx = AMP * FREQ * Math.cos(FREQ * x) * Math.cos(FREQ * z);
        const dfdz = -AMP * FREQ * Math.sin(FREQ * x) * Math.sin(FREQ * z);
        const len = Math.hypot(dfdx, 1, dfdz);
        normals.push(-dfdx / len, 1 / len, -dfdz / len);
        uvs.push(i / SEG, j / SEG);
    }
}
for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i;
        const b = a + 1;
        const c = a + (SEG + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
    }
}

const waveGeometry = {
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-HALF, -AMP, -HALF),
    maxPos: new Vec3(HALF, AMP, HALF),
};

const waveNode = new Node('WaveGrid');
waveNode.layer = Layers.Enum.DEFAULT;
scene.addChild(waveNode);
const waveRenderer = waveNode.addComponent(MeshRenderer);
waveRenderer.mesh = utils.createMesh(waveGeometry);
const waveMaterial = new Material();
waveMaterial.initialize({ effectName: 'builtin-standard' });
waveMaterial.setProperty('mainColor', new Color(95, 205, 160, 255));
waveMaterial.setProperty('roughness', 0.5);
waveRenderer.material = waveMaterial;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 20, 0);
    }
}
waveNode.addComponent(Spinner);

const info = document.querySelector('#info') as HTMLElement;
info.textContent = [
    'custom geometry: hand-written IGeometry (no primitives.*)',
    `verts: ${positions.length / 3}  indices: ${indices.length}  tris: ${indices.length / 3}`,
    'y = 0.35*sin(1.6x)*cos(1.6z), normals = analytic partials',
    'utils.createMesh(IGeometry) → MeshRenderer.mesh',
].join('\n');

window.__airApp = app;
app.run(scene);

console.log('[manual/custom-geometry] running on cocosair');
```

---

上一篇：[渲染目标（Render Targets）](rendertargets.md) ｜ 下一篇：[物理（Physics）](physics.md)
