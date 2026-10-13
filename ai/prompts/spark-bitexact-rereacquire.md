# 任务：为 Spark 数学层「复用回退」后的源码重采浏览器证据

> 执行者：另一个 agent。本文件自包含，不依赖任何对话上下文。请先通读再动手。

## 0. 一句话目标

`src/air/spark/spark-math.ts` 在 2026-10-13 被回退成**全量委托 `cc.*`**（owner 指令「复用 cocosair 元素，不重造轮子」）。
回退后源码字节已变，但**盘上所有浏览器证据都还绑在回退前的变体产物**上。
本任务的唯一目标：**重建变体产物，并重采浏览器门禁证据，使其绑定回退后的源码状态**。不重采就等于证据与源码脱钩。

## 1. 你必须先核实的事实（不要凭本文件措辞下结论）

```bash
cd E:/AIProMax/github/cocosair.js

# 1.1 回退后的数学层源码（回退前为 output/spark-math-before-reuse-revert.ts，若该文件仍在）
sha256sum src/air/spark/spark-math.ts          # 期望 a4246b3bffae62e26c2a3c5f9ce9a872534f4af111872fe00fdec4c0a4964215
ls -la src/air/spark/spark-math.ts             # 期望 85957 B

# 1.2 当前变体产物 —— 这是「回退前」的陈旧字节，正是要替换的对象
sha256sum build/cocosair.module.spark.js       # 期望 0107b4405c3ae64a6c2ceeaf8a6b73bf77e7cce3262396ef4130a544e8f46c25
ls -la build/cocosair.module.spark.js          # 期望 9467101 B（陈旧）
node -e "console.log(require('./tools/build/build-number.json'))"   # 期望 lastBuildNumber >= 80

# 1.3 参考仓库（门禁默认 --port-repo=../spark-cocosairjs）必须带参考产物
ls ../spark-cocosairjs/dist/{three-reference.js,three.core.js,spark-reference.js}
ls ../spark-cocosairjs/dist/reference-addons/postprocessing/Pass.js
```

**`output/` 目录当前可能不存在**（它是 gitignore 的 scratch 目录，本轮曾被清空）。若不存在：
`mkdir -p output`，并且注意——**原先的套件脚本 `output/run-bitexact-browser-suite.sh`、
`output/assemble-bitexact-matrix.cjs`、`output/_verify_bitexact_suite.cjs` 是 scratch 且已被删除**。
不要试图「恢复」它们；两种做法二选一：

- **(A) 重建套件脚本**（推荐，能保住既有的顺序执行 / SKIP / 不自改标签纪律）；或
- **(B) 直接逐条驱动 §3 的门禁命令**，按 §4 自行核对一致性。

无论选哪种，本文件 §3 给出的命令行参数是**权威来源**，照抄即可。

## 2. 重建变体产物（必做，且必在跑门禁之前）

`build/cocosair.module.spark.js` 是**变体构建**产物，`tools/build/build.cjs` 不会自动写到那里，
必须两步（`AIR_FEATURES` 是**覆盖语义**，必须列满默认 26 项再追加 `spark`）：

```bash
cd E:/AIProMax/github/cocosair.js
AIR_FEATURES=air,base,gfx-webgl2,gfx-empty,3d,animation,skeletal-animation,primitive,tween,custom-pipeline,legacy-pipeline,profiler,video,webview,2d,physics-2d-framework,particle-2d,tiled-map,ui,spine-3.8,spine-4.2,dragon-bones,physics-2d-box2d,physics-builtin,physics-cannon,custom-pipeline-post-process,spark \
  AIR_OUT_DIR=output/spark-variant npm run build

cp output/spark-variant/cocosair.module.js     build/cocosair.module.spark.js
cp output/spark-variant/cocosair.module.js.map build/cocosair.module.spark.js.map
```

**硬约束：**
- `AIR_BUILD_NUMBER` 会自增（≥81）。**绝不允许重置它**，也绝不允许手工改 `tools/build/build-number.json`。
- 新产物的 sha256 **必然**不同于 §1.2 记录的 `0107b440…`，这是预期的——旧的 16 份证据正是因此失去绑定。
- 落位后立即验证产物确实带上了 Spark：

```bash
npm run verify:spark-assets     # 期望 exit 0
npm run verify:spark-adapter    # 期望 exit 0（exportedMembers=150/annotatedMembers=150、findings: []、rootExportLeakage: []）
```

- 记下**新产物的 sha256 与字节数**，§4 的一致性核对与 §5 的证据落盘都要用。

## 3. 浏览器门禁命令（逐条跑，playwright 参数必给）

**Playwright 不在本仓**（`node_modules/` 无 `playwright`，`require.resolve('playwright')` 会 MODULE_NOT_FOUND）。
本环境可用的绝对路径：

```
E:/AIProMax/TraeStyler/trae-styler-web/node_modules/playwright/index.js
```

先用 `ls` 确认它存在；若不在，自行 `npm i -D playwright`（或找 `$LOCALAPPDATA/ms-playwright` 里已有的浏览器）
并**在提交证据时如实写清 playwright 来源与版本**。下列每条命令都用 `--playwright=<上面的绝对路径>`。

三个浏览器门禁共同的参数规则（**别记错**）：
- `--out=` 必须是 `output/` 下的**全新** `.json`，**门禁在 `out` 已存在时会直接 assert 失败**；
- `--sdk=` 只接受 `build/<name>.js` 形态（默认 `build/cocosair.module.spark.js`）；
- `--browser=all|chromium|firefox|webkit`（可逗号分隔）。

### 3.1 像素门禁（画布比例 × DPR 矩阵，11 窗口 × 三浏览器）

用例固定为 4 个对视口/裁剪敏感的场次：`seeded-random400,procedural-text-splats,orthographic-camera,inset-viewport-scissor`。

```bash
cd E:/AIProMax/github/cocosair.js
PW=E:/AIProMax/TraeStyler/trae-styler-web/node_modules/playwright/index.js
CASES=seeded-random400,procedural-text-splats,orthographic-camera,inset-viewport-scissor

# 11 个窗口，逐条跑（每条写自己的 --out）
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-square-dpr1.json    --cases=$CASES --playwright="$PW" --width=256 --height=256 --dpr=1
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-5x4-dpr1.json       --cases=$CASES --playwright="$PW" --width=320 --height=256 --dpr=1
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-ultra-dpr1.json     --cases=$CASES --playwright="$PW" --width=512 --height=224 --dpr=1
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-square-dpr2.json    --cases=$CASES --playwright="$PW" --width=256 --height=256 --dpr=2
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-tall-dpr2.json      --cases=$CASES --playwright="$PW" --width=224 --height=512 --dpr=2
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-5x4-dpr15.json      --cases=$CASES --playwright="$PW" --width=320 --height=256 --dpr=1.5
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-tall-dpr15.json     --cases=$CASES --playwright="$PW" --width=224 --height=512 --dpr=1.5
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-square-dpr3.json    --cases=$CASES --playwright="$PW" --width=256 --height=256 --dpr=3
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-5x4-dpr125.json     --cases=$CASES --playwright="$PW" --width=320 --height=256 --dpr=1.25
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-ultra-dpr125.json   --cases=$CASES --playwright="$PW" --width=512 --height=224 --dpr=1.25
node tools/verify/spark-pixel-parity.cjs --out=output/spark-pixel-parity-be-square-dpr1375.json --cases=$CASES --playwright="$PW" --width=256 --height=256 --dpr=1.375
```

另外两条整轮像素行（三浏览器 × 6 场景 / 默认窗口）：

```bash
node tools/verify/spark-pixel-parity.cjs --out=output/spk13-pixel-parity-20261013.json --playwright="$PW"
```

> 「固定 6 场景」的默认窗口像素行是否要重采，取决于发布口径：矩阵 11 行覆盖的是视口/DPR 敏感面，
> 这一条覆盖全场景。两者都采最稳妥。

### 3.2 DPR 不一致门禁（三浏览器，各一份）

```bash
node tools/verify/spark-dpr-mismatch-parity.cjs --out=output/spk13-dpr-mismatch-parity-chromium-20261013.json --browser=chromium --playwright="$PW"
node tools/verify/spark-dpr-mismatch-parity.cjs --out=output/spk13-dpr-mismatch-parity-firefox-20261013.json  --browser=firefox  --playwright="$PW"
node tools/verify/spark-dpr-mismatch-parity.cjs --out=output/spk13-dpr-mismatch-parity-webkit-20261013.json   --browser=webkit   --playwright="$PW"
```

### 3.3 CPU 面 parity（三浏览器）

```bash
node tools/verify/spark-cpu-parity.cjs --out=output/spk13-cpu-parity-3engine-20261013.json --browser=all --playwright="$PW"
```

### 3.4 原生 gfx 探针（可选，视发布口径）

```bash
node tools/verify/spark-native-gfx-probe.cjs --out=output/spk13-native-gfx-probe-20261013.json --browser=all --playwright="$PW"
```

### 3.5 数学层逐位 parity（不出浏览器，但必跑）

```bash
node tools/verify/spark-math-parity.cjs --evidence=output/spk04-math-parity-20261013.json
```

**预期 `exit 1` / PARTIAL，这是已知且被接受的 OPEN 偏差，不是失败信号**：
回退后的纯委托（gl-matrix 血统）↔ three 运算次序在末位固有差异，
实测 `toleranceViolations 0`（容差 2e-10 / project 1e-8 **未放宽**，maxAbs ≈1.53e-11）、
`float32BitMismatches 2110 / 152003`（真实位差 605 + 仅 ±0 符号零 1505）。
**禁止**为了把它变绿而放宽 `toleranceViolations` 或逐位字节条件——该字节条件早于本轮回退即存在。

### 3.6 WASM/数据面（无浏览器依赖，可随时跑）

```bash
npm run verify:spark-data-parity     # 期望 72 PASS / 0 FAIL
```

## 4. 一致性核对（装配证据前必做）

所有浏览器报告必须满足：

1. `passed === true`；每个 `results[].cases[].passed === true` 且 `channelMismatch === 0`；
2. 每份报告里 `fingerprints['build/cocosair.module.spark.js']` **等于 §2 重建产物的 sha256**——这是「绑定回退后源码」的唯一凭据；
3. `sourceUnchanged === true` 且 `drift` 为空数组（采集窗口内源码未被改动）；
4. 每份报告都有会动的 negative control（`negativeControl.perturbedMismatch > 0 && negativeControl.passed`）。

**任一条不满足，就如实记录为失败行，不得改标签、不得静默丢弃、不得重跑刷绿。**
（原先的 `output/_verify_bitexact_suite.cjs` 就是这个校验器；若重建，请保持它「按盘上产物 sha 反查每份报告」的机制。

## 5. 证据落盘与文档更新（在**不**改动源码/产物的窗口外执行）

1. 把通过核对、绑定新产物的报告拷进 `docs/evidence/spark/`，命名沿用既有惯例，把日期换成 `20261013`
   （例：`spk13-pixel-parity-20261013-bitexact.json`、`spk13-pixel-parity-viewport-matrix-bitexact-20261013.json`、
   `spk13-dpr-mismatch-parity-{chromium,firefox,webkit}-20261013-bitexact.json`、
   `spk13-cpu-parity-3engine-20261013-bitexact.json`）。**不要覆盖**任何 `…20261012…` 的历史文件。
2. 在**每份**新证据里写清绑定时点：`AIR_BUILD_NUMBER`、产物 sha256、产物字节数、playwright 来源/版本、
   `spark-math.ts` 的 sha256（`a4246b3b…`）。措辞要能自证是「回退后」=「全量 `cc.*` 委托版」的采集。
3. 更新这些文档里「证据绑定时点（如实说明）」的段落，把「没有任何一份在盘浏览器证据重新绑定当前源码」
   改成「已按 2026-10-13 复采，绑定产物 sha `<新 sha 前 12 位>`」：
   - `docs/reference/spark-optional-entry.md`（§数学层逐位残差那段 + 结尾历史采集记录）
   - `docs/UPSTREAM.md`（§Spark 数学层逐位残差 deviation 的「回退记录」）
   - `ai/ledgers/spark-integration.md`、`ai/plans/spark-integration.md`
4. 文档里出现的 `…20261012-bitexact…` 文件引用，若已被新版取代，要么同步改指新文件，要么明确标注为「历史采集」，
   **不得留下指向已被取代产物的现状性断言**。改完跑 `npm run verify:doc-refs` 确认引用仍解析得到。

## 6. 红线（违反即任务失败）

- **不改 `src/external/`**；**不重置 `AIR_BUILD_NUMBER`**；**保持 `vendor/spark` 与 `vendor/spark-rs` 字节完全一致**；
- **不弱化任何门禁的接受标准**（尤其逐位字节条件与容差）；
- **不提交 / 不 push / 不发布 / 不部署**；
- **不声明 release READY**——本任务只负责让浏览器证据重新绑定回退后的源码，是否发运由 owner 决定；
- 报告必须如实：真实退出码、真实失败行、真实未覆盖项。**宁可报红，不许改口径**。

## 7. 交付物

1. 重建后的 `build/cocosair.module.spark.js`（+`.map`）与新 sha256/字节数；
2. `docs/evidence/spark/` 下绑定新产物的证据文件（附采集窗口、命令、工具版本）；
3. 上面 §5.3 的文档更新；
4. 一段**简报**：新产物 sha、各门禁真实退出码与行数统计、数学层 parity 的 PARTIAL 结构、
   以及「哪些旧证据被取代、哪些保留为历史」的清单。

## 8. 完成后自检清单

- [ ] `npm run verify:spark-assets` / `verify:spark-adapter` / `verify:spark-cpu-parity` / `verify:spark-data-parity` 全 exit 0
- [ ] 每份浏览器证据都带新产物 sha，且 `sourceUnchanged === true`、`drift` 为空
- [ ] 数学层 parity 记录为 PARTIAL（`exit 1`），量级与 §3.5 一致，未放宽任何容差
- [ ] `docs/evidence/spark/` 无覆盖历史文件；`npm run verify:doc-refs` 通过
- [ ] 未 commit / 未 push；`AIR_BUILD_NUMBER` 只增未减；`vendor/**` 字节未变
