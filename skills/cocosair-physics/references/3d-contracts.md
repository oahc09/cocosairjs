Derived from `src/cocos/physics/framework/physics-system.ts`, `src/cocos/physics/framework/components/rigid-body.ts`, `src/cocos/physics/framework/components/colliders/collider.ts`, `src/cocos/physics/cocos/builtin-world.ts`, `docs/notes/physics-3d-notes.md`, `examples/physics-3d-basic/main.js`, `docs/manual/physics-2d-and-3d.md` - 2026-10-10.

# 3D physics contracts

## Singleton timing

- `PhysicsSystem extends System` (`src/cocos/physics/framework/physics-system.ts:47`), not a Component - never `addComponent` it.
- `_instance` is built by `director.once(DirectorEvent.INIT, () => PhysicsSystem.constructAndRegister())` (`:912`, method `:875`); at module top level `PhysicsSystem.instance` (`:92`) is `null`, so all reads belong after `await createAirApp(...)` (`docs/notes/physics-3d-notes.md:50-52`).
- `new PhysicsSystem()` is not forbidden but creates a stray instance that still sees the same selector-level world (`docs/notes/physics-3d-notes.md:161-164`); it is not a second physics system.

## Mount contract

- `RigidBody` (`src/cocos/physics/framework/components/rigid-body.ts:60`) and `Collider` (`src/cocos/physics/framework/components/colliders/collider.ts:46`) are components on the same node; concrete colliders `BoxCollider`/`SphereCollider`/`CapsuleCollider`/`MeshCollider` extend `Collider` (`colliderInheritsBase`, `docs/notes/physics-3d-notes.md:180`).
- Collider defaults are component-only: `BoxCollider.size` defaults to 1x1x1 and `SphereCollider.radius` to 0.5 - neither follows the rendered Mesh (`docs/notes/physics-3d-notes.md:138-140`); set sizes explicitly.
- `Collider.isTrigger` (`src/cocos/physics/framework/components/colliders/collider.ts:149-156`) forwards to the shape; under builtin the trigger path is what emits, see below.
- Trigger and collision events ride the collider: `collider.on('onTriggerEnter' | 'onTriggerStay' | 'onTriggerExit')`, `onCollisionEnter` likewise (`examples/physics-3d-basic/main.js:312-316`). A pair is only recorded when at least one side registered a trigger listener (`collider.needTriggerEvent`, `docs/notes/physics-3d-notes.md:66-68`).

## Stepping and sync

- `PhysicsSystem.step(fixedTimeStep, deltaTime?, maxSubSteps?)` (`src/cocos/physics/framework/physics-system.ts:442`), `autoSimulation` default true (`docs/notes/physics-3d-notes.md:175`), `syncSceneToPhysics()` (`:452`).
- Sync is lazy: after `node.setPosition` the collider `worldBounds` stays stale until `syncSceneToPhysics()` or the next frame post-update; the before/unsynced/now three-state probe is `docs/notes/physics-3d-notes.md:70-86`.
- `app.run(scene)` drives the loop; destroying components synchronously right after `run` races frame 1 (`docs/manual/physics.md`).

## Filtering

- Pair test is bidirectional AND: `(groupA & maskB) === 0 || (groupB & maskA) === 0` skips the pair (`src/cocos/physics/cocos/builtin-world.ts:183-186`).
- Default `collisionMask` is `PhysicsGroup.DEFAULT` (1), so `setGroup(n)` alone silently drops that body from every pair until the other sides widen their masks (`docs/notes/physics-3d-notes.md:56-63`, both-sides fix `setMask(0xffffffff)` measured at `:62-63`).

## The builtin boundary, item by item

Upstream intent: "efficient discrete collision detector, not a full physical simulator" (`src/cocos/physics/cocos/builtin-world.ts:50-55`). Four independent measured proofs of "does not simulate" (`docs/notes/physics-3d-notes.md:17-33`):

| What was done                                        | What reads back                                    |
| ---------------------------------------------------- | -------------------------------------------------- |
| 60 manual steps on a dynamic crate                   | node position unchanged (`crateDrift 0`)           |
| `getLinearVelocity(out)` after setters and sentinels | `out` never written                                |
| mass/useGravity/damping/sleepThreshold assignments   | component bookkeeping only                         |
| `sharedMaterial` assignment on a collider            | shape keeps no material (`setMaterial(v){}` empty) |

- `BuiltInWorld.setGravity` is an empty body (`src/cocos/physics/cocos/builtin-world.ts:125-126`); `syncAfterEvents` only calls `syncSceneToPhysics` (`:198-200`) - there is no physics-to-scene write path; `emitEvents` only emits trigger events (`:202-204`), so `onCollisionEnter/Stay/Exit` never fire under builtin (`docs/notes/physics-3d-notes.md:65`).
- Real under builtin: mount, `raycast`/`raycastClosest`/`lineStripCast` against OBB/Sphere/Capsule (`docs/notes/physics-3d-notes.md:90-94`), trigger events, group queries.
- Fixed quirks under builtin: hit normals always zero; result order is registration order, not distance; `queryTrigger` never consulted; `sweepBox`/`sweepSphere` always return false with `warnID(9640)`; `MeshCollider` never enters the world (not among the five registered wrappers, `src/cocos/physics/cocos/instantiate.ts:34-40`); `Collider.boundingSphere` stays at constructor defaults (`docs/notes/physics-3d-notes.md:95-118`, `:134-142`).
- `PhysicsSystem.gravity` still reads back `(0, -10, 0)` at framework level even though the world ignores it (`src/cocos/physics/framework/physics-system.ts:157-161`, `docs/notes/physics-3d-notes.md:30-31`).

## What cannon inverts

Same page, same 60 steps, cannon variant measurements (`docs/notes/physics-3d-notes.md:373-386`): free fall lands (`dy -4.91`), `setLinearVelocity` writes back, `boundingSphere` follows the node, raycast hits real geometry, `MeshCollider` joins the world body set. Cannon also makes the missing default material fatal without AIR's registration ([backend-selection.md](backend-selection.md)). Both backends ship in the default bundle, so `createAirApp({ physics: 'cannon' })` is a switch, not a build step (`tools/build/build.cjs:41`).

## Export reach

The bundle's single export block (`build/cocosair.module.js`, currently :161574) carries `physics` (namespace), `PhysicsSystem`, `RigidBody`, `Collider`, `BoxCollider`, `SphereCollider`, `CapsuleCollider`, `MeshCollider`, `CylinderCollider`, `ConeCollider`, `PlaneCollider`, `TerrainCollider`, `SimplexCollider`, `BoxCharacterController`, `CapsuleCharacterController`, `PhysicsMaterial` (plus the `PhysicMaterial` alias), `PhysicsRayResult`, `PhysicsGroup`, `ERigidBodyType`, `EColliderType`, `ConstantForce`, the constraint classes, and `selectPhysicsBackend`. Backend selector internals beyond `selectPhysicsBackend` are reachable only through the exported `selector` name, which is the 2D one - do not use it for 3D (`docs/notes/physics-3d-notes.md:38-45`).
