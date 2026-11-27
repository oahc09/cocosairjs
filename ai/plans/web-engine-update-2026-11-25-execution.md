# 2026-11-25 Web 引擎更新执行任务

核对时间：2026-11-26（Asia/Shanghai）。首批本地 `main` 快进到 `a845f408`。来源为 [11 月 25 日监控报告](../../docs/tasks/CocosAirJS-Web-Engine-Update-2026-11-25.md)。首批原始结果见下文。后续执行基线已快进到 `dbc7937d`，PR #24–#26 均已合入。当前完成度见「续批执行记录」。

## 基线和去重

- PR #22 的 atlas 页面已按最终响应 URL 解析，并有原生浏览器回归。glTF 的最终响应 URL 修复 `1d38e2c1` 仍在独立分支。glTF 实例旋转 `677c873a` 和 Tiled 动画跨帧尖峰 `815f4676` 也未合入本次 main。三项分别跟踪，先检查分支状态再决定复用。
- PR #23 已处理 WebGPU texture resize 的 mip 范围、强制 point 时的各向异性和按原生描述符及 device 隔离的 sampler 缓存。保留现有测试与 Dawn 对照，后续补实际浏览器回归。
- PR #21 的浮点、整数 MRT 已在旧候选的 Intel Chromium 硬件 WebGPU 上分别通过 10、4 项校验。当前 `a845f408` 的两条验证待重跑。旧本地报告目录已不可用，本任务要求保留新原始报告。
- 默认 JS 和 min 的来源收据各有 9 项与当前源码不同，来自 atlas 和 WebGPU 合入内容。当前 (JS 1029 项、min 1027 项) 两份来源收据均为不匹配。先更新候选 SDK，随后做归因和浏览器验证。
- 已有 glTF 取消、纹理共享和 KTX2 成功/失败/重试/取消的回归。GPU 计时工具已有 Pass 总和和首尾跨度。保留已有接口、WebGL2 默认行为及现有 glslang/twgsl 路径。

## 可执行任务

| ID | 优先级和依赖 | 改动范围 | 完成条件 |
| --- | --- | --- | --- |
| U25-00 | P0，首批 | 在隔离候选中按规范构建默认 JS、min、声明和打包副本。复用 `tools/verify/atlas-native-redirect.cjs`、`webgpu-partial-color-clear-browser.cjs`、现有 sampler/mip 用例。 | JS/min 来源收据零差异，声明直读消费者编译通过。Atlas 最终响应 URL 实测通过。浮点和整数 MRT 分开采集，实际 `gfxAPI` 为 WebGPU，非回退硬件 adapter 可识别，逐 texel 断言全部通过，保存两条原始报告及退出码。Sampler 和 resize 先跑既有回归。 |
| U25-01 | P0，可与 U25-00 并行核查 | 建立外来资产入口表，逐一核对 `GLTFLoader`、`assetManager.loadRemote` 和确实可达的场景/Prefab 反序列化入口。检查字段、索引、URI、请求终态与引用归属。用 glTF 取消和 dedup 探针作基线，确认 glTF 重定向分支的覆盖。仅修复可复现的缺口。 | 合法输入冷/热加载一致。非法字段、索引和未支持的方案被明确拒绝，失败不改变宿主状态。取消的请求只结束一次，迟到资源回收，两实例共享资源直到最后使用者释放。用重复成功/失败序列验证资源计数回到基线，声明并保留有意共享的缓存。记录每项的「已覆盖 / 已复现缺陷 / 本入口不适用」。 |
| U25-02 | P1，依赖 U25-00 | 在 WebGPU 诊断中分别公布 adapter 和实际 device 的 `maxBufferSize`、`maxStorageBufferBindingSize`。核对设备创建前请求值、缓冲区创建与 storage binding 处的边界。先验证应用真正受限的用例，再考虑显式申请更高限制。 | 可观测请求值及两个实际上限。mock 控制分别覆盖申请失败、分配超限、binding 超限和可用的分块路径，负例不会启动超大分配。至少一次真实 WebGPU 用例核对诊断和绘制。默认设备能力协商保持原样。 |
| U25-03 | P1，可独立 | 在 `tools/debug/gpu-pass-timer.mjs` 同一个已完成测量组增加区间并集指标，复用已有 timestamp。保持已有 sum、span 和 WebGL 查询回退。 | 用 `[0,4]`、`[2,6]`、`[9,10]` 独立得到 sum=9、union=7、span=10。覆盖乱序、嵌套、零长度、未完成和失效结果。不可得结果保持 unavailable，合法零保留。真 WebGPU timestamp 回归与 CPU 单测分别记录。 |
| U25-04 | P1，依赖 U25-00 | 定向验证 texture、view、sampler、descriptor 生命周期与透射离屏 Pass。复用现有 resize、sampler cache、透射和 MRT 示例的探针，加入 A→B→A、resize 后重绑、释放和重入。 | 用原生读回、实际画面、资源销毁和零验证错误分别证明结果。校验老引用没有污染新纹理或设备。透射背景和主相机分别检查 Pass/附件归属。仓库中未发现具备对应路径时，仅记录 OIT 不适用。 |
| U25-05 | P1，依赖 U25-00 | 验证主 SDK 入口合同，复用 npm 消费者、shader-preflight 独立入口和官方静态 import map 示例。覆盖 Spark 的主引擎复用合同与发布资格分开。 | npm 与静态页面各有一次真实加载和绘制，模块图与类型一致。同页入口只加载一份主运行时。独立 min/unmin URL 并存的情况记录为不支持共享实例的配置，并证明推荐 import map 只指向一个主入口。Spark 真实分发与集成按现有许可门禁处理，缺证据记 BLOCKED。 |
| U25-06 | P1，依赖 U25-00 | 复用 KTX2 lifecycle CPU 回归与既有官方模型案例，补连续 100 次真实 WASM 转码的稳态观察。将成功、异常和取消分组，记录底层对象终态与 WASM heap。 | `close/delete` 按创建次数核对，取消后的输出无回写，仍活跃的共享转码器不被释放。WASM 内存只评价预热后持续增长，记录转码器构建和格式。不把 heap 高水位解释成 GPU 驻留。 |

## 实验及后续

- **U25-07 · Shader 双目标**。依赖 U25-00、U25-05。先用一个自定义效果验证 WebGL2 GLSL、WebGPU 转译和原生 WGSL 的绑定、真实像素、编译失败定位和首次编译成本。第一轮先解决是否能在既有 Effect 合同内选择目标。通过后再扩 PBR、折射和离线缓存。默认兼容链保持。
- **U25-08 · 深度精度**。依赖 U25-00、U25-04。在隔离探针分别对照 NDC 深度范围和 Reverse-Z，覆盖投影、清屏、比较及线性深度重建。先通过普通和反转的独立数学与像素断言，再测阴影、雾和折射。WebGL 扩展不可用时验证实际默认深度约定；默认公开相机不改。
- **U25-09 · 资源和画质示例**。压缩模型优先使用同一份自制或可分发资产，做普通、Draco、Meshopt 三档对照，验证部署、失败恢复、边界和像素容差。显式 UV 和 LightProbe 对照固定 Three 版本，单独保存新参考。Bloom 先比较既有链的实际 Pass、RT 峰值和移动设备耗时，物理光照迁移和 SSR 保留实验状态。
- **U25-10 · 条件待办**。Spark 插值、排序与 SPZ 扩展等到许可门禁闭环和移动设备就绪后再做有图像负控的实验。LayaAir 源码调研已取消。

## 执行顺序和验证记录

1. 先并行执行 U25-00 和 U25-01 的入口核对。锁定源码和依赖后构建。运行时构建和打包在隔离候选执行，保留默认产物与 source receipt 的成套身份。
2. 第二批交付 U25-02、U25-03、U25-04、U25-06。可独立落地的诊断与统计单独验收。发生并行源码变更时，重新比对收据并重新验证受影响候选。
3. 第三批完成 U25-05，之后才批准 U25-07、U25-08 的实验扩展。一次验证至少保留提交、构建产物和工具输入指纹、退出码、原始日志、实际后端/浏览器/adapter 以及截图或读回。定向验证标注范围。
4. 实施时按影响范围执行 `typecheck`、相关 Jest 和专项工具、`verify:web-only`、`verify:file-map`。默认 JS/min/声明变更加来源收据和消费者检查。已有历史画面与验收原件留存，发布验证沿用固定快照 campaign。

基线已知未关闭项单独跟踪：当前 WebKit 自动播放矩阵、完整 Gallery campaign（含 EX02 的明确运行时路由）、Spark WASM 分发许可及 Spark map。它们的状态不由其他专项的 PASS 推进。本任务书不包含提交、推送或发布。

## 首批执行记录

候选以 `a845f408` 为基线，工作树目录为 `cocosair-u25-u25-first-batch-20261126-220544`。运行时、回归和构建产物都保留在该隔离工作树。原始日志、退出码、报告、候选输入指纹和补丁位于 `output/u25-first-batch-20261126-220544/`。历史报告原样保留。

| ID | 状态 | 实测结果 |
| --- | --- | --- |
| U25-00 | 已通过定向验收 | 默认 JS、min、声明和 npm 暂存构建完成。JS/min 分别核对 1,030 / 1,028 个输入，均零差异。TS 4.9 声明消费零诊断。原生 WebKit Atlas 5 个路径通过。WebGPU mip/resize 与 sampler 缓存通过 Jest 接口测试。Intel 非回退硬件 Chromium 的浮点 MRT 10 项及整数 MRT 4 项分别通过，使用独立报告和逐像素读回。 |
| U25-01 | 审计完成，重定向已修复，WebKit 传输项开放 | 原始基线 3 个重定向场景失败，移植 `1d38e2c1` 的针对性差异后 6 项全通过。整批 10 套 Jest 共 82 项及 KTX2 生命周期 12 项通过。真实 Chromium 上传、采样和销毁回归通过。真实 HTTP 取消在 Chromium 和 Firefox 通过，Windows WebKit 的 Promise 取消通过，但服务端提前断开不稳定。原生 `fetch` 对照 6 次均收到 `AbortError`，其中 1 次服务器仍发完响应。严格的传输断言保留，WebKit 该项继续开放。 |

### 资产入口与所有权

| 入口 | 覆盖和边界 |
| --- | --- |
| `GLTFLoader.parseAsync` | 容器、版本、必需扩展、索引/视图范围、非法节点关系和缺少外链基地址均有负例。URL 交给平台解析和 Fetch 接纳，本轮没有建立独立 URI 协议白名单。扩展 handler 来自应用注册表。 |
| `GLTFLoader.loadAsync` | 带 `signal` 或请求选项时走独立加载，外链基地址取最终响应 URL。保留原请求 URL 的进度与缓存标识。自定义请求头的授权 origin 不随重定向迁移，带自定义头时拒绝自动重定向。预取消不发请求，取消只结算一次，晚到的可释放结果由解析器清理。 |
| `assetManager.loadRemote` | 无选项 glTF 走原生 URL 键缓存，缓存命中和辅助入口共用同一资产，无独立订阅取消合同。重定向补丁保留原生 ArrayBuffer 并用响应元数据解析外链。Atlas 复验覆盖默认、显式、直连、无后缀、自定义路径。普通远程 JSON 进入 `JsonAsset`。 |
| Scene / Prefab 导入 | Cocos 的 `import`、`.ccon`、`.cconb` 通过反序列化器解析注册类，独立于 glTF 和普通 JSON。按可信资源包入口审查。任意外部序列化场景的隔离、白名单与全量恶意输入验证尚未覆盖。 |
| 实例与底层资源 | 现有两实例回归验证先释放一个实例仍可用、重复释放安全、最后一个销毁后共享网格失效。纹理去重原生回归默认 101 次上传，显式共享 2 次，实际采样一致且分配的句柄各销毁一次。失败/重试与晚到资源由 Jest、KTX2 生命周期用例覆盖。共享运行时、内建资源、资产缓存和外部提供方按各自所有权保留。未测整进程或 GPU 内存稳态。 |

### 证据索引

- SDK 与声明使用 `sdk-binding.json`、`build-all.log` 和 `declaration-consumer.log`。
- Atlas 与 MRT 使用 `atlas-redirect-fixed.json`、`mrt-float.json`、`mrt-integer.json` 及对应退出码。
- 重定向使用 `gltf-redirect-before.log` 与 `targeted-jest.log`。所有权使用 `gltf-dedup.json` 和 `ktx2-lifecycle.log`。
- 取消保留 `gltf-cancellation.json`、`gltf-cancellation-replayed.json`、`gltf-cancellation-bounded.json` 和 `webkit-native-fetch-abort.json`。限时等待观察实际关闭事件，提前断开及独立对照仍为必需断言。
- PR #22 的 Atlas 上游登记缺失保留首次失败的 `verify-file-map.log` 和补齐后通过的 `verify-file-map-after.log`。本批同时通过 `typecheck`、`verify:web-only`、`verify:doc-refs`。

## 续批执行记录 · 2026-11-27

当前 `main` 为 `dbc7937d`。候选目录 `cocosair-u25-next-20261126-222950` 以相同 HEAD 建立，复用了已合入的 glTF 重定向修复并保留首批候选。新原始报告、退出码和重现脚本收纳在 `output/u25-next-20261126-222950/`，浏览器采集器创建的报告及原始材料也保留在候选 `output/`。Git 提交、推送和发布尚未执行。

| 任务 | 当前状态 | 执行记录 |
| --- | --- | --- |
| U25-00 | 最终候选通过 | JS/min 分别核对 1,030 / 1,028 个来源输入，声明消费者通过。原生 WebKit Atlas 5 项和 Intel 硬件两条 MRT 10 / 4 项均用最终产物复跑。WebGPU mip/sampler 通过 Jest，真实资源探针覆盖 mip layer 与重绑。 |
| U25-01 | 重定向已合入，WebKit 传输项开放 | PR #24 已包含首批针对性修复。定向 Jest 覆盖重定向、实例旋转、Tiled 和资源等 67 项。HTTP 取消 Chromium/Firefox 通过，Windows WebKit Promise 返回 `AbortError`，服务端提前关闭仍不稳定。保留原生 Fetch 对照和严格断言。预热后的 Chromium 50 轮成功/失败交错、再进入及两实例隔离均通过，受测的 GFX buffer/texture 计数回到同一基线。 |
| U25-02 | 上限诊断已实现，压力边界保留 | WebGPU 诊断分别记录 adapter、实际请求和 device 上限。Intel 的 adapter 支持约 2 GiB，device 实际授予 256 MiB buffer 和 128 MiB storage binding。默认请求参数保持原样。真实 adapter 拒绝超出上限 4 字节的请求，真实小型 storage 计算通过。没有大分配或 storage 分块压力结论。 |
| U25-03 | 已实现，完成定向验证 | 用整数纳秒合并 Pass 区间，保留旧 sum/span 和 WebGL2 计时。CPU 的重叠、乱序、嵌套、合法零时长通过。真实 WebGPU 的顺序 Pass 满足 union=sum，WebGL2 回退正常。 |
| U25-04 | 两项发现均已修复 | 资源收据改用当前编译器的绑定校验。真实 Chromium WebGPU `2 → 4 → 2` resize 重绑逐帧读回 `[255,128,64,255]`，画面可见，GPU 零错误。WebGL2 透射修复前当帧纹理已是 `1312 × 816` 而采样参数仍是 `1280 × 800`，修复后首次更新同步。离屏/主相机、排除层、禁用恢复、重绑和释放均观察通过。OIT 未发现适用的默认路径。 |
| U25-05 | 主入口通过，Spark 分发受阻 | 真实 npm 安装的普通、嵌套 CSP、min 三种独立页面通过画面和生命周期检查。官方独立 starter 只请求一个主 JS，import map 别名与直接 URL 返回同一模块。Shader preflight 的离线安装、无 DOM 类型与 CLI 通过。Spark WASM 传递许可证据仍 pending。 |
| U25-06 | 已通过定向验收 | 10 次预热后执行 100 次真实 Basis WASM 转码，80 次成功、10 次转码错误注入、10 次在同步输出后取消。每一组都回到 0 个存活 KTX2 文件，模块只初始化一次，10 个观测点均为 16 MiB WASM heap 容量。 |
| U25-07 | 首轮实验完成，Effect 原生 WGSL 入口开放 | WebGL2 GLSL、WebGPU 转译和独立原生 WGSL 三条通道均得到同一绿色像素。Effect 附加的品红 WGSL 控制未被选择。当前仍须使用既有 GLSL Effect 或独立原生 GFX，缺少 Effect 原生 WGSL 变体合同。本轮记录首帧/读回耗时和原生编译行列，未作跨通道性能结论。 |
| U25-08 | 隔离实验通过，原生清理及后续路径开放 | 19 项 CPU/验证器检查通过。Chromium WebGL2 的 8 个 normal/reverse × 格式配置全过。更正了严格深度比较在两个深度都等于 clear 时应保持背景的验证规则。原生 D24S8 数值通过，采集器仍记录 70 个未观察到销毁的 GL 对象，失败原件保留。WebGPU、阴影与雾的 Reverse-Z 集成待验证。 |
| U25-09 | 压缩模型及 HDR 定向验证通过，其他对照开放 | 三个桌面浏览器的同源普通、Draco、Meshopt 模型边界一致、每种 4,096 个有色像素，逐像素零差异，释放通过。确认随包 Draco glue 以经典脚本及显式 WASM 字节可工作，已更新文档。现有 HDR/Bloom 像素及生命周期探针通过。AIR 纹理上传与 UV 四角像素三浏览器通过。Three 显式 UV/LightProbe 的新固定版本对照，以及移动 GPU 的 Pass/RT 峰值与耗时开放。ADB 未发现已连设备。 |
| U25-10 | 条件受阻 | 当前 Spark 许可门禁明确失败于实际 WASM 传递依赖来源，未生成新变体。移动 GPU 对照仍待实机。 |

### 最终候选复验

`final-candidate.json` 记录成套产物、来源收据和改动文件指纹。开发 JS 为
`72f5ab208268dceb9b79aca5af4e47fa8a78d496ee286187003861890d63ca69`，
与最终 Atlas、双 MRT 和 WebGPU 资源报告实际使用的 SHA-256 一致。改动补丁及新增测试原件也在同一个日志目录。

- `final-build-replayed.log`、`declaration-final.log`、`tarball-final.json` 记录成套重建、声明消费和真实 npm 安装。最初重建的 Node heap 溢出保留在 `final-build.log`，增大构建进程堆预算后复跑成功。
- `transmission-resize-before.json`、`transmission-final.json` 记录透射修复前后的同帧参数。还有 `transmission-cpu-final.log` 的 12 项通过记录。
- `gltf-ownership-cycles-warmed.json` 记录 50 个实测周期。初次抓到的无场景释放与首次场景预热结果另存。计数为引擎维护的资源账面值，未推断实际显存。
- `timing-webgpu-bound.log` 记录当前计时和超出 adapter 请求的负控。尝试用 bind-group layout 验证 effective binding size 的失败原样保留，实际检查点是 bind group 创建。
- `gltf-cancellation-final.json` 保留 Windows WebKit 的传输失败，`spark-license.log` 保留 Spark 分发门禁失败。隔离深度和原生 D24S8 报告分别保留在候选的 `output/u25-depth-chromium-replayed/` 中。

到此完成当前环境可交付的候选修复与专项验证。各开放项按上表跟踪，历史报告和原始失败不因候选通过而更新。

## 取消、D24S8 与 Three.js 对照补验 · 2026-11-27

沿用 `dbc7937d` 隔离候选已构建的 SDK。原始对照脚本、JSON、截图、失败日志和退出码保存在 `output/u25-followup-20261127-212816/`，首批和续批报告均保留。

| 任务 | 当前结论 | 证据 |
| --- | --- | --- |
| U25-01 · HTTP 取消 | 应用层取消通过。Windows WebKit 26.5 的严格 HTTP 提前断开检查继续开放。 | 严格探针中 Chromium 与 Firefox 通过。WebKit 返回 `AbortError`、应用释放为 `released`，服务端仍发完主请求。独立 A/B 对照为 32 次真实 HTTP 请求，覆盖收到响应头前，以及响应头和首字节到达后。WebKit 原生 Fetch 有 1 次在响应头前取消后仍发送完响应，同轮 AIR 12/12 提前断开；所有浏览器和两种调用都传递了真实 signal，并返回 `AbortError`。 |
| U25-08 · D24S8 资源 | D24S8 附件及目标对象释放通过。旧全上下文清理断言及其他深度集成开放。 | Chromium 原生 D24S8 数值采样通过。源 framebuffer、颜色和深度纹理、输出 framebuffer 和颜色纹理各有一次 delete，之后全部失效。正在追踪的 70 个未删除对象里，66 个在仅启动/关闭的对照页中也出现。其他 4 个的分配栈指向字体图集、两个着色程序和 sampler 缓存。引擎关闭回执声明保留运行时、内建资源和共享缓存。严格旧报告保留 FAIL；未据此推断所有 GL 对象或 GPU 驻留内存已回收。 |
| U25-09 · Three.js 对照 | 已完成固定版本的桌面 WebGL2 语义对照。 | r187 `456a78fd` 与 dev `6fc2acea` 都从核对 Git blob 的源文件构建，HTTP 响应哈希一致。UV 用实际 WebGL2 TSL 后端，光照用经典 WebGLRenderer。两版本均使用同一输入、镜头及读回。有色像素、独立 UV 公式和 grid 负控均通过。 |
| U25-05 / U25-10 · Spark 与移动硬件 | 保留 BLOCKED。 | 仍缺与冻结 Spark WASM 对应的传递依赖许可证据。移动 GPU 仍无可用实机采样；本轮桌面浏览器对照未计入移动验收。 |

### Three.js 像素结果

- UV 使用带偏移、非均匀缩放、旋转和中心点的 4×4 纹理。原始色为 `[16,207,0,255]`，变换后为 `[124,126,23,255]`。两版默认 UV 和手工矩阵都得到变换后颜色，直接显式 UV 都得到原始色。`.sample(uv)` 在 r187 得到变换后颜色，在 dev 得到原始色。
- LightProbe 无环境时，r187 的旧探针使体积内外的介质采样从 0 到 122。dev 的旧探针发出弃用提示且保持 0。dev 的 `1×1×1` grid 在强度 `0.5 / 1 / 2` 下，体积内介质得到 `92 / 122 / 155`，体积外保持 0。有环境时体积内介质得到 `142 / 155 / 174`，体积外及纯金属保持环境基线 124。
- 此对照验证两份 Three.js 的行为及兼容迁移，保留仓库既有参考版本和 Golden。此前 AIR 的原生 UV 探针仍按各自证据范围记录。

### 新证据入口

- `abort-transport.json`、`strict-cancellation.json` 记录应用终态、浏览器信号与服务端传输状态。
- `depth-ownership-final.json` 记录 D24S8 句柄身份、分配栈、销毁调用、GL 数值验证及启动对照。
- `three-verified/report.json` 保存四个浏览器对照和对应截图。 `three-assertions.json` 保存独立像素断言结果。初次因 CRLF 检出不匹配的构建日志保留在 `three-comparison.log`；复验以与 Git blob 完全匹配的字节构建。
- 隔离候选的 glTF 请求说明补充了逻辑取消和传输终态的观测区别。严格探针调整为先保存应用关闭回执再判断断开，断言仍保留。运行时源码及 SDK 无本批额外变更。

## 缓冲上限、WGSL 入口与深度集成 · 2026-11-27

在 `dbc7937d` 的同一隔离工作树续做。最终 SDK、改动补丁、原始报告和退出码见 `output/u25-integration-20261127-215953/`。先前证据原样保留。

| 任务 | 状态 | 验收记录 |
| --- | --- | --- |
| U25-02 · WebGPU 上限 | 已完成本项验收 | 1024 字节 allocation 和 256 字节 binding 的 mock 验证超额分配及绑定在进入原生调用前拒绝。超额 resize 保持原句柄、大小和计数。Intel 非回退 WebGPU 实际按 offset 0、256、512 分块计算，每块读回 `7,8,9,10`，零 GPU 验证错误。默认设备请求保持原样。 |
| U25-07 · 同一 Effect 的 WGSL 入口 | 原生 render 变体已实现并验收 | `wgsl` 可给出顶点、片元及各自入口。WebGL2 保留 GLSL，WebGPU 有变体直接编译，无变体继续走转译。同一 Effect 三条浏览器通道像素通过，原生变体的材质 uniform 写入改变画面，编译负例包含 shader 名、阶段、行列。预专门化 bindings 与 attributes 合同见 WebGPU 指南。PBR、折射变体和离线缓存保留为后续扩展。 |
| U25-08 · 深度集成 | 已推进，WebGPU 雾效与整条 Reverse-Z 集成开放 | 实际 WebGL2 默认 NDC `[-1,1]`，设备提供 `EXT_clip_control` 时仍观察到默认深度模式。Intel WebGPU `[0,1]` 的真实 AIR MRT depth24plus 用于 normal/reverse 共 7 项读回，包括错误 clear 值负控。后续 pass 验证线性深度重建以及简化遮挡、雾和折射消费者。默认引擎阴影和 CSM 在 WebGL2、WebGPU 通过，WebGL2 雾效 6 项和水面 39 项通过。该实验保留现有原生相机和默认投影。 |
| U25-08 · WebGPU 雾负例 | 已定位存量失败 | 启用 WebGPU 后，原生精确雾控制路径得到预期白色，AIR 片元雾输出黑色。此前候选复现相同失效。实际提交的阶段代码中，`air_fogWorldPos` 的顶点输出在 location 0，片元输入在 location 3，GPU 报接口不匹配。全上下文清理的严格历史状态继续开放，保留此前 D24S8 附件释放证据。 |

构建、声明消费者、`typecheck`、文件映射、Web-only、文档引用、32 项定向 Jest 和 9 项 Shader Preflight 测试均通过。当前候选 JS/min 分别绑定 1,030 / 1,028 个输入。浮点 MRT 10 项和整数 MRT 4 项复跑通过。

- `candidate-final.json` 绑定 SDK、声明和修改文件。 `candidate-full.patch` 和 `candidate-added/` 保存复现改动。
- `native-final/effect-report.json` 记录实际提交的 shader、截图及编译负例。 `depth-final.json` 记录深度和三类消费者的读回。
- `water-final/report.json`、`fog-report.json`、候选工作树的 `output/u25-integration-shadows-final/report.json` 记录原生场景。后者同时保存实际分块结果。
- `fog-webgpu-baseline/fog-report.json` 和 `fog-webgpu-layout/fog-report.json` 保留存量失败、阶段代码和原始 GPU 诊断。历史传输及 D24S8 证据继续保留。

Windows WebKit 传输保持开放。Spark WASM 许可和移动 GPU 继续记为受阻。本批未暂存、提交、推送。

## 包产物验收补验

WebGPU 采集器校验实际选中的 npm 包 JS。它复用打包脚本的 source map 注释移除规则，从来源已绑定的开发 bundle 计算预期字节。正常副本通过，追加注释的对照副本因 `package-runtime-bytes` 被拒绝。两次报告及此前的误放行报告保存在 `output/u25-integration-20261127-215953/review-20261127-222242/`。
