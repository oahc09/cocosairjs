# SDK223 EX09 Firefox 限定路线记录（2026-10-25）

**仅限预先声明的 D clearance 路线及正常关闭；不是完整业务或全计划通过。独立核验确认该限定结论。**

- Example source：`ef74207deb32097a5c09dec1f61131121a0bb955`。
- Runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，SDK build **223**。
- Firefox 158.0.1，官方 Linux x86_64 build 20261019185856；UI2 为修正操作流程后的独立单次运行。
- 原 audit 执行 exit 0；从导航开始至正常关闭导出复制耗时 **752.676441 秒 < 900 秒**，不含之后核验脚本耗时。
- RESULT 分数 **333**，O1/O2/O3 三条 ledger，commit active ticks 为 **3248 / 5854 / 8496**；6 个唯一商品被消耗，剩余 ticks **2304**。
- 6 次称重分别满足连续 30 ticks；3 次 packing 分别满足连续 45 ticks。每单的两个 crossing 对应两个唯一商品；一次错误 SKU 提交被拒绝，recoveries 0。
- 正常 application/module/world 关闭，无 cleanup failure（不等于进程回收或无泄漏证明）；运行前后 source、runtime、contracts identity 一致。

## 必须保留的异常与边界

1. 先前 Chrome 为 `INFRA_BLOCKED`：WebGL 2 不可用，未开始正式业务轮次，初始化失败故无正常 app close receipt。
2. 第一轮 Firefox 被陈旧窗口坐标操作意外关闭，为 `OPERATOR_INTERRUPTED`，没有 replay/business 结果。不得把本轮写成整个历史仅一次 attempt 或没有重试。
3. O3 的 B2 在 active tick **8489** crossing 时 strict XZ 合规；自 tick **8495** 起 +Z 越界，`maxZ = 0.43001237268416015 m`，相对 0.425 m 边界超出 **5.01237268416016 mm**。既定 pending-latch 允许后续订单完成，这不是全程 strict 或全局无穿透证明。O1/O2 及 O3 C1 的所检查 shipping 窗口未记录 strict 失败。
4. wall-contact 仅为后端缓存诊断：17 条记录中 14 条观察到 door/C4 pair，之后 3 条 `ok=false`（`identity-unavailable`）；不构成接触缺失或无穿透证明。`pendingSdkWrites=unknown`，不保证无 pending writes；缓存几何/冲量并非逐子步真值。
5. **formalPassCount = 0；完整 BIZ、BIZ07、G5、设备覆盖、真人验收及完整计划均未通过。原计划仍有实现缺口。** 本轮不是普通浏览器全矩阵认证，也不能覆盖恢复路线或全部物理性质。

## 证据

- 原 audit SHA-256：`ec8b2d9849a3b05be1397585ef6d6e1e1eac73d868d2e430eb2b469fff0d7f24`。
- 机器摘要：[sdk223-ex09-limited-route-2026-10-25.json](sdk223-ex09-limited-route-2026-10-25.json)，SHA-256：`66bb1ba1b890810bafa61e33c7a6174b4701994a5bb3f75560230285faedac3d`。
- 摘要包含原始 audit、7 个压缩阶段导出、request/receipt、fresh O3 admission、前后 identity 及预声明计划哈希；保留全部既有异常，未修改原证据。
- 大体积 raw 不随报告入库。哈希用于核对另行保留的原件，不能把本摘要视为自包含重放包。
