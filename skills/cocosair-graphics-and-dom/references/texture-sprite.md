Derived from src/air/texture-sprite.ts and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# Texture sprites with anchor control

`createAirTextureSprite(parent, texture, options)` builds a native UI node that displays a
borrowed `TextureBase`. The helper owns the created `Node` and `SpriteFrame` but never owns or
mutates the texture's metadata (`src/air/texture-sprite.ts:14-15`,
`docs/manual/graphics-and-dom.md:10-17`).

## Signature and defaults

```ts
const image = createAirTextureSprite(parent, texture, {
    name?: string,                 // default 'TextureSprite'
    size?: [w, h],                 // default is the texture's own dimensions
    anchor?: [ax, ay],             // default [0.5, 0.5]
});
```

The anchor is written to the node's `UITransform` via `setAnchorPoint`, never onto the shared
`TextureBase` (`src/air/texture-sprite.ts:18`, `:25`, `docs/manual/graphics-and-dom.md:20`).
When `size` is omitted the node content size tracks the texture size on every `refresh()`; an
explicit `size` stays fixed (`src/air/texture-sprite.ts:23`, `:40`). Invalid inputs (a texture
with zero width/height, non-finite anchors, or non-positive sizes) throw
`AIR_E_TEXTURE_SPRITE_OPTIONS` (`src/air/texture-sprite.ts:19-20`).

## Borrowed textures

A `RenderTexture` or `createAirRenderTarget().texture` can be borrowed the same way; release the
display object before releasing the target you borrowed from, because the caller keeps ownership
of the texture for its whole lifetime (`docs/manual/graphics-and-dom.md:20`,
`src/air/rendering/render-target.ts:290`).

## refresh()

```js
image.refresh();   // after resizing the underlying texture
```

`refresh()` recomputes the frame `rect` and `originalSize` from the current texture dimensions,
rebinds `spriteFrame` through the native setter so the Sprite invalidates its cached texture and
descriptor even when the identities are unchanged, releases stale descriptor-set caches, and,
when no explicit size was set, resizes the node content box (`src/air/texture-sprite.ts:28-41`).
Call it whenever the texture's dimensions change - for example after `rasterizeAirGraphics`
uploads at a new size (`docs/manual/graphics-and-dom.md:15`). Calling it after dispose throws
`AIR_E_TEXTURE_SPRITE_DISPOSED` (`src/air/texture-sprite.ts:29`).

## dispose()

```js
image.dispose();   // destroys the owned SpriteFrame and Node; leaves the borrowed texture alive
```

`dispose()` clears the sprite frame reference, destroys the owned `SpriteFrame`, and destroys the
owned node if still valid - it does not destroy the borrowed texture, which stays the caller's
responsibility (`src/air/texture-sprite.ts:43-47`).

## Full lifecycle

```js
const image = createAirTextureSprite(parent, texture, { size: [320, 180], anchor: [0, 1] });
// ... texture resized externally ...
image.refresh();
// ... later, during teardown, before releasing the texture ...
image.dispose();
```

See [raster.md](raster.md) for the raster path that produces a texture to display, and
[sprite-mask.md](sprite-mask.md) for masking a `Sprite` display. For the runnable anchor/resize
proof, see `examples/dom-overlay-texture/src/main.ts`
(`examples/dom-overlay-texture/src/main.ts:1`).
