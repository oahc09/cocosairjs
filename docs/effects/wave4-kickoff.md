# Wave 4：四个原生组合

2026-10-10 启动时：[Wave3 Engine Gate](../evidence/shaders-absorption/wave3-current-gate.json)与 Orca Worker 严格只读复核均通过，允许按[执行计划](../../ai/plans/shaders-absorption-task-plan.md)开始本波。当批完整库存156套2088项，2083通过/5个既有失败，它与效果 Engine Gate 分别报告。C01/C02 已在当批 SDK 下通过声明子集；2026-10-11 的 C03/C04 与 SDK 身份变更状态见文末更新。完整 Wave4 和 Agent Gate 仍 NOT_RUN。

| ID  | 组合                                    | 首批实施分工                            | 关键验收                                                           |
| --- | --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| C01 | Holographic + Emboss + Sparkle 镭射卡片 | Orca Worker初稿；限额中止后Lead接管完成 | 输入预乘、浮雕梯度、星芒读取实际组合内容；禁用各阶段及顺序可解释   |
| C02 | Thin Film + Neon 彩边霓虹 Logo          | Orca Worker小三实施；Lead独立审查与采证 | 同一几何域、保留各自梯度/stencil；线性Alpha合成后仅一次显示编码    |
| C03 | Glass + Cursor Trail 互动玻璃           | Orca Worker实施；Lead独立审查与采集     | 可信轨迹进入实际scene texture，被Glass真实折射；共享轨迹不重复上传 |
| C04 | Noise Dissolve + arbitrary input        | C01–C03收口后实施                       | image、procedural、rendered layer三路真实输入；端点与输入Alpha     |

当前只有一个可用Orca Worker；采用分批实施，最多并发三项，不创建未经授权的新Worker。所有性能窗口由Lead冻结输入后串行执行，Worker实施阶段不启动浏览器或性能窗口。

C02首先冻结本地明确的组合语义：Neon覆盖Thin Film，两个效果分别计算straight linear RGBA，再用premultiplied source-over计算组合RGB/Alpha；Alpha非零才安全还原straight输出，显示OETF只执行一次。它是本地组合设计，不宣称上游提供相同Logo预设。相同SDF函数可以复用，但Thin Film的coverage/gradient与Neon的平滑stencil保留各自合同。关闭效果必须成为真实identity，不把RGB为零但Alpha非零的参数值误当identity。先记录此例实际工作量，不借本地单Pass组合宣称Wave5的通用Pass Fusion已完成。

C02已通过Lead当前实测与Orca Worker只读复核；三引擎合计18维，不是每引擎18维。下一步C01采用可解释的原生顺序：Holographic线性预乘RT → Emboss采样/逆预乘/浮雕 → Sparkle从真实Emboss输入读取亮度和颜色 → 最终一次OETF。优先三个实际Pass、两个中间RT，不提前抽象融合器。关闭Emboss时绕过中间阶段，关闭Sparkle时最后一遍成为纯显示copy；呈现copy不能误记为零Pass。Holographic关闭时采用明确的中性卡片输入，不能把缺失输入、透明零或固定白色假装成上游identity。各阶段独立参数、禁用路线、实际采样域和中间格式量化都须由独立CPU模型与浏览器证据验证。

每组合完成Build、Runtime、Visual、Boundary、Resource、Performance六维，另验参数互不污染、共享数据不重复生成、实际draw/pass/RT数量、identity状态。CPU算法oracle独立于GLSL生成；真实透明目标读回与compositor PNG分别校验，格式量化与线性/显示转换明确。资源至少100轮，性能覆盖720p、1080p、mobile DPR和三浏览器。合法调参、非法整批拒绝、pause/resume/reset/release/recreate、同页resize与终态均需原始观测，不能仅信自报PASS。

上游commit保持`dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，绑定各组件参考源码和许可。已有九例及其关闭证据输入只读，新组合写独立目录，不改动既有SDK、共享helper、正式Gallery清单、库存或旧报告。问题按九类记录，失败尝试保留；实施只通过Node/strict/格式检查时不得升级浏览器Gate。四组合完整Engine Gate通过前不进入Wave5抽象阶段。

C01当前状态见[固定十三项交付](laser-card-validation-delivery.md)：完整母算法与实际warp、三段预乘RT链，Emboss旁路真实3→2 draw；三引擎39视觉/294边界/18非法/300资源/3 resize/9性能，48张PNG；真实报告56变异与Gate13变异均拒收。Orca Worker使用限额中止由Lead接管，不借Worker中间回执升级Gate。独立Gallery与Agent未运行。

2026-10-11 更新：C03 最终三浏览器功能与九个串行性能窗口实测通过，见 [C03 六维 Gate](../evidence/shaders-absorption/c03-glass-trail-current-gate.json) 与 [十三项交付](glass-trail-validation-delivery.md)。范围为合计18维、39视觉、264边界、18非法输入、300资源轮、3同页resize与48 PNG；每正dt帧恰一次512字节点纹理上传，完整原生字节与逐帧CPU回放绑定。中间RGBA8显式量化策略与插桩开销单独披露。Gallery 183→184，旧项保留，独立Gallery harness与Agent仍NOT_RUN。

C04 于 2026-10-11 完成 image、procedural、rendered layer 三路真实输入的 [六维 Gate](../evidence/shaders-absorption/c04-input-dissolve-current-gate.json)：81 视觉、90 边界、21 非法、300 资源轮、1995 份引用归还、9 活 resize、90 PNG 和 27 串行性能窗口；44 类实际报告篡改全部拒收。Orca Worker 初稿及部分 Chromium 验收后额度中止，Lead 完成生产修复、最终三浏览器与性能采集，见 [十三项交付](input-dissolve-validation-delivery.md)。

当前 SDK 来自并行 WebGL2 gfx 合同修复，冻结为69127f39/5b67a560/b7771393。C01/C02随后独立完成当前SDK重采，C03因main.ts/example.json改变也重新冻结并完整采集；四个当前叶级Gate均PASS。完整汇总 [wave4-current-gate.json](../evidence/shaders-absorption/wave4-current-gate.json) 的组合子集PASS、状态BLOCKED：前置Wave3当前源码/SDK校验有140项拒收，不能继承旧PASS。下一步按Wave1→Wave2→Wave3刷新前置，再重算Wave4；独立Gallery/Agent仍NOT_RUN，不进入Wave5。范围与完整证据见[Wave4十三项交付](wave4-validation-delivery.md)。
