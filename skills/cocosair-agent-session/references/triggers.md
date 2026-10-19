# agent session and inspection triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "let an agent or panel see the running app" -> the app sets `window.__airApp = app` (`examples/automation/main.ts:31`); the devtools panel reads `options.app ?? window.__airApp` (`tools/debug/panel.ts:67`). There is no runtime global the engine installs for you.
- "read the scene structure" -> `session.inspectScene()` for a flat `SceneSummary`, `session.inspectNode(id)` for a `NodeSummary` (`tools/debug/agent-session.ts:451`, `:505`). Observation is read-only and never adds asset refs.
- "apply a controlled change" -> `session.dispatch({ requestId, action, targetId, params })` for a whitelisted write (`tools/debug/agent-session.ts:665`). Writes require the target to be inside `writableScenes`; otherwise `OUT_OF_SCOPE`.
- "prove a frame changed" -> `session.captureFrame()` reads the canvas on the AFTER_DRAW hook (`tools/debug/agent-session.ts:589`).
- "collect what broke at runtime" -> devtools `session.getRuntimeErrors()` ring buffer (`tools/debug/agent-session.ts:647`) versus the runtime `app.diagnostics` bounded channel (`src/air/diagnostics.ts:14`).
- "measure a rendered region" -> `tools/debug/pixel-regions.mjs` conventions, screenshot top-left origin versus raw canvas bottom-left (`tools/debug/pixel-regions.mjs:5`, `:53`).
