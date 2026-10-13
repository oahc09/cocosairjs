---
name: cocosair-performance
description: "Drives the Cocos AIR draw-call and frame-budget surface - the only three batching routes (shared mesh across N renderers, Mesh.merge and BatchingUtility.batchStaticModel for static subtrees, utils.MeshUtils.createDynamicMesh with Mesh.updateSubMesh for per-frame geometry), instancing through the single USE_INSTANCING material define with its 1024-per-group split, dynamic atlas defaults and silent-null acceptance rules, 2D auto-batch keys on director.root.batcher2D, the profiler singleton counters behind the pipeline.profiler gate, on-demand rendering as game.pause plus game.step behind Director.EVENT_AFTER_DRAW, pixelRatioCap and the DPR import-order contract, and the recorded limits of the 50k starfield evidence. Use when draw calls equal object count, batching hundreds of cubes or sprites, hitting AIR_E_MESH_CAPACITY or AIR_E_PIXEL_RATIO_IMPORT_ORDER, enabling dynamicAtlasManager, showing the stats overlay, checking whether the loop is really paused, or cutting resolution on a slow device."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, performance"
  description_en: "Drives the Cocos AIR draw-call and frame-budget surface - the only three batching routes (shared mesh across N renderers, Mesh.merge and BatchingUtility.batchStaticModel for static subtrees, utils.MeshUtils.createDynamicMesh with Mesh.updateSubMesh for per-frame geometry), instancing through the single USE_INSTANCING material define with its 1024-per-group split, dynamic atlas defaults and silent-null acceptance rules, 2D auto-batch keys on director.root.batcher2D, the profiler singleton counters behind the pipeline.profiler gate, on-demand rendering as game.pause plus game.step behind Director.EVENT_AFTER_DRAW, pixelRatioCap and the DPR import-order contract, and the recorded limits of the 50k starfield evidence. Use when draw calls equal object count, batching hundreds of cubes or sprites, hitting AIR_E_MESH_CAPACITY or AIR_E_PIXEL_RATIO_IMPORT_ORDER, enabling dynamicAtlasManager, showing the stats overlay, checking whether the loop is really paused, or cutting resolution on a slow device."
  description_zh: "选择静态合批、动态图集和实例化，并检查性能统计、剔除和按需渲染。用于大量对象、动画或绘制性能优化。"
---

# Cocos AIR performance contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Cut draw calls through the three documented batching routes and the one instancing macro, keep 2D sprites batchable, and read the frame budget with the profiler singleton plus pause/step rendering.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "1000 identical cubes and I get 1000 draws" -> route 1 stays 1000 unless the shared material carries `defines: { USE_INSTANCING: true }`, then `Math.ceil(1000 / 1024)` = 1 draw ([instancing.md](references/instancing.md)).
- "those cubes never move again" -> `BatchingUtility.batchStaticModel(grid, batchedRoot)` (`src/cocos/3d/misc/batch-utils.ts:65`), 1 draw at 256 and at 50000 quads (`docs/manual/batching-recipes.md:61-62`).
- "the cube count or the vertex data changes every frame" -> `utils.MeshUtils.createDynamicMesh` (`src/cocos/3d/misc/create-mesh.ts:419`) plus `Mesh.updateSubMesh` (`src/cocos/3d/assets/mesh.ts:588`).
- "two meshes refuse to merge" -> `Mesh.validateMergingMesh` (`src/cocos/3d/assets/mesh.ts:1085`) compares bundle count, attribute formats, primitive count and mode, and rejects a dynamic mesh before `Mesh.merge` (`:771`) returns `false`.
- "how many draws did that actually save" -> `profiler.showStats()` and its `draws` row (`src/cocos/profiler/profiler.ts:590`); the harness asserts against the live counter instead of trusting the route name (`examples/shared/batching-routes.ts:179-180`).
- "do I need a static-batch component for UI" -> no: `UIStaticBatch` is inert in this fork (`src/cocos/2d/components/ui-static-batch.ts:85`, `:106`), and auto-batching keys are in [batching-routes.md](references/batching-routes.md).
- "UI sprites with many different textures" -> the dynamic atlas acceptance rules and knob defaults in [dynamic-atlas.md](references/dynamic-atlas.md).
- "my sprites stopped batching after I repainted a texture" -> texture hash is part of the batch key (`src/cocos/2d/renderer/render-data.ts:460-463`), so a new texture object starts a new batch even for identical pixels.
- "is my loop actually paused" -> `game.isPaused()` (`src/cocos/game/game.ts:615`); `director.isPaused()` (`src/cocos/game/director.ts:693`) reports only the logic gate and stays false while the main loop is stopped.
- "the device is too slow at DPR 3" -> `pixelRatioCap` in the app options (`src/air/app.ts:81`), then `resolutionScale` only when you accept softer text.
- "can I trust the 50k starfield number as a budget" -> no, the recorded evidence covers visibility, interaction and release only ([profiles.md](references/profiles.md)).

## Contracts

Choose static merge, dynamic atlas or instancing according to the scene and material. Measure actual draw counts. For on-demand rendering, wait for the first draw before pausing and keep one step clock.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Reaching for a generic static-batch component
- [HIGH] Expecting each node to keep its own material after batching
- [HIGH] Using director.pause to stop rendering and setDisplayStats for stats
- [MEDIUM] Turning dynamic atlas on mid-scene and expecting a silent win

## References

- [batching-routes.md](references/batching-routes.md) - the three routes with their measured draws, harness caps and `AIR_E_MESH_*` errors, `batchStaticModel`/`unbatchStaticModel` effects, `Batcher2D` batch keys and buffer sizing, `UIStaticBatch` inertness, measurement scope, browser-verified ids.
- [dynamic-atlas.md](references/dynamic-atlas.md) - the default off state and why, knob defaults with setters, silent-`null` acceptance rules, atlas layout and bleeding, what makes a `SpriteFrame` packable, texture identity and the internal descriptor-set cache, `AirUIMesh` texture leases and geometry capacity, verification status.
- [instancing.md](references/instancing.md) - the single `USE_INSTANCING` macro entry, how it becomes a batching scheme and its silent downgrade, per-instance attributes the builtin effects declare, grouping keys, capacity and split draws, `setInstancedAttribute` timing, what instancing does not buy, the three capability layers, the stale manual sentence.
- [profiles.md](references/profiles.md) - the `profiler`/`Profiler` surface with every counter and its source, color setters and teardown, the `pipeline.profiler` render gate, the deprecated `setDisplayStats` forwarders, `game.pause`/`step`/`resume` and the fixed dt, the first-frame trap, `pixelRatioCap` and the DPR chain, the 50k evidence boundary, the two tools-side collectors.

## Canonical docs

- `docs/manual/batching-recipes.md` - open for the three-route table, the fixed measurement conditions and the p95 draw and CPU numbers behind every batching claim.
- `docs/manual/optimize-lots-of-objects.md` - open for the 100-cube `BatchingUtility` contract probe, the batch/unbatch scene-graph dumps and the static-only usage constraints.
- `docs/manual/rendering-on-demand.md` - open for the PARTIAL status, the pause/step sequence in source order and the two measured traps with their timings.
