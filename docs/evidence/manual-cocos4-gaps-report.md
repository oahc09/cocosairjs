# Cocos 4.0 手册与示例补缺 · G5 汇总验收报告

> 立项计划书：`ai/Cocos Air — 对照 Cocos Creator 4.0 开发指南的手册与示例补缺任务计划书.md`。
> 本报告对应计划书 §四 G5 与 §七 最终验收清单。执行日期：2026-09-25（单日批次 G0–G5 连续执行）。
> 当期 HEAD：`81e2e28`（开工）→ 本报告提交；版本 1.2.0；bundle 指纹 `9376e3062269376c` / 6,600,546 B
> 与 d.ts 指纹 `60d78ef3fb99db53` 全程未变（本批次零引擎/导出面改动，故不触发 jest/构建/矩阵重采）。

## 1. 门禁与验证记录（命令 · 范围 · 结果）

| # | 命令 | 范围 | 结果 | 时间 |
| --- | --- | --- | --- | --- |
| 1 | `NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/verify/manual-examples-verify.cjs`（不带 --ids，正典口径） | 手册全部 44 个示例（41 存量 + 3 新增） | **44/44 PASS**（app-contract / visible-frame / no-runtime-error / frame-diff(动画类) / state-probe(可选)），`partial:false` → `docs/evidence/manual-examples-verified.json` + `docs/evidence/examples/manual-*.png` ×44 | 2026-09-25T07:20:50Z |
| 2 | `node tools/verify/manual-doc-consistency.cjs --strict` | index.md 68 篇声明、44 例逐字节拷贝核对、孤儿目录检查 | **PASS**（strict，fail=0，missing=0；WARN×1 为 installation.md 历史 d.ts 教学片段，属设计容忍） | 同日 |
| 3 | `npm run verify:doc-refs` | 全仓 128 篇 md、1221 条仓库内引用（棘轮基线 31 条） | **ok:true**（unresolvedCount=0，staleBaselineCount=0，无新增断链） | 同日 |
| 4 | `npm run typecheck` | src 全量（tsc） | **PASS**（零错误；引擎源码无改动） | 同日 |
| 5 | 验证器最小扩展（计划书 §五.3） | `tools/verify/manual-examples-verify.cjs` | 新增 `state-probe` 检查（`window.__manualProbe()` 契约，轮询 30s）与 `CONSOLE_ALLOWLIST`（故意 404 用例的网络日志豁免，仅限 manual-asset-lifecycle、计入 detail 可审计）；ANIMATED 集 +3 | 同日 |

## 2. 交付清单（按批次）

引用计数勘误（2026-09-26）：本文档的 r49 引用数已按 `710fb00` 的独立复核结果从 1219 更正为 1221，保持 128 篇和零断链结论。后续文档与验证器修复见 `docs/interface-scenarios-repair-report.md`，本报告其余记录仍按 r49 历史范围解读。

| 批次 | 交付件 |
| --- | --- |
| G0 | `docs/manual/cocos4-coverage-matrix.md`：基线记录（HEAD/指纹/官方快照 cocos-docs@f183c83f）+ 11 主题「官方路径→AIR 三层证据→页面/示例→行动」矩阵 |
| G1 | 事实纠偏：`index.md` 能力边界总说明重写（2D/UI、物理、音视频、DragonBones 移出"不包含"）；`creating-text.md` 重写（Label 可用/3D 文字几何 N/A 三路线）；`physics.md` 重写（2D/3D/后端/版本说明）；`faq.md` 文字条目更正；`game.md` 距离判定改"设计选择"表述（含 manual-mini-game 注释同步重嵌）；`creating-a-scene.md` 过期 N/A 引述更正 |
| G2 | 3 篇主题页 + 3 个新手册示例（行为断言见 §3）：`component-lifecycle.md`、`input-and-events.md`、`asset-loading-and-lifetime.md`；`creating-a-scene.md`/`how-to-update-things.md` 互链 |
| G3 | `2d-ui.md`、`ui-layout-and-interaction.md`、`physics-2d-and-3d.md`、`audio-video-webview.md`、`2d-assets-and-effects.md`（Spine 单列待验证）；`animation-system.md` 增补"剪辑与骨骼动画路线"（§2，代码构造 Clip 实测可用）并重嵌更新后的示例源码；索引"工作流组"8 行登记 |
| G4 | 后处理能力复核（探针记录见矩阵 §3）：装配面证实（postProcess 命名空间 addSetting 挂相机零报错）、像素 A/B 不可归因 → 保持待验证并给阻断点；`how-to-use-post-processing.md`/`post-processing.md` 旧"PostProcess 未顶层导出"结论更正 + 示例注释同步；Spine 待验证阻断点记录 |
| G5 | 本报告 + README/索引计数口径统一 + 矩阵 G5 回写区刷新 |

## 3. 新增行为断言（state-probe 读回，全量运行内）

| 示例 | 断言数 | 覆盖 |
| --- | --- | --- |
| `manual-component-lifecycle` | 14 | 先建后活 onLoad 不触发；激活序 onLoad→onEnable→start；停用 update 冻结；复活只补 onEnable；destroy 当帧 isValid 真、帧末翻假；销毁隐含补最后一次 onDisable；onDestroy 恰一次；onLoad 订阅/onDestroy 退订（总线发射路由验证）；重建全新计数 |
| `manual-input-events` | 11 | 一次点击每层恰一次；child→parent 冒泡序；UI 命中吞掉后全局不触发；propagationStopped 阻断；node.off 退订；START/END 配对；空白点击直达全局 + getUILocation 换算；销毁后无回调；KEY_DOWN/UP 各一次（KEY_W）；滚轮反号；input.off 全局退订 |
| `manual-asset-lifecycle` | 9 | URL JSON 成功加载；注册表 add→load 命中同实例；HTTP 404 拒绝（网络日志豁免在案）；注册表未命中拒绝；destroy 帧末生效；已销毁实例仍被注册表交出（隐患自查）；assets.remove 清键；重载全新实例；alt manifest 驱动视觉切换 |
| `manual-animation-system`（增补） | 2 | 代码构造 AnimationClip（VectorTrack+TrackPath）Orb 位置轨迹越界（播放/循环）；stop() 后位置冻结 |
| 复用的主示例（UI/物理行为断言既有在册） | — | `ui-components`（真实鼠标点击 37 claims）、`ui-layout`（两档视口几何）、`physics-3d-basic/collision`、`physics-2d-basic/collision`（probeEquals/接触步号）——本批次未改动这些示例，链接可达性由 doc-refs 门禁核实 |

## 4. 计划书 §七 验收清单逐条核对

- [x] **P0/P1 官方主题都能从 `docs/manual/index.md` 找到 AIR 对应页、现有示例或明确边界**——工作流组 8 行 + 骨架行状态列（creating-text PARTIAL / physics FULL）+ 覆盖矩阵 11 主题全登记（矩阵 §2 速览）。
- [x] **`index.md`、`creating-text.md`、`physics.md`、`faq.md`、`game.md` 不再陈述当前导出面已推翻的旧能力结论**——G1 纠偏（ physics.md 的"仅内部命名空间"移入版本说明；"368 导出数"口径仅存于历史章节与版本记录）。
- [x] **新增主题页的代码可从仓库当前公开 API 运行；重用主示例的链接可到达且运行说明明确**——三篇 G2 页的代码即其示例逐字节拷贝（44/44 浏览器实跑）；G3 深链页片段均为对应主示例文件的连续子串（WARN 口径下零臆造）；doc-refs 1221 引用零断链；各页均给 `npm run dev` 运行 URL。
- [x] **生命周期、事件、资源、UI、物理的新增行为路径有可观察断言；通过、失败、未运行分别记录**——通过：§3 全表（36 条新断言全 PASS）；失败路径作为被测行为纳入断言（404 拒绝、注册表未命中、销毁后无回调）；未运行/待验证：后处理像素效果与 Spine（矩阵 §3 阻断点在案，未提升状态）。
- [x] **文档引用、一致性、类型检查与受影响浏览器示例验证按 G5 完成，报告附命令、时间、范围及结果**——本报告 §1。

## 5. 遗留与衔接（不阻塞验收）

1. 后处理像素效果与自定义 Shader 装配（含故意编译错误定位）→ 按 §3 G4 阻断点衔接
   `ai/Cocos Air — 接口场景覆盖、开发范式与 Shader 示例任务计划书.md`。
2. Spine 最小样例 + wasm 装载探针 → 升级 `2d-assets-and-effects.md` §4 状态的前置条件。
3. `installation.md` 的历史 WARN（教学片段非连续子串）存量保留，与本次改动无关。
4. 主示例（`examples/`）58 个与 V1.2 门禁体系（矩阵 39 / 链 53 / Gallery 102）本批次未触碰；
   `docs/evidence/v11-examples-verified.json` 等正典证据不在本批次复测范围（其指纹绑定 bundle，
   bundle 未变，证据仍有效）。
