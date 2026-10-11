# E05 Emboss：六维实证交付

2026-10-10。[当前六维 Gate](../evidence/shaders-absorption/e05-emboss-current-gate.json) PASS，覆盖原生双相机 RTT 与两个解析形状。本例采集时Wave2尚缺E03；当前三例汇总已PASS，Agent Gate仍NOT_RUN。

## 1. Goal

实现凹凸浮雕，验证 signed height、差分法线、光照、阴影、UV warp、输入 Alpha 与资源合同。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`；Emboss/index.ts SHA 为 `ff31f6250a9abebfeca5e1bfb87ffebbc8517f8dd2d747de833821be5e3fa5df`。其余 helpers 逐文件身份在 Gate reference 内。[来源与差异](../../examples/shader-emboss/UPSTREAM.md)及 [MIT 通知](../../examples/shader-emboss/LICENSE.reference.txt)保留；不嵌入上游 runtime 或 TypeGPU。

## 3. CocosAirJS APIs used

createAirApp、Scene/Node/Camera、MeshRenderer、Material、EffectAsset、utils.createMesh、createStepClock、createAirRenderTarget。子相机 priority0、主相机 priority1，单场景单 Canvas；attachCamera 与 bindColor 返回独立解绑回调。

## 4. Implementation details

执行渠道：Orca Worker 小三实施和修复；Lead 独立审查、采集、审计及正式接线。子相机写256²预乘 RGBA8 图案；原生 bindColor 采样，安全 unpremultiply 后进行浮雕数学，最终 straight RGBA 输出。预览经过 OETF 和定点 RGBA8 混合，诊断 RT 关闭混合直读。[算法说明](emboss.md)记录差分法线、双 tap 阴影与 UV warp；不声称真实几何位移或物理线性合成。

## 5. Tests performed

Lead 复跑三个 E05 Jest 套件109/109，保存在 `output/shaders-absorption/lead-w2-e05-focused-tests.json`。实际采集的 strict tsc、esbuild、三浏览器 shader 编译通过；两外层 OS exit0、signal=null、inputsUnchanged=true，功能与性能窗口不重叠。

[真实克隆审计](../evidence/shaders-absorption/e05-emboss-actual-audit.json)接受两实际正例后30种篡改全拒，browserRunsAdded=0。Wave2 独立门禁另有19个 Node合同测试及[四种日志完整性篡改](../evidence/shaders-absorption/e05-emboss-observation-integrity-audit.json)：叶级 collector 未区分缺失与空日志数组，汇总门禁明确拒绝缺失；本批实际数组齐全且为空。完整库存未重跑，不能称全仓库绿。

## 6. Screenshots / visual evidence

CH149.0.7827.55、FF155、WK26.6，每引擎11个DPR1及两个DPR2案例，共39组PNG/透明RT探针，另三张同页resize PNG。全部独立CPU oracle比对通过，容差保持±2；凹/凸、depth0、光向、零光照/阴影、半透明/隐藏RGB/blank、明背景均在冻结计划内。

Lead 人工查看默认 Chromium PNG，未声称逐张人工审美验收；算法依据为全量数值检查。原始报告 `output/shaders-absorption/lead-w2-e05-functional-attempt2.json`，相邻 `-artifacts/` 共42 PNG。

## 7. Performance evidence

`output/shaders-absorption/lead-w2-e05-performance-attempt1.json`：三引擎×720p/1080p/mobile DPR2，九个约6秒窗口，30 warmup后重算steady样本。每帧两次draw、两个原生beginRenderPass。

| 引擎     | AFTER_DRAW中位数（720p / 1080p / mobile，ms） | GPU timestamp中位数（ms） |
| -------- | --------------------------------------------- | ------------------------- |
| Chromium | 16.645 / 16.645 / 16.665                      | 0.287 / 2.288 / 0.687     |
| Firefox  | 16.780 / 16.720 / 16.660                      | 不可用                    |
| WebKit   | 19.080 / 19.840 / 20.280                      | 不可用                    |

CPU更新中位数约0.06–0.10ms；gfx envelope、GL draw派发、queue记账分别保留。AFTER_DRAW不是显示器呈现时间，queue记账不是GPU提交，零值仅表示精度以下。mobile CSS390×844/DPR2/backing780×1688/COI=true；时钟CH约0.005ms、FF/WK约0.02ms。物理显存不可用，引擎登记字节和GL对象数单列；不宣称60FPS或跨浏览器硬件排名。

## 8. Resource/lifecycle evidence

三引擎各100轮，共300轮：mesh/material/effect及childMesh/childMaterial/childEffect六引用1→0，renderer解绑、节点移除、资产失效、registry清理和引擎内存计数回基线。子RT顺序为采样器解绑→相机detach→实际观测→dispose。release精确Promise幂等、监听配对、终态EMBOSS_DISPOSED。

普通模式参数键盘/暂停/恢复/重置/释放为真实可信事件；同页同Canvas640×400→480×320的PNG/探针均通过。页面/浏览器/自有代理与HTTP服务关闭。Gallery只新增Emboss，原176项逐项保留；单独Gallery resource-released harness仍NOT_RUN，不借实例cycles升级。

## 9. API/DX gaps found

attempt1真实FAIL来自相机detach回调未消费、明背景污染resize oracle，均AGENT_FAILURE，已回归及重新采集修复。缺失日志数组被叶级collector接受的验证缺口由Wave2汇总门禁补强。未确证ENGINE_BUG/API_GAP，未修改引擎源码。

## 10. Workarounds used

复用shader-scoped Windows WebKit启动项、真实HTTP隔离与Firefox导航后DPR修复。不使用fresh page替代resize，不添加Canvas，不放宽算法容差。

## 11. Proposed engine changes

暂无；保持example-local实现，待Holographic完成后根据多个真实消费者提炼公共能力。

## 12. Validation status

E05六维PASS；Wave2/Agent Gate未通过，不进入Wave3。attempt1及日志/OS回执/冻结输入保留FAIL，attempt2为真实补偿。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave2-gate.cjs --verify=docs/evidence/shaders-absorption/e05-emboss-current-gate.json`。叶级collector的`--verify=<raw.json>`复算输入和全部PNG；汇总门禁增加独立日志/OS/六维检查。重复三个`--verify`检查完整Wave2，缺E03则拒绝。

## 13. Known limitations

仅circle/rounded-box，无volumetric、SDF贴图、shape JSON平台和center/origin参数面；child RT固定256²。mobile为桌面模拟，非实体iPhone；长时、跨标签页、单独Gallery和公开资料隔离Agent Benchmark未验。子集通过不等于完整上游平台或release完成。

2026-10-10 汇总更新：完整冻结Wave2 Engine Gate已通过，见[Wave2十三项交付](wave2-validation-delivery.md)。上文本例时点的NOT_RUN描述保留历史；Agent Gate与单独Wave2 Gallery harness仍未运行。
