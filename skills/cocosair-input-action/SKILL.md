---
name: cocosair-input-action
description: "Wires native input events and the AIR action layer in code-first Cocos AIR - the engine input singleton and systemEvent globals, EventTouch/EventKeyboard/EventMouse with the Input.EventType and SystemEvent.EventType enums and KeyCode key codes, createActionState as a pure held/pressed/released/axis reducer keyed per (action, source) with seven reset reasons and no listener removal, createActionInput over the native or dom backend where dom needs an explicit canvas and skips editable targets, createSessionGate for session admission, and SceneStack persistent-page navigation with dual-page transition, capture-phase input block and LRU eviction. Use when handling touch/keyboard/mouse in a Cocos AIR scene, when keys stop firing because an input or textarea has focus, when a dom action backend throws for a missing canvas, when a held button must survive a blur or page-hidden reset, or when push/pop page state must be preserved during a transition."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, input, action"
  description_en: "Wires native input events and the AIR action layer in code-first Cocos AIR - the engine input singleton and systemEvent globals, EventTouch/EventKeyboard/EventMouse with the Input.EventType and SystemEvent.EventType enums and KeyCode key codes, createActionState as a pure held/pressed/released/axis reducer keyed per (action, source) with seven reset reasons and no listener removal, createActionInput over the native or dom backend where dom needs an explicit canvas and skips editable targets, createSessionGate for session admission, and SceneStack persistent-page navigation with dual-page transition, capture-phase input block and LRU eviction. Use when handling touch/keyboard/mouse in a Cocos AIR scene, when keys stop firing because an input or textarea has focus, when a dom action backend throws for a missing canvas, when a held button must survive a blur or page-hidden reset, or when push/pop page state must be preserved during a transition."
  description_zh: "处理原生和 DOM 输入、动作状态、焦点、会话门禁及 SceneStack。用于按键触摸、动作映射、输入阻断或清理问题。"
---

# Cocos AIR native input and the action layer

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Read real events through `input` / `systemEvent`, then drive gameplay through the AIR action layer: `createActionState` holds the state machine, `createActionInput` wires one backend to it, `createSessionGate` admits or rejects, and `SceneStack` navigates persistent pages.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "React to a touch, key or mouse directly" -> `input.on(Input.EventType.X, handler)` for the unified feed and `systemEvent.on(SystemEvent.EventType.X, handler)` for the raw feed (`src/cocos/input/input.ts:160`, `src/cocos/input/system-event.ts:72`); the event classes are `EventTouch`/`EventKeyboard`/`EventMouse`, keys come from `KeyCode`.
- "Map held keys/pointers to named game actions" -> `createActionState` (pure reducer) plus `createActionInput` (one backend); query with `held`/`pressed`/`released`/`axis` and drain edges with `consumeTick` (`src/air/action-state.ts:124-172`).
- "Gate a paused or backgrounded app" -> `createSessionGate` and its `active`/`generation`; pass it as the adapter's `session` (`src/air/action-input.ts:69-100`).
- "Persistent-page push/pop with preserved state" -> `SceneStack` over one long-lived `Scene` (`src/air/scene-stack.ts:47-188`); use `app.run()` replacement instead for a full scene swap (owned by the application skill).

## Contracts

Keep native and DOM action-source contracts distinct; DOM input needs an explicit canvas. Pair each listener with its own callback-specific off. Respect session generations, focus and SceneStack input blocking.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Using the dom backend and expecting the canvas to be found for you
- [HIGH] Assuming reset() unhooked the event listeners
- [MEDIUM] Expecting keys to keep firing while an input element has focus

## References

- [native-input.md](references/native-input.md) - the `input` and `systemEvent` globals, the `Input.EventType` and `SystemEvent.EventType` enums, the `EventTouch`/`EventKeyboard`/`EventMouse` payloads, `KeyCode`, and the mouse-to-touch conversion.
- [action-state.md](references/action-state.md) - the pure reducer surface: source identity and backends, OR semantics, idempotent press, `consumeTick` ordering, the seven reset reasons, axis clamping, and the `AIR_E_*` validation errors.
- [action-input.md](references/action-input.md) - the `native` and `dom` adapters, the explicit-canvas requirement, focus and editable-target rules, the session gate wiring, and `attach`/`detach`/`reset`/`dispose` lifecycle.
- [scene-stack.md](references/scene-stack.md) - persistent-page navigation: dual-page transition, capture-phase input block, LRU eviction, and disposal.

## Canonical docs

- `docs/manual/input-and-events.md` - the engine-level event surface, listener registration and event payloads.
- `docs/manual/input-action-state.md` - the action reducer and adapter contracts, backend choice and validation errors.
- `docs/manual/test-input-injection.md` - injecting native and dom input for tests and headless verification.
