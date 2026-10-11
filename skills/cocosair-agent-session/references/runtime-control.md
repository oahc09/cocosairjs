Derived from tools/debug/agent-session.ts, src/air/diagnostics.ts, tools/debug/panel.ts, examples/automation/main.ts, build/cocosair.module.d.ts on 2026-10-10.

# Runtime control and scene inspection

Two bounded surfaces matter for control: the `window.__airApp` page binding (a runtime-side convention the app sets) and the runtime `AirDiagnostics` channel (declared on the main entry). Inspection snapshots and the error ring buffer are devtools-side (`tools/debug/**`), documented here only to keep the two faces straight.

## window.__airApp (runtime-side convention)

The engine does not install any global for you. Application code assigns `window.__airApp = app` after `createAirApp(...)` so devtools can find the live app (`examples/automation/main.ts:31`). The devtools panel reads `options.app ?? window.__airApp` and shows a clear "app not found" status when the page never exposed it (`tools/debug/panel.ts:67`, `:9`, `:104`). Because it is just the `AirApp` object, reading `window.__airApp` in a browser page is pure JavaScript on the runtime side; calling `createAgentSession` on it is the devtools-only second step.

## inspectScene snapshot (devtools)

`session.inspectScene()` returns a `SceneSummary` over the current running scene (`tools/debug/agent-session.ts:451`, interface `:71-84`):

- `sceneId`, `name`, `nodeCount`, `componentCount`, and a `componentsByType` histogram keyed by `constructor.name` (`:467-472`).
- `cameraCount`, `lightCount` (Directional/Sphere/Spot/Point), and `rendererCount` (MeshRenderer/SkinnedMeshRenderer) (`:473-476`).
- `uniqueAssetCount` as `{ total, byKind }`, reused from the runtime asset inspector so unknown states are never reported as PASS (`tools/debug/agent-session.ts:487-489`).
- `nodes`: a flat `{ id, name, parentId }[]` including the scene root, truncated at `INSPECT_ROWS_LIMIT = 500` with `truncated: true` when over (`:166-167`, `:479-483`).

## inspectNode snapshot (devtools)

`session.inspectNode(targetId)` returns a `NodeSummary` (`tools/debug/agent-session.ts:505`, interface `:86-108`):

- identity and graph: `id`, `name`, `parentId`, `childrenIds`, `active` (activeInHierarchy), `activeSelf`, `layer` (`:518-526`).
- `components`: `{ id, type, enabled }[]` with session-stable component ids (`:526-530`).
- transforms: `local.position/rotationEuler/scale` as number triples and `world.position` (`:531-536`).
- optional `visual` observations, `null` when absent: `ui` (UITransform size/anchor), `label` (text/overflow/fontSize), `sprite` (frame/texture ids, rect, validity and business labels), and `mesh` (mesh id, material ids, skinning and visibility sub-reports) (`:98-107`, `:537-556`).

IDs are keyed by object identity within a session, so two same-named nodes get different ids and one node keeps one id across snapshots (`tools/debug/agent-session.ts:399-425`). A destroyed node, a replaced scene, or no running scene yields `STALE_TARGET` (`tools/debug/agent-session.ts:389-440`). A read-only session must call `inspectScene` first to obtain its OWN ids before it can address any write (`examples/automation/main.ts:170-178`).

## Runtime diagnostics vs devtools error ring buffer

These are independent channels; do not conflate them.

Runtime `AirDiagnostics` (shipped on the entry):

- Declared on the main entry as an optional `diagnostics` view of the native diagnostic stream (`src/air/diagnostics.ts:14`; in the SDK declarations it hangs off `AirApp` / the app handle, `build/cocosair.module.d.ts`, currently :55725). It exposes `snapshot()`, `onMessage()`, `clear()` and `destroy()` (`src/air/diagnostics.ts:16-20`).
- Each message is truncated to 600 characters (`src/air/diagnostics.ts:33`) and the map keeps at most 80 distinct bounded entries, evicting the oldest FIFO-style (`src/air/diagnostics.ts:42`); identical repeats fold into one record and only bump `occurrences`/`lastSeen` (`src/air/diagnostics.ts:37-39`).
- The factory `createAirDiagnostics` is marked `@engineInternal` and is NOT in the SDK declarations (`src/air/diagnostics.ts:23-24`); bootstrap owns the channel, so app code reads `app.diagnostics` but never constructs one.

Devtools `getRuntimeErrors` (not on the entry):

- `session.getRuntimeErrors({ since?, limit? })` reads a per-canvas `Collector` ring buffer (`tools/debug/agent-session.ts:647`, `:194`), default capacity `DEFAULT_ERROR_LIMIT = 200` (`:163`), and returns `{ errors: RuntimeErrorMessage[], dropped: number }` where `dropped` counts evictions (`:293-313`).
- Entries are tagged by `category` (`window-error`, `unhandled-rejection`, `shader`, `link`, `session-load`, `engine-warning`, `engine-error`) with a monotonic `seq` so `since` gives incremental reads (`:130-137`, `:306-311`).
- The collector prefers the shared `window.__airErrorHub` dispatch hub (installed by air-prelude) and only installs its own `window` error listeners and a `getContext` shader/link wrapper when that hub is absent, restoring the original on `detach` so the same event is never recorded twice (`tools/debug/agent-session.ts:174-183`, `:231-278`). It also seeds from the runtime `app.diagnostics.snapshot()` and subscribes to `onMessage`, folding those into `engine-warning`/`engine-error` categories (`tools/debug/agent-session.ts:221-230`).
- `clearRuntimeErrors()` empties the buffer and resets `dropped` (`tools/debug/agent-session.ts:658-661`).

In short: consume `app.diagnostics` from runtime app code; consume `session.getRuntimeErrors()` from a devtools session. Neither one exposes the other's method names.
