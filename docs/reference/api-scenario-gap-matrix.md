# API 场景覆盖差距矩阵（G0 交付件）

> 立项计划书：`ai/plans/api-scenarios-shaders.md`。
> 本文件是 **G0 基线与覆盖诊断交付件**：基线记录、未 verified 的 `coverageRequired` 单元差距形状、
> Top 20 组合路径（含实施去向）、重复/断链盘点与过期证据隔离。
> 口径与 `docs/api-coverage-report.json` 的语义块一致：claimed ≠ attested ≠ verified，分母 = inventory 中
> `coverageRequired=true` 单元。本文件不复算覆盖率，只引用当期报告并做差距定位。

## 0. 基线记录（开工时刻）

| 项                   | 值                                                                                           | 核验方式                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 仓库 HEAD            | `7a33e11`（r49 治理修正），分支 `main`                                                       | `git rev-parse HEAD`                                                               |
| AIR 版本             | 1.2.0                                                                                        | `package.json`                                                                     |
| bundle 指纹          | sha256₁₆ `9376e3062269376c` / 6,600,546 B                                                    | 本期重算，与 r47/r49 记录一致                                                      |
| d.ts 指纹            | sha256₁₆ `60d78ef3fb99db53` / 3,084,595 B                                                    | 本期重算一致                                                                       |
| candidateFingerprint | `f6036adc8526e925`                                                                           | `api-trace.cjs candidateFingerprint()` 当期重算 = 报告值，**未过期**               |
| inventoryFingerprint | `15d629f3a2262d01`                                                                           | 当期重算 = 报告值，**未过期**                                                      |
| 覆盖报告 generatedAt | 2026-09-25T07:30:02Z（HEAD 同期生成）                                                        | `docs/api-coverage-report.json`                                                    |
| Jest                 | 32 套件 / 263 用例全绿（r49 门禁日志）                                                       | `docs/audits/global-quality-audit-2026-09-19/raw/gates/r49-jest.log`               |
| Gallery 示例         | `examples/files.json` 登记 61 例（revision `7a33e11`，07:46Z 再生成）；目录 ↔ 登记双向无断链 | 本期脚本比对                                                                       |
| 手册示例             | `docs/manual/examples/` 44 例，独立验证器 44/44 PASS（07:20Z，非 partial）                   | `docs/evidence/manual-examples-verified.json`                                      |
| Recipes              | V0.6 期 30 条（R001–R030）全部 promoted/stable                                               | `docs/evidence/recipes-promoted.json`、`tools/benchmark/recipes/scenarios.cjs` |

**计划书快照数值勘误**：计划书写于 58 例快照；当期 `files.json` 已为 **61 例**（新增
`camera-screen-world`、`math-bits`、`node-events`，见 §0.1）。计划书引用的「5 个 stale evidence examples」
已在 r49 刷新，当期 `staleEvidenceExamples = []`；「1 个 schema gap」仍在（§5）。

### 0.1 并发工作区状态（重要）

G0 开工观测到**另一条并行会话正在实时修改本仓库**（计划书 §6 预警情形成立）：

- 未跟踪新目录：`examples/camera-screen-world/`、`examples/math-bits/`、`examples/node-events/`（15:40–15:42 创建，持续编辑中）；
- `examples/files.json` 已修改（58 → 61 例登记）；
- `docs/evidence/examples-verified.json` 被 partial 运行覆写（07:42Z，`subset=[camera-screen-world, math-bits, node-events]`，53/55 PASS，其中 `camera-screen-world`、`math-bits` 因 TS 编译错误 FAIL，且文件在观测期间仍在被更新）。

**处置**：本计划线不触碰上述文件与三个示例目录（计划书规定「不得并发改同一示例的规格或正典证据」）；
Top 20 中与并行线重叠的路径（P02/P03/P17）标记为「并行线进行中」，只做登记不做实施。
`camera-screen-world` 的编译错误提示 `Camera.isWindowSize / setFixedSize / screenPointToRay` 的
example 侧签名与当期 d.ts 不符——属于并行线的修复范围，本矩阵在 P03 登记该功能面缺口线索。

## 0.2 并发事件与 staging 决策（实施期增补，2026-09-25 下午）

- 并行会话自 15:40 起持续扩充覆盖战役：examples/ 新增 camera-screen-world、math-bits、node-events、
  batching-utility、camera-geometry-extras、camera-second-view、camera-viewport-props、color-timeline-key、
  colortimeline-ops、directional-light-face、gltf-asset-readonly 等目录，并重采全量正典证据
  （v11-examples-verified / files.json / 全部截图 PNG 处于修改态）。
- **17:50 前后发生 examples/ 未跟踪目录清理事件**：本计划线首批建在 examples/ 下的 5 个 G1 示例与
  1 个诊断探针被清除（docs/、tools/ 新增文件幸存）。判定为并行线全量验证前的工作区复位动作。
- **处置**：G1 全部在制品迁移至隔离工作区 g1-staging（含 shared 副本；导入路径保持正典形态
  `../../shared/`。该工作区已于 2026-09-26 整目录清退：示例正典在 examples/，探针迁 `tools/debug/probes/`，
  见 v12-owner-decisions §10）。试验运行器 `tools/verify/trial-probes.cjs`
  支持 `--root=`；正典集成（files.json 再生成、v11 全链证据、coverage 回填、smoke 计数、specStatus
  冻结）统一推迟到并行线落定后执行，避免共享正典文件并发写。
- 并行线新目录与 Top 20 的 P02/P03/P17（Node/Camera/math）高度重叠——本计划线不触碰其文件；
  G1 五例（P01/P04+P05/P06+P07/P08/P09+P19）与其无目录交集。

## 1. 覆盖分母与差距形状（当期报告 + inventory 交叉）

| tier      | required 分母       | verified               | 未 verified required | 备注                                                            |
| --------- | ------------------- | ---------------------- | -------------------- | --------------------------------------------------------------- |
| core      | 816                 | 56（call 54 / read 2） | **760**              | 门禁地板 6% ratchet PASS；V1.1 目标 100% 未达（r49 判 NOT MET） |
| important | 1,773               | 20（call 18 / read 2） | **1,753**            | 门禁地板 1% ratchet PASS；V1.1 目标 90% 未达                    |
| advanced  | 0（NOT_APPLICABLE） | 106（披露值）          | —                    | 不纳入本轮                                                      |

未 verified required 单元按模块聚类（core 加权排序，节选）：

| 模块                                                                              | core        | important       | 主要缺口面                                                                                                    |
| --------------------------------------------------------------------------------- | ----------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `math.*`                                                                          | 291         | 0               | Vec2(33)/Vec3(34)/Vec4(32)/Quat(23)/Mat3(27)/Mat4(42)/Size(8)/Rect(15)/Color(20)/bits(21)/标量函数            |
| `Node.*`                                                                          | 60          | 0               | 树操作（setParent/insertChild/walk/getChildByPath/removeAllChildren…）、attr、uuid 索引                       |
| `Camera.*`                                                                        | 35          | 0               | 窗口/视口（resize/setFixedSize/isWindowSize/screenScale）、initialize/destroy/attachToScene、postProcess 开关 |
| `MeshRenderData/MeshBuffer/Mesh/MeshAttachment`                                   | 24+13+17+16 | 0               | 网格数据读写、缓冲、合并                                                                                      |
| `MeshRenderer.*`                                                                  | 23          | 0               | 生命周期回调、morph 权重（getWeight/setWeights）、bakeSettings                                                |
| `Color.*`                                                                         | 18          | 0               | 构造/分量/拷贝/字符串解析                                                                                     |
| `Layers.*`                                                                        | 17          | 0               | 层常量、makeMaskExclude、addLayer                                                                             |
| `Texture2D.*`                                                                     | 15          | 0               | create/reset/updateMipmaps/releaseTexture/initDefault                                                         |
| `SceneGlobals.*`                                                                  | 14          | 0               | ambient/shadows/fog/skybox/octree/skin/lightProbeInfo/postSettings                                            |
| `Light.*`                                                                         | 13          | 0               | initialize/attachToScene/detachToScene/生命周期                                                               |
| `Material.*`                                                                      | 11          | 0               | getProperty/copy/reset/recompileShaders/overridePipelineStates/resetUniforms                                  |
| `primitives.*`                                                                    | 11          | 0               | cone/quad/circle/wireframe/translate/scale/normals                                                            |
| `GLTFAsset.*`                                                                     | 11          | 0               | owned/meshes/materials/textures/skeletons/animations/sceneNames/images                                        |
| `Scene.*`                                                                         | 10          | 0               | constructor/destroy/autoReleaseAssets/dependAssets/updateWorldTransform                                       |
| `EffectAsset.*`                                                                   | 14          | 0               | **register/get/remove/techniques/shaders**（G4 探针主对象）                                                   |
| `Skeleton/SkeletonData/SkeletonInstance`（DragonBones）                           | 0           | 88+46+26        | 骨骼缓存与实例                                                                                                |
| `Animation/AnimationState/AnimationClip/AnimationConfig/AnimationData`            | 0           | 43+79+30+30+37  | 播放控制、状态机、事件                                                                                        |
| `ParticleSystem2D/Particle`                                                       | 0           | 59+25           | 发射器与粒子生命周期                                                                                          |
| `SpriteFrame/Sprite/Label/UIRenderer/TextStyle/graphics-Impl`                     | 0           | 32+7+6+22+26+29 | 2D/UI 渲染装配                                                                                                |
| `Tween.*`                                                                         | 0           | 29              | to/by/union/reverse/clone/pause/resume/tag                                                                    |
| `Widget.*`                                                                        | 15          | 0               | updateAlignment/setDirty/对齐生命周期                                                                         |
| `PipelineSceneData/ColorAttachment/LightingStage/ColorGradingPass/LightProbeInfo` | 20+8+7+7+11 | 0               | 渲染管线与后处理                                                                                              |
| `AssetManager.Pipeline`                                                           | 9           | 0               | insert/append/remove/sync/async                                                                               |
| `Input/input`                                                                     | 6+1         | 0               | getTouch/getAllTouches/getTouchCount/accelerometer                                                            |
| `NodeActivator/director/game`                                                     | 6+1+1       | 0               | 激活器与全局单例                                                                                              |

## 2. Top 20 组合路径（按业务动作组织）

> 字段口径：**调用链** = 计划穿透的 API 序列（稳定 ID 取自 inventory 单元名）；**现有示例** = 已能部分背书的
> Gallery/手册/Recipe 资产；**缺少 validator** = 需补的行为断言；**去向** = 实施批次与新示例 ID。
> 成本为单人估算（人日），含 example.json 规格、验证器、浏览器证据与覆盖回填。

### P01 动态场景切换与复入（去向：G1 `scene-switch-reentry`）

- **调用链**：`createAirApp` → `Scene.constructor` → `Node`/`Component` 组装 → `director.run(scene)` → `Scene.destroy` → `NodeActivator.activateNode`（再入新场景）→ `Scene.autoReleaseAssets` / `Scene.dependAssets` / `Scene.updateWorldTransform`
- **正常结果**：新场景可见可更新；旧场景节点停止 update；复入后组件生命周期计数从头开始。
- **边界/错误**：销毁后事件监听不残留（对已销毁节点 emit 无回调）；`autoReleaseAssets=true` 时依赖资产被释放、再次加载可用；同帧销毁+切换不崩溃。
- **现有示例**：`node-active`（active 冻结）、手册 `manual-component-lifecycle`（14 断言，非 coverage 证据源）、`rc-create-node`。
- **缺少 validator**：场景级复入探针（`window.__sceneProbe()`：旧场景 update 计数冻结、监听器计数归零、新场景首帧非背景像素）。
- **约束**：无后端要求；全浏览器矩阵适用。
- **成本**：1。

### P02 Node 树操作与生命周期（去向：G1 `scene-switch-reentry` 复用 + `node-hierarchy` 增强；**并行线 `node-events` 进行中**）

- **调用链**：`Node.setParent/getParent/insertChild/removeFromParent/removeChild/removeAllChildren/walk/getChildByPath/getChildByUuid/setSiblingIndex/attr` + `Node.EventType` 订阅/退订 + `NodeActivator.activateNode/activateComp/destroyComp`
- **正常结果**：树结构操作后 `getChildByPath`/`walk` 结果一致；removeFromParent 后节点不再渲染更新。
- **边界/错误**：destroy 帧末生效（当帧仍可见）；对已销毁子树 walk 安全；sibling index 越界行为。
- **现有示例**：`node-hierarchy`、`node-active`、`transform`；并行线 `node-events`（未跟踪，TS 状态未知）。
- **缺少 validator**：树状态快照探针（结构哈希前后对比）、销毁后事件静默断言。
- **约束**：无。
- **成本**：0.5–1（视并行线成果裁剪）。

### P03 相机窗口/投影/拾取射线（去向：G1 `render-composite`；**并行线 `camera-screen-world` 进行中且当前编译 FAIL**）

- **调用链**：`Camera.initialize` → `Camera.resize/setFixedSize/isWindowSize/screenScale` → `Camera.worldToScreen/screenToWorld/screenPointToRay` → `geometry.Ray` → `Camera.attachToScene/detachToScene/destroy`
- **正常结果**：screen↔world 往返一致（误差 < 0.01）；射线方向与点击位置对应；固定尺寸后视口按 480×320 渲染。
- **边界/错误**：resize 中途拾取不崩溃；WebGL1 下 `screenPointToRay` 结果等价声明。**缺口线索**：并行线报 `TS2339 isWindowSize/setFixedSize 不存在于 Camera`、`TS2345 Ray 参数不匹配`——若 d.ts 确实未导出该面，登记为最小功能缺口（导出面），不得为过例新造包装 API。
- **现有示例**：`camera`、`camera-ortho`、`camera-multi`、`camera-lookat`（均 verified 部分 API）；并行线 `camera-screen-world`。
- **缺少 validator**：往返数值断言 + resize 前后帧差。
- **约束**：WebGL1/2 双跑。
- **成本**：1（缺口另计）。

### P04 模型角色交互：双实例 glTF（去向：G1 `model-character-interaction`）

- **调用链**：`GLTFLoader.parseAsync` → `GLTFAsset.instantiate`×2 → `GLTFAsset.owned/meshes/materials/textures/skeletons/animations/sceneNames/images/meshMaterials` → `Skeleton`/`SkeletonInstance`（独立动画）→ `input.on(TOUCH_START)` + `Camera.screenPointToRay` 拾取 → `Material.copy` 高亮反馈 → 其一 `destroy`
- **正常结果**：两实例动画相位独立；点击仅选中命中实例；材质反馈只作用于选中者。
- **边界/错误**：销毁一份后另一份继续更新（状态隔离探针）；`GLTFAsset.owned` 资产在 destroy 后可再次 instantiate；点击空白处取消选择。
- **现有示例**：`gltf-basic/gltf-skin/skinned-animation`（加载+播放）、`interaction-click`（拾取原型）、Recipe R004/R016/R017/R019（multi-instance/click-animation/click-material/selection 语义探针，V0.6 stable，可直接复用其 `__state` 探针设计）。
- **缺少 validator**：双实例隔离断言（instanceCount、各自 animationTicks 独立递增）、释放后无悬空引用（`isValid===false` 且无 console error）。
- **约束**：随包 glTF fixture；WebGL1 降级为无蒙皮时的声明结果。
- **成本**：1.5–2。

### P05 动画播放控制状态机（去向：G1 `model-character-interaction` + G2 各游戏复用）

- **调用链**：`Animation.playOnLoad/getState/createState/removeState/crossFade/pause/resume/stop/play` → `AnimationState.time/duration/speed/wrapMode/on/once/off/emit` → `AnimationClip.sample/getTrack/addTrack/createWithSpriteFrames`
- **正常结果**：play 后 `AnimationState.time` 递增；pause 冻结；crossFade 平滑切换；事件帧触发回调。
- **边界/错误**：stop 后 time 归零；removeState 后 getState 返回空；动画中销毁节点无残留回调；wrapMode 循环边界帧。
- **现有示例**：`skinned-animation`（播放）、`anim-position/anim-rotation`（程序化）、手册 `manual-animation-system`。
- **缺少 validator**：播放状态探针（time/paused/事件计数可回读）。
- **约束**：无后端要求。
- **成本**：1.5。

### P06 2D 物理交互全链（去向：G1 `physics-interaction`）

- **调用链**：`input.on` → `RigidBody2D`/`Collider2D`（contact/beginContact/endContact）→ 事件回调计数 → UI 状态更新 → 重置（清刚体、复位）
- **正常结果**：接触/离开事件成对；重置后可复现同一轨迹（固定步长）。
- **边界/错误**：后端（builtin/box2d）真实标注；无物理后端时明确降级信息而非静默；快速连续重置不泄漏刚体。
- **现有示例**：`physics-2d-basic`、`physics-2d-collision`（已 verified 基础面）。
- **缺少 validator**：接触计数断言 + 重置幂等探针 + 后端指纹记录。
- **约束**：物理后端选择必须写入 example.json；浏览器矩阵含低端机降级行。
- **成本**：1。

### P07 3D 物理 + 射线拾取交互（去向：G1 `physics-interaction` 合并或拆 `physics-3d-interaction`）

- **调用链**：`geometry.Ray` + `PhysicsSystem.raycast` → `RigidBody`/`Collider` → 命中事件 → 施加冲量 → UI 反馈 → 重置
- **正常结果**：射线命中列表与场景一致；冲量后刚体运动可观察；重置恢复初态。
- **边界/错误**：raycast 无命中返回空数组；同时命中多体的排序稳定；静止刚体不参与检测的语义正确。
- **现有示例**：`physics-3d-basic`、`physics-3d-collision`。
- **缺少 validator**：命中计数/冲量后速度探针。
- **约束**：后端（builtin/cannon）标注；WebGL1 无差别。
- **成本**：1。

### P08 UI + 异步资源加载/失败/重试/释放（去向：G1 `ui-asset-loading`）

- **调用链**：`Button`/`Label` UI 控件 → `loadAssetAsync`（成功 + 404 失败两路）→ `AssetManager.Pipeline.insert/append/remove/sync/async` → 进度/错误 UI → 重试 → `releaseAsset`；`SpriteFrame.createWithImage` 上屏
- **正常结果**：成功路径纹理显示；失败路径错误文案 + 重试按钮；重试成功后正常显示；释放后纹理内存回收探针。
- **边界/错误**：加载中快速重复点击（去抖/幂等）；加载中切场景（无悬空回调，`isValid` 检查）；连续失败 N 次后停止自动重试。
- **现有示例**：`runtime-asset-release`（释放/泄漏探针）、`ui-components`、手册 `manual-asset-lifecycle`（404 豁免名单内，行为断言自证）。
- **缺少 validator**：回调悬空断言（切场景后 promise 回调计数不再增加）、加载状态机探针（idle/loading/error/done）。
- **约束**：404 fixture 走本地静态文件；console error 豁免需按手册验证器同款 allowlist 机制登记。
- **成本**：1–1.5。

### P09 后处理与渲染目标组合（去向：G1 `render-composite`）

- **调用链**：`Camera.postProcess/usePostProcess` → `SceneGlobals.postSettings` → `ColorGradingPass.checkEnable/render` → `RenderTexture`/`ColorAttachment.format/loadOp/storeOp` → `PipelineSceneData.renderObjects` → resize
- **正常结果**：开关后处理帧差可测（读回像素对比）；渲染目标内容可采样；resize 后 RT 尺寸跟随。
- **边界/错误**：WebGL1 或能力不足时明确结果（禁用 + 提示，不黑屏不崩溃）；重复开关不泄漏 RT。
- **现有示例**：手册 `manual-post-processing`、`manual-render-targets`（44/44 绿但**不在 coverage 证据源**，需迁 Gallery 或建对应示例才能回填 verified）。
- **缺少 validator**：帧差/读回验证器（现有 spec validator 仅 scene-ready/frame-diff 级）。
- **约束**：WebGL2 必需面要显式声明；矩阵含 WebGL1 降级行。
- **成本**：1.5–2。

### P10 场景环境全局（fog/shadow/ambient/skybox）（去向：G1 `render-composite` 第二阶段）

- **调用链**：`Scene._globals` → `SceneGlobals.ambient/shadows/fog/_skybox/octree/skin/lightProbeInfo/activate` → 参数渐变 → 帧差
- **正常结果**：每个全局参数改变都产生可测像素变化。
- **边界/错误**：参数极值（fog density 0/1）不产生 NaN；`activate` 幂等。
- **现有示例**：手册 `manual-fog`、`manual-backgrounds`；Gallery 无专例。
- **缺少 validator**：参数→帧差映射表验证器。
- **约束**：WebGL2（skybox IBL 面在 WebGL1 的降级需声明）。
- **成本**：1。

### P11 自定义 Shader 最小探针（去向：**G4 探针** `shader-probe`（隔离示例，不进 Gallery 直至探针结论））

- **调用链**：`EffectAsset.register`（用户 effect JSON：顶点+片元源码）→ `EffectAsset.get` → `Material.initialize({effectAsset})` → `Material.setProperty`（uniform）→ `MeshRenderer` 上屏 → `Material.recompileShaders/overridePipelineStates` → `EffectAsset.remove`/`Material.destroy`
- **正常结果**：用户片元源码改变像素；时间 uniform 驱动动画（帧差验证）。
- **边界/错误**：故意语法错误 → 可定位的编译/链接错误信息路径；重复 register 同名 effect 的行为；WebGL1 降级结果；remove 后材质失效方式。
- **现有示例**：**无**（`docs/manual/shadertoy.md`、`debugging-glsl.md` 均 N/A）；`EffectAsset` 14 个 required 单元全部未 verified。
- **缺少 validator**：像素读回 + uniform 帧差验证器；编译错误诊断断言。
- **约束**：WebGL2 主证、WebGL1 对照；探针失败则按计划书 G4.3 走最小接口任务，不得先宣称支持。
- **成本**：1–2（探针）；正式示例另计 2–6。

### P12 Tween 链式动画与控制（去向：G2 消消乐动画队列前置；小例 `tween-control`）

- **调用链**：`Tween.to/by/delay/call/union/reverse/clone/start/stop/pause/resume/tag/getTarget/bindNodeState`
- **正常结果**：链式动画按序执行；union 合并；reverse 回放；pause/resume 状态正确。
- **边界/错误**：stop 后目标状态；节点销毁时 tween 自动失效（无悬空回调）；同 target 多 tween 的 tag 隔离。
- **现有示例**：`tween-basic`（基础 verified）。
- **缺少 validator**：tween 状态探针（playing/paused/finished 计数）。
- **约束**：无。
- **成本**：0.5。

### P13 2D 粒子发射与生命周期（去向：G2 坦克/魂斗罗特效前置；`particle-2d-control`）

- **调用链**：`ParticleSystem2D`（发射参数）→ `Particle`（生命周期）→ 运行时启停 → 对象复用计数
- **正常结果**：发射率与生命周期参数可观察（粒子计数探针）；停止发射后粒子自然消亡。
- **边界/错误**：切场景时粒子系统清理；极端发射率不崩溃。
- **现有示例**：`particle-2d-basic`（基础面 verified）。
- **缺少 validator**：粒子计数/消亡探针。
- **约束**：无后端要求；canvas 读回验证帧差。
- **成本**：1。

### P14 2D/UI 渲染装配（去向：G2 俄罗斯方块/消消乐渲染层；`ui-render-data`）

- **调用链**：`UIRenderer.markForUpdateRenderData/requestRenderData/destroyRenderData` → `Sprite.changeSpriteFrameFromAtlas` → `Label.updateRenderData/setEntityColor` → `graphics-Impl`（画线/矩形）→ `TextStyle/TextLayout`
- **正常结果**：SpriteFrame 替换即时上屏；Label 文本/颜色更新；graphics 绘制指令产生像素。
- **边界/错误**：组件禁用后 renderData 不再更新；频繁替换 SpriteFrame 无泄漏。
- **现有示例**：`ui-components`、`ui-layout`、手册 `manual-drawing-lines`。
- **缺少 validator**：renderData 版本计数探针 + 帧差。
- **约束**：无。
- **成本**：1–1.5。

### P15 Widget 对齐与响应式（去向：G2 产品查看器（尺寸响应）；`widget-responsive`）

- **调用链**：`Widget.updateAlignment/setDirty` → `view` resize → `Camera.resize` → UI 重新对齐
- **正常结果**：窗口尺寸变化后对齐边距保持；锚点变化触发重对齐。
- **边界/错误**：resize 风暴（连续快速变化）不产生错位；目标节点销毁后 `_validateTargetInDEV` 行为。
- **现有示例**：`ui-layout`、手册 `manual-responsive-design`。
- **缺少 validator**：resize 前后对齐数值探针。
- **约束**：需浏览器视口控制（playwright setViewport）。
- **成本**：0.5。

### P16 Layers 可见性与拾取过滤（去向：G1 `render-composite` / G2 魂斗罗碰撞层；`layers-visibility`）

- **调用链**：`Layers.makeMaskExclude/addLayer/UI_2D/IGNORE_RAYCAST` → `Camera.visibility` → 渲染剔除 → 射线拾取过滤
- **正常结果**：层掩码改变后对应节点不渲染/不被拾取。
- **边界/错误**：自定义层位耗尽；IGNORE_RAYCAST 层节点点击穿透到下层。
- **现有示例**：无专例（`camera` 系列仅默认层）。
- **缺少 validator**：可见性像素断言 + 拾取命中列表断言。
- **约束**：无。
- **成本**：0.5–1。

### P17 math 运算聚合例（去向：G0 后续批次；**并行线 `math-bits` 进行中（bits 子集，当前编译 FAIL）**）

- **调用链**：`math.Vec2/Vec3/Vec4/Quat/Mat3/Mat4/Size/Rect/Color` 各运算 + 标量函数（clamp/lerp/toRadian/nextPow2…）
- **正常结果**：数值断言逐函数通过（与参考值表对比）。
- **边界/错误**：NaN/Infinity 传播语义；四元数归一化边界；矩阵求逆奇异矩阵。
- **现有示例**：并行线 `math-bits`（bits 21 单元）；Vec/Mat 系列（231 单元）无示例。
- **缺少 validator**：参考值表驱动断言（可复用 jest + 浏览器双通道）。
- **约束**：纯计算，无后端；但 verified 语义要求浏览器内调用证据。
- **成本**：1（聚合例，按子命名空间分片）。**与并行线协调后再排**，避免同文件并发。

### P18 程序化几何与网格读写（去向：G2 游戏场景搭建；`mesh-programmatic`）

- **调用链**：`primitives.cone/quad/circle/translate/scale/wireframe/normals` → `utils.createMesh` → `Mesh.readAttribute/copyAttribute/merge/initialize/getBoneSpaceBounds` → `MeshRenderer.setWeights/getWeight`（morph）
- **正常结果**：程序化几何顶点数/包围盒符合预期；morph 权重改变形状（帧差）。
- **边界/错误**：merge 不同属性集网格的报错路径；空几何防御。
- **现有示例**：`mesh-*` 5 例（createMesh 面 verified）、`gltf-morph`（权重动画）。
- **缺少 validator**：几何数据探针（readAttribute 数值断言）。
- **约束**：无。
- **成本**：1。

### P19 灯光生命周期与增删（去向：G1 `render-composite`；`light-lifecycle`）

- **调用链**：`Light.initialize/attachToScene/detachToScene/onEnable/onDisable/destroy` → `LightingStage.gatherLights` → 光照帧差
- **正常结果**：运行时加灯/删灯画面即时变化；disable 冻结照明贡献。
- **边界/错误**：超出灯光数量上限的行为；销毁后 gatherLights 不含残留。
- **现有示例**：`light-point/light-spot/light-sphere/light-two-directional`（静态配置 verified）。
- **缺少 validator**：灯光增删前后帧差 + 场景灯光计数探针。
- **约束**：WebGL1/2 灯数上限差异需声明。
- **成本**：0.5–1。

### P20 材质参数与颜色系统（去向：G2 产品查看器（材质切换）；`material-parameters`）

- **调用链**：`Material.getProperty/copy/reset/resetUniforms/initDefault/validate` → `Color.set/setFromString/setFromColor/lerp` → `MeshRenderer.sharedMaterial vs material 实例` 隔离
- **正常结果**：材质实例复制后独立修改互不影响；颜色字符串解析正确；reset 恢复默认。
- **边界/错误**：getProperty 未定义 uniform 的返回语义；对 sharedMaterial 直接改写的污染检测（教学性失败路径）。
- **现有示例**：`material-basic/material-color/material-transparent/material-unlit`（setProperty 面 verified）、Recipe R005/R009（material-variants）。
- **缺少 validator**：材质实例隔离探针 + 颜色数值断言。
- **约束**：无。
- **成本**：0.5–1。

### Top 20 → 批次映射汇总

| 去向             | 路径                                                                                              | 对应计划书条目 |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| G1 首批 5 例     | P01(+P02) 场景切换、P04(+P05) 模型角色、P06+P07 物理交互、P08 UI+资源、P09(+P10/P16/P19) 渲染组合 | §3 G1 表       |
| G2 游戏/应用复用 | P05/P12/P13/P14/P15/P18/P20                                                                       | §3 G2 表       |
| G4 Shader        | P11                                                                                               | §3 G4          |
| G0 后续/协调项   | P03、P17（**并行线进行中，先协调再排**）、P02 部分                                                | §6 并发风险    |

## 3. 重复/断链盘点

### 3.1 Gallery（examples/，61 例）

- 目录 ↔ `files.json` 登记：**双向一致，无断链**（61/61）。
- 其中 3 例（`camera-screen-world/math-bits/node-events`）为并行线在制品：未跟踪、证据 partial、2 例编译 FAIL（§0.1）。**本计划不接管、不修改**。
- `gltf-catalog`：证据行 pre-v3 schema（无 apiProof），claims 只计 claimed（§5 隔离项）。

### 3.2 手册示例（docs/manual/examples/，44 例）

- 独立验证器 44/44 PASS（07:20Z 非 partial），但**设计上不进 Gallery/覆盖率门禁**（`manual-examples-verify.cjs` 头注）→ 属计划书要求标记的「已有但未进 coverage」资产。
- 与本计划重叠、可升级复用的候选：
  - `manual-post-processing`、`manual-render-targets` ↔ P09（渲染组合）；
  - `manual-component-lifecycle`（14 断言）↔ P01/P02（场景切换与节点生命周期）；
  - `manual-asset-lifecycle`（404 失败路径）↔ P08；
  - `manual-input-events`（11 断言）↔ P06/P07 输入链；
  - `manual-mini-game` ↔ G2 俯视角收集躲避（计划书已指定升级）；
  - `manual-responsive-design` ↔ P15。
- **升级规则**：把手册示例迁入 Gallery 时必须补 §24 规格（example.json 效果契约 + apiProof 证据），并刷新源码行号/指纹；不得双头维护同一规格。

### 3.3 Recipes（V0.6，30 条 promoted/stable）

- 运行器：`tools/benchmark/recipes/scenarios.cjs`；证据 `docs/evidence/recipes/R*.json`（before/after 语义探针对比）。
- **不在当期 coverage 证据源**（evidenceSources 仅 v11 两文件）→ 「已有但未进 coverage」资产。
- 与 Top 20 高重叠、探针设计可直接复用：
  - R004 multi-instance / R016 click-animation / R017 click-material / R019 selection / R018 drag-object ↔ P04；
  - R006 product-framed / R007 orbit-drag / R011 auto-framing / R020 hotspot ↔ G2 产品查看器；
  - R012 camera-tour / R013 camera-transition / R014 orthographic-toggle / R015 multi-camera ↔ P03；
  - R005 / R009 material-variants ↔ P20；R021–R025（glass/clearcoat/transmission/anisotropy/iridescence）↔ gltf-* 系列（已有 Gallery 例，无重复建设必要）。
- **处置**：不迁移 Recipe 运行器本身；新示例的 `__state` 探针字段命名对齐 Recipe 语义（instanceCount/animationTicks/selected/featureApplied…），使旧探针设计可直接抄用。

### 3.4 手册页面 ↔ Recipes ↔ 示例互链

- `docs/manual/cocos4-coverage-matrix.md`（r49）已做「官方指南 → 三层证据」台账；本矩阵与其互补（API 场景视角），主题级行动项不重复登记，交叉引用即可。
- 未发现指向不存在目录/文件的断链（gallery 61、manual 44 目录级核对通过）。

## 4. 证据时效核验结论

| 证据                                          | measuredAt          | partial                   | 结论                                                                                                                       |
| --------------------------------------------- | ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `docs/api-coverage-report.json`               | 07:30Z（HEAD 同期） | —                         | 指纹当期重算一致，**可用**                                                                                                 |
| `docs/evidence/manual-examples-verified.json` | 07:20Z              | false                     | 44/44 PASS，**可用**                                                                                                       |
| `docs/evidence/devtools-examples.json`    | 07:29Z              | false                     | 5/5 PASS，**可用**                                                                                                         |
| `docs/evidence/examples-verified.json`    | 07:42Z              | **true**（subset=3 新例） | 53/55；2 FAIL 为并行线在制品编译错误；**基线冻结为 r49 全量 53/53 记录 + 本 partial 状态如实登记**，不据此推断存量示例回归 |
| `docs/evidence/gallery-artifact.json`     | 03:51Z              | —                         | 102 项检查（r47 期全绿记录），当期未重跑，**线索级**                                                                       |

## 5. 隔离项（不得计入已覆盖）

1. **`gltf-catalog` schema gap**：证据行 pre-v3（无 `apiProof[]`），其 claims 永不算 verified，直至证据重采。
2. **`claimsNotInInventory` 5 项**：`DevToolsSession.inspectScene/dispatch/captureFrame/inspectNode/getRuntimeErrors` —— 示例 claims 了 inventory（build d.ts）中不存在的单元。属导出面/清单口径差异，登记为功能缺口线索（DevTools API 未进 public d.ts），不计入任何覆盖。
3. **Advanced tier**：required=0，门禁 NOT_APPLICABLE；其 106 个 verified 仅作披露，不得用于自证覆盖率。
4. **并行线在制品**（§0.1 三例）：在并行线交付并全量重采前，其任何 PASS/FAIL 不作为本计划基线。

## 6. G0 退出条件自检

- [x] Top 20 组合路径均有：调用链、正常结果、边界/错误、现有示例、缺少 validator、约束、成本、实施去向（§2）。
- [x] 过期证据明确隔离（§4/§5）：当期无 stale；gltf-catalog 与 DevTools claims 隔离；partial 证据如实登记。
- [x] 重复/断链盘点完成（§3）：无断链；「已有但未进 Gallery/coverage」资产（手册 44 例、Recipes 30 条）已标记并给出复用规则。
- [x] 基线记录完成（§0）：HEAD/指纹/测试/示例清单/并发状态。
- [x] 分母重新核对：Core 816 / Important 1,773（coverageRequired 口径），与计划书快照一致；verified 56+20 与 r49 披露一致。

## 7. 功能缺口登记（G1 实施期实测，2026-09-25）

> 计划书 §3 G1：「若某条链的公开接口尚不可用，先登记最小功能缺口、复现用例和修复依赖，再继续示例」。
> 以下缺口均有可复现探针与当期证据，示例侧一律如实降级（结构断言/记录差值），不冒充绿灯。

### GAP-L1 主光/点光视觉贡献为零（P0）—— **r53 已修复（owner 批准 Deviation 流程执行）**

> **修复结论（2026-09-26）**：拆分为两个独立根因，处置不同：
> 1. **主光（DirectionalLight）＝单位语义陷阱，非引擎缺陷**：isHDR 默认 true（pipeline-scene-data.ts:138），
>    exposure=1/38400（camera.ts:413）——LDR 量级 illuminance（1.2/8）× exposure ≈ 3e-5 不可见；
>    HDR 量级（65000=组件默认）下颜色/开关/渐变全部实测生效（探针 HDR_A/B/C/F 相位：
>    白 65000→[154,160,165]、红→[154,76,84]、关→[32,49,65]、20000→[86,98,109]）。
>    处置：文档/示例单位纪律（范式文档 + render-composite p2c 升级为正向断言），无引擎改动。
> 2. **点光/球光（PointLight/SphereLight）＝fixture 着色器版本失配，真实缺陷，已修复**：
>    AIR fixture `src/air/builtin/builtin-glsl4.ts`（AIR 原创文件）携带 3.8 代语义
>    `if (cc_lightPos[i].w > 0.0)`（w>0 一律走 spot 角衰减），而 4.0 同源队列写入
>    `w = LightType.POINT(3)/SPHERE(1)` → 点/球光落入以未写入 cc_lightDir 计算的角衰减 → att≡0；
>    叠加 POINT 的 `illum = 0²/max(0²,d²) ≡ 0`（4.0 上游对 POINT/RANGED 取 1.0）。修复＝对齐上游 4.0
>    `shading-standard-additive.chunk` 语义：9 处替换（spot 判别 ×3、spot-shadow 判别 ×3、POINT/RANGED illum ×3），
>    数值窗口 ±0.5 精确匹配整数 LightType。**未触碰任何上游跟踪文件**（file-map 无新增 Deviation 行；
>    修复位于 AIR 原创 fixture，glsl3/glsl1 由 register.ts 降写自动跟随）。clustered-culling 变体
>    （CC_ENABLE_CLUSTERED_LIGHT_CULLING=1 路径）未在 AIR 启用，不在本次范围，如实登记。
>    验证：探针 HDR_D/E/G 相位——点光开启 [255,255,255]（饱和）vs 关闭 [154,160,165]，delta=472；
>    render-composite p2b 正向断言 35.0→255.0→35.0；g4-shader-probe 新 bundle 双后端回归 28/28 PASS。
>
> 原登记内容（保留存档）：

- **现象**：DirectionalLight illuminance 1.2→8、color→纯红、PointLight luminance 0↔900、active 开关、
  新场景静态红光配置——中心像素全程不变；对照组（材质 setProperty、ambient.skyColorHDR.set）立即生效。
- **收敛**：renderScene._mainLight 已注册（DirectionalLight×1）、ForwardPipeline 在位、ambient 与
  mainLit\* 同属 CCCamera UBO 且 ambient 生效 → 缺口在 UBOCamera MAIN_LIT_* 字段写入-上传一致性，
  或 builtin-standard glsl1/3 降写变体对 cc_mainLitDir/cc_mainLitColor 的消费路径；与 register.ts 注记的
  「fixture UBO 含引擎 4.0 已移除成员」布局漂移同族嫌疑。
- **复现**：`tools/debug/probes/light-contribution-probe/`（13 相位像素采样全记录）。
- **证据**：`docs/evidence/g1-light-contribution-gap.json`。
- **修复依赖**：src/cocos/rendering/pipeline-ubo.ts（UBOCameraEnum 偏移 vs 实际块布局）、
  src/air/builtin/register.ts 降写产物、webgl-descriptor-set 逐名 uniform 绑定路径。
  注意上述多为上游抽取文件——修复需走 UPSTREAM.md Deviation 流程，另行估时。
- **示例侧处置**：render-composite P2 改为结构断言（Light 组件计数增删）+ ambient 可见路径断言 +
  p2c 如实记录 illuminance 变更视觉差=0；light-* 既有示例的「灯光效果」叙事在修复前只有结构证据。

### GAP-C1 Camera.worldToScreen 运行期输出零向量（P1）

- render-composite 探针实测 `camera.worldToScreen(out, worldPos)` 后 out=[0,0,0]；执行计数正常
  （verified 语义不受影响——执行证明成立，正确性缺口单列）。与并行线 camera-screen-world 的
  TS2345/TS2339 编译错误同族（Camera 屏幕坐标 API 面）。像素级验证暂以解析窗区域扫描替代。

### GAP-C2 框架 Camera 组件不导出 resize/width/height（P2）

- inventory 的 `Camera.resize`（core req）属 render-scene 内部面；公开组件面无 resize/width/height。
  P09 的 resize 环节改用 `RenderTexture.reset` 演示渲染目标 resize（像素断言）；camera.rect 读回记录。

### GAP-M1 builtin-unlit 纹理宏为 USE_TEXTURE，USE_ALBEDO_MAP 被静默忽略（P2，含手册潜在缺陷）

- 传 `defines:{USE_ALBEDO_MAP:true}` + mainTexture：渲染为 mainColor 纯色，无警告。
- **连带发现**：`docs/manual/examples/manual-render-targets` 正在使用 USE_ALBEDO_MAP——其快照 quad
  大概率显示白色而非 RT 内容；手册验证器（visible-frame/frame-diff）无法分辨。待手册线复核修正。

### GAP-B1 引擎引导前的注册/初始化边界（文档化即可）

- `EffectAsset.onLoaded()` / `Material.initialize()` 在 createAirApp 之前调用 →
  `TypeError: Cannot read properties of undefined (reading 'capabilities')`（WebProgramLibrary.init 空 device）。
- 已在 g4-shader-probe（registerBeforeBoot）与 scene-switch-reentry/ui-asset-loading 头注记录；
  G3 范式文档将把「引导后再构造材质/注册 effect」写入生命周期规范。

### GAP-V1 isValid 的帧末语义与异步取消范式（文档化即可）

- `destroy()` 后 `isValid` 在帧末 `_deferredDestroy` 落地前仍可能为 true（ui-asset-loading P6 实测
  竞态 dangling=1）；异步回调守卫必须「显式取消 token + isValid 双守卫」。G3 范式文档纳入。

### 实施期后补发现（2026-09-25 晚，G2/G4 建设期实测）

- **GAP-C2 扩展**：框架 `Camera` 组件除 resize/width/height 外也不导出 `aspect`（product-viewer T5
  类型合同拦截）；响应式读回以 `camera.rect` + canvas 尺寸替代。`Camera.resize`（core req 单元）
  在公开组件面不可达——该单元的 verified 路径需要导出面决策（owner 议题）。
- **GLTFInstance.dispose() 连带销毁无引用资产**：product-viewer 模型替换后 `boxAsset` 的
  `meshes` getter 抛 `Cannot read properties of null`（资产已毁、getter 无 isValid 守卫）。
  所有权语义本身合理（instance 持有资产引用计数），但 **GLTFAsset 属性 getter 在销毁后抛异常
  而非返回空**属防御性缺口；使用侧纪律 = 访问前 `isValid(asset)` 守卫（范式文档已纳入）。
- **assetManager.loadRemote 为回调式**（await Promise 形态返回 undefined 不报错）——
  tank-battle/collector-dodge/product-viewer 统一以 Promise 包装（audio-basic 同款口径）。
- **primitives 签名不齐**：`sphere(radius?, opts?)`/`cylinder(radiusTop?, radiusBottom?, height?, opts?)`
  为位置参数，`box({width,…})` 为对象参数——类型合同可拦，但手册/范式需点名（已记 G3 文档待办）。
- **builtin-unlit 纹理宏 USE_TEXTURE**（GAP-M1 复核）：shader-dissolve/product-viewer 全部走
  USE_TEXTURE 路径像素断言通过；`manual-render-targets` 的 USE_ALBEDO_MAP 白 quad 嫌疑维持待手册线复核。

### GAP-I1 renderer.material 读回实例化 → 共享材质更新与画面脱钩（语义陷阱，正典批次实测）

- **现象**：shader-dissolve 页内断言全绿（drawImage 采样见 threshold 动画），但正典 runner 的
  toDataURL 捕获自 material-property 读回后恒定不变（urlLen 6398 常量、frame-diff 判 static）。
- **机理**：验证器 readback 访问 `renderer.material` getter → 引擎按设计创建 **MaterialInstance 副本**
  （misc/renderer.ts：「仅在用户通过 material/materials/getMaterialInstance 获取时创建实例」）→
  渲染切到实例；示例后续对**共享材质资产**的 `setProperty` 不再影响画面。
- **对照**：shader-custom-gradient 同被实例化却存活——其动画由着色器内 `cc_time` 驱动（不依赖 CPU 侧
  uniform 更新），恰好绕开脱钩面。
- **修复模式**（两例已落地）：持续更新 uniform 的示例一律 `liveMat = renderer.material as Material`
  取实例后驱动；或整体切换走 `setSharedMaterial`（会销毁旧实例，语义安全）。lifecycle reacquire
  在 setSharedMaterial 后必须重新取实例。
- **定性**：非引擎缺陷（实例化是文档化设计），属**验证器×示例交互语义陷阱**；范式文档 §5 已纳入。
  受影响面：任何「readback 之后还要改共享材质并期待画面变化」的示例。

## 2026-09-26 修复轮：剩余缺口裁定

- **GAP-C1 已关闭（调用错误）**：公开组件签名为 `camera.worldToScreen(worldPos, out?)`，原探针传反了参数。已修正 `render-composite`，用真实投影坐标取 RT 像素，删除硬编码采样位置。实测屏幕点约 [252.92,463.83,0.9816]，转换深度后往返恢复 [-2.3,1.7,0.8]，误差 <0.01。透视投影输出 z 是非线性深度；`screenToWorld` 输入 z 是 near→far 的线性比例，不能直接传回。
- **GAP-C2 已关闭（组件与渲染相机混淆）**：公开 `Camera.camera` getter 返回渲染相机；`width/height/aspect/resize` 属于该对象，组件自身通过 `rect/targetTexture` 等管理常用行为。修复轮增加公开访问的尺寸断言。无需新增重复包装或改 API 分母；coverage 对同名类型的归属仍按现有稳定 ID 披露。
- **GAP-M1 已修复**：`manual-render-targets` 改用 `USE_TEXTURE`，补 HDR 主光与针对左侧快照的蓝色立方体像素断言，纯白材质不能通过。
- **GAP-B1 / GAP-V1**：作为生命周期边界闭合到 `script-component-workflow.md`（引导后初始化、显式取消 token、销毁后不再访问资产）。
- **GLTFAsset 销毁后读取**：遵循资产生命周期合同，调用方必须用 `isValid` 守卫；本轮不把已销毁资产访问改为静默空值。

§7 的原始观察保留为历史排查记录，当前结论以本节及本轮验收记录为准。

## GAP-T1：Tween 嵌入反转序列的终点偏差（覆盖波次 1，待处理）

`reverseTime(embedTween)` 包装 `by` 相对位移动作时，起点 x=3、偏移 +2，反转完成后实测停在 x=5，预期为 x=3。无嵌入参数的直接 `by(...).reverseTime()` 路径已通过三浏览器验证。方法级 verified 只覆盖后者，不代表此分支正确。复现与失败证据见 `docs/evidence/coverage-wave1-reverse-time-diagnostic.json`。后续应在隔离回归用例中定位 Sequence 的反向重启与起点捕获，再按上游映射规则处理。
