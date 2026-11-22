# Android 原生互操作工具

这些工具在独立原生宿主中运行相同 AIR SDK/探针，不把 Android/JSB 加入 AIR 默认 Web runtime。
工具保持 `subset` 与 `releaseReady=false`，不默认进入 CI。

## 前置条件与授权

需要明确授权的 ADB 设备、已核来源的 APK/宿主源码/构建回执、Node、PNGJS 和 Python/Pillow（ICC 路径依赖 LittleCMS）。
构建辅助脚本还要求现有 Android SDK/NDK/JDK/Gradle 或 Windows PowerShell 工具链；不自动安装依赖。
`--install` 会安装指定 APK，生命周期测试会操作应用前后台/Surface并收集进程、截图和内存数据，执行前必须确认设备与副作用。
不要在用户日常手机上无授权运行。真实安全解锁必须由用户完成，不能借模拟器专用命令绕过。

## 入口与输出

| 入口（`tools/` 下）                                                                | 用途与写入边界                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [build/runtime-interop-android.cjs](../../tools/build/runtime-interop-android.cjs) | `--out=<新目录> --bundle=<SDK>`；逐字节暂存 SDK、shader、探针和模型夹具，写 asset manifest；不执行 Gradle/安装                             |
| `build/runtime-interop-android-host.ps1`                                           | 调用显式现有宿主构建工具，保存源码/SDK/APK 构建身份；先查看脚本参数与本地工具链                                                            |
| `build/runtime-interop-android-finalize.py`                                        | 对显式构建产物生成来源/打包回执；不提供未执行的设备结论                                                                                    |
| `verify/runtime-interop-android.cjs`                                               | `--serial --apk --assets --build-report --out` 必需；可选 `--case=probes\|air\|pbr\|skin\|ui\|compute` 或 `--matrix`；`--install` 显式安装 |
| `verify/runtime-interop-android-lifecycle.cjs`                                     | `--serial --apk --out`；模拟器生命周期及有界连续运行，默认实际页大小16384、900秒；0秒仅诊断                                                |
| `verify/runtime-interop-android-memory.cjs`                                        | 生命周期入口加 `--baseline-report=<旧报告>`；真实引用计数/内存比较，旧报告必须独立保留                                                     |
| `verify/runtime-interop-android-phone-memory.cjs`                                  | 真机前台内存基线，默认4096页、900秒；拒绝 emulator serial                                                                                  |
| `verify/runtime-interop-android-phone-lifecycle.cjs`                               | 真机同Activity短会话；默认4096页，手动解锁等待180秒（可选60..600秒），不代替长时测试                                                       |
| `verify/runtime-interop-android-background-exit.cjs`                               | 定向检查 foreground/home/settings 下直接正常退出；显式 APK、匹配宿主源码、实际页大小和新输出目录，`--install` 才安装专用 debug 包          |
| `verify/runtime-interop-android-{lifecycle,memory,phone-lifecycle}-audit.cjs`      | `--report=<已关闭报告> --out=<新目录>`，离线独立核验并写新审计目录，不覆写原报告                                                           |
| `verify/runtime-interop-android-phone-lifecycle-icc-replay.py`                     | 对保留全屏图片与 ICC 数据独立重放，写独立报告；不替代设备采集                                                                              |
| `verify/runtime-interop-archive.cjs`                                               | 按明确 inventory 复制精确原件到新 archive；`--check` 只读核验，不发布档案                                                                  |

所有参数用 `--name=value` 形式，布尔标志例外。每次采集/审计使用新的输出目录，保留失败尝试。
本地 ICC/进程辅助工具位于 `verify/runtime-interop-android/lib/`，无需恢复历史 `verification-snapshots/output/` 才能加载采集器。
暂存 SDK 必须通过 [源码与产物绑定](runtime-interop.md#source-map-绑定与信任边界)，不能拿旧 APK 的验收证明当前 SDK。

宿主构建脚本可用 `-RuntimeBase <已有隔离目录>` 指定依赖、宿主和固定资产所在目录，`-Out` 支持其中的绝对新路径；未指定时仍使用当前仓库的 `output/runtime-interop/`。只切换这些显式本地路径，不下载依赖，不重新构建 AIR SDK。历史辅助脚本须与所选目录中的来源回执匹配。

后台退出探针每次只运行一个 `--case=foreground|home|settings`，必填 `--serial`、`--apk`、`--host-source`、`--out`、`--expected-page-size=4096|16384`，可选 `--python`。它逐文件核对 APK 的构建源码、固定资产、SDL3.2.30/static/embedded 配置，先验证实际 AIR draw、可信输入和系统呈现，再确认目标 Activity 实际 STOPPED。Settings 项还要求真实 Surface 销毁。退出必须在原10秒内观察到 native exit0、完整拆卸和 SDL 返回，随后才清理专用进程；不能以重新拉回前台或强停补通过。原始命令、日志、图像及源码指纹写入新目录。

该探针可使用明确绑定的历史 SDK 作为宿主回归夹具，报告保留其实际哈希；这只检验新宿主，不构成当前 AIR main 的 GPU 验收，也不替代长时间、Activity 重建或 device-loss/OOM 测试。不自动解锁或修改设备设置；真机先由用户正常解锁，16KB环境必须已有严格兼容策略。

## 历史范围与本次集成

固定的[历史工具/宿主档案](https://github.com/oahc09/cocosairjs/tree/b939f76241ac77fd99713658f11354d6b3ac64f1/tools/verify/runtime-interop-android)
仍可只读追溯，旧报告、失败记录、补丁、许可证及来源回执不重标、不覆盖。
本次只集成可维护工具与所需纯代码依赖，原始设备诊断不重新进入 main。
历史冻结 producer 的哈希和本次维护代码不同，旧报告不能直接作为新 producer 的 PASS。

本次完成 CPU/格式/导入依赖/源码绑定检查，不宣称新的 Android、Windows、真机、图形或内存实跑。
物理设备测试仍需显式可用设备与授权；Activity 重建、后台直接退出、device-loss/OOM、长期/性能/全资源无泄漏、ARM64 16 KB 硬件及发布验收不在本次完成范围。

## 宿主后台退出专项（2026-11-01）

MystralNative 功能分支在 `b3786ab6` 上修复了停止状态下的退出请求：使用 SDL3.2.30 的生命周期 `nativeSendQuit()`，取代只投递普通 QUIT 的自定义 JNI。旧 x64 APK 的前台退出通过，HOME/Settings 后两次退出均在原10秒内失败；新 x64 候选在同一官方16KB模拟器的三项均通过，退出观察为627/589/579ms。ARM64真机 V2520A/API37/实际4096页三项也通过，为328/333/578ms。不得将这些观察时间作为跨设备性能对比。

每项均先验证真实 AIR draw/可信输入和独立系统呈现，再检查实际 STOPPED；Settings 还须有真实 Surface 销毁。后台退出没有通过重新拉回前台协助。原 native exit0、完整拆卸、SDL返回后才清理PID，受管原生API及Context/ANW引用最终为0。独立审计复核9组记录及1749输入/证据哈希，逐RGBA/alpha/原坐标裁图一致，包含3张真机P3整屏ICC重放。原始失败、安装拦截/输入超时和环境启动失败均保留。

两ABI构建、签名、29资产、仅2SO、16KB ELF/RELRO/ZIP与static链接闭包均通过。测试固定使用原 SDK `417509cb...` 作为宿主回归夹具，**不代表当前 AIR main SDK 的 GPU/Android 验收**。工具当前 main 的CPU/辅助回归11项通过；旧普通PR的文件符号链接环境限制未在本专项中更改或重标。

专项模拟器临时严格策略已恢复，进程及日志写入句柄已关闭；手机未改凭据、锁屏/系统超时或权限设置。用户已授权本轮本地Git提交，不push；旧验收记录的生成时状态不改。Activity重建、进程回收、device-loss/OOM、长期/功耗/性能、全部分配无泄漏、实际ARM64 16KB及发布门禁仍需独立验收。

## Activity 重建候选（2026-11-01）

`runtime-interop-android-recreate.py` 必填 `--serial`、`--apk`、`--host-source`、`--out`、`--expected-page-size`，可选 `--cycles=1|2|3`（默认2），仅 `--install` 才安装专用debug包。`runtime-interop-android-recreate-audit.py` 使用可重复的 `--report=<closed.json>` 和 `--out=<新目录>` 离线复核；原退出10秒、新会话就绪30秒、呈现/输入15秒分别有界，缺步骤不通过。

MystralNative 在本地后台退出修复 `746994a` 上继续实现真实 Activity.recreate 冷会话重启。每个Activity使用独立epoch、runId、目录和token，保存父会话；JNI回调固定到原实例，原生owner租约排除并发Runtime，旧Surface回调不能覆盖或清理新窗口。Android音频不再沿用macOS专用泄漏规避，VIDEO/EVENTS/GAMEPAD/AUDIO配对释放；V8销毁时显式完成剩余弱引用的native释放。

这保持同PID并重新加载场景，**不保留任意JS堆/场景状态**。仅debug APK接受single-top Intent中的 `--ez mystral.debug.recreate true`，实际调用框架recreate，不模拟Surface，不修改“不要保留活动”等全局设置。采集器等待旧native exit0、完整拆卸、lease释放和SDL实际返回，然后才接受新owner；每阶段重新验证系统画面与可信输入。

官方实际16KB模拟器已通过连续2次重建/3会话，初始与后续native/wrapper init均为0，旧API引用及Context/ANW/SDL已用子系统在边界归零；同最终x64 APK的前台/HOME/Settings退出回归3/3通过。ARM64候选完成构建、签名、16KB静态与同源映射核验后，在V2520A/API37/实际4KB真机也完成2次重建/3会话，PID25680与新epoch1/2/3分别隔离，三次新会话真实输入/绘制frames130/131/138；该包三项退出回归也通过。

模拟器及手机联合独立审计6会话、480输入/证据哈希通过，三张真机P3整屏使用原ICC重算，整个RGBA、alpha、原坐标裁图逐像素相符，六张图的bounds均在实际原图范围内。失败基线、修正前候选及首次物理输入超时原件保留；首次真机失败尚未进入recreate，新尝试采用相同预算、同APK和同源码，不放宽门槛或重标旧FAIL。

本候选仍使用历史SDK `417509cb...` 检验新宿主，不是当前AIR main GPU验收。本批 Activity 源码、工具及验收说明按用户要求仅作本地提交，不 push；原始验收记录保留生成时状态。进程回收、device-loss/OOM、完整状态恢复、长期/性能、实际ARM64 16KB及Windows V8 13重采仍在范围外。

## 后台进程终止与冷恢复专项（2026-11-14）

`runtime-interop-android-process-recovery.py` 必填 `--serial`、`--apk`、`--host-source`、`--out`、`--expected-page-size`、`--termination=am-kill|uid-sigkill`；可选 `--cycles=1|2|3`（默认2）和显式 `--install`。两轮默认依次使用 HOME、Settings。确认目标 Activity 实际 STOPPED、唯一专用包 PID 和原 task ID 后，才执行所选终止操作；`uid-sigkill` 仅使用该 debug 包自己的 UID，对刚核对的 PID 执行 `/system/bin/kill -9`，不使用 root、不修改系统进程保护设置。

采集器要求旧 PID 在原10秒内消失，原任务仍包含保存的 Activity 状态，然后只用 `am task focus <原taskId>` 恢复，不重发入口、run_id 或 case_id。新进程必须继承父会话、创建不同目录/token，重新加载原 demo，并完成真实绘制、可信中心触摸及系统截图。独立审计要求恢复后的完整场景在原30秒内就绪，UI采集/输入/呈现不超过原15秒。被终止的旧进程不应报告正常 native exit 或析构归零；仅最后一个存活会话通过 `/finish` 正常退出，并核验完整 native/SDL 拆卸，再执行专用包清理。

初次 `am-kill` 在16KB模拟器通过；真机 Activity 已 STOPPED，但原10秒内进程未消失，保留 FAIL。独立诊断观察到 vivo 将其保持为 `LAST_ACTIVITY`、`cached=false`，并标注 `upgrade-workingStateProtect-audio`。这表明该时点的系统保护阻止了本次 `am kill`，不把它改写为宿主恢复失败或 PASS，也未据此修改音频实现。

随后显式选择 `uid-sigkill`，先重新通过16KB模拟器及独立审计，再验收同源码 ARM64 真机，两边各两次终止/三会话通过：

| 环境                | 实际页大小 | 三个 PID              | 保留 task ID | 三会话可信输入时的实际帧 |
| ------------------- | ---------- | --------------------- | ------------ | ------------------------ |
| 官方 x86_64 模拟器  | 16384      | 4530 → 4681 → 4842    | 39           | 135 / 138 / 135          |
| vivo V2520A / ARM64 | 4096       | 29793 → 30168 → 30617 | 49           | 133 / 136 / 134          |

联合独立审计6会话、790输入/证据哈希通过；真机三张P3整屏使用原ICC重算，全图RGBA、alpha和原坐标裁图一致。两次旧进程均无正常拆卸证明，旧 session/lifecycle/events/report 文件在恢复后逐字节不变；新进程原生和wrapper初始计数为0，最后会话正常拆卸的原生引用、Context/ANW与SDL已用子系统归零。日志进程及专用进程物理关闭。

两ABI重新构建、签名、29资产、仅2SO、static闭包及16KB ELF/RELRO/ZIP通过；APK字节分别仍为 `f0e93635...` / `efe2b6fa...`，新源码映射绑定当前 CMake 的可选 Windows 测试配置。此次无需修改宿主运行时代码，复用已提交的 Activity 冷恢复机制。采集器、审计器及说明随工具源码交付。

原始目录位于显式 `RuntimeBase` 下的 `android-process-recovery-*`；联合审计为 `android-process-recovery-combined-audit-attempt-1/report.json`。保留初次真机 FAIL、诊断、全部重试与审计尝试。这是**受控后台进程终止后的原任务冷恢复**，不认证真实低内存 LMK/OOM、任意JS状态持久化、当前AIR main SDK、长期资源/功耗或实际ARM64 16KB硬件。
