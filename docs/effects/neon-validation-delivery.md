# E04 Neon：六维实证交付

2026-10-10。[当前六维 Gate](../evidence/shaders-absorption/e04-neon-current-gate.json) PASS，仅覆盖 circle/rounded-box 原生实现；本例采集时Wave2整体尚未完成；当前三例汇总已PASS，Agent Gate仍NOT_RUN。

## 1. Goal

通过真实原生效果检验 SDF 管体、热核、解析光晕和透明边缘，并完成 Build、Runtime、Visual、Boundary、Resource、Performance。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。Neon/index.ts SHA 为 `7ecc741e788bc9000bd062ee4f1b2a042e9fd0cea96059ff6d84138fcb6ac586`；neon/glass/materials helpers 逐文件身份在 Gate 的 reference 闭包内。[来源与差异](../../examples/shader-neon/UPSTREAM.md)及 [MIT 通知](../../examples/shader-neon/LICENSE.reference.txt)保留，不嵌入上游 runtime 或 TypeGPU。

## 3. CocosAirJS APIs used

createAirApp、Scene/Node/Camera、EffectAsset、Material、MeshRenderer、utils.createMesh、createStepClock、createAirRenderTarget；使用既有 example-local installShaderLifecycle 桥接，未新增公共 SDK API。

## 4. Implementation details

执行渠道：Orca Worker 小三实现效果、参数合同、CPU oracle、采集器及审查修复；Lead 实施独立回归、串行浏览器采集、真实报告克隆审计和证据集成。

中心加四向 stencil、rim band、半圆截面法线、Blinn-Phong、热核与双指数外晕分别建模。逆边 smoothstep 显式改写为有序逆函数。数学层保留 HDR；透明 RGBA8 RT 在存储时 clamp/量化，预览片段 OETF 后按定点目标先 clamp 再混合，不声称物理线性合成。详见 [算法与格式链](neon.md)。只有一个 Cocos 渲染 Canvas，使用原生 pacer 或既有单一 step clock。

## 5. Tests performed

最新三套 Jest 113/113，通过结果保存在 `output/shaders-absorption/lead-w2-e04-focused-tests.json`；其中 Lead 独立审查 15 项，接受正常正例后拒绝缺失/负帧、缺失时间、非法像素及结构垃圾。strict tsc 和 esbuild 在两次实际采集中 exit0；所有三浏览器实际 shader 编译通过。

Lead 外层 OS 驱动分别捕获功能与性能真实 exit0、signal=null、inputsUnchanged=true；窗口顺序无重叠。两份报告盘面重验证通过。[独立克隆审计](../evidence/shaders-absorption/e04-neon-actual-audit.json)接受真实功能/性能基线，22 种篡改全拒，没有增加浏览器运行。完整测试库存未在本轮重跑，不能称全仓库绿。

## 6. Screenshots / visual evidence

Chromium 149.0.7827.55、Firefox 155.0、WebKit 26.6，各 11 个 DPR1 案例和两个 DPR2 案例，共 39 组 compositor PNG 与透明 RT 读回；另有三张同页 resize PNG。core/glow 零值、薄管、宽光晕、圆/圆角矩形、旋转、明暗背景及静态调制均在冻结计划内。CPU oracle 独立逐层复算，格式容差保持 ±2 码值，远场精确透明零。Lead 人工查看默认和明背景图；并非逐张人工审美验收，算法结论来自全部 PNG/读回的数值检查。

原始功能报告为 `output/shaders-absorption/lead-w2-e04-functional-attempt3.json`，42 张 PNG 位于其相邻 `-artifacts/` 目录。Gate 保存逐文件 SHA/bytes，当前输入闭包 27 项及四份参考源码均绑定。

## 7. Performance evidence

原始报告：`output/shaders-absorption/lead-w2-e04-performance-attempt1.json`。三引擎 × 720p、1080p、mobile DPR2，共九个约六秒窗口；剔除 30 warmup 帧，保留全部 steady 原始样本、计时查询和释放记录。

| 引擎     | AFTER_DRAW 间隔中位数（720p / 1080p / mobile，ms） | GPU timestamp 中位数（ms） |
| -------- | -------------------------------------------------- | -------------------------- |
| Chromium | 16.670 / 16.645 / 16.665                           | 0.256 / 1.033 / 0.867      |
| Firefox  | 16.660 / 16.660 / 16.680                           | 不可用                     |
| WebKit   | 20.440 / 20.360 / 19.120                           | 不可用                     |

各 profile 为一个材质 pass、每帧一次 draw。CPU 更新中位数约 0.08–0.10 ms；gfx 调用 envelope 包含立即 GL 派发，GL draw 派发和 queue 记账分别记录。队列记账不是 GPU 提交耗时，零值代表观测精度以下而非零开销。AFTER_DRAW 间隔不是显示器呈现时间；这不是跨浏览器硬件排名或 60 FPS 承诺。

实际 mobile CSS 390×844、DPR2、backing 780×1688，COI=true；计时最小正增量 CH≈0.005 ms、FF/WK≈0.02 ms。底层 renderer 原文、51 个 GL buffer/15 个 texture 的单上下文计数，以及引擎登记字节分开保留；这些包含借用运行时资源，不能当作 Neon 独占物理显存。

## 8. Resource/lifecycle evidence

每引擎 100 轮，共 300 轮创建/退役。mesh/material/effect 各显式持一份，refs 1→0、renderer 解绑、节点移除、资产失效、EffectAsset registry 清除；引擎内存计数回基线。普通模式真实参数键盘与暂停/恢复/重置/释放按钮 isTrusted=true。终态 NEON_DISPOSED、release 精确同一 Promise、监听解绑、页面/浏览器/自有 HTTP 服务关闭。

Gallery 已登记 Neon，175 个已有条目逐项保持不变。桥接代码存在；本 Gate 验证的是实例原生 cycles，未将其冒称单独 Gallery harness 的 resource-released 验收。

## 9. API/DX gaps found

本批无确证 ENGINE_BUG/API_GAP。两次失败尝试中的 oracle 格式模型和采集器 ready、可信释放、实例判定、帧绑定缺口归为 AGENT_FAILURE，已通过独立反例和重新采集修复。RGBA8 饱和属于格式语义，记录于文档，不归为引擎算法错误。

## 10. Workarounds used

复用限定 Windows WebKit 启动选项和真实 HTTP 隔离/DPR 修复合同；未改主机配置。未删除宽光晕案例，未放宽容差，未通过第二 Canvas、fresh page 替代同页 resize。

## 11. Proposed engine changes

暂无。保持 example-local 实现，等待 E03/E05 真实消费者完成后再提炼 SDF/Noise/Color 提案，不因一例通过新增公共抽象。

## 12. Validation status

E04 六维范围 PASS，Agent Gate NOT_RUN，Wave 2 整体未通过。E03/E05 继续实施，不进入 Wave 3。旧 attempt1/2 均原样保留为 FAIL，Gate 指向补偿它们的当前功能实测；原始日志、OS 回执及冻结输入可独立核对。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-neon-browser.cjs --verify=<功能或性能报告>`。生成报告的 `--out` 写新文件；性能必须持 Lead 授权并串行运行。小型正式 Gate 和审计可由 `output/shaders-absorption/lead-w2-e04-finalize.cjs` 重建到新输出路径，现有路径使用 wx，不覆盖历史。

## 13. Known limitations

仅两个解析 SDF，未实现上游 volumetric、SDF 贴图、shape JSON、center/origin 平台。mobile 为桌面模拟，非实体 iPhone；物理 GPU 内存不可观测；长时、跨标签页及公开资料独立 Agent Benchmark 未验。叶级元数据中的 Gallery NOT_RUN 指单独 Gallery 验证，不能用本 Gate 自动升级。

2026-10-10 汇总更新：完整冻结Wave2 Engine Gate已通过，见[Wave2十三项交付](wave2-validation-delivery.md)。上文本例时点的NOT_RUN描述保留历史；Agent Gate与单独Wave2 Gallery harness仍未运行。
