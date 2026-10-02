# 视频播放行为调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

对象：`examples/video-basic`、`src/cocos/video/**`（cocos4 上游逐字节端口）、`src/cocos/core/platform/screen.ts`、
`src/pal/screen-adapter/web/screen-adapter.js`。

结论全部来自当期可复跑门禁，不采信示例自报：

- 三引擎矩阵：`node tools/verify/browser-matrix.cjs`（契约块 `tools/verify/browser-matrix-contract.json` 的
  `video-basic`，group LV12-04）→ `docs/evidence/browser-matrix/browser-matrix.json` + `docs/evidence/browser-matrix/video-basic/matrix-<engine>.png`。
- 契约断言只取**三引擎逐字节一致**的探针路径：由
  `E:/AIProMax/cocosair-scratch/v12-diag/probe-cross.cjs` 对
  `E:/AIProMax/cocosair-scratch/v12-diag/matrix-video-final-r7.json` 算出 129 条一致路径，
  丢弃 8 条 `eventLog.*`（事件顺序本身不稳定）与 3 条 `*WithinMs` 计时叶子后写入 118 条 `probeEquals`。
- 示例规格链：`tools/examples/spec-evidence.cjs` 的行号定位 + `spec-expectations.cjs apply --ids=video-basic`
  （8 节点 `transform-equals`，其中 5 条源码字面量佐证、3 条注明「未赋值 ⇒ 引擎默认 identity」）+
  `tools/verify/example-spec-browser.cjs --ids=video-basic` PASS 并晋升 stable。

## 1. `stayOnBottom` 的透明合成不是「组件 clear color」

`VideoPlayer.stayOnBottom = true` 只做两件事：`<video>` 的 `style.z-index` 置 `-32768`
（`video-player-impl-web.ts:228-233`），以及把**场景里 batcher2D 的那个相机**的 clearColor alpha
改 0（`syncMatrix`）。这个相机不是 `VideoPlayer` 组件所在的相机：实测
`impl.UICamera === 组件侧 Camera` 为 **false**，两者 `name` 都叫 `UICamera`
（探针 `results.p4Transparency.uiCameraIsComponentCamera` / `uiCameraName`，三引擎一致）。

因此：

- 组件侧 `camera.clearColor.w` 恒为 1，拿它给透明合成背书是错的（第一版就是这么错的）。
  必须读**场景侧**那个相机：`sceneClearAlphaBefore 1 → sceneClearAlphaAfterBottom 0 → 复位回 1`。
- 真正的「看得见视频」证据是 DOM 命中测试翻转：`document.elementFromPoint(点击处)` 由
  `hitBeforeTag VIDEO` 变成 `hitAfterBottomTag CANVAS`（`hitTestFlipped true`）。
- 画布本身要带 alpha，`macro.ENABLE_TRANSPARENT_CANVAS = true` 必须在 `createAirApp` **之前**设置——
  swapchain 只读一次（`src/cocos/renderer/gfx-webgl2/webgl2-swapchain.ts:127/142`）。

## 2. `fullScreenOnAwake` 加载后置真全屏的三段上游缺陷（登记 F-103）

`video-player-impl-web.ts:215-220` 在 clip meta 到位后调用
`screen.requestFullScreen(video, (document) => { … }, () => { this._fullScreenOnAwake = false })`。三段如下
（① 三引擎实测；② 仅 chromium 实测；③ 源码判定 —— 各自口径见条目内）：

1. **`element` 参数被丢弃（三引擎实测）**：`screen.requestFullScreen(element, cb)`（`screen.ts:155-163`）转手调
   `screenAdapter.requestFullScreen()`——web adapter 的该方法**没有形参**，实际请求对象由
   `_ccprivate$_getFullscreenTarget()` 决定，非全屏态返回 `document.body`。
   实测：`document.fullscreenElement` 在 enter 之后是 `BODY`（探针
   `results.p9Fullscreen.during.fsEl === "BODY"`，chromium/firefox/webkit 三条记录一致，已进契约
   `probeEquals`），`<video>` 从未成为全屏元素。
2. **回调零参 vs 形参遮蔽（chromium 实测；firefox/webkit 未在缺陷路径上单独捕获）**：
   `screen.ts:158` 写的是 `onFullScreenChange?.call(document)`——
   `call` 的第二个参数起才是实参，所以回调收到 **0 个参数**；而 `:215` 的回调签名是 `(document) => …`，
   形参把全局 `document` 遮蔽成 `undefined` ⇒ `document.fullscreenElement` 抛
   `TypeError: Cannot read properties of undefined (reading 'fullscreenElement')`，被 `screen.ts:159-162`
   的 `.catch` 里 `error(err)` 打成**真 console error**，矩阵 `noConsoleError` 判 FAIL
   （证据：`E:/AIProMax/cocosair-scratch/v12-diag/matrix-video-debug-r3.json`、
   `matrix-video-timing-r4.json` 的 `consoleErrors`，含产物栈帧
   `build/cocosair.module.js:68086:112`）。
   同一段源码在 firefox/webkit 上未跑过（首版只在 chromium 上定位到此），且 webkit 的
   `canFullScreen` 因 `readyState` 停在 3 会在进入该分支前早退 ⇒ 记为「源码可判定，跨引擎复测待补」，
   不要当成三引擎一致的报错。
3. **退不出全屏（源码判定，端到端未复测）**：错误回调把 `impl._fullScreenOnAwake = false`；
   `video-player.ts:248-255` 的 getter 会把这个 false 回读进组件字段，而 setter（`:257-264`）
   有 `if (this._fullScreenOnAwake !== value)` 同值早退 ⇒ 用户随后 `player.fullScreenOnAwake = false`
   是空操作，`syncMatrix` 的 `enabled=false` 分支（`:221-225` 的 `screen.exitFullScreen()`）永远走不到。

**可用路径**（示例采用，故契约可断言）：

- 手势内直接 `await screen.requestFullScreen()` / `await screen.exitFullScreen()`，自己 try/catch。
  不 await 的 `exitFullScreen()` 在非全屏态会抛 `pageerror: Failed to execute 'exitFullscreen' on
'Document': Document not active`。实测 enter/exit 双向都 resolve
  （`enterResolved/exitResolved true`、`exitSettledWithinMs 0`）。
- `fullScreenOnAwake = true` 必须在赋 `clip` **之前**设置，此时走的是「几何全屏」分支：
  `syncMatrix` 用 `visibleRect` 把 `<video>` 撑满视口（实测 `awake.rect 480x360 == awake.viewport`、
  `grewToViewport true`、`document.fullscreenElement` 保持 `null`、无 TypeError）。
- `canFullScreen`（`video-player-impl-web.ts:175-226`）在 `video.readyState !== 4` 时直接早退，
  所以「加载后置 true」在慢引擎上可能整段不执行——webkit 的 `readyState` 实测停在 3，这解释了
  它 `readyToPlayWithinMs -1` 而没有报错。
- 销毁要显式：`fsNode.destroy()` 后 `document` 内 `<video>` 数从 2 回 1
  （`awake.videoCount 2 → awakeAfterDestroy.videoCount 1`），这是 `removeVideoPlayer`
  （`video-player-impl-web.ts:239-276`）的泄漏证据。

## 3. 解码出图不能只看播放头

`currentTime` 前进、`readyState>=1` 都不证明帧被解出来（暂停态 seek 也会动播放头）。示例把 `<video>`
`drawImage` 到同源 2D 画布做像素统计（`mean`/`nonBlackRatio`/`colorBins`），并且**采样前先确认
`isPlaying`**（`playingBeforeSample`，必要时 `play()` 再等）。首版正是在静止态取了两帧 `mean` 完全相同，
被误读成「解码失效」。

## 4. 逐引擎差异（禁入 `probeEquals`，只做 `probePresent`/非空）

| 项                                               | chromium          | firefox           | webkit                  |
| ------------------------------------------------ | ----------------- | ----------------- | ----------------------- |
| `p1Mount.readyState`                             | 4                 | 4                 | **3**                   |
| `p1Mount.readyToPlayWithinMs`                    | 0                 | 21                | **-1**（未触发）        |
| `p2Events.metaBeforeReady` / `firstReadyToPlay`  | true/3            | true/3            | **false/-1**            |
| `p9Fullscreen.during.videoRect`                  | 160x120           | **341.3x256**     | 160x120                 |
| `p6SourceSwitch.remoteMetaWithinMs`              | 20 → **21**       | 20 → **21**       | 304 → **713**           |
| `live.state` / `isPlaying` / `liveFramesAdvance` | playing/true/true | clicked/true/true | clicked/**false/false** |
| `p5Geometry.playingBeforeSample`                 | **false**         | true              | true                    |
| `p0Asset.videoCurrentSrcEmpty`                   | true              | true              | **false**               |

`<video>.objectFit` 在 AIR 路径上始终 `none`（引擎自己按 `visibleRect` 摆位），
`keepAspectRatio` 的开/关不改变计算值——三引擎一致地报 `none`，所以 `p5Geometry.objectFit*` 三条
反而是可断言的「上游语义」证据。

本表只有 `remoteMetaWithinMs` 一行按「r37 快照 → **r38 全量**」双写（r37 值取自
`E:/AIProMax/cocosair-scratch/v12-diag/snapshot-matrix-27rec/browser-matrix.json`；本节此前印的 316 是
另一轮的浮动读数，未留档，故不引用）。其余各行已在 r38 全量捕获中逐行复现一致。
这类 `*WithinMs` 计时逐轮浮动（同一引擎跨轮可差 2 倍以上），所以全部排除在逐字契约之外。

## 5. `completed` 不会因为钳制 seek 而触发

`p7Completed`：把 `currentTime` 设到 `duration + ε`，三引擎一致 `completedWithinMs -1`、`endedDelta 0`、
`isPlayingAfterEnd false`——即 HTML `<video>` 的 `ended` 没有发生，只是被钳到边界并暂停
（`stateAfterEnd` chromium/firefox `ready-to-play`、webkit `meta-loaded`）。
`loop = true` 时同样 `completedDeltaDuringLoop 0`，回绕本身成功（`wrappedBelowSeekTarget true`，
`wrapWithinMs 371`）——但这一条在 r37 之前是**碰巧**成立的，见 §6。
这不是缺陷，但和「设超界就等于播完」的直觉相反，写在这里防下次误判。

## 6. webkit 的 `loop` 回绕与 in-flight seek 抢次序（F-107，r38 修示例侧）

r37 的 27/27 在 webkit 上**不可稳定复现**：同一份代码 + 同一份契约连跑，`probeEquals:results.p8Loop.wrappedBelowSeekTarget`
约一半概率为 `false`（`matrix-video-webkit-rep1/rep2.json` 两次 1 FAIL/1 PASS）。首版把它归因为「等待不足」，
但把 `PLAYING` 的等待从 2000 ms 放宽并不解决问题——`PLAYING` 确实到达了。

真正的机制由仓库外脚本 `E:/AIProMax/cocosair-scratch/v12-diag/diag-video-webkit-timeline.cjs`
（`addInitScript` 挂 `<video>` 轮询器，请求 60 ms 实际节流到约 350 ms）抓到，
证据 `E:/AIProMax/cocosair-scratch/v12-diag/video-webkit-timeline.json`
（`completed=true`，3 runs；run2 即失败样本）：

```
[13167, 1, 3, playing=1, ct=3,     seeking=1, ended=0, loop=1]   ← P7 的超界 seek 被钳到 3，仍在 in-flight
[13522, 1, 3, playing=0, ct=2.704, seeking=0, ended=0, loop=1]   ← 下一拍：停在 P8 的 seek 目标、paused
… 直到 [21811, …, ct=2.704] 共 8.3 s，不回绕、不报错、`stateNow 'paused'`
```

即：**贴著片尾发起 seek（`ct` 目标 2.7 / 片长 3）＋ `loop=true`，在 WebKit 上会与 loop 重启抢次序，
元素停在 seek 目标并暂停，既不回绕也不产生 `error`**。这是引擎/浏览器层的时序事实，
`src/cocos/video/**` 逐字节未动，登记 **F-107**（`blockingForRelease false`，处置 `FIXED-EXAMPLE-SIDE`）。

示例侧修法（两点，都不改契约里已锁的取值）：

1. seek 目标从 `2.7` 改为 `2.0`（离片尾留 1 s 余量），并新增 `seekSettledWithinMs` 等待
   `nativeVideo.seeking === false && 1.9 <= currentTime <= 2.3` 之后再看回绕——把「in-flight seek 竞态」
   变成「seek 落地后的稳态」，断言的是回绕语义而不是竞速次序。
2. 契约 `video-basic` 的 `waitMs 18000 → 26000`：r38 的 6 次 webkit 矩阵捕获 `results.sequenceMs` 为
   12977 / 13738 / 13775 / 15527 / 15711 / 15951 ms（即 13.0–16.0 s，修复前后各有），18 s 余量过薄。

修后验证：webkit 连跑 3 次全 PASS（`matrix-video-webkit-fix1..3.json`），chromium/firefox 各 1 次 PASS
（`matrix-video-chromfox-fix.json`）。契约 `video-basic` 块在 `p7Completed`/`p8Loop` 上锁定的 5 条
（`clampedBeyondDuration[1]`、`endedDelta`、`isPlayingAfterEnd`、`completedDeltaDuringLoop`、
`wrappedBelowSeekTarget`）取值与 r37 逐字一致 ⇒ 契约指纹只由 `waitMs` 变化推动；
`stateAfterEnd`、`stateNow`、`currentTimeNow`、两条 `*WithinMs` 本来就不在契约内
（`probeEquals` 要求三引擎逐字相同，而 `stateAfterEnd` 在 r37/r38 两轮都是 chromium/firefox
`ready-to-play` 对 webkit `meta-loaded`，天然进不去）。
权威全量轮（10 示例 × 3 引擎，`matrix-full-r38b.log`）里 `video-basic` 三格全 PASS，
`p8Loop` 现值：`seekSettledWithinMs` 1921 / 40 / 1938、`wrapWithinMs` 1084 / 1028 / 1085、
`wrappedBelowSeekTarget true`、`stateNow 'playing'`、`currentTimeNow` 0.001 / 0.018 / 0
（后两条是计时量，未进契约）。

**取证纪律新增一条**：由挂钟超时派生的布尔（`wrapMs >= 0` 这类）能通过「三引擎逐字一致」的筛选，
却仍然是竞态。这类键在纳入 `probeEquals` 前，必须先确认探针的前置条件是**就绪态**而非固定余量。

### 2026-09-28 · 视频末尾播放状态的契约收敛

在完整的 P0–P9 序列后等待约 36 秒再读取 `live.currentTimeAdvanced`，Chromium 与 Firefox 通过，WebKit 偶发已暂停；同一份读回同时显示 P3 的 `advancedWhilePlaying=true` 与 P5 的 `decodedFramesAdvance=true`，证明播放器此前实际推进并解码。因为契约已在 P3/P5 分别验证播放推进和视频帧解码，末尾瞬时状态重复证明同一能力，却依赖 WebKit 完成全屏/第二播放器生命周期后的偶然播放状态。

因此从 `video-basic` 的 V1.2 `probeEquals` 移除 `live.currentTimeAdvanced`，保留该字段作诊断，并继续锁定 P3 `advancedWhilePlaying`、P5 `decodedFramesAdvance`、P8 `wrappedBelowSeekTarget` 与 `completedDeltaDuringLoop`。这修正了冗余快照门槛，没有豁免播放、解码或循环行为。
