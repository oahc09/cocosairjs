# Wave6：三个隔离 Agent 的最小验收完成

2026-10-12。按用户“避免过度设计测试”的要求，NoiseDissolve、Neon、Glass 三个任务全部完成 Chromium 桌面最小验收。仅此冻结 SDK 和任务范围的 Agent Benchmark 通过，不解除 Wave5 当前 SDK 阻塞，也不代表发布就绪。

| 隔离任务      | 首次完整成功 | Agent 编译修复                                 | 首次浏览器实现成功 | 最终结果 |
| ------------- | ------------ | ---------------------------------------------- | ------------------ | -------- |
| NoiseDissolve | false        | 一轮，两处类型使用错误                         | true               | PASS     |
| Neon          | false        | 一轮，plane 必填分段参数缺失                   | true               | PASS     |
| Glass         | false        | 一轮，plane 必填分段参数缺失；另有打包引号重试 | true               | PASS     |

这是三项小样本的结果：首次完整成功 0/3，最终完成 3/3，不能推断全体 Agent 或 SDK 的通用成功率。三项实现人工介入为零；Lead 准备公开输入和独立验收，未修改三个 Agent 的实现。隔离方式为新上下文、独立目录与访问约束，未做操作系统级隔离或全量文件访问审计。

## 实际做了什么

实现渠道全部为新的 **Orca Worker**；验收渠道为 **Lead（Codex）**，使用真实 Chromium `149.0.7827.55`。每项覆盖实际 TypeScript/bundle、原生 shader 编译、单 canvas、截图、关键参数状态、真实 UI、一次 resize 和实际自有资产释放。

- [NoiseDissolve](wave6-noise-agent-delivery.md)：溶解进度两端和中间状态、暂停恢复，mesh/material/effect 引用归零。
- [Neon](wave6-neon-agent-delivery.md)：管体和外晕、厚度/强度/半径/颜色消费、动画控件、resize 和释放。
- [Glass](wave6-glass-agent-delivery.md)：真实子场景→RT→屏幕；直通 70 点与 resize 后 35 点最大通道误差均为 0，非零折射可见，13 份资产归零、相机解绑及 RT 销毁。

全部使用同一冻结公开 SDK：JS `4ca4e9a2…` / DTS `e1e3b7a2…`。原始首轮失败、后续日志与截图保留；Lead 的采集脚本修正单列，不混入 Agent 修复轮次。本轮没有新增 Jest、通用 Gate 框架、性能矩阵，也没有刷新 Wave1–5 或修改引擎源码。

## 发现的真实问题

三个 Agent 都在首次 tsc 时遗漏 plane 的必填分段参数。Lead 核对冻结资料：materials.md 与 rendertargets.md 示例只传 width/length，SDK 声明要求 widthSegments/lengthSegments。归类为 **DOC_GAP**；本轮没有确认新的 SDK 运行时能力缺口。

Glass 还需要从 SDK 声明与公开 bundle 自行查明 createAirRenderTarget 的 attachCamera/bindColor/resize/dispose 使用方式，公开包的 RT 手册没有这些接口的专篇指导。其余 shader 类型/precision 建议待核实，不直接立为引擎缺陷。打包引号失败属于工具调用问题，保留原始错误。

当前公开手册已修正这两处示例并补充原生 RT 使用说明（见下）；被冻结的 benchmark 输入和历史结果保持原样。

## 未测与证据

Firefox/WebKit、DPR2、性能、100 次资源循环、完整 Engine 六门、实体设备、长时、独立 Gallery 和发布均未验。本轮完成的是用户批准的三个公开资料 Agent 最小任务，不升级其他 Gate。token 全部 unavailable；Glass 仅有不含研读时间的编译窗口，不能与其他任务耗时直接排名。

汇总：[Wave6 最小结果](../evidence/shaders-absorption/wave6-minimal-agent-result.json)。各叶结果绑定实际产物、原始运行报告、日志和截图 SHA/bytes；交付时检查绑定全部匹配。

## 公开手册修正（2026-10-12 追加）

NoiseDissolve、Neon、Glass 三项首次编译均涉及 `primitives.plane` 必填分段参数缺失，属于公开手册
`docs/manual/materials.md` 与 `docs/manual/rendertargets.md` 中 `primitives.plane` 示例未带
`widthSegments`/`lengthSegments` 的 DOC_GAP。现已修正：

- `docs/manual/materials.md`：plane 示例补 `widthSegments: 1, lengthSegments: 1`。
- `docs/manual/rendertargets.md`：plane 示例同上；顶部 PARTIAL 状态限定到旧 RenderTexture 示例；
  新增 `createAirRenderTarget` 推荐用法节（双相机/bindColor/attachCamera/resize/readColor/释放顺序），
  链接 `src/air/rendering/render-target.ts` 和 `wave6-glass-agent-delivery.md`。

此修正仅涉及公开文档，不改变任何冻结结果 JSON、Agent 历史首次产物或 Wave5 SDK 阻塞状态。
