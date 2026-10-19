# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-application](../../cocosair-application/SKILL.md) - `game` and `createAirApp` lifecycle, `designResolution` and the rest of the option plumbing; this skill owns only `pixelRatioCap` cost and the pause/step discipline.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes a name and how `AIR_FEATURES` variants are built; this skill reads the default bundle face only.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - node activation order, `layer` bits and when a `MeshRenderer` component exists at all; this skill owns what batching does to those renderers.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - `visibility` masks, camera `priority` and frustum culling, which keep running per node under every route below.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - effect and material authoring, including the shader side of `USE_INSTANCING`; this skill owns the batching decision and the draw count.
- [cocosair-primitives-mesh](../../cocosair-primitives-mesh/SKILL.md) - `Mesh` structure, attributes and `createPrimitiveGeometry`; this skill owns `Mesh.merge` and the dynamic-mesh update loop.
- [cocosair-rendering](../../cocosair-rendering/SKILL.md) - lights, shadows, render targets and pipeline reachability; shadow and target cost is not this skill.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - `AirUIMesh` authoring and its geometry limits; this skill owns its atlas and lease behavior, and `Vec3`/`Mat4` helpers come from [cocosair-math](../../cocosair-math/SKILL.md).
- [cocosair-verification](../../cocosair-verification/SKILL.md) - gate and evidence-collection commands; the two performance collectors are summarized there.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Cut draw calls through the three documented batching routes and the one instancing macro, keep 2D sprites batchable, and read the frame budget with the profiler singleton plus pause/step rendering.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Reaching for a generic static-batch component
- [HIGH] Expecting each node to keep its own material after batching
- [HIGH] Using director.pause to stop rendering and setDisplayStats for stats
- [MEDIUM] Turning dynamic atlas on mid-scene and expecting a silent win

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives the Cocos AIR draw-call and frame-budget surface - the only three batching routes (shared mesh across N renderers, Mesh.merge and BatchingUtility.batchStaticModel for static subtrees, utils.MeshUtils.createDynamicMesh with Mesh.updateSubMesh for per-frame geometry), instancing through the single USE_INSTANCING material define with its 1024-per-group split, dynamic atlas defaults and silent-null acceptance rules, 2D auto-batch keys on director.root.batcher2D, the profiler singleton counters behind the pipeline.profiler gate, on-demand rendering as game.pause plus game.step behind Director.EVENT_AFTER_DRAW, pixelRatioCap and the DPR import-order contract, and the recorded limits of the 50k starfield evidence. Use when draw calls equal object count, batching hundreds of cubes or sprites, hitting AIR_E_MESH_CAPACITY or AIR_E_PIXEL_RATIO_IMPORT_ORDER, enabling dynamicAtlasManager, showing the stats overlay, checking whether the loop is really paused, or cutting resolution on a slow device.

### Keywords

Cocos AIR, cocosair.js, performance

## References

- [batching-routes.md](batching-routes.md) - the three routes with their measured draws, harness caps and `AIR_E_MESH_*` errors, `batchStaticModel`/`unbatchStaticModel` effects, `Batcher2D` batch keys and buffer sizing, `UIStaticBatch` inertness, measurement scope, browser-verified ids.
- [dynamic-atlas.md](dynamic-atlas.md) - the default off state and why, knob defaults with setters, silent-`null` acceptance rules, atlas layout and bleeding, what makes a `SpriteFrame` packable, texture identity and the internal descriptor-set cache, `AirUIMesh` texture leases and geometry capacity, verification status.
- [instancing.md](instancing.md) - the single `USE_INSTANCING` macro entry, how it becomes a batching scheme and its silent downgrade, per-instance attributes the builtin effects declare, grouping keys, capacity and split draws, `setInstancedAttribute` timing, what instancing does not buy, the three capability layers, the stale manual sentence.
- [profiles.md](profiles.md) - the `profiler`/`Profiler` surface with every counter and its source, color setters and teardown, the `pipeline.profiler` render gate, the deprecated `setDisplayStats` forwarders, `game.pause`/`step`/`resume` and the fixed dt, the first-frame trap, `pixelRatioCap` and the DPR chain, the 50k evidence boundary, the two tools-side collectors.

## Canonical docs

- `docs/manual/batching-recipes.md` - open for the three-route table, the fixed measurement conditions and the p95 draw and CPU numbers behind every batching claim.
- `docs/manual/optimize-lots-of-objects.md` - open for the 100-cube `BatchingUtility` contract probe, the batch/unbatch scene-graph dumps and the static-only usage constraints.
- `docs/manual/rendering-on-demand.md` - open for the PARTIAL status, the pause/step sequence in source order and the two measured traps with their timings.
