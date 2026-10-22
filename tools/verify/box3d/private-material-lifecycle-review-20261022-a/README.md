# Box3D B3 私有材质值及 owner 生命周期独立审阅

结论：在本次限定范围中，未确认需要阻断当前候选的新增实现缺陷。该结论是只读源码审阅与纯协议/模拟环境控制的结果，不是实际 World/WASM 验收，也不继承旧 source identity 的 PASS。

## 精确对象与边界

- 输入：`../box3d-private-material-integration-20261022/attempt-b-inputs.json` 的 11 源冻结快照。
- 11 个快照哈希及当前主树哈希在开始与结束核查时全部匹配。详见 `evidence/source-verification.json`。
- 主树基线 HEAD：45b526f248575a0542af8eed591c0cf8c8a1ba8d；审阅对象是其后的未提交 composite，而非这个 HEAD 的提交树。
- 私有值 primitive 新身份：06ac7eada947bc565868f9dffa0eda6e68dfeee337a34fb4912d890f7f7e2682。flatMap 改为 forEach 后重新运行控制，未直接复用 fb1be… 的结论。
- 未修改主树、Git 或远端；未运行工程构建、native 构建、全 clone、大拷贝。只在此目录写入小型审阅材料并进行单源 transpile/纯控制。
- 未读取凭据或受限会话目录。

## 独立运行的证据

1. 当前冻结 primitive 的 80 个纯协议控制全部通过：candidate 56、reviewer 13、phase 6、repair 5。详见 `evidence/current-source-controls.json` 及对应原始日志。
2. 增补 8 个 exact-source owner 协议控制全部通过：`evidence/owner-protocol-controls.json`，可复跑脚本 `owner-protocol-controls.cjs`。
   - 使用冻结 `world-command-owner.ts`、真实值 registry、真实 identity bridge、真实 B0 registry 以及 mutation guard 源码。
   - Engine 类、World 对象、Queue、transform barrier、material-copy helper 是明确的 mock。没有真实 World 构造，没有 native read/write。
   - 覆盖 provisional explicit 阻止值修改及销毁、initialize 的实际发布、inactive explicit 缓存提交、default+explicit 同 asset 合并、clone 实际发布、clone effect 后失败候选保留、faulted component cleanup 不能冒充释放、confirmed/unknown world lease 关闭、foreign System/world 入场拒绝、精确 component membership 释放。
3. transpile 仅用于执行这些 JavaScript 控制，不构成 TypeScript 类型检查。

## 关键路径审阅结果（行号均属于冻结快照）

- 最早值入场和原标量/批量语义：`assets/physics-material.ts:71–99,119–147,167–195,216–244,319–357`；setValues 参数明确重排为 friction/restitution/rolling/spinning，before/actual 使用资产内部缓存，destroy 在 `296–299` 先检查所有权。
- owner scope、exact authority 和全目标准备：`world-command-owner.ts:352–409`；authority 在 `356–362` 消耗，随后组件准备在相同 context 下运行；`world.ts:317–380` 在 plan 生成时读取全部 native shape material，再暴露单次 invoke/verify/cache commit。
- default+explicit 不能重复命中同一 shape：`world.ts:180–190` 将 explicit component shapes 与 inherited-only default shapes 合并，`327–330` 另有去重拒绝；`world-command-owner.ts:376–390` 使用实际私有 binding identity。
- inactive explicit 没有伪造 native target：`shared-body.ts:661–674` 返回 shape=null 但保留 prepared cache commit；`box-sphere-shape.ts:96–110` 仍准备并提交 adapter geometry。inactive inherited geometry 保留 material=null，由最新 world default cache 在启用时生效，不需要把它错误转换为 explicit。
- provisional 到实际 initialize 发布：`world-command-owner.ts:297–310` 初次注册 initialized=false；`628–629,709,725–739` 仅在 identity transaction 实际 commit 后发布 initialized=true。Collider 的 `508–530` 是实际初始化 commit 入口。
- clone reserve、actual publish 与失败候选：`world-command-owner.ts:622–630,683–695,725–739,750–785`；`physics-material-transaction.ts:503–545` 先保护并保留 clone 身份后读取/检查 clone coefficients。已经进入 effect 的失败不 cancel membership；实际旧值与候选均被保留直至独立 teardown。
- 不 rollback/replay：`physics-material-values-transaction.ts:748–760` 先撤销 operation authority，再记录 entered-unknown/returned 与独立 readback 状态。`world.ts:350–367` 与 `382–395` 不尝试补偿 setters。后续失败由 `831–886` 整体撤销 affected owners 并独立释放 scopes。
- scalar no-change commit failure：`physics-material-values-transaction.ts:779–788` 在 owner.commit 之前标记 effectsEntered 与 entered-unknown；当前源码的 80 控制重新验证该修复仍成立。
- public subscriptions：private capability 来自 `physics-material-transaction.ts:217–228,276,445–446` 的可信注册；Collider `126–145,164–179,518–525` 和 System `280–289` 都跳过私有 owner 的公开 physics listener 编辑。值事务在 native/cache propagation 后才公开 emit (`physics-material-values-transaction.ts:746–772`)。
- 暂停/foreign owner 入场：值路径使用 `#begin('material')` 而不是 stepping admission；scope 在 `world-command-owner.ts:835–854` 先检查 phase 与实际 System/world binding，不隐式恢复暂停。foreign binding 的读前拒绝有新增模拟 owner 控制；本次没有新增实际暂停 World 证据。
- component fault cleanup 不是 native release 证明：`world-command-owner.ts:801–816` 只在 idle 才移除显式 membership；`shared-body.ts:358–365,630–645` 的 fault cleanup 不重试 native。8 个增补控制验证 faulted component cleanup 后 old/candidate destroy 仍被阻止。
- world teardown：`world.ts:723–764` 仅在 destroyWorld 返回并完成 world 清理后给 confirmed=true；`world-command-owner.ts:949–1009` 用这个独立事实 close lease；primitive `498–515` 在 unknown 保留 tombstone/pending。新增模拟 owner 控制验证 confirmed 可释放、unknown 不可销毁。

## 不构成通过的内容与仍需补足的实际证据

- 上述 8 个控制没有验证真实 shape native 状态、native 未知失败注入、readback failure、真实暂停队列、真实 Collider 生命周期、真实 World teardown 的资源归还。
- parent 的 N4 Release 保存 RED 重跑与其 receipts 应独立判断。本审阅未把已有日志文字当成本次 native 验证。
- mixed-backend neutral ledger 仍未提供；多 owner mock 不代表允许多个同时活跃 singleton worlds。
- 2,128 正式 required cells 全部保持 NOT_RUN；九个 Gate 全部未通过；real producer 未接入；stagedCommandsSupported=false；unifiedTransactionsSupported=false。

没有为满足审阅形式而将未证明的可疑路径列为“实际 bug”。源码静态审阅未发现新 blocker，与实际生产接线已被完整资格验证是两种不同结论。
