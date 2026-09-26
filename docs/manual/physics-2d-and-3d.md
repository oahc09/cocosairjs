# Physics 2D and 3D 碰撞、层与后端

> **状态：FULL（能力）。** 官方 [physics-2d/physics-2d-system] 与 [physics/physics-example] 的
> AIR 落法：刚体类型、碰撞层（PhysicsGroup）与 Mask 过滤、四类接触/触发事件、两个 3D 后端差异。
> 总述与最小挂载见 [Physics](./physics.md)；本篇全部结论有四个可复跑示例背书
> （v11 链 53/53，含三引擎矩阵物理行）。

## 1. 后端差异（决定你该选哪条路）

|                    | 3D builtin（默认）               | 3D cannon（`createAirApp({ physics: 'cannon' })`） | 2D box2d（默认）                                                 |
| ------------------ | -------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| 动力学积分         | **无**（动态刚体不会被重力推动） | **有**（重力/下落/叠放）                           | **有**                                                           |
| 挂载/查询/事件回调 | 有                               | 有                                                 | 有                                                               |
| 触发器（sensor）   | 有（注意 setMask 契约，见 §4）   | 有                                                 | 有（`collider.sensor = true`）                                   |
| 确定性定步         | —                                | —                                                  | `autoSimulation = false` + 手工 `step()`（碰撞序列可逐字节复现） |
| 选中方式           | 默认                             | game.init 前确定性重注册选择器                     | 默认（`@cocos/box2d` 纯 JS 端口）                                |

选型口诀：只做查询/触发器/碰撞回调 → builtin；要真实下落堆叠 → cannon；2D 一律 box2d。
`PhysicsSystem.PHYSICS_NONE/BUILTIN/CANNON/BULLET` 常量可读回当前能力面
（[examples/physics-3d-collision/](../../examples/physics-3d-collision/) 启动段实拍）。

## 2. 四类接触/触发事件

**2D**（`Contact2DType` 枚举键，`examples/physics-2d-collision/main.js` 逐字节）：

```js
const EVENTS = [
  Contact2DType.BEGIN_CONTACT,
  Contact2DType.END_CONTACT,
  Contact2DType.PRE_SOLVE,
  Contact2DType.POST_SOLVE,
];
```

回调里可读 `contact.getWorldManifold()` / `getManifold()` / `getImpulse()`；sensor 的
BEGIN/END 照常派发而 PRE/POST_SOLVE 为空。该示例用 `autoSimulation = false` + 手工定步
把四类事件的触发步号钉死（490 步 9 阶段，逐字节可复现）。

**3D**（字符串事件名，`examples/physics-3d-basic/main.js` 逐字节）：

```js
sensorCollider.on("onTriggerEnter", onTrigger);
```

```js
crateCollider.on("onCollisionEnter", () => {
  triggerCounts.collision++;
});
```

事件族：`onTriggerEnter/Stay/Exit`、`onCollisionEnter/Stay/Exit`，回调参数携带
`event.contacts`（接触点/法线）。**3D cannon** 的真实模拟链路（重力下落、`enterTotal` 计数、
`raycast/raycastClosest` 命中与法线）见 [examples/physics-3d-collision/](../../examples/physics-3d-collision/)。

## 3. 碰撞层与 Mask 过滤

碰撞体挂 `PhysicsGroup`，过滤是**双向与运算**——只补一侧 mask 仍为 0，必须两侧都设
（`examples/physics-3d-basic/main.js` 逐字节）：

```js
crateCollider.setMask(ALL_MASK);
sensorCollider.setMask(ALL_MASK);
```

2D 同构：`collider.group` 挂组，`categoryBits`/`maskBits` 在**创建 fixture 时只读一次**
（后改 group 不影响已创建的 fixture——`examples/physics-2d-collision` 实测注释与读回）：

```js
collider.group = spec.group === undefined ? PhysicsGroup.DEFAULT : spec.group;
if (spec.sensor) {
  collider.sensor = true;
}
```

## 4. 实测坑位（来自四个示例的验证注释）

1. **builtin 触发事件默认不触发**：触发对被过滤拦下时 enter/stay/exit 全静默，
   需两侧 `setMask(0xffffffff)` 补救（physics-3d-basic §10 注释 + 读回）。
2. **`CapsuleCollider.height` 在 `onLoad` 之前设置不生效**：builtin 形状只在 `onLoad` 回读
   `radius` 与 `direction`（physics-3d-basic §11）。
3. **2D `BoxCollider2D` 尺寸默认 1×1**，不跟随 `UITransform`，必须显式赋 `size`；
   世界↔物理换算用 `PHYSICS_2D_PTM_RATIO`（32）（physics-2d-basic）。
4. **逐刚体 `gravityScale = 0`** 是"只挂载查询、不模拟"的开关（physics-2d-basic 前言）。
5. **确定性回归**：`PhysicsSystem2D.instance.autoSimulation = false` + 手工 `step()`，
   接触事件步号逐字节可复现（physics-2d-collision 的 490 步序列）。

## 5. 可运行样例与验证

| 示例                                                                   | 内容                                               | 验证                |
| ---------------------------------------------------------------------- | -------------------------------------------------- | ------------------- |
| [examples/physics-3d-basic/](../../examples/physics-3d-basic/)         | builtin 挂载/查询/触发边界，304 条 probeEquals     | v11 链 + 三引擎矩阵 |
| [examples/physics-3d-collision/](../../examples/physics-3d-collision/) | cannon 真实模拟（重力/叠放/计数/raycast）          | v11 链 + 三引擎矩阵 |
| [examples/physics-2d-basic/](../../examples/physics-2d-basic/)         | box2d 挂载/backend 读回/testPoint/testAABB/raycast | v11 链 + 三引擎矩阵 |
| [examples/physics-2d-collision/](../../examples/physics-2d-collision/) | 四类事件/sensor/门控/maskBits 过滤，手工定步       | v11 链 + 三引擎矩阵 |

运行：`npm run dev` 后访问 `http://127.0.0.1:7454/examples/<id>/`。
不能用"距离判定"冒充物理——游戏篇的近似判定是**设计选择**，真实刚体需求直接用本篇能力
（见 [Start making a Game](./game.md) §4）。

---

上一篇：[物理（Physics）](./physics.md) ｜ 下一篇：[音频、视频与 WebView](./audio-video-webview.md)
