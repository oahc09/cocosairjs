# Cocos AIR native input and the action layer triggers

Source annotations refer to the AIR checkout.

## When to use what

- "React to a touch, key or mouse directly" -> `input.on(Input.EventType.X, handler)` for the unified feed and `systemEvent.on(SystemEvent.EventType.X, handler)` for the raw feed (`src/cocos/input/input.ts:160`, `src/cocos/input/system-event.ts:72`); the event classes are `EventTouch`/`EventKeyboard`/`EventMouse`, keys come from `KeyCode`.
- "Map held keys/pointers to named game actions" -> `createActionState` (pure reducer) plus `createActionInput` (one backend); query with `held`/`pressed`/`released`/`axis` and drain edges with `consumeTick` (`src/air/action-state.ts:124-172`).
- "Gate a paused or backgrounded app" -> `createSessionGate` and its `active`/`generation`; pass it as the adapter's `session` (`src/air/action-input.ts:69-100`).
- "Persistent-page push/pop with preserved state" -> `SceneStack` over one long-lived `Scene` (`src/air/scene-stack.ts:47-188`); use `app.run()` replacement instead for a full scene swap (owned by the application skill).
