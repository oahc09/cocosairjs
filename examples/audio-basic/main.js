/**
 * Cocos Air — audio-basic（LV12-03 · 计划书 A2：手势解锁后播放/循环/音量 + 资产运行时注册）
 *
 * 通路（计划书 A2「AudioClip 运行时资产注册（Code First：decodeAudioData 路径）」）：
 * `assetManager.loadRemote('./assets/tone.wav')` ⇒ downloader 按 `.wav` 命中 `loadAudioPlayer`
 * （audio-downloader.ts:58-63）⇒ `AudioPlayer.load` → XHR(arraybuffer) → `AudioContext.decodeAudioData`
 * （pal/audio/web/player-web.js 的 `AudioPlayerWeb.loadNative`）⇒ factory `createAudioClip`（:65-71）
 * 产出**真 `AudioClip`**（`_nativeAsset = {player,url,type,duration}`、`_duration` 已灌值）。
 * 与 particle-2d 的 plist 通路同形：不经 Creator，走引擎自己注册的下载/工厂函数。
 *
 * 资产 `assets/tone.wav` 由 `tools/fixtures/make-tone-wav.cjs` 生成（mono/16-bit/22050 Hz/1.600 s，
 * 前半 440 Hz@0.50、后半 660 Hz@0.25，段首尾 88 样本线性包络）⇒ PCM 峰值 0.5、两段峰值比恰为 2:1，
 * 波形条高度与比值都是可推的硬数字，不依赖任何第三方音频资产。
 *
 * 两个 `AudioSource` 分别钉住首次播放的两条合法通路（audio-source.ts:351-364 文档）：
 * • `srcA`：`play()` 在**手势之前**调用（且此刻 `AudioPlayer.load` 还没 resolve ⇒ 进
 *   `_operationsBeforeLoading` 队列，加载完由 `_syncStates` 重放）⇒ 量的是浏览器自动播放策略本身。
 * • `srcB`：`playOnAwake=false`，只在 `TOUCH_START` 回调里 `play()` ⇒ 量的是「手势回调内播放」，
 *   也就是 pal 里 `runContext()` 往 `#GameCanvas` 挂 `touchend`/`mouseup` 捕获监听再 `resume()` 那条链。
 *
 * 播放头不是装饰：它每帧按 `srcB.currentTime` 重画 ⇒ 「画面持续变化」与「音频时钟在推进」是同一件事，
 * 三引擎矩阵的 `frameChanged` 因此不来自随机噪声。序列收尾故意停在 `loop=true` 的持续播放态。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Component,
    UITransform,
    Layers,
    Color,
    Label,
    Graphics,
    AudioSource,
    AudioClip,
    AudioPCMDataView,
    assetManager,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;
const r = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (fn) => {
    try {
        return fn();
    } catch (e) {
        return 'ERR:' + e.message;
    }
};

/**
 * 带硬超时的 await。DOM 播放器通路（webkit-2361 没有 Web Audio API ⇒ 引擎退回 `<audio>`）上
 * `getSampleRate()/getPCMData()` 的 promise 可能**永不 settle**，不兜底会挂死整条序列
 * （实测 r3：p3Decoded 只剩 `{playerType:null}`，summary 停在 'audio: loading'）。
 */
async function safeAsync(fn, timeoutMs = 1200) {
    try {
        return await Promise.race([
            Promise.resolve().then(fn),
            sleep(timeoutMs).then(() => {
                throw new Error(`never-settled-in-${timeoutMs}ms`);
            }),
        ]);
    } catch (e) {
        return 'ERR:' + e.message;
    }
}

/** 轮询到条件成立返回实际耗时（ms），超时返回 -1 —— 播放解锁/判尾的真实落地时刻不靠猜延时 */
async function waitFor(fn, timeoutMs = 2000, stepMs = 25) {
    const t0 = performance.now();
    for (;;) {
        let hit = false;
        try {
            hit = !!fn();
        } catch (e) {
            hit = false;
        }
        if (hit) {
            return Math.round(performance.now() - t0);
        }
        if (performance.now() - t0 > timeoutMs) {
            return -1;
        }
        await sleep(stepMs);
    }
}

const AUDIO_STATE = AudioSource.AudioState || {};
const STATE_NAME = {};
for (const key of Object.keys(AUDIO_STATE)) {
    STATE_NAME[AUDIO_STATE[key]] = key;
}
const stateOf = (v) => `${STATE_NAME[v] === undefined ? 'UNKNOWN' : STATE_NAME[v]}(${v})`;

// ---------------------------------------------------------------- 场景
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('v12-audio-basic');
const canvasNode = new Node('Canvas');
canvasNode.layer = UI_LAYER;
canvasNode.addComponent(UITransform).width = 480;
canvasNode.getComponent(UITransform).height = 360;
const canvas = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);

const cameraNode = new Node('UICamera');
cameraNode.layer = UI_LAYER;
cameraNode.setPosition(0, 0, 1000);
const cam = cameraNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO;
cam.clearColor = new Color(10, 14, 22, 255);
cam.priority = 1073741824;
cam.visibility = UI_LAYER;
canvasNode.addChild(cameraNode);
canvas.cameraComponent = cam;

const statusNode = new Node('Status');
statusNode.layer = UI_LAYER;
statusNode.addComponent(UITransform).width = 460;
statusNode.getComponent(UITransform).height = 40;
statusNode.setPosition(0, 148, 0);
canvasNode.addChild(statusNode);
const status = statusNode.addComponent(Label);
status.string = 'audio: loading';
status.color = new Color(220, 228, 240, 255);
status.fontSize = 14;
status.lineHeight = 17;

const WAVE_W = 420;
const WAVE_H = 120;
const waveNode = new Node('Wave');
waveNode.layer = UI_LAYER;
waveNode.addComponent(UITransform).width = WAVE_W;
waveNode.getComponent(UITransform).height = WAVE_H;
waveNode.setPosition(0, -22, 0);
canvasNode.addChild(waveNode);
const wave = waveNode.addComponent(Graphics);

const hintNode = new Node('Hint');
hintNode.layer = UI_LAYER;
hintNode.addComponent(UITransform).width = 460;
hintNode.getComponent(UITransform).height = 20;
hintNode.setPosition(0, -112, 0);
canvasNode.addChild(hintNode);
const hint = hintNode.addComponent(Label);
hint.string = 'click to unlock playback';
hint.color = new Color(150, 165, 190, 255);
hint.fontSize = 13;
hint.lineHeight = 16;

// ---------------------------------------------------------------- 状态
let clip = null;
const bins = [];
let srcA = null;
let srcB = null;
let endedCount = 0;
let startedCount = 0;
const results = {};
const events = [];

/** 一次可回读的完整外部状态快照（只经 public getter，不碰私有字段） */
function snap(src, tag) {
    return {
        tag,
        tMs: Math.round(performance.now()),
        playing: src.playing,
        state: stateOf(src.state),
        currentTime: r(src.currentTime, 3),
        duration: r(src.duration, 3),
        volume: r(src.volume, 3),
        loop: src.loop,
        clipCtor: src.clip ? src.clip.constructor.name : null,
    };
}

/** 64 个 bin 的包络（|max|）+ 前后半段各自峰值（资产里是 2:1） */
function computeBins(view0, count) {
    bins.length = 0;
    const per = Math.floor(view0.length / count);
    const seg = Math.floor(view0.length / 2);
    const out = { maxFirst: 0, maxSecond: 0 };
    for (let b = 0; b < count; b++) {
        let peak = 0;
        for (let i = b * per; i < (b + 1) * per; i++) {
            const v = Math.abs(view0.getData(i));
            if (v > peak) {
                peak = v;
            }
            if (i < seg) {
                if (v > out.maxFirst) {
                    out.maxFirst = v;
                }
            } else if (v > out.maxSecond) {
                out.maxSecond = v;
            }
        }
        bins.push(peak);
    }
    return out;
}

const FRAME_CYCLE_MS = 2400;

function drawWave(playhead) {
    wave.clear();
    wave.strokeColor = new Color(60, 74, 96, 255);
    wave.lineWidth = 1;
    wave.moveTo(-WAVE_W / 2, 0);
    wave.lineTo(WAVE_W / 2, 0);
    wave.stroke();
    const bw = WAVE_W / (bins.length || 1);
    wave.fillColor = new Color(70, 190, 240, 255);
    for (let i = 0; i < bins.length; i++) {
        const h = Math.max(1, bins[i] * WAVE_H);
        wave.rect(-WAVE_W / 2 + i * bw + 1, -h / 2, bw - 2, h);
    }
    wave.fill();
    if (playhead !== null) {
        const x = -WAVE_W / 2 + Math.min(1, Math.max(0, playhead)) * WAVE_W;
        wave.strokeColor = new Color(255, 210, 90, 255);
        wave.lineWidth = 3;
        wave.moveTo(x, -WAVE_H / 2);
        wave.lineTo(x, WAVE_H / 2);
        wave.stroke();
    }
    // 帧时钟（绿）：证明「每帧真的在重绘」，与音频播放头（琥珀）分开。
    // 分开是必要的——webkit 的 DOM 后端在序列末尾 play() 被拒（元素 paused=true）时，
    // 播放头会冻在 0，若只靠它，整帧不变 ⇒ frameChanged 只能反映后端差异而不是渲染循环。
    const phase = (performance.now() % FRAME_CYCLE_MS) / FRAME_CYCLE_MS;
    const cw = 10;
    wave.fillColor = new Color(120, 225, 150, 255);
    wave.rect(-WAVE_W / 2 + phase * (WAVE_W - cw), -WAVE_H / 2 - 14, cw, 6);
    wave.fill();
}

class WaveDriver extends Component {
    update() {
        if (!srcB || !clip) {
            return;
        }
        const dur = srcB.duration || 1.6;
        drawWave(srcB.playing ? srcB.currentTime / dur : null);
    }
}
waveNode.addComponent(WaveDriver);

function summary() {
    if (!clip) {
        return status.string;
    }
    status.string = `audio clip=${r(clip.getDuration(), 2)}s vol=${r(srcB.volume, 2)} loop=${srcB.loop} ended=${endedCount} state=${stateOf(srcB.state)}`;
    return status.string;
}

// ---------------------------------------------------------------- 资源加载 + 手势前的首次播放
const CLIP_URL = './assets/tone.wav';

function loadRemote(url) {
    return new Promise((resolve, reject) => {
        assetManager.loadRemote(url, (err, asset) => {
            if (err) {
                reject(err);
            } else {
                resolve(asset);
            }
        });
    });
}

clip = await loadRemote(CLIP_URL);

const audioNode = new Node('AudioHost');
audioNode.active = false; // 配置完成前不触发 AudioSource 默认的 playOnAwake。
audioNode.layer = UI_LAYER;
canvasNode.addChild(audioNode);
srcA = audioNode.addComponent(AudioSource);
srcB = audioNode.addComponent(AudioSource);
for (const s of [srcA, srcB]) {
    s.playOnAwake = false;
    s.clip = clip;
}
audioNode.active = true;
audioNode.on(AudioSource.EventType.STARTED, (src) => {
    startedCount++;
    events.push(`started@${Math.round(performance.now())}`);
});
audioNode.on(AudioSource.EventType.ENDED, () => {
    endedCount++;
    events.push(`ended@${Math.round(performance.now())}`);
});

// srcA：手势前就 play()，且此时 AudioPlayer.load 还没 resolve ⇒ 进 _operationsBeforeLoading 队列
results.p2PreGesture = { opsQueueBeforeCall: srcA['_operationsBeforeLoading'].length };
srcA.play();
results.p2PreGesture.opsQueueAfterCall = srcA['_operationsBeforeLoading'].length;
results.p2PreGesture.isLoadedAtCall = srcA['_isLoaded'];
results.p2PreGesture.stateRightAfterPlayCall = snap(srcA, 'afterPlayCall');
await sleep(300);
results.p2PreGesture.later = snap(srcA, 'later300ms');
results.p2PreGesture.loadedAfter300 = srcA['_isLoaded'];
results.p2PreGesture.opsQueueAfterLoad = srcA['_operationsBeforeLoading'].length;
// 未被手势解锁时 AudioContext 应仍是 suspended ⇒ 加载完也不该 emit STARTED
results.p2PreGesture.startedCountBeforeGesture = startedCount;
results.p2PreGesture.autoplayBlocked = startedCount === 0;
results.p2PreGesture.stateBeforeGesture = results.p2PreGesture.later.state;

// ---------------------------------------------------------------- 交互：一次点击跑完 8 阶段
async function runSequence() {
    if (!clip) {
        return summary();
    }

    // 必须在手势调用栈内启动，不能等 decode/PCM 的异步读取结束后再请求解锁。
    const atGesture = snap(srcB, 'atGesture');
    srcB.play();
    const rightAfter = snap(srcB, 'rightAfterPlay');

    results.p1Asset = {
        ctor: clip.constructor.name,
        isAudioClip: clip instanceof AudioClip,
        validate: clip.validate(),
        getDuration: r(clip.getDuration(), 3),
        nativeUrlTail: clip.nativeUrl.slice(-13),
        cacheHasUrl: assetManager.assets.has(CLIP_URL),
        metaKeys: Object.keys(clip._nativeAsset).sort().join(','),
        metaUrlEqualsNativeUrl: clip._nativeAsset.url === clip.nativeUrl,
        metaType: clip._nativeAsset.type,
        typeIsWebAudio: clip._nativeAsset.type === AudioClip.AudioType.WEB_AUDIO,
        loadMode: clip.loadMode,
        clipPlayerIsSourcePlayer: clip._nativeAsset.player === srcA['_player'],
        twoSourcesShareOneClip: srcA.clip === srcB.clip,
        maxAudioChannel: AudioSource.maxAudioChannel,
        srcBLoaded: srcB['_isLoaded'],
    };

    results.p3Decoded = {
        playerType: srcB['_player'] ? srcB['_player'].type : null,
        hasAudioContext: typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined',
    };
    results.p3Decoded.sampleRate = await safeAsync(() => srcB.getSampleRate());
    const view0 = await safeAsync(() => srcB.getPCMData(0));
    // 判别必须是「像 AudioPCMDataView」而不是「有 length」：safeAsync 兜出来的错误串同样有 length
    const ok0 =
        !!view0 && typeof view0 === 'object' && typeof view0.getData === 'function' && typeof view0.length === 'number';
    const peaks = ok0 ? computeBins(view0, 64) : { maxFirst: 0, maxSecond: 0 };
    results.p3Decoded.pcmViewCtor = ok0 ? view0.constructor.name : null;
    results.p3Decoded.isAudioPCMDataView = ok0 ? view0 instanceof AudioPCMDataView : null;
    results.p3Decoded.pcmLength = ok0 ? view0.length : 0;
    results.p3Decoded.firstSample = ok0 ? r(view0.getData(0), 4) : null;
    results.p3Decoded.bins = bins.length;
    results.p3Decoded.binPeakFirstHalf = r(peaks.maxFirst, 3);
    results.p3Decoded.binPeakSecondHalf = r(peaks.maxSecond, 3);
    results.p3Decoded.peakInRange = peaks.maxFirst > 0.4 && peaks.maxFirst < 0.6;
    results.p3Decoded.secondHalfQuieter = peaks.maxSecond > 0 && peaks.maxFirst / peaks.maxSecond > 1.5;
    results.p3Decoded.lengthPositive = peaks.maxFirst > 0;
    results.p3Decoded.channel1 = ok0
        ? await safeAsync(() =>
              srcB.getPCMData(1).then(
                  (v) => (v ? `ok(len=${v.length})` : 'undefined'),
                  (e) => String((e && e.name) || e),
              ),
          )
        : String(view0);

    // srcB：在手势回调内 play()（文档给的第一条合法通路）。
    // 解锁时刻不靠猜延时：轮询到真的 PLAYING 才记耗时（无音频输出的 headless 里 resume() 可慢到 1 s 级）。
    const unlockMs = await waitFor(() => srcB.playing, 2500);
    const afterGesture = snap(srcB, 'afterUnlock');
    hint.string = afterGesture.playing ? 'unlocked: playing' : 'unlocked: AudioContext never reached running';
    results.p4Gesture = {
        stateAtGesture: atGesture.state,
        stateRightAfterPlay: rightAfter.state,
        unlockLatencyMs: unlockMs,
        unlockedByGesture: unlockMs >= 0,
        stateAfterGesture: afterGesture.state,
        playingAfterGesture: afterGesture.playing,
        startedCountAfterUnlock: startedCount,
        posAtGesture: atGesture.currentTime,
        clipCtor: afterGesture.clipCtor,
    };

    // 时间轴：推进 → pause 冻结 → play 从偏移续播
    const t1 = snap(srcB, 't1');
    const advanceMs = await waitFor(() => srcB.currentTime > t1.currentTime + 0.05, 1000);
    const t2 = snap(srcB, 't2');
    srcB.pause();
    const paused = snap(srcB, 'paused');
    await sleep(220);
    const pausedAgain = snap(srcB, 'pausedAgain');
    srcB.play();
    const resumeMs = await waitFor(() => srcB.playing && srcB.currentTime > paused.currentTime + 0.05, 1000);
    const resumed = snap(srcB, 'resumed');
    results.p5TimeMachine = {
        clockAdvancedWhilePlaying: advanceMs >= 0,
        posDelta: r(t2.currentTime - t1.currentTime, 3),
        wallDeltaMs: t2.tMs - t1.tMs,
        stateAfterPause: paused.state,
        frozenWhilePaused: r(pausedAgain.currentTime - paused.currentTime, 3),
        resumedState: resumed.state,
        resumedFromOffset: resumeMs >= 0 && resumed.currentTime > paused.currentTime,
        withinDuration: resumed.currentTime < resumed.duration,
    };

    // 音量：回读 / 上限钳制 / NaN 拒绝并保持 / 真实写到 gain 节点
    srcB.volume = 0.35;
    const volReadback = r(srcB.volume, 3);
    srcB.volume = 5;
    const clampedHigh = r(srcB.volume, 3);
    srcB.volume = Number.NaN;
    const afterNaN = r(srcB.volume, 3);
    srcB.volume = 0.35;
    await sleep(150);
    const gain = safe(() => r(srcB['_player']['_ccprivate$_player']['_ccprivate$_gainNode'].gain.value, 3));
    results.p6Volume = {
        volReadback,
        clampedHigh,
        afterNaN,
        nanKeepsPrevious: afterNaN === clampedHigh,
        gain,
        gainFollowsVolume: typeof gain === 'number' && Math.abs(gain - 0.35) < 0.02,
    };

    // seek 到尾部 + loop=false ⇒ 引擎自己的 checkEnded 判播完并回落 INIT
    srcB.loop = false;
    srcB.currentTime = 1.5;
    const seekMs = await waitFor(() => srcB.currentTime >= 1.4, 600);
    const afterSeek = snap(srcB, 'afterSeek');
    const endedBefore = endedCount;
    const endMs = await waitFor(() => endedCount > endedBefore, 800);
    const afterEnd = snap(srcB, 'afterEnd');
    // 停止态下的越界 seek：clamp 到 duration，且不会自己再播
    srcB.currentTime = 99;
    const clampedSeek = r(srcB.currentTime, 3);
    results.p7SeekEnd = {
        seekLatencyMs: seekMs,
        afterSeekPos: afterSeek.currentTime,
        seekLandedsInRange: afterSeek.currentTime >= 1.4 && afterSeek.currentTime <= 1.61,
        endLatencyMs: endMs,
        endEventFired: endMs >= 0,
        endedDelta: endedCount - endedBefore,
        stateAfterEnd: afterEnd.state,
        playingAfterEnd: afterEnd.playing,
        posAfterEnd: afterEnd.currentTime,
        clampedToDuration: clampedSeek,
        clampsToDurationValue: clampedSeek === 1.6,
        stillStoppedAfterClampSeek: !srcB.playing,
    };

    // loop=true：在停止态先落偏移再播 ⇒ 越过时长仍在播，且 currentTime 回绕（AudioTimer 的 % duration）
    const endedBeforeLoop = endedCount;
    srcB.loop = true;
    srcB.currentTime = 1.5;
    srcB.play();
    const wrapMs = await waitFor(() => srcB.playing && srcB.currentTime < 1.0, 1200);
    const looped = snap(srcB, 'looped');
    results.p8LoopOneShot = {
        loopFlagOnPlayer: srcB['_player'].loop,
        stateWhileLooping: looped.state,
        stillPlaying: looped.playing,
        wrapLatencyMs: wrapMs,
        wrappedBelowSeekTarget: wrapMs >= 0,
        endedDeltaDuringLoop: endedCount - endedBeforeLoop,
    };

    // playOneShot：另开一条 OneShotAudio 通道，不打断主播放头的持续态
    const playingBeforeOneShot = srcB.playing;
    srcB.playOneShot(clip, 0.5);
    await sleep(120);
    results.p8LoopOneShot.playingBeforeOneShot = playingBeforeOneShot;
    results.p8LoopOneShot.stillPlayingAfterOneShot = srcB.playing;
    results.p8LoopOneShot.oneShotVolumeProduct = r(srcB.volume * 0.5, 3);

    // 组件所在节点禁用即自动暂停；重新启用不会自己播（playOnAwake=false）
    audioNode.active = false;
    const disabled = snap(srcB, 'disabled');
    audioNode.active = true;
    const reEnabled = snap(srcB, 'reEnabled');
    srcB.play();
    await sleep(120);
    const playedAgain = snap(srcB, 'playedAgain');
    results.p8LoopOneShot.stateAfterDisable = disabled.state;
    results.p8LoopOneShot.stateAfterReEnable = reEnabled.state;
    results.p8LoopOneShot.playingAfterReEnable = reEnabled.playing;
    results.p8LoopOneShot.playingAfterExplicitPlay = playedAgain.playing;
    results.p8LoopOneShot.opsQueueEmptyAfterLoad = srcB['_operationsBeforeLoading'].length === 0;

    return summary();
}

// 序列只跑一次：pal 的 ensurePlaying 会在 play() 被拒时往 #GameCanvas 再挂一个 mouseup 重试，
// 不加闩锁的话第二次点击会整段重跑（started/ended 计数翻倍 ⇒ summary 与 probeEquals 全飘）。
let sequenceStarted = false;
canvasNode.on(Node.EventType.TOUCH_START, () => {
    if (sequenceStarted) {
        return summary();
    }
    sequenceStarted = true;
    return runSequence();
});

// ---------------------------------------------------------------- 资源生命周期（§25 合同）
function heldAssets() {
    return [{ name: 'toneClip', ref: clip }];
}

installAssetLifecycle({
    label: 'audio-basic',
    hold: heldAssets,
    release: () => {
        for (const s of [srcA, srcB]) {
            s.stop();
            s.clip = null;
        }
        // ⚠️ `clip.destroy()` 单独调用不等于释放：loadRemote 把结果按 URL 缓存进 assetManager.assets，
        // 而 release-manager._free 第 235 行对已失效对象直接 return ⇒ 缓存条目留下，下次同 URL 的
        // loadRemote 在 asset-manager.ts:654 命中缓存并把这个已销毁实例交回 AudioSource ⇒
        // console.error 'Invalid audio clip'（audio-source.ts:133）、reacquire 拿到 invalid asset。
        // 实测：本合同先前用 clip.destroy() 时 v11 验证器 resource-released FAIL
        // （"toneClip invalid after reacquire"，docs/evidence/v11-examples-verified.json）。
        // 正解是在 asset 仍有效时走 releaseAsset（tryRelease 的 force 分支才会 assets.remove + destroy）。
        assetManager.releaseAsset(clip);
        clip = null;
    },
    reacquire: async () => {
        clip = await loadRemote(CLIP_URL);
        srcB.clip = clip;
        srcA.clip = clip;
        await sleep(250);
        return heldAssets();
    },
});

window.__airApp = app;
window.__runSequence = runSequence;
window.__assets = () => ({
    clip: clip ? clip.constructor.name : null,
    clipNativeUrl: clip ? clip.nativeUrl : null,
    held: heldAssets().map((e) => e.name),
    bins: bins.length,
});
app.run(scene);

/**
 * 底层播放器视图：`AudioSource._player`(facade) → `_ccprivate$_player`(pal impl)。
 * webkit 走 DOM 分支（`_ccprivate$_domAudio`），chromium/firefox 走 WebAudio 分支。
 * 两次采样差 `srcBDelta` 用来判别「AudioSource 报 PLAYING 但媒体元素没走表」这类假播放。
 */
function playerView(src) {
    const facade = src['_player'];
    if (!facade) {
        return null;
    }
    const impl = facade['_ccprivate$_player'];
    const dom = safe(() => impl['_ccprivate$_domAudio']);
    const out = {
        backend: dom && dom !== 'ERR' ? 'dom' : 'web',
        facadeState: stateOf(facade.state),
        facadeType: facade.type,
        implCtor: impl ? impl.constructor.name : null,
    };
    if (out.backend === 'dom') {
        Object.assign(out, {
            paused: dom.paused,
            ended: dom.ended,
            seeking: dom.seeking,
            readyState: dom.readyState,
            currentTime: r(dom.currentTime, 3),
            duration: r(dom.duration, 3),
            loop: dom.loop,
            errCode: dom.error ? dom.error.code : 0,
            playedLen: dom.played.length,
        });
    } else {
        const buf = safe(() => impl['_ccprivate$_nativeAudio']);
        out.nativeCtor = buf && buf !== 'ERR' && buf.constructor ? buf.constructor.name : null;
    }
    return out;
}

window.__probe = async () => {
    const b0 = safe(() => playerView(srcB));
    await sleep(600);
    const b1 = safe(() => playerView(srcB));
    return {
        results,
        live: {
            srcA: safe(() => snap(srcA, 'liveA')),
            srcB: safe(() => snap(srcB, 'liveB')),
            players: {
                srcA: safe(() => playerView(srcA)),
                srcB: b1,
                srcBAtT0: b0,
                srcBDelta:
                    b0 && b1 && typeof b0.currentTime === 'number' && typeof b1.currentTime === 'number'
                        ? r(b1.currentTime - b0.currentTime, 3)
                        : null,
            },
            canvasChildren: canvasNode.children.length,
            endedCount,
            startedCount,
            events: events.slice(0, 8).join('|'),
        },
        summary: status.string,
        phaseKeys: Object.keys(results).length,
    };
};
