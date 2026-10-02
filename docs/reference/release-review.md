# 发布复核与修复记录

日期：2026-10-02。项目版本保持 `1.0.0`；当前候选指纹：`0b9588dc80fd7afd`。

**技术与许可验收已通过。最终发布就绪状态以提交后的 release 门禁为准。** PAL 已换用公开 MIT 源码，不再使用 UNLICENSED npm 字节。来源链与复现说明见 [PAL 来源](pal-source.md)。本轮将 12 份 Markdown、9 份报告及浏览器矩阵目录改为主题名，同步工具、测试、示例和文档引用。Spine 运行时提示中的文档路径也已更新，普通 bundle 的唯一内容变化是该路径，类型声明逐字节不变。最终 build:all 和相关浏览器证据重采已完成；Label/RichText 的源码修复继续保留其独立提交归属。

## 当前验证

| 检查 | 本轮结果 | 证据 |
|---|---|---|
| 普通示例完整采集 | 141/141 PASS，completed=true、partial=false | [示例报告](../evidence/examples-verified.json) |
| DevTools 与运行时包边界 | 5/5 PASS，边界 PASS | [DevTools 报告](../evidence/devtools-examples.json) |
| 静态 Gallery、嵌套部署与生命周期 | 220/220 PASS | [Gallery 报告](../evidence/gallery-artifact.json) |
| 三浏览器契约矩阵 | 39/39 PASS，completed=true、subset=false | [矩阵报告](../evidence/browser-matrix/browser-matrix.json) |
| Recipe 场景行为 | 30/30 PASS | [Recipe 报告](../evidence/recipes-browser.json) |
| Core / Important / Advanced 逐 API verified | 963/963、272/272、180/191，即 100% / 100% / 94.2%；覆盖只读复核通过 | [覆盖报告](../api-coverage-report.json) |
| stable 示例登记数量 | 145，超过 120 门槛 | [Gallery 清单](../../examples/files.json) |
| Jest 与测试清单 | 33 suites、270/270 PASS；迁移后的测试名称与现有清单一致 | [测试清单](../test-inventory.json) |
| 独立 npm 消费 | 动态 import、582 个导出与消费端类型检查 PASS；包无外部运行时依赖 | `npm run verify:consumer` |
| 安装包真实浏览器、嵌套/CSP/source map 边界 | PASS | [包浏览器报告](../evidence/tarball-browser-consumer.json) |
| WebGL2-only | 开发与 min npm bundle 共 8/8 PASS | [WebGL2 报告](../evidence/webgl2-only.json) |
| 重复加载/销毁 | PASS；50 轮销毁、stillValid=0、instantiateFail=0 | [生命周期报告](../evidence/perf-lifecycle.json) |
| 手册代码一致性 | strict PASS，保留 3 条片段警告 | `node tools/verify/manual-doc-consistency.cjs --strict` |
| 规格符合性 | 0 fail / 1 warn；warn 是 Draco 正向解码的已声明边界 | [规格报告](../evidence/spec-compliance.json) |

## 已修复

- 发布门禁现算候选指纹，并执行覆盖只读复核与许可检查；旧报告间相互一致不再足以通过。
- 许可门禁不允许 riskAccepted 绕过缺失授权。PAL 通过公开 MIT 快照替换解决：38 个冻结输入生成 39 个运行时/声明文件，原文与版权 notice 随包提供；旧 npm 依赖已移除，旧二进制指纹不得残留。
- 安装手册对齐 1.0.0、开发 source map 与无 map npm 入口，区分 cocosair.js 包名和 cocosair importmap 别名；首页明示 Spine 独立许可与当前 PAL 来源。
- 移除已清理历史目录的测试豁免，保留孤儿目录与僵尸豁免检查。
- Draco 文档明确 Node/CommonJS 随包入口与应用自备浏览器 factory 的边界，不把文件审计 PASS 冒充浏览器正向解码 PASS。

## 发布前剩余条件

1. 审核并提交本轮文档路径迁移、相关源码提示、构建产物及真实证据，保留既有本地改动的归属。当前许可检查为 0 fail / 0 attention。
2. 工作区干净后运行 `node tools/examples/coverage-report.cjs --check`、`npm run verify:licenses` 与 `npm run verify:release`。当前 release 门禁只剩未提交/未跟踪文件一项，未放宽此要求。
3. 本轮最终构建和验证已完成；Git 提交后按工作区实际状态运行发布门禁。版本及保留依赖的锁定版本均未改变。

并发的 E-RICHTEXT-SHADOW-KERNEL-001 四个源码差异已登记在 file-map/UPSTREAM，并已验证在当前 source map 中与活跃源码一致；相关 WASM 闭包的允许差异清单同步到这项已登记事实。原有未登记差异检查仍然有效。

证据来自实际执行，未恢复已删除的历史报告，也未降低 100% / 90% / 80% 门槛。PAL 移入私有仓库前的公开 MIT 源码是新发行来源，不是对旧 UNLICENSED npm 包的追认授权。
