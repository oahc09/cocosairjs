---
name: cocosair-scene-graph
description: "Build and drive the Cocos AIR scene graph with the original Cocos APIs - Scene as the Node tree root, Node addChild/insertChild/removeChild/removeFromParent/setParent and getChildByUuid, active versus activeInHierarchy hiding, local setScale versus inherited worldScale, the Component lifecycle order onLoad onEnable start update lateUpdate onDisable onDestroy, node on/off/once/emit events and exactly what node.destroy() does and does not unsubscribe, Layers bits with UI_2D and DEFAULT and addLayer plus makeMaskInclude/makeMaskExclude, find by path, NodePool put/get, scene.globals ambient fog skybox lightProbeInfo activation, and Scene or SceneAsset addRef decRef plus autoReleaseAssets refcounting. Use when building or re-parenting nodes, ordering component lifecycle, subscribing node or input events, assigning camera-culling layers, pooling nodes, or releasing scenes without leaking."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, scene, graph"
  description_en: "Build and drive the Cocos AIR scene graph with the original Cocos APIs - Scene as the Node tree root, Node addChild/insertChild/removeChild/removeFromParent/setParent and getChildByUuid, active versus activeInHierarchy hiding, local setScale versus inherited worldScale, the Component lifecycle order onLoad onEnable start update lateUpdate onDisable onDestroy, node on/off/once/emit events and exactly what node.destroy() does and does not unsubscribe, Layers bits with UI_2D and DEFAULT and addLayer plus makeMaskInclude/makeMaskExclude, find by path, NodePool put/get, scene.globals ambient fog skybox lightProbeInfo activation, and Scene or SceneAsset addRef decRef plus autoReleaseAssets refcounting. Use when building or re-parenting nodes, ordering component lifecycle, subscribing node or input events, assigning camera-culling layers, pooling nodes, or releasing scenes without leaking."
  description_zh: "使用原生 Scene、Node、Component 构建场景树并管理层、事件、生命周期和资源释放。用于节点组织、组件更新、对象池或场景配置。"
---

# Cocos AIR scene graph

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Assemble scenes in code with the original `Scene`/`Node`/`Component` classes, predict transform and `active` inheritance, subscribe and unsubscribe node events correctly, and manage layers, `find`, `NodePool`, scene globals and refcounts. AIR ships no Creator editor pipeline: no tool serializes `.scene`/`.prefab` assets and no project `resources` bundle exists, so everything is built and released through code.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Which attach, re-parent, lookup, active or pooling method do I want, and what does it emit?" -> [node-ops.md](references/node-ops.md).
- "Which layer bit may I use, and does the default camera already see it?" -> [layers.md](references/layers.md).
- "Which subscriptions does `node.destroy()` release and which must I unsubscribe by hand?" -> [node-events.md](references/node-events.md).
- "When do `scene.globals` edits reach the renderer, and where can I read effective values back?" -> [scene-globals.md](references/scene-globals.md).
- "How do I release a scene or `SceneAsset` without leaking refs?" -> the refcount contract below plus [scene-globals.md](references/scene-globals.md).
- "Exact lifecycle order and `dt` units?" -> the contracts below plus the lifecycle table in [node-ops.md](references/node-ops.md).

## Contracts

Use native Scene/Node/Component objects. `destroy()` is deferred; detach external listeners explicitly and distinguish local active state from `activeInHierarchy`.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Expecting Creator asset URLs and Prefab data to resolve
- [HIGH] Assuming node.destroy() unsubscribes everything
- [MEDIUM] Mutating layer bits by hand instead of the registration path
- [MEDIUM] Reading world scale as the value you set

## References

- [node-ops.md](references/node-ops.md) - Node hierarchy and transform method tables, active semantics, `find`, `NodePool`, local vs world arithmetic, lifecycle order, main entry export surface inventory.
- [layers.md](references/layers.md) - `Layers` bit values with actual numbers, reserved range, `addLayer`/`deleteLayer`, `makeMaskInclude`/`makeMaskExclude`, `UI_2D`/`DEFAULT`, default camera mask culling truth.
- [node-events.md](references/node-events.md) - `NodeEventType` string values, `director`/`game` event constants, `on/off/once/emit/targetOff`, and precisely what `destroy()` releases.
- [scene-globals.md](references/scene-globals.md) - `scene.globals` object table, activation timing, read-only vs writable, `SceneAsset`/`Asset` refcount rules and `autoReleaseAssets`.

## Canonical docs

`docs/manual/scenegraph.md`, `docs/manual/creating-a-scene.md`, `docs/manual/component-lifecycle.md`, `docs/manual/scene-switching.md`, `docs/manual/api-behavior-contracts.md`.
