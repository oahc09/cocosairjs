# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes `Material` and `EffectAsset`.
- [cocosair-application](../../cocosair-application/SKILL.md) - the device-initialization ordering that `Material.initialize` depends on.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `MeshRenderer` attachment, `node.layer` bits a material's draws are culled against.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - `camera.visibility` and clear flags decide whether a correct material is visible at all.
- [cocosair-math](../../cocosair-math/SKILL.md) - `Color`, `Vec3`, `Vec4`, `Mat3`, `Mat4`, `Quat` values a `setProperty` call must carry.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - the `ui-graphics-material` / `builtin-graphics` path and canvas-backed textures.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - pixel readback recipes that prove a material actually rendered.

Lighting, shadows and the post-process pipeline belong to the cocosair-rendering skill; mesh primitives and multi-material sub-models to cocosair-primitives-mesh; `SkinnedMeshRenderer` macro handling to cocosair-skinning-morph; UI 2D materials to cocosair-ui-2d; glTF material import to cocosair-gltf. Use the matching existing skill as a direct dependency; keep material authoring here.
