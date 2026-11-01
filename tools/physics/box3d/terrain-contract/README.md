# Terrain query / lifetime candidate — preparation, not qualification

Status: eleven CPU/source tests PASS; JS syntax checks PASS. **No native compilation,
WASM loading, physics stepping, browser run, or old evidence credit** occurred here.
Protected `prepare-branch-build/source` and SDK223 were read only.

## Interfaces and files

- `oracle.mjs`: independent piecewise-triangle 3x3 fixture, six hand-calculated rays,
  fixed b-c diagonal `[a,c,b],[d,b,c]`, unequal X/Z spacing 2/3, independent transformed
  triangle-ray and closest-point distance mathematics. No cooker/engine import.
- `oracle.test.mjs`: CPU only. Center + positive nonuniform scale is baked as
  `(vertex + center) * scale`, then node yaw/translation; half-open ray `[0,L)`;
  backface rejection. Contract tolerance remains **0.01 m**, not a broadened epsilon.
- `public-terrain.mjs`: exports `runPublicTerrainQueries(sdk, scene, step)` for a fresh
  production-ESM harness that already initialized the app and exact ST assets.
  `step()` must perform one real fixed tick and deferred destruction, following the
  prior public mesh consumer's createStepClock contract. Requires exported
  TerrainCollider, SphereCollider, RigidBody, Node, PhysicsSystem, Vec3,
  geometry.Ray, registerBox3DBeforeStep and queryBox3DCommittedRay.
  Covers six rays for three shared users and a centered/scaled/yaw-rotated user,
  ray endpoint/backface, sphere/box/capsule sweep attribution, committed source-face
  metadata, static-only guards including null/disabled, failed replacement,
  null/disable/enable/swap and out-of-order destroy, source-face copied lifetime,
  and a real falling sphere against the *same uneven terrain*.
  The sphere oracle requires first contact within 90 fixed 60Hz steps followed by
  a predeclared 12 additional steps, explicit zero linear/angular damping and
  zero-restitution material (friction 0.6), independent triangle-distance nonpenetration
  and signed above-surface checks throughout, plus divergence from freefall after
  contact. It does not falsely require a rolling ball to remain stationary.
  `drop-oracle.test.mjs` rejects old false-positive 60Hz/120Hz ballistic traces.
  Public TerrainCollider identity and actual `collider.shape.impl` kind/nativeKind/
  provenance are asserted; no nonexistent copied hit identity fields are invented.
  Sweeps check attribution only (not an invented full sweep-accuracy gate).
- `native-terrain-lifetime.mjs`: exports `runNativeTerrainLifetime(actualFacade)`.
  Uses real production bridge cook/leases/shape borrows, six native rays and source
  face attribution, copied source/result data, nonstatic rejection, cache-first,
  cache-last and remaining-borrows world teardown. Module-exclusive counters must
  prove exactly one actual mesh destruction; core bytes must return to baseline.
  No mock or JS ownership counters are accepted as this evidence.
- `run-native.mjs`: future explicit native driver with fresh output only and asset/
  fixture SHA256 evidence. **Not executed.** Example after separate authorization:
  `node run-native.mjs --authorized-fresh-st READY_ST_DIR FRESH_REPORT.json`.
  This alone does not certify the public TerrainCollider cohort or full C17/C19.
- `probe-source/`: seven source-overlay files for the implementation agent, not
  edits to the protected source. Includes native contract changes to check the
  counters on real production bridge releases. Requires rebuilt same-product ST.
- `probe-source.test.mjs`: source assertions only, not C/native execution.
- `probe-identity.test.mjs`: controlled CPU identity module, not WASM. Exact new
  schema/new export accepted; old product and missing-export module rejected at
  constructor entry before scratch allocation. Tests can also run after copying
  into `source/tools/physics/box3d/terrain-contract/`.
- `drop-oracle.mjs`, `drop-oracle.test.mjs`: sustained-response observation reviewer
  and nonphysical counterexamples, not simulation evidence.

## Minimal new native probe (root-authorized)

`api.meshLifetimeCounters(): { cooks: bigint, destroys: bigint }`, facade exclusive
read, wrapping `air_b3_mesh_lifetime_counters(uint32_t *outFour)`.
Wire is `[cookLow,cookHigh,destroyLow,destroyHigh]`; existing `readU64` combines
words. No WASM_BIGINT flag or i64 wire change.

`cooks` increments after each nonnull `b3CreateMesh` result, including temporary
cooks that later roll back. `destroys` increments after every actual
`b3DestroyMesh` returns, including rollback and world teardown. Counts represent
**completed native mesh destruction, not individual allocator malloc/free calls**.
The same fixture also requires core allocator live-byte baseline, as approved by
root. Cook refuses capacity before creation at counter saturation; destruction is
never blocked, overflow becomes sticky and reads fail without touching output.
Counters are module cumulative, contain no raw pointer or tombstone, and never
reset. Exclusivity/isolation is essential for meaningful deltas.

Existing real interfaces reused unchanged: `cookStaticMesh`, `retainStaticMesh`,
`releaseStaticMesh`, `staticMeshState` (`cacheLeases`, `shapeBorrows`, counts/bytes),
`createStaticMeshShape`, `staticMeshSourceFace`, `rayAllRaw`, `liveBytes`,
`bridgeMemory`. Existing production public APIs do not expose exact native free
counts; public lifecycle behavior must not claim C19 by itself.

## Source references (all relative to B)

B = `/workspace/scratch/62d43a81bbde/box3d-resume-20261025T1146`

- Contract: `dependency-recovery/restored/workspace/tools/verify/box3d/collider-retirement-contract-review-20261022-a/inputs/ai/plans/box3d-v1.2-reference.md`, lines 663/665.
- Real facade lifecycle reuse: `prepare-branch-build/source/tools/physics/box3d/wasm-mesh-contract.mjs`.
- Production bridge: `prepare-branch-build/source/tools/physics/box3d/native/mesh_bridge.c`, `mesh_contract.c`.
- Public ESM pattern: `dependency-recovery/restored/workspace/tools/verify/box3d/public-static-mesh/consumer.mjs`.
- Source integration pattern: `dependency-recovery/restored/workspace/tools/verify/box3d/static-mesh-public/public-mesh.test.ts`.
- Rejected as production C19 proof: old `static-mesh-qualification/core-fixture.c`
  tracked allocator belongs to an explicit fixture ownership model, not product bridge.
- Shared mathematical inputs aligned with `heightfield-next-candidate/heightfield-contract.test.mjs`;
  this oracle does not import that file or production intake.

## Pending evidence / boundaries

Need source overlay integration (including implementation agent updating
`versions.lock.json.apiSchemaSha256` to the new schema digest), fresh build including updated ABI schema/export
hashes, actual ST bridge execution, and fresh production ESM public test. A host
consumer must lock the actual runtime, fixture and asset hashes and retain raw
reports; old mesh 59 checks / SDK222 / SDK223 receipts cannot be relabeled.
No native `b3_heightShape` is asserted: native kind is mesh, public kind terrain.
Unqualified terrain events remain fail-closed. No holes implementation is added.
