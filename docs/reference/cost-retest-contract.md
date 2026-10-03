# CB21：独立成本复测合同

本合同定义新 instrument cohort。它不覆盖外部旧 K0 tarball、gates、config、vendor、旧 Pair 或历史结果，也不把旧 N=1 自报 token/工具成本当成同模型的独立基线。用户已指定本次冷启动模型为 `gpt-6-luna`、reasoning effort 为 `high`；每个 Arm 必须用 `fork_turns=none` 的全新 agent，并真实记录该配置来源。不可见的 model revision、完整 system prompt 和 token 计量保持 null，并说明原因。

## 启动新 Pair

准备一个身份文件，只记录已确认配置，不填写猜测值：

```json
{
  "modelId": "gpt-6-luna",
  "reasoningEffort": "high",
  "selectionSource": "trusted-user-request",
  "modelRevision": null
}
```

默认命令只 dry-run；`--execute` 只向一个不存在的新目录写入，拒绝 SDK/历史 benchmark 树内的目标。第一 Pair：

```powershell
node tools/benchmark/prepare-cost-retest.mjs --bench-root=E:/AIProMax/Y2026M10/cocosairjs-competitive-agent-scenario-benchmark --candidate=<final-current.tgz> --run-root=E:/AIProMax/Y2026M10/cocosairjs-cb21-current-R01 --identity=<identity.json> --scenes=E01 --profiles=K1 --repeats=1
# 先审阅 dry-run 的候选 SHA、身份和 blockers；再加 --execute 创建，尚不会执行 Agent/API。
```

K1 至少三次重复，再用相同候选构建与仪器跑 matched K0：`--scenes=E01,E02,E05,E10 --profiles=K0,K1 --repeats=3`，共 24 Pair/48 Arm。Root 以同一提示词冻结配方分别派新 agent，只有引擎/工作目录/知识目录不同；Pair 两臂同批启动，实际启动差不超过 30 秒。正式 GPU/性能采样串行，禁止共用 GPU 并发测试。

## 因素分离

- 当前代码 × K0：新 bundle/types，历史 frozen README，不提供额外文档；反映当前代码与 API 包面的效果。
- 当前代码 × K1：**相同安装包/README/types**，只增加冻结的通用当前文档；比较 K1−K0 时只能归因为文档条件变化。
- 旧代码 × 旧 K0 若在同新 instrument 重跑，可单列 correction baseline；历史不同模型或自报成本只用于背景说明。
- 不可把“新代码+新文档同时变化”全部归因为代码修复，也不可把实际重复或 Pilot4 Pair 偷换为 60 Pair G6 全矩阵完成。

Materializer 不调用旧 `round create`。旧公开 coordinator/run-round 硬编码原 vendor 与根 node_modules，不能选择当前候选；`stageCreate` 的 auto 分支还会给 const batchArg 再赋值。直接更换旧 node_modules/vendor 会破坏原冻结依赖链。新目录有自己的 package、离线依赖、工作区、知识、公共 brief/spec、资产、COHORT/RUN-META；旧 G6 保持原状。

K0 与 K1 安装相同代码、类型和历史 README，包内通用 docs 剥离（仅保留第三方许可清单）。K1 AIR 只添加 materializer 明列的通用 API 页，排除 ai、实验结果、E01/E05/E10 实现与新场景 README；Three 使用原公开官方 K1 包。知识树 SHA 与候选 tarball SHA 独立冻结。安装源与 tarball重打包不是同一物理文件，报告同时保留原 tarball SHA 与实际可见 package 树 SHA，不能混用。

## 计量与适用范围

官方 `read_thread` 的新 agentThreadId、turn 和稳定 event ID 是执行事件的证据来源。按 event ID 去重，分别统计 `commandExecution`、`fileChange`、`mcpToolCall`，指标名称为 **observedExecutionEvents**。文件改动事件、函数运行次数、shell 命令次数都不能自动称为 Agent 工具调用总数。

只有能识别真实工具 invocation ID 时才填 `agentToolCalls`；token 只接受 provider/host 原始计量，无法获取时保持 null。build/browser 次数来自模板机器计数，wall time 来自可信 dispatch/完成时间戳。不得通过代理指标或估算 token 给成本门禁发 PASS；可先完成真实行为试验，未观测成本仍列缺证据。

新身份、臂提示词和工具政策的各自哈希不能冒充不可见的完整系统提示词哈希。新 Pair schema 与旧 official G6 schema 不混报；后续验证器必须消费新候选/工作区的冻结信息，不能沿用旧根依赖哈希硬判 ENV_DRIFT。新批次结果应保留失败与缺项，禁止覆盖、重置或删除失败 Arm。

## 独立验收入口

`node tools/benchmark/validate-cost-arm.mjs --cohort=<新批次目录> --prepare-instrument` 将公开 harness runner、离线依赖与实际 GPU 浏览器配置冻结到该批次的 `instrument/`，并写 `INSTRUMENT.json`。它拒绝覆盖已有 instrument，不读取旧结果或私有参考实现。

随后使用 `--cohort=<目录> --pair=PAIR-E01-K0-R01 --arm=arm-a --check-inputs` 只读检查候选包、实际安装树、知识、规范、提示词、政策、计数脚本、验证器与浏览器指纹。省略 `--check-inputs` 才实际构建并跑独立公开验证器，写该臂的 `independent-validation/`；已有结果不覆盖。该入口替代旧 root 依赖守卫，其他公开探针保持冻结。

Agent 结束时先冻结机器计数与成本记录，再运行独立验收。验证器额外执行的 build 单独记录 before/after，不能计为 Agent 成本。GPU/性能验收串行执行；`report.json` 的真实失败、错误、未支持环境与像素结果均保留，输入守卫通过本身不代表场景通过。
