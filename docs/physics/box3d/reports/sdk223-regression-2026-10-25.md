# SDK223 Box3D 同版回归（2026-10-25）

**结论：补充回归 22/22 完成；16 `PASS_LIMITED`，6 `EXPECTED_FAULT_OBSERVED`。632 项检查，失败 0。**

- Runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`，build **223**。
- Regression fixture：`4cadf67f1d8de9638f8cc035e5af0abe0fd6c558`。
- 执行入口：`tools/verify/box3d/campaign-runner-manifest-v2/runner.cjs`（上述 fixture commit）。
- 实际执行仅 1 次，无重试；每 case 原 180 秒上限及断言保持不变。
- 开始：`2026-10-25T14:47:04.022921+00:00`；结束：`2026-10-25T14:59:12.575577+00:00`。
- supervisor 记录至进程组关闭耗时 731.076 秒；其后终检通过；exit 0，abort null；进程组已物理回收：`ECHILD_AND_NO_GROUP_MEMBERS`。
- 21,385 个受保护输入终检无漂移，24 个 SDK runtime 文件哈希全部不变，build counter 保持 223。

**边界：formalPassCount = 0；Gate = NOT_RUN；普通浏览器 = NOT_RUN。**
故障注入项表示观察到了预期故障，并非正常功能通过；本报告不授予正式验收单元信用，不代表浏览器、跨版本或全平台通过。

## 逐项结果

| Case | 分类 | 检查数 | 失败 |
|---|---|---:|---:|
| `cohort-ex09-sku-A` | `PASS_LIMITED` | 8 | 0 |
| `cohort-ex09-sku-B` | `PASS_LIMITED` | 8 | 0 |
| `cohort-ex09-sku-C` | `PASS_LIMITED` | 8 | 0 |
| `cohort-trigger-lifecycle` | `PASS_LIMITED` | 8 | 0 |
| `cohort-trigger-once-only` | `PASS_LIMITED` | 8 | 0 |
| `cohort-trigger-callback-destroy` | `PASS_LIMITED` | 8 | 0 |
| `cohort-trigger-dual-sensor` | `PASS_LIMITED` | 8 | 0 |
| `cohort-trigger-compound` | `PASS_LIMITED` | 8 | 0 |
| `cohort-trigger-callback-fault` | `EXPECTED_FAULT_OBSERVED` | 8 | 0 |
| `cohort-query-target-support` | `PASS_LIMITED` | 79 | 0 |
| `cohort-collision-healthy` | `PASS_LIMITED` | 21 | 0 |
| `cohort-fixed-healthy` | `PASS_LIMITED` | 80 | 0 |
| `cohort-fixed-intentional-fault` | `EXPECTED_FAULT_OBSERVED` | 19 | 0 |
| `cohort-fixed-idle-enabled-reentry` | `EXPECTED_FAULT_OBSERVED` | 19 | 0 |
| `cohort-hinge-healthy` | `PASS_LIMITED` | 122 | 0 |
| `cohort-hinge-intentional-fault` | `EXPECTED_FAULT_OBSERVED` | 32 | 0 |
| `cohort-hinge-idle-enabled-reentry` | `EXPECTED_FAULT_OBSERVED` | 32 | 0 |
| `cohort-p2p-healthy` | `PASS_LIMITED` | 70 | 0 |
| `cohort-p2p-intentional-fault` | `EXPECTED_FAULT_OBSERVED` | 20 | 0 |
| `cohort-contact-box-box` | `PASS_LIMITED` | 22 | 0 |
| `cohort-contact-capsule-box` | `PASS_LIMITED` | 22 | 0 |
| `cohort-contact-capsule-capsule` | `PASS_LIMITED` | 22 | 0 |

## 证据摘要

- 原 batch summary SHA-256：`b61137708688331b4519fedcf9ecb0931409edce298095efa2da537211b07756`。
- 随附机器摘要：[sdk223-regression-2026-10-25.json](sdk223-regression-2026-10-25.json)，SHA-256：`0214ee5163db18052e0531ffbfaf5af91aabc9e81c8b192c373658a74ca9ec44`。
- 机器摘要包含每 case 的 raw/receipt 哈希、24 runtime 文件的分发相对路径及哈希，以及原执行终局、保护、完成标记与资源采样的哈希。
- 原运行输出共 221,386,450 字节（约 211.13 MiB）；本提交仅携带报告与摘要，不包含原始运行数据、绝对环境路径或完整保护清单。上述原件保留供核验，摘要本身不构成可独立重放的证据包。
- 峰值观测自有进程组 RSS：586.125 MiB；诊断输出：215,029 字节。输出未截断，未以重试替换失败证据。
