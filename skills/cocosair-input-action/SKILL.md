---
name: cocosair-input-action
description: Wires native input events and the AIR action layer in code-first Cocos AIR - the engine input singleton and systemEvent globals, EventTouch/EventKeyboard/EventMouse with the Input.EventType and SystemEvent.EventType enums and KeyCode key codes, createActionState as a pure held/pressed/released/axis reducer keyed per (action, source) with seven reset reasons and no listener removal, createActionInput over the native or dom backend where dom needs an explicit canvas and skips editable targets, createSessionGate for session admission, and SceneStack persistent-page navigation with dual-page transition, capture-phase input block and LRU eviction. Use when handling touch/keyboard/mouse in a Cocos AIR scene, when keys stop firing because an input or textarea has focus, when a dom action backend throws for a missing canvas, when a held button must survive a blur or page-hidden reset, or when push/pop page state must be preserved during a transition.
---

# Cocos AIR native input and the action layer

Read real events through `input` / `systemEvent`, then drive gameplay through the AIR action layer: `createActionState` holds the state machine, `createActionInput` wires one backend to it, `createSessionGate` admits or rejects, and `SceneStack` navigates persistent pages.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import {
    createAirApp, Scene, Node, Camera, Vec3, Color, Component,
    input, Input, systemEvent, SystemEvent, KeyCode,
    createActionState, createActionInput, createSessionGate, SceneStack
} from 'cocosair';

const canvas = document.getElementById('GameCanvas'); // must exist before this import
const app = await createAirApp({ canvas });

const scene = new Scene('Main');
const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 1, 4));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.clearColor = new Color(20, 26, 40, 255);

const gate = createSessionGate();
gate.activate(); // begin a session generation; further gates below honour it

const state = createActionState({
    actions: {
        fire: { sources: [{ backend: 'native', keyCode: KeyCode.KEY_A }] },
        move: {
            mode: 'axis',
            sources: [
                { backend: 'native', keyCode: KeyCode.KEY_W, value: 1 },
                { backend: 'native', keyCode: KeyCode.KEY_S, value: -1 }
            ]
        }
    }
});

const adapter = createActionInput({ state, backend: 'native', canvas, session: gate });
adapter.attach(); // installs listeners; does not steal focus

const stack = new SceneStack(scene, { canvas, maxCachedPages: 4 });
stack.push(() => new Node('Menu'), 'Menu');

let taps = 0;
input.on(Input.EventType.TOUCH_START, (event) => { taps += 1; /* event.touch is the changed contact */ });
systemEvent.on(SystemEvent.EventType.MOUSE_DOWN, (event) => { /* raw mouse, EventMouse */ });

class Driver extends Component {
    update() {
        for (const edge of state.consumeTick().transitions) {
            if (edge.action === 'fire' && edge.kind === 'press') {
                stack.push(() => new Node('Level'), 'Level', { transitionMs: 250 });
            }
        }
        camNode.setPosition(0, 1, 4 + state.axis('move'));
    }
}
camNode.addComponent(Driver);

app.run(scene); // async render loop: frames land on later ticks

function teardown() {
    input.off(Input.EventType.TOUCH_START);
    systemEvent.off(SystemEvent.EventType.MOUSE_DOWN);
    adapter.dispose(); // reset('dispose') + detach + unbind gate
    stack.dispose();
}
</script>
```

The `Input.EventType.*` and `SystemEvent.EventType.*` enums are the only legal event names; `EventMouse`, `EventTouch` and `EventKeyboard` carry no static event constants of their own (`src/cocos/input/input.ts:160`, `src/cocos/input/system-event.ts:72`, `src/cocos/input/types/event-enum.ts:277`).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp`, the app handle and its session scope that gate input admission.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `Node`/`Scene` structure and deferred `destroy()` that `SceneStack` pages rely on.
- [cocosair-camera](../cocosair-camera/SKILL.md) - the camera converting a screen point to a ray for a picked node.
- [cocosair-verification](../cocosair-verification/SKILL.md) - how to prove an input path in a real browser instead of asserting it.

The audio autoplay gesture-unlock, live session inspection and 2D UI widgets belong to the forward `../cocosair-audio-video/SKILL.md`, `../cocosair-agent-session/SKILL.md` and `../cocosair-ui-2d/SKILL.md` skills; they are referenced here in prose only.

## When to use what

- "React to a touch, key or mouse directly" -> `input.on(Input.EventType.X, handler)` for the unified feed and `systemEvent.on(SystemEvent.EventType.X, handler)` for the raw feed (`src/cocos/input/input.ts:160`, `src/cocos/input/system-event.ts:72`); the event classes are `EventTouch`/`EventKeyboard`/`EventMouse`, keys come from `KeyCode`.
- "Map held keys/pointers to named game actions" -> `createActionState` (pure reducer) plus `createActionInput` (one backend); query with `held`/`pressed`/`released`/`axis` and drain edges with `consumeTick` (`src/air/action-state.ts:124-172`).
- "Gate a paused or backgrounded app" -> `createSessionGate` and its `active`/`generation`; pass it as the adapter's `session` (`src/air/action-input.ts:69-100`).
- "Persistent-page push/pop with preserved state" -> `SceneStack` over one long-lived `Scene` (`src/air/scene-stack.ts:47-188`); use `app.run()` replacement instead for a full scene swap (owned by the application skill).

## Contracts

- Event enums, not class constants: `Input.EventType` is the `InputEventType` enum (`src/cocos/input/input.ts:160`; values at `src/cocos/input/types/event-enum.ts:277`, e.g. `TOUCH_START` :285, `MOUSE_DOWN` :321, `KEY_DOWN` :367) and `SystemEvent.EventType` is `SystemEventType` (`src/cocos/input/system-event.ts:72`). PAL converts mouse to touch, so `Input.EventType.TOUCH_START` also fires for a primary mouse press (`src/cocos/input/input.ts:96`). `EventMouse` has no `MOUSE_DOWN` static; use the enum.
- Action identity is per `(action, source)`: a source is `{ backend, physicalCode? , keyCode?, pointerId? }` with at least one identity field, and `airActionSourceKey` namespaces backends so a native `keyCode` and a dom `physicalCode` never merge (`src/air/action-state.ts:51-59`, `:195-200`, `:203-229`). Multiple sources on one action are OR-ed: releasing one leaves the others held (`src/air/action-state.ts:151-152`).
- `press` is idempotent per `(action, source)`: re-pressing an already-active source (key repeat) returns `false` and does not re-arm the press edge (`src/air/action-state.ts:369-385`, doc `:143-150`). `consumeTick` drains the ordered, non-deduped edge queue and returns empty (no replay) when nothing arrived (`src/air/action-state.ts:420-444`).
- `reset(reason)` has exactly seven reasons - `blur | hidden | pause | restart | deactivate | dispose | manual` (`src/air/action-state.ts:92`); it clears active sources and the pending queue with no synthetic edges and never removes listeners; detaching is the adapter's job (`src/air/action-state.ts:165-171`, impl `:446-453`; `src/air/action-input.ts:24-26`). `lastReset()` reports the reason plus a monotonic count (`src/air/action-state.ts:94-100`).
- The adapter backend option is only `native | dom` (`src/air/action-input.ts:107`); `manual` exists as a source backend for explicit `press`/`release` on the reducer (`src/air/action-state.ts:41`) but is not an adapter backend. `dom` REQUIRES an explicit `canvas` and throws `AIR_E_INVALID_SOURCE` otherwise; it never auto-discovers `#GameCanvas` (`src/air/action-input.ts:156-158`, doc `:110-113`). `native` uses `canvas` only as the `requestFocus` target.
- Focus and editable targets: `attach` never calls `focus()`, so Start/Resume needs an explicit `adapter.requestFocus()` (`src/air/action-input.ts:22`, `:131`, `:395-399`); keydown is admitted unless the event target is `INPUT`/`TEXTAREA`/`SELECT` or contenteditable, while an already-held keyup still releases (`src/air/action-input.ts:139-146`, `:208-215`, `:239-248`). `dom` listens on `window` in capture phase so it runs before any canvas block (`src/air/action-input.ts:294-295`).
- `createSessionGate()` takes no arguments and returns `{ generation, active, deactivateReason, activate(), deactivate(reason?), onChange?, offChange? }`; `activate` increments the generation, `deactivate` rejects further presses (`src/air/action-input.ts:51-100`, `:178`). The adapter subscribes to `onChange` and resets on transition - `deactivate -> reset('deactivate')`, new generation `-> reset('restart')` (`src/air/action-input.ts:325-330`).
- `SceneStack` defaults `maxCachedPages` to 4 and reads the block canvas from `document.getElementById('GameCanvas')` when none is passed (`src/air/scene-stack.ts:61-63`). During `transitionMs` both the new and the previous page stay active (dual-page window) and a capture-phase listener calls `stopImmediatePropagation()` on the canvas before PAL handlers, counting each block (`src/air/scene-stack.ts:83-101`, `:160-169`). LRU eviction removes the handle from the navigation stack before destroying the node, so an evicted page is never returned to by `pop()` (`src/air/scene-stack.ts:145-152`).
- Audio autoplay unlock is an engine/browser policy concern: `AudioService` surfaces an un-unlocked play as a non-advancing `currentTime` rather than throwing (`src/air/audio-service.ts:11-12`), and a `systemEvent`/`input` gesture is the usual unlock trigger; the audio-video skill owns that flow. All symbols above - `input`, `systemEvent`, `EventTouch`, `EventKeyboard`, `EventMouse`, `KeyCode`, `Input`, `SystemEvent`, `SystemEventType`, `createActionState`, `createActionInput`, `createSessionGate`, `SceneStack`, `AudioService` - are on the bundle export block (`build/cocosair.module.js`, currently :161574).

## Common Mistakes

### [HIGH] Using the dom backend and expecting the canvas to be found for you

Wrong:
```js
const adapter = createActionInput({ state, backend: 'dom' }); // AIR_E_INVALID_SOURCE
adapter.attach();
```

Correct:
```js
const canvas = document.getElementById('GameCanvas');
const adapter = createActionInput({ state, backend: 'dom', canvas });
adapter.attach();
```

`dom` binds pointer events to that canvas, so the factory throws `AIR_E_INVALID_SOURCE` when it is missing (`src/air/action-input.ts:156-158`); unlike `SceneStack` it does not fall back to `document.getElementById('GameCanvas')`, and it never auto-discovers (`src/air/action-input.ts:110-113`).

### [HIGH] Assuming reset() unhooked the event listeners

Wrong:
```js
state.reset('pause'); // believes no listener is left attached
```

Correct:
```js
state.reset('pause'); // clears held state only
adapter.detach();     // or adapter.dispose() to also unbind the gate
```

`reset(reason)` clears active sources and the pending queue but keeps bindings and touches no listener (`src/air/action-state.ts:165-171`, impl `:446-453`); detaching is the adapter's separate concern (`src/air/action-input.ts:24-26`, `:129-130`).

### [MEDIUM] Expecting keys to keep firing while an input element has focus

Wrong:
```js
// user is typing in a text field, code still assumes 'fire' presses
```

Correct:
```js
// editable keydown is filtered out; a re-focus back onto the canvas is explicit
adapter.requestFocus(); // Start/Resume path only; attach never steals focus
```

An admitted keydown is skipped when the target is `INPUT`/`TEXTAREA`/`SELECT` or contenteditable (`src/air/action-input.ts:139-146`, `:208-215`), and `attach` does not grab focus, so without a `requestFocus()` a canvas-bound native feed can miss presses (`src/air/action-input.ts:22`, `:395-399`).

## References

- `references/native-input.md` - the `input` and `systemEvent` globals, the `Input.EventType` and `SystemEvent.EventType` enums, the `EventTouch`/`EventKeyboard`/`EventMouse` payloads, `KeyCode`, and the mouse-to-touch conversion.
- `references/action-state.md` - the pure reducer surface: source identity and backends, OR semantics, idempotent press, `consumeTick` ordering, the seven reset reasons, axis clamping, and the `AIR_E_*` validation errors.
- `references/action-input.md` - the `native` and `dom` adapters, the explicit-canvas requirement, focus and editable-target rules, the session gate wiring, and `attach`/`detach`/`reset`/`dispose` lifecycle.
- `references/scene-stack.md` - persistent-page navigation: dual-page transition, capture-phase input block, LRU eviction, and disposal.

## Canonical docs

- `docs/manual/input-and-events.md` - the engine-level event surface, listener registration and event payloads.
- `docs/manual/input-action-state.md` - the action reducer and adapter contracts, backend choice and validation errors.
- `docs/manual/test-input-injection.md` - injecting native and dom input for tests and headless verification.
