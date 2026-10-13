---
name: cocosair-materials-effects
description: "Author and drive Cocos AIR materials in a Code First scene - new Material() plus initialize({effectName, defines, technique, states}), the 21 registered AIR effect entries and 17 builtin materials, setProperty value types for float, Vec3, Vec4, Color, Texture2D and arrays, the USE_TEXTURE versus USE_ALBEDO_MAP define gates, handleInfo property aliases, MaterialInstance versus shared materials, the Pass warn stubs for recompileShaders and overridePipelineStates, the glsl4 to glsl3 source transform, the set and binding layout assignEffectBindings enforces including CCSkinning at binding 3, createAirUnlitFogEffect, attachAirSpriteMask and inspectAirMaterial. Use when creating or configuring a Material or EffectAsset, picking builtin-standard or builtin-unlit, setting a color, texture or uniform array, overriding blend or depth state, writing custom GLSL, or debugging AIR_E_MATERIAL_NOT_READY, AIR_E_MATERIAL_TYPE, uniform buffer too small, a flat untextured surface or a setProperty call that does nothing."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, materials, effects"
  description_en: "Author and drive Cocos AIR materials in a Code First scene - new Material() plus initialize({effectName, defines, technique, states}), the 21 registered AIR effect entries and 17 builtin materials, setProperty value types for float, Vec3, Vec4, Color, Texture2D and arrays, the USE_TEXTURE versus USE_ALBEDO_MAP define gates, handleInfo property aliases, MaterialInstance versus shared materials, the Pass warn stubs for recompileShaders and overridePipelineStates, the glsl4 to glsl3 source transform, the set and binding layout assignEffectBindings enforces including CCSkinning at binding 3, createAirUnlitFogEffect, attachAirSpriteMask and inspectAirMaterial. Use when creating or configuring a Material or EffectAsset, picking builtin-standard or builtin-unlit, setting a color, texture or uniform array, overriding blend or depth state, writing custom GLSL, or debugging AIR_E_MATERIAL_NOT_READY, AIR_E_MATERIAL_TYPE, uniform buffer too small, a flat untextured surface or a setProperty call that does nothing."
  description_zh: "配置材质、效果、属性类型、宏和自定义 GLSL。用于 USE_TEXTURE、uniform 类型、效果初始化或材质诊断问题。"
---

# Cocos AIR materials and effects

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

A material in AIR is one effect recipe plus a bag of uniform values: `new Material()`, `initialize({ effectName })` picks the recipe, `setProperty(name, value)` fills it. There is no material inheritance tree, no `ShaderMaterial`, and no Editor asset pipeline - recipe names are strings and custom shaders are hand-written compiled effect JSON.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Paint a 3D object, no lighting" -> `initialize({ effectName: 'builtin-unlit' })` + `mainColor`.
- "Physically shaded object" -> `effectName: 'builtin-standard'` + `metallic`/`roughness`/`emissive`; table in [property-types.md](references/property-types.md).
- "Show a texture" -> the map macro FIRST in `initialize({ defines })`, then `setProperty`; `USE_TEXTURE` for unlit and sprite, `USE_ALBEDO_MAP` for standard ([defines.md](references/defines.md)).
- "Two objects, same recipe, different colors" -> two `new Material()`; `Material.copy(src, overrides?)`, never a shared builtin write.
- "Change one renderer without touching its material" -> `renderer.getMaterialInstance(i)` / the `renderer.material` getter; semantics in [builtin-effects.md](references/builtin-effects.md).
- "Change a macro or blend state after initialization" -> `MaterialInstance.recompileShaders` / `MaterialInstance.overridePipelineStates`; a plain `Material` only warns.
- "Write my own GLSL" -> compiled-shape effect JSON + `glsl3` variant + `effect.onLoaded()`; [custom-glsl.md](references/custom-glsl.md).
- "Per-frame uniform" -> cache `pass.getHandle(name)` and call `Pass.setUniform(handle, value)`.
- "Fog on an unlit object" -> `createAirUnlitFogEffect()`.
- "Mask a Sprite" -> `attachAirSpriteMask(sprite, texture, options?)`.
- "What state does this material really have" -> `inspectAirMaterial(material)`, or `inspectAirMeshMaterial(mesh, material)` for define-versus-attribute checks.

## Contracts

Create materials after app/device initialization. Property names and value types must match the effect; `USE_TEXTURE` must match the sampling path. Custom GLSL needs declared layouts and built-in bindings.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Setting the texture without its map macro
- [HIGH] Writing a shared material after the renderer instantiated it
- [HIGH] Calling the runtime recompile and state-override API on a plain Material
- [MEDIUM] Hand-writing a glsl3 variant that keeps Vulkan-only members

## References

- [builtin-effects.md](references/builtin-effects.md) - the 21 registered effect entries with definition lines, the 17 builtin material uuids with their `effectName` and `defines`, the registration and `tryCompile` timing, and which names are absent from the bundle export list.
- [property-types.md](references/property-types.md) - `gfx.Type` ordinals, the accepted-JS-value matrix per declared type with its error codes, `Color` byte-versus-fraction conversion, `linear: true` handling, the `setProperty` step order, `handleInfo` alias tables, and the full settable property lists of `builtin-standard` and `builtin-unlit`.
- [custom-glsl.md](references/custom-glsl.md) - effect JSON field contract, variant selection, the four `glsl4 -> glsl3` rules, the `assignEffectBindings` set/binding matrices including `CCSkinning -> 3` and why, registration timing, the `effect-json.mjs` generator and `effect-layout.ts` pre-check, black-screen triage order.
- [defines.md](references/defines.md) - where a macro must appear to have any effect, `USE_TEXTURE` versus `USE_ALBEDO_MAP`, the inert `USE_COLOR` define, the complete declared define lists of unlit, sprite and standard, runtime macro changes, fog defines and `createAirUnlitFogEffect`, define read-back and diagnostics.

## Canonical docs

`docs/manual/materials.md`, `docs/manual/custom-shaders.md`, `docs/manual/uniform-types.md`. Runnable references: `examples/shader-custom-gradient`, `examples/shader-dissolve`, `examples/material-basic`, `examples/material-color`, `examples/material-unlit`, `examples/material-ops`, `examples/material-lifecycle`.
