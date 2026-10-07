# 可取消形变、滚动与音频时间轴

2026-10-08，执行渠道 Lead。示例见 [interactive-timeline](../../examples/interactive-timeline/README.md)，实际报告见 [timeline-s4.json](../evidence/examples/interactive-engine-improvements/timeline-s4.json)。这是一份新教学配方：18组部件、3种目标、499秒本地终点及新编写16.2秒音轨，原工程、约59秒音乐、1188部件与155阶段参考匹配均 NOT_RUN。

默认入口使用原生 pacer。`?test=1` 的形变才使用单一 `createStepClock`；真实音频不定步。原生 `Component.update(dt)` 驱动节点与相机收敛，目标完成同时检查18组位置、缩放和相机值，误差预算0.002；Stage文字不是完成证据。Pause冻结逻辑时间与pose，Resume延续，Reset/目标切换/Replay推进session，旧timer不能写回新目标。暂停时改变速度仅更新可见反馈。range的旧释放在模式/resize后拒绝，新手势可用。

滚动模式用实际section offsets、viewport与document height计算进度。短/长页面均验证正向、反向和终点；这些语义观测没有截图，不当作像素验收。三浏览器6条原生/定步形变记录、66张PNG与6条滚动记录42状态通过。

WebAudio把 `AudioContext.currentTime - origin` 用作主时钟。Pause/Resume保留同一个source及origin；Seek/Replay先退役旧source，新回调核对身份。Mute只改变GainNode，时钟继续；静音观测来自destination之前的post-gain AnalyserNode，RMS容差0.0005，不是扬声器测量。自然结束和显式stop分别记录。释放必须等待加载收敛，停止并断开自有音频节点、移除DOM/AFTER_DRAW回调、解绑renderer、归还三引用1→0、关闭context和app；同一release返回同一Promise。

Chromium、Firefox的idle与本地CPU干扰两负载共48个cue截图通过；另有4张首cue前基线，共52音频PNG。报告保存目标音频时间、节点激活时间、context time、origin、原生帧和截图前后时间区间。PNG证明该观察区间可见，不声称物理首显示时刻。CPU干扰为每40ms请求6ms忙工作，不是产品性能预算。Firefox早期240ms恢复观测保留，最终continuity在context实际推进后读取。

当前WebKit环境没有 `AudioContext`/`webkitAudioContext`；两音频行明确NOT_RUN，完整scopePassed=false、CLI exit1。其他AudioService/HTML音频路径的历史通过不能补偿本WebAudio路径。[31种篡改审计](../evidence/examples/interactive-engine-improvements/timeline-s4-audit.json)全部拒绝，未新增浏览器。

采集命令（新输出路径，需已配置Playwright/pngjs）：

```powershell
node tools/verify/interactive-timeline-browser.cjs --browser=all --out=<new.json>
node tools/verify/interactive-timeline-browser.cjs --verify=<report.json>
node tools/verify/interactive-timeline-audit.cjs --report=<report.json> --out=<new-audit.json>
```

首命令写JSON和相邻artifacts，verify只读重算指纹、PNG、事件与pose；audit写新文件。示例strict tsconfig独立覆盖，根typecheck不覆盖全部示例。安装消费见 [consumer kit](examples/interactive-kit/README.md)。
