Derived from `src/cocos/tween/tween.ts`, `src/cocos/tween/tween-system.ts`, `src/cocos/tween/export-api.ts`, `src/cocos/tween/index.ts`, `src/exports/tween.ts`, `build/cocosair.module.js`, `docs/manual/animation-system.md`, `docs/reference/api-scenario-gap-matrix.md`, `examples/tween-basic/src/tween-contract.ts` (as of 2026-10-10).

## Entry points

`export function tween<T>(target?)` (`src/cocos/tween/tween.ts:922`) returns `new Tween<T>(target)` (`:923`). `tweenUtil<T>(target?)` (`:934`) is the deprecated twin: it emits `warnID(16396)` (`:935`) and returns the same `new Tween<T>(target)` (`:936`). The public face is re-exported through `src/cocos/tween/index.ts:27-33` (`./tween`, `./export-api`, plus named `TweenSystem`, `TweenAction` and the `tweenProgress` namespace) and surfaced to the package by `src/exports/tween.ts:26` (`export * from '../cocos/tween/index'`). In the built bundle `tween`, `Tween` and `TweenSystem` all appear in the single export block (`build/cocosair.module.js`, currently `:161574`).

The constructor stores the target: `this._target = target === undefined ? null : target` (`src/cocos/tween/tween.ts:111-113`). Every chain method pushes onto `_actions` and returns `this`; nothing runs until `start()`.

## The chain methods

| Method                                                 | What it pushes                                                                             | Line                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| `to(duration, props, opts?)`                           | a `TweenAction` with `relative = false` (absolute interpolation to props)                  | `src/cocos/tween/tween.ts:475-481` |
| `by(duration, props, opts?)`                           | a `TweenAction` with `relative = true` (interpolate the delta)                             | `:496-502`                         |
| `set(props)`                                           | a `SetAction` (instant assignment, no interpolation)                                       | `:540-544`                         |
| `delay(duration)`                                      | a `delayTime(duration)` action                                                             | `:555-559`                         |
| `call(cb, this?, data?)`                               | a `callFunc(cb, this, data)` zero-duration callback                                        | `:572-576`                         |
| `update(duration, cb, ...args)`                        | an `ActionCustomUpdate` of fixed duration                                                  | `:512-516`                         |
| `updateUntil(cb, ...args)`                             | an `ActionUnknownDuration`; the callback returning true ends it                            | `:525-529`                         |
| `sequence(...tweens)`                                  | a wrapped `Sequence` of the argument tweens                                                | `:587-591`                         |
| `parallel(...tweens)`                                  | a wrapped `Spawn` of the argument tweens                                                   | `:602-606`                         |
| `repeat(n, embedTween?)`                               | `repeat(action, n)`; `n === Infinity` forwards to `repeatForever`                          | `:656-673`                         |
| `repeatForever(embedTween?)`                           | `repeat(action, MAX_SAFE_INTEGER)` when other actions remain, else `repeatForever(action)` | `:685-703`                         |
| `reverseTime(embedTween?)`                             | `reverseTime(action)` wrapping the popped previous action or the embedded tween union      | `:715-731`                         |
| `union(fromId?)`                                       | collapses prior actions into one `Sequence` in place                                       | `:434-460`                         |
| `then(other)`                                          | inserts another tween's union as the rear action                                           | `:166-173`                         |
| `timeScale(scale)`                                     | sets `_timeScale` and, if started, `_finalAction.setSpeed(scale)`                          | `:614-620`                         |
| `tag(n)` / `id(n)`                                     | set the tween tag / the previous action's id                                               | `:139-142`, `:150-155`             |
| `hide()` / `show()` / `removeSelf()` / `destroySelf()` | node-target-only visibility and removal actions                                            | `:740-795`                         |

Props are given as a plain object of property name to target value (`{ position: new Vec3(...) }`, `{ scale: new Vec3(...) }`); there is no string-path form (`docs/manual/animation-system.md:34-35`). `opts.easing` accepts a `TweenEasing` string or a `(k: number) => number` lambda, and `opts.progress` an interpolation function; `onStart`/`onUpdate`/`onComplete` are the callbacks (`src/cocos/tween/export-api.ts:51-92`). The `TweenEasing` string union is the 45-name easing table at `src/cocos/tween/export-api.ts:32-43`.

`duration` is a getter that returns `_finalAction.getDuration()` and is only valid after `start()`, otherwise `0` (`src/cocos/tween/tween.ts:639-644`); it is the design-time duration and is not scaled by `timeScale`. `getTimeScale()` returns `_timeScale` (`:627-629`).

## Lifecycle

`start(time = 0)` (`src/cocos/tween/tween.ts:329-349`) warns and returns if there is no target (`:330-333`), removes any prior `_finalAction` (`:334-336`), unions the chain into `_finalAction` (`:337-338`), then sets tag, speed, start time, clears the paused flag and calls `getActionManager().addAction(final, target, false, this._isBindNodeState)` (`:340-344`). `stop()` stops and removes `_finalAction` and nulls it (`:358-366`). `pause()` / `resume()` set the paused flag on `_finalAction`, warning if it is absent (`:373-394`). `running` is a getter over `getActionManager().isActionRunning(_finalAction)`, false when not started (`:400-405`).

`clone(target?)` unions the current chain and inserts it into a fresh tween on the given or original target, carrying `_timeScale` (`:416-423`). `reverse()` has three overloads (`:182-231`): bare `reverse()` returns a NEW reversed tween via `reverseTween()` (`:233-243`), `reverse(id)` reverses one action by id in this tween, and `reverse(otherTween, id?)` reverses an action found in another tween; the shared helper is the static `reverseAction` (`:245-264`) and `findAction` recurses into `Sequence`/`Spawn` (`:266-277`).

## Target-bound statics

`Tween.getRunningCount(target)` returns the ActionManager's running-action count for that target (`src/cocos/tween/tween.ts:804-806`). `Tween.stopAll()` removes every action (`:814-816`); `stopAllByTag(tag, target?)` (`:823-825`); `stopAllByTarget(target?)` (`:832-834`); `pauseAllByTarget(target)` (`:841-843`) and `resumeAllByTarget(target)` (`:850-852`) drive the ActionManager's target pause/resume. All of these operate through `getActionManager()`, the same manager `start()` registers with.

## Node-state binding

`_isBindNodeState` defaults to `true` for Creator 2.x compatibility (`src/cocos/tween/tween.ts:109`). With a `Node` target this means: node deactivated -> the tween auto-pauses; node reactivated -> auto-resumes; node destroyed -> the tween is auto-removed (`:115-126` doc, `bindNodeState(isBindNodeState)` at `:127-130`). The flag is passed to `addAction` at `start()` (`:344`), so it only takes effect for a started tween. This is why a lifecycle leak does not need a manual `stop()`; call `bindNodeState(false)` only when you want the tween to survive node deactivation.

## TweenSystem and the ActionManager

`class TweenSystem extends System` (`src/cocos/tween/tween-system.ts:36`) has `static readonly ID = 'TWEEN'` (`:43`), a `static readonly instance` (`:51`), and a getter `ActionManager` over the private `actionMgr = new ActionManager()` (`:59-63`). Its `update(dt)` runs `this.actionMgr.update(dt)` (skipped in editor-not-in-preview unless `_executeInEditMode`) (`:76-80`). The system is created and registered on the director INIT event at `SystemPriority.MEDIUM` (`:83-87`), and the doc states its update runs after all component updates (`:69-75`). User code never touches rAF; the director drives this system, which drives every running tween.

## The reverseTime embedded-sequence defect (GAP-T1)

`reverseTime(embedTween?)` (`src/cocos/tween/tween.ts:715-731`) takes the embedded tween's union when an argument is given (`:719-720`), otherwise pops the previous action (`:722`), and wraps it in `reverseTime(action)` only when that action is an `ActionInterval`, else it warns `16395` (`:725-729`). The bare path is browser-verified. The embedded branch has an open end-point defect recorded as GAP-T1 (`docs/reference/api-scenario-gap-matrix.md:483-485`): wrapping a `by` relative-move with start x=3 and offset +2 lands on x=5 where x=3 is expected. The finding notes the bare `by(...).reverseTime()` path passed three-browser verification while the embedded-sequence branch did not, and that method-level `verified` covers only the former. The reproduction file the finding cites, `docs/evidence/coverage-wave1-reverse-time-diagnostic.json`, is not present on disk; the durable record is the gap-matrix entry plus `examples/tween-basic/src/tween-contract.ts`, which exercises pause/resume, sequence/parallel, clone isolation, repeat, reverse and node removal (`docs/manual/animation-system.md:489-491`).
