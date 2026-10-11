# AIR Agent Skills 套件铺开

用户授权（2026-10-07 会话）：参考 [pixijs-skills](https://github.com/pixijs/pixijs-skills) 的初衷与架构，在 `skills/` 生成全量技能集合。不提交、不发布、不改版本号；接线只允许 `tools/verify/graphics-package.cjs` 的三行路径字符串。

本文是实施意图与验收要求，不是完成证明。当前状态以工作树与本轮证据为准。逐任务实施步骤见 [agent-skills-suite-steps.md](agent-skills-suite-steps.md)。

## 参照结论

pixijs-skills 的承重设计有四点，本套件全部沿用：

- 目标是**纠正 agent 的既有习惯**，不是复述文档。PixiJS 的痛点是语料里 v7 代码占多数，因此每个技能正文都有 `[HIGH]/[MEDIUM]` 分级的 Common Mistakes 与 wrong/right 代码对。AIR 的对应痛点是 agent 会写 Cocos Creator 范式（Prefab、`cc.Class`、Editor 资产、`.scene` 反序列化）与错误的启动时序。
- 一个 router 技能承担「任务语言 → 子系统技能」的路由，配「load when…」表格与兜底指引。
- 每个技能目录 = `SKILL.md` + 可选 `references/*.md`，长料按需加载（渐进披露）。
- 目录名必须等于 frontmatter `name`；`description` 第三人称并塞满触发词。

不沿用：plugin 清单、Copilot instructions、仓库级技能总表 README、作者规范文档、新增校验门禁（见「不做项」）。

## 已确认决定

| 议题 | 决定 |
| --- | --- |
| 规模 | router + 21 个技能（共 22 个目录） |
| 命名 | 统一 `cocosair-*`，router 名为 `cocosair`；既有三技能改名 |
| references 内容 | 全量内联 docs 与源码盘点中的**有限表**（选项、错误码、数值上限、支持矩阵、命令表） |
| 准确性 | 逐符号现读 `build/cocosair.module.d.ts` 与 `src/air/**`，不启浏览器的部分不宣称运行时行为 |
| 门禁接线 | 只改 `tools/verify/graphics-package.cjs:82-84` 三行路径，不新增校验能力 |

## 目录与规范

```
skills/
  cocosair/                     # router：Code First 纪律 + 任务路由 + 兜底
  cocosair-<topic>/
    SKILL.md
    references/<topic>-<facet>.md
```

- `name` 小写连字符、等于目录名；`description` ≤1024 字符、第三人称、含 `cocosair.js`、`Cocos AIR`、关键类名与错误码字面量作为触发词。
- `SKILL.md` 正文硬上限 200 行、目标 ≤150 行（pixijs 放宽到 500；AIR 的长料一律进 `references/`）。超出 200 行即视为切分错误，须把内容下沉到 references 而不是保留在正文。
- 正文固定骨架：一句话定位 → Quick Start（可运行代码）→ Related skills → 「When to use what」问句映射 → 关键契约与硬上限 → Common Mistakes（`[HIGH]/[MEDIUM]`，wrong/right 成对）→ references 索引 → canonical doc 指针。
- 每个 `references/<file>.md` 首行标注 `Derived from docs/<path>（as of 2026-10-07）`。仓库内不建漂移对账，因此内联只放**枚举型事实**，判定性叙述一律留在 docs 并以指针给出；docs 更新时由人工同步该文件。

## 技能清单

| 技能 | 覆盖面 | 内联来源（canonical） |
| --- | --- | --- |
| `cocosair` | router、Code First 纪律、canonical 最小代码模式、能力面三层口径 | `README.md`、`AGENTS.md`、原 `air-code-first`、`docs/manual/runtime-capability-layers.md` |
| `cocosair-project-setup` | 安装、三个入口（主/`bootstrap`/`html-source`）、importmap 与 `#GameCanvas` 前置、TS 消费、`AIR_FEATURES` 变体与默认 26 feature 面 | `docs/manual/installation.md`、`build/README.md`、`tools/build/build.cjs`、`docs/reference/web-features.md` |
| `cocosair-application` | `createAirApp` 选项、`run`/`close` 与整页重载、单运行时准入、designResolution 与 screenMode、`pixelRatioCap`、context health | `docs/manual/safe-startup-and-release.md`、`docs/webgl2-only.md`、`src/air/{bootstrap,app,app-config,context-health}.ts` |
| `cocosair-scene-graph` | `Scene`/`Node`/`Component` 生命周期、layers 与掩码、`find`、节点事件、`NodePool`、scene globals 只读面 | `docs/manual/scenegraph.md`、`docs/manual/creating-a-scene.md`、`docs/manual/api-behavior-contracts.md` |
| `cocosair-camera` | 透视/正交切换、orthoHeight、多相机 viewport 与 priority、`worldToScreen`/`screenToWorld`/`screenPointToRay`、`frameObject`、斜近裁剪面 | `docs/manual/cameras.md`、`docs/manual/align-html-elements-to-3d.md`、`src/air/utils/frame-object.ts` |
| `cocosair-math` | `math.*` 值类型、Vec2/3/4、Mat3/4、Quat、Rect/Size、Color 转换、easing、bits 与随机、矩阵变换语义 | `docs/manual/matrix-transformations.md`、`docs/reference/api-stability.md`、`examples/math-*` |
| `cocosair-materials-effects` | `Material`/`EffectAsset`/technique/pass/defines、`setProperty` 类型匹配、`USE_TEXTURE` 一致性、21 个内置 effect 与 15 个内置 material 清单、手写 GLSL 三段链、`createAirUnlitFogEffect`、`inspectAirMaterial` | `docs/manual/materials.md`、`docs/manual/custom-shaders.md`、`docs/manual/uniform-types.md`、`src/air/builtin/register.ts` |
| `cocosair-rendering` | 光源类型与照度单位、legacy forward 单 `mainLight` 限制、阴影支持矩阵、RT/MSAA 请求值与生效值、sRGB 与预滤波环境契约、UV 行向、默认管线的 post-process 真实可达面、截图取证 | `docs/manual/lighting-units.md`、`docs/manual/shadow-support-matrix.md`、`docs/manual/rendering-contracts.md`、`docs/reference/rendering-color-diagnostics.md`、`docs/reference/texture-uv-verification.md` |
| `cocosair-primitives-mesh` | `Mesh` 资产构造与存储、primitive 形状、`createPrimitiveGeometry` 与参数白名单及上限、顶点属性/索引读写、morph bounds、OBJ 导出与 wireframe | `docs/manual/primitives.md`、`docs/manual/custom-buffergeometry.md`、`docs/manual/primitive-descriptors.md`、`src/air/primitive-geometry.ts` |
| `cocosair-performance` | 三条批处理路线、`batchStaticModel`、动态图集、原生 instancing、culling 与视口裁剪、`Profiler`、按需渲染、海量对象与海量动画配方 | `docs/manual/batching-recipes.md`、`docs/manual/optimize-lots-of-objects*.md`、`docs/manual/rendering-on-demand.md`、`docs/notes/geometry-batching-assessment.md` |
| `cocosair-assets` | `assetManager`/`load`/`loadRemote`、`loadAssetAsync` 三段回落、`AssetBank` 引用计数与 `ext` 规则、`resources` bundle 缺席现实、`Texture2D`/`ImageAsset` 构造与 mipmap、libGDX atlas 与 bmfont 单页限制 | `docs/guides/asset-loading.md`、`docs/manual/asset-loading-and-lifetime.md`、`docs/manual/atlas-loading.md`、`docs/manual/bitmap-font-loading.md`、`docs/manual/textures.md` |
| `cocosair-gltf` | `GLTFLoader`/`GLTFAsset`/`instantiate`、21 个扩展工厂与 `getExtensionSupport()` 五档语义、解码器注入（draco/meshopt/ktx2）与部署边界、进度阶段、错误码、扩展注册顺序 | `docs/gltf/gltf-runtime.md`、`docs/gltf/gltf-extension-reference.md`、`docs/gltf/gltf-decoder-deployment.md`、`src/air/assets/gltf/**` |
| `cocosair-animation-tween` | `AnimationClip`/`Animation`、`tween` 组合与回收、`update(dt)` 与固定步长、`createStepClock` 单时钟纪律、pose graph 未发布 | `docs/manual/animation-system.md`、`docs/manual/how-to-update-things.md`、`docs/notes/pose-graph-notes.md`、`src/air/step-clock.ts` |
| `cocosair-skinning-morph` | `SkinnedMeshRenderer`、`Skeleton.joints` 全路径规则、`buildSkeletonTree`、`restoreBindPose`、morph target 与权重、`setUseBakedAnimation`、CCSkinning binding 3 | `docs/manual/skinning-code-first.md`、`docs/guides/skinned-model.md`、`src/air/utils/{skeleton-tree,restore-bind-pose}.ts` |
| `cocosair-2d-subsystems` | Spine（`sp` 与资产来源缺口）、DragonBones、TiledMap 图层与对象查询、ParticleSystem2D 与 plist、`Billboard` | `docs/notes/spine-asset-sourcing.md`、`docs/notes/dragonbones-notes.md`、`docs/notes/tiled-map-notes.md`、`docs/notes/particle-2d-notes.md`、`docs/manual/billboards.md` |
| `cocosair-ui-2d` | `createUICanvas`、Canvas/Widget/Layout、Button/ScrollView/ProgressBar/Slider/Toggle/EditBox、`Label` 系统字体渲染 + `parseFnt`/`createBitmapFont`/`loadBitmapFont` 绑定受支持 BMFont（原生仅 1 个未打包单页）、RichText、排序层与 `Sorting2D` | `docs/manual/2d-ui.md`、`docs/manual/ui-layout-and-interaction.md`、`docs/manual/creating-text.md`、`docs/manual/bitmap-font-loading.md`、`src/air/ui-kit.ts`、`src/air/assets/bmfont.ts` |
| `cocosair-graphics-and-dom` | 现 `air-graphics-and-dom` 改名并扩写：命令回放、SVG 序列化、栅格填充与上限、pattern 变换、Sprite 遮罩通道、UI 混合作用域、纹理 Sprite、`AirUIMesh` 上限、DOM overlay、实验 `html-source` | `docs/manual/graphics-and-dom.md`（canonical）、`src/air/{graphics-commands,graphics-raster,ui-blend,dom-overlay,ui-mesh,html-source}.ts` |
| `cocosair-input-action` | `input`/`systemEvent`/touch 与 key code、`createActionState`/`createActionInput` 三后端与 `dom` 后端必须显式给 canvas、`createSessionGate`、`SceneStack` 输入拦截与页面缓存、可编辑目标跳过、焦点契约 | `docs/manual/input-and-events.md`、`docs/manual/input-action-state.md`、`docs/manual/test-input-injection.md`、`src/air/{action-state,action-input,scene-stack}.ts` |
| `cocosair-physics` | `physics: 'builtin' \| 'cannon'` 选择时机与「后注册者胜」、零后端时只告警不抛、2D Box2D 纯 JS 与查询/积分边界、`default-physics-material` 播种、WASM 后端缺席 | `docs/manual/physics-2d-and-3d.md`、`docs/notes/physics-3d-notes.md`、`docs/reference/api-stability.md`、`src/air/physics-backend.ts` |
| `cocosair-audio-video` | `AudioService` 的 BGM/SFX 声道与 `maxSfxVoices` 溢出、以实测 `currentTime` 而非 `playing` 判定播放、`AudioSource` 手势解锁、`VideoPlayer` 平台注意、`WebView` 限制 | `docs/manual/audio-video-webview.md`、`docs/notes/audio-notes.md`、`docs/notes/video-notes.md`、`src/air/audio-service.ts` |
| `cocosair-agent-session` | `__airApp` 绑定、Agent/DevTools session 观察与受控写入、`rc-*` 契约（inspectScene/dispatch 的 `requestId` 在执行中与保留窗口内重复会被拒绝为 `INVALID_ARGUMENT`，默认 FIFO 256，**不是**返回首次结果的幂等重放，写操作不可盲目重试／AFTER_DRAW 捕获／错误环）、诊断上限与截断、可视化探针区域约定 | `docs/guides/agent-development.md`、`docs/guides/runtime-inspection.md`、`docs/guides/visual-probe-contracts.md`、`tools/debug/agent-session.ts`、`examples/automation` |
| `cocosair-verification` | 现 `air-verification` 改名并扩写：源码导出/bundle 可达/浏览器行为三层报告口径、写门禁与只读门禁区分、证据指纹与子集语义、Playwright 与 `NODE_PATH` 前置 | `docs/reference/verification.md`、`AGENTS.md` 命令表、`docs/reference/example-specification.md` |

## 实施顺序

分四批落地，每批完成后按「验收要求」逐技能核符号，再进下一批。分批只为早期纠偏排版与准确度口径，不改变最终交付为 22 个目录。

| 批次 | 技能 | 目的 |
| --- | --- | --- |
| W1 | `cocosair`、`cocosair-project-setup`、`cocosair-application`、`cocosair-verification`、`cocosair-graphics-and-dom` | 先定 router 与骨架口径，并收掉既有三技能的改名接线 |
| W2 | `cocosair-scene-graph`、`cocosair-camera`、`cocosair-materials-effects`、`cocosair-rendering`、`cocosair-math` | 场景与渲染主面，幻觉代价最高 |
| W3 | `cocosair-assets`、`cocosair-gltf`、`cocosair-animation-tween`、`cocosair-skinning-morph`、`cocosair-primitives-mesh` | 资源与动画链路 |
| W4 | `cocosair-ui-2d`、`cocosair-input-action`、`cocosair-physics`、`cocosair-2d-subsystems`、`cocosair-audio-video`、`cocosair-performance`、`cocosair-agent-session` | 其余领域与作业面 |

## 接线改动

- `git mv skills/air-graphics-and-dom skills/cocosair-graphics-and-dom`、`git mv skills/air-verification skills/cocosair-verification`（改名后重写 frontmatter `name`）。
- `skills/air-code-first/` 内容并入 `skills/cocosair/SKILL.md` 后删除该目录。
- `tools/verify/graphics-package.cjs:82-84` 三条路径字符串改为 `skills/cocosair/SKILL.md`、`skills/cocosair-graphics-and-dom/SKILL.md`、`skills/cocosair-verification/SKILL.md`。断言的语义（技能随包发出）与能力范围不变。
- `package.json` 的 `files: ["skills/"]` 按目录打包，无需改动。
- `tools/verify/graphics-and-dom.cjs:135` 的 `schemaVersion: 'air-graphics-and-dom/1'` **不改**：证据 schema 标识符按 AGENTS.md 属稳定引用，不随目录名迁移。
- `ai/plans/pixi-capability-implementation.md:60` 是历史时点记录，保留原文，不改写为新世界名。

## 不做项

不新增校验脚本或 npm script，不加 `.claude-plugin`/`.cursor-plugin`/`marketplace.json`，不加 Copilot instructions，不写仓库级技能总表 README，不改 `AGENTS.md` 与 `CLAUDE.md`，不新增 examples，不动 `docs/` 任何契约文档，不提交、不推送、不发布、不改版本号。

## 验收要求

| 检查 | 判定 |
| --- | --- |
| 规范一致性 | 22 个目录逐个核对：目录名 == `name`、`description` 第三人称且 ≤1024 字符、正文 ≤200 行（目标 150）、`references/` 链接与 canonical doc 路径全部可达 |
| 符号真实性 | 每个技能正文与 references 里出现的每个导出符号、错误码字面量、数值上限都按**该技能的实际入口**现读到出处：主入口用 `build/cocosair.module.d.ts` 与 `src/air/**`；`html-source` 与 `bootstrap` 用各自的 `build/html-source.d.ts`、`build/bootstrap.d.ts`（主入口声明里没有）；Agent session 与运行时受控写入用 `tools/debug/**` 开发工具源码（不属于默认 runtime bundle，也不在 SDK 声明里）。入口归属写错即视为缺陷，不以主入口声明代替子路径或开发工具面。主入口不可达的能力必须在技能内写成不可达而非示例用法 |
| 三层口径 | 凡涉及能力可用性，逐条区分源码导出 / 默认 bundle 可达 / 浏览器已验证，不得用「docs 里提到」冒充「可运行」 |
| 运行时抽样 | 不新增 example 目录，也不修改 `examples/**`（本套件写入面只有 `skills/**` 与 `tools/verify/graphics-package.cjs` 的三行路径字符串）。抽 2 个渲染类技能，取其 Quick Start 调用序列，在 `output/`（gitignore）下落一次性 Playwright 脚本，用 `context.route` 拦截同源假 URL 并在内存 HTML 里加载当期 `build/cocosair.module.js`（`tools/dev/dev-server.cjs:355/:417-420` 只放行 `/build/` 与 `examples/` 下的真实文件，直接访问 `output/` 页面必然 404），`npm run dev` 下同源运行并截图，验证后删除。其余技能代码片段只声明「已对源码核对，未运行时验证」 |
| 打包门禁 | 必须带新输出路径运行：`node tools/verify/graphics-package.cjs --out=output/<新>.json`。`graphics-package.cjs:9-10` 断言 `--out=` 存在且目标文件**尚不存在**，缺参数或复用旧文件都会在真正检查前退出（`--out` 本身是写行为，会产出 JSON 与相邻 `-artifacts/`）。`prepack` 要求当期 bundle 已生成；npm CLI 默认由 `process.execPath` 同目录推导（本机现读存在），推导失败时用 `AIR_NPM_CLI` 指定现有 `npm-cli.js`，不改主机配置。skill 路径断言不因改名失败；该 gate 其余项按当期结果如实报告，不继承上一轮结论 |

## 风险与残余

- 全量内联 + 无漂移门禁 = docs 与 references 双头维护。缓解仅为文件头的来源与日期标注，属人工约定；本套件交付时不声称存在任何自动漂移检查。
- `cocosair-*` 技能数量远超现有 3 个，`skills/` 随 npm 包体积增长；`prepack` 与 `verify:consumer` 需要重新跑才能确认打包面无回归。
- 技能之间若出现同一 API 的重复陈述，router 与子系统技能的边界需要在实现期收敛；本设计选择「子系统切分 + router 任务映射」，不接受按任务意图重复切分。
- 按「不做项」不改 `AGENTS.md`，因此宿主侧技能发现只依赖 router 与 `description` 触发词，没有仓库级索引兜底。
- docs 侧现存表述冲突：`docs/manual/creating-text.md:39` 仍写「`Label` 使用系统字体渲染」，未提 BMFont 绑定；`docs/manual/bitmap-font-loading.md` 已给出 `label.font = handle.font` 的受支持路径。按「不动 docs」本轮不改文档，技能以 `bitmap-font-loading.md` 为准，并把该差异作为 Common Mistakes 素材（不要照抄 creating-text 的旧口径）。
