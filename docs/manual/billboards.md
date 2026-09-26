# Billboards and Facades（公告板与立面）

> 让一块面片永远正对相机（球面公告板），或只绕竖轴转身（柱面/立面 facade）。
> 配套可运行示例：[`examples/manual-billboards/`](examples/manual-billboards/)
> （三块面片同贴一张 canvas 现造的"脸"纹理，相机绕圈巡游，球面/柱面/静态三路对照——零外部资产）。

公告板的经典实现是 **GPU 顶点着色器路线**：在顶点着色器里把模型视图矩阵的旋转部分剥掉
（或手搓 quad），让三角形在视空间里天然平行于视平面。这条路在 AIR 不存在。各实现路线的有无：

| 路线                                                   | 实测                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| GPU 顶点着色器去旋转                                   | **无用户面 GLSL**（[shadertoy](shadertoy.md) 篇 N/A 同结论：引擎不暴露自定义 shader 编写面），路线不存在 ✗ |
| 引擎内置公告板组件                                     | 引擎无此类组件，d.ts grep `Billboard` 零命中 ✗                                                             |
| **CPU 路线**：每帧把相机世界旋转抄给面片节点（本示例） | ✓                                                                                                          |

CPU 抄旋转在数学上与"顶点着色器去旋转"同解：面片的世界旋转 ≡ 相机世界旋转时，
面片平面恒平行于视平面。区别只在代价——每个公告板节点每帧一次四元数赋值，而非顶点级零成本。

## 1. API 锚点（实测）

| 入口                                          | 语义（实测）                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `node.setRotation(cameraNode.rotation)`       | 整份抄相机世界四元数 → 球面公告板。探针实测面片四元数与相机**当前**及 **+600ms 后**均严格相等                                                 |
| `node.setRotationFromEuler(0, camEuler.y, 0)` | 只抄 yaw、pitch 归零 → 柱面/立面（真实路牌绕竖轴转身）。探针实测 `cylPitch=0`、`cylYaw=61.7` 与相机 yaw 同值                                  |
| `primitives.plane(...)` + 父节点              | plane 默认法线 +Y，子节点 `setRotationFromEuler(90,0,0)` 转成父节点 +Z（[render-targets](rendertargets.md) 篇同款），此后**父节点只负责朝向** |
| `Texture2D.reset + uploadData(canvas)`        | "脸"纹理零资产现造（[canvas-textures](canvas-textures.md) 篇机制），本例一次性上传                                                            |
| `eulerAngles` getter                          | 读相机欧拉角取 yaw；注意 lookAt 结果经欧拉分解，本场景（无 roll）下 y 分量即绕圈角                                                            |

## 2. 示例拆解：三路对照

三块面片（`makeQuad`）挂同一材质 `builtin-standard + USE_ALBEDO_MAP + mainTexture`，
差别只在 `Rig.update` 里对父节点做什么：

```js
        // 球面公告板：整份抄相机世界旋转 → 面片恒平行于视平面
        spherical.setRotation(cameraNode.rotation);
        // 柱面/立面：只抄 yaw（pitch 归零），像真实路牌绕竖轴转身
        const ce = cameraNode.eulerAngles;
        cylindrical.setRotationFromEuler(0, ce.y, 0);
        // 对照组 Static：永不转身 → 相机绕到侧面时被压成一条线
```

相机以 26°/s 绕半径 8.5 的圆巡游并持续 `lookAt` 圆心，所以相机自身有稳定 pitch（俯视），
球面与柱面两块因此会显出可辨差异：球面完全躺平行于视平面，柱面永远"站直"只水平转身。
"脸"纹理带 `TOP` 方位标与正/倒不对称的五官，用来目视核对公告板是否** upright 且正对**——
静态对照组的脸在侧向时机理应是镜反或压扁的，两块公告板则始终五官端正。

**踩坑（对照实验实锤）**：本例首版用 `builtin-unlit + USE_ALBEDO_MAP` 贴这张"裸造"
（reset + uploadData）纹理，两块公告板渲染成**纯白平面**（验证器 visible-frame FAIL，
distinctColors=2）。隔离实验：换 `builtin-standard` 后立即采样出图（distinctColors=6 PASS），
且"一次性上传 + standard"单独成立——即根因是 **unlit + 裸上传 Texture2D 的组合**，
不是上传时机（首版注释里"run 前上传无效"的猜测不成立，已删）。此前 unlit 贴 texture 只在
RenderTexture 上取证过（[render-targets](rendertargets.md) 篇），说明 unlit 的 `USE_ALBEDO_MAP`
路线对纹理来源有额外要求，本构建现象述而不解释。

```js
const faceTexture = new Texture2D();
// 实测坑：本张"裸造"纹理（reset+uploadData）配 unlit+USE_ALBEDO_MAP 渲染成纯白平面、
// 换 standard+USE_ALBEDO_MAP 才采样出图（本构建对照实验；unlit 的贴图路线此前仅在
// RenderTexture 上取证过，见 render-targets 篇）。
faceTexture.reset({ width: TEX_SIZE, height: TEX_SIZE, format: Texture2D.PixelFormat.RGBA8888 });
```

## 3. 实测读数

验证器 4/4：`app-contract / visible-frame / no-runtime-error / frame-diff` 全 PASS（3.5s，子集运行 partial；
`ANIMATED` 集）。截图 `docs/evidence/examples/manual-billboards.png`：脸纹理 upright（TOP 可读、笑容正确），
左块正对镜头，中块只水平转身，右块侧成一条线。

**探针 dump**：`quatEqualNow=true`、`quatEqual600ms=true`（球面块四元数与相机现在、半秒后都相等——
抄旋转每帧在生效）；`cylPitch=0, cylYaw=61.7`（= 当帧相机 eulerAngles.y，yaw-only 成立）；
`staticEuler=[0,0]`（对照组从未被写入朝向）。

**CPU 路线代价**：每个公告板每帧一次四元数复制，几十个节点量级无压力；上千节点时逐节点
`setRotation` 的 JS 开销开始可感，且遮挡/淡出、按距离缩放等进阶能力都得应用层自行补。

## 4. 边界（为何定 PARTIAL）

- 目标行为（球面/柱面公告板）**已完整取证**，但走的是 CPU 抄旋转；GPU 顶点路线因
  本构建无用户 GLSL 而结构性缺失。
- 无引擎内置 `Billboard`/`Sprite` 组件可用，全部逻辑需应用层每帧手写；批量场景（粒子式海量公告板）
  没有合批友好的官方方案。
- unlit 材质配裸上传纹理不显示（§2 踩坑），意味着"公告板 = 无光照 WYSIWYG 色"的常规做法
  在本构建要绕道 standard+调光或其他手段。
- 升级 FULL 条件：出现 Billboard 组件/官方公告板能力，或自定义 effect 路线取证通过
  （届时 GPU 顶点去旋转等价物存在）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-billboards        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-billboards/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-billboards
```

示例目录：`docs/manual/examples/manual-billboards/`。
验证器 4/4 全 PASS（3.5s，子集运行 partial）；截图 `docs/evidence/examples/manual-billboards.png`；
探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-billboards/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Billboards and Facades — 公告板（docs/manual/billboards.md）</title>
        <style>
            html,
            body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #fff;
            }
            #GameDiv {
                width: 100%;
                height: 100%;
            }
            #Cocos3dGameContainer {
                width: 100%;
                height: 100%;
            }
            #GameCanvas {
                width: 100%;
                display: block;
                height: 100%;
            }
            #info {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                font:
                    12px/1.6 ui-monospace,
                    Consolas,
                    monospace;
                color: #e8eef7;
                background: rgba(10, 16, 26, 0.78);
                padding: 6px 10px;
                border-radius: 4px;
                white-space: pre;
            }
        </style>
        <script type="importmap">
            { "imports": { "cocosair": "/build/cocosair.module.js" } }
        </script>
    </head>
    <body>
        <!-- 官方模板 DOM 结构：pal/screen-adapter 依赖这些 id 做全屏适配 -->
        <div id="GameDiv">
            <div id="Cocos3dGameContainer">
                <!-- #GameCanvas 必须在引擎 import 前存在（pal/screen-adapter 为模块顶层单例） -->
                <canvas id="GameCanvas"></canvas>
            </div>
        </div>
        <div id="info">loading…</div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-billboards/main.ts`：

```ts
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
```

---

上一篇：[用 Canvas 做动态纹理（Using A Canvas for Dynamic Textures）](canvas-textures.md) ｜ 下一篇：[释放资源（Freeing Resources）](cleanup.md)
