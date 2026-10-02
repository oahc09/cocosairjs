# DragonBones 行为调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

日期：2026-09-23。所有结论后面都跟着产生它的命令与证据路径；没有实测支撑的一律标「待核」。

对象：`src/cocos/dragon-bones/**` + Example `examples/dragonbones-basic/`（计划书 B 段「龙骨（DragonBones）资产加载、动画播放、骨骼/插槽更新」）。

## 1. 逐字节回归（计划书护栏 2）

`src/cocos/dragon-bones/**`（11 个顶层 `.ts` + `assembler/` + `index.ts` + `category.json`）对官方 `E:/AIProMax/github/cocos4/cocos/dragon-bones/**` 同路径逐个 sha256 前缀（16 位）比对：

```
node E:/AIProMax/cocosair-scratch/db-probe/compare-dragonbones.cjs
→ {"files":14,"same":14,"diffCount":0,"missing":[]}      证据：db-probe/compare-dragonbones-r1.txt
node E:/AIProMax/cocosair-scratch/db-probe/check-registration.cjs
→ {"onDisk":14,"unregistered":0}                          证据：db-probe/check-registration-r1.txt
```

⇒ 14 个文件**逐字节同源**且全部已在 `docs/upstream-file-map.json` 登记（抽查锚点：L3362 `src/cocos/dragon-bones/ArmatureCache.ts`）。本组**无需**新增偏差条目。

## 2. Code First 入口：龙骨资产全部运行期构造（示例采用，已出图）

本例不用 Creator 的 uuid 依赖图，也不引入任何第三方龙骨导出文件。三段：

```js
const factory = CCFactory.getInstance();
// 图集：atlasJson 收「字符串」，texture 收 Texture2D
atlasAsset = new DragonBonesAtlasAsset(NAME);
atlasAsset.atlasJson = atlasText;
atlasAsset.texture   = texture;              // ← 必须自己包：见下
// 骨架：dragonBonesJson 同样收字符串
dragonAsset = new DragonBonesAsset(NAME);
dragonAsset.dragonBonesJson = skelText;
// 组件：三个 setter 建 armature（__preload → _init → _refresh）
display.setAnimationCacheMode(AnimationCacheMode.REALTIME);
display.dragonAsset = dragonAsset; display.dragonAtlasAsset = atlasAsset; display.armatureName = 'airdragon';
```

实测的四个入口坑（`matrix-dry-r2.json → probe.results.p1Construction`）：

| 点 | 实测 |
|---|---|
| `loadRemote(png,'.png')` 返回什么 | `pngAssetType:'ImageAsset'`，**不是** `Texture2D` ⇒ 必须 `const t = new Texture2D(); t.image = asset;`（`main.js:193 wrapTexture`）。直接把 ImageAsset 赋给 `atlasAsset.texture` 不通 |
| 手工构造时 uuid 从哪来 | `atlasUuid='AirDragon'`、`dragonUuid='AirDragon'`（数据名为空才生成的 hash 在此不出现）⇒ `armatureKey = 'AirDragon#AirDragon'` 且 `armatureKeyIsUuidHashAtlas:true`，`factory.getDragonBonesData(key)` 读回非空（`sameDataFromFactory:true`）。**两份资产同名不冲突**：key 是 `骨架uuid#图集uuid` 拼接 |
| `JsonAsset` 有没有用 | `loadRemote(*.json)` 得到 `JsonAsset`，但两个 setter 要的是**原文字符串** ⇒ 示例走 `fetch().text()`，`JsonAsset` 只登记「这条 URL 可加载」的事实 |
| 默认缓存模式 | `_cacheMode.value:'REALTIME:0'`、`isAnimationCached:false`（引擎默认即 REALTIME，`ArmatureDisplay.ts:515 _defaultCacheModeValue`）。示例仍显式设一次，因为钉帧取证只在 REALTIME 下有意义（cache 模式出图走缓存帧采样） |

资产本身由仓库内生成器产出，许可干净、可复跑：

```
node tools/fixtures/make-dragonbones-skeleton.cjs [--out=examples/dragonbones-basic/assets]
→ 写 AirDragon.json / AirDragon_atlas.json / AirDragon_atlas.png（64×64，3 个纯色 region：plate 绿 / wing 蓝 / tip 红）
```

## 3. 访问器与数据形状：先实测再用，不按记忆写

`main.js` 头部登记的这批事实全部来自实测 dump（合同 `results.p1..p6` 逐条可回读，任一条写错矩阵即红）：

| 假设 | 实测 |
|---|---|
| `display.armature` 是属性 | **是方法**（`armatureIsMethodOnDisplay:true`）⇒ 统一走 `attr()`；`armature.animation` 同理 |
| `factory.getTextureAtlasData(uuid)` 返回 AtlasData | 返回 **Array**（`factoryReturnShape.ctor:'Array'`），真正可读对象在 `atlasAsset._textureAtlasData`（`CCTextureAtlasData`，`width/height 64/64`、`scale 1`、`imagePath 'AirDragon_atlas.png'`、3 region、`renderTextureAttached:true`） |
| `SlotData` 层序字段 | `zOrder`（body0 / wing-left1 / wing-right2 / tail3），**没有** `z` |
| `AnimationData` 时间线形状 | 按 bone/slot 名索引的**映射**，值 `TimelineData[]`：`boneTimelines{root:[[11,0,0]], wing-left:[[12,10,25]], wing-right:[[12,18,50]]}`、`slotTimelines{tail:[[20,26,75]]}`（三元组 = `[type, offset, frameIndicesOffset]`，`type 20 = SlotDisplay`） |
| 换图判据看 `slot.display.name` | **错**：`Slot.display` 的 `name` 是 slot 名。真判据是 `slot.displayIndex` + `slot.rawDisplayDatas[index].name`（`regionOf()`） |
| 动画状态对象随时可读 | `anim._lastAnimationState` 要到**播过一帧后**才存在（更早采到 `null`）⇒ 状态形状必须放在钉帧之后采；时间字段实测名 `currentTime`（`stateTimeKey`） |
| `playAnimation(name, 0)` 会循环 | **不会**：`0` 在龙骨语义是「播一次后停」，探针看到 `isPlaying:false`。必须 `-1`（`afterIdle.playTimesProp:-1 / isPlaying:true`） |
| `AnimationData.parent` 可以省 | 不可省：为 `null` 时 `TimelineState.init` 直接抛（读 `_animationData.parent.frameRate`）⇒ `animationsHaveParent [[flap,true],[idle,true]]` 既是结构事实也是崩溃前置条件 |
| 骨骼旋转字段 | `wing.global` 形状 `{x,y,skew,rotation,scaleX,scaleY}`（ctor `Transform`），承载旋转的是 **`skew`**（`wingSkewKey:'skew'`） |

## 4. 动画播放证据分三层，防「只解析没渲染」与「只看数据没看像素」

**数据层**：`flap {duration:1, frameCount:24, playTimes:0, cacheFrameRate:0, cachedFramesLength:0}`、`idle` 同结构；`slotTimelines.tail` 的 `type 20` 就是换图时间线（第 26 帧偏移、frameIndices 偏移 75）。

**运行层**：钉帧序列 `FRAME_PLAN = [0,6,12,18,23]`，`gotoAndStopByFrame('flap', f) + advanceTime(0)` 后读 `tail` 的 display：

```
regionSequence = [[0,0,'plate'], [6,1,'tip'], [12,1,'tip'], [18,0,'plate'], [23,0,'plate']]
displayIndexSwapped = true      allFramesStable = true（每帧钉帧后跨真实渲染帧两次读姿态逐字段一致）
```

**像素层**（本组的关键设计）：三个 region 各是一种纯色 ⇒ 「采样到哪个颜色」= 「此刻贴的是哪个 region」，颜色就是换图出图的直接判据。在 `Director.EVENT_AFTER_DRAW` 回调内 `bindFramebuffer(null) + readPixels`（回调结束后 drawing buffer 即失效），2 像素步长计数（±24 容差）：

| 钉帧 | plate | wing | tip | 判读 |
|---|---|---|---|---|
| 0 | 120 | 114 | 0 | tail=plate（body+tail 两块绿叠贴） |
| 6 | 21 | 137 | **78** | tail 换到 tip：红出现 78 个采样点、绿从 120 掉到 21 |
| 12 | 15 | 116 | **78** | 同上，wing 姿态不同 |
| 18 | 120 | 135 | 0 | 换回 plate |
| 23 | 120 | 114 | 0 | 与帧 0 逐字段相同 ⇒ 24 帧循环「末=初」成立 |

⇒ 换图不是只改了 `displayIndex`：像素真的跟着换了（帧 6/12 的 `tipRenderedAtFrames`）。这条同时是 `frameChanged:true` 的来源之一。

**两个决定性与非确定性教训**：

1. 矩阵一次运行只调用 **一次** `window.__probe()`（`tools/verify/browser-matrix.cjs`），所以任何「多次采样累积」的量都变成挂钟依赖。首版合同钉 `live.tipSeenInLiveSampling`（`render.everTip`，随 probe 调用时刻而变）⇒ 三引擎全红：`probeEquals:live.tipSeenInLiveSampling want true got false`（`db-probe/matrix-dry-r1.json`）。它的确定性孪生量 `live.tipSeenInPerFrameSampling`（钉帧阶段采，`tipRenderedAtFrames.length>0`）在 `matrix-dry-r2.json` 三引擎全绿。合同据此把累积量降为 `probePresent`（存在性），只把钉帧量留作 `probeEquals`。
2. 终态读数**不是**逐引擎全等：当期全量矩阵里 chromium/firefox 的 `live.pixels.counts` 同为 `{plate:120, wing:137, tip:0, background:0}`，webkit 为 `{plate:117, wing:136, tip:0}`（2 像素步长 + ±24 容差下的光栅化差，3 个采样点）。合同因此对 `live.pixels.counts` 只用 `probeNonEmpty`（对象非空）+ `probePresent`（`.tip` 键存在），**不钉数值**；被钉成 `probeEquals` 的是钉帧通路：`tipRenderedAtFrames [6,12]`、`plateRenderedAtFrames [0,6,12,18,23]`、15 条 `regionSequence`、70 条 `goToFrame.*` 姿态 —— 这些三引擎逐字段一致。注意终态 `tip:0` 与 `tipSeenInLiveSampling:false` 是**同一事实的两面**（probe 那一刻 tail 正贴 plate），不是「红像素从不存在」。截图字节下界据实测 10898/12867/11521 定在 8000（对最小值留 ~27% 余量）。

## 5. 生命周期（§25）与 V1.1 证据链

资源合同：`hold()` 交 `dragonAsset / atlasAsset / texture` 三项，`release()` = 拆两个 setter + 三个 `destroy()`，`reacquire()` = 重新构造并挂回场景。踩到的一条真实坑：

> `release()` 已销毁 `Texture2D`，若 `reacquire()` 复用这个已销毁对象，工厂解析图集时读到 null，报 `Cannot read properties of null (reading 'length')`，validator `resource-released` FAIL。修法是 `reacquire()` 里重新 `loadRemote` 一张**有效**纹理再 `wrapTexture()`（`main.js:549-561`）。

门禁（当前状态见 §6 与验收报告；命令与产物）：

```
node tools/examples/spec-expectations.cjs apply --ids=dragonbones-basic   # 写 validationExpectations + 逐行 provenance
node E:/AIProMax/cocosair-scratch/db-probe/apply-evidence-one.cjs          # 单示例版 spec-evidence（全量工具无 --ids，避免在共用工作树重写 57 份）
node tools/examples/spec-evidence.cjs --check                              → 1220 evidence entries checked: 0 drifted / 0 detached-validator / 0 errors（exit 0，r2 现读 `db-probe/spec-evidence-check-r2.txt`）
node tools/examples/spec-validate.cjs --strict                            → 57 examples: 57 frozen / 0 draft / 0 blocked（docs/evidence/spec-validation.json，issues:[]）
NODE_PATH=… node tools/verify/example-spec-browser.cjs --ids=dragonbones-basic → PASS + promoted，46 units = 15 verified + 31 attested + 0 unproven
node tools/examples/generate-manifest.cjs                                 → examples/files.json 该行为 stable / specStatus frozen
node tools/examples/spec-compliance-audit.cjs                              → S11-STALE-EVIDENCE 必须 0 fail（见下）
```

- **`verified` 只到 15/46 是 tracer 机制边界，不是证据缺口**：`tools/verify/api-trace.cjs` 只包装 bundle 顶层导出表与 `Class.prototype`；只在 `dragonBones` 命名空间下可达的类（`ArmatureDisplay / CCFactory / Armature / Animation / ArmatureData / DragonBonesData …`）实测报 `no own descriptor on prototype` ⇒ state `unresolved` ⇒ 按 `tools/verify/example-spec-common.cjs:87-135` 的公式至多 `attested`。仓库内**没有**任何 PASS 示例的 `unproven>0`，本例保持 0。
- **规格链顺序是承重的**：`main.js` 行号一动，`api.evidence[].sourceLocation` 与 `validationExpectations[].provenance` 同时漂移。跳过刷新步的实测后果：`spec-expectations` 报 `出处行号与引文不符：main.js 引文实际在 L216，出处写 L210`；`v11-examples-verify` 报 23 个 `unproven`（`L509 未出现 playAnimation（行内容漂移）`）且 `0 promoted`。⇒ 改完 `main.js` 必须按上面顺序重跑，`example.json` 的任何编辑必须**早于**最后一次 `v11-examples-verify`。
- **S11-STALE-EVIDENCE 有牙**：本次在 `example.json` 追加 learning 条目后，`docs/evidence/spec-compliance.json` 立刻给出 `fail：证据 specFingerprint 66029ac700c7 ≠ 当前 example.json b2dffc7d449c`（陈旧证据冒充当期通过）。处置不是改阈值，而是用当期 spec 重跑 `v11-examples-verify` 再复审（§6 记录复跑结果）。

## 6. 三引擎矩阵与验收结论

**LV12-11 = PASS**（计划书 C2「龙骨资产加载、动画播放、骨骼/插槽更新」+ Example `examples/dragonbones-basic`）。

全量三引擎矩阵（12 行 × 3 引擎，`subset=false`）：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/verify/browser-matrix.cjs
→ 36/36 PASS across 3 engines → docs/evidence/browser-matrix/browser-matrix.json（completed=true，runPass=runTotal=36，measuredAt 2026-09-22T18:28:59Z）
   bundle 绑定：build/cocosair.module.js 6081668 B / sha256₁₆ 35496aebda066ab5（与 §12 三次构建前后同值）
   contractFingerprint dee8a12fe8b222f5（= 当期 tools/verify/browser-matrix-contract.json，含本组新行）
```

覆盖前已做逐字节快照：`db-probe/browser-matrix.snapshot-before-20260923-022022.json`（2046611 B，`db-probe/matrix-before.sha256`；旧文件 33 记录 = 11 行 × 3，正是覆盖率断言里缺的 dragonbones 三格）。

`dragonbones-basic` 三引擎逐条：`checks = {noConsoleError, noFailedRequest, frameChanged, pngBytesAboveFloor, probeAssertions}` **全 true**，`failedAssertions []`，`consoleErrors []`，`failedRequests []`（一次运行一次捕获）：

| 引擎 | 截图 | bytes | sha256₁₆ |
|---|---|---|---|
| chromium | `docs/evidence/browser-matrix/dragonbones-basic/matrix-chromium.png` | 10898 | 3f479b6f59c3974b |
| firefox | `…/matrix-firefox.png` | 12867 | ea7321c085f0e731 |
| webkit | `…/matrix-webkit.png` | 11521 | 63bf43310847543b |

合同规模：**247 条 `probeEquals` + 8 条 `probeNonEmpty` + 7 条 `probePresent`**。`probeEquals` 分布（按前缀计数）：P1 构造 15、P2 图集 33（含 19 条 region 矩形）、P3 骨架 53（含 25 条 `animations.*` 时间线三元组）、P4 运行层 21、P5 动画 101（含 70 条 `goToFrame.*` 姿态 + 15 条 `regionSequence`）、P6 合同面 2、`live.*` 7、`summary`/`phaseKeys` 2。三引擎的钉帧通路逐字段一致（终态 `live.pixels.counts` 例外，理由与合同分层见 §4 第 2 条）。

§12 四命令当期一轮（先跑：日志 `E:/AIProMax/cocosair-scratch/db-probe/section12-r1.log`；修完全链后复跑：`test-r3.log`）：

```
npm run typecheck → EXIT 0
npm test          → 首轮 TEST_EXIT 不可信（`npm test 2>&1 | tail` 之后取 `$?` 取到的是 tail 的码）
                    重定向复跑：r2 → EXIT=1（2 红），r3 → EXIT=0，31 suites / 252 tests 全绿
npm run build     → EXIT 0
npm run build:min → EXIT 0
构建前后 bundle sha256₁₆ 均为 35496aebda066ab5 ⇒ 三次构建未改产物字节
```

首轮 2 条红的完整归因（都不是引擎回归，是**新示例落地必然要过的簿记坎**）：

1. `smoke-30-v12-regression` 覆盖率断言缺 dragonbones 三格 + `contractFingerprint` 与旧证据不一致 ⇒ 全量矩阵重采（36/36）后同轮转绿（现读 `Test Suites: … smoke-30 … PASS`）。
2. `smoke-29-examples-spec` 的 `EXAMPLE_COUNT = 56` 硬编码在 `test/smoke/smoke-29-examples-spec.test.ts:46-47`（注释里带累加清单）⇒ 第 57 个示例进 `files.json` 后 §15/§23 两条同红。**修法是把常数与注释里的清单一起 +1**，不是放宽断言；改完 r3 全绿。
3. 另外中途出现过一条 `S11-STALE-EVIDENCE`（compliance 级，非 jest 断言）：见 §5 末条，处置=用当期 spec 重跑 `v11-examples-verify`。

当期最终门禁读数（一次连续复跑，全部 exit 0）：

```
node tools/examples/spec-evidence.cjs --check → 1220 entries checked: 0 drifted / 0 detached-validator / 0 errors
NODE_PATH=… node tools/verify/example-spec-browser.cjs --ids=dragonbones-basic → PASS dragonbones-basic，1/1 PASS，1 promoted / 0 demoted
node tools/examples/spec-validate.cjs --strict → 57 examples: 57 frozen / 0 draft / 0 blocked
node tools/examples/spec-compliance-audit.cjs  → 57 examples: 0 fail / 1 warn（唯一 warn 是既有 gltf-draco §25）
node tools/examples/generate-manifest.cjs      → 57 examples, 23 categories
```

当期 `examples/files.json` 行 `dragonbones-basic`：`status stable` / `specStatus frozen` / `promotion {spec cfd28d7885f1, source d9ccae6dfd74bdea, candidate 9fa85f88b968d5f1, verified 15, attested 31, units 46}`。

**单例 verify 之后必须用全量重跑收尾**（本轮踩到并已清偿）：`v11-examples-verify --ids=…` 只跑一行，但会把
`docs/evidence/examples-verified.json` 的**批次级字段**一起改写成 `partial:true / subset:["dragonbones-basic"] / runTotal:1`
（52 条记录本身仍全 PASS、`unproven 0`）⇒ 批次口径失真。收尾命令与现读：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/verify/example-spec-browser.cjs
→ 末行 "== Examples spec-driven verify: 52/52 PASS, 0 promoted / 0 demoted =="（日志 db-probe/v11-full-r41.log）
node db-probe/read-v11-full.cjs → {completed:true, partial:false, total/pass/runTotal/runPass:52, fail:0,
                                   apiProofTotals {verified:1004, attested:129, unproven:0},
                                   candidateMismatch:[], nonPass:[]}（输出 db-probe/v11-full-r41-read.json）
```

全量重跑后 `npm test` 再复跑一次以确认门禁仍绿：`db-probe/test-r4.log` → **`TEST_EXIT=0`，31 suites / 252 tests 全绿**。
⚠️ 该证据文件天然不可逐字节复现（记录里有 `calls/reads` 这类逐帧计数器），所以读它只能取**语义字段**，不能做 sha 比对。



## 7. 残留 / 未覆盖（诚实口径）

- 只覆盖 `AnimationCacheMode.REALTIME`。`ANIMATION` / `ANIMATION_ICACH` 共享缓存通路（`ArmatureCache.ts` / `ArmatureSystem.ts`）未覆盖；数据侧 `cacheFrameRate:0`、`cachedFramesLength:0` 也说明本例没做缓存帧烘焙。
- 未覆盖的引擎面（方法在实测 `armatureMethods` 里出现但未被调用）：`replaceTexture` / `addEventListener` / `hasEventListener`（龙骨事件帧 `EventObject`、`AnimationFrame` 事件）、`changeSkin` / 多 skin（本例只有 `default`）、`AttachUtil` 挂点、IK 与变换约束（`_constraints` 为空，`constraintTimelines` 未生成）、mesh / 蒙皮顶点（`SkinnedCluster`；本例 display 全是矩形 `ImageDisplayData`，`rotated:false`、`frame==rect` 尺寸）、`WorldClock` 手工驱动。
- 数据格式只钉 DragonBones **5.5 文本**（`dataVersion '5.5'`），二进制导出通路未覆盖。
- 像素判据是 ±24 容差的近似色计数：三引擎在固定 480×360 视口逐字段一致，但未覆盖 DPR≠1 / 高分屏 / 其他 `ResolutionPolicy` ⇒ **待核**。
- Spine（同段另一骨骼框架，LV12-10）未在本期交付，未开重复 finding。⚠️ **r45f 订正**：本行原文把归因写成「仍按决策 **D2**」，但 **D2 没有任何 owner 批复记录**
  （`docs/reference/owner-decisions.md` 第 9 行批复列为空）⇒ 现状只能是「**D2 尚未批复**」；且 r45e 实测运行级卡点是上游 alpha.34 Web 侧 spine **只有 emscripten 后端**
  （`src/cocos/spine/lib/spine-core.js` = 3,747 B、全仓无 spine 的 `.wasm/.asm.js/.mem`），与 D3/R8 属同一份资产缺口，不是「归属决定」。资产限制详见 `docs/notes/spine-asset-sourcing.md`。
