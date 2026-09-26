# Multiple Canvases, Multiple Scenes（多画布多场景）

> 三个 canvas × 三个 renderer × 三个 scene 并排渲染的多画布分屏课题。
> 配套可运行示例：[`examples/manual-multi-canvas/`](examples/manual-multi-canvas/)
> （单画布三条竖带 × 三台相机 × 三层掩码"子场景"——零外部资产）。

"多 canvas 各自 new 一个 renderer"这条分屏路线在 AIR 走不通——
`createAirApp` 只收**一个** canvas（d.ts 32782 `canvas: HTMLCanvasElement | string`），
且 pal/screen-adapter 是模块顶层单例、import 期就绑定文档 `#GameCanvas`
（[offscreencanvas](offscreencanvas.md) N/A 篇归因过的同一条架构约束）。
AIR 原生的分屏解法是**单画布多相机**：每台相机给一条 `rect` 视口带、给一份 `visibility` 层掩码。要点：

| AIR                                                                  | 实测                               |
| -------------------------------------------------------------------- | ---------------------------------- |
| 无多窗口/多画布渲染入口                                              | **缺**——本篇 PARTIAL 主因          |
| 单 scene 激活（`app.run(scene)` 收一个；`director.getScene()` 单例） | 缺（多 Scene 对象并存未取证）      |
| `camera.rect = new Rect(x, y, w, h)`（归一化视口带）                 | ✓ 本示例（三条竖带）               |
| 每"子场景"占一个自定义层位 + `camera.visibility` 掩码                | ✓ 本示例（层隔离成立）             |
| 每相机 clear 只作用于自身 rect 区域                                  | ✓ 实测（三带 clearColor 互不覆盖） |

## 1. 分屏相关 API 面（实测锚点）

| 入口                     | 锚点                                    | 语义（实测）                                                                                       |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Camera.rect` 读写       | d.ts 21364–21365                        | 归一化视口矩形；`math.Rect(x, y, width, height)`（构造器 d.ts 10950）                              |
| `Camera.visibility` 读写 | d.ts 21280–21281                        | 层掩码，与模型/光源的 `visFlags`（取节点 `layer`）按位与                                           |
| `Camera.priority`        | d.ts 21274                              | 同 scene 多相机渲染次序（小者先）                                                                  |
| `Layers` 内置层表        | `src/cocos/scene-graph/layers.ts` 34–46 | 用户可用位 0–19；`DEFAULT = 1<<30`；`addLayer(name, bit)`（116）只是注册名字，**裸位掩码直接可用** |
| gfx 层 `viewport`        | d.ts 5098                               | 底层视口（组件层 `rect` 转译过去），注释声明"预旋转恒竖屏"                                         |

## 2. 示例拆解

三个"子场景"各占一个自定义层位（`1<<1 / 1<<2 / 1<<3`），内容刻意不同形（单块 / 2×2 方阵 / 竖叠三块）、转速不同，
便于一眼对账"每条带确实只渲染自己那组"：

```ts
    const n = new Node('Cube');
    n.layer = layer;
    n.setPosition(new Vec3(x, y, z));
    parent.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sharedBox;
    return r;
}
```

三台相机一台一条带；**visibility 除了自己那层，还要并上方向光所在的 `DEFAULT` 层**——
这是本篇踩坑位（§3）：

```js
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(10 + i * 8, 14, 22, 255);
    // 层掩码：本相机只看自己那组（layerBits[i]）+ 挂在 DEFAULT 层的方向光；
    // 三组立方体各占独立自定义层位，故互相不可见——这正是分屏"逻辑隔离"的关键。
    cam.visibility = layer | Layers.Enum.DEFAULT;
    cam.rect = new Rect(i / 3, 0, 1 / 3, 1);
    cam.priority = i;
```

覆盖层每帧读回三台相机的 `rect.x/width` 与 `visibility` 数值，承诺肉眼可读、探针可取。

## 3. 实测读数与踩坑

验证器 3/3：`app-contract / visible-frame / no-runtime-error` 全 PASS（3.1s，子集运行 partial；
本例不在 `ANIMATED` 集合，但三组各自转速、画面实际是动的）。
截图 `docs/evidence/examples/manual-multi-canvas.png`：三条竖带三种底色、各显一组不同形状，
带间无互染。探针 dump（运行时刻）：

```
AIR multi-scene = one Scene + N Cameras (rect strip + visibility layer mask)
cam0: rect.x=0.00 w=0.33 vis=1073741826 (layer 2)
cam1: rect.x=0.33 w=0.33 vis=1073741828 (layer 4)
cam2: rect.x=0.67 w=0.33 vis=1073741832 (layer 8)
```

`1073741826 = (1<<1)|DEFAULT`、`1073741828 = (1<<2)|DEFAULT`、`1073741832 = (1<<3)|DEFAULT`，
与代码逐位对账一致。

**开发期踩坑（实测）**：首版 `cam.visibility = layer`（不含 DEFAULT）——分屏与层隔离都"正确"，
但**方向光也被剔除了**（灯的 `visFlags` = 节点 layer = DEFAULT，`1073741824`），
三组立方体只剩环境光、画面整体发暗。浏览器内探针实锤：`lightLayer=1073741824`、
`camVis=1073741828`（修复合入 DEFAULT 后）——**自定义 visibility 掩码分屏时，光源层要记得并进去**。
另注：探针里用 `readPixels` 量化亮度不可行（WebGL 未开 `preserveDrawingBuffer`，读回全 0，
与 [tips](tips.md) 截图锚点篇同一约束），亮度对账以验证器截图为准。

**如实标注**："多 canvas 各自 renderer"式分屏在 AIR 无一等公民路线（单 canvas 架构约束 +
无 OffscreenCanvas/Worker，见 offscreencanvas）；"多个 `Scene` 对象并存、逐 scene 渲染"也未取证——
`app.run(scene)` 收单 scene、`director.getScene()` 单例，多 Scene 对象是否有渲染通路本篇不承诺。
能承诺的是上表的**单画布分屏三件套**（rect × visibility × priority），故定 **PARTIAL**。

## 4. 分屏语义备忘

- **隔离粒度**：AIR 的层掩码是**渲染剔除级**隔离——
  所有物体仍在同一棵 scene 树里，物理/脚本/遍历仍会互相看见。要行为级隔离得应用层自律（按 rig 根节点分组遍历）。
- **清屏语义**：AIR 单 canvas 上靠"每相机 clear 只作用自身 rect"实现互不覆盖，
  实测三带各自 `clearColor` 成立（截图带底色分明）。
- **成本**：AIR 分屏是**每带一次全场景剔除 + 一次绘制**（可见集不同），带数越多剔除/绘制批次越多，
  不是免费午餐。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-multi-canvas        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-multi-canvas/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-multi-canvas
```

示例目录：`docs/manual/examples/manual-multi-canvas/`。
验证器 3/3 全 PASS（3.1s，子集运行 partial）；截图 `docs/evidence/examples/manual-multi-canvas.png`；
rect/visibility 探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-multi-canvas/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Multiple Scenes — 多场景与多视口（docs/manual/multiple-scenes.md）</title>
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

`examples/manual-multi-canvas/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Multiple Scenes（多场景与多视口）
 * 配套文章：docs/manual/multiple-scenes.md
 *
 * AIR 的 pal/screen-adapter 是模块顶层单例、createAirApp 只认一个 #GameCanvas，
 * "多个 Scene + 多个渲染器 + 多个 canvas"的分屏路线走不通（见 offscreencanvas N/A）。
 * 本篇给 AIR 原生分屏方案：单 Scene + 多 Camera，每台相机用 rect 占屏幕一条竖带、用 visibility 层掩码
 * 只渲染自己那组节点——三带各显一组不同几何、各自转速，视觉上等价于"三个场景并排"。
 * 覆盖层读回三台相机的 rect / visibility，证明分屏与层剔除都真实生效。
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
    Rect,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('multi-canvas');

// ---- 一盏方向光（对所有相机可见） ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-45, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 6;

// ---- 三条"子场景"：各占一个自定义层位，几何与转速都不同 ----
const sharedBox = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const layerBits = [1 << 1, 1 << 2, 1 << 3];
const clusterColors = [new Color(235, 110, 105, 255), new Color(110, 225, 140, 255), new Color(120, 170, 245, 255)];
const spinSpeeds = [22, -34, 48];
const rigs: Node[] = [];

function makeCube(parent: Node, layer: number, x: number, y: number, z: number): MeshRenderer {
    const n = new Node('Cube');
    n.layer = layer;
    n.setPosition(new Vec3(x, y, z));
    parent.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = sharedBox;
    return r;
}

layerBits.forEach((layer, i) => {
    const rig = new Node(`SubScene-${i}`);
    rig.setPosition(new Vec3(0, 1.1, 0));
    scene.addChild(rig);
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard' });
    mat.setProperty('mainColor', clusterColors[i]);
    // 三种不同排布：单块 / 2×2 方阵 / 竖叠三块
    if (i === 0) {
        makeCube(rig, layer, 0, 0, 0).material = mat;
    } else if (i === 1) {
        [
            [-0.6, -0.6],
            [0.6, -0.6],
            [-0.6, 0.6],
            [0.6, 0.6],
        ].forEach(([x, z]) => {
            makeCube(rig, layer, x, 0, z).material = mat;
        });
    } else {
        [-0.9, 0, 0.9].forEach((y) => {
            makeCube(rig, layer, 0, y, 0).material = mat;
        });
    }
    rigs.push(rig);
});

// ---- 三台相机：各占屏幕一条竖带（rect），只渲染自己那层（visibility） ----
const cameras: Camera[] = [];
layerBits.forEach((layer, i) => {
    const camNode = new Node(`Cam-${i}`);
    scene.addChild(camNode);
    camNode.setPosition(new Vec3(2.6, 2.8, 7.0));
    camNode.lookAt(new Vec3(0, 1.1, 0));
    const cam = camNode.addComponent(Camera);
    cam.projection = Camera.ProjectionType.PERSPECTIVE;
    cam.fov = 45;
    cam.near = 0.1;
    cam.far = 100;
    cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cam.clearColor = new Color(10 + i * 8, 14, 22, 255);
    // 层掩码：本相机只看自己那组（layerBits[i]）+ 挂在 DEFAULT 层的方向光；
    // 三组立方体各占独立自定义层位，故互相不可见——这正是分屏"逻辑隔离"的关键。
    cam.visibility = layer | Layers.Enum.DEFAULT;
    cam.rect = new Rect(i / 3, 0, 1 / 3, 1);
    cam.priority = i;
    cameras.push(cam);
});

// ---- 覆盖层：读回三台相机的 rect / visibility ----
const info = document.querySelector('#info') as HTMLElement;
class Overlay extends Component {
    update(dt: number): void {
        rigs.forEach((rig, i) => {
            const e = rig.eulerAngles;
            rig.setRotationFromEuler(0, e.y + spinSpeeds[i] * dt, 0);
        });
        info.textContent = [
            'AIR multi-scene = one Scene + N Cameras (rect strip + visibility layer mask)',
            ...cameras.map(
                (c, i) =>
                    `cam${i}: rect.x=${c.rect.x.toFixed(2)} w=${c.rect.width.toFixed(2)} vis=${c.visibility} (layer ${layerBits[i]})`,
            ),
            'each strip shows a different cluster (single / 2x2 / stacked) at a different spin',
        ].join('\n');
    }
}
cameras[0].node.addComponent(Overlay);

window.__airApp = app;
window.__inspect = { cameras, rigs, layerBits };
app.run(scene);

console.log('[manual/multi-canvas] running on cocosair');
```

---

上一篇：[绘制透明对象（How to Draw Transparent Objects）](transparency.md) ｜ 下一篇：[鼠标拾取（Picking Objects with the Mouse）](picking.md)
