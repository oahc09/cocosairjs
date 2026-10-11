# WebGL2 图形合同修复执行台账

日期：2026-10-11。负责人：主 agent；用户授权三个 worker 协作实施。

## 补充推进

用户于 2026-10-11 授权继续推进并安排 developer 协作。三个独立工作区分工为：

- GPU 状态恢复 developer：新增独立夹具，以明确标注的外部状态 setup/fault injection 建立非默认 PACK/PBO/READ/DRAW 环境；被测功能仍使用 public gfx，原九项夹具的 raw GL 只读约束保持。
- 测试清单 developer：定位全量执行未完成原因，分批保留真实 suite 结果与超时，主 agent 根据实际结果维护共享清单。
- 屏幕呈现 developer：新增独立 canvas resize 夹具，对实际 PNG 截图像素和 public GPU 读回分别验收，重点核对 Windows WebKit。

核心源码、SDK 和历史报告保持当前身份；发现确实需要核心修复时由主 agent 单写整合、重建并重采受影响证据。

## 当前批次

| 批次 | 工作与结果 | 状态 |
| --- | --- | --- |
| B0 | 当前身份、共同合同及三浏览器九项修前反例已记录 | 完成 |
| B1 | 能力、sampler、depth bias 源码及三浏览器正负控通过 | 当前声明范围通过 |
| B2 | 整数格式、clear、两条属性路径及三浏览器正负控通过 | 当前声明范围通过 |
| B3 | view、附件选择、尺寸、resize 重建及三浏览器正负控通过 | 当前声明范围通过 |
| B4 | 位宽布局、层/mip、预检、状态恢复及三浏览器正负控通过 | 非默认 PACK/PBO 补证也通过，异常范围见下文 |
| B5 | dev/min/dts/npm、消费者与专项三浏览器验收通过 | 交付；整仓门禁限制见下文 |

## 工作所有权

- 主 agent 独占 `webgl2-commands.ts`、GPU 结构、swapchain 状态、上游登记、执行台账与构建；没有其他 SDK 写入者。
- sampler worker：`webgl2-device.ts`、`states/webgl2-sampler.ts`、独立 sampler 测试。
- texture worker：`webgl2-texture.ts`、`webgl2-framebuffer.ts`、独立 view/读回边界测试；commands 实施由主 agent 整合。
- probe worker：专用 public-gfx 夹具、collector 与新路径 GPU 报告。
- 保留开始时 Shader、Skills、Gallery、测试清单及工具的全部无关改动。不提交、推送、发布、部署。

## 实施时点基线

HEAD：`4fdfc096258cd1b6f2aa1d8132edda7be7a27a20`；工作区 dirty，不是发布候选。

| 检查 | 当前结果 |
| --- | --- |
| `npm run typecheck` | PASS，exit 0 |
| `npm run verify:web-only` | PASS，reachable 1103 |
| `npm run verify:file-map` | PASS，rows 1397，modified 191 |
| `npm run verify:doc-refs` | PASS，202 docs，1572 refs |
| `npm run format:check` | 存量 FAIL，195 个文件；不批量改写 |
| `npm run verify:port-env` | Node 24.14.0/npm 11.11.1/TS 4.9.5/Jest 28.1.3；默认 Playwright 无法解析，三浏览器缓存存在；启动尚未验证 |
| 相关渲染回归 | 7 suites / 24 tests PASS；专项最终结果见下文 |
| 手册同步 | 存量 FAIL 3 / WARN 7：drawing-lines 完整拷贝、manual-port-recipes 与 interactive-kit 索引 |

## 共同合同决策

- 默认 `cmpFunc=ALWAYS` 表示普通采样，硬件比较为 NONE；其他函数开启比较。现有 public Type 无法区分 ALWAYS 比较，本次明确不支持该表示，不扩展签名。
- 各向异性在 WebGL2 缓存前验证、复制并规范化；0 保留关闭语义、实际 GL=1。拒绝负数、小数和非有限值。有效请求封顶 `min(16, extensionMax)`，无扩展退回 1，维持既有 hash/unpack 合同。
- 整数纹理不宣告 LINEAR_FILTER；绑定时拒绝非法线性采样，POINT 保持。
- 属性根据 shader 实际反射类型选择 IPointer/Pointer；整数 shader 要求匹配有符号/无符号非归一化数据，packed integer 明确拒绝，浮点与 normalized 数据维持原语义。
- 默认/显式 view 都保留 mip/layer 范围；framebuffer 单附件取 baseLevel/baseLayer，不承诺 layered rendering。每次创建/重建校验当前资源范围。
- view 读回使用相对 mip/layer，原纹理默认 base=0；array/cube 使用 baseArrayLayer/layerCount，3D 使用 z/depth。
- 保持普通 RGBA8 紧密输出；整数 8/16/32 位读回采用合法 RGBA_INTEGER 与 32 位通道暂存，按原生位宽输出。half-float 经 FLOAT 暂存转为 Uint16 half bits。压缩、depth/stencil、packed、直接 MSAA 等非法或未实现组合明确拒绝。
- `buffOffset` 为目标 ArrayBufferView 内字节偏移，另加其 byteOffset；整体预检保护目标缓冲区。执行错误可能留下已完成 region，必须抛错并定位，不能当成功；finally 恢复实际 READ/DRAW、PACK/PBO 状态并释放临时 FBO。
- sampler 销毁迭代未推进会无限循环；属于本次创建/销毁合同的直接依赖，增加多 LOD 销毁回归。

## 验收纪律

修前、诊断和夹具修正前报告均保留历史候选身份，不将 source mock 或状态查询替代 GPU 数值。最终九项的完成状态依据实际三浏览器、正负控制、普通回归、资源失败边界和构建消费者证据更新；专项完成不等于 release READY。

## 最终构建、源码回归与普通 GPU

- 最终开发 bundle build 22、压缩 bundle build 23；`npm run build:all` 完成 JS、声明和 npm release copies。独立消费者 `consumer-acceptance.cjs` PASS，626 exports，临时 tarball/consumer 已清理。日志分别为 `output/webgl2-gfx-contracts/final-build22.log`、`final-consumer.log`。
- 最终源码专项三套 83 tests 全部 PASS、无 skip：sampler、texture/view 与 commands。原始 Jest JSON 为 `output/webgl2-gfx-contracts/final-jest.json`。既有相关渲染七套 24 tests 也通过。
- 最终 typecheck、Web-only（1103 reachable）、上游映射（1397 rows、198 modified）、许可证十项、冻结 PAL 来源与文档引用检查均 PASS；新增/编辑的专项夹具、工具、测试及合同文档通过定向 Prettier 检查。
- API inventory 只更新声明 source fingerprint；API revision `48ba46ec9d9ea6e8` 和分类数量未变化。未扩展 public 签名或替换原生 Cocos 抽象。
- [普通 GPU 最终报告](../../docs/evidence/examples/webgl2-gfx-contracts/regressions-candidate-20261011-b.json) 中 Chromium、Firefox、WebKit 各两项 PASS：原生 `SkinningModel` 的独立骨骼姿势像素，以及 MSAA resolve/resize/读回→draw→blit 的精确绿色像素。GL errors 为空、释放完成、指纹无漂移；主 agent 已查看截图。截图属于读回预览，未冒充 compositor 证据。首次 favicon 404 的失败报告保留。

## 全仓门禁与范围限制

- 首轮全量 `test-inventory` 执行约 13 分钟后仍未结束，主动终止自有进程，没有完整报告；本轮分批诊断结果见下文。没有声称原全量清单入口 PASS。
- 首轮发现 170 suites、登记 159 suites，11 套缺口均属 Shader 工作。本轮实测后增量登记其中十套的 292 个标题，现登记 169 suites；只剩并行变动的全报告套件未登记，没有为未完整执行的 suite 编造标题。
- `format:check` 的存量 195 文件失败、手册同步的存量 FAIL 3/WARN 7 保留；本次不批量格式化或改写无关示例。
- 首批非默认 PACK/PBO GPU 注入未执行；本次独立补充夹具已通过，历史报告的 NOT_RUN 保留其时点含义。
- 同 PipelineState 的 depth bias 重新初始化已验证；未声明 cull/blend/depth 等其他旧状态缓存的广义重新初始化已修复。Windows WebKit resize 后实际 compositor 呈现的默认/条件环境分别实测，结论见下文。
- 历史 Gallery/浏览器总验收与本次候选身份未全部同步，工作区包含原有和本次改动，未声明 release READY。没有提交、推送、发布或部署。

## 九项最终 GPU 与逐机制反证

- [开发 build 22 最终报告](../../docs/evidence/examples/webgl2-gfx-contracts/final-20261011-dev22-attempt2.json) 和 [压缩 build 23 最终报告](../../docs/evidence/examples/webgl2-gfx-contracts/final-20261011-min23-attempt2.json)：各在 Chromium 149.0.7827.55、Firefox 155、WebKit 26.6 跑 139 cases，合计 834 次正例执行全部 PASS；GL 阶段、console/page errors 为空，completed=true，指纹无漂移。
- [整合记录](../../docs/evidence/examples/webgl2-gfx-contracts/integration-20261011.json) 独立重算上述两个报告、普通回归、隔离 base 和 11 个负控报告所引用的全部当前文件 SHA256；15 份证据身份均一致。隔离 base 三浏览器各 139 cases PASS。
- 11 个隔离 bundle 分别只撤销 half-float capability、comparison mode、anisotropy parameter、bias enable、bias static order、bias dynamic order、integer external format、integer clear、integer attribute、attachment layer、readback offset。每项均在三浏览器检出相应合同反例；其报告 `passed=false` 是预期负控失败，`negativeControlDetected` 为 true，不混入正常候选 PASS。
- 所有自有资源均满足 `cleanupSucceeded === created`，没有 cleanup exception。负控失败来自对应合同而非启动或页面异常。各浏览器检出数量一致，详见下表及原始 `negativeControlDetected.failedCases`。
- 首轮负控发现动态 bias 的静态值与动态请求相同，缓存可能跳过动态调用。夹具改用不同静态值，确保动态路径独立执行；格式化后重采 dev/min 正例及全部控制为 attempt2。旧报告保留历史身份，最终引用仅 attempt2。独立撤销动态顺序后动态状态及 constant/slope 像素反例失败，而静态状态保持 PASS。
- 源码、SDK、collector、夹具和计划均在最后采证前冻结；后续只补执行台账、工具入口说明及精确上游修改理由，没有修改 core 或替换历史报告指纹。

| 撤销机制 | 每浏览器检出的反例数量 |
| --- | --- |
| half-float capability | 2 |
| comparison mode | 6 |
| anisotropy parameter | 3 |
| bias enable | 6 |
| bias static order | 3；动态路径均 PASS |
| bias dynamic order | 3；静态路径均 PASS |
| integer external format | 32 |
| integer clear | 3 |
| integer attribute | 13 |
| attachment layer | 6 |
| readback offset | 3 |

## 补充 GPU 验收结果

- 非默认状态：[dev 22](../../docs/evidence/examples/webgl2-gfx-contracts/state-restoration-20261011-dev22-attempt3.json)、[min 23](../../docs/evidence/examples/webgl2-gfx-contracts/state-restoration-20261011-min23-attempt3.json) 各三浏览器三项 PASS，验证成功读回、整体容量预检失败和真实注入 `INVALID_ENUM` 引发的 `GL_BEFORE` 异常。PACK `[8,7,2,3]`、非空 PBO、不同 READ/DRAW FBO 与缓存均恢复；输出偏移/padding 和 PBO 哨兵正确；恢复后 public draw/readback 为精确绿色。
- 每项夹具自有资源 14/14 释放；成功及执行失败各创建/删除一个临时 FBO，容量预检失败未创建。WebKit 的故障注入 console 原文保留，仅在实际捕获 `GL_BEFORE:1280` 时将确切一条 `pixelStorei` 非法枚举单列为预期，其他 console/page/GL 异常仍判失败。该证据覆盖 `GL_BEFORE` 异常 finally，未模拟所有 `readPixels` 后异常。
- [PACK/PBO 恢复撤销负控](../../docs/evidence/examples/webgl2-gfx-contracts/state-restoration-20261011-negative-pack-pbo-attempt3.json) 在三浏览器检出：成功及执行异常的主调用丢失状态，预检主调用仍正确；三条后续有效读回均再次检出恢复失败，但颜色仍正确。判定严格要求三个实际 case、针对性失败、预检保护、无非预期运行异常和完整清理，避免空集合误判。
- [实际屏幕呈现条件报告](../../docs/evidence/examples/webgl2-gfx-contracts/presentation-20261011-accelerated-a.json) 三浏览器共九项 PASS：原生 pacer 下 `640×400 → 480×320 → 720×360` 的 actual page PNG 四象限与独立 GPU 读回正确，所有资源释放。主 agent 独立解码九份实际 PNG，再次核对四个固定采样点，并查看 WebKit resize 截图；没有使用读回 preview 代替实际合成。
- [Windows WebKit 默认配置复测](../../docs/evidence/examples/webgl2-gfx-contracts/presentation-20261011-default-webkit-b.json) 保留 FAIL：初始 PNG 正确，两次 resize 后实际页面只有 `[51,51,51,255]` 背景；Canvas 导出、GPU 对照和全部尺寸仍正确。条件报告显式使用 `--webkit-compositor=accelerated`，仅排除 Playwright 默认 `--disable-accelerated-compositing`，不是 SDK/core 修复或默认环境通过。首次 Firefox `WEBGL2_REQUIRED` 报告保留，后续相同 Firefox 配置通过。
- [补充整合记录](../../docs/evidence/examples/webgl2-gfx-contracts/supplemental-integration-20261011.json) 重算五份补充报告的当前输入 SHA、状态/字节/资源与实际 PNG；同时核对首批十五份报告全部当前输入仍一致。开发/压缩 SDK 与核心源码未再修改，首批证据身份保持有效。

## 测试清单补充验收结果

[清单补充记录](../../docs/evidence/examples/webgl2-gfx-contracts/inventory-followup-20261011.json) 绑定真实分批 Jest JSON、逐 test/suite 日志、超时和编辑前源码；原始聚合为 `output/webgl2-gfx-contracts/inventory-diagnostic-20261011/aggregate.json`。

- 发现 170 suites，169 套完整执行：167 PASS、2 FAIL；2463 tests 中 2458 PASS、5 FAIL、0 pending/skip。主 agent 重算每套报告 SHA，确认这 169 套执行时的 suite 源文件字节与当前一致，实际标题与登记标题完全一致；该检查不等于所有传递依赖的独立指纹验收。
- film/neon 与 laser/card 的慢测试原先每次变异重复生成整套大 PNG。仅缓存不可变基线、每次返回独立深拷贝报告；保留全部分辨率、标题、变异、断言及生产 validator 调用，40＋51 tests 完整 PASS。只在即时源文件 hash 未漂移的目标上增量编辑，没有接管并行全报告文件。
- `shaders-browser-launch.test.ts` 的旧固定 SDK 前缀把合法新构建误当作 launcher 改动。改为 helper 模块加载与三个 platform/engine 的 option 查询前后比较 dev/dts/npm 完整 SHA，继续验证启动 helper 不改 SDK；12 tests PASS。只增量维护这一实际变更的标题，不重写历史 Shader 证据。
- `interactive-multipass.test.ts` 初始夹具持续生成 54 PNG，不是死循环或等待句柄。保留首次 90 秒超时；合理 300 秒预算下 188.804 秒完整结束，22 tests PASS，源码没有修改。
- 五项真实失败保留：`smoke-29-examples-spec.test.ts` 的规格冻结、apiEvidence 行号、证据链、Gallery 字段四项；`smoke-30-v12-regression.test.ts` 的历史浏览器矩阵 bundle/dts 当前身份一项。未改历史矩阵 SHA、未将陈旧证据标为当前 PASS。
- `shaders-glass-trail-full-report.test.ts` 在测试期间由外部会话持续修改；300 秒诊断尝试有部分通过及性能正例失败，但没有完整 JSON、源码也漂移，标记 `UNKNOWN_CURRENT`，不能用部分结果或静态标题注册。没有修补、覆盖该并行文件，也没有继续追着写入者无限重跑。
- 原清单 `generatedAt` 保留，增量后的计数为 169/2463/2458/5，未伪造原全量入口的新成功快照。`spec-compliance.json` 的运行副作用另存 before/measured 原始文件后按字节比较恢复，当前该路径 clean；SDK counter 仍为 23。
- 后续全仓门禁需在并行测试源码稳定后完成该套实跑，并通过实际 producer 更新相关规格/浏览器证据；存量完整格式与手册门禁也仍需各自处理。这些不影响本次已绑定当前 dev/min 的九项与非默认状态 GPU 验收，不构成 release READY。

## 继续收敛结果（2026-10-11）

[当前收敛记录](../../docs/evidence/examples/webgl2-gfx-contracts/convergence-20261011.json) 保留真实全量门禁、后续定向结果和当前文件指纹，两种执行口径分别记录。

- 执行渠道：Orca Worker `developer` 接到顺序收敛任务，异常终止后恢复派发仍遇到 `429 / 1308` 额度上限；没有该 worker 的完整交付，不能判为委派完成。主 Lead 随后直接接手实施与验收，保留它已经留下的规格、示例及证据变更。
- 实际运行原 `test-inventory.cjs -- --runInBand` 入口，完整结束、exit 1：173 suites、2660 tests、2654 PASS、6 FAIL，无跳过。失败涉及本轮更新过程中的规格、行号、旧矩阵/正在重采的截图，以及新增编译回归的 checks 计数。该原始失败结果保留在 `output/webgl2-gfx-contracts/lead-full-inventory-a.log`，不重标为 PASS。
- 原 `UNKNOWN_CURRENT` 的 Glass Trail 全报告套件已完整运行：110/110 PASS，未修改该套源码；当前 SHA `094d046ba5c02f73bce53e1d6b93548d478543e961b9eaf02e8c339a1092eeb4`。首轮因未设置现有 `pngjs` 的 NODE_PATH 而未执行测试，失败报告保留；正确工具环境下的完整结果为 `lead-convergence-glass-full-b.json`。
- 并行工作在全量执行期间新增 Input Dissolve 套件，磁盘由 173 增至 174；主 Lead 对四套新增/未登记套件独立实跑，88/88 PASS，然后按真实标题增量登记。清单现为 174 suites / 2661 tests；2660 PASS / 1 FAIL 是全量结果与后续定向修正的合并统计，不是新的原全量入口成功快照，原 `generatedAt` 保留。
- 三浏览器矩阵通过真实 collector 完整重采：26 examples × 3 engines，78/78 PASS，completed=true，绑定当前 dev22。主 Lead 重算所有输入与 PNG SHA/bytes 后刷新正典入口；旧矩阵 JSON 与截图整目录保留在 `output/webgl2-gfx-contracts/browser-matrix-before-lead/`。没有只替换旧报告 SDK 哈希。矩阵仍按原合同范围判定，不等于所有 Gallery 示例或 Windows WebKit 默认 resize compositor 的无条件通过。
- 修复隔离采集的 DOM iterable 类型、bootstrap 解析、`.js`→`.ts` 服务解析、本示例参数与 recipe 路径迁移；只从真实 `createAirApp()` 返回值获取 app，保留其 Promise 身份。bootstrap 跟踪在真实延迟启动之后加载，不能提前导入引擎。实际 Promise/app 身份及一次真实调用的独立机制检查通过，记录为 `lead-app-trace-identity.json`。
- 容器规格用真实 Run 启动及窄布局按钮；多遍渲染规格明确完整可见视口；动态网格规格点击真实切换按钮；响应式棋盘用真实 select 切换，补齐实际 app 调试入口及九处 API 行号。几何规格保留默认 mesh 模式全部原检查，增加独立 cut 模式节点、可信拖动和生命周期检查，射线调用在 cut 模式实际观察六次，默认模式零次的原始证据仍保留。
- 双模式截图分别保存，避免后一个模式覆盖默认模式的 artifact。最终 `lead-spec-focused-final-c.json` 六例全部 PASS，八个 artifact 引用的 SHA/bytes 重算一致；这是明确的子集，completed=false，不自动晋级或回写完整示例证据。几何 cut 终态 PNG 是生命周期重建后的目标板，交互阶段的帧差与射线调用不能冒充一张切割成品截图。
- 最终 smoke 28/29/30 定向结果为 47 tests：46 PASS、1 FAIL。原五个失败断言仅剩 `§11/§12 证据链符合性零 fail`；规格冻结、行号、Gallery 字段和当前矩阵身份均通过。完整规格证据仍是旧中断的 180-row 报告，不能由六例子集盖成 completed。Shader 普通启动路径的 `createStepClock` 未执行、部分交互未产生画面变化仍为真实 FAIL；没有移除 API 声明或放松断言。
- benchmark 类型检查、九项实际编译/清理回归、API trace selftest、当前编辑示例定向 Prettier、4650 项 API 行号检查、文档引用和 diff 检查通过。工具回归首轮误用了不存在的测试路径，同时 checks 数因新增回归变为九；保留该失败日志，已按实际 smoke-28 修正计数并重跑通过。
- 核心源码和 dev/min/dts 未重建，counter 仍为 23。余下工作是完整当期规格证据及其 Shader 多模式/交互缺口，再进行稳定候选的完整门禁；默认 WebKit compositor、存量格式/手册门禁仍保留。没有提交、推送、发布或声明 release READY。

## Worker 二轮收敛结果（2026-10-11 晚）

[本轮收敛记录](../../docs/evidence/examples/webgl2-gfx-contracts/convergence-worker2-20261011.json) 覆盖 Shader 模式/交互缺口、当期完整规格证据与原全量门禁；全部失败 attempt 均保留在 `output/webgl2-gfx-contracts/worker2-shader-probe-{a..j}.json` 与两轮全量 collector 日志。

- 根因：`createStepClock`/`createAirRenderTarget` 只在示例自有诊断路径（linearProbe/coreProbe、惰性 step 时钟）执行；静态默认画面 + 无真实驱动的交互步骤、参数部分集被整集校验静默拒绝、瞬时轨迹在 800ms 沉淀帧前老化，共同造成 api-executed 与 frame-diff 真实失败。sparkle 参数绝对路径 404、liquid-metal 复制粘贴的 owned-holographic 节点名、input-dissolve 字面 `c04-dissolve-*` 期望节点为独立缺陷。
- collector 最小增强：`interaction:probe` 步骤类型（页内真实执行示例公开测试合同，缺失/抛错即 FAIL；探针可能处于 step-clock 暂停窗口故自身不取帧）；drag 增补立即帧捕获（短生命周期真实输入效果此前落在沉淀间隙外）。均为增益路径，不绕过任何断言。
- 12 个 Shader 示例规格以默认 native-pacer 页的真实驱动收敛：全参 set、linearProbe/coreProbe、step(1/30)、resumePacer/settleNative、真实按钮/select/drag；放弃 test=1 apiVariants（暂停页无连续 AFTER_DRAW，attempt 保留）。源码修复 sparkle 相对路径 + 家族一致 resumePacer、liquid-metal 节点名、13 处 NodeList 迭代 TS2488。
- 当期正典证据：`docs/evidence/examples-verified.json` 180/180 PASS、completed=true、2 promoted / 0 demoted（17:46）。采前输入 SHA 与采后核对仅 files.json 因晋级回写变化；216 张正典截图与中断版 180-row 报告已备份至 `output/webgl2-gfx-contracts/worker2-examples-png-before/`、`worker2-examples-verified-before.json`。
- spec-compliance-audit 0 fail / 2 warn（starfield-galaxy 视觉描述过短、gltf-draco 解码器不可用，均不阻断）；smoke-29 + smoke-30 定向 46/46 PASS，原五项失败断言全部收敛。
- 原全量门禁 `tools/verify/test-inventory.cjs -- --runInBand`：首轮 Jest 178/2771/2771 全绿但清单漂移（旧清单 174 含 4 条绝对路径条目；并发 Shader 会话新增 8 套 wave-4）；按真实全量执行 `--update` 重登记（178/2771/2771、绝对路径归零、generatedAt 2026-10-11T10:25:25Z），复跑 check 模式 `ok=true`、failures=[]。日志：`worker2-full-inventory.log`、`worker2-inventory-update.log`、`worker2-full-inventory-final.log`。
- 定向 doc-refs（208 docs/1603 refs ok）、受影响示例与工具 Prettier 检查通过；核心源码与 dev/min/dts 未重建，counter 保持 23。Windows WebKit 默认 resize compositor、存量 195 文件格式与手册门禁仍如实保留；并发 Shader 会话若继续写入可能再次漂移清单。未提交、未推送、未发布，不构成 release READY。
