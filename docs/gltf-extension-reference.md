# glTF 扩展参考（V0.5）

> 逐扩展的实现映射：字段/通道语义、引擎对象、支持矩阵、错误码与已知限制。
> 机器可读支持状态以 `examples/gltf-catalog/capabilities.json` 为准（`npm run capabilities`
> 从运行时 registry 再生成）；本文补充"怎么实现的、通道怎么读"。
> 部署（decoder/MIME/缓存）见 [gltf-decoder-deployment.md](gltf-decoder-deployment.md)。

## 通用合同

- **注册表**：`GLTFLoader.register/unregister(factory)`；支持状态唯一来源为已注册 handler 的
  `support()`。未知扩展：required → `GLTF_EXTENSION_UNSUPPORTED` 拒绝整包；optional → 告警跳过。
- **稳定错误码**（消息文本不作分支依据，`GLTFError.code` 才是）：
  `GLTF_EXTENSION_UNSUPPORTED` / `GLTF_DECODER_MISSING` / `GLTF_DEVICE_UNSUPPORTED` /
  `GLTF_EXTENSION_INVALID` / `GLTF_DECODE_FAILED`。
- **handler 钩子**：`validate`（JSON 结构，先于任何解码）、`support`、`loadBufferView`
  （压缩 bufferView 重写）、`loadPrimitive`、`resolveTextureSource`（候选纹理字节，KTX2/webp/avif）、
  `extendMaterial`（写 `GLTFMaterialFeatures`）、`resolveData`（二进制快照，accessor 释放前）、
  `buildNode`（节点替换/展开）、`instantiate`（组件挂载，`renderTargets` 声明渲染归属）、`dispose`。
- **纹理槽通用**：所有新增 textureInfo 支持 `texCoord` 0/1 与 `KHR_texture_transform`
  （offset/scale/rotation）；缺省通道按规范。
- **unlit**：与全部 KHR 材质扩展互斥（忽略并告警），不编译无意义组合。
- 材质扩展共同走版本化 effect `air-gltf-physical`（UBO 稳定 superset、宏裁剪 permutation、
  sampler binding 15–27）；identity 材质保持 `air-gltf-standard` 零差异。

## 几何压缩

### KHR_mesh_quantization
解码后按 componentType/normalized 反量化到 float32 语义；不改变 accessor 上限（16M 分量）。
类型矩阵严格按规范表：POSITION/TEXCOORD_n 允许 8/16 位有/无符号 int 的 **normalized 与 unnormalized**；
NORMAL/TANGENT 仅允许 **normalized BYTE/SHORT**（拒绝无符号与非归一化）。
证据：smoke-11 + smoke-21（矩阵逐条）。

### EXT_meshopt_compression / KHR_meshopt_compression（同一 handler 双名注册）
bufferView 级 `decoder.decodeGltfBuffer`（mode/filter/byteAlignment 全类型校验，非法 →
`GLTF_EXTENSION_INVALID`）；provider `createMeshoptDecoder(module)`；未注入时 optional 回退
未压缩源数据、required → `GLTF_DECODER_MISSING`。同一 bufferView 解码次数 1（依赖缓存）。
**主线程执行（无 worker 集成）**，见性能基线 §2。证据：smoke-11 + counting 断言。

### KHR_draco_mesh_compression
`loadPrimitive` 路径：decoder 由 provider 注入（Node 构建随包；浏览器构建由应用自备，MANIFEST
决策记录）；解压直写目标 TypedArray；索引 65536 上限沿用。
**可选性回退（规范符合性）**：扩展不在 `extensionsRequired` 且无 decoder 时，若 primitive 仍有核心
attributes 则告警并走普通 accessor 路径；required 或无核心 POSITION 时 `GLTF_DECODER_MISSING`。
**额外属性与 morph**：Draco payload 之外的 primitive.attributes（额外 UV/颜色/蒙皮）与
primitive.targets（morph accessor 属核心数据）按普通 accessor 读取合并。
已知限制：Draco 解码重排顶点后，morph accessor 顺序与解码输出顺序的对应关系不作保证（如实记录）。
证据：smoke-11（含 draco-combo 与 placeholder 布局）。

## 纹理编码

### EXT_texture_webp / EXT_texture_avif（同一工厂）
`resolveTextureSource` 候选序：扩展 source → 核心 source；容器魔数 + 声明 mimeType 双校验
（不符 `GLTF_EXTENSION_INVALID`）。设备能力经一次性 probe（1×1 data URI），
不支持时：required → `GLTF_DEVICE_UNSUPPORTED`；optional → 告警回退核心纹理。缓存诊断走
`setTextureSupportForTesting` 测试口。证据：smoke-13 + `gltf-webp-browser`（真浏览器解码）。

### KHR_texture_basisu（KTX2/BasisU）
`createKTX2Transcoder(factory)` 包装 three r168 vendored Basis：容器魔数/faces/layers/dims
校验（≤16384 边长），ETC1S 与 UASTC 分档目标格式 rank（ETC1S: ETC2>ASTC>BC7；
UASTC: ASTC>BC7>ETC2；设备 `getFormatFeatures(SAMPLED_TEXTURE)` 探测顺序优先），RGBA8 兜底；
sRGB 变体由 DFD transfer 决定。产物 raw compressed（`KTX2_RAW_MIME` +
`mipmapLevelDataSize`），经 `IMemoryImageSource` 逐 mip 上传，不经浏览器解码器。
无 provider：optional → 告警回退核心源，required → `GLTF_DECODER_MISSING`；转码失败
`GLTF_DECODE_FAILED`。证据：smoke-14（fake module 全分支）+ `gltf-ktx2-browser`（真实 wasm）。

## 场景

### KHR_lights_punctual
`instantiate` 挂原生组件，光度映射：directional `intensity`(lux)→`illuminance`（-Z 传播与
glTF 一致）；point cd→luminousFlux=4πI；spot cd→2π(1−cos outer)I 均匀锥；`spotAngle` 为全锥角
（度）；缺省 range→大有限值；color 线性×255；不触碰 `size`。`innerConeAngle` 无引擎入口→
metadata+告警。同一 light def 多节点=独立组件。相机仅保留描述+告警。
证据：smoke-12 + `gltf-scene-browser`（A/B 光照帧差）。

### EXT_mesh_gpu_instancing
当前**正确性展开路径**：`resolveData` 快照 TRANSLATION/ROTATION/SCALE 二进制并校验
（VEC3/VEC4 float、四元数、count 一致，违规 `GLTF_EXTENSION_INVALID`；skin 节点拒绝）；
`buildNode` 展开为共享 Mesh/Material 子节点，`renderTargets` 声明渲染归属，负缩放卷绕由
`GLTFWinding` 自动修正。原生 instanced-draw 为后续快路径（计划允许，性能报告已注明路径）。
证据：smoke-12 + scene 证据（4 实例矩阵断言）。

## 材质（T5/T6）

统一入口：`extendMaterial` 写 `features.physical`（`PhysicalScalars`），material.ts 依
`usePhysical` 选 effect、设 defines、`setProperty` UBO。**每个新纹理槽独立支持 UV0/UV1+transform**。

| 扩展 | 字段与通道 | 着色语义 | 已知限制 |
|---|---|---|---|
| unlit | — | AIR_GLTF_UNLIT 单 pass | — |
| emissive_strength | ≥1 线性 | `s.emissive×strength` | — |
| ior | ≥1 | F0=0.04→((η−1)/(η+1))²（specularIntensity 通道） | 掠射角 Fresnel，平面对照弱 |
| specular | `specularFactor` 标量 [0,2] + `specularColorFactor` **≥0（规范允许 HDR>1）**；vec4 草案兼容 | **仅介电 BRDF**：F0 = 0.08·specularIntensity·factor·**texture.a**（alpha 通道，无 2×），金属不受影响；介电漫反射按 (1−F0) 衰减（能量守恒，金属项不重复加权） | 纹理槽 6/7 binding 15/16 |
| clearcoat | factor/roughness [0,1]、scale [0,1]；R/G/XYZ | 独立 GGX 层 F0=0.04+Schlick（direct 主光 + emissive 吸收 + IBL 仅启用时） | 无切线时规范基近似；主光单光源近似 |
| anisotropy | strength [0,1]、rotation rad；方向纹 **RG→[−1,1] 方向、B 不重映射 [0,1] 逐纹素强度（×strength）** | Kulla-Conty 替换基底 GGX 可见项（强度取宏×纹素乘积）；rotation 存 cos/sin | 同上切线近似 |
| iridescence | factor [0,1]、ior [1.3,2.3333]、厚度 nm min≤max；R/G/G | 逐波长非相干 Airy F0（680/550/450nm）替换介电基底 F0 | 无 volume 时厚度=max（规范回退） |
| EXT_bump | bumpTexture 必填 R、factor ≥0 | 屏幕导数解 UV Jacobian → 法线扰动 | 有 normalTexture 时告警跳过；WebGL1 依赖 derivatives 扩展 |
| transmission | factor [0,1]；R 通道 | 两相机 scene-color 折射（UV 偏移） | 需 `AirTransmissionCapture` 先于解析启用，否则按 required/optional 报 unsupported/fallback |
| volume | thickness ≥0（G 缩放）、attenuationDistance>0、color [0,1] | 规范 Beer-Lambert：透射率 = attenuationColor^(d/attenuationDistance)（pow 形式，深色介质精确） | 与 transmission 组合生效 |
| dispersion | **`dispersion` 字段（=20/Abbe，非 dispersionFactor）** ≥0 | halfSpread=(ior−1)·0.025·dispersion，R/G/B 三 IOR 三采样（红最低、蓝最高，绿基准） | 需 transmission 生效 |

**T6 透射管线**：scene color 绑定目标是 renderer 的**渲染材质实例**
（`renderer.getMaterialInstance(0)`，非共享模板材质）；renderer 归属由 capture 所有权表管理
（多 capture 不互相覆写；destroy/disable 释放引用）。
**T5/T6 材质统一限制**：透射排序按透明队列 BACK_TO_FRONT，相交玻璃体次序不保证；折射为当前帧
scene color 单采样（无逐物体递归、无 roughness mip 链）。

## 官方对照

`fetch-official-gltf.cjs`（pin revision + sha256 manifest）+ `gltf-official-materials-browser.js`：
10 个官方材质/透射样本全部真机加载渲染零错误；`verified-official-load` 状态见 capabilities.json。
Khronos Viewer 对照链接：样本 manifest `url` 字段 → 官方仓库同 blob README。
