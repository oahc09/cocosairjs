# SDK226 内存诊断构建与声明（2026-10-26）

## 有限结论

新 ST、官方裸 ESM226、fresh DTS226 均已实际完成；**不代表 APP / C20 通过或零泄漏**。第一次 ST 失败原件保留，修复入库后才运行独立第二次 ST；ESM 与 DTS 各一次，没有覆盖旧 SDK224/225。

Producer：`f3d7457c7b81283bc1af31a0b0a892aedc5f5760`；新增诊断初始提交：`8d5fa3208ee2b02793ac50d86e31b5cd11fe860f`。新 schema：`bef78296f8fff850570799c65d6f4b0a47115cf38aed898a58cf88275348fd84`，不混用旧 schema。

## 实际执行链

| 阶段          | 实际结果                                 | 监督记录耗时 | 保护与回收                 |
| ------------- | ---------------------------------------- | -----------: | -------------------------- |
| ST attempt1   | exit 1 / `FAIL_OR_PARTIAL`               |     25.202 s | 输入零漂移，ECHILD         |
| ST attempt2   | exit 0 / `PASS_LIMITED_ST_BUILD`         |     94.748 s | 输入零漂移，ECHILD         |
| 官方裸 ESM226 | exit 0 / `PASS_FRESH_ESM226_BUILD`       |     71.562 s | 输入零漂移，ECHILD，锁释放 |
| fresh DTS226  | exit 0 / `PASS_FRESH_DTS226_SEVEN_GATES` |     54.520 s | 输入零漂移，ECHILD         |

ECHILD 的实际记录为 `ECHILD_AND_NO_GROUP_MEMBERS`。表中时间记录至进程关闭与输入终检，随后仍有产物核验及完成回执写入。

第一次在 command 2、编译前被 `motion-source-controls` 的旧 **79** 输入硬断言阻止（实际 **92**）；另一个 command control 与消费门禁的旧 **82** 编译单元断言也一并精准迁移。修复提交和持久回归保留旧必需集合，未删除或放宽门禁；原失败 raw、退出和监督记录均不改写。

第二次执行原 `build-ready.mjs --out <fresh source-internal output>`，**不是 `--native`**。原标准门禁全部成立：**37 命令 / 92 producer inputs / 84 compile units / 55 evidence files**，完整保留旧 33 / 79 / 82 / 52 集合。

### 两类内存证据不得混同

- **31 项受控 native-unit 检查**包括 locked / overflow / mismatch 等注入分支，`injectionsAreProductionObservations:false`。
- **8 项生产 WASM 检查**使用真实生产导出，但只是独立低层 fixture；包括只读重复、ledger 求和、短缓冲不部分写入等。未把受控注入伪装成生产观察，`acceptancePassed:false`。
- 这些结果不替代真实 APP、同场景 C20 周期或 APP 关闭后观测，也不解释既有 **76,940 B** 未归因差额。

## SDK226 与声明

使用 Node `v22.16.0`，官方裸 `--max-old-space-size=4096 tools/build/build.cjs --format esm`，完整 **28** features，无 preload/min/all。真实成功计数 **225 → 226**，不虚增版本。ESM **23** 文件；源 map **995** 条，ST 五文件与本次原生产输入逐字节相同。最终 ESM 合计 **40,370,158 B**，比监督最初输出大小多补写 `type:module` package 的 **18 B**。

声明在非硬链接的独立源码副本生成，**emit + 3 fixture + 3 strict consumer = 7/7**。消费者均 `strict:true/noEmit:true/skipLibCheck:false`，只引用本轮新声明。现代声明内容及 legacy 原生成器精确模板、相对现代导出先全部校验，再 exclusive-write 两文件；不沿用曾误用的大小下限，不复用旧声明 PASS。旧 SDK224 包装失败及补充记录保持原样。

最终 **25 文件 / 43,745,944 B**；JS SHA256 `bde0c4e5b9f5e81cd03129ecb14034cf6d3d337c88d561f7e0a317889dbbe282`，map SHA256 `e10b045f302aaf26fe06134e13d4c2f85e92b56cf3ba61eb0ba1b6dc7e6761c3`。DTS 两文件 hash 与 SDK225 恰相同，但此次确实重新生成并完成全部检查。

## 未完成边界与证据

`owned-files` 仍为 **PARTIAL 当前修改条目维护**，不是完整历史清单 PASS。APP / C20 尚未由本链资格化；既有 strict APP 失败不被本构建抹去；76,940 B 未归因；after-close APP 观测与全局 handle/world census 仍不可用，不称全局无泄漏。浏览器、设备与完整业务未由本链运行。

仅提交本报告、机器摘要和真实计数文件，不包含大 raw，不虚称自含可重放包。原件相对定位、命令及哈希见机器摘要；旧失败和所有冻结 ST/SDK/raw 未修改。

机器摘要：[`sdk226-memory-diagnostics-build-20261026.json`](sdk226-memory-diagnostics-build-20261026.json)，SHA256 `136fa4b8cccca1541047d4aed4d35717286b7d1b7fb218365e58a7b5409153eb`。
