# Cocos Air V1.1 — Examples Gallery & API Coverage 任务计划书
## 最终完整执行版

---

# 0. 阶段定位

V1.1 不以新增 Engine Feature 为主要目标。

核心目标：

> 建立 Cocos Air 官方 Examples Gallery，使 Examples 成为开发者与 Agent 的能力发现、学习、源码参考和可验证运行入口，并建立 Public API → Example → Recipe → Benchmark 的可计算覆盖体系。

V1.1 不假设此前：

```text
V1.0.0 已完成
30+ Recipe 已 Stable
Agent Gate 已通过
```

这些状态必须通过实际 revision、Gate Report 和 metadata 核验。

当前工作区如果仍存在：

```text
BLOCKED
draft
cataloged
in-progress
```

等状态，必须按真实状态继承，不能转写成“已完成”。

---

# 1. V1.1 开工硬门禁 G0 — 基线交接

V1.1 开工首先记录当前真实基线。

必须记录：

```text
HEAD / Revision
Working Tree Status

当前 Release Version
Latest Gate Report

Runtime Package Revision
DevTools Revision

Public API Declaration Revision

Benchmark Catalog Revision
Recipe Catalog Revision

Examples Current Inventory
Dev Server Current Behavior

Capabilities Revision
License Manifest Revision
```

输出：

```text
docs/v11-baseline.md
```

---

# 2. 前置成果状态模型

所有前置成果必须标记：

```text
verified
in-progress
blocked
not-delivered
```

例如：

```text
Recipe:
  total: 30
  validated: X
  stable: Y

Benchmark:
  active: X
  engine-gate: PASS/BLOCKED
  agent-gate: PASS/BLOCKED
```

不得将：

```text
计划值
scripted solver
cataloged capability
未提交实现
```

作为正式交付事实。

---

# 3. V1.1 可并行工作的范围

即使前序 Gate 尚未完全完成，也允许先实施：

```text
Example Metadata Schema

Manifest Generator

Gallery Shell

Recursive Discovery

Routing

Source Viewer

Pilot Examples

API Inventory Tooling
```

但这些只能标记为：

```text
V1.1 Framework Work
```

不能据此宣称：

```text
V1.1 inherited all V1.0 capabilities
```

Recipe / Benchmark / DevTools / Package 的正式关联只有在对应交付冻结后才能纳入 Release Gate。

---

# 4. 长期仓库结构保持不变

继续：

```text
build/
docs/
examples/
src/
test/
tools/
```

V1.1 不新增：

```text
addons/
plugins/
framework/
packages/
```

作为新的 Runtime 产品层。

Gallery 与 Example Tooling 只能进入：

```text
examples/
tools/examples/
build/examples/
```

不得进入：

```text
cocosair.module.js
```

---

# 5. Examples 的四个职责

Examples 同时承担：

```text
Learn
Discover
Reference
Validate
```

但职责必须分离。

### Learn

帮助开发者理解 API。

### Discover

展示 Cocos Air 当前真实能力。

### Reference

作为 Human / Agent 可阅读的公开代码范例。

### Validate

证明 Example 在当前 revision 下真实可运行。

Examples 不是：

```text
Benchmark Private Reference Answer
```

---

# 6. 借鉴对象

## Three.js

学习：

```text
Gallery UI
Category
Search
Thumbnail
Live Preview
View Source
Deep Link
大量单能力 Example
```

不学习：

```text
Addons Architecture
```

## PixiJS

学习：

```text
Manifest Driven
Category Metadata
集中 Asset 管理
```

## Galacean

学习：

```text
Pure TypeScript
Feature-focused
One Feature / One Example
```

---

# 7. V1.1 实施顺序原则

禁止：

```text
先建 100+ Example
再补 Gallery / Validation / Routing
```

必须：

```text
G0 Baseline
 ↓
Public API Inventory
 ↓
Coverage Contract
 ↓
Example Metadata
 ↓
Manifest
 ↓
Recursive Discovery
 ↓
Routing / URL Compatibility
 ↓
Gallery Artifact
 ↓
Stable Validation Contract
 ↓
Pilot 12
 ↓
G1
 ↓
Wave 1
 ↓
Wave 2
 ↓
Wave 3
```

---

# 8. Gallery 总体架构

目标：

```text
                   Example Metadata
                         │
                         ▼
                 Manifest Generator
                         │
                         ▼
                   files.json
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
 Dev Server           Gallery          Tooling
      │                  │                  │
 --example         Search/Viewer      Screenshot
      │                  │             Regression
      └──────────────────┼──────────────────┘
                         │
                      Example
```

关键原则：

> Gallery、Dev Server、CLI、Screenshot、Browser Regression 必须共用同一个 Manifest。

禁止建立多个独立 Example 枚举器。

---

# 9. Gallery UI

整体风格参考 three.js examples。

目标布局：

```text
┌────────────────────────────────────────────┐
│ Cocos Air Examples                         │
├─────────────┬──────────────────────────────┤
│ Search      │                              │
│             │                              │
│ Basics      │                              │
│ Scene       │         Live Viewer          │
│ Camera      │                              │
│ Lighting    │          iframe              │
│ Mesh        │                              │
│ Material    │                              │
│ glTF        │                              │
│ Animation   │                              │
│ Interaction │                              │
│ Runtime     │                              │
│ DevTools    │                              │
│ Showcase    │                              │
├─────────────┴──────────────────────────────┤
│ Source | Docs | API | Recipe | Benchmark  │
└────────────────────────────────────────────┘
```

---

# 10. Gallery 必须能力

必须支持：

```text
Category Navigation

Keyword Search

Thumbnail View

Compact List View

Live iframe Preview

View Source

Fullscreen

URL Hash Deep Link

Browser Back / Forward

Previous / Next

Mobile Responsive
```

Cocos Air 增加：

```text
API Tags
Capability Tags
glTF Extension Tags
Recipe References
Benchmark References
Capability Status
Device Requirement
Decoder Requirement
```

---

# 11. Example 源码结构

推荐：

```text
examples/<category>/<example>/

├── index.html
├── main.ts
├── example.json
├── README.md
└── assets/          # only example-specific assets
```

公共资源：

```text
examples/assets/
```

公共 Example 代码：

```text
examples/shared/
```

旧 Example 不强制一次性重构。

---

# 12. Example ID

每个 Example 必须有：

```text
id
```

全局唯一。

例如：

```text
gltf-basic
material-clearcoat
camera-frame-object
```

发布后 ID：

```text
不得重新赋予不同语义
```

允许：

```text
deprecated
supersededBy
```

---

# 13. Example Metadata

`example.json` 为单个 Example 的 Source of Truth。

示例：

```json
{
  "id": "gltf-basic",
  "title": "glTF Basic",
  "category": "gltf",
  "status": "stable",

  "apiClaims": [
    "GLTFLoader.loadAsync",
    "GLTFAsset.instantiate"
  ],

  "capabilities": [
    "gltf"
  ],

  "benchmarkRefs": [],
  "recipeRefs": [],

  "requiresDevTools": false,

  "ready": {
    "validator": "model-visible"
  },

  "validation": {
    "validators": [
      "asset-loaded",
      "visible-frame"
    ]
  }
}
```

---

# 14. Public API Inventory

API Coverage 必须先冻结 Public API Inventory。

来源：

```text
Public exports
+
正式 .d.ts
```

自动分析生成：

```text
docs/example-api-inventory.json
```

---

# 15. API Coverage Unit

Coverage 不能只按类名统计。

最小单位包括：

```text
Exported Class

Exported Function

Public Constructor

Public Method

Public Static Method

Important Public Property

Important Event / Callback

Stable Capability Contract

Stable Error Contract
```

---

# 16. API Coverage 示例

例如：

```text
GLTFLoader
```

应拆成类似：

```text
GLTFLoader.constructor

GLTFLoader.loadAsync

GLTFLoader.parseAsync

GLTFLoader.register

GLTFLoader.unregister

GLTFLoader.getExtensionSupport

GLTFLoader.setDRACODecoder

GLTFLoader.setMeshoptDecoder

GLTFLoader.setKTX2Transcoder
```

实际清单以冻结 `.d.ts` 为准。

---

# 17. API 分级

Public API Inventory 使用：

```text
core
important
advanced
supporting
internal
```

### core

入门及高频核心能力。

### important

主要 Runtime 能力。

### advanced

高级材质、扩展、生命周期、decoder 等。

### supporting

低频、可选子系统、后端/实现层和其他辅助 API。Supporting API 仍属于公开库存和运行时导出，可以由稳定示例覆盖；除非被明确提升到发布覆盖范围，否则不进入 Core / Important / Advanced 门禁分母。

### internal

不进入 Gallery Coverage Gate。

### V1.1 API 分级范围冻结（2026-09-28）

V1.1 的 tier 必须由声明的产品/API 范围决定，不能把“未被其他正则匹配”自动解释成 Advanced。分级规则如下：

- Core、Important 按当前已冻结的公开 API 分级策略执行。
- Advanced 只包含明确纳入本次发布 API 覆盖的功能面：DragonBones 资产、显示对象、工厂和动画缓存；`geometry.Ray`、`geometry.AABB` 与 `geometry.intersect`；`renderer.scene.Camera`；glTF decoder 与几何压缩入口；AIR transmission 材质与 capture 入口。
- 其余公开声明继续留在 API Inventory 中并归入 Supporting，除非未来通过 §18 的 Inventory Revision 明确提升。
- 类下公开成员继承所属类的 tier；`@internal`、私有成员和 `@deprecated` 规则优先适用。

该范围修正不得依据当前 verified 数量反向筛选 API，也不得改变本计划的 100% / 90% / 80% 覆盖阈值、Advanced documented-only 上限或 uncovered 归零条件。当前清单、逐项变更及门禁读数见 [`docs/api-coverage-wave16.md`](../docs/api-coverage-wave16.md)。

---

# 18. Inventory Revision

G0 后若 Public API Inventory 发生：

```text
新增
删除
tier 修改
coverageRequired 修改
```

必须生成：

```text
apiInventoryRevision
```

旧 Coverage Report 不得继续用于新 revision。

---

# 19. API Coverage 状态

每个 API Unit 只能是：

```text
uncovered
claimed
verified
documented-only
```

---

# 20. claimed

Example metadata 声明：

```text
apiClaims
```

只能表示：

> Example 声称使用这个 API。

不进入 Coverage Gate。

---

# 21. verified

必须同时具备：

```text
Example 实际源码位置

执行证据

对应 Validator PASS

lastVerifiedRevision
```

才算 verified。

Coverage Evidence 至少：

```text
exampleId
apiUnit
sourceFile
sourceLocation
validatorRefs
lastVerifiedRevision
```

---

# 22. documented-only

表示 API 不适合建立独立可运行 Example。

必须：

```text
reason
documentationRef
approval
apiInventoryRevision
```

典型原因：

```text
纯声明 API

只能被其它公开 API 间接触发

破坏性或无法稳定复现

独立 Example 无额外教学价值
```

`documented-only`：

```text
不是 verified
```

---

# 23. Coverage 分母

定义：

```text
CoreTotal
=
tier == core
&& coverageRequired == true

ImportantTotal
=
tier == important
&& coverageRequired == true

AdvancedTotal
=
tier == advanced
&& coverageRequired == true
```

`internal` 不进入分母。

Deprecated 且：

```text
coverageRequired == false
```

的 API 必须在 Inventory 冻结时排除，不能在计算结果时临时删除。

---

# 24. Core Coverage Gate

```text
CoreVerifiedRate
=
CoreVerified / CoreTotal
```

V1.1 Release：

```text
CoreVerifiedRate = 100%
```

Core 不允许使用 documented-only 代替。

---

# 25. Important Coverage Gate

```text
ImportantVerifiedRate
=
ImportantVerified / ImportantTotal
```

要求：

```text
ImportantVerifiedRate >= 90%
```

剩余部分必须有明确状态。

---

# 26. Advanced Coverage Gate

统一：

```text
AdvancedVerifiedRate
=
AdvancedVerified / AdvancedTotal

AdvancedDocumentedOnlyRate
=
AdvancedDocumentedOnly / AdvancedTotal

AdvancedUncovered
=
AdvancedTotal
- AdvancedVerified
- AdvancedDocumentedOnly
```

V1.1 Release：

```text
AdvancedVerifiedRate >= 80%

AdvancedDocumentedOnlyRate <= 20%

AdvancedUncovered = 0
```

关键规则：

> documented-only 不进入 AdvancedVerifiedRate 分子。

禁止使用：

```text
verified + documented-only >= 80%
```

作为 Coverage Gate。

---

# 27. Coverage Report

必须分别输出：

```text
Total

Verified
Verified Rate

Documented-only
Documented-only Rate

Claimed

Uncovered
```

不能合并成一个“总覆盖率”。

---

# 28. Task — Manifest Generator

增加：

```text
tools/examples/
```

执行：

```bash
npm run examples:index
```

扫描：

```text
examples/**/example.json
```

生成：

```text
examples/files.json
```

---

# 29. Manifest 为唯一聚合清单

必须被以下模块共享：

```text
Gallery

Dev Server

--example

Screenshot Tool

Browser Tests

Static Gallery Builder
```

不能建立第二份：

```text
example registry
directory scanner
manual files list
```

---

# 30. Manifest Generator 校验

开发模式至少检查：

```text
Duplicate ID

Invalid Category

Missing Entry

Broken API Ref

Broken Benchmark Ref

Broken Recipe Ref

Unknown Capability

Invalid Status

Asset License Missing
```

Screenshot Missing 在 Development Mode：

```text
只诊断
不阻断 Manifest
```

---

# 31. Manifest / Screenshot 生命周期

必须分阶段。

---

## Phase A — Development Manifest

执行：

```bash
npm run examples:index
```

允许：

```text
Screenshot Missing
```

生成：

```json
{
  "screenshot": {
    "state": "missing"
  }
}
```

Example 仍必须进入 Manifest。

---

## Phase B — Screenshot Generation

执行：

```bash
npm run examples:screenshot
```

Screenshot Tool 消费 Development Manifest：

```text
Manifest
 ↓
Open Example
 ↓
Wait Ready
 ↓
Functional Validation
 ↓
Interaction（if required）
 ↓
Visual Ready
 ↓
Capture
```

---

## Phase C — Release Validation

执行：

```bash
npm run examples:verify
```

Stable Example 此时必须拥有有效 Screenshot。

---

# 32. Screenshot 状态

统一：

```text
missing
stale
current
not-required
```

### missing

不存在。

### stale

存在，但：

```text
screenshot.evidenceRevision
!=
example.lastVerifiedRevision
```

或关键源码 / Asset 已变化。

### current

与当前 Example 验证 revision 一致。

### not-required

明确无需缩略图，必须给出批准理由。

---

# 33. Screenshot Evidence

生成时记录：

```text
path

generatedAt

exampleRevision

evidenceRevision

environment

viewport
```

---

# 34. Screenshot 不是 Validation

成功生成 Screenshot：

```text
不能证明 Example 正确
```

必须先：

```text
Ready PASS

Functional Validator PASS

No Unexpected Runtime Error
```

才能生成正式 Screenshot。

---

# 35. Thumbnail 与 Visual Regression 分离

Thumbnail：

```text
Gallery 展示资源
```

Visual Baseline：

```text
Regression Reference
```

两者不能自动等价。

Visual Baseline 必须独立具有：

```text
review
baselineRevision
environment
viewport
```

---

# 36. Example 状态模型

统一：

```text
draft
validated
stable
deprecated
```

---

# 37. Validated Example

必须：

```text
Build PASS

Browser Load PASS

Ready Condition PASS

Functional Validators PASS

No Unexpected Runtime Error
```

---

# 38. Stable Example

在 Validated 基础上还必须满足适用项：

```text
Interaction PASS

Visual PASS

Lifecycle PASS

Asset License PASS

API Coverage Evidence PASS

Screenshot current / approved not-required
```

---

# 39. Gallery 默认显示

正式 Gallery 默认：

```text
stable
```

Development Mode 可以显示：

```text
validated
draft
```

Deprecated 默认隐藏。

---

# 40. Recursive Discovery

当前服务器若只支持一级目录：

V1.1 必须升级：

```text
Recursive Discovery
```

但 Discovery 不允许自己扫描目录建立另一套结果。

必须消费：

```text
files.json
```

---

# 41. Example ID 与物理路径分离

例如：

```text
id = gltf-basic

path = gltf/basic
```

CLI / Gallery / Router 使用：

```text
id
```

而不是依赖物理目录字符串。

---

# 42. `--example` Contract

例如：

```bash
npm run dev -- --example gltf-basic
```

必须：

```text
通过 Manifest 根据 ID 定位
```

不能重新扫描目录。

---

# 43. URL Contract

Gallery：

```text
/examples/
```

Example：

```text
/examples/#gltf-basic
```

Search：

```text
/examples/?q=transmission
```

---

# 44. 旧 URL 兼容

已有 Example URL：

```text
必须保留
```

metadata 可以保存：

```text
legacyUrls
```

Router 自动映射。

---

# 45. Router Gate

必须验证：

```text
Gallery Click

Direct URL

Browser Refresh

Back / Forward

Hash Change

Legacy URL

Unknown ID

Nested Deployment
```

---

# 46. Nested Deployment

至少：

```text
/
```

和：

```text
/some/base/path/
```

验证：

```text
Manifest
Assets
iframe
Source
Screenshot
Decoder
Worker
WASM
```

路径正确。

---

# 47. 三类交付物

必须明确：

```text
Runtime Package

Gallery Artifact

DevTools Artifact
```

互相独立。

---

# 48. Runtime Package

继续：

```text
不包含 examples
不包含 tools
```

保持当前 Production Runtime 边界。

---

# 49. Gallery Artifact

独立生成：

```text
build/examples/
```

或等价目录。

包含：

```text
Gallery UI

Compiled Examples

Manifest

Public Source Snapshot

Screenshots

Static Assets

Required Decoder Runtime
```

---

# 50. Gallery Source Snapshot

View Source 不允许假设：

```text
用户可以访问 GitHub repo
```

Gallery Artifact 必须包含：

```text
build/examples/source/<example-id>/main.ts
```

或等价公开源码快照。

---

# 51. Source Snapshot 禁止包含

```text
Private Benchmark Reference

Private Validators

Expected Answer

Private Visual Baseline

Reference Implementation
```

---

# 52. DevTools Artifact

继续作为独立开发工具：

```text
build/devtools/
```

DevTools Example 必须：

```json
{
  "requiresDevTools": true
}
```

普通 Runtime Example 不加载 DevTools。

---

# 53. Decoder Example

需要：

```text
Draco
Meshopt
BasisU
```

的 Example metadata 声明：

```text
requiredDecoders
```

Gallery Artifact 必须正确提供：

```text
JS
WASM
Worker
MIME
Base URL
```

---

# 54. Public Example 与 Benchmark Private Reference 隔离

三层必须严格分开：

```text
Public Example
Benchmark Starting Fixture
Private Reference Implementation
```

---

# 55. Public Example

```text
开发者和 Agent 可读
```

可作为：

```text
Knowledge Profile
```

的一部分。

---

# 56. Benchmark Starting Fixture

根据 Benchmark 合同决定公开程度。

不能默认包含完整解法。

---

# 57. Private Reference

Agent 永远不可读：

```text
reference implementation
private expected output
private reference image
```

---

# 58. Example ↔ Benchmark Reference

Example metadata 可以：

```json
{
  "benchmarkRefs": ["B042"]
}
```

其含义只是：

> 两者验证同一能力。

绝不表示：

> Example 就是 Benchmark Reference Answer。

---

# 59. Knowledge Revision

公开 Example 集每次正式变化：

必须生成：

```text
examplesKnowledgeRevision
```

如果 Agent Benchmark Profile 允许读取 Examples：

新 Gallery Release 后必须：

```text
产生新的 Knowledge Profile / Agent Profile
```

旧成绩不能与新知识集直接混算。

---

# 60. Private Leakage Guard

CI 检查：

```text
examples/
build/examples/
```

不得包含：

```text
Private Reference Path

Reference Hash

Expected Answer

Private Benchmark Output

Private Visual Baseline
```

---

# 61. Example Ready Contract

每个 Example 必须定义：

```text
readyCondition
```

例如：

```text
scene-active
model-loaded
animation-playing
material-ready
expected-error-emitted
```

Ready 不是统一：

```text
DOMContentLoaded
requestAnimationFrame
```

---

# 62. Functional Validation

不同 Example 必须验证对应真实目标。

例如 Animation：

```text
Animation Component exists

Expected Clip is playing

Pose changes across frames
```

Texture：

```text
Texture loaded

Material reference correct

Expected visual feature visible
```

---

# 63. Interaction Validation

带交互 Example 必须：

```text
Perform Interaction
 ↓
Observe State Change
 ↓
Validator PASS
```

不能只打开页面截图。

---

# 64. Capability / Error Example

例如：

```text
decoder missing
device unsupported
fallback
```

Example 的正确结果可能是：

```text
Expected Error
Expected Fallback
```

而不是正常模型画面。

这同样可以：

```text
Stable PASS
```

只要符合 Capability Contract。

---

# 65. Pilot Gate G1

正式扩量前，先实现：

```text
12 Representative Examples
```

覆盖：

```text
basic
scene
camera
lighting
mesh
material
gltf
gltf-extension
animation
interaction
runtime
devtools
```

---

# 66. Pilot 12 必须验证

```text
Metadata

Manifest

Recursive Discovery

Gallery Rendering

Search

Direct Link

Refresh

Legacy URL

--example

Nested Deployment

View Source

Runtime Artifact Boundary

DevTools Artifact Boundary

Ready Contract

Functional Validator

Visual Validator

API Coverage Evidence

Knowledge Isolation

Screenshot Lifecycle

Asset License
```

全部通过：

```text
G1 PASS
```

才允许规模扩充。

---

# 67. Wave 1 — Foundation

目标：

```text
Stable Examples >= 40
```

重点：

```text
Getting Started

Scene / Transform

Camera

Lighting

Mesh

Basic Material

Basic Texture
```

退出标准：

```text
Core API Verified Coverage >= 80%
```

---

# 68. Wave 2 — Core Differentiation

增加：

```text
glTF Core

glTF Extensions

Animation

Runtime Lifecycle

Advanced Material
```

目标：

```text
Stable Examples >= 90
```

退出：

```text
Core API Verified Coverage = 100%

Important API Verified Coverage >= 80%
```

---

# 69. Wave 3 — V1.1 Release

增加：

```text
Interaction

DevTools

Showcase

Remaining API Coverage
```

V1.1 Release 数量门槛：

```text
Stable Examples >= 120
```

唯一正式计数：

```text
status == stable
```

---

# 70. Stretch Goal

原 130~136 个示例规划保留为：

```text
Stretch Goal
```

目标：

```text
130–136 Stable Examples
```

不是 V1.1.0 Release blocker。

---

# 71. Example 去重

一个 Example 可以有多个 Tag：

```text
extension
compression
decoder
material
```

但 Stable Count：

```text
只计一次
```

例如：

```text
gltf-draco
```

不能同时作为：

```text
Draco Extension Example
Compression Example
```

重复计数。

---

# 72. Example Catalog — Getting Started

候选：

```text
basic-hello-world
basic-cube
basic-component
basic-scene
basic-animation-loop
basic-resize
```

---

# 73. Scene / Transform

```text
scene-hierarchy
scene-multiple-roots
transform-position
transform-rotation
transform-scale
transform-local-world
transform-parent-child
transform-look-at
transform-dynamic-parent
transform-create-destroy
```

---

# 74. Camera

```text
camera-perspective
camera-orthographic
camera-look-at
camera-frame-object
camera-near-far
camera-resize
camera-switch
camera-transition
```

---

# 75. Lighting

```text
light-directional
light-point
light-spot
light-color
light-intensity
light-range
light-multiple
light-gltf-punctual
```

---

# 76. Mesh / Geometry

候选：

```text
mesh-primitive-box
mesh-primitive-sphere
mesh-primitive-plane
mesh-custom
mesh-indexed
mesh-multiple-materials
mesh-transform
mesh-dynamic
mesh-instance
mesh-gpu-instancing
```

只实施当前 Public API 已正式支持的路径。

---

# 77. Material / Texture

```text
material-basic
material-unlit
material-pbr
material-runtime-property
material-multiple

texture-basic
texture-uv
texture-transform
texture-color-space
texture-sampler

material-clearcoat
material-anisotropy
material-iridescence
material-transmission
material-volume-dispersion
```

---

# 78. glTF Core

```text
gltf-basic
gltf-glb
gltf-animation
gltf-skinning
gltf-morph
gltf-multiple-scenes
gltf-multiple-instances
gltf-progress
gltf-abort
gltf-dispose
gltf-error-handling
gltf-extension-support
```

---

# 79. glTF Extensions

当前正式支持合同中的每项目标扩展至少一个 Example。

例如：

```text
gltf-draco
gltf-meshopt-khr
gltf-meshopt-ext
gltf-quantization
gltf-lights-punctual
gltf-gpu-instancing
gltf-basisu
gltf-webp
gltf-avif
gltf-texture-transform
gltf-unlit
gltf-emissive-strength
gltf-ior
gltf-specular
gltf-clearcoat
gltf-anisotropy
gltf-iridescence
gltf-bump
gltf-transmission
gltf-volume
gltf-dispersion
```

必须以当前 `getExtensionSupport()` / capability contract 实际结果为准。

---

# 80. Animation / Skeleton

```text
animation-basic
animation-play-pause
animation-loop
animation-switch
animation-multiple-clips
animation-multiple-instances
animation-skinning
animation-skeleton
animation-morph
animation-interaction
```

---

# 81. Input / Interaction

```text
input-pointer
input-mouse
input-touch
input-keyboard

interaction-click
interaction-selection
interaction-drag
interaction-camera
interaction-animation
interaction-material
```

只覆盖真实已支持 Input API。

---

# 82. Runtime / Lifecycle

```text
runtime-create-destroy
runtime-asset-load
runtime-asset-release
runtime-multiple-instance
runtime-abort
runtime-error
runtime-resize
runtime-device-capability
```

---

# 83. DevTools / Agent

明确：

```text
requiresDevTools = true
```

例如：

```text
devtools-inspect-scene
devtools-inspect-node
devtools-inspect-asset
devtools-create-node
devtools-set-transform
devtools-capture-frame
devtools-runtime-errors
devtools-agent-session
```

---

# 84. Showcase

只使用当前 verified capabilities。

候选：

```text
showcase-character
showcase-product-viewer
showcase-material-viewer
showcase-camera-tour
showcase-interactive-model
showcase-glass-product
showcase-iridescent-product
showcase-interactive-wallpaper
showcase-3d-hero
showcase-animated-logo
```

若 Recipe 尚为 draft：

不得声称：

```text
stableRecipeRef
```

---

# 85. API Coverage Matrix

自动生成：

```text
docs/example-api-coverage.json
```

内容：

```text
API Unit
Tier
Claimed Examples
Verified Examples
Coverage State
Evidence
```

---

# 86. API Coverage Release Gate

V1.1：

```text
CoreVerifiedRate = 100%

ImportantVerifiedRate >= 90%

AdvancedVerifiedRate >= 80%

AdvancedDocumentedOnlyRate <= 20%

AdvancedUncovered = 0
```

---

# 87. Example / Recipe / Benchmark 关系

固定：

```text
Example
=
公开教学与 Reference

Recipe
=
完整应用组合模式

Benchmark
=
独立评测
```

三者不能互相替代。

---

# 88. Screenshot Tool

提供：

```bash
npm run examples:screenshot
```

流程：

```text
Development Manifest
 ↓
Open Example
 ↓
Ready
 ↓
Functional Validation
 ↓
Interaction if required
 ↓
Capture
 ↓
Evidence
```

---

# 89. Screenshot 输出

```text
examples/screenshots/<example-id>.jpg
```

或者最终 Gallery Artifact 对应目录。

---

# 90. Release Screenshot Gate

Stable Example：

必须：

```text
Screenshot exists

Screenshot state == current
```

或者：

```text
not-required + approved reason
```

并要求：

```text
screenshot.evidenceRevision
==
example.lastVerifiedRevision
```

---

# 91. Example Asset License

每个外部 Asset：

```text
Model
Texture
Image
HDR
Audio
WASM
```

必须记录：

```text
origin
revision
license
hash
```

---

# 92. License 数据源

优先接入当前已有：

```text
license manifest
third-party manifest
```

避免建立第三套独立 License 数据源。

---

# 93. Gallery Search

必须支持：

```text
ID
Title
API Unit
Capability
glTF Extension
Tag
Recipe
Benchmark
```

例如搜索：

```text
GLTFLoader.loadAsync
```

应返回真正有 verified coverage 的 Example。

---

# 94. Source / Docs / API / Recipe / Benchmark

Gallery Viewer 至少提供：

```text
Source

Docs

API

Recipe

Benchmark

Fullscreen
```

对于不存在 Recipe / Benchmark 的 Example：

对应按钮隐藏或显示 unavailable。

---

# 95. Gallery Artifact 测试

必须验证：

```text
无源码仓库时仍能运行

View Source 有效

Decoder 有效

Static Assets 有效

Nested Base Path 有效

DevTools Example 显式加载工具

普通 Example 无 DevTools 依赖
```

---

# 96. Stable Example Gate

所有 Stable Example：

```text
Build PASS

Browser Load PASS

Ready PASS

Functional PASS

Unexpected Runtime Error = 0

API Coverage Evidence PASS

License PASS

Screenshot PASS
```

适用情况下：

```text
Interaction PASS

Visual PASS

Lifecycle PASS

Expected Error / Fallback PASS
```

---

# 97. V1.1 测试范围

必须新增：

```text
Manifest Schema Test

Duplicate ID

Broken Ref

API Inventory / Coverage

Recursive Discovery

--example

Legacy URL

Direct Link

Refresh

Nested Deployment

Gallery Static Build

View Source

Runtime-only Example

DevTools Example

Decoder Example

Screenshot Lifecycle

Stable Validation

Knowledge Isolation

Private Reference Leakage

Asset License
```

---

# 98. V1.1 Definition of Done

必须同时满足：

```text
G0 基线交接完成

Public API Inventory 完成

API Coverage Unit 冻结

Metadata Schema 完成

Manifest Generator 完成

Development / Release Manifest 模式完成

Recursive Discovery 完成

Gallery / DevServer / CLI / Screenshot 共用 Manifest

Legacy URL 兼容

Direct Link / Refresh / Back / Forward PASS

Nested Deployment PASS

Runtime Package / Gallery Artifact / DevTools Artifact 分离

View Source 不依赖源码仓库

Private Benchmark Reference 不泄漏

Knowledge Revision 合同完成

Stable Example Validation 合同完成

Screenshot 生命周期无循环依赖

Pilot 12 G1 PASS

Wave 1 >= 40 Stable

Wave 2 >= 90 Stable

V1.1 Release >= 120 Stable

Core Verified Coverage = 100%

Important Verified Coverage >= 90%

Advanced Verified Coverage >= 80%

Advanced Documented-only <= 20%

Advanced Uncovered = 0

Stable Example Screenshot 全部 current / approved not-required

Stable Example Asset License 100% 可追踪

Benchmark / Recipe / API 引用无悬空

Gallery Artifact 独立运行 PASS

所有旧 Example URL 无破坏性回归
```

---

# 99. Stretch Goal

```text
130–136 Stable Examples
```

作为：

```text
V1.1.x
```

扩展目标。

不是 V1.1.0 Release Blocker。

---

# 100. V1.1 最终执行顺序

严格：

```text
T0 G0 Baseline
 ↓
T1 Public API Inventory
 ↓
T2 Coverage Contract
 ↓
T3 Metadata Schema
 ↓
T4 Manifest Generator
 ↓
T5 Recursive Discovery
 ↓
T6 Routing / Legacy Compatibility
 ↓
T7 Gallery Artifact
 ↓
T8 Public / Private Knowledge Isolation
 ↓
T9 Stable Validation Contract
 ↓
T10 Screenshot Lifecycle
 ↓
T11 Pilot 12
 ↓
G1
 ↓
Wave 1 — 40 Stable
 ↓
Coverage Review
 ↓
Wave 2 — 90 Stable
 ↓
Coverage Review
 ↓
Wave 3 — 120 Stable
 ↓
License / Consumer / URL Full Regression
 ↓
V1.1 RC
```

---

# 101. G1 Pilot 的真正退出条件

Pilot 12 不是看：

```text
12 个页面能打开
```

而是证明整套 Example Infrastructure 成立：

```text
单一 Manifest

递归发现

Routing

Legacy URL

Gallery

View Source

Runtime / DevTools Boundary

Stable Validation

Coverage Evidence

Screenshot Lifecycle

Knowledge Isolation

Nested Deployment

Asset License
```

只要任一基础合同不成立：

```text
禁止扩充 40 / 90 / 120
```

---

# 102. V1.1 最终判断标准

V1.1 不以：

```text
Examples 目录很多
```

为成功。

必须真正回答：

```text
开发者能不能找到能力？

能不能理解 API？

Example 能不能真实运行？

API Coverage 能不能计算？

Coverage 是真实 verified 还是手填声明？

npm / Static Gallery 能不能独立消费？

Source 是否能查看？

DevTools 是否保持可选？

Agent 是否获得明确的公开知识 revision？

Benchmark 私有答案是否仍安全？

设备不支持时是否正确展示 capability / fallback？

Screenshot 是否来自当前 verified revision？

Asset License 是否可追踪？
```

---

# 103. 最终目标

Cocos Air V1.1 建立：

```text
                Cocos Air Examples

                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Learn         Discover       Validate
        │              │              │
        └──────────────┼──────────────┘
                       │
                 Human + Agent
```

并形成：

```text
Public API
    ↓
Verified Example
    ↓
Recipe
    ↓
Benchmark
```

的长期能力知识网络。

这才是 V1.1 正式完成的定义。
