Derived from `src/air/step-clock.ts`, `tools/debug/probes/step-clock-probe/main.js`, `tools/verify/step-clock.cjs`, `build/cocosair.module.js`, `docs/manual/how-to-update-things.md`, `docs/evidence/examples-verified.json` (as of 2026-10-10).

## Why a step clock exists

`game.step()` only runs `director.tick(fixedDT)`; it does not pause the main loop first, so calling it while the app is running means the real rAF pacer and your manual stepping advance the business clock at the same time - a dual clock, which the reliability task list forbids (`src/air/step-clock.ts:1-19`). `createStepClock` freezes the three-step contract so evidence capture is deterministic: `begin()` pauses the real clock, `step(dt)` advances exactly one frame and waits for it to be drawn, `end()` resumes.

## The contract

`createStepClock(options?)` (`src/air/step-clock.ts:62`) reads `frameRate = options.frameRate ?? 60` (`:63`) and `stepTimeoutMs = options.stepTimeoutMs ?? 2000` (`:64`), and closes over `stepping = false` and `stepped = 0` (`:65-66`). It returns an `AirStepClock` object literal (`:77-108`) with two getters and three methods:

| Member                   | Behavior                                                                               | Line                       |
| ------------------------ | -------------------------------------------------------------------------------------- | -------------------------- |
| `stepping` (getter)      | whether `begin()` has run and `end()` has not                                          | `src/air/step-clock.ts:78` |
| `stepped` (getter)       | count of completed steps since `begin()`                                               | `:79`                      |
| `begin()`                | idempotent: returns if already stepping, else `game.pause()` and set `stepping = true` | `:80-84`                   |
| `step(dt = 1/frameRate)` | asserts paused, ticks one frame, resolves on AFTER_DRAW                                | `:85-102`                  |
| `end()`                  | idempotent: returns if not stepping, else clear the flag and `game.resume()`           | `:103-107`                 |

`step()` is the guarded path. It first calls `assertPaused()` (`:86`), which reads the private `game._paused` and throws an `Error` whose message contains "dual clock" when the real clock is running (`:68-75`). It captures `index = stepped + 1` (`:87`), then returns a Promise that arms a `setTimeout(stepTimeoutMs)` which removes the draw listener and rejects with `no AFTER_DRAW within <n>ms` (`:89-92`), registers a one-shot `Director.EVENT_AFTER_DRAW` listener that clears the timer, sets `stepped = index` and resolves `{ step: index, dt, afterDraw: true }` (`:93-98`), and finally calls `director.tick(dt)` (`:99-100`). The timeout rejecting rather than silently resolving is deliberate (`:54-55`). `begin()`/`end()` map directly to `game.pause()`/`game.resume()`, which stop and restart the real pacer (rAF, render, business clock and audio) (`:6-11`).

The receipt type is `AirStepFrame { step: number; dt: number; afterDraw: true }` (`src/air/step-clock.ts:24-31`); the handle type is `AirStepClock` (`:34-48`) and the options type `AirStepClockOptions { frameRate?; stepTimeoutMs? }` (`:51-56`). `createStepClock` is Air-original with no upstream cocos4 counterpart (`:18`), and it is present in the runtime export block (`build/cocosair.module.js`, currently `:161574`).

## Usage shape

```js
const clock = createStepClock();      // frameRate 60, stepTimeoutMs 2000
clock.begin();                        // game.pause()
for (let i = 0; i < 90; i++) {
    const frame = await clock.step(1 / 60);   // frame == { step: i + 1, dt: 1/60, afterDraw: true }
    // read mid-values or hash the canvas here; the real clock is frozen
}
clock.end();                          // game.resume()
```

Because the real pacer is frozen between `begin()` and `end()`, a `step(1/60)` loop is frame-rate independent and reproducible: 90 steps accumulate exactly 1.5 s of business time regardless of wall clock. The single-clock rule and the dt discipline it protects are described in `docs/manual/how-to-update-things.md`.

## Tooling

The probe that exercises this contract lives at `tools/debug/probes/step-clock-probe/main.js`; it is deliberately isolated under `tools/debug/probes`, is not registered in `files.json`, and does not enter the Gallery or coverage. It asserts six things: the dual-clock guard throws on a runtime `step()` without `begin()`, the real rAF is frozen after `begin()` (a 500 ms double-sample yields delta 0), 90 `step(1/60)` calls accumulate dt 1.5 s and an exact rotation angle, a mid-sequence value is non-endpoint, `end()` resumes the real clock, and two identical step sequences produce the same per-frame pixel sha256 (SwiftShader determinism). The runner is `tools/verify/step-clock.cjs`, invoked as `NODE_PATH=<playwright> node tools/verify/step-clock.cjs`; it serves the probe over a local HTTP server, launches headless Chromium with ANGLE/SwiftShader, waits for `window.__stepProbe.ready`, and is configured to write `docs/evidence/w08-step-clock.json`.

## The evidence gap, stated plainly

`createStepClock` has ZERO apiProof bindings in `docs/evidence/examples-verified.json` (grep count 0), and no `docs/evidence/w08-step-clock.json` exists on disk anywhere in the repo, even though `tools/verify/step-clock.cjs` names it as its output. So the step clock is exported and probe-exercised but carries no committed, tracked evidence record: its proof is the passing probe and verifier, not a durable JSON artifact. Do not cite a w08 evidence file as if it were committed. By contrast, the tween and clip surfaces do carry bindings in `examples-verified.json` (`tween` frame-diff, `Animation.play` and `AnimationClip` verified) - see `skills/cocosair-animation-tween/references/tween-ops.md` and `skills/cocosair-animation-tween/references/animation-clip.md`. If you need a durable step-clock record, run the verifier and commit its output; until then treat the contract as source-proven and probe-proven only.
