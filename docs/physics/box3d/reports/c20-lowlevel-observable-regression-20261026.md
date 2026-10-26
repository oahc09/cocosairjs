# C20-LOWLEVEL 可观测资源回归报告（2026-10-26）

## 结论与边界

**`OBSERVED_NATIVE_SUBSET_PASS`，不是完整 C20 通过。** v3 在同一个实际 ST WASM module 中完成 100 轮，每轮创建 world、50 bodies、50 shapes、1 个真实 fixed joint 和共享 mesh 资产，并完成显式 debug 资源激活及销毁。生产者、只读最终消费者和独立只读复核均通过。

- `C20_LOWLEVEL=NOT_QUALIFIED`：缺少完整 native global-world census、完整 all-handles 计数，不把已知 ID 失效或局部计数冒充全局总量。
- `C20_APPLICATION=NOT_RUN`：应用层 100 次切场景是独立范围，本报告不授予其资格，也不以重建 app 替代。
- 不宣称 malloc/free 调用次数相等或“全部资源绝无泄漏”；不授予 physics step、接触/事件、动力学或性能资格。

本报告对应原计划 `ai/plans/box3d-v1.2-reference.md` §10.3 B3-C20（冻结参考第 666 行）的低层可观测子集。完整机器可读数据、38 个关键原件及全部 100 个 debug 原件的路径/bytes/SHA-256 见[配套 JSON](c20-lowlevel-observable-regression-20261026.json)。

## 身份与执行沿革

| 项目                        | 固定身份                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| v2 已发布 fixture           | `ea7a29edecb7873cd234b59d0de4335eba872133`                                                    |
| v3 已发布 fixture           | `4a21d78d95b3a7e09f3f6c1226cf0a56339cfea2`                                                    |
| 同一 ST2 构建 source commit | `ae0803c0c3e85aa627666f76eef29c4e62ab2e93`                                                    |
| ST2 目录标签                | `terrain-st-ae0803c-attempt-2`                                                                |
| Native schema               | `ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6`                            |
| Node                        | `v22.16.0`；二进制 SHA-256 `8142d37c6f2f372ef040419e7a111a6baf17df89f8078d02447d6c639ae20c1d` |
| v3 fresh input lock         | `946f64dc92fcb0cd13db5f33648a60528aae8ab38bf194dfcfe60733dffd9bdb`                            |

两次尝试使用相同 ST2 JS/WASM/facade/manifest 和 Node 二进制；v3 还冻结 staged-core debug 调用路径的源码身份。每次均在源码已提交并单次授权后独立启动，不修改 engine/SDK，不重建 native，不覆盖旧尝试。报告整理只读取既有原件，没有重跑原测试或真实 native fixture。

### v2 唯一真实尝试：FAIL 原样保留

`c20-lowlevel-attempt-1` 完成 100 worlds、5000 bodies、1368 个阶段，但最终 consumer 在 `bridge-defined handle subset must be nonempty` 处失败；原退出码 **1**、raw wait status **256**，原 producer/supervisor 状态均保留 **FAIL**，不改判 PASS。

事实根因不是 native 50 shapes 消失或已证明 engine 泄漏：`world_bridge.c` 的 `shapeHandles` 只计量 `createDebugShape`/`destroyDebugShape` 回调登记的 **lazy debug-shape cache**。core 新建 shape 时 `userShape=NULL`；只有 draw-shapes 路径才惰性创建 debug cache。v2 没有调用 debug capture，因此 50 个真实 native shapes 存在时该 debug 计数仍为 0，符合实现定义。v2 CPU fake 也错误地把全部存活 core shapes 当作 debug handles，早期 CPU/源码审查未发现这个同源模型错误。

原 native counts 仍是 `[body,shape,contact,joint]=[50,50,0,1]`，逐轮 core/bridge 回原基线；这些观测不能抹去整轮 FAIL。原闭包事实为 all-child ECHILD、0 剩余 descendants，无预算超限；其失败退出状态没有被清洗。v2 的源码、锁、journal、report、closure 均保留，关键原件 hash 如下。

### v3：实际激活既有 debug 资源，不删除非空覆盖

每轮在 50 shapes 与真实 joint 创建后显式调用 **`api.debugSnapshot(world, 1, 0)`**。调用前同 module native global bridge 的 lazy debug handles 为 **0**；调用后为 **50**；之后随 shape/body/world 销毁释放，最终回原始全局基线。

50 并非由 core shape 总数猜测：启用的 3 mesh +47 sphere 均有 broadphase proxy；生产 bridge 使用全空间 bounds、全 category mask、WIRE_FRAME=1；实际 core draw callback 对这 50 个形状各登记一个 cache。sphere 为 3×24=72 条线，8-triangle mesh 为 8×3=24 条线，所以每次完整返回 **3456 条线**。消费者还逐个检查 50 个独立 body 区域的 24/72 条分布及有限坐标，不让缺失 mesh 混入总数。

`api.debugSnapshot` 的 native capture/copy 在 `finally` 中释放 wire，因此 API 返回后 `primitiveCapacity=0`、`capturedPrimitives=0`，但 lazy caches 继续由 native shapes 持有，直到真实销毁。CPU model 已修为相同的 lazy 生命周期；缺少 debug 调用、伪造返回却未创建 cache、49 handles、未释放 wire、丢失/篡改/错轮原件都会拒绝。具体源码路径与预声明推导见[已发布 fixture README](../../../../tools/physics/box3d/lifecycle-contract/lowlevel/README.md)。

## v3 实际观测

| 观测项         | 原件结果                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| module/factory | 单 module，factory 调用 1 次；不是 100 个进程或 module                                                |
| 生命周期       | 100 rounds /100 worlds /5000 bodies /每轮 50 shapes /100 真实 fixed joints                            |
| 释放顺序       | cache-first 34、cache-last 33、world-last 33                                                          |
| 记录           | 1468 个阶段；每轮实际非空 counts `[50,50,0,1]`                                                        |
| mesh           | 每轮 1 cook、3 shape borrows；总 cook/destroy 各 100                                                  |
| debug          | 100 次实际 API 调用；每次 0→50 handles、3456 完整 primitives；随真实销毁归零                          |
| 原始基线       | 单一初始 core bytes=0；native global bridge bytes/allocations/debug handles/capacity/count 全 0       |
| 每轮/最终关闭  | 与原始 core/bridge 基线逐项一致；无 warmup、重置基线或增长容忍                                        |
| ID/令牌        | 每轮当前 raw body/shape 与已知 world IDs 销毁后无效；104 个旧 facade tokens 拒绝；下一 world 内仍拒绝 |
| 最终 consumer  | exit 0，`OBSERVED_NATIVE_SUBSET_PASS`；完整 100 原件解压及身份验证                                    |

全局 bridge 观测直接调用同实际 module 的 `_air_b3_bridge_memory(0,out)`，不是遍历 JS worlds Map 得到的空集合零值。world 存活时读取真正 native body/shape/contact/joint counts；销毁后的 world counts 明确为 **null**，不虚构原生全局零值。raw body/shape IDs 跨 world 生命周期可能重验证，其事实被保留；不把 scoped facade token 失效扩展成完整 raw/global handle 身份保证。

### 全量 lossless debug 原件

100 个 `run/debug/cycle-NNN.json.gz` 各保留该轮 **完整** API 返回值，含 cycle、world ID、全部 primitives。不是样本、摘要或合成替代物。journal 绑定每份 gzip 和解压 JSON 的字节数与 SHA-256；生产者和最终消费者完整读取全部 100 份，独审再次核对轮次/world/bytes/hash。

- decoded JSON 总计 **39,902,490 bytes**。
- gzip 原件总计 **2,361,468 bytes**。
- 共 **345,600 条**实际返回线段。

## 物理闭包与未放宽的预算

| 项目             | 预声明上限          | v3 实测                         |
| ---------------- | ------------------- | ------------------------------- |
| 执行时间         | 120 s               | 4.332096788 s                   |
| 原始故障关闭窗口 | 4 s，单一窗口不延长 | 关闭约 0.002013235 s            |
| descendants RSS  | 1,073,741,824 bytes | 采样峰值 177,455,104 bytes      |
| 全部保留输出     | 16,777,216 bytes    | 4,145,306 bytes，含最终 receipt |

RSS 为 25ms 间隔的完整 descendant-tree 采样值，不是内核瞬时硬上限或无限时间内存结论。v3 未在失败后加预算：仍沿用原 120s/1GiB/16MiB，并在执行前声明每轮 decoded 2MiB/gzip 96KiB 上限。

最终 raw return code **0**、raw wait status **0**，Linux subreaper 收集完整 descendants；`waitpid(-1)` 得到 ECHILD，剩余 descendants/process group 均为空，`PHYSICALLY_CLOSED`，无预算违规。facade.dispose 成功，诊断 scratch 的一次分配/一次 `_free` 完成单独记录；这不是一般 malloc/free 总量证明。core/bridge bytes 和实际完成的 mesh destroy counters 也不能推出“所有内存域绝无泄漏”。

## 原件定位与不可冒充 bundle

下表路径前缀为 `native-candidate-302935a/`，再相对于原始授权本地证据根标签 **`box3d-resume-20261025T1146`** 解析，**不是仓库内相对路径**。本次只提交 Markdown/JSON 两份报告；没有创建、上传或发布 raw bundle。原件仍在原执行工作区，JSON 提供完整定位和哈希目录；哈希目录不等于把原文件附在报告中。

| 原件相对定位（上述前缀之后）                       |     bytes | SHA-256                                                            |
| -------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `c20-lowlevel-attempt-1/run/events.jsonl`          | 1,617,231 | `bca6c237818f977974f310b90206effae4aea5c5df233194cb096c953bf9573d` |
| `c20-lowlevel-attempt-1/run/report.json`           |    11,184 | `595c0e3b35fa68dab811553472f0f5ad99f4c8fc024e15b12590869485e76c98` |
| `c20-lowlevel-attempt-1/closure.json`              |     1,885 | `0e38bff73728174c85802649cc2b4308f83178b44a4f99d75174a5929b5c6b60` |
| `c20-lowlevel-attempt-2-debug-v3/run/events.jsonl` | 1,767,390 | `982a7b837c4d5bb389193b095aecfc38dfe1f5413585986186334b62cbcd74d4` |
| `c20-lowlevel-attempt-2-debug-v3/run/report.json`  |    12,816 | `8ea84387c6197a30fc32418f85f6af11c2cc74a2206c313fa677956389bcba84` |
| `c20-lowlevel-attempt-2-debug-v3/closure.json`     |     1,913 | `492faf61e6ede6dbc261fd7eaf64aa2a05d62dbd97db0ad404604b75c45b4c43` |

v3 真实执行和独立只读终审通过；**这仅关闭可观测 native 子集回归的本次执行，不关闭完整 C20/全局 handles/world 计数缺口，也不替代应用层验收。**
