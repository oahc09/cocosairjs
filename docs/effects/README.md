# CocosAirJS 原生效果吸收

本目录记录原生效果算法、验证合同与能力发现。固定参考为
`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。
实现使用 Cocos 场景、材质、纹理和主循环，不加载上游 runtime 或 TypeGPU。

2026-10-12 最新：[Wave6 三个隔离 Agent 最小验收](wave6-validation-delivery.md)完成，NoiseDissolve/Neon/Glass 最终均通过 Chromium 桌面实际检查；首次编译均失败后自行修复。该结果仅绑定独立公开 SDK，不替代当前工作区 Engine/发布验收，Wave5 SDK 阻塞保留。按用户要求未扩展性能、跨引擎或重复测试矩阵；下列为历史状态记录。

2026-10-11 最新状态：[当前 SDK 刷新交付](current-sdk-refresh-delivery.md)记录 Wave1→Wave4 Engine 链全部 PASS，九个母效果与四个组合完成冻结范围验证。[Wave5](wave5-kickoff.md)已完成[同源文档 Node 合同](wave5-docs-generation-delivery.md)和[两个融合 Pilot 实证](uv-fusion-pilots-validation-delivery.md)：2→1 Pass、少256 KiB RT，但GPU有回退，保留可选示例方案。Driver仍在补齐，Wave5整体IN_PROGRESS。Agent、W2–W4 独立 Gallery、实体设备、长时与发布准备未完成；下列历史裁定按各自记录时间阅读。

- [来源与算法索引](upstream-index.md)：源码身份、许可证和必须区分的算法语义。
- [效果契约](effect-contract.md)：参数、结构身份及六维 Engine Gate；Agent Gate 单独验证。
- [能力基线](capability-baseline.md)：当前 SDK 入口、已有实现与测量边界。
- [原生启动预检](../evidence/shaders-absorption/wave0-runtime-preflight.json)：Lead 实际采集的九行空场景环境记录，含原始状态和产物指纹。
- [性能测量口径](measurement-methods.md)：即时 WebGL 派发、CPU/GPU 计时和记账的区别。
- [Wave 1 resize 呈现诊断](wave1-resize-observation.md)：同页 GL、Canvas 导出与页面截图的独立对照及未达边界。
- [Wave 1 问题分类](wave1-findings.md)：已定位的调用、文档、API 可观测性和基础设施问题。
- [执行计划](../../ai/plans/shaders-absorption-task-plan.md)与[执行台账](../../ai/ledgers/shaders-absorption.md)：每个 Wave 的范围和实际状态。

来源审查、类型声明及空场景启动均不能升级为效果已验证。每个效果需要独立算法
校验、真实浏览器画面、边界、至少一百轮资源释放和三个分辨率配置的性能测量。
Engine Gate 通过以后再安排仅能访问公开资料的 Agent Gate。

2026-10-12 Wave5 状态：[Driver Pilot 冻结候选六门通过](driver-pilot-validation-delivery.md)，三浏览器84视觉、180边界、1200资源循环与18串行性能窗；[两个融合 Pilot](uv-fusion-pilots-validation-delivery.md) 的原SDK研究证据保留。[文档生成器47项合同通过](wave5-docs-generation-delivery.md)，只绑定实际消费的声明。并行SDK构建改变字节指纹，[Wave5 当前Gate](../evidence/shaders-absorption/wave5-current-r2-gate.json)为BLOCKED；这些候选/历史PASS不代表当前SDK、Agent或发布验收。用户随后明确授权另行开展冻结公开 SDK 的 Wave6 最小 Agent 验收，该阻塞保持不变。

2026-10-10 当前状态：[Wave 1 Engine Gate](../evidence/shaders-absorption/wave1-r21-current-gate.json)、[Wave 2 Engine Gate](../evidence/shaders-absorption/wave2-current-gate.json)及[Wave 3 Engine Gate](../evidence/shaders-absorption/wave3-current-gate.json)均PASS，九个原生效果完成各自冻结子集的三浏览器六维验收，允许开始Wave4四组合。Agent Gate仍NOT_RUN；完整库存156套2088项、2083通过/5个既有失败。解析形状子集不代表完整上游平台或发布就绪。

2026-10-09 首次历史裁定：[Wave 0 已通过](../evidence/shaders-absorption/wave0-gate.json)，当时 Wave 1 BLOCKED；同页 WebKit resize 呈现及部分性能测量范围/精度未达，Wave 2–7 当时尚未开始。后续例子的路径采用
仓库已有的 `examples/<id>/src/main.ts` 结构，保持 Gallery 稳定 ID。

Wave 1 的实现与复跑入口：

- [Noise Dissolve](noise-dissolve.md)：连续 seed 的 gradient noise、柔边、输入 alpha 和端点。
- [Thin Film](thin-film.md)：SDF 梯度、虹彩 phase，以及线性 RGBA 与显示合成的独立对照。
- [Sparkle](sparkle.md)：双抖动网格、线性亮度门控、星芒和可重复时间。

这三个示例的存在不代表完整 Gate 通过。原始失败尝试、修正后的独立验证和性能记录分别保留；全批采集 exit 1 不会被改写为成功采集。

首批历史固定十三项[交付记录](wave1-delivery.md)汇总当时的算法、六维状态、性能、资源、问题分类及复核入口。三个Gallery入口保持draft；公开资料隔离的Agent Gate尚未执行。

- [Wave 1 resize/Gallery 当前收口（十三项交付）](wave1-resize-gallery-closure-delivery.md)：R20 三效果六维 PASS；历史失败保留，Agent Gate NOT_RUN。
- [Wave 2 分工与验收](wave2-kickoff.md)：E03 Holographic、E04 Neon、E05 Emboss。
- [Neon 算法](neon.md)与[六维交付](neon-validation-delivery.md)：Orca Worker 实施，Lead 三浏览器实际验收；解析形状子集 PASS，不代表整个 Wave 通过。
- [Emboss 算法](emboss.md)与[六维交付](emboss-validation-delivery.md)：原生双相机 RTT、预乘输入和凹凸光照，三浏览器六维子集 PASS。
- [Holographic 算法](holographic.md)与[六维交付](holographic-validation-delivery.md)：MaterialX Perlin、真实上游轮廓、独立时间/像素裁定和单通道性能。
- [Wave 2 十三项交付](wave2-validation-delivery.md)与[公共能力初稿](wave2-capability-proposal.md)：三效果完整冻结范围通过，暂不升级core API。
- [Wave 3 分工与验收](wave3-kickoff.md)：Liquid Metal和Cursor Trail已完成冻结范围验收；Glass已通过声明的解析形状/Vogel范围，完整数据见Wave3交付。
- [Liquid Metal 算法](liquid-metal.md)及[六维交付](liquid-metal-validation-delivery.md)：E07解析形状范围PASS，low/high各自测量；完整Wave3结论见汇总交付。
- [Cursor Trail 算法](cursor-trail.md)及[六维交付](cursor-trail-validation-delivery.md)：E08冻结范围PASS，可信鼠标/协议触摸、半精度数据纹理、300轮释放和9个活数据性能窗口；完整Wave3结论见汇总交付。

- [Glass算法](glass.md)及[六维交付](glass-validation-delivery.md)：原生两遍RTT、逆预乘、Vogel片元fallback，Gaussian compute未实现。
- [Wave3十三项交付](wave3-validation-delivery.md)：三个声明子集Engine Gate PASS，120标准视觉/141 PNG、660参数边界、900资源轮与36串行性能窗口；Agent/独立Gallery NOT_RUN。
- [Wave4组合分工与验收](wave4-kickoff.md)：C02彩边霓虹Logo冻结范围六维已通过，其他三个组合待实施与验收；完整Wave4与Agent Gate仍NOT_RUN。
- [Film+Neon算法](film-neon.md)与[十三项交付](film-neon-validation-delivery.md)：共享中心SDF、线性Alpha、单次OETF、39视觉/48PNG、300资源轮与九串行性能窗口；44实测克隆篡改全拒。
