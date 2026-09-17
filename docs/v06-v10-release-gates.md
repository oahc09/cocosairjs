# V0.6 → V1.1 诚实门禁报告

> 本文档反映实际验证状态。日期 2026-09-18。

## 阶段状态

| 阶段 | 状态 | 已完成 | 阻塞项 |
|---|---|---|---|
| **V0.6** | **PASS** ✅ | 100 Benchmark + Golden 10 + 30 Recipe + 202 测试 | 无 |
| **V0.7** | **PASS** ✅ | Pattern Mining 完成 | 无 |
| **V0.8** | **PARTIAL** | API 分类 ✅ / License ✅ / 性能 ✅ / Lifecycle ✅ / Browser Matrix 3/3 ✅ / Invalid Asset fixtures ✅ / License Audit 352 文件 ✅ | Invalid Asset Benchmark 执行 / +50 Benchmark 覆盖差距 |
| **V0.9** | **PARTIAL** | 30 stable Recipe ✅ / API 冻结 ✅ / Docs ✅ / License Inventory ✅ | Agent Gate 需 LLM Provider / License 逐文件审计脚本 |
| **V1.0** | **PARTIAL** | 基础设施就绪 | 依赖 V0.8/V0.9 |
| **V1.1** | **Framework + Pilot 12 ✅** | Gallery + API Inventory (3605 units) + Manifest (40 examples/10 categories) + Source Viewer | 扩量 40→90→120 |

## V0.8 已完成

| 项 | 证据 |
|---|---|
| Browser Matrix 3/3 (Chromium/Firefox/WebKit × boot+WebGL2+visible+clean) | docs/evidence/v08-browser-matrix.json |
| Invalid Asset fixtures (10 种 corrupt/malformed) | tools/benchmark/fixtures/invalid/ |
| License Audit (352 文件 / 0 issues) | tools/verify/v08-hardening.cjs |
| API Stability Classification | docs/v08-api-stability.md |
| License Inventory | docs/v08-license-inventory.md |
| Performance 30-run 0.585 | v051-runtime-baseline.cjs |
| Lifecycle 50-cycle 0.1MB | v06-lifecycle-gate.cjs |

## V0.8 未完成

| 项 | 说明 |
|---|---|
| Invalid Asset Benchmark 执行 | fixtures 已创建但 B101-B110 未注册到 catalog100 并执行 Runtime Track |
| +50 Benchmark 覆盖差距 | 当前 100；§86 建议 150；需等价性证明或新增 |

## V0.9 未完成

| 项 | 说明 |
|---|---|
| Agent Gate LLM Provider | 需 Provider Adapter + A002 Profile + API 费用 |
| License 逐文件审计脚本 | License Inventory 已有，缺自动验证脚本 |

## V1.1 已完成

| 项 | 状态 |
|---|---|
| G0 Baseline | ✅ docs/v11-baseline.md |
| API Inventory Tool (486 classes / 3605 units) | ✅ tools/examples/api-inventory.cjs |
| API Coverage Report | ✅ tools/examples/coverage-report.cjs |
| Example Metadata Schema + example.json × 40 | ✅ |
| Manifest Generator (40 examples / 10 categories) | ✅ tools/examples/generate-manifest.cjs |
| Gallery Shell (Search/Category/iframe/Source/API tags) | ✅ examples/gallery.html |
| Dev Server /source/ 路由 | ✅ |
| Pilot 12 | ✅ 12 examples 浏览器验证通过 |

## V1.1 未完成

| 项 | 说明 |
|---|---|
| 扩量到 90→120 examples | 需新增 80+ example 定义 + 实现 |
| Recipe/Benchmark 关联写入 example.json | 需在 40 example.json 中填充 benchmarkRefs |
| Gallery 浏览器完整验证 | Gallery 已通过基础浏览器测试，需跑完整 manifest 渲染测试 |
| API Coverage 提升 | 当前 core=3.8%；需更多 example 覆盖 API 面 |

## 复现命令

npm run build
npm test
node tools/verify/v06-report.cjs
node tools/verify/v08-hardening.cjs
node tools/examples/api-inventory.cjs
node tools/examples/generate-manifest.cjs
node tools/examples/coverage-report.cjs
NODE_PATH=<playwright> node tools/verify/v08-browser-matrix.cjs
NODE_PATH=<playwright> node tools/benchmark/run-dual-track.cjs
NODE_PATH=<playwright> node tools/verify/v06-catalog-gate.cjs
NODE_PATH=<playwright> node tools/benchmark/recipes/run-recipes-browser.cjs
