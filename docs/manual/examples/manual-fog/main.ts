/**
 * Cocos AIR 开发手册 — Fog（雾）
 * 配套文章：docs/manual/fog.md
 *
 * 六个 unlit 彩色立方体沿纵深斜列排开（距离 4→14），线性雾 fogStart=4 / fogEnd=12、
 * 雾色品红：越远的立方体越接近雾色。每 3s 开关一次雾做 A/B 对照，
 * 相机沿 X 缓慢横移保证任意 400ms 双帧不同（frame-diff）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
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

const scene = new Scene('fog');

// ---- 相机：横移运动让 frame-diff 有得比 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 3.0));
cameraNode.lookAt(new Vec3(0, 1.0, -8.0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 50;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 32, 255);
camera.visibility = Layers.Enum.DEFAULT;

class Strafe extends Component {
    private _t: number;

    constructor() {
        super();
        this._t = 0;
    }
    update(dt: number): void {
        this._t += dt;
        this.node.setPosition(new Vec3(Math.sin(this._t * 0.6) * 2.0, 1.6, 3.0));
        this.node.lookAt(new Vec3(0, 1.0, -8.0));
    }
}
cameraNode.addComponent(Strafe);

// ---- 纵深斜列的六个立方体：距离递增 = 雾浓度递增 ----
const COLORS: Color[] = [
    new Color(235, 125, 65, 255),
    new Color(95, 205, 120, 255),
    new Color(65, 155, 235, 255),
    new Color(205, 95, 205, 255),
    new Color(240, 200, 90, 255),
    new Color(120, 220, 160, 255),
];
const DISTANCES: number[] = [];
for (let i = 0; i < 6; i++) {
    const z = -1 - i * 2.6;
    const cube = new Node(`Cube-${i}`);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3((i - 2.5) * 1.7, 1.2, z));
    scene.addChild(cube);
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', COLORS[i]);
    renderer.material = material;
    DISTANCES.push(Math.round(3 - z));
}

// ---- 雾：场景级开关，入口是 scene.globals.fog ----
const fog = scene.globals.fog;
fog.enabled = true;
fog.type = 0; // FogType.LINEAR（枚举未顶层导出：0=LINEAR 1=EXP 2=EXP_SQUARED）
fog.fogColor = new Color(255, 0, 255, 255);
fog.fogStart = 4;
fog.fogEnd = 12;

const info = document.querySelector('#info') as HTMLElement;
function showFog(): void {
    info.textContent = [
        'fog: LINEAR, fogColor=magenta, start=4 end=12',
        `now: fog.enabled=${fog.enabled} (toggles every 3s)`,
        `cube distances: ${DISTANCES.join(', ')} (camera→cube, 世界单位)`,
        fog.enabled ? 'on: 越远越接近雾色（品红）' : 'off: 原色，无距离混色',
    ].join('\n');
}

class Cycler extends Component {
    private _t: number;
    private _on: boolean;

    constructor() {
        super();
        this._t = 0;
        this._on = true;
    }
    update(dt: number): void {
        this._t += dt;
        const on = Math.floor(this._t / 3) % 2 === 0;
        if (on !== this._on) {
            this._on = on;
            fog.enabled = on;
            showFog();
        }
    }
}
cameraNode.addComponent(Cycler);
showFog();

window.__airApp = app;
app.run(scene);

console.log('[manual/fog] running on cocosair');
