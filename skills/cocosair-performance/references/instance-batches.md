# Explicit instance batches

Use `createAirInstanceBatch` for many copies of a fixed indexed mesh without one Node per copy. Native `USE_INSTANCING` still serves ordinary shared-material MeshRenderers; it is a different stream owner. For shape-to-shape GPU interpolation use [morph fields](gpu-morph-fields.md).

Check the actual consumer's exports/declarations first: older installed bundles may not include these helpers. This route requires initialized WebGL2. Package examples import `cocosair.js`; the repository examples' `cocosair` import-map alias is not an npm package name.

## Minimal batch

After `createAirApp()`, with a Scene and visible Camera already prepared:

```ts
import { createAirInstanceBatch, utils, primitives, Mat4, Vec3, Vec4 } from 'cocosair.js';

const mesh = utils.createMesh(primitives.box());
const batch = createAirInstanceBatch({ parent: scene, mesh, capacity: 128, count: 3 });
for (let i = 0; i < 3; i++) {
    batch.setMatrix(i, Mat4.fromTranslation(new Mat4(), new Vec3(i * 2 - 2, 0, 0)));
    batch.setColor(i, new Vec4(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, 1));
}
batch.commit();
```

Each batch uses one native Node/Model and shares the original Mesh buffers. Each submesh/pass still needs a draw; do not promise one draw for arbitrary multi-pass or multi-submesh assets. Default material is opaque, double-sided, linear-color unlit; it is not a PBR or shadow material.

## Publish and capacity

`setMatrix`/`setColor` stage CPU edits. `commit(start?, count?)` uploads the selected instance range; omitted arguments commit the dirty span. Other staged edits stay pending. Bounds, `getMatrix()` and `raycast()` consume committed matrices, not unpublished values. `info.lastUploadBytes` reports that instance update, not uniform/driver traffic or GPU completion time.

`reserve(n)` grows capacity while preserving committed and pending data; it does not change the visible count. Commit new data before `setCount(n)` exposes it. `setCount(0)` disables drawing rather than falling back to an ordinary non-instanced draw. Capacity is explicit; the 1..1,048,576 guard is not a throughput promise.

Custom materials must declare all four `AIR_INSTANCE_ATTRIBUTES` as instanced RGBA32F inputs at locations 8..11: three matrix columns with translation in their W components, followed by linear RGBA. Do not also enable native `USE_INSTANCING`. The helper rejects incompatible streams, excess attributes and unsupported device limits.

Input is fixed indexed `TRIANGLE_LIST` geometry with finite bounds. Do not reset/destroy/re-upload borrowed mesh buffers while the batch is alive. Dynamic meshes and native Mesh Morph data are not accepted by this helper.

## Bounds, picking and release

`getWorldBounds()` includes committed instance and parent transforms. `raycast(ray)` is a CPU triangle test, returns the closest `instanceIndex`, and is not GPU picking; its cost grows with the instances considered. Form the ray with native Camera framebuffer coordinates, converting DOM CSS pixels and flipping Y first.

`batch.dispose()` is idempotent; direct destruction of `batch.node` also retires owned buffers. The borrowed Mesh and optional user Material remain caller-owned. The helper releases its references and destroys only its own default material. For a mesh created solely for this feature, dispose the batch before `mesh.destroy()`; do not destroy a shared mesh just because one consumer exits.

In a checkout, `examples/instance-batch/` and `tools/verify/instance-batch.cjs` cover actual indexed draw counts, range updates, zero count, bounds/picking and GPU deletion. A field assignment or profiler FPS alone is not proof. Local Chromium reports are subsets, not full browser/release acceptance.

Canonical checkout guide/source: `docs/guides/instance-batches.md`, `src/air/rendering/instance-batch.ts` and `instance-data.ts`. These paths are optional source references; this copied skill supplies neither the SDK nor browser tooling.
