Derived from src/air/html-source.ts, docs/manual/graphics-and-dom.md, and build/cocosair.module.js (as of 2026-10-10)

# Experimental HTML-in-canvas textures

Live HTML-to-texture helpers are experimental APIs exported by the single browser engine entry `cocosair.js`. There is no separate HTML package entry; importing the main runtime in Node without DOM is unsupported.

## Support probe

```js
import { getAirHTMLSourceSupport, createAirHTMLSource } from 'cocosair';

const support = getAirHTMLSourceSupport(canvas);
if (support.supported) { /* create a source */ }
```

`getAirHTMLSourceSupport(canvas)` returns `{ supported, reason }`. It is only supported when the
canvas exposes `requestPaint`, `captureElementImage`, `updateElementGeometry`, and
`clearElementGeometry` and the WebGL2 context provides `texElementSubImage2D`; browsers with only
the older `texElementImage2D` are rejected (`src/air/html-source.ts:29-37`,
`docs/manual/graphics-and-dom.md:182`).

## Create

```js
canvas.appendChild(formElement);      // must be a direct child of the canvas
const source = createAirHTMLSource({
    canvas, element: formElement, texture,
    autoUpdate: true,                 // default true; snapshot:true captures one immutable image
    onError: console.error,
});
source.update();                      // request a paint; completion arrives via onUpdate/onError
```

Guards (`src/air/html-source.ts:48-51`, `:69-72`):

- If unsupported, `AIR_E_HTML_SOURCE_UNSUPPORTED` throws before any DOM or texture mutation.
- The element must be a direct child of the canvas (`element.parentNode !== canvas` throws) and
  must hold an exclusive lease (one source per element) with a positive resolution.
- The texture must be a single-mip RGBA8 native `Texture2D` created for that canvas's WebGL2
  device; anything else throws on upload.

The caller owns the texture; its size is driven by the source layout and resolution
(`docs/manual/graphics-and-dom.md:135`). `createAirHTMLSource` sets the `content="drawable"` and
`layoutsubtree` canvas attributes plus the element's `drawable` attribute to satisfy the
experimental API surface (`src/air/html-source.ts:53-56`).

## Update cadence

Upload happens only on the browser `paint` event; the temporary texture binding is restored and
engine state caches are untouched (`src/air/html-source.ts:60-80`, `docs/manual/graphics-and-dom.md:139`).
`update()` re-arms a pending paint request (an async failure sets `status: 'failed'`; calling
`update()` retries) (`src/air/html-source.ts:84-85`). With `snapshot: true` an immutable
`ElementImage` is captured once and later updates reuse it (`src/air/html-source.ts:73`,
`docs/manual/graphics-and-dom.md:135`). `status` is `'waiting' | 'ready' | 'failed' | 'disposed'`
and the last error stays on `error` (`src/air/html-source.ts:40-42`, `:84`).

Context loss, an element moved out of the canvas, zero size, or an illegal GPU texture are
recorded as explicit failures rather than silent success (`src/air/html-source.ts:64-72`,
`docs/manual/graphics-and-dom.md:137`).

## Geometry and dispose

```js
source.updateGeometry({ canvasTransform: { a: 1, d: 1, e: 100, f: 50 } });
source.dispose();   // removes listeners, clears geometry/snapshot; does not free texture or DOM
```

Uploading pixels does not by itself produce correct interaction: the application converts the
native scene projection into the HTML `canvasTransform` and calls `updateElementGeometry` (exposed
as `updateGeometry`) so hit-testing, focus, and accessibility geometry stay in sync
(`src/air/html-source.ts:86`, `docs/manual/graphics-and-dom.md:139`). `dispose()` removes the paint
listener, clears element geometry, closes any snapshot, and restores the canvas `content`/
`layoutsubtree` attributes once the last drawable child is gone; it never frees the borrowed texture
or DOM element, and throws `AIR_E_HTML_SOURCE_DISPOSED` on use-after-dispose
(`src/air/html-source.ts:59`, `:87-101`, `docs/manual/graphics-and-dom.md:131`).

## Verification

Experimental capability must be probed at runtime; a `UNSUPPORTED` result in a default browser is
never rewritten as a feature pass, and system-Chrome evidence does not transfer to ordinary
Chromium. See `examples/html-texture-experimental/src/main.ts` for the live form, repaint, snapshot,
and unsupported-branch scene (`examples/html-texture-experimental/src/main.ts:1`).
