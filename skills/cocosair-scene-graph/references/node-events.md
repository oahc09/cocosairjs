Derived from src/cocos/scene-graph/node-event.ts, src/cocos/scene-graph/node-event-processor.ts, src/cocos/scene-graph/node.ts, src/cocos/game/director.ts, src/cocos/game/game.ts, src/pal/system-info/web/system-info.js, src/air/bootstrap.ts, examples/scene-switch-reentry (as of 2026-10-09)

## Node event API (src/cocos/scene-graph/node.ts)

| Member                                                           | Line        | Behavior                                                                                         |
| ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `on(type, callback, target?, useCapture = false): void`          | 1241        | Registers a bubbling listener (or capturing when `useCapture`); routes into `_eventProcessor.on` |
| `off(type, callback?, target?, useCapture = false): void`        | 1271        | Removes a matching listener; drops the auto-enabled event mask when none remain                  |
| `once(type, callback, target?, useCapture?)`                     | 1302        | One-shot listener                                                                                |
| `emit(type, arg0..arg4): void`                                   | 1323        | Fires the event with up to 5 arguments                                                           |
| `dispatchEvent(event)`                                           | 1334        | Dispatches an `Event` object through the processor                                               |
| `hasEventListener(type, callback?, target?)`                     | 1346        | Query                                                                                            |
| `targetOff(target): void`                                        | 1356        | Removes every listener bound to `target` on THIS node's processor                                |
| `pauseSystemEvents(recursive)` / `resumeSystemEvents(recursive)` | 2937 / 2952 | Toggles the node's event processor enabled state (`setEnabled`) for system (touch/mouse) events  |
| `static EventType = NodeEventType`                               | 1568        | `Node.EventType.TOUCH_START` is the same value as `NodeEventType.TOUCH_START`                    |

## NodeEventType string values (src/cocos/scene-graph/node-event.ts:29-308)

Values are string literals; `Node.EventType` aliases the same enum (node.ts:1568).

| Member                        | String                          | Line | Note                                                      |
| ----------------------------- | ------------------------------- | ---- | --------------------------------------------------------- |
| `TOUCH_START`                 | `'touch-start'`                 | 37   |                                                           |
| `TOUCH_MOVE`                  | `'touch-move'`                  | 46   |                                                           |
| `TOUCH_END`                   | `'touch-end'`                   | 55   |                                                           |
| `TOUCH_CANCEL`                | `'touch-cancel'`                | 64   |                                                           |
| `MOUSE_DOWN`                  | `'mouse-down'`                  | 73   |                                                           |
| `MOUSE_MOVE`                  | `'mouse-move'`                  | 82   |                                                           |
| `MOUSE_UP`                    | `'mouse-up'`                    | 91   |                                                           |
| `MOUSE_WHEEL`                 | `'mouse-wheel'`                 | 99   |                                                           |
| `MOUSE_ENTER`                 | `'mouse-enter'`                 | 108  |                                                           |
| `MOUSE_LEAVE`                 | `'mouse-leave'`                 | 117  |                                                           |
| `KEY_DOWN`                    | `'keydown'`                     | 124  | deprecated v3.3, use `SystemEvent.EventType.KEY_DOWN`     |
| `KEY_UP`                      | `'keyup'`                       | 131  | deprecated v3.3, use `SystemEvent.EventType.KEY_UP`       |
| `DEVICEMOTION`                | `'devicemotion'`                | 142  | deprecated v3.3, use `SystemEvent.EventType.DEVICEMOTION` |
| `TRANSFORM_CHANGED`           | `'transform-changed'`           | 159  | arg is a `TransformBit`                                   |
| `MOBILITY_CHANGED`            | `'mobility-changed'`            | 167  |                                                           |
| `SCENE_CHANGED_FOR_PERSISTS`  | `'scene-changed-for-persists'`  | 173  |                                                           |
| `SIZE_CHANGED`                | `'size-changed'`                | 185  | UI                                                        |
| `ANCHOR_CHANGED`              | `'anchor-changed'`              | 197  | UI                                                        |
| `COLOR_CHANGED`               | `'color-changed'`               | 209  | UI                                                        |
| `CHILD_ADDED`                 | `'child-added'`                 | 218  |                                                           |
| `CHILD_REMOVED`               | `'child-removed'`               | 227  |                                                           |
| `PARENT_CHANGED`              | `'parent-changed'`              | 233  |                                                           |
| `NODE_DESTROYED`              | `'node-destroyed'`              | 239  |                                                           |
| `LAYER_CHANGED`               | `'layer-changed'`               | 245  |                                                           |
| `SIBLING_ORDER_CHANGED`       | `'sibling-order-changed'`       | 252  |                                                           |
| `CHILDREN_ORDER_CHANGED`      | `'sibling-order-changed'`       | 259  | same string as SIBLING_ORDER_CHANGED                      |
| `ACTIVE_IN_HIERARCHY_CHANGED` | `'active-in-hierarchy-changed'` | 268  |                                                           |
| `COMPONENT_ADDED`             | `'component-added'`             | 276  |                                                           |
| `COMPONENT_REMOVED`           | `'component-removed'`           | 284  |                                                           |
| `LIGHT_PROBE_CHANGED`         | `'light-probe-changed'`         | 292  |                                                           |
| `LIGHT_PROBE_BAKING_CHANGED`  | `'light-probe-baking-changed'`  | 300  |                                                           |
| `ACTIVE_CHANGED`              | `'active-changed'`              | 308  |                                                           |

## Director events (src/cocos/game/director.ts)

The enum is named `DirectorEvent` (director.ts:47), not `DirectorEventType`. Each value is exposed as a `Director.EVENT_*` static alias (director.ts:182-289).

| `DirectorEvent`        | String                            | Alias                        |
| ---------------------- | --------------------------------- | ---------------------------- |
| `INIT`                 | `'director_init'`                 | `EVENT_INIT`                 |
| `RESET`                | `'director_reset'`                | `EVENT_RESET`                |
| `BEFORE_SCENE_LOADING` | `'director_before_scene_loading'` | `EVENT_BEFORE_SCENE_LOADING` |
| `BEFORE_SCENE_LAUNCH`  | `'director_before_scene_launch'`  | `EVENT_BEFORE_SCENE_LAUNCH`  |
| `AFTER_SCENE_LAUNCH`   | `'director_after_scene_launch'`   | `EVENT_AFTER_SCENE_LAUNCH`   |
| `BEFORE_UPDATE`        | `'director_before_update'`        | `EVENT_BEFORE_UPDATE`        |
| `AFTER_UPDATE`         | `'director_after_update'`         | `EVENT_AFTER_UPDATE`         |
| `BEFORE_DRAW`          | `'director_before_draw'`          | `EVENT_BEFORE_DRAW`          |
| `AFTER_DRAW`           | `'director_after_draw'`           | `EVENT_AFTER_DRAW`           |
| `BEFORE_COMMIT`        | `'director_before_commit'`        | `EVENT_BEFORE_COMMIT`        |
| `BEFORE_RENDER`        | `'director_before_render'`        | `EVENT_BEFORE_RENDER`        |
| `AFTER_RENDER`         | `'director_after_render'`         | `EVENT_AFTER_RENDER`         |
| `BEFORE_PHYSICS`       | `'director_before_physics'`       | `EVENT_BEFORE_PHYSICS`       |
| `AFTER_PHYSICS`        | `'director_after_physics'`        | `EVENT_AFTER_PHYSICS`        |
| `BEGIN_FRAME`          | `'director_begin_frame'`          | `EVENT_BEGIN_FRAME`          |
| `END_FRAME`            | `'director_end_frame'`            | `EVENT_END_FRAME`            |

Frame phase order in `tick`: `startPhase` (director.ts:798) -> `updatePhase` (800) -> `lateUpdatePhase` (806).

## Game events (src/cocos/game/game.ts)

These are `Game.EVENT_*` static readonly string constants (no `GameEventType` enum in this source); `game.ts` declares eighteen of them in total.

| Alias                            | String                       | Line | When emitted                                                                                                                                                                                                                                                                    |
| -------------------------------- | ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVENT_HIDE`                     | `'game_on_hide'`             | 206  | page hidden; `game.ts:1105` from the Web `systemInfo` visibility handler (`src/pal/system-info/web/system-info.js:278`)                                                                                                                                                         |
| `EVENT_SHOW`                     | `'game_on_show'`             | 216  | page visible again; `game.ts:1110`, `system-info.js:285`                                                                                                                                                                                                                        |
| `EVENT_LOW_MEMORY`               | `'game_on_low_memory'`       | 224  | no emitter anywhere in `src/`; a native/minigame parity constant on Web                                                                                                                                                                                                         |
| `EVENT_GAME_INITED`              | `'game_inited'`              | 230  | end of `Game.init` (`game.ts:913`)                                                                                                                                                                                                                                              |
| `EVENT_ENGINE_INITED`            | `'engine_inited'`            | 240  | inside `Game.init` (`game.ts:868`)                                                                                                                                                                                                                                              |
| `EVENT_RENDERER_INITED`          | `'renderer_inited'`          | 246  | when the render pipeline is set (`game.ts:1171`)                                                                                                                                                                                                                                |
| `EVENT_PRE_BASE_INIT`            | `'pre_base_init'`            | 252  | start of `Game.init` (`game.ts:740`)                                                                                                                                                                                                                                            |
| `EVENT_POST_BASE_INIT`           | `'post_base_init'`           | 257  | `Game.init` (`:761`)                                                                                                                                                                                                                                                            |
| `EVENT_PRE_INFRASTRUCTURE_INIT`  | `'pre_infrastructure_init'`  | 262  | `Game.init` (`:767`)                                                                                                                                                                                                                                                            |
| `EVENT_POST_INFRASTRUCTURE_INIT` | `'post_infrastructure_init'` | 267  | `Game.init` (`:816`)                                                                                                                                                                                                                                                            |
| `EVENT_PRE_SUBSYSTEM_INIT`       | `'pre_subsystem_init'`       | 272  | `Game.init` (`:822`)                                                                                                                                                                                                                                                            |
| `EVENT_POST_SUBSYSTEM_INIT`      | `'post_subsystem_init'`      | 277  | `Game.init` (`:863`)                                                                                                                                                                                                                                                            |
| `EVENT_PRE_PROJECT_INIT`         | `'pre_project_init'`         | 283  | `Game.init` (`:874`)                                                                                                                                                                                                                                                            |
| `EVENT_POST_PROJECT_INIT`        | `'post_project_init'`        | 289  | `Game.init` (`:907`)                                                                                                                                                                                                                                                            |
| `EVENT_RESTART`                  | `'game_on_restart'`          | 295  | `game.restart()` chain (`game.ts:640`)                                                                                                                                                                                                                                          |
| `EVENT_PAUSE`                    | `'game_on_pause'`            | 308  | `game.pause()` (`game.ts:595`)                                                                                                                                                                                                                                                  |
| `EVENT_RESUME`                   | `'game_on_resume'`           | 314  | `game.resume()` (`game.ts:608`)                                                                                                                                                                                                                                                 |
| `EVENT_CLOSE`                    | `'game_on_close'`            | 320  | `game.ts:1115` on `systemInfo`'s 'close' signal (bound at `:1101`); the Web PAL emits it only from an explicit `systemInfo.close()` call (`system-info.js:367-368`), not from browser navigation, and the only in-repo trigger of that call is `game.end()` (`game.ts:648-650`) |

The eight `*_INIT` phase constants (lines 252-289) are none of them deprecated; they fire exactly once inside `Game.init`'s promise chain (`game.ts:734-907`). In AIR that chain is driven by `createAirApp` (declared at `src/air/bootstrap.ts:106`), which awaits `game.init` inside it (`src/air/bootstrap.ts:149`), so an application listener sees these only if it registers on the `game` singleton before calling `createAirApp`; after the await they have already fired. AIR's own bootstrap relies on two of them: `game.once(Game.EVENT_PRE_SUBSYSTEM_INIT, selectBackend)` and `game.once(Game.EVENT_POST_SUBSYSTEM_INIT, registerBuiltinAirAssets)` (`src/air/bootstrap.ts:142, :145`).

## What destroy() releases and what it does not

`_eventProcessor.destroy()` (node-event-processor.ts:182-197) clears only `capturingTarget` and `bubblingTarget` of THIS node (`invoker.clear()`), unregisters the node as a pointer-event processor from the global invoker, and dispatches a touch-cancel if a touch was in flight. Therefore:

- RELEASED by destroy (deferred to end of frame): listeners added via `node.on`/`node.once` on that same node.
- NOT released: `input.on(Input.EventType....)` (global input system), DOM `canvas.addEventListener`, `director.on(...)`/`game.on(...)`, and `otherNode.on(type, cb, this)` where `this` is only the target - those live on another node's processor or an external emitter.
- `node.targetOff(component)` removes that component's listeners from THAT node; it does not reach external emitters.

Reference contract: `examples/scene-switch-reentry/src/components/Ticker.ts` pairs `onEnable` `input.on(Input.EventType.TOUCH_START, this.onClick, this)` (line 39) with `onDisable` `input.off(...)` (line 52); the `no-residual-listeners` assertion in `main.ts:91` fails if the off is missing after a scene switch.
