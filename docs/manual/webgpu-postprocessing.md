# WebGPU 后处理与多通道渲染

WebGPU 实验后端已接入；后端启动、内置材质、RenderTexture 和后处理必须分别验收。公开 Stage 类型和成功构建都不能证明多通道画面正确。

## 已验证范围

沿用官方 legacy/custom pipeline 与原生 GFX，验证离屏颜色、深度、MSAA resolve、附件 load/store、下游采样、resize、颜色空间及多 pass。七个原生效果 Bloom/FXAA/ColorGrading/HBAO/DOF/FSR/TAA 已在两后端验证开关与恢复；修复了深度采样 view 和 TAA 关闭后的投影残留，不另建后处理框架。

## 当前边界

完整功能验收状态见 [验收说明](../reference/webgpu-acceptance.md)。AIR 原有 `AirRenderTarget` 等明确要求 WebGL2 的高级 helper 不自动扩大到 WebGPU；它们的设备拒绝仍有效。不能把 WebGL2 专用 helper 通过情况当作 WebGPU 后处理证据。

纹理读回使用异步 GFX 入口，限制与部署要求见 [WebGPU 指南](../guides/webgpu.md)。二维颜色 blit 支持 nearest/linear 缩放；不支持的格式/维度组合明确拒绝；transient MSAA 不在本轮。

上一篇：[WebGPU 渲染器](webgpurenderer.md) ｜ 下一篇：[VR 基础](webxr-basics.md)
