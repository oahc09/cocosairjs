# 物理（Physics）

> 3D 场景物理（刚体、碰撞），通行做法是外挂 cannon/rapier/ammo 这类物理库。
> **状态：N/A（本篇不提供示例）。**

## 1. 结论先行

Cocos AIR 的 code-first 导出面**没有组件级物理**：`RigidBody`、`Collider` / `BoxCollider`、
`PhysicsSystem` 这些类只存在于引擎内部命名空间（d.ts 35345 / 35829 / 36605），
**不在** `cocosair` 模块的顶层导出里。Wave 0 能力冒烟已核对导出面（台账
`docs/evidence/manual-spike.md` §物理）：与物理相关的导出只有选择器/包装类型
（`IPhysicsEngineId`、`IPhysicsWrapperObject` 之属），用于"注册/切换物理后端"，
没有任何可 `addComponent` 的刚体或碰撞体。

因此"外挂一个 cannon/rapier 世界 → 给 mesh 挂 body → step()"这类常见集成路径，
在 AIR 引擎原生能力面里没有对应封装；本篇如实标 N/A，不硬凑示例。

## 2. 需要"碰撞/运动"时的三条替代路

1. **手工积分（本手册默认路）**：在 `Component.update(dt)` 里自己改 `position` / 速度 / 重力累加。
   [更新事务一篇](how-to-update-things.md) 会给 dt 节流与固定步长的写法；对弹幕、抛体、
   简单 AABB 互斥这类需求，手工积分比引入物理后端更可控。
2. **射线/拾取代替碰撞查询**：`geometry.rayAABB` / 相机屏幕→射线 的数学工具在导出面里存在，
   拾取类交互见 [Picking 一篇](picking.md)（Wave 4）。
3. **外接 WASM 物理库**：rapier/cannon-es 是纯 npm 包，不依赖引擎类型；把它们的 body 变换
   每帧写回 `node.position / rotation` 即可与 AIR 共存。这条路可行但属应用层集成，
   超出本手册"引擎原生能力"的边界，故不展开。

## 3. 何时升级本篇

若未来 AIR 把 `RigidBody` / `Collider` 提进顶层导出（或提供 `physicsSystem` 单例），
本篇升级为 FULL：补"落体 + 地面碰撞"最小示例、进验证器 `ANIMATED` 集合、
同步 `docs/manual/index.md` 状态列与 `docs/evidence/manual-waves.md` 台账。

---

上一篇：[自定义几何（Custom BufferGeometry）](custom-buffergeometry.md) ｜ 下一篇：[动画系统（Animation System）](animation-system.md)
