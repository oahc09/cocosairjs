# 《Cocos Air Code First 与 Web 可靠性优化任务清单》实施台账

> 计划书：`ai/plans/code-first-web-reliability.md`（2026-09-28）。
> 本台账按任务书 §6 顺序执行：W01–W03（P0 诊断与可靠性闭环）→ W04–W08（P1 公共合同）→ W09–W14（P2 装配层）。
> 排序纪律：每项交付「代码或未复现结论 + 最小复现页 + 可重跑命令 + 文档/示例影响」；浏览器视觉项以真实浏览器数值断言为准，失败状态不记 PASS。
> 环境：本仓库 `node_modules` 无 playwright，借用 `E:\AIProMax\shader-reverse-engineering-benchmark-ground-truth\node_modules`
> （`NODE_PATH=` 前缀，chromium 140 / ANGLE / SwiftShader）——与 g4-shader-probe 的外部 NODE_PATH 约定同族。

## 批次状态总览

| 工作项 | 状态       | 交付落点                                                                                                          |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| W01    | ✅ 完成    | `src/air/context-health.ts` + `tools/debug/probes/context-loss-probe/` + `tools/verify/context-loss.cjs` + `docs/evidence/w01-context-loss.json` + 手册 webgl-compatibility-check.md 新章节 |
| W02    | ✅ 完成    | `tools/debug/probes/coldstart-probe/` + `tools/verify/coldstart.cjs` + `docs/evidence/w02-coldstart.json`（历史缺陷**未复现**，不改初始化代码） |
| W03    | ✅ 完成    | `tools/debug/probes/capture-probe/` + `tools/verify/capture.cjs` + `docs/evidence/w03-capture.json` + 截图 ×4 + 手册 capturing-screenshots.md + **WebGL2 preserveDrawingBuffer 缺陷修复**（webgl2-swapchain.ts，file-map/UPSTREAM 已登记） |
| W04–W08 | ✅ 完成    | 详见下五节（W04 画布覆盖+冲突合同、W05 坐标矩阵、W06 GAP-W6-1 修复、W07 Label 语义矩阵、W08 单时钟驱动）              |
| W09–W11 | ✅ 完成    | `src/air/{ui-kit,scene-stack,audio-service}.ts` + assembly 探针 25/25（详见下三节）                                   |
| W12–W13 | ⬜ 待办   | 调试树扩展 / 性能分轴（设计已列，见下）                                                                              |
| W14     | 🟡 部分   | 尺寸记录已落（docs/evidence/w14-sizes.json）；独立消费项目/CSP/sourcemap 面待后续批次                                  |

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
- **复现**：`NODE_PATH=<playwright> node tools/verify/context-loss.cjs`。

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
- **复现**：`NODE_PATH=<playwright> node tools/verify/coldstart.cjs`。

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
- **复现**：`NODE_PATH=<playwright> node tools/verify/capture.cjs`。

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


## W04 — 画布绑定和键盘焦点（P1）

- **时序锁定**：PAL 三输入源（keyboard/mouse/touch）与 screen-adapter 在**引擎 import 期**以
  `getElementById("GameCanvas")` 解析画布（`export const input = new Input()` 模块求值期字段初始化）——
  早于 createAirApp/ensureCanvasDOM。自定义 id 画布此前输入必断绑（源持 null 静默无监听），
  页面另有 #GameCanvas 时静默错绑。
- **实现**：四个 PAL 查找点支持 `globalThis.__CC_CANVAS__` 元素引用覆盖（import 前设置=任意 id 可用、
  零 DOM 改写；file-map 登记，modifiedCount 31→34，UPSTREAM.md 新节）；ensureCanvasDOM 补：
  decoy 冲突显式抛错（可行动信息）、自定义 id 迟绑定警告（两条修复路径）、tabIndex 默认 0 +
  focus-visible 样式（PAL mousedown/touchstart 自动 focus，键盘仅聚焦时到达）。
- **实测**（三模式 7/8/2 断言，pageerror=0）：classic 控制组（鼠标坐标精确映射 (400,420)、
  键盘焦点门控 1/0、复焦 ✓）；anyid（__CC_CANVAS__+动态 import：渲染+输入+真实触摸 hasTouch tap ✓）；
  decoy（显式拒绝 ✓）。鼠标模拟触摸路径（无触摸平台）未单测，如实登记。
- **复现**：`tools/verify/canvas-binding.cjs`。

## W05 — 坐标空间（P1）

- **实测矩阵**（DPR 1/2，离中心点击 (800,200) 判别 y 方向）：getLocation 左下原点像素精确
  （(800,520) 双 DPR）；**getUILocation 默认设置下与 getLocation 同空间同向**（左下原点向上，
  离中心点击判别——picking.md 早期"UI 左上 y 向下"说法与实测不符已修正）；相机射线
  screenPointToRay 中心精确命中 lookAt 点（miss=0）；变换父节点（平移+旋转+缩放）下
  **经父 UITransform.convertToNodeSpaceAR 的世界→局部精确回到 (0.3,0.2,0.1)**，
  "朴素减画面中心"偏差 2.3+（反例留证）。
- 设计分辨率非默认时的 UI 空间缩放关系未测（登记）；命中区域断言由 picking.md 既有示例链承载。
- **复现**：`tools/verify/coordinate-spaces.cjs`（探针 tools/debug/probes/coordinate-spaces-probe/）。

## W06 — DPR（P1）

- **GAP-W6-1 已修复**：ensureCanvasDOM 启动缓冲改为 `CSS × 有效 DPR`（与 resize 链对齐；
  公式与 screen-adapter devicePixelRatio getter 同源含 __CCDPR_CAP__ 上限）。实测 DPR=2 启动缓冲
  2560×1440（effectiveBufferRatio 2）、DPR=1 逐位不变（dpr=1 证据链零影响）。responsive.md §3 补记。
- 可配置上限（__CCDPR_CAP__）为 f082ff1 既有交付；本批补齐量化链证据（W03 dprChain ×4 模式）。
- **未测条件**：Android 真机 framebuffer/性能/电量指标（无设备）；按任务书"文档不把浏览器原始 DPR
  写成实际 framebuffer 倍率"已落实（capturing-screenshots.md §采集与 DPR + responsive.md）。

## W07 — Label 语义（P1）

- 四溢出模式矩阵（几何读 contentSize + 像素墨迹，9/9 断言）：NONE 不折行（38→1072 宽）、CLAMP 恒盒、
  SHRINK 实际字号内化 `_actualFontSize`（40→16，属性保持原值——断言渲染结果别读属性）、
  RESIZE_HEIGHT 强制折行（enableWrapText=false 仍 h=263）。字影实测生效（同帧差分+墨迹 468）。
  手册 creating-text.md 新增语义矩阵表。单行截断/省略号按任务书评估为独立能力未交付。
- **复现**：`tools/verify/label-semantics.cjs`。

## W08 — 确定性单时钟（P1）

- `src/air/step-clock.ts`：createStepClock() 三步合同（begin=game.pause 停真实 pacer；
  step(dt)=director.tick+等本帧 AFTER_DRAW，**运行态调用抛错反双时钟**；end=resume）。
- 实测（8/8）：双时钟门卫触发；begin 后真实 rAF 冻结（500ms delta=0）；90 步 dt 累计精确 1.5s、
  旋转角精确 135°；第 30 步中间值 45°；end 恢复（+1.155s）；**两轮同序列像素哈希全同**
  （cdf2552594083eab，SwiftShader 确定性渲染）。
- **复现**：`tools/verify/step-clock.cjs`。

## 门禁（P1 批次当期）
（P0 批次门禁见上；P1 批次）

- **绿**：typecheck 0 错 · verify:web-only · verify:file-map（modifiedCount 30→31 同步后 PASS）·
  verify:doc-refs（150 文档 1332 引用 0 断链）· build:dts（新导出面 12 处 contextHealth 族在 d.ts）·
  format:check（探针文件已 prettier 化）。
- **jest**：264/265，唯一失败 smoke-30「产物绑定」= **共享工作区并行构建竞态，非本批缺陷**：
  期间观察到 build/cocosair.module.js 在 ≥3 个确定态（0541cdb3 / a5b3d9fc / 05f7eb14，相差 ≤1 字节）
  被并行进程交替重写；本批 `npm run build` 两次确定性复现 **0541cdb3**（= 并行会话重采的 v12 矩阵证据
  哈希，自洽），单跑 smoke-30 曾绿。W03 证据记录的 a5b3d9fc 同为含本修复的构建
  （resize 非黑 13/13 断言在该构建上通过，证据对其记录哈希有效）。
- **build/ 在途产物不入本批提交**：留给并行集成分支统一落（避免捕获瞬态）。

## 2026-09-29 续批复验与 W12–W14

本节记录后续代码与独立证据；上文 P0/P1 的哈希与测试数量是历史快照，不能代替本节当前产物判断。

| 工作项 | 当前状态 | 本轮证据与边界 |
| --- | --- | --- |
| W04、W09–W11 复审修复 | 行为修复完成 | `w04-canvas-binding.json` 四模式 PASS；`w09-w11-assembly.json` PASS。修复画布 ID 保留/导入期错误、跨 Bank 引用、淘汰页出栈、SFX 独立播放器按 ENDED 回收。 |
| W12 调试树 | 已实现 | `inspectNode.visual` 返回 UI 尺寸/锚点、Label、SpriteFrame rect、texture/material/mesh 稳定资产 ID；业务可注册 frame/texture label，未知值返回 null。`smoke-22` 24/24。仅 DevTools 导出，不进默认 bundle。 |
| W13 性能分轴 | 工具完成；设备呈现待测 | `w13-performance-axes.json` 记录逻辑更新、主线程 BEFORE_DRAW→AFTER_DRAW、WebGL2 timer query GPU 时间；headless present 明确 unavailable。`--present-json=` 支持单独导入带设备名的 SurfaceFlinger 时间戳。无设备数据不得宣称设备 FPS 达标。 |
| W14 独立消费 | 包消费 PASS；release 仍阻塞 | `w14-package-readiness.json` 与 `tarball-browser-consumer.json`：离线 pack/install、声明消费、浏览器运行、嵌套 URL、nonce CSP（不含 unsafe-eval）、sourcemap、normal/min/gzip/brotli 尺寸。Web 构建将 `SUPPORT_JIT` 设为 false，复用上游非 JIT scheduler。`verify:release` 仍因工作树未提交、API inventory/Gallery/矩阵旧 bundle 指纹而 NOT READY；需集成后重采。 |

证据一致性修正：W03 runner 原先把 bundle **路径**交给 `sha256_16`，导致哈希不随内容变化；现改为 `sha256_16(fs.readFileSync(bundlePath))`。W03 四模式复跑 PASS，记录指纹与本轮 `build/cocosair.module.js` 一致。W09 的 ui-kit 为保留现有公共 API 仍由默认入口导出；如要做到字节级独立子包，需要另起兼容迁移，不可仅靠注释声称已拆包。

### 2026-09-29 集成复验

- Web 默认构建关闭 `SUPPORT_JIT`，复用上游已有非 JIT 调度分支；独立 tarball 的 nonce CSP（不含 `unsafe-inline`/`unsafe-eval` 脚本授权）、嵌套路径、sourcemap 验收 PASS。当前正常 bundle `bf07c87924fb2476`。
- W13 在 Chromium headless 用 GPU timer query 测得 GPU 轴；SurfaceFlinger 屏幕 present 保持 `unavailable`，有真实设备 trace 时用 `--present-json` 补录，不用 rAF 推断设备 FPS。
- V1.1 141/141 PASS（DevTools 5/5）；Gallery 静态部署 220/220 PASS（可启动例 141/141，生命周期 53）；V1.2 三浏览器矩阵 39/39 PASS；API 覆盖 core 963/963、important 272/272、advanced 180/191，门槛全过。
- 重采中定位验证环境 `chromium-1193` 对仓库 H.264 样例解码失败；切到项目已验证的 `chromium-1228` 后 `video-basic` 单例及 V1.1 全量均通过。Benchmark 静态服务也补充媒体 MIME，保证与开发服务器一致。未削弱视频资源错误断言。
- 最终本地检查：Jest 32 suites / 266 tests、`typecheck`、`verify:web-only`、`verify:file-map`、`verify:doc-refs`、API coverage `--check` 全过。`verify:release` 仅余工作树未提交一项；需把本轮源码、产物和证据作为同一候选提交后复跑。这里的 PASS 是本机浏览器及已记录的模拟后端结论，Android 设备 present 仍无数据。
