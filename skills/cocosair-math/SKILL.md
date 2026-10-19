---
name: cocosair-math
description: "Compute vectors, matrices, quaternions, colors and easing. Use for out-first math, frozen Vec3.UP errors, transform composition, rotation units or Mat4.invert."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - normalize or project a direction
  - compose or decompose a transform matrix
  - choose quaternion rotation and angle units
  - convert colors or calculate easing and deterministic random
  - writing a frozen vector constant throws
owns: [vector-math, matrix-transforms, quaternion, color-values, easing, deterministic-random]
not_for:
  - screen and world camera conversion -> cocosair-camera
  - native tween playback -> cocosair-animation-tween
  - node parenting and lifecycle -> cocosair-scene-graph
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "使用 Cocos 数学类型进行向量、矩阵、四元数、颜色和插值计算。用于坐标变换、旋转、颜色处理、缓动或确定性随机。"
---

# Cocos AIR math

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Mutable value types, matrix/quaternion transforms, colors, easing and random utilities.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Normalize vectors or compute angles
- Build matrices or read transforms back
- Convert quaternion and Euler rotations
- Test points and rectangles
- Parse colors or convert byte channels
- Interpolate values or choose easing curves
- Generate deterministic random values
- Round texture sizes or encode half floats

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Static math operations use the out-first convention; avoid mutating frozen constants. Matrices are column-major and child world transforms compose parent world with child local.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Never mutate frozen vector constants.
- [HIGH] Copy vectors before mutating them for independent owners.
- [MEDIUM] Static operations write to supplied output objects.
- [MEDIUM] Color channels use bytes; angle APIs differ in units.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Compute with value types?](references/value-types.md) - Mutation, color and bounds
- [Transform order wrong?](references/transforms.md) - Matrices and quaternion units
- [Curves or random values?](references/easing-random.md) - Easing, bits and half floats
