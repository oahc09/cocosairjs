# Material identity and pause seams after checkpoint 27

Status: **READ_ONLY_PROPOSAL_NOT_IMPLEMENTED**. Fixed source: commit `0def94d0dc3a0ceedf1120145ec84705694312b2`. No working-tree product file was used as this review's source, and no product/native/old evidence was changed. The currently active four-component early-guard work is intentionally outside this frozen review.

`source-manifest.json` identifies 18 complete Git blobs by SHA256. `frozen-excerpts.txt` contains the exact numbered source sections cited below. `observer-interface.proposed.d.ts` is a proposed private interface only, not a new runtime API, export, ABI or qualification result. There were no builds, tests or new WASM runs for this design.

## 1. Immediate findings and narrow next steps

1. Move authoritative **asset identity** updates from adapter/native-return time to the original Collider/System cache-and-listener commit point. Native coefficient readback and actual component asset identity are different facts. Keep native material updates where they are; do not discover identity by calling Collider.material.
2. Add one opt-in, backend-neutral **private observer registry**, with explicit operation tickets and separate preflight/success/failure/finally. Do not add fields such as `__box3dOwner`, change IPhysicsWorld into a public observer escape hatch, temporarily drop mutation/transform leases, or emit public events as owner notifications.
3. A synchronous System.enable notification can bind the owner to a real pause transition. **autoSimulation=false is manual scheduling, not pause**. Original manual System.step ignores enable, and the existing AIR step clock deliberately calls game.pause before director.tick. These are explicit compatibility decisions, not details that can be guessed from a boolean getter.
4. Material listener edits and material EVENT_UPDATE failures can happen after native or JS state changed. Fault the affected owner(s), preserve truthful phase facts and cleanup ownership, and never claim restoration just because coefficients were written back. Current native material setter does not expose the reviewed body/filter mutationOutcome contract.
5. Keep unified activation blocked until the proposed exact internal delegate authority, clone notification, pause decisions and required controls are implemented. This design does not turn the seven-source e checkpoint into a complete command transaction.

## 2. Exact source paths and current mutation order

All line numbers refer to the fixed commit, not the active worktree.

### Collider identities and subscriptions

`src/cocos/physics/framework/components/colliders/collider.ts`:

- **84–102, sharedMaterial**: getter returns `_material` without cloning. Setter writes `_material` directly under EDITOR; runtime delegates to `material`. Preserve editor/no-observer behavior, and avoid double notification in the runtime forwarding setter.
- **112–122, material getter**: if shared and non-null, existing mutation guard runs, old listener is removed, `old.clone()` runs and assigns `_material`, new listener is added, then `_isSharedMaterial=false`. No shape adapter method is invoked. Therefore A's owner still knows the old asset even after the actual cache/listener now point at the clone.
- **124–149, material setter**: Box3D delegates `_shape.setMaterial(value)` first. Listener/cache changes follow. The non-null branch compares material **id**, not object identity. Exact order differs by branch: old/new non-null does off→on→shared=false→cache; null→asset does on→cache; asset→null does off→cache; no shape writes cache only. An exception at off/on can leave native committed with old or partially changed JS state. Same-object assignment can reapply native coefficients without changing identity; different objects with equal/tampered ids must not be mistaken for one owner identity.
- **435–444, onLoad**: creates and initializes the actual shape, calls shape.onLoad, then subscribes the initial material. A currently marks the component complete during shape.initialize, before the last listener operation can fail. Observer initialization must close this late failure path.
- **458–471, onDestroy/\_updateMaterial**: flags cleared→shape.updateEventListener→asset.off→shape.onDestroy; off failure can currently prevent adapter/native cleanup. `_updateMaterial` invokes shape.setMaterial using the already-current `_material` after the asset emits its update.

`src/air/physics/box3d/box-sphere-shape.ts:146–153` currently updates native coefficients (if active), then immediately calls `body.observeMaterial(this,value)`, then changes its own copied geometry. That observation is only an adapter input, not proof that the Collider cache or its listener committed. Disabled colliders still own an actual material identity and must remain in the observer/fence roster.

### System default material

`src/cocos/physics/framework/physics-system.ts`:

- **229–249, setDefaultPhysicsMaterial**: Box3D world setter first; old asset off if identity changes; `_material=material`; new asset on. Thus an on failure is _after cache assignment_ here, unlike Collider's non-null setter branch.
- **252–279, initDefaultMaterial**: asynchronous loading eventually invokes the same setter. Initialization before any default asset exists must be supported. Failures can trigger the builtin fallback; an already-faulted native owner cannot silently accept the fallback as a clean second transaction.
- **910–912, \_updateMaterial**: coefficient propagation only. It is not an identity change and must not generate a synthetic material-replacement commit.
- **944–954, construction**: `_instance` is assigned, resetConfiguration runs, then the default world is constructed. Observer registration cannot reject normal pre-world bootstrap configuration. The owner may register its System observer when the actual world is acquired; verify the owned-world identity at the existing delayed safe point.

`src/air/physics/box3d/world.ts:229–274` updates inherited shapes with rollback attempts, stores coefficient values, then observes the supplied asset before System finishes its JS cache/listener work. Replace that _authoritative identity_ observation with a private pending/native-material fact; only the System's confirmed cache commit updates the identity roster. Direct low-level world.setDefaultMaterial may copy coefficients without changing System.defaultMaterial, so its argument alone is never proof of System cache identity.

### Asset values and shared ownership

`src/cocos/physics/framework/assets/physics-material.ts:69–135,204–212`: each scalar setter writes before synchronous EVENT_UPDATE; setValues writes all four values then emits. `math.equals` scalar behavior and exact-comparison setValues behavior differ and must remain unchanged on unobserved paths. Asset clone at **166–172** creates and registers a new asset and copies private values; allocation/id/allMaterials effects already exist even when a later Collider commit fails. Asset destroy at **182–191** enters super.destroy before removing allMaterials membership.

One asset can be used by several colliders and as System default. A listener can fail after earlier native owners have applied values. Preflight must inspect the full private owner set before the first write. This is not a cross-world native atomic material transaction; unknown or partial delivery faults all affected worlds. No blanket C36 success follows.

The frozen facade material setter at `binding/facade.mjs:1291–1304` uses **exclusive**, not the reviewed body/filter `mutate` wrapper. A status/throw at this entry does not automatically carry mutationOutcome. Successful return proves that that setter returned after native status success and changed(world); a subsequent readback/JS listener failure must not be called not-mutated. An exception from the setter itself remains conservatively unknown unless separately established at an actual reviewed call site. Do not infer phase from `ARGUMENT`, `NATIVE`, or a candidate input.

## 3. Proposed private observer mechanism

Suggested new backend-neutral file: `src/cocos/physics/framework/physics-state-observer.ts`. It imports no AIR, binding, native module or global-world resolver. It is not exported from package entrypoints. Exact proposed signatures are in the adjacent design-only declaration file.

### Registry and tickets

- WeakMap keyed by the **actual target object**, containing independent owner leases. Distinct worlds can observe the same asset; releasing one does not release another. Owner keeps its own explicit enumerable records for deterministic teardown; WeakMap is not a cleanup strategy.
- Registration copies function references once. Reject invalid/accessor-throwing or reentrant registration without partial installation. Neither untrusted user callback nor executable error-factory registration is accepted as an advertised public API. These are trusted engine integration callbacks, unlike the data-only mutation-guard rejection descriptor.
- `beginPhysicsStateChange` is called after the existing earliest mutation guard but before candidate getter/clone/listener/delegate work. No observers means immediate undefined and the exact original path, with no extra candidate reads or numeric normalization. The already-existing source reads of private fields are not replaced by Collider.material or System getters that may have user overrides.
- Freeze the original observer identities, generations and liveness before opening attempts. Opening an observer installs its private phase and the necessary short-lived owner fences using already-held identities. It performs no native/configuration mutation. On failure, dispose every already-opened attempt independently.
- Candidate copying is once-only under those fences. Recheck the entire registration set after any getter/clone boundary; owner removal/addition/replacement invalidates admission before delegated/native mutation. Retain the first error identity, including `undefined`, `null`, `0`, and record later cleanup errors separately.
- Ticket is module-private identity-bound, one operation, one target/generation and single-consumption. Copied/fabricated/old/cross-owner tickets fail without changing current ownership. Methods are closures/validated capabilities, never authority inferred from a public field name.
- `preflight(candidate)` does all-owner pure validation and reserves any registration/refcount/queue update capacity. It does not change accepted asset identity, listener tables, queue, native state or counters. A failure here leaves those states alone.
- `effect(...)` records only direct engine facts: clone/delegate/listener/emit entry and return, or raw cache write. **Delegate return is not automatically native mutation**: disabled colliders and empty inherited-shape sets may only update copied coefficients. The AIR owner separately retains its native outcome facts.
- `commit(actual)` receives a copied snapshot built from the **actual private cache after the successful original operations**, not the candidate argument. It atomically installs the owner's identity/subscription metadata. If one observer commit unexpectedly fails after another committed, notify/fault all affected observers and do not guess rollback.
- `fail` notifies every opened observer even if one fault handler throws. It records the effects and an optional best-effort actual cache snapshot; readback failure itself is recorded, not replaced with candidate data. Caller rethrows the original error unchanged. `dispose` releases each temporary lease in its own finally, never other owners' persistent grants.

### Exact internal material delegate authority is necessary

Holding an owner barrier cannot simply set owner.phase back to idle for `_shape.setMaterial` or `world.setDefaultMaterial`. Those paths currently call normal configuration admission. The next integration must provide a private, one-use, exact delegate ticket bound to actual System/Collider, adapter, generation, operation and copied candidate. The original engine callsite enters that delegate; the AIR owner consumes only the matching authorization. Listener/user reentry remains fenced. No global bypass and no temporary unregistration.

This ticket is **not** the public observer interface or a native token. It must not escape through `impl`, Component fields, app options, callback contexts, material event payloads or returned diagnostics. Direct low-level adapter material calls outside an original component transaction can still update copied coefficients under their existing contract, but cannot commit a fabricated component/System asset identity.

`PhysicsMaterial.EVENT_UPDATE` propagation to multiple internal subscribers needs a separately reviewed trusted-dispatch admission for those exact registered adapters. A generic “material event is running” flag is not enough. Until that path is implemented, the identity observer can be qualified in a smaller checkpoint while full material/command activation remains blocked.

## 4. Original callsite ordering and failure classification

### Collider material replacement

1. Existing guard at entry; begin ticket with old `_material` and `_isSharedMaterial`.
2. Capture candidate identity and four coefficient values once; validate actual PhysicsMaterial/null, supported values and every private affected owner before native work. Different actual objects with colliding ids must either be rejected before delegation or use an explicitly reviewed Box3D-only object-identity replacement branch. Do not let old id comparison silently report the supplied asset as committed.
3. Delegate the original shape material update once under exact private authorization. Record delegate return separately from native effects.
4. Execute original subscription/cache order. Mark listener entry **before** off/on, cache-written immediately after each private assignment. No user callback/observable cache getter is used to construct owner notification.
5. On full success, commit `{material: this._material, shared: this._isSharedMaterial}`. Only now move the authoritative asset refcount from old to new. Preserve the old and candidate references until success.
6. On any post-effect failure, fault affected owner(s). Retain old/candidate/observed identities as unresolved cleanup records; do not declare new subscription or old subscription restored. Native values restored by an existing rollback attempt do not prove contact history/snapshot rollback. Clear those unresolved records only after their independent JS/native cleanup outcome is known.

### Collider cloning getter

The public getter is a mutation only on its cloning branch. Read-only noncloning return retains the old fast path. Under an observed clone branch:

- Begin before old.off/clone; preflight original owner and old asset before allocation.
- Prefer a narrow observed-only ordering that allocates/copies the candidate **before removing old subscription**. Other backend/no-observer branch stays byte-equivalent in behavior. This reduces an allocation failure's damage, but clone allocation still changes asset counters/allMaterials and must be recorded as an effect.
- After actual clone returns, validate/reserve observation of that real new object before publishing `_material`; protect it continuously through commit. Native values are not rewritten merely to repair tracking: cloning equal coefficients is initially an identity/subscription change.
- Complete off/cache/on/shared-state operations and then commit actual private identity. An on failure after publication is a committed JS identity failure even when native coefficients never changed; fault, retain truthful identities, and do not relabel “native rollback success.”
- Clean up a clone only when this attempt is known to have exclusively created and not successfully published/transferred it. Failed or throwing clone overrides have no inferred allocation rollback. Original method overrides and arbitrary JS are not sandboxed.

### Initial and terminal Collider lifecycle

Adapter acquisition should install a **pending initialization** identity record. Original Collider.onLoad must notify completion only after the actual material listener attachment returns. Its catch must notify an already-registered owner of failure without losing the original exception. Native allocation may already exist, so a listener failure cannot silently delete the owner.

Destroy uses separate guarded cleanup stages: clear supported event state; attempt actual material off; always attempt adapter cleanup in finally; notify subscription removal only when known, and keep failed JS subscription ownership separate from unresolved native body ownership. No faulted native replay. This extends, rather than bypasses, checkpoint A's cleanup-only paths. Repeated teardown must be idempotent and must not remove another collider's subscription to a shared asset.

### Default material and asset values

Default replacement follows System's original native-first→old off→cache→new on order, with cache notification **after on succeeds**. On throw after native return, world faults and both native effect and observed System cache state are retained. During initial default setup, a fallback setter must not revive a faulted owner.

For asset coefficient writes, all registered owners preflight the proposed **full four-value tuple** before any private coefficient write. Cache-written is marked before EVENT_UPDATE. A throwing internal/user listener can leave the asset and earlier subscribers changed; notify/fault the full original owner set, leave the actual asset values visible, and forbid subsequent stepping/replay. This is truthful partial-commit handling, not a native all-owner rollback guarantee. A shared material with builtin/Cannon observers must not have those owners silently skipped or globally reset.

### Failure state table

| Known point                                               | Required observation                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Guard/open/preflight refusal before any effect            | Accepted identity/listeners/native state unchanged; release provisional leases; preserve original failure.                                |
| Clone allocation entered, not returned                    | Asset allocation effects may be unknown; no claim of complete JS rollback. Native unaffected only if no delegate ran.                     |
| Delegate entered and throws                               | AIR uses its actual native fact if known; otherwise unknown. Material facade codes do not prove not-mutated.                              |
| Delegate returned, later off/on/cache observation fails   | Delegate completion retained; known native commits remain committed. Fault; do not replay delegate or pretend candidate cache is actual.  |
| Coefficient cache written, listener later fails           | JS committed; earlier native subscribers may have changed. Fault all affected observers; retain values and failures.                      |
| Cache/listeners complete, owner commit notification fails | Public change already committed; fault all affected owner records; no undo claim.                                                         |
| Any finally cleanup failure                               | Preserve primary error; report cleanup error and retained identities independently. Never certify leases/resources zero without evidence. |

## 5. Pause and scheduling: precise distinctions

### Source behavior at checkpoint 27

- System.enable at **109–112** only guards then assigns `_enable`; there is no owner notification.
- autoSimulation at **218–221** only assigns scheduling policy.
- postUpdate at **377–409** checks enable once. Disabled means scene-sync-only return. Enabled/automatic means add deltaTime to the original accumulator, emit BEFORE_PHYSICS, then run the existing fixed-step loop and emit AFTER_PHYSICS. No second enable check occurs after BEFORE_PHYSICS or between loop iterations.
- System.step at **474–477** delegates directly regardless of enable or autoSimulation. It does not emit the full before/after event cycle or reset/decrement the accumulator.
- resetConfiguration at **419–452** writes several caches directly, invokes autoSimulation setter partway, and later mutates native gravity/sleep. It is not a composite transaction and has no overall rollback. resetAccumulator is explicit and independent.
- `command-queue.ts:454–461` has pause/resume, but pause changes pending/phase immediately. `command-producers.ts:280–287` disables continuous entries and marks paused; resume does not enable them. Those two calls are not yet one prepared atomic owner transition.
- `game.ts:591–608` sets `_paused` and pacer state before public pause/resume events. `air/step-clock.ts:101–121` intentionally calls game.pause, then manually drives director.tick. Therefore simply listening to GAME_PAUSE or reading game.isPaused as command admission would break the existing deterministic driver.

### Recommended minimal System observer

Observe actual System with `system-enable` and `system-auto-simulation` operations. Snapshot both booleans from private fields. With no observer preserve legacy assignments. With active Box3D owner validate exact booleans before write. No new RAF/accumulator and no implicit resetAccumulator.

`enable true→false` should be proposed as **physics-owner pause**: synchronously clear pending user commands/target intents, suspend hooks and disable continuous producers before returning from the setter. Preserve target ownership/protected paired-zero obligations; clearing a queue is not proof that native target velocities are zero. Resume must never release target protection before a known safe zero/intent commit. `false→true` resumes eligibility only; continuous handles require explicit enable, hooks retain their configured enabled state. Repeated assignments remain harmless outside a transaction; protected same-value assignments still reject at the earliest guard.

Preparation validates all queue/producer/owner phases before changing any accepted queue or public cache and reserves replacement state. A small private prepared-pause transition (queue + producers) is required; calling queue.pause followed by producer.pause without that preparation can leave a partial JS transition if the second call rejects. In the commit body, System writes its private cache and the trusted owner commits prepared metadata synchronously without user callbacks. An unexpected commit exception after either write is a committed/partial JS failure: fault, record both states, never claim the old cache/queue was restored. Do not call producer's current owner admission under an already-closed public config phase and then call that failure “impossible.”

`autoSimulation true→false` is **manual scheduling only**: retain queue/targets/producer configuration and owner-unpaused state when enable is true. Explicit manual steps consume the same queue/roster once per successful fixed tick. Merely toggling the value or running scene sync consumes nothing. `resetConfiguration` must not incidentally clear queues because it forwards autoSimulation; it remains an explicitly non-transactional configuration path until separately repaired.

### Decisions still requiring lead freeze

1. **Manual step with enable=false:** old Cocos still advances. Recommended unified-owner interpretation is refusal before native/queue consumption while physics-owner-paused, with manual stepping available via enable=true + autoSimulation=false. This is a deliberate Box3D-owned compatibility change and must be frozen/tested, not presented as an already-existing contract. An alternative paused diagnostic-step mode would require its own explicit consumption/target-zero policy, not an unreviewed bypass.
2. **Game/pacer pause versus application semantic pause:** do not infer one from the other. A later T12 integration needs an explicit private lifecycle reason/clock-mode seam. createStepClock is intentionally pacer-paused yet manually executable. Scene release/app.close have separate teardown ownership and must never be modeled as a resumable System toggle.
3. **BEFORE_PHYSICS pause:** immediately notifying the owner exposes the existing loop's stale enable check. Add only an observed-Box3D branch that rechecks pause after BEFORE_PHYSICS and before every actual fixed tick. Skip/break tick work while retaining already-added accumulator time; do not reset or discard it. Preserve the original AFTER_PHYSICS event behavior unless a callback itself threw. Pause inside an active Box3D collection/writeback/dispatch continues to refuse before changing cache.
4. **Resume and accumulator:** retain preexisting remainder/backlog and maxSubSteps limits. Do not silently make pause/resume a time-reset feature. Native target zero obligations settle before the next admitted solver step, not by a fake paused step or direct Node write.

These choices cannot be solved solely with an observer callback reading System.enable at world.step; that misses immediate cancellation/continuous suspension and the already-modified automatic accumulator.

## 6. Listener dispatch and current unsupported events

The stale Collider.once TODO is not authoritative. Actual frozen source does:

- Eventify.once (**163–165**) invokes `this.on(...,true)`; Collider.once additionally calls `_updateNeedEvent` after super.once returns.
- CallbacksInvoker.emit (**329–364**) calls `this.off` **before** invoking a once callback and when removing an invalid target. For Collider, that reaches its override and `_updateNeedEvent`; it is not a guaranteed raw internal removal bypass.
- CallbacksInvoker.off (**300–316**) can invoke `_offCallback`. An assumed “off cannot execute other code” is not a correct general premise.
- Eventify.targetOff (**167–169**) forwards this.removeAll. removeAll/clear/off/once/on/manual emit are distinct mutable or dispatch entries; guarding only Collider.on is incomplete.

Do not blanket-block all off calls during authorized event dispatch: it would stop legitimate once consumption before the callback executes. If future event support is activated, authorize only the exact internal removal (target/event key/callback/thisArg/dispatch generation), consume a single-use ticket before any callback, and keep public/off/recursive emit attempts fenced. Internal listener cleanup does not authorize a native collider reconfiguration during dispatch; defer supported subscription-need reconciliation to a separately defined safe point, or keep dispatch unsupported.

At checkpoint 27, AIR shape initialization/update explicitly rejects requested contact/trigger events and world.emitEvents only clears bookkeeping. **Do not add fake dispatch grants or treat manual Collider.emit as native event qualification.** Registration currently mutates callback tables before the adapter's late unsupported rejection; a future narrow event-admission patch must reject unsupported nonempty on/once _before_ super.on changes anything. Cleanup of already-known empty listeners can remain separate and must not be described as event support.

PhysicsMaterial.EVENT_UPDATE is a different, already-used propagation event. It needs private owned-subscription integrity and authorized internal propagation without exposing native tokens. Public `material.off/removeAll/targetOff/clear` can remove internal update subscriptions today. Options must be frozen: protect the exact owned subscription through a dedicated private listener guard/ticket, or move Box3D coefficient propagation to a separate private observer lane while preserving public EVENT_UPDATE for users and old backends. The latter changes observable listener organization; neither option may be introduced silently. A broad global EventTarget bypass is rejected.

## 7. Ordered implementation scope for separate small checkpoints

| Stage                         | Exact candidate files                                                                                                                 | Mandatory exit condition                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0 private observer primitive | new `src/cocos/physics/framework/physics-state-observer.ts`; new focused controls                                                     | Stable multi-owner roster, copied inputs, no-listener fast path, ticket identity, complete failure/finally behavior. No World activation.                       |
| B1 identity commit wiring     | Collider and PhysicsSystem only after current Stage A owner releases them; AIR world-command-owner/world/shared-body/box-sphere-shape | Actual cache/clone/onLoad completion observation; exact delegate ticket; old/new unresolved identity retention; actual engine RED→GREEN. No command consumer.   |
| B2 pause seam                 | PhysicsSystem; AIR owner/queue/producers; optionally new pure prepared-transition helper                                              | Lead freezes manual enable=false and pacer distinction; all queue/producers transitions prepared; automatic event-boundary check; no accumulator reset.         |
| B3 asset and subscriptions    | PhysicsMaterial, Collider/System subscription sites; exact event primitive only after separate review                                 | All shared owners preflight, post-cache listener failure faults honestly, dispatch/once/off integrity resolved. No unsupported collision event success.         |
| Later consumer activation     | Separate approved command/wire/world scope                                                                                            | Current-schema real WASM integration plus all remaining early-entry/grant-capacity/native ownership gates. No formal cells relabeled by these smaller controls. |

Metadata/UPSTREAM/file-map edits remain the lead's responsibility. No shared source author should edit the same Collider/System file concurrently. The 50 frozen native inputs are not needed for B0/B1 source-only changes; any new material-phase native bridge would be a separately owned/source-identified increment, not a patch to the frozen N4 qualification.

## 8. Required negative and positive controls before activation

Use original engine entrypoints, first actual-source controls and then new current-WASM fixtures with source hashes. An injected throw is always labeled artificial; preserve all prior raw failures.

1. No observers: builtin/Cannon clone/setter/event/pause behavior and event order remain original.
2. Clone getter: old/new/cache identity, shared flag, listener target, asset allocation count and native call count; clone stays guarded in a later real callback; sharedMaterial read never clones.
3. Clone throws before return; clone returns then on throws; off throws; callback/readback throws undefined/null/0; retained identities and cleanup errors remain exact.
4. Default material native returns then old.off/new.on throws. Record actual System cache at each branch; never substitute candidate. Initial listener failure after shape.initialize faults the registered world and cleans with the true resource owner.
5. Same object assignment; distinct normal objects; deliberately colliding id objects; null branches; no-shape and disabled-collider cases. Ownership uses object identity, never id alone.
6. One asset on two colliders plus System default; another owner still using old asset after replacement; disposing one observer does not remove the other's guard/subscription.
7. Getter/observer reentry adds/disposes/replaces an owner; all original/current roster checks fail before delegate when appropriate, first error retained, all provisional leases released.
8. Callback attempts nested config/step/queue submission while a material transition is incomplete. Exact authorized internal delegate works once; guessed/public/recursive operation does not inherit its permit.
9. Material coefficients invalid for a later owner: zero writes to all native owners. Post-first-subscriber injected failure: asset cache and earlier native commit remain visible in diagnostics, all affected worlds fault, no command replay or fake rollback.
10. Public subscription removal cannot silently detach the protected physics update path. Test exact on/off/once/removeAll/targetOff/clear, invalid-target auto-off, manual/recursive emit and internal once removal using actual CallbacksInvoker source.
11. Unsupported collider event registration refuses before callback table/need flags/native effects; current bookkeeping is not reported as contact dispatch success.
12. enable=false immediately clears accepted user queue, leaves protected zero obligations/target leases, disables continuous handles and preserves hook configuration; resume does not re-enable continuous. Paused submission rejects without sequence change.
13. autoSimulation=false retains queue/targets and runs no producer until manual step; every explicit step reaches the same consumer once. Extra Cannon accumulator arguments still reject.
14. BEFORE_PHYSICS enable=false: zero solver calls after the transition; original accumulated delta retained; AFTER event behavior pinned. Catch-up tick pause is not a second accumulator.
15. Manual step while disabled matches the newly frozen decision, not assumptions; game.pause+createStepClock still works under its explicitly selected scheduling semantics.
16. Inject failure between prepared queue/producer commits and after public enable cache write: fault/partial-state report, no silent queue restoration; no successful future replay.
17. Faulted/destroy-failed material and observer teardown releases JS leases/listeners independently, preserves unresolved native bodies, repeated disposal does not resurrect ownership, and actual app.close resource receipts remain separate.
18. Bound private counters/exhaustion and multiple persistent target grants remain separately qualified; pause/material identity fixes do not bypass or consume those grants.
