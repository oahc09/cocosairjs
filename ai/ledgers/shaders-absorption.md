# CocosAirJS 原生 Shader 效果吸收执行台账

执行起点：2026-10-09，Git `1cb71bf`。任务范围来自 `ai/plans/shaders-absorption-task-plan.md`；保留已有 Skills 迁移及其他未提交改动，不提交、推送或部署。

参考固定为 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。禁止引入上游 runtime、TypeGPU、第二个渲染 canvas 或 iframe。实现以原生 Cocos API 为主，公共能力必须由多个真实消费者证明后才提炼。

当前工作：Wave 0 / Wave 1 / Wave 2 Engine Gate 已通过。2026-10-10 三浏览器E03/E04/E05六维全部PASS，允许启动Wave3；Agent Gate仍NOT_RUN。当前依据为[Wave1 Gate](../../docs/evidence/shaders-absorption/wave1-r21-current-gate.json)及[Wave2 Gate](../../docs/evidence/shaders-absorption/wave2-current-gate.json)。

| Wave | 用户获得的结果 | 当前状态 |
| --- | --- | --- |
| 0 | 固定来源与许可证、参数与证据合同、当前原生实现路径和测量边界 | PASS |
| 1 | Noise Dissolve、Thin Film、Sparkle 的实现及六维验收 | PASS（R20 当前身份） |
| 2 | Holographic、Neon、Emboss 的实现及六维验收 | PASS（54维度、117视觉、654边界、900轮退役、27性能配置） |
| 3 | Liquid Metal、Cursor Trail、Glass 的动态资源和多 Pass 验收 | IN_PROGRESS（E07/E08冻结范围PASS，E09未达） |
| 4 | 四个组合效果及参数、颜色、资源、identity 合同 | NOT_RUN |
| 5 | 从真实案例提炼能力，同源文档和 UV/Pass Fusion 实测 | NOT_RUN |
| 6 | 仅用公开资料的独立 Agent Benchmark | NOT_RUN |
| 7 | 三项模拟专项的数值与并发验证，保持 Research/Experimental | NOT_RUN |

Wave 0 分工的执行渠道均为原生子 Agent：A 核实来源/许可证/算法；B 实现 tools/example-local 契约与校验；C 核实源码/声明/产物与能力映射。Lead 负责环境预检、独立审查及 Wave Gate 裁定；最多三个独立子 Agent 同时工作。

Engine Gate 与 Agent Gate 单独记录。不存在真实测量的效果保持 NOT_RUN；基础 SDK 的启动、类型存在性或旧截图不会升级九个效果的状态。缺陷按任务指定九类分类，基础设施失败单独处理。

实际效果交付按任务第 15 节的十三项模板记录。资源验收至少一百次 create/destroy；性能覆盖 720p、1080p 和 mobile DPR，分别报告 CPU 更新、编码/提交、frame time、draw/pass、资源计数、VRAM 估计及可用时的 GPU timestamp。

## Wave 0：2026-10-09 已裁定

证据：[wave0-gate.json](../../docs/evidence/shaders-absorption/wave0-gate.json)。A/B/C 三个原生子 Agent 均提供本渠道十三项终态；Lead 核对 59 原树文件及 5 祖源快照 SHA、42 个能力输入当前身份、30 项 Jest 和 8 项 Node 自测，并进行 10 项独立合成合同检查。所有文档引用通过。

Lead 的持久化原生启动预检为九行（Chromium/Firefox/WebKit × 720p/1080p/mobile DPR 2），全部通过，SDK 前后不变。这是单 Canvas 空场景环境证据，不是九个效果的验证。Chromium 支持 timer 扩展；实际 GPU timestamp 尚未测量。

许可边界已记录：MaterialX/OSL 派生保留 BSD、适用 Apache 和 MIT 通知；Fi-hash 原作者许可未充分证明，直接派生路线排除，可选独立算法且声明不等价。来源许可包与原文身份分别记录，不把合并通知当上游原 LICENSE。

Wave 1 分工：三个原生子 Agent 分别负责 Noise Dissolve、Thin Film、Sparkle 的 example-local 实现、数值/像素 oracle、六维报告及固定交付；Lead 独立复核和集成。此时未修改引擎源码，也没有新增公共效果 API。

## Wave 1：首批历史裁定 BLOCKED（现已由 R20 收口）

三个原生子 Agent 分别交付了本执行渠道的十三项终态；Lead 只读复核当前文件、PNG/oracle、分类和实际退出码。以下定位不改变未达子项，也不代替每项效果的六维终态报告。

| 分类 | 定位与处理 | 当前证据边界 |
| --- | --- | --- |
| AGENT_FAILURE | 曾把基类 Material.overridePipelineStates 当作实际状态切换；改用 Material.initialize 创建明确状态的原生材质 | 本地实现修正，不能据此声称引擎状态覆盖失效 |
| AGENT_FAILURE | Director 更新事件不传 dt；时间更新改用原生 Component.update(dt)，覆盖 pacer 和受控 tick | 源码合同已核实，待最终时间连续性报告 |
| API_DX | WebGL2Queue.submit 只记账，GL draw 在命令调用时立即执行；性能阶段重新命名并分开计量 | [测量口径](../../docs/effects/measurement-methods.md)，不能把队列记账时间冒充 GPU 提交 |
| AGENT_FAILURE | 初版采集器未将 live resize PNG 独立裁定纳入 Gate，存在汇总假绿风险 | 已要求补入实际 PNG oracle、精确范围、原始观测和篡改拒绝 |
| INFRA_FAILURE | 三效果在 WebKit 同页 resize 后页面截图丢失 Canvas 呈现，露出 HTML body 背景 | Lead 的独立 builtin-unlit 原生场景同样复现；同坐标 GL 与 Canvas 导出仍红，页面 PNG 随 body 底色变化。CSS 可见性/尺寸正常，未定位 SDK 核心错误；[原始诊断与无效尝试边界](../../docs/effects/wave1-resize-observation.md)，不以导出或 fresh page 补偿 Gate |

性能采集实行 Lead 串行窗口，三个效果均已结束并关闭自有服务/浏览器。预热、稳定窗口、查询所属帧、disjoint/timeout/删除和包装恢复分别记录；计时不足和范围错配不改绿。主机后台负载不能完全隔离，mobile 是桌面视口/DPR 模拟。

| 效果 | Chromium 六维 | Firefox 六维 | WebKit 六维 | 当前证据 |
| --- | --- | --- | --- | --- |
| E01 Noise Dissolve | 全部 PASS | Performance LIMITED，其余 PASS | Runtime BLOCKED、Performance LIMITED，其余 PASS | [摘要](../../docs/evidence/shaders-absorption/e01-summary.json)；222 case：216 PASS / 5 LIMITED / 1 BLOCKED；47 篡改拒绝 |
| E02 Thin Film | 全部 PASS | Performance LIMITED，其余 PASS | Runtime BLOCKED，其余 PASS | [摘要](../../docs/evidence/shaders-absorption/e02-thin-film-summary.json)；237 declared / 227 measured / 10 skipped；72 篡改拒绝 |
| E06 Sparkle | 全部 PASS | 全部 PASS | Runtime BLOCKED；Performance 未完整（两档 PASS、一档 LIMITED），其余 PASS | [摘要](../../docs/evidence/shaders-absorption/e06-final-summary.json)；60 Visual / 144 Boundary / 300 实例；21 篡改拒绝 |

三效果均各有三浏览器 × 每 app100实例（各300实例）的实际引用/自有资产退役。算法使用独立 CPU oracle 与原生回读、compositor PNG 双层验证；不是截图相似性结论。大型原始报告主要在 output，docs 摘要以 SHA+bytes 绑定；旧失败尝试保留，采集 exit1 与 scoped 只读验证 exit0 分开。全部 Agent Gate 为 NOT_RUN。

E01 Firefox三档、WebKit1080p/mobile的CPU GL派发区间全部量化0，精度未记录，保持LIMITED。E06 WebKit mobile实际1ms时钟下同类区间全部0，保持LIMITED。E02 Firefox mobile请求DPR2但实际DPR1/backing390×844，不满足冻结范围，保持LIMITED。没有用GPU时间替代必需CPU阶段，也没有把DPR期望改成1。

共享库存实际运行：125 suites / 1191 tests / 1187 passed / 4 failed，本轮新增四套111项全通过。失败涉及旧Gallery规格/合规/布局以及浏览器矩阵当前指纹；本轮新示例声明字段缺失另行修正，不以旧失败标题豁免新问题。全量测试产生的spec-compliance报告保存到output独立attempt，并将执行前洁净的正典恢复至HEAD，未丢弃实际失败记录。

三个示例均保持Gallery draft。通用Gallery的window.__lifecycle接口尚未接入，分类EXAMPLE_GAP；不虚假声明resource-released。独立效果Resource采集已通过不等于通用Gallery生命周期采集已执行。当前没有SDK/抽取源码修改，没有公共效果API，没有提交、推送或部署。完整当前十三项交付见[Wave 1交付记录](../../docs/effects/wave1-delivery.md)。

## 2026-10-09：Wave 1环境与性能补充

原上表与六维Gate保留为其冻结输入时点的历史记录。当前补充范围见[环境追踪](../../docs/effects/wave1-environment-followup.md)：Orca Worker的R5 Thin Film实际OS exit0、9/9性能profile通过，Lead只读verify及17项篡改拒绝；[E02补充摘要](../../docs/evidence/shaders-absorption/e02-performance-environment-summary.json)。

Sparkle新采集工具R6/R6B存在占位与校验误报，Lead回归明确拒收；Worker R6C因额度异常终止，没有完成回执。Lead接手修复并验证5套135/135，最终R7独立采集9/9性能profile PASS、OS exit0、signal=null、48229ms、全输入SHA前后不变；独立9行数值复算与32种篡改全拒。[E06补充摘要](../../docs/evidence/shaders-absorption/e06-performance-environment-summary.json)。引擎源码/SDK仍零改动，不能将工具/Agent问题记为SDK缺陷。

上述Performance范围通过不等于完整Engine或Wave Gate。E01的旧计时限制尚未补采；WebKit活resize仍BLOCKED、Wave1保持BLOCKED、后续Wave和Agent Gate未运行。新增合同套件已实际执行，完整共享库存仍是上次125/1191/1187/4时点，尚未重新运行并更新，不混称当前全量通过。

随后R8由Lead完成E01独立补充采集，原例子/SDK不变，2套51/51通过；OS exit0、signal=null、49446ms、9/9性能配置通过、完整输入前后相同。真实6份自有资产+1份EffectAsset归还，方法包装恢复、监听与页面/服务关闭齐全；只读verify与29种篡改拒绝通过。[E01补充摘要](../../docs/evidence/shaders-absorption/e01-performance-environment-summary.json)。当前E01/E02/E06各自补充Performance 9/9 PASS，原报告仍保留其历史输入时点，Wave1的WebKit Runtime BLOCKED未解除。上一段“E01尚未补采”记录的是R7完成时点，不作为当前结论。

R9完整库存更新实际exit1：131套/1338项/1334通过/4失败，新增6套147项均通过，Shader10套共258项通过；4失败仍是上次smoke-29规格/合规/Gallery字段及smoke-30矩阵身份。原合规正典SHA `7dc1a9c5…`执行前后一致，测试生成的实际失败报告另存`lead-w1-r9-inventory-spec-attempt.json`，没有丢弃失败。三份当前性能只读verify再次全通过，原始日志/OS驱动/清理与78种篡改拒绝见[当前十三项补充交付](../../docs/effects/wave1-performance-followup-delivery.md)。当前不推进Wave2，无提交/推送。


## R20：2026-10-10 当前 Engine Gate PASS

Lead 实际串行六功能/性能子进程及一次 Gallery，七次 OS exit0、signal=null，当前 SDK 三产物前后 SHA 不变。正式 [Gate](../../docs/evidence/shaders-absorption/wave1-r21-current-gate.json) 54 项六维全部 PASS，705 测量案例；Gallery 18 组、36 PNG、54 资产引用 1→0，三效果资源共900轮。

Orca Worker 小三实施 scoped WebKit launcher、HTTP 隔离/DPR helper、Gallery bridge/生成器；Lead 审查、补强 validator/PNG/闭包与OS回执、实际采集和正式裁定。Windows WebKit 仅通过公开 ignoreDefaultArgs 排除默认 disable-accelerated-compositing；同页 resize compositor 已真实恢复，没有 fresh-page 或 Canvas 导出补偿。Firefox 隔离导航后 DPR2 恢复及三引擎时钟精度复核全部通过。

R19 Sparkle performance 的 missing import FAIL 与 R20 formal-attempt1 的旧 HTTP 头字段 FAIL 均保留。最终 checker 接受两种真实头记录但拒矛盾；[十三项交付](../../docs/effects/wave1-resize-gallery-closure-delivery.md)记录当前范围、分类和限制。当前报告不重写历史 scoped waveGate 标记，汇总根据原始字段和 PNG 独立裁定。

Focused 15套340/340；字段适配后 Wave Gate 16/16（新增8项，不重复统计旧执行）。三个严格示例检查、生成器两次字节幂等通过。全量库存另记录实际结果，Agent Gate、实体设备、release 不借此升级。Wave2可开始；未验收效果不记 PASS。


### R21 最终元数据与 Gallery 身份

完整库存实际 exit1：136套1428项、1423通过/5失败；shader15套全部通过。全局 API evidence 检查发现22处漂移，其中本轮Thin Film MeshRenderer.mesh一处已修正为L132，三例23条独立核对无误；其余21处属于其他示例，未扩大修改。由于metadata在Gallery输入闭包中，最终Gallery必须重新采集到 lead-w1-r21-gallery.json；六功能/性能报告未受该非runtime元数据变化影响，保留R20真实输入。当前正式汇总更新为 wave1-r21-current-gate.json，旧R20 Gate及审计作为修正前历史保留。

R20审计第一次误删不存在precision字段，实际exit1且记录AGENT_FAILURE；修正clockPrecision后19种变异全拒。库存执行生成的spec-compliance报告另存output，执行前原字节已恢复（canonicalRestored=true），未从HEAD覆盖并发改动。


## Wave2 E04：2026-10-10 实施与首次审查

执行渠道：Orca Worker 小三实现Neon例/GLSL/独立oracle/参数/资源/采集工具，52 Node合同测试、strict和格式检查通过；未执行浏览器，不升级Engine/Agent Gate。Lead执行Chromium functional诊断（lead-w2-e04-functional-attempt1.json + OSreceipt/log），真实exit1、输入SHA前后不变、page/console error零。默认/box/rotation等画面可见，glow-wide DPR1/2的RGBA8及compositor oracle未过：实际蓝255、错误预期275/279，PNG偏差5码值。格式边界处理属于AGENT_FAILURE验证实现缺口，不定位为SDK bug；不放宽±2码值。

Lead独立review suite修正自身require路径和Jest.each空数组声明后，实际12例7PASS/5FAIL（attempt3日志保留，早先无效attempt1/2不计正确性证据）：两个RGBA8转换反例、resource nested total、performance null frame total、collector null engine total。只读对真实失败报告做dpr/build/cleanup/Agent旗标篡改，错误集合不变，说明相应字段检查缺失；要求新增真正接受基线及变异拒绝，不能借已有glow错误冒称拒绝了所有篡改。

资源/性能工具需先补齐严格检查，再由Lead冻结输入复采。Wave2 Gate未通过，Wave3不开始。旧Wave1R21正式Gate不受新E04路径影响。未stage/commit/build SDK/install。

## Wave 2 E04：2026-10-10 第二次功能采集未通过

执行渠道：Neon 实施/首轮审查修复为 Orca Worker 小三；本轮独立回归与浏览器采集为 Lead。`output/shaders-absorption/lead-w2-e04-functional-attempt2.json` 的外层 OS 回执 exitCode=1、signal=null、inputsUnchanged=true。Chromium/Firefox 各 13 组、WebKit 11 组，已取得的 37 组 PNG 与透明 RGBA8 读回数值均通过；这不升级完整功能 Gate。

剩余为 AGENT_FAILURE：普通模式未采到可信 release 事件；跨视觉案例的实例判定未区分诊断探针重建及 rounded-box→circle 真实形状切换；WebKit DPR2 新页未等待 __neon.ready 即访问。Lead 新增帧/时间字段缺失及负帧三条回归，当前 15 项中 12 通过、3 失败；生产 probeAudit 确实接受这三种非法回执。旧报告和日志保留，性能采集尚未启动。

## Wave 2 E04：2026-10-10 六维当前 PASS

Orca Worker 小三完成实施和接线/合同审查修复；Lead 独立回归、冻结输入、串行采集及裁定。[当前 E04 Gate](../../docs/evidence/shaders-absorption/e04-neon-current-gate.json) 六维 PASS，subset=true/completed=false，Agent Gate/Wave2 整体 NOT_RUN。功能 attempt3 三浏览器 39 个视觉案例+39 组透明 RGBA8 probe、312 参数边界+18 非法拒绝、300 资源 cycles、可信参数/暂停/恢复/重置/释放、同页 resize 均通过；性能 attempt1 九 profiles 通过。两外层 OS exit0/signal=null/inputsUnchanged=true，窗口不重叠。

[真实克隆审计](../../docs/evidence/shaders-absorption/e04-neon-actual-audit.json) 两基线接受、22 种篡改全拒，browserRunsAdded=0。Focused 三套 113/113；全量库存仍是此前真实失败结果，新 Neon 套件待 Wave2 合并时统一刷新，不手填通过库存。Gallery manifest 只新增 Neon，175 个已有条目逐项保持原样；此处未声称 Neon 的单独 Gallery harness 已通过。固定十三项详见 [交付](../../docs/effects/neon-validation-delivery.md)。

Chromium GPU timestamp 中位数720p/1080p/mobile约0.256/1.033/0.867ms；FF/WK该扩展不可用。WK AFTER_DRAW 中位数19.12–20.44ms，如实记录，不承诺60FPS或据此定性 SDK 性能缺陷。未修改引擎源码/SDK、未构建引擎、未安装/提交/推送。E05 Emboss 后续实施交 Orca Worker 小三，Lead 保持 E03 Holographic 与独立验收职责；Wave2全门禁未过不得进入Wave3。


## Wave2 E05：2026-10-10 双相机 RTT 六维当前 PASS

执行渠道：Orca Worker 小三实现 Emboss 与生产 child-RT 退役 helper；Lead 独立审查、复跑109/109 Jest、串行真实采集、审计与正式接线。[当前 Gate](../../docs/evidence/shaders-absorption/e05-emboss-current-gate.json) 六维PASS：三引擎39组PNG+透明RT probes、120参数边界+18非法拒绝、300轮六引用与child RT退役、可信控件、同页resize、9性能profiles。功能attempt2与性能attempt1两OS exit0/signal=null/inputsUnchanged=true，窗口不重叠；每帧2 draw/2 beginRenderPass。

首轮attempt1的真实FAIL保留：相机detach回调未消费，浅色背景残留污染resize oracle，均AGENT_FAILURE。生产回归和新采集修复，未改SDK/src或±2容差。两实际正例的30种篡改全拒，详见[审计](../../docs/evidence/shaders-absorption/e05-emboss-actual-audit.json)。叶级collector缺失pageErrors/consoleErrors数组仍会接受，Lead增加独立Wave2生产门禁：19合同测试通过，两当前Gate只读复核通过，4种真实正例日志删除均被汇总拒绝，不把缺失当空。

[固定十三项](../../docs/effects/emboss-validation-delivery.md)记录范围与限制。Gallery只新增Emboss，原176条目逐项保留；单独Gallery harness仍NOT_RUN。完整库存保留此前实际失败结果，不手填新套件PASS。E03改由小三接续实施，Lead负责独立审查与串行采集；Wave2整体和Agent Gate仍NOT_RUN，不进入Wave3。未构建引擎/安装/stage/commit/push。


## Wave2 E03及整波：2026-10-10 当前Engine Gate PASS

Orca Worker 小三实施Holographic并修复元数据/光向/上游轮廓；Lead独立审核发现equal旗标假绿、NaN穿透、speed0未绘制、帧计数绑定及PNG呈现时机，补齐原始像素和提交帧校验。实际从固定commit获取kit/index与materialParts，来源/HTTP200/字节/SHA/UTC时间入闭包；旧失败获取及错误日期记录保留并另附更正，不能概括为环境离线。

E03功能attempt1/3/4真实OS exit1，attempt2旧collector exit0但独立审核未闭合，均保留历史；attempt5功能三浏览器与attempt1性能9profiles实际OS exit0/inputsUnchanged=true，窗口不重叠。110个focused E03合同通过，真实双基线37种篡改拒绝。AFTER_DRAW后Director递增totalFrames，所以snapshot.frame=receipt.frame+1；speed0两个时刻都step后读回，伪造相同白图也受oracle拒绝。Firefox旧时间PNG取到了前一帧，冻结模拟时间等待双rAF+80ms后通过，算法及±2容差未改。

[Wave2当前Gate](../../docs/evidence/shaders-absorption/wave2-current-gate.json)实际重算三个叶级与Wave1前置：54维度PASS、117标准视觉、654参数边界、54非法拒绝、900资源轮、9同页resize、27性能profiles；132PNG含时间及resize。三个真实审计37/22/30种篡改全拒，汇总12种全拒。Gallery只新增Holographic并保留177原条目，现178项。Agent Gate/单独Wave2 Gallery harness仍NOT_RUN；projectCompleted=false，nextWaveEligible=true。

[固定十三项交付](../../docs/effects/wave2-validation-delivery.md)和[公共能力初稿](../../docs/effects/wave2-capability-proposal.md)已建立；目前不升级core API，未改SDK/src/build或安装/stage/commit/push。完整库存另行刷新并保持真实失败口径。Wave3可开始，先由同一Orca Worker实施E07，Lead负责独立采集，性能窗口继续串行。

完整库存终态（Lead 实际执行渠道）：2026-10-10T01:33:56.545Z–01:39:31.617Z，OS exitCode=1、signal=null，146套1786项、1781通过/5失败。新增10套358项全部通过；五失败为旧规格冻结/API evidence行号/规格合规/Gallery字段白名单/历史browser-matrix SDK身份。实际生成的合规副本中E03/E04/E05均无findings。`lead-w2-inventory-os.json` 与完整日志保留，正典恢复执行前字节（canonicalRestored=true），不将失败库存改写为PASS。

Orca Worker 小三严格只读终态复核：生产Wave2 validator、W1前置及3叶级SHA、E03输入27+参考9、原始时间帧/确定性/资源/性能、实际报告克隆拒绝、15像素60通道抽样均通过；未重跑浏览器。由此启动[Wave3实施分工](../../docs/effects/wave3-kickoff.md)，先实施E07，E08/E09和Wave3 Gate尚未验收。

## Wave3 E07：2026-10-10 首次实施与真实审查

Orca Worker 小三实施 Liquid Metal、独立oracle、参数与六维采集器，Node合同72/72，strict与格式检查通过；无浏览器采集，不升级Gate。Lead 首次 Chromium functional `lead-w3-e07-functional-attempt1.json` 实际 OS exit1/signal=null/inputsUnchanged=true；13组视觉/线性RT读回呈系统性偏暗，page/console errors均零。

源码定位为AGENT_FAILURE：GLSL硬编码的dark/light线性色阶不等于所声明#141414/#eef0f6的sRGB解码，而独立CPU oracle解码正确。Lead新增3条review回归实际0/3通过（两个色阶数值反例、性能冻结计划缺少low/high双档）。现有9profile性能计划只测high，未满足质量档位实际成本验证；要求补齐两档精确tuple和实际参数/观测绑定，不以CPU调用次数冒称性能证据。旧attempt及±2容差保留，E07六维/Wave3/Agent Gate未通过。

## Wave3 E07：2026-10-10 六维当前PASS

Orca Worker 小三修复色阶并实施三profile×两quality性能计划；Lead独立审查、串行采集和正式裁定。[E07 Gate](../../docs/evidence/shaders-absorption/e07-liquid-metal-current-gate.json)六维解析范围PASS：三浏览器39标准视觉/透明RT、282边界+18非法拒绝、300轮三引用退役、3同页resize、时间/确定性/speed0真实绘制、18串行性能窗口。功能attempt2与性能attempt1两个真实OS自然exit0/signal=null/inputsUnchanged=true，窗口不重叠。

叶级collector仍会接受删pause事件或更改tierStart非quality参数，Lead增加独立Wave3生产门禁重算五动作齐全及tierStart/fixedStart/fixedEnd全参数、时间、实例和backing；实际PASS基线两类克隆均由汇总拒绝。两正基线46种篡改全拒，focused4套114/114。Lead补充validator首次错误套用功能背景，按main.ts实际性能默认[9,10,14]纠正，不改变原报告。首轮90错、报告/log/OS/frozen全部保留。

Gallery只新增Liquid Metal，原178项逐项相同，现179项。SDK三产物与抽取源码不变；MaterialX替代Fi-hash同类非等价，quality是uniform分支，速度改变重映射相位。Chromium GPU中位数high/low：720p 0.477184/0.538624、1080p 1.527808/1.433600、mobile 1.685504/1.638400ms；不保证low更快，FF/WK GPU不可用。[固定十三项](../../docs/effects/liquid-metal-validation-delivery.md)记录完整范围。全量库存仍保留Wave2真实失败结果，本轮新增库存待整波刷新；Agent/单独Gallery/长时/实体设备未验。接续E08由同一Orca Worker实施，E09和Wave3 Gate未达，不进入Wave4。

## Wave3 E08：2026-10-10 Lead接管与六维收口

小三因429/code1308五小时限额异常中止（重置时间2026-10-10 11:59:08），没有本任务完整终态；其部分源码/参考获取由Lead冻结保存后接管实施、审查与采集，不借其他渠道冒称Worker已完成。当前[E08 Gate](../../docs/evidence/shaders-absorption/e08-cursor-trail-current-gate-r2.json)六维PASS：三浏览器36标准视觉/透明RT、45PNG、84边界+18非法整批拒绝、300轮四引用退役、3同页resize、可信鼠标/协议touch各3例、9串行性能窗口。功能attempt7、性能attempt3两个OS自然exit0/signal=null/inputsUnchanged=true；37种真实报告篡改全拒，focused两套80/80。

历史attempt1 resize先于异步backing完成而全黑，修正为同页等待真实backing后再次绘制；attempt5 strict事件名类型和旧式TouchEvent强制门禁失败，修复后以实际primary PointerEvent touch、21次可信tap及独立host replay验收。原TouchEvent数组仍诚实为空，不冒称实体滑动/触屏；全部失败与历史闭包漂移报告/log/OS/frozen保留。Lead最终审计脚本两次读错字段在正式生成前修正，未据失败基线造假绿。问题均AGENT_FAILURE，未发现确证新ENGINE_BUG。

原生CPU recorder→64×1 RGBA16F数据纹理→材质quad，无上游runtime/TypeGPU/额外canvas。实际参考是三子弦距离与指数深度年龄混合，非精确变半径圆锥或“最新覆盖段硬胜出”；两线性颜色端点与上游差异完整声明。9窗口稳态每帧真实64texel/512字节上传、原生pass/draw存在且计时内readPixels=0。Chromium GPU中位数720p/1080p/mobile为4.443136/5.431296/4.959232ms；FF/WK GPU unavailable。所有SDK/抽取源码不变。

Gallery179→180，旧179项逐项相同。算法、[固定十三项](../../docs/effects/cursor-trail-validation-delivery.md)、只读Gate工具和原始闭包已接线；全量库存仍保留Wave2真实5失败，新增库存待整波刷新。实体设备、长时、多标签页、独立Gallery/Agent Gate未验；E09与Wave3整体仍未通过，不进入Wave4。未stage/commit/push/install/build SDK。

## Wave3 E09与独立汇总（2026-10-10）

Lead完成Glass解析/Vogel原生两遍路线，非Gaussian compute。34输入+5参考冻结，功能attempt4/性能attempt1自然exit0、inputsUnchanged=true；三引擎45标准视觉/48PNG、294边界+18非法、300轮六引用退役、3同页resize、9真实27tap性能窗口。35实际克隆全拒。

E08 metadata误用返回对象按AGENT_FAILURE纠正；功能attempt7+性能attempt3重新冻结采集，r2 Gate/审计为当前，旧文件全部保留。新增API行号检查含定位helper和其API库存闭包，16回归全过。Glass性能pure checker非法profile TypeError另修复并补17合同。当前六套188/188，不称全库存通过。

[Wave3 Engine Gate](../../docs/evidence/shaders-absorption/wave3-current-gate.json)完整声明范围PASS：54维/120标准视觉/141PNG/660边界/54非法/900资源轮/9同页resize/36串行性能窗口；Agent/独立Gallery NOT_RUN、projectCompleted=false。汇总首次遗漏NODE_PATH不能解码pngjs，未写Gate；配置已有tooling后重算全过，非SDK失败。Gallery180→181，旧180项逐项保持。实测与限制见[十三项交付](../../docs/effects/wave3-validation-delivery.md)。未提交/推送/安装或修改SDK。

完整库存终态（Lead实际执行）：2026-10-10T04:02:33.271Z–04:08:22.776Z，OS exitCode=1/signal=null；156套2088项，2083通过/5失败。新增10套302项全部通过，五个失败名称与Wave2一致（规格冻结、API evidence行号、规格合规、Gallery字段白名单、历史browser-matrix SDK身份）。`lead-w3-inventory-os.json`和完整日志保留；实际生成的合规副本另存，正典恢复执行前实际字节，canonicalRestored=true。不借效果Engine Gate覆盖全仓库失败。

Orca Worker小三已提交严格只读终态：生产汇总PASS、三叶级/输入/参考SHA零漂移、OS自然退出、API定位与独立像素抽样（E09三capture共51点零超差）、资源/双遍性能、篡改拒收交叉复核通过；零写入/浏览器/Jest/构建。Lead核对回执中字段：E09实际使用fixedStart/fixedEnd.params，E08r2与E09独立审计37+35种，不重复计算同一文件。Wave3前置及复核成立，可以按计划开始Wave4；Agent Gate与独立Gallery仍NOT_RUN。

## Wave4 C02：2026-10-10 实施与独立审查

Orca Worker小三实施ThinFilm+Neon原生组合，报告44项Node合同、strict和格式检查通过；零浏览器采集，不升级Engine Gate。Worker已更正Wave3回执的fixedStart/fixedEnd、37+35去重及JSON克隆NaN变null事实；原始NaN与malformed null拒收不混称同一种执行。

Lead源码与独立数值复核发现AGENT_FAILURE：Thin Film的phase读错uniform（c1.x实际为saturation）、theta错误使用phase替代time且main未上传time；source-over后提前clamp破坏关闭Film时Neon HDR等价；alpha≤0.001阈值将仍非零的Film RGB丢失；collector残留不存在的quality/speed参数及六profile档位；母oracle及其参数定义未纳入身份闭包。性能checker能接受非beginRenderPass命令、非draw派发及窗口readPixels，还会对非法profile抛TypeError。

Lead新增13项独立回归实际2通过/11失败，命令`npx jest --runInBand test/smoke/shaders-film-neon-review.test.ts` exit1。接受基线与删除某帧命令负例通过，三个错误派发/读回篡改从真正接受基线出发仍未拒绝；不是借失败基线制造审计绿。纯数值：Neon母模型蓝1.570336而组合被clamp至1；Film alpha约0.000002595仍含非零RGB却被归零。要求Worker先修复接线及独立正例/篡改合同，冻结前不启动浏览器/性能，不放宽±2或改母效果oracle。SDK/既有九例及Wave1–3关闭输入保持不变。

Worker修复HDR/小alpha/phase时间槽及初轮checker，Lead首次真实Chromium采集（2026-10-10T04:42:32.895Z–04:42:49.514Z）`lead-w4-c02-functional-attempt1.json` OS自然exit1/signal=null/inputsUnchanged=true，90个验证错误；page/console errors均零。13组透明RT数学probe和100轮资源独立审计通过，画面原生呈现，但不能升完整功能Gate。

剩余AGENT_FAILURE：新oracle把opaque clear背景合成后的screen alpha错误改为source alpha（both-off实际[8,9,12,255]、错误预期[8,9,12,0]）；collector实际文件仍有speedZero/速度参数提交及旧时间不变性条件，和Worker“已改暂停”回执不一致；合法profile id但缺viewport仍在perf checker抛TypeError。Lead增加3条回归，当前16条13通过/3失败。既有13回归修复成立，不借此宣称完整collector正例或浏览器通过；要求补完整被接受的functional/performance夹具及不少于15项实质变异，再复采。性能窗口尚未启动，SDK/source与旧Gate不变。

### C02采集器追加独立审查（2026-10-10）

Orca Worker小三最新修复通过原16项Lead回归，但已如实撤回“完整acceptance已完成”的先前声明；独立acceptance文件尚不存在。Lead续加14项，当前30项17通过/13失败（实际Jest exit1）。完整时间观测NODE_CONTRACT正例真实通过，九个时间/参数/暂停态/回执/dt变异均从该接受基线出发仍未拒绝；原始NaN直接赋值测试，不经JSON变null。合成PNG只证明合同，不计浏览器Gate。

新增AGENT_FAILURE：functional生成段仍引用正常页局部变量pauseAfter（应读temporalPauseAfter），会在下一轮真实采集抛ReferenceError；pause/resume after缺时间/参数/帧回执绑定，恢复时间未对dt；窗口readPixels字段缺失可通过，合法updateBuffer与真实beginRenderPass同时存在却被误拒；both-off全部透明源对应正确不透明背景PNG仍因无lit采样点被误拒。Lead首轮新增fixture误用了jsdom未提供的structuredClone，改为仅复制有限参数的JSON克隆后确认正基线通过，再取得上述真实拒收缺口；不将夹具错误算SDK或生产错误。

Worker下一任务限C02采集器/oracle/性能合同与完整acceptance补齐；Lead回归不得改，旧报告不得覆盖，零浏览器/性能窗口。修复及格式冻结后由Lead串行重采。Engine/Agent/Wave4 Gate仍NOT_RUN；SDK/既有九例/关闭Wave1–3输入未修改。

Worker中间回执修复A–D，Lead实际复跑原30项与自有47项合计77/77通过，确证此前13个反例已修复；Task E完整acceptance仍未创建，不能称任务终态。继续结构审查新增12项（真实命令样本在Lead正例改为main实际包装的bindDescriptorSet），现在Lead42项31通过/11失败。暂停/恢复前态、同实例、绘帧推进、backing与冻结1/60步长仍缺绑定；结构畸形的commands/draws/gpuSamples仍可能抛TypeError，queryEvents变异已能拒。全部新变异从已接受完整时间正例或性能正例出发，没有新增浏览器采集或SDK修改。继续原任务补齐完整functional/performance正例和实质拒收，不因中间回执重新询问执行授权。

### C02三浏览器实测与组合Gate缺口（2026-10-10）

Orca Worker正式回执完成采集器修复并新增acceptance，Lead实际三套115/115（Lead42、基础47、acceptance26）；完整夹具是单引擎功能及单引擎三个性能profile，不能称已覆盖合成三引擎九tuple。Lead真实functional attempt2三引擎采集2026-10-10T05:17:54.021Z–05:18:39.943Z、performance attempt1串行九窗口05:19:04.687Z–05:20:37.141Z，两个OS自然exit0/signal=null/error=null/inputsUnchanged=true，互不重叠。实际39标准视觉/48 compositor PNG（39capture+6temporal+3resize）、342边界/18非法整批拒绝/300资源轮/3同页resize；九profile环境COI、DPR/backing及完整时钟标定通过。Chromium GPU中位720p/1080p/mobile约0.537600/1.623040/0.929792ms，FF/WK GPU timestamp不可用；不是物理移动设备性能。

当前两份原始报告在生产collector下PASS，但完整C02组合Gate未签发。独立真实克隆审计`lead-w4-c02-contract-review-audit.json`从两个接受基线出发18种，12拒绝/6被错误接受：删除pause/resume实例身份；重复性能profile；更改fixedStart/fixedEnd效果开关；删除fixed实际状态；篡改fixed backing；将三份归还引用kind全改mesh。这些均AGENT_FAILURE，需要强绑定实际workload及精确profile/资源类别，不能用报告自报PASS覆盖。

另有组合计划EXAMPLE_GAP：GLSL两层分别计算中心distanceField(p)，尚未显式共享中心结果，不借潜在编译器CSE冒称共享数据只生成一次。DOC_GAP：UPSTREAM与效果说明仍写废弃alpha>0.001阈值、角平滑子集与共享lightAngle耦合说明也需校准。Lead新增共享中心与文档两项回归，当前44项42通过/2失败。下一轮只补C02组合合同/文档/精确三引擎acceptance，完成后重新冻结采集；当前attempt1/2及性能attempt1保留为修复轨迹。SDK/母效果/闭波Gate不变，Wave4与Agent Gate仍NOT_RUN。


### C02当前六维收口（2026-10-10）

Orca Worker完成共享中心SDF与组合合同；其单引擎acceptance剩余项由Lead接管，完整三引擎功能39capture/性能九tuple正例及40项acceptance、独立单次OETF/非零Alpha金标补齐。Lead实际三套131/131（基础47+review44+acceptance40），不是沿用Worker单引擎117项的范围。API evidence now实际调用生产checker，补fixed frame/CSS与temporal GPU backing必填绑定；SDK/母效果/关闭Wave1–3输入未变。

Lead新functional attempt3（05:38:58.768Z–05:39:41.739Z）和performance attempt2（05:40:17.286Z–05:41:50.165Z）OS自然exit0/signal=null/error=null/inputsUnchanged=true，34输入+6参考同闭包、时间不重叠。三引擎39标准视觉/48 compositor PNG/342边界/18非法/300轮三引用1→0/3同页resize/九性能窗口全部当前PASS。Chromium GPU中位720p/1080p/mobile=0.425984/1.564672/0.923648ms，FF/WK不可用；AFTER_DRAW不是显示帧率。实体设备/GPU物理量未测。

实际两个接受基线structuredClone 44变异全拒，包括前轮六个错误接受项；直接NaN不经JSON变null。首次finalize审计误改未消费的phase.crossOriginIsolated（实际字段coi），保留lead-w4-c02-finalize-attempt1-diagnostic.json并纠正为真实变异，不算生产/SDK缺陷。当前[C02 Gate](../../docs/evidence/shaders-absorption/c02-film-neon-current-gate.json)与[十三项交付](../../docs/effects/film-neon-validation-delivery.md)成立；旧attempt1 FAIL与attempt2/performance1旧身份均保留。Gallery 181→182，旧项逐项deepEqual；独立Gallery harness仍NOT_RUN。完整Wave4/C01/C03/C04与Agent未完成，不推进Wave5。完整库存沿用上轮156/2088、2083通过/5既有失败，未重写正典。


Orca Worker小三C02严格只读终态成立：生产Gate/两原始报告当前PASS，34+6输入参考零漂移；44实际审计+9Gate审计核对；自行六类结构化克隆和原始NaN七项全拒，三capture×15点=45个独立PNG点无超差。仅只读，未重跑浏览器/性能。回执“3引擎×18维”文字更正为三引擎合计18维（每引擎六门），没有54维C02范围。允许继续同一Wave4的C01，不能解锁Wave5/Agent Gate。

### C01算法与原生接线初审（2026-10-10）

Orca Worker小三提交中间产物，真实26项Node合同通过但明确未建独立acceptance、Holographic/Emboss核心链被简化，零浏览器/性能采集。Lead新增独立母效果数值与源码接线回归17项，2026-10-10T06:16:44.089Z–06:16:49.075Z实际OS exit1/signal=null/error=null/inputsUnchanged=true：1通过/16失败；原始JSON、完整日志、OS与冻结身份保存于output/shaders-absorption/lead-w4-c01-initial-review*。不借Worker基础合同通过升级六维或Wave Gate。

确证AGENT_FAILURE/EXAMPLE_GAP：Holographic缺完整pillow/crinkle/light链且holoCrinkle无效；Emboss中央差分被改为前向差分、双空间阴影缺失、UV warp计算后未用于实际采样；Holo关闭时透明归零而非约定的非零中性卡片输入；Sparkle再次EOTF解码已经线性的RT、CPU未保留两层四邻居、seed无参数接线且GLSL函数调用先于声明；attachCamera两个detach回调均被丢弃，只有bindColor解绑；collector保留C02开关字段和三引用长度，无法接受C01实际七引用。单次OETF显示复制金标通过。当前没有新SDK缺陷证据。

继续原授权由同一Orca Worker修复完整母算法、真实中性输入与旁路、两RT独立相机解绑及C01采集合同，补齐三引擎功能与九性能tuple的完整接受正例和实质篡改拒收。Lead回归和历史产物不得修改；修复冻结前不启动浏览器/性能窗口。C01六维、Wave4、Agent保持NOT_RUN，不推进Wave5。

Worker中间回执原17项已通过，Lead读取实文确认CPU母模型接线修复与detach回调持有成立，但不能据此认定GPU算法已改。追加11项真实独立回归，2026-10-10T06:39:27.922Z–06:39:31.648Z OS exit1/signal=null/error=null/inputsUnchanged=true：合计28项17通过/11失败，保存lead-w4-c01-followup-review*。GPU仍简化Holo/Emboss，Emboss的dispScale在声明前使用，Sparkle函数重复定义且blink仍16次幂；seed未上传，GPU中性输入仍全零；CPU实际采样仍未消费warp/NEAREST纹素中心且误用不存在的specRgb而漏highlight；neutral checker垂直坐标少乘8；checker仍读单数退役字段，身份闭包仍缺真正依赖的三母oracle/参数定义。完整acceptance仍未创建。继续同一修复任务，不启动浏览器，不将仅CPU回归绿升级六维。


### C01限额接管、完整算法与六维收口（2026-10-10）

执行渠道：Orca Worker小三初稿与部分CPU修复；429/1308使用限额异常中止（提示17:03:39重置），不是成功终态。Lead接管，发现CPU存在重复aspect声明SyntaxError、GPU母算法仍未同步、collector调用不存在的linearProbe。首个修复脚本require报错后修复，未伪造成功；接管前源副本/三SDK身份保存lead-w4-c01-takeover-before。没有新SDK缺陷证据，均AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP。

Lead同步完整Holo前向stencil/pillow/crinkle/light/flake链、完整Emboss中央差分/two-shadow/highlight/真实UV warp、Sparkle两层四邻居/blink^8/真实CSS网格与seed；CPU按实际NEAREST纹素中心采样、两次RGBA8预乘量化。原基础金标选择的y80被warp到轮廓外，改选真正可见的y85，未放宽容差或修改数学。增加公开RT线性诊断，不额外canvas；修复perf状态初始化次序。Emboss关闭真实禁用相机并改采RT1，实际draw3→2，两RT仍持有至release；中性Holo为非零棋盘。两attachCamera回调独立消费，7kind精确1→0、assetsValid实测数组、两RTdetach/dispose、所有可信事件及三pass性能合同补齐。

三套105/105（基础26+Lead28+完整acceptance51），合成功能三引擎39 capture/性能九tuple只是NODE_CONTRACT，不冒充浏览器。strict/Prettier通过；8条API证据生产定位核对，实际闭包38输入+11参考。首次CH和all功能实测均PASS；首次performance all-attempt1真实OS exit1，只有FF mobile fixedStart两RT仍390×844而canvas已780×1688，原因是DPR修复后未提交原生同步帧。生产gate正确拒绝，原始FAIL/日志/OS/冻结身份保留。补计时外两次step(0)后重新冻结，功能与性能均复采，不用旧身份继承PASS。

当前functional-all-attempt2 UTC07:05:18.431–07:06:04.628、performance-all-attempt2 UTC07:06:32.326–07:08:07.741，两OS自然exit0/signal=null/error=null/inputsUnchanged=true，阶段不重叠。三引擎39视觉/294边界/18非法/300资源轮七引用（2100配对归还）/3同页resize/9串行性能窗口；48 compositor PNG=39标准+6temporal+3resize，非48算法case。默认实际3draw，emboss-off实际2draw；page/consoleError均0。CH GPU中位720p/1080p/mobile为1.746944/3.889152/4.302848ms；FF/WK不可用，AFTER_DRAW不是显示FPS，0ms低于精度不代表零成本，物理GPU内存和实体移动性能不可用。

[C01当前Gate](../../docs/evidence/shaders-absorption/c01-laser-card-current-gate.json)与[十三项交付](../../docs/effects/laser-card-validation-delivery.md)成立：两个接受真实基线56类structuredClone变异全拒，直接NaN不经JSON；Gate另13类全拒（含伪GPU成本与scope膨胀），零追加浏览器。SDK三指纹3a448f02/3c2b1853/f2a59819未变；未改src/build/母效果。Gallery182→183，旧182项deepEqual保留，独立Gallery/Agent NOT_RUN。C03/C04与完整Wave4未完成，不推进Wave5；统一库存沿用上轮156/2088、2083通过/5既有失败，未重写全量正典。未stage/commit。

C01分类澄清：Orca Worker的429/1308属于外部服务INFRA_FAILURE，不计Engine/Agent算法失败；实际源码和collector缺口才按AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP归类。最终root typecheck exit0、Prettier check通过、docrefs docs201/refs1572/unresolved0。两次生成器实际重跑字节/SHA幂等，38+11闭包不变，接管前后SDK三产物逐文件SHA匹配。

### C03完整原生链与当前六维收口（2026-10-11）

执行渠道：Orca Worker小三完成实施、多轮实际反例合同修复与完整三引擎功能/九tuple合成acceptance，最新真实166/166；Lead独立审查与浏览器采集，修复glassThickness映射、钩子会话直接字段及RGBA8显式存储合同。Worker合同测试不是浏览器实证；旧attempt与诊断/OS/冻结身份全部保留。C03未改引擎。当前SDK69127f39/5b67a560/b7771393来自并行WebGL2 gfx修复，只冻结当前字节，不继承旧SDK下Wave1–3/C01/C02当前身份PASS。

实际失败定位：FF/WK live resize在小Alpha处蓝色预期9/实测5。Lead独立中间RT读回确认纹素alpha=1/255时，原生预乘蓝色存储0而CPU为1码值，逆预乘放大；关闭DITHER无恢复，不作dither/SDK缺陷主张。Trail显式floor(clamp(premultiplied,0,1)*255+0.5)/255使中间RGBA8存储合同确定，CPU数学与±2容差未放宽。重生成并重新冻结，三引擎功能/性能均完整重采。

functional-all-attempt2外层OS UTC05:19:51.494–05:21:59.536；performance-all-attempt1 UTC05:23:07.799–05:25:18.701。两进程自然exit0/signal=null/error=null/inputsUnchanged=true，36输入+8参考一致且窗口不重叠。范围合计18维/39视觉/264边界/18非法整批拒绝/300资源轮六引用（1800配对归还）/3同页resize/9串行性能窗口；48PNG=39capture+6temporal+3resize，不是48算法case。

双段真实Trail→premultiplied RGBA8 RT→完整Glass，每正dt帧恰一次512字节RGBA16F点纹理上传；全256uint16原生字与实际dt/aspect/参数/会话的CPU回放绑定。原始Pointer可信事件与性能DIAGNOSTIC_CPU_TRACE隔离。2952稳态帧逐帧≥2原生pass/≥2真实GL draw，计时窗口readPixels=0。CH三档GPU中位3.023872/4.562944/3.553280ms；FF/WK timestamp不可用。CPU更新中位0.42–0.48ms包含轨迹与追踪，插桩窗口不称无插桩基准/实体移动性能/显示帧率，物理GPU内存不可用。

[C03 Gate](../../docs/evidence/shaders-absorption/c03-glass-trail-current-gate.json)与[十三项交付](../../docs/effects/glass-trail-validation-delivery.md)成立：真实两个接受基线65类structuredClone全部拒收，NaN直接保留；身份/OS/原始数学/PNG/资源/性能独立复算。Gallery183→184、原183项保留，独立Gallery/Agent/长时/多标签页仍NOT_RUN。本轮docrefs204/1583/unresolved0，未重写全量库存、未stage/commit。下一步同Wave4 C04三输入组合；完整Wave4及新旧SDK一致性未完成，不进入Wave5。

Lead追加Gate层结构化克隆13/13拒收，真实基线接受且零浏览器追加：Agent/Wave/项目伪完成、scope膨胀、OS绑定缺失、资源类别伪造、原生pass/视觉/边界/PNG计数篡改、伪性能成本与verifier漂移均拒。回执lead-w4-c03-gate-closure-audit.json保留。Lead五套166项重跑仍在执行，未提前称其通过；Worker已完成的166项与当前真实浏览器Gate分别记录。

Lead五套重跑随后自然exit0，5 suites/166 tests全通过（350.192s），其中full-report346.513s。此前“仍在执行”保留为过程记录，不是当前未完成项。

### C04初稿独立生产审查（2026-10-11）

Orca Worker回执51/51 Node合同、零浏览器/性能。Lead读取实际代码并新增只读独立生产回归17项，真实Jest exit1：2通过/15失败（2.178s）。未运行浏览器采集，C04六维/27性能窗口保持NOT_RUN，不升级Wave4。主要AGENT_FAILURE：collector main仍为占位拒绝入口；generator虽改为params/flags，sync与linearProbe仍有dp0/dp1/cp0/cp1未接线；image两个OffscreenCanvas违反本任务额外canvas边界；straight image当作premultiplied逆转、f32阈值丢弃alpha1/255、disabled诊断提前OETF。主图texture全局共享却逐实例销毁，后续循环重建复用失效对象；sourceRT未跟随resize；诊断disposed在finally销毁前记录为false，preserved.framesEqual与postReleaseDispatchSilent为常量true。

生产门禁实际接受了资源kind全mesh、RT未detach/未dispose、缺固定canvas/shader/instance/time、GPU采样无query配对、仅release一个可信控件等篡改；probe rgba=null抛TypeError。当前rendered与procedural复用同content shader、CPU procedural sin哈希与GPU f32差及RT量化/翻转链也需对证。Lead要求同Worker一次补完整生产采集主体、三输入独立链、真实释放/诊断回执与精确合同，不修改Lead17项测试、不放宽±2；旧初稿和回执不冒称浏览器可采。

### C04首次真实启动失败与追加回归（2026-10-11）

Worker修复后17/17原Lead回归成立，但首个实际Chromium命令在启动阶段拒绝：browserType.launch args expected array got object，collector把shaderLaunchOptions返回的完整对象塞进args。tsc实际exit0。owned HTTP server在异常后未关，采集子进程未自然退出；Lead核对PID15104/parent50172/精确collector命令后定点终止，终止回执与raw日志、OS exit4294967295、inputUnchanged=true保存lead-w4-c04-functional-chromium-attempt1-*。没有生成正式JSON、没有启动浏览器、没有PASS；“浏览器零运行”仍真实。不删除旧产物、不处理其他进程。

追加七条生产反例，Lead review现24项17通过/7失败，真实Jest exit1，保存lead-w4-c04-review-attempt2.json/.log。剩余确证AGENT_FAILURE：all枚举导入不存在的browserEngines导出；RT resize路径仍未实现；probe最终disposed仍来自finally前的false；image过滤未明确NEAREST；性能HTTP isolation/DPR helper从未调用；normal release后仍同页recreate/cycles（终态必拒）。C04仍NOT_RUN。下轮授权Worker修复后单独串行Chromium功能自验，Lead暂停其他浏览器，性能27窗口仍由Lead冻结独占。

### C04 三输入实际六维收口（2026-10-11）

执行渠道：Orca Worker 小三完成初稿、生产审查修复与 Chromium attempt14；429/1308 额度中止后由 Lead 接管。Lead 修复五类实际误收（空图片回执、原始 probe.time 伪造、preserved.framesEqual 假真、recreate instance 缺失等）、三路线活 resize、真实性能环境与关闭接线；生产图片 decoder/premultiply 模块以 pngjs 全像素交叉验证，图片资产包含 alpha=1/255 与透明隐藏 RGB，上传81920B/SHA由实际payload记录并独立重算。rendered 三块 slab 的 Mesh 引用逐项配对；原生 beginRenderPass 计数来自实际 commandBuffer 调用。没有修改引擎，SDK69127f39/5b67a560/b7771393前后不变，来自并行gfx任务。

最终四套聚焦 Jest 88/88 PASS（含原Lead24条、生产decoder测试、完整三引擎/27tuple合成合同），strict noEmit及bundle实际exit0。NODE_CONTRACT不冒称浏览器证据。历史attempt2–5在各自冻结身份下曾通过，当前身份已变为历史；attempt6因Lead误写四块slab、实际只有三块而FAIL，修正资产合同后完整重采attempt7，旧失败原样保留。

functional-all-attempt7 OS UTC07:49:52.747–07:50:57.627；performance-all-attempt1 UTC07:51:16.393–07:55:44.003，两者自然exit0/signal=null/error=null/inputsUnchanged=true，30输入+3参考一致、阶段不重叠。先等待独立全库Jest结束再开启性能，未代宣其库存结果。三引擎合计18维、81标准视觉、90参数边界、21非法整批拒绝、300路线轮换资源周期、1995份引用1→0、9同页活resize、90PNG（81capture+9resize）和27性能窗口全部实际PASS。

性能8730稳态帧，image/procedural/rendered实际pass为1/2/2，逐帧真实draw/update，计时readPixels=0；DPR/backing/HTTP COOP/COEP/COI精确匹配，时钟CH约0.005ms、FF/WK约0.02ms。CH GPU中位720p三路线1.058816/1.863680/2.378752ms；1080p3.247104/3.584000/3.372032ms；mobile2.736128/2.957312/0.851968ms。FF/WK timer不可用。CPU更新中位约0.06–0.14ms包含插桩，模拟mobile不称实体iPhone、物理GPU内存不可用，不宣称相对预算或性能优势。

[C04 Gate](../../docs/evidence/shaders-absorption/c04-input-dissolve-current-gate.json)与[十三项交付](../../docs/effects/input-dissolve-validation-delivery.md)绑定当前功能/性能原始报告、OS/frozen/log、独立verifier及[44类实际报告审计](../../docs/evidence/shaders-absorption/c04-input-dissolve-actual-audit.json)，两个真基线接受且44/44拒收，直接NaN不经JSON洗成null。当前全局Gallery已含C04共185项，本批未重新生成清单或宣称独立Gallery已验。冻结example.json中的初稿文字保留为当批元数据，当前实际结论以Gate/交付为准，后续更改身份输入须重采。

C03/C04在当前SDK叶级收口；C01/C02和前置Wave旧SDK证据不得继承当前PASS，完整Wave4汇总、独立Gallery、Agent、实体设备/长时/多标签页仍NOT_RUN，不进入Wave5。未stage/commit/push，未改写全库库存，所有attempt保留。

Gate层追加structuredClone16/16全拒，真实基线接受：scope膨胀/Agent与Wave升级/项目伪完成/缺性能绑定/raw与OS指纹/verifier与audit漂移/缺PNG/引用计数与slab类别/pass伪造/容差放宽/伪性能成本/Boundary标NOT_RUN。lead-w4-c04-gate-closure-audit.json以wx保存，无浏览器追加。

### Wave4当前候选四组合与前置拒收（2026-10-11）

Lead继续独立重采C01/C02，未改源码算法或SDK，当前38+11与34+6闭包的功能/性能自然exit0、inputsUnchanged=true。C01功能UTC08:09:48.583–08:10:36.277/性能08:11:16.448–08:12:52.612，2953稳态帧，56/56真实篡改拒；C02功能08:10:36.349–08:11:16.375/性能08:12:52.703–08:14:25.051，2901帧，44/44拒。以新的current-sdk-gate.json关闭，旧Gate及所有原始证据只读保留。

再次复核C03发现main.ts（15:16:08）/example.json（14:33:02）与先前冻结身份不同；生产Gate正确拒收，不归为已确证SDK回归、不回退并发改动。Lead重新冻结现有36+8，功能UTC08:17:32.104–08:19:12.188/性能08:19:13.040–08:21:19.150自然exit0，2952稳态帧、65/65实际篡改拒；新C03 current-sdk-gate PASS。复用已存在算法与测试，没有重复声称Worker运行了接管任务。

当前四个组合三浏览器合计72维/198视觉/990边界/75非法/1200资源周期/6795份引用归还/18活resize/234PNG/54串行性能窗口/17536稳态帧，计时readPixels=0。四个接受基线审计合计209/209拒收。当前SDK69127f39/5b67a560/b7771393一致。新增Wave4生产状态合同19/19通过，真实汇总冻结状态的12类克隆全拒，零新增浏览器。

[Wave4当前Gate](../../docs/evidence/shaders-absorption/wave4-current-gate.json)与[十三项交付](../../docs/effects/wave4-validation-delivery.md)：combinationGate=PASS、status=BLOCKED、nextWaveEligible=false。前置Wave3生产校验140项拒收，含源码/元数据/SDK漂移及一致性后果，不称140个新引擎bug。即使四组合当前通过，也不覆盖前置失效；后续按Wave1→Wave2→Wave3刷新当前候选，再重算Wave4，未进入Wave5/Agent/独立Gallery。三份旧Wave交付开头已改为当批身份的历史通过，不修改旧报告结果。未提交或推送，未重写全量库存，当前Gallery185项未重新生成。


### 当前 SDK 前置刷新与并发规格失效（2026-10-11）

Lead 首轮当前 SDK Wave1 Gate 曾实际 PASS（705 实测、18 独立 Gallery、27 性能配置），随后 Wave2 r1 实测只有三个普通模式 reset state 时序错误，shader 数学、像素与资源并无新反例。Orca Worker 小三新增一次性真实 click snapshot helper，五个 SDF/材质 collector 接线并完成9项合同；Lead Wave2 r2 三效果三浏览器功能与27性能配置全部当时通过，自然 OS exit0、SDK和输入采集中不变。

2026-10-11T09:24:28Z 的并发全库示例晋级更新了 E03/E04/E05、C01–C04等 example.json，Wave2最终汇总诚实拒收；09:28:44Z再次更新 NoiseDissolve规格，Wave1 Gallery r3重采因采集中漂移退出1。原始失败、日志、OS、冻结身份与审计保留，未补造PASS，未回退任何并发改动。SDK/shader字节未变，失效不归为引擎缺陷。外部 example-spec-browser.cjs 继续全库运行，当前刷新不得在其性能干扰或后续晋级写入期间开启独占窗口。

Lead已准备r2当前证据链与串行驱动，等待外部验收结束、13份规格稳定60秒后依次重采Wave1 Gallery、Wave2、Wave3、四组合，并逐Gate失败即停。六份仍匹配当前闭包的Wave1效果报告先重新校验再复用，不修改历史r1 Gate。新链和状态隔离四套110/110 NODE_CONTRACT通过，格式与docrefs（208文档/1603引用/0新增失联）通过。Orca Worker只读复核10文件syntax/导出/路径/生产reducer接线未发现确定性错误；其零浏览器/性能/Jest/写入，不能代替Lead运行态验收。

当前状态见[当前SDK刷新十三项交付](../../docs/effects/current-sdk-refresh-delivery.md)。r2链尚未签发PASS，Wave5未启动，Agent/独立Gallery范围仍分离。未提交、推送、重建SDK或改写全库库存；不代宣外部全库验收终态。

### 当前 SDK E08 汇总恢复（2026-10-11）

- Lead r2 master 自然 exit=1：Wave1 r2 与 Wave2 r2 已通过，Wave3 六阶段真实采集全部通过；E08 叶级通用 counts 漏 trustedPointerCases/trustedTouchCases，独立生产 scopeOf 拒收。Wave3 汇总尚未生成，Wave4 未启动。分类 AGENT_FAILURE，无 SDK 修改或浏览器回归主张。
- Lead 修复通用 counts，新增对独立 E08 scopeOf 的精确回归；链套件真实 60/60 PASS，聚焦 Prettier PASS。
- 新 r3 恢复 master 已启动：先重验 Wave2 叶级及原始报告，生成 wave2-current-sdk-r3-gate.json（链工具源指纹变化，保留 r2 历史）；Wave3 r2 汇总绑定 r3 前置，重复实际报告变异审计并比对已有文件；最后完整刷新 Wave4 四组合。复用仅限生产校验通过的原始证据，全部新输出 wx，失败 master/attempt/日志保留。恢复未终态前不宣称 Wave4 PASS，不开 Wave5。

### 当前 SDK 审计持久化比较恢复（2026-10-11）

- r3 master自然exit1：Wave2 r3重新汇总实际PASS；Wave3恢复时已有E08审计的JSON文件（NaN诊断保存为null）与内存重算诊断（仍是NaN）deepEqual不等。并非structuredClone将NaN转换为null，Lead用独立Node断言确认structuredClone保留NaN。分类AGENT_FAILURE，变异自身仍被生产门禁拒收。
- Lead创建独立resume-r4脚本：先对原始structuredClone变异调用生产validator并确认全部拒收，再将新审计按同一JSON序列化形式与旧文件精确比较，不归一化被验证的输入、不修改历史审计、不放宽生产validator。r4 master已启动，复用已验收Wave2 r3；Wave3汇总恢复后接完整Wave4刷新。SDK/collector/chain源码本次零修改。

### 当前 SDK Wave3 PASS 与组合 reset 修正（2026-10-11）

- Lead r4恢复真实接受Wave3 r2：54维/120视觉/660边界/54非法/900资源/9resize/36性能/141截图，前置为Wave2 r3；E08现含可信指针/触摸各3，37审计全拒；E09 35审计全拒；汇总15篡改全拒。
- r4后续W4首个C01功能自然exit1，仅chromium reset state(time0.0165)；原始三引擎报告/OS/日志保留。
- Orca Worker实际修复C01/C02/C04 collector正常reset采集：复用INSTALL_RESET_CAPTURE→真实trusted click→READ.snapshot；helper纳入3输入闭包；C03保留原权威resetReceipt，main/oracle/SDK不动。Worker报告聚焦169/169及3语法/格式检查通过；Lead独立检查接线/闭包，浏览器证据仍待重采。
- Lead r5 master于11:38 UTC启动，先递归验证已通过前置链，再新W4 r3 raw路径执行4功能+4性能串行窗口，沿用未曾产出的W4 r2叶Gate/汇总新路径，所有输出wx。未终态前不称完整Wave4 PASS、不推进Wave5。

### 当前 SDK Wave4 全部采集通过及前缀恢复（2026-10-11）

- Lead r5的W4 r3 raw全部8阶段自然exit0/signalnull/inputsUnchanged=true/production validateFiles PASS；4功能+4性能（54冻结配置）已采完。三组合reset采样修正真实通过。
- r5最终exit1来自Lead汇总脚本硬编码旧w4-r2前缀读取不存在性能报告，ENOENT；SDK/算法/真实采集未失败。分类AGENT_FAILURE，所有失败master/log保留。
- 新独立leaves-finalize-r3接受显式--prefix=output/shaders-absorption/lead-current-sdk-w4-r3，并先核对全部32份raw/log/OS/frozen文件存在。Lead已核对8份OS自然退出，创建r6 master仅执行叶级重验/实际篡改审计/最终链汇总，不再浏览器采集。r6于11:58 UTC启动，尚未终态，Gate不提前升级。
- Orca Worker补正真实Node测试命令：helper单suite9；laser-card/film-neon/input-dissolve-review/golden/full-report共5suite160；合计6suite169。Lead未将Node结果代替浏览器实证。

### 当前 SDK 四级链最终 PASS 与 Wave5 启动（2026-10-11）

- Lead r6 master于12:01:50.633 UTC自然exit0/ok=true，两汇总阶段自然退出，metadataUnchanged=true。四级当前路径W1r2→W2r3→W3r2→W4r2全经生产重算PASS，nextWaveEligible=true；Orca Worker独立只读终态复核同样PASS。
- W4实际范围72维/198视觉/990边界/75非法/1200资源/18resize/234PNG/54性能配置；17424稳态帧（C01 2812/C02 2955/C03 2955/C04 8702）；真实4叶审计56+44+65+44=209全拒，当前汇总24 metadata变异全拒。Worker额外3 summary clone全拒；3PNG只读存在性核对，未独立像素复算，不扩大抽样表述。
- Agent/W2-4独立Gallery/实体设备/长时/发布仍NOT_RUN，旧失败链与raw/audit全保留，无stage/commit/push/SDK修改。
- Lead正式开启Wave5，创建wave5-kickoff.md并更新最新交付/README；首批为EffectDefinition同源类型、API文档、参数表、Agent参考与验证元数据生成，跨13个真实消费者；随后独立Driver和2个UV/Pass Fusion实测Pilot。当前Wave5子项均NOT_RUN，不借前置PASS升级。
- 聚焦4份文档Prettier检查PASS；docrefs209/1611/0 unresolved。

### Wave5 同源文档与两个融合 Pilot 实证（2026-10-11）

- 执行渠道 Lead（Codex）：同源生成工具完成13定义加载、AST字面量提取、类型消费、API证据与字节幂等；31自有+15独立review共46/46 Node测试，真实合法类型消费者exit0/非法enum编译拒收。见wave5-docs-generation-delivery.md。仅文档/合同子项PASS，不授予浏览器或Agent状态。
- Orca Worker Driver初版只有Node23项和collector骨架，资源未配对；Lead独立16项review真实1PASS/15FAIL，已交回Worker补完整消费者字段、原子绑定、资源、真实collector/性能reducer/完整接受正例与篡改拒收。Driver运行态NOT_RUN，不由两个融合Pilot代验。
- Lead在独立shader-uv-fusion-pilot路径实现完整E05/E09母shader的reference/fused对照：仅替换程序子纹素采样，保留256² texel中心、CLAMP/NEAREST、预乘RGBA8量化、母stencil/阴影/Vogel/色散和一次OETF，源撤销替换精确等于母片段。原十三例、src和SDK不改。
- 真实最终功能自然exit0，输入前后不变；三引擎两路线DPR1/2合计144视觉/1656边界/1200资源/12resize/156PNG，可信pause/resume/reset/release、变体退役、临时RT与memory回基线通过。独立母数学读回/PNG审计及72对全图差值最大2，超差0。历史attempt1/2失败保留；attempt3旧collector身份不继承当前PASS。
- 首次性能代理实参传origin而非server对象，未进入窗口即超时，AGENT_FAILURE；OS自然exit1/log/frozen保留。修复后重新冻结并串行重采功能和性能，最终功能14:21:27→14:23:38 UTC、性能14:23:43→14:30:12 UTC，均自然exit0/signalnull/errornull/inputsUnchangedtrue和生产PASS。
- 最终36性能窗口/11684稳态帧确认2→1真实pass及GLdraw、timed readPixels全0；实际纹理payload每对减少262144bytes。CPU render envelope各配置中位数下降，但update无一致改善。RTX4060/D3D11的Chromium GPU测量：Glass+6%～63%；Emboss 720p/mobile +18%～28%、1080p约−2%。Firefox/WebKit GPU query unavailable如实null。PERFORMANCE_GAP为自动融合缺成本策略，不主张ENGINE_BUG；保留example-local可选CPU/内存取舍，不启用默认自动融合、不新增core API。
- 两接受真实基线的38类structuredClone篡改全部生产拒收（NaN在内存保留）；完整Gate绑定原始报告/自然OS/采集前frozen/验证器SHA/当前Wave4前置，生产重算PASS。见wave5-uv-fusion-pilots-gate.json与uv-fusion-pilots-validation-delivery.md。聚焦Node33+10共43项PASS，独立于浏览器。
- Wave5整体IN_PROGRESS；Driver、Agent、独立Gallery、实体设备/长时/发布仍未验，不进入Wave6。无stage/commit/push；历史与并发工作保留。

### Wave5 Driver 冻结验收与当前 SDK 阻塞（2026-10-12）

- 执行渠道：Orca Worker 小三提供纯 Driver 初稿、运行页修复及37文件镜像；Lead（Codex）接管完整母默认参数/真实uniform回读/世界矩阵位置消费/独立CPU回放/实际collector与性能reducer，补齐合成完整正例和实际篡改拒收。没有修改引擎src或重建SDK。Worker初稿及占位指标不作为实际验收。
- 并行Spark任务持续重建工作区SDK；原四级链和融合证据的69127f39/5b67a560/b7771393不再匹配当前字节。工作区首轮采集和镜像相对编译器路径失败均原样保留。Lead改用require.resolve定位已安装编译器，创建独立39文件不可变候选lead-w5-driver-candidate-r2，SDK冻结为27b1526b/5b67a560/c6d3c7d0；不回退或忽略并发构建、不开第二渲染canvas。
- 冻结候选最终功能UTC2026-10-11T15:46:53.986–15:48:50.985、性能15:50:28.743–15:53:51.831，OS自然exit0/signal=null/error=null/inputsUnchanged=true，两阶段串行且生产validateFiles PASS。strict与bundle实际exit0，bundle88149B。三引擎×两完整母消费者×DPR1/2：84视觉、180边界、96非法原子拒收、1200真实资源周期、12活resize、96PNG；18真实性能窗口/5853稳态帧，timed readPixels全0。
- CPU update中位0.20–0.28ms、render envelope中位0.38–0.50ms，包含实际插桩，不宣称未插桩基准或无Driver对照收益。Chromium Holographic GPU 720p/1080p/mobile中位0.610304/1.253376/1.968128ms；Neon为0.388096/0.889856/0.870400ms。FF/WK GPU timer unavailable和实际VRAM unavailable如实披露。
- Lead四套聚焦Node105/105通过；真实两接受基线的34类structuredClone变异和7类Gate变异全拒，NaN不被序列化洗白。wave5-driver-pilot-frozen-gate.json生产验证PASS；十三项交付driver-pilot-validation-delivery.md绑定自然OS、冻结清单和原始报告。Agent/独立Gallery仍NOT_RUN，未提交、推送或修改全库库存。
- 同源文档生成器补一条实际文件读取回归，47/47 Node测试与CLI --check exit0。只移除生成器未读取的两个运行时JS指纹，保留实际消费的SDK声明、源码、API/配置指纹；Engine collector三产物字节门禁保持严格。历史46项证据不改写。
- wave5-current-r2-gate.json生产汇总诚实BLOCKED：Driver、Fusion、Wave4前置各自与当前工作区SDK不匹配，归INFRA_FAILURE；文档检查PASS，无新引擎算法失败主张。Wave5和项目不宣布完成，不进入Wave6。待稳定统一SDK后依序刷新前置与Pilot当前证据；历史raw/OS/audit及并发Spark工作全部保留。
- r2汇总写出后SDK再次变化，实时validateReport基线拒绝；拟追加的六项汇总克隆测试在基线断言处停止，实际未执行，不计为篡改拒收。Lead只读重算确认changedKeys仅currentSdk，冻结Driver验证与文档检查均ok=true，仍为相同三项INFRA_FAILURE。前后字节写入lead-w5-current-r2-drift-observation.json，原快照保留，不冒称持续有效的当前指纹；105/34+7既有Driver证据不受此影响。


### Wave6 首个隔离 Agent 最小验收（2026-10-12）

- 用户明确要求避免过度设计测试并开始 Wave6；此前 Wave5 当前 SDK BLOCKED 原样保留，不补 PASS。用户仅授权先新建一个 Worker。
- Orca Worker Wave6-isolated-noise-agent（tq8u33l01m6skuul19s7f0a3）使用冻结公开 SDK/手册和独立目录实现 NoiseDissolve。首次 tsc exit2，两处类型使用错误；自行修复一轮后编译/打包通过。first_run_success=false，Agent 实现人工介入零，token unavailable。
- Lead（Codex）Chromium 149 桌面最终自然exit0，11项聚焦检查通过：原生 shader COMPILE_STATUS、单canvas、溶解两端/中间像素、真实控件、暂停/恢复、同页resize继续呈现、实际 mesh/material/effect refs1→0并失效、重复释放及input监听解绑。页面/浏览器/server关闭，输入SHA不变。54点抽样不声明全图审计。
- root r1采集失败为自身计数/ favicon问题，十项实现检查均通过；r2修正后PASS，r3补显式shader状态与resize像素要求PASS。所有历史保留，三次浏览器运行没有修改Agent实现。
- 见wave6-noise-agent-delivery.md与wave6-noise-agent-result.json。仅Noise任务最小验收PASS；Wave6整体IN_PROGRESS，Neon/Glass、跨引擎/性能/完整Engine六门NOT_RUN。没有确认新的引擎能力缺口。


### Wave6 Neon 隔离任务最小验收（2026-10-12）

- 用户授权依次新建 Neon、Glass 隔离 Worker。Neon由新 Orca Worker jataabs44bsnoh5mth3d9oga 独立实现，首轮tsc因plane分段参数缺失exit2，自行修复一轮后exit0；esbuild首轮exit0，报告实际约364秒，token unavailable。首次完整成功false。
- Lead（Codex）Chromium桌面12项实际检查通过：COMPILE_STATUS、单canvas、管体外晕、强度/厚度/外晕半径/颜色消费、真实控件、暂停恢复、resize、实际GPU资产引用1→0和失效、重复释放/监听解绑。r1/r2均自然exit0；r2排除UI面板采样污染，两次均未修改Agent实现。收尾和指纹检查通过。
- 见wave6-neon-agent-delivery.md及wave6-neon-agent-result.json。Wave6完成2/3、整体IN_PROGRESS；跨引擎/性能/完整Engine六门未测，Wave5 SDK阻塞保留。下一项Glass新隔离Worker已有明确授权，不再重复询问。


### Wave6 三任务最小验收完成（2026-10-12）

- Glass由新 Orca Worker ox3drcp6lhqsub8z4unt2g1i 实施；首次tsc两处plane类型错，自行修复一轮；另有node -e引号失败重试。首次源码/原始日志全保留。编译窗口约210秒不含研读，不冒称总耗时；token unavailable。
- Lead（Codex）首次Chromium自然exit0，11项聚焦检查全通过；真实四方块+地面子场景RT、70点零折射直通误差0、19点非零变化、resize后35点误差0、13份真实自有资产refs1→0且失效、实际camera.targetTexture归null和RT RenderTexture失效；console/pageErrors空、输入不变、所有采集进程资源关闭。没有修改Agent代码。
- 三个新Orca Worker独立任务最终3/3通过，首次完整成功0/3（均plane必填参数缺失），首次浏览器实现成功3/3；三任务小样本不推广成功率。验收仅冻结公开SDK（4ca4e9a2/e1e3b7a2）、Chromium桌面，34项最终聚焦检查、19张最终PNG；性能/跨引擎/完整Engine六门/实体设备/长时/Gallery/发布未验，Wave5 SDK BLOCKED保留。
- Lead核对公开materials/rendertargets示例省略plane分段与冻结dts必填不符，归DOC_GAP；RT helper缺专篇指导归资料覆盖不足。其他shader建议未确认。无新SDK运行时能力缺口主张。本轮零SDK/src/build修改、零新增Jest/大型矩阵、无stage/commit/push。见wave6-validation-delivery.md和wave6-minimal-agent-result.json。
