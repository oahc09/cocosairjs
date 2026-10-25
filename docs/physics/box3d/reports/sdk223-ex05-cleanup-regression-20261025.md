# SDK223 EX05 cleanup 有限回归（2026-10-25）

**仅新源码的有限 cleanup 观察，不继承旧90-trial资格，不是EX05全验收。**

Source：`58582dd1d5d3441ad9d33c87afaa075e70f59be1`；runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build223；Firefox158.0.1。未改原件/源码，未构建或追加重试。

- 唯一 normal trial：80 m/s、0.05 m静态wall、body、bullet=true，90 ticks；1个真实contact（tick3），crossed=false、poseError=0。最大采样表面重叠 **14.381361 mm**，最终源几何名义重叠约 **4.47 nm**；不是零穿透或连续子步证明。
- Reset：gen2 ticks91–103共13步，contact93，ABORTED；Close：gen4 ticks104–116共13步，contact106，ABORTED。二者末态v=0且已碰墙，只证明中断正在进行的观察窗口，**不证明非零运动中或撞前中断**。
- `05-before-reset`截图保留旧渲染状态，早期“未启动”的初判已被raw纠正：gen2确已开始。未修改截图或补造数据。
- raw32包含5组双阶段public release，raw35 clean app另1组；全部released、owned assets remainingValid=0、destroyErrors=[]。两次normalClose均module/world released。GPU unavailable、共享资源retained，**不宣称零泄漏**。
- raw32/33在disabled Close后整份字节相同，仅是同一终态重复导出，不是两次SDK Close调用。raw34为空trial/lifecycle；raw35仍空trial并正常close，旧history前缀不变。
- 18份served source与冻结源码及before/after/raw29–35身份一致；7份真实下载新鲜度约28–128 ms，before/after identity逐字相同。

## 保留异常与未覆盖

页面保留2条warning（WebGL lazy texture initialization、WASM sourcemap URL）。关窗后终端保留Firefox portal、Glean/crashreporter后台上传失败诊断；**不能说所有console/browser均干净**，也不能直接归为应用物理故障。导出应用lifecycle未见fault/async-error/close-failed。

真实SDK关闭失败注入、premount失败注入均 **NOT_RUN**。完整EX05/C26–C28、非零运动/撞前Reset与Close及新90-trial资格仍未取得；旧源码成绩不移植到本source。

## 证据

机器摘要：[sdk223-ex05-cleanup-regression-20261025.json](sdk223-ex05-cleanup-regression-20261025.json)，SHA-256：`d03e841b33b33b323f6a7f862d539f20a7ca426ca7c72de2d20dbc77cf3e40ff`。

摘要含原result/freshness/identity/7raw的相对证据路径、字节数与哈希。不上传全量raw，不构成自包含重放包；旧记录和后台诊断均保留。
