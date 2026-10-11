Derived from the cocosair-graphics-and-dom skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### [HIGH] Passing a gradient, pattern, or evenodd hole to drawAirGraphics

Wrong:

```js
drawAirGraphics(g, [
    { op: 'rect', args: [0, 0, 200, 100] },
    { op: 'circle', args: [100, 50, 20] },
    { op: 'fill', rule: 'evenodd',
      paint: { kind: 'linear', from: [0, 0], to: [200, 0],
               stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } },
]);
```

Correct:

```js
const paint = rasterizeAirGraphics(commands, {
    bounds: { x: 0, y: 0, width: 200, height: 100 }, resolution: 2 });
const display = createAirTextureSprite(parent, paint.texture, { size: [200, 100] });
```

`drawAirGraphics` throws `AIR_E_GRAPHICS_COMMAND` on a non-solid or `evenodd` fill and
routes gradients/patterns/holes to the raster path; native replay never silently degrades
(`src/air/graphics-commands.ts:76`, `docs/manual/graphics-and-dom.md:56`, `:60-86`).

### [HIGH] Treating masks, blend scopes, and DOM overlays as fire-and-forget

Wrong:

```js
attachAirSpriteMask(sprite, tex);      // then swap sprite.spriteFrame or move nodes
const blend = createAirUIBlendScope(root, 'add');   // never re-applied after changes
const overlay = createAirDOMOverlay({ canvas });    // attach, then never call update()
```

Correct:

```js
mask.update();               // after replacing spriteFrame on the same binding
blend.update();              // after hierarchy / component / particle / material edits
binding.update();            // from the app frame callback after camera or layout moves
```

`mask` follows the current frame's `UV_UPDATED` but needs an explicit `update()` on a frame
swap; blend and overlay are controllers whose GPU/DOM state only re-syncs when you call
`update()` (`src/air/effects/sprite-mask.ts:64-67`, `src/air/ui-blend.ts:36-53`,
`src/air/dom-overlay.ts:50-67`). Each owns resources you must `dispose()` before releasing
the borrowed texture, node, or element (`docs/manual/graphics-and-dom.md:98`, `:34`).

### [MEDIUM] Forgetting SVG export constraints for patterns

Wrong:

```js
airGraphicsCommandsToSvg(commands, bounds);   // pattern uses textureSpace: 'global'
// or a pattern with no sourceURL at all
```

Correct:

```js
// Convert global patterns to a local transform first, and give every pattern a
// data:image or http(s) sourceURL before exporting.
const svg = airGraphicsCommandsToSvg(localCommands, bounds);
```

`airGraphicsCommandsToSvg` throws on `textureSpace: 'global'` and on a missing or non
`data:image`/`http(s)` `sourceURL`; it never fetches or embeds external URLs and offers no
arbitrary SVG text parser (`src/air/graphics-commands.ts:106-107`,
`docs/manual/graphics-and-dom.md:58`).
