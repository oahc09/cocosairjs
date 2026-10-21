# npm 脚本目录

[AGENTS.md](../../AGENTS.md#development-workflow) 的开发工作流是权威说明；本文件承载逐条脚本的完整
目录（目的、主要产物、写入行为），供按需查阅。运行任何脚本前先确认它的写入行为。

`package.json` 当前有 48 个 `scripts`。从仓库根目录运行，`baseline` 例外（见下）。
`npm test` 等价于 `npm run test`；传参用 `npm run <name> -- <args>`。

初始开发：安装依赖、生成开发 bundle、启动服务器。

```bash
npm install
npm run build
npm run dev
```

脚本的 `purpose` 与主要输出以本文件为准；新增或修改 npm 脚本时必须同步更新本文件与
[AGENTS.md](../../AGENTS.md#development-workflow) 的概览段。

## 内建 npm 命令（非项目脚本）

| 命令          | 用途                                                                                                                                      | 产物与写入行为                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm install` | 按依赖声明安装项目依赖。                                                                                                                  | 写入 `node_modules/`，依赖解析变化时可能更新 `package-lock.json`；不自动构建引擎。                                                                                       |
| `npm ci`      | 严格按现有 lockfile 安装，适合 CI 或复现依赖环境。                                                                                        | 删除并重建 `node_modules/`；不更新 lockfile、不构建引擎。                                                                                                                |
| `npm pack`    | `prepack` 从现有本地 bundle 准备无 source map 的发布副本到 `build/npm/`，同源构建独立数学入口及声明，再按 `package.json` 列出的文件打包。 | 默认在当前目录生成 `cocosair.js-<version>.tgz`；不重编主引擎；会构建数学入口并写入 `build/math-build.json` 来源收据。打包前先跑 `npm run build:all`。不上传到 registry。 |

## 日常开发与格式化

| 命令                   | 用途                                                                                                                                                                       | 产物与写入行为                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`          | 启动本地示例服务器 `http://127.0.0.1:7454/`，默认 `starter`；支持 `-- --example hello-cube --port 7454`。引擎/AIR 源码变化触发重建并刷新；示例、手册与调试工具变化只刷新。 | 运行常驻 HTTP 服务器；按请求把示例 TS 编译到内存，不生成静态站点。源码变化刷新 `build/cocosair.module.js` 及其 map。启动不保证 bundle 已存在或最新；先跑 `build`。 |
| `npm run typecheck`    | 用根 `tsconfig.json` 及其排除表检查 `src/` 下的 TypeScript；不覆盖全部示例与工具。                                                                                         | 用 `noEmit: true`；输出诊断与退出码，不生成 JS 或 `.d.ts`。                                                                                                        |
| `npm test`             | 用 jsdom + HEADLESS 跑 `test/smoke/*.test.ts`；串行用 `npm test -- --runInBand`。                                                                                          | 输出测试报告并产生临时文件/缓存；不构建发布产物，也不替代浏览器视觉验证。                                                                                          |
| `npm run format`       | 用 Prettier 格式化 `package.json` 中显式列出的示例、手册示例、部分工具与流程文档，遵守 `.prettierignore`。                                                                 | **就地改写**匹配的源码与文档；不格式化整个仓库。上游 `src/` 排除在外，内嵌 Markdown 代码按现有配置保留。                                                           |
| `npm run format:check` | 以 `format` 相同范围检查格式。                                                                                                                                             | 输出结果与退出码；不改写文件、不生成报告。                                                                                                                         |

## 构建与上游基线

`npm run build:spark`：按需构建独立 Spark ESM 模块、map、声明及构建依赖图；借用已有主引擎，不复制 Cocos 实现，不推进主引擎编译序号。写入 `build/spark.module.*` 和 `build/spark-types/`，删除旧整合版 Spark JS/map；不打包、不发布，现有 Spark 许可边界不变。

| 命令                   | 用途                                                                                                   | 主要产物与写入行为                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`        | 用默认特性集构建未压缩 Web ESM 运行时。                                                                | 写入 `build/cocosair.module.js` 及其 map；刷新模块格式标记，可能更新增量缓存。不更新压缩运行时或 `cocosair.module.d.ts`。                                                                                                         |
| `npm run build:min`    | 构建同一运行时的压缩 ESM 版本。                                                                        | 写入 `build/cocosair.module.min.js` 及其 map，并刷新模块格式标记。不更新未压缩运行时或 `cocosair.module.d.ts`。                                                                                                                   |
| `npm run build:dts`    | 打包引擎声明并转成 npm 消费者可直接 import 的 SDK 声明。                                               | 写入 `build/cocosair.module.d.ts` 与 TS <5.0 包装 `build/cocosair.legacy.d.ts`（含 DecompressionStream 回退声明）。现代编译器入口保留原生 lib.dom。可能残留 `build/.dts-tmp-*` 与 `build/.dts-before-bundle-*`。不生成运行时 JS。 |
| `npm run build:all`    | 依次构建未压缩 ESM、压缩 ESM、声明，准备 `build/npm/` 无 source map 发布副本，再检查 bundle 内建资源。 | 生成开发 JS + map、`.d.ts`、`build/npm/` 发布副本与模块格式标记；检查结果输出到终端。**不**生成 `.tgz`、不构建静态 Gallery、不重采浏览器证据、不发布。                                                                            |
| `npm run prepack`      | 从现有本地 bundle 准备 npm 发布副本；由 `npm pack` 自动调用。                                          | 把无 source map 的 unm/min 主运行时副本写入 `build/npm/`；要求其 JS/map 已存在。不编译引擎、不上传包。                                                                                                                            |
| `npm run build:system` | 构建需要 SystemJS 的模块格式。                                                                         | 写入 `build/` 下的 `cc.js` 及其 map，刷新模块格式标记。不是默认 npm ESM 入口，也不包含在 `build:all` 中；这些文件仅在显式运行此命令后生成。                                                                                       |
| `npm run baseline`     | 用 SystemJS chunks 构建历史上游 cocos4 Web 基线，排除需要不可得原生/外部资产的特性。                   | 在**当前引擎目录**下写入 `bin/dev/cc-baseline/`。脚本直接读 `cwd/cc.config.json`，该文件在 AIR 仓库根不存在，故直接在此运行会失败。应从上游 cocos4 根调用本仓库的 `tools/baseline/build-baseline.cjs`。                           |

默认 `build`、`build:min`、`build:system` 会写入 `build/package.json`（`type: module`）与
`build/gltf-decoders/package.json`（`type: commonjs`）。后者只声明既有 decoder 文件的模块格式；
**不下载或生成 decoder JS/WASM 资产**。构建脚本支持用 `AIR_FEATURES` 覆盖特性集、`AIR_OUT_DIR`
重定向输出；这两个变体不刷新默认发布侧文件，也不共用默认 ESM 增量缓存。`build:dts` 独立，不跟随 `AIR_OUT_DIR`。

这些运行时构建还会校验冻结的 Box2D 3.2 源码/桥接输入/二进制 receipt，将现有可选资产复制到输出目录的 `box2d3/`。
`prepack` 同样复制到 `build/npm/box2d3/`，包含原始许可；它们都不编译 C/C++ 或安装工具链。
重新生成原生资产使用独立入口 `node tools/build/box2d3.cjs --build`，写入范围见 [Box2D 指南](../guides/box2d3.md)。脚本数量不变。

## 清单、资源登记与报告生成

声明与 API 清单交付必须在工作树自己的真实 `node_modules/` 目录中生成，不能将整个目录链接到
其他工作树。声明打包器会把解析后的依赖路径编码为私有类型名；目录符号链接会造成 `.d.ts`
与 `gallery:api` 指纹相对标准 CI 漂移。使用 lockfile 对应的独立安装或完整依赖目录副本，
再运行 `build:dts`、`gallery:api` 和消费者验证；不要手工替换生成声明中的路径或私有类型名。

| 命令                          | 用途                                                                                           | 产物与写入行为                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run analyze`             | 分析 Web 特性可达性、平台覆写与上游抽取关系。                                                  | 默认重写 `docs/extraction-manifest.json` 与 `docs/upstream-file-map.json`；依赖图文件名为 `web-dependency-graph.json`，默认目录 `build/reports/`，需单独运行本命令生成。`OUT_DIR` 重定向输出，`AIR_FEATURES` 选择特性集。 |
| `npm run vendor:npm`          | 从已安装的 Box2D、Cannon、DragonBones npm 包复制运行时子集，让 `src/` 内构建器解析真实包布局。 | 写入运行时文件与裁剪后 manifest 到 `src/node_modules/@cocos/{box2d,cannon,dragonbones-js}/`，在 `types/` 下生成仅供声明的 Box2D 文件，并向 `docs/upstream-file-map.json` 追加缺失登记。这不止是依赖安装。                 |
| `npm run gallery:manifest`    | 汇总 `examples/<id>/example.json` 的 Gallery 展示字段。                                        | 重写 `examples/files.json`；不编译示例、不生成 Gallery HTML、不产生浏览器证据。                                                                                                                                           |
| `npm run gallery:api`         | 从 `build/cocosair.module.d.ts` 的 AST 生成公共 API 清单、分类与指纹。                         | 重写 `docs/example-api-inventory.json`；要求当前声明，且不执行 API 用例。                                                                                                                                                 |
| `npm run capabilities`        | 在真实浏览器读取 glTF 扩展支持矩阵，再合并既有验证级别与模型目录信息。                         | 重写 `examples/gltf-catalog/capabilities.json`。要求可用的 Bash/Playwright CLI 工具（`PWCLI` 可指定包装器）与 `127.0.0.1:7462` 的开发服务器，例如另开终端跑 `npm run dev -- --port 7462`。                                |
| `npm run verify:api-coverage` | 从 API 清单、示例规格、执行证据与指纹计算 claimed/attested/verified 覆盖率并执行门禁。         | 默认重写 `docs/api-coverage-report.json`，即使门禁失败也写；`-- --check` 只比较现有报告不改写。不跑浏览器补证据。通过回归下限不等于发布就绪。                                                                             |
| `npm run verify:v06-gate`     | 汇总现有 Golden Reference、Catalog、Recipe 等证据评估 V0.6 门禁。                              | 重写 `docs/evidence/v06-review-gate.json` 与 `build/reports/` 下的 `v06-final-gate.md`；不自动重跑证据采集器。失败时报告可标记 `BLOCKED`。                                                                                |

## 静态门禁、测试与包消费者验证

| 命令                                                                                                    | 用途                                                                                                                                                                                                                                                                                                                         | 产物与写入行为                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:web-only`                                                                               | 在临时目录重建依赖图，检查运行时闭包排除 Native、MiniGame 等平台实现与未登记外部依赖。                                                                                                                                                                                                                                       | 输出结果到终端并清理临时分析 JSON；不重写 `docs/` 的权威依赖清单。                                                                                                   |
| `npm run verify:file-map`                                                                               | 检查抽取文件、上游原件、修改登记、manifest 与 moduleOverrides 的一致性。                                                                                                                                                                                                                                                     | 默认输出结果不写文件；要求上游 cocos4 源码可访问（`COCOS_UPSTREAM` 可指定路径）与依赖包。                                                                            |
| `npm run verify:licenses`                                                                               | 检查第三方运行时许可原文、包内包含规则与产物指纹与默认/变体能力的一致性。                                                                                                                                                                                                                                                    | 默认输出结果不写报告文件；不自动补齐缺失许可。                                                                                                                       |
| `npm run verify:doc-refs`                                                                               | 检查根 README、顶层 docs 与文档专题目录的本地路径引用，用既有断链基线拒绝新断链或过期基线项。                                                                                                                                                                                                                                | 默认输出终端 JSON 与退出码；仅在提供输出选项时写报告。不编辑文档、不检查外部 URL 可达性。                                                                            |
| `npm run verify:port-candidate -- snapshot --out=<new.json> --deep` / `-- check --snapshot=<file.json>` | 记录或比对实际 Git/源码/配置/runner/合同/产物身份。`--load-url=` 记录观察到的加载 URL，`AIR_FEATURES`/`AIR_OUT_DIR` 影响身份。                                                                                                                                                                                               | snapshot 要求显式输出路径，覆盖现有文件需 `--force`。check 为只读，除非提供 `--report-out=`。缺失产物会披露而非合成；漂移退出 1。不构建、不重采证据。                |
| `npm run verify:port-evidence -- --report=<report.json> --verify-paths`                                 | 校验 `port-gap-evidence/1` 的 gate/status/scope/fingerprint/attempt-chain 合同，可选检查原始输出路径。`-- --selftest` 跑校验器回归。                                                                                                                                                                                         | 只读，终端结果/退出码；不生成报告、不启动浏览器。合法的 NOT_RUN/BLOCKED 报告不是门禁 PASS。                                                                          |
| `npm run verify:port-env -- --out=<new.json>`                                                           | 检查 Node/npm/Git/编译器/测试/Playwright 解析与缓存浏览器可用性。                                                                                                                                                                                                                                                            | 只读环境探测；打印结果或只写显式请求的 JSON。不安装、下载、启动浏览器，也不证明缓存二进制可启动。                                                                    |
| `npm run verify:wasm-backends`                                                                          | 检查 WASM 物理后端源码闭包、登记、特性边界与类型检查豁免条件。                                                                                                                                                                                                                                                               | 输出结果无固定产物；源码检查不建立浏览器运行时行为。                                                                                                                 |
| `npm run verify:custom-exports`                                                                         | 检查自定义管线/后处理源码、聚合导出与默认可选特性边界。                                                                                                                                                                                                                                                                      | 输出结果无固定产物；不校验像素。                                                                                                                                     |
| `npm run verify:feature-exports`                                                                        | 核对能力名、特性单元、聚合导出与默认 bundle 组成。                                                                                                                                                                                                                                                                           | 输出结果无固定产物。bundle 缺失时跳过部分检查；注意核对报告范围。                                                                                                    |
| `npm run verify:example-chain`                                                                          | 检查既有 V1.1 证据结构、逐项校验器、完成标记、候选一致性与测试消费者。                                                                                                                                                                                                                                                       | 输出结果无固定产物、不启动浏览器。披露当前候选与证据的不一致；单独通过不建立证据新鲜度。                                                                             |
| `npm run verify:test-inventory`                                                                         | 先跑 inventory runner 的独立进程/JSON 正负控，再跑 Jest 并比对套件/用例名、执行状态与登记清单。Jest stdout/stderr 实时透传；每 30 秒的存活提示不宣称测试有进展。非零退出、信号、残缺 JSON、遗漏/跳过的测试均失败。                                                                                                           | 默认输出实时测试日志及最终 JSON；读取并删除临时 `build/.test-inventory-<pid>.json`。仅显式 `-- --update` 且完整执行全绿才重写 `docs/test-inventory.json`。           |
| `npm run verify:benchmark`                                                                              | 对基准工具跑 `noEmit` 类型检查，再回归编译诊断、指标聚合、隔离/超时与 Recipe catalog 编译。                                                                                                                                                                                                                                  | 输出终端 JSON 并清理临时工作目录；不生成基准评分报告、不跑完整性能测试。                                                                                             |
| `npm run verify:g3-tooling`                                                                             | 回归嵌套源指纹、开发服务器 JS/TS 解析优先级、纹理行朝向与资源状态/字节计数处理。                                                                                                                                                                                                                                             | 输出结果；在系统临时目录创建并清理测试文件，不生成正式证据 JSON。                                                                                                    |
| `npm run verify:decoders`                                                                               | 检查 decoder 文件、许可、manifest/哈希与包内离线加载。                                                                                                                                                                                                                                                                       | 输出终端 JSON；跑 `npm pack`，创建临时 `.tgz` 与 `build/.tmp-pack-audit-*` 后清理。不安装或下载缺失 decoder。                                                        |
| `npm run verify:consumer`                                                                               | 打包并安装到独立临时项目，检查真实 `import()`、公共 API、TS 4.9 node16/classic 消费、decoder 文件、README 链接与主入口打包解析。可选 `-- --modern-ts=<compiler-bin>` 检查另行配置的新编译器及其原生 DOM 入口；`-- --bootstrap-browser --browser-out=<new.json>` 还用 Playwright 在三浏览器验证应用动态导入主入口的已安装包。 | 输出终端 JSON；创建本地 `.tgz` 与临时消费者项目，正常完成时清理。可选浏览器模式写请求的新 JSON 与相邻 `-artifacts/` 截图。不构建引擎、不安装编译器、不改变项目依赖。 |
| `npm run verify:release`                                                                                | 针对当前候选评估发布就绪度，覆盖声明/API 清单、覆盖率、Gallery 与浏览器证据，要求 Git 工作区干净。                                                                                                                                                                                                                           | 只输出 `READY` / `NOT READY`、阻塞项与退出码；不重建、不重采证据、不打包、不发布。在相关构建与证据更新后运行。                                                       |

## 浏览器证据采集（写报告或截图）

这些命令要求可解析的 Playwright 工具与匹配的浏览器二进制。Playwright 非项目依赖时，使用配置好的工具环境或 `NODE_PATH`；`npm install` 成功不建立浏览器可用性。通常要求已存在 `build/cocosair.module.js`；具体前置见下。

`AIR_CHROMIUM_PATH` 可显式指定现有 Chrome/Chromium 可执行文件，适用于 `example-spec-browser.cjs`、`devtools-examples.cjs`、`gallery-artifact.cjs` 和 `browser-matrix.cjs`。采集仍使用真实浏览器；不自动安装浏览器或修改系统配置。

静态 Gallery 使用直接入口 `node tools/verify/gallery-artifact.cjs build`，重建 `build/examples/`，按 manifest 选择示例、内联配方源码并改写嵌套部署链接；不携带仓库验证脚本或历史诊断基线。`scan` 只读扫描该产物的绝对路径依赖，输出 JSON，不启动浏览器或写证据；`verify` 用真实浏览器验证嵌套部署并写 `docs/evidence/gallery-artifact.json`。独立 Gallery 的 legacy 基线比较明确报错，仓库内诊断入口保持。

| 命令                              | 用途与前置                                                                                                                                                                                                                                                                             | 产物与写入行为                                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:browser-matrix`   | 先执行 `tools/verify/video-loop-sequencing.test.cjs` 的 CPU 时序回归，再用 `tools/verify/browser-matrix-contract.json` 在 Chromium、Firefox、WebKit 跑合同条目；要求 bundle、示例资产与浏览器二进制。`--ids/--engines/--out` 透传给矩阵采集器。合同定义范围，不等于每个 Gallery 示例。 | 默认重写 `docs/evidence/browser-matrix/browser-matrix.json`；截图写入 `docs/evidence/browser-matrix/<id>/matrix-<engine>.png`（部分还有 `-before.png`）。子集运行不是完整验证。`--out=` 只重定向 JSON；截图仍用这些目录。 |
| `npm run verify:perf-lifecycle`   | 用 `build/examples/` 的静态 Gallery 在 Chromium 验证反复加载/实例化/销毁与加载期稳定性。                                                                                                                                                                                               | 重写 `docs/evidence/perf-lifecycle.json`；不构建静态 Gallery。不可用的内存测量记录为 unavailable。                                                                                                                        |
| `npm run verify:tarball-consumer` | 临时打包并离线安装到新项目，再在 Chromium 中运行安装后的包，验证启动、API、像素、无 source map 的 npm 入口、本地开发 source map 与嵌套路径/CSP 场景。                                                                                                                                  | 重写 `docs/evidence/tarball-browser-consumer.json`；`prepack` 刷新 `build/npm/`，临时包与消费者目录事后清理。                                                                                                             |
| `npm run verify:g3-dev`           | 自动启动开发服务器与 Chromium，检查 `starter`、`hello-cube`、`scene-switch-reentry` 的模块加载、组件更新与交互。                                                                                                                                                                       | 成功时写 `docs/evidence/g3-dev-samples.json`，截图写 `output/playwright/g3-<id>.png`；事后关闭服务器与浏览器。                                                                                                            |

## Spark 可选特性门禁

Spark 高斯泼溅是可选特性单元，仅进 spark 变体产物（`build/spark.module.js`），**不进默认 bundle**。
这些门禁不参与默认发布就绪判定，且要求在仓库外提供冻结上游与外部运行时（详见各脚本头部与 `ai/plans/spark-integration.md`）。

| 命令                                | 用途                                                                                                                                                                                 | 产物与写入行为                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `npm run verify:spark-adapter`      | SPK-13：校验适配层的逐成员 `@air-element` 归属标注，成员标注必须指向引擎真实存在的元素而非常量。                                                                                     | 输出结果与退出码；不启动浏览器、不写证据。                                    |
| `npm run verify:spark-assets`       | SPK-11：审计 `vendor/spark-rs/`（WASM + wasm-bindgen glue）与 `build/fflate/` 两个构建期第三方资产目录的落位形态。                                                                   | 输出结果与退出码；不重建 WASM、不下载资产。                                   |
| `npm run verify:spark-math-parity`  | SPK-04：以 Three.js r180 为 oracle，在位复跑 `tests/math-parity`。                                                                                                                   | 默认写 `output/spk04-math-parity-latest.json`（被忽略目录）；不修改仓库源码。 |
| `npm run verify:spark-data-parity`  | SPK-13：按本仓库实际发布的 WASM 与 glue 字节复跑 CPU/WASM 解码等价对照。                                                                                                             | 输出结果与退出码。                                                            |
| `npm run verify:spark-cpu-parity`   | SPK-13：在真实浏览器中，对照本仓库产物内 Spark 主体与冻结上游参考包，覆盖 `fromHalf` 全 65536 模式、`toHalf` 边界与 256 级等 CPU 编解码族。                                          | 输出结果与退出码。                                                            |
| `npm run verify:spark-pixel-parity` | SPK-13：在同一浏览器引擎内渲染同一确定性高斯泼溅场景两次（上游 three.js + `@sparkjsdev/spark` 2.3.1 oracle 作只读对照 vs 本仓库 bundle + AIR Spark 集成层），逐字节比较 RGBA8 读回。 | 输出结果与退出码；oracle 只读服务，不复制进本仓库。                           |
| `npm run verify:spark-dpr-mismatch` | SPK-13：故意让浏览器上下文 DPR 与页面 `?dpr=` 不一致，暴露偷偷读 `window.devicePixelRatio` 的实现。                                                                                  | 输出结果与退出码。                                                            |

## 脚本编写约定

- 报告文件存在不代表当前运行成功：检查退出码、时间戳、完成/子集标记与适用的源码/bundle/合同指纹。
- 不要仅为了解命令含义而运行写证据的门禁。
- 名称含 `verify` 不必然表示只读操作。

## WebGPU 接入的资产写入

`build` / `build:min` / `build:system` 在编译前验证 `vendor/webgpu/manifest.json`，复制冻结 JS/WASM 与许可到当前输出目录的 `webgpu/`；不下载资产。`prepack` 同样验证并复制到 `build/npm/webgpu/`，该目录包含在 npm files 清单内。默认 WebGL2 不触发运行时加载。

`node tools/build/webgpu-assets.cjs --check` 只读核对已登记资产哈希；`node tools/verify/webgpu-backend.cjs [--examples] [--custom] [--engine=edge|firefox|webkit]` 需要配置好的 Playwright 和现有 bundle，写 `output/webgpu-backend/report.json` 与截图，不重建、不发布。

`node tools/build/builtin-assets.cjs --verify` 只读核对冻结 builtin 输入/输出哈希；`--write` 需要显式配置 `COCOS_EFFECT_COMPILER_ROOT` 与 `COCOS_UPSTREAM`，写 `vendor/builtin-source/` 快照和 manifest、两份 `src/air/builtin/` 生成源码及 `licenses/LICENSE_builtin_source.txt`；`--check` 重编到内存比对。后两种模式使用 `build/.tmp-builtin-source-*` 临时目录，成功后清理；不下载编译器或更换冻结上游。

`node tools/verify/consumer-acceptance.cjs --webgpu-browser` 在现有消费门禁上增加安装后 dev/min 的实际 Chromium WebGPU 验证，分别写 `output/webgpu-backend/package/`、`package-min/`；临时 tarball/消费者结束清理。Firefox/WebKit 无 adapter 的渲染报告保持 `BLOCKED` 并返回非零，不当作渲染通过。范围和当前结果见 [WebGPU 验收说明](webgpu-acceptance.md)。

### WebGPU 完整 Windows 专项

| 入口                                                        | 用途与前置                                                                                      | 输出与写入                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| webgpu-environment.cjs --out=新目录                         | 不加载 AIR 的原生 Firefox/WebKit 对照；需 Playwright                                            | 新目录 report.json；--graphics 仅额外尝试 about:support，不改变浏览器设置                           |
| webgpu-backend.cjs --examples --custom --out=新目录         | 21 行场景；--headed --firefox-fixed-refresh 用于 Firefox；AIR_CHROMIUM_PATH 可指定现有 Chromium | 新目录 JSON/PNG；默认旧输出行为保留；--case/--renderer 是诊断子集，完整验收不接受子集               |
| consumer-acceptance.cjs --webgpu-full --webgpu-out=新目录根 | 在实际安装包 dev/min 上运行同一全矩阵                                                           | prepack 更新 build/npm；临时目录打包安装并清理；写 package/、package-min/                           |
| webgpu-completion-runner.cjs --out=新目录                   | 顺序完成原生预检后采集浏览器及包；不构建或升级依赖                                              | 新目录报告、日志、真实 OS 退出码；--resume 仅复用匹配当前源码/采集器/完整范围的成功记录，并披露来源 |
| webgpu-acceptance.cjs --reports=输出目录                    | 核对当前候选、资产、完整行集、17 资源（含 canvas 外部图像上传）、退出码、七效果及 PNG 像素      | 默认只读终端 JSON；仅 --archive=新目录 时复制证据/源码/清单，不覆盖或嵌套输入目录                   |
| webgpu-candidate.cjs                                        | 供采集器和验收器共享源码/JS map 指纹                                                            | 内部只读模块，无独立写入                                                                            |

这些是直接 Node 入口，未新增 npm scripts；scripts 总数仍为 48。Firefox 自动化刷新配置、Windows WebKit 排除与 Safari 外部项见 [环境说明](webgpu-environment.md)。
