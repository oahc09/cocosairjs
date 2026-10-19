# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry the page imports and how the canvas gets there.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - DOM overlays and canvas textures on the same `#GameCanvas`.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - how to prove a lifecycle claim instead of asserting it.

Scene replacement by a page-stack component, physics backend internals and live-session inspection are owned by the cocosair-scene-graph, cocosair-physics and cocosair-agent-session skills (the router's Foundations row for this skill routes here for the app handle itself).

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Historical import-order warnings below and in the original mistake reference conflict with the current admission contract. Main import may precede canvas creation; createAirApp validates and binds the selected canvas and DPR before engine initialization. Follow [current startup options](app-options.md) and [main entry rules](../../cocosair-project-setup/references/entries.md). Persistent SceneStack page ownership is [input-action](../../cocosair-input-action/SKILL.md); the older sibling sentence above is retained provenance.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Build the app handle correctly: admit options before the engine evaluates, run and release scenes through the single per-document runtime, and read context health and session ownership from the handle instead of guessing at engine internals.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Importing the engine before the canvas is in the document
- [HIGH] Creating a second app in the same document after close()
- [HIGH] Using renderMode 3 to check rendered pixels
- [MEDIUM] Treating attachContextHealth as automatic device restoration
- [MEDIUM] Resuming in-document to recover from a context loss

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Configure and drive the Cocos AIR application handle - every AirAppOptions field vs its validator (canvas selector or element, renderMode 0..3, physics builtin or cannon, diagnostics errors or warnings, pixelRatioCap default 2, screenMode window or container, container, designResolution policy 0..4, contextLoss), the one-runtime-per-document admission rule keyed by Symbol.for('cocosair.bootstrap.v1'), the run/getScene/releaseScene/close lifecycle and the whole-page reload a closed runtime needs, startup error literals WEBGL2_REQUIRED and AIR_E_* codes, the attachContextHealth healthy/lost/restoring/failed state machine with no GPU rebuild, and createSessionScope ownership with (0,5000] timeoutMs. Use when starting a cocosair.js app with createAirApp, choosing or rejecting AirAppOptions values, hitting an AIR_E_ or WEBGL2_REQUIRED startup failure, replacing or releasing a scene, wiring screenMode container or designResolution, or reacting to a lost WebGL context.

### Keywords

Cocos AIR, cocosair.js, application

## References

- [app-options.md](app-options.md) - AirAppOptions table with defaults and enforced ranges, policy and renderMode enum values, startup order and DPR timing, admission and identity rules, container DOM rules, lifecycle method and receipt field tables, declaration inventory and evidence status.
- [startup-errors.md](startup-errors.md) - every `AIR_E_*` literal plus `WEBGL2_REQUIRED` and the un-coded import-order errors, with throw site, trigger and remedy.
- [context-health.md](context-health.md) - state machine, snapshot and option fields, timeline cap, reload gate, what is not restored.
- [session-scope.md](session-scope.md) - generation and token rules, `own()` semantics, dispose timeout maths and receipt statuses.

## Canonical docs

`docs/manual/safe-startup-and-release.md`, `docs/webgl2-only.md`, `docs/manual/design-viewport-and-controls.md`, `docs/manual/scene-switching.md`, `docs/UPSTREAM.md`, `README.md`.
