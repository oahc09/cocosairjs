# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `getChildByPath` resolution, parenting order and deferred `destroy()`, which a joint path and a release both depend on.
- [cocosair-primitives-mesh](../../cocosair-primitives-mesh/SKILL.md) - `Mesh` struct, vertex bundles and `minPosition`/`maxPosition`; the geometry half of a skinned mesh.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - the effect and `MaterialInstance` side of `setSharedMaterial`, which realtime mode forces.
- [cocosair-animation-tween](../../cocosair-animation-tween/SKILL.md) - `SkeletalAnimation` clips and `useBakedAnimation`, the only way to move a pose in baked mode.
- [cocosair-gltf](../../cocosair-gltf/SKILL.md) - where loaded joints, bindposes and morph weights come from.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the smoke test and browser probes behind the claims below.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Bind a code-built bone hierarchy to a skinned mesh, keep the bind pose restorable, choose realtime versus baked pose honestly, and drive morph weights through the native renderer - no Prefab, no Editor, no parallel skeleton abstraction.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Writing joint short names instead of full paths
- [HIGH] Editing skeleton nodes after opting into baked animation
- [MEDIUM] Expecting restoreBindPose to reorder the joints array
- [MEDIUM] Treating a morph weight call as proof it applied

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives Cocos AIR skeletal skinning and morph targets from code - SkinnedMeshRenderer skeleton and skinningRoot binding, Skeleton.joints as full paths relative to the skinning root with AIR_E_SKINNING_JOINT_PATH, buildSkeletonTree bindposes as inverse world matrices, restoreBindPose ancestor-first ordering, realtime versus baked pose through setUseBakedAnimation, joint palette capacity and AIR_E_SKINNING_CAPACITY, Mesh.morphRendering plus getBoneSpaceBounds, and MeshRenderer setWeight, setWeights and enableMorph. Use when a skinned mesh stays in rest pose or draws nothing, when a joint path throws AIR_E_SKINNING_JOINT_PATH, when moving bone nodes after setUseBakedAnimation(true) has no effect, when a morph weight setter appears to be ignored, or when binding a hand-built Mesh to a Skeleton without the Cocos Creator asset pipeline.

### Keywords

Cocos AIR, cocosair.js, skinning, morph

## References

- [joint-paths.md](joint-paths.md) - path resolution and its consumers, the weighted-joint scope of the path error, palette and capacity rules, glTF-loaded paths, and the deprecated component aliases.
- [bind-pose.md](bind-pose.md) - the inverse-world bindpose convention, capture timing, `restoreBindPose` ordering and math, stale caches, and rebinding after an asset edit.
- [morph.md](morph.md) - morph data shapes, `morphRendering` lifecycle, GPU versus CPU blending, the renderer weight API, macro patches, and morph combined with skinning.

## Canonical docs

- `docs/manual/skinning-code-first.md` - open for the binding order, the `AIR_E_SKINNING_*` taxonomy, root space versus node scale, manual joints and the first frame, capacity and the read-only inspector.
- `docs/guides/skinned-model.md` - open for the `buildSkeletonTree`, `restoreBindPose` and `frameObject` helper contracts, the joint path rule history, and the covering test and example.
