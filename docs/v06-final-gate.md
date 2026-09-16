# V0.6 Final Gate（自动生成）

状态：**PASS**。生成时间：2026-09-16T23:23:24.572Z。

本文件由 `node tools/verify/v06-report.cjs` 从本轮证据生成，替代先前手工填写的全绿结论。

- Golden Reference：通过；EXPECTED_UNSUPPORTED 单独记账，不计入 Agent 分母。
- Catalog Runtime：100/100，分布 {"PASS":97,"EXPECTED_UNSUPPORTED":3}。
- Agent：9/9；First Compile：1，Type-B 分母 6；成功 repair 中位数 0。
- Recipe：总数 30，validated（含 stable）30，stable 20。
- Jest：28 suites / 201 of 201 tests；success=true。

## 待完成门禁


## 证据与复现

- `docs/evidence/v06-golden-dual-track.json`：双轨结果及完整 TrialRecord，指标使用唯一 aggregate()。
- `docs/evidence/v06-catalog-runtime-gate.json`：100 项结果。
- `docs/evidence/v06-review-gate.json`：本报告机器可读数据。
- `npm run verify:benchmark`：工具源码类型检查与真实行为回归。
- `node tools/benchmark/run-dual-track.cjs`：重跑 Golden 双轨（需要 Playwright）。
- `node tools/verify/v06-catalog-gate.cjs`：重跑 100 项 Reference。
- `node tools/verify/v06-report.cjs`：生成报告；未达门禁返回非零。

A001 是读取冻结参考实现的 scripted solver，仅证明工作流，不代表独立 LLM 能力。旧性能与生命周期 evidence 保留为历史记录，本轮未重测，不能替代当前缺失的 Recipe 证据。
