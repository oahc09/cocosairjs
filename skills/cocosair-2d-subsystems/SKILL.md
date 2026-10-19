---
name: cocosair-2d-subsystems
description: "Build DragonBones, TiledMap, particles and billboards from runtime data. Use for raw asset strings, missing pixels, MotionStreak or Spine backend limits."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - build DragonBones assets from raw JSON strings
  - TiledMap edits do not redraw or resolve objects
  - particles compute but render no pixels
  - Spine skeleton stays blank without an error
  - billboard or motion trail is invisible
owns: [dragonbones, tiledmap, particle-2d, billboard, motion-streak, spine-limits]
not_for:
  - basic UI layout and controls -> cocosair-ui-2d
  - 3D skeleton deformation -> cocosair-skinning-morph
  - remote asset caching -> cocosair-assets
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置 Spine、DragonBones、TiledMap、二维粒子和 Billboard 的原生运行时契约。用于资源构造、空白画面或子系统能力边界问题。"
---

# Cocos AIR 2D subsystem contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Spine, DragonBones, TiledMap, particle 2D, motion streak and billboards.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Spine runtime data stays null
- Build DragonBones from JSON and textures
- Load or edit runtime tile maps
- Particle emitter stays empty or blends incorrectly
- Motion streak export or texture ownership
- Billboard remains invisible or incorrectly sized

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Create the Canvas component before assigning its camera. Use runtime payloads, not Creator imports. Spine remains backend/asset blocked; particle plist fields and blend factors follow the native runtime contract.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Spine is blocked in the default bundle.
- [HIGH] TiledMap edits need the correct redraw path.
- [HIGH] Creator plist blend values need native runtime mapping.
- [MEDIUM] Check exported names and runtime atlas/path conventions.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Spine blocked?](references/spine.md) - Runtime and asset blockers
- [Build DragonBones?](references/dragonbones.md) - Payloads and pitfalls
- [Edit tiles?](references/tiledmap.md) - Arrays, dirty state and queries
- [Empty particles?](references/particle-2d.md) - Plist, blend and streaks
- [Invisible billboard?](references/billboard.md) - Size and texture ownership
