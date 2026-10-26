# SDK224 public Terrain 首次真实执行失败（2026-10-26）

**结论：`FAIL_PRESERVED_NO_RETRY`。** 唯一一次 fresh SDK224 public Terrain cohort 已执行并失败；未重试、未改阈值、未修改原始记录，也未据此更新全局验收矩阵。配套 [JSON 报告](sdk224-public-terrain-first-failure-20261026.json) 提供逐项身份、原件路径与 SHA-256。

## 输入和生产链

- ESM producer：`1ebcdd3b7a9e4813984d8d9b5bc0829de8581863`，实际运行 build **224**，独立目录 `sdk224-esm-attempt-1`。原 ESM receipt 为 `PASS_FRESH_ESM224_BUILD`，exit 0，66.779 秒，995 个 source-map sources，输入无漂移；不是复用 SDK222 或已丢失原 bytes 的 SDK223。
- 新 public host / fixture 与 native 输入版本：`ae0803c0c3e85aa627666f76eef29c4e62ab2e93`；这些 fixture bytes 随 1ebcdd3 源快照冻结。ST 来自 `source/tools/physics/box3d/output/terrain-st-ae0803c-attempt-2`，不是从 commit 文本推断二进制身份。
- Terrain schema：`ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6`。冻结检查核验了真实 ESM receipt、其输入保护清单和 release binding，以及 SDK / ST 实际文件哈希；consumer 的 caller-declared producer 字段本身不算生产证明。
- DTS 的原外层终态仍是 **`FAIL_OR_PARTIAL`**：实际生成、声明检查及 strict consumers 共 7/7 exit 0，ECHILD、输入无漂移，但晋升脚本误将合法的 367-byte legacy wrapper 按 `>1000 bytes` 拒绝。随后单独授权的补充 receipt 核验精确源 literal、相对 modern export 和源/目标哈希，仅以 exclusive-create 补齐缺失 legacy 声明；没有重新生成、没有篡改原失败。两份声明均为本次 fresh emit，legacy 哈希与旧版本相同不代表旧产物复用。原 23 个 SDK 文件未变，补齐后共 25 个文件。

| 核心产物                                        | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `cocosair.module.js`                            | `b5ec7c357a762a674eb893b719d202274f180725337c72c3be57e791c4d816f8` |
| `cocosair.module.js.map`                        | `682a8ed033f963166dbb58d774733e9404a22b1a83c53ff07b647dbf8aa9cc3f` |
| fresh `cocosair.module.d.ts`（3,375,235 bytes） | `2686ebd434bed7a05982f72ff37c553474168838798c7ba23b7ff19506ec0745` |
| fresh `cocosair.legacy.d.ts`（367 bytes）       | `6dd42c6a064b17f923568bce9e3befce5ff0e33d7b0af19bed965a9e1a86aed2` |
| `box3d-st.wasm`                                 | `3aad5fe443760ee7507513847d59526056ce39cc282e9502a8b4df32220e77b4` |
| `public-terrain.mjs`                            | `849aa37b76577c17e8a4e0ad9093ed1dfed3cc97807ecb5fcea034537d0776c1` |

## 真实进展与失败边界

执行时间为 **2026-10-26 07:51:18.401–07:51:19.605 UTC**。宿主为 Node 22.16.0 HEADLESS/JSDOM，只适配冻结资产传输和 DOM；使用真实 production ESM、ST WASM 和项目 `createStepClock`（60 Hz，`dt=1/60`，单步 2,000 ms）。没有替代 backend、伪物理积分或直接调用 `physics.step` / `director.tick`。CPU child 30 秒、consumer 240 秒、外层 285 秒界限均未触发超时。

| 已实际到达 / 保留               | 数量与意义                                           |
| ------------------------------- | ---------------------------------------------------- |
| ray / lifecycle 观测            | 43 条，后续阶段已经到达；对应 ray 断言已通过         |
| primitive sweep                 | 3 条，对应断言已通过                                 |
| committed query                 | 1 条，`complete: true`                               |
| sphere drop samples             | 28 条，仅为失败前样本，不是持续接触合格证明          |
| 成功返回的 fixed-frame receipts | 31 条：此前控制 / deferred-destroy 3 帧 + drop 28 帧 |
| 同次执行的 CPU controls         | 13/13；含 mock / negative controls，不能充当物理验收 |

最后 drop 样本为 step 28，position `[0.5, 0.9013886451721191, 0.75]`，clearance `0.016299978710638402`。下一次 drop tick（29）在返回 frame receipt / sample 之前失败。**所需持续接触 / 反自由落体响应未完成，不能把接近地形或已有下降样本算作 C17 PASS。** 原 consumer 的 C17 qualification marker 保持 `NOT_RUN`；这不意味着本次没有尝试物理执行。

主错误为：

```text
[AIR_E_BOX3D_UNSUPPORTED_GEOMETRY] collision events:
Contact pair is outside Sphere–Sphere, Sphere–Box, Box–Box,
Capsule–Box and Capsule–Capsule candidates.
```

实际堆栈从 `Box3DCollisionEvents.prepare` 经 `PhysicsWorld.emitEvents`、`PhysicsSystem.postUpdate`、`Director.tick` 到固定步时钟。journal 第 112 条保留完整失败前 partial report；第 113–117 条分别保留 cleanup 失败，第 118 条保留主错误，未让 cleanup 覆盖主错误。

## 根因与尚未验证的修复

**根因诊断：被拒绝的事件订阅留下了 listener / need flag。** 以下为冻结源码的只读因果分析，不是额外一次 instrumented runtime 重跑：

1. fixture 合法负控调用 `TerrainCollider.on('onCollisionEnter', ...)` 并断言拒绝。
2. `Collider.on` 先执行 `super.on` 注册 listener，随后 `_updateNeedEvent` 先置 `needCollisionEvent=true`，最后调用 shape 的 `updateEventListener`。
3. Terrain adapter 此时才拒绝不支持的事件订阅；原调用没有回滚已写入的 listener / flag。
4. shared-body 将残留 flag 暴露给碰撞记录。collision-events 原本正确地跳过双方都无 listener 的 contact，但残留 listener 使首次 Sphere–Terrain contact 进入不支持 pair 的检查并抛错。
5. world 被 fault；之后停止模拟、deferred-destroy tick、恢复 gravity / autoSimulation 和正常 close 的 clock admission 连锁失败。

修复方向应为订阅变更前拒绝，或对失败订阅完整原子回滚，并检查 `hasEventListener` / need flags 不变。**engine fix 此时仍为候选，本报告不宣称已修复或回归通过。** 不得通过放宽 pair 资格、删除负控、fixture 手动 `off` 掩盖残留，或放宽物理阈值获得 PASS。

## 关闭、回收和输入保护

- `app.close()`：**failed**，虽然重复关闭返回一致（`closeIdempotent: true`），但 `game-clock-terminal` 报 `AIR_E_BOX3D_WORLD_FAULTED`；不能宣称正常 application close 成功。记录仍列出 runtime、scheduler、builtin-resources、shared-asset-caches retained。
- fixture cleanup：stop-simulation、deferred-destroy-tick、restore-gravity、restore-auto-simulation 报 world fault；destroy-material 报 participating actual-binding hazard。五项原始错误全部保留。
- `physicsPreparation`：`closed`；module 与 world 的 cleanup 均记录 **released**，各自 retained 空、cleanupErrors 空。这只证明该 physics-preparation 释放结果，不把失败的完整应用关闭升级为成功，也不证明零 GPU / 全局资源泄漏。
- host：closed，hostErrors 空。consumer exit **1**、signal null；外层 runner exit **1**、abort null，物理回收为 **`ECHILD_AND_NO_GROUP_MEMBERS`**。此为 Node 子进程树关闭，不是浏览器关闭证据。
- 前后保护 **50,802** 个输入条目，changes `[]`；consumer 亦记录 inputsUnchanged true。原始失败、SDK 和源文件未因本报告被修改。

## 原件定位与不包含的证据

下表路径相对于保留的本地证据根 `box3d-resume-20261025T1146/native-candidate-302935a`。**这两个报告仅是摘要和 hash 索引，不是完整 raw 自含归档，也不保证这些本地原件已发布到仓库。** 完整输入、逐帧样本、错误堆栈、stdout / stderr、退出和 DTS 补偿链须按 JSON 中的 `originals` 获取；原件需要继续保留。

| 原件                                                     | SHA-256                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `terrain-public-attempt-1/result/consumer.raw.json`      | `220ac9bf9c35b4c869cbd198fabe2c0107e5994c26f548ddfd543e85378a0ea9` |
| `terrain-public-attempt-1/result/observations.raw.jsonl` | `9223401bbe167b94d33351eccfd711ec0ec929e9e1cd6205a33468e21420c3a7` |
| `terrain-public-attempt-1/process.raw.json`              | `4955d44ec7f55a84400c8d5dde57d28dba1670fa5bed5b7ed8fd687c2b7115bd` |
| `supervision-public-terrain/result.json`                 | `0c81b0f9fabe164b78990d8848f341058a30ff1782328969453fcd09ccd5b6e1` |
| `supervision-public-terrain/input-lock.json`             | `38e503a7716124f4d5bf73e3c973a3e4b262d3e300cb4ceac3dbdd3fb8679466` |
| `supervision-public-terrain/producer-binding.json`       | `4c81b1de5e85d2f34909a5ceb75ae34ba0b3925ac7d27f7332260505d67b41e0` |
| `esm224-attempt-1-evidence/result.json`                  | `98c98aad97e1038e8dcfcbd23489b5236c02177f06bde8cedb8e68f6eac6657d` |
| `dts224-attempt-1-evidence/result.json`                  | `29fe9760eb974b0614faee18a865c61ea5e40cdb64833d3194a4d75b27abc0a9` |
| `dts224-attempt-1-evidence/seven-gates.json`             | `b7013722dc0ec660652934743852a52ec6807df2c4a85a2d6994e74be0d07045` |
| `dts224-promotion-supplement.json`                       | `5777216d1bd7d27e47ccc12e08eead63fe64bed12b31073ed8f1840eaa1aae41` |
| `supervision-public-terrain/diagnosis.json`              | `5af3f338014a3943556e673cba152eeb26fce46b3d277cf0e26fd5e6d9e87aa9` |

本报告不建立：完整 C17 sustained-contact、成功正常应用关闭、public C19 精确 native destruction / cache-lease 证明、全门禁或 browser / GPU / CSP / presentation 验收。编写本报告只读取、哈希和整理已有原件，未新增测试、物理执行或重试；不更改全局 matrix。
