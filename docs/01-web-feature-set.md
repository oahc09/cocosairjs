# 01 — Web Feature Set 分析（Phase 1 / 验收 L1）

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> 判据来源：`cc.config.json` + `scripts/build-h5-source.js` + 实际构建验证（docs/03），不人工假设。

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
