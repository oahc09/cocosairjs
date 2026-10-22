# B1 material identity: exact private delegate proposal

**Read-only implementation plan, not implemented or qualified.** This b revision supersedes a's unsafe retention of the old automatic native rollback. The a draft and receipt remain unchanged for traceability. Existing product basis: `a9be35d68f5cad1f18eca2be813f216dc04cdc4b`. B0 observer source is independently frozen at SHA256 `4cf40c4f1be0d407a402e95dcdb7a898b1942cb175f869f6367a41b18c2d1d2b`; its 76 pure controls do not fix any original product defect. No existing product, fixture, native input or prior evidence changes are proposed for this planning window.

## 1. The three existing actual-WASM REDs

Lead-owned `docs/physics/box3d/rebuild/material-original-defects-review-20261022-a/receipt.json` records:

- Clone callback: clone coefficient became .8 while original remained .3 and real native friction remained approximately .3. Owner guarded the stale original identity, not the actual cloned cache identity.
- Collider listener failure: real native friction became approximately .8, Collider cache stayed original, world stayed ready and advanced another real step.
- System default listener failure: native friction became approximately .8, System cache already held candidate, world stayed ready and advanced another real step.

The listener failures are explicitly injected JS failures following real native updates. These are not fabricated native-core defects. Existing raw receipts are referenced, never overwritten. B1 must make the last two worlds fault without replay, while retaining the different actual JS cache outcomes.

## 2. Why an outer allow flag is insufficient

The original Collider path is shape.setMaterial -> shape.assertConfiguration -> sharedBody.assert -> world.assertReady -> owner.assertConfiguration. Active updates then enter sharedBody.updateShapeMaterial -> the same world readiness admission -> world.updateMaterialShape -> assertReady again. Default material enters world.setDefaultMaterial and owner validation. All currently demand owner idle.

Opening a material observer scope then simply calling these public paths either refuses the legitimate operation, or tempts an unsafe broad exception. Do not let `assertReady` treat material phase as generally writable, do not set owner idle around the delegate, and do not unregister leases. In particular, do not set a permit before copying user asset getters.

The existing public setMaterial also calls primitiveMaterial(asset), and the default setter separately reads coefficient getters. Reusing either after observer prepare would reread the asset, potentially applying a different candidate. B1 therefore needs an internal copied-value kernel, not just an observer notification around the old public call.

## 3. Minimal private bridge and exact authority

Add a thin internal backend-neutral `src/cocos/physics/framework/physics-material-transaction.ts`. It uses B0 for roster/barrier/error lifetime and has no AIR/native import, world lookup or public barrel. It is specific to Collider/System identity replacement and clone; it does not implement shared-asset EVENT_UPDATE propagation.

Candidate is a copied/frozen record `{asset: object|null, coefficients: readonly [friction,restitution,rollingFriction,spinningFriction]|null}`. Coefficients are copied exactly once from the input asset, after all owner barriers and the new-candidate guard exist. The owner validates its supported numeric subset and normalizes native float32 values from this data only. Asset identity is retained, never frozen. Null means inheritance, resolved against the owner's already-copied default coefficients before native writes.

Proposed private functions/methods, all internal to the engine dependency graph:

- `registerPhysicsMaterialDelegate(target, delegate): PhysicsMaterialDelegateLease`. One native delegate per actual Collider/System target. Reject duplicate physical delegates, rather than silently performing native writes twice. B0 still retains its general multi-owner observer capability for later uses; B1 does not register asset-level multiple native delegates.
- `beginPhysicsMaterialChange(target, operation): PhysicsMaterialChange | undefined`, where operation is collider-set, collider-clone, collider-initialize, or system-default-set. No registration means undefined immediately and the original branch unchanged.
- Change methods: `prepare(readBeforeAndCandidate)`, `apply()`, `acceptClone(actualClone)`, `effect(fact)`, `commit(readActualCache)`, `fail(error,readActualCache?)`, `dispose()`, and copied diagnostics. All methods identity-bound to this actual change. `apply()` has **no caller-supplied execution callback or asset argument**: it invokes the one registered private delegate with the already-copied bundle. `acceptClone` is legal once, only for the clone operation after the recorded allocation attempt, and performs no native material write.
- Delegate callbacks: `open(context)`, `protectCandidate(context,asset)`, `preflightCopied(context,bundle)`, `applyCopied(context,bundle)`, `commitActual(context,actualIdentity)`, `fail(context,failure)`, `dispose(context)`. These references are copied at registration. The bridge uses B0's five callbacks, not a second independent generic observer framework. `protectCandidate` only installs an additional owner-held mutation guard and retains identity; it cannot execute native writes or accept arbitrary code.

The bridge keeps prepared bundles and lifecycle state in private closures/WeakMaps. Before/candidate/raw coefficient reads happen inside B0 prepare's reader, after every open. It stores the full copied bundle before B0 invokes owner preflight. The B0 identity snapshot intentionally remains small; coefficients never need to be reread from that identity later. A helper failure after B0 has already terminally failed rethrows the existing first error instead of attempting `ticket.fail` again and replacing it with a terminal-ticket error.

### AIR authority path, not a generic readiness override

The owner registers a closure over the actual adapter and private component record. Only after complete prepare does `apply()` enter this captured closure. The owner creates one opaque attempt authority bound to generation, active material context, actual System/Collider, adapter, exact copied bundle and operation. Authority is consumed before the first delegated mutation. Revocation occurs in finally whether native execution returns or throws.

- Shape registers a captured callback that invokes a **private** copied-material helper. No new public shape method accepts arbitrary raw pointers, native IDs or an owner token. Its normal setMaterial remains a normal configuration entry and never borrows an active material authority.
- The private shared-body path validates the exact adapter reference, live body, active shape membership and exact copied bundle/authority. It does not invoke the generic configuration admission and does not make that admission succeed for other callers.
- The private world closure validates world state ready, current real System binding, active context and the known owned full-ID shape. It enters a private copied-value native kernel. Kernel readback invokes the held binding directly, not a public read escape hatch. Existing token ownership/full-ID checks are retained.
- If implementation needs an explicit internal shared-body method rather than a #private closure, it must require the opaque authority and verify it with the owning closure/WeakMap, not just an operation string, `phase==='material'`, adapter identity or public candidate equality. That authority is never passed into the native module or exposed on impl, Component, app configuration, diagnostics or an event payload.

Extract one shared copied-value kernel for both the observer delegate and the existing public world.setDefaultMaterial path. It must NOT reuse the old reverse setter rollback. Copy/validate every candidate and full shape membership before the first native write; immediately before invoking the first native setter, mark mutation-entered and invalidate observation. With the currently reviewed material facade, a setter throw or later readback failure has no reliable not-mutated proof: fault, retain partial/unknown results, and never replay or reverse-write any shape. Successful setter returns and readback completion are recorded separately. With zero inherited shapes, only JS coefficient-copy effects occurred; do not invent native mutation. The public path and System._updateMaterial callback must enter this same safe kernel, not leave the historical rollback branch reachable. Do not leave a second path that rereads asset getters or observes asset identity from its argument. Direct low-level public world material configuration outside a System identity transaction must open its own narrow owner admission scope before asset getter copying, then use the same copied kernel. It cannot fabricate System.defaultMaterial identity. Existing ordinary shape material callbacks likewise use safe copied application, not a global owner-ready exception. Shared-asset prewrite notification remains B3, so this does not promise full rollback of an asset whose setter already changed its own cache before EVENT_UPDATE.

Every normal configuration/step entry continues to reject while owner phase is material. Committed reads may remain available during copied-input admission before writes, but public native reads during material application/JS cache reconciliation must not claim a coherent old snapshot. Internal readback is separately scoped. Set pending native observation stale before the first native setter, retain actual completion facts, and fault on uncertain post-write outcomes.

## 4. Original Cocos callsite sequence

### Collider replacement

1. Existing earliest mutation guard remains first. Detect the private material registration, otherwise preserve the original other-backend/unobserved branch.
2. Obtain a created transaction before try/finally; prepare establishes all fences. Read actual private before cache and candidate identity. Protect the candidate before its coefficient getter runs. Validate all candidate values and native shape ownership before any native write.
3. `apply()` invokes exactly one registered copied delegate. It records JS delegate entry/return, which is not automatically proof of native mutation for a disabled Collider. Native kernel outcome remains a separate owner fact.
4. Execute original listener/cache actions once, with effect entry recorded before potentially throwing off/on calls. For the observed Box3D branch use actual object identity, not an id-string collision, to determine replacement. Do not accidentally commit the supplied identity when actual cache stayed old.
5. Commit only a fresh read of the original private `_material/_isSharedMaterial` after every required listener/cache action succeeded. Owner moves its authoritative material reference now, not in shape.setMaterial.
6. On failure retain old/candidate/observed identity and coefficient facts separately. Collider's on failure can leave cache old while native/adapter copies are new. Fault, invalidate pending observation, and retain no-replay ownership. Do not run the delegate again or assert rollback.

### System default replacement

Same protocol, with the original order: native delegate -> old off -> `_material=candidate` -> new on. Consequently a new-on failure can leave actual cache candidate. Report that actual cache, fault, and preserve native coefficient outcome. The observer must not replace actual cache with old identity merely to appear transactional. Default propagation to multiple inherited shapes uses that same extracted safe kernel. Any exception after the first native mutation entry faults without automatic rewrites, even if earlier shapes are known changed. Pure full-batch validation failure before any setter may remain recoverable. Do not infer not-mutated from an error code or from body/filter mutationOutcome support; the reviewed material setter is a different path. Existing last-step completion remains truthful, while pending material observations become stale.

Initial System observer registration occurs only after real world resource ownership is established and initial world validation succeeds, before constructor returns. Do not install it in owner construction before any subsequent constructor validation can throw without cleanup. Its actual singleton/ownedWorld assertion remains deferred until the first operation because selector assignment follows construction. No observer callback runs during earlier normal System bootstrap resetConfiguration.

### Collider clone getter

B0's preflight-before-effects rule must remain true. Prepare validates the **source asset and expected copied clone coefficients** first; the clone's not-yet-created identity is not pretended to exist. Its candidate identity is explicitly the clone source, not the later actual cache identity.

Then record clone-allocation-entered and invoke the original clone operation under the active owner fences. Immediately after a clone identity is returned, retain and guard it before reading its coefficients, invoking its listener methods, or publishing it. Validate real PhysicsMaterial identity, a distinct suitable clone, and copied-equivalent coefficients; an unexpected override result fails closed after a real JS allocation effect. Arbitrary user overrides are not sandboxed or rolled back.

Only then remove the old subscription, publish the clone and subscribe the clone in the reviewed original/observed-only order. Prefer allocation before old-off in this observed branch so a clone failure cannot first detach the old asset. Commit actual clone cache identity after listener/shared-flag completion. No native material setter is required merely because identical coefficients got a new asset identity.

The new asset remains temporarily guarded throughout coefficient validation, listener/cache actions, and owner identity commit. Before that temporary guard is released, the authoritative owner roster already contains the clone for subsequent step/dispatch scopes. This does not mean all material edits outside a transaction are prohibited; normal asset propagation remains the separate B3 contract.

## 5. Initialization, teardown and unresolved state

- Existing shape.initialize marks component complete before Collider.onLoad attaches its initial listener. Change only Collider completion: attachment records a pending actual Collider/material identity; initialization becomes complete after the actual Cocos onLoad listener transaction commits. RigidBody initialization remains unchanged.
- After shape.initialize returns, start/prepare the Collider initialization transaction immediately before shape.onLoad/initial listener work. Already-allocated body ownership is retained if listener initialization fails; world faults and existing faulted component cleanup remains available.
- Observer scopes contain the actual System, all owned components including disabled Colliders, Node/prototype and known ancestor transform guards, existing materials, plus additional candidate/clone identities. Scope formation uses existing private identity lists, not material getters.
- Revoke any material authority in its own finally before releasing temporary guards. Guard/observer cleanup failures are separately retained; do not mark native body teardown confirmed because JS leases closed.
- Exact observer leases must be disposed during component/world teardown, independently of native teardown outcome. Native destroy failure still retains unresolved native body accounting. Any unresolved JS subscription cleanup retains its own evidence/identity rather than disappearing with the native record.
- Collider.onDestroy currently off can prevent shape.onDestroy. Use independent cleanup attempts for known old/current/candidate subscription identities, then adapter teardown in finally, retaining the first failure and secondary cleanup failures. A listener cleanup error is not permission to replay unknown native destruction.

## 6. Proposed ownership/file window

New narrow bridge: `src/cocos/physics/framework/physics-material-transaction.ts`.

Existing minimal engine edits, after lead grants exclusive ownership: `src/cocos/physics/framework/components/colliders/collider.ts` and `src/cocos/physics/framework/physics-system.ts`. No PhysicsMaterial coefficient setters or generic event dispatch changes in B1.

AIR: `src/air/physics/box3d/world-command-owner.ts`, `world.ts`, `shared-body.ts`, `box-sphere-shape.ts`. These install private callbacks/authority, copied kernels, authoritative commit notification and fault/cleanup accounting. If implementation needs another product file or a B0 API change, report the exact dependency before expanding scope. B0's frozen source need not change for this design.

New source controls may exercise the narrow bridge with explicit fake delegate notifications but cannot claim native qualification. The lead's existing `owner-material-real-wasm*` fixtures and three original RED directories remain unchanged; run newly qualified source against the current matching N4 artifact in new output directories after source freeze. No native rebuild is required or authorized by this plan.

## 7. Minimum exit checks and remaining B3 boundary

1. The three original real-WASM REDs become finite green under new source identities: cloned asset guarded in callback; both listener failures fault, retain actual cache difference, refuse replay, and close to the expected resource/owner counts.
2. Source controls prove one coefficient read per input field, candidate guard before getters, reentrant public setter/step refusal, exact private delegate single use, no cross-adapter/body/world authorization, and normal no-registration backend behavior unchanged.
3. Falsy primary errors and multiple cleanup failures remain available after actual callsite catch/finally. Disabled Collider identity commits without fake native setter success. Clone performs no invented native material application.
4. Initial onLoad failure after body allocation faults and cleans without prematurely initialized owner state. Default initialization/fallback never treats a faulted first native attempt as pristine retry.
5. Same/default/null materials and distinct actual object identities are tested; shared asset object identity does not grant another owner's private delegate authority.

B3 remains open: shared asset EVENT_UPDATE atomic preflight across all affected owners, protection against public subscription removal, authorized once/off dispatch cleanup, and collision/trigger event support. B1 may track current assets and reject mutations while an owner scope is active, but it does not prove complete material propagation, subscription integrity, C36, public unified activation, T12 or any formal gate cell.
