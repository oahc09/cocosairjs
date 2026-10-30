# CocosAirJS 本轮更新计划：资源、渲染与 Code First 契约加固

- 制定日期：2026-10-22。
- 计划编号：AIR-UPSTREAM-20261022；这是工作批次编号，不是软件发行版本。
- 已核对仓库：`oahc09/cocosairjs`。
- 调研基线：`main @ b573be0741db9e2a13d38ce7e65870b97a1f5fbc`，提交时间 `2026-10-21T12:22:31Z`。
- 文档状态：**计划与源码诊断完成；代码实施、构建、浏览器验证均未执行**。
- 所有下列实施任务和新增测试的初始状态均为 `NOT_RUN`。源码存在、上游报告、历史 PASS 和本计划均不代表本轮已完成。

## 1. 结论与本轮目标

本轮不是追随上游版本号升级，也不是照搬上游 API。目标是在 CocosAirJS 的既有代码和公开契约上，交付：

1. glTF 主文件、依赖资源及取消请求之间一致的加载策略。
2. 与 glTF 规范一致的材质校验、准确的参数语义和动态更新行为。
3. 有独立数学依据的色彩验证、正确隔离的材质/渲染目标状态及深度采样审计。
4. 可复现验证的骨骼实例、包围盒、Morph 与资源销毁行为。
5. 发布包级的 ESM、TypeScript、公开出口和可选资产验证。
6. 首帧就绪、Examples、Engine Gate、Agent Gate 和发布证据之间的完整闭环。

Reverse-Z、完整 OIT 和 LightProbe 批量烘焙不直接成为默认稳定功能。本轮必须完成其适用性判断、可运行的最小实验或明确的阻塞证据；是否进入正式能力由实验 Gate 决定，不能用“未研究”或“有源码”收口。不会因此改变默认 WebGL2、显式实验 WebGPU、单 capture 透射、独立 Spark 等已确定边界。

## 2. 本次核对得到的真实现状

### 2.1 证据等级

- `SOURCE_CONFIRMED`：已经读取对应源码、声明或正式规范，只证明静态事实。
- `REPORTED_BY_UPSTREAM`：上游作者报告的测试或性能，本轮没有独立复现。
- `RUNTIME_VERIFIED`：仅在执行并保留当前候选运行证据后使用；本次诊断没有此类结果。
- `UNKNOWN`：未核查或证据不足，不能替换为“不支持”或“已实现”。

### 2.2 能力与缺口表

| 主题 | 当前核对结果 | 本轮处理 |
|---|---|---|
| 渲染后端 | 默认 WebGL2；`renderer: 'webgpu'` 为显式实验后端，失败不自动回退。[R2][R3] | 保留路由与默认值；分别建立后端验收范围，不重新接入已有后端。 |
| glTF 加载 | `GLTFLoaderOptions` 已有 `signal`、进度回调、decoder 配置；没有 priority/HTTP cache 公共字段。[R4] | 增量扩展现有选项，不新建并行资源系统。 |
| 顶层取消 | `registerGLTFLoader()` 的顶层 `fetch` 传递 header/credentials，但未传递 `options.gltf.signal`。[R5] | 补齐取消链路；共享请求与缓存交互须先复现，不能只补一个参数就宣称修完。 |
| 依赖请求 | `GLTFParserContext.request()` 只传 `signal`；解析作用域内按 URL 保存 Promise。[R6] | 补齐策略传播和错误缓存处理测试，保留现有所有权边界。 |
| 虹彩材质 | 已实现 `KHR_materials_iridescence`、最小/最大膜厚映射，不是缺少这项能力。[R7] | 不照搬 three.js 的属性重命名。修正规范偏差并验证现有字段到 Shader 的映射。 |
| 虹彩 IOR 校验 | 当前接受 `[1.3, 2.33334]`；Khronos schema 为 minimum `1.0`，没有 maximum。[R7][K1] | **已确认输入契约不一致**：有效参数可能被拒绝。列为直接修复项，但尚无本轮运行复现。 |
| 虹彩说明 | 当前注释提到 `iridescenceIorTexture`，并将默认厚度条件关联到 volume；官方 schema 未定义前者，默认最大厚度取决于厚度纹理缺省。[R7][K1] | 同步修正文档/注释，不把非标准字段当作正式 glTF 能力。 |
| 色彩与材质诊断 | 已有 `validateAirTextureColorContract`、`validateAirPrefilteredEnvironment`、`inspectAirMeshMaterial` 等。[R8][R9] | 扩展既有契约与数学回归，避免另起描述体系；只读诊断不得偷偷改变状态。 |
| 透射捕获 | `AirTransmissionCapture` 只允许同一 Scene 一个 capture，且当前路径要求 WebGL2。[R10] | 支持路径验证正确性；第二个 capture 必须明确拒绝。不能把现有限制误判为上游多目标缓存缺陷。 |
| glTF 多实例 | `GLTFAsset.instantiate()` 已创建独立节点、动画/Morph 状态，并管理共享资产引用和延迟释放。[R11] | 重点验证实例隔离、骨骼变换、AABB、销毁，不重写实例系统。 |
| SDK | 已有主入口、`/math`、TS 4.9 legacy 声明、现代 TS 声明及独立消费者验证脚本。[R12] | 加强发布包验收；不因为 BabylonJS 修复 UMD 就给本项目新增 UMD。 |
| 首帧就绪 | 已读取的 `AirApp` 契约没有通用的“所有资源和所有渲染 Pass 就绪”方法。[R13] | 先补可测的就绪证据；不把 `createAirApp()` 完成当作所有业务资源就绪。 |
| OIT / Reverse-Z / 批量 Probe | 本次未完成所有底层路径审计，不能断言完整支持或完全缺失。 | U08 先形成证据矩阵，再做局部实验和明确决策。 |

### 2.3 已重新核对的上游输入

以下均核对了官方 PR 的 merged 状态和合并日期，日期为 UTC；**不以合并时间推断已进入任何正式 tag**。

| 上游条目 | 合并日期 | 借鉴内容 | 对应任务 |
|---|---|---|---|
| three.js #34936 | 2026-10-20 | priority / HTTP cache；应用提供的 handler 与 decoder 保持自己的设置 | U01 |
| three.js #35110 | 2026-10-20 | ACES 公式括号错误；测试期望值曾跟随错误实现 | U03 |
| three.js #35113 | 2026-10-20 | 枚举值进入材质缓存键，避免不同混合/组合语义错误共享 | U04 |
| three.js #35140 | 2026-10-21 | RGB/RGBA 与颜色 Morph 的 Shader 接口一致性 | U05 |
| BabylonJS #19010 | 2026-10-20 | 初始化时显式 Reverse-Z；默认不变；实际收益依赖深度格式与后端 | U08 |
| BabylonJS #19008 | 2026-10-20 | 深度纹理 sampler 显式 highp；不是仅设置 float 默认精度 | U03、U08 |
| BabylonJS #19018 | 2026-10-20 | 源码导入成功不代表发布入口具有相同符号 | U06 |
| Galacean #3133 | 2026-10-21 | 克隆后 Transform 监听器、骨骼 bounds、销毁所有权 | U05 |
| three.js #34909 | 2026-10-20 | Probe 批量捕获、立体角加权 SH、避免只优化 GPU 而忽略 CPU 提交 | U08 |

本轮没有为 PixiJS 强行安排功能；其继续作为监控对象。此前通知中的首帧、动态 UV、类型说明、虹彩映射分别并入 U07、U02、U06，不重复建立第二套任务。Clustered Lighting 和 Gaussian Point Splatting 不因此被默认为本轮默认管线交付项，保留独立实验边界。

## 3. 不变的架构、权限与兼容约束

1. 以原生 Cocos `Scene`、`Node`、`Material` 等为主 API；新增薄层放 `src/air/`，不创建并行场景图、渲染器或资源管理器。[R14]
2. 默认 WebGL2 不变；无能力时仍明确失败，不能静默使用 EmptyDevice。显式 WebGPU 仍失败即 reject，不自动换后端；实验 WebGPU 不自动扩展移动端和高级 helper 的支持声明。[R2][R3]
3. `releaseScene()`、`close()`、受控 reload、session 代际及资源所有权合同保持；关闭后不承诺同页重建引擎。[R13]
4. Spark、decoder、WebGPU shader translator 和 Box2D WASM 的独立资产、按需加载、单引擎实例规则保持。不得因本次修复引入第二份引擎。[R1][R12]
5. 不修改现有模型路由、Skill 触发条件、权限、只读 Skill、归档或宿主约束。API 文档更新不构成重构 Skills 的授权。
6. 不整体升级 Cocos4 基线，不批量复制 three.js/BabylonJS/Galacean 实现。触及 `src/cocos/`、PAL 时先读映射，登记最小差异与原因，保持来源和许可证。[R14]
7. 不自动增加 UMD、主入口 SSR 或 Node 无 DOM 支持；`cocosair.js/math` 保持独立 CPU-only 入口。
8. 不预先指定新发行版本、不声称 npm 已发布；版本依据实际兼容变更确定。
9. 本计划仅授权范围描述，**不是执行授权**。后续实施不得未经授权提交、推送、发布、部署、变更仓库权限、使用真实凭据或删除重要数据。
10. 实施在另行授权的云端独立工作区进行；先检查 SHA、Git 差异与宿主/仓库约束，保留用户改动，不 reset/clean，不在用户本地主机执行。

## 4. 工作分解与依赖

所有工作均纳入本轮，不用 P0/P1/P2 隐藏范围。实现类任务交付代码与证据；研究类任务交付可验证实验、结论与边界，两类完成条件不可混用。

| ID | 工作包 | 交付性质 | 前置 |
|---|---|---|---|
| U00 | 基线、契约与测试清单冻结 | 审计/规划输入 | 无 |
| U01 | 加载策略与取消闭环 | 实现+回归 | U00 |
| U02 | glTF 材质规范与动态参数 | 修复+回归 | U00 |
| U03 | 色彩数学基准与 Shader 精度 | 验证+证据驱动修复 | U00，U02 部分接口 |
| U04 | 材质缓存、渲染目标与状态隔离 | 验证+证据驱动修复 | U00 |
| U05 | 骨骼实例、Morph、AABB 与生命周期 | 验证+证据驱动修复 | U00 |
| U06 | SDK 导出与 TS 消费契约 | 实现/声明/回归 | U00；最终依赖 U01/U02 公共签名 |
| U07 | 首帧就绪与确定性采集 | 验证工具+必要薄层 | U01、U04、U05 |
| U08 | 深度与 Probe 专项实验 | 实验+ADR+适用性结论 | U03、U04 |
| U09 | Examples、业务场景和使用文档 | 可运行交付 | U01—U08 的对应稳定输出 |
| U10 | 双引擎 Benchmark 与候选发布验收 | 集成验证 | 全部关联任务 |

### U00：基线与验证范围冻结

读取当前 `AGENTS.md`、README、支持策略、npm scripts 说明、upstream 映射和相关目录约束。实施开始时再次读取 main；若不是本计划 SHA，记录新提交及差异，重核受影响结论，不强行回退到旧 main。

建立 `source-map.json` 与 `acceptance-manifest.json`，至少包含：CocosAirJS SHA、lockfile hash、源码/构建/声明/测试工具指纹、上游 PR/merge SHA、规范 blob hash、能力状态、用例 ID、关联公开 API、必需或实验类别、环境和预期结果。

建议落点：`ai/upstream-update/2026-10-22/`，**这是建议新目录，执行前按仓库组织约定确认**。证据脚本仍放 `tools/verify/`，不要建立按版本复制的脚本目录。

完成条件：每个任务的输入与依赖可追溯；现有示例清单、测试脚本和接口均已核对；`UNKNOWN` 有具体核查动作。任何“无须修复”结论必须有测试或静态契约依据。

### U01：加载策略、缓存与取消

**已知落点**：`src/air/assets/gltf/progress.ts`、`loader.ts`、`parser-context.ts`、必要的 texture/decoder 适配；避免另建 Loader。

建议增量契约如下，标识符属于**提案，不是当前可用 API**；U00 与当前类型命名核对后冻结：

```ts
export interface AirRequestPolicy {
    priority?: 'high' | 'low' | 'auto';
    httpCache?: RequestCache;
    credentials?: RequestCredentials;
    headers?: HeadersInit;
}

// 在现有 GLTFLoaderOptions 中添加，不删除其已有字段：
// request?: AirRequestPolicy;
```

不要求新增链式 setter；优先复用已有构造 options 和 `configureGLTFLoaderDefaults()`。不改变 `loadAsync(url)` 既有调用方式。不得为了新 DOM 类型直接放弃 TS 4.9；必要时局部扩展类型，不使用大面积 `any`。

实施内容：

- 主 glTF/GLB、外部 buffer、fetch 图片、内部创建的解码资产请求采用可解释的有效策略。
- 继承顺序为全局默认→Loader 显式配置→内部特定资源覆盖；明确 `undefined`、未传入与合法默认值的区别。外部注入的 decoder/handler 不被静默重配置。
- 保留既有 credentials 行为；跨源敏感 header 不默认透传。测试使用合成 header 与测试服务，不使用实际业务凭据。
- `priority` 是浏览器调度提示，不承诺高优先级请求一定先完成或一定提速。不支持时记录降级，不伪造调度效果。
- `httpCache` 只描述 HTTP 缓存。内存 Asset cache、在途去重、解析缓存必须分别记录；命中 Asset cache 时可能根本不发网络请求，`no-store` 不应被解释成自动禁用全部引擎缓存。
- 审查现有 `assetManager` 去重 key 是否忽略影响响应或解析结果的选项。身份/凭据/关键策略不同的请求不能错误共享结果；使用现有可配置机制或局部隔离，不替换原生缓存系统。
- `signal` 覆盖发请求之前、主文件、依赖、解码等待、GPU 资产创建后的交接阶段。不可取消的第三方解码作业必须隔离晚到结果并释放临时资源，不声称它已经被物理停止。
- 并发共享请求时，一个消费者取消不得误杀仍有效的另一个消费者；先冻结共享订阅的所有权策略，再实现转发。
- 异常/取消后 Promise 和 cache 状态可以重试；不得把失败永久保存为成功缓存。场景已销毁时不得自动挂回晚到节点。

验证重点：测试服务实际收到的请求及响应计数、取消事件、明确的阶段进度、资源创建/销毁计数和成功重试。浏览器 HTTP cache 测试使用隔离上下文与受控 Cache-Control/ETag；不要用网络速度作为唯一证据。

### U02：材质规范、动态更新与参数说明

**已知落点**：`src/air/assets/gltf/extensions/material/iridescence.ts`、`material/features.ts`、实际 material/Shader 映射；`src/air/rendering/material-diagnostics.ts` 与 `engine-contracts.ts` 为既有复用入口。

必须修复：

- 依据固定的 Khronos schema，将 `iridescenceIor` 输入校验改为规范允许的有限数值域，下限 `1.0`，不擅自保留 `2.33334` 上限。与 Shader 数值稳定性分开验收；不以静默 clamp 伪装规范兼容。
- `iridescenceFactor`、膜厚最小/最大值的默认值、单位、合法关系保持明确；`min > max`、NaN、Infinity 等明确拒绝。
- 修正 IOR texture 与厚度缺省条件的错误说明。缺少 thickness texture 时使用 maximum；不得绑定到是否存在 volume extension。
- 不迁移为 three.js 专用命名体系；当前 glTF 原始属性已是 Minimum/Maximum，检查映射到 `thicknessMin/thicknessMax` 和 Shader 时是否保持一致。

动态参数回归：UV 偏移/缩放/旋转，膜厚，颜色/透明度，材质实例与共享模板的更新；原地更新是否支持必须按本项目实际公开 API 定义。以“修改已有对象”与“直接创建最终状态对象”作为变形测试，比较输出，不假设 three.js 的 dirty-flag 机制适用于 Cocos。

参数说明复用已有诊断/文档结构，统一记录名称、类型、范围、单位、默认值、纹理通道、颜色空间、作用阶段、会否改变 Shader 变体，以及后端限制。不能只补文案而无行为测试，也不强制为了文档创建大型材质框架。

### U03：色彩数学基准与深度 sampler 精度

**已知落点**：`src/air/rendering/color-contract.ts`、对应内置/自定义 Shader 来源、现有 shader probe；实际 Shader 文件由 U00 追踪生成链确认，不凭文件名猜测，也不手改生成产物。

先确认当前 CocosAirJS 使用的 tone mapper 及适用条件。**不因为 three.js 修了 ACES 就把 Cocos 的默认色调映射改成 ACES**；名称相同也必须比较公式、输入曝光、颜色矩阵和输出编码。

建立独立 CPU 参考实现，不调用待测 Shader/生产函数计算期望值。若验证 three.js 所用 ACES 拟合，检查分母 `v * (0.983729 * v + 0.4329510) + 0.238081` 的运算树，但最终验收仍按选定完整算子，包括输入/输出矩阵及曝光约定。

固定测试向量覆盖黑、18% 灰、白、HDR 灰阶、饱和色与极小正数。纹理颜色与线性数据分开：法线、粗糙度、金属度、深度不得误做 sRGB 解码；颜色不得重复硬件+Shader 解码。

采样精度审计检查最终提交给 WebGL 的 GLSL，不只查看模板。用于深度比较或重建的 sampler 应有与目标格式/算法匹配的精度。`precision highp float` 不能替代所有 sampler 的精度决策。仅修改有证据的路径，不全库盲目加 highp。

建议初始数值门槛：CPU 双精度参考与受控 float 路径的绝对误差 `≤1e-5`；RGBA8、平坦 ROI 的像素误差 `≤2/255`。这些是本轮拟定阈值，须在 U00 根据存储精度和现有更严格门槛冻结；不得在看到失败后放宽。半浮点、抗锯齿边缘与不同 BRDF 不套用同一误差模型。

### U04：渲染缓存、目标与状态隔离

先追踪 Cocos 当前的 Effect/Pass/Shader/PSO 缓存键及更新规则，不直接移植 three.js 的 `getMaterialCacheKey()`。

将状态分为：影响 Shader 代码的宏/枚举、影响 PSO 的 blend/depth/cull 状态、只影响 uniform 的参数、随相机/RenderTarget/Pass 变化的资源绑定。分别测试失效规则，不能粗暴地“所有变化都重新编译”，也不能为节约缓存错误共享实例状态。

必测行为：

- 相同几何、不同混合状态的对象单独渲染与同屏非重叠渲染一致；交换首次构建顺序仍一致。
- 有重叠透明物体时，按冻结的绘制顺序和混合公式验证；**普通 alpha blending 本来依赖顺序，不要求任意重排后像素不变**。
- 两个同尺寸同格式 RenderTarget、两台相机、不同背景，执行 A→B→A；纹理、viewport、clear、曝光、深度状态不得串用。
- resize、DPR 改变、目标销毁与重建后绑定更新；不得靠改变一像素尺寸“修复”缓存。
- 现有 `AirTransmissionCapture` 单 capture 路径、关闭/重启/销毁的状态恢复；第二个同 Scene capture 明确拒绝，先前 capture 仍有效。

本轮不默默取消单 capture 保护。若业务验收确需多相机透射，必须独立 ADR 定义每视图资源、材质实例绑定、资源释放和兼容性，再成为增量能力；没有通过前保持限制。

### U05：实例、骨骼、Morph 与资源生命周期

**已知落点**：`src/air/assets/gltf/asset.ts`、`nodes.ts`、实际 `SkinnedMeshRenderer`/bounds 更新代码；优先最小回归，不重写 `GLTFAsset.instantiate()`。

用一个程序化小骨架和一个固定本地 glTF 创建三个实例。逐个修改根骨骼位置、父节点非均匀/负缩放、动画时间、Morph 权重，确认节点、姿态、状态与销毁互不污染。保留共享 Mesh/Texture/Clip 的设计，不用全部深复制“解决”所有权问题。

AABB 验证分两层：独立 CPU 变换/蒙皮参考证明包围盒包含真实顶点；真实浏览器用固定相机跨视锥边界运动验证可见性。一般引擎 bounds 允许保守包围，不无依据要求最紧包围盒；简单解析 fixture 可验证精确预期。建议包含误差 `1e-5 * max(1, sceneDiagonal)`。

验证 native clone 与 glTF instantiate 的实际公开支持路径；不能将一个路径的通过外推到另一个。销毁一个实例不影响其余实例；源资产发起 destroy 后依既有引用合同释放；延迟销毁应等既定刷新点，不用任意 sleep 代替。

颜色和 Morph 分开定义：已支持的 RGB/RGBA 顶点颜色、几何 Morph 和蒙皮组合要有 Shader 编译及像素回归；**three.js 的 color morph 修复不证明 glTF 核心存在 COLOR_0 morph，也不证明 CocosAirJS 已支持该扩展**。未支持的色彩 Morph 应明确列入能力矩阵，不伪装成通过现有几何 Morph 即已实现。

### U06：SDK 出口、类型与独立消费

**已知落点**：`src/air/index.ts`、`src/exports/air.ts`、`package.json`、声明生成器、`tools/verify/consumer-acceptance.cjs`、`tarball-browser-consumer.cjs`、既有 export 检查。

必须使用实际 `npm pack` 产物安装到隔离消费者，而非只从 `src/` 导入。覆盖原生浏览器 import map、Vite 开发/生产、未压缩/压缩 SDK、TS 4.9 legacy 声明和受支持的现代 TS 版本；依赖版本在测试清单中锁定，不使用浮动 latest。

维护三类契约：

- 运行时公开符号：确实从约定主入口或 `/math` 导出，声明与 JS 一致，没有 barrel 同名丢失。
- 类型语义：可空返回值、生命周期返回值、错误和新请求 options 精确；调用方 `strictNullChecks` 正例/负例通过。保留当前文档 `skipLibCheck: true` 合同，不借此全库强开 strict 或要求用户关闭检查。
- 资产部署：default WebGL2 不请求 WebGPU/WASM 资产；选择可选功能时资产相对路径、MIME、CORS、失败诊断正确。Spark 继续复用同一主 JS，不假设存在 `cocosair.js/spark` npm 出口。

`cocosair.js/math` 可做 Node CPU-only 测试；主入口不做虚假的 SSR 支持承诺。根 package 的 CommonJS 工具布局与嵌套 ESM 标识不随意更改。

### U07：首帧就绪与确定性截图

先实现验证侧就绪观测，复用已有 step-clock 和真实浏览器采集器；不直接给薄 `AirApp` 增加含糊的万能 `ready()`。

观测至少区分：引擎创建完成、所声明资源 Promise 完成、当前场景相关 Shader/Pass 可用、目标帧提交及浏览器呈现。对于无法观测的 GPU/编译状态标为 unknown，不能假定通过。截图必须同时有实际 compositor 截图；GPU readback 单独不能证明页面呈现。[R14]

预热不能改变业务状态。不能简单 `tick(0)` 后假定用户回调无副作用，也不能通过跑 60 帧推进动画掩盖首帧错误。使用受控渲染路径时核对动画时间、物理步号、随机序列、计时器、输入与业务事件计数的状态摘要。

冷启动、延迟资源、Shader 失败、离屏 Pass、context/device lost 的测试分别给出结果。等待必须有终态与超时错误、保留最后诊断；失败不能用截到的空白图充当成功。

如确需运行时 hook，以可验证、最小、additive 的内部/公开契约实现；先做 API review，再同步 U06，不把只读 `inspectAir*` 改为会启动渲染或编译的函数。

### U08：Reverse-Z、OIT 与 LightProbe 专项实验

#### U08-A：深度与 Reverse-Z

盘点实际 projection/clip range、深度格式、clear 值、比较函数、阴影、深度采样/重建和自定义 Shader 的约定。只有切换 compare function 不构成 Reverse-Z 实现。

先提供 depth diagnostic 和可运行测试场景。实验开关不改变默认值；不支持的后端/格式明确拒绝。验证多档 near/far、深度接近的平面、普通/反向 Z、浮点/可用固定深度格式。记录实际 GPU、驱动、backend 和最终分配格式，不能只记录请求值。

判定要求：无关默认场景不变；实验结果与数学预期一致；各设备收益单独报告。不能承诺 WebGL2 与 WebGPU 同幅改善，也不能以 Chromium 软件适配器结果证明真实移动 GPU 性能。[U5]

#### U08-B：OIT 适用性与精度

确认项目当前是否存在完整 OIT，以及具体是排序透明、weighted blended 还是 depth peeling，禁止混称。不存在时，本轮不为了套用上游一行修复引入完整 OIT；仍交付复用现有 depth texture 路径的精度实验与 ADR。

已存在的深度比较 Shader 必须审计 sampler precision；完整 OIT 若被确认存在，另跑多透明层、normal/reverse depth、可用 float/half-float target 与 MSAA 兼容矩阵。未支持的组合明示，不靠关闭透明物体通过测试。[U6]

#### U08-C：Probe 捕获与 SH

先识别现有 light-probe/SH 数据通路和资产格式，再做独立小实验。不要把既有 `validateAirPrefilteredEnvironment()` 当作 Probe baker；反射 GGX 预滤波、普通 mipmap、漫反射 SH 是不同能力。[R8]

实验交付：CPU SH 参考、Cubemap texel 立体角权重、串行捕获基线与批量 atlas 捕获对照。冻结轴向/面序、手性、SH 基函数顺序与归一化、颜色空间、是否已乘余弦卷积。

数学验收包括 `sum(solidAngle) ≈ 4π`、常量环境低阶系数、方向环境旋转一致性。采用正交归一实 SH 时常量辐亮度 L 的零阶系数应为 `L * sqrt(4π)`；若引擎采用预卷积或缩放存储，必须先显式转换。精确立体角权重不等于连续 SH 积分在任意分辨率下完全精确。

性能同时记录 CPU 场景遍历/提交、GPU 工作、总烘焙时间和增量显存。上游约 4 倍加速仅是其场景/设备报告，不是本轮验收指标。[U9]

U08 最终结论只能是：`ADOPT_EXPERIMENTAL`、`RETAIN_CURRENT`、`NOT_APPLICABLE_WITH_EVIDENCE` 或 `BLOCKED`。没有实际运行的实验不得写“验证完成”。前三种均需来源、输入、证据与后续边界；BLOCKED 保留原因，不计为 PASS。

### U09：Examples、文档与业务化验收

不以新增页面数量为目标。优先扩展已有 `gltf-viewer`、`glass-refraction` 和合适的基础示例；确实独立的主题才建新 ID。表中为验收主题与建议名称，创建前查重，不声称它们当前已存在。

| 主题/建议名称 | 必须看见或操作的内容 | API/能力重点 | 验收证据 |
|---|---|---|---|
| `asset-request-policy` | 请求阶段面板、缓存/优先级选择、取消和重试、延迟依赖 | GLTFLoader、新请求策略、session | 真实请求日志，取消后无晚到挂载，重试成功 |
| `material-contract-lab` | 纹理通道图、颜色/UV/膜厚/IOR 控件、非法参数提示 | Material、glTF mapping、诊断 | 动态结果与最终状态重建一致，规范边界正负例 |
| `render-state-isolation` | 两个同尺寸 RT、不同背景、混合模式与顺序切换 | Camera、RenderTexture、Pass/Material | 每区单独参考、A→B→A 像素与资源恢复 |
| `skinned-instance-lifecycle` | 三个实例独立播放/变形/移动、bounds 显示、逐个销毁 | GLTFAsset.instantiate、Animation、bounds | CPU 包含性+真实裁剪，销毁无污染 |
| `first-frame-readiness` | 冷启动就绪阶段、故障提示、固定状态截图 | createAirApp、step-clock、采集器 | 状态未推进、首个完整呈现帧、超时终态 |
| `depth-precision-lab` | near/far、深度格式与实验模式比较 | Camera/depth、支持查询 | 数学与像素结果，实际 backend/format，限制明确 |
| `probe-sh-lab` | 常量/方向环境、SH 对照、串行/批量时间 | 实验 SH/probe 工具 | 系数误差、性能与内存，实验标识 |
| `material-inspection-showroom` | 下述中等复杂业务场景 | 公开 API 的组合使用 | 完整交互、稳定性、视觉与 API evidence |

业务场景：**互动材质检视展台**。

- 一个固定本地 glTF 资产、三个可独立控制的实例、12 个材质样片；所有资产记录 hash 与许可证，不依赖不稳定外链。
- 用户可旋转视角、点击选中、切换材质、调整 UV/虹彩参数、暂停/单步动画、取消/重试加载及销毁/重建实例。
- 提供一个单 capture 透射展示及两个普通离屏预览；不要求未支持的同 Scene 多 capture 透射。
- UI 显示真实后端、资源阶段、错误、参数值和当前选中对象；不能用预录视频代替渲染。
- 桌面与移动 viewport 分别验证实际 pointer 交互、DPR/容器缩放后的命中位置；控件作用必须从状态/画面/资源证据证明，不能只触发 handler 就计入 API 覆盖。
- 以既有生命周期合同连续执行 30 次加载/切换/释放循环。固定的测量边界后，应用持有资源与监听器不持续增长；GPU 总内存不可获取时明确不可测，不给假数字。
- 实验能力在独立入口或明确选择后启用，不进入默认 WebGL2 展台的必要启动路径。

同步更新：资源加载说明、材质规范、示例 API、后端能力矩阵、SDK 消费说明、错误排查、实验 ADR、迁移说明和相关 Recipe。计划状态只转为 draft/候选，不能无证据批量提升 stable。

### U10：Benchmark、CI 与候选集成

保持现有 CI 路由和触发条件。`Code quality / quality` 的核心子集、五个真实 Chromium 示例、Box2D 主干专项验收保持；不将全量 Gallery、全部浏览器和研究实验强塞每个 PR。[R14]

对改动添加聚焦回归，并确保源文件变化会被现有路径判定覆盖。修改 paths-filter 时保留未知/共享路径的 fail-closed 策略，不改默认模型路由或 Skill 触发。

阶段候选完成后，手动执行当前完整示例证据流程、适用浏览器矩阵、SDK 消费、完整相关测试及 release readiness。当前文档描述完整 182 示例，但执行时以冻结 live manifest 为准；新增示例后不能继续把“182”当固定完整总数。[R15]

普通 PR 绿灯不等于发布绿灯。代码、SDK、示例、依赖、测试工具或合同字节发生变化，关联证据必须重新采集；不能改 fingerprint 让旧 PASS 看起来有效。

## 5. 新增回归清单（36 个验收场景）

这是最低场景集，不是要求只写 36 个断言；不同浏览器/构建/后端是参数化执行维度，不重复计为新场景。每项必须记录正例/负例、fixture、预期、状态与证据。

| ID | 场景 | 关键判据 | 对应工作 |
|---|---|---|---|
| T01 | 省略新加载选项 | 既有请求行为和调用方式保持 | U01 |
| T02 | priority 及 HTTP cache 传递 | 主文件/内部依赖收到有效配置；不以速度排序判定 | U01 |
| T03 | 多级配置与自定义 decoder | 默认/显式规则正确；外部实例不被覆写 | U01 |
| T04 | 预取消、主文件中途取消 | Promise 正确终态；主请求可中止，无资源挂载 | U01 |
| T05 | 依赖/解码期间取消 | 清理临时对象，隔离晚到结果，重试可成功 | U01 |
| T06 | 同 URL 多消费者与不同策略 | 共享/隔离符合合同；取消一方不误杀另一方 | U01 |
| T07 | IOR 规范边界 | 1.0、1.2、1.3、2.33334、2.5 等有效值；小于1及非有限数拒绝 | U02 |
| T08 | 膜厚与纹理语义 | min/max、缺纹理默认值、R/G 通道与线性数据正确 | U02 |
| T09 | 动态 UV/材质参数 | 原地合法更新与最终状态重建输出一致 | U02 |
| T10 | 冻结 tone mapper 数学向量 | 独立 CPU 参考，曝光/矩阵/输出编码完整 | U03 |
| T11 | sRGB/线性数据与混合 | 无遗漏/重复解码，RGBA/预乘 alpha 语义明确 | U03 |
| T12 | sampler 精度 | 最终 GLSL 精度正确，受控深度比较结果正确 | U03 |
| T13 | 材质首次构建顺序 | 非重叠对象单独/混合、先后顺序一致 | U04 |
| T14 | 动态 Shader/PSO/uniform 变化 | 该失效才失效；uniform 修改不滥建变体 | U04 |
| T15 | 同尺寸 RT A→B→A | 相机与目标资源不串用，含 DPR/resize | U04 |
| T16 | 透射生命周期与限制 | 单 capture 正确恢复；第二 capture 明确拒绝 | U04 |
| T17 | 三个 glTF 实例独立运动/动画 | 节点与动画状态隔离，共享只读资产不被污染 | U05 |
| T18 | 骨骼根节点/父节点变换 bounds | 包含独立 CPU 蒙皮顶点，处理缩放与负缩放 | U05 |
| T19 | 真实视锥裁剪 | 跨边界显示/隐藏按预期，不能仅看 AABB 数值 | U05 |
| T20 | RGB/RGBA、Morph、蒙皮组合 | 支持组合正确编译/渲染；不虚报 color morph | U05 |
| T21 | 重复实例销毁与共享资产 | 幂等清理，30轮无持续持有增长，其他实例正常 | U05 |
| T22 | 发布包原生 ESM 消费 | 仅实际安装/部署产物可运行，公开符号完整 | U06 |
| T23 | Vite 开发/生产与压缩版 | 一致功能，无隐含 src/开发依赖 | U06 |
| T24 | TS 4.9/现代 TS 严格调用方 | 正例通过、负例被拒绝，既有合同不削弱 | U06 |
| T25 | `/math` 与主入口边界 | math 无 DOM；主入口浏览器合同清晰，不虚报 SSR | U06 |
| T26 | 可选资产和单引擎身份 | 无隐式双实例；默认不加载实验资产；路径失败明确 | U06 |
| T27 | 冷启动首帧 | 固定业务状态下首次完整 compositor 呈现 | U07 |
| T28 | 延迟资源与预热 | 业务时钟/事件状态未推进，超时可诊断 | U07 |
| T29 | Shader/设备故障 | 不把空白帧/EmptyDevice 当成功，终态和清理正确 | U07 |
| T30 | 默认深度行为 | 不变更默认 projection/比较/clear 的输出 | U08 |
| T31 | Reverse-Z 实验适用性 | 真正实现全链路时测；未实现必须明确拒绝且不记正向 PASS | U08 |
| T32 | 透明深度路径与 OIT 矩阵 | 实际已有算法匹配，不支持组合有明确证据 | U08 |
| T33 | SH 数学与批量捕获实验 | 权重和系数正确；性能/显存对照完整 | U08 |
| T34 | 展台真实交互 | pointer/DPR/选取/控件真实影响画面与状态 | U09 |
| T35 | 全链生命周期故障恢复 | 场景切换、取消、失败、release/close 遵守现有合同 | U09 |
| T36 | 证据与打包身份负例 | 缺证据/过时 hash/子集/异常跳过必须阻断对应 Gate | U10 |

T31—T33 是实验判定项目：不适用的证明可以完成研究决策，但不能充当功能支持 PASS；未完成的必需实验仍使本轮计划不完整。正式发布所需稳定功能与实验成果分别汇总，不以删除实验用例的方式通过。

## 6. 验证环境、指标与归因

### 6.1 环境

默认 WebGL2：沿用项目三浏览器矩阵，并以 `verify:browser-matrix` 实际支持与环境配置为准。桌面 Chromium 之外，Firefox/WebKit 的支持范围独立记录；缺浏览器或缺 GPU 不得合成 PASS。

实验 WebGPU：只用当前已认可的桌面环境执行。记录 adapter、实际后端、validation error、异步读回和资产来源。没有 WebGPU 的环境保持显式不支持，不静默换成 WebGL2。

移动 Web：至少覆盖授权可用的 Android Chrome 真机；涉及特定 GPU 精度/性能结论，应跨至少两类真实 GPU 实测后再扩大结论。没有真机时将该项标为 `NOT_RUN` 或 `BLOCKED`，不能用移动 viewport 替代。既有移动支持范围的 release 门禁不得绕开。

### 6.2 固定参数

固定浏览器版本、SDK SHA/hash、尺寸、CSS/DPR、颜色空间、曝光、tone mapper、MSAA、alpha/预乘、near/far、实际 depth format、灯光单位、资产 hash、随机种子、业务步进、截图 ROI/边缘 mask、资源加载条件和 readback 方法。默认截图合同（包括已有 preserveDrawingBuffer 约定）不得擅自修改。

同引擎控制组/候选组适用既有严格视觉阈值；不同引擎先核对渲染模型，BRDF 不等价时不强求逐像素一致。颜色算子、变换、包围盒等可解析项目使用数值 oracle。

性能只在同机、同浏览器、同场景对照。建议 5 次独立重复、固定预热与测量帧数，报告 p50/p95、离散程度和原始数据；GPU 时间不可用时明确标识 CPU frame time，不能互换。沿用现有预算；无历史预算的指标先登记控制组噪声，再冻结回归阈值，禁止测试后追改门槛。不得套用上游 4x/0% 等数字作为本项目承诺。

### 6.3 失败分类

| 情况 | 分类/处理 |
|---|---|
| 合法公开用法在冻结参考实现中失败 | `ENGINE_FAILURE` 或既有对应分类；先定位引擎/文档/资产合同，不归咎 Agent |
| Agent 代码违反已发布的正确合同 | `AGENT_FAILURE` |
| 缺少浏览器、驱动启动失败、测试服务不可用 | `INFRA_FAILURE`；不计为成功，也不按普通模型失败偷算 |
| 预期的非法输入、取消或不支持组合返回正确错误 | 对应负例 PASS；不等于正向功能支持 |
| 政策拒绝/权限限制 | 单列 `POLICY_REFUSAL`，依既定 eligible_trials 规则报告 |
| 沙箱隔离失效 | 独立安全失败，阻断，不与策略拒绝混同 |
| 场景预期对象缺失但截图完成 | 功能/视觉失败，不是截图工具成功即 PASS |
| 缺证据、旧构建证据、子集或异常跳过 | `NOT_RUN` / `STALE` / `BLOCKED`，不得提升为 PASS |

有效失败只有在当前固定测试预算内修复并重跑才能变为新结果；旧失败、重试与原因始终保留。

## 7. 双引擎 Benchmark 设计

### 7.1 Engine Gate 与 Agent Gate 分开

Engine Gate 使用冻结人工参考实现和独立 oracle；Agent Gate 使用生成提交。可以复用 validator，但结果单独存储。不得用 Agent 生成代码补写参考答案后宣称公平对照。

本轮 Engine Gate：所有必需稳定用例 `100% PASS`，无未解释的新回归；必需环境缺失不能当作 PASS。既有 ≥100 项 Benchmark、Recipe 与 coverage 约束保留，其当前实际库存必须查验，不能根据历史计划宣称已达标。

Agent Gate：保留既定最终成功率 `≥80%`，同时报告首轮成功率、重试次数、token/时间、失败类别、公开 API 误用与验证覆盖。不得把未支持能力强塞到通用任务后据此比较模型。

### 7.2 三条受控比较线

- **主回归线**：冻结既有 three.js 版本，仅比较 CocosAirJS 控制组与候选组，判断本轮引擎变化。
- **资料改进线**：引擎固定，用旧/新公开文档与 Recipe 对比 Agent 生成结果，判断契约说明价值。
- **上游迁移线**：独立分支/环境测试 three.js 新提交或新正式版本，记录 API/效果变化，不更新正式基线，也不混入主回归分母。

通过分组避免同时改引擎、提示词、参考版本和阈值，导致无法归因。

### 7.3 新增聚焦任务

建议 12 个业务任务：基础加载；缓存策略；取消重试；共享资源多实例；动态 UV；虹彩参数；混合状态；双 RenderTarget；骨骼/裁剪；生命周期；首帧截图；独立 SDK 消费。

每任务先跑 3 次独立重复，每次用同一模型、同一输入与资源约束分别生成两引擎实现，即 **36 Pair / 72 Run / 每个候选配置**。若比较 Cocos 控制组与候选组两个配置，是 72 Pair / 144 Run；旧完整基准另计，不能宣称这 12 任务就是全量。

随机 seed 不保证模型完全确定性；记录模型版本、参数与运行标识。匹配性必须在生成前确定。某任务若对照引擎缺乏语义等价能力，移入能力专项并明确分母，不能为提高成功率临时剔除失败任务。

`eligible_trials`、最多重试与修复轮数沿用现有协议；若需调整，先版本化协议并同时重跑控制组。编译失败、运行时错误和超时按预先定义纳入，不允许事后移出分母；INFRA/拒绝/取消计数与可用 Pair 数单独公开。

## 8. 分批执行与并发规则

仅一个里程碑为 `in_progress`；每批最多 3 个互不冲突的 Agent，满足依赖后推进，不以“等用户再说继续”作为正常批次切换。

| 阶段 | 内容 | 并发与出口 |
|---|---|---|
| M0 | U00，读取现状/权限、冻结合同及场景清单 | 协调 Agent；未冻结不可开发 |
| M1 | U01、U02、U06 | 3 Agent；U06 先做基线，最终待 U01/U02 签名冻结 |
| M2 | U03、U04、U05 | 3 Agent；Shader/Material 共享文件按 owner 串行，不并发改同文件 |
| M3 | U07、U08、U09 | 最多3 Agent；U09 先完善稳定主题，实验主题等 U08 决策 |
| M4 | U10、统一候选、全量适用 Gate 与交付 | 协调 Agent；失败回到负责模块并使关联证据失效 |

共享文件 `package.json`、公共 export barrel、manifest、总能力表、CI 和发布证据只由协调 Agent 集成。各 Agent 可在授权隔离工作区产出增量 patch，不未经授权 commit/push。先代码/格式/类型/依赖和构建稳定，再采集候选证据；不能一个 Agent 采图时另一个继续改共享 SDK。

## 9. 验证命令与执行顺序

以下是**仓库现有入口示例，不代表本次已经执行**。先读取脚本说明，核对参数和写入行为。新增测试名称/开关须在实现时登记，不能把本计划中的建议名称当作现成命令。

```bash
npm ci
npm run typecheck
npm run verify:doc-refs
npm run verify:custom-exports
npm run verify:feature-exports
npm test -- --runInBand
npm run build:all
npm run verify:decoders
npm run verify:consumer
npm run verify:tarball-consumer
```

浏览器与阶段验收：

```bash
npm run verify:browser-matrix
npm run verify:perf-lifecycle
node tools/build/webgpu-assets.cjs --check
node tools/verify/webgpu-backend.cjs
```

完整示例按 `docs/reference/example-evidence-campaign.md` 和既有手动工作流执行，冻结时包含构建、Spark、声明、真实依赖、示例与工具；发布候选再运行 `npm run verify:release`。本计划不触发任何远程 workflow。

构建注意：runtime build 会推进 build number；`build:all` 编译开发/压缩版并消耗两个编号。`npm pack` 的 prepack 会准备发布副本，不能在冻结证据后当作无写入操作随意重跑。不要为了让两份产物看似一致而修改 build number/fingerprint。[R14]

完整格式检查按仓库配置执行，不对抽取源码或证据文件批量格式化。新增 npm script 要同步权威命令表和写入说明。运行后检查 Git diff，区分源码修改、构建计数、生成文件及运行证据。

## 10. 交付物与完成定义

建议工作包内形成以下交付，实际命名遵循仓库目录规则：

- 实施前后 SHA/差异、规范与上游来源映射、capability matrix、ADR。
- 最小修复及测试；新增公开 API 的类型/文档/迁移说明；没有证据的缺陷不得宣称已修。
- 36 场景及各执行维度的原始结果、请求记录、截图、状态摘要、资源计数、性能数据和错误日志。
- 8 个验收主题的实际实现位置、公开 API 清单、真实交互证据，以及业务展台。
- 固定 SDK 产物与隔离消费者结果；关联 decoder/WebGPU/Spark 资产身份。
- Engine Gate 与 Agent Gate 分开的报告，所有失败/重试/不适用/基础设施问题完整保留。
- 代码 patch、运行说明与完成/未验证/失败清单；是否提交、推送、发布单独等待授权，不默认执行。

稳定更新完成必须同时满足：公开接口兼容；已确认两类缺口（加载策略/取消、虹彩规范校验）有修复与回归；所有必需 Engine Gate 通过；Agent Gate 达到既定指标；示例实际可交互；当前候选证据完整且无过时引用；无未经授权的仓库/部署操作。

研究任务完成必须有实际证据支持的采用或不采用结论。环境阻塞可交付诚实的 BLOCKED，但不能把整轮写成全部完成。没有待决项时不再追问；遇到确需权限、规格重大歧义或环境缺口时只报告具体阻塞。

## 11. 可交给执行 Agent 的提示词

> 按《CocosAirJS 本轮更新计划：资源、渲染与 Code First 契约加固》实施已授权部分。先读取宿主指令、仓库 AGENTS、当前 SHA 和工作区差异；本计划调研基线为 b573be0741db9e2a13d38ce7e65870b97a1f5fbc，若主干已前进，记录差异并重核，不回退用户代码。先完成 U00，再按 M0—M4 执行；同一时刻仅一个里程碑 in_progress，每批最多3个互不冲突的 Agent。复用现有 Loader、Material、诊断、step-clock、SDK 消费与浏览器验证体系，不另造 Scene/Node/资源系统。优先落实源码确认的取消传递和请求策略缺口，以及虹彩 IOR 与 Khronos schema 不一致的问题；其他上游缺陷先在本项目最小复现，不能照搬补丁。保留默认 WebGL2、显式实验 WebGPU且不自动回退、透射单 capture、Spark独立模块、资源所有权、模型/Skill路由及原有CI触发。Reverse-Z/OIT/LightProbe按实验 Gate 处理，不能直接扩大稳定能力声明。所有实施与测试初始 NOT_RUN，数学基准独立于被测代码；视觉修改必须看真实浏览器结果。代码/依赖/工具变化后重新收集关联证据，不改旧指纹、不降阈值、不用空白截图或历史PASS。Engine Gate与Agent Gate分开，保留旧完整Benchmark并新增聚焦集；分开报告引擎、Agent、基础设施、策略和安全失败。交付增量patch、运行说明、文档、Examples及证据，明确完成/未验证/失败。未经明确授权不提交、推送、发布、部署、修改权限、处理真实凭据或删除重要数据。

## 12. 官方来源与本次读取记录

所有 CocosAirJS 源码链接固定到本轮调研 SHA。以下引用是源码/规范证据，不是本次运行通过证明。

### CocosAirJS

- [R1] README：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/README.md>
- [R2] 默认 WebGL2 支持策略：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/docs/webgl2-only.md>
- [R3] 实验 WebGPU：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/docs/guides/webgpu.md>
- [R4] GLTFLoaderOptions：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/assets/gltf/progress.ts>
- [R5] Loader：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/assets/gltf/loader.ts>
- [R6] 依赖请求：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/assets/gltf/parser-context.ts>
- [R7] 虹彩材质：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/assets/gltf/extensions/material/iridescence.ts>
- [R8] 色彩/预滤波合同：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/rendering/color-contract.ts>
- [R9] 只读诊断：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/rendering/engine-contracts.ts>
- [R10] 透射捕获：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/rendering/transmission-capture.ts>
- [R11] glTF 实例与共享资产：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/assets/gltf/asset.ts>
- [R12] 包结构与现有验证入口：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/package.json>
- [R13] AirApp 契约：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/src/air/app.ts>
- [R14] 仓库工作约定：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/AGENTS.md>
- [R15] 验证与发布政策：<https://github.com/oahc09/cocosairjs/blob/b573be0741db9e2a13d38ce7e65870b97a1f5fbc/docs/reference/verification.md>

### 上游变更

- [U1] three.js #34936，merge `00e83040432badf3e9b0dccf90ae57da65033d21`：<https://github.com/mrdoob/three.js/pull/34936>
- [U2] three.js #35110，merge `e4c703ab535134d4dc57294e0ce0a2e385a3b371`：<https://github.com/mrdoob/three.js/pull/35110>
- [U3] three.js #35113，merge `f67dcda032208b367f5965bbd835c16f839909c8`：<https://github.com/mrdoob/three.js/pull/35113>
- [U4] three.js #35140，merge `2da3301f1da172d00cc22715492f695f63a88173`：<https://github.com/mrdoob/three.js/pull/35140>
- [U5] BabylonJS #19010，merge `eae804fa9ef13cf7a224ffddce67f905970436c9`：<https://github.com/BabylonJS/Babylon.js/pull/19010>
- [U6] BabylonJS #19008，merge `716a42139fc62b1166fc77b7f445395f6ef00902`：<https://github.com/BabylonJS/Babylon.js/pull/19008>
- [U7] BabylonJS #19018，merge `628ff7a7ffc8a270cf8ec053b7a3e74c0a9a8d3d`：<https://github.com/BabylonJS/Babylon.js/pull/19018>
- [U8] Galacean #3133，merge `ec399c2fcb1f4404a741d4d7569f5a88076b2d54`：<https://github.com/galacean/engine/pull/3133>
- [U9] three.js #34909，merge `c396f2000d0c7592f53dbc58d53a02e167574ff4`：<https://github.com/mrdoob/three.js/pull/34909>

### 规范

- [K1] Khronos `KHR_materials_iridescence` schema：<https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_iridescence/schema/material.KHR_materials_iridescence.schema.json>。本次读取 content blob SHA：`2d8e06517f8ff7f0bdf10f34838b2f6eebd150f0`；实施时固定规范版本，不凭动态 main 静默改变验收合同。
