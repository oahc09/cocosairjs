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
