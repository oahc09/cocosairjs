# Mystral Android 累计宿主补丁候选 8

固定上游：`mystralengine/mystralnative` 的 `bafab09d599bd55aeb7433ba7131c3f320334c99`。

`mystral-android.patch` 包含当前全部 19 个已跟踪文件改动与 3 个新增文件，共 22 个文件；Gradle wrapper JAR 使用 Git binary patch 保留原始字节。导出没有暂存或修改宿主源文件。

在上游的新检出中应用，补丁路径按实际位置填写：

```sh
git checkout --detach bafab09d599bd55aeb7433ba7131c3f320334c99
git apply --check /path/to/mystral-android.patch
git apply /path/to/mystral-android.patch
```

本候选已经在 `verification-checkout/` 的全新固定基线执行上述检查与应用，并将全部 22 个文件逐字节哈希核对到导出时的宿主源码。结果见 `manifest.json`、`byte-comparison.json` 和 `commands.json`；命令的原始 stdout/stderr 一并保留。

`build-profile/` 完整保留构建配置、依赖校验清单和九份原始来源回执。路径与命令参数使用其定义的占位符；APK 身份、资产清单及模拟器运行结果必须另行绑定。`LICENSE-MYSTRAL.txt` 是固定上游 MIT 许可的原始字节。

本次通过的是补丁完整性、真实应用与字节一致性检查。它不单独代表 APK、退出生命周期、完整矩阵、arm64 或物理设备验收通过。后续宿主源码若再修复，应生成新候选，保留本目录。
