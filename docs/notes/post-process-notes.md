# 后处理与 custom pipeline 边界调查

当前默认构建包含 custom pipeline / post-process 代码与导出。2026-10-04 Lead S30已完成owner #6(b)隔离变体的三效果×三浏览器9项真实像素A/B、逐效果恢复及资源归还，正式子集报告PASS，详见§13。实验仍需独立资源库、布局和运行时包装，不表示默认SDK开箱支持后处理，也不表示完整EG4/发布验收通过。§1–§4保留历史调查，不作为当前注册面的结论。

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

> owner-decisions **#6 = D11 批复 (b)**：「只做变体构建级证据（不改默认）」。
> 本文为批次 H 笔记（计划书 §3 批复落点要求的建档），r46 建立。

## 1. 代码面（此前已实测，r44/r45g 口径）

- `cocos/rendering/post-process` 34/34、`cocos/rendering/custom` 25/26（1 个 jsb 变体按 §1.3 排除）与上游**逐字节同**；
  两个 feature unit（`custom-pipeline`、`custom-pipeline-post-process`）的 `src/exports/*.ts` 与官方同名文件逐字节同。
- 门禁 `npm run verify:custom-exports`（C1–C5，r45f 建立）持续 EXIT=0，把上述事实固化为只读不变量。
- 默认 `AIR_FEATURES` 已含 `custom-pipeline-post-process` ⇒ 后处理代码在默认 bundle 内（产物面 verified）。

## 2. 运行面不可达的三闸门（D11 根因，维持原判）

1. `src/exports/custom-pipeline.ts` 已并入 bundle 但无人 import（聚合出口不触发运行时注册）；
2. `game.ts:789-805` 在无 Creator 资产管线时显式清 `cclegacy.rendering`；
3. `director.ts:831-843` 需要 `CUSTOM_PIPELINE_NAME` 设置才装配自定义管线。

三者叠加 ⇒ Code First 发行姿态下后处理组件 API 全部可往返、但管线本体不可达（`diffPixels=0`，r44 §6.3）。

## 3. r46 批复执行结果

- **(b) 档 = 变体构建级证据**：构建面已由默认 bundle 覆盖（`custom-pipeline-post-process` 在默认集内，
  `build`/`build:min` EXIT=0，r46 新基线 `cb89ea808968596d`/6,599,938 B）；代码/导出面由
  `verify:custom-exports` 与 `verify:feature-exports` 持续锁定（两者 r46 全量门禁复跑 EXIT=0）。
- **像素级 bloom/fxaa/color-grading 开关对照未交付**：其前置是 custom 管线运行时可达，
  而 (a) opt-in（`createAirApp` 增 `pipeline: 'custom'` 或暴露 `CUSTOM_PIPELINE_NAME`）属默认行为变更，
  owner 已批复不执行 (a)。此项按计划书「状态如实」纪律记 **not-delivered（显著标注）**，不阻塞 V1.2 Gate（同 D8 口径）。
- 复启条件：owner 未来批 (a) 或上游提供 Code First 管线注册入口时，沿本文 §2 三闸门逐个解除后
  补 `examples/post-process-basic` + 三引擎开关对照。

## 4. 明确不声称的

- 未产出任何后处理开/关对照截图（`docs/evidence/browser-matrix/` 无 post-process 帧）；
- 未验证 taa/hbao/dof/fsr 在任何后端的运行表现；
- 默认发行产物行为与 r45 期完全一致（legacy 管线，无后处理）。

## 5. S21 隔离变体前置验证（2026-10-04，Lead 实际执行）

沿owner #6(b)执行，不新增默认管线选项。显式`AIR_FEATURES=air,base,gfx-webgl2,gfx-empty,3d,primitive,custom-pipeline,legacy-pipeline,custom-pipeline-post-process`、`AIR_OUT_DIR=output/playwright/post-s21-build`构建EXIT=0；变体SHA为`647f1c0decc22bb8936c524956adb22b11d3e3c4f419ad01f88e84e7963ce7b4`。默认unmin、d.ts、npm字节在前后20输入指纹检查中不变，没有抽取源码修改。

[实际三浏览器报告](../../output/playwright/port-s21-post-prerequisites.json)及[原始日志](../../output/playwright/port-s21-post-prerequisites.log)记录Chromium 149.0.7827.55、Firefox 155.0、WebKit 26.6和实际加载URL。原生`rendering`/`settings`/`postProcess`存在，`getCustomPipeline('Custom')`确实返回`PostProcessBuilder`。只在该变体页面用现有原生settings设置customPipeline=true、macro名称Custom；初始化后rendering保持。历史“无人import所以注册不可达”的判断不能用于当前产物，也不能推断必须新增AIR公开选项才能验证该配置。

三浏览器均读回effectSettingsPath=null、effectSettings.data字节数0；日志出现`Effect settings not found, effects will not be imported.`，随后builtin材质初始化在`Pass.resetUBOs`因shaderInfo为null拒绝createAirApp。pageerror为0是因为探针捕获了Promise失败；实际init仍是FAIL，不能据零pageerror宣称成功。

[静态资源清单](../../output/playwright/port-s21-post-resource-inventory.json)解析当前21份builtin effect元数据，确认下列名称均不在清单中；三浏览器实际注册查询也全部为false：

| 原生阶段需要的资源名 | 当前情况 |
| --- | --- |
| `pipeline/post-process/bloom` | 缺失；已有`pipeline/bloom`属于另一资源，不能直接视为等价 |
| `pipeline/post-process/fxaa-hq` | 缺失 |
| `pipeline/post-process/color-grading` | 缺失 |
| `pipeline/post-process/blit-screen` | 缺失 |
| `pipeline/post-process/post-final` | 缺失 |
| `pipeline/float-output-process` | 缺失 |

这是已定位的资源/初始化前置缺口；资源名来自当前原生pass源码，布局数据读取来自`core/effect-settings.ts`与`rendering/custom/index.ts`。下一步须提供或生成与冻结引擎同版本、可追溯的layout graph数据及原生effect资源，再执行同一变体的真实A/B。现有证据不授权改默认行为，也不把手工quad或legacy bloom当作补偿。

采集器实际EXIT=1：Bloom、FXAA、ColorGrading三项像素范围均未运行，报告NOT_RUN/subset=true/completed=false；三次原生init失败另列原始错误堆栈与日志。截图只是失败页面留档，未作为效果证据。NP05与PG-32未完成。

## 6. S22 冻结上游资源来源核对（2026-10-04，Lead 只读执行）

§5列出的六项effect原始源码均存在于本机冻结上游`E:/AIProMax/github/cocos4/editor/assets/effects/`，实际HEAD为`557b06f7e636572a15a426eb8c2387f40b92798a`，与项目固定基线一致。它们只是原始`.effect`，不表示已具备运行时编译元数据或layout graph二进制。

[来源及包含清单](../../output/playwright/port-s22-post-source-closure-final.json)与[实际命令日志](../../output/playwright/port-s22-post-source-closure-final.log)记录六资源及29份effect/chunk的逐文件bytes/SHA；全部是该提交跟踪文件，目标工作区无差异。首次文本扫描将`#include <ubo>`按物理chunk处理，初始结果保留；复核确认它引用color-grading同文件的`CCProgram ubo`，最终遍历按该命名空间处理，missingIncludes=[]、实际EXIT=0。这里只验证源码的文本包含关系，未执行shader编译、GLSL反射或GPU效果。

本仓和上游的`createRequire`均无法解析`@cocos/effect-compiler`或`effect-compiler`，记录为这两个候选模块的NOT_CONFIGURED，不据此断言机器上不存在任何其他编译器。下一步在隔离范围寻找可复用、匹配固定基线的编译工具链，生成原生effect的descriptor元数据及官方布局数据；源码存在或YAML可解析不能代替该前置。S21像素未运行结论不变，不修改默认SDK来绕过资源编译。

## 7. S22 工具链实验与审查边界（2026-10-04，Orca Worker执行、Lead只读复核）

Orca Worker的`NP05-S22-ISOLATED-TOOLCHAIN`终态找到本机`cocos-cli@0.0.1-alpha.30`工具链；全局包的createRequire实际解析到`D:/Work/Github/cocos-cli/dist/core/assets/effect-compiler/index.js`，SHA40dda059…；shdc-lib SHA386c47d6…。包名/版本及路径可核对，但不能仅据这些信息认证其官方发布来源或与冻结引擎完全兼容。

[工具链报告](../../output/playwright/port-s22-worker-toolchain/port-s22-worker-toolchain-report.json)记录六个原生effect编译成功、11个shader均带4-rate descriptors，沿冻结引擎布局/归档实现生成1715字节effect.bin，SHA7e5ae6bd…；序列化回读21个pass查询均找到。Node编译/布局阶段使用明确披露的constants/core/platform/PAL依赖替身和math求值顺序变换，不认证真实浏览器渲染。skipParserTest=true也不证明GLSL已在GPU编译成功。[驱动记录](../../output/playwright/port-s22-worker-toolchain/port-s22-worker-toolchain-driver.json)的17组输入SHA经Lead比对全部一致，默认unmin/d.ts/npm未改变。

[Chromium实验](../../output/playwright/port-s22-worker-phaseB.json)实际EXIT=1：六效果注册查询命中，effectSettings.data=1715字节，但createAirApp仍在Pass.resetUBOs失败，像素A/B未运行。Lead审查发现该探针先加载带main.ts的六配方页面（会导入默认SDK），随后再导入变体；因此此页含两个引擎入口，不能把失败唯一归因为builtin metadata。下一步在仅包含GameCanvas的无脚本页面只加载隔离变体，记录实际所有模块请求、完整堆栈及失败effect/pass/shader，再补齐该变体初始化所需的原生builtin编译元数据。既有失败记录保留，不覆盖、不修改默认SDK、不将legacy bloom别名为原生post bloom。

## 8. S24 单引擎初始化与首帧失败（2026-10-04，Orca Worker执行、Lead审查）

[单引擎初始化报告](../../output/playwright/port-s24-worker-init-chromium.json)实际Chromium createAirApp resolve、usesCustomPipeline=true，0默认SDK请求；3118字节布局SHA2358dbb4…、26份编译资源（20 builtin加6 post）、54个shader带descriptors，来源仍为本机cocos-cli实现。实验运行时包装EffectAsset.prototype.onLoaded，仅按program名称向旧builtin shader注入descriptors；这段注入是应用/实验身份的一部分，不等于SDK647f1c0d…单独已可运行。Node工具链替身未进入浏览器，但运行时有显式包装，不能省略该边界。

初始化报告中六post资源的注册查询实际全部false；float-output-process在工具库中还缺pipeline/前缀。没有将六份资源注册到浏览器，仅有编译库/布局不足以创建其Material。console保留TexCoords/PbrParams块不匹配及未使用legacy程序错误；descriptor-only合并没有证明整个shader ABI一致。

[首帧与A/B原始报告](../../output/playwright/port-s24-worker-ab.json)记录172次pageerror，首个错误为undefined读取localSetLayout；executor.ts:487实际先取blit.material.passes[blit.passID]，因此出错对象是不存在的pass，不是已经存在的pass拥有缺失localSetLayout。BasePass使用pipeline/post-process/blit-screen创建材质，须先核对资源及实际pass/program；不能从该异常直接断言缺少管线资源图。

原始runner在空白基线/三个changedPixels=0下仍返回MEASURED/EXIT=0，且ColorGrading无LUT、未关闭实际app。该原始结果按失败尝试保留，不能规范化为像素PASS；三个效果仍NOT_RUN。下一批使用完整编译元数据及原生资源注册，明确所有资源名、启动覆盖顺序、pass存在/ABI一致，先取得无渲染错误且有已知几何的真实GPU基线，再执行具备非平凡LUT的原生A/B。所有新实验写独立路径，默认SDK与历史报告保持原样。

## 9. S25 注册存在但program尚未建立（2026-10-04，Orca Worker执行、Lead源码复核）

[S25报告](../../output/playwright/port-s25-worker-init.json)六post注册/descriptors门槛为true，但materialPassesValid、realDrawProven、initOk均false。首例float-output-process program查找phaseID52时phases.has=false，已知group为1/3/4/9/12；GPU readPixels和三效果A/B均未执行，Firefox/WebKit未运行。默认三产物未改变。

[布局回读](../../output/playwright/port-s25-worker-toolchain/port-s25-worker-toolchain-report.json)记录copy-pass的passId为51，不是worker文字所述52。顶点审计读取j(v).name导致名字为空、读取不存在parent而未记录父节点，不能据此证明52类型或要求Editor图。应直接用lg.getName/getParent/h及getCustomPhaseID查询完整pass/phase关系。

Lead源码复核发现明确的时序假设：effect-asset.ts:346在设备未初始化时将program注册推迟到EVENT_RENDERER_INITED；game.ts在Subsystem载入布局后、Project建立管线时会触发FloatOutputProcess材质初始化，直到setRenderPipeline返回才发出renderer事件。S25页面在createAirApp前onLoaded预注册六post，资源查询成功并不保证program已经注册。可通过现有onPreProjectInitDelegate在设备/布局已就绪且管线建立前调用真实onLoaded实测，无需先猜外部Editor产物缺失。

另有两项未收口：S25包装使用跨effect全局shader名map，原始注入列表仍向legacy pipeline/bloom注入4次，与不得跨资源替代的要求冲突；应改为按完整effect名隔离匹配并拒绝歧义。Worker文字报告采集EXIT0，但当前驱动exitCode初始化1且无置0分支、JSON没有execution/exitCode，实际运行退出记录尚不足；不从报告存在推成功。下一批修正注册时机/完整ABI/计数与退出记录，既有失败不覆盖。

## 10. S26 三浏览器首帧与效果验收边界（2026-10-04）

Orca Worker的`NP05-S26-REGISTRATION-TIMING`终态及三份init-draw报告显示：现有pre-project delegate在设备/布局就绪后重注册完整编译资产，三浏览器createAirApp及真实GPU首帧通过，中心白色几何读回229/229/229/255，0 pageerror、0默认SDK请求、delegate已移除、app.close实际完成。默认三产物未变，仍需把wrapper/资源库/layout归入独立实验应用身份，不认证默认SDK自带后处理。

Lead的[只读审核](../../output/playwright/port-s27-root-s26-review.json)实际逐文件核对三份报告各6个记录输入及默认前后SHA全MATCH、读取截图并检查代码，未增跑浏览器。Bloom辉光与FXAA边缘差异确有原始像素观察，但整体效果PASS暂不收口：fullScopePass只要求abMeasured.bloom，未纳入FXAA/ColorGrading/cleanupClosed；每效果restore只关开关，未采集回到基线的图像；driver/LUT字节指纹缺失，command未包含browser选择。

ColorGrading原生square shader固定SIZE=512、TOTAL=64，所谓8x8是64个tile布局；S26上传8x8像素纹理不满足此合同。三引擎截图一致把黑背景0变为126灰、白几何229变为155/108/60，不能当作所称通道循环置换。应生成真正512x512 LUT（或满足Nx1合同的完整3D颜色格），验证identity/contribute0与非平凡映射、真实彩色输入及预期输出，不仅凭172800差分像素认定成功。保留S26报告原样，待修正采集门槛/应用身份/资源清理后再纳入正式EG4；PG-32/NP05仍未完成。

## 11. S27 语义像素与门禁复核（2026-10-04）

Orca Worker执行`NP05-S27-SEMANTIC-AB-AND-CLEANUP`，外层驱动记录三浏览器probe实际EXIT0及原始日志；本次512x512 LUT符合64 tile尺寸，实际Bloom辉光、FXAA边缘变化、六颜色通道置换已有原始GPU观察。Lead的[只读复核报告](../../output/playwright/port-s28-root-s27-review.json)及[日志](../../output/playwright/port-s28-root-s27-review.log)逐文件核对所有已记录输入和默认三产物SHA一致，新增浏览器执行0。报告中尚缺probe/checkgate/LUT算法文件等实际执行输入的完整指纹；独立SDK、资源库、布局及运行时包装须共同纳入实验身份。

恢复截图存在实际未通过项：Firefox的bloom-restore与baseline仍有48,757个RGB差分和大于12的像素、最大通道差255，与bloom-on一致；另两引擎该恢复帧完全回到基线。三引擎FXAA及最终restore均零像素差。不能用最终restore代替各效果的恢复验证。app.run在已有pause调用后启动，当前controlledTicks标志也未证明自动时钟停止；须在run之后暂停并实际记录帧计数、同步读回与截图呈现状态。

CPU oracle的lookup.zx/lookup.wy坐标使用了交叉的row/col，且使用最近纹素近似。原报告灰阶预测156/189/156、实测157/159/157，误差30被同值容差接受。Lead按冻结shader坐标和双线性采样独立重算，灰阶预测157/158/157；六颜色相对原始实测误差0–2。此重算仍沿用原transfer模型，正式验收须说明实际管线transfer、采样器与预先固定的量化误差界限，不能为接受实测而放宽容差。identity LUT当前最大通道差3，29,764个像素存在小幅差异，不能写成逐字节相同；contribute0为真实零差。

Lead直接require当前checkGate，对真实报告作内存篡改，三引擎各七种错误仍被接受：灰阶改坏、六oracle行全部删除、LUT释放后引用数改成9、实际appClosed改false、identity差分改成全帧、contribute0差分改成全帧、六个GPU颜色全部改白。门禁读取oracleHits/negativesStable/cleanupClosed等派生标志，未独立核对原始数值；节点清理仅是destroy调用后的名字列表，不证明实际终态，也未记录mesh/material所有权归还。原汇总effectsTotal=3混用了跨浏览器单位，正式范围必须为3效果×3浏览器=9项。

S27原始报告及失败尝试保留，完整EG4/PG-32/NP05继续未完成。下一批仅在新的隔离输出范围修正oracle、每效果恢复/截图时序、资源清理数值、执行输入指纹与门禁拒绝语义；不改变默认SDK，不将本机cocos-cli定性为已认证的官方发布工件，GPU内存仍unavailable。

## 12. S28 采集器接线复核（2026-10-04）

Orca Worker的S28状态报告明确未全达。Lead[只读复核](../../output/playwright/port-s29-root-s28-review.json)与[实际日志](../../output/playwright/port-s29-root-s28-review.log)新增浏览器执行0，三份现存报告在当前checkGate均FAIL；Firefox/WebKit还保留cleanup空组件错误，不能认证本轮三浏览器采集完成。Chromium当前截图与实际LUT字节重算六点误差为0/0/2/0/1/2，蓝色25的文字结论不适用于这份现存截图。

接线问题已定位：patch记录未保存x/y却用于bbox角点投影；统计读取旧cubePngBbox/patchNodesLivePng，而当前报告写brightCubeBbox/patchNodes[].bbox；preProjectRemoved实际在observation为true，门禁却读取顶层。driver当前缺sha/crypto定义且输出读取未定义allPass，报告sha256AtEnd=null表示未记录，不是已证明漂移。应使用现有公开game.isPaused()/director.getTotalFrames()记录暂停与自动帧停止，不能读取不存在的paused/frameCount后写flag-unavailable。

门禁仍要求报告没有序列化的LUT/oracle输入；GPU六点只拒全黑、不校验约定颜色，mesh/material归还仍是赋常量true。当前测试把LUT SHA字段改坏后命名为PNG SHA drift，也未校验文件字节；对已经FAIL的基线做篡改不能证明特定规则拒绝。新S29将用一致的记录结构、实际资源租约数值及文件/PNG校验收口，保留S28历史文件原样，完整EG4仍不提升PASS。

## 13. S30 原生三效果像素子集完成（2026-10-04，Lead实际执行）

Orca Worker S29终态明确三引擎probe EXIT1、报告未产出；拷贝遗留的Node/page作用域、重复状态函数及字段不一致尚未修复。Lead在新的port-s30-root范围接手采集器，未修改S21–S29历史文件、抽取源码、构建工具或默认产物。[正式EG4子集报告](../evidence/port-gap/eg4-native-post-s30.json)执行PASS，9项已测/0跳过，subset=true/completed=false；完整门禁保持单独记录。实际三次执行命令及各自EXIT0、浏览器版本、开始/结束时间、stdout/stderr与report SHA保存在各浏览器execution.json和process.log，不把规范化脚本成功当作浏览器执行。

[汇总记录](../../output/playwright/port-s30-root-summary.json)绑定相同隔离SDK647f1c0d…、3118字节布局2358dbb4…、完整资源库948a3f8b…及应用包装/算法；每浏览器23个输入逐文件bytes/SHA前后相同，0默认SDK混入、0 pageerror。注册使用现有pre-project delegate重导26资源、启动旧builtin注入仅同资源匹配、六post精确资源及实际材质pass/program均通过。Node工具链shims未进入runtime，本机cocos-cli发布来源及版本兼容性限制保留，未使用legacy pipeline/bloom别名。

| 原生效果 | 三浏览器相同的实际结果 |
| --- | --- |
| Bloom | 48,757个显著差分像素；亮立方体外30像素环带平均亮度增加100.7266，几何/辉光范围外的远角样本增加0 |
| FXAA | 540个显著差分像素，全部位于基线图像确定的3像素可见边缘邻域；平坦内区、远角、边缘之外变化均0 |
| ColorGrading | 合法512x512/64 tile LUT；红→蓝、绿→红、蓝→绿，黑/灰/白六中心CPU独立预测全部误差0；26,036个显著差分像素 |
| 恢复与负例 | 每效果restore及contribute=0逐像素零差，包括Firefox Bloom；identity LUT最大通道差3，29,764个像素有小幅差异，如实披露 |

CPU模型纠正：FloatOutputProcess的RGBA8输出已先经过其tone/gamma阶段，ColorGrading随后直接采样该输出，post-final仅复制。故该LUT oracle使用off字节归一化、冻结shader的lookup.zx/lookup.wy与实际双线性过滤，不再附加sRGB decode/encode；冻结gamma.chunk自身使用平方/平方根，也不是IEC sRGB曲线。此前模型得到的0–2近似误差不作为精确合同，S29蓝色25归因未被原始图像支持。原生shader的蓝轴255/4与LUT的63级格点解释identity最多3字节差异，不声称该identity LUT逐字节恒等。当前固定六色预测容差为1字节，实际为0；不外推任意颜色空间或资产LUT。

run之后使用公开game.isPaused()、director.getTotalFrames()；每状态固定3次手动tick，同次GL readPixels后等待2个浏览器呈现帧，期间引擎总帧数不变。27张真实PNG与六中心GL读回逐点一致；文件校验重新解码PNG、计算区域/差分/oracle，并拒绝SHA/bytes或结果不符。节点与16份自持资产（7 Mesh、7 Material、2 Texture2D）按创建时对象身份记录，解绑后逐份归还1→0；app.close返回released、所有自有节点/场景/资产实际isValid=false，wrapper恢复、delegate已移除。运行时新资产uuid为空如实保留，以独立对象及实例编号识别，不伪造引擎UUID；借用builtin未强制释放。GPU分配量仍unavailable。

[门禁回归](../../output/playwright/port-s30-root-regression.json)先接受3份真实成功报告，再逐引擎34项单点篡改，共102项全部拒绝，浏览器新增0。包含原始灰阶/空oracle、引用未归零、未关闭、六色全白、NaN/Infinity、丢restore、代码/LUT/PNG指纹漂移与数值伪造等。Root首轮Chromium因错误远角/外框定义及空UUID假设被拒，原执行和5份执行源码归档保留，并明确由后续真实Chromium成功补偿；未隐藏失败或调整像素阈值放行。

Orca Worker只读复核实际执行了三份validateFiles和十份schema校验，未重跑浏览器；其收口回执混入S19的36行/29篡改计数与过时NP05措辞，且引用/restore篡改使用schema而非像素校验器，相关结论不作为S30证据。Lead[补充只读复核](../../output/playwright/port-s30-root-review-closure.json)直接读取三浏览器原始PNG，用另写CPU公式独立对照18颜色采样全部零误差；对真实报告四类篡改每引擎重新调用validateFiles全部拒绝。另核对S30实际3基线/102篡改、29正式输入SHA、17组件及首轮5份源码归档，新增浏览器执行0。执行渠道明确区分，不将Lead补核冒称Worker执行。

owner #6(b)原生三效果像素交付在此限定范围已完成。此结果不改默认管线，不认证其余后处理效果、完整能力/部署矩阵、GPU无泄漏或外部应用；PG-32及完整EG4剩余范围继续在总台账与门禁记录中披露。
