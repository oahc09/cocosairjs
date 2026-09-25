# FAQ 常见问题

> **META 篇**：高频踩坑问答。每条都给结论 + 指向详细篇目；所有结论都有仓库内证据（`docs/evidence/`），不凭印象答。

## 画面全黑 / 什么都没有，但控制台没报错？

两个最常见原因，都silent-fail：① `#GameCanvas` 没在引擎 `import` 之前存在于 DOM（screen-adapter 是模块顶层单例）；② 忘了 `camera.visibility = Layers.Enum.DEFAULT`，相机一个节点都不收。见 [Creating a Scene](./creating-a-scene.md) 的"空屏排查表"。

## `builtinResMgr.get('builtin-standard-material').clone()` 报 clone is not a function？

AIR 的 `Material` 用 `copy` 不用 `clone`；但更推荐的做法是**不要复制共享材质**，直接 `new Material()` + `initialize({ effectName: 'builtin-standard' })` 再 `setProperty`。共享 builtin 材质原地改会污染所有使用者。见 [Creating a Scene](./creating-a-scene.md)、[Uniform Types](./uniform-types.md)。

## 怎么确认引擎跑在 WebGL2 还是 WebGPU？

看 `director.root.device.constructor.name`（如 `WebGL2Device`）。**不要**用 `game.renderType`（AIR 里是 `-1`，不可用）；`gfx.API.*` 只是枚举定义不代表当前设备。见 [WebGL Compatibility Check](./webgl-compatibility-check.md)。

## `sys.browser` 为什么是 undefined？

AIR 的 `sys` 暴露的是 `platform` / `browserType` / `browserVersion` / `os` / `isMobile`，**没有** `sys.browser` 这个字段。判平台用这几个。见 [WebGL Compatibility Check](./webgl-compatibility-check.md) §2。

## 线画出来是填充三角形 / 一团面？

mesh 的 `primitiveMode: LINE_LIST` 会被 pass 的 PSO 覆盖成 `TRIANGLE_LIST`。必须 `renderer.getMaterialInstance(0).overridePipelineStates({ primitive: gfx.PrimitiveMode.LINE_LIST })`。另注意 `builtin-unlit` 开 `USE_COLOR` 而几何无颜色属性会得到黑线。见 [Drawing Lines](./drawing-lines.md)。

## metallic 拉满为什么变黑？

PBR 正确行为：金属无漫反射，镜面又需要环境（IBL/天空盒）可反；只有一盏平行光时金属几乎不返光。要金属观感先配环境光/天空盒。见 [Uniform Types](./uniform-types.md) §3。

## 能加载 draco / KTX2 压缩模型吗？

默认构建**BLOCKED**：解码器二进制不内置，需显式 `setDRACODecoder` / `setKTX2Transcoder` 注入，而仓库未提供这些二进制。meshopt 有注入回路示例（`examples/gltf-meshopt`）。见 [Loading 3D Models](./loading-3d-models.md) §5、[Libraries and Plugins](./libraries-and-plugins.md)。

## 怎么做文字？

屏幕 UI 文字用 `Label` 组件（挂在 `Canvas` 层级下，`label.string = '...'` 即出字）；世界空间的文字牌用 canvas 贴图；要 DOM 清晰度用 HTML 对齐到 3D。3D 文字几何（字体解析生成 mesh）导出面没有，用 canvas 贴图路替代。见 [Creating Text](./creating-text.md)。

## 手册示例和引擎示例（examples/）什么关系？

手册示例在 `docs/manual/examples/manual-*/`，零外部资产、逐篇过专用验证器；引擎回归示例在 `examples/`，是另一套体系。两者不混用。见 [Setup](./setup.md)。
