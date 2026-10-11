Derived from `docs/manual/batching-recipes.md`, `docs/manual/optimize-lots-of-objects.md`, `docs/manual/interactive-performance.md`, `examples/shared/batching-routes.ts`, `examples/batching-utility/src/main.ts`, `src/cocos/3d/misc/batch-utils.ts`, `src/cocos/3d/assets/mesh.ts`, `src/cocos/3d/misc/mesh-validation.ts`, `src/cocos/3d/misc/create-mesh.ts`, `src/cocos/2d/renderer/batcher-2d.ts`, `src/cocos/2d/renderer/render-data.ts`, `src/cocos/2d/renderer/static-vb-accessor.ts`, `src/cocos/2d/renderer/buffer-accessor.ts`, `src/cocos/2d/renderer/linear-buffer-accessor.ts`, `src/cocos/2d/components/ui-static-batch.ts`, `src/cocos/root.ts`, `src/cocos/core/platform/macro.ts`, `docs/evidence/examples-verified.json`, `build/cocosair.module.js` (as of 2026-10-09).

## The only three routes in this repository

`docs/manual/batching-recipes.md:3-10` names three runnable routes, each with its own example, all using the same green quad, one shared unlit material, one pass, one camera, no shadows, no post processing:

| Route                 | Mechanism                                           | Per-object transform kept | Draw count in the recipe                                                        |
| --------------------- | --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| shared mesh x N nodes | one `Mesh` + one `Material`, N `MeshRenderer` nodes | yes                       | 256 draws for 256 quads (`docs/manual/batching-recipes.md:58`)                  |
| merged static mesh    | vertices pre-transformed into one space, one `Mesh` | no                        | 1 draw at 256 and at 50000 quads (`docs/manual/batching-recipes.md:61-62`)      |
| dynamic mesh update   | one `Mesh` with typed arrays rewritten per frame    | no                        | 1 draw at 256, 50000 and 100000 quads (`docs/manual/batching-recipes.md:63-65`) |

Shared resources are not a shared draw: `docs/manual/batching-recipes.md:8` gives the first route as keeping independent node transforms and states that shared resources do not merge into one draw. There is no fourth batching API.

## Caps and hard errors in the shared example harness

`examples/shared/batching-routes.ts:23-24`: `maxCount` is 4096 for `shared` and 100000 for `merged`/`dynamic`; any other `count` throws `count must be 1..${maxCount}`. `docs/manual/batching-recipes.md:24` states the same limits.

`examples/shared/batching-routes.ts:62`: index buffer type is chosen by vertex count, `count * 4 > 65536` selects `Uint32Array`, otherwise `Uint16Array`; one quad is 4 vertices and 6 indices (`docs/manual/batching-recipes.md:35-36`).

`examples/shared/batching-routes.ts:179-180` asserts the draw count against `device.numDrawCalls` instead of trusting the route name: `route === 'shared' ? (instancing ? Math.ceil(count / 1024) : count) : 1`.

## Route 1: shared mesh on N nodes

One `Mesh` object plus one `Material` object, referenced by N `MeshRenderer` components. Node transforms and per-node culling stay live; each renderer is still submitted, so draws equal visible nodes unless GPU instancing is enabled (see [instancing.md](instancing.md)).

## Route 2: merged static mesh

`Mesh.merge(mesh, worldMatrix?, validate?)` at `src/cocos/3d/assets/mesh.ts:771` returns `false` when validation fails instead of partially merging. `Mesh.validateMergingMesh` at `src/cocos/3d/assets/mesh.ts:1085` rejects a dynamic mesh, and compares vertex-bundle count, attribute formats, primitive count, `primitiveMode` and index view before any mutation.

## Route 3: dynamic mesh update

Entry point `utils.MeshUtils.createDynamicMesh(primitiveIndex, geometry, out?, options?)`, declared at `src/cocos/3d/misc/create-mesh.ts:419-422` and implemented at `src/cocos/3d/misc/create-mesh.ts:262`.

Option defaults, `src/cocos/3d/misc/mesh-validation.ts:22`: `{ maxSubMeshes: 1, maxSubMeshVertices: 1024, maxSubMeshIndices: 1024 }`; each key must be a safe integer and capacity keys must be positive (`src/cocos/3d/misc/mesh-validation.ts:23-25`). Exceeding reserved capacity throws `AIR_E_MESH_CAPACITY` from six places: option keys (`src/cocos/3d/misc/mesh-validation.ts:25`), initial vertices (`:112`), initial indices (`:114`), update vertices (`:40`), update attribute bytes (`:51`), update indices (`:61`); the total reservation has its own ceiling of `512 * 1024 * 1024` bytes with the message `dynamic reservation exceeds the 512 MiB safety limit` (`:118`); `primitiveIndex` outside `maxSubMeshes` throws `AIR_E_MESH_PRIMITIVE` (`src/cocos/3d/misc/mesh-validation.ts:104-105`). Creating or initializing a dynamic mesh before `createAirApp()` throws `AIR_E_MESH_NOT_READY` (`src/cocos/3d/misc/create-mesh.ts:265` and `src/cocos/3d/assets/mesh.ts:416`).

Update path: `Mesh.updateSubMesh(primitiveIndex, dynamicGeometry)` at `src/cocos/3d/assets/mesh.ts:588`, which requires an initialized dynamic mesh and otherwise throws `AIR_E_MESH_NOT_READY` with the message "initialize the dynamic mesh before updateSubMesh" (`src/cocos/3d/assets/mesh.ts:590`). The example reuses one typed array and refreshes bounds each frame, then calls `onGeometryChanged()` on the live renderer (`examples/shared/batching-routes.ts:91`).

## 3D static batching: BatchingUtility

`BatchingUtility` (`src/cocos/3d/misc/batch-utils.ts:47`) is a static-only utility; two public methods:

- `batchStaticModel(staticModelRoot: Node, batchedRoot: Node): boolean` (`src/cocos/3d/misc/batch-utils.ts:65`). It collects the `MeshRenderer` components under `staticModelRoot`, returns `false` and logs `the number of static models to batch is less than 2,it needn't batch.` for fewer than two models (`src/cocos/3d/misc/batch-utils.ts:68`), merges each model mesh into one mesh with the model world matrix and sets `comp.enabled = false` on every source renderer, then adds one `MeshRenderer` on `batchedRoot` and copies `sharedMaterials` from the first model (`src/cocos/3d/misc/batch-utils.ts:93-96`). Merging refuses incompatible meshes or materials with the console errors `the meshes of ... and ... can't be merged` and `the materials of ... and ... can't be merged`.
- `unbatchStaticModel(staticModelRoot: Node, batchedRoot: Node): boolean` (`src/cocos/3d/misc/batch-utils.ts:108`) re-enables every child renderer, destroys the batched rendering mesh and the batched component, and returns `true` unconditionally. It does not restore a batched node to an independently materialed renderer on its own; only this call does.

Probe evidence in `docs/manual/optimize-lots-of-objects.md` shows the batched root gaining a `MeshRenderer` with `subMeshes=1` and the 100 source renderers reported `enabled=false`.

`BatchingUtility` is reachable on the default bundle face (it appears in the single `export { ... }` block of `build/cocosair.module.js`, currently :161574).

## 2D and UI auto-batching

`Batcher2D` is implemented at `src/cocos/2d/renderer/batcher-2d.ts:88`. The class is NOT exported under its own name on the default bundle face; in `build/cocosair.module.js` (currently :161574) it appears as `Batcher2D as UI`. The live instance is reached through `root.batcher2D` (`src/cocos/root.ts:153`, constructed at `src/cocos/root.ts:420`), i.e. `director.root.batcher2D`, not through an import.

Batch identity per render data, `src/cocos/2d/renderer/render-data.ts:460-463`: `dataHash = murmurhash2_32_gc(`${bufferId}${layer} ${textureHash}`, 666)`; a render data caches its batcher at construction (`src/cocos/2d/renderer/render-data.ts:130`).

Break predicate, `src/cocos/2d/renderer/batcher-2d.ts:453`: a component starts a new batch when `this._currHash !== dataHash || dataHash === 0 || this._currMaterial !== mat || this._currDepthStencilStateStage !== depthStencilStateStage`. The batch material is the component's first render material, `comp.getRenderMaterial(0)` (`src/cocos/2d/renderer/batcher-2d.ts:465`). So the batch keys are: buffer/layer/texture hash, material, and depth-stencil stage.

Other entry points on the same object: `commitComp` (`src/cocos/2d/renderer/batcher-2d.ts:429`), `commitModel` (`:599`), `autoMergeBatches` (`:678`), `forceMergeBatches` (`:787`), `finishMergeBatches` (`:822`), `walk` (`:906`). `commitIA` (`:500`) exists but `commitMiddleware` (`:546`) is the current path for middleware renderers.

Vertex stride for the common position-uv-color layout is hardcoded as `36 /* 9x4 */` bytes (`src/cocos/2d/renderer/batcher-2d.ts:385`).

Batch buffer sizing, all three accessors derive capacity from one macro:

- `src/cocos/core/platform/macro.ts:1136`: `BATCHER2D_MEM_INCREMENT: 144` (KB), documented formula `vCount = Math.floor(macro.BATCHER2D_MEM_INCREMENT * 1024 / 9 * 4)` at `src/cocos/core/platform/macro.ts:1078`.
- `src/cocos/2d/renderer/static-vb-accessor.ts:90-91`: `_vCount = vCount || Math.floor(BATCHER2D_MEM_INCREMENT * 1024 / _vertexFormatBytes)`, `_iCount = _vCount * StaticVBAccessor.IB_SCALE` with `IB_SCALE = 4` (`src/cocos/2d/renderer/static-vb-accessor.ts:79`).
- `src/cocos/2d/renderer/buffer-accessor.ts:45`: `_vertexFormatBytes = _floatsPerVertex * Float32Array.BYTES_PER_ELEMENT`.
- `src/cocos/2d/renderer/linear-buffer-accessor.ts:156`: same formula.

## UIStaticBatch does nothing in this fork

`UIStaticBatch` is exported on the source and bundle face (`src/cocos/2d/components/ui-static-batch.ts:53`), but the class is marked deprecated since v3.4.1 and both lifecycle methods have their bodies commented out: `postUpdateAssembler` (`src/cocos/2d/components/ui-static-batch.ts:85`) is an empty method and `markAsDirty` (`src/cocos/2d/components/ui-static-batch.ts:106`) is an empty method. The batcher side, `setupStaticBatch` / `endStaticBatch` / `commitStaticBatch` (`src/cocos/2d/renderer/batcher-2d.ts:642`, `:648`, `:666`), has no live caller in `src/`.

## Measurement scope of the recorded numbers

Fixed conditions, `docs/manual/batching-recipes.md:49`: 2026-10-03, Chromium 149.0.7827.55 / WebGL2, 1280x720 backing, DPR 1, 120 sampled frames, 30 warmup frames, N=1.

Recorded draws and p95 milliseconds (`docs/manual/batching-recipes.md:58-65`, columns: route / quads, actual draws, CPU submit, dynamic update, rAF interval):

| Route / quads              | Draws | CPU submit p95 ms | Dynamic update p95 ms | rAF interval p95 ms |
| -------------------------- | ----- | ----------------- | --------------------- | ------------------- |
| shared / 256               | 256   | 1.90              | 0                     | 17.40               |
| shared + instancing / 256  | 1     | 1.20              | 0                     | 17.20               |
| shared + instancing / 2048 | 2     | 3.70              | 0                     | 18.30               |
| merged / 256               | 1     | 0.60              | 0                     | 17.00               |
| merged / 50000             | 1     | 0.60              | 0                     | 17.10               |
| dynamic / 256              | 1     | 0.60              | 0.20                  | 17.00               |
| dynamic / 50000            | 1     | 0.60              | 2.60                  | 17.90               |
| dynamic / 100000           | 1     | 0.60              | 5.00                  | 18.70               |

GPU time and display-present time are explicitly unmeasured and reported as null (`docs/manual/batching-recipes.md:71-73`; the same in the harness, `examples/shared/batching-routes.ts:231` `gpuTimeMs: null` and `:233` `timingScope: 'rAF intervals and CPU submission only; no GPU or display-present proof'`). A rAF interval near 60 Hz proves callback cadence only.

Re-measure in the page with `await window.__batchProbe.measure(120)`; the sample count is validated to 60..600 (`examples/shared/batching-routes.ts:194`, `:238`). `window.__trialProbe` carries the pixel/draw contract (`examples/shared/batching-routes.ts:36`).

`docs/manual/interactive-performance.md:3` records the performance pilot result as LIMITED rather than a device pass, and `docs/manual/interactive-performance.md:7` states that AFTER_DRAW intervals are frame-callback intervals that include callback cost, not GPU execution time.

## Browser verification status

`docs/evidence/examples-verified.json` (top-level `measuredAt` 2026-10-04T05:52:32.537Z, `candidateFingerprint` 2f089f6ce25eaccd) records `PASS` for these `results[]` ids, each carrying the same `candidateFingerprint`: `batching-shared`, `batching-merged`, `batching-dynamic`, `batching-utility`, `profiler-overlay`, `starfield-galaxy`. The recorded `apiProof` names for the merged/dynamic arms are `Material.initialize`, `utils.createMesh`, `Mesh.updateSubMesh`, `utils.MeshUtils.createDynamicMesh`, `BatchingUtility.batchStaticModel`, `BatchingUtility.unbatchStaticModel`.

That last pair is weaker than it looks. In the `batching-utility` entry both calls are bound only to the `no-runtime-error` validator (1 call each, no reads), and the example invokes `BatchingUtility.batchStaticModel(cube)` and `BatchingUtility.unbatchStaticModel(cube)` with a single argument (`examples/batching-utility/src/main.ts:85`, `:93`) on a node with one `MeshRenderer` (`:46`, `:50`). The guard at `src/cocos/3d/misc/batch-utils.ts:67-69` therefore logs `the number of static models to batch is less than 2,it needn't batch.` and returns `false`, the probe records the non-true branch, and no merge runs. So `batching-utility` proves the calls resolve and do not throw; the two-argument merge behaviour described above is documented from source and from the probe field values, not from that browser id. Use the two-argument form with at least two renderers under the source root, as in `docs/manual/optimize-lots-of-objects.md`.

No `results[]` entry covers the `?instancing=1` arm, dynamic atlas packing, `UIStaticBatch`, or on-demand stepping.
