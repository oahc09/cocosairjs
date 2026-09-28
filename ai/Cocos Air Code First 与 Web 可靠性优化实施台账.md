# 《Cocos Air Code First 与 Web 可靠性优化任务清单》实施台账

> 计划书：`ai/Cocos Air Code First 与 Web 可靠性优化任务清单.md`（2026-09-28）。
> 本台账按任务书 §6 顺序执行：W01–W03（P0 诊断与可靠性闭环）→ W04–W08（P1 公共合同）→ W09–W14（P2 装配层）。
> 排序纪律：每项交付「代码或未复现结论 + 最小复现页 + 可重跑命令 + 文档/示例影响」；浏览器视觉项以真实浏览器数值断言为准，失败状态不记 PASS。
> 环境：本仓库 `node_modules` 无 playwright，借用 `E:\AIProMax\shader-reverse-engineering-benchmark-ground-truth\node_modules`
> （`NODE_PATH=` 前缀，chromium 140 / ANGLE / SwiftShader）——与 g4-shader-probe 的外部 NODE_PATH 约定同族。

## 批次状态总览

| 工作项 | 状态       | 交付落点                                                                                                          |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| W01    | ✅ 完成    | `src/air/context-health.ts` + `tools/debug/probes/context-loss-probe/` + `tools/verify/w01-context-loss.cjs` + `docs/evidence/w01-context-loss.json` + 手册 webgl-compatibility-check.md 新章节 |
| W02    | ✅ 完成    | `tools/debug/probes/coldstart-probe/` + `tools/verify/w02-coldstart.cjs` + `docs/evidence/w02-coldstart.json`（历史缺陷**未复现**，不改初始化代码） |
| W03    | ✅ 完成    | `tools/debug/probes/capture-probe/` + `tools/verify/w03-capture.cjs` + `docs/evidence/w03-capture.json` + 截图 ×4 + 手册 capturing-screenshots.md + **WebGL2 preserveDrawingBuffer 缺陷修复**（webgl2-swapchain.ts，file-map/UPSTREAM 已登记） |
| W04–W08 | ⬜ 待办   | P1 公共合同（画布绑定/坐标/DPR/Label/单时钟）                                                                      |
| W09–W14 | ⬜ 待办   | P2 装配层（2D helper/场景栈/音频/调试树/性能/发布）                                                                |

## W01 — WebGL 上下文丢失（P0）

- **实现**：AIR 层状态机 `healthy → lost → restoring → failed`（`src/air/context-health.ts`，Air 原创，
  上游 swapchain 零触碰）。lost：`preventDefault()` + `game.pause()`（引擎级停摆：rAF/渲染/业务时钟/音频，
  = 暂停无效提交）。restored：如实判定 failed（本期不重建 GPU 资源，不宣称自愈）+ `requestReload()`
  受控重载（healthy 门掣拒绝、failed 执行；`contextLoss.reload` 可注入替代便于测试）。
- **接线**：`createAirApp({ contextLoss })` → `app.contextHealth`（snapshot/onChange/requestReload）；
  在 `ensureCanvasDOM` 后、`game.init` 前挂接（早于 swapchain 自身告警监听）。
- **实测**（chromium headless 双后端，20/20 断言 ×2，pageerror=0）：
  - lost 后 AFTER_DRAW 计数与业务时钟**双冻结**（600ms 双采样 delta=0）；
  - restoring 瞬态在 timeline 可观测后进入 failed（reason=`context-restored-but-gpu-resources-not-rebuilt`）；
  - 重载门掣：healthy 态 false/零调用，failed 态 true/恰一次；
  - 第二轮 lose/restore：lostCount=2、迁移稳定。
- **复现**：`NODE_PATH=<playwright> node tools/verify/w01-context-loss.cjs`。

## W02 — 默认资源冷启动（P0）

- **结论：现版缺陷未复现，按任务书不改初始化代码。** `physics-backend.ts` 模块求值期预置
  `default-physics-material` 在三条路径全部生效（无 errorID 9642、系统消费 `_material.name` 正确）。
- **矩阵**：三路径 × 两轮（独立 browser context = 空缓存 + buster query），9+9+7 断言全绿：
  - `builtin`：材质在位 + 静态语义（位移恒 0=离散检测器合同）+ **资产包晚到覆盖合同**
    （`addAsset` 同名注入后 `get` 返回官方件 = physics-backend.ts 注释宣称的行为实测成立）+ 场景二次启动出帧；
  - `cannon`：**cannon-shape.setMaterial 消费默认材质不崩**（历史缺陷的直接反证），球 y=10→1
    （官方 postUpdate 同序手动步进 3 秒，模拟真实推进）；
  - `lowlevel`（公开 `game.init()`）：`game.inited` + 材质在位 + CannonWorld（模块序默认，与
    physics-backend 注释一致）+ 空场景出帧（低层路径无 AIR builtin effects，不触碰 builtin-standard）。
- **初始化阶段时间线**入证据（modules-evaluated → pre/post-subsystem → createAirApp resolved ≈70–140ms）。
- **复现**：`NODE_PATH=<playwright> node tools/verify/w02-coldstart.cjs`。

## W03 — 官方截图时机（P0）

- **矩阵**：后端 {webgl2, webgl1} × DPR {1,2}，13/13 断言 ×4，pageerror=0；页面截图（compositor 输出）
  尺寸=viewport×DPR 逐一断言，PNG 存证 ×4。
- **同帧三路对照**：`AFTER_DRAW` 帧内 `toDataURL` / `readPixels`（翻行序）/ 2D-copy 三路，
  **readPixels ≡ 2D-copy 逐字节等价（maxDiff=0、sha16 全同）**，clearRatio≈0.92/avg 一致 →
  推荐采集 API 定为「AFTER_DRAW + 2D-copy」（手册 capturing-screenshots.md，含最小示例与 CAPTURE_FAILED 合同）。
- **实测发现的缺陷与修复（GAP-W3-1，已修）**：WebGL2 后端 `getContext` 漏配
  `preserveDrawingBuffer: true`（AIR 2026-09-12 只改了 webgl1，webgl2 遗漏）→
  **resize/暂停后帧外读回恒黑**（clearRatio=0、avg=[0,0,0]；webgl1 正常）。修复：webgl2-swapchain.ts
  普通分支对齐 true（XR 分支保持上游 false）；`docs/upstream-file-map.json` modified+reason、
  UPSTREAM.md 新增「preserveDrawingBuffer on both WebGL backends」节。修复后四模式 resize 后
  clearRatio=0.909/avg=[31,44,71]、暂停直读返回场景像素 [40,89,186]。
  顺带教训：C/D 相位初版断言过弱（「有 hash/长度」≠画面正确），恰违反任务书 W03 红线，已改为内容级断言
  （clearRatio 区间 + 中心像素非黑）——弱断言让该缺陷第一轮跑成了假绿。
- **边界相位**：离屏 FBO（clear 已知色精确回读）✓；等待式采集在暂停态 1500ms 超时 ⇒ 显式
  `CAPTURE_FAILED`（不得静默成功）✓；直接读取在 preserve 合同下保留最后一帧 ✓。
- **复现**：`NODE_PATH=<playwright> node tools/verify/w03-capture.cjs`。

## 顺带量化发现（登记待 W06 处置）

- **GAP-W6-1（启动/resize 两条尺寸链不一致）**：DPR=2 时启动缓冲=CSS 像素（1280×720，
  effectiveBufferRatio=1），窗口 resize 后链路才乘 DPR（900×600→1800×1200）。
  启动链经 AIR `ensureCanvasDOM`（`canvas.width=innerWidth`），resize 链经上游 screen-adapter
  （`windowSize=CSS×DPR`）。**高 DPR 设备首帧实际是半分辨率，直到首次窗口变化。**
  处置属 W06（可配置上限 + 默认策略）+ 证据基线重采权衡，未在本批次擅改。

## 包体/兼容性影响

- bundle `a5b3d9fc1c42fdb4` / 6,604,xxx B（较 r50 基线 +context-health 状态机 +webgl2 preserve 位）。
  **指纹纪律提示**：AIR 源与上游 webgl2-swapchain 已变，冻结证据链（v11/gallery/矩阵）的 bundle 指纹
  为旧值——按「改默认集/AIR_VERSION=全量重采」口径，全链重采列后续批次统一执行（当前处于 owner
  release-evolution 重置窗口，版本号 1.0.0 尚未提交）。
- 导出面增量：`AirContextHealthState/Backend/Snapshot/LossOptions/Health`、`attachContextHealth`、
  `AirApp.contextHealth`、`AirAppOptions.contextLoss`（dts 已再生成，face 门禁当期跑）。

## 门禁（P0 批次当期）

- **绿**：typecheck 0 错 · verify:web-only · verify:file-map（modifiedCount 30→31 同步后 PASS）·
  verify:doc-refs（150 文档 1332 引用 0 断链）· build:dts（新导出面 12 处 contextHealth 族在 d.ts）·
  format:check（探针文件已 prettier 化）。
- **jest**：264/265，唯一失败 smoke-30「产物绑定」= **共享工作区并行构建竞态，非本批缺陷**：
  期间观察到 build/cocosair.module.js 在 ≥3 个确定态（0541cdb3 / a5b3d9fc / 05f7eb14，相差 ≤1 字节）
  被并行进程交替重写；本批 `npm run build` 两次确定性复现 **0541cdb3**（= 并行会话重采的 v12 矩阵证据
  哈希，自洽），单跑 smoke-30 曾绿。W03 证据记录的 a5b3d9fc 同为含本修复的构建
  （resize 非黑 13/13 断言在该构建上通过，证据对其记录哈希有效）。
- **build/ 在途产物不入本批提交**：留给并行集成分支统一落（避免捕获瞬态）。

