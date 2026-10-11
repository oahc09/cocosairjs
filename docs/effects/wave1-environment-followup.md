# Wave 1 环境追查：R1

> 2026-10-10 更新：以下是原始失败与追查历史。R16 scoped WebKit 启动对照已恢复同页 compositor；R20 三效果、性能和 Gallery 当前全部通过，见 [当前十三项交付](wave1-resize-gallery-closure-delivery.md) 与 [正式 Gate](../evidence/shaders-absorption/wave1-r21-current-gate.json)。旧失败未改写。
> 2026-10-09。当前Wave仍BLOCKED，以下诊断不升级任何效果或Agent Gate。执行渠道分别记录，不把Lead结果冒称为Worker执行。

## Orca Worker：无SDK resize对照

实际执行`node output/shaders-absorption/worker-w1-r1-resize-env.cjs --out=output/shaders-absorption/worker-w1-r1-resize-env.json`，exit0表示诊断完成。三浏览器×SDK/native-WebGL两路径×四阶段，共24张真实page.screenshot PNG；Worker终态误写18张，Lead逐张解码/SHA/bytes核对实际24张，全部匹配。当前SDK/声明前后SHA一致。

WebKit26.6在无SDK单WebGL2 Canvas控制中同页640×400→480×320后，同样出现GPU红色而页面PNG白色；Chromium/Firefox两路径均保持红色。无SDK控制只作环境隔离，不计为Cocos能力PASS。该证据支持当前环境INFRA_FAILURE，不能泛化到所有WebKit/Safari或确定某个浏览器错误行。已有Runtime BLOCKED保留。

## Orca Worker：DPR最小配置及审查纠正

`worker-w1-r1-firefox-dpr.json`实际exit0：5个`setContent`最小实验得到请求DPR2与实际DPR2。脚本中名为COOP/COEP的实验未注入HTTP头，实际crossOriginIsolated=false，因此不能证明真实隔离导航与工具配置等价。Lead审查后要求R2补做真实HTTP/navigation/response-header链，错误描述分类AGENT_FAILURE，原报告保留。

## Lead：真实HTTP与时钟校准

实际命令`NODE_PATH=output/playwright/tooling/node_modules node output/shaders-absorption/lead-w1-r1-clock.cjs --out=output/shaders-absorption/lead-w1-r1-clock.json`，exit1，6行诊断。自有HTTP服务器确实交付COOP same-origin/COEP require-corp；页面实际crossOriginIsolated、DPR和原始时钟增量均保存。结束关闭所有自有browser/server，默认三个SDK产物SHA不变。

| 配置                          | 普通页实际DPR / 最小正增量 | 隔离页实际DPR / 最小正增量 |
| ----------------------------- | -------------------------- | -------------------------- |
| Firefox155默认                | 2 / 1ms                    | 1 / 约0.02ms               |
| Firefox155临时诊断preferences | 2 / 约0.02ms               | 1 / 约0.02ms               |
| WebKit26.6默认                | 2 / 1ms                    | 2 / 约0.02ms               |

临时Firefox启动preferences为privacy.reduceTimerPrecision=false、privacy.resistFingerprinting=false；只影响自有诊断浏览器，不改主机设置。启动接口见[Playwright官方文档](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-firefox-user-prefs)，时钟隔离/精度背景见[Performance.now文档](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)。具体数值来自本次实际校准，不从文档推断。

Firefox的请求DPR2在实际隔离导航后变为1，使两行valid=false，报告诚实exit1。它缩小到HTTP隔离/导航环境链，不证明Cocos或route.fetch必然有错；没有route.fetch的原生HTTP控制也发生，故不能仅归因为路由注入。

WebKit空页的约0.02ms正增量不等于原生效果GL派发阶段已具备同样精度，更不是该阶段成本。原E06 mobile约1ms、60个派发区间全0记录不改写。下一步需在实际效果页复核响应头、初始化前后时钟和原始派发调用。所有CPU stage在本校准报告标NOT_MEASURED。

R2继续验证相同页面/场景的可行呈现配置、Firefox隔离导航后实际DPR恢复与效果页初始化链；不改变冻结viewport/backing/PNG门槛，不推进Wave2。

## R2：真实导航对照与Lead复核

Orca Worker执行三个`worker-w1-r2-*`诊断，均exit0仅表示采集流程完成，effectGate仍NOT_RUN。Lead只读审核记录于`output/shaders-absorption/lead-w1-r2-review.json`。

真实HTTP矩阵24行中，Firefox155在COOP same-origin导航后由请求DPR2变为实际DPR1；COEP单独不触发。关键恢复观测：四条Firefox COOP行随后重新调用相同尺寸的`page.setViewportSize({width:390,height:844})`，均恢复实际DPR2和Canvas backing 780×1688；同时含COEP的页面仍crossOriginIsolated=true。此为原生控制页事实，真实Cocos效果页的恢复尚待验证，不接受以DPR1替代冻结DPR2范围。

WebKit26.6 headless/headed各两次resize对照仍为GPU红色、页面PNG白色。Lead逐张重算12张PNG的SHA、bytes和中心像素，全部匹配。结论限定当前Windows浏览器环境；有界面启动没有恢复呈现。

R2 Sparkle时钟对照实际使用640×400、DPR1、普通pacer页面，不是DPR2移动配置或`?test=1`性能页面。该对照在隔离页初始化后测得约0.02ms正增量，不能据此解释旧性能结果。旧`e06-performance-precision-attempt2.json`的WebKit mobile行已记录COOP/COEP、crossOriginIsolated=true及最小正增量1ms，因此Worker终态中“旧报告没有隔离头”的说明与原始证据不符，分类AGENT_FAILURE，原报告保留。下一轮需同配置比较真实HTTP与route交付，并保存完整时钟增量。

R3分工：Orca Worker在独立新输出中验证真实Thin Film页面的导航协议恢复、WebKit真实隔离页resize，以及E06移动test-mode时钟差异；Lead负责独立裁定和后续正式采集器集成。诊断期间不启动性能窗口，SDK和历史证据保持原样，Wave1继续BLOCKED。

## R3：实际效果导航恢复及数值复核

Orca Worker采集`worker-w1-r3-ff-dpr-repair.json`、`worker-w1-r3-wk-coop-resize.json`和`worker-w1-r3-sparkle-mobile.json`。Lead复核记录于`output/shaders-absorption/lead-w1-r3-review.json`；三份collector exit0仍只表示诊断完成。

Firefox Thin Film两次独立运行在实际`?test=1`页面导航后重设相同viewport，均恢复DPR2、780×1688 backing、COI=true。Lead用原独立CPU模型重算PNG和GPU七个可见采样点，最大误差1字节，未放宽原2字节容差。此诊断没有改变正式13点门槛，也不宣称全Visual Gate通过。Worker的100%非背景计数使用阈值已被clearColor [16,32,48]满足，不能证明效果；实际与背景不同的像素为286421/1316640。建议代码必须放在导航之后，与本次实测一致，不能按终态建议放在goto之前。

WebKit真实HTTP隔离/普通条件各两次活resize仍失败；Lead复算12张PNG身份和中心像素全部匹配。隔离条件没有恢复合成器呈现，Runtime BLOCKED保留。

Sparkle mobile对照观察到WebKit真实HTTP隔离约0.02ms、navigation-only route交付约1ms；Firefox隔离页仍DPR1。但脚本没有实际执行初始化前校准、未应用Firefox恢复，且route只覆盖navigation，与原E06全资源route不一致。因此只记录交付方式相关的观测，不宣称已精确复现原工具原因。下一步实施共用工具侧HTTP交付与导航后profile核对，再按独立时钟证据开展串行性能采集。SDK无需因这些环境观测而修改，Wave1仍BLOCKED。

## R4：工具实施及门禁审查

Orca Worker新增HTTP隔离与导航恢复工具、修改Thin Film性能分支，采集`output/shaders-absorption/worker-w1-r4-e02-perf.json`，实际9个profile有帧数据和非零派发计时；Worker collector与只读verify均exit0。此为Worker执行结果，不能取代独立验收。

Lead在`output/shaders-absorption/lead-w1-r4-review.json`记录原始数据核对及六种环境回执篡改。当前验证器仍接受缺失回执、错误DPR/高度/CSS/COEP和自报ok=false；新增测试复制校验函数，没有调用生产校验代码，并含常量true的关闭断言。HTTP参数删除还会破坏其余query分隔符，collector未调用隔离代理close，时钟增量仅保存first50。Lead新增16条生产合同回归，实际16/16失败，日志`lead-w1-r4-review-tests.log`保留。分类API_DX/AGENT_FAILURE，正式Performance PASS接线暂停，原始有效计时保留。

Worker报告删除了误运行的功能报告`worker-w1-r4-e02-performance.json`。该报告当前MISSING，不补造退出码或内容；后续必须保留所有失败/误运行尝试及其日志，不复用此路径。本轮正式Wave1仍BLOCKED，待修复生产门禁、清理和证据完整性后重新采集。

## R4B审查与R5冻结

Orca Worker的R4B报告记录9行采集PASS及27条合同测试PASS。Lead实际只读verify返回ok=false：`shaders-browser-environment.cjs`记录SHA 2e46aa8e…与当前f910753d…不符，报告不能作为当前证据；源审查还发现原functional分支的shader/PNG/core/边界/资源检查被删减。因此R4B保留为历史采集，未纳入正式PASS。

Lead恢复原有functional校验，在其上增补生产环境门禁、完整时钟统计、授权参数、真实release/page/server关闭回执；HTTP代理保留原始压缩字节与encoding，正确解析隔离参数，await实际profile完成。校验器改为延迟加载构建依赖，允许纯校验直接导入。新增Lead生产门禁回归，4套69/69通过（`lead-w1-r5-frozen-tests.log`）。首次测试因未配置NODE_PATH及jsdom导入esbuild失败，原日志保留；这些是测试工具环境问题，未宣称SDK故障。

当前输入冻结于`output/shaders-absorption/lead-w1-r5-frozen-inputs.json`，SDK三产物SHA保持原样。R5由Orca Worker仅执行冻结源码的串行采集，不再编辑源码。R4B事故记录进一步说明误运行报告及其artifacts均被删除，状态MISSING/ALSO_DELETED，无补造证据或补偿PASS。后续所有失败尝试必须保留。Wave1及Agent Gate状态不变。

## R5：Thin Film性能范围通过

Orca Worker执行冻结版采集器，OS exit0、signal=null，90874ms后自然退出。7个冻结输入前后SHA/bytes一致；实际9个performance profile均通过，mobile三浏览器均DPR2/backing 780×1688/COI=true。每页真实归还3资产引用1→0，解绑renderer/退役节点，app release与监听清理匹配，page/proxy/server关闭回执齐全。

Lead重新运行只读verify得到ok=true，独立17种篡改全部拒绝、零新增浏览器。当前轻量摘要：[E02性能环境复核](../evidence/shaders-absorption/e02-performance-environment-summary.json)，原始报告/OS驱动/完整日志/SHA链及CPU统计绑定其中。采集窗口6秒包含30帧预热，摘要按实际剩余帧数/时长统计，不冒称6秒全部为稳态；CPU派发不等于GPU时间、原生帧间隔不等于合成器呈现。此范围由Orca Worker执行、Lead独立复核。

E02的Performance当前范围PASS，效果及Wave仍BLOCKED（WebKit活resize），Agent Gate未运行。其它效果的旧性能限制仍保留，待分别实施同一工具侧环境改进并真实重新采集。

## R6/R6B：Sparkle采集工具审查未通过

Orca Worker交付新的Sparkle环境采集器，实施期间未运行浏览器或性能窗口。R6初版仍为exit2占位，Lead的15条回归实际9失败；R6B补出主体，原15条通过，但Lead进一步用完整、确定性的原始帧结构建立NODE_CONTRACT接受基线并做篡改，30条回归实际14失败、Jest exit1（`output/shaders-absorption/lead-w1-r6b-review-tests.log`）。这些夹具仅检验合同，不是浏览器证据。

R6B的`validateFiles`没有把数据失败纳入ok，缺失关闭/监听/共享模板清理以及错误状态、时钟计数仍能被接受。主体尚未把`stopPerformance`的原始数组转换为原Sparkle oracle所要求的60帧统计结构，实际release嵌套结构亦未正确接入。Worker自身测试基线只过滤oracle错误，并未完整接受，因此其28条通过不能证明采集合同成立。分类AGENT_FAILURE，待修复后再冻结输入授权采集；本阶段零新浏览器，E06旧性能限制与Wave1 BLOCKED保持不变。

## R6C/R7：Lead接手，Sparkle性能范围通过

Orca Worker在R6C期间因额度限制异常终止，未提供R6C完成回执。Lead保留其在盘部分实现快照，补齐真实原始帧统计、GPU查询退役覆盖、嵌套资产/模板/监听释放、raw JSON与行数据一一绑定及真实page/browser/server终态。测试改为确定性NODE_CONTRACT完整接受基线，逐项篡改前必须先接受；5套135/135通过。实现与本节采集渠道均为Lead，不冒称Worker执行。

冻结串行采集首轮exit0，进一步补强GPU退役空数组拒收后，保留首轮作为历史；最终重新采集`lead-w1-r7-e06-performance-final.json`，实际OS exit0、signal=null、48229ms自然退出，采前/采后完整输入身份一致。三浏览器×三profile全部通过，每行30帧预热+60帧稳态，mobile均DPR2/backing780×1688/COI=true。真实3份自有资产、2份共享模板引用均1→0，注册表退役、监听3→3、scene关闭、page/browser/proxy/server清理齐全。

Lead只读verify通过，独立重算9行CPU阶段与帧身份，32种内存篡改全拒，未新增浏览器。[E06性能环境摘要](../evidence/shaders-absorption/e06-performance-environment-summary.json)绑定实际OS驱动、完整日志、输入身份、9份raw文件与审计。Chromium支持实际GPU计时；Firefox/WebKit如实unavailable。CPU派发P50可能量化为0，摘要保留零样本数及实际时钟分辨率，不称零成本；原生AFTER_DRAW帧间隔不等于合成器呈现。

E06的此Performance范围PASS，原历史功能报告/失败尝试保持不变；WebKit活resize、Wave1及Agent Gate状态未升级。SDK源码和默认产物仍未修改。

## R8：Noise Dissolve性能范围通过

Lead复用工具侧HTTP隔离/DPR恢复，补充独立E01性能采集器，调用原例子的`performance(30,60)`和`timerResults`。效果实现、原采集器与历史证据未修改。2套51/51合同及旧Noise测试通过；首次临时文件夹具因Windows路径分隔符比较失败，日志保留，正确规范化后全通过。

冻结9配置实际OS exit0、signal=null、49446ms自然退出，完整输入身份前后相同。三浏览器720p/1080p/mobile全部满足冻结DPR/backing、真实COI与时钟校准；每行30帧预热+60帧稳态，原来5组派发计时全部为0的限制已由本轮实际非全零数组补齐。零样本数和时钟量化仍如实保留，不称零成本。Chromium GPU计时实测，Firefox/WebKit扩展不可用，不替代为CPU时间。

每页实际归还6份mesh/material/texture引用与1份EffectAsset注册引用，监听归零、原始方法包装恢复、终态调用拒绝、page/browser/proxy/server关闭。只读verify通过；Lead核对9行原始数组映射/帧身份，29种篡改全拒，未增加浏览器。[E01性能环境摘要](../evidence/shaders-absorption/e01-performance-environment-summary.json)绑定原始报告/OS驱动/完整日志/输入/9份raw JSON与审计。本例的原始计时已由例子内部按帧汇总，审计核对其映射，不冒称另有独立逐GL调用trace。

三效果的本轮补充Performance均9/9通过，不改写原冻结六维报告。WebKit活resize的原生WebGL控制仍失败，当前Wave1保持BLOCKED；不能用更高精度计时、fresh page或GPU回读补偿Runtime合成器缺口。
