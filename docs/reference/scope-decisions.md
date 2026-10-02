# V1.2 · D9 范围外残留差集逐条分类（**提案**，待 owner 确认）

日期：2026-09-22（r42 建立，**r43 补扫结案**）。用途：把 历史记录（v12-upstream-regression.md，已清理） §4 的「范围外残留差集」从「需逐个分类后方可判定」推进到**逐条有理由、有实测、有成本**的可确认清单。

r43 增量：D 组（`deserialize-dynamic-empty.ts`）从「高置信推断 + 待核」升为**实测结案**，代价是发现并修正了 r42 初版对 `cc.config.json` 的一句错报（§2 末条留痕）；14 项里现在 **13 项待批**（A 组 7 / B 组 1 / C 组 5），D 组 1 项只剩「确认口径」一句。

⚠️ 本文**不 grants 豁免**。计划书护栏 ① 要求「豁免需可复核理由 **+ 确认**」；这里只交付「理由」半边，确认是 owner 的动作。

## 1. 现读口径（先纠正 §4 的陈旧数字）

旧版基线差集报告的历史读数如下（快照已清理，当前差集需重跑比较工具）：

```
counts.upstreamOnly            = 178          （上游有、Air 无）      → r45c 复测 96
counts.upstreamOnlyExcludingJsb= 124                                → r45c 复测 42
residualCounts = { platformExcluded: 82, inPlanPending: 82, needsDecision: 14 }
                                          ↑ r45c 复测 0        ↑ 仍 14（未变）
```

> ⚠️ **r45e 复测注**：上块是 r42 现读。批次 D-4 / G-3 落地后（82 文件逐字节入仓）重跑
> `node tools/compare/baseline-compare.cjs --upstream E:/AIProMax/github/cocos4` ⇒
> `inPlanPending 82 → 0`、`upstreamOnly 178 → 96`、`excludingJsb 124 → 42`，
> 而 **`needsDecision` 仍是 14、`platformExcluded` 仍是 82、`drifted` 仍是 6、`airOnly` 仍是 38**
> （逐桶 diff 见 `E:/AIProMax/cocosair-scratch/pg-probe/r45e-baseline-diff.log`）。
> **⇒ 本文 14 项的分类、成本估算与六条判据全部仍然成立**，未受该批次影响；变化的只是「排期内 82 项已兑现」这一前提。

⇒ §4 表里「16 组之外仍有 **52** 个非 jsb 官方独有文件」是 G0 期数字，已被后续批次吃掉一大半；
**真正需要决策的只剩 14 项**（`upstreamOnlyByCategory` 的 6 个 `needs-decision.*` 桶之和），其余 82 项属平台性排除（jsb 变体等）、82 项挂在计划书已排定的批次上。

另一条结构性判据（同一轮实测）：

```
node E:/AIProMax/cocosair-scratch/d9-probe/features.cjs → features-r1.json
Air 声明 **31** 个 feature（r43 补登 `marionette`/`procedural-animation` 后；原为 29）；上游 55 个；onlyUpstream **25**；onlyAir = ["air"]
airDangling = []   ← Air 没有任何 feature 指向「已声明但文件不在」的模块
```

⇒ **14 项残留不是「抽取漏了」的形状**：Air 的 `cc.config.json` 与 `src/` 落盘内容自洽，残留都是「上游有该 feature unit，Air 未声明」的下游结果。这是本表所有建议的前提。

## 2. 判据怎么来的（四条可复跑命令）

> ⚠️ 可移植性边界（诚实说明）：下表 `.../d9-probe/*.cjs` 是本轮的**仓库外**探测脚本（`E:/AIProMax/cocosair-scratch/d9-probe/`，产物同名 `.json` 留在该目录），
> 不随仓库分发 —— 新克隆拿不到它们。仓库内**自足**可复跑的是：`node tools/compare/baseline-compare.cjs`（§1 的 178/124/14 分桶）、
> `node tools/verify/verify-file-map.cjs`（含 r43 的 `moduleOverrides` 第 7 类断言）、以及本文件与 §3 各表里写明的 `grep` 命令（feature 名单 / `-empty` 映射 / importer）。
> 即：**结论的证据链有仓库内一半**，探测脚本只是把同一批判据批量化的加速器。

| 判据 | 命令 | 产物 |
|---|---|---|
| 谁静态 import 了它（按相对说明符真实解析，不按 basename 猜） | `node .../d9-probe/importers.cjs` | `importers-r1.json` |
| 从它出发能到达哪些上游文件，其中 Air 缺几个 | `node .../d9-probe/cost.cjs` | `cost-r1.json` |
| 当期交付产物的顶层导出表里有没有对应符号 | `node .../d9-probe/verdict.cjs` + 导出的 `bundle-exports.json`（**574 个导出名**） | `verdict-r1.json` |
| 上游 feature unit 差集 / Air 悬空 feature | `node .../d9-probe/features.cjs` | `features-r1.json` |
| 27 个未声明 feature 各自在 `cocos/<module>/**` 下贡献几个 Air 缺失文件 | `node .../d9-probe/features-only.cjs` | `features-only-upstream-r1.json` |
| `-empty` 替换在上游如何接线、有没有覆盖某个文件（r43 新增） | `grep -n "empty" E:/AIProMax/github/cocos4/cc.config.json` | 实测 3 条：`:321` `:462` `:469`，全在 `moduleOverrides[].overrides` 里，形如 `"cocos/2d/renderer/native-2d.ts": "cocos/2d/renderer/native-2d-empty.ts"` ⇒ **只有显式列出的路径对才会被替换，不存在自动后缀规则** |
| 上游构建脚本里有没有按名替换模块的逻辑（r43 新增） | `grep -rn "empty\|replacement\|importReplace" E:/AIProMax/github/cocos4/scripts` | 命中仅 `emptyDir`（fs-extra，清空输出目录）+ `native-pack-tool/source/platforms/ios.ts:57` 的局部变量 `replacement`（写 Info.plist）⇒ **无** |
| Air 侧是否镜像了上游现有的 3 条 `-empty` 替换（r43 新增） | `grep -n "empty\|overrides" E:/AIProMax/github/cocosair.js/src/cc.config.json` + 对三个目标文件做 sha256₁₆ 对比 | `src/cc.config.json:281/422/429` 三条齐全；目标文件 `native-2d-empty.ts` `marionette/index-empty.ts` `pose-graph/runtime-exports-empty.ts` 与上游 **逐字节同**（`e0f982053278a8f1` / `c5c59441c2e0b260` / `8e609bb71c20b858`） |

⚠️ 诚实边界：
- 「Air 缺 N 个文件」的闭包**只覆盖 `cocos/**` + `exports/**` 内的相对静态 import**，不含 `internal:constants`、动态构造的路径，也不含仓库根的 `vendor/**`（`exports/vendor-google.ts` 因此被低估，见 A-4）。
- 一次可达性实验（`reach.cjs`）因把上游入口猜成 `cocos/index.ts`（实测不存在，上游入口是**逐 feature 的 `exports/*.ts`**）而得到全 0 结果，**该实验的结论一个都没用**，仅留档。
- 「符号未在导出表」≠「代码不在产物里」：例如 `RichText` 未导出但 `RichTextComponent` 在 574 名里 ⇒ 实现已发布，缺的只是 `export *` 门面。
- ⚠️ **r43 自查改错留痕**：本文 r42 初版在 D-1 行写过「两侧 `cc.config.json` 的 `moduleOverrides` 均未提及 `-empty`」——该句**是错的**，两侧各有 3 条 `-empty` 映射（上游 `:321/:462/:469`，Air `src/cc.config.json:281/422/429`）。当时只 grep 了 `deserialize-dynamic` 这个词，就把「没有这条映射」写成了「没有任何 -empty 映射」，并据此推断出「官方构建按名替换」的机制。r43 补扫 config + `scripts/` 后机制已弄清（显式路径对，无自动后缀），结论见 D 组新表。

## 3. 逐条分类

### A 组：入口门面（`exports/*.ts`，1–26 行，纯 re-export）

| # | 文件 | 上游 feature | 实质 | Air 现状（实测） | 纳入成本 |
|---|---|---|---|---|---|
| A-1 | `exports/affine-transform.ts` | `affine-transform` | `export { AffineTransform } from '../cocos/core/math/affine-transform'`（1 行） | 实现**已在树内**（`src/cocos/core/math/affine-transform.ts` 275 行）；顶层导出表无 `AffineTransform` | 1 个文件 |
| A-2 | `exports/rich-text.ts` | `rich-text` | `export * from '../cocos/2d/components/rich-text'`（1 行） | 实现已在树内（`src/cocos/2d/components/rich-text.ts`），且产物已含 `RichTextComponent` | 1 个文件 |
| A-3 | `exports/ui-skew.ts` | `ui-skew` | `export * from '../cocos/2d/framework/ui-skew'`（1 行） | 实现已在树内（`src/cocos/2d/framework/ui-skew.ts`），产物含 `UIRenderer`/`skewX` | 1 个文件 |
| A-4 | `exports/vendor-google.ts` | `vendor-google` | re-export `../vendor/google`（26 行） | **实现不在树内**（`src/vendor/google.ts` 缺）⇒ 闭包计数「缺 1」低估了它（`vendor/**` 未纳入扫描根） | ≥2 个文件 + 第三方 Google Cast SDK 依赖（许可面） |
| A-5 | `exports/light-probe.ts` | `light-probe` | `export * from '../cocos/gi/light-probe'`（1 行） | 实现已在树内（`src/cocos/gi/light-probe/index.ts` 29 行）；产物有 `LightProbeInfo` 但无 `LightProbe`；另有 2 个 `.jsb.ts` 属平台排除 | 1 个文件（若 `gi/light-probe` 其余实现确有缺口则按闭包补，实测闭包缺 1） |
| A-6 | `exports/xr.ts` | `xr` | 26 行入口 | 实现已在树内（`src/cocos/xr/index.ts` 25 行）；顶层无 `xr` 相关导出 | 1 个文件；但 WebXR 语义在 headless 三引擎下**不可取证**（矩阵无 XR 设备）⇒ 纳入也拿不到 §12 的浏览器证据 |
| A-7 | `exports/particle.ts` | `particle`（3D 粒子） | 26 行入口 | 实现基本已在树内（`src/cocos/particle/index.ts` 46 行；闭包 629 文件仅缺 2：本门面 + `cocos/particle/animator/optimized-curve.ts`） | 2 个文件（见 B-1） |

⇒ **A 组共 7 项，其中 5 项的「缺失」只差一个 1–26 行的 re-export 门面**，实现与产物都已经在 Air 里。
这一组的真问题不是抽取完整性，而是**「Code First 的顶层命名空间要不要暴露它们」**——与已交付示例无关，与 API 面口径有关（同一口径问题已记在 F-88：inventory 不识别别名导出 / `export enum` / 访问器属性）。

### B 组：真实现未纳入的子系统（3D 粒子的一处）

| # | 文件 | 说明 | 实测 |
|---|---|---|---|
| B-1 | `cocos/particle/animator/optimized-curve.ts` | 3D 粒子 `OptimizedCurve`（220 行） | Air 缺该文件，且它是 A-7 闭包里唯一缺的实现文件；顶层导出表无 `OptimizedCurve` ⇒ 3D 粒子目前**在 Air 里是「树内有大部分实现、少一处文件、且无入口」的半纳入态** |

⚠️ 「半纳入」是实测结论，不是判断：`cocos/particle/**` 其余文件在 Air 树内存在，但它们整体不被任何 Air 入口静态触达（A-7 门面缺失），因此在交付产物里是否存活需单独测（本轮只测了 `exports/` 表，未测 `cocos/particle` 的存活集）⇒ **待核**。

### C 组：terrain（计划书未列的完整子系统，5 个文件）

| # | 文件 | 行数（上游） | 谁引用它 |
|---|---|---|---|
| C-1 | `cocos/terrain/terrain.ts` | 2706 | 仅 `cocos/terrain/index.ts` 与 `exports/terrain.ts` |
| C-2 | `cocos/terrain/terrain-lod.ts` | 509 | 仅 `cocos/terrain/terrain.ts` |
| C-3 | `cocos/terrain/height-field.ts` | 92 | 仅 `terrain/index.ts`、`terrain/terrain.ts` |
| C-4 | `cocos/terrain/index.ts` | 27 | 仅 `exports/terrain.ts` |
| C-5 | `exports/terrain.ts` | 26 | 上游无静态引用者（feature 入口即终点） |

⇒ **闭包自封**：这 5 个文件构成一个闭合簇（`importers-r1.json` 实测：簇外无相对静态 import 者），Air 从 `src/cocos/terrain` 到顶层导出表**完全没有地形路径**（`Terrain` 未导出；产物里唯一的近亲是物理侧 `TerrainCollider`，它不 import `cocos/terrain`）。
计划书 16 组回归目标里没有地形，LV12-xx 亦无地形 example ⇒ 建议口径：**显式 Deviation 豁免（不纳入 V1.2）**，理由链=「计划书未列该组 + 闭包自封（不纳入不会让任何已纳入文件失去依赖）+ 纳入需 3334 行真实现与 `Terrain` 资产/编辑面，而 V1.2 无地形回归目标可验收」。

### D 组：上游侧零引用桩（1 个文件）—— r43 **实测结案**，原「构建管线排除」推断作废

| # | 文件 | 实测（r43，四条命令全可复跑） |
|---|---|---|
| D-1 | `cocos/serialization/deserialize-dynamic-empty.ts`（32 行 / 1,305 B，两个函数体都是 `throw new Error('Should not called')`） | ① 上游 `cocos/**`+`exports/**` 对该路径 **零静态引用者**：全仓 `grep -rn "deserialize-dynamic" E:/AIProMax/github/cocos4` 只有 4 处命中，全在 `cocos/serialization/deserialize.ts:28/31/498/518`，且引的是 `./deserialize-dynamic`（真实现，Air 已有 893 行版本）。② 上游 `cc.config.json` 的 `-empty` 替换共 **3 条**（`:321` native-2d、`:462` marionette runtime-exports、`:469` pose-graph runtime-exports），**没有** `deserialize-dynamic` 的条目。③ 上游 `scripts/**` 扫 `empty\|replacement\|importReplace` 只命中 `emptyDir`（fs-extra 清空目录）与 iOS plist 的局部变量 `replacement` ⇒ **无按名替换模块的构建逻辑**。④ Air 侧同名机制已对齐：`src/cc.config.json:281/422/429` 逐条镜像那 3 个映射，且三个替换目标文件在 Air 树内与上游 **sha256₁₆ 全同**（`e0f982053278a8f1` / `c5c59441c2e0b260` / `8e609bb71c20b858`，行数 29/25/1 亦同）。 |

⇒ 结案口径：**登记为「上游侧零引用桩（本仓库快照内不可达），不纳入零功能损失」**。
它既不是「Air 抽取漏了」，也不是上一版本文写的「Air 打包链缺一条按名替换」——真实机制是 `moduleOverrides` 的**显式路径对**（不是自动加 `-empty` 后缀），而该文件在两侧 config 里都没有对应条目，Air 也已完整镜像现有的 3 条。它更可能供编辑器侧构建（本仓外）使用；这一点本仓库无证据，故不写进结论，只写「零引用」。
⇒ **本项不再需要 owner 做取舍**（纳入它 = 在 Air 里放一个全仓无人 import 的 throw 桩），只需确认「上游零引用桩 → 显式豁免」这一条理由口径。

## 4. 交给 owner 的三个决定（每个都可一句话批复）

1. **A 组（7 项门面）**：要不要把「顶层 API 面」补齐到与上游 feature 名单一致？
   - 若纳入：成本 = 7 个 1–26 行文件（其中 A-4 vendor-google 另含第三方 SDK 许可面、A-6 xr 在 headless 矩阵下不可取证）。
   - 代价必须一起认：**任一纳入都会改变交付产物字节** ⇒ 当期 36 条矩阵记录、bundle 绑定（`35496aebda066ab5` / 6,081,668 B）、`verify:benchmark` 与 bundle 预算行（D1 复议阈值）全部要重采/重评。
2. **B+C 组（terrain 5 项 + `optimized-curve`）**：确认按「显式 Deviation 豁免（不纳入 V1.2）」登记，还是纳入（terrain 需 3334 行真实现 + example 才能满足 §12）。
3. **D 组（`deserialize-dynamic-empty.ts`）**：~~补扫上游 `scripts/`~~ **r43 已补扫并结案**（见 §3 D 组与 §2 末条）。owner 只需批复一句：确认「上游零引用桩 → 显式豁免（不纳入）」这一口径成立。本文不再把它当待核项。

## 5. 与计划书护栏的关系（诚实结论）

- 护栏 ②（抽取件与官方逐字节、偏差登记）：**不受本节影响**——14 项都是「Air 未声明该 feature」而非「Air 改了上游文件」；`verify:file-map` 当期 PASS、`airDangling=[]`。
  r43 起该护栏的覆盖面**已扩到 `moduleOverrides` 替换件**（`tools/verify/verify-file-map.cjs` 第 7 类断言，接进 `npm test` 的 `smoke-30`）：
  当期实测 `moduleOverrides pairs upstream=103 air=104 airOnlyRegistered=1 byteChecked=72 excludedOneSide=77 missingBoth=10 → PASS`，
  负向控制（上游镜像里把 `native-2d-empty.ts` 改成不同字节）应转红并已转红 ⇒ F-118 的 `minimalFix` 已落地，不再是人肉判据。
- 护栏 ①（16 组全回归，豁免需理由 + 确认）：本文把 D9 的「理由」半边补齐，**确认仍缺**，因此 §4 表里 历史记录（v12-upstream-regression.md，已清理） 的 D9 状态只能从「14 项待分类」升到「14 项已分类、待 owner 批复」，不能升到「豁免成立」。
- 计划书 §1.3 的断言（「除平台性排除项外，官方 Web feature unit 与 Air 的差集在 V1.2 后应为空」）按现读**仍不成立**：Air 少声明 **25 个** feature unit。
  ⚠️ 本行 r42 初版记的是 **27**，r43 在 `src/cc.config.json` 补登 `marionette` / `procedural-animation`（官方原文 `cc.config.json:236-247`，均 `modules: []`）后**下移到 25**：
  现读判据 `node E:/AIProMax/cocosair-scratch/pg-probe/feature-units.cjs` → `feature-units-r1.json` = `airCount 31 / upCount 55 / missingCount 25 / differing 0 / airOnly ["air"]`
  （旧引用 `features-only-upstream-r1.json` 是 r42 期的 27 快照，只作历史留痕，不再作现读口径）。
  但「少声明」与「少文件」是两件事，实测只把两者关联到 **3 个 feature**：把各 feature 的 `modules` 展开到上游 `cocos/<module>/**` 目录后，
  `terrain` 贡献 4 个 Air 缺失文件、`particle` 贡献 1 个、`xr` 贡献 **0** 个（`cocos/xr/` 3 个文件 Air 全有，只差 `exports/xr.ts` 门面与声明）；
  其余 22 个未声明 feature 的 `modules` 名在上游 `cocos/` 下**没有同名目录**（如 `mask`/`graphics`/`light-probe` 的实现分散在 `cocos/2d/**`、`cocos/gi/light-probe/**`），
  本方法对它们**不能判定文件面**——它们的缺失文件全集只能从 14 项残留反推：8 个 `exports/*.ts` 门面 + 5 个 terrain + 1 个 `optimized-curve.ts` + 1 个构建替换件。
  ⇒ 该断言要么改为「以 feature **声明**为单位对齐」（则 25 项全部需要补声明，r43 已实测其中 2 项的成本：`marionette`+`procedural-animation` 若同时进默认集 = **+339,301 B（+5.58%）未压缩产物**，见 `docs/notes/pose-graph-notes.md` §4.3；其余 23 项多数 `modules: []` 不引文件，但任何默认集变更都要 36 条矩阵记录与 V1.1 证据链全量重采），
  要么按本节 A/C/D 口径逐条豁免；两者都需 owner 定夺，**不该由实现方默认缩小**。

## 6. 批复结果（r46，2026-09-24）—— 本文件从「提案」转「已批复结案」

Owner 指令「按照建议执行，确保最优」，§4 三个决定逐条批复并落地：

1. **A 组（7 项门面）**：批复 (c) ⇒ **显式 Deviation 豁免（不纳入 V1.2）**，登记 `UPSTREAM.md` Deviation-06。
2. **B+C 组（`optimized-curve` + terrain 5 项）**：批复 (b) ⇒ **显式 Deviation 豁免（不纳入 V1.2）**，登记同上。
3. **D 组（`deserialize-dynamic-empty.ts`）**：批复 (a) ⇒ **「上游零引用桩 → 显式豁免」口径成立**，登记同上。

§1.3 断言同步关闭（owner-decisions #4 批 (b)）：差集按**文件**口径逐条豁免结案，「以 feature 声明为单位对齐」的 (a) 路线
（补 22 项声明，r45c 现读 34/55/22）**不执行**；豁免总登记以 `UPSTREAM.md` Deviation-06 为权威源。

**r46 全量比对补充点名**：`cocos/gfx/base/pipeline-state.editor.ts`、`cocos/gfx/index.ems.ts`、
`cocos/native-binding/decorators.ts`、`cocos/rendering/lod-group-editor-utility.ts` 四个非 jsb 残留属平台/编辑器变体
（`*.editor.ts` 编辑器面、`*.ems.ts` emscripten 变体、native-binding 装饰器），并入 Deviation-06 平台性排除口径，
消除「§1.3 只点名 `*.jsb.ts`」的文字缺口（r46 独立核查实测：cocos/ 树官方独有 87 = jsb 77 + 上述 4 + D9 已分类的 6 个具体路径）。
