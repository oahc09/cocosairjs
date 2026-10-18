# 音频终态与动态合图所有权

本文说明新合同，不把历史作品报告当作当前 SDK 运行验收。第 12 款《纸月律动》缺少同份源码、音频及旧 SDK，按用户确认保留 `SKIPPED`，不指定引擎根因。

## 等待就绪、取消与重试

`source.clip = clip` 仍自动加载。`loadAsync()` 共享当前尝试，失败或取消会 reject；`getSampleRate()`、`getPCMData()` 不再仅等待 loaded。没有有效 clip 或组件已销毁时拒绝等待。

```ts
source.clip = clip;
try {
    await source.loadAsync({ timeoutMs: 15000 });
    console.log(await source.getSampleRate());
} catch (error) {
    console.error(source.loadState, error);
    await source.loadAsync({ retry: true, timeoutMs: 15000 });
}
```

传入 `clip`、`transport`、`timeoutMs`、`signal` 或 `retry: true` 会开始新尝试并取消此前尝试。超时须为正有限毫秒，默认 8000ms，到期严格失败，不再凭 readyState 非零假定成功。状态为 `empty/loading/ready/error/cancelled`。

```ts
const controller = new AbortController();
// 原子设置 clip 和传输方式，避免先触发一次旧的原生媒体下载。
const ready = source.loadAsync({ clip, transport: 'buffered', signal: controller.signal, timeoutMs: 15000 });
controller.abort(); // 也可 source.cancelLoad()
await ready.catch((error) => console.log(error.name)); // AbortError
await source.loadAsync({ retry: true });
source.play();
```

DOM 默认 `transport: 'media'` 保留原生 URL 加载和跨域兼容，取消会移除 src 并调用 load，但 Windows WebKit 的原生媒体网络请求可能继续完成。需要请求实际中止时，使用上面的 `buffered` 路径：受控 XHR 下载完整音频，再交付 Blob URL；取消中止 XHR，失败或播放器销毁撤销 Blob URL。它需要 CORS，并承担整份压缩音频缓冲的内存成本。选择的 transport 在该 source 的重试和换 clip 时保留；可显式传 `media` 切回。缓冲式 one-shot 是单次消费，结束或 stop 时回收媒体源。

**平台限制：**本机 Windows WebKit 26.5 的无引擎对照中，同一 WAV 的 HTTP URL 正常播放，Blob URL 和 Data URI 均返回原生媒体错误 4 / NotSupportedError。该环境的 `buffered` 播放仍未通过，失败结果保留；不能同时宣称它满足“原生媒体播放 + 严格请求中止”。可使用 `media` 播放，但其原生下载取消仍是上述边界。这里不代表 macOS/iOS Safari 的结果，也不通过静默回退来伪造严格取消通过。

同环境曾复现 pending play → stopAsync 后时钟漂移，原失败保留。无引擎对照证明：仅 pause/seek 无效，清 src + load 可退役原生播放源，恢复 URL 后可重播。因此仅对 Windows WebKit 未确认启动的 play，pause/stop 退役媒体源，下一次 play 恢复 URL、位置和真实时长 metadata；不修改时钟 getter或伪造事件。本轮原生 URL 范围已检查原始元素身份、跨原始 EOS 的完整停止采样及随后重播推进。它不是缺材料的第 12 款作品归因，也不解除上面的 Blob 音源限制。

Web Audio 同样中止 XHR。超时包括解码；已开始的 `decodeAudioData()` 无法物理中断，但调用方结束等待，迟到结果不进入缓存。DOM 就绪使用 canplay（iOS 保留 loadedmetadata），不要求所有平台都会触发的 canplaythrough。成功交付的媒体/缓存引用归播放器，取消已完成加载不销毁播放器。浏览器何时回收物理内存不在此合同内。

失败后显式重试或再次调用旧 `play()` 可重新加载，不自动无限重试 503。assetManager 音频 downloader 同样转发 timeoutMs、signal、transport；资源管理器的缓存、重试次数及回调调度保持原合同，已缓存资源不因取消而被销毁。

```ts
assetManager.loadRemote<AudioClip>(audioUrl, { timeoutMs: 15000, signal: controller.signal, transport: 'buffered' }, (error, clip) => {
    if (error) { console.error(error); return; }
    // clip 按应用的 AssetBank/共享缓存所有权管理。
});
```

PR3 的 `stopAsync()` 取消先前播放意图，允许 clip 继续加载；取消 AudioSource 当前网络请求请用 `cancelLoad()`。

上述就绪状态、取消及播放 token 针对 `source.clip`。独立 `playOneShot` 不并入当前 clip token；其未完成加载会在 source 销毁时中止，已开始的独立声音保留原生命周期。

## 用请求标识对应播放终态

旧 `play(): void`、`stop(): void` 和 STARTED/ENDED 事件兼容；逐次请求结果使用 `playRequest()`，id 在同一个 source 内递增。

```ts
const request = source.playRequest();
const startup = await request.started;
if (startup.status === 'started') console.log('真实启动确认', request.id);
const result = await request.result;
console.log(result.id, result.status, result.error);
request.cancel(); // 退休 token 不会取消后来的请求
```

两个 Promise 都以结果对象 resolve，失败信息在 error。`result` 只会是 `ended/cancelled/failed`，循环播放等到取消或失败。真实 EOS 早于原生启动确认时，两个 Promise 都返回 `ended`，不伪造 STARTED。重播、pause、stop、换 clip、销毁取消当前请求；后续播放使用新 token。暂停取消这次请求，旧 API 或新请求仍可恢复播放。

新请求接管加载前控制队列，保留最后的 seek/stop 位置；退役请求的 PLAY 不会在延迟加载后重放，旧 STOP 也不会结束后继请求。PAL 结束通知携带实际声源的内部代际，旧回调不能结束新请求；AudioManager 经包装播放器 stop 淘汰声音时，也会结算对应请求。公共 STARTED/ENDED 事件仍使用原参数。

`cancelled` 表示请求已经退役，不替代底层停止完成证明。DOM 使用 stopAsync 的完成合同并检查原始媒体；Web Audio 保留旧 stop 队列语义，不把 token 状态直接当作静音证据。Web Audio 播放验证同时记录原生 AudioContext.currentTime 与实际 AudioBufferSourceNode，不能只用引擎的墙钟计时器证明推进。

STARTED 只代表原生启动确认，不承诺可闻声压或持续时钟推进；运行测试另检查 currentTime。

## 释放动态合图资源

可运行页面：[dynamic-atlas-ownership](examples/dynamic-atlas-ownership/index.html)。构建并启动开发服务后打开 `/docs/manual/examples/dynamic-atlas-ownership/`。左侧作品可退出和重新进入，右侧展厅精灵保留。

```ts
// 必须在入图前捕获引用；这些资源必须由当前作品独占创建。
const originalTexture = frame.texture as Texture2D;
const originalImage = originalTexture.image;
app.session.own(() => {
    frame.destroy(); // 移除自己的 atlas 条目
    originalTexture.destroy();
    originalImage?.destroy();
}, 'local-sprite');
```

重复释放安全的完整实现见 [ownSpriteFrame](../../examples/shared/owned-sprite-frame.ts)。每次进入使用新 scope，退出作品不销毁展厅 scope。不要清理 `frame.texture.destroy()`，它可能已指向共享 atlas。同一原始 Texture 如果也共享，需要集中所有者或引用计数，不能给每个 frame 登记独占销毁。缓存资产遵循缓存的释放合同，不能套用本例直接 destroy。

作品不得调用全局 `dynamicAtlasManager.reset()`。最后一个条目退出后 manager 释放空 atlas 属正常行为。

## 分阶段诊断释放

可选 [resource-ownership](../../tools/debug/resource-ownership.ts) 不进入默认运行时。

| 观察             | 含义                            | 不能据此断言                        |
| ---------------- | ------------------------------- | ----------------------------------- |
| 清理 receipt     | 清理函数完成、失败或超时        | 登记归零不证明资源释放              |
| queuedForDestroy | 普通 isValid 为真、严格模式为假 | 对象还未完成销毁                    |
| objectValid      | 引擎对象有效性                  | 不证明 GFX、请求或缓存状态          |
| gfxReleased      | 资源专用探针；null 表示未知     | 对象检查通过不证明物理 GPU 内存回收 |
| cacheRetained    | 缓存专用探针                    | 共享缓存保留不直接构成泄漏          |

Texture 使用 `getGFXTexture() === null` 检查句柄解绑；SpriteFrame 没有 GFX，保留 null。诊断不清缓存、不调用私有队列、不改 flag。先完成清理，再等引擎 update/draw 结算，分别检查独占资源已销毁、共享资源仍有效。CPU 单测的私有销毁队列不替代浏览器证据。

Web Audio 播放器销毁会停止/断开旧 AudioBufferSourceNode、清除其 buffer、断开 GainNode，并只释放一次缓存引用；换 clip 的浏览器回归观察真实原生调用和句柄，重复销毁不能误释放其他所有者的缓存。

## 聚焦回归

```bash
npx jest --runInBand --runTestsByPath test/smoke/audio-readiness.test.ts test/smoke/audio-cancellation.test.ts test/smoke/dynamic-atlas-ownership.test.ts
node tools/verify/audio-ownership-browser.cjs --bundle=output/audio-ownership/candidate/cocosair.module.js --out=output/audio-ownership/browser-run
```

浏览器命令只读候选 bundle，输出目录须不存在。用 `--browser=chromium/firefox/webkit` 选择已安装工具，保存失败、503、慢网、超时、取消、换 clip、销毁、解码失败、重试、重播时钟及合图退出重入结果。两个 CPU 负例分别遗漏原始纹理、误销毁共享 atlas，必须触发断言失败。

CPU 集成还使用真实 atlas manager 和 `app.releaseScene()` 验证退出、返回展厅及重新进入：同场景其他所有者仍在使用的 atlas 不误销毁，真正切场景时 manager 的合法 reset 则允许释放 atlas 并还原 SpriteFrame 的原始纹理。浏览器采图与释放断言暂停原生 pacer，使用单个 createStepClock，完成后恢复；原生音频时钟测试保持真实时间，不把其采样作为渲染性能指标。

每次新运行同时保存 inputs 中的候选、共享模块、页面及采集器原始字节，报告绑定相对快照路径和 SHA-256。失败不会覆盖为成功，后续修改工具也能追溯该轮输入。浏览器可执行文件单独记录版本/哈希，不复制其安装目录。

`--media-only=1` 单独复验原生 URL 的就绪、503、损坏音频、恢复、重播、播放取消及合图；报告明确标记 partial，不能替代默认完整范围或严格加载请求取消验收。播放取消验证 DOM stopAsync 的 250ms 边界和原始 EOS 之后的暂停/时钟状态；Web Audio 保留 stopAsync 不支持的原合同，另检查旧 stop。Windows WebKit 的原生媒体对照使用此范围，完整缓冲路径失败报告继续保留。

短范围结果不修改 canonical evidence 或发布状态，作品缺失的 `SKIPPED` 不提升为 PASS。
