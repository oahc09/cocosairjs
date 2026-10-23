# Native convex point-cloud admission

Status: source integrated, execution pending. This does not qualify the facade,
Cocos MeshCollider lifecycle, EX01, all C14 categories, or any complete gate.
Existing evidence from earlier patch chains does not qualify this chain.

## Wire and ownership

ABI1 adds `air_b3_mass_hull_create(world, bodyLo, bodyHi, positions, pointCount,
positionFloatCount, density, sensor, requestedMass, outId)`. Positions are exactly
3*N finite float32 XYZ body-local coordinates, N >= 4. Density is positive,
sensor exactly 0/1, requested mass nonnegative. Output is two full-ID uint32 words.
Current WASM memory ranges, four-byte alignment, checked lengths and input/output
non-overlap are validated before reading. All points are copied, never truncated.

`air_b3_hull_validate(world, positions, pointCount, positionFloatCount)` uses the
same real cooker and all-input geometry validation, then releases it. It creates
no body or shape, even on success. This lets a disabled MeshCollider reject a bad
candidate before replacing its stored mesh. World is only a lock and temporary
resource owner. Validation does not promise body-specific aggregate mass validity;
creation still preflights mass/inertia, COM, velocity adjustment, extents and AABB.
No cooked pointer/cache or borrowed input survives either call.

## Limits and exact arithmetic

128 vertices, 128 faces and 128 full edges (256 half-edges) are output topology
limits, not a raw-point cap. Duplicate/interior inputs may be arbitrarily numerous
within checked resource capacity; the fixture includes 256 points reducing to a
real tetrahedron. Convex MeshCollider means a convex envelope of the point cloud,
not preservation of concave triangle-mesh topology. Non-convex mesh mode remains
unsupported and must not be quietly hull-cooked.

The staged core `b3GetHullWorkspaceSize` derives workspace from actual private C
`sizeof` layouts with checked multiply/add/align8, not copied struct guesses:

- vertices: N+4
- half-edges: max(48, 24*M-48)
- faces: max(16, 5*M-10)
- horizon and cone pointers: each max(6, 3*M-6)
- merged-face pointers and horizon frames: each max(4, 2*M-4)
- shifted points: N `b3Vec3` values, unrounded final array

M is 128 for the ABI. N+4 must fit int, total workspace must be <= INT_MAX because
core allocation accounting casts bytes to int, and every size calculation must
fit size_t. Let P=N*sizeof(b3Vec3), O=align8(P), W=core workspace, S=O+W. Both calls
use the same creation planner: P+S+8 <= `emscripten_get_heap_max()` on WASM or
SIZE_MAX on host, and 3*N <= INT_MAX. The common eight-byte output reservation also
applies to validation so disabled admission and creation have one capacity rule.

This is a necessary address-space bound, not available-memory proof. Allocator
metadata, other live allocations, final cooked hull, world clone/map and shape
storage remain additional. No arbitrary input-count threshold is introduced.

## Geometry and numerical semantics

The additive checked core route shares legacy construction/emission. Before
origin restoration, it checks every original shifted point against every final
builder plane using actual `b3PlaneSeparation` and the core's exact `minOutside`.
It rejects only separation > minOutside; equality is admitted. Exhausted vertex
addition budget is diagnostic, not topology. A reduced hull excluding a point is
refused rather than substituted. The bridge also checks every original point
against actual restored output planes at the same bound, without added epsilon.
Large-translation cancellation can therefore produce structured refusal.

Core output is checked for finite mass properties and valid bounded topology,
reciprocal twins/endpoints, closed face rings, every half-edge visited and Euler
identity. Ordinary no-volume/over-limit/degenerate results are explicit failures.
Narrow finite guards before existing numeric assertions are not a robust geometry
rewrite or a promise that every pathological finite input avoids a core trap.

## Mutation and allocation phases

1. Payload, world/body identity, lock, pointer and capacity validation: no writes.
2. One tracked bridge scratch allocation owns copied points and exact workspace.
   A null allocation returns ALLOCATION without world/body mutation.
3. Cooking uses caller workspace, but final `b3HullData` still uses core b3Alloc.
   Ordinary failures release all temporary resources. Core OOM/assertion/trap is
   UNKNOWN; cleanup after a trap and all-OOM rollback are not promised.
4. Validation releases the hull and scratch, then returns, without world mutation.
5. Creation validates mass/bounds before `b3CreateHullShape`, the first mutation.
   Core clones/interns geometry; requested mass is then applied. Output ID is only
   written on success. Normal returns free the temporary hull and scratch.

For creation, statuses 1,2,4,5,8,9 prove prewrite refusal. Status0 means committed
before facade readback; readback failure must not replay creation. Status3,
unexpected status or native trap remains UNKNOWN and faults the facade world.
For validation, status0 means no persistent world mutation. Native trap remains
UNKNOWN even though no create call was intended. Never relabel it rollback.

## Retained fixture and baseline denominator

`hull_contract.c` covers genuine asymmetric tetra mass/off-diagonal inertia,
non-box ray hits/misses, half-edge debug geometry, ordinary no-write rejections,
disabled-candidate geometry validation, copied input lifetime, command/motion,
256 raw points, exact 128-full-edge boundary/130-edge refusal, capacity arithmetic,
sensor mass fallback and 128 lifetimes. Memory assertions compare live counters,
not shrinking heap capacity. Core default logs are retained on stderr.

`hull_core_contract.c` includes the actual staged hull.c for exact layout and
minOutside predicate tests. It checks real legacy/checked equivalents, a real
budget-truncated octahedron rejection and exact representable float boundaries.
The tiny plane test is numerical-unit evidence, not physics evidence.

`hull_legacy_fingerprint.c` is compiled unchanged in two independent builds. The
baseline is the pinned efca0c1 core with the two previous patches, without the new
Hull patch, not the unrelated historical 8441 core. `hull-legacy-contract.mjs`
strictly stages that exact prefix in a fresh child directory, recompiles every
core source sequentially and compares tetra/prism/256-point fingerprints against
the current executable within the same host/WASM and Debug/Release mode. Internal
patched legacy/checked comparison is additional, never a replacement for this.

`build.mjs` runs these contracts and preserves each failed command and receipt.
`audit-artifacts.mjs` requires the additional compile/input inventory and retained
independent comparison. Vendor sources and previous RED/PASS records are unchanged.
