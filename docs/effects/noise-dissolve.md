# E01 Noise Dissolve

> 本文的 `output/` 路径是未随仓库分发的本地历史产物，保留为溯源记录；不作为可点击仓库链接或当期验收证明。

2026-10-09；执行渠道为 native subagent。独立效果实现，不新增 SDK 或共享 noise API。例子保持 draft；Engine Gate 和 Agent Gate 分开。

## 实现和算法

入口：[examples/shader-noise-dissolve/src/main.ts](../../examples/shader-noise-dissolve/src/main.ts)。源码和许可：[UPSTREAM.md](../../examples/shader-noise-dissolve/UPSTREAM.md)。固定上游 commit 为 `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。

三 octave gradient Perlin 使用权重 1、0.5、0.25，除以 1.75 后经 `clamp(0.5 + 0.9*n,0,1)` 得 coverage。二维域 `p=(uv.x*aspect*scale+seed*13.7,uv.y*scale+seed*7.9)`；第二层域 `2*p+(17.3+seed*3.1,9.1)`，第三层 `4*p+(41.7,27.9+seed*5.3)`。seed 连续，不取整，也没有用 sin-hash 替代。

软边 `f=max(softness,0.0001)`，`front=progress*(1+2*f)-f`，`mask=smoothstep(front-f,front+f,coverage)`。invert 先反转 coverage；softness=0 明确用硬 step；progress=0/1 强制完全显现/消失。后一项明确零宽行为是本例契约，与仅使用 epsilon 的一般软边路径区分。

| 参数     | 默认  | 范围        | 更新方式 |
| -------- | ----- | ----------- | -------- |
| progress | 0.5   | 0..1        | uniform  |
| scale    | 3     | 0.5..20     | uniform  |
| softness | 0.25  | 0..1        | uniform  |
| seed     | 0     | 0..100 连续 | uniform  |
| invert   | false | boolean     | uniform  |

唯一事实源是 [parameters.ts](../../examples/shader-noise-dissolve/src/parameters.ts)。整记录更新在赋值前拒绝 NaN/Infinity、类型错、越界、缺字段、未知 own key（含 constructor/toString）、非 plain record 与 accessor，不部分更新已渲染状态。

## 坐标、颜色和独立 oracle

顶点为 clip-space 全屏四边形，不从相机 ortho 宽高假定实际覆盖范围；canvas backing aspect 进入 noise 域。UV 视觉顶为0；纹理 typed array 第0行是视觉顶。程序化16×16纹理使用 nearest RGBA8，含 alpha 0/128/255，底层棋盘为灰32/64。

shader 保持输入 RGB，仅缩放 alpha；普通路径 Material.initialize 创建 SRC_ALPHA/ONE_MINUS_SRC_ALPHA 状态。诊断材质在创建时关闭 blend，不调用基类 Material.overridePipelineStates warn stub。诊断 RGB 分别显示 coverage、mask、inputAlpha*mask，使独立 oracle 可以在 opaque WebGL context 中验证 alpha。context alpha=false 时 readPixels A恒255，不能把它当输入透明度证据。

[CPU oracle](../../tools/verify/shaders-noise-dissolve-oracle.cjs) 独立重算 uint32 lookup3、gradient/fade、float32 fBM 和 front/mask；真实 AFTER_DRAW 9×7 采样与期望逐通道比较（RGBA8/float量化容差2），PNG 从实际 compositor 截图解码再与读回比较（RGB容差1）。seed重复/变化、progress单调、端点、softness0、invert、原 RGB/透明棋盘均有固定案例；不以视觉相似代替数值正确性。

## 验证与资源

[collector](../../tools/verify/shaders-noise-dissolve.cjs) 纯导出与 require.main 分开，`--out` 只写新路径，`--verify` 只读；冻结 identity/scope 从当前磁盘和例内契约重算，不信报告自报。Build、Runtime、Visual、Boundary、Resource、Performance 均按 [effect-contract](effect-contract.md) 校验。Jest 夹具采用 tmpdir 合成 PNG，明确不是浏览器证据。

当前正式功能尝试：e01-functional-attempt6.json（本地历史产物：`../../output/shaders-absorption/e01-functional-attempt6.json`）。实际命令 `NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-noise-dissolve.cjs --browser=all --functional --out=output/shaders-absorption/e01-functional-attempt6.json`，exit=1：CH/FF 功能均通过；WebKit Runtime live-resize PNG 拒绝。该报告没有身份漂移。尝试1..5保留；attempt5的runner修改漂移被校验器拒收，不继承旧绿。

资源在同一 app 下循环100个效果实例，shared effect/background保持到app终态：每实例mesh/material/texture显式持一份，先解除renderer/材质纹理绑定再node destroy、decRef、destroy；逐轮创建非零texture/buffer基线、退役回差和ref1→0记录。终态还释放自有背景三资产，自建EffectAsset持ref1，在全部材料解绑后remove(asset身份守卫)、decRef至0并destroy；registry不再指向自身、validAfterClose=false。release同步terminal且缓存同一Promise；DOM AbortController、Director named callback、工具包装恢复与控件禁用均实际观察。引擎cache/pacer不是本例独立RAF或自有共享资产。

## 当前阻塞与性能边界

WebKit同页从384×256 live resize至480×320后，GPU readPixels仍正确，实际PNG露出页面背景；追加4个真实step和500ms等待仍不匹配，未用fresh页面冒充恢复。最小原始记录：e01-webkit-resize-probe.json（本地历史产物：`../../output/shaders-absorption/e01-webkit-resize-probe.json`）。首轮作为 ENGINE_BUG 候选上报；Lead 随后的独立 builtin-unlit 控制验证 GPU/canvas export 正确、PNG 随 body 改绿，未定位任何引擎错误行。最终按当前环境 INFRA_FAILURE/BLOCKED 分类，本例没有私改SDK、使用导出图补偿或降低呈现 gate。原始 attempt7 的旧标签保留，独立规范化文件明确纠正。

Performance已在Lead独占TOKEN窗口完成；E02明确关闭后采集、E06与Lead确认无并行浏览器/重测试，结束后全部browser/server finally关闭并TOKEN_RELEASED。每个配置实际 warmup30+steady60。测量为每浏览器720p、1080p、390×844 DPR2（桌面headless模拟，非真机），native pacer warmup30+steady60；实际 uniform-update CPU、原生CommandBuffer begin/end CPU envelope、真实GL draw dispatch CPU和Queue.submit bookkeeping分开。WebGL2Queue.submit仅累计统计，不冒称GPU提交；native frame间隔不是显示器present。EXT timer在同一个engine GL上下文包围原生draw，排除warmup并记录对应frame、availability/disjoint/delete；没有自行draw/new canvas。资产拓扑和VRAM估算由实际gfx Buffer/Texture集合及size得出，物理GPU内存不可得，不假造预算或60fps结论。

最终验收入口为轻量 [e01-summary.json](../evidence/shaders-absorption/e01-summary.json)，以 SHA/bytes 绑定实际大型 e01-engine-precision-final.json（本地历史产物：`../../output/shaders-absorption/e01-engine-precision-final.json`）、原始采集、18 个实际 scoped 子验证命令、审计与来源身份，不在 docs 再复制大型 JSON。原分类 v1 与 scoped 中间报告保留为修复轨迹。

| 引擎     | Build | Runtime | Visual | Boundary | Resource | Performance |
| -------- | ----- | ------- | ------ | -------- | -------- | ----------- |
| Chromium | PASS  | PASS    | PASS   | PASS     | PASS     | PASS        |
| Firefox  | PASS  | PASS    | PASS   | PASS     | PASS     | LIMITED     |
| WebKit   | PASS  | BLOCKED | PASS   | PASS     | PASS     | LIMITED     |

冻结 222 个案例：216 PASS、5 LIMITED、1 BLOCKED；整体 scopePassed=false/subset=true/completed=false。Firefox 三档与 WebKit 1080p/mobile 档的全部 60 个 CPU draw-dispatch 区间均为0，低于本次可观测时钟精度，归类 INFRA_FAILURE/LIMITED，不能解释为零成本或已证实的 PERFORMANCE_GAP。CPU 必需阶段不可观测也不能用可测 GPU timestamp 补偿；当前 CH 有正样本，分类未被改变。timer resolution=NOT_RECORDED。

实际完整采集命令 `NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-noise-dissolve.cjs --browser=all --performance-authorized --out=output/shaders-absorption/e01-engine-attempt7.json` exit1，schema/oracle validation ok=true/errors=[]。当前SDK与例/收集器身份来自该实测文件，未借用别例的硬件信息。随后只读独立 [normalize工具](../../tools/verify/shaders-noise-dissolve-normalize.cjs) 绑定原报告与 Lead控制证据（本地历史产物：`../../output/shaders-absorption/lead-wave1-resize-layer-diagnostic-attempt1.json`） 的hash并纠正分类，browserRunsAdded=0；重插canvas阶段因 rect.y 变化被明确排除。

| 引擎     | 720p native间隔 P50/P95 ms | 1080p P50/P95 ms | 390×844 DPR2 P50/P95 ms | 同context GPU P50 ms（720/1080/mobile） |
| -------- | -------------------------- | ---------------- | ----------------------- | --------------------------------------- |
| Chromium | 16.7 / 17.2                | 16.7 / 17.3      | 16.7 / 17.2             | 1.182 / 4.397 / 1.781                   |
| Firefox  | 17 / 18                    | 17 / 17          | 17 / 17                 | unavailable（EXT absent）               |
| WebKit   | 12 / 29                    | 19 / 23          | 15 / 31                 | unavailable（EXT absent）               |

每帧实际2 draw/2 pass/2 Texture/8 Buffer；自有gfx分配估计2744B=2×16×16×4纹理+8个去重buffer size合计696B，排除framebuffer与borrowed builtin缓存，不是物理VRAM。CH每profile60个steady查询具frame编号、available=true/deleted=true、无warmup混入；释放时wrapper恢复和监听0实际通过。FF/WK大量CPU小区间因计时精度为0，不等于没有成本。renderer/vendor/hardware=NOT_RECORDED，不从其他效果硬件字符串补写E01“实测”。不据native间隔宣布present帧率或预算。

最终真实报告篡改审计（本地历史产物：`../../output/shaders-absorption/e01-precision-final-audit.json`） baseline schema/oracle接受、47/47变造拒绝，browserRunsAdded=0（缺行/黑raw/错参数/NaN/源与PNG漂移/refs/注销/监听/错误浏览器、execution 冒用、precision 提升与错误归因等）。Jest `NODE_PATH=output/playwright/tooling/node_modules node node_modules/jest/bin/jest.js --runInBand test/smoke/shaders-noise-dissolve.test.ts` 19/19 PASS；该合成CPU/PNG合同测试不是真实浏览器正例。严格TS和esbuild及真实GL shader compile/link在attempt7逐引擎Build行有实际日志与状态。

Engine Gate整体仍BLOCKED（WK resize呈现未达，5档计时 LIMITED），其他已通过范围不补偿Runtime或精度缺口；Agent Gate未执行。未验证真实上游外部图像/渲染纹理输入、物理移动设备、长时干扰、多标签页、公用能力提炼；不推进Wave2。

## Actual execution 补查

原采集器总CLI实际exit1；原始部分叶子行把该command的exit写0，属于AGENT_FAILURE证据元数据问题，不计为引擎算法错误。独立 [scoped-gate工具](../../tools/verify/shaders-noise-dissolve-scoped-gate.cjs) 已只读真实raw、PNG、refs、性能和固定identity，每engine×gate用真实子进程验证实际数据子范围（性能精度局限由下一层收窄），并把新execution用途明确为 `VALIDATION_OF_REAL_BROWSER_CAPTURE`；`collectionExecution` 保留原总CLI/exit1/rawReportSHA。它不启动浏览器、不生成draw，不补偿WK BLOCKED。新 [normalize-scoped工具](../../tools/verify/shaders-noise-dissolve-normalize-scoped.cjs) 还从真实uniformDraw修正已接受Boundary行的fixed视口/参数模板；模型/像素未被改写。18 个独立子命令实际 exit0；它们只证明所选原始数据校验，不把原采集总命令改成成功。原始实际工具回执的事后转录 host-tool-receipt（本地历史产物：`../../output/shaders-absorption/e01-attempt7-host-tool-receipt.json`） 与输出 hash 保留；它不是当时 OS stdout 重定向文件。后续只读原 collector `--verify` 实际 exit1，见当前判定见证（本地历史产物：`../../output/shaders-absorption/e01-readonly-original-verify.json`），不是重新采集。

最终纯规范化/审计命令（无新增浏览器）：

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/shaders-noise-dissolve-precision-closure.cjs --report=docs/evidence/shaders-absorption/e01-engine-scoped.json --out=output/shaders-absorption/e01-engine-precision-final.json
node tools/verify/shaders-noise-dissolve-precision-closure-audit.cjs --report=output/shaders-absorption/e01-engine-precision-final.json --out=output/shaders-absorption/e01-precision-final-audit.json
node tools/verify/shaders-noise-dissolve-summary.cjs --report=output/shaders-absorption/e01-engine-precision-final.json --audit=output/shaders-absorption/e01-precision-final-audit.json --out=docs/evidence/shaders-absorption/e01-summary.json
```

上述三个命令本次实际 exit0；路径以 wx 新建，重做须换新输出。只读复核用 `node tools/verify/shaders-noise-dissolve-precision-closure.cjs --verify=output/shaders-absorption/e01-engine-precision-final.json`，exit0 的含义是分类/谱系有效，仍报告 scopePassed=false。

必要截图：alpha 棋盘混合（本地历史产物：`../../output/shaders-absorption/e01-engine-attempt7-artifacts/chromium-display-alpha.png`）、零宽硬边（本地历史产物：`../../output/shaders-absorption/e01-engine-attempt7-artifacts/chromium-hard.png`）、实际控件（本地历史产物：`../../output/shaders-absorption/e01-engine-attempt7-artifacts/chromium-controls.png`）；全部数值/PNG绑定在最终报告。WK same-page live resize 失败截图保留，不以 canvas 导出图代替 compositor。许可、Gallery metadata、本地 strict tsconfig 已补齐；全局清单/库存/台账由 Lead 集成，本批不修改。

## Gallery 规格结构与旧接口边界

Gallery 元数据使用当前 API inventory 的公开 unit（例如 `Texture2D`，具体 uploadData 调用仍在上述完整 APIsUsed 中），所有 `api.evidence.sourceLocation` 由 `spec-evidence.findSymbolLine` 定位实际可执行行。声明现有 scene-ready/node-exists/no-runtime-error/frame-diff/visible-frame 验证器；coverage 引用为空，不借用无关 Benchmark。`status=draft` 保持。

**EXAMPLE_GAP：legacy Gallery lifecycle hook 尚未适配。** 本例仅提供 `window.__e01` 的独立验证接口，没有 `window.__lifecycle` 安装点；因此 `validation.lifecycle=[]`，不伪造通用 `resource-released` 可执行声明。此兼容缺口不撤销独立 collector 的每 app100实例、三浏览器300实例 Resource 证据；适配实现应在后续授权下变更并重新采证，本轮 metadata 不修改冻结 measurement 输入。
