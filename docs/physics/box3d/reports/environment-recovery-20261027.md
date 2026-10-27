# Box3D：环境重置后的证据边界与恢复计划

新说明记录时间：2026-10-27 09:38 UTC。仓库：`oahc09/cocosairjs`；分支：`feat/box3d-rebuild-20261022`。这是本轮重新整理的说明，**不是遗失报告、raw 或 SDK 的原字节恢复，也不是新的运行验收报告**。

## 本轮直接核验的事实

- 当前执行环境 hostname 为 `8a8701d643f0`；此前任务根 `/workspace/scratch/62d43a81bbde/box3d-trim-20261027` 不存在。本轮目录为同一当前环境内的 `/workspace/scratch/62d43a81bbde/box3d-recovery-20261027T0928`。这记录环境重置后的现状，不代表主动迁移或另开云任务。
- 远端分支 HEAD 为 `80be38bce03528d4ba7f445481ce35a6da78de83`。该提交保存 `lastBuildNumber: 229`；**计数器本身不证明构建、声明或 APP 通过**，也不能用来补造丢失的运行回执。
- owner ACK 修复已保存于 `14073d7f05539e23a7367dd35ff52996758110fe`：仅允许实际注册返回、精确匹配的 world/System 级默认材质 observer 保留；其他空世界、pending ownership 和清理守卫不删除。提交存在不等于修复后 APP 已通过。
- 当前远端 [SDK228 构建说明](sdk228-build-and-declarations-20261027.md)及[机器摘要](sdk228-build-and-declarations-20261027.json)已重新读取并逐字核对 Git blob。MD 的 SHA256 为 `e707d4423c7dbc6fc3922e0ebbed4b1c6357e56156f372277d0aa0a72b29c009`，JSON 为 `2a9a6c25f07499d1e3f0f5b265d1537727f15601d75fdbd16bfcdf0937b778d9`。恢复的是这两份**已提交报告的字节**，不是其所引用的 SDK、原始日志或独立证据目录；报告不是自含重放包。

## 对话历史中的执行结果：原件现不可用

以下结果来自执行 worker、独立 reviewer 和父线程此前的对话汇报。本轮没有原 raw 可重新计算，故统一标为 **HISTORICAL_REPORTED / ORIGINAL_BYTES_UNAVAILABLE**；保留历史结果，不将其伪装成本轮重验或可直接复用的资格。

- **APP228：实际严格 FAIL，0/100 qualified。** 当时使用 SDK228、runtime/native producer `fb825da65c8cd259ee8912adb24b7caaa0a64b6a` 和已提交原 APP v2 fixture。首轮 step58、108 次回调 后，release receipt 报 `AIR_E_BOX3D_CONFIG`：`Empty native counts disagree with retained owner identities or targets.` 四项 native live counts 为 0、resources 为空、scene/material 已失效；三点 ledger 为 36096 → 108764 → 113036，释放后仍比初始多 76940。按当时已审源码及调用顺序，owner ACK 守卫的拒绝在 native trim 调用之前；这是源码顺序推断，不是 raw 中独立记录的 trim 调用计数。raw 没有私有集合细分，不能据此断言只有一个集合保留。原 raw、未提交的失败报告候选及其冻结材料目前不可用；本说明不重建它们，也不改写失败为通过。
- **SDK229：当时真实 fresh ST、ESM 和 DTS 通过并经过独立评审。** ST attempt1 虽本体门禁通过，但两处准备目录漂移导致外层 FAIL；后续独立 ST attempt2 通过。随后 ESM229 和 fresh DTS 七项检查通过，最终报告为 25 个 SDK 文件。以上是当时执行/评审汇报；当前 ST/ESM/DTS 原回执、日志及 SDK 25 文件均 **UNAVAILABLE**，不能凭历史摘要、原 hash 或远端 counter229 恢复原资格材料。旧 attempt1 的 FAIL 不被后续通过覆盖。
- **APP229：NOT_RUN。** 当时只准备过未提交的 v4 runner 源码候选，没有 APP229 实际运行结果；该候选及原 manifest 也未恢复。SDK229 构建通过不推出 APP229/C20 通过。

此前已提交的 SDK228/ST/host 报告保持原字节，不追改其当时记录。历史 absolute path、报告内的 hash 或保存的数字不是文件仍存在的证据。旧失败和 UNKNOWN 仍成立；本轮环境重置不补证旧进程关闭，也不证明全局无泄漏。

## 下一条可验证链

1. 从固定远端提交恢复所需源码闭包，逐 blob 核验；任何历史包仅能作为逐字匹配的源码候选，不复用旧 runtime 或 PASS。保留 owner 修复及原 C20 fixture、同 app/world、100 场景、初始严格基线、原预算和关闭契约。
2. 为新 **SDK230** 建立独立 fresh ST → 全 feature ESM → fresh DTS 检查链，记录实际 producer、工具/依赖、命令、原始 stdout/stderr、退出与进程树关闭、输入前后 hash 和新产物 hash。成功 ESM 才消耗下一构建号；不预先写入 230，不重用 229 身份或其旧回执。失败使用新 attempt 保留，不能改门槛重标。
3. 在该新链真实完成、审核及新 runner/input-lock 就绪后，单独执行原严格 APP C20；不换 world、不 warmup、不重设 baseline、不隐藏分配。APP 成功与物理关闭分别取证，失败则继续保留失败并修复原因。
4. 及时提交本轮新源码/小型事实说明到同一授权分支。大包及 raw 的持久化须有明确授权目的地与真实存储回执；不能再把临时路径当持久化证明。

截至本说明，SDK230 的 fresh 构建及 APP 验收结果尚未产生；它们由后续独立记录证明。**Box3D 仍 NOT COMPLETE，原 35-task / 91-category / 9-example / G0–G8 范围不缩减，严格 C20 没有新的通过结论。**
