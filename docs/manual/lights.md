# 光源（Lights）

> 对应 three.js manual 的 *Lights* 一篇：讲清"有哪些光、强度怎么设、为什么我的光不亮"。
> 配套可运行示例：[`examples/manual-lights/`](examples/manual-lights/)（四种光源轮流点亮同一颗球）。

Cocos AIR 暴露四种光源组件：`DirectionalLight`、`PointLight`、`SpotLight`、`SphereLight`。
它们都是普通 `Component`，挂到 `Node` 上、把节点加进场景即生效——没有 three.js 里
"光还要手动 add 到 scene 的 lights 列表"之类的额外步骤，但**强度单位与开关方式**有几个必须知道的坑。

## 1. 四种光源一览

| 组件 | 强度属性（单位） | 方向 | 位置 | 本环境可视贡献（实测） |
| --- | --- | --- | --- | --- |
| `DirectionalLight` | `illuminance`（lux，照度） | 节点朝向（`-Z`） | 无（无穷远） | 有：球面明暗渐变 |
| `PointLight` | `luminance` / `range` | 全向 | 节点世界位置 | **无**（见 §4 已知限制） |
| `SpotLight` | `luminance` / `range` / `spotAngle` / `size` | 节点朝向锥形 | 节点世界位置 | **无**（见 §4 已知限制） |
| `SphereLight` | `luminousFlux`（lm，光通量）/ `range` / `size` | 全向（面积光） | 节点世界位置 | 有：地面光池 + 侧向补光 |

单位口径与仓库自带示例一致：`examples/light-two-directional` 用 `illuminance = 2`，
`examples/light-point` 用 `luminance = 40; range = 8`，`examples/light-spot` 用 `luminance = 120`。
`luminance` 的 setter 会按管线 `isHDR` 分流到 `luminanceHDR` / `luminanceLDR` 两个字段
（`src/cocos/render-scene/scene/point-light.ts:70`），直接读回 `luminance` 总是当前生效的那一个。

## 2. 基本用法

方向光只看节点朝向，与位置无关；点光/聚光/球面光只看节点世界位置：

```js
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2; // 方向光强度单位：lux

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 40; // 点光强度实测可用口径：luminance（仓库 light-point 例同）
point.range = 8;
```

聚光要额外给锥角与发光尺寸；球面光用光通量（流明）更符合"面积光"直觉：

```js
const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
spotNode.lookAt(new Vec3(0, 0.9, 0));
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 120; // 仓库 light-spot 例同口径
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40; // 锥角（度）

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900;
sphereLight.range = 8;
sphereLight.size = 0.6; // 面积光尺寸：柔化阴影边界
```

## 3. 开关与挂载：两个实测坑

**坑一：开关光源用 `node.active`，不要用 `component.enabled`。**
实测把光组件 `enabled` 从 false 切回 true 之后，光不再注册进渲染场景（画面保持灭）；
而 `node.active = false/true` 往返开关正常。示例因此按节点开关：

```ts
// 开关走 node.active 而非 component.enabled：实测后者 off→on 之后光不再注册进渲染场景
const entries: [string, Node, string][] = [
    ['DirectionalLight', dirNode, 'illuminance=2 (lux), 方向=节点朝向'],
    ['PointLight', pointNode, 'luminance=40, range=8, 全向'],
    ['SpotLight', spotNode, 'luminance=120, spotAngle=40°, range=12'],
    ['SphereLight', sphereNode, 'luminousFlux=900 (lm), size=0.6, range=8'],
];

const info = document.querySelector('#info') as HTMLElement;
function showLight (idx: number): void {
    entries.forEach((e, i) => { e[1].active = (i === idx); });
```

**坑二：方向光不跟随父节点旋转。**
`DirectionalLight.update()` 只在**自身节点**的 `hasChangedFlags` 置位时才重算方向
（`src/cocos/render-scene/scene/directional-light.ts:331`）。旋转它的父节点，光的方向不变。
示例里自转 rig 只用来带动可视锚点 cube 公转，四盏光一律直接挂 `scene`：

```js
// ---- 四种光源（同一时刻只 active 一个；直接挂 scene：实测挂旋转父节点下光不跟随） ----
```

点光/球面光的 `update()` 同样以自身节点 flags 门控位置同步（`point-light.ts:134`），
移动光源请直接改光源**自己**那个节点的 `position`，而不是移动父节点。

## 4. 本环境可视贡献实测（诚实记录，PARTIAL）

示例以 2.5s 为周期轮流点亮四盏光，覆盖层实时打印当前光型。分相截图（`.tmp-lights-0..3.png`，取证用临时脚本）显示：

- **DirectionalLight 相**：球面出现清晰的顶侧明暗渐变（`illuminance=2` 已足够）。
- **SphereLight 相**：光源一侧地面出现明显光池，球体同侧被补亮（`luminousFlux=900`）。
- **PointLight / SpotLight 相**：画面与"只有环境光"无异，球与地面均无该光的贡献。

为排除示例写法问题，另做了最小对照页（单球 + 单地面 + 单光源，无其它光）反复试探；
该对照页自身未能复现方向光照明（归因未定，见 [阴影一篇](shadows.md) 的同类记录），
因此**不作为** point/spot 的判据。point/spot 无可视贡献的判据仅取自上面完整示例的分相截图
（球体在该页正常渲染、directional/sphere 相均可见贡献，唯独 point/spot 相与环境光无异）。
结论：**在当前构建 + headless swiftshader 环境下，point/spot 的可见光照贡献不可复现**，
属环境/管线层限制而非 API 用法错误；本文与示例如实保留四型循环以演示 API，但不对
point/spot 的"画面变亮"作承诺。证据指针：`docs/evidence/examples/manual-lights.png`、
`docs/evidence/manual-examples-verified.json`（manual-lights 行）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-lights        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-lights/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-lights
```

示例目录：`docs/manual/examples/manual-lights/`。
最近一次验证（子集运行，partial）：`app-contract=PASS visible-frame=PASS no-runtime-error=PASS frame-diff=PASS`。
frame-diff 之所以能过：自转 rig 上的黄色锚点 cube 每帧公转，保证任意 400ms 间隔双帧不同。

## 附：示例源码（逐字）

`examples/manual-lights/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <title>Lights — 光源（docs/manual/lights.md）</title>
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
        #GameDiv { width: 100%; height: 100%; }
        #Cocos3dGameContainer { width: 100%; height: 100%; }
        #GameCanvas { width: 100%; display: block; height: 100%; }
        #info {
            position: absolute; left: 8px; top: 8px; z-index: 10;
            font: 12px/1.6 ui-monospace, Consolas, monospace; color: #e8eef7;
            background: rgba(10, 16, 26, .78); padding: 6px 10px; border-radius: 4px;
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

`examples/manual-lights/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Lights（光源）
 * 配套文章：docs/manual/lights.md
 *
 * 四种光源组件轮流点亮同一颗球：DirectionalLight → PointLight → SpotLight → SphereLight，
 * 每 2.5s 切一次（Component.enabled 开关），覆盖层实时显示当前光型与关键属性。
 * 光源挂在自转 rig 下， Orbit 运动让明暗过渡每帧可见。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    PointLight,
    SpotLight,
    SphereLight,
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

const scene = new Scene('lights');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.0, 7.0));
cameraNode.lookAt(new Vec3(0, 0.9, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 地面 + 中心球 ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 16, length: 16 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(80, 95, 90, 255));
groundRenderer.material = groundMaterial;

const ballNode = new Node('Ball');
ballNode.layer = Layers.Enum.DEFAULT;
ballNode.setPosition(new Vec3(0, 0.9, 0));
scene.addChild(ballNode);
const ballRenderer = ballNode.addComponent(MeshRenderer);
ballRenderer.mesh = utils.createMesh(primitives.sphere(0.9, { widthSegments: 48, heightSegments: 24 }));
const ballMaterial = new Material();
ballMaterial.initialize({ effectName: 'builtin-standard' });
ballMaterial.setProperty('mainColor', new Color(220, 215, 205, 255));
ballMaterial.setProperty('roughness', 0.4);
ballRenderer.material = ballMaterial;

// ---- 自转 rig：光源挂它下面公转 ----
const rig = new Node('LightRig');
scene.addChild(rig);
class Spinner extends Component {
    update (dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
rig.addComponent(Spinner);

// 可视锚点：方向光阶段没有位置可言，靠这颗小 cube 的公转让动画可见
const markerNode = new Node('OrbitMarker');
markerNode.layer = Layers.Enum.DEFAULT;
markerNode.setPosition(new Vec3(0, 0.35, 2.4));
rig.addChild(markerNode);
const markerRenderer = markerNode.addComponent(MeshRenderer);
markerRenderer.mesh = utils.createMesh(primitives.box({ width: 0.3, height: 0.3, length: 0.3 }));
const markerMaterial = new Material();
markerMaterial.initialize({ effectName: 'builtin-unlit' });
markerMaterial.setProperty('mainColor', new Color(250, 200, 80, 255));
markerRenderer.material = markerMaterial;

// ---- 四种光源（同一时刻只 active 一个；直接挂 scene：实测挂旋转父节点下光不跟随） ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2; // 方向光强度单位：lux

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 40; // 点光强度实测可用口径：luminance（仓库 light-point 例同）
point.range = 8;

const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
spotNode.lookAt(new Vec3(0, 0.9, 0));
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 120; // 仓库 light-spot 例同口径
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40; // 锥角（度）

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900;
sphereLight.range = 8;
sphereLight.size = 0.6; // 面积光尺寸：柔化阴影边界

// 开关走 node.active 而非 component.enabled：实测后者 off→on 之后光不再注册进渲染场景
const entries: [string, Node, string][] = [
    ['DirectionalLight', dirNode, 'illuminance=2 (lux), 方向=节点朝向'],
    ['PointLight', pointNode, 'luminance=40, range=8, 全向'],
    ['SpotLight', spotNode, 'luminance=120, spotAngle=40°, range=12'],
    ['SphereLight', sphereNode, 'luminousFlux=900 (lm), size=0.6, range=8'],
];

const info = document.querySelector('#info') as HTMLElement;
function showLight (idx: number): void {
    entries.forEach((e, i) => { e[1].active = (i === idx); });
    info.textContent = [
        'lights: cycling 4 types every 2.5s',
        `now: ${entries[idx][0]} — ${entries[idx][2]}`,
        'order: directional → point → spot → sphere',
        'rig orbits 40°/s; yellow marker shows the orbit',
    ].join('\n');
}

class Cycler extends Component {
    private _t: number;
    private _idx: number;

    constructor () {
        super();
        this._t = 0;
        this._idx = -1;
    }
    update (dt: number): void {
        this._t += dt;
        const idx = Math.floor(this._t / 2.5) % entries.length;
        if (idx !== this._idx) {
            this._idx = idx;
            showLight(idx);
        }
    }
}
rig.addComponent(Cycler);
showLight(0);

window.__airApp = app;
app.run(scene);

console.log('[manual/lights] running on cocosair');
```

---

上一篇：[纹理（Textures）](textures.md) ｜ 下一篇：[相机（Cameras）](cameras.md)
