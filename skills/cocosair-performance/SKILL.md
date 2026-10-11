---
name: cocosair-performance
description: Drives the Cocos AIR draw-call and frame-budget surface - the only three batching routes (shared mesh across N renderers, Mesh.merge and BatchingUtility.batchStaticModel for static subtrees, utils.MeshUtils.createDynamicMesh with Mesh.updateSubMesh for per-frame geometry), instancing through the single USE_INSTANCING material define with its 1024-per-group split, dynamic atlas defaults and silent-null acceptance rules, 2D auto-batch keys on director.root.batcher2D, the profiler singleton counters behind the pipeline.profiler gate, on-demand rendering as game.pause plus game.step behind Director.EVENT_AFTER_DRAW, pixelRatioCap and the DPR import-order contract, and the recorded limits of the 50k starfield evidence. Use when draw calls equal object count, batching hundreds of cubes or sprites, hitting AIR_E_MESH_CAPACITY or AIR_E_PIXEL_RATIO_IMPORT_ORDER, enabling dynamicAtlasManager, showing the stats overlay, checking whether the loop is really paused, or cutting resolution on a slow device.
---

# Cocos AIR performance contracts

Cut draw calls through the three documented batching routes and the one instancing macro, keep 2D sprites batchable, and read the frame budget with the profiler singleton plus pause/step rendering.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material,
         Vec3, primitives, utils, BatchingUtility, profiler, director, Director, game } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 2 });  // #GameCanvas exists before this import
const scene = new Scene('Main');
const camNode = new Node('Main');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 3, 8)); camNode.lookAt(new Vec3(0, 1, 0));
camNode.addComponent(Camera);
const lightNode = new Node('Key');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 6)); lightNode.lookAt(new Vec3(0, 0, 0));
lightNode.addComponent(DirectionalLight);
const mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));   // one Mesh object
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });                             // one Material object
const grid = new Node('grid');
scene.addChild(grid);
for (let i = 0; i < 9; i++) {                    // 3x3 cubes on separate nodes
    const cube = new Node(`cube-${i}`);
    grid.addChild(cube); cube.setPosition(new Vec3(i % 3 - 1, 0.5, Math.floor(i / 3) - 1));
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = mesh; renderer.material = material;   // shared resources still submit 9 models: 9 draws
}
const batchedRoot = new Node('batchedRoot');        // the merge output node, kept separate
scene.addChild(batchedRoot);
console.log('batchStaticModel', BatchingUtility.batchStaticModel(grid, batchedRoot));  // sources now enabled = false
app.run(scene);
profiler.showStats();                   // overlay rows: Draw call, Frame time (ms), Triangle, GFX Texture Mem(M)
// render on demand instead of a free-running loop: subscribe first, pause inside the callback, step per interaction
director.once(Director.EVENT_AFTER_DRAW, () => { if (!game.isPaused()) game.pause(); });
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-application](../cocosair-application/SKILL.md) - `game` and `createAirApp` lifecycle, `designResolution` and the rest of the option plumbing; this skill owns only `pixelRatioCap` cost and the pause/step discipline.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes a name and how `AIR_FEATURES` variants are built; this skill reads the default bundle face only.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - node activation order, `layer` bits and when a `MeshRenderer` component exists at all; this skill owns what batching does to those renderers.
- [cocosair-camera](../cocosair-camera/SKILL.md) - `visibility` masks, camera `priority` and frustum culling, which keep running per node under every route below.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - effect and material authoring, including the shader side of `USE_INSTANCING`; this skill owns the batching decision and the draw count.
- [cocosair-primitives-mesh](../cocosair-primitives-mesh/SKILL.md) - `Mesh` structure, attributes and `createPrimitiveGeometry`; this skill owns `Mesh.merge` and the dynamic-mesh update loop.
- [cocosair-rendering](../cocosair-rendering/SKILL.md) - lights, shadows, render targets and pipeline reachability; shadow and target cost is not this skill.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - `AirUIMesh` authoring and its geometry limits; this skill owns its atlas and lease behavior, and `Vec3`/`Mat4` helpers come from [cocosair-math](../cocosair-math/SKILL.md).
- [cocosair-verification](../cocosair-verification/SKILL.md) - gate and evidence-collection commands; the two performance collectors are summarized there.

## When to use what

- "1000 identical cubes and I get 1000 draws" -> route 1 stays 1000 unless the shared material carries `defines: { USE_INSTANCING: true }`, then `Math.ceil(1000 / 1024)` = 1 draw (`references/instancing.md`).
- "those cubes never move again" -> `BatchingUtility.batchStaticModel(grid, batchedRoot)` (`src/cocos/3d/misc/batch-utils.ts:65`), 1 draw at 256 and at 50000 quads (`docs/manual/batching-recipes.md:61-62`).
- "the cube count or the vertex data changes every frame" -> `utils.MeshUtils.createDynamicMesh` (`src/cocos/3d/misc/create-mesh.ts:419`) plus `Mesh.updateSubMesh` (`src/cocos/3d/assets/mesh.ts:588`).
- "two meshes refuse to merge" -> `Mesh.validateMergingMesh` (`src/cocos/3d/assets/mesh.ts:1085`) compares bundle count, attribute formats, primitive count and mode, and rejects a dynamic mesh before `Mesh.merge` (`:771`) returns `false`.
- "how many draws did that actually save" -> `profiler.showStats()` and its `draws` row (`src/cocos/profiler/profiler.ts:590`); the harness asserts against the live counter instead of trusting the route name (`examples/shared/batching-routes.ts:179-180`).
- "do I need a static-batch component for UI" -> no: `UIStaticBatch` is inert in this fork (`src/cocos/2d/components/ui-static-batch.ts:85`, `:106`), and auto-batching keys are in `references/batching-routes.md`.
- "UI sprites with many different textures" -> the dynamic atlas acceptance rules and knob defaults in `references/dynamic-atlas.md`.
- "my sprites stopped batching after I repainted a texture" -> texture hash is part of the batch key (`src/cocos/2d/renderer/render-data.ts:460-463`), so a new texture object starts a new batch even for identical pixels.
- "is my loop actually paused" -> `game.isPaused()` (`src/cocos/game/game.ts:615`); `director.isPaused()` (`src/cocos/game/director.ts:693`) reports only the logic gate and stays false while the main loop is stopped.
- "the device is too slow at DPR 3" -> `pixelRatioCap` in the app options (`src/air/app.ts:81`), then `resolutionScale` only when you accept softer text.
- "can I trust the 50k starfield number as a budget" -> no, the recorded evidence covers visibility, interaction and release only (`references/profiles.md`).

## Contracts

- There are exactly three batching routes and one instancing macro; no fourth batching API exists (`docs/manual/batching-recipes.md:3-10`). Shared mesh plus shared material is shared memory, not a shared draw (`docs/manual/batching-recipes.md:8`). `UIStaticBatch` resolves by symbol name on the default bundle face (`src/cocos/2d/components/ui-static-batch.ts:57`) but does nothing: `postUpdateAssembler` (`:85`) and `markAsDirty` (`:106`) have their bodies commented out and the batcher side `setupStaticBatch` (`src/cocos/2d/renderer/batcher-2d.ts:642`), `endStaticBatch` (`:648`), `commitStaticBatch` (`:666`) have no live caller in `src/`.
- `BatchingUtility.batchStaticModel(staticModelRoot, batchedRoot)` (`src/cocos/3d/misc/batch-utils.ts:65`) needs at least two `MeshRenderer` components under the source root; with fewer it logs `the number of static models to batch is less than 2,it needn't batch.` and returns `false` (`:68-:69`). It bakes each world matrix into one merged mesh, sets `comp.enabled = false` on every source renderer (`:91`), and adds one `MeshRenderer` to `batchedRoot` whose `sharedMaterials` are copied from the first model (`:93-95`). Incompatible meshes or materials abort with `the meshes of ... and ... can't be merged` / `the materials of ... and ... can't be merged`. After it returns `true` the source nodes have no live renderer and cannot move or retexture individually; `unbatchStaticModel` (`:108`) is the only call that re-enables them and destroys the batched mesh.
- Dynamic meshes are a post-`createAirApp()` API: creating or initializing one earlier throws `AIR_E_MESH_NOT_READY` (`src/cocos/3d/misc/create-mesh.ts:265`, `src/cocos/3d/assets/mesh.ts:416`), and `Mesh.updateSubMesh` on a mesh that is not an initialized dynamic mesh throws the same code with `initialize the dynamic mesh before updateSubMesh` (`src/cocos/3d/assets/mesh.ts:588-590`). Reserved capacity comes from `{ maxSubMeshes: 1, maxSubMeshVertices: 1024, maxSubMeshIndices: 1024 }` (`src/cocos/3d/misc/mesh-validation.ts:22`); `AIR_E_MESH_CAPACITY` is thrown from six places - option keys (`:25`), initial vertices (`:112`), initial indices (`:114`), update vertices (`:40`), update attribute bytes (`:51`), update indices (`:61`) - and the whole reservation has a `512 MiB` ceiling (`:118`), while a `primitiveIndex` outside `maxSubMeshes` throws `AIR_E_MESH_PRIMITIVE` (`:104-:105`). Reuse one typed array, refresh bounds every frame and call `onGeometryChanged()` on the live renderer (`examples/shared/batching-routes.ts:91`).
- The only instancing entry is the material define `material.initialize({ effectName: 'builtin-unlit', defines: { USE_INSTANCING: true } })` (`examples/shared/batching-routes.ts:104`); `InstancedBuffer` is the engine-side accumulator, not the entry (`docs/notes/geometry-batching-assessment.md:24`). `Pass._syncBatchingScheme()` (`src/cocos/render-scene/core/pass.ts:819-830`) rewrites the define to `false` and drops to `BatchingSchemes.NONE` with no message when `Feature.INSTANCED_ARRAYS` is missing, and a per-node material instance resets the macro (`src/cocos/render-scene/core/pass-instance.ts:119`), so one shared material whose effect declares the macro is mandatory. Capacity is `INITIAL_CAPACITY = 32`, `MAX_CAPACITY = 1024` (`src/cocos/rendering/instanced-buffer.ts:58-59`) and a full group is skipped so another one is created (`:120`, `:126`), so expected draws are `Math.ceil(count / 1024)` (`examples/shared/batching-routes.ts:179`); grouping splits on index-buffer objectID, lightmap objectID, reflection-probe fields and stride (`src/cocos/rendering/instanced-buffer.ts:113-115`). `MeshRenderer.setInstancedAttribute` (`src/cocos/3d/framework/mesh-renderer.ts:733`) returns silently while `this.model` is null, so write after the renderer is active. Instancing removes submit cost, not per-object logic (`docs/manual/optimize-lots-of-objects.md:127-128`).
- `dynamicAtlasManager` ships disabled (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:56`) because the only enabling code, `init()` (`:169-171`), is `@internal` and nothing calls it; you set `enabled = true` yourself. That setter runs `reset()` in both directions, destroying every atlas texture (`:72-84`), and while enabling subscribes a reset on every scene launch (`:77`, `:162-164`). `textureSize` (2048, `:52`) and `maxAtlasCount` (5, `:51`) setters only store the value, so change them before the first frame is packed. `insertSpriteFrame` (`:183`) returns `null` with no log for a frame that is disabled/atlas-full, already a sub-rectangle (`original`), `packable === false`, or uses any sampler other than LINEAR min, LINEAR mag, NONE mip (`:188-198`); `maxFrameSize` 512 (`:53`) and `_checkPackable()` (`src/cocos/2d/assets/sprite-frame.ts:1175-1197`) decide the rest.
- 2D batch identity is `dataHash = murmurhash2_32_gc(`${bufferId}${layer} ${textureHash}`, 666)` (`src/cocos/2d/renderer/render-data.ts:460-463`) and the break predicate also compares material and depth-stencil stage (`src/cocos/2d/renderer/batcher-2d.ts:453`), with the batch material taken from `comp.getRenderMaterial(0)` (`:465`). `Batcher2D` is not an export name on the default bundle face; the export block lists it as `Batcher2D as UI`, and the live instance is `director.root.batcher2D` (`src/cocos/root.ts:153`). `_releaseDescriptorSetCache` (`src/cocos/2d/renderer/batcher-2d.ts:993`) is marked engine-internal and is invoked by texture destruction and label texture replacement; release or replace the texture asset instead of calling it. Batch buffers size from `macro.BATCHER2D_MEM_INCREMENT` = 144 KB (`src/cocos/core/platform/macro.ts:1136`).
- `profiler` is one module-level singleton (`src/cocos/profiler/profiler.ts:617`) with no numeric readout API: `showStats()` (`:233`), `hideStats()` (`:183`), `isShowingStats()` (`:179`), `setBackgroundColor()` (`:141`), `setFontColor()` (`:152`) and the fixed counter set (`:74-87`) are the whole surface. Both color setters destroy and rebuild a visible panel (`:146-149`, `:157-160`), so set them before the first `showStats()`; `hideStats()` is a full teardown that nulls the pipeline slot (`:186-:229`). The overlay is itself scene geometry and renders only when the model exists, is enabled and the pass carries `showStatistics` (`src/cocos/rendering/custom/executor.ts:1282-1283`, slot `src/cocos/rendering/custom/pipeline.ts:123`), and its numbers refresh behind a 500 ms wall-clock gate (`src/cocos/profiler/profiler.ts:584-586`). `setDisplayStats` (`src/cocos/core/platform/debug.ts:414`) and `isDisplayStats` (`:405`) are deprecated forwarders.
- On-demand rendering is pause plus step, not a mode, and it is layered on a loop that always starts continuous (`docs/manual/rendering-on-demand.md:6`). Subscribe `director.once(Director.EVENT_AFTER_DRAW, ...)` (`src/cocos/game/director.ts:240`, emitted right after `frameMove`) and call `game.pause()` (`src/cocos/game/game.ts:591`) inside it: pausing synchronously after `app.run(scene)` draws zero frames and the event never fires. `game.step()` is `director.tick(this._calculateDT(true))` (`:551-552`) and advances the fixed `frameTime / 1000` (`:1048-1050`), so set `game.frameRate` (`:416`) first. `director.pause()` (`src/cocos/game/director.ts:333`) gates only the update block (`:795-816`) while `frameMove` keeps running (`:818-821`), so it cannot stop rendering. `game.resume()` clears queued input first (`src/cocos/game/game.ts:603-605`), and pause suspends input dispatch and audio too, so an on-demand scene must name its own wake-up source.
- `pixelRatioCap` is a load-order contract: resolution is option, then the legacy `__CCDPR_CAP__` global, then `2`, and `0`, negative or non-finite throws `AIR_E_PIXEL_RATIO_CAP` (`src/air/app-config.ts:66-69`). The PAL adapter computes `Math.min(window.devicePixelRatio ?? 1, cap)` while the engine module is being imported (`src/pal/screen-adapter/web/screen-adapter.js:78-82`), so importing the engine directly and setting the cap afterwards throws `AIR_E_PIXEL_RATIO_IMPORT_ORDER` (`src/air/bootstrap.ts:111-112`); `cocosair.js/bootstrap` writes the global before the import (`:118`). Window size is CSS pixels times DPR (`src/pal/screen-adapter/web/screen-adapter.js:83-88`) and `resolution = windowSize * resolutionScale` (`:97-100`), so the cap cuts fragment work at fixed layout while `resolutionScale` shrinks the framebuffer and costs text legibility.
- Keep the three capability layers apart. `BatchingUtility`, `Mesh`, `utils`, `Material`, `MeshRenderer`, `profiler`, `Profiler`, `game`, `director`, `Director`, `DynamicAtlasManager`, `dynamicAtlasManager`, `AirUIMesh`, `UIStaticBatch`, `InstancedBuffer` and `macro` each resolve by symbol name in the single `export { ... }` block of `build/cocosair.module.js`; `device` and `Batcher2D` do not appear as export names (`device` is absent, `Batcher2D` appears aliased as `Batcher2D as UI`), so `device.numDrawCalls` (`src/cocos/profiler/profiler.ts:590`) is only reachable through the overlay row and the 2D batcher only through `director.root.batcher2D`. Browser-verified ids at candidate fingerprint `2f089f6ce25eaccd` are `batching-shared`, `batching-merged`, `batching-dynamic`, `batching-utility`, `profiler-overlay` and `starfield-galaxy`, but the `batching-utility` entry binds `BatchingUtility.batchStaticModel` and `unbatchStaticModel` to the `no-runtime-error` validator only: that example passes one argument to each call (`examples/batching-utility/src/main.ts:85`, `:93`) on a node carrying a single `MeshRenderer` (`:46`, `:50`), so `src/cocos/3d/misc/batch-utils.ts:67-69` returns `false` and the merge path is never exercised there - the two-argument contract above comes from source, not from that id. No recorded entry covers the `?instancing=1` arm, dynamic atlas packing, `AirUIMesh` batching effects or on-demand stepping, and the recipe p95 table (`docs/manual/batching-recipes.md:56-65`) reports null GPU and present time (`:71-73`).

## Common Mistakes

### [HIGH] Reaching for a generic static-batch component

Wrong:
```js
import { UIStaticBatch } from 'cocosair';
node.addComponent(UIStaticBatch);            // import succeeds, nothing throws, draws stay the same
renderer.batching = true;                     // no such flag on MeshRenderer
```

Correct:
```js
// route 1: one shared Mesh + Material across N nodes (draws stay N unless USE_INSTANCING)
// route 2: BatchingUtility.batchStaticModel(grid, batchedRoot) or Mesh.merge for static geometry
// route 3: utils.MeshUtils.createDynamicMesh(...) + Mesh.updateSubMesh for per-frame geometry
```

The name is exported and Creator-era pages carry `StaticBatch`/`UIStaticBatch`, so an agent adds the component and reads a silent no-op as success: both lifecycle bodies are commented out in this fork (`src/cocos/2d/components/ui-static-batch.ts:85`, `:106`) and the batcher's static path has no caller, so nothing batches and nothing warns (`references/batching-routes.md`).

### [HIGH] Expecting each node to keep its own material after batching

Wrong:
```js
BatchingUtility.batchStaticModel(grid, batchedRoot);
for (const cube of grid.children) cube.getComponent(MeshRenderer).material = highlight;   // no visual change
grid.children[0].setPosition(0, 5, 0);                                                     // still renders at the old spot
```

Correct:
```js
BatchingUtility.unbatchStaticModel(grid, batchedRoot);   // restores the independent renderers
for (const cube of grid.children) cube.getComponent(MeshRenderer).material = highlight;
BatchingUtility.batchStaticModel(grid, batchedRoot);     // only if the batch is wanted again
```

The doc comment promises that every world transform is preserved, which reads as per-node identity being preserved, but the call sets `comp.enabled = false` on each source renderer and puts one merged renderer on the batched root with the first model's `sharedMaterials` (`src/cocos/3d/misc/batch-utils.ts:91`, `:93-95`), so per-node writes land on disabled components while the merged mesh keeps drawing the baked result.

### [HIGH] Using director.pause to stop rendering and setDisplayStats for stats

Wrong:
```js
app.run(scene);
game.pause();                       // synchronous: zero frames drawn, EVENT_AFTER_DRAW never fires
setDisplayStats(true);              // deprecated forwarder, silently no-ops without cclegacy.profiler
director.pause();                   // the update block stops, frameMove keeps drawing
```

Correct:
```js
profiler.showStats();               // read Frame time and Draw call from the engine panel
app.run(scene);
director.once(Director.EVENT_AFTER_DRAW, () => game.pause());   // pause after the first real frame
document.querySelector('#GameCanvas').addEventListener('pointerdown', () => game.step());   // then one frame per wake-up
```

`director.pause()` only gates the update block while `frameMove` and the renderer update run unconditionally (`src/cocos/game/director.ts:333`, `:795-816`, `:818-821`), and pausing before the loop has drawn strands the subscriber entirely (`docs/manual/rendering-on-demand.md:50-59`), so the scene looks frozen-but-rendering and the stats never appear (`references/profiles.md`).

### [MEDIUM] Turning dynamic atlas on mid-scene and expecting a silent win

Wrong:
```js
dynamicAtlasManager.enabled = true;      // after hundreds of frames, and after other code kept textures alive
dynamicAtlasManager.textureSize = 4096;  // expecting existing atlases to grow
sprite.enabled = true;                   // assumes every sprite is now packed
```

Correct:
```js
dynamicAtlasManager.maxFrameSize = 512; dynamicAtlasManager.textureSize = 2048;
dynamicAtlasManager.enabled = true;      // set the knobs first, before any frame is packed
console.log(dynamicAtlasManager.insertSpriteFrame(frame) === null);   // rejection is a silent null
```

The `enabled` setter destroys every atlas in both directions and re-resets on scene launch (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:72-84`, `:162-164`) while the size setters only store (`:96`, `:135`), so flipping it late throws away packed textures and the new size is ignored; and `insertSpriteFrame` declines frames carrying `original`, `packable === false` or a non-LINEAR sampler with a plain `null` (`:188-198`), which an agent reads as the feature being broken.

## References

- `references/batching-routes.md` - the three routes with their measured draws, harness caps and `AIR_E_MESH_*` errors, `batchStaticModel`/`unbatchStaticModel` effects, `Batcher2D` batch keys and buffer sizing, `UIStaticBatch` inertness, measurement scope, browser-verified ids.
- `references/dynamic-atlas.md` - the default off state and why, knob defaults with setters, silent-`null` acceptance rules, atlas layout and bleeding, what makes a `SpriteFrame` packable, texture identity and the internal descriptor-set cache, `AirUIMesh` texture leases and geometry capacity, verification status.
- `references/instancing.md` - the single `USE_INSTANCING` macro entry, how it becomes a batching scheme and its silent downgrade, per-instance attributes the builtin effects declare, grouping keys, capacity and split draws, `setInstancedAttribute` timing, what instancing does not buy, the three capability layers, the stale manual sentence.
- `references/profiles.md` - the `profiler`/`Profiler` surface with every counter and its source, color setters and teardown, the `pipeline.profiler` render gate, the deprecated `setDisplayStats` forwarders, `game.pause`/`step`/`resume` and the fixed dt, the first-frame trap, `pixelRatioCap` and the DPR chain, the 50k evidence boundary, the two tools-side collectors.

## Canonical docs

- `docs/manual/batching-recipes.md` - open for the three-route table, the fixed measurement conditions and the p95 draw and CPU numbers behind every batching claim.
- `docs/manual/optimize-lots-of-objects.md` - open for the 100-cube `BatchingUtility` contract probe, the batch/unbatch scene-graph dumps and the static-only usage constraints.
- `docs/manual/rendering-on-demand.md` - open for the PARTIAL status, the pause/step sequence in source order and the two measured traps with their timings.
