# E05 来源与独立实现边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。
MIT Copyright (c) 2026 Shader Effects Inc.，完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)（`2a98b03e…`）。来源与逐文件 SHA 见 [上游来源记录](../../docs/effects/upstream-reference.json)。

参考文件与核对指纹（本地只读缓存 `output/shaders-absorption/reference/`，不执行上游代码）：

| 文件                                                         | 角色            | 采纳内容                                                                          |
| ------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------- |
| `packages/core/src/shaders/Emboss/index.ts`（`ff31f625…`）   | 组件 props/语义 | 参数面（signed depth/lightAngle/lightIntensity/shadowIntensity）与 child RTT 语义 |
| `packages/core/src/gpu/kit/effects/emboss.ts`（`f93f0de4…`） | 纯数学体        | signed SDF 高度平台、中心+四向差分法线（eps=0.003）、两 trace tap 阴影、UV warp   |
| `packages/core/src/gpu/kit/effects/glass.ts`                 | 共享体          | `sdfSpaceUV`/`offsetUV` 场空间语义                                                |
| `packages/core/src/gpu/kit/blend.ts`                         | 预乘边界        | `unpremultiplyAlpha` 的 alpha>0.001 安全逆转语义                                  |
| `packages/core/src/std/paint/materials.ts`                   | 材质骨架        | shapedSurface child-required 通路语义                                             |

**采纳算法**：signed SDF 高度平台（`depth·(1−smoothstep(−tw,tw,s))`，tw=0.003）、中央差分法线 `n=(−dhx,−dhy,1)/‖·‖`、lz=0.7 常数光向的 `(NdotL−lzn)·intensity` 边缘光（highlight/edgeShadow 对称分解）、两 trace tap（50%/100% of `|depth|·0.06` spread）经宽过渡高度的 cast shadow（`0.55/0.45` 加权）、内侧 `1−depth·0.05` 的 UV 缩放式 parallax warp、child 预乘采样→alpha>0.001 安全 unpremultiply→straight 数学→straight RGBA 输出、形状外 child 原样直通。

**实现差异**（独立重实现，非字节移植）：

1. 逆边 `smoothstep(tw,−tw,s)` 改显式有序逆 `1−smoothstep(−tw,tw,s)`（高度与 inside 两处，GLSL 逆边未定义）。
2. Child 为**原生双相机 RTT**：同场景子相机（priority 0）把 256×256 确定性图案 quad 渲入 `createAirRenderTarget`（rgba8/nearest/CLAMP），`bindColor` 绑定到浮雕材质采样器；非上游 convertToTexture/编辑器管线。图案含不透明/半透明/透明三区、隐藏 RGB（alpha0 下非零 RGB）与 UV 方向锚点（8×8 不对称棋盘+u 向红渐变）。
3. SDF 为解析 circle/rounded-box 两形状；**未实现**上游 SDF 贴图（`shapeSdfUrl`）、shape JSON 平台与 `volumetric` 连续高度路径（NOT_SUPPORTED，明确披露）。
4. Parallax warp 是 UV 缩放，不声称真实几何位移。
5. center 固定画布中心；无编辑器 UI 元数据/origin 参数面。

独立 CPU oracle（`tools/verify/shaders-emboss-oracle.cjs`）逐级复算图案纹素（预乘 rgba8 量化）、最近邻采样+安全 unpremultiply、高度/法线/阴影/warp 与 straight RGBA——不解析或执行 GLSL。
