# Web 引擎实质更新监控｜2026-11-25

- 执行开始：2026-11-25 23:35:37（Asia/Shanghai，UTC+08:00）。
- 检索窗口：以上一期 2026-11-18 报告及可获得的 23:29 左右检查记录为基线，扫描至本次执行开始；对 11 月 18 日发布记录适当重叠复核，合并 PR 检索覆盖 11 月 19–25 日（UTC）。
- 范围：three.js、Galacean、PixiJS、BabylonJS、LayaAir；延续已增加的 PlayCanvas、Phaser 4 和 R3F、Orillusion、WebGPU Samples 专项观察。各来源的覆盖边界见末节。
- CocosAirJS 核对快照：[`main @ ed38648d1a4c00e83d519eaf152879c65ae4cbe5`](https://github.com/oahc09/cocosairjs/commit/ed38648d1a4c00e83d519eaf152879c65ae4cbe5)，提交时间 2026-11-22 UTC；上期专项 [PR #21](https://github.com/oahc09/cocosairjs/pull/21) 已合入。其自述验收证据不等于本轮重新执行。未修改代码、依赖、基线或部署。

## 结论

本期最重要的是：① GLSL→WGSL 转译路线的长期风险；② Galacean 资产反序列化安全与所有权；③ three.js 多入口单实例与 LightProbe 迁移；④ 深度约定及透射/OIT Pass 隔离；⑤ PixiJS WASM 释放与 WebGPU 能力协商；⑥ Spark 在移动 GPU 上的插值性能；⑦ Bloom、物理光照及 GPU 时间口径。LayaAir 3.4 的 WebGPU Uniform 合并上传为新增待核查线索，而非已验证性能成果。

## 1. 版本与发布边界

| 项目 | 已核对的状态 | 日期、依据 |
|---|---|---|
| three.js | r187 仍是官方最新 Release；本期重要变更已合并 dev | [r187](https://github.com/mrdoob/three.js/releases/tag/r187)，2026-10-30；未将 r188 里程碑当成发布 |
| Galacean | v1.6.14 非预览 Git tag 已存在，包含反序列化修复；npm 实际发布尚未独立确认 | [tag](https://github.com/galacean/engine/tree/v1.6.14)，2026-11-20 08:56:14 UTC，指向 [e2c7c3ea](https://github.com/galacean/engine/commit/e2c7c3ea342a76e9438048fac292726e58d46c68)；对应 GitHub Release 查询 404。dev/2.0 的 alpha.66 等仍是预览 |
| PixiJS | v8.23.0 仍为最新正式 Release | [v8.23.0](https://github.com/pixijs/pixijs/releases/tag/v8.23.0)，11-11；本期修复在 dev |
| BabylonJS | 9.37.2 正式发布 | [9.37.2](https://github.com/BabylonJS/Babylon.js/releases/tag/9.37.2)，11-23 15:19 UTC，087c792 |
| LayaAir | LayaAir_3.4 稳定系列源码分支有提交；未证实新的正式二进制发行 | [3.4 分支](https://github.com/layabox/LayaAir/tree/LayaAir_3.4)，11-25 f9f907636c；正式 tags/releases 读取受限 |
| PlayCanvas | v2.24.3 正式发布；重叠窗口 v2.24.2 含上期已报的纹理共享 | [2.24.3](https://github.com/playcanvas/engine/releases/tag/v2.24.3)，11-23 12:55 UTC，2e89103；[2.24.2](https://github.com/playcanvas/engine/releases/tag/v2.24.2)，11-18 |
| Phaser | v4.2.1 仍是所见最新正式 Release | [v4.2.1](https://github.com/phaserjs/phaser/releases/tag/v4.2.1)，07-09 |

下文日期均为官方 PR 合并或 Release 日期（UTC），不是新闻转载日期。除注明正式版本外，合并至开发分支的变化只作为开发态事实；没有独立运行测试。

## 2. P0：PlayCanvas 对 GLSL→WGSL 转译发出弃用警告

**处置：借鉴、验证；先制定长期 Shader 资产策略，不立刻移除当前转译链。**

- 已验证事实：2026-11-19 [#10089](https://github.com/playcanvas/engine/pull/10089) 合并 main，`3d8382c5`。与 v2.24.3 比较为分叉，未包含于该正式 tag。当前仍可转译；V3 移除是项目未来计划，不是已发布功能。`createGraphicsDevice` 的 `glslangUrl`/`twgslUrl` 进入弃用警告；`ShaderMaterial` 的 `vertexWGSL`/`fragmentWGSL`、`LitMaterial.shaderChunkWGSL` 成为 WebGPU 迁移重点。
- Examples 证据：PR 文件清单包含 `examples/src/examples/shaders/point-cloud/`、`point-cloud-simulation/`、`integrations/loaders-gl/` 的成对 GLSL/WGSL 实现，以及 `test/shader-compile` 的 WGSL chunk override。可查看 [固定提交下 point-cloud](https://github.com/playcanvas/engine/tree/3d8382c5eb4f4f455fab96bbd8a79a9667a2eb8b/examples/src/examples/shaders/point-cloud)。
- CocosAirJS 已核源码文档：[WebGPU 部署指南](https://github.com/oahc09/cocosairjs/blob/ed38648d1a4c00e83d519eaf152879c65ae4cbe5/docs/guides/webgpu.md) 明确当前依赖冻结的 glslang/twgsl JS/WASM，默认 WebGL2 不加载这些资产。该事实不意味着当前转译错误。
- 技术推断：可以研究在现有材质/Effect API 内建立 GLSL 与 WGSL 双目标产物、统一 binding 布局、错误定位和离线缓存，而非每个 Agent 手写不同的 Shader 接口。先保留既有 GLSL 兼容路径。
- 待验证：选 3 个程序化效果（点云/粒子、PBR、透明折射），固定 uniforms、DPR、分辨率和相机。比较转译 WGSL、原生 WGSL、WebGL2 GLSL 三路的首次编译时间、WASM 加载/体积、错误定位、图像误差。目标：每个已声明支持的路径真实编译并绘制，0 GPU Validation Error；像素误差门限在运行前预登记。Engine Gate 先行；Agent Gate 再检查能否稳定生成两目标的正确代码。不得改默认后端。

## 3. P0：Galacean 资产反序列化与资源所有权

**处置：验证安全边界和对象生命周期，只有发现缺口才修复。**

- 正式源码 tag：[ #3218](https://github.com/galacean/engine/pull/3218) 11-20 合并 main，`031cd310`。GitHub compare 确认 v1.6.14 包含该提交（ahead 1、behind 0）。收紧场景、Prefab、Material、子资源查询的反射/属性写入边界，拒绝危险成员、未允许的类/方法与宿主对象访问；失败时销毁半成品并阻止异步回写。上游报告 34 个相关 Chromium 用例通过，非本轮实测。
- 开发态：[ #3239](https://github.com/galacean/engine/pull/3239) 11-24，dev/2.0，`77a35335`。`ReferResource` 区分使用引用和容器归属链；`GLTFResource` 释放模板实体；在途加载不暴露未就绪资产并受 GC 保护，增加 `ResourceManager.unregisterVirtualResources`。重要路径 `packages/core/src/asset/ResourceManager.ts`、`ReferResource.ts`、`packages/loader/src/gltf/GLTFResource.ts`。
- 开发态：[ #3235](https://github.com/galacean/engine/pull/3235) 11-21，dev/2.0。ShaderProperty 的类型与组由单值锁定改为位掩码记录，容许不同材质重用 uniform 名称且保持不同绑定语义；不是要求 CocosAirJS 复制同一 API。
- CocosAirJS 影响：重点审计加载外部/Agent 生成资源时的 schema、可执行行为边界、缓存和引用关系；避免把仅支持的数据输入误当任意反射对象。上期 PR #21 已增加 glTF 纹理共享实验且默认保留每个纹理索引的可变对象身份，不重复增加共享默认行为。
- 验收：正常资产冷/热加载应一致；非法字段/类型、未注册目标和越界查询必须明确拒绝且不修改宿主状态；在途加载与清理交错、取消后晚到回调、两实例共享材质及依赖销毁按所有权执行。循环 50 次，清理后受测资源计数回到预登记基线；任何合法活跃资源不得提前释放。两个独立材质使用同名不同类型 uniform 时绘制 A→B→A，禁止错误绑定或静默串扰。独立消费者失败与引擎回归分开归因。

## 4. P0：three.js 模块身份、显式 UV 与 LightProbe 迁移

**处置：验证 SDK 入口、保持参考版本冻结；补充迁移测试。**

- 11-23 dev：[ #35668](https://github.com/mrdoob/three.js/pull/35668) 新增 `three.nodes.js`，使 `three.webgpu.js` 与 `three.tsl.js` 共享同一节点实现；解决 r187 在某些 CDN `.min.js` import-map 组合下重复加载 TSL、Shader 构建失败的问题。[ #35670](https://github.com/mrdoob/three.js/pull/35670) 移除独立 `three.webgpu.nodes.js` 构建。不在已发布 r187 中。
- 11-23 dev：[ #35669](https://github.com/mrdoob/three.js/pull/35669) 新增 `textureMatrix(texture)`；UV 矩阵现在只自动作用于默认 UV。显式 `.sample(uv)`、`.load(coords)` 等路径的旧不一致被消除；`setUpdateMatrix()` 弃用且无效。显式 UV 要手动应用矩阵。
- 上期 #35580 的间接光变化有后续实质迁移：11-19 [#35614](https://github.com/mrdoob/three.js/pull/35614) 从间接高光去除 LightProbe，随后 [#35615](https://github.com/mrdoob/three.js/pull/35615) 移除旧 LightProbe renderer/shader 支持，保留弃用兼容壳（不再等价渲染）；推荐 `LightProbeGrid` 或 `Scene.environment`。单探针网格只照亮自身体积。#35615 修正单轴探针网格 bounds 和 WebGL 网格 intensity。开发态，不应提前当作 r188 发布。
- CocosAirJS 现状：PR #21 已用固定 Three 提交验证 #35580 与 LightProbe 间接高光回退对照，保持 Three 0.186.1 基线；未完整覆盖旧 LightProbe 支持移除、单探针网格边界与强度的新迁移。
- 验收：SDK npm tarball、静态 import map、min/unmin 混合入口分别验证单一运行时身份（实例类型/模块加载记录）、真实 Shader 绘制、无第二份核心运行时；显式 UV 与默认 UV 使用带偏移/旋转/缩放的测试图，独立数学参考判定像素。光照使用纯金属/介质、无环境贴图和有环境贴图、1×1×1 网格内外点及不同 intensity；避免把体积限制误判为物理材质差异。独立记录 r187、dev SHA 和旧冻结版本的结果，不覆盖 Golden。

## 5. P0：深度精度、透明渲染 Pass 与资源绑定

**处置：验证 Reverse-Z 技术边界，不修改默认投影或深度规则。**

- BabylonJS [#19209](https://github.com/BabylonJS/Babylon.js/pull/19209)，11-25 合并 master，`04b9cd0f`，晚于 9.37.2。新增 WebGL `useNDCHalfZRange`，通过 `EXT_clip_control` 选择 [0,1] NDC 深度；无扩展保持 [-1,1]，`engine.isNDCHalfZRange` 报告实际状态。和 `useReverseDepthBuffer` 独立；浮点深度 attachment 才有完整精度收益，默认 framebuffer 格式不随之变化。流体/体积光/高斯体素化 Shader 需跟随深度约定。上游报告 82 个单测、20 个 GLSL 变体及 Chromium 烟测，未独立复跑。
- PlayCanvas [#10013](https://github.com/playcanvas/engine/pull/10013)，11-24 合并 main，`429141c8`，不在 v2.24.3（compare 分叉）。新增默认关闭的 `CameraComponent#reverseZ`，仅 WebGPU 生效，XR 不应用；每相机反转投影、clear depth、比较函数和 bias、`REVERSE_Z` shader variant；读取相机深度的后续功能尚未全部纳入。
- 实际源码 Example：[`examples/src/examples/test/reverse-z/example.mjs`](https://github.com/playcanvas/engine/blob/429141c8d2f58c315c7e0bfc8e4cc3bfe5d593d0/examples/src/examples/test/reverse-z/example.mjs) 并排渲染标准与反转深度，距离 1 m–300 km，近面 0.1，分别选择 16 位固定、24 位+stencil、32 位浮点深度；几何间距随距离调整，避免把 float 顶点精度当深度精度。
- BabylonJS [#19210](https://github.com/BabylonJS/Babylon.js/pull/19210)，11-20 合并，已进入 11-23 正式 9.37.2。透射背景离屏 pass 在 OIT 开启时错误调用 depth peeling，导致绑定错误 framebuffer；新行为只跳过该背景 pass 的透明阶段，主相机仍用 OIT。上游在 DragonAttenuation.glb 复现并报告修复。[#19053](https://github.com/BabylonJS/Babylon.js/pull/19053) 同版修正多个 MaterialPlugin 的 shader key 与 UBO layout 匹配，禁用 plugin 也可能占用 UBO。
- three.js [#35678](https://github.com/mrdoob/three.js/pull/35678)，11-23 dev：ping-pong bind group 销毁后，必须从所有使用过的 texture 反向引用中移除，而非只移除当前 texture。
- CocosAirJS：PR #21 已合入 WebGPU MRT 部分 clear 及隔离探针，真实浏览器 WebGPU adapter 不可用导致相应验收仍 BLOCKED；Dawn/SwiftShader 是软件证据，不替代真机。不能假设有 OIT，也不能把不存在的 OIT 直接当缺陷。
- 验收：固定一组近远重叠平面，普通/Reverse-Z、不同深度格式、EXT_clip_control 可用/不可用分别采样错误遮挡像素。加入线性深度重建、阴影、雾、折射、相机 A→B→A 和上下文失败路径；不支持时按合同明确拒绝或声明回退。透明背景 pass 不应错误进入透明阶段；若当前无 OIT，则单独只测已有透射与多 Pass。绑定清理用 A/B 纹理交替并销毁资源，要求 0 GPU validation error、无错误像素及无残留引用。

## 6. P0：PixiJS WASM 释放、宿主能力检测与 WebGPU Limits

**处置：验证现有路径，避免重复实现。**

- 11-20 dev [#12411](https://github.com/pixijs/pixijs/pull/12411)：`src/compressed-textures/ktx2/worker/ktx.worker.ts` 和 `basis/worker/basis.worker.ts` 显式释放 Embind 对象，KTX2 调用 `delete()`、Basis 调用 `close()`/`delete()`。上游在同一个 2048×2048 UASTC+Zstd KTX2 的 100 次转码中报告 WASM heap 632 MB→25 MB（不是 GPU 内存，也不是本轮测试）。WASM heap 高水位不能仅靠 JS GC 降回初值。
- CocosAirJS 实际源码：[src/air/assets/gltf/decoder/ktx2.ts](https://github.com/oahc09/cocosairjs/blob/ed38648d1a4c00e83d519eaf152879c65ae4cbe5/src/air/assets/gltf/decoder/ktx2.ts) 第 193–195 行已有 `finally { try { file.close(); } finally { file.delete(); } }`。因此不应重复提交该修复；重点是异常、转码失败、其他 decoder provider/worker 和真实堆高水位是否稳定。
- 11-20 dev [#12409](https://github.com/pixijs/pixijs/pull/12409)：Safari 视频上传能力检测从模块 import 延迟到首次上传；[#12431](https://github.com/pixijs/pixijs/pull/12431)、[#12432](https://github.com/pixijs/pixijs/pull/12432)、[#12433](https://github.com/pixijs/pixijs/pull/12433) 分别处理 OffscreenCanvas 无 DOM overlay 锚点、`measureText` 存在却不可用、CSP 禁止 Worker/worker 启动错误后的回退。不是宣称所有 PixiJS API 都支持 Worker/SSR。CocosAirJS 主入口仍 browser-only；PR #21 仅验证独立 Node math。
- 11-20 dev [#12414](https://github.com/pixijs/pixijs/pull/12414)：`GpuDeviceSystem` 显式请求适配器报告的 `maxBufferSize` 和 `maxStorageBufferBindingSize`，而非只取得 WebGPU 规范默认 256 MiB/128 MiB。大于上限的 allocation 必须失败，不能因为请求了上限就假设内存足够。 [#12434](https://github.com/pixijs/pixijs/pull/12434) 新增 `tileBasedGpu` 显式 override，默认仍使用 vendor 推断；设备恢复后也保留配置。
- 验收：同样 KTX2 连续 100 次、成功/失败/取消交错，记录转码器创建/销毁计数和 WASM heap 高水位，预热后不得出现与循环次数线性增长的持续泄漏。能力检测采用实际调用而非存在性检查；CSP 禁止 blob worker 用可控 fixture 验证 Promise 终态。WebGPU 使用 adapter/device 双层 limits 检查，测试超限失败及可支持分块路径（避免盲分配数 GiB）。TBDR 抗锯齿测试比较 store/load 与 discard/restore 的像素和 GPU 时间，不能按厂商名硬编码普遍性能收益。

## 7. P1：Gaussian Splatting 释放与浮点 varying 的移动 GPU 性能

**处置：借鉴 Spark 专项性能实验。**

- PlayCanvas 2.24.3 正式包含 [#10112](https://github.com/playcanvas/engine/pull/10112)，11-23：`gsplatVS`、`gsplatPS`、`gsplatHybridVS` 不再对 `gaussianColor`、`id`、`vLinearDepth` 等每 splat 浮点 varying 使用 flat；整数 varying 仍保持 flat。上游报告合成场景中 M1 Max WebGPU GPU 时间约下降 36%、A16 约下降 35%，M4 Max 则约增加 3%；不同架构方向不一致，非 CocosAirJS 实测。
- three.js [#35608](https://github.com/mrdoob/three.js/pull/35608)，11-19 dev，增加 `GaussianSplat.dispose()` 与 `CountingSort.dispose()`，防止示例反复切换资产残留内存；[#35611](https://github.com/mrdoob/three.js/pull/35611) 同日向 [`examples/webgpu_gaussian_splat.html`](https://github.com/mrdoob/three.js/blob/ea0058575584411f123bb0e00cf0c56e0909f5ce/examples/webgpu_gaussian_splat.html) 加入 Splat Lab SPZ v4；固定源码确认切换时调用 `splats.dispose()`。该资产须另核许可证，不自动纳入项目资产包。
- CocosAirJS 潜在影响：Spark 是可选模块，不应为此增大默认 bundle；先核查现有 varying 声明、CPU/GPU 排序资源生命周期和 SPZ 版本支持。不能仅凭其它引擎代码宣称 Spark 具有相同缺陷。
- 验收：同一 10 万/50 万/100 万 splats、固定相机轨迹、像素覆盖与排序方式；固定 GPU、后端、分辨率，比较 float flat/非 flat 变体及整数 varying 不变控制组，记录 GPU P50/P95、带宽代理、图像误差与排序稳定性。至少一台较早 Apple GPU、一台新 GPU、一台移动 Mali/Adreno（可用时）；不同机器结果分别报告。循环换资源 20 次，检查 worker、GPU buffer/texture 创建与销毁。没有硬件结果标 NOT_RUN/BLOCKED。

## 8. P1：Galacean Bloom、物理光照与实验 SSR

**处置：研究移动端后处理；只在独立图像与性能证据通过时考虑落地。**

- [#3211](https://github.com/galacean/engine/pull/3211) 11-21 dev/2.0：Bloom 从 H/V 两阶段下采样改为 9-tap 单阶段下采样、原位混合上采样。6 层时上游报告 16→11 passes。`BloomDownsample.glsl` 处理奇偶 mip 尺寸的采样一致性。实际 GPU 时间改善依赖设备、其它 pass 数与带宽，不从 pass 数直接推导帧率。
- [#3244](https://github.com/galacean/engine/pull/3244) 11-23 dev/2.0：点光/聚光从近乎平坦的范围窗，改为带范围窗的逆平方衰减，`getDistanceAttenuation(distanceSq, cutoffDistance)`；涉及 `Light.glsl`、`LightDirectPBR.glsl`、`MobileBlinnPhong.glsl`，无限范围与非法参数处理也变化。未进入稳定版。
- [#3232](https://github.com/galacean/engine/pull/3232) 11-21 合并 `experimental/engine-next`（不是 dev/2.0 或正式主干）；移动 SSR v2 使用前置追踪、历史 Color Pyramid、Hi-Z、Temporal Resolve、Stencil 和低端格式回退，源材料说明保留实验边界。只列研究，不进入默认发布承诺。
- 验收：Bloom 使用单像素高亮点、奇偶 RT 尺寸、HDR 能量及移动相机；固定亮度参考、同层数比较 pass、RT 峰值、GPU 时间和闪烁误差。点光距离 2/4/8 m、范围截止与 Infinity，使用独立 CPU 公式对照线性读回而非 tone-mapped 像素；禁止未经授权修改既有 PBR 默认行为。SSR 单独用水体、前景细枝、相机切换和历史清理用例观察漏反射及 ghosting。无真实运行结果不晋级。

## 9. P1：GPU 时间统计口径与压缩模型 Examples

**处置：验证 Benchmark 测量，并借鉴最小示例组织。**

- three.js [#35684](https://github.com/mrdoob/three.js/pull/35684) 11-24 dev：Inspector 保留 GPUTimer 实际 timestamp，顶层时间区间取并集而非简单相加，WebGL 使用合计回退；父区间不等于实际 GPU 忙碌时间，去除没有物理意义的 CPU+GPU 时间求和。PR #21 已验证上期 #35519 的软件 timestamp pool 对照，本期仅补并集/覆盖语义，不重复改旧基线。
- 验收：对固定人工区间 [0,4]、[2,6]、[8,9]，pass sum=9、union=7、elapsed span=9（时间单位任意）；独立校验 overlap、nested、invalid/unavailable、0 时长、乱序、跨帧绑定。union 不是 GPU occupancy；WebGL fallback 单独标记。锁定同一批原始时间戳，CPU、GPU sum、GPU union、GPU span 和 compositor 时间不得混算。Engine Gate 使用已知正确任务和计时参考；Agent Gate 不把测量基础设施失败计作生成失败。
- PlayCanvas [#10092](https://github.com/playcanvas/engine/pull/10092) 11-19 合并，已进入 v2.24.3；实际读取 [`examples/src/examples/loaders/compressed-meshes/example.mjs`](https://github.com/playcanvas/engine/blob/v2.24.3/examples/src/examples/loaders/compressed-meshes/example.mjs)。同一模型未压缩/meshopt/Draco 三份对照，`WasmModule.getInstance('DracoDecoderModule')` 预加载，`meshoptInitialize({url})` 首用加载；示例展示文件大小、解码顶点数及三角形数。上游资产 Stanford Dragon 有使用条件，复用前核许可或换自制资产。
- CocosAirJS 已有 glTF 解码器入口；无需重新实现 loader。建议补充一组自制或授权明确的三格式对照，冷/热加载、离线 WASM 部署、失败恢复、解码后 bounds/triangle count、画面与资源清理。顶点数量可能因编码方式而不同，不能强行要求三者字节一致；几何/像素容差应事先确定。

## 10. LayaAir：WebGPU Uniform 合并上传（待核查）

- 已验证事实：LayaAir_3.4 分支 11-25 [f9f907636c](https://github.com/layabox/LayaAir/commit/f9f907636cd8823784f500fb14972cb3cfc40599) 标题为 merged uniform uploads；真实 diff 仅将 `src/layaAir/laya/RenderDriver/WebGPUDriver` 子模块指针从 `5a253ce6ca6ea7250fad1ad67a7fe2d87aef6408` 更新到 `e5c7171eef8d1af0a3869005c78d7262b096da6d`。`.gitmodules` 指向 `layabox/WebGPUDriver`；子模块 commit/compare API 返回 404，未取得内部源码，不能确认具体算法、API 或性能收益。
- [官方 3.x 文档](https://layaair.com/3.x/doc/)、[API](https://layaair.com/3.x/api/)、[Demo](https://layaair.com/3.x/demo/) 已访问；API 与 Demo 动态内容无法完整解析，不能声称全面检查。对 3.4 与 Master3.0 的 `src/samples` 增量历史检查未返回新源码提交。
- 处置：列待核查线索，不计为本期已核实实现。可独立研究 CocosAirJS 的 UBO dirty ranges、对齐/重叠写入及连续局部写合并，使用固定 1000 draw 场景对比 writeBuffer 调用数、字节数、CPU 时间及真实像素；只基于自身复现作决定。

## 11. CocosAirJS 实施建议（仅建议，非开发任务书）

| 优先级 | 本期最小增量 | 已知边界/验收 |
|---|---|---|
| P0 | Shader 双目标与模块身份 | 现有 glslang/twgsl 保持；3 个代表效果/多入口单实例 |
| P0 | 资产输入安全、引用所有权及 UBO 布局 | 合法输入不回归，非法输入安全拒绝，失败清理，A→B→A 像素 |
| P0 | 深度/透射/绑定隔离 | 不改默认；真 WebGPU MRT 缺口继续保留 BLOCKED |
| P0 | decoder WASM 和设备能力审计 | KTX2 已有 finally，补验证而非重复修复 |
| P1 | Spark 插值、资源销毁 | 设备分组，图像、时间与资源数齐备 |
| P1 | Bloom/物理光照/SSR 研究 | 先独立参考与移动 GPU 证据；不默认升级 |
| P1 | Benchmark 时间语义、纹理 UV 和 LightProbe 迁移 | 冻结参考，独立新实验，严禁重置原 Golden |
| 待核查 | LayaAir uniform 合并上传 | 子模块源码未取得，不声称复现 |

## 12. 去重、独立 Examples 检查和证据说明

- 上期 11-18 已报的 glTF 纹理共享、Pipeline 预编译、MRT、Headless、GPU timestamp pool、程序化整数 hash、crowd 等不重复作为新增事项。PlayCanvas v2.24.2 对纹理共享的正式落地只是状态更新；CocosAirJS PR #21 还报告每索引纹理身份默认保持、显式试验的 101→2 uploads（不等于显存或速度收益），本轮未复测。上期 Three 间接高光变化的本期后续是实际旧 LightProbe renderer 支持移除。
- 独立 Examples 检查：调用官方仓库提交历史的 path 筛选与 PR 文件列表，并读取上述 PlayCanvas reverse-z / compressed-meshes、three.js Gaussian Splat Example 固定源码。three.js `examples` 同期还有 AO/SSR/SSGI jitter、材质反射修正，未逐一追加独立提醒；Galacean main examples 只见 1.6.14 版本更新，dev/2.0 见光照/格式变化及 alpha 版本提交；PixiJS/examples main、Phaser/examples master、WebGPU Samples sample、LayaAir src/samples 和 BabylonJS `packages/tools/playground` 查询未返回窗口内提交。这些路径结果不证明所有外部在线 Playground、动态站点示例均未改变。
- Phaser 核心及 R3F、Orillusion 查询未返回窗口内默认分支提交或合并 PR；不凑数。WebGPU Samples 专项 PR 与 sample 路径未返回新条目。各源未获取完整独立在线示例库存，不能将局部检索宣称全覆盖。
- 证据等级：上述 Release/tag、PR base/merge metadata、比较关系、文件路径、已读取的固定源码属于已验证事实；性能及测试数字仅为上游或 CocosAirJS 历史 PR 所报告，非本轮独立运行验证。所有 CocosAirJS 建议均为技术推断或待验证，除已明确引用源码/历史 PR 的状态外，不确认存在缺陷或已通过。
- 本轮未执行 CocosAirJS 本地构建、浏览器/GPU 运行、Benchmark；无代码、依赖、发布或基线变动。普通持续监控继续，不扩大项目实施权限。
