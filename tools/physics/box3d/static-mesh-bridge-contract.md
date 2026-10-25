# Static Mesh resource bridge candidate

This slice adds a real concave native Mesh resource, not a convex Hull substitute. Current qualification: host bridge contract with three native shape borrowers and four release orders; raw-core multimesh/ray/falling-body diagnostic; separate actual Cocos Mesh decoding tests. Matching WASM/facade and public MeshCollider integration are not yet established. No C16/C19 formal credit or global Gate follows.

## Ownership and ABI

Cook copies complete body-local float32 vertices and signed int32 triangles into the pinned core mesh cooker, without welding, using SAH and adjacency. Degenerate or duplicate oriented index triples reject before creation. Each successful cook owns one cache lease; each mesh shape owns an independent borrow. The allocation is destroyed only after both counts reach zero. World destruction first destroys all native shapes, then geometry, then charged bridge records. Shape/body deletion retires the full generation identity only after native deletion.

Tokens are two uint32 words, never pointers. Every call validates the exact world. Facade lease objects are additionally branded in their binding instance, separately retainable and individually idempotent on release. Identical raw bits in another instance are not authority. Closing a world invalidates every outstanding token.

Only static bodies are admitted. Creating on dynamic/kinematic bodies and changing a mesh-bearing body to a nonstatic type reject before any native SetType call. Static Mesh readback does not call convex mass integration or claim a dynamic mass. Other backend behavior is unchanged.

## Source faces and debug copies

The pinned cooker can reorder triangles. Each cooked oriented index triple is mapped to its original flattened input face. `air_b3_mesh_face_read` validates the owning full shape and copies one original face ordinal. The existing 11-word query hit and its cooked triangle index remain unchanged. Public adapters must compose this ordinal with the intake's submesh/source primitive map. A guessed uint8 material label is not source identity.

The existing read-only debug collector copies actual cooked triangle edges, with an explicit capacity bound; it does not construct a convex Hull or silently collapse concave gaps. No public debug presentation is implied.

## Failure boundaries

All ordinary invalid input, wrong ownership, nonstatic admission and bridge allocation failures occur before shape creation. Cook can allocate then release temporary data without changing the world's existing shapes. Core OOM is not injected or promised recoverable. Native creation or traps after a mutation boundary are not called rollback. Readback after mutation cannot overwrite a committed outcome with `not-mutated`.

The facade's cook arrays are copied before native use. Cache keys belong to the public intake/resource layer, which must compare full canonical bytes within a hash bucket; the hash alone cannot alias resources. Native resources remain world-scoped.

## Qualification commands

`python3 tools/verify/box3d/static-mesh-proposals/run-bridge-host.py attempt-<new-id>` compiles the current bridge with exact captured source, reuses 52 recorded host core objects, and preserves all commands/output in a new directory. The original receipt did not hash those objects, so their currently observed hashes are recorded without inventing original object provenance.

The normal native build runs `mesh_contract.c`; matching WASM executes the same contract and `wasm-mesh-contract.mjs`, then the unchanged full audit/consumer-gate workflow includes their new evidence explicitly. Run `build-ready.mjs --out <fresh-output>` using the locked official toolchain; never point a consumer at an unaudited partial directory.

Heightfield, static baked compound, dynamic triangle Mesh, public mesh contact equations and Mesh trigger listeners remain outside this first slice. Public scene integration, atomic replacement and shared cache behavior need their own real component proof before this can be described as complete static Mesh support.
