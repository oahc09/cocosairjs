# C01 Laser Card：固定十三项交付

## 1. Goal

2026-10-11：[当前 SDK C01 六维 Gate](../evidence/shaders-absorption/c01-laser-card-current-sdk-gate.json)在本地 Holographic → Emboss → Sparkle、circle/rounded-box 子集内 PASS。旧 SDK 的 [2026-10-10 Gate](../evidence/shaders-absorption/c01-laser-card-current-gate.json)保留为历史。`subset=true`、`completed=false`；完整 Wave4 的当前前置身份、独立 Gallery 和 Agent Gate 单独核对，不解锁 Wave5。

## 2. Upstream references

固定 shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a。Holographic、Emboss、Sparkle 及相关 helper、真实获取的 kit/materialParts 源码和 HTTP 回执共 11 个参考文件绑定 SHA/bytes。MIT 通知束随例保留，未执行上游 runtime 或 TypeGPU。这是本地卡片组合，不称上游预设。详见[来源与算法边界](../../examples/shader-laser-card/UPSTREAM.md)。

## 3. CocosAirJS APIs used

createAirApp/createStepClock/createAirRenderTarget、Scene/Node/Camera、MeshRenderer、Material.initialize/setProperty、EffectAsset、utils.createMesh/gfx。八条 API evidence 用生产定位器核对实际可执行行，定位器与 API 库存均纳入闭包。三相机同 Scene，单 canvas；线性诊断使用公开 render-target API，未用额外渲染器绕过引擎。

## 4. Implementation details

Holo 保留完整 MaterialX 噪声、前向 SDF stencil、pillow/皱褶法线、色谱、光照、grain/flake；输出线性预乘 RGBA8 到 RT1。Emboss 保留 EPS=.003 中央差分、signed depth、两次空间阴影、UV warp，实际采样最近邻 Holo 纹素，输出线性预乘到 RT2。Sparkle 的两层四邻居读取真实组合内容，使用 CSS 网格与真实 seed uniform；中间不 OETF/EOTF，最终一次 OETF。

组合 oracle 复用母效果的独立 JS 数学函数，逐段计入两次 RGBA8 预乘量化、NEAREST/CLAMP、纹素中心、实际 warp 和 Alpha 安全逆预乘。20 参数含只读 time；shape 结构重建，其余 uniform 同步。Holo 关闭提供非零 gray64/96 棋盘；Emboss 关闭禁用该相机并直接采样 RT1（3 draw → 2 draw）；Sparkle 关闭保留最终显示 pass。RT2 在旁路时仍持有，不宣称即时节省纹理内存。

## 5. Tests performed

执行渠道：**Orca Worker** 提供初稿及部分 CPU 修复；因 `429/1308` 限额异常中止，**Lead** 接管完整 GPU 算法、实际纹素采样、旁路、线性诊断、采集合同、Gallery 接线和真实验证。Worker 中断不是成功终态；外部服务限额按 INFRA_FAILURE 记录，不计 Engine/Agent 算法失败。

三套 **105/105**：基础数学 26、Lead review 28、完整 acceptance 51。正例覆盖三引擎 39 capture 和九个性能 tuple；负例从生产验证器接受的基线出发，包含 DPR/seed、旁路、两 RT、七引用、可信事件、时间、三遍命令、读回和关闭状态。tmpdir 合成 PNG 仅 NODE_CONTRACT。

[真实报告审计](../evidence/shaders-absorption/c01-laser-card-actual-audit.json)接受两个当前实测基线后，structuredClone 的 **56 类变异全部拒收**；NaN 原值不经 JSON 变 null，browserRunsAdded=0。Gate 另有 13 类实测克隆拒绝，涵盖伪 Agent/Wave PASS、范围膨胀、缺绑定、引用类别和伪造 GPU 成本。源代码、格式和每阶段 strict/bundle 实际日志均已核对。

## 6. Screenshots / visual evidence

Chromium 149.0.7827.55、Firefox 155.0、WebKit 26.6：**39 标准视觉案例**，各有 compositor PNG 和透明线性 RT 读回；另六张时间对照及三张同页 resize，合计 **48 PNG，不是 48 算法案例**。独立母数学加实际采样组合逐点复算，±2 未放宽；包括三层开关、中性卡片、凹凸/阴影、形状、DPR2、暂停/恢复和真实 warp。Lead 目视检查圆形、WebKit DPR2 圆角矩形及全关棋盘，仅作为数值证据补充。

## 7. Performance evidence

2026-10-10T07:06:32.326Z–07:08:07.741Z，三引擎×720p/1080p/mobile DPR2，共九个串行窗口；功能阶段已结束，无并行采集。默认三层开启、完整 fixedStart/fixedEnd 状态绑定，原生 pacer、30 帧预热。每稳态帧至少三个 beginRenderPass 和三个真实 GL draw；窗口 readPixels=0。

Chromium GPU timestamp 中位数：720p **1.746944ms**、1080p **3.889152ms**；mobile **4.302848ms**；全部 CPU/GPU 数据见 Gate 的原始数据重算表。FF/WK GPU timestamp 不可用。CPU update、gfx wall envelope、GL 派发和队列记账分别报告；观察到 0ms 表示低于时钟分辨率，不代表零成本。AFTER_DRAW 间隔不是显示帧率，mobile 是桌面浏览器模拟 viewport/DPR，不是实体 iPhone 性能。物理显存不可用。

真实 HTTP 隔离、导航后 Firefox DPR 修复及完整 25000 次时钟标定均校验。DPR 修复后在 timed window 外提交两个原生帧，使两 RT 先同步 backing，再取 fixedStart；不把修复或读回计入性能窗口。

## 8. Resource/lifecycle evidence

300 轮退役，每轮 Mesh + 三 Material + 三 Effect 的 **七份引用 1→0**，合计 2100 份配对归还；renderer 先解绑、节点移除销毁、registry 清除。两个 attachCamera 回调分别 detach，再 dispose；bindColor 解绑与相机 detach 独立。实际 assetsValid 数组全部 false，纹理/缓冲登记回到基线。

可信调参/暂停/恢复/重置/释放、精确 Promise 幂等及 LASER_DISPOSED 终态通过；页面、浏览器、代理、服务器实际关闭。Gallery 182→183，原有 182 项 deepEqual 保留；桥接已实现，**独立 Gallery harness 仍 NOT_RUN**，不借原生资源轮数升级。

## 9. API/DX gaps found

没有新增确证 ENGINE_BUG/API_GAP。此前算法简化、无效 crinkle、warp 未消费、错误 EOTF/blink、元数据/seed/DPR 错接、漏相机 detach、模板字段和七引用合同缺失按 AGENT_FAILURE/EXAMPLE_GAP/DOC_GAP 修复。

性能首轮真实 FAIL：Firefox mobile 已修复 canvas DPR，但 fixedStart 在两 RT 同步之前取样（390×844 对 780×1688），生产门禁正确拒绝。修复采集时序后重新冻结并复采；旧 FAIL 完整保留，不归因为新的 SDK 缺陷。

## 10. Workarounds used

复用 shader-scoped Windows WebKit 合成启动项、真实 HTTP COOP/COEP 和 Firefox 导航后协议 DPR 修复，不改宿主设置。实时 resize 是同页操作，未用 fresh page 补偿；所有诊断读回在 timed window 外。合成合同用 zlib 写 PNG、pngjs 真解码。

## 11. Proposed engine changes

本例未修改 SDK/core，未新增公共 API。两 RT 路由、旁路、预乘量化、实际源内容和三遍成本为后续组合对照提供证据；C03/C04 全通过后再提炼最小公共能力，不提前宣布通用融合器。

## 12. Validation status

2026-10-10 功能 all-attempt2：07:05:18.431Z–07:06:04.628Z；性能 all-attempt2 如上。该批两个 OS 自然 exit0/signal=null/error=null/inputsUnchanged=true，**38 输入 + 11 参考**同闭包，阶段不重叠，属于当批 SDK 身份。

2026-10-11 Lead 对当前 SDK 69127f39/5b67a560/b7771393 重新采集：lead-w4-current-sdk-c01-functional-attempt1 UTC08:09:48.583–08:10:36.277；performance-attempt1 UTC08:11:16.448–08:12:52.612。两个 OS 自然 exit0/signal=null/error=null/inputsUnchanged=true，38+11 同闭包；39视觉/48PNG/294边界/18非法/300资源/3resize/九性能窗口，2953稳态帧，56类实际报告篡改全部拒收。未修改效果算法、母 oracle、SDK 或原有报告。当前只读入口改用 `shaders-laser-card-gate.cjs --verify=docs/evidence/shaders-absorption/c01-laser-card-current-sdk-gate.json`。

首次 Chromium、首次三引擎功能的历史实测及首次性能 FAIL、初审17/28条失败、中断前源字节均保留。冻结 README/example.json 的采集前 NOT_RUN 描述记录当时状态；当前裁定以本 Gate 为准，Gallery metadata 保持 draft。只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-laser-card-gate.cjs --verify=docs/evidence/shaders-absorption/c01-laser-card-current-gate.json`。

## 13. Known limitations

仅两个解析形状、本地组合及所声明参数面；两次 RGBA8 量化是管线语义，不承诺无限精度/HDR。实体设备、长时、多标签页、独立 Gallery 和 Agent Gate 未测。完整 Wave4 仍需当前前置身份一致性，不推进 Wave5。156套/2088项、2083通过/5个既有失败为此前库存记录，未因本例或本轮重采改写为全绿；本轮没有重新执行全库库存。
