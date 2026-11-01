# Android 原生互操作工具

这些工具在独立原生宿主中运行相同 AIR SDK/探针，不把 Android/JSB 加入 AIR 默认 Web runtime。
工具保持 `subset` 与 `releaseReady=false`，不默认进入 CI。

## 前置条件与授权

需要明确授权的 ADB 设备、已核来源的 APK/宿主源码/构建回执、Node、PNGJS 和 Python/Pillow（ICC 路径依赖 LittleCMS）。
构建辅助脚本还要求现有 Android SDK/NDK/JDK/Gradle 或 Windows PowerShell 工具链；不自动安装依赖。
`--install` 会安装指定 APK，生命周期测试会操作应用前后台/Surface并收集进程、截图和内存数据，执行前必须确认设备与副作用。
不要在用户日常手机上无授权运行。真实安全解锁必须由用户完成，不能借模拟器专用命令绕过。

## 入口与输出

| 入口（`tools/` 下）                                                           | 用途与写入边界                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `build/runtime-interop-android.cjs`                                           | `--out=<新目录> --bundle=<SDK>`；逐字节暂存 SDK、shader、探针和模型夹具，写 asset manifest；不执行 Gradle/安装                             |
| `build/runtime-interop-android-host.ps1`                                      | 调用显式现有宿主构建工具，保存源码/SDK/APK 构建身份；先查看脚本参数与本地工具链                                                            |
| `build/runtime-interop-android-finalize.py`                                   | 对显式构建产物生成来源/打包回执；不提供未执行的设备结论                                                                                    |
| `verify/runtime-interop-android.cjs`                                          | `--serial --apk --assets --build-report --out` 必需；可选 `--case=probes\|air\|pbr\|skin\|ui\|compute` 或 `--matrix`；`--install` 显式安装 |
| `verify/runtime-interop-android-lifecycle.cjs`                                | `--serial --apk --out`；模拟器生命周期及有界连续运行，默认实际页大小16384、900秒；0秒仅诊断                                                |
| `verify/runtime-interop-android-memory.cjs`                                   | 生命周期入口加 `--baseline-report=<旧报告>`；真实引用计数/内存比较，旧报告必须独立保留                                                     |
| `verify/runtime-interop-android-phone-memory.cjs`                             | 真机前台内存基线，默认4096页、900秒；拒绝 emulator serial                                                                                  |
| `verify/runtime-interop-android-phone-lifecycle.cjs`                          | 真机同Activity短会话；默认4096页，手动解锁等待180秒（可选60..600秒），不代替长时测试                                                       |
| `verify/runtime-interop-android-background-exit.cjs`                          | 定向检查 foreground/home/settings 下直接正常退出；显式 APK、匹配宿主源码、实际页大小和新输出目录，`--install` 才安装专用 debug 包          |
| `verify/runtime-interop-android-{lifecycle,memory,phone-lifecycle}-audit.cjs` | `--report=<已关闭报告> --out=<新目录>`，离线独立核验并写新审计目录，不覆写原报告                                                           |
| `verify/runtime-interop-android-phone-lifecycle-icc-replay.py`                | 对保留全屏图片与 ICC 数据独立重放，写独立报告；不替代设备采集                                                                              |
| `verify/runtime-interop-archive.cjs`                                          | 按明确 inventory 复制精确原件到新 archive；`--check` 只读核验，不发布档案                                                                  |

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
