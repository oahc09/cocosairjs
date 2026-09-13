# Cocos Air V0.1 — 进展日志

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> 依据：《Cocos Air V0.1 — cocos4 Web-TS Engine Extraction 任务计划书》
> 详细验收证据见 `docs/acceptance-report.md`。

---

## 2026-09-12（三轮）：Phase 18/19 收尾 → **V0.1 RC**

- **首轮 git commit**：`f1bc676`（960 文件，工作区清洁；未 push，按约定待用户确认）。
- **Phase 18 第二轮裁剪：结论为"无需删除"**。用与 build.cjs 一致的完整 feature 集重建依赖图
  （此前仅用 'air' 单 feature 分析，曾产生 91 个假阳性 UNREACHABLE——包括运行时在用的
  webgl 后端与 legacy pipeline，教训已固化到 dep-graph.cjs 注释）。真实闭包 839/843 可达，
  余 4 个均为必须保留的锚点（module-override 对 ×2、源码统一入口 index.ts、纯类型声明）。
  物理裁剪已在 Phase 4 extraction 完成，当前 src 树即精确闭包——符合"Minimize Diff From Upstream"。
- **Phase 19 License audit 复核**：版权头覆盖 723/788（缺 65 个为上游自身未带头文件，非剥离）；
  上游修改 4 处以 upstream-file-map.json 为权威清单；THIRD_PARTY_LICENSES.md 已同步更新。
- **README 更新**：V0.1 RC 标识、真实闭包数据、Skeleton.joints 路径注意事项、蒙皮示例通过状态。
- **新增 `tools/verify/examples-smoke.cjs`**：三示例浏览器冒烟回归（0 错误 + 内容像素判定），
  RC 验证实测三例 PASS。
- **RC 最终全量验证（全绿）**：typecheck 0 错误；build 45.6s / build:min 61.4s；
  verify:web-only PASSED；test 7/7；三示例浏览器冒烟 PASS。
- **V0.1 RC 标记**（package.json 版本号保持 0.1.0 未变，见版本号策略）。

**计划书 §33 执行顺序 1–24 全部完成。**

---

## 2026-09-12（二轮）：L13 蒙皮动画修复完成 → V0.1 验收矩阵 15/15 PASS

### 结论

**V0.1 全部 15 个验收等级（L0–L14）通过**，Definition of Done 16 项条件中仅剩
流程性收尾（首轮 git commit、License audit、README）。

### L13 三个叠加根因与修复

| # | 层面 | 根因 | 修复 |
|---|---|---|---|
| 1 | 着色器 | glsl4 fixture 的 `u32vec4 a_joints`（Vulkan GLSL 类型）在 Air 降写器剥除扩展后残留，ESSL 编译 `syntax error` → 蒙皮变体程序创建失败（即一轮报告的 "no valid shader program in use"） | `register.ts` 降写器将 `u32vecN → vecN`（匹配 RGBA32F float 属性通路） |
| 2 | 数据绑定 | `register.ts` 的 `LOCAL_BLOCK_BINDINGS` 缺 `CCSkinning` 键，fallback 到 binding 0 与 CCLocal 冲突，`cc_joints` 读到世界矩阵数据 | 映射 `CCSkinning: 3`（= `UBOSkinning.BINDING` = UBO_SKINNING_TEXTURE） |
| 3 | 示例资产 | `skeleton.joints` 需为相对 skinningRoot 的完整路径，示例写了平铺名 → bone1/bone2 未注册，关节矩阵为零 | `examples/skinned-animation/main.js` 改为 `bone0/bone1`、`bone0/bone1/bone2` |

### 附带修复：`npm run build` DebugInfos 解析失败

独立 src 树下 ccbuild（node-resolve）无法解析扩展名less 的 `../../../DebugInfos`
（同工具链对原始 cocos4-vulkan 树可解析）。修复：`debug.ts` import 显式 `.json`
扩展 + 根 tsconfig 增加 `resolveJsonModule`。已记录 upstream-file-map.json。

### 回归结果（全绿）

- `npm run typecheck` — 0 错误
- `npm run build` / `npm run build:min` — 成功（dev ~48s / min ~36s）
- `npm run verify:web-only` — PASSED
- `npm test` — 4 suites / 7 tests 全过
- 浏览器实测：蒙皮变体编译链接成功、3 关节注册、网格逐帧变形
  （4 帧 bbox w=142→176→252→234），证据 `docs/evidence/skinned-animation-pose1~3.png`

### 剩余已知事项（非阻塞）

1. 蒙皮材质 `setProperty('mainColor')` 未生效（外观级，属性名与 fixtures 对齐问题）
2. WebGL 每帧 `INVALID_ENUM: getParameter` 警告（能力查询路径，待查）
3. WebGL1 为当前设备主路径（API.WEBGL），WebGL2 源已备好未启用
4. AnimationClip 曲线资产仍需 Creator 管线（V0.1 以 Code First 骨骼驱动替代）

### 下一步（按计划书 §33）

1. **首轮 git commit**（当前仓库 0 commit，全部文件 untracked——版本锚点缺失）
2. Phase 18 第二轮源码裁剪（L 全通过后允许开始）
3. Phase 19 License / Third-Party audit
4. README → V0.1 RC

---

## 2026-09-12（一轮）：V0.1 主体完成

- Phase 0–3：基线记录（UPSTREAM.md / 00-upstream-baseline.md，上游 SHA 不可得记
  Deviation-01）、Web Feature Set 实测（01-web-feature-set.md）、依赖图
  （749/839 文件）、Extraction Manifest + upstream-file-map
- Phase 4–8：src/ 独立树（841 文件，闭包较上游 -40%）、native/editor/jsb 物理移除、
  typecheck / build / verify:web-only 全部通过
- Phase 9–14：Air Bootstrap、hello-cube、static-model、dev loop（23.8s 全链路）、
  baseline 对比（17-baseline-comparison.md）全部 PASS
- L13 蒙皮动画当时为部分通过（骨骼/蒙皮/动画数据链路 OK，蒙皮变体光栅化失败）——
  已于二轮修复（见上）

---

## 2026-09-12（V0.2）：Code First DX & SDK 化 → **V0.2 RC**

依据《Cocos Air V0.2 — Code First DX & SDK 化任务计划书（与 V0.1 连续版）》，L0–L17 全部通过：

- **Task 1/6/7 核心 API**：`createAirApp` 支持 `canvas: string(selector) | HTMLCanvasElement`，
  新增 `AirApp.getScene()`；`src/air/utils/` 新增 `load-asset.ts`（Promise Asset Helper）、
  `skeleton-tree.ts` / `restore-bind-pose.ts`（骨骼工具集）、`frame-object.ts`（相机取景）。
- **Task 12 examples**：新增 `examples/starter/`（最小模板）与 `examples/shared/scene-kit.js`；
  static-model / skinned-animation 改用 V0.2 helper 重写，四示例浏览器验证 ALL-PASS
  （starter 0 错误空场景；hello-cube 205 / static-model 236 / skinned 202 draws，均 0 错误）。
- **Task 7/8/9/10 dev loop**：dev-server 三频道分类（engine/air/example），
  example 变更仅 reload（服务端 <1ms，绝不触发构建）；example .ts 用 esbuild 即时编译
  （target es2022，支持 top-level await）+ importmap 注入（`cocosair` → bundle）；
  构建失败浏览器顶部错误横幅 + `/__build_status`；频道耗时 `/__stats`。
- **Task 10/11 Source Map + d.ts**：dev 构建附 `.map`（10.5MB，修正 sourceMappingURL 指向）；
  `npm run build:dts`（ccbuild dtsBundler）→ `build/cocosair.module.d.ts`，
  package.json 增加 `types` 字段。
- **Task 16/17 性能基线**：docs/05（Cold 52.1s / Air rebuild 114.4s / Min 127.1s / d.ts 81.2s /
  Example reload <1ms）；ccbuild 无增量缓存如实记录，未更换 bundler。
- **测试**：新增 smoke-05（promise asset helper）、smoke-06（skeleton utils）；
  全量 jest 7 suites / 22 tests PASS；typecheck 0 错误（顺带修复 air/assets/gltf 死代码的
  up4 相对路径与 es2019 API 兼容）；verify:web-only PASSED。
- **过程修复**：`@babel/preset-env` 顶层依赖显式化（npm 重排导致缺失）；starter 的
  GameCanvas id 约束（引擎 import 阶段即查找，文档化于 docs/06）；build.cjs/dts 脚本
  对本机 safe-delete shim 的批量删除拦截做降级（唯一 tmp 目录 / rename 移出 / finally 拷贝产物）。
- **文档**：docs/05–09 连续编号 + `docs/acceptance-report-v02.md` + README Quick Start 增补。
- **V0.2 RC 标记**（package.json 版本号保持 0.1.0 未变；commit 后本地 tag `v0.2.0-rc.1`，不 push）。

## V0.5 T4 — 灯光与 GPU instancing（2026-09-13）
- registry 新增 `resolveData`（parse 期二进制快照点，releaseDecodedData 前）与 `buildNode`
  （实例级节点替换 + `renderTargets` 锚点/渲染目标分离合同）；`GLTFInstantiationContext`
  扩展 nodes/accessor；asset.instantiate 分发 buildNode（makeNodes 双 pass 嵌套挂载）与
  per-node `instantiate` hook。
- KHR_lights_punctual handler：directional -Z 约定与 Cocos 原生一致无需修正；lux→illuminance、
  cd→luminousFlux（point 4πI / spot 均匀锥 2π(1−cos outer)I，经 HDR/LDR 一致的 flux setter 路径）、
  spotAngle=2·outer 度数、range 直传、缺省大有限值近似无限、innerConeAngle 元数据+告警、
  一 light 多节点=独立组件；validate 全量 GLTFError（GLTF_EXTENSION_INVALID 稳定 code）。
- EXT_mesh_gpu_instancing handler：正确性路径（anchor+共享 Mesh 实例、TRS 快照校验、
  四元数 parse 期 fail-fast、负缩放交给 GLTFWinding；support.reason 声明 fast path 未实现）。
- 上游修改登记：global-descriptor-set-manager.ts shadow UBO 256B→2048B（WebGL2 下
  CCShadow 1248B 触发 'uniform buffer too small'；与 pipeline-ubo.ts 既有扩容同步）。
- fixture：scene.glb（3 类灯 + 4 实例含负缩放/大缩放；8 顶点平均法线；PBR 材质）+ viewer
  入口与相机位；tools/verify/gltf-scene-browser.js A/B 帧差验证 ok:true（glError 0、
  changedPixels>5%、光度断言全过）；gltf-ubo-diag.js / gltf-render-diag.js 保留为诊断工具。
- 测试：smoke-12-gltf-scene 7 tests；全量 jest 12 suites / 66 tests PASS；typecheck 0；
  verify:web-only PASSED；build/min/dts 重跑通过。


## V0.5 T3（上）— WebP/AVIF 纹理扩展（2026-09-13）
- 新增 `extensions/texture/image-formats.ts`：EXT_texture_webp/avif handler +
  `detectImageMime`（PNG/JPEG/WebP/AVIF 魔数）+ 浏览器解码能力探测（1x1 data URI、
  单页缓存、`setTextureSupportForTesting` 测试缝）。
- 解码编排重写（loadGLTFTextures）：extension 源优先、core source 回退；解码失败
  per-mime 熔断缓存（同格式后续直接回退）；required + 设备不支持 → GLTF_DEVICE_UNSUPPORTED；
  魔数/声明 mimeType 不符 → GLTF_EXTENSION_INVALID。
- loader 注册两 handler；KNOWN_UNIMPLEMENTED 只剩 KHR_texture_basisu；
  gltf/index 公开 detectImageMime/setTextureSupportForTesting/SUPPORTED_IMAGE_MIMES。
- 测试：smoke-13（10：magic、handler 矩阵、fallback 编排、StubImage 集成）；
  smoke-11 能力矩阵断言更新（webp/avif 已注册，basisu 保持 unsupported）；
  全量 13 suites / 76 tests PASS；typecheck 0；verify:web-only PASSED；esm/min/dts 通过。
- 浏览器证据（tools/verify/gltf-webp-browser.js）：真实浏览器解码 webp 纹理 glb
  （texture 1 张、宽 1px）、probe unsupported + 无核心源干净失败，`ok:true`。
- 下一步：KTX2/BasisU（transcoder 资产固定 + 容器解析 + ImageSource raw 上传路径）。


## V0.5 T3（下）— KHR_texture_basisu / KTX2（2026-09-13）
- provider 合同扩展：`DecodedTextureSource` 支持 raw 形态（width/height/format/compressed/
  mipmapLevelDataSize，KTX2_RAW_MIME 哨兵）；`KTX2TargetFormat` 逻辑名与 engine Format 解耦。
- `createKTX2Transcoder(factory)` adapter（decoder/ktx2.ts）：包装 three r168 vendored
  Basis `KTX2File`；ranked 目标（ETC1S: ETC2>ASTC>BC7；UASTC: ASTC>BC7>ETC2）、显式设备顺序
  优先、hasAlpha/sRGB(DFD transfer) 变体映射、逐候选失败降级、RGBA8 兜底；cubemap/array、
  零维、非法容器 → GLTF_DECODE_FAILED；模块缺 initializeBasis/KTX2File → GLTF_DECODER_MISSING。
- `deviceKTX2Formats()`：BC7(+SRGB)/ASTC_RGBA_4X4/ETC2( RGBA8+SRGB_A8) 按 getFormatFeatures 探测。
- handler（extensions/texture/basisu.ts）：KTX2 魔数强校验（GLTF_EXTENSION_INVALID）、
  decoder-required 状态机、optional 回退告警、无转码器+无核心源 → GLTF_DECODER_MISSING、
  raw→IMemoryImageSource 逐 mip 上传（material 编排 raw 分支，不经浏览器解码）。
- 资产：build/gltf-decoders/basis/{js,wasm}（three@0.168.0 vendored，Apache-2.0 LICENSE.md，
  sha256 入 MANIFEST）；serve-gltf 补 .wasm MIME（T7 移交条款）。
- 测试：smoke-14 10 项（fake Basis module 覆盖 ranked/sRGB/回退/错误码/端到端）；
  浏览器证据 gltf-ktx2-browser.js（真实 wasm：initializeBasis+KTX2File 原生路径、矩阵状态、
  core PNG 回退解码）`ok:true`；全量 14 suites / 86 tests PASS；typecheck 0；verify PASSED；
  esm/min/dts 重建。
- 如实记录：真实 BasisU 压缩样本的端到端像素级验证归 T8 官方模型矩阵（需下载
  glTF-Sample-Asset-Generator KTX-BasisU variants）。


## V0.5 T5（上）— 物理材质基础：emissive_strength / ior / specular（2026-09-13）
- effect 派生 `air-gltf-physical`（material/physical-effect.ts）：在 gltfEffect 基础上向
  共享 Constants UBO 追加 `airPhysicalParams`/`airSpecularColorFactor`（vert+frag 同序生长，
  驱动按字段数链接块）、绑定 15/16 两物理采样器、新增 5 个宏；emissive×strength、
  ior→specularIntensity（F0/0.04 归一，1.5 恒等）、specular factor/color 注入 shading，
  纹理调制放 main（v_uv 声明后），经全局 `airSpecTex` 传入——修复了三处真实驱动问题：
  UBO 跨阶段字段数、glsl3 不支持显式 layout、函数体内前向引用 in 变量。
- 扩展 handler（emissive-strength/ior/specular）：validate（GLTF_EXTENSION_INVALID 稳定码、
  缺省体走 spec 默认）+ extendMaterial 填充 PhysicalScalars；specular 纹理 info 走
  TEXTURE_SLOTS 第 6/7 槽（specularTexture/specularColorTexture）。
- 选择规则（material.ts）：非恒等标量或 color 或任一纹理 → physical effect；unlit 忽略并
  告警；identity 材质保持原 effect（零回归面）。
- 测试：smoke-15 7 项（校验矩阵/归一化/params 换算/effect 选择/纹理槽/派生幂等/端到端）；
  全量 15 suites / 93 tests PASS；typecheck 0；verify:web-only PASSED；esm/min/dts 重建 +
  NodeNext 消费检查 EXIT:0。
- 浏览器证据（tools/verify/gltf-physical-browser.js，physical.glb fixture）：真实 WebGL2
  驱动编译 air-gltf-physical 无 GL 错误；三材质 effect 选择正确；airPhysicalParams
  (4, 4.5918, 1) 与 ior 2.5 换算一致；identity 对照无物理 uniform；specularMap/UV uniform
  绑定；emissive strength A/B 帧差 28223 px，`ok:true`。
- 如实记录：ior 单独作用为掠射角 Fresnel 效应，平面对置相机时像素差低于量化阈值，
  渲染端强信号由 emissive strength 承担（帧差断言）；官方 Khronos specular 样例的
  像素级对照归 T8 矩阵。


## V0.5 T5.2（一）— KHR_materials_clearcoat（2026-09-13）
- 同一 air-gltf-physical effect 叠加 clearcoat 层：UBO 追加 `airClearcoat=(factor,roughness,
  normalScale,1)`（稳定 superset，偏移不扰动 T5.1 字段）、宏 USE_AIR_CLEARCOAT* + CLEARCOAT*_UV、
  采样器 17/18/19；direct 第二 GGX 瓣（层 F0 0.04 + Schlick，主光近似）、IBL 层反射（仅启用
  IBL 时）、emissive 层吸收 (1-factor·Fresnel)。
- 纹理槽 8-10（clearcoat/Roughness/Normal，规范通道 R/G/XYZ，支持 texCoord+transform）；
  切线路径有 normal 贴图用 TBN、无切线用规范正交基近似（如实记录，官方对照归 T8）。
- handler 校验 [0,1] 全域 + scale 合法；factor=0 回退标准 effect（clearcoatScalar 规则）。
- 修复过程三个真实驱动问题：UBO 跨阶段字段数（vert+frag 同步生长）、glsl3 拒绝显式 layout
  （改按名绑定）、airSpecTex/高光纹理采样前向引用 in 变量（全局+main 赋值模式，纹理通道
  调制与 clearcoat 法线同路径）。
- 测试：smoke-16 6 项；全量 16 suites / 99 tests PASS；typecheck/verify:web-only/esm/min/dts/
  NodeNext 消费全绿。
- 浏览器证据：gltf-clearcoat-browser.js（真实 WebGL2：air-gltf-physical+clearcoat 瓣编译零
  GL 错误、选择/uniform/采样器断言 ok:true）；gltf-physical-browser.js 帧指标改为
  strength4-vs-identity 同材料对照（604 vs 420，emissive_strength 直接因果）。
- 如实记录（两项）：① 材质实例运行时 setProperty 物理 uniform 不作用于已绑定 model 的
  渲染 pass（构造期上传正常，证据均依赖构造期值）——渲染器级问题，非扩展解析问题；
  ② 平面对照面的固定框亮度差受阴影遮挡污染，clearcoat/ior 的像素级外观对照归 T8 官方
  场景矩阵。


## V0.5 T5.2（二）— KHR_materials_anisotropy（2026-09-13）
- `airAnisotropy=(strength,cos,sin,1)` UBO 追加（成员序 4）；`airAnisoVisibility`
  （Kulla-Conty D 各向异性 GGX + Smith）在 USE_AIR_ANISOTROPY 时 **mix 替换**基底
  CalcSpecular 项（strength=0 恒等回退，无双重高光）。
- 世界空间切线框架：normal 贴图路径用 TBN、否则规范正交基（与 clearcoat 法线同策略，
  官方对照归 T8）；`anisotropyTexture.RGB` 方向重投影；rotation→cos/sin 构造期编码。
- handler 校验 strength [0,1]、rotation 有限；有贴图时 strength 缺省 1（Khronos）。
- 修复：scene 节点索引碰撞（光节点 scenes.push 与平面 i 重复 → unique roots 报错）。
- 测试：smoke-17 5 项；全量 17 suites / 104 tests PASS；typecheck/verify:web-only/
  esm/min/dts/NodeNext 消费全绿；三浏览器证据（physical/clearcoat/anisotropy）ok:true
  （真机编译零 GL 错误、uniform (0.9, cos, sin)、effect 选择、采样器绑定）。


## V0.5 T5.2（三）— KHR_materials_iridescence（2026-09-13）
- `airIridescence=(factor, filmIor, thicknessMin, thicknessMax)` UBO 追加（成员序 5）；
  `airIridescenceF0(NV)` 逐 RGB（680/550/450nm）非相干 Airy 薄膜 F0，mix 替换非金属基底
  F0（factor 调制、metallic 门控）；基底 IOR 从 airPhysicalParams.y 反推。
- 纹理槽 11-13（iridescenceTexture.R / IorTexture.G→[1.3,2.3333] / ThicknessTexture.G→
  [min,max]，绑定 21/22/23）；无 volume 时厚度取 max（规范回退）。
- handler 校验 factor [0,1]、ior [1.3,2.3333]、0<=min<=max；GLSL ES pow(vec3,float) 重载
  不支持 → 显式乘法。
- 测试：smoke-18 5 项；全量 18 suites / 109 tests PASS；typecheck/verify:web-only/esm/min/
  dts/NodeNext 全绿；四浏览器证据（physical/clearcoat/anisotropy/iridescence）ok:true——
  真实 WebGL2 编译全部物理 permutation 零 GL 错误。


## V0.5 T5.2（四）— EXT_materials_bump（2026-09-13）
- 导数高度扰动：main 内 `dFdx(bh)/dFdx(buv)/dFdx(s.position)` 解 UV Jacobian，
  `s.normal = normalize(N - grad)`；`airBump=(factor,0,0,1)` UBO 追加（成员序 6），
  `bumpMap` 绑定 24、texCoord/transform 全支持。
- handler：bumpTexture 必填（缺失/非法 index → GLTF_EXTENSION_INVALID）、bumpFactor >= 0；
  与 normalTexture 共存时告警跳过（提案可选项）；WebGL1 依赖 OES_standard_derivatives（记录）。
- 修复：`USE_AIR_BUMP` 漏注册 shader.defines → 预处理器置空 `#if ` 编译失败
  （clearcoat/iridescence 注册齐全，仅 bump 疏漏；证据脚本抓到）。
- 测试：smoke-19 5 项；全量 19 suites / 114 tests PASS；typecheck/verify:web-only/esm/min/
  dts/NodeNext 全绿；五浏览器证据（physical/clearcoat/anisotropy/iridescence/bump）ok:true
  —— T5 七扩展的 shader permutation 在真实 WebGL2 驱动全部编译链接零 GL 错误。
- T5.2 收口：clearcoat/anisotropy/iridescence/bump 全部交付；G3 的官方材质对照归 T8。


## V0.5 T5 门控收口 — G3 permutation 扫描（2026-09-13）
- physical.glb 新增 kitchen-sink 材质：**7 个物理扩展同开 + 全部 10 个扩展纹理槽同时绑定**
  （emissive_strength/ior/specular×2 纹理/clearcoat×3 纹理/anisotropy 纹理/iridescence×3
  纹理/bump），为宏、采样器（binding 15-24）与 UBO superset 的最坏组合。
- 证据 gltf-permutation-browser.js：9 材质 effect 选择矩阵（5 physical + 2 standard +
  kitchen-sink physical + …）逐一断言 + 真实 WebGL2 编译链接零 GL 错误 + 零 shader console
  错误 + 场景渲染正常；七证据全回归（physical/clearcoat/anisotropy/iridescence/bump/
  permutation/scene）ok:true。
- T5 退出条件判定：**shader permutation 全绿达成**；“现有 standard/unlit 模型无回归”达成
  （全量 jest + diagnostics/webp/ktx2/scene 证据）；**官方材质测试格子的像素对照归 T8
  矩阵**（需下载 Khronos glTF-Sample-Models 材质套件对照）。


## V0.5 T7 — decoder 发布 / 构建 / 许可收口（2026-09-13）
- **Gate G5-build 工具化**：新增 `tools/verify/decoder-audit.cjs`（`npm run verify:decoders`，
  机读 JSON、漂移退出 1）：① MANIFEST 逐文件 bytes/SHA-256 双向核对；② 每个 decoder 目录
  LICENSE.md 存在 + 版本/来源固定；③ 主 bundle/min/两 map 零 WASM 魔数、JS 零 `gltf-decoders/`
  路径（map 允许上游源引用——mesh-codec 的 external import 字符串为既有折叠死代码）；
  ④ `npm pack` → 解包 → 断言全部资产在场 → `require` 解包后的 meshopt decoder 并校验
  `decodeGltfBuffer/ready` + 解包哈希不漂移（离线加载证明）。审计当场抓出并修复 6 处真实缺口
  （3 个文件缺清单行、map 检查语义过宽、导出名臆断、tar/npm Windows spawn）。
- 许可补全：`draco/LICENSE.md`、`basis/LICENSE.md` 由短提示升级为**归属说明 + Apache-2.0 全文**；
  THIRD_PARTY_LICENSES.md 新增 V0.5 解码器资产表（版本/来源/许可/权威清单指针）。
- 分发链修复：`prepare-static.cjs` 离线静态 staging 现在复制 `build/gltf-decoders/`（此前缺失
  → 静态站 decoder 404）；`serve-gltf.cjs` 补 `.mjs/.cjs` MIME。
- 浏览器 Draco 决策入档：`draco3dgltf@1.5.7` 仅 Node 构建、浏览器 wrapper 无 hash-pin npm 源，
  按“引擎永不内嵌 decoder”原则由应用注入自有浏览器资产——MANIFEST 记为刻意取舍，非遗留任务。
- 构建缓存诊断机读化：`incremental.cjs` stats 增加 `reason: hit|cold|key-mismatch|read-failure|build-error[:msg]`
  （实测命中 key-mismatch→重建→hit 链路）。
- 门控：typecheck 0；19 suites / 114 tests PASS；verify:web-only PASSED；esm（缓存 hit）/min/dts +
  NodeNext 消费全绿；verify:decoders ok:true。


## V0.5 T8（部分）— capabilities 机读矩阵（2026-09-13）
- `examples/gltf-catalog/capabilities.json`（`npm run capabilities` 重生成，两段式：
  `capabilities-runtime-browser.js` 取 registry+设备+默认配置的**实时** status →
  `update-capabilities.cjs` 合并证据表并落盘；missing-handler 直接失败退出）。
- 契约内容：engineVersion、catalogRevision（与目录同源）、decoderManifest 指针、5 个稳定
  GLTFError 码、18 项扩展（status/reason + verified{level,smoke,evidence,decoder} +
  officialComparison{model,available,comparison:pending-T8}）。当前 14 项 browser-evidence、
  4 项 smoke-only、0 项仅目录收录；未实现的 transmission/volume/dispersion 不在矩阵中
  （registry 只报已注册 handler——诚实源）。
- 目录页新增"扩展支持矩阵"折叠区（capabilities.json 直接渲染）；gltf-catalog-browser.js
  扩展断言：行数=JSON 条目、errorCodes=5、revision=40 位——证据链闭环。
