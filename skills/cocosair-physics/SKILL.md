---
name: cocosair-physics
description: "Choose builtin, cannon or Box2D physics; wire rigid bodies, colliders and raycasts. Use for missing gravity, trigger filters, backend limits or material error 9642."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - dynamic bodies do not fall or stack
  - triggers stop firing after changing collision groups
  - choose builtin or cannon before startup
  - query 2D bodies with raycasts or overlap tests
  - physics material error 9642 appears
owns: [builtin-physics, cannon, box2d, collision-filter, rigid-body, physics-queries]
not_for:
  - camera pixel-to-ray conversion -> cocosair-camera
  - node hierarchy and transforms -> cocosair-scene-graph
  - non-physics startup errors -> cocosair-application
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "选择 builtin 或 cannon，并区分碰撞检测、运动积分和二维 Box2D 的能力。用于刚体、触发器、射线查询或物理后端问题。"
---

# Cocos AIR physics contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Builtin/cannon selection, 3D bodies and filters, and pure-JS 2D Box2D.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Choose query-only builtin or simulated cannon physics
- Make bodies fall, stack or respond to forces
- Configure colliders, triggers and bidirectional collision masks
- Use 2D rigid bodies or spatial queries
- Diagnose 9642 and backend registration
- Check whether a requested WASM backend ships

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Choose builtin or cannon before engine initialization. Builtin detects collisions but does not integrate motion; WASM backend presence must be verified separately. Do not treat exported rigid-body symbols as simulation proof.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Default builtin physics does not provide gravity or stacking.
- [HIGH] Set both collision groups and masks for valid pairs.
- [MEDIUM] Ammo, physx and box2d-wasm are not shipped.
- [MEDIUM] The flat selector export does not identify 3D backend.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Which backend ships?](references/backend-selection.md) - Selection and limits
- [Why no 3D motion?](references/3d-contracts.md) - Bodies, filters and queries
- [Need 2D physics?](references/2d-box2d.md) - Box2D components and queries
