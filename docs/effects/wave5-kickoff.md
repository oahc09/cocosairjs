# Wave5：公共能力、同源文档与融合试验

> 本文的 `output/` 路径是未随仓库分发的本地历史产物，保留为溯源记录；不作为可点击仓库链接或当期验收证明。

2026-10-11 启动时，前置 [Wave4 Gate](../evidence/shaders-absorption/wave4-current-sdk-r2-gate.json) 已由 Lead 与 Orca Worker 独立生产验证通过。随后并行 Spark 工作重建 SDK，字节指纹发生变化；2026-10-12 当前 [Wave5 Gate](../evidence/shaders-absorption/wave5-current-r2-gate.json) 为 BLOCKED，不能把旧 SDK 或冻结候选的 PASS 重标为当前 PASS。Agent Gate 为 NOT_RUN。

## 本轮交付

1. 从已验证的九个效果与四个组合整理公共能力建议：每项至少列两个真实消费者、重复代码、提炼前后代码、API 草案、性能与 Agent DX 影响，以及 core/tools/example-local 的归属。先复用已有工具和 Recipe，正式 core API 仍需要两个实际消费者和回归。
2. 用现有 EffectDefinition 作为参数的唯一来源，生成类型、API 文档、参数表、Agent 参考与验证元数据。十二例使用参数 JSON；Noise Dissolve 的 definition 是参数 TS 中的字面量，静态提取，不执行示例。检查参数和源类型一致、文档无遗漏或未知项、结构与 pipeline 参数进入结构键、API 引用有效，生成后可重复检查且不改冻结源码。
3. 完成两个独立 UV Remap/Pass Fusion Pilot。候选为 Emboss 输入扭曲与 Glass 镜头采样；最终选择须保留母算法、预乘/量化、纹素中心和采样语义。各自比较实际 pass、CPU update/encoding、GPU timestamp（可用时）、纹理、内存估计、独立视觉差异与资源退役。效果移到另一条管线不能仅凭截图相似认定正确。
4. Effect Driver Pilot 验证 pointer-position、pointer-x/y、time、auto-animate 与 map-range，接原生主循环并验证监听释放。它与两个融合 Pilot 分开裁定，不以 Node 合同或文件存在代替浏览器实证。

## 执行与边界

Lead 负责当前 Gate 的接线、独立审查、冻结采集与最终裁定；Orca Worker 负责明确授权的独立实施。每轮最多三名独立执行者，性能窗口串行。首批安排同源生成工具，随后做 Driver 与两个融合 Pilot 的真实采集。

现有十三例、collector、oracle、SDK 与当前四级证据闭包保持冻结。新工具和 Pilot 使用独立路径，参考固定 commit 不变，不加载上游 runtime、TypeGPU 或第二渲染 Canvas。先通过前后指标再决定优化层，不先新增 Material/Scene 抽象。

## 验收状态

| 项目                      | 状态               | 需要的证据                                                                                                       |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Wave1–4 前置链            | 原 SDK 冻结时 PASS | SDK 重建后当前字节需要重验；历史四级证据保留                                                                     |
| 能力归属建议              | 提案已交付         | [六项提案](wave5-capability-proposal.md)，性能与 Agent 收益待 Pilot 验证                                         |
| 同源生成与检查            | PASS（Node 合同）  | [47 条测试、类型消费与字节幂等](wave5-docs-generation-delivery.md)，不代替浏览器 Gate                            |
| Effect Driver Pilot       | 冻结候选六门 PASS  | [三浏览器84视觉/180边界/1200资源/18性能窗，34+7篡改全拒](driver-pilot-validation-delivery.md)                    |
| 两个 UV/Pass Fusion Pilot | PASS（受限研究）   | [完整六维、36 性能窗、38 篡改拒收](uv-fusion-pilots-validation-delivery.md)；GPU 有取舍，不默认融合              |
| Wave5 当前 SDK Gate       | BLOCKED            | [Driver、Fusion与Wave4前置SDK字节不一致](../evidence/shaders-absorption/wave5-current-r2-gate.json)，不推进Wave6 |
| Agent Gate / stable       | NOT_RUN            | 后续隔离公开资料 Benchmark；本 Wave 不代宣                                                                       |

问题按任务书九类登记。所有输出遵守固定十三项交付模板，合成夹具明确 NODE_CONTRACT，历史失败与原始证据保留。

SDK 继续变化时，汇总快照也会失效。r2 写出后再次复核只有 `currentSdk` 变化，冻结 Driver 校验和文档检查仍通过，三个阻塞结论不变；漂移观测（本地历史产物：`../../output/shaders-absorption/lead-w5-current-r2-drift-observation.json`）保留前后字节。对 r2 的实时验证因此拒收，未在失效基线上进行汇总篡改测试，也未覆盖原快照。待 SDK 稳定后生成新快照并刷新当前证据。
