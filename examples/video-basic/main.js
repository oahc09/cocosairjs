/**
 * Cocos Air — video-basic（LV12-04 · 计划书 A3：HTMLVideoElement 挂载 / 透明 video / 全屏切换 / 事件回调）
 *
 * 计划书 A3 四个验证要点在本文件里的落点（逐条对应 `results.p*`）：
 * ① **HTMLVideoElement 挂载**（P1/P6）：`createVideoPlayer` 往 `game.container` 追加
 *   `<video class="cocosVideo">`（video-player-impl-web.ts:254-276），换源先 `removeVideoPlayer`
 *   再挂新的（:239-252）⇒「DOM 里恰好 1 个 video 元素」是一个真的泄漏计数器，不是装饰断言。
 * ② **透明 video**（P4 + 点击收尾）：`stayOnBottom=true` 把 video 压到 `z-index:-32768`，并把渲染层
 *   相机的 `clearColor.w` 改成 0、`clearFlag` 改成 ALL（video-player-impl-web.ts:334-352）——前提是
 *   swapchain 以 `alpha:true` 创建（`macro.ENABLE_TRANSPARENT_CANVAS`，本文件第一件事就是打开它，因为
 *   webgl2-swapchain.ts:127/142 只在建立 swapchain 时读一次）。机检四件套：计算样式 z-index、
 *   `document.elementFromPoint` 的命中层翻转（VIDEO→CANVAS）、**scene camera**（`impl.UICamera`，
 *   不是组件上的 `cam`，实测两者不同对象）的 clearColor/clearFlag、以及 `gl.getContextAttributes().alpha`。
 * ③ **全屏切换**（点击回调内）：引擎有两条路，本示例两条都跑到，但它们**不等价**——
 *   `screen.requestFullScreen()` / `exitFullScreen()`（v3.3 起的现行签名，无 element 参数）双向可用；
 *   而 `player.fullScreenOnAwake` 只有在 **clip 装载之前**设置才有效（awake 路在 `readyState!==4` 时
 *   从 `canFullScreen` 早退，改用 `visibleRect` 把 video 放大到视口 = 几何全屏）。加载完成后置真会走
 *   deprecated 重载 `screen.requestFullScreen(video, cb)`，那条路上 `video` 参数被整个忽略（PAL 自己
 *   选目标，实测 `document.body`）、`cb` 又被零参调用 ⇒ 形参 `document` 是 undefined ⇒ 引擎抛
 *   TypeError 并 `console.error`，且错误回调把 `impl._fullScreenOnAwake` 写成 false 后组件再赋 false
 *   会被 setter 的同值卫兵吞掉 ⇒ 永远退不出来。三引擎矩阵的 `noConsoleError` 不容许这条，所以
 *   本示例用第二个播放器只跑 awake 路，跑完即销毁（同时充当 `<video>` 泄漏计数器）。完整链见
 *   `docs/v12-video-notes.md` 与台账 F-103。
 * ④ **事件回调**（P2/P3/P7）：`__preload` 把 8 个事件名装进 `componentEventList`
 *   （video-player.ts:402-410），而 `dispatchEvent` 只在表里有 key 时才改 `_state`
 *   （video-player-impl.ts:229-235）⇒ `player.state` 的取值序列本身就是回调链跑通的证据；
 *   另外挂一条 `videoPlayerEvent`（EventHandler → 具名组件方法）覆盖编辑器/序列化那条回调线。
 *
 * 资产 `assets/clip.mp4`（H.264 baseline / yuv420p / 160x120 / 15fps / 3.000 s / 无音频轨 /
 * faststart，25,279 B）由 `tools/fixtures/make-video-mp4.cjs` 再生成；**格式是三引擎真实解码探测选出来的，
 * 不是 canPlayType**（详见 docs/v12-video-notes.md 与 §6.4 的教训：webkit 对 vp8 webm 报
 * "probably" 却 `duration=NaN`、`play()` 仍 resolve、`currentTime` 跳到 3、帧恒黑）。
 * 160x120 这个尺寸本身就是断言值：`keepAspectRatio` 会用 videoWidth/Height 覆盖 UITransform
 * （video-player-impl.ts:237-243 `syncUITransform`）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Component,
    EventHandler,
    UITransform,
    Layers,
    Color,
    Label,
    GraphicsComponent,
    VideoPlayer,
    VideoClip,
    assetManager,
    macro,
    screen,
    js,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const screenApiProbe = { supportsFullScreen: screen.supportsFullScreen, isFullScreen: screen.isFullScreen };

/** 必须在 createAirApp 之前：swapchain 建立时才读这个开关（见文件头 ②）。 */
macro.ENABLE_TRANSPARENT_CANVAS = true;

const CLIP_URL = './assets/clip.mp4';
const UI_LAYER = Layers.Enum.UI_3D;
/** 矩阵契约的 `click` 坐标：VideoHost 在 (0,-10)、contentSize 160x120 ⇒ 页面坐标 (240,190)。 */
const CLICK_X = 240;
const CLICK_Y = 190;
const T0 = performance.now();

const r = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (fn) => {
    try {
        return fn();
    } catch (e) {
        return 'ERR:' + ((e && (e.name || e.message)) || String(e));
    }
};
const num = (v) => (Number.isFinite(v) ? r(v) : String(v));

/** 轮询到条件成立返回实际耗时（ms），超时返回 -1。 */
async function waitFor(fn, timeoutMs = 3000, stepMs = 20) {
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

/**
 * `assetManager.loadRemote` 只有回调式签名（asset-manager.ts:652-671 返回 `void`），
 * 直接 `await` 会拿到 `undefined` —— Code First 示例统一用这层 promise 包装。
 */
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

// ---------------------------------------------------------------- 场景
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('v12-video-basic');
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
status.string = 'video: loading';
status.color = new Color(220, 228, 240, 255);
status.fontSize = 14;
status.lineHeight = 17;

const hintNode = new Node('Hint');
hintNode.layer = UI_LAYER;
hintNode.addComponent(UITransform).width = 460;
hintNode.getComponent(UITransform).height = 30;
hintNode.setPosition(0, -150, 0);
canvasNode.addChild(hintNode);
const hint = hintNode.addComponent(Label);
hint.string = 'click the video to toggle fullscreen';
hint.color = new Color(140, 150, 168, 255);
hint.fontSize = 12;
hint.lineHeight = 15;

/**
 * 画布侧的「还在渲染」证据必须画在 WebGL 画布里：v11 的 `frame-diff/visible-frame` 用
 * `gl.readPixels` 采样默认帧缓冲 ⇒ **DOM `<video>` 根本不在那张图上**。所以这里放一条
 * 由 `performance.now()` 驱动的扫描条 + 一个 video 矩形描边框，三引擎都有牙。
 */
const guideNode = new Node('FrameGuide');
guideNode.layer = UI_LAYER;
guideNode.addComponent(UITransform).width = 480;
guideNode.getComponent(UITransform).height = 360;
canvasNode.addChild(guideNode);
const guide = guideNode.addComponent(GraphicsComponent);

const clockNode = new Node('Clock');
clockNode.layer = UI_LAYER;
clockNode.addComponent(UITransform).width = 420;
clockNode.getComponent(UITransform).height = 12;
clockNode.setPosition(0, -124, 0);
canvasNode.addChild(clockNode);
const clockGfx = clockNode.addComponent(GraphicsComponent);

class FrameClock extends Component {
    update() {
        const phase = (performance.now() % 2400) / 2400;
        clockGfx.clear();
        clockGfx.fillColor = new Color(28, 200, 120, 255);
        clockGfx.rect(-210 + phase * 400, -6, 20, 12);
        clockGfx.fill();
        clockGfx.strokeColor = new Color(90, 100, 120, 255);
        clockGfx.lineWidth = 1;
        clockGfx.rect(-210, -6, 420, 12);
        clockGfx.stroke();
        if (player && player.nativeVideo) {
            guide.clear();
            guide.strokeColor = new Color(250, 190, 80, 255);
            guide.lineWidth = 2;
            guide.rect(-80, -10, 160, 120); // VideoHost 世界矩形（anchor 0.5,0.5，节点在 (0,-10)）
            guide.stroke();
        }
    }
}
const clockHost = new Node('ClockHost');
clockHost.layer = UI_LAYER;
canvasNode.addChild(clockHost);
clockHost.addComponent(FrameClock);

/** `videoPlayerEvent` 的目标组件：EventHandler 用**类名字符串**找组件（component-event-handler.ts:156-175） */
class VideoEventLog extends Component {
    onVideoEvent(playerArg, evtType, customData) {
        eventLog.push('handler:' + evtType);
        handlerHits++;
        lastHandlerArgs = { hasPlayer: !!playerArg, type: evtType, custom: customData };
    }
}
js.setClassName('V12VideoEventLog', VideoEventLog);

let hostNode = null;
let player = null;
let clip = null;
const eventLog = [];
let handlerHits = 0;
let lastHandlerArgs = null;
let clickedEvents = 0;
let completedEvents = 0;

const results = { phase: 'init', startedAtMs: 0 };

/** DOM `<video>` 计数：泄漏检测的唯一真相源。 */
const domVideos = () => document.querySelectorAll('video');

/** 真的把解码帧采样成数字（同源资产，画布不被污染）：证明「出图」而不是「元素挂上了」。 */
const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = 160;
sampleCanvas.height = 120;
const sampleCtx = sampleCanvas.getContext('2d');
function videoFrameStats(v) {
    if (!v) {
        return null;
    }
    try {
        sampleCtx.drawImage(v, 0, 0, 160, 120);
        const d = sampleCtx.getImageData(0, 0, 160, 120).data;
        let sum = 0;
        let nonBlack = 0;
        const bins = new Set();
        for (let i = 0; i < d.length; i += 4) {
            const px = (d[i] + d[i + 1] + d[i + 2]) / 3;
            sum += px;
            if (px > 8) {
                nonBlack++;
            }
            bins.add(((d[i] >> 5) << 10) | ((d[i + 1] >> 5) << 5) | (d[i + 2] >> 5));
        }
        return {
            mean: r(sum / (d.length / 4), 2),
            nonBlackRatio: r(nonBlack / (d.length / 4), 3),
            colorBins: bins.size,
        };
    } catch (e) {
        return { err: String((e && e.name) || e) };
    }
}

function mountPlayer() {
    hostNode = new Node('VideoHost');
    hostNode.layer = UI_LAYER;
    hostNode.addComponent(UITransform).setContentSize(160, 120);
    hostNode.setPosition(0, -10, 0);
    canvasNode.addChild(hostNode);
    player = hostNode.addComponent(VideoPlayer);
    player.resourceType = VideoPlayer.ResourceType.LOCAL;
    player.playOnAwake = false;
    player.mute = true; // 静音才谈得上「脚本 autoplay」：三引擎才会真起播
    player.loop = false;
    player.keepAspectRatio = true;
    player.volume = 0.4;
    player.playbackRate = 1;
    const log = hostNode.addComponent(VideoEventLog);
    const eh = new EventHandler();
    eh.target = hostNode;
    eh.component = 'V12VideoEventLog';
    eh.handler = 'onVideoEvent';
    eh.customEventData = 'via-videoPlayerEvent';
    player.videoPlayerEvent = [eh];
    for (const name of [
        'meta-loaded',
        'ready-to-play',
        'playing',
        'paused',
        'stopped',
        'completed',
        'error',
        'clicked',
    ]) {
        hostNode.on(name, (p) => {
            eventLog.push(name);
            if (name === 'clicked') {
                clickedEvents++;
            }
            if (name === 'completed') {
                completedEvents++;
            }
        });
    }
    return log;
}

function heldAssets() {
    const out = [];
    if (clip) {
        out.push({ name: 'videoClip', ref: clip });
    }
    if (player) {
        out.push({ name: 'videoPlayer', ref: player });
    }
    return out;
}

// ---------------------------------------------------------------- P0 运行时资产（Code First，无 .meta / 无 uuid 依赖图）
async function p0Asset() {
    const c = await loadRemote(CLIP_URL);
    const native = c._nativeAsset;
    const sourceChild = native ? native.querySelector('source') : null;
    results.p0Asset = {
        clipCtor: c.constructor.name,
        isVideoClip: c instanceof VideoClip,
        nativeTag: native ? native.tagName : null,
        // downloader 把 blob URL 挂在 <video> 的**子 <source>** 上（video-downloader.ts:36-46），
        // 所以 `video.currentSrc` 在这一刻还是空串，不是「没拿到数据」。
        videoCurrentSrcEmpty: native ? String(native.currentSrc) === '' : null,
        sourceChildSrcScheme: sourceChild ? String(sourceChild.src).slice(0, 5) : null,
        nativeUrlIsRequestUrl: c.nativeUrl === CLIP_URL,
        clipDurationField: num(c._duration),
        nativeElDurationAtLoad: num(native && native.duration),
        cacheHasUrl: assetManager.assets.has(CLIP_URL),
    };
    return c;
}

// ---------------------------------------------------------------- P1 HTMLVideoElement 挂载
async function p1Mount(c) {
    player.clip = c; // LOCAL 分支：syncClip → createVideoPlayer(clip.nativeUrl)
    const metaMs = await waitFor(() => eventLog.includes('meta-loaded'), 6000);
    const readyMs = await waitFor(() => eventLog.includes('ready-to-play'), 3000);
    await waitFor(() => player.state === VideoPlayer.EventType.READY_TO_PLAY, 1000);
    const v = player.nativeVideo;
    const rect = v ? v.getBoundingClientRect() : null;
    results.p1Mount = {
        metaLoadedWithinMs: metaMs,
        readyToPlayWithinMs: readyMs,
        videoCount: domVideos().length,
        className: v ? v.className : null,
        inGameContainer: v ? !!(v.parentElement && v.parentElement.id === 'Cocos3dGameContainer') : false,
        visibility: v ? v.style.visibility : null,
        playsinlineAttrs: v
            ? [
                  v.getAttribute('playsinline'),
                  v.getAttribute('webkit-playsinline'),
                  v.getAttribute('x5-playsinline'),
              ].join(',')
            : null,
        videoWidth: v ? v.videoWidth : null,
        videoHeight: v ? v.videoHeight : null,
        duration: v ? num(v.duration) : null,
        readyState: v ? v.readyState : null,
        stateAfterMeta: player.state,
        contentSize: [
            r(hostNode.getComponent(UITransform).width, 1),
            r(hostNode.getComponent(UITransform).height, 1),
        ].join('x'),
        domRect: rect ? [r(rect.left, 1), r(rect.top, 1), r(rect.width, 1), r(rect.height, 1)].join(',') : null,
        clipFieldEqualsLoaded: player.clip === c,
        resourceTypeName: player.resourceType === VideoPlayer.ResourceType.LOCAL ? 'LOCAL' : 'REMOTE',
    };
    status.string = 'video meta ok';
}

// ---------------------------------------------------------------- P2 事件回调序列（含 EventHandler 组件回调）
function p2Events() {
    const first = (n) => eventLog.indexOf(n);
    results.p2Events = {
        firstMetaLoaded: first('meta-loaded'),
        firstReadyToPlay: first('ready-to-play'),
        metaBeforeReady: first('meta-loaded') >= 0 && first('ready-to-play') > first('meta-loaded'),
        handlerHitsAtMeta: handlerHits,
        handlerHitsPositive: handlerHits > 0,
        lastHandlerArgs,
        classByNameMatches: js.getClassByName('V12VideoEventLog') === VideoEventLog,
        stateIsEventTypeEnum: Object.values(VideoPlayer.EventType).includes(player.state),
        logPrefix: eventLog.slice(0, 3).join('>'),
    };
}

// ---------------------------------------------------------------- P3 播控：play/pause/resume/seek/rate/volume/mute/loop
async function p3Controls() {
    player.play();
    const playingMs = await waitFor(() => player.state === VideoPlayer.EventType.PLAYING && player.isPlaying, 3000);
    const t0 = player.currentTime;
    await sleep(400);
    const t1 = player.currentTime;
    player.pause();
    const pausedMs = await waitFor(() => player.state === VideoPlayer.EventType.PAUSED, 1500);
    const frozenA = player.currentTime;
    await sleep(300);
    const frozenB = player.currentTime;
    player.resume();
    await waitFor(() => player.currentTime > frozenA + 0.05, 2000);
    const resumed = player.currentTime;

    player.currentTime = 1.2;
    await sleep(120);
    const seeked = player.currentTime;

    const v = player.nativeVideo;
    player.playbackRate = 2;
    const rateReadback = [player.playbackRate, r(v.playbackRate, 2)];
    player.playbackRate = 1;

    const volOk = [num(player.volume), num(v.volume)];
    // ⚠️ `VideoPlayer.volume` 不做任何区间校验：setter 先把 `_volume` 落地、再直写 DOM
    // （video-player.ts:181-186 → impl :136-140），所以越界值会**抛出 DOM 异常**而引擎字段已经脏了。
    // 对照：`AudioSource.volume` 把越界裁到 [0,1]、NaN 直接忽略。这里必须 try/catch，否则整条序列被抛断。
    const volThrowOutOfRange = safe(() => {
        player.volume = 5;
        return 'assigned';
    });
    const volFieldAfterThrow = num(player.volume);
    const volDomAfterThrow = num(v.volume);
    player.volume = 0.4;
    const volThrowNaN = safe(() => {
        player.volume = Number.NaN;
        return 'assigned';
    });
    const volFieldAfterNaN = num(player.volume);
    const volDomAfterNaN = num(v.volume);
    player.volume = 0.4;

    player.loop = true;
    const loopOn = v.loop;
    player.loop = false;
    const loopOff = v.loop;

    player.mute = false;
    const domMutedOff = v.muted;
    player.mute = true;

    results.p3Controls = {
        playingWithinMs: playingMs,
        startedAt: num(t0),
        advancedWhilePlaying: t1 > t0 + 0.05,
        tAfter400ms: num(t1),
        pausedWithinMs: pausedMs,
        frozenWhilePaused: Math.abs(frozenB - frozenA) < 0.02,
        resumedFromOffset: resumed > frozenA + 0.02,
        seekLandedNear12: Math.abs(seeked - 1.2) < 0.35,
        seekedTo: num(seeked),
        rateReadback,
        volOk,
        volThrowOutOfRange,
        volFieldAfterThrow,
        volDomAfterThrow,
        volThrowNaN,
        volFieldAfterNaN,
        volDomAfterNaN,
        loopReadback: [loopOn, loopOff],
        muteReadback: [domMutedOff, v.muted],
        stateNow: player.state,
    };
    status.string = 'video controls ok';
}

// ---------------------------------------------------------------- P4 透明 video：stayOnBottom 三面回读
async function p4Transparency() {
    const v = player.nativeVideo;
    const gl = (() => {
        try {
            return canvasEl.getContext('webgl2') || canvasEl.getContext('webgl');
        } catch (e) {
            return null;
        }
    })();
    // ⚠️ 这些量必须在 setter **之前**取成 const：第一版把它们写在 results 字面量里求值，
    //   于是 `zIndexBefore` 读到的是 setter 之后的 -32768，与同一对象里的 `hitBeforeTag=VIDEO`
    //   自相矛盾（负 z-index 不可能还命中顶层）——即「快照晚于变更」的取证缺陷，不是引擎行为。
    const zIndexBefore = getComputedStyle(v).zIndex;
    const hitBefore = document.elementFromPoint(CLICK_X, CLICK_Y);
    const clearBefore = r(cam.clearColor.w, 3);
    const flagBefore = cam.clearFlag;
    const implCam = player._impl ? player._impl.UICamera : null;
    const sceneClearAlphaBefore = implCam ? r(implCam.clearColor.w, 3) : null;
    const sceneFlagBefore = implCam ? implCam.clearFlag : null;
    player.stayOnBottom = true;
    await sleep(200);
    const hitAfter = document.elementFromPoint(CLICK_X, CLICK_Y);
    results.p4Transparency = {
        macroTransparentCanvas: macro.ENABLE_TRANSPARENT_CANVAS === true,
        glContextAlpha: gl && gl.getContextAttributes ? gl.getContextAttributes().alpha : null,
        zIndexBefore,
        zIndexAfterBottom: getComputedStyle(v).zIndex,
        clearColorAlphaBefore: clearBefore,
        clearColorAlphaAfterBottom: r(cam.clearColor.w, 3),
        clearFlagBefore: flagBefore,
        clearFlagAfterBottom: cam.clearFlag,
        // ⚠️ `syncMatrix` 写的是 `impl.UICamera`，那是**渲染层 scene camera**，不是组件上的 `cam`：
        //   实测 `uiCameraIsComponentCamera false`（同名 'UICamera' 的两个对象）。
        //   只读组件侧 `cam.clearColor.w` 会永远看到 1，从而把「引擎没做透明」误判出来——
        //   所以引擎真正改的那个对象也必须单独回读。
        uiCameraIsComponentCamera: implCam === cam,
        uiCameraName: implCam ? String(implCam.name) : null,
        sceneClearAlphaBefore,
        sceneClearAlphaAfterBottom: implCam ? r(implCam.clearColor.w, 3) : null,
        sceneClearFlagChanged: !!implCam && implCam.clearFlag !== sceneFlagBefore,
        hitBeforeTag: hitBefore ? hitBefore.tagName : null,
        hitAfterBottomTag: hitAfter ? hitAfter.tagName : null,
        hitTestFlipped: !!hitBefore && !!hitAfter && hitBefore.tagName !== hitAfter.tagName,
    };
    player.stayOnBottom = false;
    await sleep(200);
    results.p4Transparency.clearColorAlphaRestored = r(cam.clearColor.w, 3);
    results.p4Transparency.sceneClearAlphaRestored = implCam ? r(implCam.clearColor.w, 3) : null;
    results.p4Transparency.zIndexRestored = getComputedStyle(v).zIndex;
    status.string = 'video transparency ok';
}

// ---------------------------------------------------------------- P5 几何：keepAspectRatio / objectFit / 解码帧采样
async function p5Geometry() {
    const v = player.nativeVideo;
    const ui = hostNode.getComponent(UITransform);
    const fitKeep = v.style.objectFit;
    const sizeKeep = [r(ui.width, 1), r(ui.height, 1)].join('x');
    player.keepAspectRatio = false;
    await sleep(120);
    const fitFill = v.style.objectFit;
    player.keepAspectRatio = true;
    await sleep(120);
    // 采样两帧之前必须真的在播：P3 收尾时播放头是 seek 后的静止态，暂停态下 `drawImage` 两次
    // 拿到同一帧 ⇒ `decodedFramesAdvance false` 是**取样条件错**，不是「解码器没出图」。
    const playingBeforeSample = player.isPlaying;
    if (!playingBeforeSample) {
        player.play();
        await waitFor(() => player.isPlaying, 2000);
    }
    const f0 = videoFrameStats(v);
    await sleep(420);
    const f1 = videoFrameStats(v);
    results.p5Geometry = {
        objectFitKeepAspectRatio: fitKeep,
        objectFitAfterFalse: fitFill,
        objectFitRestored: v.style.objectFit,
        contentSizeFromVideo: sizeKeep,
        contentSizeUnchangedByToggle: [r(ui.width, 1), r(ui.height, 1)].join('x') === sizeKeep,
        playingBeforeSample,
        frameA: f0,
        frameB: f1,
        decodedFramesAdvance: !!(
            f0 &&
            f1 &&
            f0.mean !== undefined &&
            f1.mean !== undefined &&
            (f0.mean !== f1.mean || f0.colorBins !== f1.colorBins)
        ),
        frameNotBlank: !!(f1 && f1.mean > 20 && f1.nonBlackRatio > 0.5),
    };
    status.string = 'video geometry ok';
}

// ---------------------------------------------------------------- P6 换源：LOCAL(clip) → REMOTE(url) → LOCAL(clip)
async function p6SourceSwitch() {
    const before = player.nativeVideo;
    const logBefore = eventLog.length;
    player.resourceType = VideoPlayer.ResourceType.REMOTE; // 先翻枚举：_remoteURL 还是空 ⇒ removeVideoPlayer 后无源
    const countAfterEnum = domVideos().length;
    player.remoteURL = CLIP_URL;
    const waitRemote = await waitFor(
        () => eventLog.length > logBefore && eventLog.slice(logBefore).includes('meta-loaded'),
        6000,
    );
    const remoteVideo = player.nativeVideo;
    player.resourceType = VideoPlayer.ResourceType.LOCAL;
    player.clip = clip;
    const waitBack = await waitFor(() => eventLog.slice(eventLog.length - 3).includes('meta-loaded'), 6000);
    const after = player.nativeVideo;
    results.p6SourceSwitch = {
        videoCountAfterEnumOnly: countAfterEnum,
        remoteMetaWithinMs: waitRemote,
        backToLocalWithinMs: waitBack,
        elementRecreated: before !== remoteVideo && remoteVideo !== after,
        videoCountAfterSwitch: domVideos().length,
        oldElementDetached: !document.contains(before),
        resourceTypeName: player.resourceType === VideoPlayer.ResourceType.LOCAL ? 'LOCAL' : 'REMOTE',
        sameUrlBothPaths: player.remoteURL === clip.nativeUrl,
    };
    status.string = 'video source switch ok';
}

// ---------------------------------------------------------------- P7 自然播完 → COMPLETED；P8 loop 回绕不出 completed
async function p7Completed() {
    const before = completedEvents;
    player.currentTime = 2.9;
    const doneMs = await waitFor(() => completedEvents > before, 2500);
    await sleep(200);
    results.p7Completed = {
        completedWithinMs: doneMs,
        endedDelta: completedEvents - before,
        stateAfterEnd: player.state,
        isPlayingAfterEnd: player.isPlaying,
        currentTimeAfterEnd: num(player.currentTime),
        clampedBeyondDuration: (() => {
            player.currentTime = 99;
            return [num(player.currentTime), num(player.duration)];
        })(),
    };

    player.loop = true;
    player.play();
    await waitFor(() => player.state === VideoPlayer.EventType.PLAYING, 2000);
    const beforeLoop = completedEvents;
    // seek 目标离片尾留 1 s 余量，并等 seek 落地再看回绕：P7 末尾把 currentTime 置成 99（钳到 3 = 片尾），
    // 此时 2.7 这类「几乎贴着片尾」的回跳在 webkit 上会与 loop 重启抢次序——实测 in-flight seek
    // (ct=3, seeking=1) 之后元素停在 seek 目标 2.704 且 paused，不回绕也不报错。
    player.currentTime = 2.0;
    const seekSettledMs = await waitFor(() => {
        const v = player.nativeVideo;
        return !!v && !v.seeking && v.currentTime >= 1.9 && v.currentTime <= 2.3;
    }, 2000);
    const wrapMs = await waitFor(() => player.currentTime < 1.0, 3000);
    results.p8Loop = {
        wrappedBelowSeekTarget: wrapMs >= 0,
        seekSettledWithinMs: seekSettledMs,
        wrapWithinMs: wrapMs,
        completedDeltaDuringLoop: completedEvents - beforeLoop,
        stateNow: player.state,
        currentTimeNow: num(player.currentTime),
    };
    status.string = 'video loop ok';
}

// ---------------------------------------------------------------- 点击：CLICKED → 全屏双向 → 收尾停在透明 video
const tagOf = (el) => (el ? `${el.tagName}${el.id ? `#${el.id}` : ''}` : 'null');
const errStr = (e) => String((e && (e.name || e.message)) || e).slice(0, 120);
const rectOf = (el) => {
    const b = el.getBoundingClientRect();
    return `${r(b.width, 1)}x${r(b.height, 1)}`;
};

let clickPhaseStarted = false;
async function onUserClick() {
    if (clickPhaseStarted) {
        return;
    }
    clickPhaseStarted = true;
    const v = player.nativeVideo;
    const out = {
        clickedEventsAtGesture: clickedEvents,
        supportsFullScreen: screen.supportsFullScreen,
        before: { fsEl: tagOf(document.fullscreenElement), videoRect: rectOf(v), videoCount: domVideos().length },
    };

    // A. 引擎 API 对（`screen.requestFullScreen()` / `screen.exitFullScreen()`，v3.3 起的现行签名）。
    //    必须 await + catch：非全屏态下 `document.exitFullscreen()` 会 reject
    //    （`Failed to execute 'exitFullscreen' on 'Document': Document not active`），
    //    引擎内部那条不 catch ⇒ 一条 pageerror 就把矩阵打死。
    try {
        await screen.requestFullScreen();
        out.enterResolved = true;
    } catch (e) {
        out.enterError = errStr(e);
    }
    await sleep(400);
    out.during = {
        fsEl: tagOf(document.fullscreenElement),
        isFullScreen: screen.isFullScreen,
        videoRect: rectOf(v),
        videoCount: domVideos().length,
    };
    try {
        await screen.exitFullScreen();
        out.exitResolved = true;
    } catch (e) {
        out.exitError = errStr(e);
    }
    out.exitSettledWithinMs = await waitFor(() => !document.fullscreenElement, 2000);
    out.after = { fsEl: tagOf(document.fullscreenElement), isFullScreen: screen.isFullScreen, videoRect: rectOf(v) };
    // B. VideoPlayer 自己的全屏：只有 **awake 路**（clip 之前就置 `fullScreenOnAwake=true`）可用。
    //    加载完成后再置真会走 `screen.requestFullScreen(video, cb)`（deprecated 重载）：element 参数被
    //    忽略（真目标由 PAL 自己选，实测是 `document.body`），而 cb 被零参调用 ⇒ 形参 `document`
    //    是 undefined ⇒ 引擎自己抛 TypeError。所以这里用**第二个播放器**跑 awake 路，跑完即销毁。
    const fsNode = new Node('FSHost');
    fsNode.layer = UI_LAYER;
    fsNode.addComponent(UITransform).setContentSize(160, 120);
    fsNode.setPosition(0, -10, 0);
    canvasNode.addChild(fsNode);
    const fsPlayer = fsNode.addComponent(VideoPlayer);
    fsPlayer.resourceType = VideoPlayer.ResourceType.LOCAL;
    fsPlayer.playOnAwake = false;
    fsPlayer.mute = true;
    fsPlayer.fullScreenOnAwake = true; // ← 关键：必须在 clip 之前
    out.awakeVideoCountBeforeClip = domVideos().length;
    fsPlayer.clip = clip; // 复用同一已解码资产（不再 loadRemote）
    const fsMetaMs = await waitFor(() => fsPlayer.nativeVideo && fsPlayer.nativeVideo.readyState >= 1, 6000);
    await sleep(320); // 给 syncMatrix 几帧
    const fv = fsPlayer.nativeVideo;
    out.awake = {
        metaWithinMs: fsMetaMs,
        fullScreenOnAwakeReadback: fsPlayer.fullScreenOnAwake,
        videoCount: domVideos().length,
        fsEl: tagOf(document.fullscreenElement), // 期望 null：awake 路不碰 DOM 全屏 API
        rect: fv ? rectOf(fv) : null,
        styleWH: fv ? `${fv.style.width}x${fv.style.height}` : null,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        grewToViewport: !!fv && r(fv.getBoundingClientRect().width, 0) === r(window.innerWidth, 0),
        mainPlayerUnaffected: rectOf(v),
    };
    fsPlayer.pause();
    fsNode.destroy();
    await sleep(320);
    out.awakeAfterDestroy = { videoCount: domVideos().length, mainPlayerRect: rectOf(v) };

    player.stayOnBottom = true;
    await sleep(260);
    const hit = document.elementFromPoint(CLICK_X, CLICK_Y);
    out.endState = {
        stayOnBottomZIndex: getComputedStyle(v).zIndex,
        hitTag: hit ? hit.tagName : null,
        clearColorAlpha: r(cam.clearColor.w, 3),
    };
    results.p9Fullscreen = out;
    status.string = 'video fullscreen ok';
}

async function runSequence() {
    results.startedAtMs = Math.round(performance.now() - T0);
    const c = await p0Asset();
    clip = c;
    mountPlayer();
    await p1Mount(c);
    p2Events();
    await p3Controls();
    await p4Transparency();
    await p5Geometry();
    await p6SourceSwitch();
    await p7Completed();
    hostNode.on('clicked', onUserClick); // CLICKED 由引擎的 DOM click 监听转发（video-player.ts:477-480）
    results.sequenceComplete = true;
    results.sequenceMs = Math.round(performance.now() - T0);
    status.string = 'video ready — click to fullscreen';
}

// ---------------------------------------------------------------- §25 生命周期合同：真释放 + 真重建
installAssetLifecycle({
    label: 'video-basic',
    hold: heldAssets,
    release: () => {
        // ⚠️ 只 destroy 组件/节点不够：`loadRemote` 以 URL 为键缓存，`release-manager._free`
        //   对已失效资产提前 return ⇒ 光 destroy 会让第二次 loadRemote 交回**已销毁实例**（F-102）。
        //   正确姿势是「资产还有效时」走 assetManager.releaseAsset(clip)。
        if (player) {
            player.pause();
        }
        hostNode.destroy();
        hostNode = null;
        player = null;
        assetManager.releaseAsset(clip);
        clip = null;
    },
    reacquire: async () => {
        clip = await loadRemote(CLIP_URL);
        mountPlayer();
        player.clip = clip;
        player.mute = true;
        player.loop = true;
        await sleep(400);
        player.play();
        await sleep(400);
        return heldAssets();
    },
});

window.__airApp = app;
window.__runSequence = runSequence;
window.__assets = () => ({
    clip: clip ? clip.constructor.name : null,
    clipNativeUrl: clip ? clip.nativeUrl : null,
    held: heldAssets().map((e) => e.name),
    domVideos: domVideos().length,
});
app.run(scene);

window.__probe = async () => {
    const v = player ? player.nativeVideo : null;
    const timeBeforeSample = player ? player.currentTime : 0;
    const f0 = videoFrameStats(v);
    await sleep(420);
    const f1 = videoFrameStats(v);
    const timeAfterSample = player ? player.currentTime : 0;
    const rect = v ? v.getBoundingClientRect() : null;
    return {
        summary: status.string,
        phaseKeys: Object.keys(results).filter((k) => k.startsWith('p')).length,
        results,
        eventLog: eventLog.slice(),
        live: {
            screenApi: screenApiProbe,
            state: player ? player.state : null,
            isPlaying: player ? player.isPlaying : null,
            duration: player ? num(player.duration) : null,
            currentTimeAdvanced: player ? Math.abs(timeAfterSample - timeBeforeSample) > 0.01 : false,
            loop: player ? player.loop : null,
            volume: player ? num(player.volume) : null,
            playbackRate: player ? num(player.playbackRate) : null,
            videoCountInDom: domVideos().length,
            fullscreenElementIsNull: document.fullscreenElement === null,
            stayOnBottom: player ? player.stayOnBottom : null,
            domRect: rect ? [r(rect.width, 1), r(rect.height, 1)].join('x') : null,
            frameMeanNow: f1 ? num(f1.mean, 2) : null,
            liveFramesAdvance: !!(f0 && f1 && f0.mean !== undefined && f1.mean !== undefined && f0.mean !== f1.mean),
            statusString: status.string,
            elapsedMs: Math.round(performance.now() - T0),
        },
    };
};

await runSequence();
