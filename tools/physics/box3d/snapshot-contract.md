# Additive copied snapshots, g foundation

Wire ABI remains 1. All existing signatures and numeric layouts are unchanged;
new symbols and the new schema SHA identify this limited extension. The facade
requires its exact schema, not just any schema claimed by a caller. An old e
module cannot satisfy the new snapshot interface. This is not complete T07,
C21, C22, the Cocos event adapter, or G1 acceptance.

## Native sources and unresolved anchor epoch

All references are to core `efca0c184d40fd6a82016983f1601c4d23965867`:

- `include/box3d/types.h:1071–1304`: transient body/contact/sensor arrays and
  borrowed manifold pointers. End events can refer to already destroyed IDs.
- `src/physics_world.c:1134–1146`: narrow phase precedes solve/integration;
  `1748–1810`: body events and previous-buffer contact/sensor end-event getters.
- `src/contact.c:575–584, 866–880`: generated anchors are world-oriented vectors,
  subsequently adjusted relative to body COM.
- `src/physics_world.c:650–733`: recycling explicitly keeps anchors, updates only
  separation using cached rotations, and skips a new manifold generation.
  Current step-pre COM/rotation therefore cannot be asserted as a universal basis.
- `src/body.c:464–514`: touching-contact traversal is not restricted to awake
  bodies. A sleeping pair can remain in contact without new begin/hit/move events.
- `src/contact_solver.c:888–889`: solved normal and total-normal impulses are
  written back to manifolds. Geometry anchors are not similarly normalized here.
- `src/solver.c:2127` constructs hit-event point using the native convention.
  That copied field is not substituted for generic C21 world/local contact points.

Public `b3ContactData` does not expose cached rotations or a verified generation
pose for all recycling/CCD paths. g retains raw normal, anchor, separation,
baseSeparation and impulses, and separately records step-before/after
origin/rotation/COM. `contactWorldPoints` explicitly throws
`AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH`. It does not return an empty success or
choose an unproven pose. The rotating, eccentric-COM fixture records real numbers
for later qualification; it does not use inverse-formula round trips as geometric
proof. Full C21-SNAPSHOT remains BLOCKED, not removed from the required contract.
A later reviewed source patch may expose generation pose or normalize native
points, but that requires its own patch identity and affected-path fixtures.

## Ownership and timing

- `bodyTransforms(world, bodies)` validates every token and native ID/world before
  writing the output, then uses one native batch call. It returns ten copied
  floats per body: origin.xyz, quaternion.xyzw, world COM.xyz.
- A successful `step` copies native body/contact/sensor event arrays immediately,
  before returning to caller code. It also copies touching-contact manifolds for
  owned bodies, deduplicating by all three official contact-ID words. This is not
  a claim to enumerate unowned bodies inserted by arbitrary raw native callers.
- Event IDs are observational data, never body/shape ownership tokens. End IDs
  retain their exact generation even if the slot has been reused.
- Step snapshots consist of recursively frozen ordinary JS objects/arrays. The
  retained buffers are owned copies, not HEAP views. Repeated reads of the current
  unmodified step return the same immutable snapshot without consuming events.
- Contact capabilities are WeakMap-owned and bound to world, step and mutation
  revision. Foreign/forged tokens, next step, successful mutation and destruction
  reject access. The already returned data itself remains readable and unchanged.
- Mutations invalidate retrieval of the previous step, not its copied data.
  Invalid operations do not invalidate a valid snapshot. Destruction clears the
  world's retained current snapshot and owned-body set.
- If physics step succeeds but copying fails (for example allocation failure),
  the step has happened; retrieval stays unavailable and an explicit
  `AIR_E_BOX3D_SNAPSHOT_UNAVAILABLE` error reports that fact. No false rollback or
  empty successful event list is claimed.
- Native event/manifold readers check caller capacity before writing. Native
  temporary contact arrays are freed on every path. These are not general
  raw-pointer sandbox guarantees; direct native calls require valid caller buffers.

Sensor and contact/hit flags are explicit. `createOffsetSphere` supplies actual
native eccentric geometry and optional sensor creation; it does not alter the
existing sphere signature. The slow thick-sensor fixture is not the thin-sensor
transient CCD acceptance test. No synthetic stay/begin/end data is generated.

## Measured g evidence and remaining work

Both fresh Debug/Release builds pass the real seven-group snapshot fixture and
independent two-grow live contact/sensor fixture. Their complete copied event
and raw contact diagnostics match exactly. Build artifacts, actual commands,
compile/link flags, raw results and source inputs are retained separately from
historical e results. The supplemental first growth records preserve a detached
buffer length observation error; corrected g2 records read the old length before
allocation and are separate, not rewritten passes.

The eccentric rotating contact has an approximately 0.3 m origin/COM offset.
Across twelve captured samples, naive pre-COM-plus-anchor endpoints differ by
0 to 0.018782927908642163 m, and post-COM-plus-anchor endpoints by
0.004697077175223756 to 0.023477973897488937 m. These are hypothesis diagnostics,
not contact-world points, numerical acceptance tolerances or proof of epoch.
The raw per-sample poses/anchors and numeric derivation are preserved for a later
minimal upstream patch review. A proper extension must expose a verified cached
basis or perform native normalization, cover regeneration/recycling/CCD/sleep
paths, and get a new patch-chain/schema identity. It may not substitute hit.point
or use inverse-formula round trips as independent geometric verification.

## Separate generation-basis extension

The g raw wire described above remains unchanged, including its unresolved-basis
labels when considered alone. The later [generation geometry extension](geometry-epoch-contract.md)
adds an independent 25-word basis reader and a separately copied `contact.geometry`
record. Only that record's status authorizes `contactWorldPoints`. It is explicitly
cached generation geometry, not a post-step intersection or same-epoch impulse
claim. Historical g artifacts still reject through their old schema/patch identity.
