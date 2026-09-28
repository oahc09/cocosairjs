# Cocos Air — 特性回归补充任务计划书

> 起草日期：2026-09-19（Gallery & API Coverage 修订：并入 3D 物理后端、post-process/custom pipeline 完整版、ui 完整组件集、marionette 2D pose-nodes）
> 上游基线：`cocos4`（本地 git 仓库，已从 `4.0.0-alpha.33 snapshot 2026-09-12` 更新至 **`4.0.0-alpha.34`**）
> 前置版本：Gallery & API Coverage（Examples Gallery & API Coverage，12 examples / 8 categories，Browser Matrix 3/3 PASS）

---

# 0. 阶段定位

Gallery & API Coverage 以 Examples Gallery 与 API Coverage 体系为主要目标，不以新增 Engine Feature 为目标。

Feature Regression 解决一个历史欠账：

> Engine Extraction Extraction 时按 Web Code First 最小闭包裁剪掉了官方模块。Feature Regression 将这些裁剪项**全部回归**到 Cocos Air —— 共 **16 个回归组**（12 项整模块/入口级回归 + 4 组模块内差量补齐），使 Air 的模块覆盖面从「3D 核心运行时」扩展到「官方 Web feature unit 的完整对齐」。

Feature Regression 的三个硬性判定：

1. **全部回归，不再裁剪**：16 个回归组一个不少（个别项经评估后按 Deviation 登记豁免的，必须给出可复核理由并经确认，默认不豁免）。
2. **抽取来源是官方代码**：所有回归文件从 `cocos4` 本地仓库原样复制，禁止手写替代实现；确需修改的文件逐个登记 `upstream-file-map.json` reason。已登记的 Air 修改中，因回归而不再需要的（如 `pose-graph/runtime-exports.ts` 的 pose-nodes 导入删除）必须恢复官方原文并更新登记。
3. **不回退存量能力**：Gallery & API Coverage 结束时的 12 examples、API Coverage 体系、Browser Matrix、benchmark 回归基线全部保持绿色。

---

# 1. Feature Regression 回归范围 — 16 个回归组

## 1.1 回归组总表

规模数据实测自 `cocos4 @ 4.0.0-alpha.34`（`find cocos/<module> -name "*.ts"` / 行数求和；"差量"指官方已有而 Air 缺失的文件数）。

| # | 回归组 | 官方目录 | 官方 feature unit（cc.config） | 官方 exports 入口 | 规模（TS 文件 / 行） | 外部依赖 |
|---|---|---|---|---|---|---|
| 1 | audio | `cocos/audio` | `audio` | `exports/audio.ts` | 6 / ~1.0k | `pal/audio` web 实现（来自 `@cocos/engine-pal`，Air 目前只有 `type.d.ts`） |
| 2 | dragon-bones | `cocos/dragon-bones` | `dragon-bones` | `exports/dragon-bones.ts` | 14 / ~4.6k | npm `@cocos/dragonbones-js@^1.0.1` |
| 3 | particle-2d | `cocos/particle-2d` | `particle-2d`（依赖 `2d` 基座） | `exports/particle-2d.ts` | 10 / ~3.7k | `2d` 基座补齐（见 1.2） |
| 4 | physics-2d | `cocos/physics-2d` | `physics-2d-framework` / `physics-2d-builtin` / `physics-2d-box2d` / `physics-2d-box2d-wasm`（`box2d-jsb` 为 native 变体，不取） | `exports/physics-2d-*.ts` | 102 / ~14.6k | npm `@cocos/box2d@1.0.2`；`external:emscripten/box2d` wasm 资产；`pal/wasm`（Air 已有 `wasm-web.js`） |
| 5 | profiler | `cocos/profiler` | `profiler` | `exports/profiler.ts` | 3 / ~0.8k | 无 |
| 6 | spine | `cocos/spine`（含 `lib/` 内置 spine-core.js 运行时） | `spine-3.8` / `spine-4.2` | `exports/spine.ts` | 24 / ~6.4k | `lib/spine-core.js` 随目录原样抽取（含 LICENSE）；wasm 变体资产另部署（决策点 D2） |
| 7 | tiledmap | `cocos/tiledmap` | `tiled-map` | `exports/tiled-map.ts` | 11 / ~5.5k | `pal/screen-adapter`（Air 已有 web 实现） |
| 8 | video | `cocos/video` | `video` | `exports/video.ts` | 9 / ~1.6k | `pal/screen-adapter`（已有） |
| 9 | web-view | `cocos/web-view` | `webview` | `exports/webview.ts` | 5 / ~0.6k | `pal/screen-adapter`（已有） |
| 10 | gfx webgpu | `cocos/gfx/webgpu` + `cocos/gfx/base` 差量 3 文件 + 2 个 index 差量 | `gfx-webgpu` | `exports/gfx-webgpu.ts` | 24（+5 差量） | `WEBGPU` 常量开关联动；浏览器 `navigator.gpu` feature-detect |
| 11 | deprecated.ts | `cocos/deprecated.ts` | （无独立 feature；随引用进闭包） | — | 1 | 仅 `replaceProperty(Root...)` 注册，纯 Web 可用 |
| 12 | root.jsb.ts | `cocos/root.jsb.ts` | （native-only 入口变体） | — | 1 | jsb 全局符号 —— 处置见决策点 D4 |
| 13 | ui 完整组件集 | `cocos/ui` 差量 24 文件（button / scroll-view / slider / toggle / progress-bar / page-view / layout / editbox×6 / safe-area / scroll-bar / widget-manager / view-group / block-input-events / sub-context-view / coordinate-tracker / deprecated×2 / index） | `ui` | `exports/ui.ts` | 差量 24（官方 26 / Air 现 2） | `2d` 基座（批次 B1）；editbox 走 DOM input |
| 14 | marionette 2D pose-nodes | `cocos/animation/marionette/pose-graph` 差量（pose-nodes×14 / choose-pose×5 / ik×4 / pure-value-nodes×2 / op×2 等，animation 合计差量 31）+ `pose-graph/runtime-exports.ts` 恢复官方原文（撤销 Air 侧的 pose-nodes 导入删除） | （随 animation feature 闭包；MARIONETTE 内部常量变体验证） | 无独立入口（由 `exports/animation.ts` 覆盖） | 差量 31 + 1 处恢复 | 无 |
| 15 | 3D 物理后端 | `cocos/physics/{builtin,cannon,bullet,physx}`（builtin 10 / cannon 20 / bullet 30 / physx 27） | `physics-builtin` / `physics-cannon` / `physics-ammo` / `physics-physx`（`physics-framework` + spec 抽象层 Air 已有） | `exports/physics-builtin.ts` / `physics-cannon.ts` / `physics-ammo.ts` / `physics-physx.ts` | 差量 87 / ~14.1k | npm `@cocos/cannon@1.2.8`；bullet（ammo）需 `external:emscripten/bullet` wasm/asm 资产；physx 需 `external:emscripten/physx` wasm/asm 资产（来源见风险 R8） |
| 16 | post-process + custom pipeline 完整版 | `cocos/rendering/post-process` 差量 37（components×10 / passes×24 / index / post-process-builder / pass-context）+ `cocos/rendering/custom` 差量 3（layout-graph-editor / layout-graph-names / types-names） | `custom-pipeline-post-process`（`custom-pipeline` 入口 Air 已有；custom 管线核心 22/26 文件已在） | `exports/custom-pipeline-post-process.ts` | 差量 40（另 1 个 `custom/index.jsb.ts` 跳过） | rendering 核心（已在）；推荐与 gfx-webgpu（批次 E）联测但非依赖 |

## 1.2 前置差量：`2d` 基座补齐

spine / dragon-bones / particle-2d / tiledmap / ui 全部依赖 `2d` 模块（Batcher2D / assembler 渲染基座）。Air 的 `src/cocos/2d/` 已保留 82/86 文件，仅缺 4 个，其中 3 个必须补齐：

```text
cocos/2d/assembler/graphics/index.ts          # 必补
cocos/2d/assembler/graphics/webgl/index.ts    # 必补
cocos/2d/renderer/linear-buffer-accessor.ts   # 必补
cocos/2d/renderer/native-2d.jsb.ts            # jsb 变体，跳过（native-2d-empty.ts override 锚点已在）
```

随基座一并恢复官方 2D 关联 exports：`2d.ts`、`graphics.ts`、`intersection-2d.ts`、`sorting-2d.ts`、`mask.ts`、`geometry-renderer.ts`（是否全量进 `air.ts` 聚合导出面，见决策点 D5）。

事实澄清（相对 Runtime Release 计划稿的修正）：`cocos/rendering/custom/` 管线核心 **22/26 文件 Air 已保留**，`src/exports/custom-pipeline.ts` 已接线——「custom pipeline 完整版」的真实差量只有 3 个布局图工具文件；真正的差量大头在 `post-process/`（37 文件，Air 仅存 2 个 setting 组件文件）。

## 1.3 明确不在 Feature Regression 范围

```text
native/、editor/、extensions/、templates/、vendor/
pal 的 native / minigame / nodejs 实现
其余 54 个 *.jsb.ts 平台变体（各批次内随回归项逐个指名的 jsb 例外除外）
```

除上述平台性排除项外，官方 Web feature unit 与 Air 的差集在 Feature Regression 后应为空（个别 Deviation 豁免见决策点 D4）。

---

# 2. 开工硬门禁 G0 — 基线交接与上游对齐

## 2.1 基线事实核验（开工第一件事）

Engine Extraction 的 `UPSTREAM.md` Deviation-01 记录「上游 commit SHA 不可得」。**该 Deviation 已失效**：`cocos4` 现在是 git 仓库且有完整历史。G0 必须完成：

```text
1. 记录 cocos4 当前 HEAD SHA、版本号（package.json version = 4.0.0-alpha.34）
2. 记录 cocosair.js 当前 HEAD、Working Tree Status
3. 确认 alpha.33 → alpha.34 之间 cocos/ 的全部变更提交
   （当前已知仅 2 个触及引擎源码：#336 createMesh、#338 noise function）
4. 重跑一次全量比对脚本，刷新「官方独有文件 / 共同文件 / 内容漂移文件」三张清单
   （Feature Regression 立项时的实测：官方独有 554 文件；共同 787；漂移 2 —— 以 G0 重测为准）
5. 核对 16 个回归组的差量清单与 extraction-manifest 现状，生成 Feature Regression 抽取总账（预计 ~400 文件）
```

## 2.2 上游漂移修复（P0，先于一切抽取）

Air 副本停留在 alpha.33，上游 alpha.34 已修两处，且 #336 正是影响 Code First 网格正确性的修复：

```text
#336 60f9352c56  fix(mesh): choose index format by max index value in createMesh
     → src/cocos/3d/misc/create-mesh.ts 恢复 R16UI/R32UI 自适应
     （否则 >65535 顶点网格索引写为 R16UI，静默数据损坏）

#338 6b455561f4  optimize noise function
     → src/cocos/particle/noise.ts 同步静态置换表 + build512 优化
```

执行方式：从 `cocos4` 直接复制这两个文件到 `src/cocos/` 对应路径（内容应与官方逐字节一致），并在 `upstream-file-map.json` 将这两条记录更新为对齐 alpha.34 的事实说明。修复后必须跑：

```bash
npm run typecheck && npm test && npm run build && npm run build:min
# 加上现有 12 examples 的 Browser Matrix 抽查（至少 Chromium 全绿）
```

## 2.3 簿记三件套更新（G0 产出）

```text
UPSTREAM.md                    → 基线升级记录：alpha.33 (snapshot 2026-09-12) → alpha.34 (commit SHA, 2026-09-19)
                                 Deviation-01 关闭（commit SHA 可得）
docs/00-upstream-baseline.md   → 同步更新
docs/17-baseline-comparison.md → 追加 Feature Regression 章节锚点（Feature Regression 结束时回填对比数据）
```

---

# 3. 全局前置任务

## P1 — npm 依赖引入

```text
package.json dependencies 新增：
  "@cocos/box2d": "1.0.2"          # 对齐官方版本（physics-2d）
  "@cocos/cannon": "1.2.8"         # 对齐官方版本（3D 物理 cannon 后端）
  "@cocos/dragonbones-js": "^1.0.1"

约束：不引入 postinstall 钩子链（官方 spread-pal.cjs 模式不得复活），
     所有包内容按需复制进 src/，保持 Air「源码自包含」原则。
```

## P2 — 外部二进制资产部署模式

复用 glTF Extension Coverage 已验证的 glTF decoder 部署模式（`docs/gltf-decoder-deployment.md`）：大型 wasm/二进制**不进 bundle**，构建期落盘到 `build/decoders/`（或同级资产目录），运行时按需 fetch。

```text
需要落位的资产：
  box2d.release.wasm.js / box2d.release.wasm      # 来源：@cocos/box2d 包内（G1 期实测确认路径；
                                                   # 官方构建经 external:emscripten/box2d 虚拟模块引用）
  bullet.release.wasm.js / .wasm / .asm.js        # 3D bullet（ammo）后端；快照内未见二进制，来源见 R8
  physx.release.wasm.js / .wasm / .asm.js         # 3D physx 后端；来源见 R8
  spine wasm 变体资产                              # 仅当 D2 决策选 wasm 运行时
验收：
  断网/资产缺失时引擎不崩溃，降级路径（builtin 物理 / cannon / js 运行时）可用并输出可读错误
```

## P3 — 构建接线规范（每批次通用模板）

Air 构建已满足「新增模块目录自动纳入」：`src/cc.config.json includes` 已覆盖 `./cocos/**`、`./pal/**`、`./exports/**`。每个回归项的接线动作固定为四步：

```text
① 抽取登记：docs/extraction-manifest.json 追加 entries（source/destination/category），
   执行 tools/extract.cjs 落盘 src/（extract.cjs 需先扩展 --upstream <dir> 参数，
   上游目录默认 E:\AIProMax\github\cocos4，见 A0 任务）
② feature 注册：src/cc.config.json features 增补对应 feature unit（modules 名与官方一致）
③ 入口接线：src/exports/<name>.ts 按官方同名文件原样复制；
   是否并入 src/exports/air.ts 聚合面按 D5 决策执行
④ 接线验证：npm run typecheck && npm run build && npm run build:min
   bundle 体积增量记入 docs/v12-bundle-budget.md
```

---

# 4. 批次 A — Web DOM 特性（profiler / audio / video / web-view）

四项相互独立、无相互依赖，可并行实施；是风险最低的热身批次。

## A0 — 工具先行

```text
tools/extract.cjs 扩展：支持 --upstream <dir>（默认取 E:\AIProMax\github\cocos4），
使 manifest entry 的 source 直接映射 <dir>/<source>；
保持旧行为兼容（repo 根路径命中时优先）。
```

## A1 — profiler（最小项，先打通流程）

```text
抽取：cocos/profiler（3 文件）→ src/cocos/profiler/
接线：exports/profiler.ts + features.profiler
行为：BUILD 模式下默认隐藏（与官方一致），提供 show()/hide() 开关供 Code First 调用
Example：examples/profiler-overlay（fps / drawcall 面板截图取证）
风险：低。注意与 legacy pipeline 的 stats 数据源对齐。
```

## A2 — audio

```text
前置：从 @cocos/engine-pal 包提取 pal/audio web 实现到 src/pal/audio/web/
     （现状 src/pal/audio 仅 type.d.ts；官方经 spread-pal.cjs 复制，Air 禁止 postinstall，
      改为 extract 工具的一次性登记复制）
抽取：cocos/audio（6 文件）→ src/cocos/audio/
接线：exports/audio.ts + features.audio
验证要点：
  - AudioSource 播放/暂停/循环/volume/endTime
  - AudioClip 运行时资产注册（Code First：decodeAudioData 路径）
  - 自动播放策略：浏览器手势解锁后的 resume 行为
Example：examples/audio-basic（用户点击后播放，符合浏览器 autoplay policy）
```

## A3 — video

```text
抽取：cocos/video（9 文件）→ src/cocos/video/
依赖：pal/screen-adapter web 实现已在
验证要点：HTMLVideoElement 挂载、透明 video、全屏切换、事件回调
Example：examples/video-basic（本地小体积 mp4 资产入库 examples 资产清单）
```

## A4 — web-view

```text
抽取：cocos/web-view（5 文件）→ src/cocos/web-view/
验证要点：iframe 挂载/卸载、事件、与 UI 事件穿透行为
Example：examples/webview-basic（内嵌本地静态页，避免外网依赖）
```

**批次 A 出口门禁 GA**：typecheck / jest / build / build:min 全绿；4 个 example 三浏览器矩阵通过；bundle 增量记账。

---

# 5. 批次 B — 2D 渲染基座 + particle-2d / tiledmap / ui 完整组件集

## B1 — 2d 基座补齐与 feature 注册

```text
补齐 1.2 节 3 个缺失文件
恢复官方 exports：2d.ts、graphics.ts、intersection-2d.ts、sorting-2d.ts、
                 mask.ts、geometry-renderer.ts（官方同名原样复制）
验证：现有 3D examples 不受影响（2d feature 未激活时零行为变化）；
     激活后 Batcher2D 在 legacy pipeline 下出图
风险：中。2d 与 ui 存在耦合面，凡触及 cocos/ui 的导入在本子项只记录不实施
     （ui 完整组件集在 B4 统一处理），禁止顺手扩范围。
```

## B2 — particle-2d

```text
抽取：cocos/particle-2d（10 文件）
关键评估（写入 docs/v12-particle2d-notes.md）：
  官方 plist 资产解析链在无 Creator 管线时的 Code First 入口——
  支持 PlistAsset 运行时构造 + loadRemote('.plist') 两种路径
Example：examples/particle-2d-basic（火焰/烟花粒子，程序化 plist）
```

## B3 — tiledmap

```text
抽取：cocos/tiledmap（11 文件）
验证要点：TMX/TSX 解析、正交/等距、图层渲染、object layer 读取
Example：examples/tiledmap-basic（小型 .tmx 资产经 loadRemote 加载）
风险：中。tiledmap 对 2d 渲染批次与纹理图集有较深依赖，优先在 Chromium 验证后再铺开三浏览器。
```

## B4 — ui 完整组件集

```text
抽取：cocos/ui 差量 24 文件 + 恢复 exports/ui.ts（原样复制官方同名文件）
涉及组件：button / scroll-view / scroll-bar / slider / toggle(+container) /
         progress-bar / page-view(+indicator) / layout / safe-area /
         editbox 家族（6 文件，DOM input 接入）/ widget-manager / view-group /
         block-input-events / ui-coordinate-tracker / sub-context-view /
         deprecated×2 / index
验证要点：
  - widget 对齐与 widget-manager 驱动的自动布局（窗口 resize 响应）
  - button 事件、scroll-view 惯性滚动与 mask 裁剪、toggle 组、slider 拖拽
  - layout 容器（横向/纵向/grid）
  - editbox：聚焦弹出/输入/回车事件（DOM input 双向同步）
  - sub-context-view：Web 下为受限于开放数据域的组件，按官方行为登记
    「web 无开放数据域，运行面为空实现」，不做扩展验收
Example：examples/ui-components（一屏组合展示 + 交互脚本）；
        examples/ui-layout（widget + layout 自适应演示，配合 resize 断言）
依赖：B1（2d 基座）、编辑器无关事件链路（Air 现有 input 模块已在）
风险：中。组件数量多但相互独立，可按「布局类 → 按钮类 → 容器类 → editbox」四步走查。
```

**批次 B 出口门禁 GB**：2D 基座激活前后全量 example 回归无差异；particle-2d / tiledmap / ui examples 三浏览器通过。

---

# 6. 批次 C — 骨骼动画与动画图（spine / dragon-bones / marionette pose-nodes）

## C1 — spine

```text
抽取：cocos/spine（24 文件，含 lib/ 内置 spine-core.js 3.8/4.2 双版本运行时与 LICENSE）
决策点 D2 → 默认行为：对齐官方 exports/spine.ts 的运行时选择逻辑
     （spine-version-dynamic 按 skeleton 数据版本自动选 3.8/4.2；wasm 变体仅当资产部署完成后启用）
验证要点：
  - skeletonData 加载（json + atlas + texture 三件套，loadRemote 路径）
  - 动画播放/混合/队列、皮肤切换、事件回调
  - 与蒙皮 3D 链路无冲突（skeleton 2D 与 SkinnedModel 并存场景）
Example：examples/spine-basic（spineboy 或等价开源资产，确认许可后入库）
风险：中高。spine-core.js 体积较大（bundle 增量预估 ~0.5MB 级），记入 bundle 预算；
     Spine Runtimes License 合规性核对列入风险表 R3。
```

## C2 — dragon-bones

```text
前置：P1 的 @cocos/dragonbones-js 依赖入库
抽取：cocos/dragon-bones（14 文件）
验证要点：ArmatureDisplay、dragonBonesAsset/DragonBonesDisplay 运行时构造、动画播放
Example：examples/dragonbones-basic
```

## C3 — marionette 2D pose-nodes

```text
抽取：animation 差量 31 文件（pose-nodes / choose-pose / ik / pure-value-nodes / op 等）
恢复：animation/marionette/pose-graph/runtime-exports.ts 恢复官方原文
     （撤销 Air 侧 `import './pose-nodes/all'` 等删除——upstream-file-map.json 中该条
      修改记录同步关闭；这是 16 组中唯一「恢复 Air 修改」项，必须先于抽取执行，
      否则 pose-nodes 导入面断裂）
常量验证：MARIONETTE / PROCEDURAL_ANIMATION 内部常量的 true 变体构建通过
关键评估（写入 docs/v12-pose-graph-notes.md）：
  无 Creator 动画图编辑器时的 Code First 构造入口——
  marionette 图（AnimationGraph）+ pose node 手工装配是否可达；
  若不可达，验收口径降级为「闭包完整 + 单元级 pose node 求值正确」并登记
Example：examples/animation-pose-graph（spike 结论决定是 example 还是单测）
风险：中。pose-graph 与已裁剪的 2D 渲染无直接耦合，但依赖 B1 的 2d 基座类型面。
```

**批次 C 出口门禁 GC**：spine / dragon-bones example 三浏览器通过；C3 按既定口径验收；bundle 增量记账；第三方许可登记完成（见第 13 节）。

---

# 7. 批次 D — physics-2d

按官方依赖序分三步，每步独立可验证：

```text
D-1 physics-2d-framework + spec（抽取 cocos/physics-2d/framework + spec 部分）
    → 注册 features：physics-2d-framework；验证空后端选择器可用
D-2 physics-2d-builtin（无物理引擎的静态实现）
    → 注册 features：physics-2d-builtin；无 wasm 依赖，先打通组件全链
    Example：examples/physics-2d-basic（RigidBody2D + Collider2D 挂载与查询，不模拟）
D-3 physics-2d-box2d / box2d-wasm
    → 注册 features：physics-2d-box2d、physics-2d-box2d-wasm
    → P2 的 box2d wasm 资产部署 + pal/wasm 链路验证（instantiated.ts 的
      external:emscripten/box2d 虚拟模块映射到本地资产 URL）
    Example：examples/physics-2d-collision（碰撞/回调/raycast）
跳过项：box2d-jsb（native 变体）——登记 Deviation「Web 不需要」
风险：中高。wasm 加载失败降级链路必须可测；Contact 回调时序与官方一致性用例化。
```

**批次 D 出口门禁 GD**：builtin 后端全浏览器通过；box2d(wasm) 后端在支持 wasm 的三浏览器通过；`PHYSICS_2D` 相关常量开关组合构建通过。

---

# 8. 批次 E — gfx-webgpu

```text
抽取：cocos/gfx/webgpu（24 文件）+ gfx/base 差量 3 文件 + gfx index 差量
接线：exports/gfx-webgpu.ts + features.gfx-webgpu；WEBGPU 常量与设备探测链路对齐官方
关键差异（与既有 WebGL 主链路）：
  - 设备选择策略：createAirApp 新增 device 偏好参数（'webgl2' 默认 | 'webgpu' | 'auto'），
    'auto' 在 navigator.gpu 可用且通过适配探测时选 WebGPU，否则回退 WebGL2 —— API 变更走 v08
    API Stability 的 additive 通道并在 docs/v08-api-stability.md 登记
  - 常量开关：WEBGPU=true 构建变体单独出验证产物，不影响默认 bundle
验证要点：
  - WebGPUDevice 初始化、swapchain、buffer/texture/pipeline 走通
  - hello-cube 场景在 WebGPU 后端出图（与 WebGL2 出图像素对比，允许实现差异注释）
  - 不支持 WebGPU 的浏览器（当前 Firefox/WebKit 稳定版）必须优雅回退并输出探测日志
Example：examples/webgpu-basic
验收口径：WebGPU 后端在支持的浏览器（Chromium）通过即判 PASS；
        Firefox/WebKit 记录 skip + 探测证据，不计失败 —— 与 Benchmark Hardening Browser Matrix 口径的扩展约定一致。
风险：高。官方 webgpu 后端在 alpha.34 处于演进期，预期跟随上游修补；本批次允许
     「注册 + 探测 + 基础出图」达标即冻结，深度一致性验证延后至上游稳定。
```

**批次 E 出口门禁 GE**：Chromium WebGPU 后端出图；回退链路全浏览器可验证；默认构建产物不受影响（WEBGPU=false 路径逐字节级回归）。

---

# 9. 批次 G — 3D 物理后端（builtin / cannon / bullet / physx）

3D `physics-framework` + spec 抽象层 Air 已有（`src/exports/physics-framework.ts` 已接线），本批次回归四个具体后端，共 87 文件 / ~14.1k 行。选择器（`physics-selector.ts`）已在 Air（指向 spec 空实现），本批次把它恢复官方原文并打通各后端选择常量。

## G-1 builtin 后端（无外部依赖，先打通）

```text
抽取：cocos/physics/cocos（10 文件，官方 builtin 后端目录名 cocos）
接线：exports/physics-builtin.ts + features.physics-builtin
     physics-selector.ts 恢复官方原文（撤销 Air 侧空实现指向）
验证：PHYSICS_BUILTIN 路径下 RigidBody/Collider 挂载、查询、事件
Example：examples/physics-3d-basic（builtin：组件链路 + raycast 查询，不模拟）
```

## G-2 cannon 后端（npm 依赖，纯 JS）

```text
前置：P1 的 @cocos/cannon@1.2.8 入库
抽取：cocos/physics/cannon（20 文件）
接线：exports/physics-cannon.ts + features.physics-cannon
验证：重力/刚体下落/碰撞事件/约束（hinge、point-to-point）/ raycast
Example：examples/physics-3d-collision（默认演示后端；cannon.js 纯 JS，三浏览器无门槛）
```

## G-3 bullet（ammo）与 physx 后端（wasm/asm 资产）

```text
抽取：cocos/physics/bullet（30 文件）+ cocos/physics/physx（27 文件）
接线：exports/physics-ammo.ts（官方入口名，import bullet/instantiate）+
     exports/physics-physx.ts + features.physics-ammo / physics-physx
资产：P2 部署 bullet.release.{wasm.js,wasm,asm.js} 与 physx.release.{wasm.js,wasm,asm.js}
     ——asm.js 变体是官方为不支持 wasm 环境准备的回退，一并落位并验证回退路径
验证：wasm 加载、跌落堆/碰撞、character controller、mesh/convex 碰撞体
Example：examples/physics-3d-bullet、examples/physics-3d-physx（资产就绪后补）
验收口径（R8 联动）：
  资产可得 → wasm 路径全量验收；
  资产不可得 → 「代码回归 + 选择器可达 + 资产缺失降级可测（不崩溃、可读错误、
  自动回退 cannon/builtin）」即冻结该项，并在验收报告显著标注部分通过状态
风险：高（R8）。emscripten 二进制不在官方仓库快照内，来源是本批次最大不确定项，
      G-3 开工前必须先出资产来源结论，不得先写代码等资产。
```

**批次 G 出口门禁 GG**：builtin + cannon 三浏览器全量通过；bullet/physx 按 R8 口径结案；`physics-selector` 官方原文恢复且 Air 现有 spec 空实现路径仅作为 framework-only 构建变体保留（常量组合构建验证）。

---

# 10. 批次 H — post-process 与 custom pipeline 完整版

```text
抽取：cocos/rendering/post-process 差量 37 文件
     （components：bloom/fxaa/taa/dof/hbao/fsr/color-grading/blit-screen/taa-mask/index；
      passes：24 个 pass；post-process-builder.ts；utils/pass-context.ts；index.ts）
     + cocos/rendering/custom 差量 3 文件（layout-graph-editor / layout-graph-names / types-names）
接线：exports/custom-pipeline-post-process.ts（官方原文：export * as postProcess）
     + features.custom-pipeline-post-process；
     custom-pipeline 入口已在（src/exports/custom-pipeline.ts），仅核对导出面与官方一致
验证要点：
  - post-process 管线在 legacy/自定义管线下的组装（post-process-builder）
  - bloom、fxaa、color-grading 三个代表效果出图对比（开/关截图对照）
  - taa / hbao / dof / fsr 至少完成「注册 + 不崩溃 + 可选开关」级验收
    （深度效果依赖 G-buffer 质量，允许记录已知差异）
  - custom pipeline 3 个布局图文件：闭包完整（类型/工具面），无独立运行时口径
依赖：批次 B1（2d 基座激活会扩充渲染批次面，post-process 验收在 B1 之后执行）；
     与批次 E（webgpu）联测为增强项非门槛
Example：examples/post-process-basic（bloom + fxaa 开关对比场景）
风险：中。post-process 对 shader 变体与浮点纹理支持有要求（WebGL1 下降级路径需验证）。
```

**批次 H 出口门禁 GH**：三浏览器 post-process-basic 出图 + 开关对照证据；custom pipeline 导出面与官方一致；bundle 增量记账。

---

# 11. 批次 F — 收尾项（deprecated.ts / root.jsb.ts / 簿记回填）

```text
F-1 deprecated.ts：原样抽取（1 文件，仅对 Root 的 replaceProperty 注册）；
    在 exports/base 或独立出口中按官方引用方式挂接，验证无副作用
F-2 root.jsb.ts：决策点 D4 默认处置 = 不抽取，登记 Deviation
    「native 入口变体，Web 闭包无引用，抽取反而引入 jsb 符号面」；
    在 UPSTREAM.md 与 17-baseline-comparison Feature Regression 章节双处登记
    （若评审要求 12/12 物理对齐，则原样复制 + 不接线，零风险满足口径）
F-3 簿记回填：
    - extraction-manifest.json / upstream-file-map.json 全量增量提交
      （含 pose-graph/runtime-exports.ts、physics-selector.ts 两处 Air 修改的关闭记录）
    - docs/17-baseline-comparison.md 追加「Feature Regression 回归后闭包对比」章节
      （目标口径：官方 Web 全量 feature unit 与 Air feature unit 的差集 = 约定豁免集）
    - docs/01-web-feature-set.md 增补 Feature Regression feature 表
    - README 特性矩阵、docs/progress.md 更新
    - tools/examples/api-inventory.cjs 重跑（预期 coverage units 大幅增加），
      api-coverage-report.json 刷新；capabilities 更新
```

---

# 12. Feature Regression 验收矩阵（LV12）

沿用 Engine Extraction（L0–L14）/ Code First DX（L0–L17）风格。每个批次出口门禁（GA–GE / GG / GH）是 LV12 对应项的前置。

| 项 | 内容 | 通过标准 |
|---|---|---|
| LV12-01 | G0 基线对齐 | alpha.34 两漂移文件回归；全量比对清单刷新；三浏览器存量 12 examples 全绿 |
| LV12-02 | profiler | example 出图 + 面板数据可见；BUILD 默认隐藏 |
| LV12-03 | audio | 手势解锁后播放/循环/音量；资产运行时注册 |
| LV12-04 | video | 视频出图 + 事件回调 |
| LV12-05 | web-view | iframe 挂载/卸载 + 事件 |
| LV12-06 | 2d 基座 | 3 缺失文件补齐；激活前后存量 examples 零回归 |
| LV12-07 | particle-2d | 程序化 plist 粒子出图 |
| LV12-08 | tiledmap | TMX 出图 + 图层/object 读取 |
| LV12-09 | ui 完整组件集 | 代表组件（button/scroll-view/slider/toggle/layout/editbox）出图 + 事件断言 |
| LV12-10 | spine | 三件套加载 + 动画/皮肤/事件 |
| LV12-11 | dragon-bones | 资产运行时构造 + 动画播放 |
| LV12-12 | marionette pose-nodes | 按 C3 既定口径（example 或单测级）验收 |
| LV12-13 | physics-2d builtin | 组件链路 + 查询 API |
| LV12-14 | physics-2d box2d(wasm) | 碰撞回调 + raycast；wasm 缺失时降级不崩溃 |
| LV12-15 | 3D 物理 builtin + cannon | examples 出图 + 物理assert（下落/碰撞/约束/raycast） |
| LV12-16 | 3D 物理 bullet + physx | 按 G-3 资产口径结案（全量或「回归+降级」部分通过状态） |
| LV12-17 | post-process/custom 完整版 | bloom/fxaa/color-grading 开关对照出图；custom 导出面一致 |
| LV12-18 | gfx-webgpu | Chromium 出图 + 三浏览器回退探测证据 |
| LV12-19 | deprecated/root.jsb 处置 | 按第 11 节决议落地并登记 |
| LV12-20 | 回归护栏 | 第 13 节全部 PASS |
| LV12-21 | 簿记完整性 | 第 11 节 F-3 清单逐项核对 |

通用标准：每个 LV12 项 = `npm run typecheck` + `npm test` + `npm run build` + `npm run build:min` + 对应 example 的 Browser Matrix（WebGPU 项按第 8 节口径，bullet/physx 按 G-3 口径）+ 截图证据入库 `docs/evidence/v12/`。

---

# 13. 回归护栏（Feature Regression 全程不得回退）

```text
1. 存量 12 examples（Gallery & API Coverage 冻结态）行为与出图不回退
2. bundle 体积：建立 docs/v12-bundle-budget.md 预算表，每批次登记增量；
   总量超预算即触发 D1 决策复议（默认单文件原则不动摇，wasm/大运行库走运行时资产）
3. benchmark 回归：npm run verify:benchmark 不劣化超阈值（沿用现行阈值）
4. API 稳定性：对已冻结的公共 API 仅允许 additive 变更（createAirApp device 参数、
   物理后端选择项等），全部经 docs/v08-api-stability.md 登记
5. verify:web-only 通过（回归文件不得引入 native/minigame 闭包；
   54 个 jsb 变体依旧零进入；box2d-jsb 等指名跳过项除外）
6. 许可合规：spine-core.js（Spine Runtimes License）、@cocos/box2d、
   @cocos/cannon、@cocos/dragonbones-js、ammo/physx emscripten 资产的许可核对
   并登记 THIRD_PARTY_LICENSES.md 与 licenses/
7. 默认构建变体不受新常量影响：WEBGPU / MARIONETTE / PHYSICS_* 等开关
   全部默认态下逐字节级回归（build 产物 diff 审查）
```

---

# 14. 风险表

| ID | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 2d 基座激活后与 ui 存在隐性耦合，牵出计划外文件 | 中 | 依赖闭包先跑 `npm run analyze` 出增量图，触及未排期模块的导入逐个评审；ui 差量已在 B4 排期，不算扩散 |
| R2 | box2d wasm 的 external: 虚拟模块映射在 Air 独立构建下无先例 | 中高 | G1 期先用官方 baseline 构建（tools/baseline）复现该映射，再移植到 Air 构建管线 |
| R3 | Spine Runtimes License 对运行时再分发的合规要求 | 高（合规） | C1 开工前完成许可核对；若不满足分发条件，spine 降级为「用户自备资产+运行时」模式并登记 |
| R4 | spine-core.js / box2d / bullet / physx 运行库使 bundle 与资产体积显著增大 | 中 | P2 运行时资产模式 + bundle 预算表 + D1 复议机制 |
| R5 | 官方 webgpu 后端仍在演进（alpha.34 演进期），回归后上游修补频繁 | 中 | 批次 E 达标即冻结；建立「跟随上游 webgpu 修补」的轻量同步流程（每版对齐） |
| R6 | plist/tmx/spine/dragonbones 资产在无 Creator 管线下的 Code First 构造入口不明确 | 中 | 每特性先做「资产加载可行性 spike」，结论入 docs/v12-*.md；loadRemote URL 加载为保底路径 |
| R7 | 上游 alpha.34 之后继续演进，Feature Regression 期间再次漂移 | 低 | G0 已建立 git 基线，Feature Regression 期间冻结对齐点（记录 SHA），漂移延后到 Feature Regression.x 处理 |
| R8 | bullet（ammo）/ physx 的 emscripten 二进制不在官方仓库快照内，来源不明 | 高 | G-3 开工前出结论：官方全量安装（engine-native / external 下载脚本）/ 上游发布资产渠道；结论前 G-3 只做抽取不接线；不可得则按「回归+降级」部分通过结案 |
| R9 | ui editbox 等组件依赖 DOM 输入焦点链，三浏览器行为差异大 | 中 | 四步走查（布局→按钮→容器→editbox）；editbox 单列验收允许记录浏览器差异注释 |
| R10 | marionette pose-graph 无 Creator 动画图时的 Code First 装配入口不明 | 中 | C3 spike 先行；不可达则验收口径降级为闭包完整 + 单元级求值，登记后结案 |
| R11 | post-process 深度类效果（hbao/taa/dof）依赖 G-buffer 精度，WebGL1/实现差异大 | 中 | 分级验收：bloom/fxaa/color-grading 全量，深度类「不崩溃+可关」级 |

---

# 15. 决策点（需在对应批次开工前确认）

| ID | 决策 | 默认方案 |
|---|---|---|
| D1 | bundle 组织：单文件 vs 分包 | 维持 three.js 风格单文件 ESM；wasm/大型运行库走运行时资产（P2 模式）；超预算再复议 |
| D2 | spine 运行时：js(3.8/4.2 dynamic) vs wasm | 默认对齐官方 exports/spine.ts 行为（version-dynamic 自动选择）；wasm 资产就绪后作为增强 |
| D3 | box2d wasm 资产来源与部署路径 | ~~来源 @cocos/box2d 包内资产（G1 实测确认）；部署进 P2 运行时资产目录~~ **〔r46 更正留痕〕该前提已被实测证伪**：`@cocos/box2d@1.0.2` 包内 `.wasm` 计数为 0，`external:emscripten/**` 不在上游快照也不在上游 git（`docs/v12-physics-asset-sourcing.md` §2）。Owner 批复 #10=(a)：按 D8 口径结案（「代码回归+选择器可达+降级可测」部分通过），(b) 引资产路线不执行 |
| D4 | root.jsb.ts 处置 | 默认不抽取 + 双处 Deviation 登记；评审要求物理对齐则「复制但不接线」 |
| D5 | air.ts 聚合导出面扩大的范围 | 每特性单独评审：优先并入（与官方 exports 同名导出保持一致），体积/命名冲突项挂到独立出口 |
| D6 | WebGPU 设备选择 API | createAirApp 增加 device 偏好（'webgl2' 默认/'webgpu'/'auto'），additive 登记 |
| D7 | 3D 物理默认后端与 Code First 选择入口 | 默认 builtin（零依赖可用）；createAirApp 增加物理后端配置项（'builtin'/'cannon'/'bullet'/'physx'，additive 登记）；对齐官方 physics-selector 常量语义 |
| D8 | bullet/physx 资产不可得时的结案口径 | 「代码回归 + 选择器可达 + 降级路径可测」部分通过，验收报告显著标注，不阻塞 Feature Regression 整体 Gate |

---

# 16. 里程碑与产出物

```text
M0  G0 基线对齐 + 漂移修复 + extract.cjs 升级          → LV12-01
M1  批次 A（profiler/audio/video/web-view）           → LV12-02..05
M2  批次 B（2d 基座 + particle-2d + tiledmap + ui）   → LV12-06..09
M3  批次 C（spine + dragon-bones + pose-nodes）       → LV12-10..12
M4  批次 D（physics-2d 三步）                         → LV12-13..14
M5  批次 E（gfx-webgpu）                              → LV12-18
M6  批次 G（3D 物理后端四步）                          → LV12-15..16
M7  批次 H（post-process + custom 完整版）            → LV12-17
M8  批次 F（收尾 + 簿记回填 + 全量验收报告）           → LV12-19..21
```

依赖与并行关系：M1 与 M2 的 B1 可部分并行；M3 依赖 M2（2d 基座）；M4 的 D-1/D-2 可提前，D-3 依赖 P2；M5 独立可穿插；M6 的 G-1/G-2 依赖 P1，G-3 依赖 P2 + R8 结论；M7 依赖 M2（B1），与 M5/M6 可并行；M8 收尾依赖全部。

最终产出物清单：

```text
docs/acceptance-report-v12.md        # LV12 全矩阵验收报告（证据截图 docs/evidence/v12/）
docs/v12-bundle-budget.md            # bundle 预算与实际增量表
docs/v12-upstream-regression.md      # 16 组回归的抽取/接线/偏差逐项记录
docs/v12-particle2d-notes.md 等      # 各特性 spike 结论
docs/v12-physics-asset-sourcing.md   # R8 资产来源结论（bullet/physx/box2d）
更新：UPSTREAM.md / 00-upstream-baseline.md / 17-baseline-comparison.md /
     01-web-feature-set.md / README.md / api-coverage-report.json / capabilities
examples/ 新增 15+：profiler-overlay、audio-basic、video-basic、webview-basic、
     particle-2d-basic、tiledmap-basic、ui-components、ui-layout、spine-basic、
     dragonbones-basic、animation-pose-graph、physics-2d-basic、physics-2d-collision、
     physics-3d-basic、physics-3d-collision、physics-3d-bullet、physics-3d-physx、
     post-process-basic、webgpu-basic
```

---

# 17. 执行纪律（继承既有约定）

1. 不执行 `git clone / pull`；抽取一律以本地 `cocos4` git 仓库的**冻结 SHA**为源，逐批记录。
2. 官方文件原样复制；任何改动必须在 `upstream-file-map.json` 登记 reason（Engine Extraction 的 6 处修改是范例格式）；因回归而失效的 Air 修改（pose-graph/runtime-exports.ts、physics-selector.ts）必须恢复官方原文并关闭登记。
3. 状态如实：每个 LV12 项只有 `verified / in-progress / blocked / not-delivered` 四态，禁止把计划值写成完成事实；部分通过（bullet/physx 资产口径）必须显式标注。
4. Browser Matrix 口径：默认 3/3（Chromium + Firefox + WebKit）；WebGPU 项按第 8 节扩展口径、bullet/physx 按 G-3 口径（skip/部分通过须附证据）。
5. 每批次结束提交一次，提交说明注明批次号、LV12 项、bundle 增量。
