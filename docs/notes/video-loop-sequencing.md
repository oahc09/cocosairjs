# 视频循环探针的就绪顺序

## CI 原始失败

2026-10-13 的 [Code quality job](https://github.com/oahc09/cocosairjs/actions/runs/38483656532/job/115592006331) 检出 `f76257fc6805f2e9cd722f376d50afc402afe074`。前置构建与 typecheck 通过；浏览器诊断 12 项中 11 项通过，唯一失败为 `video-basic/webkit` 的 `results.p8Loop.wrappedBelowSeekTarget`。原 artifact `browser-matrix-diagnostics` 的 JSON SHA-256 为 `401e14ad93911af2a47aeb97af17a94f025ad9062f86d5317f0b529def0f38f0`。

该记录的 `seekSettledWithinMs=-1`、`wrapWithinMs=-1`、`currentTimeNow=2`。序列在 10.392 秒已完成，35.953 秒最终采样仍没有播放头或解码帧推进，SDK 状态却是 `playing`。所以不能把失败归为外层采样太早，也不能只检查 `playing`。

## 已证实的探针缺口

1. P6 从 REMOTE 回切 LOCAL 后，旧代码查询全局事件日志末三项中的 `meta-loaded`。它会读到上一元素的事件，未等新元素 metadata 就进入 P7。
2. P7 超界 seek 被钳到片尾，但 seek 本身异步。旧 P8 立即 `play()`，随后再 seek 到 2 秒。原样 WebKit 时间线实测 `seeking=true` 时发生 `play()`，浏览器自动回绕与后续 seek 交错。
3. 旧 P8 即使 seek 等待超时，也继续单独用 `currentTime < 1` 判断回绕；低位旧时间可能被误当成成功，停止的媒体也缺乏独立推进证据。

本地原样两轮均通过，未稳定复现原 CI 卡住。原 artifact 与实测次序支持上述竞态诊断，但不构成原失败浏览器内部因果链的完整追踪。

## 修正边界

仅调整 `examples/video-basic/main.js`：

- P6 等新 LOCAL 元素的 metadata 和新回调；超时明确失败。
- P8 先 pause，seek 到既有 2 秒目标并等落地，再 play，观测原生播放头真正推进后才接受自然回绕。
- 前置条件失败不继续起播，也不把失败显示成成功或进入后续全屏阶段。

原有浏览器合同及 2 秒/3 秒等待上限未放宽，没有删除断言、跳过 WebKit、合成播放事件或修改 SDK。SDK 抽取源码与上游映射保持不变。

## 回归方式

`node tools/verify/video-loop-sequencing.test.cjs` 从实际示例提取两个函数，使用确定性 CPU 模型验证旧 metadata、未落地 seek、停滞播放头和不回绕等负例。它是控制流测试，不是视频播放证据。7 项在原 main 全部失败，在修复后全部通过。

`npm run verify:browser-matrix` 先运行该 CPU 回归，再执行原矩阵采集器；`--ids`、`--engines` 和 `--out` 仍传给采集器。没有改变 Jest discovery 清单或历史执行统计。

真实媒体复验使用同 SHA 源码构建的 bundle 与 Playwright 1.62.1 / WebKit 26.5。最初 dev-server 路径一轮 P3/P5 失败，原生报错明确为 Range 请求意外返回 HTTP 200；该失败被保留。其后直接使用官方矩阵采集器的静态 Range 服务器复验，避免混用服务器。此处不修改 dev-server，也不把该本地错误归为原 CI 根因。

直接使用官方采集器的前两轮 `video-basic/webkit` 各自 1/1 PASS。不过这两轮的外部启动 hook 在原 `load` 后额外等待 scene-ready，等待发生在合同 26 秒计时前，不能称为完全未适配 CI 等价运行。

最终在 2026-10-14 10:41 UTC 对代码提交 `6cedebbdfa86bb08f21a5524fae826a4421444a8` 再跑一轮，移除了额外 scene-ready 等待。外部 hook 只适配现有合法 WebKit 二进制路径，并在原 `goto(load)` 返回时清除 15 秒 Node 启动 watchdog，不改变合同等待。该轮 1/1 PASS、`scopePassed=true`、`subset=true`、`completed=false`；P8 seek 23 ms，真实推进 71 ms，回绕 960 ms，`completedDeltaDuringLoop=0`。无 console error、资源失败或失败断言，截图帧变化与字节下界均通过。

该轮运行前后 main/test/package/collector/contract/bundle 的 SHA-256 全部一致；示例 main.js 为 `9caa22a2ff926116cea4b63dc6cdecaa3f4da557e18f0c95b4d45ad09d355810`。browser、collector/HTTP server 与 supervisor 都有实际 exit/close 回执，无残留进程。后续本专题记录更新只改文档，不改已验证代码。

另已通过 typecheck、format:check、HTTP byte-range 8 项检查及 npm 参数透传检查。单例 WebKit 通过不表示三浏览器完整矩阵、完整 Jest 或整条远端 CI 已通过；后续必须在远端用新代码触发完整 CI。
