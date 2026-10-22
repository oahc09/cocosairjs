# T11 motion command decisions, version 1

Frozen before the first transform-bridge implementation on 2026-10-22. This is a design decision, not implementation or qualification. Public target/teleport signatures and every required v1.2 category remain unchanged. The source review is `../rebuild/transform-bridge-contract-20261022.md`.

## Native target and reset semantics

1. The first candidate preserves the fixed core's approximate target velocity formula and actual damping. Target means a one-fixed-tick motion intent, not an arbitrary exact-arrival constraint. It must never use SetTransform to correct arrival, modify damping, bypass locks, disable caps, or move a held dynamic payload. Raw requested-to-observed error and the independently predicted damping/angular shortfall are both mandatory outputs.
2. Plan from the actual origin, normalized quaternion, local/world COM, damping, locks, caps, admitted float32 fixed dt and solver substeps. A rotation target includes the corresponding COM translation. Revalidate at native commit; do not cache a plan across intervening configuration/geometry/pose writes.
3. Reject a locked planned velocity component whose absolute value exceeds 1e-6 m/s or rad/s before mutation. Only the admitted numerical-zero residue is projected to exactly zero and reported. Reject unsafe pre-damping speed at or above the native cap minus `8 * FLT_EPSILON * max(1, cap)`, rather than silently clipping. Include the actual angular fast-rotation flag in admission and evidence.
4. Nonzero admitted target motion explicitly wakes an enabled kinematic body, including motion below its sleep threshold. An exactly stationary target clears paired velocities without an unnecessary wake. No pending target on the next fixed tick means paired target-owned velocity zero, not persistent motion.
5. Public teleport accepts valid initialized dynamic or kinematic bodies, including disabled bodies. Disabled teleport stores a real pose but does not enable the body or request a native wake. Static reset is internal scene synchronization only. Defaults remain preserveVelocity=false, wake=true. Wake=false does not force sleep; preserveVelocity preserves world COM linear velocity and world angular velocity. Existing accumulated forces/torques are preserved, and this is explicitly tested. A pure rejected teleport does not cancel an earlier valid pending target.
6. Normalize copied finite nonzero quaternions with scaled arithmetic, then validate the resulting float32 quaternion against the actual native unit predicate. Zero, NaN/Infinity and unsafe derived COM/AABB/dt/velocity calculations reject before any native mutation. Do not convert invalid quaternions to identity.

## Transaction boundary

The owned native bridge must provide a batch that validates all body IDs, generations, world, unlocked/type/enabled state, input wire bounds, duplicate policy, and derived plans before the first mutation. A motion record can contain an origin reset and a subsequent target or paired-clear intent for that body; the target is planned against the post-reset basis. Same-body queue merging happens before this record is produced. The exact wire/export names and new input inventory are reviewed before compiling.

All known validation failures preserve every body's pose, velocities, forces, native step counter, current snapshot and earlier accepted intent. The apply phase may still encounter an unanticipated trap/allocation failure; its partial completion is unknown and faults the world rather than promising rollback or replay. Native status zero followed by copy/readback failure is committed. A successful mutation invalidates current observations but never increments the native step counter or rewrites an old copied snapshot. No new pose/event/contact stride replaces an existing ABI1 wire.

## AIR ownership and Node consistency

The fixed public target handle uses one private generation-bound owner per real RigidBody; it exposes no implementation or native handle. Clear retains control; dispose clears paired target velocity at the safe point before control can be reused. Teleport cancels earlier queued targets; a later same-tick target may move from the reset basis after whole-plan validation. Pause, disable, non-kinematic type change and owning teardown revoke/cancel according to the original contract.

Node conflict rejection must happen before mutation, not in a post-write transform event or the next physics tick. Review a narrow backend-neutral pre-mutation guard in the existing Node transform validation module, inactive when no Box3D controller owns the affected Node or descendant. Cover every supported TRS, angle, matrix, relative transform and reparent write entrance; preserve original headers, unrelated backend paths, dirty flags and events. A writeback permission must be single-use and exact-operation/expected-pose bound, consumed before user transform listeners can re-enter. A global permissive writeback boolean is not acceptable. Actual-source negative controls precede product activation.

The exact public before-step/continuous-force registration surface and full hook command-staging rules are still a separate unresolved contract. No callback may partially mutate native force state and then be replayed after a later callback error. Current manual PhysicsSystem.step must reach the same world-level queue consumer as automatic fixed ticks; scene sync without a tick does not consume commands.

## Initial numerical qualification, not API domain restrictions

The first finite experiment uses origin components within ±32 m, local COM norm ≤4 m, supported box/sphere geometry, 600 fixed ticks, dt=1/60, substeps 1/2/4/8 and damping coefficients 0/.25/1. These are fixture bounds, not a silent restriction of the product API or the full required matrix.

- Actual origin/COM versus independent predicted state: absolute Euclidean error ≤1e-4 m.
- Actual orientation versus independent prediction: shortest relative angle ≤1e-4 rad, evaluated with atan2.
- Actual paired velocity versus independent planned velocity: vector error ≤5e-5 * max(1, expected vector norm), with absolute and relative error retained.
- Desired target shortfall is measured separately. It must agree with the reviewed analytical damping/normalized-Euler model within the above numerical budget, not be hidden as floating-point error. This finite model does not certify future constrained/CCD interactions; those require their own real observations.
- Keep original failures if a model, input rule or implementation disagrees. Do not enlarge these budgets after seeing a result. Preserve old l2 artifacts and source-qualified results unchanged, and rerun all affected native/body/filter/geometry controls for the new schema.
