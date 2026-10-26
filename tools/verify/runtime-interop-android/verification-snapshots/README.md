# Android 互操作验收源码快照

本目录逐字节保存 ARM64 真机、`c++_static`、SDL 3.2.30 / 16 KB 专项使用的采集器、色彩与进程 helper、独立审计和依赖/构建脚本。`manifest.json` 记录每份副本的原路径、字节数和 SHA-256；原始 `output/` 文件和已采集报告未修改。

目录保留 `output/` 下的原相对层级。它是冻结的源码档案，不是新的直接运行入口：部分脚本通过 `__dirname` 定位仓库，或使用当次设备、输出目录和本机工具链路径。重放前按清单的 `originalFile` 恢复原层级，并准备对应 SDK、依赖、资产和设备；先阅读脚本的写入、安装、停止应用与构建行为。构建尝试脚本中的候选编号是历史记录，不能覆盖已有目录或当作任意候选的通用构建命令。

三个 matrix collector 与 `android-phone-process-table.cjs`、`android-phone-color-presentation.cjs` 和 `android-phone-color-normalize.py` 必须保持同目录。实际 16 KB 采集使用 `android-16k-collector-v1.cjs`，显式要求实际页大小并检查兼容回退关闭；另外两份 collector 保留此前 ARM64/shared 与 static-only 候选的证据身份。demo 仅覆盖当次可信输入及同 Surface 的 HOME 恢复，不代替完整矩阵或 Surface 重建验收。

历史脚本保留原始格式、路径和字节，不重新格式化或改写旧证据指纹。它们没有接入默认 CI 或 npm 运行时；快照存在本身不表示已在当前设备、源码或候选上重新执行。APK、原始图像、SDK/依赖二进制和构建缓存不随本目录提交，结果边界见 [Android 说明](../../../../docs/reference/android-runtime-interop.md) 与 [16 KB 验收清单](../host-patches/16k/acceptance.json)。
