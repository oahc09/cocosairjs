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
