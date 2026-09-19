# Cocos Air V1.1 — Example Specification 执行规范

## 1. Example 不再以“名称”作为实施单位

原有：

```text
camera-frame-object
gltf-basic
material-clearcoat
animation-basic
```

只能表达方向。

正式实施单位必须是：

```text
Example ID
+
Learning Goal
+
Expected Effect
+
Required API
+
Scene Structure
+
Assets
+
Interaction
+
Ready Contract
+
Functional Validation
+
Visual Validation
+
Lifecycle Validation
+
API Coverage Evidence
```

即：

> 一个 Example = 一个完整、可执行、可自动验收的规格。

---

# 2. Example Spec 文件

每个 Example 增加：

```text
example.json
```

其中不仅包含 Gallery Metadata，也包含实施合同。

建议结构：

```json
{
  "id": "camera-frame-object",
  "title": "Camera Frame Object",
  "category": "camera",
  "status": "draft",

  "goal": "展示如何使用 frameObject 将 Camera 自动调整到完整观察模型的位置",

  "effect": {
    "description": "加载一个尺寸未知的 3D 模型后，相机自动移动并完整包围模型，模型位于画面中央且不被裁剪。",
    "visualTarget": "模型完整可见，四周保留合理边距，Camera 朝向模型中心。"
  },

  "apiUnits": [
    "createAirApp",
    "Scene",
    "Camera",
    "frameObject"
  ],

  "capabilities": [
    "scene",
    "camera",
    "bounds"
  ],

  "assets": [],

  "scene": {},

  "interaction": {},

  "ready": {},

  "validators": [],

  "visualValidation": {},

  "lifecycle": {},

  "coverage": {}
}
```

---

# 3. Required API 必须绑定 Public API Inventory

禁止 Example Spec 写：

```text
使用 Camera API
使用 Mesh API
使用 glTF API
```

必须绑定到：

```text
docs/example-api-inventory.json
```

中的具体 API Unit。

例如：

```text
GLTFLoader.loadAsync
GLTFAsset.instantiate
GLTFLoader.getExtensionSupport
AirApp.run
frameObject
```

如果某个 Example 需要的 API 在 Inventory 中找不到：

```text
Example = BLOCKED
```

先解决 API Inventory / Public Contract，不能让实施 Agent 自己寻找私有 API。

---

# 4. API 使用分三类

每个 Example Spec 明确：

```text
primaryApi
supportingApi
forbiddenShortcut
```

例如：

```json
{
  "primaryApi": [
    "GLTFLoader.loadAsync",
    "GLTFAsset.instantiate"
  ],

  "supportingApi": [
    "Scene",
    "Node"
  ],

  "forbiddenShortcut": [
    "使用预构建 Scene 代替 Code First",
    "直接引用私有 loader"
  ]
}
```

这样才能证明：

> Example 真正展示了目标 API，而不是通过另一条路径做出了同样画面。

---

# 5. Example 必须只有明确 Learning Goal

普通教学 Example 原则：

```text
1 个主要教学目标
+
1~3 个主要 API
```

避免：

```text
一个 Example 同时讲
Camera + Animation + Material + Input + glTF + DevTools
```

否则无法学习，也无法计算 Coverage。

例外：

```text
Showcase
Recipe Example
Composite Example
```

允许组合多个能力。

---

# 6. Effect Contract

每个 Example 必须定义：

## Expected Functional Effect

程序层面应该发生什么。

## Expected Visual Effect

用户应该看到什么。

例如：

```text
material-clearcoat
```

不能只写：

```text
展示 Clearcoat
```

必须写：

```text
场景包含至少 3 个相同基础材质球体：

左：
clearcoat = 0

中：
clearcoat 为中等值

右：
clearcoat 为高值

使用同一 Camera / Lighting / base material，
使表面第二层高光随 clearcoat 增强明显变化。
```

这样 Agent 才知道：

```text
最终应该做成什么样。
```

---

# 7. Scene Structure Contract

每个 Example 明确预期 Scene Graph。

例如：

```text
material-clearcoat

Scene
├── Camera
├── DirectionalLight
├── FillLight
├── Sphere_NoClearcoat
├── Sphere_MidClearcoat
└── Sphere_HighClearcoat
```

验收可以直接检查：

```text
Node existence
Component existence
Material property
```

---

# 8. Interaction Contract

有交互的 Example 必须定义步骤。

例如：

```text
interaction-click
```

不是：

```text
可以点击 Cube
```

而是：

```text
Initial:
Cube 为默认 orientation

Action:
pointer click Cube

Expected:
Cube 在 500ms 内旋转 90°

Second click:
继续旋转 90°
```

Validator 才能自动执行。

---

# 9. Ready Contract

每个 Example 必须定义：

> 什么时候才真正“准备完成”。

不能统一使用：

```text
DOMContentLoaded
```

或：

```text
requestAnimationFrame()
```

例如：

### gltf-basic

```text
GLTFLoader.loadAsync resolved
+
GLTFInstance 已 attach 到 Scene
+
目标 Renderer 已进入 Scene
+
至少完成一个有效 render frame
```

### animation-basic

```text
Model loaded
+
AnimationClip attached
+
target clip playing
+
动画时间 > 0
```

### decoder-missing

```text
预期 GLTF_DECODER_MISSING 已产生
```

错误教学 Example 同样可以 Ready。

---

# 10. Validation Contract

每个 Example 至少定义：

```text
readyValidator
functionalValidators
```

按需要增加：

```text
interactionValidator
visualValidator
lifecycleValidator
capabilityValidator
```

---

# 11. Stable Example 验收公式

普通 Example：

```text
Stable
=
Build PASS
+
Ready PASS
+
Functional PASS
+
No Unexpected Error
+
API Evidence PASS
+
License PASS
+
Screenshot Current
```

涉及视觉：

```text
+ Visual PASS
```

涉及交互：

```text
+ Interaction PASS
```

涉及资源：

```text
+ Lifecycle PASS
```

涉及设备能力：

```text
+ Capability Contract PASS
```

---

# 12. API Coverage Evidence

Example 不能只声明：

```json
"apiClaims": [
  "GLTFLoader.loadAsync"
]
```

还必须保存：

```json
{
  "apiEvidence": [
    {
      "api": "GLTFLoader.loadAsync",
      "source": "main.ts",
      "sourceLocation": "L32-L34",
      "validator": "model-loaded"
    }
  ]
}
```

最终：

```text
apiClaims = 声明

apiEvidence + PASS = verified
```

---

# 13. Pilot 12 — 完整 Example 定义

下面 12 个 Example 作为 Example Spec 模板。

只有 Pilot 全部按此规格实现并 G1 PASS，才扩展 Wave。

---

# E001 — basic-cube

## 目标

验证最小 Code First 3D Scene。

## 效果

浏览器显示一个位于画面中央的立方体。

立方体持续缓慢旋转，可以明显看到三个表面和光照变化。

## Scene

```text
Scene
├── Camera
├── DirectionalLight
└── Cube
    └── MeshRenderer
```

## Primary API

```text
createAirApp
Scene
Node
Camera
DirectionalLight
MeshRenderer
```

Primitive/Mesh 创建必须绑定当前 Public API Inventory 中的正式 API，不允许使用私有函数。

## 行为

```text
Cube Y rotation
持续随时间增加
```

## Ready

```text
Scene active
+
Cube Renderer active
+
完成至少一个有效 frame
```

## 验收

```text
Cube Node exists
Camera exists
Light exists
Renderer exists
rotation(t1) != rotation(t0)
No Runtime Error
```

## 视觉

```text
Cube 完整可见
位于主要视区
非纯黑
能够观察到立体表面
```

---

# E002 — scene-hierarchy

## 目标

解释 Node Parent / Child 和 Local / World Transform。

## 效果

三个 Cube 构成机械臂式父子结构：

```text
Root
└── Arm
    └── Hand
```

旋转 Root：

```text
Arm 和 Hand 一起运动
```

旋转 Arm：

```text
Hand 相对 Arm 运动
```

## Primary API

从 Public Inventory 绑定：

```text
Node
Node parent/child API
Transform local API
Transform world API
```

## Scene

```text
Scene
├── Camera
├── Light
└── Root
    └── Arm
        └── Hand
```

## 验收

检查：

```text
Hierarchy correct

local transforms correct

world transform =
parent world × local

Root rotation changes Hand world position
```

---

# E003 — camera-frame-object

## 目标

展示 `frameObject`。

## 效果

加载尺寸未知模型。

调用前：

```text
模型可能不在合适位置
```

调用：

```text
frameObject(...)
```

后：

```text
整个模型完整位于视锥中
居中
保留合理 margin
```

## Primary API

```text
Camera
frameObject
```

## Supporting API

```text
GLTFLoader.loadAsync
GLTFAsset.instantiate
```

## Ready

```text
Model loaded
+
Bounds valid
+
Camera framed
+
render frame completed
```

## 验收

```text
模型 bounds 全部在 Camera frustum 内

near/far 无裁切

模型屏幕占用率处于规定区间
```

视觉目标：

```text
完整模型居中显示
```

---

# E004 — light-directional

## 目标

展示 Directional Light 对 PBR / Lit Object 的影响。

## 效果

一个球体或模型，Directional Light 从斜上方照射。

提供三个状态：

```text
Light OFF
Low Intensity
Normal Intensity
```

## Primary API

```text
DirectionalLight
Light intensity/property APIs
```

## 验收

```text
DirectionalLight component exists

intensity property matches target

OFF / ON frame luminance 有明显差异
```

---

# E005 — mesh-multiple-materials

## 目标

展示一个 Mesh / SubMesh 使用多个 Material。

## 效果

同一个物体至少有两个明显不同材质区域：

```text
Left / SubMesh A → Red
Right / SubMesh B → Blue/Metallic
```

## Primary API

绑定当前正式：

```text
Mesh
MeshRenderer
Material
Material slot API
```

## 验收

```text
Renderer material count >= 2

SubMesh/material mapping correct

Framebuffer 对应区域颜色/材质不同
```

禁止：

```text
通过两个完全独立 Mesh 冒充 multiple material
```

---

# E006 — material-clearcoat

## 目标

展示 Clearcoat 视觉语义。

## 效果

三个相同球体：

```text
Clearcoat 0
Clearcoat Medium
Clearcoat High
```

Camera、Lighting、Base Material 保持一致。

预期：

```text
从左到右第二层镜面高光逐渐增强。
```

## Primary API

必须从当前物理材质 Public Contract 绑定具体：

```text
Material
Clearcoat factor/property
Clearcoat roughness/property
```

如果当前只能通过 glTF Extension 暴露，则 Example 应改为：

```text
gltf-clearcoat
```

而不是构造不存在的 Material API。

## 验收

```text
3 个目标对象存在

Clearcoat 参数不同

基础参数一致

关键 framebuffer 区域高光趋势符合预期
```

---

# E007 — gltf-basic

## 目标

展示最简单的运行时 glTF/GLB 加载。

## 效果

加载一个固定、无复杂扩展的 Khronos 模型并显示。

## Primary API

```text
GLTFLoader.constructor
GLTFLoader.loadAsync
GLTFAsset.instantiate
```

## Scene

```text
Scene
├── Camera
├── Lighting
└── GLTF Instance
```

## Ready

```text
loadAsync resolve
+
instantiate complete
+
instance attached
+
visible frame
```

## 验收

```text
GLTFAsset exists
Instance exists
Mesh Renderer count > 0
Expected bounds
No unexpected errors
Visible model
```

---

# E008 — gltf-draco

## 目标

展示 Draco 模型加载和 Decoder 配置。

## Primary API

```text
GLTFLoader.setDRACODecoder
GLTFLoader.loadAsync
GLTFLoader.getExtensionSupport
```

以及冻结 Decoder Provider Contract。

## 正常模式

```text
configure decoder
↓
load Draco model
↓
visible model
```

## 教学附加模式

允许 UI 切换：

```text
Decoder Configured
Decoder Missing
```

Decoder Missing 应得到：

```text
GLTF_DECODER_MISSING
```

## 验收

正常：

```text
extension support state correct
decoder loaded only when needed
model visible
```

错误模式：

```text
stable error code correct
no partial leaked instance
```

---

# E009 — animation-basic

## 目标

展示 GLTF Animation 播放。

## 效果

一个带单一明显动画的角色或模型：

```text
初始静止
↓
Play
↓
持续播放
```

## Primary API

从冻结 Inventory 绑定：

```text
Animation
AnimationClip
play API
```

如模型由：

```text
GLTFAsset.instantiate
```

直接提供 Animation，则使用实际公开合同。

## Ready

```text
Model loaded
Animation attached
Target clip playing
time > 0
```

## 验收

```text
Clip exists
Playing state correct
time advances
sampled node transform / skeleton pose changes
```

Screenshot 只是展示，不代替 animation validator。

---

# E010 — interaction-click

## 目标

展示 Pointer Click → Scene State Change。

## 效果

用户点击 Cube：

```text
Cube 旋转 90°
```

再次点击：

```text
继续旋转 90°
```

## Primary API

从当前正式 Input Contract 绑定：

```text
Pointer/Input API
Node transform API
```

## Interaction

Automation 必须执行真实：

```text
pointer move
pointer down
pointer up
```

## 验收

```text
初始 rotation = R0

click #1
rotation = R0 + 90°

click #2
rotation = R0 + 180°
```

不允许直接调用 Click Handler 冒充真实输入链。

---

# E011 — runtime-asset-release

## 目标

展示 Runtime Asset 生命周期正确释放。

## 效果

页面允许：

```text
Load
Instantiate
Dispose
Reload
```

模型每次都能正确出现和销毁。

## Primary API

从正式：

```text
GLTFLoader
GLTFAsset
GLTFInstance
dispose contracts
```

绑定具体方法。

## 验收

至少执行：

```text
load
instantiate
dispose
```

多次。

检查：

```text
Instance removed
Session-owned references released
No stale nodes
No Blob URL growth
No unexpected worker growth
```

该 Example 是 Lifecycle Example，不以截图为主要验收依据。

---

# E012 — devtools-inspect-scene

## 目标

展示独立 DevTools Artifact 如何观察 Runtime。

## requiresDevTools

```text
true
```

## 效果

左侧运行普通 3D Scene。

开发工具显示：

```text
Scene ID
Node Count
Camera Count
Light Count
Renderer Count
```

选择节点后显示：

```text
Node ID
Name
Parent
Children
Components
Local Transform
World Transform
```

## Primary Contract

不是 Runtime Public API Coverage。

使用：

```text
V0.5.1 DevTools Session Contract
inspectScene
inspectNode
```

的冻结接口。

## 验收

```text
Runtime-only bundle 不含 DevTools

显式 attach 后工具工作

Scene counts 与真实 scene 一致

Node ID session 内稳定

detach 后工具 listener 清理

业务主循环不受影响
```

---

# 14. Pilot 12 的 API Bind Gate

上面定义的是逻辑规格。

实际开发前还必须执行：

```text
Pilot API Bind
```

将所有：

```text
Node parent API
Material slot API
Input API
Animation play API
Primitive creation API
```

映射为：

```text
example-api-inventory.json
```

中的实际 symbol。

最终 Pilot Spec 中：

```text
不允许存在模糊 API 名称。
```

例如：

```text
“Mesh API”
“Input API”
```

都必须被替换成实际 Public API Unit。

---

# 15. Example Spec Freeze

一个 Example 只有满足：

```text
Goal complete

Expected Effect complete

Exact API binding complete

Scene structure complete

Assets complete

Interaction complete

Ready complete

Validators complete

Visual target complete

Lifecycle complete

Coverage claims complete
```

才能：

```text
specStatus = frozen
```

只有：

```text
frozen
```

Example 才允许实施。

---

# 16. Wave 实施新增 Spec Gate

原：

```text
Wave 1 → 40 Stable
Wave 2 → 90 Stable
Wave 3 → 120 Stable
```

调整为：

```text
Wave N Candidate
        ↓
Example Spec
        ↓
Spec Review
        ↓
Spec Frozen
        ↓
Implementation
        ↓
Validated
        ↓
Stable
```

---

# 17. Wave 1 开工条件

40 个 Example 中：

```text
100% 必须先有 Frozen Spec
```

不能：

```text
先让 Agent 按名字实现
然后再补验收
```

---

# 18. Wave 2 / Wave 3 相同

任何 Example 进入下一 Wave：

必须先完成：

```text
API Binding
Expected Effect
Validation Contract
License Plan
```

---

# 19. Gallery 中增加 What You Learn

每个 Example Gallery 页面显示：

```text
What you'll learn
```

例如：

### gltf-draco

```text
• 如何配置 Draco Decoder
• 如何查询扩展支持状态
• 如何加载 Draco 压缩 glTF
• 缺失 Decoder 时如何处理稳定错误
```

---

# 20. Gallery 增加 APIs Used

页面展示：

```text
APIs Used
```

例如：

```text
GLTFLoader.setDRACODecoder
GLTFLoader.loadAsync
GLTFLoader.getExtensionSupport
```

点击：

```text
跳对应 API docs
```

---

# 21. Gallery 增加 Expected Result

每个 Example 展示简短：

```text
Expected Result
```

例如：

```text
Three spheres should show progressively stronger
clearcoat reflections from left to right.
```

这样 Human / Agent 都知道：

```text
正确结果应该长什么样。
```

---

# 22. Gallery 增加 Validation Status

例如：

```text
Stable

Ready        PASS
Functional   PASS
Visual       PASS
Interaction  N/A
Lifecycle    PASS
API Coverage PASS

Verified:
<revision>
```

Gallery 本身就成为能力证据入口。

---

# 23. Example Spec 与 Metadata 的关系

推荐最终：

```text
example.json
```

同时承担：

```text
Gallery Metadata
+
Example Specification
```

避免：

```text
example.json
example-spec.json
```

长期双份漂移。

但可以在生成后的：

```text
files.json
```

只保留 Gallery 需要的裁剪字段。

---

# 24. `example.json` 完整建议 Schema

```json
{
  "id": "gltf-draco",
  "title": "glTF Draco Compression",
  "category": "gltf",
  "status": "stable",
  "specStatus": "frozen",

  "learning": {
    "goal": "...",
    "points": []
  },

  "effect": {
    "functional": "...",
    "visual": "..."
  },

  "api": {
    "primary": [],
    "supporting": [],
    "claims": []
  },

  "capabilities": [],

  "assets": [],

  "scene": {
    "expectedGraph": {}
  },

  "interaction": {
    "steps": []
  },

  "ready": {
    "validators": []
  },

  "validation": {
    "functional": [],
    "interaction": [],
    "visual": [],
    "lifecycle": [],
    "capability": []
  },

  "coverage": {
    "benchmarkRefs": [],
    "recipeRefs": []
  },

  "screenshot": {},

  "license": {}
}
```

---

# 25. V1.1 DoD 增补

原 DoD 之外增加：

```text
Pilot 12 全部拥有 Frozen Example Spec

所有进入 Wave 的 Example：
100% Spec Frozen

所有 Stable Example：
Expected Effect 已定义

所有 Stable Example：
Exact Public API Binding 已完成

所有 Stable Example：
Ready / Functional Validation 已定义

交互 Example：
Interaction Steps + Validator 100%

视觉 Example：
Expected Visual + Visual Validation 100%

资源 Example：
Lifecycle Contract 100%

API verified coverage：
必须由 Example Spec Evidence 支撑
```

---

# 26. 最终原则

V1.1 不应该是：

```text
120 个漂亮 Demo
```

而应该是：

```text
120 个
可理解
可复现
可验证
可定位 API
可作为 Agent Reference
的正式能力样例
```

因此真正的实施单位不是：

```text
Example Name
```

而是：

```text
Example Specification
        ↓
Implementation
        ↓
Validation Evidence
        ↓
Stable Example
```

这才足以支撑后续 120+ Examples 规模化建设。