---
name: air-graphics-and-dom
description: Implement Cocos AIR graphics command replay, SVG export, raster gradients and patterns, DOM overlays, texture sprites and soft sprite masks. Use for these specific AIR APIs rather than PixiJS examples.
---

# Graphics and DOM

Read `docs/manual/graphics-and-dom.md` for the current API contracts and examples.

- `AirGraphicsCommand[]` is drawing data. `drawAirGraphics()` replays solid commands on a native `Graphics`; `airGraphicsCommandsToSvg()` serializes the same data. It cannot recover original curves from an arbitrary `Graphics.impl`.
- Coordinates are Cocos local XY with Y up. SVG serialization flips Y once. Canvas raster output uses top-first rows for native Sprite sampling; do not add an extra upload flip.
- `rasterizeAirGraphics()` uses Canvas2D and native Texture2D. Update explicitly when commands, resolution, bounds or global pattern transforms change. It is a raster result, not a GPU vector fill implementation.
- Patterns take a direct affine transform. Global patterns require the local-to-world affine transform of the displayed shape. SVG export requires local pattern coordinates and an explicit source URL.
- `attachAirSpriteMask()` samples a second texture in normalized sprite UVs. `soft` attenuates alpha; `threshold` discards pixels. It masks one Sprite, not an arbitrary Node subtree. Detach before disposing its mask texture.
- `createAirUIBlendScope()` is opt-in subtree inheritance, including native ParticleSystem2D. Call update after hierarchy/component changes; explicit child overrides take precedence. Dispose restores state it still owns.
- DOM overlays borrow elements and restore their DOM position/style. Call update after scene/camera/layout changes. The affine mapping is intended for planar orthographic UI; perspective distortion is not represented by a CSS affine matrix.

Use pixel assertions for masking, orientation, pattern alignment and gradient changes, and real click/focus checks for DOM interaction. Cleanup and failed/unsupported paths need their own checks.
