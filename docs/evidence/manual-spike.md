# 开发手册能力冒烟（Wave 0 Spike）

- 日期：2026-09-19
- 目的：在写任何手册正文之前，用真实浏览器逐项验证 three.js manual 各篇主题在 cocosair 上**到底能不能做**，并把确切 API 名固化下来。
- 方法：`.tmp-manual-spike/`（临时工作区，已清理）+ `index.html` 挂 `#GameCanvas` + `importmap: cocosair → /build/cocosair.module.js`；Playwright chromium（`--use-gl=angle --enable-unsafe-swiftshader --disable-gpu-sandbox`）加载后 `page.evaluate` 读 `window.__spike`。
- 轮次：第 1 轮（导出面 / 运行期对象 / 17 项 attempt），第 2 轮（材质与几何细节，用于解开第 1 轮唯一 FAIL）。

> **证据强度声明（诚实口径）**：本文件记录的是 **API 在场性 + 赋值不抛异常**，不是画面正确性。凡标 `FULL` 者，配套示例仍须过 `tools/verify/manual-examples-verify.cjs` 的 `visible-frame` / `frame-diff` 才算数；标 `PARTIAL` 者表示 API 齐全但**缺资产或缺一环**，手册必须显式写明缺口。

## 1. 导出面（第 1 轮 `exports`）

在场（`function` / `object`）：`createAirApp`、`Scene`、`Node`、`Component`、`Camera`、`DirectionalLight`、`MeshRenderer`、`Layers`、`Color`、`Vec3`、`Quat`、`Mat4`、`primitives`、`utils`、`builtinResMgr`、`game`、`director`、`screen`、`input`、`Input`、`EventKeyboard`、`KeyCode`、`geometry`、`BatchingUtility`、`LODGroup`、`ImageAsset`、`Texture2D`、`GLTFLoader`、`tween`、`Tween`、`Animation`、`Root`、`SkyboxInfo`、`FogInfo`、`ShadowsInfo`、`Material`。

**不存在（`undefined`）**：`view`、`Ray`（顶层）、`Intersection`（顶层）、`Sprite`、`Label`、`PostSettings`、`ToneMapping`、`ToneMappingType`、`ShadowsType`、`ShadowType`、`FogType`、`reflectionProbeManager`、`effectManager`。

关键推论：
1. 射线/求交要走命名空间：`cc.geometry.Ray` + `cc.geometry.intersect`，**不能**从顶层 import `Ray`。
2. 自适应视口走 `cc.screen`（`devicePixelRatio` / `windowSize` / `resolution` / `supportsFullScreen` / `fullScreen` / `requestFullScreen` / `on` / `off`），**没有 `cc.view`**，three.js 手册里的 `renderer.setSize` 类比要改写。
3. 枚举（阴影类型 / 雾类型 / ToneMapping）不在顶层导出，只能从 `scene.globals.*` 实例上读写，取值靠数值或从 `SkyboxInfo`/`FogInfo`/`ShadowsInfo` 类静态成员取——写手册时必须现场 `console.log` 确认字面量，不能凭 three.js 记忆填。
4. 2D/UI（`Sprite`/`Label`）缺失 → three.js manual 的 `canvas-textures` 文字贴图、`tips` 中的 DOM 对齐可做，但**任何"用引擎 UI 组件"的路子都是 N/A**。
5. 物理、WebGPU、WebXR 三族全缺（对应篇章按计划书标 N/A）。

## 2. 运行期对象形状（第 1 轮 `runtime`）

- `app` 实例键：`_started`、`canvas`；原型：`constructor`、`run`、`getScene` —— **手册只能承诺这三个入口**，不要写 `app.pause()` / `app.destroy()`。
- `scene.globals` 键：`ambient`、`shadows`、`_skybox`、`fog`、`octree`、`skin`、`lightProbeInfo`、`postSettings`、`bakedWithStationaryMainLight`、`bakedWithHighpLightmap`、`disableLightmap`。
- `globals.shadows` 原型：`enabled`、`type`、`shadowColor`、`planeDirection`、`planeHeight`、`planeBias`、`maxReceived`、`shadowMapSize`、`setPlaneFromNode`、`activate`。
- `DirectionalLight` 原型：`illuminance`、`shadowEnabled`、`shadowPcf`、`shadowBias`、`shadowNormalBias`、`shadowSaturation`、`shadowDistance`、`shadowInvisibleOcclusionRange`、`csmLevel`、`enableCSM`、`csmLayerLambda`、`csmOptimizationMode`、`shadowFixedArea`、`shadowNear`、`shadowFar`、`shadowOrthoSize`、`csmAdvancedOptions`、`csmLayersTransition`、`csmTransitionRange`。
- `MeshRenderer` 原型（阴影/材质相关）：`shadowCastingMode`、`receiveShadow`、`mesh`、`model`、`setInstancedAttribute`、`getWeight` / `setWeight` / `setWeights`（morph）。
- `globals.fog` 原型：`enabled`、`accurate`、`fogColor`、`type`、`fogDensity`、`fogStart`、`fogEnd`、`fogAtten`、`fogTop`、`fogRange`、`activate`。
- `globals._skybox`（经 `globals.skybox` 取）原型：`enabled`、`envLightingType`、`useIBL`、`useHDR`、`envmap`、`rotationAngle`、`diffuseMap`、`reflectionMap`、`skyboxMaterial`、`updateEnvMap`、`setMaterialProperty`、`applyDiffuseMap`。
- `globals.ambient` 原型：`skyColorHDR`、`groundAlbedoHDR`、`skyIllumHDR`、`skyColorLDR`、`groundAlbedoLDR`、`skyIllumLDR`、`skyLightingColor`、`skyColor`、`skyIllum`、`groundLightingColor`、`groundAlbedo`。
- `globals.postSettings` 实例键 `_toneMappingType`、`_resource`；原型只有 `toneMappingType`、`activate` —— **后处理仅此一项**，`camera.usePostProcess` / `camera.postProcess` 在 Camera 原型上存在但没有可配的 Bloom/DOF 通道。
- `Camera` 原型（拾取/投影三件套在场）：`screenPointToRay`、`worldToScreen`、`screenToWorld`、`convertToUINode`，以及 `projection`、`fovAxis`、`fov`、`orthoHeight`、`near`、`far`、`rect`、`targetTexture`、`clearFlags`、`clearColor`、`visibility`、`priority`、`aperture`/`shutter`/`iso`。
- `Node` 原型：`children`、`active`、`addChild`、`insertChild`、`removeChild`、`removeAllChildren`、`getChildByName`、`getChildByPath`、`getChildByUuid`、`getComponentInChildren`、`destroy`、`position`/`worldPosition`、`rotation`/`eulerAngles`/`worldRotation`、`scale`/`worldScale`、`layer`、`lookAt`、`setPosition`/`getPosition`、`setRotation`/`setRotationFromEuler`、`setScale`/`getScale`、`setWorldPosition`/`getWorldPosition`。
  - ⚠ **没有 `appendChild`**（three.js 习惯写法）——一律 `addChild`。

## 3. 材质（第 2 轮，解开第 1 轮唯一 FAIL）

第 1 轮 `transparentMaterial` attempt 抛错：

```
cc.builtinResMgr.get(...).clone is not a function
```

第 2 轮结论：
- `Material` 原型有 **`copy`，没有 `clone`**；其余可用成员：`initialize`、`reset`、`recompileShaders`、`overridePipelineStates`、`resetUniforms`、`setProperty`、`getProperty`、`passes`、`technique`、`effectName`、`effectAsset`、`hash`、`parent`、`owner`、`destroy`、`validate`。
- `builtinResMgr` 原型仅：`init`、`addAsset`、`get`、`loadBuiltinAssets`、`compileBuiltinMaterial` —— **没有枚举/列表 API**，手册里能给的内置材质名只有已验证的 `builtin-standard-material`（其余名字必须逐个实测后才可写）。
- 自建材质可行路径（实测通过）：

```js
const m = new cc.Material();
m.initialize({ effectName: 'builtin-standard' });   // m.passes.length === 3
m.setProperty('mainColor', new cc.Color(255, 120, 60, 120));
```

- `cc.effectManager` 为 `undefined` → **手册不能列"可用 effect 清单"**，只能给 `builtin-standard` 这一个已验证值，并说明其余需查引擎源码。
- 由此改写 three.js manual 的"材质克隆改透明"范式为：`builtinResMgr.get(...)` 拿共享材质 → `new Material()` + `initialize({effectName})` + `copy` 或直接 `setProperty`；**共享材质绝不能就地改**（会污染所有 renderer）。

## 4. 几何与工具（第 2 轮）

- `primitives`：`box`、`capsule`、`circle`、`cone`、`cylinder`、`plane`、`quad`、`sphere`、`torus`、`wireframe`、`wireframed`、`normals`、`scale`、`translate`、`invWinding`、`toWavefrontOBJ`、`applyDefaultGeometryOptions`。
  - ✅ `wireframe` / `wireframed` 在场 → three.js manual `drawing-lines` 的"线框显示"可用几何级方案实现，不必依赖材质 wireframe 通道。
- `utils`：`createMesh`、`readMesh`、`MeshUtils`、`mapBuffer`、`readBuffer`、`writeBuffer`、`find`、`toPPM`。
- `geometry`：`AABB`、`Capsule`、`ERaycastMode`、`Frustum`、`Line`、`OBB`、`Plane`、`Ray`、`Sphere`、`Spline`、`SplineMode`、`Triangle`、`aabb`、`capsule`、`distance`、`frustum`、`intersect`、`line`、`obb`、`plane`、`ray`、`sphere`、`triangle`、`enums`、`AnimationCurve`、`Keyframe`、`OptimizedKey`、`WrapModeMask`、`evalOptCurve`、`constructLegacyCurveAndConvert`。
- `tween(node)` 原型：`to`、`by`、`set`、`delay`、`call`、`sequence`、`parallel`、`repeat`、`repeatForever`、`reverseTime`、`start`、`stop`、`pause`、`resume`、`union`、`then`、`timeScale`、`duration`、`hide`/`show`、`target`、`clone`。
  - ✅ 动画篇可全程用 `tween`，无需 `AnimationClip` 资产（零资产原则）。

## 5. 主题判定表（回填映射）

| three.js manual 主题 | 判定 | 依据 / 确切 API |
| --- | --- | --- |
| shadows | **FULL** | `globals.shadows.enabled/type/shadowMapSize/setPlaneFromNode` + `light.shadowEnabled/shadowPcf/enableCSM/csmLevel` + `renderer.shadowCastingMode/receiveShadow` |
| fog | **FULL** | `globals.fog.enabled/type/fogColor/fogDensity/fogStart/fogEnd/fogAtten/fogTop/fogRange/accurate` |
| skybox | **PARTIAL** | API 齐（`enabled/envmap/useIBL/envLightingType/skyboxMaterial/rotationAngle`），但 `envmap` 需环境贴图资产；零资产前提下只能演示"开关 + 程序化替代（clearColor/渐变背景）"，正文须写明缺口 |
| tone mapping / 后处理 | **PARTIAL** | 仅 `globals.postSettings.toneMappingType`；无 Bloom/DOF/SSAO 通道，`PostSettings`/`ToneMapping` 类未导出 |
| responsive / resize | **FULL（换 API）** | `cc.screen.windowSize/devicePixelRatio/resolution/on('canvas-resize'|'window-resize')`；**无 `cc.view`**，无 `renderer.setSize` |
| picking / 对齐 HTML | **FULL** | `camera.screenPointToRay` + `geometry.Ray` + `geometry.intersect.rayAABB/rayOBB/raySphere` + `camera.worldToScreen/screenToWorld` |
| optimization（合批/LOD/实例化） | **FULL** | `BatchingUtility`、`LODGroup`、`renderer.setInstancedAttribute` 均导出；draw call / 三角形计数走 `device.numDrawCalls` / `numTris` / `numInstances`（见 §7 更正）——**能给量化数字**，等价于 three.js 的 `renderer.info` |
| canvas textures | **FULL** | `ImageAsset` + `Texture2D` 导出；实测 canvas → ImageAsset → Texture2D → `material.setProperty` 链路不抛异常 |
| keyboard / 输入 | **FULL** | `input`、`Input`、`KeyCode`、`EventKeyboard` 导出；`input.on(Input.EventType.KEY_DOWN, ...)` |
| 多实例 / 多画布 | **PARTIAL** | `game`、`director` 是单例（`game` 单例已在 attempt 中确认），一个页面**只能一个引擎实例** → three.js manual"同一页多个 canvas"范式 N/A，需改写为"单实例多相机 / 多 Scene 切换（`app.run(scene)`）" |
| 2D / UI / 文字 | **N/A** | `Sprite`、`Label` 未导出 |
| 物理 | **N/A** | 无 `PhysicsSystem` / `RigidBody` / `Collider` 导出 |
| WebGPU | **N/A** | 无 WebGPU 后端导出 |
| WebXR | **N/A** | 无 XR 相关导出 |
| 加载模型（gltf） | **FULL（内联）** | `GLTFLoader` 导出；零资产原则下用**内联 glTF JSON（data URI / 直接对象）**，避免外部文件带来的 provenance/MIME/许可证链 |

## 7. 全量导出面复核（对 §1 的更正）

§1 的"不存在"结论来自**手工挑选的探针名单**，只证明"这些名字没导出"。之后直接解析 `build/cocosair.module.js` 末尾的 `export { ... }`，得到**权威导出面：368 个名字**。据此更正与补充：

**§1 判 N/A 但实际存在的（必须改写结论）**
- `VERSION`（引擎版本字符串）→ `installation` / `webgl-compatibility-check` 的 overlay 可直接显示，不需要硬编码。
- `gfx`、`WebGL2Device`、`WebGLDevice`、`EmptyDevice`、`Root` → WebGL 兼容性检查有正规路径（`gfx` 命名空间下的 device/caps），不必只靠 `canvas.getContext` 试探。
- `sys`、`macro`、`settings`、`Settings`、`SettingsCategory` → 平台/特性开关查询走 `sys` 与 `settings`，`webgl-compatibility-check` 与 `responsive` 应以它们为准。
- `RenderTexture` + `Camera.targetTexture` → **Render Targets 从 PARTIAL 上调为可做**（离屏渲染目标可用），但仍无 three.js 那种"任意 MRT/自定义 pass"接口，正文需说明边界。
- `BloomStage`、`PostProcessStage`、`PostSettingsInfo`、`camera.usePostProcess` / `camera.postProcess` → 后处理**不止 `toneMappingType`**，管线里存在 Bloom 阶段类；但是否能在 Code First 下真正启用**未实测**，因此 `how-to-use-post-processing` 保持 **PARTIAL**，实测通过后才可上调。
- `ReflectionProbeManager`、`ReflectionProbe`、`ReflectionProbeType`（类）→ §1 说的 `reflectionProbeManager`（小写单例）确实没有，但类是导出的。
- `EventHMD` → 存在 HMD 输入事件类型；但无 XR 会话/相机/控制器导出，**WebXR 三篇仍判 N/A**，可在文中提一句 `EventHMD` 的存在与不可用原因。
- `createDracoDecoder`、`createKTX2Transcoder`、`createMeshoptDecoder`、`KHR_DRACO_MESH_COMPRESSION`、`KHR_MESHOPT_COMPRESSION`、`KHR_MESH_QUANTIZATION`、`EXT_MESHOPT_COMPRESSION`、`configureGLTFLoaderDefaults`、`registerGLTFLoader`、`GLTFExtensionRegistry` → glTF 压缩链路是**显式注入式**的：`loading-models` / `load-gltf` 必须讲"decoder 需自行注入"，与仓库既有的 `decoder-required` 能力合同一致。
- `InstancedBuffer`、`BatchingUtility`、`LODGroup`、`LOD` → 性能三件套齐备。
- `SkeletalAnimation`、`AnimationClip`、`AnimationManager`、`Skeleton`、`SkelAnimDataHub`、`restoreBindPose` → 骨骼动画可用（配合 GLTFLoader 的动画通道）。
- `frameObject` → 已在 `examples/*` 使用，`cameras` 篇的自动取景有正规 API。
- **`device.numDrawCalls` / `numTris` / `numInstances` 可读**（实测静止单立方体：`numDrawCalls: 1`、`numTris: 12`、`numInstances: 0`）→ 更正 §5 "性能篇不能给 `renderer.info` 数字"的判断：**可以给出 draw call / 三角形计数**，`optimize-lots-of-objects` 系列因此能做成量化对比而不只是结构化建议。
- `device.capabilities`（**不是 `device.caps`**，后者 `undefined`）→ 字段实测：`maxVertexAttributes`、`maxVertexUniformVectors`、`maxFragmentUniformVectors`、`maxTextureUnits`、`maxImageUnits`、`maxVertexTextureUnits`、`maxColorRenderTargets`、`maxShaderStorageBufferBindings`、`maxShaderStorageBlockSize`、`maxUniformBufferBindings`、`maxUniformBlockSize`、`maxTextureSize`、`maxCubeMapTextureSize`、`maxArrayTextureLayers`、`max3DTextureSize`、`uboOffsetAlignment`、`maxComputeSharedMemorySize`、`maxComputeWorkGroupInvocations`、`maxComputeWorkGroupSize`、`maxComputeWorkGroupCount`、`supportQuery`、`supportVariableRateShading`、`supportSubPassShading`、`clipSpaceMinZ`、`screenSpaceSignY`、`clipSpaceSignY`。
  - ⚠ 软件光栅化环境下 `maxColorRenderTargets: 0`、`maxTextureSize: 16384`；`rendertargets` 篇的 MRT 部分必须在真机 GPU 上另行取证，不能拿 CI 数值当能力上限。
- `gfx.API` 枚举：`UNKNOWN:0, GLES2:1, GLES3:2, METAL:3, VULKAN:4, NVN:5, WEBGL:6, WEBGL2:7, WEBGPU:8`；实测 `device.constructor.name === 'WebGL2Device'`，而 `game.renderType === -1`（**不能用来判后端**）。
- `VERSION === '4.0.0'`（引擎基线）与 `package.json.version === '0.1.0'`（AIR 封装层）是两个不同含义的版本号，正文必须区分。
- `sys` 实际字段：`platform`（实测 `'DESKTOP_BROWSER'`）、`browserType`（`'chrome'`）、`browserVersion`、`os`（`'Windows'`）、`osVersion`（实测空串）、`isMobile`、`isBrowser`、`isXR`、`supportsWebGL2`、`localStorage`、`getNetworkType`、`getBatteryLevel`、`now`、`dump`、`openURL`。
  - ⚠ `sys.browser` 是 **`undefined`** —— 常见误写，必须用 `browserType`。
- `screen.resolution` / `screen.windowSize` 返回 `{width, height}` **对象**（不是数字对）；`game.frameRate === 60`；`game.targetFrameRate` 不存在。

**仍然确认缺失（N/A 判定不变）**
- 2D/UI：无 `Sprite`、`Label`、`UITransform`、`Widget` 等导出 → `creating-text` 与所有"用引擎 UI"的路子 N/A。
- 物理：导出面里只有 `physics` 选择器的注册/切换类型（`IPhysicsEngineId` / `IPhysicsWrapperObject`），**没有 `RigidBody` / `Collider` / `PhysicsSystem` 组件** → `physics` N/A。
- WebGPU：只有 `WebGL2Device` / `WebGLDevice` / `EmptyDevice`，无 WebGPU device → 两篇 N/A。
- WebXR：无 XR 会话/控制器/相机导出 → 三篇 N/A。
- `cc.view`：确实没有，视口一律走 `screen`。
- `effectManager`：确实没有，effect 清单不可枚举。

**方法论教训**（写进后续每一篇的自查）：判"不存在"必须对**全量导出名单**判，不能对手工探针名单判。368 个名字的清单可由 `build/cocosair.module.js` 末尾 `export { ... }` 直接解析得到，任何篇目动手前先在这份名单里搜关键词。

## 8. 对手册写作的硬约束（从冒烟直接导出）

1. `#GameCanvas` 必须在 import 引擎前就在 DOM 里（模块级 ScreenAdapter 单例）。
2. `Camera` 必须显式 `visibility = Layers.Enum.DEFAULT`，否则画面全空。
3. 像素读取必须在 `director.on(Director.EVENT_AFTER_DRAW, ...)` 回调内完成，回调返回后 drawing buffer 失效。
4. 内置材质共享，禁止就地 `setProperty`；要改就 `new Material()` + `initialize({effectName:'builtin-standard'})`（`Material` 有 `copy`，没有 `clone`）。
5. 树操作叫 `addChild`，不叫 `appendChild`。
6. 所有"类型枚举字面量"必须现场实测后再写进正文，不得凭 three.js 记忆填。
7. 判"某能力不存在"前，先在 368 个导出名里搜（见 §7 方法论教训）。
8. 每篇有能力的文章配 `docs/manual/examples/manual-<slug>/`，且必须过验证器 4 项检查（`app-contract`、`visible-frame`、`no-runtime-error`、`frame-diff`）才可在 index.md 标 ▶。
