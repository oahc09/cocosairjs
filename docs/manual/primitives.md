# Primitives 内置图元

> Cocos AIR 的内置图元是 `primitives.*` 命名空间：**返回纯数据 `IGeometry`**（positions/normals/uvs/indices/包围盒/拓扑），再经 `utils.createMesh` 变成可渲染的 `Mesh` 资产。
> 本篇给全清单、统一摆放代码，以及 `circle` 的三个实测坑。

> 前置阅读：[Fundamentals 基本概念](./fundamentals.md)

## 清单总览

以 `build/cocosair.module.d.ts` 为准（默认值引自 d.ts 注释）：

| 生成器     | 签名                                                                  | 默认尺寸 / 朝向                          |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `box`      | `box(options?)`，`options: { width, height, length, widthSegments… }` | 中心在原点                               |
| `cone`     | `cone(radius?, height?, opts?)`                                       | 半径 0.5、高 1                           |
| `cylinder` | `cylinder(radiusTop?, radiusBottom?, height?, opts?)`                 | 半径 0.5/0.5、高 2                       |
| `plane`    | `plane(options?)`，`{ width, length, widthSegments, lengthSegments }` | **XOZ 平面，法线 +Y**                    |
| `quad`     | `quad(options?)`                                                      | 宽高 1 的四边形                          |
| `sphere`   | `sphere(radius?, opts?)`                                              | 半径 0.5                                 |
| `torus`    | `torus(radius?, tube?, opts?)`                                        | 半径 0.4、管 0.1                         |
| `capsule`  | `capsule(radiusTop?, radiusBottom?, height?, opts?)`                  | 半径 0.5/0.5、高 2                       |
| `circle`   | `circle(options?)`，`{ radius, segments }`                            | 半径 1，**XY 平面，法线 +Z**；见 §3 的坑 |

辅助函数：`translate` / `scale`（几何级平移缩放）、`wireframed` / `wireframe`（线框化）、`invWinding`（反绕序）、`toWavefrontOBJ`（导出 OBJ 字符串）、`normals`（由位置算法线）、`applyDefaultGeometryOptions`。

细分参数命名不统一但可读：球是 `widthSegments/heightSegments`，柱/锥是 `radialSegments/heightSegments`，环是 `radialSegments/tubularSegments`，圆是 `segments`。

## 1. 统一摆放：IGeometry → Mesh

示例把 9 个图元摆成 3×3 全家福，核心循环只有一段：

```js
for (const [name, makeGeometry, color, x, y, tiltX, speed] of shapes) {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, 0));
    scene.addChild(node);

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(makeGeometry()); // IGeometry → Mesh 资产
```

三个要点：

- `primitives.*` 只产出**数据**，不碰 GPU；`utils.createMesh` 才创建 `Mesh` 资产（这一步之后才能赋给 `renderer.mesh`）；
- 每个形状 `new Material()` 独立实例 —— 共享 builtin 材质原地改属性会污染所有使用者（见 [Materials 材质](./materials.md)）；
- 平面类（plane/quad 法线 +Y）给 `+60°` 倾角把正面转向相机，且不自转：转到背面会被背面剔除吃掉。

## 2. 细分参数示例

```js
[
        'sphere',
        () => primitives.sphere(0.62, { widthSegments: 32, heightSegments: 16 }),
        new Color(90, 200, 220, 255),
        0,
        2.4,
        0,
        30,
    ],
    [
        'cylinder',
        () => primitives.cylinder(0.45, 0.45, 1.3, { radialSegments: 32 }),
        new Color(140, 220, 130, 255),
        3,
        2.4,
        0,
        30,
    ],
    ['cone', () => primitives.cone(0.55, 1.3, { radialSegments: 32 }), new Color(240, 210, 90, 255), -3, 0.6, 0, 30],
    [
        'torus',
        () => primitives.torus(0.5, 0.18, { radialSegments: 32, tubularSegments: 24 }),
        new Color(220, 110, 200, 255),
        0,
        0.6,
        0,
        30,
    ],
```

段数只影响**数据量与圆滑度**：sphere 32×16 约千级三角面；把段数砍到 8 就能肉眼看到棱。性能篇会回到"段数 × 实例数"的乘法问题（见 [Optimize Lots of Objects 优化大量物体](./optimize-lots-of-objects.md)）。

## 3. circle 的三个实测坑

`circle` 是清单里唯一"开箱不平"的图元，示例里为它写了专门处理：

```ts
[
        'circle',
        () => {
            // circle 两个实测坑：不带 normals（standard 光照会黑）、minPos/maxPos 写反（包围盒无效）
            const g = primitives.circle({ radius: 0.75, segments: 40 });
            const count = g.positions.length / 3;
            g.normals = new Array<number>(count * 3).fill(0);
            for (let i = 2; i < count * 3; i += 3) g.normals[i] = 1; // XY 平面圆，法线 +Z
            if (g.minPos.x > g.maxPos.x) {
                const t = g.minPos;
                g.minPos = g.maxPos;
                g.maxPos = t;
            }
            return g;
        },
        new Color(250, 150, 160, 255),
        0,
        -1.2,
        0,
        0,
    ],
```

1. **不带 normals**：`builtin-standard` 按顶点法线做光照，法线缺失即黑面；圆在 XY 平面，逐顶点补 `(0,0,1)` 即可（通用算法线可用 `primitives.normals`）。
2. **minPos/maxPos 写反**（源码里 `minPos:(1,1,0)`、`maxPos:(-1,-1,0)`）：包围盒无效会影响剔除/取景，交给 `createMesh` 前先对调。
3. **拓扑是 TRIANGLE_FAN，而 pass 的 PSO 会把 primitiveMode 覆盖成 TRIANGLE_LIST**：不 override 就会把扇形索引 `[0,1,2,2,3,3,…]` 按三角列表误读，画出来是一地碎条。修法与画线篇同源（[Drawing Lines 画线](./drawing-lines.md)）：

```js
    if (name === 'circle') {
        renderer.getMaterialInstance(0).overridePipelineStates({ primitive: gfx.PrimitiveMode.TRIANGLE_FAN });
    }
```

其余 8 个图元都是 TRIANGLE_LIST 且自带法线，无此问题。截图证据：`docs/evidence/examples/manual-primitives.png`（第三行中间的完整圆盘即修复后的 circle）。

## 4. 跑示例与验证记录

示例工程：`docs/manual/examples/manual-primitives/`（index.html + main.ts，零外部资产）；dev server 地址 `http://127.0.0.1:7454/manual/examples/manual-primitives/`。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-primitives`（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS，3.7s；六个立体图元自转使双帧不同），截图 `docs/evidence/examples/manual-primitives.png` —— 应看到 3×3 九个图元，第三行平面类带倾角朝向相机。

## 5. 清单不够用时

`IGeometry` 就是 `{ positions, normals?, uvs?, indices?, minPos, maxPos, boundingRadius, primitiveMode? }` 的 plain object —— 手写一个四面体和调用 `primitives.box` 走的是同一条 `utils.createMesh` 通道，详见 [Custom BufferGeometry 自定义几何](./custom-buffergeometry.md)。要把几何导出给 DCC 工具，用 `primitives.toWavefrontOBJ(geometry)`。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Primitives — 内置图元（docs/manual/primitives.md）</title>
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

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Primitives（内置图元）
 * 配套文章：docs/manual/primitives.md
 *
 * 3×3 全家福：box / sphere / cylinder / cone / torus / capsule / plane / circle / quad，
 * 每个都缓慢自转（平面类带 -60° 倾角以便正面可见）。
 * 所有几何都来自 primitives.*（IGeometry 纯数据），经 utils.createMesh 变成 Mesh 资产。
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
    gfx,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('primitives');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 0.9, 9.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 自转组件：tiltX 给平面类图元一个正面倾角 ----
class Rotator extends Component {
    tiltX = 0;
    speed = 30;
    private _angle = 0;

    constructor() {
        super();
        this.tiltX = 0;
        this.speed = 30;
        this._angle = 0;
    }
    update(dt: number): void {
        this._angle += dt * this.speed;
        this.node.setRotationFromEuler(this.tiltX, this._angle, 0);
    }
}

// ---- 3×3 图元全家福 ----
// [名字, IGeometry 工厂, 颜色, 列 x, 行 y, 倾角, 自转速度]
// 平面类不自转（转到背面会被剔除）：plane/quad 法线朝 +Y，倾角 +60° 转向相机；circle 法线本就朝 +Z，无需倾角
const shapes: [string, () => primitives.IGeometry, Color, number, number, number, number][] = [
    ['box', () => primitives.box({ width: 1, height: 1, length: 1 }), new Color(230, 120, 60, 255), -3, 2.4, 0, 30],
    [
        'sphere',
        () => primitives.sphere(0.62, { widthSegments: 32, heightSegments: 16 }),
        new Color(90, 200, 220, 255),
        0,
        2.4,
        0,
        30,
    ],
    [
        'cylinder',
        () => primitives.cylinder(0.45, 0.45, 1.3, { radialSegments: 32 }),
        new Color(140, 220, 130, 255),
        3,
        2.4,
        0,
        30,
    ],
    ['cone', () => primitives.cone(0.55, 1.3, { radialSegments: 32 }), new Color(240, 210, 90, 255), -3, 0.6, 0, 30],
    [
        'torus',
        () => primitives.torus(0.5, 0.18, { radialSegments: 32, tubularSegments: 24 }),
        new Color(220, 110, 200, 255),
        0,
        0.6,
        0,
        30,
    ],
    ['capsule', () => primitives.capsule(0.4, 0.4, 0.8), new Color(130, 150, 240, 255), 3, 0.6, 0, 30],
    ['plane', () => primitives.plane({ width: 1.5, length: 1.5 }), new Color(240, 240, 240, 255), -3, -1.2, 60, 0],
    [
        'circle',
        () => {
            // circle 两个实测坑：不带 normals（standard 光照会黑）、minPos/maxPos 写反（包围盒无效）
            const g = primitives.circle({ radius: 0.75, segments: 40 });
            const count = g.positions.length / 3;
            g.normals = new Array<number>(count * 3).fill(0);
            for (let i = 2; i < count * 3; i += 3) g.normals[i] = 1; // XY 平面圆，法线 +Z
            if (g.minPos.x > g.maxPos.x) {
                const t = g.minPos;
                g.minPos = g.maxPos;
                g.maxPos = t;
            }
            return g;
        },
        new Color(250, 150, 160, 255),
        0,
        -1.2,
        0,
        0,
    ],
    ['quad', () => primitives.quad(), new Color(160, 230, 190, 255), 3, -1.2, 60, 0],
];

for (const [name, makeGeometry, color, x, y, tiltX, speed] of shapes) {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, 0));
    scene.addChild(node);

    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(makeGeometry()); // IGeometry → Mesh 资产

    const material = new Material(); // 绝不改共享 builtin 材质：每个都新建实例
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    material.setProperty('metallic', 0.0);
    material.setProperty('roughness', 0.45);
    renderer.material = material;

    // 第三个坑：pass 的 PSO 会把 primitiveMode 覆盖成 TRIANGLE_LIST，
    // circle 是 TRIANGLE_FAN，不 override 就会把扇形索引误三角化成碎条
    if (name === 'circle') {
        renderer.getMaterialInstance(0).overridePipelineStates({ primitive: gfx.PrimitiveMode.TRIANGLE_FAN });
    }

    const rotator = node.addComponent(Rotator);
    rotator.tiltX = tiltX;
    rotator.speed = speed;
}

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：图元清单 ============
(document.querySelector('#info') as HTMLElement).textContent = [
    'primitives: 9 shapes (3x3)',
    'row1: box / sphere / cylinder',
    'row2: cone / torus / capsule',
    'row3: plane(+60°) / circle / quad(+60°), static',
    'helpers: translate / scale / wireframed / toWavefrontOBJ',
].join('\n');

console.log('[manual/primitives] running on cocosair');
```

## API 参考

`primitives.box|cone|cylinder|plane|quad|sphere|torus|capsule|circle`、`primitives.translate|scale|wireframed|wireframe|invWinding|toWavefrontOBJ|normals|applyDefaultGeometryOptions`、`utils.createMesh(geometry, out?, options?)`、`MeshRenderer.mesh|material`、`Material.getMaterialInstance` 侧的 `overridePipelineStates({ primitive })`、`gfx.PrimitiveMode`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Scenegraph 场景图](./scenegraph.md) —— 节点树、变换继承与 `active` 开关。
