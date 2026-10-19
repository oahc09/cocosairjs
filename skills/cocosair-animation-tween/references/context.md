# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `Node` activation, `active`, deferred `destroy()` and `NODE_DESTROYED`, which is what tween node-state binding hooks into.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp`, `app.run(scene)`, `game.pause()`/`game.resume()` and the director pacer that `createStepClock` freezes.
- [cocosair-math](../../cocosair-math/SKILL.md) - `Vec3`, `Quat`, `Color` and the value types tween props and track channels interpolate.
- [cocosair-gltf](../../cocosair-gltf/SKILL.md) - `GLTFInstance.setAnimationLoop` reconfigures the native `AnimationState.wrapMode` this skill documents; glTF clips default to `WrapMode.Normal`.
- [cocosair-skinning-morph](../../cocosair-skinning-morph/SKILL.md) - `SkeletalAnimation`, joint paths and bind pose; skeletal clips play through the same `Animation` component.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - cost of mass tween/animation, the ActionManager update, and render-on-demand versus a resident loop.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the gates and collectors behind every browser claim quoted below, including the step-clock probe and `examples-verified.json`.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Move things over time two ways: the code-first `tween(target)` chain (zero assets, the shortest path) and the native `Animation` component driving an `AnimationClip` you can build entirely in code. Both are stepped by the director, never by your own `requestAnimationFrame`. For deterministic evidence there is a third, test-only driver, `createStepClock`, that pauses the real clock and advances one frame at a time.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Importing track classes by name
- [HIGH] Running the real pacer and the step clock at once
- [HIGH] Assuming `reverseTime(embedTween)` returns to the start
- [MEDIUM] Setting `wrapMode` every frame to keep a clip looping
- [MEDIUM] Citing marionette or pose-graph animation as available

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives the Cocos AIR animation and tween surface - the code-first tween(target) chain (to/by/set/delay/call/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale plus start/stop/pause/resume and the target-bound statics), TweenSystem and its ActionManager, the native Animation component (play/stop/pause/resume/getState/createState/addClip/crossFade, executionOrder 99, playOnLoad), AnimationState wrapMode whose setter resets time and repeatCount, code-first AnimationClip construction, the AnimationClip.WrapMode static enum, the animation namespace that is the only route to VectorTrack and TrackPath, createStepClock single-clock stepping with its dual-clock guard, and the unpublished marionette and pose-graph state. Use when a tween will not reverse, when a clip plays once instead of looping, when track classes fail to import by name, when deterministic frame stepping is needed for evidence, or when pose-graph animation is assumed available.

### Keywords

Cocos AIR, cocosair.js, animation, tween

## References

- [animation-clip.md](animation-clip.md) - the `Animation` component surface and lifecycle, `AnimationState` and the wrapMode setter reset, `AnimationClip` construction and members, the `WrapMode` bitmask enum, the `animation` namespace and `TrackPath` builders, and the marionette/pose-graph exclusion with its build-time switches.
- [tween-ops.md](tween-ops.md) - the full `Tween` chain (to/by/set/delay/call/update/sequence/parallel/repeat/repeatForever/reverseTime/union/clone/timeScale), lifecycle (start/stop/pause/resume/running), the target-bound statics, node-state binding, `TweenSystem` and the ActionManager, and the GAP-T1 reverseTime defect.
- [step-clock.md](step-clock.md) - the `createStepClock` contract (begin/step/end, defaults, the dual-clock guard and timeout), how it freezes the real pacer, the probe and verifier tooling, and the exact evidence gap (zero apiProof bindings, no committed w08 record).

## Canonical docs

- `docs/manual/animation-system.md` - open for the two-route overview, the tween API table, the code-first clip skeleton, the glTF loop rules and the three verified clip sources.
- `docs/manual/how-to-update-things.md` - open for `update`/`lateUpdate`/`schedule` discipline, dt units and the startup spike, and the single-clock rule.
- `docs/notes/pose-graph-notes.md` - open for the pose-graph/marionette non-delivery, the build-time feature switches, the enablement cost and the owner ruling.
- `docs/reference/api-scenario-gap-matrix.md` - open for GAP-T1, the reverseTime embedded-sequence end-point defect and its reproduction note.
