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
| `verify/runtime-interop-android-{lifecycle,memory,phone-lifecycle}-audit.cjs` | `--report=<已关闭报告> --out=<新目录>`，离线独立核验并写新审计目录，不覆写原报告                                                           |
| `verify/runtime-interop-android-phone-lifecycle-icc-replay.py`                | 对保留全屏图片与 ICC 数据独立重放，写独立报告；不替代设备采集                                                                              |
| `verify/runtime-interop-archive.cjs`                                          | 按明确 inventory 复制精确原件到新 archive；`--check` 只读核验，不发布档案                                                                  |

所有参数用 `--name=value` 形式，布尔标志例外。每次采集/审计使用新的输出目录，保留失败尝试。
本地 ICC/进程辅助工具位于 `verify/runtime-interop-android/lib/`，无需恢复历史 `verification-snapshots/output/` 才能加载采集器。
暂存 SDK 必须通过 [源码与产物绑定](runtime-interop.md#source-map-绑定与信任边界)，不能拿旧 APK 的验收证明当前 SDK。

## 历史范围与本次集成

固定的[历史工具/宿主档案](https://github.com/oahc09/cocosairjs/tree/b939f76241ac77fd99713658f11354d6b3ac64f1/tools/verify/runtime-interop-android)
仍可只读追溯，旧报告、失败记录、补丁、许可证及来源回执不重标、不覆盖。
本次只集成可维护工具与所需纯代码依赖，原始设备诊断不重新进入 main。
历史冻结 producer 的哈希和本次维护代码不同，旧报告不能直接作为新 producer 的 PASS。

本次完成 CPU/格式/导入依赖/源码绑定检查，不宣称新的 Android、Windows、真机、图形或内存实跑。
物理设备测试仍需显式可用设备与授权；Activity 重建、后台直接退出、device-loss/OOM、长期/性能/全资源无泄漏、ARM64 16 KB 硬件及发布验收不在本次完成范围。
