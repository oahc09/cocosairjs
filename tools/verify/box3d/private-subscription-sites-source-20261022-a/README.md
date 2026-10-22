# B3 private physical subscription callsite candidate

Status: **205/205 final narrow controls PASS. Strict affected-source typecheck PASS. Not integrated or activated.**

Only these three complete product sources are candidates:

- `src/cocos/physics/framework/physics-material-transaction.ts`
- `src/cocos/physics/framework/components/colliders/collider.ts`
- `src/cocos/physics/framework/physics-system.ts`

The main worktree, Git, remote, production owner, kernel, primitive, public listener guards, and the independent S3 value-entry candidate were not changed. The three original source inputs were copied from the parent-supplied checkpoint `9df645b4a84e73c86ffd460b59cbd6e2ab732cbb` and are hash-bound by `input-manifest.json`. The main worktree can advance independently; the final verification compares these three exact source inputs rather than asserting that its HEAD stayed unchanged.

## Registration and source behavior

Both registration APIs accept the optional fourth argument `subscriptionMode: 'private' | 'legacy'`. Omission or explicit `undefined` selects legacy. The existing third cleanup argument is unchanged. Runtime validation and copying occur inside the existing B0 registration admission, before publication; no string coercion is permitted. Each frozen change exposes the readonly Boolean `privateSubscriptions` copied from its exact private registration entry, not from a public property, selector, phase, material listener count, or getter-based owner lookup.

This is a trusted owner capability, **not an exemption from public-phase or mutation rules**. Future producers may select private only after establishing the exact generation's physical roster. This candidate does not establish that roster and does not migrate already-installed legacy public-table listeners. Initial generation wiring and exact physical release remain production-owner/native responsibilities.

Only a present transaction with `privateSubscriptions === true` skips the original physical asset `on/off` statements and their `listener-edit-entered` / `listeners-complete` facts. It does not remove user subscriptions or call `removeAll`. Original clone allocation, `acceptClone`, actual `_material` write, shared-flag position, exact commit reader, and truthful cache-write facts remain in their existing order. System and Collider do not discover owners through property getters.

Each private Collider path creates or preserves the observed-assets Set using a null identity before preparation. Fresh private generations retain no public asset listener identities. The Set selects the existing independent destruction/cleanup-report branch, including after early preparation failure. It is not physical ownership proof, does not release native membership, and does not discard a pre-existing legacy Set. `onDestroy` itself is byte-for-byte unchanged.

With the copied flag false, constant folding only the added capability branches restores the entire original Collider and System ASTs. No-observer paths retain the original code, including backend-specific read/write order. T15 remains unsupported. No lease is temporarily removed and no phase is forced idle.

## Evidence and limitations

- `evidence/run-a/results.json`: 160/160 PASS, first actual-source control set.
- `evidence/run-b/results.json`: 205/205 PASS, expanded controls before tool formatting.
- `evidence/run-c/results.json`: final 205/205 PASS, after formatting, with complete exact TypeScript input and emitted JavaScript snapshots for both variants.
- `evidence/typecheck-a/result.json` and `evidence/typecheck-b/result.json`: zero diagnostics with `strict: true`. These check the complete candidate transaction, frozen observer and guard, plus nine byte-exact affected Collider/System source slices against controlled surrounding declarations. They do **not** typecheck the full SDK.
- `evidence/legacy-structure.json`: complete-file AST equality after folding the new capability to false. Original Collider public event methods, destruction implementation, and all unrelated code remain unchanged.
- `*.stdout.txt`, `*.stderr.txt`, `*.exitcode`, and `*.receipt.json`: issued validation commands and raw results. Early receipts were reconstructed from the exact issued argv and retained raw files; they explicitly omit unavailable subprocess timestamps. No failed control or typecheck run was discarded; all runs passed. A separate attempted optional read-only review could not start because the agent-thread limit was reached; no review result is claimed.
- `candidate.patch`: only the three candidate source changes.
- `validation.json`, `closure-manifest.json`, and `closure-verification.json`: input/source/main-byte, final-run, scope, and retained-artifact checks.

The runtime harness loads **complete actual source** for the transaction, observer, mutation guard, Collider, System, Eventify, and CallbacksInvoker. Component/engine infrastructure, material assets, owner callbacks, physical membership, shape, and native effects are explicit doubles. This is actual-entry-source / protocol preparation, not actual World/native/WASM evidence.

Controls cover:

- Original versus candidate no-observer, omitted-mode, and explicit legacy paths, including public on/off failures, same/null identities, exact cache/id access traces, both Box3D and non-Box3D fallback order, and falsy runtime inputs.
- Private public-on/off getter/function throws cannot block cache writes; no false listener facts; user public listeners remain callable.
- Clone acceptance precedes its one exact cache assignment; shared flag remains true at that write and becomes false at its original later point. Rejected clone coefficients and throwing cache writes do not fabricate cache-written facts.
- Late onLoad registration, early preparation failures, independent destruction event-clear/adapter/bounds/report attempts, and retained mock physical membership after a throwing mock native destruction.
- Exact `undefined`, `null`, `false`, `0`, and empty-string primary failures at owner open/preflight/commit, native application, clone cache assignment, and independent destruction, despite secondary cleanup failures.
- Frozen/readonly registration capability, invalid mode rejection without coercion, preserved third-argument cleanup copying, registration reentry rejection, and no selector lookup in observed private set/default operations.

All **2,128 formal cells remain NOT_RUN**; all nine Gates remain unpassed. `realProducers = NOT_INTEGRATED`, `staged = false`, `unified = false`. No all-owner or mixed-backend completeness, real physical teardown, actual engine build, or full-Gate claim is made.

## Reproduction

Run from this candidate directory, using the existing main-tree toolchain read-only. Choose new output names instead of replacing evidence:

```
python3 run.py fresh-controls node controls.cjs evidence/fresh-controls
python3 run.py fresh-typecheck node typecheck.cjs evidence/fresh-typecheck
python3 run.py fresh-structure node verify-legacy-structure.cjs
```

No dependencies are installed and no SDK/native build is performed. `prepare.py` and `expand-controls.py` retain the original preparation transformations for audit, but should not be rerun over the delivered candidate. New owned source/tooling retains MIT 2026–2027 attribution; extracted source retains its original license and formatting. Existing Prettier configuration is used only on the owned transaction/tooling and this document, not to reformat upstream Collider/System.
