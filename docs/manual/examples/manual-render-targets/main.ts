/**
 * Cocos AIR 开发手册 — Render Targets（渲染目标）
 * 配套文章：docs/manual/rendertargets.md
 *
 * 开场 1.2s 把相机输出重定向到 256×256 的 RenderTexture（camera.targetTexture），
 * 抓一帧"冻结快照"后恢复屏幕输出，并把这张 RT 作为 mainTexture 贴到左侧 quad 上；
 * 右侧立方体继续实时自转——同框对比"冻结的 RT"与"实时画面"。
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
    RenderTexture,
    director,
    Director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('rendertargets');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.4, 6.0));
cameraNode.lookAt(new Vec3(0, 1.1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 32, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 30000;

// ---- 右侧：实时自转立方体 ----
const cubeNode = new Node('LiveCube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(1.6, 1.2, -0.5));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(65, 155, 235, 255));
cubeRenderer.material = cubeMaterial;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 渲染目标：256×256 ----
const rt = new RenderTexture();
rt.reset({ width: 256, height: 256 });

// ---- 左侧：贴 RT 的 quad（快照完成后才创建） ----
let quadNode: Node | null = null;
const snapshotProbe = { ready: false, ok: false, checks: [] as { name: string; pass: boolean; detail: string }[] };
(window as any).__manualProbe = () => snapshotProbe;

function verifySnapshot(): void {
    const corners = [-1, 1].flatMap((x) =>
        [-1, 1].map((y) => camera.worldToScreen(new Vec3(-1.7 + x * 1.1, 1.2 + y * 1.1, 1.2))),
    );
    const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
    const right = Math.min(canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
    const top = Math.max(0, Math.floor(canvas.height - Math.max(...corners.map((p) => p.y))));
    const bottom = Math.min(canvas.height, Math.ceil(canvas.height - Math.min(...corners.map((p) => p.y))));
    const sample = document.createElement('canvas');
    sample.width = canvas.width;
    sample.height = canvas.height;
    const ctx = sample.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(left, top, right - left, bottom - top).data;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 2] > data[i] + 30 && data[i + 2] > 60) blue++;
    }
    snapshotProbe.checks.push({ name: 'snapshot-contains-blue-cube', pass: blue > 20, detail: 'blue pixels=' + blue });
    snapshotProbe.ok = snapshotProbe.checks.every((c) => c.pass);
    snapshotProbe.ready = true;
}
function showSnapshot(): void {
    quadNode = new Node('SnapshotQuad');
    quadNode.layer = Layers.Enum.DEFAULT;
    quadNode.setPosition(new Vec3(-1.7, 1.2, 1.2));
    quadNode.setRotationFromEuler(90, 0, 0); // plane 法线 +Y → 转到 +Z 面向相机
    scene.addChild(quadNode);
    const renderer = quadNode.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.plane({ width: 2.2, length: 2.2 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    material.setProperty('mainTexture', rt);
    renderer.material = material;
    director.once(Director.EVENT_AFTER_DRAW, verifySnapshot);
}

const info = document.querySelector('#info') as HTMLElement;
function showState(phase: string): void {
    info.textContent = [
        'rendertargets: 256x256 RenderTexture via camera.targetTexture',
        `phase: ${phase}`,
        'left quad = frozen snapshot taken at t=1.2s',
        'right cube = live scene, spinning 60°/s',
    ].join('\n');
}

class Capture extends Component {
    private _t = 0;
    private _stage = 0;

    constructor() {
        super();
        this._t = 0;
        this._stage = 0;
    }
    update(dt: number): void {
        this._t += dt;
        if (this._stage === 0 && this._t >= 1.2) {
            this._stage = 1;
            camera.targetTexture = rt; // 此后相机输出进 RT，屏幕暂黑
            showState('capturing → RT');
        } else if (this._stage === 1 && this._t >= 1.5) {
            this._stage = 2;
            camera.targetTexture = null; // 恢复屏幕输出
            showSnapshot();
            showState('snapshot on quad vs live cube');
        }
    }
}
cameraNode.addComponent(Capture);
showState('live (pre-capture)');

window.__airApp = app;
app.run(scene);

console.log('[manual/rendertargets] running on cocosair');
