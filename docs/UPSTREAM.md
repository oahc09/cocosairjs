# UPSTREAM

2026-10-20 Box2D 3.2：`src/air/physics-2d/box2d3.ts` 在原 Cocos 2D 组件接口后新增显式选择的 WASM 后端；默认 `@cocos/box2d` 和既有上游物理源码不变。`vendor/box2d/manifest.json` 固定官方源码、案例清单及源码哈希；`tools/build/box2d/contact-material.c` 在固定版本的原始 pre-solve 流形边界补充逐接触材质兼容，不改 vendor 源码。官方案例沿用原始构造与 `Sample::Step`，浏览器替代桌面窗口、文件选择和绘制宿主。验收状态以专项记录为准。

2026-10-19 Web touch cancellation: the reproducible PAL source transform checks `event.cancelable` before canceling a canvas touch event. Native non-cancelable `touchcancel` still retires its touches and dispatches the normal cancel notification; propagation, focus, coordinates and cancelable-event behavior stay unchanged. Frozen MIT vendor bytes remain intact. The Chromium mixed-input control retained two real invalid-cancellation console errors before this correction; source-unit controls do not by themselves establish the corrected browser result.

2026-10-19 WebGL2 审计 ENGINE-001/002/004/005：program 缓存检查独立于 PSO 身份，保留 shader 变化后的 IA/descriptor 语义；clear 临时打开全部部分 stencil 写掩码并精确恢复；按实际 stream 数初始化 IA offsets 并检查 stream/实际 shader location 上限；复用 scratch FBO 前解除旧 color/depth/stencil 附件并选定 read/draw buffer，保留独立外部 READ/DRAW 绑定。上游基线与版权不变。

2026-10-18 播放请求归属：audio-playback-patch.cjs 给 PAL 结束通知增加可选代际，Web Audio 计时回调绑定实际 AudioBufferSourceNode；Source 丢弃旧代际结束，兼容无参旧回调。包装播放器发出停止请求通知，使 AudioManager 淘汰也能结算请求；它不是物理停止完成事件。新 token 接管加载前队列、保留 seek/归零位置，旧无 token API 队列合同保持。Web Audio destroy 停止/断开源和 gain，防重释放缓存，防已销毁实例迟到启动；共享 operation-queue 与冻结 vendor 不变。PAL ambient 类型同步可选代际签名。

2026-10-18 Windows WebKit pending audio control：无 SDK 原生对照复现 pause/seek 后仍推进，清 src + load 后时钟和 played 范围保持停止，恢复 URL 后可再次播放。PAL 只对 Win 平台 Safari/WebKit 未确认启动的 play，在 pause/stop 时退役原媒体源，显式下一次 play 再恢复 URL、暂停/seek 位置；保留真实时长 metadata，不修改时钟 getter、不伪造事件。其他平台和已确认启动路径保持。冻结 vendor 不变，适配由 audio-readiness-patch.cjs 重现。

Audio downloader 同步转发 timeoutMs/signal/transport 至 PAL，资源管理器自身缓存与重试策略不变。

音频后续浏览器核查：Windows WebKit 的原生 WAV 有 canplay/真实时钟与 EOS、无 canplaythrough，因此 DOM ready 改用 canplay（iOS 保留 metadata）。显式 buffered 传输使用可取消 XHR 与自有 Blob URL，失败/销毁回收；默认 media 保留跨域行为，不宣称所有原生媒体后端会中止网络。AudioSource.loadAsync 可原子提供 clip/transport，避免先启动旧媒体请求。该范围不替代缺失作品的归因。

2026-10-17 音频就绪与请求合同：`tools/build/audio-readiness-patch.cjs` 为冻结 PAL 的 DOM/Web Audio 加载增加可配置总期限、AbortSignal、失败清理与解码拒绝；取消后的解码结果不缓存。AudioSource 增加 loadAsync/cancelLoad/loadState 和 source-local playRequest 结果，metadata 等待在失败、换 clip、销毁时结算，旧 play/stop 的 void 签名保持。音频 barrel 仅补导出结果类型。冻结 vendor、版权和共享 operation-queue 不变；详见 [就绪与所有权](manual/audio-readiness-ownership.md)。这些源码改动不确证《纸月律动》的历史根因。

2026-10-17 提交前审查修复：活动 TypeScript WebGPU 的 CommandBuffer.copyBuffersToTexture 改用与当前后端一致的即时上传路径，先提交待执行 compute，避免遗留 cmdPackage 无消费路径造成静默丢失，并保持与后续 blit/render 的队列顺序。冻结基线、上游版权及其他后端保持；实际 compute→upload→blit 及双纹理读回纳入资源合同。

2026-10-14 DOM 音频取消：`tools/build/audio-cancellation-patch.cjs` 在冻结 PAL 生成流程中让 DOM play 具有可取消代际，pause/stop/destroy 不再等待原生 play Promise；取消以 AbortError 结算，迟到回调不能恢复 PLAYING。仅 NotAllowedError 等待选定 canvas 手势，停止或销毁清理重试监听，销毁释放原媒体 src。AudioSource 使用播放与加载代际抑制迟到 STARTED、旧拒绝移除新播放、A→B→A 旧加载污染，并在有效 clip 替换时立即销毁旧播放器。共享 operation-queue、WebAudio/video 与冻结 vendor 原字节保持。自然 EOS 与晚到 play 完成的竞态另有回归；这不声明已查明 WebKit 延迟 Promise 的原因或产品27 epoch5 的历史根因。验收范围见 [音频取消验证](notes/audio-cancellation.md)。

2026-10-16 Windows WebKit 视频循环：原生 Media Foundation 播放器在 EOS 后先报告暂停，再执行 loop 的原生 seek，可能把暂停状态保留到 seek 完成。实际 Win32 平台的 Safari/WebKit 兼容路径在确认该原生回绕后，仅恢复调用方仍有效的播放意图；不写 currentTime、不伪造媒体事件。显式暂停、停止、seek、禁用、换源和关闭 loop 均取消待恢复动作；非 Windows 平台及其他浏览器不进入此路径。Windows WebKit 的 UA 模拟 macOS，平台判断使用 navigator.platform，不修改 PAL。

播放 Promise 只在成功且原元素仍被请求播放时执行时间校准；原生 loop 导致的 AbortError 不再触发迟到的 seek。

同元素 seek/play 后迟到的 ended 回调也检查当前原生 ended 状态，避免把上一播放位置的结束误报为新一轮 COMPLETED；保留原视频示例的循环计数窗口与 0 COMPLETED 断言。

2026-10-16 glTF 物理材质原生 WebGPU 补验：AIR 派生的 glsl4 sampler 声明使用明确的 material set/binding；活动 TypeScript WebGPU 后端将独立 sampler 的 native binding 偏移从 16 调整为 64，避免与物理扩展的逻辑纹理槽 15..27 冲突，并保持在 WebGPU 默认 binding 索引上限内。GLSL 翻译、布局及实际 descriptor 绑定共享同一偏移，不改 WebGL2 或未接入的历史 WASM 后端。

同轮 descriptor layout 延迟到实际使用时创建原生对象；保留模板元数据，由已有 shader reflection 投影出当前变体的真实绑定后才校验 GPU 限制。避免未启用的物理扩展采样器在完整模板阶段提前占用原生槽。管线投影使用共享 sampler 偏移。

2026-10-16 全仓门禁回归：补回冻结 builtin 重建遗漏的 7 个原有 pipeline/util 注册名称，包括 Profiler 依赖的 `util/profiler` 和启动画面资产；该批恢复 21 个原有默认 effect / 47 个 shader，来源仍是同一冻结提交；后续 glTF 私有模板补编见下文。`pipeline/bloom` 从冻结 `pipeline/post-process/bloom.effect` 编译并保留原注册名称。生成器确保保留这些既有入口，未改 Profiler 实现或降低浏览器断言。

同轮 Profiler WebGPU 实测进一步暴露 canvas 外部图像上传缺少原生 `RENDER_ATTACHMENT` usage。`webgpu-commands.ts` 为可渲染、单采样的二维颜色上传目标补充该原生用途，满足 `copyExternalImageToTexture` 约束；不扩大深度、三维或多采样上传能力，不改公共 TextureInfo 合同。

AIR `createAirUnlitFogEffect` 同步冻结模板的多 shader 结构：仅保留明确命名且不含雾钩子的 planar-shadow stage 原文，其他 stage 仍严格验证并注入片元雾；独立资产命名、共享模板缓存和销毁合同保持。Gallery 打包解析配方的 TypeScript 源码及当前 SDK，仓库外 legacy 比较基线在独立部署物中明确拒绝。

同轮媒体验证：Web VideoPlayer 在原生 `seeked` 后消费已完成的校准缓存，并将播放 Promise 的后续校准绑定到原视频元素，避免播放已前进或换源后被迟到回调重新 seek。保留原生播放器、真实循环和浏览器媒体激活约束；不是以 JS 强制重播替代原生 loop。

全量回归还检出了 glTF physical 派生对现代 `SurfacesMaterialData` 模板的不兼容。生成器现额外编译同一冻结提交的官方 `legacy/standard.effect` 为 AIR 私有 `air-gltf-template`，保留原有 glTF `StandardSurface` 扩展语义，同时使用冻结版本当前的全局 uniform ABI。默认注册集为 21 个原入口加 1 个 glTF 模板，共 22 effect / 50 shader；未回引旧 builtin 字节。physical 派生适配缩进、分离的 emissive 缩放和当前方向光累加钩子，材质语义回归保持。

2026-10-15 WebGPU 收尾：登记 native indirect compute、raw indirect 参数上传、颜色 blit 缩放/过滤、组合 color mask 与 MIN/MAX blend 修复；不引入 native-device WASM 或改变默认 WebGL2。原生 post-process-builder 在 TAA 关闭时恢复相机投影，消除两后端残余 jitter；深度采样使用 depth-only view 与不可过滤浮点布局。Firefox 的无头 GPU 进程与 Windows WebKit 的编译能力分别验证，不能把浏览器配置问题改成引擎回退。验收结果以本轮新输出为准。

2026-10-15 WebGPU 接入实施：冻结上游仍为 fffd9a514a。活动路径采用 TypeScript GFX 后端与独立 glslang/twgsl shader 资产；历史 native-device WASM 路径不接入。新增显式 renderer 选择，默认仍 WebGL2；按实际设备处理 shader 绑定、异步读回、失败和生命周期。历史 Deviation-04 是旧交付记录，当前进度与验证以 ai/ledgers/webgpu-backend.md 为准，本段不声明完整 GPU 矩阵或发布通过。物理 WASM 门禁保持原范围，仅同步新增 WebGPU 后的 feature 计数（35 声明、27 默认）及共享 Device/program-lib 已登记偏差。

同日按用户选择的修复路线从该冻结提交重建 14 个 builtin effect / 37 个 shader，消除旧资产 CCShadow/CCCSM 与运行时 UBO 的 ABI 差异；来源、编译器哈希、原始 MIT 声明和生成物哈希见 `vendor/builtin-source/manifest.json`。原生 custom 验证使用独立生成的效果与官方布局，不使用浏览器 descriptor 注入；后续 TAA 共享修复见上段。AIR glTF 网格按实际 WebGPU 设备为 joints 打包无符号整数，匹配官方 glsl4，WebGL2 保留其 glsl3 数据合同。

2026-10-14 安全启动：`tools/build/startup-binding-patch.cjs` 在冻结 PAL 生成流程中将 ScreenAdapter 的 DOM 包装、画布解析、事件注册与 Input 单例的 keyboard/mouse/touch 绑定移到显式启动边界；生成器精确校验替换命中数。音频手势恢复选择相同的自定义 canvas。冻结 vendor 与 `src/cocos` 不变。AIR 主入口与延迟入口通过一个 admission/initPromise 启动，options-only canvas/DPR 在 PAL bind 前生效；主入口仍依赖浏览器，不承诺 SSR。

2026-10-14 VideoPlayer 全屏清理：`video-player-impl-web.ts` 对已窗口化的播放器不再调用原生 exitFullscreen；退出 Promise 在 detach/navigation 期间拒绝时更新实际全屏状态并发出诊断，避免未处理 rejection。保留进入全屏、用户手势、原生 DOM 和平台能力边界；不改变冻结上游或压制浏览器错误。

2026-10-14 CI 登记对账：`verify:wasm-backends` 的共享源码闭包偏差白名单同步为当前 39 个已登记文件，每项都要求 `docs/upstream-file-map.json` 中存在 `modified: true` 与非空理由；任何清单外字节偏差仍失败。同步已有可选 `spark` feature 后的 Air 声明数 34、air-only 集合 `air/spark`；默认仍为 26 个 feature，三个 WASM 物理后端仍不进入默认集，A6 解禁触发器保持。未修改引擎源码或批准新的偏差，冻结上游提交不变。

2026-10-13 gfx 接入诊断：`webgl2-shader.ts` 在替换 shader 状态前拒绝调用方重复 `#version`（后端自动添加 ESSL 3.00）及同 set 的 uniform block / sampler binding 冲突；抛出带 shader 名、stage 和 code 的 Error。保留合法布局、GPU 延迟编译及原编译/链接日志，冻结上游不变。MSAA、资源所有权、键盘 capture 与可选 Spine 资产合同集中在 `docs/manual/gfx-integration-contracts.md`，不改默认输入传播或 Spine 部署范围。

本项目 `cocosair.js`（Cocos AIR）的源码基线来自 Cocos 引擎（cocos4）本地完整快照。

2026-10-02 文档命名整理同步更新 AIR 自有 `air-spine-instantiate-js.ts` 的资产部署提示和 `emscripten-assets.d.ts` 的说明引用，使用 `docs/notes/spine-asset-sourcing.md`、`docs/notes/physics-asset-sourcing.md`。此改动仅调整文档路径，不改变资产部署要求或后端行为。

## 基线标识

2026-10-11 WebGL2 图形合同：WGL-01～09 在原生 gfx 内修正 half-float/integer 过滤能力、comparison/anisotropy sampler 与 LOD 销毁、depth bias 启用及 factor/units 顺序、整数外部格式/clear/attribute，以及 mip/layer 附件与保持原生位宽布局的读回。RGB10A2UI 的 FormatInfo 修正为实际四字节 packed word；上传复用现有 internal/type 映射。view 读回相对 base mip/layer，单附件选择 base 而非 layered rendering。恢复 READ/DRAW、PACK/PBO 状态并明确拒绝不支持的格式/范围；默认 ALWAYS 普通采样及现有 hash 保持，规范化 anisotropy 封顶16。冻结上游基线不变；实施与 GPU 验收范围见 [专项台账](../ai/ledgers/webgl2-gfx-contract-remediation.md)，本段不声明完整发布通过。

2026-10-06 AIR 构建身份：新增 `AIR_BUILD_DATE: string`（北京时间 yyyyMMddHHmm）与 `AIR_BUILD_NUMBER: number`。ESM/min/System 编译从 1 开始计数，成功输出后更新 tools/build/build-number.json；build:all 的 dev/min 分别占一个序号，声明/打包不计数。计数状态保存在生成目录之外。源码默认 unbuilt/1；SOURCE_DATE_EPOCH 仅固定时间。增量缓存刷新日期与序号，不改变 AIR_VERSION/AIR_REVISION 或上游版本。

2026-10-06 ESM 构建告警：PAL 生成器将装饰器 helper 中必为 undefined 的顶层 this 回退读取去掉，保留本地实现；DragonBones 的同类 \_\_extends 通过 `tools/build/esm-helpers.cjs` 在 Rollup 内存转换中处理，保留原始 npm 字节与源映射，不修改依赖或过滤警告。glTF 的基础 effect 提取为 `standard-effect.ts`，解除 material 与 physical-effect 的循环导入，保留原导出路径和着色器逻辑。

2026-10-06 构建类型诊断：`src/tsconfig.json` 显式选择 bundler 使用的 Node 路径解析，加载已有 B2/Spine 环境声明及 Meshopt 外部模块声明，并与根配置同步官方空脚本豁免。Box2D 类型从官方已安装包生成 declaration-only 文件至 `src/node_modules/@cocos/box2d/types/`（约 181 KB），避免依赖 TS 被发射到引擎 rootDir 外；运行时包字节不变。PAL 生成器从冻结 MIT 源码补发 `input-source.d.ts`，输入与音频环境声明使用相对类型引用，消除 SDK 声明中的悬空 PAL 路径。外部 WASM 资产的部署要求和 feature 边界保持。

2026-10-06 Web 构建配置：从 `src/cc.config.json` 的 `treeShake.noSideEffectFiles` 移除四个未抽取的 `pal/input/minigame/*-input.js` 路径。它们仅是上游 MiniGame 的无副作用声明，不参与 HTML5 闭包；保留全部九条现有文件声明，不补入 MiniGame 实现，也不抑制构建诊断。

2026-10-06 resize 方向策略：RenderWindow 接受原生 Orientation.AUTO（13）与 LANDSCAPE（12），映射为 Web 的 IDENTITY surface transform；强制布局旋转仍由 PAL 处理。四个具体方向的映射和非法方向告警保持，修复 DPR/resize 将合法策略误报为 Unexpected screen orientation 的问题。

2026-10-06 ENG-01–09：原生 Mesh 的动态容量/索引预检、语义流局部更新、保留索引和分配失败清理；Fog 分离配置与有效 NONE；Node 的 TRS/setRTS 非有限值前置拒绝。Animation 重复控制器与多方向光仅增加现有 warning 通道诊断，不改变播放或主光选择。AIR 只读检查复用原生网格、材质、路径与 renderScene，不创建平行对象。原生辅助源码与修改原因登记在 upstream-file-map.json，冻结上游保持原样。

2026-10-05 响应式宿主适配：通过 `tools/build/screen-layout-patch.cjs` 在 PAL 生成流程中应用实测布局尺寸去重、ResizeObserver 合并、隐藏恢复和关闭清理；冻结 `vendor/pal-source/` 保持原字节。沿用原生 window-resize → View → Root 链，不新增输入坐标系统。AIR 启动新增可选 screenMode/container，未指定时保持原生 settings 默认；新增 Label helper 换行参数不改变 Label 默认行为。

| 项                     | 值                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Upstream package       | `cocos-creator`                                                                                                      |
| Upstream version       | `4.0.0-alpha.34`（V0.1 抽取时为 `4.0.0-alpha.33`）                                                                   |
| Upstream creator field | `3.8.8`                                                                                                              |
| Upstream repository    | https://github.com/cocos-creator/engine                                                                              |
| Baseline Date          | 2026-09-12（alpha.33 快照）→ 2026-09-19（alpha.34 对齐，V1.2 G0）                                                    |
| Upstream commit SHA    | 工作副本 HEAD `557b06f7e636572a15a426eb8c2387f40b92798a`；**V1.2 冻结对齐点 `fffd9a514a`（bump to 4.0.0-alpha.34）** |

## V1.2 G0 基线升级记录（2026-09-19/22）

1. `cocos4` 现为**有完整历史与 remote 的 git 仓库**，Deviation-01 关闭。
2. alpha.33 → alpha.34 触及 `cocos/` 的提交实测 **4 个**（V1.2 计划书 §2.1 原记 2 个，已修正）：
   `60f9352c56` #336 createMesh 索引格式自适应、`6b455561f4` #338 noise 优化、
   `f66365f959` #334 TerrainInfo `@visible(false)`、`2a75cfb9da` #329 webgpu pipelinelayout 顺序。
3. 冻结点后 HEAD 另有 `b46553e615` #341、`557b06f7e6` #343 两个提交，均标注 native platform，
   按计划书 R7「V1.2 期间冻结对齐点」不追。
4. 漂移修复执行：`src/cocos/3d/misc/create-mesh.ts`、`src/cocos/particle/noise.ts` 已从上游逐字节复制对齐；
   `src/cocos/rendering/custom/web-program-library.ts` 实测此前已一致。详见 历史记录（v12-upstream-regression.md，已清理）。
5. 全量比对脚本化：`node tools/compare/baseline-compare.cjs [--upstream <dir>]` → build/reports/baseline-compare.json。

## Deviation-01: 上游 commit SHA 不可得 —— **已关闭（2026-09-19，V1.2 G0）**

- 原现象：本地目录为一次性下载的上游源码快照，随后才 `git init`，无 commit / 无 remote。
- 关闭依据：`cocos4` 现具备完整 git 历史，可解析 `git rev-parse HEAD` = `557b06f7e6`，
  且 alpha.33 / alpha.34 的 bump 提交（`7f806abad6` / `fffd9a514a`）均可定位。
- 后续报告与提交说明改用：`cocos4 @ 4.0.0-alpha.34 (commit fffd9a514a)`。

## Deviation-02: `cocos/root.jsb.ts` 不抽取（V1.2 决策点 D4，批次 F-2）—— **豁免登记**

- 上游事实：`cocos/root.jsb.ts` 是 `cocos/root.ts` 的 **native(jsb) 入口变体**，由 `cc.config.json`
  的 `moduleOverrides`（`test: context.buildTimeConstants.NATIVE`）在 native 构建时整体替换 `root.ts` 等入口；
  其代码依赖 `jsb` / `cc.*` native 绑定全局符号。
- Air 口径：Air 为纯 Web 闭包（计划书 §1.3 排除全部 54 个 `*.jsb.ts`；护栏 5 要求「回归文件不得引入 native/minigame 闭包，
  54 个 jsb 变体依旧零进入」）。抽取该文件不会进入任何 Web feature unit 的闭包，只会把 `jsb` 符号面引入仓库，
  并被 `tools/verify/verify-web-only.cjs` 判为违规。
- 处置：**不抽取**，作为 §1.1 回归组 12 的约定豁免。可复核证据：
  `node tools/compare/baseline-compare.cjs` → 旧版基线差集报告（已清理）
  的 `upstreamOnlyByCategory["platform.jsb-variant"]`（54 项，含 `cocos/root.jsb.ts`）。
  同步登记于 历史记录（17-baseline-comparison.md，已清理） §9.2。
- 复议条件：若评审要求「12/12 物理对齐」，则按计划书备选口径原样复制且不接线（零风险），需另行授权。

## Deviation-03: 上游零引用者文件按原文落位但不接线（V1.2 批次 F-1）

- 计划书 F-1 要求 `cocos/deprecated.ts` 抽取后「在 exports/base 或独立出口中按官方引用方式挂接」。
- 实测上游 `4.0.0-alpha.34`：`cocos/deprecated.ts` **零引用者**（`grep -rn "cocos/deprecated"` 在
  `cocos/`、`exports/`、`typedoc-index.ts`、`cc.config.json` 均无 importer；该文件最后触及提交为 2023 年 `afd22296b4`）。
  官方 Web 构建因此同样不含它注册的 `Root.prototype.ui → batcher2D` 别名。
- 处置：文件按官方原文逐字节抽取并登记（满足 §1.3 差集口径），**不新增 feature unit、不接线**——
  「官方引用方式」即无引用。运行语义在 `test/smoke/smoke-30-v12-regression.test.ts` 的 F-1 项验证：
  显式 import 后别名 getter/setter 生效、除注册警告外无其他副作用。
  同类情形：`cocos/serialization/deserialize-dynamic-empty.ts`（见 §9.2 `needs-decision.unreferenced-upstream-file`）。

## Deviation-04: gfx-webgpu 子图「已抽取、未接线、暂不类型核对」（V1.2 批次 E / 决策点 D10）—— **部分交付 + 待确认**

- 已完成：`cocos/gfx/webgpu/**`（24）+ `cocos/webgpu/instantiated.ts` + `exports/gfx-webgpu.ts` 共 26 文件按官方原文逐字节抽取
  （`node tools/analyze/import-upstream-group.cjs --group E1 …` → `wrote 26/26; byte-identical 26; DIFF 0; MISSING 0`），并已登记进
  `docs/extraction-manifest.json` 与 `docs/upstream-file-map.json`；类型面补上官方逐字节 `@types/webGPU.d.ts`（3258 行）。
- 受阻事实（三条，均可复现，证据见 `docs/evidence/browser-matrix/d10/README.md`）：
  1. **上游引用图本身不经过 Web**：`cocos/gfx/index.ts`（web 变体）对 webgpu 零引用，唯一接线者是 `cocos/gfx/index.ems.ts`
     （emscripten 平台变体，与 54 个 `*.jsb.ts` 同类，按 §1.3/护栏 5 不抽取）。
  2. **运行时与类型资产不在基线快照内**：`cocos4/native/external/` 整个目录不存在，`webgpu_wasm/glslang/twgsl` 的 `.js/.wasm`
     与配套 `.d.ts` 需上游 `npm run update:native-external` 联网拉取。因此 Air 侧 `npm run typecheck` 命中 12 条硬错
     （`TS6053` / `TS2307 external:emscripten/webgpu/*` / `TS1343 import.meta` / 上游 `webgpu-define.ts:39` 的 `import { warn } from 'console'` 笔误 /
     `TS2550 matchAll·at` 需 `lib≥es2020`），变体构建 `exit=1`（`Could not load external:emscripten/webgpu/glslang.js … ENOENT`）。
  3. **上游自身在本快照内也无法核对**：`cocos4` 里跑 `tsc -p tsconfig.json --noEmit` → `exit=2`，10×`TS2688`（含 `./native/external/emscripten/webgpu/webgpu`、
     `./@types/consts`），说明「与上游对等的 gfx-webgpu 类型面」在快照内无参照物。
- Air 处置：**两处**按上游引用图对等豁免，且都写成可复跑断言——① 根 `tsconfig.json`（Air 自有）三项 exclude 移出类型核对；
  ② `src/tsconfig.json` 同名三项 exclude 移出发布声明图（实测 `dtsBundler` 会把 `exports/**` 全量收进 d.ts，
  于是未接线的后端在 `cc.d.ts` 里凭空多出 `export class WebGPUDevice`，而默认 bundle 导出表没有它 → 类型/产物不一致，+60,649 B）。
  `cc.config.json` 的 `features["gfx-webgpu"]` 登记也因此**回退**（登记即并入发布类型面）。
  **未写任何替代实现、未放宽 `lib`/`module`**。豁免范围由 `smoke-30`「批次 E / D10」三条断言锁定
  （exclude 清单精确匹配、子图外零引进口、抽取件仍在簿记内），不允许静默扩大。
- 交付面零影响（护栏 7，逐字节）：批次 E 前后三份发布产物完全不变 ——
  dev `6,081,668 B` / sha256 `35496aebda066ab5…`，min `3,499,182 B` / `8795c8685ace28a1…`，
  d.ts `3,082,360 B` / `sha256sum -c` OK；`npm run typecheck` 与 `npm run verify:web-only` PASS。
- 待确认（D10）：三选一 —— (a) 授权联网拉取第三方 emscripten 资产（`glslang/twgsl/webgpu_wasm` 的 js+wasm 及配套 d.ts）入 `src/native/external/emscripten/`
  并做许可审计，再补 `WEBGPU=true` 常量通道与 `device` 探测链路；(b) 手写类型替身 + 放宽 `module/lib` 以强行让子图入核对（与 §1.1「不得手写替代」冲突，不推荐）；
  (c) 批次 E 以「抽取完成、运行面按官方平台变体口径豁免」结案。计划书要求豁免须「可复核理由并经确认」，故本项在得到答复前不计入验收通过。

## Deviation-05: 三个 wasm 后端子图「已抽取、未接线、暂不类型核对」（V1.2 批次 D-4 / G-3，决策点 D3 / R8）—— **部分交付 + 待确认**

- 已完成：`cocos/physics/bullet/**`（30）+ `cocos/physics/physx/**`（26）+ `cocos/physics-2d/box2d-wasm/**`（23）+
  `exports/physics-ammo.ts` / `exports/physics-physx.ts` / `exports/physics-2d-box2d-wasm.ts` 共 **82** 文件按官方原文逐字节抽取，并已登记进
  `docs/extraction-manifest.json`（1196 → 1278）与 `docs/upstream-file-map.json`（1233 → 1315）：
  `node tools/analyze/import-upstream-group.cjs --group G3-physics-bullet-physx --features physics-ammo,physics-physx --prefix cocos/physics/bullet,cocos/physics/physx --exports physics-ammo,physics-physx`
  → `wrote 58/58; byte-identical 58; DIFF 0; MISSING 0`；`--group D4-physics-2d-box2d-wasm` 同型 → `24/24 byte-identical`。
  `npm run verify:file-map` PASS（`rows=1315 manifest=1278`）。上游第 83 个种子 `cocos/physics/physx/instantiate.jsb.ts`
  按 §1.3 / 护栏 5 **零进入**（`regress.cjs` 自动 skip，且 `smoke-30` 断言磁盘上不存在该文件）。
- 纳入范围按闭包实测而非推断：83 个种子沿静态 import 求传递闭包 = 上游 764 文件，其中 **678** 已在 Air 且逐字节一致、
  **3** 为「已在 Air 但与上游不同」（`cocos/core/platform/debug.ts`、`cocos/core/utils/path.ts`、`cocos/rendering/global-descriptor-set-manager.ts`，
  均为 upstream-file-map 在册的 Air 修改）、净新增恰为 83 个种子 ⇒ **零连带扩面**。
- 受阻事实（与 D10 同因）：三后端的**类型面与运行时资产同源同缺** —— 上游根 `tsconfig.json` 的 `types[]` 指着
  `./native/external/emscripten/{bullet/bullet,physx/physx,box2d/box2d}.d.ts`，该目录不在基线快照内（需上游 `npm run update:native-external` 联网拉取）。
  实测把子图纳入类型核对时 `npm run typecheck` 从 0 红到 **118**：`Cannot find namespace 'Bullet'` ×35、
  `Namespace 'B2' has no exported member …`（box2d-wasm 合计 74 条）、`Cannot find module 'external:emscripten/{bullet,physx}/…'`、
  `Cannot find namespace 'PhysX'`、`Cannot find name 'FilterData'`。上游自身在同一快照内跑 `tsc -p tsconfig.json` 亦 `exit=2`，
  即「与上游对等的 wasm 后端类型面」在快照内无参照物。
- Air 处置：与 Deviation-04 同因同治，**两处** tsconfig（根 `tsconfig.json` 与 `src/tsconfig.json`）各加 6 项 exclude（3 子树 + 3 exports 入口），
  **未写任何替代实现、未写 `any` 垫片、未放宽 `lib`/`module`/`types`**。与 Deviation-04 不同处：`cc.config.json` 的
  `physics-ammo` / `physics-physx` / `physics-2d-box2d-wasm` 三个 feature unit 按上游原文**保留声明**——因 `src/exports/*.ts` 已移出发布类型图，
  实测 `cc.d.ts` 逐字节未增长，不会重演「类型面凭空多出未接线后端」。三者也未进 `tools/build/build.cjs` 的默认 `AIR_FEATURES`。
  豁免范围由 `test/smoke/smoke-30-v12-regression.test.ts`「批次 D-4 / G-3」三条断言 + 精确锁定的 exclude 清单钉住，不允许静默扩大。
- 交付面零影响（护栏 7，逐字节）：抽取前后三份发布产物完全不变 ——
  dev `6,081,668 B` / sha256 `35496aebda066ab5…`，min `3,499,182 B` / `8795c8685ace28a1…`，d.ts `3,082,360 B` / `6d01c030d85bf86c…`；
  `npm run typecheck` EXIT=0、`npm test` 全绿（抽取当轮 r45c 为 31 套件 / 255 用例；补上本条末尾的 smoke-32 后，
  r45d 整表复跑为 **32 套件 / 261 用例 / 0 failed**，`E:/AIProMax/cocosair-scratch/pg-probe/r45d-jest.log`，
  清单已 `--update` 回填并经 `verify:test-inventory` 校验 EXIT=0）、`build` 与 `build:min` EXIT=0
  ⇒ 36 条三引擎矩阵记录与 51 条 V1.1 记录的产物绑定继续有效。
- 「未接线」的边界（免误读）：只指**默认发行面**不含这三族；**测试面**由 `test/smoke/smoke-32-wasm-fallback.test.ts` 6 条直接驱动三族 loader
  （`jest.mock(..., {virtual:true})` 顶掉 `external:emscripten/**` 九个说明符，控 `NATIVE_CODE_BUNDLE_MODE` 与 `sys.hasFeature` 两条开关），
  已把 **asm.js 兜底一支**从「零用例」变为可复跑断言：ASMJS 恒走兜底、BOTH 按能力探测、WASM 成对请求 `.wasm.js`+`.wasm.wasm`、
  bullet 仅 wasm 支写 `globalThis.Bullet`、physx 的 asm 用 `Object.assign` 而 wasm 重绑定 `PX`、asm 工厂为 null 时早退不改写 `bt`、
  三族在未开 `LOAD_*_MANUALLY` 时常驻挂在 `game.onPostInfrastructureInitDelegate`。此法**不引第三方资产、不改 `jest.config.js` 的 `moduleNameMapper`**，
  其余既有用例不受影响（全量计数以 `docs/test-inventory.json` 为准，r45d 为 32 套件 / 261 用例）。运行级**真实出图**（三引擎矩阵）仍卡 #10 的资产缺口。
- 待确认（D3 / R8，见 `docs/reference/owner-decisions.md` §2 #10 与 §2.1）：本行只覆盖**编译面**的处置。运行级取证
  （box2d-wasm / ammo / physx 三示例 × 三引擎矩阵）仍卡在同一资产缺口——`external:emscripten/**` 既不在上游快照也不在上游 git
  （`git ls-files external` 仅 11 文件，Air 11/11 逐字节镜像），且 `@cocos/box2d@1.0.2` 包内 `.wasm` 计数为 **0**，
  故计划书 D3「来源 = @cocos/box2d 包内资产」前提为假（明细 `docs/notes/physics-asset-sourcing.md`）。三选一：
  (a) 按计划书自带默认 D8 口径结案（代码回归 + 选择器可达 + 降级路径可测 = 部分通过、显著标注、不阻塞 Gate）；
  (b) 从官方 npm/CDN 引入 wasm 资产入发行物（需许可登记 + `verify:licenses` / `verify:web-only` / bundle 预算三处门禁同步改 + 全量重采）；
  (c) 记「不达」。答复前 LV12-14 / LV12-16 不计入验收通过。
- 自办欠账进度：**~~`asm.js` 兜底分支零用例~~ 已收口**（r45c 写就 `test/smoke/smoke-32-wasm-fallback.test.ts` 6 条 / r45d 整表复跑 + 清单回填，见上一条）；
  **~~scratch 判据脚本随文件系统即失~~ 部分清偿**（r45d 新增正式门禁 `npm run verify:wasm-backends` = `tools/verify/verify-wasm-backends.cjs`，
  把 `wasm-backend-closure` / `closure-unresolved-detail` / `feature-units` / `physx-count-recon` 四份一次性判据固化成六条只读不变量：
  A1 闭包 764 文件（除 1 个 jsb 变体）全部落盘、A2 seed/闭包/jsb 集合/默认 `AIR_FEATURES` 数未漂移、
  A2 seed 内相对说明符零条解析不到上游、A3 闭包内字节偏差集合 ⊆ 在册 3 项、A4 `external:emscripten/**` 仍是登记的 9 个且只出现在动态分支、
  A5 feature 声明面 34/55/22 + `airOnly=["air"]` + 三后端定义与上游逐字段相同且不进默认集、
  A6 上游 `types[]` 一旦能解析到 `{bullet,physx,box2d}` 声明即判红 = **Deviation-05 的解禁触发器**（对应 owner #14 候选 (b)）。
  r45d 现读 `verify:wasm-backends` **EXIT=0**（`{"ok":true,"seeds":83,"closureTotal":764,"airByteIdentical":760,"drifted":3,"specs":9}`）；
  负向对照（仓库外副本改常量）EXIT=1 且两条断言各自起火 ⇒ 门禁非空转。判据脚本仍在 scratch 的其余项：`lv12-16-attribution` / `physx-which-file` / `check-doc-refs`。
- **UPDATE-r45f（上一行末的「仍在 scratch 的其余项」自本行作废）**：`verify:wasm-backends` 增至**七条**（新增 **A7「物理后端子树缺件必须登记在 旧版基线差集报告（已清理） 差集任一桶内」**，
  子树 = `SEED_DIRS` + `cocos/physics/cannon` + `cocos/physics-2d/box2d`；`SEED_DIRS` 另断言非 jsb 缺件数 = 0）。r45f 现读 `EXIT=0`
  （`{"ok":true,"seeds":83,"closureTotal":764,"airByteIdentical":760,"drifted":3,"specs":9,"subtreeUnregistered":0,"registeredFace":96}`；
  子树计数 `bullet 30/0/0`、`physx 27/1/0`、`box2d-wasm 23/0/0`、`cannon 20/0/0`、`box2d 22/0/0`，physx 那条 1 即 **Deviation-02** 的 jsb 变体不抽口径下的 `cocos/physics/physx/instantiate.jsb.ts`）；
  A7 负向控制三份（`pg-probe/negctl-a7*.cjs`：删在册差集条目 / 塞不存在的子树 / 仅钉 ROOT 的阳性对照）→ 前两份 EXIT=1 各报 A7 红项、阳性 EXIT=0。
  同轮新增两份只读门禁、均不改任何既有判定阈值：`verify:doc-refs`（文档互引棘轮，登记 46 条历史断链为 LV12-21 债务 = F-127）、
  `verify:custom-exports`（LV12-17「custom 导出面一致」半项：两个 `src/exports/custom-pipeline*.ts` 与上游逐字节同、
  `cocos/rendering/post-process` 34/34 与 `cocos/rendering/custom` 25/26 逐字节同且逐张登记在 `docs/upstream-file-map.json`）。

- **UPDATE-r46（2026-09-24，Deviation-04 / Deviation-05 结案注记）**：owner 批复 #7=(b)、#14=(a)、#10=(a)（见 `docs/reference/owner-decisions.md` §4）
  ⇒ 两个 Deviation 的「待确认」升级为**已批复结案**：gfx-webgpu 维持「三浏览器回退探测证据」交付档（firefox/webkit 探测腿 r46 补齐）；
  三个 wasm 后端维持「已抽取、未接线、暂不类型核对」豁免（#8(a) 只把 builtin + cannon 接进默认集，不触及本豁免面）；A6 解禁触发器保持有效。

## Deviation-06: D9 残留差集显式豁免（V1.2 批次 F-3 收口 / owner-decisions #1–#4）—— **豁免登记（已批复 2026-09-24）**

Owner 批复「按照建议执行，确保最优」，`docs/reference/scope-decisions.md` 全部 14 项残留按**文件**口径显式豁免，不纳入 V1.2：

- **A 组（7 个 `exports/*.ts` 入口门面）**：`affine-transform` / `rich-text` / `ui-skew` / `light-probe` / `xr` / `particle` / `vendor-google`。
  理由链：实现均在树内（vendor-google 除外，另含第三方 Google Cast SDK 许可面）；各差 1–26 行 re-export 门面；
  纳入即改产物字节 ⇒ 触发全量证据重采；xr 在 headless 三引擎矩阵下不可取证。
- **B 组（`cocos/particle/animator/optimized-curve.ts`）**：3D 粒子半纳入态的最后 1 个实现文件，随 A-7 门面同批豁免。
- **C 组（terrain，5 文件 / 3334 行）**：闭包自封（簇外零静态引用者），不纳入不使任何已纳入文件失去依赖；计划书 16 组未列该子系统。
- **D 组（`cocos/serialization/deserialize-dynamic-empty.ts`）**：上游零引用桩（全仓无 importer、两侧 config 无该映射），不纳入零功能损失。
- **平台/编辑器变体点名补全（r46 独立核查）**：`cocos/gfx/base/pipeline-state.editor.ts`、`cocos/gfx/index.ems.ts`、
  `cocos/native-binding/decorators.ts`、`cocos/rendering/lod-group-editor-utility.ts` —— 非 `*.jsb.ts` 形态的平台（ems）/编辑器（editor）变体，
  并入本豁免口径，补全 §1.3「其余 54 个 `*.jsb.ts`」的文字缺口（r46 实测：`cocos/` 树官方独有 87 = jsb 77 + 上述 4 + D9 已分类 6 个具体路径）。

本豁免不改变「抽取件与官方逐字节」护栏；`verify:wasm-backends` A6 解禁触发器保持有效。

## Deviation-07: Spark 为第二个上游，不受 cocos4 抽取口径覆盖；运行时与 WASM 均不入默认 bundle（SPK-02/03 裁定，2026-10-11）—— **豁免登记**

- **来源异质**：Spark 不是 `cocos4` 的抽取件，而是独立的第二上游（`@sparkjsdev/spark` **2.3.1**，MIT，© 2025 WORLD LABS TECHNOLOGIES, INC.）。
  因此 `verify:file-map` 的「`airPath` ↔ `upstreamPath` 同名抽取 + 逐字节比对」口径对它**不适用**：`vendor/spark/**` 本体不进
  `docs/upstream-file-map.json`，其字节对账由 `node tools/build/vendor-spark-tree.cjs --check`（逐文件 SHA-256 + 未登记文件检出 + git 子树交叉核验）
  与 `docs/evidence/spark/vendor-spark-tree-20261011.json` 承担；映射表只登记本仓 AIR 原创的 `src/air/spark/` 适配层文件
  （`upstreamPath: null` + `baseline: "AIR Spark integration"` + reason，且注明不进根导出面；SPK-14 终态实测为该形态共 **6 行**——
  五个 `src/air/spark/` 文件加 `src/exports/spark.ts`，此前登记的 `upstreamPath: "air/spark/…"` + cocos4 baseline 形态已由
  `node tools/build/register-spark-file-map.cjs` 重跑纠正）。冻结身份见 §Spark 冻结上游源码。
- **默认 bundle 边界（不并入，按可选入口发运）**：2.7 MB 级运行时与 1.5 MB 级 WASM 不编进默认发行。接线前基线已由 dep-graph 取证两次
  （默认 26 feature 集闭包 1151 可达 / 1370 扫描、`AIR_FEATURES=air` 闭包 1103 可达），**闭包内 spark 节点数均为 0**；
  默认产物为 dev 6 649 186 B（`69127f39…`）/ min 3 713 427 B（`779c288e…`）。**注**：dev 产物的 SHA 会随 `AIR_BUILD_NUMBER` 变化而字节数不变
  （SPK-14 复跑时该产物内嵌值已递增到 51，与 SPK-00 快照的 23 不同，故 `69127f39…` 只能作为该次快照的身份，不可用作跨构建对账），
  min 产物不含该变量，故其 SHA 可继续对账。SPK-12 接入后该断言必须仍为 0，除非体积门禁通过并另经 owner 决定把 `spark`
  折入 `src/exports/air.ts` 聚合。证据：`docs/evidence/spark/bundle-boundary-20261011.json`。
- **公开面边界**：`spark` 走独立 feature unit（入口 `src/exports/spark.ts`，须以变体构建显式点名 `AIR_FEATURES=…,spark`）；
  **未**开 `cocosair.js/spark` 包内子路径导出（`package.json` `exports`/`files` 里没有 spark 条目），原因是变体产物本身不随 npm 包发布
  （见上一条 WASM 边界的许可处置）——「与 `./html-source` 同构」目前是**未成立的复议形态**，不是现状。不聚合进 `air` 聚合出口；
  `src/air/spark/` 适配层（`spark-api-adapter.ts`/`spark-math.ts`）**刻意**不出现在 `cocosair` 根导出面——这是计划 §SPK-05a
  **硬约束 1**（构建正确性而非风格）：`cocosair` 根已由 `src/exports/base.ts` 导出引擎 `Scene`，`src/exports/air.ts` 又把
  `src/air/index.ts` 并入同一模块，适配层再导出即出现第二个 `Scene` 并在构建期冲突。该「不泄漏」由
  `node tools/verify/spark-adapter-elements.cjs`（`npm run verify:spark-adapter`）以源码级 leak 检查断言，而不是仅靠本文字的声明
  （SPK-14 复跑实测：退出码 **0**、`passed: true`、`exportedMembers=150 / annotatedMembers=150`、`findings: []`、`rootExportLeakage: []`，
  见 §Spark 发运边界与接线状态）。硬约束 1 的**实测代价**已取证（不是理论风险）：SPK-13 曾在 `src/exports/spark.ts` 平铺
  `export * from '../air/spark/spark-api-adapter'`，ccbuild 把入口原文合成进同一 `cc` 模块后，rollup 报
  「Conflicting namespaces … (will be ignored)」并丢弃**引擎**那一侧的 `Scene`/`Camera`/`Color`/`Material`/`Mesh` 等同名导出，
  变体产物运行时 `cc.Scene is not a constructor`，SPK-INT 探针在三台浏览器上全部 startupException；
  移除平铺再导出后歧义导出归零、导出面恢复为 613 个符号。证据 `docs/evidence/spark/spk13-native-gfx-probe-full-20261012.json`。
- **WASM 边界（2026-10-12 实测订正，替代本 deviation 登记时的「独立资产目录」设想）**：解码用的 `spark_rs_bg.wasm` 与 wasm-bindgen glue
  落在 `vendor/spark-rs/`（受审计：`vendor/spark-rs/MANIFEST.md` 逐文件 bytes + sha256 + 来源行，`npm run verify:spark-assets` 对账），
  **并以构建期 base64 内联进可选 `spark` 变体产物**，不再按 `build/gltf-decoders/` 先例作为运行时可 fetch 的独立资产目录发运——
  `build/spark-rs/` 不存在。原因在冻结上游本身：`vendor/spark/src/wasm.ts` 以 `import WASM from "spark_rs_bg.wasm?arraybuffer&base64"`
  静态取字节，并在模块求值期 `WebAssembly.compile(WASM)`，四个消费点（`PagedSplats.ts`、`SplatMesh.ts`、`SplatWorker.ts`、`spz.ts`）
  都要求字节同步可用；改成应用托管异步 fetch 必须改冻结源码，与本计划「vendor 树逐字节冻结、偏差只在集成层补偿」的口径冲突。
  边界仍成立的部分：**默认**产物（`build/cocosair.module.js{,.min.js}` 及其 source map）内既无 wasm magic，也无
  `spark_rs_bg.wasm` / `SparkRenderer` / `SplatMesh` 字样，由 `verify:spark-assets`（含内嵌 base64 解码后 sha 与资产逐字节相等的防漂移断言）
  与 `verify:licenses` 双重负向指纹断言。该产物是**源等价发行件，未在本环境用 Rust 重建**，且其转付 Rust crate 许可链未闭合，
  处置登记为 `pending`（`docs/license-decisions.json` §spark-rs WASM 与 wasm-bindgen glue）；据此 spark 变体产物**未列入 `package.json` `files[]`**，
  即不随 npm 包发布。详见 §Spark WASM 与 glue 的 provenance。
- **复议条件**：owner 决定把 Spark 纳入默认发行（须过 bundle 体积门禁并重采默认产物字节与全部证据），或闭合 spark-rs 的 crate 许可链后
  改为 decoder 式独立资产托管发运（须重排 `wasm.ts` 的取字节方式并放弃 vendor 逐字节冻结，另立 deviation），或引入原生 WebXR 会话层
  （此时按 §Spark XR 范围收窄 deviation（SPK-10 边界登记） 的恢复路径解除 `SparkXr`/`hands` 排除）。

## 发布面 provenance 声明（F-130 / owner-decisions #17）

本文档及发布面 `docs/*.md` 中出现的盘符绝对路径（本机取证 scratch 目录、上游快照 `cocos4` 目录、benchmark 目录）
**不随 npm 包发布、不保证对收件人可复现**；可复现判据一律以仓库内 `npm run verify:*` 系列门禁为准。

## Intentional AIR adaptation: configurable Web DPR cap

`src/pal/screen-adapter/web/screen-adapter.js` retains the upstream default cap of 2, while adding the host override `window.__CCDPR_CAP__` for deployments that need a different fill-rate/clarity tradeoff. The value is read before the adapter scales `windowSize`; invalid or non-positive values fall back to 2. Input-coordinate conversion and safe-area scaling continue to use the same `screenAdapter.devicePixelRatio` getter.

The override must be assigned before importing the engine. The usage and pixel-unit contract are documented in [docs/manual/responsive.md](manual/responsive.md) §3. This is the single intentional PAL byte difference; `docs/upstream-file-map.json` marks it modified and `test/smoke/smoke-30-v12-regression.test.ts` checks that no other PAL file drifts.

## Intentional AIR adaptation: `preserveDrawingBuffer` on both WebGL backends

Historical dual-backend scope: since the owner decision of 2026-09-30, only WebGL 2 is
supported in the browser runtime. The WebGL 1 source modification below is retained as
extraction provenance and is excluded from the default bundle.

`src/cocos/gfx/webgl/webgl-swapchain.ts` sets `preserveDrawingBuffer: true` (AIR, 2026-09-12) so Code First pages remain pixel-readable for debuggers, verifiers and `canvas.toDataURL()` capture after the frame is presented. `src/cocos/gfx/webgl2/webgl2-swapchain.ts` now matches (AIR, 2026-09-28): the original change had missed the WebGL2 `getContext`, so on the WebGL2 backend any readback outside the `AFTER_DRAW` window (after a window resize, while paused, or from a timer) returned a black canvas while WebGL1 kept the last frame. The WebXR branch keeps the upstream `false`. Both files are marked modified in `docs/upstream-file-map.json`; the regression is locked by `tools/verify/capture.cjs` (resize/paused phases must stay non-black on both backends).

## Intentional AIR adaptation: host canvas override (`__CC_CANVAS__`)

The Web PAL input sources (keyboard/mouse/touch) and the screen adapter resolve the game canvas once, at module-evaluation time, via `document.getElementById("GameCanvas")`. AIR adds an element-reference override read before that lookup: assigning `globalThis.__CC_CANVAS__ = <canvas>` **before importing the engine** binds input and screen adaptation to any canvas regardless of its DOM id, without renaming user DOM. Affected files: `src/pal/input/web/{keyboard,mouse,touch}-input.js` and `src/pal/screen-adapter/web/screen-adapter.js` (the adapter also keeps the `__CCDPR_CAP__` override above). The screen adapter now throws a specific import-time error when neither binding is available. `createAirApp` additionally rejects a conflicting `#GameCanvas`, leaves custom IDs unchanged, and defaults `tabIndex = 0` so PAL click/touch auto-focus can receive keyboard events. Regression locked by `tools/verify/canvas-binding.cjs` (classic / any-id-via-override / decoy-conflict / unbound-import modes).

## 基线快照统计（2026-09-12）

| 项                     | 值                                            |
| ---------------------- | --------------------------------------------- |
| `cocos/` TS 文件       | 1251（其中 `*.jsb.ts` 54）                    |
| `cocos/` TS 行数       | ~314,009                                      |
| `editor/` TS 文件/行数 | 33 / ~5,515                                   |
| `exports/` 导出入口    | 47 个 `.ts`                                   |
| `native/` 体积         | ~855 MB（不入 Air）                           |
| 源码状态               | 全部文件为 untracked 快照，无本地修改历史可考 |

## 约定

1. 不执行 `git clone / pull / checkout`；不改动上游文件内容（除计划书明确允许的 Extraction 动作）。
2. 所有后续报告、提交说明引用基线时使用：
   `cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`。
3. 上游文件与 Air 文件的对应关系记录在 `docs/upstream-file-map.json`。

## Intentional AIR adaptation: WebGL 2-only target environments

Owner decision (2026-09-30): WebGL 1 is no longer supported. The default build drops
`gfx-webgl`; its feature declaration is removed and `src/exports/gfx-webgl.ts` is
an inert retained provenance entry. `src/cocos/gfx/device-manager.ts` requires a
successfully initialized WebGL 2 device for browser rendering and throws
`WEBGL2_REQUIRED` instead of falling back to WebGL 1 or EmptyDevice. Explicit
HEADLESS remains supported. Both extracted files are recorded as modified in
`docs/upstream-file-map.json`. The legacy backend source remains in the extraction
tree but is not exported or shipped in the runtime. AIR builtin registration no longer
generates WebGL 1 shaders. Current positive W01/W03/G4 probes are WebGL 2-only, with
startup rejection and HEADLESS verified by `tools/verify/webgl2-only.cjs`.

Current feature counts: 33 declared AIR units, 55 upstream units, 23 upstream-only
units, one AIR-only unit, 26 default features. Historical counts in earlier sections
remain snapshots; the current invariant gates use this approved support policy.

See [browser support policy](webgl2-only.md) for validation and release-evidence requirements.

## 分析报告清理（2026-09-30）

旧版基线差集和依赖图快照已移出 docs。比较工具默认输出 build/reports/baseline-compare.json；依赖图默认输出 build/reports/web-dependency-graph.json。登记数据仍由 extraction-manifest 和 upstream-file-map 保存。

WASM 门禁 A7 改为现场比较五个物理后端子树，仅允许 EXPECT.jsbInClosure 列出的具体 JSB 文件缺失；其他缺件必须失败。更新报告不会扩大排除集合，旧版报告中的 registeredFace 读数仅为历史记录。

## TTF shadow geometry — E-RICHTEXT-SHADOW-KERNEL-001

AIR modifies cocos/2d/assembler/label/{text-output-data,text-processing,ttfUtils,ttf}.ts to keep TTF logical content dimensions separate from shadow visual overflow. Overflow.NONE and RESIZE_HEIGHT render the full integer canvas at its font scale; shadow-only margins offset the quad and drawing origin without changing UITransform layout dimensions. RESIZE_HEIGHT reserves horizontal shadow margins without changing wrapping width. CLAMP/SHRINK retain fixed-box behavior. Anchor-only vertex updates use the same bounds.

This preserves RichText segment advance, wrapping and alignment without a RichText-specific position patch or a new SDK export. Padding uses the existing outline/shadow union, including positive and negative offsets; it is not an independent 2\*blur+abs(offset) estimate. Regression: test/smoke/smoke-33-label-shadow.test.ts and tools/debug/probes/label-shadow-probe/. Browser test runtime may include source RichText through tools/verify/build-label-shadow.cjs; default SDK export policy is unchanged. Multiline shadow text is painted once instead of being overpainted by both effect and text passes. Auto-sized quads also honor canvas integer dimensions when shadow is disabled, preventing a sampling-scale jump on shadow toggles.

## PAL public-source replacement (2026-10-01)

Core cocos4 remains pinned to alpha.34 / 557b06f7e636572a15a426eb8c2387f40b92798a. PAL alone now derives from the public MIT parent 9f0e30acb31f6d670f2c0bf818d61039846a2860 of the private-repository move db5462603e20d5fa56814380274ad475bf388fb2. This is a distinct, explicit source baseline; it does not relicense the retired UNLICENSED npm package.

38 frozen TS inputs in vendor/pal-source generate 38 JS files plus audio/type.d.ts. The manifest pins SHA-256, Git blob identity and TypeScript 4.9.5. tools/build/pal-source.cjs reproduces all outputs and notices; verify:file-map and verify:licenses consume this check. All derived rows are marked modified in upstream-file-map with their public source path. LICENSE_pal.txt and NOTICE_pal.txt retain the root grant and original source notices.

Five sources have host adaptations: env/web/env.ts now returns **CC_CANVAS** from findCanvas, the three Web input sources use the same binding, and screen-adapter preserves binding/DPR and explicit unbound rejection. The env change fixes an existing omission: input/screen binding alone did not give game.init the custom canvas. W04 now verifies actual framebuffer pixels rather than an unconditional success assertion.

## Competitive runtime contracts

Material and Pass uniform setters now validate types, finite shader components and array capacity before writes. Native Color/Quat/vector/matrix values and partial uniform-array updates remain supported. Component Light uses Color; rendering Light uses Vec3. Both color contracts and temperature setters are validated without changing that distinction. The internal property-validation helper has no AIR bootstrap dependency.

CallbacksInvoker restores invocation state with finally and preserves ordinary EventTarget rethrow behavior. Input specializes the callback hook to report and isolate listener failures. UI pointer dispatch depth and terminal touch claims also recover after exceptions. Mouse/touch location methods consistently validate and reuse declared Vec2 outputs.

createMesh uses nullish defaults so POINT_LIST=0 survives static and dynamic construction. Rendering still uses explicit effect pass topology; this adaptation does not claim a mesh-only topology coordination API.

Changed paths are registered in upstream-file-map. The competitive uniform/input/point smoke tests, development GPU probe and point-cloud/orbit examples provide acceptance beyond field assignment. Current verification and open work are recorded in the [execution ledger](../ai/ledgers/competitive-benchmark-remediation.md).

PixelFormat adds SRGB888/SRGBA8888 names for existing GFX sRGB formats, preserving old enum values. These opt-in formats perform hardware sampling decode; standard effects retain their software decode, so callers must not combine both paths. GPU acceptance covers equivalent color inputs, row orientation, alpha and linear normal data in three browsers.

EffectAsset early registration also differs between source/headless and full Web bundles. Before a device exists, the full bundle may expose the effect-import library that game.init later disables for the legacy configuration. AIR now registers effect metadata immediately and defers program registration until renderer initialization, selecting the active library at that time. Destroy removes pending callbacks. This keeps legal early onLoaded calls usable instead of requiring a blanket prohibition; dedicated tests cover both library choices and a full-bundle browser probe verifies actual drawing.

## WebGL2 pipeline state snapshots

`cocos/gfx/webgl2/webgl2-pipeline-state.ts` connects cached GPU pipeline states to the pipeline's owned rasterizer, depth/stencil and blend copies. Upstream retained the mutable material pass objects even though the pipeline was cached by its original hash. Alternating additive and normal Sprite/ParticleSystem2D draws could therefore reuse a cached additive pipeline whose blend factors had become normal. The AIR helper uses MaterialInstance pipeline overrides; this engine correction prevents those overrides from corrupting previously cached state. Focused CPU mutation tests and the graphics/DOM browser pixel probe cover the change. No renderer backend is added.

## Port diagnostics (PG-18)

`cocos/core/platform/debug.ts` adds an internal explicit warning/error subscription, including native numeric diagnostic IDs. Logging keeps the original console filtering; observer exceptions and recursive observation cannot interrupt native calls. AIR bootstrap exposes an 80-entry bounded, deduplicated channel, defaults to errors, and offers `diagnostics: 'warnings'` to enable native warnings. The separate debug session subscribes to that channel without console or WebGL monkey patches. This change does not classify normal culling or automatic skinning transport as failures. Verification and remaining diagnostic boundaries are tracked in the [port ledger](../ai/ledgers/port-gap-remediation.md).

## Scene-only release (PG-30)

`Director._releaseSceneImmediate` is an internal AIR detach/destroy/drain path. It clears the running-scene pointer, preserves persist registrations while detaching their nodes, and drains native CPU destruction without waiting for drawing. It keeps the runtime, scheduler and shared asset caches. ReleaseManager accepts a null next scene and offers an internal flush for already requested releases. Its pending queue uses weak asset identity: multiple Code First assets with empty UUIDs no longer overwrite one another. Existing reference-count and ignored-asset checks still apply. This differs from `purgeDirector`, which releases all assets. AIR callbacks use a cooperative 5-second deadline; receipts report failures/pending ownership and unavailable GPU memory measurements. No lost-context reconstruction is attempted.

## Nonuniform UI viewport (PG-08/35)

Camera adds an opt-in orthographic half-width, `orthoWidth`, whose zero default preserves the original height-times-aspect projection. The component forwards and serializes it; pooled native cameras reset it. Screen-aligned Canvas derives both half-axes from native view scales, so EXACT_FIT stretches the whole design rectangle and its native inverse projection/hit testing agrees with getUILocation. Target-texture Canvas retains automatic aspect. No virtual-stage node scaling or body/CSS policy is added. Fractional DPR previously supplied fractional window dimensions that HTML canvas truncated; the frozen-public-PAL generation transform now rounds physical dimensions to match AIR bootstrap on startup and resize, without editing frozen source. See the port ledger for actual repro and verification.

## Billboard ownership (PG-25)

The native Billboard is now directly exported by AIR without importing the particle aggregate. Its extracted source destroys its exclusive model, mesh and material on component destruction; technique changes return the old model through Root's model pool. Input textures remain borrowed and are never destroyed by this cleanup. Three-browser scene-release probes first reproduced the missing mesh/material cleanup; this difference addresses that concrete lifecycle failure.

## Bitmap font kerning (PG-02)

PG-02 also corrects native BMFont kerning in `cocos/2d/assembler/label/text-processing.ts`: the final character retains its incoming pair, which layout already consumes as the next character's kerning. Previously two-character strings such as AV lost the pair entirely. The existing TTF shadow adaptation in this file is preserved. AIR's single-page text parser/factory and owned font handle remain in `src/air/assets/bmfont.ts`.

## Tiled object queries (PG-03)

The TMX parser retains the modern `class` attribute (falling back to legacy `type`) in optional `className`, independently of the existing numeric shape enum. TiledObjectGroup adds string-class/numeric-shape queries and immutable original geometry snapshots. Reinitializing the same parsed objects now converts from the original coordinates and polygon/polyline points, preventing repeated Y flips or cumulative isometric conversion. First initialization retains the native coordinate formulas and rendering behavior. This is an intentional change to three extracted Tiled files; it does not add a collision solver or alter tile rendering/culling.

## Input action ownership (PG-28)

`cocos/input/input.ts` includes the already-dispatched `MOUSE_ENTER` and `MOUSE_LEAVE` events in its native input type map (PG-28). This adds typed subscriptions without changing event dispatch. The optional AIR action adapter uses mouse-leave to release its simulated mouse source and PAL's existing physical-key map to clean up held keys released after focus moves away from the canvas. It does not admit a second keydown channel or synthesize engine events.

## Explicit offscreen attachments and clip projection

`asset/assets/render-texture.ts` preserves an explicitly supplied render pass's color formats; the default target still follows the swapchain. Its public pixel-format metadata follows the created color texture. `render-scene/core/render-window.ts` forwards each attachment's sample count into its native TextureInfo and identifies color-only offscreen windows. This makes the native camera target usable by AIR's owned render-target adapter without constructing parallel renderer objects.

`asset/assets/asset-enum.ts` adds the existing GFX RGBA16F format as a public PixelFormat alias. `render-scene/scene/camera.ts` validates oblique clip planes, rebuilds the base projection for repeat calls, preserves caller input, and refreshes inverse/view-projection/frustum matrices after clipping. The standalone calculation must still be applied before camera culling and uniform upload; it does not introduce an automatic world-space water plane.

`rendering/render-pipeline.ts` derives camera render-pass sample counts from the actual framebuffer, handles absent depth, and stores sampled depth/stencil so later cameras can reconstruct depth. Unsampled depth retains the native discard optimization. This closes the camera-path attachment contract rather than adding a separate render pipeline.

## Bone-space bounds cache (PG-18/21)

Realtime and baked skinning models validate weighted joint paths before replacing their binding. The shared internal `skinning-validation.ts` helper keeps legitimately unused missing joints legal; invalid weighted paths report `AIR_E_SKINNING_JOINT_PATH` with mesh, root, joint and correction context. A validation failure preserves the previous valid model binding.

Realtime skinning additionally validates the weighted palette slots before changing the binding. The native joint texture fallback has a fixed 256-joint capacity; previously a weighted slot 256 silently wrote past its typed array and disappeared on the GPU. `AIR_E_SKINNING_CAPACITY` now includes the mesh, skeleton, root, global joint, local palette, slot and actual transport capacity. Large skeletons remain legal when their used slots fit local joint maps or their unused tail does not occupy the transport. This adds an actionable rejection; it does not increase the shader/texture capacity or force baked mode.

`cocos/3d/skeletal-animation/skeletal-animation-state.ts` clears its initial baked-only evaluator suppression before creating the first realtime evaluator. A clip first initialized with `useBakedAnimation=true` previously changed model type when the public preference became false, but its node curves remained unevaluated. The native clip/state APIs and later mode changes are preserved; the fix supplies the evaluator that the existing transition already intended to create.

`cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts` defers submodel initialization while mesh, skeleton or root is missing, keeping that incomplete model disabled. Completing or replacing a live skeleton/root binding validates first, then rebuilds native submodels and reattaches their descriptors/macros to the current joint buffers. Previously root→mesh→skeleton in an already active scene attempted to dereference a null joint-buffer index; later bindings could also retain descriptors for replaced buffers. This preserves automatic animation association and native renderer types.

`cocos/3d/assets/mesh.ts` invalidates bone bounds on reset, dynamic submesh writes and asset destruction. The cache uses weak skeleton identity and the full bindpose values; a cached or colliding skeleton hash cannot hide bindpose mutation. Unchanged data still reuses the same bounds. Weighted joints and attribute data are validated before calculation, with resource/primitive/vertex/influence context and explicit correction instructions; zero-weight joints are ignored and legitimately unused joints retain null bounds. Rejected calculations never enter the cache. This does not automatically rebind an already active renderer or invalidate other animation pools when application code mutates assets in place; bind/rebuild those assets explicitly.

## Spark XR 范围收窄 deviation（SPK-10 边界登记，2026-10-11）

- **相对上游 export 表的收窄**：Spark 2.3.1 冻结源码按 §Spark 冻结上游源码 全树原样落位，但其 XR 家族**裁定不进**生成的运行时子图，
  也**不进**公开 `./spark` 导出面。排除集逐项：上游侧 `vendor/spark/src/SparkXr.ts`（24 879 B）与 `vendor/spark/src/hands.ts`
  （13 752 B；`XrHands`/`Hand`/`Hands`/`HandMovement`/`JointEnum` 等手部追踪符号）；移植件自有的 `CocosXrManager`（13 566 B）与
  `updateStereoUnionCamera` **未搬运**，移植件仓侧的 XR 验收件（xr-contract.mjs、xr-gfx-probe.html、run-xr-gfx-probe.cjs）
  与 `accept` 的 `xr-cpu`/`native-xr` 条目亦不复刻。这是相对上游导出表的**真实收窄**，不是改名：
  原先期待 `SparkXr` 或 XR 手部控制器的代码不会解析成功。
  **该排除的机制与不可达证明属 SPK-11/12 交付面**；在接线后复跑 dep-graph 之前，本节是裁定而非已验证事实，实测状态见
  §Spark 发运边界与接线状态。
- **理由**：AIR 没有 XR 会话层——不创建 `XRSession`，也不实现会话能力面。上游 `SparkXr.ts:292/295/298/358/557` 所需的
  `setReferenceSpaceType` / `setFoveation` / `setFramebufferScaleFactor` / `setSession` / `getReferenceSpace` 在本仓无对应实现。
- **刻意保留的惰性 `renderer.xr` 外壳**：冻结本体在渲染路径中**无条件**读取 `renderer.xr.*`，因此**不能**删掉渲染门面上的 `xr` 字段。
  排除 `SparkXr.ts` 后对 `vendor/spark/src/**` 实测的读取站点（台账 SPK-10 记录的计数：`.xr.enabled` 11 处、`.xr.isPresenting` 2 处、
  `.xr.getSession` 1 处、`.xr.getCamera` 1 处）：
  - `enabled` —— `vendor/spark/src/SparkRenderer.ts:1849`，另 `vendor/spark/src/PackedSplats.ts:825/839`、
    `vendor/spark/src/SplatAccumulator.ts:191/211`、`vendor/spark/src/Readback.ts:142/156`
  - `isPresenting` —— `vendor/spark/src/SparkRenderer.ts:773-774`（`onBeforeRender` 的 `preUpdate` / `useCamera` 分支选择）
  - `getCamera()` —— `vendor/spark/src/SparkRenderer.ts:775`
  - `getSession()` —— `vendor/spark/src/SparkRenderer.ts:813`（`renderSize` 回退）

  故 `src/air/spark/cocos-renderer.ts` 保留一个恒为空闲的外壳（`inertXr`，该文件 `:86-99`，经 `public xr` 挂到门面的字段，
  值为 `enabled:false` / `isPresenting:false` / `getSession():null` / `getCamera():null` / `setAnimationLoop():noop`），
  使冻结代码短路到非 XR 分支；外壳不实现任何会话能力，其归属按计划 §SPK-10／§SPK-05a 的类别记为 `removed:SPK-10`
  （登记时点该常量在本文件为模块私有，不在导出成员面上，因此 `npm run verify:spark-adapter` 的 `removed` 计数为 0）。
  `setAnimationLoop` 在冻结渲染路径外无读取点，由本文件的同名转发承接。移植件 `CocosRenderer.js` 的 XR 拆除链
  （`new CocosXrManager(this)`、构造期 `sessionstart`/`sessionend` 监听、`dispose()` 内的 `this.xr.dispose()`）已删除。

- **复议条件**：本仓引入原生 WebXR 会话管理器。恢复路径为在该会话层之上重建 AIR 的 XR 管理器，并解除 `SparkXr`/`hands` 的
  子图与公开导出排除。执行事实、对账命令与残余事项见 `ai/ledgers/spark-integration.md` 的 SPK-07／SPK-10 条目；
  读者向的消费边界见 [Spark 可选入口边界](reference/spark-optional-entry.md)。

## Spark 数学层逐位残差 deviation（SPK-04 边界登记，2026-10-12）—— **OPEN**

- **相对 oracle 的残差事实**（`docs/evidence/spark/spk04-math-parity-20261012-camera-shim.json`，以真 three 为 oracle、1000 次同种子迭代）：
  22 001 项检查 / 152 003 个 float32 分量，`toleranceViolations 0`（容差按移植件原值 2e-10、project 1e-8，**未放宽**），最大绝对误差 `1.53e-11`；
  但**逐位**口径不成立：`float32BitMismatches 2110`，拆成两类：
  - **真实位差 605** —— `parented lookAt matrix` 602、`Euler from quaternion` 3。把四元数输入统一换成 oracle 值的 isolated 趟**不归零**
    （`maxError` 分别 `1.33e-15` / `1.26e-13`），故是独立根因而非传染；对应 `cc.math` 的 Mat4 组合/取逆口径（视图基约定）与 three
    世界基约定在 3×3 交叉项上的不同舍入路径，以及 `Euler.setFromQuaternion` 的分支选择差。
  - **仅 ±0 符号零 1505** —— `projection inverse` 1000、`inverse` 505。数值相等，只有 `-0` 与 `+0` 的位模式差。
- **为什么本仓不消掉它**：计划 §1.3 与 §SPK-04 要求数学一律优先复用引擎既有实现，适配层只允许形状与命名适配。要让上述两条逐位一致，
  必须放弃 `cc.math` 委托、在 `src/air/spark/spark-math.ts` 内重写矩阵组合/取逆与欧拉转换的算法主体，与复用纪律直接冲突。
  因此本条按 deviation 登记，而不是靠放宽容差或静默通过。
- **影响面（有像素证据）**：残差量级 ≤ `1.5e-11` 且落在容差内，未改变任何一次输出——`spk13-pixel-parity-20261012.json`（6 场景）
  与两批画布矩阵（`spk13-pixel-parity-viewport-matrix-20261012.json` 60 行、`spk13-pixel-parity-viewport-matrix-extended-20261012.json`
  36 行，含分数 DPR 1.5 与 DPR 3；第二批补采 Windows 缩放档 1.25/1.375 后该文件为 72 行）全部 `channelMismatch=0`。
- **复议条件（已行使并回退）**：本条自设的复议条件为「owner 裁定『与 three 逐位对齐』优先于 §1.3 复用纪律」。该路径曾于 2026-10-12 被行使
  （6 个成员改自持抄 three r180 次序、判据收紧到 `float32BitMismatches == 0`），但为与 owner「复用 cocosair 元素、不重造轮子」指令一致，
  **2026-10-13 已回退**为全量 `cc.*` 委托（见文末「回退记录」）。因此本条**恢复为 OPEN**：残差事实即上列数字，处置结论是「按 §1.3 接受」。
  执行事实与残余事项见 `ai/ledgers/spark-integration.md` 的 SPK-04 条目。

### 回退记录（2026-10-13，恢复 §1.3 复用纪律）

- **背景（事实保留）**：2026-10-12 曾按「与 three 逐位对齐优先」实施过一版：`src/air/spark/spark-math.ts` 的 6 个成员
  （`Matrix4.invert` / `lookAt` / `compose` / `multiplyMatrices` / `makeRotationFromQuaternion`、`Quaternion.setFromRotationMatrix`）
  改为自持并逐成员抄 three r180 的运算次序，判据收紧到 `float32BitMismatches == 0`，实测四项计数全零、verdict `PASS`
  （`docs/evidence/spark/spk04-math-parity-20261012-bitexact.json`）。该版引入了 three 派生代码，登记见当时的
  `docs/THIRD_PARTY_LICENSES.md` §10 与 `licenses/LICENSE_three.txt`。
- **回退依据**：owner 指令「复用 cocosair 元素，不重造轮子」。上述自持与本条 deviation 首版列出的「为什么本仓不消掉它」正面冲突——
  引擎已有的算法不应在 AIR 侧重写。故 2026-10-13 把 6 个成员**全部改回委托**：
  `cc.Mat4.invert` / `cc.Mat4.lookAt`（+ `cc.Mat4.transpose` 转置映射与齐次列置零）/ `cc.Mat4.fromSRT` / `cc.Mat4.multiply` /
  `cc.Mat4.fromQuat` / `cc.Quat.fromMat3`（经 `cc.Mat3.fromMat4` 降阶），并删除 `Matrix4.makeRotationFromQuaternion` 的
  `compose(单位平移, q, 单位缩放)` 转发与两个模块级单位向量常量。
- **回退后的实测**（门禁 `tools/verify/spark-math-parity.cjs`，同种子 `0x5a17c0c0`、1000 迭代、当前 `spark-math.ts`）：
  `totalChecks 22001 / float32Components 152003 / toleranceViolations 0 / maxAbsoluteError 1.53e-11`，
  `float32BitMismatches 2110`（真实位差 605 + 仅 ±0 符号零 1505），**与 2026-10-12 首版逐项一致**，verdict `PARTIAL`（退出码 1）——
  即回到 deviation 原始状态，未伪造通过。`npm run verify:spark-adapter` 中 `spark-math.ts` 分类恢复 `cc 11 / none 8`、
  成员级标注 **0**、`findings: []`。
- **派生登记随之撤销**：`spark-math.ts` 不再含 three r180 抄写主体，`docs/THIRD_PARTY_LICENSES.md` §10 改为「已撤销」并由
  `tools/verify/verify-licenses.cjs` 删除对应 REGISTRY 条目、`licenses/LICENSE_three.txt` 删除（`npm run verify:licenses` 实测
  13 项登记 / 0 FAIL / 1 ATTENTION＝既存 spark-rs crate `pending`）。
- **反向复议条件**：owner 若改取「与 three 逐位对齐」，恢复路径见本条正文「复议条件」——把 6 个成员改回自持、判据收紧到
  `float32BitMismatches == 0`，并重新登记 three 派生许可。执行事实与残余事项见 `ai/ledgers/spark-integration.md` 的 SPK-04 条目。

## Spark 冻结上游源码（SPK-03 身份登记，2026-10-11 落位）

Spark 是本项目除 `cocos4` 之外的**第二个上游**，按只读冻结源码落位，口径与 §基线标识 的 cocos4 基线分开登记：

| 项                  | 值                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream package    | `@sparkjsdev/spark`                                                                                                                        |
| Upstream version    | `2.3.1`                                                                                                                                    |
| Upstream repository | https://github.com/sparkjsdev/spark                                                                                                        |
| Frozen commit       | `c57ebb936a5d364e021a66a118204d599f6fdaa8`                                                                                                 |
| Dist source commit  | `699e3ad06ef78fe7f5f4375f705ef4d17c948993`（上游 dist 提交；与冻结提交的 `src`/`rust` 树等价，差异仅 `dist/commit.txt`）                   |
| Git tree（`src`）   | `e28ecaf12054536738814356db41a44afd1df999`                                                                                                 |
| Git tree（`rust`）  | `23e1a2a05c28c625dfae7e28eeeb9aafbdec151b`                                                                                                 |
| License / 版权      | MIT；© 2025 WORLD LABS TECHNOLOGIES, INC.                                                                                                  |
| 落位根              | `vendor/spark/`（105 文件：`src` 60 = 52 个 `.ts` + 8 个 `.glsl`；`rust` 40 = 29 个 `.rs` + 11 个 Cargo/脚本/说明；根 5 个身份与许可文件） |
| 树指纹              | `b511e63e5e800ffc700b6521b387bd11830c795860404dd3abe480fc27cb0b44`（对排序后的 `"<fileSha256>  <path>"` 行取 SHA-256）                     |
| 抽取日期            | 2026-10-11                                                                                                                                 |
| 门禁                | `node tools/build/vendor-spark-tree.cjs --check`（逐文件 SHA-256 + 未登记文件检出 + 许可原文比对 + git 子树交叉核验）                      |
| 清单                | `docs/evidence/spark/vendor-spark-tree-20261011.json`                                                                                      |
| 第三方登记          | `docs/THIRD_PARTY_LICENSES.md` §8、`licenses/LICENSE_spark.txt`、`tools/verify/verify-licenses.cjs` REGISTRY                               |

不落位的上游内容（`.git`、`.github`、`node_modules`、`dist`、`test`、`scripts`、`package-lock.json`、格式化器/站点外壳等 15 项）连同理由记在清单的
`excluded[]`；**不搬运预构建 bundle，也不搬运补丁层**（目标改为源码，见 `ai/plans/spark-integration.md` §1.3）。

冻结提交号无法从本地来源目录就地再导出（该目录无 `.git`、无 `commit.txt`），故身份绑定改由上表的 git 子树号对账完成，
且**未**从 GitHub 重新取源独立复核；该限定条件同样记录在 `ai/ledgers/spark-integration.md`。

## Spark WASM 与 glue 的 provenance（SPK-11 资产，2026-10-11）

| 项              | 值                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 资产            | `spark_rs_bg.wasm`（1 554 721 B）+ `spark_rs.js`（wasm-bindgen glue，47 694 B）                                                                                                                                                                                                                                                                                                                                                                                         |
| SHA-256（wasm） | `974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7`                                                                                                                                                                                                                                                                                                                                                                                                      |
| SHA-256（glue） | `a4b2cc7226f2e4c9bf397b56da3520e6c6f7d65b55e486783ef9bffac3b4bf72`                                                                                                                                                                                                                                                                                                                                                                                                      |
| 来源            | 上游 `@sparkjsdev/spark` 2.3.1 冻结提交 `c57ebb93…` 对应的 **dist 发行件**（`699e3ad0…`），其 Rust 侧源码逐字节镜像在本仓 `vendor/spark/rust/`（tree `23e1a2a0…`）                                                                                                                                                                                                                                                                                                      |
| 构建方式        | **源等价发行件：未在本环境用 Rust 重建。**本仓未执行 `vendor/spark/rust/build_rust_wasm.sh`，也未对重建产物做过任何取证（`cargo` 本身在 PATH 中存在，但「工具链可用」不等于「本仓已重建」），产物字节直接取自上游发行件，与冻结 `rust/` 源码树同源                                                                                                                                                                                                                      |
| 落位与发运形态  | **审计资产在 `vendor/spark-rs/`**（`MANIFEST.md` 逐文件 bytes + sha256 + 来源/版本行），构建期由 `tools/build/spark-runtime-tree.cjs` 把冻结 `vendor/spark/src/wasm.ts` 的 `spark_rs_bg.wasm?arraybuffer&base64` 说明符解析到该目录并**以 base64 内联进可选 `spark` 变体产物**；**不引入运行时 fetch**，`build/spark-rs/` 独立资产目录**不存在**（2026-10-12 实测订正；与 `build/gltf-decoders/` 先例的这条差异已登记为 Deviation-07 的 WASM 边界，原因与复议条件同节） |
| 默认产物边界    | **默认**产物（`build/cocosair.module.js`、`.min.js` 及两者 `.map`）内不得出现 WASM magic `00 61 73 6d`，也不得出现 `spark_rs_bg.wasm` / `SparkRenderer` / `SplatMesh` / `sparkjsdev` / `fflate` 字样                                                                                                                                                                                                                                                                    |
| 审计            | `npm run verify:spark-assets`（`tools/verify/spark-assets.cjs`，SPK-11 交付，decoder-audit 同族）：`vendor/spark-rs` 与 `build/fflate` 清单双向对账（bytes+sha256）、许可原文与来源逐字节一致、默认产物隔离、以及内嵌反漂移——从变体生成运行时 `src/air/spark/generated/spark-runtime.js` 提取最长 base64 字面量解码后，其 sha256/长度/字节必须等于清单里的 `spark_rs_bg.wasm`。实测 `passed=true artifacts=12 failures=0`                                               |
| 发布面          | 变体产物**未**列入 `package.json` `files[]`，即不随 npm 包发布；许可链闭合前（`docs/license-decisions.json` 的 spark-rs 条目 = `pending`）不得作为 release 交付物                                                                                                                                                                                                                                                                                                       |
| 部署责任        | 当前形态下应用无需托管 WASM（字节已在 spark 变体 bundle 内）；若将来改为 decoder 式托管，须同步改写本节并重采全部证据                                                                                                                                                                                                                                                                                                                                                   |

替换条件（任一变化都必须重采身份）：本环境实际执行 `vendor/spark/rust/build_rust_wasm.sh` 重建产物、上游发布新的 `spark-rs` 版本、
或 glue 的 wasm-bindgen 生成形态改变。届时须更新本表的 SHA-256、`MANIFEST.md` 行、`docs/evidence/spark/` 清单与 `npm run verify:decoders` 同族审计，
不得沿用旧 SHA 声称「已重建」。任何文档都不得把本资产写成「本仓用 Rust 编译产生」。

## Spark 发运边界与接线状态（SPK-11/12，登记于 2026-10-11，接线后于 2026-10-12 全量复采）

当前可验证事实（本文件登记时点实测）：

- `vendor/spark/` 冻结树 `--check` 逐字节一致（exit 0，树指纹 `b511e63e…`）；`src/air/spark/` 五个适配层文件已落位并在
  `docs/upstream-file-map.json` 登记（`upstreamPath: null` + `baseline: "AIR Spark integration"`，按计划 §SPK-05a 硬约束 2），且未出现在
  根导出面的引用里（**2026-10-12 复跑实测**：`src/exports/air.ts`、`src/air/index.ts`、`src/exports/base.ts` 三个 barrel 内
  `spark` 字样各为 0 处；`src/cc.config.json` 现有 2 处，那是可选 feature unit 的**声明**而非导出，见下条）；
  `npm run verify:spark-adapter` 的 `rootExportLeakage` 为空。**SPK-14 复跑更新（2026-10-12）**：该门禁此前登记为整体 exit 1
  （适配层成员 `@air-element` 注解核对未过），现实测为 **exit 0 / `passed: true` / `findings: []`**，五个文件全部纳入检查面
  （`exportedMembers=150 / annotatedMembers=150 / reExportStars=1`，分类 `cc 11 / gfx 1 / none 138 / removed 0`）；
  `rootExportLeakage` 仍为空。
- **登记形态的当前偏差（registrar 侧）—— 2026-10-12 已闭合**：SPK-14 首轮复跑时 `docs/upstream-file-map.json` 的 `src/air/spark/**`
  五行一度实测为 `upstreamPath: "air/spark/<file>"` + `baseline: "cocos4 @ 4.0.0-alpha.34 …"`，与计划 §SPK-05a 硬约束 2 要求的
  `upstreamPath: null` + `baseline: "AIR Spark integration"` 不符，那一轮 `verify:file-map` 报 486 项 FAIL。
  复跑当日该文件已由 registrar 回落到位，且新增第六行 `src/exports/spark.ts`（同为 `upstreamPath: null` + AIR Spark integration +
  `modified: true` + reason，实测见该文件 `:9792-9833`）；当前 `npm run verify:file-map` 为 **PASS，exit 0**
  （`rows=1403 / scanned=1342 / manifest=1283`）。
- 默认 bundle 闭包内 spark 节点数为 **0**，接线后复采仍为 **0**（默认 26 feature 集 1152 可达 / 1379 扫描；`AIR_FEATURES=air` 为 1103 可达；
  接线后证据 `docs/evidence/spark/spk12-bundle-boundary-wired-20261012.json`，接线前基线 `bundle-boundary-20261011.json`），
  默认产物内不含 `SparkRenderer` / `sparkjsdev` / `spark` 指纹（`npm run verify:licenses` 与 `npm run verify:spark-assets` 的负向断言均 exit 0；
  `grep -c -o spark build/cocosair.module.js` 为 0），且 dev 产物字节数仍为 6 649 186 B、min 产物 SHA 仍为 `779c288e…`（与基线一致）。
  dev 产物的 SHA 本身**不**作为对账项：SPK-14 复跑时该产物内嵌 `AIR_BUILD_NUMBER` 已递增到 51（`tools/build/build-number.json` 实测），
  与 SPK-00 快照的 23 不同，改的只是该数字字面量；min 产物实测仍为 `779c288e…` / 3 713 427 B。
- **接线状态（SPK-11/SPK-12 已于 2026-10-12 落地，原「尚未成立」段落转为实测）**：`src/cc.config.json` `:100` 起声明 `spark`
  feature unit；`src/exports/spark.ts` 存在并被 `npm run verify:feature-exports` 认作 air-only unit
  （`airOnly: ["air","spark"]`，`ok: true`、`errorCount: 0`、exit 0）；`package.json` 有 `verify:spark-assets` 脚本，
  但**没有** `./spark` 子路径导出与 `files` 条目，`build/spark-rs/` **不存在**（被内联形态取代，见上两条）。
  接线后体积边界已重采（`docs/evidence/spark/spk12-bundle-boundary-wired-20261012.json`）：默认 26 feature 集
  扫描 1379 / 可达 **1152**，其中 **spark 可达节点 0**（8 个 spark 文件全在 UNREACHABLE）；点名 `,spark` 的 27 feature 集
  可达 1159（+7，`spark-runtime.d.ts` 为类型文件不入运行时闭包）。变体产物 `cocosair.module.spark.js（旧整合产物，已退役）`
  9 461 302 B（`689c29100803ad10…`），生成运行时 `src/air/spark/generated/spark-runtime.js` 2 753 054 B（`751f7a284cd1e9df…`）。
  默认 min 产物仍为 3 713 427 B / `779c288e…`，与接线前基线逐字节一致。
- **XR 排除的不可达证明（此前为裁定，现为实测）**：生成后的运行时子图 `src/air/spark/generated/spark-runtime.js` 内
  `SparkXr` / `XrHands` / `vendor/spark/src/hands` 命中数各为 **0**，变体产物 `cocosair.module.spark.js（旧整合产物，已退役）` 内 `SparkXr` 命中 **0**；
  `vendor/spark/src/SparkXr.ts`、`hands.ts` 原文仍在冻结树内（`--check` exit 0），只是不被子图引用。
  `src/air/spark/cocos-renderer.ts` 的惰性 `inertXr` 外壳按 §Spark XR 范围收窄 deviation 保留。
- 消费边界、外部资产部署责任与「未重建」提示的读者向登记见
  [Spark 可选入口边界](reference/spark-optional-entry.md) 与 [Spark 运行资产来源](notes/spark-asset-sourcing.md)。

不改变的发运纪律：不修改 `vendor/spark/**` 的任何字节；不把 Three.js 运行库引回目标运行时；
`three` specifier 只在构建期别名到 `src/air/spark/spark-api-adapter.ts`，运行时不存在 `three` 依赖。

### Spark 模块拆分（2026-10-15）

旧整合版 cocosair.module.spark.js 由独立 spark.module.js 替代。AIR 自有桥接层通过 src/air/spark/engine.ts 借用主入口的数学/几何值；可选构建将主引擎标记 external，并以 metafile 拒绝打包 Cocos/PAL 实现。没有改动冻结 vendor/spark、spark-rs 或引擎源码；保留 XR 排除、WASM 内联及未决转付许可边界。独立模块的生成声明引用主 SDK，sparkRuntime 原有 any 边界不变。
