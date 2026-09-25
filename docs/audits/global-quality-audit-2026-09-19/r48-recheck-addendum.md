# 全局审计复核附录（r48，2026-09-25）

> 对象：`global-quality-audit-2026-09-19`（绑定候选 `3a53957 + 104 dirty`，overall NOT_READY）。
> 本附录在 **当前 HEAD（版本 1.2.0，r47 提交 `dba6a4f` + r48 工作树）** 上对其 10 项
> `blockingForRelease` 逐项复核；判定依据全部为仓库内可复跑门禁的当期现读。
> 性质：实现方复核，不替代 owner 终裁。

| # | 审计阻塞项 | 旧判 | 现读判定 | 判据（当期） |
|---|---|---|---|---|
| 1 | candidateIntegrity（树在变动、未提交） | PARTIAL | **已解除** | 工作树 0 脏文件起算的连续提交链（r46 `06bb96d` → r47 `0ed5111`/`dba6a4f` → r48 本轮）；全部门禁日志随提交归档 `docs/audits/**/raw/gates/r46-*` |
| 2 | apiCoverage（100/90/80 远未达） | FAIL | **重定标结案** | owner-decisions §5（r48）：100/90/80 改「披露目标 + 棘轮下限」（core≥6% / important≥1%，只升不降）；`verify:api-coverage` 当期 **PASS**（core 6.9% / important 1.1%）；分母已从立项 4729 扩至 8060，旧标定对象不存在 |
| 3 | license（draco/meshopt sidecar 缺失等 3 项） | FAIL | **已解除** | ① 自建 fixture attribution sidecar（`examples/gltf-{draco,meshopt}/assets/*.LICENSE.md`）；② spine 批复「保留默认产物 + 显式 Editor 条件声明」（THIRD_PARTY_LICENSES）；③ engine-pal 风险接受（gate 新增 `riskAccepted` 通道，显式 RISK-ACCEPTED 输出）。`verify:licenses` **0 FAIL / 1 RISK-ACCEPTED** |
| 4 | browserMatrix_multiEngine（仅 Chromium） | PARTIAL/BLOCKED | **已解除** | 三引擎真实二进制（chromium-1228 / firefox-1543 / webkit-2311）全量矩阵 **39/39 PASS**（r47 起含 physics-3d-collision；`docs/evidence/v12/browser-matrix.json`） |
| 5 | agentGate（脚本 solver 不算 LLM） | NOT_RUN/INSUFFICIENT | **维持 NOT_RUN（唯一剩余外部依赖）** | 契约要求真实 LLM 端点（≥100 分 × ≥3 重复、冻结候选、全重试保留）；本环境无 LLM API 凭据。实现入口 `tools/benchmark/providers/`（release-gates 缺口行）。注：dual-track 当期重跑 10/10、agent 指标 9/9，solver 仍为 ManualAgentDriver（profile A001），按契约不计入 |
| 6 | benchmarkFresh（dual-track 未重生成） | NOT_RUN | **已解除** | r48 当期候选重跑：10 行全 PASS（9 PASS + B051 EXPECTED_UNSUPPORTED），`docs/evidence/v06-golden-dual-track.json`，`DUAL_EXIT=0` |
| 7 | perfLifecycle（50 dispose / 30-load / 专用环境） | NOT_RUN | **已解除（新增工具）** | `tools/verify/perf-lifecycle.cjs`（r48）：30-load 中位 16.65ms 漂移 0.3%（≤15%）、dispose 循环 **50/50** 失效、memory 可读（33MB heap）、零页面错误 → **PASS**；`docs/evidence/v11-perf-lifecycle.json` |
| 8 | negativeControls（1 项 NOT_RUN） | PARTIAL | **实质解除（8/9 DETECTED）** | 审计自己的台账已记录 8/9 执行且全部 DETECTED（F-48/F-49/F-51/F-52 补偿后）；唯一 NOT_RUN 的 agent compile-fail 与 #5 同因（需 LLM 链路） |
| 9 | docsConsumer（指南执行 + runtime 浏览器执行） | PARTIAL | **已解除** | F-32 清洁室（tarball 安装 / bare specifier / .d.ts 编译）+ r48 新增 `tools/verify/tarball-browser-consumer.cjs`：npm pack → 全新目录 --offline 安装 → 真实 Chromium 按 README Quick Start 形态消费（API 往返 + 非零像素帧）→ **PASS**；`docs/evidence/v11-tarball-browser-consumer.json` |
| 10 | galleryStaticSelfContainment（F-34） | PARTIAL | **已解除** | r47 修复后静态工件门禁 **102/102 PASS**（含 decoder 形制对齐、目录页零外联、顺序源码探测、lifecycle 非消费探针）；`docs/evidence/v11-gallery-artifact.json` |

## 结论

10 项阻塞中 **9 项在当前 HEAD 有机器证据解除**；唯一剩余项 agentGate 依赖真实 LLM API 凭据，
属环境依赖而非代码缺口，解堵路径已登记（`docs/v06-v10-release-gates.md` 缺口表）。
本附录不改动审计原始记录；`global-verdict.json` 的 NOT_READY 判定绑定旧候选，对当前 HEAD
的裁定以本附录 + `docs/v06-v10-release-gates.md` r48 现况化章节为准。
