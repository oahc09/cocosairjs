# Cocos Air Code First 与 Web 可靠性优化任务清单

> 2026-09-28 基于当前仓库源码整理。本文是待执行清单，不代表功能已经交付。范围是 Web Code First 启动、2D 开发体验、输入、截图与运行可靠性；目前没有证据表明 2D 核心绘制能力普遍缺失。

## 0. 判定口径与边界

- **已确认**：`Label.Overflow.NONE` 不折行；WebGL/WebGL2 仅有 context lost 告警，没有完整恢复闭环；有效 DPR 被夹到 2；底层输入查找 `GameCanvas`；`runSceneImmediate` 销毁旧场景；已有 `game.step()`、`game.pause()`、`Label` 字影参数、`UITransform` 坐标变换和可 `npm pack` 的包。
- **待复现**：当前构建下默认物理材质是否仍会初始化失败；直接读 canvas 得黑图的精确条件；Android guest 实际 framebuffer 和性能差异；headless 是否没有合成与哪些计时器受影响。
- **业务层需求**：常驻场景栈、五路音效池、按 ID 管理 BGM、设计坐标系桥接。这些需求不等于引擎基础渲染缺陷。
- 优先使用 `src/air/`、可选 helper、示例和测试工具。若必须改 `src/cocos/` 或 `src/pal/` 抽取件，先核对上游映射，再补 `docs/upstream-file-map.json` 与 `UPSTREAM.md` 的差异记录。
- 保留当前未提交改动。每项实施前检查目标文件 `git diff`；证据脚本写入文件时使用独立输出路径，避免覆盖并发工作的正式证据。

## 1. 任务总览

| ID | 优先级 | 工作项 | 交付范围 | 完成判据 |
| --- | --- | --- | --- | --- |
| W01 | P0 | context loss 复现与状态机 | WebGL/WebGL2 swapchain、Air 生命周期合同 | 人为 `loseContext()` 后暂停无效提交，报告稳定状态；恢复或受控重载路径真实生效 |
| W02 | P0 | Code First 冷启动回归 | bootstrap、物理默认资源、无 Editor 页面 | 全新页面、无 Creator 资产包启动；`builtin`/`cannon` 初始化结果明确，失败不留半初始化状态 |
| W03 | P0 | 截图黑图归因与官方 capture 合同 | Agent Session、浏览器验证器、文档 | 同帧 `AFTER_DRAW` capture 与页面截图对照；明确 FBO、buffer 生命周期和 resize 条件 |
| W04 | P1 | 画布绑定与焦点合同 | `createAirApp`、PAL 输入、启动模板 | 任意 ID canvas 上鼠标、触摸、键盘均可用；焦点可读、可恢复；不意外改写用户 DOM ID |
| W05 | P1 | 输入坐标空间指南和转换 helper | 手册、示例、可选 AIR helper | DPR 1/2 与嵌套父节点下，UI/世界/局部坐标断言通过 |
| W06 | P1 | DPR 配置与 framebuffer 读回 | screen adapter、配置、示例 | 暴露浏览器 DPR/有效 DPR/缓冲尺寸；可配置上限，默认策略有性能证据 |
| W07 | P1 | Label 固定盒布局合同 | Label 用法示例、布局测试、必要 helper | 长短文本的左/中/右对齐、折行、裁剪、字号与字影有浏览器像素和几何断言 |
| W08 | P1 | 确定性单时钟测试 | `game.pause/step` 测试封装 | 手动步进期间真实 rAF 不更新逻辑；两个时间点可复现，结束后正常恢复 |
| W09 | P2 | 可选 2D Code First 辅助包 | `src/air/` 或单独子入口、模板 | 创建 Canvas/Camera/Sprite/Label 少重复代码；资源加载/释放可测试，无平行 Scene/Node 类型 |
| W10 | P2 | 场景栈与转场装配 | 可选导航模块及例子 | push/pop、常驻页面、双场景过渡、输入屏蔽及释放策略通过生命周期测试 |
| W11 | P2 | 音频通道服务 | 可选 `AudioService` | BGM 按 ID 续播/循环、音效并发上限、音乐/音效开关、手势解锁与释放通过浏览器测试 |
| W12 | P2 | 调试树和资源身份扩展 | DevTools/Agent Session，可选业务注册表 | 结构化返回 UI 尺寸、父子关系、材质、SpriteFrame、纹理身份；ID 稳定且不泄漏已销毁资源 |
| W13 | P2 | headless 与设备性能测量分离 | benchmark、文档 | 逻辑帧、CPU 提交、GPU 完成、屏幕呈现分列；无呈现证据时不得声称达到设备 FPS |
| W14 | P2 | 消费安装与发布准备 | tarball、starter、README、release gate | `npm pack` 后在独立目录安装运行；不借仓库 `node_modules`；包大小和发布门槛单独判定 |

## 2. 可靠性与启动任务

### W01 — WebGL 上下文丢失（P0）

当前 `webgl-swapchain.ts` 和 `webgl2-swapchain.ts` 都监听 `webglcontextlost`，但只告警；没有 `webglcontextrestored` 的资产重建闭环。先用 `WEBGL_lose_context` 在 WebGL1/2 浏览器实际复现，记录事件、`gl.isContextLost()`、rAF、场景时钟、资产和画面。随后定义 `healthy/lost/restoring/failed` 状态：lost 时停止绘制和业务时钟；若能重建所有 GPU 资源，测试纹理、buffer、program、FBO、glTF 共享资产及多次丢失；若本期不能安全恢复，则提供显式失败事件和受控页面重载策略，不宣称“自愈”。测试失败状态不得仍记 PASS。

### W02 — 默认资源冷启动（P0）

`src/air/physics-backend.ts` 已在模块求值期预置 `default-physics-material`，故历史报错不能直接当作现版缺陷。建立固定 bundle hash 的最小页面，在无 Creator 资产包、空缓存条件下分别走 `createAirApp({physics:'builtin'})`、`cannon` 和公开的低层 `game.init()` 路径；记录默认材质是否存在、初始化阶段、错误码及退出清理。只有复现现版失败才改初始化代码。回归同时覆盖重复启动和资产包晚到。

### W03 — 官方截图时机（P0）

当前 Agent Session 和示例验证器都在 `Director.EVENT_AFTER_DRAW` 读取 canvas，验证器还会显式绑定默认 framebuffer。以相同场景对照 `canvas.toDataURL()`、`gl.readPixels()`、Playwright 页面截图，覆盖 WebGL1/2、设备 DPR、窗口 resize、离屏 FBO 和暂停后的首帧。输出像素 hash、尺寸、清屏色占比及错误状态。若某调用时机无内容，应返回明确的 `CAPTURE_FAILED` 诊断；文档给出唯一推荐采集 API 和最小示例。不要用“PNG 已生成”代替画面正确。

## 3. 画布、输入与坐标

### W04 — Canvas 绑定和键盘焦点（P1）

`createAirApp` 接受 canvas，但 `ensureCanvasDOM` 会把它改名为 `GameCanvas`；PAL 的键盘、鼠标和触摸实现按此 ID 查询。先锁定 import 前/后注册时序，再设计显式 canvas 注入或集中查找机制。避免在页面已有另一个 `GameCanvas` 时把事件绑定到错误元素。默认模板设 `tabIndex=0`、点击/触摸后聚焦，并提供焦点丢失提示；明确键盘快捷键仅在画布聚焦时生效。验收包含两块 canvas、非默认 ID、鼠标模拟触摸、真实触摸和键盘。

### W05 — 坐标空间（P1）

为 `getLocation()`、`getUILocation()`、设计分辨率、世界空间及父节点局部空间各写一个可运行示例。设计坐标到节点局部坐标时必须经过目标父节点的世界矩阵或 `UITransform.convertToNodeSpaceAR()`，不能简单地对所有层级减去画面中心。测试 DPR 1/2、窗口缩放、锚点变化、父节点平移/旋转/缩放及命中区域；示例读取同一事件并展示各空间数值。

### W06 — DPR（P1）

`screen-adapter` 目前 `Math.min(window.devicePixelRatio ?? 1, 2)`；最终 WebGL drawing buffer 由 swapchain `resize()` 写入 canvas。先量化 CSS 尺寸→有效 DPR→screen/window size→swapchain 尺寸链路，再决定可配置上限（例如默认 2、可选 1 到设备 DPR，另受纹理/显存上限约束）。Android 高 DPR 设备上同时记录清晰度、GPU 时间、内存和电量代理指标。文档不把浏览器原始 DPR 写成实际 framebuffer 倍率。

## 4. UI、导航与音频装配

### W07 — Label 语义（P1）

用表格和浏览器图像验证 `NONE/CLAMP/SHRINK/RESIZE_HEIGHT`、`enableWrapText`、固定盒宽、水平/垂直对齐与 anchor。`NONE` 不折行是已确认语义；长名称单行截断和省略号应作为单独 helper 或新能力评估，不把 `CLAMP` 冒充原版 `setShowLine(1)`。字影先验证现有 `enableShadow/shadow*`；只有确有表现缺口才扩展。测试需读布局尺寸和像素，属性设置成功不算通过。

### W09 — 可选 2D helper（P2）

设计最小 `createUICanvas`、`spriteNode`、`labelNode`、`AssetBank` 等工具，复用原生 `Node/Sprite/Label/Camera/UITransform`。资源加载器支持进度、失败清理、重复加载与共享引用，释放时不破坏其他场景。先迁移一个现有 2D 示例验证冗余减少和包体增量，模板提供 TypeScript 组件生命周期；核心 `createAirApp` 不承载业务布局。

### W10 — 场景导航（P2）

定义两种明确模式：`runSceneImmediate` 的替换销毁，以及业务导航层的常驻页面 Node。实现 push/pop、过渡期输入屏蔽、双页面同绘、返回页状态保存、缓存上限及超限释放。动画转场使用同一主循环和相机约定；测试在过渡中取消、快速重复切换及资产引用不泄漏。

### W11 — 音频服务（P2）

先用现有 `AudioSource` 的 `loop/currentTime/pause/playOneShot` 做业务抽象；若 5 路并发、手势恢复或浏览器后端存在实证限制，再为适配层选择 Web Audio/HTMLAudio。BGM 每 ID 一份可续播状态，音效池最多 5 路，音乐和音效开关独立。测试重复触发、暂停/恢复、后台切换、静音、页面销毁及 Safari/Chromium 行为。不得用 `playing=true` 单独证明实际时钟推进。

## 5. 测试、观察与发行

### W08 — 单时钟（P1）

现有 `game.step()`/`game.pause()` 已可用，但业务自行暴露 `window.advanceTime(ms)` 时容易与真实 rAF 并发。提供测试驱动封装：暂停 pacer→固定步长或明确 `dt` 步进→每步 `AFTER_DRAW` 捕帧→恢复；禁止同时运行两套时钟。以动画中间值、暂停状态、连击窗口和多次运行 hash 稳定性验收。

### W12 — 调试树（P2）

当前已有 Agent Session 的 scene/node/asset 检查。先列业务断言仍缺的字段，再增补 UITransform 尺寸/锚点、SpriteFrame rect、贴图 UUID、材质引用和销毁状态。业务 `frameIds` 属应用层身份，可通过注册表映射；工具只报告真实可观察值和 `unknown`，不伪造 ID。JSON 结构有版本、截断标记和循环引用处理。

### W13 — 性能测量（P2）

把 headless 的逻辑帧步、CPU 命令提交、GPU timer query、浏览器 compositor 以及 Android SurfaceFlinger present 分开记录。15 倍场景负载 FPS 字节不变应触发“指标不敏感”而非 PASS；同时验证动画时钟是否推进，不能从 FPS 现象推断动画恒假。设备上的 FPS/帧时间门槛只使用实际呈现轴，注明 GPU/驱动/刷新率环境。

### W14 — 独立消费与发布（P2）

仓库已有 `package.json` exports 和 tarball consumer gate，目标是把“可安装”与“可发布”分别验收。建立只含 tarball 和锁文件的独立项目，覆盖 ESM import、声明、浏览器部署、解码器资源路径、嵌套 URL、CSP 和 sourcemap。记录未压/min/gzip/brotli 大小与加载时间；不要要求消费者借用本仓库 `node_modules`。发布门槛继续由覆盖率和证据决定，npm 凭据缺失仅阻止实际 publish。

## 6. 排序、交付和验收

1. **先做 W01–W03 诊断与可靠性闭环。** 它们决定画面消失、冷启动和截图证据是否可信。
2. **再做 W04–W08 的公共合同。** W04/W05 先于可选 2D helper；W03/W08 先于视觉/时间回归门禁；W06 的设备性能结果先于默认 DPR 策略定稿。
3. **最后做 W09–W14 的装配层和发行准备。** 场景栈、音频服务与调试业务映射保持可选，不扩大默认运行包。

每项完成时交付：代码或“未复现”结论、最小复现页面、测试数据和可重跑命令、影响的文档与示例、包体/兼容性变化。浏览器视觉项必须有目标设备或浏览器截图与数值断言；在强制门禁通过后才将状态从待办改为完成。`npm run typecheck`、受影响 smoke、`npm run build`、`npm run build:dts`、`npm run verify:web-only`、独立消费验收按影响范围执行。最终分别报告 WebGL1/2、DPR 1/2/高 DPR、Chromium/Firefox/WebKit 的覆盖与未测条件。
