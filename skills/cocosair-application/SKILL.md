---
name: cocosair-application
description: Configure and drive the Cocos AIR application handle - every AirAppOptions field vs its validator (canvas selector or element, renderMode 0..3, physics builtin or cannon, diagnostics errors or warnings, pixelRatioCap default 2, screenMode window or container, container, designResolution policy 0..4, contextLoss), the one-runtime-per-document admission rule keyed by Symbol.for('cocosair.bootstrap.v1'), the run/getScene/releaseScene/close lifecycle and the whole-page reload a closed runtime needs, startup error literals WEBGL2_REQUIRED and AIR_E_* codes, the attachContextHealth healthy/lost/restoring/failed state machine with no GPU rebuild, and createSessionScope ownership with (0,5000] timeoutMs. Use when starting a cocosair.js app with createAirApp, choosing or rejecting AirAppOptions values, hitting an AIR_E_ or WEBGL2_REQUIRED startup failure, replacing or releasing a scene, wiring screenMode container or designResolution, or reacting to a lost WebGL context.
---

# Cocos AIR application lifecycle

Build the app handle correctly: admit options before the engine evaluates, run and release scenes through the single per-document runtime, and read context health and session ownership from the handle instead of guessing at engine internals.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
  import { createAirApp, Scene, ResolutionPolicy } from 'cocosair'; // page alias, not the package name
  const app = await createAirApp({
    canvas: '#GameCanvas', // HTMLCanvasElement | CSS selector string
    pixelRatioCap: 2, // effective DPR = min(devicePixelRatio, cap)
    designResolution: { width: 978, height: 846, policy: ResolutionPolicy.EXACT_FIT }, // 0..4
  });
  app.run(new Scene('Main'));
  app.getScene(); // Scene | null
  app.contextHealth.snapshot().state; // healthy | lost | restoring | failed
  const receipt = app.close ? await app.close() : null; // optional interface member; guard it in JS (no `!` in a module script)
  // once the registry-owning app closes, every createAirApp in this document rejects with AIR_E_APP_CLOSED
</script>
```

`createAirApp(options)` returns `Promise<AirApp>`; `run(scene)` returns void; the line-level declaration inventory lives in `references/app-options.md` (Public surface and evidence status). `releaseScene?()` and `close?()` are declared optional for older custom handles, so call them as `app.close!()` in strict TypeScript or guard them. For a custom canvas id, or options that must land before the engine module evaluates, use the `cocosair.js/bootstrap` entry: it writes `globalThis.__CC_CANVAS__` and `__CCDPR_CAP__` and only then dynamically imports the engine (`src/air/safe-bootstrap.ts:11-18`). Page shell, entry choice and importmap alias ownership - the `cocosair` alias above versus the `cocosair.js` package name used in code samples - belong to [cocosair-project-setup](../cocosair-project-setup/SKILL.md).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and the Code First discipline; load it first.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry the page imports and how the canvas gets there.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - DOM overlays and canvas textures on the same `#GameCanvas`.
- [cocosair-verification](../cocosair-verification/SKILL.md) - how to prove a lifecycle claim instead of asserting it.

Scene replacement by a page-stack component, physics backend internals and live-session inspection are owned by the cocosair-scene-graph, cocosair-physics and cocosair-agent-session skills (the router's Foundations row for this skill routes here for the app handle itself).

## When to use what

- "Which option values are actually legal, what is the real default, and what does a second `createAirApp` or a restart-after-failure hit?" -> `normalizeAirOptions`, `admitAirOptions` plus `AirAppImpl.close`, `references/app-options.md`.
- "`createAirApp` rejected with some `AIR_E_...` / `WEBGL2_REQUIRED`" -> match `error.code`, then `references/startup-errors.md`.
- "Swap or tear down the running scene without reloading" -> `app.run` / `app.releaseScene!()`, receipt fields in `references/app-options.md`.
- "The context was lost; is the app still drawing?" -> `app.contextHealth` / `attachContextHealth`, `references/context-health.md`.
- "Register asset, listener and timer cleanup that a scene switch must honour" -> `app.session` / `createSessionScope`, `references/session-scope.md`.
- "Fill the window versus fit a host element, or wire design resolution" -> `screenMode`/`container` and `designResolution` rows in `references/app-options.md`; `view.setDesignResolutionSize` is called for you, coordinate-maths routing goes to the camera and UI skills, prose in `docs/manual/design-viewport-and-controls.md`.

## Contracts

- Canvas before import: `screenAdapter` is constructed while the engine module evaluates and binds `globalThis.__CC_CANVAS__ || document.getElementById('GameCanvas')` (`src/pal/screen-adapter/web/screen-adapter.js:299`, `:664`); with neither present it throws the un-coded `[cocosair] GameCanvas or __CC_CANVAS__ must exist before importing the engine.` (`:300-301`). The canvas must be attached in the document, not merely created. AIR fills `#GameDiv` > `#Cocos3dGameContainer` and its stylesheet only when the canvas has no parent element - in a real browser the PAL constructor already wraps a missing frame/container during the engine import (`:303-316`), so an attached-canvas page like `examples/starter/index.html` never reaches AIR's branch or its stylesheet - and AIR never rewrites your canvas id (`src/air/bootstrap.ts:40-55`, `:58-76`; tables in `references/app-options.md`, Canvas DOM preparation).
- One runtime per document: admission state lives in `globalThis[Symbol.for('cocosair.bootstrap.v1')]` with status `idle | initializing | ready | failed | closed` (`src/air/app-config.ts:16-30`). Identical normalized options share the init Promise and the app; any difference in the compared fields rejects `AIR_E_APP_CONFLICT`; `closed` rejects `AIR_E_APP_CLOSED`; `failed` rejects `AIR_E_APP_RELOAD_REQUIRED` (`:149-157`). `equalAirOptions` (`:114-121`) compares the `canvas`/`container` elements and the `contextLoss.reload`/`contextLoss.onEvent` callbacks by identity, the remaining scalars and the three `designResolution` numbers by value, so a fresh inline arrow in a second `createAirApp` call rejects `AIR_E_APP_CONFLICT` - pass a stable options object. Rebuilding the low-level runtime requires a whole-page reload.
- Option ranges are hard, not advisory: `renderMode` must be an integer 0..3 (engine `WEBGPU = 4` is rejected at the AIR surface, and `1`/`CANVAS` passes validation but starts no device - see the renderMode rows in `references/app-options.md` and `references/startup-errors.md`), `pixelRatioCap` a finite positive number (default 2, or a usable `__CCDPR_CAP__`), `designResolution.policy` one of 0..4 with finite positive width/height (`src/air/app-config.ts:63-75`). Out of range throws; nothing is clamped or ignored.
- Startup is a fixed pipeline, and the DPR cap only counts when it lands before the PAL evaluates: context-health attach -> diagnostics channel -> physics selector -> `game.init` -> `view.setDesignResolutionSize` -> the caller's first `run()`, with teardown before rethrow on init failure, the `AIR_E_PIXEL_RATIO_IMPORT_ORDER` / `AIR_E_CANVAS_IMPORT_ORDER` checks and the `round(CSS size * min(devicePixelRatio, cap))` buffer formula all line-cited in `references/app-options.md` (Startup order).
- Lifecycle gates in `run()` fire in this code order (`src/air/app.ts:135-159`): closed -> `AIR_E_APP_CLOSED`; release in flight -> `AIR_E_SCENE_RELEASING`; previous release failed -> `AIR_E_SCENE_RELEASE_FAILED`; not a valid native `Scene` -> `AIR_E_SCENE`; re-running the current scene -> silent no-op (`:140`), checked before the ownership gate; only a replacement scene then meets `AIR_E_SCENE_RELEASE_REQUIRED` while the current scope owns cleanup callbacks (`:141-143`). `close()` pauses the loop, releases the scene, destroys context-health and diagnostics listeners and marks the registry closed only when this app is the registry's app (`src/air/app.ts:202-203`); it does not restore a lost GL context and does not make the document reusable. Tables: `references/app-options.md` and `references/startup-errors.md`.
- Cleanup is cooperative with a hard deadline and context health never self-heals: `session.dispose()` defaults to 5000 ms and accepts only `(0, 5000]`, and `own()` returns a function that unregisters the callback and never runs it (`src/air/session-scope.ts:50-55`, `:66-71`; `references/session-scope.md`); `webglcontextrestored` transitions `restoring` then immediately `failed`, because no GPU resource is rebuilt (`src/air/context-health.ts:171-177`; `references/context-health.md`).
- Capability layers, stated separately: every symbol of this surface, the generated `build/bootstrap.d.ts` (three fixed lines emitted by `tools/build/bootstrap-entry.cjs:17-20`, exposing only `createAirApp` plus the `AirApp`/`AirAppOptions` type re-export), the symbol-anchored declaration inventory in `references/app-options.md` (line numbers in generated files such as `build/cocosair.module.d.ts` are not stable across `npm run build:dts`, so they are marked `currently :NNNN` and the symbol names are the real pointers) and the bundle-pinned browser evidence older than the current candidate are inventoried there (Public surface and evidence status); do not write "verified" here without re-running the gate.

## Common Mistakes

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
  import { createAirApp } from 'cocosair.js/bootstrap'; // binds the canvas, then imports the engine
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

Do not conflate this with a release pause: `releaseScene()` sets `_needsResume`, so a following `run()` resumes a still-healthy loop for an in-document scene swap (`src/air/app.ts:155-157`, `:195`). A `webglcontextlost` never arms `_needsResume` (it only calls `game.pause()` at `src/air/context-health.ts:166`), so `run()` will not resume it, and even a manual `game.resume()` renders against a failed context - reload is the only route (`references/context-health.md`).

`run()` only calls `game.run()` for the first scene and `game.resume()` when `_needsResume` was armed by `releaseScene()` (`src/air/app.ts:146-158`, `:195`); a bare autoPause loss arms nothing, so without a prior `releaseScene()` the new scene loads and never ticks - which is what the `Wrong` block above hits.

## References

- `references/app-options.md` - AirAppOptions table with defaults and enforced ranges, policy and renderMode enum values, startup order and DPR timing, admission and identity rules, container DOM rules, lifecycle method and receipt field tables, declaration inventory and evidence status.
- `references/startup-errors.md` - every `AIR_E_*` literal plus `WEBGL2_REQUIRED` and the un-coded import-order errors, with throw site, trigger and remedy.
- `references/context-health.md` - state machine, snapshot and option fields, timeline cap, reload gate, what is not restored.
- `references/session-scope.md` - generation and token rules, `own()` semantics, dispose timeout maths and receipt statuses.

## Canonical docs

`docs/manual/safe-startup-and-release.md`, `docs/webgl2-only.md`, `docs/manual/design-viewport-and-controls.md`, `docs/manual/scene-switching.md`, `docs/UPSTREAM.md`, `README.md`.
