Derived from src/air/dom-overlay.ts and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# DOM overlays that follow UI nodes

`createAirDOMOverlay({ canvas, host?, className? })` owns one independent DOM root and binds real
HTML elements so they track native UI node transforms. It never changes `game.container` or the
host's own styles (`src/air/dom-overlay.ts:23-24`).

## Root and host

The root is a `div` with the given class name (default `air-dom-overlay`), fixed-positioned,
`pointer-events: none`, `z-index: 1`, appended to `host` or `doc.body`; you can add CSS classes or
styles to it directly (`src/air/dom-overlay.ts:26-29`). If you pass a `host`, it must not establish
a new fixed containing block, or the coordinates drift (`docs/manual/graphics-and-dom.md:37`).

## Attach

```js
const overlay = createAirDOMOverlay({ canvas, className: 'product-ui' });
const binding = overlay.attach(inputElement, uiNode, uiCamera, {
    width: 240, height: 40, anchor: [0.5, 0.5],
});
```

`attach(element, node, camera, { width?, height?, anchor? })` borrows the element into a wrapper
under the root (`src/air/dom-overlay.ts:18`, `:35-44`). Guards (`src/air/dom-overlay.ts:37-40`):
the element may not be the canvas, the root, or a root ancestor, and may not already be attached
(`AIR_E_DOM_OVERLAY_ELEMENT`); anchor and size must be finite and size positive
(`AIR_E_DOM_OVERLAY_SIZE`). Invalid or inactive nodes hide their wrapper (`docs/manual/graphics-and-dom.md:37`).

## Affine mapping (planar orthographic UI only)

`update()` projects three local corners through the node world matrix and `camera.worldToScreen`,
then accounts for the canvas CSS-vs-backing size difference, and writes one CSS `matrix(...)`
transform on the wrapper (`src/air/dom-overlay.ts:50-67`). The mapping covers native translation,
scale, rotation, and canvas resize (`docs/manual/graphics-and-dom.md:37`). It is intended for
planar orthographic UI: a perspective or tilted plane cannot be represented accurately by a 2D
affine matrix, so those cases are outside this helper (`docs/manual/graphics-and-dom.md:37`,
`src/air/dom-overlay.ts:66`). Off-screen depth (`z < 0 || z > 1`) hides the wrapper
(`src/air/dom-overlay.ts:65`).

The overlay does not start its own clock - call `overlay.update()` (or the individual
`binding.update()`) from the application's own frame callback, after scene, camera, or layout
changes (`src/air/dom-overlay.ts:11-12`, `:80`, `docs/manual/graphics-and-dom.md:31-33`). The
application manages occlusion, clipping, overlay order, and unbinding unused overlays itself.

## Dispose (borrow then restore)

```js
binding.dispose();     // restores the element's original parent, sibling order, and inline style
overlay.dispose();     // idempotent; releases remaining bindings and removes the owned root
```

`attach` records the element's original parent, next sibling, and `style` attribute; `binding.dispose()`
puts the element back and removes the wrapper (`src/air/dom-overlay.ts:41`, `:68-77`).
`overlay.dispose()` disposes every binding and removes the root, and is idempotent; calling
`update`/`attach` afterwards throws `AIR_E_DOM_OVERLAY_DISPOSED` (`src/air/dom-overlay.ts:32`,
`:80-81`).

## Verification

Use real click and focus checks on the bound DOM, not just geometry math, and confirm the GPU
texture plus PNG screenshot pixels after viewport changes. See `examples/dom-overlay-texture/src/main.ts`
for the runnable input/click, move/rotate, unbind and release scene
(`examples/dom-overlay-texture/src/main.ts:1`).
