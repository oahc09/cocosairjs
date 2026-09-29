# Cocos Air — Code First DX & SDK 化任务计划书
## 与 Engine Extraction 连续演进版本

## 0. 阶段关系

Engine Extraction 已完成的目标：

```text
cocos4 Web/TS Runtime
        ↓
Web Source Extraction
        ↓
cocosair.js 独立仓库
        ↓
src/
build/
examples/
test/
tools/
docs/
        ↓
独立 Build
        ↓
Code First Bootstrap
        ↓
Browser
```

Code First DX 不改变上述结构。

Code First DX 只做：

> 在 Engine Extraction 已成立的独立 Web Runtime 基础上，把 Code First 使用方式整理成稳定、简单、适合高频开发的开发体验。

核心变化：

```text
Engine Extraction
能独立运行
    ↓
Code First DX
方便开发和复用
```

---

# 1. Code First DX 核心目标

目标开发链：

```text
main.ts
   ↓
Cocos Air Code First Entry
   ↓
原 Cocos Runtime API
   ↓
Browser
```

开发反馈链：

```text
修改业务 TS
      ↓
自动编译
      ↓
Browser Reload
```

以及：

```text
修改 Engine TS
      ↓
自动重编 Engine
      ↓
Browser Reload
```

最终目标：

```text
edit
 ↓
save
 ↓
rebuild
 ↓
reload
 ↓
result
```

不再依赖 Creator。

---

# 2. Code First DX 必须继承 Engine Extraction 的仓库结构

Code First DX 不改变仓库一级目录。

继续使用：

```text
cocosair.js/
│
├── build/
│
├── docs/
│
├── examples/
│
├── src/
│   ├── air/
│   ├── cocos/
│   ├── exports/
│   ├── pal/
│   └── predefine.ts
│
├── test/
│
├── tools/
│
├── LICENSE
├── README.md
├── UPSTREAM.md
├── package.json
└── tsconfig.json
```

禁止在 Code First DX 新增：

```text
packages/
sdk/
core/
engine/
workspace/
```

等新的顶层产品分层。

---

# 3. Code First DX `src/` 结构

Engine Extraction 已确定：

```text
src/
├── air/
├── cocos/
├── exports/
├── pal/
└── predefine.ts
```

Code First DX 只扩展：

```text
src/air/
```

推荐：

```text
src/air/
├── app.ts
├── bootstrap.ts
├── index.ts
│
└── utils/
    ├── load-asset.ts
    ├── skeleton-tree.ts
    ├── restore-bind-pose.ts
    └── frame-object.ts
```

如果后续 `utils/` 数量明显增加，再评估细分目录。

Code First DX 不提前拆：

```text
assets/
camera/
model/
diagnostics/
scene/
```

避免在代码量还很小时形成过度目录化。

---

# 4. Code First DX API 边界

保持 Engine Extraction 的原则：

> 原 Cocos Engine API 继续作为主 API。

例如：

```ts
Scene
Node
Component
Camera
Material
Mesh
MeshRenderer
SkinnedMeshRenderer
Animation
Skeleton
```

不增加：

```ts
AirScene
AirNode
AirMesh
AirMaterial
```

Air 自己只增加极薄入口与 helper：

```ts
createAirApp()

loadAssetAsync()

buildSkeletonTree()

restoreBindPose()

frameObject()
```

---

# 5. Public Entry 保持单入口

Engine Extraction 已经计划通过统一入口 re-export。

Code First DX 继续采用：

```text
src/air/index.ts
```

以及最终主入口。

目标使用方式：

```ts
import {
    createAirApp,

    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
} from 'cocosair';
```

Air helper 也从同一入口导出：

```ts
import {
    loadAssetAsync,
    buildSkeletonTree,
    restoreBindPose,
    frameObject,
} from 'cocosair';
```

禁止让用户：

```ts
import ... from 'cocosair/internal/...'
```

---

# 6. Task 1 — 稳定 `createAirApp()`

Engine Extraction 已实现 Code First bootstrap。

Code First DX 不重新设计启动流程，只把它正式整理成稳定入口。

建议：

```ts
const app = await createAirApp({
    canvas,
});
```

最小职责：

```text
Canvas 获取
Engine 初始化
GFX 初始化
Director 初始化
Main Loop
Scene 启动
```

Code First DX 不让 `createAirApp()` 承担：

```text
资源系统抽象
Scene DSL
Renderer 配置框架
Plugin 管理
```

---

## 建议接口

```ts
export interface AirAppOptions {
    canvas: HTMLCanvasElement | string;
}

export interface AirApp {
    run(scene: Scene): void;
    getScene(): Scene | null;
}
```

只有确认存在真实需求再增加：

```text
stop()
destroy()
resize()
```

不要提前扩展。

---

# 7. Task 2 — Promise Asset Helper

前期已经验证：

```text
resources.load(path)
```

足够支持 Code First。

因此 Code First DX 不建立新 Asset System。

只增加 Promise wrapper：

```ts
const mesh = await loadAssetAsync(
    'models/robot/mesh',
    Mesh,
);
```

内部仍然：

```text
resources.load
```

目标只是：

```text
Callback API
    ↓
Promise DX
```

不做：

```text
Asset Cache redesign
Bundle redesign
URL Asset abstraction
```

---

# 8. Task 3 — 骨骼树重建 Utility 产品化

把已经验证通过的逻辑：

```text
Skeleton.joints
+
Skeleton.bindposes
```

正式整理成：

```ts
buildSkeletonTree(...)
restoreBindPose(...)
```

要求：

```text
完全使用公开 Runtime 数据
不读取 Prefab
不依赖 Editor
```

必须用前期 37 关节模型回归。

---

# 9. Task 4 — Camera Framing Utility

整理：

```ts
frameObject(camera, node)
```

用途：

```text
Code First demo
Model preview
Agent prototype
```

实现仅依赖现有：

```text
Bounds
Transform
Camera
```

不修改 Engine Camera。

---

# 10. Task 5 — 不正式封装 Model API

上一版 Code First DX 提到：

```text
createStaticModel()
createSkinnedModel()
```

这里调整。

Code First DX 默认不进入正式 `src/air/` API。

先放在：

```text
examples/shared/
```

如果多个 Example 都重复使用并验证稳定，再考虑 Standalone Asset Pipeline 是否提升为公共 helper。

原因：

这些接口容易演变成：

```text
第二套 Model abstraction
```

与 Engine Extraction 的设计原则冲突。

---

# 11. Task 6 — 保持 Engine Extraction 构建命令

Engine Extraction 已确定：

```bash
npm install
npm run dev
npm run build
npm run build:min
npm run typecheck
npm run verify:web-only
npm test
```

Code First DX 不新增另一套同义命令。

只增强这些命令的实现。

---

# 12. `npm run build`

继续输出：

```text
build/cocosair.module.js
```

职责保持：

```text
Development / normal ESM build
```

---

# 13. `npm run build:min`

继续输出：

```text
build/cocosair.module.min.js
```

职责：

```text
Production/minified ESM build
```

Code First DX 不改变文件命名。

---

# 14. `npm run dev`

Engine Extraction 已定义：

```text
Engine Watch
+
Example Dev Server
```

Code First DX 的任务是把它真正优化好。

目标：

```text
npm run dev
    │
    ├── watch src/cocos
    ├── watch src/pal
    ├── watch src/air
    └── serve examples
```

---

# 15. Task 7 — 明确 Watch 分类

文件变化：

### Engine Source

```text
src/cocos/**
src/pal/**
src/exports/**
```

处理：

```text
Engine incremental rebuild
→ Browser reload
```

### Air Code

```text
src/air/**
```

处理：

```text
Air rebuild
→ Browser reload
```

### Example

```text
examples/**
```

处理：

```text
Dev Server compile
→ Browser reload
```

目标是：

> Example 修改不能触发整个 Engine 全量重编。

---

# 16. Task 8 — Incremental Engine Build

Engine Extraction 已经实现：

```text
Engine TS
→ rebuild
```

Code First DX 在原 build system 上增加增量能力。

要求记录：

```text
Cold Build
Warm Build
Single-file Engine rebuild
```

输出：

```text
历史记录（05-v02-build-performance.md，已清理）
```

不为了追求增量性能直接更换整个 bundler。

优先复用 Engine Extraction 的 build pipeline。

---

# 17. Task 9 — Browser Reload

Code First DX 第一阶段只要求：

```text
Full Page Reload
```

不要求 HMR。

原因：

Engine 内部存在：

```text
global state
GPU resource
director
scheduler
scene
```

HMR 容易产生不可控状态。

因此：

```text
save
→ rebuild
→ full reload
```

作为 Code First DX 正式行为。

---

# 18. Task 10 — Source Map

开发构建：

```text
build/cocosair.module.js
```

必须附带 source map。

目标：

```text
Browser exception
      ↓
定位 src/**/*.ts
```

而不是：

```text
bundle line 30000
```

---

# 19. Task 11 — Type Declaration

Code First DX 必须保证：

```text
TypeScript autocomplete
Go to Definition
Static Type Check
```

生成对应 `.d.ts`。

具体输出位置应与 Engine Extraction Build System 保持一致。

如果 Engine Extraction 已有 declaration build：

```text
沿用
```

不要新增第二套声明生成机制。

---

# 20. Task 12 — Example 体系保持 Engine Extraction 连续

Engine Extraction 已有：

```text
examples/
├── hello-cube/
├── static-model/
└── skinned-animation/
```

Code First DX 必须保留。

新增：

```text
examples/starter/
```

最终：

```text
examples/
├── starter/
├── hello-cube/
├── static-model/
├── skinned-animation/
└── shared/
```

其中：

```text
examples/shared/
```

只放 Demo 复用代码。

不属于 Runtime API。

---

# 21. starter Example

保持最小：

```text
examples/starter/
├── index.html
└── main.ts
```

目标代码：

```ts
import {
    createAirApp,
    Scene,
} from 'cocosair';

const app = await createAirApp({
    canvas: '#game',
});

const scene = new Scene('Main');

app.run(scene);
```

这个 Example 是 Code First DX 最核心的入门模板。

---

# 22. hello-cube

保持 Engine Extraction 行为不变。

继续作为：

```text
Core Rendering Smoke Test
```

覆盖：

```text
Scene
Node
Camera
Light
Mesh
Material
Main Loop
```

---

# 23. static-model

继续作为：

```text
Runtime Asset Regression
```

覆盖：

```text
Mesh
Material
Texture
resources.load
```

Code First DX 改用：

```text
loadAssetAsync()
```

后必须保证结果与 Engine Extraction 一致。

---

# 24. skinned-animation

继续作为最高复杂度回归。

覆盖：

```text
Skeleton
37-joint hierarchy
BindPose
SkinnedMeshRenderer
AnimationClip
Material
Texture
```

Code First DX 需要将 Demo 中已经验证的：

```text
关节树构建
静止姿势恢复
```

替换为正式：

```text
src/air/utils/
```

实现。

---

# 25. Task 13 — Error Visibility

Code First DX 不建立新的调试框架。

利用现有：

```text
Dev Server
Browser Console
Terminal
```

必须清楚显示：

```text
TS Compile Error
Engine Build Error
Runtime Exception
Asset Load Error
```

如果使用 Vite 等现有开发服务器，可以复用其 Error Overlay。

---

# 26. Task 14 — Runtime Diagnostics 暂不进入公共 API

上一版提出：

```text
getRuntimeInfo()
```

重新核查后，Code First DX 暂不作为正式 API。

原因：

它不是当前 Code First 必需能力。

如果 Demo / 测试需要：

```text
FPS
DrawCalls
Triangles
```

先放：

```text
tools/
```

或：

```text
examples/shared/
```

避免 Code First DX 扩张公共 API。

---

# 27. Task 15 — tools 目录保持 Engine Extraction 结构

Engine Extraction：

```text
tools/
├── build/
├── upstream/
├── analyze/
└── verify/
```

Code First DX 不改变。

新增开发工具继续按职责进入：

```text
tools/build/
```

例如：

```text
watch
incremental build
dev orchestration
```

不能新增：

```text
utils/
scripts/
devtools/
```

作为平级重复目录。

如果 Engine Extraction 仍存在少量历史 `scripts/`：

Code First DX 应优先逐步收敛至：

```text
tools/
```

但不为了目录统一扩大修改。

---

# 28. Task 16 — Web-only Guard 必须持续通过

Code First DX 所有改动都必须保持：

```bash
npm run verify:web-only
```

PASS。

特别注意增量构建 / dev server 不能重新引入：

```text
native
JSB
Creator
Editor
```

运行时依赖。

---

# 29. Task 17 — 性能只记录，不优化

记录：

```text
Cold Build
Warm Engine Build
Air-only Rebuild
Example-only Reload
Browser Startup
```

输出：

```text
历史记录（05-v02-build-performance.md，已清理）
```

Code First DX 不做：

```text
Renderer performance tuning
GPU optimization
Runtime micro optimization
```

重点是：

```text
Developer Loop Performance
```

---

# 30. Bundle Size 继续沿用 Engine Extraction Output

记录：

```text
build/cocosair.module.js
build/cocosair.module.min.js
```

大小。

可以附加：

```text
gzip size
```

但：

```text
Code First DX 不以减包体为目标
```

---

# 31. Test 结构不变化

继续：

```text
test/
├── smoke/
└── unit/
```

新增测试也只能进入这里。

最低 Smoke：

```text
bootstrap
hello-cube
asset-load
skinning-animation
```

Code First DX 新增：

```text
promise-asset-helper
skeleton-utils
```

---

# 32. Documentation 连续编号

基于 Engine Extraction：

```text
docs/
├── 00-upstream-baseline.md
├── 01-web-feature-set.md
├── 02-web-dependency-boundary.md
├── 03-extraction-record.md
├── 04-v01-verification.md
```

Code First DX 继续：

```text
docs/
├── 05-v02-build-performance.md
├── 06-code-first-getting-started.md
├── 07-asset-loading.md
├── 08-skinned-model.md
└── 09-engine-development.md
```

避免重新建立另一套：

```text
getting-started.md
development.md
...
```

造成文档体系前后割裂。

---

# 33. README 增量更新

Engine Extraction README 已经说明：

```text
A standalone Web TypeScript runtime extracted from Cocos,
designed for Code First interactive applications.
```

Code First DX 不改变项目定位。

只增加：

```text
Quick Start
npm run dev
Starter
Asset Loading
Engine Development
```

---

# 34. Code First DX 不改变 Upstream Strategy

继续使用：

```text
UPSTREAM.md
docs/upstream-file-map.json
```

记录 Engine Extraction 的 cocos4 baseline。

Code First DX 不自动同步新的 cocos4 upstream。

否则：

```text
Code First DX DX 修改
+
Upstream Engine 更新
```

会混成两个变量。

Upstream sync 应作为独立任务。

---

# 35. Code First DX 验收矩阵

| Level | 验收项 | 必须 |
|---|---|---:|
| L0 | Engine Extraction 全部验证继续通过 | Yes |
| L1 | 原仓库结构不变化 | Yes |
| L2 | `createAirApp()` 整理完成 | Yes |
| L3 | Promise Asset Helper | Yes |
| L4 | Skeleton Utilities | Yes |
| L5 | Camera Framing Utility | Yes |
| L6 | Starter Example | Yes |
| L7 | Engine Incremental Build | Yes |
| L8 | Air-only 快速 Build | Yes |
| L9 | Example-only 快速 Reload | Yes |
| L10 | Browser Full Reload | Yes |
| L11 | Source Map | Yes |
| L12 | Type Declaration | Yes |
| L13 | `verify:web-only` | Yes |
| L14 | static-model Regression | Yes |
| L15 | skinned-animation Regression | Yes |
| L16 | Build Performance Baseline | Yes |
| L17 | Documentation | Yes |

---

# 36. Definition of Done

Code First DX 完成必须满足：

```text
1. Engine Extraction 仓库结构保持不变

2. src/air 是唯一 Air 新增 Runtime 层

3. 不新增 packages / SDK / Core 顶层目录

4. 原 Cocos API 继续直接使用

5. createAirApp 成为稳定 Code First 入口

6. resources.load 有 Promise helper

7. Skeleton Tree Helper 正式化

8. BindPose Restore Helper 正式化

9. Camera Framing Helper 正式化

10. npm run build 输出仍为：
    build/cocosair.module.js

11. npm run build:min 输出仍为：
    build/cocosair.module.min.js

12. npm run dev 保持原职责并增强为自动开发闭环

13. Engine TS 修改能够增量重新 Build

14. Air TS 修改不触发不必要的完整 Engine Build

15. Example 修改可以快速 Browser Reload

16. Source Map 正常

17. Type Declaration 正常

18. hello-cube 保持通过

19. static-model 保持通过

20. skinned-animation 保持通过

21. verify:web-only 保持通过

22. 不依赖 Creator

23. 不增加新的 Engine abstraction
```

---

# 37. 推荐执行顺序

```text
01 冻结 Engine Extraction RC baseline
        ↓
02 检查 Engine Extraction tests / examples 全部通过
        ↓
03 整理 createAirApp
        ↓
04 整理 loadAssetAsync
        ↓
05 整理 Skeleton Tree
        ↓
06 整理 BindPose Restore
        ↓
07 整理 frameObject
        ↓
08 建 starter example
        ↓
09 Public Export 整理
        ↓
10 Type Declaration 验证
        ↓
11 Source Map
        ↓
12 Engine Watch 优化
        ↓
13 Incremental Build
        ↓
14 Browser Reload
        ↓
15 hello-cube Regression
        ↓
16 static-model Regression
        ↓
17 skinned-animation Regression
        ↓
18 verify:web-only
        ↓
19 Build Performance Baseline
        ↓
20 Docs / README
        ↓
21 Code First DX RC
```

---

# 38. Engine Extraction → Code First DX 变化清单

明确只有：

```text
Engine Extraction
src/air/
    bootstrap
    basic app
    basic utils

        ↓

Code First DX
src/air/
    stable createAirApp
    Promise asset helper
    skeleton helper
    bindpose helper
    camera helper
```

以及：

```text
Engine Extraction
npm run dev
    basic watch

        ↓

Code First DX
npm run dev
    incremental build
    browser reload
    clearer error feedback
```

其余：

```text
Repository Structure
Engine Source Layout
Build Output
Test Layout
Tools Layout
Upstream Baseline
Engine API
```

全部保持连续。

---

# 39. Code First DX 结束后的真实产品状态

```text
cocosair.js/
│
├── src/
│   ├── cocos/     ← cocos4 Web Engine
│   ├── pal/       ← Web PAL
│   ├── exports/
│   └── air/       ← 极薄 Code First DX
│
├── build/
├── examples/
├── test/
├── tools/
└── docs/
```

使用：

```ts
import {
    createAirApp,
    loadAssetAsync,

    Scene,
    Node,
    Camera,
    MeshRenderer,
} from 'cocosair';
```

核心关系仍然是：

```text
Air
 ↓
Cocos Engine API
 ↓
Web Runtime
```

而不是：

```text
Air API
 ↓
重新包装一套 Engine
 ↓
Cocos
```

这是 Engine Extraction 与 Code First DX 必须共同坚持的边界。

---

# 40. Standalone Asset Pipeline 暂定边界

Code First DX 完成之后，Standalone Asset Pipeline 才讨论：

```text
Standalone Asset Pipeline
```

即：

```text
GLB / Texture / Animation
        ↓
Cocos Air Import Tool
        ↓
Runtime Assets
```

Standalone Asset Pipeline 也应继续保持现有仓库结构。

如果需要 Import 工具，优先进入：

```text
tools/import/
```

而不是立即改成 monorepo。

只有未来确实出现：

```text
独立发布的 CLI
独立发布的 importer package
独立插件生态
```

再评估是否从单仓库结构演化到 `packages/`。
