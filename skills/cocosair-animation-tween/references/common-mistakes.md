Derived from the cocosair-animation-tween skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
