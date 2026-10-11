---
name: cocosair-audio-video
description: Drives Cocos AIR audio, video and WebView from code - AudioService business channels over AudioSource (load, playBgm, pauseBgm, resumeBgm, stopBgm, setBgmVolume, playSfx, setMusicEnabled, setSfxEnabled, bgmState, dispose, maxSfxVoices cap with sfxDropped), measured-currentTime playback evidence, browser autoplay gesture unlock, VideoPlayer DOM-overlay events and transparent video, WebView iframe limits and evaluateJS. Use when audio starts silently or play() seems ignored, when proving a channel actually advances, when a video or iframe must sit under or over the WebGL canvas, or when WebView loads the wrong URL on mount.
---

# Cocos AIR audio, video and WebView

Use the [environment rules](../cocosair/references/environment.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Play background music and sound effects through `AudioService`, mount real `<video>` and `<iframe>` DOM overlays through `VideoPlayer` and `WebView`, and prove playback with measured time instead of boolean flags - all from code, no Creator pipeline.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

- [cocosair](../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
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

Start playback inside a real user gesture and verify advancing currentTime. Explicitly release audio channels and DOM media resources; source API availability does not prove autoplay or platform playback.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Trusting a `playing` boolean instead of the measured playback head
- [HIGH] Mounting WebView on an active node before setting the url
- [MEDIUM] Expecting sound before any user gesture
- [MEDIUM] Setting ENABLE_TRANSPARENT_CANVAS after the app is created

## References

- [audio-service.md](references/audio-service.md) - full `AudioService` surface, SFX voice cap and drop counter, gesture unlock plumbing, autoplay rejection evidence.
- [videoplayer.md](references/videoplayer.md) - event bridge, DOM overlay geometry, transparent video, fullscreen branches, source switching and leak counting.
- [webview.md](references/webview.md) - iframe overlay lifecycle, url/listener mount order, `evaluateJS` side effects, error-event sniffing, Web platform limits.

## Canonical docs

- `docs/manual/audio-video-webview.md` - the three-domain overview, gesture routes, AudioService contract and example matrix.
- `docs/notes/audio-notes.md` - Code First audio path, per-source player facts, WebKit silent branches.
- `docs/notes/video-notes.md` - stayOnBottom composition, fullscreen defect chain, decode-frame evidence rules.
- `docs/notes/webview-notes.md` - overlay hit-testing, 404-sniffing, mount ordering, evaluateJS failure shape.
