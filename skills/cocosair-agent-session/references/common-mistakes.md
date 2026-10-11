Derived from the cocosair-agent-session skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### [HIGH] Blindly retrying a write with the same requestId

Wrong:

```js
// a create/add failed to reach the page; assuming dispatch is an idempotent replay:
await session.dispatch({ requestId: 'a2', action: 'setTransform', targetId: id, params: { space: 'local', position: [0, 0, 0] } });
// ...network hiccup, then retry the SAME requestId expecting the original result
await session.dispatch({ requestId: 'a2', action: 'setTransform', targetId: id, params: { space: 'local', position: [5, 5, 5] } });
```

Correct:

```js
const first = await session.dispatch({ requestId: 'a2', action: 'setTransform', targetId: id, params: { space: 'local', position: [0, 0, 0] } });
if (!first.ok && first.error.code !== 'INVALID_ARGUMENT') {
    const retry = await session.dispatch({ requestId: 'a2-retry', action: 'setTransform', targetId: id, params: { space: 'local', position: [0, 0, 0] } });
}
```

A duplicate `requestId` within the 60s retention window (or while still running) returns `ok: false` with `INVALID_ARGUMENT`, not the original result (`tools/debug/agent-session.ts:673-678`); use a fresh `requestId` and inspect `ok` before retrying.

### [HIGH] Treating the devtools session as a default-runtime API in app code

Wrong:

```js
// shipped application code, not under a dev server:
import { createAgentSession, inspectScene } from 'cocosair';
const session = createAgentSession({ app });   // these names are not on the cocosair export
```

Correct:

```js
// runtime app code only publishes the binding:
window.__airApp = app;
// a dev-only tool attaches the session through the dev server route:
const { createAgentSession } = await import('/__debug/agent-session.js');
const session = createAgentSession({ app, writableScenes: [app.getScene()] });
```

`createAgentSession`, `inspectScene`, `dispatch` and the probes live in `tools/debug/agent-session.ts` and are not on the runtime bundle export; the automation example loads them only via the dev server's `/__debug/` route (`examples/automation/main.ts:50`, `tools/dev/dev-server.cjs:337`).

### [MEDIUM] Confusing the runtime diagnostics channel with the devtools error ring buffer

Wrong:

```js
const errs = app.diagnostics.getRuntimeErrors();   // no such method on AirDiagnostics
const snap = session.getRuntimeErrors().snapshot;  // Collector returns { errors, dropped }, not a snapshot field
```

Correct:

```js
const runtime = app.diagnostics ? app.diagnostics.snapshot() : [];   // bounded 80-entry runtime channel
const devtools = session.getRuntimeErrors();                          // { errors, dropped } ring, default cap 200
```

`AirDiagnostics` exposes `snapshot/onMessage/clear/destroy` only (`src/air/diagnostics.ts:16-20`), while `getRuntimeErrors` is the devtools `Collector.list` returning `{ errors, dropped }` (`tools/debug/agent-session.ts:306-313`, `:647`).

### [MEDIUM] Reading raw canvas pixels with a screenshot-style origin

Wrong:

```js
// measuring a top-left rectangle directly against gl.readPixels output
measurePixelRegions({ width, height, data }, [{ x: 0, y: 0, w: 40, h: 40 }], { origin: 'top-left' });
```

Correct:

```js
// screenshot pixels are top-left; readPixels rows are bottom-left, so use the canvas helper
measureCanvasRegions(canvas, [{ x: 0, y: 0, w: 40, h: 40 }], { distance: 30 });
```

`measurePixelRegions` defaults to a `top-left` origin for screenshot bytes, but `measureCanvasRegions` forces `bottom-left` because `gl.readPixels` rows are inverted, and `lit` is RGB distance from each region's modal background with a `distance` of 30 (`tools/debug/pixel-regions.mjs:5`, `:11`, `:47-54`).
