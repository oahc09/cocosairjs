# V0.5.1 总验收（T7）

> 交接 revision：V0.5.1 起点 `534f2bb`（T0 冻结交接）→ 本版 tip
> （见 `docs/progress.md` 提交列表）。测试发现继承 V0.5 最终配置
> （jest `testRegex: /test/smoke/.*\.test\.ts$/`），未重建平行体系。

## 1. 测试发现证明

`npx jest --listTests` → **23 个套件**（V0.5 的 21 + 本版新增
smoke-22-agent-session、smoke-23-debug-isolation），全部位于既有发现规则内，
无需扩展规则。

## 2. 强制命令（本版全部通过）

| 命令 | 结果 |
|---|---|
| `npm run build` | ✅ esm bundle + map |
| `npm run build:min` | ✅ |
| `npm run build:dts` | ✅（pal/input 符号解析告警为 V0.5 起既有上游噪音，exit 0） |
| `npm run typecheck` | ✅ 0 错误 |
| `npm run verify:web-only` | ✅ PASSED（797 files reachable） |
| `npm test` | ✅ **23 套件 / 155 测试** |

按变动补跑：

| 工具 | 结果 |
|---|---|
| `tools/verify/source-maps.cjs` | ✅ 571 sources，0 missing |
| `tools/verify/build-cache.cjs` | ✅ cold/warm/changed/recovered/key-mismatch 五态符合预期 |
| `tools/verify/dev-loop.cjs` | ✅ reload=1、engine/air build=0、example 错误恢复、importmap 注入 |
| `tools/verify/decoder-audit.cjs` | ✅ MANIFEST 双向哈希、bundle 隔离（15 文件） |
| `tools/verify/consumer-acceptance.cjs` | ✅ ok:true / failures:[] |
| `tools/verify/v051-examples-browser.cjs` | ✅ 7/7（G2：旧示例回归 + 4 新示例 + 导航） |
| `tools/verify/v051-panel-browser.cjs` | ✅ 7/7（G5：面板全流程 + 关闭无残留） |
| `tools/verify/v051-runtime-baseline.cjs` | ✅ 加载回归 0.512（≤1.15 线），报告见 v051-runtime-baseline.md |

## 3. 覆盖矩阵（计划书 §9.1）

| 计划要求覆盖 | 落点 |
|---|---|
| tarball 文件清单、空项目安装、类型消费、构建与浏览器运行 | consumer-acceptance.cjs + smoke-23 + v051 浏览器套件 |
| 旧路径与嵌套示例发现、TS 编译失败恢复、example-only reload | dev-loop.cjs（既有）+ v051-examples-browser（导航与旧 URL） |
| ID 稳定性、失效引用、只读 inspection、错误输入与可写范围 | smoke-22（G3 段 + G4 段） |
| 生命周期、关闭中异步、重复请求、错误缓冲上限、hook 恢复 | smoke-22（含监听器泄漏回归） |
| canvas 新帧、空场景、错误路径、面板关闭、默认运行时零调试依赖 | smoke-22 capture 段 + v051-panel-browser + smoke-23 |

## 4. 证据索引

- `output/playwright/v051-examples-result.json`、`v051-*.png`（G2/G4 画面与结果）
- `output/playwright/v051-panel-result.json`、`v051-panel-open/closed.png`（G5）
- `docs/evidence/v051-runtime-baseline.json`（T6 原始数据）
- `output/playwright/v051-runtime-baseline.json`（同上，脚本输出）

## 5. Deviations 与边界声明

1. **浏览器套件执行方式**：V0.5 的 playwright-cli 会话在本环境不可用（命令不存在），
   本版浏览器验证改为等价的独立 Playwright 脚本（同一 chromium 缓存、
   `executablePath` 指向本机 chromium-1234），检查语义保持一致。
2. **AirApp 接口增量**：新增只读 `canvas` 属性（T3/T4 显式绑定合同所需），
   类型层面变更，无运行时行为差异；bundle 字节差异仅来源于此。
3. **glTF 引擎路径零改动**：本版未触碰 `src/air/assets/gltf/**` 与渲染管线；
   smoke-07..21 全量回归通过，V0.5 浏览器证据不重测（无变动）。
4. **正式发布**：未获授权，不执行 npm publish（见 v051-package-consumption.md §4）；
   支持声明继续受 V0.5 capabilities 的 supported/decoder-required/
   device-dependent/fallback 状态约束。
5. **内存指标**：JS heap 为 Chromium 专属；GPU 侧在 WebGL 后端不可观测，
   记 unavailable（沿用 V0.5 口径），清理由行为级证据（hook 恢复、DOM 残留、
   实例销毁断言）支撑。

## 6. V0.5.1 → V0.6 交接

- 运行时 API：无新增默认导出（AirApp.canvas 类型增量除外）；
- 工具面：`tools/debug/`（agent-session / panel）+ `/__debug/`、`/__debug-button.js`
  dev server 路由成为 V0.6 Agent 工作台的地基；
- 文档面：`v051-*` 五篇 + V0.5 四篇 glTF 文档移交完成；
- 遗留：world 欧拉角（父级有旋转）的完整变换解算、面板属性编辑器、
  worker 化 decoder 仍留给 V0.6（见演进任务书）。
