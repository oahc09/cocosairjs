# 物理（Physics）

> **状态：FULL（能力）**——AIR 公开导出面提供组件级 2D/3D 物理：`RigidBody` / `Collider` 族 /
> `PhysicsSystem`（3D）与 `RigidBody2D` / `Collider2D` 族 / `PhysicsSystem2D`（2D）均为顶层导出，
> 且各有真实模拟的浏览器验证示例。本篇是总述：能力地图、后端差异与最小挂载；碰撞事件/层/查询的
> 专题展开见 [Physics 2D and 3D 碰撞与后端](./physics-2d-and-3d.md)。

## 1. 能力地图

| 维度     | 3D 物理                                                                                                                                               | 2D 物理                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 系统单例 | `PhysicsSystem.instance`                                                                                                                              | `PhysicsSystem2D.instance`                                                    |
| 刚体     | `RigidBody`（`ERigidBodyType.STATIC/DYNAMIC/KINEMATIC`）                                                                                              | `RigidBody2D`（`ERigidBody2DType.Static/Dynamic/Kinematic`）                  |
| 碰撞体   | `BoxCollider` `SphereCollider` `CapsuleCollider` `CylinderCollider` `ConeCollider` `MeshCollider` `PlaneCollider` `TerrainCollider` `SimplexCollider` | `BoxCollider2D` `CircleCollider2D` `PolygonCollider2D`                        |
| 事件订阅 | `collider.on('onCollisionEnter' \| 'onTriggerEnter', cb)`（字符串事件名）                                                                             | `collider.on(Contact2DType.BEGIN_CONTACT, cb)`（枚举键）                      |
| 查询     | `PhysicsSystem.instance.raycast / raycastClosest` → `PhysicsRayResult`（法线字段是 `hitNormal`）                                                      | `PhysicsSystem2D.instance.testPoint / testAABB / raycast`（`ERaycast2DType`） |
| 过滤     | `PhysicsGroup` + `collider.setMask`                                                                                                                   | `PhysicsGroup` + `maskBits`                                                   |
| 默认后端 | **builtin**（默认）/ cannon（可切）                                                                                                                   | **box2d**（`@cocos/box2d` 纯 JS 端口）                                        |
| 后端切换 | `createAirApp({ physics: 'builtin' \| 'cannon' })`                                                                                                    | 默认集即 box2d；builtin-2d 等其他后端走 feature-variant 构建                  |

两个默认后端的能力差异必须分清：

- **3D builtin**：提供静态场景上的挂载/查询/触发器/碰撞**回调**，但**不做动力学积分**
  （动态刚体不会被重力推动）。要真实下落/堆叠用 `physics: 'cannon'`。
- **3D cannon**：真实动力学模拟（重力、下落、叠放、raycast 命中），在 `game.init` 前
  确定性重注册选择器。
- **2D box2d**：真实模拟（重力、接触、sensor、过滤）。逐刚体 `gravityScale = 0` 可做
  "只挂载查询、不模拟"的静态用法；`PhysicsSystem2D.instance.autoSimulation = false` +
  手工 `step()` 可做确定性定步（碰撞序列回归的做法）。

## 2. 最小挂载（3D，真实模拟）

以下片段与 `examples/physics-3d-collision/main.js` 逐字节一致（cannon 后端，地面静态盒 + 动态球）：

```js
const app = await createAirApp({ canvas: "#GameCanvas", physics: "cannon" });
```

```js
const groundBody = groundNode.addComponent(RigidBody);
groundBody.type = ERigidBodyType.STATIC;
const groundCollider = groundNode.addComponent(BoxCollider);
groundCollider.size = new Vec3(12, 1, 12);
groundCollider.on("onCollisionEnter", onEnter);
```

```js
const ballA = ballANode.addComponent(RigidBody);
ballA.type = ERigidBodyType.DYNAMIC;
const ballACollider = ballANode.addComponent(SphereCollider);
ballACollider.radius = 0.5;
```

运行：`npm run dev` 后访问 `http://127.0.0.1:7454/examples/physics-3d-collision/`——
球 A 落到 y≈0.5 静置、球 B 从更高处落下叠到 y≈1.5，两次 `onCollisionEnter` 计数为 2。

## 3. 最小挂载（2D，box2d）

以下片段与 `examples/physics-2d-basic/main.js` 逐字节一致：

```js
const physics = PhysicsSystem2D.instance;
```

```js
const groundBody = ground.addComponent(RigidBody2D);
groundBody.type = ERigidBody2DType.Static;
const groundCollider = ground.addComponent(BoxCollider2D);
groundCollider.density = 1.0;
groundCollider.size = new Size(360, 20); // 上游默认 1×1，不跟随 UITransform
```

注意坑位：`BoxCollider2D` 的尺寸默认 **1×1**，不跟随 `UITransform`，必须显式赋 `size`；
世界↔物理坐标换算用 `PHYSICS_2D_PTM_RATIO`（32）。

运行：`http://127.0.0.1:7454/examples/physics-2d-basic/`（backend/ptmRatio/重力读回与
testPoint/testAABB/raycast 查询）；碰撞事件与过滤见
`http://127.0.0.1:7454/examples/physics-2d-collision/`。

## 4. 版本说明（历史 N/A 的由来）

本篇在 V0.1 期曾标 N/A——当时的导出面确实没有组件级物理（Wave 0 冒烟核对的是
`IPhysicsEngineId` 一类选择器包装类型）。V1.2 起物理模块并入默认聚合导出并补齐双后端
（3D builtin+cannon、2D box2d），上述"替代路"（手工积分、外接 WASM 物理库）不再需要，
仅作为背景保留在版本记录里。

## 5. 下一步

- 碰撞/触发四类事件、PhysicsGroup 层与 Mask 过滤、手工定步：[Physics 2D and 3D](./physics-2d-and-3d.md)
- 可运行样例：[examples/physics-3d-basic/](../../examples/physics-3d-basic/)（builtin 边界与查询契约）、
  [examples/physics-3d-collision/](../../examples/physics-3d-collision/)（cannon 真实模拟）、
  [examples/physics-2d-basic/](../../examples/physics-2d-basic/)、
  [examples/physics-2d-collision/](../../examples/physics-2d-collision/)

---

上一篇：[自定义几何（Custom BufferGeometry）](custom-buffergeometry.md) ｜ 下一篇：[动画系统（Animation System）](animation-system.md)
