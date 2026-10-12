# Wave6：Agent Benchmark 启动

2026-10-12。用户明确授权：任务已严重延迟，避免过度设计测试，直接开始 Wave6 Agent Benchmark。

## 状态

- **Phase**: COMPLETE（首轮三个任务的最小验收完成）
- **Agent Gate**: PASS（仅冻结公开 SDK、三个隔离任务、Chromium 桌面最小范围）
- **Wave5**: SDK 字节阻塞保留为 BLOCKED，不补 PASS

## 公开资料包

`output/shaders-absorption/wave6-public-input-r1/` 包含：

| 路径            | 内容                                              |
| --------------- | ------------------------------------------------- |
| `sdk/`          | 冻结的引擎 JS + DTS（SHA/bytes 见 manifest）      |
| `docs/`         | README + 5 份公开手册（材质/shader/相机/RT/资源） |
| `starter/`      | 最小 index.html + main.ts                         |
| `tasks/`        | 3 份任务书（NoiseDissolve/Neon/Glass）            |
| `INDEX.md`      | 资料索引 + 禁止参考白名单                         |
| `ACCEPTANCE.md` | 最小验收清单 + 结果记录模板                       |
| `manifest/`     | 文件清单与 SHA                                    |

被测 Agent 只能访问上述公开包内容，不能读取仓库其他文件。

## 三个任务

| 难度 | 任务          | 核心考察                               |
| ---- | ------------- | -------------------------------------- |
| 简单 | NoiseDissolve | shader 编写 + progress 两端 + 资源释放 |
| 中等 | Neon          | SDF 管体 + 多参数 + 动画控件           |
| 复杂 | Glass         | 双相机 + RT + 采样折射 + 直通          |

每项：首次产物 + 最多 2 轮实际错误修复。Chromium 桌面小样本，跨浏览器/性能/完整六门声明未测。

## 第一个隔离任务

用户授权“先新建 1 个”，已由新 Orca Worker `Wave6-isolated-noise-agent` 独立完成 NoiseDissolve。首次 TypeScript 编译有两个类型错误，Agent 自行修复一轮后通过编译与打包；因此首次完整成功为 false。

Lead 的 Chromium 桌面实测通过：真实 shader 编译、溶解端点与中间状态、真实控件、暂停/恢复、640×400 → 480×320 resize 后继续呈现，以及 mesh/material/effect 实际引用 1→0 和失效。验收期间没有修改 Agent 实现；首轮采集脚本自身失败保留为历史。

见 [NoiseDissolve 交付](wave6-noise-agent-delivery.md) 与 [实际结果](../evidence/shaders-absorption/wave6-noise-agent-result.json)。Wave5 的当前 SDK 阻塞保持不变。

## 第二个隔离任务

新 Orca Worker `Wave6-isolated-neon-agent` 已独立完成 Neon。首次 tsc 因 plane 的必填分段参数缺失而失败，自行修复一轮后编译与打包通过。Lead 的 Chromium 实测通过 shader 编译、管体与外晕呈现、厚度/强度/外晕半径/颜色变化、暂停/恢复、resize 和自有资产释放。首次完整成功为 false，最终成功为 true。

见 [Neon 交付](wave6-neon-agent-delivery.md) 与 [实际结果](../evidence/shaders-absorption/wave6-neon-agent-result.json)。用户已授权“然后下一个 Glass”，随后使用全新隔离 Worker 完成了第三项。

## 第三个任务与最终汇总

Glass 的 Orca Worker 已交付编译/打包实际终态，Lead 首次 Chromium 桌面运行通过真实 RT、直通、折射、控件、resize 和释放。首次 tsc 仍因 plane 分段参数缺失而失败，因此三个任务首次完整成功均为 false，最终均为 true。

见 [Glass 交付](wave6-glass-agent-delivery.md) 与 [Wave6 汇总交付](wave6-validation-delivery.md)。该小样本不推断通用成功率，不声明完整 Engine 六门、当前工作区 SDK 或发布 PASS。Wave5 原 SDK 阻塞与全部历史失败保持不变。
