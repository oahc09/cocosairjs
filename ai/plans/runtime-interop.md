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

## Android 生命周期专项（2026-10-26）

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| 锁屏、后台与实际 Surface 重建 | completed | 旧候选真实重建后黑屏已复现；9 文件宿主修复后，同 PID/会话自动恢复原画面，再接受真实触摸，三项通过 |
| 连续运行 | completed | 官方实际 16 KB 环境运行 903.7 秒、31 个连续样本全部通过，无补样；帧数 1637→53855 |
| 资源退出与独立复核 | completed | 正常 native exit0、GPU/窗口清理调用、SDL 返回、日志物理关闭和专用进程清理通过；17 项/1068 文件离线复核与同 APK 六项图形回归通过 |
| 内存与逐对象资源归属 | open | 总 PSS 215839→239963 KiB，Native Heap PSS 51526→82394 KiB；既有 canvas texture registry API 引用释放路径需进一步核算，不能给出无泄漏结论 |

本轮先使用已推送 b98101a 的 SDL 3.2.30 / c++_static x64 APK 与隔离官方 16 KB 模拟器。启动时 ADB 无物理设备；ARM64 真机验收单独计数。SDK/stage4 保持原始字节，未授权合并或发布。

最终使用相对 b98101a 的独立生命周期补丁与新 x64 APK `dc7c4d95...`，ARM64 `560343c4...` 仅构建/静态检查。交付与剩余资源问题由 `tools/verify/runtime-interop-android/host-patches/lifecycle/acceptance.json` 绑定，整体为 `FUNCTIONAL_PASS_WITH_OPEN_MEMORY_FINDING`。原失败、短诊断 PARTIAL 与不完整环境关闭记录保留；最终自有模拟器已关闭、锁屏策略恢复。本轮源码尚未提交推送。

## 原生引用与内存增长修复（2026-10-27）

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| 引用归属及旧候选分配轨迹 | completed | 已确认 canvas texture registry/API 引用与多 view 释放缺口；旧 APK 的 60 秒 heapprofd 调用链指向 SwapChainTexture 创建及 TextureInfo registry，原 trace/健康统计/匹配 BuildID 符号保留 |
| 帧资源释放与过期包装对象校验 | completed | 私有 lease token、统一一次释放、Surface backing 借用、V8 两遍 weak callback；原 8 项与两个跨帧真实控制通过，旧失败保留 |
| 新候选 16 KB 有界复测 | completed | 同 SDK/stage4 完整 904.1 秒/31 样本；332015 个 managed native API refs 全部配对、cleanup0，Canvas峰值1，无V8未捕获异常；NativeHeap PSS增量旧+30868 KiB→新-26 KiB |
| 回归及独立交付 | completed | 同新 APK 六项图形矩阵、Windows最终构建/三组API控制通过；双ABI静态、11路径补丁freshapply/116映射、Life17+memory23审计通过 |

继续保持 SDL 3.2.30、c++_static、V8 11.6.189.22 static/embedded；不改 SDK、版本或旧已验收 collector 字节。新 memory wrapper 调用冻结生命周期入口，再独立消费实际原生计数，不重写其截图、时刻及退出合同。仍无真机连接，本轮不提交、推送、合并或发布。

结果由 `tools/verify/runtime-interop-android/host-patches/memory/acceptance.json` 绑定，明确修复本次帧引用保留问题，不改旧 `FUNCTIONAL_PASS_WITH_OPEN_MEMORY_FINDING` 历史记录。Total PSS 实际仍 +2074 KiB，wrapper/native API/CPU weak metadata/驱动驻留分别解释；不承诺全分配无泄漏。最终日志实际出现一次 status5 瞬时 acquire→discard→status1恢复，null-window hold return为0次，后者未专项触发。新ARM64包只构建/静态，新APK4KB实跑、Activity重建、全平台/长期/性能/发布门禁未验收；自有两AVD策略已恢复并关闭，源码未提交。

## 最新修复候选 ARM64 真机验证（2026-10-27）

| 步骤 | 状态 | 完成标准 |
| --- | --- | --- |
| 当前 ARM64 包六项图形矩阵 | completed | 用户重接10CG4G0BE1003M8，V2520A/API37/ARM64/实际4096页；当前c6d833包六项closed PASS、physicalAcceptance=true，16KB运行标记仍false |
| 真机首次前台资源/内存基线 | completed | 91次可信心跳覆盖900.77秒、32真实图、同PID25763；328067引用配对cleanup0，Canvas峰值1，无GPU/V8错误，NativeHeap PSS49904→49582 KiB |
| 独立复核与证据交付 | completed | 六矩阵86项/301hash及前台860项/2457hash通过，P3整图独立ICC逐RGBA重放一致；9341源/当前116源码/c6包/SDK/stage4绑定 |

手机测试不修改凭据、锁屏策略、系统超时或设备权限。前台基线使用10秒真实tap保活、30秒图片、300秒meminfo；后续同手机对照须沿用该合同。HOME/Settings及安全锁屏需另行保留短会话证据，安全解锁仅由用户正常操作，不调用模拟器专用dismiss或套用16KB模拟器结论。

最终证据单独保存为 `tools/verify/runtime-interop-android/host-patches/memory/physical-arm64-memory-acceptance.json`，不重写此前等待解锁或模拟器记录。短测1在锁屏背后未进入渲染，其FAIL及e9原producer保留；用户正常解锁后才用加preflight的9341新尝试完成。只有ARM64/4KB六矩阵及前台基线通过，手机HOME/Settings/secureLock、实际ARM64 16KB、长期/性能/全资源无泄漏仍未认证；本轮无native/SDK修改、未提交推送。

## 本轮 Git 交付（2026-10-27）

MystralNative累计生命周期/内存修复已提交为 `b3786ab6d2926f031dfb301700f9a80b866cbde6` 并推送至 `oahc09/mystralnative:feat/cocosair-webgpu-interop`，原11路径与验收源码相同。Cocos AIR本提交在 `feat/webgpu-runtime-interop` 汇集测试工具、源码补丁、摘要及7791份逐字节原始记录；独立Git回执与档案清单记录交付，不重写旧记录的未提交状态。归档可只读重算，构建/设备二进制须依原收据单独恢复。此次交付不新增运行结果，不升级未执行项目，也不合并、发版或变更SDK。
