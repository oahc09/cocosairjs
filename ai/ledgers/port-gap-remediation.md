# 端口缺口实施台账

对应 [计划](../plans/port-gap-remediation.md)，执行顺序为 S0→S6。用户于2026-10-03授权实施，由 Lead 与现有 **Orca Worker** 协作。初始 HEAD `cac42f6e897fa184cd486d4e38f07ec7c8768c0a`，初始工作区干净。源码和产物的完整指纹仍由 PG-27 工具采集；旧报告仅为历史证据，不认定本轮 PASS。

## 当前批次

- S0：已收到 Orca Worker 的 PG-27候选快照/漂移检查、PG-34证据schema/预检终态报告。Lead S20增补后29工具回归与13项schema自测通过，规范化六配方18行及历史尝试；完整gate为7 NOT_RUN、2 AG BLOCKED，最终完整冻结仍待完成。
- Lead：已收到Orca Worker的PG-28审查修复终态（4套件53测试），Lead完成导出、所有权/节流修复与59定向测试及三浏览器12用例。AssetBank与Atlas均已有Orca Worker实现终态及Lead实际安装/浏览器验收；PG-24当前多源/UV/glTF合同由Lead S13补齐，Lead S14已完成PG-12；Lead S19收回第六类写入并完成六类共同入口/实际安装消费。Orca Worker S20/S21及S22–S29终态已收到，S29采集器未全达；Lead S30接手修复，在独立输出完成三效果三浏览器9项真实A/B/恢复/归还、102篡改拒绝及正式EG4子集PASS。默认SDK不变，完整门禁/外部范围仍未完成；旧报告不替换当前验收。
- 外部30项目、端口资产/截图、来源计划原文未提供；AG1/AG2及依赖这些材料的回归仍待材料。2026-10-04用户已决定Spine2.1不支持、UI-mesh薄封装及公开原生Billboard；正式记录在owner第13节。

## 逐项状态

`NOT_RUN` 表示尚未获得本轮验收证据；实现存在、合同已定或历史报告PASS均不能自动改变该状态。

| ID | 范围 | 本轮状态 | 本轮证据/下一步 |
| --- | --- | --- | --- |
| PG-01 | libGDX atlas | PASS | Orca Worker当前33合同/审查回归终态；Lead公开导出/真实tarball三浏览器旋转、trim、多页/index像素及所有权，16输入指纹当前一致；完整候选冻结仍待完成 |
| PG-02 | BMFont | PASS | 单页文本解析/原生工厂/PNG加载与引用释放；17原生+4阴影回归，三浏览器偶距/三字号像素；最终候选重采 |
| PG-03 | Tiled raw/type | PASS | 4原生测试；三浏览器对照原始XML与完整tiledmap-basic P1–P8合同；手册/上游登记，最终候选重采 |
| PG-04 | Spine2.1决策 | PASS | 2026-10-04用户选择不支持；正式owner第13节与备忘录登记，非播放验收 |
| PG-05 | Audio stop/volume | PASS | 原生非法值/无通道 + 三浏览器连续时钟/暂停/停止归零/续播/音量；记录DOM加载/手势条件，最终候选统一重采 |
| PG-06 | AssetBank选项 | PASS | Orca Worker实现终态；Lead三浏览器实际无后缀JSON/PNG、ext分派、取消/迟到/共享引用、404/CORS/CSP通过；最终候选重采 |
| PG-07 | 聚焦 | PASS | 三浏览器×默认/自定义canvas：首屏不抢焦点、交互收键、editable独立、捕获/冒泡合同；见S1报告 |
| PG-08 | resolution | NOT_RUN | 原生半宽/Canvas修复、6测试；27 GPU/输入场景通过，截图加严后WebKit resize呈现仍失败；纯WebGL2校准同现象，见S5 |
| PG-09 | 纯输入区域 | PASS | 三浏览器空UITransform节点单次TOUCH接收、UI吞全局；无需可渲染组件 |
| PG-10 | 鼠标转触摸 | PASS | 三浏览器可信键鼠单路TOUCH、UI吞噬/画布leave与混合合成触点逐source取消；S9两后端/两canvas，物理多指不认证，不新增合成层 |
| PG-11 | UI mesh | PASS | AirUIMesh薄组件/assembler、11原生测试、三浏览器混排/Mask/合批/旋转UV/材质与清理、安装消费；最终候选重采 |
| PG-12 | 平台配方 | PASS | Lead S14实际TS4.9及三浏览器真实TMX/Box2D/摩擦/松键空中惯性/单向板稳定支撑/可信键盘/暂停与退役清理通过；原作端口材料未提供，不声称1:1 |
| PG-13 | 切换评估 | PASS | 三浏览器直接替换/同Scene/页面栈/reload；各100次实际绘制/释放，业务监听/timer、共享/持久节点、boot阶段时间；外部bundle正例未提供 |
| PG-14 | 场景树工具 | PASS | 三浏览器显式bundle既有工具，结构/500行truncated/panel/session幂等关闭和SESSION_CLOSED |
| PG-15 | 测试输入 | PASS | tools/debug显式合成DOM→真实PAL/UI/global，3工具回归+逐触点负例、三浏览器单步/清理与独立可信输入对照；不认证实体设备 |
| PG-16 | culling文档 | PASS | assembler/layer当前裁剪与脏标记手册；P5/P6/P8三浏览器限定合同，未改变刷新机制 |
| PG-17 | 消费声明 | PASS | 安装消费者TS4.9 node16/经典解析与TS7.0.2原生DOM入口通过；skipLibCheck原合同明确，不改变仓库依赖 |
| PG-18 | 诊断 | PASS | 材质warning/shader/link/非法骨数据/容量越界已有正负例；S9可选camera层/标签/视锥/启用只读观察，26回归与三浏览器24像素场景；范围和未知结果明确，最终候选重采 |
| PG-19 | 蒙皮生命周期 | PASS | S10默认统一产物每浏览器96激活前后排列、真实clip/pause/resume/公开模式往返、容量/descriptor重绑；3确认缺口修复，完整候选冻结仍待完成 |
| PG-20 | 缩放/镜像 | PASS | S8隔离候选两模式TRS/刚性像素参考、反射BACK剔除及builtin-standard根/祖先逆转置法线光照对照；多关节非均匀骨混合/所有shader不认证，最终候选重采 |
| PG-21 | bounds缓存 | PASS | 同Mesh reset、动态position/joint/weight、merge与bindpose变更重算；未改变数据复用、失败不缓存。活动renderer与其他动画池须显式重绑定，见手册 |
| PG-22 | 手动骨骼 | PASS | 原生float joints/归一化权重配方、索引/路径/矩阵负例；S8三浏览器单关节TRS/非单位逆绑定与刚性GPU参考；不新造播放器，最终候选重采 |
| PG-23 | Effect绑定 | PASS | 18合同/生成器/启动测试；三浏览器双纹理、两阶段UBO、MR/SMR按名/资产/现有材质、宏与shader/link诊断；显式预检布局范围详见S7，不是通用编译器 |
| PG-24 | 纹理方向 | PASS | S13当前七输入Sprite/plane三浏览器60次GPU观察、原纹理/帧交错复用及释放、ImageData真实类型负例；S12公开glTF外部/嵌入PNG与sampler；默认上传自洽不新增flipY，无抽取源码差异，颜色空间/压缩/设备另列 |
| PG-25 | Billboard决策 | PASS | 已公开原生组件，小闭包/安装消费通过；三浏览器相机/旋转/尺寸/停启用/共享纹理与独占资源清理，最终候选重采 |
| PG-26 | 集成速查 | PASS | 28项症状→合同→代码/专题与待验边界完整映射，实际类型检查及手册源码一致性通过；最终候选仍需同步 |
| PG-27 | 消费身份 | NOT_RUN | Orca Worker S0实现；Lead S20当前深快照/只读漂移检查与29工具回归通过，不绑定未实际加载的URL；完整gate冻结仍待缺失范围 |
| PG-28 | 动作所有权 | NOT_RUN | 已公开导出、59定向测试、12基础浏览器用例与S10真实安装包12组合序列；合成多指/blur/hidden明确分层，真实headless hidden未发生 |
| PG-29 | 安全启动/单例 | PASS | 原生配置/单例合同及S10三浏览器unmin/min/npm副本12场景；S11真实安装图集消费者使用安全入口，闭合状态/冲突边界按限定范围，完整候选冻结仍待完成 |
| PG-30 | 清理/session | PASS | S11默认统一产物三浏览器各100次实际GPU循环；同字节S9五种释放及各十分钟/20次期间释放，安装图集/输入释放通过；GPU量unavailable，不认证永久无泄漏 |
| PG-31 | 签名/descriptor | PASS | AST/真实类型负例、22原生descriptor测试、签名手册；安装包四类geometry对照与消费者类型通过，保留旧导出 |
| PG-32 | 取消/能力分层 | NOT_RUN | AssetBank真实网络/订阅边界已验，glTF子请求真实abort而顶层下载不中止；Lead S30完成owner #6(b)原生post隔离变体9项A/B/逐效果恢复/16资产归还，正式子集PASS；完整能力/配置/部署范围仍未验，不将实验包装称默认SDK能力 |
| PG-33 | 六组合配方 | NOT_RUN | Lead S19六类同源仓库/实际离线安装：每路径17 PASS/1 WebKit FPS NOT_RUN；可选服务三浏览器时钟/404/HUD/引用与存储清理通过；Orca Worker S20只读终态已核对正式18/17/1，不把审查当新浏览器执行 |
| PG-34 | EG/AG/AIG | NOT_RUN | Lead S20六配方18行（17已测/1未达）、S30原生post9项子集PASS与历史失败补偿链；完整九门禁仍7 NOT_RUN/2 AG BLOCKED，不把实验子集提升为完整gate |
| PG-35 | 坐标/DPR | NOT_RUN | 首帧/resize取整、设计坐标与三控制模式GPU已验；WebKit resize截图环境问题未收口，见S5 |

## 集成速查与当前所有权核对（Lead执行）

### S30 原生post子集正式验收（Lead实际执行）

Orca Worker S29终态三probe EXIT1、报告未产出已收到。Lead新建port-s30-root采集器，实际Chromium/Firefox/WebKit均EXIT0：原生Bloom/FXAA/ColorGrading9项A/B、27PNG、每效果restore及contribute0逐像素零差；正确阶段空间LUT oracle六中心全部误差0，identity最大通道差3如实保留。每浏览器23输入SHA/bytes前后一致、0默认SDK混入/0pageerror；16实际自持资产1→0且正常销毁、9节点/scene已无效、app.close released。3成功基线各34单点篡改共102全拒；Root首轮失败及执行源码归档由后续真实成功补偿，S21–S29历史原样保留。正式eg4-native-post-s30.json为PASS/subset=true/completed=false，不认证完整EG4或默认SDK。S30九状态schema校验通过，17组件已记录输入全部匹配，完整gate仍7 NOT_RUN/2 BLOCKED；当前深快照为port-s30-root-candidate.json（snapshotId前缀4f144ecb5f87e3fe），没有将未加载URL记作浏览器证据。详见[后处理第13节](../../docs/notes/post-process-notes.md#13-s30-原生三效果像素子集完成2026-10-04lead实际执行)。

S30后续审核记录：Orca Worker已实际完成三份像素校验与十份schema校验；收口回执的S19计数、旧NP05状态及错误校验层篡改不予采纳。Lead补充port-s30-root-review-closure.json，独立CPU公式对照三浏览器18原始PNG颜色全零误差、每引擎4类真实报告篡改全拒，核对29正式输入/17组件/首轮5源码归档；浏览器新增0。不将这些Lead核对记作Worker执行。

### S28 采集器与验收字段接线（Orca Worker执行、Lead只读复核）

S28未全达状态已收到；Lead只读port-s29-root-s28-review.json/.log（EXIT0、浏览器新增0）确认三份当前报告均被实际checkGate拒绝。Chromium截图重算六点误差0/0/2/0/1/2；缺world x/y、旧ROI字段名、移除标志层级不符、driver未定义变量、oracle未序列化、常量资源释放与失败基线篡改均需修正。现有证据不证明三浏览器完整采集或篡改规则已全达，S29仅在独立输出修复，不改默认SDK，完整EG4保持未通过；详见[后处理第12节](../../docs/notes/post-process-notes.md#12-s28-采集器接线复核2026-10-04)。

### S27 三效果语义与恢复门禁（Orca Worker执行、Lead只读复核）

`NP05-S27-SEMANTIC-AB-AND-CLEANUP`三浏览器probe实际EXIT0、默认三产物及已记录输入SHA一致，真实512x512 LUT与Bloom/FXAA像素已有。Lead只读port-s28-root-s27-review.json/.log（新增浏览器0）确认Firefox bloom-restore仍48,757个显著差分像素；CPU oracle坐标交叉导致灰阶误差30，修正坐标/双线性重算六颜色误差0–2但transfer误差界限仍需声明。当前checkGate各引擎七种原始数据篡改未拒绝，cleanup仅调用名清单、mesh/material未实测归还，probe/checkgate/LUT算法指纹未齐；3效果×3浏览器应计9项，不能沿用汇总3项。完整EG4不提升PASS；新S28修正后由Lead再规范化，详见[后处理第11节](../../docs/notes/post-process-notes.md#11-s27-语义像素与门禁复核2026-10-04)。

### S26 三浏览器原生首帧（Orca Worker执行、Lead只读审核）

`NP05-S26-REGISTRATION-TIMING`终态三浏览器pre-project重注册后真实初始化/首帧通过，0pageerror、0默认SDK混入、app.close/delegate.remove完成；默认三产物及各6记录输入SHA经Lead核对全MATCH。Bloom/FXAA有实际截图变化，但overall gate只要求Bloom、restore未采样、driver/LUT指纹与资源归还不充分；ColorGrading使用8x8像素而原生square shader要求512x512/8x8tile，黑背景变126灰不能认证通道置换。只读审核port-s27-root-s26-review.json/.log已保存，新增浏览器执行0。下一批补正确LUT/语义像素/完整门槛后才规范化EG4，详见[后处理第10节](../../docs/notes/post-process-notes.md#10-s26-三浏览器首帧与效果验收边界2026-10-04)，保持NP05未完成。

### S25 原生post program建立时序（Orca Worker执行、Lead源码复核）

`NP05-S25-NATIVE-RESOURCE-WIRING`终态六post注册/descriptors=true，但material/draw/init门槛false，首例float-output-process查phase52缺group；GPU与三个A/B未运行，FF/WK未运行。Lead确认copy-pass实际passId51；工具顶点名称/父节点审计不充分，不能据此要求Editor产物。源码显示预设备onLoaded推迟至renderer事件，而native管线在发事件前就需要post材质：应在既有pre-project delegate于布局/device就绪后实测注册。包装跨effect注入legacy bloom与采集退出记录不一致也需修正。详见[后处理第9节](../../docs/notes/post-process-notes.md#9-s25-注册存在但program尚未建立2026-10-04orca-worker执行lead源码复核)，保持PG-32/NP05 NOT_RUN。

### S24 单引擎初始化与原生首帧失败（Orca Worker执行、Lead审查）

`NP05-S24-ISOLATED-BUILTINS`终态已收到：26 effect/54 shader编译、3118字节布局；Chromium无默认SDK混入、onLoaded包装注入旧builtin descriptors后createAirApp resolve，默认三产物不变、S21深快照CLEAN。运行时包装必须归入应用身份，不把相同SDK SHA当作独立已运行。报告六post注册全false（另有float-output-process名称前缀缺口），当前异常是material.passes[passID]不存在；“缺管线资源图”的唯一归因未被证明。A/B原始runner172次pageerror/空白基线仍MEASURED/EXIT0属于无效验收，三个效果保持NOT_RUN；无LUT不认证ColorGrading。完整审查边界与下一步见[后处理第8节](../../docs/notes/post-process-notes.md#8-s24-单引擎初始化与首帧失败2026-10-04orca-worker执行lead审查)。不改历史报告、不认证完整gate。

### S23 真实hidden环境校准（Lead实际执行，NOT_RUN）

`output/playwright/port-s23-native-visibility.cjs`在Chromium149.0.7827.55 headless空白页面执行两组原生CDP命令：Page.setWebLifecycleState frozen→active、Browser.setWindowBounds minimized→normal。命令均无协议错误，但前后及最小化期间document.visibilityState始终visible、hidden=false，可信visibilitychange记录为空。实际JSON/原始日志为port-s23-native-visibility.json/.log，采集EXIT=1、hiddenObserved=false；没有改属性、合成事件或启动可见窗口。

这仅是浏览器状态校准，不是SDK动作清场执行，也不认证物理后台输入。因实际hidden未发生，不进一步运行依赖该状态的PG-28清场用例；PG-28与完整EG2保持NOT_RUN。本批只新增忽略目录内采集器/证据及说明，没有改SDK源码、产物或已有正式gate报告。

### S22 原生post资源来源核对（Lead 只读执行，非效果验收）

Orca Worker执行通道`NP05-S22-ISOLATED-TOOLCHAIN`终态已收到：本机cocos-cli链编译六effect/11shader并生成1715字节布局，回读21个pass；Chromium真实加载布局/六注册成功但init仍FAIL，像素A/B未运行，默认三产物不变。Lead17组输入SHA核对全MATCH，S21快照仍CLEAN。工具侧依赖替身、skipParserTest及编译器发布来源/兼容性须分层；Phase B先启动默认六配方页面再导入变体，失败唯一归因尚不成立，需新建单引擎空白页确认并补齐builtin元数据。细节见[后处理实验第7节](../../docs/notes/post-process-notes.md#7-s22-工具链实验与审查边界2026-10-04orca-worker执行lead只读复核)。不据此改变PG-32/NP05或完整gate状态。

已找到S21缺少的六个原始effect：本机cocos4 HEAD557b06f…与冻结基线一致。port-s22-post-source-closure-final.json/.log实际EXIT=0，29个跟踪effect/chunk逐文件bytes/SHA、目标输入无差异、missingIncludes=[]。首轮把同文件CCProgram ubo误当物理chunk，初始结果保留；最终按同文件程序命名空间纠正，未编造不存在的ubo.chunk，也未跑shader编译或GPU A/B。

本仓/上游createRequire对两个候选compiler模块均MODULE_NOT_FOUND，仅说明这两个模块不可解析，不推断机器所有工具链缺失。原始资源已有可追溯来源，接下来仅在批准隔离范围查找/复用兼容编译链及官方布局生成路径；不能用解析YAML、已有legacy bloom或自写quad把NP05标PASS。SDK源码/默认产物与S21快照字节未变。

### S21 原生后处理隔离变体前置（Lead 实际构建、三浏览器执行；Orca Worker 只读终态已确认）

Orca Worker执行通道`PG32-S21-READONLY`由一次应急read_worker确认：变体构建/20输入、三native init失败、21 metadata缺六资源、正式9/0/9及10组path/SHA、九状态7 NOT_RUN/2 BLOCKED、16组件和variant标记均一致；严格只读、零写入。另存port-s22-orca-s21-review-receipt.json。docrefs146/1195是其审查时点，后续S22来源核对不在该审查范围；不把这份终态当作新的native像素执行。

沿owner #6(b)批准的隔离变体范围，以显式9 feature和独立AIR_OUT_DIR构建；port-s21-post-variant-build.log实际EXIT=0。没有改默认SDK/API或抽取源码，默认unmin/d.ts/npm前后SHA不变；变体647f1c0d…与默认de4e0472…分开记录。

port-s21-post-prerequisites.json/.log实际三浏览器EXIT=1：rendering/settings/postProcess注册存在，Custom builder为原生PostProcessBuilder；仅该变体页面通过既有原生settings选择customPipeline=true。effectSettingsPath=null、data字节数0，原生报Effect settings not found；随后builtin材质初始化在Pass.resetUBOs因shaderInfo=null失败。捕获Promise异常故pageerror为0，不能推init通过。三次init失败与三个效果A/B未执行分开；报告NOT_RUN/subset=true/completed=false、GPU量unavailable。

port-s21-post-resource-inventory.json实际解析21个当前builtin effect元数据，Bloom/FXAA/ColorGrading和必需blit-screen/post-final/float-output-process六资源均缺；旧pipeline/bloom不是原生custom post所需pipeline/post-process/bloom。20输入前后SHA一致，完整堆栈/原生日志/三截图保留。缺口已定位为布局与原生资源前置，不再把当前模块注册归为“无人import”；需可追溯的同版本布局/原生资源后再做实际A/B，不能用quad替代或借本诊断改默认发行行为。PG-32/NP05保持未完成；S20-final字节快照对应更新本段前的历史时点。

[eg4-native-post-prerequisites-s21.json](../../docs/evidence/port-gap/eg4-native-post-prerequisites-s21.json)将三浏览器×三效果明确计9个A/B用例：0已测/9未运行，candidate使用真实变体647f1c0d…，不借默认de4e0472…身份。原生init失败诊断与像素计数分开；规范化实际EXIT=0不改变原采集器EXIT=1。S21九状态记录保留7 NOT_RUN/2 AG BLOCKED，组件汇总明确展示每份candidate和variant标记，不把变体当默认候选已验。

port-s21-post-candidate.json 当前深快照 snapshotId `44d9f4d700101b7fec9a9a593ced73b83a1164990e5735ff42932d2f9fcce145`，HEAD cac42f6/dirty=501/notRun=0；port-s21-post-gate-status.log实际EXIT=0，16组件全部记录输入SHA一致，完整gate通过0。默认SDK源码与产物未动，仅新增隔离输出和前置说明；754库存及S20工具验证保持适用，不重复无增益测试。

### S20 六配方证据与完整门禁状态（Lead 实施与执行；Orca Worker 只读复核终态已确认）

Orca Worker执行通道的`PG34-S20-FINAL-READONLY`终态由一次应急read_worker确认：18/17/1、12历史attempt与2 FAIL未伪造补偿、18截图、34组path/SHA全MATCH；九状态schema 9/9、15组件无漂移、当时深快照及29/13/754日志一致，严格只读、零新增浏览器。回执另存port-s21-orca-s20-review-receipt.json。其docrefs 146/1192和snapshot 3dd5c6f…是S20审查时点；不把该结果当作后续S21变体或最新文档的审查。旧S4批消息仍保留历史身份。

规范化读取S19实际离线安装六配方的原始结果与已观察到的采集器退出码1，按浏览器/配方计18行：17已测、1 WebKit FPS未达。报告[eg3-installed-recipes-s20.json](../../docs/evidence/port-gap/eg3-installed-recipes-s20.json)保持NOT_RUN/subset=true/completed=false，保留18截图、真实包内两源码/资产身份与15原始输入SHA；仓库路径另外18行不重复加入正式计数。生成工具退出0只表示规范化成功，不改变浏览器采集器退出1。

12次实际历史尝试按原始时间保留，其中两次安装资源交付FAIL及后续输入变化如实记录；没有用当前未完成范围伪造完整补偿PASS。schema允许最终FAIL/NOT_RUN保留未补偿历史，但最终PASS仍要求有效的后续补偿链接。scope现要求非负安全整数、已测加跳过恰好等于总数，拒绝漏计和非法数值。

port-s20-final-evidence-tooling.log实际29/29 PASS，port-s20-final-schema-selftest.log实际13/13 PASS；port-s20-final-normalizer-contract.log接受真实18行、拒绝12种篡改并验证平面collector兼容，零新增浏览器运行。port-s20-final-test-inventory.log实际88套件/754测试全PASS，清单有意更新，无失败。早期S20的28测试/753库存和临时快照保留为历史，不复用为最终身份。

当前预检另存[port-gap-evidence-preflight-s20.json](../../docs/reference/port-gap-evidence-preflight-s20.json)，实际工具链可解析；本次只读检查未启动浏览器。完整门禁仍有WebKit FPS、真实hidden、加严resize呈现、原生post配置/像素和外部材料缺口；九状态必须区分7 NOT_RUN与2 AG BLOCKED。没有SDK源码变化，不重复已有浏览器、构建或包安装验证。Orca Worker迟到旧S4报告不作为当前只读审查终态。

port-s20-final-candidate.json 深快照 snapshotId `3dd5c6f327abe5b201dd7202b2e88de03257a115cddbf8260c16030772fdf904`，实际HEAD cac42f6、dirty=500、notRun=0；不填写未实际访问的loadUrl。port-s20-final-candidate-check.log实际CLEAN/EXIT=0。port-s20-final-gate-status.log实际EXIT=0，15组件的全部记录输入SHA当前一致；另存九份 *-status-s20-final.json：7 NOT_RUN、2 AG BLOCKED、完整gate通过0。状态生成记录当前validator与快照SHA；早期S20/S15/S11文件保持原样。此快照是当前字节清单，不能代替缺失范围执行或清洁发布候选。

### S19 六类统一消费与可选服务收口（Lead 实施与执行；Orca Worker 只读复核终态已收到）

Orca Worker执行通道`PG33-S19-READONLY-FINAL`终态已收到：两路径36行checkRecipe、各15输入SHA、终态/同Promise身份、实际安装源码/资产/零build请求、第六类三浏览器时钟与释放、竞态/可信预览、29项既有回归均核对一致；另作内存篡改拒绝，零仓库写入、零浏览器/安装/打包执行。每路径17 PASS/1 WebKit FPS NOT_RUN保持；审核脚本接受NOT_RUN行的诚实结构不代表该行执行PASS。其snapshotId 806f4285…与CLI loadTarget身份参数属于S19审查时点，不替代S21当前深快照，也不认证该URL已实际访问。未发现新代码问题，不重复已通过测试。

Lead 收回第六类写入边界，将真实实现移入随 npm 文档发货的 optional-recipe.ts，fixture 仅重导出。公开 AudioService.load 与 AssetBank.load；实际 Promise 在执行前登记，同名/跨阶段重入都拒绝 RECIPE_BUSY；release 撤销 bank 订阅并等待在途操作的最终存储写入，再恢复实例 key。HUD 和音频源是自有，harness 的 peer 是外部借用，模块不再创建并遗留假借用节点。没有修改 SDK 或重建默认产物。

六类共同入口接入可信按钮和 GameCanvas 手势，场景先 Start；唯一共享 director.tick(0) 时钟保持。音频 native canplay 回退约八秒后实测推进；采样等待循环内安全窗口，保留原始 currentTime 和样本，不对跨循环的负 delta 取绝对值。实际 TS4.9 首次检查发现 AudioClip.duration 不在公开声明，已改公开 getDuration；port-s19-six-public-types.log EXIT=0，覆盖共同源码、独立模块及预览。

[仓库六类](../../docs/evidence/port-recipes/pg33-six-s19-workspace-same-contract.json)与[实际离线安装六类](../../docs/evidence/port-recipes/pg33-six-s19-installed-same-origin.json)每路径三浏览器各18行：17 PASS、1 WebKit FPS NOT_RUN，scopePassed=false/subset=true/completed=false，collector 未达范围返回1。零 pageerror；安装零仓库/build请求。实际包内 main.ts 27872字节/SHA f3555ced…、optional-recipe.ts 16249字节/SHA 93866b63…与仓库完全相同；两资产也核对字节/SHA；TS4.9.5安装声明only EXIT=0。tarball SHA 27469a9c…是本次实际打包身份，不声称整个当前dirty tree具备发布资格。

首次安装媒体拦截失败保留为 installed-terminal 尝试；无SDK的 port-s19-media-delivery-repro.json 实测同一WAV真实HTTP加载成功、intercept媒体返回error4。改为真实HTTP交付实际安装字节，首轮独立资产origin下Chromium资源请求status0失败保留为 installed-http-terminal；随后让已安装入口与资产同源，三引擎可选服务均PASS。不同后端duration读回不同，不用文件名推断时长；时钟通过不认证扬声器实际出声。没有换用工作区资源或篡改HTTP错误。

port-s19-six-check-regression.json/.log EXIT=0：接受两路径36个实际行，15输入SHA当前一致、release Promise身份/终态、安装两源码身份和无/build约束；拒绝29种篡改，零新增浏览器运行。port-s19-optional-terminal-races.json/.log实际Chromium EXIT=0：创建前/重复创建/同名与跨阶段重入/释放后四操作均正确拒绝，真实在途404阶段立即release后无key、无自建节点残留，外部peer有效。

预览改为直接载入共同源码、独立TS入口和importmap，移除第二应用/inline旧实现；真实点击先发现日志层拦截画布，原失败log保留，修正只读日志pointer-events后 port-s19-optional-preview-fixed.json/.log实际Chromium EXIT=0，真实按钮/画布、白字buffer测量、引用清理与共享pacer暂停通过。Root已查看安装WebKit第六类截图。旧独立optional runner变为共同六类collector兼容入口，不能再按旧v3描述其独立范围。

PG-33仍为NOT_RUN，仅剩当前WebKit FPS范围；外部原作、真实hidden、GPU量与完整35项不在此证据内。此前S18源/runner指纹是历史冻结时点，不再宣称当前一致。Orca Worker最新边界仅只读审查，尚未收到当前标记的终态，不把反复迟到的PG12/Atlas/PG24报告当作此次复核完成。

### S18 pointer-lock捕获监听与安装消费（Lead实现与执行，非委派）

独立无SDK最小页面 `port-s18-pointer-calibration.json/.log` 实际EXIT=0采集：Chromium/Firefox各8条可信锁内相对mousemove，Chromium另有CDP焦点/移动实验2条；WebKit pointerlockerror，锁内事件0。EXIT=0只代表校准采集成功，不是三浏览器FPS gate通过。源码核对PAL mouse-input canvas handler明确stopPropagation，S17的“headless不交付移动”归因有误；Root配方监听改document capture=true并精确对称remove，保留同一浏览器事件而不增加引擎派发通道。

`pg33-core-s18-pointer-capture-attempt1.json`与对应log实际EXIT=1：Chromium FPS通过，Firefox真实relative dx使yaw到−236°，中心取样黑色，旧verifier误要求视角转离方块后仍红色；WebKit仍NOT_RUN。保持真实相对移动，不伪造movementX；runner按协议差异驱动小幅移动，并独立断言原始可信dx之和×0.2等于yaw增量、暂停可信移动不改变yaw/moves，以及精确解绑后可信移动不改快照。

最终[仓库S18报告](../../docs/evidence/port-recipes/pg33-core-s18-pointer-capture-aligned.json)与[实际安装S18报告](../../docs/evidence/port-recipes/pg33-core-s18-installed-pointer-capture.json)、`port-s18-pointer-capture-aligned.log`/`port-s18-installed-pointer-capture.log`实际均EXIT=1：各14 PASS/1 WebKit FPS NOT_RUN，zero pageerror；Chromium yaw=1.6、6个受理可信事件，Firefox yaw=−1.4、2个受理可信事件；其余四类原测量全部继续通过。安装从实际tarball源码24877字节/SHA271020e2…读取，与手册相同；tarball SHA11515b84…；TS4.9.5实际包声明EXIT=0，三引擎零仓库/build请求。Root查看Firefox实际FPS截图。运行时仍de4e047…，无SDK改动或构建。

`port-s18-pointer-source-types.log` EXIT=0；`port-s18-core-check-regression.log` EXIT=0，两路径30个实际行的已测条件校验、13种篡改拒绝、12输入SHA当前一致、same release Promise与退役守卫保留，零新增浏览器运行。S17报告是修改前历史，不再据其旧配方指纹声称当前绑定；前五类完整三浏览器与第六类组合仍非PASS。第六类修复继续由Orca Worker执行，当前SDK生产代码和Jest库存没有新增变动，不重复752全套测试。

### S18 第六类修订竞态复现（Lead审查与真实浏览器执行）

Worker第六类S18修订已进入工作区，公开AudioService.load/4秒样本与negatives-before-release已改；独立optional-s18三报告有新的原始音频数值，但当前仍未集成。Lead读源确认release在在途时仅waitMs(50)，不是等待原任务；guard允许同名阶段重入；recipe创建peer sentinel却故意不回收，不可把自己的泄漏当borrowed保护。

真实Chromium生产模块 `port-s18-optional-races.json/.log` 实际EXIT=1：construct后开始真实bank 404 negatives并立即release，release回执ourKeysCleared=false；结算后仍有本实例pg33-…-corrupt key和valid的自建peer节点，外部独立peer保持valid，release Promise身份本身相同。只用真实公开引擎/AssetBank/模块与当前HTTP server，没有替身或新增SDK改动。音频/可信按钮未在这次竞态检查中认证。

当前S18 runner仍程序化跑run，无Playwright点击却注释称可信按钮；HUD截图在release后且包含原公共index的DOM按钮，不能证明退役Label或故障后HUD像素。要求按真实在途Promise等待、全部自有节点释放、外部peer由harness创建；实际preview+trustedclick、canvas缓冲Label测量与原始音频数值断言；补runtime/dts/前后输入指纹、真实类型入口和新out。第六类保持审查失败，不采信自报allPass或完成标记。

### S18 第六类当前交付审查（Orca Worker实施；Lead审查）

Worker消息连续迟到旧S4批次时，仅做一次Orca emergency captured-output与消息队列诊断，确认其执行通道已经完成PG33-OPTIONAL-S17B并报告optional run4，队列为空。当前第六类文件确实已交付，不再把“尚未收到终态”当作当前事实；该通道报告通过不自动等于Root集成验收。

Lead静态/原始报告审查 `port-s18-optional-review.json/.log` 实际EXIT=1，零新增浏览器运行：源码把资产强转写入AudioService私有_clips；runner先release再negatives，坏JSON负例在恢复之后再次写入实例key；三浏览器暂停起始播放头均0，短音频已结束，不能由0→0证明暂停保持；没有真实点击记录或候选输入指纹；WebKit partial/notRun=2仍allPass=true。preview还未construct、缺少SDK importmap且相对模块路径错误，根typecheck不覆盖这个fixture。当前run4报告保留为未通过审查的历史输出，不集成、不提升PG33状态；具体修复交回同一Orca Worker。Root共同源码/SDK和S14/S13验收字节未改。

### S17 文档/npm同源配方与候选应用指纹（Lead实现与执行，非委派）

再次收到Worker旧S4/PG12失败报告，实际核对S14平台终态11输入SHA无变化、S16组合配方8输入SHA无变化，未覆写已验代码；其报告不取代Root当前通过证据。优先interrupt将Worker任务限定为PG33第六类，不让它重做平台或旧纹理批次。第六类当前终态尚未从其执行通道获得，不引用草稿手册的常量通过声明。

将前五类唯一源码移入随npm发货的[手册示例main.ts](../../docs/manual/examples/manual-port-recipes/main.ts)，test fixture仅薄入口。对重复construct与释放后的construct/run/pauseRestart增加真正执行的应用守卫；所有release仍返回同一Promise。FPS移动只请求共享dt0 render，不增加第二时钟。新增installed-recipe-package工具本地pack/自有临时目录offline install，读取实际包内同字节源码、TS4.9实测与独立编译；临时目录/浏览器/server均正常回收，不发布，不修改工程依赖。

`port-s17-installed-attempt1.log` EXIT=1：迁移后首次安装路径12 PASS/3 FPS NOT_RUN；加终态守卫后的`port-s17-core-installed-terminal.log`同范围通过且FPS未达。首次仓库`port-s17-core-workspace-terminal.log` EXIT=1、三个浏览器在加载阶段SyntaxError，尚未进入配方；实际生成的bundle中，CommonJS包下仅side-effect import的薄入口被分类成CJS并把await init_main放入非async函数。`port-s17-workspace-bundle.mjs`/Node --check重现，薄入口明确export {}后可解析；runner现先解析生成JS，避免等到浏览器timeout。该记录是验证入口失败，不是引擎渲染故障，旧输出保留。

最终[S17仓库原始报告](../../docs/evidence/port-recipes/pg33-core-s17-workspace-module-fixed.json)与[实际包原始报告](../../docs/evidence/port-recipes/pg33-core-s17-installed-module-fixed.json)、对应`port-s17-workspace-module-fixed.log`/`port-s17-installed-module-fixed.log`实际均EXIT=1：各15行12 PASS/3 FPS NOT_RUN，zero pageerror。实际包core源码24000字节、SHA a1ad5ab3…与当前手册逐字节相同；tarball SHA aa7814ca…；安装源码使用实际包SDK声明TS4.9.5 EXIT=0，原始类型文件清单与命令在报告中，三个浏览器均零仓库/build请求。每行验证重复构建被拒、退役三操作RECIPE_DISPOSED及释放同一Promise。原生3D/Input-HUD/Camera/Shared-Pool-Subtree的全部原测量继续通过；FPS相对输入的既有环境限制未变，仍NOT_RUN，不称两路径或六类整体PASS。

`port-s17-recipes-terminal-source-types.log` EXIT=0；`port-s17-core-check-regression.log` EXIT=0，接受两路径30行的已测条件，九种篡改拒绝、12个输入SHA当前一致、安装源码与手册一致及无/build回退，零新增浏览器运行。S16和S17早期collector指纹作为历史保留，迁移后由新S17报告绑定新入口；没有更改默认SDK源码/构建，runtime仍de4e047…。

候选工具原contracts仅test与browser矩阵，未覆盖随npm发货的配方源码：受控临时目录`port-s17-manual-snapshot-controlled-baseline.log`实测同版本修改文档源码仍drifted=false；扩大为test+docs/manual/examples+examples后`port-s17-manual-snapshot-fixed.log`检出具体contracts文件及前后SHA。最初`port-s17-manual-snapshot-baseline.log`误用collectSnapshot参数而采到仓库，不作受控复现证据；修正后的controlled日志才是基线。新回归同时要求manual和examples改动时artifact digest不变而contracts必须漂移。`port-s17-evidence-tooling-tests.log` EXIT=0，27/27；因新增用例更新全库存`port-s17-full-test-inventory.log` EXIT=0，88套件752/752、零failed，已登记docs/test-inventory.json。S15旧快照仍是其时点的旧范围，不称最终冻结；PG27/34整体状态不升格。

### S16 前五类组合配方（Lead实现与执行，非委派）

替换PG33旧草稿的无条件pass、非对称listener清理、未运行Scene就tick、伪输入/池/资源判断。共同main、runner及port-recipes手册归Lead；Orca Worker边界仅独立optional-recipe模块与独立资源/预览/手册，不以其旧PG01/24补报冒称PG33终态。

`port-s16-core-attempt1.log` EXIT=1：首次真实三浏览器采集揭示fixture错误假设（3D色调映射229而非255、pressed在消费tick后置位、暂停时引用归零不等于立刻销毁）。`port-s16-core-attempt2.log` EXIT=1：四类每浏览器PASS，DOMException numeric code8被误与name NotFoundError比较。`port-s16-core-reviewed.log` EXIT=1：Vec3(NaN,…)原生构造会归零，配方必须在构造前检查原始数值。全部失败原始JSON/log保留，不解释为整个引擎故障。

[当前原始报告](../../docs/evidence/port-recipes/pg33-core-s16-terminal.json)、`port-s16-core-terminal.log` EXIT=1：三个真实浏览器各五类，12 PASS/3 NOT_RUN、零pageerror；3D实际像素/隐藏恢复/两AIR负例、可信PAL键盘0/1/3tick和暂停准入/Label墨迹与退役、chase/vehicle/flight实际坐标/像素及两应用守卫、共享三lease/原生NodePool/子树替换/两peer保留/实际帧纹理refs0且销毁全通过。release对每类验证相同终态Promise；全部八个source/runtime/runner/contract输入SHA前后一致，默认runtime仍de4e047…未重建。

Chromium/Firefox可信按钮获得锁，但headless自动化未送达锁内相对mousemove；WebKit可信请求WrongDocumentError缺focus。这三行完整FPS均如实NOT_RUN，pointer-capture两DOM负例及监听退役只证明其实际scope，不代替相对输入或权限拒绝。collector整体scopePassed=false/completed=false/subset=true，未生成PG33 PASS，也未把15行中已测的条件检查当作15行完整通过。

`port-s16-recipes-terminal-types.log` EXIT=0，真实TS4.9对SDK声明noEmit。`port-s16-core-check-regression.log` EXIT=0，15行已测条件接受、九种篡改样本拒绝（缺阶段/假像素/丢边沿/暂停推进/错误相机/缺负例/重复lease/资产仍valid/旧子树未失效）；此为runner回归，无新增浏览器执行。Lead查看WebKit共享资产实际三绿色块截图。第六类同通道终态/集成、六类npm实际消费及FPS相对输入仍待完成；EG/AG全范围状态不升格。

### S15 当前环境与完整gate状态复核（Lead实现/执行，非委派）

Worker补报run3的实际日期为03:18 UTC、runtime=54c567…，是历史候选；当前S12/S13与手册已以de4e047…实际绘制plane/glTF并区分UV基准。ImageAsset.destroy清除原HTMLImage.src的所有权问题已被手册纠正，不能把旧未绘制夹具推广为当前引擎缺口。不重做该历史批，不将Worker旧Task B作为现行PG33任务。

修复port-gap-env-preflight从不存在的pw.package取版本导致null、部分浏览器失败仍总AVAILABLE的问题，按同一browser-engines选择实际二进制，写新文件拒绝覆盖旧预检。`port-s15-env-preflight.log` EXIT=0，[新预检](../../docs/reference/port-gap-evidence-preflight-s15.json)实际启动三引擎：Chromium149.0.7827.55、Firefox155.0、WebKit26.6；Playwright1.63.0。未安装/下载，未执行应用场景；可启动不等于GPU/input门禁通过。`port-s15-preflight-regression.log` EXIT=0，三种聚合集合和模块/实际启动版本、CLI EEXIST退出2且旧文件字节不变。`port-s15-evidence-tooling-tests.log` EXIT=0，两套31测试；`port-s15-schema-selftest.log` EXIT=0，13/13。

`port-s15-provisional-candidate.log` EXIT=0，真实深快照e9b22572faba3436…、HEAD cac42f6e897f、当时dirty494、缺失产物notRun=0；源码1393个文件与config/runner/contracts/artifacts均逐文件记录。随后`port-s15-provisional-drift.log` EXIT=0 CLEAN。这是该时点临时检查点，后续报告/文档与PG33会改变输入，不称最终冻结或clean worktree；未猜测实际加载URL。

`port-s15-gate-status.log` EXIT=0，schema及原路径验证、14个既有规范化组件全部记录的当前输入SHA一致（详见port-s15-component-identity-review.json）；生成独立S15完整gate状态，不覆写S11历史。EG0…5/AIG仍7个NOT_RUN，AG1/2仍2个BLOCKED；PG12与原生751已补偿，当前缺口具体为PG33、真实hidden、加严WebKit呈现、原生post像素、最终库存/身份绑定与聚合。S12实际legacy release EXIT=1只报告dirty，不推出完整PG门禁READY。没有提交、发布或清理他人改动。

### S14 平台配方物理与清理收口（Lead实现与执行，非委派）

最新分工将PG-12交Lead、PG-33交现有Orca Worker；Worker迟到的PG-01/PG24历史报告不改变这个分工。本轮仅修复platformer-recipe夹具、合同、独立runner和手册，没有修改引擎或重建默认产物。当前runtime完整SHA仍为`de4e0472e8a9cf86af801e3f9f164c564ef43202278a3ef4ff6f67609de33d69`。

真实源码和浏览器诊断定位：RigidBody2D.linearVelocity原生使用Box2D单位，旧配方把90/260像素每秒直接传入，放大32倍；PhysicsSystem2D.gravity的setter已经转换，不能再次除32。组件启用后修改BoxCollider2D.size/friction必须apply，旧夹具仍使用1×1默认形状。玩家/Tiled视觉必须在Canvas子树，原Scene顶层UI路径没有实际像素。这些接线纠正后，真实接触µ=0.2在50步内把松键速度从87.87降到0，没有人工衰减/linearDamping；松开空中全部控制后12步vx=90保持。

接地改为PRE_SOLVE世界流形、按A/B身份朝向玩家的向上法线及脚底接触区间，END移除支撑。单向板正确使用三参回调和disabledOnce，按上升及上一步脚底在板下拒绝本步接触；1e-3像素/秒阈值避免求解器极小正误差反复禁用站立接触。真实板顶穿越、下降冲量、最后连续10步支撑和位置/速度由runner独立检查，BEGIN计数不算落地。墙角接触不能授予跳跃。受控/实时两模式均保持engine pacer暂停，唯一自持rAF固定物理累加后director.tick(0)渲染；暂停的可信按键不准入，渲染继续但位置/速度/物理计数不变。

`air-platformer-s14-unit-review`、`-native-fixtures`、`-support-roundoff`、`-foot-support`、`-contact-span`、`-retired`均为实际FAIL，分别保留初始形状/支撑、浮点误判、接触区间、销毁后读取节点、以及释放队列时点的诊断。`-session-release.json/.log` EXIT=0三浏览器通过基本闭环；加严原生session回执label检查的`-final.json/.log` EXIT=1，因为真实label带`#序号`，不是清理失败；修正按原生格式核对并保留原失败。终态`air-platformer-s14-terminal.json/.log` EXIT=0，Chromium/Firefox/WebKit三个场景全部PASS。独立完整9阶段枚举拒绝缺失/空结果；真实白色玩家和石块RGBA、可信键盘→PAL→input、restart、pause、资源均测。清理撤销唯一rAF、对称off/removeEventListener，session完成platformer-assets#序号，关闭后再真实按键输入/渲染/物理计数不增；幂等Promise、退役resume拒绝、8资产失效/3加载引用归零。WebKit实际截图由Lead人工查看，玩家、石块地面/墙与三平台可见。

`port-s14-platformer-terminal-types.log` EXIT=0，为SDK声明映射下真实TS4.9 noEmit，不以Jest/esbuild当类型证明。`port-s14-platformer-check-negatives.log` EXIT=0，原始实际snapshot可过、六种修改后的缺阶段/伪造减速/暂停推进/空中接地/未穿板样本均拒绝；这是runner回归，不新增浏览器次数。`port-s14-platformer-normalize.log` EXIT=0，生成[限定PG34报告](../../docs/evidence/port-gap/eg3-platformer-s14.json)，保留9次真实attempt执行/命令/exit/补偿链、原始JSON/log/截图/类型日志，计数仅三浏览器场景行。PG-12按计划限定配方记PASS，外部原作材料、真实hidden、全35项和GPU分配量不在该PASS内；PG-33及最终候选/聚合继续待完成。

### S13 当前多源纹理与PG-24收口（Lead实现与执行，非委派）

Orca Worker再次补报PG-01的33/151与PG24历史run1，没有新增PG-12/33结果；不重复集成或恢复旧“公共未导出”/plane缺口判断。Root在独立texture-source-review夹具及air-texture-source-review采集器补齐当前默认产物的HTMLImage/Canvas/ImageBitmap、顶/底优先直接字节、copyCanvasRows及IMemoryImageSource共七输入，每浏览器Sprite与+90X原生plane/上传前后共20次四角观察，三浏览器60次。runner独立枚举kind/source/stage，拒绝缺失/重复，不能由空数组every判绿。

`port-s13-texture-source-types.log`、`air-texture-source-s13-current.json/.log`均EXIT=0。进一步将原纹理/帧身份由上传前冻结的独立引用快照核对，`port-s13-texture-source-identity-types.log` EXIT=0及`air-texture-source-s13-identity.json/.log` EXIT=0三浏览器全通过；ImageData在SDK构造参数的真实TS4.9 expect-error负例中被拒绝，NOT_APPLICABLE不强转成GPU执行。Sprite顶边v=0时DOM/顶优先字节朝上，plane顶边v=1时对应图样翻转，helper底优先副本在plane朝上；左右均保持。原始DOM纹理/帧上传前后同一对象、像素方向不变；七纹理/四图像引用归零、Mesh/Material/Frame/Texture/ImageAsset正常销毁，receipt released/pending=[]，GPU分配量unavailable。WebKit最终plane截图人工确认蓝黄在上、红绿在下。

`port-s13-texture-sources-normalize.log` EXIT=0，生成[PG34限定多源报告](../../docs/evidence/port-gap/eg3-texture-sources-s13.json)，三个浏览器场景行，内部20观察不重复计为gate用例。原始文件/完整输入SHA/浏览器版本可查，不覆盖Worker历史texture-orientation截图或日志，不改S11已通过UV夹具/报告的输入字节。连同S12公开GLTFLoader外部PNG/嵌入bufferView、真实sampler及交错原纹理/释放，PG-24约定范围闭合；[方向手册](../../docs/manual/texture-source-orientation.md)明确区分当前与历史最小夹具，不能由未绘制的单夹具推断整个3D路径故障。

实证支持保留默认上传合同，未新增全局/逐上传flipY入口；需要方向变化时采用目标UV或独立行序副本。没有修改glTF/抽取引擎上传源码，无新增上游差异需要登记。PG-24记限定PASS；颜色空间CB-16/压缩纹理/实体设备范围及完整EG3独立，未生成全量设备或永久无泄漏结论。PG-12/33、最终合同候选冻结及完整EG/AG状态继续待收口。

### S12 当前glTF方向、完整矩阵与API覆盖补偿（Lead执行，非委派）

收到Orca Worker当前PG-01正式终态：其实际执行27原始用例+Lead六审查用例合计33/33、十套151/151、typecheck/doc-refs通过；明确factory保持顶边Y、重复页URL每成功订阅逐次释放、size前瞻块边界。此为Orca Worker执行通道的终态，未把Lead浏览器或安装消费冒称Worker执行。Lead随后执行`port-s12-atlas-terminal-identity.log` EXIT=0，S11真实安装包三浏览器报告全部16个source/fixture/runner/default加载输入SHA与当前一致，无需重复相同GPU验证。PG-01限定交付记PASS。Worker补报的“公共导出尚未接线”已被当前index及手册公开状态和S11真实包结果纠正，不照旧恢复。

`port-s11-full-browser-matrix.log` EXIT=0，完整26条合同在三个浏览器中78/78 PASS，原生报告completed=true/subset=false；全绿后已刷新正典JSON与截图。合同未降低原有阈值，既有WebKit resize较宽门槛不等于PG-08/35加严截图通过。`port-s12-complete-browser-compensation.log` EXIT=0，smoke29/30两套46测试，补偿先前starter规格/完整标记及矩阵指纹/截图的五项失败。`port-s12-isolation-matrix-compensation.log`实际只发现smoke23一套3测试（另一个指定文件名不存在），3/3通过；没有把该命令记为两套矩阵测试。完整矩阵已生成[限定EG3规范化报告](../../docs/evidence/port-gap/eg3-complete-reference-matrix-s12.json)，78浏览器场景行，不能升级完整EG3。

`port-s11-full-example-spec-browser.log` EXIT=0，实际发现普通runtime示例154/154 PASS，152晋级/0降级，4325逐API verified及71 attested，完整标记与当前candidate绑定成立；5个requiresDevTools示例独立运行，故不能将本命令写成159浏览器示例。更新API库存`port-s12-api-inventory.log` EXIT=0，12260单元/1439必需单元。`port-s12-api-coverage.log` EXIT=1：Core963/964，唯一缺口为新增Camera.orthoWidth；Important272/283、Advanced180/192分别通过自身门槛，未修改100% Core要求。旧5个DevTools报告candidate过期也被披露。

相机属性示例补Camera.orthoWidth默认0、显式半宽1.75、-1/NaN/Infinity拒绝且不污染状态、恢复自动宽度与原生renderer同步检查。`port-s12-camera-spec-bindings.log` EXIT=0更新11行绑定、`port-s12-camera-spec-validation.log` EXIT=0规格159/159 frozen，实际试跑`port-s12-camera-viewport-trial.json/.log` EXIT=0，1/1及55逐API证明，不回写晋级或冒称完整；随后启动新的完整runtime示例采集`port-s12-full-example-spec-browser.log`，终态尚待完成。该示例不在26条矩阵中，矩阵合同/截图身份未变化。

`port-s12-full-devtools-browser.log` EXIT=1，五例运行5/5，但工具隔离错误以子串SESSION_CLOSED匹配公开AIR_E_SESSION_CLOSED；原始完整报告保存在`port-s12-devtools-boundary-failed.json`。修正为独立标识边界，保留其他禁用标识，并让全局失败/子集/空scope无法标completed或晋级，空scope以非零退出。`port-s12-full-devtools-compensation.log`及最终`port-s12-devtools-cardinality-final.log`均EXIT=0，五例5/5且隔离PASS，77 verified/10 attested/0 unproven，实际重新采集正典。源/API并未因检查修正改名。

`port-s12-camera-signature-types.log` EXIT=1，没有签名findings，但通用工具的CommonJS选项不支持示例顶层await，allowJs推断还暴露既有JS helper的默认async回调类型；不冒称该检查通过。单独ESNext/DOM配置、allowJs=false检查真实Camera声明及完整示例TS，`port-s12-camera-esm-types.log` EXIT=0；不将此结果当JS helper类型证明，不修改共享helper或候选字节。

`air-gltf-texture-s12-initial.json/.log` EXIT=1，探针错误查询不存在的纹理方法；`port-gltf-texture-s12-public-sampler-types.log` EXIT=2捕获资产枚举/GFX枚举类型差别。探针现读取公开getGFXSampler().info并按TextureBase真实数值映射比较，`port-gltf-texture-s12-sampler-enums-types.log` EXIT=0；`air-gltf-texture-s12-sampler-enums.json/.log` EXIT=0，三浏览器各四次四角GPU观察，外部PNG/嵌入bufferView方向、实际nearest/clamp、交错上传后原纹理、非法sampler拒绝及所有权释放全通过，WebKit截图人工核对。GPU分配量unavailable、颜色空间/所有UV/压缩纹理不认证。失败补偿链和原路径通过schema校验，见[EG3报告](../../docs/evidence/port-gap/eg3-gltf-direction-s12.json)及[当前UV合同](../../docs/reference/texture-uv-verification.md)。未加全局flipY、未改glTF/引擎上传源码，PG-24待Worker当前多源终态与手册同步。

`port-s12-full-example-spec-browser.log`最终EXIT=0，154/154及新相机示例55逐API证明，1晋级/0降级；`port-s12-example-chain.log` EXIT=0，七项完整性检查无错误、当前candidate匹配。`port-s12-full-test-inventory.log` EXIT=0，88套/751测试全部通过且发现/库存一致，补偿S11全库六失败；该时点结果不替代后续Worker新修改的验证。

`port-s12-static-gallery.log` EXIT=0，刷新普通生成目录build/examples后245/245检查，154/154非DevTools示例在/apps/gallery嵌套挂载真实启动，65个生命周期合同完成、零HTTP/外部请求/页面错误，部署引擎与当前默认字节一致。执行前核对删除/重建目标为工作区普通build/examples目录，无link/reparse跳转；不删除源文件。

`port-s12-api-coverage-compensation.log` EXIT=1虽然Core964/964、Important272/283、Advanced180/192各自比例门槛已过，仍有11个新Billboard单元未声明覆盖状态和一个renderer.scene.Camera.orthoWidth缺口。它们不具当前Gallery逐API证明：库存以既有documented-only规则注明，Billboard专项范围见手册/台账、底层属性优先通过已证明的组件Camera.orthoWidth使用；不新增verified、不减少分母、不改阈值，也不声称这12项逐API验证已完成。`port-s12-api-coverage-status-inventory.log` EXIT=0、`port-s12-api-coverage-status-explicit.log` EXIT=0，仍为964/964（call849/read115）、272/283（call246/read26）、180/192（call161/read19），required1439不变。`port-s12-release-readiness.log` EXIT=1，仅现有release检查的dirty worktree阻断；不暂存/提交绕过，也不能从该旧门禁仅一阻断推出35项完整PG门禁通过。

`port-s12-doc-refs.log` EXIT=0，145文档/1177引用/0新断链。PG-12/33仍未收到对应新实施终态，外部AG1/AG2及加严WebKit呈现/真实hidden等缺口不被以上通过记录覆盖。PG-27最终契约候选冻结与PG-34完整gate仍后置。未暂存/提交/发布。

### S11 能力矩阵、schema报告与完整库存问题（Lead执行，非委派）

`port-native-s11-matrix.json/.log` EXIT=0，默认统一产物三浏览器复跑原生2D粒子/builtin碰撞/Cannon刚体/neon-night-city实例化四例，12/12。复用原合同未放松阈值；实例化记录实际device.numDrawCalls=8。矩阵采集器改用既有匹配Playwright协议的browser-engines定位，并记录真实版本/命令/起止/fullSHA与前后身份核对；子集scopePassed=true、completed=false，不能当26条全矩阵通过。12截图按既有采集器规则更新在docs/evidence/browser-matrix相应目录，旧完整JSON因此需要重采，不能沿用其旧截图摘要。`air-scene-s11-unified.json/.log` EXIT=0，三浏览器各100次当前默认产物实际绘制/共享引用/业务监听timer/持久节点/重复Promise/页面导航/reload与close通过。

browser-engines注释去掉重复旧表说明，使相关报告helper指纹变化，重新采集受影响的Atlas与UV范围。`air-atlas-s11-runner-current.log` EXIT=1为工具错误要求out必须第一参数；采集器改为查找具名out，`air-atlas-s11-order-fixed.json/.log` EXIT=0，真实tarball三浏览器像素/清理通过。`air-uv-s11-runner-current.json/.log` EXIT=0三浏览器Sprite/plane/raw/helper与复用原DOM纹理通过，原失败日志保留。`port-s11-matrix-tooling.log` EXIT=0，既有行序/源指纹/HTTP/脚本解析回归通过；schema selftest 13/13通过。

新增只读`port-gap-browser-evidence.cjs`，原执行命令/cwd/时间/观察到的exitCode与版本保留，核对全部原报告指纹与日志；拒绝漂移、退出码矛盾和缺失日志，不将子集或混合合成触点升级为全量/真实设备。`port-s11-evidence-normalization.log` EXIT=0两套31测试，含既有26 schema回归；`port-s11-normalizer-final.log` EXIT=0新增5项最终断言。实际执行`node output/playwright/port-s11-normalize-batch.cjs`，`port-s11-normalize-batch.log` EXIT=0，生成[10份限定浏览器报告与9份独立gate状态](../../docs/evidence/port-gap/README.md)，全部通过schema/原路径核对。完整EG/AIG为NOT_RUN，AG1/AG2为BLOCKED，不称READY。缺单独源码指纹的旧矩阵行明确NOT_RUN该指纹，不凭运行时字节猜源版本。

`port-s11-test-inventory.log` EXIT=1：实际发现88套件/751测试，745通过/6失败，库存按真实发现更新，未跳过失败。3项示例规格/引用来自starter新增两行后的8个行号漂移；2项矩阵来自当前bundle/截图与旧JSON失配；1项默认runtime隔离误把公开AIR_E_SESSION_CLOSED子串当作可选工具SESSION_CLOSED。隔离检查仅对后者改为独立标识边界，其他禁止标识与package边界保持；`port-s11-spec-evidence-refresh.log` EXIT=0回填8项行号，其他4483条绑定无变化。

`port-s11-spec-and-isolation-fixed.log` EXIT=1仍暴露starter规格指纹陈旧；`port-s11-starter-current-spec-browser.log` EXIT=0真实当前starter 1/1、9 API证明与promotion更新。示例采集器的subset完成标记同步修正为completed=false。本地压缩JSON数组时引入两个尾逗号，`port-s11-spec-isolation-current-evidence.log` EXIT=1；立即纠正，`-json-fixed.log`仍EXIT=1，因为规范审查诚实拒绝把新子集及保留历史行认成整轮当前测量，隔离3测试已通过。未修改门禁为忽略这项缺口。已启动26条完整三浏览器矩阵（`port-s11-full-browser-matrix.log`）和159示例的完整规格驱动实际采集（`port-s11-full-example-spec-browser.log`），终态尚未返回；只有完整矩阵绿色且非subset才更新正典JSON，全部采集结束后再做库存/引用/完整gate核对。

审查Worker当前PG-33草稿发现无条件ok、releaseOK常量true、六类negatives为空、无真实指针锁交互等证据不足；不执行它来制造PASS，也不以纯累加器测试替代闭环配方。PG-12及PG-33继续由Orca Worker按已派边界修复。Worker最新64测试报告仅覆盖bank32/atlas26/texture6，不是追加六修复或PG-12/PG-33终态；公共导出与Root实际安装消费已完成，不重复接线。

### S10 统一产物、真实安装包与集成失败（Lead执行，非委派）

`port-s10-unified-build-all.log` EXIT=0，统一刷新默认unmin/min/d.ts/bootstrap/npm，包含S8三个蒙皮修复。保留已排除Spine外部项及AudioPCMDataView声明解析警告；不以构建成功代替消费验证。`port-s10-installed-consumer-types.log` EXIT=0，实际打包/离线安装的601导出、TS4.9经典/node16与TS7.0.2原生DOM、bootstrap入口通过，沿用既有skipLibCheck范围。

`air-atlas-s10-installed.json/.log` EXIT=0，三个浏览器实际安装tarball、/installed分块请求、图集旋转/trim/多页索引/紧凑格式/在用拒绝及引用归还通过；Lead查看WebKit实际彩色图样截图。`air-mixed-s10-installed.json/.log` EXIT=0，实际安装包三浏览器×两后端×两canvas的12组合序列通过；可信键鼠与合成触点分层不变，实际标签切换仍未产生hidden，保持NOT_RUN。公共导出已接，不再等待旧报告所述接线。

`air-skinning-s10-unified.json/.log`、`air-capacity-s10-unified.json/.log`、`air-uv-s10-unified.json/.log`与`air-bootstrap-s10-unified.json/.log`均EXIT=0：当前默认产物三浏览器蒙皮119观测/浏览器、容量边界、Sprite/plane/raw/helper/重复原DOM纹理方向，以及unmin/min/npm副本和WebGL2失败入口。bootstrap报告修正为subset=true/completed=false/scopePassed=true，不将12限定场景标为完整验收，也不将npm副本冒称tarball安装启动。

`port-s10-s9-byte-identity.json` EXIT=0，默认unmin与S8隔离bundle逐字节SHA256相同（`de4e0472e8a9cf86af801e3f9f164c564ef43202278a3ef4ff6f67609de33d69`）；S9十分钟稳定性、相机可见性、glTF取消三个报告记录的全部source/fixture/runner指纹均与当前文件一致。保留这些原始执行的时间、命令、浏览器与测量边界；身份检查属于CONTRACT_STATIC，不冒称重新执行浏览器或再次长跑。

`port-s10-feature-exports.log`、`port-s10-file-map.log`、`port-s10-licenses.log`、`port-s10-web-only.log`均EXIT=0，分别核对26默认feature/28 AIR重导出、1322映射/106修改、10许可证项和1069 Web闭包节点。

`port-s10-native-integration.log` EXIT=1，36套件/342测试中35套件/341测试通过；Worker新增PG-33的连续帧用例失败，verifyAccumulatorSteps错误把相邻帧相同步数当作输入边沿重放，不能升级EG1。当前`docs/evidence/platformer-recipe/pg12-platformer-run-final.json`三浏览器均FAIL（减速与单向平台），keyboardSanity.ok=false尚未进入失败条件。Lead审查确认接触回调取错参数（原生按self/other/contact派发）、手工速度衰减代替真实摩擦、通行计数与布尔判断不一致等问题，交Orca Worker在原边界修复并补真实清理与负例；PG-12记FAIL、PG-33保持NOT_RUN。历史旧报告不补偿这些新失败。最终候选、测试库存与正式EG/AG聚合仍待这批实施收口，未暂存/提交/发布。

新增[28项集成合同速查](../../docs/manual/port-integration-contracts.md)，A1…G4全部逐项列出原生合同、去向及证据边界；索引链接可查。`test/fixtures/integration-contracts/snippets.ts`通过实际签名/类型检查，`port-integration-contracts-types.log` EXIT=0，无findings/diagnostics。补正tips/game/input-and-events及对应示例注释中的canvas聚焦与立即派发语义，截图说明改为当前WebGL2源码合同；切换页链接已经实现的releaseScene回执，保持GPU不可测及长期稳定性待验声明。

`port-integration-contracts-consistency.log` EXIT=0，严格手册源码一致性通过；五个既有教学片段WARN分别来自input-and-events两个补充片段、installation声明、webgl-compatibility-check与responsive，未被当作完整示例。`port-integration-contracts-focus-doc-refs.log` EXIT=0，无新增断链；PG-26只收文档与合法签名范围，不升级其他待验PG或外部端口报告。

Worker补发的AssetBank竞态报告描述“交付携带管线临时引用”，与当前原生零引用交接及已修生产实现不一致。Lead读取当前结算/释放路径并实际执行`port-bank-report-ownership-confirmation.log` EXIT=0，8个所有权/竞态回归通过，保持当前代码及先前真实网络验收。补发报告的24/104测试是Worker所述历史scope，不能替换当前8例实际记录或据此恢复旧临时引用算法。

Atlas追加审查：`port-atlas-review-current.log` EXIT=0，原五项libGDX兼容/页序回归通过；尚待Orca Worker此轮终态。新第六例`port-atlas-repeated-page-review.log` EXIT=1，重复page URL释放后bank.size为1（应0），Map只记录URL导致少归还一次真实订阅。`air-atlas-s6-rect-pixels.json/.log`及`-release-settlement.json/.log` EXIT=1，三个浏览器均采到PNG底部背景色而非顶部四角图样，确认factory反转rect.y错误。原生UV直接消费图像顶边Y，需保持libGDX xy.y；offset.y仍为裁剪中心的向上坐标，不能连带反转。后者等待正常异步资产释放任务后，三浏览器帧isValid均false、纹理引用均0、bank.size=0（单独scope），不将首轮过早检查帧有效性误作引擎清理失败。采集器首次两个日志（`air-atlas-s6-factory-review.log`和`-native-rect.log`）是esbuild同步插件/外部入口配置错误，修工具后才获得上述实际GPU失败；保持旧失败原样。

已收到Orca Worker的后续AssetBank零引用模型纠正终态：其bank测试24例与Lead竞态8例合计32/32通过，七套112/112及typecheck/doc-refs通过（均为Worker自述实际执行scope）。报告明确采用只自持一次引用、无人接管以净零引用对触发正常释放、缓存微任务交付与settle-once；当前源码与该终态一致。先前错误临时引用报告保持为历史记录，已被此纠正报告补偿；PG-32十能力范围仍待验，PG-01追加修复继续由Orca Worker实施。

### S6 测试输入与逐触点所有权（Lead实现与执行，非委派）

新增可选 `tools/debug/test-input.ts`，仅显式启用：指定app.canvas派发合成DOM键/触点，复用真实PAL链，无新增监听器或时钟；校验整批/id/坐标/生命周期，显式session准入与代次保护，dispose配对keyup/touchcancel。默认runtime/export/package不包含工具。`port-test-input-dom-contract.log` EXIT=0，3个实际DOM负例/配对/会话测试；`port-test-input-types.log` EXIT=0，以真实TS4.9/DOM声明检查工具（不是依赖Jest关闭diagnostics）。

首轮`air-test-input-s6-dom-pal.json/.log` EXIT=1，三个浏览器暴露生产native动作适配器误遍历整个getTouches批次：UI吞掉id11，但id12进入global时将id11重新准入，UI end/cancel不经global因此留下held。`port-action-ui-contact-repro.log` EXIT=1以真实PAL/Input和受控UI吞噬边界复现。改为消费原生逐触点 `event.touch`，保留原派发链和UI优先级；`port-action-ui-contact-fixed.log` EXIT=0，三个套件13测试，typecheck EXIT=0。`port-test-input-unmin-build.log` EXIT=0，只刷新本轮unmin/bootstrap；min/d.ts/npm与最终公共候选仍须统一构建，不继承旧installed证据。

`air-test-input-s6-per-contact.json/.log` EXIT=0：三浏览器真实UITransform节点部分吞噬、合成键repeat、两个触点独立end/cancel、无帧输入派发、单次AFTER_DRAW与组件update、balanced dispose、终态拒绝；另用可信协议键盘/touch tap对照同一PAL/UI链。合成输入isTrusted=false、method=SYNTHETIC；物理焦点准入会被合成注入绕过，不用于证明真实设备/OS后台行为，PG-10/28完整范围仍开放。手册/索引/工具说明已接入，`port-test-input-doc-refs.log` EXIT=0无新增断链。

### S6 Atlas公共导出与安装包（Lead统一集成与执行，Orca实现终态待补）

当前Atlas五项libGDX兼容、重复页订阅及factory顶边Y修复均已落在Orca边界文件。Lead `port-atlas-six-review-current.log` EXIT=0，6回归；`air-atlas-s6-top-origin.json/.log` EXIT=0，三浏览器旧/新格式、顶边非对称四角、90度旋转、orig/offset留白、多页全部动画索引、在用拒绝与正常异步释放通过；Lead查看WebKit截图。此报告为源码bridge审查时点，随后统一公开parseAtlasText/createAtlasSpriteFrame/createAtlasHandle/loadAtlas，不当作公共包证据。

`port-atlas-action-build-all.log` EXIT=0，刷新unmin/min/d.ts/bootstrap/npm，包含本轮逐触点动作修复。`port-atlas-action-installed-types.log` EXIT=0，真实安装消费者601导出与TS4.9 node16、经典解析、TS7.0.2 native DOM通过，新Atlas类型正例及Texture2D/SpriteFrame类型负例通过（经典解析沿用其既有范围）。`air-atlas-s6-installed-path-pixels.json/.log` EXIT=0，三浏览器实际tarball离线安装后esbuild分块、图集加载/像素/引用回收通过；记录包sha256与四个分块身份，所有引擎请求均为/installed，无/build替代。Lead查看安装包WebKit截图。首轮`-installed-pixels.json/.log` EXIT=1为route glob匹配到HTML query中的runtime.js，改按URL.pathname识别后补偿，保留失败。GPU分配量unavailable，全部报告subset=true/completed=false。PG-01整项状态等Orca当前执行终态与文档同步后更新，不能用Lead结果冒充Worker报告。

逐触点修复的既有全scope回归：`air-action-s6-per-contact-regression.json/.log` EXIT=0，三浏览器×native/dom×默认/自定义canvas的12用例/156检查通过。新报告改为subset=true/completed=false/scopePassed=true，早期subset同时completed=true的报告保持历史原样。`port-atlas-action-public-typecheck.log`及`-public-doc-refs.log`均EXIT=0；本批没有提交、推送或发布。

### S6 共享Canvas行序与原生UV（Lead独立执行）

`air-texture-s6-uv-basis.json/.log` EXIT=0，三浏览器共24个真实渲染观测：Sprite视觉顶边v=0，Canvas与顶优先uploadData均朝上；旋转+90X的原生plane视觉顶边v=1，同一纹理上下相反，copyCanvasRows翻行后才朝上。保留原DOM纹理并在原始/翻行字节上传后重新绘制，结果未变，不存在本轮观测到的全局上传翻转污染。3D颜色经原生色调映射为229，按通道阈值判四角而非冒认255。Lead查看WebKit截图。四个小游戏实际使用该plane姿态，因此helper翻行行为保持，仅纠正它把底优先错误归因于uploadData的注释；此结果补充Worker早期仅Sprite方向推论，不能用它宣称通用上传必须翻行。新探针为独立Root边界，不改Worker纹理文件；PG-24仍待其3D/glTF当前执行终态。

注释纠正后的当前合同重采`air-texture-s6-uv-contract.json/.log` EXIT=0，三浏览器全部通过；`port-texture-uv-doc-refs.log` EXIT=0，`git diff --check`无错误。未改变helper字节算法或引擎上传实现。

### S9 稳定性、组合输入、glTF取消与证据工具接线（Lead实现和执行，非委派）

`air-lifecycle-s9-short.json/.log` EXIT=0，仅2000ms工具流程，不冒充长跑。真实TS4.9夹具检查`port-lifecycle-s9-types.log` EXIT=0。`air-lifecycle-s9-ten-minute.json/.log` EXIT=0，三浏览器各5种未run/paused/lost/restored/timeout与600000ms长跑、20次期间释放；实际经过Chromium600131ms/Firefox600655ms/WebKit600150ms，观察到35651/35721/35689帧和同数业务update。每次共享Texture refs2→1、私有场景/node/mesh/material失效、session监听不再触发、重复释放共享Promise、pending空；最终共享refs0。真实context lost后无新增业务帧或GL draw，release不restore。故意悬挂cleanup约5.13秒诚实failed/pending，后续run稳定拒绝。JS heap仅Chromium可读，Firefox/WebKit和完整GPU量均unavailable；三进程并发帧数不是独立性能benchmark。PG-30仍等待最终共同产物/安装包对应验证。

`air-mixed-s9-initial.log` EXIT=1为Playwright便利newPage无法再开同context标签，终止残留自有执行后改为显式context；`-context.log` EXIT=1包含custom canvas在eager import后改身份的夹具超时。HTML在module导入前预绑定custom canvas，未改引擎或默认入口；`air-mixed-s9-prebound.json/.log` EXIT=0，三浏览器×两后端×两canvas，共12组合序列。可信keyboard/mouse与显式合成11/12触点共存、UI吞噬分支、取消/leave不清peer、HUD/editable、100repeat单press、100reset/generation及release终态通过。actual标签切换均未产生document.hidden，逐项NOT_RUN；合成blur/hidden回归保持SYNTHETIC，不冒充后台设备。类型初轮reset参数string被拒后显式AirActionResetReason，`port-inputs-gltf-s9-types.log` EXIT=0。PG-10收现有通道明确范围；PG-28后台和最终安装消费继续待验。

`air-gltf-cancel-s9-initial.json/.log` EXIT=0，三浏览器真实延迟HTTP：公开parseAsync子请求带signal，已abort无请求、在途abort实际关闭HTTP而独立peer完整交付并destroy；loadAsync顶层downloader不带signal，容器下载实际finish后解析拒绝。旧未公开GLTFContext不是当前loader链，不能以其fetch推断公开子请求。十类NP的exported/bundled/configured/verified与未测表见runtime-capability-layers；原生post仍可装配/效果未证实，不用替身或旧报告升级。

接入`verify:port-candidate`、`verify:port-evidence`、`verify:port-env`，AGENTS同步40 scripts的参数/读写行为。首次PowerShell npm包装吞掉后续flags，`port-evidence-s9-script-selftest.log` EXIT=2；显式npm.cmd传参后`-script-selftest-forwarded.log` EXIT=0，13/13。`port-env-s9-current-forwarded.log` EXIT=0写新时点预检，Playwright模块AVAILABLE/浏览器缓存PRESENT/预检启动NOT_RUN；实际启动证据来自上述browser collector，历史预检不覆写。当前仍未提交或发布。

### S9 相机过滤与只读可见性诊断（Lead实现和执行，非委派）

新增可选`tools/debug/render-visibility.ts`，接入AgentSession节点layer与visual.mesh.visibility。读取当前原生model/bounds/frustum，不触发更新/绘制、不创建材质实例、不改引用；正确保留Node.layer全部包含与model.visFlags交集的OR语义。最多80个相机并披露截断，未绑定/无检测如实返回未知，不把正常剔除记为引擎错误，也不以过滤通过推断draw或GPU量。

`port-visibility-s9-native.log`及`-normalized-native.log` EXIT=1：HEADLESS不会执行正常渲染相机更新，测试错误使用未准备的缓存视锥。测试显式调用原生updateWorldBound/Camera.resize/update准备缓存，观察器仍只读；同时兼容原生检测的boolean/number返回。`port-visibility-s9-prepared-headless.log` EXIT=0，2套26测试含既有24 AgentSession回归。实际TS4.9检查初轮`-tool-types.log` EXIT=2为quad选项未完整声明，补includeNormal/includeUV后`-tool-types-fixed.log` EXIT=0，覆盖工具、session与夹具。

`air-visibility-s9-typed.json/.log` EXIT=0：S8独立源码bundle，三浏览器各8种default/掩码0/错误layer/model标签OR/视锥外/相机禁用/renderer禁用/恢复，实际红色像素与原因对应；重复观察模型/引用不变，清理released且自有资源失效。先前`-initial`和`-normalized`通过的范围相同，最终以补完整类型选项后的`-typed`指纹为准；Lead查看WebKit实际红色方形截图。subset=true/completed=false、GPU量unavailable。PG-18按以上明确范围收口，最终共同候选与正式EG仍待汇总。

### S8 蒙皮容量、公开模式、活动赋值与真实变换（Lead实现和执行，非委派）

本批保留默认build，使用显式`AIR_OUT_DIR=output/playwright/skinning-s8-build`独立构建当前源码，避免覆写Orca Worker正在使用的候选；报告均记录实际加载路径/源/bundle/fixture/runner指纹，`subset=true/completed=false`。默认unmin/min/d.ts/npm及最终共同候选仍须统一刷新，不能把本批隔离候选当作最终发布包。

三个确认问题及补偿：①`port-skinning-s8-capacity-repro.log` EXIT=1，超出256槽没有拒绝；首个HEADLESS容量断言还暴露虚拟设备uniform限制为负，随后原生测试显式配置真实UBO布局30，浏览器继续记录真实设备值，不冒称测量。`air-skinning-s8-capacity-repro.json/.log` EXIT=1，三浏览器加权joint256进入256槽纹理后零像素且无诊断。现于替换绑定前验证实际加权全局/局部slot，稳定AIR_E_SKINNING_CAPACITY，300骨架局部[299]与合法未使用尾部仍可绘制。②`port-skinning-s8-mode-switch-repro.log` EXIT=1，先烘焙再实时的曲线未创建求值器；`air-skinning-s8-transforms-initial.json/.log` EXIT=1，三浏览器公开偏好已变但GPU仍在初始骨姿态。SkeletalAnimationState补清_doNotCreateEval，未新增模式API。③`port-skinning-s8-live-native-repro.log` EXIT=1，6种活动赋值顺序中2种空_bufferIndices；`air-skinning-s8-live-assignment-review.json/.log` EXIT=1，真实浏览器同异常。SkinnedMeshRenderer让不完整绑定保持不可绘制，完成/替换绑定验证后刷新原生submodels/descriptors/macros并重新attach。原有自动动画关联保留。抽取件新增两项差异，modifiedCount=106，UPSTREAM同步。

容量中间记录`air-skinning-s8-capacity-guard` EXIT=1因onLoad捕获异常，工具错误期待app.run同步抛出；改为验证原生明确诊断/无截断buffer分配并保留直接bind抛错测试。`-active-capacity-guard` EXIT=1暴露活动赋值描述符问题，随后纳入③真实复现与修复，未被删去。`-capacity-diagnostics`及后续`-final-capacity`曾通过原激活前范围。最终`air-skinning-s8-live-capacity-closed.json/.log` EXIT=0，三浏览器各6个活动赋值容量观测，包括合法最后uniform槽、真实RGBA32F texture、300关节局部palette/未使用尾部与明确越界拒绝。RGBA8设备分支未强行模拟，GPU量unavailable。

`air-skinning-s8-live-binding-repaired.json/.log` EXIT=0，三浏览器各20个实时/烘焙TRS与逆绑定刚性GPU参考（含root/ancestor非均匀缩放、反射、SMR局部TRS不覆盖根、BACK镜像剔除、builtin-standard逆转置法线光照）、2个真实clip首帧/定位/pause/resume/公开偏好往返、96个激活前后赋值/启用/动画组合，以及一次活动uniform→texture→uniform重绑定。每次私有资源最终失效，原生错误为空；Lead查看WebKit红色镜像三角形截图。先前`-clip-mode-repaired`、`-public-lifecycle`、`-final-contract`通过的是较小范围，不替换本终态。单关节归一化float配方不认证多关节混合后非均匀骨缩放法线或全部shader。

新增可选`tools/debug/skinning-inspector.ts`接入AgentSession.inspectNode.visual.mesh.skinning：请求/有效模式、合法实时自动传输、实际加权绑定数、设备uniform向量、实际palette容量/格式、根与bounds/反射；未知项null/NOT_READY，最多80个palette并披露截断，不写日志/订阅/渲染、不创建MaterialInstance或改变引用。`port-skinning-s8-repairs-native.log` EXIT=0，5套73测试（含既有11缓存）；`port-skinning-s8-live-repaired-native.log` EXIT=0，5套68测试（新增6活动赋值及相关修复）；`port-skinning-s8-final-inspector.log` EXIT=0，3套29测试含既有24 AgentSession回归。真实TS4.9 fixture/工具检查`-live-fixture-types.log` EXIT=0；源码typecheck`-live-final-typecheck.log` EXIT=0；`-live-file-map.log` EXIT=0，rows1322/modified106。PG-19/20/22按上列范围收口并等待共同候选重采；PG-18仍欠camera层/剔除观察，整体任务与外部AG不标完成。

### S7 Effect布局与原生材质（Lead执行，非委派）

新增可选只读`tools/debug/effect-layout.ts`，克隆并检查无条件vec4/mat4 UBO及sampler2D的set/binding、stage/type/count、成员顺序、GLSL4/反射和pass-program；自动槽位避让UBO/显式sampler。稳定AIR_E_EFFECT_LAYOUT带shader/resource/stage/rule；条件资源/其他格式明确UNSUPPORTED，不改变原生EffectAsset默认入口，不新增默认runtime导出或通用GLSL编译器。

`port-effect-layout-final-native.log` EXIT=0，3套18测试（8布局、8既有生成器、2启动合同）；`port-effect-layout-final-types.log` EXIT=0，真实TS4.9/DOM工具编译。首轮原生测试`-preflight-native.log` EXIT=1为测试错误要求规范化输出不增加默认set=1，输入不变断言仍保留；修正后`-preflight-validated.log`通过。

`air-effect-s7-dual-sampler.json/.log` EXIT=1：0.5通道量化127被误要求128，且真实SMR自动创建MaterialInstance，原共享Material更新不能修改实例。按原生getMaterialInstance接线、半通道允许127/128后，`-material-instance.json/.log`仍EXIT=1，因为错误Shader尚未进入实际绘制。`-render-negative.json/.log`正确捕获编译/链接，但释放后用已销毁Effect的清空name查询注册表误报；缓存原name后`-live-material-diagnostics.json/.log` EXIT=0。源码中提前删除pass.shader不是负控触发的关键原因，本批真正依赖进入绘制，未修引擎。

扩展`air-effect-s7-preflight-macros.json/.log` EXIT=0、`-complete-layout.json/.log` EXIT=0：三浏览器dual sampler、顶点位移/片元变色UBO、MR/SMR两条effectName/effectAsset、现有builtin材质、自动/显式布局与重复/UBO冲突/GLSL不匹配/type/count/stage拒绝；顶点私有宏不跨阶段、Material声明宏两阶段合同实测。负控shader/link由现有AgentSession工具捕获，原生16323/16326关联program，正常纹理仍红；独占资产失效与Effect注销、共享builtin保留通过。SMR自定义shader不包含骨骼变形，GPU量unavailable，全部报告subset=true/completed=false；本轮没有引擎/bundle改动。最终加强program关联断言的当前报告见后续记录。

`air-effect-s7-program-correlated.json/.log` EXIT=0，三浏览器当前program关联断言通过；Lead查看WebKit截图。`port-effect-layout-doc-refs.log` EXIT=0，140文档/1148引用无新断链，`git diff --check`无错误。PG-23按受限生成器/显式预检和原生两条材质路径收口，外部matcap端口材料仍属AG缺口，不确认其具体根因。

### S7 场景切换、页面导航与100次真实渲染（Lead执行）

`air-scene-s7-owned-cycles.json/.log` EXIT=0，三浏览器各100次真实WebGL2绘制后释放，不是HEADLESS或节点计数替代：每次center像素红、私有节点/Mesh/Material失效、共享Texture引用2→1且外部仍有效、token失效、旧业务DOM监听/timer不再运行、release共享在途Promise、getScene为空；持久节点100次保态/脱离并最终撤销销毁。另验直接run销毁旧节点而手工资产/未登记全局订阅仍保留，同Scenerun空操作，scope有owner时拒绝直接替换，SceneStack隐藏/返回/LRU与真实page.reload。game.run共一次，103个Tracked组件精确销毁。缺少bundle登记的loadScene返回false并记录1209，不改默认引擎。

增补reload后夹具自身的所有资产/持久节点显式close清理后，当前`air-scene-s7-reload-owned.json/.log` EXIT=0三浏览器通过；两轮首次实际GPU缓冲像素耗时0.50–0.73秒，各import/init/buildDraw阶段独立记录，未拿ready字段或固定睡眠冒充启动。新增场景切换比较/推荐手册及索引，`port-scene-switch-doc-refs.log` EXIT=0，141文档/1151引用无新断链；git diff --check通过。PG-13按Code First评估范围收口，PG-30仍待context lost与10分钟稳定性以及最终冻结候选重采；GPU分配量unavailable，不能声称零泄漏。没有外部Creator SceneAsset正例，不制造loadScene成功证据。

## 验证纪律

初步验证（均不代表整项完成）：

- `node tools/verify/air-signature-usage.test.cjs` EXIT=0：JS/TS真实类型正负例，三种语义误用、primitive参数、非原生同名对象与缺失路径；PG-31的descriptor和npm消费者仍未实施。
- `npm test -- --runInBand test/smoke/competitive-bootstrap-contract.test.ts` EXIT=0：实际输出1套件/2测试通过。npm11没有透传runInBand（输出已有warning），该次只匹配一个套件；后续需要serial时直接调用Jest CLI。测试证明早期Effect注册/材质时序及默认camera mask，未验证GPU。
- `npm run verify:doc-refs` EXIT=0：122份文档/1033个引用，无新增断链或过期baseline。此后有新文档改动时须更新该scope检查。
- Worker环境预检发现Playwright模块不可解析，浏览器缓存存在。Lead在 `output/playwright/tooling/` 安装独立 `playwright@1.63.0`，未改项目package.json/lockfile。三浏览器输入探针已启动，尚待终态结果；不计PASS。

### S1 浏览器终态（Lead执行，非委派）

`NODE_PATH=output/playwright/tooling/node_modules` 下执行 `node tools/verify/air-input-browser.cjs --browser=all --out=output/playwright/air-input-s1-matched.json`，EXIT=0，6个场景/42条检查通过，completed=true、subset=true。报告与原始日志分别为 `output/playwright/air-input-s1-matched.json` / `.log`，六张截图位于 `output/playwright/air-input-s1-matched-artifacts/`；Lead实际查看了webkit-custom.png，确认文本输入与无可渲染区域的页面结果。报告存已加载bundle和探针/工具源码SHA256，前后无漂移；当前尚未转换为PG-34正式schema，不认定完整EG2/AIG完成。

首轮 `air-input-s1-initial.json` / `.log` EXIT=1：Chromium/Firefox的4个场景已通过，WebKit协议报 `Unknown setting: PushAPIEnabled`。根因是新Playwright使用旧webkit-2311；结束该不匹配browser进程并安装模块要求的webkit-2359后重跑全scope，不删旧失败。运行器新增匹配WebKit检查，避免再静默回落到不匹配revision。

协议mouse/keyboard与isTrusted touch是浏览器通道实测，不等于实体触摸设备。PG-10仍需混合设备、leave/cancel序列，故保持NOT_RUN（已有部分PASS记录）；PG-28生产reducer/session尚待集成验收。输出目录中的临时tooling不进npm包或Git。S0预检文件描述的是安装前时点，不能代替当前环境状态。

### S0工具审查与S2定向验证（Lead执行）

候选快照原实现遗漏未跟踪源码及被Git忽略的npm/decoder输出。Lead补入实际遍历、变体AIR_OUT_DIR、debug/dev运行器，并加真实临时Git回归；`port-evidence-tooling-review-initial.log` EXIT=0，26测试。此修复前的全局快照覆盖不完整，早期浏览器报告的独立bundle/目标源码指纹仍可定位其限定行为；最终候选须重新冻结，不沿用早期身份作为完整证据。

- `port-skinning-boundaries-fixed.log` EXIT=0：3套件/61测试，含48种赋值/启用/关联/模式排列、实时/烘焙weighted path拒绝前保留有效绑定、reset与bindpose缓存、原生诊断通道。`port-skinning-boundaries-typecheck.log`和`port-skinning-boundaries-file-map.log`均EXIT=0。
- `port-skinning-malformed-fixed.log` EXIT=0：11测试，增补非有限/负weight、使用与未使用bindpose、缺失weight attribute和结构化资源上下文。
- 原始失败保留：`port-skinning-repro-initial.log`（缓存/索引负例6失败）、`port-skinning-path-repro-initial.log`（缺失weighted path失败），修复后由上述原生回归补偿。
- `air-diagnostics-s2-initial.json/.log` EXIT=0：三浏览器×errors/warnings共6用例，合法属性无诊断，未知属性原生console与工具通道符合合同，重复计数与工具关闭后通道可用。未覆盖全部PG-18。
- `port-s2-skinning-build.log` EXIT=0：重建unmin包含本批修复；min/d.ts/npm未刷新，不称同批完整候选。
- `air-skinning-s2-states.json/.log` EXIT=0：三浏览器×实时/烘焙×9变换/姿态共54GPU用例。`dt=0`暂停首渲染可见，当前Bone平移影响首帧，SMR局部TRS保持根空间，root/ancestor缩放改变有限world bounds与非对称像素。Lead查看负缩放截图。尚未覆盖动画clip、法线照明、关节容量和完整排列GPU。

镜像探针首轮 `air-skinning-s2-initial.json` 与观察轮 `air-skinning-s2-observe.json` EXIT=1：夹具对共享Material调用只支持MaterialInstance的overridePipelineStates，实际仍BACK剔除负缩放面。属于夹具使用错误，早期报告stage=engine过宽；修正为initialize.states后全scope重跑通过，保留原始失败。测试夹具后续变动使契约摘要变化，最终整合仍须重采。

`port-skinning-mutations-fixed.log` EXIT=0，52个原生生命周期用例通过，新增dynamic positions/joints/weights与hash变更、merge后实际几何bounds重算。首轮 `port-skinning-mutations-headless.log` EXIT=1 是夹具把原生 `utils.MeshUtils.createDynamicMesh` 写成不存在的 `utils.createDynamicMesh`；按真实导出修正后补偿。缓存边界和显式重绑定限制已写入[蒙皮手册](../../docs/manual/skinning-code-first.md)。

后续记录命令、退出码、候选身份、真实scope、skip和原始输出路径；工具schema通过不等于对应EG通过。dirty工作区不满足release门禁，不为此自动提交或放宽门禁。

### S3 安全启动、场景释放与安装包（Lead执行，非委派）

实现 engine-free `cocosair.js/bootstrap`、归一化单例合同、首次导入前 DPR/canvas 设置、session 代次与有界清理、`releaseScene`/`close`。原生 Director 保留 persistent nodes，ReleaseManager 在暂停时排空释放队列，并修复多个无 UUID 的 Code First Asset 在队列中互相覆盖的问题。同步回调的阻塞不能被 deadline 抢占；超时/异常回执标记失败，不能声称完整清理。

- `port-s3-lifecycle-headless-combined.log` EXIT=0：5套件/45测试，覆盖配置/单例、session、100次原生释放循环与证据工具。100次 headless 不等于100次GPU循环。
- `port-action-scope-integration.log` EXIT=0：2套件/4测试，生产动作适配器连接真实session scope后，deactivate立即清held、activate重新接收、dispose取消订阅。尚未完成动作三浏览器验收。
- `port-s3-final-typecheck.log`、`port-s3-final-file-map.log`、`port-s3-doc-refs.log` EXIT=0。后续改动仍需对应范围复查。
- `port-s3-build-all-scope-notification.log` EXIT=0：unmin/min/d.ts/npm全部刷新；之后修正安全入口的字面量动态导入并单独重建 bootstrap 和 npm 副本。
- `air-bootstrap-s3-error-codes.json/.log` EXIT=0：12用例，三浏览器×unmin/min/npm-copy及初始化失败。scope限定安全启动/DPR/暂停释放；本次夹具和入口后续更新，最终候选须重采。
- `port-s3-bundled-consumer-routing.json/.log` EXIT=0：实际打包、临时npm安装、Node无DOM安全导入、585导出、消费者类型与esbuild分块，以及三浏览器实际安装包启动/像素/释放/关闭。报告记录tarball、夹具与分块SHA256；请求检查排除工作区 `/build/` 引擎替代。仍非PG-34正式schema或完整release门禁。

原始失败均保留：`safe-bootstrap-headless-initial`（非法诊断选项验证顺序）、`lifecycle-typecheck-initial`（ES2017没有Promise.finally）、`scene-release-headless-initial`（persistent节点脱离时被注销）、`scene-release-headless-fixed`（无UUID资产释放队列覆盖）、`air-bootstrap-s3-initial`（夹具销毁component后读取mesh）、`air-bootstrap-s3-captured-assets`（错误应检查code字段）、`port-s3-consumer-bundler-repro`（变量动态导入不可解析）。安装包浏览器工具的 `port-s3-bundled-consumer` / `-fixed` 为entryPoint识别错误，`-entry`为route glob误匹配文档query；修复工具后由 `-routing` 全三浏览器补偿。

PG-29/30/35仍按完整原计划保持NOT_RUN：剩余坐标输入、context loss、100次GPU循环和10分钟稳定性等；PG-34外部端口/Spine2.1/30旧消费者材料尚未收到。Spine/UI mesh/Billboard分支备忘录见 `docs/notes/port-spine-and-billboard-decisions.md`，未把建议当作用户批准。

更新夹具与字面量导入后的 `air-bootstrap-s3-literal-import.json/.log` EXIT=0，12用例全通过；当前对应限定入口/DPR/释放证据。`port-s3-consumer-doc-refs.log`、`port-s3-consumer-typecheck.log` EXIT=0。Lead实际查看安装包bundler的WebKit截图，蓝背景红色立方体可见；仍未宣称整个35项完成。

### S4 音频接口（Lead执行，进行中）

新增 `AudioService.stopBgm()`（停止/seek零，保留当前ID）、`setBgmVolume()`、`bgmVolume` 与 `bgmState().volume`，所有现有和后续BGM源统一音量；非法有限性/范围抛 `AIR_E_AUDIO_VOLUME`，不变更SFX或原有pause续播合同。音频手册明确节点命名非契约、浏览器异步操作和用户手势限制。

`port-audio-headless.log` EXIT=0，1个原生验证测试；`port-audio-build.log`、`port-audio-typecheck.log`、`port-audio-doc-refs.log` EXIT=0。本批仅重建unmin，min/d.ts/npm待后续统一刷新，不称完整候选。

浏览器 `air-audio-service-s4-canvas.json/.log` 中Chromium/Firefox通过全部时钟断言，WebKit续播等待超时，EXIT=1；`-gesture` 与 `-pal-gesture` 也EXIT=1。首轮 `-initial.log` 因夹具缺少必填createAirApp参数失败，且执行期间注释变更触发指纹漂移，未产生正式报告；日志均保留。

`port-audio-webkit-media-trace.log` 证明DOM媒体尚未playing时可读到等于曲长的currentTime，早期探针过早pause并等待超过曲长的绝对时间。修正为有界真实手势+playing前提下两次连续时钟采样；`air-audio-service-s4-measured-clock.json/.log` EXIT=0，三浏览器全通过，不改PAL。WebKit初始与换曲各实际需要14次间隔600ms手势才覆盖异步8秒加载和PAL pending unlock；Chromium/Firefox一次。报告如实保留次数，不承诺单次手势即时加载。确认pause位置不变、resume推进、stop归零且停止、resume从零推进，现有及新BGM音量设定、非法值拒绝及dispose空状态。首次时钟、停止与重启均非仅playing断言。

### S3 动作集成审查与浏览器（Lead执行）

公开导出`createActionState`/`createActionInput`；调用方显式接线，不自动添加默认动作监听。Lead修复调用方source/pattern后续变更污染内部identity/待消费edge的问题，内部持有冻结拷贝。检查器的force、clear和开关不能越过2Hz，容量保持80且返回深冻结快照。

`port-action-keyup-owned-headless.log` EXIT=0，7套件/59测试（含scope与检查器）。`port-action-keyup-map-typecheck.log`、`port-action-native-file-map.log` EXIT=0；`port-action-audio-build-all.log` EXIT=0生成全部产物，之后释放修复仅刷新unmin，最终还要统一min/d.ts/npm。

`air-action-input-s3-initial.json/.log` EXIT=1：六个native场景在编辑控件内keyup后残留held，另Firefox dom离窗操作残留pointer。使用PAL同一物理键码表做native window释放清理、原生mouse-leave/DOM pointerleave释放鼠标source；InputEventMap补已有enter/leave事件的类型，没有改PAL或重建按下通道。`-owned-release.json/.log` 修复了编辑keyup但Firefox越出viewport仍失败：协议越出窗口没有证明真实OS leave。把canvas缩小并在document内明确移出canvas后，`air-action-input-s3-canvas-leave.json/.log` EXIT=0，三浏览器×两后端×两canvas共12用例/156检查通过；此scope是真实canvas leave及outside-canvas release，不声称物理窗口leave已测。

Orca Worker资产加载模块已出现在工作区，尚无该通道终态报告；Lead审查发现旧在途回调删除新请求、同步/重入结算以及原生URL缓存跨ext复用风险，将发具体补测要求，不先把模块记PASS。

Lead新增 `port-gap-asset-bank-races.test.ts`；`port-asset-bank-races-confirmed.log` EXIT=1，4个真实失败：旧回调使新inFlight计数变0；完成进度中的releaseAll与abort仍resolved并留幽灵owner；真实loadRemote/factory在缓存JsonAsset时对ext=txt返回JsonAsset。仅网络transfer受控，最后一项保留原生loadRemote/缓存实现。较早 `-initial` / `-native-cache` 日志含夹具default/named导入误用，按源文件真实导出修正后由 `-confirmed` 复现四项逻辑失败；不删原始输出。

### S4 Tiled 与 primitive（Lead执行）

`getRawObjects()`/`getObjectsByType()` 与 `className` 保留原生几何枚举；原始几何冻结，重复初始化不累积投影/点翻转。三份抽取件已登记，modifiedCount=100。`port-tiled-headless-sorted.log` EXIT=0，4测试；初轮测试错误依赖数组顺序，改为按名称查询，保留失败日志。`port-tiled-build.log`、`port-tiled-file-map.log`、`port-tiled-doc-refs.log` EXIT=0。

`air-tiled-s4-initial.json/.log` EXIT=0：三浏览器对照实际XML原始/换算坐标及类型，完整执行现有tiledmap-basic P1–P8合同并观测动画截图变化；未覆盖其他Gallery项目，completed=false、scopePassed=true。Lead查看WebKit实际截图。随后只更新示例旧注释；最终候选仍须重采。

新增具名 `createPrimitiveGeometry` 四种图元薄转发，尺寸/段数/arc验证与预算边界公开。`port-descriptor-headless-source.log` EXIT=0，22测试；初轮夹具误用原生名字primitive（应为primitives），失败日志保留。独立安装消费者尚待验收。`port-descriptor-typecheck.log` EXIT=0。

AssetBank第一个修复版本通过24测试（`port-bank-lead-race-review.log`），但Lead新增真实缓存所有权与缓存进度重入回归后，`port-bank-native-ownership-repro.log` EXIT=1，4失败/4通过：原生loadRemote的缓存回调不转移临时引用，不能无来源decRef；缓存完成进度自abort/releaseAll仍resolved。交给Orca Worker继续修复，不计PG-06/32完成。

### S4 声明消费与文档（Lead执行）

`port-s4-types-build-all.log` EXIT=0，unmin/min/d.ts/npm刷新。旧TS包装由build:dts生成并由版本条件/typeVersions选择；TS5+主入口不载入旧DOM补充。`port-s4-consumer-types-initial.log`和`port-s4-consumer-geometry-types.log` EXIT=0：真实npm打包/临时安装，592导出、四类描述geometry与包内原生输出对照、TS4.9.5 node16/经典Node解析和TS7.0.2同消费者通过。较新编译器实际文件清单包含主SDK/lib.dom且不含legacy包装；保留既有skipLibCheck合同，不声称全SDK严格声明无诊断。TS7.0.2独立安装在output/playwright/type-tooling，不改项目依赖/lockfile。

PG-16手册对照当前Tiled assembler/layer讲清裁剪触发和更新标记、相机更换、静态改图限制。`port-s4-manual-doc-refs.log` EXIT=0，132文档/1070引用无新断链。PG-17/31和PG-16按限定完成判据记PASS，最终同候选聚合仍后置。

### S4 BMFont 与首次session（Lead执行）

新增parseFnt/createBitmapFont/loadBitmapFont：未packed的单页BMP字符文本，加载器PNG页面；完整页面SpriteFrame原生装配、字体onLoaded、冻结字形/偶距、绝对/文档/显式页面基址与失败释放。handle持有自身font/frame/texture，额外font引用时拒绝dispose，UI使用者先解绑。范围和错误码见bitmap-font-loading手册。

`port-bmfont-headless-initial.log` EXIT=0，14测试；`port-bmfont-kerning-shadow.log` EXIT=0，BMFont17+既有TTF shadow4=21测试。`port-bmfont-typecheck-final.log`、`port-bmfont-file-map.log`、`port-bmfont-doc-refs.log` EXIT=0。kerning差异正确登记text-processing.ts原有modified行，保留其shadow理由，modifiedCount仍100。

`air-bmfont-s4-initial.json/.log` EXIT=1：夹具把font清理登记在首次run前，旧app会退役初始化scope，字体被清空。改登记时点后的`-scope.json/.log` EXIT=1真实复现三浏览器双字符AV最后偶距被原生算法置零，像素间距与无偶距完全相同。修复最后字符incoming kerning后，`air-bmfont-s4-kerning.json/.log` EXIT=0：三浏览器真实font/PNG请求、原生Label、0.8/1/1.2像素尺寸、两字符缩距、解除Label与handle/bank释放。Lead查看WebKit截图。报告subset且completed=false；不等于发布/全部字体范围。

进一步用`port-first-session-ownership-repro.log` EXIT=1确认首次run丢弃prepared scope。app修复为首场景接管初始scope，后续才新建；`port-first-session-ownership-fixed.log` EXIT=0，3套件8测试（包括既有100次原生释放与action/session）。字体夹具重新改为首次run前登记，将重建并重采验证。旧scope协议失败并非BMFont解析错误，原始日志保留。

首次session修复后的`air-bmfont-s4-prepared-session.json/.log` EXIT=0，三浏览器全部通过；`port-bmfont-session-build-all.log` EXIT=0刷新全产物，`port-bmfont-installed-types.log` EXIT=0，实际安装包595导出和TS4.9/7.0.2字体类型通过。`port-first-session-typecheck.log`、`port-bmfont-session-doc-refs.log` EXIT=0。Lead新增的8项bank竞态回归在`port-bank-latest-ownership-review.log`全部通过；仍待Orca Worker本批正式终态及其完整原生suite，不把Lead回归当作Worker执行证明。

当时Spine2.1、UI-mesh与Billboard三项分支问题尚无用户答案；2026-10-04用户已回答，决议以owner第13节为准。PG-01图集独立推进。

### S5 UI-mesh与原生Billboard（Lead执行，非委派）

用户选择的三个范围已写入owner第13节、计划入口及备忘录。PG-04按明确“不支持Spine2.1”的范围决议收口，不生成播放成功证据；图集、字体和通用UI-mesh继续实施。

新增AirUIMesh原生UIRenderer/assembler，使用默认UI材质、动态图集、原生静态VB/IB、Mask与兄弟排序。几何先校验再冻结拷贝；1024顶点/1365三角形上限，帧内UV、独立帧/原始页/打包纹理引用和幂等dispose公开。`port-ui-mesh-headless-atlas.log` EXIT=0，11测试；`port-ui-mesh-billboard-typecheck.log` EXIT=0。

首轮`air-ui-mesh-s5-initial.json/.log` EXIT=1，实际三角形像素缺失：Sprite打包共享帧后组件仍读旧UV。组件接入同一动态图集流程并保留原始页后，`air-ui-mesh-s5-packed-frame.json/.log` EXIT=0；扩展`air-ui-mesh-s5-rotated-batching.json/.log` EXIT=0，三浏览器几何变更/重新启用、Sprite前后混排、Mask、父透明度、四彩图案旋转UV对照原生Sprite和实际15索引合批通过。Lead查看WebKit截图。自定义材质增补轮见后续记录。

Billboard直接导出源文件，source map中3D particle目录仅billboard.ts，没有particle-system/renderer/animator闭包。`port-billboard-small-closure.log` EXIT=0。初轮采证与构建重叠，候选漂移，`air-billboard-s5-initial.log` EXIT=1且不采信；稳定候选`air-billboard-s5-stable.json/.log` EXIT=1真实复现释放后独占Mesh/Material仍有效。补onDestroy清理及Root模型池回收，上游登记modifiedCount=101；`port-billboard-file-map.log` EXIT=0。`air-billboard-s5-cleanup.json/.log` EXIT=0后三浏览器像素/释放通过。

`air-billboard-s5-lifecycle.json/.log` EXIT=1为新增夹具错误：尺寸缩放应比较原轴半倍/两倍，不能把颜色阈值下两轴extent简单互换。修正后`air-billboard-s5-dimensions.json/.log` EXIT=0，三浏览器三个相机角度、中心旋转、宽高变更、停用/启用、technique截断与释放全部通过。独占Mesh/Material失效，共享输入Texture保持有效；GPU内存量仍unavailable。Lead查看WebKit截图。

`port-ui-mesh-billboard-build-all.log` EXIT=0，unmin/min/d.ts/npm同步刷新；`port-ui-mesh-billboard-installed-types.log` EXIT=0，实际npm安装597导出，Billboard/AirUIMesh公共运行入口与TS4.9/7.0.2消费通过。`port-ui-mesh-billboard-doc-refs.log` EXIT=0，136文档/1084引用；本轮未新增npm script。所有浏览器报告subset=true/completed=false，限定PG范围PASS不等于全计划、正式EG聚合或发布就绪。

`air-ui-mesh-s5-material.json/.log` EXIT=1：自定义UI材质和颜色脏标记像素正确，但夹具session清理回调在组件被原生销毁后仍赋材质，回执诚实报告failed。回调改为isValid检查后，`air-ui-mesh-s5-owned-material.json/.log` EXIT=0：三浏览器×4模式全部通过，包括材质当前性、蓝色实际像素、旋转四象限与合批，释放回执released且共享帧/纹理引用回到1。`port-ui-mesh-billboard-final-doc-refs.log` EXIT=0。此批终态据此收PG-11/25的已选范围；PG-01/06仍待Orca Worker正式终态，整体任务继续。

### S5 设计视口、DPR与控制方向（Lead执行，非委派）

`air-design-s5-native.json/.log` EXIT=1复现原生EXACT_FIT非等比窗口左右裁切：设计978×846在360×780上投影X超出画布，像素与命中共同失败；小数DPR首帧缓冲又为1222×1057，与bootstrap四舍五入预期1223×1058不一致。新增原生Camera.orthoWidth半宽，0保留旧自动aspect，透视忽略；组件与渲染相机同步校验，初始化复位池化半宽。Canvas屏幕路径维护两个半轴，targetTexture仍自动aspect；PAL仅修改生成转换并--write/--check，冻结vendor不变。三个抽取件登记，modifiedCount=104。

`port-design-camera-live-invalid.log` EXIT=0，6原生测试：默认aspect、独立半宽、投影/逆投影、非法值保留组件/活动相机、透视忽略及复用initialize复位。首轮`port-design-camera-headless.log` EXIT=1是夹具误用不存在的Root.destroyCamera，修正为原生Camera.destroy后补偿。`port-design-typecheck.log`、`port-design-pal-check.log`、`port-design-file-map.log`均EXIT=0；`port-design-build-all.log` EXIT=0同步刷新unmin/min/d.ts/npm。

`air-design-s5-width-density.json/.log`和`air-design-s5-input-recorded.json/.log` EXIT=0：三浏览器×三档DPR×三窗口共27场景，完整四角GPU像素、原生projection/screenToWorld/hitTest/getUILocation、108次真实鼠标命中、小数cap取整和body/CSS不变。后者记录每次inputHits与空白中心不误命中。但Lead复核WebKit实际截图为空白，因此这些PASS严格限定GL缓冲/输入，不建立呈现截图PASS。

加严采集器后`air-design-s5-presented.json/.log`、`-presented-settled.json/.log`及`-single-capture-restored.json/.log`均EXIT=1，WebKit部分resize截图四角白色，Chromium/Firefox通过。每次截图由独立pngjs解码并断言实际呈现像素；500ms dt=0呈现等待不计为首帧证明，首帧GL取样单列。独立页面/单次截图减少但未消除WebKit失败，不能称已修复。纯WebGL2校准`port-webkit-resize-baseline.json/.log`（无AIR import）执行EXIT=0记录比较结果：Chromium/Firefox resize后截图绿色，WebKit白色。该校准退出0只代表采集成功，不是三浏览器gate PASS；跨帧readPixels已被非preserved buffer清空，不能据该项推断GPU当前颜色。当前证据支持环境呈现异常的推断，仍需解决或明确验证边界，PG-08/35保持NOT_RUN整体状态。

`port-design-installed-consumer.json/.log` EXIT=0：真实tarball临时安装、597导出、TS4.9经典/node16与TS7.0.2公共orthoWidth消费、esbuild分块；三浏览器安装包竖屏四角GL像素/投影/真实点击/清理通过，没有请求工作区/build引擎。加入实际截图断言后的`-installed-presented`、`-installed-presented-settled`、`-installed-single-capture`均EXIT=1，WebKit呈现同问题，不引用初轮PASS掩盖后续失败。独立工具目录补装pngjs曾移除未登记的Playwright，`port-screenshot-tooling-restored.log`恢复固定1.63.0+7.0.0，项目依赖/lockfile未改；`air-design-s5-single-capture.log`为MODULE_NOT_FOUND基础设施失败，已终止其残留自有server，后继-restored如实采集上述浏览器失败。

`air-basis-s5-projected.json/.log` EXIT=0：三浏览器×0/45/90相机yaw，world/vehicle/screen-forward/screen-right四方向各实际绘制，native basis与projection对应非对称3D像素；vehicle yaw90度、普通相机orthoWidth0。初轮`air-basis-s5-initial.json/.log` EXIT=1为探针把原生3D色调映射后的229误作255，按目标通道>180/其他<30且alpha255判断后通过。Lead查看WebKit控制方向截图与Chromium竖屏截图；WebKit单独竖屏呈现观察可正常显示，但不代替失败resize序列。

starter接978×846配置，`port-design-starter-browser-path-fixed.log` EXIT=0三浏览器验证design与蓝色GPU清屏；最初`port-design-starter-browser.log` EXIT=1为只读静态server不支持/starter别名，改/examples/starter/后通过。设计视口/控制方向手册、相机手册、safe启动交叉链接和manual目录已补。`port-design-final-doc-refs.log` EXIT=0，137文档/1104引用（后续台账引用变更需复查）。外部stage/uiToDesign回收仍未执行，正式EG聚合和最终候选重采继续后置。

### S6 AssetBank真实请求与图集审查（Lead验收；实现通道Orca Worker）

已收到Orca Worker的PG-06/32实施终态：AssetBank源码、ui-kit原名重导出、13原生/受控传输测试及手册；Worker报告组合92测试、typecheck/doc-refs通过。该报告的数量为它实际执行的scope，不拿Lead的8竞态测试冒充Worker执行。当前实现包含后续缓存所有权和进度重入修复，公共导出及真实安装包此前已通过；网络验收如下。

`air-bank-s6-network.json/.log` EXIT=1：三浏览器所有资产/传输/引用断言通过，只有WebKit将预期的CORS失败额外上报pageerror，采集器原零pageerror断言误拒。调整为仅匹配实际/cors-denied及/csp-denied的原生access-control错误，保留原始消息并继续拒绝其他pageerror；不修改bank或原生加载器。

`air-bank-s6-cors-csp.json/.log` EXIT=0，三浏览器全部通过：真实HTTP无后缀JSON/PNG、后缀JSON与显式TXT同URL分别解析、两阶进度；取消一个订阅保留peer与唯一网络请求；全部取消/会话撤销后底层真实延迟响应仍完成，迟到资产不入库、不留原生URL缓存；两个bank共享原生缓存对象各持一份引用，释放一个不破坏另一者，全部释放归零。404保留状态404，CORS保留status0与原因；CSP实际connect-src策略触发securitypolicyviolation并在服务器收到请求前阻断。默认原生404/CORS各重试五次如实计入HTTP日志，不声明传输abort。报告subset=true/completed=false，只收PG-06限定范围，PG-32完整十类NP/能力表仍未收口。此验收未改生产代码，不需要再重建已有产物。

Lead新增`port-gap-atlas-review.test.ts`，`port-atlas-official-review.log` EXIT=1（3失败），扩展`port-atlas-writer-review.log` EXIT=1（5失败），确认现有atlas：官方offsets四元应为left/bottom/originalWidth/originalHeight；新版rotated bounds保持逻辑宽高、packed另交换；page1先完成不能打乱页数组；TexturePacker紧凑输出与legacy页字段都允许无缩进。对应主来源为[libGDX TextureAtlas解析器](https://github.com/libgdx/libgdx/blob/master/gdx/src/com/badlogic/gdx/graphics/g2d/TextureAtlas.java)及[TexturePacker写入器](https://github.com/libgdx/libgdx/blob/master/extensions/gdx-tools/src/com/badlogic/gdx/tools/texturepacker/TexturePacker.java)。现有自造夹具/测试把错误格式解释钉住，不作为兼容证明；将已确认五项交Orca Worker修复。工厂rect.y与滤波/PMA等仍需真实GPU审查，PG-01保持NOT_RUN。
