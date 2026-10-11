# Wave3：固定十三项交付

## 1. Goal

2026-10-10 冻结批次：[Wave3 Engine Gate](../evidence/shaders-absorption/wave3-current-gate.json) 范围 PASS，54维已测/0跳过，nextWaveEligible=true；projectCompleted=false、subset=true、Agent Gate 与独立 Gallery NOT_RUN。该记录允许当时进入 Wave4。2026-10-11 SDK 因独立 gfx 修复改变，本批通过属于原 SDK 身份，不能继承当前候选 PASS；当前身份需重新采集。Wave4 后续状态见 [当前组合进展](wave4-kickoff.md)。

## 2. Upstream references

保持固定commit dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a；三个叶级报告绑定LiquidMetal/CursorTrail/Glass和依赖helper的实文件SHA。MIT通知保留；来源获取与更正历史不覆盖。Wave2 PASS前置由生产验证器重新核对。

## 3. CocosAirJS APIs used

原生Scene/Node/Camera/MeshRenderer/Material/EffectAsset、createAirApp、单step clock、Texture2D数据纹理与RenderTarget。没有额外渲染canvas/TypeGPU/上游runtime。E08/E09的17条API执行行有独立生产检查。

## 4. Implementation details

E07程序金属、mx Perlin替代浮雕和真实low/high成本分支；E08 CPU轨迹→64×1 RGBA16F→三子弦Bézier扫描；E09原生两遍RTT→Glass/Vogel片元透镜。差异均显式声明，不用截图近似证明算法等价，也不把Gaussian compute未实现冒称引擎缺陷。

## 5. Tests performed

执行渠道：E07 Orca Worker小三实施、Lead独立审查/实测；E08 Worker部分实施后限额中止，Lead接管完成/实测；E09 Lead实施、独立oracle和实测。当前新增相关六套188/188，E07此前四套114/114；不是一次合并运行302项的声明。合成fixture仅合同。

全部当前叶级源/SDK/参考、实际OS退出、raw日志和冻结输入复核。真实报告克隆审计E07 46、E08r2 37、E09 35均独立拒绝；不借失败基线自称拒收。

Lead实际完整库存：2026-10-10T04:02:33.271Z–04:08:22.776Z，`node tools/verify/test-inventory.cjs --update -- --runInBand`，OS exitCode=1、signal=null；156套2088项，2083通过/5失败。相对Wave2新增10套302项全部通过，五个失败测试名称与此前相同：规格冻结、API evidence行号、规格合规、Gallery字段白名单、历史browser-matrix SDK身份。当前库存已登记，不将全仓库exit1改称PASS。OS回执和完整日志分别保留于`output/shaders-absorption/lead-w3-inventory-os.json`及`lead-w3-inventory.log`；测试生成的合规副本另存，正典恢复执行前实际字节（canonicalRestored=true）。

## 6. Screenshots / visual evidence

120标准视觉案例及透明RT数学审计；141 compositor PNG包含E07时间双拍、E08可信mouse/touch、各例resize。它们不是141个独立算法case。三浏览器实际PNG、GPU字节、独立SDF/噪声/轨迹/UV/alpha公式和负例共同裁定。

## 7. Performance evidence

36串行profile窗口：E07 high/low×三profile×三引擎18；E08活64texel/512B轨迹9；E09真实blur8/aberration0.5及两遍27tap材质9。真实HTTP隔离、导航后DPR修复、25000次时钟标定、30预热帧；GPU timestamp仅CH可用。CPU包围/GL派发/队列记账/AFTER_DRAW与GPU时间分开，计时内不读回。

## 8. Resource/lifecycle evidence

900轮实际资源退役；E07三份、E08四份、E09六份引用各1→0。9次同页resize、54非法整批拒绝与660参数边界。所有权包括sampler/renderer/相机detach/RT dispose及注册清理，借用缓存不销毁；物理显存不可用。Gallery181项保留旧项，独立Gallery Gate未验。

## 9. API/DX gaps found

本波未新增确证ENGINE_BUG/API_GAP。AGENT_FAILURE包含GLSL色阶常量、采集与metadata接线、非法profile纯校验器TypeError；修复、原始尝试、身份刷新分别保存。上游CursorTrail注释与执行体按REFERENCE_ERROR记录。数据纹理/RT所有权样板成为后续Recipe候选，不立即扩公共运行时。

## 10. Workarounds used

已实证shader-scoped WebKit启动、真实HTTP COOP/COEP及Firefox协议DPR修复，仅属于验证环境。E07 Fi-hash许可未明采用mx Perlin明确为同类非等价；E08距离近似及E09Vogel路线明确为本地适配。

## 11. Proposed engine changes

优先文档/Recipe：RT两个独立解绑回调、数据纹理半精度布局、变体零跨越及生命周期终态。先做Wave4四组合，再以多个真实消费者决定最小公共能力；不复制上游effect框架或新增平行Scene/Material。

## 12. Validation status

通过汇总、叶级专用门禁、来源身份及计数交叉校验；E08以r2刷新元数据后重新采集为当前。只读入口：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave3-closure.cjs --verify=docs/evidence/shaders-absorption/wave3-current-gate.json`。它追加E08活数据/原生pass和E09双遍/毛玻璃状态检查，并绑定各关闭与审计证据，不重写E07已固定的旧验证器。

首次汇总命令遗漏NODE_PATH，pngjs解析失败，未生成Gate；配置已有tooling路径后完整重算通过，属Lead命令环境错误，非算法失败或补造PNG。

Orca Worker小三已完成严格只读交叉复核：生产汇总验证器、三个叶级指纹、E08/E09输入与参考、四个实际OS回执、API元数据、原始资源/性能、篡改拒收均通过；E09三capture×17点共51个像素抽样由独立oracle复算零超差。未重跑浏览器、构建或Jest，未全量二次复算所有PNG。回执中E09性能字段和审计去重计数由Lead核对原文件，实际冻结状态字段是`fixedStart.params`/`fixedEnd.params`，E08r2/E09两个独立审计分别37/35种；不重复统计同一审计。

## 13. Known limitations

Engine subset不等于全部平台/发布就绪。原生shape贴图平台、Gaussian compute、实体触屏滑动、长时、多标签页、独立Gallery/Agent、四组合和公共能力阶段仍未完成。不能声明完整计划完成；Wave4以本Gate和二次审查无阻塞为前置。
