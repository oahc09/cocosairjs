# T11 Node motion ownership and pre-mutation guard contract

Status: **READ-ONLY DESIGN REVIEW / NOT IMPLEMENTED / NOT EXECUTED**, 2026-10-22 UTC.

This is the AIR/Node companion to [the native transform bridge proposal](transform-bridge-contract-20261022.md), not a replacement for it. The subsequently frozen [motion decisions v1](../contracts/motion-command-decisions-v1.md) govern native math/batching, numeric budgets, teleport/target ordering and dispose sequencing; those decisions are no longer open proposals. It describes the minimum additional Node boundary needed to implement the existing v1.2 motion-control requirements honestly. No Node, AIR product, collector, native, facade, generated artifact, or existing evidence bytes were changed for this review. The earlier finite T10 component results do not establish any T11 result.

## 1. Required outcome and present blocker

`ai/plans/box3d-v1.2-reference.md` §5.3 requires an active kinematic target handle to own motion control. Conflicting direct Node pose and public velocity writes must reject with `AIR_E_BOX3D_CONFIG`, leaving component/native state at the last valid value. `clear()` retains ownership; `dispose()` releases it only after the target-mode clear is safely accounted for. Explicit teleport is the allowed reset path. §6.2 requires body **origin** writeback, an adapter-owned epoch, preservation of other systems' Node dirty flags, and tested parent/scale behavior.

The existing source does not implement that guarantee:

- `shared-body.ts:247–256` notices runtime parent, scale or pose differences at a later preflight and reports unsupported. Detection on the next tick does not undo a setter that has already mutated Node or notified observers.
- `shared-body.ts:265–274` writes native origin through `setWorldPosition` and `setWorldRotation`, then records **whatever pose is read back**. A synchronous transform listener can change the Node during those setters. Recording that changed value would misclassify an external edit as a physics-owned write.
- Node's `TRANSFORM_CHANGED` and `PARENT_CHANGED` notifications are post-mutation. A listener cannot implement synchronous, externally unobservable rejection by restoring values afterward.
- The current public API contract remains `DESIGN_CONTRACT_NOT_IMPLEMENTATION`. Neither target nor teleport is publicly activated by this document.

The proposed narrow fix is an internal, opt-in **pre-mutation ownership gate**, plus an AIR-only expected-write epoch. It must not replace Node, add a physics loop, intercept all backends, expose a writable capability, or silently redefine T11 as deferred detection.

## 2. Audited source identity

Line references below refer to these exact local bytes, not an assumed complete upstream tree. Missing files elsewhere are not evidence of missing APIs.

| Source                                                             | SHA-256                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `src/cocos/scene-graph/node.ts`                                    | `385eabe981cf2c20c65211a488d03a702727e895029d3743193264cf9b500a2b` |
| `src/cocos/scene-graph/node-transform-validation.ts`               | `b2332b6d50688fbd34f53f0fa4c23e3ce8eb96b0680e7edde355a431e14daecc` |
| `src/cocos/physics/framework/physics-system.ts`                    | `e9bda693fa27efc373c4fe4cfdc9f5bc4a4a1d277ba0e8f43b6e28d165f58953` |
| `src/air/physics/box3d/shared-body.ts`                             | `b4e9665f0e688752de8689fcf992da95b50de45075a7e119161f2005995c3239` |
| `src/air/physics/box3d/world.ts`                                   | `ec96866f6208ac987c1f0809b7259c526165df5ff8c5f081fd50ef54572beaee` |
| `src/air/physics/box3d/rigid-body.ts`                              | `0d00792b4f66ec30fdd255041b397f6a501257b071d78bf1516b97bc32ab51b6` |
| `src/air/physics/box3d/world-binding.ts`                           | `aece3008837da8b55c77b969b2374c6a542b5debfa7cbffe5a8b2b41ffb78de0` |
| `ai/plans/box3d-v1.2-reference.md`                                 | `17b4dcf0d8acbe0ed72f81ab4d3fc53c6a51f705d573699f0d50137e4bf00c46` |
| `docs/physics/box3d/contracts/api-contract.json`                   | `0e53683159e025ecdf07ae495abcf54e902529b51c6938ce3717fab4dd6e7fc9` |
| `docs/physics/box3d/rebuild/transform-bridge-contract-20261022.md` | `78cbe4a4df0bcc235bab9d894773bf8acee1d1d2980acaadef66f4c280e603a3` |

The native companion owns proposed atomic origin/velocity/wake commands, target velocity math, damping, locks, caps, float32 admission, and independent trajectory budgets. This document owns Node entry-point coverage, ownership/epoch integration, and the distinction between synchronous rejection and later recovery.

## 3. Actual Node write surface

### 3.1 Canonical transform methods

| Entry in `node.ts`                | Current first relevant effects                                                                                                                     | Proposed gate location                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`, 2423–2441          | Copies local position, invalidates descendants, emits transform event.                                                                             | Before local writes; existing finite validator remains.                                                                                       |
| `setRotation`, 2475–2488          | Copies local quaternion, updates Euler dirtiness, invalidates/emits.                                                                               | Before all local/Euler writes.                                                                                                                |
| `setRotationFromEuler`, 2506–2523 | Writes local Euler/quaternion and dirty state.                                                                                                     | Before all local/Euler writes.                                                                                                                |
| `setScale`, 2554–2572             | Copies local scale, invalidates/emits.                                                                                                             | Before local writes. Active target-owned affine changes cannot bypass pose ownership through scale.                                           |
| `setWorldPosition`, 2626–2658     | Existing validation can read `this.worldPosition.z`; then writes cached world position **before** parent inverse conversion/local write.           | At entry, before the fallback world getter as well as before writes.                                                                          |
| `setWorldRotation`, 2691–2712     | Writes cached world quaternion, updates parent, derives local rotation, invalidates/emits.                                                         | Before world cache or parent update.                                                                                                          |
| `setWorldScale`, 2756–2826        | Existing validation can read `this.worldScale.z`; then refreshes world transform, writes world scale, and may mutate matrix entries for zero axes. | At entry, before fallback getter, refresh, or any matrix write.                                                                               |
| `setRTS`, 2887–2917               | Validates supplied parts first, then writes rotation, position, scale sequentially.                                                                | One admission for the **complete combined request** before its first write; not independent per-field commits. Empty request remains a no-op. |
| `angle` setter, 1840–1850         | Directly writes Euler/local rotation, then invalidates/emits. Does not call the existing finite validator.                                         | Direct pre-write gate, not merely a hook in `setRotation`.                                                                                    |
| `matrix` setter, 1896–1904        | `Mat4.toSRT` writes local rotation/position/scale directly.                                                                                        | Before decomposition into live Node fields; later affine validation must use scratch candidates.                                              |
| `translate`, 2207–2232            | Direct local position additions; WORLD branch can read parent rotation/world scale.                                                                | Before reads that refresh caches and before local additions.                                                                                  |
| `rotate`, 2240–2258               | Normalizes into scratch and writes local quaternion; WORLD branch reads world rotation.                                                            | At entry before refresh or live writes. Do not change old-backend normalization behavior.                                                     |
| `lookAt`, 2266–2272               | Reads own world position before delegating to `setWorldRotation`.                                                                                  | Early ownership check before `getWorldPosition`, then the canonical gate remains authoritative.                                               |

Simple property aliases delegate: `position`/`x`/`y`/`z` (1684–1733), `worldPosition`/`worldPositionX/Y/Z` (1746–1798), `rotation`/`eulerAngles` (1810–1821), `worldRotation` (1861), `scale` (1874), and `worldScale` (1888). The axis setters use existing local/world cache fields; they do not independently refresh them. They need actual-source coverage, but no second mutating implementation.

`forward` (1923–1928) and `setWorldRotationFromEuler` (2721–2724) compute scratch values and delegate to `setWorldRotation`. Keep that canonical gate. A preliminary wrapper check must not consume the one-use internal write permit before the canonical setter uses it.

`matrix` is not an academic bypass: `src/cocos/animation/animation-manager.ts:105` assigns it. Animation/tween-driven writes to a target-owned Node must receive the same explicit conflict result, not a privileged exemption.

### 3.2 Hierarchy changes

| Entry                                                                       | Required treatment                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parent` setter, 237; `setParent`, 493–552                                  | Check affected active ownership before `keepWorldTransform` refresh, `_parent`, sibling index, `_onSetParent`, event, or either children array changes. Both keep-world modes matter.                                                                           |
| `modifyParent`, 483–485                                                     | This public `@engineInternal` method assigns `_parent` directly. It is used in prefab utilities at 91 and 185. Guard active controlled nodes/subtrees or explicitly retain it as an unresolved bypass; do not claim full hierarchy coverage without a decision. |
| `addChild`, 625; `insertChild`, 639–642                                     | Delegate through guarded `child.setParent`; insertion must not reach sibling changes after rejection.                                                                                                                                                           |
| `removeFromParent`, 795; `removeChild`, 806–810                             | Delegate through parent removal/setParent.                                                                                                                                                                                                                      |
| `removeAllChildren`, 817–826                                                | Precheck the complete candidate child set before the loop, or an unprotected child can be detached before a later protected child rejects. Per-child rejection alone is not an atomic batch.                                                                    |
| `setSiblingIndex`                                                           | Does not change TRS or parent ownership by itself; do not expand the motion guard to unrelated ordering changes without a separate reason.                                                                                                                      |
| `destroy`, 1368; `destroyAllChildren`, 1383; `_onPreDestroyBase`, 1494–1550 | Terminal cleanup is not a conflicting business pose edit. Revoke/invalidate target ownership in the body/app lifecycle before cleanup; never block scene teardown behind the ordinary movement gate.                                                            |

Changing a parent or grandparent moves a controlled descendant even without a child setter or child transform event. Ownership coverage therefore includes each actual ancestor whose affine transform can affect that body, not only the body Node. Reparenting a subtree containing a controlled body is also relevant.

### 3.3 Validator, flags, and raw aliases

The existing `node-transform-validation.ts` helper rejects non-number/nonfinite/non-float32 components before its callers' writes. It only receives `(method, values, uuid)`, not Node identity, backend ownership, command phase, parent context or an internal permit. It cannot presently enforce Box3D motion ownership. Keep its existing global finite-input behavior; do not convert it into an unconditional Box3D policy.

`invalidateChildren` (2280–2305) is too late: mutation has already happened. `hasChangedFlags` (2000–2006) and `flagChangedVersion` (1992) are frame-based engine state, not per-command identity. Multiple external and internal writes in the same frame share that version. `updateWorldTransform` (2312–2398) legitimately refreshes cached matrices and consumes internal `_transformFlags`; it must not be repurposed as target command consumption.

Important qualification correction: the current shared-body preflight's comment says no flags mutate, but reads of `worldScale`, `worldPosition` and `worldRotation` can call `updateWorldTransform`. Its established property is no native control/step or adapter diagnostic mutation, not complete Node-cache/dirty-bit immutability. A new synchronous rejection test must inspect raw test-visible fields without first refreshing them, or it could mask this distinction.

Readonly TypeScript getters return live objects for local/world vectors, quaternion, Euler and world matrix. Casted/direct alias writes can bypass every setter and event. `children` also exposes its existing array. This narrow guard does **not** make those objects runtime immutable or solve all C36 alias cases. Full affine comparison before native commit remains necessary, and its later detection must never be labeled synchronous rejection. Private-field mutation, prototype replacement and unreviewed engine-internal skew paths are not proven covered. `isSkipTransformUpdate` (3010–3016) can suppress propagation; while controlled, it must either reject changes through a small explicit check or remain a named unsupported bypass until separately closed.

## 4. Smallest proposed integration boundary

### 4.1 Internal engine seam

The next authorized review scope is the existing `node-transform-validation.ts` module plus minimal calls in Node, with registry names frozen by the lead before implementation. Node imports only a generic ownership assertion; it does **not** import AIR, a physics selector, native binding, or a concrete backend. With no registered owner for the affected Node, the check returns without changing existing behavior. Registration is not a public package export.

The internal registration/permit functions return private disposer/closure capabilities held only by AIR. Do not put a writable owner/epoch/token property on Node, RigidBody, `impl`, a public handle, or `cclegacy`. The registry should key on actual object identity, not uuid alone. Each lease carries current app/world/body generation, so a destroyed/reused body cannot inherit an old permit.

A practical split is:

1. A non-consuming **entry ownership check** rejects external protected writes before getters/cache refreshes. It can recognize that an exact private owned operation is pending, but does not spend it.
2. The canonical pre-write check matches that owned operation's copied method/Node/candidate values, generation and epoch, then consumes it once **before** any transform notification can run.
3. Unprotected Nodes run the original setter body and finite checks. Protected external requests fail with `AIR_E_BOX3D_CONFIG` without callbacks, target-sequence increments, native calls, diagnostics invalidation, or partial hierarchy changes.

The first check can be combined with the canonical check where no early helper/getter exists. There is no requirement to allocate a command object on every ordinary Node write. The final narrow implementation should be reviewed for its actual entry order, not merely for the presence of a helper call.

### 4.2 Ownership lifetime and ancestor coverage

AIR resolves public RigidBody objects through an internal WeakMap populated only after actual adapter initialization. A public motion helper checks current app/world, initialized/live body, enabled/type eligibility and owner generation; it never obtains raw pointers through a public escape hatch.

An active target registers its own Node and ancestor dependencies. Ancestors need reference-counted owner sets, because siblings can have independent handles. Reject external affine edits or hierarchy changes affecting any active controlled descendant. Do not leave a stale ancestor registration after dispose, disable, type change, scene release or close. `clear()` alone does not remove registrations.

Recommended first conservative policy: reject affine/parent changes affecting target-owned bodies, including same-value transform setter requests, rather than attempt a hidden parent-compensation transaction. Pure existing no-ops such as empty `setRTS` can remain no-ops; freeze the same-parent `setParent` no-op explicitly. This policy is local to active Box3D control ownership. Ordinary unrelated Nodes and other backends keep their exact behavior. Runtime ordinary-body transform synchronization is a separate T11 obligation, not declared solved by blocking target conflicts.

A moving physics-owned ancestor with a target-owned descendant is a special dependency: accepting the ancestor's internal write can change the descendant before its own writeback. Do not grant an ancestor permit blanket authority over all descendant owners. Either implement a prevalidated, topologically ordered world-pose writeback transaction for the affected hierarchy, or explicitly reject acquiring this combination until it is qualified. Record this restricted case; do not quietly advertise full parenting support.

Cleanup must retain the e-stage rule: a faulted world rejects ordinary work, but allows cleanup-only JS ownership/listener removal and one final native world destruction. Motion guards cannot cause the already-fixed `app.close()` resource failure to reappear. Destroy callbacks must not receive a temporary general permission to issue new pose/velocity commands.

## 5. Expected pose and owned epoch, not readback laundering

Use an AIR monotonic world write epoch and an immutable expected **body-origin world pose** from a validated native copy. Keep input/target-command sequence separate from native step index and Node frame flag version. Reject counter exhaustion rather than wrapping identity.

Proposed writeback procedure:

1. Copy and validate the native pose and affected affine/parent basis. Freeze a writeback intent `{ownerGeneration, epoch, node, expectedPosition, expectedRotation}`. Normalize/compare quaternion orientation with the companion's q/-q policy; do not replace the expected pose with an observer's value.
2. Create a one-use permit for exactly the forthcoming world-position setter. The pre-write check consumes it before `TRANSFORM_CHANGED` emission. A listener's nested setter, including one with the same requested value, has no unused permit and rejects.
3. Verify actual position and the expected intermediate orientation after the setter, then create a separate one-use world-rotation permit. Verify the final world pose against the **original expected** position/rotation and permitted parent basis.
4. Commit the epoch and expected pose only after both operations and verification succeed. Never use `this.#pose = this.nodePose()` as proof of ownership without checking equality to the intended native result.
5. A mismatch, unexpected listener exception, or unsupported hierarchy change after the native step is a synchronization failure. Preserve known native completion and step count, invalidate the Node-sync result, fault, and do not replay the native tick. Cleanup remains available.

An `isWritingPhysics=true` flag spanning setter calls is insufficient: event callbacks execute synchronously inside that flag. A depth counter that admits every nested write has the same bug. Permits must be consumed before dispatch and revoked in `finally`, including when a setter/listener throws.

The two current Node setters emit separately. Read-only listeners can observe an intermediate position/new-orientation ordering. This proposal does not promise a single atomic Node transform notification. If that promise becomes required, it needs a separately reviewed combined Node write/notification transaction; do not suppress existing events to fabricate it. An observer that catches its rejected nested write may allow normal writeback to complete; an uncaught listener exception must be recorded as failure, not silently swallowed.

Preserve `Node.hasChangedFlags` and unrelated scale dirtiness. Reading engine transforms may perform legitimate cache maintenance; do not manually reset flags or stamp the Node frame version to hide it. Use the frozen numerical comparison budgets from motion decisions v1, not arbitrary larger tolerances introduced after a failing case. Store the intended copied pose alongside the verification result so tests can distinguish identity from approximation.

## 6. Fixed-tick admission and command ownership

The actual `PhysicsSystem.postUpdate` (372–397) calls scene sync per executable fixed tick and also when there is not enough accumulated time for a tick. Manual `PhysicsSystem.step` (462–463) calls `world.step` directly. Therefore:

- `syncSceneToPhysics` can detect/prepare but cannot consume a target, clear, teleport, force or impulse.
- The actual world `step` must perform current pure/native-nonmutating preparation even on the manual path.
- A per-fixed-tick hook belongs inside that world path. Its exact public name/signature is explicitly still unresolved in motion decisions v1. Do not substitute frame-level `DirectorEvent.BEFORE_PHYSICS` or create another accumulator/RAF.

Proposed phase order is `idle → scene preparation → hook command collection → sequence cutoff/full validation → native commits → one native step → copied output/owned Node writeback → later event work`. Use a separate reentrancy phase; do not globally relax `assertReady` so arbitrary setters can mutate native during planning or copying.

Hook operations must stage copied candidates. A hook that applies a real force and then throws cannot safely be retried as if no mutation happened. Preflight every body's pose, full affine shape plan, target/teleport ordering, numeric range, lock/cap eligibility and handle generation before the first native write. Known invalid later commands preserve the whole prior native state; unknown/committed failures fault instead of claiming general rollback. Commands emitted after the frozen cutoff belong to the next tick.

Native origin reset plus velocity/wake, and target/clear paired v/w updates, must use the companion's reviewed single-action bridges. For target computation, the desired COM is `targetOrigin + targetRotation * localCOM`; an origin delta alone is wrong for off-center bodies. This document does not redefine the native approximation or damped arrival budget.

`dispose()` invalidates handle use immediately but cannot expose ordinary velocity mode before the pending target-owned clear is safely sequenced. Otherwise an old deferred clear can erase a newly written velocity. Pause clears moving intent; paused submissions reject; resume requires new target input. Actual Game pause/resume events and app/scene ownership, not a mock flag, must drive the lifecycle integration.

## 7. Recovery and boundaries that remain explicit

### Guarded public setter rejection

No restoration is necessary or appropriate: reject before writes/events. In particular, do not write old values back from a transform event, because listeners may already have observed the invalid pose and restoration can overwrite unrelated dirty state.

### Bypass detected before any native write

A raw alias/private mutation can already have changed Node. Full pose/affine comparison at admission must stop before native controls/step and preserve the previous native snapshot. It cannot claim that the original setter was rejected or that Node stayed unchanged.

Proposed recovery, requiring lead freezing: mark an external-scene conflict and block further physics admission for that body; allow an explicit controlled reset to a caller-selected valid origin pose through teleport, or a validated dispose/release-and-reconfigure path. The controlled reset uses the same expected-pose permits and rechecks shape/parent consistency. Do not silently adopt the corrupted readback as a new baseline or call `clear()` a release of control. If repair involves unknown native mutation, fault and close instead of repeatedly trying it.

This is a later recovery path for unsupported bypasses, not a substitute for synchronous target ownership at normal Node entry points. Its error/status must name that distinction. Whether pre-step alias conflict is recoverable or immediately fault-latched is a policy still to freeze; either must preserve known native completion accurately.

### Ordinary non-target Node edits and scale

T11 still needs native synchronization for admitted static/ordinary kinematic pose changes and a deliberate dynamic reset policy. Current runtime parent/scale/pose edits remain unsupported; this document does not activate them. Decide non-handle reset velocity/wake semantics before implementation.

Full world affine analysis is necessary: parent nonuniform scale with child rotation can create shear. Dimensions use absolute scale, collider center uses the signed full transform, and a sphere uses max absolute scale rather than becoming an ellipsoid. Mirrored asymmetric-center and degenerate/sheared cases require independent geometry checks. Multiple same-body colliders must be prevalidated together; sequential shape recreation is not perfect contact-cache rollback. A complete atomic shape/scale plan may need additional native ownership/reservation support beyond the proposed pose bridge.

## 8. Required RED → GREEN evidence, not current test results

Start with actual imported TypeScript Node/AIR source control fixtures before product edits, preserving the current failures and source receipts. Such fixtures can mock a control lease to test Node dispatch, but are not native physics evidence. Once a newly qualified transform WASM exists, use actual AIR preparation, actual RigidBody/Node and PhysicsSystem paths with retained original module calls/readbacks. The l2 artifact has no T11 bridge and cannot be relabeled.

| Group                 | Required cases and observations                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry coverage        | Every canonical method and property/convenience alias above; numeric/object overloads; 2D omitted-z path; `angle`, `matrix`, both translate/rotate spaces, `lookAt`, combined `setRTS`. A protected request throws before local/world TRS, matrices, raw dirty fields, event counts, target sequence, diagnostics or native state changes.                 |
| Ancestors/hierarchy   | Parent and grandparent edits; two independently controlled descendants; unrelated siblings; subtree reparent with both keep-world values; `modifyParent`; add/insert/remove; remove-all with a protected child positioned so a naive loop would already detach another child. Assert parent arrays, indices and event order remain unchanged on rejection. |
| Early-cache rejection | Dirty Node/parent before omitted-z `setWorldPosition`, fallback `setWorldScale`, lookAt and keep-world reparent. Snapshot raw fields before/after without getter refresh masking changes.                                                                                                                                                                  |
| Owned permits         | Matching write accepted exactly once; wrong Node/method/value/generation/epoch rejected; consumed/revoked permit cannot be reused; unrelated-node writes are not accidentally authorized.                                                                                                                                                                  |
| Reentrant observers   | Synchronous transform callback attempts position, rotation, parent or scale write during native writeback. Both caught and uncaught conflict variants; reading is allowed. Callback alias mutation is detected against expected pose, never recorded as the owned baseline.                                                                                |
| Dirty epoch           | Same-frame external/internal writes, frame-version advance, successive fixed ticks, pre-existing SCALE bit, q/-q equivalent orientation. No self-write re-upload/teleport; native step count exactly once.                                                                                                                                                 |
| Numeric/affine        | Nonfinite/zero quaternion, overflow after float32 conversion or parent composition, nonuniform rotated parent, mirror with asymmetric center, degenerate scale, tiny-box boundary, multiple shapes with an invalid later candidate. Preserve finite native state and counts on known rejection.                                                            |
| Lifecycle             | Clear retains control; dispose sequencing and idempotence; disable/type-away/re-enable; scene release versus persist owner; app pause/resume/close; faulted cleanup. No leaked ancestor registrations or stale world/body generation permits.                                                                                                              |
| Native integration    | Off-center origin/COM distinction, actual target/teleport/clear v/w, target no-repeat next tick, same-tick sequence, manual and automatic PhysicsSystem paths, multiple catch-up ticks, actual before-step input counts, true post-step diagnostics and resource zero.                                                                                     |
| Compatibility         | Same actual Node calls and event counts on unprotected Box3D nodes and existing builtin/Cannon paths; no backend-global error or changed numeric normalization.                                                                                                                                                                                            |
| Honest failure labels | Natural prewrite rejection, explicitly injected postcommit/copy failure, unknown native throw and post-step Node-sync failure recorded separately. No injected wrapper error called a natural core defect.                                                                                                                                                 |

A Node-only green proves dispatch/control behavior, not trajectories, contacts, GPU/browser operation, a complete C36 transaction guarantee, or full T11 completion. Historical g component results remain tied to their original source hashes.

## 9. Proposed implementation ownership and decisions

No changes below are authorized by this document itself. Lead review should assign the next narrow edit window:

1. **Extracted Node owner:** minimal `src/cocos/scene-graph/node.ts` pre-mutation calls and backend-neutral registry primitives in the existing `node-transform-validation.ts`. Preserve upstream headers and formatting; do not change existing finite validation behavior. Parent owns file-map/UPSTREAM/allowlist metadata.
2. **AIR owner:** current world/shared-body/rigid-body plus a new private motion-control helper; identity map, command phases, handle lifecycle, ancestor leases and expected-pose epochs. No raw-token export or public feature activation before actual qualification.
3. **Native owner:** only the transform companion's reviewed atomic bridge and wire changes. Do not edit facade concurrently from AIR work.
4. **Verification owner:** new isolated Node-control and transform-real-WASM fixture prefixes; preserve current20-source checkpoint and existing historical collectors. Source receipts before/after, new artifact identity, all failed attempts retained.

Still freeze before the corresponding implementation: same-value/no-op policy; ancestor-controlled hierarchy admission; `modifyParent` and skip-transform scope; exact before-step hook/staged-force behavior; ordinary dynamic/non-handle kinematic Node-reset semantics; alias-conflict recovery; and adapter epoch exhaustion rules. Native batching, dispose/clear/teleport ordering and numerical qualification budgets are now governed by motion decisions v1. The missing synchronous pre-mutation boundary is a concrete blocker to the default target contract, not a reason to relax that contract silently.
