---
name: cocosair-scene-graph
description: Build and drive the Cocos AIR scene graph with the original Cocos APIs - Scene as the Node tree root, Node addChild/insertChild/removeChild/removeFromParent/setParent and getChildByUuid, active versus activeInHierarchy hiding, local setScale versus inherited worldScale, the Component lifecycle order onLoad onEnable start update lateUpdate onDisable onDestroy, node on/off/once/emit events and exactly what node.destroy() does and does not unsubscribe, Layers bits with UI_2D and DEFAULT and addLayer plus makeMaskInclude/makeMaskExclude, find by path, NodePool put/get, scene.globals ambient fog skybox lightProbeInfo activation, and Scene or SceneAsset addRef decRef plus autoReleaseAssets refcounting. Use when building or re-parenting nodes, ordering component lifecycle, subscribing node or input events, assigning camera-culling layers, pooling nodes, or releasing scenes without leaking.
---

# Cocos AIR scene graph

Assemble scenes in code with the original `Scene`/`Node`/`Component` classes, predict transform and `active` inheritance, subscribe and unsubscribe node events correctly, and manage layers, `find`, `NodePool`, scene globals and refcounts. AIR ships no Creator editor pipeline: no tool serializes `.scene`/`.prefab` assets and no project `resources` bundle exists, so everything is built and released through code.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Component, Layers, Vec3 } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // canvas must exist before this import

const scene = new Scene('Main');          // Scene extends Node: attach children to it directly
const root = new Node('Root');
root.layer = Layers.Enum.DEFAULT;         // 3D culling needs camera.visibility to CONTAIN node.layer; the default camera mask already includes DEFAULT
root.setPosition(new Vec3(0, 1, 0));      // local coords, relative to the parent
scene.addChild(root);                     // returns void; no chaining

class Spinner extends Component {
    update (dt) {                         // dt is in SECONDS, not milliseconds
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0);
    }
}
root.addComponent(Spinner);               // onLoad -> onEnable -> start -> update -> lateUpdate
app.run(scene);                            // running a new scene destroys the previous one
</script>
```

Entry choice, importmap alias and install are owned by [cocosair-project-setup](../cocosair-project-setup/SKILL.md); `createAirApp` options and the run/release/close handle by [cocosair-application](../cocosair-application/SKILL.md).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry the page imports.
- [cocosair-application](../cocosair-application/SKILL.md) - `app.run`/`getScene`/`releaseScene`/`close` and the single per-document runtime.
- [cocosair-verification](../cocosair-verification/SKILL.md) - proving a lifecycle or refcount claim in a browser instead of asserting it.

Camera culling fields (`visibility`), `createUICanvas` sorting layers, global `input.on` listeners and action mapping, and glTF/asset loading are owned by the cocosair-camera, cocosair-ui-2d, cocosair-input-action and cocosair-gltf skills (not yet authored; route through the router).

## When to use what

- "Which attach, re-parent, lookup, active or pooling method do I want, and what does it emit?" -> `references/node-ops.md`.
- "Which layer bit may I use, and does the default camera already see it?" -> `references/layers.md`.
- "Which subscriptions does `node.destroy()` release and which must I unsubscribe by hand?" -> `references/node-events.md`.
- "When do `scene.globals` edits reach the renderer, and where can I read effective values back?" -> `references/scene-globals.md`.
- "How do I release a scene or `SceneAsset` without leaking refs?" -> the refcount contract below plus `references/scene-globals.md`.
- "Exact lifecycle order and `dt` units?" -> the contracts below plus the lifecycle table in `references/node-ops.md`.

## Contracts

- `Scene extends Node`. A scene is the tree root; call `scene.addChild(node)`. `app.run(newScene)` and `director.loadScene` route through `runSceneImmediate`, which destroys the previous scene; its children are destroyed with it. `director.getScene()` is the live scene; `find` defaults to it. Tables: `references/node-ops.md`.
- Component lifecycle runs in this fixed order: `__preload` -> `onLoad` -> `onEnable` -> (first frame) `start` -> `update(dt)` -> `lateUpdate(dt)` -> `onDisable` -> `onDestroy`. `onLoad` runs before any `start`; `start` runs before the first `update`; `dt` is in seconds. `active=false` stops `update` scheduling, not just rendering. `references/node-ops.md`.
- `node.destroy()` is deferred and narrow: it marks the object `ToDestroy`; the real teardown runs at end of frame in `_destroyImmediate` -> `_onPreDestroyBase`, whose `this._eventProcessor.destroy()` call clears this node's OWN node-event listeners only. The exception is a scene switch: `runSceneImmediate` calls the old scene's `destroy()` and then `CCObject._deferredDestroy()` within the same call (`director.ts:446, :464`), so after `app.run(newScene)` the previous scene already reads `isValid === false`. `input.on`/`Input.EventType` subscriptions, DOM `addEventListener`, `director`/`game` events and callbacks registered on OTHER nodes are out of scope and must be released explicitly (the `scene-switch-reentry` example unsubscribes `input.on` in `onDisable`). `references/node-events.md`.
- `addChild(child)` returns void; do not chain. `setScale(...)` and the `scale` getter act on LOCAL scale; `worldScale` multiplies the parent chain (setting world scale back-solves local). `setParent(value, keepWorldTransform = false)` keeps the child's local transform by default. `references/node-ops.md`.
- Layers are a bit mask in `node.layer` (default `Layers.Enum.DEFAULT`) tested against `camera.visibility`; a mismatch draws nothing, and the two passes test it differently: the 3D render queue requires containment, `(visibility & node.layer) === node.layer` (`src/cocos/rendering/scene-culling.ts:198`), while the 2D path uses the non-zero test `visibility & node.layer` (`src/cocos/2d/renderer/batcher-2d.ts:265`), so an OR-ed multi-bit `node.layer` must be wholly inside the 3D mask or the 3D pass culls it. The engine default camera mask (`CAMERA_DEFAULT_MASK`) already includes DEFAULT and every user bit (0-19), so a default Camera draws DEFAULT-layer and registered-custom-layer nodes without touching `visibility`; only nodes moved to an excluded bit or a replaced mask go unseen. Register custom layers through `Layers.addLayer(name, bit)` and build masks with `makeMaskInclude`/`makeMaskExclude`; do not hand-OR reserved bits. Bit numbers and the reserved range: `references/layers.md`.
- Scene globals (`ambient`, `fog`, `skybox`, `shadows`, `octree`, `skin`, `lightProbeInfo`) are writable config objects reached via `scene.globals`, with a two-phase sync. Before activation edits are staged on the config fields; scene activation (`_activate` -> `_globals.activate`, `scene.ts:204`, skipped in TEST) binds them to the render resources on `director.root.pipeline.pipelineSceneData` (members `ambient`/`fog`/`skybox`/`shadows`/`octree`/`skin`/`postSettings`/`lightProbes`, `pipeline-scene-data.ts:107-115`) and pushes the staged values. After activation the member setters write the bound resource directly (each setter guards `if (this._resource)`), so post-`run` edits apply too. `scene.renderScene` exposes neither ambient nor fog nor skybox; read effective values from `scene.globals` or the bound `pipelineSceneData` members. `references/scene-globals.md`.
- Refcount: `Asset.addRef()` increments `_ref` (`asset.ts:316-319`); `decRef(autoRelease = true)` decrements only while `_ref > 0` (`asset.ts:331-334`) and, when `autoRelease`, queues a release attempt through `releaseManager.tryRelease` (`asset.ts:335-336`). Nothing frees synchronously: the free runs on the next tick and only while the count is zero or circular references are all that remains (`release-manager.ts:224-229, :249-253`). A loaded `SceneAsset` (a thin wrapper holding `.scene`) follows the same rule. `Scene.autoReleaseAssets` defaults to `false`; on switch away the release manager calls `decRef(TEST || oldScene.autoReleaseAssets)` on the old scene's dependencies (`release-manager.ts:179, :189`), so leaving it `false` keeps those assets resident until you release them. `references/scene-globals.md`.
- Capability layers, stated separately (source export / default-bundle reachable / browser-verified): every symbol in this skill's surface resolves by symbol name in the main entry declaration `build/cocosair.module.d.ts` (line-level inventory in `references/node-ops.md`, Main entry export surface; re-exported through `src/exports/base.ts`). Node-tree behavior in `examples/node-hierarchy` and scene-switch/refcount behavior in `examples/scene-switch-reentry` carry browser evidence in `docs/evidence/examples-verified.json`, but that file is `measuredAt` 2026-10-04 recorded for candidate fingerprint `2f089f6ce25eaccd`, while the current tree recomputes to `8f3e573cebbb315f` (`candidateFingerprint()` in `tools/verify/api-trace.cjs`); cite it as historical until the gate is re-run against the current candidate. A symbol resolving by name does not by itself prove the behavior is browser-verified.

## Common Mistakes

### [HIGH] Expecting Creator asset URLs and Prefab data to resolve

Wrong:

```ts
import { Component, Prefab, instantiate, resources, SpriteFrame } from 'cocosair'; // same page alias as the Quick Start
class Enemy extends Component {
    bulletPrefab: Prefab = null;                 // nothing ever fills it: no Creator tool serializes .prefab
    fire () { instantiate(this.bulletPrefab); }  // instantiate runs on an always-null field
}
resources.load('enemies/goblin', SpriteFrame);   // rejects: no project resources bundle backs the URL
```

Correct:

```ts
import { Scene, Node, Component } from 'cocosair';
class Enemy extends Component {          // plain subclass; register by the class reference
    onLoad (): void { /* build children in code */ }
}
const node = new Node('Enemy');          // build the hierarchy programmatically
node.addComponent(Enemy);                 // addComponent(Enemy), not addComponent('Enemy')
```

AIR ships the `Prefab`/`instantiate`/`resources` classes but no Creator editor to serialize `.scene`/`.prefab` assets and no project `resources` bundle for Creator-style URLs to hit, so a Creator-parity load fails on the missing asset instead of falling back; reuse built subtrees through `NodePool` (`references/node-ops.md`), and a string component name in `addComponent` resolves only when that class was registered by name.

### [HIGH] Assuming node.destroy() unsubscribes everything

Wrong:

```ts
class Ticker extends Component {
    taps = 0;
    onEnable () { input.on(Input.EventType.TOUCH_START, this.onTap, this); }
    // no onDisable off(); relies on destroy() cleaning it up -> stale listener on the global input
    onTap () { this.taps++; }   // taps keep rising after the scene switch: destroy() never touched input.on
}
```

Correct:

```ts
class Ticker extends Component {
    onEnable ()  { input.on(Input.EventType.TOUCH_START, this.onTap, this); }
    onDisable () { input.off(Input.EventType.TOUCH_START, this.onTap, this); } // explicit off
    onTap () { /* ... */ }
}
const ticker = new Ticker();
const other = scene.getChildByName('Other')!;
other.on(NodeEventType.TOUCH_END, ticker.onTap, ticker); // a callback on ANOTHER node, bound to this target
other.targetOff(ticker);                                 // release it by hand; destroying the Ticker node never does
```

`destroy()` only clears the node's own `on`/`once` listeners inside the deferred `_destroyImmediate`, and even that lands at end of frame (`isValid` stays true until then - unless the switch's `runSceneImmediate` purges the queue in the same call, see Contracts); `input.on`, DOM listeners, `director`/`game` events and callbacks bound on other nodes are never touched, so a scene switch leaks them.

### [MEDIUM] Mutating layer bits by hand instead of the registration path

Wrong:

```ts
Layers.Enum.MyUi = 1 << 25;              // collides with reserved UI_2D bit and skips the enum update
node.layer = node.layer | (1 << 28);     // bit 28 is reserved (PROFILER)
camera.visibility = 1 << 20;             // a single reserved bit: DEFAULT and every other layer fails the 3D containment test and is culled
```

Correct:

```ts
Layers.addLayer('MyUi', 5);              // user bits only (0-19); 20-31 are reserved
node.layer = Layers.Enum.MyUi;
camera.visibility = Layers.makeMaskInclude([Layers.Enum.DEFAULT, Layers.Enum.MyUi]);
```

`addLayer` writes both `Layers.Enum` and `Layers.BitMask` and rejects bits outside 0-19; hand-setting reserved bits silently breaks the profiling and UI culling channels, and a single-bit replacement mask leaves the camera matching only that bit, so every other node goes unseen. IGNORE_RAYCAST is a ray-picking convention, not a hide-from-camera bit (the default camera mask still includes bit 20, and physics raycast masks use `PhysicsGroup` bits rather than `node.layer`): `references/layers.md`.

### [MEDIUM] Reading world scale as the value you set

```ts
parent.setScale(new Vec3(2, 2, 2));
child.setScale(new Vec3(1, 1, 1));
console.log(child.scale);                // (1,1,1) local, exactly what you set
console.log(child.worldScale);           // (2,2,2) = parent world scale * local scale, not (1,1,1)
```

`setScale` writes LOCAL scale; `worldScale` multiplies up the parent chain (setting world scale back-solves local), so a child under a scaled or non-uniformly scaled parent renders and lights differently than its local value suggests. Arithmetic rows: `references/node-ops.md`.

## References

- `references/node-ops.md` - Node hierarchy and transform method tables, active semantics, `find`, `NodePool`, local vs world arithmetic, lifecycle order, main entry export surface inventory.
- `references/layers.md` - `Layers` bit values with actual numbers, reserved range, `addLayer`/`deleteLayer`, `makeMaskInclude`/`makeMaskExclude`, `UI_2D`/`DEFAULT`, default camera mask culling truth.
- `references/node-events.md` - `NodeEventType` string values, `director`/`game` event constants, `on/off/once/emit/targetOff`, and precisely what `destroy()` releases.
- `references/scene-globals.md` - `scene.globals` object table, activation timing, read-only vs writable, `SceneAsset`/`Asset` refcount rules and `autoReleaseAssets`.

## Canonical docs

`docs/manual/scenegraph.md`, `docs/manual/creating-a-scene.md`, `docs/manual/component-lifecycle.md`, `docs/manual/scene-switching.md`, `docs/manual/api-behavior-contracts.md`.
