---
name: cocosair-graphics-and-dom
description: "Draw Graphics/SVG shapes and sprite masks; align a DOM overlay with UI/canvas nodes. Use for overlay placement, input interception, experimental HTML textures or AirUIMesh."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - draw shapes or export curves as SVG
  - paint gradients, patterns or evenodd holes
  - mask a sprite or inherit subtree blending
  - keep a DOM input attached to a UI node
  - display live HTML or warp textured UI geometry
owns: [graphics-svg, rich-fills, sprite-masks, ui-blend, dom-overlay, html-texture]
not_for:
  - UI widgets and layout -> cocosair-ui-2d
  - keyboard focus and action routing -> cocosair-input-action
  - general offscreen render targets -> cocosair-rendering
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "使用 Graphics、SVG、栅格填充、纹理显示、遮罩、混合和 DOM 覆盖层。用于绘图导出、富填充或实验性 HTML 纹理。"
---

# Cocos AIR graphics and DOM

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Graphics replay, raster textures, Sprite masks, UI blends, meshes and DOM bindings.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Draw solid vector shapes or export SVG
- Rasterize gradients, patterns or evenodd holes
- Show a borrowed texture in UI
- Mask one Sprite or blend a subtree
- Keep a DOM element aligned with a UI node
- Warp a textured UI quad
- Paint experimental live HTML into a texture

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Use native Graphics for solid nonzero fills and rasterization for rich fills. Texture/element bindings borrow sources and need explicit updates and disposal. Experimental HTML helpers use the main cocosair.js entry, with direct-child leases and RGBA8 single-mip textures.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Rich fills and evenodd holes require rasterization.
- [HIGH] Masks, blends and overlays require explicit cleanup.
- [MEDIUM] Check SVG pattern-export constraints.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Draw or export?](references/commands.md) - Commands and SVG
- [Rich fills?](references/raster.md) - Canvas2D, 8192 cap
- [Mask one Sprite?](references/sprite-mask.md) - Channels and ownership
- [Blend a subtree?](references/ui-blend.md) - Opt-in inheritance
- [Show a texture?](references/texture-sprite.md) - Borrow, refresh, dispose
- [Warp a quad?](references/ui-mesh.md) - Geometry bounds
- [Align DOM?](references/dom-overlay.md) - Planar-ortho mapping
- [Live HTML texture?](references/html-source.md) - Experimental requirements
