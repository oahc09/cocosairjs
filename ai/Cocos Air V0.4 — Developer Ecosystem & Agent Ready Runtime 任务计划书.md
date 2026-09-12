# Cocos Air V0.4 — Developer Ecosystem & Agent Ready Runtime 任务计划书

> 状态：修订后的实施计划，尚未执行 V0.4。修订日期：2026-09-12。
> 核心交付：可在空项目安装使用的包、可发现的示例入口、显式启用的开发期观察与操作工具。
> 承接 V0.3 真实交付；glTF/GLB 加载和格式扩展仍由对应任务负责，不恢复离线导入器要求。

## 0. 当前基线与版本关系

| 阶段 | 当前职责/交付 | V0.4 的处理 |
|---|---|---|
| V0.1 | 独立 Web/TS 引擎、构建和 Code First 启动 | 保留引擎布局、能力边界和上游记录 |
| V0.2 | helper、声明、source map 与开发反馈链 | 使用 V0.3 前置审查补修后的实现 |
| V0.3 | 资源 Inspect/Validate、多实例生命周期、独立静态验证 | 增量扩展既有工具，不重建资产系统 |
| 外部模型任务 | GLTFLoader/GLTFAsset、模型查看器、官方模型目录与对照 | 复用公开入口、示例和资源许可；支持范围以其最终交付为准 |
| V0.4 | 包消费、示例导航、开发期 Agent 工作闭环 | 不增加渲染/物理/UI 等引擎功能 |

实施依据：

- [V0.3 任务书](<Cocos Air V0.3 — Standalone Asset Pipeline 任务计划书（与 V0.2 连续版）.md>)。
- [V0.3 集成指南](../docs/10-v03-runtime-integration.md)与[验收记录](../docs/11-v03-verification.md)。
- [V0.3 独立复审](../docs/acceptance-review-v03.md)：报告维持通过判定，列有缓存偶发失效、验证口径与脚本复用建议。本次计划修订未重新运行该报告的测试。
- [模型加载指南](../docs/gltf-runtime.md)与[官方模型目录](../docs/gltf-catalog.md)：属于外部任务成果，当前仍有进行中的修改，不能把工作区快照当作冻结版本。

当前没有 tools/import、离线资产包或 asset build performance 基线。整体关系为：模型任务提供 Runtime 数据，V0.3/V0.4 使用原 Cocos API 组装、观察与验证。

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

开工先记录 HEAD、工作区差异、Node/npm、工具链版本和本轮范围，不强制清理或提交。

- 对照 V0.3 自验收、独立复审和外部模型任务的最终文件，确认哪些能力已交付、哪些仍在变化。
- 复用已有证据；变动或缺少证据的路径补验。不能以“V0.3 全部通过”推定后续未提交修改已通过。
- 明确 package.json、公共导出、build-dts、dev server 和外部模型目录的写入归属。
- 复审中的缓存偶发失效先补可观测原因：记录 cold/hit/config mismatch/read failure 等状态，避免把猜测写成竞态结论；不为此扩大构建器重构。
- 统一文档中的历史测试计数与最新结果引用，保留各自测量日期；独立复审脚本标注用途，不直接替代主验收脚本或再复制一套。

门禁 G0：本版依赖的运行时/构建基线可复现，实际阻塞已解决。非阻断历史告警明确列出，不屏蔽或降级强制检查。

## 3. Task T1 — 可安装包与独立 Consumer

### 3.1 保留工具仓库的 CommonJS 配置

当前根 package.json 是 type:commonjs；jest.config.js、babel.config.js 和测试启动脚本使用 CommonJS。V0.4 默认不直接把根包切成 type:module。

采用发布暂存目录方案：在 build 下的唯一临时子目录生成待打包文件与 package.json，仅该目录声明 type:module。使用现有构建和声明工具，增加发布装配步骤，不建立第二套编译流水线，也不修改 node_modules。

暂存包显式白名单包含 normal/minified ESM、对应 map、cocosair.module.d.ts、README 和许可文件；默认不包含 src、test、tools、fixtures、output、构建日志、缓存或 d.ts 临时目录。校验实际 tarball 文件清单，不能仅依赖 .gitignore。

发布暂存 package.json 的关键约定：

- main/module 指向 build/cocosair.module.js。
- types 与 exports 的 types 条件指向 build/cocosair.module.d.ts；不改成不存在的 cocosair.d.ts。
- import/default 条件指向现有 ESM 产物；不承诺 CommonJS require 或无 DOM 的 SSR 支持。
- 版本、许可和 Node 要求有明确来源；发布 README 只引用随包提供的文档或有效线上地址。
- 如 NodeNext 消费要求声明内部相对引用具有 .js 后缀，在暂存阶段做最小适配，并用类型测试证明；不改变 SDK 导出语义。
- source map 保留正确文件名与 sourcesContent，使不携带源码仓库的消费者仍可定位源码；不泄露本机绝对路径。

### 3.2 包名与发布分开处理

当前实际包名为 cocosair.js，示例中的 cocosair 是 importmap 别名。本阶段不假设 npm 上 cocosair 可用或由用户拥有，也不自动重命名根包。

本地验收默认保留现有包名，并验证 npm alias 安装后可以使用 import 'cocosair' 的体验。正式发布前再确认包名、版本、registry 与维护权限；这只阻塞发布，不阻塞本版本地包消费验收。

实施后的命令目标是：用 npm pack 从暂存目录生成 .tgz，在独立临时 consumer 中通过 npm install 安装该 tarball。确切文件名由装配脚本输出，不在计划里伪造已存在的包。

### 3.3 Consumer 验收

consumer 不位于引擎源码树内，不能用仓库 importmap、tsconfig paths、源码软链接或深层相对路径绕过包入口。安装依赖完成后，即使无法访问引擎源码目录也应能完成：

1. 导入 createAirApp、Scene、Node、helper 与已交付模型 API，类型提示与预期类型错误正常。
2. 在已有 GameCanvas DOM 模板下启动 starter 和一个可见 3D 示例；不宣称修复 import 阶段 DOM 约束。
3. 用一种已核验兼容的常规 Web 构建工具构建并静态运行，嵌套部署路径正常；只选择一种作为本版基准，版本在 T0/T1 实测后锁定。
4. normal/minified 入口与 source map 工作，资源 HTTP 错误能被观察。
5. 实际安装包不夹带开发工具、测试资产或缓存，也不依赖 Creator。

门禁 G1：本地 tarball 安装、类型、构建与浏览器使用均通过。正式 npm publish 不属于本版 DoD。

## 4. Task T2 — Examples First 学习入口

### 4.1 保留旧路径，增加导航

保留 starter、hello-cube、static-model、skinned-animation、gltf-viewer、gltf-catalog 的已有 URL，不迁移、改名或重复建立 model 示例目录。

新增示例导航页，按“入门 / 变换与相机 / 材质 / 模型 / 交互 / 自动化”分类。分类可以是元数据，不要求对应物理目录。官方模型目录继续链接现有 gltf-catalog，不复制其资源列表或对照预览实现。

最小新增学习内容：

- transform：层级与局部/世界变换。
- camera：透视、正交及 frameObject。
- input：原生 Web Input 的一个已支持交互，用键鼠或触摸的实际实现验收，不引入手势框架。
- automation：使用开发期观察/操作工具完成一次闭环，无外部模型或 AI 服务调用要求。

已有 hello-cube、static-model 和 gltf-viewer 分别承担基础渲染、纹理与模型/PBR 学习内容，不另造同义演示。

### 4.2 示例发现与兼容

当前 dev server 只枚举一级 index.html。实施递归发现合法示例目录，并让 --example 使用稳定的相对目录 ID；排除 shared、assets、缓存和非示例文件。

默认仍打开 starter。目录导航可采用 --example 的目标导航页或单独固定 URL，不改变旧 URL。目录名与 ID 冲突、路径穿越或缺失入口应给出明确错误。

验收至少包含一个嵌套示例：发现、选择、页面加载、源码链接、TS 编译、保存后刷新均正常；旧示例路径与 V0.3 静态验证脚本继续可用。

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

加载缓存、GLTFInstance.dispose、GLTFAsset.addRef/decRef 以现有交付为准。不复写外部 loader 文件；契约冲突记录后交接处理。

### 6.3 Frame Capture

captureFrame 返回 PNG 数据或浏览器侧 Blob，加 width/height、scene ID、采样时间与帧标识。截图范围固定为 canvas；调试 UI 截图是独立操作，不能混入渲染验收。

捕获必须在渲染完成的受控时机进行，复用既有浏览器像素验证经验；不能假定任意时刻读取 drawing buffer 都有效。默认不改变游戏播放状态；确定时间采样模式若暂停或推进运行时，必须显式启用并在 finally 恢复状态。

验证图片可解码、尺寸正确、非空场景有前景，并用已知操作前后差异确认是新帧。空场景是合法情况，不能以“图片不全黑”作为唯一成功标准。canvas 不可读、跨域污染、上下文丢失、超时或 scene 已替换时返回明确错误，不交付旧截图冒充新帧。

### 6.4 Error Collection

复用 tools/dev/air-prelude.js 的非侵入错误观察，避免重复包裹 WebGL 函数。getRuntimeErrors 接受 since/limit，返回序号、时间、类别、消息、来源位置和可关联的 requestId。

收集 session 加载失败、window error/unhandledrejection 与 shader/link 失败。采用有容量上限的环形缓冲，暴露丢弃计数与清理接口；不能增长无界，也不能调用 getError 消耗引擎错误队列。

attach 必须幂等，detach 恢复自身安装的 hook；若共享现有观察器则取消订阅，不覆盖其他任务后安装的 hook。不承诺捕获 attach 之前已丢失的错误。

门禁 G4：一次 create → transform → inspect → capture → validate 闭环通过；非法请求无副作用；重复/失效 ID、加载失败、关闭中加载与 hook 恢复有针对性验证。

## 7. Task T5 — 最小 Debug Tool

tools/debug 提供一个显式启用的开发面板：Scene Tree、选中 Node 的只读详情、Asset 清单与诊断、错误列表、canvas 截图入口和已采集的性能摘要。

面板调用 T3/T4 同一 session，不直接另写引擎操作路径。第一版不做通用 Inspector 属性编辑器；必要操作通过自动化示例演示。

保持画布可见、键盘操作和窄屏可用，面板错误不能中断业务主循环。关闭面板后无残留监听器或工具节点。用户业务页面无工具启用时，默认包与加载请求中均不包含 debug/agent 模块。

门禁 G5：真实页面中完成查看、定位错误、截图与关闭；自动化使用同一接口得到对应结果。

## 8. Task T6 — 可比较的 Runtime Baseline

沿用已有构建记录，不虚构 asset build 性能。记录以下指标的精确定义：

| 指标 | 起止点/口径 |
|---|---|
| startup | 页面启动标记至 createAirApp resolve |
| scene ready | scene 运行请求至指定 scene 激活完成 |
| first visible frame | scene 激活至首次符合已知画面条件的渲染帧；不以 requestAnimationFrame 到达代替 |
| asset load | 已有公开加载入口调用至 Promise 完成；冷/热缓存分开 |
| debug overhead | 同一场景、同一操作下工具关闭/开启的可比数据 |
| memory | 区分 JS heap、引擎对象/引用计数与 GPU 可见信息；不可获得项记 unavailable |

固定 OS、浏览器、实际 WebGL 后端、视口、资产及工具状态；每种配置至少 3 次，报告中位数和范围，不把单次结果写成普遍性能提升。

不引入渲染器调优目标，不以一次 GC 证明无泄漏。内存 API 不可用不阻断功能验收，但必须有实例/监听器/引用清理的行为证据。

## 9. Task T7 — 验证、文档与发布准备

### 9.1 测试发现

沿用 test/smoke 与 test/unit，不新增 test/runtime、test/agent 平行目录。当前 jest.config.js 只发现 smoke；若新用例进入 unit，必须同步扩展发现规则并通过 jest --listTests 证明它们被执行。

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

新增编号建议在开工时核对空位：

| 文档 | 内容 |
|---|---|
| docs/12-v04-package-consumption.md | 暂存包、tarball、consumer、包名与正式发布边界 |
| docs/13-v04-examples.md | 示例导航、分类、旧路径与嵌套示例 |
| docs/14-v04-agent-development.md | session 合同、观察/操作、截图/错误、生命周期与限制 |
| docs/15-v04-runtime-baseline.md | 指标定义、环境、采样与结果 |
| docs/16-v04-verification.md | 基线、测试发现、验收矩阵、证据、遗留与 Deviations |

编号冲突时保留已有文档，选择下一空闲编号并更新引用。README 只描述已验证能力；安装示例明确区分本地 tarball/alias 和未来 registry 发布。

### 9.3 正式发布的独立门禁

本版先交付可审核 tarball、文件清单、版本元数据、许可与消费结果。只有用户另行授权正式发布，才核实名称/registry 权限并执行发布；不得先发布再补确认。

发布未授权时，本地分发验收可以完成，但不得声称 npm registry 已可安装。没有授权的远端部署同理。

## 10. 执行顺序与验收矩阵

顺序：T0 → T1 包消费 → T2 示例入口 → T3 观察 → T4 操作/反馈 → T5 面板 → T6 基线 → T7 总验收。文档随对应任务增量编写。

默认不启动多 Agent。后续若明确分工，包分发与示例内容可独立推进；package.json、dev server、session 合同和测试配置由单一整合者管理，外部模型任务文件不并发编辑。

| ID | 必需验收 | 证据/退出标准 |
|---|---|---|
| L0 | 最新基线交接 | V0.3 与外部任务状态、改动和限制明确；阻塞已解决 |
| L1 | 暂存包正确 | 文件/类型/exports/ESM 语义一致，无开发缓存与工具泄漏 |
| L2 | 空项目消费 | 安装本地 tarball，类型、构建与可见 3D 浏览器场景通过，无源码仓库依赖 |
| L3 | 示例学习入口 | 旧路径保留，新内容可发现；至少一个嵌套示例从选择到刷新通过 |
| L4 | Scene/Node/Asset 观察 | 数量口径、稳定 ID、销毁/切场景失效和 unchecked 正确 |
| L5 | Agent 操作 | 请求/响应合同、可写范围、错误无副作用、异步关闭与引用清理通过 |
| L6 | 截图 | 可解码新帧、canvas 范围、空场景与错误行为明确 |
| L7 | 错误收集 | 分类/游标/容量上限、加载与 shader/runtime 错误可见，不消耗 WebGL 错误队列 |
| L8 | Debug 面板 | 使用同一 session，显示/关闭经过实际 UI 验证，默认包不包含工具 |
| L9 | 性能记录 | 指标起止点、至少 3 次采样、环境和 unavailable 项明确 |
| L10 | 测试与兼容 | 新测试被真实发现，原构建/声明/守卫/示例继续通过 |
| L11 | 文档与边界 | 安装、使用、能力限制与复现完整，无虚构资产生产或 registry 发布声明 |

Definition of Done：以上必需项通过，交付实现 diff、tarball 与清单、测试/画面证据、连续文档；前序未验证项和外部未交付能力如实列出。正式发布、MCP 和 V0.5 框架均不作为隐含完成条件。

## 11. 本次修订与 Deviations

| 原计划问题 | 修订处理 |
|---|---|
| 把 V0.3 当离线 Asset Pipeline | 使用运行时加载与资源集成真实基线，不要求 tools/import |
| 根包直接 type:module | 默认采用发布暂存目录 ESM，保留根 CommonJS 工具链 |
| d.ts 改名且未迁移 | 沿用 cocosair.module.d.ts，校验实际打包入口 |
| npm install 假设名称已发布 | 先 tarball/alias 消费；registry 名称与发布另行授权 |
| 全面移动示例/新增未支持能力 | 保留旧 URL，递归发现与分类导航；最小新增示例限已有能力 |
| Inspector/Action 位置与语义不清 | tools/debug 开发期 session，明确 ID、范围、异步、错误和生命周期 |
| test/runtime、test/agent 无发现规则 | 维持 smoke/unit，变更发现规则并验证 listTests |
| 文档重复、性能口径不明 | 连续编号与既有文档增量，定义指标及测量方法 |
| 忽略新增官方模型目录和独立复审 | 复用 gltf-catalog 与已交付验收资料，记录复审建议 |

实施中的偏离继续按“原因 → 证据 → 影响 → 处理 → 是否改变验收”记录。若需要新增引擎能力或改动已约定的外部任务范围，单列后续任务，不通过修改本版验收标准夹带实现。
