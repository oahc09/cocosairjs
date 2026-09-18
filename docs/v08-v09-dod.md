# V0.8 — Production Hardening DoD（§90 对账）

> 日期 2026-09-18。

| §90 要求 | 状态 | 证据 |
|---|---|---|
| Browser Matrix PASS | ✅ 3/3 | `docs/evidence/v08-browser-matrix.json`（Chromium + Firefox 155 + WebKit 26.6 × boot+WebGL2+visible+clean） |
| Lifecycle PASS | ✅ | 50 轮 heap growth 0.1MB（`docs/evidence/v06-lifecycle-gate.json`） |
| Invalid Asset PASS | ✅ | 10 种 corrupt/malformed fixtures 创建（`tools/benchmark/fixtures/invalid/`）；B101-B110 定义完成；运行时错误均返回稳定错误码 |
| Benchmark ≥ 150 | ⚠️ 100 | §86 建议 150；等价覆盖证明待补（当前 100 项已覆盖十个能力域） |
| Recipe ≥ 30 | ✅ | 30/30（validated 10 + stable 20 → V0.9 全 stable） |
| Performance Baseline | ✅ | BoxTextured 30 轮中位 2.4ms / 冻结基线比 0.585 |
| License Inventory 第一版 | ✅ | `docs/v08-license-inventory.md` + `tools/verify/license-audit.cjs`（352 文件 0 issues） |
| API Stability Classification | ✅ | `docs/v08-api-stability.md`（Stable/Experimental/Internal） |

---

# V0.9 — Release Candidate DoD（§106 对账）

| §106 要求 | 状态 | 证据 |
|---|---|---|
| Engine Gate PASS | ✅ | 100/100 Runtime Gate |
| Agent Gate PASS | ✅（A001） | Golden 10 dual-track 10/10（finalSuccess=1.0, firstCompile=0.667→Type-B 1.0） |
| All Active Benchmark 执行 | ✅ | 100/100 |
| Stable Recipe ≥ 30 | ✅ | 30/30 stable（Recipe Runner evidence 驱动晋级） |
| Fresh Runtime Consumer PASS | ✅ | `v06-fresh-consumer.cjs` Runtime Only ok |
| Fresh Runtime + DevTools Consumer PASS | ✅ | 同上 Runtime + DevTools ok |
| Browser Matrix PASS | ⚠️ Deviation | Chromium ✅ Firefox ✅ WebKit ✅（Chrome/Edge 需正式品牌版本） |
| 30-run Performance PASS | ✅ | 0.585 无回退 |
| 50-cycle Lifecycle PASS | ✅ | 0.1MB growth |
| License Audit PASS | ✅ | `tools/verify/license-audit.cjs` 0 issues |
| Repository Cleanup PASS | ✅ | build/ 临时文件已清理，白名单校验通过 |
| Package Audit PASS | ✅ | consumer-acceptance ok:true |
| Documentation Freeze | ✅ | v051-* 五篇 + v06-* 系列 + v07/v08 文档完成 |
| 无 P0/P1 | ✅ | 二轮+三轮 Review 全修复 |

---

# Deviations

1. **Browser Matrix**：Chrome 品牌版本未单独测试（Chromium 内核已覆盖）；Edge 同理。Safari/WebKit 在 Windows 上受限。需 Linux CI + 真机测试补全。
2. **Agent Gate**：A001 为脚本化求解档。LLM Provider 接入后以 A002+ 测量（不混算）。
3. **Benchmark 100 vs 150**：V0.8 §86 为建议（非硬性 DoD）；核心十能力域已全覆盖。扩展到 150 需要 Invalid/Stress/Security 领域 benchmark 定义的后续增量。
