---
name: cocosair-agent-session
description: Drives and inspects a running Cocos AIR app from an agent or devtool session. Covers the window.__airApp page binding, the devtools agent-session request protocol in tools/debug/agent-session.ts (requestId/action/targetId/params returning requestId ok result or error, the INVALID_ARGUMENT duplicate-requestId rejection, inspectScene and inspectNode snapshots, captureFrame on AFTER_DRAW, getRuntimeErrors ring buffer), the visual probe pixel-region conventions, and the runtime AirDiagnostics bounded channel. Use when an agent needs to observe a live scene, apply a controlled write, capture a frame, read runtime errors, or wire the dev-only session, remembering the session and probe surface are devtools not default-runtime APIs.
---

# Cocos AIR agent session and inspection

Drive and observe a running Cocos AIR app through two distinct faces: the runtime face (the `window.__airApp` binding the app sets itself plus the bounded `AirDiagnostics` channel on the main entry) and the devtools face (the `tools/debug/**` session protocol, scene/node snapshots, frame capture, error ring buffer, and pixel probes). The devtools face is NOT part of the default runtime bundle and is not importable from `cocosair`; keep it out of shipped app code.

## Quick Start

The `window.__airApp` binding is a page convention: application code assigns it, devtools read it. Reading it is pure runtime-side JavaScript and safe to run in a browser page.

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Vec3 } from 'cocosair';

// #GameCanvas exists before this import (the screen adapter initializes at module load).
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('probe-target');
const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 2, 6));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;

// Runtime face only: publish the app so a devtools session or panel can find it.
window.__airApp = app;
app.run(scene);

// Later, from a dev-only console (needs the dev server): attach the agent session
// with `await import('/__debug/agent-session.js')` then createAgentSession({ app }).
// See references/agent-session.md; this call does NOT exist in the cocosair export.
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp`/`AirApp` and the app lifecycle a session binds to.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - the `Scene`/`Node`/`Component` tree that `inspectScene` and `inspectNode` snapshot.
- [cocosair-rendering](../cocosair-rendering/SKILL.md) - cameras, renderers and the drawn frame `captureFrame` samples on AFTER_DRAW.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the browser probes and evidence conventions the pixel regions align with.
- [cocosair-performance](../cocosair-performance/SKILL.md) - the step clock and frame pacing the session's capture waits ride on.

## When to use what

- "let an agent or panel see the running app" -> the app sets `window.__airApp = app` (`examples/automation/main.ts:31`); the devtools panel reads `options.app ?? window.__airApp` (`tools/debug/panel.ts:67`). There is no runtime global the engine installs for you.
- "read the scene structure" -> `session.inspectScene()` for a flat `SceneSummary`, `session.inspectNode(id)` for a `NodeSummary` (`tools/debug/agent-session.ts:451`, `:505`). Observation is read-only and never adds asset refs.
- "apply a controlled change" -> `session.dispatch({ requestId, action, targetId, params })` for a whitelisted write (`tools/debug/agent-session.ts:665`). Writes require the target to be inside `writableScenes`; otherwise `OUT_OF_SCOPE`.
- "prove a frame changed" -> `session.captureFrame()` reads the canvas on the AFTER_DRAW hook (`tools/debug/agent-session.ts:589`).
- "collect what broke at runtime" -> devtools `session.getRuntimeErrors()` ring buffer (`tools/debug/agent-session.ts:647`) versus the runtime `app.diagnostics` bounded channel (`src/air/diagnostics.ts:14`).
- "measure a rendered region" -> `tools/debug/pixel-regions.mjs` conventions, screenshot top-left origin versus raw canvas bottom-left (`tools/debug/pixel-regions.mjs:5`, `:53`).

## Contracts

Runtime face (shipped on the `cocosair` entry):
- `AirDiagnostics` is an opt-in bounded view of the native diagnostic stream, declared on the main entry (`src/air/diagnostics.ts:14`; in the SDK declarations it appears on `AirApp` as an optional `diagnostics` field, `build/cocosair.module.d.ts`, currently :55725). It exposes `snapshot()`, `onMessage()`, `clear()` and `destroy()` (`src/air/diagnostics.ts:16-20`).
- Each message is truncated to 600 characters (`src/air/diagnostics.ts:33`) and the channel evicts to 80 distinct entries FIFO-style (`src/air/diagnostics.ts:42`); identical repeats bump `occurrences` on one bounded record (`src/air/diagnostics.ts:37-39`).
- The factory `createAirDiagnostics` is marked `@engineInternal` (`src/air/diagnostics.ts:23-24`) and is NOT exported in the SDK declarations, so app code consumes `app.diagnostics` but never constructs the channel itself.

Devtools face (`tools/debug/**`, NOT on the runtime export; validated against source, not the `.d.ts`):
- Request contract: `AgentRequest` is `{ requestId, action, targetId?, params? }` (`tools/debug/agent-session.ts:48-53`) and every `dispatch` resolves to `{ requestId, ok: true, result }` or `{ requestId, ok: false, error: { code, message, cause? } }` (`tools/debug/agent-session.ts:60-68`). Error codes are `INVALID_ARGUMENT / STALE_TARGET / OUT_OF_SCOPE / UNSUPPORTED_ACTION / LOAD_FAILED / SESSION_CLOSED`, plus `CAPTURE_FAILED` for capture (`tools/debug/agent-session.ts:31-38`).
- Duplicate `requestId` is REJECTED as `INVALID_ARGUMENT`, not idempotently replayed: a repeat that is still running OR settled within the 60s retention window fails (`tools/debug/agent-session.ts:673-678`; `REQUEST_RETENTION_MS = 60_000` at `:168`). The window count default is `DEFAULT_REQUEST_WINDOW = 256` (`tools/debug/agent-session.ts:164`, overridable via `requestIdWindow`); records past the retention time are cleared FIFO and the log is hard-capped at `requestIdWindow * 2` entries (`tools/debug/agent-session.ts:680-686`). So 256 is the retention window SIZE, the 60000ms value is the retention TIME, and a blind write-retry never returns the original result.
- `inspectScene()` returns a `SceneSummary` distinguishing `nodeCount`, `componentCount`, `componentsByType`, camera/light/renderer counts, `uniqueAssetCount` and a flat `nodes` list truncated at `INSPECT_ROWS_LIMIT = 500` with a `truncated` flag (`tools/debug/agent-session.ts:451`, interface `:71-84`, limit `:167`). `inspectNode(targetId)` returns a `NodeSummary` with stable session-local `id`, parent/children ids, active/layer, component list, local/world transforms and optional `visual` observations (`tools/debug/agent-session.ts:505`, interface `:86-108`).
- IDs are stable within a session and keyed by object identity, so two same-named nodes get different ids; a destroyed node or a replaced scene yields `STALE_TARGET` (`tools/debug/agent-session.ts:399-440`). A read-only session must `inspectScene` first to get its OWN ids before it can address a write (`examples/automation/main.ts:170-178`).
- `captureFrame()` samples on the AFTER_DRAW hook: it subscribes to `cc.director`'s `EVENT_AFTER_DRAW` (`tools/debug/agent-session.ts:598`, `:641`), which is the `DirectorEvent.AFTER_DRAW` alias (`src/cocos/game/director.ts:109`, aliased `:240`). It snapshots the scene at request time and fails with `CAPTURE_FAILED` if the scene was replaced before the draw, times out (default 5000ms), or the canvas yields no PNG (`tools/debug/agent-session.ts:606-638`).
- `getRuntimeErrors({ since, limit })` reads a capacity-bounded ring `Collector` keyed on the app canvas; default limit `DEFAULT_ERROR_LIMIT = 200` (`tools/debug/agent-session.ts:647`, `:163`, `:194`), returning `{ errors, dropped }` where `dropped` counts evictions (`tools/debug/agent-session.ts:293-313`). Categories include `window-error`, `unhandled-rejection`, `shader`, `link`, `session-load`, `engine-warning`, `engine-error` (`tools/debug/agent-session.ts:130-137`). The collector prefers the shared `window.__airErrorHub` dispatch channel and only installs its own window/WebGL hooks when the hub is absent (`tools/debug/agent-session.ts:231-278`).
- Wiring is dev-only: `createAgentSession(options)` is the explicit attach factory (`tools/debug/agent-session.ts:935`); the dev server bundles `tools/debug/**` entries on demand and serves them under `/__debug/`, leaving `cocosair` external so the session shares the page's single engine instance (`tools/dev/dev-server.cjs:193`, `:207`, `:337-341`). The `automation` example demonstrates the full loop, attaching with `await import('/__debug/agent-session.js')` (`examples/automation/main.ts:50`, `:89`).

## Common Mistakes

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

## References

- `references/agent-session.md` - the devtools request protocol, error codes, duplicate-requestId rejection, retention window and FIFO cap, and the createAgentSession/writableScenes attach contract.
- `references/runtime-control.md` - the `window.__airApp` binding, scene/node snapshot shapes, ID stability, STALE_TARGET semantics and the runtime AirDiagnostics bounded channel versus the devtools error ring buffer.
- `references/visual-probes.md` - captureFrame on AFTER_DRAW, the frame-diff discipline and the pixel-region origin/lit conventions in `tools/debug/pixel-regions.mjs`.

## Canonical docs

- `docs/guides/agent-development.md` - the agent-facing session model, read-only default, and explicit writable scope.
- `docs/guides/runtime-inspection.md` - scene/node inspection snapshots and the devtools-only nature of the session surface.
- `docs/guides/visual-probe-contracts.md` - capture timing and pixel-region contracts.
