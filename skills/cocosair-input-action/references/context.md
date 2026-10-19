# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp`, the app handle and its session scope that gate input admission.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `Node`/`Scene` structure and deferred `destroy()` that `SceneStack` pages rely on.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - the camera converting a screen point to a ray for a picked node.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - how to prove an input path in a real browser instead of asserting it.

For gesture unlock, live inspection or widgets, load cocosair-audio-video, cocosair-agent-session or cocosair-ui-2d as needed. These skills exist alongside this one.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Read real events through `input` / `systemEvent`, then drive gameplay through the AIR action layer: `createActionState` holds the state machine, `createActionInput` wires one backend to it, `createSessionGate` admits or rejects, and `SceneStack` navigates persistent pages.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Using the dom backend and expecting the canvas to be found for you
- [HIGH] Assuming reset() unhooked the event listeners
- [MEDIUM] Expecting keys to keep firing while an input element has focus

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Wires native input events and the AIR action layer in code-first Cocos AIR - the engine input singleton and systemEvent globals, EventTouch/EventKeyboard/EventMouse with the Input.EventType and SystemEvent.EventType enums and KeyCode key codes, createActionState as a pure held/pressed/released/axis reducer keyed per (action, source) with seven reset reasons and no listener removal, createActionInput over the native or dom backend where dom needs an explicit canvas and skips editable targets, createSessionGate for session admission, and SceneStack persistent-page navigation with dual-page transition, capture-phase input block and LRU eviction. Use when handling touch/keyboard/mouse in a Cocos AIR scene, when keys stop firing because an input or textarea has focus, when a dom action backend throws for a missing canvas, when a held button must survive a blur or page-hidden reset, or when push/pop page state must be preserved during a transition.

### Keywords

Cocos AIR, cocosair.js, input, action

## References

- [native-input.md](native-input.md) - the `input` and `systemEvent` globals, the `Input.EventType` and `SystemEvent.EventType` enums, the `EventTouch`/`EventKeyboard`/`EventMouse` payloads, `KeyCode`, and the mouse-to-touch conversion.
- [action-state.md](action-state.md) - the pure reducer surface: source identity and backends, OR semantics, idempotent press, `consumeTick` ordering, the seven reset reasons, axis clamping, and the `AIR_E_*` validation errors.
- [action-input.md](action-input.md) - the `native` and `dom` adapters, the explicit-canvas requirement, focus and editable-target rules, the session gate wiring, and `attach`/`detach`/`reset`/`dispose` lifecycle.
- [scene-stack.md](scene-stack.md) - persistent-page navigation: dual-page transition, capture-phase input block, LRU eviction, and disposal.

## Canonical docs

- `docs/manual/input-and-events.md` - the engine-level event surface, listener registration and event payloads.
- `docs/manual/input-action-state.md` - the action reducer and adapter contracts, backend choice and validation errors.
- `docs/manual/test-input-injection.md` - injecting native and dom input for tests and headless verification.
