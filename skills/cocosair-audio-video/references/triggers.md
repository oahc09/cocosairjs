# Cocos AIR audio, video and WebView triggers

Source annotations refer to the AIR checkout.

## When to use what

- "BGM + SFX channels, volume switches" -> `AudioService` (`src/air/audio-service.ts:46`); it wraps `AudioSource`, one persistent node per BGM id, one transient node per SFX voice.
- "single raw clip, seek, PCM data" -> `AudioSource` directly (`src/cocos/audio/audio-source.ts:63`); `AudioService` exposes no per-clip seek or `playOneShot` (`:430`).
- "play a real video in the scene rect" -> `VideoPlayer` (`src/cocos/video/video-player.ts:51`); it is a DOM `<video>`, not a texture - codec support is the browser's.
- "show a web page inside the app" -> `WebView` (`src/cocos/web-view/web-view.ts:48`); an iframe overlay, never rendered into the WebGL canvas.
- "did playback actually happen?" -> `audio.bgmState().currentTime` (`src/air/audio-service.ts:199-204`), `player.currentTime` after `PLAYING` (`src/cocos/video/video-player.ts:321`), iframe-side state for WebView.
