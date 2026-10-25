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
| 高质量互动内容功能补全 | [F01–F18 任务书](plans/vibe-content-capabilities.md) | [执行台账](ledgers/vibe-content-capabilities.md) |
| Code First 与 Web 可靠性 | [计划](plans/code-first-web-reliability.md) | [台账](ledgers/code-first-web-reliability.md) |
| API 场景、开发范式与 Shader | [计划](plans/api-scenarios-shaders.md) | [台账](ledgers/api-scenarios-shaders.md) |
| 引擎抽取 | [计划](plans/engine-extraction.md) | — |
| Code First DX 与 SDK | [计划](plans/code-first-dx-sdk.md) | — |
| 独立资产管线 | [计划](plans/standalone-asset-pipeline.md) | — |
| glTF 扩展覆盖 | [计划](plans/gltf-extension-coverage.md) | — |
| 开发者生态 | [计划](plans/developer-ecosystem.md) | — |
| PixiJS June 能力借鉴 | [实施顺序与状态](plans/pixi-capability-implementation.md) | — |
| WebGPU 后端 | [计划](plans/webgpu-backend.md) | [执行台账](ledgers/webgpu-backend.md) |
| 开发手册 | [计划](plans/development-manual.md) | — |
| Creator 指南对照补缺 | [计划](plans/manual-creator-guide-coverage.md) | — |
| Gallery 与 API 覆盖 | [计划](plans/examples-gallery-api-coverage.md) | — |
| 特性回归 | [计划](plans/feature-regression.md) | — |
| Runtime Release 演进 | [计划](plans/runtime-release-evolution.md) | — |
| 全局质量审查 | [计划](plans/global-quality-audit.md) | — |
| 竞争力基准回灌 | [计划](plans/competitive-benchmark-remediation.md) | [台账](ledgers/competitive-benchmark-remediation.md) |
| 1:1 复刻端口缺口 | [计划](plans/port-gap-remediation.md) | [台账](ledgers/port-gap-remediation.md) |
| 渲染目标、颜色与多通道 DX | — | [定向实施与验收](ledgers/rendering-contracts.md) |
| 响应式宿主、输入与棋盘配方 | — | [修复与验收](ledgers/responsive-host-remediation.md) |
| 原生网格、TRS 与渲染合同 | — | [ENG-01–09](ledgers/engine-contract-hardening.md) |
| WebGL2 图形能力、整数与分层读回 | [九项核心修复任务书](plans/webgl2-gfx-contract-remediation.md) | — |
| 互动引擎示例、诊断与验收补齐 | [IER-00～11 计划](plans/interactive-engine-improvements.md) | [执行台账](ledgers/interactive-engine-improvements.md) |
| Agent Skills 套件铺开 | [计划](plans/agent-skills-suite.md)、[实现步骤](plans/agent-skills-suite-steps.md) | — |
| Shader 效果算法借鉴与原生能力验证 | [计划](plans/shaders-absorption-task-plan.md) | [执行台账](ledgers/shaders-absorption.md) |
| Spark 高斯泼溅集成（SPK-00～14） | [计划](plans/spark-integration.md) | [执行台账](ledgers/spark-integration.md) |

## 专项提示词

- [Recipe final gate](prompts/recipe-final-gate.md)
- [独立全局审查](prompts/global-audit.md)

文件名使用简短的英文主题名，中文完整标题保留在正文；对应计划与台账使用同一主题名。历史材料保留原有合同和结论，当前运行入口以 [工具索引](../tools/README.md) 为准。
