# V1.2 — 上游特性回归总账

> 上游冻结点：`cocos4 @ 4.0.0-alpha.34`，bump commit `fffd9a514a`；G0 实测上游工作副本 HEAD `557b06f7e636572a15a426eb8c2387f40b92798a`（其后 2 个提交 `#341` `#343` 仅触及 native 平台代码，按计划书 R7 冻结不追）。
> 本文档状态口径：`verified / in-progress / blocked / not-delivered` 四态，禁止把计划值写成完成事实。

## 1. G0 基线事实核验

| 项 | 值 |
|---|---|
| cocos4 HEAD（G0 实测） | `557b06f7e6` |
| 对齐点（冻结） | `fffd9a514a` = `4.0.0-alpha.34` |
| cocos4 `package.json version` | `4.0.0-alpha.34`（creator field 3.8.8） |
| cocosair.js HEAD（G0 起点） | `036dd0fe45c94348fbc72e9e730d260947d288a7` |
| Working Tree Status | 开工时不干净：`build/cocosair.module.*`、`docs/api-coverage-report.json`、`docs/evidence/v11-*.json`、`docs/audits/global-quality-audit-2026-09-19/*` 为并行审计会话所改（未提交）；本计划书产物在其之上叠加 |
| alpha.33→alpha.34 触及 `cocos/` 的提交 | 4 个（**非计划书所记 2 个**）：`60f9352c56` #336 createMesh、`6b455561f4` #338 noise、`f66365f959` #334 TerrainInfo、`2a75cfb9da` #329 webgpu pipelinelayout |

### 1.1 漂移修复执行（P0，先于一切抽取）

| 官方文件 | Air 路径 | 修复前 | 修复后 |
|---|---|---|---|
| `cocos/3d/misc/create-mesh.ts` | `src/cocos/3d/misc/create-mesh.ts` | 停留 alpha.33（idxStride 硬编码 2 / R16UI） | `verified` — 逐字节等于官方（`cmp` 通过），>65535 顶点索引自适应 R32UI 恢复 |
| `cocos/particle/noise.ts` | `src/cocos/particle/noise.ts` | 停留 alpha.33（实例内构造 512 表） | `verified` — 逐字节等于官方，静态 `DEFAULT_PERMUTATION` + `build512` |
| `cocos/rendering/custom/web-program-library.ts` | 同名 | — | `verified` — G0 实测**已与上游一致**（#329 已在此前同步），无需动作；登记为事实 |
| `cocos/terrain/terrain.ts` | 不存在 | Air 未含 terrain 模块 | `not-delivered` — 不在 16 组范围内；#334 一行 `@visible(false)` 随 terrain 模块决策处理（见 §4 残留差集） |

`docs/upstream-file-map.json` 对应两条记录已更新为 alpha.34 对齐说明。

### 1.2 全量比对（G0-4，脚本化可复现）

比对工具为本阶段新增：`tools/compare/baseline-compare.cjs`（scope = `cocos/**`、`pal/**`、`exports/**`；输出 `docs/v12-baseline-compare.json`）。

```bash
node tools/compare/baseline-compare.cjs --upstream E:/AIProMax/github/cocos4
```

G0 实测（对上游 HEAD `557b06f7e6`）：

| 清单 | 计划书立项值 | G0 实测 | 说明 |
|---|---|---|---|
| 官方独有文件 | 554 | **500**（排除 `*.jsb.ts` 后 **446**） | 口径差：计划书含 `.js`/其他 scope；本脚本按 `cocos|pal|exports` 的 `.ts+.js` 计 |
| 共同文件 | 787 | **799** | Air 侧含 `src/exports/air.ts` 等自有入口 |
| 内容漂移 | 2 | **6（全部语义漂移，零换行符假阳性）** | 见 §1.3 |
| Air 独有 | 未记 | **30** | `src/air/**`、`src/exports/air.ts` 等 |

### 1.3 漂移 6 文件与登记完整性（新发现，已修）

`tools/compare/baseline-compare.cjs` 报出的 6 个语义漂移 = Air 侧有意修改：

| 文件 | upstream-file-map 登记 | 处置 |
|---|---|---|
| `cocos/core/platform/debug.ts` | `modified: true` | 保持 |
| `cocos/core/utils/path.ts` | `modified: true` | 保持 |
| `cocos/gfx/webgl/webgl-swapchain.ts` | `modified: true` | 保持 |
| `cocos/rendering/pipeline-ubo.ts` | `modified: true` | 保持 |
| `cocos/animation/marionette/pose-graph/runtime-exports.ts` | `modified: true`（删 2 行 pose-nodes/pure-value-nodes 导入） | 批次 C3 恢复官方原文 |
| `cocos/rendering/global-descriptor-set-manager.ts` | **登记缺失**（实际已改：`AIR_SHADOW_UBO_SIZE=2048`，与 pipeline-ubo 成对；`modified` 原标 false） | **`verified` 已补登记，`meta.modifiedCount` 5→6** |

## 2. 对计划书的两处事实修正

1. **G-1 前提不成立**：`cocos/physics/framework/physics-selector.ts` G0 实测与上游**逐字节一致**（mapping 亦登记 `modified: false`）。计划书 §9「physics-selector 已在 Air（指向 spec 空实现），本批次把它恢复官方原文」的动作**为空操作**——Air 现状之所以无后端可选，原因是 `src/cc.config.json` 未注册任何 `physics-*` 后端 feature，而非文件被改。批次 G 只需注册后端 + 增补 npm 依赖，无需「撤销 Air 修改」。
2. **漂移面为 4 文件而非 2**：见 §1.1，#334/#329 需按实测登记。

## 3. 16 回归组抽取总账（G0-5）

差量文件数以 `docs/v12-baseline-compare.json` 的 `upstreamOnly` 实测为准（含 `.js`，故与计划书「仅 .ts」计数有小差异）。

| # | 回归组 | 计划书差量 | G0 实测独有 | 批次 | 状态 |
|---|---|---|---|---|---|
| 1 | audio | 6 | 6 | A | **blocked** — 上游无 `pal/`，`@cocos/engine-pal` 未安装 |
| 2 | dragon-bones | 14 | 14 | C | **verified（r41 回归完成）** — `src/cocos/dragon-bones/**` 14 文件与上游 sha256₁₆ 全同、0 未登记偏差；example `dragonbones-basic` 双链 PASS（§6.16）|
| 3 | particle-2d | 10 | 10 | B | not-delivered |
| 4 | physics-2d | 102 | 102 | D | **in-progress** — D-1/D-2 完成（framework 21 + spec 5 + builtin 8 + category.json = 37 byte-identical）；D-3 box2d/box2d-wasm **blocked**（`@cocos/box2d@1.0.2` 包内实测无 `.wasm`）；`box2d-jsb` 按 §1.3 跳过 |
| 5 | profiler | 3 | 3 | A | **verified（代码回归）** — 3 TS + category.json byte-identical；feature/入口/air.ts 已接；导出表含 `Profiler`；example 与浏览器矩阵 not-delivered |
| 6 | spine | 24 | 25（含 `lib/*.js`） | C | not-delivered |
| 7 | tiledmap | 11 | 11 | B | not-delivered |
| 8 | video | 9 | 9 | A | **verified（代码回归）** — 11 文件（含 `category.json`）byte-identical；feature/入口已接；导出表含 `VideoPlayer`；**example 已交付**：`examples/video-basic` stable/frozen，三引擎矩阵 PASS（§6.12，明细 `docs/v12-video-notes.md`） |
| 9 | web-view | 5 | 5 | A | **verified（代码回归）** — 7 文件 byte-identical；feature/入口已接；导出表含 `WebView`；example not-delivered |
| 10 | gfx webgpu | 24+5 | 29 | E | not-delivered |
| 11 | deprecated.ts | 1 | 需单独核 | F | not-delivered |
| 12 | root.jsb.ts | 1 | jsb 类 | F | not-delivered（D4 默认不抽取） |
| 13 | ui 完整组件集 | 24 | 24 | B | not-delivered |
| 14 | marionette pose-nodes | 31+1 恢复 | 31 | C | not-delivered |
| 15 | 3D 物理后端 | 87 | 90 | G | **partial**（`physics-3d-basic` r39 双链已交付，见 §6.14；`physics-3d-collision` 待 cannon 变体） |
| 16 | post-process + custom | 40 | 42 | H | not-delivered |
| 前置 | 2d 基座 | 3 必补 | 3（+1 jsb 跳过，实测另需 `cocos/sorting` 3 文件） | B1 | **verified（代码回归）** — `cocos/2d` 全量 + `cocos/sorting` 落位 97/97 byte-identical，`native-2d.jsb.ts` 跳过；`features.2d`（modules `2d`+`sorting`）已激活 |
| 前置 | 2d 关联 exports | 6 | 7（含 `sorting.ts`） | B1 | **in-progress** — 7 个入口已复制；`air.ts` 并入 `2d/graphics/mask/sorting`，**未并入 `sorting-2d/geometry-renderer/intersection-2d`**（产物导出表 `Sorting2D`/`GeometryRenderer` 实测缺失） |

合计 16 组 + 前置 ≈ 415 文件（与计划书「预计 ~400」同量级）。

### 3.1 r26 现况（活门禁口径，不回改 §3 的 G0 期快照）

§3 是 G0 立项期的快照。下表为 r26 现况，证据只取**当期可复跑门禁**：
`npx jest test/smoke/smoke-30-v12-regression.test.ts` → **28/28 passed（2026-09-22）**，
其中 14 个组名用例即「代表符号出现在当期 `build/cocosair.module.js` 的 export 表」。

| 组 | r26 状态 | 证据 |
|---|---|---|
| 1 audio | verified（代码+产物面+运行时） | smoke-30「A2 audio」两条：产物含 `decodeAudioData/createBufferSource`、`pal/audio` 运行面语义、`AudioSource` 可挂载 |
| 2 dragon-bones | verified（产物面 + **r41 抽取逐字节 14/14** + 示例双链） | `GROUPS['C2 dragon-bones']`（命名空间 `dragonBones`）+ vendored `@cocos/dragonbones-js` 逐字节；**r41 `examples/dragonbones-basic` 双链 PASS**：V1.1 全量 `52/52 PASS`（本例 `15 verified / 31 attested / 46 units`、`unproven 0`）+ 三引擎矩阵 `36/36`、契约 247 条 `probeEquals` ⇒ 明细 §6.16 与 `docs/v12-dragonbones-notes.md` |
| 3 particle-2d | verified（产物面） | `GROUPS['B2 particle-2d']` |
| 4 physics-2d | in-progress | D1-2/D3 verified（含 `createPhysicsWorld()` 自由落体 1s ≈ 5m 真实模拟）；**D4 box2d-wasm blocked**（`@cocos/box2d@1.0.2` 包内无 `.wasm`）；`box2d-jsb` 按 §1.3 平台排除 |
| 5 profiler | verified（产物面） | `GROUPS['A1 profiler']` |
| 6 spine | verified（产物面）+ 资产侧 P2 | `GROUPS['C1 spine']`；`air-spine-instantiate-js` override 缺失资产走可读降级提示（smoke-30 spine 用例） |
| 7 tiled-map | verified（产物面） | `GROUPS['B3 tiled-map']` |
| 8 video | verified（产物面） | `GROUPS['A3 video']` |
| 9 web-view | verified（产物面） | `GROUPS['A4 webview']` |
| 10 gfx webgpu | **部分交付 + D10 待确认** | 26 文件 `byte-identical 26`，`verify:file-map` PASS；类型核对/变体构建/出图受阻（`docs/evidence/v12/d10/README.md`，UPSTREAM.md Deviation-04）；默认产物逐字节不变 |
| 11 deprecated.ts | verified（抽取逐字节）+ 不接线 | smoke-30「F-1」：`Root.prototype.ui → batcher2D` getter/setter 实测生效；上游零引用者 → Deviation-03 |
| 12 root.jsb.ts | 豁免登记 | §1.3 平台排除 + Deviation-02（`upstreamOnlyByCategory["platform.jsb-variant"]` = 54） |
| 13 ui 组件集 | verified（产物面） | `GROUPS['B4 ui']`（Button/Label/EditBox/ScrollView/Mask/Graphics） |
| 14 marionette pose-nodes | **verified（闭包逐字节 + 单元级求值）** + 默认发行不含姿势图（交付姿态待 owner） | 漂移件已恢复官方原文（§1.1）；r32 落 `test/smoke/smoke-31-pose-graph.test.ts`（8 用例：52/52 子树逐字节 + 簿记未改标记 + `PoseNodeApplyTransform` 手算数值/串联/5 帧无泄漏）⇒ 明细 **`docs/v12-pose-graph-notes.md`**。r43 把「为什么默认拿不到」与「打开要付多少」量化：Air `features` 原先**根本没登记** `marionette` / `procedural-animation` 两条官方 unit（上游 `cc.config.json:236-247`，均 `modules:[]` 只带 `intrinsicFlags`）⇒ 手工 `AIR_FEATURES` 传未声明名被 ccbuild **静默忽略**（`EXIT=0` 且产物与默认逐字节同，已记 **F-119** 并落构建侧护栏）；补登两条后变体真实生效：**+339,301 B（+5.58%）→ 6,420,969 B / `84db38d62ca3e74f`**、`PoseNode` ×128，而**默认三产物 PRE/POST 逐字节不变**（r43c/r43e，见 notes §4） |
| 15 3D 物理后端 | in-progress | G1 builtin verified（`GROUPS['G1']` + 3D selector 断言 + **r39 `examples/physics-3d-basic` 双链 PASS**：69 claims、`promotion verified 35/attested 34/units 69`、契约 304 条 `probeEquals`、全量矩阵 33/33，见 §6.14 与 `docs/v12-physics3d-notes.md`）；G2 cannon 变体取证待补；**G3 ammo/physx blocked**（`external:emscripten/{bullet,physx}` 资产不随快照分发） |
| 16 post-process | verified（产物面） | `GROUPS['H post-process']`（`postProcess`/`BloomStage`） |
| 前置 2d 基座 | verified | `GROUPS['B1 2d 基座']`（含 `Sorting2D`/`GeometryRenderer`/`Intersection2D`，G0 期缺口已闭合） |

**取证层（计划书 §12 每 LV12 的 example + 三浏览器矩阵 + `docs/evidence/v12/` 截图）尚未铺开**，
故上列 verified 只支撑「代码回归/产物面」，不等于组级验收通过。

> ⚠️ **本表是 r26 口径**（不回改）。其中第 4 行「D4 box2d-wasm blocked」与第 15 行「G3 ammo/physx blocked」
> 的**代码面**已被 r45c 的 82 文件逐字节抽取 + r45d 的分支契约用例与门禁改写（**运行面仍 blocked 于同一份 emscripten 资产缺口**），
> feature 声明面也从 r43 的「Air 31 / 缺 25」变为「Air 34 / 缺 22」⇒ 现况与可复跑判据见 **§7**。

## 4. 范围外残留差集（G0 新增发现，需决策）

比对显示：16 组之外仍有 **52 个非 jsb 官方独有文件**。计划书 §1.3 声称「除平台性排除项外，官方 Web feature unit 与 Air 的差集在 V1.2 后应为空」——按实测该断言**不成立**，除非把这些残留一并纳入或显式豁免：

| 归属 | 文件（代表） | 性质 |
|---|---|---|
| `cocos/terrain/**` 4 | `terrain.ts` `height-field.ts` `terrain-lod.ts` `index.ts` + `exports/terrain.ts` | 官方有 `terrain` feature unit，计划书 16 组未列 |
| `cocos/xr/**` 2 | `index.ts` `xr-event-handle.ts` + `exports/xr.ts` | 官方 `webxr` feature，未列 |
| `cocos/sorting/**` 3 | `index.ts` `sorting.ts` `sorting-2d.ts` + `exports/sorting*.ts` | 计划书仅在 B1 顺带提到 `sorting-2d.ts` |
| `cocos/core/**` 4 | `curves/keys-shared-curves.ts` `data/utils/constget.ts` `data/utils/extends-enum.ts` `event/defines.ts` `math/affine-transform.ts` | core 内差量，含 `exports/affine-transform.ts` |
| `cocos/asset/**` 15 + `cocos/render-scene/**` 11 + `cocos/scene-graph/**` 6 + `cocos/3d/**` 6 | — | 需逐个分类（editor-only / jsb / 真缺失）后方可判定 |
| `exports/` 其余 | `particle.ts` `rich-text.ts` `light-probe.ts` `ui-skew.ts` `vendor-google.ts` `gfx-webgpu.ts` | 3D particle、rich-text、light-probe 等入口未列 |
| `cocos/gfx/**` 残留（webgpu 之外） | 需分类 | — |

处置建议（登记为决策点 D9，待确认）：对 52 项逐条分类为「纳入 V1.2 / 平台性排除 / 显式 Deviation 豁免」，不默认扩范围。

> **r42 更新（本表的数字与「待分类」状态已被逐条分类取代）**：`docs/v12-baseline-compare.json` 现读
> `upstreamOnly=178`（含 jsb）/ `upstreamOnlyExcludingJsb=124` / `residualCounts={platformExcluded:82, inPlanPending:82, needsDecision:14}`
> ⇒ 上表「52 个非 jsb 文件」是 G0 期口径，**真正待决策的只剩 14 项**，且已逐项给出「上游归属 feature / 实质 / Air 现状 / 纳入成本 / 建议口径」+ 六条可复跑判据命令：
> **`docs/v12-d9-residual-triage.md`**。该文档是**提案**，不代替 owner 确认（护栏 ① 要求「理由 + 确认」，本轮只补齐理由）。
> ⚠️ **r45e 复测**：批次 D-4/G-3 落地后同一命令读数变为 `upstreamOnly 178→96` / `excludingJsb 124→42` / **`inPlanPending 82→0`**，
> 而 `platformExcluded 82` 与 `needsDecision 14` **一字未动** ⇒ **计划书 §1.3 的「16 组范围内差集为空」现已实测成立**，
> 本表剩下的待决项就是那 14 个（D 组 1 项已 r43 结案 ⇒ 待批 13）；明细与逐桶 diff 见 `docs/17-baseline-comparison.md` §9 的 r45e 注。
> 同轮实测的另一条结构判据：Air `cc.config.json` 声明 29 个 feature、上游 **55** 个（`onlyUpstream` 27、`onlyAir=[air]`）、`airDangling=[]` ⇒ 残留不是「抽取漏了」的形状。
> ⚠️ 该行的 29/27 是 **r42 快照**：r43 补登 `marionette` / `procedural-animation` 后现读为 **Air 31 / 上游 55 / `onlyUpstream` 25 / `differing` 0 / `onlyAir=["air"]`**
> （判据 `node E:/AIProMax/cocosair-scratch/pg-probe/feature-units.cjs` → `feature-units-r1.json`；活账见 `docs/17-baseline-comparison.md` §9.1 与 `docs/v12-d9-residual-triage.md` §5 末条）。
> **r45c 再复测**：并入 3 项 wasm 后端声明后 = **Air 34 / 上游 55 / `onlyUpstream` 22 / `differing` 0 / `onlyAir=["air"]` / 默认 `AIR_FEATURES` 26**；
> 该读数此后由 `npm run verify:v12-backends` 的 A5 断言锁定（不再靠 scratch 脚本）。
> （r42 本行曾把 55 误录为 54——`features-r1.json` 里 `upFeatures` 实测长度就是 55，是**转录错**不是探测错；r43 复核 `Object.keys(up.features).length` = 55 后改正。）
>
> **r43 更新（D 组结案 + 一条护栏 ② 增量证据）**：上游的 `-empty` 模块替换**只由 `cc.config.json` 的 `moduleOverrides[].overrides` 显式路径对驱动**（上游 3 条：`cc.config.json:321/:462/:469`；无自动加 `-empty` 后缀的构建逻辑——已扫上游 `scripts/**`）。
> Air 侧 **三条齐全**（r43 现读行号 `src/cc.config.json:281/:422/:429`；本文件与别处旧文引用的 `:269/:410/:417` 是 r43 前同号段行号，r43 在 `features` 补登 2 个官方 unit 后整体下移 13 行 ⇒ 后续按内容锚定），且三个替换目标文件与上游**逐字节同**（`native-2d-empty.ts e0f982053278a8f1`／`marionette/index-empty.ts c5c59441c2e0b260`／`pose-graph/runtime-exports-empty.ts 8e609bb71c20b858`）⇒ 该机制面**无缺口**，属护栏 ② 的正向证据。
> 由此 `cocos/serialization/deserialize-dynamic-empty.ts`（32 行 throw 桩）结案为「**上游侧零引用桩**」：全上游无 importer、两侧 config 均无该映射 ⇒ 不纳入零功能损失，D 组降级为「只剩一句口径确认」。
> ⚠️ 同轮自查发现 r42 初版把「没有 `deserialize-dynamic` 这条映射」错写成「两侧 config 均未提及 `-empty`」，已在 `docs/v12-d9-residual-triage.md` §2 末条留痕更正。

## 5. 回归护栏状态（G0 期实测）

| 护栏 | G0 实测 |
|---|---|
| `npm run typecheck` | **PASS**（exit 0，漂移修复后） |
| `npm test`（jest 29 suites） | **PARTIAL — 209/210 passed；1 FAIL**：`test/smoke/smoke-29-examples-spec.test.ts`（V1.1 示例证据链：S11 证据 `completed!==true` → 整份 NOT_RUN、promotion 三元组漂移）。**归因**：开工时 `docs/evidence/v11-*.json` 与 `build/*` 即已被并行审计会话改脏/过期，属既有红灯，非 V1.2 漂移修复引入（memory `project-v11-spec-compliance-gaps` 亦记 V1.1 三门禁当前 FAIL）。V1.2 不得以其为基线，需先由该会话或单独授权重跑 `tools/verify/v11-examples-verify.cjs` 全量取证 |
| `npm run build` / `build:min` | 见 §5.1 |
| bundle 预算基线 | 见 `docs/v12-bundle-budget.md` |

### 5.1 构建产物处理说明（共享工作树）

G0 重建前，`build/cocosair.module.{js,min.js,d.ts,js.map,min.js.map}` 是并行会话 22:54/21:17 的未提交改动。已先整体备份到仓库外 scratch：
`E:/AIProMax/github/cocosair-v12-scratch/build-backup-20260922-0017/`，随后按计划书 §2.2 要求重建。旧产物 sha256 记入构建日志备份区。

### 5.2 r26 门禁现读（批次 E 落地后，2026-09-22）

> ⚠️ 本表与 §6.1 的 r27 表均为**轮次快照**（`rows=1233 … manifest=1196` 已过期）。当期门禁现读在 **§7.5**。

| 门禁 | 命令 | r26 实测 |
|---|---|---|
| 类型核对 | `npm run typecheck` | **PASS**（exit 0）；gfx-webgpu 子图按 Deviation-04 移出，豁免范围由 smoke-30 三条断言锁定 |
| 簿记一致性 | `npm run verify:file-map` | **PASS** — `rows=1233 modified=28 scanned=1186 manifest=1196` |
| 差集分类 | `node tools/compare/baseline-compare.cjs` | 上游 1299 / Air 1159 / 共同 1121 / 差集 178（排 jsb 124）/ 漂移 6 全语义 / Air 独有 38；`residualCounts` = 82 平台 + 82 排期内 + 14 需决策 |
| V1.2 组门禁 | `npx jest test/smoke/smoke-30-v12-regression.test.ts` | **28/28 PASS** |
| 默认产物稳定性（护栏 7） | `npm run build && npm run build:min` 后 `sha256sum -c` | **逐字节不变** — dev `6,081,668 B` / `35496aebda066ab5…`，min `3,499,182 B` / `8795c8685ace28a1…` |
| 批次 E 变体构建 | 见 `docs/evidence/v12/d10/README.md` | **BLOCKED**（`exit=1`，`Could not load external:emscripten/webgpu/glslang.js`） |
| 全量 `npm test` | `npm test` | 仍含既有红灯 `smoke-29`（V1.1 证据链 `completed!==true`，见 §5；与 V1.2 无关，待任务 #6 重建证据） |

## 6. r27 增量（2026-09-22，LV12-02 落地 + 三浏览器矩阵 + 许可审计 + H 组根因）

### 6.1 门禁现读（替代 §5.2 的 r26 口径）

| 门禁 | 命令 | r27 实测 |
|---|---|---|
| 类型核对 | `npm run typecheck` | **PASS**（exit 0） |
| V1.2 组门禁 | `npx jest test/smoke/smoke-30-v12-regression.test.ts` | **34/34 PASS**（新增 5 条矩阵证据字节货币断言，反向控制 5/5 生效） |
| 全量测试 | `node tools/verify/test-inventory.cjs --update` | **PASS — 30 suites / 244 tests / 244 passed / 0 failed**（§5 的既有红灯 smoke-29 已由真实重采证据消除：40/40 + 5/5 全浏览器轮次，`completed:true` 由脚本盖章而非手写） |
| 簿记一致性 | `npm run verify:file-map` | **PASS** — `rows=1233 modified=28 scanned=1186 manifest=1196`；新增断言：`extraction-manifest` 与 `web-dependency-graph` 的 `meta.baseline` 必须与 file-map 同源（此前两份生成物挂着 alpha.33 陈旧标签，已同步为 alpha.34/`557b06f7e6`/冻结 `fffd9a514a`） |
| 许可审计 | `npm run verify:licenses` | **0 FAIL / 2 ATTENTION**（10 项登记；反向控制 3/3 生效：改文本、撤 `files[]`、删处置登记均 FAIL） |
| 解码器 / web-only | `npm run verify:decoders` / `verify:web-only` | **PASS**（`reachable: 1024 files`；注意其打印的 baseline 文案仍是 alpha.33 字面量，属工具内文案，非产物事实） |
| benchmark 护栏 | `npm run verify:benchmark` | **PASS** — `{"ok":true,"checks":8}` |
| 三浏览器矩阵 | `npm run verify:v12-matrix` | **PASS** — `docs/evidence/v12/browser-matrix.json` `3/3 completed=true`（chromium/firefox/webkit，绑定 bundle `35496aebda066ab5` 与契约指纹 `a1247b6b124423b0`） |

### 6.2 LV12-02 profiler overlay：PASS（唯一走完 V1.1 规格链 + V1.2 三引擎矩阵的示例）

`examples/profiler-overlay`（Code First）已由 V1.1 规格门禁晋升 **stable**：`verified 21 / attested 2 / units 23`，
promotion 三元组 `spec 66d6546c7a37 / source afc5dc805c737985 / candidate 9fa85f88b968d5f1`；
三引擎截图在 `docs/evidence/v12/profiler-overlay/`（r46：早期游离捕获改名并入本目录）。取证要点：面板状态断言必须写在页面加载路径内，
放到 `window.__probe` 里不会被 API trace 观察窗计入（`Profiler` / `isShowingStats` 会退化为 unproven）。

### 6.3 H 组（post-process / LV12-17）根因：不是示例问题，是 Air 的默认管线选择

实测链（同一场景 OFF↔ON，480×360，HUD 掩蔽后 chromium 截图逐字节比较）：
`diffPixels=0`、`meanAbsChannelDiff=0`；补 `camera.allowHDR = true` 后重测仍 `diffPixels=0`（掩蔽后）。
即 **`PostProcess`/`Bloom`/`ColorGrading` 组件与 `scene.globals.postSettings.toneMappingType` 全部 API 层往返成功，
但默认产物里没有任何阶段消费它们**。代码级根因（三处独立闸门，全部可复核）：

1. `src/exports/custom-pipeline.ts`（内容即 `legacyCC.rendering = rendering`）**已抽取但无人 import** →
   默认 bundle 内 `cclegacy.rendering` 从未被赋值（bundle 里只有 `mesh-renderer.ts` / `effect-asset.ts` 的消费点）。
2. `src/cocos/game/game.ts:789-805`：只有当 setting `RENDERING.customPipeline` 为真才保留 `cclegacy.rendering`，
   否则**显式** `cclegacy.rendering = undefined`。Air 无远程 settings.json：`src/air/bootstrap.ts:85`
   注明「V0.1: 无远程 settings.json；默认走 legacy 渲染管线」，`settingsPath: ''`。
3. `src/cocos/game/director.ts:831-843`：还需 `macro.CUSTOM_PIPELINE_NAME !== ''` 且 `root.usesCustomPipeline`
   （`CUSTOM_PIPELINE_NAME` 由 game.ts:798-801 仅在 usesCustomPipeline 分支里补 `'Builtin'`）。

结论：新渲染管线（承载后处理阶段的 `cocos/rendering/custom` + `post-process`）在 Air 当前发行姿态下不可达；
legacy `ForwardPipeline` 无消费 `PostProcess.settings` 的阶段，legacy `DeferredPipeline` 可装但 `GbufferStage`
未初始化即全黑（实测 meanLuma 0）。因此 LV12-17 判 **BLOCKED（D11）**，不是「示例没写好」。
候选处置（须所有者决定，见 `docs/v12-owner-decisions.md` 第 6 行 **D11**）：为 Air 增加 opt-in 的 `pipeline: 'custom'` 启动项（含 `exports/custom-pipeline.ts`
接线 + 该路径下的 V1.1 全量回归重跑）/ 维持 legacy 并把 H 组按「不达」记账（与计划书「16 组全部回归」冲突）/ 放弃。

### 6.4 本轮取证中沉淀的事实（影响后续示例写法）

- `builtinResMgr.get('default-spriteframe')` 在 2D 路径上不可用：每帧 `texSubImage2D` 重载解析失败。
  可用替身：运行期 `canvas → ImageAsset → Texture2D → SpriteFrame`（动态合图会收）。
- `postProcess.FXAA` 未出现在命名空间导出表里，需 `js.getClassByName('cc.FXAA')` 取类。
- `Slider` 无公开 `bar` 属性（只有 handle）；`Toggle` 无公开 `toggle()`，用 `isChecked` setter（组互斥正确）。
- `Sprite.sizeMode = CUSTOM` 必须在赋 `spriteFrame` **之前**设置，否则节点被贴图尺寸覆盖。
- WebKit 的 `video.canPlayType('video/webm; codecs="vp8"')` 返回 `"probably"` 却永不解码（MP4/H.264 可用）
  → 视频示例必须以真实解码探测选格式，不能信 `canPlayType`。
- Chromium 软件渲染需要 `--use-gl=angle --enable-unsafe-swiftshader --disable-gpu-sandbox`；
  `[Physics] PhysicsSystem initDefaultMaterial() Failed to load builtinMaterial.` 在 40/40 V1.1 示例上均出现，
  已作为 benign 白名单进入矩阵工具（其余 console error 一律 FAIL）。
- WebGL 画布不是 preserveDrawingBuffer：页内 `drawImage(canvas)` 自采会得假零差，
  出图证据必须走浏览器级截图（本轮两次踩到，第二次由反向控制暴露）。

### 6.5 LV12-09 ui-components：PASS（第二个走完两条门禁链的示例）+ 取证工具链的一处真缺陷

`examples/ui-components`（Code First，零第三方资产）：V1.1 规格链晋升 **stable**，
`verified 36 / attested 1 / units 37`（唯一 attested 是 `view`：数据型单例不可插桩，如实记 not-instrumentable）。
三浏览器矩阵（`tools/v12/browser-matrix-contract.json` → `docs/evidence/v12/browser-matrix.json`）
**chromium / firefox / webkit 全 PASS，completed=true**，41 条断言（`probeEquals` 35 + `probeNonEmpty` 3 + `probePresent` 3）逐引擎成立：
`view.setDesignResolutionSize(EXACT_FIT)` 后 Canvas 480×360 = 视口、`uiCameraFound` 且 `cameraVisibilityHasUI3D`、
矩阵按契约里的 `(110,68)` 发**一次真实鼠标点击**后 `button.realClicks=1`、`labelBefore 'Press me' → labelAfterLive 'Clicked x1'`、
`clickTargets.button` 由页面实测回读且必须仍等于契约坐标（布局漂移即红）、
`toggle.exclusive {a:false,b:true,allowSwitchOff:false}` + 2 条 toggle 事件、`slider 0.2→0.75` 且 handle 位移到 42.5、
VERTICAL/GRID Layout 子节点位置非零、`scrollToBottom` 后 offset y 0→270、`EditBox` focus 后 DOM TEXTAREA 输入回写 `string='air'`。
截图正典路径是 `docs/evidence/v12/<example-id>/matrix-<engine>.png`（由 sha256_16 绑定在证据里）；
该更早一份手工捕获原存于 `LV12-02-profiler-overlay/`，r46 已按 #13(b) 改名并入 `profiler-overlay/early-manual-capture-chromium.png`。

晋级过程中暴露并修掉一处**取证工具链缺陷（F-87，非引擎缺陷）**：
逐 API 插桩把被 claim 的类导出成 Proxy，而引擎 `Node._findComponent` 对 `@sealed` 类走
`comp.constructor === ctor` 身份比较 ⇒ 插桩页里 `getComponent(Layout)` 假报 null、
`getComponents(UITransform)` 少报一个（真页面 1 / 插桩页 0），示例因此在 `getComponent(Layout).type=…` 抛错，
门禁侧只剩「`window.__airApp` 未设置」这种被掩盖的假因。修法是在 `wrapExport` 的 get 陷阱里对 `_sealed` 返回 false
（Proxy 转发 prototype，`instanceof` 分支与原类同结果），诊断对照与 selftest 见
`docs/audits/global-quality-audit-2026-09-19/raw/gates/r28-f87-api-trace-identity.txt`。
这条不修就会让 V1.2 的 UI / 2D / physics 组全部要么假红要么被迫改写示例绕开门禁——V1.1 的 45 例都是 3D 写法、
从不在示例里 `getComponent(被 claim 类)`，所以缺陷一直休眠。

另一处只登记不擅动（F-88）：`tools/examples/api-inventory.cjs` 不识别**别名导出**（`MaskComponent as Mask` 等整张表）、
**`export enum`**（`MaskType`）与**访问器属性**（`Sprite.spriteFrame` / `Layout.type` / `EditBox.string` …）。
后果：本示例真实用到 `Mask`、`MaskType`、`visibleRect`，但它们不是 inventory 单元，按 §3「逐字绑定」不能 claim，
只能由 V1.2 矩阵断言取证，coverage 分母也看不到这些单元。扩生成器会同时移动 `coverageRequired` 分母（2589），
属所有者决策（与 F-80 的分母纪律同源），本会话未改。

### 6.6 LV12-09 ui-layout：PASS（响应式 reflow 用真实视口变化取证）+ 矩阵新增 resize 步骤

`examples/ui-layout`（计划书点名的第二个 LV12-09 示例，Code First、零第三方资产）：
V1.1 规格链晋升 **stable**，`verified 22 / attested 1 / units 23`（attested 仍是数据型单例 `view`）。
`validationExpectations["transform-equals"]` 逐节点写死静置 480×360 下的引擎局部变换，9 个节点全部带出处行
（`Canvas(240,180)`、`UICamera(0,0,1000)`、`TopBar(0,160)`、`BadgeL(-200,-158)`、`BadgeR(200,-158)`、
`Row(0,20)`、`Cell0(165,0)/Cell1(65,0)/Cell2(-35,0)`）——即 Widget 三边/贴角对齐与 RTL Layout 排布的结果
由门禁比对声明值，而不是示例自报。本示例在 V1.1 链上 `validation.interaction` 与 `interaction.steps` **同时为空**：
页面没有输入处理，真实交互是矩阵的视口变化，两条链的断言不混用。

三浏览器矩阵 39 条断言（`probeEquals` 35 + `probeNonEmpty` 2 + `probePresent` 2）三引擎全 PASS、`completed=true`。
为自适应类示例给 `tools/v12/browser-matrix.cjs` 加了 **`resize="WxH"` 步骤**（此前只有固定 480×360 + 可选 click）：
先取一次 `__probe()` 与截图，再 `setViewportSize(320×240)` → `window resize` → 引擎 `screenAdapter` →
`view 'design-resolution-changed'` → `widgetManager` 重排 → 再取 probe，把前置结果挂成 `probe.before`，
于是普通 `probeEquals` 就能同时断言两套几何。实测 reflow（三引擎逐字段一致）：
canvas 480×360→320×240、顶栏宽 480→320（y 340→220）、右下徽章 x 440→280 而左下徽章仍 (40,22)、
Row 宽 420→260（左右各留 30 生效）、单元 x 405/305/205→245/145/45。顶栏标题由页面自己的
`LayoutReadout extends Component.update()` 每帧写着当前视口（`TOP BAR 480x360` → `TOP BAR 320x240`），
自适应是页面的持续行为，不等探针触发。

取证限制登记（F-89，非引擎缺陷）：Playwright **webkit-2361 在真实改变视口后不再把 WebGL 画布合成进截图**
——1155B 纯白且此后冻结，而同一时刻 `inner/css/backing` 都是 320×240、`contextLost=false`、
`__probe()` 几何与另两引擎逐字段一致；控制组（不 resize）webkit 正常出图，换 `profiler-overlay`
（逐帧动画）同样在 resize 后两张截图 sha 相同，nudge 视口 / CSS 强制重排 / 补发 `resize` 事件均不能恢复。
处置只收紧不放宽：resize 步骤额外入库 `matrix-<engine>-before.png` 并新增 `beforePngBytesAboveFloor`
（三引擎 resize 前都要过 3500B，webkit 实测 8276B），字节下界支持 `minPngBytesByEngine` 按引擎覆盖，
且豁免理由以 `pngFloorNotes.webkit` 写进契约、逐记录带 `pngFloors/pngBeforeBytes/pngBeforeSha256_16`。
对照与命令见 `raw/gates/r29-f89-webkit-resize-blank.txt`。

示例总数门禁随之前进：`test/smoke/smoke-29-examples-spec.test.ts` 的 `EXAMPLE_COUNT` 47→48（新增示例必须显式改这里）。

### 6.7 r29 门禁现读（替代 §6.1 的 r27 口径）+ 本轮两处真实回归与一次自造假红

| 门禁 | 命令 | r29 实测 |
|---|---|---|
| 类型核对 | `npm run typecheck` | **PASS**（EXIT=0，日志 `v12-logs/r29-typecheck.log`） |
| 全量测试 | `npm test` | **PASS — 30 suites / 244 tests / 244 passed / 0 failed**（EXIT=0；中途曾因 §25 缺口红过 1 条，见下） |
| 默认构建变体（护栏 7） | 先 `sha256sum` 快照 → `npm run build && npm run build:min` → `sha256sum -c` | **逐字节不变** — dev `6,081,668 B`/`35496aebda066ab5`、min `3,499,182 B`/`8795c8685ace28a1`、`cocosair.module.d.ts` `6d01c030d85bf86c` 三份全 OK。顺带证明当前 `src/` 与交付字节同源（`src/cc.config.json`、`src/tsconfig.json` 的 mtime 比旧产物新，重建后哈希不变即闭环） |
| V1.1 示例全量取证 | `NODE_PATH=… node tools/verify/v11-examples-verify.cjs` | **PASS — 43/43、`completed=true partial=false`**，`verified 748 / attested 18 / unproven 0`，`candidate 9fa85f88b968d5f1` |
| 规格合规 | `node tools/examples/spec-compliance-audit.cjs` | **0 fail / 1 warn**（唯一 warn 是 gltf-draco 的合法「解码器不可用不伪造 Lifecycle」） |
| 规格完整性 | `node tools/examples/spec-validate.cjs` | **48 frozen / 0 draft / 0 blocked**，0 issues |
| 三引擎矩阵 | `NODE_PATH=… node tools/v12/browser-matrix.cjs` | **9/9 PASS，`completed=true`**（profiler-overlay + ui-components + ui-layout × chromium/firefox/webkit） |
| web-only 边界 | `npm run verify:web-only` | **PASSED** — `reachable: 1024 files`，`*.jsb.ts` 零进入 |
| benchmark 护栏 | `npm run verify:benchmark` | **PASS** — `{"ok":true,"checks":8}` |
| 簿记一致性 | `npm run verify:file-map` | **PASS** — `rows=1233 modified=28 scanned=1186 manifest=1196` |
| 测试清单 | `node tools/verify/test-inventory.cjs --update` | **PASS** — `failures: []` |

**纠正一处口径（影响 §12 复跑判据）**：全量 V1.1 verify 的真实总数是 **43**，不是 48。
runner 从 `examples/files.json` 枚举后再按 `!requiresDevTools` 与「存在 `index.html`」过滤
（`tools/verify/v11-examples-verify.cjs:66-70`），`automation` 与 4 个 `rc-*`（DevTools 工具页）本就不属于浏览器示例门禁。
`EXAMPLE_COUNT=48` 数的是 `example.json` 文件数——两个口径不同源。因此 findings 台账里 F-87 的 retest 文本
「47/47」与 F-89 里写的「48/48」自本轮起都应读作 **43/43**（台账按 append-only 纪律不回改既发行，纠正以此处为准）。

**一次自造假红（登记为自己的操作事故，非引擎/门禁缺陷）**：漏带 `NODE_PATH` 跑全量 verify ⇒
43/43 FAIL（`Cannot find module 'playwright'`，Playwright 装在仓库外）且 runner 的合并语义把
42 例 `promotion` 判为 demoted，直接覆盖了上一份 PASS 证据。被污染的那份已快照到
`E:/AIProMax/cocosair-scratch/v12-logs/evidence-polluted-r29b-noreplaywright.json`（sha256_16 `c5da4b49770b7061`）留证，
重跑后 43/43 PASS、42 promoted 自愈。教训两条：全量取证必须一条命令就带齐环境；
`completed:true` 的门禁文件会被下一次运行覆盖，任何 FAIL 运行同样是「一次捕获」。

**本轮两处真实回归（都在门禁侧被发现，不是靠人眼）**：

1. `smoke-29` §25 Lifecycle：`ui-components` / `ui-layout` 因为 claim 了 `Texture2D`/`ImageAsset`，
   被 `spec-compliance-audit.cjs:166-179` 判为资源示例，而 `validation.lifecycle` 为空 ⇒ 2 FAIL ⇒ jest 红。
   处置不是放宽门禁，而是补上合同：两例把运行期真实创建的 `SpriteFrame/Texture2D/ImageAsset` 交给
   `installAssetLifecycle`，释放先把组件引用断开再销毁本体，重新获取复用与首帧同一条 `assignFrame` 路径
   （于是「拆得掉」与「建得回、画面复原」由同一份实现承担）。实测：`ui-components held=36 leaked=0 reloaded=true litRatio=0.9999`、
   `ui-layout held=18 leaked=0 reloaded=true litRatio=1.0000`，两条 `resource-released` 均 PASS。
2. 改示例源码会连带触发 §11 陈旧证据守卫（`S11-STALE-EVIDENCE`：证据 `specFingerprint` ≠ 当前 `example.json`）
   与 §12 行号绑定（`api.evidence.sourceLocation`、`validationExpectations[].provenance[].line` 一起漂移）。
   本轮用「以工具自身判定为 oracle」的自校正脚本回填（只按 `spec-validate` 报出的真实行号改写，不另立规则），
   收敛后 48 例 0 issues；随后必须重采全量证据。这是 V1.2 后续每个示例的固定成本，不是可选步骤。

**给 LV12-13 示例的既成事实（避免写出假断言）**：
> **r30 自我纠正**：本条在 r29 写作「默认 builtin 后端下 `PhysicsSystem2D.instance.raycast()` 是空实现
> （`builtin-world.ts:285` 恒返回 `[]`），2D raycast 命中只能等 box2d 后端」。**该前提为假**，是只读代码不实测的结果。
> 实测（`E:/AIProMax/cocosair-scratch/v12-logs/diag-p2d.json`、`measure-p2d-d.json`）：默认发行产物里
> `PhysicsSystem2D.PHYSICS_BOX2D === true`、`PHYSICS_BUILTIN === false`、`physicsWorld` 实际类型 `b2PhysicsWorld`、
> `ptm_ratio 32`、重力 `(0,-320)`——因为 `src/exports/air.ts` 按决策 D7 接的是 `./physics-2d-box2d`（@cocos/box2d 纯 JS 端口），
> builtin 那套空实现根本不在默认 bundle 的选择结果里。三类查询（`testPoint`/`testAABB`/`raycast`）在默认产物里全部真实命中。

r30 实测得到的、写示例前必须知道的三条既成事实：

1. `BoxCollider2D` 尺寸默认 **1×1**（`box-collider-2d.ts:38 private _size = new Size(1, 1)`），**不跟随** `UITransform.contentSize`。
   漏设时地面只有 1×1，动态体穿过它坠到 y≈-2170（第一次采集就踩到）。`CircleCollider2D.radius` / `PolygonCollider2D.points` 无此坑。
2. 「不模拟」要用**逐刚体 `gravityScale = 0`** 做到，不能用 `autoSimulation = false`：后者在
   `framework/physics-system.ts:274-284` 的 `postUpdate()` 里提前 return，把 `syncSceneToPhysics()` 一起关掉——
   实测改节点变换 + `Collider2D.apply()` 后 `step()` 一次，形状被拉回旧位置，三类查询永远命中旧位置。
3. 变换同步有两拍：`apply()` 同帧内 `worldPoints`（由变换直接算）已是新值，而 `worldAABB` 与三类查询走碰撞树代理仍是旧值；
   下一次 `postUpdate()` 按 `node.hasChangedFlags` 调 `SetTransformVec` 后代理才同步。示例把这三态（before/applyOnly/after）全部读回，
   由三引擎矩阵逐值断言——chromium/firefox/webkit 上同一组数值全部一致（含 `crateMass=2.7`、`raycastAll="Ball,Crate,Gem"`）。

同时 F-88 再次命中：`RigidBody2D.type`、`BoxCollider2D.size`、`CircleCollider2D.radius`、`Collider2D.density`、
`PhysicsSystem2D.enable/gravity/autoSimulation` 以及 `ERigidBody2DType/ERaycast2DType` 等枚举都不是 inventory 单元
（原型访问器与枚举未被 `tools/examples/api-inventory.cjs` 识别），无法 claim，只能由三引擎矩阵断言取证。
示例可用的 claim 面（`PhysicsSystem2D[.testPoint/.testAABB/.raycast]`、`RigidBody2D.getMass`、
`Collider2D[.apply/.TYPE]`、三种碰撞体、`PHYSICS_2D_PTM_RATIO`、`math.Vec2/Size/Rect`）已全部核过确实存在于 `docs/example-api-inventory.json`。

### 6.8 r31 LV12-13 physics-2d-collision：PASS（接触事件 / sensor / 过滤，全部数值断言）

命令与产物（本轮现读，不是引用）：

```
node E:/AIProMax/cocosair-scratch/v12-logs/measure-p2d-collision.cjs chromium,firefox,webkit probe-p2d-collision.json
  → allIdentical=true（三引擎 __probe() 输出逐字节相同）
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/v12/browser-matrix.cjs
  → 15/15 PASS across 3 engines（completed=true，契约指纹 4 例时期 d7ed2da932c779b0 → 5 例时期 c2ebc4af2edc7e05）
  → docs/evidence/v12/browser-matrix.json + docs/evidence/v12/physics-2d-collision/matrix-{chromium,firefox,webkit}.png
    （10883 / 12760 / 11885 B，sha256_16 3774bf5e15c6b567 / a2bb552cfbab1b92 / 1d90c0d418f4b1fe）
```

** enabling 事实：手工定步驱动可以跨引擎逐字节复现。** `autoSimulation = false` +
`world.syncSceneToPhysics() → N × physics.step(fixedTimeStep) → world.syncPhysicsToScene()` 之后，
物理结果只由 step 次数决定；490 步 9 阶段的全部读回在 chromium/firefox/webkit 上**完全相同**
（含 `post-solve` 的 `normalImpulses=[299.93,300.11]` 这种 6 位有效数字）。因此本组不再用「bool 有没有回调」弱断言，
而是把 step 序号、manifold 点坐标、冲量、落定高度全部写进契约做精确断言。

r31 实测出的引擎语义（每条都有 `probe-p2d-collision.json` 里的数值支撑）：

1. **sensor 只发事件不求解**：`begin-contact@54` / `end-contact@69` 正常送达，但 `getWorldManifold()` 的
   `points`、`separations` 长度为 0、`normal=[0,0]`、`getManifold().type=-1`、`getImpulse()=null`；
   Box 直穿 y∈[-54,-18] 的 sensor 带，继续落到地面（`boxBeginStep=72`）。
2. **实体接触四事件在同一 step 发生**：Box↔Ground 的 begin/pre/post 都是 step 72，`manifold.type=1`、`normal=[0,1]`；
   `getImpulse()` **只在 POST_SOLVE 内非空**（begin 时 `impulse-null`，post 时 `[299.93,300.11]`、tangent `[-0.01,0]`）。
   静止接触不再产生 END（`boxEndStep=-1`），restitution 0.6 的球在 step 73 拿到 end 后重新起跳。
3. **摩擦/弹性合成规则**：`getFriction()` = 几何平均 `sqrt(0.3×0.2)=0.2449`，`getRestitution()` = 较大者 `max(0.6,0)=0.6`。
4. **接触回调按侧独立门控，且发生在 emit 时**：同一 Ground↔Mute 接触，`enabledContactListener=true` 的 Ground 侧
   `begin` 计数 1，false 的 Mute 侧计数 **0**；落地后再打开 Mute 的 listener，同一接触的
   `pre-solve`/`post-solve` 从 step 91 起各 13 次立刻送达，而那次 `begin` 永远补不回来。
5. **过滤位只在创建 fixture 时读一次，且 box2d 判定双向**：默认 `collisionMatrix` 只有 `1→1`；group=2 的 P 穿地
   （`-234`）。只设 `matrix[2]=1`（地面侧不含 2）后**轨迹与默认矩阵逐字节相同**（也 -234、接触 0）⇒ 单向不成立。
   补 `matrix[1]=3` 并 `apply()` 后 P 才落到 `-104.23`。反向同样成立：事后把 matrix 全清回默认但**不** `apply()`
   → P/Q 仍被地面托在 `-104.23`；这时才 `apply()` → 同一段驱动内立刻穿地（`-145.57` → 终态 `-266.9`）。
   这条「不 apply 就不生效」是直接由位置数值证明的，不再依赖观察者推断。
6. `PhysicsGroup` 只有 `DEFAULT=1`（group 2/4 是自定义位），`categoryBits` 取 `collider.group === DEFAULT ? body.group : collider.group`。

一次自造假红的纠正（写下来防复发）：第一版 tally key 用了**排序后的对称键** `type|A|B`，于是同一接触的两侧
各自计入同一个桶——`begin-contact|Ground|Mute count=1` 实际全是 Ground 侧收到的，被误读成「Mute 也收到了」。
改成方向键 `type|接收方<->对侧` 后才看见真实的逐侧差异。凡是「谁收到了回调」类断言，key 必须带接收方。

断言口径的一处诚实降级与理由：矩阵条目 `frameChanged` 取 **false**（其余 4 例取 true）。
`autoSimulation=false` 时点击前的场景确实一帧不变，双帧采样看不到运动；运动由
`before.Box.1=130 → summary.boxRestY=-99.23` 这类点击前后位置对读来证。另 `contact.getManifold()` 的
`type` 在 sensor 上为 `-1`（cocos 侧未初始化默认值），不是枚举 0，别按 `0` 断言。

F-88 续账：`Contact2DType`、`PhysicsGroup` 是 inventory 单元（`constant/advanced`）可以 claim；
`PhysicsContact`、`PhysicsContact.getWorldManifold/getImpulse/isTouching`、`Collider2D.group/sensor/density/friction/restitution/size/radius`、
`RigidBody2D.type/gravityScale/linearVelocity`、`ERigidBody2DType` 都**不是**单元 ⇒ 只能由契约断言取证，不进 claims。
本例 33 条 claims 已逐条核过存在于 `docs/example-api-inventory.json`。

### 6.9 r31b 门禁抓到的一处真实缺口：点击门控序列必须写进 Spec，否则门禁根本不点击

§6.8 的首轮 `v11-examples-verify` 给出 `FAIL physics-2d-collision {api-executed}`（其余 44 例 PASS）：
`instrumentation.observed = 24/33`，三条 `not-observed` 为 `PhysicsSystem2D.step`、`Collider2D.apply`、`math.Vec2`。
证据：`E:/AIProMax/cocosair-scratch/v12-logs/r31-v11-verify.log:73`、当期 `docs/evidence/v11-examples-verified.json` 的该条目。

根因不在示例代码，而在**规格没有把交互交给门禁**：本例的全部物理驱动挂在 `TOUCH_START` 一次性回调里，
而首版 `example.json` 写的是 `"interaction": {"steps": []}` + `"validation": {"interaction": []}`。
`v11-examples-verify.cjs` 只在 `interaction.steps.length > 0` 时才向 `#GameCanvas` 发真实鼠标点击
（`runInteractionChecks` 的预热点击 + 逐步骤点击），因此那三条 API 在整轮验证里**一次都没执行过**。
`physics-2d-basic` 同样有点击分支却过了 `api-executed`：它的 `Collider2D.apply`（4 次）与 `math.Vec2`（1856 次）
是引擎自身在自动模拟帧里打到被桩原型/别名上的计数，属 mechanism=`prototype`/`alias:Vec2` 的内部计数；
本例关掉自动模拟 ⇒ 内部计数归零 ⇒ 缺口立刻暴露。这正是 `api-executed` 设计要防的反面（示例级 PASS 替未执行 API 顶包）
被反向用成"示例没被驱动 ⇒ claim 不成立"，判定方向是对的。

修法（不改断言、不放水）：`example.json` 声明 1 条交互步骤 + `validation.interaction: ["frame-diff"]`，
让门禁真的点击、真的取两帧。重跑 `v11-examples-verify`（`r31b` 日志）⇒ `45/45 PASS`、
`observed = 27/33`、`apiProof` 为 `27 verified / 6 attested / 0 unproven`，`promotion` 块写盘、`status: stable`。
剩余 6 条全部是 `attested`（`not-instrumentable`/`unresolved` 且证据行绑定 PASS 的 validator），不计 verified 也不冒充。

顺带两条可复用的门禁顺序/口径事实（本轮实测）：
1. 矩阵的 `frameChanged` 与 verify 的 `frame-diff` **不是同一件事**：`tools/v12/browser-matrix.cjs` 的
   `shotA`/`shotB` 两张都在点击**之后**取（间隔 500 ms），它量的是"交互后画面是否持续运动"；
   verify 的 `frame-diff` 比的是交互前/交互后两帧。点击门控的一次性序列只能满足后者 ⇒ §6.8 的
   `frameChanged:false` 不是放松视觉证据，而是把运动证据交给 `frame-diff` + `before.* → summary.*` 位置对读。
2. `specStatus` 参与 `specFingerprint`（`SELF_WRITTEN_SPEC_FIELDS` 只豁免 `promotion/promotionEvidence/stableReview/status`）
   ⇒ 必须先 `specStatus: frozen` 再跑 verify，顺序颠倒会撞上 `S11-STALE-EVIDENCE`
   （实测：证据 `747c3f3295be` ≠ 当前 `4ee47e258bda`）。







### 6.10 r35 LV12-08 tiledmap：PASS（明细另成文 `docs/v12-tiledmap-notes.md`）

不复述逐组细节（§1 逐字节、§4 三条出图通路、§6 门禁、§6.1 负控、§7 未覆盖面在 `docs/v12-tiledmap-notes.md`），
只沉淀三条影响后续示例写法的口径事实：

1. **Code First 无 Creator 管线时 `TiledMapAsset` 必须手搭**，且五个查表键是**逐字字符串**（`tsxFileNames`
   要写 `tiles.tsx`、`spriteFrameNames` 要写 `tiles.png`）。键名对不上 ⇒ `sourceImage` 为 null ⇒
   只 `warnID(16406)` 一次、顶点数 0，黑屏无堆栈（笔记 §2）。
2. **运行时改格不是"改了就该看见"**：空格写入只置 `_cullingDirty`（`tiled-layer.ts:730`），需 `node.active`
   往返才重建，且重建**推迟到下一渲染帧**（点击回调内同帧读 = 0，1500 ms 后读 = 96）；
   `enableCulling=false` 时连**已占用**格的 `setTileGIDAt` 都不改像素——`_updateVertex` 只维护剔除账本，
   而 `_cullingDirty` 只在 `_updateCullingOffsets()`（`tiled-layer.ts:865`，仅 culling 开启才跑）里被消费。
   已登记 **F-99**（`docs/audits/global-quality-audit-2026-09-19/findings.jsonl:99`，blocking false）。
3. **想取证"画面每帧真的在换"，示例侧唯一活通路是 TSX `<animation>`**：`TiledMap.lateUpdate`（`tiled-map.ts:636-660`）
   把 `_texGrids[gid]` 就地改写成当前帧 UV，`assembler/simple.ts:119` 的脏判定含 `hasAnimation()` 而与 culling 无关。
   取证陷阱：`_texGrids.get(1)` 自身就是被改写的那个对象，**比两个 `_texGrids` 项证明"帧不同"必然假阴性**
   ⇒ 只能比 `animation.frames[i].grid`（实测 `matrix-debug-tiledmap-chromium-r3.json` FAIL、r4/r5 PASS）。

### 6.11 r36 LV12-03 audio：PASS（明细另成文 `docs/v12-audio-notes.md`）

`examples/audio-basic` 是第三个同时走完 V1.1 规格链与 V1.2 三引擎矩阵的示例
（矩阵 24/24 PASS、`contractFingerprint 812863c5dd1a827a`；V1.1 `stable`、`promotion verified 26 + attested 2 = units 28`）。
逐字节面：`docs/upstream-file-map.json` 里 17 条含 `audio` 的行**全部**与上游同字节（`cocos4` + `@cocos/engine-pal@1.0.4`），本组零修改。
只沉淀三条影响后续示例写法的口径事实：

1. **同一份代码在 webkit 走的是语义不同的另一条实现分支，且全程零报错**：Windows Playwright `webkit-2361` 根本没有
   Web Audio API（四个 ctor 全 `undefined`，与 secure context 无关）⇒ 引擎落 `AudioPlayerDOM`，于是
   `type` 由 `WEB_AUDIO(1)` 变 `0`、`getPCMData()` 返回 `undefined`、`getSampleRate()` **永不 settle**。
   示例侧必须有界兜底（`Promise.race` + 能力判别 `typeof view.getData === 'function'`，
   ⚠️ 用 `view.length` 会把错误字符串判成成功——字符串也有 length），否则整条点击序列静默挂死。登记 **F-100**。
2. **`<audio>` 会把 duration 按采样率读错**（同一支 1.600 s 正弦：22050→0.3705 / 44100→0.1853 / 48000→0.1702 /
   float32→超时，只有 **8000→1.6000** 对），且 `loadNative` 只认 `canplaythrough` ⇒ headless webkit 每次加载固定吃
   8000 ms 兜底。**音频示例的资产要按最差的 DOM 分支来定**（本例 PCM16/8000 Hz/mono，由
   `tools/fixtures/make-tone-wav.cjs` 手写 RIFF 生成），矩阵 `waitMs` 要 ≥ 12000。登记 **F-101**。
3. **「释放」是有缓存语义的动作，不是 `destroy()` 一行**：`loadRemote` 以 **URL 为键**缓存在 `assetManager.assets`
   （命中即原样回缓存，`asset-manager.ts:654`），而 `release-manager._free:235` 对已失效对象直接 `return`
   ⇒ 只 `destroy()` 会留下指向已销毁实例的缓存条目，二次加载静默拿到它、只留一条 `Invalid audio clip`。
   本例 §25 合同因此先 FAIL 后转绿（改走 `assetManager.releaseAsset`）。这是**门禁替我抓到的真实用法缺陷**，
   不是断言过严：登记 **F-102**。附带一条取证口径——DOM 分支的 `ensurePlaying()` 在 `play()` 被拒时
   照样 resolve ⇒ facade `PLAYING(1)` 而元素 `paused=true`，所以「`playing === true`」不能当证据，
   帧间变化必须由与音频无关的帧时钟产生。

### 6.12 r37 LV12-04 video：PASS（明细另成文 `docs/v12-video-notes.md`）

`examples/video-basic` 是第 9 个同时走完 V1.1 规格链与 V1.2 三引擎矩阵的示例。矩阵当期
**27/27 PASS、`completed=true`**（9 examples × 3 引擎全量重跑，不是只跑新增那一格）、
`contractFingerprint 0db92dab8c9431c9`、绑定 bundle `35496aebda066ab5` / 6,081,668 B；
V1.1 链 `stable` + `specStatus frozen`，`promotion verified 24 + attested 13 = units 37`
（`spec 57c50446faab`、`source b79f1347b8c904a0`）。逐字节面：`src/cocos/video` 11 文件与 `cocos4` 同字节，本组零修改。

> **r38 更正（F-107）**：本节的「27/27 PASS」在 webkit 上只有约五成可复现率——`video-basic` 的
> `p8Loop.wrappedBelowSeekTarget` 与 loop 回绕存在竞态。根因、时间线证据与修法见
> `docs/v12-video-notes.md` §6；r38 修后的权威全量轮为 **30/30 PASS**（10 示例 × 3 引擎，含 §6.13 的
> `webview-basic`），`contractFingerprint` 因 `waitMs` 与新增行两次推动，现为 `8d259554c3759cbc`。

契约 `video-basic` 块的 **118 条 `probeEquals` 全部来自三引擎逐字节一致的探针路径**：
由 `E:/AIProMax/cocosair-scratch/v12-diag/probe-cross.cjs` 对当期 r7 全量证据算出 129 条一致路径，
再丢弃 8 条 `eventLog.<i>`（事件顺序本身不稳定）与所有 `*WithinMs` 计时叶子。
`attested` 的 13 个单位全部是**不可插桩面**（数据成员 `EventHandler.target/component/handler/customEventData`、
静态常量 `VideoPlayer.REMOTE/LOCAL`、单例对象 `screen/view/macro/assetManager`、由引擎内部调用的
`VideoPlayer.videoPlayerEvent`、经单例访问的 `Screen.requestFullScreen/exitFullScreen`）⇒
按 `tools/verify/v11-spec-common.cjs:118` 只能记 attested，不计入覆盖率 verified，与 **F-88** 同族。

沉淀四条影响后续示例写法的口径：

1. **`stayOnBottom` 的透明合成写的不是组件相机**：`syncMatrix` 改的是
   `director.root.batcher2D.getFirstRenderCamera(node)` 那个**场景相机**（实测与组件相机同名
   `UICamera` 却 `uiCameraIsComponentCamera false`），组件侧 `clearColor.w` 恒 1 ⇒ 拿它背书是错的；
   画布带 alpha 需要 `macro.ENABLE_TRANSPARENT_CANVAS = true` 在 `createAirApp` **之前**
   （swapchain 只读一次，`webgl2-swapchain.ts:127/142`）；能进契约的「压到 canvas 之下」证据是 DOM 命中
   翻转 `VIDEO → CANVAS`，不是 `z-index` 字符串。
2. **上游全屏链三段缺陷**（登记 **F-103**）：① `screen.requestFullScreen(element, cb)` 的 `element`
   被 web adapter 丢弃（`_getFullscreenTarget()` 非全屏态返回 `document.body`）⇒
   `fullscreenElement === "BODY"`，三引擎实测并已进契约；② `screen.ts:158` 用 `.call(document)`
   **零实参**调用回调，而 `video-player-impl-web.ts:215` 的签名是 `(document) => …` ⇒ 形参遮蔽全局、
   读 `.fullscreenElement` 抛 TypeError，被 `screen.ts:159-162` 的 `.catch(error)` 打成真 console error
   （仅 chromium 实测；firefox/webkit 未在该缺陷路径单独捕获，webkit 因 `canFullScreen` 要求
   `readyState===4` 而实测停在 3 会早退）；③ 错误回调置 `impl._fullScreenOnAwake=false` +
   `video-player.ts:251` 回读 + `:258` 同值早退 ⇒ 再置 false 是空操作（源码判定，端到端未复测）。
   示例因此只走两条可用路径：手势内 `await screen.requestFullScreen()/exitFullScreen()`，
   以及 `fullScreenOnAwake = true` 先于 `clip` 的「几何全屏」（实测撑满视口且 `fullscreenElement` 保持 null）。
3. **「解出帧」要在采样前确认 `isPlaying`**，并用 `drawImage` 像素统计（首版在静止态取到两帧相同 `mean`，
   差点误判解码失效）；`<video>.objectFit` 三引擎恒 `none`（引擎自己按 `visibleRect` 摆位），
   所以 `keepAspectRatio` 的开/关反而是可断言的「上游语义不生效」证据。另：把 `currentTime` 钳到超界
   **不会**触发 `completed`（三引擎一致 `completedWithinMs -1`、`endedDelta 0`），与直觉相反。
4. **别名导出仍卡 §3 逐字绑定**（F-88 追加实例）：产物里是 `Graphics as GraphicsComponent`、
   d.ts 只声明 `GraphicsComponent` ⇒ `docs/example-api-inventory.json` 没有 `Graphics` 单元，
   `spec-validate` 直接拒。示例改用 `GraphicsComponent`（+ `rect/clear/stroke/fill` 四个方法单位），
   而不是放松门禁或手改清单。

### 6.13 r38 LV12-05 web-view：PASS（明细另成文 `docs/v12-webview-notes.md`）

第 10 个走完两条门禁链的示例 `examples/webview-basic`（Code First，内嵌本地静态页，零外网依赖）：
V1.1 链 `stable` + `specStatus frozen`，`promotion` = 
verified 29 / attested 7 / units 36（`spec 529cf6946419`、`source 9d93e842f1716162`、
`candidate 9fa85f88b968d5f1`），`spec-validate --strict` = **55 examples: 55 frozen / 0 draft / 0 blocked**（exit 0、零 issue 行）、
`spec-compliance-audit` = **0 fail / 1 warn**（warn 仍是 gltf-draco 的既有明示）；
V1.2 链 = 权威全量轮 **30/30 PASS、`completed=true`、`subset=false`**、
`contractFingerprint 8d259554c3759cbc`、绑定 bundle `35496aebda066ab5` / 6,081,668 B，
截图 `docs/evidence/v12/webview-basic/matrix-<engine>.png` = 31,907 / 30,226 / 26,156 B
（sha256_16 `aa6cea0723c22309` / `5d2ff10aaec0916b` / `5980e104472806b0`）。

逐字节面现读纠正一处旧口径：`src/cocos/web-view` 是 **5 个 `.ts` + `category.json`**
（此前报告写「7 文件」有误）。对上游 `E:/AIProMax/github/cocos4/cocos/web-view` 逐文件 sha256-16 比较
⇒ 5 个全部 `SAME` ⇒ `docs/upstream-file-map.json` 本组零偏差条目。
产物导出面：`build/cocosair.module.js` 含 `WebView`/`WebViewEventType`/`WebViewImpl`/`WebViewImplManager`/`WebViewImplWeb`，
`build/cocosair.module.d.ts`（sha `6d01c030d85bf86c`，与 r37 登记同）含 `class WebView`。

计划书 A4 的四个验证要点全覆盖，且全部是数值/DOM 事实断言（契约 `webview-basic` 行 = 
`probeEquals` **108** 条 + `probeNonEmpty` **12** + `probePresent` **10**，`group LV12-05`、
`waitMs 12000`、`click 240,166`、`afterClickMs 3000`、`minPngBytes 15000`、`frameChanged true`）：

1. **挂载/卸载**：wrapper+iframe 唯一性、`parentElement.id 'Cocos3dGameContainer'`、销毁后 
`wrappersAfterDestroy 0` 且 `hitAfterDestroy 'CANVAS'`、重建后 `wrapperCountIsExactlyOne true`。
2. **事件**：`businessSequence 'loading,loaded'`、`handlerHits 2`、
`lastHandlerArgsCustom 'viaWebViewEvents'`、error 分支 `stateAfterError 'error'` + `errorArgMentions404 true` + 双层数组参数。
3. **与 UI 的事件穿透**：web 端**没有**穿透开关（`setJavascriptInterfaceScheme` 与 `setOnJSCallback`
   在 web impl 上实测返回 `'undefined'` 且零副作用：`stateUnchangedAfterNoop true`、`jsCallbackFired 0`），
   实测三计数器 `iframeClicks '1'` / `engineTouchEvents 0` / `canvasDomClicks 0` ⇒ iframe 区内的点击被页面吃掉、
   引擎收不到；`enabled=false` 只是 `visibility:hidden`，且隐藏期间 `syncMatrix` 早退
   （`transformFrozenWhileHidden true`，重新启用后下一帧才追上 `transformCaughtUpAfterEnable true`）。
4. **几何跟随**：`styleAfterWH '160px/120px'`、`centerMoved true`、以及「第一帧未定位」陷阱（笔记 §5、**F-106**）。

未证与不 claim 的面照实登记：真 404（正文不含「404」字样）不触发 `error` 尚未端到端取证 ⇒ **待核**；
`evaluateJS` 失败路径只由独立探针取证、示例不执行（**F-105** 双副作用）；native 后端与
`WebViewImpl._loaded` 死标志（**F-104** 同族）为静态证据；`WebViewOnError` 的 arg 语义按实测记录，不改逐字节源码。
本轮台账新增：**F-104**（`error` = 正文嗅探）、**F-105**（`evaluateJS` 失败双副作用）、
**F-106**（wrapper 第一帧未定位，已 CLOSED）、**F-107**（webkit `loop` × in-flight seek 竞态，
由本次全量重跑暴露，见 §6.12 更正）、**F-108**（`smoke-29` 负控用例在 Windows 上被文件占用打断，已加退避重试）。

### 6.14 r39 LV12-15 3D 物理（builtin 变体）：`examples/physics-3d-basic` PASS（明细另成文 `docs/v12-physics3d-notes.md`，14 节）

组内另一半（cannon 变体 + `examples/physics-3d-collision`）仍未交付 ⇒ **LV12-15 整组保持 in-progress**，
本节只登记 builtin 例的交付事实。取证主线：**builtin 3D 物理不是真模拟器**，用 5 条互相独立的实测钉死——
60 步后位置漂移 0；速度哨兵 (9,9,9)/(8,8,8) 从未被引擎写回；刚体属性读回只是组件记账；
`BuiltinShape.setMaterial (v) { }` 是空函数（材质在世界形状侧无通道）；
**新发现 `BuiltinShape.getBoundingSphere (v) { }` 亦空** ⇒ `Collider.boundingSphere` 恒返回
`geometry.Sphere` 构造默认值（`crateSphereCenterX 0` / `crateSphereRadius 1`），而同刻 `worldBounds`
已被 `syncSceneToPhysics()` 更新（`obbCenterAfterFirstSyncX -2.2`）⇒ **AABB 有通道、包围球没有**，记 **F-109**。

查询与生命周期面（全部数值断言，进契约）：`raycast*` 的 `distance` 以 `ray.d` 长度为**单位**、
命中法向恒 `Vec3.ZERO`、多-hit 结果按**登记序**、`segmentIndex` 恒 undefined、`sweep*` 恒 0 命中、
`options.queryTrigger` 在 builtin 分支从不被读、`MeshCollider` 永不进世界（`shapeCount 5`）、
扁平 `selector` 实际是 **2D 的**（`id box2d`、13 个包装器）；group/mask 过滤是**双向**的
（`trigEnterFiltered 0` → 两侧 `setMask(0xffffffff)` 后 1/1/1）；场景→物理是**惰性同步**
（三态 `before ≡ unsynced`、同步后 33 字段变化，`probeNonEmpty` 锁住）；
`CapsuleCollider.height` 在 `onLoad` 前设置不进世界形状（1.6 vs 1.8）。
另有 24 条框架类构造契约（`PhysicsSystem` 私有构造 `System` 单例、游离实例经 selector 模块级变量看到同一个真世界、
`constructAndRegister()` 幂等、`PhysicsRayResult` 可自构造且默认即「未命中」形状、裸 `new Collider(type)` 的
`shape===null` 且 `worldBounds` 是 `AABB` 默认半长 1 而非零盒）。

门禁面当期现读：

```
V1.1 链  promotion { spec 885b85eafe40, source d2497f8e98052058, candidate 9fa85f88b968d5f1,
                     verified 35, attested 34, units 69 }  status stable / specStatus frozen
         69 claims / 69 evidence、no-line 0；api-coverage 本例行 PASS/fresh/三绑定 true/claimedOnly 0
V1.2 链  契约行 group LV12-15 × 3 引擎、304 条 probeEquals + 2 条 probeNonEmpty
         全量 r39：33/33 PASS、completed=true、subset=false、contractFingerprint 1b545ae5a7bef3f3
         bundle 6,081,668 B sha256₁₆ 35496aebda066ab5（typecheck/build/build:min 后字节不变）
         截图 11402/13690/12828 B；三引擎语义 0 条不一致；良性日志仅 errorID(9642) 一族
全量门禁 npm test 31 suites / 252 tests 全绿；spec-validate --strict 56 frozen；compliance 0 fail / 1 warn
```

本轮两条门禁侧机制发现（属工具事实，不改校验器口径）：**F-110**
`validationExpectations.*.provenance[].line` 是 `spec-expectations apply` 派生后**冻结**在 `example.json` 的行号快照，
漏跑该步时 `v11-examples-verify` 仍 PASS+promoted、`spec-validate --strict` 才 FAIL（实测
`出处指向注释行：main.js:L282`）⇒ 复发链顺序已钉进笔记 §14；**F-111** `findSymbolLine` 的裸词首行命中会让
语义无关符号塌到同一行（`Collider.type` 曾绑到 `groundBody.type`、`primitives.capsule` 曾绑到
`scene.addChild(capsule)`），修法是示例源码侧消歧（`colliderTypeOf()` 读取器、`capsule → capsuleNode` 改名），
同一原因使我**放弃**登记 `physics.PhysicsRayResult.clone`（必然绑到 `sensor.position.clone()`，宁缺不伪）。

未证与不 claim 的面照实登记：cannon 变体的全部结论**未取证**（需 `AIR_FEATURES=`/`AIR_OUT_DIR=` 变体构建）；
`verified 35 < units 69` 是三段式 API 在 `api-trace` 下结构性不可 instrument 的上界，不是本示例欠账；
`PhysicsMaterial` 的摩擦/弹性在 builtin 下**只记账不生效**，故示例不声称物理响应；
`examples/physics-3d-collision` 未交付。

### 6.15 r40 LV12-15 cannon 变体：诊断级取证完成，示例侧转入决策点 D12

变体构建与行为反转探针（明细 `docs/v12-physics3d-notes.md` §15）当期实测：

```
构建  AIR_FEATURES=<默认集合，physics-builtin 换 physics-cannon> AIR_OUT_DIR=E:/AIProMax/cocosair-scratch/cannon-variant
      EXIT=0，6,599,009 B / sha256₁₆ 9ef1f01b24da043a（默认 6,081,668 B / 35496aebda066ab5）
      同命令二次构建到 cannon-variant-verify/ ⇒ identical=true（构建命令逐字节可复现）
探针  cannon-behavior-probe.cjs × chromium,firefox,webkit × (cannon / 默认 bundle 对照)
      两份 completed=true、18 条断言 0 抛错、三引擎读数逐字相同
      freeFall60Steps  builtin dy=0（y1=6）            cannon dy=-4.9123（y1=1.0877）
      velocityWriteBack builtin [0,0,0]                cannon [3,0,0]
      boundingSphere   builtin r=1/cy=0（=F-109）      cannon r=0.4/cy=1.088
      raycastClosest   builtin distance 1.6/hitY 6.4   cannon distance 6.5123/hitY 1.488
      worldBodyNames   builtin 无 Trimesh              cannon 有 Trimesh（第 11 条事实的反转）
      示例自带 __probe builtin 不抛                    cannon 三引擎各自抛 reading 'center'
```

⇒ 结论口径钉为 **`physics-builtin`**：§6.14 那 5 条「不模拟」证据是**后端事实**而非框架层事实。
登记 **F-112**（cannon 在 Code First 下每个 Collider `onLoad` 必抛，根因 `defaultMaterial` 恒 undefined，
builtin 因空实现而免疫）、**F-113**（矩阵产物路径写死 + 契约按 builtin 专有 getter ⇒ 变体进不了官方证据链）、
**F-114**（两后端 `collider.shape.material` 都读不回 ⇒ 材质只能行为取证）。

**决策点 D12（待确认，本轮不自行扩范围）**：计划书 L401-404 要求
`examples/physics-3d-collision` 以 **cannon 为默认演示后端**，并断言「cannon.js 纯 JS，三浏览器无门槛」。
前半句需要交付产物决策，后半句实测要打折：

- 默认 bundle 只注册 `physics-builtin`（`src/exports/air.ts:35`；`src/exports/physics-cannon.ts` 不存在，
  计划书该条「接线」未做）。要让示例在同一份交付产物里演示 cannon，只能把 `physics-cannon` 也编进默认集合，
  由 `physics-selector.ts:127-136` 的「初始化前最后注册者胜出」决定默认后端（保持 D7：builtin 后注册），
  示例在 boot 时 `selector.switchTo('cannon.js')`（`physics-selector.ts:145-164` 在 web 构建下 `runInEditor` 为真 ⇒ 可运行时切换）。
  代价：交付产物字节变化 ⇒ 33 条矩阵记录与三张护栏「默认产物不变」全部要重采，且 D7 需要重新表述。
- 或给 `tools/v12/browser-matrix.cjs` 加产物出口（F-113 的 ①），让变体 bundle 也能出正式证据。
- 「三浏览器无门槛」的实测折扣：三浏览器都能跑 cannon（18/18 断言一致），但**都必须先补一个默认材质**，
  否则 5 个 Collider 全部在 `onLoad` 抛（F-112）⇒ 若走示例路线，示例必须显式
  `PhysicsSystem.instance.setDefaultPhysicsMaterial(new PhysicsMaterial(...))` 并把这条写进契约断言。

本轮不选任何一条：LV12-15 组状态保持 in-progress，剩余欠账为「D12 决策 + `examples/physics-3d-collision`」。

### 6.16 r41 LV12-11 dragon-bones：`examples/dragonbones-basic` PASS（明细另成文 `docs/v12-dragonbones-notes.md`，7 节）

- **护栏 2（抽取逐字节）**：`node E:/AIProMax/cocosair-scratch/db-probe/compare-dragonbones.cjs` →
  `{"files":14,"same":14,"diffCount":0,"missing":[]}`（`db-probe/compare-dragonbones-r1.txt`）⇒ `src/cocos/dragon-bones/**` 对官方
  `E:/AIProMax/github/cocos4/cocos/dragon-bones/**` 全部 sha256-16 相同；`node db-probe/check-registration.cjs` →
  `{"onDisk":14,"unregistered":0}` ⇒ `docs/upstream-file-map.json` 无未登记偏差可补。
- **双链第一条（V1.1 规格）**：`v11-examples-verify --ids=dragonbones-basic` → `1/1 PASS，1 promoted`（`db-probe/v11-verify-r6.txt`），
  本例 46 units = `verified 15 / attested 31 / unproven 0`，promotion `{spec cfd28d7885f1, source d9ccae6dfd74bdea, candidate 9fa85f88b968d5f1}`。
  ⚠️ 31 个 attested 的原因不是证据弱，而是 `tools/verify/api-trace.cjs` 只包装 bundle **顶层导出表**与 `Class.prototype`；
  只在 `dragonBones` 命名空间下可达的类实测 `no own descriptor on prototype` ⇒ state `unresolved` ⇒ 上限即 attested（工具边界，非取证缺口）。
- **双链第二条（V1.2 三引擎矩阵）**：`NODE_PATH=… node tools/v12/browser-matrix.cjs` → **36/36 PASS**、`completed:true subset:false`、
  契约指纹 `dee8a12fe8b222f5`（加入本例行后从 r39 的 `1b545ae5a7bef3f3` 变化属预期），日志 `db-probe/matrix-full-r1.log`；
  本例行 `probeEquals 247 / probeNonEmpty 8 / probePresent 7 / minPngBytes 8000`，截图三张见 `docs/evidence/v12/dragonbones-basic/`。
- **决定性命门**：出图判据不能只看整体亮度（龙骨图形仅约 0.6% 采样点）⇒ 用 `Animation.gotoAndStopByFrame` 钉帧 +
  AFTER_DRAW 回调内 `readPixels` 的 region 纯色计数（plate 绿 / wing 蓝 / tip 红）做逐帧像素证据；矩阵只调**一次** `__probe()`，
  所以「多次采样累积」的量（`tipSeenInLiveSampling`、`tailIndex/tailRegion` 这类挂钟相位量）不能进 `probeEquals`（首跑 dry-run 就是这样整条红，
  快照 `db-probe/matrix-dry-r1.json` → 改用钉帧通路 `tipSeenInPerFrameSampling` 后 r2 全绿）。
- 新登记 finding：**F-115**（龙骨三处非直觉形状：`loadRemote('.png')` 回 `ImageAsset` 需自包 `Texture2D`；`factory.getTextureAtlasData` 回 **Array** 而非 `TextureAtlasData`，事实只能读 `atlasAsset._textureAtlasData`；
  `bone.global` 的全局角在 **`skew`**、`rotation` 恒 0 ⇒ 按 `rotation` 读会得到「看起来合理的 0」假阴性；手工资产 uuid 退化成数据 name ⇒ `armatureKey 'AirDragon#AirDragon'` 天然撞 key），
  **F-116**（新示例落地必改的三处门禁簿记：`smoke-29` 硬编码 `EXAMPLE_COUNT`（本轮 56→57，漏改即整表红）、`spec-evidence/spec-expectations` 记的是**行号**故改 `main.js` 后必须重刷、
  规格文本里**不得自印 spec 指纹**（一印即自我作废，触发 `S11-STALE-EVIDENCE` fail））。
- **本轮自伤与清偿**：单例 `--ids` verify 会把整批证据的完备标记写成 `partial:true / runTotal:1`；已用无 `--ids` 的全量重跑恢复为
  `52/52 PASS / partial:false / completed:true / unproven 0`（详见 `docs/acceptance-report-v12.md` §4 r41 段）。
  教训：**任何单例 verify 之后都要以全量重跑收尾**，否则 `docs/evidence/v11-examples-verified.json` 的批次级字段与 52 条记录不同源。
- 残留（诚实口径，全部记在 `docs/v12-dragonbones-notes.md` §7）：`AnimationCacheMode.SHARED_CACHE/PRIVATE_CACHE` 出图通路、`changeSkin`/`replaceTexture`、
  龙骨事件（`EventObject.ARMATURE_DISPLAY_FRAME_CHANGED` 等）、mesh 骨骼与 `SkinnedCluster`、`rotated` 图集帧、约束（IK/Path/WCW）、`AttachUtil`、
  二进制 DragonBones 格式、DPR≠1 视口；**Spine（LV12-10）未在本期交付**，未在本轮开重复 finding。
  ⚠️ **r45f 订正**：本行原文把归因写成「仍按 D2 不交付」，而 **D2 尚未批复**（`docs/v12-owner-decisions.md` 第 9 行批复列为空），
  且 r45e 实测运行级卡点是 spine 侧缺 emscripten 后端资产（见 §3 事故 F 与 `docs/acceptance-report-v12.md`），不是归属决定。

### 6.17 r43 三件事：D 组实测结案 / 护栏 ② 扩到替换件 / pose-graph 开关的代价

本轮不新增示例，全部是**把「待核」变成可复跑事实**，明细分三处：

1. **D9 的 D 组结案**（`docs/v12-d9-residual-triage.md` §3）：上游 `-empty` 替换**只由 `cc.config.json` 的显式路径对驱动**，
   没有按名自动替换的构建逻辑（已扫上游 `scripts/**`）⇒ `deserialize-dynamic-empty.ts` 判为「上游零引用桩」，
   13 项待批里唯一能自证的只剩口径确认那一句。同轮抓到并更正了本文 r42 初版的一句错话（见 triage §2 末）。
2. **护栏 ② 覆盖面扩展**（`tools/v12/verify-file-map.cjs` 第 7 类断言，F-118）：Air 不得丢官方替换对 / 自有对必须是已登记偏差 /
   两侧都在的替换件逐字节一致。当期读数 `upstream=103 air=104 airOnlyRegistered=1 byteChecked=72 excludedOneSide=77 missingBoth=10 → PASS`，
   负向控制（临时补一条假替换对）能红 ⇒ 不是恒真断言。
3. **LV12-12 的开关代价**（`docs/v12-pose-graph-notes.md` §4，F-119）：Air 原先没登记 `marionette` / `procedural-animation`
   两条官方 feature unit ⇒ 手工 `AIR_FEATURES` 传未声明名被 ccbuild **静默忽略**（`EXIT=0`、产物逐字节同默认）；
   补登后变体真实生效（**+339,301 B / +5.58%**、`PoseNode` ×128），默认三产物 PRE/POST 逐字节不变。
   已在 `tools/build/build.cjs` 落「未声明 feature 直接 `EXIT=1`」的构建侧护栏，负向/正向控制均现读通过（r43e）。

同轮还修了自己写进 README 的两条**不随包发布**的证据文件路径（`docs/evidence/**` 不在 `package.json files[]` 内，
`verify:consumer` 从 1 条失败涨到 3 条；改指向已打包的 `docs/acceptance-report-v12.md` 后回到 1 条 = F-85 遗留，F-120）。

## 7. r45c / r45d（2026-09-22）：批次 D-4 / G-3 代码面完工 + asm.js 兜底分支补用例 + 判据固化为门禁

本轮不新增示例，也不做运行级取证（仍受资产缺口 gate）；交付的是**抽取 + 簿记 + 测试面 + 一条新活门禁**。
台账：F-124（代码半边完工 + 新卡点归因）、F-125（分支契约用例 + 门禁固化）。

### 7.1 抽取（r45c，任务 #16）

受控按目录抽取（禁裸跑 `tools/extract.cjs` 全量），种子 = 3 子树 + 3 exports 入口：

| 组 | 判据命令 | 读数 |
|---|---|---|
| G3 bullet/physx | `node tools/v12/regress.cjs --group G3-physics-bullet-physx --features physics-ammo,physics-physx --prefix cocos/physics/bullet,cocos/physics/physx --exports physics-ammo,physics-physx` | `wrote 58/58; byte-identical 58; DIFF 0; MISSING 0` |
| D4 box2d-wasm | `node tools/v12/regress.cjs --group D4-physics-2d-box2d-wasm --features physics-2d-box2d-wasm --prefix cocos/physics-2d/box2d-wasm --exports physics-2d-box2d-wasm` | `24/24 byte-identical` |

净新增 **82** 文件（bullet 30 + physx 26 + box2d-wasm 23 + 3 个 exports 入口），`*.jsb.ts` 变体 **零进入**
（上游第 83 个 seed `cocos/physics/physx/instantiate.jsb.ts` 由 `regress.cjs` 自动 skip）⇒ §1.3 的平台排除口径未破。
簿记：`docs/extraction-manifest.json` 1196 → **1278**，`docs/upstream-file-map.json` 1233 → **1315**。

**闭包事实（此前只在仓库外 scratch 测算过一次，现由 §7.4 门禁在册）**：83 seed 的静态 import 传递闭包 = **764** 文件，
其中 Air 已**逐字节**持有 **760**、在簿漂移 **3**（`cocos/core/platform/debug.ts`、`cocos/core/utils/path.ts`、
`cocos/rendering/global-descriptor-set-manager.ts`）、jsb 变体 **1** ⇒ 净新增只发生在种子子树内，无「连带抽取」扩面。

产物侧护栏 7 未破：`npm run build` / `build:min` 均 `EXIT=0`，三产物 sha256₁₆ 与 r44 相同
（`35496aebda066ab5` / `8795c8685ace28a1` / `6d01c030d85bf86c`，6,081,668 / 3,499,182 / 3,082,360 B）
⇒ 36 条 V1.2 矩阵记录与 51 条 V1.1 记录的产物绑定不需要重采。

### 7.2 类型核对：Deviation-05（r45c）与「同一份资产缺口同时 gate 编译面」

纳入子图后 `npm run typecheck`（跑**根** `tsconfig.json`，不是 `src/tsconfig.json`）从 0 红到 **118**：
`Cannot find namespace 'Bullet'` ×35、box2d-wasm 合计 74 条 `Namespace 'B2' has no exported member …`、
`Cannot find module 'external:emscripten/{bullet,physx}/…'`、`Cannot find namespace 'PhysX'`、`Cannot find name 'FilterData'`。
根因与 F-121 / 批次 E（D10）是**同一份资产**：上游根 `tsconfig.json` 的 `types[]` 指向
`./native/external/emscripten/{bullet/bullet,physx/physx,box2d/box2d}.d.ts`（由 `npm run update:native-external` 联网拉取，
**不在 `4.0.0-alpha.34` 快照内**；同快照内 `types[]` 共 7 条 emscripten 条目，属同一 R8 缺口族），
且上游自身在同一快照内 `tsc -p tsconfig.json` 亦 `exit=2` ⇒「与上游对等的 wasm 后端类型面」在快照内**无参照物**。

处置按 Deviation-04 前例（不写 `any` 垫片、不手写替身、不放宽 `lib`/`module`/`types`）：
**两份** tsconfig 各加 6 项 exclude（3 子树 + 3 exports 入口），豁免范围写成可复跑断言 ——
`smoke-30`「批次 D-4 / G-3」三条 + 原 gfx-webgpu 的精确锁定断言。**该口径本身仍待 owner 确认（#14）**，本轮不自行判达。
`src/exports/*.ts` 同步移出发布类型图 ⇒ `d.ts` 逐字节未增长，未重演 gfx-webgpu 的「类型面凭空多出未接线后端」。

### 7.3 asm.js 兜底分支补用例（r45d，任务 #17）

`test/smoke/smoke-32-wasm-fallback.test.ts` —— 6 用例，**零第三方资产**驱动三族 loader 的两条分支：

- **桩**：`jest.mock(<字面量说明符>, factory, { virtual: true })` 顶掉 9 个 `external:emscripten/**`
  （说明符必须是字面量 —— 变量说明符不会被 babel-jest 提升）；`module: commonjs` 把 `import()` 降级为
  `Promise.resolve().then(() => __importStar(require(spec)))`，桩带 `__esModule: true` ⇒ `__importStar` 原样返回，
  于是 `get default()` 的触发即「该分支确实请求了这份资产」的可观测证据。
- **分支杠杆**：`NATIVE_CODE_BUNDLE_MODE` 改在共享 `test/stubs/internal-constants` 对象上（按模块同一性 `require` 取得，
  不 mock 模块本体）；`sys.hasFeature` 用实例遮蔽，且实测**仅 BOTH 模式**消费它。

测得 7 处上游不对称（全部读数见 F-125），其中唯一影响使用者的一条已量化归因：
`src/cocos/physics/bullet/instantiated.ts` 的 `initWASM`（:95）会额外写 `globalThis.Bullet`（:111），`initASM`（:116）不会；
grep `src/cocos/physics/**` 得 **1 个写点、0 个引擎内读者** ⇒ 差异只在用户侧全局可见性，不影响后端可用性（登记为 F-125 的「非直觉形状」，不改上游原文）。
另两条早退/落地不对称事实：bullet 的 `asmFactory == null` 时 `Promise.resolve()` 早退（:123-127）；
physx 的 `initASM` 用 `Object.assign(PX, Instance)` 而 `initWASM` 直接重绑 `PX = Instance`（`physx-adapter.ts:76` / `:93`）。

### 7.4 判据固化为活门禁（r45d 首建，r45f 扩到 A7 + 新增文档引用门禁）

新增 `tools/v12/verify-wasm-backends.cjs` + npm 脚本 `verify:v12-backends`，把「一次性 scratch 测算」变成可复跑断言：

| 断言 | 内容 |
|---|---|
| A1 | 闭包内（除 `*.jsb.ts`）每个文件都必须在 `src/` 存在 |
| A2 | seed 83 / 闭包 764 / jsb 集 / 默认 `AIR_FEATURES` 数不漂移，且 **seed 文件**的相对说明符零解析失败（非 seed 侧另有 16 条，只作 info 打印） |
| A3 | 闭包内字节偏差 ⊆ 3 个已登记漂移件 |
| A4 | 9 个 `external:emscripten/**` 说明符不变，且**只出现在 dynamic import 分支**（静态引一份缺失资产 = 构建期硬依赖） |
| A5 | feature 面 34/55/22 + `airOnly=[air]`，且 3 个 wasm 后端 feature 与上游逐字节同、不在默认 `AIR_FEATURES`（26 条）内 |
| A6 | **去豁免触发器**：若上游 `types[]` 将来能解析到那三份 `.d.ts`，本门禁直接红 —— 即 owner #14(b) 的机器化条件 |
| A7 | **缺件必须登记**（r45f，内联原 scratch `lv12-16-attribution`）：5 个物理后端子树（`SEED_DIRS` + `cocos/physics/cannon` + `cocos/physics-2d/box2d`）里，每个上游非 `.d.ts` `.ts` 文件若 Air 未落盘，就必须出现在 `docs/v12-baseline-compare.json` 差集任一桶（`upstreamOnly` ∪ `upstreamOnlyByCategory[*].files`）内；对 `SEED_DIRS` 额外要求**非 jsb 缺件数 = 0**（批次已结项）。 ⇒ 悄悄缩小范围、抽了却不自知的漂移会变红，而不是静默通过 |

现读 `EXIT=0`，JSON：
`{"ok":true,"seeds":83,"closureTotal":764,"airByteIdentical":760,"drifted":3,"specs":9,"features":{"air":34,"upstream":55,"missing":22,"airOnly":["air"],"defaultAirFeatures":26},"subtreeUnregistered":0,"registeredFace":96,"errorCount":0}`。
A7 子树明细（现读，`--json` 的 `subtrees`，四元组 = `upstreamTs / missing / missingNonJsb / unregistered`）：
`bullet 30/0/0/[]`、`physx 27/**1**/0/[]`、`box2d-wasm 23/0/0/[]`、`cannon 20/0/0/[]`、`box2d 22/0/0/[]`。
physx 那 1 条缺失是上游 `cocos/physics/physx/instantiate.jsb.ts`（原生变体，Web 侧按 §1.3 平台排除且已登记在差集内，故 `missingNonJsb=0 / unregistered=[]`）。
负向控制一（`pg-probe/negctl-backends.cjs`：改登记 seed 数 + 人为制造一处字节偏差）→ `EXIT=1` 两红
（「A2 seed 数漂移：实测 83，登记 84」/「A3 闭包内新增字节偏差 … `cocos/core/utils/path.ts`」）⇒ 非恒真断言。
负向控制二（r45f，`pg-probe/negctl-a7.cjs` 三份，只改登记常量、不动 `src/` 与上游，且**显式钉住** `ROOT` 因为脚本按 `__dirname` 推导）：
`negctl-a7-positive`（仅钉 ROOT）→ `EXIT=0` 证明 ROOT 钉法本身不改结论；`negctl-a7-unregistered`（从 `driftedAllowed` 删一项）与
`negctl-a7-nodir`（从 `physicsSubtreeDirs` 删一个子树）→ 各 `EXIT=1`，报出预期的 A7 红项。日志 `pg-probe/r45f-backends-afterA7.log`。

新增 `tools/v12/verify-doc-refs.cjs` + npm 脚本 `verify:doc-refs`（r45f，内联原 scratch `check-doc-refs`）：markdown 里的仓库内路径引用必须可解析。
跳过三类：S1 glob/花括号/占位符（含 `* ? { } < >`）、S2 外部 URL 与纯锚点、S3 仓库外绝对路径；先剥 `#…` / `:123` 后缀。
反引号片段允许空格但**不跨行**（跨行匹配会产出假阳性，故不参与匹配）。
**棘轮基线** `tools/v12/doc-refs-baseline.json` 登记历史坏链：R1 = 新增未解析即红；R2 = 基线条目不再命中即红（防基线腐烂）。基线文件缺失 → 全红并告警，不静默放行。
r45f 当期快照 `EXIT=0`（**已被 §7.9 的 r45f2b 现读取代：基线 46 → 31**）：`{"ok":true,"docs":118,"refsChecked":986,"skippedCounts":{"glob":43,"external":0,"outOfRepo":0},"baseline":{"entries":46,"hits":46},"unresolvedCount":0,"staleBaselineCount":0}`。
⚠️ `refsChecked / glob` 两个计数**会随本节引用它自身的正文而漂移**（写下 978/42 后复跑即变 986/43），故只作 r45f 快照，判据取 `ok:true` + `unresolvedCount:0` + `staleBaselineCount:0` 三项。
三份负向控制（scratch `pg-probe/negctl-{empty,dropped-entry,fake-entry}-baseline.json` 配 `--baseline=`）：空基线 → 46 条 R1 红 `EXIT=1`（该 46 是 r45f 期数字，基线现读 31，两臂复跑见 §7.9）；
删一条基线 → 1 条 R1 红；加一条假基线条目 → `staleBaselineCount:1` R2 红。日志 `pg-probe/r45f-docrefs-{1,2,neg1,neg2,neg3}.log`。
本轮唯一真实修链：`docs/manual/tips.md:13` 的 `../tools/verify/manual-examples-verify.cjs` → `../../tools/verify/manual-examples-verify.cjs`。
**同轮自证**（不是装饰性断言）：写 §7.4/护栏 13 时把登记文件名误写成 `docs/v12-baseline-comparison`（真名是 `docs/v12-baseline-compare.json`），
`verify:doc-refs` 立刻 `EXIT=1` 报出 `docs/acceptance-report-v12.md` 的那一条 R1 新断链（日志 `pg-probe/r45f-gates2-verify-doc-refs.log`），改对后复跑 `EXIT=0`
（`pg-probe/r45f-gates3-docrefs.log`）⇒ R1 那条臂在真实写作流里被验证过一次。（注意此处只能写不带扩展名的错名：原样引用会被本门禁判成断链 —— 与 F-126「撤回类判据不可执行」同一机制。）

### 7.5 当期门禁现读（2026-09-22 r45f，替代 §5.2 / §6.1 的 r26 / r27 口径）

| 门禁 | 命令 | 现读 |
|---|---|---|
| 类型核对 | `npm run typecheck` | **PASS**（exit 0；Deviation-04 + Deviation-05 的 exclude 清单由 `smoke-30` 精确锁定，删任一项即红） |
| 全量测试 | `npm test` | **32 suites / 261 tests 全绿**（r45c 为 31/255，本轮正好多 `smoke-32` 的 1 套件 + 6 用例；`docs/test-inventory.json` 已重采，`node tools/verify/test-inventory.cjs` 现读 `ok:true`） |
| 簿记一致性 | `npm run verify:file-map` | **PASS** — `rows=1315 modified=28 scanned=1268 manifest=1278`；替换件第 7 类 `upstream=103 air=104 airOnlyRegistered=1 byteChecked=73 excludedOneSide=76 missingBoth=10`（r43 记 `byteChecked=72 / excludedOneSide=77` ⇒ 差的正好 1：本轮新抽的 `cocos/physics/physx/instantiate.ts` 让 NATIVE 替换对 `instantiate.ts=>instantiate.jsb.ts` 的 **web 侧**从「Air 无、上游有」变成「两侧逐字节同」，jsb 侧仍按 §1.3 平台排除；判据脚本 `pg-probe/r45d-which-ov-pair.cjs`） |
| wasm 后端 | `npm run verify:v12-backends` | **EXIT=0**（§7.4 JSON，r45f 起含 `subtreeUnregistered:0 / registeredFace:96` 两字段），负向 `EXIT=1` |
| 文档引用 | `npm run verify:doc-refs` | **EXIT=0**（r45f 新增；判据取 `ok:true` + 0 新断链 + 0 腐烂；**基线现读 31 条全命中** —— r45f 首轮 46 条，r45f2b 实质修好 15 条后按 R2 同步删除，见 §7.9；`refsChecked` 计数见 §7.4 的漂移警示），负向控制各 `EXIT=1`（r45f 三副本 + r45f2b 两臂：空基线 31 条 R1 红 / 回指改前快照恰好 15 条 R2 红） |
| custom 导出面 | `npm run verify:v12-custom-face` | **EXIT=0**（r45f 新增，§7.7 C1–C5），阳性对照 `EXIT=0` + 五条变异各 `EXIT=1` |
| 产物（护栏 7） | `npm run build && npm run build:min` | 三产物 sha256₁₆ 与 r44 逐字节不变（§7.1 末） |
| 消费面 | `npm run verify:consumer` | **r45f2b 现读仍只有 1 条失败 = F-85 遗留本体**（`README links to missing packaged file: docs/manual/index.md`，`CONSUMER_EXIT=1`，日志 `pg-probe/r45f2b-consumer.log`；r45f 首轮 `pg-probe/r45f-consumer.log`）；tarball `cocosair.js-0.1.0.tgz` **10,317,154 B**（r44 10,258,109 → r45c 10,279,873 → r45d 10,286,362 → r45f 10,305,483 → r45f2 10,310,721 → **r45f2b 10,317,154**；r45f2b 的 +6,433 全部来自 `docs/*.md` 在册文本（F-127 断链收口 + 本节 §7.9），`files[]` 未扩。⚠️ 口径提醒：`files[]` 只含 `docs/*.md` 与 `docs/*.json`，**docs/manual/**、docs/audits/**、docs/evidence/** 都不在发布面内** ⇒ 手册与台账改动不动 tarball，而这正是 F-85 的成因。⚠️ 自指提醒：把该字节数写进本行本身又会改变 `docs/*.md` ⇒ 下一轮复跑必再增，故判据只取「失败项恰为 F-85 本体一条」，字节数一律标为测量瞬时快照），`exportCount 574` 不变 ⇒ 82 文件与三份新增工具**未**扩发布面（`tools/**` 不在 `files[]`，`smoke-27` 断言在册）。**UPDATE-r45g（23:21Z）**：本行此后**不再复制当期字节数**——r45f2b 末轮实测 10,317,270、r45g 首轮（23:19Z）补跑 10,318,285，而两次实测之后又各有 `docs/*.md` 编辑 ⇒ 任何写进本行的数字在写完那一刻就已过期（上一段那条自指提醒不是装饰）。权威逐轮值改登记在 `docs/audits/global-quality-audit-2026-09-19/findings.jsonl` 的 F-127 字段 `packaging_r45f2b` 与 `gates_r45g`：`docs/audits/**` 既不在 `package.json files[]` 发布面内、也不在 `verify:doc-refs` 扫描面内（后者按 `perDoc` 实测命中 0）⇒ 记在台账里的数字不会回灌到被测量对象本身。本行判据维持不变且已复测：`CONSUMER_EXIT=1`、失败集合**恰为 F-85 本体一条**、`exportCount 574` 不变 |

### 7.6 本轮仍未做（划清边界，勿据此判达）

1. **D-4 / G-3 运行级取证**：需 `bullet.wasm` / `physx` / `box2d.wasm` 及 emscripten `.d.ts` 到位（F-121 / 决策 #9）。
   届时 A6 会自动要求取消 6+6 项 exclude、`typecheck` 必须真绿，并全量重采 36 + 51 条证据。
2. **owner 待批**：#14（Deviation-05 豁免口径）与 #9（14 项残留 + webgpu 资产方案）—— 计划书护栏 ① 要求「可复核理由 + 确认」，本轮只补齐理由。
3. 判据脚本内联进度：`wasm-backend-closure` / `closure-unresolved-detail` / `feature-units` / `physx-count-recon` 四份已固化进
   §7.4 的 `verify:v12-backends`；r45f 再收两份 —— `lv12-16-attribution` → 同门禁的 **A7**，`check-doc-refs` → 新脚本
   `verify:doc-refs`。`physx-which-file` **主动不入门禁**：它是一次性差集 dump（打印 physx 相关 `upstreamOnly` 条目定位「27 vs 26」），
   不含任何断言，固化只会增加一个恒真脚本；其结论（physx 子树缺件数与登记一致）已由 A7 的 `subtrees` 字段以断言形式长期钉住。
   ⇒ **断言面**已全部回到树内：scratch 目录余下的是 (i) 负向控制输入（`negctl-*`）；(ii) 一次性诊断 dump（`r45d-which-ov-pair` /
   `r45d-inventory-diff` / `physx-which-file`），结论分别由 `verify:file-map` 第 7 类、`smoke-30` inventory 断言、A7 `subtrees` 承担；
   (iii) 尚未内联的一份真判据 —— `matrix-evidence-audit`（browser-matrix 记录 ↔ `docs/evidence/v12/**` 截图逐条对账，
   属任务 #7 证据面，等 16 组证据齐了再固化才有意义：现在固化会把「证据本就不全」写成恒红门禁）。
   `h-export-face` 已在同轮内联为 §7.7 的 `verify:v12-custom-face`。文档里对 (ii)(iii) 的路径引用只作 provenance 指针，
   不再作为「可复跑判据」的替代。

### 7.7 LV12-17「custom 导出面一致」固化为门禁（r45f，任务 #19）

新增 `tools/v12/verify-custom-export-face.cjs` + npm 脚本 `verify:v12-custom-face`（原判据 `pg-probe/h-export-face.cjs` 只 dump 不断言）。
五条不变量：

| 断言 | 内容 |
|---|---|
| C1 | `src/exports/custom-pipeline.ts`（169 B）/ `src/exports/custom-pipeline-post-process.ts`（89 B）与上游 **sha256 逐字节同** —— 这是「Air 的 custom pipeline 接线面 = 官方」的直接证据 |
| C2 | 子图计数不漂移：`cocos/rendering/post-process` 34/34、`cocos/rendering/custom` 25/26；上游缺件只允许已登记的 jsb 变体（`cocos/rendering/custom/index.jsb.ts`，Web 平台排除同 §1.3） |
| C3 | 子图内每个 Air 文件与上游字节相同（`byteDiff` 恒 0），且**逐张登记在** `docs/upstream-file-map.json` ⇒ 「抽了不回填簿记」（F-3 / F-118 那类）即红 |
| C4 | feature unit 声明面：`custom-pipeline` / `custom-pipeline-post-process` 与上游逐字段同；上游的 `custom-pipeline-builtin-scripts` 若被静默引入 Air 声明即红（`docs/01-web-feature-set.md:66` 记其为非目标，引入 = 默认产物字节变，须走批复） |
| C5 | **默认发行姿态**（与 A5 对 wasm 后端的极性相反）：这两个 feature unit **必须**在 `tools/build/build.cjs:25,38` 的默认 `AIR_FEATURES`（26 条）内 —— 后处理效果类是已发布 bundle 的组成部分，移出默认集同样改产物字节 ⇒ 须走批复 + 全量重采 |

现读 `EXIT=0`：`{"ok":true,"faces":2,"dirs":"cocos/rendering/post-process:34/34 cocos/rendering/custom:25/25","featureUnits":2,"defaultAirFeatures":26,"errorCount":0}`。
负向控制（`pg-probe/negctl-custom-face.cjs` 生成 6 份副本，只改登记面 —— `EXPECT` 常量 / file-map 读取路径 / 解析后清单，不动 `src/` 与上游；
副本显式钉 `ROOT`）：阳性对照 `EXIT=0`（证明钉法本身不改结论），C1…C5 五条变异各 `EXIT=1` 且各自只报自己那一层：
C1 → 「门面字节与上游不同：`src/cocos/core/platform/debug.ts`（Air `e4208d271769ca90` / 上游 `fc86783e8a6e737b`）」（借用 A3 在册漂移件做对照片段）；
C2 → 「出现未登记的上游缺件：`cocos/rendering/custom/index.jsb.ts`」；C3 → 59 条「未登记在 docs/upstream-file-map.json」；
C4 → 「`custom-pipeline` 进了 Air 声明 ⇒ …须先取得 owner 批复」；
C5 → 两条（「默认 AIR_FEATURES 数漂移：实测 25，登记 26」+「`custom-pipeline` 被移出默认 AIR_FEATURES ⇒ 发布 bundle 组成改变」）。⇒ 五条均非恒真。
日志 `pg-probe/r45f-negctl-customface.log`。

**边界**：本门禁只覆盖 LV12-17 的「导出面一致性」半项；另一半 `examples/post-process-basic` 开关对照取证仍待 owner 决策 **D11**（任务 #15），
故 **不得**据此判 LV12-17 达验收。

### 7.8 LV12-01「三浏览器存量铺开」的工具侧 + 实测成本（r45f2，任务 #20）

铺开到 firefox / webkit 的前置阻塞不是引擎跑不起来，而是「Playwright 包版本 ≠ `ms-playwright` 缓存修订号 ⇒ 必须显式指路」这条知识在仓库里**重复了 8 个文件**，
还分裂成两代：4 个 V0.5.1/V0.6 遗留工具默认 `chromium-1234`（本机 `ls` 现读**不存在** ⇒ 死路径，好在没有任何 npm script 接它们，已登记 **F-128** 非阻塞），
另有 `browser-matrix.cjs` / `browser-runtime.cjs` / `manual-examples-verify.cjs` / `v11-gallery-artifact.cjs` 默认 `chromium-1228`（本机存在）。
判据可复跑：`node E:/AIProMax/cocosair-scratch/db-probe/check-engine-paths-r45f8.cjs`。本轮先把这条知识收成一份共享表（`v11-examples-verify.cjs` 此前根本没有引擎参数）：

- 新增 `tools/verify/browser-engines.cjs`：`{chromium: chromium-1228 + args, firefox: firefox-1543, webkit: webkit-2361}` + `launchOptions(engine, localAppData?)`。
- `browser-runtime.cjs` 构造器新增可选 `browserLaunch` 注入；**未注入时走原有 chromium 分支，逐字节不变** ⇒ 其余 5 个调用方（`v11-devtools-examples` / `spec-expectations` / V0.6 golden / recipes / `benchmark-regression`）行为零变化。
- `v11-examples-verify.cjs` 新增 `--browser=` / `--out=` / `--artifact-dir=` + 两条**防串写护栏**（对应 F-117）：
  (i) `--browser` 非 chromium 且未显式 `--out=` ⇒ `EXIT=2` 拒绝启动；(ii) 写入路径 ≠ canonical 证据文件 ⇒ `[skip-promote]`，不回写 `example.json` / `files.json`、不跑 `generate-manifest`。
  ⇒ 单例/跨引擎跑**不可能**再把 chromium 整批字段写成失真态；但 F-117 的**批次级 jest 断言半边仍未加**（口径待批）。
- ⚠️ **已知重复（本轮刻意不清理）**：`tools/v12/browser-matrix.cjs` 顶层是 IIFE、无导出点，仍自带一份 `ENGINES` ⇒ 与共享表**必须同步改**，
  迁移排在任务 #7 的矩阵重采窗口一起做（那本来就是要动该文件的窗口），避免此刻为重构而重采 36 条证据。

实测（`--ids=anim-position,mesh-sphere`，每引擎单进程 2 例，全部写 scratch 路径）：

| 引擎 | 退出码 | 结果 | 耗时 | `apiProofTotals` | `candidateFingerprint` |
|---|---|---|---|---|---|
| chromium | 0 | 2/2 PASS | 127 s | `{verified:35, attested:0, unproven:0}` | `9fa85f88b968d5f1` |
| firefox | 0 | 2/2 PASS | 130 s | 同上（逐字段相同） | 同上 |
| webkit | 0 | 2/2 PASS | 130 s | 同上（逐字段相同） | 同上 |

⇒ 摊算 **≈63 s/例/引擎**（含每进程一次性开销，为上限）。三引擎 `candidateFingerprint` 全等于当期发布 bundle ⇒ 跨引擎证据与 chromium 同一套证据货币；
唯一 console 噪声是既知的良性 `[Physics] PhysicsSystem initDefaultMaterial() Failed to load builtinMaterial.`。
日志与 JSON：`E:/AIProMax/cocosair-scratch/pg-probe/r45f-probe-{chromium,firefox,webkit}.{log,json}`；自查 `db-probe/read-r45f-probe3.cjs`。
⚠️ 本次探测违反「一文件名一捕获」（scratch 内）：三腿共用同一 `--artifact-dir` ⇒ 同名 PNG 逐腿覆盖，磁盘只剩 webkit 腿字节（2,025 B），chromium/firefox 腿只有各自 JSON 里的 `artifact.bytes/hash`。正式批次每引擎一个 `--artifact-dir`。

**顺带查清的两条口径**（写进了 `docs/v12-owner-decisions.md` UPDATE-r45f2 / 验收报告 LV12-01 行）：
① canonical 证据 52 records = `files.json` 57 examples − 5 个 `requiresDevTools`（`automation` + 4 个 `rc-*`），判据在 `tools/verify/v11-examples-verify.cjs:91`，
故「V1.1 存量」引用必须带口径；② 计划书的「存量 12」经 `git show 2666b56:examples/files.json` 定位到 **2026-09-18 V1.1 Pilot 12** 那一批（12 例今天全在 `files.json`，
但 `automation` 因 ① 不参与该 runner ⇒ 实际可跑 11 例）。**未自行选集合开跑**：范围与证据落点已升为待批 **#15**，本轮不动任何判定阈值。

### 7.9 F-127 断链逐条收口（r45f2b，任务 #8 / LV12-21 簿记面）

`verify:doc-refs` 的棘轮基线在 r45f 登记了 46 条历史断链。本轮**逐条**判定「修链接 / 加 provenance 注记 / 保留待决」，
先测后改（`db-probe/f127-linkprobe-r45f2.cjs` + `f127-facts-r45f2.cjs` + `f127-facts2-r45f2.cjs` + `f127-context-r45f2.cjs`，全只读）：

- **46 条现读全部仍断**（不是并行波次已顺手修掉的）。
- 探测到 5 条「同名文件在别处存在」的候选，逐条判为**假绑定**，一律未按同名改指（build/capabilities.json 旧串 ↔ `examples/gltf-catalog/capabilities.json` 直到读出**生成器真实输出路径**才成立；`gltf/errors.ts` ↔ marionette 的 errors.ts 无关；src/main.ts 简写是正文描述的通用布局而非某个具体文件）⇒ 与 F-111 同一通则：**同名存在不是同一制品的证据**。

**15 条修链接**（每条都有可核实的真目标，非改名）：

| 断链（doc → ref） | 改为 | 取证 |
|---|---|---|
| `docs/01-web-feature-set.md` → scripts/build-h5-source.js（旧串，刻意不加反引号，见本节末） | `cocos4/scripts/build-h5-source.js` 并写明归属上游 | 本仓库**无** `scripts/` 目录（`readdir` ENOENT）；上游 `E:/AIProMax/github/cocos4/scripts/build-h5-source.js` 存在；AIR 侧对应实现是 `npm run build` → `tools/build/build.cjs`（`package.json`） |
| 6 条手册兄弟页：`custom-geometry.md` ×3、`render-targets.md` ×2、`dynamic-texture.md` ×1 | `custom-buffergeometry.md` / `rendertargets.md` / `canvas-textures.md` | 三篇真实存在且**主题一致**（首行标题分别「自定义几何（Custom BufferGeometry）」「渲染目标（Render Targets）」「Using A Canvas for Dynamic Textures」；后者配套示例目录就叫 `examples/manual-dynamic-texture/`）——按主题核对，非同名 |
| `docs/progress.md` → docs/evidence/skinned-animation-pose1~3.png（旧串） | 展开为 pose1/pose2/pose3 三条真实 PNG | `docs/evidence/` 现读三份都在；`docs/acceptance-report.md` 另外 2 处同串（纯文本、门禁不抓）一并展开 |
| `docs/v06-g0-handover.md` → src/air/assets/gltf/errors.ts（旧串） | `src/air/assets/gltf/diagnostics.ts` | 全仓 grep GLTFErrorCode 只在 diagnostics.ts 定义（`export type GLTFErrorCode` / `export class GLTFError`）与 index.ts 转出 |
| `docs/v06-g0-handover.md` + `docs/v11-baseline.md` → build/capabilities.json（旧串） | `examples/gltf-catalog/capabilities.json`（并补 `npm run capabilities`） | `tools/verify/update-capabilities.cjs:130` 的写出路径唯一指向该文件且文件在库；build/capabilities.json 不存在，全仓无任何脚本写它 |
| `docs/v08-iss-benchmarks.md` → `.../frozen/B1xx.main.ts` | 目录 + 真实端点 `B100.main.ts` … `B150.main.ts` | 目录现读 110 份 `.main.ts`，`B1*` 段 51 份（B100–B150）；占位符 `B1xx` 换成端点后可解析 |
| `docs/v08-license-inventory.md` → tools/verify/license-inventory.cjs（旧串） | 改为真实两件：`tools/verify/license-audit.cjs` + `npm run verify:licenses`（`tools/v12/verify-licenses.cjs`），并声明**本文正文人工维护、非脚本生成** | 该脚本不存在；`package.json` 无 inventory 脚本；两件真实脚本的头部注释各自说明职责，且都不写 `docs/v08-license-inventory.md` |
| `docs/v11-example-specs.md` ×2 + `docs/v11-progress.md` ×2 → src/main.ts（旧串，简写） | `examples/*/src/main.ts` | 35 个示例目录实有 src/main.ts；原文是简写而非某具体文件，改成带仓根前缀的通配形状后既可核又不误导（S1 通配类） |

**30 条 `../output/playwright/*` 保留并加注记**（不假装修好）：`.gitignore` 有 `output/` 条（「瞬态验证产物与构建临时目录（V0.3）」），
且 grep 全仓无任何脚本写 `output/playwright/` ⇒ 这批 V0.x 捕获**只存在于当时开发机、从未入库**。已在 `docs/11-v03-verification.md`（5 条）、
`docs/gltf-catalog.md`（5 条）、`docs/gltf-validation.md`（20 条）顶部各加一段「证据链接可读性说明」，明写这些链接仅为 provenance 指针、
**不据此判「证据在仓库内可得」**；基线 30 条按 R1 继续锁死（新增同类即红）。
**1 条 src/vendor/google.ts 保留**：D9 A-4「将来文件」，批复前不可能存在（§7.6 边界）。它在 `docs/v12-d9-residual-triage.md` 里靠基线豁免，
但豁免键是 **doc + ref 成对**的 ⇒ 换一篇文档原样引用它就是一条 R1 新断链（本轮实测抓到，见本节末）。

**门禁现读与负向控制**（`db-probe/shrink-docrefs-baseline-r45f2.cjs` 改基线：逐条断言「每个待删键恰好命中 1 次」+ 总数 46−15=31，改前快照 `db-probe/doc-refs-baseline.snapshot-before-r45f2.json(.sha256)`）：

- 正向：`npm run verify:doc-refs` → `EXIT=0`，`{"ok":true,"docs":118,"refsChecked":1031,"skippedCounts":{"glob":50,...},"baseline":{"entries":31,"hits":31},"unresolvedCount":0,"staleBaselineCount":0}`（`pg-probe/r45f2b-docrefs-5.log`；`refsChecked`/`glob` 仍受 §7.4 的自引用漂移约束，判据只取 `ok` + 两计数为 0 三项）。
- 负向 R1：`--baseline=` 指向空基线 → `unresolvedCount:31`、`EXIT=1`（`pg-probe/r45f2b-negctl-r1.log`）。
- 负向 R2（**同时是这 15 处修好的证明**）：`--baseline=` 指向改前 46 条快照 → `EXIT=1`，报出的「R2 基线条目已不再命中」**恰好 15 条** ⇒ 每一条修改都真实改变了门禁可解析性，不是改基线凑数。

⚠️ **本轮踩到的自伤（当场被门禁抓住，不是假想）**：给本节写「旧串 → 新目标」对照表时，把旧串照原样放进反引号，
`npm run verify:doc-refs` 立刻 `EXIT=1` 报出 **9 条 R1 新断链，全部来自 `docs/v12-upstream-regression.md` 自己**
（日志 `pg-probe/r45f2b-docrefs-2.log`）：旧串 8 条 + 一条更滑稽的 `-> 路径`——因为我为了说明规则写了「形如 Markdown 链接括号语法 + 路径」的字面量，
而 **`LINK_RE` 不认反引号**（`tools/v12/verify-doc-refs.cjs:44`），包在反引号里的链接语法照样被抓。
修法：旧串一律改为**不加反引号**的纯文本并标「（旧串）」，链接语法字面量改用散文描述 ⇒ 复跑 `EXIT=0`。
这与 §7.4 末「同轮自证」那条和 F-126「撤回类判据不可执行」是同一机制：**豁免按 doc+ref 成对，且解释性文字本身就在门禁的输入面上**。
⇒ 通则：**给门禁写说明文字，等同于往它的输入面里写数据**；注记/对照表里出现的每个路径形状都要先过一遍它自己的三条 skip 规则（S1 通配/占位、S2 外链锚点、S3 仓库外绝对路径——盘符前缀属 S3，所以引用上游快照文件时才写得下去）。

### 7.10 计划书 F-3 项「`docs/01-web-feature-set.md` 增补 V1.2 feature 表」+ 顺带抓出 F-129（r45g-docs01，任务 #8）

该文档是仓库里**唯一描述能力边界（哪些 feature 进 Air）**的文档，此前 **0 处**提及 V1.2/LV12（`grep -c "V1.2\|LV12" docs/01-web-feature-set.md` 改前现读 0）。
本轮**追加** §7（5 小节，全部由脚本导出、不手抄）：§7.1 声明面对账、§7.2 默认构建集 26 项按批次归批、§7.3 声明但未入默认的 8 项逐条给来源、§7.4 上游有而 Air 未声明的 22 项**只列名不编理由**、§7.5「本节不覆盖」清单。
两个独立事实源交叉核对（任一实现写错都会对不上）：**新建仓库内门禁** `npm run verify:v12-feature-face`（D1，r45g 同轮内联，见 §7.11）与 `npm run verify:v12-backends` 的 A4/A5 ⇒ 现读一致：Air 声明 **34**、上游 **55**、缺 **22**、`airOnly=["air"]`、默认 `AIR_FEATURES` **26**、`DEFAULT not declared:` 为空。

**F-129（新开，`blocking:false`，台账现读 129 行 / 链 `b3488ac8b79d18e5` → `15bb99454f961e3a` → 加字段 `c60af7a50ef4a8a9`）**：
§4 取舍表把 `gfx-webgl2` 标为「Air V0.1 = No」（理由「WebGL1 已覆盖验证路径」），§5 的「Air V0.1 feature 集」列 **10** 项；
但 `git show f1bc676:tools/build/build.cjs`（**V0.1 基线提交**）第 20–24 行直读给出 **12** 项，含 `gfx-webgl2` 与入口 unit `air`（§4 整张表也没有 `air` 行）
⇒ 唯一的能力边界文档说「不含 WebGL2」，而发布 bundle 自始含。这不是回归而是**立项期陈述与代码从未对齐**。
处置不擅断：§4/§5 属历史语义，**未回改**；已升为待批 **#16**（三候选：(a) 改文档承认 V0.1 起即开 WebGL2 / (b) 移出 `gfx-webgl2` 对齐原文＝默认集变更，需 bundle 预算 + 16 组证据全量重采 / (c) 以新 §7 为当期口径、§4/§5 标注为立项期快照）。建议 (c) 为主、(a) 收尾。
⚠️ §7.3 另记一条**易误读面**：`audio` 声明了但不在默认集，而默认 bundle 里确有 `AudioSource`（`grep -c AudioSource build/cocosair.module.js` → 17）——它来自 `src/exports/air.ts:37` 的 `export * from './audio'`（走 `air` 入口），**不是** `audio` feature 选择子。
⇒ 在 Air 里 `audio` 与 `air` 不是同一个开关面，变体构建 `AIR_FEATURES=audio` 不会改变默认产物；引用「audio 是否随包发布」时必须说明走的是哪一条。

本轮发布面副作用（判据现读，字节数只记台账不记正文，理由见 §7.5 消费面行）：
`npm run verify:doc-refs` 改后 ×2 均 `EXIT=0`（`baseline {entries:31,hits:31}`、`unresolvedCount 0`、`staleBaselineCount 0`；`refsChecked` 1041 → 1042 只作轮次快照）
⇒ **零自伤**，与 §7.9 那条「9 条 R1 全来自我自己写的对照表」的教训的差别只有一个：本轮 §7 里出现的 7 个仓库内路径**先逐个 `existsSync` 实测存在**才落笔，且不写链接语法字面量。
`npm run verify:consumer` → `CONSUMER_EXIT=1`，`failures` 仍只有 F-85 本体，`exportCount 574`，`published-artifacts: 4 markers x 2 bundles, 0 fail` ⇒ 三默认产物字节未动，增量全部来自 `docs/*.md` 落进 `files[]`。
未重跑清单（改动全在 `docs/**` + 台账，不触碰 `src/`、`tools/`、`test/`、`package.json`、`tsconfig`、`cc.config.json`）：`typecheck` / `npm test` / `build` / `build:min` / `verify:file-map` / `verify:test-inventory` / `verify:v12-custom-face`；这些的当期值仍取 §7.5 与 F-127 `gates_r45g`，不冒充本轮重采。

**边界**：本节只把「文档 ↔ 代码现读」这一格推进为已登记，**不**使 F-3 簿记清单完成：仍在前的是 README 特性矩阵与 `docs/progress.md` 的 V1.2 段合并、`api-inventory` / `api-coverage-report.json` / `capabilities` 重跑（`verify:api-coverage` 仍 **FAIL**，口径属 §2 护栏第 10 条）、`docs/evidence/v12/**` 入库（#12）、D9 的 14 项残留分类（#9）。

### 7.11 「能力三面」内联为仓库内门禁 `npm run verify:v12-feature-face`（r45g-docs01，自办、无需批复）

§7.10 的读数以两个独立实现互为对照为条件，而其中一路当时只住在仓库外 scratch（`db-probe/feature-face-r45g.cjs` / `bundle-symbols-r45g.cjs`）⇒ 与 §7.4 收口的同一类腐烂（判据外流）。本轮把它固化成 **D1–D5** 五条只读不变量（`tools/v12/verify-feature-face.cjs`，ROOT 可用 `AIR_ROOT` 覆盖以便负向对照副本跑）：

- **D1** 声明面计数 + 「默认集里不得出现未声明名」（`@cocos/ccbuild` 对未声明名**静默忽略**、产物逐字节不变 ⇒ 只能靠断言防，r43 已实测过一次）。与 `verify:v12-backends` A4/A5 故意重复：同一对面两路实现。
- **D2** 「`src/exports/*.ts` 文件名不是已声明 unit」的集合 = 登记的 **9** 个（`geometry-renderer` `gfx-webgpu` `graphics` `intersection-2d` `mask` `physics-framework` `sorting` `sorting-2d` `spine`）。
- **D3** `src/exports/air.ts` 的 27 条静态 `export *` 目标全部有对应文件；其中未声明却被聚合的 = 登记的 **8** 个，且 `gfx-webgpu` **不得**被聚合。
- **D4** **默认产物组成锁**（`build/cocosair.module.js` 在盘才查，缺件记 `skipped` 不判红）：在册能力符号整词命中 ≥1（`PhysicsSystem` `PhysicsSystem2D` `b2PhysicsWorld` `WebGL2Device` `AudioSource` `TiledMap` `Graphics` `Mask` `Sorting2D` `GeometryRenderer` `UIRenderer`），非默认后端的世界类整词命中 == 0（`BuiltinPhysicsWorld` `B2PhysicsWorld`）⇒ 把「默认 feature 集」与「发布 bundle 实际内容」钉在一起。
- **D5** README/§7 用来描述发行能力的**每个能力名**逐个复核其依据（在默认集 / 已声明未默认 / 符号确在产物）三者之一成立才算还在 ⇒ **F-129 同类的机器化防复发**：文档写 No 而产物有，下次就会红。

正向 + 五臂负向对照（对照脚本与日志均在仓库外 scratch，**绝对路径只登记在台账 `docs/audits/global-quality-audit-2026-09-19/findings.jsonl` 的 F-130 行**——发布面文档不写仓库外绝对路径，理由见 §7.11 末段与待批 #17；跑法：复制门禁所在子树到 scratch，副本显式钉 `AIR_ROOT` 环境变量指回真实仓库根，否则 `ROOT` 解析即失效）：
N0 原样副本 `EXIT=0`（证明钉法本身不改结论）；N1 默认集常量 26→25 / N2 未声明入口集合删 2 名 / N3 把 `spine` 改写成「未被聚合」/ N4 把 `TiledMap` 加进「不得出现」/ N5 把 `mask` 的依据改成「在默认集」⇒ **各 `EXIT=1` 且 `errorCount:1`，各只报自己那一层** ⇒ 五条断言均非恒真。
r45g 现读：`npm run verify:v12-feature-face` `EXIT=0`（`pg-probe/r45g-featureface.log`，`{"ok":true,...,"airEntryReExports":27,"bundle":{"status":"checked"},"errorCount":0}`）。

**顺带钉死的一条现读**（README「能力边界」与 §7.3 都引用它）：`WebGL2Device` 在默认产物整词命中 **6** 次 ⇒ F-129 不只是措辞问题，WebGL2 后端确实在发行物里；而 `WebGPUDevice` 只以 `cclegacy.WebGPUDevice` **动态查表**形式出现在 `game.ts` 的上游探测分支里（整词 2 次），WebGPU 设备类本体不在产物 ⇒ 与 `README.md` 「cc.d.ts 里有类型、产物里没有符号」那句不冲突，但引用时必须分清「类型名出现」≠「能力可达」。

**同轮自引入并已就地更正的副作用**（登记为 F-130 的自我更正半边，不另开条目）：本轮初次写 README/§7 时把仓库外 scratch 脚本当自查命令写进了**发布面**（`files[]` 含根级 `docs/*.md` 与 `README.md`）⇒ 包内消费者按该路径必然读不到，而 `verify:doc-refs` 的 S3 规则**结构性看不见**这类引用（`outOfRepo` 只登记、不判红；本轮 `skippedCounts.outOfRepo` 现读为 0 是因为反引号绝对路径不计入链接面，更说明不能拿它当这道病的探测器）。已全部改指本门禁，改后 `README.md` 与 `docs/01-web-feature-set.md` 两个文件的 scratch 路径命中数归 0。
⚠️ 同一毛病的**存量**不是本轮造成的：现读 `grep -rln "cocosair-scratch" README.md docs/*.md docs/manual/*.md UPSTREAM.md` → **16 个文件**（`docs/v12-*.md` 各篇笔记、`docs/acceptance-report-v12.md`、`docs/17-baseline-comparison.md`、`docs/v12-bundle-budget.md`、`UPSTREAM.md` 等）。这些属**历史 provenance 指针**，处置口径同 §7.9 那 30 条 v0x 证据路径（在文首声明「仅 provenance，不据此判证据在包内可得」）还是逐条内联为仓库内门禁，是 owner 决策（已登记 F-130 并升为待批 **#17**），本轮不擅自批量改写。

### 7.12 r45g-f130：把「发布面文档写了仓库外绝对路径」变成一条可复算的账（F-130 / 待批 #17）

§7.11 末段预告的两件事本轮落地：**F-130 已入台账**（`findings.jsonl` 第 130 行，行 sha16 链 `f3d863fc670bc2b7 → 6b4a1acc8704270d`，追加 `counts_followup_r45g` 后整文件 `982cf683b24b09ae → 2872d3d25fc015f6`）、**待批 #17 已入清单**（`docs/v12-owner-decisions.md` §2 表 + §3 落点各一行）。

**为什么这类引用是「不可见债务」而不是「门禁没跑」**：`npm run verify:doc-refs` 的 S3（仓库外绝对路径）注释承诺「只登记不判红，写进报告 `skipped`」，但实现在**候选收集**阶段就把 out-of-repo 字符串丢弃，所以报告里那个桶永远是 0——不是没有，是不进账。这不是读码推测：在仓库外搭一棵最小树（`tools/v12/` + 一篇只含两条**不存在**的盘符路径引用的 Markdown，一条反引号形式、一条 Markdown 链接括号形式），跑同一份门禁脚本 ⇒ `EXIT=0 / unresolvedCount 0 / skippedCounts.outOfRepo 0`（`NEGCTL-OK`）。⇒ 通则：**「注释承诺的 skip 类别」≠「报告里真有的计数」**，skip 也要有可读到的数，否则它就是一个永远不会长的洞。

**存量口径（编辑完成后现读，逐类 + 去重）**：scratch 取证目录 **16 文件 / 88 行**、cocos4 上游快照目录 **8 文件 / 18 行**、benchmark 的 `node_modules` 目录 **7 文件 / 11 行**；三类**去重合并 16 文件 / 115 行**。逐类相加是 117，与去重差 2 ⇒ 有 2 行同时含两类（`docs/v12-audio-notes.md:50`、`docs/v12-particle2d-notes.md:52`：同一行既写 benchmark 依赖的 `node_modules` 目录绝对路径、又写仓库外日志绝对路径）。复算命令就是这两条：`grep -rEln "<类>" README.md UPSTREAM.md docs/*.md docs/manual/*.md` 与 `grep -rEln "A|B|C" … | wc -l`。（本节刻意**不重复**那三个目录字面量——写出来就等于给被计数的那一类 +1，见下面第 3 条。）

**同轮抓到自己的三个方法学错误**（都不是假想，都是当场复测出来的）：
1. **把逐类相加当成去重结果**：#17 行初稿写「117 行、无一行同时含两类」，而 117 是 `88+18+11` 的和 ⇒ 与去重实测 115 差 2，正是上面那两行。⇒ 合并数必须用带 `|` 的正则现读，禁止由分项推和。
2. **`replace` 锚点不存在时静默空转**：一次更正脚本的第三个 `replace` 锚点（`待批 **#17**`）在本行根本不存在，Node 按语义原样返回，脚本照样打印 `OK` ⇒ 注记差点没写进去。发现路径是「字节增量 +134 与该锚点应产生的增量不符」→ 逐条 `grep -c` 复测 → 确认空转。⇒ 通则：**批量 replace 必须逐条断言锚点计数 = 1**，长度/哈希只能证明「写了别的」，不能证明「写了那条」。
3. 附带一条更隐蔽的：**为说明计数而把被计数的字面量写进文档**，会让该计数因自己这句话而 +1（本轮把上游快照目录的字面量写进 #17 ⇒ 该类 18→19，本行自述的「编辑完成后现读」当场失真）。修法是把指称写成不含字面量的形式，这也是本节刻意不写那三个完整前缀的原因。

**判据影响面（全为零改判定）**：`npm run verify:doc-refs` 复跑 `EXIT=0`（`ok:true / refsChecked 1047 / unresolvedCount 0 / staleBaselineCount 0 / skippedCounts {glob:52, external:0, outOfRepo:0}`——该桶仍为 0 是**门禁的缺陷**而非「债务为零」，见 F-130 (c) 案）；`npm run verify:v12-feature-face` `EXIT=0`；`npm run verify:consumer` `EXIT=1` 且 `failures` 仍只有 F-85 一条、`exportCount 574`、三产物 sha16 逐个未变（`35496aebda066ab5 / 8795c8685ace28a1 / 6d01c030d85bf86c`），tarball 随文档变动（**本子轮每次文档改动都会让它变**，故字节链只记在台账 `docs/audits/global-quality-audit-2026-09-19/findings.jsonl`，本节不留数字）。

**本轮不擅自批量改存量**：那 115 行多数是历史取证指针（截图 / 日志 / 上游快照文件），批量替换等于替历史结论换出处 ⇒ 交 **#17**。本轮只把自己写进发布面的 5 处改指仓库内门禁或换成可复算命令。

### 7.13 「V1.1 证据链完整性」内联为只读门禁 `npm run verify:v11-chain-face`（r45h4，自办、无需批复）

**建之前先证伪（§7.11 同一规矩）**：三引擎矩阵证据的字节货币**早就**是 jest 断言（`test/smoke/smoke-30-v12-regression.test.ts` 的「三浏览器矩阵证据字节货币」5 条：bundle 哈希、契约指纹、逐张截图字节+哈希、逐条 PASS ∧ checks 全真、契约覆盖率），所以矩阵侧不需要新轮子。真缺口在另一侧：现读 `grep -rln "v11-examples-verified" test/` ⇒ **0 命中**（同法查 `browser-matrix.json` 命中 `smoke-30`）。也就是说 `docs/evidence/v11-examples-verified.json`（52 例、`apiProofTotals 1004 verified / 129 attested / 0 unproven`）被发布面文档引用（r45h4 03:36Z 现读口径：`grep -rl "v11-examples-verified" docs/ README.md UPSTREAM.md | grep -v "docs/audits/" | wc -l` ⇒ **11 篇 / 25 处**；含 `docs/audits/**` 台账则是 43 篇 / 102 处，其中台账自己占 77 处 ⇒ **引用数会因"引用它"这句话而涨，只能按快照引用，别当货币**），并被 `tools/examples/coverage-report.cjs` 与 `tools/examples/spec-compliance-audit.cjs` 当输入消费，却**没有任何断言守着它自己**——删 `completed` 标记、清空 `results`、掺进一条 FAIL、混入第二个候选产物指纹，今天都不会让任何门禁变红。这就是 §7.11 说的「判据外流/无人守档」在证据面的镜像。

七条只读不变量（`tools/v12/verify-v11-chain-face.cjs`，零改产物、零启动浏览器；`--evidence=` 供负向对照、`--json` / `--out=` 供台账）：

- **V1 完整性标记**：`completed === true` 且 `partial === false`——缺标记即 NOT_RUN，子集跑不得冒充全量回归。
- **V2 计数自洽**：`runTotal === total === results.length` 且 `runTotal > 0`（**反空转**：0 条记录的"全部通过"不是绿）、`runPass + fail === runTotal`、`pass === runPass`。
- **V3 逐条结论**：`id` 唯一、`result === 'PASS'`、`errors` 为空数组。
- **V4 指纹绑定**：逐条 `candidateFingerprint` / `sourceFingerprint` 为 16 位十六进制、`specFingerprint` 为十六进制；全表 `candidateFingerprint` **恰 1 个不同值**且等于文件级字段（一条链里混两份候选产物＝记账错误）。
- **V5 取证自洽**：文件级 `apiProofTotals` **等于**逐条聚合；`unproven === 0`；`proof` 只允许 `verified` / `attested`。
- **V6 采集器来历**：`runner` 指向的采集脚本仍在盘、`mode` 非空 ⇒ 证据不是人写的旁证。
- **V7 时间戳**：`measuredAt` 可解析且不晚于当前时刻（+60 s 容差）⇒ 挡"未来日期"式伪造。

**刻意不做的第 8 条（边界，别读成"已绑当期产物"）**：本门禁**不**断言证据里的 `candidateFingerprint` 等于当前树现算值。那条等式一旦进门禁，任何 `src/` 改动都会当场拖红，并要求重采 52 例才能解锁（V1.1 链单引擎 ≈63 s/例 ⇒ 三引擎 ≈1.9 h），等于把"是否用重采预算换一条绑定门禁"变成既成事实 ⇒ 属 owner 决策面（与 F-132 修法 (c)、待批 #15/#21 同一张桌子上）。现算值只作为**信息**打印在 `live` 段（`{status, candidateFingerprint, matchesEvidence}`，不参与退出码）；要判"证据是否当期"，按台账里那份离线复算脚本现读：`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45h3-currency-audit.cjs`（读数同目录 `r45h3-currency-readings.json`，判据文字见 `docs/acceptance-report-v12.md` §2.1 的 UPDATE-r45h3）。

**负向对照十臂（`passCount 10 / 10`，各臂只报自己那一层且 `EXIT=1`）**：`P` 仓库外原样副本 `EXIT=0`（证明覆盖口本身不改结论）；`N1 completed=false` / `N2 partial=true` ⇒ 只 V1；`N3 total+1` / **`N4` 清空 `results` 并把四个计数与 `apiProofTotals` 一并归零**（⇒ 只剩反空转守卫可红，这是本臂存在的意义：若不同步归零，V5 会一起响，守卫就被掩盖） ⇒ 只 V2；`N5` 一条记录改 FAIL ⇒ 只 V3（聚合字段没动，只有逐条面看得见）；`N6` 一条记录掺第二个指纹 ⇒ 只 V4；`N7` 文件级 `apiProofTotals.verified` 少报 1 ⇒ 只 V5；`N8` `runner` 改成不存在路径 ⇒ 只 V6；`N9` `measuredAt` 改成未来 ⇒ 只 V7。变异副本与输出全部写在仓库外，门禁只读 ⇒ **零覆写 `docs/evidence/**`**（F-132 的落盘面纪律）。

**关系与后果**：这一条补上的是「在册证据不被静默改坏」那半边；「证据绑定当期交付物」那半边仍**无门禁**（F-82 类缺口，V1.1 链侧）。§2 护栏表已按此新增第 **17** 行，引用护栏条数时注意 r45h4 之前的「十六条」是当时口径。

**同轮自我更正（r45h4b，03:29Z；不另开台账条目，口径同 §7.11 末段）**：本节的报告落表脚本初跑**只落了 4 处中的 3 处**——§2.1 尾部那条 bullet 静默漏落。根因不是锚点没命中（锚点断言确实跑了并通过），而是那条计划被 `EDITS.pop()` 摘出去做「整行锚点」特殊处理后**没有放回被迭代的数组** ⇒ 循环、锚点断言、字节账、纯追加还原四件事**共用同一个 `plan` 来源**，于是「插入后字节 == 插入前 + 各条插入字节之和」对「某条计划压根没进 `plan`」零判别力（恒等式查不出漏项）。这是 §7.12 第 2 条「锚点不存在时静默空转」的**同族但更隐蔽**的一种：那次的判据（逐条 `grep -c` 复测）这次也照常执行并抓到了问题，但抓到的路径是**脚本文本自己打印的计划条数（3）与本轮声明的计划条数（4）不符**，而不是字节差值。⇒ 通则：**计划条数必须由循环外的字面量常量断言**，且结果校验不能只依赖被校验过程自己求出的中间量；批量落表的「独立性」来自判据与执行路径不同源，不来自断言写得多。更正由一次性单条脚本落地（`apply-accept-r45h4b.cjs`，仓库外；本报告的锁 `123,231 / 32ad69c1af9e21c3` 与逐条 `Buffer.byteLength` 判据照旧），报告现读 **123,613 B / 307 行**， sha16 与全部脚本路径登记在证据台账 r45h4 行的 `raw[]`／`commands[]`（上面那个 **123,613 B / 307 行**是 r45h4c 之前的快照，终值见台账行）。

**同轮第三处自我更正（r45h4c，写后自查）**：§1 LV12-20 的 r45h4 追加句里「对前 16 条仍成立」会被读成"本轮把 16 条又跑了一遍"，而实际本轮只**抽测** 4 条（`verify:v12-backends` / `verify:v12-feature-face` / `verify:doc-refs` / 新第 17 条 `verify:v11-chain-face`，四条全 `EXIT=0`），其余 12 条沿用 **r45h 01:44–02:05Z 全量复跑**的当期值 ⇒ 已在报告原句后补「读数出处澄清」，并把「16 绿 / 1 红」显式标成「最近一轮全量 + 本轮抽测」的**合成口径**。⇒ 通则：**"当期绿"必须能答出是哪一轮跑的**，否则就是替别的轮次宣据（与 §7.10「读数以何为准」、覆盖率数字须声明口径/分母/日期同一条规矩）。

## §8. 批复落地与证据重采（r46，2026-09-24）

Owner 批复「按照建议执行，确保最优」逐条登记见 `docs/v12-owner-decisions.md` §4。对本文 §4 残留差集的影响：

- 14 项 D9 残留全部按建议豁免（#1c/#2b/#3a/#4b），总登记 `UPSTREAM.md` Deviation-06；§4 表的「需逐个分类后方可判定」状态终止于「已批复结案」。
- r46 独立核查补点名的 4 个非 jsb 平台/编辑器变体（`pipeline-state.editor.ts` / `index.ems.ts` / `native-binding/decorators.ts` / `lod-group-editor-utility.ts`）一并入 Deviation-06。
- **#8(a) 触发 §12 全量重采**：`physics-cannon` 入默认集 + `examples/physics-3d-collision` 新例 ⇒ bundle sha、36 条 V1.2 矩阵记录、52 条 V1.1 记录的 `candidateFingerprint` 全部换血；新基线以重采后的 `docs/evidence/v12/browser-matrix.json` 与 `docs/v12-bundle-budget.md` r46 行为准，本文不再追改历史读数（各 § 小节的旧读数保留为当轮快照）。
