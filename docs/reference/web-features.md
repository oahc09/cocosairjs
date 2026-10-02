# Web 运行时功能范围

Cocos AIR 使用原生 Cocos 场景、节点、组件、网格、材质、动画和 UI API，并提供 Code First 启动与 glTF 适配。它面向浏览器；Creator Editor、JSB、原生平台和小游戏平台不属于默认运行时。

## 渲染与加载

浏览器需要 WebGL 2，初始化失败时返回 `WEBGL2_REQUIRED`。WebGL 1 和默认 WebGPU 后端不属于当前支持面；测试用 HEADLESS 不产生浏览器画面。具体约定见 [WebGL 2 策略](../webgl2-only.md)。

glTF/GLB 使用原生 Mesh、Material、Skeleton 和 AnimationClip。模型扩展的状态以运行时 registry 和模型目录能力清单为准；加载 Draco、Meshopt 或 KTX2 时需配置单独部署的解码器。见 [模型加载](../gltf/gltf-runtime.md) 和 [扩展参考](../gltf/gltf-extension-reference.md)。

## 源码、导出与运行行为

目录中存在源码不代表默认 bundle 已包含该功能；声明中存在 API 也不代表外部运行资产已经部署。例如 Spine 和部分 WASM 后端仍受外部资产限制，具体记录见 [Spine 资产来源](../notes/spine-asset-sourcing.md) 与 [物理后端资产来源](../notes/physics-asset-sourcing.md)。

feature 声明来自 `src/cc.config.json`，默认构建集合来自 `tools/build/build.cjs`；`AIR_FEATURES` 用于显式构建变体。变体构建不会自动更新默认发布产物或运行证据。custom pipeline / post-process 的上游聚合方式与默认发布边界由专门门禁检查，不能仅因某个 feature 名称存在就判其像素效果已交付。

```bash
npm run verify:web-only
npm run verify:feature-exports
npm run verify:custom-exports
npm run verify:wasm-backends
```

这些检查分别验证依赖闭包、默认组成、custom pipeline 导出及 WASM 后端登记；浏览器行为需要另行验证。上游基线和有意差异见 [UPSTREAM.md](../UPSTREAM.md)，API 兼容约定见 [稳定性登记](api-stability.md)。
