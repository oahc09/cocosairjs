---
name: cocosair-animation-tween
description: Drives the Cocos AIR animation and tween surface - the code-first tween(target) chain (to/by/set/delay/call/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale plus start/stop/pause/resume and the target-bound statics), TweenSystem and its ActionManager, the native Animation component (play/stop/pause/resume/getState/createState/addClip/crossFade, executionOrder 99, playOnLoad), AnimationState wrapMode whose setter resets time and repeatCount, code-first AnimationClip construction, the AnimationClip.WrapMode static enum, the animation namespace that is the only route to VectorTrack and TrackPath, createStepClock single-clock stepping with its dual-clock guard, and the unpublished marionette and pose-graph state. Use when a tween will not reverse, when a clip plays once instead of looping, when track classes fail to import by name, when deterministic frame stepping is needed for evidence, or when pose-graph animation is assumed available.
---

# Cocos AIR animation and tween contracts

Move things over time two ways: the code-first `tween(target)` chain (zero assets, the shortest path) and the native `Animation` component driving an `AnimationClip` you can build entirely in code. Both are stepped by the director, never by your own `requestAnimationFrame`. For deterministic evidence there is a third, test-only driver, `createStepClock`, that pauses the real clock and advances one frame at a time.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Vec3, Color, Component,
         tween, Animation, AnimationClip, animation, createStepClock } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('anim');
const camNode = new Node('Main Camera'); scene.addChild(camNode);
camNode.setPosition(new Vec3(2.4, 3.0, 7.4)); camNode.lookAt(new Vec3(0, 1.3, 0));
const camera = camNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(18, 22, 30, 255);

const node = new Node('Dancer'); scene.addChild(node); node.setPosition(new Vec3(0.6, 1.0, 0));

// 1) code-first tween: one chain == one sequence; call is zero-duration, to interpolates
tween(node)
    .to(1.2, { position: new Vec3(2.2, 1.0, 0) })   // props are a plain object; no string-path form
    .to(0.8, { position: new Vec3(2.2, 2.2, 0) })
    .repeatForever()
    .start();                                        // start() registers the union with the ActionManager

// 2) code-first clip: track classes live ONLY under the `animation` namespace
const clip = new AnimationClip();
clip.name = 'orbit'; clip.duration = 2.0;
clip.wrapMode = AnimationClip.WrapMode.Loop;         // WrapMode is a static on AnimationClip
const track = new animation.VectorTrack();
track.path = new animation.TrackPath().toProperty('position');
track.channels()[0].curve.assignSorted([[0, 0], [1, 0.9], [2, 0]]);
clip.addTrack(track);
const anim = node.addComponent(Animation);
anim.defaultClip = clip;
class Starter extends Component {                    // play() before app.run gets reset by activation
    start() { anim.play(clip.name); }
}
node.addComponent(Starter);

app.run(scene);

// 3) deterministic stepping for evidence: pause the real clock, then step one frame at a time
const clock = createStepClock();                     // frameRate 60, stepTimeoutMs 2000 by default
clock.begin();                                       // game.pause(): stops rAF, render, business clock, audio
for (let i = 0; i < 90; i++) { await clock.step(1 / 60); }   // throws if the real clock is running
clock.end();                                         // game.resume()
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `Node` activation, `active`, deferred `destroy()` and `NODE_DESTROYED`, which is what tween node-state binding hooks into.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp`, `app.run(scene)`, `game.pause()`/`game.resume()` and the director pacer that `createStepClock` freezes.
- [cocosair-math](../cocosair-math/SKILL.md) - `Vec3`, `Quat`, `Color` and the value types tween props and track channels interpolate.
- [cocosair-gltf](../cocosair-gltf/SKILL.md) - `GLTFInstance.setAnimationLoop` reconfigures the native `AnimationState.wrapMode` this skill documents; glTF clips default to `WrapMode.Normal`.
- [cocosair-skinning-morph](../cocosair-skinning-morph/SKILL.md) - `SkeletalAnimation`, joint paths and bind pose; skeletal clips play through the same `Animation` component.
- [cocosair-performance](../cocosair-performance/SKILL.md) - cost of mass tween/animation, the ActionManager update, and render-on-demand versus a resident loop.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the gates and collectors behind every browser claim quoted below, including the step-clock probe and `examples-verified.json`.

## When to use what

- "move/scale/rotate something over time, no assets" -> `tween(target).to(...).start()`; the chain is a sequence and `repeatForever()` loops the union (`references/tween-ops.md`).
- "run two motions at once on one target" -> just start two tweens on the same target; they time independently. `parallel(...)` is only for packing a parallel group into a larger sequence.
- "reusable keyed animation, or a glTF clip" -> `Animation` component + `AnimationClip`; build the clip in code with `animation.VectorTrack` and `animation.TrackPath` (`references/animation-clip.md`).
- "loop a clip" -> set `clip.wrapMode = AnimationClip.WrapMode.Loop` before play, or set `state.wrapMode` (which resets time and repeatCount) (`references/animation-clip.md`).
- "per-frame game logic" -> `Component.update(dt)` / `lateUpdate(dt)` / `this.schedule(cb, interval)`; multiply by `dt`, never assume a fixed frame rate (`docs/manual/how-to-update-things.md`).
- "deterministic frames for a test or evidence capture" -> `createStepClock()`; `begin()` then `await step(dt)` then `end()`, and never run it while the real pacer is live (`references/step-clock.md`).
- "state-machine / pose-graph animation" -> not published; `marionette` and `procedural-animation` are out of the default feature set (`references/animation-clip.md`).

## Contracts

- Two animation routes, one clock. `tween(target)` (`src/cocos/tween/tween.ts:922`) returns a `Tween` whose chain methods each push an action onto `_actions` and return `this`; `start()` (`:329`) unions them into one `_finalAction` and registers it with the ActionManager. The `Animation` component (`src/cocos/animation/animation-component.ts:52`) is `@executionOrder(99)` (`:49`) and delegates `play`/`stop`/`pause`/`resume`/`crossFade` to an internal cross-fade controller. Both are advanced by `TweenSystem`/the director, not by user rAF (`src/cocos/tween/tween-system.ts:76-87`).
- `play()` returns `void`, not a state. `Animation.play(name?)` (`src/cocos/animation/animation-component.ts:209`) early-returns when there is no name and no `defaultClip` (`:212-215`), otherwise calls `crossFade(name, 0)` (`:218`). To get the live state use `getState(name)`, which is declared to return `AnimationState` but actually returns `null` for a missing name (`:275-281`) - the declared type omits `| null`.
- `playOnLoad` is false by default and plays in `start()`, not `onLoad()`. `playOnLoad = false` (`src/cocos/animation/animation-component.ts:133`); when true, `start()` cross-fades the default clip (`:179-183`). Calling `play()` yourself before `app.run(scene)` is reset by the activation flow, so play from a component `start()` (`docs/manual/animation-system.md:78`).
- Setting `wrapMode` resets playback. The `AnimationState.wrapMode` setter (`src/cocos/animation/animation-state.ts:119`) assigns `this.time = 0` (`:123`) and sets `repeatCount` to `Infinity` for a Loop mask or `1` otherwise (`:125-129`). Configure wrap before first play or when you intend to restart; never set it per frame. `glTF` clips default to `WrapMode.Normal` and `GLTFInstance.setAnimationLoop` mutates this same setter (`docs/manual/animation-system.md:83-87`).
- `WrapMode` is a numeric bitmask enum reachable only as `AnimationClip.WrapMode`. `AnimationClip.WrapMode` is a static alias of the enum (`src/cocos/animation/animation-clip.ts:104`); the enum itself (`src/cocos/animation/types.ts:30-67`) is `Normal=1`, `Loop=2`, `ShouldWrap=4`, `Clamp=8`, `PingPong=22`, `Reverse=36`, plus `LoopReverse`/`PingPongReverse`. There is no top-level `WrapMode` export.
- Track classes are namespace-only. `VectorTrack`, `QuatTrack`, `RealTrack`, `ColorTrack`, `SizeTrack`, `ObjectTrack`, `Track` and `TrackPath` are exported from `src/cocos/animation/animation.ts:35-41` into the frozen `animation` namespace object (`build/cocosair.module.js`, currently `:57866-57889`), and the single runtime `export { ... }` block (`build/cocosair.module.js`, currently `:161574`) contains `animation` but none of those class names. Import them as `animation.VectorTrack` / `animation.TrackPath`; a bare `import { VectorTrack }` fails at compile and run time.
- A clip is code-first constructible. `new AnimationClip()` (`src/cocos/animation/animation-clip.ts:158`) with `name`, `duration`, `wrapMode`, then `addTrack(track)` (`:310`, returns the new index); `TrackPath.toProperty(name)` (`src/cocos/animation/tracks/track.ts:76`) builds the property path, and `toHierarchy`/`toComponent`/`toElement` (`:98`/`:109`/`:87`) address nested targets. `tracksCount` (`:180`), `getTrack` (`:298`), `removeTrack` (`:323`) and `clearTracks` (`:333`) manage the track list.
- Tween node-state binding is on by default. `_isBindNodeState = true` (`src/cocos/tween/tween.ts:109`); with a `Node` target, deactivating the node auto-pauses, reactivating auto-resumes, and destroying auto-removes the tween, so you do not need a manual `stop()` for lifecycle leaks. Opt out with `bindNodeState(false)` (`:127`).
- `reverseTime` has a documented open defect on the embedded branch. `reverseTime(embedTween?)` (`src/cocos/tween/tween.ts:715`) reverses the previous action when called bare, but wrapping an embedded `by` relative-move sequence lands on the wrong end point (`docs/reference/api-scenario-gap-matrix.md:483-485`, GAP-T1: start x=3, offset +2, expected x=3, observed x=5). The bare `by(...).reverseTime()` path is browser-verified; the embedded-sequence branch is not.
- `createStepClock` is a test driver with a hard dual-clock guard. `begin()` calls `game.pause()` and is idempotent (`src/air/step-clock.ts:80-84`); `step(dt = 1/frameRate)` first asserts the game is paused and throws an Error containing "dual clock" if it is not (`:68-75`, `:85-86`), then runs `director.tick(dt)` and resolves on the next `Director.EVENT_AFTER_DRAW` (`:99-100`), rejecting after `stepTimeoutMs` (default 2000) rather than silently succeeding (`:89-92`); `end()` calls `game.resume()` (`:103-107`). Defaults are `frameRate=60`, `stepTimeoutMs=2000` (`:63-64`).
- Pose graph and marionette are not published. `marionette` and `procedural-animation` are declared feature units with empty module lists (`src/cc.config.json:59-70`) and are virtual-module-overridden to empty stubs when their flags are off (`:437-450`); neither is in the default `AIR_FEATURES` array (`tools/build/build.cjs:24-44`), and `AnimationGraph` is absent from the export block (`build/cocosair.module.js`, currently `:161574`). An owner ruling keeps them out of the default release (`docs/notes/pose-graph-notes.md:151-155`).
- Browser evidence, stated plainly. In `docs/evidence/examples-verified.json`, `tween` carries a strong `frame-diff` binding (calls 95, export-wrapper), `Animation.play` is `verified`/`executed` (prototype, `no-runtime-error`), `AnimationClip` and `AnimationClip.WrapMode` are `verified` (export-wrapper / data-property), and `Tween.reverseTime` is `verified` only for the bare path (`no-runtime-error`, calls 1). `createStepClock` has ZERO apiProof bindings in that file and no `docs/evidence/w08-step-clock.json` exists on disk; its proof is the passing probe at `tools/debug/probes/step-clock-probe/main.js` run by `tools/verify/step-clock.cjs`, not a committed evidence record (`references/step-clock.md`).

## Common Mistakes

### [HIGH] Importing track classes by name

Wrong:
```ts
import { VectorTrack, TrackPath, WrapMode } from 'cocosair';   // none of these are top-level exports
const track = new VectorTrack();
```

Correct:
```ts
import { animation, AnimationClip } from 'cocosair';
const track = new animation.VectorTrack();
track.path = new animation.TrackPath().toProperty('position');
const clip = new AnimationClip();
clip.wrapMode = AnimationClip.WrapMode.Loop;                   // WrapMode lives on AnimationClip
```

The track classes are frozen into the `animation` namespace (`build/cocosair.module.js`, currently `:57866-57889`) and excluded from the runtime export block (`:161574`); `WrapMode` is reachable only as the `AnimationClip.WrapMode` static (`src/cocos/animation/animation-clip.ts:104`).

### [HIGH] Running the real pacer and the step clock at once

Wrong:
```js
const clock = createStepClock();
await clock.step(1 / 60);          // never called begin(): game is still running -> throws "dual clock"
```

Correct:
```js
const clock = createStepClock();
clock.begin();                     // game.pause() first
for (let i = 0; i < 90; i++) { await clock.step(1 / 60); }
clock.end();                       // game.resume() when done
```

`step()` asserts the game is paused and throws if rAF is still driving frames (`src/air/step-clock.ts:68-75`, `:85-86`); concurrent real-clock and manual stepping is forbidden by contract (`docs/manual/how-to-update-things.md`).

### [HIGH] Assuming `reverseTime(embedTween)` returns to the start

Wrong:
```js
tween(node).by(1, { position: new Vec3(2, 0, 0) }).reverseTime(tween(node).by(1, { position: new Vec3(2, 0, 0) })).start();
// expects the node back at its origin; GAP-T1 lands it on the wrong end point
```

Correct:
```js
tween(node).by(1, { position: new Vec3(2, 0, 0) }).reverseTime().start();   // bare path is browser-verified
```

The embedded-sequence branch has an open end-point defect (`docs/reference/api-scenario-gap-matrix.md:483-485`); method-level `verified` evidence covers only the bare `by(...).reverseTime()` path.

### [MEDIUM] Setting `wrapMode` every frame to keep a clip looping

Wrong:
```js
class Looper extends Component { update() { state.wrapMode = AnimationClip.WrapMode.Loop; } }   // resets time each frame
```

Correct:
```js
clip.wrapMode = AnimationClip.WrapMode.Loop;   // set once, before play
anim.play(clip.name);
```

The `wrapMode` setter assigns `time = 0` and rewrites `repeatCount` (`src/cocos/animation/animation-state.ts:119-129`), so a per-frame assignment freezes playback at the first frame.

### [MEDIUM] Citing marionette or pose-graph animation as available

Wrong:
```ts
import { AnimationGraph } from 'cocosair';   // not exported; the feature is not in the default build
```

Correct: use `tween` or a code-first `AnimationClip`; pose-graph state machines are unpublished (`src/cc.config.json:59-70`, `tools/build/build.cjs:24-44`, `docs/notes/pose-graph-notes.md:151-155`).

## References

- `references/animation-clip.md` - the `Animation` component surface and lifecycle, `AnimationState` and the wrapMode setter reset, `AnimationClip` construction and members, the `WrapMode` bitmask enum, the `animation` namespace and `TrackPath` builders, and the marionette/pose-graph exclusion with its build-time switches.
- `references/tween-ops.md` - the full `Tween` chain (to/by/set/delay/call/update/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale), lifecycle (start/stop/pause/resume/running), the target-bound statics, node-state binding, `TweenSystem` and the ActionManager, and the GAP-T1 reverseTime defect.
- `references/step-clock.md` - the `createStepClock` contract (begin/step/end, defaults, the dual-clock guard and timeout), how it freezes the real pacer, the probe and verifier tooling, and the exact evidence gap (zero apiProof bindings, no committed w08 record).

## Canonical docs

- `docs/manual/animation-system.md` - open for the two-route overview, the tween API table, the code-first clip skeleton, the glTF loop rules and the three verified clip sources.
- `docs/manual/how-to-update-things.md` - open for `update`/`lateUpdate`/`schedule` discipline, dt units and the startup spike, and the single-clock rule.
- `docs/notes/pose-graph-notes.md` - open for the pose-graph/marionette non-delivery, the build-time feature switches, the enablement cost and the owner ruling.
- `docs/reference/api-scenario-gap-matrix.md` - open for GAP-T1, the reverseTime embedded-sequence end-point defect and its reproduction note.
