# E06 Sparkle：原生实现与验证合同

2026-10-09。执行渠道：native subagent。范围仅 E06；不代表 Wave 1、其他八个效果、Agent Gate 或 release 通过。

[示例](../../examples/shader-sparkle/README.md)使用 Cocos `EffectAsset → Material → MeshRenderer` 和 `Texture2D`，单 Camera 与单原生主循环。测试模式明确停止 native pacer，再使用一个 `createStepClock`；普通模式使用 `Component.update(dt)`，不从无 dt 的 Director 事件推断模拟时间。参考 commit、文件与通知见 [UPSTREAM.md](../../examples/shader-sparkle/UPSTREAM.md)。

## 算法、颜色和透明合同

straight sRGB RGBA8 输入先 inverse OETF，alpha 不做 gamma。两层 jittered grid 采用独立 uint hash，每层四个邻格；第二格尺度为 2/3。亮度 `dot(linearRGB,[0.2126,0.7152,0.0722]) * alpha`，阈值输入为其平方根，band 固定 0.12。expand 只增加中心之外四个 ring taps，以最大 alpha-weighted luma 选色，角度每层差 45°。

核心是 `linearAssociatedRGB = inputLinearRGB * inputAlpha + glow`、`coverage = min(inputAlpha + max(glow), 1)`。intensity 0 原生 rgba16f 回读需保持四通道；alpha0 的高 RGB 不提供亮度。`Gaussian core + exponential horizontal/vertical rays` 乘半 cell 的 Chebyshev reach 窗；blink 正半弦连续平方三次得到八次方。colorize 在 linear RGB 中计算。独立 hash 与 1/4096 seed 量化不等同上游 Fi 派生位置，不能宣称逐字节复现。

预览是独立适配：unassociate → OETF → associate，`ONE / ONE_MINUS_SRC_ALPHA` 原生混合。黑、白、色背景均校验；compositor PNG 的 alpha 不替代 effect 自身 coverage，后者另由同一 Camera 原生 rgba16f `AirRenderTarget.readColor()` 诊断。测试 RT/material 只在采证窗口创建，先 detach/restore 再 dispose/归还引用，性能窗内禁止诊断读回/截图。

## 参数（元数据单一事实源）

[parameters.json](../../examples/shader-sparkle/parameters.json) 为完整元数据。step 仅 UI 步进，不暗中钳制、舍入或拒绝连续合法数值。

| 参数 | 默认 | 范围 | 更新 | 单位/语义 |
| --- | --- | --- | --- | --- |
| size | 100 | 10–200 | uniform | CSS px，散点格间距 |
| intensity | 10 | 0–20 | uniform | linear glow gain，0 为核心 RGBA 恒等 |
| threshold | 0.2 | 0–1 | uniform | sqrt(alpha-weighted linear Rec709 luma) |
| expand | 0 | 0–100 | structure | CSS px，跨 0 重建；同侧仅 uniform |
| rayLength | 5 | 0–20 | uniform | 沿轴 falloff=0.45/max(value,0.01) |
| colorize | 0.45 | 0–1 | uniform | linear 色度混合比例 |
| speed | 1 | 0–5 | uniform | 单时钟模拟时间倍率 |
| seed | 0 | 0–100 | uniform | 独立 hash seed，量化 1/4096 |

逐参数 default/min/max/near-min/near-max/invalid 原生 update 回执共 48 条；未知字段、非有限值、越界拒绝 `SPARKLE_PARAMETERS`，终态 `SPARKLE_DISPOSED`。

## 六维证据与测量方法

功能命令 `NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-sparkle-browser.cjs --phase=functional --out=<new-e06.json>`：严格 TS、esbuild、真实 native GPU shader、明暗/alpha/阈值/射线/seed/time/expand/identity/DPR 的 CPU→原生 linear RT 与 compositor 双链、可信普通控制、同页 resize、同 app 100 原生实例循环。每个 PNG 按实际 pixel centre / backing / CSS 尺度重新计算 CPU 独立 oracle，不接受页面自报 pass。

资源需要正分配、固定 owned-count 基线、texture/buffer 逻辑 bytes 回基线、每一 native mesh/material/texture ref 1→0、解绑/延迟 node destroy 后实际 validity false。100 effect instances 不是 100 app init。正常引擎 scheduler、builtin/program/PSO 缓存借用保留。两份自创建 EffectAsset 在实例间共享，但 app.release 核验注册表 identity 后 remove，并各自 refs 1→0/destroy；不把自有模板混同借用缓存。物理 GPU residency/memory unavailable。

性能另用 [串行工具](../../tools/verify/shaders-sparkle-performance.cjs)：CH/FF/WK × 1280×720、1920×1080、390×844 DPR2；原生 pacer 30 帧 warmup + 60 帧稳态，不重放读回。独立数组分别包围 `Component.update`、原生 `CommandBuffer` 方法 envelope（含即时 GL dispatch，非纯编码）、实际 `gl.draw*` 原调用 CPU dispatch；`Queue.submit` 只累加统计，作为单独 bookkeeping，不冒称实际 GPU 提交。AFTER_DRAW interval 是 CPU frame 回执，不是显示器 present。支持时同一 Cocos GL context EXT timer 包围实际 native draw，标记 TOOL_DIAGNOSTIC；逐 query frame/result/disjoint/timeout/delete 留痕，稳态只选择对应 frame。无第二 canvas、自行 draw 或 SDK 补丁。

计数 draw/pass 为实际预览全帧路径，pass 由 beginRenderPass 原始记录重算（materialPassCount 另列单材质 pass）；texture/buffer 数量仅是自身 gfx 分配，bytes 单独列出；VRAM 仅解析估算 `128²×4 + 4×5×4 + 6×2 + 3×16`，不包含借用缓存、swapchain 或驱动。viewport 模拟不是实体移动设备。此轮 performance scope 验完整测量，不声称普适 FPS SLA。

## 首轮事实与限制

功能 attempt1 中三浏览器 Build/Boundary/Resource 已过；普通算法/linear RGBA oracle 命中。白/色背景失败定位为本例误用 BlendFactor 数字 7（DST_COLOR），已修正具名枚举 4（ONE_MINUS_SRC_ALPHA），分类 AGENT_FAILURE，不是引擎问题。临时诊断 readback 首次报错是本例 AFTER_DRAW 在浮点 RT 上错误 UNSIGNED_BYTE 读取并污染 GL error，已禁止该诊断中的默认读回；Fragment output 名误用已修正。所有历史 attempt 保留。

WebKit 同页 640×400 → 480×320：第一轮 PNG 显示黑色 body 背景而原生 float RT/GPU 回读有色。原生 pacer 三帧与再定步未改善最小诊断。Lead 已通过本轮 native builtin 原生控制、同坐标 GL/export/CSS/body 底色实验定位 canvas 合成截图限制；此行标 INFRA_FAILURE/BLOCKED，不算算法或 Agent 失败，不主张 SDK ENGINE_BUG，亦不以 fresh-page 补偿同页 resize。Wave Gate 未过不得推进 Wave 2。

## 当前终态（2026-10-09）

[轻量最终摘要](../evidence/shaders-absorption/e06-final-summary.json)保存 SHA+bytes bindings；完整 numeric/PNG/ref/query 链在 output，不重复嵌入大 raw。[最终验证工具](../../tools/verify/shaders-sparkle-final.cjs)从当前源码/SDK身份、外部冻结 scope、真实 PNG、CPU 数学 oracle、原采集/独立验证日志重新核验。`ok:true`表示证据合同一致，不等于本效果全浏览器 PASS。

| 引擎 | Build | Runtime | Visual | Boundary | Resource | Performance |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium | PASS | PASS | PASS | PASS | PASS | PASS |
| Firefox | PASS | PASS | PASS | PASS | PASS | PASS |
| WebKit | PASS | BLOCKED（同页 resize PNG） | PASS | PASS | PASS | 未完整：720p/1080p PASS，mobile LIMITED |

原始功能采集 `e06-functional-owned-closure.json` 实际 exit=1，原始性能采集 `e06-performance-precision-attempt2.json` 实际 exit=1，不被独立验证改写。功能 PASS 叶子与性能八个 PASS 行使用实际只读子进程 exit=0、`purpose=VALIDATION_OF_REAL_BROWSER_CAPTURE`，方法仍为原生真实浏览器捕获；未伪造整条 collector exit=0。WK blocked/limited 未补偿。原始报告、冻结 inputs、PNG、refs、query terminals、scoped logs 的 SHA 均由摘要绑定。

实测规模：三浏览器 60 Visual 案例、144 参数边界、300 同 app 实例循环、六份 app 级自有 EffectAsset 退役；66 PNG（含每浏览器 resize 前后）。真实报告 21 类克隆篡改全拒，baseline 真实接受、browserRunsAdded=0；total verifier 对 null/string/array/empty/missing rows 均结构化拒绝。31 个 Node SYNTHETIC 合同测试是单独的临时 PNG 夹具，不冒称浏览器证据；其最后执行早于 app 级 registry gate 加严，最终真实 Resource 三浏览器再次验证通过。

性能精度诊断仅工具侧为同源响应添加 COOP same-origin / COEP require-corp；单 Cocos context、SDK不变。三浏览器 crossOriginIsolated 实测 true，但时钟 minimum positive increment 为 CH约0.005ms、FF约0.02ms、WK1ms。WK mobile 的60个原始 GL dispatch 调用被量化为0：明确表示低于观测精度，不是零成本、不是 PERFORMANCE_GAP，也不松开 PASS 对假全零的拒绝。该行 LIMITED/INFRA_FAILURE，Performance 总范围未完成。Headers 和 calibration 原始增量数随行保存。隔离诊断窗口与普通页面性能条件不同，不能当普通页面预算验收。

CH 三 profile 各60个稳态 GPU query 对应真实原生 frame、非 disjoint，结果和 gl.isQuery 删除观测可追溯；FF/WK 实际扩展 unavailable。GPU物理内存 unavailable。AFTER_DRAW frame median（60样本中间二值）为 CH约16.59–16.70ms、FF约16.66–16.71ms、WK16/19/16ms；它不是 present 或普适 FPS SLA。draw=1、实际 beginRenderPass=1、materialPass=1；owned texture=1、buffer=3，解析 VRAM估算65,676 bytes。

首次纯汇总调用漏 NODE_PATH 导致 pngjs 不可解析，错误中间结果 `e06-normalizer-nodepath-attempt1.json` 保留，分类 AGENT_FAILURE 调用配置；正确 NODE_PATH 下重新纯验证通过，无新增 browser runs、不污染已采浏览器事实。

未执行 Agent Gate，不宣称完整 upstream 视觉匹配、真实移动硬件、长时稳定性或 Wave1 全通过。SDK/引擎源码零改动，没有足够复现依据主张 ENGINE_BUG；公开 gfx GPU timestamp 是 API_GAP，工具诊断不是公共能力证明。公共薄封装应等待后续多个案例，不提前新建 Sparkle/Noise/Color API。

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/shaders-sparkle-final.cjs --verify=docs/evidence/shaders-absorption/e06-final-summary.json
```


## Gallery 规格边界

Gallery 的 ready、五类 validation、coverage、screenshot、API evidence 已补齐；API sourceLocation 使用现有 `spec-evidence.findSymbolLine` 实际定位。公开库存以 `Texture2D` 为单位，不把不存在的 `Texture2D.uploadData` inventory unit 加入 claim；实际调用合同仍见上文。status 保持 draft，API evidence 仅源码绑定声明，不继承专用采集器或图库的运行期 PASS。

本例尚未提供 legacy `window.__lifecycle`，分类 EXAMPLE_GAP。故 Gallery lifecycle validator 数组为空，不声明 `resource-released`；这不否定原生专用采集器的300实例资源与 app 级资产退役证据。补 legacy hook 属后续代码任务，本轮仅修元数据。
