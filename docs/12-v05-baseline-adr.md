# V0.5 — T0 基线报告与 ADR

> 阶段：T0（Gate G0）· 日期：2026-09-12
> 依据：《Cocos Air V0.5 — Full glTF Extension Coverage 任务计划书》§6 T0

## 1. 基线验证（2026-09-12 21:10）

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | PASS（0 错误） |
| `node_modules/jest/bin/jest.js --runInBand` | 9 suites / 36 tests PASS |
| `npm run verify:web-only` | PASSED（763 可达） |
| HEAD | `7418ceb`（KHR_texture_transform 已提交，作为基线保留） |
| 主 bundle | `build/cocosair.module.js` 3,602,322 B；`cocosair.module.min.js` 2,056,556 B |
| 现有支持集合 | `KHR_materials_unlit`（supported）、`KHR_texture_transform`（supported） |
| 其余 19 项 | 未接入（V0.5 目标：无 `unsupported`） |

## 2. Fixtures 盘点

本地已有（`examples/gltf-viewer/assets/`，均带 SHA256 与许可）：
`BoxTextured.glb`、`SimpleSkin.gltf`（多文件）、`AnimatedMorphCube.glb`、`combined.glb`、`diagnostics.glb`、
官方 `InterpolationTest.glb`、`SimpleSparseAccessor.gltf`、`VertexColorTest.glb`、`Material_AlphaBlend_00.gltf`。
`examples/gltf-catalog/catalog.json` 收录 150 个模型元数据，可按需下载扩展验证模型（含 V0.5 目标的
Anisotropy/Clearcoat/Dispersion/IOR/Specular/Transmission/Volume/EmissiveStrength/Iridescence 系列）。

缺口（按需下载）：压缩 variant（Draco/Meshopt/Quantized）、KTX-BasisU、WebP、GPU instancing、灯光系列。

## 3. ADR 决策记录

### ADR-1 扩展插件注册（采纳 Three.js 模式）
`extension-registry.ts` 集中注册 `GLTFExtensionFactory`；每个扩展一个 handler 模块；
支持集合由已注册 handler 动态生成，`SUPPORTED_EXTENSIONS` 硬编码集合废除。
重复注册同名扩展拒绝；required 扩展缺失 handler 时报 `GLTF_EXTENSION_UNSUPPORTED`。

### ADR-2 Decoder 注入与独立资产
Draco/Meshopt/KTX2 解码器经 `GLTFLoaderOptions` / `setXXXDecoder()` 注入，延迟初始化；
未提供解码器时扩展状态为 `decoder-required`（缺失时报 `GLTF_DECODER_MISSING`，不冒充支持）。
解码器资产单独发布于 `build/gltf-decoders/`，不进入主 bundle。

### ADR-3 CPU 解量化（KHR_mesh_quantization）
按 semantic 允许的 componentType 白名单校验后，在 accessor 读取层统一归一化到 Float32
（normalized 语义已有通路），对上层 Mesh 构造透明。负缩放绕序由现有 GLTFWinding 处理。

### ADR-4 GPU instancing 正确性 fallback
`EXT_mesh_gpu_instancing` 第一阶段以共享 Mesh/Material 的 Node 展开保证语义正确，
原生 instanced draw 快路径在能力/材质允许时接入；性能报告注明所走路径。

### ADR-5 air-gltf-physical effect
新增版本化 effect（UBO superset + 宏裁剪 per-feature），不修改 `builtin-standard`；
材质差异由 `GLTFMaterialFeatures` 结构驱动，texture slot 表声明全部纹理。

### ADR-6 Transmission pass
opaque scene-color render target + mip chain + transmission queue；能力不足时
`GLTF_DEVICE_UNSUPPORTED`，不以 alpha blend 冒充（计划书 §13）。

### ADR-7 实施策略（单 Agent 串行）
计划书的多 Agent 分支编排按职责串行执行：T0→T1→T2→T3→T4→T5→T6→T7/T8，
每步以既有全量验证为回归门。无法在单会话完成的项在最终报告中如实标注 Gate 状态。

## 4. G0 退出条件核对

- [x] 当前工作区改动已识别并保留（HEAD 7418ceb，工作树清洁）
- [x] 现有测试/构建状态已记录（本文件 §1）
- [x] 已有 fixture 的来源/许可/hash 完整（SHA256.json + LICENSE 文件）
- [ ] 新增扩展 fixture：按 T2–T8 各任务落地时下载并记录（缺口见 §2）
- [x] ADR 冻结（§3）

**G0 PASS（fixture 按任务增量冻结）**。
