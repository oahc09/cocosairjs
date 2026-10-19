# skinning and morph contracts triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "build a skeleton in code" -> `buildSkeletonTree(root, jointPaths)`; it writes `joints` and `bindposes` in one pass (`src/air/utils/skeleton-tree.ts:26-39`). "reset the rig" -> `restoreBindPose(root, skeleton)` with the same root you passed to it (`src/air/utils/restore-bind-pose.ts:30`, `docs/guides/skinned-model.md:29`).
- "wiggle bones by hand" -> realtime mode: keep the renderer under the root and install no enabled `SkeletalAnimation` there (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:197-202`, `docs/manual/skinning-code-first.md:35`).
- "play a fixed clip" -> `SkeletalAnimation` plus baked mode, which is also the renderer's default model type (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:101`, `src/cocos/3d/skeletal-animation/skeletal-animation.ts:150`).
- "blend shape weights" -> author `struct.morph`, then `renderer.setWeights(weights, subMeshIndex)` (`src/cocos/3d/assets/mesh.ts:218`, `src/cocos/3d/framework/mesh-renderer.ts:695-706`).
- "why did binding throw" -> read the `AIR_E_SKINNING_*` code; each one names one data problem (`docs/manual/skinning-code-first.md:23`, [joint-paths.md](joint-paths.md)). "is my bindpose still valid" -> the caches and rebind rules in [bind-pose.md](bind-pose.md); the asset caches by matrix signature, not by node state.
