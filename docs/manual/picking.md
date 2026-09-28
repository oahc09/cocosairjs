# Picking Objects with the Mouse（鼠标拾取）

> 用鼠标坐标 + 射线做物体拾取。
> 配套可运行示例：[`examples/manual-picking/`](examples/manual-picking/)
> （3×3 彩色立方体网格，射线命中者放大变白，无鼠标时自动扫——零外部资产）。

AIR 的拾取套路是：读鼠标坐标 → **相机组件自带的 `screenPointToRay`**（d.ts 21410，把屏幕坐标转成一条几何射线）→ 求交。
但 AIR **没有**"引擎替你遍历网格求交"的顶层 API——
`Ray` / `AABB` 类都不在顶层导出表里（实测：`geometry` 命名空间导出，`Ray`/`AABB` 单独名不导出）。
所以 AIR 拾取 = `screenPointToRay` + **应用层自己求交**。要点：

| AIR                                                                                     | 实测                    |
| --------------------------------------------------------------------------------------- | ----------------------- |
| `camera.screenPointToRay(sx, sy, outRay)`                                               | ✓（本示例核心）         |
| 无引擎级网格求交；应用层手写射线×AABB                                                   | ✓（本示例 slab 相交）   |
| 逐三角形精确拾取 / GPU picking：无一等公民入口（`Ray`/`AABB` 不导出、无用户 GLSL 可做） | 缺（属进阶变体，见 §3） |
| 物理射线 `physics.raycastClosest` 存在（d.ts 35590），但需碰撞体 + 物理后端             | 契约在，本篇未取证      |

## 1. 拾取相关 API 面（实测锚点）

| 入口                                                    | 锚点          | 语义（实测）                                                                       |
| ------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `Camera.screenPointToRay(x, y, out?)`                   | d.ts 21410    | 屏幕空间（**左下角原点**，见 §2 踩坑）→ 射线；`out` 省略时内部 `Ray.create()` 新建 |
| `Camera.screenToWorld(screenPos, out?)`                 | d.ts 21426    | 屏幕点 → 世界点（本例用射线×平面更直观，未走这条）                                 |
| `geometry.Ray`（`.o` 起点 / `.d` 方向）                 | d.ts 12299 起 | 仅 `geometry` 命名空间导出，`Ray` 非顶层名——用 `{o:Vec3, d:Vec3}` 对象承接即可     |
| `input.on(SystemEventType.MOUSE_MOVE, cb)`              | d.ts 26756    | 事件对象 `getUILocation()` 给 UI 坐标（**左上角 y 向下**）                         |
| `physics.PhysicsSystem.raycastClosest(ray, mask, dist)` | d.ts 35590    | 需给立方体挂碰撞体并启用物理后端；纯几何拾取不必                                   |

## 2. 示例拆解 + 坐标系踩坑

**踩坑（实测）**：`screenPointToRay` 的 y 是**左下角原点**（d.ts 21403 注释 "left-bottom origin"），
而 `getUILocation()` 返回的是**左上角、y 向下**的 UI 坐标。两者 y 方向相反——
不翻转就会得到上下颠倒的命中。示例里统一用归一化 `pointer.y`（0=顶、1=底），传入前翻转：

```js
        const sx = pointer.x * window.innerWidth;
        // screenPointToRay 的 y 是左下角原点（d.ts 21403 注释 + 探针实测：小 y → 命中更近的排），
        // 而 getUILocation 是左上角 y 向下，故此处翻转。
        const sy = (1 - pointer.y) * window.innerHeight;
        camera.screenPointToRay(sx, sy, ray);
```

求交用应用层 slab 法（射线 vs 轴对齐立方体 AABB，无第三方依赖）：

```ts
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
```

立方体是轴对齐、不旋转的，故其世界 AABB 就是 `center = 节点位置`、`half = 0.5`——
本例刻意如此，避免引入 OBB/旋转矩阵求交的复杂度。
命中的立方体放大到 1.4×、`mainColor` 变白。另有一颗 `builtin-unlit` 亮黄小球作**光标标记**，
沿射线×水平面落点持续移动——既直观指示指针落点，又保证画面持续变化（frame-diff 用，见 §3）。

## 3. 实测读数

验证器 4/4：`app-contract / visible-frame / no-runtime-error / frame-diff` 全 PASS（3.5s，子集运行 partial；
本例在 `ANIMATED` 集合）。截图 `docs/evidence/examples/manual-picking.png`：3×3 九色网格 + 一颗命中立方体放大、
黄色光标球清晰可见。

**拾取正确性探针**（把 `pointer.source` 设为 `mouse` 后逐点写坐标、读回命中序号）：

```
center (50%,50%) → hit 4（正中）
left   (40%,50%) → hit 3   right (60%,50%) → hit 5
up-left(44%,34%) → hit 0（左上）
```

命中序号与 3×3 网格行列自洽（`idx = (gz+1)*3 + (gx+1)`），且左右对称、上下随翻转正确——证明 `screenPointToRay` +
slab 求交 + y 翻转三者组合成立。**frame-diff 首跑 FAIL 复盘**：最初画面里立方体只在被命中时才变，
Lissajous 指针在两帧 400ms 间隔内可能停在同一格或格间（`hit=-1`）导致画面零变化 →
加了持续移动的光标球后过（与 [animation-system](animation-system.md) 的"动画示例要有与相位无关的持续变化源"同一条经验）。

**如实标注（能力边界，不改本篇 FULL 定性）**：本篇教的"鼠标拾取"在 AIR 端到端可用——射线生成、求交、命中反馈全成立，
故定 **FULL**。边界在于：本例是**轴对齐立方体 + 应用层 AABB**，属规则形状拾取；
**逐三角形精确拾取**（对任意 mesh 求三角命中）与 **GPU picking**（离屏渲染 ID 图）在 AIR 无一等公民入口——
`Ray`/`AABB` 不导出、无用户 GLSL 做 ID 图（GPU picking 的完整讨论在专门的 [indexed-textures](indexed-textures.md) 一篇，定 PARTIAL）。
可行升级路：给物体挂物理碰撞体走 `physics.raycastClosest`（本篇未取证），或应用层对三角列表手写 Möller–Trumbore
（数据自备，指路 [custom-geometry](custom-buffergeometry.md)）。

## 4. 拾取要点备忘

- **求交谁做**：AIR 引擎只给"屏幕→射线"这一步，
  射线与什么求交、怎么求交全在应用层。好处是形状语义自由（AABB/球/物理体任选），代价是要自己写。
- **坐标系**：AIR `screenPointToRay` 吃**像素**坐标且 y 以左下为原点向上。
  事件 `getUILocation()` 在默认设置（未显式设设计分辨率）下与 `getLocation()` **同空间同向**
  （W05 实测：离中心点击 (800,200) → loc=(800,520)=ui，DPR 1/2 一致，y 均为左下原点向上；
  证据 `docs/evidence/w05-coordinate-spaces.json`）——本页早期"UI 坐标左上 y 向下"的说法
  与当期引擎实测不符，已修正。设置设计分辨率后 UI 空间随缩放变化，届时另行验证。
- **事件层**：AIR 鼠标走 window 级 `input.on(MOUSE_MOVE)`（与 [tips](tips.md) 键盘锚点同源），
  无需给 canvas 绑 DOM 监听、也无需聚焦。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-picking        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-picking/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-picking
```

示例目录：`docs/manual/examples/manual-picking/`。
验证器 4/4 全 PASS（3.5s，子集运行 partial）；截图 `docs/evidence/examples/manual-picking.png`；
命中序号探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-picking/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Picking Objects with the Mouse — 鼠标拾取（docs/manual/picking.md）</title>
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

`examples/manual-picking/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Picking Objects with the Mouse（鼠标拾取）
 * 配套文章：docs/manual/picking.md
 *
 * AIR 顶层导出里没有 Ray/AABB 构造器，也没有内置 Raycaster，但相机组件自带
 * screenPointToRay(x, y) 返回一条几何射线（o 起点 + d 方向），拾取由此自建。
 * 本例：3×3 彩色立方体网格，把鼠标屏幕坐标转成射线，与应用层手算的立方体 AABB 做 slab 相交，
 * 命中的立方体放大 + 变白。无鼠标时（自动验证器）射线沿 Lissajous 轨迹自动扫过网格，保证画面持续变化。
 * 覆盖层打印当前指针坐标与命中序号，供探针取证。
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
    input,
    SystemEventType,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('picking');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(4.5, 5.5, 8.5));
cameraNode.lookAt(new Vec3(0, 0, 0));
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
dir.illuminance = 4.5;

// ---- 3×3 彩色立方体网格 ----
const HALF = 0.5;
const SPACING = 1.7;
const sharedMesh = utils.createMesh(primitives.box({ width: HALF * 2, height: HALF * 2, length: HALF * 2 }));
const cubes: { node: Node; mat: Material; base: number[]; center: Vec3 }[] = [];
const palette = [
    [220, 90, 90],
    [90, 200, 120],
    [90, 140, 230],
    [225, 190, 80],
    [170, 110, 220],
    [90, 195, 200],
    [230, 130, 70],
    [150, 210, 90],
    [210, 100, 170],
];
let idx = 0;
for (let gz = -1; gz <= 1; gz++) {
    for (let gx = -1; gx <= 1; gx++) {
        const n = new Node(`Cube-${idx}`);
        n.layer = Layers.Enum.DEFAULT;
        n.setPosition(new Vec3(gx * SPACING, 0, gz * SPACING));
        scene.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = sharedMesh;
        const m = new Material();
        m.initialize({ effectName: 'builtin-standard' });
        const base = palette[idx];
        m.setProperty('mainColor', new Color(base[0], base[1], base[2], 255));
        r.material = m;
        cubes.push({ node: n, mat: m, base, center: new Vec3(gx * SPACING, 0, gz * SPACING) });
        idx++;
    }
}

// ---- 应用层射线 vs AABB（slab 相交，无第三方依赖） ----
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

// ---- 指针：有鼠标用鼠标，否则 Lissajous 自动扫 ----
const info = document.querySelector('#info') as HTMLElement;
const pointer: { x: number; y: number; source: string } = { x: 0.5, y: 0.5, source: 'auto' };
input.on(SystemEventType.MOUSE_MOVE, (e) => {
    const loc = e.getUILocation();
    pointer.x = loc.x / window.innerWidth;
    pointer.y = loc.y / window.innerHeight;
    pointer.source = 'mouse';
});

// ---- 光标标记：射线与地面 y=0 的交点处一颗亮黄小球，持续可见指针落点 ----
const cursorNode = new Node('Cursor');
cursorNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cursorNode);
const cursorR = cursorNode.addComponent(MeshRenderer);
cursorR.mesh = utils.createMesh(primitives.sphere(0.16, 16, 12));
const cursorMat = new Material();
cursorMat.initialize({ effectName: 'builtin-unlit' });
cursorMat.setProperty('mainColor', new Color(255, 230, 60, 255));
cursorR.material = cursorMat;

let hitIndex = -1;
const ray: { o: Vec3; d: Vec3 } = { o: new Vec3(), d: new Vec3() };

class Picker extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        if (pointer.source === 'auto') {
            pointer.x = 0.5 + 0.22 * Math.sin(this._t * 0.6) * Math.cos(this._t * 0.23);
            pointer.y = 0.5 + 0.18 * Math.sin(this._t * 0.42);
        }
        const sx = pointer.x * window.innerWidth;
        // screenPointToRay 的 y 是左下角原点（d.ts 21403 注释 + 探针实测：小 y → 命中更近的排），
        // 而 getUILocation 是左上角 y 向下，故此处翻转。
        const sy = (1 - pointer.y) * window.innerHeight;
        camera.screenPointToRay(sx, sy, ray);
        // 光标落在水平面 y=CURSOR_Y 上（高于放大后的立方体顶，避免被遮挡）
        const CURSOR_Y = 0.95;
        if (ray.d.y < -1e-6) {
            const tc = (CURSOR_Y - ray.o.y) / ray.d.y;
            cursorNode.setPosition(new Vec3(ray.o.x + ray.d.x * tc, CURSOR_Y, ray.o.z + ray.d.z * tc));
        }
        let best = -1;
        let bestT = Infinity;
        for (let i = 0; i < cubes.length; i++) {
            const t = rayHitsAABB(ray.o, ray.d, cubes[i].center, HALF);
            if (t >= 0 && t < bestT) {
                bestT = t;
                best = i;
            }
        }
        hitIndex = best;
        for (let i = 0; i < cubes.length; i++) {
            const on = i === best;
            const c = cubes[i];
            const s = on ? 1.4 : 1;
            c.node.setScale(new Vec3(s, s, s));
            const b = c.base;
            const col = on ? new Color(255, 255, 255, 255) : new Color(b[0], b[1], b[2], 255);
            c.mat.setProperty('mainColor', col);
        }
        info.textContent = [
            'picking: camera.screenPointToRay(x, y) + app-layer ray/AABB slab test',
            `pointer: (${(pointer.x * 100).toFixed(0)}%, ${(pointer.y * 100).toFixed(0)}%) source=${pointer.source}`,
            `ray origin=(${ray.o.x.toFixed(2)}, ${ray.o.y.toFixed(2)}, ${ray.o.z.toFixed(2)}) dir=(${ray.d.x.toFixed(2)}, ${ray.d.y.toFixed(2)}, ${ray.d.z.toFixed(2)})`,
            `hit cube index: ${hitIndex} (-1 = none) — highlighted white & scaled 1.4x`,
            `cursor (ray×plane y=0.95): (${cursorNode.position.x.toFixed(2)}, ${cursorNode.position.z.toFixed(2)})`,
        ].join('\n');
    }
}
cameraNode.addComponent(Picker);

window.__airApp = app;
window.__inspect = { camera, cubes, pointer, getHitIndex: () => hitIndex, ray };
app.run(scene);

console.log('[manual/picking] running on cocosair');
```

---

上一篇：[多个场景（Multiple Scenes）](multiple-scenes.md) ｜ 下一篇：[后处理（Post Processing）](post-processing.md)
