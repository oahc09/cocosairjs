# Wave6：Glass 隔离 Agent 最小验收

2026-10-12。Glass 首次 Chromium 桌面运行通过。首次 TypeScript 编译与首次打包调用失败，修复后交付通过；first_run_success=false，first_runtime_success=true，final_success=true。

## 执行

- 实现：全新 Orca Worker `Wave6-isolated-glass-agent`，worker_id=`ox3drcp6lhqsub8z4unt2g1i`。
- 输入：`output/shaders-absorption/wave6-agent-glass-r1/` 中公开资料、冻结 SDK 与 starter。参考访问范围来自 Agent 报告，未做全量文件访问审计。
- 验收：Lead（Codex），真实 Chromium `149.0.7827.55`，单 canvas。
- SDK：JS `4ca4e9a2…`、DTS `e1e3b7a2…`；没有改源码、构建或替换工作区 SDK。

## 真实结果

| 项目            | 结果                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 编译            | tsc 首次 exit=2：两处 plane 缺必填分段参数；修复后两次 tsc exit=0                                                                              |
| 打包            | 首次 node -e 因工具执行中的引号丢失而 exit=1；调整调用后两次 esbuild exit=0。首次代码和原始日志保留                                            |
| Shader 与子场景 | 实际 COMPILE_STATUS 成功；两相机将四个彩色方块与地面渲入 RT，再采样到屏幕，实际 RT 有多种颜色和几何内容                                        |
| 直通            | 暂停子场景、真实滑杆置零；70 个屏幕采样点与同坐标原生 RT 读回逐通道相等，最大误差 0                                                            |
| 折射            | 真实滑杆置一；同一冻结场景中 19 个采样点变化超过 10 个码值，实际截图可见偏移                                                                   |
| 暂停/恢复       | 真实按钮控制动画时间，暂停不变、恢复继续推进                                                                                                   |
| Resize          | 同页 640×400 → 480×320，RT 与 backing 同步；35 点直通比较最大误差仍为 0，内容继续呈现                                                          |
| 释放            | 独立持有 13 份实际 mesh/material/effect：各自引用 1→0、失效；quad 与子场景失效。原子相机 targetTexture 恢复 null，原 RT RenderTexture 实际失效 |
| 收尾            | 重复释放不报错、释放后 input 不改变状态；无 pageerror/console error。输入不变，页面/浏览器/server 关闭，自然 exit=0                            |

默认 UI 截图保留。用于像素对照的截图仅临时隐藏 DOM 面板，不改 canvas 或渲染内容；PNG 与 RT 的 Y 坐标由 Lead 按原生 GL 行序独立转换，没有依赖 Agent 的 readRTAtUV 辅助函数。

## 体验记录和边界

Agent 报告实现开始 07:21:47、编译/打包完成 07:25:17（+08:00），该约 210 秒窗口不包含先前研读资料。完整任务耗时没有可靠起点，记为 unavailable；不能将编译窗口冒称全部实现时间。token_usage=unavailable，实现人工介入为零。

SDK 声明要求 plane 的 widthSegments/lengthSegments，而冻结公开手册 materials.md、rendertargets.md 示例省略它们，Lead 已核对，归 DOC_GAP。createAirRenderTarget 缺少随包专篇指导也是资料覆盖不足。Agent 提到的其他 shader 类型/precision 问题保留为待核实建议，不升级为已确认引擎缺陷。node -e 失败的原始日志证明执行引号丢失；与 RUN.md 中提供的写法不同，不声称原始说明必然错误。

当前 70/35 点是有限抽样，不是全图审计。refraction=0 直通与非零偏移已验证，不声明完整物理玻璃模型或上游算法等价。整个 app/相机容器未关闭，不冒称全应用销毁。

Firefox/WebKit、DPR2、性能、100 次资源循环、实体设备、长时运行与完整 Engine 六门均 NOT_RUN。

[结果与指纹](../evidence/shaders-absorption/wave6-glass-agent-result.json)。原始报告：`output/shaders-absorption/wave6-glass-runtime-r1.json`；实际截图：相邻 `wave6-glass-runtime-r1-artifacts/`。
