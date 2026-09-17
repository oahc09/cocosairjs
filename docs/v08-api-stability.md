# API Stability Classification（V0.8 §88）

> 分类基准：公开导出面（`build/cocosair.module.d.ts`）中所有被 examples、recipes
> 或 benchmarks 引用的 API。Internal = 未出现在公共入口的引擎内部 API。

## Stable（V0.6 起承诺不变）

| API | 类别 | 说明 |
|---|---|---|
| `createAirApp(options)` | Runtime | Code First 唯一入口 |
| `Scene` / `Node` / `Component` | Runtime | Cocos 原生场景图 |
| `Camera` / `DirectionalLight` / `MeshRenderer` | Runtime | 核心渲染组件 |
| `Vec3` / `Color` / `Layers` | Math | 基础数学类型 |
| `utils.createMesh` / `utils.loadAssetAsync` / `frameObject` | DX Helper | V0.2 起 |
| `builtinResMgr.get` | Asset | 内建资源获取 |
| `GLTFLoader` / `GLTFAsset` / `GLTFInstance` | glTF | 模型加载三件套 |
| `Extension Registry` / `getExtensionSupport()` | glTF | 扩展注册与查询 |
| `Draco/Meshopt/Basis Decoder API` | glTF | `setDRACODecoder` 等注入式 API |
| `configureGLTFLoaderDefaults` | glTF | 进程级默认值 |
| `input.on` / `Input.EventType` | Input | 输入事件 |
| `isMeshoptAvailable` / `isKTX2Available` / `isKTX2` | Capability | 能力查询 |
| `isTransmissionMaterial` | Capability | 材质能力 |
| `createMeshoptDecoder` / `createDracoDecoder` / `createKTX2Transcoder` | Decoder | Decoder 工厂 |
| Stable Error Codes (`GLTF_DECODER_MISSING` 等) | glTF | 稳定错误码集合 |

## Experimental（可能变更，V0.7+ 评估）

| API | 类别 | 说明 |
|---|---|---|
| `primitives.*`（box/sphere/torus/cylinder/plane） | Primitive | 几何体工厂 |
| `Animation` / `AnimationClip` / `SkeletalAnimation` | Animation | 动画组件 |
| `Skeleton` / `SkinnedMeshRenderer` | Skeleton | 蒙皮 |
| `tween` / `TweenSystem` | Tween | 补间系统 |
| `AirApp.canvas`（readonly 属性） | Runtime | V0.5.1 新增 |

## Internal（不承诺稳定性）

| API | 说明 |
|---|---|
| `AirAppImpl` | 内部实现类 |
| `renderer` / `director` / `game` | 引擎内核单例 |
| `gfx` / `rendering` | 图形后端 |
| `cclegacy` / `legacyCC` | 兼容层 |
| `serialization` / `deserialize` | 序列化 |
| 所有 `pal/*` 模块 | 平台抽象层 |

## Agent Session Contract（tools/debug，V0.5.1 冻结）

| 合同 | 状态 |
|---|---|
| `createAgentSession` / `inspectScene/Node/Asset` | Stable |
| `dispatch(requestId/action/params)` | Stable |
| `captureFrame()` | Stable |
| `getRuntimeErrors / clearRuntimeErrors` | Stable |
| `close()` | Stable |

## Benchmark / Recipe Schema（V0.6 冻结）

| Schema | 状态 |
|---|---|
| `BenchmarkDefinition` | Stable |
| `RecipeDefinition` | Stable |
| `AgentDriver` / `AgentAction` / `FeedbackPackage` | Stable |
| `Validator`（12 首批） | Stable |
