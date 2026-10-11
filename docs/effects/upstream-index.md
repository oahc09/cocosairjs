# Shaders 上游来源与算法索引（Wave 0 A）

状态：来源审查 **PASS**；9 个效果仅 `documented`。Engine Gate、Agent Gate、真实数值/视觉/性能验证均 **NOT_RUN**。本阶段没有实现效果，也不推进下一 Wave。

## 固定身份与许可证

- 仓库：[shader-effects-inc/shaders](https://github.com/shader-effects-inc/shaders)。
- 固定提交：[`dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`](https://github.com/shader-effects-inc/shaders/commit/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a)，标题 `Release v4.0.1 (#11)`。
- GitHub commit API 实测 author/committer 日期均为 `2026-10-07T13:11:22Z`（北京 `2026-10-07 21:11:22`）。计划中的日期指该提交，不证明 npm 发布或 tag 日期。
- 根 package version=`0.0.0`，`packages/core/package.json` version=`1.7.0`，`packages/shaders/package.json` version=`4.0.1`。`shaders v4.0.1` 指入口包，不是 core 版本。
- [固定提交许可证](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/LICENSE)：MIT，`Copyright (c) 2026 Shader Effects Inc.`；原字节作为 [upstream-LICENSE.txt](upstream-LICENSE.txt) 的首段保留，后接已核查祖源许可；JSON 分别记录原文和合并文本 SHA。直接派生代码须携带版权及适用许可文本，不能仅凭根 MIT 覆盖祖源。未下载图片/云端素材，不能据此认定其权利。
- 原始文件清单：[upstream-reference.json](upstream-reference.json)。共 **59 文件 / 1,373,885 字节**；每份记录 SHA256、bytes、Git blob SHA、永久源码 URL。逐文件重算 Git blob SHA 与固定树一致（包括 LICENSE）；这是字节身份，不是算法正确性证据。
- 源码只读缓存于 `output/shaders-absorption/reference/`；仅解析/阅读，未执行上游代码、安装依赖、运行 TypeGPU 或引入渲染 canvas。GitHub API tree `truncated=False`；9 个准确效果目录均存在，无猜造路径。

## E01–E09 精确参考与实现约束

### E01 NoiseDissolve

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/NoiseDissolve/index.ts)：`packages/core/src/shaders/NoiseDissolve/index.ts`。

采用思想：Stable three-octave Perlin fBM, aspect-correct domain, seed offsets, remapped feathered coverage; scale only alpha of straight input.

端点/单位/结构语义：progress 0 visible / 1 erased at all softness; seed is floating domain displacement, not integer PRNG; field has no time.

Cocos 重实现差异与必测：Freeze domain/hash algorithm, alpha representation and UV origin. Explicit noise implementation must identify differences from MaterialX-derived upstream helper; generic sin-hash is not byte-equivalent.

主要 helper：

- [`packages/core/src/std/effects/reveal.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/effects/reveal.ts)。
- [`packages/core/src/gpu/kit/reveal.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/reveal.ts)。
- [`packages/core/src/gpu/kit/noise.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/noise.ts)。

### E02 ThinFilm

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/ThinFilm/index.ts)：`packages/core/src/shaders/ThinFilm/index.ts`。

采用思想：SDF normal and interior rim, directional/time/thickness phase; cosine rainbow or custom cyclic palette; transparent interior.

端点/单位/结构语义：Scale-adjusted SDF; rimWidth has 0.1 scale; degrees lightAngle; rainbow phases 0,0.3333,0.6667; custom mode/colorSpace are structural branches.

Cocos 重实现差异与必测：Visual iridescence model, not spectral optical thin-film interference. Analytic 2D SDF first is permitted with explicitly narrower shape coverage; derivative fwidth is local AA, not a substitute for normal gradient.

主要 helper：

- [`packages/core/src/gpu/kit/effects/thinFilm.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/thinFilm.ts)。
- [`packages/core/src/gpu/kit/effects/glass.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/glass.ts)。
- [`packages/core/src/gpu/kit/lighting.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/lighting.ts)。
- [`packages/core/src/std/paint/materials.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/materials.ts)。

### E03 Holographic

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/Holographic/index.ts)：`packages/core/src/shaders/Holographic/index.ts`。

采用思想：Pillow/volumetric normals plus wrinkle finite differences, directional cosine spectrum, fixed studio light, glitter and grain.

端点/单位/结构语义：Normal stencil 0.008; wrinkle stencil 0.02; hueShift degrees /360; exact thirds palette; accumulated animated time; upstream exposes no seed.

Cocos 重实现差异与必测：Adding local seed is an extension; fixed time alone reproduces the original fixed-domain noise. Macro surface-locked and screen-stable grain domains must not be conflated. Not a holographic wave simulation.

主要 helper：

- [`packages/core/src/std/paint/materials.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/materials.ts)。
- [`packages/core/src/gpu/kit/noise.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/noise.ts)。
- [`packages/core/src/gpu/kit/lighting.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/lighting.ts)。

### E04 Neon

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/Neon/index.ts)：`packages/core/src/shaders/Neon/index.ts`。

采用思想：Signed-distance tube, semicircular cross-section lighting and hot core plus independently controlled two exponential exterior glows.

端点/单位/结构语义：Center plus cardinal SDF neighbors; core/tube/glow controls separate; glow cutoff forces distant alpha=0; flicker/flow use time.

Cocos 重实现差异与必测：Implement analytic glow before any extra Bloom pass; report straight/associated color and blend state; reverse-edge smoothstep in source must become ordered-edge explicit inverse in GLSL.

主要 helper：

- [`packages/core/src/gpu/kit/effects/neon.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/neon.ts)。
- [`packages/core/src/gpu/kit/effects/glass.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/glass.ts)。
- [`packages/core/src/std/paint/materials.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/materials.ts)。

### E05 Emboss

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/Emboss/index.ts)：`packages/core/src/shaders/Emboss/index.ts`。

采用思想：Signed height over SDF, central differences for normal, two shadow taps and parallax-like input UV warp.

端点/单位/结构语义：Child RTT is premultiplied; unpremultiply before color math then return straight RGBA; signed depth controls raised/sunken; outside shape passes input through.

Cocos 重实现差异与必测：No physical displacement geometry claim. Test a known planar/ramp height with reversed light and signed depth, transparent input hidden RGB and no double premultiply.

主要 helper：

- [`packages/core/src/gpu/kit/effects/emboss.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/emboss.ts)。
- [`packages/core/src/gpu/kit/effects/glass.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/glass.ts)。
- [`packages/core/src/gpu/kit/blend.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/blend.ts)。
- [`packages/core/src/std/paint/materials.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/materials.ts)。

### E06 Sparkle

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/Sparkle/index.ts)：`packages/core/src/shaders/Sparkle/index.ts`。

采用思想：Two jittered grids of points; alpha-weighted brightest-neighbor luminance gates deterministic twinkling analytic star glints; add to input.

端点/单位/结构语义：CSS-pixel size/rays/expand; threshold on sqrt(linear luma), band=0.12; Rec709 luma weights; intensity=0 identity; expand crossing zero changes tap topology; seed domain differs per layer.

Cocos 重实现差异与必测：Do not threshold already gamma-encoded RGB; alpha-zero bright input must not spawn stars. Match DPR in logical coordinates and constrain neighborhoods/edge mode; no global bloom proxy.

主要 helper：

- [`packages/core/src/std/effects/blurs.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/effects/blurs.ts)。
- [`packages/core/src/std/paint/patterns.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/patterns.ts)。
- [`packages/core/src/std/paint/light.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/light.ts)。
- [`packages/core/src/std/motion.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/motion.ts)。
- [`packages/core/src/gpu/kit/colorOps.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/colorOps.ts)。

### E07 LiquidMetal

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/LiquidMetal/index.ts)：`packages/core/src/shaders/LiquidMetal/index.ts`。

采用思想：Flow-warped Perlin slopes perturb surface normal; reflected procedural three-softbox studio and specular lobe with channel splitting.

端点/单位/结构语义：Ripple frequency times2.6; flow time times0.12; desktop chromatic split vs mobile shared evaluation is build-time device branch; upstream exposes no seed.

Cocos 重实现差异与必测：Visual material, not a fluid simulation. Local explicit quality tiers replace upstream hidden viewport heuristic only as documented divergence; freeze view/reflection/color domains and measure tier cost.

主要 helper：

- [`packages/core/src/std/paint/materials.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/materials.ts)。
- [`packages/core/src/gpu/kit/noise.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/noise.ts)。
- [`packages/core/src/gpu/kit/lighting.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/lighting.ts)。

### E08 CursorTrail

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/CursorTrail/index.ts)：`packages/core/src/shaders/CursorTrail/index.ts`。

采用思想：CPU anchor/live-head trail, midpoint quadratic Bezier capsule/cone SDF chain, age color and speed radius; 64x1 point data texture, no compute simulation.

端点/单位/结构语义：MAX_POINTS64 including duplicate head; three Bezier subdivisions; speed dt cap0.1s / age cap0.25s; aspect-correct distance; width signed to encode connectivity; newest-overlap paint logic.

Cocos 重实现差异与必测：Use Cocos input and director lifecycle; never copy RAF/runtime listeners. Define touch IDs, outside/cancel/resize policy; float32 vs upstream half16 and host smoothing differences affect numerical equivalence.

主要 helper：

- [`packages/core/src/gpu/kit/host/pointer.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/host/pointer.ts)。
- [`packages/core/src/gpu/kit/agents.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/agents.ts)。
- [`packages/core/src/gpu/kit/colorMixing.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/colorMixing.ts)。
- [`packages/core/src/gpu/kit/colorStops.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/colorStops.ts)。

### E09 Glass

[主定义](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/shaders/Glass/index.ts)：`packages/core/src/shaders/Glass/index.ts`。

采用思想：Scene/child RTT sampled with SDF-slope refraction, RGB offset dispersion, tint/highlight/Fresnel; optional separable Gaussian intermediate.

端点/单位/结构语义：requiresRTT and child=true; blur and aberration crossing zero trigger structural recompilation; blur radius=blur*2; RTT samples premultiplied, effect math straight; first-lobe thickness for volumetric mode.

Cocos 重实现差异与必测：Implement Cocos RenderTexture ownership and Camera passes, not upstream compute runtime. Declare local blur kernel/edge/sample mapping and physical-lens limitations; count actual offscreen/blur/final passes.

主要 helper：

- [`packages/core/src/gpu/kit/effects/glass.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/effects/glass.ts)。
- [`packages/core/src/gpu/kit/blur.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/blur.ts)。
- [`packages/core/src/gpu/kit/blend.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/blend.ts)。
- [`packages/core/src/std/paint/materials.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/paint/materials.ts)。

## 公共语义不可机械搬运

1. **坐标**：std/reveal 文档使用 UV `0..1`、视觉 y 向下；GPU position transform 对 host position 应用一次 Y 翻转。`viewportSize` 是 backing device px；`logicalViewportSize` 是 CSS px。不能把 Cocos Camera 的 screen/UV 基准及 DPR 自动视为相同；冻结输入纹理朝向、SDF尺度、pointer转空间并分别测试。
2. **颜色**：上游 GPU 属性颜色转换默认目标 `p3-linear`，可切 `srgb-linear`；composer final tail 做 tone mapping 与 sRGB OETF。CPU属性 transform 并不等于GPU最终空间。Cocos 首批建议明确选线性 sRGB 工作空间并登记差异；不复制显示P3假设或重复OETF。E02 cosine thirds与E03 exact thirds不能随意合并称字节不变。
3. **Alpha**：上游效果math通常返回 straight RGBA，但RTT store与组合采样是premultiplied，Emboss/Glass/UV-remap显式unpremultiply。Cocos路径须以实际上传、材质输出和blend states确定转换，测试alpha=0与半透明邻域；不可从截图相似断定未双乘。
4. **Noise**：`gpu/kit/noise.ts`注明MaterialX noise / Bob Jenkins lookup3；u32溢出和逻辑移位有GPU/JS双实现差异，浮点公式之外的CPU直接计算不自动等价。另Fi-hash分族。使用不同hash/noise须标算法差异，不复用上游golden snapshot当本地证据。MaterialX/OSL 原始 BSD-3-Clause 与 Bob Jenkins Public Domain 已独立核查；Fi-hash 原作者许可仍未证实，禁止直接派生该分族。具体分发条件见下节，不能只凭root MIT覆盖所有来源。
5. **平滑边界**：部分Neon/Emboss/LiquidMetal使用反向` smoothstep(edgeHigh, edgeLow, x)`表达下降曲线；GLSL移植应转为有序边界的`1-smoothstep(edgeLow, edgeHigh, x)`并验证退化边界，不能依赖反向边界的未定义行为。这里是REFERENCE_ERROR移植风险，尚无Cocos ENGINE_BUG证据。
6. **动画**：上游 per-node `_animTime` 累积 `dt*speed`；speed=0暂停不回卷。采用Cocos的单一主循环/定步时钟，不能额外RAF；冻结固定step/time而不是墙钟截图。
7. **范围**：默认shape可为sphere3D/field compute，计划允许先用原生解析2D SDF证明rim等算法，但不得把缩窄形状支持/更少tap称全量上游等价。ThinFilm非物理光学模型、LiquidMetal非流体模拟。

## noise.ts 祖源许可补查（2026-10-09）

此节仅核查来源许可，未实现或执行上游代码。祖源文件另存于只读参考缓存，SHA/bytes/URL 见 [upstream-reference.json](upstream-reference.json) 的 `ancestorLicenseReview`；不计入原固定树的 59 文件。

| 分族 | 一手证据与结论 | 可执行边界 |
|---|---|---|
| MaterialX / OSL | [MaterialX 固定 v1.39.5 的 mx_noise.glsl](https://github.com/AcademySoftwareFoundation/MaterialX/blob/7b64921ef1d42f2d57871e9d2c43dc11f041f26b/libraries/stdlib/genglsl/lib/mx_noise.glsl) 明示来自 OSL，并携带 Sony Pictures Imageworks 2009–2010 完整 BSD-3-Clause 原通知 | 允许有通知的派生。保留原版权、三条条件与免责声明；源码分发保留源码通知，二进制分发附随文档/材料重现通知，不借原作者名义背书。移植文件标注修改；适配 shaders 的实现还保留 Shader Effects MIT。 |
| MaterialX 修改层 | [同一固定提交的 LICENSE](https://github.com/AcademySoftwareFoundation/MaterialX/blob/7b64921ef1d42f2d57871e9d2c43dc11f041f26b/LICENSE) 为 Apache-2.0 | 保守同时保留 Apache-2.0 全文及已有归属通知，按其 §4 标注修改文件与保留归属。根 NOTICE 精确 URL 返回 404，只说明根路径不存在，不能据此移除其他现存通知；后续扩大取码范围应检查其文件通知。此比较版本不等于已证明 shaders 实际取自该版本。 |
| Bob Jenkins lookup3 | [作者 lookup3.c](https://burtleburtle.net/bob/c/lookup3.c) 原文件明示 May 2006 / Public Domain，并允许任何用途 | 可独立移植作者原 hash，并保留作者及 Public Domain 来源说明。Public Domain 仅覆盖作者原作，不能将整个 MaterialX/OSL/shaders 改写层改标为 Public Domain。 |
| Fi-hash / @lumiey | shaders 固定文件仅一句 @lumiey/MIT；[benpm 镜像固定修订](https://gist.github.com/benpm/4f8ad4c320ca68e443c62bfa67755068/3aff41d16b00cb1279a5a820d30fc49b906cd736) 有 MIT SPDX 与 @lumiey 版权声明，但发布者不是原作者；[候选原作者页面](https://fragcoord.xyz/s/pxmcvnpc) 仅取回 SPA 外壳 | **本计划禁止直接派生 Fi-hash helper，直至原作者源码/许可证明补齐。** 镜像声明只能作线索；没有认定其侵权，也没有将其声明提升为原作者授权。默认使用独立 hash/noise 路线，明确 seed/梯度/输出差异，不能继承原 golden。 |

实施时按每个 helper 单独登记来源，不能整份 noise.ts 统一视为 MIT。若派生 MaterialX/OSL 的 GLSL/CPU helper，源码头留版权/SPDX/修改说明，发布 npm 或 bundle 时一并提供适用通知；仅把通知留在开发仓库而未随分发携带不满足二进制条款。本阶段的合并通知只是准备材料，没有宣称未来发布包已经接线。

镜像中的纹理/字体以及其他 IQ/Shadertoy 引用不在本次授权范围，不取用素材，也不把镜像整体 MIT 推导为各祖源全部获批。九类问题口径保持隔离：本次有 DOC_GAP（祖源通知遗漏）和 REFERENCE_ERROR（Fi 来源不足）；无 ENGINE_BUG/API_GAP/API_DX/EXAMPLE_GAP/AGENT_FAILURE/PERFORMANCE_GAP 新证据；下载问题仍属 INFRA_FAILURE。

实际补查命令：`git ls-remote` 固定 MaterialX tag → exit 0；`Invoke-WebRequest` 固定源码/许可、作者 lookup3 与固定镜像 → exit 0（根 NOTICE 请求 404 单独记录）；Node 本地核对 → exit 0（59 原树文件 + 5 祖源快照 SHA/bytes、MIT 首段/BSD 原通知/Apache 全文精确保留）；`npm run verify:doc-refs` → exit 0（169 docs / 1345 refs / unresolved 0）。浏览器、效果 Build 与上游 runtime 均未运行。

许可补查 **PASS（有明确路线边界）**：MaterialX/OSL 有通知派生与作者 lookup3 独立移植均可执行；Fi 逐字派生仍 BLOCKED，独立算法路线可继续由 Lead 审核。此状态不代表九效果许可无条件放行，更不代表任何 Engine/Agent Gate 通过。

## Composition / identity / Driver 的准确源码

- [`packages/core/src/gpu/composer.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/composer.ts)：CompositionIR、pass leaf→root顺序、map driver表达式、analytic remap pushdown/fallback、structural hash与final color tail。
- [`packages/core/src/gpu/scaffolds/uvRemapShader.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/scaffolds/uvRemapShader.ts)：单UvMap派生RTT片段及analytic坐标分支、mask/edge处理；partial blend通过坐标mix并不普遍等价于颜色mix（源码特注明Mirror区别）。
- [`packages/core/src/std/slots.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/slots.ts)：isZero/isValue/allOf/identityWhenever及crosses/recompileWhen；这些是结构触发信息，不保证本地pass自动消失。
- [`packages/core/src/std/warps.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/warps.ts)：warp map生产者，包括twirl与wave；wave类型/edge语义会进入分支。
- [`packages/core/src/types.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/types.ts)：PropDriver union：MapConfig / MousePositionConfig / MouseMapConfig / AutoAnimateConfig；映射、曲线、范围与easing的接口合同。
- [`packages/core/src/gpu/index.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/index.ts)：updateMouseDrivers、synthetic字段、spring smoothing/momentum、animatedTime累加及结构重编译；只读设计参考，禁止搬runtime。
- [`packages/core/src/gpu/kit/host/pointer.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/gpu/kit/host/pointer.ts)：首次有效pointer无巨大delta、缺失pointer语义、速度跟踪；CPU轨迹维护不代表按压/触点合同。
- [`packages/core/src/std/signal.ts`](https://github.com/shader-effects-inc/shaders/blob/dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a/packages/core/src/std/signal.ts)：pointer/pointerSpeed作为值图signal的来源。

UV Pilot候选选 **Twirl** 与 **WaveDistortion**（两者 `role: warp`），不是 **Swirl**（`role: generator`）。参数identity、边缘夹取、source filter/neighbor gather与资源采样的组合会限制fusion；实测pass/texture数量、独立CPU编码/GPUtimestamp/visual diff后才能提案。不得把IR存在当收益证明。

组合参考只列算法依赖：C01 Holographic+Emboss+Sparkle须明确生成层与输入滤镜的先后/alpha；C02 ThinFilm+Neon共享SDF的候选只有真实消费者后才抽象；C03 Glass+CursorTrail必须冻结场景采集是否包含trail以避免反馈；C04 NoiseDissolve须对image/procedural/rendered-layer分开做identity端点。这些均未实现/未测。

## 核查命令与状态

实际执行渠道：native subagent（Wave 0 A）。

- `Get-Content AGENTS.md`、`Get-Content ai/plans/shaders-absorption-task-plan.md`：exit 0，已读项目约束及全部计划。
- GitHub commit页面联网打开：固定提交可访问；Node fetch commit/tree API → 本地只读记录：exit 0。
- GitHub git/blob API逐文件取回、base64解码、重算`SHA1("blob <bytes>\0"+bytes)`对固定tree：exit 0。
- 原raw域请求中途 `ECONNRESET`：INFRA_FAILURE，未计Engine/Agent失败；使用同固定tree的git/blob API补齐。PowerShell两次brace path语法错误已纠正为准确路径，未改源码。
- 本地源码身份/9效果路径/JSON结构/许可证原字节核对：exit 0，详见机器清单；未运行build/browser/上游测试，因此六Engine Gate与Agent Gate均NOT_RUN。

## 发现分类与后续门槛

| 分类 | 发现 | 后续处理 |
|---|---|---|
| REFERENCE_ERROR | 单一v4.0.1/date不能解释core版本或npm发布时间 | 固定3个包版本与commit时间，不推断发布日期 |
| REFERENCE_ERROR | Holographic/LiquidMetal未声明seed | 本地seed须明确扩展与比较范围 |
| REFERENCE_ERROR | 反向smoothstep不能机械译成GLSL | 有序边界显式inverse + CPU/GPU边界合同 |
| REFERENCE_ERROR | Swirl不是UV distortion | Pilot使用Twirl/WaveDistortion |
| DOC_GAP | noise helper仅写祖源名称，未携带OSL完整BSD通知 | 已保留原通知；派生源码与发布包须携带版权/条件/免责声明 |
| REFERENCE_ERROR | Fi-hash仅镜像MIT header，无法证实原作者授权 | 不直接派生Fi分族；使用独立算法并明示不等价，或先补原作者来源 |
| INFRA_FAILURE | raw域ECONNRESET | git/blob API校验恢复；不影响来源审查结果 |

Wave 0 A 的PASS仅表示固定提交/包版本/许可证原文/9效果路径/原始字节索引与算法语义已形成可核查基线。Wave 0整体是否可推进由Lead结合Contract与capability检查决定；任何效果不得提升implemented/engine_verified/agent_verified/stable。
