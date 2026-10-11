Derived from `src/cocos/input/input.ts`, `src/cocos/input/system-event.ts`, `src/cocos/input/types/event-enum.ts` and `src/cocos/input/types/key-code.ts` (2026-10-10).

# Native input events

Cocos AIR ships the engine's two input entry points unchanged. Reach for these for direct event handling; reach for the action layer ([action-state.md](action-state.md)) when you need named game actions with held/pressed/released/axis semantics.

## The two globals

- `input` - the unified `Input` instance. It merges the per-device PAL streams and is what UI components listen to. Enum: `Input.EventType` is an alias of `InputEventType` (`src/cocos/input/input.ts:160`, `src/cocos/input/input.ts:102`).
- `systemEvent` - the `SystemEvent` instance that re-emits the raw feed. Enum: `SystemEvent.EventType` is an alias of `SystemEventType` (`src/cocos/input/system-event.ts:72`, `src/cocos/input/system-event.ts:36`). It is built from `input`, so its listeners are downstream of the unified feed (`src/cocos/input/system-event.ts:77-91`).

Both are `EventTarget`-style: `on(type, callback, target?)`, `off(type, callback?, target?)`. Omitting the callback in `off` removes all listeners for that type.

Keep the callback (and target, if supplied) that this feature registered and pass the same values to `off` during teardown. Do not remove all listeners from the shared `input` or `systemEvent` globals: UI, adapters and other modules may still own listeners on the same event.

## Event enum values

`InputEventType` (`src/cocos/input/types/event-enum.ts:277`) and `SystemEventType` (`src/cocos/input/types/event-enum.ts:34`) share string values, so the same literal string underlies both (`TOUCH_START = 'touch-start'` at `src/cocos/input/types/event-enum.ts:285` and `:42`).

| Input.EventType / SystemEvent.EventType                     | Payload class   | Notes                                                                                       |
| ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `TOUCH_START` / `TOUCH_MOVE` / `TOUCH_END` / `TOUCH_CANCEL` | `EventTouch`    | one changed contact per dispatch on the native feed                                         |
| `MOUSE_DOWN` / `MOUSE_MOVE` / `MOUSE_UP` / `MOUSE_WHEEL`    | `EventMouse`    | mouse only; web PC                                                                          |
| `KEY_DOWN` / `KEY_UP`                                       | `EventKeyboard` | `KEY_PRESSING` exists on `Input.EventType` only (`src/cocos/input/types/event-enum.ts:373`) |

The event classes themselves carry no static event-name constants. There is no `EventMouse.MOUSE_DOWN`; the name lives on the enum. Use `Input.EventType.MOUSE_DOWN` or `SystemEvent.EventType.MOUSE_DOWN`.

## Payload classes

- `EventTouch` exposes `event.touch` (the changed `Touch`) and `event.getTouches()`; on the native action feed each changed contact is dispatched separately with `touch` set first (`src/air/action-input.ts:216-224`). `Touch.getID()` gives the pointer id.
- `EventKeyboard` exposes `event.keyCode` (`src/cocos/input/types/event/event-keyboard.ts:47`, `:86-90`) and optionally `event.rawEvent`.
- `EventMouse` exposes `event.getLocation()`, `event.getUILocation()` and the button; a primary mouse press is also converted into a synthetic touch so `Input.EventType.TOUCH_START` fires (`src/cocos/input/input.ts:96-98`, `_simulateEventTouch` at `src/cocos/input/input.ts:345-356`).

## KeyCode

Key identity is the engine `KeyCode` enum (`src/cocos/input/types/key-code.ts:29`). Physical keys such as `KeyCode.KEY_A = 65` (`:226`), `KeyCode.KEY_S = 83` (`:334`), `KeyCode.KEY_W = 87` (`:358`) map to DOM `KeyboardEvent.keyCode`. The dom action backend instead uses `KeyboardEvent.code` strings ([action-input.md](action-input.md)), so a native `keyCode` source and a dom `physicalCode` source never collide.

## Choosing between input and systemEvent

- Use `input` when you want the same feed UI sees, including the mouse-to-touch conversion.
- Use `systemEvent` when you want the raw per-event feed and do not want UI to consume it first.
- For gameplay actions, prefer `createActionState` + `createActionInput` so held state, idempotent press and blur/hidden resets are handled for you ([action-state.md](action-state.md), [action-input.md](action-input.md)).
