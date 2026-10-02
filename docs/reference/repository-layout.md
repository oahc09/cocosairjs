# 仓库组织与命名

正式代码、教学内容、开发工具、运行证据与实施计划按用途分开维护。目录全貌见 [AGENTS.md](../../AGENTS.md#repository-layout)，工具入口见 [tools/README.md](../../tools/README.md)。

## 文件归属

| 内容                 | 位置                                             | 维护约定                                                            |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| AIR 自有运行时代码   | `src/air/`                                       | 按资产、渲染、引导和工具职责分层。                                  |
| 上游引擎和平台适配   | `src/cocos/`、`src/pal/`、`src/exports/`         | 保留上游路径与命名；修改遵守映射登记。                              |
| 可运行示例           | `examples/<id>/`                                 | 保留稳定 ID、规格和资源来源。共享教学代码放 `examples/shared/`。    |
| 手册及教学示例       | `docs/manual/`、`docs/manual/examples/`          | 正文与源码同步；已有主题路径保持稳定。                              |
| 指南、参考与专题调查 | `docs/guides/`、`docs/reference/`、`docs/notes/` | 现行操作说明与历史调查结论明确区分。                                |
| 运行证据             | `docs/evidence/`                                 | 由对应运行器维护；不通过手改时间或指纹让旧证据看起来最新。          |
| 开发与验证工具       | `tools/<purpose>/`                               | 构建、分析、生成、验证、调试按实际行为归属。                        |
| 测试输入             | `test/fixtures/`、`tools/benchmark/fixtures/`    | 空文件、异常资产与固定案例编号可能是必要负控。                      |
| 计划与记录           | `ai/plans/`、`ai/ledgers/`、`ai/prompts/`        | 索引按主题组织，状态以文档记录时点解读。                            |
| 发布与本地构建资产   | `build/`                                         | 已跟踪 bundle、声明、decoder 与被忽略的缓存/静态 Gallery 分别维护。 |

## 命名规则

- 自有目录和普通文件使用小写 `kebab-case`，优先表达用途。避免用 `tmp`、`new`、`final2` 或实施轮次命名常驻内容。
- 组件类文件沿用 `Rotator.ts`、`Ticker.ts` 等 `PascalCase`；配置文件、第三方资产与上游源码保留既有规范。
- 新示例默认使用 `index.html`、`examples/<id>/src/main.ts`、`example.json`，可选 `src/components/` 和 `assets/`。已有 JS 示例保留其教学语言；迁移入口位置必须检查共享库导入与开发/静态服务行为。
- 示例 ID 是 Gallery、规格和证据的关联键。仅改善拼写不能直接改 ID；确需调整时同步清单、运行器和证据关联。
- API 类型名转为描述性词组，例如新命名优先 `mesh-renderer-*`、`color-timeline-*`；`2d`、`3d`、`gltf`、`webgl2` 等已统一技术词保留。
- 计划文档名不重复项目全名；正文保留完整中文标题。计划和台账使用相同主题名、不同目录。
- 工具按行为命名。只有案例编号、版本化合同或历史证据确需区分时保留编号；编号不能替代用途说明。

文档和报告使用主题名，例如 `notes/audio-notes.md`、`reference/api-stability.md`、`evidence/examples-verified.json` 和 `evidence/recipes-browser.json`。跨浏览器证据集中于 `evidence/browser-matrix/`。移动报告时同步生产脚本、门禁、测试及报告内的资源路径；既有 schema、场景 ID 和合同编号保持其协议含义。运行日志写入被忽略的 `output/`。

## 临时内容与清理

本地 `node_modules/`、`output/`、`.playwright-cli/`、构建缓存和 `tools/**/.tmp-*/` 不作为项目源码入库。临时目录由创建工具负责收尾；有复用价值的增量缓存不因体积较大而删除。

常驻探针放 `tools/debug/probes/`，名称表达诊断对象；生成器放 `tools/fixtures/` 或 `tools/examples/`。一次性修补脚本完成使命后移除，以 Git 历史追溯；不再创建重复的旧版正典生成入口。

`src/node_modules/` 是已登记的 vendored 运行库，decoder 中的编码器也用于夹具重建；这类资产与普通依赖缓存分别处理。许可原文、冻结参考、故意损坏的测试资产及 `.gitkeep` 不按文件大小或表面重复自动删除。

移动文件后同步相对导入、npm scripts、文档与索引，并按影响范围验证。目录整理不等于重新采证或发布验收。
