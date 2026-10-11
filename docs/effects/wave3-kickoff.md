# Wave 3：Liquid Metal、Cursor Trail、Glass

2026-10-10。[Wave2 当前 Engine Gate](../evidence/shaders-absorption/wave2-current-gate.json)已 PASS，允许按[任务计划](../../ai/plans/shaders-absorption-task-plan.md)开始本 Wave。Agent Gate 仍 NOT_RUN；Wave3 实施和采集尚不构成 Wave3 Gate 通过。

| 效果             | 实现重点                                   | 独立验收重点                                                       | 当前分工                                      |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- |
| E07 Liquid Metal | 动画噪声、差分法线、程序环境反射、质量档位 | 噪声与法线金标、反射方向、时间确定性；不同档位的真实成本和画面差异 | Orca Worker 小三实施；Lead 独立审查及串行采集 |
| E08 Cursor Trail | 原生输入与有上限的动态轨迹数据             | 可信 pointer/touch、resize、轨迹上限、暂停/重置/销毁和资源退役     | Orca Worker部分实施；Lead接管收口并实证PASS   |
| E09 Glass        | 原生 scene texture、折射、模糊、色散与高光 | UV/alpha、透明合成、同页 resize、原生 Pass 数及纹理所有权          | Lead实施、独立oracle及三浏览器实证PASS        |

固定来源仍为 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，逐文件身份见[来源记录](upstream-reference.json)。E07 主参考 `packages/core/src/shaders/LiquidMetal/index.ts` 的 SHA256 为 `6af799e9654a0504cb19d038e925af9adaa8ad3c613baea368565a12fa3277b0`。依赖 helper 必须核对真实实现与许可；缺失来源须记录具体获取结果，不能以相似外观或猜测公式替代。

Liquid Metal 是视觉材质，不是流体模拟。质量档位必须改变可说明的计算工作，并以实际测量验证；参数、速度、seed 或形状的本地扩展需明确区别于参考。CPU oracle 与 GLSL 分别实现，不能由同一生成器输出两份相同错误。

每例完成 Build、Runtime、Visual、Boundary、Resource、Performance；资源至少100轮，性能覆盖三浏览器和三个冻结 profile。实施阶段只运行 Node 合同、严格类型和格式检查；真实浏览器及性能窗口由 Lead 冻结输入后串行执行。复用当前 shader-scoped WebKit 启动项、真实 HTTP 隔离和 Firefox 导航后 DPR 修复，禁止绕过 CocosAirJS 或另建渲染 canvas。

Gallery 清单、正式库存和 Gate 由 Lead 接线。保存所有失败尝试，按九类报告问题；Engine Gate 与仅公开资料的 Agent Gate 隔离。先有多个真实消费者再决定公共能力，不在本轮提前扩充 core API。Wave3 三例完整 Gate 未通过，不进入 Wave4。

2026-10-10 后续：[E07六维交付](liquid-metal-validation-delivery.md)已通过三浏览器39视觉、282参数边界、300资源轮、同页resize及18个双质量性能窗口。Lead保存首轮色阶失败并独立修复门禁。小三接续E08部分实施后因429配额中止，Lead接管完成：[E08六维交付](cursor-trail-validation-delivery.md)当前PASS，36标准视觉/45PNG、可信鼠标与协议触摸、84边界、300资源轮、9活数据性能窗口。Gallery现180项，原179项逐项保持；E09已通过解析形状/Vogel范围，完整Wave3 Gate及限制见[汇总交付](wave3-validation-delivery.md)。
