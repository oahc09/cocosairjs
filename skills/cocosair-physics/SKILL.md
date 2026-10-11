---
name: cocosair-physics
description: Applies to physics in code-first Cocos AIR apps - choosing the 3D backend with createAirApp({ physics: 'builtin' | 'cannon' }) (default builtin), selectPhysicsBackend and the official last-registration-before-init rule, the query-only boundary of the builtin discrete collision detector (no gravity integration, no MeshCollider in the world, trigger events and raycasts still real), PhysicsSystem/RigidBody/Collider wiring and the bidirectional group-and-mask filter, error 9642 for default-physics-material (fatal on cannon, benign on builtin) and AIR's built-in material registration, and the pure-JS 2D box2d backend with PhysicsSystem2D, RigidBody2D, Collider2D, BoxCollider2D and the raycast/testPoint/testAABB queries. Use when dynamic bodies do not fall or stack, when triggers fire silently, when deciding between builtin and cannon, when 9642 appears in the console, or when asking whether ammo, physx or box2d-wasm ship (they do not).
---

# Cocos AIR physics contracts

Pick the backend honestly, mount the framework components, and state what each backend actually simulates - no Creator asset bundle, no WASM artifacts, no parallel physics abstraction.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Component, Color, Vec3,
         BoxCollider, RigidBody, ERigidBodyType, PhysicsSystem, geometry } from 'cocosair';

// 'builtin' is also the default when physics is omitted; write it so the choice is visible.
// For gravity, falling and stacking use { physics: 'cannon' } instead - builtin has no integrator.
const app = await createAirApp({ canvas: '#GameCanvas', physics: 'builtin' });
const scene = new Scene('physics-demo');
const camNode = new Node('Main Camera'); scene.addChild(camNode); camNode.setPosition(new Vec3(0, 4, 10));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45; camera.near = 0.1; camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(24, 30, 44, 255);
const lightNode = new Node('Main Light'); scene.addChild(lightNode); lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;

const ground = new Node('Ground'); scene.addChild(ground);
const groundBody = ground.addComponent(RigidBody); groundBody.type = ERigidBodyType.STATIC;
const groundCollider = ground.addComponent(BoxCollider); groundCollider.size = new Vec3(12, 0.2, 12);

const sensorNode = new Node('Sensor'); scene.addChild(sensorNode); sensorNode.setPosition(0, 1, -3);
const sensor = sensorNode.addComponent(BoxCollider); sensor.isTrigger = true;
let triggerLog = 'none';
sensor.on('onTriggerEnter', () => { triggerLog = 'enter'; });
sensor.on('onTriggerExit', () => { triggerLog = 'exit'; });

// builtin never moves a node by itself: drive the transform yourself, sync is lazy.
const crate = new Node('Crate'); scene.addChild(crate); crate.setPosition(-2, 0.8, 2);
const crateBody = crate.addComponent(RigidBody); crateBody.type = ERigidBodyType.KINEMATIC;
crate.addComponent(BoxCollider).size = new Vec3(1.5, 1.5, 1.5);

class Driver extends Component {
    constructor () { super(); this.t = 0; }
    update (dt) {
        this.t += dt;
        crate.setPosition(-2, 0.8, 2 - Math.min(this.t * 2, 6));
        if (this.t > 1 && this.t < 1 + dt) {
            const ray = new geometry.Ray(0, 0.8, 4, 0, 0, -1);   // origin + direction, not a target point
            const hit = PhysicsSystem.instance.raycastClosest(ray);   // returns boolean
            console.log('closest hit:', hit, triggerLog);   // read PhysicsSystem.instance.raycastClosestResult
        }
    }
}
crate.addComponent(Driver);
app.run(scene);   // async render loop; PhysicsSystem steps inside it

function teardown () { PhysicsSystem.instance.enabled = false; scene.destroy(); }
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp` options and lifecycle that carry the `physics` field.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - component mount order and deferred `destroy()`, which colliders and the lazy world sync both depend on.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the browser-matrix contract rows behind the builtin boundary below.

## When to use what

- "queries, triggers, collision callbacks only" -> default `physics: 'builtin'`; zero external dependencies, real raycasts, no simulation.
- "gravity, falling, stacking, forces" -> `createAirApp({ physics: 'cannon' })`; pure-JS cannon from the vendored `@cocos/cannon`, both backends already in the default bundle (`tools/build/build.cjs:41`).
- "2D rigid bodies and queries" -> box2d is the default 2D backend (`src/cocos/physics-2d/box2d/instantiate.ts:43`); `PhysicsSystem2D.raycast/testPoint/testAABB` (`src/cocos/physics-2d/framework/physics-system.ts:362`, `:370`, `:378`), see `references/2d-box2d.md`.
- "ammo / physx / box2d-wasm" -> not shipped; the Emscripten artifacts do not exist in this repository (`docs/notes/physics-asset-sourcing.md:11-17`), see `references/backend-selection.md`.
- "why did my trigger stop firing after `setGroup`" -> the mask half of the pair is still 1; fix both sides (`docs/notes/physics-3d-notes.md:56-63`).

## Contracts

- `physics?: 'builtin' | 'cannon'` on `AirAppOptions` (`src/air/app.ts:72`); normalized with default `'builtin'` and an `AIR_E_PHYSICS_BACKEND` throw for any other value (`src/air/app-config.ts:45-46`). The choice lands on `Game.EVENT_PRE_SUBSYSTEM_INIT` (`src/air/bootstrap.ts:141-142`) and calls `selectPhysicsBackend` (`src/air/physics-backend.ts:41`), which re-registers the chosen wrapper through the official rule "the system will use the last backend registered before initialization" (`src/cocos/physics/framework/physics-selector.ts:100-107`, register at `:127-136`).
- Both 3D backends compile into the default bundle (`physics-builtin` and `physics-cannon` in `tools/build/build.cjs:41`): builtin registers five wrappers - RigidBody, BoxShape, SphereShape, CapsuleShape, PhysicsWorld (`src/cocos/physics/cocos/instantiate.ts:34-40`), cannon registers the full set (`src/cocos/physics/cannon/instantiate.ts:45`). Selection is therefore only a re-register, never a download.
- Zero-backend state: on a module graph with no physics feature the registry is empty and `selectPhysicsBackend` only warns, keeping the engine's tolerated `PHYSICS_NONE` state (`src/air/physics-backend.ts:46-52`; `PHYSICS_NONE` getter at `src/cocos/physics/framework/physics-system.ts:48`). A requested backend missing from a non-empty registry throws (`src/air/physics-backend.ts:54-56`), and selection after the world exists throws too (`:58-62`); `switchTo` afterwards is not the runtime path (`physics-selector.ts:145-164`).
- Error 9642: `PhysicsSystem.initDefaultMaterial` logs `errorID(9642)` and leaves the material empty when `builtinResMgr` has no `default-physics-material` (`src/cocos/physics/framework/physics-system.ts:223-230`; text at line 420 of `DebugInfos.json` under `src/`). Benign for builtin (`BuiltinShape.setMaterial` is an empty function, `docs/notes/physics-3d-notes.md:26`), fatal for cannon (`CannonShape.setMaterial` dereferences the missing material, `docs/notes/physics-3d-notes.md:390-399`). AIR installs an official-named `PhysicsMaterial` into `builtinResMgr` at module evaluation and at selection (`src/air/physics-backend.ts:74-85`), so both cases are covered on the `createAirApp` path.
- Builtin boundary, stated precisely: upstream calls it "efficient discrete collision detector, not a full physical simulator" (`src/cocos/physics/cocos/builtin-world.ts:50-55`). `setGravity` is empty (`:125-126`), `syncAfterEvents` only syncs scene to physics so no physics-to-scene write-back exists (`:198-200`), rigid-body and material setters are component bookkeeping, while `raycast`/`raycastClosest`/`lineStripCast` are real against the synced world shapes and `sweepBox`/`sweepSphere` always miss with `warnID(9640)` (`docs/notes/physics-3d-notes.md:90-111`). Under cannon every one of these inverts: free fall, velocity write-back, MeshCollider in the world (`docs/notes/physics-3d-notes.md:373-386`).
- The 3D framework surface: `PhysicsSystem` is a `System` singleton constructed at `DirectorEvent.INIT` (`src/cocos/physics/framework/physics-system.ts:875`, `:912`) - `PhysicsSystem.instance` (`:92`) is null until the app is ready; `step` at `:442`, `syncSceneToPhysics` at `:452`, `raycast` at `:511` (results in `raycastResults`, `:275`), `raycastClosest` at `:534` returning boolean into `raycastClosestResult` (`:267`). `RigidBody` (`src/cocos/physics/framework/components/rigid-body.ts:60`) and `Collider` (`src/cocos/physics/framework/components/colliders/collider.ts:46`) are ordinary components; trigger callbacks ride `collider.on('onTriggerEnter' | 'onTriggerStay' | 'onTriggerExit')` (`examples/physics-3d-basic/main.js:312-314`).
- Filtering is a bidirectional AND of each side's group against the other's mask (`src/cocos/physics/cocos/builtin-world.ts:183-186`); `Collider.collisionMask` defaults to `PhysicsGroup.DEFAULT` only, so setting only `setGroup` silently removes that body from every pair (`docs/notes/physics-3d-notes.md:56-63`).
- 2D runs the pure-JS box2d port by default: `PhysicsSystem2D` singleton (`src/cocos/physics-2d/framework/physics-system.ts:40`, `instance` at `:200`, `step` at `:345`, `autoSimulation` at `:120-125`), `RigidBody2D` (`src/cocos/physics-2d/framework/components/rigid-body-2d.ts:39`), `Collider2D` (`colliders/collider-2d.ts:39`) and `BoxCollider2D` (`colliders/box-collider-2d.ts:36`); the world implements the three queries (`src/cocos/physics-2d/box2d/physics-world.ts:173`, `:360`, `:385`).
- Everything above is reachable from the bundle's single export block (`build/cocosair.module.js`, currently :161574): `selectPhysicsBackend`, `physics`, `PhysicsSystem`, `RigidBody`, `Collider`, `PhysicsSystem2D`, `RigidBody2D`, `Collider2D`, `BoxCollider2D`, `PHYSICS_2D_PTM_RATIO`. The flat `selector` export is the 2D one - 3D backend identity must be read from the world constructor (`docs/notes/physics-3d-notes.md:38-52`).

## Common Mistakes

### [HIGH] Calling createAirApp({}) and expecting gravity or stacking

Wrong:
```js
const app = await createAirApp({ canvas: '#GameCanvas' });   // physics omitted
const body = node.addComponent(RigidBody);
body.type = ERigidBodyType.DYNAMIC;   // node floats forever: builtin has no integrator
```

Correct:
```js
const app = await createAirApp({ canvas: '#GameCanvas', physics: 'cannon' });
const body = node.addComponent(RigidBody);
body.type = ERigidBodyType.DYNAMIC;   // gravity, falling and stacking are cannon backend facts
```

The omitted option normalizes to `'builtin'` (`src/air/app-config.ts:45`), and builtin is a discrete collision detector, not a simulator (`src/cocos/physics/cocos/builtin-world.ts:50-55`); the sixty-step free-fall comparison is `docs/notes/physics-3d-notes.md:376`.

### [HIGH] Setting only the collision group and losing every pair

Wrong:
```js
crateCollider.setGroup(2);   // other colliders still mask 1 -> this body matches nothing
```

Correct:
```js
crateCollider.setGroup(2);
otherColliders.forEach((c) => c.setMask(0xffffffff));   // mask half must accept the new group
```

Each pair is skipped unless group AND mask passes in both directions (`src/cocos/physics/cocos/builtin-world.ts:183-186`), and `collisionMask` defaults to `PhysicsGroup.DEFAULT` (`docs/notes/physics-3d-notes.md:56-63`); the silent zero-trigger state was measured in all three browsers.

### [MEDIUM] Asking for a WASM backend that is not shipped

Wrong:
```js
const app = await createAirApp({ canvas: '#GameCanvas', physics: 'ammo' });
import { PhysicsSystem } from 'cocosair';   // then expecting physx or box2d-wasm too
```

Correct:
```js
const app = await createAirApp({ canvas: '#GameCanvas', physics: 'cannon' });   // the only two ids
```

`AirPhysicsBackend` is `'builtin' | 'cannon'` (`src/air/physics-backend.ts:21`) and anything else throws `AIR_E_PHYSICS_BACKEND` (`src/air/app-config.ts:46`); ammo/bullet, physx and box2d-wasm import Emscripten assets that exist neither in the upstream snapshot nor in `@cocos/box2d` (`docs/notes/physics-asset-sourcing.md:11-17`).

### [MEDIUM] Reading 3D backend identity from the flat selector export

Wrong:
```js
import { selector } from 'cocosair';
console.log(selector.id);   // 'box2d' - this is the 2D selector, the name is taken
```

Correct:
```js
console.log(PhysicsSystem.PHYSICS_BUILTIN, PhysicsSystem.instance.physicsWorld.constructor.name);
// true, 'BuiltInWorld' - runtime identity, not the flat export
```

Both namespaces export a member named `selector` and the aggregate flattens to the 2D one (`docs/notes/physics-3d-notes.md:40-45`); the singleton also does not exist until the app resolves (`src/cocos/physics/framework/physics-system.ts:912`).

## References

- `references/backend-selection.md` - the selector registry and event ordering, default normalization, zero-backend warn versus PHYSICS_NONE, the 9642 split and the built-in material registration, and why WASM backends are absent.
- `references/3d-contracts.md` - PhysicsSystem singleton timing, mount and query API, filter semantics, the builtin query-only boundary item by item, and what cannon inverts.
- `references/2d-box2d.md` - PhysicsSystem2D, deterministic stepping, rigid-body and collider components, shape set, joints, and the raycast/testPoint/testAABB queries.

## Canonical docs

- `docs/manual/physics-2d-and-3d.md` - open for the backend comparison table, the four event families and the five runnable physics examples.
- `docs/notes/physics-3d-notes.md` - open for the browser-measured builtin boundary, filter semantics, lazy sync and the cannon variant reversal.
- `docs/reference/api-stability.md` - open for which physics APIs are Stable versus Candidate and why (`docs/reference/api-stability.md:40-52`).
