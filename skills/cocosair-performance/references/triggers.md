# performance contracts triggers

“Route 1” means shared mesh/material across renderers in [batching routes](batching-routes.md). Source annotations refer to the AIR checkout.

## When to use what

- "1000 identical cubes and I get 1000 draws" -> route 1 stays 1000 unless the shared material carries `defines: { USE_INSTANCING: true }`, then `Math.ceil(1000 / 1024)` = 1 draw ([instancing.md](instancing.md)).
- "those cubes never move again" -> `BatchingUtility.batchStaticModel(grid, batchedRoot)` (`src/cocos/3d/misc/batch-utils.ts:65`), 1 draw at 256 and at 50000 quads (`docs/manual/batching-recipes.md:61-62`).
- "the cube count or the vertex data changes every frame" -> `utils.MeshUtils.createDynamicMesh` (`src/cocos/3d/misc/create-mesh.ts:419`) plus `Mesh.updateSubMesh` (`src/cocos/3d/assets/mesh.ts:588`).
- "two meshes refuse to merge" -> `Mesh.validateMergingMesh` (`src/cocos/3d/assets/mesh.ts:1085`) compares bundle count, attribute formats, primitive count and mode, and rejects a dynamic mesh before `Mesh.merge` (`:771`) returns `false`.
- "how many draws did that actually save" -> `profiler.showStats()` and its `draws` row (`src/cocos/profiler/profiler.ts:590`); the harness asserts against the live counter instead of trusting the route name (`examples/shared/batching-routes.ts:179-180`).
- "do I need a static-batch component for UI" -> no: `UIStaticBatch` is inert in this fork (`src/cocos/2d/components/ui-static-batch.ts:85`, `:106`), and auto-batching keys are in [batching-routes.md](batching-routes.md).
- "UI sprites with many different textures" -> the dynamic atlas acceptance rules and knob defaults in [dynamic-atlas.md](dynamic-atlas.md).
- "my sprites stopped batching after I repainted a texture" -> texture hash is part of the batch key (`src/cocos/2d/renderer/render-data.ts:460-463`), so a new texture object starts a new batch even for identical pixels.
- "is my loop actually paused" -> `game.isPaused()` (`src/cocos/game/game.ts:615`); `director.isPaused()` (`src/cocos/game/director.ts:693`) reports only the logic gate and stays false while the main loop is stopped.
- "the device is too slow at DPR 3" -> `pixelRatioCap` in the app options (`src/air/app.ts:81`), then `resolutionScale` only when you accept softer text.
- "can I trust the 50k starfield number as a budget" -> no, the recorded evidence covers visibility, interaction and release only ([profiles.md](profiles.md)).
