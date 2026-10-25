# SDK223 EX02 首轮有限观察（2026-10-25）

**有限 Firefox 实测与原件复核，不是 EX02 / T20 / 全矩阵验收通过。**

Source：`2effe478a5af32ddc6e2f4ef84a2f2eb1a542930`；runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build **223**；Firefox 158.0.1。

| generation | 观察 | frames | score |
|---:|---|---:|---:|
| 1 | base，无 impulse | 600 | 0 |
| 2 | center impulse + 三档 mass | 600 | 3 |
| 3 | offset impulse | 600 | 2 |
| 4 | 运动中 Reset，INTERRUPTED | 36 | 0 |
| 5 | 重建后观察 | 600 | 0 |

共 **2436 连续 ticks**。这些是观察窗口，不是完整验收通过计数。

## 有限证据

- mass .5 / 1 / 2 分别在658/691/725之后请求，下一帧659/692/726的10个 native pin 质量读回正确。body-relative shape 误差约 **1.903×10⁻⁸ m**，维度不变。
- COM 一致性误差约 **2.461×10⁻⁷ m**，pose混合指标约 **1.8×10⁻⁷**（位置L2与四元数符号不变L2差的最大值，并非纯米单位）；平台位置/target差约 **10⁻⁶ m**。这些一致性观察不替代独立 COM/惯量矩阵验证。
- center 后 ω≈(−.4084,0,0)，offset 后 ω≈(−.4084,23.1404,0)，两者 vz≈−5.9408。接地与平台相互作用仍存在，不能充当隔离冲量验证。
- 16份双阶段 public releaseScene receipts 全部 released；8份 asset ledger 均 remainingValid=0、destroyErrors=[]。最终 normalClose 的 module/world released，cleanupErrors为空；GPU unavailable，runtime等仍 retained，**不是零泄漏证明**。
- 7份真实下载的 hash/size 一致，request后新鲜度约115–398 ms；before/after identity结构相同。原件无应用 fault；console **2条warning**（WebGL lazy-init、WASM sourcemap URL）保留，不宣称干净console。

## 缺口

Stop仅在窗口结束后观察，**Stop-during-motion未覆盖**；后续Start/Stop未观察到新run，不补试、不宣称成功。g4的36帧Reset不等于20轮reset覆盖。完整EX02/T20/矩阵、20reset、故障竞争、独立COM/惯量矩阵、gallery及移动端仍未通过；acceptance/reset20保持NOT_RUN。

## 证据

最终 raw `(6)` SHA-256：`724b7f2a1f9d0c7b5dcbb59de31dbb57ba8d1f80305509acdd74523477ddf487`。

机器摘要：[sdk223-ex02-initial-observations-20261025.json](sdk223-ex02-initial-observations-20261025.json)，SHA-256：`1b9b2f9ca896af62d3d4b572a66e835128ecbc1ff0036f04f868dd959841516c`。

仅附相对证据路径、字节数与哈希；全量raw原件另行保留，不随报告上传。摘要不是自包含重放包，不改写旧证据。
