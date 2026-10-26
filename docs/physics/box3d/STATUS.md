# Box3D closure status

Updated: 2026-10-26 23:46 UTC+8. Branch: `feat/box3d-rebuild-20261022`.

## Current outcome

- Project: **NOT COMPLETE**. Original 35-task / 91-category / 9-example / G0–G8 scope remains.
- C20 APP: **FAIL, 0/100 qualified**. Latest executed SDK227 capture has three complete diagnostic snapshots, but released world ledger remains 112980 versus initial 36040. No later production run has superseded it.
- C20 lowlevel: observed 100×50 native subset passed; full global world/all-handle census remains NOT_QUALIFIED.
- SDK227 and historical full raw bundles were generated and reported, but their former temporary workspace copies are unavailable. Repository reports remain; do not treat old absolute paths as present artifacts.

## Tonight's checkpoint sequence

1. `4af73894a2dad78994c89121e832791fc2d6d8fe`: Chinese local handoff at `delivery/local-handoff-20261026.md`.
2. `6b31b113b6d9f1ec4d15223635d114d70458af4e`: rebuilt isolated identity core patch and exact source staging. 11 source CPU plus 13 model tests passed. This is new reconstructed code, not restoration of lost historical manifest `42c3dad...`.
3. The accompanying identity qualification sources add a real native fixture, non-OK step adapter subset, exact control/candidate comparison, and enforced Debug/no-NDEBUG guards. **Source preparation is not native execution.** Current expected native count is 170, control count 4; historical 171 is not reused. The actual runtime ledger delta 36 remains NOT_RUN until measured.

Production `versions.lock.json`, production patch lock, facade, SDK schema and original strict fixture remain unchanged. Do not load the isolated candidate using the production 87-row diagnostic schema. Trim and the app release hook are not enabled.

## Next actions, in order

1. Verify the current checkout and preserve local changes. Establish one writer before local implementation begins; cloud and local must not write the same module concurrently.
2. Run the isolated identity source controls; build control and candidate in fresh directories with a verified supported toolchain. Require single-config Debug and actual compile-command checks with effective NDEBUG forbidden. Run the full native fixture and exact comparison, preserving any failures.
3. Only after identity/fault/teardown correctness is actually established, implement same-world empty-storage reclamation and event acknowledgement under `empty-world-trim-design.md`.
4. Integrate the production bridge/backend fault state, fixed metadata accounting row/schema and exact producer inventory. Preserve allocator, ID, stale-view and close semantics; do not replace the world or reset its step index.
5. Integrate the post-scene-destruction, post-cleanup release hook. Legal nonempty persistent worlds skip empty trimming; an eligible-empty failure must not produce a successful restoration receipt.
6. Build a fresh production ST/SDK/DTS cohort; run the original same-app/world 100-scene strict fixture without warmup/rebaselining. Complete full census and remaining original matrix/examples/gates.

## State rules

Record implementation and validation separately: SOURCE_ONLY, VERIFIED_LIMITED, FAIL, BLOCKED, DONE. A candidate may be committed to protect code while remaining SOURCE_ONLY and NOT_INTEGRATED. No native PASS, build-number reuse or whole-project progress percentage may be inferred from source tests.

For each next run record source/runtime/fixture identities, command, limits, stdout/stderr, exit and process-tree closure, before/after input hashes and artifact hashes. Use a new attempt directory; never overwrite a failed one. Keep code and tests in Git promptly, and store large artifacts only at an authorized persistent destination.

The Chinese handoff is an immutable time-of-handoff explanation; use this status and subsequent verified commits to identify later changes. The full task contract remains authoritative; this status does not reduce scope.
