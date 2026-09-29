# 17 — cocos4 baseline 对比报告（Phase 17 / 验收 L14）

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> **V1.2 章节锚点（2026-09-22）**：基线已升至 `cocos4 @ 4.0.0-alpha.34 (commit fffd9a514a)`，
> 全量比对脚本化并复测于 `tools/compare/baseline-comparison`→`docs/v12-baseline-compare.json`；
> V1.2 回归后闭包对比数据待 V1.2 结案时回填，当期进度见 `docs/versions/v12-upstream-regression.md` 与 `docs/versions/acceptance-report-v12.md`。
> 对比对象：上游 Web baseline 构建（`bin/dev/cc-baseline`，见 docs/03）vs Cocos Air 构建（`build/cocosair.module.js`）

## 1. 构建产物对比

| 项 | cocos4 Web baseline | Cocos Air V0.1 |
|---|---|---|
| 构建器 | @cocos/ccbuild（同一工具链） | @cocos/ccbuild（同一工具链） |
| 格式 | SystemJS（split chunks） | **ESM**（three.js 风格单文件） |
| 体积 | 27 MB（约 100 个 chunk） | **3.2 MB**（单文件，未压缩） |
| 压缩版 | —（build:min 另行验证） | **2.0 MB**（cocosair.module.min.js） |
| 加载方式 | Creator preview 环境 | `import { createAirApp } from 'cocosair'` |

## 2. 源码闭包对比（Q1：Web Engine Source Closure 有多大）

| 项 | 上游全量 | Air 闭包（可从 docs/web-dependency-graph.json 复现） |
|---|---|---|
| 扫描文件 | 1535 | 839（src/ 独立树） |
| 可达（Web 闭包） | ~1250+ | **748** |
| NATIVE_ONLY | 80 | **0** |
| MINIGAME_ONLY | 52 | **0** |
| 其它平台（nodejs） | 28 | **0** |

（Q1 答案：Air V0.1 的 Web 源码闭包 ≈ 748 文件；较上游 Web 全量闭包缩减约 40%，主要来自 2D/UI/物理/Spine/视频等 feature 的裁剪。）

## 3. 平台与模块删除清单（Q2）

已从 Air 闭包中物理删除：
- `native/`（855MB 原生引擎、CMake、JSB 绑定）
- `editor/`（Creator Editor Runtime；src/editor 仅保留 ccbuild 占位）
- pal 的 native/minigame/nodejs 实现（仅保留 web + non-minigame + 共享）
- 全部 `*.jsb.ts` 变体（80 个）
- cocos 的 2d/ui/physics/spine/dragonbones/video/webview/terrain/xr/gi/particle 模块（feature 未选择）
- gfx 的 webgpu 模块

## 4. 原以为 Native-only、实际 Web 依赖的公共模块（Q3）

- `cocos/native-binding/`（`internal:native` 虚拟模块的 web 空实现 impl.ts）— Web 闭包必需 ✓
- `cocos/2d/renderer/native-2d-empty.ts`（override 锚点）
- `cocos/animation/marionette/runtime-exports.ts` 及 `pose-graph/runtime-exports(.ts/-empty)`（override 锚点对）
- 大量含 `if (NATIVE)` 分支的公共源码 — 依靠常量折叠剔除（不做物理删除）

## 5. Runtime Asset 兼容性（Q7）

| 资产类型 | 状态 | 验证位置 |
|---|---|---|
| Mesh | ✓ | hello-cube（createMesh）、static-model（runtime JSON + createMesh） |
| Texture | ✓ | static-model（程序化 checkerboard ImageAsset→Texture2D） |
| Material | ✓ | hello-cube/static-model（builtin-standard + 纹理/颜色属性） |
| Skeleton | ✓ | skinned-animation（joints + bindposes Code First） |
| Animation | 部分 | skinned-animation（Component 驱动骨骼动画）；AnimationClip 曲线资产需 Creator 导入，V0.1 未覆盖 |

## 6. Missing Runtime Capability（Q8）

- 预期"无"，实测发现 1 项 + 证据：
  - **蒙皮着色器变体绑定失败**（skinned-animation）：SkinnedModel 建立成功、draw 提交，但蒙皮变体程序未通过创建（"no valid shader program in use"）。证据链见 docs/versions/acceptance-report.md L13 节。需 Creator 4.0 资产管线的 CSM/蒙皮变体数据或图形调试器继续定位。其余（Camera/Light/Mesh/Material/Texture/Animation 驱动/循环）全部实测通过。

## 7. 行为一致性对比（同一代码路径）

| 行为 | baseline 构建 | Air 构建 | 结论 |
|---|---|---|---|
| game.init 全阶段 | ✓（Init Base→Project 日志一致） | ✓ | 一致 |
| 屏幕适配（GameDiv/Canvas resize） | ✓ | ✓（CSS+adapter） | 一致 |
| legacy 前向管线 clear | ✓ | ✓（clearColor 生效） | 一致 |
| drawElements 提交 | ✓ | ✓（36 idx/frame） | 一致 |
| WebGL1 设备 | ✓（但着色器变体数据不全） | 同 | Air 主用 WebGL2 设备规避 |
| WebGL2 设备 | ✓ | ✓（WebGL2Device 激活） | 一致 |

## 8. 构建系统历史包袱（Q6，列出不改）

1. `native-pack-tool`（postinstall 的 native 构建链）— Air 已移除。
2. `build-engine`/`quick-compiler` 双工具链合并的历史过渡层。
3. `exports/` 目录即 feature unit 的隐式约定（文件名=feature 名）。
4. pal 以"预编译 JS + postinstall 复制"发布的形式（Air 改为源内提取）。
5. `scripts/` 中大量 Creator 专用脚本（Air 仅保留所需 4 个）。

## 9. V1.2 回归后闭包对比（r26 建立，**r43 / r45e 复测**）

复现命令（本节全部数字由此产出，不手填）：

```bash
node tools/compare/baseline-compare.cjs --upstream E:/AIProMax/github/cocos4   # → docs/v12-baseline-compare.json
node tools/v12/verify-file-map.cjs                                            # 簿记与磁盘事实一致性
```

基线：`cocos4 @ 4.0.0-alpha.34`，实测 HEAD `557b06f7e6`，冻结点 `fffd9a514a`。Air 侧为 r26 工作树（批次 A–D/F/G/H 已接线；批次 E 已抽取、运行面受阻于 D10）。

> **r43 复测（批次 E 之外的全部组 + dragon-bones 落地后）**：重跑比对 ⇒ 除 `meta.generatedAt` 外
> **`docs/v12-baseline-compare.json` 与 r26 版逐字段相同**（`upstreamTotal 1299 / airTotal 1159 / common 1121 / upstreamOnly 178 / excludingJsb 124 / drifted 6 / airOnly 38 / residualCounts 82+82+14`），
> 快照对比脚本输出 `DIFF FIELDS: ["meta.generatedAt: …"]`（快照 `E:/AIProMax/cocosair-scratch/db-probe/v12-baseline-compare.snapshot-before-r43.json`）。
> 即 r26 之后各批次**没有引入任何新的未登记源码文件**，也没有让差集变形；dragon-bones 侧在上游独有里只剩 `cocos/dragon-bones/index.jsb.ts`（属 `platform.jsb-variant` 54 项）。
> 该表下方 §9.1–§9.3 的读数因此仍为现值；§9.2 的 D9 结论与 §9.3 的门禁覆盖面已按 r42/r43 更新。

> **r45e 复测（批次 D-4 / G-3 落地后，2026-09-22）**：重跑同一条命令 ⇒ 本轮**确有变形**，且变形面恰好只有批次本身：
> `counts` 变化 4 项 —— `airTotal 1159→1241`、`common 1121→1203`、`upstreamOnly 178→96`、`upstreamOnlyExcludingJsb 124→42`；
> `upstreamOnlyByCategory` 变化 2 桶 —— `batch.D4-physics-2d-box2d-wasm 24→0`、`batch.G3-physics-bullet-physx 58→0`，**其余桶逐桶不变**；
> `drifted 6`、`driftedSemantic 6`、`airOnly 38`、`upstreamTotal 1299` **全部未动**。
> 三处独立自洽校验：`1241−1159 = 82`、`178−96 = 82`、`124−42 = 82`，且 82 = 本轮净新增文件数 ⇒ **零连带抽取、零新漂移、零新 Air 原创件**。
> 前后快照与逐字段 diff：`E:/AIProMax/cocosair-scratch/pg-probe/v12-baseline-compare.snapshot-before-r45e.json`（sha256₁₆ `d6352b61fdf7bfe6` / 74,761 B）、
> `r45e-baseline-compare.log`、`r45e-baseline-diff.log`。上一行的 r43「仍为现值」自本行起作废，§9.1–§9.3 已按本轮读数逐条改写。

### 9.1 闭包总量

| 清单 | V0.1/alpha.33 期（本文 §2） | r26 实测 | 变化 |
|---|---|---|---|
| 上游 scope 文件（`cocos`+`pal`+`exports` 的 .ts/.js） | 1299 | **1299** | — |
| Air 侧同名/自有文件 | 787+ | **1159** → **1241**（r45c） | +372 → **+454** 抽取件落地（r45c 净新增 82） |
| 共同文件 | 787 | **1121** → **1203**（r45c） | — |
| 官方独有（差集） | 554（立项口径） | **178**（排除 jsb 后 **124**） → r45c **96 / 42** | 收敛 ~77% → **~93%**；`drifted` 仍 6、`airOnly` 仍 38 ⇒ **零连带、零新漂移** |
| 内容漂移 | 2 | **6（全部语义漂移，零换行符假阳性）** | 6/6 已在 `upstream-file-map.json` 标 `modified:true` 并给出 reason |
| Air 独有 | — | **38** | `src/air/**`、`src/exports/air.ts`、`src/node_modules/@cocos/**`（vendored 运行库）等 |
| feature unit 注册数 | — | **Air 31 / 上游 55**（r43 由 29→31；**r45c 由 31→34，缺 25→22**，现读见下方 ⚠️ 注） | 集合差实测（仓库内自足：`node -e 'const a=require("./src/cc.config.json").features,u=require("E:/AIProMax/github/cocos4/cc.config.json").features;const A=new Set(Object.keys(a)),U=Object.keys(u);console.log(A.size,U.length,"shared="+U.filter(k=>A.has(k)).length,"onlyUp="+U.filter(k=>!A.has(k)).length,"onlyAir="+Object.keys(a).filter(k=>!(k in u)).length,"differing="+U.filter(k=>A.has(k)&&JSON.stringify(a[k])!==JSON.stringify(u[k])).length)'`；scratch 版 `d9-probe/features.cjs` → `features-r1.json`）：共有 **30**、`onlyAir=["air"]`（31=30+1）、**`onlyUpstream` 25**。r43 的 29→31 = 按官方原文补登 `marionette` / `procedural-animation`（上游 `cc.config.json:236-247`，两者 `modules:[]` 只带 `intrinsicFlags` ⇒ 零文件面影响；登记动机与代价见 `docs/notes/v12-pose-graph-notes.md` §4，且这 2 项原本就落在下面那 19 项「不贡献残留」之列）。旧口径提示：本行 r42 曾写「上游 54 / 26 项」，两处都是**转录/算法错**（`55` 与「忽略 `air` 自有 ⇒ 27」），r43 已按实测改。把 25 项与 §9.2 的 `upstreamOnlyByCategory` 桶做**文件→feature 反查**：**8 项**在文件面留下 D9 残留（`terrain` `particle` `xr` `light-probe` `affine-transform` `rich-text` `ui-skew` `vendor-google` ⇒ 14 个文件），其余 **17 项一个残留文件都不贡献**（实现已随别的目录进仓，或其文件全被 platform/batch 桶吃掉，如 `physics-physx`/`physics-ammo`/`physics-2d-box2d-*`/`websocket*`/`meshopt`/`sorting-2d`/`mask`/`graphics`/`gfx-webgpu`〔批次 E 已抽取 26 文件 ⇒ 差集为 0，不登记的原因见 D10：登记即并入发布类型面〕）。⚠️ 不要用「`cocos/<feature 名>` 目录探测」判这些项：`features-only-upstream-r1.json` 实测只有 **2 项**能被判出文件面（terrain 缺 4、particle 缺 1；xr 判为缺 0），因为多数项的 `modules` 名在上游 `cocos/` 下**没有同名目录** ⇒ 该方法对它们无判定力（同 `docs/versions/v12-d9-residual-triage.md` §5 的边界）。 |

> ⚠️ **r45c 现读（feature 声明面）**：Air **34** / 上游 **55** / `onlyUpstream` **22** / `onlyAir=["air"]` / `differing` 0，默认 `AIR_FEATURES` **26** 项。
> 31→34 的 3 项 = `regress.cjs` 按上游原文把 `physics-ammo` / `physics-physx` / `physics-2d-box2d-wasm` 并入 `src/cc.config.json` 的 `features`
> （⇒ 上面「17 项不贡献残留」里的 `physics-*` 三项现在连声明也齐了，缺数从 25 降到 22）。
> **该读数有活门禁**：`npm run verify:v12-backends` 的 A5 直接断言 34/55/22 + 三后端定义与上游逐字段相同 + 不进默认集，
> 故此行的数字**不再会静默腐烂**（明细 `docs/versions/v12-upstream-regression.md` §7.4）。

### 9.2 差集文件的逐条分类（§1.3「差集应为空」的可复核口径；r43 期 178 → **r45c 期 96**）

分类逻辑内置在 `tools/compare/baseline-compare.cjs` 的 `classify()`，结果写入
`docs/v12-baseline-compare.json` 的 `upstreamOnlyByCategory`，前缀即结论：

| 类别 | 数量 | 结论 |
|---|---|---|
| `platform.jsb-variant`（`*.jsb.ts`，含 `cocos/root.jsb.ts`） | 54 | §1.3 平台性排除；护栏 5 要求零进入。**root.jsb.ts 即决策点 D4，登记为 Deviation-02（见 UPSTREAM.md）** |
| `platform.box2d-jsb`（`cocos/physics-2d/box2d-jsb/**` + `exports/physics-2d-box2d-jsb.ts`） | 24 | 计划书 §1.1 组 4 指名跳过（native 变体） |
| `platform.native-binding` / `platform.editor-only` / `platform.emscripten-entry` | 1 + 2 + 1 | 逐条核实：仅被 `*.jsb.ts` / `editor/exports/**` / native emscripten 构建引用（`grep` 证据见 `classify()` 注释） |
| `batch.E-gfx-webgpu` | 0（r26 已从差集消除） | 26 文件逐字节抽取入仓（`wrote 26/26; byte-identical 26`），但 feature unit **不登记**、子图移出类型核对与声明图；**接线/出图受阻 → 决策点 D10**，详见 UPSTREAM.md Deviation-04 与 `docs/evidence/v12/d10/README.md` |
| `batch.D4-physics-2d-box2d-wasm` | 24 → **0**（r45c 落地） | 24 文件（box2d-wasm 23 + `exports/physics-2d-box2d-wasm.ts`）`byte-identical 24/24`；**代码差集已清零**，LV12-14 的 blocked 只剩**运行级**（`@cocos/box2d@1.0.2` 包内实测无 `.wasm`，见 `docs/versions/v12-bundle-budget.md` §3、`docs/versions/v12-upstream-regression.md` §7.2） |
| `batch.G3-physics-bullet-physx` | 58 → **0**（r45c 落地） | 58 文件（bullet 30 + physx 26 + 2 exports 入口）`byte-identical 58/58`；闭包内 jsb 变体零进入；LV12-16 的 blocked 同样只剩运行级（R8：`external:emscripten/{bullet,physx}` 资产不随快照分发） |
| `needs-decision.*`（terrain 5 / particle-3D 2 / xr 1 / light-probe 1 / convenience-export 4 / 上游零引用者 1） | **14** | **16 个回归组未列**，计划书 §1.3 的「差集为空」断言按实测不成立 → 决策点 **D9**。r42 已逐条分类（A 门面 7 / B `optimized-curve` 1 / C terrain 5 / D 零引用桩 1，含纳入成本与六条可复跑判据），r43 把 D 组那 1 项**实测结案**（上游全仓零引用、两侧 `moduleOverrides` 无该映射）⇒ 现剩 **13 项待 owner 批复**，默认不自行豁免 ⇒ 明细 `docs/versions/v12-d9-residual-triage.md` |

`residualCounts` 汇总（r45e 现读）：平台性排除 **82** ＋ 排期内待落地 **0** ＋ 需决策 **14** ＝ **96**（r43 期为 82 + 82 + 14 = 178）。

即：**计划书 §1.3 所要求的「16 组范围内的官方 Web 差集」现已实测为 0** —— 剩余 96 项里 82 项有逐条可复核的平台性排除证据，
14 项是 16 组未列、需 owner 批复的 D9 残留（默认不自行豁免，见 `docs/versions/v12-d9-residual-triage.md`）。
82 项平台性排除每一条都有可复核的引用者证据，不是按文件名猜测。

### 9.3 抽取来源可信度（计划书硬性判定 ②）

- `docs/extraction-manifest.json` **1278** 条抽取登记（r43 期 1196 → r45c +82）；`docs/upstream-file-map.json` **1315** 行映射，其中 `modified:true` 28 行逐条带 reason（`meta.modifiedCount` 与实读一致）。
- `tools/v12/verify-file-map.cjs` 对每行做「上游可解析 + 字节比对 + 标记互证」，并接入 `npm test`（`smoke-30` 的 F-3 项）。
  r26 修正了 V0.x 工具批量生成的 9 条误标（`src/air/**` 与 `src/exports/air.ts` 被标为 `extraction copy`，但上游无同名文件 → 实为 Air 原创）。
- **r43 起该门禁覆盖面扩到 `moduleOverrides` 替换件**（第 7 类断言，F-118 的 `minimalFix` 落地）：官方构建的模块替换**只由 `cc.config.json` 的显式路径对驱动**（无按名自动替换），
  所以这些替换件也在「与官方逐字节」的护栏范围内。r43 期实测读数：
  `moduleOverrides pairs upstream=103 air=104 airOnlyRegistered=1 byteChecked=72 excludedOneSide=77 missingBoth=10` → **PASS**；
  **r45f 现读**（同命令 `npm run verify:file-map`）：`rows=1315 modified=28 scanned=1268 manifest=1278` +
  `moduleOverrides pairs upstream=103 air=104 airOnlyRegistered=1 byteChecked=73 excludedOneSide=76 missingBoth=10` → **PASS（EXIT=0）**；
  与 r43 差 1 的原因：批次 D-4 新抽 `src/cocos/physics/physx/instantiate.ts` 使 `instantiate.ts => instantiate.jsb.ts` 替换对的 **web 侧**
  由「Air 无、上游有」变为「两侧逐字节同」（jsb 侧仍按 Deviation-02 平台排除），见 `docs/versions/v12-upstream-regression.md` §7.5。
- **r45f 起另有两份只读门禁把本节的部分结论从「一次性测算」变成「可复跑断言」**（明细 `docs/versions/v12-upstream-regression.md` §7.4 / §7.7）：
  `npm run verify:v12-backends` 的 **A7**（5 个物理后端子树的上游缺件必须登记在本文件 §9.2 引用的差集桶内 ⇒ 「悄悄缩范围」会红），
  与 `npm run verify:v12-custom-face`（批次 H 的 `cocos/rendering/post-process` 34/34、`cocos/rendering/custom` 25/25 + 两个 custom 接线门面逐字节同 + 逐张在 `docs/upstream-file-map.json` 在册）。
  断言三条 = ①Air 不得丢掉任何官方替换对（`upstreamOnlyCount=0`）②Air 自有对必须在 file-map 里登记为偏差（唯一那条是 `spine-instantiate → air-spine-instantiate-js`）
  ③两侧都在的替换件逐字节一致（含上游 3 条 `-empty` 对，Air `src/cc.config.json:281/422/429` 逐条镜像且三个目标文件 sha256₁₆ 全同）。
  单侧缺失只计数不判红（jsb / `vendor/` / pal 非 web 实现 / 整个未纳入目录如 `cocos/physics/physx`）。
  负向控制：在仓库外镜像里把 `native-2d-empty.ts` 改成不同字节 ⇒ 该断言精确转红（`EXIT=1`），证明不是永真式。
- vendored 运行库（`@cocos/box2d`、`@cocos/cannon`、`@cocos/dragonbones-js`）与已安装 npm 包逐字节一致，`src/pal/**` 与 `@cocos/engine-pal@1.0.4` 的 `dist` 逐字节一致（smoke-30 两层 sha256 断言）。
- 发布类型面 `build/cocosair.module.d.ts` 3,082,360 B（r25 修复 `rootDir` 漂移后恢复；曾退化为 11 B 空模块声明）。
- 唯一脱离「逐字节 + 可核对」口径的子图：gfx-webgpu 的 26 个抽取文件内容逐字节一致，但被**根 `tsconfig.json`（类型核对）与 `src/tsconfig.json`（发布声明图）**各三项 exclude 移出，
  feature unit 亦不登记（登记即被 `dtsBundler` 并入 `cc.d.ts`，造成 `WebGPUDevice` 类型有、产物符号无）；豁免范围由 `smoke-30`「批次 E / D10」三条断言锁定，
  根因与复现见 `docs/evidence/v12/d10/README.md`。

### 9.4 变体构建面（r40 实测）：3D 物理后端的可插拔性是**构建期**能力，不是交付期能力

机制：`tools/build/build.cjs:22-47` 的环境变量出口——`AIR_FEATURES`（逗号表，覆盖默认集合）
与 `AIR_OUT_DIR`（产物出仓库）任一生效即 `VARIANT=true`，变体既不共享默认集合的增量缓存，
也不写 `build/` 的发布附属产物（bundle 预算、`published-artifacts` 检查均针对默认集合）。

以 `physics-builtin → physics-cannon` 这一对为例（默认集合只换一项，其余 26 项照抄）：

| 产物 | 字节 | sha256₁₆ | dev bundle 内符号 |
|---|---|---|---|
| 默认（`physics-builtin`） | 6,081,668 | `35496aebda066ab5` | `CannonWorld` 0 次 |
| 变体（`physics-cannon`） | 6,599,009（**+517,341**） | `9ef1f01b24da043a` | `CannonWorld` 5 次 |

同一条命令二次构建到另一目录 ⇒ **逐字节相同**（`identical=true`），所以变体产物是可复现的构建姿态，
不是偶发工作树状态的副产物。运行时行为差异（18 条断言 × 3 引擎，`docs/notes/v12-physics3d-notes.md` §15）
证明换的是**真后端**：`physicsWorld` 类名 `BuiltInWorld → CannonWorld`、`PhysicsSystem.PHYSICS_BUILTIN true → false`、
60 步自由落体位移 `0 → -4.9123`。

三点要登记在案的边界：

1. `src/cc.config.json:215/224` 两个 feature 条目都在（`physics-builtin` / `physics-cannon`），
   但 Air 的导出层只有 `src/exports/air.ts:35 → ./physics-builtin`；计划书 L401 要求的
   `exports/physics-cannon.ts` **不存在** ⇒ cannon 目前只能以变体产物存在，不进默认交付类型面。
2. 后端选择语义在框架层是支持运行时的（`physics-selector.ts:127-136` 初始化前最后注册者胜出；
   `:145-164` `switchTo()` 在 web 构建下 `runInEditor` 为真 ⇒ 可切换并重建世界），
   但**前提是两个后端都在同一份产物里** ⇒ 要交付期可切换就必须把 `physics-cannon` 编进默认集合，
   代价是产物字节变化触发 33 条矩阵记录与「默认产物不变」护栏全量重采 ⇒ 决策点 **D12**（`docs/versions/v12-upstream-regression.md` §6.15）。
3. 变体面**进不了官方证据链**：`tools/v12/browser-matrix.cjs:181/:204` 把 bundle 路径写死且无环境变量出口（**F-113**），
   `smoke-30` 又按该 bundle 的 sha256₁₆ 绑定 PNG 字节货币 ⇒ 一切非默认后端目前只有诊断级证据，
   这也是 LV12-14（box2d-wasm）/LV12-16（bullet/physx）取证面停在产物级的同一根因。

## §10 批复落地（r46，2026-09-24）

Owner 批复「按照建议执行，确保最优」（逐条登记 `docs/versions/v12-owner-decisions.md` §4），对本文件的直接影响：

1. **§9.2 / D9**：14 项残留全部按建议豁免结案（#1c/#2b/#3a/#4b），总登记 `UPSTREAM.md` Deviation-06；
   `v12-d9-residual-triage.md` §6 回写；「差集为空」按**文件**口径成立。
2. **D12 → 已批复 (a)**：`createAirApp` 增 `physics: 'builtin' | 'cannon'` 交付期切换；`physics-cannon` 编入默认集合
   （上文 §9.1 第 2 条分析的「前提」成立：双后端同 bundle + web 构建下 `switchTo()` 可用）。
   代价照单全收：产物字节变更 ⇒ §12 全量证据重采（V1.2 矩阵含新例 `physics-3d-collision` + V1.1 链 52 例），新基线见 bundle 预算 r46 行。
3. **D10 → (b)**：webgpu 维持「三浏览器回退探测证据」档；**D11 → (b)**：post-process 维持「变体构建级开关对照」档。
   两者均不改默认产物字节。

