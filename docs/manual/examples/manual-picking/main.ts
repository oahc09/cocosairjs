/**
 * Cocos AIR 开发手册 — Picking Objects with the Mouse（鼠标拾取）
 * 配套文章：docs/manual/picking.md
 *
 * AIR 顶层导出里没有 Ray/AABB 构造器，也没有内置 Raycaster，但相机组件自带
 * screenPointToRay(x, y) 返回一条几何射线（o 起点 + d 方向），拾取由此自建。
 * 本例：3×3 彩色立方体网格，把鼠标屏幕坐标转成射线，与应用层手算的立方体 AABB 做 slab 相交，
 * 命中的立方体放大 + 变白。无鼠标时（自动验证器）射线沿 Lissajous 轨迹自动扫过网格，保证画面持续变化。
 * 覆盖层打印当前指针坐标与命中序号，供探针取证。
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

const scene = new Scene('picking');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(4.5, 5.5, 8.5));
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

// ---- 3×3 彩色立方体网格 ----
const HALF = 0.5;
const SPACING = 1.7;
const sharedMesh = utils.createMesh(primitives.box({ width: HALF * 2, height: HALF * 2, length: HALF * 2 }));
const cubes: { node: Node; mat: Material; base: number[]; center: Vec3 }[] = [];
const palette = [
    [220, 90, 90],
    [90, 200, 120],
    [90, 140, 230],
    [225, 190, 80],
    [170, 110, 220],
    [90, 195, 200],
    [230, 130, 70],
    [150, 210, 90],
    [210, 100, 170],
];
let idx = 0;
for (let gz = -1; gz <= 1; gz++) {
    for (let gx = -1; gx <= 1; gx++) {
        const n = new Node(`Cube-${idx}`);
        n.layer = Layers.Enum.DEFAULT;
        n.setPosition(new Vec3(gx * SPACING, 0, gz * SPACING));
        scene.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = sharedMesh;
        const m = new Material();
        m.initialize({ effectName: 'builtin-standard' });
        const base = palette[idx];
        m.setProperty('mainColor', new Color(base[0], base[1], base[2], 255));
        r.material = m;
        cubes.push({ node: n, mat: m, base, center: new Vec3(gx * SPACING, 0, gz * SPACING) });
        idx++;
    }
}

// ---- 应用层射线 vs AABB（slab 相交，无第三方依赖） ----
function rayHitsAABB(o: Vec3, d: Vec3, center: Vec3, half: number): number {
    let tMin = -Infinity;
    let tMax = Infinity;
    const ax = [center.x - half, center.y - half, center.z - half];
    const bx = [center.x + half, center.y + half, center.z + half];
    const oc = [o.x, o.y, o.z];
    const dc = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
        if (Math.abs(dc[i]) < 1e-8) {
            if (oc[i] < ax[i] || oc[i] > bx[i]) return -1;
        } else {
            let t0 = (ax[i] - oc[i]) / dc[i];
            let t1 = (bx[i] - oc[i]) / dc[i];
            if (t0 > t1) {
                const t = t0;
                t0 = t1;
                t1 = t;
            }
            if (t0 > tMin) tMin = t0;
            if (t1 < tMax) tMax = t1;
            if (tMin > tMax) return -1;
        }
    }
    return tMax < 0 ? -1 : tMin >= 0 ? tMin : tMax;
}

// ---- 指针：有鼠标用鼠标，否则 Lissajous 自动扫 ----
const info = document.querySelector('#info') as HTMLElement;
const pointer: { x: number; y: number; source: string } = { x: 0.5, y: 0.5, source: 'auto' };
input.on(SystemEventType.MOUSE_MOVE, (e) => {
    const loc = e.getUILocation();
    pointer.x = loc.x / window.innerWidth;
    pointer.y = loc.y / window.innerHeight;
    pointer.source = 'mouse';
});

// ---- 光标标记：射线与地面 y=0 的交点处一颗亮黄小球，持续可见指针落点 ----
const cursorNode = new Node('Cursor');
cursorNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cursorNode);
const cursorR = cursorNode.addComponent(MeshRenderer);
cursorR.mesh = utils.createMesh(primitives.sphere(0.16, 16, 12));
const cursorMat = new Material();
cursorMat.initialize({ effectName: 'builtin-unlit' });
cursorMat.setProperty('mainColor', new Color(255, 230, 60, 255));
cursorR.material = cursorMat;

let hitIndex = -1;
const ray: { o: Vec3; d: Vec3 } = { o: new Vec3(), d: new Vec3() };

class Picker extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        if (pointer.source === 'auto') {
            pointer.x = 0.5 + 0.22 * Math.sin(this._t * 0.6) * Math.cos(this._t * 0.23);
            pointer.y = 0.5 + 0.18 * Math.sin(this._t * 0.42);
        }
        const sx = pointer.x * window.innerWidth;
        // screenPointToRay 的 y 是左下角原点（d.ts 21403 注释 + 探针实测：小 y → 命中更近的排），
        // 而 getUILocation 是左上角 y 向下，故此处翻转。
        const sy = (1 - pointer.y) * window.innerHeight;
        camera.screenPointToRay(sx, sy, ray);
        // 光标落在水平面 y=CURSOR_Y 上（高于放大后的立方体顶，避免被遮挡）
        const CURSOR_Y = 0.95;
        if (ray.d.y < -1e-6) {
            const tc = (CURSOR_Y - ray.o.y) / ray.d.y;
            cursorNode.setPosition(new Vec3(ray.o.x + ray.d.x * tc, CURSOR_Y, ray.o.z + ray.d.z * tc));
        }
        let best = -1;
        let bestT = Infinity;
        for (let i = 0; i < cubes.length; i++) {
            const t = rayHitsAABB(ray.o, ray.d, cubes[i].center, HALF);
            if (t >= 0 && t < bestT) {
                bestT = t;
                best = i;
            }
        }
        hitIndex = best;
        for (let i = 0; i < cubes.length; i++) {
            const on = i === best;
            const c = cubes[i];
            const s = on ? 1.4 : 1;
            c.node.setScale(new Vec3(s, s, s));
            const b = c.base;
            const col = on ? new Color(255, 255, 255, 255) : new Color(b[0], b[1], b[2], 255);
            c.mat.setProperty('mainColor', col);
        }
        info.textContent = [
            'picking: camera.screenPointToRay(x, y) + app-layer ray/AABB slab test',
            `pointer: (${(pointer.x * 100).toFixed(0)}%, ${(pointer.y * 100).toFixed(0)}%) source=${pointer.source}`,
            `ray origin=(${ray.o.x.toFixed(2)}, ${ray.o.y.toFixed(2)}, ${ray.o.z.toFixed(2)}) dir=(${ray.d.x.toFixed(2)}, ${ray.d.y.toFixed(2)}, ${ray.d.z.toFixed(2)})`,
            `hit cube index: ${hitIndex} (-1 = none) — highlighted white & scaled 1.4x`,
            `cursor (ray×plane y=0.95): (${cursorNode.position.x.toFixed(2)}, ${cursorNode.position.z.toFixed(2)})`,
        ].join('\n');
    }
}
cameraNode.addComponent(Picker);

window.__airApp = app;
window.__inspect = { camera, cubes, pointer, getHitIndex: () => hitIndex, ray };
app.run(scene);

console.log('[manual/picking] running on cocosair');
