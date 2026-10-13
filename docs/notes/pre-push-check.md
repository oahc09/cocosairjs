# 提交 GitHub 前检查报告

日期：2026-10-13。范围：工程结构、`src/` 代码、可推送产物。只读检查 + 用户批准的少量安全修正。

## 已执行的安全修正

| 项目 | 处置 |
|---|---|
| 根目录临时脚本 `.png-audit*.tmp.py`、`.png-report.tmp.txt` | 复查时已不存在，无需处置 |
| `.gitignore` 缺 `.env` / OS 垃圾 | 已补 `.env`、`.env.*`（保留 `.env.example`）、`.DS_Store`、`Thumbs.db`、`desktop.ini`、`*.swp`、`*~` |
| `src/air/**` 96 个 `.ts` 无版权头 | 已补 MIT block（见 §4 任务） |

## 阻断项（需在推送前决策）

1. **无 git remote、无 upstream**。`git remote -v` 为空，`main` 无跟踪分支。166 个提交只在本地磁盘，无远端备份。推送前必须确认目标仓库与可见范围。
2. **Spark 未完成工作流是最大不确定负载**。未跟踪：`docs/evidence/spark/` 117 MB（366 文件）、`vendor/spark/` 27 MB、`src/air/spark/` 5.8 MB（含 2.75 MB 生成物 `spark-runtime.js`）、`build/fflate/` 1.3 MB、`vendor/spark-rs/` 2.3 MB，合计 **~153 MB**。且 `spark-rs` WASM 的许可处置为 `pending`（见许可报告），**在 owner 闭合前 spark 变体产物不得作为 release 交付物**。不要盲目 `git add`。
3. **版本漂移四处不一致**：根 `package.json` `1.0.0` / `src/package.json` `cocosair-engine@0.1.0` / `.gitignore` 头注释 `V0.1` / `tools/build/build-number.json` `81`。公开前应统一表述或显式说明各自含义。
4. **`package.json` 缺公共仓库元数据**：`author`、`repository`、`homepage`、`bugs`、`description`、`keywords` 全部缺失。GitHub 公开包的常见最低要求。

## 工程结构观察

**已跟踪的大文件（会推 GitHub，但不进 npm）**：

| 文件 | 体积 |
|---|---|
| `build/cocosair.module.js.map` | 19.5 MB |
| `build/cocosair.module.min.js.map` | 16.0 MB |
| `docs/evidence/.../kit-consumer-s2-artifacts/chunk-FGGLEZSX.js` | 6.8 MB |
| `build/cocosair.module.js` | 6.5 MB |
| `docs/evidence/.../kit-consumer-s2-artifacts/cocosair.js-1.0.0.tgz` | 4.2 MB |
| `tools/benchmark/fixtures/B126/...big-multimb.glb` | 4.8 MB |
| `docs/evidence/shaders-absorption/e01-engine-scoped.json` | 4.5 MB |
| `build/cocosair.module.d.ts` | 3.2 MB |

两个 source map 合计 **35.5 MB** 被跟踪，而 `package.json files[]` 只发布 `build/npm/`（无 map）。这是刻意保留的发布侧资产还是历史遗留，需确认；`.gitignore` 未排除它们。

**其它**：

- `build/` 内 36 个文件已跟踪，其中 20 MB + 16.7 MB 的 map 是主要体积；`.gitignore` 只忽略 `build/` 的子目录（`npm/`、`reports/`、`examples/`、`tmp`）。
- `docs/evidence/**/logs/*.log` 已入库，虽然 `.gitignore` 有 `*.log`（ignore 规则不会 untrack 已入库文件）。作为证据归档是刻意的，但值得确认。
- 无 `.DS_Store` / `Thumbs.db`。
- `output/`（187 MB）与 `src/node_modules/`（20 MB）正确忽略/排除。

**关于"重复证据"的核查结论（不构成问题）**：`docs/evidence/examples/webgl2-gfx-contracts/` 下有大量同名
`*-attempt2.json` 变体（219 个已跟踪文件，多个 1.25 MB），初看像重复运行残留。实测 `diff` 后确认**不是**：
`control-20261011-attachment-layer.json` 与 `-attempt2.json` 除了时间戳和截图路径外，
`tools/debug/probes/webgl2-gfx-contracts/main.js` 的 sha256 **不同**（`7df8abfb…` vs `0d5656cb…`）。
即每个 attempt 记录的是**不同探针源码状态**下的运行，属该仓库证据合同要求的历史保留，
**不应**用 `git rm --cached` 或 `.gitignore` 清理。同理 `interactive-engine-improvements/` 的
`timeline-s4.json` 等大文件是其主题的正式证据产物。

> 结论：本次检查不建议对 `docs/evidence/**` 做任何删除或忽略；体积是刻意的证据留档成本。

**`src/` 代码组织**：

- `src/air/` = 98 文件（96 `.ts` + 生成物）。子目录：`assets/`（51，glTF 装载/材质/解码器/atlas/bmfont）、`spark/`（8）、`rendering/`（5）、`utils/`（5）、`builtin/`（4）、`effects/`（2），顶层 23 个 `.ts`。
- **平行抽象冲突（需决策）**：`src/air/spark/spark-api-adapter.ts`（73 KB）定义 `Scene`、`Material`、`Mesh`、`Group`、`Object3D`，与工作协议"避免创建平行 `Scene`/`Node`/材质抽象"直接冲突。`src/exports/spark.ts` 已知此问题，缓解方式是**仅靠不重导出**——适配器不进根导出面。它是 three.js 兼容门面（多为协议常量 + 委托 `cc.math`），约 180 KB，但按现有规则文字确实越界。它属 Spark 未完成工作流，需与 §阻断项 2 一起决策。
- `tsconfig.json`：`target es6`、`module commonjs`、`strict true` 但 `noImplicitAny false`、`noEmit`、`isolatedModules`。`src/tsconfig.json` 覆盖 `exports|cocos|pal|external|predefine.ts`，**不含 `air/`**。配对排除块为已登记偏差（Deviation-04/05）。

## 配置一致性

- `package.json`：`main`/`module` → `build/npm/cocosair.module.js`，`types` → `./build/cocosair.module.d.ts`，3 个 `exports` 条目，47 个 scripts。所有脚本目标与导出路径在磁盘上存在。
- `files[]` 17 条；`licenses/` 已包含（`docs/*.md` 间接带入 `docs/THIRD_PARTY_LICENSES.md`）。
- `docs/test-inventory.json`：178 套件 / 2771 用例 / 2771 通过 / 0 失败（生成于 2026-10-11T10:25:25Z）。
- 无 `CHANGELOG` 或 release notes 文件。

## 本次验证结果

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | PASS（exit 0） |
| `npm run verify:file-map` | PASS（`rows=1403 modified=204`） |
| `npm run verify:licenses` | 0 FAIL / 1 ATTENTION（既有 spark-rs pending，非本次引入） |
| `npm run verify:doc-refs` | exit 1，39 条断链。**全部为既有**，来自其它工作流的文档引用 `output/` 路径；本次改动文件（AGENTS.md、npm-scripts.md）零断链 |
| `npm run format:check` | 215 条既有 warn（示例 `example.json` 等），**本次改动文件不在其中**；`src/` 本就不在格式门禁范围 |
| `node tools/build/spark-runtime-tree.cjs --check` | PASS（drift 空） |

## 建议的推送前动作

1. 确定目标远端，确认私有/公开与许可证可见性。
2. 决策 Spark 未完成负载是否随首次推送入库（~153 MB + pending 许可）。
3. 统一版本表述；补 `package.json` 的 `author`/`repository`/`description`。
4. 确认 35.5 MB build map 是否应继续跟踪。
5. 决策 `spark-api-adapter.ts` 平行抽象与工作协议的关系（改为显式豁免说明，或移出规则范围）。
