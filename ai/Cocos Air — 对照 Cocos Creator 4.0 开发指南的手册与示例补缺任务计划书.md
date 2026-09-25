# Cocos AIR 手册与示例补缺任务计划书

> 立项依据：`E:/AIProMax/github/cocos-docs/versions/4.0/zh` 的本地中文开发指南，对照本仓库 `docs/manual/`、`examples/`、`src/exports/air.ts`。盘点日期：2026-09-25。**本文件仅供评估与后续实施；本次不修改手册、示例、测试或证据。**

## 一、结论与范围

当前手册沿用 three.js manual 的 10 组、64 条目骨架；磁盘上有 61 个 Markdown 文件（含索引）和 41 个 `manual-*` 示例。它较完整地讲了 3D 场景、材质、相机、纹理、glTF 等主题，但官方 4.0 指南里对 Cocos 开发者最重要的**组件生命周期、事件、资源加载与释放、2D/UI、物理、音视频、骨骼动画**没有形成同等可操作的 Code First 学习路径。主 `examples/` 已有 58 个非 `shared` 示例目录，能复用其中不少成果。

最先要修的是事实漂移：`docs/manual/index.md` 仍把 2D/UI、物理、Spine/DragonBones、音视频列为“不包含”；`creating-text.md` 和 `physics.md` 基于旧导出面作 N/A 判断；`game.md` 和 `faq.md` 还引用这些旧结论。当前 `src/exports/air.ts` 已聚合相应模块，`src/exports/ui.ts`、`src/exports/physics-framework.ts`、`src/exports/audio.ts` 提供具体导出，`examples/ui-components`、`physics-3d-basic`、`audio-basic` 等已有可运行用法。此处是明确的**文档状态过期**，不是要求新增引擎能力。`animation-system.md` 目前主要讲 Tween，官方的 AnimationClip / Animation / SkeletalAnimation 路线仍缺主线教程。

目标是保留既有目录与已验证示例，在适当位置加一层“Cocos 4.0 开发工作流”导航和若干专题页；将过期结论改成按**当前公开导出、默认构建、浏览器实跑**三层核对后的状态。官方指南是概念与行为参考，代码必须以 AIR 当前公开 API 和实跑结果为准，不直接复制依赖 Creator 编辑器、Inspector、Prefab 工程或 `cc` 别名的片段。

## 二、盘点依据与边界

| 依据 | 本次看到的事实 | 后续实施要求 |
| --- | --- | --- |
| 官方 `SUMMARY.md` | 重点章节见 `scripting/`、`engine/event/`、`asset/`、`ui-system/`、`physics/`、`physics-2d/`、`animation/`、`tween/`、`particle-system/`、`render-pipeline/` | 逐主题映射，而非把官方全部篇目逐页搬入 |
| `docs/manual/index.md` | 以 three.js 主题排序，能力总说明仍称 2D/UI、物理、音视频等不包含 | 保留原索引，在其前部增加 AIR 工作流入口，并更正过期状态与边界 |
| `docs/manual/examples/` | 41 个专属示例；旧证据 `docs/evidence/manual-examples-verified.json` 记录 2026-09-20 的 41/41 PASS | 旧证据仅作线索；后续新增或改动示例须重跑并记录当期结果 |
| `examples/` | 58 个主示例，涵盖 UI、物理、音视频、TiledMap、2D 粒子、DragonBones 等 | 优先深链现有主示例；只有缺少最小教学闭环时才建手册专属示例 |
| `src/exports/air.ts` 与 `build/cocosair.module.d.ts` | 导出面已扩至 2D/UI、物理、音视频、后处理等；旧手册引用的 368 导出数已失效 | 区分“源码导出”“默认 bundle 可用”“浏览器行为通过”，不凭符号名宣称完整支持 |
| 既有 `ai/Cocos Air — 接口场景覆盖、开发范式与 Shader 示例任务计划书.md` | 已计划组合场景、五个游戏、开发范式和 Shader 示例 | 本计划聚焦手册对照与最小教学示例；上述大型场景和 Shader 实施只建立关联，不重复计工作量 |

本轮不纳入 Creator 编辑器界面/插件、Dashboard、Inspector 资源绑定、原生 JSB、各平台发布、XR、WebGPU、完整 3D 粒子与地形教程。它们应在边界页中说明“官方指南有此流程，但 AIR 当前发行目标或公开工作流不同”。对任何看似可用但缺浏览器证据的能力，先记 `待验证`，不直接改成 `FULL`。

## 三、缺口矩阵与建议任务

以下路径均相对各自仓库根。P0 是先修错误事实与用户最常碰到的基础工作流；P1 是已具备示例基础的专题；P2 依赖能力探针或其他计划的实施结果。

| 优先级 | 官方指南锚点 | AIR 现状与缺口 | 计划交付 | 示例与验证 |
| --- | --- | --- | --- | --- |
| P0 | `scripting/life-cycle-callbacks.md`、`scripting/component.md`、`scripting/create-destroy.md` | `creating-a-scene.md`、`how-to-update-things.md` 各讲一段，缺从 `onLoad` 到 `onDestroy`、启停、订阅清理与场景复入的连续教程 | 新增 `docs/manual/component-lifecycle.md`；索引增加工作流入口；现有两篇互链 | 新建 `manual-component-lifecycle`：切换 active 与销毁再建，断言各回调次数、顺序和监听器清理 |
| P0 | `engine/event/event-input.md`、`event-node.md`、`event-screen.md`，`scripting/scheduler.md` | `picking.md`、`tips.md`、`game.md` 只分散讲指针/键盘；缺全局 input、节点事件、传播、坐标换算、退订的选择指南 | 新增 `docs/manual/input-and-events.md`，引用现有拾取和游戏篇 | 先复用 `examples/input`、`interaction-click`；若缺传播/退订可观测证据，再建 `manual-input-events`；验证一次交互只触发一次、销毁后无回调 |
| P0 | `asset/dynamic-load-resources.md`、`asset/release-manager.md`、`scripting/load-assets.md` | `load-gltf.md`、`textures.md`、`cleanup.md` 有局部片段，缺异步加载、失败重试、所有权、引用计数、场景切换取消的统一叙述 | 新增 `docs/manual/asset-loading-and-lifetime.md`，写清 `loadAssetAsync`、`assetManager` 与 `GLTFLoader` 的适用边界；回链 `cleanup.md` | 复用 `examples/runtime-asset-release`、`gltf-viewer`；补最小 `manual-asset-lifecycle` 时须覆盖成功/失败、释放/重载、无已销毁资产复用 |
| P0 | `ui-system/components/editor/label.md`、`2d-object/ui-system/index.md`、`physics/physics-example.md` | `creating-text.md` 称没有 `Label`；`physics.md` 称无刚体与碰撞体；索引和 FAQ 随之误导 | 更正 `creating-text.md`：区分 3D 文字几何与 UI `Label`；重写 `physics.md`：区分 2D/3D 与后端；同步 `index.md`、`faq.md`、`game.md` 中的旧断言 | 引用 `examples/ui-components`、`physics-2d-basic`、`physics-3d-basic`、碰撞示例；对应链接和状态须通过当前 API/浏览器验证 |
| P1 | `2d-object/2d-render/index.md`、`ui-system/components/editor/{canvas,sprite,label,layout,button}.md`、`ui-system/components/engine/multi-resolution.md` | 手册没有完整 Canvas → Sprite/Label → 布局 → 点击路径；`responsive.md` 偏 3D canvas | 新增 `docs/manual/2d-ui.md` 与 `docs/manual/ui-layout-and-interaction.md`，介绍 Code First 初始化、坐标/分辨率、布局和交互 | 复用 `examples/ui-components`、`ui-layout`；仅为现有示例缺少的“从空场景起步”部分建手册示例；验证文字可见、按钮事件、resize 后布局 |
| P1 | `animation/animation-comp.md`、`animation/animation-clip.md`、`tween/tween-example.md` | `animation-system.md` 主要演示 Tween，对 `AnimationClip`、状态切换、SkeletalAnimation 只是点名 | 增加剪辑与骨骼动画小节或新 `docs/manual/animation-clips.md`；Tween 部分继续保留并链接 | 复用 `examples/anim-position`、`anim-rotation`、`skinned-animation`、`tween-basic`；验证播放/停止、循环、切换与销毁后的状态 |
| P1 | `physics-2d/physics-2d-system.md`、`physics/physics-example.md` 及碰撞相关篇 | 有 Gallery 物理样例，但手册缺碰撞层/Mask、刚体类型、事件及 backend 差异 | 在 `physics.md` 之后增加 `docs/manual/physics-2d-and-3d.md` 或明确分节；默认 backend 和可选 backend 分开写 | 复用 `examples/physics-2d-collision`、`physics-3d-collision`；验证真实碰撞/触发事件、过滤规则、重置，不能用距离判定冒充物理 |
| P1 | `audio-system/overview.md`、`audio-system/audiosource.md`、`ui-system/components/editor/{videoplayer,webview}.md` | `index.md` 称音视频不包含；手册无 Web 用户手势解锁、播放错误、DOM overlay 边界 | 新增 `docs/manual/audio-video-webview.md`，分三节记录 Web 环境限制和释放 | 复用 `examples/audio-basic`、`video-basic`、`webview-basic`；验证用户手势、状态变化、失败或不可用提示、卸载后无遗留 DOM/音频 |
| P1 | `asset/dragonbones.md`、`asset/spine.md`、`asset/tiledmap.md`、`particle-system/2d-particle/2d-particle.md` | 手册“能力边界”仍把 DragonBones 归入不包含；其他三类基本无入口 | 加 `docs/manual/2d-assets-and-effects.md`，按四小节写能力/资产格式/初始化/释放；Spine 能力状态单独核对，不由 DragonBones 推断 | 复用 `examples/dragonbones-basic`、`tiledmap-basic`、`particle-2d-basic`；Spine 若无已验证示例，先列为待验证候选，不强建 |
| P2 | `render-pipeline/use-post-process.md`、`render-pipeline/post-process/custom.md`、`shader/index.md` | `post-processing.md`、`how-to-use-post-processing.md`、`debugging-glsl.md`、`shadertoy.md` 保留早期探针结论；V1.2 已有 custom pipeline 出口，但用户侧装配能力未在本次证实 | 做小范围能力复核，记录 API→样例→像素效果；通过后再改手册状态；Shader 正式示例与既有 `ai` 计划衔接 | 必须有像素级变化、参数变化和故意编译错误定位，不能以属性读回或非空首帧作为完成 |

### 实施时必须处理的交叉错误

1. `docs/manual/index.md` 的“能力边界总说明”是全局入口，不能只改各篇而留下旧总述。
2. `creating-text.md` 的“无 3D 文字网格”可能仍成立，但“无 `Label`”与现有 UI 示例冲突；改写时明确空间文字、屏幕 UI 文字、Canvas 纹理文字三种路线。
3. `physics.md` 的旧“仅内部命名空间、无组件级物理”与现有公开导出及物理示例冲突；保留历史原因可移入版本说明，不再作为当前结论。
4. `game.md` 把距离判定称作旧物理 N/A 的替代，改为“本小游戏选择简单距离判定”，避免读者误认为 AIR 无物理。
5. `README.md` 的手册数量、索引篇目数、磁盘文章数与示例数使用不同口径；实施时统一写“64 条目 / 60 文章 + 索引 / 当前示例数”，并由脚本或清单核实。
6. 旧文章里 `d.ts` 行号、导出个数、历史截图/浏览器读数都可能随版本漂移。改动时按当前声明和本次验证刷新；不要只替换标题与状态。

## 四、执行批次与退出条件

| 批次 | 工作与依赖 | 交付件 | 退出条件 |
| --- | --- | --- | --- |
| G0 基线与适用性，P0 | 记录 HEAD、未提交改动、官方指南版本与主题索引；按公开导出/默认产物/浏览器证据做“官方主题 → AIR 状态 → 页面/示例”矩阵 | `docs/manual/cocos4-coverage-matrix.md` 或同等台账；列出 `FULL / PARTIAL / N/A / 待验证` 的依据 | 每个本计划主题有官方路径、AIR API 证据、示例路径、行动；不把旧证据标为当期通过 |
| G1 事实纠偏，P0 | 基于 G0 更新旧 N/A、索引、FAQ、游戏篇、交叉链接 | 现有页的增量 diff；无需新引擎代码 | 全局边界、单篇和 README 不再互相矛盾；`verify:doc-refs` 与手册一致性检查通过 |
| G2 基础工作流，P0 | 生命周期、输入事件、资源生命周期三条路径，优先复用现有示例 | 3 篇主题页与确实缺失的最小手册示例 | 用户能从启动到销毁/重建操作一遍；事件和资源无残留；新示例有行为断言而非仅“画面可见” |
| G3 功能专题，P1 | 2D/UI、动画、物理、音视频、2D 资产/效果；可分批但同一文件串行修改 | 按矩阵确定的专题页、示例链接及少量缺口示例 | 每节能指向一条已验证、可复现的代码路径；不支持项明确 backend/平台/资产条件 |
| G4 待验证能力，P2 | 后处理、Shader、Spine 等只做可行性检查；与现有计划对接 | 复核记录与下一步实施范围 | 只有实跑证据足够才提升状态；否则保留 `待验证`/`PARTIAL` 并给具体阻断点 |
| G5 汇总验收 | 全量文档链接、代码块一致性、受影响示例的运行验证、状态台账刷新 | 当期验证报告与索引导航 | 无新增断链、旧结论复核完成；每个新增“可运行”主张有对应的行为证据 |

粗估：G0 1–2 人日；G1 1–2；G2 3–5；G3 5–9；G4 1–3（仅探针，若需引擎功能另估）；G5 1–2。总计约 11–23 人日，取决于现有主示例能否直接担任教学样例。此估算不含现有另一计划中的大型游戏场景和 Shader 正式开发。

## 五、示例与测试补充规则

1. **两套示例分工**：概念入门、短路径用 `docs/manual/examples/manual-<slug>/`；已有完整交互和规格的功能页直接链接 `examples/<id>/`，不复制成第二套。手册页必须说明运行命令、预期行为、适用 backend/浏览器。
2. **新增手册示例条件**：现有 Gallery 示例过于综合，无法独立展示一个关键概念，或缺失败/清理路径时才新增。遵守 `index.html + main.ts`、`window.__airApp` 与文章完整代码块一致的现行约定；若决定只链 Gallery，则不把它写成 `▶ manual-*`。
3. **行为验证补口**：现有 `tools/verify/manual-examples-verify.cjs` 主要检查 app、可见帧、运行错误与部分帧差。生命周期、事件、资源释放、UI 点击、碰撞等新示例需要专用状态探针/交互断言；帧差不证明逻辑正确。先扩展验证器最小能力，再将新增示例列入相应清单。
4. **主示例保持规范**：若新建或修改 `examples/<id>/`，遵守 `example.json` 的 Effect Contract、API claim/evidence、validator 和浏览器矩阵；不要用手册验证结果冒充 Gallery/API 覆盖证据。当前有并行修改的 `examples/gallery.html`、`examples/gltf-catalog/main.js` 等文件，实施前重新检查工作区并合并变更。
5. **测试分层**：文档与链接跑 `node tools/verify/manual-doc-consistency.cjs --strict`、`npm run verify:doc-refs`；涉及 TypeScript 示例跑 `npm run typecheck`；涉及引擎或公开导出变化才跑相关 Jest / 构建；新增浏览器交互跑受影响示例的实测，最终再跑手册全量。`manual-examples-verify.cjs` 会写正典证据，试验或故意失败探针应输出仓库外副本，避免污染当前台账。

## 六、风险与决策口径

- 官方是 **Cocos Creator 4.0** 开发指南，AIR 是无编辑器的 Web Code First 运行时。官方的 Inspector、Prefab 文件工作流、原生发布与平台 SDK 不可原样照搬；每页保留“官方概念 → AIR 用法 → 缺失条件”映射。
- “源码有类”“默认 bundle 导出了类”“示例实跑且交互正确”是三个不同结论。尤其音频自动播放、视频编解码、物理后端、Spine 资源、后处理效果，需要分别验明条件。
- 现有手册有 2026-09-20 的 41/41 证据，现有主示例又处于持续修改中；开工时重新验证指纹、状态及链接，不把历史 PASS 当作新文章的验收。
- 本计划只要求补手册和必要的教学/验证示例。若发现需要改引擎公开面，先记录最小复现、阻断点和接口建议，作为独立实现任务评估；不要为“让文档显得完整”发明尚未发布的 API。

## 七、最终验收清单

- [ ] 所列 P0/P1 官方主题都能从 `docs/manual/index.md` 找到 AIR 对应页、现有示例或明确边界。
- [ ] `index.md`、`creating-text.md`、`physics.md`、`faq.md`、`game.md` 不再陈述当前导出面已推翻的旧能力结论。
- [ ] 新增主题页的代码可从仓库当前公开 API 运行；重用主示例的链接可到达且运行说明明确。
- [ ] 生命周期、事件、资源、UI、物理的新增行为路径有可观察断言；通过、失败、未运行分别记录。
- [ ] 文档引用、一致性、类型检查与受影响浏览器示例验证按 G5 完成，报告附命令、时间、范围及结果。
