---
name: cocosair-skinning-morph
description: "Bind skeletons, restore bind poses and drive morph weights. Use for realtime/baked deformation, AIR_E_SKINNING_JOINT_PATH or AIR_E_SKINNING_CAPACITY."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - build or bind a skeleton from joint paths
  - a skinned mesh stays in its rest pose
  - bone edits stop working in baked mode
  - restore the captured bind pose
  - morph weight changes appear to be ignored
owns: [skeletal-skinning, joint-paths, bind-pose, baked-pose, joint-capacity, morph-weights]
not_for:
  - glTF loading and decoder deployment -> cocosair-gltf
  - clip playback and tweens -> cocosair-animation-tween
  - generic mesh buffer authoring -> cocosair-primitives-mesh
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置骨骼路径、蒙皮、绑定姿态、Morph 权重和烘焙动画。用于骨骼变形、绑定姿态恢复或 Morph 问题。"
---

# Cocos AIR skinning and morph contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Code-built skeleton binding, bind-pose restoration, realtime/baked poses and morphs.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Build and bind a skeleton from joint paths
- Restore the original bind pose
- Animate bone nodes in realtime mode
- Select baked animation for fixed clips
- Author and apply morph target weights
- Diagnose AIR_E_SKINNING_* binding or capacity errors
- Invalidate stale bindpose caches and rebind

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Joint paths are relative to the skinning root and must be complete. Capture/restore bind pose deliberately; distinguish skeletal deformation, morph weights and baked-animation selection.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Use complete joint paths relative to the skinning root.
- [HIGH] Bone-node edits do not drive baked animation.
- [MEDIUM] restoreBindPose does not reorder the joints array.
- [MEDIUM] A weight setter call alone does not prove deformation.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Why did binding fail?](references/joint-paths.md) - Paths and capacity
- [Why is bind pose stale?](references/bind-pose.md) - Restore and rebind
- [Why did weights not apply?](references/morph.md) - Morph data and lifecycle
