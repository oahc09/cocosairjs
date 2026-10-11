# E06 来源与独立实现边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。
MIT Copyright (c) 2026 Shader Effects Inc.，完整通知见 [LICENSE.reference.txt](LICENSE.reference.txt)。

参考文件：packages/core/src/shaders/Sparkle/index.ts、std/paint/patterns.ts 的 scatterPoints、std/paint/light.ts 的 starGlint、std/motion.ts 的 flashes、std/effects/blurs.ts 的 brightestNear。
两网格、alpha 加权 sqrt(linear Rec709 luma) 的 0.12 阈值带、Gaussian core、指数十字射线、四点 ring expand 和 blink^8 来自上述语义。核心输出为 linear associated RGB + glow，coverage=min(alpha+max(glow),1)。预览 OETF/associated blend 是独立显示适配；诊断原生 rgba16f RT 不做 OETF。

**独立 hash**：本地 uint 坐标散列只使用独立确定的 LCG 系数、xor shifts 和低 16 位输出。未读取/转写 Fi-hash 祖源或上游 hash32 实现。seed 在 1/4096 上量化；星位和随机分布不声明逐字节等价。未使用上游 runtime、TypeGPU、额外 canvas 或自行 GL draw。
