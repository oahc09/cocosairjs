# Cocos Air Recipe Final Gate 剩余任务执行提示词

将下面整段内容交给执行 Agent。它描述的是当前工作区状态，不允许从旧提交重新开始。

```text
你在 Windows 仓库 E:\AIProMax\github\cocosair.js 中工作。目标是完成 Recipe Final Gate 当前唯一剩余门禁：为 30 条 Recipe 建立真实、可复现的完整场景证据，使 Validated Count >= 30、Stable Count >= 20，并让自动生成的 Recipe Final Gate Final Gate 从 BLOCKED 变为 PASS。

这是实施任务。直接修改、运行验证并交付；不要只写计划。不要提交、推送、发布或部署。

一、先保护当前工作区

1. 开始时执行：

   git status --short
   git diff --check
   git diff --name-only

2. 当前工作区包含一批未提交的 Code Review 修复，全部必须保留并在其上增量工作。禁止 reset、checkout、stash、clean 或覆盖这些改动。
3. 特别保留用户的未跟踪文件：

   ai/Cocos Air — Examples Gallery & API Coverage 任务计划书.md

4. 当前已完成且不得回退的修复包括：

   - Type-B Trial 执行模块图构建、TypeScript 检查和 Fresh Browser Context。
   - Trial deadline 覆盖 Harness，cleanup 有独立期限；无法确认隔离时返回 INVALID_RUN。
   - Golden 指标统一使用 runner/metrics.ts 的 aggregate()。
   - contractual unsupported 不进入 Agent 分母；First Compile 只统计 Type-B。
   - B051/B052/B057 Draco 缺失按 EXPECTED_UNSUPPORTED / DEVICE 记录。
   - Benchmark evidence 包含当前源码哈希，旧证据不得冒充当前结果。
   - Catalog Reference 当前结果为 97 PASS + 3 EXPECTED_UNSUPPORTED。
   - Golden Agent 当前为 9/9，Type-B First Compile 为 6/6。
   - Jest 当前为 28 suites / 201 tests 全过。
   - 30 条 Recipe 当前均为 draft；targetStatus 保存预期的 validated/stable 等级。

5. 先阅读：

   ai/Cocos Air Runtime Release Evolution 任务书.md 的 §58–§65、§78
   tools/benchmark/recipes/recipes30.ts
   tools/benchmark/recipes/schema.ts
   tools/verify/v06-report.cjs
   docs/versions/v06-final-gate.md
   docs/evidence/v06-review-gate.json

二、完成标准

Recipe 不能通过“引用一个存在的 Benchmark/Example”晋级。每条进入 validated 或 stable 的 Recipe 必须有一次与该 Recipe ID 和版本绑定的真实组合场景运行，并同时证明：

1. Scene setup 完成。
2. requiredAssets 已实际加载或明确为空。
3. requiredCapabilities 已按名称检查；unsupported/fallback 使用稳定状态和错误码。
4. runtimeState 达成。
5. interactionSteps 由真实浏览器事件或 Agent Session 操作执行，不能只检查文字存在。
6. visualTarget 由确定性像素、截图、场景检查或材质/动画状态证明。
7. no blocking runtime error。
8. stable Recipe 额外证明资源生命周期：创建/加载、使用、dispose/释放后无残留和无失效引用。

必须实现并产出：

   docs/evidence/v06-recipes.json

其中每条 evidence 至少包含：

   recipeId
   recipeVersion
   source.kind              # benchmark 或 example
   source.id
   runId
   revision/baseRevision
   sourceHash
   measuredAt
   environment             # browser、viewport、WebGL backend
   result                  # PASS/FAIL
   sceneSetup
   requiredAssets
   requiredCapabilities
   runtimeState
   interactionSteps
   visualTarget
   checks.scene
   checks.interaction
   checks.visual
   checks.lifecycle
   checks.noRuntimeErrors
   validatorResults
   artifacts               # 截图/JSON 路径；不得写本机绝对路径

证据必须由 Runner 写出，不能手工填写 PASS。每条 evidence 的 sourceHash 必须覆盖该场景源码、所用资源、Recipe 定义和验证器。v06-report 必须拒绝旧 hash、缺字段、重复 runId、版本不匹配或只有原子 Benchmark 拼接的证据。

三、实现路径

1. 在 tools/benchmark/recipes/ 下新增正式的 Recipe scenario catalog 和 runner。不要把临时生成脚本放入 build/。
2. 每个 Recipe 建立完整 composite scenario。可以共享框架和基础场景函数，但每条 Recipe 必须有独立目标、交互和验证结果。
3. 使用 Playwright Fresh Context 执行。优先复用 BrowserRuntime、Agent Session、现有 validators 和本地 fixtures。
4. 对需要点击、拖拽、键盘、相机切换、热点选择的 Recipe，必须发出真实浏览器输入并验证操作前后状态或画面差异。
5. 对动画 Recipe，至少采样两个受控时间点，并验证动画状态和帧差异。
6. 对材质 Recipe，检查实际材质属性/能力状态，并配合画面或像素证据；不能只检查节点存在。
7. 对模型/角色 Recipe，使用本地 glTF fixtures，不依赖第三方在线 URL。
8. 对资源生命周期，记录释放前后资源/节点/引用结果。只检查 no-runtime-error 不算 lifecycle PASS。
9. 稳定 Recipe 必须关联本次实际运行的完整 Example 或 composite benchmark。若当前能力无法实现某条 Recipe，应保持 draft 并让 Gate 继续 BLOCKED，不能降低验证语义或伪造证据。
10. 证据通过后，按 targetStatus 将对应 Recipe 从 draft 晋级。晋级逻辑必须由 evidence 验证结果驱动，不能批量硬编码状态。

四、浏览器与环境

1. 检查 npx、Playwright 和 Chromium 实际路径，不要假设全局包存在。
2. 可使用本机 Playwright 缓存和 Codex workspace dependencies；按环境设置 NODE_PATH 和 AIR_CHROMIUM。
3. 浏览器测试必须使用 Fresh Context；每条 scenario 结束关闭 context/server，并检查进程和监听器无残留。
4. 诊断日志写 .log；结构化 evidence 文件必须是纯 JSON，不含 C:\Users\...、Temp 目录或其他主机绝对路径。

五、必须新增的测试

1. Recipe evidence schema：缺少任一必需字段失败。
2. recipeId/version/sourceHash 不匹配失败。
3. 重复 runId 失败。
4. 只有无关的 scene-ready/no-runtime-error Benchmark 引用时不能晋级。
5. interaction 没有真实操作结果时失败。
6. visual 没有截图/像素/确定性状态时失败。
7. stable 缺生命周期结果时失败。
8. 一条真实 validated Recipe 通过。
9. 一条真实 stable Recipe 通过。
10. 30 条全部执行后，recipeStats 得到 catalogTotal >= 30、validatedCount >= 30、stableCount >= 20。
11. 测试必须经过真实 esbuild/tsc 路径，不能只依赖 ts-jest transpile-only。

六、验证命令

至少运行并记录：

   npm run verify:benchmark
   npx jest test/smoke/smoke-27-recipes-distribution.test.ts test/smoke/smoke-28-benchmark-regression.test.ts --runInBand
   npm test -- --runInBand
   npm run typecheck
   npm run build
   npm run build:min
   npm run build:dts
   npm run verify:web-only
   npm run verify:decoders
   npm run verify:consumer

使用真实浏览器重跑：

   node tools/benchmark/run-dual-track.cjs
   node tools/verify/v06-catalog-gate.cjs
   node tools/benchmark/recipes/run-recipes-browser.cjs
   node tools/verify/v06-report.cjs

verify:v06-gate 在 Recipe 未达标时应非零；只有全部门禁满足后才允许返回 0。

七、报告与交付

1. docs/versions/v06-final-gate.md 只能由机器证据生成，禁止手工宣布全绿。
2. docs/evidence/v06-review-gate.json 必须与当前源码哈希一致。
3. 清晰区分 PASS、EXPECTED_UNSUPPORTED、BLOCKED 和 FAIL。
4. A001 是 scripted reference solver，只证明工作流，不宣称 LLM 智能水平。
5. 不得删除或隐藏失败记录；失败 Recipe 保持 draft。
6. 最终回复列出：改动文件、Recipe 30/validated/stable 数量、浏览器结果、Jest/构建结果、仍有的 blocker。
7. 不执行 git add、commit、push、npm publish 或部署。

当前真实基线：核心 Benchmark 修复和重新验证已经完成，唯一剩余产品门禁是 Recipe 完整场景证据。不要重复重写 Runner Core，也不要回退现有未提交修复。
```
