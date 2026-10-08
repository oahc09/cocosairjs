# 互动引擎示例、诊断与验收执行记录

对应[计划](../plans/interactive-engine-improvements.md)。2026-10-07，用户已授权实施。记录是各批时点事实，不是当前发布证明。

| 任务 | 当前状态 | 执行渠道与剩余范围 |
| --- | --- | --- |
| IER-00 | PARTIAL | Orca Worker 基线工具与去重已实施，Lead 补身份/状态拒绝；本仓已核对，外部原始材料仍缺失 |
| IER-01 | PARTIAL | Lead 三浏览器/DPR1/2 原生链路与遮挡负例通过；原云端对象遮挡/雨线/切面范围未验 |
| IER-02 | PARTIAL | Orca Worker 双路线 45 定步 + 6 普通模式实测，Lead 复核/归档/16种拒绝；native MSAA采样、原参考与长期稳定性未验 |
| IER-03 | PARTIAL | Lead HDR45、Water117及透明/斜裁剪15状态当前复验通过；原参考、过滤质量与实体设备仍未验 |
| IER-04 | PARTIAL | Orca Worker 初稿，Lead 修正并归档：93/111 可见矩阵通过，18 WebKit 活 resize 呈现失败；雨线6、网格3、生命周期3、普通入口9通过；原 soft 13 场景未得 |
| IER-05 | PARTIAL | Lead真实400操作/PNG和62补充检查通过；32协议/焦点NOT_RUN与两条PAL诊断保留，完整scope=false；原参考与实体触屏未验 |
| IER-06 | PARTIAL | Lead 63场景状态48 PASS/15 WebKit活布局呈现FAIL；27无SDK对照、冷加载与释放已验；原Puzzle50仍NOT_RUN |
| IER-07～08 | PARTIAL | Lead原生/定步6行、滚动42状态与CH/FF音频48落点通过；WebKit WebAudio两行NOT_RUN，原大型工程/音乐未得 |
| IER-09 | PARTIAL | Lead36个5秒本机短窗口LIMITED，raw/工具成本已记录；3×60秒实体设备和预算未提供，不假设60fps |
| IER-10 | PARTIAL | Lead五类消费负例三浏览器已验；可选effect JSON函数/循环拒绝增量；未启用可选模块请求路径未验 |
| IER-11 | PARTIAL | Lead真实tarball offline消费15入口、已安装TS4.9与五例终态通过；60 PNG有5张WK活布局失败，完整scope=false |

## S0 工具交付审查（Lead，2026-10-07）

Orca Worker 交付了 baseline/evidence 工具、两个合同文档和 15 个合同测试；Worker 报告其聚焦测试/typecheck/docrefs通过，未运行真实浏览器。Lead 读取源码并以 Node 纯导出复现后暂不接受本批收口：

- `buildBaseline()` 仅因测试文件存在即输出 `tested-passed`，没有执行记录；15 API 清单也遗漏预过滤环境校验/绑定与 `releaseScene`。
- 任务书历史完整 SHA 抄写错误。未复用 candidate/source-map 工具核查源码对应关系，缺少具体历史任务去重映射。
- `validateEvidence(makeSyntheticRecord({result:'PASS',sourceStatus:'observed'}))` 返回 `ok:true`，尽管 PNG 缺失、所有身份和事件未知。app commit/harness 漂移未检查；PNG 未解码或复算可见区域；CLI 未传当前身份。
- 现有所谓 app 漂移测试只断言返回值存在，AFTER_DRAW 测试只断言 warning 数量非负，无法证明相应拒绝语义。

Lead 补充 `interactive-improvement-review.test.ts`，要求修复真实误收路径，而非增加自报成功字段。工具层完成不等于 IER-01 的真实事件、对象、提交和截图链路已验。原始材料缺失仍保持待验。

## S0 修订与 S1 原生链路（Orca Worker / Lead，2026-10-07）

- Orca Worker 原样通过 Lead 13 条拒绝回归，重写自己的 27 条合同测试；默认基线 20 项能力不再因测试文件存在而标通过，复用 candidate snapshot 并按 dev/min 两 source-map 六源规范化抽样核对。历史完整 SHA 纠正，去重表对应 IER-00～11 与原建议。
- Lead 实施独立 native fixture、浏览器 collector、解析投影/pixel oracle、额外拒绝测试、实际报告内存篡改审计。严格 TypeScript noEmit 检查通过；SDK/抽取源码未修改。
- Lead Chromium 首次尝试在清理后读取已销毁 renderer 材质，以及把 `isPaused()` 当属性，失败记录在 `output/interactive-engine-improvements/lead-native-attempt1.json`；修复夹具观测时点后再验。没有归为 SDK 缺陷。
- [S1 规范报告](../../docs/evidence/examples/interactive-engine-improvements/native-chain-s1.json)中 Firefox DPR2 reset 截到旧帧，独立位置检查拒绝。固定 AFTER_DRAW 后等待两次浏览器 requestAnimationFrame（不推进引擎）后，[S2](../../docs/evidence/examples/interactive-engine-improvements/native-chain-s2.json)三浏览器/DPR1/2×五状态共 30 PNG 通过既定正例/负例检查，pageErrors/consoleErrors=0。
- S2 有 24 个可见状态 PASS、6 个遮挡状态可见性 FAIL；预期拒绝被独立复算确认。两自有资产每组 1→0，input 解绑、renderer 销毁，release 同 Promise，退役后 step 抛 `RECIPE_DISPOSED`。subset=true/completed=false。
- [实际报告审计](../../docs/evidence/examples/interactive-engine-improvements/native-chain-audit-s2.json)19 种身份/PNG/事件/提交/位置/时钟/遮挡/清理篡改全部拒绝，browserRunsAdded=0。
- Lead 聚焦三 suite 最初 50/50 PASS；后又加入两个基线平铺身份/能力状态拒绝测试，一并由完整库存运行验证。原始失败和实际命令日志在 `output/interactive-engine-improvements/lead-*` 保留。
- [HDR 当前重跑](../../docs/evidence/examples/interactive-engine-improvements/hdr-current-s1-index.json)复用 `examples/hdr-color-pipeline/verify.cjs`，退出 0，Chromium/Firefox/WebKit 各 15 检查通过，当前模块 `3a448f02…`，三份原报告与 18 PNG 原字节保存。仅已有颜色/float/GGX 子集，不标 IER-03 完成。
- 完整库存首次真实运行发现 109 suites / 898 tests / 894 passed / 4 failed，仍是既有 smoke-29 三项规格/证据/Gallery 与 smoke-30 旧矩阵指纹失败。npm 把 `--update` 当 `--update-notifier`，未更新库存；随后改用 `node tools/verify/test-inventory.cjs --update` 正式登记，保留非零退出事实。
- 既有 smoke-29 测试会生成 `docs/evidence/spec-compliance.json`；本次库存运行刷新该当前失败报告，原 HEAD 版本另存 ignored output 作历史比较，未伪造全局门禁通过。
- 正式库存已写入 109 suites / 898 tests / 894 passed / 4 failed，三个新增 suite 52 项全部通过。Lead 最后补充了新建工具逐文件 harnessIdentity 和每次身份核对刷新 snapshot；避免未跟踪工具修改或同一进程源码变化被缓存漏检。该增量由定向 review suite 单独复核，未重复全量采集。

## IER-02 首轮交付审查（Orca Worker / Lead，2026-10-07）

Orca Worker 提交两条渲染路径、45 个截图状态及自己的 20 条测试，报告三浏览器通过。Lead 抽查 native mip-offset PNG，四区域确为蓝/黄/紫/青；同时独立复现以下问题，暂不接入正式成功证据：

- 实际报告的七种内存篡改全部被误接受：矩阵全 NOT_RUN、四个重复组合、删去 reset 状态、将状态改为 FAIL、std140 错误码置零、native 轮次 destroyed=false、resize 代次不前进。
- 新增 `interactive-multipass-review.test.ts` 七条无历史 output 依赖的拒绝测试，首次执行 7/7 失败，日志保留 `output/interactive-engine-improvements/lead-multipass-review-s1.log`。
- Chromium 普通页面真实观察 250ms：引擎 paused=true，totalFrames 始终 0。普通入口误调用 `clock.begin()`，停住了原生 pacer；定步页面通过不能替代普通示例可用性。
- 重复 binding 负例测的是重复 Camera attachment；尚未证明描述符 binding 冲突。矩阵、生命周期和 native gfx 清理还信任自报布尔值，`gfxDestroyed` 实际仅检查对象有 destroy 方法。
- Jest suite 在模块加载时读取 ignored output 下的 worker 报告，干净检出不可复现。capture reset 未退役旧 source 节点/资产；shared shader 输入闭包、逐状态覆盖及真实输入方式需补齐。

以上是示例和采集工具问题，未确证 SDK 缺陷。安排 Orca Worker 在原 IER-02 文件边界内修正，保留首轮报告，使用新路径重新采集；共享 SDK、S0 合同、Lead 审查测试、正式库存和台账由 Lead 统一维护。

## IER-02 二次审查（Lead，2026-10-07）

Orca Worker 修复普通入口的误暂停，补充三浏览器原生模式按钮观察、15 输入指纹及无历史 output 依赖的合同测试。绑定冲突与未绑 sampler 重新定性为静态声明检查和真实运行时行为，未称 GL 拒绝。首轮报告保留，修订报告在 `worker-multipass-review-browser.json`。

Lead 独立复核仍不接受资源收口：Chromium 真浏览器连续调用 reset/step 十轮，`ownedRefCount` 从 8 增至 88，旧节点退役 60 个，但旧资产引用仍在 owned 数组。最终释放仅归还全部历史引用，并不能证明重置不积累；`rendererInvalidAfterClose:true` 常量仍在源码中，与 Worker 回执声称已移除不一致。

新增 `tools/verify/interactive-multipass-audit.cjs`，只读校验实际报告并做 16 种内存篡改。首轮基线被现有 collector 接受，但只有 8/16 篡改被拒，审计 exit=1：NOT_RUN 状态、错浏览器/格式、未来 inputSequence、afterDraw=false、跳过 full 检查、normal.error 及空可信事件仍误收。输出保留 `output/interactive-engine-improvements/lead-multipass-review-s2-audit.json`，browserRunsAdded=0。Lead 七条 helper 回归补入有效矩阵接受前提，避免缺字段导致的无效拒绝掩盖目标问题。

共享工作区新增的 agent-skills 计划和 graphics-package 改动来自其他工作，不纳入 IER 实施。继续委托原 Worker 修真实资产退役、原始 normal 观察和精确身份/状态门槛；保持 SDK 和已有证据原样。

## IER-02 S3 收口与集成（Orca Worker / Lead，2026-10-07）

- Orca Worker 在新 closure 报告中实际采集三浏览器×五行×三个状态，共 45 定步 PNG；普通模式两个入口各三浏览器可见状态，另有 6 PNG。三浏览器 pageErrors/consoleErrors=0。15 份输入指纹含四个 GLSL 与严格编译配置。
- Lead 只读 `--verify` exit=0、独立解码/核对 45 PNG SHA+bytes，抽看 native 普通模式棋盘；重复重置退役源码已归还并移出 owned 数组。
- Lead 真浏览器另验 Chromium 十轮 reset：owned 恒 8，旧八引用 1→0；350ms 后 bufferSize=7138776、textureSize=1051184，与重置前相等，最终当前八引用全部归零、rendererValidAfterClose=false。同步 retiredValidity 仍 true 是调度时点事实，不改写为已经销毁。实际记录在 `output/interactive-engine-improvements/lead-multipass-reset-s3.json`。
- [正式归档](../../docs/evidence/examples/interactive-engine-improvements/multipass-s3.json)只重映射 PNG 路径，记录原报告 SHA；[原报告](../../docs/evidence/examples/interactive-engine-improvements/multipass-s3-raw.json.gz)原字节保留。Lead [独立审计](../../docs/evidence/examples/interactive-engine-improvements/multipass-s3-audit.json)基线通过，16/16 篡改全部拒，exit=0，browserRunsAdded=0。
- Lead 实际运行四套合同：71/71 PASS；严格例 tsconfig noEmit exit=0。Gallery 新规格经独立临时目录 strict 检查 1 frozen/0 issues；已生成清单，展示状态 draft，不自动升级通用 Gallery/API coverage 门禁。
- 本批未修改 SDK/抽取源码、未安装、构建、提交或推送。两静态负例和运行时未拒绝行为分别披露。native MSAA采样 NOT_RUN；原云端参考未取得，sourceStatus=recreated，未称完整 IER-02/全12项或发布通过。
- 正式库存更新实际 exit=1：111 suites / 927 tests / 923 passed / 4 failed，两个新增 multipass suite 29 条已登记。四个失败仍为既有 smoke-29 三项规格/证据/Gallery 与 smoke-30 旧矩阵指纹；不因本批通过宣称全局门禁通过。日志 `output/interactive-engine-improvements/lead-s4-inventory.log`；文档引用校验无新断链。

## IER-04 首轮交付审查（Orca Worker / Lead，2026-10-08）

Orca Worker 实际采集 Chromium 37 行、Firefox/WebKit 各 9 行，共 55 行，以及雨线、网格和生命周期观察，报告其 collector 通过。Lead 阅读生产示例与校验器后暂不接受收口，未登记成功或升级 Gallery：

- 切面和轨迹误差都来自同一组理论 `worldHits`，不是实际上传的 Float32 顶点。可见薄四边形另外带 z 偏移和宽度；刀刃误差也来自理论插值点，没有读取刀刃对象的实际位置。约 2.5e-13 的往返值不能证明三个渲染对象满足误差约束。
- 实际报告基线通过，但十种独立内存篡改全部误收：雨线/网格/生命周期重复同引擎覆盖、删除释放引用、释放不幂等、负误差、定步时钟仍运行、错浏览器、非可信输入、刀线漂移 999px。只读审计保留 `output/interactive-engine-improvements/lead-geometry-review-s1.json`，未新增浏览器运行。
- Lead 新增生产纯函数回归 `interactive-geometry-review.test.ts`，首次实际 13 条中 9 failed / 4 passed。负数/小数/NaN/Infinity 索引、NaN UV、两套索引同时输入、NaN/Infinity 容量、非法对象总函数合同、共线射线无法确定唯一切面等边界需修正。日志 `output/interactive-engine-improvements/lead-geometry-review-s1.log` 保留。
- 雨线 PNG 没有进入报告的路径/SHA/像素重算；网格没有截图证明双路径可见和运动；生命周期主要读布尔值，未独立核对 refs、幂等性及普通入口监听解绑。`resized` 行是新页面加载，不能证明活 resize；当前 lifecycle 采集没有活 resize 或真实 Escape 操作。

以上定位为示例/纯函数/采证工具问题，尚未确认 SDK 缺陷。委托原 Orca Worker 在 IER-04 边界内修订实际对象测量、精确范围与像素/生命周期证据，保留首轮报告；原参考素材缺失和完整任务未验状态保持。

## IER-04 二次审查与可见性定位（Lead，2026-10-08）

Orca Worker 修复生产纯函数，原 Lead 13 条回归全部通过；三引擎均扩为 37 行（111 行），记录 93 PASS 和 WebKit 活 resize 18 FAIL。该报告仍未收口：

- Lead 真实浏览器诊断确认雨线采样三角形法线全部 `-Z`，与 +Z 侧相机正面不符。仅在浏览器内反转每个三角形第二/第三索引，WebKit 可见青色像素从 0 增至 23127；没有修改仓库 SDK 或示例。记录 `output/interactive-engine-improvements/lead-geometry-frontier-s3.json` 与 PNG。关闭剔除的前一诊断没有成功，不能用它替代索引修复的实证。
- 同页 WebKit 场景活 resize 后，从 256000 个非清屏像素变为 1；等待 300ms、定步六帧以及恢复原生 pacer 300ms 均未恢复。无 pageerror。此最小诊断尚不证明具体 SDK 责任层，需要继续核查 framebuffer/viewport/画布和图形状态。
- 校验器的 `failures` 数组没有纳入最终判定。Lead 把六雨线自报计数改成 2000、位移改成 20 后，包含 18 FAIL 且实际雨线 PNG 全黑的报告被接受；删 raw 输入事件、向实际上传顶点注入 NaN 同样误收。审计 `output/interactive-engine-improvements/lead-geometry-review-s2.json` 保留。
- 切面仍是与刀线平行的宽四边形；`recomputeErrors` 对它计算中心线误差，尚非任务书要求的新切面顶点误差。记录切平面但没有用于目标几何求交，不能据 0.03px 中心线数值宣称切面顶点验收。
- Lead 扩充纯投影回归：有限合法输入先接受，NaN/Infinity 顶点、NaN 相机矩阵应拒，宽切面不能用中心线代替顶点。当前 18 条中 14 passed / 4 failed，原 13 条保持通过。日志 `output/interactive-engine-improvements/lead-geometry-review-s2.log`。
- 网格 PNG 仅检查路径存在，雨线 PNG 没有在 validator 中解码复算位移；生命周期尚未覆盖真实 Escape/活 resize 取消与普通入口，释放仍遗漏普通 AFTER_DRAW 监听及 mesh 模式 renderer 的精确解绑。需要逐项补足，不按“两项剩余”提前结束。

继续委托原 Orca Worker 修正证据链与示例绕序，保留活 resize 失败并诊断其原因；未登记 Gallery 成功、未升级 SDK 或完整任务状态。

## IER-04 异常终止回执复核（Lead，2026-10-08）

Orca Worker 异常终止时自动桥接“scopePassed=true、全部收口”。Lead 读取实际 `worker-geometry-closure-browser.json` 后拒绝该结论：111 行为 63 PASS / 48 FAIL（Chromium 12 误差失败、Firefox 12 误差失败、WebKit 18 活 resize 阻塞和 6 误差失败）；低角例实算 cutMax=0.195546px、stroke=0.193601px，超过既定 0.15。十轮 reset 的 `perRoundRefs` 三引擎全部 false。普通 native-pacer 验收和正式 mutation audit 未交付，手册仍保留上一轮过时结论。

雨线修正有实际进展：六组 PNG 有可见像素并移动，DPR1=23061 像素/0.819 像素质心位移，DPR2=93071/1.666。真实切平面与目标边缘求交已加入；仍存在叠层偏移使实际切面顶点误差超预算，不能用装饰 overlay 的可见性替代几何验收。

Lead 增量修复 collector：最终判定纳入所有 FAIL 记录并拒绝十轮 reset 引用不配对；未改历史报告的成功字段。当前重新验证拒绝，审计保留 `output/interactive-engine-improvements/lead-geometry-review-s3.json`（包括原报告 SHA 和原声明）。collector 修改也使旧报告工具身份漂移，需要以后重新采集，不能继承 PASS。

Lead 18 条纯函数/投影回归实际全部通过。另一 suite 运行过程中 Lead 修改 collector，导致本次四条接受前提出现工具身份漂移；这次运行不作为稳定版本的回归结论。后续固定源码后串行验证，避免编辑与身份校验并发。当前继续按失败范围修正，不登记 IER-04 完成。

## IER-04 S7 修正与受限归档（Lead，2026-10-08）

Orca Worker 因 429/1310 每周/月额度耗尽中止，服务提示 2026-10-11 11:36:11 重置；Lead 接手实施，不把自动桥接摘要当作已完成证明。

- Lead 修正覆盖层：用 pass 顺序/深度状态分层，实际测量顶点保持 z=0；目标平板与切平面真实求交，逐 Float32 切面顶点独立投影。装饰宽 overlay 单独披露，不替代误差值。保留 ribbon 正面绕序与真实截图运动。
- Reset 用旧对象身份读取四 mesh 1→0，六保留资产 1→1；三引擎各十轮 owned 恒 10。所有模式释放都先解绑借用 renderer，归还当前自有引用，再关闭 app；DOM/AFTER_DRAW 监听配对移除，普通模式 Reset 不再创建无用 scratch mesh。
- Lead 真实无 SDK WebGL2 对照：Chromium resize 前后红色 PNG，WebKit resize 后 compositor 白色但 readPixels 红、glError=0/contextLost=false。对照[原始记录与文件身份](../../docs/evidence/examples/interactive-engine-improvements/resize-control-s4-index.json)及 raw/source/六 PNG 在盘。说明呈现问题可在无 SDK 条件复现，未据此修改核心。
- S6 重新采集被校验器拒绝：原始指针事件漏存 session，Escape 冒泡阶段未收到导致三 lifecycle 超时；WebKit 的全白画面被非清屏计数误判成成功。修正原始事件字段、使用捕获阶段监听 Escape、按目标颜色检测空白。S6 的[失败原报告](../../docs/evidence/examples/interactive-engine-improvements/geometry-s6-failed-raw.json.gz)和日志保留，不能因后续修正继承 PASS。
- S7 [规范报告](../../docs/evidence/examples/interactive-engine-improvements/geometry-s7.json)/[原字节报告](../../docs/evidence/examples/interactive-engine-improvements/geometry-s7-raw.json.gz)，Lead 实际 `--browser=all` exit=1：Chromium 37 PASS、Firefox 37 PASS、WebKit 19 PASS/18 live-resize FAIL。只读复算没有其他合同错误；scopePassed=false/subset=true/completed=false，141 PNG 归档。此前日志中的初步 PASS 状态不替代 PNG 最终校验。
- 原始上传数据独立复算全部111行：cutMax=0.037658186 CSS px，strokeMax=0.000003823，bladeMax=0.000000668，均低于冻结预算；这不能补偿 18 个不可见 PNG。雨线6/6实际像素运动，网格3/3蓝/橙双路径与动态 bounds/运动，生命周期3/3真实 Reset/捕获 Escape/已收 resize 取消和后续新手势；普通 native-pacer入口9/9实际帧前进、可信控件、三次Reset资产恒定和终态清理。
- 生产纯函数/投影及工具合同两套 51/51 PASS，严格示例 tsconfig 和 `npm run typecheck` exit=0。[聚焦原日志](../../docs/evidence/examples/interactive-engine-improvements/geometry-s7-unit.log)保留。合成 PNG 合同测试与真实浏览器报告分开。
- Gallery 规格经独立临时目录 strict 校验 1 frozen/0 issues；展示状态 draft，清单169例。首次规格行号不匹配的报告保留；本批不升级通用 API coverage/release 门禁。
- Lead [实际报告审计](../../docs/evidence/examples/interactive-engine-improvements/geometry-s7-audit-final.json)核对范围、当前输入和全部 PNG；原始输入/会话/时相/非法顶点/PNG/普通帧/控件/退役/覆盖等篡改结果见该新报告。审计合规不把完整 scope 的18受限FAIL改为PASS，browserRunsAdded=0。
- 完整库存更新实际 exit=1：113 suites / 978 tests / 974 passed / 4既有失败；几何两套51条已登记，旧 smoke-29规格/证据/Gallery三条和 smoke-30旧矩阵指纹一条未被掩盖。日志 `output/interactive-engine-improvements/lead-geometry-inventory-s7.log`；docrefs=158/1261/unresolved0。
- SDK/声明/npm 三字节身份不变；未安装、构建、提交、推送或改抽取源码。原 soft/Water 历史参考、长期/实体设备和 WebKit 全范围呈现仍未验或受限，不称完整 IER-04/12项完成。

## IER-05 启动（Lead，2026-10-08）

当前模块/声明/npm身份与起始一致。复用现有 createActionState/createActionInput DOM后端/createSessionGate，新增局部混合输入示例与相同DOM的无SDK HTML对照。Canvas拥有拖动，button保持标准click，原生range和竖向文档滚动不统一转发。没有全局触摸兼容时间窗；实例清理使用AbortController和精确引擎回调解绑。

初版页面与实现已创建，独立strict noEmit检查通过；真实mouse/touch20次、held/key/hover、多指/取消/晚到range及滚动尚未采集，不标通过。后续脚本能力缺失必须明确NOT_RUN，不能以mobile viewport的mouse替代touch。未修改SDK、共享输入或安装依赖。

## 起始身份和授权范围（Lead）

- HEAD `1228a50`；开发模块 `3a448f029369ac0253f3098fc08680c65f81bdf3bb472795e3032fdd725ab01d`；声明 `3c2b1853a372509d040bbfc93d957b2c525764d000467f8aac8f33f8b8068fee`；npm 模块 `f2a59819e45b11ef75841439d713c1a73eae76b7f3be4bdded3398d6ac56e036`。
- 启动时仅 `build/build.zip` 未跟踪；不改、不删除、不提交。
- 下载任务书的 Oct6 模块身份 `f6836f60…` 与当前身份不同。旧 HDR 报告 `72f37ee6…`、响应式报告 `d23e9088…` 均保留为历史。
- 两个私有 Site 入口在只读评估时无法由工具读取；未确认其 HTTP 状态。原云端项目和缺失 JSON 不可据此声明已恢复或已验。
- 本轮授权实现、示例、测试、文档和本地验证；没有新增 Git 提交、推送或发布授权。

## IER-05 S3 混合输入收集（Lead，2026-10-08）

- 全部本批代码/浏览器/测试执行渠道Lead；Orca Worker额度耗尽未参与此实施。复用现有DOM ActionInput与session，SDK三产物身份未改。
- 页面初版原生wrapper高度缺失造成canvas覆盖button，真实click超时；纠正宿主模板样式，不改全局输入。Smoke3 mouse/tap各一次与引用1→0证明修复；初次超时未列为SDK缺陷。
- S1 collector实际exit1：初始latest序号缺省、读取resize过早、滚动后wheel目标错误、关闭负例后再检节点身份。S2又错误地按WebKit兼容click.pointerType认定触摸，40条tap误拒。S3改为保存前置真实pointerdown，严格关联click，保留S1/S2原始报告和400 PNG历史而非覆写。
- [S3规范报告](../../docs/evidence/examples/interactive-engine-improvements/input-s3.json)，原50MB累计轨迹保留output，规范版保留每操作原始事件区间、完整每行eventTrace和不变的模型/pose/布局/帧测量，仅迁移400 PNG路径。当前只读重算仍exit1，但只有原始PAL诊断及32NOT_RUN，400操作与62补充检查均通过。
- 三引擎×SDK/HTML两路径：button mouse20/touch tap20/Canvas mouse drag20，Chromium另外两路径touch drag20，共400；每次模型仅+1/可见反馈仅+1，实际Node pose/原生AFTER_DRAW和PNG质心匹配。不将visibleUpdates自报计数当像素。标准HTML零SDK请求。
- 62补充检查：held/Enter/Space/Tab、Text节点稳定与改写负例、即时hover、拖出/Reset/模式/已观测resize/旧range释放与新手势、wheel竖向120px只消费一次/横向rail单位-5×delta；Chromium两路径双触点身份、cancel、cancel后click对照、原生touch滚动。六release同Promise、监听退役无新增；三SDK实例Mesh/Material各1→0。
- 完整scopePassed=false/CLI exit1：FF/WK缺少multi-touch move/cancel协议，各两路径五项；六路径headless无真实blur/hidden，合计32NOT_RUN。Chromium SDK收到两条PAL对cancelable=false的touchcancel调用preventDefault警告，完整保存，不静默豁免；源码src/pal/input/web/touch-input.js当前无cancelable guard。此诊断未被冒称为模型、可见性或核心修复。
- [实际报告审计](../../docs/evidence/examples/interactive-engine-improvements/input-s3-audit.json)29/29独立拒绝，基线原始错误保留，结构篡改以新增错误判断而非利用已失败基线。聚焦26/26测试（Lead），strict noEmit通过；PNG测试夹具为合成而非真实证据。
- 原始云端/实体触屏/物理呈现仍未验；不称IER-05完整完成或发布就绪。下一批容器就绪补当前SDK回归，原Puzzle50仍待材料。

## IER-06 S6 受限收口（Lead，2026-10-08）

- [规范报告](../../docs/evidence/examples/interactive-engine-improvements/container-s6.json)保存三浏览器×DPR1/1.25/2的63状态：48 PASS、15 WebKit活父CSS布局呈现FAIL。实际命令exit=1，完整scopePassed=false；90 PNG含27张无SDK WebGL2对照。旧S1～5原始文件身份保留于尝试索引。
- 原生CSS、framebuffer和Camera尺寸均匹配；隐藏保留有效buffer，冷加载Run→Compare→Run只应用最新导航代次；旧range/pointer释放不提交，新输入可用。九行释放各两引用1→0、同一Promise、RO/事件/帧在终态后安静，控件禁用。
- 无SDK对照21/27红色截图通过；WebKit六个class resize状态GPU红色、glError=0、contextLost=false，但compositor截图为页面背景。尚无违反SDK合同的独立证据，不以窗口写入补丁掩盖。
- [审计](../../docs/evidence/examples/interactive-engine-improvements/container-s6-audit.json)24种篡改全拒，保留实际15失败。Input/Container聚焦43/43合同测试通过（合成PNG与真实浏览器分开）。截图设备尺寸允许原生floor/ceil的±1device pixel，CSS质心预算未放宽。
- 原Puzzle50工程与旧workaround未取得，保持NOT_RUN；Sdk三产物未修改，未安装、构建或提交。

## IER-10 误用诊断增量（Lead，2026-10-08）

五类[浏览器原报告](../../docs/evidence/examples/interactive-engine-improvements/misuse-s3.json)三引擎各通过，零pageError；工厂/对象类型/材质/绑定/函数克隆的责任层及正确接法见[指南](../../docs/manual/interactive-diagnostics.md)。

已有可选effect-layout工具在JSON克隆前静默丢函数字段。首轮新增四测试全部失败，其中一个为测试误计包含全局/local的binding数量（已纠正为set1三项），另外两函数消失和循环原生异常是真反例。增量只改工具JSON入口，不改SDK：原AIR_E_EFFECT_LAYOUT包含NON_JSON_FUNCTION/NON_JSON_CYCLE及字段路径；编译JSON回归原样通过。聚焦五套46/46 PASS。

三浏览器各20轮inspector前后refs/mesh字节/pass状态/frame数相同，三自有资产1→0。早期collector把通用warning当作base override告警，仅Firefox误过；S3改为原生状态与明确消费断言，保留S2失败，不伪造生产SDK输出。Scene继承Node的addComponent合同保留；负例仅Component当Node传addChild。console全量保留并在报告聚合，空issues不产生像素PASS；可选模块缺失请求仍NOT_RUN。

## IER-03 当前Water与颜色对照（Lead，2026-10-08）

- 复用现有Water已迁移的AirRenderTarget；三引擎各39检查，共117通过，三条实际子进程exit0。固定状态、独立通道/深度、fin透明与depth-off负例、pointer/rain、resize和释放重建均实测。[规范报告](../../docs/evidence/examples/interactive-engine-improvements/water-runtime-s1.json)附三个原报告/原日志及截图。原Oct5/私有Water参考未取得，不能沿用历史缺口或冒称原参考匹配。
- 增量局部fixture比较相同半平面的原生oblique矩阵与world-space discard，以及base初始化/instance override两条圆形透明阴影路径。[S2](../../docs/evidence/examples/interactive-engine-improvements/color-compare-s2.json.gz)三引擎15状态/15PNG通过，两裁剪图逐字节同色，三透明center=(127,115,0)，base/instance结果相同、blend=true/depthWrite=false。人工看了CH阴影和裁剪PNG。固定预算未提高。
- S1错误法线使原生far-plane多裁2362像素；inspector数组被误读作对象且首CH favicon404。采集时保留失败raw/log，修正配方法线使camera在排除侧，字段访问/favicon/目标颜色识别；不改SDK。独立10种篡改全拒，8条算术合同测试通过。局部shader仅GLSL3验证，不声明其他后端。2026-10-08 按用户要求清理后，旧 raw 替换为失败诊断摘要与原字节 SHA；日志保留，完整旧数组可从 `5a967c7` 恢复。

## IER-07/08 S4 时间轴受限归档（Lead，2026-10-08）

[规范报告](../../docs/evidence/examples/interactive-engine-improvements/timeline-s4.json)与raw保留118 PNG。三引擎×原生/定步形变6行66PNG、实际section短/长滚动6行42状态通过。18组真实pose/scale/camera收敛、Pause/Resume/速度反馈/Reset/Back/Replay/最后目标、晚到timer、旧range释放、10 reset与三引用归还均观测；标签不代替pose，旧代次不回写。

CH/FF idle/本地CPU干扰4行48 cues、4张cue前基线通过；音频目标/Node激活/context-origin/原生帧/截图前后区间分别保存，不称物理首显示或扬声器时间。Mute用post-gain analyser，Pause/Resume保留voice/origin，Seek/Replay替换。自然ended和stopped分开；FF早期240ms恢复读回仍记录，终态continuity等待context实际前进。WebKit无AudioContext/webkitAudioContext两行NOT_RUN，scope=false/exit1。31种篡改拒绝，33条聚焦生产/证据合同通过；合成PNG与真实证据分开。原1188部件/155阶段/约59秒音乐不在本配方。

S1～3尝试身份保留索引：漏step提交/reset/色字段、WK无接口、FF恢复过早和natural end计数错误逐步纠正，不覆写旧日志。

## IER-09 本机短性能试跑（Lead，2026-10-08）

[试跑](../../docs/evidence/examples/interactive-engine-improvements/performance-pilot-s1.json)冻结1秒预热/5秒窗口/3轮、DPR1/2×3负载×截图开关，共36。结果LIMITED/采集exit0：raw帧回调、CPU update/submit markers与截图wall-time、renderer、释放全部记录。独立重算/PNG/组合/时序审计及8种篡改拒绝通过；7条统计合同覆盖非法数、阶次与长帧不剔除。

不做GPU物理时间或DroppedFrames补零；未提供device/budget，3×60s设备验收NOT_RUN。首窗口约10秒内仍有只读时间轴PNG审计并发，保留样本且在规范报告和手册明确混杂因素。不得据此做纯SDK归因或产品达标判断。

## IER-11 S2 实际包消费（Lead，2026-10-08）

[实际安装报告](../../docs/evidence/examples/interactive-engine-improvements/kit-consumer-s2.json)保留tarball/SDK分块、pack/install原输出、TS4.9已安装声明、16份来源代码/合法资产加两生成文件逐字节比对、3引擎×5独立入口。零/build/fallback、零page/console error，默认三身份不变。生成副本只有权威源码，新增手册说明普通接入与限制；不新增API或自动安装依赖。

S1容器固定150ms过早、屏外控件坐标click未触发；S2等待原生camera/frame/token就绪，用实际可见控件可信click后采证。模型/session/nativeFrame/reset与终态检查通过；55/60 PNG通过，5 WK活布局空白保持失败。scope=false/exit1，不能以导入成功换成全平台认证。首轮原报告身份保留；15篡改拒绝，7条合成PNG合同通过。source各完整collector仍为主证据，安装批只是normal/input/reset/resize/release子集。

Orca Worker额度耗尽后上述实施和执行均由Lead完成；未stage/commit/push/publish，未改SDK/抽取源码。原Site/缺失JSON/soft/Puzzle50/实体触屏与设备性能材料仍待提供；完整12项、release门禁没有升级。


## 最终本机集成记录（Lead，2026-10-08）

- 完整库存实际exit1：[121 suites /1080 tests /1076 passed /4既有failed](../../docs/evidence/examples/interactive-engine-improvements/final-test-inventory-s1.log)。新增Input/Container/Timeline/Diagnostics/Performance/Kit/Color全部被发现且通过。四旧失败仍为smoke-29规格/证据/Gallery三条与smoke-30旧矩阵指纹一条，不扩大本任务改旧门禁制造全绿。
- Gallery manifest172例；三新规格此前独立strict检查3 frozen/0 issues。新增展示例状态draft；specStatus frozen不表示浏览器/发布全通过。根typecheck与timeline/misuse/color三个strict tsconfig最终通过，其他例已在对应批检查。
- [11份报告101条当前输入身份复核](../../docs/evidence/examples/interactive-engine-improvements/final-current-input-review-s1.json)无drift/unrecognized；[归档后重算](../../docs/evidence/examples/interactive-engine-improvements/final-archive-validation-s1.json)只剩预期timeline两WK NOT_RUN、kit五WK PNG FAIL；性能LIMITED测量有效、颜色局部scope通过。没有新增浏览器，不继承历史源码身份。
- 实际安装包[压缩字节复核](../../docs/evidence/examples/interactive-engine-improvements/kit-consumer-s2-tarball-audit.json)16来源文件+SDK模块全匹配，与浏览器安装记录一致；临时消费项目已清理，tarball/分块保留可审阅。
- SDK默认三产物仍为起始3a448f02…/3c2b1853…/f2a59819…，没有runtime/build/抽取源码变化。唯一已证反例修复为可选effect JSON工具的函数/循环静默克隆诊断；全局PAL不可取消touchcancel诊断和浏览器compositor/WebAudio限制均如实保留，不冒称核心修复。
- 本机可实施的示例、配方、工具、测试与文档已整合。原云端/Site/17缺失JSON、soft/Puzzle50、实体触屏、多标签长期稳定性、native MSAA采样、设备及性能预算仍NOT_RUN；完整12项与release均未宣布通过。未暂存、提交、推送或发布。
