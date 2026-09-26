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
