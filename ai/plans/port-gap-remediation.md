# Cocos AIR 引擎改进与复刻端口统一计划

> 统一执行入口；合并 libGDX 端口报告、28 项子系统报告及30项目引擎改进来源计划（原文件名 `CocosAirJS-Engine-Improvement-Task-Plan.zh-CN.md`，当前未随本仓提交）。原 PG-01…27 保持编号，新增 PG-28…35。**唯一执行顺序以 §12 为准**；§1 的优先级只是风险标签，旧波次已被替代。本计划尚未获实施授权。

> 2026-10-03 基于 owner 提交的一次 libGDX APK 1:1 复刻所暴露的 AIR 接口/能力缺口清单整理。端口工程在仓库外（端口侧文件 `src/runtime/spine21.ts`、`atlas.ts`、`font.ts`、`level.ts`、`game.ts`、`actor.ts`、`select.ts`、`press.ts`、`stage.ts`、`audio.ts`、`tiled.ts`、`main.ts` 与 `_scratch/drive.mjs` 均不在本仓），其断言以 owner 报告为准。本文是待执行清单，不代表任何条目已交付。
>
> 2026-10-03 源码复审基于 HEAD `ea2b507f9182c98810a6e300d2eaac8b50457622` 及当时未提交的工作区内容，仅核对静态实现，未运行浏览器验证。原清单不能按“15 条属实”统计：⑧⑨应区分现有能力与接线/使用问题；⑩已有鼠标转触摸；⑪已有可聚焦设置与交互聚焦；⑫已有直接切场景 API；⑬已有 Promise 资产库；⑯已有场景树快照与面板。其余条目也须区分源码缺口、配方缺口与端口侧未复核报告。执行前须记录 HEAD、工作区差异和相关源文件/产物指纹，再复核证据。
>
> **合并刷新（2026-10-03）**：当前 HEAD 为 `cf2a54f2601e5a13f2a5feaccac97a0f5eac98bf`；本轮按当前源码和现存报告重新核对，未重跑构建、测试或浏览器。上段为历史复审，不是当前候选身份。当前字节快照与已交付 CB 范围见 §10.1，35 个任务的排期见 §12。

## 0. 判定口径与边界

- **证据基线**：端口侧体验来自 owner 报告，本仓无法独立复核；引擎侧引证来自 2026-10-03 工作区，不能仅以 HEAD 标识。执行每项前记录 HEAD、目标文件差异与相关源文件/构建产物指纹，复核所引符号、行号与行为；不一致先在台账记“证据漂移+差异分析”，不照单修。静态能力存在不等于端口路径已经验证。
- **上游边界纪律**：凡改 `src/cocos/` 抽取件（如 `tiledmap/tiled-object-group.ts`），先读 `docs/upstream-file-map.json` 对应项，修后在 file-map 与 [UPSTREAM.md](../../docs/UPSTREAM.md) 登记差异。`src/pal/` 则由冻结的 `vendor/pal-source/` 经 `tools/build/pal-source.cjs` 生成：需要适配时修改生成转换，运行 `--write` 重建，再以 `--check` 验证，并更新适用差异记录；不得只改生成 JS，也不得静默改冻结源或基线。纯增量落 `src/air/` 无上游差异登记负担。
- **浏览器验证义务**：凡涉渲染、命中、视口、音频行为的条目，完成判据含真实浏览器断言；typecheck 或构建通过不算数。
- **端口侧自研件是"绕行现状"的证据，不是待收编代码**：`spine21.ts`、`atlas.ts`、`font.ts`、`stage.ts`/`uiToDesign` 等收编与否在各条目单独决策；对应条目落地后端口侧绕行件应可删除（回收清单见 §6）。
- **与其他计划的边界**：本计划只收"1:1 复刻端口"暴露的缺口。静态基准暴露的缺口在 [competitive-benchmark-remediation.md](competitive-benchmark-remediation.md)（CB-xx）；输入传播合同归 CB-09，错误码/告警文案纪律沿用 CB-02，外部模型资产主题另见 [standalone-asset-pipeline.md](standalone-asset-pipeline.md)，均不重复实施。
- **补充报告口径**：§8 合入复刻过程新增的 A…G 子系统报告，共 28 项；A1…G4 是该报告的追溯编号，与附录 A 的旧①…⑰分开。当前仅做源码评估，端口资产、截图、INTEGRATION-NOTES 和原运行包未提供，不能将报告中的截图相同、1/42 绑定率或“至少四次”独立确认为本仓实测。新增待办见 §9，保持原 PG-01…17 编号稳定。
- **静默失败优先**：先确认诊断是否产生、是否被日志级别屏蔽、是否被工具采集，再补缺失检查。`createAirApp` 当前固定 `DebugMode.ERROR`，引擎 warn/warnID 会被屏蔽；只补一次性 warn 不足以交付。错误输入、合法未使用关节、正常剔除与自动后端选择应分别处理，不能把“没画出来”统一判为错误。
- **来源与新增能力边界**：WP00…WP10 仅为外部计划追溯编号，本仓去重映射见 §10.3。30 项目发布提交、USER_CONFIRMED、140 条历史 findings、54/114/82 等计量均是外部材料声明，本轮无法核验，不计入本仓 PASS。拟新增 API 须先形成兼容/所有权合同，不因文档合并自动获得代码、提交、发布或消费者迁移授权。

## 1. 风险优先级（执行顺序见 §12）

三档排序依据 = owner 原排序（①②④ 决定"能不能低成本搬 APK/libGDX 资产"；⑦⑧⑨⑪ 小改动防埋雷；⑤⑥ 工作量最大）+ 2026-10-03 核实结论：

1. **P0 资产闸门（PG-01…04）**：libGDX 文本图集、BMFont 解析/加载入口、TiledMap 查询面 + Spine 2.1 迁移策略决策。owner 原排序优先①②④，本计划将③(BMFont) 并入资产波次；图集与字体可共用纹理加载基建，TiledMap 则保留既有解析路径并补查询合同。①(Spine 2.1) 本波只出决策备忘录。
2. **P1 接口与使用合同（PG-05…10）**：PG-05/06 为接口增量；PG-07/08/09/10 先验证现有能力与端口路径，再决定配方或修复范围，不统一预判为 S 级。PG-10 仅在确认残余能力缺口后出决策备忘录。
3. **P2 表现层与工具链（PG-11…17）**：UI mesh、平台跳跃配方、场景切换评估、调试/测试钩子、文档与声明。

## 2. 任务总览

| ID | 优先级 | 工作项 | 对应缺口（核实证据） | 交付范围 | 完成判据 |
| --- | --- | --- | --- | --- | --- |
| PG-01 | P0 | libGDX 文本图集（.atlas/.pack）解析入口 | ②（全仓无文本图集解析，`src/air/assets` 仅 gltf；SpriteFrame rect/rotated/originalSize/offset 原生，`sprite-frame.ts:357-417`） | `src/air/assets/atlas/` 解析器 + 按 region 切帧的 SpriteFrame 公开工厂 | 含 rotated region、orig/offset 留白、多页图集三情形的浏览器渲染断言；端口侧逐 region 烘焙（`atlas.ts`）可被替换 |
| PG-02 | P0 | BMFont 解析与资源加载入口 | ③（`.fnt` 下载/工厂只产出文本；BitmapFont 还需 spriteFrame/纹理与字形表初始化） | `parseFnt(text)` 纯解析 + 接受页面资源或加载上下文的 BitmapFont 工厂；明确 URL 基址、页面范围、初始化与释放 | 文本与页面纹理共同产出可渲染字体；浏览器像素断言覆盖 kerning 与三字号；页面范围和资源生命周期落手册 |
| PG-03 | P0 | TiledMap 对象层原始坐标与类型查询 | ④（`tiledmap/tiled-object-group.ts:221` 就地改写 object.x/y、原值仅存 offset，iso 换算 233-234 / y 翻转 236） | raw 坐标只读面 + `getObjectsByType()` + "瓦片做碰撞查询"官方读法（上游文件，登记差异） | iso/ortho 两类地图均可同时读原始与换算坐标；类型查询有 smoke；tiledmap 既有证据不回归 |
| PG-04 | P0 决策 | Spine 2.1 资产迁移策略 | ①（`spine/lib` 仅 3.8/4.2 且为构建期文件替换分发；APK 为 Spine 2.1.27 JSON） | 决策备忘录：离线 2.1→3.8 转换器（tools/） vs 维持端口外挂播放器；批后实施 | owner 决议落账 [owner-decisions.md](../../docs/reference/owner-decisions.md)；若批转换器：端口资产经转换走原生 3.8 通道并通过浏览器断言 |
| PG-05 | P1 | AudioService stopBgm 与音量 | ⑦（公开面无 stopBgm、无 BGM 音量；`audio-service.ts:80` 节点名 `AudioService/BGM/${id}` 成隐性契约） | `stopBgm()`（停并归零，区别于续播合同）+ `setBgmVolume(v)`；节点名不再作为契约的说明 | 原作死亡语义"停并归零"可表达；bgmState 以 currentTime 实测如实反映；smoke + 浏览器断言 |
| PG-06 | P1 | AssetBank ext 推断与加载路径文档化 | ⑬（loadRemote 回调式且须手传 ext，d.ts:28169；`air/ui-kit.ts:145` AssetBank.load 已 Promise+并发去重） | AssetBank 扩展（ext 推断）+ 手册把 AssetBank 写成 raw 远程加载的官方答案 | 无扩展名 URL 可加载且语义明确；手册页给出推荐加载路径 |
| PG-07 | P1 验证 | 键盘聚焦合同与残余诊断 | ⑪（bootstrap 已设 tabIndex=0；PAL 已在 mousedown/touchstart 聚焦；缺 canvas 的正常导入路径已有 screen-adapter 报错） | 复用现有焦点配方，验证首屏未交互、交互后、失焦及自定义 canvas；确有诊断缺口再补生成转换 | 浏览器确认绑定与交互聚焦正确；正常失焦不误告警、不抢文本输入焦点；若改 PAL，生成与 `--check` 一致 |
| PG-08 | P1 | designResolution 接线与 EXACT_FIT 验证 | ⑧（view.setDesignResolutionSize 已导出而 `src/air` 未接线；Canvas 按 view.getScaleY() 换算正交高，端口裁切根因仍待复现） | 先验证现有机制，再决定 createAirApp designResolution 选项或相机视口评估；手册 | 978×846 设计视口在不同窗口纵横比下无裁切、显示与命中一致；端口回归后决定 uiToDesign 回收 |
| PG-09 | P1 | 纯输入区域配方 | ⑨（UITransform 已导出，hitTest 不要求可渲染组件；端口裸 Node 的组件/层级/派发配置待复现） | 手册配方 + ui-kit 可选 `createInputRegion()`；验证发现缺口再升级为修复项 | 空 UITransform 节点可收按下（浏览器断言）；不为它引入可渲染依赖 |
| PG-10 | P1 验证/决策 | 现有鼠标转触摸合同与残余缺口 | ⑩（`input.ts:343` 已有 `_simulateEventTouch`，鼠标 down/move/up 注册路径已调用；端口双订阅报告不证明能力缺失） | 单路 TOUCH_* 配方 + 现有通道验证；发现 cancel/设备共存等缺口再出修复决策，不新增平行合成层 | 桌面鼠标与真实触摸均可走单路触摸监听；核对重复派发、UI 吞噬、离开/取消及混合设备序列；残余缺口与 owner 决议落账 |
| PG-11 | P2 | UI 空间贴图三角形 | ⑤（GeometryRenderer 顶点仅 position/normal/color，`geometry-renderer.ts:334-380`，且属 debug-draw 层） | `src/air` UI-mesh 薄封装（复用 2D assembler/batcher 内部件）+ 示例；过渡期 Mesh+MeshRenderer+unlit 兜底样例 | 任意 UV 三角形进 UI 批渲染正确（像素断言）；不扩 debug-draw 层 |
| PG-12 | P2 | 平台跳跃配方手册页 | ⑥（定步与 2D Box2D 后端存在，缺瓦片碰撞/单向平台/定步渲染解耦配方，端口自写 AABB 求解器为证） | docs/manual 配方页 + 示例（瓦片碰撞查询联动 PG-03；onewayplatform；定步与渲染解耦） | 示例可跑且有浏览器证据；端口复刻的原作 Box2D 语义差（µ=0.2、无 linearDamping、松键靠地面摩擦减速）如实标注 |
| PG-13 | P2 | 场景切换模式评估与文档 | ⑫（`AirAppImpl.run` 每次调用 runSceneImmediate，仅主循环启动一次；director.loadScene 也存在但依赖 bundle 场景资产） | 比较重复 app.run(newScene)、整页重载、scene-stack 与 bundle loadScene；明确 Code First 适用范围 | 验证节点销毁、持久节点、资源引用与业务监听释放；给出推荐与 boot 语义，不默认新增切换 API |
| PG-14 | P2 | 现有场景树工具接入与文档 | ⑯（`tools/debug/agent-session.ts:435` 已有 inspectScene；`panel.ts:129` 已有场景树展示，端口未接入） | 现有 session/panel 的接入配方与复核；仅补实测确认的缺失能力 | 接入后可读结构快照与展示层级；确认截断/会话关闭合同；不进默认运行时包 |
| PG-15 | P2 | 测试输入注入 API | ⑰（手工定步已存在；公开测试注入合同仍需核对，端口 CDP 流程仅为其当前实现） | 测试专用 touch/key 入口，复用既有派发通道；PG-10 验证后确定落位 | 注入与真实事件经同一引擎派发链路到达 UI；不重建鼠标转触摸；保留真实 DOM 输入测试覆盖 PAL/焦点行为 |
| PG-16 | P2 | 裁剪与脏标记语义文档 | C（updateCulling 该不该在业务帧补，只能读 `assembler/simple.ts:115-116` 源码定论） | 手册页：2D 裁剪与脏标记合同 | 语义有官方文档且与源码行为一致 |
| PG-17 | P2 | TS 4.9 lib.dom 补充声明 | ⑮（TS 4.9 声明缺口；本仓配置与外部消费者类型入口不同） | 明确 ambient 声明经 build:dts 进入 npm 类型入口的路径；或 TS 升级决策备忘 | 独立 TS 4.9 消费者导入包后无需本地断言；较新 lib.dom 无重复声明冲突；类型补充不冒充浏览器能力验证 |

## 3. P0 详情

### PG-01 — libGDX 文本图集解析入口

现状：`src/air/assets` 只有 gltf 一条链路，引擎无 .atlas/.pack 运行时解析；SpriteFrame 侧 `rect/rotated/originalSize/offset` 能力全部原生（`src/cocos/2d/assets/sprite-frame.ts:357-417`），缺的只是解析入口与"按 region 切帧"的公开工厂。交付：`src/air/assets/atlas/` 纯增量解析器，覆盖 libGDX 文本图集的旋转 region、orig/offset 留白与多页；工厂直接把 region 映射到 SpriteFrame 原生字段，**不做逐 region 烘焙 canvas**（rotated 走原生渲染通道，需一个浏览器用例确认后替换端口侧 `atlas.ts` 的烘焙绕行）。验收：三情形（rotated / 留白 / 多页）各一张浏览器像素断言；与 glTF 纹理共用 loadRemote 加载路径。

### PG-02 — BMFont parseFnt 运行时入口

现状：`.fnt` 下载为文本（`downloader.ts:292`）、工厂只造 TextAsset（`factory.ts:125`），`fntConfig` 消费面存在，但 `BitmapFont` 还依赖 `spriteFrame`/纹理以及 `onLoaded()` 建立的字形表，单凭文本不能生成可渲染字体。交付分两层：`parseFnt(text)` 返回配置与页面描述（含 kerningDict、逐字 rect/offset/advance）；资源工厂接受页面 SpriteFrame，或通过明确的加载上下文解析页面 URL，再装配并初始化 BitmapFont。页面相对路径以 `.fnt` URL 或显式 baseURL 为基准；原生 BitmapFont 只有单个 spriteFrame，默认范围先限定单页，多页输入须明确拒绝，支持多页另评，不能静默忽略。工厂须定义纹理/帧引用的持有、失败回收与释放合同。libGDX 左下原点与三字号（0.8/1.0/1.2）适配落手册。验收：纯解析 smoke、页面解析/失败释放断言与 kerning/三字号浏览器像素断言；符合声明范围且通过端口回归后才回收 `font.ts` 绕行。

### PG-03 — TiledMap 原始坐标与类型查询

现状：`tiledmap/tiled-object-group.ts:221` 把 `object.offset = new Vec2(object.x, object.y)` 后就地改写 x/y（iso 换算 233-234、y 翻转 236），TMX 原值只能从 offset 兜底；对象层属性/类型没有面向玩法的稳定读法，端口为此独立解析了一份 TMX（还须自处理自闭合空层）。交付：保留换算坐标的同时暴露原始坐标只读面 + `getObjectsByType()`，并给"用瓦片做碰撞查询"的官方读法（与 PG-12 配方联动）。**上游文件**：改动须登记 file-map 与 UPSTREAM.md，且注意向后兼容——现有依赖就地换算语义的路径（含 `TMXObjectType.TEXT` 分支与 canvas 尺寸计算）行为不变。验收：iso/ortho 地图对象双通道坐标与 TMX 原值核对 smoke；tiledmap 相关既有证据（browser-matrix 等）不回归。

### PG-04 — Spine 2.1 资产迁移策略（决策先行）

现状：`spine/lib` 仅 3.8/4.2，版本分发是构建期文件替换（`spine-instantiate.ts` 头注释：构建时被 3.8/4.2 版本文件覆盖，`spine-version-dynamic.ts` 为动态实现）；APK 资产是 Spine 2.1.27 JSON，skin/mesh/skinnedmesh 结构不同，端口被迫自写 ~900 行播放器（region+mesh、setup 包围盒脚底对齐、delay=0 混帧语义），mesh attachment 因 PG-11 缺口只能按骨骼分组烘焙位图。**本项产出首先是决策备忘录**，不是代码：比较 (a) `tools/` 离线 2.1→3.8 schema 转换器（资产一次性迁移、转换后走原生 3.8 通道）与 (b) 维持端口外挂播放器（"实例化入口可插版本"列为长期项）。owner 批 (a) 后实施转换器 + 端口资产走通原生通道；两档均落账 owner-decisions.md。注意 (a) 的转换器仍是实质工作量（mesh/skinnedmesh 语义映射），备忘录须给出范围与风险及维护成本比较，不预设"轻量"。

## 4. P1 详情

### PG-05 — AudioService stopBgm 与音量

现状核实：公开面 = `load/playBgm/pauseBgm/resumeBgm/playSfx/setMusicEnabled/setSfxEnabled/bgmState/dispose`（`air/audio-service.ts:44-199`）；`playBgm` 合同是"保留 currentTime 续播"（100-102 注释明示），BGM 无音量入口（playSfx 有 volume 参数），节点命名 `AudioService/BGM/${id}`（:80）成了端口挖掘的隐性契约。交付：`stopBgm()`（停止并归零 currentTime，与 pause 语义区分）+ `setBgmVolume(v)`；文档明确节点命名不是公开契约。`src/air` 原创，无上游负担。验收：smoke 断言 stop 后 `bgmState()` 如实归零、续播合同不受影响；浏览器以 currentTime 实测推进（沿用本服务既有判据纪律）。

### PG-06 — AssetBank ext 推断与加载路径文档化

`AssetBank.load` 已是 Promise + 并发去重（`air/ui-kit.ts:145-168`），缺口收窄为：无扩展名 URL 的 ext 推断（嗅探 magic bytes 或显式 opt-in，语义定清楚）+ 手册把 AssetBank 写成 raw 远程加载的官方答案，替代业务自包装（端口 `tiled.ts:1-7` 的 `loadRemoteAsset()` 即此类绕行）。验收：无扩展名资源加载通过；手册页落档。

### PG-07 — 键盘输入缺失告警与聚焦配方

`_registerEvent` 的 `canvas?.addEventListener` 本身会跳过缺失画布，但正常引擎导入链的 screen-adapter 已检查画布并报错，不能把该局部实现推断为整体零反馈。`bootstrap.ts` 已将负 tabIndex 设为 0；Web PAL 的 mousedown/touchstart 已聚焦画布；`docs/manual/script-component-workflow.md` 已说明键盘焦点要求。先验证首屏未交互、交互后收键、失焦/再聚焦、自定义 canvas 预绑定与文本输入控件共存；只补实际缺失的配方或诊断，不因正常失焦告警或重复抢焦点。若仍需 PAL 告警，修改 `tools/build/pal-source.cjs` 中对冻结源的生成转换，再 `--write` 重建并 `--check` 核验；同步适用的差异记录，禁止只修改生成 JS。告警文案沿用 CB-02；starter 是否需要首次主动 focus 以浏览器验证及焦点合同为依据。

### PG-08 — designResolution 接线与 EXACT_FIT 浏览器验证

机制已在包内：`view` 单例、`setDesignResolutionSize` 与 ResolutionPolicy 已导出，Canvas 按 `windowSize.height / view.getScaleY() / 2` 换算正交高（`canvas.ts:223-235`）。AIR 尚无启动选项接线，但不能据此确定端口裁切根因，也不能预设 EXACT_FIT 满足非等比虚拟舞台需求。先在不同窗口纵横比、DPR 与 resize 下验证 `EXACT_FIT(978,846)` 的设计视口完整性、相机投影、screenToWorld/getUILocation 与节点命中一致性。通过后再交付 `createAirApp` 的 `designResolution: { width, height, policy }` 选项 + starter/手册，并定义调用时机及 resize 合同；端口 `stage.ts`/`uiToDesign()` 仅在端口回归通过后考虑回收。若现有机制不满足需求，升级为相机视口 API 评估并记录实测数据。

### PG-09 — 纯输入区域配方

核实降级：`UITransform` 已导出，`hitTest` 不要求可渲染组件；裸 Node 在 Code First 下不会自动挂 UITransform，但端口失败的具体原因仍须复现其组件、层级、相机可见层与事件订阅配置。先浏览器验证 `addComponent(UITransform)+setContentSize` 的命中链路；通过则交付手册配方 + ui-kit 可选 `createInputRegion()`（纯输入区域节点），失败则记录最小复现并升级为修复项。验收：空 UITransform 节点收按下事件的浏览器断言；不引入可渲染依赖。

### PG-10 — 现有鼠标转触摸合同（验证先行）

`src/cocos/input/input.ts:343` 已有 `_simulateEventTouch`，鼠标 down/move/up 注册路径会调用它；按 `simulateTouch` 字面搜索零命中不能证明能力缺失。`docs/manual/input-and-events.md` 已说明鼠标可产生 TOUCH_*，同一操作应选一路监听，以及 UI 吞噬对全局触摸回调的影响。先用真实浏览器核对桌面单路 TOUCH_*、真实触摸、重复订阅、UI 吞噬、画布外抬起/离开与 cancel、混合设备触点生命周期；端口双通道报告作为复现线索，不作为重建合成层的依据。验证通过则交付现有通道配方与端口接入建议；若发现残余缺口，记录最小复现，比较补现有通道与工具配方两档，再请 owner 决策。PG-15 复用既有派发链路；不新增平行 pointer→touch 合成层。

## 5. P2 详情

- **PG-11（UI 贴图三角形）**：`GeometryRenderer` 是 debug-draw 层（`geometry-renderer.ts:334-380` 顶点仅 position/normal/color），给它加 UV 是错层。正路：`src/air` 包一层 UI-mesh 薄封装，复用 2D assembler/batcher 现有内部件；过渡期可用 Mesh+MeshRenderer+unlit 材质出 Code First 样例兜底。端口 `spine21.ts:858-862` 的"mesh attachment 按骨骼分组烘焙位图"绕行即为此缺口所迫——本项与 PG-04 决策联动（转换器路线落地后烘焙需求自然消解）。范围（封装 vs 仅样例）随 PG-04 同批请 owner 表态。
- **PG-12（平台跳跃配方）**：手册页 + 示例：瓦片碰撞查询（联动 PG-03 的官方读法）、单向平台（onewayplatform，端口 `level.ts:144,176` 为证）、定步与渲染解耦（`src/air/step-clock.ts` 已支持手工定步）。如实标注端口复刻所见的原作 Box2D 语义（µ=0.2 摩擦、无 linearDamping、松键只靠地面摩擦减速），不把 AIR 现状误写成等价。
- **PG-13（场景切换评估）**：`AirAppImpl.run(scene)` 每次调用 `director.runSceneImmediate(scene)`，仅主循环启动是幂等的，支持重复传入新场景。比较此直接 Code First 路径、整页重载、`air/scene-stack.ts`（Node 页面栈）与 `director.loadScene`（依赖 bundle 场景资产，存在不等于 AIR 已提供外部场景资产链路）。逐项验证旧节点/组件销毁、持久节点、资源引用、业务监听与计时器清理；节点销毁不直接等同于所有资源释放。产出适用范围、推荐姿势与 boot 语义，不默认新增 API。
- **PG-14（现有场景树工具接入）**：复用 `tools/debug/agent-session.ts` 的 `inspectScene()` 结构快照和 `tools/debug/panel.ts` 的层级展示；先提供端口接入与使用配方，复核节点 ID、截断和会话关闭合同，仅补实际缺失能力。不进默认运行时包；场景快照不能替代 `__turtleGame` 等业务状态探针。
- **PG-15（输入注入）**：PG-10 验证后明确测试入口位置，复用既有 touch/key 派发链路并与手工定步协调，不重新实现鼠标转触摸。引擎内注入用于确定性 UI 测试，同时保留真实 DOM 输入验证 PAL、坐标和焦点路径；注入通过不代表真实输入链已通过。
- **PG-16（裁剪/脏标记文档）**：依据 `assembler/simple.ts:115-116` 现行为写手册页，口径与源码一致。
- **PG-17（TS lib.dom 声明）**：默认先评估 ambient 声明的打包路径：npm 仅暴露 `build/cocosair.module.d.ts` 类型入口、不发布 `src`，须确认补充声明经 `tools/build/build-dts.cjs` 进入包入口并能被外部消费者加载。完成判据包含独立 TS 4.9 消费者导入包后直接使用 DecompressionStream，以及较新 lib.dom 的声明兼容检查；仓内 typecheck 不足以验收。浏览器支持须运行时检测，声明不提供 polyfill。TS 升级另立影响面评估，不捆绑本计划。

## 6. 附带观察与端口侧回收清单

- **boot 探针 40–90s 疑点**：端口侧探针 boot 上限要给到 40–90 s 才稳——正常启动不应此量级，疑似探针等错信号或冷编译所致。属端口工程侧问题，建议 owner 侧单独排查；若证实引擎慢启动再回灌本计划或 CB 线。
- **端口绕行件回收候选**（仅在能力覆盖并通过端口回归后由 owner 决定）：`atlas.ts` 逐 region 烘焙（PG-01）、`font.ts` 逐字裁剪缓存（PG-02，须符合页面支持范围）、独立 TMX 解析（PG-03）、`stage.ts`/`uiToDesign`（PG-08）、拖动监挂地图 Sprite（PG-09）、鼠标/触摸双订阅去重（PG-10）、`loadRemoteAsset` 自包装（PG-06）、额外抢焦点逻辑（PG-07）。PG-14 接入后仅回收重复的场景结构观察逻辑；业务状态钩子不能因已有场景树而整体删除。

## 7. 执行安排与台账

- **状态**：本统一计划尚未实施；PG-01…35 的新增部分待办，重合 CB 工作按 §10.1 复用现有交付，不能全部重新标为未实现，也不能把 CB 的通过扩大为 PG 新范围通过。后续获得执行授权时，在 `ai/ledgers/` 建同名台账，逐项记录状态、基线指纹、证据复核、实测与残余事项。
- **顺序**：原 W1…W3 波次已被 §12 的 S0…S6 替代；不得按条目编号直接顺序实施。
- **重合边界**：输入传播合同归 CB-09；错误码/告警纪律沿用 CB-02；外部模型资产见 standalone-asset-pipeline.md。重合处互引，不重复实施。

## 8. 新增子系统报告评估（2026-10-03，仅静态核对）

结论：静默失败确实是优先诊断主题，但报告中的“全链路/全部静默”需要收窄。当前有三种不同情况：蒙皮数据校验存在直接跳过；已有 warn 被 AIR 的 ERROR 日志级别屏蔽；shader 编译/链接已有 error 输出与开发工具采集。新增工作必须覆盖这三层，不能只增加日志或从零再建调试面板。

判定用语：“源码确认”只表示静态分支或缺口存在；“部分成立”表示体验可能成立但机制描述或范围需修正；“待复现”表示尚不能据源码确定报告根因；“使用/公开面合同”优先文档与接入验证，不默认改原生 API。

### 8.1 A — 蒙皮与动画（8 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| A1 越界、绑定跳过、退化 bounds 零输出 | **源码确认诊断缺口**：[mesh.ts](../../src/cocos/3d/assets/mesh.ts) `getBoneSpaceBounds` 跳过非零权重的越界 joint，也跳过缺 attributes 的 primitive；[skinning-model.ts](../../src/cocos/3d/models/skinning-model.ts) `bindSkeleton` 对 `!bound || !target` 直接 continue。1/42 和最终剔除是端口报告，未独立复现。无权重关节的 null bound 可以合法，不能将 `_joints.length / skeleton.joints.length` 直接当绑定成功率。 | PG-18：按“实际受权重影响的关节”核对索引、路径、bindposes、属性长度和有限 bounds；错误分开报告。负例须能观察明确诊断，合法未使用关节不误报；bounds/joints 可视化复用现有开发工具。 |
| A2 祖先 scale 相消、yaw 替代镜像 | **机制描述过宽，待复现**：[skeletal-animation-utils.ts](../../src/cocos/animation/skeletal-animation-utils.ts) `getTransform/getWorldMatrix` 计算 skinningRoot 以下的关节 TRS；SkinningModel 将模型 transform 设为 skinningRoot，bounds 再应用 root 世界矩阵。SMR 节点和实际蒙皮根的变换语义不同，不能推出所有祖先 scale 均无效。180° yaw 是旋转，不是负缩放反射，不能标为等价镜像。 | PG-20：固定非对称模型，分别对 SMR 节点、skinningRoot、共同祖先施加正/负缩放；对照实时/烘焙、绕序/剔除、法线、bounds 和像素。定位后再决定修复或文档，保留端口 A/B 报告为线索。 |
| A3 bind 后首 tick 前关节未上传 | **部分成立，高优先级复现**：实时 SkinningModel.bindSkeleton 创建/清零 CPU 缓冲并收集 joints，关节数据上传在 `updateUBOs`；没有看到 bind 末尾立即计算/上传关节姿态。烘焙模型另有 default-pose texture 路径，不能将实时结论覆盖两模式。 | PG-19：暂停主循环，spawn 后在不推进动画时间的受控渲染中验证默认姿态可见；若需初始上传，使用当前骨骼局部姿态 × bindpose 的合同，而非直接把 bindpose 当最终骨矩阵。 |
| A4 默认 Baked 与隐式切换、force 不生效 | **部分成立**：[skinned-mesh-renderer.ts](../../src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts) 默认 `_modelType=BakedSkinningModel`；`_tryBindAnimation` 要求 skinningRoot 位于自身/祖先链，且只查该根上的 enabled SkeletalAnimation；不是“场上任意有无动画”。`setUseBakedAnimation` 为 internal，force 只绕过同模式早退并强制重建，未承诺阻止之后的生命周期切换。 | PG-19：验证赋值、onLoad/启用与动画关联顺序；明确请求模式/有效模式及观察入口，再评估稳定公开配置，保留自动关联兼容性。不把 internal force 当持久锁定模式。 |
| A5 addComponent 后赋 mesh 漏建 bounds | **该因果不获源码支持**：[mesh-renderer.ts](../../src/cocos/3d/framework/mesh-renderer.ts) mesh setter 已调用 `_updateModels`，其中按 mesh.struct 创建 bounds；禁用层级时会早退，需结合启用链判断。[model.ts](../../src/cocos/render-scene/scene/model.ts) `createBoundingShape` 缺 min/max 会返回。SkinningModel.updateTransform 确实依赖已有 model/world bounds。 | PG-19：复现 enabled/disabled、赋值排列、缺 min/max、模式重建与不同模型类型；找到真实漏建分支再修，不预设在 setter 重复调用 createBoundingShape。 |
| A6 skeleton.hash 缓存不失效 | **源码确认失效路径缺口**：Mesh 实例内 `_boneSpaceBounds` 按 skeleton.hash 缓存；`Mesh.reset` 更换 struct/data 并重置 mesh hash，却未清理该 Map；当前文件未找到其他清理路径。“永不失效”收窄为同一 Mesh 重建时存在陈旧缓存风险。 | PG-21：同一 mesh/skeleton 下先计算、再 reset 不同 positions/joints/weights，重算 bounds 应匹配新数据；评估 updateSubMesh/merge 及骨架修改，定义失效合同。 |
| A7 无手动骨骼驱动入口 | **使用/便利层缺口**：实时模式已有节点 TRS、骨矩阵计算与上传；手册已有 SkeletalAnimation、buildSkeletonTree/restoreBindPose。新增手动播放器便利 API 尚未发现，不能称基础驱动不可达。 | PG-22：先提供无 SkeletalAnimation 的实时骨骼配方，写清模式、根节点、TRS 写入和渲染更新顺序；必要 helper 再评估。不得创建平行骨骼系统。 |
| A8 关节超限自动切 texture | **源码确认自动分支**：SkinningModel.bindSkeleton 超过 `UBOSkinning.JOINT_UNIFORM_CAPACITY` 时启用实时关节纹理模式，未见提示；它是 UBO→texture 的同一实时蒙皮实现分支，不等于切到 Baked。 | PG-18/19：观察有效传输方式、关节数量、容量和设备能力；容量边界与 texture 上限需测试。合法自动选择提供 opt-in 信息，越过实际能力上限才诊断为错误。 |

### 8.2 B — 材质、Effect、Shader（5 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| B1 手写 Effect/反射、派生工具、编译日志 | **部分成立，已有工作重合**：`src/air/builtin/register.ts` 的 toGlsl3 是私有 builtin 转换，不是通用编译器；当前工作区已有 [effect-json.mjs](../../tools/build/effect-json.mjs) 声明式生成器，但仅支持受限 attributes/varyings、vec4/mat4 uniforms、sampler2D，不支持 macro/include 等。EffectAsset 与 Pass 按 enableEffectImport 分支注册/取布局，存在 legacy programLib 路径。VERT/FRAG 各自预处理，跨阶段宏不是自动共享合同。 | PG-23 归并 CB-10/07：先接入现有生成器，评估声明范围与跨阶段宏合同；GLSL 派生是否公开另评，不能简单导出 builtin 正则作为通用方案。编译错误已有输出，补结构化关联及工具验收。 |
| B2 自动 sampler binding 撞块，需 binding=2 | **部分成立，具体 matcap 待复现**：builtin `assignEffectBindings` 对缺 set 的 sampler 从 materialBinding=0 顺序分配，未在该分配循环避让 material blocks；现有生成器则按是否有 uniform block 偏移 sampler binding。不能把“2”当通用固定槽位，也不能将 builtin 转换问题归于全部引擎自动分配。 | PG-23：检查每个 set 的反射 binding、数量、descriptor 类型与 GLSL 一致性；双纹理+UBO+显式/自动分配正负例，冲突在注册前明确诊断并保持合法布局兼容。 |
| B3 new Material+builtin 名称抛 localSetLayout | **待复现**：Material 当前已在 renderer 未就绪时抛 `AIR_E_MATERIAL_NOT_READY`；localSetLayout 存在 legacy/effect-import 双路径，报告未给出初始化时点和实际 EffectAsset 注册状态。“只有现成材质可用”不能确认为当前限制。 | PG-23，联动 CB-07：固定 effectName/注册资产、初始化时点与候选包，比较 effectName、effectAsset 和现成材质，分别跑 MeshRenderer/SMR；定位后修复或记明确边界。 |
| B4 宏名不同、贴图白色、无文档 | **宏依赖属实，文档缺失表述需修正**：[custom-shaders.md](../../docs/manual/custom-shaders.md) 已写 builtin-unlit 的 USE_TEXTURE 与错误 USE_ALBEDO_MAP 的纯色表现；具体 billboard 裸纹理白色待复现，不能仅凭换 builtin-standard 恢复判定上传缺陷。 | PG-23/26：补 effect→宏→属性→sampler 速查与标准接入；用同一已验证纹理隔离宏、UV、色彩、反射和绑定因素；不重复 CB-10/16 已有工作。 |
| B5 setProperty 不存在 uniform 静默 no-op | **部分成立且找到日志屏蔽因素**：`Material.setProperty` 无任何 pass 写入成功时调用 warnID(16373)，不是完全无诊断；`createAirApp` 固定 DebugMode.ERROR 使 warnID 不输出。try/catch 不会捕获普通 warn。 | PG-18，联动 CB-02：明确未知属性、宏禁用属性和未就绪材质的诊断策略；默认与 opt-in 诊断模式均验收，不仅断言函数被调用。 |

### 8.3 C — 纹理（1 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| C1 HTML 上传固定不翻 Y，缺开关 | **源码确认默认约定，API 范围待评估**：[webgl2-swapchain.ts](../../src/cocos/gfx/webgl2/webgl2-swapchain.ts) 初始化 UNPACK_FLIP_Y_WEBGL=false；当前未发现面向业务的逐纹理 flipY 入口。默认约定本身不等于缺陷，全局 pixelStore 开关会影响后续上传且不能覆盖所有源类型。 | PG-24：文档化 Image/Canvas/ImageBitmap/typed-array 与 glTF 的源类型/UV 合同；若加开关须作用于单次上传并恢复状态。非对称图案像素验证，不改 glTF 已有绕序/UV 补偿。 |

### 8.4 D — Mesh 与几何（3 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| D1 无 introspection，只能 _struct | **使用合同需修正**：Mesh 已有公开 struct、data、readAttribute、readAttributeFormat；可读 data.byteLength 和 UV attribute，不必访问 `_struct`。不存在便捷 `.uvs/.dataLength` 与完全无自省不同。 | PG-26：给只读自省配方和缺 attribute 的 null 处理；调试摘要可复用 PG-14/18，不增加未经需要的平行 getter。 |
| D2 primitives.box 不是 Mesh | **原生类型合同**：primitives 返回 geometry，utils.createMesh 负责生成 Mesh；TypeScript 类型已区分，错误使用可因 JS/any 绕过检查。 | PG-26，归并 CB-19：速查写明 geometry→Mesh→renderer；增强诊断仅限有明确收益的边界，不改 primitives 返回类型。 |
| D3 无 createSkinnedMesh | **便利入口缺口，格式不能照单固定**：customAttributes/createMesh 与 glTF 已有构造链。builtin toGlsl3 明确将 u32vecN 转 vecN，并注记实时 WebGL2 joints 使用 RGBA32F；报告的 RGBA32UI 组合是否匹配 shader attribute 输入待验证。 | PG-22：先给合法 joints/weights、索引/归一化、bindposes/路径和 bounds 的构造配方；helper 输入验证复用 PG-18；整数/浮点属性兼容通过浏览器再承诺 API。 |

### 8.5 E — 相机与场景（4 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| E1 不设 camera.visibility 什么都不画 | **与当前默认值不符**：Camera 组件及底层 camera 均初始化为 CAMERA_DEFAULT_MASK，该 mask 包含 DEFAULT；[materials.md](../../docs/manual/materials.md) 已纠正历史默认值报告。UI_2D 等被排除层、显式错误 mask 仍可能不画。 | PG-18/26，联动 CB-07：报告 camera mask/node.layer/model.visibility 与剔除原因，验证合法默认场景及错层负例；不默认报“相机未设 visibility”。 |
| E2 无 Billboard 组件 | **源码存在，默认公开面缺口**：`src/cocos/particle/billboard.ts` 和 particle/index.ts 有 Billboard；当前默认 exports 配置与 `build/cocosair.module.d.ts` 未发现对应入口。源文件存在不证明默认 bundle 可用。 | PG-25：评估依赖闭包、默认或 opt-in 导出及 builtin 资产要求；先提供面向相机配方。任意节点朝向 helper 与专用 Billboard 渲染组件须区分，不默认引入完整 3D 粒子子图。 |
| E3 Euler 正 pitch 抬头 | **坐标/旋转使用合同**：需注明相机前向、坐标轴、角度单位、父变换与组合旋转；不能仅给脱离节点朝向的“正负 pitch”口诀。 | PG-26：标准朝向下抬头/俯视示例与 lookAt 配方，验证父变换情况；不改引擎旋转符号。 |
| E4 model.visible 不存在，实际 visibility | **原生 API 形状**：Model 的 visibility 是可见性标签；Node.layer、组件 enabled、Node.active 各有语义，visibility 不能直接当布尔 visible 的替身。 | PG-26：速查如何隐藏节点/renderer 与掩码剔除，保留签名，不为直觉差异默认增加别名。 |

### 8.6 F — 组件与初始化（3 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| F1 addComponent 不收实例 | **已有类型与运行时校验**：Node.addComponent 签名仅构造器/注册名；非函数参数抛 TypeError（3809），非 Component 类也拒绝。“运行时才错”限于未使用/绕过类型检查。 | PG-26：补 new/构造器/注册名示例和可读错误映射，沿用原生组件创建语义。 |
| F2 canvas 必须 #；physics/init；headless | **部分成立**：bootstrap 使用 document.querySelector，接受有效 CSS selector 或 HTMLCanvasElement，并非必须 #；自定义 ID 仍须在 import 前预绑定。physics 与 renderMode 在 game.init 前设置是当前合同；README/app.ts 已有说明，但需集中导航。 | PG-26：集中说明 import 前 DOM/预绑定→createAirApp 初始化选项→建场景/资源→run 的时序；无效 selector 与不匹配 canvas 分开，注明 HEADLESS 不验证像素。 |
| F3 screenToWorld 参数序容易反 | **已有文档，区分两个层级**：公开 Camera 组件为 screenToWorld(screenPos,out?)，底层 render-scene camera 为 screenToWorld(out,screenPos)；[cameras.md](../../docs/manual/cameras.md) 已注明。不能凭“常见引擎”改参数序。 | PG-26，归并 CB-19：汇总两层 API 与合法示例/坐标深度合同；复用既有往返断言。 |

### 8.7 G — 诊断与工程化（4 项）

| 报告项 | 判定与当前证据 | 纳入范围与验收方向 |
| --- | --- | --- |
| G1 WebGL 所有失败全静默、无诊断层 | **过度概括**：[webgl2-commands.ts](../../src/cocos/gfx/webgl2/webgl2-commands.ts) 编译失败已有 shader 名、阶段、带行号源码和 infoLog，链接失败已有 error/infoLog；`tools/debug/agent-session.ts` 已有 shader/link 错误观察。attribute、资源绑定、索引合法性与剔除原因的统一诊断仍不足；ERROR 模式会压制 warn。 | PG-18：复用 session/panel 与现有错误观察，补最早违规检查和按模型解释；错误产生、日志可见、工具捕获分别验收。不得在业务帧随意 getError 消耗错误队列；正常剔除仅 opt-in 观察。 |
| G2 只有 d.ts 签名、无语义文档 | **表述过宽，蒙皮合同仍需补**：已有 docs/manual 及源码中文/英文注释；当前报告涉及 bind/模式/首帧/bounds/cache 的跨函数语义尚缺集中指导。 | PG-19/20/21/22/26：输出生命周期和状态合同、官方最小配方、源码符号引用；不要求业务依赖读取编译 bundle。文档须绑定已验证行为。 |
| G3 并行重建漂移、无版本或锁定 | **漂移为端口报告，版本不存在不成立**：package.json/AIR_VERSION 已存在，仓库已有候选指纹/证据纪律；同版本可对应脏工作区和多次构建，因此版本号不足以锁运行字节。未证实本次究竟何时、由谁、以何种输入重建 PAL。 | PG-27：固定本次消费的 bundle/d.ts/decoder 或 tarball 哈希、构建配置与源码差异；采用独立输出目录/包副本并在前后检查指纹，区分 dev 自动重建。不得通过自动修改版本号解决漂移。 |
| G4 隐式合同分散、缺坑清单 | **集中检索与知识缺口成立**：部分宏/坐标/初始化已经有手册，但跨子系统速查不足；端口 INTEGRATION-NOTES 尚不可见，需作为报告来源而非已审阅资料。 | PG-26 与 CB-02/07/10/19 共用速查：症状→检查→合同→合法代码→验证链接。scale/cache 等待复现结论前标待验证，避免把端口绕行发布为通用建议。 |

## 9. 新增待办、交付与执行依赖（暂不执行）

以下是评估后的计划，不是授权或完成声明。与 CB 线重合者复用其实现和证据，PG 条目负责本次端口负例与缺口闭合，不在两处重复实现。

| ID | 优先级 | 任务与来源 | 计划交付 | 完成判据 |
| --- | --- | --- | --- | --- |
| PG-18 | P0 | 诊断可见性与渲染失败最早边界（A1/A8/B5/E1/G1） | 先评估 AIR 日志级别/opt-in 诊断配置；复用 CB-02/07 的错误纪律、session/panel；增加加权 joints/绑定路径/有限 bounds/反射资源验证与只读原因摘要 | 错误用例可观察且被工具采集，包含资源/节点/属性/期望值/修正姿势；默认与诊断模式分别验证；合法无权重关节、自动 texture 和正常剔除不误报；日志按资源/状态去重 |
| PG-19 | P0 复现 | 蒙皮模式、首次上传和 bounds 生命周期（A3/A4/A5/A8/G2） | 顺序矩阵复现；明确有效模型/上传模式、首次渲染与启用合同；只修确认缺陷，公开模式 API 另评 | 实时/烘焙 × 有无动画 × enabled/disabled × mesh/skeleton/root 赋值顺序；暂停 spawn 不推进动画也能正确受控渲染；bounds 有限且与姿态一致；现有动画路径不回归 |
| PG-20 | P1 复现 | 蒙皮变换与镜像合同（A2/G2） | 非对称模型 A/B，定位节点/root/祖先及正负缩放行为；文档或确认缺陷修复 | 顶点/矩阵与像素、bounds、剔除、法线证据对应；实时/烘焙均覆盖；明确 yaw 与镜像差异，不仅以“截图相同”推断数学根因 |
| PG-21 | P0 | 骨骼 bounds 缓存失效（A6/G2） | 定义 mesh reset/数据更新/骨架修改失效合同，增量修复并登记上游差异 | 同实例旧缓存→数据重建→新 bounds 的有辨识度单测；同数据复用仍有效；相关渲染/剔除浏览器回归 |
| PG-22 | P1 | 手动骨骼驱动与蒙皮网格配方（A7/D3/G2） | 原生节点 TRS 驱动配方、joints/weights 布局与构造示例；createSkinnedMesh 等薄 helper 先评估 | 无 SkeletalAnimation 的实时骨骼示例可控、可见；格式/长度/索引/weights/bindposes/path/bounds 可校验；默认导出和消费者类型一致，非法输入不污染原状态 |
| PG-23 | P1；确认绑定冲突则升 P0 | Effect 注册/反射/双纹理布局与宏合同（B1…B4） | 复用 CB-10 生成器、CB-07 注册时序；对 matcap/localSetLayout/宏问题做固定候选复现；补 binding 验证及合同 | 双贴图+UBO 两阶段正确采样；重复/不匹配 binding 明确报告；初始化后 new Material 的 effectName/effectAsset 路径、SMR 与 MeshRenderer 可比较；负 shader 编译/链接被现有工具捕获 |
| PG-24 | P2 评估 | 纹理方向合同与 opt-in 翻转（C1） | 各上传源类型与 UV 约定文档；仅必要时设计逐上传翻转入口，联动 CB-16 色彩合同 | 非对称图样、源类型与不同 UV 的像素断言；连续交错上传无全局状态泄漏；glTF 原有行为不回归 |
| PG-25 | P2 决策 | Billboard 默认可达性与朝向配方（E2） | 评估源码组件导出闭包、builtin 资源、默认/opt-in 范围；提供节点朝向配方 | 如批准导出，bundle/d.ts/独立消费者与浏览器均可用；移动相机行为正确，不隐式拉入不需要的粒子子图；不批准则如实记录配方边界 |
| PG-26 | P1 | 复刻集成合同与静默陷阱速查（B4/D1/D2/E1/E3/E4/F1…F3/G2/G4） | 共用 CB 线速查页，链接现有手册；集中 import/init、geometry/Mesh、公开/底层相机、掩码、effect 宏与蒙皮合同 | 28 项报告均有判定和去向；新增代码示例与源码/行为证据一致；已有能力不再写成不存在，待复现项不写成事实或通用绕行 |
| PG-27 | P0 执行前置 | 消费字节锁定与并发构建隔离（G3） | 源码/配置/产物指纹记录、独立输出或 tarball 消费配方、前后漂移检查；复用现有候选纪律 | 能区分相同版本不同构建，运行前后哈希一致；变更则终止结论并记漂移；记录 AIR_FEATURES/AIR_OUT_DIR、实际加载 URL 与文件；不改版本号、不覆写历史证据 |

**顺序更新**：新增条目已纳入 §12 的统一依赖顺序。本节仅定义交付与验收，不再维护第二套波次；PG-26 随每批已验证结论增量更新，不能先写尚未成立的“坑”。

**验收分层**：数据与模式状态断言、实际浏览器像素/剔除/首帧、默认日志与 opt-in 诊断可见性、工具采集、bundle/d.ts/独立消费者、手册引用与源码一致性分别记录。每项仅跑影响范围内的验证；新增 renderer/Effect/蒙皮修改触及抽取件时，按 §0 登记上游差异。所有输出绑定本次源/构建指纹，端口未提供资产或截图时保留待复现状态。

## 10. 30 项目计划合并与当前状态刷新

### 10.1 当前基线和既有交付（只读复核，非本轮重跑）

| 项目 | 本轮读取结果 | 使用边界 |
| --- | --- | --- |
| HEAD | `cf2a54f2601e5a13f2a5feaccac97a0f5eac98bf` | 工作区仍有暂存/未跟踪计划等内容，HEAD 不能独自代表全部材料 |
| runtime SHA256 | `006ae858d4e75dcb4c716afccd2eedcbefe81300304cb0cfca9d1fffa918c03e` | 本轮从 build/cocosair.module.js 计算；不同于外部冻结包 cb081fc… |
| min SHA256 | `9406d17b66bb5909e3d803dc71474cac363eb3a8f45bc2cfc54ddab4588ec8af` | 本轮读取字节，不代表重建或 min 浏览器验证 |
| d.ts SHA256 | `21eef2e8d7107f306b3d4d61c31f9a79610e4e8209c9b9ee3e9a0dbbba3872e8` | 本轮读取字节；执行时与源和 runtime 一并绑定 |
| 正式示例报告 | [examples-verified.json](../../docs/evidence/examples-verified.json)：154/154、completed=true、partial=false、candidateFingerprint=`ba485e1b91643c46` | 现存报告范围，未在本轮重跑；不覆盖新输入/生命周期 helper 或外部 30 项目 |
| 浏览器矩阵 | [browser-matrix.json](../../docs/evidence/browser-matrix/browser-matrix.json)：78/78、completed=true、subset=false，bundle 短哈希 `006ae858d4e75dcb` 与当前字节相符 | scope 由合同定义，非所有引擎能力认证；新增范围须另采 |
| API 覆盖 | [api-coverage-report.json](../../docs/api-coverage-report.json)：同 candidate、staleEvidenceExamples=[] | 只读取报告，未重新计算当前 source/contract/reader 全链一致性 |
| CB 已交付重合范围 | [CB 台账](../ledgers/competitive-benchmark-remediation.md) 记录 CB-02/03 的数值与输入异常防御、CB-07 注册时序、CB-09 输入传播/Orbit、CB-10 受限 effect 生成器、CB-11/20 批处理/实例化、CB-16 纹理色彩、CB-19 长尾签名已交付及各自验收范围 | 本轮对应源码/工具可见，台账结果为既有记录；PG-18/23/26/32/33/34 必须做增量缺口而非重写同项 |
| CB 残余 | 台账仍记录 CB-06 后处理路线待决、CB-21 成本复测未完整完成 | 保持独立决策/计量，不借本计划合并宣布完成；NP05 使用其实际支持边界 |

冻结快照供本次文档判断使用，未来执行首先重算 PG-27。新增源变更后，相同版本号和历史报告不能替代新候选证据。这里不改变 package 版本，也不把历史外部 SOURCE_CHECKED/USER_CONFIRMED 转成本仓浏览器结果。

### 10.2 来源计划的刷新结论

1. **两处文档主题仍有效，但位置与修复范围需更新**：`tips.md:25,143–144` 仍写键盘与聚焦无关；`game.md:27,209` 仍泛称 window 级。当前 `input-and-events.md:97–98` 已明确 Web DOM 立即派发，原 E-DOC-02 的“52–53 后续帧”引证已过时；但该页表格仍写“前提无”，嵌入示例 `:433` 仍有“按帧 flush”旧注释。归 PG-07/26，对整个受影响教程与对应示例做一致性修正，不再宣称整页未修。
2. **输入动作层仍属新增便利能力**：KEY_PRESSING 来自 browser repeat，非 fixed tick held；SHIFT_RIGHT=2000 保持原生键码。未发现 createInputActions 公开 helper。SceneStack 当前在 canvas 捕获期屏蔽有限事件列表，不能屏蔽先执行的 window capture，也不是多源动作所有权。PG-28 补 active-session gating，不全局去掉 PAL stop/prevent。
3. **启动/生命周期不是完全空白**：已有 custom canvas 预绑定、tabIndex、contextHealth、SceneStack/glTF 局部 dispose。AirApp 当前仍只有 run/getScene/contextHealth，没有进程级同 canvas 并发初始化合同、releaseScene/close 或安全 bootstrap 子路径；这些是 PG-29/30 的拟新增或待决范围，不能据接口缺失直接称泄漏。
4. **DPR 已有低层配置**：bootstrap 与 PAL 都读取 `__CCDPR_CAP__`，默认 2；未发现 public pixelRatioCap。PG-35 将密度与 PG-08 设计分辨率分开，优先在无 eager import 的安全入口设置配置，并保留旧读取合同。首帧/resize 精度仍需真实环境验收。
5. **保留原生签名与导出兼容**：Scene.addComponent 明确抛错，Node.addChild:void、primitive 参数差异均是已有合同；AirAppImpl 仍由 `export * from './app'` 公开，与“内部不暴露”的注释冲突。PG-31 先做 AST/类型负例、公开稳定性表与可选 descriptor helper，不改变旧返回值或删已发布名字。
6. **资源取消分层仍需落实**：glTF loader 有 signal 检查，但 `context.ts:61` 的子资源请求为 `fetch(url)`，未传 signal。可以确认这一子请求不是传输级取消；不能据此判全部加载无取消，也不能以类型有 signal 宣称全链网络终止。PG-32 区分网络 abort、订阅取消、迟到完成和共享所有权。
7. **外部材料不可达**：合并时来源计划含270个相对链接，按当时 ai/plans 位置检查均不可达，原注释也明确基于另一交付目录；来源计划本身当前也未随本仓提交。本统一计划保留主题映射和评估，原140条 findings/项目索引及30项目 commit、模型/命令数、用户确认与原日志仍待外部材料核验，不声称本仓持有完整原始证据。缺材料只阻断相应追溯/AG1/AG2，不能阻断本仓独立 EG 工作。
8. **原“0 个新增运行时缺陷”限定于外部审计**：保留其应用问题归因，不扩展成当前全部 PG 没有缺陷；PG-21 等源码风险依旧待最小重现。原强制新 worktree/全量命令清单为来源建议，本轮不创建工作树或执行；未来按授权环境选择隔离目录并保护共享产物，不借合并获得操作许可。

### 10.3 WP00…WP10 去重映射（11 包完整保留）

| 来源工作包 | 统一任务落点 | 增量交付与去重边界 |
| --- | --- | --- |
| WP00 证据账本/环境入口 | PG-27、PG-34 | 复用已有候选/证据 schema，增加证据层级与外部来源追溯，不重造全套流水线 |
| WP01 键盘传播/焦点 | PG-07、PG-10、PG-26、PG-28 | 修尚存文档矛盾；CB-09 传播合同已交付；真实键盘/编辑控件/释放补测 |
| WP02 动作状态所有权 | PG-28 | 可选 reducer+原生/受控 DOM 二选一适配器、源集合、edge 固定 tick 消费 |
| WP03 坐标/密度/渲染约定 | PG-08、PG-20、PG-26、PG-35 | 坐标/投影和公共 DPR 增量；相机默认/照明沿用 CB-07/12；不把 yaw 当反射 |
| WP04 启动/单例状态 | PG-29 | 安全加载子路径和同 canvas 并发状态，先审冻结签名，不改变主入口 eager import 合同 |
| WP05 会话/资源所有权 | PG-13、PG-28、PG-30、PG-32 | 会话 scope、延迟销毁、迟到资源与 bounded release；局部 dispose 复用已有实现 |
| WP06 签名/类型/导出 | PG-17、PG-26、PG-31、PG-34 | CB-19 长尾已交付；增量 Scene/void 误用检测、descriptor 与稳定性边界、npm 类型对齐 |
| WP07 错误/输入观测 | PG-14、PG-18、PG-26、PG-28 | 复用 session/panel/现有错误码，输入 ownership inspector 保持可选且不入默认包 |
| WP08 六组合配方 | PG-12、PG-22、PG-33 | 复用 starter/Orbit/批处理/音频示例，补六类组合闭环，不迁入应用领域规则 |
| WP09 依赖/原生能力定向验证 | PG-01/02/03/04/05/06、PG-24/25、PG-32/34 | 资产入口与取消增量，十个固定能力 ID 映射已有证据，外部后端条件如实保留 |
| WP10 实际引擎/消费者门禁 | PG-15、PG-27、PG-34 | EG/AG/AIG 分离；现有矩阵与包消费者复用，30 旧消费者外部集另列，不冒充本仓验收 |

来源 E-01…E-14、E-DOC-01/02 的主题均通过以上 WP 映射保留；140条历史索引和R3/30项目逐项材料属于外部来源，当前本仓未持有该来源计划及原始材料，未读到材料前不重编号或升级证据级别。

## 11. 新增 PG-28…35 的执行合同

所有拟名仅为设计输入，最终命名、导出、兼容性与 ownership 在 S0 冻结。新增公共 helper 复用原生 Cocos 类型；不用大框架替换 Node/Scene/input/assets。

| ID | 优先级 | 新增任务/来源 | 交付与关键验收 | 前置依赖 |
| --- | --- | --- | --- | --- |
| PG-28 | P1 | 可选输入动作状态与源所有权（WP01/02/07） | continuous/press、held/pressed/released/axis；原生与受控 DOM 二选一、纯 reducer；键码/别名/多指 source 集合 OR；fixed tick edge 一次消费、零 tick 快按不丢；session gating 与 reset；真实浏览器+生产 reducer 正负例 | PG-27；PG-07/10 合同；PG-30 ownership ADR，不必等其实现 |
| PG-29 | P1 | 安全加载与单例初始化（WP04） | 拟 `cocosair.js/bootstrap` 无 eager engine import 子路径；canvas/config 校验→动态加载同一 runtime；同 canvas/config 共享 init/app，冲突明确拒绝；失败有界回滚或要求 reload；unmin/min/npm 实际启动像素 | PG-27；PG-18 错误码；PG-30 closed/reentry、PG-35 配置 ADR；PG-31 导出纪律 |
| PG-30 | P1 | 会话清理 scope 与释放合同（WP05） | ownership 表、幂等清理回调、共享资产、session generation；拟 releaseScene/close 范围与 Promise receipt；暂停/未 run/context lost 时不用无限等待 AFTER_DRAW；run/release 竞态明确拒绝；100 次切换与 10 分钟稳定数据，内存不可用如实记录 | PG-27；PG-29 状态 ADR；PG-32 取消合同；PG-28 reset hook；PG-13 现有切换评估 |
| PG-31 | P1 | 签名防误用、primitive descriptor 与稳定性清单（WP06） | JS/TS AST+实际类型负例捕获 Scene.addComponent、addChild 返回值、错误 primitive；拟 createPrimitiveGeometry discriminated union 薄转发 box/sphere/cylinder/cone；有限值/范围；四类旧/新 geometry 数据等价；AirAppImpl 等已发布名字不静默删 | PG-27；PG-26 合同；新 API 合并后由 PG-34 核 npm/类型 |
| PG-32 | P1 | 资源取消/迟到所有权与能力分层（WP09） | exported/bundled/configured/verified 独立字段；signal 到具体请求的核对和承诺修正；取消一个订阅不误杀共享者、迟到不挂死 scene；URL/MIME/CORS/CSP/404/decoder 配置诊断；十类原生场景映射见 §13 | PG-27；PG-30 ownership ADR；PG-18 diagnostics；PG-06 加载选项合同 |
| PG-33 | P1 | 六类组合配方与 Agent 接入负例（WP08） | JS/TS 最小3D、输入+HUD+fixed step、FPS/pointer lock、chase/vehicle/flight 坐标、共享资产/池/子树替换、可选音频/存储/加载；每类正常/暂停/restart/cleanup+至少两负例； npm 与文档同源；业务规则留应用 | 随 PG-28/29/30/31/32/35 成熟增量交付；不等待全包再写 |
| PG-34 | P1 收口 | 证据分层、实际引擎门禁与外部消费者兼容（WP00/10） | 增量 schema、EG0…5/AG1/AG2/AIG 独立报告；运行指纹/用例/退出码/skip/环境/原始输出；真实输入不与合成等同；现有工具按影响范围复用；30 消费者仅在材料可访问时实际兼容回归 | S0 schema/预检先行；最终依赖所有纳入交付任务的合并候选 |
| PG-35 | P1 | 坐标/控制模式与公共渲染密度（WP03） | Y-up、相机 -Z、Euler度与 world basis/projected direction；screen/vehicle/world-relative 明确；拟 pixelRatioCap 有限正数默认2，import 前配置、首帧/resize同源；保留 __CCDPR_CAP__ 兼容；不改 body/CSS | PG-27；PG-29 安全入口 ADR；PG-08 resolution 合同；PG-26 坐标文档 |

### 11.1 输入所有权必须保留的细节

source 至少携带 backend、physical code 或 KeyCode、pointerId；释放 A 不清 ArrowLeft，释放一个触点不清键盘或另一触点。press 仅 inactive→active 产生一次，repeat 不重新武装。pending edge 保留顺序，单个渲染帧 0/1/多次业务 tick 均不丢失或重放；业务 accumulator 与 createStepClock 测试时钟分开，禁止双时钟。

Start/Resume 的明确操作可请求焦点，普通 HUD 不清 held；editable 内 keydown 不产生动作，已持有 source 的 keyup 仍能释放。blur/hidden/pause/restart/session deactivate/dispose 各自 reset reason。window capture 先于 canvas 屏蔽，action 准入依赖 active-session token；自定义 canvas 显式传 SceneStack。100 次 reset/restart 监听器回基准，100 个 repeat 只产生首次 press，真实三浏览器输入序列另验。

输入 inspector 复用 tools/debug：默认禁用、最多80条、快照最多2Hz；只记录活跃游戏的枚举动作和显式只读状态 hook，不收集 editable 文本/密码、不记录全页面按键、不持久化或发网络。诊断开关不得改变动作计数、时钟或资源所有权。

### 11.2 启动与释放先审合同，避免循环等待

PG-29 与 PG-30 共用 `idle/initializing/ready/failed/closed` 状态及唯一 canvas 身份；PG-35 与 PG-08 共用规范化配置相等/冲突规则。先联合冻结合同，再分别实现，不要求“29 全完成才开始30、30全完成才开始29”。失效 GL 不为 cleanup 恢复；CPU 延迟销毁的处理方式须审计，拟默认5秒内完成或返回带 pending 项的清理失败，不能超时算完成。

releaseScene 成功后 getScene 应为空；保留哪些 runtime/cache 由 receipt 明列。释放中 run 稳定拒绝，重复释放共享在途 Promise；close 是否交付、关闭后能否同文档重建必须明确决策，未经完整底层重建验证只承诺 reload。Node/Scene 销毁不等于最后资产所有者释放，更不等于 GPU 无泄漏。

## 12. 唯一任务执行顺序（S0…S6，覆盖 PG-01…35）

排序规则：先锁身份/合同和观测，再复现或消除静默错误，再建立启动/输入/释放共享基础，之后资产与配方，最后同候选整合。文档与环境预检穿插进行，不因 P1/P2 无限后置；P0 是风险标签，不要求串行做完所有 P0 才推进无依赖任务。决策或外部材料缺失仅阻断对应分支。

| 阶段 | 任务和具体顺序 | 出口及后续条件 |
| --- | --- | --- |
| S0 身份、证据与共同合同 | **PG-27 → PG-34 的 schema/环境预检**；记录现有 CB 交付差分；联合冻结 PG-06/08/18/28/29/30/31/32/35 的加载选项、错误码、模式/ownership、配置和公共签名 | 同候选可定位、接口无冲突、环境阻塞独立记录；外部30项目未到不阻断本仓工作；本阶段不要求所有设计实现完成 |
| S1 快速知识修正与现有通道验证 | **PG-07 → PG-10/09 → PG-14**；PG-26 修残余焦点/时序/已有能力误述，PG-31 公共签名清单/类型负例起步，PG-13 比较现有 app.run/栈/reload；**PG-04、PG-25 提前出备忘录** | 先证明已有能力如何接入；不重造 touch/场景树，不默认改相机 mask。Spine/Billboard 未批实现保持决策待办，不卡其他阶段 |
| S2 渲染正确性与可诊断化 | **PG-18 日志可见/违规边界 → PG-19 最小生命周期复现 → PG-21 缓存失效修复**；接着 PG-20 scale/镜像、PG-23 注册/binding 增量复现。只对确认根因实施；PG-26 同步结论 | 正负例、模式/bounds/首帧/资源绑定均有可解释结果；复用 CB-02/07/10，未复现项交调查而非假修复；重建受影响候选后才能采图 |
| S3 启动、输入与释放共享基础 | **PG-29 安全入口/单例 → PG-35 DPR 与 PG-08 resolution 接线验证**；**PG-28 reducer/适配器 → PG-30 cleanup/session 集成**；PG-32 取消/迟到资源合同与实现同批协调；PG-15 在现有真实派发链上提供测试入口 | 同 canvas 并发、焦点/edge/source 所有权、run/release、暂停/丢上下文释放有界；PG-29/30 依赖已冻结 ADR，不相互等待全部完成 |
| S4 资产闸门和原生薄 helper | **PG-06 加载选项/所有权 → PG-01 atlas → PG-02 font**；PG-03 raw/type/瓦片查询可独立推进；PG-05 音频接口；PG-22 手动骨骼/网格；PG-31 descriptor helper、PG-17 消费声明 | 纹理/帧/字形与资产引用配套；类型/导出/安装消费同时验证；PG-04 若批转换器在本阶段按实际范围实施，未批只保留备忘录 |
| S5 表现层、组合配方和覆盖补齐 | **PG-03 → PG-12 平台配方**；PG-04 决议 → PG-11 UI mesh 是否仍需要；PG-24 方向合同/必要开关、PG-25 批准出口；PG-16 culling 文档；PG-33 六配方；PG-32 十能力参考映射；PG-26 全表知识收口 | 各配方真实候选与 npm 可运行；原生/DOM/业务能力分开。PG-11/24/25 未批新增设计按明确替代范围验收，不能默默删除主题 |
| S6 同候选整合与最终验收 | **PG-27 再冻结 → PG-34 受影响 EG/AG/AIG → PG-26/33 文档源码一致性 → 最终 release 聚合**；任何源修改使相关下游证据重新待采 | 同批 unmin/min/d.ts/npm 与运行证据一致，既有PASS、新PASS、未测/失败/阻塞分列；clean worktree 的 release 前置通过后才可称READY；提交/发布仍需另有授权 |

**实际可独立推进的边界**：S1 文档与已有通道验证不依赖新 helper；PG-03 不依赖图集/字体；PG-05 不依赖 Spine 决策；S2 的缓存与格式校验可独立，采图共享产物必须统一；S3 设计合同、PG-32 取消和 PG-30 迟到处理需要共同审查。公共 app/bootstrap/index、PAL 生成转换、package/types/正式报告只由统一集成流程写入，不多处同时改同一个产物。来源计划的并行角色仅作未来组织建议，本轮不派发实施。

**决策/材料出口**：PG-04/10/11/25 的设计分支、PG-29/30 新公开入口与close范围，采用具体方案+正负例+兼容影响供决策。外部30项目不可访问时，PG-34 的 AG1/AG2 保持待材料，EG和独立配方继续；不得以来源的用户确认代替该分支验收。无需为了建立隔离开发环境自动修改版本号、迁移旧消费者或发布。

## 13. 合并后的验收、证据与完成定义

### 13.1 Gate 与证据分层

| Gate | 必需证明 | 不证明的范围 |
| --- | --- | --- |
| EG0 身份 | HEAD/source/config/unmin/min/d.ts/npm/decoder/test-contract 指纹与实际加载字节一致 | 运行正确性 |
| EG1 原生合同 | 实际包 import、类型正负例、真实引擎 headless、生命周期/签名断言 | 可信输入与GPU像素 |
| EG2 输入平台 | 真实浏览器键鼠/焦点/触摸或明确模拟级别、ownership/edge/释放与计数 | 完整游戏体验 |
| EG3 图形配置 | WebGL2 状态+像素+shader/log、首帧/resize/蒙皮/材质参考 | 全 API 或全部设备 |
| EG4 生命周期部署 | shared ownership、bounded release、迟到/cancel、重入边界、离线包/URL/CSP和实际资源数据 | 所有设备永久无泄漏 |
| EG5 聚合 | 当前完整必需scope与clean candidate的release结果，所有失败/待测披露 | 发布、部署或远端修改授权 |
| AG1 旧消费者兼容 | 外部30项目逐项启动/控制/暂停/restart/resize，代表场景深入验证 | 每个游戏已通关/完整视觉音频验收 |
| AG2 应用完整验收 | 每项目自然 progression/结果、关键视觉音频触摸与设备/日期 | 引擎全API认证 |
| AIG 接入质量 | 六配方、JS/TS负例、schema/追溯、无虚构API和证据越权 | GPU已经通过 |

证据类型保留 SOURCE_CHECKED、MODEL_PASS、CONTRACT_DOUBLE_PASS、ENGINE_HEADLESS_PASS、BROWSER_INPUT_PASS、BROWSER_RENDER_PASS、GPU_MEASURED、USER_CONFIRMED；执行状态另记 PASS/FAIL/NOT_RUN/BLOCKED/NOT_APPLICABLE，configured 可单独为 NOT_CONFIGURED。这些维度不能靠排序继承；用户确认不自动升级任一仪器化 gate。

每份新报告至少记录 candidate/source/contract/runner/browser/application 指纹（适用者）、命令/cwd/起止/exit、真实用例数与skip、scope/subset/completed、测量/模拟方式、stdout/stderr/截图原路径及不可用测量。基础设施、应用、引擎、资源/部署失败按stage分开，旧PASS不能覆盖当轮失败。没有外部材料时保留来源索引和缺口，不生成“140条已追溯”或“30项目兼容PASS”。

### 13.2 十类原生参考场景（复用，非全部重建）

| ID | 参考范围 | 当前复用入口与新增责任 |
| --- | --- | --- |
| NP01 | 纹理加载/颜色/方向 | CB-16 已有纹理证据；PG-24/32 补源类型、加载与配置分层 |
| NP02 | 标准材质/灯光/阴影 | CB-05/12/15 已有范围；PG-18/23/35 补错误布局、诊断与配置 |
| NP03 | clip/骨骼 | CB-13/动画示例；PG-19/20/21/22 补手动驱动、首帧、bounds与缓存 |
| NP04 | 当前原生2D粒子 | particle-2d-basic 现有矩阵；PG-32 绑定配置与当前证据，3D粒子不扩范围 |
| NP05 | 后处理 | CB-06 路线待决；按批准原生/明确Recipe边界记录，impostor不算原生post |
| NP06 | builtin碰撞 | physics示例和现有合同；PG-32 明确碰撞不等于刚体模拟 |
| NP07 | Cannon刚体 | physics-3d相关现有示例；PG-29/32 验证初始化选项和依赖，默认不变 |
| NP08 | AudioSource/AudioService | audio-basic/CB已有范围；PG-05/33补stop/volume/手势/播放头与可选音频不阻Start |
| NP09 | glTF/资源生命周期 | 现有tarball/glTF消费者；PG-30/32补shared/cancel/迟到/无绘制帧释放 |
| NP10 | 实例化 | CB-11/20真实draw记录；PG-33/34同候选观察，节点数或宏存在不替代draw计数 |

### 13.3 命令与报告刷新顺序

本节是未来执行指引，本轮未运行。先检查实际 package.json/工具参数和写行为；不照抄来源计划全量命令，尤其不为文档编辑运行证据生成器。

1. S0 读身份、依赖/工具与浏览器环境；需要隔离工作区时按授权建/复用，只有环境缺依赖才安装。PAL修改先生成转换→`--write`→`--check`，抽取件改动同步映射。
2. 每次代码批先做相关生产代码/负例/类型验证；依赖运行产物的测试先构建其当前scope。公共API批统一build/dts/min/npm，针对性consumer/exports/license检查；不能用旧build测试新src。
3. 冻结当前候选后，按影响范围采输入/图形/生命周期及tarball证据；变更示例/声明后刷新相关Gallery/API inventory，实际采完再聚合coverage/example-chain。写报告脚本由统一集成流程运行，不能在不同候选之间交叉覆写。
4. 文档同步源码片段并过内容/引用/必要格式；正式证据与候选一致后再运行需要的全量整合门禁。`verify:test-inventory` 自身会跑Jest，已有同候选结果时不机械重复；`verify:perf-lifecycle` 先满足静态Gallery前置；脚本exit0但跳过核心范围不能算PASS。
5. 最终`verify:release`需要clean worktree，本轮只修改文档且未授权提交，不执行该门禁；未来也不为满足clean要求自动暂存/提交他人改动。READY不等于获准发布。

helper 性能仅在有性能相关变更时同硬件/浏览器固定场景对照，沿用来源的至少3轮×60秒median/p95采样；持续p95恶化超过5%须定位或明确证据例外，不能用合成帧率宣称真实收益。PG-30重复生命周期按其100次/10分钟合同；测量API不可用保留unavailable，不用替身推断GPU。

### 13.4 统一完成定义

35 项每项都有来源、去重落点、设计/范围决议、正负例和实际候选验收或明确未完成状态；WP00…10不遗漏主题，但不强迫按拟名新增API。既有CB范围复用有身份/scope说明，新PG范围单独证明。PG-26速查、配方源代码、d.ts/exports与证据一致，无静默删除历史失败或未测项。

引擎范围完成要求其必需EG与AIG通过；本计划同时要求的AG1若缺材料或未测，整体仍有待决项，不能称全部完成。AG2独立披露，只有逐项目完整通过才称30应用完整验收；不把它隐藏进单个Engine PASS。Spine/Post/Billboard等设计分支有批准的替代范围才能收口，不以“之后再做”删除缺口。整个计划不构成全API/GPU认证，不含版本更改、提交推送、发布部署或重打包外部30项目。

## 附录 A：端口缺口原始清单（2026-10-03 owner 提交，保留原引证）

以下为 owner 报告原文要点，保留原始断言用于追溯，不作为当前仓库事实或实施合同。端口侧文件行号均为端口工程内引证，本仓不可见；其中⑩⑪⑫⑬⑯等关于能力不存在的断言已在正文修正，执行以 §2…§5 的核实口径为准。

**A. 阻塞级：只能自己实现**

1. Spine 只有 3.8/4.2（`src/cocos/spine/lib/spine-instantiate-3.8.ts`、`4.2.ts`），APK 是 Spine 2.1.27 JSON（skin/mesh/skinnedmesh 结构不同）⇒ 自写播放器 `src/runtime/spine21.ts`（~900 行，region+mesh、setup 包围盒脚底对齐、delay=0 混帧语义）。建议：加 2.x 兼容解析层，或至少把 Skeleton 的实例化入口做成可插版本。
2. 没有 libGDX 文本图集（.atlas/.pack）运行时解析：`src/air/assets` 只有 gltf。旋转 region、orig/offset 留白、多页都要自己处理 ⇒ `src/runtime/atlas.ts` 自解析 + 逐 region 烘焙 canvas（SpriteFrame 其实有 rect/rotated/originalSize/offset，缺的只是解析入口和一个"按 rect 切帧"的公开工厂）。
3. BMFont 没有运行时入口：`.fnt` 在 `asset-manager/factory.ts:125` 只造 TextAsset，fntConfig 由编辑器导入生成，AIR 无公开 parseFnt(text) → BitmapFont；原作三套字号（0.8/1.0/1.2）与 libGDX batch.draw 的左下原点也无处配置 ⇒ 自写 `src/runtime/font.ts`（逐字裁剪缓存）。
4. TiledMap 只够画，不够玩：`tiled-object-group.ts:221` 把 object.x/y 就地改成等距坐标、原值只留在 object.offset，对象层属性/类型也没有面向玩法的稳定读法；`level.ts:4-6` 因此独立解一份 TMX（含自闭合空层，见 `level.ts:106`）。建议：暴露 rawXY/getObjectsByType()，并给"用瓦片做碰撞查询"的官方读法。
5. UI 空间没有贴图三角形：GeometryRenderer 顶点只有 position/normal/color，没有 UV（`src/cocos/rendering/geometry-renderer.ts:299-375`），也没有 UI 批内的自定义 mesh 口子 ⇒ mesh attachment 只能按骨骼分组烘焙成位图换兼容性（`spine21.ts:858-862`）。
6. 缺平台跳跃配方：2D Box2D 后端和确定性定步其实有（`docs/manual/physics-2d-and-3d.md:15,84`），但没有"瓦片碰撞 + 单向平台（onewayplatform，`level.ts:144,176`）+ 定步与渲染解耦"的样例 ⇒ 本端口自写 AABB 求解器 `actor.ts`，代价是手工复刻原作 Box2D 语义（µ=0.2 摩擦、无 linearDamping、松键只靠地面摩擦减速，`game.ts:40,1728`）。

**B. 有绕法，但绕得不干净**

7. AudioService 缺 stopBgm() 和音量接口：公开面只有 playBgm/pauseBgm/resumeBgm/playSfx/setMusicEnabled/bgmState。原作死亡要"停并归零"（Music.stop），而 playBgm 走"保留 currentTime 续播"合同 ⇒ 只能按内部节点名 AudioService/BGM/ 取 AudioSource 再 stop()+currentTime=0（`audio.ts:88,141`）。建议：stopBgm()、setMusicVolume(v)、setBgmVolume(id,v)，别把节点名当隐式契约。
8. UI 相机没有 orthoWidth：正交宽 = 高 × 窗口纵横比，只有窗口恰好 5:4 才自洽；978×846 实测只露出设计 x∈[122,677]，HUD 与按钮整片被裁到不可点 ⇒ `stage.ts` 自建"设计分辨率=窗口 + 非等比虚拟舞台"，再加 uiToDesign() 换算触点。建议：给 UI 相机一个显式设计视口 API。（核实注：机制已在包内未接线，见 PG-08。）
9. 命中测试要求节点带可渲染组件：空的铺底节点收不到按下 ⇒ 只能把拖动监挂到两张地图 Sprite 上（`select.ts:77`）。缺"纯输入区域"节点/组件。（核实注：要求的是 UITransform 而非可渲染组件，见 PG-09。）
10. 桌面不模拟 touch：全仓搜不到 simulateTouch，鼠标与手指两条通道要各挂一遍并自己去做重（`press.ts:1-6`、`select.ts:223`）。
11. 键盘监听挂在 canvas 上（`pal/input/web/keyboard-input.js:43-44`，还是 canvas?. 静默跳过）：不 tabindex + focus() 就完全收不到按键，且没有任何告警 ⇒ `main.ts:21-25` 手动 focus + pointerdown 抢焦点。
12. 场景切换无引擎级 loadScene：`app.run(scene)` 单场景；`air/scene-stack.ts` 是 Node 级页面栈（push/pop/LRU），本端口没用它——整页重载换来确定性释放并贴合原作 setScreen 语义，代价是每次切场景都要等 boot 轮询（探针里 boot 上限要给到 40–90 s 才稳）。
13. 资源加载没有 Promise 封装：assetManager.loadRemote 仍是回调式且必须手传 ext ⇒ `tiled.ts:1-7` 自己包了 loadRemoteAsset()。

**C. 文档 / 工程性**

14. 裁剪与脏标记语义无文档：updateCulling() 该不该在业务帧里补，只能读 `assembler/simple.ts:115-116` 源码定论（`game.ts:2207`）。
15. TS 版本偏旧（4.9 的 lib.dom 没有 DecompressionStream 声明，浏览器早已支持）⇒ `level.ts:58` 只能靠断言绕过。
16. 无编辑器/无场景与 prefab 资产链路：全 Code First，`tools/build.mjs` 自带打包，?scene= 手工分派（`main.ts:26-34`）；调试期没有场景树可视化，只能自造 `__turtleGame`/`__turtleSelect` 钩子。
17. 测试钩子只有一半：createStepClock 支持手工定步，但没有配套的输入注入 API，UI 流程验收只能靠 CDP 真事件 + until 轮询（本仓 `_scratch/drive.mjs` 整套就是为此自研的）。

**owner 原始优先级意见**：①②④ 决定"能不能低成本搬 APK/libGDX 资产"，收益最大；⑦⑧⑨⑪ 是"能跑但容易埋雷"的接口，改动量小；⑤⑥ 属于 2D 表现层能力补齐，工作量最大但也是 AIR 相对 Creator 最薄的一块。
