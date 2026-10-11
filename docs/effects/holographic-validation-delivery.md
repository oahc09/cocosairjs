# E03 Holographic：六维实证交付

2026-10-10。[当前六维 Gate](../evidence/shaders-absorption/e03-holographic-current-gate.json)
PASS；范围为两个解析形状的原生全息箔材质。完整 Wave 2 结论见
[汇总交付](wave2-validation-delivery.md)，独立 Agent Gate 仍 NOT_RUN。

## 1. Goal

原生实现全息箔，验证噪声族、SDF stencil、皱褶法线、衍射色谱、光照、粒状细节、轮廓和时间/资源合同。

## 2. Upstream references

固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。
Holographic/index.ts SHA 为 `ee3a8ea07a4deac78cc95dd6c777d5baf4439d909b0d6c93499f6a53c23dd647`。
[来源与差异](../../examples/shader-holographic/UPSTREAM.md)及
[许可通知](../../examples/shader-holographic/LICENSE.reference.txt)保留 MIT / MaterialX / OSL 条款；不采用许可未明的 Fi-hash。

Lead 在 2026-10-10 从同一 commit 真实 HTTP 200 获取 kit/index.ts（4503B，SHA `049bc788e295a187c85d7197295aba9886c58209ea70584e4fe6d5d9a7dd0ef3`）及 materialParts.ts（10518B，SHA `e812166513e6a6a7eb00df5682760bf5fb8275471172ccf7ef512f7fff08f719`）。文件、URL、获取时间和回执在 Gate reference 闭包内；没有执行上游 runtime。原失败获取记录保留，不再泛称环境离线。

## 3. CocosAirJS APIs used

createAirApp、Scene/Node/Camera、MeshRenderer、Material.initialize/setProperty、EffectAsset、utils.createMesh、createStepClock、createAirRenderTarget。单场景、单 Canvas、单绘制 pass；RT 仅用于线性诊断，不代替预览渲染。

## 4. Implementation details

Orca Worker 小三实施并修复；Lead 独立审核、补齐原始帧/像素校验、采集和正式接线。
[算法说明](holographic.md)包含 MaterialX lookup3 Perlin、前向 stencil、负 Z 法线、固定 300° 主光、精确三等分色谱、flakes/grain 和正确 silhouette 链。

`sharpEdge=max(edgeSoftness·0.5,0.001)`，`w=max(sharpEdge/32,1.5pxH)`，覆盖率 clamp 后 smoothstep；不再用猜测公式。算法先 clamp 最终线性 RGB，随后预览 OETF 和定点混合；透明 RGBA8 RT 关闭混合。

时间为绝对时钟乘当前 speed；与上游积分 speed 仅固定 speed 时等价，变速会重映射相位。seed 是明确的本地扩展，seed=0 保持上游固定域。

## 5. Tests performed

Lead focused E03 三套110/110，连同当时 Wave2 门禁19例共129/129；后续新增汇总报告结构回归纳入全量库存，详见 Wave2 交付中的实际结果。Node 合同使用合成 PNG，不冒称浏览器证据。

[实际正例克隆审计](../evidence/shaders-absorption/e03-holographic-actual-audit.json)接受功能/性能两基线后37种篡改全拒，browserRunsAdded=0。覆盖 NaN、错坐标、复用实例、伪造相同白图、陈旧时间、seed、原始 release/ref、DPR、缺失日志、编译/清理和 pass/draw。

功能 attempt5、性能 attempt1 外层 OS exit0、signal=null、inputsUnchanged=true；输入和参考字节均冻结，两窗口不重叠。两采集器实际执行 strict noEmit / esbuild 和三浏览器 shader 编译。

## 6. Screenshots / visual evidence

CH149.0.7827.55、FF155、WK26.6：39组冻结视觉 PNG / 透明 RT probes，另6张相邻时间 PNG 与6组 RT probes、3张同页 resize PNG，共48张 PNG。全量 CPU oracle 与真实像素比对保持±2；固定 Δt=0.02 的 CPU显示变化阈值保持≤3。

确定性由重建后的不同 instance、相同 seed/参数/时间及实际字节重算；speed=0 两个时刻都绘制后读回，并与 oracle 比对，不采信 `equal` 自报旗标。所有时间快照的 receipt 对应最近提交帧：Director AFTER_DRAW 后递增 totalFrames，故 snapshot.frame=receipt.frame+1。

原始 `output/shaders-absorption/lead-w2-e03-functional-attempt5.json` 和相邻 artifacts 保留全部PNG。Lead人工查看默认 Chromium 画面；算法验收依据为全量数值，不声称逐张人工审美验收。Firefox截图等待双rAF+80ms时模拟时间冻结，没有用 GPU 导出替代 compositor PNG。

## 7. Performance evidence

`output/shaders-absorption/lead-w2-e03-performance-attempt1.json`：九个独占串行窗口，冻结720p、1080p、mobile DPR2，每帧一 draw / 一 native render pass。warmup 与 steady、CPU更新/gfx envelope/GL派发/queue记账、GPU timestamp分别记录。

| 引擎     | AFTER_DRAW 中位数（720p / 1080p / mobile，ms） | GPU timestamp 中位数（ms） |
| -------- | ---------------------------------------------- | -------------------------- |
| Chromium | 16.660 / 16.685 / 16.670                       | 0.631 / 1.920 / 2.535      |
| Firefox  | 16.660 / 16.680 / 16.680                       | 不可用                     |
| WebKit   | 20.020 / 18.280 / 19.380                       | 不可用                     |

CPU更新中位数约0.06–0.10ms；mobile实际DPR2/backing780×1688/COI=true。AFTER_DRAW不是显示呈现时间；零CPU区间是精度以下，不是无成本。物理显存不可用，引擎登记字节和GL对象数另列，不承诺60FPS或跨浏览器排名。

## 8. Resource/lifecycle evidence

三引擎共300轮，每轮mesh/material/effect三个自有引用1→0、renderer解绑、节点退役、资产失效、registry移除、内存计数回基线。release返回同一Promise，监听配对，终态HOLOGRAPHIC_DISPOSED；借用runtime、scheduler、builtin/cache不销毁。

参数/暂停/恢复/重置/释放为真实可信控件事件，同页同Canvas640×400→480×320通过。页面、浏览器、代理与服务器真实关闭。Gallery只新增Holographic，原177项逐条保留；单独Gallery生命周期harness仍NOT_RUN。

## 9. API/DX gaps found

失败来自UBO元数据沿用Neon、光向符号、双pass性能门禁复制、只信equal/未绘制/NaN穿透、来源猜测、帧计数错绑与截图过早，均AGENT_FAILURE。历史attempt1/3/4为OS exit1；attempt2旧collector exit0但独立审核未闭合，不改写为完整Gate。未确证ENGINE_BUG/API_GAP。

## 10. Workarounds used

复用限定shader测试的Windows WebKit启动项、真实HTTP隔离和Firefox导航后DPR修复。单Canvas、原生管线；不放宽容差，不以fresh page替代resize。

## 11. Proposed engine changes

无新增SDK或core API；多个实际消费者形成[公共能力初稿](wave2-capability-proposal.md)，优先明确噪声身份、颜色格式、生成元数据和资源回调。

## 12. Validation status

E03解析子集六维PASS，Agent Gate NOT_RUN。独立完整Wave2采用三个叶级Gate及当前Wave1前置，不用本例PASS替代其他效果。

只读复核：`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave2-gate.cjs --verify=docs/evidence/shaders-absorption/e03-holographic-current-gate.json`。原始collector `--verify=<raw.json>` 重算来源、PNG和数值。所有旧报告、日志、OS回执和获取失败记录保留。

## 13. Known limitations

两个2D解析形状，无sphere3D/volumetric/SDF贴图/shape JSON/center-origin平台；变速相位差异已明示。mobile是桌面模拟，非实体iPhone；长时/多标签页、独立Gallery及公开资料隔离Agent Benchmark未验。完整仓库/发布状态与这个Engine子集分开。
