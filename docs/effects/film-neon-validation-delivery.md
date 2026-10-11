# C02 Thin Film + Neon：固定十三项交付

## 1. Goal

2026-10-11：[当前 SDK C02 六维 Gate](../evidence/shaders-absorption/c02-film-neon-current-sdk-gate.json)在两个解析形状、Neon over ThinFilm 的本地组合范围内 PASS。旧 SDK 的 [2026-10-10 Gate](../evidence/shaders-absorption/c02-film-neon-current-gate.json)保留为历史。`subset=true`、`completed=false`；完整 Wave4 的当前前置身份、独立 Gallery 和 Agent Gate 单独核对，不解锁 Wave5。

## 2. Upstream references

固定 shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。ThinFilm、Neon 及辅助源码共六个实际参考绑定 SHA/bytes；MIT 通知束随例保留。[UPSTREAM](../../examples/shader-film-neon/UPSTREAM.md)声明本地组合差异，不冒称上游 Logo 预设。

## 3. CocosAirJS APIs used

createAirApp/createStepClock/createAirRenderTarget、Scene/Node/Camera、MeshRenderer、Material.initialize/setProperty、EffectAsset、utils.createMesh/gfx。八条 API 证据由生产定位工具与声明 validator 实际核对，定位工具和所读取的 API 库存纳入输入闭包。原生单 canvas、单相机主绘制；透明诊断使用原生 RenderTarget，无 TypeGPU 或额外渲染器。

## 4. Implementation details

共享中心 SDF 显式只求值一次，两层保留各自 coverage/gradient 与四邻居 stencil。各层产生 straight linear RGBA，先预乘 source-over，再对正 Alpha 安全逆预乘；不提前 clamp HDR、不抹掉小非零 Alpha，显示 OETF 仅一次。透明 RGBA8 诊断与显示定点混合分别建模。

23 参数、circle/rounded-box、两层真 identity 开关。shape/lightAngle 为明确共享耦合参数，其余层参数有各自消费域；RGB=0 且 Alpha 非零不等于关闭层。详见[算法说明](film-neon.md)。这是本地单 Pass 组合，不证明通用 Pass Fusion。

## 5. Tests performed

执行渠道：**Orca Worker** 实施与首轮合同修复；**Lead** 完成剩余接线、独立审查、三引擎验收夹具及真实采集。三套 131/131：数学 47、Lead review 44、完整 acceptance 40。功能正例覆盖三引擎全部 39 capture，性能正例覆盖三引擎九 tuple，负例从被接受基线出发；临时合成 PNG 仅 NODE_CONTRACT。

[真实报告审计](../evidence/shaders-absorption/c02-film-neon-actual-audit.json)先接受两个当前实测基线，再对 44 类 structuredClone 实质变异全部拒收，browserRunsAdded=0。涵盖前轮六个错误接受项、NaN 原值、时间/实例/画布、重复 profile、真实 workload、资源类别、时钟/环境、绘制/读回及关闭状态。每阶段 strict noEmit 与 esbuild 的实际日志单独绑定。

## 6. Screenshots / visual evidence

Chromium 149.0.7827.55、Firefox 155.0、WebKit 26.6：39 标准视觉案例及透明 RT probe，另六张时间对照与三张同页 resize，合计 **48 compositor PNG，不是 48 算法案例**。独立母 CPU 模型加组合数学逐点复算，±2 未放宽；包括双关精确背景、单层直通、Alpha/HDR 格式链、形状重建、DPR2 与暂停/恢复。Lead 目视检查圆环与圆角矩形，只作数值验证补充。

## 7. Performance evidence

2026-10-10T05:40:17.286Z–05:41:50.165Z，九个串行窗口，三引擎×720p/1080p/mobile DPR2。固定双层开启、默认完整参数、真实 fixedStart/fixedEnd、原生 pacer、30 帧预热；每稳态帧有原生 beginRenderPass 与真实 GL draw，窗口 readPixels=0。功能阶段结束后才开始性能，OS 自然 exit0，输入冻结无漂移。

Chromium GPU timestamp 中位数 0.425984/1.564672/0.923648ms；FF/WK 不可用。AFTER_DRAW 间隔 CH/FF 约 16.63–17.03ms、WK 19.20–20.20ms，不能称实际显示帧率。CPU update、gfx envelope、GL 派发、队列记账另列于 Gate，不冒充 GPU。COI/DPR/backing 与完整 25000 次时钟标定分别复核；物理显存与实体移动设备性能不可用。

## 8. Resource/lifecycle evidence

300 轮退役，每轮 Mesh/Material/Effect 三引用 1→0，renderer 先解绑、节点销毁、registry 清除；纹理/缓冲登记回基线。真实可信调参/暂停/恢复/重置/释放，精确 Promise 幂等和 FILMNEON_DISPOSED 终态通过。页面、浏览器、代理、服务器实际关闭。生命周期桥接已实现；独立 Gallery harness 仍 NOT_RUN，不借资源轮数升级。

## 9. API/DX gaps found

没有新增确证 ENGINE_BUG/API_GAP。此前 uniform 错位、提前 clamp、speed/quality 模板残留、漏时间/状态绑定、错误接受与漏共享中心分别按 AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP 纠正并回归。Lead 最终审计首次误改未消费的 crossOriginIsolated 属性，已保留失败诊断并改测实际 coi 字段；这是审计错误，不是引擎问题。

## 10. Workarounds used

复用 shader-scoped Windows WebKit 合成启动项、真实 HTTP 隔离与 Firefox 导航后 DPR 修复，不改宿主设置。诊断读回退出性能窗口；同页 resize 使用实际页面，不用 fresh page 替代。测试用 zlib 写合成 PNG，仍由 pngjs 实际解码。

## 11. Proposed engine changes

本例不改 SDK/core，不新增公共 API。共享中心 SDF、单次 OETF、identity 与实际 workload 可作为后续组合对照；四组合通过后才决定最小公共能力，不从本例推广通用融合器。

## 12. Validation status

2026-10-10 功能 attempt3：05:38:58.768Z–05:39:41.739Z；性能 attempt2 如上。该批两个实际 OS 回执 exit0/signal=null/error=null/inputsUnchanged=true，34输入+6参考同闭包，属于当批 SDK 身份。历史功能 attempt1 FAIL、attempt2 与性能 attempt1 的旧身份实测均保留，不能继承为当前 PASS。

2026-10-11 Lead 对当前 SDK 69127f39/5b67a560/b7771393 重新采集：lead-w4-current-sdk-c02-functional-attempt1 UTC08:10:36.349–08:11:16.375；performance-attempt1 UTC08:12:52.703–08:14:25.051。两个 OS 自然 exit0/signal=null/error=null/inputsUnchanged=true，34+6 同闭包；39视觉/48PNG/342边界/18非法/300资源/3resize/九性能窗口，2901稳态帧，44类实际报告篡改全部拒收。未修改效果算法、母 oracle、SDK 或旧报告。当前只读入口改用 `shaders-film-neon-gate.cjs --verify=docs/evidence/shaders-absorption/c02-film-neon-current-sdk-gate.json`。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-film-neon-gate.cjs --verify=docs/evidence/shaders-absorption/c02-film-neon-current-gate.json`。冻结 example.json/README 的采证前 NOT_RUN 说明保留；当前裁定以此 Gate 为准，Gallery metadata 保持 draft，不能当公开资料 Agent 或独立 Gallery 验收。

## 13. Known limitations

非完整上游平台，只有两解析形状；Neon flicker/flow、独立 scale/rotation 不在子集。母层差异保留，shared lightAngle/shape 不承诺隔离。长时、多标签页、实体 iPhone、独立 Gallery 与 Agent Gate 未测。完整仓库库存上轮 156 套/2088 项、2083 通过/5 个既有失败，未因 C02 子集 PASS 改写或补偿。
