# Cocos AIR materials and effects triggers

Source annotations refer to the AIR checkout.

## When to use what

- "Paint a 3D object, no lighting" -> `initialize({ effectName: 'builtin-unlit' })` + `mainColor`.
- "Physically shaded object" -> `effectName: 'builtin-standard'` + `metallic`/`roughness`/`emissive`; table in [property-types.md](property-types.md).
- "Show a texture" -> the map macro FIRST in `initialize({ defines })`, then `setProperty`; `USE_TEXTURE` for unlit and sprite, `USE_ALBEDO_MAP` for standard ([defines.md](defines.md)).
- "Two objects, same recipe, different colors" -> two `new Material()`; `Material.copy(src, overrides?)`, never a shared builtin write.
- "Change one renderer without touching its material" -> `renderer.getMaterialInstance(i)` / the `renderer.material` getter; semantics in [builtin-effects.md](builtin-effects.md).
- "Change a macro or blend state after initialization" -> `MaterialInstance.recompileShaders` / `MaterialInstance.overridePipelineStates`; a plain `Material` only warns.
- "Write my own GLSL" -> compiled-shape effect JSON + `glsl3` variant + `effect.onLoaded()`; [custom-glsl.md](custom-glsl.md).
- "Per-frame uniform" -> cache `pass.getHandle(name)` and call `Pass.setUniform(handle, value)`.
- "Fog on an unlit object" -> `createAirUnlitFogEffect()`.
- "Mask a Sprite" -> `attachAirSpriteMask(sprite, texture, options?)`.
- "What state does this material really have" -> `inspectAirMaterial(material)`, or `inspectAirMeshMaterial(mesh, material)` for define-versus-attribute checks.
