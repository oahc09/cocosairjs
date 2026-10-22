# Box3D contact geometry epoch proposal

Status: **PROPOSAL, NOT IMPLEMENTED OR QUALIFIED**. This document preserves the
read-only C21 investigation. No core, shim, facade, build input, lock, manifest or
g artifact was changed for this proposal. C21 remains IN_PROGRESS; full C22,
T07 and G1 remain incomplete. The g source/artifact checkpoint stays frozen.

## Fixed inputs and scope

- Official core: `erincatto/box3d@efca0c184d40fd6a82016983f1601c4d23965867`.
- Binding reference: `isaac-mason/box3d.js@5d5a3af049cccd9948b2b55bac4342414af0ef64`.
- Current g wire ABI: `1`; schema SHA256:
  `3aa11fe9d3d4b0269105bddbfebd8a1d09c9a3d162d88cb416d35d4304d1f30a`.
- Current g staged SSE2 patch-chain SHA256:
  `20dd450a4313774e1d934df9fa9ec3458df35d9ee314beffa9d846404cdb86bf`.
- Requirement: [v1.2 reference §6.5, T07/T09/T15, C21-SNAPSHOT](../../../../ai/plans/box3d-v1.2-reference.md).
- Current limited behavior: [g snapshot contract](../../../../tools/physics/box3d/snapshot-contract.md).

The proposed extension exports the **cached manifold's actual generation-time
geometry**, not a freshly intersected post-step manifold and not a CCD/TOI hit
point. It must not reinterpret the frozen g raw anchors or weaken its explicit
`AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH` behavior before a new candidate is tested.

## Source-grounded lifecycle

All links below are pinned to the official core SHA above, not a moving branch.
The local imported source manifest already byte-verifies these originals.

| Path                                                                                                                                                                                                                                                                                                          | Evidence and consequence                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [contact.c:575–584](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/contact.c#L575-L584)                                                                                                                                                                                 | Convex contact points originate in frame A, are rotated into world-oriented anchors, and translated into A/B origin-relative representations.                                                                                                              |
| [mesh_contact.c:1186–1196](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/mesh_contact.c#L1186-L1196)                                                                                                                                                                   | Mesh contact points originate in frame B. This is not evidence that a convex-only fixture qualifies mesh.                                                                                                                                                  |
| [contact.c:633–643](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/contact.c#L633-L643) and [825–880](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/contact.c#L825-L880)                                                         | Flipped convex paths swap anchors and negate normal; compound offsets are adjusted before both anchors are made relative to body COM. Capture must occur after this common processing, using parent body poses.                                            |
| [physics_world.c:646–747](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L646-L747)                                                                                                                                                                     | Actual bodySim transforms feed collision generation. Recycling retains anchors and normal, updates separation using cached rotations, then skips generation. This file contains the sole persistent-contact call to `b3UpdateContact` in the fixed source. |
| [physics_world.c:777–789](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L777-L789)                                                                                                                                                                     | After generation, `baseSeparation` caches the newly generated separation; the successful recycling branch has already continued before this code.                                                                                                          |
| [physics_world.c:1134–1162](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L1134-L1162)                                                                                                                                                                 | Narrow phase precedes solve/integration; sensor overlap processing follows it.                                                                                                                                                                             |
| [solver.c:1450–1463](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/solver.c#L1450-L1463)                                                                                                                                                                               | `world->stepIndex` advances at entry to solve, after narrow phase, including the no-awake-body return. It is not a universal narrow-phase invocation counter.                                                                                              |
| [contact_solver.c:873–889](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/contact_solver.c#L873-L889) and [contact_solver_wide.inl:1540–1550](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/contact_solver_wide.inl#L1540-L1550) | Scalar and wide solver paths write impulses back, not new geometric anchors.                                                                                                                                                                               |
| [solver.c:411–450](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/solver.c#L411-L450) and [575–604](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/solver.c#L575-L604)                                                            | CCD computes TOI, advances body origin/COM/rotation and corrects the move event. It does not regenerate the persistent contact manifold.                                                                                                                   |
| [body.c:464–514](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/body.c#L464-L514)                                                                                                                                                                                       | Public body contact traversal includes touching sleeping contacts. Lack of new move/begin/hit events does not imply that the pair vanished.                                                                                                                |
| [body.c:1063–1073](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/body.c#L1063-L1073) and [1966–1976](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/body.c#L1966-L1976)                                                          | COM changes invalidate the relative-transform cache. A getter must not substitute the new COM into old anchors.                                                                                                                                            |

### Distinct epochs

1. **Generation geometry:** body origin, rotation, COM, native anchors and world
   normal at the actual manifold-generation boundary. These define the geometry
   returned by the proposed extension.
2. **Recycled separation:** a later narrow-phase estimate using stored anchors
   and cached rotations. It does not move the geometry's generation epoch.
3. **Solver observations:** last-substep normal impulse, accumulated impulse and
   sampled pre-solve velocity have their own meanings. Sleeping contacts can
   retain historical solver values. Reading them after a step does not prove they
   were written in that step.
4. **CCD body pose:** a TOI-adjusted body/move-event pose, distinct from any
   earlier manifold generation. A TOI alone must not create a synthetic contact
   geometry record.
5. **Read snapshot:** the completed call/step at which the binding copies data.
   This is an ownership/lifetime epoch, not the geometry-generation epoch.

The minimum patch does not claim that all five are the same instant. It cannot
turn cached points into exact current-surface intersections without a larger,
separately reviewed collision-query change.

## Proposed geometry-only patch

### Stored basis and capture point

Append an independent basis record to internal `b3Contact`. Do not repurpose the
recycling cache and do not alter `b3ManifoldPoint` or existing field offsets.
Proposed field names, to be reviewed before implementation:

| Field                   | Proposed meaning                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geometryValid`         | False until a successful manifold generation; false after an unsuccessful generation.                                                                            |
| `geometryRevision`      | Per-contact uint64 generation serial, advanced only when a new manifold is generated. Interpret together with the complete contact ID and facade world lifetime. |
| `generatedAfterStep`    | Exact native `world->stepIndex` observed at generation, before the subsequent solve increment. This is a completed-solve boundary, not an asserted event tick.   |
| `generationOriginA/B`   | Actual parent-body origin supplied to that collision generation.                                                                                                 |
| `generationRotationA/B` | Actual parent-body rotation supplied to that collision generation.                                                                                               |
| `generationCOMA/B`      | Actual corresponding `bodySimA/B->center`, captured without using a later public body getter.                                                                    |

Capture immediately after the successful `b3UpdateContact` call at
`physics_world.c:746–747`, after all child/flip/COM anchor processing has completed.
Store the exact transforms passed to that call and the matching bodySim COMs.
On unsuccessful generation, invalidate the record. Contact creation already
zero-initializes its storage at `contact.c:199–203`; new fields must preserve that
property and remain safe under slot reuse.

Recycling, sleeping, solver writeback and CCD must not overwrite the generation
basis. `geometryRevision` distinguishes repeated generation even if the native
completed-solve boundary has not advanced, such as raw zero-dt narrow-phase work.
Counters must cross the wire as uint32 halves or bigint, not a packed JS Number.
Finite tests cannot prove that generation counters never wrap.

The geometry values alone require 20 float components in the current float32
build. Total structure growth includes counters, validity and padding; exact
native/WASM32 sizes must be measured, not guessed here. If diagnostic path flags
or a last-narrow-phase stamp are added, declare them explicitly rather than
inferring “recycle” merely because a geometry revision stayed constant. The
existing native `recycledContactCount` can establish actual branch execution in
an isolated single-contact fixture.

### New read function and wire

Proposed public core function: `b3Contact_GetGeometryBasis(contactId, outBasis)`.
It returns a success boolean and copies an independent POD value. Failure must
leave caller output unchanged. It must reject null output, invalid contact,
locked world, missing manifold, invalid geometry basis, and an invalidated
relative-transform cache. It returns no internal pointer.

The binding additionally verifies its own world token and complete native
contact identity before calling the getter. Native numeric IDs alone are not
world-lifetime or module-lifetime capabilities. Successful mutations invalidate
current facade retrieval; previously copied JS records remain unchanged.

Add a separate C17 copied wire reader, not a silent expansion of the g contact
header or its 14-word point stride. Preserve old wire ABI-1 exports and layouts.
The new record should identify:

- Complete contact/shape/body identities, geometry revision and
  `generatedAfterStep`.
- A/B generation poses and COMs.
- Geometry source enum such as `CACHED_MANIFOLD_GENERATION`, never `POST_STEP` or
  `TOI` unless a different independently qualified API actually provides that.
- Copied raw anchors and normal; derived generation world/local points and normals.
- Read-time step/revision separately from geometry generation.

World point A is computed from generation COM A plus its matching native anchor;
B uses its own generation COM. Local points use the matching generation body
origin and inverse rotation, not collider origin or current Node pose. Normal
keeps native A-to-B orientation; self/other sign and local rotation are separate,
explicit operations.

`baseSeparation` may be documented as the generation cached separation in this
fixed source. Current raw `separation`, velocity and impulse values remain
separate solver observations; they must not be described as sampled at the
geometry epoch. If exact last-solve provenance is required, a later explicit
extension must stamp both scalar and wide impulse-writeback paths. The minimum
geometry-only patch does not silently claim that provenance.

### Expected patch surface and identity

Expected core edits are limited to five existing files: `src/contact.h`,
`src/contact.c`, `src/physics_world.c`, `include/box3d/types.h`, and
`include/box3d/box3d.h`. Exact solver-writeback stamps would add
`src/contact_solver.c` and `src/contact_solver_wide.inl`; they are not implicitly
part of the minimum patch.

Original vendor bytes and licenses remain unchanged. Apply a second reviewed
patch after the existing SSE2 patch in a fresh staged copy. Lock base core commit,
patch bytes and each file's before/after SHA256; no offset or fuzzy patching.
Recalculate patch-chain identity, schema hash and generated/runtime/facade
identity together. Old g, missing identity and forged-manifest combinations must
reject. New function names, types and schema are proposals, not shipped API.

Avoid extending `b3ManifoldPoint`: the wide solver has explicit layout assertions
at [contact_solver_wide.inl:431–438](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/contact_solver_wide.inl#L431-L438).
Appending contact metadata still changes contact-array stride and memory cost;
compile/layout checks and original-versus-candidate physics comparisons remain
necessary. Compare physics independently from expected allocation-size changes.

## Native snapshot incompatibility

[world_snapshot.c:837–875](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/world_snapshot.c#L837-L875)
serializes raw `b3Contact` storage before its manifold arrays. The native snapshot
layout hash includes `sizeof(b3Contact)` at
[lines 41–54](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/world_snapshot.c#L41-L54),
and the reader rejects a mismatched hash at
[lines 1175–1178](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/world_snapshot.c#L1175-L1178).

The new contact layout is not compatible with old native snapshot images.
Require explicit rejection tests if that path is exercised; never relabel old
images or promise replay compatibility. This work does not implement or qualify
AIR recording/replay. Patch-chain identity remains required in any future outer
recording envelope even when the native layout hash happens to match.

## Independent qualification fixtures

All proposed checks require real newly compiled candidate physics and retained
raw values. Freeze exact test geometry, tolerances and commands before running.
Do not relax a threshold after seeing a failure. Historical g results are not
candidate results.

1. **First generation, asymmetric rotating sphere–sphere.** Use unequal radii,
   nonzero angular velocity, offset geometry/COM and asymmetric poses. Independently
   compute world sphere centers from fixture geometry and independently saved
   body poses. The normal is their normalized difference; separation is center
   distance minus both radii; the contact is the midpoint of the two facing
   surface points. Compare both native A/B reconstructed points against that
   independent midpoint, not merely against each other. The source convention
   is explicit in [convex_manifold.c:208–250](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/convex_manifold.c#L208-L250).
2. **Sphere versus finite box face.** Choose a nondegenerate interior-face case
   and verify the projected point lies inside the finite face bounds. Use a
   separate analytic closest-point/midpoint computation with known box geometry,
   not Box3D's distance routine as the only oracle. Include rotated/eccentric
   body poses and distinguish body origin from COM. See the native midpoint
   convention in [convex_manifold.c:338–357](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/convex_manifold.c#L338-L357).
3. **Actual recycling and regeneration.** In an isolated contact scene assert
   positive native `recycledContactCount`, then assert unchanged generation
   revision/basis while later separation can vary. Compare the retained geometry
   against the independently saved geometry from its generation boundary, not
   against current surfaces. Separately disable recycling or leave its permitted
   region to force actual regeneration and verify the new basis against an
   independently saved pre-call pose. Configuration changes are explicit test
   variants, not a product-default workaround.
4. **Solve and CCD distinction.** Use a floor contact while a fast body moves
   toward a separate wall, so CCD can alter the final body pose without rewriting
   the earlier floor manifold. Establish actual TOI through native diagnostics
   and independent geometry/trajectory checks. Also cover a first TOI with no
   preexisting manifold: it must not yield fabricated contact geometry; accept
   a later real manifold only when native creates it. Keep any qualification-only
   internal instrumentation separate from product capability claims.
5. **Sleep, mutation and ownership.** Preserve a sleeping pair with no fresh
   begin/move event, read both sides with correct normal orientation, then test
   mutation, destruction, native slot reuse, foreign/forged tokens, next step and
   actual heap growth. Old copied records must remain byte/value unchanged;
   stale capabilities must reject. Include COM-change cache invalidation before
   a newly generated basis is available.

For first-generation and regeneration checks, compare exported basis values with
independently retained actual call-boundary body poses. An oracle that takes only
possibly wrong exported basis values as input could mask a wrong capture point.
World/local inverse round trips are useful secondary consistency checks, not the
independent geometric proof.

Do not use native `hit.point` or `b3World_Draw` contact points as the oracle.
Hit construction uses post-solve centers and cached anchors in
[solver.c:2100–2128](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/solver.c#L2100-L2128);
debug contact drawing similarly combines current COM and cached anchor in
[physics_world.c:1534–1550](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L1534-L1550).
Neither establishes generation-epoch correctness.

### Explicit coverage limits

Mesh, baked compound and heightfield are **not covered** by the initial analytic
sphere/box fixtures. Their common final COM adjustment makes the capture point
plausible, not qualified. They need separate finite-triangle/child-transform/
heightfield geometry oracles and A/B-flip coverage before their C21 subcases can
advance. Keep unsupported-path errors explicit in any staged rollout. Thin and
transient sensor CCD/C22, complete event adapter semantics, browser/CSP testing,
full sanitizer qualification and G1 are also outside this proposal's passes.

Retain every failing native/candidate raw result. Existing original sanitizer
FAIL and candidate ASan/LSan `BLOCKED_LSAN_PTRACE` are not superseded by ordinary
Node WASM success. Do not disable checks or alter the original vendor tree to
produce a green result.

## Small T09 binding prerequisites and acceptance

The actual [IPhysicsWorld interface](../../../../src/cocos/physics/spec/i-physics-world.ts)
requires gravity, allowSleep, default material, debug controls and integration
with the existing step/event/sync sequence. This is not a request to expose all
native APIs.

| Priority                  | Native bridge needed                                                         | Minimum real acceptance                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required                  | `b3World_SetGravity` / `b3World_GetGravity`                                  | Change a live world's gravity, read back and verify next fixed-step velocity/position. Reject NaN/Infinity/float32 overflow before mutation; invalid calls preserve state/counters. Document that native setter does not itself wake sleepers.                                  |
| Required                  | `b3World_EnableSleeping` / `b3World_IsSleepingEnabled`                       | Set false on a world with sleeping bodies, observe real waking, then re-enable and observe native sleeping behavior. Reject non-booleans and foreign/disposed world tokens without mutation.                                                                                    |
| Configuration/diagnostic  | `b3World_EnableContinuous` / `b3World_IsContinuousEnabled`                   | Preserve frozen default enabled; explicit test variants read back correctly. Do not call this a body-level CCD switch or use disabling it to bypass CCD tests.                                                                                                                  |
| Required diagnostics      | `b3World_GetAwakeBodyCount` and copied `b3World_GetCounters` subset          | Add awake contact/body, recycled-contact and TOI-iteration observations to existing counts. Verify actual changes in isolated fixtures; values are observations, not proof of every CCD guarantee.                                                                              |
| Required debug foundation | `b3World_Draw` with static native callbacks and copied primitive records     | Produce actual wireframe/AABB primitives for supported box/sphere geometry; validate body-transform × collider geometry. Return explicit capacity/unsupported errors, never empty success for an unimplemented flag. No native pointer or HEAP view escapes.                    |
| Material prerequisite     | Shape `SetSurfaceMaterial` / relevant readback, with an owned-shape registry | There is no native world default-material setter. Validate all affected default-material shapes before committing, preserve explicit per-shape materials and rollback semantics. Do not substitute a mixing callback or silently no-op. Full material mapping remains T10 work. |

Source details:

- World API declarations are pinned in [box3d.h:131–242](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/include/box3d/box3d.h#L131-L242).
- Disabling world sleep wakes sleeping solver sets in
  [physics_world.c:1979–2006](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L1979-L2006).
- Gravity assignment has no finite-value validation or wake action in
  [physics_world.c:3435–3447](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L3435-L3447);
  the binding must enforce its input contract.
- Debug callbacks, flags and `jointScale` are in
  [types.h:3060–3144](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/include/box3d/types.h#L3060-L3144).
  Shape drawing also requires `b3WorldDef` create/destroy-debug-shape callbacks;
  without them [physics_world.c:1315–1359](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/physics_world.c#L1315-L1359)
  does not supply ordinary shape primitives. Map Cocos wireframe/constraint/AABB
  flags and validate a finite nonnegative constraint display size; do not just
  cache JS flags and claim drawing occurred.
- Material APIs are shape-level in
  [box3d.h:928–944](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/include/box3d/box3d.h#L928-L944).

Tick diagnostics must surround the existing one native step per fixed tick,
recording actual dt/substeps and copied outputs. No second RAF or accumulator is
introduced. `body gravityScale`, body allowSleep/sleepThreshold/wake and damping
are the next T10 group, not justification for an indiscriminate API expansion.
The current convenience closest ray remains limited and does not qualify full
IPhysicsWorld ray/sweep/filter behavior.

## Next decision and stop condition

Review and freeze the field names, generated-step boundary meaning, supported
shape paths and analytic fixture tolerances before implementation. Then create
an independently identified candidate, coordinate a serial build window, and
retain original-versus-candidate raw comparisons. A candidate may advance only
its actually tested subcases; it cannot turn g results into new-schema passes.
Until that happens, keep current g sources/artifacts intact and C21 IN_PROGRESS.
