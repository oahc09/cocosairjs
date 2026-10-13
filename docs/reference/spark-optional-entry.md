# Spark 可选入口边界（SPK-11/12/14 登记；2026-10-12 接线后复采）

本页登记 Gaussian Splatting 运行时（上游 `@sparkjsdev/spark` 2.3.1，冻结源码落 `vendor/spark/`）在本 SDK 里的**发运形态与消费边界**。
来源身份、WASM provenance 与默认 bundle 断言在 [上游差异](../UPSTREAM.md)（§Spark 冻结上游源码、§Spark WASM 与 glue 的 provenance、
§Spark 发运边界与接线状态），许可在 [第三方许可](../THIRD_PARTY_LICENSES.md) §8。本页不重复字节指纹，只回答「用户怎么用、能用到什么、不能期待什么」。

> **接线状态（2026-10-12 实测）**：SPK-11/SPK-12 已落地——`spark` feature unit 已声明、`src/exports/spark.ts` 存在、
> 构建期生成子树 `src/air/spark/generated/` 与资产审计门禁 `npm run verify:spark-assets` 均在位。
> 但**发运形态与本页首版登记的裁定形态有两处真实差异**：（1）WASM 不采 `build/spark-rs/` 独立资产目录，而是构建期 base64 内联进
> spark 变体产物；（2）未开 `cocosair.js/spark` 包内子路径导出，可选性走**变体构建**而非包入口。两处差异的原因与复议条件见
> [上游差异](../UPSTREAM.md) Deviation-07 的「WASM 边界」「公开面边界」两条。执行事实以 `ai/ledgers/spark-integration.md`
> 的 SPK-11/12 条目与 `docs/evidence/spark/spk12-bundle-boundary-wired-20261012.json` 为准。

## 归属与边界

- Spark 是**第二个上游**，不受 cocos4 抽取口径（`docs/upstream-file-map.json` 的同名逐字节比对）覆盖；其字节对账由
  `node tools/build/vendor-spark-tree.cjs --check` 负责，登记为 `docs/UPSTREAM.md` 的 Deviation-07。
- 本仓不运行 Three.js。冻结源码里的 `three` specifier 只在**构建期**别名到 `src/air/spark/spark-api-adapter.ts`
  （数学/场景图/纹理/渲染目标形状经 `cc.math`、`cc.core.geometry`、`cc.Node`/`cc.Camera` 与原生 gfx 委托实现；
  数学层全体导出（含 `Matrix4` 的 invert/lookAt/compose/multiply 与 `Quaternion` 的 setFromRotationMatrix）**一律委托 `cc.*`**，
  不在 AIR 侧重写引擎已有算法——见 [上游差异](../UPSTREAM.md) §Spark 数学层逐位残差 deviation），
  运行时依赖树里没有 `three` 包，也不新增并行渲染器或采样器系统：GPU 纹理、缓冲、shader、PSO、framebuffer、draw 全部走本仓 gfx。
- 适配层（`src/air/spark/` 下的 `spark-api-adapter.ts`、`spark-math.ts`、`pmrem.ts`、`cocos-renderer.ts`、`cocos-spark-layer.ts`）
  **不进 `cocosair` 根导出面**：它只在可选入口内可用。这是计划 §SPK-05a **硬约束 1**，且是构建正确性问题而非风格问题——
  平铺再导出会让 rollup 以「Conflicting namespaces … (will be ignored)」丢弃**引擎**侧的 `Scene`/`Camera`/`Color` 等同名导出，
  变体产物运行时 `cc.Scene is not a constructor`（SPK-13 在三台浏览器上实测到的 startupException，代价与修复记录在 Deviation-07）。
  2026-10-12 实测佐证：`src/exports/air.ts`、`src/air/index.ts`、`src/exports/base.ts` 三个 barrel 内 `spark` 字样各 0 处；
  `npm run verify:spark-adapter` **exit 0 / `passed: true`**（`exportedMembers=150 / annotatedMembers=150`、`findings: []`、
  `rootExportLeakage: []`）。`src/cc.config.json` 现有 2 处 `spark`，那是可选 unit 的声明而非导出。

## 公开入口（可选 feature unit，变体构建）

- 形态：独立 ccbuild feature unit `spark`（入口 `src/exports/spark.ts`）。使用时以变体构建显式点名，例如
  `AIR_FEATURES=<默认 26 项>,spark AIR_OUT_DIR=output/spark-variant npm run build`。
  **`AIR_FEATURES` 是覆盖语义而非追加**：只写 `air,base,gfx-webgl2,spark` 会裁掉默认集其余 feature，
  产物缺 pipeline/场景装配而在运行期报 `pipelineSceneData` 为 null——必须带满默认 26 项再追加 `spark`。
- **完整配方（构建 + 落位）**：门禁与探针消费的是 `build/cocosair.module.spark.js`，而变体构建**不会**自己写到那里——
  `tools/build/build.cjs` 把「feature 集被覆盖，或 `AIR_OUT_DIR` 重定向」判为 `VARIANT`，变体既不共享默认集的增量缓存，
  也不写 `build/` 的发布附属产物，以免污染共用工作树里的默认 bundle。因此两步：

  ```bash
  AIR_FEATURES=<默认 26 项>,spark AIR_OUT_DIR=output/spark-variant npm run build
  cp output/spark-variant/cocosair.module.js      build/cocosair.module.spark.js
  cp output/spark-variant/cocosair.module.js.map  build/cocosair.module.spark.js.map
  ```

  落位后 `npm run verify:spark-assets` / `verify:spark-pixel-parity` / `verify:spark-cpu-parity` /
  `verify:spark-dpr-mismatch` 才有对象可验。**注意 `AIR_BUILD_NUMBER` 每次成功构建自增**（现为 80）并写进 dev 产物，
  所以变体产物的 sha256 跨轮次不可比；证据交叉锚因此按探针文档哈希对账并**刻意排除 SDK 字节**
  （见 `ai/ledgers/spark-integration.md` §SPK-13 比例不一致像素面收口）。默认 min 产物不受影响：
  `build/cocosair.module.min.js` 仍为 3 713 427 B / sha256 `779c288e647c17f6…`。
- 加载默认发行（`cocosair.js` 主入口 / `build/cocosair.module.js`）**不会**初始化 Spark，也不会为 Spark 付出 bundle 体积：
  默认 26 feature 集闭包 1152 个可达节点里 spark 节点为 **0**（8 个 spark 文件全部落在 UNREACHABLE）。
- **没有** `cocosair.js/spark` 包内子路径：`package.json` 的 `exports` 与 `files` 里都无 spark 条目，变体产物不随 npm 包发布
  （spark-rs 的转付 crate 许可处置为 `pending`，见 [第三方许可](../THIRD_PARTY_LICENSES.md) §8 与 `docs/license-decisions.json`）。
  因此当前消费路径是「仓库内变体构建产物」，不是「安装包后 `import from 'cocosair.js/spark'`」。
- 不与 `air` 聚合出口混用：`spark` 不写进 `src/exports/air.ts`，除非体积门禁通过且 owner 另行决定（见 Deviation-07 的复议条件）。
- 导出面结构（命名空间隔离，非平铺）：`src/exports/spark.ts` 只出口 `CocosRenderer`、`CocosSparkLayer`、
  `PMREMGenerator`/`pmremLayout`/`CUBEUV_SAMPLING_GLSL`，以及 `export * as sparkRuntime` 包裹的冻结运行时。
  在变体产物里这些符号挂在 `cc` 全局下（`cc.CocosSparkLayer`、`cc.sparkRuntime.*`）。
  `spark-api-adapter.ts` / `spark-math.ts` **不**从入口再导出，仅供构建期 alias 后的冻结子图消费。
- `cc.sparkRuntime` = 冻结上游 `index.ts` 导出表**减去 XR 家族**，实测 58 个值导出：渲染器/累积器/加载器/`SplatMesh`/
  `PackedSplats`/`ExtSplats`/`PagedSplats`/读写回（`Readback`）、dyno 图与 `dyno`/`generators`/`modifiers`/`utils`/`defines` 表、
  SH 与光栅着色器算法、`transcodeSpz`/`writeSpz` 等 WASM 排序解码接口。
  `SparkXr`、`XrHands`、`Hand`/`Hands`、`HandMovement` 等随 SPK-10 移除。这是相对上游导出表的**真实收窄**，不是改名：
  原先期待 `SparkXr` 或手部控制器的代码不会解析成功。不可达已实测（不再是裁定）：
  生成运行时与变体产物内 `SparkXr`/`XrHands` 命中数均为 0，而 `vendor/spark/src/SparkXr.ts`、`hands.ts` 原文仍逐字节冻结在树内。
  惰性 `xr` 外壳仍存在于渲染桥中（短路冻结代码的非 XR 分支），但它不是可用功能，不对外承诺会话能力。
- 类型面限定：生成子树的 `spark-runtime.d.ts` 把上述 58 个成员声明为 `any`（生成器产物，非手写签名）。
  运行时行为有像素/探针证据，静态类型不提供保护——依赖 IDE 类型推断的调用方需自行加层断言。

## 解码用 WASM 与 glue（受审计资产 + 构建期内联）

- 受审计资产落在 `vendor/spark-rs/`：`spark_rs_bg.wasm`、wasm-bindgen glue `spark_rs.js`、`LICENSE`，
  带 `MANIFEST.md`（逐文件 bytes + sha256 + 来源/版本行）。审计门禁 `npm run verify:spark-assets`（decoder-audit 同族）
  做清单双向对账、许可原文一致性、默认产物隔离，以及**内嵌反漂移**——从生成运行时提取最长 base64 字面量解码后，
  其 sha256/长度/字节必须等于清单里的 `spark_rs_bg.wasm`。
- **发运形态不是 decoder 式托管**：冻结 `vendor/spark/src/wasm.ts` 以 `import WASM from "spark_rs_bg.wasm?arraybuffer&base64"`
  静态取字节并在模块求值期 `WebAssembly.compile(WASM)`，四个消费点要求字节同步可用；因此 `spark_rs_bg.wasm` 以 base64
  内联进 spark 变体产物，**`build/spark-rs/` 目录不存在**，应用侧无需托管该资产、也没有可指向的路径。
  改成应用托管异步 fetch 需要修改冻结源码，故未采纳（复议条件见 Deviation-07）。
- 该产物是**源等价发行件，未在本环境用 Rust 重建**。不得把它描述为「本仓编译的 WASM」；
  替换或重建时必须更新 SHA-256、`vendor/spark-rs/MANIFEST.md`、`docs/evidence/spark/` 清单与审计，
  见 [上游差异](../UPSTREAM.md) §Spark WASM 与 glue 的 provenance。

## 不能期待什么

- **WebXR / 立体会话**：不支持，随 SPK-10 排除；复议条件为引入原生 WebXR 会话管理器。
- **默认发行内嵌**：不支持。默认 bundle 的闭包与产物字节里都不存在 Spark，也不含 WASM magic
  （`npm run verify:licenses` 与 `npm run verify:spark-assets` 双重负向指纹，均 exit 0）。
- **`import 'cocosair.js/spark'`**：不支持。没有该包内子路径；变体产物也不在 `files[]` 里。见上节「公开入口」。
- **无需托管解码资产**：当前形态下确实不需要（字节内联），但反过来也不能指望有一个可替换的 `build/spark-rs/` 目录去换 wasm 版本。
- **Three.js 兼容层对外可用**：不公开。适配层符号不是 SDK 的公开 API，其稳定性承诺等级为 **None**（见 [API 稳定性登记](api-stability.md)）。
- **跨 GPU/设备泛化**：本文不构成像素或行为验收。浏览器行为与像素证据须按本仓 `tools/verify` 家族逐引擎重采。

## 核对方式

```bash
node tools/build/vendor-spark-tree.cjs --check   # 冻结上游字节对账 + git 子树交叉核验
npm run verify:spark-adapter                     # 适配层 @air-element 归属 + 根导出面泄漏检查（实测 exit 0）
npm run verify:spark-assets                      # spark-rs / fflate 清单对账 + 默认产物隔离 + 内嵌字节反漂移
npm run verify:licenses                          # 第三方登记与「默认产物不含 Spark」负向指纹
npm run verify:feature-exports                   # feature unit / 聚合出口 / 默认产物组成对账
npm run verify:decoders                          # gltf-decoders 资产审计（spark 资产走上面的独立门禁）
npm run verify:file-map                          # 抽取映射对账（含 src/air/spark/** 六行的 AIR 原创形态）
```

发运形态是否仍是本页描述的样态**不靠本文措辞判断**，用下列只读探测自行推导：

```bash
grep -n '"spark"' src/cc.config.json            # spark feature unit（预期命中：unit 键与 entry 各一处）
ls src/exports/spark.ts                          # 可选入口源码（预期存在）
grep -n 'spark' package.json                     # 预期只命中 verify:spark-assets / verify:spark-adapter 脚本行，
                                                 # 没有 "./spark" 导出、没有 files 条目
ls vendor/spark-rs                               # WASM + glue + LICENSE + MANIFEST.md（受审计资产）
ls build/spark-rs                                # 预期不存在（不存在 = 内联形态仍成立）
ls src/air/spark/generated                       # vendor → 构建期的生成运行时子树
```

2026-10-12 实测：前三项与 `vendor/spark-rs`、`src/air/spark/generated` 均按预期命中/存在，`build/spark-rs` 与
`package.json` 的 `./spark` 均无命中。任一条偏离上表预期，即表示发运形态已改变，需回来更新本页与
`docs/UPSTREAM.md` §Spark 发运边界与接线状态。`docs/notes/spark-asset-sourcing.md` §2 保留首轮（接线前）同批探测的原始结果。

依赖闭包侧的复跑命令（默认 26 项、`air` 单入口、默认 26 项+`spark` 三种，前两者闭包内 spark 节点数必须为 0）记录在
`docs/evidence/spark/spk12-bundle-boundary-wired-20261012.json` 的 `commands[]`，可用 `npm run analyze` 配合
`AIR_FEATURES` / `OUT_DIR` 复现；接线前基线在 `docs/evidence/spark/bundle-boundary-20261011.json`。

浏览器侧的行为与像素验收（SPK-13）证据：`docs/evidence/spark/spk13-native-gfx-probe-full-20261012.json`、
`docs/evidence/spark/spk13-pixel-parity-20261012.json`（256×256 / DPR 1 单窗口，6 场景），
`docs/evidence/spark/spk13-pixel-parity-viewport-matrix-20261012.json`（画布比例 × DPR 矩阵：256×256、320×256(5:4)、
512×224(超宽)、256×256@DPR2、224×512@DPR2 竖屏，各 4 场景 × 三浏览器 = 60 行，全部 `channelMismatch=0`），以及
`docs/evidence/spark/spk13-pixel-parity-viewport-matrix-extended-20261012.json`（把采集器的 `--dpr` 允许集从 `{1,2}` 两度扩到
`{1, 1.25, 1.375, 1.5, 2, 3}` 后补采的分数/三倍档，6 窗口 × 4 场景 × 三浏览器 = 72 行：320×256@1.5、224×512@1.5、256×256@3、
320×256@1.25、512×224@1.25、256×256@1.375，同样全部 `channelMismatch=0`；两批合计 132 行，其中 1.25/1.375 是 Windows 缩放的默认
档位）。扩档的原因如实记在该文件 `purpose`，未覆盖形态记在 `notClaimed`：整数档白名单本身是上一轮留下的盲区，且允许集仍是有限枚举。
矩阵采集过程中发现并修掉的**采集器侧**单位差（不是引擎缺陷）记在首批矩阵文件的 `harnessFinding`，含修复前后的 PNG 指纹对照。
数学层相对 three 的**逐位残差仍是 OPEN deviation**：本层全体导出委托 `cc.*`（owner 指令「复用 cocosair 元素，不重造轮子」），
等价复跑 `toleranceViolations 0`（容差 2e-10、project 1e-8 **未放宽**，最大绝对误差 1.53e-11），但 `float32BitMismatches 2110 / 152003`
（真实位差 605 + 仅 ±0 符号零 1505）——这是「纯委托引擎（gl-matrix 血统）↔ three 运算次序」的固有末位差异。
迭代结论：**接受**该残差、保持全量委托，见 [上游差异](../UPSTREAM.md) §Spark 数学层逐位残差 deviation（OPEN）与其中的回退记录。
**证据绑定时点（如实说明）**：上文几批像素证据绑定的是采集当时的产物字节；`spk13-*-bitexact-20261012*.json` 那组绑的是
**回退前**（逐位对齐版）的变体产物（`build/cocosair.module.spark.js` sha256 `0107b440…f46c25`、9 467 101 B、`AIR_BUILD_NUMBER 80`），
而更早的 `spk13-pixel-parity-20261012.json` / `…-viewport-matrix-20261012.json` / `…-refresh.json` 那批是**委托版**采集。
2026-10-13 回退后 `spark-math.ts` 字节又变，故**没有任何一份在盘浏览器证据重新绑定当前源码**；因数学层只改内部运算路径、
不改导出面与取值域，且残差量级 ≤1.5e-11 落在容差内，预期像素面无变化——但这属**推断而非复采**，若要绑定现状需重跑浏览器套件。
（历史采集记录：`spk13-pixel-parity-20261012-bitexact.json` 3 引擎 × 6 场景 = 18 行、
`…-viewport-matrix-bitexact-20261012.json` 5 窗口 = 60 行、`…-extended-bitexact-20261012.json` 6 窗口 = 72 行、
`spk13-dpr-mismatch-parity-{chromium,firefox,webkit}-20261012-bitexact.json` 各 24 行、
`spk13-cpu-parity-3engine-20261012-bitexact.json` 3 引擎 × 17 检查、`spk13-data-parity-20261012-bitexact.json` 72 PASS / 0 FAIL，
均 `channelMismatch=0`、0 失败。）

CPU/WASM 解码面（同一任务书 §SPK-13 的「移植件既有 CPU/WASM 与数学套件等价复跑」条）由 `npm run verify:spark-data-parity`
（`tools/verify/spark-data-parity.cjs`）承担：它加载的是**本仓实际发运的** `vendor/spark-rs/spark_rs_bg.wasm` 与 glue（先按 SPK-11
审计 SHA 断言身份），在两个隔离实例上跑 19 个合成 fixture 的 packed/extended 解码、整体推流 vs 不规则分块推流、
`sort16/sort32` 的独立稳定键 oracle、LoD 建树/共享/遍历与射线共 **72 例 PASS / 0 例 FAIL**，其中 39 例的输出摘要
（每个 typed array 的 `{type, length, sha256}`，即最终上传缓冲的完整位模式）与冻结金标准逐位一致。
证据 `docs/evidence/spark/spk13-data-parity-20261012.json`，本仓自持基线 `docs/evidence/spark/spk13-data-parity-goldens-20261012.json`。
未覆盖项如实记在该文件 `notClaimed`：三个上游示例资产（`*.spz`/`sutro.zip`）因**资产级许可未确认**默认不读取（`--include-remote` 显式开启），
以及移植件最后一族「导入两份已构建 Spark 包比对 half-float/packed-splat 编码」比较的是发行包而非本仓产物，本仓由 vendor 逐字节冻结
（`vendor-spark-tree.cjs --check`）+ 运行时子图再生成（`spark-runtime-tree.cjs --check`）+ 上述 132 行像素证据共同承担。

该口径替换**已撤销**：移植件 `cpu-package/*` 族现在由 `npm run verify:spark-cpu-parity`（`tools/verify/spark-cpu-parity.cjs` +
`tools/debug/probes/spark-cpu-parity/`）在浏览器里以**本仓实际发运的产物**复跑——同一文档同时导入变体 bundle 的 `cc.sparkRuntime`
与上游参考包 `dist/spark-reference.js`，比 65536 个 half 模式的 `fromHalf`（`Object.is`）、14 个 `toHalf` 边界值、256 组
`setPackedSplat` / `unpackSplat` / `utils.encodeExtSplat` 边界向量（packed 与 extended 的字逐个比、unpack 的
center/scales/quaternion/color/opacity 逐字段 `Object.is`），并要求 `dyno`/`utils`/`defines`/`generators`/`modifiers` 五个命名空间的
键集与参考包完全相等、导出面差集**恰好等于**已登记的 27 个 `SparkXr`/`hands` 剔除名（参考包 85 个导出 vs 本仓 `sparkRuntime` 58 个）。
三浏览器 × 17 项检查全部 PASS：`docs/evidence/spark/spk13-cpu-parity-20261012.json`。门禁自身能判红的答案在
`docs/evidence/spark/spk13-cpu-parity-tamper-20261012.json`：把参考包副本里两条 half 解码路径各改一个位掩码后，`fromHalf` 报
31 746 处不一致、unpack 字段报 249 处不一致，门禁 exit 1。此门禁**不声明**任何 GPU/像素/Worker/XR 结论（像素见 SPK-13 像素证据，
WASM 解码见上一段），也不是 release READY 判定。上一段 `notClaimed` 的旧措辞保留在那一次运行的历史快照里，以本段为准。

### 比例不一致的像素面：`npm run verify:spark-dpr-mismatch`

前面的像素矩阵里，每行浏览器 context 的 `deviceScaleFactor` 与页面被要求渲染的 `dpr` 始终相等，所以「系统缩放与页面请求比例
不一致」这条日常路径从未进过比较面。`tools/verify/spark-dpr-mismatch-parity.cjs` 补的正是这一段：它**只读**复用已验收的
`tools/debug/probes/spark-pixel-parity/` 探针文档，每行给 context 设一个设备比例、在 URL 里要求另一个比例，四组错配为
`2↔1`（256²）、`1↔2`（256²）、`3↔1.5`（320×256，5:4）、`1.5↔3`（224×340，竖屏）。判定仍是零容差——两端 `readPixels`
原始字节取 sha256 相等才算一致，并要求 drawing buffer 跟随**请求**比例而非设备比例、每行 negative control 必须让哈希变化。

三浏览器 × 4 组 × 6 场景 = **72 行全 PASS**，72/72 行实测两端 `devicePixelRatio` 确实不等于请求比例：
`docs/evidence/spark/spk13-dpr-mismatch-parity-{chromium,firefox,webkit}-20261012.json`。6 个场景 id 由采集器从
`tools/verify/spark-pixel-parity.cjs` 只读解析并做等值断言，上游场景增删或改名会把本门禁直接打红而不是静默缩面。该门禁与像素
门禁的机制差异写在报告 `methodDifference` 里：单回环源，隔离性由请求 **pathname** 判定（探针导航 URL 的 query 天然带 `sdk=`，
按整串匹配会误判成参考端拉取 SDK）。做交叉锚时还发现旧像素证据 `spk13-pixel-parity-20261012.json` 记录的 `frame.js` 哈希已被
03:16 的分数 DPR 扩展甩在身后，故在同一探针现状上重采了 `docs/evidence/spark/spk13-pixel-parity-20261012-refresh.json`
（3 浏览器 × 6 场景 + negative control 全 PASS）。以上均为 per-machine、per-engine 证据，不外推到其他 GPU 或真实设备缩放，
不覆盖真实触摸/事件通道，也不是 release READY 判定。

