# ARM64 真机短会话生命周期原始记录

本档案保留 2026-10-28 五次真实采集尝试和独立离线审计的全部原始记录，共 1,129 文件、28,456,008 字节。失败尝试、命令 stdout/stderr、PNG/ICC、日志、实际 producer、审计及独立重放均逐字节复制；原时间、状态、路径和指纹不改。

`manifest.json` 将原路径 `originalFile` 映射到 `files/<originalFile>`，逐项保存字节数和 SHA-256。`source-inventory.json` 保留精确选取范围。正式通过的原报告为 `output/runtime-interop/android-arm64-phone-lifecycle-attempt-5/report.json`，独立审计为 `output/runtime-interop/android-arm64-phone-lifecycle-audit-1/report.json`；在本档案查找时加 `files/` 前缀。

```sh
node tools/verify/runtime-interop-archive.cjs --check=docs/evidence/runtime-interop-physical-lifecycle
```

该命令只核对档案完整清单、文件字节与归档工具身份，不连接手机、不重跑 GPU、不重新标记业务结果。APK、SDK、宿主检出和已安装依赖是未修改的物化输入，不随档案复制；原报告保留其哈希和版本。完整重放需在独立工作区恢复原路径，并准备匹配输入，不能将固定了原目录语义的历史 producer 直接从 `files/` 层级执行。

本轮通过范围为一台 ARM64 / 4 KB 手机、同一 Activity 的初始画面、HOME、Settings/真实 Surface 毁建和用户正常解锁后的恢复。独立审计21项及594证据哈希通过，9张P3全屏ICC重放逐RGBA/alpha/裁图一致，受管原生引用和Context/ANW最终归零。连续运行、Activity重建、后台直接退出、device-loss/OOM、长期压力、性能、实际ARM64 16KB和发布认证均未纳入本轮PASS。

入口见 [验收说明](../../reference/android-runtime-interop.md#arm64-真机短会话生命周期2026-10-28)和[绑定清单](../../../tools/verify/runtime-interop-android/host-patches/memory/physical-arm64-lifecycle-acceptance.json)。
