# E07 Liquid Metal：六维实证交付

## 1. Goal

2026-10-10：原生液态金属视觉材质的冻结解析形状范围通过六维 Engine 验收。[当前 Gate](../evidence/shaders-absorption/e07-liquid-metal-current-gate.json) 为 PASS，subset=true/completed=false；完整Wave3结论见[汇总交付](wave3-validation-delivery.md)；Agent Gate未验。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。LiquidMetal 主源 SHA256 `6af799e9654a0504cb19d038e925af9adaa8ad3c613baea368565a12fa3277b0`；材料、噪声、光照、真实获取的 materialParts/bevel 与 HTTP receipt 共8个参考输入逐字节绑定。来源与通知见[UPSTREAM](../../examples/shader-liquid-metal/UPSTREAM.md)。Fi-hash 浮雕噪声未采用，MaterialX 替代同类但不等价。

## 3. CocosAirJS APIs used

createAirApp/createStepClock、Scene/Node/Camera、MeshRenderer、Material、EffectAsset、utils.createMesh；createAirRenderTarget 仅用于同引擎诊断。单 Canvas，主预览单 pass，无上游 runtime、TypeGPU 或替代渲染器。

## 4. Implementation details

前向 SDF stencil、round/machined 倒角法线、flowWarp、MaterialX Perlin 中心差分浮雕、透视视线反射、三柔光灯程序影棚、glint 和色散。金属 ramp 从 #141414/#eef0f6 精确解码一次；直线性 RGBA 与预览 OETF/混合分别审计。细节见[算法说明](liquid-metal.md)。

low 共用一次影棚求值；high 两次求值并分离色散。质量是 uniform 分支，与参考构建期分支不同。time×当前 speed、seed 扩展及两解析形状的差异均披露。

## 5. Tests performed

Orca Worker 小三实施与修复；Lead 独立色阶/质量计划回归、实际采集、原始报告裁定。E07 三套81项通过，Wave3参数状态与可信控件门禁33项通过；合跑4套114/114。合成 PNG 仅 Node 合同，浏览器报告另采。

[真实审计](../evidence/shaders-absorption/e07-liquid-metal-actual-audit.json)接受两份真实正基线，46种篡改全部拒绝，browserRunsAdded=0。完整库存保留 Wave2 实际146套1786项、1781通过/5失败；本轮 focused 结果不冒充全仓库通过，新增库存待整波刷新。

## 6. Screenshots / visual evidence

三浏览器39个标准视觉案例及透明RGBA8 RT probes、48张PNG（含时间双拍和resize）。逐文件SHA/bytes/尺寸和独立算法像素重算；±2码值不变。两个时刻、不同实例确定性、speed=0两次实际绘制及原始时间/帧绑定通过。Lead额外目视检查默认Chromium画面，不以外观替代算法校验。

## 7. Performance evidence

三引擎×720p/1080p/mobile DPR2×high/low，共18个串行窗口。功能与性能两个OS子进程自然exit0/signal=null，输入前后完全一致；性能2026-10-10T02:24:55.077Z–02:27:53.264Z。每窗口25000次时钟标定，30帧预热，原生pass/draw逐帧记录，readPixels不进入计时窗口。

| Chromium GPU timestamp 中位数（ms） | high     | low      |
| ----------------------------------- | -------- | -------- |
| 720p                                | 0.477184 | 0.538624 |
| 1080p                               | 1.527808 | 1.433600 |
| mobile DPR2                         | 1.685504 | 1.638400 |

测量不保证low总是更快：720p实测即未呈该排序。FF/WK GPU timestamp不可用；AFTER_DRAW中位数CH/FF约16.64–16.70ms、WK约18.58–19.56ms。CPU update、gfx envelope、GL派发、队列记账与GPU时间分别保留，不据此做硬件排名或承诺60FPS。

质量标签额外绑定tierStart/fixedStart/fixedEnd全部实际参数、seed、viewport/backing、单Canvas和时间/实例；不能用自身参数拷贝证明冻结。性能页背景为main.ts默认[9,10,14]，功能PNG计划显式选择[8,9,12]；两计划不混淆。

## 8. Resource/lifecycle evidence

300轮实例退役，mesh/material/effect每轮各持有一份引用并1→0；renderer先解绑、节点/注册退役、内存登记回基线。可信参数/暂停/恢复/重置/释放、精确幂等Promise和LIQUID_DISPOSED终态通过；自有页面/浏览器/代理/服务器实际关闭。

Gallery新增Liquid Metal，178个旧条目逐项保持，现179项。此Gate证明example-native生命周期，单独Gallery harness仍NOT_RUN；引擎借用资源不销毁，物理显存unavailable。

## 9. API/DX gaps found

本轮AGENT_FAILURE：手写色阶常量错误导致系统性偏暗；质量档位只有标签/静态成本而缺双档窗口；参数自拷贝不能验证真实冻结，事件序列终点不能证明中间动作齐全。Lead补充独立门禁，真实基线与篡改一并验证。未发现新的已确证ENGINE_BUG/API_GAP。

## 10. Workarounds used

复用shader-scoped Windows WebKit合成启动项、真实HTTP隔离及Firefox导航后DPR修复。冻结模拟时间后等待compositor，不以fresh page替代live resize、不修改宿主设置。

## 11. Proposed engine changes

无core API改动。继续收集动态轨迹和Glass真实消费者，再依据整个Wave评估公共能力；不把示例错误归因引擎。

## 12. Validation status

六维Engine冻结范围PASS，Wave3/Agent Gate尚未通过。首轮Chromium attempt1实际exit1与90个错误保留；修复后functional-attempt2三引擎、performance-attempt1十八窗口均exit0，无输入漂移。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave3-gate.cjs --verify=docs/evidence/shaders-absorption/e07-liquid-metal-current-gate.json`。复算原始报告、OS/闭包与参数状态，不启动浏览器或写报告。

## 13. Known limitations

仅circle/rounded-box；不是流体模拟，无sphere3D/volumetric/SDF贴图平台。噪声替代非等价，速度改变重映射相位。移动profile为桌面模拟，不是实体设备；长时、多标签页、独立Gallery及公开资料Agent Benchmark未验。E08/E09及完整Wave3当前结论见[汇总交付](wave3-validation-delivery.md)，本叶级报告不独立解锁后续Wave。
