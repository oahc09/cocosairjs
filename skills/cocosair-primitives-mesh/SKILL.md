---
name: cocosair-primitives-mesh
description: "Builds and attaches procedural geometry in a Cocos AIR Code First scene - the nine primitives.* shape generators and their parameter defaults, the createPrimitiveGeometry(descriptor) helper whose box, sphere, cylinder, cone whitelist, integer segment cap of 1024, predicted-vertex cap and arc range throw RangeError AIR_E_PRIMITIVE_DESCRIPTOR, turning the returned IGeometry into a Mesh with utils.createMesh, hand-authoring a Mesh struct from gfx.Attribute and Format rows and reading or copying vertex attributes and indices, and driving MeshRenderer hooks such as bakeSettings, setInstancedAttribute and morph setWeight. Use when generating a box, sphere, cylinder or cone without a Creator asset, wiring a BufferGeometry-style object to a renderer, hitting AIR_E_PRIMITIVE_DESCRIPTOR, choosing new Mesh plus struct versus primitives.box, reading mesh vertex attributes, or exporting geometry as OBJ or wireframe."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, primitives, mesh"
  description_en: "Builds and attaches procedural geometry in a Cocos AIR Code First scene - the nine primitives.* shape generators and their parameter defaults, the createPrimitiveGeometry(descriptor) helper whose box, sphere, cylinder, cone whitelist, integer segment cap of 1024, predicted-vertex cap and arc range throw RangeError AIR_E_PRIMITIVE_DESCRIPTOR, turning the returned IGeometry into a Mesh with utils.createMesh, hand-authoring a Mesh struct from gfx.Attribute and Format rows and reading or copying vertex attributes and indices, and driving MeshRenderer hooks such as bakeSettings, setInstancedAttribute and morph setWeight. Use when generating a box, sphere, cylinder or cone without a Creator asset, wiring a BufferGeometry-style object to a renderer, hitting AIR_E_PRIMITIVE_DESCRIPTOR, choosing new Mesh plus struct versus primitives.box, reading mesh vertex attributes, or exporting geometry as OBJ or wireframe."
  description_zh: "构建基本几何和原生 Mesh，检查顶点属性、索引、边界与渲染器写入契约。用于代码生成几何或自定义网格。"
---

# Cocos AIR primitives and mesh authoring

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Generate procedural geometry in code, convert it into a renderable `Mesh` asset, and know exactly where a `MeshRenderer` will accept it.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Draw a cube, sphere, cylinder or cone in code" -> `createPrimitiveGeometry(descriptor)` then `utils.createMesh` (`src/air/primitive-geometry.ts:42`, `src/cocos/3d/misc/create-mesh.ts:46`).
- "Use a shape outside box/sphere/cylinder/cone, or fine-grained sub-division" -> the native `primitives.box|sphere|cylinder|cone|plane|quad|torus|capsule|circle` generators (`src/cocos/primitive/index.ts`).
- "Move, scale or wireframe geometry without a GPU round trip" -> `primitives.translate`, `primitives.scale`, `primitives.wireframed` (in-place `IGeometry` edits, `src/cocos/primitive/transform.ts`).
- "Store a primitive as a serialized asset" -> `new Primitive(); p.type = ...; p.info = {...}; p.onLoaded()` (`src/cocos/primitive/primitive.ts:50-86`); `info` carries only numbers.
- "Author a custom vertex buffer by hand" -> build a `Mesh.IStruct` and call `mesh.reset({ struct, data })` (`src/cocos/3d/assets/mesh.ts:182-267,676`), or hand an `IGeometry` to `utils.createMesh`.
- "Read or copy a mesh's attributes or indices back out" -> `mesh.readAttribute`, `mesh.copyAttribute`, `mesh.readIndices`, `mesh.copyIndices`, `mesh.readAttributeFormat` (`src/cocos/3d/assets/mesh.ts:1149-1295`).
- "Rewrite vertex or index data in place after creation" -> `utils.MeshUtils.createDynamicMesh(0, geometry, out?, options?)` (`src/cocos/3d/misc/create-mesh.ts:419`), the pattern shipped by `examples/interactive-geometry/src/main.ts:155`.
- "Feed a per-instance value into a material" -> `renderer.setInstancedAttribute(name, value)` (`src/cocos/3d/framework/mesh-renderer.ts:733`).

## Contracts

Geometry is not a renderer: attach a MeshRenderer and material under a visible camera. Validate descriptor limits and vertex/index layouts; keep mesh ownership explicit.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Assigning the createPrimitiveGeometry result straight to MeshRenderer.mesh
- [HIGH] Passing a shape outside the four-type whitelist to createPrimitiveGeometry
- [HIGH] Calling primitives.cone with an options object
- [MEDIUM] Expecting includeNormal to strip a channel from a descriptor shape
- [MEDIUM] Reading an attribute with a gfx.ATTRIB_POSITION constant

## References

- [primitive-shapes.md](references/primitive-shapes.md) - the nine `primitives.*` generators with call signatures and source-level defaults, plane orientation, `circle`'s four quirks, the `translate`/`scale`/`wireframed` edits, the deprecated helpers, the `Primitive` asset `PrimitiveType` ordinals, and the three capability layers.
- [mesh-attributes.md](references/mesh-attributes.md) - `Mesh.IStruct`/`IVertexBundle`/`ISubMesh`/`IBufferView`/`ICreateInfo` field maps, `reset`/`assign`/`initialize`, the `gfx.Attribute` constructor and `AttributeName` table, default `Format` per channel with byte sizes, index format promotion, interleaving and copy rules, the full read/copy attribute and index API with null-versus-throw behavior, the `MeshRenderer` hook table (`bakeSettings`, morph `setWeight`, `setInstancedAttribute`) and the reachable converter names.
- [create-primitive-geometry.md](references/create-primitive-geometry.md) - the `AirPrimitiveDescriptor` union, per-shape field whitelist, exact numeric and segment caps with source lines, the predicted-vertex formulas and arc range, the `RangeError AIR_E_PRIMITIVE_DESCRIPTOR` failure contract, the includeNormal/includeUV no-op, and reachability plus test coverage.

## Canonical docs

`docs/manual/primitives.md`, `docs/manual/custom-buffergeometry.md`, `docs/manual/primitive-descriptors.md`.
