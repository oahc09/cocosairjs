# 创建 VR 内容（How to create VR content）

> WebXR 会话、头显渲染循环如何接入。
> **状态：N/A（本篇不提供示例）。**

## 1. 结论先行

Cocos AIR 的导出面**没有 WebXR 会话层**：全 d.ts grep `XRSession|WebXR|webxr|hasXRSupport|XRAnchor`
**零命中**；顶层导出里与头显相关的只有两个**事件载荷类型** `EventHMD` / `EventHandheld`
（module.js 导出表实测在列），即"假如底层派发了 HMD 事件，载荷长这样"的数据结构，
**没有** `navigator.xr.requestSession` 的封装、没有 XR 渲染循环、没有控制器 ray 输入组件。
这与 [README §Air V0.1 能力边界](../../README.md) 的"不包含 XR"一致（索引页 [能力边界总说明](index.md) 同）。

## 2. 现状能做什么（近似替代）

- **桌面端"伪 VR"预览**：用 Orbit 式相机组件（每帧 `lookAt`，见 [相机](cameras.md) §2）做鼠标环绕检视，
  这是当前手册体系里最接近"走进场景看"的交互。
- **双目渲染手工搭**：理论上可用双 `Camera` + `viewport` 拼左右眼（[相机](cameras.md) §3 多相机指针），
  但**没有头显姿态输入**驱动它——本篇不做该示例，避免"能搭壳不能戴盔"的能力伪装。
- **事件类型预留**：`EventHMD` 在导出面里存在，说明引擎内部留有 HMD 输入管道的位置；
  用户代码当前无法据此构建 VR 交互（无会话来源）。

## 3. 升级条件（何时把本篇升 FULL）

1. 导出面出现 XR 会话入口（`requestSession` 封装或 `xr` 命名空间）与每帧 view/projection 矩阵供给；
2. 控制器/手柄输入组件或 `EventHMD` 的实际派发源接通；
3. 验证器可在 headless 环境 mock XR 设备（否则示例只能退化为桌面回退路径）。
   三条齐备后：补 `manual-vr-basics` 示例（桌面回退 + XR 增强双路径）、同步索引状态列与台账。

## 4. 能力边界备忘

- XR 会话接管渲染循环这条路 AIR 没有现成面：其渲染循环（director + `app.run`）**没有 XR 分支挂钩点**（grep 零命中为证）。
- 手柄控制器模型的自动装配 AIR 没有现成面；模型加载通道本身是通的（[加载 3D 模型](loading-3d-models.md)），缺的只是控制器姿态源。

---

上一篇：[颜色管理（Color Management）](color-management.md) ｜ 下一篇：[销毁对象（How to dispose of Objects）](how-to-dispose-of-objects.md)
