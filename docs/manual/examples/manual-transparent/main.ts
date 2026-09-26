/**
 * Cocos AIR 开发手册 — How to Draw Transparent Objects（绘制透明对象）
 * 配套文章：docs/manual/transparency.md
 *
 * 三个 alpha 递减（64/128/192）的半透明球挂在 rig 上往复摆动，遮挡后排三颗不透明色块——
 * 混合效果肉眼可读、摆动保证 frame-diff。关键踩坑：builtin-standard 里 mainColor.a<255
 * 并不会自动开启混合（pass[0] 读回 blend=false，实测球体仍不透明），
 * 须在 material.initialize 的 states 里显式给 blendState（SRC_ALPHA/ONE_MINUS_SRC_ALPHA）。
 * 每个半透明球私有一个 Material 实例（改共享材质会串色，见手册多篇的同一告诫）。
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

const scene = new Scene('transparent');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.8, 8.5));
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
dirNode.setRotationFromEuler(-40, -25, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 后排：三颗不透明色块（被遮挡物） ----
const opaqueColors = [new Color(220, 60, 60, 255), new Color(60, 200, 90, 255), new Color(70, 120, 235, 255)];
const sharedBox = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
opaqueColors.forEach((col, i) => {
    const n = new Node(`Opaque-${i}`);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(new Vec3((i - 1) * 1.6, 1.2, -0.6));
    scene.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sharedBox;
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', col);
    r.material = m;
});

// ---- 前排：三个半透明球（alpha 64/128/192），挂 rig 下整体旋转 ----
const rig = new Node('Rig');
rig.setPosition(new Vec3(0, 1.2, 0.9));
scene.addChild(rig);

const sphereMesh = utils.createMesh(primitives.sphere(0.75, 24, 16));
const glassMats: Material[] = [];
[64, 128, 192].forEach((alpha, i) => {
    const n = new Node(`Glass-${i}`);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(new Vec3((i - 1) * 1.1, 0, 0));
    rig.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sphereMesh;
    const m = new Material();
    m.initialize({
        effectName: 'builtin-standard',
        states: {
            blendState: {
                targets: [{ blend: true, blendSrc: 2, blendDst: 4 }],
            },
        },
    });
    m.setProperty('mainColor', new Color(245, 245, 250, alpha));
    r.material = m;
    glassMats.push(m);
});

// ---- 覆盖层：读回 pass 混合状态 ----
const info = document.querySelector('#info') as HTMLElement;
function blendReadout(m: Material): string {
    try {
        const t = m.passes[0].blendState.targets[0];
        return `blend=${t.blend} src=${t.blendSrc} dst=${t.blendDst}`;
    } catch (e) {
        return `readout failed: ${e.name}`;
    }
}
class Spinner extends Component {
    private _a = 0;
    private _readout = '';
    constructor() {
        super();
        this._a = 0;
        this._readout = blendReadout(glassMats[1]);
    }
    update(dt: number): void {
        this._a += dt * 30;
        rig.setRotationFromEuler(0, Math.sin((this._a * Math.PI) / 180) * 35, 0);
        info.textContent = [
            'transparency: mainColor.a = 64/128/192 + initialize({states.blendState}) (per-sphere private Material)',
            `pass[0].blendState.targets[0]: ${this._readout} (2=SRC_ALPHA, 4=ONE_MINUS_SRC_ALPHA)`,
            `rig yaw: ${(Math.sin((this._a * Math.PI) / 180) * 35).toFixed(1)}° (swings to reveal overlap order)`,
            'opaque row behind: red/green/blue cubes; glass spheres in front',
        ].join('\n');
    }
}
cameraNode.addComponent(Spinner);

window.__airApp = app;
window.__inspect = { glassMats, rig };
app.run(scene);

console.log('[manual/transparent] running on cocosair');
