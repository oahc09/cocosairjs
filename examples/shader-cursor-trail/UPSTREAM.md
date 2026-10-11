# E08 source identity and differences

- upstream_repo: `shader-effects-inc/shaders`
- upstream_commit: `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`
- upstream_file: `packages/core/src/shaders/CursorTrail/index.ts` (SHA256 `1cfdb60b981438b885d6b47c5ee3557f3289669fc12fb07e5000e4c0476c5cb2`)
- reference helpers: `gpu/kit/agents.ts`, `gpu/kit/host/pointer.ts`; pinned `dataEncoding.ts` and its HTTP receipt under `output/shaders-absorption/worker-w3-e08-upstream-dataEncoding*`.
- license: MIT; copyright and applicable notices in [LICENSE.reference.txt](LICENSE.reference.txt). Reference sources are inspected, never imported into the runtime.

## Algorithm ideas adopted

CPU committed anchors + live head, velocity smoothing 0.2, width floor 0.2 / full speed 1.5 UV/s, aspect-aware spacing, Chaikin relax, oldest-first age culling. Reserve one of 64 slots for a linked head duplicate. Pack x/y/age/signed-width into a 64×1 RGBA16F texture, including the upstream half conversion semantics. Tracker delta is capped at 0.1 seconds; ageing at 0.25 seconds.

Fragment scan: midpoint quadratic Bézier, three sub-chords per joint, projected chord distance minus linearly interpolated radius, minimum distance union and exponential depth-weighted age. Despite the upstream comment saying “newest covering segment wins”, the actual implementation blends by depth; this implementation follows the executable body, not that comment. The chord formula is not an exact analytic varying-radius cone distance. Edge AA is 1.5 backing pixels plus radius-relative softness; late-age fade spans 0.8 to 1.

## Implementation differences

Native `Texture2D.uploadData`, `EffectAsset`, `Material`, `MeshRenderer`, one canvas and one quad replace the upstream renderer's host hooks. No TypeGPU, compute pass or extra GL canvas. UV is v-up after CSS pointer conversion. The first trusted pointer observation initializes the recorder origin rather than drawing a centre-to-cursor teleport. Reset/Escape clear tracker state and establish a fresh generation. Numeric inputs reject malformed/non-finite values instead of propagating NaN.

Only the two-color **linear RGB** interpolation route is implemented. Upstream multi-stop colors and selectable color spaces are unsupported. No local speed or seed parameter is advertised. Deterministic input scripts are diagnostic workloads, explicitly distinct from real trusted pointer events. RGBA8 diagnostic targets quantize straight linear output; the visible preview encodes once and alpha-composites onto its known background.

## CocosAirJS APIs used

`createAirApp`, `createStepClock`, `createAirRenderTarget`, `Texture2D`, `Material.initialize`, `Material.setProperty`, `EffectAsset`, `MeshRenderer`, `utils.createMesh`, native `Component.update` and Director frame events. References, source hashes, build logs, PNG hashes and actual upload receipts are bound by the collector.
