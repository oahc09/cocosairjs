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
