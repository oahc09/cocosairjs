# 通用 WebGPU Runtime 兼容探针

本工具验证浏览器和 MystralNative 桌面宿主的实际 Web API 行为，并在独立页面或进程中加载同一份未经修改的 Cocos AIR Bundle。探针不进入默认运行时，也不增加普通 CI 的执行范围。

Android APK、ADB/PixelCopy 和模拟器结果使用独立工具，见 [Android 原生互操作](android-runtime-interop.md)。

## 合同范围

| 分组                 | 实际执行                                                                       | 不代表                             |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `canvas-dom-events`  | Canvas 原型、DOM 插入和查询、布局、焦点、可取消事件和监听移除                  | 物理键鼠、触摸或 Android 输入验收  |
| `module-assets`      | URL 动态 import、`import.meta.url`、fetch 同一文件、相对 baseURI 解析          | 所有模块协议或打包器兼容           |
| `wasm-shader`        | 冻结 glslang/twgsl 的真实 WASM 实例化及 GLSL → SPIR-V → WGSL                   | 任意 WASM 模块、Box2D 或 WASI 支持 |
| `gpu-submit-present` | Adapter 信息、能力协商、真实 Shader 管线、三角形提交、GPU 读回及独立 PNG 像素  | 仅凭 GPU 读回推断屏幕呈现          |
| `gpu-errors-loss`    | 真实验证错误作用域、uncapturederror 及 preventDefault、destroy 后 lost Promise | 强制驱动崩溃或透明设备恢复         |

Shader 资产失败时，Adapter 信息与设备协商仍独立执行，渲染、读回和呈现子阶段保留 `BLOCKED`；真实接口失败则保留 `FAIL`。错误与生命周期组可独立申请默认 device，并记录 acquisition 来源，不能将该默认设备成功计为 AIR 能力协商成功。协商同时核对实际 `device.limits` 是否满足请求值。

AIR 冒烟使用原有 `Scene`、`Node`、`Camera`、`MeshRenderer` 和 unlit 材质绘制立方体。暂停原生 pacer 后只用 `createStepClock()` 推进三帧，检查真实 WebGPU、draw、健康状态和暂停帧稳定性，再独立检查 PNG 中的背景与主体。结束前恢复原生时钟，释放自有场景、Mesh 和 Material；释放回执中保留的运行时和共享缓存不标记为已销毁。

## 可选桌面场景矩阵

显式 `--matrix` 在既有五组和立方体之外运行四个固定场景，每个使用独立页面或进程，保留 `before`/`after` 两张真实呈现 PNG。默认命令和普通 CI 不增加这些执行。

| 场景            | 真实行为与独立效果证明                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene-pbr`     | AIR JS glTF loader 加载本仓 BoxTextured，真实贴图绑定 `air-gltf-standard`。仅 roughness/metallic 改变，模型、相机、灯和贴图保持不变；初始 PNG 必须出现贴图的绿/青区域，后续图像产生实际材质差分。                      |
| `scene-skin`    | 加载 SimpleSkin 及原外部二进制，原生 Animation 随同一 step clock 推进约半秒。核对真实关节旋转/世界矩阵及前后轮廓差分，不直接写关节或替换网格。                                                                         |
| `scene-ui`      | 真正的 Canvas/UI 相机、Sprite 和系统字体 Label。分别核对文字区域中的白色 glyph 和文字差分，以及蓝色 Sprite → 橙红 Sprite；矩形内部 15 个固定采样点须完整覆盖；仅有变色、只有字符串或右下裁切均不能通过。               |
| `scene-compute` | 通过 AIR GFX 真实 direct dispatch 与 offset=4 的 indirect dispatch，逐值读回并检查未执行尾部 sentinel。计算结果经 GPU readback 更新 CPU 材质，使真实画面红→绿；该链明确包含 CPU 桥，不声称 zero-copy compute-to-draw。 |

场景资源使用原模型及许可：BoxTextured 的 [CC-BY/Cesium 标志说明](../../examples/gltf-basic/assets/BoxTextured.LICENSE.md)，SimpleSkin 的 [CC0 说明](../../examples/gltf-skin/assets/SimpleSkin.LICENSE.md)。资产只读路由保留原目录关系，GLB、glTF、四个 bin 与许可证均绑定输入哈希；不使用 Mystral deprecated native C++ GLTF loader。

私有 `MaterialInstance` 沿用本项目既有 destroy 合同：显式清空 renderer 的共享材质槽以销毁并解绑实例，继续保留原对象追踪，要求实际 passes 清空和已解绑。其重写的 `destroy()` 不改变 `isValid`，报告保留这个原始值，不伪改为 false；其他普通 Asset/Mesh/Texture/Node 仍须 `isValid=false`。该 fixture 显式清理不代表 `GLTFInstance.dispose()` 单独覆盖所有私有实例，也不代表测得零 GPU 内存。

```powershell
node tools/verify/runtime-interop.cjs --matrix --host=browser --bundle=output/runtime-interop/sdk/cocosair.module.js --out=output/runtime-interop/chromium-matrix-run
```

Native 使用相同 `--matrix` 和下述源码/EXE 绑定参数。每个矩阵进程各有不可重置的 90 秒预算。WGC 握手严格限定当前进程/场景/阶段，先取得成功的 before，再在同 PID/HWND 下采 after；比较前重新核对 before 文件 SHA，拒绝替换历史图片。缺阶段、重复捕获、无实际效果、GPU 错误、未释放资源或进程未关闭均失败。

## 浏览器执行

需要项目构建依赖、可解析的 Playwright 和现有 Chrome/Edge。工具不会安装依赖、下载浏览器、修改系统 PATH 或启用软件 WebGPU。外部 Playwright 可通过当前进程的 `NODE_PATH` 配置；浏览器路径可用 `--executable=<existing-browser-file>`，Chromium 也接受 `AIR_CHROMIUM_PATH`。

先生成独立的当前源码 Bundle，保留其相邻 `webgpu/` 文件和 source map。PowerShell 示例：

```powershell
$env:AIR_OUT_DIR = Join-Path (Get-Location) 'output/runtime-interop/sdk'
node tools/build/build.cjs --format esm
Remove-Item Env:AIR_OUT_DIR
node tools/verify/runtime-interop.cjs --host=browser --bundle=output/runtime-interop/sdk/cocosair.module.js --out=output/runtime-interop/chromium-run
```

构建会推进 `tools/build/build-number.json` 的计数，独立 SDK 写入被忽略的输出目录。若已有与当前源码一致的默认 Bundle，可省略 `--bundle`；采集器默认读取 `build/cocosair.module.js`。`--browser=edge` 选择系统 Edge，`--headed` 显示浏览器窗口。每次必须使用未存在的 `--out`，失败重试也使用新目录。

采集器只向本机临时端口暴露指定 Bundle、相邻 Shader 资产和固定探针模块，JS/WASM 使用正确 MIME。执行前核对冻结部署字节、Bundle/source map 与当前源码；执行后再次核对文件哈希和源码绑定。原始结果、console、独立截图、版本与进程关闭回执写入 `report.json` 及相邻文件。

## MystralNative 桌面诊断

使用已经获取并校验来源的可执行文件：

```powershell
node tools/verify/runtime-interop.cjs --host=mystral --executable=<existing-mystral-executable> --host-label=mystral-v0.1.6-v8-dawn --bundle=output/runtime-interop/sdk/cocosair.module.js --out=output/runtime-interop/mystral-run
```

采集器用 esbuild 将相同探针封装为 IIFE，以便在模块功能缺失时仍可输出诊断；探针中的 URL 动态 import 和 `import.meta.url` 夹具不会内联或替换。原生进程使用与浏览器相同的 HTTP 资产和 Bundle。两个独立进程分别执行通用探针与 AIR 冒烟，各有原始 90 秒执行预算。保留生成的入口、stdout/stderr、唯一 JSON 标记、可执行文件 SHA-256 和真实 exit/close；退出码或截图文件存在均不能单独构成通过。

默认原生诊断没有呈现回调，缺少截图证明时保留 `NOT_RUN`，不能得出兼容验收通过。发布包与 main 必须分别标识；`--host-label` 只是调用者提供的版本说明，可执行文件哈希才是本次执行身份。

## Windows 原生呈现采集

外部辅助程序使用 Windows.Graphics.Capture 按本轮子进程 PID 查找唯一可见窗口，等待真实 OS 捕获帧，再裁出客户区并编码 PNG。它不调用 Mystral 的截图接口，也不把引擎 GPU 读回作为呈现证据。需要 Windows、已有 CMake、Visual Studio C++ 工具链及支持 Windows.Graphics.Capture 的 SDK/系统。

先在新目录构建辅助程序：

```powershell
node tools/build/runtime-interop-capture.cjs --out=output/runtime-interop/capture-build
node tools/verify/runtime-interop.cjs --host=mystral --headed --capture-executable=output/runtime-interop/capture-build/Release/cocosair-runtime-capture.exe --executable=<existing-mystral-executable> --bundle=output/runtime-interop/sdk/cocosair.module.js --out=output/runtime-interop/mystral-presentation-run
```

构建只写显式的新 `output/` 子目录，保留 CMake 日志、命令、源码与可执行文件哈希，不构建 Cocos AIR/Mystral、不安装依赖。采集器要求 helper 相邻构建目录的 `capture-build.json` 与当前 CPP/CMake 源码及实际 EXE 一致；修改捕获源码后必须重新构建。采集必须显式 `--headed`，以便原生 SDL 窗口可被系统捕获；隐藏窗口不能据此声明呈现支持。

探针在资源存活的截图边界发送带随机 token 的本机 HTTP 请求。Node 只允许当前已启动子进程的 PID、当前分组及一次捕获，客户端不能选择 PID。辅助程序有原始五秒预算，Node 另有十秒总预算；保留 helper stdout/stderr、PNG、PID/HWND、exit/close 及哈希。只有实际 PNG 独立核对通过，原生呈现才可计 PASS。没有可捕获窗口、捕获超时、错误尺寸或源进程提前退出均失败，不用固定 `--frames` 猜截图时机。

## Source-map 绑定与信任边界

运行时构建在发布不含 `sourcesContent` 的 map 时同步写出 `<bundle>.sources.json`。
生成器先对照编译器保留的源码内容与当前 `src/` 文件，再绑定最终 JS、map 和每个源码文件的 SHA-256。
采集器在执行前后验证这些精确字节；缺 receipt、源码或任一文件变化、未知/越界路径均不接受。
不要手工更新哈希来消除失败，应重新构建并重新采集。

Receipt 是可信生成流程下的一致性检测，**不是数字签名或可独立证明编译过程的构建认证**。
能够同时改写 JS、源码和 receipt 的人仍能伪造一致性；验证者必须信任源码仓库、生成工具和 receipt 来源。
发布的 map 不恢复嵌入源码，npm 不因此增加源码分发。

当前合并基线的两份 receipt 标记为 `retained-compiler-map-migration`：从保留的原始含源码 map 逐字节核对当前源码，
确认移除 `sourcesContent` 后与当前发布 map 完全一致，再绑定未变化的 JS。这是历史构建产物迁移，不是本轮重新编译或新的 GPU 结果。
后续 `tools/build/build.cjs` 生成的 receipt 使用 `compiler-map`。

## 历史宿主档案与可选身份核验

历史 MystralNative 补丁和设备记录仍保留在
[原功能分支的固定提交](https://github.com/oahc09/cocosairjs/tree/b939f76241ac77fd99713658f11354d6b3ac64f1/tools/verify/runtime-interop/host-patches)。
本次工具集成不重新上传原始设备诊断、源码快照或 AI 台账，也不修改第三方仓库。
不要把旧档案的 PASS 当作当前 SDK 的运行结果。

若需本地编译宿主身份核验，应先独立确认可执行文件与档案来源，再显式提供：

```sh
node tools/verify/runtime-interop.cjs --host=mystral --executable=/trusted/mystral --host-build=/trusted/build.json --host-patches=/trusted/frozen-patches --out=output/runtime-interop/new-attempt
```

`--host-patches` 指向含 `manifest.json` 及其列出的补丁、配置和许可的目录；工具只读验证其哈希。
缺档案不会降级为通过。提供文件不授权自动下载、安装、运行其他二进制或修改宿主源码。

## 验收边界

CPU 测试检查合同、像素判据、参数、来源绑定、HTTP 路由与 Android 辅助工具，不代表 GPU/设备实跑。
本次合并环境的 Chromium 在启动阶段受到环境隔离限制，未建立新的 GPU、原生宿主或 Android 验收结果。
历史运行记录保持原 SDK、宿主、设备、scope 与失败记录，不升级为当前版本 PASS。

浏览器关闭报告保留真实 `exit`/`close`、PID 消失与四秒预算；POSIX `ECHILD` 未测量，不能用此报告声称完整 example campaign 的物理关闭合同已认证。
所有工具保持 `subset` / `releaseReady=false`；Activity 重建、device-loss/OOM、长期压力、性能、ARM64 16 KB 硬件和发布门禁仍需独立任务与真实环境。
