# Wave 2：三效果原生六维交付

2026-10-10 冻结批次：[Wave2 Engine Gate](../evidence/shaders-absorption/wave2-current-gate.json) PASS，
精确覆盖 E03 Holographic、E04 Neon、E05 Emboss。
当批 Wave1 前置也重新核对通过，允许进入 Wave3。2026-10-11 SDK 因独立 gfx 修复改变，本批通过属于原 SDK 身份，不能继承当前候选 PASS；当前身份需重新采集。Agent Gate 和整个计划仍未完成。

## 1. Goal

通过三个真实 SDF/材质消费者，验证 CocosAirJS 原生管线、算法、调参、资源和性能，并形成公共能力初稿。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。
每例 UPSTREAM.md、源 SHA 与许可通知独立保留，包含 Holographic 新取得的 silhouette 实现体。
没有嵌入 shaders runtime、TypeGPU、额外 canvas 或 iframe。

## 3. CocosAirJS APIs used

原生 Scene/Node/Camera、MeshRenderer、Material、EffectAsset、utils.createMesh、Component、createAirApp/createStepClock/createAirRenderTarget。
Emboss 两原生相机与子 RT；Neon/Holographic 单绘制 pass。诊断读回不充当第二渲染器。

## 4. Implementation details

执行渠道：**Orca Worker 小三**负责三个例子的实施与审查修复；**Lead**负责独立反例、修正部分采集接线、冻结输入、串行采集、审计和汇总。Wave0此前的原生子Agent结果不代替本轮Orca Worker终态。

| 效果            | 原生算法与数值判据                                                           | 独立六维交付                               |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| E03 Holographic | MaterialX Perlin / 皱褶法线 / 三等分色谱 / 上游轮廓 / 时间、seed和原始帧像素 | [交付](holographic-validation-delivery.md) |
| E04 Neon        | 五点SDF stencil / 管体、热核、解析双光晕 / 远场透明零 / HDR与RGBA8转换       | [交付](neon-validation-delivery.md)        |
| E05 Emboss      | signed height / 中央差分法线 / 双tap阴影 / 预乘child RTT与安全逆转 / UV warp | [交付](emboss-validation-delivery.md)      |

只接受绑定实际 shader、来源和格式的独立 CPU oracle。截图相似、自报PASS、仅像素相等或仅源码存在均不构成算法证据。

## 5. Tests performed

三个例子的 focused 合同分别110、113、109项通过；另有 Wave2 汇总结构/完整日志回归。合成PNG只用于Node合同，真实报告另外采集。

三个[真实报告审计](../evidence/shaders-absorption/e03-holographic-actual-audit.json)分别37/22/30种篡改全部拒绝；[Wave2汇总审计](../evidence/shaders-absorption/wave2-actual-audit.json)真实正基线接受，12种来源/范围/状态/前置/Wave资格篡改拒绝，browserRunsAdded=0。

全量库存独立刷新于 `output/shaders-absorption/lead-w2-inventory-os.json`，保留真实退出和失败项，不以 focused 通过冒称全仓库绿。库存过程中生成的spec-compliance副本保存到output，正典恢复为执行前原字节，保留并发改动。

本次实际 OS exitCode=1、signal=null：146 套、1786 项，1781 通过、5 失败；新增10套358项全部通过。五个失败分别涉及旧示例规格冻结、API evidence 行号、规格合规、Gallery 字段白名单、历史 browser-matrix 与当前 SDK 身份。保存的合规报告中 E03/E04/E05 没有 findings；全仓库未通过的事实不由 Wave2 子集替代。

## 6. Screenshots / visual evidence

三浏览器×三效果×六维，共54维度通过，0跳过。117个标准视觉案例及透明RT probes，654参数边界、54非法整批拒绝、9同页同Canvas resize；加上Holographic时间截图，共132张PNG。

PNG SHA/bytes、实际尺寸和算法像素重新读取，不信自报pixelComparison。Holographic另外验证两时刻透明RT、不同实例确定性、speed=0真实两帧与oracle；±2码值及固定时间变化阈值未放宽。

## 7. Performance evidence

三例各三浏览器×720p/1080p/mobile DPR2，共27配置，Lead串行安静窗口，原始OS退出0、输入前后不漂移。当前采集和性能窗口的开始/结束、命令、cwd、原始日志及冻结闭包逐例绑定。

CPU update、gfx envelope、GL draw派发、queue记账、AFTER_DRAW、GPU timestamp分开；Neon/Holographic一pass，Emboss双pass。Chromium可测GPU扩展，FF/WK不可用如实记录。AFTER_DRAW中位数约16.6–20.4ms，不等于显示呈现时延，不承诺60FPS或跨浏览器硬件排名。

mobile为CSS390×844、DPR2、backing780×1688，真实HTTP隔离COI=true；不是实体iPhone。物理显存不可用，引擎字节登记与GL对象数口径分开。

## 8. Resource/lifecycle evidence

三个效果共900轮create/retire：Neon/Holographic每轮三个引用，Emboss每轮六引用及child RT解绑/dispose，引用均1→0，内存计数回基线。renderer先解绑，节点/注册退役，借用runtime/scheduler/builtin/cache保留。

可信参数/暂停/恢复/重置/释放、幂等Promise、终态错误、页面/浏览器/HTTP服务关闭均实际观察。Gallery由175增至178项，每次只加入当前例，已有条目逐条保持。单独Wave2 Gallery生命周期harness仍NOT_RUN，不借native cycles升级；Wave1单独Gallery已有当前18行实证。

## 9. API/DX gaps found

三例发现并修复的当前问题主要为AGENT_FAILURE：复制元数据/不同pass门禁、RGBA8量化链、遗漏camera detach、背景污染、帧/时间错绑、PNG呈现过早、NaN穿透和自报旗标假绿。失败attempt均保留。

生成元数据、颜色格式、资源回调和提交/呈现区别进入DOC_GAP/API_DX候选，尚未确证新ENGINE_BUG/API_GAP。引擎源码和SDK三产物字节未变。

## 10. Workarounds used

复用shader-scoped Windows WebKit启动项、真实HTTP COOP/COEP隔离和Firefox导航后DPR修复。冻结模拟时间后等待compositor，不使用fresh page替代resize，不改变宿主设置。

## 11. Proposed engine changes

[SDF/Noise/Color公共能力初稿](wave2-capability-proposal.md)依据多个真实消费者区分可复用数学与不可合并的噪声、stencil、相位、alpha/色彩语义。当前优先Pattern、生成器检查和文档；没有新增core API。

## 12. Validation status

Wave2冻结Engine范围PASS，nextWaveEligible=true，projectCompleted=false，Agent Gate NOT_RUN。
E03前四个attempt、E04/E05旧失败和获取失败记录没有删除或重写；Holographic旧collector exit0不被冒称为完整Gate。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave2-gate.cjs --verify-wave=docs/evidence/shaders-absorption/wave2-current-gate.json`。
该入口重新检查Wave1前置、三个叶级Gate、当前源码/参考/PNG、OS退出/命令、范围计数和状态；不启动浏览器、构建、安装或写报告。

## 13. Known limitations

仅两个解析形状，无volumetric/SDF贴图/shape JSON平台；Holographic变速重映射相位，Emboss child RT固定256²。长时、多标签页、实体设备、独立Wave2 Gallery和Agent Benchmark未验。6/9首批效果已经通过各自Engine范围，完整9效果、四组合、公共能力验证、Agent Benchmark和研究模拟仍待后续Wave，不称发布完成。
