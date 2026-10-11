# E02 Native Thin Film

## 1. Goal

使用 CocosAirJS 原生 EffectAsset / Material / MeshRenderer / Camera，实现 circle 和 rounded-box 的内侧虹彩。线性 straight RGBA 核心与显示 OETF 独立；这是 cosine palette 视觉模型，不是物理光谱干涉求解。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。精确路径、字节数与 SHA 见 [UPSTREAM.json](../../examples/shader-thin-film/UPSTREAM.json)，原 MIT 通知见 [LICENSE.txt](../../examples/shader-thin-film/LICENSE.txt)。数学借鉴范围和未实现范围见 [UPSTREAM.md](../../examples/shader-thin-film/UPSTREAM.md)。

## 3. CocosAirJS APIs used

`createAirApp`、`Scene`、`Node`、`Camera`、`Component.update(dt)`、`MeshRenderer`、`utils.createMesh`、`EffectAsset.onLoaded`、`Material.initialize`、`Material.setProperty`、`Pass.update`、`createStepClock`、`createAirRenderTarget`。只有一个 GameCanvas，普通模式原生 pacer，验证模式单一 step clock。性能 instrumentation 在同一 Cocos GL 上下文调用原函数一次，不自行 draw。

## 4. Implementation

[原生入口](../../examples/shader-thin-film/src/main.ts)、[GLSL](../../examples/shader-thin-film/src/film.frag)、[参数同源描述](../../examples/shader-thin-film/parameters.json)、[参数拒绝函数](../../examples/shader-thin-film/src/parameters.ts)。shape 是 structure 更新，先退役再重建；其余是 uniform。拒绝未知键、wrong type、NaN/Infinity、非法 enum/范围，拒绝时不更新 SDK 对象。

解析 SDF 梯度用于法线；`fwidth` 只提供 AA 下限。所有 smoothstep 边界无需反向调用。内侧 rim 为 `(1-depth)^2*coverage`，相位为 `phase + dispersion*nDotLight + thickness*depth*2`。`phase` 对应上游 hueShift；未实现上游 scale/rotation/volumetric/custom palette/intensity>1，opacity 是本地扩展。

线性 straight core 输出通过原生 RGBA8 RenderTarget、关闭 blending、透明清屏直接逐点读取 RGB 和 alpha；之后 detach / dispose，恢复 default framebuffer。显示入口只在末尾应用精确 sRGB OETF，再 SRC_ALPHA / ONE_MINUS_SRC_ALPHA 混合到 display-code backdrop。这不是在线性空间合成，也不是上游 screen / linearDodge 算子；用于后续线性组合必须取 core 分支，不可重新解码其已混合显示结果。

## 5. Tests

[聚焦 Jest](../../test/smoke/shaders-thin-film.test.ts) 为 tmpdir 合成合同夹具，不称浏览器实证；本轮 `npx jest --runInBand test/smoke/shaders-thin-film.test.ts` 实际 31/31、exit 0。覆盖参数整体拒绝、56 descriptor 边界、SDF 符号/gradient、phase 周期、OETF、像素 oracle、资源全零伪基线/引用泄漏/重复 owner、性能 NaN/缺帧/DPR/预热/GPU timeout、查询 steady 完整覆盖及 operation 集合。

严格 TypeScript：`node node_modules/typescript/bin/tsc -p tools/verify/shaders-thin-film.tsconfig.json`，exit 0。collector 用 esbuild 内存编译并保存字节数，真实 WebGL2 compileShader 的源码/状态/日志单独记录。

## 6. Screenshots / visual evidence

最终原始报告为 `output/shaders-absorption/e02-final-functional-{chromium,firefox,webkit}.json`：三次独立 collector CLI 实际 exit 分别为 0、0、1。每个报告旁 `-artifacts/` 保留八种显示状态和同页 resize PNG，共 27 PNG。circle、box、phase 周期、反光方向、alpha 0、半透明暗/亮背景，独立 CPU oracle 与实际 PNG 坐标对照均在冻结 2 个 RGBA8 code value 内。容差来自源值/混合/clear 各至多半单位量化与 float32 误差，不用截图相似率。

三份报告的 linear straight core：13 个 SDF domain 点 × 三浏览器，独立数值梯度、双像素 derivative AA、cos palette 与未混合 RGBA8 读回对照，包含外部 alpha 0、内部透明和 rim 半透明。正常显示与线性核心分别验证，不能互相替代。fixed state 从实际 snapshot 记录 viewport、DPR、time、step、input 和 params，未用通用模板回填。

WebKit 26.6 同页 live resize 未通过：480×320 的 PNG 全为 body 的 `[16,32,48,255]`，非背景像素 0；同帧 AFTER_DRAW GPU 13 点仍正确。frame 在 END_FRAME 后加一（源码语义）；记录 frame/FBO/viewport/targetTexture / drawCalls。五个稳定 step + 双浏览器 RAF 与原生 pacer 连续帧均未恢复。Lead 另有同环境、无本例 shader 的 layer 诊断：GL/canvas 导出仍正确、PNG 露出 body，证明 canvas 合成呈现限制；不以导出或 readPixels 替代 resize PNG PASS。

## 7. Performance evidence

最终实测报告 `output/shaders-absorption/e02-final-performance.json`，collector 实际 exit 1。窗口 `2026-10-09T01:02:10.521Z`–`01:03:27.179Z`，三浏览器各 720p / 1080p / 390×844 请求 DPR2，单个 Agent token 窗口串行执行，30 warmup 后 steady 记录。CPU update、native gfx 方法 CPU envelope（包含即时 GL dispatch）、同上下文实际 GL draw 调用 CPU 时间、Queue.submit 统计 bookkeeping 分开。AFTER_DRAW 间隔不是显示器 present。窗口期间实际 `readPixelsDuringWindow=0`，不截图。

| 引擎 | 720p steady | 1080p steady | mobile steady | 观测精度 | 范围结果 |
|---|---:|---:|---:|---:|---|
| Chromium 149.0.7827.55 | 329 | 330 | 328 | 约 0.005ms | 三 profile PASS |
| Firefox 155.0 | 328 | 328 | 329 | 约 0.020ms | mobile 请求 DPR2、实际 DPR1/backing390×844，Performance LIMITED |
| WebKit 26.6 | 328 | 282 | 326 | 1ms | 三 profile 可测；Runtime resize 仍 BLOCKED |

Chromium steady GPU query p50 为 0.187392 / 1.324032 / 0.701440ms；每个 steady frame 有唯一 begin/end/resolved/deleted 实测配对，`gl.isQuery` 删除后为 false，预热不混入 steady 数组。FF/WK 扩展不存在，保留 unavailable。COOP/COEP 只由本 collector 的本地响应头策略设置；原始 HTTP 响应、`crossOriginIsolated=true` 与最小正计时差均保留。零样本是低于可观测精度，不是零成本；WebKit queue-bookkeeping 全零作为额外指标如实保留，必需 update/command/GL-dispatch 都有真实正样本。

Firefox mobile 的 collector 明确 `deviceScaleFactor:2`，实际 `window.devicePixelRatio=1`、CSS/backing390×844，不符合冻结请求范围；不把期望改成 DPR1 补绿，当前归为未定位协议/配置环境限制 `INFRA_FAILURE`，不主张 SDK bug。720p/1080p 数值保留，但完整三 profile Gate 标 LIMITED。

无真实手机、后台 OS 负载不能完全隔离。其他 Agent 的先前短 decode 结束于约 01:01:34UTC，早于本窗口；不能据此宣称主机绝对无竞争。GPU physical memory unavailable，VRAM 仅 bufferSize+textureSize 的引擎侧估算，原生 GL create/delete 对象 trace 独立复算 texture/buffer counts。

## 8. Resource/lifecycle evidence

同一 app 100 轮真实 effect / material / mesh 实例：每资产先 addRef 持有一份，renderer 先解绑，node remove/destroy，再 decRef；仅自有 refCount=0 的 Code First 资产显式 destroy，绝不 force 释放借用缓存。所有三类 refs 1→0、valid=false、registry 移除、重复退役幂等。每轮 bufferSize 创建增长 396B，释放回固定基线；textureSize 无自有增量。内存是引擎计数，不等于 GPU 物理内存。runtime / scheduler / builtin / PSO caches 借用且不销毁。

## 9. API/DX gaps found

API_DX：Code First 的无 UUID 临时 Asset 只 decRef 不保证及时原生 gfx 回收，示例必须正确归还引用并显式销毁自己的零引用资产；已有合同边界，不主张新 ENGINE_BUG。API_DX：BEFORE_UPDATE 事件无 dt，正确推进在原生 Component.update(dt)。DOC_GAP：Queue.submit 在本 WebGL2 路径仅统计，不能称 GPU 命令提交。

EXAMPLE_GAP：本例尚未提供 legacy Gallery `__lifecycle` hook，已从 Gallery metadata 移除不能执行的 `resource-released` 声明。独立 collector 的 100 周期 × 三浏览器（300 实例周期）Resource 证据保持有效，但不冒称 Gallery 通路已验。`api.claims` / executable `sourceLocation` 是绑定声明；`status=draft` 保持不变。

## 10. Workarounds used

无额外 renderer 或 canvas 绕过。vec4 UBO 打包、显式 SRC_ALPHA 状态、原生 RGBA8 诊断 target、精确 OETF；这些是本例局部实现。失败 attempt 1–8 保留：TDZ、event dt、只 decRef 泄漏、初版漏 resize 裁定、采集期间源码漂移等均是 EXAMPLE_GAP / AGENT_FAILURE，不算引擎 bug。旧性能 attempt1 的源码快照独立保存，不借其测量给当前源码。

## 11. Proposed engine changes

本批无 SDK / 抽取源码 / 公共 Noise/SDF/Color API 修改。等多个真实消费者后再考虑薄 authoring helper；当前不抽象。

## 12. Validation status

执行渠道为 native subagent。轻量索引 [e02-thin-film-summary.json](../evidence/shaders-absorption/e02-thin-film-summary.json)，全量原始数据/三份规范化报告保留在 `output/shaders-absorption/`；当前规范化文件为 `e02-engine-{chromium,firefox,webkit}-final.json`。各 gate 的独立只读 scoped CLI 保留真实 command/cwd/start/end/exit/log SHA，目的为 `VALIDATION_OF_REAL_BROWSER_CAPTURE`；其 exit 0 不能改写 `collectionExecution` 的原始 exit 1。

| 引擎 | Build | Runtime | Visual | Boundary | Resource | Performance |
|---|---|---|---|---|---|---|
| Chromium | PASS | PASS | PASS | PASS | PASS | PASS |
| Firefox | PASS | PASS | PASS | PASS | PASS | LIMITED |
| WebKit | PASS | BLOCKED | PASS | PASS | PASS | PASS |

三份规范化 schema 均合法，237 个声明 case 中 227 measured、10 skipped（FF Performance 3；WK Runtime 7，其中 resize BLOCKED，其余阶段真实观测但完整 Runtime scoped CLI 非零，诚实 LIMITED）。100 周期在各 Resource case 内保留原始 trace，不用单 case 数替代周期数。实际报告 clone 审计 `e02-final-output-audit.json` 接受 3 份 baseline，72/72 篡改拒绝、exit 0、无新增浏览器。

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/shaders-thin-film-summary.cjs --verify=docs/evidence/shaders-absorption/e02-thin-film-summary.json
```

该只读校验实际 exit 0、`effectStatus=BLOCKED`、`Agent Gate=NOT_RUN`；schema 合法不等于全部通过。Engine 六维完整 Gate 尚未 PASS，不能推进 Wave2。首次大规范化文件仅为本轮新建，已按 Lead 方针逐字节迁入 `output/shaders-absorption/e02-normalization-history/`，before/after path+SHA 见 `migration.json`，没有删除其他历史或用户文件。

## 13. Known limitations

两种固定解析 2D shape；非物理光谱；未得全组合上游运行截图，不称参考 runtime 等价；正常显示为 display-space straight blend；没有 HDR intensity>1 / volumetric / arbitrary SDF / custom palette。RGBA8 核心有量化；100 周期不是长时压力测试；无真实移动设备/GPU 物理量。WebKit live resize compositor 和 Firefox mobile DPR scope 缺口仍保留。SDK/抽取源码零修改，未 stage/commit/push。
