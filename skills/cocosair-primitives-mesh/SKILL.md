---
name: cocosair-primitives-mesh
description: "Build primitive geometry, Mesh buffers and MeshRenderer bindings. Use for vertex attributes, indices, wireframes or AIR_E_PRIMITIVE_DESCRIPTOR validation."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - generate a box, sphere, cylinder or cone
  - attach procedural geometry to a renderer
  - author custom vertex buffers and indices
  - read or copy mesh attributes
  - a primitive descriptor fails validation
owns: [primitive-geometry, mesh-buffers, vertex-attributes, mesh-indices, mesh-renderer, wireframe]
not_for:
  - draw-call batching and instancing -> cocosair-performance
  - skeletal binding or morph weights -> cocosair-skinning-morph
  - material uniforms and effects -> cocosair-materials-effects
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "构建基本几何和原生 Mesh，检查顶点属性、索引、边界与渲染器写入契约。用于代码生成几何或自定义网格。"
---

# Cocos AIR primitives and mesh authoring

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Procedural shape geometry, Mesh layouts, attribute access and renderer hooks.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Generate primitive shapes without Creator assets
- Validate AIR_E_PRIMITIVE_DESCRIPTOR and segment limits
- Transform or wireframe geometry on the CPU
- Build a Primitive asset or custom Mesh struct
- Read or copy vertex attributes and indices
- Update dynamic mesh buffers after creation
- Set a renderer instanced attribute

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Geometry is not a renderer: attach a MeshRenderer and material under a visible camera. Validate descriptor limits and vertex/index layouts; keep mesh ownership explicit.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Convert IGeometry with utils.createMesh before assigning mesh.
- [HIGH] Descriptor shapes are only box, sphere, cylinder and cone.
- [HIGH] primitives.cone takes radius, height, then optional options.
- [MEDIUM] Descriptor includeNormal does not strip a channel.
- [MEDIUM] Use AttributeName for mesh attribute reads.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Which shape API?](references/primitive-shapes.md) - Signatures and defaults
- [How are buffers laid out?](references/mesh-attributes.md) - Formats and reads
- [Why is a shape rejected?](references/create-primitive-geometry.md) - Descriptor limits
