Derived from the cocosair-application skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### [HIGH] Importing the engine before the canvas is in the document

Wrong:

```ts
const canvas = document.createElement('canvas');
canvas.id = 'GameCanvas';
import { createAirApp, Scene } from 'cocosair.js'; // evaluated at module time: no canvas yet
document.body.appendChild(canvas);
await createAirApp({ canvas });
```

Correct:

```html
<script type="module">
  import { createAirApp } from 'cocosair.js'; // binds the canvas, then imports the engine
  const canvas = document.createElement('canvas');
  canvas.id = 'game'; // keep any #GameCanvas off the page: a second holder conflicts (app-config.ts:59-62)
  document.body.appendChild(canvas);
  const app = await createAirApp({ canvas }); // safe entry writes __CC_CANVAS__ before the engine import
</script>
```

Import statements hoist above the code that adds the canvas, and the PAL screen adapter binds the canvas once while the module graph evaluates, so the page dies on the un-coded import-order error before any option is read.

### [HIGH] Creating a second app in the same document after close()

Wrong:

```ts
await app.close!();
const next = await createAirApp({ canvas: '#GameCanvas' }); // AIR_E_APP_CLOSED
```

Correct:

```ts
await app.close!();
location.reload(); // one runtime per document: reload before rebuilding
```

Agents treat `close()` as disposal of an object they can rebuild, but `game`, `director`, the PAL adapter and the bootstrap registry are document-level singletons constructed once per module graph (`src/cocos/game/game.ts:1199`, `src/cocos/game/director.ts:975`, `src/pal/screen-adapter/web/screen-adapter.js:664`) and the registry refuses retries (`src/air/app-config.ts:149-157`); `closed` and `failed` both refuse a retry, and an aborted init cannot be rolled back in place.

### [HIGH] Using renderMode 3 to check rendered pixels

Wrong:

```ts
const app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
app.run(scene);
const pixels = readCanvasPixels(app.canvas); // HEADLESS selects EmptyDevice: nothing is drawn
expect(pixels[0]).toBe(20);
```

Correct:

```ts
const app = await createAirApp({ canvas: '#GameCanvas' }); // omit renderMode: 0 AUTO -> WebGL 2 device
app.run(scene);
const pixels = readCanvasPixels(app.canvas); // real swapchain pixels, or capture with Playwright
```

`renderMode: 3` is `LegacyRenderMode.HEADLESS` and is a legal value (`src/air/app-config.ts:63-65`, `src/cocos/gfx/device-manager.ts:189-192`), so it starts successfully while producing no browser frame; a passing await plus an all-zero read is a false green test.

### [MEDIUM] Treating attachContextHealth as automatic device restoration

Wrong:

```ts
canvas.addEventListener('webglcontextrestored', () => {
  app.run(app.getScene()!); // assume textures, buffers and programs come back
});
```

Correct:

```ts
app.contextHealth.onChange((snap) => {
  if (snap.state === 'failed') {
    console.warn(snap.reason); // context-restored-but-gpu-resources-not-rebuilt
    app.contextHealth.requestReload(); // acts only in the failed state
  }
});
```

The helper exists to make loss observable: it calls `preventDefault()`, pauses the loop, and on a restore event marks `restoring` then `failed` without rebuilding GPU resources (`src/air/context-health.ts:159-177`), so continuing to render against the fresh context draws nothing.

### [MEDIUM] Resuming in-document to recover from a context loss

Wrong:

```ts
import { game } from 'cocosair.js';
// after a webglcontextlost with the default contextLoss.autoPause:
game.resume(); // assume un-pausing the pacer restores the lost GPU resources
app.run(new Scene('Recovered'));
```

Correct:

```ts
// a lost context is terminal for GPU state: onRestored marks `failed` with
// 'context-restored-but-gpu-resources-not-rebuilt' (src/air/context-health.ts:171-176),
// so keep the loop paused and reload instead of resuming in-document.
app.contextHealth.onChange((snap) => {
    if (snap.state === 'failed') app.contextHealth.requestReload(); // requestReload only acts in the `failed` state (:188-195)
});
```

Do not conflate this with a release pause: `releaseScene()` sets `_needsResume`, so a following `run()` resumes a still-healthy loop for an in-document scene swap (`src/air/app.ts:155-157`, `:195`). A `webglcontextlost` never arms `_needsResume` (it only calls `game.pause()` at `src/air/context-health.ts:166`), so `run()` will not resume it, and even a manual `game.resume()` renders against a failed context - reload is the only route ([context-health.md](context-health.md)).

`run()` only calls `game.run()` for the first scene and `game.resume()` when `_needsResume` was armed by `releaseScene()` (`src/air/app.ts:146-158`, `:195`); a bare autoPause loss arms nothing, so without a prior `releaseScene()` the new scene loads and never ticks - which is what the `Wrong` block above hits.
