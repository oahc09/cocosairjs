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

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

A material in AIR is one effect recipe plus a bag of uniform values: `new Material()`, `initialize({ effectName })` picks the recipe, `setProperty(name, value)` fills it. There is no material inheritance tree, no `ShaderMaterial`, and no Editor asset pipeline - recipe names are strings and custom shaders are hand-written compiled effect JSON.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Setting the texture without its map macro
- [HIGH] Writing a shared material after the renderer instantiated it
- [HIGH] Calling the runtime recompile and state-override API on a plain Material
- [MEDIUM] Hand-writing a glsl3 variant that keeps Vulkan-only members

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Author and drive Cocos AIR materials in a Code First scene - new Material() plus initialize({effectName, defines, technique, states}), the 21 registered AIR effect entries and 17 builtin materials, setProperty value types for float, Vec3, Vec4, Color, Texture2D and arrays, the USE_TEXTURE versus USE_ALBEDO_MAP define gates, handleInfo property aliases, MaterialInstance versus shared materials, the Pass warn stubs for recompileShaders and overridePipelineStates, the glsl4 to glsl3 source transform, the set and binding layout assignEffectBindings enforces including CCSkinning at binding 3, createAirUnlitFogEffect, attachAirSpriteMask and inspectAirMaterial. Use when creating or configuring a Material or EffectAsset, picking builtin-standard or builtin-unlit, setting a color, texture or uniform array, overriding blend or depth state, writing custom GLSL, or debugging AIR_E_MATERIAL_NOT_READY, AIR_E_MATERIAL_TYPE, uniform buffer too small, a flat untextured surface or a setProperty call that does nothing.

### Keywords

Cocos AIR, cocosair.js, materials, effects

## References

- [builtin-effects.md](builtin-effects.md) - the 21 registered effect entries with definition lines, the 17 builtin material uuids with their `effectName` and `defines`, the registration and `tryCompile` timing, and which names are absent from the bundle export list.
- [property-types.md](property-types.md) - `gfx.Type` ordinals, the accepted-JS-value matrix per declared type with its error codes, `Color` byte-versus-fraction conversion, `linear: true` handling, the `setProperty` step order, `handleInfo` alias tables, and the full settable property lists of `builtin-standard` and `builtin-unlit`.
- [custom-glsl.md](custom-glsl.md) - effect JSON field contract, variant selection, the four `glsl4 -> glsl3` rules, the `assignEffectBindings` set/binding matrices including `CCSkinning -> 3` and why, registration timing, the `effect-json.mjs` generator and `effect-layout.ts` pre-check, black-screen triage order.
- [defines.md](defines.md) - where a macro must appear to have any effect, `USE_TEXTURE` versus `USE_ALBEDO_MAP`, the inert `USE_COLOR` define, the complete declared define lists of unlit, sprite and standard, runtime macro changes, fog defines and `createAirUnlitFogEffect`, define read-back and diagnostics.

## Canonical docs

`docs/manual/materials.md`, `docs/manual/custom-shaders.md`, `docs/manual/uniform-types.md`. Runnable references: `examples/shader-custom-gradient`, `examples/shader-dissolve`, `examples/material-basic`, `examples/material-color`, `examples/material-unlit`, `examples/material-ops`, `examples/material-lifecycle`.
