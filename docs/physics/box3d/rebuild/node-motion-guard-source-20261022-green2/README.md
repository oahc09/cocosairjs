# Node motion guard primitive checkpoint

Status: **PASS_LIMITED_ACTUAL_NODE_CONTROL**, not native physics or public T11 qualification.

The six source files are frozen in `source-receipt.json` and copied under `inputs/`. `receipt.json` binds the terminal outputs and verifies that the source bytes remained unchanged. The actual imported Node, hierarchy and transform-event implementation runs in official Node/Jest/JSDOM; no browser/GPU or generated WASM is used here.

## Results and preserved attempts

- `../node-motion-guard-source-20261022-red/`: original Node plus the new, not-yet-connected registry. **73 failed / 9 passed / 82 total**. Actual Node state/events changed despite registered ownership; the RED is not merely a missing-function import error.
- `../node-motion-guard-source-20261022-green/`: first connected implementation **82/82** and narrow tsc passed. The subsequent expanded **142/142** run passed Jest but failed tsc because the fixture used `Object.fromEntries`, unavailable in the existing project lib. Both input versions and all original raw results remain there. The project lib was not broadened.
- This `green2/`: the fixture uses `Object.keys` instead. **142/142**, narrow tsc, AIR/tool formatting and new-registry-tail formatting pass. There was no source edit during the final checks.
- Original stdout retains `Cannot access game frame or container.` from imported engine setup. This suite does not call `game.init`, establish a renderer, or qualify bootstrap/coexistence.

## Shipped candidate primitive, not activation

`node.ts` has 29 added lines including a replacement import. `node.patch` and `upstream-preservation.json` show that the only removed original line is that import, that the original header is unchanged, and that the original finite validator prefix remains byte-identical. Extracted Node was not globally formatted.

The existing `node-transform-validation.ts` now owns a backend-neutral WeakMap registry. A private frozen lease registers copied object identities, disposes idempotently and permits only exact complete world-position/world-quaternion writes. No-lease entry returns before evaluating candidate getters. Under a grant, complete raw input is copied once before any fallback world getter; the actual setter uses that copy.

All affected leases must provide matching permission. Different leases may nest to compose permission on a shared ancestor. A same-lease nested grant rejects. Entry reserves permission while reading accessors, snapshots owner identities, then rejects owner additions/removals/replacements before Node writes. Final admission consumes every matching grant before user callbacks. Finally revokes pending permission, and completion checks reject disposal during a listener rather than pretending an already-mutated Node was rolled back.

The thin AIR module only collects the actual body Node and ancestor identities, detects ancestry cycles, and supplies the Box3D error context. It is not connected to `world`, `shared-body`, registration, or public target/teleport helpers. The lease is not exported from the main package or stored as a writable Node/impl property.

The tests cover canonical TRS, angle/matrix, relative methods, lookAt, aliases, early-cache reads, hierarchy/removal batches, ancestor sharing, same-value rejection, empty-RTS no-op, exact/copy-once permits, getter/listener reentry, cleanup/release and every listed unregistered method path with unrelated ownership present. The latter are actual Node compatibility controls, not actual builtin/Cannon world simulations.

## Explicit limits

- Raw mutable-vector/matrix/children aliases and private mutation are not synchronously intercepted. The alias control intentionally records that limitation rather than claiming rejection.
- A consumed permit proves only the authorized Node operation, not native pose accuracy or a committed physics-owned epoch. Expected native/world/local pose verification is the next separate AIR step.
- Internal grant sequence has a pre-increment safe-integer exhaustion check. Natural exhaustion at 2^53 was not executed; this is not a target-command or native-step counter proof.
- Registration/disposal side effects performed by arbitrary input accessors cannot be rolled back. They invalidate the permission; Node mutation from the guarded operation is prevented. A listener can fail after Node mutation, which is reported honestly.
- No native calls, simulation ticks, target bridge, public activation, full parenting/scale synchronization or full C36 acceptance are claimed.
- The former 20 owned g-source bytes remain unchanged, as the readback file shows. Nevertheless Node is now different, so old g physics PASS is historical, not current qualification.

## Next smallest actual-WASM writeback repair

Keep public motion APIs inactive. On each real `syncPhysicsToScene`, temporarily protect body Node plus ancestors, use independent exact position/rotation permits, and release the lease in `finally`. Capture the original native origin pose and expected parent basis before writes. Derive expected local position/rotation with the same Cocos math; verify both raw local TRS and expected world pose after each setter, including the intermediate position-only state.

World pose alone is insufficient: a listener can flush the world cache and then mutate the local vector alias, leaving a later cached world read apparently valid. Compare the original expected local/world/ancestor basis, not a new baseline taken from the listener-modified readback. Store expected pose plus an adapter-owned epoch only after complete verification. Preflight epoch exhaustion before the native step.

Use new l2 source-qualified real fixtures for nested setters, caught/uncaught listener errors, flush-then-alias, and ancestor alias writes. If the native step already completed, a sync failure faults without replay while preserving that known completion. Faulted close must release the temporary guard and native resources. The upcoming motion-batch ABI is independent and is not required to expose this existing writeback gap.
