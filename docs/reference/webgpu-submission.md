# WebGPU 提交范围与证据交付

本记录处理最终 review 的两项 P2：证据原件被 Git 忽略，以及当前生成物绑定并行源码。它定义交付边界与依赖，不授予暂存或提交权限。版本仍为 `1.0.0`，构建计数仍为 169；API 保留 Linux 环境阻塞，Safari 保留外部 NOT_RUN，发布仍为 NOT READY。

## 精确范围

[交付清单](../evidence/webgpu-submission/manifest.json) 的 `files` 记录仓库相对路径、字节数与 SHA-256，`profiles` 列出以下互斥范围。基线为 `main` 的 `7e4cdc4288fd1e7a9f695d9140ade77c30441790`；没有纳入基线已经包含的未修改源码。

| 范围           | 内容与交付条件                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webgpuSource` | WebGPU 实现、冻结 builtin/translator 源资产与许可、ABI/视频修复、相关构建配置、严格规格/采集器及回归、示例和说明。生成到 `src/air/builtin/` 的源码属于这组，是构建输入，不能因其由生成器维护就漏交。 |
| `controls`     | 本次交付校验工具、范围说明与精确 Git 日志例外；清单本身是单独的根文件，不自引用哈希。                                                                                                                |
| `parallel`     | 16 个既有 UI／屏幕后处理源码、出口、测试及记录。保留原字节，排除出 WebGPU 源码范围。                                                                                                                 |
| `generated`    | 当前 SDK dev/min/d.ts/maps、WebGPU 部署副本、API/测试清单和示例 manifest。它们绑定组合候选，先保留，不能搭配仅含 WebGPU 的源码提交。                                                                 |
| `evidence`     | 当前与历史归档、失败日志、原始截图及五份当前报告。独立交付用于追溯；其完整性通过不等于当前发布验收通过。                                                                                             |

路径数组是精确清单，不使用全仓 `add` 或通配提交。文件内容变化后旧摘要必须报错；不能通过重标候选、删除失败原件或修改 API 状态来使校验变绿。本次清单由 review 路径快照与实际证据目录生成，不会自行发现并授权新的源码范围。

## 生成物依赖与顺序

并行批处理说明 `docs/manual/batching-recipes.md` 单列在 `parallelDocumentation`，与对应示例工作一起保留，不归入 WebGPU 源码范围。

本轮校验期间另外观察到两个并行示例输入变化：`examples/shared/batching-routes.ts` 与新文件 `examples/shared/indexed-draw-observer.ts`。它们单列在 `parallelExamples`，排除出 WebGPU 范围且保留字节。`workspace` 记录当前摘要与相对原证据输入的完整差异，`candidate` 保留采证时的原标签；`evidenceFresh=false` 明确表示现有证据不能签署当前工作区。闭包验证通过只证明交付完整，没有把这次输入变化放行成新的浏览器 PASS。后续任何未登记变化继续报错。

`generatedDependencies` 明确记录当前生成物依赖全部 `parallel` 路径及本轮 WebGPU 源码。当前 d.ts 的 `attachAirBloom`、`AirScreenPass` 等声明来自并行源码；JS 与 API 清单也包含这些功能。

本次选定 **WebGPU 源码先整理、组合生成物继续保留** 的路线。后续进入实际提交阶段时，需要先确定并行源码的独立交付顺序；组合生成物只有在这些依赖都随源码交付后才能使用。若最终仅交付 WebGPU 源码，则必须在隔离候选中重新构建并刷新相应清单/证据，不能携带本机现有组合产物。此依赖尚未满足时，机器状态固定为 `HOLD_UNTIL_PARALLEL_SOURCE_DELIVERED_OR_ISOLATED_REBUILD`。

`webgpuSource` 是本次审阅的源码边界，不声明它已经形成独立通过构建或验收的候选。先前 21 场景原生 WebGPU 完整验收属于历史快照，定向 18 项资源合同与最新 WebGL2 三引擎结果均不替代它。

## 证据闭包

交付清单覆盖六份既有归档 manifest 的全部成员，以及完整相关证据目录。目录中的附加日志也逐字节登记；不只保留原先发现的 94 个 manifest 依赖。原 94 个依赖包括 88 份日志与 6 张被嵌套 `output/` 规则忽略的 PNG；完整目录另有 1 份归档日志。`.gitignore` 仅为这 95 个具体文件添加例外；PNG 的父目录解除目录忽略后立即重新忽略其内容，再逐文件放行。普通本地日志及未列出的截图仍被忽略。

验证同时检查文件哈希/大小、归档成员是否交付、五份当前报告的绑定、矩阵 81 张 PNG 与 DevTools 5 张 PNG。历史报告保留原时间、原候选及原结果；历史报告指向旧正典的哈希不用于签署当前正典。最新运行状态仍以 [本机刷新记录](release-gate-refresh.md#2026-10-17本机可执行项刷新) 为准。

默认检查只读，需要 Git、Node 及本仓现有开发依赖，不启动浏览器、不写证据、不运行构建：

```bash
node tools/delivery/webgpu-submission.cjs
```

仅为演练证据交付，可显式复制到一个全新、尚不存在的本地输出目录：

```bash
node tools/delivery/webgpu-submission.cjs --export=output/webgpu-submission-transport
```

该命令先验证冻结工作区，再复制证据、清单及交付控制文件，最后从复制目录复验。证据绑定的 API inventory、coverage 与测试清单以 `reportCopies` 映射到交付目录的 `reports/` 快照；原始字节与哈希保持，根目录的组合生成报告继续保留在工作区。这使证据交付无需纳入组合 SDK 或并行源码。命令不会写 Git 索引。复制品中带有同一校验器，可仅用 Node 离线验证：

```bash
node output/webgpu-submission-transport/tools/delivery/webgpu-submission.cjs --evidence-only
```

离线模式验证交付内容与候选标签的完整性，不检查原工作区、Git 可见性或浏览器行为。交付清单自身不充当签名或防篡改信任根；需要独立保留清单的可信来源。

实际暂存后应从 Git 索引导出证据、控制文件与本清单，再用 `--evidence-only` 复验，避免只检查工作区而漏交文件。默认完整模式要求原冻结工作区及原基线 HEAD；提交后或单独克隆源码时使用离线模式验证归档，不能将完整模式的历史快照失效当作新的浏览器结果。输出中的 `releaseReady` 始终为 false；普通 API 的 Linux 托管采证、Safari 外部验收及未交付的并行源码/组合生成物继续独立披露。
