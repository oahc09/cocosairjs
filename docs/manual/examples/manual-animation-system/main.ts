/**
 * Cocos AIR 开发手册 — Animation System（动画系统）
 * 配套文章：docs/manual/animation-system.md
 *
 * 用顶层导出的 tween 驱动一颗立方体走"右移 → 上移 → 回原点"循环序列（sequence + to + call），
 * 并行一条缩放脉冲（parallel 独立 tween）；覆盖层实时打印当前阶段与已跑秒数。
 * 另放一颗静态锚点立方体（斜视三面受光），使 visible-frame 判定与动画相位无关。
 * 再放一颗 Orbit 球走代码构造的 AnimationClip（VectorTrack + TrackPath，Loop 循环），
 * 6s 后 stop() 冻结——play/stop/loop 全部行为断言（__manualProbe 读回）。
 * 不依赖任何外部 clip 资产：tween 与代码构造 clip 都是 code-first 动画路径。
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
    AnimationClip,
    Animation,
    animation,
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
function showStage(name: string): void {
    stage = name;
}
class Clock extends Component {
    private _t = 0;

    constructor() {
        super();
        this._t = 0;
    }
    update(dt: number): void {
        this._t += dt;
        info.textContent = [
            'animation: tween sequence + pulse + code-first clip (orbit, stop@6s)',
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

// ---- 剪辑路线：代码构造 AnimationClip（VectorTrack + TrackPath），Loop 播放、6s 后 stop 冻结 ----
const clip = new AnimationClip();
clip.name = 'orbit';
clip.duration = 2.0;
clip.wrapMode = AnimationClip.WrapMode.Loop;
const track = new animation.VectorTrack();
track.path = new animation.TrackPath().toProperty('position');
track.channels()[0].curve.assignSorted([
    [0, 0],
    [1, 0.9],
    [2, 0],
]); // x: 0 → 0.9 → 0
track.channels()[1].curve.assignSorted([
    [0, 0],
    [1, 0],
    [2, 0.7],
]); // y: 0 → 0 → 0.7
clip.addTrack(track);

const orbNode = new Node('Orb');
orbNode.layer = Layers.Enum.DEFAULT;
orbNode.setPosition(new Vec3(-1.8, 1.0, 0));
scene.addChild(orbNode);
const orbRenderer = orbNode.addComponent(MeshRenderer);
orbRenderer.mesh = utils.createMesh(primitives.sphere({ radius: 0.28 }));
const orbMaterial = new Material();
orbMaterial.initialize({ effectName: 'builtin-standard' });
orbMaterial.setProperty('mainColor', new Color(150, 220, 120, 255));
orbRenderer.material = orbMaterial;

const orbAnim = orbNode.addComponent(Animation);
orbAnim.defaultClip = clip;
// play 必须等组件激活后再调（app.run 前场景未激活，play 会被激活流程重置）——start() 是规范位置
class OrbStart extends Component {
    start(): void {
        orbAnim.play(clip.name);
    }
}
orbNode.addComponent(OrbStart);

// ---- 行为断言：Orb 在动（位置越界）+ stop 后冻结 ----
type Check = { name: string; pass: boolean; detail: string };
const clipChecks: Check[] = [];
let orbMinX = Infinity;
let orbMaxX = -Infinity;
let stoppedAt = -1;
let frozenX = 0;
let stillMoving = false;
class ClipProbe extends Component {
    private _t = 0;
    update(dt: number): void {
        this._t += dt;
        const x = orbNode.position.x;
        if (stoppedAt < 0) {
            orbMinX = Math.min(orbMinX, x);
            orbMaxX = Math.max(orbMaxX, x);
            if (this._t >= 6) {
                orbAnim.stop();
                stoppedAt = this._t;
                frozenX = orbNode.position.x;
            }
        } else if (Math.abs(orbNode.position.x - frozenX) > 1e-4) {
            stillMoving = true;
        }
    }
}
orbNode.addComponent(ClipProbe);

window.__manualProbe = () => {
    if (stoppedAt < 0) {
        return { ready: false, ok: false, name: 'animation-system' };
    }
    if (clipChecks.length === 0) {
        clipChecks.push(
            {
                name: 'clip-orb-moved',
                pass: orbMaxX - orbMinX > 0.5,
                detail: `x range [${orbMinX.toFixed(2)}, ${orbMaxX.toFixed(2)}]`,
            },
            {
                name: 'clip-stop-froze',
                pass: !stillMoving,
                detail: `stopped at ${stoppedAt.toFixed(1)}s, frozen x=${frozenX.toFixed(2)}`,
            },
        );
    }
    return {
        ready: true,
        ok: clipChecks.every((c) => c.pass),
        name: 'animation-system',
        checks: [...clipChecks],
    };
};

window.__airApp = app;
app.run(scene);

console.log('[manual/animation-system] running on cocosair');
