# Fundamentals 基本概念

> Cocos AIR 的心智模型是**组件式**的 —— `App` 托管运行时，`Scene` 是节点树根，`Node` 只承载变换与层级，**一切行为与渲染都是挂在 Node 上的 `Component`**（相机、灯光、网格渲染器、你自己的脚本，全都是组件）。
> 本篇给一张四概念职责大表、一段"一帧是怎么出来的"，以及一个把运行时结构树打印出来的全景注释示例。

> 前置阅读：[Creating a Scene 创建场景](./creating-a-scene.md)

## 四概念职责大表

| 层     | Cocos AIR                                  | 职责边界                                                          |
| ------ | ------------------------------------------ | ----------------------------------------------------------------- |
| 运行时 | `App`（`createAirApp` 返回）               | 只管 `run(scene)` / `getScene()` / `canvas`；帧循环由引擎内部驱动 |
| 场景   | `Scene`                                    | 节点树根容器；一个 app 同一时刻跑一个 scene                       |
| 物体   | `Node`                                     | **只有**变换（位置/旋转/缩放）与父子层级；本身不渲染              |
| 渲染   | `MeshRenderer`（Component）                | `renderer.mesh` + `renderer.material`                             |
| 相机   | `Camera`（Component）                      | 挂在 Node 上；`visibility` 决定看哪些 layer                       |
| 灯光   | `DirectionalLight`（Component）            | 挂在 Node 上；朝向由 Node 旋转决定                                |
| 脚本   | `class X extends Component { update(dt) }` | 逐帧更新入口，`dt` 单位秒                                         |

关键心智：**AIR 里"物体 = Node，Mesh 只是它挂的一个渲染组件"**。同一个 Node 可以同时挂 `MeshRenderer` + 自定义脚本 + 碰撞体；同一个 Component 类型也可以挂到不同 Node 上复用。

## 1. 运行时结构树（示例实测）

示例在覆盖层打印运行时的 `App → Scene → Node → Component` 树，与代码一一对应：

```text
App → Scene → Node → Component
app.canvas: 640x480
fundamentals [no-component]
  Main Camera [Camera]
  Main Light [DirectionalLight]
  Ground [MeshRenderer]
  Spinning Cube [MeshRenderer+Rotator]
    Child Cube [MeshRenderer]
```

注意两点：`Scene` 自己 `no-component`（它只是容器）；`Spinning Cube` 同时挂了 `MeshRenderer`（渲染）和 `Rotator`（自定义脚本）—— 这就是"一个 Node 多组件"的最小示范。

## 2. 层级：父转子随

`Child Cube` 是 `Spinning Cube` 的子节点，局部坐标 `(0, 1.1, 0)`。父节点自转时，子节点**继承父变换**绕父公转 —— 截图里能看到青色小 cube 悬在橙色父 cube 上方并随之转动。层级用 `parent.addChild(child)` 建立，子节点的 `position` 是**相对父**的局部坐标。

```js
// ============ 层级：子 cube 挂在父 cube 下，继承父变换 ============
const childNode = new Node('Child Cube');
childNode.layer = Layers.Enum.DEFAULT;
childNode.setPosition(new Vec3(0, 1.1, 0)); // 相对父节点的局部坐标
cubeNode.addChild(childNode);
```

## 3. 逐帧更新：Component.update

AIR 没有"render loop 回调"给你注册；动画写在组件的 `update(dt)` 里，引擎每帧调用：

```ts
// 自定义 Component：逐帧更新是 AIR 的"动画"入口
class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
    }
}
cubeNode.addComponent(Rotator);
```

`this.node` 指向组件所挂的 Node。`dt` 是秒，用 `dt` 乘速度才能保证不同帧率下转速一致。

## 4. 一帧的旅程

一帧大致经过：`App` 的帧循环触发 → 各 `Component.update(dt)` 执行（你的脚本、动画）→ 相机按 `visibility` 做**剔除**（只收集可见 layer 且在视锥内的 Node）→ 每个 `MeshRenderer` 用其 `material` 查到/编译对应 pass → 提交 draw call 到 WebGL → 交换上屏。理解这条链，排障时就知道该往哪一层看：画面没有某物体 → 先查 `layer`/`visibility` 与视锥（剔除层），再查材质/pass（着色层），最后查几何（数据层）。

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-fundamentals/
```

示例工程：`docs/manual/examples/manual-fundamentals/`（index.html + main.ts，零外部资产）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-fundamentals`（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS，4.0s；父 cube 自转使双帧不同），截图 `docs/evidence/examples/manual-fundamentals.png` —— 应看到橙色父 cube + 悬在其上随转的青色子 cube + 地面。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Fundamentals — 基本概念（docs/manual/fundamentals.md）</title>
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

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Fundamentals（基本概念）
 * 配套文章：docs/manual/fundamentals.md
 *
 * 一个"全景注释版"的最小场景，把 AIR 的四个核心概念各占一段命名注释：
 *   App      —— createAirApp 返回的运行时入口（run / getScene / canvas）
 *   Scene    —— 节点树的根容器
 *   Node     —— 变换载体（位置/旋转/缩放 + 父子层级）
 *   Component—— 挂在 Node 上的行为/渲染单元（Camera / Light / MeshRenderer / 自定义）
 *
 * 额外放一个"子 cube"挂在旋转 cube 下，演示层级继承：父转子随。
 * 覆盖层打印运行时的 App→Scene→Node→Component 树，和代码一一对应。
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

// ============ App：运行时入口 ============
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

// ============ Scene：节点树根容器 ============
const scene = new Scene('fundamentals');

// ============ Node + Component：相机 ============
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.4, 2.6, 4.6));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 26, 38, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ============ Node + Component：平行光 ============
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ============ Node + Component：地面 ============
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

// ============ Node + Component：自转 cube（父） ============
const cubeNode = new Node('Spinning Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(230, 130, 50, 255));
cubeRenderer.material = cubeMaterial;

// 自定义 Component：逐帧更新是 AIR 的"动画"入口
class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
    }
}
cubeNode.addComponent(Rotator);

// ============ 层级：子 cube 挂在父 cube 下，继承父变换 ============
const childNode = new Node('Child Cube');
childNode.layer = Layers.Enum.DEFAULT;
childNode.setPosition(new Vec3(0, 1.1, 0)); // 相对父节点的局部坐标
cubeNode.addChild(childNode);
const childRenderer = childNode.addComponent(MeshRenderer);
childRenderer.mesh = utils.createMesh(primitives.box({ width: 0.4, height: 0.4, length: 0.4 }));
const childMaterial = new Material();
childMaterial.initialize({ effectName: 'builtin-standard' });
childMaterial.setProperty('mainColor', new Color(90, 200, 220, 255));
childRenderer.material = childMaterial;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：打印运行时结构树 ============
function describe(node: Node, depth: number): string {
    const comps = node.components.map((c) => c.constructor.name).join('+');
    let out = `${'  '.repeat(depth)}${node.name} [${comps || 'no-component'}]`;
    for (const child of node.children) {
        out += '\n' + describe(child, depth + 1);
    }
    return out;
}
(document.querySelector('#info') as HTMLElement).textContent = [
    'App → Scene → Node → Component',
    `app.canvas: ${app.canvas.width}x${app.canvas.height}`,
    describe(scene, 0),
].join('\n');

console.log('[manual/fundamentals] running on cocosair');
```

## API 参考

`createAirApp` / `App.run|getScene|canvas`、`Scene`、`Node`（`addChild` / `setPosition` / `setRotationFromEuler` / `lookAt` / `eulerAngles` / `children` / `components` / `layer`）、`Component`（`update(dt)` / `this.node`）、`Camera` / `DirectionalLight` / `MeshRenderer`（均为 Component 子类）。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Responsive Design 响应式设计](./responsive.md) —— 窗口缩放时 canvas 与画面如何保持铺满且不变形。
