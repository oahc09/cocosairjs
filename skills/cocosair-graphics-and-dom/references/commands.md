Derived from src/air/graphics-commands.ts and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# Graphics commands, native replay, and SVG export

`AirGraphicsCommand[]` is plain drawing data with Y-up local coordinates. The same array
drives three outcomes: native replay on a `Graphics` component, an SVG string, and (via the
raster reference) a Canvas2D texture. Nothing mutates a shared texture; the array is the
source of truth.

## Command set and argument shapes

The union type lists the operations (`src/air/graphics-commands.ts:5`):

- Path/shape: `moveTo`, `lineTo`, `bezierCurveTo`, `quadraticCurveTo`, `arc`, `rect`,
  `roundRect`, `ellipse`, `circle`, `close`.
- Paint: `fill` (with optional `rule: 'nonzero' | 'evenodd'`) and `stroke`
  (`width`, optional `cap: 'butt' | 'round' | 'square'`, `join: 'miter' | 'round' | 'bevel'`).

`arc` args are `[cx, cy, r, startAngle, endAngle, counterClockwise]`; the trailing boolean is
`false`-meaning-clockwise and keeps native Cocos direction semantics
(`src/air/graphics-commands.ts:9`, `docs/manual/graphics-and-dom.md:54`). Each op has a fixed
arg count and finite-number check driven by a sizes table (`src/air/graphics-commands.ts:25`).

## Paint objects

`AirSolidPaint` is `{ color, opacity? }`; color must match `#rrggbb` and opacity stays in
`[0,1]`, or `AIR_E_GRAPHICS_COMMAND` is thrown before any replay or upload
(`src/air/graphics-commands.ts:16`, `:26-31`). A path/line/curve command followed by `fill`
or `stroke` requires an active path; a fresh shape starts a new draw batch, so a solid fill
then a stroke can reuse the same path (`src/air/graphics-commands.ts:32-70`,
`docs/manual/graphics-and-dom.md:56`).

Gradient (`linear`/`radial`) and `pattern` paints are described in
[raster.md](raster.md) because native replay rejects them.

## drawAirGraphics: solid native replay

`drawAirGraphics(graphics, commands, clear = true)` replays onto the native `Graphics`
component (`graphics` is a `Node.addComponent(Graphics)`) (`src/air/graphics-commands.ts:74`).
It validates first, then throws `AIR_E_GRAPHICS_COMMAND` if any fill carries a `kind` (a
gradient/pattern) or uses `evenodd` - "native replay supports solid nonzero fills; use
rasterizeAirGraphics for gradients/patterns/holes" (`src/air/graphics-commands.ts:76`). It
maps solid color+opacity into a native `Color`, and cap/join onto `Graphics.LineCap`/
`Graphics.LineJoin` (`src/air/graphics-commands.ts:71`, `:81-83`).

Wrong:

```js
drawAirGraphics(g, [
    { op: 'rect', args: [0, 0, 200, 100] },
    { op: 'fill', rule: 'evenodd', paint: { kind: 'linear', from: [0, 0], to: [200, 0],
      stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } },
]);   // throws: gradient + evenodd are not solid nonzero fills
```

Correct:

```js
drawAirGraphics(g, [
    { op: 'rect', args: [0, 0, 100, 50] },
    { op: 'fill', paint: { color: '#ff0000' } },
    { op: 'circle', args: [150, 25, 25] },
    { op: 'stroke', paint: { color: '#0000ff' }, width: 4 },   // solid path reuse allowed
]);
```

## airGraphicsCommandsToSvg: preserve curves, flip Y once

`airGraphicsCommandsToSvg(commands, bounds)` returns an `<svg>` string and preserves the
original curves; it never reconstructs geometry from a subdivided `Graphics.impl`, and it does
not take a `Graphics` instance at all (`src/air/graphics-commands.ts:92`,
`docs/manual/graphics-and-dom.md:56`). Coordinates are Y-up; the root viewBox plus a single
`scale(1 -1)` group flip the axis exactly once (`src/air/graphics-commands.ts:156`).

SVG supports solid fills, linear/radial gradients, local patterns, opacity, and `evenodd`
holes, but with two hard rules (`docs/manual/graphics-and-dom.md:58`):

- `textureSpace: 'global'` patterns are rejected; convert them to a local transform first
  (`src/air/graphics-commands.ts:106`).
- Every pattern needs an explicit `sourceURL` that is a `data:image/(png|jpeg|webp);base64,`
  or `http(s)` value; the exporter does not fetch or embed external URLs and is not a general
  SVG text parser (`src/air/graphics-commands.ts:107`).

## Verification

Use pixel round-trips for fills, orientation and pattern alignment, and SVG download-content
checks for curve preservation; see
[verification commands](verification-commands.md) and
`examples/graphics-svg-paints/src/main.ts` for the runnable scene and the low-level probe
commands (`examples/graphics-svg-paints/src/main.ts:1`).
