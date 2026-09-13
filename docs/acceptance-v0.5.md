# Cocos Air V0.5 验收与 V0.5.1 移交报告

> 基线：cocos4 @ 4.0.0-alpha.33（snapshot 2026-09-12）；日期 2026-09-13。
> 本文是 V0.5 的终验收记录与向 V0.5.1（开发者生态）的所有权移交合同。

## 1. 交付范围与状态

| 计划 | 内容 | 状态 | 证据 |
|---|---|---|---|
| T3 | EXT_texture_webp / EXT_texture_avif | ✅ 支持（能力探测+回退） | smoke-13，gltf-webp-browser |
| T3 | KHR_texture_basisu（KTX2/BasisU） | ✅ 支持（provider 注入） | smoke-14，gltf-ktx2-browser（真实 wasm） |
| T4 | KHR_lights_punctual | ✅ 光度映射实例化 | smoke-12，gltf-scene-browser |
| T4 | EXT_mesh_gpu_instancing | ✅ 正确性路径（展开共享资产） | smoke-12，gltf-scene-browser |
| T5 | emissive_strength / ior / specular | ✅ air-gltf-physical | smoke-15，gltf-physical-browser |
| T5 | clearcoat / anisotropy / iridescence / EXT_bump | ✅ 同上（宏+UBO superset） | smoke-16..19，各 *-browser |
| T6 | transmission / volume / dispersion | ✅ 两相机 scene-color 折射 | smoke-20，gltf-transmission-browser + 官方 CompareTransmission |
| T7 | decoder 发布/许可/构建 | ✅ G5-build 审计工具 | `npm run verify:decoders`（pack 离线加载） |
| T8 | capabilities 机读矩阵 | ✅ `npm run capabilities` | examples/gltf-catalog/capabilities.json |
| T8 | 官方样本加载级对照 | ✅ 10 官方样本真机全绿（9 扩展 verified-official-load） | gltf-official-materials-browser |

**未包含（V0.5 范围外）**：KHR_materials_sheen、KHR_materials_variants、
EXT_texture_webp 之外的动画/物理扩展、KHR_texture_avif 在缺乏解码设备上的像素验证。

## 2. Gate 证据链（全部可重复执行）

```
npm run typecheck                                   # 0
npm run test                                        # 20 suites / 118 tests
node tools/verify/fetch-official-gltf.cjs           # 幂等拉取官方样本（pin revision + sha256 manifest）
npm run verify:web-only                             # reachable 788+，PASSED
npm run build / build:min / build:dts               # 产物 + NodeNext 消费检查
npm run verify:decoders                             # G5-build：MANIFEST 哈希/许可/pack 离线
node tools/verify/gltf-<ext>-browser.js × 11        # 真机 WebGL2：编译/选择/绑定/零 GL 错误
node tools/verify/gltf-permutation-browser.js       # G3：kitchen-sink 全扩展 permutation
node tools/verify/gltf-official-materials-browser.js# T8：10 官方样本（pin revision+sha256）
```

## 3. 已知限制（如实记录，V0.5.1/T 后续不得掩盖）

1. **材质实例运行时 setProperty 不作用于已绑定 model 的渲染 pass**：所有浏览器证据基于
   构造期 uniform 值；改 uniform 需重建材质。（cocos MaterialInstance 与 model pass 绑定时序）
2. **EXT_mesh_gpu_instancing 为正确性展开路径**（非原生 instanced-draw 快路径）。
3. **透射排序**：BACK_TO_FRONT 队列下相交玻璃体相对次序不保证；折射采样当前帧 scene color，
   无逐物体递归透射；rough transmission 为单采样近似（无 scene-color mip 粗糙链）。
4. **clearcoatNormal/anisotropy 无顶点切线时用规范正交基近似**（官方像素对照下微调）。
5. **运行时切换**：`AirTransmissionCapture` 须在传输材质**解析前**挂好（能力在构建期读取）；
   未点亮时 required 传输文件按合同 `GLTF_EXTENSION_UNSUPPORTED` 失败。
6. **浏览器 Draco 未随包**：npm 侧无 hash-pin 源；由应用注入自有浏览器资产（MANIFEST 决策记录）。
7. **构建缓存 key-mismatch 冷重算是设计行为**；诊断 reason 机读化于 incremental.cjs。

## 4. V0.5.1 消费合同

- `getExtensionSupport()` / `capabilities.json`：扩展名清单唯一来源，不再手写。
- `docs/upstream-file-map.json`：上游改动全集（V0.5 新增：global-descriptor-set-manager 2048B、
  本阶段其余均为 air 新增文件，forward-stage/render-loop 零改动）。
- `examples/gltf-viewer/`：示例枚举统一入口 + `model-index` 快照 `examples/gltf-catalog/`。
- decoder provider API（setMeshopt/setDRACO/setKTX2）与 `build/gltf-decoders/MANIFEST.md`
  为包必含项；主 bundle 永不内嵌 decoder。
- 所有权移交：本文件所述模块（extensions/material/*、material/physical-effect、
  rendering/transmission-capture、tools/verify/*）在 V0.5 收尾后归 V0.5.1 计划管辖。
