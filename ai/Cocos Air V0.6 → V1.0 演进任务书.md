# Cocos Air V0.6 → V1.0 演进任务书
## 最终执行版

---

# 0. 文档定位

本任务书从 V0.6 开始。

直接前置：

```text
V0.5
Full glTF Extension Coverage
        ↓ G5 + 正式移交

V0.5.1
Developer Ecosystem
+
Agent Ready Runtime
        ↓ 正式验收 + 移交

V0.6
Agent Creation Workflow
        ↓
V0.7
Data-driven Interaction Patterns
        ↓
V0.8
Production Hardening
        ↓
V0.9
Release Candidate
        ↓
V1.0.0
Stable Release
```

本文不假设 V0.5 / V0.5.1 已完成。

任何“继承能力”均表示：

> V0.6 开工前必须通过正式 revision、Gate 和交付记录确认存在。

---

# 1. V0.6 开工硬门禁 G0

必须取得 V0.5 最终交付：

```text
Final Revision
G5 Report

GLTFLoader
GLTFAsset
GLTFInstance

Extension Registry
GLTFParserContext
getExtensionSupport()

Stable Error Codes

Draco Decoder
Meshopt Decoder
Basis/KTX2 Decoder

Decoder Version
Source
SHA-256
License

capabilities.json

Package / Build / Dev Tooling

npm pack / offline decoder evidence

Performance Baseline

Lifecycle Baseline

glTF Documentation
```

必须取得 V0.5.1 最终交付：

```text
Final Revision
Final Gate / DoD Report

Package Consumer Evidence

Final Example Index

Inspection Contract

Agent Development Session Contract

Stable Runtime ID Contract

Frame Capture Contract

Runtime Error Contract

Debug Tool Artifact

Runtime Baseline

Documentation Index
```

若任一硬前置缺失：

```text
V0.6 = BLOCKED
```

不得缩小 Benchmark 范围绕过。

---

# 2. 长期工程约束

仓库一级结构保持：

```text
build/
docs/
examples/
src/
test/
tools/
```

不引入新的顶层产品层：

```text
packages/
addons/
plugins/
framework/
```

Cocos API 继续作为 Runtime 主 API：

```text
Scene
Node
Component
Camera
MeshRenderer
SkinnedMeshRenderer
Material
Animation
Skeleton
```

禁止重新建立：

```text
AirScene
AirNode
AirModel
```

TypeScript 继续是应用持久化事实来源。

Runtime Session 只允许作为：

```text
观察
诊断
临时实验
自动化验证
```

不能代替最终源码修改。

---

# 3. Benchmark 总体模型

所有 Benchmark 必须声明：

```text
benchmarkType
```

允许：

```text
runtime-control
source-create
source-repair
```

---

# 4. Runtime Control Benchmark

用于验证：

```text
inspectScene
inspectNode
inspectAsset

createNode
addComponent
setTransform

captureFrame

runtime error collection
```

特点：

```text
允许只修改当前 Runtime

页面刷新后状态消失是正常的
```

它验证的是：

> V0.5.1 Agent Development Session 是否正确。

不用于评价：

> Agent 是否成功生成持久化应用。

---

# 5. Source Create / Repair Benchmark

用于真正的 Agent Coding Benchmark。

标准流程：

```text
Immutable Starting Workspace
        ↓
Agent 修改 TypeScript
        ↓
保存源码
        ↓
Build / Typecheck
        ↓
销毁旧 Browser Context
        ↓
启动 Fresh Browser Context
        ↓
运行新源码
        ↓
Inspection
        ↓
Deterministic Validation
        ↓
Frame Capture
```

最终 PASS 必须来自：

```text
Fresh Source
+
Fresh Build
+
Fresh Runtime
```

Agent Session 临时修改不能作为最终验收状态。

---

# 6. Engine Gate 与 Agent Gate 分离

每个适合 Agent 创建/修复的 Benchmark 同时存在两条 Track：

```text
Reference Track
Agent Track
```

两者共享：

```text
Starting Fixture
Validators
Visual Target
Capability Requirements
Browser Requirements
```

但使用不同实现代码。

---

# 7. Reference Track — Engine Gate

必须使用：

```text
Frozen Reference Implementation
```

或者：

```text
Frozen Deterministic Operation Script
```

流程：

```text
Benchmark Definition
        ↓
Reference Implementation
        ↓
Fresh Build
        ↓
Fresh Runtime
        ↓
Validators
        ↓
Engine Result
```

Agent 生成代码绝不能参与 Engine Gate。

---

# 8. Reference Implementation

每个 Type B Benchmark 必须拥有：

```text
referenceImplementation
```

或：

```text
referenceOperations
```

并记录：

```text
revision
hash
```

Reference 内容：

```text
Agent 不可读
Agent 不可修改
```

---

# 9. Engine Result

允许：

```text
PASS
FAIL
EXPECTED_UNSUPPORTED
EXPECTED_FALLBACK
SKIP
NOT_EVALUATED
```

### PASS

支持环境下所有 deterministic validator 通过。

### FAIL

环境、Reference、Harness、Browser、Validator 均有效，但：

```text
Runtime Error
Validator FAIL
Visual FAIL
Lifecycle FAIL
Expected State FAIL
```

此时：

```text
failureDomain = ENGINE
agentResult = NOT_EVALUATED
```

不得归类为基础设施失败。

### EXPECTED_UNSUPPORTED

仅当前设备确实缺少能力时允许。

必须验证：

```text
Capability Status
+
Stable Error Code
```

### EXPECTED_FALLBACK

必须实际验证 fallback 路径及输出正确。

### SKIP

必须：

```text
reason
blocking
```

无原因 SKIP 非法。

---

# 10. Infrastructure Failure

只有无法可信评价 Engine 时，才能标记：

```text
INFRA_FAILURE
```

例如：

```text
Browser 无法启动

Harness 崩溃

CI Host 故障

Dev Server 无法启动

Reference 文件缺失或损坏

Fixture Hash 不匹配

Validator 文件损坏

Build Tool 自身异常

端口 / 权限 / 磁盘环境故障
```

结果：

```text
trialResult = INFRA_FAILURE
engineResult = NOT_EVALUATED
agentResult = NOT_EVALUATED
failureDomain = INFRASTRUCTURE
```

修复基础设施后必须重跑。

---

# 11. Reference Track 决策

```text
Reference Start
     │
     ▼
Infrastructure Valid?
 ┌───┴───┐
 No     Yes
 │       │
 ▼       ▼
INFRA   Reference Execute
FAIL        │
            ▼
        Validator
        ┌───┴───┐
       PASS     FAIL
        │        │
        ▼        ▼
    Engine PASS Engine FAIL
        │
        ▼
    Agent Track
```

只有：

```text
PASS
EXPECTED_FALLBACK
```

或者 Benchmark 明确定义的可评测能力路径，才允许进入 Agent Track。

---

# 12. Agent Track

流程：

```text
Benchmark Definition
        ↓
Agent Driver
        ↓
Generated Source
        ↓
Fresh Build
        ↓
Fresh Runtime
        ↓
Same Validators
        ↓
Agent Result
```

Agent 写错代码：

```text
属于 Agent Failure
```

不能污染 Engine Gate。

---

# 13. Agent Result

允许：

```text
PASS
FAIL
BUDGET_EXHAUSTED
TIMEOUT
SKIP
NOT_EVALUATED
```

其中：

```text
Compile Failure
Runtime Failure
Visual Failure
Wrong Result
```

统一表现为：

```text
FAIL
```

并通过：

```text
failureReason
```

进一步分类。

---

# 14. Trial 顶层状态

Trial 首先判断：

```text
VALID
INFRA_FAILURE
INVALID_RUN
```

只有：

```text
VALID
```

才解释：

```text
engineResult
agentResult
```

---

# 15. Failure Domain

统一：

```text
ENGINE
AGENT
INFRASTRUCTURE
ISOLATION
DEVICE
NONE
```

任何报告都不得通过解析错误文本猜测失败归属。

---

# 16. Provider-neutral Agent Driver

新增：

```text
tools/benchmark/driver/
```

核心合同：

```ts
interface AgentDriver {
    startTask(context): Promise<AgentRun>;
}

interface AgentRun {
    submitTask(task): Promise<void>;

    nextAction(input): Promise<AgentAction>;

    provideFeedback(feedback): Promise<void>;

    finish(): Promise<AgentRunResult>;
}
```

不绑定：

```text
OpenAI
Claude
Gemini
Codex
```

---

# 17. Agent Action

至少支持：

```text
read-file

write-file

patch-file

run-command

request-runtime-inspection

request-frame-capture

request-error-report

finish
```

所有 Action 必须经过 Harness。

---

# 18. Manual Agent Driver

必须实现：

```text
ManualAgentDriver
```

支持：

```text
Benchmark 输出 Prompt
        ↓
人工交给任意 Agent
        ↓
导入 Agent 修改
        ↓
Harness Build / Validate
        ↓
产生 Feedback
        ↓
人工继续下一轮
```

因此即使没有 Provider 集成，Benchmark 系统仍可完整运行。

---

# 19. Provider Adapter 扩展口

预留：

```text
tools/benchmark/providers/
```

未来：

```text
OpenAIAdapter
ClaudeAdapter
LocalAdapter
...
```

不得要求修改 Benchmark Runner Core。

---

# 20. Type B Agent Repair Loop

```text
Task
 ↓
Agent
 ↓
Source Patch
 ↓
Harness Apply
 ↓
Build
 ↓
Fresh Runtime
 ↓
Validation
 ↓
Feedback Package
 ↓
Agent Repair
```

直到：

```text
PASS
或
Budget Exhausted
```

---

# 21. Feedback Package

必须结构化：

```text
compile:
    success
    diagnostics

runtime:
    errors

inspection:
    scene
    nodes
    assets

validation:
    validator states

visual:
    screenshot
    diff

policy:
    denied actions
```

不能只传回 Console 文本。

---

# 22. Trial Isolation

每次 Trial 使用独立：

```text
benchmark-work/run-<uuid>/
```

来源：

```text
Immutable Starting Fixture
```

每次重新创建：

```text
Fresh Files
Fresh Build State
Fresh Browser Context
Fresh Scene
Fresh Agent Session
Fresh RequestId Space
```

Cache Mode 必须声明：

```text
cold
warm
```

---

# 23. Agent Workspace 权限

Agent 只能访问：

```text
writable workspace

公开 docs

公开 examples

任务指定 fixture
```

禁止读取：

```text
reference implementation

expected result

private reference image

validators implementation

internal benchmark answer data
```

---

# 24. Protected Resources

以下必须：

```text
Read-only
或
完全不可见
```

包括：

```text
validators/
reference/
expected/
reference-images/
benchmark answers/
runner internals/
```

结束时 hash 检查只是：

```text
补充审计
```

不能代替隔离机制。

---

# 25. run-command 安全合同

`run-command` 不是任意 Shell。

默认：

```text
DENY
```

只有 Allowlist 中命令允许。

基础允许示例：

```text
npm run build

npm run typecheck

npm test <public-test>

受控 npm run dev
```

以及 Benchmark 显式声明：

```text
allowedCommands
```

---

# 26. 默认禁止命令

包括：

```text
任意 bash/cmd/powershell

git reset

git clean

git checkout

git commit

git push

任意 rm/rmdir

任意 kill

任意 curl/wget

任意网络下载

任意 shell pipeline
```

除非 Benchmark 特别授权。

---

# 27. Command 参数检查

允许命令的参数也必须：

```text
normalize
resolve
validate
```

路径只能进入：

```text
allowed roots
```

禁止通过：

```text
../
symlink
absolute path
```

逃逸。

---

# 28. Process Isolation

Harness 记录：

```text
PID
Command
Working Directory
Start Time
Timeout
Descendant Processes
```

Trial 结束必须：

```text
停止 Agent 子进程
停止 Dev Server
停止 descendant process tree
关闭 Browser Context
关闭 Agent Session
```

禁止后台进程污染下一个 Trial。

---

# 29. Network Policy

默认：

```text
offline
或
localhost-only
```

如果 Benchmark 需要网络：

```text
allowedNetworkHosts
```

必须显式配置。

Agent 不允许在线查找 Reference Answer。

---

# 30. Policy Rejection

Agent 请求越权操作：

```text
read reference/

write validator

execute forbidden command

访问禁止网络
```

如果 Harness 正确拒绝：

```text
Trial 仍然 VALID
```

返回稳定错误：

```text
POLICY_DENIED

PATH_OUT_OF_SCOPE

COMMAND_NOT_ALLOWED

NETWORK_NOT_ALLOWED

PROTECTED_RESOURCE

READ_NOT_ALLOWED

WRITE_NOT_ALLOWED
```

Agent 可继续 Repair。

---

# 31. Policy Rejection 与 Agent Result

Agent 因错误策略不断触发拒绝，最终失败：

```text
Agent FAIL
```

必须计入：

```text
eligible_trials
```

不能因为 Agent 自己尝试违规行为而把 Trial 从分母删除。

若 Benchmark 本身测试“是否正确处理拒绝”：

```text
正确拒绝
=
PASS
```

---

# 32. Isolation Failure

只有隔离真正被突破才：

```text
INVALID_RUN
```

例如：

```text
Agent 实际读取 Reference Answer

Agent 实际修改 Validator

Agent 修改 Protected Fixture

Agent 修改后恢复文件绕过 hash

Agent 成功访问禁止网络

Agent 遗留后台进程污染后续 Trial

跨 Trial 读取残留状态

Harness 错误地将保护目录挂载为 writable
```

此时：

```text
trialResult = INVALID_RUN
engineResult = NOT_EVALUATED
agentResult = NOT_EVALUATED
failureDomain = ISOLATION
```

修复 Harness 后重跑。

---

# 33. eligible_trials 唯一定义

定义：

```text
Eligible Agent Trials
=
所有实际启动 Agent Track 的 VALID Trials
-
Approved Non-blocking SKIP
```

Agent Track 只在 Reference Track 通过之后启动，因此：

```text
Engine FAIL
```

不会进入 Agent 分母。

---

# 34. 必须进入分母

包括：

```text
Compile FAIL

Runtime FAIL

Visual FAIL

Wrong Result

Agent Timeout

Repair Budget Exhausted

Agent 主动放弃

Policy Denied 后最终失败
```

---

# 35. 不进入分母

仅：

```text
INFRA_FAILURE

INVALID_RUN

Contractual Device Unsupported

Approved Non-blocking SKIP
```

必须有机器可读原因。

---

# 36. First Compile Success

只统计：

```text
source-create
source-repair
```

不统计 runtime-control。

定义：

> Agent 第一次源码提交后，无任何 Repair Feedback，即完成 Build/Typecheck。

公式：

```text
First Compile Success Rate
=
FirstSubmissionCompilePASS
/
Eligible Type-B Trials
```

---

# 37. Repair Iteration

一次 Repair：

```text
Agent 收到一次 Harness Feedback
+
再次提交源码修改
```

初次提交不算 Repair。

---

# 38. Repair 指标

必须同时报告：

```text
Median Repair Iterations — Successful Trials

Mean Repair Iterations — All Eligible Trials

Repair Budget Exhaustion Rate
```

Budget Exhausted Trial 的 Repair 数：

```text
使用实际执行次数
```

---

# 39. Repair Budget

V0.6 默认：

```text
Max Repair Iterations = 5
```

Benchmark 可以：

```text
明确降低
```

不能在 Trial 运行途中人为提高预算。

---

# 40. Reference Agent Profile

Golden 10 正式测试之前冻结：

```text
Agent Profile ID
Model
Model Version
Reasoning / Effort
System Instruction
Knowledge Profile
Allowed Tools
Context Limits
Repair Budget
Randomness / Temperature
```

Pilot 调试数据不进入正式基线。

---

# 41. Agent Profile 变更

关键配置变化必须创建新 ID：

```text
A001
A002
A003
```

不同 Profile：

```text
不得混算
```

---

# 42. Benchmark 重复次数

至少：

```text
每 Agent Profile × Benchmark
>= 3 Trials
```

RC 核心 Benchmark：

```text
>= 5 Trials
```

---

# 43. Run Manifest

每个 Trial 固定记录：

```text
Cocos Air revision

Benchmark catalog revision

Benchmark ID/version

Starting Fixture hash

Reference Implementation hash

OS

Browser/version

Viewport

WebGL backend

Agent Profile

Knowledge Profile

Allowed Tools

Allowed Commands

Network Policy

Repair Budget

Time Budget

Cache Mode

Random Seed
```

---

# 44. Golden 10 Pilot Gate G1

正式扩展到 100 项前，先完成：

```text
10 个 Golden Benchmark
```

覆盖：

```text
Scene
Camera
Asset
glTF
Animation
Material
Interaction
Compressed Model
Runtime Control
Source Repair
```

每项同时跑：

```text
Reference Track
Agent Track
```

---

# 45. Golden 10 必须验证的失败场景

人工制造：

```text
Reference Validator FAIL

Browser Startup FAIL

Agent Compile FAIL

Repair Budget Exhausted

Policy Denied

真实 Protected Resource Escape

Background Process Leakage

Expected Unsupported Device Path
```

确保正确归因：

```text
ENGINE

INFRASTRUCTURE

AGENT

AGENT

VALID POLICY EVENT

ISOLATION

ISOLATION

DEVICE
```

---

# 46. G1 退出条件

必须证明：

```text
Reference Failure 不会误归 INFRA

Agent Failure 不会误归 ENGINE

Policy Denied 不会导致 INVALID_RUN

真实 Isolation Breach 必然 INVALID_RUN

eligible_trials 唯一

Reference 不可见

Source 修改可持久

Fresh Rebuild 生效

Repair Budget 生效

结果可复现
```

G1 不通过：

```text
禁止扩充 100 Benchmark
```

---

# 47. Benchmark Framework

目录建议：

```text
tools/benchmark/

├── catalog/
├── driver/
├── providers/
├── runner/
├── validators/
├── reporters/
├── fixtures/
└── work/
```

---

# 48. Benchmark Schema

每项至少：

```text
id
version
name

benchmarkType

category
difficulty

prompt

startingFixture

referenceImplementation

writablePaths
readablePaths
protectedPaths

allowedTools
allowedCommands
allowedNetworkHosts

knowledgeProfile

validators
visualValidators

capabilityRequirements
browserRequirements

repairBudget
timeBudget

expectedStates

tags
```

---

# 49. Benchmark ID

首批：

```text
B001
...
B100
```

后续：

```text
B101+
```

发布后 ID 不复用。

允许：

```text
deprecated
supersededBy
```

---

# 50. 100 Benchmark 分类

## B001-B010

```text
Scene / Node / Transform
```

## B011-B020

```text
Camera
```

## B021-B030

```text
Lighting
```

## B031-B040

```text
Mesh / Material / Texture
```

## B041-B050

```text
glTF / Asset
```

## B051-B060

```text
glTF Extensions / Compression
```

## B061-B070

```text
Animation / Skeleton
```

## B071-B080

```text
Advanced Materials
```

## B081-B090

```text
Input / Interaction
```

## B091-B100

```text
Agent / Runtime Feedback
```

100 项必须具有：

```text
独立目标
独立验证
真实能力覆盖
```

不能通过参数变体凑数量。

---

# 51. Benchmark Runtime Gate

Reference Track：

```text
支持环境内 Deterministic Validators
=
100% PASS
```

设备不支持必须：

```text
EXPECTED_UNSUPPORTED
或
EXPECTED_FALLBACK
```

并符合能力合同。

---

# 52. V0.6 Agent Gate

冻结 Reference Agent Profile 下：

```text
Final Success Rate >= 80%

各能力域 Final Success >= 70%

First Compile Success >= 60%

Median Repair — Successful <= 3
```

另报：

```text
Budget Exhaustion Rate
```

---

# 53. V0.9 Agent RC Gate

提升：

```text
Final Success Rate >= 90%

各能力域 >= 85%

First Compile Success >= 75%

Median Repair — Successful <= 2
```

不能拿 Engine PASS 替代 Agent Gate。

---

# 54. Validation Profiles

首批 Validator：

```text
scene-ready

node-exists

node-count

transform-equals

asset-loaded

animation-playing

material-property

no-runtime-error

visible-frame

frame-diff

capability-status

resource-released
```

Benchmark 通过组合 Validator 工作。

Validator 不得复制到各 Benchmark 内。

---

# 55. Agent Knowledge Pack

继续使用：

```text
docs/agent/
```

建议：

```text
00-overview.md
01-code-first.md
02-scene-node.md
03-camera-light.md
04-assets.md
05-gltf.md
06-animation.md
07-material.md
08-interaction.md
09-inspection-validation.md
10-errors-recovery.md
11-common-patterns.md
12-benchmark-guide.md
```

不能维护第二份：

```text
Extension Support List
Error Code List
Capability Matrix
```

应引用现有事实来源。

---

# 56. Knowledge Profile

每 Trial 明确：

```text
knowledgeProfile
```

例如：

```text
K0 = README Only

K1 = README + Getting Started

K2 = Docs + Examples

K3 = Agent Knowledge Pack
```

不得隐式给予不同 Agent 不同知识。

---

# 57. Example Metadata

Example 增加机器可读描述：

```json
{
  "id": "animated-character",
  "capabilities": [
    "gltf",
    "animation",
    "camera"
  ],
  "benchmarkRefs": [
    "B061"
  ],
  "recipeRefs": [
    "R001"
  ]
}
```

形成：

```text
Example
↔ Benchmark
↔ Recipe
```

关联。

---

# 58. Recipe Catalog

V0.6 最低：

```text
Catalog Total >= 30
```

Recipe 状态：

```text
draft
validated
stable
deprecated
```

状态晋升：

```text
draft
  ↓
validated
  ↓
stable
```

---

# 59. Recipe 统计语义

明确：

```text
Validated Count
=
validated + stable
```

即：

```text
stable ⊂ validated
```

Effective Recipe：

```text
validated ∪ stable
```

以下不计有效数量：

```text
draft
deprecated
```

---

# 60. V0.6 Recipe Gate

要求：

```text
Catalog Total >= 30

Validated Count >= 30

Stable Count >= 20
```

例如：

```text
10 validated
20 stable
```

则：

```text
Validated Count = 30
Stable Count = 20
```

不需要额外凑到 50 条。

---

# 61. V0.9 Recipe Gate

必须：

```text
Effective Count >= 30
Stable Count >= 30
```

即首批至少 30 个全部达到 Stable。

---

# 62. Recipe Validation Contract

进入 Validated 必须覆盖：

```text
Scene Setup

Required Assets

Required Capabilities

Runtime State

Interaction Steps（如有）

Key Visual Target

No Blocking Runtime Error
```

不能仅：

```text
node-exists
```

就判完整 Recipe 成立。

---

# 63. Stable Recipe

额外必须：

```text
完整 Example
或
Composite Benchmark
```

并覆盖：

```text
完整场景

关键交互

关键视觉目标

资源生命周期
```

---

# 64. Recipe Coverage Manifest

每个 Recipe：

```text
benchmarkRefs
exampleRefs
validatorRefs
visualRefs
```

CI 检查悬空引用。

---

# 65. 首批 30 Recipe

## Character — R001-R005

```text
Character Showcase
Character Animation Viewer
Character Interaction
Multi Character Scene
Character Material Preview
```

## Product / Model — R006-R010

```text
Product Viewer
360 Model Viewer
Exploded Model Showcase
Material Variant Viewer
Model Comparison Viewer
```

## Camera / Presentation — R011-R015

```text
Auto Framing
Camera Tour
Cinematic Camera Transition
Orthographic Product View
Multi Camera Presentation
```

## Interaction — R016-R020

```text
Click To Animate
Click To Change Material
Drag Object
Object Selection
Interactive Hotspot
```

## Material / Visual — R021-R025

```text
Glass Product
Clearcoat Product
Transmission Object
Anisotropic Material Showcase
Iridescent Material Showcase
```

## Experience — R026-R030

```text
Interactive Wallpaper
3D Landing Hero
Animated Logo Scene
Simple Weather Scene
AI Generated Scene Prototype
```

只能使用当前已验证能力。

不得为了 Recipe 增加未经规划的 Engine Feature。

---

# 66. Recipe 后续扩展

长期：

```text
R031+
```

支持：

```text
30
→ 50
→ 100+
```

新增 Recipe 只需要：

```text
definition
docs
coverage references
```

不应修改 Recipe Core。

---

# 67. Runtime 与 DevTools 分发分离

默认 Runtime Tarball 不包含：

```text
tools/debug

Benchmark Runner

Fixtures

Tests
```

继续保持生产包干净。

---

# 68. Runtime Distribution

包含：

```text
Runtime Build

Minified Build

Types

Source Maps

Decoder Runtime

README

LICENSE

Third-party Notices
```

---

# 69. DevTools Artifact

独立产生：

```text
build/devtools/
```

或等价：

```text
DevTools Tarball / Zip
```

包含：

```text
Inspection

Agent Session

Frame Capture

Runtime Error Collection

Benchmark Runtime Adapter
```

V0.6 不要求独立 npm 发布。

---

# 70. Fresh Consumer Gate

必须验证两种 Consumer：

## Runtime Only

```text
Runtime Tarball
```

要求：

```text
普通应用工作
默认无 debug/agent 依赖
```

## Runtime + DevTools

```text
Runtime Tarball
+
Explicit DevTools Artifact
```

要求：

```text
Inspection
Agent Session
Capture
Error Collection
```

都可工作。

两者都不能访问 cocosair.js 源码仓库。

---

# 71. Distribution Version Match

记录：

```text
runtimeRevision
devtoolsRevision
contractVersion
```

不允许 Runtime 与 DevTools 合同漂移。

---

# 72. Performance 合同继承

V0.6 不降低 V0.5 / V0.5.1 已定义指标。V0.5 已要求 BoxTextured 30 次加载中位数相对基线回退不得超过 15%，且需要 50 次 load/instantiate/dispose 后资源回到基线。

---

# 73. Load Performance

固定：

```text
BoxTextured
30 runs
median
```

相对冻结基线：

```text
Regression <= 15%
```

要求同：

```text
OS
Browser
WebGL Backend
Viewport
Cache Mode
```

---

# 74. Lifecycle Gate

至少：

```text
50 cycles
```

每轮：

```text
load
instantiate
dispose
```

结束检查：

```text
Asset Cache
Blob URL
Worker
Texture
Buffer
```

回到允许基线范围。

---

# 75. Debug Overhead

同一：

```text
scene
operation
environment
```

比较：

```text
DevTools OFF
vs
DevTools ON
```

不能跨机器计算 regression。

V0.5.1 已明确要求同环境、同场景测量，并对不可获取内存项使用 `unavailable`。

---

# 76. Memory

分别记录：

```text
JS Heap

Engine Object / Ref Count

GPU-visible Information
```

不可测：

```text
unavailable
```

禁止推测数字。

---

# 77. V0.6 执行顺序

严格：

```text
G0 前置版本正式交接
        ↓
Agent Driver
        ↓
Manual Driver
        ↓
Command Sandbox
        ↓
Filesystem Isolation
        ↓
Trial Isolation
        ↓
eligible_trials / Metrics
        ↓
Reference Track
        ↓
Agent Track
        ↓
Golden 10
        ↓
G1
        ↓
Benchmark Schema / Validators
        ↓
扩展到 100+
        ↓
Recipe Framework
        ↓
先做 10 个完整 Recipe
        ↓
验证 Recipe Contract
        ↓
扩展到 30+
        ↓
Runtime / DevTools Distribution
        ↓
Performance / Lifecycle Regression
        ↓
V0.6 Final Gate
```

---

# 78. V0.6 Definition of Done

必须同时：

```text
V0.5/V0.5.1 正式交接

Provider-neutral Driver 完成

Manual Driver 完成

Restricted Command Runner 完成

Filesystem Isolation 完成

Reference Track 完成

Agent Track 完成

Fresh Source Rebuild 完成

eligible_trials 唯一实现

Golden 10 PASS

Benchmark >= 100

Engine Gate / Agent Gate 分离

Reference Agent Profile 冻结

Recipe Total >= 30

Validated Count >= 30
(validated + stable)

Stable Count >= 20

Runtime / DevTools 分发边界通过

30-run Performance PASS

50-cycle Lifecycle PASS

前置能力无回归
```

---

# 79. V0.7 — Data-driven Interaction Patterns

V0.7 不预设新的 Framework。

输入：

```text
100+ Benchmark
+
30+ Effective Recipe
```

分析：

```text
Repeated Code

Repeated Agent Error

Repeated Repair

Repeated Recipe Structure

Repeated Validation Failure
```

---

# 80. Helper 准入条件

新增 helper 至少满足：

```text
>= 3 Effective Recipes
```

或者：

```text
>= 5 Benchmarks
```

反复出现。

并必须证明至少一项：

```text
减少生成 LOC

降低 Repair Iterations

提高 Agent Success Rate
```

否则继续留在 Example Pattern。

---

# 81. V0.7 候选

可能包括：

```text
Interaction Helper

Camera Transition Helper

Timeline Helper

State Helper

Animation Coordination

Selection Helper
```

实际列表由 V0.6 数据决定。

禁止提前建设：

```text
New Input System

New Animation System

New State Framework

New Behavior Runtime
```

---

# 82. V0.7 Gate

每新增 helper：

重新运行：

```text
相关 Benchmark

相关 Recipe

Existing Regression
```

必须证明：

```text
收益 > 抽象成本
```

---

# 83. V0.8 — Production Hardening

进入：

```text
Major Feature Freeze
```

重点：

```text
Browser Compatibility

Performance

Lifecycle

Security

Invalid Assets

Dependency Cleanup

License Inventory

API Stability
```

---

# 84. Browser Matrix

至少：

```text
Chrome
Edge
Safari
Firefox
```

覆盖：

```text
WebGL2

必要 WebGL1 Capability Path

WASM

Worker

Draco

Meshopt

BasisU

WebP

AVIF

Advanced Material

Transmission / Volume / Dispersion
```

---

# 85. V0.8 Engine Gate

支持环境中的 deterministic Runtime test：

```text
必须 PASS
```

设备不支持：

```text
EXPECTED_UNSUPPORTED
或
EXPECTED_FALLBACK
```

必须验证稳定能力合同。

---

# 86. Benchmark 扩展

建议：

```text
Active Benchmark >= 150
```

增加领域：

```text
Browser Compatibility

Lifecycle

Invalid Input

Stress

Performance

Security Limits
```

Benchmark Framework 不允许因扩展而重写。

---

# 87. Hostile / Invalid Asset

覆盖：

```text
Huge Buffer

Huge Texture

Huge Hierarchy

Huge Node Count

Invalid Accessor

Invalid Index

Invalid Animation

Corrupt Compression

Decompression Bomb

Deep Nesting
```

必须有：

```text
Limit

Failure

Cleanup
```

确定行为。

---

# 88. API Stability Classification

所有公开 API 分类：

```text
Stable

Experimental

Internal
```

覆盖：

```text
createAirApp

Air Helpers

GLTFLoader

Extension API

Decoder API

DevTools Contract

Agent Session Contract
```

---

# 89. License Inventory

V0.8 提前建立：

```text
Source License Inventory

Third-party Inventory

Fixture Inventory

Example Asset Inventory

Decoder Inventory
```

不能等 V1.0.0 发布前才第一次整理。

---

# 90. V0.8 DoD

必须：

```text
Browser Matrix PASS

Lifecycle PASS

Invalid Asset PASS

Benchmark >= 150
或达到同等覆盖目标

Recipe >= 30 保持有效

Performance Baseline 稳定

License Inventory 第一版完成

API Stability Classification 完成
```

---

# 91. V0.9 — Release Candidate

进入：

```text
Feature Freeze
```

冻结：

```text
Runtime Public API

Air Helper API

GLTFLoader API

Extension Handler Contract

Decoder Contract

Stable Error Codes

Package Layout

DevTools Contract

Agent Session Contract

Benchmark Schema

Recipe Schema

Example Metadata Schema
```

---

# 92. RC Runtime Benchmark Gate

所有 Active Benchmark：

```text
必须执行
```

允许结果：

```text
PASS

EXPECTED_UNSUPPORTED

EXPECTED_FALLBACK

approved non-blocking SKIP
```

如果出现：

```text
FAIL

INVALID_RUN

blocking SKIP
```

则：

```text
RC BLOCKED
```

---

# 93. RC Agent Gate

冻结的 Reference Agent Profile：

```text
Final Success >= 90%

各能力域 >= 85%

First Compile >= 75%

Median Repair — Successful <= 2
```

单独报告：

```text
Budget Exhaustion Rate
```

---

# 94. RC Recipe Gate

必须：

```text
Effective Count >= 30

Stable Count >= 30
```

每个 Stable Recipe：

```text
完整 Scene 验证

关键 Interaction 验证

关键 Visual Target 验证

Lifecycle 验证
```

---

# 95. Fresh Consumer RC

在仓库外：

```text
Runtime Tarball
```

完成：

```text
Basic Scene

GLB

Compressed GLB

Animation

Advanced Material

Interaction
```

另一路：

```text
Runtime Tarball
+
DevTools Artifact
```

完成：

```text
Inspection

Agent Session

Capture

Error Collection
```

不得访问源码仓库。

---

# 96. G-LICENSE — V1.0.0 硬 Gate

检查范围：

```text
src/
build/
examples/
test/
tools/
fixtures/
build/gltf-decoders/
```

---

# 97. Source License Audit

检查：

```text
Cocos upstream source headers

Cocos Air source

Copied / Modified Third-party Source
```

要求：

```text
Origin 明确

License 明确

Copyright Header 不误删

修改记录符合要求
```

根目录 LICENSE 不能替代逐源判断。

---

# 98. Third-party Audit

至少检查：

```text
Draco

Meshopt

Basis Universal

Khronos Fixtures

其它 npm / WASM / Worker Dependency
```

固定：

```text
Version

Source

License

Notice

Hash
```

---

# 99. Fixture Audit

检查：

```text
test/
examples/
fixtures/
```

中的：

```text
GLB
GLTF
PNG
JPG
HDR
KTX2
Audio
Animation
其它媒体
```

每项至少记录：

```text
Source

Revision

License

Purpose
```

无法确认许可：

```text
不得进入 V1.0.0 正式发布范围
```

---

# 100. Example Asset Audit

Examples 中所有外部资源都必须有：

```text
来源

License

Revision / Hash
```

禁止把：

```text
临时从网络下载
但无授权记录
```

的资源带入正式 release。

---

# 101. Decoder Audit

`build/gltf-decoders/` 中：

```text
draco

meshopt

basis
```

逐项核对：

```text
License

Notice

Version

Hash

Source
```

必须与 V0.5 冻结记录一致。

---

# 102. Generated File Audit

检查：

```text
build/
```

是否存在：

```text
本机绝对路径

错误 banner

不必要第三方源码嵌入

重复 notice

错误 license copy

旧 build artifact
```

---

# 103. Repository Cleanup

清理候选：

```text
重复 LICENSE

失效 NOTICE

废弃 decoder license

未使用 fixture license

临时 asset authorization file

build 中冗余 notice

cache

debug dump

临时 screenshot

benchmark output

旧 tarball

旧 build artifact

一次性调试脚本
```

禁止：

```text
批量删除所有子目录 LICENSE
```

必须逐项判断保留义务。

---

# 104. License Manifest

生成：

```text
license-manifest.json
```

至少：

```text
path

origin

license

sourceRevision

requiredInRepo

requiredInPackage

status
```

---

# 105. npm Tarball Audit

执行实际：

```text
npm pack
```

检查内容。

应该包含：

```text
runtime build

types

source maps

decoder runtime

README

root LICENSE

THIRD_PARTY_LICENSES

必须随包的 decoder notice
```

默认排除：

```text
src

tools

test

benchmark

fixtures

debug output

screenshots

cache

private dev files
```

除非产品或许可证合同明确要求。

---

# 106. V0.9 DoD

必须：

```text
Engine Gate PASS

Agent Gate PASS

全部 Active Benchmark 执行

Stable Recipe >= 30

Fresh Runtime Consumer PASS

Fresh Runtime + DevTools Consumer PASS

Browser Matrix PASS

30-run Performance PASS

50-cycle Lifecycle PASS

License Audit PASS

Repository Cleanup PASS

Package Audit PASS

Documentation Freeze

无 P0 / P1
```

---

# 107. V1.0.0 Release Gates

必须全部：

```text
G-RUNTIME

G-GLTF

G-PACKAGE

G-DEVTOOLS

G-BROWSER

G-BENCHMARK-ENGINE

G-BENCHMARK-AGENT

G-RECIPE

G-LIFECYCLE

G-PERFORMANCE

G-LICENSE

G-DOCS
```

PASS。

---

# 108. V1.0.0 核心能力

## Runtime

```text
Scene
Node
Component
Camera
Lighting
Mesh
Material
Animation
Skeleton
Input
```

## Code First

```text
createAirApp

TypeScript First

No Creator Requirement
```

## glTF

```text
Runtime GLTF / GLB

Extension Registry

Draco

Meshopt

KTX2 / BasisU

Advanced PBR

Transmission

Volume

Dispersion
```

## Developer

```text
Package Consumption

Types

Source Map

Examples

Debug Tool

Recipe Catalog
```

## Agent

```text
Inspection

Agent Session

Frame Capture

Runtime Errors

Validation

100+ Benchmark

30+ Stable Recipes
```

---

# 109. V1.0.0 明确不包含

默认不做：

```text
Visual Editor

Plugin Marketplace

Addons System

Remote MCP Server

Cloud Agent Platform

Native Runtime

Scene DSL

A2Graphics IR
```

这些属于 V1.x / V2 后续判断。

---

# 110. V1.0.0 后扩展口

Benchmark：

```text
B101+
B151+
B500+
```

Recipe：

```text
R031+
R100+
```

Agent Profile：

```text
A002+
```

Knowledge Profile：

```text
K4+
```

Validator：

```text
新增独立 Validator Module
```

Provider：

```text
新增 Provider Adapter
```

这些扩展不应要求修改：

```text
Runtime Core

Benchmark Runner Core

Recipe Core
```

---

# 111. 最终版本路线

```text
V0.6
可信 Agent Creation Workflow
100+ Benchmark
30+ Recipe
        ↓
V0.7
基于数据提炼 Interaction Patterns
        ↓
V0.8
Production Hardening
150+ Benchmark
License Inventory
        ↓
V0.9
Release Candidate
Feature Freeze
30 Stable Recipe
Full License / Repo Cleanup
        ↓
V1.0.0
Stable Release
```

---

# 112. 四个永久独立 Gate

从 V0.6 开始始终分开：

```text
Engine 正不正确？

Agent 会不会使用？

Recipe 是否完整成立？

当前设备是否支持？
```

分别对应：

```text
Engine Gate

Agent Gate

Recipe Gate

Capability Gate
```

四者不得互相代替。

---

# 113. V0.6 扩充 100 Benchmark 前必须冻结的合同

必须全部完成：

```text
G0 前置版本交接

Engine / Agent 双 Track

Reference Implementation Contract

Provider-neutral Driver

Manual Driver

TypeScript Source Persistence

Fresh Rebuild

Filesystem Isolation

Command Sandbox

Policy Rejection Contract

Isolation Failure Contract

eligible_trials

Repair Budget

Reference Agent Profile

Recipe Counting Semantics

Failure Attribution

Runtime / DevTools Distribution Boundary
```

任一未完成：

```text
Benchmark Framework NOT READY
```

不得进入 100 项规模化扩充。

---

# 114. 最终产品定位

Cocos Air 1.0.0：

> A Code First Cocos Web runtime with production-grade glTF support, a measurable agent development workflow, and a validated creation recipe catalog.

核心不是：

```text
缩小版 Cocos Creator
```

也不是：

```text
Three.js 复刻
```

而是：

```text
Cocos Runtime
+
Code First
+
Production-grade glTF
+
Web Developer Experience
+
Agent Feedback Loop
+
100+ Benchmark
+
30+ Stable Recipes
```