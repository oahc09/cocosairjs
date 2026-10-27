# Android 资源引用与 Surface 生命周期累计修复

固定基线为 `b98101acd368107829a7aa4c0481084f2ecefd5e`（`oahc09/mystralnative` 已推送的 SDL 3.2.30 / static C++ 候选）。本包不是直接针对原始上游基线。新检出先执行 `git apply --check <patch>`，再执行 `git apply <patch>`。

`mystral-android-memory.patch` 包含 11 个路径：10 份已有文件修改和新增 `include/mystral/platform/android_surface.h`。`base-source/`、`modified-source/` 与 `manifest.json` 保留原始字节；新增头文件在基线不存在，其 before 字段为 null，不伪造空基线副本。旧 lifecycle、static-only、16 KB 补丁及所有失败记录保持。

Canvas lease 在到期前返回同一个 JavaScript texture 对象。它只拥有 `GetCurrentTexture` 返回的 API 引用；实际 backing 归 Surface。自动到期及显式 canvas destroy 不销毁共享 backing；旧 texture/view 的私有 lease token 失效，API 引用逐一释放，重复 destroy 幂等。普通 `device.createTexture()` 保持独立生命周期，其 destroy 真实调用 Destroy 和 Release。command encoder、pass、command buffer 消费后失效，不能二次使用已经释放的裸句柄。RT 的跨模块输出纹理入口使用同一 resolver。

`RESOURCE_SNAPSHOT` 的 18 类计数记录 bindings 账本拥有的实际 WebGPU API 引用 acquire/release/live/peak。Context/device/adapter/queue 的借用引用与内部临时辅助命令不混入这些计数；它们按各自所有权释放。native API 引用释放、JavaScript wrapper 存活、CPU weak metadata、驱动驻留内存是不同事实，不能把 native live=0 等同于所有对象或全部内存已释放。wrapper/token 按真实 GC finalizer 收尾，仍被 JavaScript 持有的失效 wrapper 不能提前 free。V8 既有 Isolate 最终弱 metadata 析构能力未在本包扩展成完整账本，不声称所有对象绝对无泄漏。

V8 weak 第一遍回调仅 Reset 并安排第二遍；第二遍执行 native Release、外部内存扣账和删除。原每资源 16384 的外部内存估算及 GC 阈值不改。Android 异常按 `MystralJS` 输出有界 message/stack，资源 JSON 用 512 字节 PART 包保留完整内容；这些诊断不改异常传播、调度或门槛。

Android 真实 Surface 可能在 owner 线程准备之后、JavaScript 帧执行期间消失。只有 Timeout/Outdated/Lost 且 device/configuration 仍有效时，当前帧才使用同尺寸、格式、usage 的临时纹理，计入同一 Canvas 账本并正常释放；该帧不 SurfacePresent、不作为内部截图。Error、设备丢失和 OOM 不转成静默成功。累计 discard、恢复和清理状态另行限频记录；真实 PixelCopy/ADB compositor 和原恢复时限仍是独立运行门槛。

Surface 暂不可用时，bindings/JS 暂停；Context 最多保留一个旧 presentation Surface 与一个显式 ANativeWindow 引用。新窗口 ready 或正常 teardown 后在 SDL/JavaScript owner 线程退役，device 销毁前也必须释放 held Surface。没有无界 retired 队列，UI 线程不执行 Dawn 释放，不把此范围扩大为 Activity 重建或任意设备丢失恢复。

构建保持完整官方 SDL 3.2.30、V8 11.6.189.22 static/embedded、`c++_static`、SDK build216 与 stage4。固定依赖、完整原始许可与回执通过 `build-profile.json` 哈希引用相邻 `../16k/` 档案；本包另附基线原 MIT 文本，不分发 SDK、依赖二进制或 APK。

`compiled-source/` 原样保存 x64 `android-memory-x64-build-attempt-7` 的 source-before/after/verified 清单。新的本地 clone 在精确基线真实执行 apply-check 与 apply，核对全部 11 个变更路径及完整 116 项编译源码映射。`export.cjs` 是实际 producer，`raw/` 保存命令原件。旧宿主检出、SDK、资产及旧冻结包未因导出而修改。

本包证明源码、补丁应用和编译输入一致，不单独表示 900 秒运行、真机、ARM64、所有 GPU 后端、性能或发布验收通过。运行 acceptance 需另行绑定；已有失败不能删除、重标或由本包的 source PASS 替代。
