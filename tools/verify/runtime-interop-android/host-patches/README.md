# MystralNative Android 实验兼容补丁

本目录交付固定上游 `bafab09d599bd55aeb7433ba7131c3f320334c99` 的累计补丁、MIT 原文、构建 profile 和依赖回执。22 个文件包括通用 Canvas/DOM/WebGPU/V8 修复、Android HTTP/字体/SDL 入口及独立验收 APK；没有改 Cocos AIR SDK 或新增 AIR Android GFX 后端。

在新的独立宿主检出中应用：

```sh
git clone https://github.com/mystralengine/mystralnative.git <host-source>
git -C <host-source> switch -c codex/android-runtime-interop bafab09d599bd55aeb7433ba7131c3f320334c99
git -C <host-source> apply --check <repo-root>/tools/verify/runtime-interop-android/host-patches/mystral-android.patch
git -C <host-source> apply <repo-root>/tools/verify/runtime-interop-android/host-patches/mystral-android.patch
```

按 [build-profile.json](build-profile/build-profile.json) 和 [dependency-receipts.json](build-profile/dependency-receipts.json) 准备固定依赖，替换 profile 中的占位路径，再执行其完整 Gradle 命令。使用 Android 专用依赖目录，不覆盖桌面库；V8 是 Kudo 提供的第三方 Android 构建，须配套头文件、ABI 库和 snapshot。详细资产准备及设备命令见 [Android 说明](../../../../docs/reference/android-runtime-interop.md)。

[manifest.json](manifest.json) 仅证明累计源码补丁身份及其在全新基线的真实应用，包含 Gradle wrapper JAR 的 binary patch；22 个修改后文件均逐字节核对。[byte-comparison.json](byte-comparison.json)、[commands.json](commands.json)、原始 Git stdout/stderr 和 [verification-README.md](verification-README.md) 保留该次核对记录。它们不单独表示 APK 运行成功。

最终 APK、源码构建收据、同 SDK 字节和本轮设备报告由另外的 `acceptance.json` 绑定。当前验收仅限 x86_64/API37 模拟器、V8+Dawn、单 native device；真实 device.destroy 会退役 Surface，之后需要新建 Runtime。ARM64、真机、其他引擎、长时间压力和性能未验收。`subset:true`、`releaseReady:false` 保持不变。

`verification/demo-collector.cjs` 是额外输入/暂停恢复执行的只读源码快照，其原始字节哈希与 demo 报告绑定；不格式化或改写该证据副本。它只操作模拟器的专用 debug 包，记录一次同 PID/Surface 的 HOME 暂停恢复及两次系统输入，不构成 Surface 重建、多指或真机验收。

本目录与桌面 `runtime-interop/host-patches` 的历史冻结补丁分别保存；不把 Android 结果重标为桌面矩阵或发布质量。

后续 ARM64 手机的结果另见 [arm64-test-summary.json](arm64-test-summary.json)。六项 4 KB 页真机功能通过；16 KB 依赖兼容及额外后台恢复仍未闭合。该摘要不修改历史 x86_64 `acceptance.json` 的范围或状态。
