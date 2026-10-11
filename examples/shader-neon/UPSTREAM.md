# E04 来源与独立实现边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。
MIT Copyright (c) 2026 Shader Effects Inc.，完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)（`docs/effects/upstream-LICENSE.txt` 同指纹 `2a98b03e…`）。来源与逐文件 SHA 见 [上游来源记录](../../docs/effects/upstream-reference.json)。

参考文件与核对指纹（本地只读缓存 `output/shaders-absorption/reference/`，不执行上游代码）：

| 文件                                                     | 角色            | 采纳内容                                                                              |
| -------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/shaders/Neon/index.ts`（`7ecc741e…`） | 组件 props/语义 | 参数面（厚度/双层 glow/热核/闪烁/流动/二次色混合/镜面）与 cutout 语义                 |
| `packages/core/src/gpu/kit/effects/neon.ts`              | 纯数学体        | 5 点中心+四向 SDF stencil、半圆截面法线照明、热核、双指数外晕、远端截断、flicker/flow |
| `packages/core/src/gpu/kit/effects/glass.ts`             | 共享体          | `sdfSpaceUV`（aspect 校正/旋转/缩放）与 `offsetUV` 语义                               |
| `packages/core/src/std/paint/materials.ts`               | 材质骨架        | shapedSurface 的 flat 通路语义（无 RTT 子纹理路径）                                   |

**采纳算法**：有符号距离管体（rim band，非填充盘）、半圆截面 `sqrt(t(2-t))` 法线与 Blinn-Phong（lz=0.7 常数）、`ambient+diffuse*0.55+selfEmission` 自发光、热核 `smoothstep(0.55,1,depthNorm)` 与 75% 白核色、内 `exp(-12d/R)*0.7` + 外 `exp(-4d/R)*0.35` 双层指数外晕（外侧 `smoothstep(-0.003,0.003)` 门控）、`glowR*1.5+softPx+smoothEPS` 之外的硬零截断、三个无理比值正弦的闪烁、`atan2` 角向 `2θ` 流动带、`alpha=max(tubeMask, glowMasked*0.6)` 的 straight RGBA。

**实现差异**（独立重实现，非字节移植）：

1. 上游 `smoothstep(edgeHigh, edgeLow, x)` 逆边写法在 GLSL 为未定义行为，本实现改为显式有序逆 `1.0 - smoothstep(edgeLow, edgeHigh, x)`（管体内掩模与外掩模两处）。
2. SDF 输入为**解析函数**（circle / rounded-box 两种确定性形状），无上游 `shapeSdfUrl` SDF 纹理采样、无任意 shape JSON 平台、无 `sphere3D` 等形状目录。
3. 不实现 `volumetric` 视深折痕路径（`.a` 通道深度检测）；smoothEPS 固定为 flat 分支 `0.008+cornerSmoothing*0.03`。
4. 颜色经 `transformColor` 的线性解码在 JS 侧完成（sRGB hex → linear vec3 uniform）；输出为 straight linear RGBA，预览一次 OETF，诊断 RT 直读线性值。
5. 中心固定画布中心（上游 center/origin 参数面未采纳）；无 boundingBoxDeclaration/编辑器 UI 元数据。
6. 上游无 per-pixel 分支的 builder 约束不适用：GLSL 中远端截断为显式提前返回。

**支持范围声明**：本例仅支持 circle 与 rounded-box 两个解析 SDF 形状；不声称覆盖上游 shape 平台（SDF 贴图/3D 体积场/任意 shape JSON）。独立 CPU oracle 在 `tools/verify/shaders-neon-oracle.cjs` 逐层（core/tube/glow）复算，不解析或执行 GLSL。
