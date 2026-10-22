# B1 typed bridge: finite standalone checkpoint b

Status: **PASS_PURE_TYPED_BRIDGE_ONLY**. This is a new, currently unwired private adapter over the frozen B0 observer. All delegates and guards in these controls are explicitly fake; no material, World, native or complete transaction qualification follows.

Owned sources:

- `src/cocos/physics/framework/physics-material-transaction.ts`
- `tools/verify/box3d/physics-material-transaction-control.mjs`

The B0 source `physics-state-observer.ts` remains unchanged at SHA256 `4cf40c4f1be0d407a402e95dcdb7a898b1942cb175f869f6367a41b18c2d1d2b`. None of Collider, PhysicsSystem, world-command-owner, world, shared-body or box-sphere-shape has been edited in this step. No barrel exports, native inputs, lead fixtures or prior evidence were changed.

## Scope implemented

One private typed registry registers exactly one physical delegate for each actual target object. It copies callback references under B0's registration admission. `begin` returns a created wrapper without opening barriers. `prepare` uses B0 to open owner barriers before copying identity and coefficient fields. Candidate protection occurs immediately after identity is read, before shared-flag or coefficient getters.

`apply()` accepts neither a candidate nor an arbitrary execution callback. It consumes its one invocation before calling the registered delegate with the one copied/frozen bundle. Normal callback return is recorded separately from any native outcome; this module knows nothing about native completion. Actual cache commit is independently observed and checked against the expected identity, not substituted with candidate data.

Clone source is preflighted before the caller records allocation and invokes the original clone. `acceptClone` guards the returned identity before coefficient reads, validates distinct/equivalent copied data, and never calls the native delegate. Its external protection/read window, like delegate invocation, rejects nested wrapper operations without releasing barriers while the callback/getter is still on stack. Deferred rejection and subsequent errors remain in wrapper diagnostics; B0 retains terminal state, callback cleanup and original first error.

B0 remains the sole generic transaction state machine. Wrapper-local fields contain only typed prepared data, once-consumed apply/clone bookkeeping, and bounded synchronous invocation reentry observations. They grant no engine mutation authority. Actual owner fencing, actual Component/System/PhysicsMaterial identity checks, native full-ID validation, copied private native kernels, real cleanup and authoritative public-cache/listener wiring are still future integration work.

## Retained attempts

Command, replacing suffix with a or b:

`node tools/verify/box3d/physics-material-transaction-control.mjs tools/verify/box3d/physics-material-transaction-evidence-20261022-<suffix>`

- a: exit 1, 34/35 controls. Original new-source RED: clone coefficient getter caught nested dispose, allowing the fake owner barrier to be released while that getter was still executing. Source, runner, B0 dependency, raw output and failing assertion are preserved.
- b: exit 0, 36/36 controls, strict transitive TypeScript check exit 0, explicit new-file Prettier check exit 0, input hashes before/after identical. The extra control pins exact first reentry error plus a later thrown null, avoiding loss of secondary invocation failures.

The correction is confined to the clone-return protection/copy window and diagnostic retention. The a result is not relabeled or overwritten. There are no physical PASS claims.

## Remaining product integration

Use the revised `material-identity-b1-plan-20261022-b` as the plan: original public default material setter and observed delegate must share a copied kernel that faults after native mutation entry without automatic reverse writes. The original three material REDs and the later readback/replay RED require new current-source actual-WASM outputs after wiring; these standalone controls do not replace them.

This checkpoint is frozen for parent review and preservation before changing the six existing product files. `owned-files.json` excludes the final manifest/receipt themselves and excludes parent-owned files. `receipt.json` records exact source hashes and attempt identities.
