# C20APP 严格基线：两次真实运行失败记录（2026-10-26）

## 结论

两次运行均保留 **FAIL，合格完成轮数均为 0/100**。v1 在场景挂载前配置关节时失败；v2 修正调用时序后真实完成第一场景的运行和释放，但原始世界字节清单基线不等，立即停止。**没有 warmup、重设基线、重建 app 或自动重跑，也没有将后来的局部成功回填旧失败。**

本报告只记录已结束的两次尝试及只读源码核对，不代表 C20APP、全 C20、I05、I06 或浏览器验收通过。正在独立实现的 memory-diagnostic 源码尚无可用于本报告的结果；这里不预写“已解释差额”或“已修复”。

## 身份分层

| 层                           | 固定身份                                   |
| ---------------------------- | ------------------------------------------ |
| v1 fixture                   | `f855a01c60ec586754328fcd214a1548373c5856` |
| v2 fixture                   | `f1380eb96809c3a24e7f2ec024f4cdeebefb327e` |
| 实际 SDK225 ESM/DTS producer | `cd742f8000e8718f2bdfde0ce1eb9015271c1e28` |
| 实际 ST2 native producer     | `ae0803c0c3e85aa627666f76eef29c4e62ab2e93` |

每次使用独立新锁绑定 fixture、当时源码快照、SDK225、ST2 和真实构建/声明回执。后来的 fixture commit 或当前分支 HEAD **不是** SDK225/ST2 编译来源；未用其他低层 module 的零值补齐应用侧缺失计量。

## 第一次：v1 挂载前 setter 失败

- 消费者时间：2026-10-26 09:30:09.319–09:30:10.589 UTC。
- `FixedConstraint.breakForce = 1e8` 在 `app.run(scene)` 前触发 `TypeError: Cannot read properties of null (reading 'setBreakForce')`。
- `Constraint._constraint` 初始为 null，`onLoad` 才创建 adapter。`connectedBody`/`enableCollision` 支持无 adapter 时缓存；breakForce/breakTorque 的原 setter 无对应判空，故新 fixture 的调用顺序不符。
- **0 挂载场景、0 releaseScene、0 step、0 callback、0 合格轮。** 已记录的 7 body、7 shape、3 Terrain 是 JS 构造进度，不是 native 创建证明；关节计数递增尚未到达，也不能当作完整对象库存。
- 只观察到初始 native 四计数均为 0、世界字节清单 36,040；未获得非空 native 场景或释放后基线。
- 一次真实 `app.close()` 返回 `released`，module/world cleanup 均为 `released`，pending/failures 为空。但未被 session 接管的 Scene/Node/material 清理仍 **NOT_QUALIFIED**，正常 close 不能证明这些孤立对象已回收或资源归零。

## 第二次：v2 第一轮严格字节基线失败

消费者时间：2026-10-26 09:56:10.656–09:56:14.185 UTC。两项阈值在挂载后、首 step 前通过合法公开 setter 设置；组件 getter 与真实 native diagnostic 均读回 **1e8**，step 0 时 fixed joint 已 `connected`。

第一场景实际进行了 **58 个 1/60 s step、108 次 primitive trigger callback**。sensor 与 visitor 各有 1 enter、52 stay、1 exit；没有以 Terrain/Hull 事件冒充合格 primitive pair。真实非空诊断为 50 bodies、50 shapes、1 joint；一个 Terrain cooked resource 有 cacheLeases=1、shapeBorrows=3、9 vertices、8 triangles、coreMeshBytes=416，JS users=3 仅为辅助。

| 观察点          | body | shape | contact | joint | 原始 `liveBytes` 字段（世界容量清单） |
| --------------- | ---: | ----: | ------: | ----: | ------------------------------------: |
| 第一场景前      |    0 |     0 |       0 |     0 |                                36,040 |
| 活动场景/释放前 |   50 |    50 |       0 |     1 |                               108,708 |
| releaseScene 后 |    0 |     0 |       0 |     0 |                               112,980 |

释放回执为 `released`，pending/failures 为空，tracked resources 为 `[]`，scene/material 均失效、session cleanup 执行一次、原 token 失效，复制事件内容未变。没有在释放后的 scene 上步进。单 app、单 clock 各创建一次，clock 只 begin 一次，未 end 后另建。

然而 **112,980 − 36,040 = 76,940 bytes**，未满足预声明的原始基线等式。首轮验证立即失败，`completedCycles` 没有递增：**实际合格 0/100，而不是 1/100，更不是 100/100**。第一轮释放前的暂态 `COMPLETE` 观察不替代最终校验；最终 row/status 和消费者均为 FAIL。没有第二个场景，因此前轮回调/跨场景 generation 检查不能据此宣称完整覆盖。

随后一次真实 `app.close()` 返回 `released`，module/world cleanup 为 `released`。这不是 close 后全局 native bytes 的实测，亦不能把 tracked resources 空表等同于不存在未跟踪泄漏。

## `liveBytes` 的准确口径

raw 字段名保持不变，但它来自：

`getNativeCounts → binding.worldCounts → air_b3_world_counts → b3World_GetCounters.byteCount → b3GetWorldByteCount(world, false)`。

这是 **per-world 容量清单**，并非 module 全局 `b3GetByteCount`、WASM heap/线性内存大小，或“仍存活/未释放对象 payload”的同义词。facade 中独立的 `liveBytes()` / `air_b3_live_bytes` 才调用 module 全局计数；本 app profile 未暴露该全局计量供读取。

ST2 staged-core 源码按容量累计 ID pools、world arrays、broad-phase、manifold blocks、solver/constraint graph、task/bitset、event/debug buffers 和 `stack.capacity`。释放 ID 会进入 free-list，部分数组/块直到 world destroy 才释放；因此源码支持**容量保留是可能原因**。worker arena buffer 并未计入此清单，不能直接拿其增长解释差额。

但本次只有总额，没有逐项 native 分解，**不能把全部 +76,940 归为合法容量，也不能认定 leak 或无 leak**。原 C20 的“只保留合法空 world”不等于授权任意高水位容量，更不允许用 warmup/rebase 吸收本次失败。

## 终态、预算与输入保护

| 项目                        |                       v1 |                       v2 |
| --------------------------- | -----------------------: | -----------------------: |
| CPU 控制                    | 44/44 PASS（非物理证据） | 58/58 PASS（非物理证据） |
| consumer / runner exit      |                    1 / 1 |                    1 / 1 |
| 全后代 `waitpid(-1)` ECHILD |             true；无残留 |             true；无残留 |
| 受监督 runner 墙钟          |                  1.694 s |                  4.330 s |
| 原 4 s close 窗口实际耗时   |               0.001283 s |               0.001237 s |
| 采样全后代 RSS 峰值         |            294,580,224 B |            375,062,528 B |
| runner 目录 retained output |                945,330 B |              1,184,154 B |
| 终态摘要前合并输出观测      |              4,239,413 B |              4,523,837 B |
| 保护文件检查                |           9,653；0 drift |           9,882；0 drift |

预算保持 CPU 30 s、consumer 300 s、外层 runner 334 s、父 close 4 s、RSS 2 GiB、总输出 64 MiB（runner 56 + 预检/冻结 8 MiB）。两次 `budgetViolation=null`；RSS 是 25 ms 采样全后代 RSS，不伪称内核硬限。合并输出数字来自冻结的终态摘要前观测，不冒充后来新增派生报告后的最终目录总大小。

闭包使用 subreaper、全后代枚举和 `waitpid(-1)`，不是仅看 PGID；因运行 exit=1，closure.status 仍为 FAIL，不能将“物理进程已关干净”改写成测试 PASS。

## 原件索引与交付边界

证据根逻辑名称为 `box3d-resume-20261025T1146`。下列及 JSON 中的路径均相对此保留根，不是相对此文档或 Git 仓库。此次提交仅两份报告，**不是自含 evidence bundle**；没有把 SDK/WASM/raw/locks 打包入报告，也不承诺它们可通过仓库相对链接直接取得。

完整原件相对路径、bytes、SHA256 与源代码计量链见[配套 JSON](./c20-app-strict-baseline-failures-20261026.json)的 `artifacts`。关键原件：

### v1

- `native-candidate-302935a/c20-app-attempt-1/run/result/consumer.raw.json`
  - 8,801 bytes；SHA256 `8518bc352aa0c5d632cf732e59de72afe891218d6c8f50675ff386b07b371ed9`。
- `native-candidate-302935a/c20-app-attempt-1/run/result/observations.raw.jsonl`
  - 523,871 bytes；SHA256 `dfc8ee32a95ce48aa2543ce034d15a43c4269b64db2bea35f5961482ef4815b2`。
- `native-candidate-302935a/supervision-c20-app-attempt-1/input-lock.json`
  - 323,172 bytes；SHA256 `67f6159cb6bf74bd8ff63eca6ce8c2c09d855e9bf54a632c8fc5c23ba02f9c3a`。
- `native-candidate-302935a/c20-app-attempt-1/closure.json`
  - 1,863 bytes；SHA256 `02e3a4b841c8187738a207362ae86c7e17267f8385648254d58cef5c8eb1fc99`。

### v2

- `native-candidate-302935a/c20-app-attempt-2-mounted-v2/run/result/consumer.raw.json`
  - 89,992 bytes；SHA256 `0d89f4fd440ab537d50e810db534f85fb82b07fabae0d85fd1f3672f09be8b0c`。
- `native-candidate-302935a/c20-app-attempt-2-mounted-v2/run/result/observations.raw.jsonl`
  - 660,441 bytes；SHA256 `64ca22991a9945df10dcb6d879ce9797cc27c375d267d40ed24fa075830827bf`。
- `native-candidate-302935a/supervision-c20-app-attempt-2-mounted-v2/input-lock.json`
  - 323,526 bytes；SHA256 `7df6f2c71106d908739459b27d3954947655fd1c51bdf98df377e6b8df0e3893`。
- `native-candidate-302935a/c20-app-attempt-2-mounted-v2/closure.json`
  - 1,885 bytes；SHA256 `130d3fe8dbb3fc7a3ce61f4f000df67bfa0db63ab9169596c4424d23fa1ad3c6`。

## 尚未取得的结论

C20APP 100 次场景切换、全 C20、I05/I06、module-global live world/handle、close 后 global bytes、未跟踪资源泄漏自由、跨场景 generation 隔离及浏览器/GPU/CSP 均未因此获得通过。任何后续诊断或修正必须保留这两次原失败；新的源码实现或不同 module 的结果不能解释为历史运行已经通过。
