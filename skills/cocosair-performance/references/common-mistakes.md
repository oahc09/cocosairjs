Derived from the cocosair-performance skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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

The name is exported and Creator-era pages carry `StaticBatch`/`UIStaticBatch`, so an agent adds the component and reads a silent no-op as success: both lifecycle bodies are commented out in this fork (`src/cocos/2d/components/ui-static-batch.ts:85`, `:106`) and the batcher's static path has no caller, so nothing batches and nothing warns ([batching-routes.md](batching-routes.md)).

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

`director.pause()` only gates the update block while `frameMove` and the renderer update run unconditionally (`src/cocos/game/director.ts:333`, `:795-816`, `:818-821`), and pausing before the loop has drawn strands the subscriber entirely (`docs/manual/rendering-on-demand.md:50-59`), so the scene looks frozen-but-rendering and the stats never appear ([profiles.md](profiles.md)).

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
