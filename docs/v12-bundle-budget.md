# V1.2 — bundle 体积预算与实际增量

> 计量对象：`build/cocosair.module.js`（dev ESM 单文件）与 `build/cocosair.module.min.js`
> 基线：`cocosair.js @ 036dd0f`（V1.2 开工前）— dev **3,736,163 B** / min **2,129,858 B**
> 构建命令：`npm run build && npm run build:min`（每次实测 `wc -c`）

## 1. 实测增量表

| 阶段 | 内容 | dev 字节 | Δdev | min 字节 | Δmin |
|---|---|---|---|---|---|
| B0 | V1.1 冻结基线（HEAD 036dd0f） | 3,736,163 | — | 2,129,858 | — |
| G0 | alpha.34 漂移修复（create-mesh / noise，净增 ~12 行） | 3,753,653¹ | +17,490¹ | 2,139,783¹ | +9,925¹ |
| A1 | profiler 回归（3 TS + category.json + exports/profiler.ts + air.ts 并入） | （含上行¹） | — | — | — |
| A3/A4/B1/D1-2 | video(11) + web-view(7) + 2d 基座与 sorting(14 新) + physics-2d framework/spec/builtin(37) | **4,330,292** | **+594,129 (+15.9%)** | **2,432,752** | **+302,894 (+14.2%)** |
| r27（2026-09-22 现读） | 批次 A/B/C/D/F 全部落地后的默认产物（audio、particle-2d、tiled-map、ui、spine、dragon-bones、post-process 命名空间、box2d 2D 后端、profiler 等到此已在 bundle 内） | **6,081,668** `35496aebda066ab5` | 累计 **+2,345,505 (+62.8%)** vs B0<br/>本行 **+1,751,376 (+40.4%)** vs 上行 | **3,499,182** `8795c8685ace28a1` | 累计 **+1,369,324 (+64.3%)** vs B0<br/>本行 **+1,066,430 (+43.8%)** vs 上行 |
| r31（2026-09-22 现读，LV12-13 第二例交付后） | 本轮改动全在示例与证据链层（`examples/physics-2d-collision`、`tools/v12/browser-matrix-contract.json`、门禁文档），`src/**` 与构建配置未动 ⇒ 重跑 `npm run build && npm run build:min` 后 `sha256sum -c` 两行 OK（日志 `E:/AIProMax/cocosair-scratch/v12-logs/r31c-build.log`、`r31c-build-min.log`），`build/cocosair.module.d.ts` 仍 `6d01c030d85bf86c` | **6,081,668** `35496aebda066ab5` | **0 B（逐字节不变）** | **3,499,182** `8795c8685ace28a1` | **0 B（逐字节不变）** |
| r32（2026-09-22 现读，LV12-12 降级口径交付后） | 本轮新增/改动全在测试与文档层（`test/smoke/smoke-31-pose-graph.test.ts`、`docs/v12-pose-graph-notes.md`、`docs/test-inventory.json`、验收报告与 `docs/audits` 台账 F-95），`src/**` 无文件变动（现读 `find src -name '*.ts' -newermt '2026-09-22 07:00'` → **0**；树内最新 `src/**.ts` mtime `2026-09-22 02:41:40`）⇒ 重跑 `npm run build && npm run build:min`（`BUILD_MIN_EXIT=0`，日志 `E:/AIProMax/cocosair-scratch/v12-logs/r32-build.log`）后两枚 `sha256sum` 与 r31 逐字节相同。`build/cocosair.module.d.ts` 本轮未重跑 `build:dts`，磁盘上仍为 r31 产物 3,082,360 B `6d01c030d85bf86c` | **6,081,668** `35496aebda066ab5` | **0 B（逐字节不变）** | **3,499,182** `8795c8685ace28a1` | **0 B（逐字节不变）** |
| r33–r37（2026-09-22 现读，LV12-07 particle-2d / LV12-08 tiledmap / LV12-03 audio / LV12-04 video 四例交付后） | 四轮的改动全部落在示例、契约、文档与门禁层（`examples/**`、`tools/v12/browser-matrix-contract.json`、`test/smoke/smoke-29-examples-spec.test.ts`、`docs/**`），`src/**` 与构建配置零变动（现读 `find src -name '*.ts' -newermt '2026-09-22 09:00' \| wc -l` → **0**）⇒ r37 重跑 `npm run build` + `npm run build:min`（`E:/AIProMax/cocosair-scratch/v12-logs/r37-gates.log` `BUILD_EXIT=0` / `BUILDMIN_EXIT=0`）后两枚 sha256 与 r31/r32 前 16 位完全相同，因此 **video-basic 的 27/27 矩阵证据仍绑定当期交付字节**。`build/cocosair.module.d.ts` 本轮未重跑 `build:dts`，磁盘上仍为 3,082,360 B `6d01c030d85bf86c`（mtime 2026-09-22 02:59） | **6,081,668** `35496aebda066ab5` | **0 B（逐字节不变）** | **3,499,182** `8795c8685ace28a1` | **0 B（逐字节不变）** |
| r38（2026-09-22 现读，LV12-05 web-view 例交付 + F-107/F-108 修复后） | 本轮改动仍全部在示例/契约/门禁/文档层（`examples/webview-basic`、`examples/video-basic/main.js`、`tools/v12/browser-matrix-contract.json`、`test/smoke/smoke-29-examples-spec.test.ts`、`docs/**`），`src/**` 零变动（现读 `find src -name '*.ts' -newermt '2026-09-22 12:00' \| wc -l` → **0**）⇒ `npm run build` + `npm run build:min`（`E:/AIProMax/cocosair-scratch/v12-diag/r38-gates-b.log` `BUILD_EXIT=0` / `BUILDMIN_EXIT=0`）后两枚 sha256-16 仍 `35496aebda066ab5` / `8795c8685ace28a1`，与 r31–r37 逐字节相同 ⇒ **当期 30/30 矩阵（10 例 × 3 引擎，`contractFingerprint 8d259554c3759cbc`）与 `docs/evidence/v11-examples-verified.json` 的 50 条记录（`candidateFingerprint 9fa85f88b968d5f1`）都绑定交付字节**。`build/cocosair.module.d.ts` 本轮未跑 `build:dts`，磁盘上仍是 3,082,360 B `6d01c030d85bf86c`（mtime 09-22 02:59） | **6,081,668** `35496aebda066ab5` | **0 B（逐字节不变）** | **3,499,182** `8795c8685ace28a1` | **0 B（逐字节不变）** |

¹ G0/A1 合并计一次构建（profiler 接线与漂移修复之间未单独出全量产物）。
其中 `+17,490` 归属 A1 profiler（含 G0 两文件净增行），余 `+576,639` 归属 video/web-view/2d/physics-2d-builtin 四组。

² **r27 行的归因口径（诚实记账）**：上行到 r27 之间的 +1.75 MB dev 无法按组拆分——那些组是在多次并行构建与会话交叠中陆续接线的，
中间态产物未逐组 `wc -c` 留档，事后按「组→字节」外推会伪造精度。可用的当期事实只有：
`npm run verify:file-map`（rows=1233 / modified=28）、`sha256` 两枚（护栏 7 的重复构建逐字节稳定已实测）、
以及发布面 `build/cocosair.module.d.ts` = 3,082,360 B。若需按组归因，须从 B0 起做「逐组接线 + 逐次构建」的复现实验（成本 ≈ 每组一次全量构建）。

## 2. 预算判定（计划书护栏 2 / 决策点 D1）

- 维持单文件 ESM（D1）：未触发分包复议。
- 已用增长 ≈ 0.59 MB dev / 0.30 MB min。剩余 12 个回归组中体积风险最大项：
  spine（`lib/spine-core.js`，预估 ~0.5 MB 级）、physics-2d box2d/wasm（45 文件）、
  3D 物理四后端（87 文件 / ~14.1k 行）、gfx-webgpu（24 文件）、ui（24 文件）、post-process（37 文件）。
  按已实测的「~1.4k 行 TS → ~7 KB min」粗率外推，剩余全量约 min +0.35~0.5 MB（不含 spine 运行库与 wasm 资产）。
- wasm / 大型运行库按 P2 走运行时资产（不进 bundle）：`build/decoders/` 同级模式。

## 3. 资产侧发现（影响预算与验收口径）

- `@cocos/box2d@1.0.2` 包内**未找到任何 `.wasm` 文件**（`find node_modules/@cocos/box2d -name '*.wasm*'` 为空）。
  → 计划书 D3「来源 @cocos/box2d 包内资产」前提待核，批次 D-3（`physics-2d-box2d-wasm`）与 LV12-14 需先出资产来源结论（联动 R8 的 `docs/v12-physics-asset-sourcing.md`）。
- npm 依赖已按 P1 入库：`@cocos/box2d ^1.0.2`、`@cocos/cannon ^1.2.8`、`@cocos/dragonbones-js ^1.0.2`
  （安装使用 `--ignore-scripts`，未引入 postinstall 钩子链，符合 P1 约束）。
  注：计划书要求 `dragonbones-js@^1.0.1`，实际可解析最新版本为 `^1.0.2`；`box2d` 计划书要求精确 `1.0.2`，npm 写入为 `^1.0.2`（待定是否改精确锁）。
