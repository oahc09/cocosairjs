# Wave4 首轮候选：历史十三项交付

本文保留首轮候选的 BLOCKED 裁定与当时测量。2026-10-11 后续已完成当前 SDK 全链刷新，[最新交付](current-sdk-refresh-delivery.md) 与 [Wave4 当前 SDK Gate](../evidence/shaders-absorption/wave4-current-sdk-r2-gate.json) 为 PASS、nextWaveEligible=true。以下旧身份、计数与前置失败属于历史，不作为当前结果。

## 1. Goal

2026-10-11：四个原生组合在当前 SDK 下均完成六维 Engine 验收。四组合子集 PASS 与整个 Wave 的前置条件分开：[Wave4 当前门禁](../evidence/shaders-absorption/wave4-current-gate.json) 的 combinationGate=PASS、status=BLOCKED、nextWaveEligible=false。前置 Wave3 的源码/SDK 身份校验不通过，不能进入 Wave5。

## 2. Upstream references

固定 shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。四组合分别绑定实际母效果源码、helper、许可与获取回执，共享引用按各叶级闭包核对。都是本地组合设计，不声称上游提供同名预设，不执行上游 runtime 或 TypeGPU。

## 3. CocosAirJS APIs used

原生 Scene/Node/Camera/MeshRenderer/Material/EffectAsset、createAirApp/createStepClock/createAirRenderTarget、Texture2D、utils.createMesh。渲染、诊断与中间纹理均属于同一个 GameCanvas 与 Cocos 上下文；没有第二渲染 Canvas 或外部渲染器。

## 4. Implementation details

| 组合               | 实际管线                                               | 当前身份闭包  |
| ------------------ | ------------------------------------------------------ | ------------- |
| C01 Laser Card     | Holographic→RT→Emboss→RT→Sparkle；Emboss 旁路3→2遍     | 38输入+11参考 |
| C02 Film + Neon    | 共享中心 SDF，保留两母算法，线性 source-over，一遍输出 | 34输入+6参考  |
| C03 Glass Trail    | 真实轨迹→512B点纹理→RT→Glass；每正dt帧一次上传         | 36输入+8参考  |
| C04 Input Dissolve | image/procedural/rendered 三异源输入→溶解              | 30输入+3参考  |

CPU oracle、透明线性读回和 compositor PNG 分别验证；只在格式转换处应用量化/钳位，一次显示 OETF。±2数学容差未放宽。

## 5. Tests performed

执行渠道：Orca Worker 小三完成各初稿及多轮合同修复；Lead 完成独立实际审查、最终修复与浏览器/性能采集。Worker 额度中止是 INFRA_FAILURE，不冒称其后续任务已执行。

C04四套聚焦88/88、Wave4状态隔离合同19/19通过，strict检查与实际bundle成功。C01/C02/C03本轮是现有源码的重新采证，未再次改算法或重复其已经通过的全套Jest。合成fixture只证明NODE_CONTRACT。

实际接受基线上的 structuredClone 篡改：C01 56、C02 44、C03 65、C04 44，合计209/209拒收。C04叶级Gate16/16、Wave4汇总冻结真实状态12/12拒收；NaN保留数值，不经JSON转换为null。没有额外浏览器运行。

## 6. Screenshots / visual evidence

三浏览器、四组合合计72维、198标准视觉、990参数边界、75非法输入整批拒绝、18同页活resize、234 compositor PNG。PNG包含标准案例、时间双拍与resize，不是234算法案例。三个浏览器分别为 Chromium149.0.7827.55、Firefox155.0、WebKit26.6。

## 7. Performance evidence

当前54串行窗口：C01/C02/C03各9，C04 27；17536稳态帧（2953+2901+2952+8730），计时readPixels=0。所有窗口使用冻结720p/1080p/mobile-DPR2与实际HTTP隔离/DPR修复，保留完整正增量及实际pass/draw/update与释放证据。Chromium GPU timestamp可用，Firefox/WebKit记录不可用。

CPU更新、命令包络和GL dispatch含插桩，不称无插桩基准；AFTER_DRAW不是显示帧率。模拟mobile不是实体iPhone；物理GPU内存不可用。逐路线数值见各交付，不从一次窗口推导质量档或融合的普遍收益。

## 8. Resource/lifecycle evidence

四组合合计1200资源周期、6795份自有引用1→0。先解绑renderer/采样器，独立执行相机detach，再dispose RT、移除节点和归还资产。临时诊断材质与变体材质单独配对；finally完成后才返回真实清理回执。终态幂等、可信控件、释放后事件静默另验。独立Gallery harness仍NOT_RUN。

## 9. API DX gaps

本轮无新增确证ENGINE_BUG。模板残留、uniform错名、缺实际样本绑定、忘消费detach、PNG/通道数自报旁路等归AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP。C03 main.ts/example.json并发改变导致旧证据拒收，是身份失效，不自动定性引擎回归。

## 10. Workarounds

复用shader-scoped Windows WebKit启动项、HTTP隔离与Firefox导航后DPR修复，不改变宿主配置。图片纯PNG解码不创建额外Canvas。中间RGBA8量化策略、正alpha安全逆预乘与低码值精度限制显式声明。

## 11. Proposed engine changes

本轮未修改引擎、构建SDK或增加公共API。当前SDK module/dts/npm为69127f39…/5b67a560…/b7771393…，来自独立WebGL2 gfx修复任务。公共能力提炼仍受Wave Gate约束，不因四组合通过提前进入Wave5。

## 12. Validation status

[C01当前SDK Gate](../evidence/shaders-absorption/c01-laser-card-current-sdk-gate.json)、[C02当前SDK Gate](../evidence/shaders-absorption/c02-film-neon-current-sdk-gate.json)、[C03当前源码Gate](../evidence/shaders-absorption/c03-glass-trail-current-sdk-gate.json)、[C04 Gate](../evidence/shaders-absorption/c04-input-dissolve-current-gate.json)均PASS。所有当前报告的OS自然exit=0/signal=null/error=null/inputsUnchanged=true，源码/参考/SDK/日志/冻结身份由生产门禁重算。

前置[Wave3历史Gate](../evidence/shaders-absorption/wave3-current-gate.json)当前校验产生140项拒收（包括源码、元数据、SDK身份及其一致性后果），不是140个新引擎缺陷。Wave4汇总诚实BLOCKED；Agent/独立Gallery NOT_RUN、subset=true、projectCompleted=false。所有旧报告保留，未stage/commit/push，未重写全库库存。

## 13. Known limitations / next step

下一步按Wave1→Wave2→Wave3顺序刷新当前候选的九个母效果和所需前置证据，再重算Wave4门禁；不能靠改SHA或文档补偿通过。长时、多标签页、实体设备、独立Gallery、Agent与公共能力收敛均未完成。项目仍在实施中。
