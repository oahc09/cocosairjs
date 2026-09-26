# Aligning HTML Elements to 3D（HTML 元素对齐 3D）

> 把 DOM 元素钉在 3D 对象的屏幕位置上。
> 配套可运行示例：[`examples/manual-align-html/`](examples/manual-align-html/)
> （两颗轨道立方体各带一个 HTML 标签跟随投影位置，中心大立方体做遮挡隐藏——零外部资产）。

AIR 做这件事靠相机组件自带的 **`camera.worldToScreen(worldPos, out?)`**（d.ts 21418）——
一步把 3D 世界位置换算成屏幕像素坐标，去摆绝对定位的 DOM 元素；
"锚点被挡住就藏标签"用应用层射线检测。DOM 侧就是普通 CSS。要点：

| AIR                                                                                    | 实测            |
| -------------------------------------------------------------------------------------- | --------------- |
| `camera.worldToScreen(pos, out)` 世界坐标直接给屏幕像素                                | ✓（本示例核心） |
| `position: absolute` + `transform: translate(-50%,-50%)` 普通 CSS，无引擎参与          | ✓               |
| 遮挡检测（被挡住藏标签）：无引擎级求交，应用层 slab 射线（[picking](picking.md) 同款） | ✓（本示例）     |
| 无"引擎托管 DOM 层"的渲染器类；每帧手写 `style.left/top` 即等价                        | 缺（不需要）    |

## 1. 投影相关 API 面（实测锚点）

| 入口                                                       | 锚点          | 语义（实测）                                                                      |
| ---------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `Camera.worldToScreen(worldPos, out?)`                     | d.ts 21418    | 世界坐标 → **左下角原点**的屏幕像素（与 `screenPointToRay` 同一坐标系，逆向操作） |
| `Camera.screenToWorld(screenPos, out?)`                    | d.ts 21426    | 反向：屏幕点 → 世界点（本篇不需要）                                               |
| `Vec3.distance(a, b)` / `Vec3.subtract` / `Vec3.normalize` | math 顶层导出 | 静态方法返回 out 向量本身，**不返回长度**（见 §2 踩坑）                           |

## 2. 示例拆解 + 两个踩坑

布局：相机 (0, 3.2, 9.5) 俯视原点；中心一颗 2.2 大立方体作遮挡体；橙/青两颗 0.55 锚点立方体
绕圈轨道（相位差 π）、上下起伏。每帧对每个锚点做三件事：投影摆标签、射线判遮挡、覆盖层打印读数。

```js
            camera.worldToScreen(a.node.position, screenPos);
            // worldToScreen 是左下角原点，CSS 是左上角 → 翻 y
            const cssTop = window.innerHeight - screenPos.y;
            a.el.style.left = `${screenPos.x.toFixed(1)}px`;
            a.el.style.top = `${cssTop.toFixed(1)}px`;
```

**踩坑 1（坐标系）**：`worldToScreen` 与 `screenPointToRay` 一样是**左下角原点、y 向上**
（d.ts 21403/21418 注释 + 探针实测），而 CSS `top` 是左上角原点、y 向下——不翻 `innerHeight - y`
标签会上下镜像。这与 [picking](picking.md) §2 是同一对坐标系，方向相反（一个进一个出）。

**踩坑 2（Vec3 静态方法语义）**：`Vec3.normalize(out, a)` 返回的是 **out 向量**，不是长度。
首版示例写 `const dist = Vec3.normalize(toAnchor, toAnchor)` 后 `dist.toFixed(...)`，
运行时报 `TypeError: dist.toFixed is not a function`（验证器 no-runtime-error FAIL 抓出）。
长度要单独取：

```js
            // 遮挡判定：从相机朝锚点发射线，若先命中中心立方体则藏标签
            Vec3.subtract(toAnchor, a.node.position, camPos);
            const dist = Vec3.distance(camPos, a.node.position);
            Vec3.normalize(toAnchor, toAnchor);
            const tHit = rayHitsAABB(camPos, toAnchor, blockCenter, BLOCK_HALF);
            const occluded = tHit >= 0 && tHit < dist - 0.2;
            a.el.style.opacity = occluded ? '0' : '1';
```

`rayHitsAABB` 是 [picking](picking.md) §2 的同款 slab 相交函数（逐字见示例附录）。
`occluded` 条件 `tHit < dist - 0.2`：遮挡体近表面比锚点更近才算挡住，留 0.2 容差防标签在掠射角抖动。
标签 DOM 侧要点：`#GameDiv` 设 `position: relative` 作定位参照，标签
`transform: translate(-50%, -50%)` 居中钉在投影点上，`pointer-events: none` 避免吃掉鼠标事件
（若之后要给场景加拾取，标签不能挡道——两篇示例可无缝合并）。

## 3. 实测读数

验证器 4/4：`app-contract / visible-frame / no-runtime-error / frame-diff` 全 PASS（3.5s，子集运行 partial；
本例在 `ANIMATED` 集合，轨道运动本身即持续变化源）。截图 `docs/evidence/examples/manual-align-html.png`
是 canvas 位图（验证器经 `EVENT_AFTER_DRAW` 读帧缓冲），**不含 DOM 层**——标签对齐用整页截图单独取证：

- 常态帧：`ORANGE: screen=(534, 239) dist=9.5 occluded=false`，`TEAL: screen=(139, 216) dist=11.1`，
  整页截图中两枚圆角标签精确钉在各自立方体上。
- 遮挡帧（探针把 `aligner._t` 钉在锚点转到立方体正后方 `ang=π` 的相位）：
  `ORANGE: screen=(311, 201) dist=13.1 occluded=true` → `#tag-orange` 的 `style.opacity=0`，
  标签消失且锚点立方体本身也被遮挡体挡住；TEAL 在前方 `occluded=false` 标签照常显示。
- y 翻转方向核对：锚点转到轨道远端（z=-3.4、略低于视心）时投影 `cssTop≈201`（画面上半），
  近端（z=+3.4）时 `cssTop≈309`（下半）——远上近下，与透视一致，翻转正确。

**探针踩坑**：`window.__inspect.camera` 是 Camera 组件，不是本篇的 Aligner 组件——
第一版钉相位钉在 `camera._t` 上毫无效果（读数纹丝不动），须把 `aligner` 实例也挂进 `__inspect` 才能远程驱动。

## 4. 实践备忘

- **一步投影**：`worldToScreen` 直接给像素坐标，但输出是左下角原点（CSS 是左上角），
  每帧 `innerHeight - y` 的翻转这一步省不掉。
- **遮挡检测**：引擎不暴露射线求交 API，沿用本篇姊妹技术——应用层 slab 射线
  （见 [picking](picking.md)）。锚点若换任意网格，这里同样只能 AABB 近似或挂物理体。
- **无引擎托管 DOM 层**：AIR 没有"DOM 层渲染器"类，也不需要——每帧写 `style.left/top`
  就是它的全部职责，示例即模板。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-align-html        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-align-html/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-align-html
```

示例目录：`docs/manual/examples/manual-align-html/`。
验证器 4/4 全 PASS（3.5s，子集运行 partial）；截图 `docs/evidence/examples/manual-align-html.png`；
DOM 层对齐/遮挡读数见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-align-html/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Aligning HTML Elements to 3D — HTML 元素对齐 3D（docs/manual/align-html-elements-to-3d.md）</title>
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
                position: relative;
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
            .tag {
                position: absolute;
                z-index: 9;
                left: 0;
                top: 0;
                font:
                    12px/1 ui-monospace,
                    Consolas,
                    monospace;
                color: #0b1018;
                padding: 3px 8px;
                border-radius: 10px;
                transform: translate(-50%, -50%);
                pointer-events: none;
                white-space: pre;
            }
            #tag-orange {
                background: #f2b26b;
            }
            #tag-teal {
                background: #7fd8cf;
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
            <div id="tag-orange" class="tag">ORANGE</div>
            <div id="tag-teal" class="tag">TEAL</div>
        </div>
        <div id="info">loading…</div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-align-html/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Aligning HTML Elements to 3D（HTML 元素对齐 3D）
 * 配套文章：docs/manual/align-html-elements-to-3d.md
 *
 * 本能力的核心是 camera 投影：把 3D 世界坐标换算成屏幕像素，去摆 DOM 元素，
 * 并用射线检测决定"被挡住就藏标签"。AIR 的对应件是 camera.worldToScreen（d.ts 21418，
 * 输出左下角原点像素——与 screenPointToRay 同一坐标系，摆 DOM 时要翻 y）。
 * 本例：两颗轨道立方体（橙/青）各带一个 HTML 标签跟随其屏幕投影位置；
 * 中心大立方体用 picking 篇同款 slab 射线做遮挡检测，挡住时标签淡出。
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

const scene = new Scene('align-html');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3.2, 9.5));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
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
dirNode.setRotationFromEuler(-45, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 6;

// ---- 中心遮挡体 + 两颗轨道锚点立方体 ----
function makeCube(name: string, size: number, pos: Vec3, rgb: number[]): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(pos);
    scene.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = utils.createMesh(primitives.box({ width: size, height: size, length: size }));
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2], 255));
    r.material = m;
    return n;
}
const blocker = makeCube('Blocker', 2.2, new Vec3(0, 0.8, 0), [205, 210, 220]);
const anchors: { node: Node; el: HTMLElement; phase: number; label: string }[] = [
    {
        node: makeCube('Anchor-orange', 0.55, new Vec3(0, 0.8, 0), [242, 178, 107]),
        el: document.querySelector('#tag-orange') as HTMLElement,
        phase: 0,
        label: 'ORANGE',
    },
    {
        node: makeCube('Anchor-teal', 0.55, new Vec3(0, 0.8, 0), [127, 216, 207]),
        el: document.querySelector('#tag-teal') as HTMLElement,
        phase: Math.PI,
        label: 'TEAL',
    },
];

// ---- 射线 × AABB（picking 篇同款 slab 法，用于遮挡判定） ----
function rayHitsAABB(o: Vec3, d: Vec3, center: Vec3, half: number): number {
    let tMin = -Infinity;
    let tMax = Infinity;
    const ax = [center.x - half, center.y - half, center.z - half];
    const bx = [center.x + half, center.y + half, center.z + half];
    const oc = [o.x, o.y, o.z];
    const dc = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
        if (Math.abs(dc[i]) < 1e-8) {
            if (oc[i] < ax[i] || oc[i] > bx[i]) return -1;
        } else {
            let t0 = (ax[i] - oc[i]) / dc[i];
            let t1 = (bx[i] - oc[i]) / dc[i];
            if (t0 > t1) {
                const t = t0;
                t0 = t1;
                t1 = t;
            }
            if (t0 > tMin) tMin = t0;
            if (t1 < tMax) tMax = t1;
            if (tMin > tMax) return -1;
        }
    }
    return tMax < 0 ? -1 : tMin >= 0 ? tMin : tMax;
}

// ---- 每帧：轨道运动 → worldToScreen 摆标签 → 遮挡淡出 ----
const info = document.querySelector('#info') as HTMLElement;
const screenPos = new Vec3();
const toAnchor = new Vec3();
const BLOCK_HALF = 1.1;
const blockCenter = new Vec3(0, 0.8, 0);

class Aligner extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        const camPos = cameraNode.position;
        const lines: string[] = [
            'align html: camera.worldToScreen(world) → CSS px (left-bottom origin → flip y)',
            `blocker at (0, 0.8, 0) half ${BLOCK_HALF}; occlusion = ray cam→anchor slab-hits blocker`,
        ];
        anchors.forEach((a, i) => {
            const ang = this._t * 0.7 + a.phase;
            a.node.setPosition(new Vec3(Math.sin(ang) * 3.4, 0.8 + Math.sin(ang * 2.0) * 0.5, Math.cos(ang) * 3.4));
            camera.worldToScreen(a.node.position, screenPos);
            // worldToScreen 是左下角原点，CSS 是左上角 → 翻 y
            const cssTop = window.innerHeight - screenPos.y;
            a.el.style.left = `${screenPos.x.toFixed(1)}px`;
            a.el.style.top = `${cssTop.toFixed(1)}px`;
            // 遮挡判定：从相机朝锚点发射线，若先命中中心立方体则藏标签
            Vec3.subtract(toAnchor, a.node.position, camPos);
            const dist = Vec3.distance(camPos, a.node.position);
            Vec3.normalize(toAnchor, toAnchor);
            const tHit = rayHitsAABB(camPos, toAnchor, blockCenter, BLOCK_HALF);
            const occluded = tHit >= 0 && tHit < dist - 0.2;
            a.el.style.opacity = occluded ? '0' : '1';
            lines.push(
                `${a.label}: screen=(${screenPos.x.toFixed(0)}, ${cssTop.toFixed(0)}) dist=${dist.toFixed(1)} occluded=${occluded}`,
            );
        });
        info.textContent = lines.join('\n');
    }
}
const aligner = cameraNode.addComponent(Aligner);

window.__airApp = app;
window.__inspect = { camera, anchors, blocker, aligner };
app.run(scene);

console.log('[manual/align-html] running on cocosair');
```

---

上一篇：[使用 Shadertoy 着色器（Using Shadertoy shaders）](shadertoy.md) ｜ 下一篇：[使用索引纹理做拾取与着色（Using Indexed Textures for Picking and Color）](indexed-textures.md)
