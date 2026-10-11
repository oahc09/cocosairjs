# C02 来源与独立组合边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。
MIT Copyright (c) 2026 Shader Effects Inc.，完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)。

**本例是本地组合设计**，不宣称上游提供相同的 Logo 预设。

## 母效果参考

| 文件                                            | 角色                               |
| ----------------------------------------------- | ---------------------------------- |
| `packages/core/src/shaders/ThinFilm/index.ts`   | E02 薄膜参数面与光学相位语义       |
| `packages/core/src/shaders/Neon/index.ts`       | E04 霓虹参数面与 5 点 stencil 语义 |
| `packages/core/src/gpu/kit/effects/neon.ts`     | neonComposite/neonGlow 纯数学体    |
| `packages/core/src/gpu/kit/effects/glass.ts`    | sdfSpaceUV/offsetUV 共享体         |
| `packages/core/src/gpu/kit/effects/thinFilm.ts` | 薄膜光学公式                       |
| `packages/core/src/std/paint/materials.ts`      | shapedSurface 材质骨架             |

各母效果已在 E02/E04 独立验收。本例引用其 CPU oracle 函数做独立合成。

## 组合语义（本地冻结）

- **次序**：Neon over ThinFilm（非交换）。
- 各层计算 **straight linear RGBA**，保留 E02 的 fwidth coverage/analytic gradient 与 E04 的 5 点 diamond stencil/半圆截面法线的**数值差异**（不合并为通用融合）。
- 合成：premultiplied source-over → `outA = neonA + filmA·(1−neonA)`、`outPm = neonRgb·neonA + filmRgb·filmA·(1−neonA)` → **alpha > 0 安全除法（正 α 除，α=0 单独零，HDR 保留）**回 straight → 显示 OETF 一次。透明诊断目标关混合。
- **层开关真 identity**：off 层的 straight RGBA 恰为 (0,0,0,0)；数值 RGB=0 但 alpha≠0（霓虹 glow 尾部）不自动视为 identity——禁用 film 时合成结果真正等于 neon alone，反之亦然。
- **共享解析 SDF**：同一 circle/rounded-box 函数供两层使用（初始共同域，无额外旋转/缩放参数面——每个母效果自身的独立参数面不在此重复）。
- 支持参数子集：E02 的 rimWidth/edgeSoftness/thickness/dispersion/saturation/phase/opacity 与 E04 的 tube/secondary/glow 颜色+secondaryBlend/tubeThickness/intensity/hotCoreIntensity/glowIntensity/glowRadius/lightAngle/specularIntensity/specularSize/cornerSmoothing（不含 flicker/flow，冻结为 0）。shape 共享。

## 差异声明

- 本例不实现上游 Logo 预设（上游无此组合）；组合语义为本地设计。
- flicker/flow/neon 的 scale/rotation/中。
- sphere3D/volumetric/SDF 贴图/shape JSON NOT_SUPPORTED。
