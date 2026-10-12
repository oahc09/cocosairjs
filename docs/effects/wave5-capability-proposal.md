# Wave5：从十三例提炼能力

2026-10-11。依据九个效果与四个组合的当前 SDK 验收，提出六项能力候选。本批落实同源文档工具；其余条目是待实测的草案，不新增公共运行时 API。前置证据见[当前 SDK 刷新交付](current-sdk-refresh-delivery.md)，范围来自四级 Gate，不能当作本批优化成绩。

## 1. 参数定义与文档生成：tools

真实消费者：[Neon 参数类型](../../examples/shader-neon/src/parameters.ts#L25)和 [Input Dissolve 参数类型](../../examples/shader-input-dissolve/src/parameters.ts)。前者采用 `defaultValue/enum/updateMode`，后者采用 `default/values` 且缺更新模式。十二份 JSON 与 E01 TS 字面量合计 176 个参数；十三份参数 TS 合计 883 行（按文本换行计数，包括注释、空行与校验逻辑，不是可删除代码量）。

原先每个文档分别维护默认值与类型：

```ts
interface NeonParams { shape: 'circle' | 'rounded-box'; intensity: number; }
// 参数表和 Agent 文档另行抄写这些值。
```

本批工具的实际用法：

```js
const docs = require('../../tools/examples/shaders-effect-docs.cjs');
const definitions = docs.loadDefinitions();
docs.checkSourceContracts(definitions); // AST 类型键、API 来源、SDK 库存指纹
docs.write(); // 五个确定性产物；check() 只读复算
```

接口以工具导出为准，不添加 `createEffect`。适配层将 C04 route 标为结构变化、E09 `variant-or-uniform` 保守纳入 pipeline 键，并记录原 schema；现有例子不改。实际收益是五类文档共用来源、遗漏与漂移可拒收；没有测量节省的人工时间或 Agent token。工具仅在 Node 中读取、哈希和格式化，GPU 成本为零，不进入帧循环。Agent DX 收益待隔离 Benchmark，Agent Gate NOT_RUN。

## 2. 有身份的 SDF 与噪声片段：example-local / 生成工具

真实消费者：[Neon `distanceField`](../../examples/shader-neon/src/neon.frag#L23)、[Holographic `distanceField`](../../examples/shader-holographic/src/holographic.frag#L65)，以及 [Emboss SDF](../../examples/shader-emboss/src/emboss.frag#L16)。

原先在多个 shader 中分别写解析距离和域变换；可提取的草案只限解析 primitive：

```glsl
// Before: 每例独立声明 circle / rounded-box 解析距离。
float distanceField(vec2 p) { /* 原例的域变换和解析距离 */ }
// After 草案：域变换及 stencil 留在各例，片段只给明确的 primitive。
float airExampleCircleDistance(vec2 p, float radius);
float airExampleRoundedBoxDistance(vec2 p, vec2 halfSize, float radius);
```

API 草案属于构建时片段命名，不是 SDK 函数。Neon 五点 stencil、Holographic 前向 stencil、Emboss 中央差分的 eps 和法线必须保留，CPU oracle 继续独立实现，不从同一 GLSL 生成。噪声片段必须标注 MaterialX lookup3/u32/许可及固定数值金标；Liquid Metal 的 mx Perlin 替代不能改称 Fi-hash 等价。

尚未提取该片段，CPU/GPU 增量及代码减少量 NOT_RUN；仅源码合并通常不会减少求值次数，不能据此许诺帧率提升。Agent DX 的目标是减少算法误认，仍需独立验证。归属保持 example-local，两个消费者的实际数值回归成立后再考虑生成工具，不进入 core。

## 3. 颜色、预乘和 RGBA8 存储合同：文档 / 测试

真实消费者：[Emboss 预乘输入](../../examples/shader-emboss/src/emboss.frag#L78)和 [Glass `unpremultiply`](../../examples/shader-glass/src/glass.frag#L25)；[Film Neon 合成](../../examples/shader-film-neon/src/film-neon.frag)也需要 HDR 与小正 alpha 保留。

```glsl
// Before: 各例维护安全逆预乘、显示编码和存储量化。
vec3 straight = stored.a > 0.0 ? stored.rgb / stored.a : vec3(0.0);
// After 草案：明确语义的测试/片段，格式边界仍由调用者决定。
vec4 unpremultiplyLinearStoredRGBA8(vec4 stored);
vec3 encodeStraightLinearForDisplay(vec3 straight);
```

草案不能统一改变每例 alpha 阈值或算法 clamp；RGBA8 量化已经丢失的 RGB 不能靠 inverse 恢复。对固定格式先钳位再混合、一次 OETF、零 alpha 与 `1/255` 的测试合同先复用，生产 shader 不在本批改动。

实测基础是前置 Gate 的 GPU readback 与 compositor 双证明；没有本批颜色融合前后性能对照。预期工具层测试不增加运行时开销，但抽函数本身不保证 shader 少指令。Agent DX 目标是避免 double-premultiply/OETF，NOT_RUN。归属文档、测试和显式例子片段，不增加默认 tone mapper。

## 4. RT 两种解绑与资源退役：Recipe / 现有 bridge

真实消费者：[Emboss attach/bind](../../examples/shader-emboss/src/main.ts#L165)和 [Glass attach/bind](../../examples/shader-glass/src/main.ts#L165)，两者各保存相机解绑与 sampler 解绑；[现有生命周期 bridge](../../examples/shared/shader-lifecycle.ts#L51)已有多例消费者。

```ts
// Before: 每实例分别维护这两项所有权。
const detach = target.attachCamera(camera);
const unbind = target.bindColor(material, 'childTexture');
// After 草案：Recipe 返回独立操作，不隐藏原生 target。
const owned = { target, detach, unbind };
// renderer 解绑之后：owned.unbind(); owned.detach(); owned.target.dispose();
```

候选 API 是 example-local 所有权记录 `{target, detach, unbind}`，不是新的 RenderTarget 类。当前已有 bridge 与 Emboss `child-rt-release.ts`，应先完善 Recipe，避免再建通用管理器。幂等终态和 refs 1→0 必须从真实对象观测，借用资源不释放。

两消费者普通管线均为两 pass；Recipe 不改变该数量。前置证据有实际重复退役，未做本批抽取的释放时延/GPU 内存前后对比，物理 GPU 显存仍 unavailable。Agent DX 目标是避免把 bindColor 回调当 camera detach，NOT_RUN。归属文档/现有 bridge，不新增 core API。

## 5. Effect Driver：独立 Pilot

真实消费者：[Neon `update`](../../examples/shader-neon/src/main.ts#L196)与 [Holographic `update`](../../examples/shader-holographic/src/main.ts#L187)，均在原生主循环驱动时间与 uniform；两例各有自己的 `sync`，是草案映射的目标，不在本批替换。

```ts
// Before: 每例主循环明确累加时间，再写自身 uniform。
function update(dt: number) { /* 本例时间语义、pause 与 sync */ }
// After Pilot：本例已有的纯函数，主机显式调用，无内部 RAF。
import { createDriverState, driverFrame } from './driver.js';
import { defaultBindings, consume } from './consumer.js';
const state = createDriverState();
const values = driverFrame(state, { deltaTime: dt, pointer }, defaultBindings('neon'));
const used = consume('neon', values);
// 宿主以完整母 uniform 布局上传 used.params，单独退役自有资源与监听。
```

草案须覆盖 pointer-position/x/y、time、auto-animate、map-range 和 listener 释放。Neon 闪烁/流动和 Holographic `time * speed` 重映射不应被统一改变。静态文本检查 Neon 与 Holographic 各有 8 与 4 个 `.setProperty(` 调用点，包含诊断与设置路径，不是每帧 API 次数；不能用这个数预测 CPU 节省。

Driver 已完成[两个实际消费者的冻结候选六门验收](driver-pilot-validation-delivery.md)：84视觉、180边界、96非法输入、1200资源循环、12活resize、18性能窗和5853稳态帧。105项Node合同、34项真实报告篡改及7项Gate篡改全部通过或正确拒收。每帧独立重放原始输入并核对 Material.getProperty 回读；原生节点位移经过真实GPU验证。实测插桩 update 中位数0.20–0.28ms，没有无Driver对照，不宣称CPU节省。Agent DX收益仍NOT_RUN；归属example-local，无core草案晋级。当前SDK freshness因并行重建BLOCKED，与候选验收分开。

## 6. UV Remap / Pass Fusion：两个受限 Pilot

消费者与候选一：[Emboss 输入扭曲](../../examples/shader-emboss/src/emboss.frag)与 [Laser Card Emboss 阶段](../../examples/shader-laser-card/src/emboss_stage.frag)。候选二：[Glass 镜头采样](../../examples/shader-glass/src/glass.frag)与 [Glass Trail 子纹理采样](../../examples/shader-glass-trail/src/glass_stage.frag)。

```glsl
// Before: child camera -> premultiplied RGBA8 RT -> sample childTexture(uv).
// After 草案：仅当输入确为可内联的纯程序函数时，在相同纹素域采样。
vec4 sampleProceduralStoredTexel(vec2 remappedUV); // 显式复制量化、clamp、nearest、纹素中心
vec4 evaluateEmbossWithSampler(vec2 uv);
vec4 evaluateGlassWithSampler(vec2 uv);
```

API 草案为例子 shader 的采样边界，不是函数指针式 GLSL runtime。Emboss 与 Glass 各自的真实场景子相机、外部纹理、动态 Trail 上传不能随意内联；不满足输入条件时保留原双 pass。母算法 stencil、遮罩、Vogel taps、预乘/量化不得删减。独立 CPU oracle 必须继续从原始规则计算。

两个受限 Pilot 已完成[独立六维验收](uv-fusion-pilots-validation-delivery.md)：144视觉、1656边界、1200资源、12resize、36串行性能窗、11684稳态帧；38类真实报告变异全拒。两个完整母 shader 仅替换程序 child sampler，固定 texel-center/NEAREST/CLAMP/预乘RGBA8存储链不变；72对全图逐通道比较最大差2、超差0，另有独立母CPU数学与透明RT读回，不单凭截图判定正确。

实际每帧 pass/draw 均2→1，少一张256²RGBA8 RT，`device.memoryStatus.textureSize` 精确减少262144bytes。三引擎CPU render envelope中位数下降，但CPU update无一致改善。RTX4060上 Chromium Glass GPU中位耗时反而增加6%–63%；Emboss在720p/mobile也增加约18%–28%，1080p约降2%。Firefox/WebKit GPU query不可用，不能借CPU结果代替。原始CPU方法包络包含立即GL dispatch，不称纯编码时间。

裁定：保留为明确的CPU/纹理内存取舍选项，不开启默认自动融合，不新增core API。Generic CompositionIR还缺可重算性与成本决策，列PERFORMANCE_GAP；不主张SDK缺陷。真实场景/图片/历史反馈/动态Trail继续需要中间纹理。前置W4的54性能窗只证明旧管线；本次决策来自独立新Pilot，不能继承旧性能成绩。

## 本批取舍

能力1已落地生成工具；能力5的Driver冻结候选已实际验收；能力6的两个受限融合Pilot已在各自冻结SDK下实际验收，性能取舍据实记录，保持example-local、可选使用。其他候选保留草案，不因静态重复就新增core API。现有问题按AGENT_FAILURE / DOC_GAP / API_DX / PERFORMANCE_GAP分类；并行SDK构建导致的字节漂移另列INFRA_FAILURE，不主张ENGINE_BUG。Agent Gate仍NOT_RUN；Wave5当前SDK总Gate仍BLOCKED。
