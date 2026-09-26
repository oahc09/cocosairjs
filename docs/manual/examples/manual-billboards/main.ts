/**
 * Cocos AIR 开发手册 — Billboards and Facades（公告板与立面）
 * 配套文章：docs/manual/billboards.md
 *
 * 让面片永远正对相机的经典 GPU 路线是在顶点着色器里做（视图矩阵去旋转 / 按顶点 ID 手搓 quad）。
 * AIR 无用户 GLSL（shadertoy 篇 N/A），这条路线不存在；引擎也没有 Billboard 组件
 * （d.ts grep 零命中）。CPU 等价路线：每帧把相机的世界旋转抄给面片父节点——
 * 全量抄=球面公告板（spherical），只抄 yaw=柱面/立面（cylindrical facade），不抄=对照组。
 * 本例：三块面片同贴一张 canvas 现造的"脸"纹理（standard+USE_ALBEDO_MAP；实测 unlit 配
 * uploadData 纹理渲染成纯白平面，见下），相机绕圈巡游；球面/柱面两块始终正对镜头，
 * 静态一块周期性侧成一条线。
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
    Texture2D,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('billboards');

// ---- 方向光（面片用 standard+贴图，需吃光） ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-20, 10, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 8;

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 8.5));
cameraNode.lookAt(new Vec3(0, 1.4, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- "脸"纹理：128 canvas 现造，一次性 uploadData（y 预翻转=动态纹理篇同款约定） ----
const TEX_SIZE = 128;
const paint = document.createElement('canvas');
paint.width = paint.height = TEX_SIZE;
const g2d = paint.getContext('2d') as CanvasRenderingContext2D;
g2d.setTransform(1, 0, 0, -1, 0, TEX_SIZE); // uploadData 不翻 y，作画时预翻
g2d.fillStyle = '#2b6cb0';
g2d.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
g2d.fillStyle = '#ffd75e';
g2d.beginPath();
g2d.arc(TEX_SIZE / 2, TEX_SIZE / 2, 46, 0, Math.PI * 2);
g2d.fill();
g2d.fillStyle = '#10233f';
g2d.beginPath();
g2d.arc(44, 52, 7, 0, Math.PI * 2);
g2d.arc(84, 52, 7, 0, Math.PI * 2);
g2d.fill();
g2d.strokeStyle = '#10233f';
g2d.lineWidth = 5;
g2d.beginPath();
g2d.arc(TEX_SIZE / 2, 66, 26, 0.25 * Math.PI, 0.75 * Math.PI);
g2d.stroke();
g2d.fillStyle = '#e8eef7';
g2d.font = 'bold 16px monospace';
g2d.fillText('TOP', 48, 18); // 方位标：正对镜头时应读作"上"

const faceTexture = new Texture2D();
// 实测坑：本张"裸造"纹理（reset+uploadData）配 unlit+USE_ALBEDO_MAP 渲染成纯白平面、
// 换 standard+USE_ALBEDO_MAP 才采样出图（本构建对照实验；unlit 的贴图路线此前仅在
// RenderTexture 上取证过，见 render-targets 篇）。
faceTexture.reset({ width: TEX_SIZE, height: TEX_SIZE, format: Texture2D.PixelFormat.RGBA8888 });
let faceUploaded = false;

// ---- 三块面片：同一材质（standard+贴图），父节点管朝向、子平面法线转 +Z ----
const sharedMesh = utils.createMesh(primitives.plane({ width: 2.2, length: 2.2 }));
const faceMat = new Material();
faceMat.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
faceMat.setProperty('mainTexture', faceTexture);

function makeQuad(name: string, x: number): Node {
    const root = new Node(name);
    root.layer = Layers.Enum.DEFAULT;
    root.setPosition(new Vec3(x, 1.4, 0));
    scene.addChild(root);
    const plane = new Node('Plane');
    plane.layer = Layers.Enum.DEFAULT;
    plane.setRotationFromEuler(90, 0, 0); // plane 默认法线 +Y → 转成父节点 +Z
    root.addChild(plane);
    const r = plane.addComponent(MeshRenderer);
    r.mesh = sharedMesh;
    r.material = faceMat;
    return root;
}
const spherical = makeQuad('Spherical', -3.2);
const cylindrical = makeQuad('Cylindrical', 0);
const staticQuad = makeQuad('Static', 3.2);

// ---- 每帧：相机绕圈 + 两种 CPU 公告板 ----
const info = document.querySelector('#info') as HTMLElement;

class Rig extends Component {
    private _yaw = 0;

    update(dt: number): void {
        if (!faceUploaded) {
            faceTexture.uploadData(paint); // 一次性上传，放 run 之后的 update 里
            faceUploaded = true;
        }
        this._yaw = ((this._yaw || 0) + 26 * dt) % 360;
        const r = (this._yaw * Math.PI) / 180;
        cameraNode.setPosition(new Vec3(Math.sin(r) * 8.5, 2.2, Math.cos(r) * 8.5));
        cameraNode.lookAt(new Vec3(0, 1.4, 0));
        // 球面公告板：整份抄相机世界旋转 → 面片恒平行于视平面
        spherical.setRotation(cameraNode.rotation);
        // 柱面/立面：只抄 yaw（pitch 归零），像真实路牌绕竖轴转身
        const ce = cameraNode.eulerAngles;
        cylindrical.setRotationFromEuler(0, ce.y, 0);
        // 对照组 Static：永不转身 → 相机绕到侧面时被压成一条线
        info.textContent = [
            'billboards CPU route: copy camera rotation per frame (no user GLSL / no Billboard component)',
            `cam yaw=${ce.y.toFixed(0)} (orbit 26 deg/s), spherical=full quat copy, cylindrical=yaw only`,
            'left Spherical always faces camera; middle Cylindrical yaws only; right Static turns edge-on',
            `face texture: gfx=${faceTexture.getGFXTexture() ? 'ok' : 'null'}, uploaded=${faceUploaded}`,
        ].join('\n');
    }
}
cameraNode.addComponent(Rig);

window.__airApp = app;
window.__inspect = { camera, cameraNode, spherical, cylindrical, staticQuad, faceTexture, paint };
app.run(scene);

console.log('[manual/billboards] running on cocosair');
