# Using A Canvas for Dynamic Textures（用 Canvas 做动态纹理）

> 把 2D canvas 当活纹理：每帧作画、每帧重传，贴到 3D 表面上。
> 配套可运行示例：[`examples/manual-dynamic-texture/`](examples/manual-dynamic-texture/)
> （256×256 离屏画布画"时钟扫针 + 递增帧号"，同贴一块竖直面与一颗自转立方体——零外部资产）。

AIR 的动态纹理机制：`SimpleTexture.uploadData(source)`（d.ts 43970）
**source 直接收 `HTMLCanvasElement`**，每帧画完调一次即让新内容上屏；
纹理本体用 `new Texture2D()` + `reset({width, height, format})` 现造。要点：

| AIR                                                                                                                      | 实测                          |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 建纹理：`new Texture2D()` + `reset({w,h,format})` + 首次 `uploadData(canvas)`                                            | ✓（本示例）                   |
| 重传：每帧 `texture.uploadData(canvas)`                                                                                  | ✓（探针实测 ~62 次/秒无异常） |
| y 方向：`uploadData` **不翻转**——画布顶行落在 v=0=面片下缘，画面上下颠倒（§2 踩坑）                                      | ✗ 需预翻转                    |
| 换源：`ImageAsset(canvas)` + `texture.image = ...` 也可行（[textures](textures.md) 篇两步上传路线），逐帧换 image 未取证 | 述而不承诺                    |

## 1. 动态纹理 API 面（实测锚点）

| 入口                                      | 锚点                                     | 语义（实测）                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Texture2D.reset(info)`                   | d.ts 23343；`ITexture2DCreateInfo` 43883 | `{width, height, format?, mipmapLevel?}` 重建 GPU 资源；注释明示 reset 后必须显式 `uploadData`                                                  |
| `uploadData(source, level?, arrayIndex?)` | d.ts 43970                               | 收 `HTMLCanvasElement / HTMLImageElement / ArrayBufferView / ImageBitmap`；文档承诺"图像小于 mipmap 尺寸时从左上角局部更新"（局部更新本例未用） |
| `Texture2D.PixelFormat`                   | 公共枚举                                 | `RGBA8888` 保持默认；`SRGB888` / `SRGBA8888` 提供显式硬件解码路径，须配合自己的颜色处理 effect，不能叠加标准材质现有软件解码                    |
| `setWrapMode` / `WrapMode`                | 公共 API                                 | 本例使用 CLAMP_TO_EDGE；浏览器目标为 WebGL2，不应把 WebGL1 的 NPOT 限制当作当前全局限制                                                         |
| `getGFXTexture()`                         | d.ts 43939                               | 底层 gfx 纹理句柄；探针读回非 null=GPU 资源真实存在                                                                                             |
| `defines: { USE_ALBEDO_MAP: true }`       | [textures](textures.md) 篇同款           | `builtin-standard` 不开此宏则 `mainTexture` 不参与着色                                                                                          |

## 2. 示例拆解 + y 翻转踩坑

每帧三步：`drawPaint` 在离屏 2D context 上作画 → `texture.uploadData(paint)` 重传 →
材质侧什么都不用改（同一 `Texture2D` 对象被竖直面和立方体共用，一处上传两处生效）。

**踩坑（截图实锤）**：首版画面上下颠倒——"AIR" 方位标（画在画布顶部）出现在面片底部且倒立。
归因：引擎上传路径固定 `UNPACK_FLIP_Y_WEBGL = false`（build js 78228/82958 两处），
而资产加载管线（图片文件）是在 loader 里预翻好的，`uploadData` 这条裸上传路不吃这一步。
解法：作画时整体预翻转，一次 `setTransform` 解决，之后所有绘制代码按"所见即所得"的直觉坐标写：

```ts
    // 实测坑：uploadData(canvas) 不做 y 翻转（引擎固定 UNPACK_FLIP_Y_WEBGL=false，
    // build js 78228/82958），画布顶行落在 v=0 = 面片下缘 → 画面上下颠倒。
    // 解法：作画时整体预翻转，让画布内容"倒着画"、上屏正好"正着看"。
    g2d.setTransform(1, 0, 0, -1, 0, TEX_SIZE);
```

内容刻意选了"与相位无关的持续变化源"：时钟扫针（连续角度）之外还有**递增帧号 `f=N`** 与
底部进度条（`(frame*3)%256`）——本例在 `ANIMATED` 集，帧号保证任意 400ms 双帧窗口必有像素变化
（[picking](picking.md) §3 的复盘经验直接复用）。

## 3. 实测读数

验证器 4/4：`app-contract / visible-frame / no-runtime-error / frame-diff` 全 PASS（3.6s，子集运行 partial；
`ANIMATED` 集）。截图 `docs/evidence/examples/manual-dynamic-texture.png`：左侧竖直面 AIR 在左上、
帧号在左下、扫针在走；右侧自转立方体同一纹理贴满六面（顶面 UV 方向与正面不同属立方体展开约定，非 bug）。

**探针 dump**：500ms 窗口 `uploadsDelta=31`（≈62 次/秒，逐帧重传成立、无报错堆积）；
`texture.width/height=256/256`、`getGFXTexture()` 非 null；覆盖层 `uploads=93, frame=93` 与帧号 1:1。

**色彩口径提醒**：历史示例中 canvas 画的 `#1c3a66` 深蓝上屏后明显更暗，不能仅据此归因为缺少 sRGB 后端格式。
当前公开枚举提供 `SRGB888` / `SRGBA8888`，但标准材质已有软件解码，不能直接替换格式造成重复解码。
显式颜色链路与等价输入验收见[纹理颜色空间](../reference/texture-color-space.md)。要"所见即所得"的亮色文字面板，用 `builtin-unlit` + `mainTexture`
（unlit 不吃光照，[backgrounds](backgrounds.md) 篇实测近原色）比调灯更省事。本例保留 standard
是为了顺带演示 `USE_ALBEDO_MAP` 在动态纹理下同样成立。

## 4. 边界（为何定 PARTIAL）

- 机制层成立（上传/共享/动画全取证），但**没有**"构造即绑定 + 脏标记自动重传"式
  的一等公民动态纹理封装：每次改动都要显式 `uploadData`，忘调不报错、只是画面不动（静默失败）。
- `uploadData` 文档承诺的**局部更新**（小图从左上角覆盖）未取证；逐帧全量重传 256×256 无压力，
  大纹理高频局部位是否更省，本构建未测。
- 逐帧 `texture.image = new ImageAsset(canvas)` 的替代路线未取证（一次性上传路线已在
  [textures](textures.md) 篇取证）。
- 升级 FULL 条件：出现官方脏标记/自动重传设施，或局部上传路径取证通过。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-dynamic-texture        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-dynamic-texture/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-dynamic-texture
```

示例目录：`docs/manual/examples/manual-dynamic-texture/`。
验证器 4/4 全 PASS（3.6s，子集运行 partial）；截图 `docs/evidence/examples/manual-dynamic-texture.png`；
探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-dynamic-texture/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Using A Canvas for Dynamic Textures — Canvas 动态纹理（docs/manual/canvas-textures.md）</title>
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

`examples/manual-dynamic-texture/main.ts`：

```ts
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
```

---

上一篇：[使用索引纹理做拾取与着色（Using Indexed Textures for Picking and Color）](indexed-textures.md) ｜ 下一篇：[公告板与立面（Billboards and Facades）](billboards.md)
