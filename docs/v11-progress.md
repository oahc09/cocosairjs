# V1.1 Examples Gallery & API Coverage — 进展

> 记录 V1.1 执行进展。基线见 `docs/v11-baseline.md`。日期 2026-09-19。

## Example Specification 体系（2026-09-19 补充执行规范落地）

详见 `docs/v11-example-specs.md`。要点：

- **44 个 Example 全部 specStatus = frozen**（44 = 40 存量 + 4 个新增 Pilot 示例），
  规格零问题（`docs/evidence/v11-spec-validate.json`）
- 28 个空占位示例补全为真实现；Pilot 12 缺口新增
  interaction-click / runtime-asset-release / mesh-multi-material / gltf-clearcoat
- API 精确绑定：704 条 §12 apiEvidence（行号自动定位 + 漂移检测）；
  primary/supporting/claims 逐字命中 `docs/example-api-inventory.json`
- 门禁：`tools/examples/spec-validate.cjs` + `spec-evidence.cjs` +
  jest `smoke-29-examples-spec.test.ts`（冻结/证据/§23 裁剪/篡改检测）
- Gallery（§19-22）：What you'll learn / APIs Used / Expected Result / Validation Status
- files.json 按 §23 裁剪为 Gallery 字段；coverage-report 改读 `api.claims`

## Examples 浏览器验证（G-Gate 证据）

- 运行器：`tools/verify/v11-examples-verify.cjs`（复用 Recipe Gate 同款 `BrowserRuntime`：
  Fresh Build（tsc 语法/类型检查 + esbuild bundle）→ 每 Example 独立静态服务 → Fresh Browser Context）
- 证据：`docs/evidence/v11-examples-verified.json` — **43/43 PASS**（2026-09-19，单次完整运行；
  44 − 1 个 requiresDevTools 示例（automation，由 DevTools 门禁覆盖））
- 截图工件：`docs/evidence/examples/<id>.png`（43 张，SHA-256 记录在 evidence 内）
- 判定标准：scene 节点 > 0 + 零运行时错误 + 截图非空；`bench.mode=ui-shell` 的目录页
  （gltf-catalog，无 GameCanvas）改为验证 DOM UI 选择器（`#model-list .model-row`）渲染 + 零页面错误

## API Coverage（基线，目标差距）

- `tools/examples/api-inventory.cjs`：4729 覆盖单元（core 717 / important 793 / advanced 3219）
- `tools/examples/coverage-report.cjs` → `docs/api-coverage-report.json`
- 当前：core 42/717（5.9%）· important 6/793 · advanced 8/3219 — 目标 core 100% verified /
  important ≥60% / advanced ≥30%，差距以新增示例补足（内容型工作，按 Wave 推进）

## Manifest

- `examples/files.json`（single source of truth，§23 裁剪）：44 examples / 14 categories，
  由 `tools/examples/generate-manifest.cjs` 生成，已含 `bench` 合同字段透传
