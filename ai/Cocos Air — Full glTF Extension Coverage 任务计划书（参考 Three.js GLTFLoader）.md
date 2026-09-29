# Cocos Air — Full glTF Extension Coverage 任务计划书

> 编制日期：2026-09-12  
> 状态：规划完成，待实施  
> 2026-09-13 顺序修订：本版先交付，Developer Ecosystem 后执行包消费与开发工具收口。当前工作区已有实施改动，实际 Gate 状态以执行证据为准，本次修订不宣告完成。
> 目标：在现有运行时 glTF/GLB 直读能力上，实现 21 项目标扩展的可验证支持。  
> 参考：[Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[Three.js GLTFLoader 源码](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/GLTFLoader.js)、[Khronos glTF 扩展注册表](https://github.com/KhronosGroup/glTF/tree/main/extensions)。

## 0. 结论与实施原则

当前运行时完整支持 `KHR_materials_unlit`、`KHR_texture_transform`；`KHR_lights_punctual` 仅保留元数据，其他目标扩展尚未接入。glTF Extension Coverage 不通过扩大白名单冒充支持，而是完成扩展解析、依赖解码、Cocos 对象构造、渲染语义、错误回退、资源释放及官方模型验证。

Three.js 的以下模式纳入本项目：

1. `register()` / `unregister()` 式扩展处理器注册，各扩展实现独立模块。
2. Draco、KTX2/BasisU、Meshopt 解码器通过 Loader 注入并延迟初始化，未使用时不加载。
3. Parser 提供 `getDependency(type, index)`，缓存 buffer、bufferView、accessor、texture、material、mesh、node 等异步依赖。
4. 统计共享资源引用；Node、Light、实例对象按场景实例化，Mesh、Material、Texture 等静态资产按生命周期共享。
5. `loadAsync()` 与 `parseAsync()` 保持分离，URL 基准路径、请求失败和解析失败使用同一错误出口。

不引入 Three.js 运行时依赖，不返回 Three.js 对象，不照搬其材质系统、坐标对象、动画播放器或渲染循环。最终产物仍是原生 `Node`、`Mesh`、`Material`、`Texture2D`、`Skeleton`、`AnimationClip` 和灯光组件。

本计划默认采用独立分支或 worktree 执行各 Agent 任务，由集成负责人按 Gate 顺序合并。当前工作区存在未提交的 glTF、构建、示例和文档修改；任何 Agent 开工前必须执行 `git status --short`、重读目标文件及 diff，不得 reset、清理或覆盖现有内容。

## 1. 目标支持合同

### 1.1 支持状态定义

| 状态 | 含义 |
|---|---|
| `supported` | 扩展语义已解析并在支持设备上正确构造/渲染；必需扩展可加载 |
| `decoder-required` | Loader 已实现扩展，但必须提供对应解码器；缺失时给出明确错误 |
| `device-dependent` | Loader 已实现扩展，但当前设备缺少纹理格式、导数、浮点 framebuffer 等能力 |
| `fallback` | 扩展为可选项且文件包含规范允许的核心 fallback；明确告警后使用 fallback |
| `unsupported` | 未实现，必需扩展必须失败 |

glTF Extension Coverage 完成时，目标 21 项不得处于 `unsupported`。Draco、Meshopt、BasisU 在未配置解码器的 Loader 实例上显示 `decoder-required`；AVIF/WebP 和部分高级材质在能力不足设备上可显示 `device-dependent`。这两种状态仍要求实现完整的配置路径、校验和确定性错误。

### 1.2 目标扩展

| 领域 | 扩展 | glTF Extension Coverage 交付行为 |
|---|---|---|
| 几何压缩 | `KHR_draco_mesh_compression` | Draco primitive 解码、属性映射、索引、Morph/skin 属性一致性校验 |
| 几何压缩 | `KHR_meshopt_compression` | KHR bufferView 解码，ATTRIBUTES/TRIANGLES/INDICES 与 filter 支持 |
| 几何压缩 | `EXT_meshopt_compression` | 与 KHR 版本共享解码核心，按各自 schema 和 fallback 规则处理 |
| 几何表示 | `KHR_mesh_quantization` | 按 semantic 支持扩展 componentType，CPU 解量化到现有 Float32 Mesh 通路 |
| 节点 | `KHR_lights_punctual` | directional/point/spot 实例化，颜色、强度、范围、锥角映射 |
| 节点 | `EXT_mesh_gpu_instancing` | 解析实例 TRS accessor；正确性路径共享 Mesh/Material 并展开 Node，兼容路径通过后再提供原生 instanced draw 快路径 |
| 纹理 | `KHR_texture_basisu` | KTX2 解析、Basis 转码、GPU 格式选择、mip/alpha/颜色空间处理 |
| 纹理 | `EXT_texture_webp` | WebP source 选择、能力检测与核心 source fallback |
| 纹理 | `EXT_texture_avif` | AVIF source 选择、能力检测与核心 source fallback |
| 纹理坐标 | `KHR_texture_transform` | 保留当前实现，并扩展到所有新增 material textureInfo |
| 基础材质 | `KHR_materials_unlit` | 保留当前实现，回归与新增扩展组合 |
| 基础材质 | `KHR_materials_emissive_strength` | 线性 emissive 乘数及 HDR 范围 |
| 基础材质 | `KHR_materials_ior` | dielectric F0 与 Fresnel 使用扩展 IOR |
| 基础材质 | `KHR_materials_specular` | factor、color factor、两类纹理及通道规则 |
| 表面材质 | `KHR_materials_clearcoat` | 第二层 GGX、roughness、独立 normal 与 texture transform |
| 表面材质 | `KHR_materials_anisotropy` | strength、rotation、方向贴图与 tangent frame |
| 表面材质 | `KHR_materials_iridescence` | factor、IOR、thickness 范围/纹理和薄膜 Fresnel |
| 表面材质 | `EXT_materials_bump` | 高度图、factor、纹理变换和导数法线扰动 |
| 透射 | `KHR_materials_transmission` | opaque scene color、透射 factor/texture、roughness 模糊与排序 |
| 体积 | `KHR_materials_volume` | thickness、attenuation、折射路径与 Beer-Lambert 衰减 |
| 色散 | `KHR_materials_dispersion` | 基于 volume/IOR 的 RGB 分通道折射近似 |

## 2. 当前证据、结论与实现路径

| Evidence | Finding | Path |
|---|---|---|
| `src/air/assets/gltf/context.ts` 的支持集合仅含 unlit、texture transform | 当前不能通过增加名字解决其余扩展 | T1 建立注册表，支持集合由已注册处理器生成 |
| `GLTFLoader.parseAsync()` 顺序执行 buffer、accessor、texture、skin、mesh、animation | 扩展缺少按依赖类型介入的稳定位置 | T1 增加 Parser dependency cache 与 hook 调度 |
| `material.ts` 集中改写 standard shader 字符串 | 新增十余材质纹理和 BRDF 会导致布局冲突及 permutation 失控 | T5 建立版本化 `air-gltf-physical` effect 与结构化 MaterialFeatures |
| `mesh.ts` 要求 POSITION/NORMAL/TANGENT 为 float | `KHR_mesh_quantization` 当前不能工作 | T2 按 semantic 校验后统一解量化到 Float32 |
| `mesh-codec.ts` 存在 MeshoptDecoder，但 Web 构建裁掉外部 decoder | 底层代码存在不等于 glTF 扩展可用 | T2 建立 Air decoder adapter，并由构建复制独立 decoder 资产 |
| 图片加载只识别 PNG/JPEG，texture 只读核心 `source` | BasisU、WebP、AVIF 扩展未接入 | T3 统一 TextureSourceResolver 与能力回退 |
| `nodes.ts` 对 punctual light 只告警 | Cocos 有对应灯光组件，但缺少 glTF 单位和参数映射 | T4 实例化并验证三类灯光 |
| 当前模型目录已能加载固定 Khronos 模型并与官方 Viewer 对照 | 具备扩展矩阵的统一验收入口 | T0 固定 fixtures，T8 输出机器可读支持矩阵 |
| Three.js 为每个扩展注册插件并注入 decoder | 单 Loader 可组合扩展而不污染核心 parser | T1/T2/T3 借鉴接口职责，不复制 Three 对象层 |
| Three.js `getDependency(type,index)` 缓存 Promise | 共享依赖只解析一次，错误和并发可集中处理 | T1 在 Cocos parser context 中实现等价缓存与 cleanup stack |

### 调用路径

```text
loadAsync / assetManager.loadRemote
  → container parse + extension declaration validation
  → GLTFParserContext
      → extension registry
      → getDependency(type, index) Promise cache
      → bufferView decoder hooks (Meshopt)
      → primitive decoder hooks (Draco)
      → texture source hooks (BasisU/WebP/AVIF)
      → material feature hooks
      → node hooks (Lights/Instancing)
  → native Cocos shared assets
  → GLTFAsset.instantiate(scene)
  → independent Node / animation / morph state
  → dispose instance / dispose parser decoders / release shared GPU assets
```

## 3. 冻结的公共接口

现有调用保持兼容：

```ts
const asset = await new GLTFLoader().loadAsync(url);
const instance = asset.instantiate();
```

新增接口：

```ts
export type GLTFExtensionStatus =
    | 'supported'
    | 'decoder-required'
    | 'device-dependent'
    | 'fallback'
    | 'unsupported';

export interface GLTFLoaderOptions {
    signal?: AbortSignal;
    dracoDecoder?: GLTFDracoDecoder;
    meshoptDecoder?: GLTFMeshoptDecoder;
    ktx2Transcoder?: GLTFKTX2Transcoder;
    onProgress?: (progress: GLTFLoadProgress) => void;
}

export interface GLTFLoadProgress {
    phase: 'container' | 'dependencies' | 'decode' | 'textures' | 'objects';
    loaded: number;
    total: number;
    url?: string;
}

export interface GLTFExtensionSupport {
    name: string;
    status: GLTFExtensionStatus;
    reason?: string;
}

export interface GLTFExtensionHandler {
    readonly name: string;
    validate?(context: GLTFParserContext): void;
    loadBufferView?(index: number, context: GLTFParserContext): Promise<Uint8Array | null>;
    loadPrimitive?(primitiveIndex: number, meshIndex: number, context: GLTFParserContext): Promise<DecodedPrimitive | null>;
    resolveTextureSource?(textureIndex: number, context: GLTFParserContext): Promise<DecodedTextureSource | null>;
    extendMaterial?(materialIndex: number, features: GLTFMaterialFeatures, context: GLTFParserContext): Promise<void> | void;
    createNode?(nodeIndex: number, node: Node, context: GLTFParserContext): Promise<void> | void;
    instantiate?(nodeIndex: number, node: Node, context: GLTFInstantiationContext): Promise<void> | void;
    dispose?(): void;
}

export type GLTFExtensionFactory = (context: GLTFParserContext) => GLTFExtensionHandler;

export class GLTFLoader {
    constructor(options?: GLTFLoaderOptions);
    setDRACODecoder(decoder: GLTFDracoDecoder | null): this;
    setMeshoptDecoder(decoder: GLTFMeshoptDecoder | null): this;
    setKTX2Transcoder(transcoder: GLTFKTX2Transcoder | null): this;
    register(factory: GLTFExtensionFactory): this;
    unregister(factory: GLTFExtensionFactory): this;
    getExtensionSupport(): readonly GLTFExtensionSupport[];
}

export function configureGLTFLoaderDefaults(options: GLTFLoaderOptions): void;
```

接口规则：

- `GLTFLoader` 实例配置优先于全局默认值。
- `assetManager.loadRemote(url, { gltf: options })` 将 options 传给工厂；没有局部 options 时使用 `configureGLTFLoaderDefaults()`。
- `loadAssetAsync(url, GLTFAsset)` 使用全局默认值，避免破坏既有 overload。
- 解码器不在主 bundle 内自动执行；构建产物单独发布 decoder 文件，应用显式配置 URL 或 provider。
- `AbortSignal` 取消网络、worker 和尚未完成的解码；已创建的临时资源走 cleanup stack。
- `getExtensionSupport()` 反映当前 Loader 配置及当前设备能力，模型目录直接使用该结果。
- 所有扩展错误使用稳定错误码：`GLTF_EXTENSION_UNSUPPORTED`、`GLTF_DECODER_MISSING`、`GLTF_DEVICE_UNSUPPORTED`、`GLTF_EXTENSION_INVALID`、`GLTF_DECODE_FAILED`。
- 能力与错误合同必须机器可读：`getExtensionSupport()` 返回由 registry、当前配置与设备能力生成的结构化状态，不仅写入 README；错误对象暴露稳定 `code` 与上下文，消息文本不是调用方的判断依据。后续 Developer Ecosystem 直接消费，不重复维护扩展名清单。

## 4. 内部架构与目录

```text
src/air/assets/gltf/
├── loader.ts                    # 公共 Loader 与 assetManager 接入
├── parser-context.ts            # dependency cache、hooks、取消、cleanup
├── extension-registry.ts        # 注册、依赖、支持状态、required 校验
├── schema.ts                    # core 与 extension wire types
├── asset.ts                     # 共享资产和实例生命周期
├── decoder/
│   ├── types.ts
│   ├── draco.ts
│   ├── meshopt.ts
│   └── ktx2.ts
├── extensions/
│   ├── geometry/                # draco、meshopt、quantization
│   ├── texture/                 # basisu、webp、avif、transform
│   ├── scene/                   # punctual lights、GPU instancing
│   └── material/                # 各 KHR/EXT material handler
├── material/
│   ├── features.ts              # 规范化的物理材质中间结构
│   ├── physical-effect.ts       # air-gltf-physical effect
│   └── texture-slots.ts         # sampler/channel/UV transform 表
└── diagnostics.ts               # extension report 与稳定错误

build/gltf-decoders/
├── draco/
├── meshopt/
└── basis/
```

核心约束：

- 每个扩展一个 handler；共享算法放 decoder、material 或 texture slot 层。
- `context.ts` 的现有 accessor/buffer 代码迁入 `parser-context.ts`，行为先由回归锁定再搬迁。
- Parser 缓存 Promise，而非仅缓存完成值；同一依赖并发请求只执行一次。
- 失败 Promise 从 cache 移除，允许修复网络或 decoder 后重试。
- Parser cleanup stack 与 `GLTFAsset` 所有权分开：临时 buffer/worker/blob URL 属于 parser，成功转交的 Cocos Asset 属于 `GLTFAsset`。
- 新增 `air-gltf-physical`，不修改现有 `builtin-standard` 的语义；仅实际阻塞时最小修改 `src/cocos/` 并更新 upstream map。
- 新材质纹理全部通过结构化 texture-slot 表声明：属性名、颜色空间、采样通道、默认值、texCoord、texture transform 和 shader macro。

## 5. Decoder 与资源发布决策

### Draco

- 使用官方 `draco3d` decoder 发行物，固定版本和 SHA-256，保留 Apache-2.0 许可。
- provider 封装 Worker 池；默认 worker 数为 `min(4, max(1, hardwareConcurrency - 1))`。
- 第一次遇到 Draco primitive 时初始化；`dispose()` 终止 worker 并释放 decoder module。
- primitive handler 按扩展 attribute ID 建立 POSITION/NORMAL/TANGENT/UV/COLOR/JOINTS/WEIGHTS/Morph 映射。
- 输出进入统一 `DecodedPrimitive`，之后复用普通 Mesh 校验与构造。

### Meshopt

- 运行时使用官方 `meshoptimizer` decoder API；Cocos 现有 `MeshoptDecoder` 通过 adapter 复用，不从 glTF handler直接访问引擎私有字段。
- KHR/EXT 两个 handler 共享 `decodeGltfBufferAsync`，各自校验 buffer、offset、length、count、stride、mode、filter 和 fallback。
- `bufferView` 解压结果缓存；不同 accessor 引用同一 view 时不重复解码。
- 不修改 `CULL_MESHOPT` 让整个旧引擎路径进入 bundle；decoder 作为 Air 独立资产发布。

### KTX2/BasisU

- 固定 Basis Universal transcoder 的 `basis_transcoder.js` 与 WASM revision、hash 和许可。
- 按设备依次选择 ASTC、BC、ETC2、ETC1、PVRTC；无压缩格式时转 RGBA8。
- sRGB 与线性纹理分别选择格式；保留 mip levels、alpha、尺寸和 sampler。
- 同一 KTX2 source 即使被多个 material 引用也只转码一次。

### WebP/AVIF

- 使用浏览器 `createImageBitmap`/`HTMLImageElement` 解码，不引入软件 decoder。
- 先做小型 data URI capability probe，并缓存结果。
- 扩展可选且核心 `source` 存在时能力不足走 fallback；扩展必需或无核心 source 时返回 `GLTF_DEVICE_UNSUPPORTED`。

## 6. 分阶段任务

### T0 — 冻结基线、fixtures 与 ADR（1–2 Agent 日）

负责人：Integration Agent，独占共享文件。

工作：

1. 保存当前 `git status --short` 和目标文件 diff；确认现有 `KHR_texture_transform` 修改已合并或作为基线保留。
2. 运行全量测试、typecheck、ESM/min/dts 构建、web-only 检查、WebGL1/2 官方七模型回归。
3. 固定 Khronos Sample Assets / Asset Generator revision；为 21 项各选择正向模型和至少一个错误/fallback fixture。
4. 写 ADR：扩展插件、decoder 注入、单独 decoder 资产、CPU 解量化、GPU instancing 正确性 fallback、physical effect、transmission pass。
5. 记录主 bundle 和 decoder 资产基线大小，以及 BoxTextured 重复加载/释放基线。

退出条件：基线报告可复现；已有失败与新增失败能区分；所有 fixture 有来源、许可、hash。

### T1 — Extension registry 与 dependency cache（4–6 Agent 日）

负责人：Integration Agent。此 Gate 完成前其他 Agent只准备研究和 fixture，不改 Loader 共享文件。

工作：

1. 实现 `GLTFParserContext`、typed dependency keys 和 Promise cache。
2. 实现 register/unregister、handler 排序、重复名称拒绝、扩展依赖检查。
3. 将 required/optional 处理从字符串集合迁到 registry。
4. 增加 AbortSignal、progress、cleanup stack、失败 cache eviction。
5. 保持现有 `loadAsync()`、`parseAsync()`、assetManager、loadAssetAsync 行为。
6. 注册现有 unlit 与 texture transform handler，验证迁移前后像素一致。
7. 将 §3 能力状态和错误码作为可消费合同验证：覆盖 decoder 未配置、设备不足、unsupported/invalid、decode failure；用公开入口断言结构化 code，不靠匹配消息文本。能力返回与实际注册/配置状态一致，文档/目录消费同一来源。

退出条件：Gate G1；未实现的 required extension 仍失败；两个已支持扩展通过；同一 dependency 只执行一次；取消与失败不残留缓存或 Blob URL。

### T2 — 几何与压缩扩展（10–14 Agent 日）

负责人：Geometry Agent，所有实现只进入 `decoder/` 与 `extensions/geometry/`；共享文件由 Integration Agent 合并。

工作顺序：

1. `KHR_mesh_quantization`：semantic/componentType 表驱动校验，CPU 转 Float32，bounds/normalized/negative scale 回归。
2. KHR/EXT Meshopt：bufferView hook、三种 mode、filters、fallback、decoder 缺失/损坏/取消。
3. Draco：primitive hook、attributes/indices、共享 decoder worker、无 fallback required 模型。
4. 压缩后的 skin、morph、多 primitive、多材质和 32-bit index 组合验证。

退出条件：Gate G2-geometry；官方压缩 variant 与未压缩 variant 在 topology、bounds、attribute 数量和参考截图上等价；损坏 bitstream 不崩溃、不超范围分配。

### T3 — 纹理编码扩展（8–12 Agent 日）

负责人：Texture Agent，独占 `decoder/ktx2.ts` 与 `extensions/texture/`。

工作顺序：

1. 建立 TextureSourceResolver，明确 core source 与 extension source 优先级。
2. 实现 WebP、AVIF capability probe、fallback、MIME/魔数校验。
3. 实现 KTX2 container、Basis transcoder、GPU format selection、RGBA8 fallback。
4. 保留 sampler、mip、alpha、sRGB/linear、NPOT/WebGL1 行为。
5. 将 texture transform 扩展到后续所有 material extension textureInfo。

退出条件：Gate G2-texture；官方 TextureEncodingTest、KTX/BasisU variant 通过；WebP/AVIF 有/无能力两条路径可测；同图不同颜色空间不错误共享 GPU texture。

### T4 — 灯光与 GPU instancing（5–7 Agent 日）

负责人：Scene Agent，独占 `extensions/scene/`。

`KHR_lights_punctual`：

- directional → `DirectionalLight`，intensity 映射 illuminance。
- point → `PointLight`，intensity 映射 luminous intensity，保留 range。
- spot → `SpotLight`，保留 range、innerConeAngle、outerConeAngle。
- color 保持线性；节点 TRS 决定位置和方向；同一 light 被多个 node 引用时分别实例化组件。
- 无 range 表示无限规范范围，不替换为任意短距离。

`EXT_mesh_gpu_instancing`：

- 校验 TRANSLATION/ROTATION/SCALE accessor 类型、count 一致、四元数归一化。
- 正确性路径生成共享 Mesh/Material 的实例节点；不复制 GPU 资产。
- 第二阶段接 Cocos instanced attributes；设备/材质不支持快路径时保留语义等价展开路径。
- 实例 bounds、负缩放绕序、销毁和层级继承纳入测试。

退出条件：Gate G2-scene；官方灯光模型三类灯光可视；SimpleInstancing 数量、TRS 和画面正确；共享资产释放无破坏。

### T5 — Physical material 基础扩展（16–22 Agent 日）

负责人：Material Agent，独占 `extensions/material/` 和 `material/physical-effect.ts`。其他 Agent不得直接编辑 effect、UBO 或 texture-slot 表。

先建立 `GLTFMaterialFeatures` 和 `air-gltf-physical`，然后按顺序实现：

1. `KHR_materials_emissive_strength`
2. `KHR_materials_ior`
3. `KHR_materials_specular`
4. `KHR_materials_clearcoat`
5. `KHR_materials_anisotropy`
6. `KHR_materials_iridescence`
7. `EXT_materials_bump`

固定实现规则：

- UBO 使用稳定 superset 布局；材质差异由宏控制，不因扩展组合改变已有字段 offset。
- sampler/texture descriptor 使用宏裁剪，初始化前检查设备 texture-unit 上限。
- IOR 参与 dielectric F0；specular 在此基础上调制 F0/F90。
- clearcoat 是独立 GGX 层，有独立 roughness、normal 和 Fresnel。
- anisotropy 使用切线空间方向和 rotation；缺切线时按有效 UV 生成。
- iridescence 使用薄膜 Fresnel，厚度纹理按规范通道和范围采样。
- bump 与 normal map 可组合；通过屏幕导数扰动几何法线，WebGL1 要求并检测 derivatives 扩展。
- 所有 factor 在合法范围内校验；贴图按规范通道读取。
- 每个新增 textureInfo 独立支持 UV0/UV1、sampler 和 `KHR_texture_transform`。
- unlit 与不兼容 physical extensions 按规范拒绝或忽略，不编译无意义组合。

退出条件：Gate G3；各官方 material test 的关键格子/渐变与 Khronos Viewer 对照；所有 shader permutation 无编译或链接错误；现有 standard/unlit 模型无回归。

### T6 — Transmission、Volume、Dispersion 渲染管线（20–30 Agent 日）

负责人：Pipeline Agent。开始前必须完成 G3；独占 transmission pass、scene-color 资源和相关 shader。

实施顺序：

1. 增加 opaque scene-color render target，尺寸随 viewport/render scale 更新。
2. 生成 scene-color mip chain，供 rough transmission 使用。
3. 增加 transmission queue；明确 opaque、alpha、transmission 的排序和 depth-write 规则。
4. 实现 `KHR_materials_transmission` factor/texture、屏幕折射采样和 roughness LOD。
5. 接入 IOR 和法线，处理前后表面及 double-sided。
6. 实现 `KHR_materials_volume` thickness factor/texture、attenuation distance/color 和路径长度。
7. 实现 `KHR_materials_dispersion`，以 IOR 为绿色通道基准，对 RGB 使用分通道折射近似并合成。
8. viewport resize、MSAA、HDR/LDR、WebGL1/2、无浮点 framebuffer 能力分别处理。

能力不足时不退化成普通 alpha blend并声称支持；返回 `GLTF_DEVICE_UNSUPPORTED`，可选扩展仅在文件存在合法核心 fallback 时回退。

退出条件：Gate G4；官方 Transmission/Volume/Dispersion 测试通过；scene-color 生命周期无泄漏；相交透明物体的已知排序限制写入文档并有 fixture。

### T7 — Decoder 发布、构建与许可（4–6 Agent 日）

负责人：Build Agent；`package.json`、lockfile、build scripts 和第三方许可由其独占，其他 Agent只提交依赖需求清单。

工作：

- 固定 decoder 版本、来源、hash、license。
- 构建复制 `build/gltf-decoders/`，主 bundle 不内嵌 WASM。
- dev server、静态 server 和 npm files 包含 decoder MIME 与目录。
- min/system/dts 构建保持通过；source map 不嵌入 decoder 二进制。
- 主 bundle、decoder JS/WASM、首次解码和 worker 数分别报告大小与耗时。
- 发布机制（files/exports、暂存约定、复制入口、目录映射）作为可重复执行的正式工具交付；后续 Developer Ecosystem 能增量审计、扩展，不留一次性手工打包脚本，也不要求 Developer Ecosystem 重建发布机制。
- 三类 decoder 的运行依赖、版本、来源、SHA-256、license/notice 与离线配置命令随交付清单固定，移交给 Developer Ecosystem 后仍是包必含项；主 bundle 不因随包携带而提前初始化 decoder/worker。
- 若本阶段修改构建或 dev server，保留/交付统一示例枚举与递归发现入口、相对目录 ID、decoder JS/WASM/worker 服务及 MIME；后续导航只增量接入，不另建枚举器。
- 构建缓存诊断以本阶段最终脚本为准，保留或补齐 cold/hit/config mismatch/read failure 等机器可读原因。历史 Standalone Asset Pipeline 偶发失效不单独重构追因；新基线异常提供证据，不把猜测当根因。

退出条件：Gate G5-build；从 `npm pack` 解包后的目录可离线加载三种 decoder；第三方许可完整。

### T8 — 扩展矩阵、目录与最终验收（8–12 Agent 日）

负责人：Verification Agent；测试文件按领域拆分，避免多人编辑现有 smoke-07。

新增测试文件：

```text
test/smoke/gltf-extension-registry.test.ts
test/smoke/gltf-extension-geometry.test.ts
test/smoke/gltf-extension-texture.test.ts
test/smoke/gltf-extension-scene.test.ts
test/smoke/gltf-extension-material.test.ts
test/smoke/gltf-extension-transmission.test.ts
```

输出 `examples/gltf-catalog/capabilities.json`，模型目录对每个扩展显示支持状态、decoder/设备要求、验证模型和最后验证 revision。目录收录与“已验证支持”保持区分。

最终验收包含：

- 全量测试、typecheck、build、build:min、build:dts、声明消费、web-only。
- WebGL2 为完整主验收；WebGL1 在功能所需能力存在时验收，否则验证稳定设备错误。
- 每项扩展至少一个官方正向模型；每类 decoder 至少一个缺失、损坏、取消、fallback 用例。
- 每个材质扩展检查实际 framebuffer；不以对象字段或 shader 编译通过替代。
- 同一模型/variant 与 Khronos Viewer 并排截图；不要求像素完全一致，但关键结构、贴图方向、材质趋势必须一致。
- 50 次 load/instantiate/dispose 循环后，Asset cache、Blob URL、worker、Texture、Buffer 回到基线。
- 两实例同时存在时，动画、Morph、材质实例和 GPU instancing 状态隔离。

退出条件：Gate G5-release；21 项能力表无 `unsupported`，所有限制、配置和复现命令已归档。

## 7. 官方验证模型矩阵

以下名称优先取当前 `examples/gltf-catalog/catalog.json` 的固定 revision；没有目标 variant 时从 Khronos Asset Generator 固定版本补充最小 fixture。

| 扩展 | 主验证模型 |
|---|---|
| Draco | `BrainStem`、`MorphPrimitivesTest` 的 `glTF-Draco` 与普通 variant 成对比较 |
| Lights | `LightsPunctualLamp`、`PointLightIntensityTest`、`DirectionalLight` |
| Anisotropy | `AnisotropyDiscTest`、`AnisotropyRotationTest`、`AnisotropyStrengthTest` |
| Clearcoat | `ClearCoatTest`、`CompareClearcoat` |
| Dispersion | `DispersionTest`、`CompareDispersion` |
| Emissive strength | `EmissiveStrengthTest`、`CompareEmissiveStrength` |
| IOR | `CompareIor`、`IORTestGrid` |
| Specular | `SpecularTest`、`CompareSpecular` |
| Transmission | `TransmissionTest`、`TransmissionRoughnessTest`、`TransmissionOrderTest` |
| Iridescence | `IridescenceDielectricSpheres`、`IridescenceMetallicSpheres`、`CompareIridescence` |
| Unlit | 现有 diagnostics + 官方 unlit fixture |
| Volume | `CompareVolume` 与 Asset Generator thickness/attenuation cases |
| Quantization | `Duck` 的 `glTF-Quantized` 与 `glTF` variant；补 Asset Generator 边界类型用例 |
| Meshopt | `BrainStem` 的 `glTF-Meshopt`、`glTF-Meshopt-EXT` 与 `glTF` variant；`MeshoptCubeTest` 补最小回归 |
| BasisU | `FlightHelmet` 或 `AnisotropyBarnLamp` 的 `glTF-KTX-BasisU` 与普通 variant |
| Texture transform | `TextureTransformTest`、`TextureTransformMultiTest` |
| Bump | 按 EXT 规范生成确定性高度图 fixture，使用 Three.js GLTFLoader 与 Khronos Sample Renderer 公式作参考；文件和期望图纳入仓库 |
| GPU instancing | `SimpleInstancing` |
| AVIF/WebP | `TextureEncodingTest`；`CarConcept`/`ChronographWatch` 的 `glTF-WEBP` 补 WebP 实际模型；AVIF 补扩展 source/fallback 最小 fixture |

每个下载文件记录：repository、revision、相对路径、byteLength、SHA-256、license。测试运行只访问本地 fixtures；目录交互可按需访问固定 raw URL。

## 8. 多 Agent 编排与文件所有权

### Wave 0：串行基础

仅 Integration Agent 执行 T0、T1。其他 Agent可阅读规范、准备不入库的分析，不提交 Loader 代码。G1 通过后冻结 handler/context 接口。

### Wave 1：四路并行

| Agent | 任务 | 独占目录 |
|---|---|---|
| Geometry Agent | T2 | `decoder/draco.ts`、`decoder/meshopt.ts`、`extensions/geometry/` |
| Texture Agent | T3 | `decoder/ktx2.ts`、`extensions/texture/` |
| Scene Agent | T4 | `extensions/scene/` |
| Material Agent | T5 parser/features 前半 | `extensions/material/`、`material/` |

Integration Agent逐个合并并修改 `loader.ts`、`parser-context.ts`、`schema.ts`、公共 exports。各 Agent不得直接解决合并冲突或改其他人的独占目录。

### Wave 2：物理材质与构建

- Material Agent 完成 effect 和基础物理扩展。
- Build Agent 并行完成 decoder 发布，但不得修改 material/parser。
- Verification Agent 在各领域 Gate 后增加独立测试，不编辑实现文件。

### Wave 3：串行渲染管线

Pipeline Agent在 G3 后执行 T6。Transmission/Volume/Dispersion 使用同一分支和负责人，避免多个 Agent并发修改 render pass、descriptor 与 shader。

### Wave 4：发布收口

Integration Agent 合并 T7/T8，重新生成声明、build 产物、capabilities 和文档。未经完整 G5 不更新 README 为“全部支持”。

共享文件唯一负责人：

| 文件/区域 | 负责人 |
|---|---|
| `loader.ts`、`parser-context.ts`、`extension-registry.ts` | Integration Agent |
| `schema.ts`、`asset.ts`、公共 exports | Integration Agent |
| `package.json`、lockfile、build/dev scripts、licenses | Build Agent |
| `physical-effect.ts`、material UBO、texture slots | Material Agent |
| scene-color/transmission render pass | Pipeline Agent |
| `examples/gltf-catalog/` capabilities 展示 | Verification Agent |
| README、最终支持矩阵 | Integration Agent |

建议分支：

```text
codex/gltf-ext-foundation
codex/gltf-ext-geometry
codex/gltf-ext-texture
codex/gltf-ext-scene
codex/gltf-ext-material
codex/gltf-ext-transmission
codex/gltf-ext-build
codex/gltf-ext-verification
```

## 9. Gate 与合并规则

### G0 — 基线

- 当前工作区改动已识别并保留。
- 现有测试/构建状态已记录。
- fixtures、license、hash 冻结。

### G1 — 扩展内核

- Registry、dependency cache、取消、cleanup 通过。
- 现有 unlit/texture transform 无行为回归。
- 公共接口完成 d.ts 消费测试。

### G2 — 资产扩展

- Geometry、Texture、Scene 三条线各自通过领域测试。
- decoder 缺失与能力不足错误可定位。
- 不要求材料高级特性已完成。

### G3 — Physical material

- 七项基础/表面材质扩展通过官方画面对照。
- shader permutations 在 WebGL1/2 支持能力内无错误。
- `builtin-standard` 行为未变化。

### G4 — Transmission pipeline

- Transmission、Volume、Dispersion 正向和排序用例通过。
- resize、HDR/LDR、资源释放通过。

### G5 — Release

- 21 项能力矩阵达到目标状态。
- npm pack 离线复现通过。
- 全量验证与文档完成。

每次 Gate 合并顺序固定为：实现分支 rebase 到集成分支 → 领域测试 → Integration Agent 合并 → 全量 typecheck/test → build/browser Gate。不得通过删除 fixture、跳过必需扩展、降低像素阈值或把 warning 改名来通过。

## 10. 性能、包体与稳定性要求

- uncompressed BoxTextured 的 30 次中位加载时间相对 G0 不回退超过 15%。
- 未使用压缩扩展时不得初始化 decoder 或 worker。
- 同一 parser 中相同 bufferView/texture/mesh dependency 解码次数为 1。
- decoder JS/WASM 独立统计；主 bundle gzip 增量、decoder 总体积均写入报告，不隐藏在 source map。
- Draco/Meshopt 默认不阻塞主线程长任务；worker 不可用时允许单线程，但必须在 capability report 标记。
- KTX2 转码缓存以 source hash + color space + target format 为键，不能把 sRGB 和 linear 结果混用。
- shader permutation 只由实际 material features 生成；同一 feature key 复用 Effect/PSO。
- scene-color target 按实际 viewport 分配并复用；resize 后旧 target 释放。
- 单文件/单 accessor/单纹理继续执行已有分配上限，并为 decoder 输出增加顶点数、索引数、纹理尺寸和解压比上限。
- 所有 worker、Blob URL、临时 ArrayBuffer 与部分创建的 Cocos Asset 在失败/取消时释放。

## 11. 文档与交付物

实施完成后更新：

```text
docs/gltf/gltf-runtime.md
docs/gltf/gltf-extension-reference.md
docs/gltf/gltf-decoder-deployment.md
docs/gltf/gltf-validation.md
examples/gltf-catalog/capabilities.json
THIRD_PARTY_LICENSES.md
README.md
```

文档必须提供：

- 未压缩模型零配置示例。
- Draco/Meshopt/KTX2 decoder 配置示例。
- assetManager 和显式 Loader 两种入口。
- 扩展支持矩阵、设备限制、fallback 与稳定错误码。
- decoder 静态文件 MIME/CORS/缓存部署方式。
- Transmission 对 scene-color、排序和 HDR 的要求。
- dispose、取消和 worker 生命周期。
- 官方 fixture revision、许可、验证结果及 Khronos Viewer 对照链接。

## 12. 工期与完成定义

| 阶段 | 估算 |
|---|---:|
| T0 基线与 ADR | 1–2 Agent 日 |
| T1 扩展内核 | 4–6 Agent 日 |
| T2 几何/压缩 | 10–14 Agent 日 |
| T3 纹理编码 | 8–12 Agent 日 |
| T4 灯光/实例化 | 5–7 Agent 日 |
| T5 基础物理材质 | 16–22 Agent 日 |
| T6 透射/体积/色散 | 20–30 Agent 日 |
| T7 构建与许可 | 4–6 Agent 日 |
| T8 验证与收口 | 8–12 Agent 日 |
| 合计 | 76–111 Agent 日 |

四路并行且 Gate 无重大返工时，预计 5–8 周日历时间。Transmission/Volume/Dispersion 是关键路径；它们不能与基础材质未冻结时并行修改同一 shader/descriptor。

glTF Extension Coverage DONE 必须同时满足：

1. 21 项扩展均达到本计划目标状态，无 `unsupported`。
2. required、optional fallback、decoder missing、device missing 行为均可自动验证。
3. 官方正向模型、错误 fixtures、WebGL1/2 能力路径和生命周期测试通过。
4. 主 bundle 不依赖 Three.js，decoder 独立部署可复现。
5. 所有公共 API 有 d.ts 消费测试，旧 API 兼容。
6. 资源反复加载/销毁无缓存、worker、Blob URL 或 GPU 资源增长。
7. capabilities、部署说明、许可和最终验收报告齐全。
8. 向 Developer Ecosystem 移交最终 revision、§3 完整公共接口与类型消费证据、§4 所有权合同、三类 decoder 清单与 npm pack 离线证据、包/构建/dev 工具入口、终态示例和 capabilities、四份 glTF 文档与编号索引、§10 性能样本。文件所有权在交接完成后转移，Developer Ecosystem 不并发编辑本版尚未完成的共享文件。

G5 完成允许后续 Developer Ecosystem 做文档与发布准备，但不等同于已获 npm publish 授权。README 仍须保留 decoder-required、device-dependent、fallback 和已知限制；“21 项达到目标状态”不等于所有设备无条件支持。

## 13. Deviations 与风险控制

- 本计划借鉴 Three.js GLTFLoader 的职责划分，不复制 Three.js 场景、材质、动画和渲染对象。
- Three.js 允许外部注入 Draco/KTX2/Meshopt；Cocos Air 同样采用显式 provider，但增加 assetManager 全局默认配置和稳定能力报告。
- `EXT_mesh_gpu_instancing` 先以共享资产的 Node 展开保证语义，原生 instanced draw 作为同阶段快路径；前者通过即可认定格式语义支持，但性能报告必须注明所走路径。
- WebP/AVIF 依赖浏览器解码能力，不加入大体积软件 decoder；无 fallback 时稳定失败。
- 高级材质不继续堆叠当前字符串替换方案；若 physical effect 基础未完成，相关扩展不得单独加入支持集合。
- Transmission/Volume/Dispersion 不以 alpha blend 近似冒充规范支持。
- 当前 `KHR_texture_transform` 以及相关构建产物仍是未提交修改；实施 Agent 必须以实际工作区为准，不能从旧计划书重建并覆盖它。
