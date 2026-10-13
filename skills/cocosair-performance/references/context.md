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
