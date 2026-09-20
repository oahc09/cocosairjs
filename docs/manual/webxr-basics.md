# VR - Basics（VR 基础）

> 对应 three.js manual 的 *Basics VR* 一篇：`renderer.xr.enabled = true` 接管渲染
> 循环、WebXR session、头显坐标系。
> 状态：**N/A** —— Cocos AIR 导出面没有任何 XR 会话层，与
> [How to create VR content](how-to-create-vr-content.md) 篇同一实测结论；
> 该篇讲"总边界"，本篇起 WebXR 三件套逐场景给替代配方，均不配示例。

## 1. 实测边界：会话层零命中

- 全 build js grep `requestSession | XRWebGLLayer | XRRenderPass | xrMode`：**0 命中**。
  唯一的 `navigator.xr` 出现是 system-info 的能力探测标志（js 3827
  `const supportXR = typeof navigator.xr !== "undefined"`）——只是"浏览器行不行"的
  只读判断，引擎自己不开会话、不管参考空间、不接管循环。
- AIR 渲染循环（director + `app.run`）没有 XR 分支挂钩点：three.js 是
  `renderer.setAnimationLoop` 交给 `WebXRManager` 驱动，AIR 的循环入口没有等价交接面。
- 与 [README 能力边界](../../README.md) 及索引页"能力边界总说明"一致：V0.x 不含 XR。

## 2. 概念对照与桌面近似

| three.js VR 基础 | AIR 现状 | 近似替代（全桌面可跑） |
| --- | --- | --- |
| `renderer.xr.enabled = true` | 无 | ——（无会话即无接管） |
| 头显位姿驱动相机 | 无 XR 位姿源 | 鼠标拖拽改 `camera` 节点 yaw/pitch + [键盘平移](tips.md)：第一人称漫游的"桌面版"，见 [cameras](cameras.md) |
| XR 动画循环（`setAnimationLoop` 换轨） | 无换轨 | 常规 `update(dt)` 循环本身与帧源无关，未来接位姿不改游戏逻辑 |
| 参考空间/米制单位 | 无 | AIR 场景单位即"米"约定，桌面演示保持一致即可 |

**注视选择 / 指向选择**两个交互场景各有一篇：
[look-to-select](webxr-look-to-select.md)、[point-to-select](webxr-point-to-select.md)——
它们的**逻辑内核（射线 + 相交 + 计时/触发）AIR 全部具备**，缺的只是 XR 设备位姿这个
"射线源"。桌面端用鼠标/屏幕中心当射线源，配方照常成立（内核见
[picking](picking.md) 篇）。

## 3. 升级条件

与 [how-to-create-vr-content](how-to-create-vr-content.md) §升级条件 同签：
导出面出现 XR 会话入口 + 每帧 view/projection 供给 + headless 可 mock XR 设备。
三条齐备后本篇补 `manual-vr-basics` 示例并同步索引与台账。

---

上一篇：[Post-Processing 后处理（WebGPU）](webgpu-postprocessing.md) ｜ 下一篇：[VR - Look To Select 注视选择](webxr-look-to-select.md)
