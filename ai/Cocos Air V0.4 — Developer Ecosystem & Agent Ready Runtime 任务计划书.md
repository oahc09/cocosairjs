# Cocos Air V0.4 — Developer Ecosystem & Agent Ready Runtime

## 0. 阶段定位

## V0.1

目标：

```text
cocos4 Web Runtime
        ↓
cocosair.js
        ↓
独立 Web Engine
```

解决：

> Engine 能否脱离 Creator？

---

## V0.2

目标：

```text
Cocos Air Runtime
        ↓
Code First API
        ↓
开发体验
```

解决：

> 开发者是否可以直接代码创建应用？

---

## V0.3

目标：

```text
Source Asset
        ↓
Asset Pipeline
        ↓
Runtime Asset
        ↓
Code First Runtime
```

解决：

> 是否可以脱离 Creator Import 完成资源生产？

---

## V0.4

目标：

```text
Cocos Air Runtime
        ↓
Developer Ecosystem
        ↓
AI Agent Friendly Runtime
```

解决：

> 如何让开发者和 AI Agent 更高效地创建交互式 3D 应用？

---

# 1. V0.4 核心目标

V0.4 不增加 Engine 能力。

重点：

```text
可发现
可学习
可调试
可自动化
```

核心：

> 将 Cocos Air 从“可运行引擎”提升为“可被人和 Agent 高效使用的平台”。

---

# 2. 必须保持 V0.1~V0.3 规范

## 仓库结构保持

继续：

```text
cocosair.js/

build/
docs/
examples/
src/
test/
tools/
```

不新增：

```text
packages/
addons/
plugins/
sdk/
framework/
```

---

## Runtime API 保持

继续使用：

```ts
Scene
Node
Component
Camera
MeshRenderer
Material
Animation
Skeleton
```

不创建：

```ts
AirScene
AirNode
AirObject
```

---

## Asset Pipeline 保持

继续：

```text
tools/import
```

负责：

```text
Source Asset
 ↓
Runtime Asset
```

Runtime：

```text
src/air/assets
```

负责：

```text
Runtime Loading
```

---

# 3. V0.4 四个核心方向

---

# Direction 1：npm Developer Experience

## 目标

达到 three.js 类似依赖体验：

```bash
npm install cocosair
```

然后：

```ts
import {
    createAirApp,
    Scene,
    Node
} from "cocosair";
```

three.js 的一个核心优势就是开发者可以直接通过 npm 获取库并开始编码。

---

## Task 1.1

完善 package.json：

包含：

```json
{
 "name":"cocosair",
 "type":"module",
 "main":"build/cocosair.module.js",
 "types":"build/cocosair.d.ts"
}
```

---

## Task 1.2

发布结构：

```text
npm package

build/
├── cocosair.module.js
├── cocosair.module.min.js
└── cocosair.d.ts
```

---

## Task 1.3

验证：

新建空项目：

```bash
npm install cocosair
```

运行：

```ts
main.ts
```

不依赖源码仓库。

---

# Direction 2：Examples First Ecosystem

## 目标

建立 three.js 风格学习入口。

three.js 长期通过 Examples、Docs、Manual 形成开发者学习闭环。

---

## 保持目录

继续：

```text
examples/
```

扩展：

```text
examples/

starter/

basic/
├── cube
├── transform
├── camera

material/
├── pbr
├── glass

model/
├── static-model
├── skinned-model

interaction/
├── touch
├── gesture

effect/
├── particle
├── postprocess

ai/
├── generated-scene
```

---

## Example 标准

每个 Example：

必须：

```text
index.html
main.ts
README.md
```

运行：

```bash
npm run dev
```

---

# Direction 3：Runtime Inspection

这是 Agent 能力基础。

不是 MCP。

先建立 Runtime 可观察能力。

---

## Task 3.1 Scene Inspector

增加：

```ts
inspectScene()
```

返回：

```json
{
 "nodes":120,
 "cameras":1,
 "lights":5,
 "meshes":20
}
```

---

## Task 3.2 Node Inspector

支持：

```ts
inspectNode(node)
```

返回：

```json
{
"name":"Robot",
"type":"SkinnedMesh",
"children":37
}
```

---

## Task 3.3 Asset Inspector

结合 V0.3：

```ts
inspectAsset()
```

查看：

```text
Mesh
Material
Texture
Skeleton
Animation
```

---

# Direction 4：Agent Development Interface

目标：

让 Agent 可以：

```text
Create
Modify
Observe
Validate
```

---

## Task 4.1 Runtime Action API

例如：

```ts
createNode()

addComponent()

setTransform()

loadAsset()
```

注意：

这些不是替代 Engine API。

只是：

```text
Agent Automation Layer
```

---

## Task 4.2 Screenshot Capture

提供：

```ts
captureFrame()
```

能力：

```text
Runtime
 ↓
Canvas
 ↓
Image
 ↓
Vision Model
```

---

## Task 4.3 Runtime Error Collection

提供：

```ts
getRuntimeErrors()
```

收集：

```text
Asset Error
Shader Error
Runtime Exception
```

---

# 4. V0.4 不做 MCP

原因：

MCP 是通信协议。

当前缺的是：

```text
Runtime Observation
Runtime Control
Runtime Feedback
```

先建立：

```text
Cocos Air Runtime API
```

以后：

```text
MCP Server
```

只是其中一个适配层。

---

# 5. Runtime Debug Tool

新增：

```text
tools/debug/
```

不是：

```text
src/debug/
```

原因：

调试工具不是 Runtime。

---

能力：

```text
Scene Tree Viewer

Asset Viewer

Performance Info

Screenshot

Console
```

---

# 6. Performance Baseline

保持：

V0.3 已有：

```text
build performance
asset build performance
```

V0.4 增加：

```text
runtime startup

scene load time

first frame time

memory usage
```

输出：

```text
docs/v04-runtime-baseline.md
```

---

# 7. Documentation

继续：

```text
docs/
```

新增：

```text
docs/

getting-started.md

code-first-guide.md

asset-pipeline.md

runtime-inspection.md

agent-development.md

examples-guide.md
```

---

# 8. Test

保持：

```text
test/

smoke/
unit/
```

新增：

```text
test/

runtime/
agent/
```

---

测试：

## Runtime Inspection

```text
Scene
 ↓
inspect
 ↓
result
```

---

## Screenshot

```text
capture
 ↓
image
```

---

## Action API

```text
command
 ↓
runtime
 ↓
state change
```

---

# 9. V0.4 验收矩阵

| Level | 内容 | 必须 |
|-|-|-|
| L0 | V0.3 全部通过 | Yes |
| L1 | npm install 使用 | Yes |
| L2 | 独立 Demo 项目运行 | Yes |
| L3 | Examples 体系完善 | Yes |
| L4 | Scene Inspector | Yes |
| L5 | Asset Inspector | Yes |
| L6 | Screenshot API | Yes |
| L7 | Runtime Error API | Yes |
| L8 | Agent Action API | Yes |
| L9 | Debug Tool | Yes |
| L10 | 文档完善 | Yes |

---

# 10. V0.4 Definition of Done

完成：

```text
1. 用户可以 npm install cocosair

2. 不需要 clone engine repo

3. Starter 项目可以运行

4. Examples 可以直接学习

5. Runtime 可以被观察

6. Runtime 可以被控制

7. Agent 可以获取反馈

8. 不新增 Engine abstraction

9. 不引入 Addons 体系

10. 不破坏 V0.1~V0.3 结构
```

---

# 11. V0.1 → V0.4 演进

```text
V0.1

Extract Runtime


        ↓


V0.2

Code First Experience


        ↓


V0.3

Asset Pipeline


        ↓


V0.4

Developer + Agent Interface
```

最终：

```text
             cocosair.js


Source Asset
      |
      v
Asset Pipeline
      |
      v
Runtime Asset
      |
      v
Code First Runtime
      |
      v
Inspection / Control
      |
      v
Human + AI Agent
```

---

# 12. V0.5 方向

V0.5 再考虑：

```text
Interactive Framework
```

包括：

```text
Behavior
State
Timeline
Interaction
```

V0.4 不提前引入。