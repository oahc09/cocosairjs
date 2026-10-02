# API 稳定性分类

> 分类基准：公开导出面（`build/cocosair.module.d.ts`）中所有被 examples、recipes
> 或 benchmarks 引用的 API。Internal = 未出现在公共入口的引擎内部 API。

## Stable

| API | 类别 | 说明 |
|---|---|---|
| `createAirApp(options)` | Runtime | Code First 唯一入口 |
| `Scene` / `Node` / `Component` | Runtime | Cocos 原生场景图 |
| `Camera` / `DirectionalLight` / `MeshRenderer` | Runtime | 核心渲染组件 |
| `Vec3` / `Color` / `Layers` | Math | 基础数学类型 |
| `utils.createMesh` / `loadAssetAsync` / `frameObject` | DX Helper | Code First 资源与取景辅助 |
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

## Experimental

| API | 类别 | 说明 |
|---|---|---|
| `primitives.*`（box/sphere/torus/cylinder/plane） | Primitive | 几何体工厂 |
| `Animation` / `AnimationClip` / `SkeletalAnimation` | Animation | 动画组件 |
| `Skeleton` / `SkinnedMeshRenderer` | Skeleton | 蒙皮 |
| `tween` / `TweenSystem` | Tween | 补间系统 |
| `AirApp.canvas`（readonly 属性） | Runtime | 可读的应用目标画布 |

## 扩展接口（Experimental）

> 收录口径：同时满足 ①出现在默认发布产物导出面（`build/cocosair.module.d.ts`，以当前构建声明为准），
> ②被 `examples/**` 的 frozen spec 实际引用。二者缺一不列。
> 定级依据（为什么不是 Stable）：LV12-15 的行为契约只在 `physics-builtin` 后端下取到证据，
> 符号语义与后端耦合（`shape.worldObb/worldSphere/worldCapsule` 等只有 builtin 侧有实现）；
> 且 builtin 3D 实测**不是真模拟器**（详见 `docs/notes/physics-3d-notes.md` §1–§9）⇒ 只承诺签名与记账语义，
> **不承诺仿真响应**。换后端前不升级。

| API | 类别 | 说明 |
|---|---|---|
| `PhysicsSystem`（`instance` / `step` / `raycast*` / `sweep*` / `syncSceneToPhysics`） | Physics 3D | 单例构造点为 `constructAndRegister()`，`_instance` 在 `createAirApp()` 之后才存在 |
| `RigidBody` / `ERigidBodyType` / `PhysicsGroup` | Physics 3D | 属性读回为组件记账（builtin 无写回通道） |
| `Collider` / `BoxCollider` / `SphereCollider` / `CapsuleCollider` / `MeshCollider` | Physics 3D | `MeshCollider` 在 builtin 下永不进世界；`boundingSphere` 恒为默认球（F-109） |
| `PhysicsMaterial` / `setDefaultPhysicsMaterial` | Physics 3D | Code First 下 `initDefaultMaterial()` 取不到 internal 资产 ⇒ cannon 侧需先注入默认材质（F-112） |
| `PhysicsRayResult` | Physics 3D | 可自构造且默认即「未命中」形状 ⇒ 判定必须读返回值；`raycastClosest()` 返回 Boolean |
| `selector`（`register` / `switchTo` / `backend` / `physicsWorld`） | Physics 3D | 初始化前可选择同包的 builtin/Cannon；物理世界创建后不承诺动态切换 |

未列入的后端（不在默认发布类型面上，无可定级对象）：`gfx-webgpu`（D10，子图已移出类型核对与声明图）、
`box2d-wasm`（LV12-14 blocked）、bullet/physx（LV12-16 blocked，R8 资产不随快照分发）。
custom pipeline / post-process 已在默认代码和导出面内；本表尚未为其逐项定级，像素效果边界见 [后处理调查](../notes/post-process-notes.md)。

## Internal（不承诺稳定性）

| API | 说明 |
|---|---|
| `AirAppImpl` | 内部实现类 |
| `renderer` / `director` / `game` | 引擎内核单例 |
| `gfx` / `rendering` | 图形后端 |
| `cclegacy` / `legacyCC` | 兼容层 |
| `serialization` / `deserialize` | 序列化 |
| 所有 `pal/*` 模块 | 平台抽象层 |

## Agent Session Contract（tools/debug）

| 合同 | 状态 |
|---|---|
| `createAgentSession` / `inspectScene/Node/Asset` | Stable |
| `dispatch(requestId/action/params)` | Stable |
| `captureFrame()` | Stable |
| `getRuntimeErrors / clearRuntimeErrors` | Stable |
| `close()` | Stable |

## Benchmark / Recipe Schema

| Schema | 状态 |
|---|---|
| `BenchmarkDefinition` | Stable |
| `RecipeDefinition` | Stable |
| `AgentDriver` / `AgentAction` / `FeedbackPackage` | Stable |
| `Validator`（12 首批） | Stable |

## 物理后端选择接口

| 项 | 内容 |
|---|---|
| API | `createAirApp(options)` 增可选字段 `physics?: 'builtin' \| 'cannon'`（`AirAppOptions`，src/air/app.ts） |
| 语义 | 交付期 3D 物理后端选择；默认 `'builtin'`（与既往发行行为逐字节等价）；`'cannon'` 在 `Game.EVENT_PRE_SUBSYSTEM_INIT` 上以官方「最后注册者胜出」语义确定性重注册（src/air/physics-backend.ts，Air 原创，file-map 在册） |
| 伴随 | `selectPhysicsBackend()` 顶层导出（src/air/index.ts）；默认 bundle 同编入 builtin+cannon（`AIR_FEATURES` + `physics-cannon`）；默认物理材质种子（无 Creator 资产包时修复 errorID 9642 致命面） |
| 类型 | 纯 additive；无既有符号删除/改签 |
| 验收 | `examples/physics-3d-collision`（双链 PASS）+ 三浏览器物理契约矩阵 |
