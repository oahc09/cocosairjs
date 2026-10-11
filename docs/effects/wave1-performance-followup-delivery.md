# Wave 1 环境与性能补充交付

2026-10-09。本记录按任务十三项模板交付当前补充范围，完整Wave1仍BLOCKED。最初冻结的[阶段交付](wave1-delivery.md)和失败报告保留，不被本轮结果覆写。

## 1. Goal

补齐E01 Noise Dissolve、E02 Thin Film、E06 Sparkle的性能环境与证据完整性：真实HTTP隔离、导航后DPR核对、高精度原始时钟、原生帧计时与实际资源清理。执行渠道：E02最终采集为Orca Worker、Lead审查；E01/E06最终实施与采集为Lead。Worker的R6C异常终止没有完成回执，不能冒称该任务由Worker完成。

## 2. Upstream references

保持`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，参考源码与许可证见[来源索引](upstream-index.md)。效果算法、通知和参考字节未改；本轮不引入上游runtime或TypeGPU。

## 3. CocosAirJS APIs used

沿用三个原例的`createAirApp`、Scene/Node/Camera、Mesh/MeshRenderer、Material/EffectAsset、Texture2D、Component/update与原生gfx；工具仅观察原生调用、计时及释放，不添加渲染canvas或平行渲染器。

## 4. Implementation

保留共用`shaders-browser-environment.cjs`真实HTTP字节交付与导航后协议DPR恢复。新增E01/E06独立性能采集器，保留旧工具和历史identity；纯校验检查冻结9tuple、时钟原始增量、实际snapshot、帧数组、GPU查询、清理及raw SHA/行绑定。CLI要求显式新输出和Lead串行窗口标识，拒绝覆盖，`--verify`只读。过程记录见[环境补充](wave1-environment-followup.md)。

## 5. Tests

完整库存真实运行并登记131套1338项，1334通过、4失败、exit1，见`output/shaders-absorption/lead-w1-r9-inventory.log`及driver JSON。新增6套147项全部通过，当前10套Shader合同共258项通过；合成夹具明确NODE_CONTRACT，不作为浏览器正例。4失败仍为smoke-29规格/合规/Gallery字段及smoke-30矩阵产物身份，不称全库全绿。全量测试生成的合规attempt已保存，原正典恢复为执行前完全相同字节。

## 6. Screenshots / visual evidence

本轮性能窗口不执行截图/readPixels，不重标历史Visual为新采集。原CPU数值oracle、GPU与compositor PNG视觉证据保持原记录。WebKit原生WebGL、SDK、headed/headless及实际HTTP隔离控制均未恢复同页活resize呈现，GPU正确不能补偿页面PNG失败；这是当前Windows/WebKit26.6环境观测，分类INFRA_FAILURE，不泛化到其它设备或计为引擎失败。

## 7. Performance evidence

| 效果 | 最终实际执行渠道 | 补充范围 | 只读审计 | 证据摘要 |
| --- | --- | --- | --- | --- |
| E01 Noise Dissolve | Lead | 9/9 PASS，OS exit0，49446ms，输入不变 | 29种篡改拒绝 | [E01](../evidence/shaders-absorption/e01-performance-environment-summary.json) |
| E02 Thin Film | Orca Worker | 9/9 PASS，OS exit0，90874ms，输入不变 | Lead独立17种篡改拒绝 | [E02](../evidence/shaders-absorption/e02-performance-environment-summary.json) |
| E06 Sparkle | Lead | 9/9 PASS，OS exit0，48229ms，输入不变 | 32种篡改拒绝 | [E06](../evidence/shaders-absorption/e06-performance-environment-summary.json) |

三个范围均为Chromium/Firefox/WebKit×720p/1080p/mobile DPR2；全部实际COI和backing核对，浏览器进程自然退出。E01/E06精确30帧预热+60帧稳态；E02六秒总窗口包括预热，按实际剩余稳态帧统计。CPU更新、gfx编码包络、GL draw CPU派发、Queue记账、原生帧间隔分开。Chromium实际GPU计时，Firefox/WebKit扩展不可用。零CPU样本是时钟量化下界，不是零成本；不推断普适FPS预算或物理VRAM。

## 8. Resource/lifecycle evidence

各性能页面都实际释放、校验并关闭。E01逐页6份自有资产+1份EffectAsset引用归零，registry退役、方法包装恢复、监听归零、终态拒绝；E06逐页3资产+2模板引用归零、registry退役、监听3→3、幂等同一Promise；E02逐页3资产引用归零、renderer解绑、节点/监听清理。page/browser/proxy/server关闭回执与OS退出码独立记录。性能释放检查不冒称再次完成历史百轮Resource验收。

## 9. API/DX gaps found

INFRA_FAILURE：Firefox隔离导航DPR降级、WebKit交付方式相关时钟精度及活resize合成器缺口。AGENT_FAILURE：错误诊断口径、删掉误运行产物、占位collector、接受无计时数据或返回错误却ok=true；失败日志与MISSING/ALSO_DELETED事实保留。API_DX：Queue.submit记账与立即GL执行语义、时钟量化解释。未新增确证ENGINE_BUG；Agent Benchmark仍NOT_RUN，基础设施失败不计入Engine/Agent失败。

## 10. Workarounds used

真实HTTP COOP/COEP交付替代route.fulfill注入；实际导航后同viewport协议重发，并核对DPR/backing/COI。未改`devicePixelRatio`或`performance.now`，不以fresh page、导出图片或额外canvas补偿WebKit live-resize。只读审计不新增浏览器，失败尝试不覆写。

## 11. Proposed engine changes

本轮引擎源码、公共API、默认SDK产物零修改，SDK SHA保持原样。没有证据支持为这些环境/采集问题修改引擎；更多真实消费者完成后再评估诊断API与编写帮助，不提前抽象公共效果框架。

## 12. Validation status

补充Performance共27/27 PASS，三份当前只读verify全部ok=true，78种篡改拒绝；本轮SDK/source无漂移。完整Engine/Wave1为BLOCKED，原因是未达的WebKit live-resize Runtime；不是引擎失败。Wave2–7未推进，Agent Gate NOT_RUN。完整库存exit1，不宣称release readiness；未暂存、提交、推送或部署。

## 13. Known limitations

当前Windows/WebKit26.6合成器前沿尚未恢复；其它操作系统/物理移动设备、长时干扰、GPU物理内存和独立Agent Benchmark未测。E01现有例子按帧汇总CPU数组，审计核对映射而非独立逐调用trace。旧冻结功能报告与新性能范围是独立证据，不能简单覆盖历史输入身份或将subset改为完整PASS。
