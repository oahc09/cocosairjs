# V0.6 Final Gate（自动生成）

状态：**BLOCKED**。生成时间：2026-09-17T22:55:44.748Z。

本文件由 `node tools/verify/v06-report.cjs` 从本轮证据生成，禁止手工填写全绿结论。

- Golden Reference：通过。
- Catalog Runtime：100/100，分布 {"PASS":97,"EXPECTED_UNSUPPORTED":3}。
- Agent：9/9；First Compile：1，Type-B 分母 6；成功 repair 中位数 0。
- Recipe：总数 30，validated（含 stable）30，stable 30；evidence failures 30。
- Jest：28 suites / 202 of 202 tests；success=true。

## 待完成门禁

- 运行证据与当前源码哈希不一致，需要重跑。
- Recipe 完整场景证据未通过：R001: sourceHash mismatch；R002: sourceHash mismatch；R003: sourceHash mismatch；R004: sourceHash mismatch；R005: sourceHash mismatch；R006: sourceHash mismatch；R007: sourceHash mismatch；R008: sourceHash mismatch

## 证据与复现

- `docs/evidence/v06-recipes.json`：30 条 composite browser run。
- `docs/evidence/recipes/`：逐 Recipe 截图与状态快照。
- `node tools/benchmark/recipes/run-recipes-browser.cjs`：重跑 Recipe。
- `node tools/verify/v06-report.cjs`：严格校验证据并生成本报告。
