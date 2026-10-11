Derived from src/air/graphics-raster.ts, src/air/graphics-commands.ts, and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# Raster gradients, patterns, and holes

`rasterizeAirGraphics(commands, options)` rasterizes rich fills with Canvas2D into a native
`Texture2D`. It is a raster result, not a GPU vector filler - use it for gradients, radial
fills, patterns, and `evenodd` holes that native `drawAirGraphics` rejects
(`src/air/graphics-raster.ts:10-11`, `docs/manual/graphics-and-dom.md:82`).

## Options and bounds

```ts
rasterizeAirGraphics(commands, {
    bounds: { x, y, width, height },   // logical device-space box
    resolution?: number,               // pixels per logical unit, default 1
    worldTransform?: [a, b, c, d, tx, ty],   // local->world, required for global patterns
});
```

The returned object exposes `texture`, `canvas`, `update(commands?, options?)`, and
`dispose()` (`src/air/graphics-raster.ts:11-14`). `resolution` is finite and positive and each
edge is capped: `ceil(width * resolution)` and `ceil(height * resolution)` must stay at or
under 8192, else `AIR_E_GRAPHICS_RESOLUTION` throws (`src/air/graphics-raster.ts:26-27`).

## Orientation: top-first rows, no extra flip

The device transform is `setTransform(resolution, 0, 0, -resolution, ...)` and the pixels come
from `getImageData` rows that are top-first, which already match native Sprite UV, so there is
no additional upload flip and no `pixelStore` mutation (`src/air/graphics-raster.ts:32`,
`:77-80`). When the texture size changes, `texture.reset(...)` then `uploadData(...)` refreshes
it; call `display.refresh()` on any texture-size change too (`src/air/graphics-raster.ts:79-80`,
`docs/manual/graphics-and-dom.md:82`).

## Explicit update, not a per-frame loop

`update()` re-rasterizes and re-uploads on demand; it is never an automatic per-frame loop
(`src/air/graphics-raster.ts:23`). Call it whenever commands, `bounds`, `resolution`, or the
`worldTransform` of a global pattern change; `dispose()` destroys the owned texture and zeroes
the canvas (`src/air/graphics-raster.ts:84`). Calling after dispose throws
`AIR_E_GRAPHICS_RASTER_DISPOSED` (`:24`).

## Paint kinds

- Linear: `{ kind: 'linear', from: [x, y], to: [x, y], stops }`; a zero gradient extent throws.
- Radial: `{ kind: 'radial', center: [x, y], radius, stops }`; radius is in local coordinates
  and must be positive.
- All gradients need at least two stops ordered by ascending offset, each color `#rrggbb` and
  every opacity within `[0,1]` (`src/air/graphics-commands.ts:20-22`, `:57-62`,
  `docs/manual/graphics-and-dom.md:86`).

## Patterns

Pattern paint is `{ kind: 'pattern', image, width, height, textureSpace?, transform?, sourceURL? }`
where `width`/`height` are the logical tile size (`src/air/graphics-commands.ts:22`). The tile
is drawn at those dimensions before repeating (`src/air/graphics-raster.ts:36-41`). `transform`
is a direct affine `pattern -> chosen space` matrix: it is never pre-inverted and never
premultiplied by the texture size (`docs/manual/graphics-and-dom.md:84`,
`src/air/graphics-commands.ts:56`).

`textureSpace` defaults to `'local'`. When any fill uses `'global'`, `options.worldTransform`
becomes required - the local-to-world matrix of the displayed shape - so neighbouring shapes
share the texture phase; missing or singular matrices throw `AIR_E_GRAPHICS_WORLD_TRANSFORM`
(`src/air/graphics-raster.ts:28-30`). The raster path applies the inverse world matrix to the
pattern transform for global space (`src/air/graphics-raster.ts:43`).

The image's top row stays up. A non-invertible (singular) `transform` is rejected
(`src/air/graphics-commands.ts:56`). Cross-origin images need CORS or the browser refuses the
pixel read-back (`docs/manual/graphics-and-dom.md:84`).

## Display the result

```js
const paint = rasterizeAirGraphics(commands, {
    bounds: { x: 0, y: 0, width: 200, height: 100 }, resolution: 2 });
const display = createAirTextureSprite(parent, paint.texture, { size: [200, 100] });
paint.update(nextCommands);        // explicit redraw + upload, not automatic
display.refresh();                 // only when the texture dimensions changed
display.dispose();
paint.dispose();
```

See [texture-sprite.md](texture-sprite.md) for the borrowed-texture display contract.
