# Cocos AIR graphics and DOM triggers

Source annotations refer to the AIR checkout.

## When to use what

- "draw a shape in code" -> build `AirGraphicsCommand[]`, replay solid fills with `drawAirGraphics` on a `Graphics` component (`src/air/graphics-commands.ts:74-88`).
- "export vector art" -> `airGraphicsCommandsToSvg(commands, bounds)`; it keeps the original curves, the `Graphics` mesh does not (`src/air/graphics-commands.ts:92-157`).
- "gradient, radial, pattern or evenodd hole" -> `rasterizeAirGraphics(commands, options)` for a Canvas2D `Texture2D`, then display it (`src/air/graphics-raster.ts:11-85`).
- "show a texture in UI" -> `createAirTextureSprite(parent, texture, options)`; the texture stays borrowed (`src/air/texture-sprite.ts:15-48`).
- "cut one Sprite by another texture" -> `attachAirSpriteMask(sprite, maskTexture, options)` (`src/air/effects/sprite-mask.ts:18-83`).
- "make a subtree add/multiply" -> `createAirUIBlendScope(root, mode)` (`src/air/ui-blend.ts:11-55`).
- "keep a DOM input glued to a UI node" -> `createAirDOMOverlay({ canvas })` then `.attach(...)` (`src/air/dom-overlay.ts:24-83`).
- "warp a textured UI quad by hand" -> add the `AirUIMesh` component and `setGeometry(...)` (`src/air/ui-mesh.ts:83-118`).
- "paint a live form as a GPU texture" -> the experimental HTML helpers exported by `cocosair.js` (see [html-source.md](html-source.md)).
