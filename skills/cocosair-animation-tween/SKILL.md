---
name: cocosair-animation-tween
description: "Drives the Cocos AIR animation and tween surface - the code-first tween(target) chain (to/by/set/delay/call/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale plus start/stop/pause/resume and the target-bound statics), TweenSystem and its ActionManager, the native Animation component (play/stop/pause/resume/getState/createState/addClip/crossFade, executionOrder 99, playOnLoad), AnimationState wrapMode whose setter resets time and repeatCount, code-first AnimationClip construction, the AnimationClip.WrapMode static enum, the animation namespace that is the only route to VectorTrack and TrackPath, createStepClock single-clock stepping with its dual-clock guard, and the unpublished marionette and pose-graph state. Use when a tween will not reverse, when a clip plays once instead of looping, when track classes fail to import by name, when deterministic frame stepping is needed for evidence, or when pose-graph animation is assumed available."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, animation, tween"
  description_en: "Drives the Cocos AIR animation and tween surface - the code-first tween(target) chain (to/by/set/delay/call/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale plus start/stop/pause/resume and the target-bound statics), TweenSystem and its ActionManager, the native Animation component (play/stop/pause/resume/getState/createState/addClip/crossFade, executionOrder 99, playOnLoad), AnimationState wrapMode whose setter resets time and repeatCount, code-first AnimationClip construction, the AnimationClip.WrapMode static enum, the animation namespace that is the only route to VectorTrack and TrackPath, createStepClock single-clock stepping with its dual-clock guard, and the unpublished marionette and pose-graph state. Use when a tween will not reverse, when a clip plays once instead of looping, when track classes fail to import by name, when deterministic frame stepping is needed for evidence, or when pose-graph animation is assumed available."
  description_zh: "使用 AnimationClip、Animation 和 tween，管理播放模式、组合及单一时钟。用于动画播放、补间回收或确定性步进问题。"
---

# Cocos AIR animation and tween contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Move things over time two ways: the code-first `tween(target)` chain (zero assets, the shortest path) and the native `Animation` component driving an `AnimationClip` you can build entirely in code. Both are stepped by the director, never by your own `requestAnimationFrame`. For deterministic evidence there is a third, test-only driver, `createStepClock`, that pauses the real clock and advances one frame at a time.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "move/scale/rotate something over time, no assets" -> `tween(target).to(...).start()`; the chain is a sequence and `repeatForever()` loops the union ([tween-ops.md](references/tween-ops.md)).
- "run two motions at once on one target" -> just start two tweens on the same target; they time independently. `parallel(...)` is only for packing a parallel group into a larger sequence.
- "reusable keyed animation, or a glTF clip" -> `Animation` component + `AnimationClip`; build the clip in code with `animation.VectorTrack` and `animation.TrackPath` ([animation-clip.md](references/animation-clip.md)).
- "loop a clip" -> set `clip.wrapMode = AnimationClip.WrapMode.Loop` before play, or set `state.wrapMode` (which resets time and repeatCount) ([animation-clip.md](references/animation-clip.md)).
- "per-frame game logic" -> `Component.update(dt)` / `lateUpdate(dt)` / `this.schedule(cb, interval)`; multiply by `dt`, never assume a fixed frame rate (`docs/manual/how-to-update-things.md`).
- "deterministic frames for a test or evidence capture" -> `createStepClock()`; `begin()` then `await step(dt)` then `end()`, and never run it while the real pacer is live ([step-clock.md](references/step-clock.md)).
- "state-machine / pose-graph animation" -> not published; `marionette` and `procedural-animation` are out of the default feature set ([animation-clip.md](references/animation-clip.md)).

## Contracts

Use one clock for native updates and deterministic steps. Preserve tween target ownership; pose-graph availability requires checking the actual entry. `WrapMode` is accessed through `AnimationClip.WrapMode`.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Importing track classes by name
- [HIGH] Running the real pacer and the step clock at once
- [HIGH] Assuming `reverseTime(embedTween)` returns to the start
- [MEDIUM] Setting `wrapMode` every frame to keep a clip looping
- [MEDIUM] Citing marionette or pose-graph animation as available

## References

- [animation-clip.md](references/animation-clip.md) - the `Animation` component surface and lifecycle, `AnimationState` and the wrapMode setter reset, `AnimationClip` construction and members, the `WrapMode` bitmask enum, the `animation` namespace and `TrackPath` builders, and the marionette/pose-graph exclusion with its build-time switches.
- [tween-ops.md](references/tween-ops.md) - the full `Tween` chain (to/by/set/delay/call/update/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale), lifecycle (start/stop/pause/resume/running), the target-bound statics, node-state binding, `TweenSystem` and the ActionManager, and the GAP-T1 reverseTime defect.
- [step-clock.md](references/step-clock.md) - the `createStepClock` contract (begin/step/end, defaults, the dual-clock guard and timeout), how it freezes the real pacer, the probe and verifier tooling, and the exact evidence gap (zero apiProof bindings, no committed w08 record).

## Canonical docs

- `docs/manual/animation-system.md` - open for the two-route overview, the tween API table, the code-first clip skeleton, the glTF loop rules and the three verified clip sources.
- `docs/manual/how-to-update-things.md` - open for `update`/`lateUpdate`/`schedule` discipline, dt units and the startup spike, and the single-clock rule.
- `docs/notes/pose-graph-notes.md` - open for the pose-graph/marionette non-delivery, the build-time feature switches, the enablement cost and the owner ruling.
- `docs/reference/api-scenario-gap-matrix.md` - open for GAP-T1, the reverseTime embedded-sequence end-point defect and its reproduction note.
