# IER-00 基线身份与历史去重（S0 审查修订版）

任务书 1.2–1.4 节、ENG-00 的最小合同实现。工具 `tools/verify/interactive-improvement-baseline.cjs`。

> **本轮（IER-S0-REVIEW-FIX）纠正**：首版的 `tested-passed` 是文件存在性伪通过；测试文件现在只标
> `testAvailable`，`testExecution` 一律 `NOT_RUN`。历史 SHA 首版抄错（63 位），已修正为精确 64 位。
> 导出核对从"bundle 任意字符串 includes"改为解析末尾 export 语句（别名感知）+ dts 声明。

## 身份字段

| 字段                                                      | 来源                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `appCommit` / `git.{head,branch,dirty,dirtyDigest}`       | 复用 `port-gap-candidate-snapshot.cjs` 的 `collectSnapshot`                                                       |
| `airIdentityInputs.digest`                                | 同上（AIR 特性/输出目录身份输入）                                                                                 |
| `groupDigests.{source,config,runner,contracts,artifacts}` | 同上（组摘要漂移定位）                                                                                            |
| `candidateSnapshotId`                                     | 快照自指纹                                                                                                        |
| `artifactIdentity.*`                                      | module/dts/npm/min/两 map 逐文件 present/bytes/sha256                                                             |
| `builtFrom[]`                                             | dev+min 两个 source map 抽样 `sourcesContent` 与盘面逐字节比对（CRLF 归一）；map 缺失记 `UNKNOWN`，不凭 HEAD 臆测 |

## 能力状态词汇（默认生成只允许前四档）

| 状态                | 判定                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `exported-verified` | bundle 末尾 export 语句命中（别名感知）且 dts 有声明                                                                                                         |
| `member-declared`   | dts 成员声明 + bundle 实现体命中（如 `releaseScene`、`updateSubMesh`）                                                                                       |
| `declared-only`     | 仅 dts 声明                                                                                                                                                  |
| `unchecked`         | 两侧均未定位                                                                                                                                                 |
| `tested-passed`     | **仅** `applyExecutionReport()` 升级产生：版本化执行报告的完整内容身份与当前一致、套件 exitCode 0 且有效正整数 testsPassed==testsTotal 覆盖该 API 的测试文件 |

测试文件存在只标记 `testAvailable: true`；**永远不**凭文件名升级状态。

### 新执行报告：`ier-execution/1`

基线仍为 `ier-baseline/2`，已有字段和历史记录不改写。新的升级报告必须显式声明
`schemaVersion: 'ier-execution/1'`，并在执行前由 `executionIdentity(baseline)` 捕获身份：
dev JS、声明、npm JS、全部产物表（包括 min/map 的实际存在性、SHA、字节数）、
`candidateSnapshotId`、AIR 输入、source/config/runner/contracts/artifacts 五组摘要、
四个 harness 文件、commit 和 dirtyDigest。只传 dev JS SHA 的旧记录仍是历史材料，不能新授予 PASS；
不得事后给旧报告补上新身份来冒充重验。

非 Git 的 Site 或文件输入可以用实际内容清单摘要绑定，`appCommit` 和 `dirtyDigest` 如实为 null；
这不会免除内容、runner、合同和 SDK 的绑定。任何字段缺失或漂移均拒绝，原记录保持不变。
同名套件重复、非整数或无效计数拒绝。合法失败/空报告会撤销该基线先前的执行通过标签。
这里验证的是调用者提供的执行凭据与选定候选的对应关系，不替代可信 runner 的真实运行、
原始日志或对特定 API 覆盖范围的人工核查。

```js
const baseline = buildBaseline();
const identity = executionIdentity(baseline); // 冻结后执行，不从另一个候选补填
const executionReport = { schemaVersion: 'ier-execution/1', identity, suites: actualSuiteResults };
const result = applyExecutionReport(baseline, executionReport);
// 再用 verifyBaseline(baseline, { executionReport }) 核对盘面及执行标签。
```

## 1.2 API 清单（当前版本，20 项）

首版 15 项 + 本轮补齐 `validateAirPrefilteredEnvironment`、`bindAirPrefilteredEnvironment`、`releaseScene`、
`createSessionScope`（sessionScope）、`AirRenderTarget`（类）。`createSessionGate` 测试映射修正为
`port-gap-action-input-dom/native`（原错误指向 scene-release）。`createStepClock`、`calculateObliqueMat`、
两个 prefilter API 无专测——如实标 `testAvailable:false`。

## 历史去重表

`dedupTable` 逐项给出 IER-00..11 → 原 10 建议（A1/A2/B1/C1/C2/D1/D2/E1/E2/E3，其中 D1、E3 各映射两项）→
本仓现有复用物（路径实际核对存在）→ 动作：

- `reuse`：直接复用，不再建同一实现任务（IER-00/01）
- `add-tests`：实现已有，仅补用例/示例（IER-02/04/05/07/08/10）
- `needs-rerun`：历史证据身份不符当前构建，需当前 SHA 重跑（IER-03 旧 HDR `72f37ee6…`、IER-09/11）
- `missing-materials`：仅限当次逐项核实缺失的原材料；不沿用历史不可读结论

## 原材料待核（当前状态与历史记录分开）

| 项                                                        | 状态                                   |
| --------------------------------------------------------- | -------------------------------------- |
| 原 21 项原始 JSON（含 17 evidence/dom-repro-report.json） | UNKNOWN（逐文件、来源和身份匹配待核）  |
| Puzzle50 Oct6 resize 原反例回归                           | NOT_RUN（匹配原材料后同候选实测待做）  |
| 两个私有 Site 入口 HTTP 状态                              | UNKNOWN（当前入口未实测）              |
| 原任务 1.4 节历史事实                                     | TASK_DOC_REFERENCE（引用，未独立核验） |

2026-10-19 已只读确认本地存在相关 JSON 和应用目录，但这不证明每份原始材料均齐全，
也不代表当前验收通过。工具不上传私有原件。历史报告中的 MISSING 保留为记录时点的结论。

## 校验（`verifyBaseline`）

格式不全拒绝；HEAD / dirtyDigest / AIR 输入 / 五组摘要 / 逐产物 SHA+bytes 任一漂移即拒绝；
`historicalDedup.taskDocModuleSha256` 必须等于冻结的精确 64 位值。`currentModuleDiffers` 是布尔事实陈述
（不要求历史永远与当前不同）。

Lead 集成还检查平铺 SDK/声明/npm SHA 与产物表一致，以及每个能力名字唯一、状态与当前探测一致。默认 CLI 不接受人为改成 `tested-passed`；需要验证执行升级时必须向 `verifyBaseline(report, {executionReport})` 明确传入对应执行记录，不能仅修改标签。

执行身份不匹配会使整个验证失败；只篡改 `testExecution` 而不改能力状态也会被拒绝。

新建且尚未跟踪的四个 IER 工具也逐文件记录 `harnessIdentity`（SHA/bytes），不能只依赖 Git 跟踪文件分组。每次核对重新读取 candidate，不复用同一进程启动时的源文件/工作区摘要。

## 用法

```bash
node tools/verify/interactive-improvement-baseline.cjs --out=<new.json>   # wx，拒绝覆盖
node tools/verify/interactive-improvement-baseline.cjs --verify=<report.json>
```
