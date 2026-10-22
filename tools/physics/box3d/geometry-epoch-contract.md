# Generation geometry extension

This is the narrow implementation of the frozen [C21 proposal](../../../docs/physics/box3d/rebuild/contact-geometry-epoch-proposal.md), not full C21, T07, T15 or G1 acceptance. Original core bytes remain fixed at `efca0c184d40fd6a82016983f1601c4d23965867`. Strict staging applies the SSE2 patch followed by `contact-generation-geometry-v2`. The old g artifacts, failed attempts and original sanitizer failures are not replaced.

## Exact sampling contract

The five-file geometry-only core patch stores a separate `b3ContactGeometryBasis`: uint64 `geometryRevision` and `generatedAfterStep`, both generation body transforms (origin and rotation) and both matching COMs. Capture occurs immediately after the actual `b3UpdateContact` call, after all anchor flip and COM adjustment. `generatedAfterStep` is the native completed-solve boundary at that moment, not the facade event tick. Two raw zero-dt collision passes can have the same boundary and distinct revisions.

Recycling keeps anchors and normal while updating separation. Its early `continue` never changes this basis. Sleeping, solver impulse writeback and CCD final-pose adjustment also do not change it. Current separation, velocity and impulses retain their separate native sampling semantics. No same-instant solver-observation claim is made.

The original contact allocator zeroes the whole contact on both allocation and slot reuse, then restores/advances the full native contact ID generation. Geometry starts invalid with revision zero. If an additional generation would wrap `UINT64_MAX`, the geometry becomes permanently unavailable for that contact lifetime, without changing physics. New contact allocation starts a distinct full ID/lifetime. This does not claim all native ID generations are mathematically immune to ABA.

`b3Contact_GetGeometryBasis` returns false without writing caller output for null output, invalid contact, locked world, missing manifold, invalidated relative-transform cache or unavailable basis. COM mutation invalidates the relative-transform cache; a later successful generation is required before geometry readback resumes.

## Additive wire and facade

Existing ABI-1 functions and g strides stay unchanged: contact header 34 words, manifold header 11, point 14. A separate `air_b3_contact_geometry` copies 25 words: source 1, two uint64 counters as low/high uint32 pairs, A generation pose 10 floats and B generation pose 10 floats. It performs full contact/world validation and capacity checks before output writes. Status 6 means unavailable basis; 7 means unsupported geometry family.

The historical raw contact fields `anchorEpoch: UNRESOLVED_CACHED_NATIVE` and `worldPointStatus: UNSUPPORTED_SNAPSHOT_EPOCH` describe the old wire **by itself**. They are retained rather than silently redefining that wire. The new, separate `contact.geometry.status` is the authority for the extension. `contactWorldPoints(handle)` returns that exact frozen copied generation record, or an explicit unsupported/unavailable error. It does not return current surface intersections.

Generation world A/B points use their matching stored COM plus raw anchor. Local points use the matching generation origin and inverse rotation. The record includes A-to-B and B-to-A world normals, and A-to-B normal expressed in each generation body frame. Complete contact/shape/body IDs, generation counters and read-time step/mutation revision remain distinct. All arrays/objects are copied and recursively frozen. No native pointer or HEAP view crosses a call. Next step, successful mutation, destruction and foreign/forged capability invalidate retrieval; previously returned data stays unchanged.

The shim structurally admits sphere–sphere and sphere–hull. The facade's current hull constructor only creates boxes. The actual analytic qualification is **unequal spheres and the interior face of a finite box**, not arbitrary convex hull features. Capsule, hull–hull, mesh, compound and heightfield fail explicitly at this extension. Arbitrary hull edge/vertex cases, mesh/compound/heightfield and complete C21 still require independent geometry fixtures.

`geometryCounters(world)` copies the native awake contact, recycled contact and three TOI iteration observations. These are diagnostic observations, not universal CCD proof.

The new schema and patch-chain hashes are pinned by version lock, build, runtime exports, manifest and facade. A real old g module rejects even with a forged current manifest. The product manifest remains four artifacts. The separate qualification executable `air_box3d_geometry_contract.cjs` embeds its own WASM using `SINGLE_FILE`; it is hashed as evidence, never shipped as a product artifact.

## Qualification and retained failures

- The analytic oracle does not use `b3World_Draw`, hit-event points or Box3D distance routines. It independently retains every pre-call body pose and uses known sphere/finite-box geometry. Exported generation poses must match the retained boundary exactly. World/local points, both normal directions and generation separation are compared against separate analytic geometry, not merely inverse round trips.
- Frozen numerical tolerances are 0.00002 m for points/separation, 0.00002 for normal components and exact generation-basis floats. The final finite box has 12 m half-widths. A predeclared tick-120 0.25 N·s local tangential impulse on the 0.5 m unit-density sphere has impulse/mass below 0.48 m/s, allowing less than 4 m free drift over the remaining eight seconds. Every sample still must lie inside the finite face with a 0.1 m margin. No teleport, speed clamp or skipped off-face sample is used.
- The native qualification fixture exercises actual contact-slot reuse, separate zero-dt revisions, locked/null/invalid/COM-invalidated no-write rejection, uint64 exhaustion via explicitly isolated internal test injection, floor manifold retention while CCD moves the body, and first TOI without a fabricated manifold. The injected counter boundary is qualification-only, not a product mutation API.
- JS checks exercise real regeneration/recycling/sleeping, two actual memory grows, copied-data immutability, stale/foreign/forged capabilities, real body-slot reuse, world destruction and a real unsupported hull–hull contact. Core allocation bytes returning to baseline is not whole-WASM-heap/JS leak proof.

Attempt history is retained, not rewritten:

1. `geometry-native-debug-20261022-i` was the first source candidate, before the exhaustion policy. Its basic PASS is historical only.
2. `geometry-wasm-debug-20261022-i2` compiled and passed existing physics/ownership/raw snapshots and the new native C fixture, but the JS fixture demanded regeneration in a finite-face scene that simply settled and slept. Its assertion failure remains FAIL.
3. `geometry-wasm-debug-20261022-i3` added the explicit wake impulse, but the 2 m half-face was too small for the intended sustained motion. The finite-domain precondition failed; no geometric error tolerance was loosened.
4. `geometry-oracle-20261022-i4` used a smaller motion variant and passed analytic geometry, but a new fixture assertion reversed the official stored body-ID words. The official high word is `index1`; the low word carries world/generation. This was a fixture assertion defect, not a core/product defect; previous ownership/snapshot fixtures already used the correct convention.
5. `geometry-oracle-20261022-i5` fixed that assertion. `i6` restored the original impulse and enlarged the finite test domain to 12 m before running. These are separately identified fixture-only replays of the compiled candidate, not fresh build receipts.
6. Final fresh Debug/Release results are recorded by their own immutable receipts and the evidence summary. No earlier PASS is relabelled with a later fixture hash.

## Layout and remaining limits

Appending the basis changes native `b3Contact` size and native snapshot images. The upstream snapshot layout hash includes `sizeof(b3Contact)` and rejects mismatches. No replay compatibility, snapshot-file migration or AIR replay qualification is provided. The old g point/manifold layout is unchanged. Actual native and WASM32 structure sizes are recorded by the qualification executable.

Browser/CSP evidence remains blocked/not run. Original native sanitizer FAIL and historical candidate `BLOCKED_LSAN_PTRACE` remain visible. Ordinary Node/native runs do not promote them, full C21/C22, or G1. T09 gravity/sleep/debug/material bridges remain a separate coordinated increment.

Final i8 Debug/Release preserve every one of 617 asserted contact samples in
`geometry-samples.raw.jsonl`, including independently retained poses, shape
parameters, complete contact geometry and native branch counters. The report
binds its line count and SHA256. `audit-geometry-samples.mjs` recomputes all points
and normals with a separate rotation-matrix implementation; expected values are
not trusted as the only oracle. These per-mode files are byte-identical.

`compare-geometry-builds.mjs` separately compares all retained old g physics/raw
contacts/sensors and ownership observations. Its initial comparison attempts
incorrectly demanded identical Debug/Release memory capacity and identical
old/new contact allocation sizes. Those comparator FAIL records and exact
scripts are retained. Final comparison excludes only named allocation-size
fields, records their actual differences, and still requires invalid operations
to preserve all before/after bytes within each build, stable repeated-lifetime
allocations and zero core bytes after destruction. This is a comparison-tool
correction, not a change to physics or ownership acceptance.
