# Cocos Air 全局质量与完整性核查任务书

## 0. 目标、适用范围与授权边界

本任务书适用于：多个 Agent 已分别交付 Cocos Air 各阶段任务，需要对最终集成结果进行独立核查。它不是新的引擎开发路线，也不将任何历史计划、完成声明或旧 Gate 报告直接当作当前通过证据。

核查目标：证明有效需求没有遗漏、跨版本合同没有漂移、测试能检出错误、模块组合正确、最终分发物可独立消费，并给出针对指定候选版本的可追溯结论。有限测试不能证明绝对零缺陷；报告必须明确环境边界、未测项和残余风险。

默认执行权限：读取工程；在隔离的审查副本中构建、测试、进行可恢复的故障注入；生成审查报告和证据。不直接修复原工程，不修改原工作区的源码、断言、阈值、期望图片、许可证、包名、权限或凭据；不自动暂存、提交、推送、发布或部署。实际代码修复与原仓库重要文件删除需要单独授权。

审查不要求安装 Creator，不要求 WSL2，不自动更换模型路由、构建器或开发服务器。沿用宿主可用且获准的执行环境。无法达到隔离要求时，受测 Agent 执行门禁标为 BLOCKED，不用普通浏览器上下文冒充操作系统级沙箱。

## 1. 总体流程与独立性

采用一名总审查负责人统一基线、需求裁决和最终结论，领域审查可以分工。实现 Agent 可以解释实现和提交修复，但不能独自批准自己实现所对应的最终验收、视觉基准或需求豁免。

```text
A0 冻结候选快照与有效合同
  → A1 需求—代码—测试—产物追踪及跨版本审查
  → A2 测试系统可信度审查
  → A3 干净环境构建与独立分发消费
  → A4 全量领域验证与跨模块纵向链路
  → A5 Benchmark / Recipe / Example / Coverage 独立复算
  → A6 发布目录、许可与文档审查
  → A7 问题归因、门禁结论及整改复验
```

A0 完成后，A1 与 A2 的只读分析可以并行。A2 未证明有效前，不能采信后续“全绿”报告。性能测量独占测试资源，不与其他构建、GPU 测试或 Agent 任务并发。

## 2. A0 — 冻结待核查对象与合同

### 2.1 必读输入

一次性收集实际存在的版本任务书、修订与批准记录、ADR、Gate 报告、公开声明、package/lockfile、构建/开发/测试入口、examples 索引、capabilities、Benchmark/Recipe catalog、上游映射、许可清单和实际分发物。不存在的输入记录为缺失，不按历史标题推断存在。

历史任务书中的章节号只用于追溯。审查使用稳定 requirement ID，不依赖不断变化的 Markdown 行号作为唯一身份。

### 2.2 有效需求裁决

为每个要求记录来源及状态：`active / superseded / deferred / unresolved`。

- 用户明确确认的修订覆盖被修订条款；未冲突的旧约束继续有效。
- 新实现或新文档不自动构成需求变更批准。不能以“现在代码就是这样”免除原要求。
- 早期离线导入器路线已被后续 Runtime glTF 路线替代的，不重新作为缺失项。
- 同一版本多个不一致版本没有明确裁决时，记录 `unresolved`，不得自行选择较宽松口径。
- `cataloged` 不等于已验证支持，scripted solver 不等于独立 LLM 成功率，目录存在不等于正式交付。
- 旧报告的 BLOCKED 也不自动代表当前仍然 BLOCKED；需要核查其阻断项是否有新版本复验。

### 2.3 候选身份

至少记录：HEAD、分支、工作区状态、纳入审查的已修改及未跟踪文件、lockfile/toolchain/config hash、测试环境、构建来源和产物 hash。

存在未提交代码时，候选身份使用 `HEAD + 纳入文件内容清单/hash + 本地差异`；不能仅记录 HEAD，更不能为了获得 clean 状态执行 reset/clean。建立独立只读来源快照与可写测试副本。复制时明确哪些文件属于发布源码、测试 fixture、私有参考或本地保留内容。

同一审查 run 使用同一 candidate ID。代码或合同变更产生新 candidate ID，并建立证据失效清单。

### 2.4 输出与退出条件

输出 `baseline.json`、`effective-requirements.json`、`contract-decisions.md`。退出条件：审查范围、候选内容、继承合同、排除理由明确；硬性冲突或缺少必要输入分别列为 BLOCKED。可继续不依赖缺失项的只读审查，但不得宣称整个候选完成。

## 3. A1 — 完整性与跨版本一致性审查

### 3.1 原子需求追踪

把每条有效要求拆成可独立判定的 requirement，而不是按版本标题或文件数统计完成率。每项记录：

```json
{
  "id": "EXAMPLES-MANIFEST-BOOTSTRAP-001",
  "requirement": "没有缩略图的新示例仍可进入开发清单并被截图工具发现",
  "sourceRefs": ["已批准任务书及修订的准确位置"],
  "requirementState": "active",
  "mandatory": true,
  "implementationRefs": [],
  "testRefs": [],
  "artifactRefs": [],
  "expectedEvidence": ["manifest 诊断", "实际发现记录", "截图产物"],
  "actualEvidenceRefs": [],
  "verdict": "NOT_RUN"
}
```

`implementationRefs` 为空表示缺实现；有实现但无可运行测试表示验证缺口；有测试但未被发现或执行表示没有运行证据；有报告但 revision 不匹配表示陈旧证据。以上都不能写 PASS。

### 3.2 必查一致性边界

1. 一级结构仍为 `src/build/examples/test/tools/docs`，没有未经授权的 packages/addons/plugins/framework 平行产品层。
2. Cocos 公开类型仍是主 API；Air 新增能力没有变成第二套 Scene/Node/Model。
3. Web-only 检查针对真实 import/build reachability。允许的独立 Draco/Meshopt/Basis JS/WASM 交付不误判成 Native 引擎；不能用删除所有含 NATIVE 字符串的文件达标。
4. 原启动、DOM 前置、包名、构建命令、normal/min/dts 产物和 import 行为遵守当前冻结合同，不按旧稿擅自迁移 CommonJS/ESM 或更名。
5. Runtime、DevTools、Gallery 的分发边界一致；默认 Runtime 不导出或载入 tools/debug。
6. Loader registry、能力报告、decoder 配置、资源所有权、错误码只有一套权威实现，session/catalog 不另维护等价白名单。
7. Gallery、dev server、CLI、截图、回归和静态构建复用统一发现入口；允许薄适配，不允许平行枚举器长期漂移。
8. tests 发现规则确实覆盖新增目录；不以配置遗漏减少用例。
9. 公开文档、包中声明、Example Spec、实际运行 API 对得上。
10. Schema、公开接口或资源语义变更时，对应版本、迁移记录和影响范围明确。

### 3.3 双向核查

正向：每个 active requirement 都有实现、可执行验收、当前证据。

反向：每个新增公共 API、依赖、目录、命令和产品声明都有需求或批准来源。没有来源的实现是范围漂移候选，不因代码能跑就自动合理。

检查“存在”只是入口：TODO、stub、空实现、固定返回 PASS、catch 后吞错、无条件 fallback、过宽 any、重复缓存、不可达代码都要结合调用路径判断，禁止把 grep 命中数直接当结论。

退出条件：所有有效要求均归档；未实现、未测试、证据陈旧、未经批准偏移全部有明确记录，不遗漏、不静默豁免。

## 4. A2 — 先证明测试可信

### 4.1 测试发现与实际运行

建立并对账：`应执行用例 ID 集合 → runner 实际发现集合 → 实际执行集合 → 结果集合`。检查 only/skip/todo、项目过滤、测试目录规则、错误退出码、空测试成功、过度 mock、未等待 Promise、验证仅看自报 ready 等问题。

使用项目锁定的 runner 和配置执行发现命令。Jest 可用其 `--listTests`，Playwright 可用其 `--list`；确切命令先从实际 package scripts 和版本核实。不用未锁版本的临时 npx 下载替代已有工具链。

首轮结果、重试次数和最终结果必须同时保留。首次失败后重跑通过是 flaky 证据，不可覆盖成首次成功。必需项的不可解释 flaky 阻断该项可靠性结论。

### 4.2 受控故障注入

仅在隔离副本中，为关键合同各建立正向控制和负向控制。不接触真实凭据，不把真正 Benchmark 私有答案放入不可信环境；使用牺牲性标记文件检查隔离。每次只改变一个条件，恢复或销毁副本后再测。

| 注入 | 必须观察到的结果 | 防止的虚假通过 |
|---|---|---|
| 移除必需 Draco decoder | 正向模型失败；缺失 decoder 教学路径验证准确错误码 | registry 名字存在即声称支持 |
| 停止目标动画 | animation validator 失败，即使能截到静态角色 | 截图代替动画验证 |
| 移除材质纹理引用 | Texture/视觉合同失败 | Mesh 可见即纹理通过 |
| 截图证据 hash 过期 | development manifest 可生成，release 校验失败 | 陈旧图继续算 current |
| 挂入保护范围外节点并尝试操作 | Harness/session 正确拒绝且无副作用 | 可写范围只写在文档 |
| 在牺牲副本故意放开保护 | 隔离测试检出 INVALID_RUN，停止采信该环境结果 | hash 审计冒充沙箱 |
| Reference 的有效运行时路径回归 | Engine FAIL；Agent NOT_EVALUATED | 引擎错误被列为 INFRA |
| Agent 源码编译失败 | Agent FAIL，进入 eligible 分母 | 只统计成功提交 |
| 安装包缺少 worker/notice 文件 | 分发/许可门禁失败 | package.json 白名单代替真实包检查 |
| required test 被排除出发现规则 | 完整性对账失败 | 测试数量减少却保持全绿 |

退出条件：预定关键负向控制全部能被相应 validator/Gate 检出，正向控制不误报。检测失败先报告测试体系缺陷，不能用该体系给实现签署通过。

## 5. A3 — 干净构建与分发消费

### 5.1 构建复验

在审查副本按锁定依赖和已审查脚本安装并构建，不使用旧 build 冒充本次产物。不清理用户原工作区。

核查既有 build、build:min、build:dts、typecheck、verify:web-only、npm test 及已经存在的 source-map/dev-loop/cache 检查；额外格式仅在当前合同要求时验证。发现脚本缺失，记录缺口，不伪称已执行。

检查打包生命周期是否重新生成产物；最终 qualification 绑定实际 tarball 中的字节/hash，而不是打包前另一份 build。两次干净构建若不同，记录差异与非确定性来源；不为通过而随意排除文件。源码 map 不泄露本机绝对路径。

### 5.2 三种独立消费环境

| Profile | 允许输入 | 必须验收 |
|---|---|---|
| Runtime-only | 审查产出的 Runtime tarball、锁定外部依赖、公开应用资产 | 公开 import/dts、normal/min、Code First、实际模型渲染；默认无调试模块请求或控制端点 |
| Runtime + DevTools | 上述输入及显式 DevTools artifact | 版本匹配、attach、范围控制、观察/操作/capture/error、detach；不引用工程 tools 路径 |
| Gallery standalone | 完整 Gallery artifact 及明确列明的静态依赖 | 编译后示例、多文件原始源码查看、图片/模型/decoder/worker、旧路径/深链/嵌套部署；不依赖 TS 开发编译端点或 /__debug/ 的隐藏服务 |

三个 consumer 均位于源码树外，屏蔽对源码仓库的访问；禁止 importmap/tsconfig paths/软链绕过包入口。依赖安装完成后关闭外网，使用已固定本地 assets/decoder 验证离线路径。不能因为 tarball 生成就声称 registry 已发布。

### 5.3 实际产物审计

检查 runtime 包是否因 `build/**` 白名单错误夹带 `build/devtools` 或 `build/examples`。Gallery 显式携带所需 runtime 字节和 decoder 映射，或者列出独立配套产物；没有声明的隐式 CDN 依赖判失败。

退出条件：三类 consumer 对应功能、类型和静态部署路径通过，产物清单、hash、HTTP 请求和实际画面证据齐全。

## 6. A4 — 全量域验证与跨模块链路

必须执行当前有效 Gate 要求的全量测试、全部 active reference Benchmark 和全部声称 stable 的 Example/Recipe。代表性链路是额外集成检查，不能取代全量门禁。浏览器配置不同的能力结果分别报告，不混成“所有浏览器支持”。

### 6.1 全局纵向链路

| ID | 链路 | 验收关键点 |
|---|---|---|
| J01 | Runtime tarball → 新项目 → createAirApp → Camera/Scene → 帧 | 无 Creator/源码仓库依赖；预期前景、类型、map、normal/min 一致 |
| J02 | GLB → Loader → 原生资产 → 两实例 → 独立动画 → 销毁其一 | mesh/material/texture 共享遵守合同，动画/实例状态隔离，存活实例不受误释放影响 |
| J03 | 三类压缩模型 → 显式 decoder → Worker/MIME/嵌套 URL → 渲染 | 包内完整 JS/WASM/worker；未使用时不初始化；缺失、损坏、取消路径及释放正确 |
| J04 | 高级材质输入 → feature/effect → scene-color/render pass → framebuffer | 不仅检查属性或 shader 编译；正向语义、设备不足及合法 fallback 分开验收 |
| J05 | 业务 TS/引擎 TS 修改 → watch/build → 新页面 → 调试定位 | 业务示例不触发无关全引擎重编，错误后可恢复，最终可由持久源码重建 |
| J06 | Example Spec → API Inventory → manifest → dev/CLI/Gallery → validate/capture → static artifact | 单一发现源，缺图可生成开发清单，陈旧图阻断发布，源码快照对应实际代码 |
| J07 | Agent task → driver → 受限修改 → feedback → repair → fresh build/page → validator | 参考/生成代码分离，源码落盘，独立 profile/预算、可靠分母和隔离 |
| J08 | 完整 Recipe → 交互序列 → 视觉结果 → 重载 → 清理 | 不能仅 node-exists 即 stable；不能靠 runtime 临时操作替代持久应用 |
| J09 | Gallery A→B→C 快速切换及退出 | 单 active iframe；旧异步结果不覆盖新示例；session/listener/worker 不累积 |
| J10 | 合法/损坏资产与错误页面 → report → cleanup → 下一任务 | 稳定错误 cause 保留；状态不污染后续任务；错误示例不靠普通非黑截图判 PASS |

### 6.2 图形与交互检查

固定捕获环境、资产、相机、灯光、时间采样和 ROI/语义验证。使用已批准的阈值；没有量化合同或基准审查记录的内容标为验收缺口，不能现场任选数值宣布通过。

逐个查看 stable 示例实际输出；视觉关键示例还要验证交互前后或多个时间点。Contact sheet 可辅助全量浏览，但不能替代细节、纹理方向、动画、透射排序和生命周期测试。

不能统一采用“高光越强越正确”“画面不是黑色”“截图已生成”等条件。空场景和预期失败是合法教学目标，应按各自 spec 验证。

### 6.3 浏览器与设备范围

按项目冻结矩阵运行 Chrome/Edge/Firefox/Safari 等要求；记录实际浏览器和真实图形后端。自动化 WebKit 的测试结果不能直接记为 Safari 真机通过；被软件渲染器替代的 GPU 环境也需标注。设备不足时验证预期错误/fallback，不把负向路径成功充当正向效果支持。

### 6.4 性能和生命周期继承

- 固定 BoxTextured 的 revision/hash、冷/热缓存和计时起止点；30 次加载中位数相对冻结同环境基线回退不超过 15%。不能把基线滚动重置来掩盖累计退化。
- 至少 50 次 load/instantiate/dispose 后，Asset cache、Blob URL、worker、Texture、Buffer 等回到已约定基线；允许的引擎持久缓存必须提前定义，不临时扩大范围。
- Debug overhead 在同场景同操作的工具 OFF/ON 下单独比较。
- JS heap、引擎对象/引用、GPU 可见信息分开；不可测项标 unavailable，不写 0；一次 GC 不证明无泄漏。
- 性能新增指标沿用前序至少 3 次的统计方式，但不能用 3 次代替 30 次加载门禁。

退出条件：必需链路与原有全量 Gate 通过；任何支持范围内的必需失败或缺证均阻断相应 Gate。

## 7. A5 — 独立复算 Benchmark、Recipe、Example 与 API Coverage

### 7.1 Benchmark 证据

核对至少 100 个有效独立内容点及冻结目录中的全部 active 项；如果申报版本已经要求扩到更多项，按该版有效合同审查，不能退回最初 100 项。

Engine Gate 使用冻结参考代码/确定性操作。Agent Gate 使用真实 Agent 生成提交，复用同一 validator 但分别输出结果。Scripted solver 只证明 harness/脚本路径，不计独立 LLM 能力。

逐 trial 记录 task/profile/knowledge/config/环境/fixture/hash/初次提交/feedback/repair/最终持久源码及 fresh rebuild 证据。每 profile×benchmark 至少 3 次，RC 核心项依已冻结要求至少 5 次。对比必须使用同一 knowledge revision，新增公开示例后不混算旧成绩。

从原始事件独立复算，不只读取开发 Agent 的 summary：

```text
Eligible = 实际启动 Agent Track 的 VALID trials - 已批准 non-blocking SKIP
FinalSuccessRate = Agent PASS / Eligible
FirstCompileRate = 初次源码提交 build/typecheck PASS / Eligible Type-B trials
```

编译失败、错误结果、Agent timeout、预算耗尽、主动放弃、被正确拒绝后任务失败均计分母。INFRA/INVALID 及合同限定不可评测设备项单列。每个计划 repetition 保留固定槽位和每次 attempt，基础设施补跑不能覆盖原记录或无限挑最好结果；未完成必需槽位阻断完整性结论。预算、补跑上限采用冻结试验政策，缺失则先裁决，不在审查中临时优化成绩。

V0.6 已讨论门槛：最终成功率≥80%，各域≥70%，First Compile≥60%，成功 trial repair 中位数≤3。RC 已讨论门槛：最终≥90%，各域≥85%，First Compile≥75%，成功 trial repair 中位数≤2。先确认申报版本对应有效批准合同，不把两套口径混用。分母为 0 不报 100%，报不可评测并阻断相应必需域。

### 7.2 失败归因

| 事实 | 归因与计分 |
|---|---|
| 有效环境、有效参考实现触发真实运行时回归 | Engine FAIL；Agent NOT_EVALUATED；阻断 Engine Gate |
| 参考文件损坏、fixture hash 不匹配、Harness/浏览器无法可信启动 | INFRA_FAILURE；修复后重跑；不当作 Engine PASS |
| Agent 生成提交编译或功能失败 | Agent 失败，计入 eligible |
| Agent 越权请求被正确拒绝、无泄漏无污染 | trial 仍 VALID；按任务终态计分；拒绝教学用例可按预期通过 |
| 实际隔离突破、读取答案、篡改 validator、跨 trial 污染 | INVALID_RUN；阻断环境可信性；修复后新 attempt；不得靠排除降低失败率 |
| 根因未确认 | 归因待裁决，相关 Gate BLOCKED；不为了出分强行归为 INFRA |

新引擎破坏正式构建/API 不因表现为“build 报错”自动算 INFRA；必须确认是否为有效环境下的候选软件回归。

### 7.3 命令保护实效

命令白名单不仅检查字符串，还检查固定可执行文件/参数、工作目录、可变 package scripts 和构建配置。允许 `npm run build` 但允许 Agent 改写其脚本仍可能执行任意代码，因此必须有实际进程/文件系统/网络隔离和超时进程树清理。

Reference/私有 validator 不挂载到受测 Agent 可读目录。只读挂载仍可读，不能用只读保护替代答案保密。浏览器工具暴露的信息也纳入可见性审查。哈希只作为补充，不是主要防护。

### 7.4 Recipe 计数

单一 status 晋升语义：`draft → validated → stable`；deprecated 不计有效数。

```text
ValidatedCount = count(validated ∪ stable)
StableCount = count(stable)
```

V0.6 至少 30 validated（累计）且 20 stable；申报 RC/1.0 时至少 30 stable。完整场景、交互、视觉和生命周期证据都需对应真实运行，不能由目录标题或单个 node-exists 断言晋升。

### 7.5 Example 计数与规格

所有纳入 Wave 的 Example 必须先冻结 spec：目标、具体效果、准确 API、资产、场景、交互步骤、Ready、每项 validator/阈值、视觉及生命周期、许可和禁用捷径。

`primary/supporting API` 必须绑定正式 inventory symbol/signature，不能写“Input API”等占位；不存在的 API 为 BLOCKED。

Wave 数量是累计唯一 stable ID：Pilot 12 可计入 Wave 1；Wave 1≥40，Wave 2≥90，V1.1 Release≥120；130–136 为扩展目标，不重复计数 Draco 等多标签条目。旧例可继续旧 URL，但未经新 spec/evidence 验证不能直接算 stable。

### 7.6 API Coverage 复算

分母来自冻结 inventory 的 `tier + coverageRequired`，不得通过重分类、删除未覆盖 API 或修改分母临时达标。别名、继承、overload、事件和纯类型单位须有冻结规范，不能重数。

```text
CoreVerified / CoreTotal = 100%
ImportantVerified / ImportantTotal ≥ 90%
AdvancedVerified / AdvancedTotal ≥ 80%
AdvancedDocumentedOnly / AdvancedTotal ≤ 20%
AdvancedUnresolved = AdvancedTotal - AdvancedVerified - AdvancedDocumentedOnly = 0
```

`documented-only` 永不进入 verified 分子；claimed 不算验证。报告区分真正 uncovered 与 claimed-but-unverified，避免将残差误命名为只包含 uncovered 的集合。supporting 按已冻结独立口径报告，不能用作降级容器。

verified 绑定实际源位置/AST symbol、适用执行证据与行为 validator；单纯 import、metadata 自报或测试辅助代码调用不等于示例覆盖。开发工具 API 和 Runtime API 分库存证，不能混入同一分母夸大比例。

### 7.7 Manifest、截图与证据有效性

开发清单允许 missing/stale 图片并输出诊断；截图工具从该清单发现示例；通过 Ready/功能/必要交互后 capture；生成证据再做发布校验。发布 stable 必须 current 或经批准 not-required。Thumbnail 不自动升级为视觉回归基准。

源码/spec/assets/runtime/validator/capture profile 的实质变化应使关联证据失效。使用内容 hash 与依赖关系，避免把 Git HEAD 的文本相等当唯一 current 判据；生成物更新时间不能自我更新输入 hash，造成新的循环失效。

退出条件：独立复算与官方报告一致，差异都有解释；不因总平均好看忽略必需域或缺测分母。

## 8. A6 — 目录、许可、文档和发布边界

### 8.1 目录与许可证

对源码、第三方复制源码、npm 依赖、decoder JS/WASM/worker、模型/图片/字体/音频、生成包及公开源码快照分别核对来源、版本/hash、许可、notice 保留要求。

`generated` 只说明资产生成来源，不自动证明可发布；有来源仍需核实复用素材与许可约束。无法确认的发布材料阻断相应发布范围，不悄悄删除以通过。

目录清理先输出 keep/exclude/delete-candidate 清单及理由。默认只排除不应发布内容，不在原仓库批量删除子目录 LICENSE、历史证据或用户文件。必需 notice 必须在真实 Runtime/Gallery/DevTools 交付物中检查存在。

### 8.2 文档即消费测试输入

在独立 consumer 逐段执行 Quick Start、glTF/decoder、DevTools 和 Gallery 的正式示例命令。检查文件名、包名、API、DOM 前置、部署路径、错误码、支持状态和限制与实际产物一致。

文档声明“支持”需落到同 revision 的正向证据；required decoder/device-dependent/fallback 限制不得在宣传或 gallery 标签中消失。Recipe/Example 状态按 catalog 与证据展示，不按标题或旧报告展示。

### 8.3 发布资格与外部动作分离

本地 tarball 合格、Gallery artifact 合格、DevTools artifact 合格不代表 npm registry 已发布或线上已部署。没有独立授权不执行注册包名、publish、push、部署或权限修改。

退出条件：所有本次发布材料来源可追踪，必要声明齐全，目录清理处置可审计，独立用户按文档能复现，发布边界没有虚构事实。

## 9. A7 — Gate、问题报告与整改复验

### 9.1 最终 verdict

每个 Gate 只能给出 `PASS / FAIL / BLOCKED / NOT_RUN`。预期错误/预期 fallback 是测试用例的预期成功结果，不是用 FAIL 换名。非阻断 SKIP 必须来自事前批准规则；支持范围内必需失败、缺证、未测或不可信结果不能由总体平均抵消。

至少分别保留：需求完整性、测试可信度、Engine、glTF、Agent、Recipe、Example/Gallery、API Coverage、Runtime package、DevTools、浏览器、性能/生命周期、许可、文档等 Gate。复用原 Gate ID；本任务书的分组只是全局映射，不替换前序合同。

最终结论严格绑定 `candidateSnapshot + contractRevision + environmentMatrix + testedArtifactHashes`。任一必需 Gate 非 PASS，整体不得宣称已完成。可以同时说明“实现存在但缺证”“框架通过但真实 Agent Gate 未通过”等局部事实。

### 9.2 Findings 必需字段

```text
findingId
关联 requirementId / Gate
问题类别：实现缺陷 / 集成缺陷 / 验证缺口 / 合同冲突 / 证据陈旧 / 范围漂移
是否阻断及依据
准确代码/配置/文档位置
复现命令与环境
预期 / 实际
原始证据引用
影响的产物、示例、测试与版本
最小修复建议（不自动实施）
负责复验的审查方
```

不用“存在风险”“建议优化”代替可定位事实；不能复现时明确写静态发现或未验证假设，不伪造执行输出。

### 9.3 整改闭环

发现问题 → 归因/最小建议 → 授权实现 Agent 修改 → 新 candidate ID → 独立审查对应修复 → 影响范围回归 → 更新证据/Gate。

原证据保留不覆盖。修改断言、阈值、参考图或合同不是普通实现修复，必须单独说明错误依据、批准及历史结果影响。最终 RC 做一次全量必需 Gate；中间修复按影响图复验，避免每改一行都重复所有昂贵测试。

### 9.4 交付目录

优先写入现有审查报告位置；若无，建议使用 `docs/audits/<audit-id>/`，不创建新顶层产品目录。

```text
baseline.json
effective-requirements.json
traceability.json
contract-decisions.md
test-discovery.json
evidence-index.json
findings.jsonl
verification-summary.md
global-verdict.json
retest-plan.md
```

日志、trace、截图和大文件存于获准 evidence 位置，索引记录 hash/path/runId。私有参考和评测答案不进公开报告/Gallery/npm 包；报告只提供受控 evidence 引用。

## 10. 推荐角色分工

| 角色 | 审查范围 | 不可独自更改 |
|---|---|---|
| 总审查负责人 | 候选冻结、有效合同、冲突裁决、依赖图、最终 Gate | 用户范围、阈值、发布授权 |
| Runtime/Integration Reviewer | 公开 API、glTF/decoder、材质、共享资源和生命周期 | 对应实现和参考图 |
| Verification Reviewer | 测试发现、负向控制、Benchmark driver/统计/隔离、Recipe/Coverage 复算 | 原 validator 及历史 raw events |
| Distribution/Gallery Reviewer | 三类产物、独立 consumer、Examples specs/路由/来源/实际视觉、许可文档 | 核心引擎和其他人产物来源 |

分工是执行建议，不自动创建并行任务。共享 package/manifest/session/测试配置必须单一整合者管理。性能测试串行。领域 Reviewer 交证据而不是只交总结，由总审查负责人检查跨模块矛盾。

## 11. 退出检查表

- 全部 active requirement 已追踪；superseded/deferred/unresolved 均有来源和明确影响。
- 原工作区被保留；审查针对固定候选及实际测试产物。
- 必需测试全部实际发现并执行；首轮/重试完整；关键负向控制能检出缺陷。
- 正式 full suite、active Reference Benchmark、stable Examples/Recipes 与跨模块链路通过。
- Runtime、DevTools、Gallery 三类独立 consumer 通过，无隐式源码或在线依赖。
- Engine/Agent/Recipe/Capability 结论分离；Agent 分母与生成源码可复算。
- API Coverage 分母、verified 证据、Advanced 80% 与文档豁免不混算。
- Example 规格、累计 stable 数、单一 manifest、旧 URL、嵌套部署、截图证据、知识隔离通过。
- 30 次加载中位数/15% 回退、50 次生命周期及同环境口径保持。
- 发布材料许可、notice、目录清理、文档与包消费均有证据。
- 必需 Gate 未通过时不出整体 PASS；没有外部发布授权时不声称已发布。

## 12. 依据与边界

项目合同依据：会话中已讨论的各版本任务及修订；已提供《V0.5 — Full glTF Extension Coverage》§3/§4/T7/T8/§10/DoD，以及《V0.5.1 — Developer Ecosystem & Agent Ready Runtime》交接、consumer、session、性能、测试与授权边界。实际执行仍需读取本地最终批准版本，不用本任务书替代它们。

外部工具事实核对（不要求升级项目工具版本）：

- Playwright Isolation：`https://playwright.dev/docs/browser-contexts`
- Playwright Retries：`https://playwright.dev/docs/test-retries`
- Playwright Command line：`https://playwright.dev/docs/test-cli`
- Playwright Visual comparisons：`https://playwright.dev/docs/test-snapshots`
- npm pack：`https://docs.npmjs.com/cli/v11/commands/npm-pack/`

本文件为全局核查执行方案，不是当前本地仓库的已执行审查报告。
