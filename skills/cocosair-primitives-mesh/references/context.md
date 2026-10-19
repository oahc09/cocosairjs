# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `Node`, `Layers.Enum.DEFAULT`, component `enabled` and release ordering a `MeshRenderer` rides on.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - the material and `overridePipelineStates` that turn a `Mesh` into pixels; this skill only produces geometry.
- [cocosair-rendering](../../cocosair-rendering/SKILL.md) - the camera, lighting and shadow gates that decide whether an attached `MeshRenderer` is drawn at all.
- [cocosair-math](../../cocosair-math/SKILL.md) - `Vec3` bounds and transforms used by `translate`/`scale` and by hand-written `minPos`/`maxPos`.

Skinning weight binding (joint attributes), morph target authoring, asset loading and disposal policy, and performance of many instances belong to the cocosair-skinning-morph, cocosair-assets and cocosair-performance skills; load the matching existing skill when the task needs it. This skill owns only the `MeshRenderer` write contract below: `bakeSettings`, morph `setWeight` and `setInstancedAttribute`.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Generate procedural geometry in code, convert it into a renderable `Mesh` asset, and know exactly where a `MeshRenderer` will accept it.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Assigning the createPrimitiveGeometry result straight to MeshRenderer.mesh
- [HIGH] Passing a shape outside the four-type whitelist to createPrimitiveGeometry
- [HIGH] Calling primitives.cone with an options object
- [MEDIUM] Expecting includeNormal to strip a channel from a descriptor shape
- [MEDIUM] Reading an attribute with a gfx.ATTRIB_POSITION constant

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Builds and attaches procedural geometry in a Cocos AIR Code First scene - the nine primitives.* shape generators and their parameter defaults, the createPrimitiveGeometry(descriptor) helper whose box, sphere, cylinder, cone whitelist, integer segment cap of 1024, predicted-vertex cap and arc range throw RangeError AIR_E_PRIMITIVE_DESCRIPTOR, turning the returned IGeometry into a Mesh with utils.createMesh, hand-authoring a Mesh struct from gfx.Attribute and Format rows and reading or copying vertex attributes and indices, and driving MeshRenderer hooks such as bakeSettings, setInstancedAttribute and morph setWeight. Use when generating a box, sphere, cylinder or cone without a Creator asset, wiring a BufferGeometry-style object to a renderer, hitting AIR_E_PRIMITIVE_DESCRIPTOR, choosing new Mesh plus struct versus primitives.box, reading mesh vertex attributes, or exporting geometry as OBJ or wireframe.

### Keywords

Cocos AIR, cocosair.js, primitives, mesh

## References

- [primitive-shapes.md](primitive-shapes.md) - the nine `primitives.*` generators with call signatures and source-level defaults, plane orientation, `circle`'s four quirks, the `translate`/`scale`/`wireframed` edits, the deprecated helpers, the `Primitive` asset `PrimitiveType` ordinals, and the three capability layers.
- [mesh-attributes.md](mesh-attributes.md) - `Mesh.IStruct`/`IVertexBundle`/`ISubMesh`/`IBufferView`/`ICreateInfo` field maps, `reset`/`assign`/`initialize`, the `gfx.Attribute` constructor and `AttributeName` table, default `Format` per channel with byte sizes, index format promotion, interleaving and copy rules, the full read/copy attribute and index API with null-versus-throw behavior, the `MeshRenderer` hook table (`bakeSettings`, morph `setWeight`, `setInstancedAttribute`) and the reachable converter names.
- [create-primitive-geometry.md](create-primitive-geometry.md) - the `AirPrimitiveDescriptor` union, per-shape field whitelist, exact numeric and segment caps with source lines, the predicted-vertex formulas and arc range, the `RangeError AIR_E_PRIMITIVE_DESCRIPTOR` failure contract, the includeNormal/includeUV no-op, and reachability plus test coverage.

## Canonical docs

`docs/manual/primitives.md`, `docs/manual/custom-buffergeometry.md`, `docs/manual/primitive-descriptors.md`.
