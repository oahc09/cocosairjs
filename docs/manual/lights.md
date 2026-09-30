# 光源（Lights）

> 讲清"有哪些光、强度怎么设、为什么我的光不亮"。
> 配套可运行示例：[`examples/manual-lights/`](examples/manual-lights/)（四种光源轮流点亮同一颗球）。

Cocos AIR 暴露四种光源组件：`DirectionalLight`、`PointLight`、`SpotLight`、`SphereLight`。
它们都是普通 `Component`，挂到 `Node` 上、把节点加进场景即生效——不需要任何额外的注册步骤，但**强度单位与朝向/开关方式**有几个必须知道的坑。

## 1. 四种光源一览

| 组件               | 强度属性（单位）                               | 方向             | 位置         | 可视贡献（r53 实测）                   |
| ------------------ | ---------------------------------------------- | ---------------- | ------------ | -------------------------------------- |
| `DirectionalLight` | `illuminance`（lux，照度）                     | 节点朝向（`-Z`） | 无（无穷远） | 有：球面明暗渐变 + 地面整体提亮        |
| `PointLight`       | `luminance` / `range`                          | 全向             | 节点世界位置 | 有：近侧高光池 + 地面光池              |
| `SpotLight`        | `luminance` / `range` / `spotAngle` / `size`   | 节点朝向锥形     | 节点世界位置 | 有：地面锥形光池（注意坑三：朝向退化） |
| `SphereLight`      | `luminousFlux`（lm，光通量）/ `range` / `size` | 全向（面积光）   | 节点世界位置 | 有：侧向补光 + 地面光池                |

**单位纪律（为什么你的光不亮）**：管线 `pipelineSceneData.isHDR` 默认 **true**，相机曝光
`exposure = 1/38400`（`src/cocos/render-scene/scene/camera.ts:413`）——强度必须用 **HDR 量级**：
主光 `illuminance` ≈ 30000（室内强照明）～65000+（直射日光），点光/聚光 `luminance` ≈ 1700（组件
默认标定）～24000。LDR 直觉值（`illuminance=2`、`luminance=40/120`）× exposure ≈ 0，**视觉不可见**。
仓库早期的 `examples/light-point`（luminance=40）等示例即踩此陷阱：结构在位、画面无贡献。
`luminance` 的 setter 会按管线 `isHDR` 分流到 `luminanceHDR` / `luminanceLDR` 两个字段
（`src/cocos/render-scene/scene/point-light.ts:70`），直接读回 `luminance` 总是当前生效的那一个。

聚光/球面光的亮度还按发光面积缩放（shader 内 `illum = size²/max(size², d²)`，与上游 4.0 同式）——
同样距离下 `size` 越小越暗，spot 通常需要比 point 高一个量级的 `luminance`。

## 2. 基本用法

方向光只看节点朝向，与位置无关；点光/聚光/球面光只看节点世界位置：

```js
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 30000; // HDR 量级（≈室内强照明；直射日光 ≈65000+）

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 1700; // 组件默认标定即 HDR 量级；近侧球面出现高光池
point.range = 8;
```

聚光要额外给锥角与发光尺寸（**朝向见坑三**）；球面光用光通量（流明）更符合"面积光"直觉：

```js
const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
// 朝正下方用欧拉角，不要用 lookAt：视线 (0,-1,0) 与默认 up (0,1,0) 共线 → fromViewUp 万向锁退化，
// 旋转落回单位四元数、光锥水平射出打不到球（实测 internalSpot.dir=[0,0,-1]；r53 标定页复现）
spotNode.setRotationFromEuler(-90, 0, 0);
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 24000; // HDR 量级；spot 的 illum 按发光面积缩放（size²/d²），需要比 point 更高的 luminance
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40; // 锥角（度）

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900; // 光通量（lm）；球侧出现明亮补光
sphereLight.range = 8;
sphereLight.size = 0.6; // 面积光尺寸：柔化阴影边界
```

## 3. 开关、挂载与朝向：三个实测坑

**坑一：开关光源用 `node.active`，不要用 `component.enabled`。**
实测把光组件 `enabled` 从 false 切回 true 之后，光不再注册进渲染场景（画面保持灭）；
而 `node.active = false/true` 往返开关正常。示例因此按节点开关：

```ts
// 开关走 node.active 而非 component.enabled：实测后者 off→on 之后光不再注册进渲染场景
const entries: [string, Node, string][] = [
    ['DirectionalLight', dirNode, 'illuminance=30000 (HDR lux), 方向=节点朝向'],
    ['PointLight', pointNode, 'luminance=1700, range=8, 全向'],
    ['SpotLight', spotNode, 'luminance=24000, spotAngle=40°, range=12, 欧拉角朝下'],
    ['SphereLight', sphereNode, 'luminousFlux=900 (lm), size=0.6, range=8'],
];

const info = document.querySelector('#info') as HTMLElement;
function showLight(idx: number): void {
    entries.forEach((e, i) => {
        e[1].active = i === idx;
    });
    info.textContent = [
        'lights: cycling 4 types every 2.5s',
        `now: ${entries[idx][0]} — ${entries[idx][2]}`,
        'order: directional → point → spot → sphere',
        'rig orbits 40°/s; yellow marker shows the orbit',
    ].join('\n');
}
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

**坑三（r53 新增）：正上→正下的 `lookAt` 是万向锁退化，聚光会水平射出。**
`Node.lookAt(target)` 内部走 `Quat.fromViewUp(q, normalize(worldPos - target), up)`（`node.ts:2265`），
默认 `up = (0,1,0)`。当视线与 up 共线（灯在目标**正上方**），fromViewUp 退化——旋转落回单位
四元数，聚光锥保持默认 `-Z` **水平**射出，打不到下方的球。r53 标定页实测：`lookAt` 后
内部 `direction = [0,0,-1]`（应为 `[0,-1,0]`），全亮度档画面零贡献；改
`setRotationFromEuler(-90, 0, 0)` 后 `direction = [0,-1,0]`，光池立现。
垂直朝向的聚光一律用欧拉角（或给 `lookAt` 传显式 `up`）。

## 4. 可视贡献实测（r53，GAP-L1 修复后）

示例以 2.5s 为周期轮流点亮四盏光（HDR 量级，§1），覆盖层实时打印当前光型。
r53 标定页（`tools/debug/probes/lights-hdr-calibration/`，多点像素采样：球心/球侧/球下地面）逐型数据：

| 相位       | 采样点（基线→点亮）                            | 观察                                         |
| ---------- | ---------------------------------------------- | -------------------------------------------- |
| dir@30000  | 球心 57→173、地面 18→38                        | 顶侧明暗渐变 + 地面整体提亮                  |
| point@1700 | 球右侧 56→255（近侧饱和高光）、球下地面 18→213 | 侧向高光池 + 地面光池                        |
| spot@24000 | 锥下地面 18→49、球心 57→69                     | 地面锥形光池（垂直朝向需用坑三的欧拉角写法） |
| sphere@900 | 球左侧 56→203、地面 18→21                      | 侧向补光明确，地面光池较宽较柔               |

**历史记录（诚实口径）**：r53 之前本页曾记录"point/spot 无可视贡献（PARTIAL）"。复查定性为两个
独立根因，均已在 r53 处置：① 点/球光——AIR 内置 shader fixture 携带 3.8 代判别语义（`w>0` 一律走
spot 角衰减 + POINT 的 illum 恒 0），与 4.0 同源灯光队列写入的 `w=LightType` 失配 → att≡0；已对齐
上游 4.0 `shading-standard-additive.chunk` 语义修复（修复记录：`docs/evidence/g1-light-contribution-gap.json`）。
② 主光/强度数值——LDR 量级 × exposure 压灭（§1 单位纪律）+ 聚光 lookAt 退化（坑三），属用法陷阱非引擎缺陷。
旧观察中"SphereLight 相可见光池"与修复后数据一致（sphere 路径当时即部分生效）。
证据指针：`docs/evidence/examples/manual-lights.png`、`docs/evidence/manual-examples-verified.json`（manual-lights 行）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-lights        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-lights/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-lights
```

示例目录：`docs/manual/examples/manual-lights/`。
最近一次验证（r53 HDR 量级改版后子集运行，partial）：`app-contract=PASS visible-frame=PASS no-runtime-error=PASS frame-diff=PASS state-probe=PASS`。
frame-diff 之所以能过：自转 rig 上的黄色锚点 cube 每帧公转，保证任意 400ms 间隔双帧不同。

## 附：示例源码（逐字）

`examples/manual-lights/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Lights — 光源（docs/manual/lights.md）</title>
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

`examples/manual-lights/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Lights（光源）
 * 配套文章：docs/manual/lights.md
 *
 * 四种光源组件轮流点亮同一颗球：DirectionalLight → PointLight → SpotLight → SphereLight，
 * 每 2.5s 切一次（node.active 开关），覆盖层实时显示当前光型与关键属性。
 * 强度全部为 HDR 量级（isHDR 默认 true，见 lights.md §1 单位纪律；r53 GAP-L1 修复轮标定）。
 * 可视锚点 cube 在自转 rig 上公转，保证任意时刻画面持续变化（frame-diff 合同）。
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
    update(dt: number): void {
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
// 单位纪律（r53，GAP-L1 修复轮标定）：isHDR 默认 true（exposure=1/38400），强度必须用 HDR 量级
// （illuminance/luminance ≈ 千级到数万）；LDR 量级（2/40/120）× exposure ≈ 0 = 视觉不可见。
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 30000; // HDR 量级（≈室内强照明；直射日光 ≈65000+）

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 1700; // 组件默认标定即 HDR 量级；近侧球面出现高光池
point.range = 8;

const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
// 朝正下方用欧拉角，不要用 lookAt：视线 (0,-1,0) 与默认 up (0,1,0) 共线 → fromViewUp 万向锁退化，
// 旋转落回单位四元数、光锥水平射出打不到球（实测 internalSpot.dir=[0,0,-1]；r53 标定页复现）
spotNode.setRotationFromEuler(-90, 0, 0);
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 24000; // HDR 量级；spot 的 illum 按发光面积缩放（size²/d²），需要比 point 更高的 luminance
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40; // 锥角（度）

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900; // 光通量（lm）；球侧出现明亮补光
sphereLight.range = 8;
sphereLight.size = 0.6; // 面积光尺寸：柔化阴影边界

// 开关走 node.active 而非 component.enabled：实测后者 off→on 之后光不再注册进渲染场景
const entries: [string, Node, string][] = [
    ['DirectionalLight', dirNode, 'illuminance=30000 (HDR lux), 方向=节点朝向'],
    ['PointLight', pointNode, 'luminance=1700, range=8, 全向'],
    ['SpotLight', spotNode, 'luminance=24000, spotAngle=40°, range=12, 欧拉角朝下'],
    ['SphereLight', sphereNode, 'luminousFlux=900 (lm), size=0.6, range=8'],
];

const info = document.querySelector('#info') as HTMLElement;
function showLight(idx: number): void {
    entries.forEach((e, i) => {
        e[1].active = i === idx;
    });
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

    constructor() {
        super();
        this._t = 0;
        this._idx = -1;
    }
    update(dt: number): void {
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
