# Cocos AIR (cocosair.js)

**Cocos Agent-first Interactive Runtime** — 基于 cocos4 的纯 TypeScript Web 引擎，
脱离 Cocos Creator、Editor 与 Native Engine 的 **Code First** Web 运行时。

> **V0.1 RC**（2026-09-12）：验收矩阵 L0–L14 全部通过，详见 `docs/acceptance-report.md`。
> **V0.2 RC**（2026-09-12）：Code First DX & SDK 化，验收矩阵 L0–L17 全部通过，详见 `docs/acceptance-report-v02.md`。
> **V0.3**（2026-09-12）：完成 V0.2 审查修复、资源 Inspect/Validate、多实例生命周期和独立静态验证，见 [验证记录](docs/11-v03-verification.md)。V0.2 原增量/helper 验收的更正也记录于此。
> **V1.1**：57 个示例全部带冻结规格与证据链（当期 52 例全量浏览器验证 52/52 PASS、`unproven 0`；逐例证据 JSON 在仓库内证据目录，未随 npm 包发布），口径与陷阱见 `docs/v11-baseline.md`、`docs/v11-example-specs.md`。
> **V1.2 特性回归（r46 批复结案口径，2026-09-24）**：16 组上游能力逐组回归，逐组状态见 `docs/v12-upstream-regression.md` §3；
> 门禁读数与部分通过项见 `docs/acceptance-report-v12.md`。资产缺口档（spine / bullet / physx / box2d-wasm / webgpu-glslang）
> 与 D9 残留 14 项均已按批复口径结案（`UPSTREAM.md` Deviation-04/05/06）；交付期物理后端切换：
> `createAirApp({ physics: 'builtin' | 'cannon' })`（默认 builtin，additive 登记 `docs/v08-api-stability.md`）。
> **发布面 provenance**：文中盘符绝对路径（取证 scratch / 上游快照 / benchmark 目录）不随 npm 包发布、不保证可复现；
> 可复现判据一律以仓库内 `npm run verify:*` 系列门禁为准（F-130 / owner-decisions #17(a)）。
> 版本号仍标 `0.1.0`（`package.json` / `AIR_VERSION`）——改它属于发行决策，未获授权前不动。

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
│   ├── cocos/               # 引擎核心（r45g 现读：上游 Web scope 闭包 1299 文件里 1203 个同名落地，Air 侧共 1241，见 docs/17-baseline-comparison.md §9）
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
| `npm run verify:file-map` | 簿记一致性：每行上游可解析 + 逐字节比对 + `modified` 标记互证 + `moduleOverrides` 替换件清点（r43 起） |
| `npm run verify:licenses` | 上游/第三方许可头清点（抽取件不得丢版权头） |
| `npm run verify:v12-matrix` | 三引擎（chromium/firefox/webkit）逐例截图 + probe 断言矩阵 → 产物指针见 `docs/acceptance-report-v12.md`（证据目录未随 npm 包发布） |
| `npm run verify:v12-backends` | wasm 三后端护栏（只读，A1–A7）：抽取闭包落盘 / 范围计数不漂移 / 字节偏差 ⊆ 在册 / emscripten 说明符只在动态分支 / feature 声明面对账 / **A6 = 类型豁免解禁触发器** / **A7 = 物理子树缺件必须登记在差集** |
| `npm run verify:v12-custom-face` | 后处理与 custom 管线交付面护栏（只读，C1–C5）：接线门面与子图逐字节 + 簿记在册 + feature unit 声明与默认发行姿态不漂移 |
| `npm run verify:doc-refs` | 文档互引棘轮（只读）：markdown 里的仓库内路径必须存在；历史断链 46 条登记在 `tools/v12/doc-refs-baseline.json`，新增断链或基线腐烂即红 |
| `npm run verify:benchmark` | 包体/加载基线回归（绑定当期 bundle sha256₁₆） |
| `npm run verify:api-coverage` | 顶层 API 面覆盖报告（V1.1 遗留口径，当前 **FAIL**，见验收报告 §2 第 10 条） |
| `npm test` | smoke tests（jsdom + HEADLESS 渲染模式，32 suites / 261 tests） |
| `npm run analyze` | 依赖图 / 抽取清单 / 文件映射再生成（docs/*.json） |
| `npm run baseline` | 上游 Web baseline 复现（验收 L0 证据） |

## 文档

- [Cocos AIR 开发手册](docs/manual/index.md) — 对齐 three.js manual 的 60 篇条目与状态、57 个零外部资产可运行示例（23 类，见 `examples/files.json`）、能力边界总说明
- [V1.2 特性回归总账](docs/v12-upstream-regression.md) — 16 组逐组状态（verified / 部分交付 / blocked）与护栏现状
- [V1.2 验收报告](docs/acceptance-report-v12.md) — 门禁逐条现读（含仍 FAIL 项）、证据指针、未达项归因
- [V1.2 范围外残留差集分类](docs/v12-d9-residual-triage.md) — 14 项逐条理由 + 纳入成本 + 可复跑判据（D9 提案，待批复）
- [基线对比与闭包口径](docs/17-baseline-comparison.md) §9 — Air vs 官方的文件面/产物面/变体构建面对比
- [资源集成与运行时检查](docs/10-v03-runtime-integration.md) — 资源关系、Code First 组装、Inspect/Validate、生命周期与静态复现
- [V0.2 审查与 V0.3 验收](docs/11-v03-verification.md) — 修复证据、验证矩阵与限制
- [直接加载 glTF / GLB](docs/gltf-runtime.md) — 运行时模型加载、PBR、骨骼动画与 Morph；完整示例见 `examples/gltf-viewer/`
- [V0.5 验收与 V0.5.1 移交](docs/acceptance-v0.5.md) — 扩展支持矩阵、Gate 证据链、已知限制与消费合同
- [glTF 扩展参考](docs/gltf-extension-reference.md) — 逐扩展实现映射、通道语义、错误码与限制
- [glTF decoder 部署](docs/gltf-decoder-deployment.md) — 注入 API、MIME/CORS/缓存/worker、离线验收
- [glTF 验证记录](docs/gltf-validation.md) · [性能/包体/稳定性基线](docs/gltf-performance-baseline.md) · [官方模型目录](docs/gltf-catalog.md)
- [官方模型目录与对照预览](docs/gltf-catalog.md) — 150 个官方模型、格式选择、AIR 预览与 Khronos Viewer 对照
- `docs/06-code-first-getting-started.md` — 最小入门（createAirApp / GameCanvas 约束）
- `docs/07-asset-loading.md` — Promise Asset Helper
- `docs/08-skinned-model.md` — 骨骼工具集（buildSkeletonTree / restoreBindPose / frameObject）
- `docs/09-engine-development.md` — dev server 三频道 / 错误可见性 / 诊断端点
- `docs/05-v02-build-performance.md` — 构建性能基线（只记录不优化）

## 能力边界（V1.2）

**保留（在默认交付产物里）**：Core/Math/Scene Graph/Component/Game/Director/Asset/
GFX(WebGL2 + WebGL1 回退)/Render Scene/Render Pipeline/Camera/Light/Mesh/Material/Texture/
Animation/Skeleton/Skinning/primitive/tween/Web Input/Web PAL + builtin 材质与效果（Air 程序化注册，见 `src/air/builtin`）；
V1.x 回归期新增（**能力名**，逐名对账见下）：**2D/UI**（`2d` `ui` `mask` `graphics` `tiled-map` `particle-2d` `sorting`）、
**音频/视频/WebView**（`audio` `video` `webview`）、**物理**（3D `physics-builtin`；2D `physics-2d-box2d` / `physics-2d-builtin`）、
**骨骼动画资产**（`spine` `dragon-bones`）、`profiler`、`custom-pipeline`、`geometry-renderer`、`intersection-2d`。

**⚠️ r45g 现读：上面括号里是「能力名」，不逐条等同于 `src/cc.config.json` 的 feature unit 名。**三个面要分开讲，混了就会读到相反结论：

- **上面括号里已声明、且在默认构建集的 unit**：`2d` `ui` `tiled-map` `particle-2d` `video` `webview` `profiler` `custom-pipeline` `physics-builtin` `physics-2d-box2d` `physics-2d-framework` `dragon-bones` `spine-3.8` `spine-4.2` `custom-pipeline-post-process`（默认集共 **26** 项，全表见 `docs/01-web-feature-set.md` §7.2）。
- **已声明但不在默认集**：`audio` `physics-2d-builtin` `physics-ammo` `physics-physx` `physics-2d-box2d-wasm` `physics-cannon` `marionette` `procedural-animation`（共 8 项，逐条理由见 `docs/01-web-feature-set.md` §7.3）。
- **不是 Air 声明的 feature unit，但能力确在默认产物里**：`mask` `graphics` `sorting` `intersection-2d` `geometry-renderer` `spine`（真实 unit 名是 `spine-3.8`/`spine-4.2`）`physics-framework`。机制：`src/exports/air.ts` 把它们**静态再导出**（`export * from` 一行一个）挂进 bundle 入口，走的是 **import 图**而不是 feature 开关（`src/exports/` 39 个文件里 **9** 个的名字未在册 unit：`geometry-renderer` `gfx-webgpu` `graphics` `intersection-2d` `mask` `physics-framework` `sorting` `sorting-2d` `spine`；其中 `gfx-webgpu.ts` **没有**被 `air.ts` 聚合，其余 8 个是）。
  产物侧核对（整词计数，`build/cocosair.module.js`）：`Graphics` 19、`Mask` 14、`Sorting2D` 4、`GeometryRenderer` 10、`PhysicsSystem` 33、`PhysicsSystem2D` 30、`AudioSource` 11、`TiledMap` 5、`UIRenderer` 31 ⇒ 「产物里有这个能力」为真；「它是可关掉的 feature unit」为假。
  ⇒ 讲**开关面 / 变体构建**必须用 §7 的 unit 名；讲**发行产物含什么**才用上面的能力名。自查（仓库内只读门禁）：`npm run verify:v12-feature-face` —— D2 打印「入口文件名不是已声明 unit」的集合，D3 打印被 `air.ts` 聚合的那批，D4 是**默认产物组成锁**（在册能力符号整词命中 ≥1 + 非默认后端的世界类整词命中 == 0），D5 逐个复核上面每个能力名的依据还在不在。

入口面实测（r45g 现读，两个独立事实源交叉）：`src/exports/` **39** 个 feature 入口文件；`src/cc.config.json` 声明 **34** 个 feature unit（上游 55、缺 **22**、`airOnly=[air]`）；默认构建集 **26** 项。
交叉源：`npm run verify:v12-feature-face` 的 D1 臂与 `npm run verify:v12-backends` 的 A4/A5 两臂 —— 同一对面、两个独立实现，现读一致。逐名分组见 `docs/01-web-feature-set.md` §7；复跑命令与历史增量见 `docs/17-baseline-comparison.md` §9.1。
（本段替换掉的是 r43 期口径「31 个 unit / 共有 30 / onlyUpstream 25 / 36 个入口」——批次 D-4/G-3 并入 3 个物理 unit 与 3 个入口文件后未随轮刷新，登记为 **F-130**。）

**不包含 / 有条件（每条都有决策点，未确认前不自行豁免）**：

- **D9 待批复 13 项**：地形 `cocos/terrain/**`（5 文件）、3D 粒子（`cocos/particle/animator/optimized-curve.ts` + `exports/particle.ts`）、
  `exports/xr.ts`、`exports/light-probe.ts`、4 个 convenience 门面（`affine-transform`/`rich-text`/`ui-skew`/`vendor-google`）
  ⇒ 逐条理由与纳入成本见 `docs/v12-d9-residual-triage.md`（同文档里那 1 项零引用上游桩已在 r43 实测结案）。
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
- `skinned-animation` 示例（三关节蒙皮 + 骨骼动画）已实测通过，
  验证与修复记录见 `docs/acceptance-report.md` §7。

## 基线与上游

源码基线：`cocos4 @ 4.0.0-alpha.34`，实测 commit `557b06f7e6`，V1.2 G0 冻结点 `fffd9a514a`，MIT 许可。
闭包实测（`node tools/compare/baseline-compare.cjs` → `docs/v12-baseline-compare.json`）：
上游 scope 1299 / Air 侧 1241 / 同名共有 1203 / 官方独有 96（排除 jsb 变体后 42）/ 语义漂移 6（全部已登记 `modified:true` + reason）/ Air 独有 38。
上游对应关系、抽取清单与修改记录见 `UPSTREAM.md`、`docs/upstream-file-map.json`（**1315** 条映射）、
`docs/extraction-manifest.json`（**1278** 条）、`docs/00-upstream-baseline.md` 与 `docs/17-baseline-comparison.md` §9。

## 许可

MIT（见 LICENSE）。第三方许可见 THIRD_PARTY_LICENSES.md。
