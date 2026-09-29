# Cocos Air — Developer Ecosystem & Agent Ready Runtime 任务计划书

> 状态：修订后的实施计划，尚未执行 Developer Ecosystem。修订日期：2026-09-13（第三次修订：glTF Extension Coverage 先行，见 §11.3）。
> 核心交付：可在空项目安装使用的包、可发现的示例入口、显式启用的开发期观察与操作工具。
> 执行顺序：glTF Extension Coverage 完成 G5 并移交后，再实施 Developer Ecosystem。本版消费 glTF Extension Coverage 成果，不恢复离线导入器要求。

## 0. 当前基线与版本关系

| 阶段 | 当前职责/交付 | Developer Ecosystem 的处理 |
|---|---|---|
| Engine Extraction | 独立 Web/TS 引擎、构建和 Code First 启动 | 保留引擎布局、能力边界和上游记录 |
| Code First DX | helper、声明、source map 与开发反馈链 | 使用 Standalone Asset Pipeline 前置审查补修后的实现 |
| Standalone Asset Pipeline | 资源 Inspect/Validate、多实例生命周期、独立静态验证 | 增量扩展既有工具，不重建资产系统 |
| glTF Extension Coverage 先行交付 | 冻结公共接口、扩展 registry、三类 decoder、构建/发布约定、capabilities 与性能证据 | 作为本版唯一直接交接基线；增量消费，不另建等价机制 |
| Developer Ecosystem | 包消费、示例导航、开发期 Agent 工作闭环 | 不增加渲染/物理/UI 等引擎功能 |

实施依据：

- [Standalone Asset Pipeline 任务书](<Cocos Air — Standalone Asset Pipeline 任务计划书.md>)。
- [Standalone Asset Pipeline 集成指南](../docs/versions/10-v03-runtime-integration.md)与[验收记录](../docs/versions/11-v03-verification.md)。
- [Standalone Asset Pipeline 独立复审](../docs/versions/acceptance-review-v03.md)：仅作为历史证据；旧缓存异常不再单独设为本版追因任务。
- [glTF Extension Coverage 计划书](<Cocos Air — Full glTF Extension Coverage 任务计划书（参考 Three.js GLTFLoader）.md>) §3、§4、T7/T8、G5 与 §10：分别规定公共接口、所有权、构建交付、示例/文档和性能口径。
- [模型加载指南](../docs/gltf/gltf-runtime.md)与[官方模型目录](../docs/gltf/gltf-catalog.md)：开工时采用 glTF Extension Coverage 最终验收 revision 对应版本，包括 capabilities.json 与新增 viewer 场景。

状态区分：2026-09-13 修订时可见 glTF Extension Coverage 源码和 decoder 未提交改动，setDRACODecoder 已有实现；这些仅证明工作已启动，不证明 G5 已通过。本计划描述交接后的目标基线，不把当前工作区宣布为已完成。glTF Extension Coverage 未交接时，可继续只读核对与计划工作，不以缩小模型验收范围绕过交接门禁。

当前没有 tools/import、离线资产包或 asset build performance 基线。整体关系为：模型任务提供 Runtime 数据，Standalone Asset Pipeline/Developer Ecosystem 使用原 Cocos API 组装、观察与验证。

## 1. 继承约束与非目标

1. 保留 build/docs/examples/src/test/tools 一级结构，不引入 packages/addons/plugins/sdk/framework 产品层。
2. 保留 Scene、Node、Component、Camera、MeshRenderer、Material、Animation、Skeleton；不新增 AirScene/AirNode/AirModel。
3. 保留 createAirApp 和既有 helper 的签名、源代码布局、构建命令及 cocosair.module.js/.min.js/.module.d.ts 产物命名。
4. 不新增 Runtime Asset Format、AssetDB、离线编译器或重复的 GLTFLoader。
5. 调试/Agent 能力位于 tools/debug，复用 tools/verify 与 tools/dev；不从 src/air/index.ts 导出，不进入默认运行时包。
6. 不实现 MCP、远程控制服务器、任意代码执行、编辑器、插件系统、状态机或动画重定向。
7. 不将 glass、particle、postprocess、gesture 等未经当前能力验证的功能作为硬交付；不为凑示例改动引擎闭包。
8. 本次只修改计划。后续实施保留其他任务改动；暂存、提交、推送、注册包名、npm 发布和远端部署均不属于默认实施动作。

## 2. Task T0 — 冻结交接与修订验收口径

开工记录 glTF Extension Coverage 最终交付 revision、HEAD 与差异、Node/npm、工具链版本及 G5 证据。由 glTF Extension Coverage 负责人移交冻结成果；本版不自动提交或清理其他任务内容。

- 核对 glTF Extension Coverage G5-build/G5-release、最终支持矩阵和真实交付清单，复用其证据；变动或缺证路径补验，不回退到 Standalone Asset Pipeline/旧 smoke-07 子集作为本版标准。
- 直接采用 glTF Extension Coverage §3 的完整接口及 d.ts 消费合同：GLTFLoader/GLTFAsset/GLTFInstance、LoaderOptions、取消/进度、register/unregister、getExtensionSupport、三个 decoder 注入接口、configureGLTFLoaderDefaults 与原生加载入口。不得另复制一份可能漂移的签名表。
- `build/gltf-decoders/` 的 draco、meshopt、basis 三类运行期文件是必含交付，沿用 glTF Extension Coverage 固定的版本、来源、SHA-256 和许可。缺文件、hash 或离线复现证据即阻塞交接，不允许以排除解码器通过 G1。
- 移交 package.json、lockfile、exports/files、装配脚本、build/dev server、示例清单及文档索引。glTF Extension Coverage 独占任务结束后由 Developer Ecosystem 维护，不能假设仍需并发改写。
- 缓存可观测性消费 glTF Extension Coverage T7 最终实现的 cold/hit/config mismatch/read failure 记录。只对新基线缺失的诊断补最小观测，不对将被替换的 Standalone Asset Pipeline 脚本独立追因，不把历史猜测写成现状。
- 统一文档中的历史测试计数与最新结果引用，保留各自测量日期；独立复审脚本标注用途，不直接替代主验收脚本或再复制一套。

门禁 G0：glTF Extension Coverage G5 完成且冻结成果已移交，API、decoder、包机制、示例和文档基线齐全。交接前 T1/T4 不开工，不能收缩验收绕过门禁。非阻断历史告警继续记录；后续 Developer Ecosystem 自身修改按本版授权与验证流程管理，不将其他任务未交接内容混入。

## 3. Task T1 — 可安装包与独立 Consumer

### 3.1 沿用 glTF Extension Coverage 包机制与模块配置

以 glTF Extension Coverage 终态的 package.json 与工具链为准。若根包仍为 type:commonjs，保持其 Jest/Babel 启动方式；若 glTF Extension Coverage 已完成 ESM 迁移，保留已验证迁移，不反向改回旧配置。

先审计 glTF Extension Coverage 已交付的 exports/files/发布装配机制并增量强化，不默认另建暂存流水线。仅在其没有发布暂存机制且确需隔离 ESM 时，沿用本计划的 build 临时暂存目录方案。复用现有构建和声明工具，不修改 node_modules，不拆掉 glTF Extension Coverage 已通过的 npm pack 约定。

包显式白名单必须包含 normal/minified ESM、对应 map、cocosair.module.d.ts、README、许可文件，以及 `build/gltf-decoders/{draco,meshopt,basis}/` 的完整运行依赖（含所需 JS/WASM/worker）。版本/hash/license 直接核对 glTF Extension Coverage 交付记录，不重新选型或漏掉配套文件。默认排除 src、test、tools、fixtures、output、构建日志与缓存；校验实际 tarball 清单，不能仅依赖 .gitignore。

发布暂存 package.json 的关键约定：

- main/module 指向 build/cocosair.module.js。
- types 与 exports 的 types 条件指向 build/cocosair.module.d.ts；不改成不存在的 cocosair.d.ts。
- import/default 条件指向现有 ESM 产物；不承诺 CommonJS require 或无 DOM 的 SSR 支持。
- 版本、许可和 Node 要求有明确来源；发布 README 只引用随包提供的文档或有效线上地址。
- 如 NodeNext 消费要求声明内部相对引用具有 .js 后缀，在暂存阶段做最小适配，并用类型测试证明；不改变 SDK 导出语义。
- source map 保留正确文件名与 sourcesContent，使不携带源码仓库的消费者仍可定位源码；不泄露本机绝对路径。

### 3.2 包名与发布分开处理

包名采用 glTF Extension Coverage 交付的 package.json；修订时仍为 cocosair.js，示例中的 cocosair 是 importmap 别名。本阶段不假设 npm 上 cocosair 可用或由用户拥有，也不自动重命名根包。

本地验收默认保留现有包名，并验证 npm alias 安装后可以使用 import 'cocosair' 的体验。正式发布前再确认包名、版本、registry 与维护权限；这只阻塞发布，不阻塞本版本地包消费验收。

实施后的命令目标是：用 npm pack 从暂存目录生成 .tgz，在独立临时 consumer 中通过 npm install 安装该 tarball。确切文件名由装配脚本输出，不在计划里伪造已存在的包。

### 3.3 Consumer 验收

consumer 不位于引擎源码树内，不能用仓库 importmap、tsconfig paths、源码软链接或深层相对路径绕过包入口。安装依赖完成后，即使无法访问引擎源码目录也应能完成：

1. 导入 createAirApp、Scene、Node、helper 和 glTF Extension Coverage §3 全部冻结模型接口，类型提示与预期类型错误正常；复用并扩展其 d.ts consumer 测试，而非收缩至旧 smoke-07。
2. 在已有 GameCanvas DOM 模板下启动 starter 和一个可见 3D 示例；不宣称修复 import 阶段 DOM 约束。
3. 用一种已核验兼容的常规 Web 构建工具构建并静态运行，嵌套部署路径正常；只选择一种作为本版基准，版本在 T0/T1 实测后锁定。
4. normal/minified 入口与 source map 工作，资源 HTTP 错误能被观察。
5. 实际安装包不夹带开发工具、测试资产或缓存，也不依赖 Creator；模型代码与声明对应冻结交付版本。
6. 安装后屏蔽外部网络，仅使用包内 decoder 和本地验证资产，通过 Draco、Meshopt、KTX2/BasisU 各一条实际解码/可见渲染路径；验证嵌套部署 URL、JS/WASM MIME、worker URL 与固定 hash。未使用压缩扩展时不初始化 decoder/worker。

门禁 G1：本地 tarball 安装、类型、构建与浏览器使用均通过。正式 npm publish 不属于本版 DoD。

## 4. Task T2 — Examples First 学习入口

### 4.1 保留旧路径，增加导航

保护对象是 T0 冻结的 glTF Extension Coverage 终态示例集，包括历史六个示例、glTF Extension Coverage 新 viewer 场景、gltf-catalog/capabilities.json 与 decoder/设备提示。保留其 URL、目录 ID、能力状态、模型 revision 和来源许可，不以 Standalone Asset Pipeline 清单替代完整基线。

新增示例导航页，按“入门 / 变换与相机 / 材质 / 模型 / 交互 / 自动化”分类。分类可以是元数据，不要求对应物理目录。官方模型目录继续链接现有 gltf-catalog，不复制其资源列表或对照预览实现。

最小新增学习内容：

- transform：层级与局部/世界变换。
- camera：透视、正交及 frameObject。
- input：原生 Web Input 的一个已支持交互，用键鼠或触摸的实际实现验收，不引入手势框架。
- automation：使用开发期观察/操作工具完成一次闭环，无外部模型或 AI 服务调用要求。

已有 hello-cube、static-model 和 gltf-viewer 分别承担基础渲染、纹理与模型/PBR 学习内容，不另造同义演示。

### 4.2 示例发现与兼容

先消费 glTF Extension Coverage T7 的示例发现/枚举和 decoder 静态服务。若已支持递归发现与相对目录 ID，仅补导航集成和测试；有缺口才增量补齐，不能另起一套枚举器或二次重写 dev server。排除 shared、assets、缓存和非示例文件，保留 glTF Extension Coverage 的 MIME/worker/decoder 路由。

默认仍打开 starter。目录导航可采用 --example 的目标导航页或单独固定 URL，不改变旧 URL。目录名与 ID 冲突、路径穿越或缺失入口应给出明确错误。

验收至少一个真实嵌套示例（优先复用 glTF Extension Coverage 已有示例，缺失才新增）：发现、选择、页面加载、源码链接、TS 编译、保存后刷新正常；以 glTF Extension Coverage 全量示例与最终静态验证入口回归，保留仍适用的 Standalone Asset Pipeline 用例。

新示例包含 index.html、main.ts、README.md；旧示例允许保留 main.js，只补缺少的说明，不为格式统一重写全部样例。README 写明前置 DOM、启动 URL、能力边界、资源来源与预期操作。

门禁 G2：旧示例不退化，新示例和导航可发现、可运行，页面改动经过真实浏览器检查。

## 5. Task T3 — 增量 Scene/Node/Asset Inspection

保留 tools/verify/runtime-assets.js 的资源去重、references、diagnostics、unchecked 语义；tools/debug 在其上增加 Scene/Node 视图，不新增第二套资产校验器。

开发期由显式 attach 的 session 绑定 app/scene/SDK namespace，不读取隐藏全局引擎状态来猜测目标。绑定契约在本阶段冻结，UI 与自动化脚本使用同一实现。

### 观察数据合同

- Scene：当前 scene ID、节点数、Camera/Light/Renderer 组件数及资源计数；区分组件数、节点数、唯一资源数。
- Node：id、name、parentId、childrenIds、active、组件列表和 local/world transform；不把普通 Node 的 type 简化成 SkinnedMesh。
- Asset：复用既有资源报告，并保留无法只读判断的 unchecked；不把未知状态写成 PASS。
- ID：session 内稳定，同名节点仍不同；对象销毁后失效，页面重载或 scene 替换后旧 ID 返回 STALE_TARGET。不得以名称或每次遍历序号充当稳定操作目标。
- 数据可 JSON 序列化，不含活对象、循环引用或任意代码；数量/深度上限须明确，截断返回 truncated 和未覆盖范围。

开发期接口名称可采用 inspectScene、inspectNode、inspectAsset，但都属于 tools/debug session，不加入默认 cocosair Runtime 导出。

门禁 G3：重复观察、同名节点、销毁节点、场景替换和截断均有确定结果；检查不增加资产引用、不创建 MaterialInstance、不执行 custom resolver 来补齐报告。

## 6. Task T4 — 显式启用的 Agent Development Session

### 6.1 启用与数据边界

工具通过开发页面或显式 dev 选项 attach，默认关闭。默认 npm 运行时包与普通静态示例不加载该工具、不创建控制端点。

本版仅支持同一开发页面内调用；自动化工具可以通过浏览器调用 session。没有 MCP、远程 HTTP/WebSocket 控制协议，也不把截图/场景数据自动发送给 Vision Model 或外部服务。

session 接受明确的可写 scene/root 范围。没有可写授权的对象只能观察；detach 后所有请求返回 SESSION_CLOSED，并移除监听器、观察 hook 与工具自身 UI。

### 6.2 最小操作合同

单条请求包含 requestId、action、targetId 与参数；返回 requestId、ok，以及可序列化 result 或 error。所有操作返回 Promise，失败不得吞掉原始原因；错误码至少区分 INVALID_ARGUMENT、STALE_TARGET、OUT_OF_SCOPE、UNSUPPORTED_ACTION、LOAD_FAILED、SESSION_CLOSED。

| 操作 | 行为 | 边界 |
|---|---|---|
| createNode | 在许可父节点下创建原 Node，返回 nodeId | 不生成场景 DSL |
| addComponent | 按明确白名单添加原 Component | 不按任意字符串动态 import；未知类型失败 |
| setTransform | 明确 local/world 空间，设置给定变换 | 先验证目标与数值；本版不支持含歧义的任意属性赋值 |
| loadAsset | 调用已有公开加载入口，返回资源 ID/摘要 | 不解析格式；记录 URL、错误与 session 持有引用 |
| instantiateAsset | 对已支持的资产调用其现有实例化能力 | 不新增 AirModel；返回原节点的 ID，实例生命周期沿用原合同 |

同步变更在验证后串行执行，不提供事务或跨命令回滚承诺。加载期间可以观察；其完成回调必须重新检查 session 与目标有效性，关闭/切场景后不得再挂载节点。

requestId 用于关联，不承诺跨重载 exactly-once；同一 session 正在执行或仍在保留窗口内的重复 requestId 明确拒绝，文档说明不要盲目重试 create/add 操作。保留窗口和上限由实现固定并测试。

session 只清理自己创建的实例、持有的引用和注册的监听器；不得销毁已有共享资产。关闭时清理自有节点，已有节点的显式编辑不自动撤销；异步失败和关闭后完成的加载也必须释放本 session 的引用。

加载缓存和生命周期直接消费 glTF Extension Coverage §4：临时/失败资源归 parser cleanup，成功共享资产归 GLTFAsset，实例沿用 GLTFInstance.dispose，session 只管理自己的引用与对象。不得在 session 中重新实现 dependency cache、decoder cleanup 或扩展 registry。

模型扩展能力读取冻结的 getExtensionSupport()；GLTF 稳定错误码保留在 session 错误 cause/code 中，不仅转换成无差别 LOAD_FAILED。组件白名单仍控制 addComponent，它与 glTF 扩展支持不是同一清单，不能互相替代。Session 不再维护一份扩展名支持表；capabilities.json 的验证记录与当前设备能力分别展示。

### 6.3 Frame Capture

captureFrame 返回 PNG 数据或浏览器侧 Blob，加 width/height、scene ID、采样时间与帧标识。截图范围固定为 canvas；调试 UI 截图是独立操作，不能混入渲染验收。

捕获必须在渲染完成的受控时机进行，复用既有浏览器像素验证经验；不能假定任意时刻读取 drawing buffer 都有效。默认不改变游戏播放状态；确定时间采样模式若暂停或推进运行时，必须显式启用并在 finally 恢复状态。

验证图片可解码、尺寸正确、非空场景有前景，并用已知操作前后差异确认是新帧。空场景是合法情况，不能以“图片不全黑”作为唯一成功标准。canvas 不可读、跨域污染、上下文丢失、超时或 scene 已替换时返回明确错误，不交付旧截图冒充新帧。

### 6.4 Error Collection

复用 tools/dev/air-prelude.js 的非侵入错误观察，避免重复包裹 WebGL 函数。getRuntimeErrors 接受 since/limit，返回序号、时间、类别、消息、来源位置和可关联的 requestId。

收集 session 加载失败、window error/unhandledrejection 与 shader/link 失败。采用有容量上限的环形缓冲，暴露丢弃计数与清理接口；不能增长无界，也不能调用 getError 消耗引擎错误队列。

attach 必须幂等，detach 恢复自身安装的 hook；若共享现有观察器则取消订阅，不覆盖其他任务后安装的 hook。dev-server 与 session 共用 air-prelude 时必须走订阅/分发，不得各自包裹同一 WebGL 函数；hook 安装顺序与卸载行为写入 session 合同并有测试覆盖。不承诺捕获 attach 之前已丢失的错误。

门禁 G4：一次 create → transform → inspect → capture → validate 闭环通过；非法请求无副作用；重复/失效 ID、加载失败、关闭中加载与 hook 恢复有针对性验证。requestId 保留窗口是 session 内存语义：重启 dev server 或页面后不恢复、不跨实例去重，文档明确告知。

## 7. Task T5 — 最小 Debug Tool

tools/debug 提供一个显式启用的开发面板：Scene Tree、选中 Node 的只读详情、Asset 清单与诊断、错误列表、canvas 截图入口和已采集的性能摘要。

面板调用 T3/T4 同一 session，不直接另写引擎操作路径。第一版不做通用 Inspector 属性编辑器；必要操作通过自动化示例演示。

保持画布可见、键盘操作和窄屏可用，面板错误不能中断业务主循环。关闭面板后无残留监听器或工具节点。用户业务页面无工具启用时，默认包与加载请求中均不包含 debug/agent 模块。

门禁 G5：真实页面中完成查看、定位错误、截图与关闭；自动化使用同一接口得到对应结果。

## 8. Task T6 — 可比较的 Runtime Baseline

直接引用 glTF Extension Coverage G0/T0、§10 和 G5 最终性能报告：固定 BoxTextured 的 revision/hash、加载与释放口径、主 bundle 与三类 decoder 体积，作为长期参照。不虚构 asset build 性能，也不把不同环境的数字直接比较。记录以下新增指标的精确定义：

| 指标 | 起止点/口径 |
|---|---|
| startup | 页面启动标记至 createAirApp resolve |
| scene ready | scene 运行请求至指定 scene 激活完成 |
| first visible frame | scene 激活至首次符合已知画面条件的渲染帧；不以 requestAnimationFrame 到达代替 |
| asset load | 已有公开加载入口调用至 Promise 完成；冷/热缓存分开 |
| debug overhead | 同一场景、同一操作下工具关闭/开启的可比数据 |
| memory | 区分 JS heap、引擎对象/引用计数与 GPU 可见信息；不可获得项记 unavailable |

固定 OS、浏览器、WebGL 后端、视口、资产及工具状态。工具关闭时的 BoxTextured 加载回归沿用 glTF Extension Coverage 的 30 次中位数与相对 glTF Extension Coverage G0 不回退超过 15% 的同口径要求；无法复现原环境时先重测冻结交付基线，并保留原历史结果，不拿异机数据计算回退。debug overhead 单独比较同一场景与操作的工具开/关结果；其他新增指标每配置至少 3 次，报告中位数/范围，加载回归不得降为 3 次。

不引入渲染器调优目标，不以一次 GC 证明无泄漏。内存 API 不可用不阻断功能验收，但必须有实例/监听器/引用清理的行为证据。

## 9. Task T7 — 验证、文档与发布准备

### 9.1 测试发现

继承 glTF Extension Coverage 最终测试目录与发现规则，不按旧 smoke-only 配置重建。新增单测若进入尚未被发现的目录，先最小扩展规则并以 jest --listTests 证明执行；不新增 test/runtime、test/agent 平行体系，不遗漏 glTF Extension Coverage 扩展领域测试。

保留现有 transform、setup 与断言，不能关闭检查或降低阈值来迁就 ESM/目录变更。浏览器测试复用现有 Playwright 入口，明确主验收和独立复现脚本的区别，不重复建设多套调度器。

测试覆盖：

- tarball 文件清单、空项目安装、类型消费、构建与浏览器运行。
- 旧路径与嵌套示例发现，TS 编译失败恢复，Example-only reload 不重建引擎。
- ID 稳定性、失效引用、只读 inspection、错误输入与可写范围。
- 生命周期、关闭中的异步请求、重复请求策略、错误缓冲上限和 hook 恢复。
- canvas 新帧、空场景、错误路径、面板关闭与默认运行时零调试依赖。

保留项目强制命令：build、build:min、build:dts、typecheck、verify:web-only、npm test；按变动补跑 source-maps、build-cache、dev-loop 和浏览器回归。依赖图守卫须覆盖 debug 未进入默认 runtime 的边界，不能只按文件名搜索代替真实输出检查。

### 9.2 文档连续性

优先更新 docs/06、09、10、11 及已有 gltf-runtime/gltf-catalog 文档的链接，不重建 getting-started/code-first-guide/asset-pipeline 同义体系。

glTF Extension Coverage 的 gltf-runtime、gltf-extension-reference、gltf-decoder-deployment、gltf-validation 四份文档及 capabilities 必须先移交。其已占编号以最终文档索引为准；原预留 13–16/18 撤销。T0 交接后才分配下一空闲编号并更新引用，本表仅指定主题和文件名后缀，不声明编号已空闲：

| 文档 | 内容 |
|---|---|
| v051-package-consumption.md | 沿用包机制的审计、decoder 清单、consumer、正式发布边界 |
| v051-examples.md | glTF Extension Coverage 示例基线、导航、旧路径与嵌套示例 |
| v051-agent-development.md | session 合同、能力/错误消费、生命周期与限制 |
| v051-runtime-baseline.md | glTF Extension Coverage 性能参照、新增指标及工具开销 |
| v051-verification.md | 交接 revision、测试发现、矩阵、证据与 Deviations |

修订时 12 已有 glTF Extension Coverage ADR、17 为历史报告；这不是终态空位保证。README、THIRD_PARTY_LICENSES.md 和 decoder notice 从 glTF Extension Coverage 版本增量合并，不按 Standalone Asset Pipeline 模板重建。Developer Ecosystem 可做文档/发布收口，但支持声明仍受 G5 证据和 supported/decoder-required/device-dependent/fallback 状态约束，不宣称所有设备无条件支持。

### 9.3 正式发布的独立门禁

本版先交付可审核 tarball、文件清单、版本元数据、许可与消费结果。只有用户另行授权正式发布，才核实名称/registry 权限并执行发布；不得先发布再补确认。

发布未授权时，本地分发验收可以完成，但不得声称 npm registry 已可安装。没有授权的远端部署同理。

## 10. 执行顺序与验收矩阵

顺序：glTF Extension Coverage G5 与成果移交 → Developer Ecosystem T0 → T1 包消费审计 → T2 示例入口 → T3 观察 → T4 操作/反馈 → T5 面板 → T6 基线 → T7 总验收。文档随任务增量编写；Developer Ecosystem 明确承接 glTF Extension Coverage 交付。

默认不启动多 Agent。后续若明确分工，包分发与示例内容可独立推进；package.json、dev server、session 合同和测试配置由单一整合者管理，外部模型任务文件不并发编辑。

| ID | 必需验收 | 证据/退出标准 |
|---|---|---|
| L0 | glTF Extension Coverage 终态交接 | G5、完整 §3 接口、三类 decoder、包机制、示例、文档与 revision 齐全；不得收缩到 Standalone Asset Pipeline 子集 |
| L1 | 包审计正确 | 沿用 exports/files/装配机制，三类 decoder 及固定 hash/license 必含，无工具/缓存泄漏 |
| L2 | 空项目消费 | 完整冻结接口类型通过；包内 Draco/Meshopt/BasisU 离线解码及可见渲染通过，无源码仓库依赖 |
| L3 | 示例学习入口 | 旧路径保留，新内容可发现；至少一个嵌套示例从选择到刷新通过 |
| L4 | Scene/Node/Asset 观察 | 数量口径、稳定 ID、销毁/切场景失效和 unchecked 正确 |
| L5 | Agent 操作 | 请求/响应合同、可写范围、错误无副作用、异步关闭与引用清理通过 |
| L6 | 截图 | 可解码新帧、canvas 范围、空场景与错误行为明确 |
| L7 | 错误收集 | 分类/游标/容量上限、加载与 shader/runtime 错误可见，不消耗 WebGL 错误队列 |
| L8 | Debug 面板 | 使用同一 session，显示/关闭经过实际 UI 验证，默认包不包含工具 |
| L9 | 性能记录 | 指标起止点、至少 3 次采样、环境和 unavailable 项明确 |
| L10 | 测试与兼容 | 新测试真实执行，glTF Extension Coverage 终态构建/声明/守卫/全部示例、capabilities 与 decoder 服务不退化 |
| L11 | 文档与边界 | 安装、使用、能力限制与复现完整，无虚构资产生产或 registry 发布声明 |

Definition of Done：以上必需项通过，交付实现 diff、含三类 decoder 的 tarball/清单、测试/画面证据和连续文档；限制如实列出。glTF Extension Coverage glTF 扩展交付是本版前置；正式 registry 发布、MCP 和未来交互框架不是隐含完成条件。

## 11. 修订记录与 Deviations

### 11.1 首次修订（吸收 Standalone Asset Pipeline 交付事实）

| 原计划问题 | 修订处理 |
|---|---|
| 把 Standalone Asset Pipeline 当离线 Asset Pipeline | 使用运行时加载与资源集成真实基线，不要求 tools/import |
| 根包直接 type:module | 默认采用发布暂存目录 ESM，保留根 CommonJS 工具链 |
| d.ts 改名且未迁移 | 沿用 cocosair.module.d.ts，校验实际打包入口 |
| npm install 假设名称已发布 | 先 tarball/alias 消费；registry 名称与发布另行授权 |
| 全面移动示例/新增未支持能力 | 保留旧 URL，递归发现与分类导航；最小新增示例限已有能力 |
| Inspector/Action 位置与语义不清 | tools/debug 开发期 session，明确 ID、范围、异步、错误和生命周期 |
| test/runtime、test/agent 无发现规则 | 维持 smoke/unit，变更发现规则并验证 listTests |
| 文档重复、性能口径不明 | 连续编号与既有文档增量，定义指标及测量方法 |
| 忽略新增官方模型目录和独立复审 | 复用 gltf-catalog 与已交付验收资料，记录复审建议 |

实施中的偏离继续按”原因 → 证据 → 影响 → 处理 → 是否改变验收”记录。若需要新增引擎能力或改动已约定的外部任务范围，单列后续任务，不通过修改本版验收标准夹带实现。

### 11.2 第二次修订（2026-09-12，吸收计划审查）

以下为历史修订记录；其中“未冻结则收缩”“解码器随包/排除二选一”和预留编号已由 §11.3 覆盖，不作为当前执行规则。

| 审查发现 | 修订处理 |
|---|---|
| T1/T4 依赖的 glTF 公开 API 仍未提交，”记录冲突”不构成稳定合同 | T0 增加硬前置：glTF 提交并冻结公开签名；无法完成则收缩 consumer/session 验收至 smoke-07 已覆盖范围（§2、G0、L0、§6.2） |
| 暂存白名单未覆盖 build/gltf-decoders，压缩编码模型的打包边界未决 | T0 强制落位（随包/排除二选一），§3.1 白名单与 L1、§3.3-5 同步 |
| docs/12 已被 glTF Extension Coverage ADR 占用，预分配编号失效 | §9.2 编号表更正为 13–16 与 18，保留”下一空闲”兜底规则 |
| test/unit 尚不存在却写成”沿用” | §9.1 改为”当前仅有 smoke；建 unit 须先扩展发现规则并以 --listTests 证明” |
| 嵌套示例是新增义务而非既有回归保护 | §4.2 明确本阶段至少新增一个真实嵌套示例验证发现能力 |
| dev-server 与 session 共用 air-prelude 的 hook 叠加顺序未定义 | §6.4 要求订阅/分发合同与测试；G4 补充 requestId 保留窗口不跨重启 |
| T6 “同一场景同一操作”缺基准场景 | §6 指定基准场景定案（建议 gltf-viewer 固定目录模型），保证 debug overhead 可比 |

### 11.3 第三次修订（2026-09-13，glTF Extension Coverage 先行）

| 顺序变化后的问题 | 当前执行规则 |
|---|---|
| Developer Ecosystem 仍等待零散 glTF API 冻结 | 整体等待 glTF Extension Coverage G5 移交，直接引用其 §3；不收缩到旧 smoke-07 |
| decoder 仍允许排除 | Draco/Meshopt/BasisU 运行文件必含，沿用固定 hash/license；缺失阻断包验收 |
| 追因针对旧 Standalone Asset Pipeline 缓存脚本 | 消费 glTF Extension Coverage T7 的最终诊断，只补实际缺口 |
| 旧示例集合停留在 Standalone Asset Pipeline | 使用 glTF Extension Coverage 终态 URL、viewer 场景、capabilities 和部署服务 |
| 预分配文档编号已漂移 | 四份 glTF 文档与编号索引移交后再分配，不保留 13–16/18 空位假设 |
| dev server、exports/files 二次建设 | 审计并增量扩展 glTF Extension Coverage 已交付入口；不预设其必须重写或必须新增暂存机制 |
| session 重复维护模型能力与生命周期 | 消费 getExtensionSupport、稳定错误码及 parser/GLTFAsset 所有权分层；组件白名单保持独立职责 |
| “全支持”表述扩大到全部设备 | 仅在 G5 证据范围内收口文档，保留解码器/设备/fallback 限制 |

本次只修订两份计划，没有修改 glTF Extension Coverage 实现、终止其执行任务或自行完成交接。现有工作区实现仅视为进行中证据，实际完成以 Gate 和移交记录为准。
