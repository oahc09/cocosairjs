/**
 * Cocos AIR 开发手册 — Aligning HTML Elements to 3D（HTML 元素对齐 3D）
 * 配套文章：docs/manual/align-html-elements-to-3d.md
 *
 * 本能力的核心是 camera 投影：把 3D 世界坐标换算成屏幕像素，去摆 DOM 元素，
 * 并用射线检测决定"被挡住就藏标签"。AIR 的对应件是 camera.worldToScreen（d.ts 21418，
 * 输出左下角原点像素——与 screenPointToRay 同一坐标系，摆 DOM 时要翻 y）。
 * 本例：两颗轨道立方体（橙/青）各带一个 HTML 标签跟随其屏幕投影位置；
 * 中心大立方体用 picking 篇同款 slab 射线做遮挡检测，挡住时标签淡出。
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

const scene = new Scene('align-html');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3.2, 9.5));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
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
dir.illuminance = 6;

// ---- 中心遮挡体 + 两颗轨道锚点立方体 ----
function makeCube(name: string, size: number, pos: Vec3, rgb: number[]): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(pos);
    scene.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = utils.createMesh(primitives.box({ width: size, height: size, length: size }));
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2], 255));
    r.material = m;
    return n;
}
const blocker = makeCube('Blocker', 2.2, new Vec3(0, 0.8, 0), [205, 210, 220]);
const anchors: { node: Node; el: HTMLElement; phase: number; label: string }[] = [
    {
        node: makeCube('Anchor-orange', 0.55, new Vec3(0, 0.8, 0), [242, 178, 107]),
        el: document.querySelector('#tag-orange') as HTMLElement,
        phase: 0,
        label: 'ORANGE',
    },
    {
        node: makeCube('Anchor-teal', 0.55, new Vec3(0, 0.8, 0), [127, 216, 207]),
        el: document.querySelector('#tag-teal') as HTMLElement,
        phase: Math.PI,
        label: 'TEAL',
    },
];

// ---- 射线 × AABB（picking 篇同款 slab 法，用于遮挡判定） ----
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

// ---- 每帧：轨道运动 → worldToScreen 摆标签 → 遮挡淡出 ----
const info = document.querySelector('#info') as HTMLElement;
const screenPos = new Vec3();
const toAnchor = new Vec3();
const BLOCK_HALF = 1.1;
const blockCenter = new Vec3(0, 0.8, 0);

class Aligner extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        const camPos = cameraNode.position;
        const lines: string[] = [
            'align html: camera.worldToScreen(world) → CSS px (left-bottom origin → flip y)',
            `blocker at (0, 0.8, 0) half ${BLOCK_HALF}; occlusion = ray cam→anchor slab-hits blocker`,
        ];
        anchors.forEach((a, i) => {
            const ang = this._t * 0.7 + a.phase;
            a.node.setPosition(new Vec3(Math.sin(ang) * 3.4, 0.8 + Math.sin(ang * 2.0) * 0.5, Math.cos(ang) * 3.4));
            camera.worldToScreen(a.node.position, screenPos);
            // worldToScreen 是左下角原点，CSS 是左上角 → 翻 y
            const cssTop = window.innerHeight - screenPos.y;
            a.el.style.left = `${screenPos.x.toFixed(1)}px`;
            a.el.style.top = `${cssTop.toFixed(1)}px`;
            // 遮挡判定：从相机朝锚点发射线，若先命中中心立方体则藏标签
            Vec3.subtract(toAnchor, a.node.position, camPos);
            const dist = Vec3.distance(camPos, a.node.position);
            Vec3.normalize(toAnchor, toAnchor);
            const tHit = rayHitsAABB(camPos, toAnchor, blockCenter, BLOCK_HALF);
            const occluded = tHit >= 0 && tHit < dist - 0.2;
            a.el.style.opacity = occluded ? '0' : '1';
            lines.push(
                `${a.label}: screen=(${screenPos.x.toFixed(0)}, ${cssTop.toFixed(0)}) dist=${dist.toFixed(1)} occluded=${occluded}`,
            );
        });
        info.textContent = lines.join('\n');
    }
}
const aligner = cameraNode.addComponent(Aligner);

window.__airApp = app;
window.__inspect = { camera, anchors, blocker, aligner };
app.run(scene);

console.log('[manual/align-html] running on cocosair');
