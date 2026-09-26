/**
 * Cocos AIR 开发手册 — Matrix Transformations（矩阵变换）
 * 配套文章：docs/manual/matrix-transformations.md
 *
 * 三级节点链 root→mid→tip：root 每帧自转，mid/tip 带本地位移与旋转。
 * 覆盖层做"引擎世界矩阵 vs 手工 Mat4 乘法"的逐帧对账：
 *   midWorldManual = Mat4.multiply(root.worldMatrix, Mat4.fromRTS(mid 本地 TRS))
 *   tipWorldManual = Vec3.transformMat4(tip 本地位移, mid.worldMatrix)
 * 并打印 Mat4.toEuler 分解读回。三颗立方体随链运动，保证 frame-diff。
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
    Quat,
    Mat4,
    Color,
    utils,
    primitives,
    toDegree,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('matrix-transformations');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(4.0, 3.4, 6.8));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 共享 mesh/material ----
const cubeMesh = utils.createMesh(primitives.box({ width: 0.7, height: 0.7, length: 0.7 }));
function attachCube(node: Node, r: number, g: number, b: number): void {
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', new Color(r, g, b, 255));
    renderer.material = material;
}

// ---- 三级链：root → mid → tip ----
const MID_LOCAL_POS = new Vec3(1.5, 0, 0);
const MID_LOCAL_EULER_Z = 30;
const TIP_LOCAL_POS = new Vec3(0, 1.0, 0);

const root = new Node('root');
root.layer = Layers.Enum.DEFAULT;
root.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(root);
attachCube(root, 235, 125, 65);

const mid = new Node('mid');
mid.layer = Layers.Enum.DEFAULT;
mid.setPosition(MID_LOCAL_POS);
mid.setRotationFromEuler(0, 0, MID_LOCAL_EULER_Z);
root.addChild(mid);
attachCube(mid, 95, 205, 120);

const tip = new Node('tip');
tip.layer = Layers.Enum.DEFAULT;
tip.setPosition(TIP_LOCAL_POS);
mid.addChild(tip);
attachCube(tip, 65, 155, 235);

// ---- 对账工具 ----
const midLocalQuat = new Quat();
Quat.fromEuler(midLocalQuat, 0, 0, MID_LOCAL_EULER_Z);
const midLocalMat = new Mat4();
const midWorldManual = new Mat4();
const tipWorldManual = new Vec3();
const tipWorldEngine = new Vec3();
const eulerOut = new Vec3();

const MAT_KEYS: string[] = [
    'm00',
    'm01',
    'm02',
    'm03',
    'm04',
    'm05',
    'm06',
    'm07',
    'm08',
    'm09',
    'm10',
    'm11',
    'm12',
    'm13',
    'm14',
    'm15',
];
function maxMatDiff(a: Mat4, b: Mat4): number {
    let diff = 0;
    for (const k of MAT_KEYS) {
        diff = Math.max(diff, Math.abs(a[k] - b[k]));
    }
    return diff;
}

// ---- 每帧：root 自转 + 对账 + 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
class Orbit extends Component {
    private _angle = 0;

    constructor() {
        super();
        this._angle = 0;
    }
    update(dt: number): void {
        this._angle += dt * 30;
        root.setRotationFromEuler(0, this._angle, 0);

        Mat4.fromRTS(midLocalMat, midLocalQuat, MID_LOCAL_POS, Vec3.ONE);
        Mat4.multiply(midWorldManual, root.worldMatrix, midLocalMat);
        const matDiff = maxMatDiff(midWorldManual, mid.worldMatrix);

        Vec3.transformMat4(tipWorldManual, TIP_LOCAL_POS, mid.worldMatrix);
        tip.getWorldPosition(tipWorldEngine);
        const posDiff = Vec3.distance(tipWorldManual, tipWorldEngine);

        const eulerOk = Mat4.toEuler(eulerOut, mid.worldMatrix);
        info.textContent = [
            'chain: root(Y-spin) → mid(loc 1.5,0,0 + Z30°) → tip(loc 0,1,0)',
            `root angle: ${this._angle.toFixed(1)}°`,
            `mid world: engine vs Mat4.multiply(rootWorld, fromRTS) max diff = ${matDiff.toExponential(2)}`,
            `tip world: (${tipWorldEngine.x.toFixed(2)}, ${tipWorldEngine.y.toFixed(2)}, ${tipWorldEngine.z.toFixed(2)}) vs transformMat4 diff = ${posDiff.toExponential(2)}`,
            `mid world toEuler: ret=${eulerOk} (${toDegree(eulerOut.x).toFixed(1)}, ${toDegree(eulerOut.y).toFixed(1)}, ${toDegree(eulerOut.z).toFixed(1)})°`,
            `mid node euler (node API): (${mid.eulerAngles.x.toFixed(1)}, ${mid.eulerAngles.y.toFixed(1)}, ${mid.eulerAngles.z.toFixed(1)})°`,
        ].join('\n');
    }
}
cameraNode.addComponent(Orbit);

window.__airApp = app;
app.run(scene);

console.log('[manual/matrix-transformations] running on cocosair');
