# 端口缺口证据分层：候选快照与报告 schema（PG-27 / PG-34 S0）

> 本文是 [统一计划](../../ai/plans/port-gap-remediation.md) §12 S0 批次（PG-27 候选身份 + PG-34 schema/环境预检）的工具合同。schema 的唯一执行定义在 [port-gap-evidence-schema.cjs](../../tools/verify/port-gap-evidence-schema.cjs)；本文是人读摘要，冲突时以校验器为准。2026-10-03 记录，基于 HEAD `cac42f6e897fa184cd486d4e38f07ec7c8768c0a` 的当时工作区（含并发未提交改动，见快照脏清单）。

## 工具与职责

| 工具 | 模式 | 写行为 |
| --- | --- | --- |
| [port-gap-candidate-snapshot.cjs](../../tools/verify/port-gap-candidate-snapshot.cjs) | `snapshot` / `check` | 只写显式 `--out`（已存在须 `--force`）；`check` 默认不写盘（`--report-out` 显式才写） |
| [port-gap-evidence-schema.cjs](../../tools/verify/port-gap-evidence-schema.cjs) | `--report` / `--selftest` | 只读；`--verify-paths` 时额外检查原始输出文件存在 |
| [port-gap-env-preflight.cjs](../../tools/verify/port-gap-env-preflight.cjs) | `--out` / `--launch-browsers` | 只写显式 `--out`；不安装、不下载、不代启动 |

三者均未接入 `package.json`（不占 npm script 名），调用方式一律 `node tools/verify/port-gap-*.cjs …`；由统一集成流程决定是否注册。

## PG-27 候选快照

```bash
# 采集（必须显式选输出路径；实际加载 URL 必须显式传入才被记录）
node tools/verify/port-gap-candidate-snapshot.cjs snapshot --out=<file.json> --load-url=http://127.0.0.1:7454/starter/
# 复核（同候选无漂移 exit 0；检出漂移 exit 1 并逐文件列出 before/after sha256）
node tools/verify/port-gap-candidate-snapshot.cjs check --snapshot=<file.json> [--load-url=<url>]
```

快照覆盖（schema `port-gap-candidate-snapshot/1`）：

- `git`：HEAD 全量 sha、branch（detached 记 null）、`git status --porcelain` 脏清单及摘要。非 git 目录如实 `available:false`，身份退化为纯文件摘要（供夹具/临时工作区复用同一套漂移检测）。
- `airIdentityInputs`：`AIR_FEATURES` / `AIR_OUT_DIR` 的声明值与解析值；任一变化都改变 `snapshotId`，变体构建不与默认构建混同。
- 分组指纹：`source`（`src/` 跟踪文件和未忽略的新文件）、`config`（package.json/lock、tsconfig、jest/babel 配置）、`runner`（`tools/verify`、`tools/build`、`tools/debug`、`tools/dev`）、`contracts`（`test/`、`docs/manual/examples/`、`examples/` + browser-matrix 合同）、`artifacts`。非 artifacts 组默认存"顺序无关摘要 + 缺失明细"，`--deep` 追加逐文件条目。新文件路径未变而内容变化同样改变摘要。S17将随npm发货的文档配方及Gallery源/资源纳入contracts：保持runtime字节不变而修改应用源码也必须漂移；既有快照按原记录的范围保留，扩大范围后需重新采集，不能称旧快照仍完整。
- `artifacts` 始终逐文件记录 `bytes` + `sha256`：unmin/min 及各自 map、`build/cocosair.module.d.ts`、`build/package.json`、`build/npm/**`、`build/gltf-decoders/**`。声明覆盖而当前缺失的产物逐项进 `notRun`（`NOT_RUN`），不视为错误也不静默跳过。
- `build/npm` 与 decoder 目录按实际文件遍历，包含被 Git 忽略的构建输出。设置 `AIR_OUT_DIR` 时额外记录变体目录的 JS、maps、模块标记和 decoder；独立的 d.ts 仍使用默认路径。
- 安全入口的 `build/bootstrap.js`、map和`bootstrap.d.ts`也逐项记录；npm副本由实际目录遍历覆盖。变体目录的安全入口同样进入身份。
- `loadTarget`：仅显式 `--load-url` 传入时记录（`providedBy:'cli-flag'`）；不推断、不默认。两次对比中 URL 变化计为漂移。

漂移分类：`head` / `worktree`（脏清单增删）/ `airIdentityInputs` / `group`（`changed`/`added`/`removed`，含前后 sha256）/ `loadUrl`。任何漂移都意味着"当轮证据不得归属快照候选"，须重新冻结候选后重采。

## PG-34 证据报告 schema v1

校验入口：`node tools/verify/port-gap-evidence-schema.cjs --report=<file.json> [--verify-paths]`；通过 exit 0，拒绝 exit 1 并逐条给出稳定 rule id。报告 schema `port-gap-evidence/1` 必备字段：

| 字段 | 要求 |
| --- | --- |
| `gate` | `EG0…EG5` / `AG1` / `AG2` / `AIG` 之一 |
| `subject` | 验证对象与描述（非空） |
| `evidenceTypes` | 非空数组，枚举 `SOURCE_CHECKED` / `MODEL_PASS` / `CONTRACT_DOUBLE_PASS` / `ENGINE_HEADLESS_PASS` / `BROWSER_INPUT_PASS` / `BROWSER_RENDER_PASS` / `GPU_MEASURED` / `USER_CONFIRMED` |
| `execution` | `status` ∈ `PASS` / `FAIL` / `NOT_RUN` / `BLOCKED` / `NOT_APPLICABLE`。PASS/FAIL 必须记录实际 `command`、`cwd`、`startedAt`/`endedAt`、数字 `exitCode`；NOT_RUN/BLOCKED/NOT_APPLICABLE 必须给 `reason`，BLOCKED 另给 `blockedBy` |
| `failureStage` | FAIL 必填，∈ `infrastructure` / `application` / `engine` / `resource-deployment` / `environment`（失败按 stage 分开，不合并成单一失败） |
| `attempts[]` | 当轮每次执行一条；最终 PASS 前，FAIL/NOT_RUN 必须给 `supersededBy` 指向更晚的实际补偿。最终 FAIL/NOT_RUN 可如实保留未补偿尝试；若提供补偿链接则仍校验有效性，不能伪造补偿或无声覆盖失败 |
| `scope` | `declared[]`（非空，或 `totalCases>0`）、`subset`、`completed`、`totalCases` / `measuredCases` / `skippedCases`（非负安全整数，已测加跳过必须等于总数）、`skippedDetail[]`（条数=skippedCases）。`completed:true` 要求非 subset、零 skip 且状态 PASS |
| `fingerprints` | `candidate` / `source` / `contract` / `runner` / `browser` / `application` 每键显式：`{present:true, sha256(64hex), path, algorithm:'sha256'}` 或 `{present:false, status:'NOT_RUN'/'NOT_CONFIGURED'/'NOT_APPLICABLE', reason}`。不适用也要显式声明，不得缺键 |
| `method` | 测量/模拟方式：`kind` ∈ `REAL_BROWSER` / `ENGINE_HEADLESS` / `CONTRACT_STATIC` / `SYNTHETIC` / `MODEL` + `detail`。SYNTHETIC/MODEL 的 PASS 必须披露 `limitations`（合成/模型不与真实等同） |
| `rawOutputs` | PASS/FAIL 必须至少一条 stdout/stderr/截图/日志原始路径；`--verify-paths` 校验文件存在 |
| `measurements.gpu` | 声明 `GPU_MEASURED` 时必填；GPU 不可用记 `{available:false, unavailableReason}`，`inferred:true` 直接拒绝（不得用替身推断 GPU） |
| `externalMaterials` | `AG1`/`AG2` 的 PASS 要求 `available:true`；外部材料不可达时保持待材料状态，不生成兼容/验收 PASS |
| `priorEvidence` | `inherited:true` 的 PASS 要求其 `candidateFingerprint` 与当前 candidate 指纹一致（证据维度不靠排序继承） |
| `notConfigured[]` | 可选；逐项 `{item, status:'NOT_CONFIGURED', detail}` 披露未配置依赖 |

硬性分离规则（校验器强制）：

1. 证据类型与执行状态分开记录；证据类型不随执行顺序继承。
2. `USER_CONFIRMED` 单独不足以支撑仪器化 gate（EG0…EG5/AIG）的 PASS。
3. `BROWSER_*` 证据要求 browser 指纹 present；`ENGINE_HEADLESS_PASS` 要求 runner 指纹 present。
4. PASS 必须带 present 的 candidate 指纹；当轮未补偿 FAIL/NOT_RUN 时不得 PASS。
5. 空 scope（无 declared 且无用例）的任何报告都拒绝。

## 已执行浏览器报告的规范化

`node tools/verify/port-gap-browser-evidence.cjs --input=<原始.json> --log=<原始.log> --gate=EG3 --type=BROWSER_RENDER_PASS --exit-code=0 --out=<新.json>` 将已有实际执行的浏览器子集转换为本schema。`--exit-code`须是已观察到的采集器退出码；工具不会启动浏览器或推断执行时间。命令、cwd和起止时间取原报告，所有记录的文件指纹须与当前字节相同，原始日志须存在。退出码与scope verdict不一致、缺版本或漂移均拒绝；输出已存在也拒绝覆写。

计数单位为浏览器场景行，嵌套断言不重复计数；原始FAIL/NOT_RUN行不会被丢弃，始终subset=true/completed=false。混合输入仍明确披露合成触点，不能据此认证物理设备或真实后台hidden；GPU分配量保持unavailable。规范化只是保留原证据及其范围，不能替代完整EG验收。当前规范化子集和完整gate未完成状态见[报告索引](../evidence/port-gap/README.md)。

## 历史环境预检结果（2026-10-03，本机）

完整记录：[port-gap-evidence-preflight.json](port-gap-evidence-preflight.json)（schema `port-gap-env-preflight/1`，HEAD `cac42f6e897f…`）。

| 检查项 | 结论 |
| --- | --- |
| node / npm / git | v24.14.0 / 11.11.1 / 2.46.2.windows.1 — AVAILABLE |
| typescript / jest / ts-jest | 4.9.5 / 28.1.3 / 28.0.8（本仓 node_modules）— AVAILABLE |
| playwright 模块 | **NOT_CONFIGURED**：本仓 node_modules 与 `NODE_PATH` 均不可解析；按纪律不代为安装 |
| 浏览器二进制缓存 | chromium-1193/1217/1228、firefox-1543、webkit-2311/2336、ffmpeg-1011 存在于 `%LOCALAPPDATA%\ms-playwright` — 文件在、未验证可启动 |
| 浏览器实际启动 | **NOT_RUN**（模块不可解析；本轮只查环境，不启动引擎、不采证据） |

结论：Node 侧静态/合同验证通道可用；任何 `EG2`/`EG3` 及三浏览器矩阵在配置 Playwright 工具链前保持 `NOT_RUN`/`NOT_CONFIGURED`，不得引用历史浏览器报告当作本轮 PASS。

后续环境补偿：Lead 将 `playwright@1.63.0` 安装到忽略的 `output/playwright/tooling/`，并安装匹配 WebKit 2359。执行时显式设置 `NODE_PATH`；三浏览器已用于 S1 输入和 S2 诊断探针。原预检保留安装前事实，新的执行结果与失败补偿记录见[台账](../../ai/ledgers/port-gap-remediation.md)，不覆盖历史文件。

## 当前环境补偿（2026-10-04，Lead）

[当前预检](port-gap-evidence-preflight-s15.json)保留独立新记录；显式`--launch-browsers`已实际启动Chromium 149.0.7827.55、Firefox 155.0、WebKit 26.6，Playwright模块1.63.0及各执行路径如实记录。预检使用与实际采集器一致的browser-engines选择，不下载或启动应用场景。某个必需浏览器失败/缺失时总状态为NOT_CONFIGURED，不能由其余两者启动推为全可用。默认仍不启动浏览器；AVAILABLE只证明启动可用，不能建立EG2/EG3 PASS。

预检`--out`须为新路径，已有输出以EEXIST拒绝，不覆盖历史。源码/schema/规范化回归31项与schema自测13项通过；额外回归覆盖完整/缺失/失败浏览器集合、真实模块/启动版本及CLI覆盖拒绝（退出2、原文件字节不变）。S15状态是历史；当前状态见S21，仍区分NOT_RUN/BLOCKED与已通过组件。

## 回归验证

[port-gap-evidence-tooling.test.ts](../../test/smoke/port-gap-evidence-tooling.test.ts)（Jest，临时目录夹具，不触碰仓库）：快照工具覆盖同版本源码漂移、产物字节漂移、产物删除、loadUrl 与 AIR 身份输入变化、非 git 环境退化；schema 覆盖 14 类虚假/缺披露报告的逐规则拒绝与诚实 NOT_RUN 放行。`port-gap-evidence-schema.cjs --selftest` 提供无 Jest 的等价自检。

## S0历史批次边界

- 不接 `package.json`、不改 AGENTS.md、不动正式 evidence 与计划/总台账——由统一集成流程写入。
- 外部 30 项目资产不可访问：`AG1`/`AG2` 保持待材料，本批次未生成、也未声称任何 gate PASS。
- 浏览器证据（EG2/EG3、三浏览器矩阵）在 Playwright 工具链配置前不启动；本文不构成任何 gate 的通过证明。
- 快照/预检输出只落在显式指定路径；S0输出为`port-gap-evidence-preflight.json`；S15补偿另记新文件。

S20 将六类配方按浏览器/配方计数：18行中17已测、1 WebKit FPS未达，执行状态为NOT_RUN并保留实际非零退出码；不把整个WebKit其余五行吞掉，也不将这些子集提升为完整gate。规范化调用当前逐阶段校验器，拒绝scopePassed与条目矛盾、缺失/重复条目、假时钟和丢失终态。最终工具回归29/29通过，另覆盖漏计、超计、负数、小数、NaN、Infinity及超出安全整数范围的拒绝；独立normalizer拒绝12种篡改并保留平面collector兼容。全库存88套件/754测试通过；S20-final保留为当时记录，后续原生post变体前置与当前完整gate索引见S21证据目录。
