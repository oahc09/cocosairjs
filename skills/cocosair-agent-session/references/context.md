# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp`/`AirApp` and the app lifecycle a session binds to.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - the `Scene`/`Node`/`Component` tree that `inspectScene` and `inspectNode` snapshot.
- [cocosair-rendering](../../cocosair-rendering/SKILL.md) - cameras, renderers and the drawn frame `captureFrame` samples on AFTER_DRAW.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the browser probes and evidence conventions the pixel regions align with.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - the step clock and frame pacing the session's capture waits ride on.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Drive and observe a running Cocos AIR app through two distinct faces: the runtime face (the `window.__airApp` binding the app sets itself plus the bounded `AirDiagnostics` channel on the main entry) and the devtools face (the `tools/debug/**` session protocol, scene/node snapshots, frame capture, error ring buffer, and pixel probes). The devtools face is NOT part of the default runtime bundle and is not importable from `cocosair`; keep it out of shipped app code.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Blindly retrying a write with the same requestId
- [HIGH] Treating the devtools session as a default-runtime API in app code
- [MEDIUM] Confusing the runtime diagnostics channel with the devtools error ring buffer
- [MEDIUM] Reading raw canvas pixels with a screenshot-style origin

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives and inspects a running Cocos AIR app from an agent or devtool session. Covers the window.__airApp page binding, the devtools agent-session request protocol in tools/debug/agent-session.ts (requestId/action/targetId/params returning requestId ok result or error, the INVALID_ARGUMENT duplicate-requestId rejection, inspectScene and inspectNode snapshots, captureFrame on AFTER_DRAW, getRuntimeErrors ring buffer), the visual probe pixel-region conventions, and the runtime AirDiagnostics bounded channel. Use when an agent needs to observe a live scene, apply a controlled write, capture a frame, read runtime errors, or wire the dev-only session, remembering the session and probe surface are devtools not default-runtime APIs.

### Keywords

Cocos AIR, cocosair.js, agent, session

## References

- [agent-session.md](agent-session.md) - the devtools request protocol, error codes, duplicate-requestId rejection, retention window and FIFO cap, and the createAgentSession/writableScenes attach contract.
- [runtime-control.md](runtime-control.md) - the `window.__airApp` binding, scene/node snapshot shapes, ID stability, STALE_TARGET semantics and the runtime AirDiagnostics bounded channel versus the devtools error ring buffer.
- [visual-probes.md](visual-probes.md) - captureFrame on AFTER_DRAW, the frame-diff discipline and the pixel-region origin/lit conventions in `tools/debug/pixel-regions.mjs`.

## Canonical docs

- `docs/guides/agent-development.md` - the agent-facing session model, read-only default, and explicit writable scope.
- `docs/guides/runtime-inspection.md` - scene/node inspection snapshots and the devtools-only nature of the session surface.
- `docs/guides/visual-probe-contracts.md` - capture timing and pixel-region contracts.
