# Wave 1 当前交付记录

2026-10-09。**当前 Wave Gate：BLOCKED，完整计划未完成。** Wave 0 PASS；三个原生效果已实现，WebKit活resize呈现与部分性能测量范围/精度尚未满足冻结Gate。Wave 2–7、独立Agent Gate均NOT_RUN。未修改SDK/抽取源码，未提交、推送、部署。

以下固定十三项记录属于当前Wave阶段交付，不是全计划最终关闭报告。

## 1. Goal

以原生CocosAirJS实现E01 Noise Dissolve、E02 Thin Film、E06 Sparkle，借真实数值、呈现、资源和性能验证发现能力边界。三个Gallery示例保持draft，没有嵌入上游runtime、TypeGPU或第二个渲染canvas。

## 2. Upstream references

固定`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`（v4.0.1），参考文件/祖源/许可证见[来源索引](upstream-index.md)及各例UPSTREAM.md。MaterialX/OSL适用通知已保留。Fi-hash原许可未充分证明，Sparkle采用独立hash，明确不等价。Thin Film为视觉cosine虹彩，不称物理干涉模型。

## 3. CocosAirJS APIs used

三例均使用`createAirApp`、原生Scene/Node/Camera、Mesh/MeshRenderer、Material/EffectAsset、Component.update、原生纹理及gfx诊断目标。完整逐例列表与源码见[Noise Dissolve](noise-dissolve.md)、[Thin Film](thin-film.md)、[Sparkle](sparkle.md)。Gallery只声明当前公开inventory可定位的unit，不把私有继承成员名称冒充公开API。

## 4. Implementation summary

Noise Dissolve：gradient noise/fBM、可重复seed、progress前沿、softness与alpha。Thin Film：解析SDF/梯度、phase/palette、线性核心与显示合成。Sparkle：亮度阈值、抖动网格、星芒、可重复动画。参数拒绝未知键、非法类型、NaN/Infinity及范围错误。局部UBO/参数工具不进入默认runtime；尚未提炼公共效果抽象。

## 5. Tests

实际全库存125套1191项：1187通过、4失败。本轮新增四套111项全部通过（合同30、E01 19、E02 31、E06 31）；合成PNG/Jest验证合同而非浏览器正例。各例严格TS/esbuild/原生shader编译记录独立保存。真实报告审计E01 47、E02 72、E06 21类篡改拒绝，无新增浏览器。旧Gallery/spec及矩阵指纹失败如实保留，不宣称仓库全绿。

## 6. Screenshots / visual evidence

三引擎Chromium149.0.7827.55、Firefox155.0、WebKit26.6。独立CPU算法oracle与实际原生RGBA8/float回读核对，compositor PNG独立解码；颜色空间、alpha、端点与seed有数值合同。图片/原始报告通过三个[轻量摘要](../evidence/shaders-absorption/)的SHA+bytes绑定。WebKit同页resize页面PNG失败未被Canvas导出或fresh page补偿；[Lead独立原生对照](wave1-resize-observation.md)同样复现。

## 7. Performance evidence

每效果每浏览器720p/1080p/mobile配置，30预热后至少60稳定样本；E02另保留六秒窗口。更新CPU、原生命令包络、GL draw CPU派发、Queue记账和原生帧回调间隔分开，不称display present。Chromium同一Cocos context EXT GPU时间已测，查询归属/删除可查；FF/WK扩展unavailable。

| 效果 | Draw / Pass | 自有gfx分配估计 | Chromium GPU P50 ms（720/1080/mobile） | 未达性能范围 |
| --- | --- | --- | --- | --- |
| E01 | 2 / 2 | 2744B | 1.182 / 4.397 / 1.781 | FF三档、WK1080/mobile CPU GL派发精度LIMITED |
| E02 | 1 / 1 | 396B | 0.187392 / 1.324032 / 0.701440 | FFmobile请求/实际DPR与backing错配，完整范围LIMITED |
| E06 | 1 / 1 | 65676B | 0.227 / 3.552 / 3.269 | WKmobile CPU GL派发低于1ms精度LIMITED |

估计不是物理VRAM，排除共享缓存/部分目标分配。记录[测量口径](measurement-methods.md)、原始数组和工具COOP/COEP条件；没有推断普适FPS预算或零成本。

## 8. Resource/lifecycle evidence

每效果三浏览器×同app100实例，各300实例。自有Mesh/Material/Texture/EffectAsset引用逐项1→0，先解绑renderer再退役节点、归还引用/自有零引用资源，registry身份守卫、幂等release和终态拒绝有实际记录。借用runtime/scheduler/builtin/PSO缓存保留。三个例子的通用Gallery `window.__lifecycle`尚未适配（EXAMPLE_GAP）；独立Resource通过不冒充通用Gallery采集。

## 9. API/DX gaps found

具体九类合同与证据见[问题分类](wave1-findings.md)。确认API_GAP为公开GPU timestamp/活对象可观测接口缺口；API_DX包括即时GL执行与Queue记账语义；DOC_GAP为Material与MaterialInstance能力区别。调用/采集元数据错误分类AGENT_FAILURE并保留历史；resize/DPR/精度分类INFRA_FAILURE。当前无确证ENGINE_BUG、无成本超预算证据支持PERFORMANCE_GAP。

## 10. Workarounds used

明确Material.initialize状态、Component.update(dt)、example-local vec4 UBO与颜色适配；工具包装仅诊断同一原生GL调用，不替代渲染。实际collector exit1与独立scoped只读验证exit0分开记录，后者不是重新采集或完整失败补偿。原始失败数据未覆写。

## 11. Proposed engine changes

当前零引擎改动。待Wave通过及更多真实消费者后评估GPU测量工具接口、参数/UBO authoring帮助与文档修订，不预设core方案，不建平行材质框架。未定位错误行的WebKit compositor观察不能直接变成引擎补丁。

## 12. Validation status

| 效果 | Chromium | Firefox | WebKit | 全浏览器Engine Gate | Agent Gate |
| --- | --- | --- | --- | --- | --- |
| E01 | 六维PASS | Performance LIMITED，其余PASS | Runtime BLOCKED、Performance LIMITED，其余PASS | BLOCKED | NOT_RUN |
| E02 | 六维PASS | Performance LIMITED，其余PASS | Runtime BLOCKED，其余PASS | BLOCKED | NOT_RUN |
| E06 | 六维PASS | 六维PASS | Runtime BLOCKED；Performance两档PASS/一档LIMITED，其余PASS | BLOCKED | NOT_RUN |

执行渠道：三个效果均由**native subagent**实际实施与采集，Lead负责独立原生控制、只读复核、Gallery与库存集成和Wave裁定。不是Orca Worker执行。复核入口：

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/shaders-noise-dissolve-precision-closure.cjs --verify=output/shaders-absorption/e01-engine-precision-final.json
node tools/verify/shaders-thin-film-summary.cjs --verify=docs/evidence/shaders-absorption/e02-thin-film-summary.json
node tools/verify/shaders-sparkle-final.cjs --verify=docs/evidence/shaders-absorption/e06-final-summary.json
```

以上Lead实际执行均exit0，含义是当前证据/分类有效，仍scopePassed=false或effectStatus=BLOCKED。E01 summary工具只生成摘要，没有--verify模式；只读验证应使用上述precision-closure入口。

## 13. Known limitations

完整计划9效果/4组合/Agent benchmark尚未完成；禁止推进Wave2。后续先解决同页resize呈现的可验证环境和必需性能阶段的精度/DPR，再重新采证，原失败保留；不得降低Gate绕过。真实手机、多标签页、长时稳定性、全上游runtime等价及真实外部任意图像/渲染层组合未验证。Gallery通用生命周期接口需单独补齐并采证。没有提交、推送或部署，未删除用户重要数据。
