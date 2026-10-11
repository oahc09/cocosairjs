Derived from `src/cocos/physics-2d/framework/physics-system.ts`, `src/cocos/physics-2d/framework/components/rigid-body-2d.ts`, `src/cocos/physics-2d/framework/components/colliders/`, `src/cocos/physics-2d/box2d/`, `examples/physics-2d-basic/main.js`, `examples/physics-2d-collision/main.js`, `docs/manual/physics-2d-and-3d.md` - 2026-10-10.

# 2D physics with the pure-JS box2d backend

## Backend reality

- The default bundle compiles `physics-2d-framework` plus `physics-2d-box2d` (`tools/build/build.cjs:32`, `:41`); the box2d backend registers under the id `'box2d'` on `Game.EVENT_PRE_SUBSYSTEM_INIT` (`src/cocos/physics-2d/box2d/instantiate.ts:42-50`, world + rigid body + shapes). It is the vendored `@cocos/box2d` JS port - no WASM, no external artifact.
- `physics-2d-builtin`, the degraded 2D fallback, is deliberately out of the default feature set (`tools/build/build.cjs:31`; its registration site is `src/cocos/physics-2d/builtin/instantiate.ts:34`).
- The flat `selector` export of the bundle is this 2D selector, id `'box2d'` (`docs/notes/physics-3d-notes.md:40-45`).

## System and lifecycle

- `PhysicsSystem2D extends Eventify(System)` (`src/cocos/physics-2d/framework/physics-system.ts:40`), singleton getter `instance` (`:200`). Not a Component.
- `autoSimulation` defaults to true (`src/cocos/physics-2d/framework/physics-system.ts:120-125`, backing field `:219`); setting it false makes the system's post-update return early and hands stepping to you (`examples/physics-2d-collision/main.js:10`).
- Deterministic recipe used by the examples: `physics.autoSimulation = false`, then per advance `world.syncSceneToPhysics()` -> `physics.step(fixedTimeStep)` (`src/cocos/physics-2d/framework/physics-system.ts:345`) -> `world.syncPhysicsToScene()` (`examples/physics-2d-collision/main.js:5-6`); the collision example pins 490 steps of byte-reproducible event order (`docs/manual/physics-2d-and-3d.md:37`).

## Components

| Component           | Definition                                                                      | Notes                                                     |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `RigidBody2D`       | `src/cocos/physics-2d/framework/components/rigid-body-2d.ts:39`                 | `type` from `ERigidBody2DType` (STATIC/KINEMATIC/DYNAMIC) |
| `Collider2D`        | `src/cocos/physics-2d/framework/components/colliders/collider-2d.ts:39`         | event base; `sensor = true` makes BEGIN/END contact only  |
| `BoxCollider2D`     | `src/cocos/physics-2d/framework/components/colliders/box-collider-2d.ts:36`     | half-extents on the UITransform-sized node                |
| `CircleCollider2D`  | `src/cocos/physics-2d/framework/components/colliders/circle-collider-2d.ts:36`  | radius in the same units                                  |
| `PolygonCollider2D` | `src/cocos/physics-2d/framework/components/colliders/polygon-collider-2d.ts:36` | convex polygon points                                     |

Joints mount the same way: `Joint2D` base plus `DistanceJoint2D`, `FixedJoint2D`, `HingeJoint2D`, `SliderJoint2D`, `SpringJoint2D`, `WheelJoint2D`, `MouseJoint2D`, `RelativeJoint2D` - the directories are `src/cocos/physics-2d/framework/components/joints/` and every class name appears in the bundle's single export block (`build/cocosair.module.js`, currently :161574).

Units: box2d runs in meters; the framework scales by `PHYSICS_2D_PTM_RATIO = 32` (`src/cocos/physics-2d/framework/physics-types.ts:166`). Node/UI coordinates are pixels, so query points and drawn sizes differ from world sizes by that factor - read the value instead of hardcoding 32.

## Contact and trigger events

- `Collider2D` listens with the `Contact2DType` enum keys: `BEGIN_CONTACT`, `END_CONTACT`, `PRE_SOLVE`, `POST_SOLVE` (`examples/physics-2d-collision/main.js:236-239`; enum exported from the bundle).
- Sensor colliders deliver BEGIN/END while PRE/POST_SOLVE stay empty (`docs/manual/physics-2d-and-3d.md:36`).
- Callbacks can read `contact.getWorldManifold()`, `getManifold()`, `getImpulse()` (`docs/manual/physics-2d-and-3d.md:35`).

## Queries - all real under box2d

`PhysicsSystem2D` forwards to the world (`src/cocos/physics-2d/framework/physics-system.ts`):

- `raycast(p1, p2, type = ERaycast2DType.Closest, mask)` (`:362-363`), implemented at `src/cocos/physics-2d/box2d/physics-world.ts:173`.
- `testPoint(p)` returning the colliders under a point (`src/cocos/physics-2d/framework/physics-system.ts:370-371`), implemented at `src/cocos/physics-2d/box2d/physics-world.ts:360`.
- `testAABB(rect)` returning intersecting colliders (`src/cocos/physics-2d/framework/physics-system.ts:378-379`), implemented at `src/cocos/physics-2d/box2d/physics-world.ts:385`.

The basic example proves the three families hit real bodies, and points out that raycast is not a stub under this backend (`examples/physics-2d-basic/main.js:7`, sample calls at `:268-272`).

## Export reach

Confirmed present in the bundle export list (`build/cocosair.module.js`, currently :161574): `PhysicsSystem2D`, `RigidBody2D`, `Collider2D`, `BoxCollider2D`, `CircleCollider2D`, `PolygonCollider2D`, `Joint2D` and the eight joint subclasses, `Contact2DType`, `ERigidBody2DType`, `ERaycast2DType`, `ECollider2DType`, `EPhysics2DDrawFlags`, `PhysicsGroup2D`, `PHYSICS_2D_PTM_RATIO`, `Physics2DUtils`, `Physics2DManifoldType`, `Intersection2D`, `PhysicsLineStripCastResult`. There is no `TerrainCollider2D` or `PlaneCollider2D` - the 2D shape set is box/circle/polygon only (directory above).
