# C02 Film+Neon 彩边霓虹 Logo

Wave 4 第二个原生组合。上游 `dbfd42abe3…`（MIT），各母效果已在 E02/E04 独立验收；组合语义为本地设计，见 [示例 UPSTREAM.md](../../examples/shader-film-neon/UPSTREAM.md)。

## 组合语义（本地冻结）

- **次序**：Neon over ThinFilm（非交换）。各层计算 **straight linear RGBA**：
  - ThinFilm（E02 合同）：fwidth coverage AA、analytic gradient normal、rim=(1−depth)²·inside、光谱相位。
  - Neon（E04 合同）：5 点 diamond stencil（eps=0.008+cs·0.03）、半圆截面法线、Blinn-Phong lz=0.7、热核、双指数外晕、两像素外精确零。
- 合成：**premultiplied source-over** → `outA = neonA + filmA·(1−neonA)` → alpha > 0 **安全除法**回 straight（正 α 除，α=0 单独零，HDR 保留） → **显示 OETF 一次**（RGBA8 定点目标先 clamp 再 SRC_ALPHA 混合）。透明 rgba8 RT 关混合直读 straight 值。
- **层开关真 identity**：`filmEnabled='off'` → film 层 straight RGBA 恰 (0,0,0,0)，合成=neon alone；`neonEnabled='off'` 同理。数值 RGB=0 但 alpha≠0（glow 尾部）不自动 identity。
- **共享解析 SDF**：同一 circle/rounded-box 函数供两层，初始共同域。E02 coverage 与 E04 stencil 的数值差异保留（不合并）。
- 支持参数子集：E02 的 7 个薄膜参数 + E04 的 12 个霓虹参数 + 共享 shape + 两层开关 = 23。flicker/flow 冻结为 0。

## 验证面

| 维度        | 内容                                                                                                | 状态 |
| ----------- | --------------------------------------------------------------------------------------------------- | ---- |
| Build       | strict tsc + esbuild bundle + 生成器元数据语义测试                                                  | PASS |
| Runtime     | create/update/resize/pause/resume/destroy/recreate + 可信控件 + 层开关                              | PASS |
| Visual      | 11 案例×DPR1 + 2×DPR2（film-off/neon-off/both-off/zero-opacity/zero-glow 等），PNG+透明底 RT 双证明 | PASS |
| Boundary    | 114 冻结合法边界 + 6 类非法整批拒绝，每引擎各一组                                                   | PASS |
| Resource    | 每引擎100轮单通道实例（3引用），共300轮                                                             | PASS |
| Performance | 3 profile×3 引擎（单遍合同）；须 `--authorization`                                                  | PASS |

2026-10-10当前范围见[六维Gate](../evidence/shaders-absorption/c02-film-neon-current-gate.json)及[十三项交付](film-neon-validation-delivery.md)。34输入+6参考同闭包，48PNG/39标准视觉；Wave4整体、独立Gallery和Agent Gate仍NOT_RUN。

工具：[组合 oracle](../../tools/verify/shaders-film-neon-oracle.cjs)（读 E02/E04 母 CPU 函数+独立合成，不读 GLSL）、[collector](../../tools/verify/shaders-film-neon-browser.cjs)、[performance](../../tools/verify/shaders-film-neon-performance.cjs)。

## 支持范围（NOT_SUPPORTED 明确披露）

本地组合设计，不称上游 Logo 预设。仅 circle/rounded-box 共享解析 SDF；flicker/flow/neon scale/rotation 独立参数不在子集。
