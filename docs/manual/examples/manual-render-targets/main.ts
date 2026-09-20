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
dir.illuminance = 2;

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
    update (dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 渲染目标：256×256 ----
const rt = new RenderTexture();
rt.reset({ width: 256, height: 256 });

// ---- 左侧：贴 RT 的 quad（快照完成后才创建） ----
let quadNode: Node | null = null;
function showSnapshot (): void {
    quadNode = new Node('SnapshotQuad');
    quadNode.layer = Layers.Enum.DEFAULT;
    quadNode.setPosition(new Vec3(-1.7, 1.2, 1.2));
    quadNode.setRotationFromEuler(90, 0, 0); // plane 法线 +Y → 转到 +Z 面向相机
    scene.addChild(quadNode);
    const renderer = quadNode.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.plane({ width: 2.2, length: 2.2 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_ALBEDO_MAP: true } });
    material.setProperty('mainTexture', rt);
    renderer.material = material;
}

const info = document.querySelector('#info') as HTMLElement;
function showState (phase: string): void {
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

    constructor () {
        super();
        this._t = 0;
        this._stage = 0;
    }
    update (dt: number): void {
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
