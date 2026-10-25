# Convex query and committed producer read contract

This slice adds true generic native all-hit casts and shape overlaps, not closest-then-filter, a stepping loop, an approximate AABB test, or a different backend. The additive ABI is exact-schema-bound. Until the matching run is recorded, new functionality is NOT_RUN; no formal 2128-cell or nine-Gate promotion follows from this contract.

## Data and ownership

C copies 1..128 finite world-oriented relative-origin points plus a finite nonnegative radius. Cast results use the existing 11-word full shape ID/point/normal/fraction/feature record. Overlap results use two full-ID words only. Count pass precedes complete-capacity writes. Inputs/points/output/count are separately aligned and nonoverlapping. Generic traversal never clips after a zero or filtered sensor hit. Half-open fractions `[0,1)` apply to casts. Zero translation does not invoke a cast; overlap is separate and still observable. No native pointer, live view, persistent buffer or destructive ownership capability escapes.

Cocos Box/Sphere/Capsule all and closest sweeps share the same complete collector/resolver, nearest-per-Collider dedup and distance/logical-ID sort. Public directions and quaternions are copied and normalized without mutating user objects. Negative height/radius is rejected before float32 rounding so a negative underflow cannot silently become zero. Capsule cylinder height zero is explicit sphere geometry; positive/negative values are not silently clamped.

## Producer-only copied reads

`queryBox3DCommittedColliders` and `queryBox3DCommittedRay` require the exact object supplied to the currently executing public before-step callback. Each callback receives a unique frozen context, invalidated in `finally`. Cloned, previous-callback, next-tick, idle, nested-query, faulted and closed contexts do not authorize a read. The ordinary PhysicsSystem mutation guard remains unchanged. Native reads observe committed geometry before pending commands are committed.

Every requested Collider must be enabled and belong to the current world. Each included body must contribute all its active Colliders; omitting a compound child rejects rather than reporting complete coverage. All requested proxies/translated bounds are admitted before the first query. Only the exact supplied Collider group is excluded; no front obstacle may be lost by filtering a closest hit. Each child retains its own query identity, including offset compound children. Query stamps contain actual world generation, attempted tick, native step and mutation revision. Epoch must be unchanged on return. Results and scalar/array geometry are copied/frozen; Collider references are identities, not recursively frozen engine objects.

Committed proxies reconstruct the native float32 creation points: rounded box center +/- half extents and rounded capsule endpoints. Their rotation follows the pinned core's noncontracting float32 vector-operation order. Native queries retain the body origin and relative world-oriented points, avoiding loss caused by re-splitting a large offset center and nominal dimensions. Caller-facing dimensions report the resulting effective extents. Independent native geometry oracles, not this reconstruction itself, establish correctness.

## Initial overlap is not clearance

Raw conservative overlaps and cast hits remain intact. An overlap is not an MTD, deep-penetration recovery, or blanket permission to discard an obstacle. Copied per-child support geometry and same-epoch primitive blocker geometry may support a separately qualified Box-only departure policy. That policy must prove a shallow initial support-plane gap and nonnegative translation along its separating normal for each initial pair, retain all other blockers, and export its exact epoch/plane/start/end-gap/threshold. Unknown or deep overlap and unproven rotation deny movement. A cast miss alone cannot prove non-deepening: the fixed core's cast and overlap slop differ.

## Existing target mechanism

`createBox3DKinematicTarget` exposes the existing owner-validated exclusive target lease. Creation is idle-only on an actual enabled kinematic body. `setTarget` queues at the allowed safe command boundary, never writes Node pose. Clear/dispose keep existing paired native velocity cleanup, pause, generation, duplicate-lease and lifecycle behavior. Query support does not authorize component mutation in producer callbacks.
