# Cocos AIR 文档

从 [开发手册](manual/index.md) 或 [Code First 入门](guides/code-first.md) 开始。浏览器运行要求见 [WebGL 2 支持策略](webgl2-only.md)。

| 目录         | 阅读内容                                       |
| ------------ | ---------------------------------------------- |
| `guides/`    | 启动、资产加载、骨骼工具、开发服务器和调试会话 |
| `manual/`    | API 使用教程及对应的可运行示例                 |
| `gltf/`      | 模型加载、扩展语义、解码器部署和官方模型预览   |
| `reference/` | 功能边界、API 合同、决策依据和验证方法         |
| `notes/`     | 专题行为调查与外部资产限制                     |
| `evidence/`  | 保留的示例、手册和 Recipe 运行材料             |

上游基线与修改登记见 [UPSTREAM.md](UPSTREAM.md)，第三方许可见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。验证和发布流程见 [验证指南](reference/verification.md)，目录维护见 [仓库组织约定](reference/repository-layout.md)，直接运行工具前查看 [工具索引](../tools/README.md)。旧版验收、交接和进展快照已移除，Git 历史可用于追溯；当前发布状态以重新运行的门禁结果为准。

纯代码创建大量动态物件时，先读[实例批次](guides/instance-batches.md)；需要发射、生命周期和拖尾时读[3D 粒子](guides/particles.md)；文字/图像/网格之间的 GPU 连续形变、点/体素与抛光表面见[GPU 形态场](guides/morph-fields.md)。这三类入口均复用原生对象，能力边界不同，不等同于 glTF 的骨骼或 Morph 权重。

顶层 JSON 是工具输入或登记数据：`upstream-file-map.json`、`extraction-manifest.json` 描述抽取关系；`example-api-inventory.json`、`api-coverage-report.json`、`test-inventory.json` 支撑覆盖和回归检查；`license-decisions.json` 保存许可处置。它们与对应脚本共同维护。

可再生成的基线比较和依赖图报告写入 build/reports/，不作为 docs 的长期文档或 npm 发布内容。WASM 子树检查与 Web 依赖检查直接读取当前源码，无需恢复旧快照。
