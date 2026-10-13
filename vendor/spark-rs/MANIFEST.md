# spark-rs 资产清单（SPK-11）

Spark 的排序/解码 WASM 与其 wasm-bindgen glue。本目录是**只读冻结资产**，不是本仓编译产物，也不受
`vendor/spark/` 的字节对账范围（`tools/build/vendor-spark-tree.cjs` 只走 `vendor/spark/**`）覆盖，
因此单独由 `npm run verify:spark-assets` 审计：逐文件 bytes + sha256 双向对账、许可原文一致性、
默认产物隔离、以及「生成运行时内嵌的 base64 字节 == 本清单记录的 wasm 字节」的防漂移证明。

## Provenance

- Source: 上游 `@sparkjsdev/spark` **2.3.1** 的 **dist 发行件**（冻结提交 `c57ebb93…`，dist 树 `699e3ad0…`）。
- 构建方式：**源等价发行件，未在本环境用 Rust 重建**。本仓未执行 `vendor/spark/rust/build_rust_wasm.sh`，
  也没有对重建产物做过任何取证；`cargo` 在 PATH 中存在不等于本仓已重建。任何文档不得把本资产写成
  「本仓用 Rust 编译产生」。其 Rust 侧源码逐字节镜像在本仓 `vendor/spark/rust/`（tree `23e1a2a0…`）。
- License: MIT（与 Spark 项目同源，© 2025 WORLD LABS TECHNOLOGIES, INC.），原文见本目录 `LICENSE`
  与 `licenses/LICENSE_spark.txt`（两者与 `vendor/spark/LICENSE` 逐字节一致）。
- **已知缺口（不冒充清晰）**：本 wasm 由上游链接的 Rust 传递依赖 crate 编译而成，其逐个 crate 的许可文本
  **未在本仓转录**。处置登记见 `docs/license-decisions.json` 的 `Spark spark-rs WASM + glue` 条目
  （disposition=pending，随资产审计门禁进入 `attention` 报告）。复议条件：owner 要求随包转录时，
  以 `vendor/spark/rust/Cargo.lock` 为准逐项取原文。

## 发运形态（与 `build/gltf-decoders/` 的关键差异）

冻结的 `vendor/spark/src/wasm.ts` 用**静态 import** 取 wasm 字节并在模块求值期同步
`WebAssembly.compile(WASM)`（`:2` `import WASM from "spark_rs_bg.wasm?arraybuffer&base64"`、`:4`），
因此在不修改冻结源码的前提下**无法**改成应用侧异步托管资源目录。落地的形态是：构建期生成器
`tools/build/spark-runtime-tree.cjs` 把该 specifier 解析到本目录的 `spark_rs_bg.wasm` 并以 base64
内联进 `src/air/spark/generated/spark-runtime.js`（这与上游自身 npm dist 的形态一致）。

- 结果：**可选 `spark` 变体产物内嵌 wasm 字节**；`build/spark-rs/` 独立资产目录**不存在**，
  应用也不需要托管任何 Spark 资源目录。
- 边界仍成立：**默认**产物（`build/cocosair.module.js` / `.min.js`）内既无 wasm magic，也无
  `spark_rs_bg.wasm` / `SparkRenderer` / `sparkjsdev` 字样，由 `verify:spark-assets` 与
  `verify:licenses` 双重断言。
- 复议条件：owner 批准对 `vendor/spark/src/wasm.ts` 打 AIR 补丁（改为可注入的异步 provider）并放弃该文件
  的逐字节冻结，届时可切换到 `build/spark-rs/` + `package.json {type}` 的 decoder 式独立发运。

## Landed files

| file | bytes | sha256 |
|---|---|---|
| spark_rs_bg.wasm | 1554721 | 974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7 |
| spark_rs.js | 47694 | a4b2cc7226f2e4c9bf397b56da3520e6c6f7d65b55e486783ef9bffac3b4bf72 |
| LICENSE | 1088 | 51829693e5dccd9ca1daa093991faac3aaa93238eb8fd5f5cb4130af85791d64 |

替换或重建（本环境真实执行 `build_rust_wasm.sh`、上游发布新的 `spark-rs`、或 glue 的 wasm-bindgen
生成形态改变）时，必须同时更新本表、`docs/UPSTREAM.md` §Spark WASM 与 glue 的 provenance 与
`docs/evidence/spark/` 清单，不得沿用旧 SHA。
