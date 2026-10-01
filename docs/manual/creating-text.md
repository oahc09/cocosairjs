# Creating Text 创建文字

> **状态：PARTIAL。** AIR 的公开导出面**有** UI 文本组件 `Label`（2D/UI 导出面，`export * from '../cocos/ui'`）；
> **没有** 3D 文字几何（three.js `TextGeometry` 那类"字体解析 → 生成文字网格"的组件）。
> 本文按三条路线讲清楚"在 AIR 里怎么显示文字"，各路线对应的能力差异如实标注。

## 三条路线总览

| 路线             | 用什么                                | 状态                     | 适用                                             |
| ---------------- | ------------------------------------- | ------------------------ | ------------------------------------------------ |
| 屏幕 UI 文字     | `Label` 组件（挂在 Canvas 子节点上）  | **可用**（浏览器已验证） | HUD、计分、按钮文字、任何屏幕空间文本            |
| Canvas 纹理文字  | 2D canvas 画字 → `Texture2D` → 贴平面 | **可用**                 | 世界空间里"文字牌"（跟随物体、受透视）           |
| HTML 元素对齐 3D | 每帧投影 3D 坐标 → 移动 DOM 元素      | **可用**                 | 要 DOM 清晰度/可选中，又要贴住 3D 物体           |
| 3D 文字网格      | 字体解析 + 三角化生成 mesh            | **N/A**                  | AIR 不内置字体库职责；需要时用 Canvas 贴图路替代 |

## 路线一：屏幕 UI 文字（`Label`，推荐）

`Label` 是 2D/UI 系统组件：挂在 `Canvas` 层级下的节点上，直接设 `string` 即出字。
最小用法（与 `examples/ui-components` 逐字节一致）：

```js
function addLabel(node, text, fontSize, color) {
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.25);
  label.color = color || Color.WHITE;
  label.overflow = Label.Overflow.NONE;
  return label;
}
```

完整可运行样例（Canvas 组装、按钮文字随点击变化、文本回读断言）：
[examples/ui-components/](../../examples/ui-components/) —— `npm run dev` 后访问
`http://127.0.0.1:7454/examples/ui-components/`。Canvas 节点与 UI 层级初始化的完整路径
见 [2D/UI 快速上手](./2d-ui.md)（Cocos 4.0 工作流组）。

字体能力边界：AIR 无字体资产管线（Creator 的 `LabelAtlas`/富文本字体资源属编辑器工作流），
`Label` 使用系统字体渲染；描边/阴影由 `LabelOutline` / `LabelShadow` 组件提供（导出面在）。

### 溢出模式语义矩阵（W07 实测，2026-09-28）

验证器 `tools/verify/label-semantics.cjs`（几何断言读 `UITransform.getContentSize()`、
像素断言做墨迹统计；证据 `docs/evidence/w07-label-semantics.json`）。测试载荷：固定盒
300×40、fontSize 40、长句 "A rather long single-line sentence..."：

| overflow       | contentSize 结果 | 语义要点                                                                 |
| -------------- | ---------------- | ------------------------------------------------------------------------ |
| `NONE`         | 1072×63          | **不折行**（已确认语义）：宽度随文本增长（短句 38→长句 1072），高度=文本高   |
| `CLAMP`        | 300×40           | 盒恒定，文本被裁剪；不把 CLAMP 冒充原版单行截断/省略号（那是独立能力，未交付） |
| `SHRINK`       | 300×40           | 盒恒定；**实际渲染字号内化在 `_actualFontSize`（实测 40→16）**，`fontSize` 属性保持原值——断言渲染结果别读属性 |
| `RESIZE_HEIGHT`| 300×263          | 宽恒定、高度随折行增长；**折行为该模式固有——`enableWrapText=false` 仍折行**（实测 h=263） |

字影：`enableShadow/shadowColor/shadowBlur/shadowOffset` 实测生效（同帧差分 hash 变化、
墨迹 +468px），见证据 `shadow` 段。

## 路线二：Canvas 纹理文字（世界空间）

把文字画进 2D canvas，`new Texture2D(...)` 上传，贴到一个 `Plane`/`Box` 面上——文字成为场景
的一部分（受透视、可被遮挡）。逐步代码见 [Canvas Textures 画布贴图](./canvas-textures.md)。

## 路线三：HTML 对齐 3D（DOM 覆盖层）

每帧把 3D 坐标投影到屏幕坐标，移动一个绝对定位的 DOM 元素"贴"住物体：文字保持 DOM 的清晰度、
可选中与无障碍能力，本手册所有示例的 `#info` 覆盖层就是这条路。逐步代码见
[Align HTML Elements to 3D 将 HTML 对齐到 3D](./align-html-elements-to-3d.md)。

## 为什么 3D 文字网格是 N/A

强行用 `utils.createMesh` 手搓字形网格需要字体解析与三角化（字体文件 → 轮廓 → 三角化），
这属于字体库的职责而非引擎内置能力；AIR 选择不内置。需要世界空间文字时，路线二
（Canvas 贴图）是官方等价替代。若未来引入 3D 文字几何，本篇会升级状态并补示例与验证记录
（台账 `docs/evidence/manual-waves.md`）。

## 下一步

Label 原生 shadow 通过 `enableShadow`、`shadowBlur`、`shadowOffset` 和 `shadowColor` 配置。
在 `Overflow.NONE` 和 `RESIZE_HEIGHT` 下，影的扩边只影响渲染范围，不增加 UITransform 的逻辑布局尺寸；RichText 分段间距与折行因此保持稳定。
RichText 子 Label 在分段重建时需按业务样式重新应用 shadow；该修复没有新增 RichText 的全局 shadow 配置接口。

- 屏幕 HUD/按钮文字：[2D/UI 快速上手](./2d-ui.md)、[examples/ui-components/](../../examples/ui-components/)
- 世界空间文字牌：[Canvas Textures 画布贴图](./canvas-textures.md)
- DOM 文字贴住 3D 物体：[Align HTML Elements to 3D 将 HTML 对齐到 3D](./align-html-elements-to-3d.md)
