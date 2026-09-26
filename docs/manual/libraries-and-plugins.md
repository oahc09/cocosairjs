# Libraries and Plugins 库与插件

> **META 篇**：AIR 把加载器内置进核心导出，而把**压缩解码器**设计成显式注入的边界。本篇讲清这两类"外部能力"分别怎么接。

## 1. 内置加载器（无需额外安装）

`GLTFLoader` 是 `cocosair` 的具名导出，`new GLTFLoader()` 即用，支持 `loadAsync(url)` / `parseAsync(data)` 与扩展注册（`loader.register(factory)` / `GLTFExtensionRegistry`），无需额外安装或另找加载器。见 [Loading 3D Models](./loading-3d-models.md)。

## 2. 压缩解码器：显式注入边界（重点）

DRACO / meshopt / KTX2 的**解码器二进制不内置**（体积与许可证原因）。模型若用了相应扩展，必须在解析前注入：

| 扩展                         | 注入                                   |
| ---------------------------- | -------------------------------------- |
| `KHR_draco_mesh_compression` | `loader.setDRACODecoder(decoder)`      |
| `EXT_meshopt_compression`    | `loader.setMeshoptDecoder(decoder)`    |
| KTX2 纹理                    | `loader.setKTX2Transcoder(transcoder)` |

不注入则解析如实报 decoder required。仓库 `examples/gltf-meshopt/` 演示 meshopt 注入回路。**默认构建下 draco/ktx2 链路为 BLOCKED**（缺解码器二进制），与 `decoder-required` 能力合同一致；不要假设"装了 cocosair 就能开 draco 模型"。进程级默认值用 `configureGLTFLoaderDefaults(options)`。

## 3. 相机控制 / 后处理等扩展能力

轨道相机控制 AIR 没有内置对应物；交互类需求用 `input` / `EventKeyboard` / 拾取射线自建（见 [Picking 拾取](./picking.md)、[Tips 技巧](./tips.md)）。后处理走引擎的 stage 体系（`BloomStage` 等在导出面内），见 [Post Processing 后处理](./post-processing.md)。

## 4. 社区插件现状

AIR 尚处早期（package.json `version: 0.1.0`），**没有成熟的第三方插件生态**。需要某项常见 3D 库能力而 AIR 没有时，正确姿势是：先在 368 个导出名里搜（见 [WebGL Compatibility Check](./webgl-compatibility-check.md) 的探针思路与 `docs/evidence/manual-spike.md` §7），确认确实没有再自建组件；不要直接移植其它 3D 库的 loader/control 代码（API 与生命周期不兼容）。
