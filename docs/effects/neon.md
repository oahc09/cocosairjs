# E04 Neon 霓虹管

Wave 2 独立原生重实现。参考 shader-effects-inc/shaders@`dbfd42abe3…`（MIT），来源与差异见 [示例 UPSTREAM.md](../../examples/shader-neon/UPSTREAM.md)。示例：`/examples/shader-neon/`。

## 采纳的算法语义

- **5 点 stencil**：中心 + ±eps 四向 SDF 采样（eps=`0.008+cornerSmoothing*0.03`），`sdf = mix(sC, 五点均值, cornerSmoothing)`，梯度为中央差分。
- **rim band 管体**：管体是 SDF 零交叉附近的带（空心玻璃管），不是填充盘。内掩模 `1-smoothstep(t-softPx, t+softPx, -sdf)`、外掩模 `1-smoothstep(-softPx, softPx, sdf)`——参考实现的逆边 smoothstep（edge0>edge1，GLSL 未定义行为）全部改写为显式有序逆。
- **半圆截面照明**：`z=sqrt(t(2-t))`、水平衰减 `(1-t)`，法线 `(gn·(1-t), z)`；Blinn-Phong（lz=0.7 常数，法向/半向量常数预计算）+ `ambient 0.12 + diffuse·0.55 + z·0.35` 自发光 + 镜面 `pow(NdotH, exp2(8-7·size))`。
- **热核**：`smoothstep(0.55,1,depthNorm)·hotCoreIntensity·flowMod`，核色 `mix(tubeColor, white, 0.75)`；`hotCoreIntensity=0` 时该层恒零。
- **双层指数外晕**：`(exp(-12d/R)·0.7 + exp(-4d/R)·0.35)·glowIntensity`，外侧 `smoothstep(-0.003,0.003,sdf)` 门控；`glowIntensity=0` 时该层恒零。alpha=`max(tubeMask, glowMasked·0.6)`。
- **远端硬零**：`sC > glowR·1.5 + softPx + smoothEPS` 时输出精确 (0,0,0,0)，透明底 RT 直读验证。
- **flicker/flow**：`sin(17.13t)+0.5sin(31.71t)+0.3sin(47.29t)` 对 `mix(-2,0.8,amount)` 阈值；flow 是场空间 `atan2` 角向 `2θ+ωt` 扫带。`flickerAmount=0` 恒亮、`flowAmount=0` 恒 1（确定性边界）。
- **颜色格式链（RGBA8 边界）**：hex 经 sRGB→linear 解码后进 uniform；着色全程 linear。`straightLinear` 保持数学 HDR 结果（通道可 >1 或为负），供算法级 oracle 使用，绝不在数学层全局 clamp。
  1. 线性诊断 rgba8（UNORM）RT 关混合直读：存储值 = `round(clamp01(x)·255)`，HDR 值饱和到 255，远场精确 (0,0,0,0)。
  2. 预览写入定点默认帧缓冲：OpenGL ES 先把 OETF 后的片段颜色转为目标的定点表示（clamp [0,1]），再做 `SRC_ALPHA/ONE_MINUS_SRC_ALPHA` 混合，最后整帧写入再 clamp+量化。display 模型按 `round(255·(clamp01(encode(x))·alpha + bg·(1−alpha)))` 精确复现，不以假设默认帧缓冲为 HDR。

## 验证面

2026-10-10，当前 [E04 六维 Gate](../evidence/shaders-absorption/e04-neon-current-gate.json) 为 PASS；范围限于两个解析形状及冻结验收合同。Orca Worker 小三负责实现与审查修复，Lead 负责独立回归、实际浏览器采集和裁定。Wave 2 整体及 Agent Gate 仍 NOT_RUN；Gallery 桥接的单独 harness 验收也没有由此报告代替。

| 维度        | 内容                                                                     | 状态               |
| ----------- | ------------------------------------------------------------------------ | ------------------ |
| Build       | strict tsc + esbuild bundle + 三浏览器实际 GLSL 编译                     | PASS               |
| Runtime     | 可信控件、原生 pacer、同页 resize、重建与终态                            | PASS（三浏览器）   |
| Visual      | 39 组真实 compositor PNG + 39 组透明底 RGBA8 读回；另有三张 resize PNG   | PASS（±2 码值）    |
| Boundary    | 每引擎 104 参数案例 + 6 类非法输入整批拒绝                               | PASS（312 + 18）   |
| Resource    | 每引擎 100 轮，三份资产 refs 1→0、解绑、失效、内存计数回基线             | PASS（300 轮）     |
| Performance | 三引擎 × 720p/1080p/mobile DPR2，真实 HTTP 隔离、实际 backing 与时钟标定 | PASS（9 profiles） |

独立审计接受两份真实正例，再拒绝 [22 种内存篡改](../evidence/shaders-absorption/e04-neon-actual-audit.json)，未增加浏览器运行。最新 focused Jest 为三套 113/113，包含 Lead 的 15 条独立审查回归；全仓库测试库存仍是此前执行结果，不由 focused 通过升级。

性能窗口各约 6 秒，先剔除 30 warmup 帧，保存全部 steady 原始样本。Chromium 三 profile 的 GPU timestamp 中位数分别约 0.256/1.033/0.867 ms；Firefox/WebKit 的该扩展不可用，不以 CPU 数据替代。AFTER_DRAW 间隔中位数为 Chromium/Firefox 约 16.64–16.68 ms、WebKit 约 19.12–20.44 ms；这不是显示器呈现帧率或 60 FPS 承诺。CPU gfx envelope 包含立即 GL 派发，queue 指标仅为记账；引擎分配字节、GL 对象计数和不可观测的物理 VRAM 分开记录。mobile 是桌面 CSS 390×844/DPR2 模拟，非实体 iPhone。

前两次失败尝试保留在 Gate 的 historicalAttempts：RGBA8 oracle 未表达目标饱和，以及采集器控件/实例/ready 接线错误均为 AGENT_FAILURE，修复后重采，没有修改着色算法、删案例或放宽容差。完整固定十三项交付见 [Neon 六维交付](neon-validation-delivery.md)。

工具：[oracle](../../tools/verify/shaders-neon-oracle.cjs)（分层 CPU 复算）、[collector](../../tools/verify/shaders-neon-browser.cjs)（六门采集/`--verify`）、[performance](../../tools/verify/shaders-neon-performance.cjs)（冻结 profile 校验）。

## 支持范围（明确缺失）

仅 circle / rounded-box 两个解析 SDF；无上游 SDF 贴图（`shapeSdfUrl`）、shape JSON 平台、`sphere3D` 等形状目录、volumetric 视深折痕路径、center/origin 参数面与编辑器 UI 元数据。不声称完整上游 shape 平台。
