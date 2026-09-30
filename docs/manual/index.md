# Cocos AIR 开发手册

> 本手册面向 **Cocos AIR**（Code First Web 3D 运行时）：分组、顺序与篇目共 10 组 64 条目，
> 内容全部映射到 AIR 的真实 API（Cocos 组件式 Code First）。
> 正文中文，篇目标题保留英文原名以便检索。

**条目账**：64 条目 → 60 篇骨架文档（Tips 组 5 个锚点条目并入 [tips.md](./tips.md)）+ 索引；
另有 **10 篇 Cocos 4.0 开发工作流专题**（见下方工作流组）与 1 份
[覆盖矩阵台账](./cocos4-coverage-matrix.md)——合计磁盘 72 个 .md（71 篇文章 + 索引），
由 `node tools/verify/manual-doc-consistency.cjs --strict` 核实。
**状态图例**：`FULL` 能力完整可写 ｜ `PARTIAL` 部分能力，如实标注差距 ｜ `N/A` 当前不包含（诚实说明 + 近似替代）｜ `META` 元信息页（无示例）。
**示例**：有 `▶` 标记的篇目配专属可运行示例，位于 `docs/manual/examples/manual-<slug>/`，
`npm run dev` 后访问 `http://127.0.0.1:7454/manual/examples/manual-<slug>/`。

---

## Cocos 4.0 开发工作流（对照官方指南补缺）

> 官方 Cocos Creator 4.0 指南中 AIR 开发者最常用主题的 Code First 教程；
> 逐主题「官方锚点 → AIR 三层证据 → 行动」对照见 [Cocos 4.0 覆盖矩阵](./cocos4-coverage-matrix.md)。

| 篇目                                                                             | 状态    | 示例                           |
| -------------------------------------------------------------------------------- | ------- | ------------------------------ |
| [脚本组件开发流程](./script-component-workflow.md)                               | FULL    | –                              |
| [自定义 Shader 开发](./custom-shaders.md)                                        | FULL    | –                              |
| [Component Lifecycle 组件生命周期](./component-lifecycle.md)                     | FULL    | ▶ `manual-component-lifecycle` |
| [Input and Events 输入与事件](./input-and-events.md)                             | FULL    | ▶ `manual-input-events`        |
| [Asset Loading and Lifetime 资源加载与生命周期](./asset-loading-and-lifetime.md) | FULL    | ▶ `manual-asset-lifecycle`     |
| [2D/UI 快速上手](./2d-ui.md)                                                     | FULL    | –                              |
| [UI Layout and Interaction 布局与交互](./ui-layout-and-interaction.md)           | FULL    | –                              |
| [Physics 2D and 3D 碰撞、层与后端](./physics-2d-and-3d.md)                       | FULL    | –                              |
| [音频、视频与 WebView](./audio-video-webview.md)                                 | FULL    | –                              |
| [2D 资产与效果](./2d-assets-and-effects.md)                                      | PARTIAL | –                              |

## Getting Started（入门）

| 篇目                                                                         | 状态    | 示例                        |
| ---------------------------------------------------------------------------- | ------- | --------------------------- |
| [Installation 安装与引入](./installation.md)                                 | FULL    | ▶ `manual-installation`     |
| [Creating a Scene 创建场景](./creating-a-scene.md)                           | FULL    | ▶ `manual-creating-a-scene` |
| [Creating Text 创建文字](./creating-text.md)                                 | PARTIAL | –                           |
| [Drawing Lines 绘制线条](./drawing-lines.md)                                 | PARTIAL | ▶ `manual-drawing-lines`    |
| [FAQ 常见问题](./faq.md)                                                     | META    | –                           |
| [Libraries and Plugins 库与插件](./libraries-and-plugins.md)                 | META    | –                           |
| [Loading 3D Models 加载 3D 模型](./loading-3d-models.md)                     | FULL    | ▶ `manual-loading-models`   |
| [Uniform Types Uniform 类型](./uniform-types.md)                             | PARTIAL | ▶ `manual-uniform-types`    |
| [Useful Links 有用链接](./useful-links.md)                                   | META    | –                           |
| [WebGL Compatibility Check WebGL 兼容性检查](./webgl-compatibility-check.md) | FULL    | ▶ `manual-webgl-compat`     |
| [Capturing Screenshots 页面截图采集](./capturing-screenshots.md)             | FULL    | – （W03 矩阵实测，验证器 `tools/verify/capture.cjs`） |

## Next Steps（进阶）

| 篇目                                                                   | 状态    | 示例                              |
| ---------------------------------------------------------------------- | ------- | --------------------------------- |
| [Animation System 动画系统](./animation-system.md)                     | FULL    | ▶ `manual-animation-system`       |
| [Color Management 颜色管理](./color-management.md)                     | PARTIAL | ▶ `manual-color-management`       |
| [How to create VR content 创建 VR 内容](./how-to-create-vr-content.md) | N/A     | –                                 |
| [How to dispose of Objects 销毁对象](./how-to-dispose-of-objects.md)   | FULL    | ▶ `manual-dispose-objects`        |
| [How to update Things 每帧更新](./how-to-update-things.md)             | FULL    | ▶ `manual-update-things`          |
| [How to use Post Processing 后处理](./how-to-use-post-processing.md)   | PARTIAL | ▶ `manual-post-processing`        |
| [Matrix Transformations 矩阵变换](./matrix-transformations.md)         | FULL    | ▶ `manual-matrix-transformations` |

---

## Basics（基础）

| 篇目                                            | 状态 | 示例                         |
| ----------------------------------------------- | ---- | ---------------------------- |
| [Fundamentals 基本概念](./fundamentals.md)      | FULL | ▶ `manual-fundamentals`      |
| [Responsive Design 响应式设计](./responsive.md) | FULL | ▶ `manual-responsive-design` |
| [Prerequisites 前置知识](./prerequisites.md)    | META | –                            |
| [Setup 环境搭建](./setup.md)                    | FULL | ▶ `manual-setup`             |

## Fundamentals（核心要素）

| 篇目                                                           | 状态    | 示例                       |
| -------------------------------------------------------------- | ------- | -------------------------- |
| [Primitives 内置图元](./primitives.md)                         | FULL    | ▶ `manual-primitives`      |
| [Scenegraph 场景图](./scenegraph.md)                           | FULL    | ▶ `manual-scenegraph`      |
| [Materials 材质](./materials.md)                               | FULL    | ▶ `manual-materials`       |
| [Textures 纹理](./textures.md)                                 | FULL    | ▶ `manual-textures`        |
| [Lights 光源](./lights.md)                                     | FULL    | ▶ `manual-lights`          |
| [Cameras 相机](./cameras.md)                                   | FULL    | ▶ `manual-cameras`         |
| [Shadows 阴影](./shadows.md)                                   | BLOCKED | –                          |
| [Fog 雾](./fog.md)                                             | FULL    | ▶ `manual-fog`             |
| [Render Targets 渲染目标](./rendertargets.md)                  | PARTIAL | ▶ `manual-render-targets`  |
| [Custom BufferGeometry 自定义几何](./custom-buffergeometry.md) | FULL    | ▶ `manual-custom-geometry` |
| [Physics 物理](./physics.md)                                   | FULL    | –                          |

## Tips（技巧）

| 篇目                                                                                                                 | 状态    | 示例                           |
| -------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------ |
| [Rendering On Demand 按需渲染](./rendering-on-demand.md)                                                             | PARTIAL | ▶ `manual-rendering-on-demand` |
| [Debugging JavaScript 调试 JavaScript](./debugging-javascript.md)                                                    | FULL    | ▶ `manual-debugging-js`        |
| [Debugging GLSL 调试 GLSL](./debugging-glsl.md)                                                                      | N/A     | –                              |
| [Taking a screenshot 截图](./tips.md#taking-a-screenshot-截图)                                                       | PARTIAL | –                              |
| [Prevent the Canvas Being Cleared 阻止画布被清除](./tips.md#prevent-the-canvas-being-cleared-阻止画布被清除)         | PARTIAL | –                              |
| [Get Keyboard Input From a Canvas 从画布获取键盘输入](./tips.md#get-keyboard-input-from-a-canvas-从画布获取键盘输入) | FULL    | ▶ `manual-tips-keyboard`       |
| [Make the Canvas Transparent 让画布透明](./tips.md#make-the-canvas-transparent-让画布透明)                           | PARTIAL | –                              |
| [Use as Background in HTML 作为 HTML 背景](./tips.md#use-as-background-in-html-作为-html-背景)                       | PARTIAL | –                              |

## Optimization（性能优化）

| 篇目                                                                                           | 状态    | 示例                       |
| ---------------------------------------------------------------------------------------------- | ------- | -------------------------- |
| [Optimizing Lots of Objects 优化大量对象](./optimize-lots-of-objects.md)                       | PARTIAL | ▶ `manual-lots-of-objects` |
| [Optimizing Lots of Objects Animated 优化大量动画对象](./optimize-lots-of-objects-animated.md) | PARTIAL | ▶ `manual-lots-animated`   |
| [Using OffscreenCanvas in a Web Worker 在 Worker 中使用 OffscreenCanvas](./offscreencanvas.md) | N/A     | –                          |

## Solutions（实战方案）

| 篇目                                                                             | 状态    | 示例                        |
| -------------------------------------------------------------------------------- | ------- | --------------------------- |
| [Load an .OBJ file 加载 OBJ 文件](./load-obj.md)                                 | N/A     | –                           |
| [Load a .GLTF file 加载 glTF 文件](./load-gltf.md)                               | FULL    | ▶ `manual-load-gltf`        |
| [Add a Background or Skybox 背景与天空盒](./backgrounds.md)                      | PARTIAL | ▶ `manual-backgrounds`      |
| [How to Draw Transparent Objects 绘制透明对象](./transparency.md)                | FULL    | ▶ `manual-transparent`      |
| [Multiple Canvases, Multiple Scenes 多画布多场景](./multiple-scenes.md)          | PARTIAL | ▶ `manual-multi-canvas`     |
| [Picking Objects with the mouse 鼠标拾取](./picking.md)                          | FULL    | ▶ `manual-picking`          |
| [Post Processing 后处理](./post-processing.md)                                   | N/A     | –                           |
| [Using Shadertoy shaders 使用 Shadertoy 着色器](./shadertoy.md)                  | N/A     | –                           |
| [Aligning HTML Elements to 3D HTML 元素对齐 3D](./align-html-elements-to-3d.md)  | FULL    | ▶ `manual-align-html`       |
| [Using Indexed Textures for Picking and Color 索引纹理](./indexed-textures.md)   | PARTIAL | ▶ `manual-indexed-textures` |
| [Using A Canvas for Dynamic Textures 用 Canvas 做动态纹理](./canvas-textures.md) | PARTIAL | ▶ `manual-dynamic-texture`  |
| [Billboards and Facades 公告板](./billboards.md)                                 | PARTIAL | ▶ `manual-billboards`       |
| [Freeing Resources 释放资源](./cleanup.md)                                       | FULL    | ▶ `manual-cleanup`          |
| [Making Voxel Geometry (Minecraft) 体素几何](./voxel-geometry.md)                | FULL    | ▶ `manual-voxel`            |
| [Start making a Game 开始做游戏](./game.md)                                      | FULL    | ▶ `manual-mini-game`        |

## WebGPU

| 篇目                                                 | 状态 | 示例 |
| ---------------------------------------------------- | ---- | ---- |
| [WebGPURenderer](./webgpurenderer.md)                | N/A  | –    |
| [Post-Processing 后处理](./webgpu-postprocessing.md) | N/A  | –    |

## WebXR

| 篇目                                                        | 状态 | 示例 |
| ----------------------------------------------------------- | ---- | ---- |
| [VR - Basics VR 基础](./webxr-basics.md)                    | N/A  | –    |
| [VR - Look To Select 注视选择](./webxr-look-to-select.md)   | N/A  | –    |
| [VR - Point To Select 指向选择](./webxr-point-to-select.md) | N/A  | –    |

## Reference（参考）

| 篇目                                             | 状态 | 示例 |
| ------------------------------------------------ | ---- | ---- |
| [Material Table 材质对照表](./material-table.md) | FULL | –    |

---

## 能力边界总说明

本手册骨架沿用 three.js manual 的 10 组 64 条目；在此之外，AIR 已按当前公开导出面提供
**组件生命周期、输入事件、资源加载与释放、2D/UI（Label/Button/Layout 等）、2D/3D 物理、
音视频、DragonBones/TiledMap/2D 粒子** 等 Cocos 工作流能力。逐主题的
「官方指南锚点 → AIR 三层证据（源码导出 / 默认 bundle / 浏览器行为）→ 页面/示例」对照见
[Cocos 4.0 覆盖矩阵](./cocos4-coverage-matrix.md)，各主题的工作流教程见下方「Cocos 4.0 开发工作流」组。

仍不包含（官方指南有此流程，但 AIR 当前发行目标或公开工作流不同）：Creator 编辑器/Inspector/
Prefab 资源绑定、原生 JSB、各平台发布、地形、XR、WebGPU、MiniGame、Native、Spine（导出面在、
浏览器验证缺，单列 `待验证`）。相关 `N/A` 篇目如实说明现状与近似替代，不做能力伪装。

## 运行示例

```bash
npm install && npm run build      # 产出 build/cocosair.module.js
npm run dev                       # dev server（默认 7454）
# 手册示例：http://127.0.0.1:7454/manual/examples/manual-<slug>/
# 手册索引：http://127.0.0.1:7454/manual/index.md
```

手册示例均为**零外部资产**（程序化几何 + inline glTF JSON），不依赖 decoder 注入，
以仓库根为 web 根的任何静态服务器也可直接打开。

## 验证与台账

| 事实               | 来源                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 手册示例浏览器验证 | `node tools/verify/manual-examples-verify.cjs` → `docs/evidence/manual-examples-verified.json` + `docs/evidence/examples/manual-*.png` |
| 逐篇完成度台账     | `docs/evidence/manual-waves.md`（PASS/PARTIAL/BLOCKED + 证据指针）                                                                     |
| 能力冒烟结论       | `docs/evidence/manual-spike.md`（shadows/fog/skybox 等 10 项）                                                                         |
