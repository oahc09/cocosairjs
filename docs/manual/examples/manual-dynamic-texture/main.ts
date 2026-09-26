/**
 * Cocos AIR 开发手册 — Using A Canvas for Dynamic Textures（用 Canvas 做动态纹理）
 * 配套文章：docs/manual/canvas-textures.md
 *
 * 本能力的流程：往一个 2D canvas 上每帧作画，把画布内容作为纹理源，改了就要显式上传。
 * AIR 的对应件是 SimpleTexture.uploadData(source)（d.ts 43970）——source 直接收
 * HTMLCanvasElement，每帧调一次即为"改动即时生效"；纹理本体用
 * new Texture2D() + reset({width,height,format}) 现造（零外部资产）。
 * 本例：256×256 离屏 2D canvas 每帧画"时钟扫针 + 递增帧数 + 左上角 AIR 方位标"，
 * uploadData 上传后贴到一块竖直面（quad）与一颗自转立方体上（同一纹理两用）。
 * 覆盖层打印累计上传次数与帧号，供探针取证。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Mesh,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    Texture2D,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('dynamic-texture');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 7.2));
cameraNode.lookAt(new Vec3(-0.3, 1.3, 0));
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
dirNode.setRotationFromEuler(-30, -20, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 5.5;

// ---- 离屏 2D 画布：每帧作画的内容源 ----
const TEX_SIZE = 256;
const paint = document.createElement('canvas');
paint.width = paint.height = TEX_SIZE;
const g2d = paint.getContext('2d') as CanvasRenderingContext2D;

// ---- 动态 Texture2D：reset 建 GPU 资源，每帧 uploadData(canvas) 重传 ----
const texture = new Texture2D();
texture.reset({
    width: TEX_SIZE,
    height: TEX_SIZE,
    format: Texture2D.PixelFormat.RGBA8888,
});
texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);

function drawPaint(frame: number, t: number): void {
    // 实测坑：uploadData(canvas) 不做 y 翻转（引擎固定 UNPACK_FLIP_Y_WEBGL=false，
    // build js 78228/82958），画布顶行落在 v=0 = 面片下缘 → 画面上下颠倒。
    // 解法：作画时整体预翻转，让画布内容"倒着画"、上屏正好"正着看"。
    g2d.setTransform(1, 0, 0, -1, 0, TEX_SIZE);
    g2d.fillStyle = '#1c3a66';
    g2d.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    // 左上角方位标：验证 uploadData 的 y 方向约定（画面里应出现在左上）
    g2d.fillStyle = '#ffd75e';
    g2d.font = 'bold 30px sans-serif';
    g2d.fillText('AIR', 10, 34);
    // 时钟扫针
    const cx = TEX_SIZE / 2;
    const cy = TEX_SIZE / 2;
    g2d.strokeStyle = '#7fd8cf';
    g2d.lineWidth = 6;
    g2d.beginPath();
    g2d.arc(cx, cy, 96, 0, Math.PI * 2);
    g2d.stroke();
    g2d.strokeStyle = '#f2b26b';
    g2d.lineWidth = 8;
    g2d.beginPath();
    g2d.moveTo(cx, cy);
    g2d.lineTo(cx + Math.cos(t * 2) * 84, cy + Math.sin(t * 2) * 84);
    g2d.stroke();
    // 递增帧号：与相位无关的持续变化源
    g2d.fillStyle = '#e8eef7';
    g2d.font = 'bold 24px monospace';
    g2d.fillText(`f=${frame}`, 10, TEX_SIZE - 16);
    const bar = (frame * 3) % TEX_SIZE;
    g2d.fillStyle = '#5a8dee';
    g2d.fillRect(0, TEX_SIZE - 8, bar, 8);
}

// ---- 贴动态纹理的竖直面（quad）+ 自转立方体（同一纹理两用） ----
function textured(name: string, mesh: Mesh, pos: Vec3, rotX: number): { node: Node; mat: Material } {
    const n = new Node(name);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(pos);
    if (rotX) n.setRotationFromEuler(rotX, 0, 0);
    scene.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = mesh;
    const m = new Material();
    m.initialize({
        effectName: 'builtin-standard',
        defines: { USE_ALBEDO_MAP: true }, // 不开宏 mainTexture 不参与着色（textures 篇同款）
    });
    m.setProperty('mainTexture', texture);
    r.material = m;
    return { node: n, mat: m };
}
const quad = textured(
    'DynQuad',
    utils.createMesh(primitives.plane({ width: 3.4, length: 3.4 })),
    new Vec3(-1.9, 1.5, 0),
    90,
);
const cube = textured(
    'DynCube',
    utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 })),
    new Vec3(1.9, 1.5, 0),
    0,
);
cube.node.lookAt(new Vec3(4.5, 3.5, 6));

// ---- 每帧：作画 → uploadData → 覆盖层读数 ----
const info = document.querySelector('#info') as HTMLElement;
let uploads = 0;
let frame = 0;

class DynTex extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        frame++;
        drawPaint(frame, this._t);
        texture.uploadData(paint); // 改动即时生效：每帧显式上传一次
        uploads++;
        const e = cube.node.eulerAngles;
        cube.node.setRotationFromEuler(0, e.y + 36 * dt, 0);
        info.textContent = [
            'dynamic texture: Texture2D.reset + per-frame uploadData(2D canvas)',
            `texture ${TEX_SIZE}x${TEX_SIZE} RGBA8888, uploads=${uploads}, frame=${frame}`,
            'quad (left) and cube (right, spinning) share one live texture',
            `texture.getGFXTexture(): ${texture.getGFXTexture() ? 'ok' : 'null'}`,
        ].join('\n');
    }
}
cameraNode.addComponent(DynTex);

window.__airApp = app;
window.__inspect = { texture, paint, getUploads: () => uploads, quad, cube };
app.run(scene);

console.log('[manual/dynamic-texture] running on cocosair');
