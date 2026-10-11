# E03 来源与独立实现边界

固定参考：shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。
MIT Copyright (c) 2026 Shader Effects Inc.，完整通知束见 [LICENSE.reference.txt](LICENSE.reference.txt)（`2a98b03e…`）。MaterialX/OSL 噪声为第三方原作品（Apache-2.0/BSD-3-Clause 条款随通知束保留）。来源与逐文件 SHA 见 [上游来源记录](../../docs/effects/upstream-reference.json)。

参考文件与核对指纹（本地只读缓存 `output/shaders-absorption/reference/`，不执行上游代码）：

| 文件                                                            | 角色           | 采纳内容                                                                                                          |
| --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/shaders/Holographic/index.ts`（`ee3a8ea0…`） | 组件/材质代数  | 参数面与前向 stencil/法线/色相/光照/flake/grain 全链语义                                                          |
| `packages/core/src/std/paint/materials.ts`                      | std 语义       | `surfaceNoise`=mxNoiseFloat2（L916）、`surfaceField`/`silhouette`/`fieldSlope`/`patternCoords`/`insideShape` 语义 |
| `packages/core/src/gpu/kit/noise.ts`                            | MaterialX 噪声 | `mx_perlin_noise_float`(2D)：lookup3 格点散列（u32 语义）、quintic fade、8 梯度表、bilerp、0.6616 缩放            |
| `packages/core/src/gpu/kit/lighting.ts`                         | 光照原语       | `cosinePalette` 精确相位约定、`fieldGradient` 前向差分、`patternCoords` 平面分支                                  |

**采纳算法**：前向场 stencil（eps=0.008，sdf=s0/scale）；平面 pillow 法线（edgeT=clamp(−sdf/0.06)、domeSlope=(1−edgeT)·0.35、n_z=−1）；皱褶有限差分（neps=0.02、crScale=crinkleScale·1.35、crAmp=crinkle·0.8、差分乘 0.4）；双倍频 blotch（fScale=foilScale·2.2、drift=t·0.06 沿固定 300° 光向、第二倍频 ×2.1+5.2/9.4、0.4 权重）；hue=blotch·0.45+ramp·0.8+normalTilt·1.4+t·0.18+hueShift/360；精确 1/3、2/3 相位 IQ 余弦调色板（thin-film 的 0.3333/0.6667 截断值保持区分）；silver(0.72,0.73,0.76)↔spectral 按 saturation·0.85 混合；固定主光 L=(0.37164708971977234,−0.6437116265296936,−0.6689647436141968)（300°，f32 预折叠字面量）+ 运行时 normalize 的 H；ndl=dot·0.5+0.5、sheen=pow(ndh,7)·0.45·(1−roughness·0.35)、specCore=pow(ndh,mix(42,12,roughness))·0.85·(1−roughness·0.55)、spec 按 0.6 混白；flakes（×190 域+47.3/−31.1 相位、twinkle=sin(t·2.2+flakePhase·12.6)、smoothstep(0.52,0.62)掩模、彩虹偏移 hue+0.33+flakePhase·0.5）；grain（suv−0.5 域 ×420、×roughness·0.28）；动画时间 t=Σdt·speed（等价 speed·time）；轮廓 alpha 与**上游 silhouetteAlpha 精确一致**（dbfd42ab materialParts.ts，Lead 真实 HTTP 获取 049bc788…/e8121665… + 缓存 lighting.ts insideMask）：`sharpEdge=max(edgeSoftness·0.5,0.001)`、`w=max(sharpEdge·0.03125, pxH·1.5)`、`m=clamp(−sdf/w,0,1)`、`alpha=smoothstep(0,1,m)=m²(3−2m)`；金标 m=0.25→0.15625。获取历史与更正记录：`worker-w2-e03-silhouette-correction.md`（首次 fetch 失败→Lead 获取成功→按原文重实现，旧临时适配记录保留为历史）；两像素外 guard 精确 vec4(0)（`insideShape` 缓存可得，同语义）。**动画时间合同**：引擎时钟累计绝对时间 Σdt，uniform 读取 time×当前 speed；上游为 Σ(dt·speed)——仅 speed 恒定时等价，speed 变更会重映射光谱相位（连续性金标限定固定 speed，不宣称变速无跳变）。300° 主光 cos 为正（+0.5000000000000001），与折叠 L 同方位。

**实现差异**（独立重实现，非字节移植）：

1. SDF 为解析 circle/rounded-box 两形状；**NOT_SUPPORTED**：上游默认 `sphere3D`/volumetric 视深路径、`shapeSdfUrl` SDF 贴图、shape JSON 平台、center/origin 参数面与编辑器元数据。
2. `surfaceNoise` 的 MaterialX perlin 在 GLSL 中独立重写（Bob Jenkins lookup3 + quintic + 8 梯度），非 Fi-hash 家族（其来源许可未定，不采用）。
3. **seed 为本地扩展**：对每个噪声输入坐标加 `seed·(13.37, 7.77)` 偏移；seed=0 即上游固定域噪声，不改变默认噪声族。
4. 皱褶/bling/grain 的宏/微域分离保留（pattern 域 vs suv 屏稳域）；volumetric 壁面衰减（steepAtten）在平面路径恒为 1。
5. 无逆边 smoothstep（上游本例未用），但 guard/轮廓的 clamp/比较均按显式有序语义实现。

独立 CPU oracle（`tools/verify/shaders-holographic-oracle.cjs`）逐级复算 mx 噪声（u32 语义）、法线、hue 链、光照、flake/grain 与 straight RGBA——不解析或执行 GLSL。
