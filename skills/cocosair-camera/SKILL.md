---
name: cocosair-camera
description: "Configure Camera projection, viewports, framing and screen/world conversion. Use for split-screen, pointer rays, wrong screenToWorld results or AIR_E_ORTHO_WIDTH."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - switch perspective and orthographic views
  - fit a loaded model in view
  - stack cameras or create split-screen views
  - convert pointer pixels to a world ray
  - screenToWorld results or orthographic width are wrong
owns: [projection, viewport, camera-framing, screen-world, camera-order, oblique-plane]
not_for:
  - register node layer bits -> cocosair-scene-graph
  - offscreen render targets -> cocosair-rendering
  - physics collision queries -> cocosair-physics
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置相机投影、视口、可见层和多相机顺序，并进行坐标转换、射线拾取与模型取景。用于相机配置或屏幕与世界坐标问题。"
---

# Cocos AIR camera

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Camera projection, framing, viewports, draw order and screen/world conversion.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Add a camera or change projection
- Fit a loaded model into view
- Split-screen or picture-in-picture views
- Choose camera draw order and visible layers
- Convert pointer pixels to a world ray
- Clip a mirror or water view at an oblique plane

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Use component conversion methods and left-bottom framebuffer pixels. `worldToScreen` and `screenToWorld` use different depth conventions; prefer a ray for picking. Camera visibility must include the node layer.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Use framebuffer pixels without dividing by devicePixelRatio.
- [HIGH] Component and render-camera argument orders differ.
- [MEDIUM] Draw order follows priority, not creation order.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Frame or clip a view?](references/camera-projection.md) - Projection and bounds
- [Stack multiple views?](references/multi-camera.md) - Priority, clear and layers
- [Pointer to world?](references/screen-world.md) - Pixels, rays and depth
