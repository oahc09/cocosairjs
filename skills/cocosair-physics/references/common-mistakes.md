Derived from the cocosair-physics skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
