# Cocos Air V1.1 — Examples Gallery & API Coverage

## 0. 阶段定位

Cocos Air 当前已经完成：

```text
Independent Web Runtime
+
Code First
+
Runtime glTF/GLB
+
Full glTF Extension Coverage
+
Package Consumption
+
Developer Tools
+
Agent Development Loop
+
100+ Benchmark
+
30+ Stable Recipe
+
Production Hardening
+
1.0.0 Release Discipline
```

V1.1 不再优先增加 Engine Feature。

当前最大问题是：

```text
Engine 能力很多
        ↓
Examples 数量不足
        ↓
开发者不知道有什么能力
        ↓
不知道如何组合 API
        ↓
Agent 也缺少高质量参考实现
```

因此 V1.1 的目标：

> 建立类似 three.js examples 的 Cocos Air 官方示例集锦，让 Examples 同时承担能力展示、开发教学、回归验证和 Agent Reference 四个角色。

---

# 1. V1.0.0 之后还需要重点完善的内容

按优先级建议：

```text
P0  Examples Gallery
P0  API → Example Coverage
P1  Example / Recipe / Benchmark 联动
P1  Upstream cocos4 Sync Automation
P1  Release Regression Dashboard
P2  Documentation Search / API Discoverability
P2  Real-world Showcase
P2  Long-running Compatibility Tracking
```

其中当前收益最高的是：

```text
Examples Gallery
```

---

# 2. Examples 的产品定位

不要把 examples 理解成：

```text
测试 Demo
```

应该同时承担四种职责：

```text
Developer Learning

Capability Discovery

Visual Reference

Regression Fixture
```

进一步：

```text
Human Reference
+
Agent Reference
```

因此 Example 是 Cocos Air 的一等公民。

---

# 3. 借鉴对象的边界

## Three.js 学什么

学习：

```text
Gallery UI
Category
Search
Thumbnail
Live Preview
View Source
大量单能力示例
```

Three.js 当前 gallery 使用侧边分类、搜索、缩略图卡片、iframe viewer 和源代码跳转；其 `files.json` 是完整示例目录的数据源。

不学习：

```text
Addons Architecture
```

---

## PixiJS 学什么

学习：

```text
Manifest Driven

Category Driven

Central Asset Management
```

PixiJS 的示例体系明确使用 manifest 管理示例，并把 Assets 集中管理。

---

## Galacean 学什么

学习：

```text
Feature-focused
Pure TypeScript
Small Example
```

例如：

```text
buffer mesh independent
buffer mesh instance
buffer mesh interleaved
device restore
gltf loader
screenshot
shader tutorial
```

这些示例体现的是：

> 一个 API 能力对应一个可直接运行的代码案例。



---

# 4. Examples Gallery UI

整体视觉和交互直接参考：

```text
https://threejs.org/examples/
```

目标布局：

```text
┌─────────────────────────────────────────────┐
│ Cocos Air Examples                         │
├─────────────┬───────────────────────────────┤
│ Search      │                               │
│             │                               │
│ Basics      │                               │
│ Scene       │                               │
│ Camera      │          Live Viewer          │
│ Lighting    │                               │
│ Mesh        │             iframe            │
│ Material    │                               │
│ glTF        │                               │
│ Animation   │                               │
│ Input       │                               │
│ Runtime     │                               │
│ Agent       │                               │
│ Showcase    │                               │
│             │                               │
├─────────────┴───────────────────────────────┤
│ Source | Docs | Capabilities | Benchmark    │
└─────────────────────────────────────────────┘
```

---

# 5. 核心 Gallery 功能

必须：

```text
Category Navigation

Keyword Search

Thumbnail Mode

Compact List Mode

Live iframe Preview

View Source

Open Fullscreen

URL Hash Direct Link

Previous / Next

Mobile Responsive
```

新增 Cocos Air 特有能力：

```text
API Tags

Capability Tags

glTF Extension Tags

Benchmark References

Recipe References

Browser Capability Status
```

---

# 6. 不直接复制 Three.js 文件结构

UI 学 Three.js。

源码结构继续保持 Cocos Air 当前规范。

建议：

```text
examples/
├── index.html
├── gallery/
│
├── screenshots/
│
├── assets/
│
├── shared/
│
├── basic/
├── scene/
├── camera/
├── lighting/
├── mesh/
├── material/
├── gltf/
├── animation/
├── interaction/
├── runtime/
├── agent/
└── showcase/
```

现有 Example URL：

```text
不得破坏
```

旧目录可以通过 metadata 纳入新 Gallery。

---

# 7. Example Source Layout

每一个新 Example：

```text
examples/<category>/<example>/

├── index.html
├── main.ts
├── example.json
├── README.md
└── assets/       # 只有专属资源时
```

公共资源继续：

```text
examples/assets/
```

公共代码：

```text
examples/shared/
```

---

# 8. example.json 成为 Source of Truth

不要手工维护另一份大型 `files.json`。

每个 Example 自己声明：

```json
{
  "id": "material-clearcoat",
  "title": "Clearcoat Material",
  "category": "material",
  "order": 30,

  "capabilities": [
    "material",
    "gltf",
    "KHR_materials_clearcoat"
  ],

  "api": [
    "GLTFLoader",
    "Material"
  ],

  "tags": [
    "pbr",
    "clearcoat"
  ],

  "benchmarkRefs": [
    "B074"
  ],

  "recipeRefs": [
    "R022"
  ],

  "status": "stable"
}
```

---

# 9. Gallery Manifest 自动生成

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

自动生成：

```text
examples/files.json
```

Gallery 读取：

```text
files.json
```

这一点结合：

```text
Three.js files.json
+
PixiJS manifest
```

的优点。

---

# 10. 为什么采用“分布 Metadata → 聚合 Manifest”

避免：

```text
新增 Example
        ↓
忘记更新总清单
```

正确：

```text
新增 example.json
        ↓
generator
        ↓
files.json
```

并允许 CI：

```text
检查重复 ID
检查 category
检查 API 引用
检查 Screenshot
检查 License
```

---

# 11. Screenshot

每个 Stable Example 必须有：

```text
examples/screenshots/<example-id>.jpg
```

Gallery Card 使用 Screenshot。

Three.js 本身也是通过 screenshot card 展示 examples，并把 example + screenshot 作为功能展示和 E2E 验证的重要部分。

截图：

```text
由 Browser Automation 自动生成
```

不要人工长期维护。

---

# 12. Example 状态

统一：

```text
draft
validated
stable
deprecated
```

只有：

```text
stable
```

默认出现在 Gallery。

开发模式允许：

```text
?show=draft
```

查看实验示例。

---

# 13. 示例规模目标

建议 V1.1 第一版直接做到：

```text
100+ Examples
```

不是一次性追求 Three.js 数百规模。

目标：

```text
V1.1     >= 100
V1.2     >= 150
Long-term >= 250
```

---

# 14. Category 1 — Getting Started

目标：

```text
6 Examples
```

建议：

```text
basic-hello-world

basic-cube

basic-component

basic-scene

basic-animation-loop

basic-resize
```

覆盖：

```text
createAirApp
Scene
Node
Component
Camera
基础 Render Loop
```

---

# 15. Category 2 — Scene / Transform

目标：

```text
10 Examples
```

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

这一类特别适合 Agent 学习基础 Scene Graph。

---

# 16. Category 3 — Camera

目标：

```text
8 Examples
```

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

其中：

```text
frameObject
```

直接展示 Air helper。

---

# 17. Category 4 — Lighting

目标：

```text
8 Examples
```

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

# 18. Category 5 — Mesh / Geometry

目标：

```text
10 Examples
```

建议：

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

这里借鉴 Galacean：

```text
buffer-mesh-independent
buffer-mesh-instance
buffer-mesh-interleaved
```

这种“小能力单独展示”的方式。

若当前 Cocos Air 公开 API 没有稳定暴露某个 Custom Mesh 路径：

```text
不强行增加
```

改成现有公开 API 可覆盖内容。

---

# 19. Category 6 — Material / Texture

目标：

```text
15 Examples
```

基础：

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
```

高级：

```text
material-clearcoat

material-anisotropy

material-iridescence

material-transmission

material-volume-dispersion
```

---

# 20. Category 7 — glTF Core

目标：

```text
12 Examples
```

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

其中：

```text
getExtensionSupport()
```

应有独立示例。

---

# 21. Category 8 — glTF Extensions

这是 Cocos Air 的重点展示区。

目标：

```text
至少 21 Examples
```

一项目标扩展一个 Example：

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

每个页面必须显示：

```text
Extension Name

Current Status

Decoder Requirement

Device Requirement

Model

Relevant API
```

能力状态直接读取：

```text
getExtensionSupport()
```

不能复制第二份 whitelist。

---

# 22. Compression Examples

另外增加三个组合示例：

```text
gltf-compression-draco

gltf-compression-meshopt

gltf-compression-basis
```

重点展示：

```text
Decoder Configuration
```

和：

```text
decoder-required
```

错误处理。

---

# 23. Category 9 — Animation / Skeleton

目标：

```text
10 Examples
```

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

# 24. Category 10 — Input / Interaction

目标：

```text
10 Examples
```

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

只使用当前已经验证支持的 Input API。

不为了 Example 增加：

```text
Gesture Framework
```

---

# 25. Category 11 — Runtime / Lifecycle

目标：

```text
8 Examples
```

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

这一类非常重要：

> Three.js Gallery 往往偏视觉，而 Cocos Air 可以通过 Runtime/Lifecycle 示例体现工程优势。

---

# 26. Category 12 — DevTools / Agent

目标：

```text
8 Examples
```

显式使用 DevTools Artifact：

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

这些页面必须标记：

```text
Development Tool
```

不能让用户误以为它们进入生产 Runtime bundle。

---

# 27. Category 13 — Showcase

这不是 API 教学，而是展示：

> Cocos Air 能做什么。

优先从已经稳定的 Recipe 转换。

第一批：

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

目标：

```text
10+
```

---

# 28. V1.1 示例总规模

按上述规划：

```text
Getting Started          6
Scene / Transform       10
Camera                    8
Lighting                  8
Mesh                     10
Material / Texture       15
glTF Core                12
glTF Extension           21
Animation                10
Interaction              10
Runtime                   8
DevTools                  8
Showcase                 10
```

总计：

```text
136 Examples
```

不要求全部一次完成。

---

# 29. 推荐实施分三批

## Wave 1 — Foundation

优先：

```text
Getting Started
Scene
Camera
Lighting
Mesh
Material Basic
```

约：

```text
50 Examples
```

目标：

```text
新开发者可以靠 Gallery 学会 Cocos Air。
```

---

## Wave 2 — Cocos Air Differentiation

增加：

```text
glTF Core
21 glTF Extensions
Animation
Runtime Lifecycle
```

累计约：

```text
100+
```

目标：

```text
完整覆盖 Cocos Air 核心卖点。
```

---

## Wave 3 — Agent & Showcase

增加：

```text
Interaction
DevTools
Showcase
```

最终：

```text
130+
```

---

# 30. API Coverage Matrix

建立：

```text
docs/example-api-coverage.json
```

或自动生成。

每个公开 API 至少统计：

```text
exampleCount
exampleRefs
benchmarkRefs
recipeRefs
```

例如：

```json
{
  "GLTFLoader": {
    "examples": [
      "gltf-basic",
      "gltf-draco",
      "gltf-transmission"
    ],
    "benchmarks": [
      "B041",
      "B051"
    ],
    "recipes": [
      "R006"
    ]
  }
}
```

---

# 31. API Coverage Gate

公开 API 分级：

```text
Core
Important
Advanced
Internal
```

要求：

```text
Core API:
>= 2 Examples

Important API:
>= 1 Example

Advanced API:
>= 1 Example 或明确文档引用

Internal:
无需 Gallery
```

V1.1 的真正 DoD 不应该只是：

```text
Example 数量 >= 100
```

而应该：

```text
核心 API Coverage 达标
```

---

# 32. Benchmark / Recipe / Example 联动

已有：

```text
100+ Benchmark
30+ Stable Recipe
```

现在 Example 应成为中间桥梁：

```text
API
 ↓
Example
 ↓
Recipe
 ↓
Benchmark
```

关系：

```text
Example = 学习
Recipe  = 组合模式
Benchmark = 自动验证
```

三者职责不能混淆。

---

# 33. Example Validation

每个 Stable Example 必须自动验证：

```text
Build PASS

Browser Load PASS

No Blocking Runtime Error

Expected Scene State PASS

Screenshot Generated
```

关键 Example：

```text
Visual Regression
```

---

# 34. Example Screenshot Pipeline

建立：

```text
npm run examples:screenshot
```

自动：

```text
Open Example
Wait Ready
Capture
Generate Thumbnail
```

输出：

```text
examples/screenshots/
```

Gallery 不依赖人工截图。

---

# 35. 示例 Asset License

必须继承 1.0.0 License Discipline。

任何 Example Asset：

```text
Model
Texture
HDR
Image
Audio
```

必须记录：

```text
origin
revision
license
hash
```

Three.js 的贡献规范同样明确要求示例资源必须有适合使用的许可，并倾向避免过大的资源。

---

# 36. Gallery Search

支持搜索：

```text
example name

API

capability

glTF extension

tag

recipe

benchmark
```

例如：

```text
transmission
```

返回：

```text
material-transmission

gltf-transmission

showcase-glass-product
```

---

# 37. URL 设计

例如：

```text
/examples/#basic-cube

/examples/#gltf-draco

/examples/#material-clearcoat
```

同时搜索：

```text
/examples/?q=animation
```

接近 Three.js 使用习惯。其 Gallery 当前也通过 query + hash 保存搜索和选中示例。

---

# 38. View Source

Gallery 必须提供：

```text
View Source
```

但对于本地 / npm consumer：

可以直接展示：

```text
main.ts
```

而不仅仅跳 GitHub。

建议：

```text
Source
Docs
Benchmark
Recipe
```

四个按钮。

---

# 39. Gallery 不进入 Runtime

所有 Gallery 代码：

```text
examples/gallery
tools/examples
```

都属于：

```text
Development / Documentation
```

不能进入：

```text
cocosair.module.js
```

---

# 40. V1.1 Definition of Done

必须至少：

```text
Examples Gallery UI 完成

Three.js 风格导航完成

Search 完成

Thumbnail 完成

Live Viewer 完成

View Source 完成

Metadata Schema 完成

Manifest Generator 完成

Screenshot Generator 完成

API Coverage Matrix 完成

Wave 1 >= 50 Examples

Wave 2 后 >= 100 Examples

最终目标 >= 130 Examples

Core API Coverage >= 2 Examples/API

Important API Coverage >= 1 Example/API

所有 Stable Example 浏览器回归通过

所有 Example Asset License 可追踪

Benchmark / Recipe / Example 引用无悬空
```

---

# 41. V1.1 之后还值得补的三个方向

## V1.2 — Upstream Sync

因为 Cocos Air 源于 cocos4，长期最大维护成本之一会变成：

```text
如何持续同步 cocos4
```

需要：

```text
Upstream Diff Analyzer

File Mapping

Conflict Classification

Automatic Sync Candidate

Regression Gate
```

不要长期人工 cherry-pick。

---

## V1.3 — Developer Documentation

Examples 起来之后，再用 Examples 反向生成：

```text
API → Examples

Capability → Examples

Recipe → Examples
```

文档入口。

而不是单纯增加更多文字。

---

## V1.4 — Real-world Validation

选择：

```text
3-5 个完整真实项目
```

例如：

```text
Product Viewer

Interactive Character

Interactive Wallpaper

3D Landing Page

Visual Experience
```

作为：

```text
Long-running Production Fixtures
```

真正验证 Cocos Air 不是“只有小 Demo 可用”。

---

# 42. 当前优先级结论

现在不建议优先：

```text
继续增加新的 Renderer Feature

继续增加新的 abstraction

增加 Addons

增加 Plugin System

增加 Scene DSL
```

当前收益最大的路线：

```text
V1.1 Examples Gallery
        ↓
API Coverage
        ↓
Developer / Agent Learning Surface
        ↓
V1.2 Upstream Maintenance
        ↓
Real-world Production Fixtures
```

---

# 43. Cocos Air Examples 的最终定位

目标不是简单达到：

```text
“有很多 Demo”
```

而是建立：

```text
                Cocos Air Examples

                      │
          ┌───────────┼───────────┐
          │           │           │
        Learn       Discover    Validate
          │           │           │
          └───────────┼───────────┘
                      │
                Human + Agent
```

最终让开发者进入：

```text
examples
```

就能知道：

```text
Cocos Air 有什么

这个 API 怎么用

这个效果怎么做

这个模型能力是否支持

对应源码在哪里

对应 Recipe 是什么

对应 Benchmark 是否通过
```

这应该成为 Cocos Air 1.x 阶段最重要的开发者入口。
