# 事件传输 schema 修正

原 events.jsonl 使用 outcome=passed 与 answer_checks[].status=passed，不符合聚合器要求。原始字节完整保存为 events-reader-original.jsonl；父任务已保留的原聚合 FAIL 不被抹除。

此次仅将 outcome 改为 success，并将六项 status 字段替换为标准 passed:true。六项实际通过结论、criterion 和原引文均保持不变。没有再读取技能。

逐项 SHA-256 比较确认 answer.md、trial.json、payloads 全部原样保留；L0 和每次阅读的 tool_chunk_id 保持不变。封存答案 SHA-256 仍为 fee3a1e2d2dc87ddc40c0aa3e69cece2bd69a8c73aa20d4ce8abe42a0fbd4014。修正后各检查引文和标准字段之外的内容均与原记录一致。
