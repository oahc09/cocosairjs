# B1 独立冷读复核

结果：6/6 completion checks 通过，complete=true，outcome=success。此结论仅是冻结问题的文档阅读回答复核，不是引擎或当前场景验收。

阅读顺序：完整 host-minimal L0 → 完整 router 一次 → cocosair-rendering owner → lighting-units.md → shadow-matrix.md。读取内容足以回答后停止，无重复文档读取，无其他 trial、当前 skills、运行时、Git、网络或 memory 输入。仅通过指定 helper 的 init/l0/read/seal 获取冻结材料与封存检查。

L0 和所有 read 均以命令内层 30000、functions.exec 外层 30000 输出预算完整收到。真实 chunk receipts 已逐项记入 trial.json/events.jsonl。模型精确 build 未公开，未编造。

answer.md 先写入，再登记完整读取 attestation，然后 seal；seal 返回 answer_hash=ff7bd1d0e6f503ea93bea374c65336a411399b285292f24b0ad05e5a033a2fdf 后才查看 completion checks，未修改答案。answer_checks.evidence 均从封存答案截取连续原文，并以字符串包含校验确认；详细引用见 trial.json。六项依次为 lighting-units、exposure-slots、main-light、shadow-support、switches-and-bounds、evidence-limits。

保留失败：首次 init 使用 --snapshot/--trial 错误参数，exit_code=1，Unknown scenario，chunk_id=44c3f3。尚未取得文档；向主代理索取位置参数协议后重试成功。失败调用完整命令及摘要记录于 failed-calls.json 和 trial.failed_calls，不计作文档输入，也不隐藏该失败。

events.jsonl 为含 trial 全字段的单行 JSON 记录。未提交 Git，未修改输出目录外文件。
