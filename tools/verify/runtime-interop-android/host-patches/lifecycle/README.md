# Android 同 Activity Surface 生命周期修复

固定基线：`b98101acd368107829a7aa4c0481084f2ecefd5e`（`oahc09/mystralnative` 的已推送 SDL 3.2.30 / static C++ 候选）。在该基线的新检出中先执行 `git apply --check <patch>`，再执行 `git apply <patch>`。

`mystral-android-lifecycle.patch` 修改九个文件，其中 `include/mystral/platform/android_surface.h` 为新增文件；基线不存在该文件，未伪造空的基线副本。`base-source/`、`modified-source/` 和 `manifest.json` 保留修改前后原始字节。

修复从真实 Java Surface 回调取得自持有的 ANativeWindow 引用与 generation。SDL/JavaScript owner 在线程内退役旧 presentation Surface、恢复新 Surface 并重放已有 canvas 配置；instance、adapter、device、queue 和 JavaScript 会话保持。SDL 事件派发到 resize/输入 JavaScript 回调前同样执行准备，缺有效 Surface 时不派发绘制相关 JavaScript；QUIT 仍可处理。UI 线程不执行 Dawn 释放或重建。

构建继续使用完整官方 SDL 3.2.30、V8 11.6.189.22 static/embedded、`c++_static`、SDK build216 与 stage4。固定依赖、原始许可和来源回执沿用相邻 `../16k/` 档案，由 `build-profile.json` 哈希引用；本目录另附 Mystral 原 MIT 许可，不分发依赖或 APK 二进制。

`compiled-source/` 保存 x64 新候选的 source-before/after/verified 原始清单。导出已在新的本地 clone 的精确基线上真实执行 apply-check 与 apply，并逐字节核对九个修改文件和完整 116 项编译源码映射。`export.cjs` 是本次实际导出 producer，`raw/` 保留 Git 命令结果；旧宿主检出、SDK、资产及历史冻结包不变。

这是源码与应用一致性交付，不单独代表生命周期运行验收通过。范围只覆盖同 Activity 的真实 Surface 销毁与恢复，不扩大为 Activity 重建、设备丢失恢复、任意 Android/ABI、性能或无泄漏证明。实际锁屏、后台、Surface 重建、连续运行与资源释放报告需另行绑定，ARM64 构建/运行也独立记录。
