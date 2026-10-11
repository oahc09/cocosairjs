# Wave 1：resize、Gallery 与当前证据收口

2026-10-10 冻结批次：[Wave 1 Engine Gate](../evidence/shaders-absorption/wave1-r21-current-gate.json) 为 **PASS**：E01 Noise Dissolve、E02 Thin Film、E06 Sparkle × 三浏览器 × 六维，共 54 项、705 个测量案例；另有 Gallery 18 组生命周期通过。2026-10-11 SDK 因独立 gfx 修复改变，该批通过属于原 SDK 身份，不能继承当前候选 PASS；当前身份需重新采集。Agent Gate 仍为 NOT_RUN，整个吸收计划未完成。旧 BLOCKED/LIMITED 报告保留为历史，未改写其结果。

## 1. Goal

完成同页、同 Canvas 的活 resize 页面呈现验收，接通三例 Gallery 的退役、重建和终态，刷新当前源码对应的功能、资源与性能证据；通过本轮 Gate 后启动 Wave 2。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。算法、路径、许可及实现差异继续以各例 UPSTREAM.md 和 [来源索引](upstream-index.md) 为准，不嵌入上游 runtime 或 TypeGPU。

resize 的环境定位对应 Playwright Windows WebKit 默认参数 `--disable-accelerated-compositing`。其 [Windows embedder 实现](https://raw.githubusercontent.com/microsoft/playwright/main/browser_patches/webkit/embedder/Playwright/win/MainWindow.cpp) 将此参数映射到禁用 accelerated compositing；因果结论来自本机有/无该参数的真实对照，而非仅凭源码推断。

## 3. CocosAirJS APIs used

沿用 Scene、Node、Camera、MeshRenderer、Material、EffectAsset、createMesh、createAirApp、原生 Component 更新及已有定步时钟。Gallery 使用既有共享 installAssetLifecycle 合同和新增 example-local installShaderLifecycle 桥接；资产显式 addRef/decRef，解绑后退役。

## 4. Implementation details

执行渠道：Orca Worker 小三完成 Gallery 桥接、生成器、浏览器环境 helper 和 scoped launcher；Lead 审查、补充独立 validator、串行浏览器采集、正式汇总及文档集成。此次未修改 SDK/抽取引擎源码，未构建或安装依赖。

仅在 Windows WebKit 的 shader 采集启动时，以公开 `ignoreDefaultArgs` 排除上述一个默认参数。其他引擎和平台保持原配置。既不新增渲染 Canvas，也不以 Canvas 导出、fresh page、context 重建代替同页 compositor PNG。

性能使用真实 HTTP COOP/COEP 隔离代理；Firefox 在隔离导航后以同尺寸 setViewportSize 恢复请求的 DPR 2，并验证实际 DPR/backing/COI。Gallery 双模式分别使用原生 pacer 和已有定步路径。生成器从仓库 Prettier/EditorConfig 读取配置，连续实际生成的字节/SHA 幂等。

## 5. Tests performed

Lead R20 的六次功能/性能子进程及最终 R21 Gallery 子进程实际 OS exit 均为 0，时间窗口无重叠；正式 Gate 校验七份原始报告、各自 OS 回执/日志、当前源码及 validator 指纹。R20 只读审计基线接受且19种篡改全部拒绝；审计第一次误删了不存在的precision字段，保留AGENT_FAILURE记录，修正为真实clockPrecision后复验。最终元数据一处修正后Gallery以R21重新采集，避免继承已漂移的R20 Gallery证据；[R21只读审计](../evidence/shaders-absorption/wave1-r21-current-audit.json)再次接受真实基线并拒绝7种汇总/身份/执行回执篡改，无新增浏览器运行。首次汇总因独立 Thin Film checker 只识别旧 HTTP 头字段失败；增加新旧字段适配且矛盾字段拒绝，保留失败报告后重新裁定。

Focused Jest 15 套 340/340 通过；最后 checker 字段适配及 validator 闭包增加后，Wave Gate 套件 16/16 通过（此前该套件 8 项，不能将两次结果重复相加为独立测试总数）。三个示例 strict noEmit 均通过，三个生成器实际运行并通过格式检查。最新完整库存中 shader 的15套348项全部通过；完整库存为136套1428项、1423通过/5失败，真实 exit1，见 [库存](../test-inventory.json)；失败涉及规格冻结、证据链、清单裁剪、API行号和旧浏览器矩阵指纹，不能称全仓库绿。其后仅修正本轮 Thin Film 一处元数据行号，三例23条API证据独立检查全部匹配；全局仍有其他示例21处行号漂移。未重复全量测试，库存保持真实最近一次执行结果。

## 6. Screenshots / visual comparison

三效果真实 GPU 回读与 compositor PNG 均由各自数值/像素 oracle 复算，包括 WebKit 活 resize。Gallery 每例 × 三引擎 × step/native 两模式，共 18 行、36 张退役前后 PNG，校验实际可解码、尺寸、SHA/bytes 及像素差异。

当前原始报告是 `output/shaders-absorption/lead-w1-r20-{e01,e02,e06}-{functional,performance}.json` 和最终 `lead-w1-r21-gallery.json`；截图保存在对应相邻 artifacts 目录。正式 Gate 按实际七份绑定的路径、字节与 SHA 定位，不依赖文件名或自报 PASS。算法正确性来自独立 CPU 数学预期及 GPU/PNG 对照，不是截图相似性。

## 7. Performance measurements

27 个冻结 profile：三效果 × 三引擎 × 720p、1080p、mobile DPR 2。全部环境和性能合同通过；mobile CSS 390×844、backing 780×1688，COI=true。观测时钟最小正增量：Chromium 约 0.005 ms、Firefox/WebKit 约 0.02 ms。

每 profile 保留真实 warmup/steady 帧及原始 CPU 更新、GL 派发、队列记账、帧间隔、draw/pass 和计数；60 steady 帧/profile。GPU timestamp 仅按实际扩展/查询结果报告，不能以 CPU 或队列记账代替。原始数值和统计可从 Gate 绑定报告复算，不将所有 profile 称为 60 FPS 保证。

## 8. Resource lifecycle

三效果 × 三引擎各 100 轮，共 900 轮 create/destroy。Gallery 另外验证 18 组退役重建、54 份持有资产 refCount 1→0 且失效；不复活旧 instance，不漏类别，不隐藏 invalid 资产。并发生命周期返回同一 Promise，终态 hold 为 0，终态创建/操作拒绝，监听、页面、浏览器及自有服务器关闭。

## 9. API / DX gaps found

- INFRA_FAILURE：Playwright Windows WebKit 默认禁用合成加速使本机活 resize 后 WebGL 数据与 compositor 不一致；限定启动选项已恢复，未归因为 SDK 缺陷。
- INFRA_FAILURE：Firefox 隔离导航将 DPR 降为 1；协议修复与实际环境回执已覆盖。
- EXAMPLE_GAP：Gallery 生命周期曾缺接线，已补齐并由真实双模式采证。
- AGENT_FAILURE：历史采集/生成器/import 和汇总字段遗漏已修复，失败尝试保留；不存在将诊断 exit 0 直接升级效果 PASS 的路径。
- API_DX：现有立即 GL 派发与队列记账语义继续分别计量，未新建并行渲染抽象。

其余分类本轮无新增确证。完整历史见 [发现记录](wave1-findings.md) 和 [环境追查](wave1-environment-followup.md)。

## 10. Workarounds used

shader-scoped WebKit launcher、真实 HTTP 隔离和导航后 DPR 修复均记录在报告身份中；不改变主机配置、期望 DPR、算法容差或验收范围。旧 collector 身份变化后报告保留为历史，最终使用 R20 重新采集。

## 11. Proposed engine changes

本轮没有证据要求修改引擎核心。先保持原生效果与 example-local bridge；公共效果能力等待 Wave 2/后续多个消费者证明后提炼。浏览器环境工具不进入默认运行时包。

## 12. Validation status

Wave 1 Engine Gate PASS，允许 Wave 2 E03/E04/E05 开始。固定来源、Build/Runtime/Visual/Boundary/Resource/Performance 六维均在三浏览器通过。Agent Gate NOT_RUN；全项目、release、实体设备验收均未由本 Gate 宣称完成。

复核命令：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave1-gate.cjs --verify=docs/evidence/shaders-absorption/wave1-r21-current-gate.json`。只读检查当前输入和原始证据；SHA 漂移拒绝。生成模式要求显式 `--bindings=<paths.json> --out=<new.json>`，写新报告，不启动浏览器、不构建、不覆盖历史。

## 13. Known limitations

本机 Windows 浏览器环境结论不泛化到所有 WebKit/Safari。mobile 是桌面 DPR/视口模拟，不是实体 iPhone；主机后台负载未完全隔离；GPU 物理内存不可观测。Sparkle 的独立 hash 与许可未知参考 hash 不等价，未据此声称上游逐像素一致。Agent Benchmark 和后续组合效果尚未运行。
