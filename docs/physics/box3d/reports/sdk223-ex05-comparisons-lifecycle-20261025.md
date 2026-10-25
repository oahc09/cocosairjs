# SDK223 EX05 对照与生命周期有限观察（2026-10-25）

**11 项对照与有限生命周期观察已封存；不是 EX05 全通过或 C21–C28 资格。原 90 次 baseline 不回写、不合并计数。**

- Source：`74229692be62445dc2de11cdabfa974bd9608c00`；runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build 223；Firefox 158 / ST。
- 每项 90 个完整 native samples，共 990；CCD readback、实际 f32 dt `0.01666666753590107`、solver 4、真实 contact 及 pose 检查已核验，最大 pose error 0。
- before/after/frozen/raw identity 及哈希一致；后续标签修正不属于该源码，不回填原始 raw。

## 对照结果

| 项 | 模式 / 速度 m/s / 靶 / 厚度 m / bullet | samples | 原 world-x crossed | 真实 contact 数 |
|---:|---|---:|---|---:|
| 1 | body / 10 / wall / 0.05 / false | 90 | false | 1 |
| 2 | body / 30 / wall / 0.05 / false | 90 | false | 1 |
| 3 | body / 80 / wall / 0.05 / false | 90 | false | 1 |
| 4 | sweep / 10 / wall / 0.05 / true | 90 | false | 1 |
| 5 | sweep / 30 / wall / 0.05 / true | 90 | false | 1 |
| 6 | sweep / 80 / wall / 0.05 / true | 90 | false | 1 |
| 7 | body / 80 / wall / 0.01 / true | 90 | false | 1 |
| 8 | body / 80 / wall / 0.1 / true | 90 | false | 1 |
| 9 | body / 80 / wall / 0.5 / true | 90 | false | 1 |
| 10 | body / 30 / slow-target / 0.05 / true | 90 | true | 1 |
| 11 | body / 30 / bullet-target / 0.05 / true | 90 | true | 1 |

- 前三项 body bullet=false 没有完全穿墙，但不等于世界 CCD 已关闭。
- sweep 预测不是 native contact；同 epoch 绑定已经核验，二者仍须区分。
- slow-target 的 world-x crossed=true 仅表示越过固定世界坐标。全部 90 次采样中弹体在运动靶左侧，两者同向移动，**不是穿过该靶**。
- bullet-target 确实发生相对穿越；保留一个 contact 不能证明阻挡。这属于预先声明的不承诺边界。
- 采样结果不是连续子步、零穿透或全局物理正确性的证明。

## 时间记录缺口

第 4 项 sweep 10 的首次终态观察间隔为 **115.117 秒**，未履行预定 **20 秒操作保护观察**；timing 为 **UNKNOWN/NOT_QUALIFIED**。不能据此推断物理超时或失败，也不补造实际完成时长。后 7 项终态观察间隔为 **7.827–10.079 秒**，仅为观察耗时，不是 native 模拟总时长。

## 独立生命周期 app

- batchReset：启动后 264 ms 请求；gen1 / trial `1:1` 保留 11 ticks，结果 ABORTED。
- flightClose：启动后 354 ms 请求；gen3 / trial `3:2` 追加 11 ticks，结果 ABORTED；计数仍为 0，旧 trial 内容不变。
- 重复 Close 在 disabled 状态下，raw24/25 整份 SHA 相同，仅有 1 份 close receipt。
- clean reopen raw26 为零 trial / 零计数；raw27 正常关闭，module/world released，无 cleanup failure。
- 有限场景不证明任意竞态安全或无泄漏；GPU 内存不可测。窄桌面不是手机，world-continuous 公开诊断缺口仍未解决；不授予跨浏览器、MT 或完整 EX05/C21–C28 通过。
- 本轮没有单独对照场景 console 检查；不得将 baseline console 结果冒充本轮覆盖。

## 证据

机器摘要：[sdk223-ex05-comparisons-lifecycle-20261025.json](sdk223-ex05-comparisons-lifecycle-20261025.json)，SHA-256：`31bfa2903652604f21ff40275ae6b24b43b07d641842229f603b7379df12a320`。摘要包含两组 result、manifest、identity 与 raw 的相对路径/字节数/哈希。全量 raw 原件另行保留，不随报告上传；本摘要不是自包含重放包。
