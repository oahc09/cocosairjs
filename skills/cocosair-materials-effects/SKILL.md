---
name: cocosair-materials-effects
description: "Configure materials, effects, uniforms, defines and GLSL. Use for setProperty, missing textures, AIR_E_MATERIAL_NOT_READY, AIR_E_MATERIAL_TYPE or uniform buffer too small."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - setProperty changes nothing
  - texture missing after setProperty
  - different colors for each renderer
  - change blend or depth state
  - custom GLSL shader fails
owns: [material, effect, uniform-types, shader-defines, custom-glsl, material-instance]
not_for:
  - lighting, shadows or post-process -> cocosair-rendering
  - glTF material import -> cocosair-gltf
  - mesh geometry and sub-models -> cocosair-primitives-mesh
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置材质、效果、属性类型、宏和自定义 GLSL。用于 USE_TEXTURE、uniform 类型、效果初始化或材质诊断问题。"
---

# Cocos AIR materials and effects

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Material recipes, property types, texture defines, instances and custom GLSL.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Create unlit or physically shaded materials
- Texture stays flat or setProperty does nothing
- Give objects independent colors or material instances
- Change macros, blend state or depth state
- Write custom GLSL or debug uniform layouts
- Update uniforms per frame
- Add unlit fog or a Sprite mask
- Inspect material and mesh compatibility

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Create materials after app/device initialization. Property names and value types must match the effect; `USE_TEXTURE` must match the sampling path. Custom GLSL needs declared layouts and built-in bindings.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Enable the correct map macro before setting textures.
- [HIGH] Shared materials and renderer instances have distinct ownership.
- [HIGH] Plain Material runtime recompile/state overrides only warn.
- [MEDIUM] Remove Vulkan-only members from glsl3 variants.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Which material recipe?](references/builtin-effects.md) - Registration and instances
- [Property rejected?](references/property-types.md) - Types, aliases and color
- [Write custom GLSL?](references/custom-glsl.md) - Variants and binding layouts
- [Texture or macro inert?](references/defines.md) - Map gates and diagnostics
