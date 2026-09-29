# 01 — Web Feature Set 分析（Phase 1 / 验收 L1）

> 当前支持策略（2026-09-30）：WebGL 2-only；`gfx-webgl` 已退役，当前 AIR 声明 33 项、默认 26 项，上游 55 项、上游独有 23 项。下文旧取舍表为历史快照；现行规则见 [WebGL 2-only 策略](../webgl2-only.md)。

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> 判据来源：`cc.config.json` + `cocos4/scripts/build-h5-source.js`（上游仓库内文件，本仓库无 `scripts/` 目录；AIR 侧对应实现为 `tools/build/build.cjs`）+ 实际构建验证（docs/03），不人工假设。

## 1. 构建 feature 机制

- ccbuild 的 feature unit = `exports/<name>.ts` 文件；feature → modules → exports 文件 → 依赖闭包。
- 平台 constants（HTML5/NATIVE/MINIGAME...）+ moduleOverrides 决定依赖图的真实形态。

## 2. Web 构建的常量形态（HTML5 + BUILD）

| Constant | Web build | 说明 |
|---|---|---|
| HTML5 | **true** | 平台 |
| NATIVE / JSB | false | 无 native |
| MINIGAME / RUNTIME_BASED | false | 无小程序 |
| EDITOR / PREVIEW / DEV | false | 发布模式 |
| BUILD | true | mode=BUILD |
| TEST | false | |
| DEBUG | true | dev 构建（min 构建亦为 true，由 compress 区分） |
| WEBGPU | false（internal） | |
| CULL_MESHOPT | true（internal） | meshopt wasm 被折叠剔除 |
| MARIONETTE / PROCEDURAL_ANIMATION | false | marionette 动画运行时空实现替换 |

## 3. 平台 PAL 虚拟模块映射（HTML5 生效，来自 moduleOverrides）

| 虚拟模块 | Web 实现 |
|---|---|
| `pal/audio` | `pal/audio/web/player.js` |
| `pal/system-info` | `pal/system-info/web/system-info.js` |
| `pal/screen-adapter` | `pal/screen-adapter/web/screen-adapter.js` |
| `pal/input` | `pal/input/web/index.js` |
| `pal/env` | `pal/env/web/env.js` |
| `pal/pacer` | `pal/pacer/pacer-web.js` |
| `pal/wasm` | `pal/wasm/wasm-web.js` |
| `pal/minigame` | `pal/minigame/non-minigame.js` |
| `internal:native` | `cocos/native-binding/impl.ts`（web 空实现） |

## 4. 全部 feature 清单与 Air 取舍

> **〔r46 快照标注，owner-decisions #16(c)+(a)〕本节与 §5 是 2026-09-12 立项期（V0.1）的取舍快照，不是当期口径；
> 当期 feature 面的机器导出读数见 §7 与 `npm run verify:v12-feature-face` / `npm run verify:v12-backends`（A5）。
> 陈述更正：下表 `gfx-webgl2` 行的「Air V0.1 = No」从未与构建事实一致——`tools/build/build.cjs` 默认集自 V0.1 基线提交
> `f1bc676` 起即含 `gfx-webgl2` 与入口 unit `air`（§5 列表当时亦漏列二者）；「裁掉 WebGL2」的取舍从未生效，特此承认并留痕。**

Air V0.1 保留能力（计划书 §29）：Core/Math/Scene Graph/Component/Game/Director/Asset/GFX Web/Render Scene/Pipeline/Camera/Light/Mesh/Material/Texture/Animation/Skeleton/Skinning/Web Input/Web PAL。

| Feature | Web build | Air V0.1 | 理由 |
|---|---|---|---|
| base | Yes | **Yes** | core/scene-graph/game/serialization/input/asset/rendering 全在这里 |
| gfx-webgl | Yes | **Yes** | Air 渲染后端（WebGL） |
| gfx-empty | Yes | **Yes** | 无头设备，供 smoke test |
| 3d | Yes | **Yes** | Mesh/Material/Skeleton/Camera/Light/Model |
| animation | Yes | **Yes** | AnimationClip/动画系统 |
| skeletal-animation | Yes | **Yes** | Skinning（蒙皮为 V0.1 验收核心） |
| primitive | Yes | **Yes** | Code First 生成 cube 等（hello-cube 依赖） |
| tween | Yes | **Yes** | Code First 常用补间 |
| custom-pipeline | Yes | **Yes** | 新渲染管线（缺它无法走默认渲染路径） |
| legacy-pipeline | Yes | **Yes** | 旧管线（保正确性，V0.1 不裁剪） |
| gfx-webgl2 | Yes | No | V0.1 最小集；WebGL1 已覆盖验证路径 |
| gfx-webgpu | Yes | No | 依赖 native/external（glslang），且计划书非目标 |
| 2d / ui / mask / graphics / rich-text / ui-skew / sorting-2d / tiled-map | Yes | No | 非 V0.1 能力边界 |
| particle / particle-2d | Yes | No | 同上 |
| physics-*（全部 9 个） | Yes | No | 非 V0.1 能力 |
| spine-3.8 / spine-4.2 / dragon-bones | Yes | No | 依赖 wasm（native/external 缺失） |
| audio / video / webview | Yes | No | 非 V0.1 能力 |
| terrain / xr / light-probe / geometry-renderer / profiler / occlusion-query / debug-renderer | Yes | No | 非 V0.1 能力 |
| affine-transform / intersection-2d / sorting | Yes | No | 2d 相关 |
| vendor-google | Yes | No | Google vendor（USE_VENDOR_GOOGLE=false） |
| marionette / procedural-animation / custom-pipeline-builtin-scripts / custom-pipeline-post-process / websocket / websocket-server / meshopt | Yes | No | intrinsic flags 或 native-only 或非目标 |
| legacy-pipeline（保持） | — | Yes | 见上 |

> 注：websocket/websocket-server 为 `isNativeOnly`；`marionette`/`procedural-animation` 只贡献 intrinsicFlags（modules 为空），不选则空实现替换生效。

## 5. Air V0.1 feature 集（构建入口）

> 〔r46 快照标注〕同 §4：本列表为立项期记录，且不完整——实际构建入口自 V0.1 起为
> `base, gfx-webgl, gfx-webgl2, gfx-empty, 3d, animation, skeletal-animation, primitive, tween,
> custom-pipeline, legacy-pipeline, air`（12 项，含入口 unit `air`）；当期默认集 26 项见 §7。

```text
base, gfx-webgl, gfx-empty, 3d, animation, skeletal-animation,
primitive, tween, custom-pipeline, legacy-pipeline
```

对应 entries：`exports/{base,gfx-webgl,gfx-empty,3d,animation,skeletal-animation,primitive,tween,custom-pipeline,legacy-pipeline}.ts`

## 6. 行为一致的对应表（计划书要求格式）

| Feature | Web | Air V0.1 |
|---|---|---|
| Core | Yes | Yes |
| Scene | Yes | Yes |
| 3D | Yes | Yes |
| Animation | Yes | Yes |
| Skinning | Yes | Yes |
| Web PAL | Yes | Yes |
| Native | No | No |
| JSB | No | No |
| MiniGame | No | No |

## 7. V1.2 之后的 feature 表现况（r45g 新增，机器导出）

§4 / §5 是 V0.1 立项期的取舍叙述，**不回改**；本节只登记**当前可复跑读数**，两者不一致处以本节为准（不一致本身已登记为 F-129，见 §7.5）。

自查命令（两个独立事实源，可交叉核对）：

- `npm run verify:v12-feature-face` 的 **D1** 臂 —— 读 Air `src/cc.config.json` 与上游 `cc.config.json` 的 `features{}` 键，默认集由 `tools/build/build.cjs` 源码里正则取 `AIR_FEATURES` 数组（**不手抄**），并断言默认集里没有未声明名。
- `npm run verify:v12-backends` 的 A4/A5 两臂（**第二个独立实现**，同一对面；两者写错任一侧即对不上）⇒ 现读 `{"air":34,"upstream":55,"missing":22,"airOnly":["air"],"defaultAirFeatures":26}`。

### 7.1 声明面对账（现读）

| 项 | 数 | 说明 |
|---|---|---|
| Air 声明的 feature unit | **34** | `src/cc.config.json` 的 `features{}` 键数 |
| 上游声明 | **55** | `cocos4/cc.config.json` 同键 |
| 上游有 / Air 无 | **22** | 逐名见 §7.4 |
| Air 独有 | **1**（`air`） | bundle 入口 unit（`src/exports/air.ts`），上游无同名 |

### 7.2 默认构建集 = 26（按 `tools/build/build.cjs` 内注释归批）

| 归批 | feature |
|---|---|
| V0.1 期即在默认集（12 项，含入口） | `air`, `base`, `gfx-webgl`, `gfx-webgl2`, `gfx-empty`, `3d`, `animation`, `skeletal-animation`, `primitive`, `tween`, `custom-pipeline`, `legacy-pipeline` ——**该行实为 12 项**（`gfx-webgl2` 自 V0.1 基线提交 `f1bc676` 起即在默认集，与 §4 第 11 行「Air V0.1 = No」和 §5 的十项列表不一致 ⇒ F-129） |
| V1.2 批次 A（LV12-02/04/05） | `profiler`, `video`, `webview` |
| V1.2 批次 B1 / D-1 | `2d`, `physics-2d-framework` |
| V1.2 批次 B2–B4 / C1–C2 | `particle-2d`, `tiled-map`, `ui`, `spine-3.8`, `spine-4.2`, `dragon-bones` |
| V1.2 批次 D-3 / G-1（决策 D7：3D 默认后端 = builtin，2D 默认 = box2d 纯 JS 端口） | `physics-2d-box2d`, `physics-builtin` |
| V1.2 批次 H | `custom-pipeline-post-process` |

`AIR_FEATURES` 全部 26 项均已在 `cc.config.json` 声明（`verify:v12-feature-face` D1 的同一断言：未声明名进默认集即红）。这条本身是护栏：`tools/build/build.cjs` 对未声明名会**失败退出**，因为 `@cocos/ccbuild` 对未声明 feature 是静默忽略（产物与默认逐字节相同，r43 实测）。

### 7.3 声明了、但不在默认集的 8 项（各有登记来源）

| feature | `modules` | 为何不在默认集（来源） |
|---|---|---|
| `physics-cannon`, `physics-ammo`, `physics-physx`, `physics-2d-box2d-wasm`, `physics-2d-builtin` | 各 ≥1 | `tools/build/build.cjs` 的 D-3 / G-1 注释：物理选择器一个图中只允许一个后端，其余后端走 `AIR_FEATURES=` 变体构建取证 |
| `marionette`, `procedural-animation` | **0**（只有 `intrinsicFlags`） | §4 注已述：不选则空实现替换生效；`marionette` 的 pose-node **文件**属计划书回归组 14，与「是否声明 feature unit」是两件事 |
| `audio` | 1（`audio`） | ⚠️ 现读：默认 bundle 里的 `AudioSource` **不是**由 `audio` feature 选择子带进来的，而是 `src/exports/air.ts:37` 的 `export * from './audio'` 走 `air` 入口（`grep -c AudioSource build/cocosair.module.js` → 17，而 `audio` 不在 `AIR_FEATURES`）。⇒ 在 Air 里 `audio` unit 与 `air` unit **不是同一个开关面**，变体构建 `AIR_FEATURES=audio` 不会改变默认产物 |

### 7.4 上游有而 Air 未声明的 22 项（只固定名字，不逐条给理由）

`gfx-webgpu`, `rich-text`, `mask`, `graphics`, `ui-skew`, `affine-transform`, `sorting-2d`, `particle`, `physics-framework`, `physics-2d-box2d-jsb`, `intersection-2d`, `occlusion-query`, `geometry-renderer`, `debug-renderer`, `xr`, `light-probe`, `terrain`, `vendor-google`, `custom-pipeline-builtin-scripts`, `websocket`, `websocket-server`, `meshopt`

本表**不主张**这 22 个名字各自的处置理由（部分名可在 `docs/versions/v12-d9-residual-triage.md` 与 `docs/v12-baseline-compare.json` 的差集桶里找到对应讨论，但那是**文件级**残留分类，不等同于 feature unit 级处置）。逐条 feature-unit 级处置与 §7.5 的缺口一起挂在 LV12-21 / D9 待批面。

### 7.5 本节不覆盖（避免被当成本节已完成）

- feature unit ↔ LV12 回归组的逐条对齐与该组当期取证状态：以 `docs/versions/acceptance-report-v12.md` §1 为当期口径，`docs/versions/v12-upstream-regression.md` §3 / §3.1 为总账。
- 计划书 F-3 项「README 特性矩阵、`docs/versions/progress.md` 更新」中 README 侧的 V1.2 段（`README.md` 「能力边界（V1.2）」）与本页 §7 是两份东西，未合并。
- **F-129（本轮新开，非阻断）**：§4/§5 的 V0.1 取舍表与 `tools/build/build.cjs` 自 V0.1 基线提交起的实际默认集不一致（`gfx-webgl2` 一行、§5 列表少列 `air`）⇒ 属历史陈述与代码现读不符，修哪一侧要 owner 定（改文档陈述 vs 承认当年确未开 WebGL2）。
