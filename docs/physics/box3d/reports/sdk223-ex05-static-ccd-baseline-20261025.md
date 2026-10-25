# SDK223 EX05 静态 CCD 有限基线（2026-10-25）

**仅确认 Firefox 158 / ST / 0.05 m 静态 wall / body / bullet=true 的有限样本没有完全穿墙；不是零穿透，也不是 EX05 全通过。**

- Source：`74229692be62445dc2de11cdabfa974bd9608c00`。
- Runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build **223**。
- 独立 smoke app 仅跑 1 次 10 m/s、90 ticks，不计入 baseline。随后 clean app 的 **10 / 30 / 80 m/s 各 30 次**，共 90 trials、**8100 连续采样 ticks**；累积导出不是额外重复 trials。
- 实测 target/projectile CCD readback 为 **false/true**，actual native f32 dt **0.01666666753590107**，solver substeps **4**；真实 contact 与 pose 检查通过，最大 pose error **0**。
- 前后 identity、冻结 identity、全部 raw identity 一致。90 次 releaseScene 及最终 normalClose 为 released；module/world 清理无 failures/cleanupErrors。GPU 内存不可测，不能宣称无泄漏。

## 几何与覆盖限制

| 速度 (m/s) | 次数 | 最大采样表面重叠 (mm) |
|---:|---:|---:|
| 10 | 30 | 4.999992 |
| 30 | 30 | 7.194248 |
| 80 | 30 | 14.381361 |

全部 trial 最终 x 为 `-0.07499999552965164 m`，相对源几何名义边界最终仍约 **4.47 nm 重叠**。没有完全穿墙不等于没有穿透；采样不能证明连续子步或全局无穿透。

- Console errors-only 为空，**22 条 warning 保留**：autoplay、deprecated renderer info、mipmap lazy initialization；不宣称零 warning。
- 697 px 为窄桌面窗口，不是手机/真机验收。
- world-continuous 公开诊断仍为 `NOT_IMPLEMENTED`；bullet=false 也不能等同全部 CCD 关闭。
- **不授予 EX05 全通过、C26–C28、跨浏览器或 MT 资格。** 其他厚度、移动目标、sweep/bullet=false 对照及后续 comparison 均不混入本封存 baseline。

## 失败历史不能省略

- `eaa04f7fe674073144a4eddfda288e0e9c325d07`：`FAILED_BOOT`，onLoad 前设置 useCCD 导致初始化失败，baseline 未运行。
- `df3f1d94fdeec8f766143f3e3f5ec8cf960ce324`：`FAILED_FIRST_STEP`，修复启动后首次 before-step 失败；当时 actualDt 未保存，仅能从源码推断原因，不能回填为观测值。
- 本报告的修后新 scope 保存了真实 observed dt；旧失败完整保留，不宣称全部历史仅一次尝试或没有失败。

## 证据

- 最终 raw `(9)` SHA-256：`6cebdb426cb14979c122d1ce906b08a39b3ab1c4473af38b0d5a8e9ed99d0915`。
- 机器摘要：[sdk223-ex05-static-ccd-baseline-20261025.json](sdk223-ex05-static-ccd-baseline-20261025.json)，SHA-256：`c5b375a58b34d808ca712948a88d36aa97e2b340116aa3e7d732539a3476a45f`。
- 摘要附 result/raw-audit/evidence-manifest、identity、关闭与阶段 raw 的相对证据路径及哈希。原件另行保留，不随本报告上传全量 raw；本摘要不是自包含重放包。后续 comparison 属另一目录和 scope。
