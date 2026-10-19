---
name: cocosair
description: "Route Cocos AIR tasks across subsystem skills and direct dependencies. Use to choose a primary owner, adapt Creator knowledge, or apply Code First and capability-evidence rules."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Bash
when_to_use:
  - which skill owns this AIR task
  - choose only the dependencies needed for this step
  - adapt Creator knowledge to code-first AIR
  - distinguish source exports from proven browser capabilities
owns: [skill-routing, primary-owner, direct-dependencies, code-first, capability-layers]
not_for:
  - startup errors -> cocosair-application
  - material property failures -> cocosair-materials-effects
layer: router
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "为 Cocos AIR 任务选择主技能和直接依赖，并遵循原生 API、启动时序与能力证据分层。用于开始 AIR 开发、定位能力归属或选择技能。"
---

# Cocos AIR skill router

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Choose one owner and required direct dependencies. Reuse loaded skills.

Environment: [environment](references/environment.md).

## Quick Start

[Minimal setup](references/context.md#quick-start).

Siblings: [owners and direct dependencies](references/context.md#related-skills).

## Triggers

- Choose the owner of an AIR task
- Adapt Creator knowledge to Code First
- Separate API exports from usable capabilities

Mappings: [triggers](references/triggers.md).

## Code First discipline

1. Original APIs first: use the engine's `Scene`, `Node`, `Camera`, `Component`, `Material`, `Texture2D` and `Sprite`; AIR helpers compose these objects. Do not invent parallel scene, node or material abstractions.
2. Browser rendering requires WebGL 2 and nothing else; unsupported contexts reject startup with `WEBGL2_REQUIRED`. WebGL 1, Canvas and WebGPU are not supported renderer fallbacks. HEADLESS tests produce no rendered pixels.
3. Use only the browser main entry `cocosair.js`. Main import before canvas creation is supported; pass canvas and pixelRatioCap to createAirApp. For deferred loading, dynamically import the main entry in the application. Startup and HTML texture helpers share the main declarations; there are no bootstrap/html-source package subpaths.
4. Native material property writes require declared properties and matching value types; `USE_TEXTURE` must match whether the effect samples a texture.
5. Keep ownership explicit. Detach renderers and bindings before destroying their textures; borrow shared assets and release only resources the feature owns.
6. Skeletal joints use full paths relative to the skinning root. For glTF decoders and Spine, inspect their documented deployment and license boundaries.

## Contracts

Keep source-exported, bundle-reachable, configured and browser-verified claims separate. Feature membership alone is not reachability. Default and AIR_FEATURES variant builds are different candidates; verification requires PASS on the current candidate. A typecheck or API declaration does not prove rendering, interaction or lifecycle behavior. See [full qualifiers](references/context.md#contracts).

## Common Mistakes

- [HIGH] Check canvas admission against the current main-entry contract.
- [HIGH] AIR has no Creator resources bundle pipeline.
- [MEDIUM] A docs mention is not capability evidence.

Read [wrong/right examples](references/common-mistakes.md); note historical warnings.

## No route matched

Use current main-entry declarations and canonical docs in the located package or checkout. Disclose missing resources; do not invent APIs or roots. Clarify only consequential missing context.

## Reference map

- [Which owner?](references/context.md#related-skills) - Direct dependencies
- [Which environment?](references/environment.md) - Roots and prerequisites
- [Legacy route terms?](references/skill-index.md) - Compatibility index
