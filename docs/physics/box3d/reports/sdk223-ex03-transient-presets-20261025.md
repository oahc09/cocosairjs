# SDK223 EX03 transient/preset 有限观察与首次失败（2026-10-25）

**前三项取得有限观察；enabled preset 首次 FAILED / BLOCKED 后立即停止后续项目。不是 EX03 / C22 / C28 / G5 完整 PASS，未宣称已修复。**

Source：`4b41209d104860cd2fc5f1d99a23946d8f5e8b74`；runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build **223**。

## 已完成的观察

- fast-solid 120 m/s：24 ticks、24份完整资格记录，native enter/stay/exit **1/0/1**。
- moving-sensor 120 m/s：24 ticks、24份完整资格记录，native **0/0/0**。
- 两者各有1个 query hit，**不能拿 query 命中替代 native callback**。96个内部 substeps 仍是源码模型，不是本轮 native 实测值，不据此推导全局支持。
- mask g3：480 ticks；唯一 anchor129，idle131 mask1→0、133恢复1，两次均重算 overlap=true；native exit132、reenter134、最终exit208，总 **4/231/4**。anchor不重复触发、不rearm。

## 首次失败及停止

enabled g4 的首次终态观察间隔 **13.086秒**，出现 `BLOCKED / duplicate-enter`：enter609、stay610/611；disable611后未观察到exit，restore613时仍overlap；真实enter614被应用ledger拒绝。

保留 **86 attempted clocks / 85完整postframes**；fault后afterPhysics早退，不能写成86完整帧或480 ticks完成。源码与SDK223对照定位到 disabled channel静默退役与应用ledger状态假设不一致；**已定位为fixture策略错误而非engine duplicate缺陷；本报告未修复、未回归**，不吞掉duplicate异常。

首失败后 trigger preset、reset preset、close-during-motion **均未继续运行**。

## 失败后的关闭与边界

失败raw与最终close raw的历史runs/log前缀一致，未覆盖失败。双阶段public release均released，10项asset destroy请求，ownedNodes/Assets均0；正常Close released，module/world released，pending/failure/cleanupErrors为空。

这只是**应用fault后正常Close**，不是注入SDK关闭失败或retry语义通过。GPU unavailable且runtime等retained，不能宣称零泄漏；有限观察不证明所有sensor/CCD支持。未来修正不回填本source结果。

Console保留generateMipmap与WASM source-map warnings；应用fault保留于raw/UI，不宣称零console error。

## 证据

before/after/frozen与5份raw identity一致，下载新鲜度凭证及原件hash已封存。重复Close、clean reopen与窄视口也未测。

- 失败raw `(15)`：8,864,198 B，SHA-256 `b4660152a6a1a5868c849f6cb1b178a7f8de9a8441d154008700b4155b411023`。
- 正常关闭raw `(16)`：8,867,345 B，SHA-256 `2243c3b114b5427a461f3b6c03073c16d11edf158f9dc65213a188fb0512f084`。
- 机器摘要：[sdk223-ex03-transient-presets-20261025.json](sdk223-ex03-transient-presets-20261025.json)，SHA-256 `c491f3e57eee9414e6ef5c8fdb3dd3d59e97ad217c818c0ffc76ad6f848bd3ae`。

仅列相对证据路径/字节数/哈希，不上传全量raw，不是自包含重放包；原始失败与关闭证据均保留。
