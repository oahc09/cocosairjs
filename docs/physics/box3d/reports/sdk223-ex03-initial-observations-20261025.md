# SDK223 EX03 第一轮有限观察（2026-10-25）

**已有 UI 的有限 native 实测，不是 EX03 / T20 / C21–C28 / G5 完整 PASS。**

Source：`3b362b254a9c38ae18815e1faa1b0d7d0542c9e9`；runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build **223**。未混入后续 120 m/s 诊断或预置安全控件序列候选。

## 已观察与未覆盖

- **A / g1：480 ticks。** 三区各 1 enter / 78 stay / 1 exit，总 **3 / 234 / 3**，count 为 1。门在 hook201 后请求，通过公开 kinematic target，tick202 的 bodyY 从 0 到 2。spawn321、销毁/retire 安全点请求351，相隔30 ticks；这是请求间隔，不是 native free 精确时间证明。
- **B：** g2 没有 toggle。g3 mask 在980/991切换、enter1041；g4 enabled 在1508/1518切换、enter1521，均发生在进入前，不能计作区内双向覆盖。g5 在区内 tick2013 从 trigger 改 solid，exit2014；visitor 随后停在 x≈−2.65、v=0，反向恢复未证实。
- **C：** g6 enter2481 后在 idle 请求退休，之后399帧为 retired、无新 accepted 回调；不证明 native 瞬时 free，也未覆盖自然迟到回调的拒绝分支。g7 运动13 ticks 后 reset/release，不写成480 ticks完成或超时。
- **D：** 30 m/s fast-solid 和 moving-sensor 各24 ticks，native enter/stay/exit 分别 **1/1/1、1/0/1**。两者第4 tick 端点均在 x≈0 重叠，不能证明纯瞬态、两端均不重叠的 CCD 或所有 sensor 支持；query 预测与 native 事件严格分开。
- **E：** 正常 close released，module/world released，pending/failures/cleanupErrors 均空。GPU unavailable，runtime 等资源仍 retained；不宣称零泄漏。

三区活动瞬态截图及 spawned cube 可见性未捕获，仅有终态证据。窄视口、错误注入、重复 Close、关闭/释放并发未测。Console 保留 WebGL lazy-init 与 WASM sourcemap URL warnings；raw 应用 faults 为空，不等于所有错误路径验证通过。

## 身份与证据

12份真实下载的 request epoch / mtime 与 freshness bindings 一致；before/after identity 逐字一致。原件、rows 和哈希经独立复核，未修改旧证据。

- 原 result SHA-256：`a6430f54d36cb80a34919151f8c46db43115f3dd74abe8cb390dca2974142b01`。
- 最终 raw `(11)`：8,241,561 B；SHA-256 `f81101036ca08fb0fb785f3313c999cc250e356cc5b39802db694b344dee6e44`。
- 机器摘要：[sdk223-ex03-initial-observations-20261025.json](sdk223-ex03-initial-observations-20261025.json)，SHA-256 `398f31a75fc3a89065c8bac70d0aaec504deef2b6d5f780cdb46a00eadf0dddf`。

摘要仅列原件相对证据路径、字节数及哈希；全量 raw 不随报告入库，不构成自包含重放包。后续候选和未运行项目不能回填为本 source 的通过项。
