---
name: cocosair-audio-video
description: "Play media with AudioService, VideoPlayer and WebView. Use for silent autoplay, advancing currentTime, BGM/SFX channels or DOM video and iframe overlays."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - audio starts silently before a user gesture
  - control BGM and SFX channels or volume
  - prove playback time actually advances
  - place video above or below the canvas
  - WebView mounts the wrong URL
owns: [audio-service, autoplay-unlock, playback-time, video-player, webview]
not_for:
  - shared remote-file caching -> cocosair-assets
  - DOM input geometry or HTML textures -> cocosair-graphics-and-dom
  - keyboard and action focus -> cocosair-input-action
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "管理音频通道、用户手势解锁、播放证据、VideoPlayer 和 WebView。用于媒体加载、播放、平台限制或资源清理。"
---

# Cocos AIR audio, video and WebView

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: AudioService, AudioSource and DOM-backed video/WebView playback.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Play BGM or SFX with channel controls
- Seek raw audio or inspect PCM data
- Show a real video inside the scene rectangle
- Embed a page through an iframe overlay
- Prove playback using advancing time
- Unlock media or clean up DOM resources

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Start playback inside a real user gesture and verify advancing currentTime. Explicitly release audio channels and DOM media resources; source API availability does not prove autoplay or platform playback.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] A playing flag alone is not playback proof.
- [HIGH] Set WebView URL before mounting on an active node.
- [MEDIUM] Audio unlock needs a real user gesture.
- [MEDIUM] Set transparent-canvas mode before app creation.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [BGM or SFX silent?](references/audio-service.md) - Channels and gesture unlock
- [Video playback or layout?](references/videoplayer.md) - DOM geometry and events
- [Embed a web page?](references/webview.md) - Mount order and iframe lifecycle
