# Android 原生 Runtime 互操作

此手动验收配置把同一份 Cocos AIR WebGPU Bundle、Shader JS/WASM 和共享场景装入 MystralNative 原生 APK，通过 V8、Dawn/Vulkan、SDL3 和 Skia 执行。它是独立的 debug 验收容器，不使用 WebView，不改变 AIR 默认 WebGL2 后端，也不属于完整 Android 产品或发布验收。

普通图标启动进入 AIR 旋转立方体演示，点击可切换颜色并固定角度，无需外部 Node 连接。`air-android-demo-v1` 仅记录演示启动，不能代替正式六项验收。显式传入 `case_id` 才运行下面的探针协议。

桌面探针与补丁见 [Runtime 互操作说明](runtime-interop.md)；当前执行结果和失败尝试见[台账](../../ai/ledgers/runtime-interop.md)。Android 结果不得回填为桌面或真机证据。

## 准备资产

需要 Node.js、项目依赖、当前源码对应的 SDK 和独立输出目录。准备阶段只写新的资产目录，不下载依赖、不调用 Gradle、不安装 APK：

```powershell
node tools/build/runtime-interop-android.cjs --bundle=output/runtime-interop/sdk/cocosair.module.js --out=output/runtime-interop/android-assets-new
```

生成的 `assets-manifest.json` 记录 SDK、945 项源码映射、Shader 资产、场景模块及模型 fixture 的字节和 SHA-256。整个输出目录作为 `-PinteropAssetsDir=<absolute-staging-directory>` 传给宿主 Gradle。生成器、SDK、场景或资产改变后，重新准备资产并构建新 APK，不复用旧 PASS。

## 原生构建配置

最新的静态 C++ 配置见本文末尾；下文固定的早期 shared profile 和历史证据保留其原始范围。

固定基线的 [Android 累计宿主补丁](../../tools/verify/runtime-interop-android/host-patches/README.md) 与桌面补丁分别保存，包含 binary Gradle wrapper、22 个修改文件的字节核对、完整依赖 profile 和原始下载回执。`acceptance.json` 单独绑定最终 APK 和本轮运行结果；源码补丁应用通过不能代替设备执行。

使用独立的宿主检出和依赖目录；显式选择 `-PmystralJsEngine=v8 -PmystralGpuBackend=dawn`，当前模拟器构建使用 `-PinteropAbis=x86_64`。QuickJS 未在本配置中执行 Shader WASM，不能将本次结果归于 QuickJS。V8 Android 库采用第三方 `v8-android-jit@11.1000.4`，实际 V8 为 10.0.139.9，必须同时使用匹配头文件和 ABI snapshot。

此实验配置限定单个 native device。真实 `device.destroy()` 会先退役 Context 拥有的 Surface 及其缓存 swapchain，再销毁 device；Canvas 借用句柄同时失效，后续需要新建 Runtime。它不提供原地设备恢复或多设备支持。

构建使用真实 Gradle Wrapper、JDK17、SDK36、NDK29；debug 包名为 `com.mystral.engine.interop`，保留上游版本号。V8 和 SDL 动态库、Dawn/Skia 原生实现、C++ shared runtime 与资产均打入 APK。模拟器上使用真实 Vulkan Adapter，拒绝 Dawn Null backend，软件或模拟 GPU 的身份如实记录。

`compiled` 仅表示构建与 APK 验证通过。安装、启动、场景运行、独立呈现和退出由下一步采集器分别验收。构建收据需保留 `source-before.json`、`source-after.json`、资产指纹、签名和实际 APK 哈希；不要以 Gradle 成功代替设备执行。

## 设备执行

需要 ADB、已经启动并授权的 Android 设备，以及可用的 Python 3（用标准库检查 APK ZIP）。采集器只操作上述专用包；`--install` 会安装或更新该包，每个 case 前后会 force-stop 该包，不卸载其他应用、不清空 logcat、不更改设备配置。

```powershell
node tools/verify/runtime-interop-android.cjs --serial=emulator-5554 --apk=<candidate.apk> --build-report=<matching-build-report.json> --assets=<staging-directory>/assets-manifest.json --host-source=<matching-host-source> --python=<python-executable> --install --matrix --out=output/runtime-interop/android-run-new
```

默认运行五组 G0 和 AIR 立方体；`--matrix` 再增加 PBR、Skin、UI 和 Compute。诊断可用 `--case=probes|air|pbr|skin|ui|compute`，单项通过仍属于部分验收。每次使用新的输出目录，原始失败结果保留。

APK 内真实 HTTP 服务使用随机 loopback 端口和本轮 token，ADB forward 仅在本轮存在。原生 JS 请求截图后暂停在确定的呈现边界：Android `PixelCopy` 捕获实际 SurfaceView，同时 ADB 捕获完整屏幕，再按真实屏幕坐标裁图；两路分别调用共享独立像素 oracle。前后图绑定同一 PID、run ID、Surface generation 和前图 SHA，不以引擎读回或应用自报代替系统呈现。

原始图、完整屏幕、裁图、元数据、应用 JSON、生命周期、logcat、ABI/snapshot 和入口哈希均保留。采集器先保存报告，再请求 `/finish`，要求真实 `SDL_main` 完成运行时析构并在原始十秒内回报退出；最后单独检查设备仍连接且包 PID 消失。强制停止仅作清理，不会补出正常退出 PASS。

## 结果边界

报告固定 `subset:true`、`releaseReady:false`。`completed` 表示应用结果完整返回，`pass` 还要求真实行为、两路呈现、构建/资产身份、输入稳定和原生退出全部通过。`device.emulator`、`simulatorAcceptance` 和 `physicalAcceptance` 分别保存，模拟器通过不能计为真机通过。

本轮最终 APK 为 `output/runtime-interop/android-build-attempt-10/app-debug.apk`，27,055,266 bytes，SHA-256 `53093e1e3b3149a6e8e5033bbe1785399232e4565c44af0a810e8eaae18e894c`。`android-matrix-final-20261025/report.json` 的六项全部通过，保留 10 张 PixelCopy、10 张 ADB 全屏和 10 张裁图，六个实际 native runtime 清理/退出均为 0。SDK 字节仍为原 build216。

独立 `android-demo-final-20261025/report.json` 还验证普通图标启动、两次 ADB 系统触摸经 SDL 到可信 DOM `mousedown`、颜色实际变更，以及一次 HOME 后原 PID/会话/Surface 暂停恢复、继续绘制和正常退出。该次 Surface generation 保持 1，未强制销毁并重建 Surface。SDL 坐标保留原始小数值，落在目标像素的一像素范围内；没有用 JavaScript 合成事件。此演示结果不替代固定六项合同，也不证明完整 TouchEvent、多指或键盘行为。

以上是冻结的 x86_64 模拟器结果，不能替代下面的真机记录。反复后台/旋转/设备恢复压力、长时间 GC、功耗/PSS/启动性能、其他引擎和所有 Android GPU/ABI 均未验收；不据此推断 FPS 超过 Chrome。

## ARM64 真机复测（2026-10-25 至 26 日）

用户接入的 vivo V2520A 为 Android 17 / API37、SM8750 / Adreno 830、ARM64、4096-byte 内存页。直接验证已推送的 MystralNative `3cea6b4`，没有修改宿主或 SDK；同一 stage4 资产构建 ARM64 APK，25,315,833 bytes，SHA-256 `b59938748912dcbfe76ab8b96cf849301b6b18519d3706418c380a535903a86e`。

[真机测试摘要](../../tools/verify/runtime-interop-android/host-patches/arm64-test-summary.json)独立保留六项功能矩阵、构建/依赖/退出审计和已知缺口。G0、AIR cube、PBR、Skin、UI、Compute 全部通过，六个独立进程均完成真实清理和 SDL 返回；75 项独立审计及来源/退出复核通过。这是当前 4 KB 页设备上 320×240 物理像素视口的功能专项，保持 `subset:true`、`releaseReady:false`。

手机 ADB PNG 嵌入 Display P3 ICC，而 PixelCopy 为 sRGB。原始 PNG、ICC、全屏标准 sRGB 转换、原坐标裁图及两个 oracle 均保留；LittleCMS 使用实际嵌入 ICC 作全图 relative-colorimetric 转换，未重缩放、拟合像素或降低阈值。独立重放 10 张原始全屏图，转换后 RGBA 与采集记录逐字节一致。原未解释 ICC 的失败记录保留。真机采集快照为 `output/runtime-interop/android-arm64-collector-v2.cjs`，配套色彩和进程表 helper 由报告当前输入哈希绑定；原 canonical 入口及模拟器证据不变。

当前仍有两个边界：

- SDL3、V8 预编译库的 ELF LOAD 为 4096 对齐，不符合 16 KB；runtime 与 C++ shared 库的 LOAD 为 16384，不能因系统弹窗的“未知错误”一并误判。16 KB 环境未验收，不能以本台 4 KB 页设备运行成功替代依赖重建。[Android 官方说明](https://developer.android.com/guide/practices/page-sizes)
- 系统触摸已产生可信 DOM `mousedown`，但额外后台恢复未闭合：首次恢复命令撞上 HOME 过渡，下一轮诊断开始时设备已自动锁屏、缺有效前台 Surface。原失败均保留，需手动解锁后继续；不能据此声称后台恢复通过或直接归因为宿主缺陷。

## c++_static 配置（2026-10-26）

用户要求改为静态 C++ runtime 后，宿主默认选择 `c++_static`，并接入固定 Cocos external `0be13f7e2e9034d123744935ea73b410b2085b15` 的 V8 11.6.189.22 静态归档。V8、Dawn、Skia 与一份 NDK C++ runtime 合入 `libmystral-runtime.so`；纯 C 的 `libSDL3.so` 独立保留。实际两 ABI APK 均只有这两个 native 库，其 `DT_NEEDED` 无 `libc++_shared.so` 或 `libv8android.so`，不是通过排除文件制造缺依赖的包。

相对已推送 `3cea6b4` 的 [六文件增量补丁](../../tools/verify/runtime-interop-android/host-patches/cxx-static/README.md)包含精确基线、修改前后源码、fresh apply 比对、依赖哈希和许可证。它单独保存，不重写此前 shared 候选的补丁或验收记录。

构建参数明确为：

```text
-PmystralAndroidStl=c++_static
-PmystralV8LibraryKind=static
-PmystralV8StartupData=embedded
```

这些也是对应默认值；显式选择旧 shared 配置时仍须使用匹配的 shared V8 和 external snapshot。配置阶段拒绝 static C++ 与现有 shared V8 的混用。embedded 模式不提取、注入或打包旧外置 snapshot，native-ready 记录真实链接库的 `v8Version` 和实际编译的 `v8StartupMode`。切换模式会限定清理 Gradle 生成的 snapshot 目录，防止旧生成文件残留入包。

- ARM64：`output/runtime-interop/android-static-build-attempt-1/app-debug.apk`，22,568,615 bytes，SHA-256 `9a5dc0d04815ddc8e159a36cc79c9d0a9ea7631afdcd18d30149c86eac9a5968`。
- x64：`output/runtime-interop/android-static-x64-build-attempt-1/app-debug.apk`，24,251,137 bytes，SHA-256 `ebd8fa2258df2159e2675faa8d70d79bbf629fa6b36b0d2a484ea402d9c84313`。

两包的真实链接 map 均包含 `libc++_static.a`、`libc++abi.a` 和 V8 monolith，且无未解析的 NDK C++ 标准库符号。正常链接未使用重复定义兜底。SDK/stage4 仍为同一字节；x64 模拟器的 G0、AIR cube、PBR、Skin、UI、Compute 六项已实际全部通过，真实 V8 11.6.189.22/embedded、两份 Shader WASM、双路呈现和正常退出均验证，见 `output/runtime-interop/android-cxx-static-matrix-attempt-1/report.json`。新采集快照 `android-cxx-static-collector-v1.cjs` 对 external/embedded 分模式绑定真实启动数据、版本、APK 及静态链接闭包，不以两个缺失的 snapshot 字段相等作为通过。

当前手机未连接，新 ARM64 静态候选仅完成构建/签名/ELF/链接闭包核验，不能套用此前 shared 版本的真机 PASS。SDL3 仍为原 3.2.8 的 4 KB 预编译库，完整 16 KB 环境和后台恢复尚未验收；切换 `c++_static` 本身不代表这些问题已经解决。宿主修改尚未暂存、提交或推送。

## SDL 3.2.30 与实际 16 KB 环境验收（2026-10-26）

后续在上述静态配置上升级完整官方 SDL 3.2.30 AAR，默认参数为 `-PmystralSdlVersion=3.2.30`。Java 类、headers、extracted Prefab 和实际 packaged SDL 库均来自同一官方 AAR；CMake 继续读取该依赖根的通用路径，未单换 `.so`。保留 `c++_static`、静态 V8 11.6.189.22、embedded snapshot 以及原 SDK/stage4。

相对 `3cea6b4` 的[累计源码、依赖与 SDK 来源交付](../../tools/verify/runtime-interop-android/host-patches/16k/README.md)单独保存，不覆盖此前 static-only 补丁。`16k/acceptance.json` 另外绑定实际两个页大小环境的运行、构建和独立审计。

- ARM64：`output/runtime-interop/android-16k-arm64-build-attempt-1/app-debug.apk`，22,919,919 bytes，SHA-256 `a84ed29a1c5d433e48703647d7e63ce8d853cf836dadd5871b6cba335c984e7a`。
- x64：`output/runtime-interop/android-16k-x64-build-attempt-1/app-debug.apk`，24,607,345 bytes，SHA-256 `3e7931eac6a49a59f9cc165a98dacca3f93b5f0afea7b1dc3b2cffad2d980757`。

两包仅 SDL3/runtime 两个 `.so`，无共享 C++/V8 动态依赖、无外置 snapshot。实际所有 LOAD 至少 16384，RELRO 静态安全；同 APK 的 `zipalign -v -c -P 16 4`、签名、115 个当前宿主源码和29个stage资产均核对通过。旧候选、源码补丁和历史证据未改。

运行环境独立安装在 `output/runtime-interop/android-16k-env-1/`：官方 `system-images;android-37.0;google_apis_ps16k;x86_64`，AVD `Mystral_16KB_API37`。系统实际 `getconf PAGE_SIZE=16384`，`/proc/cmdline` 含 `page_shift=14`；专用模拟器中 `bionic.linker.16kb.app_compat.enabled=fatal`、`pm.16kb.app_compat.disabled=true`，采集前后都核对，无兼容回退。没有改动用户全局 SDK、原 AVD 注册或物理手机设置。

`output/runtime-interop/android-16k-matrix-attempt-2/report.json` 完整六项 PASS，`page16kRuntimeAcceptance=true`。实际完成两份 Shader WASM、模块、GPU readback、错误/lost、AIR cube、PBR、Skin、UI、direct/indirect compute，以及10组双路图、资源清理、六个 Native/SDL 返回和 live/gone 进程验证。同一 x64 APK 在独立4096页模拟器的 `android-sdl330-4k-regression-attempt-1/report.json` 六项也全 PASS，其 `page16kRuntimeAcceptance=false`，未混用环境结果。

首轮 `android-16k-matrix-attempt-1` 的 UI/Compute 因新系统首次全屏教学 `Viewing full screen` 遮盖实际显示而 FAIL，原件保留；Surface 图正确不替代 compositor。普通确认 `Got it` 的原始 XML/坐标与记录保存在环境目录，未点击兼容提示、未改阈值；之后以新目录完整复采。采集器快照为 `android-16k-collector-v1.cjs`，显式要求实际页大小，并绑定 ELF/ZIP、mode/version 和兼容关闭数据；诊断单项不能计完整16KB通过。

上述运行结论限 x64 官方16KB模拟环境，ARM64 新包只有构建与静态检查，尚无 ARM64 16KB设备运行证据。未扩展为后台 Surface 重建、长期压力、性能或全部 SDK 发布门禁，`subset:true`、`releaseReady:false` 保持；项目版本未改，宿主修改未提交或推送。

## 已有代码提交交付（2026-10-26）

用户随后授权提交并推送已有代码。上述六个宿主文件已提交到 [oahc09/mystralnative 的 b98101a](https://github.com/oahc09/mystralnative/commit/b98101acd368107829a7aa4c0481084f2ecefd5e)，位于 `feat/cocosair-webgpu-interop`。推送后远端 HEAD 与本地提交一致，宿主工作区干净，六文件字节仍匹配 SDL 3.2.30 验收清单。独立 [Git 交付回执](../../tools/verify/runtime-interop-android/host-patches/16k/git-delivery.json)记录实际提交身份；此前 `acceptance.json` 中未提交状态描述的是其生成时的快照，保持原始字节不重写。

Cocos AIR 的探针、资产准备、独立捕获工具、宿主补丁、依赖回执及计划/台账在 `feat/webgpu-runtime-interop` 分支交付。此前仅存在于忽略目录的 ARM64、static、16 KB 采集器、色彩/进程 helper、独立审计和依赖/构建脚本，以[逐字节源码快照](../../tools/verify/runtime-interop-android/verification-snapshots/README.md)纳入 Git；清单保留原路径、字节数和 SHA-256。APK、原始图像和构建缓存仍保存在本地输出目录，不随源码提交。

本次只交付已有实现与证据，不重新执行或扩大先前的运行验收。适用配置仍为 V8+Dawn；QuickJS、新 ARM64 候选运行、ARM64 16 KB 实机、强制 Surface 重建和性能验收均未因提交代码而闭合。没有合并主线、修改项目版本或发布。

## 生命周期验证工具

后续生命周期专项使用 `tools/verify/runtime-interop-android-lifecycle.cjs`，与六项图形矩阵分开。默认执行后台恢复、真实 keyguard 锁屏恢复、不透明系统 Settings 遮挡引起的 Surface 毁建，以及 900 秒有界连续运行。初始 PixelCopy before/after 仍严格限定同一 Surface；恢复后保留新的完整 ADB compositor 图、真实 UI XML 边界与裁图，不改写旧 PixelCopy metadata 或跨 generation 复用其 after。

```powershell
node tools/verify/runtime-interop-android-lifecycle.cjs --serial=emulator-5554 --apk=<candidate-directory>/app-debug.apk --python=<python-executable> --expected-page-size=16384 --soak-seconds=900 --out=output/runtime-interop/<new-lifecycle-attempt>
```

需要可解析的 `pngjs`、`jszip` 和带 Pillow/LittleCMS 的 Python；可通过 `NODE_PATH` 使用既有工具环境，不自动安装依赖。APK 相邻目录必须有对应的 `build-report.json`。采集器逐项核对包内 SDK、资产清单及其他资产字节；记录初末源码、依赖运行模块、构建收据和 APK 指纹。16 KB 设备必须实际返回 16384，并在采集初末保持兼容回退关闭。

该工具只操作专用包 `com.mystral.engine.interop`，每次使用新 run ID 和输出目录；会停止/启动该包、发送 HOME/SLEEP/WAKEUP 与触摸、打开系统 Settings、建立临时 ADB forward、读取 UI/系统状态及应用日志。自动解除 keyguard 限定显式模拟器；不设置、读取或绕过安全锁屏凭据，不改变用户真机安全设置。自有测试 AVD 的 keyguard 必须预先启用，临时环境调整及恢复另留回执。仅灭屏、没有实际 keyguard 显示不能计锁屏通过。

每个恢复过程共享单一 15 秒截止，先确认原 PID/run ID、V8/Dawn 身份及原颜色自动呈现，再以一次真实触摸检查新帧、材质变化和空 GPU error 列表。Surface 项必须实际看到 `surface-destroyed → surface-created` 与 generation 增长；HOME 的同 Surface 恢复不能代替它。[Android SurfaceView 生命周期](https://developer.android.com/reference/android/view/SurfaceView)与 [SurfaceHolder.Callback 有效区间](https://developer.android.com/reference/android/view/SurfaceHolder.Callback)是判据依据。

连续运行每 30 秒保留真实触摸、绘制增长、画面及会话样本。monotonic 和 wall 时刻同时记录；单次样本起始间隔超过 45 秒即失败，不能在系统暂停后密集补样。该容差是采集完整性合同，不是 FPS 或用户性能要求。每五分钟的 `dumpsys meminfo` 只作内存观察，不以随意阈值判断无泄漏。`--soak-seconds=0` 跳过连续运行并输出 PARTIAL，不能作为完整生命周期 PASS。

结束时 `/finish`、真实 native exit、Runtime/GPU/窗口清理及 SDL 返回共享原 10 秒预算；只有它们通过后才单独检查专用进程清理。logcat 子进程必须在原两秒关闭预算内实际确认关闭，且原始日志限定当前 PID、会话创建边界和设备时间窗审查崩溃。应用结果、采集器关闭和强制停止清理分别记录，不以强停补出正常退出。

新候选的隔离构建可使用以下 Windows 入口，先准备匹配的 Mystral 源码、`deps-16k-attempt-1` 和 `android-assets-attempt-4`。脚本沿用本轮 JDK17/SDK36/NDK29 工具链路径，跨机重放须先核对脚本中的显式工具路径；不扫描或修改全局 SDK。

```powershell
pwsh -NoProfile -File tools/build/runtime-interop-android-host.ps1 -Abi x86_64 -Out output/runtime-interop/<new-build>
python tools/build/runtime-interop-android-finalize.py x86_64 output/runtime-interop/<new-build> output/runtime-interop/deps-16k-attempt-1 output/runtime-interop/mystral-source output/runtime-interop/android-assets-attempt-4
```

构建只操作明确的新输出目录和宿主普通 Gradle 生成目录。为避免增量 ZIP 保留旧 native entry 空洞，会先保存且核对旧生成 APK 的完整副本，再限定删除那一个生成文件以重新打包；不递归清理目录。finalizer 不连接设备，重新核对实际源码清单、29 个固定资产、签名、两 native 库、16 KB LOAD/RELRO/zipalign 及真实 map 的静态链接来源。

完整运行结束且日志采集器已实际关闭后，可作一次独立离线审计：

```powershell
node tools/verify/runtime-interop-android-lifecycle-audit.cjs --report=<closed-lifecycle-report.json> --out=output/runtime-interop/<new-lifecycle-audit>
```

该审计只读原证据，独立重算所有保留 PNG 的像素与原坐标裁图，复核恢复时自动呈现先于输入、同 PID/runtime/GPU device、锁屏和真实 Surface 回调、至少 31 个连续样本及原始时刻、正常退出和采集器关闭。当前范围是本轮 x64 无嵌入 ICC 的系统截图；不以历史真机 profile 或转换结果补出当前图像通过。

## 生命周期专项结果（2026-10-26 至 27 日）

已在官方 x64 16 KB 模拟器上完成四项功能验证，并修复实际发现的 Surface 重建黑屏。旧 b98101a 候选经锁屏或不透明 Settings 遮挡后出现真实 `surface-destroyed → surface-created`；原 PID 仍能处理可信触摸且 AIR 帧数增长，但独立 compositor 裁图全黑，Vulkan 日志持续出现 `BufferQueue has been abandoned`。旧失败报告及其精确 producer、原始图和日志全部保留，没有降低像素阈值或将失败改为通过。

[九文件生命周期补丁](../../tools/verify/runtime-interop-android/host-patches/lifecycle/README.md)从真实 Java Surface 回调获得自持有 ANativeWindow 引用及 generation。SDL/JavaScript owner 在事件派发及 rAF 前安全退役旧 presentation Surface、绑定新 Surface并重放 canvas 配置；原 instance、adapter、device、queue 和 JS 会话保持。UI 线程只发布状态，不执行 Dawn 操作。此修复不修改 Cocos AIR SDK，仍使用 SDL 3.2.30、静态 V8 11.6.189.22/embedded 与 `c++_static`。

最终新候选为：

| ABI       | APK 本地路径                                                                   |     字节数 | SHA-256                                                            |
| --------- | ------------------------------------------------------------------------------ | ---------: | ------------------------------------------------------------------ |
| x86_64    | `output/runtime-interop/android-lifecycle-x64-build-attempt-2/app-debug.apk`   | 24,611,573 | `dc7c4d95d16566ada0954f2e6ee2690e645c70bf7fda71cf2185ba59b8edec56` |
| arm64-v8a | `output/runtime-interop/android-lifecycle-arm64-build-attempt-1/app-debug.apk` | 22,923,375 | `560343c4558c91b0be3d7ea2add797d0195c1c82e3b033ec4536d609eb2ad590` |

两 ABI 的完整 116 项编译源码映射一致，签名、29 个固定资产、两 `.so`、16 KB ELF/ZIP 与静态链接检查通过；SDK 仍为 build216 的原始字节。新增头文件使源码映射从 115 项变为 116 项，不是 SDK 构建计数变化。新 ARM64 包尚未在硬件上运行。

`android-lifecycle-16k-attempt-1/report.json` 的 initial、background、lock、surface、continuous 五阶段全部通过，`completed/inputsUnchanged=true`。后台、无凭据 keyguard 锁屏与实际 Surface 重建后，均先观察原颜色自动呈现，再发送输入；同 PID 4893、会话、GPU device 指针和 owner 线程保持。连续运行 903.7 秒，共 31 个完整样本，AIR 帧数从 1637 增至 53855，没有超过原采样间隔合同或以补样填空。未发现当前 PID 的崩溃记录，正常 native exit 为 0，原 10 秒预算内完成既有拆卸日志及 SDL 返回，之后才清理专用进程。

独立 `android-lifecycle-final-audit-attempt-1/report.json` 为 17 项通过、1068 份证据哈希；同一 x64 APK 的 `android-lifecycle-matrix-regression-attempt-1/report.json` 六项图形回归也全部通过。测试环境维持实际 `PAGE_SIZE=16384`、strict linker/PM 策略，结束后恢复自有 AVD 的原 keyguard 禁用状态并关闭模拟器。首个关闭记录在 ADB 消失后未能读取仍打开的 emulator 日志，保留为不完整记录；随后 `owned-environment-closed.json` 确认实际 emulator 进程与日志 writer 已关闭，四份环境日志均已封口。

仍有明确的资源问题，不能将上述功能 PASS 表述为无泄漏：

| 连续样本 | 总 PSS（KiB） | Native Heap PSS（KiB） |
| -------- | ------------: | ---------------------: |
| 0 分钟   |       215,839 |                 51,526 |
| 5 分钟   |       226,819 |                 61,914 |
| 10 分钟  |       237,714 |                 71,866 |
| 15 分钟  |       239,963 |                 82,394 |

Native Heap PSS 在四次观察中持续增长。源码复核也发现既有 `getCurrentTexture` 注册表添加 API 引用，而其释放/清理路径尚需专门核算；仅凭 meminfo 不能将增长全归因于它。当前已证明正常拆卸调用和进程清理，没有逐对象 native/GPU 引用归零证据。后续应优先检查该资源归属，暂不声称无泄漏、长期压力或性能验收完成。

[本轮交付清单](../../tools/verify/runtime-interop-android/host-patches/lifecycle/acceptance.json)将结果明确标为 `FUNCTIONAL_PASS_WITH_OPEN_MEMORY_FINDING`，保留 `subset:true`、`releaseReady:false`。范围仅为同 Activity 的 Surface 生命周期；Activity 重建、设备丢失恢复和 ARM64 真机仍未验收。本轮修改尚未提交或推送。

## 内存引用验证工具

后续修复使用 `tools/verify/runtime-interop-android-memory.cjs` 调用原始、字节冻结的生命周期入口，再独立消费 Native 日志和 meminfo。需要一份完整、闭合的 900 秒旧基线，不能拿诊断或历史其他 APK 的局部结果填补当前执行。

```powershell
node tools/verify/runtime-interop-android-memory.cjs --serial=emulator-5554 --apk=<candidate-directory>/app-debug.apk --python=<python-executable> --baseline-report=<closed-900s-baseline.json> --expected-page-size=16384 --soak-seconds=900 --out=output/runtime-interop/<new-memory-attempt>
node tools/verify/runtime-interop-android-lifecycle-audit.cjs --report=output/runtime-interop/<new-memory-attempt>/lifecycle/report.json --out=output/runtime-interop/<new-image-audit>
node tools/verify/runtime-interop-android-memory-audit.cjs --report=output/runtime-interop/<new-memory-attempt>/report.json --out=output/runtime-interop/<new-memory-audit>
```

Native `RESOURCE_SNAPSHOT` 区分 Canvas 纹理/视图、普通纹理/视图、buffer、shader、pipeline、layout、sampler、bind group 和命令相关对象，共 18 类。每项 `acquired - released = live`，同时记录 peak；只对真实持有的 API 引用计账，不把借用的 device/queue/adapter 当作新引用。wrapper 的 created/finalized/live 与 Native API 引用分开报告，不要求两者在相同时间归零。

Android 单条日志存在长度限制，因此完整 JSON 按 512-byte ASCII 片段保留为 `RESOURCE_SNAPSHOT_PART <sequence> <index>/<total> <rawChunk>`。consumer 绑定当前 PID、会话时间和完整序列，拒绝缺片、重复、错序及不完整 JSON；不拼接近似截断数据。原始分片、每片与整包 SHA 全部保留。连续阶段约每五秒的采样在真实帧租约结束后记录，最大十五秒空洞作为证据覆盖限制；锁屏暂停区间不冒充持续采样。

硬门槛包括 Native 引用守恒、Canvas 当前纹理峰值不超过 1、采样帧边界 Canvas 自持引用为 0、最终 Native cleanup 为 0，以及当前 PID/时间内没有 `MystralJS V8_EXCEPTION`。三十秒的真实输入、AIR 绘制进展、compositor 呈现、原生退出和 logcat 关闭仍由原生命周期合同独立约束，不能用 Native 空轮询计数代替渲染帧。

meminfo 使用表格中 `Native Heap` 第一列 PSS，并另存 Heap Alloc/Free；不能误用 App Summary 中口径不同的同名值。报告对照同一 0/5/10/15 分钟、实际 AIR draw 进展及增长差，不设置随意的 PSS 合格阈值。普通资源或 wrapper 的持续单调增长会列为 open finding；即使 Native cleanup 归零，也不将运行中增长隐去。

修复的资源所有权与跨帧安全规则见[独立内存源码包](../../tools/verify/runtime-interop-android/host-patches/memory/README.md)。Canvas 租约只持有 Surface 图像的 API 引用，自动到期与逻辑销毁不得销毁 Surface backing；普通自建纹理仍执行真实 Destroy/Release。私有租约 token 在 API 到期后拒绝旧 wrapper 使用，GC 和显式 cleanup 共用幂等释放路径。V8 weak 第一遍只 Reset，Native 释放及外部内存扣账在第二遍执行，未改变既有 GC 阈值。

Android 窗口过渡还区分可丢弃当前呈现帧与真实设备错误：只在受限的瞬时 acquire 状态、设备仍可用时使用临时同配置纹理，不向已失效窗口 Present；OOM、设备丢失和无效配置不走该路径。Null Window 暂停阶段最多持有一个旧 Context Surface 和一个显式 ANativeWindow 引用，待新窗口或 teardown 由 owner 线程配对释放；它不是无界 retired 队列，也不是恢复 Canvas 引用泄漏。

## 帧引用内存问题修复结果（2026-10-27）

已修复本次持续增长的 Canvas API 引用保留问题。旧 APK 的 warm demo 另采集了 60 秒 heapprofd，健康统计中 missing packet/non-finalized profile 均为 0；匹配 Build ID 的原生栈包含 Dawn `SwapChainTexture::Create` 和 `TextureInfo` 注册表插入。其 JIT 边界以上栈不完整，不将这份采样解读为全部分配归属证明。源码复核则直接确认每帧 `GetCurrentTexture` 引用/registry entry 未配对释放、多 view 只释放最后一个，以及普通纹理缺少统一清理。

[内存修复交付清单](../../tools/verify/runtime-interop-android/host-patches/memory/acceptance.json)绑定最终 11 路径累计补丁、两 ABI 的同一 116 项编译源码、闭合运行、独立审计和原生控制。最终 APK 为：

| ABI       | APK 本地路径                                                                |     字节数 | SHA-256                                                            |
| --------- | --------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------ |
| x86_64    | `output/runtime-interop/android-memory-x64-build-attempt-7/app-debug.apk`   | 24,636,557 | `341dfe090332cbd440105c254ce6fd0c2aea0ad8af46b92250ba19add551d1d4` |
| arm64-v8a | `output/runtime-interop/android-memory-arm64-build-attempt-1/app-debug.apk` | 22,948,135 | `c6d833035389e1e434db3d0957d21a68a8fdfaac03e3422564e5b6515b205819` |

两包都保留 SDL 3.2.30、V8 11.6.189.22 static/embedded 和 `c++_static`，签名、仅两 `.so`、无共享 C++/外置 snapshot、16 KB ELF/ZIP 和真实链接 map 核验通过。SDK build216 与 stage4 的 29 个实际资产文件仍为原字节。ARM64 新包没有套用旧版本的真机 PASS。

最终官方 x64 16 KB 环境的 `android-memory-16k-attempt-1/report.json` 完整 PASS，原生命周期入口仍为冻结版本。运行 904.1 秒、31 个采样，AIR 实际帧数 1828→55141；后台、无凭据 keyguard 锁屏和实际 Surface 重建后均先恢复原画面，再接受真实输入。原 PID 6017、设备与会话保持，无未捕获 V8 回调异常或当前 PID 崩溃，正常 native exit0、SDL 返回、独立日志关闭和专用进程清理通过。

原始日志完整重组出 189 个 native 快照，连续窗口覆盖 180 个 periodic，最大间隔 5015 ms。累计 332,015 个受管 API 引用全部配对释放，cleanup live=0；Canvas texture 为 55,246 次 acquire/release、peak=1，Canvas view 为 55,245 次配对、帧边界 live=0。wrapper 在 Native cleanup 时仍有 138 个，不能把这个值清零伪装成 GC 或全部 CPU metadata 已销毁。

| 样本时刻    | 旧 Native Heap PSS（KiB） | 修复后 Native Heap PSS（KiB） |
| ----------- | ------------------------: | ----------------------------: |
| 0 分钟      |                    51,526 |                        48,618 |
| 5 分钟      |                    61,914 |                        48,662 |
| 10 分钟     |                    71,866 |                        48,940 |
| 15 分钟     |                    82,394 |                        48,592 |
| 15 分钟增量 |                   +30,868 |                           -26 |

修复后 Heap Alloc 增量为 -550 KiB，Total PSS 仍增加 2074 KiB；不能写成“全部内存完全不涨”。上述是固定工程和 SDK、同系统镜像配置下的有界观察，不是性能基准。判定依赖实际引用配对、Canvas 有界、真实绘制与退出合同，未设置任意 PSS 合格阈值。

同一新 x64 APK 的六项图形矩阵全部通过；独立生命周期审计为 17 项/1062 文件哈希，内存离线审计为 23 项通过。最终 Windows EXE 另执行原 8 项严格 API 控制，以及逐字节保留的“取得当前纹理但不提交，跨帧后再渲染”和显式 Canvas destroy 控制，三组都通过。Windows CLI 的 `ExitProcess` 不执行 Runtime 析构，结果明确为 API_SCOPE_ONLY，没有代替 Android 真实清理。

修复过程中保留了所有失败：初版 lease 自动 Destroy 了 Surface backing，原未提交帧控制实际重现下一帧 destroyed-texture/SIGSEGV；后续改成 API 引用释放与逻辑失效。旧的 V8 历史异常判断曾使后续正常帧被拒绝，现只验证本次数组转换。Android 早期 AVD 消失/失响应、后续锁屏 acquire 失败造成 RAF 停止的诊断均保持 FAIL，不在最终结果中删除；最终日志实际捕获一次 status5 丢弃当前呈现帧并以 status1 恢复，恢复仍满足原 compositor 门槛。最终未见 `SURFACE_PAUSE_HOLD_RETURN`，因此不能声称 null-window hold 分支已专项触发。

本次完成的是原帧引用泄漏修复和指定有界复测。CPU weak metadata 最终析构、驱动驻留、所有对象无泄漏、长期压力、全引擎/全设备、Activity 重建和自然设备丢失/OOM注入仍不作保证；新 APK 的 4 KB 及 ARM64 硬件执行未验收。两个自建 AVD 的原 keyguard 策略已恢复，进程和全部十份环境日志 writer 已关闭，SDK/AVD 数据保留。项目版本不变，本轮代码尚未提交推送。

## 真机前台基线工具

用户随后重新接入 ARM64 真机。首轮先对已安装的同一候选执行原六项图形矩阵，再使用 `tools/verify/runtime-interop-android-phone-memory.cjs` 建立这台手机自己的前台基线，不调用模拟器专用 keyguard dismissal，也不以不同设备/ABI/页大小的 PSS 作可比结果。

```powershell
node tools/verify/runtime-interop-android-phone-memory.cjs --serial=<physical-device> --apk=<installed-arm64-candidate>/app-debug.apk --python=<python-executable> --expected-page-size=4096 --soak-seconds=900 --out=output/runtime-interop/<new-phone-memory-attempt>
```

页大小参数必须取设备实际值。工具在任何专用包 force-stop/start 前保存 power/window policy 并要求 Awake、keyguard/showing/inputRestricted 已识别为 false；锁屏会明确失败，不自动唤醒、解锁、设置凭据或修改超时。用户正常解锁后另建新尝试。只允许操作专用包，执行前需已安装且逐字节匹配 ARM64 APK、相邻构建收据和包内 SDK/资产。

前台循环每十秒从实际 top Activity、keyguard 和 UI tree 验证唯一 native SurfaceView，再发送一次真实触摸，验证可信原生输入、原 PID/run ID、递增 AIR draw 和空 GPU error。计划三十秒获取一次独立 ADB 全屏、真实 ICC 转换及原坐标裁图，计划三百秒获取 meminfo；到期后下一真实心跳采样，审计以实际时刻为准，不写成每 30.000 秒硬实时。每次采样保存单调/墙钟时刻和原命令，不能暂停后密集补样；十五秒最大心跳间隔属于这份新手机采集合同，不是 FPS 或用户性能指标。

原始图片和真实 ICC 原文保留，沿用已有标准色彩转换和颜色阈值；不缩放、拟合或借用其他设备的 profile。手机报告 schema 为 `physical-foreground-only`，`physicalBaseline=true`，模拟器比较固定 `NOT_RUN_NO_MATCHED_PHYSICAL_BASELINE`。它仅复用冻结 consumer 的原生引用、异常、内存纯函数，不伪造完整生命周期报告。HOME、Settings 和安全锁屏为独立未执行项目。

结束前先保存原 PID 仍存活的证据，再请求 `/finish`，原十秒内要求实际 native exit0、九个 Runtime/GPU/window 拆卸标记和 SDL 返回；之后才 force-stop专用包并验证 PID 消失。logcat 两秒内必须实际 close，当前 PID/时间窗的 fatal/V8 callback 异常、资源 PART 缺失/错序、Canvas 非有界或 cleanup 非零都不能通过。`--soak-seconds=0` 只输出诊断，不能替代完整九百秒结果。

## 最新内存修复候选真机结果（2026-10-27）

用户重新连接 `10CG4G0BE1003M8`，实际为 vivo V2520A / Android 17 API37、原生 ARM64、native bridge=0，`PAGE_SIZE=4096`。直接安装既有 ARM64 `c6d833035389e1e434db3d0957d21a68a8fdfaac03e3422564e5b6515b205819` 候选，没有重建、修改 SDK 或手机安全设置。原六项图形矩阵全部通过，`physicalAcceptance=true`、`functional4kOnly=true`、`page16kRuntimeAcceptance=false`；独立 86 项检查及 301 份证据哈希通过，10 组 PixelCopy/系统图各自验证，P3 整屏经独立 ICC 重放后 RGBA 与保留标准 sRGB 图逐字节一致。

准备手机前台工具期间设备自动锁屏，短测 1 未进入渲染并保持 FAIL：真实生命周期已 pause、Surface destroyed，不能把这个结果当成应用已经运行，也不能自动解除用户锁屏。原 `e9c16...` producer 与失败原件保留。新 `9341fc6ae2fdcef326766e9cea4f8a0174f3fc0b8e865496228b835103fcc165` producer 在启动前新增明确 Awake/keyguard admission；用户正常解锁后才开始另一份完整尝试。

`android-arm64-phone-memory-attempt-1/report.json` 的前台专项完整 PASS，实际 900.77 秒、91 次真实心跳，最大间隔 10.065 秒，没有补样。AIR 实际帧数 348→54409、每次原生 trusted mousedown 坐标落在真实 native 320×240 中心的一像素范围内，GPU error/V8 callback 异常均为空；原 PID 25763、ARM64/V8 11.6.189.22/embedded/Dawn 身份保持。计划图像按真实起点间隔 30.009–30.086 秒采集，31 张周期图加一张初图共 32 张；独立 LittleCMS 全屏 ICC 重放、原坐标裁图与颜色 oracle 全部吻合。

| 真机样本时刻 | Native Heap PSS（KiB） | 总 PSS（KiB） |
| ------------ | ---------------------: | ------------: |
| 0 分钟       |                 49,904 |       258,267 |
| 5 分钟       |                 49,832 |       245,857 |
| 10 分钟      |                 49,644 |       245,939 |
| 15 分钟      |                 49,582 |       246,362 |
| 时段增量     |                   -322 |       -11,905 |

Heap Alloc 时段增量为 -88 KiB。以上是这台手机的首份修复后前台基线；没有同机同合同的修复前基线，报告比较状态为 `NOT_RUN_NO_MATCHED_PHYSICAL_BASELINE`，不能将这些值与 x64 模拟器 PSS 作跨设备收益结论。

184 个原生快照中，连续窗口 180 个 periodic 最大间隔 5014 ms。累计 328,067 个受管 API 引用全部配对释放，最终 live=0；Canvas texture 54,562 次配对、peak=1，Canvas view 54,561 次配对、采样帧边界 live=0。Native cleanup 时 wrapper 仍有 138 个，按既有作用域分开解释，不伪造 GC 归零。

真实 native exit 为 0，九个 Runtime/GPU/window 标记、Context/ANW 引用 0、SDL 返回均在原十秒内观察到；整个退出观察 438 ms，SDL 原始返回边界约 157 ms，logcat 物理关闭 3.791 ms，之后专用 PID 清理通过。前台独立审计为 860 项检查、2457 份证据哈希，未修改业务报告、原图或阈值；producer、独立 ICC replay 和新重放图均保留。

[ARM64 真机交付清单](../../tools/verify/runtime-interop-android/host-patches/memory/physical-arm64-memory-acceptance.json)分别绑定六矩阵、独立审计、完整前台报告、APK/116源码/SDK/stage4、原锁屏失败和当前 collector。只认证这台 **4 KB 页**手机的六功能专项及 15 分钟前台基线；HOME、Settings、安全锁屏恢复、实际 ARM64 16 KB、长期压力、性能和所有分配无泄漏仍未认证。手机凭据、锁屏策略、系统超时和权限均未改，项目版本/Native源码/SDK字节未改，本轮测试工具与记录尚未提交推送。

## 生命周期和内存修复代码交付（2026-10-27）

MystralNative 累计 11 路径修复已提交为 [b3786ab6](https://github.com/oahc09/mystralnative/commit/b3786ab6d2926f031dfb301700f9a80b866cbde6)，推送至当前 `feat/cocosair-webgpu-interop`；远端实际 SHA 与本地一致，源码逐字节匹配验收 manifest。[Git 交付回执](../../tools/verify/runtime-interop-android/host-patches/memory/git-delivery.json)独立记录后续提交事实，历史报告的状态仍表示生成时点。

Cocos AIR 本提交保存隔离构建工具、生命周期与内存采集/审计、真机前台工具、宿主补丁及[完整原始记录档案](../evidence/runtime-interop-lifecycle-memory/README.md)。档案含 7,791 文件、98,010,189 字节，包括失败尝试、原系统图与 ICC、命令日志、分配 trace、来源回执及实际 producer；原报告的时间、状态、路径和指纹保持不变。APK、SO、EXE、符号库/MAP、固定 SDK/依赖和缓存不随档案提交，完整重放需依原收据准备物化输入。

```sh
node tools/verify/runtime-interop-archive.cjs --check=docs/evidence/runtime-interop-lifecycle-memory
```

上述命令只核对记录字节、清单及 producer，不连接设备或执行 GPU 验收。本次 Git 交付另通过 7 项工具 CPU 回归及范围内格式/差异检查，不重采运行证据、不改变 SDK216 或已验收源码，也不将现有专项扩大为全平台、长期无泄漏或发布认证。

## ARM64 真机短会话生命周期（2026-10-28）

最新已安装 ARM64 APK `c6d833...` 在同一 vivo V2520A / API37 / 实际 4 KB 页手机完成四阶段专项：初始双路画面与可信输入、HOME 后恢复、Settings 引起的真实 Surface 销毁重建、锁屏后由用户正常解锁恢复。宿主仍是 `b3786ab6`，116 份源码、SDK216、SDL3.2.30 和 `c++_static` 均保持原字节，没有重建 APK。

真机入口为 `tools/verify/runtime-interop-android-phone-lifecycle.cjs`。它独立于冻结的模拟器 900 秒工具：启动前要求 Awake/keyguard 明确解锁；后台切出确认实际 STOPPED，再以 `NEW_TASK`/reorder/single-top 恢复原任务，仍要求唯一 Activity、相同 PID/runId/token。每次恢复在原 15 秒内先由独立系统截图验证旧颜色自动呈现，再以真实触摸证明颜色变化及 AIR draw 增长。

锁屏阶段保留真实 Asleep、keyguard showing 和 pause；只自动发送 sleep/wakeup，不 dismiss keyguard、不输入凭据、不改锁屏策略或系统超时。默认 180 秒仅供用户正常解锁，逐次保存原始 power/policy。原 15 秒恢复预算从首次实际观测 Awake 且 keyguard 明确解锁开始，覆盖任务回前台、自动呈现和首次可信触摸，不能把等待时间混入性能数据。

正式 `android-arm64-phone-lifecycle-attempt-5` 四阶段 PASS，原 PID314、Activity 仅创建一次。HOME、Settings、解锁后的恢复检查分别为 8123.7、8083.3、8558.8 ms；Settings 真实 generation4 destroyed→generation5 created。原始 P3 系统图、ICC 和原坐标裁图保留，自动呈现的绿/橙/绿画面均在首次恢复触摸前出现。用户正常解锁的独立等待为 4159.7 ms。

9 个原生资源快照内，12,752 个受管 API 引用全部 acquire/release 配对，最终 live=0，Canvas texture peak=1；CPU wrapper 最后仍为138，不能据此声明全部分配归零。原 native exit0、九个拆卸标记和 SDL 返回在 372 ms 内观察到，Context/ANW refs=0；之后才清理专用进程，logcat 原两秒预算内物理关闭。

失败尝试全部保留：attempt1 在初始截图期间出现 orientation1→2→1，元数据坐标与1440×3168系统图不匹配；attempt2 的采集器恢复期限生成小数 timeout，尚未调用恢复；attempt3/4 在 HOME 过渡时发起任务恢复，原指令返回交付但没有实际 resume，随后退出请求在暂停状态超时。新 attempt5 明确等待 STOPPED 后正常通过。不能把失败尝试的强停清理算作正常退出，也不在本次 PASS 中宣称后台直接退出合同。

这份新 schema 为 `physical-short-same-activity-surface-lifecycle`，不包含新的连续运行或内存趋势比较，也不复用前一天900秒的PASS来填本轮范围。Activity 重建/进程回收、后台直接退出、device-loss/OOM、长期/功耗/性能、实际 ARM64 16 KB 和发布认证仍为独立待决项。

[真机生命周期验收清单](../../tools/verify/runtime-interop-android/host-patches/memory/physical-arm64-lifecycle-acceptance.json)绑定新采集器 `e5793d09...`、正式报告 `5e1ea2d2...`、独立审计 `ab2bc26a...` 和同 APK/source。独立审计21项、594证据哈希全部通过；9张P3全屏图独立以 relative-colorimetric/flags0 重算，整屏RGBA、alpha与原坐标裁图逐像素吻合。三张自动恢复裁图另经目视复核，原工具CPU回归7/7通过。

[原始记录档案](../evidence/runtime-interop-physical-lifecycle/README.md)保留五次采集尝试、实际producer、原始命令/PNG/ICC/日志、独立审计及重放，共1129文件、28456008字节。旧模拟器及真机前台基线工具和历史报告原字节不改。本提交交付新增真机工具、证据和说明至 `feat/webgpu-runtime-interop`；Native、APK、SDK及项目版本均未变。验收 JSON 的未提交标记保留生成时状态，实际 Git 身份以包含该记录的提交为准。
