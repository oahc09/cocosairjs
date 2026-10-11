# E08 Cursor Trail：六维实证交付

## 1. Goal

2026-10-10：[E08当前Gate](../evidence/shaders-absorption/e08-cursor-trail-current-gate-r2.json)冻结范围六维PASS。subset=true/completed=false，叶级wave3Gate保持NOT_RUN（不代替汇总），完整Wave3见汇总交付；Agent Gate未验。

## 2. Upstream references

固定shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a；CursorTrail/index.ts SHA256为1cfdb60b981438b885d6b47c5ee3557f3289669fc12fb07e5000e4c0476c5cb2。agents、host/pointer及固定commit获取的dataEncoding和HTTP receipt共5参考输入。[UPSTREAM](../../examples/shader-cursor-trail/UPSTREAM.md)及MIT通知保留；源码只读核对，不导入运行时。

## 3. CocosAirJS APIs used

createAirApp/createStepClock、Scene/Node/Camera、EffectAsset/Material/MeshRenderer、utils.createMesh、Texture2D.uploadData、Component.update；createAirRenderTarget仅同引擎诊断。生产findSymbolLine核对9个执行行；单Canvas，无额外渲染器。

## 4. Implementation details

CPU速度响应、年龄、间距和Chaikin记录器→64×1 RGBA16F→原生片元三子弦Bézier扫描。独立host replay、signed-width分段、半精度bits和实际上传逐步交叉验证；指数深度混合与两个线性颜色端点。[算法说明](cursor-trail.md)列出与上游注释/精确圆锥距离的差别。

## 5. Tests performed

Orca Worker小三提供部分源码后因429配额中止，没有完整实施终态；Lead接管实施、独立审查、采集与裁定。两套focused实际80/80（36基础+44审查），strict类型检查exit0，合成fixture仅NODE_CONTRACT。

[真实报告审计](../evidence/shaders-absorption/e08-cursor-trail-actual-audit-r2.json)接受功能/性能正基线，37种实际克隆全拒，browserRunsAdded=0。涵盖GPU白洗/NaN、上传bits、可信输入/触摸、引用、缺构建日志、缺引擎、活数据、原生pass/draw、计时读回与闭环。完整库存保留Wave2实际1781/1786、5失败；focused通过不升级全仓库库存。

## 6. Screenshots / visual evidence

Chromium149.0.7827.55、Firefox155.0、WebKit26.6：36标准视觉/透明RT、45 compositor PNG（另含鼠标/触摸/resize各3）。PNG SHA/bytes/解码、固定采样点和独立算法重算；±2码值不变。Lead目视检查Chromium交叉轨迹，仅作补充。

## 7. Performance evidence

三引擎×720p/1080p/mobile DPR2，9个串行窗口；2026-10-10T03:50:17.183Z–03:51:58.220Z，OS自然exit0/signal=null、inputsUnchanged=true，与功能窗口不重叠。各25000次时钟标定、30预热帧，稳态每帧64 texel/512字节上传，原生pass/draw逐帧存在，readPixelsDuringWindow=0。

Chromium GPU timestamp中位数720p/1080p/mobile为4.322304/5.617664/5.028864ms；FF/WK不可用。CPU update中位数CH约0.28–0.30ms、FF0.36–0.42ms、WK0.18ms；AFTER_DRAW间隔CH/FF约16.64–16.68ms，WK18.70–20.66ms。完整gfx envelope、GL派发、队列记账分别保留，不混称GPU或实际显示帧率，不据此做跨浏览器硬件排名。性能是诊断CPU轨迹，不伪装可信人体输入。

## 8. Resource/lifecycle evidence

300轮×四kind，所有引用1→0，renderer/sampler解绑，节点与注册退役，引擎texture/buffer登记回基线。可信参数/暂停/恢复/重置/释放、Escape代次、精确Promise幂等与TRAIL_DISPOSED通过；页面、浏览器、代理、服务器实际关闭。

Gallery179→180，旧179个条目逐项保持。独立Gallery harness仍NOT_RUN；原生cycles不补偿该项。物理GPU显存不可测。

## 9. API/DX gaps found

本轮AGENT_FAILURE：退役/诊断接线、resize未等待backing就截屏、事件名类型错误、误将旧式TouchEvent作为协议触摸必需项。原始失败保留。上游注释与执行体差异按REFERENCE_ERROR文档记录，不改变执行体对照。无已确证新ENGINE_BUG/API_GAP；多处数据纹理和释放样板留待多案例提炼。

Lead审计脚本两次读错raw字段（phases/stages及build.files/raw）均在生成正式报告前纠正，未用失败基线冒称篡改拒绝。

## 10. Workarounds used

既有shader-scoped WebKit合成启动项、真实HTTP隔离和Firefox导航后DPR修复。live resize等待真实backing并再次绘制；不以新页面或GL读回替代同页compositor证据。

## 11. Proposed engine changes

无core API修改。先完成Glass及整波复核，再依据重复的纹理/RT/退役消费者决定最小公共能力；不为单个示例先造新运行时框架。

## 12. Validation status

功能attempt7和性能attempt3当前PASS；前6次功能/前2次性能报告、日志、OS、冻结身份保留，历史通过但闭包变化的报告不标为当前。首轮resize失败、第五轮strict/TouchEvent合同失败均如实记录。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-cursor-trail-gate.cjs --verify=docs/evidence/shaders-absorption/e08-cursor-trail-current-gate-r2.json`；不启动浏览器或写报告。Engine Gate与Agent Gate隔离。

## 13. Known limitations

仅两线性颜色端点；非精确变半径圆锥、非流体。可信协议触摸为21次tap，旧式TouchEvent、连续实体滑动、iPhone真机、长时、多标签页、独立Gallery和Agent Benchmark未验。GPU物理显存、FF/WK GPU timestamp不可用。完整Wave3结论见汇总交付，独立Agent Gate未验。

补充更正：Lead曾把生产findSymbolLine返回的对象直接插入行号，9处API元数据出现L[object Object]，分类AGENT_FAILURE。现使用返回值.line，新增16项跨E08/E09回归，采集器直接检查执行行与声明validator。source helper/其读取的API库存均纳入32输入闭包；完整重新采集功能attempt7+性能attempt3后生成r2 Gate。旧Gate/审计/attempt6和性能attempt2原样保留为历史，不继续称为当前身份证据。
