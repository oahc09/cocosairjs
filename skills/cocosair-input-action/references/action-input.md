Derived from `src/air/action-input.ts` (2026-10-10).

# Action input: the backend adapter

`createActionInput(options)` wires one real input backend to the `createActionState` reducer. It does no coordinate math and dispatches no secondary events; it only translates admitted events into `press`/`release` calls (`src/air/action-input.ts:13-16`).

## Backends

Exactly one backend, `native` (default) or `dom` (`src/air/action-input.ts:104-107`). `manual` is not an adapter backend - it is a source backend you feed by calling `state.press`/`state.release` yourself (`src/air/action-state.ts:41`).

- `native`: subscribes the engine `input` singleton for `KEY_DOWN`/`KEY_UP`/`TOUCH_START`/`TOUCH_END`/`TOUCH_CANCEL`/`MOUSE_LEAVE` (`src/air/action-input.ts:360-365`). Keyboard sources use engine `keyCode`; touch sources use `event.touch.getID()` (`src/air/action-input.ts:210-227`). It also adds a `window` capture `keyup` that maps `KeyboardEvent.code` back through `code2KeyCode` so a key held before focus moved to an editable still releases (`src/air/action-input.ts:229-235`, `:319`).
- `dom`: keyboard is captured on `window` in the capture phase, so it runs before any canvas block (`src/air/action-input.ts:294-295`, `:9-11`); pointer goes through `PointerEvent` when available, else a `mouse + touch` legacy pair, never both (`src/air/action-input.ts:161-163`, `:296-309`). `adapter.domChannel` reports `'pointer'` or `'legacy'` (`src/air/action-input.ts:123-124`, `:353`).

## Canvas is explicit for dom

```js
const adapter = createActionInput({ state, backend: 'dom', canvas: document.getElementById('GameCanvas') });
```

The dom backend needs a canvas as its pointer target and throws `AIR_E_INVALID_SOURCE('backend "dom" requires an explicit canvas')` when it is missing (`src/air/action-input.ts:156-158`). It never auto-discovers `#GameCanvas`; the option doc is explicit that this is "never auto-discovered here" (`src/air/action-input.ts:110-113`). For `native`, `canvas` is optional and used only as the `requestFocus` target (`src/air/action-input.ts:113`, `:395-399`).

## Focus, editable targets and preventDefault

- `attach()` never calls `focus()`; a Start/Resume flow calls `adapter.requestFocus()` explicitly and reads back whether the canvas became `document.activeElement` (`src/air/action-input.ts:21-22`, `:131`, `:395-399`).
- keydown from an editable target is not admitted: `isEditableTarget` rejects `INPUT`, `TEXTAREA`, `SELECT` and any contenteditable element (`src/air/action-input.ts:139-146`). The native feed checks `rawEvent.target` when present, else `document.activeElement` (`src/air/action-input.ts:201-207`); the dom feed checks `event.target` (`src/air/action-input.ts:241`). A keyup for an already-held source still releases, so a held key does not stick when focus moves into a field (`src/air/action-input.ts:19-20`, `:212-215`, `:245-248`).
- `preventDefault` defaults to false, so scrolling and text input are untouched; when true it applies only to admitted events (`src/air/action-input.ts:22`, `:116-117`, `:242`).
- OS key repeat does not re-arm: the dom layer drops `event.repeat` keydowns and the reducer is idempotent anyway (`src/air/action-input.ts:22`, `:240`).

## Session gate

`createSessionGate()` takes no arguments and returns an `AirActionSessionGate`: `generation` (incremented by `activate()`), `active`, `deactivateReason`, `activate()`, `deactivate(reason?)`, and optional `onChange`/`offChange` (`src/air/action-input.ts:51-66`, `:69-100`). Pass it as the adapter's `session`; omitting it admits always (`src/air/action-input.ts:114-115`). Admission is checked per event - a retired session rejects both press and release until the next `activate()` (`src/air/action-input.ts:178`, `:182-197`). When the gate supports `onChange`, the adapter subscribes at creation and resets on transitions: `deactivate -> reset('deactivate')`, a new generation `-> reset('restart')` (`src/air/action-input.ts:325-330`, `:347-349`). A foreign gate without `onChange` still works as a pure admission check; the caller clears state itself (`src/air/action-input.ts:17-19`).

## Lifecycle

| Call            | Effect                                                                                                    | Source                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `attach()`      | installs backend + `blur`/`visibilitychange` listeners; idempotent; throws `AIR_E_DISPOSED` after dispose | `src/air/action-input.ts:127-128`, `:356-374`, `:286-289`, `:312-321` |
| `detach()`      | removes listeners exactly; keeps reducer state; idempotent                                                | `src/air/action-input.ts:129-130`, `:376-393`                         |
| `reset(reason)` | forwards to the reducer; no-op after dispose                                                              | `src/air/action-input.ts:133-134`, `:401-404`                         |
| `dispose()`     | terminal: `reset('dispose')` + `detach()` + gate unbind; re-`attach` is impossible                        | `src/air/action-input.ts:135-136`, `:406-412`                         |

`detach` is structural unbinding only and leaves held state intact; only `dispose` clears it via `reset('dispose')` (`src/air/action-input.ts:26`, `:406-411`). `reset` on either the state or the adapter never removes listeners - that is what `detach` is for (`src/air/action-state.ts:165-171`).
