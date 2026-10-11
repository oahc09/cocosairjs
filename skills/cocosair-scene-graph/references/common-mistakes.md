Derived from the cocosair-scene-graph skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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

AIR ships the `Prefab`/`instantiate`/`resources` classes but no Creator editor to serialize `.scene`/`.prefab` assets and no project `resources` bundle for Creator-style URLs to hit, so a Creator-parity load fails on the missing asset instead of falling back; reuse built subtrees through `NodePool` ([node-ops.md](node-ops.md)), and a string component name in `addComponent` resolves only when that class was registered by name.

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

`addLayer` writes both `Layers.Enum` and `Layers.BitMask` and rejects bits outside 0-19; hand-setting reserved bits silently breaks the profiling and UI culling channels, and a single-bit replacement mask leaves the camera matching only that bit, so every other node goes unseen. IGNORE_RAYCAST is a ray-picking convention, not a hide-from-camera bit (the default camera mask still includes bit 20, and physics raycast masks use `PhysicsGroup` bits rather than `node.layer`): [layers.md](layers.md).

### [MEDIUM] Reading world scale as the value you set

```ts
parent.setScale(new Vec3(2, 2, 2));
child.setScale(new Vec3(1, 1, 1));
console.log(child.scale);                // (1,1,1) local, exactly what you set
console.log(child.worldScale);           // (2,2,2) = parent world scale * local scale, not (1,1,1)
```

`setScale` writes LOCAL scale; `worldScale` multiplies up the parent chain (setting world scale back-solves local), so a child under a scaled or non-uniformly scaled parent renders and lights differently than its local value suggests. Arithmetic rows: [node-ops.md](node-ops.md).
