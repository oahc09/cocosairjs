# EX01 Hull: limited actual Firefox observation, 2026-10-23

Status: LIMITED_BROWSER_OBSERVED. This is not complete EX01 or formal qualification.

## Executed scope

Actual cloud Firefox 158.0.1 WebGL2 opened the new localhost:8769 origin with
`?demo=0`. The operator started the ordinary engine clock, observed the 100-brick
wall settle, selected Hull and launched one tetrahedron, observed its impact and
rest, paused, exported JSON, then closed and exported again. No Hull drag was
tested or admitted. The original screenshot shows the real faceted projectile
and displaced wall, not generated artwork.

The normal public adapter/runtime reports build209 and backend Box3D. The served
module is 9200216 bytes, SHA256
`5c742107861a815688cff3f0953e8e81b714cc0a54dc450e76a5ac6d2046e4a7`.
These are distinct evidence layers: actual UI/export runtime identity, static
package bytes, and fetched-file hash. A fetched-file hash is not an independent
measurement of an already-executed cached module or instantiated WASM bytes.

## Raw observations

- First export: 1749185 bytes, SHA256 `92f9b4897d82e29b7a58479428ec6cefcb2e78b6194ca3b120e35375d3598e4d`.
- Close export: 1861936 bytes, SHA256 `07a21ed73852345384cd16fe8ef4abad9a6a693196a667e28210289b3fac8076`.
- First 972 samples are an exact prefix of the second export's 1056 samples.
  They are not 2028 independent observations.
- Minimum recorded geometry Y: -0.0093 m at sample292/frame2756/nativeStep442.
  No sample below -0.15 m; no finiteTransforms=false. This is sampled support-
  vertex observation, not continuous collision/penetration proof.
- Paused segment: 699 samples in the close export, nativeStep702 unchanged while
  render frames advance 2821 to13208. The two exports contain zero application
  errors and no sourceIdentityError. WebGL lazy cube-map initialization warnings
  were seen in the console; a full console stream was not exported.
- Close status is released, pending/failures empty. Physics module/world cleanup
  are released, cleanupErrors empty. Engine runtime, scheduler, builtin resources
  and shared asset caches are explicitly retained. GPU allocation measurement is
  unavailable. This is not an entire-app zero-memory or 100-cycle leak proof.
- The close export's latest snapshot predates close. Its native body/byte counts
  must not be relabelled post-close residuals. The current backend read is disposed
  and unavailable; the actual close receipt supplies the cleanup result.

## True Hull shape and bounded identity

The scene uses four distinct points of a regular tetrahedron (coordinate magnitude
0.72), four triangular faces and twelve expanded render POSITION vertices. The
rendered Mesh and convex MeshCollider share the same mesh object. Source maps
match the scene source74 and normal runtime source73; the real adapter uses
createHull and `_air_b3_mass_hull_create`, not a box/sphere proxy. Browser JSON
does not independently dump native shape vertices or per-body contact pairs.
Static wiring, finite Node/native controls and actual browser observations retain
their separate scopes.

The original source74 sourceIdentity retained stale runtime208 and pre-Hull native
metadata, including an obsolete notIntegrated Hull claim. Its original static
bytes and both JSON exports are preserved unchanged. Source75 corrects only new
delivery metadata to build209 and the matching source70-e Hull generation, and
references this LIMITED_BROWSER_OBSERVED run. No runtime rebuild or scene behavior
change is made, and the new metadata wrapper is not claimed as a separate browser run.

## Recovery

Original two JSON exports, screenshot, served identity/manifest and exact dependency
references: Library `libfile_2a713730dab48191b42f88f056483520`, 160370 bytes, SHA256
`0cbc28ad7b1f137ae388bc5a2e2efa0ade6d22dc722464c4cc30074172b7612d`.
All 16 members were actually downloaded, hashed, and the originals compared byte
for byte. Screenshot alone: `libfile_c6455ab52f488191be15299151c4ba45`, 106363 bytes,
SHA256 `5438554d665aefafa5d9e9ee6789808fa77bc47e5ac4caa0aceb9eba841af60e`.
The source/runtime/component recovery chain is listed in hull-progress-20261023.md.

Remaining original requirements include Hull/compound dragging, MT/auto modes,
native debug presentation, public component events, 100-cycle resource recovery,
formal video/replay and full numerical/visual acceptance. 2128 cells and nine Gates
remain NOT_RUN; this bounded visual result does not shrink their denominator.
