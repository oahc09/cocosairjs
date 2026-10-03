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

## 程序化场景与独立验收工具

以下入口不新增引擎依赖。浏览器工具需要现有 bundle、可解析的 Playwright 及匹配浏览器；
`neon-night-city.cjs` 另需能转译示例TS的HTTP服务。它们不会代为build、pack或安装浏览器。

| 任务                     | 入口                                                                                                                                                                                                            | 产物与写入行为                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 从GLSL与声明表生成effect | [build/effect-json.mjs](build/effect-json.mjs)：`node tools/build/effect-json.mjs examples/point-cloud-basics/point.effect-spec.json output/playwright/point.generated.effect.json`                             | 校验通过后写显式指定JSON，不改默认bundle。支持子集与UBO限制见 [自定义Shader手册](../docs/manual/custom-shaders.md#7-从声明表生成-effect-json)。生成JSON不等于GPU编译通过。                                              |
| 夜城满规模独立验收       | [verify/neon-night-city.cjs](verify/neon-night-city.cjs)：`node tools/verify/neon-night-city.cjs --url=http://127.0.0.1:7473/examples/neon-night-city/ --out=output/playwright/neon-night-city-acceptance.json` | 读取现有页面，验证真实计数、像素、车/雨归因、雾、reset和释放；写指定JSON及同名PNG。可用NODE_PATH或`--playwright-module`提供现有模块。                                                                                   |
| 本地服务器代理负控       | [verify/loopback-browser-regression.cjs](verify/loopback-browser-regression.cjs)：`node tools/verify/loopback-browser-regression.cjs`                                                                           | 临时启动本地HTML服务器，在浏览器子进程中模拟失效代理并检查回环绕过；写 `output/playwright/loopback-browser-regression.json`。不改变系统代理，不打印凭据，不忽略网络错误。                                               |
| 矩阵数值区间断言         | [verify/probe-ranges.cjs](verify/probe-ranges.cjs)                                                                                                                                                              | 无独立CLI；验证器组件。只接受有限number及inclusive min/max，缺值和非有限值失败，不写文件。                                                                                                                              |
| 本地回环浏览器环境       | [verify/loopback-browser-env.cjs](verify/loopback-browser-env.cjs)                                                                                                                                              | 无独立CLI；保留现有代理和绕过目标，给浏览器进程补NO_PROXY/no_proxy的回环地址，不改变主进程或系统设置。                                                                                                                  |
| 示例本地模块闭包         | [examples/local-source-closure.cjs](examples/local-source-closure.cjs)                                                                                                                                          | 无独立CLI；规格审计组件。AST读取examples范围内的真实本地导入并解析JS→TS回退，循环去重；生命周期安装检查不把注释、字符串或空声明当调用。                                                                                 |
| 三路线Recipe当前候选重采 | [benchmark/recipes/run-competitive-batching.cjs](benchmark/recipes/run-competitive-batching.cjs)：`node tools/benchmark/recipes/run-competitive-batching.cjs`                                                   | 读取当前bundle/声明与3例，自带只读TS HTTP服务；实际运行8个规模/instancing条件、每组120帧原始采样、像素和释放重建。写 `docs/evidence/recipes/competitive-batching/browser.json` 与8张PNG，不重建SDK。                    |
| 三路线Recipe显式门禁     | `node tools/verify/recipe-review-gate.cjs --scope=competitive-batching`                                                                                                                                         | 校验完整输入/截图SHA、scope、3定义8用例、material/pass/geometry条件、像素、draw、样本与lifecycle；写本scope的 `review-gate.json`。默认`legacy30`仍保留原历史Golden/Catalog/30Recipe门禁，不把本scope PASS当旧全集PASS。 |

独立报告的作用域应按实际运行的示例、视口和候选指纹解释。
CPU提交与rAF观测不能替代GPU耗时或显示present；发布验证仍使用正式规格、矩阵与包消费门禁。

## 命名与历史合同

CB21 成本复测使用 [benchmark/prepare-cost-retest.mjs](benchmark/prepare-cost-retest.mjs) 创建新的隔离批次；默认 dry-run，`--execute` 才写入不存在的新目录。候选包、知识、规范、模型配置和预算计数脚本均有独立指纹，不覆盖旧 benchmark。

浏览器矩阵合同可用`probePath`指定示例已有的只读探针,如`__bench.getState`或`__characterProbe`;默认仍为`__probe`。显式路径不存在或不是函数即失败,不会换用别的探针。报告记录合同、运行器和读取函数指纹。该矩阵不替代各例完整交互/插值/生命周期探针。

`node tools/verify/competitive-package-fox.cjs --package-root=<实际安装包目录> --tarball=<冻结tgz> --out=<新报告路径>`启动自己的只读示例服务,串行检查三浏览器中的Fox、原生材质控制与方向ShadowMap,并对照工作区/包/min像素。它不会build或安装包;显式输出报告、截图与来源SHA。当前材质纹理属性为`mainTexture`,shader sampler为`albedoMap`,启用宏为`USE_ALBEDO_MAP`,不要混用。

[benchmark/validate-cost-arm.mjs](benchmark/validate-cost-arm.mjs) 的 `--prepare-instrument` 冻结公开验证器与真实 GPU 浏览器配置；`--check-inputs` 只读检查，正式执行才写该臂的 `independent-validation/`，含规范要求的视频证据。验证器构建与 Agent 构建分别计数，已有结果不覆盖。前置条件与范围见 [成本复测合同](../docs/reference/cost-retest-contract.md)。

工具文件按用途命名，不再用实施阶段作为活跃入口名。例如 `example-spec-browser.cjs`、`dev-tooling.cjs`、`context-loss.cjs`。npm script 名称保持稳定。

`basic-examples-browser.cjs`、`bundle-variants-*.cjs/js`、`benchmark-browser-matrix.cjs` 等保留原有专项验证范围和前置服务要求；它们不替代当前 `browser-matrix.cjs` 或发布门禁。阶段编号仍可出现在合同、日志和证据文件名中，用来识别历史口径。

一次性 `patch-wave-*` 字符串补丁已移除，修订直接落在生成器选题源文件中；历史实现可由 Git 追溯。工具移动后，已有证据不会自动重采，发布就绪状态仍需对应当前候选的验证。

目录与命名规则见 [仓库组织约定](../docs/reference/repository-layout.md)，计划与台账见 [ai 索引](../ai/README.md)。
