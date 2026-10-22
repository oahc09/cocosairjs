# B1 material identity wiring: source checkpoint a

Status: **PASS_SOURCE_WITH_MOCK_BINDING** for the explicitly bounded controls below. No native/WASM run was performed by this collector. Parent-owned real Release material fixtures are the next independent qualification step; their original RED outputs are unchanged.

## Owned sources and provenance

`source.json` lists six exact product hashes; `source/` retains the same bytes. `before.json` and `before/` are the immutable six-file pre-edit checkpoint already preserved by the parent. `initial-source/` retains the first candidate and its one TypeScript union-narrowing failure. `six-source.diff` is a file-based exact diff, not a Git operation.

- Collider: opt-in observed setter, clone getter, initial onLoad listener completion, and independent teardown of retained listener identities.
- PhysicsSystem: opt-in default-material replacement; actual `_material` cache and listener work remain at the original engine callsite.
- World owner: actual Collider/System delegates, private copied material validation, exact one-use authority, temporary material scopes, actual cache identity notifications and bounded diagnostics.
- World: genuinely private copied default/shape kernels. The original public default-material entry and observed System delegate share the same kernel. Read-only full token/material preflight precedes the first setter. After a setter is entered, an error faults without automatic reverse writes or retry.
- Shared body and primitive shape: captured copied-value delegate, live adapter/shape validation, exact authority forwarding and initialization completion only after the original Collider listener transaction commits. Native teardown followed by JS observer-release failure faults rather than replaying body destruction.

Only these six existing product files changed. B0 and the thin bridge remain frozen. The 50 current native input hashes match the current N4 Release build receipt (`native-inputs-readonly.json`), which is an identity check, not a new native PASS. No public export, feature activation, command staging, native pointer/token exposure or native input change was added.

## State and authority boundary

`prepare` opens the complete private owner scope before original cache/candidate fields are read. The target System, every actual component including disabled colliders, owned Nodes/ancestors, Node.prototype, old assets and newly discovered candidate/clone assets are fenced. Reads of already committed state remain separately admitted. Ordinary configuration methods never borrow material authority or temporarily move the owner to idle.

The registered adapter closure receives one opaque authority bound to this owner, context, adapter/System and exact copied surface object. The world consumes it before native or adapter writes. It is revoked in finally and is never exposed on Component, impl, diagnostics, native calls or app options. The new copied kernels are ECMAScript private methods.

Owner material identity changes only from an actual cache snapshot. Collider initialization remains pending until its initial listener transaction commits. Clone source is copied/preflighted first; the new actual PhysicsMaterial is guarded before any returned-clone coefficient read or cache/listener publication. After commit it belongs to the ordinary owner roster before temporary guards release.

A listener/cache failure after delegate invocation conservatively faults the world. Actual old Collider cache and actual new System cache are recorded as different outcomes. No native success or rollback is inferred from a JS callback returning. If the bridge has already failed internally during apply/acceptClone, its ticket is terminal and outer catch cannot add a later actual read: diagnostics explicitly retain `actualRead=not-requested` and null comparisons. This is not proof that the cache stayed unchanged. Ordinary outer listener failures independently read the actual cache.

Cleanup always attempts independent temporary guards and registered observer releases. Failed guard cleanup remains counted; terminal B0 disposal is not proof of every guard release. Confirmed world native teardown remains distinct from unresolved JS observer leases. Collider teardown attempts known asset unsubscription and native adapter cleanup independently; it preserves the first exception rather than skipping adapter cleanup after an `off` failure.

## Commands and finite results

1. Initial product check: `node node_modules/typescript/bin/tsc -p tools/verify/box3d/owner-material-real-wasm.tsconfig.json --noEmit`, exit 2. One TS2345 for the already runtime-checked Collider branch was preserved in `tsc-initial.raw.txt` with `initial-source/`. The correction is the explicit narrowing, plus making copied kernels genuinely private; no runtime result was claimed for that attempt.
2. Final same product check: exit 0, `tsc-final.raw.txt` / `tsc-final.exit-code.txt`.
3. Explicit four AIR-source Prettier check: exit 0, `format-final.raw.txt`. Extracted Collider/System headers and existing whole-file layout were retained, not whole-file reformatted.
4. `BOX3D_B1_RAW=tools/verify/box3d/material-identity-b1-integration-20261022-a/control-initial.raw.json node node_modules/jest/bin/jest.js --config tools/verify/box3d/material-identity-b1-control.jest.cjs --runInBand --no-cache`, exit 0: **12/12 cases, 54 recorded checks**.
5. `node node_modules/typescript/bin/tsc -p tools/verify/box3d/material-identity-b1-control.tsconfig.json --noEmit`, exit 0. New control/test/config explicit format check also passed.

The new fixture reuses an explicitly labelled in-memory non-solver from the historical owner control, but invokes actual current AIR, Component, Node, Collider and PhysicsSystem methods. Its synthetic +0.25 X step is not physical integration and is never reported as WASM. It invokes original lifecycle callbacks manually on unattached Nodes; no game.init, browser, renderer or native numerical qualification follows. The output records 424 loaded engine/test source hashes at completion; direct six product hashes are checked before and after. It does not invent an all-transitive before-run hash claim.

Cases cover disabled initial identity and later enable, clone owner fencing during actual Node callback, single-read candidate getters under configuration/transform guards, Collider post-delegate listener throw 0, System post-cache listener throw undefined, original public default readback throw null with one setter/no reverse write, pure unsupported candidate rejection and retry, mismatched clone with unknown actual cache, initial listener failure and cleanup, distinct same-id assets, no-observer original behavior, and forged authority rejection. Explicit failure injections and mock setters are source control tests, not natural native defects.

## Still open

- B3 shared-asset EVENT_UPDATE propagation across several colliders/worlds and listener subscription integrity are not implemented or certified. Existing asset-first event mutation is not made atomic by this patch.
- Callback overrides, listener once/off internal-dispatch authorization and direct/private aliases are not a sandbox. This patch protects reviewed engine mutation entries and retains honest failure outcomes.
- B2 immediate pause/reason semantics, command consumer/producer activation, persistent target grants and complete T09–T12/B3/C36 qualification remain open. Both stagedCommandsSupported and unifiedTransactionsSupported stay false.
- Parent real-WASM collectors must include the two newly connected frozen observer/bridge dependency hashes. No old physical PASS is moved onto these source bytes.

The six product sources and three new control files are frozen for independent review. All original failure/raw files are retained; no Git or external write was performed by this worker.
