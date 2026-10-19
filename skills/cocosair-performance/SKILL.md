---
name: cocosair-performance
description: "Optimize draw calls with static merge, instancing and dynamic atlases. Use for frame budgets, on-demand rendering, AIR_E_MESH_CAPACITY or AIR_E_PIXEL_RATIO_IMPORT_ORDER."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - draw calls equal the object count
  - batch many static meshes or UI sprites
  - measure actual draw counts and frame budget
  - stop rendering until the next requested frame
  - high pixel density makes the device too slow
owns: [batching, instancing, dynamic-atlas, profiler, on-demand-rendering, pixel-ratio]
not_for:
  - procedural geometry authoring -> cocosair-primitives-mesh
  - startup admission and app lifecycle -> cocosair-application
  - material property types -> cocosair-materials-effects
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "选择静态合批、动态图集和实例化，并检查性能统计、剔除和按需渲染。用于大量对象、动画或绘制性能优化。"
---

# Cocos AIR performance contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Batching, instancing, dynamic atlases, measured draws and pause/step frame budgets.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Reduce draws for many identical objects
- Batch static subtrees or update dynamic geometry
- Diagnose incompatible mesh merges
- Measure actual draws with profiler counters
- Pack UI textures or explain broken batches
- Pause rendering with one controlled step clock
- Limit pixel ratio on slow devices
- Check the limits of recorded performance evidence

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Choose static merge, dynamic atlas or instancing according to the scene and material. Measure actual draw counts. For on-demand rendering, wait for the first draw before pausing and keep one step clock.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] UIStaticBatch is inert; choose a supported batching route.
- [HIGH] Static batching does not preserve per-node materials.
- [HIGH] Use game.pause for the main loop and profiler.showStats.
- [MEDIUM] Turning atlas on mid-scene does not guarantee fewer draws.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Which batching route?](references/batching-routes.md) - Routes and counts
- [Can sprites pack?](references/dynamic-atlas.md) - Acceptance and leases
- [Will instancing help?](references/instancing.md) - Macro and grouping
- [What does profiling prove?](references/profiles.md) - Counters and step clock
