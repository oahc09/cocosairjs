# Cocos Air 竞争力基准回灌提升计划

> 2026-10-02 基于 three.js r186 对照基准实验报告整理(报告目录:`E:\AIProMax\Y2026M10\cocosairjs-competitive-agent-scenario-benchmark\results\reports\latest`,四件:EXPERIMENT-REPORT / ACCEPTANCE-REPORT / cocosair-gap-map / roadmap-input.json)。本文是待执行清单,不代表任何条目已交付。
>
> 实验口径:Track A 全量(20 Reference,行为探针 79/79 全绿、fps 全部 60.0–60.3、console 0 错误)+ Track B Pilot(4 pairs / 8 arms,K0 冷启动)。全部对比为 N=1 观察性结论;报告记录的最小复现与源码定位可作为调查入口,但**历史候选包的结论不自动代表当前 HEAD 已复现**。

## 0. 判定口径与边界

- **证据基线**:基准实验针对 `cocosair.js@1.0.0` K0 tarball(sha `ddd5072a…`)与本仓库工作区产物。当前 HEAD 仍为 1.0.0 但已有后续提交,**每项修复必须先在当前 HEAD 的 `npm run build:all` 产物与 `npm pack` tarball 双口径复现**,记录源码、非 min/min JS、声明及 tarball 指纹,避免混入旧产物;复现不了的在计划台账记"未复现+差异分析",不得照单修。
- **核心结论(实验推翻/修正静态认知的部分)**:
  1. 能力面 10/10 FEASIBLE——差距重心**不在"能做什么",在"把能做的事情变成 Agent/开发者可预期"**(静默失败、行为契约、事件层暗坑);
  2. 两条硬线:Code First 后处理三闸门不可达(E05 实证)、KHR transmission 内置路径死代码(E09 实证);
  3. Pilot 中 AIR 工具调用约为 three 的 2.39×(报告约写 2.4×)。执行记录显示,多轮调用用于定位没有错误提示的运行期问题,静默失败是重要成本来源;各缺陷的独立贡献尚未量化。3.7× token 属报告汇总口径且未独立观测,1.6× 墙钟与逐对 WORKLOG 汇总存在差异,不能直接作为稳定成本门禁;
  4. `.d.ts` 优势没有兑换成低成本——**类型声明、运行期校验与行为契约需要配套**。`setProperty(name, value)` 的合法值取决于 shader 属性类型,事件传播、图元选择和材质渲染也需要运行时验证。
- **上游边界纪律**:`physical-effect.ts`、`transmission-capture.ts` 等 `src/air/` 文件可直接修;凡改 `src/cocos/` 抽取件(create-mesh、material、pass、input、point-light、camera-component、effect-asset、game/director 等),先读 `docs/upstream-file-map.json` 对应行,修后在 file-map 与 [UPSTREAM.md](../../docs/UPSTREAM.md) 登记差异,不静默替换上游基线。
- **知识回灌落点**:报告的 K1/K2 知识包回灌项在本仓库落位为 `docs/manual/` 手册页、`examples/` 正典示例与 `tools/debug/` 辅助工具;bench 仓库侧的知识包不在本计划范围。
- **示例收编边界**:Reference 实现隔离于 bench 仓库 `reference/private/`(Agent 不可读,晋升需 bench 合同 §22.1 流程)。本仓库收编走"以冻结 Scene Spec(briefs/E01..E10,可读)在本仓库重新实现为 `examples/`"路线,不拷贝私有实现;若 owner 批准 bench 侧 §22.1 晋升,两边再对齐。
- 保留未提交改动;证据脚本/截图使用独立输出路径,不覆盖既有正式证据文件。

### 0.1 静默失败的诊断成本补充(2026-10-03)

以下过程与数字来自用户补充的 Pilot 执行记录,用于说明排障路径;本次文档补充没有重跑实验。M 数值为原记录的累计 token 口径,不是本轮独立计量结果。

| 场景 | 原记录成本 | 无报错时的排障过程 | 回灌任务 |
| --- | --- | --- | --- |
| E01-AIR | 18.0M;build 8 次用满预算 | 黑屏二分("平凡投影可见/真实投影不可见")→uniformBlockBinding 追踪→定位 FLOAT4 普通数组被按对象分量读取,NaN 污染全部顶点;另发现 canvas 层 wheel stopPropagation 阻止外层冒泡监听器接收事件 | CB-02 类型/数值校验;CB-09 传播合同与标准接入 |
| E02-AIR | 14.2M;11 次浏览器会话,其中 7 次纯诊断 | 亮度网格、材质自省、A/B 品红对照,最后同样定位 NaN 家族问题 | CB-02 在写入边界报告属性类型违规 |
| E10-AIR | 14.6M;diag3–diag8 六轮排除 | 狐狸纯黑且 console 零错误;依次排除阴影、主光方向、环境光、GPU 纹理读回、UV 与 albedo,记录最终指向 air-gltf-standard 路径,绕行 builtin-standard+USE_DIFFUSEMAP | CB-05 固定候选包与场景复现,对照两个 effect 定位具体断点 |
| E05 | AIR/three 成本差 5.2M,该批差值最小 | 纯程序化场景,没有模型资产/动画链路,触及的相关风险路径较少 | 作为不同踩坑面的观察对照,不能单凭此例证明资产链路的独立成本 |

**处置原则**:诊断落在最早可确定违规的位置。类型不匹配、缺失分量或非有限数值可以明确报告;黑屏本身可能是合法场景,由可选调试工具展示材质宏、纹理状态和光照条件,不能统一判为引擎错误。wheel stopPropagation 先按输入传播合同处理,是否改变默认传播行为另行评估。动画正常结束也不等于故障。

**成本结论边界**:2.39× 是观测到的总调用差,不是静默失败单因素的净影响。保留"静默失败是重要成本来源"的结论,同时在 CB-21 分离构建修复与知识包变化的影响。首批除消除已确认缺陷外,必须交付能减少手工二分的错误信息、行为合同和诊断入口。

## 1. 优先级策略

三档排序依据 = 报告 §6 处置总表 + Pilot 成本归因:

1. **P0 正确性静默错误与运行期契约**(EB-01…EB-07 + EB-10):当前候选包复现、最早违规边界校验、派发状态恢复、结构化错误与 glTF 黑屏根因定位;不预设都是一行修复。CB-09 的输入传播合同与标准接入随首批交付,OrbitControls Pattern 仍按 P1 排期;
2. **P1 行为契约与可诊断化**(EB-08…EB-19 中的 P1 + Pattern/Recipe):手册契约页、Recipe、诊断辅助;
3. **P2 能力面扩展与长尾**(EB-18/EB-19):实例化/点云一等公民评估、API 长尾批量。

## 2. 任务总览

| ID | 优先级 | 工作项 | 对应差距(证据) | 交付范围 | 完成判据 |
| --- | --- | --- | --- | --- | --- |
| CB-01 | P0 | KHR transmission 死代码修复 | G-TRANSMISSION / EB-02(physical-effect.ts:170/348,自首次提交即缺失) | `src/air/` 修复 + 回归示例 + 能力目录 | transmission GLB 像素级 A/B(修复前后),capabilities.json 状态从受限翻绿;`npm run capabilities` 重跑 |
| CB-02 | P0 | NaN 家族类型防御 + 结构化错误码体系 | G-NAN-FAMILY / EB-03/04/05(E02-a 4 build、E01-b 6 轮、E09 两处) | 按 uniform 类型/数量进行 material/light 写入校验、上传往返单测、错误码族、速查手册页 | 非法类型/长度/数值立即报属性名、期望类型与合法示例,且不污染原状态;合法向量、颜色及 uniform 数组保持兼容;Vec4 xyzw 全分量往返通过 |
| CB-03 | P0 | 输入事件分发器防毒化 | G-INPUT-POISON / EB-06(input.ts:345-355,单回调抛错→输入失灵记录) | 回调列表状态恢复 + 输入监听器异常隔离策略 + getLocation 类型防御 + 文档 | 抛错后后续监听器及后续 wheel/click/touch 仍响应;once/off/嵌套派发通过;非法 getLocation 出参不毒化派发状态 |
| CB-04 | P0 | POINT_LIST 双路径修复 | G-POINT-LIST / EB-07(create-mesh.ts:191/302 falsy-zero;pass.ts:219 图元来源割裂) | A:零值默认修复;B:mesh/pass 图元合同协调方案与实施范围;POINT/LINE 示例 | A 保留 POINT_LIST=0;B 若实施协调入口则仅设 mesh 即渲染,若仅文档化则明确匹配 pass 的要求及限制,不得声称 mesh 单参数已达标 |
| CB-05 | P0 | air-gltf-standard 纯黑根因 | G-GLTF-STANDARD-BLACK / EB-01(K0 tarball 黑渲染 vs 工作区正常,E10-a 6 轮诊断) | 固定模型/相机/光照/候选包对照两个 effect,定位 shader/宏/纹理绑定/色彩链路 + 回归用例 | Fox 级带贴图 GLB 在 tarball 消费口径渲染正确;根因与修复或已知边界/官方绕行落档;可选调试工具可读材质宏与纹理状态 |
| CB-06 | P0 | 后处理可达性(owner 决策重开) | G-POSTPROC / EB-10(三闸门:exports/custom-pipeline.ts 无人 import、game/game.ts:794-804 清 rendering、director.ts:831-843 需宏) | 决策备忘录 + 批后实施:opt-in 装配点 + tonemap/FXAA/bloom 首批 pass + A/B 证据 | owner 决议落账 owner-decisions.md;若批 opt-in:bloom 开/关像素 diff>0 三引擎取证,manual 页 PARTIAL→实测状态;若不批:bloom-impostor Recipe + 手册如实收口 |
| CB-07 | P1 | 启动与可见性合同诊断 | G-VISIBILITY-DEFAULT / EB-13/14(历史 camera/注册时序判断待当前复核) | 合法默认 mask/早注册回归;非法材质创建的时序诊断;速查手册 | 不误报合法 EffectAsset 注册及正常播放结束;非法 renderer 未就绪创建报明确错误;可选工具解释 mask/材质/纹理条件 |
| CB-08 | P1 | Vec4 `.w` 上传缺陷 + 顶点 UBO 漂移调查 | EB-05(运行期 setProperty 丢 .w)、EB-09(E01 G3 顶点阶段 uniform 离散簇) | 上传路径单测修复;UBO 漂移定位报告 | `.w` 运行期更新 shader 读回一致;UBO 漂移有根因结论或"已定位不可修+绕行文档" |
| CB-09 | P0 合同/P1 Pattern | 输入事件层契约 + OrbitControls 等价 | G-EVENT-SWALLOW / G-NO-ORBIT / EB-08(wheel/mousemove 传播受阻,E01-b 3 轮) | 首批交付传播合同与标准接入;后续交付 orbit-controls 示例/Recipe | 明确 DOM/引擎通道、wheel 标准接入及去重;默认传播行为变更单独评估;orbit 示例含惯性阻尼与采样指引 |
| CB-10 | P1 | 自定义 Effect 模板与生成器 | G-EFFECT-DX(E04 §2.3 API_HALLUCINATION 热点;E01-b 8 build) | 编译产物 JSON 模板 + 生成脚本 + 手册补写 + 早注册错误(联动 CB-07) | 从 GLSL 片段+声明表一键生成可注册 effect JSON;生成器自身有单测 |
| CB-11 | P1 | 批处理三路线 Recipe 与规模预算表 | G-BATCHING / EB-18 文档面(E07:1536 楼@54.7fps、100k quad/帧锚点) | Recipe + 决策树 + 预算表 + minPos/maxPos 等 trap 收录 | 三路线各有可跑示例与量化预算;Recipe 过 recipe-review-gate |
| CB-12 | P1 | 光照量纲换算统一表与夜景基准 | G-LIGHT-UNITS / EB-19⑫(LDR 8–14 vs HDR 50000 lux vs SpotLight ×10000) | lights/color-management 手册补写 + 标定示例 | 一张覆盖 directional/ambient/spot/曝光的换算表;夜景示例基准值可复现 |
| CB-13 | P1 | wrapMode 与 clip 共享语义 | G-WRAPMODE / EB-16(E10-a 首验 15/19) | 保留原生 Normal 默认,增加实例级 opt-in 循环入口与共享边界说明 | 默认单次播放完成事件不变;Loop、pause/切换及两实例骨骼/Morph独立;不修改共享clip影响其他实例 |
| CB-14 | P1 | fog 运行时开关优化 | G-FOG-RECOMPILE / EB-12(全变体重编译 ~100ms 颠簸) | uniform 级雾开关评估 + unlit 逐像素雾变体 + "run 前配置"文档 | 运行时切雾无整帧颠簸(或结论+规避姿势入册);unlit 大三角雾插值瑕疵消除 |
| CB-15 | P1 | 点光阴影矩阵 + ShadowMap 黑化调查 | G-SHADOW-POINTLIGHT / EB-11(point-light.ts:32;E10-a ShadowMap 黑化回退 Planar) | 灯型×阴影×后端支持矩阵文档 + 黑化复现 | 支持矩阵发布;黑化有根因或登记为已知边界;能力目录登记 ID |
| CB-16 | P1 | 显式 sRGB 纹理通路与颜色合同 | G-SRGB / EB-15(历史程序纹理观感待查实际编码链路) | 现有GFX格式的PixelFormat公共别名、显式采样/输出合同、正常数据贴图回归 | 等价线性/sRGB输入像素一致、UV与alpha正确、normal数据保持线性;明确标准材质软件解码边界,不交付固定亮度补偿 |
| CB-17 | P1 | Agent 自检对齐辅助 | G-PROBE-SEMANTICS / DX-SELFCHECK-DIVERGENCE(E02-a 自检 24/24 vs harness 3/7;E05 双臂全绿 vs 0/6) | `tools/debug` 分区 litRatio 读数辅助 + 探词/断言语义文档 | 自检辅助与 harness 口径对齐(分区占比而非"非黑");采样窗语义文档化 |
| CB-18 | P1 | 基准场景收编官方示例 | G-EXAMPLE(E01 点云/E04 烟花/E05 吸积盘/E06 篝火/E07 夜城/E08 鱼群/E09 折射) | 按冻结 Spec 重实现为 `examples/`(择优分批) | 每例过 example 链路与 browser-matrix;不拷贝 bench 私有实现 |
| CB-19 | P2 | API 一致性长尾批量修复 | G-API-TAIL / EB-19(12 条;其中 tarball `utils.MeshUtils` 挂载不一致为 P1) | 逐条修复或文档化;tarball/仓库导出面对齐 | 12 条各有着落(修/语义文档/登记不修);tarball 与仓库 `createDynamicMesh` 路径一致有 verify 断言 |
| CB-20 | P2 | 实例化/点云一等公民评估 | EB-18(GPU 剔除/逐实例动画缺失;规模上限本身达标) | InstancedBuffer/Points/DynamicQuadBatch 评估报告 + 决策 | 出"做/不做/怎么做"决议入 owner-decisions;若做,另立实施计划 |
| CB-21 | P1 | 修复成效复测与成本目标 | G-K0-COST / DX-COST(工具约 2.39×;token/墙钟汇总限制见 §0) | 冻结计量条件,在 bench 按 G6 恢复程序复测,分离构建与知识包影响 | 固定条件并重复运行,披露 N、原始计量与离散程度;≤1.5× 是优化目标而非本轮硬门禁;首轮通过率和结果如实回灌 |

## 3. P0 引擎正确性(静默失败)

### CB-01 — KHR transmission 死代码

`src/air/assets/gltf/material/physical-effect.ts:170` 声明 `airTrFactorTex/airThickTex` 后从未从 uniform 赋值,L348 `clamp(airTrFactorTex,0,1)` 恒 0,`if(trF>0)` 恒假;Beer-Lambert 与色散同死。AirTransmissionCapture(scene-color 两相机捕获)本身正常,断裂只在 modulate 注入层。修复:在 modulate 块补 `airTrFactorTex = TRANSMISSION_CONSTANT.x;` 与 thickness 赋值(具体 uniform 槽名以 `transmission-capability.ts`/`texture-slots.ts` 现状为准)。验收必须含带 `KHR_materials_transmission(+volume/dispersion)` GLB 的修复前后像素 A/B 与 `examples/gltf-catalog` 能力矩阵翻绿;修复前该能力在能力目录按 BLOCKED 标注,不维持"官方支持"的失真声明。本文件为 AIR 原创,无上游登记负担。

### CB-02 — NaN 家族防御与结构化错误码

三个独立臂复现的最高频黑屏根因:`Material.setProperty`(material.ts:303)对 FLOAT4 传普通数组走逐元素写、writer 读 `.x` 得 NaN(E02-a 4 build 全黑;E01-b u_spin 毒化全部顶点);`Light.color` 传 Vec3 同族(E09 白屏);运行期 `setProperty(Vec4)` 丢 `.w`(EB-05,单列 CB-08)。修法分两层:

1. **防御层**(上游文件,登记差异):在属性写入前按实际 uniform 类型、数量及数组长度校验,并检查必需分量与有限数值;保留已有合法向量、颜色、矩阵和 uniform 数组输入,不把所有数组统一判为非法。拒绝非法输入时报告错误码、属性名、期望类型及合法示例,不做静默强转、不部分写入原材质状态;
2. **诊断层**(AIR 层):建立轻量错误码族(挂 `src/air/`,如 `AIR_E_MATERIAL_TYPE`/`AIR_E_LIGHT_TYPE`),console.warn 一条含"症状→根因→绕行"的短文案;新增手册页《行为契约与静默陷阱速查》收录黑屏/白屏/值漂移鉴别表。

验收:smoke 断言类型/长度/非有限数值违规在写入前报告,原材质状态保持有效;合法输入与 xyzw 更新通过回归。校验在 setter 边界执行,不新增独立逐帧扫描;声明和示例保留实际合法输入集合,不以动态属性名可被 d.ts 完整校验为前提。

### CB-03 — 输入分发器防毒化

`src/cocos/input/input.ts:345-355` 在 dispatcher 层捕获异常并清队列、通知与重抛;实际监听器循环在 `src/cocos/core/event/callbacks-invoker.ts:329-363`,异常可跳过后续回调与 isInvoking 清理。E08 的触发器是 `getLocation(out)` 传普通对象(`out.set is not a function`)。修复必须覆盖回调列表的异常状态恢复,不能仅修改外层 catch;明确输入监听器的逐回调隔离策略,不未经评估改变所有 EventTarget 的异常语义。异常监听器报告结构化错误,后续监听器及事件仍可执行;非法 getLocation 出参明确诊断,不通过静默构造掩盖调用错误。验收覆盖同次派发的后续监听器、后续 wheel/click/touch、once、off 和嵌套派发,并核对错误数量与监听器调用次数。

### CB-04 — POINT_LIST 双路径

拆分两项:A,`src/cocos/3d/misc/create-mesh.ts:191,302` 使用 `geometry.primitiveMode || PrimitiveMode.TRIANGLE_LIST`,导致 POINT_LIST(=0)被静默覆盖,改为 `??` 并登记上游差异;B,实际 PSO 图元取 pass.primitive(`src/cocos/rendering/pipeline-state-manager.ts:55`),需要明确 mesh/pass 的协调入口和影响面。A 修复不等于 B 已解决。B 若实施协调入口,以仅设置 mesh primitiveMode 即渲染为验收;若仅文档化,必须明确 pass 匹配要求并登记尚未达到单参数入口目标。新增 POINT/LINE 示例覆盖属性、pointSize 与图元选择,附 EB-07 最小复现和浏览器像素断言。

### CB-05 — air-gltf-standard 纯黑根因

历史记录中 K0 tarball 的 Khronos Fox GLB 经 glTF 材质路径呈黑色剪影,Reference 工作区正常,纹理 FBO 读回为正常橙色;E10 用 builtin-standard+USE_DIFFUSEMAP 绕行。保持 P0 调查优先级,但不预设为打包问题或推广到所有带贴图模型。步骤:①固定同一模型字节、相机、光照、曝光与时间,记录 K0/当前包及工作区 JS 指纹;当前包先完整构建,注意 prepack 仅复制已有 JS 并剥离尾部 sourceMappingURL,不编译 shader 或声明;②在 tarball 消费侧复现,对照 air-gltf-standard 与 builtin-standard,定位 shader、宏、纹理绑定和色彩链路,同时比对 min/非 min 与 feature 变体;③根据根因修复或登记边界,将受测范围、官方绕行与当前未复现的差异如实落档。验收以 tarball 消费侧固定场景像素断言为准;可选调试工具展示材质宏、纹理状态与光照条件,不把所有黑屏自动判为错误。

### CB-06 — 后处理可达性(决策重开,不自动执行)

现状锁定于 `docs/notes/post-process-notes.md`:三闸门=①`src/exports/custom-pipeline.ts` 并入 bundle 但聚合出口不 import;②`src/cocos/game/game.ts:794-804` 无 Creator 资产管线时清 `cclegacy.rendering`;③`src/cocos/game/director.ts:831-843` 需 `CUSTOM_PIPELINE_NAME` 宏且根节点 usesCustomPipeline。owner 决议 #6(D11)此前批 (b) 档"只做变体构建级证据",复启条件为"owner 批 (a) 或上游提供 Code First 注册入口"。

**本项产出首先是决策备忘录**,不是代码:汇总基准新证据(E05 三 FEASIBLE_LIMITED 同因、fx 视觉维 7/10 场景压顶、three 臂 5 标准件零补丁 60fps 的"决定性优势"、bloom impostor 替代上限 80–85%),提请 owner 在 (a') `createAirApp` 增 `pipeline: 'custom'` **opt-in 不改默认** / (b') 维持 (b) 仅补 Recipe 两档间裁决。批 (a') 后实施:装配点 + 首批 pass(tonemap→FXAA/SMAA→bloom)、`examples/post-process-basic`、三引擎 A/B 像素取证、`how-to-use-post-processing.md` 从 PARTIAL 翻实测状态;不批则交付 bloom-impostor Recipe + blob shadow + 接触阴影烘焙三件套(CB-11/18 示例即活例)并手册如实收口。两档都更新 owner-decisions.md。

## 4. P1 静默失败可诊断化

### CB-07 — visibility / 早注册 / 冻结三源

当前 camera.visibility 已有 CAMERA_DEFAULT_MASK,EffectAsset.onLoaded 立即注册并监听 renderer 初始化执行预编译。先证明这些合法路径,不能把默认相机或提前注册一律判错。调查非法 Material 首次创建 Pass 时 renderer 未就绪的失败,在最早能确定的创建边界报告错误码与初始化示例。可选工具展示 visibility/mask、effect/宏、纹理状态与光照条件;普通黑屏或正常单次动画结束不自动报错。验收覆盖合法提前注册、默认层可见、非法创建诊断及手册排障合同。

### CB-08 — Vec4 `.w` 与顶点 UBO 漂移

EB-05:运行期 `setProperty(name, vec4)` 初始上传正常、更新后 shader 读 `.w`=0,staged `pass.getUniform` 读回正常→疑 staged→GPU 上传路径。修法:先写 xyzw 全分量往返单测(smoke + 浏览器读回断言)锁缺陷,再定位上传数组长度/偏移。EB-09:自定义 Constants 块与 CCGlobal 在**顶点阶段**读到随顶点变化的值(v_dbg 成像 27–232 离散簇),CCCamera/CCLocal 正常,根因未定位——立项调查(WebGL2/ANGLE uniform 路径、UBO 布局),出根因报告;不可修则文档标注"顶点阶段自定义 UBO 现状"+K2 绕行(烘焙 attribute、gl_Position.w)。两项都先复现:UBO 漂移用 `tools/debug/probes/` 新增探针页取证,不做无证据推断。

### CB-13 — wrapMode 默认与 clip 共享

原生 AnimationClip 默认 Normal,单次结束停在末帧是合法行为。经影响面评估采用原计划正文允许的 opt-in 路径:保留默认及完成事件,实例级薄入口配置原生 AnimationState.wrapMode,不修改共享 AnimationClip、不另写播放器。写清节点/骨骼姿态/Morph/AnimationState 独立与静态资产共享边界,给出循环、暂停/恢复、切换及材质变体示例。验收需两实例中间时刻骨骼与 Morph 数值及完成事件断言,不能只检查 wrapMode 字段;正常播放结束不发 warn。

### CB-14 — fog 运行时开关

`scene.globals.fog` 运行时切换是管线宏级开关→全材质变体重编译(~100ms 单帧颠簸);builtin-unlit 雾因子逐顶点,超大三角形插值误差。评估 uniform 级雾参数开关(常驻变体+参数驱动);unlit 逐像素雾变体;文档"app.run 前配置规避"姿势。验收:运行时切雾帧时间曲线无 >16ms 尖峰(或如实记不可行+规避姿势入册),unlit 大三角雾带瑕疵对照图。

### CB-15 — 点光阴影矩阵与 ShadowMap 黑化

`point-light.ts:32` 类注释明示不支持阴影;E10-a 实测 K0 构建 ShadowMap 使材质黑化、回退 Planar。交付:①《灯型×阴影×后端支持矩阵》手册页(方向光 ShadowMap/Planar、点光 NOT-PLANNED 或排期、SpotLight 现状),能力目录登记 ID;②ShadowMap 黑化复现(当前 HEAD 双口径)——这是比"不支持"更严重的正确性问题,复现则单独立缺陷;不复现则登记为 K0 tarball 特有并回流 CB-05 结论。

### CB-16 — sRGB 纹理格式

当前 GFX/WebGL2 已支持 SRGB8/SRGB8_A8,TextureBase 能透传格式,缺的是 PixelFormat 公共名称与颜色链路说明。增加 SRGB888/SRGBA8888 命名,保留原有枚举编号与默认标准材质行为;标准材质已做软件解码,不能再叠加硬件 sRGB 解码。验收用等价线性/sRGB输入,而非相同字节的两个格式必须相同亮度;包括UV方向、texture alpha映射到RGB、DOM canvas实际输入字节与normal数据保持线性。非POT限制须依据当前WebGL2路径判断,不复述WebGL1规则。此项不宣称已有全局colorSpace API或所有材质自动管理,不使用固定补偿系数掩盖错误编码。

## 5. P1 行为契约文档与 Pattern/Recipe

### CB-09 — 输入事件层契约与 OrbitControls

两层交付。**契约(P0 首批)**:`docs/manual/input-and-events.md` 明确 canvas/pal 的 preventDefault、stopPropagation 作用阶段,区分 window 捕获阶段 DOM 监听与引擎输入通道,提供 wheel 标准接入示例、鼠标/触摸去重和 getScrollY 单位说明;不得把 TOUCH_* 示例当成 wheel 已覆盖。先按现有传播合同解释,是否改变默认传播行为单独评估。getLocation 出参及异常恢复联动 CB-03。**Pattern(P1)**:官方 orbit-controls 使用球坐标、指数平滑与惯性阻尼,按可读 Spec 重新实现,不读取隔离的私有 Reference 实现。将采样时间、拖拽输入和阻尼参数固定,验证中途角度与衰减行为,不为了命中单一 200ms 断言而人工延长运动。两层分别提供浏览器回归及明确诊断入口。

### CB-10 — 自定义 Effect 模板与生成器

E04 预判"K0 在此 API_HALLUCINATION 概率高"成立(E01-b 8 build)。现状须手写"编译产物 JSON"(UBO statistics/builtins/attributes format 码表/hash 全手填)、无 chunk include、defines 初始化定死、glsl4→glsl3 三变体手工派生。交付:①effect JSON 正典模板 + `tools/`(或 `src/air/` 可选 helper)生成脚本——输入 GLSL 片段+uniform/attribute 声明表,输出可注册 JSON(含 hash/statistics 计算);②手册 custom-shaders.md 补"编译产物结构"一节与生成器用法;③注册时序结构化错误(联动 CB-07)。生成器属新代码,走 tools 自有纪律。验收:用生成器从零产出 E01 级点云 effect,一次注册可渲染;生成器单测锁 hash 稳定性。

### CB-11 — 批处理三路线 Recipe

官方 Recipe:共享网格×N 节点 / 合并静态网格(恒 1 draw call)/ 动态网格 updateSubMesh 三路线决策树 + 规模预算表(60fps ≤5 万 quad 保守、10 万锚点,E07 实测 1536 楼/84k 窗/70k 雨@54.7fps 背书)。收录 trap:自建几何必须 minPos/maxPos(否则静默剔除)、`primitives.quad` 恒 ±0.5、plane 生成 XZ 面、`createDynamicMesh` 非空初值+容量断言。落 Recipe 体系(`tools/benchmark/recipes/` 目录扩展或 manual Recipe),过 recipe-review-gate。验收:三示例各过 example 链路,预算表数字与本仓库实测对齐(不抄 bench 数字,重测)。

### CB-12 — 光照量纲与夜景基准

手册补统一换算表:directional/ambient/spot/曝光在 LDR(8–14)与 HDR(50,000 lux+exposure)两口径下的换算、SpotLight ×10000 系数、`clearColor/light.color` 赋值语义(不可原地改)、夜景基准值(ambient ~3800 + 月光 ~1900 lux,E06 实证)。与既有 lights.md HDR 纪律(主光根因定性节)对齐,不重复建页。验收:一张夜景示例用表中基准值一次到位(无"近黑→多轮调参"过程),示例进正典。

### CB-17 — Agent 自检对齐辅助

E02(24/24 vs 3/7)与 E05(双臂全绿 vs 0/6)暴露:Agent 自检复刻的是"对断言的理解"而非采样语义。交付:①`tools/debug/` 新增分区 litRatio 读数辅助(给定分区方案输出各区域亮像素占比,供任何验证器/自检复用 harness 口径);②断言语义文档:状态断言在动作后 sampleWindowMs 内采样、nonBlank 是分区占比阈值而非"非黑"、regionChange 需持续运动源、视觉密度预算公式(星点数×直径→每角占比)。注意本项不进默认运行包(开发工具纪律),Gallery 示例可显式选用。验收:辅助工具输出与 harness 独立像素复核在既有证据场景上偏差 <1%。

## 6. P2 能力面与长尾

### CB-19 — API 一致性长尾(12 条)

EB-19 全表逐条处置:quad 忽略 width/height、plane XZ 背面、`Quat` 无 `Quaternion` 别名且无实例方法、`clearColor/light.color` 赋值语义、`getScrollY=-deltaY×5`、`screenPointToRay` 双参数序、`getComponent('MeshRenderer')` 字符串查找、`Node.addChild` 不可链式、`fog.enabled` 先于 `fog.type`、minPos/maxPos 静默剔除、`createDynamicMesh` 仓库(utils)vs tarball(utils.MeshUtils)挂载不一致(此条 P1,涉及打包导出面,补 verify 断言)、双面材质 USE_TWOSIDE+cullMode 双开。处置分三档:可安全修(如 Quat 别名、quad 尺寸、字符串 getComponent 兼容)→修+登记差异;语义即如此→文档化进速查表;行为变更风险大→登记不修+手册明示。验收:12 条各有落档,`verify:consumer` 增加 tarball/仓库导出一致性断言。

### CB-20 — 实例化/点云评估

规模上限不差(E01 74.5k 点 60fps、E07 组合场景 54.7fps),缺的是一等公民 API 与 GPU 侧语义(逐实例动画=CPU 重写顶点、无 GPU 剔除、无 point-sprite 每粒子 4 顶点带宽 ×4)。产出评估报告:InstancedBuffer/Points 暴露成本、DynamicQuadBatch 组件封装(CB-11 的动态网格路线组件化)、3D 粒子系统范围;决议入 owner-decisions。批"做"则另立实施计划,不在本计划内展开。

### CB-18 — 基准场景收编示例

按 bench 冻结 Scene Spec(`briefs/E01..E10` 为可读合同)在本仓库重实现,优先:E01 点云(联动 CB-04)、E05 吸积盘(联动 CB-06 两档各有示例)、E06 篝火(CB-12/15 活例)、E09 折射(CB-01 活例)、E07 夜城(CB-11 预算活例);E04 烟花/E08 鱼群随 CB-11/20 决议跟进。每例走标准 example 流程(example.json 登记、spec 冻结、browser-matrix 取证),不拷贝 `reference/private/` 实现;若 owner 另批 bench 侧 §22.1 晋升,以正典对齐为准。验收:每例过 `verify:example-chain` 与 browser-matrix,Gallery 登记完整。

## 7. 复测与成效验收

### CB-21 — 修复成效复测

P0 修复与合同批完成后,在 bench 仓库按 `gates/G6.json` resumeProcedure 申请/登记新的候选构建指纹与运行条件,不覆盖历史冻结记录。固定模型/推理设置、提示词、工具版本、场景 Spec、预算和计量规则,分别观察代码修复与知识包改善:比较构建时保持知识条件一致,比较 K0/K1 时保持构建一致;若只运行修复后构建+K1,仅报告联合交付效果,不得归因为引擎修复单独收益。Pilot 4 对(E01/E02/E05/E10)预先约定重复次数,披露实际 N、原始计量、失败/诊断轮次与离散程度;token 不可可靠观测时标为不可用,墙钟统一起止和等待时间口径。AIR/three 工具调用比 ≤1.5× 是优化目标,本轮不作为 N=1 的硬门禁。记录首轮 build+验证通过率及 E02 采样失败是否消除,结果无论好坏如实回灌;未复测不得声称成本已改善。

## 8. 排序、交付和验收

1. **第一批:CB-01…CB-06 + CB-09 输入传播合同。** 先冻结完整构建/tarball 基线,再做已确认缺陷修复、输入异常恢复和最早违规边界诊断;CB-05 保持 P0 根因调查,CB-06 先出备忘录等 owner,不阻塞其他任务。发布版本另经 owner 确认。
2. **第二批:CB-07…CB-13(P1 诊断化)+ CB-17。** 与第一批共享《静默陷阱速查》手册页,合并交付一次手册重排。
3. **第三批:CB-09/10/11/12/18(Pattern/Recipe/示例)按依赖穿插**——CB-04 示例、CB-01 示例、CB-06 两档示例分别是 CB-18 的前置活例。
4. **第四批:CB-14/15/16/19/20(P1 尾部+P2)+ CB-21 复测收口。**

通用验收纪律:

- 每项交付:最小复现(或"未复现"结论+差异分析)、修复 diff、smoke/浏览器回归、影响面文档与示例;上游文件改动全部登记 file-map+UPSTREAM.md。
- 浏览器视觉项必须有截图与数值断言;typecheck/build 通过不构成视觉正确性证据。跨引擎项(Chromium/Firefox/WebKit)进 browser-matrix 合同。
- 新增/变更 npm script 时同步更新 AGENTS.md 脚本表(目的/输出/写行为)。
- 涉及 tarball 口径的(CB-05/19)以 `verify:tarball-consumer`/`verify:consumer` 为准;仓库内构建绿不替代 tarball 证据。
- 基准报告中与本计划相关的证据路径均位于 bench 仓库(`E:\AIProMax\Y2026M10\cocosairjs-competitive-agent-scenario-benchmark\` 下 `reference/private/`、`results/PAIR-*`、`gates/`);本仓库文档引用它们时写相对说明文本,不写跨盘 markdown 链接(避免 doc-refs 基线扰动)。
- 完成状态只由当前代码+当轮证据决定;本文件任何条目在台账落账前一律视为待办。
