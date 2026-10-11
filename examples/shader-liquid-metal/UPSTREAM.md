# E07 来源与独立实现边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。
MIT Copyright (c) 2026 Shader Effects Inc.，完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)（`2a98b03e…`）。MaterialX/OSL 噪声为第三方原作品（条款随通知束保留）。来源与逐文件 SHA 见 [上游来源记录](../../docs/effects/upstream-reference.json)。

参考文件与核对指纹（只读，未执行上游）：

| 文件                                                                                                                | 角色          | 采纳内容                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/shaders/LiquidMetal/index.ts`（`6af799e9…`）                                                     | 组件/材质代数 | 流动浮雕链、程序影棚、镜面/色散/质量分支、金属 ramp 与轮廓                                                                                                      |
| `packages/core/src/std/paint/materials.ts`（`7cb6e03f…`）                                                           | std 语义      | shapedSurface/surfaceField/surfacePattern/geometricNormal/nudgeNormal/perlinSlope/flowWarp/viewRay/keyLightAt/sharpGlint/reflect/silhouette/guarded/insideShape |
| `packages/core/src/gpu/kit/noise.ts`（缓存）                                                                        | 噪声族识别    | **实际噪声族为 perlin12d → hash22 = Fi-hash 家族（floatBitsToUint 格点散列）——许可未明，不采用**（文件头标 @lumiey MIT 但按既定边界排除）                       |
| `packages/core/src/gpu/kit/lighting.ts`（缓存）                                                                     | 光学原语      | bevelledFlatNormal/fieldGradient/perspectiveViewRay 精确体                                                                                                      |
| `lead-w2-e03-upstream-materialParts.ts`（Lead 获取，`e8121665…`）                                                   | 共享体        | flowWarpOffset（sin·cos 双积）/clampedPerlinGrad（±4 钳制）/nudgeNormal/sharpGlint/keyLight 精确体                                                              |
| `worker-w3-e07-upstream-bevel.ts`（本 Worker 从 pinned commit 真实 HTTP 200 获取，`8edd2b2b…`，fetch receipt 伴随） | 倒角轮廓      | bevelSin 精确体（round 1−t / machined 0.72 台阶混合）                                                                                                           |

**采纳算法**：前向场 stencil eps=0.01（geometricNormal 默认）、sdf=s0/scale；bevelSin 倒角轮廓→bevelledFlatNormal（sB≤0.9995 钳制、z=−cos）；`freq=ripple·2.6`、`flowT=t·0.12`、flowWarp 双 sin·cos 积域扭曲（`warp·0.9`）；浮雕梯度增益 0.62 钳 ±4 乘 `turbulence·0.5` 取负折入法线（nudgeNormal 语义）；透视视线 fov 0.6 与其镜像反射；LiquidMetal 自有三柔光灯影棚（overhead 0,0.55 ×1.05 增益 1.75 / lower-left −0.45,−0.4 ×1.25 ×1.15 / right 0.55,0.1 ×1.15 ×1.1，`keyRad=mix(0.5,0.18,sharp)`，`drift=sin(t·0.07)·0.05`，env 旋转矩阵，sky²·0.4 地板-天空梯度）；柔光灯边缘逆 smoothstep 改显式有序逆 `1−smoothstep(r·0.2, r, d)`；主光 elevation −0.7、sharpGlint `pow(ndh, mix(60,900,sharp))·mix(0.4,1.4,sharp)`；金属 ramp `mix(dark,light,clamp(lum,0,1.8))`（#141414→#eef0f6 线性解码）；轮廓=E03 已验证 silhouetteAlpha 精确链；两像素外 guard 精确 vec4(0)。

**实现差异**（独立重实现，非字节移植）：

1. **噪声替代（关键声明）**：上游浮雕读 `perlin12d`（Fi-hash hash22 格点散列——floatBitsToUint，GPU-only、许可未明）→ **不采用**；替代为已验证 MIT 的 MaterialX perlin（lookup3 u32 散列）+ 中心差分斜率（eps=0.1，同 0.62 增益 ±4 钳制）。**同类替代非等价**——分布/相位与上游不同，不声称逐字节或逐纹素一致。
2. **质量档位（真实算力差异）**：上游按设备分支——本例改为显式 `quality` 参数：`low`=RGB 共享 1 次影棚求值（3 柔光灯距离）；`high`=色散分离 2 次影棚求值（G 与 B 各一，R=2G−B，`dth=dispersion·0.09·(0.4+grazeD·1.3)` 旋转）。每像素 studio 求值数 1→2、柔光灯距离求值 3→6。
3. 动画时间：时钟累计绝对时间、uniform 读 time×当前 speed——与上游 Σ(dt·speed) 仅 speed 恒定时等价，speed 变更重映射相位。
4. seed 本地扩展（噪声域偏移 `seed·13.37`，0=固定基准域）；SDF 解析 circle/rounded-box；sphere3D/volumetric/SDF 贴图/shape JSON 平台/center-origin NOT_SUPPORTED。
5. 颜色链：straight linear RGBA；预览 OETF 一次+定点帧缓冲先 clamp 再 SRC_ALPHA 混合；透明底 rgba8 RT 直读。

**Liquid Metal 是视觉材质，不是流体模拟。**
