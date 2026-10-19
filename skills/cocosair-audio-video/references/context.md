# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp` and the async run loop.
- [cocosair-assets](../../cocosair-assets/SKILL.md) - `assetManager.loadRemote` behind `AudioService.load`.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - node activation drives `__preload` for all three components.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - DOM overlay interaction, the same model video and WebView use.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - probes that read playback heads back from a real browser.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Play background music and sound effects through `AudioService`, mount real `<video>` and `<iframe>` DOM overlays through `VideoPlayer` and `WebView`, and prove playback with measured time instead of boolean flags - all from code, no Creator pipeline.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Trusting a `playing` boolean instead of the measured playback head
- [HIGH] Mounting WebView on an active node before setting the url
- [MEDIUM] Expecting sound before any user gesture
- [MEDIUM] Setting ENABLE_TRANSPARENT_CANVAS after the app is created

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives Cocos AIR audio, video and WebView from code - AudioService business channels over AudioSource (load, playBgm, pauseBgm, resumeBgm, stopBgm, setBgmVolume, playSfx, setMusicEnabled, setSfxEnabled, bgmState, dispose, maxSfxVoices cap with sfxDropped), measured-currentTime playback evidence, browser autoplay gesture unlock, VideoPlayer DOM-overlay events and transparent video, WebView iframe limits and evaluateJS. Use when audio starts silently or play() seems ignored, when proving a channel actually advances, when a video or iframe must sit under or over the WebGL canvas, or when WebView loads the wrong URL on mount.

### Keywords

Cocos AIR, cocosair.js, audio, video

## References

- [audio-service.md](audio-service.md) - full `AudioService` surface, SFX voice cap and drop counter, gesture unlock plumbing, autoplay rejection evidence.
- [videoplayer.md](videoplayer.md) - event bridge, DOM overlay geometry, transparent video, fullscreen branches, source switching and leak counting.
- [webview.md](webview.md) - iframe overlay lifecycle, url/listener mount order, `evaluateJS` side effects, error-event sniffing, Web platform limits.

## Canonical docs

- `docs/manual/audio-video-webview.md` - the three-domain overview, gesture routes, AudioService contract and example matrix.
- `docs/notes/audio-notes.md` - Code First audio path, per-source player facts, WebKit silent branches.
- `docs/notes/video-notes.md` - stayOnBottom composition, fullscreen defect chain, decode-frame evidence rules.
- `docs/notes/webview-notes.md` - overlay hit-testing, 404-sniffing, mount ordering, evaluateJS failure shape.
