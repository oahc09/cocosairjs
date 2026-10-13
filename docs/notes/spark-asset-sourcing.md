# Spark 运行资产来源（WASM 解码件与 glue）

> 本文保留采集日期、命令与实测结果，属于专题调查记录。阶段编号（SPK-xx）与旧测量值不表示当前发行状态；
> 现行范围见 [功能范围](../reference/web-features.md) §Spark 高斯泼溅，入口与消费边界见
> [Spark 可选入口边界](../reference/spark-optional-entry.md)，验收状态以重新运行的门禁为准。

> 采集日期：2026-10-11。归属：SPK-11（冻结本体接入与资产发运）与 SPK-14（登记）。
> 上游身份：`@sparkjsdev/spark` 2.3.1，冻结提交 `c57ebb936a5d364e021a66a118204d599f6fdaa8`，见 `docs/UPSTREAM.md` §Spark 冻结上游源码。

## 1. 一句话结论

Spark 的 GPU 排序/解码算法本体是 **Rust → WebAssembly** 产物（`spark_rs_bg.wasm` + wasm-bindgen glue `spark_rs.js`）。
本仓**没有重建**过它：现有字节取自上游 **dist 发行件**（源等价件）。
因此「仓库里有 Spark 源码」不等于「Spark 可运行」——运行时必须先具备两件外部条件：① 可选入口已完成接线（SPK-12）；② 应用已托管并可访问该资产目录。

**2026-10-12 接线后的实态订正**（上一条的①已成立、②不成立）：feature unit `spark` 与 `src/exports/spark.ts` 已落地，
但资产**没有**采用「独立目录 + 应用托管」的 decoder 形态——冻结的 `vendor/spark/src/wasm.ts` 在模块求值期就要拿到字节，
所以 `tools/build/spark-runtime-tree.cjs` 在**构建期把 `spark_rs_bg.wasm` 以 base64 内联进 `spark` 变体产物**，
`build/spark-rs/` 不存在、运行时也无 fetch。默认产物仍不含任何 Spark/WASM 指纹（`npm run verify:spark-assets` 断言）。
完整差异与理由见 [Spark 可选入口边界](../reference/spark-optional-entry.md) 与 [UPSTREAM.md](../UPSTREAM.md) Deviation-07；本文 §2 表格保持 2026-10-11 采集原样。

## 2. 实测（每条可复跑）

| 判据 | 命令 | 采集时点结果 |
|---|---|---|
| WASM 身份 | `sha256sum <来源目录>/spark_rs_bg.wasm` | 1 554 721 B / SHA-256 `974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7` |
| glue 身份 | `sha256sum <来源目录>/spark_rs.js` | 47 694 B / SHA-256 `a4b2cc7226f2e4c9bf397b56da3520e6c6f7d65b55e486783ef9bffac3b4bf72` |
| 逐文件登记（旁证清单） | 见 `docs/evidence/spark/asset-inventory-20261011.json` 的 `vendor/spark-rs/**` 行 | 两条均分类为「冻结上游」，处置为「按 decoder 模式独立发运（SPK-11，未用 Rust 重建）」 |
| Rust 侧源码是否齐备（可重建的前提） | `find vendor/spark/rust -name "*.rs" \| wc -l` | **29** 个 `.rs` + `Cargo.toml`/`Cargo.lock` + `build_rust_wasm.sh`/`.ps1` + `build_wasm.js`；git 子树 `23e1a2a05c28c625dfae7e28eeeb9aafbdec151b` |
| 本仓是否已把资产落位 | `ls build/` | 采集时点**无** `build/spark-rs/`；只有 `build/gltf-decoders/`（decoder 先例） |
| 默认产物是否内嵌 Spark | `npm run verify:licenses`（`ships: source` ⇒ 负向指纹） | `SparkRenderer` / `sparkjsdev` 在默认 bundle 中命中数 0 |
| 默认闭包是否含 spark 节点 | `AIR_FEATURES="<默认 26 集>" OUT_DIR=… npm run analyze` | 1151 可达 / 1370 扫描，**spark 节点 0**；`AIR_FEATURES=air` 为 1103 可达，同样 0（命令与结果见 `docs/evidence/spark/bundle-boundary-20261011.json`） |
| 接线是否已落地（交付面探测） | `grep -n '"spark"' src/cc.config.json`、`ls src/exports`（找 spark 入口文件）、`grep -n 'spark' package.json`、`ls build/spark-rs`、`ls src/air/spark/generated` | 采集时点**五条全部无命中/不存在**：无 `spark` feature unit、`src/exports` 下无 spark 入口、`package.json` 仅有 `verify:spark-adapter` 一行（无 `./spark` 导出、无 `files` 条目、无 `verify:spark-assets`）、无 `build/spark-rs/`、无生成子树 |
| Three.js 是否被误当作运行时依赖 | `ls node_modules/three node_modules/fflate` | 二者**均未安装**；`three` 只作为冻结源码的**构建期 specifier**，由别名指向 `src/air/spark/spark-api-adapter.ts` |

关于「未重建」的准确口径：本机存在 Rust 工具链（`cargo` 可用），但**本仓未执行** `vendor/spark/rust/build_rust_wasm.sh`，
也没有把重建产物与上述 SHA 对账的证据。所以现有字节只能记作**上游发行件的源等价拷贝**，
不得写成「本仓编译产出」，也不得写成「本环境无法编译」。

## 3. 接入该资产必须处置的上游构建耦合

冻结源码走的是上游 Vite 构建，以下说明符在 rollup/ccbuild 链路里**无法原样解析**（实测命中位置）：

| 说明符 | 命中点 | 后果与处置口径 |
|---|---|---|
| `three`、`three/addons/postprocessing/Pass.js` | `vendor/spark/src` 下 29 + 3 处（29 个文件 `import * as THREE`；`PackedSplats`/`Readback`/`SplatAccumulator` 取 `FullScreenQuad`） | 构建期别名到适配层；别名 seam 与 subpath 处置由 SPK-11/12 记录，运行期不得出现 `three` 依赖 |
| `spark-rs`、`spark-rs/spark_rs_bg.wasm?arraybuffer&base64` | `vendor/spark/src/wasm.ts:1-2`（另 `PagedSplats.ts:3`、`SplatMesh.ts:8`、`spz.ts:10`、`worker.ts:21` 取 glue 具名导出） | Vite-only 的 base64 内嵌；与「WASM 独立发运、不内嵌任何 bundle」冲突。**2026-10-12 处置**：保留内嵌语义（构建期把说明符解析到 `vendor/spark-rs/` 并内联字节），不修改冻结源码、不引入运行时 fetch；与首版预写的「改为应用可访问 URL 注入」相反。decoder 式隔离断言改施于**默认产物**（无 WASM magic、无 spark 字样），由 `npm run verify:spark-assets` 保证，另加内嵌字节反漂移 |
| `./worker?worker&inline` | `vendor/spark/src/SplatWorker.ts:4`（`new BundledWorker()`；`worker.ts` 为 worker 侧 rpc 入口） | Vite-only 的 worker 内联；需要本仓构建出可加载的 worker 产物或等价的 worker 注入点，否则排序 worker 不可用 |
| `fflate`（`unzipSync` / `Gunzip`） | `vendor/spark/src/SplatLoader.ts:1`、`utils.ts:1` | 本仓未安装该依赖，且新增第三方运行库需同时过 `verify:licenses` 的许可登记；SPK-11 必须显式决定「vendored 入库」或「以本仓既有压缩实现替换该调用点」，不可静默失败。**2026-10-12 处置**：选**vendored 入库**——`npm pack fflate@0.8.2` 的 dist 原文落 `build/fflate/`（带 `LICENSE`/`package.json {type}`/`MANIFEST.md`），构建期 alias 解析裸说明符，**不改 vendor 源码、不加 npm 依赖**；许可登记 `licenses/LICENSE_fflate.txt`（MIT © 2023 Arjun Barrett，与资产内 `LICENSE` 逐字节），`ships: variant` |

## 4. 解除「可运行」阻塞需要的动作（2026-10-12 复采：四项均已处置，处置形态与本文首版预写有两处差异）

1. 资产落位：**已落位为 `vendor/spark-rs/`**（`spark_rs_bg.wasm` + `spark_rs.js` + `LICENSE` + `MANIFEST.md` 逐文件 bytes/sha256/来源行），
   **不是**本文首版预写的 `build/spark-rs/`，也**没有**加入 `package.json` `files[]`。差异原因见下条与
   [上游差异](../UPSTREAM.md) Deviation-07 的 WASM 边界：冻结源码的静态 base64 import 使运行时 URL 注入不可行，
   于是资产以受审计形式留在 `vendor/`，由构建期内联消费。
2. 资产审计：**已交付** `npm run verify:spark-assets`（`tools/verify/spark-assets.cjs`，decoder-audit 同族）——清单双向对账、
   许可原文一致、`build/fflate/package.json` 的 `type` 声明、默认产物隔离（JS 与两份 map 内均无 WASM magic `00 61 73 6d`，
   也无 spark/fflate 字样），并把「生成运行时内嵌 base64 解码后必须逐字节等于清单资产」做成反漂移断言。实测 exit 0。
3. 运行时接线：`spark` 可选 feature unit 与 §3 的四个耦合点已全部处置——`three` 与 `three/addons/postprocessing/Pass.js`
   构建期 alias 到 `src/air/spark/spark-api-adapter.ts`；`spark-rs` 与 `?arraybuffer&base64` 由 `tools/build/spark-runtime-tree.cjs`
   解析到 `vendor/spark-rs/` 并内联；`./worker?worker&inline` 生成 Blob-URL 模块 worker；`fflate` 以构建期 alias 指向受审计资产
   `build/fflate/esm/browser.js`（**vendored 入库**路线，未新增 npm 依赖，`verify:licenses` 已登记）。
   dep-graph 两条断言复跑通过（`docs/evidence/spark/spk12-bundle-boundary-wired-20261012.json`）：默认 26 项闭包 1152 可达内
   **spark 节点 0**；点名 `,spark` 的 27 项闭包内 spark 子图可达（+7），且 `SparkXr`/`hands` 在生成运行时与变体产物里命中均为 **0**。
   注意 `AIR_FEATURES` 是**覆盖**语义：单写 `air,spark` 会裁掉默认集，须带满默认 26 项再追加 `spark`。
4. 运行验证：SPK-13 已用真实浏览器采证——`tools/verify/spark-native-gfx-probe.cjs` 全用例集三引擎 PASS
   （`docs/evidence/spark/spk13-native-gfx-probe-full-20261012.json`），`tools/verify/spark-pixel-parity.cjs` 逐 RGBA8 通道字节差为 0
   的像素对账（`docs/evidence/spark/spk13-pixel-parity-20261012.json`）。本节不构成跨 GPU/设备泛化。

## 5. 许可提醒

- 许可原文：`licenses/LICENSE_spark.txt`（与 `vendor/spark/LICENSE` 逐字节一致；SHA-256 `51829693e5dccd9ca1daa093991faac3aaa93238eb8fd5f5cb4130af85791d64`），
  登记见 [第三方许可](../THIRD_PARTY_LICENSES.md) §8。
- **crate 级许可面尚未转录（缺口已按处置②登记，仍未闭合）**：该 WASM 由 Rust crate 依赖树编译而来，除 Spark 自身 MIT 外还携带 crate 与 `wasm32` 标准库许可
  （上游移植件已逐 crate 记录，本仓未搬运）。二选一已选 **②**：`docs/license-decisions.json` 以
  `spark-rs WASM 与 wasm-bindgen glue` 登记 `disposition: pending`（含三条备选路径与证据指针），`npm run verify:licenses`
  如实输出 1 条 ATTENTION。在 owner 闭合前 **spark 变体产物不得作为 release 交付物**，也不得声称该资产的许可面完整；
  当前发运面未含任何 spark 产物（`files[]` 无 spark 条目），默认产物不受该缺口影响。缺口同样记在
  [第三方许可](../THIRD_PARTY_LICENSES.md) §9。
