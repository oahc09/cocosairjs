# Wave6：第一个隔离 Agent 实际验收

2026-10-12。NoiseDissolve 的 Chromium 桌面最小验收通过。首次 TypeScript 编译失败，Agent 自行修复一轮后通过；首次完整成功为 false，最终成功为 true。本项交付时 Wave6 整体为 IN_PROGRESS；三项最终结果见 [汇总交付](wave6-validation-delivery.md)。

## 执行与输入

- 实现渠道：Orca Worker `Wave6-isolated-noise-agent`，worker_id=`tq8u33l01m6skuul19s7f0a3`，全新上下文。
- 验收渠道：Lead（Codex），真实 Chromium `149.0.7827.55`。
- 输入：独立目录中的冻结 SDK、公开文档、starter 与 NoiseDissolve 任务书。资料查阅和隔离遵守情况来自 Agent 的实际报告，未独立审计其所有文件访问。
- 实现：原生 EffectAsset/Material/Component、单 canvas，value-noise + 四层 FBM。这里验收任务要求，不声明与既有上游 NoiseDissolve 算法等价。
- 目录：`output/shaders-absorption/wave6-agent-noise-r1/`。SDK JS `4ca4e9a2…`、声明 `e1e3b7a2…`；完整指纹在结果记录中。未构建或修改工作区 SDK。

## 实际结果

| 项目       | 结果与证据                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 首次编译   | exit=2；缺 plane 的 widthSegments/lengthSegments，以及 Window.__airApp 类型声明                                                  |
| Agent 修复 | 自行修复一轮；随后 tsc、esbuild 与格式检查通过，日志与首次源码保留                                                               |
| Shader     | 原生 compileShader 后读取 COMPILE_STATUS；观测到的编译全部成功                                                                   |
| 画面       | 实际截图已查看；54 个 UI 外采样点显示内容，progress=0 在改变 seed/scale 后保持相同，progress=0.5 改变像素，progress=1 回到清屏色 |
| 控件       | Playwright 真实点击暂停/恢复/释放，填写 seed/scale；暂停与恢复状态变化符合预期                                                   |
| Resize     | 同页 640×400 → 480×320，backing 匹配，实际截图继续呈现内容                                                                       |
| 释放       | 独立持有实际资产对象读取引用：mesh/material/effect 各 1→0 且失效，quad 节点失效；重复释放无错误，释放后 input 不再改变状态       |
| 错误与收尾 | 最终 pageErrors/consoleErrors 为空，输入指纹不变，页面、浏览器、HTTP 服务均关闭；命令自然 exit=0                                 |

首次采集 r1 的十项实现检查全部为 true，但 Lead 脚本误写检查数量并产生 favicon 404，整体 exit=1。r2 修正自身脚本后 exit=0；r3 补齐任务清单要求的 COMPILE_STATUS 直接观测和 resize 像素检查，exit=0。三个报告原样保留。三次浏览器运行均没有修改 Agent 实现，不算三轮 Agent 修复。

## 记录与边界

- first_run_success=false；first_runtime_success=true；final_success=true。
- 编译次数来自 Orca Worker 终态：tsc 三次（包含格式化后复核），esbuild 两次；Agent 修复一轮。Lead 浏览器运行三次。
- 实现人工介入为零；Lead 提供预先准备的输入和工具说明，并修正自己的采集脚本。
- Agent 报告时间为 06:31–06:49:30（+08:00），约 18.5 分钟；该起点以输入准备时间计算，未独立核实为实际执行起点。token_usage=unavailable。
- 两个类型错误属于调用/声明使用问题，本轮没有确认新的引擎能力缺口。
- 54 点是有限抽样，不是全图算法审计。小视口截图中底部调试文字被裁切；主要控件可操作，本轮未验收完整移动布局。
- 性能、Firefox/WebKit、DPR2、100 次资源循环、完整 Engine 六门、实体设备及长时运行均 NOT_RUN。此结果不替代 Wave5 当前 SDK 验收，也不授予 Wave6 整体 PASS。

证据：[结果记录](../evidence/shaders-absorption/wave6-noise-agent-result.json)，原始运行报告 `output/shaders-absorption/wave6-noise-runtime-r3.json`，实际截图在相邻 `wave6-noise-runtime-r3-artifacts/`。下一任务 Neon 与 Glass 尚未启动。
