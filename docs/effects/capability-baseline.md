# 原生效果能力基线：Wave 0 C

2026-10-09；执行渠道：native subagent。仅完成当前源码、实际SDK声明/ESM导出与sourceMap嵌入源的核查；**9效果EG、4组合Gate、100次资源循环、性能预算、Agent Gate全部NOT_RUN**。源码存在不等于效果verified，旧报告PASS不继承。

机器可读事实/签名与SHA见[capability-baseline.json](capability-baseline.json)。上下文：[任务计划](../../ai/plans/shaders-absorption-task-plan.md)、[AGENTS](../../AGENTS.md)。未改src/SDK/build/package，不构建、不安装、不提交。

## 身份与来源

HEAD：`1cb71bf98d009a84095203796231a3b894701307`，branch：`main`；采集时dirty 39 项，完整清单、dirty SHA及时间已入JSON。并行任务之后修改的文件不能追溯成这个采集时点。默认SDK不等于HEAD构建来源：本轮dev/min两sourceMap各905个嵌入src内容与磁盘905/905一致（仅CRLF归一），0missing/0changed；证明嵌入闭包一致，不证明构建参数、clean build、未嵌入源码或dts产地。npm bundle因去sourceMap尾注SHA不同，后续应核验实际安装入口，不能把源码直接导入当安装验收。

| 产物 | bytes | SHA256 |
| --- | ---: | --- |
| build/cocosair.module.js | 6631057 | `3a448f029369ac0253f3098fc08680c65f81bdf3bb472795e3032fdd725ab01d` |
| build/cocosair.module.min.js | 3703206 | `8e56fbd5a5b754252838204ff1c204223aadd7c401bd1615c2008e808b5fe05c` |
| build/cocosair.module.d.ts | 3303518 | `3c2b1853a372509d040bbfc93d957b2c525764d000467f8aac8f33f8b8068fee` |
| build/cocosair.module.js.map | 20318600 | `b9a6183d745ae774288c2d7963364a6fa9d87297f1a399b2421aa6d1e3a246f0` |
| build/cocosair.module.min.js.map | 16707399 | `42a43a8245b1e366b5efb839d150deda41a9fdf494917f7ac67ea16fe10d6374` |
| build/npm/cocosair.module.js | 6631013 | `f2a59819e45b11ef75841439d713c1a73eae76b7f3be4bdded3398d6ac56e036` |
| build/npm/cocosair.module.min.js | 3703158 | `8e29adb99aff5b906d60fd9dbd95edb8752954cf795d19c97c87b3cb0b0976ad` |
| build/bootstrap.js | 8518 | `57b2dfc7f7b5d29d43b7d9619274c1879f6f37223c7ae2685c0d2619707aef8f` |
| build/bootstrap.d.ts | 213 | `3fd56ec33a68ed72b488d01c95439c4c7b3c7fde2275724b5f37670248bc12c2` |
| package.json | 5719 | `3f5b307611105805504e0f1ff1dedaf9eb6fc5a869ce34ae574d01d917daa8ba` |
| package-lock.json | 405447 | `2b41ef8617e8a3df05822863e2a4d1590a909c02d1a096e81526ec35694c1c9c` |

上游固定为`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`（任务给定）。本C任务没有下载/重新验证上游；具体参考文件/许可/算法绑定已按[Wave0 A来源索引](upstream-index.md)和[字节记录](upstream-reference.json)写入本JSON各effect。来源下载/逐Gitblob验证属于A渠道，本C只核对其固定commit/9ID/路径与SHA字段，不冒称独立重新下载。每effect仍须另建UPSTREAM记录采用思想和本地差异。

## 上游语义与原生路线的绑定

| ID | 固定commit中的主文件 | 源码语义（A渠道核实，本C关联） |
| --- | --- | --- |
| E01 | `packages/core/src/shaders/NoiseDissolve/index.ts` | progress 0 visible / 1 erased at all softness; seed is floating domain displacement, not integer PRNG; field has no time. |
| E02 | `packages/core/src/shaders/ThinFilm/index.ts` | Scale-adjusted SDF; rimWidth has 0.1 scale; degrees lightAngle; rainbow phases 0,0.3333,0.6667; custom mode/colorSpace are structural branches. |
| E03 | `packages/core/src/shaders/Holographic/index.ts` | Normal stencil 0.008; wrinkle stencil 0.02; hueShift degrees /360; exact thirds palette; accumulated animated time; upstream exposes no seed. |
| E04 | `packages/core/src/shaders/Neon/index.ts` | Center plus cardinal SDF neighbors; core/tube/glow controls separate; glow cutoff forces distant alpha=0; flicker/flow use time. |
| E05 | `packages/core/src/shaders/Emboss/index.ts` | Child RTT is premultiplied; unpremultiply before color math then return straight RGBA; signed depth controls raised/sunken; outside shape passes input through. |
| E06 | `packages/core/src/shaders/Sparkle/index.ts` | CSS-pixel size/rays/expand; threshold on sqrt(linear luma), band=0.12; Rec709 luma weights; intensity=0 identity; expand crossing zero changes tap topology; seed domain differs per layer. |
| E07 | `packages/core/src/shaders/LiquidMetal/index.ts` | Ripple frequency times2.6; flow time times0.12; desktop chromatic split vs mobile shared evaluation is build-time device branch; upstream exposes no seed. |
| E08 | `packages/core/src/shaders/CursorTrail/index.ts` | MAX_POINTS64 including duplicate head; three Bezier subdivisions; speed dt cap0.1s / age cap0.25s; aspect-correct distance; width signed to encode connectivity; newest-overlap paint logic. |
| E09 | `packages/core/src/shaders/Glass/index.ts` | requiresRTT and child=true; blur and aberration crossing zero trigger structural recompilation; blur radius=blur*2; RTT samples premultiplied, effect math straight; first-lobe thickness for volumetric mode. |

E01 seed是浮点域位移且没有time；不得把泛用sin hash称为上游噪声等价。E03/E07本地seed属于扩展，不能写成上游已提供。E06阈值是alpha加权邻域亮度的sqrt(linear Rec709 luma)、band0.12，不能机械实现为gammaRGB上的硬>=判断；alpha0亮RGB不得生成星芒，intensity0是identity。E02导数AA不能替代SDF normal梯度；真实Shape覆盖须声明。所有算法oracle随这些语义冻结，差异明确登记REFERENCE_ERROR或本地extension，而非截图相似就PASS。

## 能力入口：静态声明级别

| 能力 | 首入口 | 源码 | 当前级别 |
| --- | --- | --- | --- |
| boot | `createAirApp(options: AirAppOptions): Promise<AirApp>` | [src/air/app.ts](../../src/air/app.ts) | SOURCE_AND_SDK_DECLARED |
| effect | `EffectAsset.onLoaded(): void` | [src/cocos/asset/assets/effect-asset.ts](../../src/cocos/asset/assets/effect-asset.ts) | SOURCE_AND_SDK_DECLARED |
| material | `Material.initialize(info: IMaterialInfo): void` | [src/cocos/asset/assets/material.ts](../../src/cocos/asset/assets/material.ts) | SOURCE_AND_SDK_DECLARED |
| mesh | `utils.MeshUtils.createMesh(geometry: primitives.IGeometry, out?: Mesh, options?: primitives.ICreateMeshOptions): Mesh` | [src/cocos/3d/misc/create-mesh.ts](../../src/cocos/3d/misc/create-mesh.ts) | SOURCE_AND_SDK_DECLARED |
| renderer | `MeshRenderer.mesh: Mesh | null` | [src/cocos/3d/framework/mesh-renderer.ts](../../src/cocos/3d/framework/mesh-renderer.ts) | SOURCE_AND_SDK_DECLARED |
| texture | `Texture2D.reset(info: ITexture2DCreateInfo): void` | [src/cocos/asset/assets/texture-2d.ts](../../src/cocos/asset/assets/texture-2d.ts) | SOURCE_AND_SDK_DECLARED |
| render-texture | `RenderTexture.initialize(info: IRenderTextureCreateInfo): void` | [src/cocos/asset/assets/render-texture.ts](../../src/cocos/asset/assets/render-texture.ts) | SOURCE_AND_SDK_DECLARED |
| target | `createAirRenderTarget(options: AirRenderTargetOptions): AirRenderTarget` | [src/air/rendering/render-target.ts](../../src/air/rendering/render-target.ts) | SOURCE_AND_SDK_DECLARED |
| clock | `createStepClock(options?: {frameRate?:number` | [src/air/step-clock.ts](../../src/air/step-clock.ts) | SOURCE_AND_SDK_DECLARED |
| session | `createSessionScope(): AirSessionScope` | [src/air/session-scope.ts](../../src/air/session-scope.ts) | SOURCE_AND_SDK_DECLARED |
| input | `input.on/off(Input.EventType, callback, target?)` | [src/air/action-input.ts](../../src/air/action-input.ts) | SOURCE_AND_SDK_DECLARED |
| resize | `AirAppOptions.pixelRatioCap?:number` | [src/air/bootstrap.ts](../../src/air/bootstrap.ts) | SOURCE_AND_SDK_DECLARED |
| color-alpha | `validateAirTextureColorContract(input:{format?:Format|PixelFormat` | [src/air/rendering/color-contract.ts](../../src/air/rendering/color-contract.ts) | SOURCE_AND_SDK_DECLARED |
| shader-math | `Engine-native self-contained GLSL3 fragment: dFdx/dFdy/fwidth, texture/textureLod/texelFetch` | [tools/build/effect-json.mjs](../../tools/build/effect-json.mjs) | SOURCE_AND_SDK_DECLARED |

顶级named bundle导出已逐项核实：EffectAsset、Material、MeshRenderer、Texture2D、RenderTexture、AirRenderTarget、createAirRenderTarget、createStepClock、createSessionScope、createActionInput、createAirApp、validateAirTextureColorContract、utils、gfx、input、Input、Director、director、view、screen。`MaterialInstance`仅有renderer命名空间/返回类型，不能照名称直接named import；`createAirAppSafe`不是当前API，安全入口实际为`cocosair.js/bootstrap`的`createAirApp`。这些只是export/declared，不是设备启动PASS。

### boot

```ts
createAirApp(options: AirAppOptions): Promise<AirApp>
```

- GameCanvas exists before engine module import; safe package entry cocosair.js/bootstrap exposes the same createAirApp name (not createAirAppSafe).
- Await device initialization before creating Material passes, dynamic Mesh, Texture2D uploads or AirRenderTarget.
- AirApp.close is terminal for a handle; same-document runtime reconstruction requires reload. For 100 iterations use effect-instance create/destroy in one running app.

来源：[src/air/app.ts](../../src/air/app.ts)；已有说明：[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### effect

```ts
EffectAsset.onLoaded(): void; static register(asset: EffectAsset): void; static get(name: string): EffectAsset | null; static remove(asset: EffectAsset | string): void; destroy(): boolean
```

- Compile/generate self-contained GLSL3 + engine reflection JSON offline, Object.assign(new EffectAsset(), json), onLoaded(), then Material.initialize({effectAsset}).
- Early onLoaded registers metadata and defers program registration until renderer init; it does not prove shader compilation or pixel output.
- Same effect name overwrites registry; use stable collision-resistant source/definition identities; destroy/unregister only owned assets.
- Use default WebGL2/legacy path for pilots; custom-pipeline descriptors/layout requirements are a separate variant capability, not implicitly supplied by effect-json.

来源：[src/cocos/asset/assets/effect-asset.ts](../../src/cocos/asset/assets/effect-asset.ts)；已有说明：[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### material

```ts
Material.initialize(info: IMaterialInfo): void; setProperty(name: string, val: MaterialPropertyFull | MaterialPropertyFull[], passIdx?: number): void; getProperty(name: string, passIdx?: number): Readonly<MaterialPropertyFull | MaterialPropertyFull[]>; get passes(): Pass[]
```

- IMaterialInfo: effectAsset?/effectName?, technique?, defines?: MacroRecord|MacroRecord[], states?: PassOverrides|PassOverrides[].
- Set a vec4 parameter via Vec4 (scalar members packed into x/y/z/w); set sampler via Texture2D/TextureBase, not an arbitrary plain object.
- Base Material.recompileShaders and overridePipelineStates only warn. Do not call base reset expecting a rebuilt existing material: initialize warns/returns if passes already exist.
- Renderer.getMaterialInstance(0) returns a native renderer.MaterialInstance; its overrides really call pass.tryCompile/overridePipelineStates. MaterialInstance is NOT a top-level named bundle export.
- Prefer uniform/resource update; if structure changes, deliberately create/copy a new material, bind new, unbind old, then release old. Preserve per-instance parameter isolation.

来源：[src/cocos/asset/assets/material.ts](../../src/cocos/asset/assets/material.ts)；已有说明：[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### mesh

```ts
utils.MeshUtils.createMesh(geometry: primitives.IGeometry, out?: Mesh, options?: primitives.ICreateMeshOptions): Mesh; utils.MeshUtils.createDynamicMesh(primitiveIndex: number, geometry: primitives.IDynamicGeometry, out?: Mesh, options?: primitives.ICreateDynamicMeshOptions): Mesh; Mesh.updateSubMesh(primitiveIndex: number, dynamicGeometry: Partial<IDynamicGeometry>): void
```

- Static geometry: number[] positions/uvs and indices. Dynamic: Float32Array positions/uvs and Uint16Array indices16 OR Uint32Array indices32.
- Explicit maxSubMeshes/maxSubMeshVertices/maxSubMeshIndices; positions-only update preserves omitted streams/index buffer after native preflight.
- After update call MeshRenderer.onGeometryChanged(); correct front-facing winding/normals/UVs and finite bounds are still application responsibility.
- Fullscreen effect geometry uses native MeshRenderer + orthographic Camera; no alternate renderer/canvas or direct GL draw fallback.

来源：[src/cocos/3d/misc/create-mesh.ts](../../src/cocos/3d/misc/create-mesh.ts)；已有说明：[docs/reference/k0-r2-native-contracts.md](../../docs/reference/k0-r2-native-contracts.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### renderer

```ts
MeshRenderer.mesh: Mesh | null; setSharedMaterial(material: Material | null, index: number, forceUpdate?: boolean): void; getMaterialInstance(idx: number): renderer.MaterialInstance | null; onGeometryChanged(): void
```

- Shared material shares uniform state; independent instances need independent material/MaterialInstance.
- Unbind mesh/material before destroying nodes/assets; rendering components borrow resources and cannot replace explicit owner/ref tracking.

来源：[src/cocos/3d/framework/mesh-renderer.ts](../../src/cocos/3d/framework/mesh-renderer.ts)；已有说明：[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### texture

```ts
Texture2D.reset(info: ITexture2DCreateInfo): void; image: ImageAsset | null; uploadData(source: HTMLCanvasElement | HTMLImageElement | ArrayBufferView | ImageBitmap, level?: number, arrayIndex?: number): void; setFilters(minFilter: TextureFilter, magFilter: TextureFilter): void; setMipFilter(mipFilter: TextureFilter): void
```

- UploadData is inherited from SimpleTexture; use actual width/height/format/mip count; prove sampler/filter/UV/row orientation with asymmetric texture.
- Choose rgba8 for images; float data texture only after device getFormatFeatures says sampled/render/filter support. Do not silently substitute formats.
- Texture bytes update for bounded trail/noise data is available, but generator does not author uniform arrays; alternative local native data texture or dynamic mesh must be measured.

来源：[src/cocos/asset/assets/texture-2d.ts](../../src/cocos/asset/assets/texture-2d.ts)；已有说明：[docs/manual/texture-source-orientation.md](../../docs/manual/texture-source-orientation.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### render-texture

```ts
RenderTexture.initialize(info: IRenderTextureCreateInfo): void; resize(width: number, height: number): void; getGFXTexture(): gfx.Texture | null; readPixels(x?: number, y?: number, width?: number, height?: number, buffer?: Uint8Array): Uint8Array | null; destroy(): boolean
```

- Camera.targetTexture chooses native offscreen rendering; raw RenderTexture readPixels is byte-oriented.
- A multipass Material.passes array does not automatically imply an intermediate scene texture, blur ping-pong or dependencies.

来源：[src/cocos/asset/assets/render-texture.ts](../../src/cocos/asset/assets/render-texture.ts)；已有说明：[docs/manual/interactive-multipass.md](../../docs/manual/interactive-multipass.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### target

```ts
createAirRenderTarget(options: AirRenderTargetOptions): AirRenderTarget; attachCamera(camera: Camera, beforeRender?: () => void): () => void; bindColor(material: Material, property: string, passIdx?: number): () => void; bindDepth(...): () => void; resize(baseWidth: number, baseHeight: number): void; resolve(): void; readColor(region?: {x?:number;y?:number;width?:number;height?:number}): Float32Array | Uint8Array; dispose(): void
```

- width/height are backing pixels before scale (not CSS). Options: colorFormat rgba8|rgba16f|rgba32f|srgb8-alpha8; depthFormat none|depth24-stencil8; samples 1|2|4|8; filter nearest|linear; sampleFallback error|lower.
- Only WebGL2; constructor checks renderable/sampled/filter feature + common color/depth sample support; record requested/effective/actual glSamples rather than claiming requested allocation.
- MSAA resolve after capture camera; info.generation increments on reallocation; bind/unbind closures follow resize and restore prior borrowed bindings.
- Arrange native camera priorities/layers so source capture precedes consumers, excluding Glass from its own source; never sample an attachment being simultaneously rendered to.
- Use two targets for separable blur if measured/needed; identity can skip/disable own cameras, but actual draws/texture use must prove skipping.

来源：[src/air/rendering/render-target.ts](../../src/air/rendering/render-target.ts)；已有说明：[docs/manual/interactive-multipass.md](../../docs/manual/interactive-multipass.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### clock

```ts
createStepClock(options?: {frameRate?:number;stepTimeoutMs?:number}): AirStepClock; begin():void; step(dt?:number):Promise<{step:number;dt:number;afterDraw:true}>; end():void
```

- begin pauses native game pacer; step checks pause, executes director.tick and waits AFTER_DRAW; no second app RAF or wall-time evolution in deterministic gate.
- Ordinary experience uses native Director update and a single accumulated simulation time. AFTER_DRAW proves submission callback, not GPU completion or compositor presentation.
- Pilot supplies finite positive dt and sequential await (do not infer concurrency validation from this wrapper). Unsubscribe named Director callbacks at release.

来源：[src/air/step-clock.ts](../../src/air/step-clock.ts)；已有说明：[docs/manual/interactive-evidence-chain.md](../../docs/manual/interactive-evidence-chain.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### session

```ts
createSessionScope(): AirSessionScope; activate():number; token():{generation:number;isCurrent():boolean}; own(cleanup:()=>void|Promise<void>,label?:string):()=>void; dispose(options?:{timeoutMs?:number}):Promise<AirCleanupReceipt>
```

- Dispose promise is shared, cleanup called at most once, result lists completed/pending/failures; max timeout 5000ms.
- onChange returns unsubscribe; offChange removes a callback; deactivate/generation tokens reject late pointer and asynchronous results.
- Scope is cooperative ownership, not GPU-free measurement or automatic disposal of arbitrary scene assets.

来源：[src/air/session-scope.ts](../../src/air/session-scope.ts)；已有说明：[docs/manual/interactive-input.md](../../docs/manual/interactive-input.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### input

```ts
input.on/off(Input.EventType, callback, target?); createActionInput(options:{state:AirActionState;backend?:"native"|"dom";canvas?:HTMLCanvasElement;session?:AirActionSessionGate;preventDefault?:boolean}):AirActionInput
```

- Choose one native PAL input path OR canvas-local DOM PointerEvent path, never double-subscribe. DOM is input, not a rendering bypass.
- Action adapter is button/axis reducer, not an arbitrary cursor trail coordinate driver; E08 needs real pointer coordinates/getLocation/raw events, rect transform, pointerId, capture/cancel and generation checks.
- Native TOUCH may include mouse emulation; report actual event method/isTrusted/pointer protocol, do not equate synthetic injection with physical touch.
- DOM PointerEvent high-rate/coalesced collection optional and must feature-detect; listener attach/off balanced even pause/reset/destroy.

来源：[src/air/action-input.ts](../../src/air/action-input.ts)；已有说明：[docs/manual/interactive-input.md](../../docs/manual/interactive-input.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### resize

```ts
AirAppOptions.pixelRatioCap?:number; screenMode?:"window"|"container"; container?:HTMLElement|string; designResolution?:{width:number;height:number;policy:number}; view.setDesignResolutionSize(width:number,height:number,resolutionPolicy:ResolutionPolicy|number):void
```

- DPR cap must be configured before runtime import; safe bootstrap does this. PAL devicePixelRatio is min(browser DPR,cap), default2.
- Freeze CSS rect, effective DPR, actual canvas backing, view viewport/resolutionScale and AirRenderTarget effective dimensions; do not infer one from another.
- Live resize must reallocate offscreen targets from actual backing dimensions and rebind generation; initial mobile size is not live-resize proof.

来源：[src/air/bootstrap.ts](../../src/air/bootstrap.ts)；已有说明：[docs/manual/interactive-container.md](../../docs/manual/interactive-container.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### color-alpha

```ts
validateAirTextureColorContract(input:{format?:Format|PixelFormat;usage:"color"|"linear-data"|"depth";decode:"none"|"shader-srgb"|"hardware-srgb"}):Readonly<Required<AirTextureColorContract>>; Material.initialize({states:{blendState,depthStencilState}})
```

- Pure preflight validates declared encoding, never transforms pixels. Builtin CPU SRGBToLinear uses square and LinearToSRGB uses sqrt, not exact IEC transfer.
- Material property metadata linear:true invokes CPU square conversion (scalar value, not array). Custom shader must state exact input/output transfer and avoid double hardware/software decode.
- Freeze straight/premultiplied alpha, choose matching blend factors and disable depthWrite for compositing. Backdrop/transparent edge and RGBA oracle are required; RGB appearance alone insufficient.
- Prefer vec4 color values + explicit declared transfer; do not silently combine Color linear metadata with exact sRGB math and call it equivalent.

来源：[src/air/rendering/color-contract.ts](../../src/air/rendering/color-contract.ts)；已有说明：[docs/manual/interactive-color-controls.md](../../docs/manual/interactive-color-controls.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

### shader-math

```ts
Engine-native self-contained GLSL3 fragment: dFdx/dFdy/fwidth, texture/textureLod/texelFetch; generated EffectAsset metadata + Material uniform updates
```

- WebGL2 shader version selected by program-lib. Derivatives are shader language operations, not named JS API or current effect verification.
- Noise/SDF/color/UV math stays example-local until 2–3 measured consumers justify abstraction. No TypeGPU/runtime embedding.
- Generator supports vec4/mat4 count1 uniforms, sampler2D, vec2/3/4 attributes and float-vector varyings; body main has no declaration/preprocessor/include. GLSL functions inside body source are allowed.
- Large arrays/macros/include/YAML/MRT/compute not supported by constrained generator. Hand-author full native compiled metadata or propose tooling change with real consumer evidence; never fake success with mock compiler.

来源：[tools/build/effect-json.mjs](../../tools/build/effect-json.mjs)；已有说明：[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)。本轮仅源码/SDK映射，当前效果EG仍NOT_RUN。

## E01–E09原生实现/算法证明路线

下表Pass均为设计估计，**没有进行任何新效果算法实现/设备编译/渲染**；不能把计划数写成实际numDrawCalls。每行都要补EG01Build（TS/bundle/真实GLSLcompile）、EG02Runtime（create/update/live resize/pause/resume/destroy/recreate）、EG03Visual+算法oracle、EG04Boundary（default/min/max/near端点/invalid）、EG05Resource100循环、EG06Performance完整矩阵六门。

| 效果 | 原生路径 | Pass设计估计 | 独立算法/数值与像素证明 | 当前 |
| --- | --- | --- | --- | --- |
| E01 Noise Dissolve | Image/procedural/native-render-layer Texture2D or AirRenderTarget color → native quad Material; local seeded noise + progress threshold + declared alpha/soft edge. | 1 effect draw; rendered-layer source may add 1 capture | progress=0 preserves input (including RGBA), progress=1 obeys declared complete removal; explicit branches avoid edge-only residue.<br>Same seed/time/input exact repeated pixels; independent CPU noise/threshold test grid plus coverage monotonicity; different seed must change field. | NOT_RUN |
| E02 Thin Film | Native quad fragment signed distance + derivative antialias + edge gradient/phase rainbow palette; source SDF/raster boundary declared. | 1 effect draw | Analytic circle/box sample distances with inside/outside sign and boundary continuous transition across DPR.<br>Freeze palette phase/period with independent expected stops; optical-looking color is not proof of physical thin-film interference. | NOT_RUN |
| E03 Holographic | Native texture/quad shader uses seeded noise finite-gradient normal, viewing/light direction and phase/time color; explicit transfer. | 1 material draw; any upstream neighborhood stage to be justified after source analysis | Fixed seed/time reconstructs normals/color; central-difference CPU gradients and direction sweep agree.<br>Time t / t+dt / pause/resume continuity; exact transfer patch tests, no claim physical rainbow unless derived. | NOT_RUN |
| E04 Neon | Native quad SDF analytic tube/core/glow falloff; standard native blend states over known backdrop. | 1 draw for analytic glow; optional blur adds explicit capture+2 blur draws only if needed | Independent core/tube/glow toggles and radial profiles; core radius/falloff expected samples and symmetry.<br>Straight/premultiplied RGBA composition at transparent boundary, black/white/colored backdrops; off identity. | NOT_RUN |
| E05 Emboss | Native texture sampling height gradient + normal/light dot + parallax-like local UV offset; input-alpha preservation. | 1 effect draw (unless source requires intermediate) | Ramp height: known gradient normal, opposite light direction swaps shading; flat height has zero emboss.<br>Symmetric finite differences + sample texel size; transparent input carries declared alpha with no fringe; offset=0 identity. | NOT_RUN |
| E06 Sparkle | Native quad samples texture luminance/neighborhood; bounded star rays with time/seed; radius units explicitly pixel or CSS. | 1 bounded sampling draw; any prefilter target separately counted | Only luminance >= threshold emits rays; exact threshold tie policy + isolated bright texel center/ray symmetry.<br>Equivalent radius in declared units across720p/1080p/DPR; t/seed repeated; intensity0 identity; alpha0 bright hidden RGB emits no star; threshold band0.12 and edge/tie policy explicit. | NOT_RUN |
| E07 Liquid Metal | Native quad/material local noise gradients and reflection palette; deterministic animation; local quality variants or bounded loop. | 1 material draw; quality sampling/octaves explicitly reported | Independent CPU gradients/normal sanity finite/unit; fixed seed/time repeat and quality delta measurable.<br>Visual reflective material only, not Navier–Stokes simulation; each quality mode compile boundary/cache identity verified. | NOT_RUN |
| E08 Cursor Trail | One real pointer/touch path → bounded CPU ring buffer/curve vertices → native Texture2D data upload or dynamic Mesh → native shader curve-distance alpha. | 1 curve draw; bounded data texture max capacity fixed | Recorded down/move/up/cancel/pointerId → local CSS/backing transform → uploaded positions → independently reconstruct curve distance/coverage.<br>Max history enforced, generation invalidates late up; touch+resize+pause+100destroy leaves no listeners/RAF/owneddata; identical logged stream repeated. | NOT_RUN |
| E09 Glass | Native source camera/layer → AirRenderTarget scene texture → native glass shader UV refraction, blur, RGB dispersion/highlight; capture excludes self. | capture +1 glass consumer; separable blur optionally+2 draws and explicit intermediate RTs | Checker/color grid: refraction vector/sign, edge-clamp, per-channel dispersion sample positions independently computed; zero parameters identity.<br>Real scene updates observed, target generations rebind on resize; no read-write feedback; actual camera/pass/draw count and RT binding audited.<br>Blur impulse kernel energy/symmetry, highlightradius controls, overlapalpha backdrops, offscreen/compositor agree. | NOT_RUN |

每例冻结viewport/DPR/seed/input/raw parameters/time or sequential simulation step、API/source/SDK/compiledshader/harness指纹；保存AFTER_DRAW回执+原生targetreadback+真实compositorPNG。CPUoracle必须独立实现公式/不读shader预期常量，也不能仅比较截图相似。SSIM等容差需Pilot数据+原因冻结，未得Pilot不填假阈值。

### Wave1可立即使用的路径（Gate通过后）

E01：受限effect-json工具生成本地vec4参数+sampler2D，固定小RGBA测试纹理→原生quad Material；progress端点、seed噪声oracle优先。E02：同工具生成local SDF/derivative/phase-palette body，无需新core API；验证解析距离/抗锯齿/颜色样本。E06：同工具以sampler2D和vec4(texelSize/radius/threshold/time) author bounded neighborhood sampling；亮点纹理/阈值+星芒对照先行。这三条均先await createAirApp，再EffectAsset.onLoaded/Material.initialize/setSharedMaterial，owned effect/mesh/material/texture明确addRef并在解绑后配对decRef。每个rendered-frame在present后读取director.root.device.numDrawCalls，结合capture camera receipt说明actualdraw/phase；不将Material.passes.length代替全pipeline pass。所有三条仍NOT_RUN，须Wave0 Gate通过才建effect。

## C01–C04组合

| 组合 | 原生方案 | 组合独立检查 | 当前 |
| --- | --- | --- | --- |
| C01 Holographic + Emboss + Sparkle | Local namespaced uniforms; reuse one input/height/noise where semantics align. First explicit sequential native RT path establishes correct algorithm; only fuse color/UV math after independent stage tests. | each stage toggled off matches isolated expected output<br>light/noise/threshold uniforms do not cross-contaminate<br>sparkle luminance computed in documented stage/color space<br>capture/RT/draw counts recorded; no repeated same-seed data generation | NOT_RUN |
| C02 ThinFilm + Neon | Shared declared SDF function or SDF texture; a single native shader is a design candidate, not a proven fusion win. | ThinFilm phase does not change Neon geometry/radius<br>shared distance sign/AA boundaries<br>edge color and analytic halo alpha separately checked<br>compare baseline2draws to candidate1draw only if baseline really needs2 | NOT_RUN |
| C03 Glass + CursorTrail | One pointer ring buffer and one sim clock; source camera includes/excludes trail according to frozen scene graph; consumer uses native source target. | trail not duplicated by capture/self feedback<br>pointer coordinate→dispersion/refraction independent oracle<br>resize generation/capture binding invalidation<br>cancel/dispose does not keep trail/target/event clock alive | NOT_RUN |
| C04 NoiseDissolve + arbitrary input | Same local dissolve fragment receives image Texture2D, procedural content Texture2D and native camera rendered layer AirRenderTarget.texture. | same noise/progress algorithm across3source types<br>RGBA and color transfer input distinctions explicitly validated<br>renderedlayer refresh/resize observed<br>progress0/1 identity/removal exact for all3 | NOT_RUN |

先得到孤立算法和显式阶段baseline再比较fusion候选。Material.passes不建立采样依赖；identityWhen要由实际camera/draw/target所有权观察证实跳过。至少两UV变换案例分别保存before/after draws/pass/CPUupdate+renderenvelope/texturecount/estimatedbytes/visualdiff；未获收益不能立公共优化API。SDF/Noise/Color/UV/Driver/Composition仍example-local提案，2–3真实消费者+回归后才评估core/tools/pattern归属。

## 测量合同（本轮未测）

| 指标 | 实际入口/区间 | 可声称 | 不可声称 |
| --- | --- | --- | --- |
| CPU update | BEFORE_UPDATE→AFTER_UPDATE；另包围effect.update | CPU回调与业务更新ms | GPU时间 |
| CPU encoding/submission | BEFORE_DRAW→AFTER_DRAW；另测setProperty/upload | 原生绘制遍历/编码/提交包络ms，含回调开销 | 纯driver submit/GPU execution |
| frame | 连续native AFTER_DRAW回调间隔 | 回调帧间隔p50/p95/p99/worst及原始样本 | GPU延迟/compositor呈现时间 |
| GPU timestamp | 当前Device/CommandBuffer无query创建/写入/读取路径；QueryType.TIMESTAMP仅枚举 | 无原生路径时unavailable | 用performance.now命名gpuTime |
| Draw | native present后device.numDrawCalls/numTris/numInstances | 当帧全camera计数+effect对照 | material.passes.length=全pipeline pass |
| Pass | 原生camera/target/consumer明细+RENDER_CAMERA_BEGIN/END+materialpass | 显式绘制/捕获/resolve/copypass分类 | 未测的自动fusion |
| texture/buffer/material | 自有实例台账+refCount/gfxdestroy观测 | 所有权对象/字节计数 | refs0即GPUmemory0 |
| memoryStatus | device.memoryStatus.textureSize/bufferSize | 引擎记账byte差 | 显存物理量 |
| VRAM estimate | 实际width×height×format bytes×mips/layers/samples+resolveddepth/buffers | 标注estimated，列driver未计项 | GPU_MEASURED |

WebGL2扩展`EXT_disjoint_timer_query_webgl2`是否设备可用由实际预检分别记录，不由源码未列扩展推断设备不支持。无原生公开计时路线则原生GPUtimestamp仍NOT_RUN/unavailable；不能用旁路rawGL绘制升级原生能力。可选独立诊断仅在同一个已有device context里对原生BEFORE_DRAW→AFTER_DRAW包围TIME_ELAPSED_EXT（不创建canvas、不增加draw、不替代引擎effect）；随后异步读可用query，拒disjoint/重叠query/非有限值，ns转换ms，独立记录工具开销和query所有权/删除。它是扩展诊断而非公开gfx计时API，Wave0未执行query。

工具可分别包围原生CommandBuffer记录区间/Queue.submit（保持原this/参数/调用和恢复精确wrapper），保存encoding/submission各自独立raw数组与frame/phase identity；若WebGL2 primary记录阶段直接执行GL、或无法可靠拆分，诚实保留一个CPU render包络、两拆分指标标unavailable，绝不能复制同一数组冒充两项。用户Performance目标已授权同上下文EXT timer测量诊断，后续Chromium应真实提交/轮询query，FF/WK无该扩展则unavailable；诊断标签TOOL_DIAGNOSTIC，不升级为公开gfx API能力。

性能窗口先暖机/冻结时长重复数/画质与负载/硬件和浏览器版本/工具开启关闭，测量用原生pacer，不同时stepClock+RAF。截图与PNG审计不并发影响采样窗口；保存所有raw，不事后去长帧美化。没有实体设备与接受预算，本机短测只能LIMITED，不能默认60fps达标。

720p规划为1280×720 CSS/DPR1；1080p为1920×1080 CSS/DPR1；mobile为390×844 CSS/browserDPR3、cap2、规划780×1688 backing。**每次读回真实backing/viewport/effectiveDPR**，设计不是测得事实；mobile仿真非真机GPU/物理触摸。更高DPR需显式cap和MAX_TEXTURE_SIZE/格式检查；full-window和container及live resize分别验证。Lead已完成本机原生空Scene预检：output/shaders-absorption/wave0-runtime-preflight.json，Chromium149.0.7827.55/Firefox155.0/WebKit26.6 ×720p/1080p/mobile390×844 browserDPR2九行全部PASS，mobile实际backing780×1688，SDKbefore/after不变。三浏览器原生单步AFTER_DRAW和close均有真实回执，仅现有SDKstartup/viewport能力，不是9效果EG/性能预算；此执行属于Lead通道而非本子Agent。Chromium实际getExtension支持GPUtimer，Firefox/WebKit当前不支持；九行均没有提交query，GPUtimestamp仍NOT_RUN。JSON记录Lead报告SHA与逐行摘要。规划browserDPR3/cap2与本次browserDPR2不同，DPRcap截断负例需后续另验。

## 100 create/destroy资源合同

100轮effect-instance生死在同一运行app内完成；不反复app.close再重启同document（当前runtime终态合同要求reload）。每轮真实创建/上传/绘制/resize/更新，退役token后：解绑own camera/target采样、off具名input/Director/resize监听、取消self任务、renderer mesh/material置空、移除销毁own节点、decRef每份owner资产、dispose目标、按原生延迟destroy推进帧再读。不得销毁borrowed builtin/runtime/sharedassetcache。

原始100行保留ownerID、before/after refs、assetvalid/GFXhandle、registry条目、targetgeneration、pendingjobs、listeneradd/remove及memoryStatus bytes；基线先暖cache。owned资源和监听delta归零、cleanup幂等、borrowed不变，steady阶段无未解释增长。只记录记账byte，不用isValid=false代替物理显存证据。帧驱动单所有者：run1nativepacer、pause/step0nativepacer+1stepowner；effect不得额外持续RAF。

## 已有工具/报告如何复用

| 面向 | 工具 | 说明 | 历史执行 |
| --- | --- | --- | --- |
| authoring | [tools/build/effect-json.mjs](../../tools/build/effect-json.mjs) | [docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md) | 不继承PASS |
| layout-preflight | [tools/debug/effect-layout.ts](../../tools/debug/effect-layout.ts) | [docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md) | 不继承PASS |
| multi-pass | [tools/verify/interactive-multipass-browser.cjs](../../tools/verify/interactive-multipass-browser.cjs) | [docs/manual/interactive-multipass.md](../../docs/manual/interactive-multipass.md) | 不继承PASS |
| geometry | [tools/verify/interactive-geometry-browser.cjs](../../tools/verify/interactive-geometry-browser.cjs) | [docs/manual/interactive-geometry.md](../../docs/manual/interactive-geometry.md) | 不继承PASS |
| input | [tools/verify/interactive-input-browser.cjs](../../tools/verify/interactive-input-browser.cjs) | [docs/manual/interactive-input.md](../../docs/manual/interactive-input.md) | 不继承PASS |
| resize | [tools/verify/interactive-container-browser.cjs](../../tools/verify/interactive-container-browser.cjs) | [docs/manual/interactive-container.md](../../docs/manual/interactive-container.md) | 不继承PASS |
| color | [tools/verify/interactive-color-compare-browser.cjs](../../tools/verify/interactive-color-compare-browser.cjs) | [docs/manual/interactive-color-controls.md](../../docs/manual/interactive-color-controls.md) | 不继承PASS |
| perf | [tools/verify/interactive-performance.cjs](../../tools/verify/interactive-performance.cjs) | [docs/manual/interactive-performance.md](../../docs/manual/interactive-performance.md) | 不继承PASS |
| native-target consumer | [tools/verify/interactive-water-browser.cjs](../../tools/verify/interactive-water-browser.cjs) | [docs/manual/interactive-consumer-kit.md](../../docs/manual/interactive-consumer-kit.md) | 不继承PASS |

旧interactive记录仅方法/限制参考；本轮没有解析旧PASS提升新effect。特别是历史WebKit活resize/compositor差异只当复查case，不预判ENGINE_BUG或通用浏览器失败；需当前SDK+控制arm+错误/像素证据再分类。只有Device等源码确认的接口缺口标API_GAP；环境/启动工具故障进INFRA_FAILURE且不影响Engine/Agent成功率分母。

## 有依据的缺口与边界

- **CB01 DOC_GAP / CONFIRMED_SOURCE_CONTRADICTION**：Custom shader guide states recompileShaders/overridePipelineStates are warn stubs without qualifying base Material; native MaterialInstance overrides implement both.
  依据：[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)、[src/cocos/asset/assets/material.ts](../../src/cocos/asset/assets/material.ts)、[src/cocos/render-scene/core/material-instance.ts](../../src/cocos/render-scene/core/material-instance.ts)。后续：Document base vs renderer.getMaterialInstance behavior, then verify actual variant/PSO rendering in an effect pilot. No engine patch proposed atWave0.
- **CB02 API_GAP / CONFIRMED_MEASUREMENT_SURFACE_GAP**：Native JS measurement surface has no usable GPU timestamp query API or universal renderpass/liveGPUobject counter; QueryType.TIMESTAMP is only enum.
  依据：[src/cocos/gfx/base/device.ts](../../src/cocos/gfx/base/device.ts)、[src/cocos/gfx/base/command-buffer.ts](../../src/cocos/gfx/base/command-buffer.ts)、[src/cocos/gfx/base/define.ts](../../src/cocos/gfx/base/define.ts)、[src/cocos/gfx/webgl2/webgl2-swapchain.ts](../../src/cocos/gfx/webgl2/webgl2-swapchain.ts)。后续：GPUtimestamp unavailable until actual extension support and native path authorized; explicit pass/allocation ledger for pilot. Publictiming API proposal requires measured consumers.
- **CB03 API_DX / CONFIRMED_TOOL_LIMITATION_NOT_ENGINE_BUG**：effect-json constrained authoring supports vec4/mat4/sampler2D only and strips general declarations/macros; large trail uniformarrays, conditionalresources or compute not representable.
  依据：[tools/build/effect-json.mjs](../../tools/build/effect-json.mjs)、[tools/debug/effect-layout.ts](../../tools/debug/effect-layout.ts)、[docs/manual/custom-shaders.md](../../docs/manual/custom-shaders.md)。后续：Pack scalar params in vec4; local native texture/mesh for boundedtrail. Hand-authored nativecompiled JSON allowed; do not upgradegenerator/core before2–3effects reveal repeatedneed.
- **CB04 API_DX / CONFIRMED_SEMANTIC_BOUNDARY**：Current built-in sRGB helpers approximate with square/sqrt; metadata linear conversion and hardware sRGB may differ from exacttransfer used by effectoracle.
  依据：[src/cocos/rendering/pipeline-funcs.ts](../../src/cocos/rendering/pipeline-funcs.ts)、[src/cocos/asset/assets/material.ts](../../src/cocos/asset/assets/material.ts)、[src/air/rendering/color-contract.ts](../../src/air/rendering/color-contract.ts)。后续：Explicittransfer contract and independentpatches; customexactmath ifneeded, no claim these approximations are newly confirmedenginebug.

尚无ENGINE_BUG/PERFORMANCE_GAP新确证；effect实现过程中才定位EXAMPLE_GAP/AGENT_FAILURE/REFERENCE_ERROR等，并保留失败attempt与原始错误，不能把这次源码映射写成runtime反例。

## Engine / Agent隔离与Wave状态

Engine pilot可持有冻结参考源码/算法oracle；Agent Benchmark单独fresh context，仅公开API/docs/examples/types/publictools，禁止隐藏答案、privatefixtures、expectedsource，运行成功率/compileattempt/runtimeattempt/APIerrors/doclookup/intervention/time/token独立报告。Wave0不等于Agentbenchmark已跑。C未改公共API/工具，因此并行Wave0资料不能偷偷作为Agent私有答案输入。

Wave0 C：身份静态核查PASS、嵌入src闭包PASS、能力路线已DOCUMENTED；source/SDKdeclared能力不得写engine_verified。Wave0 A来源+B契约+Lead统一WaveGate均由Lead收口；Wave1–7没有开始。

## 本批验证与固定13项交付

1. **Goal**：为9效果/4组合冻结当前原生API与验证路线，不实现效果。
2. **Upstream references**：固定任务commit；9精确主文件/SHA/许可/helper/语义已绑定A索引，不猜参考路径。
3. **CocosAirJS APIs used**：上述14能力区及JSON中SDK AST抽取签名；是静态核查而非执行调用。
4. **Implementation**：仅本MD/JSON、身份/审阅脚本输出；0运行时更改。
5. **Tests**：本批SDK ESM末尾export检查、DTS AST抽取、dev/min sourceMap905+905逐源比对；文档链接及JSON结构检查；buildEffectJson在内存中1合法模板生成+4非法（scalar/array/preprocessor/unknown字段）实际拒绝，exit0。只证authoring工具合同，不是GPUcompile。未跑Jest/build/browser。
6. **Screenshots / visual evidence**：NOT_RUN，无新截图，不继承旧截图结论。
7. **Performance evidence**：NOT_RUN；已冻结区间/量纲/720p1080pmobile设计；GPU timestamp接口与扩展支持分开。
8. **Resource/lifecycle evidence**：NOT_RUN；定义100循环、每资产/监听/唯一clock/borrowed边界。
9. **API/DX gaps found**：CB01–04，各有真实源码/声明或文档依据，无新ENGINE_BUG。
10. **Workarounds used**：本轮无runtime绕过；拟vec4参数打包/原生dataTexture或dynamicMesh/独立原生CameraTarget，只是待实测方案。
11. **Proposed engine changes**：本轮无；后续2–3effects重复消费者+实测前不扩core。CB01建议后续修文档。
12. **Validation status**：静态能力文档完成；所有六类EffectEG/AgentGate/Wave1–7 NOT_RUN。实际命令/exit另见JSON validationCommands。
13. **Known limitations**：dts构建产地未证、sourceMap不是cleanbuild、无真实GPU编译/算法测试/100cycle/performancebudget/真机、参考file已绑定A索引但本C未独立重下载、当前SDK多pass不自动形成passgraph。
