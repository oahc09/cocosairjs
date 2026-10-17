# WebGPU 后端实施与验收台账

## 当前状态

2026-10-16：本机 Windows 桌面专项验收闭合，desktopScopePassed=true、failures=[]。Chrome/Chromium、Edge、Firefox 各 21/21，独立安装包 dev/min 各 21/21；Windows WebKit 的 10 项 WebGL2 对照通过，11 项 WebGPU 请求按端口无 API 明确拒绝，原报告仍是 BLOCKED。用户已确认目前没有 Mac，Safari 保留外部 NOT_RUN。不提交、不发布、不改版本号；全仓 release-readiness 仍 NOT READY。

| 批次 | 本轮状态 | 证据/边界 |
| --- | --- | --- |
| WG-00 | PASS | translator 发行字节/许可冻结；builtin 22 effect、50 shader 与 10 个独立 post effect/布局来源可追溯；重编一致性通过 |
| WG-01 | PASS | dev/min/dts、typecheck、feature/旧 native-device 桥接隔离；版本仍 1.0.0，npm scripts 仍 48 |
| WG-02 | PASS | 实际 API.WEBGPU、硬件 adapter、截图；默认 WebGL2 不下载 translator；4 类失败、重定位、无自动回退 |
| WG-03 | PASS | CPU/shader ABI、可见 binding/stage 布局、单阴影/CSM；修复 depth-only 浮点采样与 TAA 关闭后的投影残留 |
| WG-04 | PASS（17 项合同） | 对齐读回、mip/layer、MSAA、MRT/depth、resize 重绑；新增二维过滤/缩放 blit、组合写色掩码及混合状态数据 |
| WG-05 | PASS（明确矩阵） | 双后端 PBR/skin/morph、UI/mask、离屏合成；Bloom/FXAA/ColorGrading/HBAO/DOF/FSR/TAA 启用及逐项恢复 |
| WG-06 | PASS（明确合同） | direct/indirect compute、storage buffer/image、compute → draw；device lost 后 failed 并拒绝提交 |
| WG-07 | Windows 范围 PASS | 包 dev/min 全矩阵、退出码、当前指纹和 PNG 重算通过；Safari 外部项保留，整仓发布证据独立刷新中 |

## 新实现与修复

- 原始 INDIRECT buffer 参数上传和 dispatchWorkgroupsIndirect，保留 Cocos draw-info 快照入口。
- 二维颜色 blit 的 nearest/linear、区域/mip/layer；copy 快路径保持真实 copy，缩放走实际 GPU 采样 pass。
- 组合/零 color-write mask、MIN/MAX、constant-alpha 和逐 draw 常量快照；不可表达的 RGB 混合常量组合明确拒绝。
- depth/stencil 附件按需保留 aspects，采样 view 为 depth-only；PSO 按实际纹理选择不可过滤浮点布局。
- 原生 TAA 关闭时重建无 jitter 投影，两后端恢复 maxDelta=0；只有此 post-process-builder 偏差获固定 SHA 登记，custom 子图其余文件不放宽。
- 冻结 post 资产由 6 个补到 10 个；裸 chunk 名采用冻结源唯一匹配，编译器错误在模块加载时绑定为 throw，防止漏 include 仍生成资产。

## 环境排查

Firefox 默认无头有 API 但 adapter=null；默认有窗口的原生 GPU 读回通过。自动化窗口被覆盖时，Windows 遮挡跟踪导致刷新停滞。最终同一有窗口 profile 只配置刷新率、always-active 和关闭遮挡跟踪，未强制启用 WebGPU、未切软件 adapter、未改用户 profile；正式 WebGL2/WebGPU 均在此 profile 通过。详见[环境说明](../../docs/reference/webgpu-environment.md)。

Windows WebKit 有/无窗口均无 WebGPU API，官方默认构建配置也未启用；不以 Windows WebKit 结果代替 Safari。用户确认没有 Mac 后，Safari 外部项不再反复询问。

## 证据与结果

[归档清单](../../docs/evidence/webgpu-release-refresh/manifest.json)绑定原始 JSON、311 张 PNG、命令日志/退出码、采集源码和 SHA-256；CPU 验证在 static/report.json。验收器独立重算阴影、骨骼形变、七效果及 LUT 的彩色像素，不只读取派生 PASS 标志。

当前 sourceSha256 为 cdd552444066108de44b0c772b9c88bc26ac274de7eb3e4bebd369c172e349a9；通过报告 completed=true、sourceUnchanged=true，JS/map 源码无 mismatch，GPU validation errors=0。七效果全部逐项恢复 maxDelta=0。

当前候选启动/glTF 56/56、雾效 3/3、视频 16/16、D10 4/4、typecheck、dev/min/dts、修改范围格式、file-map、Web-only、WASM 边界、custom 导出、许可与 builtin 重编一致性通过。静态 D10 记录仅指其 4 项；本轮完整 Jest 另已通过 smoke-30 全集及 197/197 套件、3,105/3,105 项测试，测试清单已更新。

首次完整采集因模型模块未完成而恢复时钟、以及 Firefox 刷新超时失败，原始尝试保留 output/webgpu-completion/final 至 final-r4。历史 final-r5 的浏览器和包矩阵均真实重新执行；本轮 output/playwright/webkit-video-loop-r4/webgpu 的六组及原生预检均为新执行，没有重标旧失败。

全仓 API 183/183、Gallery 303/303、browser-matrix 78/78 及完整 Jest 已独立刷新通过；Windows WebKit 循环修复与原断言保留证明见 docs/reference/webkit-video-loop.md。发布门禁仅剩未提交工作区 1 项阻塞。真实 Safari 外部 NOT_RUN 与无关 spark-rs 许可 pending 保留。

## 复跑

使用 [Windows 专项命令](../../docs/reference/webgpu-environment.md#可复跑命令)。runner 只写新目录，consumer 临时打包安装并清理，不构建、不升级依赖、不发布；验收器默认只读，显式 --archive 才归档。原始构建命令写 build/ 与构建计数，声明不推进计数，版本号不变。
