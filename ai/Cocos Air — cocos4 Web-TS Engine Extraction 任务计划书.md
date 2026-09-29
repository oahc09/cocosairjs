# Cocos Air — cocos4 Web/TS Engine Extraction 任务计划书

## 0. 项目定义

仓库名称：

```text
cocosair.js
```

项目名称：

```text
Cocos AIR
Cocos Agent-first Interactive Runtime
```

项目定位：

> 基于 cocos4 的纯 TypeScript Web Runtime，构建一个脱离 Cocos Creator、Editor 和 Native Engine 的 Code First Web 引擎。

目标体验：

```bash
npm install
npm run dev
```

用户只需要：

```ts
import {
    Scene,
    Node,
    Camera,
    MeshRenderer,
} from 'cocosair';

const app = await createAirApp({
    canvas: document.querySelector('#GameCanvas')!,
});

const scene = new Scene('Main');

// Code First...

app.run(scene);
```

---

# 1. Engine Extraction 核心目标

Engine Extraction 只解决一个问题：

> 将当前 cocos4 中 Web 平台实际需要的 TypeScript Engine 抽取成一个可以独立构建、独立运行、独立开发的 `cocosair.js` 仓库。

最终链路：

```text
main.ts
   ↓
Cocos AIR bootstrap
   ↓
Cocos Web TS Engine
   ↓
GFX
   ↓
WebGL
   ↓
Browser
```

必须摆脱：

```text
Cocos Creator
Editor Runtime
Native Engine
JSB
Android/iOS Native
.scene 启动
Prefab 启动
Creator Compile Engine
```

---

# 2. 当前前置条件

前期 Code First 技术验证已经完成。

已确认：

```text
Scene Code First                PASS
Node / Component                PASS
Runtime Asset                   PASS
Material Dependency             PASS
Static Model                    PASS
Skinned Model                   PASS
Animation                       PASS
Prefab bypass                   PASS
Skeleton rebuild                PASS
```

尤其已经验证：

```text
Skeleton.joints
+
Skeleton.bindposes
        ↓
重建骨骼层级
        ↓
inverse(bindpose)
        ↓
恢复静止姿势
        ↓
正确 Skinning
```

因此 Engine Extraction 不再重新验证“Cocos 是否支持 Code First”。

重点转为：

```text
Engine Extraction
+
Standalone Build
+
Standalone Development
```

---

# 3. 上游源码基线

当前目录已经存在 cocos4 源码。

不执行：

```text
git clone
git pull
git checkout
```

不改变当前源码状态。

首先记录：

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --format=fuller
git status --short
```

生成：

```text
UPSTREAM.md
docs/foundation/00-upstream-baseline.md
```

记录：

```text
Repository
Branch
Commit SHA
Commit Date
Commit Message
Baseline Date: 2026-09-12
Working Tree Status
```

如果存在本地修改：

```text
Modified
Staged
Untracked
```

必须保留。

不得执行：

```bash
git reset
git clean
git checkout -- .
```

所有后续报告使用：

```text
cocos4 @ <commit SHA>
```

作为准确基线。

---

# 4. 核心原则

## 4.1 先分析依赖，再物理裁剪

禁止：

```text
复制整个 cocos4
↓
删除 native
↓
编译错误
↓
不断补文件
```

采用：

```text
Web Build Entry
   ↓
Feature Set
   ↓
Module Graph
   ↓
Import Graph
   ↓
Web Source Closure
   ↓
Extraction
```

---

## 4.2 Engine Extraction 优先行为一致

优先级：

```text
Correctness
↓
Standalone
↓
Maintainability
↓
Repository cleanliness
↓
Package size
```

暂时不做激进重构。

---

## 4.3 公共源码不因为包含 Native 分支而删除

例如：

```ts
if (NATIVE) {
    ...
}

if (HTML5) {
    ...
}
```

只要 Web build 仍然依赖该模块：

```text
KEEP
```

Engine Extraction 优先依靠：

```text
constants
module override
tree shaking
```

消除 Native branch。

---

## 4.4 Air 新增代码与 Engine 源码分开

建议：

```text
src/
├── air/
│
├── cocos/
├── pal/
└── ...
```

其中：

```text
src/air/
```

只保存 Cocos AIR 新增的 Code First 入口和少量 DX 工具。

不把这些代码塞入 cocos engine core。

---

# 5. Engine Extraction 非目标

本阶段不做：

```text
MCP
AI Agent integration
A2Cocos DSL
Runtime GLTF loader
Runtime FBX loader
Asset CLI
Creator importer replacement
Native platform
MiniGame
WebGPU migration
Public API redesign
Physics redesign
UI redesign
npm 正式发布
极致 bundle size
完整 tree shaking redesign
```

---

# 6. 仓库结构

参考 three.js 的单仓库结构。

目标：

```text
cocosair.js/
│
├── build/
│   ├── cocosair.module.js
│   └── cocosair.module.min.js
│
├── docs/
│
├── examples/
│   ├── hello-cube/
│   ├── static-model/
│   └── skinned-animation/
│
├── src/
│   ├── air/
│   │   ├── app.ts
│   │   ├── bootstrap.ts
│   │   ├── index.ts
│   │   └── utils/
│   │
│   ├── cocos/
│   ├── exports/
│   ├── pal/
│   └── predefine.ts
│
├── test/
│   ├── smoke/
│   └── unit/
│
├── tools/
│   ├── build/
│   ├── upstream/
│   ├── analyze/
│   └── verify/
│
├── LICENSE
├── README.md
├── UPSTREAM.md
├── package.json
└── tsconfig.json
```

目录职责：

```text
src/       Runtime Source
build/     Distribution
examples/  可运行示例
test/      自动验证
tools/     开发期工具
docs/      分析和设计文档
```

Engine Extraction 暂不采用：

```text
packages/
workspace
monorepo
```

---

# 7. Phase 0 — Baseline

## Task 0.1 当前源码状态记录

记录：

```text
Branch
SHA
git status
Node
npm
OS
```

输出：

```text
docs/foundation/00-upstream-baseline.md
```

---

## Task 0.2 找到当前 Web Build

不要沿用旧计划里的命令名称。

直接分析当前源码：

```text
package.json
scripts/
cc.config.*
tsconfig*
```

找出当前真实：

```text
Web/H5 build command
Build entry
Build config
Feature config
Output
```

---

## Task 0.3 原始 cocos4 Web baseline

使用当前仓库自身流程完成一次 Web build。

记录：

```text
Command
Duration
Input
Output
Warnings
Errors
```

确保 baseline 本身可用。

如果 baseline 原本就失败：

```text
先记录为 Upstream Baseline Failure
```

不要为了 Air 顺手修改上游。

---

# 8. Phase 1 — Web Feature Set 分析

目标：

> 搞清楚 Web Build 到底开启了哪些 Engine Feature。

分析：

```text
HTML5
NATIVE
MINIGAME
DEBUG
DEV
EDITOR
PREVIEW
TEST
```

以及当前配置系统中：

```text
features
modules
moduleOverrides
constants
```

输出：

```text
docs/foundation/01-web-feature-set.md
```

至少包含：

| Feature | Web | Air Engine Extraction |
|---|---:|---:|
| Core | Yes | Yes |
| Scene | Yes | Yes |
| 3D | Yes | Yes |
| Animation | Yes | Yes |
| Skinning | Yes | Yes |
| Web PAL | Yes | Yes |
| Native | No | No |
| JSB | No | No |
| MiniGame | No | No |

不要人工假设 feature。

以真实 build config 为准。

---

# 9. Phase 2 — Web Dependency Graph

这是 Extraction 最重要的一步。

## Task 2.1 找 Web Entry

找到：

```text
Engine Entry
Exports Entry
H5 Entry
```

---

## Task 2.2 递归分析 import

覆盖：

```text
import
export ... from
dynamic import
module override
virtual module
alias
```

生成机器可读：

```text
docs/web-dependency-graph.json
```

节点建议：

```json
{
  "path": "cocos/core/index.ts",
  "type": "COMMON_REQUIRED",
  "dependencies": []
}
```

---

## Task 2.3 文件分类

所有候选源码分为：

```text
WEB_REQUIRED
COMMON_REQUIRED
NATIVE_ONLY
EDITOR_ONLY
MINIGAME_ONLY
UNUSED_IN_AIR_V01
```

目标：

> 不允许因为“感觉应该没用”而删除源码。

---

# 10. Phase 3 — Extraction Manifest

不要一开始直接 copy。

先生成：

```text
docs/extraction-manifest.json
```

示例：

```json
{
  "source": "cocos/core/math",
  "destination": "src/cocos/core/math",
  "category": "COMMON_REQUIRED"
}
```

Manifest 成为：

```text
Extraction Source of Truth
```

---

## Task 3.1 upstream file mapping

同时生成：

```text
docs/upstream-file-map.json
```

记录：

```text
Air Path
Upstream Path
Baseline SHA
Modified
Reason
```

这样以后才能做 upstream sync。

---

# 11. Phase 4 — 创建 cocosair.js

基于 Manifest 构造：

```text
src/
```

先保持原相对目录。

不要第一轮就：

```text
移动大量文件
rename namespaces
重组模块
```

原则：

```text
Minimize Diff From Upstream
```

这对以后跟进 cocos4 很重要。

---

# 12. Phase 5 — Native / Editor 物理边界

完成 Web Source Closure 后再处理。

最终仓库禁止存在完整：

```text
native/
editor/
```

但如果：

```text
某 common TS 文件内存在 NATIVE branch
```

第一版允许保留。

目标不是：

```text
源代码里完全没有 NATIVE 字符串
```

而是：

```text
Runtime Dependency Graph 不进入 Native implementation
```

---

# 13. Phase 6 — Build System Extraction

第一版优先复用 cocos4 当前 Web builder。

目标：

```bash
npm run build
```

产生：

```text
build/cocosair.module.js
```

以及：

```bash
npm run build:min
```

产生：

```text
build/cocosair.module.min.js
```

---

## 6.1 只保留 Web 必需工具

把需要的 build tooling 放入：

```text
tools/build/
```

不要把 cocos4 全部脚本复制过来。

---

## 6.2 去掉 Native install/build

最终：

```bash
npm install
```

不能触发：

```text
CMake
native external
native pack tool
Android
iOS
JNI
```

---

# 14. Phase 7 — TypeScript 独立编译

必须建立：

```bash
npm run typecheck
```

目标：

```text
0 TypeScript Errors
```

这里的意义很重要：

> Cocos Air 源码已经不再依赖 Creator 提供隐藏的 TypeScript 环境。

---

# 15. Phase 8 — Web-only Guard

建立：

```text
tools/verify/verify-web-only.*
```

检测：

```text
Import Graph
Build Graph
Bundled Modules
```

阻止：

```text
native/
jsb
Android-only
iOS-only
Metal-only
D3D-native
```

真正进入 Web Runtime。

提供：

```bash
npm run verify:web-only
```

注意：

```text
grep "NATIVE"
```

不能作为判据。

判断依据必须是：

```text
Dependency / Build Reachability
```

---

# 16. Phase 9 — Air Bootstrap

加入：

```text
src/air/
```

第一版保持极薄。

目标：

```ts
const app = await createAirApp({
    canvas,
});

app.run(scene);
```

内部负责：

```text
game init
device init
renderer init
director init
main loop
```

复用前期已经验证成功的启动逻辑。

---

## API 第一版

```ts
export interface AirAppOptions {
    canvas: HTMLCanvasElement;
}

export interface AirApp {
    run(scene: Scene): void;
}

export async function createAirApp(
    options: AirAppOptions
): Promise<AirApp>;
```

不要扩大。

---

# 17. Phase 10 — Public Entry

目标用户最终能够：

```ts
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
} from 'cocosair';
```

第一版可以通过统一：

```text
src/index.ts
```

re-export。

不要重新包装：

```text
Scene
Node
Material
MeshRenderer
```

这些继续使用原 Cocos 类型。

---

# 18. Phase 11 — hello-cube

建立：

```text
examples/hello-cube/
```

必须做到：

```bash
npm run dev
```

浏览器直接出现：

```text
Camera
Light
Cube
Rotation
```

不需要：

```text
Creator
.scene
Prefab
Inspector
```

这是第一个正式 Air Demo。

---

# 19. Phase 12 — Engine Development Loop

这是 Cocos AIR 很关键的能力。

第一版允许：

```text
修改 Engine TS
↓
engine rebuild
↓
browser reload
```

目标命令：

```bash
npm run dev
```

同时启动：

```text
Engine Watch
+
Example Dev Server
```

---

## 第一阶段不强求 HMR

Engine 内部状态复杂。

Engine Extraction 接受：

```text
Full Page Reload
```

只要反馈链：

```text
TS 修改
→ 自动 build
→ browser reload
```

足够稳定即可。

---

# 20. Phase 13 — Static Model 回归

建立：

```text
examples/static-model/
```

复用前期测试资产。

验证：

```text
resources.load
Mesh
Material
Texture
MeshRenderer
```

重点确认 Extraction 没破坏：

```text
Asset Dependency
Material Effect
Texture Reference
```

---

# 21. Phase 14 — Skinned Animation 回归

建立：

```text
examples/skinned-animation/
```

复用前期已经证明可行的 Code First 实现。

必须覆盖：

```text
Skeleton.joints
Skeleton.bindposes
37 joint hierarchy
Rest pose reconstruction
SkinnedMeshRenderer
AnimationClip
Material
Texture
```

这是 Engine Extraction 最重要的复杂场景验收。

如果：

```text
hello-cube PASS
```

但：

```text
skinned-animation FAIL
```

不能认为 Extraction 完成。

---

# 22. Phase 15 — Cocos AIR Utilities

前期识别出的四个 DX Candidate 可以进入：

```text
src/air/utils/
```

包括：

```text
loadAssetAsync()
buildSkeletonTree()
restoreBindPose()
frameObject()
```

但必须满足：

```text
只是 helper
不修改 Engine abstraction
不重复封装 Node / Scene / Material
```

---

# 23. Phase 16 — Test

Engine Extraction 不建立巨型测试体系。

最低要求：

```text
test/
├── smoke/
│   ├── bootstrap
│   ├── scene
│   ├── render
│   └── skinning
│
└── unit/
```

必须覆盖：

### Smoke 1

```text
createAirApp
```

### Smoke 2

```text
Scene → Camera → Render
```

### Smoke 3

```text
Runtime Asset Load
```

### Smoke 4

```text
Skeleton → Skinning → Animation
```

---

# 24. Phase 17 — 与 cocos4 baseline 对比

同一资产分别运行：

```text
cocos4 Web
vs
Cocos AIR
```

比较：

```text
Scene Graph
World Transform
Mesh
Material
Texture
Skeleton
Animation
Rendering Result
```

不要求：

```text
pixel perfect
```

但关键行为必须一致。

---

# 25. Phase 18 — 第二轮裁剪

只有以下全部通过：

```text
build
typecheck
hello-cube
static-model
skinned-animation
```

之后，才进行第二轮 cleanup。

删除：

```text
Web graph 不可达代码
Native-only tooling
Unused adapters
Editor-only utilities
MiniGame-only platform
```

每次删除必须重新：

```bash
npm run typecheck
npm run build
npm run verify:web-only
npm test
```

---

# 26. Phase 19 — License / Third Party

新仓库准备公开前必须执行：

```text
Source License Audit
Third Party Notice Audit
Copyright Header Preservation
```

不修改上游版权头。

生成：

```text
THIRD_PARTY_LICENSES
```

或者等价文件。

这一步不影响前期 POC，但进入公开 GitHub 仓库前必须完成。

---

# 27. 根目录命令目标

最终：

```bash
npm install
npm run dev
npm run build
npm run build:min
npm run typecheck
npm run verify:web-only
npm test
```

其中：

```text
dev
  Engine watch + Example server

build
  Development ESM build

build:min
  Production ESM build

typecheck
  TypeScript validation

verify:web-only
  Platform dependency validation

test
  Smoke + necessary unit tests
```

---

# 28. Build Output

参考 three.js，第一版优先 ESM：

```text
build/
├── cocosair.module.js
└── cocosair.module.min.js
```

暂时不做：

```text
UMD
AMD
CommonJS
```

除非后续有明确需求。

---

# 29. Engine Extraction 能力边界

Cocos AIR Engine Extraction 应至少保留：

```text
Core
Math
Scene Graph
Component
Game / Director
Asset
GFX Web
Render Scene
Render Pipeline
Camera
Light
Mesh
Material
Texture
Animation
Skeleton
Skinning
Web Input
Web PAL
```

其它能力：

```text
Physics
Particle
UI
Audio
Terrain
2D
```

如果当前 Web Closure 自动包含：

```text
先保留
```

Engine Extraction 不为了减包体主动扩大裁剪风险。

---

# 30. 必须回答的问题

任务完成后必须回答：

### Q1

当前 cocos4 Web Engine Source Closure 有多大？

```text
File count
TS LOC
Modules
```

### Q2

最终删除了哪些平台和模块？

### Q3

是否存在原先认为 Native-only，实际上 Web 依赖的公共模块？

### Q4

Air 是否完全脱离 Creator Runtime？

目标：

```text
Yes
```

### Q5

Engine TS 是否可以直接：

```text
edit → build → browser
```

目标：

```text
Yes
```

### Q6

当前 Build System 中还有哪些 cocos4 历史包袱？

列出来，不要求 Engine Extraction 全部重写。

### Q7

Runtime Asset 是否保持兼容？

```text
Texture
Material
Mesh
Skeleton
Animation
```

目标：

```text
Yes
```

### Q8

是否存在 Missing Runtime Capability？

预期：

```text
No
```

如果存在必须给出证据。

---

# 31. 验收矩阵

| Level | 验收 | 必须 |
|---|---|---:|
| L0 | 当前 cocos4 Web baseline | Yes |
| L1 | Web Feature Set | Yes |
| L2 | Web Dependency Graph | Yes |
| L3 | Extraction Manifest | Yes |
| L4 | 独立 Air source tree | Yes |
| L5 | Native build dependency 清除 | Yes |
| L6 | `npm run typecheck` | Yes |
| L7 | `npm run build` | Yes |
| L8 | `verify:web-only` | Yes |
| L9 | Code First Bootstrap | Yes |
| L10 | hello-cube | Yes |
| L11 | Engine watch | Yes |
| L12 | static-model | Yes |
| L13 | skinned-animation | Yes |
| L14 | cocos4 baseline regression | Yes |

---

# 32. Definition of Done

只有以下全部成立才能标记：

```text
Cocos Air Engine Extraction DONE
```

条件：

```text
1. 独立 cocosair.js repo

2. 基线 SHA 有完整记录

3. repo 使用：
   src/
   build/
   examples/
   test/
   tools/
   docs/

4. 无完整 native engine

5. 无 Creator Editor Runtime

6. npm install 不执行 Native Build

7. TypeScript 独立编译通过

8. Web Engine 独立 Build 成功

9. Web-only dependency guard 通过

10. Code First bootstrap 正常

11. hello-cube 正常

12. static-model 正常

13. skinned-animation 正常

14. Engine TS 修改无需 Creator Compile Engine

15. npm run dev 可以形成完整开发闭环

16. 无需安装 Cocos Creator 即可运行 Web Engine
```

---

# 33. 推荐实际执行顺序

```text
01 记录当前 cocos4 baseline
        ↓
02 找当前 Web Build Entry
        ↓
03 跑原始 Web baseline
        ↓
04 分析 Web Feature Set
        ↓
05 构建 Dependency Graph
        ↓
06 生成 Extraction Manifest
        ↓
07 生成 Upstream File Map
        ↓
08 创建 cocosair.js
        ↓
09 按 Manifest 提取源码
        ↓
10 迁移 Web Build Tool
        ↓
11 清理 Native install/build
        ↓
12 Typecheck
        ↓
13 Build
        ↓
14 verify:web-only
        ↓
15 Air Bootstrap
        ↓
16 hello-cube
        ↓
17 Engine watch
        ↓
18 static-model
        ↓
19 skinned-animation
        ↓
20 cocos4 baseline regression
        ↓
21 第二轮源码清理
        ↓
22 License audit
        ↓
23 README
        ↓
24 Engine Extraction RC
```

---

# 34. Deviations 记录要求

实施过程中如果必须偏离本计划，只记录：

```text
Deviation:
原因
证据
影响
处理
```

例如：

```text
Deviation:
Web renderer imports a shared platform module containing Native branches.

Reason:
Module belongs to COMMON_REQUIRED dependency closure.

Impact:
Source tree contains NATIVE conditional code, but build graph does not reach Native implementation.

Action:
Keep shared module in Engine Extraction; rely on platform constants/tree-shaking.
```

不要为了保持目录“看起来纯净”扩大重构。

---

# 35. Engine Extraction 成功后的产品形态

最终项目：

```text
                  cocosair.js

                     main.ts
                        │
                        ▼
                Cocos AIR API
                        │
                 createAirApp
                        │
                        ▼
                 Cocos TS Engine
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      Scene          Animation         Asset
        │               │                │
        └───────────────┼────────────────┘
                        │
                       GFX
                        │
                     WebGL
                        │
                     Browser
```

开发链：

```text
Engine TS
   ↓
save
   ↓
automatic rebuild
   ↓
browser reload
   ↓
result
```

这就是 Engine Extraction 真正需要建立起来的基础。

---

# 36. Code First DX 暂定方向

Engine Extraction 完成后再考虑：

```text
更好的 Code First DX
Promise Asset API
更完整 Camera / Scene helper
更快 Incremental Build
Console capture
Screenshot automation
Agent-friendly examples
```

Asset Importer 独立化继续放后面。

不要在 Engine Extraction 同时解决。
