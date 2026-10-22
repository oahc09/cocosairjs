# Shared PhysicsMaterial: minimal real transaction plan

Status: **DESIGN-ONLY FREEZE CANDIDATE, NOT IMPLEMENTED, NOT RUN**. This is a concrete recommended decision set for the lead to adopt, not a claim that a new product contract was already approved. Analysis uses actual repository sources identified by `source-manifest.json`, with observed HEAD `9df645b4a84e73c86ffd460b59cbd6e2ab732cbb`. No product files, Git index, native inputs, existing evidence or external services were changed. No build, install or test ran.

The immediate System pause seam is present. Producers still report `NOT_INTEGRATED`; staged commands and unified transactions remain false. The 2,128 formal cells remain NOT_RUN; none of the nine Gates is passed by this document.

## 1. Findings that determine the design

1. Asset values currently commit **before** public synchronous delivery. PhysicsMaterial scalar setters write one private coefficient then emit (`physics-material.ts:69–135`); setValues writes all four then emits (`204–212`). Thus a later subscriber's validation failure already leaves the shared JS asset changed. Temporary mutation guards do not provide idle-time all-owner preflight.
2. Actual identity observation is already separate from coefficients. Collider observed set/clone/initialize commits at its actual cache-and-subscription boundary (`collider.ts:120–175,500–519`). Owner actual identity updates occur at `world-command-owner.ts:602–655`. Preserve this distinction; never discover ownership with the cloning `Collider.material` getter or material id.
3. Propagation still travels through public listeners: Collider `_updateMaterial` calls ordinary shape.setMaterial (`581–583`); System `_updateMaterial` calls ordinary world.setDefaultMaterial (`physics-system.ts:974–975`). A new all-owner barrier would make these ordinary entry points reject. They cannot be reused under a phase-to-idle bypass.
4. PhysicsMaterial inherits public event mutation from Asset/Eventify. off, removeAll, targetOff and clear can remove the internal physics listeners (`callbacks-invoker.ts:260–316,379–388`; `eventify.ts:163–169`). off invokes `_offCallback`; emit invokes public off for once and invalid targets (`329–364`). Blanket guarding EventTarget.off breaks legitimate public once removal and is not a small solution.
5. Native preflight is currently per invocation, not across an asset's consumers. The default kernel enumerates/read-validates inherited shapes before its own loop (`world.ts:304–331`); explicit shape kernel validates one shape (`368–390`). A second owner may reject after the first has written. The required new plan must split preparation from application across the full roster, not merely put a for-loop around existing setters.
6. setShapeMaterial uses `exclusive`, not reviewed `mutate` (`facade.mjs:1291–1304`). Native C validates ownership and both values before two setters (`world_bridge.c:188–203`), but the facade does not expose a trustworthy immutable mutation phase for this entry. Unknown exceptions remain unknown. A successful setter followed by a failing getter is not a rejected/no-effect operation.
7. Multi-owner registry support is not production multi-world support. `PhysicsSystem.physicsWorld` returns the global selector (`physics-system.ts:341–343`); owner `#begin` requires this System and world to be the current singleton binding (`world-command-owner.ts:168–175,699–720`). A foreign/stale live owner must cause complete preflight refusal, not be skipped. Two mock owners do not establish two simultaneous Cocos worlds.
8. World close unregisters owner observation (`world-command-owner.ts:813–867`), but System has no corresponding default-material public listener teardown. A retained System callback can later target whichever world selector currently holds. New private propagation must have an explicit owner-generation lease release, not rely on System destruction or weak collection.

## 2. Recommended decisions to freeze

### D1. Use a private physical propagation lane, not protected public callback-table surgery

Introduce a backend-neutral, non-exported `physics-material-values-transaction.ts` beside the current typed identity transaction. Reuse the B0 observer mechanics where possible, but do not put asset multi-owner entries into `PhysicsMaterialTransactionRegistry`: its current `#entries` intentionally permits one delegate per component/System target (`physics-material-transaction.ts:209–214`).

One private asset registry owns one record per **asset object + world-owner generation**, with independent binding records for System-default and each Collider. One world receives one scope even when the asset is used by two colliders and as default. Keep disabled colliders in the roster. Refcounts are by actual binding identity, never material id, callback equality or number of public listeners.

Observed Box3D Collider/System sites replace their physical on/off subscriptions with exact private lease operations. Public `EVENT_UPDATE` stays a synchronous user/legacy notification. No Box3D native update may remain registered in the public callback table, or updates will occur twice. Do not modify CallbacksInvoker/Eventify, hide protected callbacks among user callbacks, use a global dispatch bypass, or depend on overridable hasEventListener to establish ownership.

Intentional observed-path compatibility changes requiring lead adoption:

- Physical Box3D propagation completes before the ordinary public EVENT_UPDATE notification, regardless of user registration order.
- Public off/removeAll/targetOff/clear can remove public notifications but cannot remove physical propagation.
- Manual/recursive public emit does not request any Box3D native refresh. Only the five original coefficient-writing entry points initiate the private lane. An emit override can still suppress/throw public notification, but cannot suppress the already executed private propagation.
- Once and invalid-target public auto-off retain their original mechanics. Public event-list edits during notification are ordinary user event semantics, not a physical lease change.

Unobserved materials and other backend paths retain original comparison, assignment and event order. Do not normalize their inputs or force them through Box3D delegates.

### D2. Retain existing numeric semantics, with strict owned admission

Canonical copied tuple order is **[friction, restitution, rollingFriction, spinningFriction]**, matching existing identity candidates. `setValues` public argument order is **(friction, rollingFriction, spinningFriction, restitution)**; explicitly reorder it. Read actual private fields, not overridden public getters, for the asset value transaction's before/actual snapshots.

For an owned asset, reject non-number/non-finite/float32-overflow inputs, negative friction/restitution and nonzero rolling/spinning before any cache or native write. Use the existing Box3D coefficient constraints; do not invent a restitution <= 1 runtime restriction from editor range metadata. Store the user's accepted JS numbers in PhysicsMaterial; native/adapters use validated float32 copies.

Scalar setters retain `math.equals` change detection; setValues retains exact `!==` detection. Earliest mutation admission runs even on same-value writes. A scalar no-change operation performs no cache write, event or native apply. setValues retains its original unconditional four private assignments even when its exact-change test is false, but performs no event or native apply in that case. Neither case bypasses an active phase or invalid-owner refusal. Never use numeric coercion of caller objects to decide a protected no-op.

### D3. Destroying a still-owned asset is refused, not converted into detach/default replacement

A live, provisional or unresolved native ownership lease makes PhysicsMaterial.destroy reject before `super.destroy`, ToDestroy flags, deferred-destroy queue and allMaterials removal. Caller must first replace/release actual material bindings. No automatic destruction of colliders, native reset, listener purge or default substitution is inferred.

Reject adopting an already Destroyed/ToDestroy asset at actual component/default admission, including clone acceptance. Once all physical ownership is known released, run the original destroy path unchanged. This is a narrow intentional observed-path restriction. Arbitrary calls to deprecated engine-private `_destruct`/`_destroyImmediate`, private field corruption or monkeypatching are not made sandbox-safe by this seam; if those are part of the promised supported attack surface, they need a separate explicit guard increment.

### D4. Native failure is fail-stop with truthful facts, not rollback

The minimal transaction does not change native C, ABI, frozen N4 inputs or the material facade. Each prepared native operation records `not-entered`, `entered-unknown`, `returned`, then `readback-verified` as separate facts. Normal return from the exact native setShapeMaterial call establishes that setter committed; successful readback is a separate verification fact. In contrast, a high-level delegate return for an inactive collider or empty inherited set does not establish any native write. A throwing setShapeMaterial remains entered-unknown unless a later separately reviewed binding phase protocol establishes more. Do not attach invented mutationOutcome to errors, infer phase from error codes, or retry/reverse a failed setter.

First failure after any JS/native effect stops further mutation, faults **all original participating owners**, preserves actual coefficients and completed per-owner facts, then independently disposes scopes. Do not apply the remaining worlds to fabricate consistency. A whole-asset/cross-world atomic rollback is expressly not promised.

## 3. Exact transaction and cache order

### Registry/identity preparation

- A private binding lease carries asset identity, owner identity/generation, binding identity, role, initialized/liveness facts and copied trusted preparation/application methods. No native handle or release authority escapes in diagnostics, material events, Component fields or impl.
- Actual Collider/System identity transactions prepare replacement lease metadata before their native delegate. On successful actual cache/subscription commit they publish the matching lease and retire the old one. Clone uses the returned clone, with no native reapplication just for the identity change. Null Collider bindings inherit default and own no explicit-asset lease.
- Initial Collider registration is provisional until real Collider.onLoad completes; the asset remains protected while provisional. A candidate not actually accepted is not an active propagation recipient. On failure retain old/candidate/actual identities as cleanup/blocker records rather than claiming all are committed subscriptions.
- The current B0 forbids register/release during observer callbacks. Consequently do not call a new registry's register/dispose opportunistically from `commitActual`. Prepare an exact one-use membership transition outside publication, then commit only trusted prevalidated map/refcount metadata. Never weaken B0's public reentry guard to enable this.

### Five original PhysicsMaterial entry points

The same internal helper is entered by friction, restitution, rollingFriction, spinningFriction setters and setValues.

1. **Admission:** keep earliest mutation guard before comparisons/coercion/candidate reads. The private registry returns an immediate no-owner result without extra coefficient reads; the original source path then runs unchanged. When owned, create the target ticket and freeze the full owner/binding generations. No new allocation/public callback/native read occurs before owner barriers open.
2. **Open all worlds:** call one private material-scope acquisition per distinct owner, using already-held component/Node/asset identities. Validate actual owner phase and current System/world binding. Record entered opens so partial scope acquisition is always cleaned. Paused-but-ready idle owners can configure materials; neither enable nor autoSimulation is changed or resumed.
3. **Copy:** under all barriers, capture before and proposed full tuple once from actual private caches plus arguments. Perform strict validation and original change detection. Verify membership/generation after every potentially user-controlled boundary. Reject protected registry/replacement reentry even if its getter catches the inner error.
4. **Prepare all:** build every owner's immutable plan without JS configuration/native mutation. Validate initialized/admitted consumers, current shape membership and liveness; read native material for **every** affected shape before any setter. Preallocate copied adapter geometry/default cache records, exact authority objects and deterministic application order. Default affects only inherited shapes; explicit asset bindings affect their explicit shapes; disabled explicit colliders receive new geometry caches but no shape write. Deduplicate exact native shape identity across the world plan, or reject inconsistent double ownership. Unsupported/stale/nonparticipating owners fail here. Preparation release does not consume commands or target grants.
5. **Cache write:** only now execute the original actual `_friction/_rollingFriction/_spinningFriction/_restitution` assignments in the original method order. Record cache-written immediately after each real write, with a full actual read if later work fails. No identity change is inferred. No-change branch performs no native call or public emit.
6. **Private native/application phase:** invoke only each prepared exact-operation plan, never normal `shape.setMaterial`, world.setDefaultMaterial, `_updateMaterial`, or public EVENT_UPDATE as the physical driver. Consume authority before any mutation; match owner generation, asset, transaction sequence, adapter/shape list, copied tuple and operation. Keep owner in material phase throughout. Per native shape: entered → setter return → readback verification. Commit the corresponding prepared world/default, shared-body geometry, shape-adapter `#material/#geometry` caches only after their required native success, or directly for a no-native inactive consumer. Keep native facts separate from these JS cache writes. If a later cache write throws, preserve earlier committed facts.
7. **Public notification:** after all internal applications succeed, call the original public `this.emit(EVENT_UPDATE)` once under all original owner barriers and record entry/return. No remaining Box3D internal physics listener runs. User listeners may read actual values and committed native state if the existing committed-read policy allows it. Protected physics mutations, stepping, identity changes, destruction and lease changes still reject. Manual/recursive emits can invoke public listeners but cannot obtain another native plan/authority. A public listener throwing faults all participants and leaves the actual committed values visible.
8. **Commit/finally:** commit actual private tuple and per-binding facts; release every temporary scope independently. A post-publication observer/cleanup exception is not a preflight refusal. Preserve the original thrown value including undefined/null/0; later fault/report/disposal errors are secondary. Exact capabilities are single-use and receiver/context-bound; disposal never unregisters another owner's persistent lease.

This is an admission transaction plus truthful partial-commit handling. Cache-before-delivery matches the original material value behavior; it is not a promise of global native atomicity.

### Required AIR decomposition

- `world.ts:304–331` becomes a read-only prepared default plan plus a trusted apply method. Calling today's whole kernel sequentially per world is insufficient.
- `world.ts:368–390` gains the corresponding prepared explicit-shape plan. Collect/read-validate every shape across all plans before the first write.
- `shared-body.ts:648–667` and `box-sphere-shape.ts:91–95,151–158` need prepared cache replacements and exact value-transaction application capability. They must not pretend that a coefficient update commits Collider asset identity.
- `world-command-owner.ts` gains one asset-owner lease set and prepared batch protocol, distinct from current one-target material identity authority. Current private apply closures are not a safe global batch registry merely because they exist.

## 4. Multi-world and mixed-backend boundary

All-owner admission means every registered participant is checked before effect. It does **not** authorize relaxing `assertSystemBinding` to make a two-world test pass. With current Cocos singleton architecture, the correct actual-source test is stale/foreign second owner → refusal → zero cache/native writes. Positive same-world tests cover default + two explicit colliders + inactive collider; true simultaneous multi-world execution remains blocked on a separately reviewed ownership model.

A Box3D-only private roster cannot prove that the asset has no engine-owned builtin/Cannon subscribers. Public event tables are not an authoritative substitute. To claim all-physical-owner admission, introduce a small neutral **physical-binding ledger** at actual Collider/System binding sites, including unchanged legacy branches: store actual cache identity/lifetime, with no coefficient reads and no native delegate. Nonparticipating live backend entries are blocker-only. An owned-Box3D coefficient change encountering one rejects before cache/native mutation. Do not silently omit it, call its public listener as if preflighted, or claim rollback for that backend.

This ledger must be prepared at acquisition/replacement, committed from actual private fields and removed on verified binding teardown; public event removal does not remove physical-binding facts. No-hot-swap assumption must be explicit: installing the code into a fresh runtime can establish complete records; silently enabling observation midway through an existing world cannot. If full legacy binding coverage is not included, label the smaller checkpoint **Box3D-roster-only** and keep shared-all-owner/C36 activation blocked. This is the minimum honest fallback, not a completed all-world transaction.

## 5. Subscription and teardown contract

- Change observed Collider set/clone/onLoad and System setDefaultPhysicsMaterial at their current listener-operation locations to prepared private lease operations. Complete actual-cache notification only after the required lease operation. Preserve all unobserved branches. A public listener exception is no longer misreported as internal subscription setup success/failure.
- Collider onDestroy captures its existing generation-bound cleanup reporter before adapter unregister. Independently attempt physics lease retirement, any retained legacy public listener cleanup, event-state cleanup, adapter destruction and bounds cleanup. Retain failure stages and actual unresolved records. Do not delete binding metadata merely because public off returned or because adapter cleanup was entered.
- System default has no destruction callback. The world owner explicitly retires its exact default lease in `closeAfterWorldTeardown`, including constructor/failed-close paths. A stale System callback must not call a new selector world. An observed fresh runtime never installs that callback; any deliberate live migration must remove/verify known old callbacks under separate migration authority, not guess they are absent.
- Successful native world teardown permits releasing its execution leases and physical-binding records. Unknown native teardown immediately revokes execution authority but preserves a non-executable blocker/tombstone and the affected asset references, plus unresolved native ownership. It does not silently make the asset safe to mutate through another world. No automatic retry of an uncertain native destroy.
- Releasing one collider/world never removes another's asset lease. No weak-map/GC-based correctness claim; owner-held enumerable lease records support deterministic release. Refcounts/generations/capacity are checked before effect. Pending cleanup errors remain inspectable after unregister; absence of executable subscriptions is not proof of zero native resources.

## 6. Reentrancy and failure distinctions

- Copy/prepare/registry/authority reentry is latched by the private transaction even if a user getter/delegate catches the nested rejection. The outer transaction cannot later commit as clean.
- Existing mutation-guard rejection of an unrelated config/step call from a public listener does not automatically latch the material operation: current mutation guard has no executable policy callback. If the listener catches that rejection and otherwise returns, the material operation may succeed, with the forbidden mutation demonstrably absent. Requiring *every caught guard rejection anywhere* to abort the outer material transaction is a separate generic-guard change and is not smuggled into this minimum.
- Invalid candidate, foreign owner or preparation failure before cache/native effects: release scopes, unchanged accepted values and native state. Partial guard acquisition cleanup failure may fault; never claim clean zero leases without actual evidence.
- Cache written, first setter not entered: actual JS values are committed, native unchanged only to the extent directly observed. Fault all affected owners.
- Setter throws: that entry is unknown, prior verified entries remain committed, later entries not entered. Fault all affected owners; no replay/reverse.
- Setter returned, readback/cache/public callback/owner commit throws: retain setter completion and any verification, preserve actual JS caches, fault all affected owners.
- Cleanup throws after a successful change: the public/native change remains committed; record primary cleanup error and unresolved scope facts, fault affected owner. Earlier business failure wins over cleanup errors even when falsy.

## 7. Small executable delivery stages

| Stage | Narrow work | Exit evidence and stop condition |
| --- | --- | --- |
| S0 contract/source RED | Adopt D1–D4 and freeze source manifest; write original-entry fixtures exposing late invalid coefficient, public listener detach and stale default callback. No product edits yet. | Retain failing raw observations and source hashes. No browser qualification claim. |
| S1 private roster | Add neutral values registry, per-owner/binding leases and prepared transitions; pure isolated controls. No engine activation. | Multiple bindings one scope, independent owners, copy/reentry/counter exhaustion, retirement/tombstones. Values wire still absent, activation false. |
| S2 read-only kernel plans | Split AIR default/explicit preflight from copied application; prepare geometry and exact single-use authorities. Native facade/C unchanged. | Actual current-WASM finite controls prove later-target rejection has zero writes and partial failure facts. Node/WASM controls remain non-browser. |
| S3 real cache + private lane | Wire five PhysicsMaterial entries and observed Collider/System lease sites, actual identity commit, disable/re-enable and teardown. Add legacy blocker ledger if claiming complete physical roster. | Actual Cocos entrypoint RED→GREEN, no public duplicate native propagation, strict same-identity/equal-id tests, all negative groups below. Preserve earlier failure records. |
| S4 qualification | Fresh source-bound real browser fixture and lifecycle/resource evidence; re-run affected identity/pause controls. | Narrow material boundary only. Formal inventory updates require the unchanged formal campaign; do not promote producer/consumer, target grants, unsupported events, mixed-world architecture or nine Gates. |

A stage is not merged/activated merely because its proposed interface compiles. Source-only stage work can proceed without changing any of the 50 frozen N4 build inputs. If a reviewed material mutationOutcome extension is later chosen, give it a separate source-identified binding/native qualification increment; it is not required for the conservative minimum above.

## 8. Minimum negative controls

See `minimum-controls.json` for 16 grouped cases, all NOT_RUN. Each uses real engine entrypoints before a separate fresh-browser pass. Failure injection must be labeled artificial. For each refusal collect actual private-cache/identity/lease/native-call/counter observations; a mock callback count alone is insufficient.

Required positive anchors: one asset on default + two explicit active colliders + disabled collider; exactly one update per native shape; inherited shapes update only via default; inactive geometry changes and survives later enable; scalar equality and setValues exact comparison; clone identity moves only one binding; ordinary no-owner/builtin/Cannon behavior unchanged; public once listener fires once; pause/manual scheduling unchanged and no command/producer activation.

## 9. Blockers retained at handoff

- **B1, design decision pending:** lead must adopt private-lane public-order/manual-emit behavior and still-owned-destroy refusal. This file is not a stealth product contract edit.
- **B2, implementation missing:** no asset-owner value registry, prepared all-shape batch, physical subscription replacement or complete System lease teardown exists in current source.
- **B3, real multi-world ownership missing:** singleton selector binding forbids successful two-live-world proof. All-roster refusal is implementable; positive multi-world support is not established.
- **B4, mixed-backend completeness missing:** need neutral actual-binding blocker ledger or explicitly keep full shared-material activation blocked. Scanning public listener tables is not a substitute.
- **B5, non-blocking phase limit:** material facade lacks reviewed mutationOutcome. This does not require a facade/native rebuild: conservative entered-unknown/fault-all, normal-native-return committed, and separate readback facts permit same-world progress; no rollback/no-mutation claim on thrown setter is allowed.
- **B6, no qualifying run:** no code changed, no controls executed, no browser/app-close resource evidence produced here. 2,128 NOT_RUN, nine Gates unpassed, producers NOT_INTEGRATED and unified activation false remain exact.
