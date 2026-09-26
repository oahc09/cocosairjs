/**
 * Cocos AIR 开发手册 — Color Management（颜色管理）
 * 配套文章：docs/manual/color-management.md
 *
 * 上排六块 unlit 色板：Color 实例 fromHEX('#rrggbb') → mainColor，验证 hex 工作流；
 * 下排八块 unlit 色板：Color.lerp(A, B, t)  ping-pong 逐帧插值，验证插值工作流；
 * 每 3s 在 postSettings.toneMappingType 0(DEFAULT)/1(LINEAR) 间切换做 A/B 对照。
 * 全页 unlit：颜色不经过光照，所见即 Color 值本身。
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

const scene = new Scene('color-management');

// ---- 相机：正对色板墙 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.5, 8.5));
cameraNode.lookAt(new Vec3(0, 1.5, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 32, 255);
camera.visibility = Layers.Enum.DEFAULT;

const quadMesh = utils.createMesh(primitives.quad());

type Patch = { node: Node; material: Material };

function makePatch(name: string, x: number, y: number, w: number, h: number): Patch {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, 0));
    node.setScale(new Vec3(w, h, 1));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = quadMesh;
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit' });
    renderer.material = material;
    return { node, material };
}

// ---- 上排：hex 色板（fromHEX → mainColor） ----
const HEXES: string[] = ['#eb7d41', '#5fcd78', '#419beb', '#cd5fcd', '#f0c85a', '#78dca0'];
HEXES.forEach((hex, i) => {
    const patch = makePatch(`Hex-${i}`, (i - 2.5) * 1.35, 2.3, 1.15, 1.15);
    const c = new Color();
    c.fromHEX(hex);
    patch.material.setProperty('mainColor', c);
});

// ---- 下排：lerp 渐变带（逐帧 Color.lerp） ----
const RAMP_A = new Color(30, 60, 160, 255);
const RAMP_B = new Color(250, 220, 90, 255);
let lastPing = 0;
const rampPatches: Patch[] = [];
for (let i = 0; i < 8; i++) {
    rampPatches.push(makePatch(`Lerp-${i}`, (i - 3.5) * 1.05, 0.7, 0.95, 0.95));
}

class Ramp extends Component {
    private _t = 0;
    private _tmp: Color;

    constructor() {
        super();
        this._t = 0;
        this._tmp = new Color();
    }
    update(dt: number): void {
        this._t += dt;
        lastPing = (Math.sin(this._t * 0.8) + 1) * 0.5;
        for (let i = 0; i < rampPatches.length; i++) {
            const t = Math.min(1, Math.max(0, lastPing + (i - 3.5) * 0.06));
            Color.lerp(this._tmp, RAMP_A, RAMP_B, t);
            rampPatches[i].material.setProperty('mainColor', this._tmp);
        }
    }
}

// ---- 色调映射 A/B：postSettings.toneMappingType 0=DEFAULT 1=LINEAR ----
const post = scene.globals.postSettings;
post.toneMappingType = 0;

// ---- 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
const probe = new Color();
probe.fromHEX('#eb7d41');
const hexRoundTrip = probe.toHEX();
const hsv = probe.toHSV({ h: 0, s: 0, v: 0 });
function showColor(ping: number, tone: number): void {
    info.textContent = [
        'exports: Color / ColorKey / color only — no ColorManagement, no ColorSpace',
        `hex row: ${HEXES.join(' ')} (instance fromHEX → mainColor)`,
        `hex roundtrip: #eb7d41 → ${hexRoundTrip}   hsv: h=${hsv.h.toFixed(2)} s=${hsv.s.toFixed(2)} v=${hsv.v.toFixed(2)}`,
        `lerp ramp: Color.lerp(A,B,t) ping-pong t=${ping.toFixed(2)} (per-frame)`,
        `toneMapping: postSettings.toneMappingType=${tone} (0=DEFAULT 1=LINEAR, toggles every 3s)`,
    ].join('\n');
}

class Cycler extends Component {
    private _t = 0;
    private _tone = 0;

    constructor() {
        super();
        this._t = 0;
        this._tone = 0;
    }
    update(dt: number): void {
        this._t += dt;
        const tone = Math.floor(this._t / 3) % 2;
        if (tone !== this._tone) {
            this._tone = tone;
            post.toneMappingType = tone;
        }
        showColor(lastPing, this._tone);
    }
}
cameraNode.addComponent(Ramp);
cameraNode.addComponent(Cycler);
showColor(0, 0);

window.__airApp = app;
app.run(scene);

console.log('[manual/color-management] running on cocosair');
