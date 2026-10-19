# 原始 B2 冷上下文阅读审查

结果：本题 success，5 项完成检查全部通过。此结果只表示固定快照的 B2 文档答题成功，不表示整个原始技能树或原 links 门通过；原 links 门 FAIL 的历史事实保留。

## 实际顺序

1. init 首次取得冻结问题与读取协议（工具 chunk 270631）。没有预读旧答案、报告、任务计划、fixture 评分或其他试验。
2. l0 全量收到 22 条路由字段（chunk 1c6ab3），之后才读 router。另附 L0receipt.json。
3. 全文读取 skills/cocosair/SKILL.md 一次（chunk 8efc91）。
4. 根据 L0 和 router 自主选择 rendering 主责，全文读取 skills/cocosair-rendering/SKILL.md（chunk 417e39）。
5. 针对默认导出、custom pipeline 配置及证据问题，只增读 skills/cocosair-rendering/references/pipeline-reachability.md 全文（chunk 127316）。
6. 能够完整回答后写 answer.md，并执行 seal（chunk c8deac）；completion_checks 在此次 seal 返回中首次呈现。未在看到检查后补读来源或改答案。
7. 检查自己的封存答案与 trial 元数据，用封存答案中的连续原文作每项 evidence；脚本逐项断言 evidence 确实存在，并校验 answer_hash 未变。

## 接收与限制

每次 functions.exec 外层和 exec_command 内层均设 max_output_tokens: 30000。阅读者在上下文中实际完整接收 L0 与三个全文，无截断、重复阅读、缺文件尝试或失败阅读。工具 chunk ID 均复制实际可见返回值，没有估计。read_chars/read_bytes 延用 helper 的原始记账值，没有把保存在磁盘的 payload 当作接收证明；接收确认来自实际可见响应。

只从冻结原始快照读取技能文档，没有从工作树、树外 manual、网络或其他试验补齐内容，没有执行引擎源码、构建或浏览器测试，也没有修改技能或 helper。没有遇到本题必须读取而缺失的文档。原 links 门并未重跑或修复。

答案明示历史浏览器报告、默认包和 variant 的边界；文档中的指纹数值按历史引用表述，不冒充本次测量。开始、封存及结束时间取自实际工具记录或系统时间；没有猜测时间。

完整 trial 对象同时保存为 trial.json 和单行 events.jsonl；最终正式聚合由主线程进行。
