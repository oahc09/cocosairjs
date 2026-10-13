---
name: cocosair-physics
description: "Applies to physics in code-first Cocos AIR apps - choosing the 3D backend with createAirApp({ physics: 'builtin' | 'cannon' }) (default builtin), selectPhysicsBackend and the official last-registration-before-init rule, the query-only boundary of the builtin discrete collision detector (no gravity integration, no MeshCollider in the world, trigger events and raycasts still real), PhysicsSystem/RigidBody/Collider wiring and the bidirectional group-and-mask filter, error 9642 for default-physics-material (fatal on cannon, benign on builtin) and AIR's built-in material registration, and the pure-JS 2D box2d backend with PhysicsSystem2D, RigidBody2D, Collider2D, BoxCollider2D and the raycast/testPoint/testAABB queries. Use when dynamic bodies do not fall or stack, when triggers fire silently, when deciding between builtin and cannon, when 9642 appears in the console, or when asking whether ammo, physx or box2d-wasm ship (they do not)."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, physics"
  description_en: "Applies to physics in code-first Cocos AIR apps - choosing the 3D backend with createAirApp({ physics: 'builtin' | 'cannon' }) (default builtin), selectPhysicsBackend and the official last-registration-before-init rule, the query-only boundary of the builtin discrete collision detector (no gravity integration, no MeshCollider in the world, trigger events and raycasts still real), PhysicsSystem/RigidBody/Collider wiring and the bidirectional group-and-mask filter, error 9642 for default-physics-material (fatal on cannon, benign on builtin) and AIR's built-in material registration, and the pure-JS 2D box2d backend with PhysicsSystem2D, RigidBody2D, Collider2D, BoxCollider2D and the raycast/testPoint/testAABB queries. Use when dynamic bodies do not fall or stack, when triggers fire silently, when deciding between builtin and cannon, when 9642 appears in the console, or when asking whether ammo, physx or box2d-wasm ship (they do not)."
  description_zh: "选择 builtin 或 cannon，并区分碰撞检测、运动积分和二维 Box2D 的能力。用于刚体、触发器、射线查询或物理后端问题。"
---

# Cocos AIR physics contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Pick the backend honestly, mount the framework components, and state what each backend actually simulates - no Creator asset bundle, no WASM artifacts, no parallel physics abstraction.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "queries, triggers, collision callbacks only" -> default `physics: 'builtin'`; zero external dependencies, real raycasts, no simulation.
- "gravity, falling, stacking, forces" -> `createAirApp({ physics: 'cannon' })`; pure-JS cannon from the vendored `@cocos/cannon`, both backends already in the default bundle (`tools/build/build.cjs:41`).
- "2D rigid bodies and queries" -> box2d is the default 2D backend (`src/cocos/physics-2d/box2d/instantiate.ts:43`); `PhysicsSystem2D.raycast/testPoint/testAABB` (`src/cocos/physics-2d/framework/physics-system.ts:362`, `:370`, `:378`), see [2d-box2d.md](references/2d-box2d.md).
- "ammo / physx / box2d-wasm" -> not shipped; the Emscripten artifacts do not exist in this repository (`docs/notes/physics-asset-sourcing.md:11-17`), see [backend-selection.md](references/backend-selection.md).
- "why did my trigger stop firing after `setGroup`" -> the mask half of the pair is still 1; fix both sides (`docs/notes/physics-3d-notes.md:56-63`).

## Contracts

Choose builtin or cannon before engine initialization. Builtin detects collisions but does not integrate motion; WASM backend presence must be verified separately. Do not treat exported rigid-body symbols as simulation proof.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Calling createAirApp({}) and expecting gravity or stacking
- [HIGH] Setting only the collision group and losing every pair
- [MEDIUM] Asking for a WASM backend that is not shipped
- [MEDIUM] Reading 3D backend identity from the flat selector export

## References

- [backend-selection.md](references/backend-selection.md) - the selector registry and event ordering, default normalization, zero-backend warn versus PHYSICS_NONE, the 9642 split and the built-in material registration, and why WASM backends are absent.
- [3d-contracts.md](references/3d-contracts.md) - PhysicsSystem singleton timing, mount and query API, filter semantics, the builtin query-only boundary item by item, and what cannon inverts.
- [2d-box2d.md](references/2d-box2d.md) - PhysicsSystem2D, deterministic stepping, rigid-body and collider components, shape set, joints, and the raycast/testPoint/testAABB queries.

## Canonical docs

- `docs/manual/physics-2d-and-3d.md` - open for the backend comparison table, the four event families and the five runnable physics examples.
- `docs/notes/physics-3d-notes.md` - open for the browser-measured builtin boundary, filter semantics, lazy sync and the cannon variant reversal.
- `docs/reference/api-stability.md` - open for which physics APIs are Stable versus Candidate and why (`docs/reference/api-stability.md:40-52`).
