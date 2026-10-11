# Wave 2：Holographic、Neon、Emboss

2026-10-10。前置 [Wave 1 当前 Engine Gate](../evidence/shaders-absorption/wave1-r21-current-gate.json) 已 PASS；本页只描述 Wave 2 分工和验收，不将任何未执行子项写成通过。固定计划见 [吸收任务计划](../../ai/plans/shaders-absorption-task-plan.md)。

| 效果            | 首先实现的内容                               | 独立正确性检查                                                        | 分工                                            |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| E03 Holographic | 形状法线、皱褶有限差分、色谱和时间连续性     | 法线 stencil、角度单位、色谱三等分、固定 seed/time；噪声差异明确记录  | Orca Worker 小三实施，Lead 独立验收             |
| E04 Neon        | 有符号距离管体、热核、双层解析光晕、透明合成 | 分离 core/tube/glow；距离衰减与远端 alpha=0；反向 smoothstep 显式重写 | Orca Worker 小三（实施阶段）                    |
| E05 Emboss      | 有符号高度、差分法线、输入纹理与浮雕阴影     | 平面/斜坡预期、光向和深度反转、透明输入及预乘边界                     | Orca Worker 小三（下一实施任务），Lead 独立验收 |

参考仍固定 `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，本地只读来源位于 `output/shaders-absorption/reference/`；来源、逐文件 SHA 和许可见 [上游索引](upstream-index.md) 与 [来源记录](upstream-reference.json)。每例独立 UPSTREAM.md 保留算法采用、差异、参考路径和适用通知。

先实现 example-local 算法与 CPU oracle、参数表、原生材质和生命周期，再评估跨实例重复。不直接引入 TypeGPU 或上游运行时，不新建渲染 canvas，不因外观相似判定正确，不提前创建公共 SDF/Noise/Color 抽象。

各例必须完成 Build、Runtime、Visual、Boundary、Resource、Performance。Browser/performance 测量由 Lead 冻结源码和 oracle 后串行授权；实施阶段的 Node/Jest/strict/格式检查不能冒称浏览器通过。资源至少100轮，性能三个冻结 profile，DPR/backing/实际隔离头和时钟精度均复用已验证环境合同。

Gallery 元数据、共享清单、库存与正式台账由 Lead 统一接线，独立例不能改写 Wave 1 来源或报告。所有输出新路径保留失败尝试，终态按固定十三项模板；问题按九类分类，Engine/Agent Gate 分开。当前 Wave 2 Engine Gate 和 Agent Gate 均 NOT_RUN；完整 Gate 未过不进入 Wave 3。

2026-10-10：E04 Neon 的两个解析形状已通过 [独立六维 Gate](../evidence/shaders-absorption/e04-neon-current-gate.json)；实施渠道为 Orca Worker，采集和裁定为 Lead。E03/E05 未验收，不能以 Neon 的子集通过升级整个 Wave。E05 继续由小三实施，性能采集由 Lead 冻结输入后统一串行执行。

2026-10-10 后续：[E05 Emboss 六维 Gate](../evidence/shaders-absorption/e05-emboss-current-gate.json)已 PASS，固定十三项见[实证交付](emboss-validation-delivery.md)。E03 接续交给小三实施，Lead 独立审查和串行采集；不新开 Worker。`shaders-wave2-gate.cjs` 只读复核叶级 Gate、真实 OS 及显式错误日志，完整 Wave 必须精确覆盖 E03/E04/E05 三例，缺 E03 时不得推进 Wave3。

2026-10-10 最终验收：[Wave2当前Gate](../evidence/shaders-absorption/wave2-current-gate.json)已PASS，三个效果×三浏览器×六维共54维度，117视觉、654边界、900轮资源、27性能配置全部实测。上文分工与未验收描述为历史时点。固定十三项见[汇总交付](wave2-validation-delivery.md)，[公共能力初稿](wave2-capability-proposal.md)不新增core API。可进入Wave3，Agent Gate仍NOT_RUN。
