# Cocos AIR (cocosair.js)

**Cocos Agent-first Interactive Runtime** — 基于 cocos4 的纯 TypeScript Web 引擎，
脱离 Cocos Creator、Editor 与 Native Engine 的 **Code First** Web 运行时。

浏览器运行要求 WebGL 2，支持边界见 [支持策略](docs/webgl2-only.md)。旧版验收快照与部分原始证据已清理；当前发布状态须重新运行门禁确认，见 [验证与发布检查](docs/reference/verification.md)。

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
│   ├── cocos/               # 引擎核心（r45g 现读：上游 Web scope 闭包 1299 文件里 1203 个同名落地，Air 侧共 1241，见 docs/UPSTREAM.md §9）
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
| `npm run verify:file-map` | 簿记一致性：每行上游可解析 + 逐字节比对 + `modified` 标记互证 + `moduleOverrides` 替换件清点（r43 起） |
| `npm run verify:licenses` | 上游/第三方许可头清点（抽取件不得丢版权头） |
| `npm run verify:browser-matrix` | 三引擎（chromium/firefox/webkit）逐例截图 + probe 断言矩阵 → 产物指针见 `docs/reference/verification.md`（证据目录未随 npm 包发布） |
| `npm run verify:wasm-backends` | wasm 三后端护栏（只读，A1–A7）：抽取闭包落盘 / 范围计数不漂移 / 字节偏差 ⊆ 在册 / emscripten 说明符只在动态分支 / feature 声明面对账 / **A6 = 类型豁免解禁触发器** / **A7 = 物理子树缺件必须登记在差集** |
| `npm run verify:custom-exports` | 后处理与 custom 管线交付面护栏（只读，C1–C5）：接线门面与子图逐字节 + 簿记在册 + feature unit 声明与默认发行姿态不漂移 |
| `npm run verify:doc-refs` | 文档互引棘轮（只读）：markdown 里的仓库内路径必须存在；历史断链 46 条登记在 `tools/verify/doc-refs-baseline.json`，新增断链或基线腐烂即红 |
| `npm run verify:benchmark` | 包体/加载基线回归（绑定当期 bundle sha256₁₆） |
| `npm run verify:api-coverage` | 逐 API 执行证明与 V1.1 正式 100%/90%/80% 覆盖门槛；`--check` 可只读核对报告是否对应当期库存、规格和证据 |
| `npm run verify:release` | 发布候选总门禁：干净工作树、覆盖率、示例数、V1.1/DevTools/Gallery/V1.2 证据与当前构建一致性 |
| `npm test` | smoke tests（jsdom + HEADLESS 渲染模式；当期数量以 `docs/test-inventory.json` 为准） |
| `npm run analyze` | 依赖图 / 抽取清单 / 文件映射再生成（docs/*.json） |
| `npm run baseline` | 上游 Web baseline 复现（验收 L0 证据） |

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

## 能力边界（V1.2）

**保留（在默认交付产物里）**：Core/Math/Scene Graph/Component/Game/Director/Asset/
**浏览器最低要求：WebGL 2。** WebGL 1 已正式退役；不可用时 `createAirApp()` 拒绝并携带 `WEBGL2_REQUIRED` 错误码，详见 [支持策略](docs/webgl2-only.md)。

GFX(WebGL2 required)/Render Scene/Render Pipeline/Camera/Light/Mesh/Material/Texture/
Animation/Skeleton/Skinning/primitive/tween/Web Input/Web PAL + builtin 材质与效果（Air 程序化注册，见 `src/air/builtin`）；
V1.x 回归期新增（**能力名**，逐名对账见下）：**2D/UI**（`2d` `ui` `mask` `graphics` `tiled-map` `particle-2d` `sorting`）、
**音频/视频/WebView**（`audio` `video` `webview`）、**物理**（3D `physics-builtin`；2D `physics-2d-box2d` / `physics-2d-builtin`）、
**骨骼动画资产**（`spine` `dragon-bones`）、`profiler`、`custom-pipeline`、`geometry-renderer`、`intersection-2d`。

**⚠️ r45g 现读：上面括号里是「能力名」，不逐条等同于 `src/cc.config.json` 的 feature unit 名。**三个面要分开讲，混了就会读到相反结论：

- **上面括号里已声明、且在默认构建集的 unit**：`2d` `ui` `tiled-map` `particle-2d` `video` `webview` `profiler` `custom-pipeline` `physics-builtin` `physics-2d-box2d` `physics-2d-framework` `dragon-bones` `spine-3.8` `spine-4.2` `custom-pipeline-post-process`（默认集共 **26** 项，全表见 `docs/reference/web-features.md` §7.2）。
- **已声明但不在默认集**：`audio` `physics-2d-builtin` `physics-ammo` `physics-physx` `physics-2d-box2d-wasm` `physics-cannon` `marionette` `procedural-animation`（共 8 项，逐条理由见 `docs/reference/web-features.md` §7.3）。
- **不是 Air 声明的 feature unit，但能力确在默认产物里**：`mask` `graphics` `sorting` `intersection-2d` `geometry-renderer` `spine`（真实 unit 名是 `spine-3.8`/`spine-4.2`）`physics-framework`。机制：`src/exports/air.ts` 把它们**静态再导出**（`export * from` 一行一个）挂进 bundle 入口，走的是 **import 图**而不是 feature 开关（`src/exports/` 39 个文件里 **9** 个的名字未在册 unit：`geometry-renderer` `gfx-webgpu` `graphics` `intersection-2d` `mask` `physics-framework` `sorting` `sorting-2d` `spine`；其中 `gfx-webgpu.ts` **没有**被 `air.ts` 聚合，其余 8 个是）。
  产物侧核对（整词计数，`build/cocosair.module.js`）：`Graphics` 19、`Mask` 14、`Sorting2D` 4、`GeometryRenderer` 10、`PhysicsSystem` 33、`PhysicsSystem2D` 30、`AudioSource` 11、`TiledMap` 5、`UIRenderer` 31 ⇒ 「产物里有这个能力」为真；「它是可关掉的 feature unit」为假。
  ⇒ 讲**开关面 / 变体构建**必须用 §7 的 unit 名；讲**发行产物含什么**才用上面的能力名。自查（仓库内只读门禁）：`npm run verify:feature-exports` —— D2 打印「入口文件名不是已声明 unit」的集合，D3 打印被 `air.ts` 聚合的那批，D4 是**默认产物组成锁**（在册能力符号整词命中 ≥1 + 非默认后端的世界类整词命中 == 0），D5 逐个复核上面每个能力名的依据还在不在。

入口面实测（r45g 现读，两个独立事实源交叉）：`src/exports/` **39** 个 feature 入口文件；`src/cc.config.json` 声明 **34** 个 feature unit（上游 55、缺 **22**、`airOnly=[air]`）；默认构建集 **26** 项。
交叉源：`npm run verify:feature-exports` 的 D1 臂与 `npm run verify:wasm-backends` 的 A4/A5 两臂 —— 同一对面、两个独立实现，现读一致。逐名分组见 `docs/reference/web-features.md` §7；复跑命令与历史增量见 `docs/UPSTREAM.md` §9.1。
（本段替换掉的是 r43 期口径「31 个 unit / 共有 30 / onlyUpstream 25 / 36 个入口」——批次 D-4/G-3 并入 3 个物理 unit 与 3 个入口文件后未随轮刷新，登记为 **F-130**。）

**不包含 / 有条件（每条都有决策点，未确认前不自行豁免）**：

- **D9 待批复 13 项**：地形 `cocos/terrain/**`（5 文件）、3D 粒子（`cocos/particle/animator/optimized-curve.ts` + `exports/particle.ts`）、
  `exports/xr.ts`、`exports/light-probe.ts`、4 个 convenience 门面（`affine-transform`/`rich-text`/`ui-skew`/`vendor-google`）
  ⇒ 逐条理由与纳入成本见 `docs/reference/scope-decisions.md`（同文档里那 1 项零引用上游桩已在 r43 实测结案）。
- **WebGPU（D10）**：`cocos/gfx/webgpu/**` 26 个文件已逐字节入仓，但 feature unit **不登记**、子图移出类型核对与声明图
  ——登记即造成「`cc.d.ts` 里有 `WebGPUDevice` 类型、产物里没有符号」。
- **物理后端（D3/R8、D12）**：bullet/physx 与 box2d-wasm 依赖官方 wasm/原生扩展资产，不随快照分发（LV12-14 / LV12-16 blocked）；
  `physics-cannon` 目前只能以构建期变体存在（`AIR_FEATURES`），交付期可切换是 D12。
- **MiniGame / Native(`*.jsb.ts`) / Editor-only**：平台性排除，实测 82 个上游文件，每条带引用者证据（不是按文件名猜）。
- **Spine（D2）**：`exports/spine.ts` 走官方 js 运行时路径（`lib/spine-core.js` 已随目录抽取，含 LICENSE；运行时 instantiate 由 `air-spine-instantiate-js` 顶替，已登记为偏差），
  **wasm 变体资产未部署** = 决策点 D2 ⇒ 计划里的 `spine-3.8`/`spine-4.2` 示例（LV12-10）因此仍未交付。

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

MIT（见 LICENSE）。第三方许可见 [docs/THIRD_PARTY_LICENSES.md](docs/THIRD_PARTY_LICENSES.md)。
