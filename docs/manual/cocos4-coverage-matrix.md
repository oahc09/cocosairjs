# Cocos Creator 4.0 指南对照 · AIR 覆盖矩阵（G0 台账）

> 立项计划书：`ai/plans/manual-creator-guide-coverage.md`。
> 本文件是 **G0 基线交付件**：记录官方指南版本、当期 AIR 产物指纹，并把计划书 §三 的每个主题按
> 「官方路径 → AIR 三层证据（源码导出 / 默认 bundle / 浏览器行为）→ 现有页面/示例 → 本计划行动」登记。
> 状态四态与计划书一致：`FULL` ｜ `PARTIAL` ｜ `N/A` ｜ `待验证`。
> **证据纪律：旧证据只作线索。** 所有浏览器证据均标注其测量日期与证据文件；G5 收尾时重采当期结果并回写本表。

## 0. 基线记录

| 项                | 值                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 仓库 HEAD（开工） | `81e2e28`（补充任务计划书），未提交改动仅 `.zcodeignore`（未跟踪）                                                     |
| AIR 版本          | 1.2.0（`build/cocosair.module.js` 内 `AIR_VERSION`）                                                                   |
| bundle 指纹       | sha256₁₆ `9376e3062269376c` / 6,600,546 B                                                                              |
| d.ts 指纹         | sha256₁₆ `60d78ef3fb99db53` / 3,084,595 B                                                                              |
| 官方指南快照      | `E:/AIProMax/github/cocos-docs/versions/4.0/zh`，cocos-docs @ `f183c83f`（2026-06-04），Cocos Creator 4.0 LTS 中文文档 |
| 手册现状          | 10 组 64 条目 → 60 篇文档 + 索引；磁盘 61 个 .md；手册专属示例 41 个（`docs/manual/examples/manual-*`）                |
| 主示例            | `examples/files.json` 58 例（非 shared）                                                                               |
| 旧手册示例证据    | `docs/evidence/manual-examples-verified.json`：41/41 PASS，measuredAt 2026-09-20（**旧，仅线索**）                     |
| 主示例链证据      | `docs/evidence/examples-verified.json`：53/53 PASS、52 promoted（r48 期，随 G5 复核）                              |

「三层核对」口径：**S1** 源码导出（`src/exports/*.ts`）；**S2** 默认 bundle 可用（`build/cocosair.module.d.ts` 含符号且非 feature-variant 独占）；**S3** 浏览器行为通过（仓库内证据文件的当期记录）。S1✓S2✓ 但 S3 缺 → 最高只评 `待验证`；S3 过但带平台/后端条件 → `PARTIAL` 并写明条件。

## 1. 主题矩阵

### P0-1 组件生命周期 — 官方 `scripting/life-cycle-callbacks.md`、`scripting/component.md`、`scripting/create-destroy.md`

| 维度       | 证据                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | `Component` 生命周期回调齐全：d.ts `onLoad`×81 处声明；`onEnable/start/update/onDisable/onDestroy` 均在 `Component` 类上；`Node.active`、`node.activeInHierarchy`、`isValid`、`director.loadScene`×16 |
| S3         | `examples/node-active`（active 停用不渲染不更新，v11 链 PASS）；手册 `manual-update-things`、`manual-dispose-objects`（旧 41/41 证据内）                                                              |
| 现有页面   | `creating-a-scene.md`、`how-to-update-things.md` 各讲一段；`cleanup.md` 讲释放；**无连续生命周期教程**                                                                                                |
| AIR 状态   | **PARTIAL**（能力在、页面缺连续叙述）                                                                                                                                                                 |
| 本计划行动 | G2：新增 `component-lifecycle.md` + `manual-component-lifecycle`（切换 active 与销毁再建，断言回调次数/顺序/监听器清理）；`creating-a-scene.md`、`how-to-update-things.md` 互链；索引加工作流入口     |

### P0-2 输入与事件 — 官方 `engine/event/event-input.md`、`event-node.md`、`event-screen.md`、`scripting/scheduler.md`

| 维度       | 证据                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1/S2      | `input` 单例（d.ts:32037 起：touch/mouse/keyboard/accelerometer）、`InputEventType`、`EventTarget`、`Node.EventType`、`KeyCode`、`EventTouch/EventMouse`、`screen`、`Component.scheduleOnce/schedule/unscheduleAllCallbacks`               |
| S3         | `examples/input`（6 处 input.on：KEY_DOWN/UP、MOUSE_WHEEL、TOUCH_START/MOVE/END，interaction.steps 2 条）；`examples/interaction-click`（TOUCH_START → `window.__clickState()` 可回读 clicks/角度）；浏览器矩阵 13 行 × 3 引擎含真实点击行 |
| 现有页面   | `picking.md`、`tips.md`（键盘）、`game.md` 分散讲；**无选择指南页**；传播/坐标换算/退订清理缺可观测证据页                                                                                                                                  |
| AIR 状态   | **PARTIAL**                                                                                                                                                                                                                                |
| 本计划行动 | G2：新增 `input-and-events.md`，复用 `examples/input`、`interaction-click` 深链；`manual-component-lifecycle` 内含销毁后无回调断言；若传播/退订缺最小闭环再建 `manual-input-events`（先探针后决定）                                        |

### P0-3 资源加载与生命周期 — 官方 `asset/dynamic-load-resources.md`、`asset/release-manager.md`、`scripting/load-assets.md`

| 维度       | 证据                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | 全局 `loadAssetAsync(path, type)` / `loadAssetAsync(url)`（d.ts:55751/55754/55760）；`assetManager`（Bundle/loadRemote/release）；`GLTFLoader.parseAsync` + `GLTFAsset.instantiate/destroy`；`director.loadScene`、`releaseAsset`                                     |
| S3         | `examples/runtime-asset-release`（`window.__lifecycle`：released/leaked/reloaded，v11 链 resource-released）；`examples/gltf-viewer`（URL 参数加载+动画播放）；`examples/audio-basic`、`tiledmap-basic`、`particle-2d-basic` 走 `assetManager.loadRemote`/parser      |
| 现有页面   | `load-gltf.md`、`textures.md`、`cleanup.md` 有局部片段；**无统一叙述**（失败重试、所有权、引用计数、场景切换取消）                                                                                                                                                    |
| AIR 状态   | **PARTIAL**                                                                                                                                                                                                                                                           |
| 本计划行动 | G2：新增 `asset-loading-and-lifetime.md`（`loadAssetAsync` / `assetManager` / `GLTFLoader` 适用边界），回链 `cleanup.md`；评估 `manual-asset-lifecycle`（成功/失败、释放/重载、无已销毁资产复用断言）——优先复用 `runtime-asset-release`，缺口仅在"失败路径"时建最小例 |

### P0-4 文字与 Label — 官方 `ui-system/components/editor/label.md`、`2d-object/ui-system/index.md`

| 维度       | 证据                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | `Label`（d.ts class Label ×4 命中）、`LabelOutline/LabelShadow` 经 `export * from '../cocos/ui'`；2D 导出面 `export * from '../cocos/2d'`                           |
| S3         | `examples/ui-components`：Canvas+Layout 排布、Label 文本随真实点击变化（37 项 claims、真实鼠标 steps，v11 链 PASS）                                                 |
| 现有页面   | `creating-text.md` 仍称"没有 Label / Font"——**与 S1/S2/S3 直接冲突，事实过期**                                                                                      |
| AIR 状态   | **PARTIAL→纠偏**（UI Label 可用；3D 文字几何（TextMesh 类）无导出，仍 N/A；Canvas 贴图路已有页）                                                                    |
| 本计划行动 | G1：重写 `creating-text.md`——三路线上：屏幕 UI 文字（`Label`，深链 `ui-components`）、Canvas 纹理文字、HTML 对齐 3D；同步 `faq.md`「怎么做文字」、`index.md` 状态列 |

### P0-5 物理总述 — 官方 `physics/physics-example.md`、`physics/index.md`

| 维度       | 证据                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | 3D：`PhysicsSystem/RigidBody/Collider 族/PhysicsMaterial/PhysicsRayResult/PhysicsGroup/selector`（`src/exports/physics-framework.ts` 显式导出表 + `physics` 命名空间挂 cclegacy）；后端 builtin+cannon 双编（`createAirApp({ physics: 'builtin'                                                                                           | 'cannon' })`，默认 builtin）；2D：`export * from '../cocos/physics-2d/framework'`（PhysicsSystem2D、RigidBody2D、Collider2D 族、Contact2DType、ERaycast2DType）+ box2d 后端（默认） |
| S3         | `physics-3d-basic`（builtin 边界：不做动力学积分、触发事件 setMask 契约）；`physics-3d-collision`（cannon：重力下落 y≈0.5/1.5、enterTotal=2、raycast 命中法线）；`physics-2d-basic`（backend=box2d/ptmRatio=32 重力读回 + testPoint/raycast）；`physics-2d-collision`（4 类接触事件/sensor/maskBits 过滤，autoSimulation=false 手工定步） |
| 现有页面   | `physics.md` 仍称"没有组件级物理、只在内部命名空间"——**事实过期**；`game.md` 把距离判定说成"physics 篇 N/A 的替代"——**误导**                                                                                                                                                                                                              |
| AIR 状态   | **FULL（能力）/ PARTIAL（文档）**                                                                                                                                                                                                                                                                                                         |
| 本计划行动 | G1+G3：`physics.md` 重写为"2D/3D、后端、能力边界"总述 + 状态改 FULL；`game.md` 改"本小游戏选择简单距离判定"并正链新物理篇；G3 新增 `physics-2d-and-3d.md` 专题                                                                                                                                                                            |

### P1-6 2D/UI 完整工作流 — 官方 `2d-object/2d-render/index.md`、`ui-system/components/editor/{canvas,sprite,label,layout,button}.md`、`ui-system/components/engine/multi-resolution.md`

| 维度       | 证据                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1/S2      | `Canvas/UITransform/Widget/Sprite/Label/Button/Layout/Toggle/Slider/ProgressBar/ScrollView/EditBox/Mask/Graphics/RichText/UIOpacity/SpriteFrame/Texture2D/ImageAsset` 全在导出面；`view/visibleRect/ResolutionPolicy` 分辨率工具           |
| S3         | `examples/ui-components`（Canvas→Layout→Button/Toggle/Slider/EditBox 全链真实点击）；`examples/ui-layout`（两档视口 480x360/320x240 几何全重算，`window.__geom` 读回）；均为 v11 链 PASS                                                   |
| 现有页面   | **手册无 Canvas→Sprite/Label→布局→点击 路径页**；`responsive.md` 偏 3D canvas                                                                                                                                                              |
| AIR 状态   | **FULL（能力）/ 缺页**                                                                                                                                                                                                                     |
| 本计划行动 | G3：新增 `2d-ui.md`（从空场景起步 Code First 组装）与 `ui-layout-and-interaction.md`（坐标/分辨率/布局/交互）；深链 `ui-components`、`ui-layout`；仅当"从空场景起步"确需最小例时建 `manual-2d-ui-start`（先探明 ui-components 是否可拆讲） |

### P1-7 动画 — 官方 `animation/animation-comp.md`、`animation/animation-clip.md`、`animation/skeletal-animation.md`、`tween/tween-example.md`

| 维度       | 证据                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | `AnimationClip`（Asset 子类，`createWithSpriteFrames` 静态构造）、`Animation`（play/pause/交叉剪辑）、`SkeletalAnimation`、`tween` 链式 API、`WrapMode`                                                                                   |
| S3         | glTF 内嵌剪辑：`examples/gltf-viewer`（Animation.play/pause + 下拉切剪辑，S3 过）；蒙皮：`examples/skinned-animation`（程序化骨骼树 buildSkeletonTree + update 驱动）；Tween：`tween-basic`；`anim-position/anim-rotation`（update 手写） |
| 现有页面   | `animation-system.md` 主要讲 Tween；AnimationClip 代码侧创建（非 glTF 内嵌、非 spriteFrames）的**通用轨道 API 无浏览器证据**                                                                                                              |
| AIR 状态   | **PARTIAL**（glTF 内嵌剪辑与骨骼蒙皮 S3 过；通用 AnimationClip 代码构造待验证）                                                                                                                                                           |
| 本计划行动 | G3：`animation-system.md` 增设"剪辑与骨骼动画"小节（glTF 剪辑播放/停止/循环 + SkeletalAnimation + skinned-animation 深链）；通用代码构造 Clip 若实测通过则写、不过则标 `待验证` 并给阻断点                                                |

### P1-8 物理 2D/3D 专题 — 官方 `physics-2d/physics-2d-system.md`、`physics/physics-example.md` 及碰撞相关篇

| 维度       | 证据                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | 见 P0-5；补充：2D 事件形 `collider.on(Contact2DType.BEGIN_CONTACT, cb)`；3D 事件形 `collider.on('onCollisionEnter'                                                                                  | 'onTriggerEnter', cb)`；`PhysicsGroup`/`setMask` 过滤；`autoSimulation` 手工定步 |
| S3         | 同 P0-5 四例（全部 v11 链 PASS，含 3 引擎矩阵物理行）                                                                                                                                               |
| 现有页面   | 手册零覆盖（`physics.md` 还是 N/A 结论）                                                                                                                                                            |
| AIR 状态   | **FULL（能力）/ 缺页**                                                                                                                                                                              |
| 本计划行动 | G3：新增 `physics-2d-and-3d.md`：刚体类型/碰撞层与 Mask/四类事件/两后端差异（builtin=静态+查询+触发、cannon=真实动力学；2D box2d 默认）；真实碰撞/触发事件、过滤规则、重置各配断言路径（深链 4 例） |

### P1-9 音视频 — 官方 `audio-system/overview.md`、`audio-system/audiosource.md`、`ui-system/components/editor/{videoplayer,webview}.md`

| 维度       | 证据                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | `AudioSource/AudioClip/AudioPCMDataView`、`VideoPlayer`（EventType、EventHandler 回调线、透明视频、全屏）、`WebView`（load/loading/error、evaluateJS、卸载重建）、`macro.ENABLE_TRANSPARENT_CANVAS`                                                            |
| S3         | `audio-basic`（手势解锁→8 阶段读回：解码 PCM/播放头/音量/seek 判尾/循环）；`video-basic`（挂载/回调/播控/透明/解码出图/全屏双向）；`webview-basic`（P1~P9：挂载/事件/几何/命中/卸载重建、iframe 点击 0→1）；均 v11 链 PASS（video webkit 行为 F-135 在册间歇） |
| 现有页面   | `index.md` 能力边界仍称音视频"不包含"——**事实过期**；手册零覆盖                                                                                                                                                                                                |
| AIR 状态   | **FULL（Web 条件下）/ 缺页**（Web 手势解锁、编解码由浏览器决定，须按页写明）                                                                                                                                                                                   |
| 本计划行动 | G1：`index.md`/边界总说明更正；G3：新增 `audio-video-webview.md` 三节（音频：手势解锁与自动播放限制；视频：编解码/全屏/透明；WebView：DOM overlay 边界与释放），深链三例，含"卸载后无遗留 DOM/音频"条件说明                                                    |

### P1-10 2D 资产与效果 — 官方 `asset/dragonbones.md`、`asset/spine.md`、`asset/tiledmap.md`、`particle-system/2d-particle/2d-particle.md`

| 维度       | 证据                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | `dragonBones` 命名空间（DragonBonesAsset/DragonBonesAtlasAsset/ArmatureDisplay/CCFactory）；`sp` 命名空间 + `loadWasmModuleSpine`；`TiledMap/TiledMapAsset/TiledLayer/TiledObjectGroup`（正交+等距）；`ParticleSystem2D/ParticleAsset`（plist 解析） |
| S3         | `dragonbones-basic`（运行期构造资产/REALTIME 动画/换图/释放重建，P1~P6）；`tiledmap-basic`（TMX/TSX/图层/object layer/tile 动画，P1~P8）；`particle-2d-basic`（程序化 plist/定步模拟/28 键读回）                                                     |
| 现有页面   | 手册"能力边界"仍把 DragonBones 列入不包含——**事实过期**；TiledMap/2D 粒子无入口；**Spine 无任何已验证示例**（sp 导出在、wasm 装载面在，浏览器证据零）                                                                                                |
| AIR 状态   | DragonBones/TiledMap/2D 粒子 **FULL（能力）/ 缺页**；Spine **待验证**                                                                                                                                                                                |
| 本计划行动 | G1：边界更正（DragonBones 移出"不包含"）；G3：新增 `2d-assets-and-effects.md` 四小节（DragonBones/TiledMap/2D 粒子写已验证路径；Spine 单独一节列 `待验证` 与阻断点：需 wasm 装载 + 已验证样例，不由 DragonBones 推断）                               |

### P2-11 后处理与 Shader — 官方 `render-pipeline/use-post-process.md`、`render-pipeline/post-process/custom.md`、`shader/index.md`

| 维度       | 证据                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1/S2      | `export { postProcess }`（`src/exports/custom-pipeline-post-process.ts`，d.ts:55107 namespace）；V1.2 custom pipeline 出口在；`Camera.postProcess` setter（d.ts:25128）                                    |
| S3         | `manual-post-processing`（旧 41/41 证据内，ANIMATED 集）——但计划书判定"用户侧装配能力未在本次证实"，旧证据不作为当期通过                                                                                   |
| 现有页面   | `post-processing.md`（N/A）、`how-to-use-post-processing.md`（PARTIAL）、`debugging-glsl.md`（N/A）、`shadertoy.md`（N/A）保留早期探针结论                                                                 |
| AIR 状态   | **待验证**                                                                                                                                                                                                 |
| 本计划行动 | G4：小范围能力复核——API→样例→**像素级变化**（参数变化 + 故意编译错误定位），通过后才改手册状态；正式 Shader 示例与 `ai/plans/api-scenarios-shaders.md` 衔接，不重复计工作量 |

### 边界外主题（进边界页说明，不做教程）

Creator 编辑器/Inspector/Prefab 工作流、Dashboard、原生 JSB、平台发布、XR、WebGPU、地形、完整 3D 粒子、Marionette 动画、L10N：官方指南有此流程，但 AIR 当前发行目标（无编辑器 Web Code First 运行时）或公开工作流不同。现有 `how-to-create-vr-content.md`、`webgpurenderer.md`、`webxr-*.md`、`offscreencanvas.md` 维持 N/A 如实说明。

## 2. 按主题的「官方主题 → AIR 状态 → 页面/示例 → 行动」速览

| #   | 官方锚点                                        | AIR 状态                                      | 现有页面/示例                                                                                | 行动（批次）                        |
| --- | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | scripting/life-cycle-callbacks 等               | **FULL**（G2 清偿）                           | node-active；manual-update-things；`component-lifecycle.md`+`manual-component-lifecycle`     | ✅ 已交付（G2）                     |
| 2   | engine/event/*、scheduler                       | **FULL**（G2 清偿）                           | input、interaction-click；`input-and-events.md`+`manual-input-events`                        | ✅ 已交付（G2）                     |
| 3   | asset/dynamic-load-resources 等                 | **FULL**（G2 清偿）                           | runtime-asset-release、gltf-viewer；`asset-loading-and-lifetime.md`+`manual-asset-lifecycle` | ✅ 已交付（G2）                     |
| 4   | ui-system/label、2d-object                      | **FULL**（G1 纠偏）                           | ui-components；`creating-text.md` 三路线重写 + `2d-ui.md`                                    | ✅ 已交付（G1+G3）                  |
| 5   | physics/*                                       | **FULL**（G1 清偿）                           | physics-3d-basic/collision、physics-2d-basic/collision；`physics.md` 重写                    | ✅ 已交付（G1+G3）                  |
| 6   | ui-system/{canvas…button}、multi-resolution     | **FULL**（G3 清偿）                           | ui-components、ui-layout；`2d-ui.md`+`ui-layout-and-interaction.md`                          | ✅ 已交付（G3）                     |
| 7   | animation/*、tween                              | **FULL**（G3 增补；代码构造 Clip 实测）       | gltf-viewer、skinned-animation、tween-basic、manual-animation-system(+2 断言)                | ✅ 已交付（G3）                     |
| 8   | physics-2d/*                                    | **FULL**（G3 清偿）                           | physics-2d-basic/collision；`physics-2d-and-3d.md`                                           | ✅ 已交付（G3）                     |
| 9   | audio-system/*、videoplayer、webview            | **FULL（Web 条件）**（G3 清偿）               | audio-basic、video-basic、webview-basic；`audio-video-webview.md`                            | ✅ 已交付（G3）                     |
| 10  | asset/{dragonbones,spine,tiledmap}、2d-particle | 3×**FULL**（G3 清偿）+ Spine **待验证**       | dragonbones/tiledmap/particle-2d-basic；`2d-assets-and-effects.md`（Spine 阻断点 §4）        | ✅ 已交付（G3，Spine 留待验证）     |
| 11  | render-pipeline/post-process、shader            | **待验证**（装配面证实、像素证据缺，G4 探针） | manual-post-processing（旧）；`how-to-use-post-processing.md` 纠偏                           | ✅ 复核完成（G4，衔接 Shader 计划） |

## 3. G4 能力复核记录（2026-09-25）

### 后处理（P2-11）——保持 `待验证`（装配面已证实，像素效果未证实）

一次性浏览器探针（chromium headless，同日执行；输出为仓库外诊断，不入正典证据）：

1. **装配面已证实**：`postProcess.PostProcess` 为组件形态（`addSetting`/`settings`，
   非 `addPass`）；`new BlitScreen()` + `new Bloom()`（threshold 0.1 / intensity 8 / iterations 2）
   逐个 `addSetting` → 挂 `camera.postProcess` → `usePostProcess=true`，全程零报错、
   `settings.size=2` 读回一致。V1.2 的 custom-pipeline 出口把装配类放进来了，
   `how-to-use-post-processing.md` 的旧"PostProcess 未顶层导出"结论已过期并更正。
2. **像素效果未证实**：静态内容 + 亮方块，`usePostProcess` 开/关像素对照 `on1===off1`
   （无差异）；而两次开态捕获 `on1!==on2`（非确定差异）——无法把像素变化归因于效果参数。
   "装配成功"≠"效果生效"。
3. **阻断点（升级 FULL 的剩余信号）**：像素级 A/B 可归因（确定性场景下开/关或参数变化产生
   稳定像素差异）+ 最小 bloom 示例进验证清单 + 自定义 pass/材质装配链验证
   （衔接 `ai/plans/api-scenarios-shaders.md`，Shader 创作面的
   故意编译错误定位在该计划实施）。

### Spine（P1-10）——保持 `待验证`

阻断点：wasm 装载路径（`loadWasmModuleSpine`）未在浏览器实跑；无自产最小 Spine 资产；
Skeleton 组件装配链路无样例。不由 DragonBones 可用性推断。详见 [2D 资产与效果](./2d-assets-and-effects.md) §4。

## 4. G5 回写区（当期复测结果，2026-09-25）

- [x] 手册示例全量复测：`node tools/verify/manual-examples-verify.cjs`（不带 --ids）→ 实测 **44/44 PASS**（partial:false，measuredAt 2026-09-25T07:20:50Z）
- [x] 新增示例复测与行为探针结果：`manual-component-lifecycle` 14 断言、`manual-input-events` 11 断言、`manual-asset-lifecycle` 9 断言（含故意 404 失败路径，网络日志豁免在案）、`manual-animation-system` +2 断言（代码构造 Clip 播放/冻结）——全部 PASS
- [x] `node tools/verify/manual-doc-consistency.cjs --strict` → PASS（68 篇声明、44 例逐字节核对、strict）
- [x] `npm run verify:doc-refs` → ok:true（128 docs / 1221 refs / 零新断链）
- [x] `npm run typecheck` → PASS（引擎源码零改动）
- [x] 本矩阵状态列按当期证据刷新：#1/#2/#3 升 FULL（新页+新例）；#5/#8 物理文档面清偿；#11 后处理保持待验证（G4 探针阻断点见 §3）
- 验收报告：`docs/evidence/manual-cocos4-gaps-report.md`
