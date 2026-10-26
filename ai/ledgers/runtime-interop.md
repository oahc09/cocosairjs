# 通用 WebGPU Runtime 桌面验证

记录日期：2026-10-25。范围经用户确认：本仓库探针及桌面验证，不修改 MystralNative 宿主、不交付 Android APK。

最新结论：用户后续明确允许修复并构建桌面宿主；B12 Windows V8+Dawn 配置已完成同一 AIR Bundle 的五组行为、立方体及 PBR/骨骼/UI/Compute 扩展矩阵。Chrome、Edge、MystralNative 全部通过，42输入与30PNG独立复核。最终身份与报告见文末，前述范围和早期结果保留为阶段历史；Android 未开展。

## 实施

- 从 `469a9e6574b07194eb2e4c6ec77f49c74a876080` 建立独立 worktree 和 `feat/webgpu-runtime-interop`；原工作区未提交改动保持原样。
- 新增共享五组 Web API 行为探针、AIR 三帧立方体冒烟、浏览器/原生采集器和四项工具回归。默认运行时、引擎源码、版本、npm scripts 与默认 CI 不变。
- 同一份当前源码 SDK 独立构建到 `output/runtime-interop/sdk/`，构建号按现有机制从 215 推进到 216。Bundle SHA-256 为 `417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a`；source map 对照 945 个源码输入，前后均无差异。
- Node `v24.14.0`，esbuild `0.28.2`，pngjs `7.0.0`，浏览器工具 Playwright `1.62.1`。复用已安装依赖和浏览器，没有安装或修改系统 PATH。

## 首轮结果（历史快照）

下述首轮报告绑定首轮工具指纹；继续推进后的当前代码与最新结果见文末，不能继承下述 PASS。

| 执行对象                     | 最终结果                                                                                                                           | 原始记录                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Chrome 155.0.8059.85         | 五组 PASS；AIR 冒烟 PASS；独立 PNG、资源释放、exit/close 与 PID 消失通过                                                           | `output/runtime-interop/chromium-attempt-3/report.json`       |
| Edge 156.0.4314.42           | 五组 PASS；AIR 冒烟 PASS；独立 PNG、资源释放、exit/close 与 PID 消失通过                                                           | `output/runtime-interop/edge-attempt-2/report.json`           |
| MystralNative v0.1.6 V8+Dawn | completed=true，FAIL；Canvas 原型失败，模块/Shader 资产动态加载返回 Not supported，GPU 两组 BLOCKED；AIR 在 import-bundle 阶段失败 | `output/runtime-interop/mystral-attempt-2/report.json`        |
| 工具 CPU 回归                | 4/4 PASS，覆盖缺项/重复/未执行拒绝、PNG 负控、Node 宿主超时、CLI 参数                                                              | `node --test tools/verify/runtime-interop.test.cjs`           |
| 静态检查                     | 新增 JS/MJS 语法、修改范围 Prettier、diff 通过；最终文档引用 132 个，零新断链                                                      | 文档检查显式包含既有基线所在 scope-decisions 文档，未修改基线 |

两浏览器 AIR 均真实 `gfxAPI=8`，一次 cube draw，三帧单步，暂停帧 `3 → 3`；独立截图显示蓝背景及橙红立方体。Mesh/Material 释放后 `isValid=false`，原生 pacing 在清理前恢复。浏览器原始四秒关闭预算内分别为 151 ms、748 ms，exit/close 均 code 0、signal null；Windows 未声称 ECHILD。

最终三份报告 SHA-256：

| 报告     | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| Chromium | `cb654be51731b1cdba7c98ab05f62e41f8ccd98cb516b3f01771c58fda44ae71` |
| Edge     | `c6a6b4a42da682ed40328f14544a3ffc34a09e444aed928001aeb4ef1faef712` |
| Mystral  | `9241a007d5e28453a544debaa8b6e44013f2668484dbafa9dada3ae28b970554` |

报告及相邻日志、入口与截图留在被忽略的 `output/`；它们不是仓库中的 canonical example evidence。首轮结束时独立复核确认三份报告的 20 个输入哈希均匹配当时文件，两浏览器各两张截图哈希一致；这些指纹不代表后续代码。

## Mystral 版本与证据限制

执行的是官方 v0.1.6 Windows V8+Dawn 发布包，对应源码 `53e96a3c4e9530ac51c5e325d9b0cb6c2a50f0ec`，不是审阅时 main 的 `bafab09d599bd55aeb7433ba7131c3f320334c99`。

- 下载来源为官方 GitHub release，ZIP SHA-256：`c7e35c5bbf5b2a131d8e651bae8292dec95b909f3ed30b67a218065681d96686`。
- 实际 mystral.exe 为 45,467,136 bytes，SHA-256：`712aaa0a3a8ade1b2f4d60dd1467f8b5a42e6a8f4dd1e24bc1b2366e46ede0cc`。
- 两个进程均自然 exit/close code 1，无超时，唯一 JSON 标记及完整分组均已返回。
- Shader 失败发生于模块与 fetch 加载阶段，尚未到达 WebAssembly.instantiate；不能据此声称 V8/WASM 自身不可用。GPUAdapter.info、GPUDevice 错误事件等后续接口也未取得本次原生执行证明。
- 首轮原生适配器尚无独立呈现采集通道，首轮无原生呈现 PASS；文末记录后续新增的外部 WGC 通道及其独立控制验证。

## 保留失败与后续范围

Chrome attempt-1 原始失败及 `errors-diagnostic.json` 保留：真实 uncapturederror 需要推进设备队列才能送达，已添加空提交并等待队列完成，没有删除或弱化事件断言。首次采集中工具仍在修整，`inputsUnchanged=false`，该报告不能用作验收。中间 Chromium attempt-2、Edge attempt-1、Mystral attempt-1 也保留，最终结果只引用上表冻结后执行。

本轮未提交、推送、创建 PR 或发布。Firefox/Safari、最新 Mystral main 构建、宿主修复、原生呈现、Android、多引擎矩阵、Box2D 与性能对照均未验收；本报告固定 subset=true、releaseReady=false。入口和重跑参数见[Runtime 互操作说明](../../docs/reference/runtime-interop.md)。

## 继续推进：独立 GPU 诊断与原生呈现

继续推进仍限于本仓库和桌面验证。已询问用户是否扩展至 MystralNative 宿主修复；收到明确回复前没有修改宿主。构建预检确认本机已有 VS/MSVC、Windows SDK、CMake 和 Ninja，无需先安装编译器；宿主源码构建依赖尚未准备，此项不是宿主构建通过。

本次新增：

- Shader 失败不再跳过 Adapter 信息、实际 limits 协商和独立 device 错误/销毁诊断。原渲染、读回、呈现断言保留，依赖缺失只阻塞这些子阶段。
- 新增外部 Windows.Graphics.Capture helper、可复现构建入口及随机 token HTTP 握手。只拍本轮进程 PID 所属的唯一可见窗口，核验 helper 的源码/EXE/构建回执和 PNG；不调用 Mystral GPU 截图接口。
- 显式 `--headed --capture-executable=<helper>` 启用原生独立呈现。默认无捕获通道仍不能通过；捕获不依赖固定 `--frames`，在资源存活时由真实握手触发。

辅助程序通过现有 CMake/MSVC 构建，无警告或错误：`output/runtime-interop/capture-build-attempt-2/capture-build.json`。EXE 为 91,136 bytes，SHA-256 `ffe8fa92e703010ac628bb3bd6f165198752bfd4c2569a3f957589d898cfa6a1`。真实 WinForms 自有窗口先验证装饰裁剪为 320×240；首次隐藏窗口被拒绝的尝试也保留。

随后在**未修改的 Mystral v0.1.6** 上运行直接 WGSL 三角形作为捕获通道控制，真实 HTTP 握手 → WGC FrameArrived → 客户区 PNG → 独立像素核对通过。中心 `[255,0,0,255]`、背景 `[0,0,255,255]`；host/helper 均真实 exit/close code 0。原始报告为 `output/runtime-interop/native-capture-control-attempt-2/report.json`，SHA-256 `9bedb8d28d7f5af17ffeed67e94b633f15eda6bd56d105370e68082285346cad`。**该结果只验证原生捕获通道，不是 AIR 或 G0 通过。**

最新冻结后结果：

| 对象            | 结果                                                                    | 原始报告                                                |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Chrome          | 五组与 AIR 冒烟 PASS；24 项输入稳定；945 源码绑定一致；关闭 146 ms      | `output/runtime-interop/chromium-attempt-5/report.json` |
| Edge            | 五组与 AIR 冒烟 PASS；24 项输入稳定；945 源码绑定一致；关闭 251 ms      | `output/runtime-interop/edge-attempt-4/report.json`     |
| Mystral v0.1.6  | completed=true、FAIL；24 项输入稳定；两进程真实 code 1 关闭，无超时     | `output/runtime-interop/mystral-attempt-4/report.json`  |
| Shader 缺失负控 | 故意缺失 Shader 后整体仍失败，GPU 协商与错误/lost 独立执行，错误组 PASS | `output/runtime-interop/shader-blocked-control.json`    |
| 工具回归        | 4/4 PASS；新增原生捕获参数约束检查                                      | `node --test tools/verify/runtime-interop.test.cjs`     |

三份最新报告 SHA-256 分别为：

- Chrome：`dee24dfed6ece3132b2764f3d59e8eba970d92e71e55d6c019961cea1ca46371`
- Edge：`cc9cb5659d1b70181ac0a25850d940a3f2138d1f65fe63f9efe02e164188e75a`
- Mystral：`c88e6d66ce0220e3c674c8b3e73ef9e95c1b457987552eb270f9d912316a95d4`

原生新增实测阻断：`GPUAdapter.info.vendor` 不可用、`maxVertexAttributes` 不是有效 limits、错误作用域未返回验证错误、`GPUDevice.addEventListener` 不存在、`device.destroy()` 不存在。由于 destroy 未成功，不能声称已实测其 lost Promise 不兑现；Shader 仍在动态加载阶段失败，不能声称已证明 WASM runtime 缺失。AIR 仍在 import-bundle 阶段失败，未到达原生窗口捕获边界，故本次 AIR 捕获数量为 0。

目前本仓库采集链路与桌面验证已完成；“同一 Cocos AIR Bundle 在 MystralNative 启动并呈现”的总体目标仍未达成。后续实际工作需要修复并构建宿主的通用 Canvas/DOM、ESM、WebGPU 接口，然后按同一探针重新验收；该范围确认仍待用户回复。所有早期与中间尝试原件保留，未修改引擎来绕过缺口，未提交或发布。

## 桌面宿主修复启动记录

用户在上述明确提出宿主修复范围后回复“继续推进”，现按该授权继续桌面宿主修复，Android 不开展。官方 main 已重新核实仍为 `bafab09d599bd55aeb7433ba7131c3f320334c99`，检出至 `output/runtime-interop/mystral-source/` 的 `feat/cocosair-webgpu-interop`，初始工作树干净。

当前实施分工为通用 DOM/Canvas、V8 模块与异步 WASM任务泵、真实 WebGPU 绑定、隔离依赖/CMake 构建。宿主修改没有 Cocos 专用条件，也没有改 AIR Bundle。依赖下载来源/哈希及失败原件在 `output/runtime-interop/mystral-build-deps-attempt-1/dependency-inventory.json`；构建记录使用新的 `host-build-attempt-*` 目录，失败不覆盖。

V8 模块修改已通过真实 MSVC `/Zs` 检查，宿主全量构建仍在进行，尚无新宿主运行 PASS。已发现并修正 MSVC 的 `__cplusplus` 检查与 UTF-8 选项、旧 `/await` 与 C++20 冲突。最终交付仍需导出绑定基线的宿主补丁与依赖/构建身份，并对同一 SDK 完成五组及 AIR/WGC 验收。

## 桌面宿主最终验收（2026-10-25 15:15 北京时间）

本轮桌面目标完成：**同一份未修改的 Cocos AIR SDK 在本地修复的 MystralNative 上启动、绘制并经独立 WGC 验证呈现。** Android、发布或完整 Web 平台规范未验收。

最终宿主为 `output/runtime-interop/host-build-attempt-9/mystral.exe`，35,596,800 bytes，SHA-256 `92f69e5f9b20a32b8a5d1f48c6487c02bc78b6df0f68d4b527fb193e289cb0c4`。实际 configure/build/version 退出码均为 0，完整源码构建前后与再次核对一致；收据为同目录 `host-build.json`。SDK 仍为 build216，SHA-256 `417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a`，Cocos 源码没有为宿主增添特例。

宿主六文件改动覆盖：

- 通用 DOM/Canvas 原型、真实节点树/事件/尺寸与入口 URL、Image 和 Canvas2D 像素适配。
- V8 URL 动态 import、import.meta、原生模块缓存/求值失败、异步 WASM foreground tasks；跨帧 native callback 按 JS 函数 GC 生命周期释放；真实 console timers。
- Adapter/Device 实际信息、limits/features、真实错误作用域/事件、queue/编译完成与设备销毁/lost。
- 标准 iterable sequence、纹理复制可选布局和偏移、stencil/writeMask、真实 Canvas drawing buffer。
- Buffer map 回调改为主线程 `AllowProcessEvents`，消除独立复核发现的跨线程 `BufferMapData` 状态竞争；没有以历史运行 PASS 跳过此修复。
- MSVC C++20/UTF-8 与 coroutine 构建选项。保留上游许可证，不修改 deprecated native GLTF 实现或用它加载 AIR 模型。

补丁交付在 `tools/verify/runtime-interop/host-patches/`：`mystral-native.patch`、`manifest.json`、`build-profile.json`、`LICENSE-MYSTRAL.txt`。补丁 SHA-256 `97b2979c7d388cee2a30ff5e2162b8c2799d7bea54e78bcc0c86df0d478dc586`；完整编译源码指纹 `e8199100f614c610ca3285c5e2d6c67d0c4e002abc7f6404944abf6b618d062d`。第二个干净 `bafab09` 检出已实际 apply，六文件字节与构建源码逐个一致。

冻结后的正式执行全部 `completed=true`、`pass=true`、`inputsUnchanged=true`、`subset=true`、`releaseReady=false`：

| 对象                 | 结果                                                                                                                   | 报告                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Chrome 155.0.8059.85 | 5/5 行为 + AIR PASS，GPU errors=0；exit/close 0，PID 消失，关闭 170 ms                                                 | `output/runtime-interop/chromium-final-20261025/report.json` |
| Edge 156.0.4314.42   | 5/5 行为 + AIR PASS，GPU errors=0；exit/close 0，PID 消失，关闭 263 ms                                                 | `output/runtime-interop/edge-final-20261025/report.json`     |
| 本地 Mystral build9  | 5/5 行为 + AIR PASS，GPU errors=0、consoleErrors=0；两个 host 和两个 WGC helper 均真实 exit/close 0、无 signal/timeout | `output/runtime-interop/mystral-final-20261025/report.json`  |
| 新宿主模块控制       | 缓存/import.meta、相对静态依赖/TLA、HTTP404拒绝、模块求值拒绝 4/4 PASS                                                 | `output/runtime-interop/host-modules-attempt-3/report.json`  |

三份正式报告 SHA-256：Chrome `501d9c93e93874e6b4b92a6ab68d088c46bafe19fa94ccb98c3dbcc0435f0310`；Edge `1985cbc4e240d5e86ce4ef4870746c874f7a858972ec2594ce1730b86d0138a1`；Mystral `92c8954cb9f7a92b5cad64ba15787d1fc4ecb65d45c866af8fec96928d4f5e77`。

独立只读复核重新核对三份报告各 28 个输入哈希、945 项 SDK 源码映射及共六张 PNG，全部一致。Native 的 `--host-build` 在执行前后绑定实际构建收据、manifest、patch、完整源码和 EXE；篡改收据的负控已被拒绝。两张 WGC 原始 JSON 中 PID/HWND/尺寸/路径与实际子进程及 PNG 一致。AIR 使用单步三帧，暂停期间 `3→3`，呈现后恢复 native pacing，scene/Mesh/Material 释放，GPU listener 已移除。Native AIR PNG 中心为 `[229,64,22,255]`，背景为 `[20,40,80,255]`；根任务已目视真实立方体。

所有下载、构建、旧候选、失败重试及中间 PASS 原件继续保留。build4/5/6/7/8 与 local-attempt-1/2/3/4 不替代 build9 正式报告；初次 DOM、可选 offset、console、iterable/stencil 缺口均通过宿主修复解决，未改探针断言或像素阈值。工具 CPU 回归仍为 4/4，另有模块与收据篡改控制；没有扩大默认 CI 或运行全仓 campaign。

保留边界：当前是 Windows x64、V8+Dawn、单 native device、同源 HTTP 模块的实验兼容配置，模块链接使用有界同步 HTTP。上游 `/FORCE:MULTIPLE` 的 V8/Dawn Abseil 链接告警仍在，未声明发布 READY。任意 file URL/重定向、多设备、长期 GC/生命周期压力、PBR/蒙皮/UI/Compute 工程矩阵、其他引擎、Android 和性能均未验收。两个仓库分支均未暂存、提交、推送、创建 PR 或发布。

## 桌面扩展矩阵完成（2026-10-25 19:45 北京时间）

本阶段将四个固定场景加入显式 `--matrix`，保留原五组与立方体作为必需前置。每个场景独立页面/进程、独立 before/after PNG，并以同一 step clock 驱动真实行为；默认命令和普通 CI 不增加这些执行。

场景与效果证据：

- **PBR**：通过 AIR JavaScript glTF loader 加载原 BoxTextured，真实纹理绑定 `air-gltf-standard`。只将 roughness/metallic 从1/0变为0.15/0.9，保持模型、相机、灯、mesh和纹理不变。图像中绿/青贴图像素分别为3362/11391，参数响应差分21122像素。
- **Skin**：原 SimpleSkin 的2个关节随原生 Animation 推进，时间0.033333→0.533333，CPU关节旋转及世界矩阵实际改变；前后形变差分5050像素。没有改关节或替换mesh模拟动画。
- **UI**：原生 Canvas/UI Camera、系统字体 Label 与 Sprite。文字从 AIR UI 123变为GPU UI 987，精灵从蓝变暖色。每阶段固定15个矩形内部采样均15/15，Native与Chrome的完整160×56精灵区域8960像素逐RGBA差异为0。Native文字像素692→812、文本区域差分1598，不能以精灵变色代替文字证据。
- **Compute**：AIR GFX直接16组和间接12组真实执行；逐值GPU读回，参数buffer本体为[0,12,1,1]、byte offset=4，前置0用于检出忽略offset，未执行4项保持0xdeadbeef。不同seed产生不同结果并经CPU读回驱动材质红→绿，画面差分16248像素。证明链包含CPU桥，不声称zero-copy。

类型正确的清理合同：共享普通 Asset/Mesh/Texture/Node仍要求 `isValid=false`。实时蒙皮生成的私有 MaterialInstance 由场景显式清空 renderer.sharedMaterials 销毁并解绑；保留原始 `isValid:true`，依据其实际 destroy实现验证请求已发生、passes清零、解绑和owner销毁，不伪造flag。首轮Chrome仅资源观测合同错误导致FAIL的记录保留；没有删除该实例追踪。此显式清理不证明GLTFInstance.dispose自动覆盖私有实例或零GPU泄漏。

宿主本阶段通用修复：

- DirectWrite真实系统字体，Canvas2D尺寸重设实际重建/清空buffer并恢复默认状态、context身份与状态回读。短CPU诊断文字像素由0变为1168，宽136.95px；同值resize清空、font10px默认、save/restore、RGBA和ImageBitmap复制均通过。
- 真实 `dispatchWorkgroupsIndirect`，compute/render/bundle共用动态offset序列，BGL实际动态字段；没有补成功或绕过AIR GFX。
- Canvas→GPU上传从当前nativeCtx尺寸而非旧300×150缓存确定布局，避免260×56文字数据和旧stride冲突。
- external-image destination.origin兼容标准对象与sequence。短GPU原脚本证明旧B11对象被写到0,0、新B12对象与数组均正确写到2,3且256白像素完整。该缺口导致atlas的2px边缘错位和UI右下裁切，已以宿主修复闭合。

最终宿主为 `output/runtime-interop/host-build-attempt-12/mystral.exe`，35,621,888 bytes，SHA-256 `50d16a369fce255ca5127aac0473be671f2128a11dce792174267a237b6b1acd`。configure/build/version实际退出均0，完整源码构建前后与再次核对一致；收据同目录 `host-build.json`。SDK仍为原build216，SHA-256 `417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a`，没有因宿主缺口改变SDK。

当前 `host-patches/` 更新为8文件补丁，SHA-256 `b4a5670107924571dc6bbb12be4bac1b1dd820294b74136348401ffc9ebb4c9a`；完整编译源码指纹 `78f04277872ba2dea8b9960eaf2b3db2e66f17388cbfc604a7bf8eeefa932c5c`。全新固定基线检出真实apply后8文件字节逐个匹配；旧candidate8/9/10/11补丁、exe与报告仍保留。没有碰deprecated native GLTF实现，模型始终通过AIR JS loader。

三份正式冻结矩阵均 `matrixRequested=true`、`completed=true`、`pass=true`、`inputsUnchanged=true`、`subset=true`、`releaseReady=false`：

| 对象                 | 范围                                                                                           | 正式报告                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Chrome 155.0.8059.85 | 五组+立方体+四场景全部PASS，10 PNG，GPU errors=0，物理退出0                                    | `output/runtime-interop/matrix-chromium-final-20261025/report.json` |
| Edge 156.0.4314.42   | 同范围全部PASS，10 PNG，GPU errors=0，物理退出0                                                | `output/runtime-interop/matrix-edge-final-20261025/report.json`     |
| MystralNative B12    | 同范围全部PASS，10 WGC PNG，6个host和10个helper进程exit/close0，无signal/timeout/consoleErrors | `output/runtime-interop/matrix-mystral-final-20261025/report.json`  |

正式报告 SHA-256：Chrome `0a58b94ebd2c11c701038a9555d7c6d0162ecdb0f78369c8a3f7f1d95aaf2592`；Edge `20f1775557741bae21ea5ca33aa14fb8edb003ac17e8a9062b6de4acdd86d76c`；Native `faed6e3859211cfd457f19602c1ec9456fd5a94054341aa491321399a3845bf0`。

独立只读审计重新计算三端各42个当前输入哈希、945个SDK源映射、30张PNG的SHA/像素oracle与真正前后配对，全部通过。Native10条原始WGC唯一JSON的PID/HWND/尺寸/路径与对应实际进程相符，4条after.previous严格绑定同场景before SHA。四场景GPU错误均0；step frame PBR/skin为3→33、UI/Compute为3→6，采图时暂停帧不自增、清理前恢复native pacing，所有类型资源按上述实际合同释放。

保留 `matrix-chromium-attempt-1/2`、`matrix-mystral-attempt-1/2/3` 及字体、resize、origin短诊断的全部原件。特别是B11旧较弱oracle记录的逻辑PASS没有改写；人工复核发现Sprite约138×48后，新增15点完整覆盖使旧图仅8/15而FAIL，B12重新采证才15/15通过。原Sprite/UI输入和SDK没有为通过而改变，也没有降低像素/行为断言。

定向工具回归为6/6，格式、语法与文档引用检查通过。未机械扩大到全量测试、完整example campaign或性能benchmark。保留Windows x64、V8+Dawn、单native device、同源HTTP、有界同步模块链接及上游Abseil链接告警的实验配置边界；本次不代表完整PBR参数、任意动画/UI、物理键鼠触摸、所有Compute组合、其他引擎、Android、长跑/GC压力、性能或发布验收。两个仓库分支均未暂存、提交、推送或发布。


## Android 原生推进检查点（2026-10-25）

用户已授权 Android 原生宿主适配、APK 构建及设备执行，并明确先完成 APK 与模拟器，真机稍后。ADB 目前仅有 emulator-5554，API37、真实 x86_64、ro.kernel.qemu=1，不能计为真机验收。独立包名 com.mystral.engine.interop；两个仓库版本均未修改。

使用 V8 + Dawn + SDL3 + Skia 原生路径，无 WebView。同一个 build216 AIR SDK 和固定 Shader WASM 资产逐字节入 APK。V8 为 Kudo v8-android-jit@11.1000.4 第三方构建，实际引擎 10.0.139.9；Dawn 固定官方 v20260117.152313/d14ae3d97ad74100e9f382efef5e9c0872ddbeb2。匹配 ABI 的 snapshot、真实 Gradle Wrapper、源码/资产前后指纹及签名分别保留在每轮构建收据。独立 V8 shell 探针没有通过，不充当 APK 执行结论。

通用宿主修复包括 Android HttpURLConnection 二进制 HTTP、在 JS 线程完成回调的有界异步请求、标准 fetch headers 透传、实际 ABI snapshot 初始化、真实 Android 字体和强制选择后再验证 Vulkan Adapter。默认 QuickJS/wgpu 构建配置保留，当前验收显式选择 V8/Dawn。

APK5 位于 output/runtime-interop/android-build-attempt-5/app-debug.apk，42,394,091 bytes，SHA-256 e748a0e3b64451bf25284cc57deca3a2d81df4e7670d775e58fbb1998648b158。构建、签名、源码/资产稳定通过。模拟器 android-probes-attempt-3 实际五组 G0 全部通过：Canvas/DOM、动态模块、真实 glslang/twgsl WASM 转换、Vulkan 渲染/读回与独立呈现、设备错误/丢失合同。真实 GPU 为 Goldfish GFXStream (NVIDIA GeForce RTX 5060)。PixelCopy 原始 Surface PNG 与 ADB 完整屏幕裁图分别通过独立像素检查。

此轮整体仍 FAIL：报告返回后 /finish 已实际触发 SDL_QUIT，runtime.run 返回且 outcome=0，随后卡在 runtime.reset 的析构阶段；原始10秒预算内没有 native-exit.json。后续 force-stop 仅作清理，不将其计为正常退出。正在增加阶段日志定位清理阻断，不跳过析构、提前写退出结果或降低门禁。保留 android-probes-attempt-1/2/3、全部 APK/构建尝试及失败日志；AIR 立方体和四场景 Android 矩阵尚未验收。


### Android 退出根因定位与场景诊断

APK6/7的分阶段日志将问题缩小到 wgpuSurfaceRelease；随后系统ActivityManager日志证实进程在该调用后数毫秒已终止，前述“析构等待”的判断由此修正为提前终止，原始超时/FAIL不改。普通UID debuggerd被设备拒绝，LLDB后到时PID已不存在；诊断代码快照、错误与系统原始日志保留于 android-probes-attempt-6/7。未提权或adb root。

固定Dawn源码解释了依赖风险：Unconfigure把swapchain保留为recycled，Surface析构才detach；Vulkan device.destroy已释放fenced deleter后，再释放Surface会访问已退役的后端。最新宿主同时修GPUDevice.destroy和Context析构：在device销毁前释放真正Context拥有的Surface，退役Canvas借用句柄和帧别名，仍执行真实device.destroy与原生lost回调；queue拥有引用亦正常释放。被destroy的单device Runtime需新建Runtime，不声称原地设备重建。

为避免等待构建期间停滞，使用APK7对应的干净candidate7检出绑定实际源码，分别执行 android-air/pbr/skin/ui/compute-attempt-1。五个应用结果与所有10组PixelCopy/ADB独立图像均PASS；PBR、骨骼、文字/精灵、真实direct/indirect compute及类型资源清理均执行。但五份整体仍FAIL，唯一均为SurfaceRelease后缺正常native退出；不将部分应用成功标为完整验收。

新增普通图标默认AIR demo（独立于显式六项合同），保留demo启动/输入事件而不依赖外部截图ACK。APK7 stage2为27个payload+2个manifest；SDK仍417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a。正式采集器已收紧为必须提供编译收据，PID消失须成功的真实process table及设备连通，不能吞命令失败当进程不存在。当前等待APK8修复候选和全量本专项复采；真机仍待接入。


## Android APK 与模拟器专项完成（2026-10-25 22:55 北京时间）

按用户最新明确范围，本阶段交付 APK 和模拟器，真机稍后。最终候选为 output/runtime-interop/android-build-attempt-10/app-debug.apk，27,055,266 bytes，SHA-256 53093e1e3b3149a6e8e5033bbe1785399232e4565c44af0a810e8eaae18e894c。编译、签名、115项宿主构建输入与29项staging资产前后稳定；27个业务payload外含2份manifest，APK另带ABI snapshot。Host源码与APK8/9和Windows B13一致，紧凑ZIP只精确删除被备份hash确认的Gradle源APK重打包，旧APK1–9原件全部保留。

最终正式报告 output/runtime-interop/android-matrix-final-20261025/report.json 为 completed/pass/inputsUnchanged/simulatorAcceptance=true，physicalAcceptance=false，subset=true，releaseReady=false。报告SHA-256 f94f9d52071082245e106ec7567556581e5f4b190343e200df8fbb0b00fca0ff。五组G0、AIR cube、PBR、Skin、UI、Compute全部通过，10张PixelCopy、10张ADB完整屏幕及10张真实坐标裁图完整保存，10组双路图均离线重算oracle。六个独立PID均GPU和Window析构返回、runtime reset返回、Native ended code0、Java通知、SDL Finished main function完成，finish到Native ended为66/120/126/126/121/123ms，之后才各自受控停止并以成功的真实ps表确认PID消失。

原SDK build216 SHA-256 417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a 继续不变，945个当前源码映射匹配。没有新增Cocos Android GFX或引擎专用Runtime分支；修复在Mystral通用Web API/V8/Dawn/Android宿主，JS glTF loader继续服务模型。

额外普通启动报告 output/runtime-interop/android-demo-final-20261025/report.json 为PASS，SHA-256 c619bcdd09d8c301fbf2e3c4f4da97e9e4d11cd4c890eba4111746ed134723d3。默认图标不依赖外部Node，首帧等待真实AIR帧3和draw，旋转由Director实际绘制事件驱动。两次ADB系统输入产生可信DOM mousedown，原始坐标160.50157/120.50210位于目标像素的一像素内，颜色由橙到绿再橙实际呈现。HOME后恢复同PID/会话及Surface generation1，真实帧34推进至130，GPU errors=0，正常native退出0。此结果未强制Surface销毁重建，不是多指/完整TouchEvent/键盘或真机验收。

保留demo-attempt-1（4个rawRAF早于真实Cocos draw的启动合同错误）、attempt-2（错误要求SDL小数坐标等于整数），以及修正后的attempt-3和最终不同APK报告。没有修改原FAIL；正式六项像素/资源/错误/退出门禁未降低。两个独立审计分别复核22文件/新退出日志和83项检查/229个证据文件。第二审计首轮因27业务文件与29staging计数、en排序指纹及GFXStream空格匹配误读而FAIL，也原样保留；新的attempt-2纠正审计producer后重算PASS，未改应用证据。

累计源码交付 tools/verify/runtime-interop-android/host-patches/ 保留独立Android patch/manifest、MIT、固定依赖profile和原始receipts、干净基线apply及22文件逐字节比较、最终独立审计和demo执行源码快照。Patch SHA-256 af3b2f9272cd15fc7d07e693ef1255663d07fa513aa92a7df131c2f68aac97f1；acceptance.json单独绑定最终APK/build/source/SDK/assets/报告。旧桌面8文件冻结补丁未改。

当前common-source另经Windows B13全新目录真实编译及G0+cube/WGC/退出回归PASS，EXE SHA-256 c091d5efcf936cc831d2608eb1328fa217199cc37f2f305a6117f6a5104cb7df。报告 output/runtime-interop/windows-common-regression-attempt-1/report.json。此项未冒用旧D12 host-build绑定或重标旧完整桌面矩阵；上游Abseil重复链接告警继续保留。

定向工具CPU回归7/7、源代码格式/语法与diff检查通过；没有扩大默认CI或运行发布门禁。完成后另外启动独立handoff会话，PID19741、默认demo ready并留在模拟器供用户查看；它与已完成物理关闭的六个正式测试PID分开，见 output/runtime-interop/android-handoff-final-20261025/。

边界：仅x86_64/API37/4KB页模拟器、V8+Dawn、单native device；device.destroy后需新Runtime。ARM64和真机待后续，未做强制Surface重建/旋转、多引擎、长期压力、首帧/PSS/功耗或Chrome/WebView性能对照，不声称全面替代或FPS优势。两仓库分支均未暂存、提交、推送、合并或发布，版本未变。


## ARM64 真机专项（2026-10-25 至 26 日）

用户提供并授权测试的 vivo V2520A 已确认为 Android17/API37、SM8750/Adreno830、arm64-v8a、4096-byte内存页，qemu为空/nativeBridge=0。直接使用已推送的mystral-source commit3cea6b450b71661e114a04b8bde777ff6d29f67f，宿主全程无源码改动，仍clean且跟踪用户fork分支。固定Skia同版ARM64包41,241,611B，publishedSHA a34a870d783de80b113c3d7cdc2c03bf4b938c856f4d1e3e5e8eabb5d2b481d3，原x64及历史receipts未覆盖。

ARM64候选 output/runtime-interop/android-arm64-build-attempt-1/app-debug.apk 为25,315,833B，SHA b59938748912dcbfe76ab8b96cf849301b6b18519d3706418c380a535903a86e；115源码/29stage4资产、签名、4个ARM64库及实际ARM snapshot均按真实来源核对。SDK仍build216/SHA417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a、945源码映射，未重建/修补引擎。

保留首次Vivo安装确认页导致的install ETIMEDOUT，以及probe2/3/4的原始FAIL。probe2中Android debug弹出的16KB警告遮盖compositor；普通确定后，probe3/4无警告但原ADB PNG实际嵌入DisplayP3 ICC，未解释其颜色值的原sRGB ±3检查失败。PixelCopy/GPU读回均正常，rawADB红234,51,35/蓝0,0,245对应标准P3表示，不是原shader输出错误。采用实际520B ICC（SHA6e72ac49fd45d1275f29daca1038a0b9af5befd0e891af9267f47ab066a5dffb）经Pillow12.3/LittleCMS2.19全图relative-colorimetric到标准sRGB，原尺寸/alpha保持，原图/ICC/转换图/raw oracle全保留；转换后严格原±3为红255,0,0/蓝0,0,255。未拟合矩阵、改像素目标或降低阈值。坏/未知ICC拒绝、clear-only仍FAIL，8色roundtrip最大误差3。

实际phone ps有合法空格kernel NAME，旧入口将其误判不完整行；新仅output冻结phone快照正确解析PID+完整非空NAME，并在finish前增加真实live PID/包名正控，之后仍成功ps/ADB连通及包精确/子包匹配才判消失。原canonical/模拟器/旧phone快照未改，所有变更与Python/Pillow实现字节纳入新输入指纹。警告处理仅匹配已知4KB debug提示并允许普通确定，无不再显示或全局设置改动；正式矩阵六项admission均NO_MATCH。

最终六case矩阵 output/runtime-interop/android-arm64-matrix-attempt-1/report.json 为completed/pass/inputsUnchanged/physicalAcceptance=true、functional4kOnly=true、elf16kCompatible=false、releaseReady=false。报告SHA04244377cb4c0b045cfea28c53785eef8a5fe66df6a9c53196caf5aea3523ca8。G0、AIR cube、PBR、Skin、UI、Compute全部通过；10组PC/rawADB/ICC/sRGB/原bounds图完整，六个原PID正常NativeExit0和SDL Finished main function、live正控及after-stop包不存在全部通过。

独立图像审计 output/runtime-interop/android-arm64-final-audit-2/report.json 为75/75 PASS，162当前输入、289证据hash，10图actualICC独立重放后全图RGBA逐byte一致。独立来源/退出审计 output/android-arm64-source-exit-audit-1/final-result.json 为15项PASS，重验远端3cea6b4、22blob/freshapply/build同源、签名、依赖和六个真实退出序列。两审计首轮自身schema误读（合法进程NAME空格、collector未列唯一root manifest）保留原FAIL，新attempt修producer重算，未改应用结果。

16KB静态审计 output/runtime-interop/android-arm64-elf-audit-1/report.json 为COMPLETE_WITH_16KB_ALIGNMENT_GAP：SDL/V8的LOAD为4096，runtime/C++为16384且RELRO own-LOAD例外有效。整包16KB不合规，16KB环境NOT_RUN。当前4KB设备正常运行不代表16KB支持，不能通过隐藏debug提示或修改ELF头冒充修复；依赖升级/重建属后续里程碑。

额外输入/后台恢复尚未闭合。demo-attempt-1已产生真实trusted mousedown、CPU颜色变更，但HOME过渡尚未完成就收到amstart的top-most intent投递，未真正恢复。新的生命周期v3先保留HOME前双PC/ADB合同，再等真实Launcher/stop与新SurfaceView bounds；首轮开始时手机已自动锁屏，native-ready/有效Surface未出现而timeout。旧失败不改，不能归因为宿主恢复坏，也不能称恢复通过。ADB后验showing=true/inputRestricted=true、mWakefulness=Asleep；已请求用户手动解锁，60秒有界等待仍locked，未改安全设置或试图绕过锁屏。

当前总结 tools/verify/runtime-interop-android/host-patches/arm64-test-summary.json 将六项4KB功能PASS、16KB缺口与待解锁生命周期分开。ARM64未改宿主代码/版本、无新commit/push，不代表全Android、多指/TouchEvent、强制Surface重建、长跑或性能/Chrome对照验收。


## c++_static 切换完成（2026-10-26）

用户明确要求将libc++_shared改为c++_static。实际旧Kudo V8两ABI均DT_NEEDED共享STL且C++对象跨DSO，不能仅排除so。此次六文件改动在3cea6b4工作树中默认static、static V8及embedded启动，并保留明确shared/external配置、拒绝static CPP/shared V8错误混用。采用固定Cocos external0be13f7的V8 11.6.189.22静态归档；没有改Cocos SDK或stage4。

ARM新APK9a5dc0d04815ddc8e159a36cc79c9d0a9ea7631afdcd18d30149c86eac9a5968，22,568,615B；x64新APKebd8fa2258df2159e2675faa8d70d79bbf629fa6b36b0d2a484ea402d9c84313，24,251,137B。两个实际包均仅SDL3与runtime两SO，无libc++shared/libv8android动态NEEDED、无外置snapshot、无强未解析NDK标准库符号，linkmap包含NDK29 libc++_static.a+libc++abi.a+对应V8归档，正常link无重复定义兜底。真实Gradle targetFiles只限定app/build/generated/interopSnapshots，旧所有APK和receipts保留。

x64新模拟器执行android-cxx-static-probes-attempt-1和完整android-cxx-static-matrix-attempt-1均PASS，实际Native版本11.6.189.22/embedded、Shader WASM两个factory、模块/DOM/GPU/错误lost、AIR cube/PBR/skin/UI/compute、双路10组图与6正常退出/live-gone完整。ARM当前无手机连接，只有build/ELF闭包，未将此前shared版本真机PASS套用。

独立android-cxx-static-audit-2为59/59 PASS、395哈希证据，源码/118项include-tree/2archive/115Host/current输入均匹配；map内实际存活Cr_z压缩对象单套来自V8，未见所选私有对象跨版本混拼。原audit1将可选weak import误作strong的FAIL保留，新producer把完整optional weak与strong U分栏，未删除踪迹。

相对3cea6b4的mystral-cxx-static.patch为21,835B、SHAb1f173acc5f539bfeda88351a82de89f2018e063a604beeff4792d330c55f599。新clone真实apply及6/6文件=current/两ABIcompiled map逐byte一致，含profile、依赖receipt、基线/修改源码和V8 BSD许可，提升至tools/verify/runtime-interop-android/host-patches/cxx-static，不改旧冻结档案。acceptance.json独立绑定最终2ABI APK/闭包/模拟器报告/审计。

SDK仍build216/SHA417509cb...；SDL3保持3.2.8（仍4KB），全16KB运行、ARM新候选真机及后台恢复未验收，releaseReadyfalse。宿主仅六文件本地改动，未暂存/提交/推送，不改项目版本。


## SDL3.2.30 与 16KB 环境验收完成（2026-10-26）

用户明确继续解决，保持c++_static、完成SDL3.2.30并在16KB环境跑完专项。宿主只在既有6文件未提交修改上继续参数化SDL版本默认3.2.30；完整官方ZIP0525e4bc...→AARac582807...→headers/Java/native/extracted全部同源。新deps-16k-attempt-1隔离，3099文件与固定V8/Dawn/Skia/Sdl来源全核，原deps-static及旧APK/报告未改。SDK仍build216/SHA417509cb...、stage4原字节。

新ARM64 APK22,919,919B/SHAa84ed29a1c5d433e48703647d7e63ce8d853cf836dadd5871b6cba335c984e7a；x64 APK24,607,345B/SHA3e7931eac6a49a59f9cc165a98dacca3f93b5f0afea7b1dc3b2cffad2d980757。两包实际onlySDL3/runtime两个SO、所有LOAD≥16384及同余、RELRO安全、独立zipalign-P16/签名/115source/29assets、静态CPP闭包均PASS。V8仍静态11.6.189.22/embedded，无共享STL/V8动态依赖或外置snapshot，正常link无重复抑制。

为实际验证，独立SDK/AVD在output/runtime-interop/android-16k-env-1安装官方system-images;android-37.0;google_apis_ps16k;x86_64。SDKmanager17-GA版本字符串检查的流程问题只作进程级override（实为JDK17），未更改全局JDK；avdmanager按工具目录推SDK导致首次invalid package，复制同版cmdline-tools到隔离SDK后建Mystral_16KB_API37。首次启动缺platform-tools目录，补同版只读copy后启动成功，所有旧日志保留。官方vendor source.properties revision7与package.xml revision8精确保留，无改标签。实际getconf PAGE_SIZE16384，kernel/proc参数page_shift14，API37/qemu1/x64。专用VM中设bionic.linker.16kb.app_compat.enabled=fatal、pm.16kb.app_compat.disabled=true，初末实际读取相同，未以backcompat运行。没有改物理手机、原SDK/用户AVD注册或安全设置。

16K探针先PASS；首轮完整matrix-attempt-1的UI/compute因首次SystemUI Viewing full screen教学遮盖compositor而FAIL，PC正确仍不计通过。暖启动中依据真实XML点击普通Got it(com.android.systemui:id/ok)后新目录整体重采，不点兼容页、未改阈值或覆盖失败。最终android-16k-matrix-attempt-2六项completed/pass/inputsUnchanged/page16kRuntimeAcceptance=true，SHA01553ca31d1651b751c564def46b4fdaef7dda360ace4544ed8bed2439e1eed6。真实V8初始化/两ShaderWASM/module/DOM/GPU/readback/错误lost、AIR cube/PBR/skin/UI/direct+indirectCompute、10组双路图/原clock/资源及六NativeExit0/SDLDone/livegone完整。

同一x64 APK在独立启动的Medium_Phone_API37.0 4096页VM回归六项全部PASS，android-sdl330-4k-regression-attempt-1报告SHAbf8968c7c2550236bdbe13a392899a7cfa5c9d4a106f5ec0e0905453d98684bd；page16kRuntimeAcceptance保持false。107项独立主审共12case/20组双路图、22项独立build/source/依赖审、六文件新clone真实apply均通过。原audit1运行时支持emulator stdout仍写入，最终已正常emu kill两自有VM、SDK与AVD数据保留，再新android-16k-final-audit-2重审107项/632hash（SHA03a2561d0ec219d1266e7a9ab056270febd481f36cf02751ab948fd838817886），完整已关闭日志稳定。原audit1未改。

额外demo-attempt-2补充功能PASS：实际16384/fatal/true、真实trusted两tap、同PID/Surface gen1 HOME后绘制和NativeExit0。原demo1 after-PC抓到输入后材质尚未绘制的旧橙帧，随后独立ADF已绿，失败原件保留。新独立producer先观察实际compositor绿色（保留paint-wait整屏/裁图/数值）再请求独立PC after，原阈值未改、无业务代码或stage变化。14项补充审计确认功能事实；该小工具没有主collector completed/inputs/finalCompat原始字段，2秒只是poll deadline非ADB截图硬上限，因此不将它扩称主验收或Surface重建/时延认证。

新累计源包tools/verify/runtime-interop-android/host-patches/16k/以3cea6b4为base，仍6文件，patchSHA5fa76d4e31295fcf1955a7fec5a0e6f059523591d3f7d55c0fa747cf597ddb47。source/profile/原许可/完整AAR/新SDK来源/实际apply和compiledmap匹配均保留；acceptance.json单独绑定两ABI构建、16K+4K矩阵、关闭环境日志、主107+build22与补充14审计，不重标旧shared/static-only档案。

验收结论仅为x64官方16KB模拟环境完整六项与同APK4KB回归；ARM64新a84仅build/静态，不声称ARM64 16KB硬件运行。源码未暂存/提交/推送，项目版本不变，subset/releaseReadyfalse不变，未覆盖全SDK发布、性能/长期压力或强制后台Surface重建。

## 已有代码 Git 交付（2026-10-26）

用户明确授权“把已有代码都提交push”。MystralNative先fetch并确认功能分支与远端3cea6b4一致，六个文件逐字节匹配16k/manifest.json的afterBytes/afterSha256且diffcheck通过，再精确暂存并提交b98101acd368107829a7aa4c0481084f2ecefd5e，推送到oahc09/mystralnative的feat/cocosair-webgpu-interop。远端实际HEAD一致、ahead/behind为0/0，工作区干净；main仍bafab09，不向上游origin写入。

Cocos AIR交付范围为本任务探针、Android资产准备、Windows独立捕获工具、桌面/Android冻结宿主补丁、依赖回执、计划台账与文档，包含本次唯一独立SDK构建的计数215→216。fetch已见main后续提交，本次保持已验收候选的功能分支，不合并主线或重建SDK。工具CPU回归7/7通过，未重新采集或改写历史运行证据。

为补齐仅在ignored output中的实现，verification-snapshots保存61份既有采集器/helper、构建/依赖/审计脚本，共496480字节，全部按原路径和SHA256逐字节归档；两个增量补丁包补入manifest早已声明的原export.cjs。归档固定历史路径和运行前提，不伪装成可直接迁移运行的新入口。APK、SDK/依赖二进制、原始图像及缓存不入Git；冻结补丁/证据/源码快照通过路径限定的-text属性保留跨平台字节。新增git-delivery.json单独记录实际宿主推送，不修改旧acceptance的生成时状态。

交付仍限定V8+Dawn已有验收范围，QuickJS、新ARM64运行、ARM64 16KB硬件、强制Surface重建、长期压力与性能未验收。代码提交不代表这些门禁通过，也不包含合并、版本变更或发布。

提交前普通工具/文档格式检查及新增脚本语法检查通过（JS17、PowerShell35、Python11；仅parse，不执行历史构建/设备操作）。全量staged whitespace检查提示冻结回执的CRLF、原始补丁上下文空行及历史尾空白；按证据原字节约束保留，不清理或改写。普通新增/编辑源码和文档另作范围明确的whitespace检查，冻结档案按原文件/manifest及暂存blob字节核验。精确暂存294文件，未包含原output缓存或二进制。
