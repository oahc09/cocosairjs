# Expected origin pose and owned writeback epoch

## Scope and status

This is the narrow AIR writeback qualification plan, not target/teleport, continuous-force hooks, public registration, full T11/C36, browser/GPU or B3U01 qualification. Product sources remain unchanged during the original-implementation RED collection. The new `writeback-epoch-*` tools use actual AIR startup, original Cocos Node/components/PhysicsSystem, production loader/facade and a matching generated WASM. Source controls are explicitly separate from physics evidence.

The old l2 artifact cannot qualify the current facade and is not used. No historical-facade import, manifest rewrite, source-hash relaxation or automatic fallback is permitted. A new m artifact must pass the strict current-input and artifact-byte checks before creating a realm. Original failures and old collectors remain immutable.

## Observed current source gap

`shared-body.ts::assertSceneUnchanged` compares parent identity and cached world scale/pose. It does not compare raw ancestor local TRS or reconstruct affine transforms independently of Node caches. `syncPhysicsToScene` reads one immutable native origin transform, invokes two Node setters, then adopts `nodePose()` after arbitrary user callbacks. A callback can flush world caches and then mutate a local Vec3 alias; a subsequent world getter can still match the native pose while the real local data differs.

`world.ts::step` correctly owns exactly one native fixed step and preserves its completion on a later failure, but syncs shared bodies in Map insertion order. Child-before-parent insertion can let the parent's later write displace an already synchronized child. Per-body validation alone also cannot detect a later sibling callback corrupting an earlier body. Native transforms contain origin xyz, quaternion xyzw and COM xyz; writeback must use origin, not COM.

The existing backend-neutral Node guard supports exact single-use setters and prevents callback business setters. It intentionally cannot synchronously intercept direct Vec3/Quat/Mat4 aliases. This document does not relabel post-write or pre-step alias detection as synchronous transaction refusal.

## Proposed product change, pending edit window

1. Before native advancement, freeze the world body/owner list and validate each raw local TRS and parent identity along its entire ancestor chain against the last committed baseline. Do not call a cache-refreshing world getter first. Build scratch affine chains from copied local values and compare the cached world representation only at a separately named check. Existing runtime external pose, parent and scale changes remain unsupported. Known preflight refusal must preserve native count, Node data and world diagnostics.
2. Reserve an owned epoch before entering the native-step region; reject exhaustion before any step, Node write or diagnostic mutation. There is still only PhysicsSystem's accumulator and one native step per admitted tick.
3. Once the real native step completes, freeze all original copied body-origin poses and all owner identities before the first Node setter. Do not obtain a new expected pose from Node reads after callbacks.
4. Sort bodies by ancestor depth, parent first. Hold the union of temporary guard leases across all participating body nodes and ancestors for the whole batch. Shared ancestors use the registry's exact composed permissions, not a global bypass. Capture parent basis at each write only after validating it against the already verified parent result.
5. Derive expected local position from the validated parent affine inverse and original native origin. Derive local rotation from the validated parent quaternion and original native quaternion. Position and rotation use separate exact `lease.write` permits. Check raw local/world/intermediate pose, ancestor basis and ownership after each setter. q and -q are orientation-equivalent for physical comparison, not permission to bless an unowned raw-local change.
6. Recheck the entire batch, including previously written siblings and all ancestor baselines. Only then commit every body's pose baseline and the world's epoch together. A post-native mismatch faults the world while retaining actual native completion and count; never replay the step or report perfect Node/native rollback.
7. Release temporary leases in `finally`, including callback throws and faults. Existing cleanup-only component/Scene/app destruction must still release the single owned native world. No guard or raw token appears in `impl` or the public package API. Unrelated Node SCALE/change flags are not cleared.

This does not promise atomic Node event visibility across a tree. Arbitrary user callback side effects are not rolled back. Callback exceptions and alias corruption are diagnosed/faulted at their actual boundaries.

## Internal exhaustion qualification policy

Parent review froze an optional third internal adapter argument: `createBox3DWorldAdapter(selector, componentConfiguration, Object.freeze({ epochLimit }))`. The world/controller copies and validates a safe integer at least 1. Production defaults to `Number.MAX_SAFE_INTEGER`; ordinary fixtures omit the argument. `diagnostics().writeback` may expose only frozen `{ epoch, epochLimit }`, not a writable counter or token. The option must not reach public AIR app configuration, package exports or `impl`.

The fixtures explicitly use limits 1 and 2 to reach the exact implementation boundary. This is an artificially reduced boundary, not evidence of naturally running to MAX_SAFE_INTEGER. Missing policy/diagnostics produces `PENDING_FIXTURE_SEAM` with zero steps and real cleanup, never a physics RED or PASS.

## Collector boundary and commands

Entry: `node tools/verify/box3d/writeback-epoch-real-wasm.mjs <current-artifact-dir> <new-evidence-dir> <case>`.

- Each case is a fresh official Node process with Jest/JSDOM and actual `createAirApp({ renderMode: 3, physics: 'box3d' })`. It is HEADLESS, not a browser or GPU observation. Existing container warnings and PhysicsSystem2D error output are retained; this is not new 2D coexistence qualification.
- Local transport serves exactly the qualified manifest, generated JS and WASM from disk. No network/socket workaround is used.
- Adapter/feature registration is fixture-internal. The recorded binding proxy forwards original `this`, arguments, results and errors with `Reflect.apply`. It replaces no world, readback, physics counter or native result. Raw tokens are observed only within the fixture.
- Physics advances only through actual `PhysicsSystem.step(1/60)`. Native readbacks used by the oracle are observations, not an alternate physics engine. There is no second RAF/accumulator or direct native stepping.
- The scalar-array oracle independently composes local affine transforms and relative quaternion angles; product execution never imports it. It exposes stale-cache aliases rather than using a world getter as the sole truth source.
- All invariants are retained before assertions, followed by actual `app.close`, repeated close identity, core/bridge resource accounting and post-close read-only actual Node registry-entry probes (destroyed Node TRS fields must not be accessed). Failures remain FAIL, even when they demonstrate the expected old bug. Pending fixtures remain separately named.
- Before/after SHA receipts bind named direct sources, hooks, config, lockfile, native build inputs and artifact bytes. They do not claim every transitive engine source is enumerated. A changed input invalidates the run.

## Independent scenarios

| Case                   | Required evidence                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `baseline`             | Default policy, actual two fixed ticks, analytical constant velocity, native origin versus offset COM, zero resources.    |
| `child-before-parent`  | Create child body first; moving physics parent must not displace the already copied child's origin after the batch.       |
| `self-flush-alias`     | Rotation callback flushes caches then edits own local position alias; reject adopting the stale world getter as baseline. |
| `parent-flush-alias`   | Callback flushes then edits nonphysics parent's local position alias; detect ancestor mismatch.                           |
| `sibling-flush-alias`  | Later body's callback corrupts earlier body's raw local after cache flush; final batch verification detects it.           |
| `prestep-parent-alias` | Raw parent alias before step is rejected before native/diagnostic mutation, not silently repaired.                        |
| `setter-caught`        | Callback catches synchronous rejection of business setter; expected owned write still completes.                          |
| `setter-uncaught`      | Uncaught business setter rejection faults after one completed native step; no replay.                                     |
| `quaternion-sign`      | Actual negative quaternion representative does not create a false orientation mismatch.                                   |
| `scale-dirty`          | Positive initial scale and unrelated SCALE changed bit survive actual writeback.                                          |
| `epoch-exhaustion-one` | Internal limit 1, one admitted tick then unchanged refusal, or explicit pending seam at zero ticks.                       |
| `epoch-exhaustion`     | Internal limit 2, two admitted ticks then unchanged refusal, or explicit pending seam at zero ticks.                      |

All fault cases require actual app/Scene teardown and zero native core/bridge delta. A limited success row does not close the remaining target/teleport, runtime parent/scale, alias synchronous interception or public qualification gaps.
