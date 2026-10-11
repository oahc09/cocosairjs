Derived from src/air/effects/sprite-mask.ts and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# Per-Sprite channel masks

`attachAirSpriteMask(sprite, maskTexture, options)` masks a single native `Sprite` by sampling
a second texture in normalized sprite UVs. It is not a replacement for the native `Mask`
component's arbitrary subtree stencil clipping (`src/air/effects/sprite-mask.ts:17-18`,
`docs/manual/graphics-and-dom.md:103`).

## Options

```ts
attachAirSpriteMask(sprite, maskTexture, {
    channel?: 'alpha' | 'red',       // default 'alpha'
    mode?: 'soft' | 'threshold',     // default 'soft'
    threshold?: number,              // default 0.1, must be finite in [0,1]
    inverted?: boolean,              // default false
});
```

- `channel` selects whether the mask reads the mask texture's alpha or red component
  (`src/air/effects/sprite-mask.ts:21-22`, `:62`).
- `soft` multiplies the sprite output alpha by the sampled visibility for a continuous falloff;
  `threshold` discards fragments whose visibility is below `threshold` (default `0.1`)
  (`src/air/effects/sprite-mask.ts:34-35`, `:21-22`, `docs/manual/graphics-and-dom.md:101`).
- `inverted` flips the visibility before it is applied (`src/air/effects/sprite-mask.ts:33`).

Invalid combinations (bad channel/mode, non-finite or out-of-range threshold, a sprite with no
`spriteFrame`, or an invalid texture) throw `AIR_E_SPRITE_MASK_OPTIONS`
(`src/air/effects/sprite-mask.ts:21-23`).

## UV fit and atlas frames

The mask's full `[0,1]` region fits the sprite frame's display UV; trimmed, rotated, or
atlas-packed frames are handled by mapping the frame's four UV corners through an inverse
affine, so degenerate (zero-determinant) frames throw `AIR_E_SPRITE_MASK_UV`
(`src/air/effects/sprite-mask.ts:68-74`, `docs/manual/graphics-and-dom.md:101`). Red-channel
sampling uses the texture's own color space, so numeric red masks usually need linear RGBA8
data (`docs/manual/graphics-and-dom.md:101`).

## Material ownership and single-scope

The helper builds a private `EffectAsset` cloned from `builtin-sprite`, patches the fragment to
insert mask sampling, and sets `sprite.customMaterial`. A `Sprite` that already has a
`customMaterial` is refused (`AIR_E_SPRITE_MASK_MATERIAL`) so the app's shader is never lost;
this version does not compose multiple soft masks (`src/air/effects/sprite-mask.ts:24-25`,
`docs/manual/graphics-and-dom.md:103`). The created `Material`/`EffectAsset` are owned by the
binding, released on `dispose()`, and the builtin template is left untouched
(`docs/manual/graphics-and-dom.md:103`, `src/air/effects/sprite-mask.ts:78-82`).

## Update and dispose

```js
const mask = attachAirSpriteMask(sprite, maskTexture, { channel: 'alpha', mode: 'soft' });
mask.update();          // call after swapping sprite.spriteFrame; same-frame UV_UPDATED auto-follows
// ...
mask.dispose();         // clears the customMaterial it set, keeps the borrowed maskTexture
```

`update()` re-syncs to the current frame and re-registers `SpriteFrameEvent.UV_UPDATED` when the
frame changes; after dispose it throws `AIR_E_SPRITE_MASK_DISPOSED`
(`src/air/effects/sprite-mask.ts:64-67`, `docs/manual/graphics-and-dom.md:97`). The caller must
`dispose()` the binding before releasing the `Sprite` or the mask texture, because the binding
holds a reference to the borrowed texture (`src/air/effects/sprite-mask.ts:77`, `:81`,
`docs/manual/graphics-and-dom.md:98`).

## Verification

Use red/alpha and soft/threshold/inverted pixel assertions against native particles, not just
type checks. See `examples/sprite-mask-blend/src/main.ts` for the runnable scene and
[docs/manual/graphics-and-dom.md](../../../docs/manual/graphics-and-dom.md) for the probe
commands (`examples/sprite-mask-blend/src/main.ts:1`).
