# Effect Contract 与证据边界（Wave 0）

2026-10-09。对应[吸收计划](../../ai/plans/shaders-absorption-task-plan.md)第 4、10、11、12、16 节。

本批交付 Node/tools 层的参数与报告校验器。它不创建 effect、不接管渲染、没有新增
CocosAirJS 公共 API，也没有 SDF/Noise/Color 公共实现。先实现真实效果；至少两个真实
消费者和回归证明重复后，才讨论公共能力归属。上游固定为
`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。
具体参考文件与许可来自每个效果自己的 `UPSTREAM.md`；本批不猜测效果参数或算法。

## 参数单一事实源

实现入口：[shaders-effect-contract.cjs](../../tools/verify/shaders-effect-contract.cjs)，
工具类型：[shaders-effect-contract.d.ts](../../tools/verify/shaders-effect-contract.d.ts)。

`EffectContract` 是 `EffectDefinition` 的可序列化元数据投影：

```ts
{
  schemaVersion: 'shaders-effect-contract/1',
  name: string,
  version: string,
  params: Record<string, ParameterDescriptor>
}
```

运行时 `create(context)` 留在 example-local 实现；不要把函数送入 JSON 合同。
`context`、原生 Texture2D/Material 等对象不由此工具序列化。资源参数用已知身份字符串
或数值元数据指向实现持有的原生对象；这不代表已实现资源加载或资源类型校验。

| 字段 | 规则 |
| --- | --- |
| `type` | 显式 `number/integer/boolean/string/number-array`，不从 default 猜类型 |
| `defaultValue` | 必须存在，符合类型、enum、min/max；不接受 NaN/Infinity |
| `min/max` | 有限数、min ≤ max，包含端点；numeric tuple 逐分量检查 |
| `step` | 如声明必须有限且 > 0；作为控件步进元数据，不偷偷舍入或约束连续 uniform |
| `enum` | 非空、无重复，每项符合类型/范围，default 必须属于它 |
| `length` | 仅 `number-array` 使用，正整数；全部分量有限 |
| `unit` | 可选；如声明必须非空字符串；不自动进行 px/UV/角度转换 |
| `updateMode` | 必须为 `uniform/resource/pipeline/structure` |
| `description` | 非空语义说明 |

`validateDefinition(value)` 和 `validateParameters(definition, values)` 是 total 校验：
null、数组冒充对象、unknown key、missing key、wrong type、越界、invalid enum、
NaN/Infinity、函数、symbol、accessor、循环对象、稀疏数组均返回结构化错误。
不调用 getter、不修改输入。不自动 clamp、吞异常或转换字符串为数字。
`{ defaults: true }` 明确允许省略已声明参数并填入已校验 default；未声明 key 仍拒绝。
numeric tuple 是 JSON 数组；TypedArray/Vec2/Color 的转换责任留在 example-local 适配器。

`structureKey(definition, completeParameters, identity)` 返回 SHA-256：

- 包含全部 `structure` 和 `pipeline` 值；改变其中任一值都改变键。
- 包含完整 descriptor schema（含单位/默认/语义/updateMode）、effect name/version。
- 包含 source/SDK/runner/reference 文件 bytes+SHA 与参考 commit/license。
- uniform/resource 的当前值不进入结构键；它们的 descriptor 仍进入。
- 对键排序后 canonical JSON；相同参数的属性顺序不改变键。

此工具只计算键，不证明实现真的按 updateMode 更新或按该键缓存。真实案例必须记录
uniform 更新、资源更新与 rebuild 的前后计数。`checkDocumentation(definition, descriptors)`
检查参数集合与完整 descriptor 同源；新增/删除/拼错字段均拒绝。
这只是最小一致性检查，尚未实现 TS/API docs/Agent reference 生成框架，也没有
实现 Example API AST 校验。上述生成与 CI 接线属于后续 Wave，不能标成已交付。

## Engine Gate：六维独立

报告 `schemaVersion='shaders-engine-evidence/1'`。`gates` 必须完整包含
`Build/Runtime/Visual/Boundary/Resource/Performance`，不能混入 Agent 成功率。
每维记录独立 `status`、`scope.expectedCaseIds` 和 cases：

```ts
{
  caseId: string,
  status: 'PASS' | 'FAIL' | 'NOT_RUN' | 'BLOCKED' | 'LIMITED',
  reason?: string,
  classification?: Classification,
  method?: 'NODE' | 'REAL_BROWSER',
  browser?: string,
  browserVersion?: string,
  execution?: {
    command, cwd, startedAt, endedAt, exitCode,
    rawOutputs: [{ path, bytes, sha256 }]
  },
  fixed?: { viewport: { width, height }, dpr, seed, input, parameters,
            timeSeconds, simulationStep },
  observation?: { /* 该维的原始观测 */ }
}
```

所有 expectedCaseIds 非空且唯一；每个 id 恰有一个记录，未运行也要明确占位。
PASS/FAIL 都必须有真实 command/cwd/有序时间/integer exitCode 与 raw output 身份。
PASS 必须 exitCode=0；未测不能靠文件存在、self `pass=true`、空 scope 或 omitted row 补偿。
总 measured/skipped/failed 由 cases 重算；有 FAIL 时摘要不能伪装 NOT_RUN/PASS。
只有六维全部 PASS 时 top `status=PASS, completed=true, subset=false`。

| Gate | PASS 最低原始证据 |
| --- | --- |
| Build | 固定 `typescript/bundle/shader` 三项；expectedUnits>0，compiledUnits 等于 expectedUnits，errors 空；独立 build oracle 读取原始编译日志/原生 GPU 编译观测，数量自报不够；shader 是真实浏览器编译，NODE 编译器存在不算 GPU 通过 |
| Runtime | 固定 `create/update/resize/pause/resume/destroy/recreate` 七项；原始 before/after、pageErrors；独立 runtime oracle 按真实实现重算效果行为 |
| Visual | 冻结 viewport/DPR/seed/input/全部 parameters/time/step；algorithm `{oracleId,method,raw}` 与 screenshot 文件身份分开；独立 visual oracle 读取/解码 PNG 并核算法语义，而非仅截图相似 |
| Boundary | `{parameter,boundary,input,actual,errorCode?}`；每参数 default+invalid，有 min/max 时还要对应 min/near-min/max/near-max；invalid 必须实际 errorCode；独立 oracle 复算输入与实现拒绝/输出 |
| Resource | 至少 100 条连续 index 的 create/destroy；每条 before/created/after 全含 texture/buffer/material/listener/raf/gpuResource 非负安全整数计数；created≥before、after=before、各轮 baseline 不增长；非空 allocations 记录 id/kind/unit/baseline/allocated/released，allocated>baseline 且 released=baseline；独立 resource oracle 核原始原生跟踪、refs配对和解绑，100组伪造全零不够 |
| Performance | 至少覆盖 720p/1080p/mobile-dpr 三 profile（额外质量档位由 expectedScope 冻结）；720p=1280×720、1080p=1920×1080、mobile DPR>1 并标 device；分离 raw CPU update/encoding/submission/frame ms 数组（每帧一值）、实际窗口/设备/方法、draw/pass/texture/buffer count、VRAM estimate 公式；独立 performance oracle 复算统计与 Pilot 预算 |

GPU timestamp 必须显式 `{status:'measured',milliseconds,extension,disjoint:false}`
或 `{status:'unavailable',reason}`；不接受模糊 `gpuTime`。VRAM 必须
`{bytes,formula,method:'estimate'}`，不能标物理测量。物理 GPU memory 本最低合同
明确 unavailable+reason；引擎计数不冒充实际 VRAM。计数来源仍需真实 runner 和日志证明。

如果使用 SSIM/pixel/perceptual threshold，必须包含 Pilot 文件身份；本工具不预设
任何视觉相似阈值。算法 oracle 不能用同一待测 shader 自报 PASS 代替独立参考或数值推导。

Engine identity 固定 source/sdk/runner 非空文件组与 reference repo/40位 commit/
license/files。`effect.contractSha256` 是元数据 canonical SHA。每个 SHA 必须是
64 位且文件 bytes>0。校验 PASS 必须通过 `verifyFiles:true` 重读磁盘字节，并从
调用侧提供独立冻结的 `expectedIdentity`；不能拿 report 自己的身份作“预期”。
Visual/Boundary/Resource/Performance 的 effect-specific cases 必须与调用侧
`expectedScope` 完全一致，防止删难例后缩 scope。

## 独立 oracle 接线

```js
const { validateEngineReport } = require('./tools/verify/shaders-effect-contract.cjs');
const checked = validateEngineReport(report, {
  definition,                  // 实际 example-local 参数事实源
  expectedIdentity,            // 采集前冻结，非报告自拷贝
  expectedScope,               // 采集前冻结 effect-specific case id 集合
  verifyFiles: true,
  root: repositoryRoot,
  oracles: { build, runtime, visual, boundary, resource, performance }
});
```

oracle 是由冻结 runner 注册的纯函数，输入为原始 case，必须返回
`{errors:[],measurements:<正安全整数>}`。裸 boolean 或 `{pass:true}` 拒绝。
工具未内置 E01–E09 算法/pixel oracle；缺 oracle 就返回 `ORACLE_NOT_CONFIGURED`，
不能 PASS。**函数注册本身也不证明它正确**：效果实现时必须独立审查 oracle、
用原始报告篡改和反例校验它，固定 runner SHA。工具不能从伪造的 JSON 推断
“真实浏览器实际执行过”；真实性仍依赖真实采集命令、不可变原始输出和审查。

冻结 `seed` 允许任何有限连续浮点数（包括负偏移）；上游 noise seed 可能是连续域偏移，
不能统一当作 integer。具体效果仍由其自身 descriptor 限制范围/类型。

## Agent Gate：公开输入与独立成功率

报告 `schemaVersion='shaders-agent-evidence/1'`，禁止包含 engine gates 或 reference
身份。source 为 Agent 自己产出的实现，SDK/runner 为已知输入，不导入 Engine 私有参考。
访问日志仅允许 `task/public-doc/example/recipe/declaration/public-tool`，记录
timestamp/path/bytes/SHA；runner 需要隔离文件/上下文、审计访问，而非 Agent 自声明
“未看答案”。`agentAccess` 独立 oracle 验证实际隔离日志，`agentResult` 独立 oracle
核对真实成品行为。二者缺失都不能 Agent PASS。

Agent PASS 必须包含 execution、compileAttempts/runtimeAttempts 的实际 command/raw
身份和最终 exit0；metrics 必须保留：

- `first_run_success`：从两种首 attempt 的 exitCode 重算。
- `compile_attempts/runtime_attempts`：等于原始 attempts 长度。
- `API_errors/documentation_lookup/manual_intervention`：原始事件数组，不丢计数来源。
- `final_success`：终态真实验证，而非借用 Engine PASS。
- `elapsedSeconds/tokens`：有限实际耗时与非负安全整数 tokens。

本批未执行隔离 Agent Benchmark，也没有实际 access oracle；这里只冻结接口。

## 问题分类与诚实状态

九种分类严格为 `ENGINE_BUG/API_GAP/API_DX/DOC_GAP/EXAMPLE_GAP/AGENT_FAILURE/
REFERENCE_ERROR/INFRA_FAILURE/PERFORMANCE_GAP`，每条附原因。
INFRA_FAILURE 应标 BLOCKED，不计入 Engine 或 Agent 技术失败；缺测标 NOT_RUN，
受环境/范围限制标 LIMITED。PASS 表示本 effect 的完整冻结六维已实测，不代表
所有九效果、组合、公共 API、release 或 Stable。cataloged/documented/implemented/
engine_verified/agent_verified/stable 的升级由真实对应交付证明，不由合同文件存在升级。

## CLI 与本批验证

```bash
node tools/verify/shaders-effect-contract.cjs --selftest
node tools/verify/shaders-effect-contract.cjs --file=<contract-or-report.json> --verify-files
npx jest --runInBand test/smoke/shaders-effect-contract.test.ts
```

CLI 只读、打印结果，不写 report、不启动浏览器/安装/构建。exit0=结构/合同有效，
**不等于 effect Gate PASS**；诚实 NOT_RUN 可 exit0 且 `scopePassed=false`。
CLI 未接外部冻结 oracle/definition，故不得用 CLI 验证 PASS 来绕过实际 runner 接线。
`require` 纯导出且 `require.main` 保护；`--selftest` 为内存 synthetic contract 测试。
Jest 用系统临时目录、合成元数据与文本，未伪造浏览器正例。

本批状态：工具合同实现与聚焦测试可验证；九效果真实 Build/Runtime/Visual/Boundary/
Resource/Performance、隔离 Agent Gate 全部 **NOT_RUN**。无 screenshot/performance/
100 周期真实资源结果。示例参数仅出现在测试中，并明确 synthetic；不冒充真实效果参数。
