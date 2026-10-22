# S1 private PhysicsMaterial value roster candidate

Status: **ISOLATED PURE-PROTOCOL CANDIDATE ONLY; NOT ENGINE-INTEGRATED.**

This directory contains one standalone TypeScript implementation and one Node control suite. It changes no engine source, Git state, native input or external service. The lead is independently editing the main checkout; this document does not claim that checkout remains unchanged. The initial reference snapshot observed HEAD `9df645b4a84e73c86ffd460b59cbd6e2ab732cbb`.

## Result and limits

- `src/physics-material-values-transaction.ts`: no imports, no default/global instance and no public-barrel integration.
- `controls.cjs`: 44 isolated pure-protocol controls pass at attempt E. The final frozen rerun is separately recorded in `evidence/final-run.json`.
- The first compile was RED (eight TypeScript errors). A later adversarial run was RED (two independent pending-reservation failures). Both original source/control/compiled bytes and raw logs are retained, not replaced by the repaired result.
- No real Cocos entrypoint, real WASM, browser, native resource teardown, real two-live-world ownership or complete mixed-backend ledger was established by these controls. The owner's test delegates are explicitly artificial. Independent owner records exercise only the registry protocol.
- Formal required cells remain **2,128 NOT_RUN**. No Gate is promoted. Producers remain NOT_INTEGRATED, staged/unified activation remains false. This candidate cannot clear S2/S3/S4 or shared-all-owner activation.

## Concrete interfaces

`registerOwner(identity, generation, delegate)` copies six trusted callbacks once and returns a receiver-bound lease. Identity generations must strictly increase after terminal close. A faulted or still-live generation cannot be silently replaced.

`lease.prepareMembership({binding, before, after, role, initialized})` prepares exact object-identity metadata and a one-use capability. It protects both the old and candidate assets. It calls the copied `admitAsset` hook without reading coefficients; the actual engine owner must reject Destroyed/ToDestroy assets there. The original identity transaction later calls `publish(actualAsset)` at its actual private cache commit. A wrong identity cannot publish. A candidate known not accepted can be cancelled. Pending preparation is never an executable recipient. `initialized:false` is a provisional destroy-blocking binding.

Prepared owner groups and pending-owner refcounts exist before publication. Publication uses prevalidated private Map/Set metadata only: no observer callback, native call, coefficient getter or B0 register/dispose. It publishes the new record before retiring the old. Multiple pending bindings share reservation accounting, so cancelling one or retiring a last live binding cannot erase another prepared group.

This deliberately does not extend the existing `PhysicsMaterialTransactionRegistry` single-target delegate map. The current B0 and identity/system-control files are preserved in `inputs/product/`. Integration must prepare membership outside B0 callback publication; it must not weaken B0's public reentry guard. The standalone registry cannot detect whether arbitrary trusted integration code is currently inside a different B0 registry's callback.

`begin(asset)` returns `undefined` immediately for a truly unobserved asset, including inside another observed material's notification. It does not read asset properties or a source. Existing pending, blocker or tombstone records are not mistaken for no ownership. Existing-roster reentry latches and aborts the outer operation even when its inner error is caught.

`ticket.prepare(source)` opens exactly one scope per owner generation, with all that owner's binding identities, before copying any source callback or coefficients. It validates the full tuple, copies callbacks and plans once, and calls all owner preparations before allowing cache/native effects.

The tuple is `[friction, restitution, rollingFriction, spinningFriction]`. Accepted JS numbers are retained. The native tuple is a separate frozen float32 copy. Inputs must be primitive finite numbers representable as finite float32; friction/restitution cannot be negative, rolling/spinning must be zero. Restitution is not capped at one. The original callsite must supply scalar `math.equals` versus setValues exact-change semantics and reorder public setValues arguments. `changed:false, writeOnNoChange:false` preserves the prior tuple, including scalar approximately-equal candidates; `writeOnNoChange:true` still executes the original four assignments without native work or public emit.

Each owner's `prepare(context, copied)` receives the complete same-asset owner roster and returns:

- `native: [{ target, invoke, verify }]`, where each invoke is exactly one native setter and verify throws on failed readback.
- `commitCaches()`, a previously prepared adapter/default/geometry-cache commit.

The registry rejects repeated native target object identities across the entire prepared batch, including different owners. An inactive/default-empty plan has `native: []`, which produces no native committed fact. All plan callbacks are copied before effects. Prepare must perform all shape membership/liveness/current world checks and every required native read, and must not mutate. These are trusted-owner obligations, not sandbox guarantees.

`ticket.apply()` accepts no new values, callbacks or plan. It is receiver-bound and single-use, and executes the copied plan under the original barriers:

1. Original actual-private-cache writer, with a receiver/context-bound recorder called immediately after each assignment.
2. Every copied exact native operation, consumed before call; state is `not-entered` → `entered-unknown` → `returned`. Readback separately records `not-entered` → `entered-unknown` → `verified`.
3. The corresponding owner's prepared cache commit, with separately recorded entered/returned state. This S1 interface commits the owner cache group after that owner's whole native group; it does not provide per-binding cache rollback or imply identity acceptance.
4. Original public notification once, after private success.
5. Independent actual-private-cache read, owner actual commit and independent scope cleanup.

A partial setter failure stops remaining native work, never replays or reverses it, and faults/revokes every original participating owner. An exact setter return remains recorded even if readback, adapter cache, public notification or owner commit then fails. Falsy original errors, including undefined/null/0/false/empty string, survive reporter and cleanup errors. Each entered open is disposed once, even a throwing partial open; cleanup errors remain inspectable and cannot hide other owners' cleanup. Diagnostics contain no native target objects or execution/release capabilities.

`lease.close('released')` consumes an independently established successful native teardown fact, then releases only that exact generation's binding/pending metadata. It does not perform teardown. `close('unknown')` revokes execution but retains old and candidate tombstone references. Repeated close cannot retry or turn unknown into released; resolution of uncertain native teardown is outside S1. Faulted owners can close after separately verified release, but cannot execute again first. `assertDestroyable(asset)` refuses live/provisional/pending/tombstone ownership and otherwise leaves the original destroy path available.

## Required integration work, not supplied here

- Actual PhysicsMaterial five entrypoints must provide original private-field readers, original comparison/write order and original emit call. No-owner branches must remain unchanged.
- Original Collider/System identity sites must establish complete lifecycle records. Public listener removal/manual emit must neither release nor execute this roster. This module alone proves neither removal of old public physics callbacks nor complete legacy backend observation.
- Actual owner.open must reject foreign/stale singleton binding and active phases without enabling, resuming or consuming scheduling/commands. Two independent test owners do not relax that rule.
- Actual owner.prepare must enumerate default/inherited, explicit and inactive consumers for the asset, validate all shapes before any setter, preallocate adapter caches and retain its own exact private execution authority. This generic registry neither sees nor authenticates native handles. Trusted callbacks must not leak executable native closures.
- Whole-owner cache commits are conservative. Any finer-grained cache ledger must record its actual facts rather than infer them from this grouped return.
- The main world's separately developed prepared native kernel is not imported, fingerprinted or tested by this directory.

## Evidence and reproduction

`input-manifest.json` binds original bytes of the 13 reference inputs saved under `inputs/`. Their snapshot hashes, not the evolving main checkout, define this candidate's reference baseline.

Historical runs:

- `evidence/tsc-attempt-a.log` + `evidence/source-attempt-a.ts`: original compile RED. This first shell pipeline did not use pipefail; its apparent shell status was not the compiler status. The raw diagnostics are retained and are explicitly RED.
- `evidence/attempt-b-inputs/`, `controls-attempt-b.*`: 38/38 pure controls, compile clean.
- `evidence/attempt-c-inputs/`, `controls-attempt-c.*`: 41/41 controls.
- `evidence/adversarial-c-red-inputs/`, `controls-adversarial-c-red.*`: 42 passed, 2 failed, exit 1; pending-owner group reservation loss.
- `evidence/attempt-d-inputs/`, `controls-attempt-d.*`: repaired reservation lifetime, 44/44 controls.
- `controls-attempt-e.*`: counter-based reservation metadata, 44/44 controls.
- `evidence/final-inputs/`, `evidence/final-run.json`, `evidence/final-*.log`: frozen-source final independent rerun and exact commands/exits.

The final runner uses the existing checkout's read-only Node/TypeScript/Prettier installation. Nothing was installed and no full engine build/clone ran. The full external compiler/Node implementation is not vendored here; `evidence/tool-versions.log` records observed versions. Closure verification covers authored source, saved reference-source inputs, retained historical inputs, compiled outputs and evidence references, not a claim of hermetically bundled tooling.

`closure-manifest.json` lists every payload file's byte count and SHA-256. `verify-closure.py` verifies all payloads and every input-manifest snapshot reference and refuses unlisted payload files/symlinks. `closure-verification.json` and its log are intentionally outside the self-hash set. They also report whether original source paths still match their captured bytes, without relabeling changed upstream paths as the original baseline.
