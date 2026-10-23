# Real convex Hull integration, current bounded progress

This increment adds the actual public convex MeshCollider adapter and an EX01
regular-tetrahedron projectile. The renderer and collider share the same Mesh
POSITION stream. No box bounds, decimated point set, animation or alternate
physics backend substitutes for Hull cooking or simulation.

## Independently saved source69 evidence

Source `4cfc6afd0b202a69c5d51dbe1929bb2341c67920` is independently recoverable
through Library `libfile_7f1f35f357788191a22d959c9af1b7b4` and its manifest's
ordered base chain. Its source ZIP is 116474 bytes, SHA256
`cacd1c729a483a6936f1a0cbbfd2246fc1257972e07daa4f77c5294a2499f9af`.

- Actual host Debug: 91 runner commands, 12 native Hull checks and four core
  checks; separate 57-command old-core rebuild and three exact fingerprint
  comparisons. Library `libfile_600b160eb60c8191be83b96eff7380a8`, 20251582 bytes,
  SHA256 `dfe6e77688162eff5ed43c280142b55fd0a05a8ede350a1874f753ac8c769faa`.
  All 620 downloaded archive members were read and verified.
- Actual WASM Release: 28 build commands, 74-unit artifact audit, the native/core
  fixtures, independent old-core comparison and nine facade checks. Six facade
  checks use real WASM, one is a pure boundary injection, and two exercise real
  native mutation followed by injected readback/trap boundaries. These categories
  are not interchangeable. Library `libfile_c68c8d42dd588191ba0c2f0ad04292b8`,
  6082133 bytes, SHA256
  `7f5de43e8287ff16c205d5e76e057315f6a0b3daa084446f636620cd55b05531`.
  All 787 downloaded archive members were read and verified.
- The WASM is 617169 bytes, SHA256
  `75cf5c280426cd25f3184646c7b43d473ff52b26990067894dd10e147891d048`.
  Matching facade SHA256 is
  `2aac6f16d2759b117bd1702dad4a547c467510f5320ee98a377bb9a945941e32`.

Both result packages contain original stdout/stderr, receipts, exact build inputs
and artifacts. Regenerable object/static-library exclusions are listed explicitly;
those files remain local. Earlier inventory and missing-header compile failures
remain in source68/source69 archives. No old PASS was relabelled.

## Current-source admission and remaining work

The new public MeshCollider code and EX01 changes were not present in source69.
Therefore source69 evidence does not qualify their real component lifecycle,
production ESM, browser operation or the complete 2128-cell/nine-Gate matrix.
Fresh matching public-component, runtime and browser checks are required.

The adapter copies all readable submesh POSITION streams, decodes normalized and
float16 storage, validates disabled geometry before cache changes, accepts null
mesh as a pending owned component, and uses native convex Hull cooking with the
existing positive-scale/no-shear admission. Non-null `convex=false` triangle
meshes are explicitly unsupported. Native commit followed by JS readback failure
is not represented as a rollback. Component collision events are still unsupported.

EX01 adds real Hull launching and vertex-based height observations, not continuous
penetration proof. Hull dragging remains unfinished; the current drag consumer
only admits one centered Box, Sphere or Capsule. Existing automatic demonstration
still launches Sphere then Capsule. Original multi-thread modes, complete debug
presentation, 100-cycle resource acceptance, full associated test IDs and formal
video/visual qualification remain uncompleted. All formal Gates stay NOT_RUN.

## Source-only intermediate review findings

The first public adapter candidate still depends on the upstream `Mesh.readAttribute`
byte-offset behavior. Read-only review identified a nonzero `Uint8Array.byteOffset`
read risk; the candidate is NOT qualified and a local offset-aware reader plus a
real two-valid-tetrahedra regression is being prepared. This intermediate source
checkpoint intentionally preserves the finding rather than claiming it is fixed.

The facade now marks successful native shape destruction COMMITTED before body
state readback, and retires the destroyed token. The added real-native failure
injection fixture is frozen but NOT_RUN for this updated source yet. A native
throw remains UNKNOWN and is never automatically replayed.

## Source71 follow-on correction

The nonzero-offset Mesh reader now uses the actual data view offset, interleaved
stride and attribute layout with explicit bounds checks. The original two-valid-
tetrahedra control failed before the fix and passes afterward (21/21 source
controls). The fresh real Cocos N1–N7 fixture is frozen but NOT_RUN at this source
checkpoint. Its full artifact gate now requires the exact 65 inputs, 74 compile
units, 28 commands and 43 evidence records, including independent legacy Hull
comparison. Existing command qualification assertions remain intact.

Matching source70 WASM Release subsequently passed 12 facade checks (six real
WASM, two pure injected statuses, four real native mutations plus boundary fault
injection). It is archived as Library `libfile_3542ec08be6c8191a03541f6555ac89d`,
6082860 bytes, SHA256
`28eade1757034442ebe8bd1c646bbabd2e290ca0d276bff6055e9cf6ac0c54a0`;
all 787 downloaded members were verified. Its facade SHA256 is
`1d910108b5a7570250bed070bf3529fbf2153346e7cbc8dd0f7cb54faca95ef4`.
The 65 native build input bytes remain unchanged by the public offset/gate update,
but admission must revalidate them rather than rely on this prose. No public or
browser PASS is claimed at this freeze.
