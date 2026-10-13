---
name: cocosair-agent-session
description: "Drives and inspects a running Cocos AIR app from an agent or devtool session. Covers the window.__airApp page binding, the devtools agent-session request protocol in tools/debug/agent-session.ts (requestId/action/targetId/params returning requestId ok result or error, the INVALID_ARGUMENT duplicate-requestId rejection, inspectScene and inspectNode snapshots, captureFrame on AFTER_DRAW, getRuntimeErrors ring buffer), the visual probe pixel-region conventions, and the runtime AirDiagnostics bounded channel. Use when an agent needs to observe a live scene, apply a controlled write, capture a frame, read runtime errors, or wire the dev-only session, remembering the session and probe surface are devtools not default-runtime APIs."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, agent, session"
  description_en: "Drives and inspects a running Cocos AIR app from an agent or devtool session. Covers the window.__airApp page binding, the devtools agent-session request protocol in tools/debug/agent-session.ts (requestId/action/targetId/params returning requestId ok result or error, the INVALID_ARGUMENT duplicate-requestId rejection, inspectScene and inspectNode snapshots, captureFrame on AFTER_DRAW, getRuntimeErrors ring buffer), the visual probe pixel-region conventions, and the runtime AirDiagnostics bounded channel. Use when an agent needs to observe a live scene, apply a controlled write, capture a frame, read runtime errors, or wire the dev-only session, remembering the session and probe surface are devtools not default-runtime APIs."
  description_zh: "使用开发工具观察运行时、按明确范围写入、捕获画面和读取诊断。用于实时应用检查或受控自动化，工具不属于默认运行时包。"
---

# Cocos AIR agent session and inspection

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Drive and observe a running Cocos AIR app through two distinct faces: the runtime face (the `window.__airApp` binding the app sets itself plus the bounded `AirDiagnostics` channel on the main entry) and the devtools face (the `tools/debug/**` session protocol, scene/node snapshots, frame capture, error ring buffer, and pixel probes). The devtools face is NOT part of the default runtime bundle and is not importable from `cocosair`; keep it out of shipped app code.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "let an agent or panel see the running app" -> the app sets `window.__airApp = app` (`examples/automation/main.ts:31`); the devtools panel reads `options.app ?? window.__airApp` (`tools/debug/panel.ts:67`). There is no runtime global the engine installs for you.
- "read the scene structure" -> `session.inspectScene()` for a flat `SceneSummary`, `session.inspectNode(id)` for a `NodeSummary` (`tools/debug/agent-session.ts:451`, `:505`). Observation is read-only and never adds asset refs.
- "apply a controlled change" -> `session.dispatch({ requestId, action, targetId, params })` for a whitelisted write (`tools/debug/agent-session.ts:665`). Writes require the target to be inside `writableScenes`; otherwise `OUT_OF_SCOPE`.
- "prove a frame changed" -> `session.captureFrame()` reads the canvas on the AFTER_DRAW hook (`tools/debug/agent-session.ts:589`).
- "collect what broke at runtime" -> devtools `session.getRuntimeErrors()` ring buffer (`tools/debug/agent-session.ts:647`) versus the runtime `app.diagnostics` bounded channel (`src/air/diagnostics.ts:14`).
- "measure a rendered region" -> `tools/debug/pixel-regions.mjs` conventions, screenshot top-left origin versus raw canvas bottom-left (`tools/debug/pixel-regions.mjs:5`, `:53`).

## Contracts

Agent sessions are devtools-only and require explicit writable scope. Inspect session-local IDs before writes. Duplicate request IDs are rejected; capture waits for AFTER_DRAW. Runtime diagnostics are a separate API.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Blindly retrying a write with the same requestId
- [HIGH] Treating the devtools session as a default-runtime API in app code
- [MEDIUM] Confusing the runtime diagnostics channel with the devtools error ring buffer
- [MEDIUM] Reading raw canvas pixels with a screenshot-style origin

## References

- [agent-session.md](references/agent-session.md) - the devtools request protocol, error codes, duplicate-requestId rejection, retention window and FIFO cap, and the createAgentSession/writableScenes attach contract.
- [runtime-control.md](references/runtime-control.md) - the `window.__airApp` binding, scene/node snapshot shapes, ID stability, STALE_TARGET semantics and the runtime AirDiagnostics bounded channel versus the devtools error ring buffer.
- [visual-probes.md](references/visual-probes.md) - captureFrame on AFTER_DRAW, the frame-diff discipline and the pixel-region origin/lit conventions in `tools/debug/pixel-regions.mjs`.

## Canonical docs

- `docs/guides/agent-development.md` - the agent-facing session model, read-only default, and explicit writable scope.
- `docs/guides/runtime-inspection.md` - scene/node inspection snapshots and the devtools-only nature of the session surface.
- `docs/guides/visual-probe-contracts.md` - capture timing and pixel-region contracts.
