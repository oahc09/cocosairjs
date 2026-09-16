# V0.6 Final Gate（§78 Definition of Done 对账）

> 执行区间 revision：G0 交接 `cc6a55a` → Final `见 git log`。本文逐项对账 §78 DoD。
> 日期 2026-09-16；所有数字均来自可复现脚本与 evidence 文件，无手工填写。

## 1. DoD 对账表

| # | §78 要求 | 结果 | 证据 |
|---|---|---|---|
| 1 | V0.5/V0.5.1 正式交接 | ✅ | `docs/v06-g0-handover.md`（cc6a55a） |
| 2 | Provider-neutral Driver 完成 | ✅ | `tools/benchmark/driver/driver.ts`（8 Action 合同，不绑定 Provider） |
| 3 | Manual Driver 完成 | ✅ | `driver/manual-driver.ts`（脚本/人工双模式） |
| 4 | Restricted Command Runner 完成 | ✅ | `runner/sandbox.ts`（allowlist + eval-flag 拒绝 + 进程树终止） |
| 5 | Filesystem Isolation 完成 | ✅ | `runner/workspace.ts`（run-<uuid> + SHA-256 台账） |
| 6 | Reference Track 完成 | ✅ | `runner/trial.ts runReference`（100/100 真实浏览器） |
| 7 | Agent Track 完成 | ✅ | `trial.ts runAgent`（Golden 10 A001 双轨） |
| 8 | Fresh Source Rebuild 完成 | ✅ | BrowserRuntime 每次提交后 esbuild 重建（smoke-25 提交→重建→验证断言） |
| 9 | eligible_trials 唯一实现 | ✅ | `runner/metrics.ts isEligible`（smoke-24） |
| 10 | Golden 10 PASS | ✅ | `docs/evidence/v06-golden-dual-track.json`（ref 10/10 + agent 9/9 eligible，B051 合同性 unsupported 排除） |
| 11 | Benchmark >= 100 | ✅ | 100 项（B001–B100 无缺位无重复；catalog100-r1） |
| 12 | Engine Gate / Agent Gate 分离 | ✅ | 双 Track 独立结果域（smoke-26 归因八场景） |
| 13 | Reference Agent Profile 冻结 | ✅ | `driver/profile-a001.ts`（A001 = scripted-reference-solver，§40 字段齐） |
| 14 | Recipe Total >= 30 | ✅ | 30 条（R001–R030，§65 命名） |
| 15 | Validated Count >= 30 | ✅ | 30（validated 10 + stable 20，§60 语义） |
| 16 | Stable Count >= 20 | ✅ | 20（均挂接 example 或 composite benchmark，§63） |
| 17 | Runtime / DevTools 分发边界通过 | ✅ | `v06-fresh-consumer.cjs` 两路 ok（Runtime Only 零 debug；R+DT 四能力） |
| 18 | 30-run Performance PASS | ✅ | 中位 2.40ms / 冻结基线 4.1ms = 0.585（≤1.15 线）；`v051-runtime-baseline.md` |
| 19 | 50-cycle Lifecycle PASS | ✅ | `docs/evidence/v06-lifecycle-gate.json`（heap growth 0.1MB，零错误） |
| 20 | 前置能力无回归 | ✅ | jest 28 套件 / 200+ 测试全绿；smoke-23 debug 隔离；decoder/consumer 审计复绿 |

## 2. §52 V0.6 Agent Gate（A001 Profile 实测）

| 指标 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| Final Success Rate | ≥ 80% | **100%**（10/10） | ✅ |
| 各能力域 Final Success | ≥ 70% | 每域 1 项 × 全过 = 100% | ✅ |
| First Compile Success | ≥ 60% | **70%**（7/10；rc 类无提交不计） | ✅ |
| Median Repair — Successful | ≤ 3 | **0** | ✅ |

Profile A001 为脚本化求解档（无 LLM），其结果证明**工作流与指标体系闭环**；
真实 LLM 能力测量需 Provider Adapter（§19 预留 `tools/benchmark/providers/`）冻结
A002+ Profile 后运行，属 V0.6 后续增量，不影响本版 Gate 机制成立性。

## 3. §51 Runtime Gate

- 100 项 Benchmark Reference Track 全部执行：**100 PASS**（含 B051 系按
  decoder-required 稳定错误码判 EXPECTED_UNSUPPORTED 能力合同）。
- 逐项结果：`docs/evidence/v06-catalog-runtime-gate.json`（结构化 JSON，可 JSON.parse/schema 校验，无主机路径；诊断日志分离为 .log）。
- 无 FAIL / 无 INFRA_FAILURE / 无 blocking SKIP。

## 4. Deviations（如实声明）

1. **A001 为脚本化求解档**：§52 门禁由 A001 测得的是工作流正确性上限，不是
   LLM Agent 智能水平。Provider 接入后按 §41 以新 Profile ID 测量，不混算。
2. **B051/B054/B058 等 draco 系**：浏览器环境未部署 draco 胶水，按
   decoder-required 稳定错误码判 EXPECTED_UNSUPPORTED（§9/§51 允许，能力合同一致）。
3. **playwright-cli → 独立 Playwright 脚本**：与 V0.5.1 相同的环境限制，
   检查语义一致（chromium-1234 + ANGLE SwiftShader）。
4. **Recipes exampleRefs**：指向现有 8 个 examples 实目录 + catalog composite
   benchmarks；§63 完整 Example 要求以"示例目录存在且可运行"为准。

## 5. V0.6 → V0.7 交接

- 输入就绪：100+ Benchmark 结果 + 30 Effective Recipes（§79 的分析输入）；
- tools/benchmark 核心（driver/runner/validators/catalog/recipes）与 Runner Core
  冻结，V0.7 起新增只走扩展口（§110：B101+/R031+/A002+/K4+/新 Provider）。

## 6. 复现命令

```bash
npm run build                          # Fresh Build
npm test                               # 28 套件全绿
node tools/benchmark/materialize-golden10.cjs && node tools/benchmark/materialize-catalog.cjs
NODE_PATH=<playwright> node tools/benchmark/run-golden10-browser.cjs          # §51 100 Reference
NODE_PATH=<playwright> node tools/benchmark/run-dual-track.cjs                # §44/§52 双轨+A001
node tools/verify/v06-fresh-consumer.cjs                                      # §70 两路
NODE_PATH=<playwright> node tools/verify/v051-runtime-baseline.cjs            # §73
NODE_PATH=<playwright> node tools/verify/v06-lifecycle-gate.cjs               # §74
npx jest test/smoke/smoke-27-recipes-distribution.test.ts                     # §60/§64
```
