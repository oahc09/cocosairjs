# 当前 SDK 证据链刷新：固定十三项交付

## 1. Goal

2026-10-11：九个母效果与四个组合的当前源码、示例规格、SDK 和 Wave1→Wave4 前置链刷新已完成。当前 Engine 链全 PASS，[Wave4 当前 SDK Gate](../evidence/shaders-absorption/wave4-current-sdk-r2-gate.json) 的 `nextWaveEligible=true`，进入 [Wave5](wave5-kickoff.md)。Agent 与独立 Gallery 另列，不代表项目或发布完成。

## 2. Upstream references

上游仍固定为 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。参考源码、下载回执、许可通知与独立 oracle 沿用各效果的真实闭包，未执行上游 runtime、TypeGPU 或额外渲染 Canvas。

## 3. CocosAirJS APIs used

此次刷新不新增引擎 API。效果仍使用原生 Scene、Node、Camera、MeshRenderer、Material、EffectAsset、Texture2D、createAirRenderTarget 和 createStepClock。新增 reset 采集 helper 属于验证工具，不进入 runtime。

## 4. Implementation details

执行渠道：Lead 负责串行真实采集、生产门禁和汇总；Orca Worker 小三修复 reset 采样时序，并对新驱动做独立只读审查。

普通模式 reset 的页面 handler 同步归零后，原生 pacer 可能在 Playwright 下一次 evaluate 前推进时间。新增一次性 click listener 在真实页面 handler 后立即记录 snapshot，严格 `time === 0` 的合同保持不变。随后 E03/E04/E05 三种浏览器的真实功能采集均通过；后续元数据变化另行使这些报告的身份失效。

[当前 SDK 链校验器](../../tools/verify/shaders-current-sdk-wave-chain.cjs) 重新调用叶级生产 validator，核对真实 OS 回执、冻结身份、源码与参考指纹、截图、原始报告篡改审计，以及前置 Wave 的当前路径。Wave3 递归验证当前 Wave2，Wave2 验证当前 Wave1。

[Wave4 当前 SDK 校验器](../../tools/verify/shaders-current-sdk-wave4-gate.cjs) 将四个组合的真实叶级验证与当前 Wave3 链关联。历史 BLOCKED 汇总保留，新的 Gate 使用独立路径。

## 5. Tests performed

Lead 四套聚焦合同真实通过：110/110，包括链校验器 59、当前 SDK Wave4 23、既有 Wave4 状态隔离 19、reset 采集 9。这些是 NODE_CONTRACT，不能充当浏览器像素或性能证据。

后续 E08 计数回归新增一例：链校验器的作用域必须与独立 Cursor Trail `scopeOf` 完全一致，包含可信指针与触摸两项。链套件真实 60/60 通过，聚焦 Prettier 检查通过；未重跑其余三个已通过套件。

Orca Worker 的只读审查实际完成 10 个文件语法检查与小型 require 核对，未发现确定性接线错误；零写入、零浏览器、零性能、零构建、零 Jest。Lead 的测试与采集结果不归为 Worker 执行。

## 6. Screenshots / visual evidence

当前 Wave1 r2 已通过：705 个实测案例、18 个新采集的独立 Gallery 生命周期条目；六份效果报告重新通过生产校验。先前规格漂移后的 Gallery 已重采。

Wave2 r2 功能采集三效果、三浏览器均自然退出 0，并通过当时的生产检查。2026-10-11 09:24:28 UTC 的并发规格晋级改变了三个 `example.json`，后续汇总拒收；不将这批截图重标为当前 PASS。

后续重新采集的当前 Wave2 r3 汇总已经生产验证 PASS：117 个视觉案例、132 张截图。当前 Wave3 r2 汇总亦 PASS：120 个视觉案例、141 张截图。截图包含时间与 resize 额外拍摄，不等于算法案例数量。

## 7. Performance evidence

Wave2 r2 的 27 个性能配置在采集时全部通过，三个性能子进程自然退出 0，SDK 指纹不变。随后的规格闭包失效同样要求完整重采。

后续重新采集并重验的当前 Wave2 r3 包含 27 个性能配置，当前 Wave3 r2 包含 36 个配置；已通过当前 SDK 与前置链生产验证。

新的性能采集等待外部示例验收与 Jest 结束，按冻结配置逐窗口串行运行；不能把同时进行其他验收的窗口当成独占性能基准。GPU timestamp 不可用、物理 GPU 内存不可用和 CPU 插桩开销沿用实际披露。

## 8. Resource/lifecycle evidence

每效果原有资源、引用、RT 独立 detach/dispose、终态与幂等合同不变。当前 Wave1 Gallery 的 18 条独立运行态证据已重新冻结并通过。当前 Wave2、Wave3 各含 900 个资源循环；Wave2–Wave4 的独立 Gallery 和 Agent Gate 保持 NOT_RUN。

## 9. API DX gaps

本轮无新增确证 ENGINE_BUG。reset 往返时序属于 AGENT_FAILURE。并发全库验收晋级修改规格导致身份失效，是共享工作区的证据采集协调问题，不能解释为 shader 算法或 SDK 回归。

## 10. Workarounds

刷新驱动保留并发产生的示例规格，不回退、不锁文件、不终止外部进程。先等待规格写入结束且连续稳定 60 秒，再冻结输入；各阶段核对元数据摘要，发生漂移即停止。所有新报告、日志、OS 和冻结文件使用 `wx`，失败尝试保留。

## 11. Proposed engine changes

本轮不修改引擎或重建 SDK。当前 module/dts/npm 分别为 `69127f39…`、`5b67a560…`、`b7771393…`，来自独立 WebGL2 gfx 修复。

## 12. Validation status

最终终态：Lead r6 master 于 2026-10-11 12:01:50 UTC 自然退出 0，两阶段均 exit=0/signal=null/error=null/metadataUnchanged=true。当前路径为 Wave1 r2、Wave2 r3、Wave3 r2、Wave4 r2。四级链由生产验证器实际重算 PASS；Orca Worker 终态独立只读复核同样 PASS。

Wave4 当前范围：72维、198视觉案例、990参数边界、75非法输入拒收、1200资源周期、18活 resize、234截图、54性能配置；17424个稳态帧。四叶审计 56+44+65+44=209项实际拒收，当前汇总元数据24项拒收。Worker额外复核3项汇总克隆拒收，仅检查3张PNG存在可读，未额外进行独立像素复算。完整像素判定来自生产校验器对真实报告的重算。

以下为保留的恢复过程：

截至 2026-10-11 11:01 UTC：新的 Wave1 r2、Wave2 r2 已实际通过；Wave3 六个采集子进程均自然退出 0、生产 `validateFiles` 通过。汇总在 E08 叶级检查失败：通用计数器漏了 `trustedPointerCases` 与 `trustedTouchCases`，并非实际行数不足。Wave3 汇总文件当时尚未生成，Wave4 未启动，master 自然退出 1，失败日志保留。

Lead 已修复计数器并启动独立 r3 恢复队列。校验器源指纹因此变化：以当前生产验证重新核对 Wave2 既有原始报告和叶级 Gate，生成新的 `wave2-current-sdk-r3-gate.json`，保留原 r2 汇总；Wave3 绑定此 r3 前置，复用经重验通过的六份原始报告、生成其 r2 汇总。已有审计再次执行变异并比对，已有文件不覆盖。之后完整刷新四组合，再生成 Wave4 r2 当前链。恢复队列终态仍待验收，不能提前声称全链 PASS。

恢复时发现审计内存诊断 `NaN` 与其 JSON 保存值 `null` 的比较差异；仅在生产验证已经拒收变异之后，以同一 JSON 保存形式比较审计。当前 Wave2 r3、Wave3 r2 已由 r4 恢复队列生产接受，分别通过 15 项汇总元数据篡改拒收。旧失败 master 与审计保留。

Wave4 首个 C01 功能重采自然退出 1，唯一错误为 Chromium 普通模式 reset 快照时间已推进到 0.0165 秒。Orca Worker 将同一真实 click 冻结采样修正接入 C01/C02/C04，并纳入输入闭包，报告聚焦 Node 合同 169/169 通过；C03 已有权威 resetReceipt，不修改。Lead 检查接线与闭包后，于 2026-10-11 11:38 UTC 启动 r5 master：使用新 W4 r3 原始报告路径执行四功能、四性能阶段，再签发当前 Wave4 r2 汇总。此队列尚未终态，浏览器修复仍待新证据确认。

未 stage、commit、push、部署或重写全库库存。外部全库验收结果由其原执行渠道交付，本刷新不代宣其完成状态。

## 13. Known limitations / next step

当前开始 Wave5 公共能力、同源文档与两个 UV/Pass Fusion 实测 Pilot。现有通过的冻结输入保持不变，新增能力需单独验证；正式优化必须先取得两个真实案例的前后指标。实体设备、长时、多标签页、Agent Benchmark 和整个项目完成度仍未验收。
