---
name: cocosair-application
description: "Configure and drive the Cocos AIR application handle - every AirAppOptions field vs its validator (canvas selector or element, renderMode 0..3, physics builtin or cannon, diagnostics errors or warnings, pixelRatioCap default 2, screenMode window or container, container, designResolution policy 0..4, contextLoss), the one-runtime-per-document admission rule keyed by Symbol.for('cocosair.bootstrap.v1'), the run/getScene/releaseScene/close lifecycle and the whole-page reload a closed runtime needs, startup error literals WEBGL2_REQUIRED and AIR_E_* codes, the attachContextHealth healthy/lost/restoring/failed state machine with no GPU rebuild, and createSessionScope ownership with (0,5000] timeoutMs. Use when starting a cocosair.js app with createAirApp, choosing or rejecting AirAppOptions values, hitting an AIR_E_ or WEBGL2_REQUIRED startup failure, replacing or releasing a scene, wiring screenMode container or designResolution, or reacting to a lost WebGL context."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, application"
  description_en: "Configure and drive the Cocos AIR application handle - every AirAppOptions field vs its validator (canvas selector or element, renderMode 0..3, physics builtin or cannon, diagnostics errors or warnings, pixelRatioCap default 2, screenMode window or container, container, designResolution policy 0..4, contextLoss), the one-runtime-per-document admission rule keyed by Symbol.for('cocosair.bootstrap.v1'), the run/getScene/releaseScene/close lifecycle and the whole-page reload a closed runtime needs, startup error literals WEBGL2_REQUIRED and AIR_E_* codes, the attachContextHealth healthy/lost/restoring/failed state machine with no GPU rebuild, and createSessionScope ownership with (0,5000] timeoutMs. Use when starting a cocosair.js app with createAirApp, choosing or rejecting AirAppOptions values, hitting an AIR_E_ or WEBGL2_REQUIRED startup failure, replacing or releasing a scene, wiring screenMode container or designResolution, or reacting to a lost WebGL context."
  description_zh: "配置 createAirApp 和应用生命周期、屏幕尺寸、会话清理及 WebGL 上下文健康。用于启动错误、场景替换、关闭和自定义 canvas。"
---

# Cocos AIR application lifecycle

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Build the app handle correctly: admit options before the engine evaluates, run and release scenes through the single per-document runtime, and read context health and session ownership from the handle instead of guessing at engine internals.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Which option values are actually legal, what is the real default, and what does a second `createAirApp` or a restart-after-failure hit?" -> `normalizeAirOptions`, `admitAirOptions` plus `AirAppImpl.close`, [app-options.md](references/app-options.md).
- "`createAirApp` rejected with some `AIR_E_...` / `WEBGL2_REQUIRED`" -> match `error.code`, then [startup-errors.md](references/startup-errors.md).
- "Swap or tear down the running scene without reloading" -> `app.run` / `app.releaseScene!()`, receipt fields in [app-options.md](references/app-options.md).
- "The context was lost; is the app still drawing?" -> `app.contextHealth` / `attachContextHealth`, [context-health.md](references/context-health.md).
- "Register asset, listener and timer cleanup that a scene switch must honour" -> `app.session` / `createSessionScope`, [session-scope.md](references/session-scope.md).
- "Fill the window versus fit a host element, or wire design resolution" -> `screenMode`/`container` and `designResolution` rows in [app-options.md](references/app-options.md); `view.setDesignResolutionSize` is called for you, coordinate-maths routing goes to the camera and UI skills, prose in `docs/manual/design-viewport-and-controls.md`.

## Contracts

One runtime is admitted per document; a closed or failed runtime needs a page reload. Validate options before loading the engine. HEADLESS produces no pixels; context-health observation does not rebuild GPU resources.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Importing the engine before the canvas is in the document
- [HIGH] Creating a second app in the same document after close()
- [HIGH] Using renderMode 3 to check rendered pixels
- [MEDIUM] Treating attachContextHealth as automatic device restoration
- [MEDIUM] Resuming in-document to recover from a context loss

## References

- [app-options.md](references/app-options.md) - AirAppOptions table with defaults and enforced ranges, policy and renderMode enum values, startup order and DPR timing, admission and identity rules, container DOM rules, lifecycle method and receipt field tables, declaration inventory and evidence status.
- [startup-errors.md](references/startup-errors.md) - every `AIR_E_*` literal plus `WEBGL2_REQUIRED` and the un-coded import-order errors, with throw site, trigger and remedy.
- [context-health.md](references/context-health.md) - state machine, snapshot and option fields, timeline cap, reload gate, what is not restored.
- [session-scope.md](references/session-scope.md) - generation and token rules, `own()` semantics, dispose timeout maths and receipt statuses.

## Canonical docs

`docs/manual/safe-startup-and-release.md`, `docs/webgl2-only.md`, `docs/manual/design-viewport-and-controls.md`, `docs/manual/scene-switching.md`, `docs/UPSTREAM.md`, `README.md`.
