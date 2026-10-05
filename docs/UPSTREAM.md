# UPSTREAM

本项目 `cocosair.js`（Cocos AIR）的源码基线来自 Cocos 引擎（cocos4）本地完整快照。

2026-10-02 文档命名整理同步更新 AIR 自有 `air-spine-instantiate-js.ts` 的资产部署提示和 `emscripten-assets.d.ts` 的说明引用，使用 `docs/notes/spine-asset-sourcing.md`、`docs/notes/physics-asset-sourcing.md`。此改动仅调整文档路径，不改变资产部署要求或后端行为。

## 基线标识

2026-10-05 响应式宿主适配：通过 `tools/build/screen-layout-patch.cjs` 在 PAL 生成流程中应用实测布局尺寸去重、ResizeObserver 合并、隐藏恢复和关闭清理；冻结 `vendor/pal-source/` 保持原字节。沿用原生 window-resize → View → Root 链，不新增输入坐标系统。AIR 启动新增可选 screenMode/container，未指定时保持原生 settings 默认；新增 Label helper 换行参数不改变 Label 默认行为。

| 项 | 值 |
|---|---|
| Upstream package | `cocos-creator` |
| Upstream version | `4.0.0-alpha.34`（V0.1 抽取时为 `4.0.0-alpha.33`） |
| Upstream creator field | `3.8.8` |
| Upstream repository | https://github.com/cocos-creator/engine |
| Baseline Date | 2026-09-12（alpha.33 快照）→ 2026-09-19（alpha.34 对齐，V1.2 G0） |
| Upstream commit SHA | 工作副本 HEAD `557b06f7e636572a15a426eb8c2387f40b92798a`；**V1.2 冻结对齐点 `fffd9a514a`（bump to 4.0.0-alpha.34）** |

## V1.2 G0 基线升级记录（2026-09-19/22）

1. `cocos4` 现为**有完整历史与 remote 的 git 仓库**，Deviation-01 关闭。
2. alpha.33 → alpha.34 触及 `cocos/` 的提交实测 **4 个**（V1.2 计划书 §2.1 原记 2 个，已修正）：
   `60f9352c56` #336 createMesh 索引格式自适应、`6b455561f4` #338 noise 优化、
   `f66365f959` #334 TerrainInfo `@visible(false)`、`2a75cfb9da` #329 webgpu pipelinelayout 顺序。
3. 冻结点后 HEAD 另有 `b46553e615` #341、`557b06f7e6` #343 两个提交，均标注 native platform，
   按计划书 R7「V1.2 期间冻结对齐点」不追。
4. 漂移修复执行：`src/cocos/3d/misc/create-mesh.ts`、`src/cocos/particle/noise.ts` 已从上游逐字节复制对齐；
   `src/cocos/rendering/custom/web-program-library.ts` 实测此前已一致。详见 历史记录（v12-upstream-regression.md，已清理）。
5. 全量比对脚本化：`node tools/compare/baseline-compare.cjs [--upstream <dir>]` → build/reports/baseline-compare.json。

## Deviation-01: 上游 commit SHA 不可得 —— **已关闭（2026-09-19，V1.2 G0）**

- 原现象：本地目录为一次性下载的上游源码快照，随后才 `git init`，无 commit / 无 remote。
- 关闭依据：`cocos4` 现具备完整 git 历史，可解析 `git rev-parse HEAD` = `557b06f7e6`，
  且 alpha.33 / alpha.34 的 bump 提交（`7f806abad6` / `fffd9a514a`）均可定位。
- 后续报告与提交说明改用：`cocos4 @ 4.0.0-alpha.34 (commit fffd9a514a)`。

## Deviation-02: `cocos/root.jsb.ts` 不抽取（V1.2 决策点 D4，批次 F-2）—— **豁免登记**

- 上游事实：`cocos/root.jsb.ts` 是 `cocos/root.ts` 的 **native(jsb) 入口变体**，由 `cc.config.json`
  的 `moduleOverrides`（`test: context.buildTimeConstants.NATIVE`）在 native 构建时整体替换 `root.ts` 等入口；
  其代码依赖 `jsb` / `cc.*` native 绑定全局符号。
- Air 口径：Air 为纯 Web 闭包（计划书 §1.3 排除全部 54 个 `*.jsb.ts`；护栏 5 要求「回归文件不得引入 native/minigame 闭包，
  54 个 jsb 变体依旧零进入」）。抽取该文件不会进入任何 Web feature unit 的闭包，只会把 `jsb` 符号面引入仓库，
  并被 `tools/verify/verify-web-only.cjs` 判为违规。
- 处置：**不抽取**，作为 §1.1 回归组 12 的约定豁免。可复核证据：
  `node tools/compare/baseline-compare.cjs` → 旧版基线差集报告（已清理）
  的 `upstreamOnlyByCategory["platform.jsb-variant"]`（54 项，含 `cocos/root.jsb.ts`）。
  同步登记于 历史记录（17-baseline-comparison.md，已清理） §9.2。
- 复议条件：若评审要求「12/12 物理对齐」，则按计划书备选口径原样复制且不接线（零风险），需另行授权。

## Deviation-03: 上游零引用者文件按原文落位但不接线（V1.2 批次 F-1）

- 计划书 F-1 要求 `cocos/deprecated.ts` 抽取后「在 exports/base 或独立出口中按官方引用方式挂接」。
- 实测上游 `4.0.0-alpha.34`：`cocos/deprecated.ts` **零引用者**（`grep -rn "cocos/deprecated"` 在
  `cocos/`、`exports/`、`typedoc-index.ts`、`cc.config.json` 均无 importer；该文件最后触及提交为 2023 年 `afd22296b4`）。
  官方 Web 构建因此同样不含它注册的 `Root.prototype.ui → batcher2D` 别名。
- 处置：文件按官方原文逐字节抽取并登记（满足 §1.3 差集口径），**不新增 feature unit、不接线**——
  「官方引用方式」即无引用。运行语义在 `test/smoke/smoke-30-v12-regression.test.ts` 的 F-1 项验证：
  显式 import 后别名 getter/setter 生效、除注册警告外无其他副作用。
  同类情形：`cocos/serialization/deserialize-dynamic-empty.ts`（见 §9.2 `needs-decision.unreferenced-upstream-file`）。

## Deviation-04: gfx-webgpu 子图「已抽取、未接线、暂不类型核对」（V1.2 批次 E / 决策点 D10）—— **部分交付 + 待确认**

- 已完成：`cocos/gfx/webgpu/**`（24）+ `cocos/webgpu/instantiated.ts` + `exports/gfx-webgpu.ts` 共 26 文件按官方原文逐字节抽取
  （`node tools/analyze/import-upstream-group.cjs --group E1 …` → `wrote 26/26; byte-identical 26; DIFF 0; MISSING 0`），并已登记进
  `docs/extraction-manifest.json` 与 `docs/upstream-file-map.json`；类型面补上官方逐字节 `@types/webGPU.d.ts`（3258 行）。
- 受阻事实（三条，均可复现，证据见 `docs/evidence/browser-matrix/d10/README.md`）：
  1. **上游引用图本身不经过 Web**：`cocos/gfx/index.ts`（web 变体）对 webgpu 零引用，唯一接线者是 `cocos/gfx/index.ems.ts`
     （emscripten 平台变体，与 54 个 `*.jsb.ts` 同类，按 §1.3/护栏 5 不抽取）。
  2. **运行时与类型资产不在基线快照内**：`cocos4/native/external/` 整个目录不存在，`webgpu_wasm/glslang/twgsl` 的 `.js/.wasm`
     与配套 `.d.ts` 需上游 `npm run update:native-external` 联网拉取。因此 Air 侧 `npm run typecheck` 命中 12 条硬错
     （`TS6053` / `TS2307 external:emscripten/webgpu/*` / `TS1343 import.meta` / 上游 `webgpu-define.ts:39` 的 `import { warn } from 'console'` 笔误 /
     `TS2550 matchAll·at` 需 `lib≥es2020`），变体构建 `exit=1`（`Could not load external:emscripten/webgpu/glslang.js … ENOENT`）。
  3. **上游自身在本快照内也无法核对**：`cocos4` 里跑 `tsc -p tsconfig.json --noEmit` → `exit=2`，10×`TS2688`（含 `./native/external/emscripten/webgpu/webgpu`、
     `./@types/consts`），说明「与上游对等的 gfx-webgpu 类型面」在快照内无参照物。
- Air 处置：**两处**按上游引用图对等豁免，且都写成可复跑断言——① 根 `tsconfig.json`（Air 自有）三项 exclude 移出类型核对；
  ② `src/tsconfig.json` 同名三项 exclude 移出发布声明图（实测 `dtsBundler` 会把 `exports/**` 全量收进 d.ts，
  于是未接线的后端在 `cc.d.ts` 里凭空多出 `export class WebGPUDevice`，而默认 bundle 导出表没有它 → 类型/产物不一致，+60,649 B）。
  `cc.config.json` 的 `features["gfx-webgpu"]` 登记也因此**回退**（登记即并入发布类型面）。
  **未写任何替代实现、未放宽 `lib`/`module`**。豁免范围由 `smoke-30`「批次 E / D10」三条断言锁定
  （exclude 清单精确匹配、子图外零引进口、抽取件仍在簿记内），不允许静默扩大。
- 交付面零影响（护栏 7，逐字节）：批次 E 前后三份发布产物完全不变 ——
  dev `6,081,668 B` / sha256 `35496aebda066ab5…`，min `3,499,182 B` / `8795c8685ace28a1…`，
  d.ts `3,082,360 B` / `sha256sum -c` OK；`npm run typecheck` 与 `npm run verify:web-only` PASS。
- 待确认（D10）：三选一 —— (a) 授权联网拉取第三方 emscripten 资产（`glslang/twgsl/webgpu_wasm` 的 js+wasm 及配套 d.ts）入 `src/native/external/emscripten/`
  并做许可审计，再补 `WEBGPU=true` 常量通道与 `device` 探测链路；(b) 手写类型替身 + 放宽 `module/lib` 以强行让子图入核对（与 §1.1「不得手写替代」冲突，不推荐）；
  (c) 批次 E 以「抽取完成、运行面按官方平台变体口径豁免」结案。计划书要求豁免须「可复核理由并经确认」，故本项在得到答复前不计入验收通过。

## Deviation-05: 三个 wasm 后端子图「已抽取、未接线、暂不类型核对」（V1.2 批次 D-4 / G-3，决策点 D3 / R8）—— **部分交付 + 待确认**

- 已完成：`cocos/physics/bullet/**`（30）+ `cocos/physics/physx/**`（26）+ `cocos/physics-2d/box2d-wasm/**`（23）+
  `exports/physics-ammo.ts` / `exports/physics-physx.ts` / `exports/physics-2d-box2d-wasm.ts` 共 **82** 文件按官方原文逐字节抽取，并已登记进
  `docs/extraction-manifest.json`（1196 → 1278）与 `docs/upstream-file-map.json`（1233 → 1315）：
  `node tools/analyze/import-upstream-group.cjs --group G3-physics-bullet-physx --features physics-ammo,physics-physx --prefix cocos/physics/bullet,cocos/physics/physx --exports physics-ammo,physics-physx`
  → `wrote 58/58; byte-identical 58; DIFF 0; MISSING 0`；`--group D4-physics-2d-box2d-wasm` 同型 → `24/24 byte-identical`。
  `npm run verify:file-map` PASS（`rows=1315 manifest=1278`）。上游第 83 个种子 `cocos/physics/physx/instantiate.jsb.ts`
  按 §1.3 / 护栏 5 **零进入**（`regress.cjs` 自动 skip，且 `smoke-30` 断言磁盘上不存在该文件）。
- 纳入范围按闭包实测而非推断：83 个种子沿静态 import 求传递闭包 = 上游 764 文件，其中 **678** 已在 Air 且逐字节一致、
  **3** 为「已在 Air 但与上游不同」（`cocos/core/platform/debug.ts`、`cocos/core/utils/path.ts`、`cocos/rendering/global-descriptor-set-manager.ts`，
  均为 upstream-file-map 在册的 Air 修改）、净新增恰为 83 个种子 ⇒ **零连带扩面**。
- 受阻事实（与 D10 同因）：三后端的**类型面与运行时资产同源同缺** —— 上游根 `tsconfig.json` 的 `types[]` 指着
  `./native/external/emscripten/{bullet/bullet,physx/physx,box2d/box2d}.d.ts`，该目录不在基线快照内（需上游 `npm run update:native-external` 联网拉取）。
  实测把子图纳入类型核对时 `npm run typecheck` 从 0 红到 **118**：`Cannot find namespace 'Bullet'` ×35、
  `Namespace 'B2' has no exported member …`（box2d-wasm 合计 74 条）、`Cannot find module 'external:emscripten/{bullet,physx}/…'`、
  `Cannot find namespace 'PhysX'`、`Cannot find name 'FilterData'`。上游自身在同一快照内跑 `tsc -p tsconfig.json` 亦 `exit=2`，
  即「与上游对等的 wasm 后端类型面」在快照内无参照物。
- Air 处置：与 Deviation-04 同因同治，**两处** tsconfig（根 `tsconfig.json` 与 `src/tsconfig.json`）各加 6 项 exclude（3 子树 + 3 exports 入口），
  **未写任何替代实现、未写 `any` 垫片、未放宽 `lib`/`module`/`types`**。与 Deviation-04 不同处：`cc.config.json` 的
  `physics-ammo` / `physics-physx` / `physics-2d-box2d-wasm` 三个 feature unit 按上游原文**保留声明**——因 `src/exports/*.ts` 已移出发布类型图，
  实测 `cc.d.ts` 逐字节未增长，不会重演「类型面凭空多出未接线后端」。三者也未进 `tools/build/build.cjs` 的默认 `AIR_FEATURES`。
  豁免范围由 `test/smoke/smoke-30-v12-regression.test.ts`「批次 D-4 / G-3」三条断言 + 精确锁定的 exclude 清单钉住，不允许静默扩大。
- 交付面零影响（护栏 7，逐字节）：抽取前后三份发布产物完全不变 ——
  dev `6,081,668 B` / sha256 `35496aebda066ab5…`，min `3,499,182 B` / `8795c8685ace28a1…`，d.ts `3,082,360 B` / `6d01c030d85bf86c…`；
  `npm run typecheck` EXIT=0、`npm test` 全绿（抽取当轮 r45c 为 31 套件 / 255 用例；补上本条末尾的 smoke-32 后，
  r45d 整表复跑为 **32 套件 / 261 用例 / 0 failed**，`E:/AIProMax/cocosair-scratch/pg-probe/r45d-jest.log`，
  清单已 `--update` 回填并经 `verify:test-inventory` 校验 EXIT=0）、`build` 与 `build:min` EXIT=0
  ⇒ 36 条三引擎矩阵记录与 51 条 V1.1 记录的产物绑定继续有效。
- 「未接线」的边界（免误读）：只指**默认发行面**不含这三族；**测试面**由 `test/smoke/smoke-32-wasm-fallback.test.ts` 6 条直接驱动三族 loader
  （`jest.mock(..., {virtual:true})` 顶掉 `external:emscripten/**` 九个说明符，控 `NATIVE_CODE_BUNDLE_MODE` 与 `sys.hasFeature` 两条开关），
  已把 **asm.js 兜底一支**从「零用例」变为可复跑断言：ASMJS 恒走兜底、BOTH 按能力探测、WASM 成对请求 `.wasm.js`+`.wasm.wasm`、
  bullet 仅 wasm 支写 `globalThis.Bullet`、physx 的 asm 用 `Object.assign` 而 wasm 重绑定 `PX`、asm 工厂为 null 时早退不改写 `bt`、
  三族在未开 `LOAD_*_MANUALLY` 时常驻挂在 `game.onPostInfrastructureInitDelegate`。此法**不引第三方资产、不改 `jest.config.js` 的 `moduleNameMapper`**，
  其余既有用例不受影响（全量计数以 `docs/test-inventory.json` 为准，r45d 为 32 套件 / 261 用例）。运行级**真实出图**（三引擎矩阵）仍卡 #10 的资产缺口。
- 待确认（D3 / R8，见 `docs/reference/owner-decisions.md` §2 #10 与 §2.1）：本行只覆盖**编译面**的处置。运行级取证
  （box2d-wasm / ammo / physx 三示例 × 三引擎矩阵）仍卡在同一资产缺口——`external:emscripten/**` 既不在上游快照也不在上游 git
  （`git ls-files external` 仅 11 文件，Air 11/11 逐字节镜像），且 `@cocos/box2d@1.0.2` 包内 `.wasm` 计数为 **0**，
  故计划书 D3「来源 = @cocos/box2d 包内资产」前提为假（明细 `docs/notes/physics-asset-sourcing.md`）。三选一：
  (a) 按计划书自带默认 D8 口径结案（代码回归 + 选择器可达 + 降级路径可测 = 部分通过、显著标注、不阻塞 Gate）；
  (b) 从官方 npm/CDN 引入 wasm 资产入发行物（需许可登记 + `verify:licenses` / `verify:web-only` / bundle 预算三处门禁同步改 + 全量重采）；
  (c) 记「不达」。答复前 LV12-14 / LV12-16 不计入验收通过。
- 自办欠账进度：**~~`asm.js` 兜底分支零用例~~ 已收口**（r45c 写就 `test/smoke/smoke-32-wasm-fallback.test.ts` 6 条 / r45d 整表复跑 + 清单回填，见上一条）；
  **~~scratch 判据脚本随文件系统即失~~ 部分清偿**（r45d 新增正式门禁 `npm run verify:wasm-backends` = `tools/verify/verify-wasm-backends.cjs`，
  把 `wasm-backend-closure` / `closure-unresolved-detail` / `feature-units` / `physx-count-recon` 四份一次性判据固化成六条只读不变量：
  A1 闭包 764 文件（除 1 个 jsb 变体）全部落盘、A2 seed/闭包/jsb 集合/默认 `AIR_FEATURES` 数未漂移、
  A2 seed 内相对说明符零条解析不到上游、A3 闭包内字节偏差集合 ⊆ 在册 3 项、A4 `external:emscripten/**` 仍是登记的 9 个且只出现在动态分支、
  A5 feature 声明面 34/55/22 + `airOnly=["air"]` + 三后端定义与上游逐字段相同且不进默认集、
  A6 上游 `types[]` 一旦能解析到 `{bullet,physx,box2d}` 声明即判红 = **Deviation-05 的解禁触发器**（对应 owner #14 候选 (b)）。
  r45d 现读 `verify:wasm-backends` **EXIT=0**（`{"ok":true,"seeds":83,"closureTotal":764,"airByteIdentical":760,"drifted":3,"specs":9}`）；
  负向对照（仓库外副本改常量）EXIT=1 且两条断言各自起火 ⇒ 门禁非空转。判据脚本仍在 scratch 的其余项：`lv12-16-attribution` / `physx-which-file` / `check-doc-refs`。
- **UPDATE-r45f（上一行末的「仍在 scratch 的其余项」自本行作废）**：`verify:wasm-backends` 增至**七条**（新增 **A7「物理后端子树缺件必须登记在 旧版基线差集报告（已清理） 差集任一桶内」**，
  子树 = `SEED_DIRS` + `cocos/physics/cannon` + `cocos/physics-2d/box2d`；`SEED_DIRS` 另断言非 jsb 缺件数 = 0）。r45f 现读 `EXIT=0`
  （`{"ok":true,"seeds":83,"closureTotal":764,"airByteIdentical":760,"drifted":3,"specs":9,"subtreeUnregistered":0,"registeredFace":96}`；
  子树计数 `bullet 30/0/0`、`physx 27/1/0`、`box2d-wasm 23/0/0`、`cannon 20/0/0`、`box2d 22/0/0`，physx 那条 1 即 **Deviation-02** 的 jsb 变体不抽口径下的 `cocos/physics/physx/instantiate.jsb.ts`）；
  A7 负向控制三份（`pg-probe/negctl-a7*.cjs`：删在册差集条目 / 塞不存在的子树 / 仅钉 ROOT 的阳性对照）→ 前两份 EXIT=1 各报 A7 红项、阳性 EXIT=0。
  同轮新增两份只读门禁、均不改任何既有判定阈值：`verify:doc-refs`（文档互引棘轮，登记 46 条历史断链为 LV12-21 债务 = F-127）、
  `verify:custom-exports`（LV12-17「custom 导出面一致」半项：两个 `src/exports/custom-pipeline*.ts` 与上游逐字节同、
  `cocos/rendering/post-process` 34/34 与 `cocos/rendering/custom` 25/26 逐字节同且逐张登记在 `docs/upstream-file-map.json`）。

- **UPDATE-r46（2026-09-24，Deviation-04 / Deviation-05 结案注记）**：owner 批复 #7=(b)、#14=(a)、#10=(a)（见 `docs/reference/owner-decisions.md` §4）
  ⇒ 两个 Deviation 的「待确认」升级为**已批复结案**：gfx-webgpu 维持「三浏览器回退探测证据」交付档（firefox/webkit 探测腿 r46 补齐）；
  三个 wasm 后端维持「已抽取、未接线、暂不类型核对」豁免（#8(a) 只把 builtin + cannon 接进默认集，不触及本豁免面）；A6 解禁触发器保持有效。

## Deviation-06: D9 残留差集显式豁免（V1.2 批次 F-3 收口 / owner-decisions #1–#4）—— **豁免登记（已批复 2026-09-24）**

Owner 批复「按照建议执行，确保最优」，`docs/reference/scope-decisions.md` 全部 14 项残留按**文件**口径显式豁免，不纳入 V1.2：

- **A 组（7 个 `exports/*.ts` 入口门面）**：`affine-transform` / `rich-text` / `ui-skew` / `light-probe` / `xr` / `particle` / `vendor-google`。
  理由链：实现均在树内（vendor-google 除外，另含第三方 Google Cast SDK 许可面）；各差 1–26 行 re-export 门面；
  纳入即改产物字节 ⇒ 触发全量证据重采；xr 在 headless 三引擎矩阵下不可取证。
- **B 组（`cocos/particle/animator/optimized-curve.ts`）**：3D 粒子半纳入态的最后 1 个实现文件，随 A-7 门面同批豁免。
- **C 组（terrain，5 文件 / 3334 行）**：闭包自封（簇外零静态引用者），不纳入不使任何已纳入文件失去依赖；计划书 16 组未列该子系统。
- **D 组（`cocos/serialization/deserialize-dynamic-empty.ts`）**：上游零引用桩（全仓无 importer、两侧 config 无该映射），不纳入零功能损失。
- **平台/编辑器变体点名补全（r46 独立核查）**：`cocos/gfx/base/pipeline-state.editor.ts`、`cocos/gfx/index.ems.ts`、
  `cocos/native-binding/decorators.ts`、`cocos/rendering/lod-group-editor-utility.ts` —— 非 `*.jsb.ts` 形态的平台（ems）/编辑器（editor）变体，
  并入本豁免口径，补全 §1.3「其余 54 个 `*.jsb.ts`」的文字缺口（r46 实测：`cocos/` 树官方独有 87 = jsb 77 + 上述 4 + D9 已分类 6 个具体路径）。

本豁免不改变「抽取件与官方逐字节」护栏；`verify:wasm-backends` A6 解禁触发器保持有效。

## 发布面 provenance 声明（F-130 / owner-decisions #17）

本文档及发布面 `docs/*.md` 中出现的盘符绝对路径（本机取证 scratch 目录、上游快照 `cocos4` 目录、benchmark 目录）
**不随 npm 包发布、不保证对收件人可复现**；可复现判据一律以仓库内 `npm run verify:*` 系列门禁为准。

## Intentional AIR adaptation: configurable Web DPR cap

`src/pal/screen-adapter/web/screen-adapter.js` retains the upstream default cap of 2, while adding the host override `window.__CCDPR_CAP__` for deployments that need a different fill-rate/clarity tradeoff. The value is read before the adapter scales `windowSize`; invalid or non-positive values fall back to 2. Input-coordinate conversion and safe-area scaling continue to use the same `screenAdapter.devicePixelRatio` getter.

The override must be assigned before importing the engine. The usage and pixel-unit contract are documented in [docs/manual/responsive.md](manual/responsive.md) §3. This is the single intentional PAL byte difference; `docs/upstream-file-map.json` marks it modified and `test/smoke/smoke-30-v12-regression.test.ts` checks that no other PAL file drifts.

## Intentional AIR adaptation: `preserveDrawingBuffer` on both WebGL backends

Historical dual-backend scope: since the owner decision of 2026-09-30, only WebGL 2 is
supported in the browser runtime. The WebGL 1 source modification below is retained as
extraction provenance and is excluded from the default bundle.

`src/cocos/gfx/webgl/webgl-swapchain.ts` sets `preserveDrawingBuffer: true` (AIR, 2026-09-12) so Code First pages remain pixel-readable for debuggers, verifiers and `canvas.toDataURL()` capture after the frame is presented. `src/cocos/gfx/webgl2/webgl2-swapchain.ts` now matches (AIR, 2026-09-28): the original change had missed the WebGL2 `getContext`, so on the WebGL2 backend any readback outside the `AFTER_DRAW` window (after a window resize, while paused, or from a timer) returned a black canvas while WebGL1 kept the last frame. The WebXR branch keeps the upstream `false`. Both files are marked modified in `docs/upstream-file-map.json`; the regression is locked by `tools/verify/capture.cjs` (resize/paused phases must stay non-black on both backends).


## Intentional AIR adaptation: host canvas override (`__CC_CANVAS__`)

The Web PAL input sources (keyboard/mouse/touch) and the screen adapter resolve the game canvas once, at module-evaluation time, via `document.getElementById("GameCanvas")`. AIR adds an element-reference override read before that lookup: assigning `globalThis.__CC_CANVAS__ = <canvas>` **before importing the engine** binds input and screen adaptation to any canvas regardless of its DOM id, without renaming user DOM. Affected files: `src/pal/input/web/{keyboard,mouse,touch}-input.js` and `src/pal/screen-adapter/web/screen-adapter.js` (the adapter also keeps the `__CCDPR_CAP__` override above). The screen adapter now throws a specific import-time error when neither binding is available. `createAirApp` additionally rejects a conflicting `#GameCanvas`, leaves custom IDs unchanged, and defaults `tabIndex = 0` so PAL click/touch auto-focus can receive keyboard events. Regression locked by `tools/verify/canvas-binding.cjs` (classic / any-id-via-override / decoy-conflict / unbound-import modes).

## 基线快照统计（2026-09-12）

| 项 | 值 |
|---|---|
| `cocos/` TS 文件 | 1251（其中 `*.jsb.ts` 54） |
| `cocos/` TS 行数 | ~314,009 |
| `editor/` TS 文件/行数 | 33 / ~5,515 |
| `exports/` 导出入口 | 47 个 `.ts` |
| `native/` 体积 | ~855 MB（不入 Air） |
| 源码状态 | 全部文件为 untracked 快照，无本地修改历史可考 |

## 约定

1. 不执行 `git clone / pull / checkout`；不改动上游文件内容（除计划书明确允许的 Extraction 动作）。
2. 所有后续报告、提交说明引用基线时使用：
   `cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`。
3. 上游文件与 Air 文件的对应关系记录在 `docs/upstream-file-map.json`。

## Intentional AIR adaptation: WebGL 2-only target environments

Owner decision (2026-09-30): WebGL 1 is no longer supported. The default build drops
`gfx-webgl`; its feature declaration is removed and `src/exports/gfx-webgl.ts` is
an inert retained provenance entry. `src/cocos/gfx/device-manager.ts` requires a
successfully initialized WebGL 2 device for browser rendering and throws
`WEBGL2_REQUIRED` instead of falling back to WebGL 1 or EmptyDevice. Explicit
HEADLESS remains supported. Both extracted files are recorded as modified in
`docs/upstream-file-map.json`. The legacy backend source remains in the extraction
tree but is not exported or shipped in the runtime. AIR builtin registration no longer
generates WebGL 1 shaders. Current positive W01/W03/G4 probes are WebGL 2-only, with
startup rejection and HEADLESS verified by `tools/verify/webgl2-only.cjs`.

Current feature counts: 33 declared AIR units, 55 upstream units, 23 upstream-only
units, one AIR-only unit, 26 default features. Historical counts in earlier sections
remain snapshots; the current invariant gates use this approved support policy.

See [browser support policy](webgl2-only.md) for validation and release-evidence requirements.

## 分析报告清理（2026-09-30）

旧版基线差集和依赖图快照已移出 docs。比较工具默认输出 build/reports/baseline-compare.json；依赖图默认输出 build/reports/web-dependency-graph.json。登记数据仍由 extraction-manifest 和 upstream-file-map 保存。

WASM 门禁 A7 改为现场比较五个物理后端子树，仅允许 EXPECT.jsbInClosure 列出的具体 JSB 文件缺失；其他缺件必须失败。更新报告不会扩大排除集合，旧版报告中的 registeredFace 读数仅为历史记录。

## TTF shadow geometry — E-RICHTEXT-SHADOW-KERNEL-001

AIR modifies cocos/2d/assembler/label/{text-output-data,text-processing,ttfUtils,ttf}.ts to keep TTF logical content dimensions separate from shadow visual overflow. Overflow.NONE and RESIZE_HEIGHT render the full integer canvas at its font scale; shadow-only margins offset the quad and drawing origin without changing UITransform layout dimensions. RESIZE_HEIGHT reserves horizontal shadow margins without changing wrapping width. CLAMP/SHRINK retain fixed-box behavior. Anchor-only vertex updates use the same bounds.

This preserves RichText segment advance, wrapping and alignment without a RichText-specific position patch or a new SDK export. Padding uses the existing outline/shadow union, including positive and negative offsets; it is not an independent 2*blur+abs(offset) estimate. Regression: test/smoke/smoke-33-label-shadow.test.ts and tools/debug/probes/label-shadow-probe/. Browser test runtime may include source RichText through tools/verify/build-label-shadow.cjs; default SDK export policy is unchanged. Multiline shadow text is painted once instead of being overpainted by both effect and text passes. Auto-sized quads also honor canvas integer dimensions when shadow is disabled, preventing a sampling-scale jump on shadow toggles.

## PAL public-source replacement (2026-10-01)

Core cocos4 remains pinned to alpha.34 / 557b06f7e636572a15a426eb8c2387f40b92798a. PAL alone now derives from the public MIT parent 9f0e30acb31f6d670f2c0bf818d61039846a2860 of the private-repository move db5462603e20d5fa56814380274ad475bf388fb2. This is a distinct, explicit source baseline; it does not relicense the retired UNLICENSED npm package.

38 frozen TS inputs in vendor/pal-source generate 38 JS files plus audio/type.d.ts. The manifest pins SHA-256, Git blob identity and TypeScript 4.9.5. tools/build/pal-source.cjs reproduces all outputs and notices; verify:file-map and verify:licenses consume this check. All derived rows are marked modified in upstream-file-map with their public source path. LICENSE_pal.txt and NOTICE_pal.txt retain the root grant and original source notices.

Five sources have host adaptations: env/web/env.ts now returns __CC_CANVAS__ from findCanvas, the three Web input sources use the same binding, and screen-adapter preserves binding/DPR and explicit unbound rejection. The env change fixes an existing omission: input/screen binding alone did not give game.init the custom canvas. W04 now verifies actual framebuffer pixels rather than an unconditional success assertion.

## Competitive runtime contracts

Material and Pass uniform setters now validate types, finite shader components and array capacity before writes. Native Color/Quat/vector/matrix values and partial uniform-array updates remain supported. Component Light uses Color; rendering Light uses Vec3. Both color contracts and temperature setters are validated without changing that distinction. The internal property-validation helper has no AIR bootstrap dependency.

CallbacksInvoker restores invocation state with finally and preserves ordinary EventTarget rethrow behavior. Input specializes the callback hook to report and isolate listener failures. UI pointer dispatch depth and terminal touch claims also recover after exceptions. Mouse/touch location methods consistently validate and reuse declared Vec2 outputs.

createMesh uses nullish defaults so POINT_LIST=0 survives static and dynamic construction. Rendering still uses explicit effect pass topology; this adaptation does not claim a mesh-only topology coordination API.

Changed paths are registered in upstream-file-map. The competitive uniform/input/point smoke tests, development GPU probe and point-cloud/orbit examples provide acceptance beyond field assignment. Current verification and open work are recorded in the [execution ledger](../ai/ledgers/competitive-benchmark-remediation.md).

PixelFormat adds SRGB888/SRGBA8888 names for existing GFX sRGB formats, preserving old enum values. These opt-in formats perform hardware sampling decode; standard effects retain their software decode, so callers must not combine both paths. GPU acceptance covers equivalent color inputs, row orientation, alpha and linear normal data in three browsers.

EffectAsset early registration also differs between source/headless and full Web bundles. Before a device exists, the full bundle may expose the effect-import library that game.init later disables for the legacy configuration. AIR now registers effect metadata immediately and defers program registration until renderer initialization, selecting the active library at that time. Destroy removes pending callbacks. This keeps legal early onLoaded calls usable instead of requiring a blanket prohibition; dedicated tests cover both library choices and a full-bundle browser probe verifies actual drawing.

## Port diagnostics (PG-18)

`cocos/core/platform/debug.ts` adds an internal explicit warning/error subscription, including native numeric diagnostic IDs. Logging keeps the original console filtering; observer exceptions and recursive observation cannot interrupt native calls. AIR bootstrap exposes an 80-entry bounded, deduplicated channel, defaults to errors, and offers `diagnostics: 'warnings'` to enable native warnings. The separate debug session subscribes to that channel without console or WebGL monkey patches. This change does not classify normal culling or automatic skinning transport as failures. Verification and remaining diagnostic boundaries are tracked in the [port ledger](../ai/ledgers/port-gap-remediation.md).

## Scene-only release (PG-30)

`Director._releaseSceneImmediate` is an internal AIR detach/destroy/drain path. It clears the running-scene pointer, preserves persist registrations while detaching their nodes, and drains native CPU destruction without waiting for drawing. It keeps the runtime, scheduler and shared asset caches. ReleaseManager accepts a null next scene and offers an internal flush for already requested releases. Its pending queue uses weak asset identity: multiple Code First assets with empty UUIDs no longer overwrite one another. Existing reference-count and ignored-asset checks still apply. This differs from `purgeDirector`, which releases all assets. AIR callbacks use a cooperative 5-second deadline; receipts report failures/pending ownership and unavailable GPU memory measurements. No lost-context reconstruction is attempted.

## Nonuniform UI viewport (PG-08/35)

Camera adds an opt-in orthographic half-width, `orthoWidth`, whose zero default preserves the original height-times-aspect projection. The component forwards and serializes it; pooled native cameras reset it. Screen-aligned Canvas derives both half-axes from native view scales, so EXACT_FIT stretches the whole design rectangle and its native inverse projection/hit testing agrees with getUILocation. Target-texture Canvas retains automatic aspect. No virtual-stage node scaling or body/CSS policy is added. Fractional DPR previously supplied fractional window dimensions that HTML canvas truncated; the frozen-public-PAL generation transform now rounds physical dimensions to match AIR bootstrap on startup and resize, without editing frozen source. See the port ledger for actual repro and verification.

## Billboard ownership (PG-25)

The native Billboard is now directly exported by AIR without importing the particle aggregate. Its extracted source destroys its exclusive model, mesh and material on component destruction; technique changes return the old model through Root's model pool. Input textures remain borrowed and are never destroyed by this cleanup. Three-browser scene-release probes first reproduced the missing mesh/material cleanup; this difference addresses that concrete lifecycle failure.

## Bitmap font kerning (PG-02)

PG-02 also corrects native BMFont kerning in `cocos/2d/assembler/label/text-processing.ts`: the final character retains its incoming pair, which layout already consumes as the next character's kerning. Previously two-character strings such as AV lost the pair entirely. The existing TTF shadow adaptation in this file is preserved. AIR's single-page text parser/factory and owned font handle remain in `src/air/assets/bmfont.ts`.

## Tiled object queries (PG-03)

The TMX parser retains the modern `class` attribute (falling back to legacy `type`) in optional `className`, independently of the existing numeric shape enum. TiledObjectGroup adds string-class/numeric-shape queries and immutable original geometry snapshots. Reinitializing the same parsed objects now converts from the original coordinates and polygon/polyline points, preventing repeated Y flips or cumulative isometric conversion. First initialization retains the native coordinate formulas and rendering behavior. This is an intentional change to three extracted Tiled files; it does not add a collision solver or alter tile rendering/culling.

## Input action ownership (PG-28)

`cocos/input/input.ts` includes the already-dispatched `MOUSE_ENTER` and `MOUSE_LEAVE` events in its native input type map (PG-28). This adds typed subscriptions without changing event dispatch. The optional AIR action adapter uses mouse-leave to release its simulated mouse source and PAL's existing physical-key map to clean up held keys released after focus moves away from the canvas. It does not admit a second keydown channel or synthesize engine events.

## Explicit offscreen attachments and clip projection

`asset/assets/render-texture.ts` preserves an explicitly supplied render pass's color formats; the default target still follows the swapchain. Its public pixel-format metadata follows the created color texture. `render-scene/core/render-window.ts` forwards each attachment's sample count into its native TextureInfo and identifies color-only offscreen windows. This makes the native camera target usable by AIR's owned render-target adapter without constructing parallel renderer objects.

`asset/assets/asset-enum.ts` adds the existing GFX RGBA16F format as a public PixelFormat alias. `render-scene/scene/camera.ts` validates oblique clip planes, rebuilds the base projection for repeat calls, preserves caller input, and refreshes inverse/view-projection/frustum matrices after clipping. The standalone calculation must still be applied before camera culling and uniform upload; it does not introduce an automatic world-space water plane.

`rendering/render-pipeline.ts` derives camera render-pass sample counts from the actual framebuffer, handles absent depth, and stores sampled depth/stencil so later cameras can reconstruct depth. Unsampled depth retains the native discard optimization. This closes the camera-path attachment contract rather than adding a separate render pipeline.

## Bone-space bounds cache (PG-18/21)

Realtime and baked skinning models validate weighted joint paths before replacing their binding. The shared internal `skinning-validation.ts` helper keeps legitimately unused missing joints legal; invalid weighted paths report `AIR_E_SKINNING_JOINT_PATH` with mesh, root, joint and correction context. A validation failure preserves the previous valid model binding.

Realtime skinning additionally validates the weighted palette slots before changing the binding. The native joint texture fallback has a fixed 256-joint capacity; previously a weighted slot 256 silently wrote past its typed array and disappeared on the GPU. `AIR_E_SKINNING_CAPACITY` now includes the mesh, skeleton, root, global joint, local palette, slot and actual transport capacity. Large skeletons remain legal when their used slots fit local joint maps or their unused tail does not occupy the transport. This adds an actionable rejection; it does not increase the shader/texture capacity or force baked mode.

`cocos/3d/skeletal-animation/skeletal-animation-state.ts` clears its initial baked-only evaluator suppression before creating the first realtime evaluator. A clip first initialized with `useBakedAnimation=true` previously changed model type when the public preference became false, but its node curves remained unevaluated. The native clip/state APIs and later mode changes are preserved; the fix supplies the evaluator that the existing transition already intended to create.

`cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts` defers submodel initialization while mesh, skeleton or root is missing, keeping that incomplete model disabled. Completing or replacing a live skeleton/root binding validates first, then rebuilds native submodels and reattaches their descriptors/macros to the current joint buffers. Previously root→mesh→skeleton in an already active scene attempted to dereference a null joint-buffer index; later bindings could also retain descriptors for replaced buffers. This preserves automatic animation association and native renderer types.

`cocos/3d/assets/mesh.ts` invalidates bone bounds on reset, dynamic submesh writes and asset destruction. The cache uses weak skeleton identity and the full bindpose values; a cached or colliding skeleton hash cannot hide bindpose mutation. Unchanged data still reuses the same bounds. Weighted joints and attribute data are validated before calculation, with resource/primitive/vertex/influence context and explicit correction instructions; zero-weight joints are ignored and legitimately unused joints retain null bounds. Rejected calculations never enter the cache. This does not automatically rebind an already active renderer or invalidate other animation pools when application code mutates assets in place; bind/rebuild those assets explicitly.
