# Scenegraph 场景图

> Cocos AIR 的场景图心智模型是**组件化**的：**`Scene` 是树根，`Node` 只承载变换与层级，渲染/行为全靠挂 Component**。
> 本篇用三层结构（Scene → Rig → Arm → Tip）演示变换继承与 `active` 隐藏。

> 前置阅读：[Fundamentals 基本概念](./fundamentals.md)

## 1. 三层结构与局部坐标

示例的树：

```text
Scene 'scenegraph'
├── Main Camera [Camera]
├── Main Light [DirectionalLight]
├── Ground [MeshRenderer]
└── Rig [Spinner]            ← 旋转的父组
    ├── Arm-A [MeshRenderer]   local(-2,0,0)
    └── Arm-B [MeshRenderer]   local( 2,0,0)
        └── Tip [MeshRenderer] local(0,1.2,0)，active=false
```

建子节点时给的是**局部坐标**（相对父节点）：

```ts
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, z)); // 局部坐标：相对父节点
    parent.addChild(node);
```

覆盖层实测（t=0，Rig 尚未转过角度）：

```text
scenegraph: Scene → Rig → Arm-A / Arm-B → Tip
Rig spins 30°/s; arms+tip inherit the transform
Arm-A local(-2,0,0) world(-2.00,1.00,0.00)
Tip active=false activeInHierarchy=false (hidden)
```

`world()` 一行是 `node.worldPosition` 的读数：Rig 在 `(0,1,0)`，Arm-A 局部 `(-2,0,0)`，世界坐标即两者相加。Rig 一转起来，这个读数每帧都在变 —— 子节点**不需要任何代码**就跟着走。

## 2. 变换继承：父转子随

父组的旋转组件只有三行：

```ts
class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0);
    }
}
rig.addComponent(Spinner);
```

Rig 每帧绕世界 Y 转 30°/s，Arm-A / Arm-B / Tip 的世界位置随之公转，同时保留各自的局部偏移 —— 这就是场景图的全部意义：**把"相对关系"写死在树里，把"运动"写在父节点上**。缩放与旋转同样继承（非均匀缩放父节点会剪切子节点的法线光照，属通用 3D 常识，AIR 不额外处理）。

## 3. active 开关：隐藏子树

```js
// 隐藏孙节点：active=false 时自身与后代都不渲染、update 也不跑
tip.active = false;
```

两个标志的语义（覆盖层实测 `active=false activeInHierarchy=false`）：

| 标志                     | 含义                                                    |
| ------------------------ | ------------------------------------------------------- |
| `node.active`            | 本节点自己的开关（可读写）                              |
| `node.activeInHierarchy` | 综合判定：自己及**所有祖先**都 active 才为 true（只读） |

`active=false` 是"重隐藏"：不仅不渲染，挂在上面的 Component 的 `update` 也停止调度。想"只停渲染但逻辑照跑"在 AIR 里没有直接开关，常规做法是摘/挂 `MeshRenderer`（`renderer.enabled = false` 亦可，Component 级开关）。

## 4. 节点模型要点

| 关注点   | Cocos AIR                                                                                |
| -------- | ---------------------------------------------------------------------------------------- |
| 树节点   | `Node`（纯变换+层级）                                                                    |
| 渲染     | `MeshRenderer` Component 挂在 Node 上                                                    |
| 隐藏     | `active=false`（渲染+逻辑全停）                                                          |
| 裁剪参与 | `node.layer` vs `camera.visibility`（**必须显式设置**，见 [Cameras 相机](./cameras.md)） |
| 树根     | `Scene`（一个 app 同时跑一个）                                                           |

## 5. 跑示例与验证记录

示例工程：`docs/manual/examples/manual-scenegraph/`（index.html + main.ts，零外部资产）；dev server 地址 `http://127.0.0.1:7454/manual/examples/manual-scenegraph/`。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-scenegraph`（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS，3.6s；Rig 自转使双帧不同），截图 `docs/evidence/examples/manual-scenegraph.png` —— 应看到橙/青两个臂 cube 绕中心公转，**黄色 Tip 不出现**（active=false）。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Scenegraph — 场景图（docs/manual/scenegraph.md）</title>
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
 * Cocos AIR 开发手册 — Scenegraph（场景图）
 * 配套文章：docs/manual/scenegraph.md
 *
 * 三层结构：Scene → Rig（旋转的父组）→ Arm-A / Arm-B（子）→ Tip（孙）。
 * 父组旋转带动全部后代；Tip 用 active=false 演示隐藏（覆盖层打印 active 标志）。
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

const scene = new Scene('scenegraph');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 7.5));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 地面 ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 14, length: 14 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

function addCube(name: string, parent: Node, x: number, y: number, z: number, color: Color, size: number = 0.8): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, z)); // 局部坐标：相对父节点
    parent.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: size, height: size, length: size }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    renderer.material = material;
    return node;
}

// ---- 三层场景图：Rig 旋转 → 子臂继承 → 孙节点 Tip 隐藏 ----
const rig = new Node('Rig');
rig.layer = Layers.Enum.DEFAULT;
rig.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(rig);

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0);
    }
}
rig.addComponent(Spinner);

const armA = addCube('Arm-A', rig, -2, 0, 0, new Color(230, 120, 60, 255));
const armB = addCube('Arm-B', rig, 2, 0, 0, new Color(90, 200, 220, 255));
const tip = addCube('Tip', armB, 0, 1.2, 0, new Color(240, 210, 90, 255), 0.5);

// 隐藏孙节点：active=false 时自身与后代都不渲染、update 也不跑
tip.active = false;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：层级与 active 标志 ============
const wp = armA.worldPosition;
(document.querySelector('#info') as HTMLElement).textContent = [
    'scenegraph: Scene → Rig → Arm-A / Arm-B → Tip',
    'Rig spins 30°/s; arms+tip inherit the transform',
    `Arm-A local(-2,0,0) world(${wp.x.toFixed(2)},${wp.y.toFixed(2)},${wp.z.toFixed(2)})`,
    `Tip active=${tip.active} activeInHierarchy=${tip.activeInHierarchy} (hidden)`,
].join('\n');

console.log('[manual/scenegraph] running on cocosair');
```

## API 参考

`Node.addChild|setPosition|setRotationFromEuler|eulerAngles|worldPosition|children|active|activeInHierarchy|layer`、`Component.update(dt)`、`Scene`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Materials 材质](./materials.md) —— effect + uniforms，以及"绝不原地改共享 builtin 材质"。

## 局部/世界变换的可运行契约

Gallery 的 `node-hierarchy` 现含独立的 `examples/node-hierarchy/src/transform-contract.ts`，验证父节点旋转/缩放后的世界坐标、逆变换、世界空间赋值、getWorldMatrix/getWorldRS/getWorldRT 和销毁。完整覆盖与证据见 [API 场景缺口矩阵](../reference/api-scenario-gap-matrix.md)。
