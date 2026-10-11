Derived from `src/air/action-state.ts` (2026-10-10).

# Action state: the pure reducer

`createActionState(options)` builds a decoupled state machine that maps physical input sources to named game actions. It subscribes to nothing; the engine import there is `import type { KeyCode }` only, so the module loads without a runtime (`src/air/action-state.ts:23`, `:237-243`). Pair it with `createActionInput` for event wiring.

## Declaration

```js
const state = createActionState({
    actions: {
        fire: { sources: [{ backend: 'native', keyCode: KeyCode.KEY_A }] },
        move: {
            mode: 'axis',
            sources: [
                { backend: 'native', keyCode: KeyCode.KEY_W, value: 1 },
                { backend: 'native', keyCode: KeyCode.KEY_S, value: -1 },
            ],
        },
    },
});
```

At least one action is required, else `AIR_E_UNKNOWN_ACTION` (`src/air/action-state.ts:244-247`). A `mode` is `button` (default) or `axis` (`src/air/action-state.ts:61-62`, `:254-256`).

## Source identity

An `AirActionSource` is `{ backend, physicalCode?, keyCode?, pointerId? }` (`src/air/action-state.ts:51-59`). `backend` is one of `native | dom | manual` (`src/air/action-state.ts:41`); `manual` is for HUD buttons that call `press`/`release` explicitly. `airActionSourceKey` joins `backend|physicalCode|keyCode|pointerId` so a native `keyCode` and a dom `physicalCode` for the same physical key are distinct sources and never merge (`src/air/action-state.ts:195-200`). A source needs at least one identity field or `assertValidSource` throws `AIR_E_INVALID_SOURCE` (`src/air/action-state.ts:203-229`).

A `pointerId: '*'` entry is a declaration-time pointer pattern that binds any pointer on that backend; it is not a runtime source and throws if passed as one (`src/air/action-state.ts:78-81`, `:213-216`, `:266-274`).

## Queries

| Method                                 | Meaning                                            | Source                                                           |
| -------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `held(action)`                         | any source active                                  | `src/air/action-state.ts:130`, impl `:321-324`                   |
| `pressed(action)` / `released(action)` | edge seen in the last consumed tick                | `src/air/action-state.ts:132-134`, impl `:326-334`               |
| `axis(action)`                         | clamped sum of active source values; 0 for buttons | `src/air/action-state.ts:135-136`, impl `:336-340`, clamp `:299` |
| `heldSources(action)`                  | frozen copies of active sources                    | `src/air/action-state.ts:137-138`                                |
| `mode(action)`                         | `button`/`axis`; unknown throws                    | `src/air/action-state.ts:127-128`                                |
| `lastReset()`                          | most recent reset record or null                   | `src/air/action-state.ts:139-140`, `:94-100`                     |
| `actionsFor(source)`                   | actions bound to the source, patterns included     | `src/air/action-state.ts:141-142`, `:351-367`                    |

Unknown action names throw `AIR_E_UNKNOWN_ACTION` from every query (`src/air/action-state.ts:305-309`).

## Mutations

- `press(action, source, value?)` is idempotent per `(action, source)`: an already-active source returns `false` and does not re-arm the edge, so OS key repeat is a no-op (`src/air/action-state.ts:143-150`, impl `:369-385`, `:375`). Only an inactive-to-active transition queues a `press` edge, and only for buttons (`:383`).
- `release(action, source)` deactivates a single source; other sources of the same action stay held, since sources are OR-ed (`src/air/action-state.ts:151-152`, impl `:387-396`).
- `setAxis(action, source, value)` writes analog values directly; `0` releases the source and out-of-range values are clamped to `[-1, 1]`; non-finite throws `AIR_E_INVALID_VALUE` and non-axis actions throw (`src/air/action-state.ts:153-154`, impl `:398-418`, `:231-235`).
- `consumeTick()` drains the pending queue in order - `press -> release -> press` survives as three transitions - and returns deduped `pressed[]`/`released[]` convenience flags plus refreshed `pressed()`/`released()` state; a repeat call with no new events returns empty (no replay), and quick press+release across a 0-length gap survives to the next call (`src/air/action-state.ts:155-164`, impl `:420-444`).

## Reset

`reset(reason)` has exactly seven reasons: `blur | hidden | pause | restart | deactivate | dispose | manual` (`src/air/action-state.ts:92`). It clears every action's active map and the pending queue with no synthetic edges, refreshes the pressed/released sets to empty, and bumps a monotonic reset count recorded in `lastReset()` (`src/air/action-state.ts:446-453`). Critically, reset never removes event listeners and never drops bindings; detaching is the adapter's responsibility (`src/air/action-state.ts:165-171`).

## Errors

`AirActionError` carries a stable `code` (`src/air/action-state.ts:26-38`):

| Code                   | Thrown when                                                                     | Source                                                    |
| ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `AIR_E_INVALID_SOURCE` | bad backend, missing identity, `'*'` pattern used at runtime, duplicate binding | `src/air/action-state.ts:203-229`, `:278-280`             |
| `AIR_E_INVALID_VALUE`  | non-finite press/setAxis/binding value                                          | `src/air/action-state.ts:231-235`                         |
| `AIR_E_UNKNOWN_ACTION` | undeclared action name, empty actions, bad mode, setAxis on a button            | `src/air/action-state.ts:305-309`, `:244-256`, `:402-404` |
| `AIR_E_DISPOSED`       | terminal adapter state (raised by `createActionInput`, not here)                | `src/air/action-input.ts:341-345`                         |

All outward reads (`heldSources`, transitions, tick, reset record, source copies) are frozen, so a snapshot cannot mutate internal identity (`src/air/action-state.ts:310-311`, `:429`, `:439-443`, `:452`).
