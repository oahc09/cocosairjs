# Mutation guard integration proposal

Status: source-only primitive qualified, engine write-site integration **not implemented or qualified**. This proposal requires lead scope approval before any existing engine/AIR source is changed. The standalone 56-control receipt does not prove that Component, Node, PhysicsMaterial, Collider or PhysicsSystem currently rejects a mutation.

## 1. Primitive and ownership

The new `src/cocos/core/data/mutation-guard.ts` has no runtime imports. It exposes only `registerMutationGuard`, `assertMutationAllowed`, and `assertMutationBatchAllowed`; its lease has only a frozen `dispose` closure. The owner supplies copied object identities and copied nonempty string rejection metadata, not an executable policy callback. Multiple leases on one object are independent; releasing world A never authorizes a write still prohibited by world B.

Registration validates and copies the complete identity array and rejection before installing any membership. During input copying, same-registry register/release/assert admission rejects and latches failure even if an accessor catches the rejection. Arbitrary JavaScript side effects performed by an input accessor are not rolled back. Batch assertion copies/freezes all identities before membership checks and performs no user operation. No active guard means the existing behavior returns immediately, including without reading a batch input getter. A real `dispose` function can be shared by possession; this shares only its original lease, not a forged owner or authority over other leases.

The future AIR owner should hold all leases privately, register before exposing a transaction to callbacks, and dispose in `finally`. Expected-pose writeback still uses the existing exact-operation Node transform registry. Do not turn the new registry into a global allow flag, a native `world->locked` bit, or a general cleanup bypass. Faulted application cleanup must release only its own leases before its already-defined terminal teardown. Actual native disable/destroy/zero settlement remains separate from a JavaScript lease release.

## 2. Orphan component creation is a distinct category hole

A lease over existing bodies, components, Nodes and ancestors cannot cover:

`const orphan = new Node(); orphan.addComponent(RigidBody);`

The orphan has no known scene/ancestor/body ownership yet. In the actual `node.ts` implementation, `addComponent` reads `_requireComponent` at line 1107 and may recursively add dependencies at lines 1114/1120; it calls the chosen constructor at 1133 and pushes into `_components` at 1135. `activateComp` and physics adapter initialization happen only later, at 1144. Refusing in `initialize` is too late to claim no constructor effects or unchanged component arrays. Guarding only scene roots still misses the orphan.

**Proposed explicit temporary category scope, pending lead freeze:** while at least one Box3D owner is in collection, final validation, command commit or event dispatch, reject **all calls to the original `Node.addComponent` in that Cocos realm**, including orphan Nodes, existing unrelated Nodes, built-in components and user-defined components. Outside those bounded Box3D transactions, no category lease exists and the other backends retain their original behavior. This means adding a 2D/UI component from inside a Box3D callback is also refused; that compatibility restriction must be explicit, not presented as physics-class-only filtering.

The smallest key needs no global current-world lookup and no new Boolean bypass: use the stable `Node.prototype` object as a category identity in the private owner lease. At the very beginning of `Node.addComponent`, before class-name resolution, `_requireComponent`, dependency recursion or constructor execution, call `assertMutationAllowed(Node.prototype, 'Node.addComponent')`. Every active owner registers its own membership on that same identity, so one owner's release cannot override another. The prototype is a key, not modified and not a release capability.

A less broad class filter is not currently provable at the same early boundary. A user-defined constructor, proxy, `_requireComponent` accessor, dependency graph or subclass may perform arbitrary work or create physics components. Inspecting those to decide admission may itself execute the work that must be prevented. A pre-certified safe-class allowlist is a separate larger contract and is not proposed here. A scene-only fence is insufficient. Direct arbitrary JavaScript construction, user overrides of engine methods and private field/array writes are not sandboxed by this proposal.

## 3. Exact object-scoped early write sites

No changes below have been applied.

- `Component.enabled`, `component.ts:132`: assert before the equality check and `_enabled` assignment. The scheduler and `onDisable` run after the cache changes at 134, so an adapter rejection cannot undo it.
- `Component.destroy`, `component.ts:379`: assert before `super.destroy()` at 393. `CCObject.destroy`, `core/data/object.ts:308-309`, sets `ToDestroy` and appends to the deferred queue first. Do not repair this by clearing flags after an adapter throw.
- `PhysicsMaterial` setters at 68/87/106/126: assert before comparisons/coercion and coefficient writes. `setValues:198` needs one precheck before all four assignments. `destroy:177` must check before super. Register each shared/default material for every active Box3D owner that uses it; check once before any update event reaches any listener.
- `Collider.material` getter at 109: its clone branch must check before `off`, asset clone, `_material`, listener registration and `_isSharedMaterial`. Returning an already unshared material without mutation can remain a read. The setter's no-`_shape` cache path at 138 also requires a defined ownership/category policy; do not infer it is covered by the native-first branch.
- `PhysicsSystem.enable:106`, `maxSubSteps:143`, `fixedTimeStep:157`, `sleepThreshold:193`, `autoSimulation:207`: assert at entry before cache assignment. The `enable` transition must also be coordinated with pending-command discard/continuous producer disable before claiming the frozen pause contract. The guard alone does not implement that transition.
- `PhysicsSystem.resetConfiguration:409` must assert before any configuration getter/coercion/cache write, not at its late `setGravity`/`setAllowSleep` calls. `resetAccumulator:451` needs a precheck before changing the existing single accumulator. Existing default material, gravity/sleep and debug adapter paths still need the owner transaction state enforced; native-first cache order alone is not a complete fence.
- `Node.active:196` must check affected body/component and descendant ownership before `_active` changes. `Node.destroy:1374` checks before super; it cannot rely on the subsequent `active=false`. Registering body Nodes and their ancestors makes direct ancestor lifecycle changes discoverable, but ancestor membership must be refreshed/invalidated through the separately controlled reparent/lifetime paths.
- `Node.destroyAllChildren:1391` must copy the complete child set and gather affected owners before its first `children[i].destroy()`. Batch assertion is a precheck only, not a promise of atomic rollback across arbitrary later user lifecycle events. A protected later child must prevent any earlier child being scheduled for destruction.
- `Node.addComponent:1069` needs the explicit category scope in section 2, not only the object lease used for other operations. `removeComponent` routes to actual component destroy, whose early fence must remain active. Internal/raw `_removeComponent`, component-array aliases and arbitrary direct field edits require separately named boundaries, not blanket coverage claims.

## 4. Required actual-engine controls before activation

The future integration suite must import the actual unchanged-or-proposed engine entry points, not copied setter functions. Register explicit fixture leases, perform the public operations, and observe the earliest state before/after rejection:

1. Component `_enabled`, scheduler enable/disable callbacks, `ToDestroy`, and deferred-destroy membership remain unchanged after refusal. Include inactive and active components and same-value writes.
2. Shared material coefficients, update callback counts, asset IDs/all-material list and collider old/new listener bindings remain unchanged. Two independent owner leases sharing one material must both be respected; releasing one must not authorize the other.
3. PhysicsSystem settings, gravity/local aliases, matrix entries and accumulator must not change on fenced entry refusal. Alias writes that do not use an entry remain separately detected/unintercepted, not synchronous transaction successes.
4. A batch with an unguarded first child and a protected later child refuses before either `super.destroy`. Assert child arrays, active flags and scheduled destruction membership. Include nested descendants and shared ancestors.
5. `Node.addComponent` on an existing body Node, a sibling with no body, a different scene and an orphan must refuse before custom constructor count, `_requireComponent` getter count, recursive dependency creation, component-array push or adapter calls, under the explicitly frozen realm/category restriction. With no category lease, original backend behavior must remain unchanged.
6. Guard releases in success, callback failure, validation refusal, committed/unknown failure and actual application close must restore only the appropriate owners. Ordinary unregistering is not evidence of native resource cleanup.

These are prospective controls. The 56 standalone guard controls exercise copy/admission/ownership logic only; they provide no real engine early-write, actual PhysicsSystem transaction, WASM, browser, T11, C11 or C36 qualification.
