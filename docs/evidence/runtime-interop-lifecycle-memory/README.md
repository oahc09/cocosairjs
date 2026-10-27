# 生命周期、内存修复与 ARM64 真机原始记录

本档案保存本轮实际采集的报告、原始系统图像与 ICC、命令 stdout/stderr、日志、源代码快照、独立审计、原生分配 trace、来源回执和实际 producer，包括失败、PARTIAL、未构建及工具失败尝试。每份文件逐字节复制；没有改写原报告的路径、时间、状态、fingerprint 或验收边界。

`manifest.json` 将原仓库相对路径 `originalFile` 映射到本目录的 `files/<originalFile>`，记录字节数与 SHA-256。`source-inventory.json` 保存精确选取范围、目录分组及排除类别。原文件仍保留在本地 `output/`；查看归档中的同路径文件时，先加 `files/` 前缀，不能将原 JSON 引用失效误作新执行或重新标记 PASS。

```sh
node tools/verify/runtime-interop-archive.cjs --check=docs/evidence/runtime-interop-lifecycle-memory
```

该检查无设备或网络操作，只核对档案的完整文件清单、原始字节及 producer 身份。它不执行 GPU 测试、不重新评估应用结果，也不等同发布门禁。

APK、SO、EXE、原生符号库、linker MAP、固定 SDK/依赖二进制、AVD 用户数据、完整 apply clone 和编译缓存不随此档案提交。它们是物化的执行/构建输入，原收据仍保留其来源、版本、哈希或 Build ID。完整重放须先在独立工作区恢复原路径及其明确前提，并准备匹配的物化输入；档案本身不能凭空完成原生执行。不要将临时脚本直接从归档层级运行，部分 producer 固定了原 `__dirname` 或本轮设备/输出路径。

本轮范围：x64 官方 16 KB 模拟器生命周期及内存有界复测；同 APK 六项图形回归；Windows 原生 API/跨帧控制；ARM64 实际 4 KB 真机六项矩阵与首份 15 分钟前台内存基线。手机 HOME/Settings/安全锁屏、实际 ARM64 16 KB、长期/功耗/全平台/全部分配无泄漏仍未认证。历史 open finding 和未提交状态取原记录生成时点，后续 Git 交付状态由独立回执记录。

入口见 [Android 验收说明](../../reference/android-runtime-interop.md)、[累计内存修复源码与运行绑定](../../../tools/verify/runtime-interop-android/host-patches/memory/acceptance.json) 和 [ARM64 真机运行绑定](../../../tools/verify/runtime-interop-android/host-patches/memory/physical-arm64-memory-acceptance.json)。
