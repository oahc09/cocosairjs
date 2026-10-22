# j2 actual 2D/3D coexistence result

## Result

`PASS_LIMITED_NODE_COEXIST`: all nine separate official Node v24.19.0 processes exited normally with code 0. Six ordinary scenarios passed their limited assertions; three injected failure paths separately returned `EXPECTED_REJECTION`. Collection ran from 2026-10-22T08:19:48.997Z to 08:23:53.383Z. All named inputs remained unchanged, and both native dependencies were requalified after collection.

Root receipt SHA-256: `3a5644d3aa5bc3e02dc2329d16b3a09e2a15bc25df0b697acafa19638e8be256`.

| Fresh-process scenario              | Status                    | Actual optional-native activity                                                              |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| Both WASM backends                  | PASS_LIMITED_NODE_COEXIST | One world and 60 system-originated steps per backend, then one destruction each              |
| 2D fetch returns 503                | EXPECTED_REJECTION        | No module/world acquired; 3D never requested                                                 |
| 3D fetch returns 503                | EXPECTED_REJECTION        | Actual 2D module/lease acquired then released; neither world created                         |
| Real post-subsystem callback throws | EXPECTED_REJECTION        | Both real worlds created during actual `game.init`, then both destroyed by bootstrap cleanup |
| Box3D + legacy 2D                   | PASS_LIMITED_NODE_COEXIST | 3D world/60 steps/destruction; Box2D-v3 resources not requested                              |
| Box2D-v3 + builtin 3D               | PASS_LIMITED_NODE_COEXIST | 2D world/60 steps/destruction; Box3D resources not requested                                 |
| Box2D-v3 + Cannon 3D                | PASS_LIMITED_NODE_COEXIST | 2D world/60 steps/destruction; real Cannon SharedBody also advances through PhysicsSystem    |
| Default builtin + legacy 2D         | PASS_LIMITED_NODE_COEXIST | Neither optional WASM requested or instantiated                                              |
| Cannon + legacy 2D                  | PASS_LIMITED_NODE_COEXIST | Neither optional WASM requested or instantiated; real Cannon SharedBody advances             |

The aggregate status is not complete T09 or complete B3-U01 acceptance. The nine-case inventory is exact; negative paths are not labelled successful initialization.

## Native effects and isolation

In the dual-WASM case the real low-level 2D body starts at y=20 and reaches y=17.991666793823242 with vy=-3.9999969005584717 after 60 actual `PhysicsSystem2D.step(1/60)` calls under -4 m/s². The real 3D body reaches y=16.98749542236328 with vy=-6.000013828277588 after 60 actual `PhysicsSystem.step(1/60)` calls under -6 m/s². Each 3D step leaves the 2D body state exactly unchanged; each 2D step leaves the 3D body snapshot exactly unchanged. Native 3D completed-step index and recorded step calls both equal 60. The 2D count comes from transparent forwarding of the real native step function, not a fabricated native diagnostic.

Both systems' actual disabled and nonautomatic `postUpdate` paths add no native steps. No app scene loop, extra accumulator, RAF or direct native step call drives the fixture.

Cannon controls use the actual `CannonWorld.getSharedBody`/`CannonSharedBody` registration, with a real node/body/sphere. This matters because the original Cannon world skips stepping if its registered shared-body list is empty. The fixture neither inserts a dummy body nor bypasses `PhysicsSystem.step`. Both Cannon cases finish at y=16.95 with vy=-5.999999999999995 and release their fixture-owned shared body before app close. Builtin is the real collision-only world, but its coverage here is startup, setters and empty-world stepping, not collision-component qualification. The real legacy 2D wrapper is also imported and constructed, rather than tolerating the earlier missing-2D-module error.

Actual concurrent equivalent `createAirApp` calls return the same pending promise. Repeated ready requests return the same app. Different canvas and configuration requests reject with their respective existing admission errors. Repeated close returns the same receipt; another create after close rejects. After each admitted failure, a repeat create requires document reload and causes no additional native activity.

## Ownership and failure evidence

The 2D transport failure leaves the preparation acquisition list empty and the 3D loader idle. The 3D transport failure releases only the acquired 2D application lease; its 3D loader remains truthfully `FAILED`, not falsely `DISPOSED` for a module never acquired. The post-subsystem failure is the exact error thrown by a callback on the real `Game.EVENT_POST_SUBSYSTEM_INIT`; real `director.init` already constructed both worlds. Bootstrap preserves that original error and releases 3D world/module then the 2D lease/world.

For all acquired Box3D worlds, app/bootstrap ownership performs one native destruction and one binding disposal. Core bytes return to the recorded initial baseline and all independent bridge-cache counters are zero. No fallback fixture cleanup was needed. All observation-error arrays are empty.

For Box2D-v3, actual native world destruction returns successfully, and the source lease/module diagnostics report zero leases/pending acquisitions, no direct pin, no retained module reference and no cleanup failure. There is no explicit 2D module heap destructor or global live-byte getter. The observation fixture still holds its real module reference until the child exits, so neither immediate WASM heap reclamation nor total process memory returning to zero is claimed. Legacy runtime/scheduler/world/cache retention follows existing app semantics and is not reclassified as released by this result.

Raw stdout/stderr are retained. Normal initialization still emits the existing HEADLESS container warning; the earlier `PhysicsSystem2D` missing-module error is absent. No diagnostics were suppressed to obtain passing assertions.

## Source, factory seam and artifact closure

The [pre-execution boundary](../world-real-wasm-coexist-plan-20261022.md) fixes the narrow import/transport seams. Actual AIR bootstrap, 2D acquire/lease/world, 3D preparation/world and both original PhysicsSystems execute unchanged. The exact selected `air-box2d.mjs` file URL maps to a factory-export shim because Jest transforms TypeScript dynamic import into CommonJS module resolution. That shim forwards the call to the actual generated ESM factory loaded by native Node. A bounded fetch adapter supplies the matching real WASM. Observation wrappers only record native create/step/destroy calls while preserving original call arguments, receiver, values and exceptions. All physics readbacks remain native.

Box2D 3.2.0 source commit is `178495ba35695aefe9c321e569d2277f06db3b90`. Its complete vendored source inventory, source-manifest hash, five bridge/build inputs and three published artifacts match the current receipt. The runtime receipt SHA-256 is `5540911a20a2c624629de1c6f155c43a6cf8e28c91fa0cb6f4cabfb54dfcfbf4`; WASM SHA-256 is `3391e2ace476adba36297ff8ce66766a0a09d9365caec8079b6843d1dd4219ec`.

Box3D uses the separately built j2 release candidate, 29 current build inputs, ABI 1 and `st-simd`. WASM SHA-256 is `b9b80482121b261303904485eb40bdcc4ea3c5016c83f1cb5ccbe3c29e7f753c`; schema SHA-256 is `1ceb8425e1e9c4d7c2752bd2dfe7315cd383ef7f3b44f1afbc62a6a47705d81c`. Original native build evidence was not overwritten.

Each raw file retains named-source hashes before/after, qualifications, transport observations, real native calls, checkpoints and cleanup. This scope is not all transitive engine/package files. The collector introduces eight new files, listed in `source-files.sha256` and preserved in `collector-sources.tar`; [static checks](../world-real-wasm-coexist-static-20261022-b/receipt.json) passed formatting, focused tsc and six JS syntax checks on the exact same bytes. The earlier seven world collector files remain unchanged.

## Preserved earlier attempts

- `../world-real-wasm-coexist-static-20261022-a/`: initial type failures and source archive, involving missing existing B2 ambient declaration and an incorrect Cannon removal method name in the new fixture.
- `../world-real-wasm-coexist-j2-20261022-a/`: real dual-world startup/cleanup, but FAIL because the new test expected `AIR_E_APP_CONFLICT` for a different canvas. Actual normalization correctly returned `AIR_E_CANVAS_CONFLICT`. Source archive and the subsequent type-failure receipt are retained.
- `../world-real-wasm-coexist-j2-20261022-b/`: first successful dual-WASM case with corrected fixture, not a full nine-case run.

Only the new collector was corrected. No product, native, facade, 2D dependency, public feature or original world collector bytes were changed by this task.

## Remaining boundaries and next ownership

This is Node/JSDOM source execution, not browser/GPU/CSP/HTTP, a newly built runtime feature, tarball acceptance, rendered debug or full component/event/query coverage. The separate [j2 raw-body input probe](../body-input-probe-20261022-j2/) records an untyped `createBody.enableSleep` validation gap; this typed positive fixture does not qualify those invalid inputs. Material/gravity/event alias transactions, post-native-step failure injection, all retry/late-arrival combinations and full old-backend component regressions are not newly certified here.

Public Box3D feature activation is still absent. The integrator owns the next `feature.ts` change, selected runtime/declaration build, fresh import/resource regression and exact upstream bookkeeping. Native/body validation changes belong to the native/facade owner and require a fresh artifact plus rerun; j2 receipts cannot be relabelled current after such changes. No public token accessor or fake supported component should be introduced for activation.

## Commands

```sh
node tools/verify/box3d/coexist-real-wasm.mjs \
  tools/physics/box3d/output/world-wasm-release-20261022-j2 \
  <new-evidence-directory>
node_modules/.bin/tsc -p tools/verify/box3d/coexist-real-wasm.tsconfig.json --pretty false
```

An optional final scenario name restricts diagnostic execution to one fresh case; the receipt records the actual case inventory and such a result cannot replace this nine-case batch. Every output directory must be new. `case-summary.json` is derived from retained raw files, not a second test oracle. `files.sha256` lists the closed evidence directory, excluding itself.
