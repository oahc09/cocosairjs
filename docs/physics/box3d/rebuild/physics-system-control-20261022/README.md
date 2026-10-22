# Box3D-only PhysicsSystem assignment ordering

## Delivered scope

The actual `src/cocos/physics/framework/physics-system.ts` has 20 added lines in three methods only. The original upstream header and all existing lines remain byte-identical. The file was not wholesale formatted.

For an existing world selected as exactly `box3d`, `allowSleep` and `gravity` call the backend first and commit their public cached values only after it returns successfully. Before world construction, those two setters retain their existing staging behavior. `setDefaultPhysicsMaterial` also calls the Box3D world before changing the public material pointer. After native acceptance, replacing a different material removes only this system's callback from the previous material, commits the new pointer, and subscribes to the new material. Reassigning the same material preserves the actual EventTarget deduplication behavior.

Every non-Box3D backend executes its original statements in their original order. The tests explicitly cover builtin, Cannon, Bullet, and PhysX with mocked world setters, including their existing cache-first behavior on success and failure and their existing retained old-material listener. These tests do not claim that the native Bullet/PhysX runtimes were loaded.

## Evidence and reproduction

`physics-system-control.test.ts` directly imports and instantiates the actual `PhysicsSystem`, `PhysicsMaterial`, `Vec3`, and selector modules using the existing Jest engine environment. Actual material setters and EventTarget listeners run. The test only replaces the selector's world with three explicit mock setter functions, restoring selector state afterward. It does not copy/replace PhysicsSystem methods, initialize a real Box3D world, call `game.init`, build a runtime, or execute WASM.

- `red/`: original PhysicsSystem bytes and first formatted fixture; 8 failed, 12 passed. Seven failures concern the intended ordering change. One was a fixture error: actual `Vec3(NaN, 0, 0)` construction normalizes NaN to zero.
- `red-corrected/`: unchanged original PhysicsSystem with corrected fixture, using a subsequently assigned NaN or an `IVec3Like` record; 7 failed, 13 passed. The original failed attempt remains preserved.
- `green/`: the exact same corrected fixture against the 20-line source addition; 20 passed. Raw Jest output, command/exit receipt, focused project-target type checks, and the exact source patch are retained. The existing engine setup's “Cannot access game frame or container” warning is retained, not filtered; this fixture deliberately does not start a game.

```sh
node_modules/.bin/jest --config jest.config.js --runInBand --no-cache --testMatch '**/tools/verify/box3d/physics-system-control.test.ts'
node_modules/.bin/tsc -p tools/verify/box3d/physics-system-control.tsconfig.json --pretty false
node_modules/.bin/prettier --check tools/verify/box3d/physics-system-control.test.ts tools/verify/box3d/physics-system-control.tsconfig.json
```

The dedicated type config inherits the existing project target/library/declaration settings through the earlier world-control config. It adds no permissive replacement declarations. Source hashes bind the named directly relevant inputs, not a complete transitive engine, package, or WASM closure.

## Explicit non-transactional boundaries

This checkpoint is not C36 completion or a full native-plus-JavaScript rollback transaction:

1. `gravity` still returns its mutable cached `Vec3`. A caller can mutate that object before passing it back into a rejected setter. The setter cannot recover a value already changed through the alias. The test demonstrates this remaining boundary rather than silently changing the getter API.
2. Actual `PhysicsMaterial` field setters and `setValues` change their own fields before emitting `EVENT_UPDATE`. `_updateMaterial` forwards the current material to the world. A rejected update does not restore the already-mutated material object. The test preserves this distinction between the public material and a last accepted mocked native value.
3. `resetConfiguration` still writes several caches directly before calling native gravity and sleep setters. A failure can leave those caches partially changed. No reset, timing-validation, collision-matrix, or initialization transaction was added.
4. Listener transfer assumes the normal unmodified EventTarget `on`/`off` contract for valid arguments. A deliberate `material.on` exception is tested: the new native material and public pointer have already committed, but the listener is absent. The error propagates and no rollback is claimed. Arbitrarily overridden/throwing event methods are not made transactional.
5. A backend setter may mutate native state before throwing. This change only delays public-cache commit; it cannot undo such native work. The AIR world layer must continue to fault-latch uncertain or partially failed native operations. No success is inferred from method presence or from these mocks.

No feature/prepare/world/native/facade file or public registration was changed. Actual WASM setters, real PhysicsSystem startup, fixed-tick stepping, native debug collection/presentation, and coexistence remain separate pending qualification.

## Registration suggestions for parent review only

These shared files were not edited:

1. In `docs/upstream-file-map.json`, change only the existing `src/cocos/physics/framework/physics-system.ts` row to `modified: true`; retain its upstream path and baseline. Suggested reason:

   > AIR Box3D-only native-first allowSleep/gravity/default-material assignment ordering. Cache commits follow backend success; accepted material replacement transfers only the system update listener. Existing non-Box3D statements/order, mutable gravity/material update semantics and resetConfiguration remain unchanged. Mock-world tests execute actual engine classes; no real WASM or complete transaction acceptance is claimed.

   Recompute `meta.modifiedCount` from actual rows after merging concurrent work, rather than hard-coding a count.

2. Add a dated note near the top of `docs/UPSTREAM.md` describing the same 20-line Box3D-only deviation, the actual-class/mock-world tests, the documented alias/event/reset boundaries, and continued absence of public Box3D registration.
3. `tools/verify/verify-wasm-backends.cjs` explicitly enumerates shared drift paths in `EXPECT.driftedAllowed`. Its current list does not contain `cocos/physics/framework/physics-system.ts`; if this shared-closure gate is run on the new source, review/register that exact path with the corresponding file-map reason. Do not broaden the allowlist, waive unrelated differences, or alter closure counts on the strength of this narrow change. This checkpoint did not run or claim that broader gate.
