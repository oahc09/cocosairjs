# Collider listener entry candidate, not integrated

Only the isolated candidate source differs. Main products, Git, remote state and existing evidence are untouched by this work.

## Intended contract

For a Collider identity carrying a mutation lease, reject at the named listener mutation entry before callback-table access, listener allocation/removal, `_needTriggerEvent` / `_needCollisionEvent` writes, `_offCallback`, `isValid` inspection or shape `updateEventListener`. Catching the rejection does not release the lease or permit a second operation. With no applicable lease, preserve original behavior.

## Audited paths

- `on`, including its `once` flag: local early guard before `super.on`.
- `once`: local early guard before Eventify delegates to `this.on`; its original two cache/delegate updates remain unchanged when unguarded.
- `off`, with a callback or event-only: local early guard before `super.off`; the event-only inherited path calls `this.removeAll`.
- `removeAll`, event and target: local early guard before any inherited mutation.
- Inherited `targetOff`, target and event: real Eventify implementation invokes `this.removeAll`, so it is covered without an unnecessary override.
- Runtime-only inherited `clear`: not declared by IEventified, but mixed into Eventify. A Collider-local descriptor-preserving wrapper captures the original inherited function and guards it before delegation. No Eventify change or declared public API expansion. Its historical no-lease cache behavior is intentionally unchanged.

## Deliberate limits

`emit` is not converted into a blocked event dispatcher. An inherited `emit` may invoke permitted listeners, and auto-removal of once or invalid-target listeners dynamically reaches guarded `off`. Raw mutation of `_callbackTable`, direct prototype-method borrowing (`CallbacksInvoker.prototype.clear.call(collider)`), private `_registerOffCallback` replacement, user subclass overrides, and prototype tampering are not sandboxed. These are not claims of a closed arbitrary-JavaScript mutation capability.

This candidate does not add real physics contact events, T15, unified consumer activation, persistent grants or shared PhysicsMaterial transaction atomicity. The runtime-only `clear` wrapper preserves the original descriptor and cache semantics, including no-lease stale cache behavior.

## Evidence layers

`pure-before-a` and `pure-source-a` execute complete exact Collider, Eventify, CallbacksInvoker and mutation-guard source bytes. Explicit infrastructure doubles replace Component, decorators, Vec3, pools, utility operations and object validity. The original source is RED (21/21), candidate GREEN (21/21), with 21 ordinary no-lease state traces identical. This is feasibility evidence only, not actual-engine/owner/WASM proof.

`actual-engine.test.cjs` is a separate real-engine-source fixture. `overlay-resolver.cjs` maps selected original imports to immutable before snapshots and maps only Collider to the candidate in the source variant. Other dependencies are read from the engine tree and fingerprinted before/after per run. The fixture constructs actual Node, Collider, PhysicsSystem and Box3DWorldCommandOwner instances, with explicit mock world identity and counted shape effects. Owner scope control reaches actual owner `writeback`, `dispatch`, `material` and `control` phases, but this does not establish a complete actual World or native transaction.

The before snapshot of world-command-owner.ts predates the parent's latest B2 failure-path repair. That difference is kept explicit; fresh integrated-main verification is required after any eventual adoption.

## Portability

Set `BOX3D_ENGINE_ROOT` to an engine checkout containing the dependencies. The candidate directory may remain outside the checkout. Run `python3 run-actual.py before <new-output-dir>` and then `python3 run-actual.py source <new-output-dir>` only in an allocated serial validation window. Outputs must not already exist and must remain outside the engine checkout. The runner never replaces a main product or writes an existing raw result.
