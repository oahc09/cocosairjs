# WebGPU 渲染器

AIR 已接入冻结 Cocos 官方 TypeScript GFX 实验后端。默认 WebGL2，桌面 Web 可通过 `createAirApp({ canvas, renderer: 'webgpu' })` 显式选择；不提供运行中后端切换，也不自动回退。

## 启动与部署

单一主入口包含两后端注册，shader 转换资产仅在显式 WebGPU 启动时加载。将主模块与相邻 `webgpu/` 目录一并部署；更改目录可指定 `webgpu.assetBaseUrl`。完整示例、错误及异步读回合同见 [部署指南](../guides/webgpu.md)。

示例：`examples/webgpu-basic/index.html` 默认请求 WebGPU；加 `?renderer=webgl2` 使用同一场景比较。

## 如何判断支持

查看实际 `director.root.device.gfxAPI`，不能用 `navigator.gpu`、枚举存在或构建成功代替出图。通过单步时钟采样，检查 compositor 截图、GPU 数据和 validation error。最新验证状态见 [验收说明](../reference/webgpu-acceptance.md)，未完成的功能矩阵不记 FULL。

材质继续使用 Cocos Effect/GLSL，沿用现有 glsl4 → SPIR-V → WGSL 转换。没有引入 Three.js TSL 或新的场景 API。WebGL2 专用 helper 的兼容性按各自合同标明，不承诺所有上层接口已经对齐。

上一篇：[小游戏](game.md) ｜ 下一篇：[WebGPU 后处理](webgpu-postprocessing.md)
