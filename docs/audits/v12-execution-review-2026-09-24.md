# V1.2 执行审查核对报告（独立审计）

> 审计日期：2026-09-24。审计者：独立第二方（未参与 V1.2 执行）。
> 审计对象：另一执行 agent 自 V1.1 收口提交 `3a53957` 之后的 V1.2 特性回归执行成果。
> 审计方式：**只读**——不运行任何会改写工作树的门禁（`npm test` 会改写已入库证据的
> measuredAt，属台账 F-58 已知缺陷；build 会重写 `build/*`；且执行方工作树有 479 个
> 未提交变更正在推进，任何写操作都有干扰风险）。运行时类声明（jest/build/浏览器矩阵）
> 因此只做**台账交叉验证**，不做复跑；文件级声明全部做了**独立命令级复核**。

---

## 1. 执行现状快照（独立盘点）

| 项 | 现读值 | 依据 |
|---|---|---|
| 提交史 | `3a53957` 之后 20 个提交（手册工程、全局质量审计、F 台账 r21–r23 修复波等） | `git log` |
| 工作树 | **479 个未提交变更**（354 untracked + 125 modified）——V1.2 批次 A–H 的 src/examples/证据主体在工作树 | `git status` |
| 示例规模 | **57 个 example.json（56 stable + 1 draft `gltf-catalog`）**，与执行方台账 r45g 现读一致 | 本地逐文件统计 |
| V1.1 证据链 | `docs/evidence/v11-examples-verified.json` 现读 **52 records / 52 PASS / partial=false** | 证据 JSON 现读 |
| 构建产物 | `build/cocosair.module.js` mtime 2026-09-23（新于最后提交），dev **6,081,668 B** / min 3,499,182 B | 文件系统现读 |

V1.2 的 16 个回归组在 `src/cocos/` 下**全部有落地目录**：profiler / audio / video / web-view /
particle-2d / tiledmap / ui（26 文件全量）/ spine / dragon-bones / animation(marionette pose-graph) /
physics-2d / physics(builtin+cannon+bullet+physx) / rendering(post-process) / gfx(webgpu) /
2d（基座）/ deprecated.ts；另有关联闭包 `src/cocos/xr`（3 文件）与 `src/cocos/sorting`。

---

## 2. G0 基线对齐 —— 独立复核通过

| 项 | 计划书要求 | 独立核验结果 | 判定 |
|---|---|---|---|
| 冻结点 | 记录 cocos4 SHA 与版本 | `fffd9a514a`（bump 4.0.0-alpha.34）已登记于 UPSTREAM.md；冻结后 HEAD 另有 #341/#343 两个 native-only 提交，按 R7 不追（有明示） | ✅ |
| 漂移修复 #336 | create-mesh.ts 恢复 R16UI/R32UI 自适应 | `src/cocos/3d/misc/create-mesh.ts` 与 `git show fffd9a514a:cocos/3d/misc/create-mesh.ts` **md5 一致** | ✅ |
| 漂移修复 #338 | noise.ts 同步 | `src/cocos/particle/noise.ts` 与冻结点 **md5 一致** | ✅ |
| 漂移面修正 | 计划书原记 2 个漂移提交 | UPSTREAM.md 实测登记 **4 个**（追加 #334 TerrainInfo、#329 webgpu pipelinelayout），并附逐条 SHA——比计划书更完整 | ✅ |
| Deviation-01 关闭 | SHA 可得后关闭 | 已关闭，含关闭依据与后续引用口径（`cocos4 @ 4.0.0-alpha.34 (commit fffd9a514a)`） | ✅ |
| 全量比对脚本化 | 刷新三张清单 | `tools/compare/baseline-compare.cjs` + `docs/v12-baseline-compare.json` 现读：`upstreamTotal 1299 / common 1203 / drifted 6 / airOnly 38 / upstreamOnlyExcludingJsb 42` | ✅ |
| 簿记三件套 | UPSTREAM / 00-upstream-baseline / 17-baseline-comparison | 三者均有 V1.2 章节（r45e 逐字段改写留有快照与 diff 日志） | ✅ |

---

## 3. 抽取字节一致性 —— 独立抽样全部通过（16 组）

方法：对每组取全量（≤12 文件）或等距抽样 12 文件，与
`git show fffd9a514a:cocos/<同路径>` 逐字节对比。结果：

```
profiler 3/3        audio 6/6          video 9/9          web-view 5/5
particle-2d 10/10   tiledmap 11/11     ui 9/9(抽样)        physics-2d 12/12(抽样)
physics 12/12(抽样)  rendering 12/12    gfx 12/12          2d 11/11
marionette 12/12    webgpu 1/1         xr 3/3             deprecated.ts 1/1
```

- **零内容漂移**。唯一非上游文件：`src/cocos/spine/lib/air-spine-instantiate-js.ts`
  —— 查证 `upstream-file-map.json`：**已登记** `modified:true`，reason 说明系 Air 新增、
  经 cc.config moduleOverrides 顶替 spine-instantiate 入口（合规）。
- 计划书 §17.2 要求的两处「Air 修改恢复官方原文」均验证**逐字节一致**且登记关闭：
  `animation/marionette/pose-graph/runtime-exports.ts`（72/72 字节一致）、
  `physics/framework/physics-selector.ts`。
- `src/exports/` 与官方 `exports/` 对比：**38 个同名文件全部字节一致**，唯一 Air 特有文件
  为聚合入口 `air.ts`（设计如此）。
- `docs/extraction-manifest.json` 现读 1278 条，V12_REGRESSION_* 分类覆盖 16 组 + 依赖闭包
  （B4_XR_DEP/B4_CORE_DEP/P_EXTERNAL/RESID_ASSET 等），合计约 454 条，与计划书 ~400 估算相符。
  其中 `B4_XR_DEP` 的正当性已独立验证：上游 `cocos/ui/button.ts:41` 等确有
  `import ... from '../xr/event/xr-event-handle'`——xr 是 ui 的真实依赖闭包，**不是范围蔓延**。
- `docs/upstream-file-map.json`：1233 行 mapping / `modifiedCount 28`，逐条带 reason；
  含对 V0.x 自动生成时臆造 upstreamPath 的批量自我更正记录（由其 `verify:file-map` 门禁检出）。

---

## 4. 接线核验 —— 20/21，一处实缺

| 项 | 结果 |
|---|---|
| `src/exports/*.ts` 26 个新出口文件 | 全部存在且与官方同名文件字节一致（见 §3） |
| `src/cc.config.json` features | 计划书点名的 21 个 feature unit 中 **20 个在册**（audio / dragon-bones / particle-2d / physics-2d×4 / profiler / spine-3.8 / spine-4.2 / tiled-map / video / webview / ui / physics×4 / custom-pipeline / custom-pipeline-post-process） |
| **`gfx-webgpu` feature** | **官方 cc.config 有（第 22–26 行），Air cc.config 零处** —— 模块代码（`src/cocos/gfx/webgpu` 26 文件字节一致）与 `exports/gfx-webgpu.ts` 已就位，但 feature unit 未注册。与执行方台账 LV12-18「blocked（其 D10）」自述一致；这是该 blocked 状态的具体落点之一（修复动作 = 依官方原文补一段 feature JSON + WEBGPU 常量构建变体验证） |
| P1 npm 依赖 | `package.json` 精确按计划：`@cocos/box2d 1.0.2` / `@cocos/cannon 1.2.8` / `@cocos/dragonbones-js ^1.0.1`；另以 `src/node_modules/@cocos/*`（1.8M/1.0M/1.3M，含 LICENSE）落地 vendored 副本，符合「源码自包含、禁 postinstall」约束 |

---

## 5. 护栏与资产（只读可验部分）

| 护栏 | 独立核验 | 判定 |
|---|---|---|
| jsb 零进入 | `find src/cocos -name '*.jsb.ts'` → **0**；box2d-jsb 未抽取 | ✅ |
| bundle 预算 | `docs/v12-bundle-budget.md` 逐波记账（B0 3,736,163 → 现 6,081,668 dev **+62.8%** / min 3,499,182 **+64.3%**），含「无法按组拆分」的诚实归因注记与 sha256 链（`35496aebda066ab5` / `8795c8685ace28a1` 多轮重建逐字节不变） | ✅ 账本真实、增幅显著但已入账 |
| R8 wasm 资产 | `docs/v12-physics-asset-sourcing.md`：以可复跑命令链证明 **wasm 资产不在上游快照/git/npm 包内**（`external/` 仅 compression+deserialize、上游无获取脚本、@cocos/box2d 包内 .wasm 为 0）→ 计划书 D3 前提为假，按 D8「回归+降级」口径处理 | ✅ 结论有据、口径与计划书一致 |
| 许可 | `licenses/LICENSE_cannon.txt`、`LICENSE_box2d.txt` 新增；`THIRD_PARTY_LICENSES.md` 改版；spine `lib/LICENSE` 在库（Spine Runtimes License 合规性其台账列为 P2 待办） | ✅ 基础在位 |
| 运行时门禁 | jest 31→32 suites / 252→261 tests、三引擎矩阵 36/36、spec-validate --strict 57 frozen 等：**本轮未复跑**（只读约束 + #12/#13 授权门），仅对证据 JSON 计数做了现读交叉（52/52、partial=false 等与台账一致） | ⚠️ 交叉验证级，非复跑级 |

---

## 6. 与执行方台账的交叉验证

执行方自己的 `docs/acceptance-report-v12.md`（r45h 波）对未完成项的自报与我的独立观察**完全一致**，
无一处发现「自报完成但独立核验不通过」：

| 执行方自报 | 独立核验 |
|---|---|
| LV12-10 spine 例 **not-delivered**（`examples/spine-basic` 缺） | 确认：examples/ 下无 spine-basic ✅ |
| LV12-17 **blocked**（其 D11）、LV12-18 **blocked**（其 D10） | 确认：post-process 例 / webgpu feature 注册未落地（§4 实缺）✅ |
| LV12-20 **PARTIAL**（1 红项：api-coverage 口径） | 与 coverage 现状相符 ✅ |
| LV12-21 **in-progress**（五项前置：#12 证据入库授权、#9 D9 残留分类、#16 gfx-webgl2 口径、#17 仓库外路径、#18 api-coverage 口径） | `docs/evidence/v12` 现读 17 文件 on disk / **0 被 git 跟踪** → #12 属实 ✅ |
| 报告自我定位「推进快照，不是 V1.2 结案报告」 | 认可该定位 ✅ |

执行方的 F 台账（findings.jsonl，129+ 条）与待批决策表（#9/#12/#13/#16/#17/#18）格式规范，
含多处「就地自我更正」记录——账目纪律高于一般水平。

---

## 7. 审计发现的差距与风险清单

1. **`gfx-webgpu` feature unit 未注册**（cc.config 零处 vs 官方 2 处）——E1 批次 P3-② 未闭环，
   是 LV12-18 blocked 的具体落点。修复成本低（一段官方 JSON + WEBGPU 常量变体构建验证），
   但按执行方流程属 D10 待批面，不应绕过。
2. **`examples/spine-basic` 缺失**（LV12-10 第二列 not-delivered）——spine 代码 23 文件已
   字节回归、运行库在 bundle，唯示例链未交付。
3. **V1.2 成果全部未提交**：479 个工作树变更含全部 16 组 src/、10+ 新示例、证据与簿记。
   计划书 §17.5「每批次结束提交一次」因此**尚未履行**——执行方台账解释为待 #12/#13
   提交授权（证据 45→17 份只在工作树，丢失即失去 §12 取证层）。**建议尽快授权入库**，
   这是当前最大的丢失风险面。
4. **运行时门禁未获独立复跑**：本审计只读约束下，jest/build/min/三浏览器矩阵的当期绿色
   声明依赖执行方台账 + 证据 JSON 交叉；建议在 #13 提交授权后由第三方跑一轮
   `typecheck + test + build + build:min + 矩阵`做终验。
5. **规格链指纹多样性**：`v11-examples-verified.json` 现含 4 个不同 specFingerprint 值
   （手册波/V1.2 波多轮采集所致）——非缺陷（逐例规格本就不同），但与执行方
   「candidateFingerprint 单值」声明是两个不同字段，引用时勿混淆。

---

## 8. 结论

- **G0 与 16 组抽取的文件级事实全部独立复核通过**：冻结点纪律、漂移修复（3/3 逐字节）、
  抽取一致性（16 组抽样零漂移）、两处 Air 修改的官方原文恢复、exports 38/38 一致、
  manifest/file-map 登记完整且含自我更正、jsb 零进入、P1 依赖与 vendored 模式合规、
  R8 资产不可得结论有完整证据链。
- **执行方台账的诚实度经交叉验证成立**：所有 not-delivered/blocked/PARTIAL 自报与独立
  观察一致，未发现虚报；多处门禁（verify:file-map / feature-face / doc-refs / v11-chain-face
  等）构成可复跑的负向控制体系。
- **当前真实状态**：V1.2 为「代码与簿记接近收口、运行时取证与交付授权未收口」的推进快照。
  五个待批项（#12/#13/#16/#17/#18）+ spine 例 + webgpu feature 注册是剩余全部已知缺口。
- 建议下一步（按优先级）：① 授权 #12/#13（证据与批次成果入库，消除最大丢失风险）；
  ③ 补 spine-basic 例与 gfx-webgpu feature 注册（两者成本低）；③ 第三方复跑运行时门禁终验；
  ④ 处置 #16/#17/#18 三个口径类决策。

*审计证据脚本：`ai/tmp-audit-diff.cjs`（只读比对，审计后删除）。本报告不改动任何工作树文件。*
