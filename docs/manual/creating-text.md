# Creating Text 创建文字

> **状态：N/A（本篇不提供示例）。**
> Cocos AIR 的 code-first 导出面（368 个具名符号）**没有** 3D 文字几何、也没有 `Label` / `Font` 这类文本渲染组件：与文字相关的导出只有 `TextAsset`（纯文本资产容器，不负责渲染）和一组 UI 坐标换算工具（`WorldNode3DToLocalNodeUI` 等）。因此"加载字体→生成文字网格"这条路径在 AIR 里没有对应物，本篇如实标 N/A，不硬凑示例。

## 那在 AIR 里怎么显示文字？

三条可行的替代路，按推荐顺序：

1. **DOM 覆盖层（本手册全程在用）**：文字本来就该是 HTML。手册所有示例的 `#info` 覆盖层就是这条路 —— 零引擎成本、可选中、可无障碍读取。调试信息、HUD、说明文字首选它。
2. **Canvas 贴图（`canvas-textures`）**：把文字画到 2D canvas，做成 `Texture2D` 贴到一个平面上，得到"世界空间里的文字牌"。适合需要文字参与 3D 场景（跟随物体、受透视）的场合。见 [Canvas Textures 画布贴图](./canvas-textures.md)。
3. **HTML 元素对齐到 3D（`align-html-elements-to-3d`）**：每帧把 3D 坐标投影到屏幕坐标，移动一个绝对定位的 DOM 元素去"贴"住物体。文字保持 DOM 的清晰度与可交互性，又看起来挂在物体上。见 [Align HTML Elements to 3D 将 HTML 对齐到 3D](./align-html-elements-to-3d.md)。

## 为什么不硬做 3D 文字

强行用 `utils.createMesh` 手搓字形网格需要字体解析与三角化（typeface.json → 轮廓 → 三角），这属于字体库的职责而非引擎内置能力；AIR 选择不内置。若未来引入文本渲染组件，本篇会升级为 FULL 并补示例与验证记录（台账 `docs/evidence/manual-waves.md`）。

## 下一步

想在世界空间放文字牌：[Canvas Textures 画布贴图](./canvas-textures.md)。
想让 DOM 文字贴住 3D 物体：[Align HTML Elements to 3D 将 HTML 对齐到 3D](./align-html-elements-to-3d.md)。
