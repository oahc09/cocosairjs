# E03 Holographic 全息箔

Wave 2 独立原生单通道重实现。参考 shader-effects-inc/shaders@`dbfd42abe3…`（MIT；MaterialX/OSL 第三方条款随通知束保留），来源与差异见 [示例 UPSTREAM.md](../../examples/shader-holographic/UPSTREAM.md)。示例：`/examples/shader-holographic/`。

## 采纳的算法语义

- **MaterialX perlin（`mx_noise_float` 2D）独立重写**：Bob Jenkins lookup3 格点散列（u32 语义：wrap/rotl32/xor）、quintic fade `t³(t(6t−15)+10)`、`hash&7` 八梯度表（±u±2v）、bilerp、0.6616 缩放。`surfaceNoise` 实际调用该噪声（materials.ts L916）；**不采用**来源许可未明的 Fi-hash 家族。
- **前向场 stencil** eps=0.008：`fieldGradient=(sX−s0, sY−s0)/eps`（前向差分，非中央）；`sdf=s0/scale`。
- **平面 pillow 法线**：`edgeT=clamp(−sdf/0.06)`、`domeSlope=(1−edgeT)·0.35`、`n=normalize(baseN+wrinkle, −1)`（z 负一）。
- **皱褶有限差分** neps=0.02、`crScale=crinkleScale·1.35`、`crAmp=crinkle·0.8`、差分×0.4；volumetric 壁面衰减平面路径恒 1。
- **衍射 hue**：双倍频 blotch（`fScale=foilScale·2.2`、`drift=t·0.06` 沿固定 300° 光向、第二倍频 ×2.1+5.2/9.4 权重 0.4）；`hue=blotch·0.45+ramp·0.8+normalTilt·1.4+t·0.18+hueShift/360`。
- **精确三分之一相位 IQ 余弦调色板**：phases 恰 0、1/3、2/3（thin-film 的 0.3333/0.6667 截断值保持区分）；`foilTint=mix(silver(0.72,0.73,0.76), spectral, saturation·0.85)`。
- **固定 300° 主光**：L 用上游 f32 预折叠字面量 `(0.37164708971977234, −0.6437116265296936, −0.6689647436141968)`（f64 重折叠会在 x 上差一 ulp——保留字面量）；H 运行时 normalize。`ndl=dot·0.5+0.5`、`sheen=pow(ndh,7)·0.45·(1−roughness·0.35)`、`specCore=pow(ndh,mix(42,12,roughness))·0.85·(1−roughness·0.55)`、spec 按 0.6 混白。
- **flakes**：×190 域 +47.3/−31.1 相位噪声；`twinkle=sin(t·2.2+flakePhase·12.6)·0.5+0.5`；`smoothstep(0.52,0.62)` 掩模；彩虹偏移 `hue+0.33+flakePhase·0.5`。
- **grain**：屏稳域（suv−0.5）×420，`×roughness·0.28`；宏（皱褶/blotch，pattern 域）与微（flake pattern 域、grain 屏稳域）域分离保留。
- **动画时间合同**：引擎时钟累计绝对时间 Σdt，uniform 读取 time×当前 speed——与上游渲染器的 Σ(dt·speed) 仅 speed 恒定时等价；speed 变更重映射光谱相位。时间连续性金标（Δt=0.02→≤3 码值）限定固定 speed；**seed 本地扩展**：噪声输入偏移 `seed·(13.37,7.77)`，0=上游固定域。
- **轮廓与 guard**：与上游 silhouetteAlpha **精确一致**（materialParts.ts@dbfd42ab，Lead 真实获取+缓存 lighting.ts insideMask）：`sharpEdge=max(edgeSoftness·0.5,0.001)`、`w=max(sharpEdge·0.03125,1.5·pxH)`、`m=clamp(−sdf/w,0,1)`、`alpha=m²(3−2m)`；金标 m=0.25→0.15625、边界 0/1、edgeSoftness=0 地板、DPR 地板。来源与更正历史：worker-w2-e03-silhouette-correction.md（旧临时适配已撤回，记录保留）。两像素外 `sdf>2·pxH` guard 精确 vec4(0)。300° 主光 LIGHT_X=+0.5000000000000001（cos300 为正，与折叠 L 同方位）。
- **颜色链**：straight linear RGBA（本算法先clamp最终RGB至[0,1]）；预览 OETF 片段色先被 RGBA8 定点目标 clamp 再 SRC_ALPHA 混合；透明底 rgba8 RT 直读 `round(clamp01(x)·255)`。

## 验证面

| 维度        | 内容                                                                                                                            | 状态             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Build       | strict tsc + esbuild bundle + 三变体 GLSL                                                                                       | PASS（三浏览器） |
| Runtime     | create/update/resize/pause/resume/destroy/recreate + 可信控件（真实 #release 点击+释放后事件）                                  | PASS（三浏览器） |
| Visual      | 11 案例×DPR1 + 2×DPR2（silver/full-spectral/crinkle-zero/sparkle-zero/speed-zero/seed-2/rotation-90 等），PNG+透明底 RT 双证明  | PASS（三浏览器） |
| Boundary    | 13 参数 × default/min/near-min/max/near-max/invalid（74 例）+ 6 类非法整批拒绝                                                  | PASS（三浏览器） |
| Resource    | 100 轮单通道实例（3 引用、内存基线）                                                                                            | PASS（三浏览器） |
| Performance | 720p/1080p/mobileDPR2 三冻结 profile×3 引擎（单遍合同 ≥1 draw）；真实 HTTP 隔离+DPR 修复+25000 次时钟标定；须 `--authorization` | PASS（三浏览器） |

工具：[oracle](../../tools/verify/shaders-holographic-oracle.cjs)（mx 噪声/法线/hue/光照/flake/grain 分层复算）、[collector](../../tools/verify/shaders-holographic-browser.cjs)（六门/`--verify` 只读/显式错误数组合同）、[performance](../../tools/verify/shaders-holographic-performance.cjs)（单遍冻结校验）。

## 支持范围（NOT_SUPPORTED 明确披露）

仅 circle/rounded-box 两个解析 SDF；上游默认 `sphere3D`/volumetric 视深路径、`shapeSdfUrl` SDF 贴图、shape JSON 平台、center/origin 参数面与编辑器元数据均未实现。不是全息波动模拟。GPU f32 与 CPU f64 的噪声差以 ±2 码值容差与误差定位流程处理，不静默放宽。

2026-10-10 当前验收：Lead functional-attempt5 与 performance-attempt1 的真实 OS exit0、输入不漂移；三浏览器全部六维PASS。固定十三项见[实证交付](holographic-validation-delivery.md)，完整Wave2见[汇总Gate](../evidence/shaders-absorption/wave2-current-gate.json)。Agent Gate与单独Gallery harness仍NOT_RUN。
