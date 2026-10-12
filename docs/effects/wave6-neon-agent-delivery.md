# Wave6：Neon 隔离 Agent 最小验收

2026-10-12。Neon 的 Chromium 桌面验收通过，本项交付时 Wave6 完成两个任务。首次编译失败，Agent 自行修复一轮后通过；first_run_success=false，first_runtime_success=true，final_success=true。三项最终结果见 [汇总交付](wave6-validation-delivery.md)。

## 执行

- 实现：全新 Orca Worker `Wave6-isolated-neon-agent`，worker_id=`jataabs44bsnoh5mth3d9oga`。
- 输入：独立 `output/shaders-absorption/wave6-agent-neon-r1/` 中的公开资料与冻结 SDK。隔离遵守情况来自 Agent 报告，未独立审计其全部文件访问。
- 验收：Lead（Codex），真实 Chromium `149.0.7827.55`，640×400 桌面单 canvas。
- 冻结 SDK：JS `4ca4e9a2…` / DTS `e1e3b7a2…`。没有修改引擎源码或构建 SDK。

## 结果

| 检查          | 实际结果                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 编译与打包    | tsc 首次 exit=2：primitives.plane 缺 widthSegments/lengthSegments；自行修复后第二次 exit=0。esbuild 首次 exit=0。原始源码、命令和退出码保留 |
| Shader 与画面 | 原生 COMPILE_STATUS 全部成功；截图可见波形管体、圆环和外晕，已人工查看实际图像                                                              |
| 参数          | 暂停动画后，强度、厚度、外晕半径分别改变 UI 外实际像素亮度；双颜色变为绿色后像素颜色改变                                                    |
| 真实控件      | Playwright 点击暂停/恢复/释放，使用键盘改变强度滑杆；其他参数与颜色通过公开 benchmark API 修改                                              |
| 动画          | 暂停后 animationTime 不变；恢复后时间继续推进                                                                                               |
| Resize        | 同页 640×400 → 480×320，实际 backing 匹配并继续呈现效果                                                                                     |
| 释放          | 从实际 renderer 独立持有 mesh/material/effect，观察引用各 1→0 且失效；quad 失效、effect 注册注销；重复释放和释放后 input 不改变状态         |
| 收尾          | pageErrors/consoleErrors 空，输入字节不变，页面/浏览器/server 关闭，命令自然 exit=0                                                         |

Lead 运行两次浏览器：r1 通过后发现像素采样区域包含右上控件面板，r2 将面板区域排除后全部检查仍通过。两次报告和截图均保留，没有修改 Agent 实现，不增加 Agent 修复轮次。实际功能检查共 12 项，不构建大型测试或跨引擎矩阵。

## 使用体验与范围

Agent 自读时钟报告 07:02:44–07:08:48（+08:00），约 364 秒；这是 Agent 报告耗时。实现人工介入为零，token_usage=unavailable。唯一编译错误与前一任务相同，都是 plane 选项缺必填分段参数；记录为调用问题和后续文档改进线索，没有确认新的引擎缺陷。

本地 shader 为 SDF 波形/圆环、实心管体与指数外晕的独立设计，不声明上游 Neon 等价。这里检查可见渲染和参数消费，不做全图数学审计。释放检查针对自有 GPU 资产与绘制节点；页面应用和 camera/driver 容器未关闭，不声称整个应用已销毁。

Firefox/WebKit、DPR2、性能、100 次生命周期循环、实体设备、长时运行与完整 Engine 六门均 NOT_RUN；Wave5 当前 SDK 阻塞不由这项验收解除。Glass 下一项使用新的隔离上下文。

[结果与完整指纹](../evidence/shaders-absorption/wave6-neon-agent-result.json)。原始报告：`output/shaders-absorption/wave6-neon-runtime-r2.json`；截图：相邻 `wave6-neon-runtime-r2-artifacts/`。
