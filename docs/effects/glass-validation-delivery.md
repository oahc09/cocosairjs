# E09 Glass：固定十三项交付

## 1. Goal

2026-10-10：[E09六维Gate](../evidence/shaders-absorption/e09-glass-current-gate.json)在解析形状+Vogel片元fallback冻结范围内PASS。subset=true/completed=false；不是完整上游Glass平台、Gaussian compute实现或发布就绪。

## 2. Upstream references

固定 shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。Glass/index.ts SHA256=964f8b456050a05e5a3dc278c5c40b5d6c880d02889e11d7b203d1d2a63afc45；effects/glass.ts、blur.ts、blend.ts、materials.ts共5个只读参考均绑定实际字节。MIT通知束随例保留；[UPSTREAM](../../examples/shader-glass/UPSTREAM.md)列明分支及差异。

## 3. CocosAirJS APIs used

createAirApp/createStepClock/createAirRenderTarget、Scene/Node/双Camera、MeshRenderer、EffectAsset/Material、utils.createMesh/Component/gfx。8个API执行行由生产findSymbolLine及声明validator检查，定位工具和读取的API库存纳入输入闭包。只有一个渲染canvas，无TypeGPU、独立WebGL渲染器或上游runtime。

## 4. Implementation details

原生双相机两遍RTT，固定256² RGBA8/NEAREST/CLAMP图案源；前向SDF梯度、折射深度、innerZoom、RGB色散、9/27点Vogel、亮度保持tint、方向边缘/specular/Fresnel/cutout。预乘源安全逆转、straight linear诊断与OETF/定点alpha预览分别独立复算。19参数、两个解析形状、零跨越编译变体；[算法说明](glass.md)不冒称Gaussian compute。

## 5. Tests performed

执行渠道：Lead实施、独立oracle、审查及真实采集。Glass数学31、collector接受/拒绝44、性能合同17，加跨例API16及Cursor Trail80，共六套188/188实际通过；合成fixture仅NODE_CONTRACT，无output依赖。每次真实采集先strict noEmit exit0再esbuild，功能和性能分别保存实际构建日志及bundle bytes。

[真实报告审计](../evidence/shaders-absorption/e09-glass-actual-audit.json)先接受功能/性能基线，再对35类内存克隆逐一拒绝；browserRunsAdded=0。含白洗/NaN、缺模糊变体、未收到可信控件、相机未detach、RT/引用泄漏、缺pass/draw、计时读回、假DPR/时钟/毛玻璃配置及关闭状态。

## 6. Screenshots / visual evidence

Chromium149.0.7827.55、Firefox155.0、WebKit26.6，45标准截图+45透明RT样点审计，另3同页resize PNG，共48 compositor PNG。冻结样点覆盖原图opaque/semi/transparent族、棋盘/锚点、shape、blur、色散、tint、cutout及light background；SHA/bytes/解码/尺寸独立检查，±2码值未放宽。Lead目视检查Chromium blur-vogel仅作补充。

## 7. Performance evidence

2026-10-10T03:56:53.380Z–03:58:25.698Z，9个串行窗口：三引擎×720p/1080p/mobile DPR2。实际状态固定blur=8/aberration=0.5（27 taps），25000次时钟标定、30帧预热、每稳态帧两原生pass及draw、readPixelsDuringWindow=0。OS自然exit0/signal=null/inputsUnchanged=true；与功能窗口不重叠。

Chromium GPU timestamp中位数0.664576/2.309120/1.174528ms；FF/WK不可用。CPU update中位数CH约0.075–0.080ms、FF约0.10ms、WK约0.06ms。AFTER_DRAW间隔CH/FF约16.64–16.70ms、WK18.68–20.22ms，不能称为真实显示帧率。gfx envelope、GL派发、队列记账另列；不据此给跨浏览器硬件排名或保证模糊成本。

## 8. Resource/lifecycle evidence

300轮×六引用1→0、两renderer解绑、两节点退役、Effect registry清除、sampler解绑、相机detach和RT dispose独立观察。引擎texture/buffer登记回基线；借用引擎对象不销毁。真实参数/暂停/恢复/重置/释放、精确Promise幂等及GLASS_DISPOSED通过。页面/浏览器/代理/服务器实际关闭。

Gallery180→181，旧180项逐项保持。生命周期桥接已实现；独立Gallery harness仍NOT_RUN，不借native cycles补偿。

## 9. API/DX gaps found

没有新增确证ENGINE_BUG/API_GAP。Lead的metadata返回对象误用已归AGENT_FAILURE，并跨E08/E09修正+回归；性能纯校验器曾在非法profile上抛TypeError，已改为结构化拒绝并补17例合同。首三次功能报告真实通过但闭包随后演进，均保留历史。原生RT预乘及两种解绑回调已有实证，不另造平行渲染API。

## 10. Workarounds used

复用shader-scoped Windows WebKit合成启动项、真实HTTP隔离与Firefox导航后DPR修复。诊断同引擎透明RT不进入性能窗口；同页resize等待真实backing及再次绘制，不以fresh page替代。临时合成PNG采用zlib写入，仍用pngjs解码，仅测试fixture。

## 11. Proposed engine changes

本例不改SDK/core。E05与E09证实attachCamera detach与bindColor解绑必须独立消费；建议优先在Recipe/文档中强调所有权顺序，多案例评估后再决定是否需要更小的类型化组合工具。Gaussian compute未实现不能写成引擎缺陷。

## 12. Validation status

功能attempt4和性能attempt1为同一34输入+5参考闭包当前PASS，OS/log/frozen文件逐项绑定；attempt1–3真实报告保留且不借历史身份称为当前。只读：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-glass-gate.cjs --verify=docs/evidence/shaders-absorption/e09-glass-current-gate.json`。完整Wave3见[汇总交付](wave3-validation-delivery.md)，Engine/Agent Gate隔离。

## 13. Known limitations

Gaussian compute、可变child分辨率/过滤、volumetric/SDF贴图/shape JSON平台、可配置中心/高光色未实现。仅解析circle/rounded-box及显式fallback，非完整上游等价。实体iPhone、长时、多标签页、独立Gallery和公开资料Agent Benchmark未测；物理显存及FF/WK GPU timestamp不可用。
