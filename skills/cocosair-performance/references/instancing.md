Derived from `docs/manual/batching-recipes.md`, `docs/manual/optimize-lots-of-objects.md`, `docs/notes/geometry-batching-assessment.md`, `examples/shared/batching-routes.ts`, `src/cocos/render-scene/core/pass.ts`, `src/cocos/render-scene/core/pass-instance.ts`, `src/cocos/render-scene/scene/submodel.ts`, `src/cocos/rendering/instanced-buffer.ts`, `src/cocos/rendering/render-instanced-queue.ts`, `src/cocos/rendering/planar-shadow-queue.ts`, `src/cocos/rendering/define.ts`, `src/cocos/rendering/index.ts`, `src/cocos/gfx/webgl2/webgl2-device.ts`, `src/cocos/3d/framework/mesh-renderer.ts`, `src/air/builtin/builtin-effects.ts`, `docs/evidence/examples-verified.json`, `build/cocosair.module.js` (as of 2026-10-09).

## There is one supported instancing entry: a shader macro

`docs/notes/geometry-batching-assessment.md:11` records the route as `Material.initialize({ effectName: 'builtin-unlit', defines: { USE_INSTANCING: true } })` on a material shared by the nodes. The example harness implements exactly that: `material.initialize({ effectName: 'builtin-unlit', defines: { USE_INSTANCING: instancing } })` (`examples/shared/batching-routes.ts:104`), with the comment on `examples/shared/batching-routes.ts:103` that shared resources do not imply GPU instancing and the flag is only set for the explicit comparison arm (`?instancing=1`, parsed at `examples/shared/batching-routes.ts:22`).

`InstancedBuffer` is not the entry point. It is the engine-side accumulation buffer that passes fill; the assessment note says so at `docs/notes/geometry-batching-assessment.md:24` (keep the native route, do not expose the internal `InstancedBuffer` directly).

## How the macro becomes a batching scheme

`BatchingSchemes` is declared at `src/cocos/render-scene/core/pass.ts:77`. `Pass._syncBatchingScheme()` (`src/cocos/render-scene/core/pass.ts:819-830`) is the only decision point:

- `_defines.USE_INSTANCING` true and `device.hasFeature(Feature.INSTANCED_ARRAYS)` true -> `BatchingSchemes.INSTANCING`.
- macro true but feature missing -> the engine writes `_defines.USE_INSTANCING = false` and falls back to `BatchingSchemes.NONE`. The downgrade is silent; verify with `pass.batchingScheme` (`src/cocos/render-scene/core/pass.ts:930`) or with real `device.numDrawCalls`.

WebGL 2 always advertises the feature: `features[Feature.INSTANCED_ARRAYS] = true` (`src/cocos/gfx/webgl2/webgl2-device.ts:223`), and WebGL 2 is the only browser target of this runtime.

`PassInstance` resets the macro: `this._defines.USE_INSTANCING = false` (`src/cocos/render-scene/core/pass-instance.ts:119`). A per-node material instance therefore disables instancing for that pass; instancing requires one shared material whose effect declares the macro.

## What the builtin effects declare

`src/air/builtin/builtin-effects.ts` (the AIR builtin effect fixture set) declares the macro and the per-instance attributes:

| Effect                             | Macro declared                                           | Per-instance attributes |
| ---------------------------------- | -------------------------------------------------------- | ----------------------- |
| `builtin-standard` (starts `:599`) | `{ "name": "USE_INSTANCING", "type": "boolean" }` `:613` | `:660-665`              |
| `builtin-unlit` (starts `:859`)    | `:873`                                                   | `:902-907`              |

In both, the instanced attributes are `a_jointAnimInfo` (also needs `CC_USE_BAKED_ANIMATION`), `a_matWorld0`, `a_matWorld1`, `a_matWorld2`, `a_lightingMapUVParam` (also needs `CC_USE_LIGHTMAP`), `a_localShadowBias` (also needs `CC_RECEIVE_SHADOW`), each carrying `"isInstanced": true`. `a_dyn_batch_id` is declared under `["!USE_INSTANCING", "USE_BATCHING"]`, i.e. the batching-macro path and the instancing path are mutually exclusive in the shader layout (`src/air/builtin/builtin-effects.ts:666`, `:908`). The world matrix is delivered as three attributes referenced by `INST_MAT_WORLD = 'a_matWorld0'` (`src/cocos/rendering/define.ts:523`).

## Grouping, capacity and splits

`InstancedBuffer.merge(subModel, passIdx, shaderImplant?)` (`src/cocos/rendering/instanced-buffer.ts:89`) returns immediately when the instance attribute block is empty: `if (!stride) { return; } // we assume per-instance attributes are always present` (`src/cocos/rendering/instanced-buffer.ts:92`). Instances are grouped by a composite key (`src/cocos/rendering/instanced-buffer.ts:113-115`): source index buffer `objectID`, lighting map texture objectID, `useReflectionProbeType`, reflection probe cubemap and planar map objectIDs, probe-blend cubemap, and stride. Any of those differing splits the batch.

Capacity constants: `INITIAL_CAPACITY = 32` and `MAX_CAPACITY = 1024` (`src/cocos/rendering/instanced-buffer.ts:58-59`). Groups grow by doubling up to the cap (`src/cocos/rendering/instanced-buffer.ts:143-144`) and a full group is skipped rather than overflowed (`src/cocos/rendering/instanced-buffer.ts:120`), so more than 1024 compatible instances produce additional groups, hence additional draws.

Observed consequence, `docs/manual/batching-recipes.md:13`: the current 1024-per-group cap splits batches; 256 instances measured 1 draw, 2048 instances measured 2 draws, and this is explicitly not generalizable to "always 1 draw at any scale". The harness asserts `Math.ceil(count / 1024)` draws for the instanced arm (`examples/shared/batching-routes.ts:179`).

Submission side: `RenderInstancedQueue` holds a `Set<InstancedBuffer>` (`src/cocos/rendering/render-instanced-queue.ts:39`), `clear()` resets each buffer (`src/cocos/rendering/render-instanced-queue.ts:47`), and queues add buffers then `uploadBuffers`/`recordCommandBuffer` (`src/cocos/rendering/render-instanced-queue.ts:71`, `:84`; for example `src/cocos/rendering/planar-shadow-queue.ts:124`, `:133`, `:140`). When a sub-model's input assembler changes, the instanced buffer for that pass is destroyed (`src/cocos/render-scene/scene/submodel.ts:450`).

## Per-instance attribute updates from a renderer

`MeshRenderer.setInstancedAttribute(name: string, value: ArrayLike<number>)` at `src/cocos/3d/framework/mesh-renderer.ts:733` is the public way to write one instance's attribute block. Its first statement is `if (!this.model) { return; }`, so calls made before the model exists are silently dropped; write after the renderer is active in a scene and its `model` is created. Engine code uses the same entry internally at `src/cocos/3d/framework/mesh-renderer.ts:1039` (`a_lightingMapUVParam`), `:1053` (`a_localShadowBiasAndProbeId`) and `:1069` (`a_reflectionProbeData`).

## What instancing does not buy

- CPU work is unchanged: nodes, transforms, culling and submission still run per object (`docs/notes/geometry-batching-assessment.md:11` scope note and `docs/manual/optimize-lots-of-objects.md:127-128`: static batching only addresses submit cost, not per-object logic).
- GPU-side per-instance culling is not verified in this repository (`docs/notes/geometry-batching-assessment.md:15` states the native node route still goes through CPU scene culling and instance grouping).
- `DynamicQuadBatch` is proposed, not implemented (`docs/notes/geometry-batching-assessment.md:26`); do not present it as an available component.

## Capability layers, stated separately

- Source export: `InstancedBuffer` is exported from `src/cocos/rendering/index.ts:34`; `USE_INSTANCING` is an effect macro consumed by `Pass`, not a runtime symbol.
- Default bundle face: `InstancedBuffer`, `MeshRenderer`, `Material` and `utils` all resolve by symbol name in the single `export { ... }` block of `build/cocosair.module.js` (currently :161574). There is no separate `Pass`, `PassInstance`, `Model` or `MaterialInstance` name in that block, so scheme inspection from application code is not reachable by name.
- Browser-verified: `docs/evidence/examples-verified.json` (`measuredAt` 2026-10-04T05:52:32.537Z, `candidateFingerprint` 2f089f6ce25eaccd) has NO `results[]` entry for the instanced arm; its ids cover the default `batching-shared`, `batching-merged`, `batching-dynamic` runs. The instancing draw counts quoted above come from the recipe measurement table dated 2026-10-03 (`docs/manual/batching-recipes.md:49`, `:59-60`), not from that verification file. The `USE_INSTANCING` path is therefore UNPROVEN at the recorded verification fingerprint.

## Contradiction inside the repository docs

`docs/manual/optimize-lots-of-objects.md:119-122` states that AIR has no user-facing instancing entry and that `InstancedBuffer` and `SkinnedMeshBatchRenderer` are engine-internal. That conflicts with `docs/notes/geometry-batching-assessment.md:11`, which documents the supported `defines: { USE_INSTANCING: true }` route, with `examples/shared/batching-routes.ts:22,104`, which exercises it, and with `build/cocosair.module.js` (currently :161574), which exports `InstancedBuffer` by name. Follow the macro route and the measured recipe numbers; treat the manual sentence as stale.
