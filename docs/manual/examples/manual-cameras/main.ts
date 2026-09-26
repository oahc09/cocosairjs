/**
 * Cocos AIR 开发手册 — Cameras（相机）
 * 配套文章：docs/manual/cameras.md
 *
 * 同一台相机每 3s 在 PERSPECTIVE(fov=45) 与 ORTHO(orthoHeight=2.6) 之间切换，
 * 五个等尺寸立方体沿 X 排成一列：透视下近大远小、正交下完全等大，差异一眼可辨。
 * 相机绕原点缓慢公转（12°/s）并始终 lookAt 队列中心，覆盖层实时打印投影参数。
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

const scene = new Scene('cameras');

// ---- 相机：projection / fov / orthoHeight / near / far 是取景四件套 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 7.0));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45; // 仅透视生效：垂直视场角（度）
camera.orthoHeight = 2.6; // 仅正交生效：取景半高（世界单位）
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光让立方体有明暗面 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 五个等尺寸立方体沿 X 排队：深度差异 = 投影差异的放大镜 ----
const COLORS: Color[] = [
    new Color(235, 125, 65, 255),
    new Color(95, 205, 120, 255),
    new Color(65, 155, 235, 255),
    new Color(205, 95, 205, 255),
    new Color(240, 200, 90, 255),
];
for (let i = 0; i < 5; i++) {
    const cube = new Node(`Cube-${i}`);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3(-3.2 + i * 1.6, 0.8, 0));
    scene.addChild(cube);
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', COLORS[i]);
    renderer.material = material;
}

// ---- 相机公转 + 投影循环 ----
const info = document.querySelector('#info') as HTMLElement;

class Orbit extends Component {
    update(dt: number): void {
        const node = this.node;
        const a = node.eulerAngles.y + dt * 12;
        node.setPosition(new Vec3(Math.sin((a * Math.PI) / 180) * 7, 2.4, Math.cos((a * Math.PI) / 180) * 7));
        node.lookAt(new Vec3(0, 0.8, 0));
    }
}
cameraNode.addComponent(Orbit);

function showProjection(): void {
    const isPersp = camera.projection === Camera.ProjectionType.PERSPECTIVE;
    const p = cameraNode.position;
    info.textContent = [
        'cameras: same camera, projection toggles every 3s',
        `now: ${isPersp ? 'PERSPECTIVE fov=45' : 'ORTHO orthoHeight=2.6'}  near=${camera.near} far=${camera.far}`,
        `camera pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) orbit 12°/s, lookAt (0,0.8,0)`,
        isPersp ? 'perspective: 近大远小（队列两端尺寸不同）' : 'orthographic: 完全等大（无近大远小）',
    ].join('\n');
}

class Cycler extends Component {
    private _t = 0;
    private _persp = true;

    constructor() {
        super();
        this._t = 0;
        this._persp = true;
    }
    update(dt: number): void {
        this._t += dt;
        const persp = Math.floor(this._t / 3) % 2 === 0;
        if (persp !== this._persp) {
            this._persp = persp;
            camera.projection = persp ? Camera.ProjectionType.PERSPECTIVE : Camera.ProjectionType.ORTHO;
            showProjection();
        }
    }
}
cameraNode.addComponent(Cycler);
showProjection();

window.__airApp = app;
app.run(scene);

console.log('[manual/cameras] running on cocosair');
