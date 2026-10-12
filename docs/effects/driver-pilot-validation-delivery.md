# Effect Driver Pilot：十三项交付

2026-10-11。执行渠道为 Lead（Codex）与 Orca Worker 小三。Worker 提供初版纯 Driver 与运行页及冻结副本准备；Lead 完成生产运行链、独立 oracle、真实 collector、完整接受正例和篡改拒收。真实浏览器与性能采集由 Lead 执行。

## 1. Goal

声明式 pointer-position、pointer-x/y、time、auto-animate、map-range 接入 Cocos AIR 原生 Component 主循环，完整 Holographic 和 Neon 实际消费其结果。七个冻结案例区分范围钳制与外推。没有新增 core API。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`，完整复用本地已实现 E03/E04 母片段、默认参数与独立 CPU 模型。Driver 是本地设计，不称上游 PropDriver 同算法。MIT/MaterialX/OSL 通知随 [Pilot](../../examples/shader-driver-pilot/UPSTREAM.md) 保留。源、传递 oracle 依赖、工具、配置与 SDK 共 39 个文件写入不可变候选清单。

## 3. CocosAirJS APIs used

createAirApp、createStepClock、Scene、Node、Camera、Component、MeshRenderer、Material.initialize/setProperty/getProperty、EffectAsset、utils.createMesh、createAirRenderTarget。只有一个原生 canvas；没有上游 runtime、TypeGPU、iframe 或第二渲染 canvas。

## 4. Implementation details

纯 Driver 先批量校验，再修改状态；拒绝未知键、非有限值、错误默认类型、重复目标、逆序/零输入区间、部分 range 和错误 clamp。Getter/cycle 不被执行。暂停冻结 pointer 和 time，reset 推进代次并清空会话，终态抛 DRIVER_DISPOSED。

独立 oracle 从原始可信事件的 client 坐标和 rect 重算 UV，按实际 dt 重放，再核对真实 Material.getProperty 回读、完整母参数、节点位置、RGBA8 线性探针和 compositor PNG。两个母顶点的 clip-space 输出均改为原生世界矩阵，保证位置真的被 GPU 消费；完整母片段没有改写。临时诊断材质/RT 在 finally 清理后组装回执。

## 5. Tests performed

聚焦 Node 四套件共 105/105：完整三引擎功能及 18 tuple 性能合成正例、40 个 acceptance 测试与 Driver/消费者合同。合成 PNG 只在冻结采样点绘制，明确 NODE_CONTRACT，不作为真实渲染证据。

候选真实 strict tsc exit 0、esbuild exit 0，bundle 88,149 bytes；自身源符合仓库 Prettier。真实功能 OS 自然 exit 0/signal null/error null/inputsUnchanged true，15:46:53.986–15:48:50.985 UTC。

## 6. Screenshots / visual comparison

三浏览器 × 两消费者 × DPR1/2 × 七案例，共 84 组 compositor 与线性 RT 双证明；另有 12 张活 resize PNG，共 96 张。所有点以母算法独立重算，容差保持 ±2 码值；无放宽或截图相似推断。Lead 另实际查看 Chromium Holographic pointer-x 成品 PNG，不把单张目视扩大为全量审计。

## 7. Performance measurements

18 个串行窗口通过，共 5,853 个 steady 帧。每窗先进行 25,000 次时钟校准，真实 HTTP COOP/COEP 隔离及导航后 DPR 修复，再测 6 秒原生循环、丢弃 30 个 warmup 帧。性能 OS 自然 exit 0/signal null/error null/inputsUnchanged true，15:50:28.743–15:53:51.831 UTC；与功能阶段不重叠。

分别记录 Driver update、native gfx CPU wall envelope、实际 GL draw dispatch、AFTER_DRAW frame interval、同上下文 GPU timer（可用时）、内存计数。插桩开销明确披露；CPU envelope 不称 GPU time，GPU/VRAM 不可用不填零或估造。定时窗口不执行 readPixels。

18 配置的 update 中位数 0.20–0.28 ms、render envelope 中位数 0.38–0.50 ms。Chromium Holographic 的 GPU 中位数为 0.610/1.253/1.968 ms（720p/1080p/mobile），Neon 为 0.388/0.890/0.870 ms。Firefox/WebKit GPU timer 不可用，明确 null。计时前及中途检查未发现 Jest/构建进程；不是宣称完全隔离机器或未插桩基准，没有基于这些绝对值许诺通用帧率。

## 8. Resource lifecycle

共 1,200 次真实创建/退役；每次 mesh/material/effect 独立持有 1→0，解绑 renderer、移除 registry/node、双步推进延迟销毁，内存回基线。临时探针材质/RT 独立退役并保持原实例、时间、输出与账本。真实 pause/resume/reset/release 控件、精确 release Promise 幂等、监听账本和释放后 dispatch silent 一并检查。

## 9. API DX gaps

没有新增引擎反例。母 fullscreen 顶点不消费 Node 变换是实现语义；Driver 的接线曾未适配，分类 AGENT_FAILURE。Material.getProperty 的实际回读为消费者证据，不依赖页面自报映射结果。

## 10. Workarounds

并行 Spark 工作多次重建 SDK，改变构建时间/编号。当前工作区采集因此正确拒收。使用独立不可变文件副本与现有依赖解析；没有修改、暂停或回退并行 SDK。冻结候选结论与当前工作区 freshness 分开。

## 11. Proposed engine changes

无。Driver 暂留 example-local utility，两个消费者实测证据用于后续 API 归属判断。没有替换 Scene/Material 抽象。

## 12. Validation status

冻结候选六门 PASS，见[Driver 叶级 Gate](../evidence/shaders-absorption/wave5-driver-pilot-frozen-gate.json)。候选 module `27b1526b…`、dts `5b67a560…`、npm `c6d3c7d0…`。真实两阶段正基线先接受，再对实际报告 structuredClone：34/34 数据篡改和 7/7 Gate 篡改全部拒收，NaN 在内存保留。源、39 文件 manifest、原始数据、OS 自然退出、采集前 frozen 和日志均绑定。

旧 functional r1/r2/r3 与正式工作区 r1 拒收报告均保留；从未重标为当前 PASS。[工作区 freshness](../evidence/shaders-absorption/wave5-driver-pilot-workspace-freshness.json) 实际 `currentSdkMatches=false`，SDK 当前验收为 BLOCKED。没有忽略时间/编号来假定字节等价。

Agent、独立 Gallery、Wave5 当前 SDK 汇总、项目完成和发布不由此自动升级。

## 13. Known limitations

只验证两个固定消费者及其开放的驱动字段，不宣称通用 Effect runtime。实体移动设备、长时、多标签页与 Agent Benchmark 未运行。原生 GPU timer 不可用的平台只报告 CPU 与 frame interval。工作区仍存在并行构建，完整当前 SDK 前置链需要在稳定字节下重验；候选 PASS 不能代替该重验。
