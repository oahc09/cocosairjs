# primitives and mesh authoring triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "Draw a cube, sphere, cylinder or cone in code" -> `createPrimitiveGeometry(descriptor)` then `utils.createMesh` (`src/air/primitive-geometry.ts:42`, `src/cocos/3d/misc/create-mesh.ts:46`).
- "Use a shape outside box/sphere/cylinder/cone, or fine-grained sub-division" -> the native `primitives.box|sphere|cylinder|cone|plane|quad|torus|capsule|circle` generators (`src/cocos/primitive/index.ts`).
- "Move, scale or wireframe geometry without a GPU round trip" -> `primitives.translate`, `primitives.scale`, `primitives.wireframed` (in-place `IGeometry` edits, `src/cocos/primitive/transform.ts`).
- "Store a primitive as a serialized asset" -> `new Primitive(); p.type = ...; p.info = {...}; p.onLoaded()` (`src/cocos/primitive/primitive.ts:50-86`); `info` carries only numbers.
- "Author a custom vertex buffer by hand" -> build a `Mesh.IStruct` and call `mesh.reset({ struct, data })` (`src/cocos/3d/assets/mesh.ts:182-267,676`), or hand an `IGeometry` to `utils.createMesh`.
- "Read or copy a mesh's attributes or indices back out" -> `mesh.readAttribute`, `mesh.copyAttribute`, `mesh.readIndices`, `mesh.copyIndices`, `mesh.readAttributeFormat` (`src/cocos/3d/assets/mesh.ts:1149-1295`).
- "Rewrite vertex or index data in place after creation" -> `utils.MeshUtils.createDynamicMesh(0, geometry, out?, options?)` (`src/cocos/3d/misc/create-mesh.ts:419`), the pattern shipped by `examples/interactive-geometry/src/main.ts:155`.
- "Feed a per-instance value into a material" -> `renderer.setInstancedAttribute(name, value)` (`src/cocos/3d/framework/mesh-renderer.ts:733`).
