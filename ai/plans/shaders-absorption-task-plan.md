# CocosAirJS × shader-effects-inc/shaders 借鉴吸收任务计划书

> 上游基线：`shader-effects-inc/shaders`，commit
> `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，`shaders v4.0.1`（2026-10-07）。
>
> 目标：筛选吸收其效果算法、效果定义、组合优化、Agent 文档与验证思想，以
> CocosAirJS 原生能力重新实现并反向验证引擎 API。不是移植完整
> runtime，不引入 TypeGPU/WebGPU-only 硬依赖。

## 1. 总目标

必须完成： - 9 个首批原生效果； - 至少 4 个组合效果； - Effect Contract
与参数验证； - Effect Driver Pilot； - SDF / Noise / Color / UV
等公共能力评估； - Effect → API → Example → Recipe → Validation
证据链； - 独立 Engine Gate 与 Agent Gate； - API Gap / DX Gap /
Performance Gap 报告； - 明确哪些进入正式 API，哪些保留为
Pattern/Recipe/example-local utility。

不得以"能显示类似画面"作为完成标准。

## 2. 边界

不直接嵌入 `shaders` runtime、TypeGPU、额外 WebGL/WebGPU canvas 或
iframe；不复制框架绑定、shaders.com 编辑器/云 API/MCP/平台
presets；不一次性移植全部效果；不改变 CocosAirJS 既定后端策略；不把
cataloged/documented 当 verified；不把截图相似当算法正确。

每个参考效果建立 `UPSTREAM.md`，记录：

``` text
upstream_repo
upstream_commit
upstream_file
license
algorithm_ideas_adopted
implementation_differences
cocosairjs_apis_used
```

直接改写或派生 MIT 源码时保留许可证要求的信息。

## 3. 实施原则

1.  **CocosAirJS 原生实现**：绕过引擎的实现不得计入能力验证。
2.  **先实现再抽象**：真实效果 → 发现重复 → 至少 2\~3 个案例证明 →
    提炼最小公共能力 → 回归已有案例。
3.  **Engine/Agent Gate 分离**：Engine Gate 可使用冻结参考实现；Agent
    Gate 只能使用公开 API、Examples、Recipes、类型与公开工具。
4.  **证据驱动**：源码存在、测试文件存在、Example
    存在、截图存在均不能单独判定 PASS。

## 4. Effect Contract

建立最小契约，名称按现有项目风格调整：

``` ts
interface EffectDefinition<P> {
  name: string;
  params: EffectParamSchema<P>;
  create(context: EffectContext): EffectInstance<P>;
}

interface EffectParamDescriptor<T> {
  defaultValue: T;
  min?: number;
  max?: number;
  step?: number;
  enum?: readonly T[];
  unit?: string;
  updateMode: 'uniform' | 'resource' | 'pipeline' | 'structure';
  description: string;
}
```

运行时至少处理 unknown property、NaN、Infinity、invalid enum、wrong
type、越界值。普通调参尽量只更新 uniform/resource；真正影响
pipeline/structure 时才重建。

## 5. 首批 9 个效果

  --------------------------------------------------------------------------------------------------------------
  ID             效果           核心内容                                主要验证能力              复杂度
  -------------- -------------- --------------------------------------- ------------------------- --------------
  E01            Noise Dissolve noise、progress、柔边、seed、输入纹理   Noise/采样/Alpha/端点     低

  E02            Thin Film      SDF 边缘、gradient、phase、rainbow      SDF/derivative/color      低\~中
                                palette                                                           

  E03            Holographic    noise normal、方向性色彩、高光、sparkle 时间/颜色空间/程序材质    中

  E04            Neon           core/tube/glow/falloff                  SDF/解析光晕/透明合成     中

  E05            Emboss         height gradient、normal、parallax-like  梯度/光照/Alpha           中
                                sampling                                                          

  E06            Sparkle        luminance threshold、邻域采样、star     像素尺度/确定性动画       低\~中
                                rays                                                              

  E07            Liquid Metal   animated noise、normal、程序反射        Noise/normal/质量档位     中

  E08            Cursor Trail   CPU 轨迹 + GPU 曲线距离绘制             Input/动态数据/生命周期   中

  E09            Glass          scene                                   RenderTexture/多 Pass/UV  中\~高
                                texture、refraction、blur、dispersion                             
  --------------------------------------------------------------------------------------------------------------

关键验收： - E01：`progress=0/1` 正确；相同 seed 可重复。 -
E02：边缘连续；不得宣称物理薄膜干涉，除非另做物理模型。 - E03：固定
seed/time 可复现，动画连续且颜色空间正确。 - E04：core/tube/glow
可独立调节，透明边缘正确。 - E05：光照方向与凹凸一致，输入 Alpha
正确。 - E06：只在符合阈值的亮部形成星芒，不同分辨率逻辑一致。 -
E07：明确为视觉材质而非流体模拟，质量档位可测。 -
E08：pointer/touch、resize、轨迹上限、destroy 无残留资源。 -
E09：折射/模糊/色散/高光可调，scene texture、resize、透明合成与 Pass
数正确。

## 6. 组合效果

必须完成： 1. `Holographic + Emboss + Sparkle`：镭射卡片； 2.
`ThinFilm + Neon`：彩边霓虹 Logo； 3. `Glass + CursorTrail`：互动玻璃；
4. `NoiseDissolve + arbitrary input`：覆盖 image、procedural
content、rendered layer。

组合 Gate：参数互不污染；颜色空间/Alpha
正确；共享数据不重复生成；Pass/RenderTexture 数量可解释；identity
状态可正确跳过。

## 7. 公共能力候选

仅在真实重复出现后提炼：

``` text
SDF Shape Input
Noise Functions
Color Functions
UV Transform
Effect Parameter Schema
Effect Driver
Offscreen Effect Pass
Effect Composition
```

每个候选必须给出重复案例、提炼前后代码对比、API 草案、性能影响、Agent DX
影响，以及 core/tools/example-local 的归属结论。

## 8. Effect Driver Pilot

参考 PropDriver 思想但接入 CocosAirJS 自己的输入与主循环，至少验证：

``` text
pointer-position
pointer-x
pointer-y
time
auto-animate
map-range
```

目标是让 Agent 不必在每个 Example 重写 pointer listener + RAF + uniform
update。

## 9. UV Remap / Pass Fusion Pilot

研究 `uvRemapShader()`、`CompositionIR`、`identityWhen`
与结构重编译边界，但先测后设计。

至少回答： - 多效果组合当前产生多少 Pass； - 哪些纯 UV 变换可合并； -
哪些必须中间纹理； - 哪些参数只更新 uniform； - 哪些必须 rebuild； -
identity 是否可跳过。

至少两个 UV distortion 案例记录：

``` text
before/after pass count
CPU update/encoding
GPU timestamp（支持时）
texture count
memory estimate
visual diff
```

只有实测证明收益后才进入正式优化层。

## 10. 文档同源生成

以 EffectDefinition 为单一事实源生成 TypeScript types、API
docs、parameter table、Agent reference、validation metadata。

CI 必须检查：

``` text
源码新增参数但文档缺失 → FAIL
文档引用不存在参数 → FAIL
structure 参数未进入缓存/结构键 → FAIL
Example 使用不存在 API → FAIL
```

状态严格为：

``` text
cataloged → documented → implemented
→ engine_verified → agent_verified → stable
```

## 11. Engine Gate

每个效果均需通过：

**EG-01 Build**：TypeScript compile、bundle、shader compile PASS。

**EG-02
Runtime**：create、update、resize、pause/resume、destroy、recreate
PASS。

**EG-03 Visual**：冻结
viewport、DPR、seed、input、parameters、time/simulation step
后截图；使用 SSIM/pixel diff/perceptual metric 时，阈值由 Pilot
数据确定，不预设伪阈值。

**EG-04 Boundary**：default、min、max、near-min、near-max、invalid。

**EG-05 Resource**：至少
`create/destroy × 100`，texture/buffer/material/listener/RAF/GPU
resource 不持续增长。

**EG-06 Performance**：不得用含义模糊的 `gpuTime`。分别记录 CPU
update、CPU encoding/submission、GPU timestamp（支持时）、frame
time、draw calls、pass count、texture/buffer count、VRAM
estimate；至少覆盖 720p、1080p、mobile DPR。

## 12. Agent Gate

Agent 禁止访问 reference implementation、private fixtures、expected
source、hidden answer，只获得任务、公开 API
docs、Examples、Recipes、TypeScript declarations。

记录：

``` text
first_run_success
compile_attempts
runtime_attempts
API_errors
documentation_lookup
manual_intervention
final_success
time/token
```

同时收集 API
易误用点、文档缺失、参数语义歧义、样板代码和错误提示质量，反向进入 API
改进。

## 13. 模拟类专项

`InkFlow`、`Boids`、`ReactionDiffusion` 暂不进入 Stable。

-   InkFlow：压力迭代使用 `pressureRead/pressureWrite/swap()`，验证
    projection 前后 divergence、boundary、收敛。
-   Boids：使用 `statePrevious/stateNext/swap()`，验证
    determinism、agent count、O(N²) scaling；必要时研究 uniform
    grid/spatial hash。
-   ReactionDiffusion：明确 simulation step / `dt`
    语义，验证双缓冲、稳定区间、固定步数可重复。

三项必须先证明数值/并发正确，再评价视觉。

## 14. 执行编排

每轮最多 **3 个独立子 Agent 并发**，当前 Wave Gate 通过后再推进。

### Wave 0 --- 基线与契约

-   A：上游来源/许可/算法索引；
-   B：Effect Contract + validation schema；
-   C：CocosAirJS API capability mapping。

交付：`upstream-index.md`、`effect-contract.md`、`capability-baseline.md`。

### Wave 1 --- 基础效果

并发 E01、E02、E06。全部 Engine Gate PASS 后进入下一轮。

### Wave 2 --- SDF / 材质

并发 E03、E04、E05。形成第一版 SDF/Noise/Color
公共能力提案，但不得无证据升级 core API。

### Wave 3 --- 动态与多 Pass

并发 E07、E08、E09。重点验证动态资源、Input 生命周期、RenderTexture、多
Pass 与性能。

### Wave 4 --- 组合

先并发 C01、C02、C03，再完成 C04。组合 Gate 全通过。

### Wave 5 --- 抽象与文档

并发公共能力提炼、文档/Agent reference 同源生成、UV Remap/Pass Fusion
Pilot。任何新增 core API 必须至少有两个真实消费者和回归测试。

### Wave 6 --- Agent Benchmark

并发三组隔离 Agent，至少覆盖简单 NoiseDissolve、中等
Neon/Holographic、复杂 Glass/组合效果。Engine 与 Agent 成功率分别报告。

### Wave 7 --- 模拟专项

并发 InkFlow、Boids、ReactionDiffusion，仅标记 Research/Experimental。

## 15. 子 Agent 固定交付模板

``` text
1. Goal
2. Upstream references
3. CocosAirJS APIs used
4. Implementation
5. Tests
6. Screenshots / visual evidence
7. Performance evidence
8. Resource/lifecycle evidence
9. API/DX gaps found
10. Workarounds used
11. Proposed engine changes
12. Validation status
13. Known limitations
```

禁止只提交代码。

## 16. 缺陷分类

统一使用：

``` text
ENGINE_BUG
API_GAP
API_DX
DOC_GAP
EXAMPLE_GAP
AGENT_FAILURE
REFERENCE_ERROR
INFRA_FAILURE
PERFORMANCE_GAP
```

INFRA_FAILURE 不得计入 Engine 或 Agent 失败。

## 17. 最终交付建议

``` text
examples/effects/
  noise-dissolve/
  thin-film/
  holographic/
  neon/
  emboss/
  sparkle/
  liquid-metal/
  cursor-trail/
  glass/
  combinations/

docs/effects/
docs/patterns/
ai/recipes/effects/
validation/effects/
reports/
  upstream-index.md
  capability-baseline.md
  engine-gate.md
  agent-gate.md
  api-gap-report.md
  performance-report.md
  final-assessment.md
```

实际目录服从 CocosAirJS 现有结构，不为本计划强行改仓库结构。

## 18. 最终 DoD

只有同时满足以下条件，任务才能关闭：

-   9/9 效果实现；
-   4/4 组合案例实现；
-   9/9 Engine Gate PASS；
-   资源/生命周期测试 PASS；
-   参数边界测试 PASS；
-   真实 GPU/浏览器视觉验证完成；
-   性能数据完成且指标定义准确；
-   Agent Gate 独立执行并有结果；
-   API/DX Gap 已归档；
-   公共能力提炼均有真实消费者；
-   文档与源码一致性检查 PASS；
-   上游来源与许可证记录完整；
-   InkFlow/Boids/ReactionDiffusion 未在缺乏数值证据时误标 Stable；
-   最终报告明确区分 `verified`、`documented-only`、`experimental`。

## 19. 最终判断问题

`final-assessment.md` 必须回答：

1.  CocosAirJS 是否能原生完成这类高质量视觉效果？
2.  哪些实现暴露了真正的 API 缺口？
3.  哪些只是文档/Example/Agent DX 问题？
4.  哪些公共能力值得进入 core？
5.  哪些能力应留在 tools / patterns / recipes？
6.  Effect Composition 是否需要正式抽象？
7.  Pass Fusion 是否有足够性能收益？
8.  Agent 使用这些能力时的成功率和主要失败原因是什么？
9.  相比任务开始前，CocosAirJS 是否更适合 one-shot /
    少轮次生成高质量互动视觉内容？
10. 下一阶段应该继续扩大 Effect Library，还是优先修复引擎/API/DX 缺口？

------------------------------------------------------------------------

## 20. 执行 Agent 总提示

``` text
你正在执行 CocosAirJS × shader-effects-inc/shaders 借鉴吸收计划。

目标不是复制上游项目，而是使用 CocosAirJS 原生能力重新实现指定效果，并通过真实实现发现 CocosAirJS 的 API、渲染能力、性能、文档和 Agent DX 缺口。

必须遵守：
1. 先阅读本任务计划书及 CocosAirJS 当前 AGENTS/项目约束。
2. 不直接嵌入 shaders runtime、TypeGPU 或额外渲染 canvas 绕过 CocosAirJS。
3. 固定并记录上游 commit 和参考源码。
4. 先完成效果，再根据多个真实案例提炼公共能力。
5. 不得因为截图相似就判定算法正确。
6. 每个效果必须完成 Build、Runtime、Visual、Boundary、Resource、Performance 验证。
7. Engine Gate 与 Agent Gate 必须隔离。
8. 所有发现的问题按 ENGINE_BUG/API_GAP/API_DX/DOC_GAP/EXAMPLE_GAP/AGENT_FAILURE/REFERENCE_ERROR/INFRA_FAILURE/PERFORMANCE_GAP 分类。
9. 不擅自提交、推送、部署或删除用户重要文件。
10. 最终必须按固定交付模板给出证据，不接受仅代码交付。

每轮最多并发 3 个独立子 Agent；当前 Wave Gate 未通过不得推进下一 Wave。
```
