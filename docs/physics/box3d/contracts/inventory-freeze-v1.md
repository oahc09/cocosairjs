# Box3D required inventory 正式技术冻结 v1

`inventory-frozen-v1.json` 将本次 required 技术分母冻结为 **2,128 cells、186 个执行定义、91 parent + 84 fixed references + U01/U02**。这只冻结测试身份和范围，不证明任何能力、环境兼容性、完整类别或 Gate 通过。

D02 正式范围只要求 `positiveMtExecutionRequired=true` 的 1,331 个 cell 提供真实正向 MT 执行；其余 18 个 MT 相关审计/原定负例不能取得兼容性 credit。六类正向目标的 required 枚举已技术冻结，实际支持仍必须通过对应真实测试证明。

全部 cell 仍为 `NOT_RUN`，时间戳为空、证据为空；2,056 个 cell 的资源阻塞保持不变。D04/D05/D07 仍待完成，fixture 尚未冻结，性能 baseline 尚未建立，G0 与其他 Gate 均不是 PASS。

## 文件组成与选择理由

- `inventory-frozen-v1.json`：完整且有序的 2,128 个 cell key 与初始状态；186 个 definition key、177 个来源 ID；候选/复核/原始输入 SHA；未完成准备事项与禁止原地改写策略。
- `inventory-freeze-review-v1.json`：D01/D02/D03/D06 的工程采纳记录、范围、v1.2 章节依据、工程修订号与文件 SHA。仅记录工程技术决定，不存对话原文或私有消息/线程标识，不建立新产品支持承诺。
- `tools/verify/box3d/inventory-freeze-v1.cjs`：仅使用 Node 内置模块的只读校验与完整表恢复工具。
- `tools/verify/box3d/inventory-freeze-v1.test.cjs`：21 项冻结完整性、恢复和拒绝突变测试。

采用 **hash-bound 候选内容 + 正式完整 cell 状态表 + 独立工程复核**，而不是复制一次已有的数 MB fixture 断言。候选五文件逐字节保留；SHA 绑定使恢复不依赖“最新版本”或人工理解。

正式文件、复核文件、候选、policy、旧说明及旧工具均有独立固定字节锚点。候选列出的所有原始输入也逐项验证真实字节，包括原计划、design、resources、API、预算、decisions 和旧生成器。修改引用里的 hash 不能使被篡改内容变成有效 v1。

## 校验与恢复

```sh
node tools/verify/box3d/inventory-freeze-v1.cjs --check
node tools/verify/box3d/inventory-freeze-v1.cjs --resolve-json
node --test tools/verify/box3d/inventory-freeze-v1.test.cjs
```

`--resolve-json` 仅向 stdout 输出完整机器可读表，不写任何文件。恢复结果包含：

- 每个环境/variant/workerCount/Debug-Release/阶段/Gate/fixture/证据/资源要求完整的 `requiredCells`。
- 与候选一致的 186 个执行定义、177 个来源聚合、fixture 逐行断言与证据要求。
- 四项已采纳分母决定，以及仍待完成的 D04/D05/D07。
- 精确来源 SHA 与工程复核依据。

cell 原始身份和其他字段保持不变，只应用明确的正式状态覆盖：`requirementStatus=FROZEN_REQUIRED`、保留初始 NOT_RUN/空证据，将已采纳的四项分母决定从 pending 列表移出，并把原始规划决定另存为 `planningDecisionIds`。资源、真人、fixture 或 baseline 不就绪不会重新使技术分母变成未定义，也不会被错误转换成通过。

工具提供 `archiveRequirements()` 返回恢复所需的版本化文件清单。恢复包还应包含本只读 verifier；不需要 node_modules、原生构建、浏览器、Git 或网络。测试已将所需文件复制到独立临时目录，仅用 Node 恢复并逐项比较完整结果。

## 不变性与后续版本

没有 `--write`、repair、update 或自动再生入口。未知参数直接失败。任何被绑定输入变化，包括仅改变原始字节，都会拒绝当前目录的 v1 校验，不自动重算 hash 或改写正式分母。

如需变更范围或被冻结的设计输入，应创建并复核新版本，保留 v1、原始输入和失败记录。旧 v1 仍可用归档的原始字节机械恢复。未来执行证据应独立保存并引用正式 cell 身份，不通过修改本次初始冻结记录来引入 PASS。

普通后续 ledger 记录不在本冻结输入中。若要更新已绑定的 design/resources/API/预算等文件，应同时安排版本化的新冻结或保留可恢复的原版本，不能静默覆盖 v1 来源。

## 已验证边界

21 项测试覆盖 exact cells/definitions/references、工程复核闭合、准备度分离、正向 MT/真机/真人/双构建、完整表无依赖恢复、只读行为、拒绝写入参数、漏项/重复/换 variant、PASS/证据注入、未决分母、伪复核、原始 hash 漂移、aggregate 缩减，以及同时篡改复核与引用的拒绝。

这些测试仅证明清单及冻结工具完整，绝不是 2,128 项 Box3D 验收已执行。
