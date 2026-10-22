# Unified command decisions, version 1

Status: **FROZEN_SOURCE_CONTRACT_NOT_IMPLEMENTED**, 2026-10-22. Integrator reviewed the fixed-core design and froze these public and lifecycle decisions. This is not implemented API or qualification. It does not modify m2, its 43 inputs, existing evidence, or the original hash-bound API JSON. The additive API artifact is `unified-command-api-v1.json`; its declarations are contract-only, not package exports. Exact new native wire constants still require their separate freeze before implementation.

Basis: [read-only unified design](../rebuild/unified-command-design-20261022.md), SHA-256 `f58f3b3ec8a412125807f0fbd1c8d073720043cf5d11c4842f1f14086ce0dd1b`; [motion decisions v1](motion-command-decisions-v1.md), SHA-256 `30951da3f296ac17acac9ff594c91ee96db62d5b3a3a1bdaf1ec0feb8f2f7a6a`. The detailed source hashes and core arithmetic citations remain in the design, not duplicated here.

## 1. Frozen public surface

Keep `createKinematicTarget(body)`, target `setTarget/clear/dispose`, and `teleportRigidBody(body, pose, options?)` signatures unchanged. New Box3D-only helpers resolve the current initialized app/world; wrong backend, foreign world, stale generation and closed/faulted owner reject. No native token or pointer is public.

```ts
interface Box3DProducerHandle {
    readonly enabled: boolean;
    readonly disposed: boolean;
    enable(): void;
    disable(): void;
    dispose(): void;
}
interface Box3DBeforeStepContext {
    readonly tickIndex: number;
    readonly attemptId: number;
    readonly fixedDt: number;
    readonly solverSubSteps: 1 | 2 | 4 | 8;
}
interface Box3DContinuousForceDescriptor {
    readonly force?: IVec3Like;
    readonly torque?: IVec3Like;
    readonly relativePoint?: IVec3Like;
    readonly space?: 'world' | 'local';
}
interface Box3DContinuousForceHandle extends Box3DProducerHandle {
    update(descriptor: Box3DContinuousForceDescriptor): void;
}
declare function registerBox3DBeforeStep(
    callback: (context: Readonly<Box3DBeforeStepContext>) => void,
    options?: { enabled?: boolean },
): Box3DProducerHandle;
declare function createBox3DContinuousForce(
    body: RigidBody,
    descriptor: Box3DContinuousForceDescriptor,
    options?: { enabled?: boolean },
): Box3DContinuousForceHandle;
declare function cancelPendingBox3DCommands(body: RigidBody): number;
```

Registration defaults to `enabled=true`; boolean options are strict. Force/torque default to zero, relativePoint to zero COM offset, space to world. Units are N, N·m and m. Local force/torque/offset rotate with the command's body basis; offset is never scaled or translated by body origin. Descriptor update is **complete replacement**: omitted fields reset to defaults, never preserve old fields. Validate and copy the entire replacement before changing the stored descriptor. A failed update keeps the previous descriptor and enabled state.

Continuous registration requires a valid initialized enabled dynamic body, and remains body/world/scene-generation-bound. Its descriptor is immutable internally after copying; each successful update installs a new copy. Enable/disable/dispose are idempotent while applicable; enable/update after disposal reject, repeated dispose is safe. Readonly enabled/disposed metadata remains readable after disposal. Disposed enable cannot resurrect ownership.

Create/update/enable are configuration operations outside a callback/step/event-dispatch transaction and require an unpaused ready world. Disable/dispose may also run while paused for cleanup, but not reentrantly during a transaction. Application teardown uses its internal cleanup path, not these admission restrictions to skip cleanup.

## 2. Queue and callback contract

Ordinary Box3D force, torque and impulse calls become copied **next-executable-fixed-tick** commands, including local variants. Ordinary clear-force/clear-velocity/clear-state calls join the same ordered stream. Component/native velocity getters report last committed native state, not a speculative queued impulse. The underlying immediate binding APIs remain internal; callbacks cannot bypass staging through them.

All accepted user submissions have a strictly increasing safe-integer sequence within the current world generation. Queue retention stores original accepted records; target reduction is a non-destructive view until commit/cancellation. Superseded target records can therefore still be counted as accepted-but-unconsumed entries. Gaps after cancelled/failed attempts are legal; sequence reuse/wrap is not. Ordinary impulses are consumed once, including catch-up ticks. `tickIndex` denotes the next completed logical tick and does not advance on refusal; `attemptId` is a separate diagnostic-only counter, never a simulation tick or command consumption identity.

Hooks and continuous handles share one stable registration order. At each candidate tick, snapshot the enabled roster and descriptor copies once. Pre-tick accepted commands precede producer contributions. Each continuous producer contributes force first, then torque, at its roster position; exact-zero components generate no command and do not wake a body. A nonzero force with an offset includes its induced torque; an explicit descriptor torque is a separate later operation. No producer runs during scene-sync-only calls or merely because a render frame elapsed.

Callbacks are synchronous; normal return is `undefined`. Throw, other return value/thenable, or **any rejected command submission even if caught by callback code** latches failure of the whole provisional candidate. No earlier callback can have written native state. Discard all provisional contributions; preserve the accepted pre-tick queue, native state, snapshots and step counters. Do not internally replay callbacks. A later explicit call to step is a new attempt for the same uncompleted tick, with a new attemptId. User JavaScript side effects are not rollback-capable.

Context is copied frozen metadata, not a command capability; it can be retained and read as historical data, with no invented expiry. Async callbacks are unsupported. Rejected async functions may still schedule JavaScript continuations; the engine cannot sandbox those. An API call made later outside collection is a new submission under then-current admission, never a late append to the old candidate.

During collection/final validation/commit, reject configuration, mass/type/enable, shape/filter/material, Node/ancestor/reparent, world-setting, registration/update/lifecycle changes and recursive step through all reachable Box3D adapter paths. Public velocity setters are **not included in this hook batch** and reject there, even on unowned bodies; outside collection they retain their existing behavior unless target ownership forbids them. The fence is an owner state, not `world->locked=true`.

Pause clears accepted user pending commands and pending target motion, suspends hook invocation, and disables continuous handles. Resume does not re-enable continuous handles; explicit enable is required. Hook enabled configuration survives pause but cannot execute while paused. Paused submissions reject. Body disable/non-dynamic type change revokes body-bound continuous ownership; target lifetime remains the original contract. Scene/app cleanup removes only its owned queues/handles, preserving actual persist ownership.

## 3. Cancellation and recoverability

`cancelPendingBox3DCommands(body): number` is a pure queue operation allowed only in the **unpaused ready configuration phase**, not in a hook, step, event-dispatch transaction, faulted state or teardown. It validates the current initialized body/world/full-generation ownership, but does not require valid mass geometry, pose, or command arithmetic. A pending-invalid body or arithmetic-overflow queue must remain cancellable. Disabled/static bodies with still-valid ownership may return zero; stale/destroyed objects reject and their owning teardown already clears their entries.

It removes every accepted, unconsumed **user** entry for that body: force/torque/linear or angular impulse, teleport, target set/target clear, and ordinary clear-force/clear-velocity/clear-state. It does not remove internal scene synchronization, automatic target idle-zero, or lifecycle-required paired-zero obligations. Count one removed accepted record per original submission, including retained superseded target records; do not count vector axes, projected native calls, already retired entries or protected cleanup. Return zero when none exist.

Cancellation is all-or-nothing for this body's queue. It does not allocate a new command sequence, so sequence exhaustion cannot prevent queue recovery. If preparing the replacement queue fails, retain the original queue. It never changes native state, snapshot availability, native step count, producer configuration or target ownership. It does not undo already accumulated native forces or committed impulses. Repeated cancellation returns zero after the first removal.

Cancelling a target set/clear leaves the active target handle owned; with no explicit surviving intent, its next executable tick still clears paired velocity. Cancelling a teleport does not resurrect previously **retired** intent; because this operation removes all of this body's pending user entries, no older pending target is revived either. A later setTarget/teleport is a new sequence.

Target dispose/revoke immediately makes further submissions through that handle invalid and creates a separate protected, generation-bound paired-zero obligation. Cancellation cannot remove it or release control. New ownership/velocity control remains refused until known zero commit; on committed readback failure or unknown completion the world faults, not transfers ownership. Disabled/destroyed teardown must explicitly settle the obligation using actual lifecycle state, never send an old zero to a reused ID. Such settlement is not claimed merely because user entries were cancelled.

To recover a known pre-commit refusal: cancel the affected body's pending entries, fix its configuration, and retry deliberately. If a producer regenerates the bad command, disable/dispose that producer or replace its descriptor first. Cancellation does not promise to fix callback code, an exhausted tick counter, or a faulted/partially committed world. A caller can cancel multiple bodies separately before retry; cancellation itself performs no native commit.

## 4. Exact per-body reduction and order

Type/configuration changes are forbidden inside the stream. Force/torque/impulses require an enabled dynamic body; target requires an enabled kinematic body. Therefore **target plus force on the same body is a rejection**, not blend, silent no-op, or conversion. Submission in a callback latches the whole candidate failure. Recheck at commit for bodies whose type changed after earlier enqueue.

Keep all resets, ordinary effects and ordinary clears in sequence order. Never combine impulses or hoist the last reset ahead of earlier effects. Reduce only target-mode intents in a provisional view:

1. Scan the body's accepted plus provisional records in sequence. A setTarget replaces its earlier effective target-mode intent. Target `clear()` replaces it with paired zero. Teleport cancels earlier pending target-mode intent but is itself retained at its original sequence.
2. While target ownership is active, ordinary clearVelocity and clearState are explicit paired-zero barriers: cancel earlier target intent, retain the ordinary clear at its original position, retain control ownership. ClearState also clears F/T. ClearForces only clears F/T and does **not** cancel or replace target intent.
3. A later setTarget can replace an earlier target `clear()` intent, or follow an ordinary clear/reset; its calculation uses the basis left by all preceding retained reset operations. Ordinary clears are not deleted when a later target arrives. Removed target intents produce no transient velocity write or wake.
4. If there is no surviving user target/reset/paired-clear intent for an active target owner, insert exactly one internal idle paired-zero. No target velocity persists to another tick merely because no new target was supplied. ClearForces alone does not suppress this zero.
5. **Explicit teleport exception to idle-zero:** a surviving teleport is this tick's explicit motion intent, so do not append an automatic idle-zero to it. This preserves the already frozen preserveVelocity=true option. The next tick without fresh intent clears target-owned velocity. This resolves an ambiguity in the earlier design's blanket idle-zero rule; it does not change m2's reset-only native behavior.
6. Protected dispose/revoke zero dominates ordinary user intent and cannot be overwritten by a later target. Once dispose is requested, new setTarget/clear/teleport for that body rejects until the protected cleanup settles and ownership is released. A later explicit teleport after release uses ordinary admission.

Frozen examples requiring tests:

- `target A → target B`: only B supplies target velocity; no A wake/velocity effect.
- `target A → clearForces`: A remains effective; actual force accumulators clear. If A is exactly stationary, it performs m2 paired zero without unnecessary wake.
- `target A → clearVelocity/clearState`: no A application/wake; actual paired clear remains. Target `clear()` has the same velocity effect but not clearState's F/T effect.
- `target-zero → target.clear()`: only paired clear survives; zero remains zero, no unnecessary target wake, ownership retained. `target-zero → clearForces` preserves stationary-target semantics.
- `target A → teleport R(preserve=true)`: A is cancelled, R preserves the **previous committed** world COM v/world w, not A's never-committed planned velocity. No implicit same-tick zero; next empty tick zeroes.
- `teleport R → target B`: R executes once, B plans from R's origin/COM/inertia. Target does not subsequently SetTransform to correct arrival.
- `target A → force F` on that kinematic body: entire candidate refuses with no native A/F effects. Other bodies' earlier commands are also uncommitted.
- Dynamic `impulse A → teleport R(preserve=false) → impulse B`: A applies in order, reset clears its velocity, B uses the reset basis; retained force/torque survives R. `force F → R → force G` retains F as an already world-space accumulator and converts G using R.

Queued user records and all reduction decisions retire only after a known whole-batch commit or explicit cancellation. A pure rejected reset or later command cannot destructively cancel an earlier accepted target. No command is replayed after committed/unknown failure.

## 5. Native plan, commit and diagnostics

Use one pure whole-stream planner over value-copied per-body shadow state. After reset, recompute `C = p + R*localCOM` and `IworldInverse = R*IlocalInverse*transpose(R)` in the actual core operation order. Preserve/clear v/w exactly as requested; preserve existing F/T. Local vectors and offsets use the current shadow rotation. Compute native absolute point then its rounded `point - COM` for the lever arm; do not assume an exact offset at very large positions.

Accumulate F/T after each command with checked float32 intermediates. Linear impulse performs actual `v + invMass*J`, core speed clamp, world-inertia angular delta, then existing immediate world-axis velocity masks. Pure angular impulse uses the actual inverse-rotate → local-inertia multiply → rotate → add chain, then masks. Do not validate only a mathematically equivalent world-inertia expression. A later cancellation cannot excuse an earlier overflow. Force accumulation itself is not axis-masked.

Retain all m2 target formulas, damping, wake, cap and lock admission and numerical budgets. Target cap refusal is not a new refusal rule for ordinary impulses, which retain their actual core clamp semantics. Clear-force zeros F/T, clear-velocity zeros v/w, clear-state zeros both without inventing a wake. Neither algebraic preflight nor finite command values prove arbitrary solver/gyro/CCD stability.

The apply entry revalidates the entire stream, identities, mass readiness, capacity and arithmetic before the first native write. An earlier validate call does not authorize a stale plan. Preflight whole-world known step readiness before commit, including unrelated pending-invalid bodies and counter exhaustion. Reserve plan/output memory before writes; tracked scratch may change allocator capacity but not live ownership after a known rejection.

Replay validated operations only after all planning succeeds. Reacquire body/sim/state after wakes; do not hold the core lock across APIs that acquire it themselves. No normal recoverable-status branch may appear after first mutation. Actual core allocation/trap failure is still possible and has unknown/partial completion, not rollback. The separate subsequent solver step remains exactly one invocation, not part of a promised rollback transaction.

Failure outcomes:

- Reviewed JS/native admission failure: not-mutated; accepted pre-tick queue, native state, step counter and old snapshots remain.
- Pure validation export throw: unknown delivery of a read-only operation, not evidence of mutation; do not invalidate a native snapshot merely on that basis.
- Apply throw before status: unknown; invalidate current observation, quarantine candidate, fault, never replay.
- Native status zero then copy/readback failure: committed; retire candidate, invalidate/fault, never replay or advance step to conceal the failure.
- Later step/snapshot/Node-writeback failure: retain established command commit and actual step completion independently. Completed native step remains counted even if its snapshot is unavailable.

Copy final actual pose/COM/state separately from requested input and predicted shadow result; no borrowed HEAP view survives. Empty apply does not invalidate a snapshot. No revision/step/command counter is silently wrapped.

## 6. Wire and evidence still requiring a source freeze

New additive command wire/export names, opcode numbers, body/operation limits, strides, sequence representation, error status mapping and aggregate output layout are **not frozen here**. Do not reuse/reinterpret m2's 18-word input or 61-float result, legacy 29-float body snapshot, 49-float state, or event/contact layouts. ABI1 remains only if old meanings stay intact; new schema/manifest identity must reject mixed old/new facade/module artifacts. Original core and staged patch-chain identity stay unchanged absent separately reviewed necessity.

Before compiling, hand off exact new source inventory, declarations, schema hash, compile units and evidence list. Qualify real host Debug/Release and fresh WASM, retaining original failures and m2 history. Pure queue mocks cannot certify physics. Retain all asserted raw ordered commands and before/planned/actual values for independent parsing.

## 7. Migration and API-to-test map

These are required subdivisions of original tests, not claims of PASS or newly deleted scope:

- Ordinary apply/clear next-tick and committed-only getters: C06, C03, C07, C12. Update real AIR tests that currently assume an immediate impulse readback; retain the earlier test as historical behavior, not a false core failure. Immediate low-level binding qualifications remain separately scoped.
- registerBox3DBeforeStep and stable roster: C01-TIME/C02/C03 plus C06. Test manual and automatic ticks, no-tick sync, 30/60/120 Hz same 600 ticks, callback/thenable/caught-error abort, and no duplicate impulse on catch-up.
- Continuous create/update/enable/disable/dispose: C06 plus ownership/I05/I06 at their original milestone. Test complete replacement defaults, invalid update unchanged, all-zero no wake, pause requiring explicit re-enable, actual counter cleanup. ConstantForce remains frame-level and gets actual call-count migration evidence.
- cancelPendingBox3DCommands: C06 and C11-TARGET-LIFETIME-BASIC/TELEPORT. Test cumulative-overflow queue → cancellation → corrected commands → real step; exact cancellation count including superseded records; invalid phase refusal; producer regeneration; protected zero survives cancellation and cannot affect a reused body.
- Target/teleport/clear ordering and ownership: C11-TARGET-TICK-BASIC/LIFETIME-BASIC/TELEPORT, including every example in section 4; event/app/full lifetimes keep their later required cases. Preserve original target cap/damping/COM/lock budgets.
- Native shadow arithmetic: C06/C07/C08/C09/C12 with rotated anisotropic inertia, nonzero COM, sequential cap/lock impulses, accumulated overflow, reset order and real force clear. Whole-batch later-member refusal preserves all earlier bodies and snapshots.
- Failure phases/ownership: existing snapshot/ID/resource contracts plus explicit injection-labelled readback/export failures, forced heap growth, full generation reuse and cleanup. Real native failures and injected delivery failures remain distinguishable. Finite cycles do not prove universal no-ABA or total JS/WASM leak freedom.

Original plan anchors: [v1.2](../../../../ai/plans/box3d-v1.2-reference.md) lines 229–240 (public motion), 248–256 (time/one-shot/hook/continuous/ConstantForce), 263–267 (origin/COM/offsets), 350–362 (ownership), 435 (T11), 606–618 (budgets), 629–635 and 646–652 (required tests). No full T11/G1, browser, ASan/LSan or application lifecycle completion follows from adopting this source contract.
