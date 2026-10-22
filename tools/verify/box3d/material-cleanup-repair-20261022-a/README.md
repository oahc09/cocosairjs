# B1 cleanup repair: limited source handoff

## Final result

Four product files only. New typed reporter 39/39 pure controls, actual engine/AIR with explicit mock binding 10/10 cases / 45 checks, unchanged old bridge 36/36 and B1 12/12 / 54 checks pass. Strict tsc passes. No native/WASM execution, SDK build, Git write, public activation or B3 subscription-integrity claim. Parent owns separate real-WASM qualification.

`after.json` pins four final files; `product.diff` compares the immutable four-file `before/`. Final source snapshots and seven-input hashes are `../material-cleanup-evidence-20261022-green-b/inputs/` and `inputs.json`, with exact after hashes. Loaded-engine closure hashes in the actual-engine raw are sampled at completion, not a claim of full-closure before/after verification. Fifty N4 native input hashes remain identical in `native-inputs-readonly.json`.

## Product changes

- Typed bridge: optional cleanup observer registration, copied callback plus safe generation, one capture per registration generation, completion consumed before caller getters, copied stage/raw error only, frozen report, separate copy/delivery failure presence and raw identity. `inspectPhysicsMaterialCleanup(target)` remains reachable after unregister. Weak target maps retain only latest reporter and accepted generation, not a strong target history. Per-target next generation is independent of world/preparation lifetime; exhaustion rejects before registration. Completion has no material/native/phase authority. No B0 changes.
- Collider: capture before any teardown; attempt event listener clear, all still-uncertain subscribed assets, adapter teardown and bounds destruction independently; submit report once in finally. Original first cleanup throw, including undefined/null/0, wins over reporter failure. Report failure itself stays queryable. Successful previous.off immediately retires that asset. Candidate is retained immediately before on; failed off retains old; failed on retains candidate. Arbitrary overridden off that lies about unsubscribing is not certified by this bookkeeping.
- Owner: leaf cleanup errors are separately readable, including candidate guards and both scope guard kinds. A business/preflight first error is retained before disposing. Collider post-release reporting reaches the original owner without reviving its lease. Cleanup failure does not imply native teardown success. Diagnostic error retention is bounded to 4096 leaf entries plus an explicit omitted count.
- World: typed `failure={hasFailure,error}` is sticky and distinguishes throw undefined from no failure. Teardown/native-destroy/owner-cleanup errors have independent presence and raw identity; original destroy-failed retry/resource retention behavior is kept. Material/step finally cleanup does not overwrite or rethrow in place of an earlier error. Dispatch scope cleanup now faults World consistently with Owner. Compatibility string fields are supplementary, not authoritative identity.

## Evidence history, never overwritten

- Existing `material-cleanup-evidence-20261022-red-a` / `red-b` and earlier integration-a are unchanged. red-a had fixture errors; red-b had three actual-source/mock cleanup REDs. This delivery does not reinterpret those as native bugs.
- Reporter a: 30/30 behavior controls, tsc failed due missing parameter annotation and object narrowing. b: parameter annotation fixed, two narrowing errors remained. Both total FAIL and original snapshots/raw retained.
- Reporter c: 30/30 + tsc/format PASS for its then-finite scope.
- Reporter d-red: Proxy array invalid length cases, 31/37 passed, six real pure-input failures; Infinity already rejected. d-green: safe integer [0,4096] precheck, 37/37 PASS.
- Reporter e: per-target independent generation and exhaustion controls, 39/39 PASS; final bridge identity.
- Actual-engine green-a: 7/7 behavior controls passed, tsc TS2367 failed; overall not PASS. Source snapshots preserved. green-b resolves that type narrowing, adds same actual System/new registration, step-failure cleanup and dispatch-failure controls; 10/10 and tsc PASS.
- Old 36/12 controls rerun unchanged at `../material-cleanup-regression-20261022-a/` on final four source bytes. Native input inspection initially assumed a mapping rather than the actual list, produced no output/mutation; the helper error is retained separately.

The new GREEN collector intentionally expects three Collider cleanup calls after a successful old.off: event clear, candidate.off, adapter. The former old asset is retired, not silently skipped. Original RED's four-call trace is preserved. Likewise the new control checks all three leaf disposal errors in Owner diagnostics, rather than requiring B0 to duplicate them in its aggregate secondary list; B0 is unchanged.

## Commands and outputs

All commands run from repository root. No existing raw file was overwritten.

- `node tools/verify/box3d/material-cleanup-reporter-control.mjs tools/verify/box3d/material-cleanup-reporter-evidence-20261022-e`: exit 0. The result JSON records its exact format/strict tsc argv, stdout and exit codes. Earlier a/b/c/d-red/d-green use the identical output-directory convention and retain each runner/source copy.
- `node node_modules/typescript/bin/tsc --noEmit -p tools/verify/box3d/material-cleanup-control-green.tsconfig.json`: exit 0; `../material-cleanup-evidence-20261022-green-b/tsc.raw.txt`.
- `BOX3D_CLEANUP_GREEN_RAW=tools/verify/box3d/material-cleanup-evidence-20261022-green-b/raw.json node node_modules/jest/bin/jest.js --config tools/verify/box3d/material-cleanup-control-green.jest.cjs --runInBand`: exit 0; sibling `jest.raw.txt` and `raw.json`.
- `node tools/verify/box3d/physics-material-transaction-control.mjs tools/verify/box3d/material-cleanup-regression-20261022-a/bridge36`: exit 0.
- `BOX3D_B1_RAW=tools/verify/box3d/material-cleanup-regression-20261022-a/b1-raw.json node node_modules/jest/bin/jest.js --config tools/verify/box3d/material-identity-b1-control.jest.cjs --runInBand`: exit 0.
- `node node_modules/typescript/bin/tsc --noEmit -p tools/verify/box3d/material-identity-b1-control.tsconfig.json`: exit 0.

New-source formatting preceded qualification. Extracted Collider retains original header/layout; no whole-file reformat. Original mocks, loader, facade, native, System, shared-body, shape, existing collectors and source-map metadata were not edited. No new source is exported by a public barrel.
