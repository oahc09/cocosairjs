# 文档目录

这里按用途保留文档和验证数据。日常开发先看 [使用手册](manual/index.md) 和 [Code First 入门](guides/06-code-first-getting-started.md)；模型加载与部署见 [glTF 运行时](gltf/gltf-runtime.md) 和 [解码器部署](gltf/gltf-decoder-deployment.md)。能力边界见 [Web 功能集](foundation/01-web-feature-set.md)，版本结论见 [V1.2 验收记录](versions/acceptance-report-v12.md)。

| 位置 | 内容 | 维护原则 |
|---|---|---|
| `manual/` | 面向使用者的教程和可运行示例 | 与示例源码和公开 API 保持一致 |
| `foundation/` | 上游基线、Web 能力范围和差异对照 | 与抽取映射及 Web 门禁一起维护 |
| `guides/` | 资产加载、蒙皮模型与引擎开发指南 | 供 Code First 开发者按主题查阅 |
| `gltf/` | glTF 运行时、扩展、目录与验证文档 | 与加载器及模型示例共同维护 |
| `reference/` | API 稳定性和场景缺口登记 | 保持引用路径与示例说明一致 |
| `versions/` | 各版验收、移交和阶段进展记录 | 历史结论不作为当前发布就绪证明 |
| `notes/` | V1.2 专题调查与资产来源结论 | 保留代码诊断与示例规格指向的完整路径 |
| `evidence/` | 示例、手册、Recipe 的运行证据 | 发布门禁缺证据时必须判未就绪 |

根目录中的 `upstream-file-map.json`、`extraction-manifest.json`、`web-dependency-graph.json` 是上游抽取和文件映射的登记数据；`example-api-inventory.json`、`api-coverage-report.json`、`test-inventory.json`、`v12-baseline-compare.json` 是当前检查或报告的输入。它们虽可由工具生成，但不属于随手清理的临时文件。

上游差异见 [UPSTREAM.md](UPSTREAM.md)，第三方许可见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。版本验收结论仍以对应报告和当前门禁结果为准；历史截图和日志不能替代本轮验证。
