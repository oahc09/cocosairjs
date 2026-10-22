# Collider automatic-retirement contract review

Status: BLOCKED_UNINTEGRATED_CANDIDATE. Read-only source/contract review; no new runtime test, product change, old-test edit, build, Git action or Gate promotion.

## 1. Finding

No inspected v1.2 or frozen supplement authorizes preventing a legitimately registered once listener from firing by rejecting its automatic removal. No clause requires invalid-target auto-retirement to abort an otherwise valid dispatch either. Public mutation admission and dispatcher-owned completion of an existing subscription are different operations.

The prior 261-case GREEN is still an accurate record of those assertions, but it is not a valid preservation claim for once lifecycle semantics. Eight rows explicitly require once/invalid-target automatic off to reject across the four owner scopes. That expectation was not supported by the frozen contract. Keep the raw records unchanged, label the candidate unintegrated and blocked, and add separate future tests with the correct lifecycle expectations. Do not relabel or overwrite those old rows.

## 2. Exact sources

All referenced product/contract files are copied under inputs with SHA-256 in inputs-manifest.json. full-contract-search.json records scanning all 1,178 lines of v1.2, not a truncated plan excerpt, and matching relevant retirement/listener/dispatch terms in the listed supplements.

- ai/plans/box3d-v1.2-reference.md:318–322: native event switches and Cocos listener state must both be managed; valid contact event counts are defined; copy event data before business callbacks; do not call invalid objects.
- Same file:444: T15 owns public event delivery, pair reconciliation and callback-deferred modifications. Lines 674–678 cover C21–C25 event/lifecycle tests. It has no explicit once-retirement prohibition or exceptional redefinition of Collider.once.
- src/cocos/physics/framework/components/colliders/collider.ts:353–367: public once promises automatic removal after its one execution.
- src/cocos/core/event/eventify.ts:70–85 and 163–164: same once promise; once uses this.on(..., true).
- src/cocos/core/event/callbacks-invoker.ts:329–363: emit saves callback/target, dynamically invokes this.off for once at 343–344 and for invalid targets at 348–349, then invokes a callback at 351.
- Same file:300–316: off cancels a matching entry and then calls _offCallback. Lines 116–127 and 49–52 show cancel resets and pools CallbackInfo.
- src/cocos/physics/framework/components/colliders/collider.ts:585–611: _updateNeedEvent calls potentially overridable isValid/hasEventListener and shape.updateEventListener; it cannot simply be invoked as a trusted no-callback privileged leaf.
- docs/physics/box3d/contracts/unified-mutation-fence-v1.md:9–17: explicit temporary public-entry restrictions, independent owner leases, no blanket exemption; no statement that automatic once retirement is a newly forbidden public reconfiguration.
- docs/physics/box3d/contracts/unified-admission-fence-v1.md:19–27: public configuration/lifecycle/cache admissions must precede mutation, but exact owned internal writes remain distinct; no temporary release or idle reset.
- docs/physics/box3d/contracts/unified-owner-lifecycle-decisions-v1.md:39–43: the listener-operation barrier here is specifically material identity/commit work, not a new ordinary collision once contract. Section 6 keeps event-entry qualification unresolved.

Current production boundary is narrower than the synthetic owner-scope fixture:

- src/air/physics/box3d/world.ts:473–490 enters an actual owner dispatch scope but does not dispatch Collider events. Its comment explicitly retains the T09/no-public-events boundary.
- src/air/physics/box3d/box-sphere-shape.ts:166–171 still rejects Collider event listeners as unsupported T15 and states native event flags are disabled.

Therefore the fixture's actual classes and owner phases do not establish that the current native adapter already supports collision once, and cannot authorize breaking it in a future supported path.

## 3. Additional static hazard

The existing emit order calls off for once before info.check. cancel resets info.target to undefined and returns the object to the pool. As written, the subsequent info.check observes reset or potentially reused storage, not the saved target. Consequently once plus an already-invalid target can reach callback invocation in this static path. This is a source-derived finding, not a newly executed regression result.

Any precise retirement design must decide eligibility from saved callback/target/once and target validity before cancel/reset/free, and must never inspect a retired CallbackInfo to decide which callback to call. Preserve the untouched legacy/no-opt-in path separately; do not silently claim that a broader global bug fix is included or qualified.

## 4. Frozen proposal constraints for the next candidate

This is a bounded proposed implementation design, not a new approved public contract and not permission to integrate code. Its nonnegotiable separation is:

A. Public on/off/once/removeAll/targetOff/clear remain early guarded. No caller-supplied reason, callback equality, once flag, isInvoking boolean, owner phase, stack inspection or caught guard exception grants a public off exception.

B. A permitted dispatch's own exact automatic retirement is a distinct core-internal operation. It cannot call the public guarded off path and cannot expose a callable general remove capability.

C. Existing mutation/transform owner leases stay installed. The owner phase stays unchanged throughout retirement and all notifications/user callbacks. No temporary dispose/re-register, phase=idle, emitter-wide bypass boolean or monkeypatch is allowed.

D. No new event-delivery authorization is inferred from this leaf. The policy for manual Collider.emit versus actual World dispatch in non-dispatch phases remains separate. The old four-scope synthetic tests do not freeze that policy.

### Minimum safe seam

A Collider-only off guard cannot distinguish a direct user off from this.off called by inherited emit: the receiver and public argument tuple are identical. Without a core provenance seam, both calls are observationally the same. Do not infer provenance from public object state.

The narrowest robust direction is a backend-neutral, opt-in automatic-retirement seam at the two exact CallbacksInvoker.emit branches. Keep Eventify's public interface unchanged. Non-opted-in emitters and no-observer/non-Box3D behavior retain the original algorithm. An owner installation selects real copied Collider identities using its private records; it must not read user getters or use a runtime selector getter as authority.

Keep the opt-in lifetime as narrow as the actual owner-controlled interval, rather than enabling a different generic algorithm for the entire lifetime of every Collider. Install the private retirement participant alongside the existing owner leases from the same already-copied component identities, before callbacks can execute, and dispose it independently at normal scope exit. No-active-participant means the untouched original path, including the observed owner's ordinary no-lease phase. This uses a private registry lookup, not a public phase/selector/getter exception. Multiple relevant owners must be accounted for before effects; retirement occurs once, while each owner's native-mask dirty obligation remains independent. Acquisition/cleanup failure cannot release another owner's guard or be hidden as a successful dispatch.

The slot-retirement function itself stays module-private in the callback implementation. Its authority is its direct engine callsite and captured active frame, not an exported token or a method accessible on the emitter. A data-only result can be passed to a trusted metadata sink, but it carries no capability to retire another slot. If a cross-module permit is unavoidable, it must be unforgeable, one-shot, private, tied to the same captured tuple, and consumed before any overridable function or external callback; it must not become a public method flag.

### Exact operation sequence

1. Capture the actual emitter, primitive event key, callback-list identity, callback-array identity, slot index, CallbackInfo identity, callback, target and once bit while all owner guards remain active. Snapshot target eligibility before resetting/pooling info.
2. Verify the tuple is still the current slot. Use existing engine-owned identities and original leaf implementations, not this.off, this.hasEventListener, this.isValid, info.check overrides or list.cancel property lookups as authority. The privileged effect region performs no dynamic user hook/getter calls. Accessor-tampered internal storage is not made legal: reject it before effects rather than executing an accessor under special authority. Ordinary target validity inspection occurs before the private effect region with every guard active; it cannot grant another mutation.
3. Preflight metadata/dirty-record storage needed for this retirement before mutation. Retire exactly that slot, once only, using the original null/cancel/pool bookkeeping. Preserve root-invoker cleanup and nested-emit behavior. Do not clear the event, another target, another emitter or another owner's state.
4. Update the Collider's event-need caches from trusted remaining-list data, without overridable getters or the public _updateNeedEvent chain. This is explicit engine-owned lifecycle metadata, not public configuration permission. Consume any exact permit before off notifications or the user callback.
5. Record a private listener-mask dirty fact when native event flags may need reconciliation. Do not call public shape.updateEventListener inside the privilege window or temporarily unlock the owner so that it succeeds.
6. Notify existing off bookkeeping and invoke the copied valid once callback only after the exact operation has ended, with all ordinary guards still active. A nested public off, targetOff, clear, material mutation, Node mutation or System change remains rejected. Invalid-target entries are retired without invoking their callbacks. A valid once listener is already absent if it recursively emits the same event.
7. At the real event transaction's normal safe completion, reconcile native listener flags from copied final masks and current component/shape generations. This must be an explicit owner safe-point or exact private native operation, not an incidental idle reset in the middle of dispatch. Preserve enough native flags until that boundary so already-collected event payloads are not invalidated. No public callback may run under this reconciliation authority.
8. On hook/callback failure, keep actual retirement/cache/dirty facts. Do not put a once listener back, replay it, or claim that committed listener metadata did not change. Cleanup/fault reporting must retain the first error and settle independent pending work truthfully.

The cache/native half is necessary: simply replacing this.off with a direct base off would skip Collider caches or still call a callback while an overly broad permission is active. Deferring all logical removal until the end is also incorrect because recursive emit could execute a once listener twice.

### Minimum affected areas, if later authorized

- CallbacksInvoker automatic-removal branches and a private exact leaf/opt-in registry.
- Collider's four public guards, runtime clear boundary and a trusted cache-notification connection.
- Owner attachment/teardown and event-mask safe-point participation. The real shape/native flag consumer is a T15-dependent boundary.

No global Eventify mutation, no blanket modification to every event target, no API export expansion, no shared PhysicsMaterial transaction rewrite. A trusted emitter metadata sink may be stored privately at original construction, then selected by owner identity, instead of dynamically looking up an overridable instance method.

This is not realistically a one-line Collider-only fix. The new source seam can be proven independently, but production activation remains blocked until its native-event-mask obligations and owner release paths are explicit. Current T15 unsupported status must remain truthful.

## 5. Required future RED/GREEN controls, not run now

Preserve the prior raw evidence. Add a new suite rather than changing its expected rows in place:

- Valid once emits exactly once during a supported owned dispatch; second and recursive emits cannot replay it; a permanent listener still fires correctly.
- Already-invalid persistent and once targets never run. Invalid retirement does not prevent later valid listeners from running.
- Snapshot callback/target before reset/free; nested activity using the global CallbackInfo pool cannot substitute a reused object.
- Public on/off/once/removeAll/targetOff/clear from the once callback, off notification and other nested callbacks still reject before reads/effects, including after catching an earlier refusal.
- Exact-slot negative cases: wrong emitter/event/list/array/index/info, replaced table, stale pooled info, repeated consumption, extra event/target removal and foreign owner cannot gain authority.
- Trap isValid, hasEventListener, off, list.cancel and other public properties: none can obtain or prolong an exemption. No owner phase change, guard release, native mutation or public getter runs during the privileged leaf.
- Caches accurately reflect remaining trigger/collision/controller listeners; native masks update only at the actual safe point; one listener retirement does not disable remaining listeners.
- Callback throws, off bookkeeping throws, native-mask reconciliation fails and teardown interrupts: preserve actual retirements and independently retained cleanup facts; never replay once.
- No opt-in/other event targets, existing Node pointer off bookkeeping, no-lease Collider semantics and every selected backend path keep their original behavior.
- Read-only contract/source controls remain separate from real World/current-WASM T15 qualification. None promote the formal 2,128 required cells.

## 6. Review outcome

Do not integrate candidate Collider SHA a79f2defaa82992989859097f5148385c782bec70ba2be417253807a30e7cf34 on the strength of its 261-case GREEN. Its public-entry rejection evidence is useful, but it includes an unsupported automatic-retirement behavior change. Main Collider remains at original SHA 2e93ecae851d1a943c00d1a5a01a3d887153dce0d9693f541b4f6be73b2a7ac9.
