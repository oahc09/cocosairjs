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
