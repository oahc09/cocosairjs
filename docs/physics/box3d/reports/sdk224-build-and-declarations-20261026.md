# SDK224 构建与声明：有限交付记录（2026-10-26）

## 结论

新 **SDK224 ESM 已真实构建成功**；新声明生成及 3 组 fixture、3 组 strict consumer 共 **7/7 通过**。声明包装监督曾误拒合法 legacy 小文件，原 `FAIL_OR_PARTIAL` 保留；另行精确核验并补晋升后，最终交付 25 个文件。不是完整 Terrain / C17 / 浏览器验收。

- ESM producer：`1ebcdd3b7a9e4813984d8d9b5bc0829de8581863`；native producer：`ae0803c0c3e85aa627666f76eef29c4e62ab2e93`。
- 原生 schema：`ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6`。
- 成功构建实际提交计数 **223 → 224**；本次仅一次官方裸 ESM，不运行 min/all，不使用 early-compiler preload，也不继承历史 preload 成功条件。

## ESM 与输入保护

Node `v22.16.0`，heap 4096 MiB，完整默认 feature 集加 `physics-box3d`（28 项），绑定本次真实 ST attempt2。监督记录耗时 **66.779 秒**（至输入终检；后续还有产物核验），峰值 tree RSS **3,154,063,360 字节**，exit 0，输入零漂移，构建锁释放，`ECHILD_AND_NO_GROUP_MEMBERS`。

JS **9,441,888 B**，SHA256 `b5ec7c357a762a674eb893b719d202274f180725337c72c3be57e791c4d816f8`；map **26,432,991 B**，SHA256 `682a8ed033f963166dbb58d774733e9404a22b1a83c53ff07b647dbf8aa9cc3f`，包含 **995** 个源条目及 Terrain 源。

最终 ESM 交付 **23 文件 / 40,267,487 B**。监督最初输出大小 **40,267,469 B** 在新增 `package.json` 前记录；之后以 exclusive-write 补充 **18 B** 的 `type:module` 文件，故差额明确，不是第二次构建。5 个 ST 文件与已资格输入逐字节一致。

## 新声明与如实保留的包装失败

声明在非硬链接的独立源码副本生成，不写原源码或计数。7 个命令均 exit 0；三组 consumer 均 `strict:true`、`noEmit:true`、`skipLibCheck:false`，只引用本轮新声明。监督记录 **52.330 秒**、输入零漂移、正常物理回收。

原监督对两个声明统一要求大于 1000 B，这是包装检查错误：现代声明已晋升，而原工具合法生成的 legacy wrapper 只有 **367 B**，故原终态仍为 `FAIL_OR_PARTIAL`。没有重跑生成、修改原终态或套用旧 PASS。补充记录精确核对 legacy 原源码模板及相对现代声明导出，仅 exclusive-write 缺失文件；现代声明已有字节不覆盖，原 23 个 ESM 文件 hash 不变。

| 新声明                 |      字节 | SHA256                                                             |
| ---------------------- | --------: | ------------------------------------------------------------------ |
| `cocosair.module.d.ts` | 3,375,235 | `2686ebd434bed7a05982f72ff37c553474168838798c7ba23b7ff19506ec0745` |
| `cocosair.legacy.d.ts` |       367 | `6dd42c6a064b17f923568bce9e3befce5ff0e33d7b0af19bed965a9e1a86aed2` |

原 DTS result：`29fe9760eb974b0614faee18a865c61ea5e40cdb64833d3194a4d75b27abc0a9`；补充晋升 receipt：`5777216d1bd7d27e47ccc12e08eead63fe64bed12b31073ed8f1840eaa1aae41`。必须合看这条证据链，不能将原失败改称成功。

## 限定与留存

- 本构建/声明证据完成时尚未运行 public Terrain；截至本文定稿，后续独立首次公共执行已失败（`SEPARATE_RUN_FAILED`），由独立报告处理。本构建不证明 public Terrain / C17 通过（`NOT_QUALIFIED_BY_BUILD`）；完整 Terrain gates、browser、设备与全局无泄漏均未证明。真实成功计数 224 不因独立公共验证失败而撤销。
- ST 首次构建曾因官方 Python 首次生成 6 个 pyc 导致外层保护失败；原件保留。第二次在精确新增文件基线上零漂移成功，不扩大保护排除。另行真实桥级三个销毁次序通过，只证明 `b3DestroyMesh` 完成及 core-byte 基线，不是 malloc/free 计数或完整公共 Terrain 资格。
- 原 SDK223 运行产物及 raw 未恢复；本次不是把 SDK222/223 移算成 SDK224。保留 ESM Babel/循环依赖与 DTS 废弃/template-literal 诊断，不称日志全净。
- 仅提交本文、机器摘要和真实计数文件；不上传完整 raw，摘要不是自含重放包。输入恢复范围不冒称完整最新仓库。

机器摘要：[`sdk224-build-and-declarations-20261026.json`](sdk224-build-and-declarations-20261026.json)，SHA256 `c4133edaf88abe898f4823e8d26ab0cb68076cbf26d75f00c8994bec3ecd9a80`；包含全部 23 ESM 文件、新声明及相对原件定位/hash。
