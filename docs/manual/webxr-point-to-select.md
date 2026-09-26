# VR - Point to Select（指向选择）

> 话题：XR 控制器模型 + 控制器射线 + `select` 事件，指哪打哪。
> 状态：**N/A**（XR 控制器层）+ **可近似**（射线拾取内核）——与
> [look-to-select](webxr-look-to-select.md) 同一分层：缺的是"射线源"，不缺"射线本身"。
> 不配示例；内核件在 [picking](picking.md) 示例里已全部真跑过。

## 1. 件清单：缺什么、有什么

| 所需构件                      | AIR            | 证据/去处                                                                                                                        |
| ----------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| XR 控制器会话                 | ✗ 无           | XR 层零命中（[basics](webxr-basics.md) §1）                                                                                      |
| 控制器模型加载（gltf + 骨骼） | 模型加载本身有 | `GLTFLoader` 全流程见 [load-gltf](load-gltf.md)——只是没有"XR 输入源"去驱动它                                                     |
| 控制器射线（pose → ray）      | ✓ 半边         | `screenPointToRay`（d.ts 21410）是"屏幕坐标→射线"；给定世界原点+方向的射线求交逻辑同款（[picking](picking.md) 应用层 slab 相交） |
| 控制器 `select` 事件          | ✓ 等价         | 鼠标 `MOUSE_DOWN`：全局 `input.on(SystemEventType.MOUSE_DOWN, …)`（tips-keyboard 同款 input 单例，键盘→鼠标同一族事件）          |
| 射线可视化                    | ✓              | 细长 cylinder/line 从"手"画到命中点（[drawing-lines](drawing-lines.md)、[primitives](primitives.md)）                            |

## 2. 桌面等价配方

"指向选择"在桌面上就是**鼠标拾取**——[picking](picking.md) 篇示例（点 cube 变亮 +
命中名回显）即本篇的无头显版：

1. `input.on(MOUSE_DOWN)` 拿屏幕坐标 → `camera.screenPointToRay` 出射线；
2. 应用层射线×AABB 求最近命中；
3. 反馈（变色/tween 缩放）。

将来接 XR 时改动的只有第 1 步的射线源：屏幕坐标+投影矩阵 → 控制器 pose 的
position + forward。第 2、3 步代码原样搬。

## 3. 升级条件

同 [webxr-basics](webxr-basics.md) §3。XR 控制器入口出现后补
`manual-vr-point-select` 示例（桌面鼠标回退 + 控制器增强），并同步索引与台账。

---

上一篇：[VR - Look To Select 注视选择](webxr-look-to-select.md) ｜ 下一篇：[Material Table 材质对照表](material-table.md)
