# build/ — 构建产物目录说明

本目录是所有构建/验证脚本的产物落点。除本 README 外，内容均为生成物：**不要手改，用对应脚本重建**。核心产物提交入库以固定指纹证据（`verify:port-candidate`、`verify:feature-exports`、`verify:licenses`、`verify:decoders` 等门禁按这些文件核对），可再生目录已被 [.gitignore](../.gitignore) 排除。脚本口径的权威描述见 [AGENTS.md](../AGENTS.md) 的 npm 命令表；本 README 不随 npm 包发布（不在 [package.json](../package.json) 的 `files` 清单内）。

## 总览

| 条目 | 含义 | 生成者 | git |
| --- | --- | --- | --- |
| `cocosair.module.js` + `.js.map` | 未压缩 Web ESM 运行时（默认 feature 集）；dev 服务器热刷新与绝大多数浏览器证据使用它 | `npm run build` | 跟踪 |
| `cocosair.module.min.js` + `.js.map` | 同一运行时的压缩版 | `npm run build:min` | 跟踪 |
| `cocosair.module.d.ts` | 打包后的 SDK 类型声明，npm 包 `types` 入口 | `npm run build:dts` | 跟踪 |
| `cocosair.legacy.d.ts` / `bootstrap.legacy.d.ts` | TS <5.0 消费者的包装声明（带 DecompressionStream fallback；现代编译器入口走原生 lib.dom） | `npm run build:dts` | 跟踪 |
| `bootstrap.js` + `.map` + `.d.ts` | **引擎无关**的 bootstrap 包装入口，对应 npm 子路径 `cocosair.js/bootstrap`（自定义 canvas、需在引擎导入前配置 DPR 的场景） | `npm run build` | 跟踪 |
| `package.json` | 仅 `{ "type": "module" }`：声明本目录 JS 按 ESM 解析 | `build` / `build:min` / `build:system` 默认刷新 | 跟踪 |
| `cc.js` + `cc.js.map` | SystemJS 模块格式运行时（非默认 npm ESM 入口，不在 `build:all` 内）；按需生成，本工作区当前不存在 | `npm run build:system` | 生成后跟踪 |
| `gltf-decoders/` | 随库发布的解码器资产（见下） | 入库资产，非脚本生成 | 跟踪 |
| `devtools/` | 独立 DevTools 工件（见下） | devtools 构建流程 | 跟踪（但**不进 npm 包**） |
| `npm/` | prepack 发布副本（见下） | `npm run prepack` | 忽略 |
| `examples/` | Gallery 自包含静态发布物（见下） | `tools/verify/gallery-artifact.cjs` | 忽略 |
| `reports/` | 分析与验证报告输出（见下） | analyze/compare/verify 各工具 | 忽略 |
| `.tmp-*/`、`.dts-*/`、`.dev-log.txt` | dev/rollup/dts 中间产物与缓存（见下） | dev server 与各脚本 | 忽略 |

## 运行时文件：二选一关系，不是叠加

- **默认入口只有一个**：npm `exports["."]` 指向 `build/npm/cocosair.module.js`（prepack 后的 source-map-free 副本）。`cocosair.module.min.js` 打包进 tarball 但默认入口不指它——是给想要发布体积的场景手动取用的副本。
- `bootstrap.js` 是**替代入口**而非额外依赖：普通应用 import 主入口即可；只有自定义 canvas 或需要引擎导入前配置 DPR 时才改用 `cocosair.js/bootstrap` 子路径，两者二选一、共享同一 canvas/config 初始化。
- 应用侧开发最小集 = 运行时 JS + `cocosair.module.d.ts`；加载 Draco/Basis/meshopt 压缩模型才需要另取 `gltf-decoders/`（部署见 [docs/gltf/gltf-decoder-deployment.md](../docs/gltf/gltf-decoder-deployment.md)）。环境前提：WebGL 2 浏览器；页面先有 `#GameCanvas` 再 import（或走 bootstrap 自定义 canvas）。

## gltf-decoders/

随库发布的 glTF 解码器资产：`basis/`（basis_transcoder js+wasm）、`draco/`（decoder/encoder js+wasm）、`meshopt/`（decoder/encoder mjs/cjs/js），各带 `LICENSE.md`；`MANIFEST.md` 记录清单与哈希（`verify:decoders` 逐项审计，含离线 tarball 消费口径）。注意：本目录下的 `package.json`（`type: commonjs`）**只声明既有文件的模块格式**，不负责下载或生成解码器文件——解码器是独立维护的发布资产。

## devtools/

独立 DevTools 工件：`agent-session.js` + `panel.js`（cocosair 作 external）+ 自述 `README.md`。它刻意**不进 npm 包**（不在 `files` 清单）——遵循"开发/巡检工具与默认运行时包分离"的仓库约定。`tools/verify/devtools-consumer.cjs` 对它做两路验收：Runtime Only（tarball 零 debug 依赖）与 Runtime + DevTools（inspection/session/capture/error 全可用）。

## npm/（git 忽略，可再生）

`prepack` 从**已存在**的本地 bundle 准备的 npm 发布副本：source-map-free 的 unmin/min 运行时与 `bootstrap.js`（`npm run build:all` 的最后一步也会刷新）。它只复制、不编译——本地没有先跑过 `build`/`build:min` 时 prepack 无从准备；`verify:tarball-consumer` 以它为离线安装消费口径的证据源。

## examples/（git 忽略，可再生）

Gallery 的自包含静态发布物（`node tools/verify/gallery-artifact.cjs build` 生成，整目录可直接部署到静态主机）：引擎副本 + `gltf-decoders/` + 全部编译后示例（每例 `index.html` + `main.boot.js` + `src/` + `example.json`）+ `files.json` + gallery 页面 + `thumbnails/<id>.png`。两条硬不变量：**F-86 引擎字节货币**——内嵌的 `cocosair.module.js` 必须与根下同名文件逐字节相同；**F-70 防陈旧**——`mode verify` 拒绝认证过期 artifact。`verify:perf-lifecycle` 以它为硬前置且只消费、不构建。

## reports/（git 忽略）

各分析/验证工具的报告输出（写入方举例）：`web-dependency-graph.json`（`tools/analyze/dep-graph.cjs`，即 `npm run analyze` 的依赖图）、`baseline-compare.json`（`tools/compare/baseline-compare.cjs` 的上游基线对比）、`label-shadow/`（label 原生阴影相关验证证据）、`recipe-review-gate.cjs`、`port-gap-evidence-schema.cjs` 等门禁也会在此落临时/正式报告。

## 临时与缓存（可随手清理）

`.tmp-dev-<时间戳>/`（dev server 会话目录）、`.tmp-rollup-cache/`（ESM 增量构建缓存）、`.dts-tmp-*/` 与 `.dts-before-bundle-*`（`build:dts` 中间目录，正常自清理或残留）、`.dev-log.txt`。删除不影响源码与入库产物；共享工作区内有他人构建在跑时不要清，避免竞态。

## 构建变体与输出重定向

`build`/`build:min`/`build:system` 支持 `AIR_FEATURES` 覆盖 feature 集、`AIR_OUT_DIR` 重定向输出；这两种变体**不刷新默认发布侧文件、不共享默认 ESM 增量缓存**。`build:dts` 独立运行，不跟随 `AIR_OUT_DIR`。

## 使用纪律

1. 本目录任何文件都不是手写源码——改动一律走 `src/`（抽取件另按上游登记约定），再用脚本重建：`build` → `build:min` → `build:dts`，或一次 `build:all`。
2. 跑发布类门禁（`verify:release`、`verify:feature-exports`、`verify:decoders`、`verify:consumer` 等）前保证产物新鲜：产物过期会被门禁如实披露为 drift，而不是被静默容忍。
3. 入库产物（根文件、`gltf-decoders/`、`devtools/`）的变更会体现在 git 状态里——提交前确认这些 diff 都是本轮构建的预期结果。
