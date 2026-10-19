---
name: cocosair-rendering
description: "Configure lighting, shadows, render targets, MSAA and sRGB. Use for offscreen pixels, post-processing, AIR_E_RENDER_TARGET_SAMPLES or AIR_E_TEXTURE_COLOR."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - scene brightness looks wrong
  - no shadows from lights
  - render mirror or refraction into a texture
  - texture looks washed out after load
  - can bloom or post-processing run
owns: [lighting, shadows, render-target, msaa, srgb, post-process]
not_for:
  - material property types -> cocosair-materials-effects
  - camera framing or projection -> cocosair-camera
  - DOM offscreen textures -> cocosair-graphics-and-dom
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置灯光、阴影、渲染目标、MSAA、颜色契约和管线可达性。用于光照、阴影、离屏渲染、读回或后处理问题。"
---

# Cocos AIR rendering contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: legacy forward lighting, shadows, offscreen targets, color contracts and pipeline reachability.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Wrong brightness or competing directional lights
- Missing shadows or unsupported light types
- Mirror, refraction or second-view camera texture
- Resize bindings, pixel readback or MSAA negotiation
- Glass or gem transmission capture
- Texture format and sRGB decode mismatch
- Bloom, post-processing or custom-pipeline availability

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Legacy forward uses one effective main directional light. Check the shadow support matrix and all cast/receive switches. Report requested versus effective MSAA and verify actual pixels.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Shadow maps need all cast/receive switches.
- [HIGH] Pipeline imports do not activate post-processing.
- [HIGH] A second directional light is not an independent fill light.
- [MEDIUM] Requested MSAA may differ; validation does not build textures.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Wrong brightness?](references/lighting-units.md) - Units and main light
- [No shadows?](references/shadow-matrix.md) - Support grid and switches
- [Offscreen pixels?](references/render-target.md) - Targets, MSAA and capture
- [Washed-out textures?](references/color-contract.md) - Format and decode
- [Can bloom run?](references/pipeline-reachability.md) - Pipeline reachability
