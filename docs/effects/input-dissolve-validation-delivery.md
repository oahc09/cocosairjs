# C04 Input Dissolve 固定十三项交付

## 1. Goal

使用 CocosAirJS 原生单 Canvas 实现图片、程序纹理、场景渲染三种输入的溶解组合。本地组合设计，不称上游预设。功能证据与性能证据分别记录，完整 Wave4、Agent Gate 和独立 Gallery 验收保持隔离。

## 2. Upstream references

固定 shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。三个参考文件的完整 SHA/字节数绑定在 collector 的 reference 闭包；[UPSTREAM](../../examples/shader-input-dissolve/UPSTREAM.md) 与第三方通知保留 MIT、MaterialX/OSL 谱系说明。不执行上游 runtime 或 TypeGPU。

## 3. CocosAirJS APIs used

createAirApp/createStepClock/createAirRenderTarget、Scene/Node/Camera、MeshRenderer、Material.initialize/setProperty、EffectAsset、utils.createMesh、Texture2D。实际 API 调用行由生产 findSymbolLine 核对；Canvas 在模块导入前存在。场景、内容和诊断均使用 Cocos 原生相机及 RT。

## 4. Implementation details

NoiseDissolve 保留独立 uint32 Perlin、三层 fbm、覆盖与 reveal 掩码，只缩放 alpha。progress=0 是输入直通，progress=1 透明；禁用不重复编码。CPU oracle 独立重写数学，不解析 GLSL。显示执行一次 OETF，数学容差维持 ±2。

图片路线的真实 PNG 包含不透明、半透明、全透明隐藏 RGB 与 alpha=1/255 分区。生产 PNG 解码器使用 DecompressionStream 与逐行 filter 逆推，未创建第二 Canvas。预乘线性 RGBA8 上传字节的尺寸、格式、字节数、SHA 在实际快照中记录，验证器从本地 PNG 独立复算。Node 交叉测试将生产解码结果与 pngjs 全部像素逐字节比较。

程序路线使用可复算 uint32 内容着色器；场景路线使用独立三块 slab MeshRenderer 和一个透明空窗。两者经原生相机写入 RGBA8 RT，再执行溶解。活 resize 同时更新 RT backing、代次、场景布局和 aspect uniform；render-only dt=0 同样处理尺寸变化。原生 beginRenderPass 包装记录实际通道数，不由路线名推断成功。

## 5. Tests performed

执行渠道：Orca Worker 完成初稿及 Chromium attempt14；Lead 接手独立审查、五类误收修复、三路线 resize、图片字节交叉验证、完整资产账本与实际三浏览器重采。合成 PNG 只证明 NODE_CONTRACT，不称浏览器证据。

本轮四套聚焦 Jest 88/88 PASS，Lead review 24 条原样保留；strict noEmit 与实际 bundle 均 exit=0。真实 functional/performance 接受基线上的 44 类 structuredClone 篡改全部拒收，直接 NaN 不经过 JSON 转换。Gate 汇总的 16 类篡改也全部拒收，涵盖 scope、Agent/Wave/项目伪完成、OS/raw/verifier 指纹、截图、引用、pass 和伪性能数值；审计保存于 output/shaders-absorption/lead-w4-c04-gate-closure-audit.json，零新增浏览器运行。所有历史 attempt、退出记录、日志、冻结身份均保留。没有运行或改写全库库存。

## 6. Screenshots / visual evidence

冻结矩阵每引擎 21 个 DPR1 案例和 6 个 DPR2 案例，合计 81 个标准视觉案例，均有 compositor PNG 与透明线性 RT 读回。三路线各做同页 640×400→480×320 活 resize，共 9 次，另 9 PNG。因此合计 90 PNG，不是 90 算法案例。包含三输入异源、端点、禁用、invert、softness=0、seed/scale 和明亮背景。

## 7. Performance evidence

实际完成三引擎 × 720p/1080p/mobile-DPR2 × 三输入路线，共 27 个串行窗口、8730 个稳态帧。环境使用真实 HTTP COOP/COEP、导航后 DPR 修复、25000 次时钟校准，DPR/backing/COI 均匹配冻结 profile。生产门禁独立检查环境、原始正增量、tuple 唯一集、固定参数、编译、关闭、实际 pass/draw、逐帧 update 与 GPU query 配对。首个没有前序间隔的 AFTER_DRAW 不构成 interval 样本，其原始命令作为初始 warmup 帧保留。

先等待并行全库 Jest 结束，再执行独占采集；最终性能 OS UTC 2026-10-11T07:51:16.393Z–07:55:44.003Z，自然 exit=0，signal=null，输入前后相同。所有计时窗口 readPixels=0，image/procedural/rendered 实际 pass 合同为 1/2/2。时钟精度 Chromium 约 0.005ms，Firefox/WebKit 约 0.02ms。

Chromium GPU timestamp 中位数如下（ms）；Firefox/WebKit timer 不可用，未伪造 GPU 数值。CPU update 中位范围约 0.06–0.14ms，包含命令观察插桩，不称无插桩基准。mobile 是模拟视口与 DPR，不是实体 iPhone 测量；物理 GPU 内存不可用，不作相对性能优劣或预算达成声明。

| Profile     | image    | procedural | rendered |
| ----------- | -------- | ---------- | -------- |
| 720p        | 1.058816 | 1.863680   | 2.378752 |
| 1080p       | 3.247104 | 3.584000   | 3.372032 |
| mobile DPR2 | 2.736128 | 2.957312   | 0.851968 |

## 8. Resource/lifecycle evidence

三浏览器各 100 轮路线轮换。image/procedural/rendered 分别为 5/5/10 份自有资产，每份持有一份并归还 1→0；场景的三份 slabMesh 已逐项纳入引用账本。每引擎 34/33/33 轮，共 1995 份配对归还。先解绑 renderer/采样器，再独立调用相机 detach，dispose RT，移除节点并归还资产；登记的纹理/缓冲回到基线。

线性诊断使用一次性 Material，finally 恢复原材质与呈现状态后才返回回执，临时引用 1→0、实例和更新账本保持。普通页面实际操作参数、暂停、恢复、重置、释放；终态幂等 Promise、监听解绑和释放后事件静默单独检查。独立 Gallery harness 未运行。

## 9. API DX gaps

本轮未新增确证 ENGINE_BUG。错误 uniform 名、launch options 套错层、双解绑回调遗漏、探针 finally 前回执、字段自报旁路、性能环境未接入等归为 AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP。Worker 使用额度中止归为 INFRA_FAILURE，不计入引擎算法失败。

## 10. Workarounds

没有额外渲染 Canvas、上游 runtime 或 TypeGPU 旁路。PNG 解码是资源处理；GL/gfx 包装仅观察同一个 Cocos 上下文的调用。正 alpha 包括 1/255 安全逆预乘，alpha=0 归零；RGBA8 量化可能丢失低于半码值的预乘 RGB，明确区别于溶解数学。

## 11. Proposed engine changes

C04 未修改引擎或增加公共运行时 API。当前 SDK 69127f39…/5b67a560…/b7771393… 来自并行 WebGL2 gfx 修复，仅冻结当前字节；不继承旧 SDK 下 C01/C02、Wave1–3 当前身份 PASS。

## 12. Validation status

当前 [C04 六维 Gate](../evidence/shaders-absorption/c04-input-dissolve-current-gate.json) 已 PASS：三引擎合计 18 维，81 视觉、90 参数边界、21 非法输入整批拒绝、300 资源循环、9 live resize、90 PNG、27 性能窗口。绑定最终 lead-w4-c04-functional-all-attempt7 与 lead-w4-c04-performance-all-attempt1，30 输入+3 参考、两个 OS 自然 exit=0、冻结身份零漂移、采集阶段不重叠。[真实报告审计](../evidence/shaders-absorption/c04-input-dissolve-actual-audit.json) 44/44 拒收。

Wave4/Agent/独立 Gallery NOT_RUN，subset=true、completed=false。Gallery 现有清单已含 C04，共 185 项；本批未重新生成全局清单。冻结 example.json 中的初稿视觉计数与未验描述保留为当批元数据，当前实际范围以本交付和 Gate 为准；若后续修改该身份输入，需重采，不能借文档更新重标旧证据。未 stage/commit/push。

## 13. Known limitations

没有长时、多标签页、实体设备或独立 Gallery harness 验收。原始 screenshot 数量与算法案例数分开。C01/C02 后续已独立完成当前 SDK 重采，C03 也因源码/元数据改变完整重采；四组合当前子集 PASS。前置 Wave1–3 的当前候选一致性尚未通过，详见 [Wave4当前交付](wave4-validation-delivery.md)，当前不进入 Wave5。历史 attempt6 因 Lead 将三块实际 slab 误写为四块而 FAIL，已修正资产合同并重新采集 attempt7，不改写旧失败。
