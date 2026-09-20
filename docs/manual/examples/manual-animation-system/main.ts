/**
 * Cocos AIR 开发手册 — Animation System（动画系统）
 * 配套文章：docs/manual/animation-system.md
 *
 * 用顶层导出的 tween 驱动一颗立方体走"右移 → 上移 → 回原点"循环序列（sequence + to + call），
 * 并行一条缩放脉冲（parallel 独立 tween）；覆盖层实时打印当前阶段与已跑秒数。
 * 另放一颗静态锚点立方体（斜视三面受光），使 visible-frame 判定与动画相位无关。
 * 不依赖任何外部 clip 资产：tween 是 code-first 动画的最短路径。
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
    tween,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('animation-system');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.4, 3.0, 7.4));
cameraNode.lookAt(new Vec3(0, 1.3, 0));
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

// ---- 静态锚点立方体：斜视三面受光，保证 visible-frame 与动画相位无关 ----
const anchorNode = new Node('Anchor');
anchorNode.layer = Layers.Enum.DEFAULT;
anchorNode.setPosition(new Vec3(-1.8, 1.0, 0));
scene.addChild(anchorNode);
const anchorRenderer = anchorNode.addComponent(MeshRenderer);
anchorRenderer.mesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const anchorMaterial = new Material();
anchorMaterial.initialize({ effectName: 'builtin-standard' });
anchorMaterial.setProperty('mainColor', new Color(95, 165, 225, 255));
anchorRenderer.material = anchorMaterial;

// ---- 主角立方体 ----
const cubeNode = new Node('Dancer');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0.6, 1.0, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(235, 125, 65, 255));
cubeRenderer.material = cubeMaterial;

// ---- 覆盖层：阶段 + 秒表 ----
const info = document.querySelector('#info') as HTMLElement;
let stage: string = 'idle';
function showStage (name: string): void {
    stage = name;
}
class Clock extends Component {
    private _t = 0;

    constructor () {
        super();
        this._t = 0;
    }
    update (dt: number): void {
        this._t += dt;
        info.textContent = [
            'animation: tween sequence (to/call/repeatForever) + parallel pulse',
            `stage: ${stage}`,
            `elapsed: ${this._t.toFixed(1)}s`,
            'path: (0.6,1,0) → (2.2,1,0) → (2.2,2.2,0) → back, loop',
        ].join('\n');
    }
}
cameraNode.addComponent(Clock);

// ---- 主序列：右移 → 上移 → 回原点，循环 ----
tween(cubeNode)
    .call(() => showStage('move right'))
    .to(1.2, { position: new Vec3(2.2, 1.0, 0) })
    .call(() => showStage('move up'))
    .to(0.8, { position: new Vec3(2.2, 2.2, 0) })
    .call(() => showStage('return home'))
    .to(1.4, { position: new Vec3(0.6, 1.0, 0) })
    .repeatForever()
    .start();

// ---- 并行脉冲：缩放 1 → 1.25 → 1 ----
tween(cubeNode)
    .to(0.6, { scale: new Vec3(1.25, 1.25, 1.25) })
    .to(0.6, { scale: new Vec3(1, 1, 1) })
    .repeatForever()
    .start();

window.__airApp = app;
app.run(scene);

console.log('[manual/animation-system] running on cocosair');
