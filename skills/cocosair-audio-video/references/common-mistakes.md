Derived from the cocosair-audio-video skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
