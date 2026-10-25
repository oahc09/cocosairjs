# SDK223 EX03 channel修复后有限回归（2026-10-25）

**新源码实例的fresh回归，不是完整EX03/G5或零泄漏通过；旧4b41209首次失败记录不回填。**

Source：`6e73abd892b17d2bcdaf2a0e10737ddf19c2e835`；runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build223。

## Channel与preset观察

- **enabled g1 / 480 ticks：** 真实enter81(epoch0)，idle83 disable显式application invalidation将epoch0→1，`nativeEvent=false`，epoch为应用ledger编号而非native token，没有伪造native exit；idle85恢复后真实enter86/exit160。native总 **4/231/3**，无fault；+2/+4两次操作均真实overlap。
- **trigger g2 / 480 ticks：** anchor561，idle563 solid→exit564；idle565恢复trigger时visitor已阻停在x≈−2.6388433、v=0，仍overlap→enter566持续stay至960。总 **2/396/1**，末态1个active pair合理；不能假定恢复速度或所有路径都会重入。
- **两项新120 m/s薄区诊断：** 各24 ticks/24资格记录，fast native **1/0/1**，moving-sensor native **0/0/0**；各1个query hit，不能替代native事件。内部substeps仍只属源码模型，不是实测值。
- **mask g5 / 480 ticks：** anchor1089，idle1091 mask1→0、1093恢复1，两次overlap；native exit1092/reenter1094，总 **4/231/4**，无fault。epoch0，无application invalidation（该处理仅用于enabled）。

## Motion与关闭

- g6运动9 clocks/frames后Reset，末x≈−3.85000014、vx=1；g7运动10 clocks/frames后Close，末x≈−3.83333349、vx=1。原raw无terminal status字段，不伪称ABORTED或480 ticks完成。
- 两者是普通lifecycle，无preset对象或待执行actions；**不是armed/anchored preset取消的真实覆盖**，该取消分支仍仅source/CPU证据。
- 双阶段release及assets0、主Close与clean reload Close均正常，module/world released、错误列表空。raw23/24字节相同、只有1份主close receipt，不是SDK失败重试资格；raw25/26空runs，26正常关闭。GPU unavailable、共享资源retained，不证明零泄漏。
- before/after/frozen及raw identity一致，原件hash与freshness留存。697px仅窄桌面控件可见，不是移动端资格。
- Console保留WASM sourcemap warning及identity页favicon error，不能宣称全程零console error。

## 证据与范围

机器摘要：[sdk223-ex03-channel-regression-20261025.json](sdk223-ex03-channel-regression-20261025.json)，SHA-256 `03752590d5dbe17a3b16f55182079dc09dd31a19affa2cc8054897f127417b77`。

仅附相对证据路径、字节数、哈希；不上传全量raw，不是自包含重放包。旧失败原件不改；本次只提供上述有限修复回归，不授予全局sensor/CCD支持、完整EX03/G5或设备矩阵通过。
