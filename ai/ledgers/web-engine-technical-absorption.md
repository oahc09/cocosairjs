# Web 引擎技术借鉴执行台账

对应[任务书](../plans/web-engine-technical-absorption.md)。

## 2026-11-15 / 启动

- 已保存八项任务及验收。WA-01 IN_PROGRESS，其余 PENDING。
- 工作区有并行 glTF sheen、Android 互操作、harmony 示例及本机配置/打包产物；不覆盖、不暂存。
- 开始复现 WebGPU 编码中纹理 resize/destroy，先核对 native submit 的实际边界和既有描述符身份规则。
- 尚未运行新基线或声明修复通过。未提交 Git。

## 2026-11-15 / WA-01 第一批实现与定向证据

- 已确认 AIR 缺陷：GFX draw 暂存后、endRenderPass native submit 前 resize 采样纹理，会提前销毁旧 GPUTexture。真实 Chromium 返回 `Destroyed texture ... used in a submit`，预期蓝色读回为 `[0,0,0,0]`。两个失败尝试保留在 `output/web-engine-absorption/wa01-before/` 和 `wa01-before-native/`；没有改写成通过。
- 新增内部 `src/air/rendering/webgpu-resource-lifetime.ts`，按 native device 记录尚未提交的 Pass；纹理/resolve 句柄先从可变 wrapper 分离，等已有 Pass 全部提交、放弃或失败后销毁。新的 Pass 不延长旧资源寿命，不增加 queue-wide completion wait。
- 接入原生 CommandBuffer render/compute 暂存路径，覆盖 destroy、begin 重启、submit 异常及设备丢失；设备销毁/丢失排空退休资源。late device-loss 回调不把较新 native device 标为丢失。三个抽取文件已登记 upstream 差异，基线未改变。
- CPU：5 项生命周期回归通过。typecheck、verify:file-map 通过。
- 隔离 baseline/candidate ESM 构建通过，输出在 `output/web-engine-absorption/{baseline,candidate}/build/`；未覆盖默认 build 产物。主构建计数遵循现有脚本行为，没有更改版本号。
- Chromium WebGPU：`wa01-after-boundaries/report.json`，completed=true、subset=true、8 项通过、errors=[]。包含旧蓝/新红像素、两个 CommandBuffer 与不同 sampler、Compute→Render、MSAA samples+resolve、放弃命令、注入同步 submit 异常、destroy-before-submit、真实 native device loss；被退休的旧资源各销毁一次。初版 5 项报告 `wa01-after/` 保留。
- 命令：`node tools/verify/webgpu-texture-retirement.cjs --bundle=output/web-engine-absorption/candidate/build/cocosair.module.js --out=<新目录>`。需要可解析 Playwright 和可用 WebGPU 浏览器。工具已登记到 tools/README，输出只写新目录。
- 状态：WA-01 已实现并完成上述 Chromium 定向验证；仍需普通 WebGL2 路径回归、扩大资源循环验证及后续集成。WA-02～08 尚未完成，不把本批视作八项任务全部通过或发布验收。未提交 Git。

### WA-01 定向收口 / WA-02 开始

- `wa01-cycles-final/report.json`：completed=true、subset=true、WebGPU 9 项通过、errors=[]。新增 30 次 blue→resize→red 循环，每轮验证旧绘制蓝色、新绘制红色及旧 native allocation 恰好一次销毁；结束时逻辑 textureSize 回到起点。逻辑字节/显式销毁调用不等于物理 GPU resident-memory 证明。
- `wa01-webgl2-final/report.json`：completed=true、subset=true、普通 WebGL2 4→8→4 resize/upload/readback 三项通过，GL error=NO_ERROR、console errors=[]。这是普通纹理路径回归，不是全量 WebGL2 渲染验收。
- WA-01 状态更新为 VERIFIED，证据范围限定为上述 Chromium、隔离 ESM 候选及 CPU 回归；多浏览器/压缩包/全量视觉不据此宣称通过。
- 格式与 diff 检查通过。当前 doc-refs 检查有 1 条并行文件断链：`docs/reference/android-runtime-interop.md -> build/runtime-interop-android.cjs`；该文件自启动即为他人未提交改动，本任务未修改或掩盖断链。
- WA-02 开始核查：初始化中 await shader translator 与 native device loss/close 的交叠；WA-03～08 仍 PENDING。默认 build 产物、版本、Git index 均未由本批刷新或提交。

### WA-02 初始化中设备丢失

- `wa02-before-init-loss/report.json` 已实际复现：首次 translator WASM fetch 时销毁 native GPUDevice，旧启动仍返回 app，并在丢失后继续调用 GPU 工厂 110 次。不是 mock device-loss 状态，也没有把初始化成功当成有效设备。
- `webgpu-device.ts` 在 await translator 后重新检查 native device 身份与 isLost；不再为无效设备创建默认资源或返回成功，沿用初始化 catch 的清理。错误码 `WEBGPU_DEVICE_LOST` 已补充到 WebGPU 指南。
- 新候选隔离构建与真实浏览器复验进行中；typecheck 已通过。其余异步资产/读回终态核查尚未完成，WA-02 保持 IN_PROGRESS。
- 复验完成：隔离 `candidate-wa02/build/` 构建通过；`wa02-after-init-loss/report.json` completed=true、1 项通过、errors=[]，确认拒绝码 WEBGPU_DEVICE_LOST、allocationsAfterLoss=0。新候选上的 `wa02-wa01-regression/report.json` 9 项生命周期回归通过、errors=[]。旧 110 次分配的失败记录保留。WA-02 仅本分支已验证，整体仍 IN_PROGRESS。

## 2026-11-15 / WA-02 继续：读回一致性与双后端晚到资产

- 真实复现两个读回边界：多 region 在第一次 map 等待期间 resize，旧结果混入旧蓝/新红；应用 close 后，旧实现先写入第一份目标缓冲，再以缺少 texture 的底层错误结束。失败保留在 `wa02-readback-{resize,close}-before/`。
- 改为一次 native submission 固定所有 region/source，快照目标视图，全部 staging map 成功后再交付；设备失效时拒绝，源 texture/view 释放时返回 WEBGPU_READBACK_TEXTURE_DESTROYED，staging 统一清理。新 GFX 资源创建/上传/读回拒绝失效设备。
- 中间复验 `wa02-complete-close/` 发现应用 close 保留共享 GFX device，不能把所有 close 当成 native device loss；该失败保留。后续按真实所有权区分 source destroy 与 device loss，不通过销毁共享设备绕过问题。
- 当前 `candidate-wa02-final/` 下的 resize、close、view、glTF loss/abort、初始化中丢失、既有 native resource contracts、9 项生命周期和普通 WebGL2 回归均已执行通过。每份 `wa02-final-*/report.json` 保留独立身份；全部属于 subset，不是跨浏览器/发布验收。
- 新增 context-health 观察对象身份：旧 device 的晚到 lost 不污染新观察对象，重复 watch 幂等，destroy 后不通知。相关 CPU + 既有 glTF 取消回归 17 项通过。
- 默认 WebGL2 也确认晚到 glTF 图片在 context loss 后仍返回资产，console 零错误；失败在 `wa02-webgl2-asset-loss-before/`。已为原生 WebGL2 工厂/上传/读回与延迟 shader 编译增加失效上下文准入，正在构建复验；sampler 声明不在失效上下文中被修改。

### WA-02 定向收口

- WebGL2 丢失后恢复也保留 failed 合同：真实复现 restored 后晚到 glTF 仍错误成功（`wa02-webgl2-restored-before-task-yield/`），新增失效 context 的弱集合与 context-health 失效登记。不会因 `isContextLost()` 又变 false 就重新接纳旧缓存；健康 app.close 不标记共享 context 失效。
- 第一次 restored 尝试在 lost 事件的微任务内立即 restore，未等到恢复事件而耗尽原 120 秒预算。原失败目录与 `attempt-timeout.json` 保留，不作应用缺陷归因；修正为让 lost 事件完成一个 task 后才请求恢复。新探针在超时路径先保留报告再做有界关闭。
- `wa02-closure-loss/` 又确认 mapAsync AbortError 可先于 native device-lost 通知；缓冲均未改写，但旧实现原样返回 DOM 数值 code=20。按 WebGPU promise-ordering 规范新增明确的 WEBGPU_READBACK_ABORTED 终态并保留 cause，不能猜测尚未确认的 device loss。新断言仍要求目标缓冲不变、全部 staging 销毁一次、实际 context health=failed；只接纳两个有定义且携带 cause 的终态，不放宽成功/资源断言。
- 最终隔离候选 `candidate-wa02-settlement/build/`：`wa02-settlement-*` 共 13 份报告全部 completed=true、subset=true、errors=[]，共 23 个命名场景（其中 existing-native-resource-contracts 复用原生测试，不把其内部断言重复计数）。覆盖 resize/close/view/loss 映射竞态、两后端 glTF loss/abort、WebGL2 restored 拒绝、初始化丢失、既有原生资源合同、9 项生命周期及普通 WebGL2 读回。
- 相关 CPU 回归 23 项、typecheck、verify:file-map 通过。新增 GPU 生命周期文档，明确共享 device、源资源销毁、设备丢失、场景 AbortSignal/token 的不同责任。文档和 Skills 的进一步整合仍属 WA-08；本批未修改 Skills。
- WA-02 更新为 VERIFIED，仅限已记录的 Chromium 实机定向证据及 CPU 合同，不代表跨浏览器或完整发布验收。WA-03 IN_PROGRESS：开始复现混合格式 MRT 的 color-only draw、未写附件保持及共享 MSAA。WA-04～08 PENDING。默认 SDK、并行修改及 Git index 保留。

## 2026-11-15 / WA-03 原生 MRT 复现与 WebGPU 第一批实现

- 新增 `tools/verify/mrt-attachments.cjs`，沿用只读静态服务器与 native GFX。首先用 RGBA16F + RG16F + R32UI 写出蓝色、速度 `[0.25,0.5]` 和整数 ID `16777217`，再切到共享附件的 LOAD Pass，只输出半透明红色；要求颜色变紫而速度/ID 保持。
- 两后端均有真实失败：WebGL2 在 color-only 透明 draw 后出现 GL_INVALID_OPERATION；WebGPU 明确报告未输出附件 writeMask 非零，pipeline/command invalid，颜色仍为旧蓝色。失败分别保留在 `wa03-webgl2-before/`、`wa03-webgpu-before/`。首轮静态页 favicon 404 也保留，修正测试页图标后 `wa03-webgpu-before-clean/` 仍复现同一 native 错误，不通过过滤 console 获取绿灯。
- WebGPU 原生 PSO 增加 final WGSL 返回接口反射，仅计入口返回的 color location，不把 fragment input/无关 struct 的 location 当输出；未写附件 writeMask=0，整数不 blend，共享 blend state 使用 target0，独立 state 缺目标给明确错误。无法证明输出时 MRT 返回 AIR_E_FRAGMENT_OUTPUTS_UNKNOWN，不把 unknown 当空接口成功。
- 反射 helper 是有输入预算的内部事实读取，不引入 Shader DSL/完整编译器。4 项 CPU 输入/输出/深度-only/unknown 回归通过；首次 typecheck 指出 ES2017 基线不含 matchAll/trimStart，已改用 RegExp.exec 与前导空白替换，保留原失败日志，修正后正在构建验证。
- WebGL2 draw-buffer mask/clear 恢复、共享 MSAA、多附件 Code First helper 和完整 WA-03 验收尚未完成；状态维持 IN_PROGRESS，不把本批视作 MRT 全部交付。
- WebGPU 第一批复验通过：`wa03-webgpu-output-mask-after/report.json` completed=true、subset=true、errors=[]，源码绑定 matches=true；三格式全写入后，color-only 透明 Pass 的颜色为 half-float `[0.5,0,0.5,1]`，速度仍 `[0.25,0.5]`，R32UI ID 仍为 16777217。typecheck 已通过。此结果只关闭 WebGPU 已复现的输出掩码分支，未扩大为完整 WA-03 通过。

## 2026-11-15 / WA-03 WebGL2 掩码、独立状态与 MSAA

- 新增 WebGL2 attachment-state 内部适配：按 native framebuffer 跟踪 draw buffers；每次实际 draw 应用链接后有效输出，不依赖 PSO 是否变化；进入下一 Pass 恢复全部附件以保证 clear。GLSL 全局声明候选由有预算的公共事实 helper 读取，再用真实链接 program 查询位置；参数/局部变量不计入输出，复杂输出宏/别名为 unknown，不假装完整反射。
- OES_draw_buffers_indexed 按需要探测并缓存，支持独立 blend/write mask、禁止整数 blending，恢复公共状态后再 clear；缺扩展明确 WEBGL2_INDEPENDENT_BLEND_UNSUPPORTED。通过特性隐藏负控验证未执行不支持的 draw、不改写目标；unsupported 行不计功能支持。
- 补齐真实 maxColorRenderTargets：WebGL2 取两个原生上限的较小值，WebGPU 读取 native limit（旧宿主未报告时保留标准默认 8），不再留默认 0。
- RGBA16F+RG16F 4×MSAA 的两后端 A→B→A、逐纹理 resolve 和 clear 验证通过。源码确认 MSAA 存储已属于 Texture，没有复制 Pixi 的 per-target 存储重构。
- R32UI 4×MSAA 在本机 WebGL2 不受支持，WebGPU 当前自动 resolve 颜色路径也不支持；旧 GFX 均错误返回对象。原失败保留 `wa03-{webgl2,webgpu}-integer-msaa-before/`。新增分配前 sample/format 验证并返回明确 code；WebGL2 原生逐纹理 resolve 改用 NEAREST，新增修改映射，modifiedCount=317，原 pinned baseline 不变。
- 最终 native 候选 `candidate-wa03-samples/`：`wa03-samples-{gl1,gpu1,gl4,gpu4,gl-int4,gpu-int4}` 六份 completed=true、errors=[]；前四份是功能验证（6/6/4/4 命名观察），后两份是 unsupported 拒绝合同。WebGL2 linked output array 额外实测通过（`wa03-webgl2-array-output/`），特性缺失负控在 `wa03-webgl2-indexed-negative/`。
- 接口事实 CPU 8 项、typecheck 通过；曾漏 FormatType import 的 typecheck 失败保留，修正后重跑通过。verify:file-map=PASS（317），新候选的 9 项 native lifetime 及已有 native resource contracts 也通过，报告为 `wa03-lifetime-regression/` 与 `wa03-resource-regression/`。
- 新增 MRT 指南及工具入口。现有 AirRenderTarget 单颜色 Camera 合同不改写为多输出；下一批 Code First 入口采用原生 Texture/RenderPass/Framebuffer 资源组，管理 clear/load、resize、逐纹理 resolve 与所有权，不另造 Scene/材质/播放器。高层入口、resize/绑定与输入拒绝回收仍待完成；独立状态目标缺失时的提前校验、异常后 indexed state 收敛也要在收口前补齐。

### 单附件 HDR 对照与存量精确截图失败

- 更新旧 HDR 探针以接受外置 source map 的严格 source-binding 收据；保留 required source 覆盖与实际 bundle/map/源码哈希验证，不删像素或生命周期断言。捕获增加 GPU finish 和两个浏览器 RAF 的呈现边界，并确认 paused 且模拟帧未自行推进；finish 不作为耗时测量。
- 新 SDK 的 HDR 数值/控制前段通过，但霓虹同时间重画的精确 PNG 比较失败，仅 4～10 个像素差 1 色阶。时间完全相同、同一渲染帧不重画的 PNG 完全一致，关闭 DITHER 的诊断也未消除差异。各失败图和原始报告保留，未提高阈值或移除 equality 断言。
- 为归因建立隔离 `hdr-before-mrt-fixture/`：沿用 WA-02 原始 SDK/map/收据原字节，仅在副本中从 HEAD 和已知 WA-02 变更恢复所需源码；1020 项编译收据全部匹配，未编辑任何收据指纹。`fixture-receipt.json` 及准备脚本保留，主工作区源码未回滚。
- 新鲜运行旧 SDK 也复现同类失败：`hdr-before-mrt-fixture/output/hdr-native-before/report.json`，相同时间重画有 2 像素、1 色阶差异，同帧不重画完全一致。证明这类精确截图失败在 MRT 改动之前存在；不声称已经找到低位差异的最终根因或两版本频度相同。
- 当前 HDR 全项状态仍 FAIL，作为存量问题保留给 WA-07 进一步核查，不冒称全回归绿。WA-03 仍 IN_PROGRESS；本批没有更新默认 SDK、版本、Git index 或推送。

## 2026-11-15 / WA-03 Code First 资源组与材质所有权

- 新增 `createAirMRTTarget()`，拥有原生颜色/深度 Texture、Framebuffer、配置/LOAD RenderPass 及逐附件 resolve；不创建场景、相机或额外循环。提供实际 samples/generation、借用视图、事务 resize、显式 lower 回退、活动 primary Pass 所有权和幂等释放。
- 抽取 AttachmentView、整数清屏范围与材质绑定共用逻辑。真实 builtin-unlit 含不声明 mainTexture 的 planar-shadow Pass；旧“每个 Pass 都必须声明”检查错误拒绝了可用材质。现在仅选择适用 Pass，先快照共享 propertyIndex 的所有权，再逐个恢复描述符。legacy AirRenderTarget 也复用修正，保留原 Camera 接口。
- CPU：MRT 参数、GLSL/WGSL 接口和共享属性绑定共 14 项通过，typecheck 与 verify:file-map（modified=317）通过。使用指南已补 API、所有权、深度/MSAA、resize 和 raw descriptor 重绑定边界。
- 隔离候选 `candidate-wa03-helper-binding/build/`：`wa03-helper-reference-{gl,gpu,gl4,gpu4}/report.json` 四份 completed=true、subset=true、errors=[]，覆盖原生蓝色/精确 ID、LOAD、材质实际预览、resize 红色、注入分配失败回滚、活动 Pass 拒绝、深度遮挡、native allocation 各销毁一次、共享 sampler 保留及显式降采样。
- 保留失败 `wa03-helper-gl-first/`、`wa03-helper-binding-diagnostic/`、`wa03-helper-binding-gl/`。前两项是多 Pass 误拒绝；第三项是探针错误假设最终 unlit 颜色必为 255，实际为 229。已增加同场景普通 Texture2D 独立对照，蓝/红输出与 MRT 借用视图逐字节相等；原生 half-float draw 仍精确等于 1。没有降低相等断言或修改旧报告。
- 最后检查补上整数附件不能经普通 sampler2D 绑定的分配后/写材质前拒绝。该源码变更使上面四份报告成为上一候选的定向证据；新候选 `candidate-wa03-helper-final/` 正在等待共享构建锁后构建，完成后重跑最终检查。没有删除活锁、停止其他会话或刷新默认 build。
- WA-03 仍 IN_PROGRESS；声明/消费者及当前候选的最终原生回归待收口。WA-04～08 保持待办，未提交或推送 Git。

### WA-03 当前候选复验

- `candidate-wa03-helper-final/build/` 隔离 ESM 构建成功。`wa03-helper-final-{webgl2,webgpu,webgl24,webgpu4}/report.json` 四份 completed=true、subset=true、sourceBinding.matches=true、errors=[]，浏览器 Chromium 151.0.7922.34。单采样各含整数误绑拒绝；4×各验证浮点附件及深度，不把拒绝的整数 MSAA 计为支持。
- 同一候选的 `wa03-native-final-{webgl2,webgpu}/report.json` 分别 7/6 项命名观察通过，覆盖全附件写入、color-only blending、共享 A→B→A、掩码后清屏、独立 mask 与整数禁混合、indexed 状态恢复；WebGL2 另含链接数组输出位置。
- 最终源码 typecheck、定向格式和 diff 检查通过，抽取差异理由已同步 file-map/UPSTREAM。共享构建锁被实际持有时保持等待，锁释放后正常完成，没有取消他人进程或伪造构建结果。
- 以上是 GPU 读回及实际材质渲染的定向证据，不是 compositor 截图或跨浏览器验收。WA-03 尚待声明/安装消费者及 legacy 单附件完整回归；WA-07 继续保留已有精确 PNG 失败。默认声明未改写，未提交 Git。

## 2026-11-15 / WA-03 定向收口与 WA-04 工具

- 在确认无并行构建/声明进程、生成声明无既有未提交差异后运行 `npm run build:dts`，exit=0，223.6 秒完成。默认 `build/cocosair.module.d.ts` 与 `build/dts-contract.json` 已刷新，未重建默认 JS。日志 `wa03-main-dts-build.log` 保留现有 bundler 的 deprecation/不认识的部分模板类型提示，不把提示当成当前 MRT 消费失败。
- 新增 `tools/verify/mrt-consumer.cjs`：TS 4.9.5 直接编译真实生成主声明，验证工厂/类型、原生 GFX 交互、resize/bind/dispose，以及非法 Format 字符串/采样数的 expected-error；`wa03-dts-consumer/report.json` completed=true、diagnostics 为空。这是直接文件声明消费者，不冒称已重打并安装 npm tarball；后者在 WA-08 版本/包整合中处理。
- `wa03-helper-legacy-regression/report.json` completed=true、errors=[]：同一候选的完整 MRT helper 场景另覆盖 legacy AirRenderTarget 三逻辑 Pass 绑定、真实蓝→resize红预览和重复释放，与独立 Texture2D 对照逐字节相等。WA-03 更新为 VERIFIED，仅限台账规定的 Chromium 原生/材质读回与 CPU/声明范围，非完整跨浏览器或发布验收。
- WA-04 复用现有 WebGL collector，加入 begin token，拒绝的重叠区域 end 不再结束外层 query；metadata 在提交时快照，保留 frame/区域/提交/Pass 关联及 CPU 观察窗口，明确 gpu-elapsed-span。增加 bounded pending、失效 context 的终态与 dispose 后准入。原无 metadata 的串行 snapshot 形状保持兼容。14 项 CPU 回归通过；第一轮漏 null context 的 end 检查导致一项失败，已修正后全部通过，没有删用例。
- 新增独立 `tools/debug/gpu-pass-timer.mjs`，提供工具启动窗口的可选 timestamp-query 协商与有界 native query 槽、每 Pass timestampWrites、嵌套逻辑区域、异步 map、slot reuse、abandon、loss/dispose。仅观察显式经该工具编码/提交的原生工作，不自动拦截 Forward/GFX 默认管线，不进入默认 runtime。区域区分 Pass sum 与 earliest-begin/latest-end span；copy 只有跨度贡献，无伪造 per-copy 耗时。
- `tools/verify/gpu-timing.cjs` 在同一 AIR native device 上做 Compute→Render→Copy→Render，验证计算值 1089104129 与复制红色像素、嵌套区域、槽位容量及复用、缺特性仍执行命令、abandon、真实新 device loss。原短空工作时间戳全零的报告保留；增加实际 storage 计算后得到非零时间差，仍保留浏览器量化产生的合法零，不将其解释为性能达标。
- 中间 `wa04-gpu-lifecycle/` 失败源于探针复用了已 consumed 的 GPUAdapter 请求第二个 device；已改为每个独立 device 重新 requestAdapter，非 AIR 运行时归因。所有旧报告保留。
- 最终 `wa04-capture-{webgl2,webgpu}/report.json` 均 completed=true、subset=true、sourceBinding.matches=true、errors=[]，Chromium 151.0.7922.34。WebGPU 负控保留原始快照：map AbortError 可先于 lost 通知，row 仍为 timestamp-map-failed/cause，同时 device state/lostInfo 明确 device-lost/destroyed；未猜测或重写早到原因。WebGL2 真 query 与重叠拒绝通过。报告包含环境、原始纳秒值与 CPU 观察时间，不用于帧率或 compositor 结论。
- 新增 GPU 计时指南及工具入口，格式/diff 检查通过。WA-04 更新为 VERIFIED（上述工具合同范围）；普通默认管线自动 profiling 不在本次交付承诺内。WA-05 开始核对现有纯函数 Effect 归一化、签名与 Shader 诊断供独立预检复用。WA-06～08 PENDING，WA-07 的既有精确 PNG 失败仍开放。无 Git 提交或推送。

## 2026-11-15 / WA-05 独立 Shader 预检

- 新增 `tools/shader-preflight/index.ts`：复用原有 normalizeEffectShaders、effectShaderSignature、GLSL 输出声明读取和窄范围布局预检。输入为有节点/深度/文本预算的纯 JSON；缺资源数组按原合同补空，拒绝错误字段、函数/循环/getter/稀疏数组。报告区分 passed/failed/unknown，固定 gpuValidated=false 和已声明的有限 analysisScope，不充当完整 GLSL 编译器。
- 工具检查 hash 与全局 program 身份碰撞、精确 pass 引用、stage/main、明确片元输出错误/MRT 重复位置、可确定资源布局；宏、include、需运行时注册表补齐的 builtin 绑定和范围外资源保持 unknown。集合 effectIndex 是离线对象关联，不冒充 Material 新参数；显式无效 index 不回退到名字。当前 ProgramLib 仍按全局 program 名查找，不同代码的同名程序由工具拒绝，没有宣称原生同名程序已安全共存。
- 初版直接把 builtin-effects 元数据表当完整 Effect，因表内不含 stage 而失败，保留 `wa05-preflight-first/builtin-report.json`。真实启动会从 builtin-glsl4 装配源码并调用 toGlsl3。CPU 回归从当前 AST 提取该原函数、按同一路径装配全部 22 个 Effect；又发现两种 builtin 缺完整外部绑定信息，不应被窄布局 helper 误判碰撞。首次测试失败日志保留 `wa05-tests-first.log`；已在检查前明确识别该未知上下文，而不是降低断言或给缺省绑定造值。
- `wa05-tests-portable.log`：9 项 CPU 回归全部通过，包含字段缺省/不修改输入、hash/同名碰撞（双顺序）、显式引用、源码行号、宏 unknown、非法 JSON、22 个实际装配的内建 Effect 零确定错误、CLI 三种退出码，以及两个干净 checkout 根的 JS/声明/CLI/收据逐字节一致。生成声明强制 LF，不嵌入宿主绝对路径。
- 新增独立构建器与 `cocosair.js/shader-preflight` 导出、`cocosair-shader-preflight` bin；主运行时不导入该工具。prepack 构建独立 JS/声明/CLI 并复制 JS/CLI 到 npm 目录，输入图只允许四个纯函数模块，另记录 CLI/生成器及 TS/esbuild 版本。package-lock 仅同步根 bin，未增加依赖或更改版本。脚本数量不变，已同步 AGENTS/README/build 清单/npm scripts 写入说明和专项指南。
- `wa05-package-final/report.json`：真实 npm pack --ignore-scripts tarball（SHA256 `888ca204c38c70794e3c0bae16ca754554060ef75f470102ae0a7face2611059`）离线安装，通过无 DOM Node 公共子入口导入、无 lib.dom 的 TS 4.9.5 声明及非法引擎导入负例、安装后 CLI 读取实际 Effect。该脚本只生成可选产物并核对既有两个主发布副本未被重写，不认证它们的新鲜性或完整 SDK 发布状态。
- `wa05-browser-final/report.json`：Chromium 151.0.7922.34、completed=true、subset=true、errors=[]，主候选 sourceBinding 的 1027 项全部匹配，独立预检收据的全部输入/输出也匹配。预检源码经当前 AIR 原生 GFX WebGL2 编译并绘制，struct 按值、提前 return 与两个 MRT 输出分别读回 `[0,128,0,255]`、`[255,0,0,255]`。没有把此单一场景推广成所有 GLSL 或所有后端验收。
- typecheck、定向格式与 diff 检查通过；未重建主 JS、未提交 Git。WA-05 更新为 VERIFIED（上述范围）。WA-06 IN_PROGRESS：已重读 html-source 和现有用例，确认 getAirHTMLSourceSupport 当前无论动态/快照都要求 captureElementImage，下一步按真实能力拆分必需与可选路径。尚未声称新版浏览器 API 可用；WA-07/08 及既有 HDR 精确 PNG 失败继续待办。

## 2026-11-15 / WA-06 HTML-in-Canvas 定向收口

- 先收失败：`wa06-html-before.log` 原实现 4 项失败、7 项通过，分别是动态不依赖可选 snapshot/geometry、嵌套归属、native backing size 与 repaint 抛错终态。真实 Chrome 157.0.8103.52 的 `wa06-nested-before/report.json` 同样拒绝合法嵌套元素；旧报告和截图保留。
- 更新 html-source：支持查询区分动态、snapshot 和可选 geometry/naturalSize；动态不再强依赖 capture 或 geometry。snapshot 模式单独拒绝缺 capture；缺 geometry 的调用返回明确 code。元素按最近 canvas 归属校验，保留重复租约与移动检查。默认使用 native backing size，显式 resolution 保持 CSS 倍率；同步 repaint 抛错进入 failed，可重试。没有引入另一个播放器/渲染循环或旧 texElementImage2D fallback。
- `wa06-live-first/` 与 `wa06-live-input-diagnostic/` 保留真实键盘失败：命中 input、焦点正确，但输入值不变。`wa06-input-pal-negative-control/` 仅在 input 上拦住 keydown/up 冒泡后，真实键入 AIR 和 GPU 字形变化恢复（730 个字节变化），证明 PAL 对冒泡键盘事件的取消阻断编辑，不归因于 Chrome 不能输入。该负控随后在 compositor 断言失败，也未抹去；后续修正探针的 texture.reset 后材质重绑和原生 paint 绘制边界，并加入上下文字方向断言，不放宽截图阈值。
- 最小 PAL 修复位于 startup-binding-patch.cjs 并重新生成 keyboard-input.js：canvas DOM 后代 keydown 留给浏览器，不取消默认或进入引擎按下链；keyup 保留原释放通知，但不取消 DOM 默认，避免已有 held key 卡住。直接 canvas 键与显式转发保持旧行为。冻结 vendor/PAL 许可均未改，映射与 UPSTREAM 已同步；modifiedCount 仍 317。
- `wa06-html-keyboard-tests.log`：21 项 HTML 源/原生 action-input 回归通过，包括新 DOM 后代默认行为和旧 keyup retirement。pal-source --write/--check 通过；`wa06-pal-portability/report.json` 对两个干净 checkout 根的全部 42 个生成输出/声明/notice 与当前磁盘逐字节匹配。
- 隔离运行时 `candidate-wa06-keyboard/build/` 构建成功。Chrome 157 无实验 flag、无 keyboardControl 下的最终 8 个模式/DPR 组合均 completed=true、subset=true、errors=[]、1027 项 sourceBinding 匹配：`wa06-nested-upright/`，`wa06-{live,snapshot,no-snapshot}-dpr2/`，`wa06-{live,snapshot,no-snapshot}-matrix-dpr1/` 和 `wa06-nested-matrix-dpr2/`。覆盖首帧红色、TOP 在图像上半部、两次真实点击与 resize、真实键入 AIR/纹理字形变化、首帧/更新 compositor PNG、snapshot 图像/尺寸冻结和一次 close、属性恢复、borrowed texture 保留。DPR1 的初始 32²、DPR2 的 64² 与 resize 后 native size 一致。
- no-snapshot 是隐藏可选方法的受控能力组合，不冒称 Chrome 原生缺方法。`wa06-ordinary-unsupported/` 明确记录普通 Chromium 151 未暴露 API；`wa06-legacy-capability/` 记录该版本带 flag 仍缺现代 upload，维持 unsupported，不计为功能支持。
- 更新实际 HTML 示例的 source 消费刷新与能力提示；graphics-examples 增加显式开发模式 --id/--bundle，默认四例范围不变，选择子集必标 subset，候选源码绑定匹配才运行。`wa06-example.json` 是真实页面按钮、点击/输入、移动 viewport/释放的 PASS，subset=true、scope 仅 html-texture-experimental；已实际查看截图。没有修改 Gallery 状态或 canonical campaign。
- 主声明 `npm run build:dts` exit=0，221.1 秒；`wa06-html-types/report.json` 的 TS 4.9.5 消费新 support/capabilities 类型及错误参数负例通过。默认声明刷新，默认主 JS 未由本批覆盖。定向格式/diff、file-map 与 PAL gate 通过；新增 HTML 指南并校正手册中已过时的 WebGPU 后端描述。
- WA-06 更新为 VERIFIED，仅上述本机 Chrome 157 功能/画面和 Chromium 151 unsupported 范围，不扩大为其他浏览器/移动设备/完整发布。WA-07 IN_PROGRESS：继续首帧/多帧水体与 MRT 场景，以及之前已复现的 HDR 精确 PNG 差异；WA-08 版本/Skills 整合仍待办。未暂存、提交或推送 Git。

WA-06 最终补查：typecheck 日志无诊断；完整 doc-refs 仍 exit=1，唯一未解决项与启动时相同，为并行修改的 `docs/reference/android-runtime-interop.md -> build/runtime-interop-android.cjs`。当前检查 272 个文档/2077 个引用，未新增本任务断链；未修改他人文件或棘轮基线掩盖它。手册与指南的 geometry 示例改为在 onUpdate/paint 已就绪后提交，避免示例本身在首个 paint 之前调用 native geometry。

## 2026-11-15 / WA-07 水体首帧与 HDR 分层归因

- 当前候选的 `wa07-hdr-baseline/` 再次复现精确 PNG 失败：同帧重复截图相同、固定时间重画后 11 像素差 1 色阶。没有改像素容差或删 equality 断言。
- 扩展 HDR 探针的可选 raster-diagnostic：在 AFTER_DRAW 保存源 HDR Float32 与默认 framebuffer RGBA 原始二进制、相机矩阵、native draw 标识/参数和 buffer 上传指纹，并检查同帧连续读取。`wa07-hdr-raster-diagnostic/` 已确认差异先出现在场景 HDR 源（724 像素、最大 0.0078125），后续约 10 个最终像素差 1；不是仅 compositor PNG 改色，相机矩阵与时间相同。
- `wa07-hdr-draw-trace/` 被 source binding 正确拒绝：并行会话修改了 render-target.ts 自动 resolve 的 GL 检查路径，旧 SDK 过期。这次是候选准入失败，不是新的渲染失败。保留对方改动并建立 `candidate-wa07-trace/build/` 新隔离候选，未回滚、覆盖或改写收据；WA-01～06 旧报告仍保持旧身份。
- `wa07-hdr-draw-trace-current/` 记录前后 147 次实际 draw 标识/参数完全一致；8 次上传中仅 global UBO 帧号不同。加仅诊断的 global 帧号控制后上传指纹也一致，硬件差异仍存在，不能单归因于总帧号。该控制只针对实际识别的 global native buffer，不修改 director 帧计数，且必须同时开启 raster-diagnostic；不作为正式通过路径。
- `wa07-hdr-hardware-profile-final/`：实际 Intel Graphics / ANGLE D3D11、Chromium 151.0.7922.34；DITHER 关闭、global 帧号控制、同帧读回相同的条件下，硬件精确 PNG 仍 FAIL（8 像素、最大 1）。尚未追踪所有 GL 状态或确证下层驱动原因，不宣称引擎无责任或所有 Intel 设备均有问题。所有失败、原始读回和截图保留。
- 显式 AIR_CI_SOFTWARE_GL=1 的实际 renderer 为 ANGLE SwiftShader Vulkan。先有诊断控制的 `wa07-hdr-software-control/` 源/framebuffer/PNG 零差异，再有**未开启诊断、不关 DITHER、不改 uniform**的 `wa07-hdr-software-unmodified/`；最终同一工具版 `wa07-hdr-reference-profile-final/` exit=0、completed=true、subset=true，原 6 组 HDR/曲线/曝光/Bloom/相机隔离/霓虹控件断言全部通过，精确 PNG 差异 0。这是明确的软件参考配置，不是默认应用 fallback 或硬件门禁转绿，不作为性能结论。
- 水体采集器新增显式 --serve/--bundle/--first-frame 和新目录拒绝覆盖，严格核对候选源码绑定。只在内存中对 app.run 单一锚点加首帧钩子；第一场景 AFTER_DRAW 即暂停 native pacer，检查 state.frames=1 后保存首次图像，再单步到第五帧。后续截图等待验证帧号不推进，生命周期前显式恢复 native pacing。未改业务 Shader 或磁盘 main.ts 来凑图。
- `wa07-water-first/` 的前段首帧/第五帧、光学通道等已通过，但 resize 在浏览器尚未完成 backing 更新时过早检查失败；原失败报告保留。改为先等真实 backing size 到位，再按原时钟单步，未改变尺寸/代数/像素断言。
- 最终 `wa07-water-identity-final/report.json`：64 项全过、completed=true、subset=true、errors=[]，实际 Chromium 151.0.7922.34 / Intel ANGLE D3D11。第一帧与第五帧 PNG 字节一致，三个真实目标有限/非均匀、裁剪标志、三个已知点深度、各光学/透明开关、鱼鳍遮挡、鼠标波纹、雨、resize 及真实释放重建均通过；记录示例/共享辅助工具指纹和 renderer。已人工查看首帧图像，未见空反射、错层或首帧白屏。
- 新增画面回归指南，解释单时钟、首帧定义、明确参考环境与硬件未关闭项；格式/diff 检查通过。WA-07 保持 IN_PROGRESS：MRT 可操作展示与 compositor 多帧/释放还待补齐，硬件 HDR 精确重复性仍开放；WA-08 尚待。未提交或推送 Git，也未更新 canonical Gallery/evidence。

## 2026-11-15 / WA-07 MRT 控件、整数采样翻译修复与资源证明

- 新增显式开发页 `tools/debug/probes/mrt-attachments/`，dev server 仅增加三个固定路径 `/__probes/mrt-attachments/`、index.html 与 main.js。普通应用不加载，不新增/提升 Gallery ID 或修改 canonical 状态；启动器语法与路由路径已检查，浏览器画面验收使用只读本地服务和明确候选 SDK。
- 开发页直接采样 RGBA16F/RG16F/R32UI，提供真实 channel、颜色单独透明叠加、64/128 resize、dispose/rebuild。写/读 Pass 的 layout 分离，源附件不同时作为写 Pass sampled resource；全局 sampler 从公开 bindingMappingInfo 的保留 UBO 槽后开始。resize 后刷新实际 render pass/PSO/descriptor。capture 模式首个显示帧暂停 pacer，所有动作由同一时钟推进，不增加播放器。
- `candidate-wa07-mrt-view/` 首次构建在输出后因共享 build number 并发变化 exit=1，保留 `wa07-mrt-view-build.log`，没有将已存在的文件视作成功候选；随后新目录 `candidate-wa07-mrt-retry/` 构建 exit=0。
- `wa07-mrt-view-gl-first/` 记录探针初版 raw global sampler 占用保留 UBO 槽导致无效 texture unit；按原有公开 bindingMappingInfo 纠正装配，非改写引擎映射或绕过类型检查。后续 WebGL2 五组实际控件/像素检查通过。
- WebGPU 的 `wa07-mrt-view-gpu-{first,diagnostic,source-diagnostic}/` 失败均保留。实际传给 glslang 的源码明确把 usampler2D 降成 texture2D/sampler2D，触发 float 不能赋给 uint；不是仅凭类型字段猜测。调试页保留 bounded 最后 12 份提交源码及 cause，采集器记录 driver warning/log。
- 最小修复抽取 `webgpu-commands.ts` 的 combined sampler 分离：保留 u/i 标量前缀与函数形参类型、接受等价 layout 空白、避免把 standalone sampler 再转成不存在的 texture。未重写编译器、未修改冻结 vendor/WASM，native sampler offset 64 保持。已同步 file-map/UPSTREAM，modifiedCount 仍 317。
- `wa07-sampler-before.log` 三项 fail-first；修复后同一实际纯函数（AST 提取，不初始化引擎、不另写替身）3 项通过，覆盖 unsigned 2D、signed array、float cube、形参与调用、compact layout、already separate；typecheck 与 file-map 通过。`candidate-wa07-integer-sampler/build/` 隔离构建 exit=0，既有 WebGPU native resource contracts 复跑通过（`wa07-integer-sampler-native-regression/`），不重复计其内部断言为新测试数。
- 最终 `wa07-mrt-compositor-{webgl2,webgpu}/report.json` 均 completed=true、subset=true、errors=[]、5 组观察通过，源码绑定匹配。首帧/第五帧 PNG 相同，真实三个视图不同，颜色叠加只改变颜色，ID 原生读回 16777217、velocity 保持；resize 的代数/新数值正确，真实释放/重新进入恢复画面。WebGL 是本机 Intel ANGLE D3D11，WebGPU 实际 gfxAPI=8、vendor=intel；没有用另一后端填支持缺口。
- 释放独立于登记计数：WebGL 检查旧 native textures 全部无效，WebGPU 对三个实际 GPUTexture.destroy 分别记录 [1,1,1]；shared sampler 保留，重建后重新实际渲染。此证据证明 native API 释放与所有权，不推断物理驻留内存归零。保留全页 `lab-page.png`、各 view/overlay/resize/reentry PNG 与原始数值，已人工查看页面，更新 MRT/visual guides。
- 当前场景代码与定向回归已补齐；Intel HDR 精确重复性存量 FAIL 仍开放，未靠 SwiftShader 参考 PASS 宣称硬件通过。WA-07 记为 IMPLEMENTED（上述场景已验证，硬件精确门禁未关闭），接下来独立推进 WA-08 文档/Skills/产物整合。未提交 Git。

## 2026-11-15 / WA-08 文档、保留式 Skills 更新与真实冷读

- 新增 [Web 渲染能力与 Agent 使用索引](../../docs/guides/web-engine-reliability.md)，README 可发现；列出主入口/独立预检/开发工具、准确 API、后端边界与已保留 SDK、map、收据和安装 tarball 身份。未把旧包或后来默认产物视为当前候选，未重建运行时或声明。
- 五份现有 reference 添加日期补充：render-target、pipeline-reachability、custom-glsl、html-source、report-layers。覆盖 MRT/整数链、失效与异步终态、计时语义、预检 unknown、HTML 能力/绑定/真实输入及截图证据边界；原正文逐字节保留。22 个技能名称、触发条件、宿主字段、Reference map、生成索引和 migration ledger 均未改。没有启动第二阶段迁移。
- 冻结快照 SHA256 为 6ad321944d86966c945b6ea85a9c3f1b4e1315761c48910f2706941be4f36b80。独立无父历史 B1 冷读仅用冻结 L0/router/owner/两份主题文档，先封存答案，再按六项要求核验，全通过；真实读取 receipts、首次参数失败与原始 payloads 均保留于 [本次冷读](../plans/skills-token-evidence/reading-wa08-B1-20261115/review.md)。此题测光照/阴影知识与路由，不冒称新 MRT/HTML 内容已做独立行为评测。
- 完整 P1 在当前仓库依赖下实际失败：js-yaml 3.15.2 与不可变基线 3.14.1 不同，candidate-route fail-closed。没有回写历史版本/hash、降级根 lockfile 或改门禁。隔离复制当前文件并实际安装 js-yaml 3.14.1 + prettier 3.9.9，同一完整 P1 exit=0；保存、原始恢复、索引、元数据、44 问双视图路由、B1 成本、A-only 全树分发全部按原合同通过。原始路径的预期 FAIL 保留。
- B1 字符输入量 40,675 对照 85,260，约减少 52.29%；不是模型计费 token、GPU 性能或真实任务分布统计。CI candidate-loads 更新到本轮真实事件，旧证据不改。当前依赖下 CI 仍会遇到版本不匹配，保留为明确开放项。
- 不可变压缩历史报告四份校验 PASS；43 项路径自测 PASS；配套 Node 测试 169 项中 159 PASS、10 因 Windows 创建真实 symlink 的 EPERM 失败，未 mock/skip。通用 skill-creator quick_validate 不识别套件既有扩展 frontmatter，未修改字段迎合；项目 candidate-meta 通过。完整文档引用检查 274 文档/2093 引用，仍只有既有 Android 并行文件断链，本轮未新增断链。
- 原始报告、stderr/exit、manifest 和收据已收纳到 [WA-08 验证记录](../plans/skills-token-evidence/wa08-validation-20261115/README.md)，不只留临时输出。WA-08 标记 VERIFIED（本轮文档/Skills 与基线依赖 P1/B1 范围）；不代表当前根依赖完整 CI、默认包、跨浏览器发布或 WA-07 硬件精确 HDR 已关闭。未暂存、提交或推送 Git。

## 2026-11-15 / Git 交付前重新采证

- 提交前发现手动清理移除了未提交的旧 WA-08 B1 与验证 JSON/Markdown；旧目录仅保留缺失说明，不编造恢复事件、答案或 hash。为相同 Skills 快照重新启动无父历史独立冷读，先封存答案再核验，六项通过；新证据见 [交付 B1](../plans/skills-token-evidence/reading-wa08-delivery-B1-20261115/review.md)。首次参数错误真实保留。
- 隔离真实安装基线 js-yaml 3.14.1/prettier 3.9.9，重新执行完整 P1 exit=0，全部预期检查通过；报告/原始 gate 输出/锁文件收纳于 [交付验证](../plans/skills-token-evidence/wa08-delivery-validation-20261115/README.md)。当前根依赖兼容性仍开放，CI 指针改为本轮新采 events，不复用缺失旧记录。
- 本次 typecheck、Web-only、file-map、PAL drift、8 组 46 项 runtime 与 26 项 tool 回归通过。保留 Intel HDR 精确门禁、Windows symlink 权限及并行 Android 文档断链的已知限制，不宣称全部 CI 或发布就绪。
- 按 WA 任务范围准备源码、文档、Skills 与新证据提交；并行 Android、examples/files.json、FXAA、本机设置与默认生成 JS/声明不混入。默认 min 产物过期，默认输出没有新鲜成套验收，本次仅交付源码，不发布 npm。
