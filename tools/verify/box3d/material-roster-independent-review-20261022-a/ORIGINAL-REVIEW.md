# Independent frozen S1 material-roster review

## Scoped verdict

**BLOCKED: one confirmed protocol-level fail-stop defect.** This verdict applies only to the frozen original candidate source SHA-256 `382c459f2116383d9acd7eddec737d7a9dd213f5a2c1371475aa024020666cd4`. It is not an actual Cocos/World/WASM/native security qualification. The original candidate and main product tree were not edited.

The original 44 controls were independently recompiled and rerun, not accepted from the author's prior PASS report. They pass. Thirteen additional boundary controls and six focused phase controls also pass. One newly authored minimal regression fails against the unchanged original, with raw exit 1 preserved. No second independent blocker was found within these tested protocol boundaries.

## R1: no-change owner actual commit is not classified as an effect

Severity: high for the stated S1 fail-stop contract; no actual-engine exploit claim.

Source: `inputs/src/physics-material-values-transaction.ts:776–778`, and catch gate at 862–869. `effectsEntered` is set for source writes, native calls, adapter/cache commits and public emit, but not before the owner `commit` callback.

A scalar no-change transaction (`changed:false`, `writeOnNoChange:false`) still invokes every owner's actual-commit callback. Those callbacks are the effectful commit phase, unlike the explicitly read-only `prepare` callbacks. The regression uses two ordinary owner delegates. Owner 1 records its accepted sequence and returns. Owner 2 records its accepted sequence and throws `null`. Scope disposal succeeds independently.

Observed facts from `evidence/frozen-nochange-commit-red.json`:

- Original `null` remains the primary failure.
- `committedOwners=1`, `faultAttemptedOwners=0`.
- Both exact owner-generation leases remain `state:"live"`.
- A subsequent changed transaction on the same original owners succeeds and invokes two native setters.

Therefore a partially applied/uncertain owner-commit phase leaves execution authority reusable. This contradicts design D4: any failure after a JS/native effect faults all original participants. The assertion requiring two faults fails (`0 !== 2`). This does not depend on impure preparation or on fabricating a real World.

Required repair direction: classify entry to owner actual commit as an effect before calling it. Preserve per-owner entered/returned facts independently from a subsequent registry/latch check, just as native returns and adapter-cache returns are separately recorded. Failures must fault/revoke all original owners even for scalar no-change. The frozen original is intentionally not repaired here.

## Additional boundary observations

Thirteen controls in `reviewer-controls.cjs` independently exercise:

- No-owner fast path across source-copy/write/emit/dispose callbacks, including unreadable Proxy asset identity.
- Every owner scope admitted before source property access; later partial-open failure cleans both entered scopes.
- Caught cross-asset reentry during owner preparation prevents all cache/native effects.
- Wrong receiver for ticket diagnostics poisons the exact live ticket, and repeated prepare cannot reuse authority.
- Membership publish compares exact Proxy identity without coefficient/property reads or coercion.
- All six three-pending cancellation/publication orders retain same-owner reservation groups.
- Releasing one owner with multiple pending assets does not erase another owner's pending ownership.
- Unknown teardown with pending-only ownership remains a blocker after a newer generation is later released.
- Native setter normal return remains `returned` when a subsequent caught-reentry latch aborts; unentered verification stays distinct.
- Verification normal return remains `verified` when its caught-reentry latch aborts; owner cache is still unentered.
- Every falsy primary survives actual-read, fault-reporter and independent cleanup failures.
- An expired cache recorder cannot increment write counters or replay native effects.

Six controls in `phase-controls.cjs` additionally establish:

- Owner prepare return followed by a throwing native-plan getter remains pre-effect: no material writes/native calls; all entered scopes cleaned; owners remain live. This relies on the documented read-only preparation contract.
- Owner prepare returning after caught registry reentry is refused before effects, with clean scope release.
- Disposal throwing after the artificial delegate's actual scope release is conservatively unresolved and faulted; no retry is inferred from the delegate's internal action.
- Disposal returning normally after caught registry reentry during a changed transaction retains completed-cleanup facts and faults the transaction.
- Adapter `commitCaches` returning normally after caught reentry retains `returned`, stops later owners and faults all participants.
- Adapter cache write then throw retains `entered-unknown`, preserves native returned/verified facts, stops later owners and faults all participants.

No claim is made that arbitrary trusted callbacks are sandboxed, that real current-singleton binding rules were exercised, or that caller-provided release/publication assertions are independently authenticated by this pure module.

## Exact reproduction and preserved evidence

From this directory run:

`python reproduce-original.py`

This uses only the already installed Node v24.19.0 and TypeScript 4.9.5 at `/workspace/scratch/62d43a81bbde/box3d-rebuild-20261022/node_modules/typescript/bin/tsc`. No install, package resolution, external network, full build or main-tree modification is needed.

`evidence/frozen-run.json` records exact argv, working directories, exits and raw logs for all five subprocesses. The runner itself returns 0 only if compilation, original 44, additional 13 and phase 6 exit 0, and the original RED exits exactly 1. The RED is not relabeled PASS: the wrapper merely verifies its expected reproduction.

Original input source, original control suite and candidate/design README bytes are retained under `inputs/`. Review controls and the minimal RED are separate authored files. `original-review-manifest.json` freezes this original review's explicit payload set; any later repair-review directory is a separate scope and is not retroactively part of this original verdict.

Formal required cells remain **2,128 NOT_RUN**. No Gate promotion, producer activation, staged/unified activation, S2/S3/S4 clearance or actual-world ownership claim follows from these controls.
