# Cocos AIR (cocosair.js)

**Cocos Agent-first Interactive Runtime** — 基于 cocos4 的纯 TypeScript Web 引擎，
脱离 Cocos Creator、Editor 与 Native Engine 的 **Code First** Web 运行时。

浏览器运行要求 WebGL 2，支持边界见 [支持策略](docs/webgl2-only.md)。当前发布状态由对应候选的完整验收证据与许可门禁决定，见 [验证与发布检查](docs/reference/verification.md)。

```bash
npm install
npm run build        # 生成开发 bundle
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

骨骼与取景工具：

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
│   ├── cocos/               # 抽取的 Cocos 引擎核心；来源与有意差异见 docs/UPSTREAM.md
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
| `npm run build:min` | 压缩 ESM 本地构建 → `build/cocosair.module.min.js`（附 source map） |
| `npm run build:dts` | 类型声明 → `build/cocosair.module.d.ts`（编辑器补全 / Go to Definition） |
| `npm run build:all` | 以上全量构建，并生成 npm 专用的 `build/npm/` bundle 副本（不含 source map）；本地 `build/cocosair.module*.js.map` 保留调试用途 |
| `npm run typecheck` | TypeScript 独立编译校验（0 依赖 Creator） |
| `npm run verify:web-only` | Web-only 依赖守卫（按依赖可达性判定，禁止 native/minigame 泄入） |
| `npm run verify:file-map` | 簿记一致性：每行上游可解析 + 逐字节比对 + `modified` 标记互证 + `moduleOverrides` 替换件清点 |
| `npm run verify:licenses` | 上游/第三方许可头清点（抽取件不得丢版权头） |
| `npm run verify:browser-matrix` | 三引擎（chromium/firefox/webkit）逐例截图 + probe 断言矩阵 → 产物指针见 `docs/reference/verification.md`（证据目录未随 npm 包发布） |
| `npm run verify:wasm-backends` | wasm 三后端护栏（只读，A1–A7）：抽取闭包落盘 / 范围计数不漂移 / 字节偏差 ⊆ 在册 / emscripten 说明符只在动态分支 / feature 声明面对账 / **A6 = 类型豁免解禁触发器** / **A7 = 物理子树缺件必须登记在差集** |
| `npm run verify:custom-exports` | 后处理与 custom 管线交付面护栏（只读，C1–C5）：接线门面与子图逐字节 + 簿记在册 + feature unit 声明与默认发行姿态不漂移 |
| `npm run verify:doc-refs` | 文档互引棘轮（只读）：markdown 里的仓库内路径必须存在；已知断链登记在 `tools/verify/doc-refs-baseline.json`，新增断链或基线腐烂即红 |
| `npm run verify:benchmark` | Benchmark 工具类型检查、编译诊断、指标聚合及隔离/超时回归；不生成性能成绩 |
| `npm run verify:api-coverage` | 逐 API 执行证明与发布覆盖门槛（Core 100% / Important 90% / Advanced 80%）；`--check` 可只读核对报告是否对应当期库存、规格和证据 |
| `npm run verify:release` | 发布候选总门禁：干净工作树、覆盖率、示例数、许可、示例/DevTools/Gallery/三浏览器证据与当前构建一致性 |
| `npm test` | smoke tests（jsdom + HEADLESS 渲染模式；当期数量以 `docs/test-inventory.json` 为准） |
| `npm run analyze` | 更新 docs 中的抽取清单与文件映射，依赖图写入 build/reports/ |
| `npm run baseline` | 在上游引擎目录复现 Web 基线构建；前置条件见 AGENTS.md |

## 文档

- [文档导航](docs/README.md) — 目录与主题入口
- [开发手册](docs/manual/index.md) — API 教程与可运行示例
- [Code First 入门](docs/guides/code-first.md) — 启动与画布约定
- [资源加载](docs/guides/asset-loading.md) · [骨骼工具](docs/guides/skinned-model.md) · [开发循环](docs/guides/engine-development.md)
- [运行时资源检查](docs/guides/runtime-inspection.md) · [Agent 调试会话](docs/guides/agent-development.md)
- [glTF / GLB 加载](docs/gltf/gltf-runtime.md) · [扩展参考](docs/gltf/gltf-extension-reference.md) · [解码器部署](docs/gltf/gltf-decoder-deployment.md)
- [官方模型目录与对照预览](docs/gltf/gltf-catalog.md)
- [功能范围](docs/reference/web-features.md) · [验证与发布检查](docs/reference/verification.md)
- [上游差异](docs/UPSTREAM.md) · [第三方许可](docs/THIRD_PARTY_LICENSES.md)

## 能力与支持边界

浏览器渲染要求 **WebGL 2**。WebGL 1 不受支持；WebGL 2 初始化失败时，`createAirApp()` 拒绝并携带 `WEBGL2_REQUIRED` 错误码。显式 HEADLESS 用于测试，不产生浏览器画面。详见 [浏览器支持策略](docs/webgl2-only.md)。

### 默认运行时

| 能力 | 当前范围 |
|---|---|
| 场景与渲染 | Core/Math、Scene Graph、Component、Game/Director、Camera/Light、Mesh/Material/Texture、WebGL 2、渲染管线与程序化 builtin 材质/效果。 |
| 动画与模型 | Animation、Skeleton/Skinning、primitive、tween、glTF/GLB 加载及已登记扩展。压缩与纹理转码需应用配置 decoder，详见 [模型加载](docs/gltf/gltf-runtime.md)。 |
| 2D 与 UI | 2D/UI、Mask、Graphics、Sorting2D、TiledMap、2D Particle。 |
| 浏览器交互与媒体 | Web Input、Web PAL、AudioSource、VideoPlayer、WebView。 |
| 物理 | 2D 默认为纯 JS Box2D；3D 同时包含 builtin 与 Cannon。builtin 提供离散碰撞检测，Cannon 提供刚体模拟；初始化前用 `createAirApp({ physics: 'cannon' })` 选择，默认仍为 builtin。 |
| 其他模块 | DragonBones、Profiler、GeometryRenderer、intersection-2d、custom pipeline / post-process 导出。具体渲染效果以相应示例与浏览器验证为准。 |

### 构建开关与聚合导出

能力名称、feature unit 和公开导出不是同一张清单。当前 `src/cc.config.json` 声明 **33** 个 feature，默认构建选择 **26** 个；以该配置和 `tools/build/build.cjs` 为准。

- `audio` 虽未列入默认 feature 选择，但由 `src/exports/air.ts` 静态聚合，音频能力已在默认 bundle 中。
- `mask`、`graphics`、`sorting`、`intersection-2d`、`geometry-renderer`、`spine`、`physics-framework` 等能力由聚合入口导出，不能仅按同名 feature 开关判断是否包含。
- 已声明但未选择的 feature 为 `audio`、`physics-2d-builtin`、`physics-ammo`、`physics-physx`、`physics-2d-box2d-wasm`、`marionette`、`procedural-animation`。构建变体使用 `AIR_FEATURES`，仍需验证完整依赖和运行资产。

可用 `npm run verify:feature-exports` 核对声明、聚合入口和默认产物组成；详细范围见 [功能范围](docs/reference/web-features.md)。源码或类型存在，只能证明相应代码已抽取，不能代替实际运行验证。

### 不包含或需要额外资产

- **WebGPU**：源码保留用于上游追溯，未纳入默认运行时及公开 SDK 后端。
- **WASM 物理后端**：bullet/physx、Box2D WASM 的外部 JS/WASM 资产未随包提供，不属于当前可直接使用的后端。见 [资产来源记录](docs/notes/physics-asset-sourcing.md)。
- **Spine**：组件、类型及适配代码存在，但基线的完整运行时依赖尚未部署的外部资产；不能据此宣称 Spine 动画运行已验收。见 [Spine 资产来源](docs/notes/spine-asset-sourcing.md)。
- **Draco 浏览器解码**：adapter 支持注入 provider；随包入口为 Node/CommonJS 形态，浏览器 factory 由应用另行提供。见 [decoder 部署边界](docs/gltf/gltf-decoder-deployment.md)。
- **地形、3D 粒子、XR、Light Probe 等范围项**：不属于当前默认支持面，具体排除与待扩展范围见 [范围记录](docs/reference/scope-decisions.md)。
- **MiniGame、Native/JSB、Creator Editor**：不属于 Web 运行时依赖闭包。

## Code First 注意事项

- `#GameCanvas` 必须在引擎 import 前存在于 DOM（pal/screen-adapter 为模块顶层单例），
  参考 `examples/hello-cube/index.html` 的模板结构。
- Camera 组件需显式设置 `visibility = Layers.Enum.DEFAULT`（4.0-alpha 的默认值为 undefined）。
- builtin 材质/效果由 `src/air/builtin/register.ts` 程序化注册（无 Creator internal db）。
- `Skeleton.joints` 必须是**相对 skinningRoot 的完整路径**（`getChildByPath` 解析），
  层级骨骼写 `bone0/bone1` 而非 `bone1`，否则关节不会注册、蒙皮不变形。
- 三关节蒙皮与骨骼动画用法见 `examples/skinned-animation/`，工具说明见 [骨骼工具](docs/guides/skinned-model.md)。

## 基线与上游

源码基线与有意差异见 [UPSTREAM.md](docs/UPSTREAM.md)。文件对应关系由 `docs/upstream-file-map.json` 和 `docs/extraction-manifest.json` 登记；当前对比可以运行 `node tools/compare/baseline-compare.cjs` 重新生成 build/reports/baseline-compare.json。

## 许可

本项目自有代码使用 MIT（见 LICENSE），内嵌第三方代码分别遵循其许可。
默认 bundle 包含 Spine 相关代码，使用与再分发须满足随包的 Spine Runtimes License Agreement 及其引用的 Spine Editor 授权条件；不能将整个 bundle 视为仅受 MIT 约束。
PAL 已改由公开、带 MIT 许可的 cocos4 固定源码生成，旧 `@cocos/engine-pal` 包不再使用。许可及版权 notice 随包提供，完整来源登记见 [第三方许可](docs/THIRD_PARTY_LICENSES.md)。
