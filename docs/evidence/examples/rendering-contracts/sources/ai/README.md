# 计划、台账与执行提示词

这里保存实施意图、执行记录和复核提示词。文档中的状态属于其记录时点；不能据此认定当前功能完成或发布就绪。

| 目录或文件 | 用途 |
| --- | --- |
| `plans/` | 任务范围、实施方案与验收要求 |
| `ledgers/` | 与计划对应的执行记录和残余事项 |
| `prompts/` | 专项执行或独立审查的提示词 |
| [example-spec-execution.md](example-spec-execution.md) | 示例规格的补充执行规范；正式规格见 [docs/reference/example-specification.md](../docs/reference/example-specification.md) |

## 按主题阅读

| 主题 | 计划 | 执行台账 |
| --- | --- | --- |
| Code First 与 Web 可靠性 | [计划](plans/code-first-web-reliability.md) | [台账](ledgers/code-first-web-reliability.md) |
| API 场景、开发范式与 Shader | [计划](plans/api-scenarios-shaders.md) | [台账](ledgers/api-scenarios-shaders.md) |
| 引擎抽取 | [计划](plans/engine-extraction.md) | — |
| Code First DX 与 SDK | [计划](plans/code-first-dx-sdk.md) | — |
| 独立资产管线 | [计划](plans/standalone-asset-pipeline.md) | — |
| glTF 扩展覆盖 | [计划](plans/gltf-extension-coverage.md) | — |
| 开发者生态 | [计划](plans/developer-ecosystem.md) | — |
| 开发手册 | [计划](plans/development-manual.md) | — |
| Creator 指南对照补缺 | [计划](plans/manual-creator-guide-coverage.md) | — |
| Gallery 与 API 覆盖 | [计划](plans/examples-gallery-api-coverage.md) | — |
| 特性回归 | [计划](plans/feature-regression.md) | — |
| Runtime Release 演进 | [计划](plans/runtime-release-evolution.md) | — |
| 全局质量审查 | [计划](plans/global-quality-audit.md) | — |
| 竞争力基准回灌 | [计划](plans/competitive-benchmark-remediation.md) | [台账](ledgers/competitive-benchmark-remediation.md) |
| 1:1 复刻端口缺口 | [计划](plans/port-gap-remediation.md) | [台账](ledgers/port-gap-remediation.md) |
| 渲染目标、颜色与多通道 DX | — | [定向实施与验收](ledgers/rendering-contracts.md) |

## 专项提示词

- [Recipe final gate](prompts/recipe-final-gate.md)
- [独立全局审查](prompts/global-audit.md)

文件名使用简短的英文主题名，中文完整标题保留在正文；对应计划与台账使用同一主题名。历史材料保留原有合同和结论，当前运行入口以 [工具索引](../tools/README.md) 为准。
