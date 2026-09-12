# Cocos AIR (cocosair.js)

**Cocos Agent-first Interactive Runtime** — 基于 cocos4 的纯 TypeScript Web 引擎，
脱离 Cocos Creator、Editor 与 Native Engine 的 **Code First** Web 运行时。

> **V0.1 RC**（2026-09-12）：验收矩阵 L0–L14 全部通过，详见 `docs/acceptance-report.md`。
> **V0.2 RC**（2026-09-12）：Code First DX & SDK 化，验收矩阵 L0–L17 全部通过，详见 `docs/acceptance-report-v02.md`。
> **V0.3**（2026-09-12）：完成 V0.2 审查修复、资源 Inspect/Validate、多实例生命周期和独立静态验证，见 [验证记录](docs/11-v03-verification.md)。V0.2 原增量/helper 验收的更正也记录于此。

```bash
npm install
npm run dev          # 三频道 Watch（engine/air/example）+ Example Server + 自动刷新
```

## Quick Start

最小 Code First 模板见 `examples/starter/`：

```ts
import { createAirApp, Scene } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' }); // 支持 selector 字符串或元素
app.run(new Scene('Main'));
app.getScene(); // → Scene | null
```

Promise 资产加载：

```ts
import { loadAssetAsync, Mesh } from 'cocosair';

assetManager.assets.add('models/box', utils.createMesh(primitives.box({})));
const mesh = await loadAssetAsync('models/box', Mesh);
```

骨骼工具集（V0.1 蒙皮链路正式化）：

```ts
import { buildSkeletonTree, restoreBindPose, frameObject } from 'cocosair';

const skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1']);
restoreBindPose(armature, skeleton); // 复位静止姿势
frameObject(camera, modelRoot);      // 包围盒自动取景
```

不需要 Creator、`.scene`、Prefab、Inspector 或任何编辑器资产管线。

## 仓库结构

```
cocosair.js/
├── build/          # 产物：cocosair.module.js / cocosair.module.min.js（ESM）
├── docs/           # 分析与设计文档（含验收报告与证据截图）
├── examples/       # 可运行示例
│   ├── hello-cube/          # Camera + Light + 旋转 Cube（Code First 入门）
│   ├── static-model/        # 运行时 JSON 资产加载 + 程序化纹理 + 标准材质
│   └── skinned-animation/   # 3 骨骼蒙皮 + 骨骼动画（Code First 骨骼链路）
├── src/            # 引擎源码（engine root，与上游 cocos4 相对布局一致）
│   ├── air/                 # Cocos AIR 新增：bootstrap/app/utils/builtin
│   ├── cocos/               # 引擎核心（Web 闭包：839/843 可达，实测精确闭包）
│   ├── exports/             # ccbuild feature unit 入口（air.ts 为 bundle 入口）
│   ├── pal/                 # 平台抽象层（Web 实现）
│   └── cc.config.json       # Air 引擎构建配置（由 tools/analyze/make-air-config 派生）
├── test/           # smoke tests（jsdom + HEADLESS 渲染模式）
└── tools/          # build / dev / analyze / verify / baseline
```

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 三频道 Watch：engine(src/cocos\|pal\|exports)/air(src/air) 自动重建，example 只刷新不构建；example .ts 即时编译 + importmap |
| `npm run build` | Development ESM 构建 → `build/cocosair.module.js`（附 source map） |
| `npm run build:min` | Production ESM 构建 → `build/cocosair.module.min.js` |
| `npm run build:dts` | 类型声明 → `build/cocosair.module.d.ts`（编辑器补全 / Go to Definition） |
| `npm run typecheck` | TypeScript 独立编译校验（0 依赖 Creator） |
| `npm run verify:web-only` | Web-only 依赖守卫（按依赖可达性判定，禁止 native/minigame 泄入） |
| `npm test` | smoke tests（jsdom + HEADLESS 渲染模式） |
| `npm run analyze` | 依赖图 / 抽取清单 / 文件映射再生成（docs/*.json） |
| `npm run baseline` | 上游 Web baseline 复现（验收 L0 证据） |

## 文档

- [资源集成与运行时检查](docs/10-v03-runtime-integration.md) — 资源关系、Code First 组装、Inspect/Validate、生命周期与静态复现
- [V0.2 审查与 V0.3 验收](docs/11-v03-verification.md) — 修复证据、验证矩阵与限制
- [直接加载 glTF / GLB](docs/gltf-runtime.md) — 运行时模型加载、PBR、骨骼动画与 Morph；完整示例见 `examples/gltf-viewer/`
- [官方模型目录与对照预览](docs/gltf-catalog.md) — 150 个官方模型、格式选择、AIR 预览与 Khronos Viewer 对照
- `docs/06-code-first-getting-started.md` — 最小入门（createAirApp / GameCanvas 约束）
- `docs/07-asset-loading.md` — Promise Asset Helper
- `docs/08-skinned-model.md` — 骨骼工具集（buildSkeletonTree / restoreBindPose / frameObject）
- `docs/09-engine-development.md` — dev server 三频道 / 错误可见性 / 诊断端点
- `docs/05-v02-build-performance.md` — 构建性能基线（只记录不优化）

## Air V0.1 能力边界

**保留**：Core/Math/Scene Graph/Component/Game/Director/Asset/GFX(WebGL2+WebGL1 回退)/
Render Scene/Render Pipeline/Camera/Light/Mesh/Material/Texture/Animation/Skeleton/Skinning/
primitive/tween/Web Input/Web PAL + builtin 材质与效果（Air 程序化注册，见 `src/air/builtin`）。

**不包含**：2D/UI、物理、Spine/DragonBones、音视频、地形、XR、WebGPU、MiniGame、Native。

## Code First 注意事项

- `#GameCanvas` 必须在引擎 import 前存在于 DOM（pal/screen-adapter 为模块顶层单例），
  参考 `examples/hello-cube/index.html` 的模板结构。
- Camera 组件需显式设置 `visibility = Layers.Enum.DEFAULT`（4.0-alpha 的默认值为 undefined）。
- builtin 材质/效果由 `src/air/builtin/register.ts` 程序化注册（无 Creator internal db）。
- `Skeleton.joints` 必须是**相对 skinningRoot 的完整路径**（`getChildByPath` 解析），
  层级骨骼写 `bone0/bone1` 而非 `bone1`，否则关节不会注册、蒙皮不变形。
- `skinned-animation` 示例（三关节蒙皮 + 骨骼动画）已实测通过，
  验证与修复记录见 `docs/acceptance-report.md` §7。

## 基线与上游

源码基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`，MIT 许可。
上游对应关系、抽取清单与修改记录见 `UPSTREAM.md`、`docs/upstream-file-map.json`、
`docs/extraction-manifest.json` 与 `docs/00-upstream-baseline.md`。

## 许可

MIT（见 LICENSE）。第三方许可见 THIRD_PARTY_LICENSES.md。
