---
name: cocosair-graphics-and-dom
description: "Reuse native Cocos objects for 2D drawing and DOM in Cocos AIR. Covers AirGraphicsCommand drawing data replayed on a Graphics component (drawAirGraphics, solid nonzero only), SVG serialization that preserves curves (airGraphicsCommandsToSvg), Canvas2D rich fills into a native Texture2D (rasterizeAirGraphics), borrowed-texture display (createAirTextureSprite), per-Sprite channel masks (attachAirSpriteMask), opt-in UI blend inheritance including ParticleSystem2D (createAirUIBlendScope), DOM elements that follow UI nodes (createAirDOMOverlay), the AirUIMesh renderer, and the experimental HTML-in-canvas texture subpath (cocosair.js). Use when authoring or exporting vector fills, gradients, patterns, sprite masks, blend scopes, texture sprites, DOM overlays, or live HTML textures, rather than copying PixiJS or Creator editor snippets."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, graphics, and, dom"
  description_en: "Reuse native Cocos objects for 2D drawing and DOM in Cocos AIR. Covers AirGraphicsCommand drawing data replayed on a Graphics component (drawAirGraphics, solid nonzero only), SVG serialization that preserves curves (airGraphicsCommandsToSvg), Canvas2D rich fills into a native Texture2D (rasterizeAirGraphics), borrowed-texture display (createAirTextureSprite), per-Sprite channel masks (attachAirSpriteMask), opt-in UI blend inheritance including ParticleSystem2D (createAirUIBlendScope), DOM elements that follow UI nodes (createAirDOMOverlay), the AirUIMesh renderer, and the experimental HTML-in-canvas texture subpath (cocosair.js). Use when authoring or exporting vector fills, gradients, patterns, sprite masks, blend scopes, texture sprites, DOM overlays, or live HTML textures, rather than copying PixiJS or Creator editor snippets."
  description_zh: "使用 Graphics、SVG、栅格填充、纹理显示、遮罩、混合和 DOM 覆盖层。用于绘图导出、富填充或实验性 HTML 纹理。"
---

# Cocos AIR graphics and DOM

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Replay drawing data on the native `Graphics`, rasterize rich fills into a native
`Texture2D`, mask a single `Sprite`, inherit UI blend across a subtree, borrow a
texture or a DOM element, and opt into the experimental HTML canvas texture. The
single contract for this skill is `docs/manual/graphics-and-dom.md` (as of 2026-10-10);
every claim below is traceable to the AIR source under `src/air/`. Browser targets
still require WebGL 2.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "draw a shape in code" -> build `AirGraphicsCommand[]`, replay solid fills with `drawAirGraphics` on a `Graphics` component (`src/air/graphics-commands.ts:74-88`).
- "export vector art" -> `airGraphicsCommandsToSvg(commands, bounds)`; it keeps the original curves, the `Graphics` mesh does not (`src/air/graphics-commands.ts:92-157`).
- "gradient, radial, pattern or evenodd hole" -> `rasterizeAirGraphics(commands, options)` for a Canvas2D `Texture2D`, then display it (`src/air/graphics-raster.ts:11-85`).
- "show a texture in UI" -> `createAirTextureSprite(parent, texture, options)`; the texture stays borrowed (`src/air/texture-sprite.ts:15-48`).
- "cut one Sprite by another texture" -> `attachAirSpriteMask(sprite, maskTexture, options)` (`src/air/effects/sprite-mask.ts:18-83`).
- "make a subtree add/multiply" -> `createAirUIBlendScope(root, mode)` (`src/air/ui-blend.ts:11-55`).
- "keep a DOM input glued to a UI node" -> `createAirDOMOverlay({ canvas })` then `.attach(...)` (`src/air/dom-overlay.ts:24-83`).
- "warp a textured UI quad by hand" -> add the `AirUIMesh` component and `setGeometry(...)` (`src/air/ui-mesh.ts:83-118`).
- "paint a live form as a GPU texture" -> the experimental HTML helpers exported by `cocosair.js` (see [html-source.md](references/html-source.md)).

## Contracts

Use native Graphics for solid nonzero fills and rasterization for rich fills. Texture/element bindings borrow their sources and need explicit updates and disposal. Live HTML textures require the experimental subpath.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Passing a gradient, pattern, or evenodd hole to drawAirGraphics
- [HIGH] Treating masks, blend scopes, and DOM overlays as fire-and-forget
- [MEDIUM] Forgetting SVG export constraints for patterns

## References

- [commands.md](references/commands.md) - `AirGraphicsCommand` set, `#rrggbb`+opacity validation, native solid replay, and the SVG serialization contract.
- [raster.md](references/raster.md) - `rasterizeAirGraphics` options, the 8192 edge cap, `worldTransform` for global patterns, and top-first upload rows.
- [sprite-mask.md](references/sprite-mask.md) - `attachAirSpriteMask` channel/mode/threshold/inverted, single-Sprite scope, and material ownership.
- [ui-blend.md](references/ui-blend.md) - `createAirUIBlendScope` normal/add/multiply, the private factor rewrite and instance override, opt-in subtree inheritance.
- [texture-sprite.md](references/texture-sprite.md) - `createAirTextureSprite` borrowed texture, default size/anchor, `refresh()` and `dispose()` ownership.
- [ui-mesh.md](references/ui-mesh.md) - the `AirUIMesh` renderer and its 3..1024 vertex / 1..1365 triangle geometry bounds.
- [dom-overlay.md](references/dom-overlay.md) - `createAirDOMOverlay` element borrowing, restore-on-dispose, and planar-ortho affine mapping.
- [html-source.md](references/html-source.md) - the experimental HTML helpers in the main entry, direct-child lease, and RGBA8 single-mip texture requirement.

## Canonical docs

- `docs/manual/graphics-and-dom.md` - the single authoritative contract for texture display, DOM overlays, command replay, SVG export, raster fills, sprite masks, blend inheritance, and HTML textures; read it end to end before changing these APIs.
- `examples/graphics-svg-paints/src/main.ts` - runnable native `Graphics`, gradient holes, non-square patterns, SVG preview/download and pixel round-trip.
- `examples/sprite-mask-blend/src/main.ts` - red/alpha, soft/threshold/inverted, and normal/add against native particles.
- `examples/dom-overlay-texture/src/main.ts` - real input/click, move/rotate, anchor, texture resize GPU display, unbind and release.
- `examples/html-texture-experimental/src/main.ts` - live form texture, DOM repaint, immutable snapshot, and the ordinary-browser unsupported branch.
