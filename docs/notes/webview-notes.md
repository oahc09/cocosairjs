# WebView 行为调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

对象：`examples/webview-basic`（计划书 A4：iframe 挂载/卸载、事件、与 UI 事件穿透行为）。
断言位置：`tools/verify/browser-matrix-contract.json` 第 10 行 `webview-basic`（组 LV12-05，三引擎，108 条 `probeEquals` + 12 条 `probeNonEmpty` + 10 条 `probePresent`，`waitMs 12000`、`click 240,166`、`afterClickMs 3000`、`minPngBytes 15000`、`frameChanged true`）。
本笔记每条引擎行为结论都附「实测命令 + JSON 产物路径」；未附的即「待核」，不作为结论使用。
诊断证据目录：`E:/AIProMax/cocosair-scratch/v12-diag/`（仓库外 scratch，逐条列在第 9 节）。

## 1. web 端 WebView 是 DOM overlay，没有输入穿透开关

`WebViewImplWeb.createWebView()` 往 `game.container`（即 `#Cocos3dGameContainer`）追加
`div#webview-wrapper > iframe#webview`（`src/cocos/web-view/web-view-impl-web.ts:71-94`），
网页像素**不进 WebGL 帧缓冲**；`syncMatrix()` 每帧把节点世界矩阵写成 wrapper 的 CSS `matrix()`。
引擎侧不做任何命中屏蔽，也没有 `stayOnBottom`/穿透开关之类的能力位。

实测（三引擎一致，矩阵真实点击落在 iframe 中心 `240,166`）：
`live.iframeClicks '1'`、`live.iframeClicksDataset '1'`（页面自己的 click 监听计数），
而 `live.engineTouchEvents 0`、`live.canvasDomClicks 0` ⇒ 点进 iframe 的那一下引擎与画布都收不到。
`enabled=false` 只是 `wrapper.style.visibility='hidden'`，之后 `document.elementFromPoint` 从 `IFRAME` 变 `CANVAS`
（`p5HitTest.hitWhenEnabled/hitWhenDisabled`）——这就是 web 端唯一的「让点击回到引擎」手段。

## 2. `error` 事件与网络无关：它嗅探的是页面正文里的「404」字样

`_bindDomEvent()` 只在 `load` 之后判断 `iframe.contentDocument.body.innerHTML.includes('404')`
（`web-view-impl-web.ts:45-59`），命中就 `dispatchEvent(ERROR, body.innerHTML)`。两条推论都已在三引擎实测：

- **正文含「404」的 200 页面必报 error**：示例用同源 `assets/page-error-like.html`（HTTP 200，正文含 404 文案）
  确定性地触发，实测 `errorWithinMs 21/39/32 ms`、`errorEvents 1`、`stateAfterError 'error'`、
  `urlAfterError './assets/page-error-like.html'`，且矩阵全程 `failedRequests []`（零 >=400 响应）。
- **真 404 页面若不写「404」字样就不报**：无法用真失败请求取证——矩阵 harness 把任何 `status>=400`
  记为失败请求并判红（`tools/verify/browser-matrix.cjs:97`）。所以本例的 error 分支刻意走正文嗅探。

恢复语义：切回正常页后 `recoveredState 'loaded'`，`businessSequenceAfterRecover
'loading,loaded,loading,loaded,error,loading,loaded'`（事件序列本身即三态机跑通的证据）。

## 3. `__preload` 无条件 `loadURL(this._url)`，而默认 `_url` 是外网

`web-view.ts:50` 的默认值是 `'https://cocos.com'`，`web-view.ts:172-178` 的 `__preload` 末尾无条件
`this._impl.loadURL(this._url)`。又因为 `new Node()` 的 `_active` 默认为 `true`，只要
`addComponent(WebView)` 后直接 `addChild` 进 active 父节点，`__preload` 当场就跑——
第一次 `loadURL` 打的是默认外网地址（诊断 r1 实测 `stateBeforeActivate 'loading'`、`wrappersAtMount 1`）。
矩阵对失败请求零容忍，外网域名在 CI/离线环境必红。

正确顺序（示例实现，实测 r2 起三引擎一致）：inactive 建节点 → `addComponent(WebView)` → 设 `url`
→ 注册 `Node.on` 监听与 `webviewEvents` → `addChild` → `active=true`。
判据：`stateBeforeActivate 'none'`、`wrappersAtMount 0`、`loadingWithinMs 0`、
`urlGetter './assets/page.html'`、`iframeSrcHasNoExternalHost true`、`failedRequests []`。

注意：**监听必须早于 `addChild`**。r1 把 `Node.on` 注册放在 `addChild` 之后，结果 `loading` 事件已经发完，
`businessSequence` 只剩 `'loaded'`；改到 `addChild` 之前才拿到完整的 `'loading,loaded'`。

## 4. `state` 只在事件名已注册进 `componentEventList` 时才变化；`onError` 参数是双层数组

`WebViewImpl.dispatchEvent` 先查 `componentEventList`，命中才 `_state = key`
（`web-view-impl.ts:98-104`）；这张表由 `__preload` 装 LOADING/LOADED/ERROR 三行。
⇒ 未注册时 `state` 永远停在 `none`（默认值），`stateSequence` 本身就是回调链跑通的证据：
实测 `stateSequence 'loading,loaded'`、`rawEventLogHead 'cb:loading,loading,cb:loaded,loaded'`
（EventHandler 的 `cb:` 行与 `Node.on` 行交错）、`eventListKeys 'has-events'`。

参数形状不对称：`onLoading/onLoaded` 只 `emit(type, this)`，`onError(...args)` 经
`dispatchEvent` 的 `callback.call(this, args)` 把 rest 参数当单参数转发 ⇒ `error` 监听第二参是
`[[innerHTML]]`。实测 `errorArgIsArray true`、`errorArgMentions404 true`、`errorArgLen 264`
（三引擎都 264 = 该页 `innerHTML` 字节数；它是正文长度而非 API 语义，故契约只作非空断言）。
断言按真实形状写，不按文档签名写。

## 5. wrapper 的几何不是「挂载即到位」——第一帧读到的是 iframe 内在盒

`__preload` 只负责把 wrapper `append` 进 container，CSS `transform/width/height` 要等第一次
`update → syncMatrix` 才写入。在那之前读 wrapper 拿到的是**未显式定尺寸 `<iframe>` 的内在盒
300×154**，其中心是页面坐标 `(150,281)` 而非节点中心 `(240,166)`。
契约 r3 的 chromium 记录就是这样判红的：`p9Unload.finalCenter '150,281'`、`hitAfterRebuild 'CANVAS'`
（证据 `matrix-webview-contract-r3.json`）；webkit 在 r2 也单独暴露过 `wrapperOffsetWH '300x154'`。
这是**探针取证时序缺陷，不是引擎缺陷**。

修法：任何几何/命中断言前先轮询 `wrapper.style.width` 到目标值（示例的 `waitMatrixSize()`），
再 `nextFrames(2)` 让 `syncMatrix` 的矩阵缓存落定。实测 `p1Mount.matrixSizeWithinMs 107/0/0 ms`、
`p9Unload.matrixSizeWithinMs 0/0/0 ms`，等到位后 `wrapperOffsetWH` 三引擎一致为 `'200x150'`（已升为 `probeEquals`）。

同类取证陷阱：`frameChanged` 采样的是 WebGL 画布，iframe 内的动画不能为它背书 ⇒ 示例用 `Graphics`
扫描条（画布内、每 2400 ms 横扫）保证三引擎都有帧间变化，iframe 是否真出页由 probe 的
`sameOriginDoc/pageName/titleNow/iframeClicks` 独立回读。

## 6. `evaluateJS` 的失败路径有双副作用，因此不进示例

`WebViewImplWeb.evaluateJS` 对 `win.eval` 的 catch 里**既** `dispatchEvent(WebViewEventType.ERROR, e)`
**又** `error(e)`（`web-view-impl-web.ts:116-128`）⇒ 一条写坏的注入脚本会同时污染 error 事件通道、
把 `state` 改写成 `error`，并留下一条 `console.error`。矩阵的 `noConsoleError` 会直接判死，
所以示例只做成功注入（标题 / 全局量 / dataset 三处回读：`titleAfter 'AIR-EVAL-42'`、`stampAfter '99'`、
`datasetAfter 'injected'`、`sameOriginDoc true`）。

失败路径单次取证（三引擎，命令与产物）：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules \
  node E:/AIProMax/cocosair-scratch/v12-diag/diag-evaljs-failure.cjs
→ E:/AIProMax/cocosair-scratch/v12-diag/evaljs-failure-probe.json（completed:true）
```

实测三引擎完全一致：`stateBefore 'loaded'` → `stateAfterBadEvalJS 'error'`，
事件尾部新增 `['cb:error','error']`，`newConsoleErrors` 各 1 条（chromium
`ReferenceError: notDefinedAnywhere is not defined`、firefox `JSHandle@object`、
webkit `Can't find variable: notDefinedAnywhere`——文案按引擎，条数一致），
`evaluateJSThrewInPage null`（错误被吞在 impl 内，页面对调用方不抛）。
基线另有 1 条 `console.error`：`[Physics] PhysicsSystem initDefaultMaterial()`，
是全部示例共有的良性日志（矩阵 `BENIGN_CONSOLE` 白名单，见 `tools/verify/browser-matrix.cjs:38`）。

⚠️ 该取证脚本的静态服务器 `REPO` 必须写成 `path.resolve(...)` 形式：`path.join` 产出反斜杠路径，
若用正斜杠字面量做 `file.startsWith(REPO)` 越界检查，会**把所有请求判成 404** 而页面看起来只是「没起来」
（本次即在此处绕了一圈，`dbg-webview-serve.cjs` 的 `RESP 404` 是定位证据）。

## 7. `WebViewImpl._loaded` 在 web-view 模块内永为 `false`（静态证据）

`src/cocos/web-view/web-view-impl.ts` 只在 :39 声明、:66 与 :110 复位，从不置 true；
`get loaded()`（:90）在本模块无任何调用方。对比 `video-player`：`video-player-impl.ts:153` 会
`this._loaded = true`，且 `video-player.ts:411` 读它决定是否自动播放。
⇒ WebView 的「loaded」语义完全由 `state`/事件承载，`_loaded` 是上游遗留死标志。

静态证据命令（不依赖运行期）：`grep -rn "_loaded\|\.loaded" src/cocos/web-view/`。
本次未做运行期取证（组件层根本没暴露该 getter），故只作为上游行为记录，不登记为缺陷。

## 8. 逐引擎差异（禁入 `probeEquals`，只做 `probePresent`/非空）

| 键 | chromium | firefox | webkit | 处置 |
| --- | --- | --- | --- | --- |
| `p1Mount.styleOrigin` | `'0px 100% 0px'` | `'0px 100% 0px'` | `'0px 100%'` | `probePresent`（CSS 序列化差异） |
| `p1Mount.iframeStyleBorder` | `''` | `'medium'` | `'medium'` | `probePresent`（`border:none` 的读回差异） |
| `p1Mount.loadingWithinMs` | 0 | 0 | 0 | `probePresent`（值为 0，不能进非空断言） |
| `p1Mount.loadedWithinMs` | 24 → **287** | 175 → **114** | 82 → **46** | `probePresent` |
| `p1Mount.matrixSizeWithinMs` | 107 → **0** | 0 → **0** | 0 → **150** | `probePresent` |
| `p9Unload.matrixSizeWithinMs` | 0 → **0** | 0 → **1** | 0 → **0** | `probePresent` |
| `p6ErrorBranch.errorWithinMs` | 21 → **46** | 39 → **250** | 32 → **62** | `probePresent` |
| `p9Unload.reloadedWithinMs` | 22 → **21** | 23 → **41** | 30 → **58** | `probePresent` |
| `results.sequenceMs` | 739 → **1075** | 866 → **1153** | 902 → **1817** | `probePresent` |
| `live.elapsedMs` | 15106 → **15529** | 15353 → **15389** | 15284 → **15987** | `probePresent` |

「r5 诊断轮 → **r38 正式全量轮**」两列并排是刻意的：上面这些 `*WithinMs`/`sequenceMs`/`elapsedMs`
是挂钟量，逐轮浮动（`loadedWithinMs` 同一引擎两轮差一个数量级），所以只作存在性断言；
示例规格正文里引用的三斜杠数字已按 **r38** 全量捕获刷新。
真正逐引擎**语义**差异只有前两行（CSS 序列化），其余全是计时。

截图字节下界按 `minPngBytes 15000` 统一把关；r38 实测 31907 / 30226 / 26156
（sha256_16 `aa6cea0723c22309` / `5d2ff10aaec0916b` / `5980e104472806b0`），r5 为 31982 / 30091 / 25860，
均在界上。`eventLog.<i>` 全序列按 `probeEquals` 断言会绑死顺序，因此只取 `rawEventLogHead`/`businessSequence`
等结构性键，`eventLog` 容器作非空断言。

## 9. 证据清单（诊断轮次 → 结论）

| 产物（scratch `v12-diag/`） | 内容 |
| --- | --- |
| `matrix-webview-diag-r1.json` | 3/3 PASS 但暴露 4 处探针缺陷（监听晚于 `addChild`、节点从未真正 inactive、`phase` 死字段） |
| `matrix-webview-diag-r2.json` | 修复后 3/3 PASS；webkit 单独暴露 `wrapperOffsetWH '300x154'`；契约 `probeEquals` 由 `probe-cross.cjs` + `gen-contract-webview.cjs` 从此文件派生 |
| `matrix-webview-contract-r3.json` | chromium FAIL（`finalCenter '150,281'`）⇒ 第 5 节结论的直接证据 |
| `matrix-webview-diag-r4.json` | 加 `waitMatrixSize()` 后 3/3 PASS |
| `matrix-webview-diag-r5.json` | 最终契约（108/12/10）下 3/3 PASS、`completed:true` |
| `evaljs-failure-probe.json` | 第 6 节 `evaluateJS` 失败路径三引擎取证，`completed:true` |
| `dbg-webview-serve.cjs` | 第 6 节末尾的 404 归因（正斜杠 `REPO` 字面量） |
| `snapshot-matrix-27rec/` | 追加第 10 行契约**之前**的 27 记录矩阵捕获逐字节快照（`sha256.txt` 35 个文件），用于对照「指纹失效是契约变更所致，不是回归」 |
| `matrix-full-r38.log` | 第一次全量 10×3：**29/30，`completed=false`**（`video-basic/webkit` 的 `p8Loop.wrappedBelowSeekTarget`）⇒ 见 `docs/notes/video-notes.md` §6 与 **F-107** |
| `matrix-full-r38b.log` | 修 `video-basic` 探针后的权威全量轮：**30/30 PASS、`completed=true`、`subset=false`**，`contractFingerprint 8d259554c3759cbc`，绑定 bundle `35496aebda066ab5`（6,081,668 B），measuredAt `2026-09-22T12:41:10Z` |

正式三引擎矩阵（10 示例 × 3 引擎 = 30 记录）重跑结果与截图见
`docs/evidence/browser-matrix/browser-matrix.json` 与 `docs/evidence/browser-matrix/webview-basic/matrix-<engine>.png`；
`smoke-30` 会核对 `contractFingerprint`、逐记录 `failedAssertions: []`、png 字节 sha 与全契约覆盖。

规格侧的 r38 收尾链（顺序不可换，否则自伤 `S11-STALE-EVIDENCE`）：刷新正文计时数字 →
`generate-manifest.cjs` → `tools/verify/example-spec-browser.cjs --ids=webview-basic`（脚本在 `tools/verify/`，
不在 `tools/examples/`）→ `spec-validate --strict` `55 frozen / 0 issues` → `spec-compliance-audit` `0 fail / 1 warn`
⇒ `promotion verified 29 / attested 7 / units 36`、`spec 529cf6946419`、`source 9d93e842f1716162`、
`candidate 9fa85f88b968d5f1`；`docs/evidence/examples-verified.json` 为 **50 记录 / 50 PASS**、
`partial=true`、`subset=["webview-basic"]`、`apiProofTotals verified 954 / attested 64 / unproven 0`。
