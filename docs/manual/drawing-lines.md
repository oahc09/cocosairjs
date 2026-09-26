# Drawing Lines 绘制线条

> Cocos AIR 没有"线"这种一等公民组件，但**线拓扑本身是通的**：`utils.createMesh` 接受 `primitiveMode: gfx.PrimitiveMode.LINE_LIST`，再用材质实例把 pass 的绘制图元改回 `LINE_LIST` 即可得到 1px 真线。
> 本篇给出两条路：真线拓扑（坐标轴、网格、线框盒），以及细长方盒（可控"线宽"、参与光照），并把两个实测坑讲清楚。

> 前置阅读：[Creating a Scene 创建场景](./creating-a-scene.md)

## 画线要点

| Cocos AIR 做法                                                                | 说明                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `utils.createMesh({ positions, primitiveMode: gfx.PrimitiveMode.LINE_LIST })` | 几何侧支持线拓扑                                                |
| `MeshRenderer` + 材质实例 `overridePipelineStates({ primitive: LINE_LIST })`  | **不做这一步，线顶点会被按 TRIANGLE_LIST 画成填充面**（见坑 1） |
| `builtin-unlit` + `setProperty('mainColor', ...)`                             | 线不受光，用 unlit                                              |
| **无可变线宽的线组件**                                                        | 想要粗线只能用细长方盒（途径 2）                                |
| 手工边表，或 `primitives.wireframed()`                                        | 立方体线框的做法，见途径 1                                      |

## 坑 1：mesh 的 primitiveMode 会被 PSO 覆盖

`utils.createMesh` 确实会把 `geometry.primitiveMode` 写进 sub-mesh（`src/cocos/3d/misc/create-mesh.ts:186`），但 WebGL 后端绘制时用的图元来自**管线状态对象**（`webgl2-commands.ts`：`gfxStateCache.glPrimitive = gpuPipelineState.glPrimitive`），而 PSO 的图元由 effect 的 pass 决定，默认 `TRIANGLE_LIST`。

后果很直观：把 6 个线顶点（3 段线）交给默认 pass，会画出 2 个三角形；把 11×11 的网格顶点交出去，会画出一团放射状填充面。修法是在**材质实例**上覆盖管线状态：

```ts
function attachLineMaterial(renderer: MeshRenderer, rgba: number[]) {
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_COLOR: false } });
    material.setProperty('mainColor', new Color(rgba[0], rgba[1], rgba[2], rgba[3]));
    renderer.material = material;
    const instance = renderer.getMaterialInstance(0);
    instance.overridePipelineStates({ primitive: gfx.PrimitiveMode.LINE_LIST });
    return instance;
}
```

注意 `overridePipelineStates` 只在**材质实例**上有效：`Material` 基类的同名方法是只告警的空实现，必须先 `renderer.getMaterialInstance(0)` 拿实例。

## 坑 2：USE_COLOR 打开而几何没有颜色属性 = 黑线

`builtin-unlit` 支持 `defines: { USE_COLOR: true }` 读逐顶点色，但如果你的几何**没有** `colors` 数组，顶点色会读成 0，线与深色背景融为一体，看起来像"线没画出来"。本篇一律 `USE_COLOR: false`、颜色只走 `mainColor`；要逐顶点色，请确保 `createMesh` 时传了与顶点数匹配的 `colors`（每顶点 4 个 0..1 分量）。

## 途径 1：真线拓扑

线段表 → mesh → 线材质，三步：

```ts
/**
 * 用线段表（每两个顶点一段）建一个 LINE_LIST mesh。
 * @param {number[][]} segments 每项 [x1, y1, z1, x2, y2, z2]
 */
function lineListMesh(segments: number[][]) {
    const positions: number[] = [];
    for (const s of segments) {
        positions.push(s[0], s[1], s[2], s[3], s[4], s[5]);
    }
    return utils.createMesh({
        positions,
        primitiveMode: gfx.PrimitiveMode.LINE_LIST,
    });
}

function addLineNode(name: string, segments: number[][], rgba: number[]): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = lineListMesh(segments);
    attachLineMaterial(renderer, rgba);
    return node;
}

// 三根坐标轴：X 红 / Y 绿 / Z 蓝，各一个 mesh（颜色由各自 mainColor 保证）
const AXIS = 2.4;
addLineNode('Axis X', [[-AXIS, 0, 0, AXIS, 0, 0]], [255, 70, 50, 255]);
addLineNode('Axis Y', [[0, -AXIS * 0.4, 0, 0, AXIS, 0]], [80, 230, 110, 255]);
addLineNode('Axis Z', [[0, 0, -AXIS, 0, 0, AXIS]], [80, 150, 255, 255]);
```

地面网格：**一个 mesh 一次 draw call**（121 段线 = 242 顶点），这是真线拓扑相对细盒的最大优势：

```ts
// 地面网格：XZ 平面上每 0.6 一根线，一个 mesh 一次 draw call
const gridSegments: number[][] = [];
const GRID = 3;
const STEP = 0.6;
for (let i = -GRID; i <= GRID + 0.001; i += STEP) {
    const t = Math.round(i * 100) / 100;
    gridSegments.push([t, 0, -GRID, t, 0, GRID]);
    gridSegments.push([-GRID, 0, t, GRID, 0, t]);
}
addLineNode('Grid', gridSegments, [120, 160, 185, 255]);
```

立方体线框本可以直接用 `primitives.wireframed` 把实心 mesh 转成线框 mesh，但本篇实测中，把它与上面的 LINE_LIST 覆盖路径组合时**画面里没有出线**（截图证据见台账），原因未定位；因此示例改用手工边表 —— 12 条边的表写一次就够，后续增删边也直观。若你在自己的项目里让 `wireframed` 跑通了，欢迎回补本篇。

```ts
// 立方体边线框：12 条边手工列出，一个 mesh
const H = 0.5;
const C: number[][] = [
    [-H, -H, -H],
    [H, -H, -H],
    [H, -H, H],
    [-H, -H, H],
    [-H, H, -H],
    [H, H, -H],
    [H, H, H],
    [-H, H, H],
];
const EDGES: number[][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
];
const wireNode = addLineNode(
    'Cube Wireframe',
    EDGES.map(([a, b]) => [...C[a], ...C[b]]),
    [255, 190, 80, 255],
);
wireNode.setPosition(new Vec3(-2.2, 1.1, 0));
```

## 途径 2：细长方盒（可控"线宽"）

真线永远是 1px（WebGL 的 `lineWidth` 在绝大多数实现里被钳到 1）。要"粗线"就用拉长的 box：

```ts
/**
 * 用拉长的 box 模拟一根粗线。
 * @param {string} name 节点名
 * @param {number[]} from 起点 [x,y,z]
 * @param {number[]} to 终点 [x,y,z]
 * @param {number} thickness 截面边长
 * @param {Color} color 材质主色
 */
function addBeam(name: string, from: number[], to: number[], thickness: number, color: Color): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    node.setWorldPosition(new Vec3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2));
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: thickness, height: thickness, length }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    renderer.material = material;
    // box 的长边是 +Z：lookAt 终点即把长边转到线段方向
    node.lookAt(new Vec3(to[0], to[1], to[2]));
    return node;
}

// 三条粗棱从同一角出发，与真线并排对比粗细
addBeam('Beam X', [0, 1.2, 0], [2.0, 1.2, 0], 0.07, new Color(255, 90, 70, 255));
addBeam('Beam Y', [0, 1.2, 0], [0, 3.0, 0], 0.07, new Color(90, 230, 120, 255));
addBeam('Beam Z', [0, 1.2, 0], [0, 1.2, 2.0], 0.07, new Color(90, 150, 255, 255));
```

`primitives.box` 的长边是 **+Z**（`length` 对应 z 轴），所以 `node.lookAt(to)` 一步就把长边转到线段方向上；先 `setWorldPosition` 到中点，`lookAt` 才不会顺带改掉长度方向。想拿它做 3D 里任意两点间的连线，这套"中点 + lookAt + length 距离"就是完整配方，不需要四元数手搓。代价是每根 12 个三角形 + 一次独立 draw call，见下节成本对照。

## 成本对照（本页实测）

用 `device.numDrawCalls` / `numTris` 量（见 [Installation](./installation.md) §5）：本页 9 个节点共 **9 次 draw call**（5 个线 mesh + 3 根 beam + 1 个参照 cube），三角形计数里线拓扑只贡献顶点不贡献三角形。把 121 段网格换成细盒需要 121×12 = 1452 个三角形和 121 次 draw call —— 这就是"网格/坐标轴用真线、交互线用细盒"的分工依据。

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-drawing-lines/
```

示例工程：`docs/manual/examples/manual-drawing-lines/`（index.html + main.ts，零外部资产）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-drawing-lines`（`app-contract` / `visible-frame` / `no-runtime-error` PASS；本页静止，不参与 `frame-diff`），截图 `docs/evidence/examples/manual-drawing-lines.png` —— 截图里应看到：橙色线框盒、红/绿/蓝三轴、浅蓝网格、三根粗棱、中心受光 cube。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Drawing Lines — 绘制线条（docs/manual/drawing-lines.md）</title>
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
                background: rgba(10, 16, 26, 0.72);
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

`#info` 覆盖层只是把"当前用的是哪条画线途径"打到画布左上角，便于肉眼核对；它不参与渲染管线。

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Drawing Lines（绘制线条）
 * 配套文章：docs/manual/drawing-lines.md
 *
 * 演示两种"画线"途径，全部零外部资产：
 *  1. 真线拓扑：utils.createMesh({ primitiveMode: gfx.PrimitiveMode.LINE_LIST })
 *     + builtin-unlit 材质实例 overridePipelineStates({ primitive: LINE_LIST })
 *     —— RGB 三根坐标轴、地面网格、立方体边线框，都是 1px 真线
 *  2. 细长方盒：primitives.box 拉长 —— 线宽可控、参与光照，代价是每根 12 个三角形
 *
 * 两个实测坑（文章与台账都有记录）：
 *  - mesh 的 primitiveMode 会被 pass 的 PSO 覆盖成 TRIANGLE_LIST，不 override 就会把线顶点三角化成填充面；
 *  - builtin-unlit 打开 USE_COLOR 而几何没有颜色属性时，顶点色读成 0，线会变黑融进深色背景，
 *    所以本篇一律用 mainColor 上色，不用逐顶点色。
 */

import {
    gfx,
    Layers,
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    builtinResMgr,
    utils,
    primitives,
    Vec3,
    Color,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('drawing-lines');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(4.2, 3.4, 5.6));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 36, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源（只影响 standard 材质；unlit 线条不受光） ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ============ 途径 1：真线拓扑 LINE_LIST ============

/**
 * 纯色线材质：builtin-unlit（不打开 USE_COLOR，颜色只来自 mainColor）。
 * 关键一步：mesh 的 primitiveMode 会被 pass 的 PSO 覆盖成 TRIANGLE_LIST，
 * 必须用材质实例 overridePipelineStates 把绘制图元改回 LINE_LIST。
 *
 * @param {MeshRenderer} renderer 目标渲染器
 * @param {number[]} rgba 主色 [r, g, b, a]，0..255
 */
function attachLineMaterial(renderer: MeshRenderer, rgba: number[]) {
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_COLOR: false } });
    material.setProperty('mainColor', new Color(rgba[0], rgba[1], rgba[2], rgba[3]));
    renderer.material = material;
    const instance = renderer.getMaterialInstance(0);
    instance.overridePipelineStates({ primitive: gfx.PrimitiveMode.LINE_LIST });
    return instance;
}

/**
 * 用线段表（每两个顶点一段）建一个 LINE_LIST mesh。
 * @param {number[][]} segments 每项 [x1, y1, z1, x2, y2, z2]
 */
function lineListMesh(segments: number[][]) {
    const positions: number[] = [];
    for (const s of segments) {
        positions.push(s[0], s[1], s[2], s[3], s[4], s[5]);
    }
    return utils.createMesh({
        positions,
        primitiveMode: gfx.PrimitiveMode.LINE_LIST,
    });
}

function addLineNode(name: string, segments: number[][], rgba: number[]): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = lineListMesh(segments);
    attachLineMaterial(renderer, rgba);
    return node;
}

// 三根坐标轴：X 红 / Y 绿 / Z 蓝，各一个 mesh（颜色由各自 mainColor 保证）
const AXIS = 2.4;
addLineNode('Axis X', [[-AXIS, 0, 0, AXIS, 0, 0]], [255, 70, 50, 255]);
addLineNode('Axis Y', [[0, -AXIS * 0.4, 0, 0, AXIS, 0]], [80, 230, 110, 255]);
addLineNode('Axis Z', [[0, 0, -AXIS, 0, 0, AXIS]], [80, 150, 255, 255]);

// 地面网格：XZ 平面上每 0.6 一根线，一个 mesh 一次 draw call
const gridSegments: number[][] = [];
const GRID = 3;
const STEP = 0.6;
for (let i = -GRID; i <= GRID + 0.001; i += STEP) {
    const t = Math.round(i * 100) / 100;
    gridSegments.push([t, 0, -GRID, t, 0, GRID]);
    gridSegments.push([-GRID, 0, t, GRID, 0, t]);
}
addLineNode('Grid', gridSegments, [120, 160, 185, 255]);

// 立方体边线框：12 条边手工列出，一个 mesh
const H = 0.5;
const C: number[][] = [
    [-H, -H, -H],
    [H, -H, -H],
    [H, -H, H],
    [-H, -H, H],
    [-H, H, -H],
    [H, H, -H],
    [H, H, H],
    [-H, H, H],
];
const EDGES: number[][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
];
const wireNode = addLineNode(
    'Cube Wireframe',
    EDGES.map(([a, b]) => [...C[a], ...C[b]]),
    [255, 190, 80, 255],
);
wireNode.setPosition(new Vec3(-2.2, 1.1, 0));

// ============ 途径 2：细长方盒（可控"线宽"） ============

/**
 * 用拉长的 box 模拟一根粗线。
 * @param {string} name 节点名
 * @param {number[]} from 起点 [x,y,z]
 * @param {number[]} to 终点 [x,y,z]
 * @param {number} thickness 截面边长
 * @param {Color} color 材质主色
 */
function addBeam(name: string, from: number[], to: number[], thickness: number, color: Color): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    node.setWorldPosition(new Vec3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2));
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: thickness, height: thickness, length }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    renderer.material = material;
    // box 的长边是 +Z：lookAt 终点即把长边转到线段方向
    node.lookAt(new Vec3(to[0], to[1], to[2]));
    return node;
}

// 三条粗棱从同一角出发，与真线并排对比粗细
addBeam('Beam X', [0, 1.2, 0], [2.0, 1.2, 0], 0.07, new Color(255, 90, 70, 255));
addBeam('Beam Y', [0, 1.2, 0], [0, 3.0, 0], 0.07, new Color(90, 230, 120, 255));
addBeam('Beam Z', [0, 1.2, 0], [0, 1.2, 2.0], 0.07, new Color(90, 150, 255, 255));

// 中心参照物：一个受光的实心 cube，用来确认三条轴的方向
const cubeNode = new Node('Reference Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.5, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
cubeRenderer.material = builtinResMgr.get('builtin-standard-material');

window.__airApp = app;
app.run(scene);

document.querySelector('#info')!.textContent = [
    'lines: LINE_LIST + overridePipelineStates',
    'beams: thin boxes (width 0.07)',
    `nodes: ${scene.children.length}`,
].join('\n');

console.log('[manual/drawing-lines] running on cocosair');
```

## API 参考

`gfx.PrimitiveMode`（`LINE_LIST:1` / `LINE_STRIP:2` / `LINE_LOOP:3`）、`utils.createMesh`（`IGeometry.primitiveMode`）、`Material.initialize({ effectName, defines })`、`MeshRenderer.getMaterialInstance(0)`、`MaterialInstance.overridePipelineStates({ primitive })`、`primitives.box` / `primitives.wireframed`、`device.numDrawCalls` / `numTris`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Loading 3D Models 加载 3D 模型](./loading-3d-models.md) —— 用内联 glTF JSON 走 `GLTFLoader`，讲清 decoder 注入边界。
