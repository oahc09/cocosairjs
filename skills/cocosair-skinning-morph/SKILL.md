---
name: cocosair-skinning-morph
description: "Drives Cocos AIR skeletal skinning and morph targets from code - SkinnedMeshRenderer skeleton and skinningRoot binding, Skeleton.joints as full paths relative to the skinning root with AIR_E_SKINNING_JOINT_PATH, buildSkeletonTree bindposes as inverse world matrices, restoreBindPose ancestor-first ordering, realtime versus baked pose through setUseBakedAnimation, joint palette capacity and AIR_E_SKINNING_CAPACITY, Mesh.morphRendering plus getBoneSpaceBounds, and MeshRenderer setWeight, setWeights and enableMorph. Use when a skinned mesh stays in rest pose or draws nothing, when a joint path throws AIR_E_SKINNING_JOINT_PATH, when moving bone nodes after setUseBakedAnimation(true) has no effect, when a morph weight setter appears to be ignored, or when binding a hand-built Mesh to a Skeleton without the Cocos Creator asset pipeline."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, skinning, morph"
  description_en: "Drives Cocos AIR skeletal skinning and morph targets from code - SkinnedMeshRenderer skeleton and skinningRoot binding, Skeleton.joints as full paths relative to the skinning root with AIR_E_SKINNING_JOINT_PATH, buildSkeletonTree bindposes as inverse world matrices, restoreBindPose ancestor-first ordering, realtime versus baked pose through setUseBakedAnimation, joint palette capacity and AIR_E_SKINNING_CAPACITY, Mesh.morphRendering plus getBoneSpaceBounds, and MeshRenderer setWeight, setWeights and enableMorph. Use when a skinned mesh stays in rest pose or draws nothing, when a joint path throws AIR_E_SKINNING_JOINT_PATH, when moving bone nodes after setUseBakedAnimation(true) has no effect, when a morph weight setter appears to be ignored, or when binding a hand-built Mesh to a Skeleton without the Cocos Creator asset pipeline."
  description_zh: "配置骨骼路径、蒙皮、绑定姿态、Morph 权重和烘焙动画。用于骨骼变形、绑定姿态恢复或 Morph 问题。"
---

# Cocos AIR skinning and morph contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Bind a code-built bone hierarchy to a skinned mesh, keep the bind pose restorable, choose realtime versus baked pose honestly, and drive morph weights through the native renderer - no Prefab, no Editor, no parallel skeleton abstraction.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "build a skeleton in code" -> `buildSkeletonTree(root, jointPaths)`; it writes `joints` and `bindposes` in one pass (`src/air/utils/skeleton-tree.ts:26-39`). "reset the rig" -> `restoreBindPose(root, skeleton)` with the same root you passed to it (`src/air/utils/restore-bind-pose.ts:30`, `docs/guides/skinned-model.md:29`).
- "wiggle bones by hand" -> realtime mode: keep the renderer under the root and install no enabled `SkeletalAnimation` there (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:197-202`, `docs/manual/skinning-code-first.md:35`).
- "play a fixed clip" -> `SkeletalAnimation` plus baked mode, which is also the renderer's default model type (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:101`, `src/cocos/3d/skeletal-animation/skeletal-animation.ts:150`).
- "blend shape weights" -> author `struct.morph`, then `renderer.setWeights(weights, subMeshIndex)` (`src/cocos/3d/assets/mesh.ts:218`, `src/cocos/3d/framework/mesh-renderer.ts:695-706`).
- "why did binding throw" -> read the `AIR_E_SKINNING_*` code; each one names one data problem (`docs/manual/skinning-code-first.md:23`, [joint-paths.md](references/joint-paths.md)). "is my bindpose still valid" -> the caches and rebind rules in [bind-pose.md](references/bind-pose.md); the asset caches by matrix signature, not by node state.

## Contracts

Joint paths are relative to the skinning root and must be complete. Capture/restore bind pose deliberately; distinguish skeletal deformation, morph weights and baked-animation selection.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Writing joint short names instead of full paths
- [HIGH] Editing skeleton nodes after opting into baked animation
- [MEDIUM] Expecting restoreBindPose to reorder the joints array
- [MEDIUM] Treating a morph weight call as proof it applied

## References

- [joint-paths.md](references/joint-paths.md) - path resolution and its consumers, the weighted-joint scope of the path error, palette and capacity rules, glTF-loaded paths, and the deprecated component aliases.
- [bind-pose.md](references/bind-pose.md) - the inverse-world bindpose convention, capture timing, `restoreBindPose` ordering and math, stale caches, and rebinding after an asset edit.
- [morph.md](references/morph.md) - morph data shapes, `morphRendering` lifecycle, GPU versus CPU blending, the renderer weight API, macro patches, and morph combined with skinning.

## Canonical docs

- `docs/manual/skinning-code-first.md` - open for the binding order, the `AIR_E_SKINNING_*` taxonomy, root space versus node scale, manual joints and the first frame, capacity and the read-only inspector.
- `docs/guides/skinned-model.md` - open for the `buildSkeletonTree`, `restoreBindPose` and `frameObject` helper contracts, the joint path rule history, and the covering test and example.
