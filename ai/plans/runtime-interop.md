# 通用 WebGPU Runtime 兼容性实施

范围：首轮桌面工作已完成。用户现明确要求Android原生适配与APK；ADB当前仅模拟器，用户确认先完成APK和模拟器实跑、真机稍后。保留桌面阶段全部原始证据和补丁，不重标为Android结果。

| 步骤                                           | 状态      | 交付与验收                                                                             |
| ---------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| 独立分支与工作区                               | completed | 从 469a9e6574b0 创建 feat/webgpu-runtime-interop；保留原工作区并发改动                 |
| 五组共享行为探针、AIR 冒烟、浏览器与原生采集器 | completed | 通用行为与引擎集成分开；不修补引擎或宿主以取得通过                                     |
| 桌面实际执行与定向回归                         | completed | Chrome/Edge 五组及 AIR 冒烟通过；Mystral v0.1.6 完整返回实际兼容失败；四项工具回归通过 |
| 文档与交付复核                                 | completed | 工具入口、写入范围、运行结果与后续阻断已登记于对应台账                                 |

约束：不新增默认 CI 负担，不改版本，不暂存、提交、推送或发布。独立构建仅用于当前源码验证；构建计数按现有规则推进。测试不扩大到完整示例 campaign 或发布门禁。

当前结果与保留边界见[执行台账](../ledgers/runtime-interop.md)。本轮完成表示探针及桌面执行完成，不表示 MystralNative 宿主兼容已完成。

## 继续推进

| 步骤                       | 状态      | 交付与验收                                                                                                 |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| 独立设备诊断与原生呈现采集 | completed | Shader 失败不屏蔽 GPU 接口诊断；Windows.Graphics.Capture 与握手在未修改 Mystral 的真实 WebGPU 控制场景通过 |
| 冻结后桌面复采与边界更新   | completed | Chrome/Edge 及原生均重新采集；前轮证据保留为历史；原生宿主实际失败完整记录                                 |
| MystralNative 桌面宿主修复 | completed | 官方 main bafab09d599b 独立分支；最终 build9 的同一 SDK、五组行为、AIR/WGC、构建身份与物理退出全部通过     |

桌面宿主完成标准：同一未修改 AIR SDK、五组行为及 AIR 场景通过，真实 WGC 客户区 PNG 与物理退出证据完整；保留全部失败尝试。宿主源码补丁和冻结基线需随本仓库交付，不能只留忽略目录中的手工状态。

最终产物已按该标准验收：`tools/verify/runtime-interop/host-patches/` 保留六文件补丁、MIT 许可、固定依赖/配置和源码/EXE manifest；全新基线应用逐 hash 一致。三宿主正式记录以台账最后一节为准，早期失败与阶段 PASS 均保留为历史。本轮桌面目标完成，不扩展为 Android、完整多引擎/场景矩阵、性能或发布验收。

## 桌面场景矩阵扩展

用户继续推进后，增加手动 `--matrix` 的四个隔离场景，不改变默认最小验收或 CI。

| 步骤                             | 状态      | 完成标准                                                                            |
| -------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| PBR/骨骼/UI/Compute 与双阶段呈现 | completed | 三端四场景全部通过；真实资产/动画/文字/调度，30张独立PNG及数值/状态/类型资源合同    |
| 宿主通用缺口修复和冻结重编       | completed | B12补齐真实字体、2D resize/上传、间接调度/动态offset及origin，SDK与场景输入保持不变 |
| 三宿主矩阵复采、补丁与文档更新   | completed | 三份正式matrix均completed/PASS，42输入、945源码、30PNG与8文件补丁及退出链独立复核   |

MaterialInstance 使用项目既有 destroy/pass 清理合同，保留 raw isValid，不将其错误等同普通 Asset；不删资源追踪。Compute 证明链为真实 GFX compute → GPU readback → CPU 材质更新 →呈现，不声明 zero-copy。

UI视觉复核发现裁切后，增加固定15点完整覆盖检查，旧B11图只8/15而新B12图15/15；旧报告和所有失败原件保留，没有重标历史PASS。最终以台账的矩阵扩展阶段为准，仍为subset、无Android/其他引擎/性能/发布验收。

## Android 原生适配

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| 环境、设备和ABI确认 | completed | emulator-5554，API37，真实x86_64，ro.kernel.qemu=1，Vulkan声明可用；真机未连接 |
| 原生宿主与APK构建 | completed | APK10紧凑27,055,266B，V8+Dawn/SDL/Skia、真实ABI/snapshot、同SDK字节；签名及源码/29资产稳定 |
| 模拟器运行与原始证据验收 | completed | 最终同APK六case全PASS、30PNG、真实清理/SDL退出0；默认demo系统输入/同PID后台恢复也PASS，失败原件保留 |
| 独立复核与累计补丁交付 | completed | 干净基线22文件含binary wrapper真实apply逐字节一致，83项独立检查/229证据/152当前输入及真实退出复核通过，acceptance单独绑定APK10 |
| ARM64 真机图形功能专项 | completed | V2520A/API37/ARM64/4096-byte页，同SDK/stage4/Host3cea6b4，六case全PASS，75项图像与15项来源/退出独立复核 |
| 真机额外输入与后台恢复 | 待手动解锁 | 已见trusted输入；过渡时序修正后手机自动锁屏，需有效前台Surface后继续，未假定宿主恢复成功或失败 |
| 16KB依赖/环境验收 | 未闭合 | SDL3/V8实际LOAD4096需重建或升级，runtime/C++LOAD16384；不以4KB真机功能通过代表16KB或发布通过 |

Android使用独立debug包com.mystral.engine.interop（版本不改），真实SurfaceView与二进制assets。最终APK10六项矩阵及普通启动demo均实际PASS；V8 shell历史失败未替代APK结果。累计宿主补丁单独保存，不改旧桌面冻结补丁或重标历史报告。保持subset/releaseReady=false，ARM64、真机、长期压力与性能尚未验收；每次APK/source/asset变更需新候选与新设备证据。

## c++_static 切换（2026-10-26）

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| 依赖闭包与静态V8启动 | completed | C++集中runtime，SDL纯C保留；6文件实现static默认/混用拒绝/embedded与external真实分支 |
| ARM64/x64构建与链接核验 | completed | 新两ABI APK仅2SO、无共享STL/V8动态NEEDED，map实证NDK静态库；同SDK/stage4，旧产物保留 |
| 模拟器实际六项验收 | completed | x64真V8 11.6.189.22/embedded、WASM2factory/图形矩阵/双路图/正常exit全PASS |
| 独立审计与增量补丁 | completed | 59项审计/395哈希证据，正常link/map单套对象、2SO/boot identity/source115及6文件freshapply通过，独立acceptance绑定，不改旧冻结档案 |
| 新静态ARM64候选真机运行 | 待设备连接 | 当前ADB仅本轮启动的emulator，不能复用旧shared APK的ARM真机PASS |

## SDL 3.2.30 / 16 KB 继续实施（2026-10-26）

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| 完整官方SDL升级、保持静态CPP/V8 | completed | 默认mystralSdlVersion3.2.30，新依赖根AAR/Java/headers/native/Prefab同源，不覆盖旧包 |
| ARM64/x64 APK及所有SO16K静态核验 | completed | 115source29assets/签名/LOAD+RELRO/zipalign/only2so且无共享Cpp或外置snapshot全PASS |
| 官方16KB实际环境六项 | completed | 真实getconf16384/page_shift14，compatfatal/disabledtrue初末，最终6case+双图+正常退出全PASS |
| 同APK4KB回归 | completed | 独立4096页环境完整6case通过，不混用16KB runtime标记 |
| 关闭环境后独立审计与累计源码包 | completed | 主107项/632hash、build/source22项、freshapply6/6及新acceptance全部绑定，旧失败保留 |
| ARM64 16KB硬件运行及全发布门禁 | 未执行 | 当前已完成范围仅x64官方16KB模拟环境，不宣称ARM64 runtime或releaseReady |

## 已有代码提交与推送（2026-10-26）

用户另行授权提交和推送已有实现，覆盖本任务两个仓库的功能分支。MystralNative 六文件已在 `feat/cocosair-webgpu-interop` 提交并推送为 `b98101acd368107829a7aa4c0481084f2ecefd5e`，当前字节与 SDL 3.2.30 验收清单一致；不修改旧验收记录。Cocos AIR 同时交付探针、构建/捕获工具、冻结宿主补丁、依赖回执、验收源码快照和文档，保留原始失败及 `subset/releaseReady` 边界。此授权覆盖 Git 交付，不包括合并、发布或新增运行验收。
