# Creating a Scene 创建场景

> Cocos AIR 的最小场景骨架是 **Cocos 组件式**组织：渲染器不是你能拿在手里的对象，而是由 `createAirApp` 创建并托管的 `app`；几何与材质不直接是"物体"，而是挂在节点上的 `MeshRenderer` 组件的两个属性。
> 本篇把最小可运行场景（一个旋转的立方体）从零搭出来，后续每一篇都在这个骨架上做增量。

> 前置阅读：[Installation 安装与引入](./installation.md)

## 核心对象速查

| Cocos AIR                                                                 | 说明                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `await createAirApp({ canvas })`                                          | AIR 的 app 只暴露 `run` / `getScene` 两个方法，渲染循环由 app 托管 |
| `new Scene('name')`                                                       | 名字用于调试与场景切换                                             |
| `scene.addChild(node)`                                                    | **没有 `appendChild`**                                             |
| `node.addComponent(Camera)` + 逐个赋值 `projection/fov/near/far`          | 相机是组件，宽高比由引擎按画布自动处理，不用手工维护               |
| `node.addComponent(DirectionalLight)` + `light.illuminance`               | 亮度主控是标量 `illuminance`                                       |
| `node.addComponent(MeshRenderer)` + `renderer.mesh` / `renderer.material` | 几何来自 `utils.createMesh(primitives.box(...))`                   |
| `class X extends Component { update (dt) {} }`                            | 逐帧更新挂在节点的组件上，`dt` 单位为秒                            |

## 1. HTML 骨架：canvas 必须在引擎之前

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Creating a Scene — 创建场景（docs/manual/creating-a-scene.md）</title>
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
                height: 100%;
                display: block;
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
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

两点必须照做，否则会得到一个"没有任何报错的黑屏"：

1. `#GameCanvas` 要在任何 `import 'cocosair'` 执行之前就存在于 DOM —— 引擎的 screen-adapter 是模块顶层单例，import 的那一刻就会去找画布。
2. `importmap` 把裸说明符 `cocosair` 指到构建产物 `/build/cocosair.module.js`；`npm run build` 产出它，`npm run dev` 的静态服务把它挂在 `/build/*` 上。

## 2. 创建 app 与场景

```ts
const app = await createAirApp({ canvas });

const scene = new Scene('creating-a-scene');
```

`createAirApp` 是异步的（内部要等渲染后端与内置资源就绪），所以手册示例的 `main.ts` 都是**顶层 await 的 ES module**。
返回的 `app` 只有三件事可做：`app.run(scene)`、`app.getScene()`、读 `app.canvas`。没有 `pause` / `destroy` / `resize` —— 尺寸变化走 [Responsive Design](./responsive.md) 里的 `cc.screen` 事件。

## 3. 相机

```js
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; // 4.0-alpha 默认 undefined，不设置就什么都不画
camera.priority = 0;
```

三个容易踩的点：

- **`visibility` 必须显式设置。** 引擎 4.0-alpha 的默认值是 `undefined`，与任何节点 layer 都不匹配，结果是场景里有物体、有光、有相机，画面却只有清屏色。
- `lookAt` 要传 `Vec3`，且它作用在**节点**上（改的是节点朝向），不是相机组件的方法。
- `clearFlags` + `clearColor` 决定每帧清屏行为。想透明背景见 [Tips：Make the Canvas Transparent](./tips.md#make-the-canvas-transparent-让画布透明)。

## 4. 光源

```js
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;
```

平行光的方向由**节点朝向**决定（`setRotationFromEuler(x, y, z)`，单位度），位置对方向光没有视觉影响但保留它便于后续换成点光/聚光。
`illuminance` 是照度标量；不挂光源时 `builtin-standard` 材质只剩环境项，物体会是一片死板的灰。光源类型的全貌见 [Lights](./lights.md)。

## 5. 网格与材质

```js
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');
```

- `primitives.box(...)` 返回的是几何描述对象，必须经 `utils.createMesh(...)` 才成为可渲染的 `Mesh` 资产。可用图元清单见 [Primitives](./primitives.md)。
- `builtinResMgr.get('builtin-standard-material')` 返回的是**全局共享材质实例**。就地改它的属性会污染场景里所有 renderer —— 要改颜色/透明度请自建材质，见 [Materials](./materials.md) 与 [How to Draw Transparent Objects](./transparency.md)。
- `cubeNode.layer` 要落在相机 `visibility` 的掩码内，否则同样不画。

## 6. 逐帧更新与启动

```ts
// 每帧让 cube 自转：自定义组件的 update(dt) 是 AIR 的"逐帧更新"入口
class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
    }
}
```

```js
cubeNode.addComponent(Rotator);

window.__airApp = app; // 每个手册示例末尾固定，供控制台探查与验证器使用
app.run(scene);

console.log('[manual/creating-a-scene] running on cocosair');
```

`update(dt)` 里的 `dt` 是秒（不是毫秒），所以 `dt * 45` 表示每秒转 45 度。
`window.__airApp = app` 不是引擎要求，而是本手册所有示例的统一约定：让你在浏览器控制台里能直接 `__airApp.getScene()` 探查场景，也让验证器能确认页面确实跑起来了。

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Creating a Scene（创建场景）
 * 配套文章：docs/manual/creating-a-scene.md
 *
 * 手册示例最小三件套：App（createAirApp）→ Scene → Camera + Light + Mesh。
 */

import {
    Layers,
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Component,
    builtinResMgr,
    utils,
    primitives,
    Vec3,
    Color,
} from 'cocosair';

// 每帧让 cube 自转：自定义组件的 update(dt) 是 AIR 的"逐帧更新"入口
class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
    }
}

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('creating-a-scene');

// ---- 1. 相机：看到场景的窗口 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; // 4.0-alpha 默认 undefined，不设置就什么都不画
camera.priority = 0;

// ---- 2. 光源：让 standard 材质有明暗 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 3. 网格：几何 + 材质挂到 MeshRenderer ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');
cubeNode.addComponent(Rotator);

window.__airApp = app; // 每个手册示例末尾固定，供控制台探查与验证器使用
app.run(scene);

console.log('[manual/creating-a-scene] running on cocosair');
```

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-creating-a-scene/
```

示例工程：`docs/manual/examples/manual-creating-a-scene/`（index.html + main.ts，零外部资产）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-creating-a-scene`（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 四项 PASS），截图 `docs/evidence/examples/manual-creating-a-scene.png`。

## 常见空画面排查

| 现象                 | 原因                               | 修法                                         |
| -------------------- | ---------------------------------- | -------------------------------------------- |
| 只有清屏色，无物体   | 相机 `visibility` 未设             | `camera.visibility = Layers.Enum.DEFAULT`    |
| 只有清屏色，无物体   | 节点 `layer` 与相机掩码不交        | `node.layer = Layers.Enum.DEFAULT`           |
| 物体全黑             | 场景里没有光源                     | 加 `DirectionalLight` 并设 `illuminance`     |
| 物体是全平的单色     | 材质是 unlit 或没有光照通道        | 用 `builtin-standard-material`               |
| 控制台报画布相关错误 | import 时 `#GameCanvas` 还不在 DOM | 把 canvas 放到 `<script type="module">` 之前 |

## API 参考

API 以 `build/cocosair.module.d.ts` 为准；本篇涉及：`createAirApp`、`Scene`、`Node`（`addChild` / `setPosition` / `lookAt` / `setRotationFromEuler` / `layer`）、`Camera`、`DirectionalLight`、`MeshRenderer`、`Component`、`utils.createMesh`、`primitives.box`、`builtinResMgr.get`、`Layers.Enum`、`Vec3`、`Color`。

## 下一步

下一篇：[Creating Text 创建文字](./creating-text.md)（UI `Label` 可用、3D 文字几何无，按路线说明）；想直接看渲染能力，跳到 [Drawing Lines 绘制线条](./drawing-lines.md)。
组件从 `onLoad` 到 `onDestroy` 的完整回调序列与启停/销毁语义：[Component Lifecycle 组件生命周期](./component-lifecycle.md)。
