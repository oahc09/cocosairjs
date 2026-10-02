# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this repo is

**Cocos AIR** (Cocos Agent-first Interactive Runtime) is a standalone TypeScript runtime for interactive 3D web applications. It was extracted from the cocos4 Web engine so developers can create scenes with code and run them in a browser without Cocos Creator or its Editor asset pipeline. A typical application calls `createAirApp()`, builds a scene with the original Cocos `Scene`, `Node`, `Camera`, renderer, material, and animation APIs, then runs that scene through WebGL 2. Browser targets require WebGL 2; unsupported contexts reject startup with `WEBGL2_REQUIRED` (see [browser support policy](docs/webgl2-only.md)).

The runtime also supports direct glTF/GLB loading, including materials, skeletal animation, and supported extensions. The examples and manual teach those APIs. Separate development tools provide inspection, validation, and agent feedback; they are not part of the default runtime bundle. This repository is a Web engine and developer toolkit, not a Creator plugin, visual editor, or native-platform runtime.

Start with [README.md](README.md) for the current quick start and capability boundaries. [UPSTREAM.md](docs/UPSTREAM.md) records the engine source baseline and intentional differences from upstream.

## Repository layout

| Path | Purpose |
|---|---|
| `src/cocos/` | Extracted Cocos engine source. Keep upstream differences small and traceable. |
| `src/pal/`, `src/exports/` | Web platform adapters and build feature/export entry points. |
| `src/air/` | Cocos AIR's thin bootstrap, Code First helpers, built-in resources, and glTF integration. |
| `build/` | Generated ESM bundles, declarations, and separately shipped decoder assets. |
| `examples/` | Runnable applications, Gallery metadata, and example assets. |
| `docs/` | Getting-started material, engine analysis, API guidance, and verification records. |
| `docs/manual/` | Developer manual and its examples. |
| `tools/` | Build, development server, analysis, and verification tooling. `tools/debug/` contains optional development tools. |
| `tools/build/`, `tools/analyze/`, `tools/verify/` | Dependency vendoring and builds; dependency analysis and upstream group import; static gates and browser probes. Organize active tools by purpose, not release version. |
| `test/` | Smoke tests and fixtures. |
| `ai/` | Topic-based plans, execution ledgers, and prompts; see `ai/README.md`. These are not proof that a feature shipped. |

PAL 使用 `vendor/pal-source/` 中冻结的公开 MIT 源码；`node tools/build/pal-source.cjs --check` 只读校验来源哈希、生成产物及版权 notice，`--write` 显式重建 `src/pal/`。不要重新引入旧 `@cocos/engine-pal` 包字节。

工具入口见 [tools/README.md](tools/README.md)，目录与命名规则见 [仓库组织约定](docs/reference/repository-layout.md)。新示例默认使用 `src/main.ts`；已有示例 ID、上游路径和证据 schema 标识作为稳定关联保留；文档和证据文件按用途命名，路径迁移必须同步生成器、消费者和报告内资源路径。

## Development workflow

以下说明对应 [package.json](package.json) 当前的 37 个 `scripts`。除下文特别说明的 `baseline` 外，从仓库根目录执行；`npm test` 等价于 `npm run test`，传递脚本参数使用 `npm run <名称> -- <参数>`。

首次开发建议先安装依赖、生成开发 bundle，再启动服务：

```bash
npm install
npm run build
npm run dev
```

### npm 自带命令（不是项目 scripts）

| 命令 | 含义 | 产物与写入行为 |
|---|---|---|
| `npm install` | 按依赖声明安装本项目依赖。 | 写入 `node_modules/`，依赖解析变化时可能更新 `package-lock.json`；不会自动构建引擎。 |
| `npm ci` | 严格按已有 lockfile 安装，适用于 CI 或复现依赖环境。 | 先清理再重建 `node_modules/`；不更新 lockfile，不构建引擎。 |
| `npm pack` | `prepack` 从现有本地 bundle 准备无 source map 的 `build/npm/` 发布副本，再按 `package.json` 文件清单打包。 | 默认在当前目录生成 `cocosair.js-<version>.tgz`；不会编译引擎，打包前须运行 `npm run build:all`；不上传 registry。 |

### 日常开发与格式

| 命令 | 含义 | 产物与写入行为 |
|---|---|---|
| `npm run dev` | 启动本地示例服务，默认 `http://127.0.0.1:7454/`、示例 `starter`；支持 `-- --example hello-cube --port 7454`。监听 engine/AIR 源码变化后重建并刷新；示例、手册和调试工具变化仅刷新。 | 常驻 HTTP 服务；示例 TS 按请求编译到内存，不生成静态站点。源码变化会刷新 `build/cocosair.module.js` 及 map；启动本身不保证已有 bundle 存在或最新，应先运行 `build`。 |
| `npm run typecheck` | 按根 `tsconfig.json` 检查 `src/` TypeScript，并遵循其排除列表；不涵盖所有示例和工具。 | `noEmit: true`，只输出诊断和退出码，不生成 JS 或 `.d.ts`。 |
| `npm test` | 运行 `test/smoke/*.test.ts` 的 Jest 测试（jsdom + HEADLESS）；可用 `npm test -- --runInBand` 串行执行。 | 终端测试报告与测试临时文件/缓存；不构建发行 bundle，不替代浏览器视觉验证。 |
| `npm run format` | 用 Prettier 格式化 `package.json` 中显式列出的示例、手册示例、部分工具及工作流文档；遵循 `.prettierignore`。 | **原地改写**匹配的源文件和文档，不是全仓格式化；上游 `src/` 排除，Markdown 嵌入代码按现有配置保留原样。 |
| `npm run format:check` | 检查与 `format` 相同范围的格式。 | 终端结果与退出码，不改写文件，不生成报告文件。 |

### 构建与上游基线

| 命令 | 含义 | 主要产物与写入行为 |
|---|---|---|
| `npm run build` | 构建默认 feature 集的未压缩 Web ESM 运行时。 | `build/cocosair.module.js`、`build/cocosair.module.js.map`；刷新下述模块格式标记，可能更新增量缓存；不更新 min bundle 或类型声明。 |
| `npm run build:min` | 构建同一运行时的压缩 ESM 版本。 | `build/cocosair.module.min.js`、`build/cocosair.module.min.js.map`；刷新模块格式标记；不更新普通 bundle 或类型声明。 |
| `npm run build:dts` | 汇总引擎声明，并转换为 npm 包可直接导入的 SDK 声明。 | `build/cocosair.module.d.ts`；可能保留 `build/.dts-tmp-*`、`build/.dts-before-bundle-*` 中间目录，不生成运行时 JS。 |
| `npm run build:all` | 顺序执行普通 ESM、压缩 ESM、类型构建，生成 `build/npm/` 无 source map 发布副本，再检查发布 bundle 的内置资源。 | 本地开发 JS + map、`.d.ts`、`build/npm/` 发布 JS 副本和模块格式标记；检查结果写终端。**不会**生成 `.tgz`、静态 Gallery 或重新采集浏览器证据，也不执行发布。 |
| `npm run prepack` | 从已有本地 bundle 准备 npm 发布副本；`npm pack` 自动调用。 | 写入 `build/npm/` 无 source map 的 JS 副本，不编译引擎，不上传包。 |
| `npm run build:system` | 构建 SystemJS 模块格式，用于需要该加载方式的场景。 | `build/cc.js`、`build/cc.js.map`，并刷新模块格式标记；不是默认 npm ESM 入口，不包含在 `build:all` 中。 |
| `npm run baseline` | 历史上游 cocos4 Web 基线构建，排除依赖缺失 native/external 资产的 feature，使用 SystemJS 分包。 | 在**当前引擎目录**写 `bin/dev/cc-baseline/`。脚本直接读取 `cwd/cc.config.json`，而 AIR 仓库根没有该文件，直接从本仓库运行此 npm script 会失败；应在上游 cocos4 根目录直接调用本仓库的 `tools/baseline/build-baseline.cjs`。 |

默认 `build`、`build:min`、`build:system` 都写 `build/package.json`（`type: module`）及 `build/gltf-decoders/package.json`（`type: commonjs`）。后者仅声明已有 decoder 文件的模块格式，**不下载或生成 decoder 的 JS/WASM 资产**。构建脚本支持 `AIR_FEATURES` 覆盖 feature 集、`AIR_OUT_DIR` 重定向输出目录；这些变体不刷新默认发布附属文件，也不共享默认 ESM 的增量缓存。`build:dts` 是独立脚本，不跟随 `AIR_OUT_DIR` 重定向。

### 清单、资源登记与报告生成

这些命令会写入仓库内容；名称包含 `verify` 也不一定只读。

| 命令 | 含义 | 产物与写入行为 |
|---|---|---|
| `npm run analyze` | 分析 Web feature 的依赖可达性、平台替换和上游抽取关系。 | 默认重写 `docs/extraction-manifest.json`、`docs/upstream-file-map.json`，依赖图写入 `build/reports/web-dependency-graph.json`；`OUT_DIR` 可重定向输出，`AIR_FEATURES` 可指定 feature 集。 |
| `npm run vendor:npm` | 从已安装 npm 包复制 Box2D、Cannon、DragonBones 的运行时子集，使 `src/` 内构建器能解析真实包布局。 | 写入 `src/node_modules/@cocos/{box2d,cannon,dragonbones-js}/` 的运行文件和精简 `package.json`；缺少登记时追加 `docs/upstream-file-map.json`。不是单纯安装依赖。 |
| `npm run gallery:manifest` | 从各 `examples/<id>/example.json` 汇总 Gallery 展示字段。 | 重写 `examples/files.json`；不编译示例、不生成 Gallery HTML、不产生浏览器验证证据。 |
| `npm run gallery:api` | 从 `build/cocosair.module.d.ts` 的 AST 生成公开 API 清单、分类及指纹。 | 重写 `docs/example-api-inventory.json`；需要当前类型声明，不执行 API 用例。 |
| `npm run capabilities` | 在真实浏览器读取 glTF 扩展支持矩阵，再合并已有验证等级和模型目录信息。 | 重写 `examples/gltf-catalog/capabilities.json`。需要可用的 Bash/Playwright CLI（`PWCLI` 可指定 wrapper），以及运行在 `127.0.0.1:7462` 的开发服务，例如另开终端执行 `npm run dev -- --port 7462`。 |
| `npm run verify:api-coverage` | 用 API 清单、示例规格、执行证据及指纹计算 claimed/attested/verified 和覆盖率，执行覆盖门禁。 | 默认重写 `docs/api-coverage-report.json`，门禁失败也可能已写报告；`-- --check` 改为核对现有报告而不重写。不会自动运行浏览器补齐证据；回归下限通过不等于 release 门禁通过。 |
| `npm run verify:v06-gate` | 汇总既有 Golden Reference、Catalog、Recipe 等证据，判定 V0.6 阶段门禁。 | 重写 `docs/evidence/v06-review-gate.json` 和 `build/reports/v06-final-gate.md`；不自动重跑这些证据的采集器，失败时报告可标为 `BLOCKED`。 |

### 静态门禁、测试与包消费验证

| 命令 | 含义 | 产物与写入行为 |
|---|---|---|
| `npm run verify:web-only` | 在临时目录重建依赖图，检查运行时闭包不引入 Native、MiniGame 等平台实现及未登记外部依赖。 | 终端结论；临时分析 JSON 完成后清理，不重写 `docs/` 的正典依赖清单。 |
| `npm run verify:file-map` | 比较抽取文件、上游原文、修改登记、manifest 和 moduleOverrides 的完整性。 | 终端结论，无默认写入；需要可访问的上游 cocos4（`COCOS_UPSTREAM` 可指定）及依赖包。 |
| `npm run verify:licenses` | 检查第三方运行时的许可文本、包内携带规则及 bundle 指纹，与默认/变体能力对应。 | 终端结论，无默认报告文件，不自动补许可证。 |
| `npm run verify:doc-refs` | 检查根 README、docs 顶层和各文档主题目录的本地路径引用，按既有断链基线阻止新增断链或失效基线。 | 默认仅终端 JSON 与退出码；可选输出参数才写报告，不改文档。它不检查外部网址是否可访问。 |
| `npm run verify:wasm-backends` | 检查 WASM 物理后端的源码闭包、登记、feature 边界与类型豁免条件。 | 默认终端结果，无固定产物；源码检查不等于后端已在浏览器运行。 |
| `npm run verify:custom-exports` | 检查 custom pipeline / post-process 的源码、聚合导出和默认 feature 边界。 | 默认终端结果，无固定产物；不验证像素效果。 |
| `npm run verify:feature-exports` | 对账能力名、feature unit、聚合导出及默认 bundle 的组成。 | 默认终端结果，无固定产物；bundle 缺失时部分检查会跳过，应查看输出范围。 |
| `npm run verify:example-chain` | 检查现有 V1.1 证据的结构、逐项 validator、完成标记、内部候选一致性及测试消费者。 | 默认终端结果，无固定产物，不启动浏览器。当前候选与证据不匹配会披露，不能仅凭本门禁通过就认定证据最新。 |
| `npm run verify:test-inventory` | 实际运行 Jest，并将 suite/test 名称、执行状态与已登记清单核对，防止漏发现或跳过测试。 | 默认输出终端 JSON；临时 `build/.test-inventory-<pid>.json` 读后删除。只有显式 `-- --update` 才重写 `docs/test-inventory.json`。 |
| `npm run verify:benchmark` | 先对 benchmark 工具做 `noEmit` 类型检查，再回归编译诊断、指标聚合、隔离/超时及 Recipe 目录可编译性。 | 终端 JSON 与已清理的临时工作目录，不生成 benchmark 成绩报告，不是全量性能测试。 |
| `npm run verify:g3-tooling` | 回归嵌套源码指纹、开发服务器 JS/TS 解析优先级、纹理行方向、资源状态码与字节数判断。 | 终端结论；测试文件在系统临时目录创建并清理，不生成正式证据 JSON。 |
| `npm run verify:decoders` | 检查 decoder 文件、许可、manifest/hash，以及打包后离线加载是否成立。 | 终端 JSON；会执行 `npm pack`，创建临时 `.tgz` 和 `build/.tmp-pack-audit-*`，随后清理。不会安装/下载缺失 decoder。 |
| `npm run verify:consumer` | 打包并在独立临时项目安装包，检查真实 `import()`、公开 API、消费端类型检查、decoder 文件及 README 包内链接。 | 终端 JSON；创建本地 `.tgz` 和临时 consumer 项目，正常收尾清理。不自动构建待打包的引擎。 |
| `npm run verify:release` | 对照当前候选、声明/API 清单、覆盖率、Gallery 和浏览器证据执行发布就绪门禁，并要求 Git 工作区干净。 | 仅输出 `READY` / `NOT READY`、阻断项及退出码；不重建、不重采、不打包、不发布。应在相关构建和证据已更新后运行。 |

### 浏览器取证（会写报告或截图）

这些命令需要可解析的 Playwright 与匹配的浏览器二进制；Playwright 未列入当前项目依赖时，应使用已配置的工具环境或 `NODE_PATH`，不能把 `npm install` 成功当成浏览器环境齐备。通常还需要已有的 `build/cocosair.module.js`；具体前置产物见表。

| 命令 | 含义与前置条件 | 产物与写入行为 |
|---|---|---|
| `npm run verify:browser-matrix` | 按 `tools/verify/browser-matrix-contract.json` 在 Chromium、Firefox、WebKit 执行契约条目；需要 bundle、示例资产和相应浏览器。范围由契约决定，不等于所有 Gallery 示例。 | 默认重写 `docs/evidence/browser-matrix/browser-matrix.json`，截图写入 `docs/evidence/browser-matrix/<id>/matrix-<engine>.png`（部分还有 `-before.png`）。子集运行不是全量证明；`--out=` 只重定向 JSON，截图仍写上述目录。 |
| `npm run verify:perf-lifecycle` | 使用已生成的 `build/examples/` 静态 Gallery，在 Chromium 中验证重复加载/实例化/销毁与加载耗时稳定性。 | 重写 `docs/evidence/perf-lifecycle.json`；不构建静态 Gallery，内存读数不可用会记录 unavailable。 |
| `npm run verify:tarball-consumer` | 临时打包并离线安装到新项目，让 Chromium 实际运行安装包，验证启动、API、像素、无 sourcemap 的 npm 入口、本地 dev sourcemap 和嵌套路径/CSP 场景。 | 重写 `docs/evidence/tarball-browser-consumer.json`；`prepack` 刷新 `build/npm/`，临时包和 consumer 目录完成后清理。 |
| `npm run verify:g3-dev` | 自动启动开发服务器和 Chromium，检查 `starter`、`hello-cube`、`scene-switch-reentry` 的模块加载、组件更新与交互。 | 成功后写 `docs/evidence/g3-dev-samples.json`；截图为 `output/playwright/g3-<id>.png`，收尾关闭服务和浏览器。 |

报告文件存在不表示本次运行成功：检查命令退出码、报告时间、完成/子集标记和适用的源码/bundle/契约指纹。不要仅为查询命令含义而运行会改写证据的脚本。新增或修改 npm script 时，同步维护本节的用途、输出路径和写入行为。

The `#GameCanvas` element must exist before importing the engine in a browser page because the screen adapter initializes during module import. Use `examples/starter/` for the minimal page structure. For model loading and decoder deployment, see [docs/gltf/gltf-runtime.md](docs/gltf/gltf-runtime.md) and [docs/gltf/gltf-decoder-deployment.md](docs/gltf/gltf-decoder-deployment.md).

## Working agreements

- Treat the original Cocos engine API as the main public API. Add AIR-specific conveniences in `src/air/` where needed; avoid creating parallel `Scene`, `Node`, or material abstractions.
- Preserve the Web-only boundary. Keep Creator Editor, JSB, and native implementations out of the runtime dependency graph. The glTF decoders ship separately from the main bundle and are configured only when needed.
- Keep development inspection and agent tools separate from the default runtime package. A Gallery or example may opt into them explicitly.
- Before changing extracted engine files, read the relevant upstream mapping and record intentional differences in `docs/upstream-file-map.json` and [UPSTREAM.md](docs/UPSTREAM.md). Do not silently replace the pinned upstream baseline.
- Preserve unrelated local changes. Check the target file and Git status before editing; avoid resetting or cleaning another contributor's work.
- Use focused validation for the affected behavior. For visual or rendering changes, check the actual browser result; typecheck or a successful bundle alone does not establish visual correctness. Some verification scripts write evidence files, so inspect their effects before running them in a shared worktree.
- Keep claims about completion tied to the current code and verification evidence. A version plan, a passing subset, or a generated report from an older revision does not by itself establish release readiness.
