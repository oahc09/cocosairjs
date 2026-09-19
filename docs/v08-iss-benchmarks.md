# V0.8 BLOCK-2 — Invalid / Stress / Security Benchmark（B101–B150）

> §86 建议 Benchmark ≥150 的增量交付。日期 2026-09-19。

## 交付内容

| 项 | 值 |
|---|---|
| Catalog | `tools/benchmark/catalog/catalog-iss.ts`（50 项，revision `catalog-iss-r1`） |
| 领域分布 | Invalid B101–B118（18）· Stress B119–B134（16）· Security B135–B150（16） |
| Fixtures | `tools/benchmark/fixtures/B1xx/`（由 `tools/benchmark/materialize-iss.cjs` 物化：index.html + src 起点 + assets） |
| 冻结参考实现 | `tools/benchmark/references/frozen/B1xx.main.ts` |
| 执行器 | `tools/verify/v08-iss-gate.cjs`（复用 run-golden10/TrialRunner Reference Track；`run-golden10.ts` 新增可选 `catalog` 参数，默认仍为 catalog100） |
| 证据 | `docs/evidence/v08-iss-runtime-gate.json`（**50/50 PASS**，含逐项 validatorResults）+ `.log` |

## 判定语义

- **PASS = 场景 Ready + 零未捕获运行时错误**（+ 逐项附加 validator：node-count /
  material-property / visible-frame / asset-loaded / animation-playing / resource-released）。
- Invalid/Security 行以冻结参考实现"受控加载"敌意资产：引擎必须以稳定错误拒绝
  （`error.code`，如 `GLTF_DECODER_MISSING` / 扩展不支持），拒绝或容错接受均计 PASS——
  崩溃、未捕获异常、OOB 读取导致的页面错误才计 FAIL。
- Security 行覆盖：路径穿越（明文/查询串/百分号编码）、绝对路径与 file:// 取读、
  外部 http 取回（TEST-NET-3）、`__proto__`/`constructor` 原型污染、负数 count/byteLength、
  byteOffset 整数溢出（2^53 近界）、JSON 字符串炸弹（4MB）、GLB 尾部垃圾 chunk。
- Stress 行覆盖：60k 顶点网格、2000 节点、500 层深度链、200 材质、64 纹理、8 灯、
  500 draw call、多 MB GLB、20 轮 rapid load/dispose、100 Animation 组件、100 实例化、
  2048² 纹理、1500 组件、30 次连续帧捕获、500 并行 tween、混合压力场景。

## 与 catalog100 的关系

- ID 段位遵循 `schema.ts` 段位规则（B001–B100 发布后不复用，增量从 B101 起）。
- catalog100 的 §51 Runtime Gate 与 golden 双轨完全不受影响（回归证明：catalog 100 gate 重跑 100/100）。
- 总目录规模：100 + 50 = **150**，达成 §86 建议值。

## 已知边界（诚实记录）

1. Security 行的"未发生外部取回/宿主读取"由引擎 URI 合同 + 参考实现 `error.code` 捕获证明；
   运行层无网络拦截器，未在 HTTP 层断言零请求（后续可在 BrowserRuntime 增加 route 拦截断言）。
2. Invalid/Security 行的"稳定拒绝"与"容错接受"两种结果均计 PASS（expectedStates 记录预期形态），
   区分度来自：任何非常规路径的崩溃/未捕获异常都会使 no-runtime-error FAIL。
