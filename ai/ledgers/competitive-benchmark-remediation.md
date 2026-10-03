# 竞争力基准回灌执行台账

关联[任务计划](../plans/competitive-benchmark-remediation.md)。本台账记录当前实施与验证,不替代测试或浏览器证据。开始日期:2026-10-03;目标覆盖 CB-01…CB-21,未验收项保持开放。

## 基线与协作

- 起始 HEAD:ea2b507f9182c98810a6e300d2eaac8b50457622。保留既有 ai/README.md 改动与未跟踪计划;不提交、不推送、不更改版本。
- 首轮完整构建与 tarball 已冻结在 output/competitive-benchmark/baseline,包含非 min/min JS、声明、指纹和包;该目录为本地临时证据,不作为永久发布记录。
- build:all、typecheck、verify:web-only 的退出码均为 0;build/dts 有既有编译器诊断,未声称无警告。
- 原有 Jest:33 suites、270 tests,269 PASS/1 FAIL。唯一失败为 smoke-30 的旧浏览器矩阵 bundle 指纹与当前构建不符(bcc9f69e08f018ed→cb081fc84ad9addf),需重采相关证据,不能删除断言消除失败。
- 三个子任务分别负责 uniform/Light、input/Orbit、geometry/effect 工具;主线程统一构建、上游映射、共享目录和验收。冻结期间各任务只读源码,冻结完成才解除源修改锁。

## 任务状态

| ID | 状态 | 当轮证据或下一步 |
| --- | --- | --- |
| CB-01 | 修复范围已验证 | 当前006ae858三浏览器transmission/volume/dispersion参数像素A/B通过;R/G正交通道各13/13通过且两个实际错shader反例被拒绝;capabilities已实跑刷新,其他历史扩展标签不借此宣称当轮全证 |
| CB-02 | 修复范围已验证 | 非法类型/finite32/数量/sparse孔、linear转换后溢出与多pass预备快照原子性21/21;合法scalar/array/Color/Quat/Mat保持原生语义,三浏览器uniform各30/30 |
| CB-03 | 交付范围已验证 | 基线10/10 FAIL→12/12 PASS,含UI嵌套计数/claim恢复;三浏览器实际wheel/down/touch异常后后续监听器各2、结构化诊断恰3,普通EventTarget保持重抛 |
| CB-04 | A已验证/B文档交付 | 静态/动态nullish修复;POINT/LINE真实像素3008/4800、pointSize8→16覆盖4.04倍、释放重建通过。B按允许的文档方案解释PSO/instancing/阴影影响面,不宣称mesh单参数入口已实现 |
| CB-05 | 当前包消费已验证 | 原单灯黑Fox未复现;多灯真实断点为OPAQUE/MASK覆盖ADD blend/depth状态,已修。当前冻结npm包、min与工作区在三浏览器下Fox/原生材质控制/方向ShadowMap共27条件通过;宏/纹理名探针错误的原FAIL保留 |
| CB-06 | 待决策备忘录 | 原 owner #6 为变体构建证据;需具体 opt-in/Recipe 方案再请求决策,独立推进其他任务 |
| CB-07 | 修复范围已验证 | 早注册在source/headless与Full Web的分支不同:完整bundle的effect-import GPU init未就绪确实TypeError。已保持metadata立即可查,延迟program注册到Renderer-init并重选真实library,销毁取消callback;3test与FULL浏览器195432亮像素通过。非法首次Material Pass报AIR_E_MATERIAL_NOT_READY |
| CB-08 | 当前未复现,调查交付 | 三浏览器vertex/fragment xyzw及CCGlobal对照通过;物理784B大block metadata/GPU偏移与值相符。未改.w writer;历史完整自定义shader未据此判已修复 |
| CB-09 | 交付范围已验证 | Orbit数学4/4、三浏览器真实拖拽画面/指数衰减与wheel通道通过;DOM捕获2/冒泡0如实合同化,不更改默认传播 |
| CB-10 | 交付范围已验证 | effect-json工具限定vec4/mat4布局并拒绝非法输入;14个图元/生成测试通过,实际生成shader绘制与资源生命周期通过 |
| CB-11 | 交付范围已验证 | shared/merged/dynamic三例真实像素及生命周期通过;native instancing256实例1draw、2048实例2draw。固定120样本CPU/update数据入报告,GPU/present不可用,不声称60fps容量 |
| CB-12 | 交付范围已验证 | HDR/exposure/局部光meter scale合同与campfire-night标定例交付;实测日夜中间态/暖地面/闪烁,不写通用亮度补偿 |
| CB-13 | 交付范围已验证 | 实例Loop策略使用原生state并保留共享clip Normal;两实例skin/Morph与暂停切换均通过。查看器已迁移instance.setAnimationLoop(true),不再修改共享clip;定向及整批154例通过 |
| CB-14 | 交付范围已验证 | accurate fog原unlit单参no-op复现;Air专用effect传worldPos,大三角中心156、TRS/instancing180、bypass255。20次创建销毁registry/buffers稳定、shader identity1,标准效果未改 |
| CB-15 | 调查与支持矩阵交付 | 当前程序化与实际安装包Fox的方向ShadowMap均无全黑;Fox真实shadow sampler存在,平均RGB93/79/58→70/65/51。Planar ROI未证、Spot未单测、点光不支持如实登记稳定ID |
| CB-16 | 交付范围已验证 | PixelFormat两公开别名,三浏览器texture各44/44,验证等价输入/UV/alpha/normal。Firefox DOM canvas premultiply量化由实际bytes严格计算,未放宽阈值 |
| CB-17 | 已验证并收纳 | pixel-regions可选工具与公开harness独立比较合成反例+Fox截图6分区,绝对百分点误差均0;不进入SDK默认包 |
| CB-18 | 首批场景范围已验证 | E01/E05/E06/E07/E09优先场景及E10已按公开Spec重实现;整批154例与独立动作/像素/资源验证通过。13个新例已全部纳入三浏览器合同,完整78/78通过;E04/E08保留后续决议范围 |
| CB-19 | 交付范围已验证 | 12项处置文档与源测试;consumer正式入口utils.MeshUtils.createDynamicMesh/类型消费通过,没有新增不必要别名 |
| CB-20 | 评估交付 | nativeGPU instancing/Points已存在,通过真实draw计数证明,评估后以三路线Recipe暴露现有能力,不宣称不存在GPU通路 |
| CB-21 | 首对已实测,续跑受调度限制 | gpt-6-luna/high,fork-none E01/K0/R01已完成;双臂P4失败,路径合规均有偏离,不声明成本改善。24Pair已准备;E02半对因agent thread limit reached停止,剩余需用户授权独立任务续跑 |

## 验收要求

- 每项记录复现、实现、定向测试与运行证据;不能以 uniform 字段或源码字符串检查替代像素行为。
- 上游抽取件改动由主线程登记 docs/upstream-file-map.json 与 docs/UPSTREAM.md 后检查。
- 当前构建完成前不重采共享正式证据;浏览器临时截图统一在 output/playwright。
- 任务完成后继续逐项核对计划的全部交付物与门禁;任何未复现、未实现或缺证据项明确保留状态。

## 集成待办与本轮门禁

- 中间候选完整build:all、typecheck、verify:consumer、verify:doc-refs通过。后续Effect早注册/物理贴图解码/Pass状态与Fog工厂改动已进入非min候选,声明也已刷新;最终min与包消费者仍需在全源冻结后统一重建。
- 新例规范已达到158 frozen,最终数量仍随E05落地而增加。Gallery manifest由正式生成器更新,不手写登记。
- 正式subset collector首次5/6 PASS,唯一Fog缺新声明;build:dts已补该出口,正在重跑。独立专属browser PASS不替代正式collector的scope/type/lifecycle/assetDigests检查。
- 初次集成Jest323/327:旧矩阵fingerprint、当时尚未登记的asset-enum映射、未完新例schema/manifest/正式asset绑定。映射/schema/manifest已逐步修正,最终全量Jest尚未重跑,不声明全绿。
- asset-lifecycle新增仅显式启用的released谓词,用于MaterialInstance真实GPU释放与CCObject.isValid语义不同的情况;默认行为保持,活pass与异常谓词负控通过。64个导入源的证据指纹需重采。
- 正式资产哈希/全例证据、浏览器matrix、capabilities及最终build/consumer门禁仍开放。CB-06路线选择与CB-21同条件Agent成本复测尚未完成。

### 当前收口检查点

- E05/E07已收编,Gallery共159例。规范159 frozen,API绑定4483项已由生成器回填;新增13例保留真实独立场景/资源/交互证据。
- 第二次正式整批采集154/154 PASS(其余5例为独立DevTools范围),verify:example-chain通过且live/evidence候选一致329da8dc53089d1f,API proof verified4325/attested71/unproven0。包括资产哈希、实际类型、独立工作区、交互和完整生命周期。
- 最终完整build:all、包消费者584 exports、licenses10项零FAIL、web-only、file-map、doc-refs已通过。后续仅修改验证工具/示例协议与元数据,未新增SDK源改动。
- 三浏览器旧矩阵39记录已定位代理污染并修复:仅browser env合并loopback到NO_PROXY/no_proxy,负控复现原FF/WK连接错误再通过。新增7例范围契约接入后,矩阵静态服务器还需支持真实TS/.js→.ts转换,已补只读内存转译,当前60记录整批重跑中。
- capabilities已由实浏览器重新生成21项,engineVersion更新为1.0.0;其中旧静态verification表仍须按本轮物理像素证据范围复核,不以生成成功替代所有扩展像素证明。
- 整批promotion产生JSON排版变化,由Prettier只格式化元数据;canonical spec hashing不受纯排版影响。最终format、完整Jest/test inventory与matrix绿跑后还有统一回归收口。
- CB-06明确路线的用户回复仍待收取,已交付可审查备忘录与E05限定impostor Recipe;CB-21真实同条件Agent成本复测仍未执行。目标保持CB-01…21完整验收,当前不标任务全部完成。

### 转换原子性修复后的当前候选

- 最后复核发现CB-02的类型校验仍早于pass独立linear转换:后续pass的转换结果溢出时,前一pass可能已经写入。现改为先准备并验证所有实际上传快照再统一写入,保留原始props、原生数组/partial/null语义;定向21/21通过,包含原失败反例和pass顺序交换。
- 重新执行build:all,当前非min SDK SHA256为006ae858d4e75dcb4c716afccd2eedcbefe81300304cb0cfca9d1fffa918c03e。CB-21候选包冻结为output/competitive-benchmark/candidate/cocosair.js-1.0.0.tgz,包SHA256为d6ed10fef2748fa2f4a3f10a938fc4b2e8f37b7f0f2a001b9dce8cdfa989a5ba;不使用旧指纹代替当前验收。
- 当前候选正式示例整批154/154通过,completed=true、partial=false、candidateFingerprint=ba485e1b91643c46;三浏览器matrix 60/60通过,completed=true、subset=false。uniform各30/30、texture各44/44,Full SDK早注册真实绘制195432亮像素通过。
- 当前候选传输/体积/色散三浏览器参数像素A/B通过,报告已入docs/evidence/examples/competitive-benchmark/transmission.json。独立R/G贴图通道三浏览器各13/13通过:transmission仅R、thickness仅G,ignored通道实测maxRGBDiff=0,两个实际错通道shader克隆均被拒绝;永久报告已收纳texture-channels/browser.json,迁移保持截图字节SHA与原报告出处。
- Recipe显式门禁--scope=competitive-batching通过,覆盖3路线8条件各120帧样本,14项负控通过;不代表旧legacy30全集重新验收。
- 当前typecheck与包消费者通过(584 exports)。首次最终Jest在正式示例报告仍partial的写入窗口运行,393/394通过,唯一失败为证据链门禁;示例整批完成后独立compliance检查0 fail/2 warn,完整Jest重跑50suites/394tests全通过,由真实发现结果更新inventory,保留失败日志。web-only、file-map(91 modified)、format与文档引用检查通过。
- 成本计量中官方可观测执行事件独立列为observedExecutionEvents;无法获取的工具调用总数/token保持null,不估算、不据此给成本PASS。

### CB21 首对真实复测与调度限制

- 已创建独立目录E:/AIProMax/Y2026M10/cocosairjs-cb21-current-20261003,共24Pair/48Arm。实际仅完成E01/K0/R01一对,新fork-none,gpt-6-luna/high,官方startedAt差23秒。正式采样串行,独立公开validator、浏览器与输入守卫均绑定该批次;视频采集要求在首次独立测量前补齐并保留原instrument manifest。
- 两臂独立验收均FAIL:7探针中5 PASS、P4状态断言FAIL、P7依赖跳过;P4画面变化分别0.2799/0.1516,原生Chrome观测rAF均约60.1。保留失败报告,不修改冻结Spec/断言或事后修臂来制造PASS。
- 原公开validator的evidence.stateBefore为动作前快照,但双样本断言使用waitMs后另取的before,后者未保存。已从冻结源码核对这一证据口径差异;不能用显示的120→48/57驳倒原FAIL,也不能将其直接归为引擎缺陷。后续仪器应保存真实断言输入,不更改采样时序与判定阈值。
- Agent机器计数:Three build3/browser6,AIR build3/browser2;正式validator额外build各1已另记。官方观测执行事件27/22,属于命令/文件事件而非工具调用总数。墙钟包含等待,初次GPU申请时间未记录,等待净值不可用;不估算扣除。
- AIR臂一次日志写入并读取Pair上级的自有单行文件,已保留并记scopeCompliance=false。官方事件复核还发现Three臂一次从Pair目录执行相对读取/列表尝试,后续纠正;同样记scopeCompliance=false,不据失败读取推断成功信息泄漏。原始事件、工作区、截图、视频及失败均保留;没有有效合规样本支撑成本改善结论。
- 下一对E02/K0/R01的第二臂创建时spawn_agent返回agent thread limit reached。首臂已按指令停止,无实现/build/browser,记INCOMPLETE_PAIR_DISPATCH;其余22Pair未启动。没有关闭agent工具,不能复用旧臂冒充冷启动。已请求用户明确授权独立任务续跑;不更改旧G6或历史冻结包。
- API覆盖检查发现5个独立DevTools示例仍为旧candidate,已重采其专用门禁5/5通过且默认runtime包边界通过;API覆盖报告由正式生成器刷新并直接--check通过,stale=0。普通154例整批不替代这5例证据。
- 最终format检查通过;手册源码一致性strict通过(fail=0、missing=0、warn=5),警告为非连续示例片段,不称无警告。CB-06路线与CB-21继续调度仍待用户答复,其余已交付任务维持各自明确的已证范围和未复现边界。

### 继续验收后的补齐

- CB-05/15补齐当前冻结包的真实npm离线安装范围:工作区、安装包、min × 三浏览器 × glTF效果/原生纹理控制/方向ShadowMap,27/27通过且工作区/包像素一致。当前纹理属性mainTexture、启用宏USE_ALBEDO_MAP与shader sampler albedoMap分开核对,确认实际sampler存在;原错误探针失败报告及ShadowType非独立SDK导出的日志保留。
- 查看器原代码会修改共享AnimationClip.wrapMode,现改为实例setAnimationLoop(true)。API证据替换为真实执行的Animation.getState,没有删除全局API分母或降低门槛。定向1/1、整批154/154通过,完成标记true/partial=false且candidate仍ba485e1b91643c46。
- 6个原先仅有专属三浏览器证明的例子补进正式matrix合同,现在26条目×3引擎=78/78,completed=true/subset=false。读取现有probePath,未改6个示例源制造字段;7项读取器负控通过,报告同时记录runner/reader/contract指纹。
- 完整Jest重新发现51suites/401tests,401/401通过且inventory由真实结果刷新。format、doc-refs(120docs/1027refs)、example-chain、API coverage --check通过;SDK仍006ae858,没有重写冻结候选包。
- P4诊断仅在公开验证器副本保存真实断言输入,不更改采样/阈值/原FAIL。Three before52.208→after48.808,缩短3.400;AIR before60.374→after57.332,缩短3.042,均不满足冻结窗口缩短5。动作前120是另一快照,画面变化均通过。回放不是新冷启动成本样本,原Agent预算不加这两次Root诊断构建。
- CB-06本轮路线选择和CB-21独立任务续跑授权仍缺失。当前不标整体完成,也不以首对失败/事件代理指标给成本改善结论。

### 连续阻塞审计

已连续三个目标轮次受相同调度限制影响。本轮重试E02/K0/R02时首臂成功创建,第二臂仍返回agent thread limit reached;首臂已停止,没有实现/build/browser,第二个半对记INCOMPLETE_PAIR_DISPATCH并保留日志。当前批次实际完成1对、半对2、未启动21对;不能复用旧臂冒充fork-none,也不能未经明确授权创建独立Codex任务。

CB-06的新opt-in/Recipe路线没有用户决议;CB-21独立任务续跑授权也没有回复。已完成的SDK/示例/包消费/矩阵与401项测试无需重复跑,没有仍在执行的必要验收作业可等待。剩余工作需要用户决策或agent容量变化,因此目标状态记blocked,没有标complete、没有提交或更改版本。
