# Material Table（材质对照表）

> 全部材质类型 × 关键属性 × 适用场景
> 的速查大表。AIR 的"材质表"分两半：**手写的 builtin 表**（本篇 §1–§2）和
> **glTF 资产自动选表**（§3，底本 [docs/gltf/gltf-extension-reference.md](../gltf/gltf-extension-reference.md)）。
> 纯参考篇，不配示例；每行的实测出处标了对应示例文章。

## 1. 手写材质速查（builtin 效果表）

AIR 包内注册 14 个 `builtin-*` 效果（build js 效果名逐一 grep 实锤），3D 手写常用
就前两个，其余各有专属消费方：

| effectName                                                                                                               | 定位                | 关键属性（实测可 setProperty）                                                                                                                | 关键 defines                                                                                                                                                                                                                                               | 手写场景 → 实测文章                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `builtin-standard`                                                                                                       | PBR 主力            | `albedo`/`mainColor`¹、`albedoMap`/`mainTexture`¹、`metallic`、`roughness`、`emissive`、`emissiveMap`、`metallicRoughnessMap`、`tilingOffset` | `USE_ALBEDO_MAP`(639)、`USE_EMISSIVE_MAP`(646)、`USE_METALLIC_ROUGHNESS_MAP`、`USE_NORMAL_MAP`、`USE_OCCLUSION_MAP`、`USE_VERTEX_COLOR`(628)、`USE_ALPHA_TEST`、`USE_TWOSIDE`、`USE_INSTANCING`/`USE_BATCHING`、`CC_USE_IBL/SKINNING/MORPH/FOG/LIGHTMAP/…` | 绝大多数 3D 演示 → [materials](materials.md)、[lights](lights.md)、[voxel-geometry](voxel-geometry.md)（顶点色） |
| `builtin-unlit`                                                                                                          | 无光照平涂          | `mainColor`、`mainTexture`、`tilingOffset`、`offset`                                                                                          | `USE_TEXTURE`(576)、`USE_LOCAL`                                                                                                                                                                                                                            | 公告板/自发光 UI 感 → [billboards](billboards.md)（有 raw 上传纹理变纯白的坑）、[backgrounds](backgrounds.md)    |
| `builtin-sprite` / `builtin-graphics` / `builtin-clear-stencil`                                                          | 2D 家族             | 2D 组件专用                                                                                                                                   | —                                                                                                                                                                                                                                                          | 2D 层（超出手册 3D 范围）                                                                                        |
| `builtin-particle` / `-gpu` / `-trail` / `builtin-billboard`                                                             | 粒子/公告板组件后端 | 由 Particle/Billboard 组件驱动                                                                                                                | —                                                                                                                                                                                                                                                          | 手写朝向替代见 [billboards](billboards.md)                                                                       |
| `builtin-spine` / `builtin-terrain` / `builtin-geometry-renderer` / `builtin-debug-renderer` / `builtin-occlusion-query` | 专项                | 各自组件/内部管线消费                                                                                                                         | —                                                                                                                                                                                                                                                          | Spine/Terrain 组件面未展开（能力边界见索引总说明）                                                               |

¹ `mainColor/mainTexture` 是 cocos 传统句柄名，`builtin-standard` 效果属性表注册名是
`albedo/albedoMap`（builtin-effects.ts 599 起）——两条名都实测可 `setProperty` 生效
（primitives/picking 等示例全走 `mainColor`），新代码建议按效果表原名写。

## 2. 场景 → 选表

| 需求           | AIR 选择                                  | 实测注意（都踩过）                                                                              |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 受光的实体     | `builtin-standard`                        | sRGB→linear 会压暗：亮色系 + illuminance 8–14（[color-management](color-management.md)）        |
| 金属感         | `metallic/roughness` 属性                 | **无 IBL/env 时 metallic 拉高→近黑**（mini-game 截图实锤）：卡通金属走 diffuse                  |
| 不受光/平涂    | `builtin-unlit`                           | 动态上传的 raw Texture2D 会渲染异常（billboards 篇），走 `builtin-standard`+`USE_ALBEDO_MAP` 稳 |
| 顶点色         | `defines: { USE_VERTEX_COLOR: true }`     | colors 缓冲默认 RGBA32F，分量必须 0..1（[voxel-geometry](voxel-geometry.md) 白山坑）            |
| 镂空/硬边透明  | `USE_ALPHA_TEST` + `albedoScaleAndCutoff` | 与排序透明是两回事（[transparency](transparency.md)）                                           |
| 双面           | `USE_TWOSIDE`                             | 法线朝向与光照的取舍见 transparency/picking 篇                                                  |
| 自发光         | `emissive` + `USE_EMISSIVE_MAP`           | 不受光≠unlit：standard 的 emissive 仍参与透明/雾                                                |
| 任意自定义着色 | **无**（无用户 GLSL 入口）                | 诚实边界 → [shadertoy](shadertoy.md)、[debugging-glsl](debugging-glsl.md)                       |
| Lambert 感     | standard + `metallic=0, roughness≈1` 近似 | 无独立 Lambert 效果                                                                             |

## 3. glTF 自动选表（资产侧，底本 gltf-extension-reference）

加载 glTF 时用户不选表——`src/air/assets/gltf/material.ts` 按扩展自动选：

| 资产内容                                                                                                                    | 落到的 effect                                                                                 | 备注                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核心 PBR（pbrMetallicRoughness，无扩展）                                                                                    | `air-gltf-standard`                                                                           | identity 路径，与手写 standard 零差异                                                                                                                                               |
| `KHR_materials_unlit`                                                                                                       | `AIR_GLTF_UNLIT` 单 pass                                                                      | 与全部 KHR 材质扩展互斥（忽略并告警）                                                                                                                                               |
| `emissive_strength / ior / specular / clearcoat / anisotropy / iridescence / EXT_bump / transmission / volume / dispersion` | `air-gltf-physical`（版本化 superset：UBO 稳定 + 宏裁剪 permutation + sampler binding 15–27） | 逐扩展字段语义/通道/限制**以 [gltf-extension-reference.md](../gltf/gltf-extension-reference.md) §材质表为唯一权威**，本篇不复制第二份以免漂移；支持状态机器可读版 `npm run capabilities` |
| sheen（`KHR_materials_sheen`）                                                                                              | 不在上表 → 未实现                                                                             | required 引用会 `GLTF_EXTENSION_UNSUPPORTED`                                                                                                                                        |

**T6 透射的两条实操红线**（底本原文，值得所有手写材质的人知道）：transmission 需要
`AirTransmissionCapture` 先于解析启用；scene-color 绑定目标是 renderer 的**材质实例**
（`renderer.getMaterialInstance(0)`），不是共享模板——对应"永远不要改共享 builtin
材质"红线（[materials](materials.md)）。

## 4. 运行与验证

```bash
node tools/verify/manual-doc-consistency.cjs   # 本篇：无示例，纯参考篇
```

---

上一篇：[VR - Point To Select 指向选择](webxr-point-to-select.md) ｜ 返回：[开发手册目录](index.md)
