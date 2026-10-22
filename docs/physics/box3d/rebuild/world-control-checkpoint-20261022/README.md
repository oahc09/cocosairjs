# T09 AIR world control checkpoint, 2026-10-22

## Scope and status

This is an internal source checkpoint, not a completed T09 or native physics acceptance. The test executes the actual AIR world, registration, debug, unsupported-component, and preparation-ledger sources with an explicitly mocked native binding and selector. It does not instantiate the real `PhysicsSystem`, load WASM, produce physics trajectories, render debug geometry, or certify 2D/3D coexistence.

The five new AIR TypeScript files have the full project MIT header. No feature registration, preparation, upstream engine, native binding, schema, patch, vendor, or runtime-build file was changed for this checkpoint. Public Box3D selection still rejects before fetching because no world adapter is installed. The new factory rejects an incomplete bridge before selector mutation or world allocation. Method presence and mock success are necessary control checks, not native qualification.

## Implemented internal control behavior

- Explicit registration factory; selecting only installs a lease-bound constructor. Construction immediately owns the real binding-created world in the preparation ledger before fallible readback. Cleanup orders world before module, preserves the module after failed world release, and permits independent backend cleanup.
- ECMAScript-private binding and world token. `impl` is a frozen diagnostic descriptor, not a writable raw pointer or token.
- Exactly one binding step per accepted call, with immutable prepared solver subdivisions. No RAF, timer, frame accumulator, or Cannon manual-accumulator argument support. Native diagnostics and immutable snapshots are checked before a successful return. Any step-path failure latches the world fault and prevents replay; failed diagnostics explicitly retain unknown native outcome rather than claiming no step occurred.
- Native gravity/sleep setters plus readback; copied debug snapshots only through the required native collector; copied native object counters. There is no fake debug renderer, and diagnostics explicitly report `debugPresented: false`.
- Friction/restitution default updates for internally registered inherited shapes, with full token preflight and rollback; explicit per-shape materials stay unchanged. Finite nonnegative values are accepted, including restitution above one; nonzero rolling/spinning friction is rejected. Future shape registration uses the cached accepted default. These hooks do not create shapes and do not implement T10 components.
- All 16 unimplemented selector component constructors and all eight `IPhysicsWorld` query methods throw explicitly. Empty scene synchronization only records lifecycle calls; no Cocos component/event functionality is claimed.

## Verification

The immutable receipt records the final format check, 30 mock-native control tests, and focused `tsc --noEmit` against the actual engine interfaces and existing declaration dependencies. The focused config inherits the project's ES6 target and ES2015/ES2017/DOM libraries; it does not add permissive replacement engine declarations or raise the runtime target. Raw stdout/stderr and command exits are retained beside the receipt. Source hashes before and after collection must agree.

Development-only preflights preceded this retained final run: the nested config initially resolved inherited relative `types` paths incorrectly; those paths were corrected to the existing root declarations, and the existing external-module declaration file was explicitly included. An intermediate ES2022 config passed but was removed to retain the project target. One subsequent check found a newly added `BigInt` constructor incompatible with the original library set; the nonnegative counter comparison was rewritten without that constructor. Those earlier preflight results are not the final PASS evidence.

Commands, run from the repository root:

```sh
node_modules/.bin/prettier --ignore-path /dev/null --check src/air/physics/box3d/world.ts src/air/physics/box3d/world-binding.ts src/air/physics/box3d/registration.ts src/air/physics/box3d/debug.ts src/air/physics/box3d/unsupported.ts tools/verify/box3d/world-control.test.cjs tools/verify/box3d/tsconfig.world-control.json
node --test tools/verify/box3d/world-control.test.cjs
node_modules/.bin/tsc -p tools/verify/box3d/tsconfig.world-control.json --pretty false
```

## Required next integration, not applied here

1. Qualify actual new gravity/sleep/debug/material/step-diagnostic bridge behavior and matching WASM identity. `world-binding.ts` is the strict proposed TypeScript contract. The debug `line`/`bounds` variants remain an AIR candidate pending review of actual native callbacks; accepting zero primitives merely because the requested world is empty is not proof of native support. Preserve current ABI-1 contact strides and keep the completed-step counter distinct from C21 contact-geometry generation epochs.
2. Only then add three imports to `feature.ts`: the existing engine `selector`, `createBox3DWorldAdapter`, and `registerBox3DWorldAdapter`, followed by `registerBox3DWorldAdapter(createBox3DWorldAdapter(selector))`. This constructs no world and fetches no assets at import. The existing `prepare.ts` adapter hook is sufficient for the first integration; no change is proposed there.
3. Review the following minimal Box3D-only upstream setter ordering changes. These are suggestions, not committed upstream edits. Preserve every other backend's existing behavior and record any accepted upstream deviation in the required mapping/documentation.

```ts
// At the start of allowSleep(v), before the existing _allowSleep assignment:
if (selector.id === 'box3d' && this.physicsWorld) {
    this.physicsWorld.setAllowSleep(v);
    this._allowSleep = v;
    return;
}

// At the start of gravity(gravity), before the existing _gravity.set:
if (selector.id === 'box3d' && this.physicsWorld) {
    this.physicsWorld.setGravity(gravity);
    this._gravity.set(gravity);
    return;
}

// At the start of setDefaultPhysicsMaterial(material), before _material assignment:
if (selector.id === 'box3d') {
    this.physicsWorld.setDefaultMaterial(material);
    this._material = material;
    this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    return;
}
```

Those changes prevent ordinary failed assignments from first committing public cached state, but are not full public rollback qualification: `gravity` exposes its mutable cached vector, a `PhysicsMaterial` can already be mutated before its update event, and `resetConfiguration` updates several fields directly. Aliased-vector mutation, material update/listener replacement, and reset validation need their own narrowly reviewed policy and real-engine tests. This checkpoint claims only the internal adapter's copied accepted state and native rollback behavior.

4. Use a new internal real-runtime fixture with a newly fingerprinted WASM lease and actual `game.init(HEADLESS)`/`PhysicsSystem`. Validate fixed-tick partitioning and max-substep limits, disabled/automatic/manual modes, constructor failure and teardown, each supported native setter/readback, explicit unsupported components/queries, debug collection versus actual presentation, and real 2D coexistence. The 2D loop uses a different boundary comparison from the 3D loop; do not assert equal per-frame tick counts without accounting for that existing behavior. The 30 mock cases below are not substitutes for this acceptance.
