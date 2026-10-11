Derived from tools/debug/agent-session.ts, src/cocos/game/director.ts, tools/debug/pixel-regions.mjs, tools/debug/panel.ts on 2026-10-10.

# Visual probes: capture timing and pixel regions

These are devtools-side observation helpers. They are not on the runtime export; drive them from a session attached through the dev server.

## captureFrame and the AFTER_DRAW hook

`session.captureFrame()` returns a `Promise<FrameCapture>` sampled at a controlled point after the engine has committed a draw (`tools/debug/agent-session.ts:589`). The timing hook is the director's AFTER_DRAW event: the session subscribes to `cc.director`'s `EVENT_AFTER_DRAW` and reads the canvas inside that callback (`tools/debug/agent-session.ts:598`, `:641`). AFTER_DRAW is the `DirectorEvent.AFTER_DRAW` value emitted once per tick after the draw pass (`src/cocos/game/director.ts:109`, aliased as `Director.EVENT_AFTER_DRAW` at `:240`, emitted at `:821`).

Guarantees encoded in the implementation:

- The scene is snapshotted at request time; if it is replaced before the draw fires, capture rejects with `CAPTURE_FAILED` rather than returning another scene's frame (`tools/debug/agent-session.ts:592`, `:616-619`).
- A timer rejects with `CAPTURE_FAILED` if no rendered frame arrives within `captureTimeoutMs` (default 5000ms) (`tools/debug/agent-session.ts:606-609`, `:148`).
- The PNG is read via `canvas.toDataURL('image/png')`; a non-PNG result throws and is reported as `CAPTURE_FAILED` (`tools/debug/agent-session.ts:622-625`).
- Closing the session cancels any pending capture (listener and timer) and rejects it with `SESSION_CLOSED` (`tools/debug/agent-session.ts:612-614`, `:906-910`).
- The result carries `png`, `width`, `height`, `sceneId`, a monotonic `frameIndex`, and `sampledAt` (`tools/debug/agent-session.ts:626-633`, interface `:120-128`).

The frame-diff discipline: capture before and after a known-visible change and assert the two PNGs differ and `frameIndex` advanced, so a stale screenshot can never stand in for a new frame (`examples/automation/main.ts:182-201`). The panel exposes capture as an explicit AFTER_DRAW read (`tools/debug/panel.ts:212`).

## Pixel-region conventions (tools/debug/pixel-regions.mjs)

`measurePixelRegions(image, regions, options)` is a dependency-free metric over RGBA bytes; it is a devtool helper, not a runtime API (`tools/debug/pixel-regions.mjs:5`).

- Input `image` must be `{ width, height, data }` with `data.length === width * height * 4` (`tools/debug/pixel-regions.mjs:7-8`).
- Rectangles are `{ x, y, w, h }`; `x`/`y` must be finite and `w`/`h` positive, and each is clamped to the image bounds (`tools/debug/pixel-regions.mjs:13-18`).
- Origin: screenshot bytes use a `top-left` origin (the default); raw `gl.readPixels` bytes use `bottom-left` because GL rows are inverted (`tools/debug/pixel-regions.mjs:5`, `:9`, `:11`). `measureCanvasRegions` reads the WebGL2 framebuffer and forces `bottom-left` for you (`tools/debug/pixel-regions.mjs:47-54`).
- `lit` is not absolute brightness: for each region the modal (dominant, 4-bit-binned, sampled on a 2px stride) background is computed, and `litPixels` counts samples whose RGB distance from that background exceeds `distance` (default 30) (`tools/debug/pixel-regions.mjs:19-40`). The result per region is `{ rect, litRatio, litPixels, background }` (`tools/debug/pixel-regions.mjs:41-42`).
- A canvas read must happen after a committed engine draw, before the browser discards the buffer, which is exactly the AFTER_DRAW window the session capture uses (`tools/debug/pixel-regions.mjs:46`).

Rule of thumb: pass a screenshot PNG through `measurePixelRegions` with the default `top-left` origin, and pass a live canvas through `measureCanvasRegions` (it handles the `bottom-left` flip); never mix the two origins.
