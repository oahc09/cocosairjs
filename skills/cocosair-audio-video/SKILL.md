---
name: cocosair-audio-video
description: Drives Cocos AIR audio, video and WebView from code - AudioService business channels over AudioSource (load, playBgm, pauseBgm, resumeBgm, stopBgm, setBgmVolume, playSfx, setMusicEnabled, setSfxEnabled, bgmState, dispose, maxSfxVoices cap with sfxDropped), measured-currentTime playback evidence, browser autoplay gesture unlock, VideoPlayer DOM-overlay events and transparent video, WebView iframe limits and evaluateJS. Use when audio starts silently or play() seems ignored, when proving a channel actually advances, when a video or iframe must sit under or over the WebGL canvas, or when WebView loads the wrong URL on mount.
---

# Cocos AIR audio, video and WebView

Play background music and sound effects through `AudioService`, mount real `<video>` and `<iframe>` DOM overlays through `VideoPlayer` and `WebView`, and prove playback with measured time instead of boolean flags - all from code, no Creator pipeline.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Color, Vec3, AudioService } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist first
const scene = new Scene('av-demo');
const camNode = new Node('Main Camera'); scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 1.6, 4));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.near = 0.1; camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(20, 24, 34, 255);
app.run(scene);                        // async render loop: frames land on later ticks

const audio = new AudioService(scene);           // one service per scene
let ready = false;
audio.load('bgm', './assets/music.mp3').then(() => { ready = true; });   // load early, play on gesture

// Autoplay policy bans sound before a user gesture: start playback inside the click handler.
document.addEventListener('click', () => {
    if (!ready) { return; }            // clip not decoded yet: retry on the next click
    audio.setBgmVolume(0.6);           // [0,1]; throws AIR_E_AUDIO_VOLUME otherwise
    audio.playBgm('bgm');              // synchronous call within the gesture
}, { once: false });

let last = -1; const head = setInterval(() => {
    const state = audio.bgmState();    // { id, playing, currentTime, loop, volume }
    if (state) {                       // evidence = measured currentTime advancing, not playing=true
        console.log('bgm head', state.currentTime.toFixed(2), 's, dropped sfx', audio.sfxDropped);
        if (state.currentTime > last && last >= 0) { clearInterval(head); }
        last = state.currentTime;
    }
}, 250);

function teardown() {                  // cleanup runs on page teardown, never inline after app.run()
    clearInterval(head);
    audio.dispose();                   // stops every channel and destroys its AudioSource nodes
}
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp` and the async run loop.
- [cocosair-assets](../cocosair-assets/SKILL.md) - `assetManager.loadRemote` behind `AudioService.load`.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - node activation drives `__preload` for all three components.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - DOM overlay interaction, the same model video and WebView use.
- [cocosair-verification](../cocosair-verification/SKILL.md) - probes that read playback heads back from a real browser.

## When to use what

- "BGM + SFX channels, volume switches" -> `AudioService` (`src/air/audio-service.ts:46`); it wraps `AudioSource`, one persistent node per BGM id, one transient node per SFX voice.
- "single raw clip, seek, PCM data" -> `AudioSource` directly (`src/cocos/audio/audio-source.ts:63`); `AudioService` exposes no per-clip seek or `playOneShot` (`:430`).
- "play a real video in the scene rect" -> `VideoPlayer` (`src/cocos/video/video-player.ts:51`); it is a DOM `<video>`, not a texture - codec support is the browser's.
- "show a web page inside the app" -> `WebView` (`src/cocos/web-view/web-view.ts:48`); an iframe overlay, never rendered into the WebGL canvas.
- "did playback actually happen?" -> `audio.bgmState().currentTime` (`src/air/audio-service.ts:199-204`), `player.currentTime` after `PLAYING` (`src/cocos/video/video-player.ts:321`), iframe-side state for WebView.

## Contracts

- `AudioService` surface is exactly: `load` (`src/air/audio-service.ts:67`, `assetManager.loadRemote` at `:71`), `playBgm` (`:108`, throws for an unloaded id `:110`, pauses other channels `:111-113`), `pauseBgm` (`:120`), `stopBgm` (`:126`, zeroes the head, keeps the id), `setBgmVolume` (`:132`, `RangeError` code `AIR_E_AUDIO_VOLUME` `:134-136`), `resumeBgm` (`:145`, continues from the preserved head), `playSfx` (`:155`), `setMusicEnabled` (`:185`, pauses BGM when off), `setSfxEnabled` (`:191`), `bgmState` (`:199`), `dispose` (`:207`), plus getters `bgmId`/`musicEnabled`/`sfxEnabled`/`sfxActive` (`:97-101`).
- The SFX cap is real: option `maxSfxVoices` defaults to 5 (`src/air/audio-service.ts:61`), overflow fires increment `sfxDropped` and are dropped, never queued (`:159`); a voice frees its slot on `AudioSource.EventType.ENDED` (`:175`) with a bounded `setTimeout` fallback because autoplay rejection may emit no event (`:177-179`).
- `bgmState()` returns `{ id, playing, currentTime, loop, volume }` and `currentTime` is the measured clock (`src/air/audio-service.ts:23-32`, `:199-204`); the header comment records the discipline "playing=true alone does not prove the clock advances" (`:8`).
- Gesture unlock is a browser+PAL contract: the engine resumes the AudioContext on the first `touchend`/`mouseup` capture (`src/pal/audio/web/player-web.js:104-111`, DOM-audio path `src/pal/audio/web/player-dom.js:46-54`); `AudioSource.play()` documents that pre-gesture plays may be queued or rejected (`src/cocos/audio/audio-source.ts:351-354`), and pending ops are held until the clip loads (`:367-370`).
- `AudioSource` events are `STARTED='started'` and `ENDED='ended'` on the node (`src/cocos/audio/audio-source.ts:36-39`, `:69`, emitted `:165-167`, `:380-381`); `currentTime` get/set (`:480-500`), `duration` (`:508`), `state` (`:518`), `playing` (`:528`), `playOneShot` (`:430`).
- `VideoPlayer` events are `meta-loaded`, `ready-to-play`, `playing`, `paused`, `stopped`, `completed`, `error`, `clicked` (`src/cocos/video/video-player-enums.ts:48-95`), bridged from the `<video>` element in `__preload` (`src/cocos/video/video-player.ts:395-414`); `ResourceType.REMOTE|LOCAL` (`src/cocos/video/video-player-enums.ts:31-46`) with `play/resume/pause/stop` (`src/cocos/video/video-player.ts:492-533`) and `currentTime/duration/state/isPlaying/nativeVideo` (`:311-372`).
- Video is a DOM overlay: `<video class="cocosVideo">` is appended to `game.container` (`src/cocos/video/video-player-impl-web.ts:258-278`) and positioned by a CSS matrix each frame (`src/cocos/video/video-player.ts:435-439`); transparent layering via `stayOnBottom` (`src/cocos/video/video-player.ts:277-288`) sets `z-index:-32768` (`src/cocos/video/video-player-impl-web.ts:228-234`) and zeroes the scene-side camera clear alpha (`:340-353`), which requires `macro.ENABLE_TRANSPARENT_CANVAS` before `createAirApp` (`src/cocos/core/platform/macro.ts:984`, example usage `examples/video-basic/main.js:64`).
- `WebView` events are `loading`, `loaded`, `error` (`src/cocos/web-view/web-view-enums.ts:25-46`), `nativeWebView` is the `HTMLIFrameElement` (`src/cocos/web-view/web-view.ts:99-101`), `evaluateJS` runs `contentWindow.eval` (`:162-166`, `src/cocos/web-view/web-view-impl-web.ts:116-128`); `setJavascriptInterfaceScheme` and `setOnJSCallback` are no-ops that warn on Web (`src/cocos/web-view/web-view-impl-web.ts:130-136`).
- All six symbols (`AudioService`, `AudioSource`, `AudioClip`, `VideoPlayer`, `VideoClip`, `WebView`) are in the single export block of `build/cocosair.module.js` (currently :161574); `AudioService` reaches it through `src/air/index.ts:27`. Video and WebView capabilities remain browser-limited: codecs are the browser's, the iframe never enters the WebGL frame buffer, and webkit may pause small videos at the end (`docs/notes/video-notes.md:89-98`).

## Common Mistakes

### [HIGH] Trusting a `playing` boolean instead of the measured playback head

Wrong:
```js
audio.playBgm('bgm');
console.log(audio.bgmState().playing);   // true even while the clock never advances
```

Correct:
```js
const a = audio.bgmState().currentTime;
await new Promise((r) => setTimeout(r, 500));
const advanced = audio.bgmState().currentTime > a;   // real progress evidence
```

`bgmState().currentTime` is the measured clock (`src/air/audio-service.ts:23-32`, `:199-204`); the service header names this exact discipline (`:8`) and states that playback never unlocked by a gesture honestly shows as a non-advancing head (`:10-12`); `playing` only mirrors the backend state machine (`src/cocos/audio/audio-source.ts:518-530`), and pre-gesture ops are queued, not audibly started (`src/cocos/audio/audio-source.ts:367-370`, measured in `docs/notes/audio-notes.md:51`).

### [HIGH] Mounting WebView on an active node before setting the url

Wrong:
```js
const n = new Node('web'); n.addComponent(WebView); scene.addChild(n);  // __preload loads
n.getComponent(WebView).url = './page.html';                            // too late, second load
```

Correct:
```js
const n = new Node('web'); n.active = false;
const wv = n.addComponent(WebView); wv.url = './page.html';             // set before preload runs
scene.addChild(n); n.active = true;
```

The default `_url` is `https://cocos.com` (`src/cocos/web-view/web-view.ts:50`) and `__preload` loads it unconditionally when the node activates (`:168-179`); `docs/notes/webview-notes.md:37-51` measured the external first hit and prescribes inactive-create, set url, register listeners, then activate - listeners must be registered before `addChild` or the `loading` event is already gone.

### [MEDIUM] Expecting sound before any user gesture

Wrong:
```js
await createAirApp({ canvas: '#GameCanvas' });
audio.load('bgm', u).then(() => audio.playBgm('bgm'));   // no click yet: silent or queued
```

Correct:
```js
document.addEventListener('click', () => { audio.playBgm('bgm'); }, { once: true });
```

The browser autoplay policy requires a gesture; the engine resumes the AudioContext on the first `touchend`/`mouseup` (`src/pal/audio/web/player-web.js:104-111`) and `AudioSource.play()` documents the two legal paths (`src/cocos/audio/audio-source.ts:351-354`). `docs/manual/audio-video-webview.md:9-14` records the same for AIR, and a later DOM-audio track change may need a fresh gesture (`:62`).

### [MEDIUM] Setting ENABLE_TRANSPARENT_CANVAS after the app is created

Wrong:
```js
const app = await createAirApp({ canvas: '#GameCanvas' });
macro.ENABLE_TRANSPARENT_CANVAS = true;   // swapchain already built: stayOnBottom shows nothing
player.stayOnBottom = true;
```

Correct:
```js
macro.ENABLE_TRANSPARENT_CANVAS = true;   // before createAirApp: alpha:true swapchain
const app = await createAirApp({ canvas: '#GameCanvas' });
player.stayOnBottom = true;               // video sinks under the canvas
```

The swapchain reads the flag once at creation (`docs/notes/video-notes.md:34-35`); the transparent path then zeroes the scene-side camera clear alpha (`src/cocos/video/video-player-impl-web.ts:340-353`), so proof is a `document.elementFromPoint` hit flip plus `player.currentTime` advance (`docs/notes/video-notes.md:32-33`).

## References

- `references/audio-service.md` - full `AudioService` surface, SFX voice cap and drop counter, gesture unlock plumbing, autoplay rejection evidence.
- `references/videoplayer.md` - event bridge, DOM overlay geometry, transparent video, fullscreen branches, source switching and leak counting.
- `references/webview.md` - iframe overlay lifecycle, url/listener mount order, `evaluateJS` side effects, error-event sniffing, Web platform limits.

## Canonical docs

- `docs/manual/audio-video-webview.md` - the three-domain overview, gesture routes, AudioService contract and example matrix.
- `docs/notes/audio-notes.md` - Code First audio path, per-source player facts, WebKit silent branches.
- `docs/notes/video-notes.md` - stayOnBottom composition, fullscreen defect chain, decode-frame evidence rules.
- `docs/notes/webview-notes.md` - overlay hit-testing, 404-sniffing, mount ordering, evaluateJS failure shape.
