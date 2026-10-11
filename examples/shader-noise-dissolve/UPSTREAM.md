# E01 上游与许可证

固定上游：[`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`](https://github.com/shader-effects-inc/shaders/tree/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a)。

参考文件：

- [`packages/core/src/shaders/NoiseDissolve/index.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/NoiseDissolve/index.ts)：三 octave Perlin fBM、连续 seed 域偏移、aspect 修正。
- [`packages/core/src/gpu/kit/reveal.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/reveal.ts)：front 重映射、coverage 反转、端点。
- [`packages/core/src/gpu/kit/noise.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/noise.ts)：MaterialX/OSL 来源的二维 lattice gradient/hash 思想。

准确原文件 SHA256、59 文件清单及祖源调查见 [upstream-reference.json](../../docs/effects/upstream-reference.json) 和 [upstream-index.md](../../docs/effects/upstream-index.md)。MaterialX v1.39.5 是比对版本，不冒称上游原始移植版本。

本例把授权的二维 Perlin/lookup3 数学移植成 GLSL ES 3.00；通过 CocosAirJS 原生 EffectAsset、Material、Texture2D、MeshRenderer 执行。没有导入上游 runtime、TypeGPU 或 Fi-hash。Fi-hash 祖源许可未证明，本例不直接派生。修改包括：GLSL uint 运算、例内参数校验、原生 uniform 绑定、明确 softness=0 时用 step、progress 0/1 强制端点。CPU 数值 oracle 独立于页面 shader 编译实现。

发布本例时保留 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) 中 Shader Effects MIT、Sony/OSL BSD-3-Clause 及 MaterialX Apache-2.0 授权文本与版权声明；`src/noise.frag` 标注移植和修改。这里没有以项目根 MIT 替代祖源授权。
