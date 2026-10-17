# Windows WebKit 视频循环修复

2026-10-16，候选构建 164/165，版本仍为 `1.0.0`。完整 browser-matrix 已通过 78/78；原视频示例源码指纹、原矩阵合同和原 H.264 资产保持不变。API 183/183、Gallery 303/303、全仓 197/197 套件及 3,105/3,105 项测试均已通过，测试清单已更新。发布门禁仅剩未提交工作区；真实 Safari 继续保留外部 NOT_RUN。

原生无 AIR 对照在从头循环及暂停 seek 后循环两种情况下，都于回绕到 0 时暂停。事件顺序为 `pause → seeking → seeked`，seek 已完成，播放不再前进。公开 [WebKit Windows Media Foundation 源码](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/win/MediaPlayerPrivateMediaFoundation.cpp) 的结束会话、状态通知及 seek 完成逻辑与观测一致；这是对本机现象的机制判断，没有修改浏览器二进制。

修复位于 Cocos Web VideoPlayer 实现：实际平台为 Win32 且浏览器为 WebKit/Safari 时，记录仍有效的播放意图，仅在原生 loop seek 完成后恢复播放。不写回循环时间，不伪造媒体事件。显式 pause、stop、seek、disable、关闭 loop、换源和播放中断均能阻止待恢复动作。Windows WebKit 的 UA 使用 macOS 字样，平台限定读取 `navigator.platform`，不改 PAL。

播放 Promise 仅在成功、原元素仍有效且仍请求播放时校准；被原生 loop 中止的播放不再迟到 seek。同一元素已经 seek/play 到新位置时，迟到的 ended 回调还必须满足当前原生 `ended=true` 才能派发 COMPLETED。预加载阶段的起始位置赋值按实际 `seeking` 状态记账，避免没有发生 seek 的零位置赋值阻塞首轮循环。

| 验证范围           | 当前结果                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| 视频源码与合同     | 与上一轮源码指纹完全一致；合同 SHA-256 不变，循环期间 COMPLETED 仍要求 0 |
| 针对性回归         | 16/16；含控制取消、旧元素、失败播放、迟到结束及预加载零位置              |
| 顺序负控           | 8/8；回绕后暂停等情况仍被判失败                                          |
| 三引擎视频场景     | Chromium / Firefox / Windows WebKit 均通过原严格合同                     |
| 完整三引擎矩阵     | 78/78，completed=true、subset=false                                      |
| SDK dev 既有播放器 | 连续 3 次原生循环、38 个不同解码帧、0 COMPLETED、0 额外 seek             |
| SDK dev 新建播放器 | 连续 3 次原生循环、38 个不同解码帧、0 COMPLETED、0 额外 seek             |
| SDK min 新建播放器 | 连续 3 次原生循环、36 个不同解码帧、0 COMPLETED、0 额外 seek             |
| 真实 Safari        | NOT_RUN，保留外部验收                                                    |

原生浏览器对照的失败继续保留；通过的是运行时兼容路径。日志、真实解码样本、截图、源代码快照与 SHA-256 见 [专项证据](../evidence/webkit-video-loop/manifest.json)，完整矩阵见 [browser-matrix](../evidence/browser-matrix/browser-matrix.json)。循环由原生媒体时钟推进，画面样本来自 HTMLVideoElement 的实际解码帧，截图前再暂停引擎并按单步时钟提交帧。
