# Useful Links 有用链接

> **META 篇**：手册之外值得收藏的资源。分"对齐源""规范与样本""浏览器/图形文档""本仓库内部"四组。

## 对齐源（本手册的参照系）

- [three.js manual](https://threejs.org/manual/) —— 本手册的目录结构与内容形式对齐源；每篇开头的对照表都以它为基准。
- [three.js docs](https://threejs.org/docs/) —— 查 three.js 侧 API 语义时用。

## 规范与样本资产

- [Khronos glTF 规范](https://www.khronos.org/gltf/) —— [Loading 3D Models](./loading-3d-models.md) 里内联 glTF 文档的字段（accessor / bufferView / componentType / target）都出自该规范。
- [glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Models) —— 官方测试模型集；仓库 `examples/gltf-viewer` 的下拉列表即引用其中若干。
- [Khronos glTF 扩展注册表](https://github.com/KhronosGroup/glTF/tree/main/extensions) —— `KHR_draco_mesh_compression` / `EXT_meshopt_compression` / KTX2 等扩展的定义，对应 [Loading 3D Models](./loading-3d-models.md) §5 的 decoder 注入边界。

## 浏览器 / 图形文档

- [MDN WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API) —— `canvas.getContext('webgl2')`、能力探针的底层语义，见 [WebGL Compatibility Check](./webgl-compatibility-check.md)。
- [MDN import maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) —— 裸说明符映射，见 [Installation](./installation.md) §2。

## 本仓库内部

- `docs/manual/index.md` —— 60 篇全量目录与完成度状态。
- `docs/evidence/manual-waves.md` —— 逐篇 PASS/PARTIAL/BLOCKED 台账（append-only）。
- `docs/evidence/manual-spike.md` —— 能力冒烟与 368 导出面复核结论。
- `examples/` —— 引擎自身的回归示例树（gltf-viewer / static-model / gltf-meshopt 等），手册示例在 `docs/manual/examples/`。
