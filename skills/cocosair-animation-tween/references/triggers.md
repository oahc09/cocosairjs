# Cocos AIR animation and tween triggers

Source annotations refer to the AIR checkout.

## When to use what

- "move/scale/rotate something over time, no assets" -> `tween(target).to(...).start()`; the chain is a sequence and `repeatForever()` loops the union ([tween-ops.md](tween-ops.md)).
- "run two motions at once on one target" -> just start two tweens on the same target; they time independently. `parallel(...)` is only for packing a parallel group into a larger sequence.
- "reusable keyed animation, or a glTF clip" -> `Animation` component + `AnimationClip`; build the clip in code with `animation.VectorTrack` and `animation.TrackPath` ([animation-clip.md](animation-clip.md)).
- "loop a clip" -> set `clip.wrapMode = AnimationClip.WrapMode.Loop` before play, or set `state.wrapMode` (which resets time and repeatCount) ([animation-clip.md](animation-clip.md)).
- "per-frame game logic" -> `Component.update(dt)` / `lateUpdate(dt)` / `this.schedule(cb, interval)`; multiply by `dt`, never assume a fixed frame rate (`docs/manual/how-to-update-things.md`).
- "deterministic frames for a test or evidence capture" -> `createStepClock()`; `begin()` then `await step(dt)` then `end()`, and never run it while the real pacer is live ([step-clock.md](step-clock.md)).
- "state-machine / pose-graph animation" -> not published; `marionette` and `procedural-animation` are out of the default feature set ([animation-clip.md](animation-clip.md)).
