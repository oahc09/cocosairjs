# V0.6 Final Gate（自动生成）

状态：**PASS**。生成时间：2026-09-19T13:53:11.424Z。

本文件由 `node tools/verify/v06-report.cjs` 从本轮证据生成，禁止手工填写全绿结论。

- Golden Reference：通过。
- Catalog Runtime：100/100，分布 {"PASS":97,"EXPECTED_UNSUPPORTED":3}。
- Agent：9/9；First Compile：1，Type-B 分母 6；成功 repair 中位数 0。
- Recipe：总数 30，validated（含 stable）30，stable 30；evidence failures 0。
- Jest：29 suites / 207 of 207 tests；success=true。
- 证据 revision：HEAD 33b4281625fd2b0b6e5bad7922d8dfb4894c75dd，记录值 e06d29880b398c43d318eedee43c32941dd4eb97 / 33b4281625fd2b0b6e5bad7922d8dfb4894c75dd，无法归因 0 项。

## 待完成门禁


## 证据与复现

- `docs/evidence/v06-recipes.json`：30 条 composite browser run。
- `docs/evidence/recipes/`：逐 Recipe 截图与状态快照。
- `node tools/benchmark/recipes/run-recipes-browser.cjs`：重跑 Recipe。
- `node tools/verify/v06-report.cjs`：严格校验证据并生成本报告。
