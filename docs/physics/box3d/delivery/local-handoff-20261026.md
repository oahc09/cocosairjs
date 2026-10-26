# Box3D：本地接管、当前进展与剩余闭环

更新时间：2026-10-26 23:15（UTC+8）。这是执行交接，不是完成报告。

## 0. 一页结论

- 仓库：[oahc09/cocosairjs](https://github.com/oahc09/cocosairjs)，工作分支 `feat/box3d-rebuild-20261022`，不是展厅仓库，也不是 main。
- 本次交接的远端已核基线：`f7ff40c23ed4ab3f8cf119ec92289de6277c1024`。2026-10-26 23:09 已重新读取远端引用确认。今晚后续小修复可能继续推进分支；本地启动前必须 fetch 并核对最新提交，不强制 reset。
- 已实现并提交：Box3D 单线程接入的大量核心代码、Terrain/shared mesh、生命周期和事件修复、87 行原生内存诊断、SDK227 对应源码及验证报告、空 world 安全回收设计和 CPU 代际模型。
- **最关键未闭环项：C20 应用层同 app／同 world 的 100 次 scene 生命周期。SDK227 在第 1 轮释放后就因 bytes 未回初始基线而失败，0/100 qualified。不是还没跑，也不是已通过。**
- 新诊断三点已完整取得；释放后 world 账本净增 76,940 B，module 请求字节净增 76,160 B，bridge 净增 0。已能定位保留容量的类别，但不能据此宣布“泄漏”或“无泄漏”。
- 修复方向：先解决四类对象 ID 的代际安全和溢出／故障处理，再做同 world 的空闲容量回收，接入 releaseScene 正确尾部；不改原验收比较、不 warmup、不重建 world 规避。
- **阶段 2 identity core 的 11 文件候选未提交，随临时环境变化丢失。它不是本地可取的代码。只能依据已提交设计重新实施、重新测试、产生新证据。**
- 其余原项目范围没有取消：35 tasks、91 父类别、9 examples、G0–G8；冻结矩阵 2,128 required cells / 186 execution definitions。不能以 C20 或有限回归代替整体完成。

## 1. 当前执行与写入责任

用户最新要求：今晚将可提交的 Box3D 小任务尽快修复提交，保证功能代码及时入库，同时准备本地接管并自行管理状态。

因此：
1. 云端今晚仅继续原 Box3D 分支上可独立审查的小批修复；不合 main、不强推、不发布、不创建新云任务或切环境。
2. 本地开始修改时，应明确切换唯一写入者。云端与本地不要同时修改同一功能/分支；建议本地从最新已核提交新建本地接管分支。
3. 本文记录的是上述基线时刻，不会把后续源码候选自动记为已测试。
4. 远端已经存在的功能修复和报告可以获取；原临时 SDK、raw 大包、工具链、未提交候选不能假定仍存在。
5. 后续可用提交必须带代码、配套测试和真实状态；只完成源码审查的独立资格候选可以提交保存，但必须标记 `NATIVE_NOT_RUN / NOT_INTEGRATED`，不得装入生产 SDK。

## 2. 已提交检查点

下表是定位锚点，不是所有提交的完整列表。完整历史以 Git 为准。

| 提交 | 内容 | 准确边界 |
|---|---|---|
| `cd742f8000e8718f2bdfde0ce1eb9015271c1e28` | 不支持的 Terrain/Hull/RoundHull 事件注册原子性修复 | 不添加不支持的 geometry 配对；失败注册不遗留 listener/flag |
| `e5a7ddec9fa515a2fe17316dd3ab36538e48e23d` | SDK225 Terrain 有限公开运行回归及 build225 | 不是全部 Terrain/C19/Gate 完成 |
| `4a21d78d95b3a7e09f3f6c1226cf0a56339cfea2` | C20 lowlevel v3 debug-cache 口径修正 | shapeHandles 是懒建 debug cache，不是所有 shape 总数 |
| `84ccd9292af6bea1eb525a50bfc857fe96154c4d` | lowlevel 100 轮可观测子集报告 | 完整 global world/all-handle census 尚未资格 |
| `f1380eb96809c3a24e7f2ec024f4cdeebefb327e` | APP fixture v2：关节阈值设置移到 mount 后 | 原 baseline 和 100 轮条件不变 |
| `9e91b0e5570ae0a14a53460beb0a4f4e9331bb0e` | APP 首轮 strict baseline 失败证据 | 不隐去失败 |
| `8d5fa3208ee2b02793ac50d86e31b5cd11fe860f` | 只读 memory diagnostics | 初版后续发现 tree scratch NULL 误判 |
| `f3d7457c7b81283bc1af31a0b0a892aedc5f5760` | 精确库存门禁同步修复 | 37 commands / 92 inputs / 84 units / 55 evidence |
| `3048ffe289cd37e59a66de44472cd18108f05693` | capture 的真实 native producer root 绑定 | 不放宽原构建 gate，不重写编译证据路径 |
| `117d6af86f96ff15e0d734745b47a8b0b19a9c5f` | tree ledger 合法 inactive scratch 修复 | SDK227 producer；只修六行 guard/描述，不改原账本公式 |
| `64d3a39884cb0816b34b9bdd89957318a3091be7` | SDK226 capture 失败报告 | 旧 1/3 诊断失败不追溯改成通过 |
| `a104f15f4ae2fc1f280fd5edfbadc14d5e709e12` | SDK227 构建链报告和 counter227 | native/unit/WASM/ESM/DTS 有限通过，不是 C20 APP 通过 |
| `a14ce32567166b8b0c124ffaadfe0d92b8db0ee7` | SDK227 capture v2 runner | fixture 身份与 producer 身份分开 |
| `65730a3adb4c8fc588c7aa2c4a412ba9f891dc7c` | SDK227 三点完整 capture 报告 | strict 仍 FAIL、0 qualified |
| `f7ff40c23ed4ab3f8cf119ec92289de6277c1024` | 同 world 回收设计 + 代际 CPU 模型 | 只有设计/模型；尚无生产 trim |

## 3. 先读哪些仓库文件

### 合同与完整范围

- `AGENTS.md`
- `ai/plans/box3d-v1.2-reference.md`
- `docs/physics/box3d/contracts/inventory-freeze-v1.md`
- `docs/physics/box3d/empty-world-trim-design.md`
- `tools/physics/box3d/empty-world-trim/generation-model.mjs`
- `tools/physics/box3d/empty-world-trim/generation-model.test.mjs`

### 最新关键报告（均在 `docs/physics/box3d/reports/`）

1. `c20-app-memory-diagnostics-sdk227-capture-20261026.md` 与 `.json`：最新三点实测及完整类别差分。
2. `sdk227-memory-tree-ledger-build-20261026.md` 与 `.json`：SDK227 新构建身份、真实 39/10 检查和 DTS。
3. `c20-app-memory-diagnostics-failures-20261026.md` 与 `.json`：旧 NOT_READY 和 SDK226 诊断失败。
4. `c20-app-strict-baseline-failures-20261026.md` 与 `.json`：原 APP v1/v2 失败背景。
5. `c20-lowlevel-observable-regression-20261026.md` 与 `.json`：100×50 低层可观测子集。
6. `sdk225-terrain-regression-20261026.md` 与 `.json`：Terrain 真实有限回归。
7. `sdk223-ex02-initial-observations-20261025.*`、`sdk223-ex03-channel-regression-20261025.*`、`sdk223-ex05-comparisons-lifecycle-20261025.*`、`sdk223-ex09-limited-route-2026-10-25.*`：已有示例的有限结果，不要重列为“无源码/未运行”。

报告是已提交的摘要及 hash 索引，不是 self-contained 原始证据归档。文中的旧工作区路径现在不可作为可下载输入。

## 4. 实际完成与当前失败

### 4.1 Terrain 与低层资源生命周期

Terrain 是 heightfield-cooked-static-triangle-mesh 路线，不是 native compressed heightfield。共享 cooking、查询、变换、启停、替换拒绝、资源释放已有实现及有限证据。

SDK225 公开 fixture：43 ray、3 sweep、1 committed query、41 drop samples、45 个固定 1/60 frame；首次接触后继续观察至第41步，正常 close，进程闭合、输入零漂移。它不代表完整 C19、移动真机或全部渲染验收。

C20 lowlevel v3：真实执行100 world ×50 body/50 shape，包含fixed joint、共享mesh与debug cache；每轮激活debug后handles 0→50，3456条lines，core/bridge回原基线。结论为 `OBSERVED_NATIVE_SUBSET_PASS`；完整 global world 与所有 handle census 不足，C20LOWLEVEL 仍 `NOT_QUALIFIED`。

### 4.2 SDK227 构建身份

- producer：`117d6af86f96ff15e0d734745b47a8b0b19a9c5f`
- upstream core：`efca0c184d40fd6a82016983f1601c4d23965867`
- 生产 patch chain：`4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c`
- ABI schema SHA256：`3a1c552650979c205898c90c4d862483810b66dc5c875f155c80e92fb15618da`
- 内存诊断布局：87 rows /740 words。
- ST 精确库存：37 commands /92 producer inputs /84 compile units /55 evidence files；全部实际检查通过。
- 39项受控 native-unit 断言 +10项生产 WASM 检查实际通过，新增真正 step→tree rebuild→released 读取，不再只有step0。
- ST 98.286s、ESM227 79.350s、DTS227 63.148s；DTS 7/7。各阶段退出/后代闭包和输入零漂移有报告。
- SDK最终25 files /43,747,642 bytes；当时已实际产生，**当前临时副本缺失，不能当作现在可直接使用的包**。
- build counter 227已入库；本地新构建必须产生新身份/编号，不冒认旧227原字节。

### 4.3 SDK227 APP capture：诊断完整，验收失败

同 app、同 world，初始/nativeStep0、满载step7、释放step58，三点各87行全部通过诊断求和与身份校验。

| 计量范围 | 初始 | 满载 | 释放后 | 释放−初始 |
|---|---:|---:|---:|---:|
| world ledger | 36,040 | 108,708 | 112,980 | +76,940 |
| module core requested bytes | 167,320 | 239,624 | 243,480 | +76,160 |
| world bridge bytes | 48 | 224 | 48 | 0 |
| global bridge bytes | 48 | 224 | 48 | 0 |
| excluded arena backing | 131,072 | 131,072 | 131,072 | 0 |

world ledger净增分类：

| 分类 | 字节增量 |
|---|---:|
| solverSet | 38,656 |
| worldArray | 16,512 |
| dynamicTree | 12,348 |
| graph | 7,104 |
| events | 1,848 |
| ID free lists | 384 |
| hulls.map | 88 |
| 合计 | **76,940** |

其中tree的1,932 B属于未实际分配backing的共同capacity估算，不能当malloc。module与world两个差值相差780 B，不得人为填平或未经证据归因。

其余事实：mesh cook/destroy 0/0→4/3→4/4；resources空→一项lease1/borrow3→空；释放后body/shape/contact/joint四live counts均0；双方trigger事件各1 enter/52 stay/1 exit。1 app、1正常close，58连续frames；1,884保护记录/1,868唯一路径零漂移；ECHILD且无后代，预算无违规。

**结论：原strict断言失败，首轮停止，0/100 qualified。三点诊断完整不等于生命周期验收通过；正常close不证明after-close所有资源归零。**

### 4.4 已修复的诊断问题

core在heuristic0时只分配leafCenters，leafBoxes/binIndices可合法NULL，但core ledger仍按shared rebuildCapacity计账。旧诊断误要求capacity>0必有非NULL指针，导致SDK226在step7/58拒绝返回。SDK227仅对六个inactive行使用专用检查，保留其余指针、sum、overflow、原子输出检查；元数据说明改为估算。这不是对原76,940 B严格失败的修复。

## 5. 环境变化、丢失范围及恢复原则

已核事实：运行机器标识发生变化；旧Box3D工作目录、恢复工具链、SDK224–227临时包和下一阶段候选在当前工作区不可见，较早目录仍在。未获得平台系统事件日志，**无法确认系统为何替换/恢复环境**。

已保住：远端f7ff及之前的源码、测试工具、设计、摘要报告、build counter。

未保住：
- 11文件stage2 identity未提交候选、其完整manifest和原日志；
- control/candidate各111 core staging；
- 临时SDK与完整raw大包、原工具链目录。

历史候选manifest `42c3dad95976b6a67212aa863d9cb105f4a9fc2e52ec77222da426fcec339613` 只是历史标识。**不能声称恢复了其原字节，也不能让新实现沿用旧PASS日志。**

今晚可重建并提交新候选；必须生成新manifest和测试记录。报告里旧原件hash继续作为历史索引保存，不代表文件仍可取得。所有重要代码应及时分批提交；大产物另用用户批准的持久归档，不能把“在临时目录里”当交付。

## 6. C20 修复的确定路线

### A. Identity基础：先不启用生产trim

对body/shape/joint/contact分别维护固定大小H（历史generation高水位）与F（新槽floor）。同slot在epoch内只递增；trim时F=H，随后所有fresh slot包括高index均从F起步，因此跨trim新身份大于旧历史。

- body/shape/joint为uint16，contact为uint32；必须checked unsigned、溢出前拒绝，不能wrap。
- 不用“每创建一个对象全局++”策略；不同slot可共用generation。
- 预检须在创建的第一次状态修改之前。joint拒绝不能先删除两body之间已有contact。
- 已对回调/缓存/外界暴露的候选ID，不得回滚其generation历史。
- contact现有signed中间量要修；内部contact耗尽必须明确fault，不得静默漏碰撞或把void Step后当成功。
- fault出口仍释放stack、等待tree task、解锁；不solve/翻event buffer/发布成功snapshot；保持可靠destroy/close。
- 该证明只适用于同一world lifetime，raw IDs不含world generation，不能顺带宣称跨world槽复用ABA安全。
- 固定identity metadata从world创建时就计账。历史候选拟36 B，必须实际native确认；它不是malloc额外请求。旧87行诊断不含这一项，生产集成需新分类/schema。

已提交CPU模型13项通过，有限穷举9,761状态/65,809边，并有3种错误seed反例。**它不是C/native/allocator/真实fault-unwind证明。**

### B. 同 world 空容器回收

保留world ID/generation、stepIndex、配置、callbacks和历史maxima。容量目标来自创建配置，不能反推76,940或拿高水位当新基线。

逐类恢复：solver-set空数组（保留0/1/2 reserved sets）、world arrays及paired fatAABBs、空树/graph、ID free lists、空hull map、events及其他未增长但可能持有容量的结构。必须真实释放/重建合格容器，不只改count/capacity/计量字段，也不能把代际状态藏到未计账目录。

H==MAX、world锁定、仍有对象/资源/任务/命令/引用等均须在修改前拒绝。allocator当前断言式失败不等于可恢复OOM事务，必须明确定义失败路径。

### C. 正确release接入与事件ACK

已核顺序：scope deactivate/pause → scope dispose微任务 → director摘persist/scene destroy/第一次deferredDestroy → await cleanup → releaseQueue flush → 第二次deferredDestroy → **新增受控hook** → receipt。

- 不放在scope disposer内部，不加dummy step。
- 正常release queue是paused，不能用assertSteppingAllowed误拒。
- event getters不是ACK，只看得到previous endbuffer；ACK需覆盖两个sensorEnd、两个contactEnd及move/begin/hit/joint残留。
- 静默退役旧scene，不给新scene补旧回调，不虚构exit；保持stepIndex和end-buffer角色。
- 非空persist world应 `SKIPPED_NONEMPTY`，不能删合法持久对象或让原本合法release一概失败；这也不证明剩余对象无泄漏。
- 真正eligible-empty但ACK/trim失败需在receipt可见，阻止假成功；close仍应能执行。
- 成功推进binding mutation revision，旧native snapshot capability失效；已复制的不可变JS事件不被修改。

### D. 原样重跑

新source→新patch chain/schema→新ST→新ESM/DTS→原same-app/world100scene fixture。保留原首次scene前baseline比较。新固定metadata可改变新实现的初始字节数，但不能重设已经开始的run基线，更不能改写旧SDK227的36040失败记录。

## 7. 丢失stage2候选的重建规格

下列是历史候选目标路径，不表示文件已存在于远端：

```text
tools/physics/box3d/patches/same-world-identity-v1.candidate.patch
tools/physics/box3d/patches/identity-step-status-v1.candidate.patch
tools/physics/box3d/empty-world-trim/identity/CMakeLists.txt
tools/physics/box3d/empty-world-trim/identity/README.md
tools/physics/box3d/empty-world-trim/identity/compare-ledgers.mjs
tools/physics/box3d/empty-world-trim/identity/native-contract.c
tools/physics/box3d/empty-world-trim/identity/patch-lock.json
tools/physics/box3d/empty-world-trim/identity/profile.json
tools/physics/box3d/empty-world-trim/identity/profile.mjs
tools/physics/box3d/empty-world-trim/identity/source-contract.test.mjs
tools/physics/box3d/empty-world-trim/identity/stage.mjs
```

使用既有patch-intake严格before/after hash、精确context、无fuzz；保留原三patch及顺序（SSE2 alignment、contact geometry epoch、checked hull cooking），不直接改vendor原件。独立资格profile先不激活生产locks/schema/SDK。

九个core变更点：physics_world.h的H/F与fault；id_pool.h只读peek；body.c/shape.c/joint.c前置检查及9joint入口NULL传播；contact.c unsigned与stickyfault；broad_phase.c公共stack清理；physics_world.c fault/Step出口/event getters/初始metadata账本；公开header只读fault查询。

独立bridge资格层必须让真实world_step在core fault后返回非OK；不能仅改core而原bridge仍返回OK。生产完整facade/backend fault-close尚需后续集成。

历史拟171项native断言，**从未编译执行**：body28、shape26、hull失败8、joint35、contact高index22、contactunsigned7、contactfault16、main9。重建时按真实测试组织更新精确计数，不为追求171而凑断言。

关键hull失败负控：fixture-only H/F=59，单位BoxHull有限scale1e8尝试checked惯量失败，确认实际进入fresh槽后归还free pool、floor/H仍59，再同槽sphere成功generation60。是否进入该数值分支必须实际运行确认。

**native资格要求Debug并核真实compile_commands无NDEBUG；BOX3D_VALIDATE=ON不能单独证明断言启用。** control与candidate同工具链分别构建，实际验证embedded metadata增量；不要复用旧日志或挂SDK227。

## 8. 原项目剩余范围，不止C20

| 范围 | 剩余工作 |
|---|---|
| T00–03、T32 | 同步合同/决策/fixture/预算/当前实际结果；文档存在不等于关闭 |
| T04–07 | ST、SIMD/CSP、loader/ABI/ownership、ID/heap/bulk-read完整矩阵 |
| T08–13 | 已有world/body/基础与凸形状能力；补全部setter rollback、父变换/缩放、COM、销毁和指定几何验收 |
| T14 / C16–20 | mesh/Terrain已有有限实测；static baked compound C18仍缺；完整资源/查询合同；C20APP修复及全局census |
| T15 / C21–25 | 事件已有通道；补原要求contact geometry配对/snapshot/transient sensor/目标回调；不删除unsupported guard冒充支持 |
| T16 | 完整query/CCD/事件/生命周期矩阵；已有ray/primitive sweep不是从零；不自增任意hull sweep范围 |
| T17–19 | P2P/Hinge/Fixed已有基础；T18/C35/C30EXT高级joint与revolute spring、公共合同/拒绝路径 |
| T20/T33 examples | 已有EX01/02/03/05/09；缺EX04 joint-mechanisms、EX06 terrain-assets；已有项还需完整操作/重置/UI/证据 |
| T21–23/T34 | ST Node/browser完整回归、builtin/Cannon/2D共存、真实npm pack空消费者、文档、BIZ01–08 |
| T24–26 | MT、character、正式recording/replay，EX07/EX08；EX09 action playback不能替代T26 |
| T27–29 | 冻结设备性能P01–07、AG01–05独立验收 |
| T30–31 | 同一source/runtime全required矩阵、九示例、消费者、许可证、可访问证据闭环 |

当前示例有限证据：EX02 Firefox 2436 ticks，但20次reset/运动中Stop等未完整覆盖；EX03 channel有限回归，armed preset真人取消未覆盖；EX05对照有限；EX09三单333分仅D路线、formal0。不要把这几项重新称为“源码缺失”，也不能把有限操作升级成formal通过。

建议顺序：C20安全回收闭环 → static baked compound/contact geometry/advanced joints与EX04/06 → G5完整核心preview → G6–G8。**G5不是原项目全部结束。G5须同时满足EX01–06+09、BIZ01–08、完整ST矩阵、tarball consumers与核心文档，C20修复不等于G5自动通过。** 真Android/iOS/Safari、BIZ07人工首次使用必须真实设备/人员，不能用桌面viewport代替。

## 9. 本地接管第一轮步骤

1. 读取本地AGENTS，确认origin是指定仓库，检查 `git status --short`；保留已有修改，不 `reset --hard`、不强推。
2. fetch工作分支，查看与本交接基线f7ff的差异。今晚可能有后续小提交；以远端最新已核记录与用户本地改动合并决策为准。
3. 从确认的commit新建本地接管分支，记录source SHA。与云端确认唯一写入责任后再开始同模块修改。
4. 先运行已提交的纯CPU generation model及相关source controls；源码准入与native通过必须分列。
5. 依仓库locks安装/核对依赖。历史成功工具版本：Node22.16.0、Emscripten6.0.2、CMake4.4.4、Ninja1.13.2。它们是历史重现参考，不代表本机已具备；以锁文件和真实 `--version` 为准，不擅自全局改环境或安装不可信工具。
6. 不必为了开始代码开发先重建全部历史SDK。先把新独立identity源码/测试小批提交，再做其有界native资格；真正启用生产时才重建完整同版链。
7. 新OUT独立，不覆盖旧失败目录。记录命令、时间/内存/磁盘上限、stdout/stderr、exit、全部后代闭合、输入前后hash及产物hash。Windows采用能证明等价进程树闭合的方法，不伪造Linux ECHILD。
8. 生产build-ready默认ST；`--native`是另一种host诊断，不能替代生产WASM。当前gate37/92/84/55是SDK227事实，加入功能后需准确迁移所有引用，不能改为“至少”或跳过清单。
9. 生产构建保持现有默认27 features加physics-box3d共28，不做只剩物理的缩水SDK；ESM只构建一次，独立DTS源副本，7gates与strict consumers实际跑。
10. 编译器/产物/fixture/schema变化必须重新锁定；最终以同一套新source+ST+SDK完成实际100轮，历史有限证据只作背景。

## 10. 自主管理状态：不要靠聊天记忆

接管者在仓库中维护一个短状态入口（建议 `docs/physics/box3d/STATUS.md`）和结构化任务清单（建议同目录 `closure-tasks.json`）。若已有等价文件先复用，避免双重真相。此处是建议路径，不声称已经创建。

每项最少字段：`id, contractRefs, implementationStatus, validationStatus, sourceCommit, runtimeIdentity, evidencePaths, blocker, nextAction, owner, updatedAt`。

状态必须区分：
- `NOT_STARTED`：未开始；
- `SOURCE_ONLY`：源码/审查完成，实际native/runtime未跑；
- `VERIFIED_LIMITED`：明确范围的实际检查通过；
- `FAIL`：实际断言失败；
- `BLOCKED`：缺设备/输入/权限等；
- `DONE`：原合同要求全部完成且证据可取。

执行规则：
1. 同一核心链只维持一个主要IN_PROGRESS阶段；可并行只读审查或不冲突测试，不多写者争用。
2. 每个小单元代码+测试+状态成组提交，推送后读回远端SHA；不等长任务全部结束才保存。
3. 每个新运行独立attempt，不覆盖失败；修复可继续新attempt，但必须标明差异与新身份。
4. 检查失败先分类ENGINE / TEST-HARNESS / INFRA / MISSING-EVIDENCE，不把环境阻塞当功能通过，也不把模型证明当native通过。
5. 原断言/required matrix不得缩范围；不能用warmup、重置baseline、fixture特判、重建world或忽略输出制造PASS。
6. 行动结束前更新下一步和实际证据。若必须用户输入，给单一清楚阻塞；其他可独立工作继续。
7. 功能代码进入Git；大raw/SDK使用已授权持久归档，保存位置与hash；不可只记临时路径。未获归档许可时至少先提交可入库源码与精简报告，不上传到自选第三方。
8. 最终DONE要求所有原范围逐项可核；百分比不得由源码文件数或有限断言数推算。

## 11. 可直接给本地 Agent 的启动提示词

```text
接手 oahc09/cocosairjs 的 Box3D 完整接入与验收闭环。
先读取 AGENTS.md、本交接文档、ai/plans/box3d-v1.2-reference.md、
docs/physics/box3d/contracts/inventory-freeze-v1.md，以及最新reports。
交接已核基线是 feat/box3d-rebuild-20261022 @ f7ff40c23ed4ab3f8cf119ec92289de6277c1024，
但云端今晚仍可能提交小修复；先fetch/检查本地未提交改动和最新差异，明确唯一写入者，
不要reset或覆盖他人修改，不合main、不强推、不发布、不擅自换环境。

第一目标是原C20同app/world100scene严格基线，不改fixture、warmup或重建world。
SDK227三点诊断已完整，但释放ledger+76940、module+76160，strict FAIL、0/100 qualified。
empty-world-trim-design与generation-model已入库；stage2 identity 11文件候选未提交且丢失，
不得假装已恢复或沿用旧manifest/PASS。检查今晚是否已有新重建提交，再决定是否重建。

先实现四类H/F代际安全及溢出/内部contact fault/可close，保持独立非生产资格profile；
Debug真实native验证后再实现empty-world回收、双buffer ACK、releaseScene尾hook和新计量schema。
保留world身份/step，真实释放容量，metadata从初始即计账，旧raw ID不能复活。
新同版ST/ESM/DTS后原样跑100scene，补全global census；再完成原完整范围的其余任务。

自行维护仓库STATUS和任务清单，区分SOURCE_ONLY/VERIFIED_LIMITED/FAIL/BLOCKED/DONE，
每个小修复带测试及时commit/push并核远端，保存新attempt的原始证据，不覆盖旧失败。
缺设备/人工验收如实BLOCKED，不停掉其他可做任务，不把未执行前置写成事实。
最终报告列完成项、剩余项、提交SHA、测试范围、失败和证据位置。
```

---

本交接不含SDK二进制、完整raw包或丢失的stage2候选。所有“历史通过”均限定于当时报告所绑定的源码/运行范围；本地重建后的新版本须重新验证。
