Derived from the cocosair-input-action skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
