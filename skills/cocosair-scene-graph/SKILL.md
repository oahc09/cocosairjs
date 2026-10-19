---
name: cocosair-scene-graph
description: "Build Scene/Node hierarchies, Component lifecycles, layers and events. Use for reparenting, active inheritance, NodePool reuse, scene globals or resource release."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - attach or reparent nodes in a scene
  - understand component lifecycle and update order
  - a child is inactive or inherits unexpected scale
  - manage node events, layers or object pools
  - release scenes and external listeners without leaking
owns: [scene-hierarchy, component-lifecycle, node-events, layers, node-pool, scene-globals]
not_for:
  - native input and action mapping -> cocosair-input-action
  - app-level scene replacement -> cocosair-application
  - camera framing and projection -> cocosair-camera
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "使用原生 Scene、Node、Component 构建场景树并管理层、事件、生命周期和资源释放。用于节点组织、组件更新、对象池或场景配置。"
---

# Cocos AIR scene graph

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Native Scene/Node/Component trees, lifecycle, events, layers, pooling and scene globals.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Attach, reparent, find or pool scene nodes
- Distinguish local transforms and inherited state
- Choose layers and camera visibility masks
- Unsubscribe external listeners when nodes are destroyed
- Apply scene globals and inspect effective values
- Release Scene or SceneAsset references safely
- Check component lifecycle order and dt units

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Use native Scene/Node/Component objects. `destroy()` is deferred; detach external listeners explicitly and distinguish local active state from `activeInHierarchy`.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] No Creator .scene/.prefab or resources-bundle pipeline exists.
- [HIGH] node.destroy() does not unsubscribe external event sources.
- [MEDIUM] Register layers instead of manually assigning their bits.
- [MEDIUM] World scale includes inherited parent transforms.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Which node operation?](references/node-ops.md) - Hierarchy and lifecycle
- [Which layer is visible?](references/layers.md) - Bits and masks
- [Which listeners survive?](references/node-events.md) - Events and teardown
- [When do globals apply?](references/scene-globals.md) - Activation and refs
