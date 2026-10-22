# B0 private physics-state observer contract

Frozen before implementation. Baseline: `a9be35d`. Scope: one new private backend-neutral source module, one small actual-source pure control runner, and new evidence. No existing engine/AIR source, public barrel, native input or old evidence changes. This is not native/world/material qualification.

## Corrected minimal interface

- `registerPhysicsStateObserver(target, observer): PhysicsStateObserverLease`.
- `beginPhysicsStateChange(target, operation): PhysicsStateChangeTicket | undefined`.
- Internal isolated `PhysicsStateObserverRegistry({counterLimit?})` supports explicit reduced-counter qualification, default MAX_SAFE_INTEGER. This is not an app option.
- Observer registration copies five trusted callbacks once: `open(context)`, `preflight(context,before,candidate)`, `commit(context,actual)`, `fail(context,failure)`, `dispose(context)`.
- Context contains frozen target identity, operation and monotonically increasing change sequence. No before/candidate field is evaluated before all open callbacks have established their owner barriers.
- Ticket methods: `prepare(reader)` copies/freeze `{before,candidate}` and runs every owner's pure preflight; `effect(fact)` records only an explicit JS callsite fact after successful whole-roster preflight; `commit(actualReader)` independently copies actual cache and commits owners; `fail(error,actualReader?)` terminates, throws the exact first failure, and cleans up; `dispose()` independently releases temporary barriers, or reports abandoned effects; `diagnostics()` returns frozen copied phase facts, exact first exception and secondary exceptions.
- Lease/ticket methods are frozen closures with exact receiver identity checks. Detached or borrowed methods cannot act on another ticket/lease. Supplying the genuine closure and genuine receiver intentionally shares that capability.

The earlier design's open-returned attempt is replaced: an accessor failure while reading its dispose method could lose a barrier. All cleanup references are now copied before registration. Every owner whose open was entered receives dispose even if its open threw; trusted callbacks must tolerate partial open. Temporary dispose does not unregister its observer.

## State and error protocol

`open -> prepared -> committed`, or `open/prepared -> failed`; disposal is separately recorded. Successful commit automatically releases all temporary barriers. Open/preflight/read/commit failure notifies every entered observer and independently releases every entered barrier. No later owner commit is attempted after a commit callback failure. A successful earlier commit remains recorded, not rolled back.

Plain dispose before effects is cancellation; dispose after an effect without commit is an explicit failure, never successful rollback. Dispose failure after successful commit retains `commitCompleted=true`, while the terminal result is failed. Original error identity, including undefined/null/0, is never replaced by fail/dispose/readback errors. Each secondary error is retained by identity in diagnostics. Failure callbacks may see the earlier immutable failure snapshot; later failure/disposal errors remain in final diagnostics.

Same-registry reentry while copying or executing any callback is rejected and latched even if caught. This blocks registry bookkeeping, not arbitrary JS/native operations; owner barriers must perform actual engine fencing later. Register/release/begin against a target with an open ticket rejects without roster mutation and poisons that ticket until terminal cleanup. Other targets may have independent tickets outside callbacks. Full original roster identities are checked before/after external reads/callbacks. No module-global bypass exists.

Registration copies all five callback references before installing membership; invalid/throwing/caught-reentrant getters leave no registration. No-observer begin returns undefined without inspecting operation or any snapshot/candidate. Registration and change counters are safe monotonic integers; overflow rejects before opening barriers. Legal failed change attempts may leave sequence gaps; sequence is never reused.

Snapshots preserve only copied typed fields: collider material identity/shared flag, default material identity, finite coefficient tuple, or strict System booleans. Asset objects retain identity and are never frozen. Physics support/ranges, real owner/native outcomes, actual cache provenance, effect truthfulness and purity of trusted preflight remain the integrating owner's responsibilities.

## Required controls, before any product wiring

1. No-owner fast path reads no getters and changes nothing; unaffected target remains fast even with other registrations.
2. Two owners open before snapshot getters; lease release isolation and repeated disposal.
3. All callback references and snapshot scalars/tuples copied once; later input mutation cannot alter accepted records.
4. Throwing/invalid registration getter, caught nested registration, and no partial membership.
5. Whole roster stable under nested register/release/begin, including swallowed errors.
6. Preflight failure causes zero effects/commits; effect before prepare rejects and cleans up.
7. Candidate and actual cache differ; commit observes actual only, does not reuse candidate.
8. open/preflight/before/candidate/actual/commit/fail/dispose thrown undefined/null/0 retain exact primary and independent cleanup.
9. A later owner commit fails after an earlier commit; diagnostics retain completed owner count, fault every entered owner, no replay.
10. Dispose failure after completed commit preserves completion and records failure; cleanup continues to every owner.
11. Wrong receiver/cross-ticket/terminal replay cannot mutate a valid ticket; cancellation and abandoned-effect behavior.
12. Reduced safe counter exhaustion rejects before open, without writable counters or forged-ticket escape hatches.

Initial RED must be labeled missing B0 source/API if implementation does not yet exist. It is not a historical engine/native defect. Preserve its runner/input and raw output separately, then run the same controls against the implemented source under new evidence. No physics PASS labels.
