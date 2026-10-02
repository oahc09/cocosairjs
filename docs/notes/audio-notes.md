# 音频行为与生命周期调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

日期：2026-09-22。所有结论后面都跟着产生它的命令与证据路径；没有实测支撑的一律标「待核」。
示例：`examples/audio-basic/`（`main.js` + `example.json` + `assets/tone.wav`）。

## 当前来源

PAL 已改由冻结的公开 MIT 源码生成，校验使用 `node tools/build/pal-source.cjs --check`；旧 npm 包与 `_ccprivate# 音频行为与生命周期调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

日期：2026-09-22。所有结论后面都跟着产生它的命令与证据路径；没有实测支撑的一律标「待核」。
示例：`examples/audio-basic/`（`main.js` + `example.json` + `assets/tone.wav`）。

 字段名不再是当前来源或诊断依据。详见 [PAL 来源](../reference/pal-source.md)。

## 1. 历史逐字节回归（2026-09-22）

`docs/upstream-file-map.json` 里 airPath 含 `audio` 的行共 **17** 条，全部与上游逐字节相同（69,959 B）：

```
node E:/AIProMax/cocosair-scratch/v12-logs/audio-group-byte-compare.cjs
→ E:/AIProMax/cocosair-scratch/v12-diag/audio-group-byte-compare.json
   rows 17 / identical 17 / differing 0 / noUpstream 0 / missingUpstreamFile 0
```

出处两套：`src/cocos/audio/**`（7）与 `src/exports/audio.ts`、`src/@types/pal/audio.d.ts` 对官方
`E:/AIProMax/github/cocos4`；`src/pal/audio/**`（8）对 npm `@cocos/engine-pal@1.0.4` 的 `dist/*`
（门禁 `tools/verify/verify-file-map.cjs:46` 的 `pal/` 前缀解析）。全仓库口径：

```
node tools/verify/verify-file-map.cjs → rows=1233 modified=28 scanned=1186 manifest=1196 PASS
```

⇒ 本组**零修改**，`docs/upstream-file-map.json` 不需要新增偏差条目。

## 2. Code First 音频通路（示例采用，已出图）

```js
const clip = await loadRemote('./assets/tone.wav');   // downloader 按 .wav 走 loadAudioPlayer
srcA.clip = clip; srcB.clip = clip;                   // 每个 AudioSource 各 new 一个 AudioPlayer
```

`AssetManager.loadRemote → downloader(.wav) → AudioPlayer.load → pal/web/player.js →
AudioPlayerWeb.loadNative`（XHR `arraybuffer` + `decodeAudioData`，buffer 按 URL 引用计数缓存）
`→ factory createAudioClip`。可回读的结构性事实（三引擎等值断言，`browser-matrix.json`）：

| 点 | 实测 |
|---|---|
| 两个组件共用一支 clip | `clipPlayerIsSourcePlayer false`、`twoSourcesShareOneClip true`（clip 只带 `_nativeAsset`，播放器 per-source） |
| 手势前 `play()` | 进 `_operationsBeforeLoading` 队列（调用时 1、加载完消费回 0），`AudioPlayer.maxAudioChannel 24` |
| 重采样 | `decodeAudioData` 恒按 context 采样率：8000 Hz 资产读回 `sampleRate 48000`、`pcmLength 76800`，而 `getDuration()` 仍 1.6（⚠️ 不要把 PCM 长度/头里的数字当结论） |
| 声道越界 | mono 资产 `getPCMData(1)` 抛 `IndexSizeError`（`safeAsync` 兜住并留字符串证据） |
| 共享缓冲 | 两源的 `getPCMData(0)` 返回同一底层 buffer，64-bin 包络峰值比 0.5/0.25 与资产设计（2:1 段幅）逐位一致 |

## 3. ⚠️ WebKit（Windows / Playwright `webkit-2361`，UA `Version/26.5 Safari/605.1.15`）四处静默口径

这是本组最有价值的产出：**同一份代码在 webkit 走的是一条语义不同的实现分支**，且全程零报错。

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node E:/AIProMax/cocosair-scratch/v12-logs/webkit-audio-probe.cjs
→ E:/AIProMax/cocosair-scratch/v12-diag/webkit-audio.json          # 能力实测
NODE_PATH=… node E:/AIProMax/cocosair-scratch/v12-logs/wav-dom-durations.cjs
→ E:/AIProMax/cocosair-scratch/v12-diag/wav-dom-durations.json     # duration 逐封装实测
```

1. **没有 Web Audio API**：`AudioContext / webkitAudioContext / OfflineAudioContext / webkitOfflineAudioContext`
   全 `undefined`（`isSecureContext true`、href 是 `http://127.0.0.1`，不是安全上下文问题）。
   引擎因此落到 `AudioPlayerDOM` ⇒ `clip._nativeAsset.type` 由 `WEB_AUDIO(1)` 变 `0`、
   `getPCMData()` 返回 `undefined`、`getSampleRate()` **永不 settle**。三处后果都做过有界兜底
   （`safeAsync` 1200 ms + `typeof view0.getData === 'function'` 能力判别），否则整条点击序列挂死在 `phaseKeys 3`。
2. **`<audio>` 按采样率误读 duration**：同一支 1.600 s 正弦，webkit 读回
   22050→`0.3705`、44100→`0.1853`、48000 mono→`0.1702`、48000 stereo→`0.0851`、float32→超时、
   **8000→`1.6000`**（chromium/firefox 六种封装全对）。⇒ 资产钉死 **PCM16 / 8000 Hz / mono**
   （`tools/fixtures/make-tone-wav.cjs` 手写 RIFF，无第三方编码依赖）。
3. **`loadNative` 只认 `canplaythrough`**（iOS 特例 `loadedmetadata`、Firefox 特例 `canplay`）：
   headless webkit 对这支 25 kB WAV 从不触发它 ⇒ 每次音频加载吃满实现里的 8000 ms 兜底 `setTimeout`
   （实测 webkit 模块顶层落在 `performance.now() ≈ 8.5 s`，chromium 0.7 s / firefox 1.1 s）。
   矩阵 `waitMs` 必须 ≥ 12000，否则点击打在 `TOUCH_START` 注册之前 ⇒ webkit 只会 `phaseKeys 1` 全红。
4. **DOM 后端假阳性播放**：`ensurePlaying()` 在 `domAudio.play()` 被拒时往 `#GameCanvas` 挂一次性
   `touchend/mouseup` 重试并**照样 resolve** ⇒ facade `state=PLAYING(1)` 而元素 `paused=true`、
   `currentTime` 冻结 0（probe 两次相隔 600 ms 采样 `srcBDelta=0`）。
   所以 `AudioSource.playing === true` ≠ 「真的在出声」；帧间变化证据必须是与音频后端无关的帧时钟
   （示例里那条绿色播放头），不能拿播放头当证据。

## 4. 生命周期：`destroy()` 不等于释放

§25 合同（`examples/shared/asset-lifecycle.js`）跑「释放 → 延迟销毁落地 → 泄漏核对 → 重新获取 → 复看图」。
第一版用 `clip.destroy()`，v11 验证器判 FAIL：

```
node tools/verify/example-spec-browser.cjs --ids=audio-basic
→ resource-released FAIL: reacquire: toneClip invalid after reacquire
   快照 E:/AIProMax/cocosair-scratch/v12-diag/pre-audio-v11/v11-examples-verified-FAIL-destroyonly.json
   同批 console: 'Invalid audio clip' ×2（src/cocos/audio/audio-source.ts:133/433）
```

根因是两处上游口径叠出来的静默坑：`assetManager.loadRemote` 以 **URL 为键**把结果缓存在
`assetManager.assets`（`asset-manager.ts:654` 命中即原样回缓存），而 `release-manager._free` 第 235 行
对已失效对象直接 `return` ⇒ 缓存条目残留，同 URL 二次加载拿回**已销毁实例**，只剩一条 `console.error`。
改成在资产仍有效时 `assetManager.releaseAsset(clip)`（`tryRelease(asset,true)` 的 force 分支才 `assets.remove`）后转绿：

```
PASS audio-basic → resource-released: held=1 leaked=0 reloaded=true litRatio=0.9999 assetUnits=7
```

P1 里另钉了 `results.p1Asset.cacheHasUrl = assetManager.assets.has(URL) === true`（三引擎等值），
把「URL 即缓存键、加载后在册」变成可机器比对量。

## 5. 门禁现读（2026-09-22 09:2x，§12 全量标准）

| 门禁 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck` | EXIT 0 | — |
| `npm test` | 31 suites / 252 tests 全绿 | `E:/AIProMax/cocosair-scratch/v12-logs/jest-audio-r2.log` |
| `npm run build` / `npm run build:min` | 产物字节不变（`35496aebda066ab5…` / `8795c8685ace28a1…`）⇒ `candidateFingerprint` 未漂移 | `sha256sum build/cocosair.module*.js` 前后对比 |
| V1.2 三引擎矩阵（无 `--ids` 全量） | **24/24 PASS**，`completed=true subset=false`，`contractFingerprint 812863c5dd1a827a`，`bundle 35496aebda066ab5` | `docs/evidence/browser-matrix/browser-matrix.json`；截图 `docs/evidence/browser-matrix/audio-basic/matrix-{chromium,firefox,webkit}.png`（12,432 / 18,235 / 13,003 B，
sha256-16 `06ffd260f8bc9f27` / `a4c0c89d96512ce6` / `5f9aa43156b03887`） |
| V1.1 spec 链 | `spec-evidence --check` 0 drifted / 0 detached / 0 errors；`spec-validate --strict` 53 frozen / 0 draft；`example-spec-browser.cjs --ids=audio-basic` **PASS / 1 promoted** ⇒ `status=stable`、`promotion{spec 9df8c691b6ad, source 002fb0bcb6e664a6, candidate 9fa85f88b968d5f1, verified 26 + attested 2 = units 28}` | `docs/evidence/spec-validation.json`、`docs/evidence/examples-verified.json`（注：该文件当前是**子集**捕获，`partial` 口径见台账） |
| 证据链符合性 | `spec-compliance-audit.cjs` 53 examples：**0 fail / 1 warn**（唯一 warn 是 gltf-draco 的诚实 BLOCKED） | `docs/evidence/spec-compliance.json` |

矩阵合同量：`probeEquals` 67 条三引擎逐字等值（含 `duration 1.6`、`state` 名与码、`volume` clamp、
`oneShotVolumeProduct 0.175`、`cacheHasUrl true`、8 个 phase 键），`probeNonEmpty` 12 条，
`checks.frameChanged true`。时序量（`*LatencyMs`、`posDelta`、`afterSeekPos` 等）**不进**等值断言。

## 6. 未覆盖面（不写成完成）

- **真实出声未证**：设备端 GPU/音频输出、`AudioContext.state` 在真实用户手势下的 resume 时序无法在
  headless 取证；本组只证到「facade 状态机 + 队列 + 事件计数 + 画面」，webkit 那格更是 DOM 分支。
- `AudioManager`、`audio*` 全局接口、`sys` 平台分支、原生（jsb）后端未取证据（计划书 LV12-03 只要求 AudioSource/Clip/autoplay 三点）。
- 覆盖率口径未动：`AudioSource.clip/.volume/.loop/.state/.playing/.duration/.currentTime`、
  `AudioSource.maxAudioChannel`、`AudioClip.AudioType` 等 accessor/static 在 `docs/example-api-inventory.json`
  里根本没有条目 ⇒ 不可 claim（登记在既有 F-80 口径缺口下，另待 owner 决策）。
