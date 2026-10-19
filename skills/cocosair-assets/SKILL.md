---
name: cocosair-assets
description: "Load asset URL textures, atlases and BMFont with AssetBank. Use for refcounted disposal, extension selection, cache reuse or AIR_E_ATLAS_IN_USE/AIR_E_FNT_IN_USE cleanup."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - load remote files without a Creator resources bundle
  - the same URL returns a destroyed asset
  - create a texture from canvas or pixel data
  - load a sprite atlas or bitmap font
  - an atlas or font handle refuses to dispose
owns: [asset-bank, asset-cache, reference-counting, texture2d, atlas, bmfont]
not_for:
  - glTF or GLB model loading -> cocosair-gltf
  - bind an existing font to Label -> cocosair-ui-2d
  - live HTML textures and DOM -> cocosair-graphics-and-dom
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "管理远程资产、AssetBank 引用计数、纹理、图集和位图字体。用于加载、缓存、取消、共享资源释放或字体导入问题。"
---

# Cocos AIR asset contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Registry/URL loading, AssetBank ownership, textures, libGDX atlases and BMFont.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Load runtime JSON, registry assets or remote URLs
- Resources bundle is null or loading exports are missing
- Build or refill textures from pixels
- Parse sprite sheets or bind bitmap fonts
- Reload returns a destroyed cached asset
- Atlas or font refuses to dispose
- Abort a subscriber or inspect browser evidence

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

AIR has no implicit Creator resources bundle. Keep ImageAsset/Texture2D and cache/refcount ownership distinct; detach users before disposing handles. Abort cancels a subscriber, not the shared underlying request.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] No implicit resources bundle or Creator build output.
- [HIGH] AbortSignal does not cancel the shared network request.
- [HIGH] Label supports the documented bitmap-font path.
- [MEDIUM] Check extension hints and trimmed-atlas URL handling.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Load or release assets?](references/asset-bank.md) - Cache, refs and errors
- [Upload pixels?](references/texture2d.md) - CPU/GPU data and formats
- [Parse sprite sheets?](references/atlas.md) - Top-origin rects and ownership
- [Bind a bitmap font?](references/bmfont.md) - Single-page font lifecycle
