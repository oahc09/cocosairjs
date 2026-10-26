# SDK225 Terrain 有限回归报告（2026-10-26）

**结论：fresh ESM225、fresh DTS225 和唯一实际 public Terrain cohort 均在各自限定范围通过。** 这不是完整 Box3D、全 C19、浏览器视觉、mobile、render 或全门禁验收。配套 [JSON](sdk225-terrain-regression-20261026.json) 提供身份、事实与原件哈希索引；旧 SDK224 失败没有被覆盖或改成 PASS。

## 身份与修复进入产物的证明

| 层次                      | 本次身份                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| ESM / DTS source producer | `cd742f8000e8718f2bdfde0ce1eb9015271c1e28`                         |
| 实际 runtime build number | **225**                                                            |
| native ST producer        | `ae0803c0c3e85aa627666f76eef29c4e62ab2e93`                         |
| public host / fixture     | ae0803c 已审版本，所有冻结 fixture bytes 与 SDK224 首次运行一致    |
| Terrain schema            | `ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6` |

复用 `terrain-st-ae0803c-attempt-2` 的同一组 ST 产物；已重新核验原 79-input provenance / readiness 门禁，没有为 SDK225 重新编译 native，也没有放宽门禁。public 外监督核验真实 ESM / DTS 生产 receipt、输入保护与 release binding、产物实际哈希，不能仅凭 caller-declared commit 或 native ABI identity 证明 ESM 来源。

本次修复的 **4 个运行时源文件**在新 source map 的 `sourcesContent` 中与 producer 源 bytes 逐字一致：`collider.ts`、`terrain-shape.ts`、`hull-shape.ts`、`round-hull-shape.ts`。另一个修复文件 `i-physics-shape.ts` 是纯 type，**不在 runtime source map**；其 `validateEventListener?: (collision: boolean, trigger: boolean) => void` 出现在实际 source 与 fresh modern DTS 中。不能写成“5 个修复源都在 map”。独审的 10 项 listener-admission CPU 结果是单独的状态证明，不冒充物理执行。

## 新构建和声明

- ESM：官方 bare Node 22、heap 4096 MiB，`tools/build/build.cjs --format esm`；保留默认 runtime features 并加入 `physics-box3d`，不复用旧 preload、不跑 all/min。**68.089 秒、exit 0、ECHILD、48,194 保护条目零漂移**，995 个 source-map sources，23 个初始 SDK 文件。
- DTS：独立 source copy、heap 2048 MiB；实际 emit、3 个声明 fixture 和 3 个 strict consumer 共 **7/7 exit 0**，**50.450 秒、ECHILD、45,695 保护条目零漂移**。本次为正常 `PASS_FRESH_DTS225_SEVEN_GATES`，不需要、也没有套用 SDK224 的补偿链。
- 晋升前核验 canonical legacy literal / 相对 export；以 exclusive-create 复制两份声明后核对 source / destination bytes，SDK 共 **25 个文件**。modern 3,375,419 bytes；legacy 367 bytes 是本次 fresh emit，与旧 hash 相同不是旧文件复用。
- 本候选携带实际 `tools/build/build-number.json = 225`，把提交记录从 224 同步至已发生的唯一成功 ESM225；不是为报告额外构建或人为多消耗计数。DTS 不消耗计数。

| 关键产物                 | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `cocosair.module.js`     | `1c04ff368e50aeff8b72d0bc8a3a8c3d0221e5ebf6ece233bcf263fdafe7f751` |
| `cocosair.module.js.map` | `fab1e0b9faf312a53790c384e2e32837ccc8082345118e362124e62049b5ab08` |
| `cocosair.module.d.ts`   | `7b328909fb3e2e4b3753233ceb51a3e761d60c37cba7be94aa73c43606ec95ed` |
| `cocosair.legacy.d.ts`   | `6dd42c6a064b17f923568bce9e3befce5ff0e33d7b0af19bed965a9e1a86aed2` |
| `build-number.json`      | `234f98bff88f83d18c432587bd1c831262ecd19822ceffae3e35dcc42c945c21` |

## 唯一真实 public Terrain 回归

运行窗口：**2026-10-26 08:21:31.999–08:21:33.250 UTC**。真实 production ESM + ST WASM 通过 Node HEADLESS/JSDOM 宿主执行；仅适配冻结资产传输 / DOM，未替换 backend。项目 `createStepClock` 独占 clock lease、60 Hz、`dt=1/60`，单步 2,000 ms；CPU / consumer / 外层 30 / 240 / 285 秒界限未改变、未触发超时。

| 实际结果                                 | 数量 / 观测                                  |
| ---------------------------------------- | -------------------------------------------- |
| 3×3 terrain ray / lifecycle rows         | **43**                                       |
| primitive sweeps                         | **3**                                        |
| committed query                          | **1**，complete true                         |
| drop samples / 成功 fixed-frame receipts | **41 / 45**                                  |
| 首次接触 → 最后响应                      | step **29 → 41**，接触后持续 **12** 步       |
| 同次 runner CPU controls                 | **13/13**，仅 CPU / mock / negative controls |

step 41 实测 Y 为 **0.5143342018127441**，无碰撞预测 Y 为 **−0.3347222222222226**；最后 clearance 为 **0.0018251501035451145**。原 drop oracle 的持续接触 / 反自由落体要求通过，不是只看一次接近地形就算成功。

原 `assert.throws` 事件注册负控仍在原位执行，没有删除、手动 `off`、改阈值或放宽 collision pair 资格。其后的首次接触和持续响应不再触发 SDK224 的 event / world-fault 连锁失败。**本次未新增 runtime `hasEventListener` / need-flag 前后探针，不宣称 journal 记录了这些直接值**；直接 listener 状态断言属于另行独审的 CPU 证据。

## 关闭与保护边界

- normal `app.close()`：**released**，idempotent true，failures / pending 空；fixture cleanupErrors 空。
- physicsPreparation：closed；module / world 均 released，各自 retained 空，cleanupErrors 空。hostClosed true、hostErrors 空。
- consumer 和父 runner 均 **exit 0**，signal / abort null；外监督确认 **`ECHILD_AND_NO_GROUP_MEMBERS`**。这是 Node 子进程树关闭，不是浏览器关闭证明。
- 应用仍明确列出 retained runtime、scheduler、builtin-resources、shared-asset-caches，GPU memory measurement unavailable。正常关闭不等于所有全局资源已销毁或零 GPU 泄漏。
- **50,835** 个输入保护条目零漂移，consumer inputsUnchanged true。额外 **46** 个既有文件 hash 保持，包括 SDK224 失败 / 报告和 SDK225 控制 v1 的 preflight 失败记录；不是 46 次物理执行。producer-binding 的 **81 条原件定位记录**包含上述 46 条保留记录，另有 8 条 source-relative 修复文件记录；逐项链可追证，避免在报告重复大段 raw。

## 保留的失败与非目标

1. **SDK224 首次 public 仍为 FAIL**：被拒绝注册残留 listener / need flag，首个 demanded Sphere–Terrain contact 报 `AIR_E_BOX3D_UNSUPPORTED_GEOMETRY`，world fault 并导致 normal close failed。原 partial journal、退出、关闭记录及已提交失败报告全部保留；本次新 PASS 不改写旧失败。
2. **SDK224 DTS 原外层 `FAIL_OR_PARTIAL` 仍保留**，另有当时合法 legacy wrapper 的补充晋升链。SDK225 自身的 7 项门禁为正常 PASS，二者不混用。
3. **SDK225 外控制 v1 preflight 失败**：控制错误假定本地构建输入 projection 含所有已提交 docs 报告，实际路径不存在；在创建 attempt marker / freeze lock / public output 之前即 exit 1，**未运行 CPU 或 physics**。v2 只纠正为实际存在且 exact-hash 的报告 candidate 路径，保留 v1 原件后才执行唯一物理 cohort。没有物理失败重试或阈值变化。

本次 C17 标记仅为 **`PUBLIC_TERRAIN_SUBSET_PASS; NOT_FULL_GATES`**。public 行为仍不能给精确 native destruction / cache-lease 的全 C19 资格：`NOT_QUALIFIED_BY_PUBLIC_BEHAVIOR`。browser / visual / mobile / render / GPU / CSP / presentation 与 full gates 都未由本次建立；未更新全局验收 matrix。

## 原件索引（不是 raw 自含归档）

以下路径相对于保留的证据根 `box3d-resume-20261025T1146`。两报告加 counter **不包含完整 raw bundle**，也不意味着所有原件已上传仓库；复核需继续保留 JSON `originals` 指向的实际 bytes。所有生成 / 样本 / stdout / stderr / exit / closure 原件均未修改，本轮写报告未重新运行测试或物理。

| 原件                                                                                     | SHA-256                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `native-candidate-302935a/esm225-attempt-1-evidence/result.json`                         | `d4f08995a81f1a5a26016760d22c50f64ed93a562051a0bf54579e34a25d6406` |
| `native-candidate-302935a/dts225-attempt-1-evidence/result.json`                         | `052c075b2b54de2d9b90fee2db748e16ae4edcc8dc217f35c6aa59c4dc2c15ef` |
| `native-candidate-302935a/dts225-attempt-1-evidence/seven-gates.json`                    | `8813b919adade054c9294dc20b3b9cb62b8f6cc108bf39ba048e4409981a4003` |
| `native-candidate-302935a/supervision-public-terrain-sdk225-v2/producer-binding.json`    | `a390ba718044b249ab420dbefe56ac4d2c26740ed0bf27fd51bb54b0edc11cb8` |
| `native-candidate-302935a/supervision-public-terrain-sdk225-v2/input-lock.json`          | `c3458204fc2c014f8456ab8bfcc48a1a13bce4f924fdeac58d743a0cc1be5876` |
| `native-candidate-302935a/terrain-public-attempt-2-sdk225/result/consumer.raw.json`      | `4d8719e92b6be32418eab7cb5cd3fd4db322fc2b5dfeaa357adb6a4e5342e349` |
| `native-candidate-302935a/terrain-public-attempt-2-sdk225/result/observations.raw.jsonl` | `0d4d3cfd98b639311c0fb5043539ee8b138e620b2744363e31c426bb05f63893` |
| `native-candidate-302935a/supervision-public-terrain-sdk225-v2/result.json`              | `edff378c471f52decca90a3bf128c730ff50550295d75472f15ff08518220fa1` |
| `native-candidate-302935a/supervision-public-terrain-sdk225-v2/previous-preflight.json`  | `2ab41f827ef5f5d73c02e99896c83125db6d98ee00f8433108aa6abc397be8d2` |
| `native-candidate-302935a/supervision-public-terrain/result.json`                        | `0c81b0f9fabe164b78990d8848f341058a30ff1782328969453fcd09ccd5b6e1` |
| `native-candidate-302935a/dts224-attempt-1-evidence/result.json`                         | `29fe9760eb974b0614faee18a865c61ea5e40cdb64833d3194a4d75b27abc0a9` |
| `native-candidate-302935a/dts224-promotion-supplement.json`                              | `5777216d1bd7d27e47ccc12e08eead63fe64bed12b31073ed8f1840eaa1aae41` |
