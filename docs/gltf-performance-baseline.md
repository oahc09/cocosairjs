# glTF 性能、包体与稳定性基线（V0.5 G5 / 计划书 §10）

> 测量日期 2026-09-14；环境：Windows 11 x64、HeadlessChrome 153（ANGLE WebGL2）、本机
> `serve-gltf.cjs`（no-store）。复现命令在文末。G0 冻结时未记录加载耗时数字，按计划书
> 规则本次**实测并冻结为 V0.5 交付基线**，V0.5.1 及后续对标本文件，不回溯虚构 G0 数字。

## 1. BoxTextured（官方字节校验副本，未压缩）加载基线

口径：`fetch(bytes) → new GLTFLoader().parseAsync(bytes)`（Promise resolve 于 buffer 解码、
纹理 ImageAsset 解码完成）至 `asset.destroy()` 为一轮；30 次，冷 HTTP（`?run=n` + no-store）。

| 指标 | 值 |
|---|---|
| 中位 | **2.2 ms** |
| p5 / p95 | 1.9 / 4.8 ms |
| min / max | ~1.7 / ~6.2 ms（首 run 含 JIT 预热） |

原始逐次数据：`docs/evidence/v05-load-baseline.raw.json`（`runsMs`）。

## 2. §10 能力条款实测

| 条款 | 结果 |
|---|---|
| 未使用压缩扩展不得初始化 decoder/worker | ✅ 30 次未压缩加载中 `WebAssembly.instantiate/compile` 与 `Worker` 构造计数恒为 **0**（探针见 `tools/verify/gltf-performance-browser.js`） |
| 同一 parser 中相同 bufferView/texture/mesh 解码次数 = 1 | ✅ smoke-11 计数断言（meshopt `decodeGltfBuffer` 调用数、imageCache 命中） |
| KTX2 转码缓存键 | 以 image（=source 字节）为键；sRGB/linear 变体由容器 DFD 决定（每 image 唯一），槽位解释与 PNG 路径一致在材质层处理，不存在同 image 混用两种转码结果的路径 |
| shader permutation 仅由实际 features 生成、同 key 复用 | ✅ `gltfEffect()/gltfPhysicalEffect()` EffectAsset 注册表单例（smoke-15 幂等断言）；identity 材质永不触碰 physical 变体 |
| scene-color target 按 viewport 分配并复用；resize 释放旧 attachment | ✅ `AirTransmissionCapture` 单 RenderTexture，`resize→RenderWindow.resize` 重建 attachment |
| 分配上限 | accessor 解码分量 ≤16M（parser-context）；KTX2 边长 ≤**16384**（本轮 §10 审计补齐，`MAX_KTX2_DIMENSION` + smoke-14 用例）；draco/meshopt 输出写入受 accessor 上限约束的缓冲 |
| worker/Blob/ArrayBuffer/半成品 Asset 释放 | ✅ 纹理路径 `finally { URL.createObjectURL/revokeObjectURL 配对 }`；12 轮加载/销毁循环中 **created−revoked 恒 0** |
| Draco/Meshopt 主线程策略 | 本版无 worker 集成，decoder 注入式**主线程执行**（小体量 wasm，未测出长任务）；按 §10 要求在此如实标记，capabilities `note` 字段同步声明 |

## 3. 包体与 gzip（不入 source map，独立计数）

| 产物 | bytes | gzip |
|---|---|---|
| build/cocosair.module.js | 3,726,835 | 651,424 |
| build/cocosair.module.min.js | 2,124,553 | 498,178 |
| build/cocosair.module.d.ts | 2,229,831 | 414,179 |
| build/gltf-decoders/ 全部 | **1,463,752** | —（WASM 已 deflate，见 MANIFEST 逐文件表） |

主 bundle **不含**任何 decoder 字节（`verify:decoders` 审计：无 WASM 魔数、无 `gltf-decoders/`
路径引用）。V0.5 新增 glTF 代码位于 `src/air`（运行时源码合计 787,449 bytes）。

## 4. 稳定性（反复加载/销毁）

12 轮 parse→instantiate→渲染帧→全量 destroy（cycle0 为 skybox 懒注册 warmup）：

- renderScene 模型数：cycle1–11 每轮 `after === before`（**零泄漏**），峰值 +2 随 destroy 回落；
- `instance.root.isValid` 全 false；JS heap 首末三点均值 79.9→74.0MB（**−5.9MB，噪声级，无上升
  趋势**）；Blob URL 收支平衡；GL error 0。
- 原始数据：`docs/evidence/v05-stability.raw.json`。

不以单次 GC 证明"无泄漏"（计划书 §10 同口径）：此处证据为**行为级**（对象/模型/URL/堆趋势），
GPU 资源精确计数在 WebGL 后端不可观测，标记为 unavailable。

## 5. 复现

```bash
node tools/verify/serve-gltf.cjs &
npm run build
bash "$PWCLI" run-code --filename=tools/verify/gltf-performance-browser.js
bash "$PWCLI" run-code --filename=tools/verify/gltf-stability-browser.js
node tools/verify/decoder-audit.cjs          # 体积/哈希/离线 pack（G5-build）
```

限制声明：数字为本机 headless 单次会话测量，异机比较前先复测基线（V0.5.1 T6 同规则）。
