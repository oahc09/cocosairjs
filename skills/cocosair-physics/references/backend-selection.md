Derived from `src/air/physics-backend.ts`, `src/air/app-config.ts`, `src/air/bootstrap.ts`, `src/cocos/physics/framework/physics-selector.ts`, `tools/build/build.cjs`, `docs/notes/physics-asset-sourcing.md`, `docs/notes/physics-3d-notes.md` - 2026-10-10.

# Backend selection in Cocos AIR

## The option and its default

- `AirAppOptions.physics?: 'builtin' | 'cannon'` (`src/air/app.ts:72`), typed `AirPhysicsBackend` (`src/air/physics-backend.ts:21`, engine ids mapped at `:23-26`).
- Normalization: `const physics = options.physics ?? 'builtin'` (`src/air/app-config.ts:45`); any other value throws `AIR_E_PHYSICS_BACKEND` (`src/air/app-config.ts:46`). So `createAirApp({})` is `createAirApp({ physics: 'builtin' })`, byte-for-byte the previous shipping behavior (`docs/reference/api-stability.md:93`).
- The frozen normalized options compare `physics` in identity checks (`src/air/app-config.ts:108`, `:115`).

## When and how the choice is applied

1. `initializeAirApp` registers `selectPhysicsBackend(options.physics)` on `Game.EVENT_PRE_SUBSYSTEM_INIT` before `game.init()` and removes it in the `finally` (`src/air/bootstrap.ts:141-142`, `:165`).
2. Both upstream backends self-register on the same event - builtin with five wrappers (`src/cocos/physics/cocos/instantiate.ts:33-40`), cannon with the full wrapper set (`src/cocos/physics/cannon/instantiate.ts:45`); the AIR listener runs last inside the event, so the user's pick deterministically wins (`src/air/bootstrap.ts:137-140`).
3. The official contract is "the system will use the last backend registered before initialization" (`src/cocos/physics/framework/physics-selector.ts:100-107`); `register` writes the registry entry and moves `selector.id`/`selector.wrapper` while no world exists yet (`:127-136`), syncing the legacy `CC_PHYSICS_BUILTIN` / `CC_PHYSICS_CANNON` macros (`:121-125`).
4. `selectPhysicsBackend` then calls `selector.register(engineId, wrapper)` (`src/air/physics-backend.ts:64`) and seeds the default material (`:65`).

## Failure modes, exactly

| Condition                                                           | Behavior                                                             | Citation                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Registry empty (source graph or tests, no physics feature imported) | `console.warn` only, engine keeps its tolerated `PHYSICS_NONE` state | `src/air/physics-backend.ts:46-52` |
| Requested id absent from a non-empty registry                       | `throw Error` listing registered ids                                 | `src/air/physics-backend.ts:45-57` |
| Selection after `selector.physicsWorld` exists                      | `throw Error`, late selection unsupported                            | `src/air/physics-backend.ts:58-62` |

`PHYSICS_NONE` is a real capability constant on the system class (`src/cocos/physics/framework/physics-system.ts:48-53`). `selector.switchTo` is the post-world path (`src/cocos/physics/framework/physics-selector.ts:145-164`) and is not offered by AIR as a runtime switch (`docs/reference/api-stability.md:52`).

## Default physics material and error 9642

- `PhysicsSystem.initDefaultMaterial` looks up `builtinResMgr.get('default-physics-material')`; on a miss it logs `errorID(9642)` and returns with `_material` unset (`src/cocos/physics/framework/physics-system.ts:223-230`); message text "Failed to load builtinMaterial" (line 420 of `DebugInfos.json` under `src/`).
- Benign for builtin: `BuiltinShape.setMaterial(v) {}` is an empty function, so the missing material never dereferences (`docs/notes/physics-3d-notes.md:26`, `:396-397`).
- Fatal for cannon without compensation: `CannonShape.setMaterial` falls back to `PhysicsSystem.instance.defaultMaterial` and reads its fields, throwing a `TypeError` per shape (`docs/notes/physics-3d-notes.md:390-395`).
- Compensation: `seedDefaultPhysicsMaterial` registers a `PhysicsMaterial` named `default-physics-material` in `builtinResMgr` - idempotently at AIR module evaluation (`src/air/physics-backend.ts:74-85`) and again on selection (`:65`) - so the createAirApp path shows no 9642 on either backend.

## What is not shipped

- Default AIR_FEATURES: `'physics-2d-framework'`, `'physics-2d-box2d'`, `'physics-builtin'`, `'physics-cannon'` (`tools/build/build.cjs:32`, `:41`); `physics-2d-builtin` is deliberately excluded (`tools/build/build.cjs:31`).
- ammo/bullet, physx and box2d-wasm sources exist in `src/cocos/physics/bullet/`, `src/cocos/physics/physx/` and `src/cocos/physics-2d/box2d-wasm/`, but each imports Emscripten artifacts under `external:emscripten/**` that are absent from the upstream snapshot, from upstream git, from the installed `@cocos/box2d@1.0.2` (JS-only), and from any fetch hook (`docs/notes/physics-asset-sourcing.md:11-17`, `:20-26`). Missing assets fail only at runtime import, which is why the sources compile (`docs/notes/physics-asset-sourcing.md:30`).
- Consequence: `selector.backend` in the default bundle carries `'builtin'` and `'cannon.js'` for 3D and `'box2d'` for 2D (`src/cocos/physics-2d/box2d/instantiate.ts:42-43`); no WASM id is selectable, and the honest fallback plan on record is the D8 partial-pass wording in `docs/notes/physics-asset-sourcing.md:44-47`.

## Identity checks that actually work

- `PhysicsSystem.PHYSICS_BUILTIN / PHYSICS_CANNON / PHYSICS_NONE` constants (`src/cocos/physics/framework/physics-system.ts:48-66`) plus `PhysicsSystem.instance.physicsWorld.constructor.name` (`'BuiltInWorld'` or `'CannonWorld'`, `docs/notes/physics-3d-notes.md:48`).
- Do not use the flat `selector` import for 3D: the name is claimed by the 2D selector in the aggregate export (`docs/notes/physics-3d-notes.md:40-45`; `build/cocosair.module.js` exports `selector$1 as selector`, currently :161574).
