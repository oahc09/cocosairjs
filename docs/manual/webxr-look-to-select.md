# VR - Look To Select（注视选择）

> 话题：把头显朝向当作射线，准星（reticle）注视目标驻留计时后触发选择。
> 状态：**N/A**（XR 设备层）+ **可近似**（选择逻辑内核）——会话层边界见
> [webxr-basics](webxr-basics.md)，本篇给"没有头显也能练内核"的桌面配方，不配示例
> （内核交互件在 [picking](picking.md) 篇示例已全部演示过）。

## 1. 拆开看：这套交互里 AIR 缺什么、有什么

| 所需构件                     | AIR      | 证据/去处                                                                                                            |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| XR 会话 + 头显位姿（射线源） | ✗ 无     | build js `requestSession/XRWebGLLayer` 0 命中（basics 篇 §1）                                                        |
| 相机前向射线                 | ✓ 有     | `camera.screenPointToRay(sx, sy, outRay)`（d.ts 21410）——取屏幕中心即"注视射线"                                      |
| 射线×物体相交                | ✓ 应用层 | 无引擎级相交 API，手写射线×AABB slab 相交（[picking](picking.md) §实测）                                             |
| 准星 reticle                 | ✓ 等价   | 一个小平面/球钉在世界锚点：`camera` 子节点前置偏移，或屏幕中心 DOM div（[align-html](align-html-elements-to-3d.md)） |
| 驻留计时（dwell timer）      | ✓ 纯 JS  | `update(dt)` 里：命中同一目标则 `t += dt`，超阈值触发；换目标清零                                                    |
| 选中反馈                     | ✓        | 材质属性改色/发光 tween（[materials](materials.md)、[animation-system](animation-system.md)）                        |

## 2. 桌面等价配方（伪码级，全件可跑）

```js
// 注视射线 = 过屏幕中心的射线；没有头显，鼠标/窗口中心就是"头"
const CENTER = new Vec3(window.innerWidth / 2, window.innerHeight / 2, 0);
// update(dt) 内：
camera.screenPointToRay(CENTER.x, CENTER.y, ray); // ① 射线源
const hit = nearestHitByAABB(ray, targets); // ② 应用层求交（picking 篇同款）
if (hit && hit.node === this.hovered)
  this.dwell += dt; // ③ 驻留计时
else {
  this.hovered = hit ? hit.node : null;
  this.dwell = 0;
}
if (this.dwell > 1.5) {
  select(this.hovered);
  this.dwell = 0;
} // ④ 触发
```

四步里只有 ① 的"射线源"在真 VR 下要换成头显位姿——那正是 N/A 的部分；②③④ 一旦
在桌面版打磨好，将来接 XR 是换输入源不是重写逻辑。

## 3. 升级条件

同 [webxr-basics](webxr-basics.md) §3（三件套 XR 系列共用一签）。XR 入口出现后：
本篇补 `manual-vr-look-select` 示例（桌面回退 + XR 增强双路径），索引状态改 P→F。

---

上一篇：[VR - Basics VR 基础](webxr-basics.md) ｜ 下一篇：[VR - Point To Select 指向选择](webxr-point-to-select.md)
