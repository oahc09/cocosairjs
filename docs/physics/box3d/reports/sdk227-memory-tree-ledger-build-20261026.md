# SDK227 tree-ledger 修复构建记录（2026-10-26）

## 结论与边界

新 ST、官方裸 ESM227 与 fresh DTS227 均实际成功；**仅构建与低层 fixture 有限通过，不是 APP / C20 或零泄漏验收**。旧 SDK226 APP 的 strict FAIL / 0 qualified 保留，76,940 B 仍未归因，after-close APP 观测不可用。

Producer：`117d6af86f96ff15e0d734745b47a8b0b19a9c5f`。新 schema：`3a1c552650979c205898c90c4d862483810b66dc5c875f155c80e92fb15618da`；布局仍为 **87 行 / 740 words**。从旧源物理复制独立源码，再核对 12 项 before/after hash，未修改旧源码、ST、SDK 或失败 raw。

## 实际构建链

| 阶段               | 结果                                     | 监督记录耗时 | 保护/物理回收                |
| ------------------ | ---------------------------------------- | -----------: | ---------------------------- |
| 新 ST 单次         | exit 0 / `PASS_LIMITED_ST_BUILD`         |     98.286 s | 输入零漂移 / ECHILD          |
| 官方裸 ESM227 单次 | exit 0 / `PASS_FRESH_ESM227_BUILD`       |     79.350 s | 输入零漂移 / ECHILD / 锁释放 |
| fresh DTS227 单次  | exit 0 / `PASS_FRESH_DTS227_SEVEN_GATES` |     63.148 s | 输入零漂移 / ECHILD          |

实际关闭记录为 `ECHILD_AND_NO_GROUP_MEMBERS`。耗时记至进程关闭及输入终检，后续仍有产物校验与完成回执写入。各阶段使用独立新输出，不自动重试、不覆盖历史证据。

ST 使用原 `build-ready.mjs --out <fresh source-internal output>`，不是 `--native`。标准 gate 数目未放宽：**37 commands / 92 inputs / 84 compile units / 55 evidence files**，原完整 gate 集保留。

### 39 unit 与 10 生产 WASM 检查分开记账

- **39 项受控 native-unit 检查**含错误分支注入，不能冒称全部来自生产观察。
- **10 项真实生产 WASM 检查**在独立低层 fixture 中通过。新 `postStepRebuildLedger` 确实执行 step，要求 rebuild scratch 容量大于零；`releasedPostStepRetainedLedger` 校验释放后的保留 ledger。两项实际结果均为 true，不是仅 zero-step 观察。
- 这些验证不等于真实 APP、完整 C20 周期或 APP 关闭后计量；不更改基线，也不对先前 76,940 B 进行虚构归因。

## 新 SDK227 与声明

Node `v22.16.0`，官方裸命令 `node --max-old-space-size=4096 tools/build/build.cjs --format esm`，完整 **28** features，无 preload，不运行 min/all。真实成功计数 **226 → 227**，不是重标旧产物。

ESM **23 文件 / 40,371,856 B**，map **995** 条源；新 ST 文件与资格输入逐字节匹配。最终大小包含编译后 exclusive-write 的 **18 B** `type:module` package；该 18 B 不在最初输出大小记录内。

DTS 在非硬链接独立源码副本中重新生成，**emit + 3 fixture + 3 strict consumer = 7/7**。消费者只读本轮声明，`strict:true/noEmit:true/skipLibCheck:false`。先验证现代声明内容与 legacy 原生成器精确模板、相对现代导出，再 exclusive-write 两文件；无任意大小下限。声明 hash 与前版相同并不代表复用，本次完整生成和检查均有独立原件。

最终 SDK：**25 文件 / 43,747,642 B**。

- JS SHA256：`bf376d320200c4d7171db20af5a644c8b7b76a153f37bac81694416242823bf0`
- map SHA256：`c9f558881f763ebc8f0cea3f5080633b2817f48799d6c65931619185dd453740`
- DTS result SHA256：`43d45eb1072bdefd9b541d91adcce4457223a7567a560e1a1facb541350a78fb`

## 未升级的状态

前代 APP226 的新增诊断在 full/released 阶段因 guard 误拒合法 NULL tree backing 而失败；原 strict byte-baseline 失败（36,040 → 112,980 B）独立保留，76,940 B 仍未归因。原 strict FAIL / 0 qualified 和全部 raw 保持原样；此次低层修复不回填旧运行，也不自动认定新 APP 通过。

`owned-files` 仍为 **PARTIAL 当前修改条目维护**，不是完整历史清单 PASS。APP / C20、浏览器、设备与全局无泄漏未由本构建链资格化；76,940 B 未归因，after-close APP 观测和全局 handle/world census 不可用。此前 native exact-count 失败、SDK224 声明包装失败及补充链均未覆盖。

仅发布本文、机器摘要及真实 counter227；不上传大 raw，不宣称自含可重放包。相对原件路径、命令、产物 hash 与退出状态见机器摘要。

机器摘要：[`sdk227-memory-tree-ledger-build-20261026.json`](sdk227-memory-tree-ledger-build-20261026.json)，SHA256 `07da1b67338e1296359cfaa484b6d9603fc8731fc9ed14afe2397d328936a418`。
