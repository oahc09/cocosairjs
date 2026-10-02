# 2D 粒子行为调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

日期：2026-09-22（本轮 r33）。所有结论后面都跟着产生它的命令与证据路径；没有实测支撑的一律标「待核」。

## 1. 逐字节回归（计划书护栏 2）

`cocos/particle-2d` 与两条出图链上的 `2d/renderer` 文件，对官方 `E:/AIProMax/github/cocos4/cocos/**` 逐个 sha256 前缀比对：

- `src/cocos/particle-2d/` 全部 **11** 个文件：SAME
- `src/cocos/2d/renderer/{render-data,batcher-2d,base,render-draw-info}.ts`：SAME ⇒ `docs/upstream-file-map.json` 无需新增偏差条目

## 2. Code First 入口一：`ParticleAsset` 运行时构造（示例采用，已出图）

无 Creator 管线时的可用通路，三段都在真实上游代码里：

```js
assetManager.parser.parsePlist(xmlText, {}, (err, dict) => ...);   // 官方解析器，喂自己生成的 plist 文本
const asset = new ParticleAsset();
asset._nativeAsset = dict;                                          // 绕过 Creator 的 .plist → _nativeAsset 灌值
ps.custom = false;
ps.file = asset;                                                    // 走 _applyFile → _initWithDictionary
```

`ps.file` setter（`particle-system-2d.ts:922-949`）在 `custom=false` 分支会读 `file.nativeUrl` 并调 `_initWithDictionary(file._nativeAsset)`，即与 Creator 资产同一条通路。

证据：`examples/particle-2d-basic/`（`main.js` 的 `applyPlist()` / `plistXml()`）·
`node tools/verify/example-spec-browser.cjs --ids=particle-2d-basic` → `PASS particle-2d-basic`、`1 promoted`（`docs/evidence/examples-verified.json`）·
`node tools/verify/browser-matrix.cjs --ids=particle-2d-basic` → `3/3 PASS across 3 engines`、`completed=true`（`docs/evidence/browser-matrix/browser-matrix.json`，截图 `docs/evidence/browser-matrix/particle-2d-basic/matrix-{chromium,firefox,webkit}.png`）。

## 3. Code First 入口二：`loadRemote('.plist')` —— 可用（spike1 的"零粒子"是 spike 自己的键名 bug，见 §3.1 与 §4.4）

实测脚本（仓库外 scratch）：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules \
  node E:/AIProMax/cocosair-scratch/v12-logs/spike-plist-remote.cjs
```

读数（`E:/AIProMax/cocosair-scratch/v12-diag/plist-remote.json` → `out`）：

| 断言点 | 实测 |
|---|---|
| `loadRemote(url, {ext:'.plist'})` | `err:null`，**类型是裸 `Asset` 不是 `ParticleAsset`**（`ctor:'Asset'`），`_nativeAsset` 有 13 个键、`textureFileName:'dot.png'` 已在 dict 里 |
| `loadRemote(url)`（不给 ext） | 同样返回裸 `Asset` ⇒ 扩展名推断不改变类型 |
| plist 内 `textureFileName` 的贴图支 | **可用**：`_renderSpriteFrame.texture` 尺寸 `[64,64]`（正是远端 `dot.png`），`_spriteFrame` 仍是 `null`（见 §4.2），`/diag/fire.plist` 与 `/diag/dot.png` 两个请求均 200 |
| 出图（spike1） | 三个系统 `particles.length=0`、`vertexCount=0` ⇒ 当时判 PARTIAL。**根因不是引擎，是 spike 自己把寿命键写成了 `life`**（见 §4.4） |

已排除的猜测：不是 `playOnLoad` 错过窗口（`_stopped` 本就 `false`，显式 `resetSystem()` 后仍 0）。

### 3.1 结案：spike2 用四个可判别用例证明这条入口可用（r34）

命令：`NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node E:/AIProMax/cocosair-scratch/v12-logs/spike-plist-remote2.cjs`
证据：`E:/AIProMax/cocosair-scratch/v12-diag/plist-remote2.json` + `plist-remote2.png`（同一形状的旧失败态留档为 `plist-remote2-life0key.json/png`，未覆盖）

| 用例 | 差别 | 实测 |
|---|---|---|
| C1 | 远端 `.plist` 资产，**节点激活前**赋 `file` | `particles.length=97`、`vertexCount=388`、`_canRender()=true`、`_renderSpriteFrame.texture=[64,64]`（远端 `dot.png`）、`srcBlend/dstBlend=2/1` |
| C2 | 远端 `.plist` 资产，**激活后**才赋 `file`（spike1 的时序） | `count=96`、`vertexCount=384`、`canRender=true` ⇒ 与 C1 同 ⇒ `file` setter 确实会调 `_applyFile()`，赋值时序无关 |
| C3 | 运行时构造 `ParticleAsset`（§2 通路，对照组） | `count=94`、`vertexCount=376`，但 `canRender=false`、`rsfTexSize=null`（该 dict 无 `textureFileName` 且没另赋帧）⇒ 证明"发射"与"出图"是两件事 |
| C4 | 对 C2 手工 `simulator.step(1/60)×30` | `count=93` ⇒ 定步驱动同样有效 |

⇒ 计划 B2 那句「支持 `PlistAsset` 运行时构造 + `loadRemote('.plist')` 两种路径」**两条都已证**。两点 Code First 注意事项：

1. `loadRemote('.plist')` 拿到的是**裸 `Asset`（`ctor:'Asset'`，不是 `ParticleAsset`）**，带 `_uuid` 与否都不改变这一点；但 `ParticleSystem2D.file` 的 setter 只消费 `nativeUrl` + `_nativeAsset`，所以裸 `Asset` 直接可用（`ps.file = await assetManager.loadRemoteAsync(...)`）。若代码按 `instanceof ParticleAsset` 做门控就会误判为不可用。
2. 不给 `ext` 与给 `ext:'.plist'` 结果一致；`textureFileName` 是相对 `nativeUrl` 解析的（`path.changeBasename`），所以远端 plist 与它的贴图必须同源同目录，离线部署要一并带上（呼应 F-79 的部署物自足问题）。

## 4. 四个非显然点（都已进 `example.json` 的 `learning.points` / `api.forbiddenShortcut`）

### 4.1 plist 的 blend 值不能写裸 GL 常量（F-96）

官方 plist 常见 `blendFuncSource:770 / blendFuncDestination:1`（`GL_SRC_ALPHA`/`GL_ONE`）。引擎用 `wrapParseInt` **原样**塞进 gfx 的 `BlendFactor` 枚举槽位，而该枚举只到 14（`src/cocos/gfx/base/define.ts:505`），既不校验也不换算；WebGL 侧越界值被当作 `GL_ZERO` ⇒ `src×0 + dst×1`，**粒子全模拟正常、零 GL 错误、一个像素都不改**。必须写 gfx 枚举：`ZERO=0、ONE=1、SRC_ALPHA=2、ONE_MINUS_SRC_ALPHA=4`。

A/B 实测：同一条 URL 加 `?gfxblend=1`（把三个系统改回 gfx 枚举）后四个变体全部出图（`E:/AIProMax/cocosair-scratch/v12-diag/diag-2-nopack1gfxblend1.png`）。示例的 P10 故意保留裸 770 来断言"引擎透传不换算"（`results.p10.blendPrivate.src=770`），并把 plist 无 blend 键时的默认值钉成 `src=2/dst=4`（`results.p10BlendDefaults`）。

### 4.2 程序化帧读不回 `_spriteFrame`，但也不会被 `file` 吃掉

`spriteFrame` setter 只在 `!value || value._uuid` 时写 `_spriteFrame`；运行时 `new SpriteFrame()` 没有 uuid ⇒ `_spriteFrame` 恒 `null`，帧只在 `_renderSpriteFrame` 里（断言只能读后者）。

本轮更正了一条我先前写错的结论：**赋值顺序不影响结果**。`_applyFile` 的覆盖条件是 `this._spriteFrame !== file.spriteFrame`，运行时帧使左边为 `null`、未赋帧的 `ParticleAsset` 使右边为 `null` ⇒ 不覆盖；而会把帧换成内置 2048×2048 图集子矩形（uv `0.0009765625…0.0322265625`）的 `_initTextureWithDictionary` 只在 `custom=true` 分支才可达（`particle-system-2d.ts:942-944`）。实测四个变体的 `_renderSpriteFrame` uv 恒为整帧（`E:/AIProMax/cocosair-scratch/v12-diag/diag.json`）。已据此删掉 `main.js` 里为"顺序"加的 `ownedFrame`/`setParticleFrame` 机制并改写 `example.json` 文本。

### 4.3 确定性三件套

`math.setRandGenerator(seed)`（注意 `setRandGenerator(math.random)` 会自递归）+ 手工定步 `simulator.step(1/60)×N` + 显式钉住 `assembler.maxParticleDeltaTime`（首取时被冻结成 `game.frameTime/1000*2`≈0.0333，会把 dt 悄悄夹小）+ 数值统一保留 4 位小数。缺任一条，矩阵断言在 Firefox/WebKit 上就会漂。

### 4.4 plist 的寿命必须写 `particleLifespan`，写 `life` 会静默零粒子（F-98）

`_initWithDictionary` 读的是官方键：`this.life = wrapParseFloat(dict.particleLifespan || 0)`（`particle-system-2d.ts:1047`）；`life` 这个键引擎**根本不读**。当 `emissionRate` 也缺省时，它会按 `Math.min(this.totalParticles / this.life, Number.MAX_VALUE)` 反推（:1055）——`life=0` 时就是 `Number.MAX_VALUE`。

后果是纯静默：`step()` 里 `rate = 1 / emissionRate ≈ 5.6e-309`，第一帧就把 `totalParticles` 个槽位灌满，而每个粒子 `ttl=0` 在同一帧的更新里即死，所以任何时刻观测到的都是 `particles.length=0`、`vertexCount=0`，控制台与 GL 都没有任何提示。它和 §4.1（blend 越界）、贴图没上传在观测面上同形。

- 这条就是 §3 spike1 误判的直接原因（当时以为 `loadRemote` 通路坏了）。
- 已在示例里钉成回归断言 P11：`results.p11NoLifespan = { life:0, emissionRateIsMaxValue:true, totalParticles:40, count:0, vertexCount:0 }`，合同 `tools/verify/browser-matrix-contract.json` 逐值断言（三引擎读数一致）。
- **负控（r34 实测）**：只给 P11 那个 dict 补上 `particleLifespan: 1.2`，`tools/verify/browser-matrix.cjs --ids=particle-2d-basic` 从 `3/3 PASS / completed=true` 翻成 `0/3 PASS / EXIT 1 / completed=false`，三引擎都报 `results.p11NoLifespan.life expected 0 actual 1.2`、`emissionRateIsMaxValue expected true actual false`，同时 `count:5, vertexCount:20` ⇒ 断言有牙，且正反两向都自洽。改回后全量矩阵复绿。

## 5. 门禁台账（LV12-07 本例，r34 现读）

| 命令 | 结果 | 证据 |
|---|---|---|
| `node tools/examples/spec-validate.cjs --strict` | EXIT 0，`51 examples: 51 frozen / 0 draft / 0 blocked` | `docs/evidence/spec-validation.json` |
| `node tools/examples/spec-evidence.cjs` | `3 drifted / 0 detached-validator / 0 errors`（P11 插入后行号回填） | 回填 `api.evidence[].sourceLocation` |
| `…node tools/verify/example-spec-browser.cjs --ids=particle-2d-basic` | `PASS`，`1 promoted` ⇒ `status=stable`，`promotion{spec:d8a9dd22b4c3, source:e87330f4b1d52ba0, candidate:9fa85f88b968d5f1, verified:22, attested:12, units:34}`（0 unproven） | `docs/evidence/examples-verified.json` |
| `…node tools/verify/browser-matrix.cjs`（**全量，不带 `--ids`**） | `18/18 PASS across 3 engines`，`completed=true`，`subset=false`，contract `b35292f9fe29d1ca`（61 条 `probeEquals`） | `docs/evidence/browser-matrix/browser-matrix.json` + `docs/evidence/browser-matrix/<例>/matrix-{chromium,firefox,webkit}.png` |
| `npx jest --ci` / `npm run typecheck` / `npm run verify:test-inventory` | 252/252（31 套件）/ EXIT 0 / `failures=[]` | `docs/test-inventory.json` |
| `node tools/examples/spec-compliance-audit.cjs --warn-ok` | 51 例 `0 fail / 1 warn`（唯一 warn 是 gltf-draco 的诚实 BLOCKED） | `docs/evidence/spec-compliance.json` |

顺序规则（踩过的坑）：改过 `main.js` 行号后必须 `spec-evidence.cjs` → 再跑 verify，否则 `sourceLocation.line` 失配会让 `bound=false`，全部单元从 `verified` 降级成 `attested/unproven`，示例掉回 `draft`。`validationExpectations.*.provenance[].line` 由 `spec-expectations.cjs apply` 写，但它对已存在的条目不重算，行号漂移后要手工校正（本轮 7 个结点的 `transform-equals` 出处即手工钉正）。

## 6. 残留与待决

1. ~~`loadRemote('.plist')` 出图未证~~ ⇒ r34 已结（§3.1），LV12-07 对计划书 B2 的两条 Code First 入口均为 PASS。
2. 引擎侧对 plist 的两处静默口径（blend 越界、缺 `particleLifespan` 反推出 `Number.MAX_VALUE`）是否加校验/告警：属官方逐字节文件改动，不动，待 owner 决策；示例与合同已把当前行为钉成回归断言。
3. 全量 `npm run verify:browser-matrix`（6 例 × 3 引擎）r34 已跑（18/18、`subset=false`）；**全量 `example-spec-browser.cjs`（51 例，不带 `--ids`）仍未跑**，当前 `docs/evidence/examples-verified.json` 是逐例子集补采的合成结果 ⇒ 报数时必须说明这一点。
4. `particle-2d` 的 34 个 unit 里 12 个只能是 `attested`（引擎侧无 instrument 点），要升到 `verified` 需要 api-coverage 口径决策（见 #9）。

相关：`docs/audits/global-quality-audit-2026-09-19/findings.jsonl` F-96 / F-97。
