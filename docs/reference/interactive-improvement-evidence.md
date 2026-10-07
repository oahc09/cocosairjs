# IER-01 输入到画面的证据合同（S0 审查修订版）

任务书 ENG-01 的最小字段冻结与校验。工具 `tools/verify/interactive-improvement-evidence.cjs`。

> **本轮（IER-S0-REVIEW-FIX）纠正**：首版 `observed + PASS` + 全 UNKNOWN 指纹 + 无 PNG 竟然通过；
> app/harness 漂移无检查；`result` 无枚举。现 PASS 门槛收紧如下，known 漂移不限 PASS 一律拒绝，
> 坏 PNG（截断即便 hash 正确）拒绝。首版文档宣称 24 字段实际列表 22；现如实为
> **22 原始必填 + `method` + `execution` = 24 必填**，`referenceComparison`/`pngDimensions` 可选。

## 冻结字段（24 必填）

| 字段 | 类型 | PASS 要求 |
|---|---|---|
| `runId` / `caseId` | string | 非空；须与 context `selectedRunId/selectedCaseId` 一致（拒晚到） |
| `appFingerprint` | `{commit?40hex, sha256?64hex}` | 已知值（UNKNOWN 不能 PASS） |
| `sdkFingerprint` | `{sdkModuleSha256:64hex}` | 已知且与 context/盘面一致 |
| `harnessFingerprint` | `{sha256:64hex}` | 已知 |
| `browser` | string | 非 UNKNOWN |
| `viewport` | **object** `{width,height>0}` | 结构化正尺寸（UNKNOWN 不能 PASS） |
| `dpr` | **number** | 有限正数；NaN/Infinity/负数一律拒绝（任何 result） |
| `inputMethod` / `seed` | string | inputMethod 非 UNKNOWN |
| `receivedEvent` / `modelState` / `layoutReceipt` | 结构化 object | 非空结构化观测；`null` 一律拒绝（未知用显式 `UNKNOWN`；原生数值 0 可作对象字段） |
| `submittedFrame` | `{event,...}` | 非 UNKNOWN（`AFTER_DRAW` 仅表示已提交） |
| `pngPath` / `pngSha256` / `pngBytes` | string/string/**number** | 真实文件 + SHA/bytes 一致 + **实际可解码**；截断 PNG 拒绝 |
| `observationTimestamp` | ISO 8601 string | 合法 ISO（非 UNKNOWN）；不是屏幕物理显示时刻 |
| `sourceStatus` | enum | `observed/unobserved/recreated/scope-cropped/environment-limited` |
| `comparisonDimensions` | array | — |
| `limitations` | array | NODE_SYNTHETIC 必须带 synthetic 说明 |
| `result` | enum | `PASS/FAIL/NOT_RUN/BLOCKED/LIMITED`；非法值拒绝 |
| `method` | enum | `REAL_BROWSER/STEP_CLOCK/NODE_SYNTHETIC/STATIC`；PASS 只允许前两种 |
| `execution` | `{command,cwd,exitCode}` | PASS 必填且类型正确 |

可选：`referenceComparison`（recreated 功能 PASS 必须显式声明且不得为 PASS——功能与保真度分开）、
`pngDimensions`（与解码结果一致）。

## 校验规则

1. 结构非法返回失败对象，不抛 TypeError。
2. 身份漂移：sdk/app(commit 或 sha)/harness 任一 **known** 值与 context 当前身份不符即拒绝，
   无论 result 是什么；UNKNOWN 指纹不触发（诚实未知），但 UNKNOWN 不能 PASS。
3. 晚到报告：`selectedRunId`/`selectedCaseId` 不符即拒。
4. PNG 三层：盘面存在 → SHA+bytes → 实际解码（pngjs，可注入 `context.decodePNG`）。
5. 可见性 oracle：`context.visibilityOracle = {region:[x,y,w,h], kind, minPixels, expectedCentroid?, tolerance?}`
   （kind ∈ red|bright|non-uniform）。从 PNG **真实像素**复算命中数/质心；不信任计数器或 record 自报可见。
   只要解码成功且 oracle 在场即复算并返回 `visibility`（与 result 声明无关）。
6. PASS 门槛全部满足后仍要求：oracle 在场且复算通过；PNG 与 viewport（±1px 或 DPR 缩放）尺寸一致；
   oracle 缺失 → 拒 PASS（像素无法复算）。
7. `unobserved` 不能 PASS；`recreated` PASS 必须显式 `referenceComparison` 非 PASS。
8. NODE_SYNTHETIC/STATIC 不能 PASS；REAL_BROWSER 不能携带 synthetic 说明（防冒充）。
9. CLI `--verify` 自行从盘面重算当前 SDK/app 身份，不信任报告自报 SHA。
10. Lead 集成要求 PASS 的 SDK/app/harness 均由调用方冻结当前 SHA，并包含实际可读 path/bytes；重新读取盘面身份。execution 的 exitCode 必须为 0，startedAt/endedAt 有效且有序；PNG 必须显式给出 SHA/bytes。像素 region 使用整数坐标，预期质心与容差必须有限，容差非负。

## SYNTHETIC 限度

`makeSyntheticRecord()` 只作合同测试；合成 PNG 正例仅证明校验器行为，**绝不能当真实浏览器实证**。
Worker S0 批未采真实链路。随后 Lead 已采集 STEP_CLOCK 原生链路：三浏览器/DPR1/2、30 个 compositor PNG，及 19 种实际报告篡改拒绝。观测范围与历史失败见[示范说明](../manual/interactive-evidence-chain.md)；原云端工程的参考匹配仍 NOT_RUN。

## 用法

```bash
NODE_PATH=output/playwright/tooling/node_modules node tools/verify/interactive-improvement-evidence.cjs --verify=<report.json>
```
