# Collider listener entry candidate result

Status: PASS_CANDIDATE_ACTUAL_ENGINE_OWNER_SOURCE_ONLY. Not integrated or pushed.

## Verified

- Original actual engine source: exit 1, 261 cases, 179 intended guard failures / 852 failed checks. No fixture failures or cleanup errors.
- Candidate actual engine source: exit 0, 261 cases and 1,682 checks passed. No fixture failures, cleanup errors or loaded-source drift.
- 400 actually loaded engine/test source files fingerprinted before and after each run. Normalized RED/GREEN source inventories differ only in Collider.
- Both actual variants use frozen current owner SHA `2f313aae10b900e417ebea9b2b8254994fee4f7fe4e26181516c5fca74fb091f`. Original earlier owner snapshot and its diff remain retained.
- 80 full no-lease state traces are byte-equivalent as JSON values across the two variants. The fixture varies selector IDs (`box3d`, `builtin`, `cannon`, `physx`) and presence/absence of the counted shape double. This is not a real-backend integration matrix.
- Main Collider still has its original SHA. No main product, Git or remote mutation was made by this candidate task.
- Focused fixture format and JavaScript/Python syntax checks passed. No whole-project TypeScript check or production build was run.

## Coverage

Ten mutator variants: on, on-with-once, once, off(callback), off(type), removeAll(type), removeAll(target), inherited targetOff(target), inherited targetOff(type), runtime-only clear.

Three event families: trigger, collision, controller trigger. Four actual owner temporary phases: writeback, dispatch, material kernel, and System control. Rejection is tested twice after catching the first error, including exact callback-table/list/array/info identities, listener entries, invocation/cancel flags, event-need caches, adapter and off-hook counters.

Additional controls cover active callback reentry, rejected once/invalid-target automatic off through inherited emit, argument/coercion/cache reads before admission, unrelated leases, independently released overlapping leases, and the inherited API inventory.

## Minimal source change

`candidate.patch` changes only Collider: four early calls to assertMutationAllowed, plus a descriptor-preserving local wrapper for the runtime-only inherited clear. targetOff is covered through its real dynamic removeAll dispatch. No global Eventify mutation or added declared Collider API. Original unguarded clear cache semantics are deliberately preserved.

Original Collider SHA: `2e93ecae851d1a943c00d1a5a01a3d887153dce0d9693f541b4f6be73b2a7ac9`.
Candidate Collider SHA: `a79f2defaa82992989859097f5148385c782bec70ba2be417253807a30e7cf34`.
Patch SHA: `f02ecb01f484a29f591b1c0e15390f56edf0c81801330da34a94fa4d64fb13d7`.

## Evidence and reproduction

- `actual-before-a/`: original RED stdout, stderr, Jest report, raw observations, input fingerprints and receipt.
- `actual-source-a/`: candidate GREEN equivalent evidence.
- `comparison-final.json`: cross-variant checks, hash identities and explicit qualification limits.
- `pure-before-a`, `pure-source-a`, `pure-before-b`, `pure-source-b`: retained original lightweight experiments. b preserves the formatted fixture before execution.
- `before`, `before-current`, `source`: exact source snapshots and candidate overlay.
- `frozen-fixtures-final`: tested portable fixture bytes.

Set BOX3D_ENGINE_ROOT to the matching engine checkout and allocate a serial Jest window. Run `python3 run-actual.py before <fresh-output-directory>` followed by `python3 run-actual.py source <another-fresh-output-directory>`. Outputs must be outside the engine checkout; existing outputs are never overwritten. The resolver never swaps a main product. It overlays selected frozen modules, retains normal dependencies from the checkout, and the runner fingerprints actually loaded source bytes.

## Not qualified

Not an integrated-main final qualification, actual World/native/WASM transaction, contact event/T15 implementation, unified consumer activation, or shared PhysicsMaterial full transaction repair. emit is not globally blocked. Direct private-table mutation, `_registerOffCallback` replacement, prototype borrowing/tampering and user subclass overrides are not an arbitrary-JavaScript sandbox. Before integration, review upstream mapping notes, compile/typecheck and rerun the portable fixture against adopted main source.
