# pilot12-r45i — V1.1 规格驱动链的 firefox / webkit 两腿捕获（非正典）

批次：r45i（2026-09-23 04:12–04:19Z）。范围＝`docs/v12-owner-decisions.md` 待批 **#15 选项 (a)** 的字面 Pilot-12 集合，实际可跑 **11 例**：其中 `automation` 属 `requiresDevTools: true`，被 `tools/verify/v11-examples-verify.cjs` 的 `.filter((e) => !e.requiresDevTools)` 结构性排除 ⇒ **不得把本目录读成「12 例全绿」**。

## 命令（逐字）

```
NODE_PATH=< playwright 所在 node_modules > \
node tools/verify/v11-examples-verify.cjs \
  --ids=camera,gltf-catalog,gltf-viewer,hello-cube,input,material-basic,skinned-animation,starter,static-model,transform,tween-basic \
  --browser=firefox --out=docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json \
  --artifact-dir=docs/evidence/v12/pilot12-r45i/firefox
```

`--browser=webkit` 同构（`--out` / `--artifact-dir` 换成 `webkit`）。两条腿串行，`FIREFOX_EXIT=0` / `WEBKIT_EXIT=0`。

## 结果

| 引擎 | 记录 | `completed` | `partial` | `apiProofTotals` | `candidateFingerprint` | JSON 字节 / sha256₁₆ |
|---|---|---|---|---|---|---|
| firefox | 11/11 PASS | true | true（子集） | `verified 139 / attested 9 / unproven 0` | `9fa85f88b968d5f1` | 100,293 B / `55f57046cf7cebe1` |
| webkit | 11/11 PASS | true | true（子集） | `verified 139 / attested 9 / unproven 0` | `9fa85f88b968d5f1` | 100,280 B / `1b1529572160eaa2` |

`--out=` 指向非当期路径 ⇒ runner 自印 `[skip-promote]`：**不回写** `examples/example.json` / `examples/files.json`，正典 `docs/evidence/v11-examples-verified.json` 复核仍为 631,722 B / `49c81e5a1e4054e9`（与捕获前登记逐字节同）。

## 三引擎对账（chromium 取正典 52 记录中同 11 例）

判据脚本 `docs/audits/global-quality-audit-2026-09-19/raw/gates/r45i-cross-engine-reconcile.cjs`（本批次内联入档，仓库外原件在 scratch）33 条记录全检：逐条 `result PASS` ∧ `errors []` ∧ `candidateFingerprint == 9fa85f88b968d5f1` ∧ `unproven == 0`；逐例 `specFingerprint` / `sourceFingerprint` / `apiProof` 三项计数与 `units` / `expectationGaps` **三引擎逐字段相同**；22 张本目录 PNG + 11 张正典 PNG 的 `bytes` 与 `hash` 对**在盘回读**逐张一致。汇总子集 `apiProof` 三引擎同为 `{verified: 139, attested: 9, unproven: 0}`（148 units）。

负向控制 8 臂 `passCount 8 / 8`：阳性对照（三份未改副本）`EXIT=0`；`N1` 篡改在册截图哈希、`N2` 篡改单引擎 `specFingerprint`、`N3` 删一条记录、`N4` 改一条为 `FAIL`、`N5` 清空 `results`（反空转：必须 11 条 MISSING 而非「全过」）、`N6` 删一条 `apiProof` 项、`N7` 改在册截图字节数 ⇒ 各 `EXIT=1` 且各自命中预期那一层。

## 边界（不得读成的东西）

- 只新增证据文件，**未改任何判定阈值 / 契约 / 源码 / 产物**；`example.json`、`files.json`、三交付产物字节不变 ⇒ 证据货币 `9fa85f88b968d5f1` 与正典同源。
- 本目录是**非正典**捕获：正典三浏览器矩阵仍是 `docs/evidence/v12/browser-matrix.json` 的另一套验证器（probe/契约断言），两套不可互相顶替（口径见 #15 (c)）。
- 截图**不**跨引擎逐字节相同（`camera` 三引擎 5141 / 2227 / 2047 B 等），只主张每引擎各自与在册自述一致；`gltf-catalog` 的 `apiProof` 为空数组（`0 / 0 / 0`）——与 `npm run verify:api-coverage` 现读 `evidence without apiProof: 1` 同一条，不是本批次新伤。
- 观察到一处**验证器覆盖不对称**（不判红、留待处置）：`tools/benchmark/runner/browser-runtime.cjs` 第 197 与 202 行的本地静态服务器对 `GET /gltf-viewer/` 打了 `[bench-404]` stderr（firefox、webkit 两腿各 1 次），而该记录仍 `PASS` —— 因为 V1.1 规格驱动 runner **没有** `noFailedRequest` 维度（三引擎矩阵 runner 有，字段 `failedRequests`）。本批次未擅改该 runner 的判定面。
- 落点与 #15 (a) 原提案（`docs/evidence/v11-examples-{firefox,webkit}.json`）不同：本批次把两份 JSON 与 22 张 PNG 收进 `docs/evidence/v12/pilot12-r45i/` 一个目录内，避免在 `docs/evidence/` 根目录散件；成本口径按实测修正见 `docs/v12-owner-decisions.md` #15。
