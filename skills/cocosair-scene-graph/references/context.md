# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry the page imports.
- [cocosair-application](../../cocosair-application/SKILL.md) - `app.run`/`getScene`/`releaseScene`/`close` and the single per-document runtime.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - proving a lifecycle or refcount claim in a browser instead of asserting it.

Camera culling fields (`visibility`), `createUICanvas` sorting layers, global `input.on` listeners and action mapping, and glTF/asset loading are owned by the cocosair-camera, cocosair-ui-2d, cocosair-input-action and cocosair-gltf skills (not yet authored; route through the router).

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Assemble scenes in code with the original `Scene`/`Node`/`Component` classes, predict transform and `active` inheritance, subscribe and unsubscribe node events correctly, and manage layers, `find`, `NodePool`, scene globals and refcounts. AIR ships no Creator editor pipeline: no tool serializes `.scene`/`.prefab` assets and no project `resources` bundle exists, so everything is built and released through code.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Expecting Creator asset URLs and Prefab data to resolve
- [HIGH] Assuming node.destroy() unsubscribes everything
- [MEDIUM] Mutating layer bits by hand instead of the registration path
- [MEDIUM] Reading world scale as the value you set

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Build and drive the Cocos AIR scene graph with the original Cocos APIs - Scene as the Node tree root, Node addChild/insertChild/removeChild/removeFromParent/setParent and getChildByUuid, active versus activeInHierarchy hiding, local setScale versus inherited worldScale, the Component lifecycle order onLoad onEnable start update lateUpdate onDisable onDestroy, node on/off/once/emit events and exactly what node.destroy() does and does not unsubscribe, Layers bits with UI_2D and DEFAULT and addLayer plus makeMaskInclude/makeMaskExclude, find by path, NodePool put/get, scene.globals ambient fog skybox lightProbeInfo activation, and Scene or SceneAsset addRef decRef plus autoReleaseAssets refcounting. Use when building or re-parenting nodes, ordering component lifecycle, subscribing node or input events, assigning camera-culling layers, pooling nodes, or releasing scenes without leaking.

### Keywords

Cocos AIR, cocosair.js, scene, graph

## References

- [node-ops.md](node-ops.md) - Node hierarchy and transform method tables, active semantics, `find`, `NodePool`, local vs world arithmetic, lifecycle order, main entry export surface inventory.
- [layers.md](layers.md) - `Layers` bit values with actual numbers, reserved range, `addLayer`/`deleteLayer`, `makeMaskInclude`/`makeMaskExclude`, `UI_2D`/`DEFAULT`, default camera mask culling truth.
- [node-events.md](node-events.md) - `NodeEventType` string values, `director`/`game` event constants, `on/off/once/emit/targetOff`, and precisely what `destroy()` releases.
- [scene-globals.md](scene-globals.md) - `scene.globals` object table, activation timing, read-only vs writable, `SceneAsset`/`Asset` refcount rules and `autoReleaseAssets`.

## Canonical docs

`docs/manual/scenegraph.md`, `docs/manual/creating-a-scene.md`, `docs/manual/component-lifecycle.md`, `docs/manual/scene-switching.md`, `docs/manual/api-behavior-contracts.md`.
