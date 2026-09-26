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
