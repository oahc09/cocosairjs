# Cocos AIR 工具

从仓库根目录执行工具。日常入口优先使用 [package.json](../package.json) 的 npm scripts；前置条件、产物和写入行为见 [AGENTS.md](../AGENTS.md#development-workflow)。

## 按任务找工具

| 目录                          | 用途                                       | 入口与写入范围                                                                                                                  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `build/`                      | 引擎、声明构建与依赖 vendoring             | `build.cjs`、`build-dts.cjs`；写 `build/`。vendoring 工具写 `src/node_modules/` 及登记数据。                                    |
| `dev/`                        | 开发服务与模块解析                         | `dev-server.cjs`；源码变化时重建开发 bundle，示例编译到内存。                                                                   |
| `analyze/`                    | 依赖分析、上游分组导入与源码抽取           | `dep-graph.cjs`、`import-upstream-group.cjs`、`extract-upstream.cjs`；会写清单或源码。抽取不是日常构建，裸跑可能覆盖 AIR 修改。 |
| `baseline/`                   | 上游 Web 引擎基线构建                      | `build-baseline.cjs`；在上游工作目录写 `bin/dev/cc-baseline/`。                                                                 |
| `compare/`                    | 上游与 AIR 基线比较                        | `baseline-compare.cjs`；比较前先准备对应构建与分析输入。                                                                        |
| `examples/`                   | Gallery 清单、API 清单、示例规格与覆盖维护 | `generate-manifest.cjs`、`api-inventory.cjs`、`spec-*.cjs`；可能写示例规格和 docs 清单。                                        |
| `examples/generation/`        | 按选题生成覆盖示例                         | `generate-examples.cjs` 与三份 `topics-*.cjs`；写 `examples/`，不自动构成验收证据。                                             |
| `examples/coverage-bindings/` | 把已执行 API 的源码位置绑定到示例规格      | `bind-*.cjs`；会维护指定示例的 `example.json`，不执行浏览器、不替代证据采集。                                                   |
| `fixtures/`                   | 可重建测试和示例资产                       | 几何、glTF viewer、音频、视频、DragonBones 生成器；写各自目标资产目录。                                                         |
| `debug/`                      | 独立开发工具与诊断页面                     | `agent-session.ts`、`panel.ts`、`probes/`；探针不登记到 Gallery。                                                               |
| `benchmark/`                  | Benchmark / Recipe 目录、运行器与验证器    | 固定编号夹具、冻结参考源码和 TypeScript 合同属于测试输入，不作为临时内容清理。                                                  |
| `verify/`                     | 静态门禁、浏览器验证与消费验证             | 名称不保证只读；浏览器运行器通常会写证据，运行前查看文件头及 npm 命令说明。                                                     |

## 常用直接入口

PAL 的运行时来源固定在 `vendor/pal-source/` 的公开 MIT 快照；
`node tools/build/pal-source.cjs --check` 校验冻结来源及全部生成输出，
`--write` 才会重建 JS、声明和版权 notice。该工具不读取旧 engine-pal npm 包，不下载源码。

| 任务                    | 入口                                                                                        | 产物或副作用                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 生成公开 API 清单       | `npm run gallery:api`                                                                       | 唯一正式生成器为 `examples/api-inventory.cjs --write`；写 `docs/example-api-inventory.json`。试验用 `--out=PATH`。 |
| 按示例回填规格行号      | `node tools/examples/spec-fixlines.cjs --ids=hello-cube --check`                            | `--check` 仅检查；省略时原地维护指定示例的 `example.json`。                                                        |
| 试跑页面行为探针        | `node tools/verify/trial-probes.cjs --root=tools/debug/probes --ids=lights-hdr-calibration` | 需要 Playwright 与开发 bundle；结果写系统临时目录，不改正典证据。                                                  |
| Shader 探针             | `node tools/verify/shader-probe.cjs`                                                        | 需要 Playwright 与 bundle；会写 Shader 证据。                                                                      |
| 示例规格浏览器验证      | `node tools/verify/example-spec-browser.cjs`                                                | 会采集运行证据并按规格处理示例晋级。                                                                               |
| DevTools 示例验证       | `node tools/verify/devtools-examples.cjs`                                                   | 会写独立 DevTools 示例证据。                                                                                       |
| 静态 Gallery 构建与验证 | `node tools/verify/gallery-artifact.cjs build`                                              | `build` 写 `build/examples/`；验证子命令见脚本文件头。                                                             |
| 手册源码一致性          | `node tools/verify/manual-doc-consistency.cjs --strict`                                     | 只读核对手册代码块与示例源码。                                                                                     |
| 文档路径引用            | `npm run verify:doc-refs`                                                                   | 默认只读；使用显式输出参数才写报告。                                                                               |

## 命名与历史合同

工具文件按用途命名，不再用实施阶段作为活跃入口名。例如 `example-spec-browser.cjs`、`dev-tooling.cjs`、`context-loss.cjs`。npm script 名称保持稳定。

`basic-examples-browser.cjs`、`bundle-variants-*.cjs/js`、`benchmark-browser-matrix.cjs` 等保留原有专项验证范围和前置服务要求；它们不替代当前 `browser-matrix.cjs` 或发布门禁。阶段编号仍可出现在合同、日志和证据文件名中，用来识别历史口径。

一次性 `patch-wave-*` 字符串补丁已移除，修订直接落在生成器选题源文件中；历史实现可由 Git 追溯。工具移动后，已有证据不会自动重采，发布就绪状态仍需对应当前候选的验证。

目录与命名规则见 [仓库组织约定](../docs/reference/repository-layout.md)，计划与台账见 [ai 索引](../ai/README.md)。
