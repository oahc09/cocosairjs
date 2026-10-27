# Box3D closure status

Updated: 2026-10-27 10:02 UTC. Branch: `feat/box3d-rebuild-20261022`.

## Current outcome

- Project: **NOT COMPLETE**. Original 35-task / 91-category / 9-example / G0–G8 scope remains.
- Latest historically reported strict C20 APP result: **APP228 FAIL, 0/100 qualified**. Release was refused by the owner ACK guard; reviewed source ordering places that refusal before native trim, not an independently measured call count. Released ledger113036 versus initial36096. Its raw and uncommitted report are now unavailable, so this is historical reporting, not a current raw revalidation. Earlier published SDK227 FAIL remains unchanged. See [environment recovery note](reports/environment-recovery-20261027.md).
- C20 lowlevel: observed 100×50 native subset passed; full global world/all-handle census remains NOT_QUALIFIED.
- Environment reset: old temporary workspace is absent. Published source and SDK228 reports are recoverable from Git; APP228 raw, SDK229/ST/ESM/DTS original artifacts and unpublished report/runner candidates are **UNAVAILABLE**. SDK229 ST/ESM/DTS passed and were reviewed according to prior conversation reports, not a current replay. **APP229 NOT_RUN; new SDK230 ST/ESM/DTS fresh chain now VERIFIED_LIMITED.** A persisted build counter229 does not replace artifact evidence.

## Tonight's checkpoint sequence

1. `4af73894a2dad78994c89121e832791fc2d6d8fe`: Chinese local handoff at `delivery/local-handoff-20261026.md`.
2. `6b31b113b6d9f1ec4d15223635d114d70458af4e`: rebuilt isolated identity core patch and exact source staging. 11 source CPU plus 13 model tests passed. This is new reconstructed code, not restoration of lost historical manifest `42c3dad...`.
3. The accompanying identity qualification sources add a real native fixture, non-OK step adapter subset, exact control/candidate comparison, and enforced Debug/no-NDEBUG guards. **Source preparation is not native execution.** Current expected native count is 170, control count 4; historical 171 is not reused. A subsequent independent host-native run of producer `f66809c1d9bc8351e130bc07bd4dc1926de6fcdc` passed candidate170/control4: initial ledger37440→37476 (+36 embedded bytes), tracked module bytes returned to0 after close, Debug/no-NDEBUG actual commands verified, ECHILD and no input drift. See [host qualification report](reports/identity-host-qualification-20261026.md). This is VERIFIED_LIMITED host evidence, not WASM or production integration.

4. `f55843f6add3b21fec2858080814d78a8d0168be`: isolated empty-storage core candidate. Fresh host attempt 2 passed 3661 candidate assertions, 2 identity-only control assertions and the separate expected fatal-OOM SIGABRT contract; 100 same-world core cycles, creation-capacity ledger delta +20 bytes, isolated close tracked bytes 0, no source drift and this attempt ECHILD. Attempt 1 remains UNKNOWN_TRANSPORT_INTERRUPTED without closure proof; it is not relabelled. See [empty-storage host report](reports/empty-storage-host-qualification-20261027.md). This does not qualify the original APP C20 or production/WASM integration.

5. `fb825da65c8cd259ee8912adb24b7caaa0a64b6a`: production source integration plus CMake v2 route fix. Fresh ST attempt3 passed full41-command/111-input/85-unit/58-evidence build→audit→consumer gates, including controlled storage51 and production-WASM12 checks. Earlier ST source failure and supervisor failure are retained separately, both closed; the older host attempt1 remains UNKNOWN. See [ST qualification report](reports/empty-storage-st-qualification-20261027.md).

6. The same `fb825da65c8cd259ee8912adb24b7caaa0a64b6a` producer now has fresh SDK228 ESM plus declarations: one successful full28-feature bare Node24 build advanced227→228, 23ESM files/995map sources; fresh emit, three fixtures and three strict consumers passed7/7, two declarations promoted exclusively. Final25files/43784478B, both process trees closed and all protected inputs unchanged. See [SDK228 build/declaration report](reports/sdk228-build-and-declarations-20261027.md). This is VERIFIED_LIMITED build evidence, not APP qualification.

7. `14073d7f05539e23a7367dd35ff52996758110fe`: owner ACK fix preserves only the exact world/System default-material registration capability; all other ownership guards remain. `80be38bce03528d4ba7f445481ce35a6da78de83` persists the completed build counter229. The subsequent historical SDK229 passes and APP229 NOT_RUN are distinguished from unavailable original bytes in the [new recovery note](reports/environment-recovery-20261027.md); this is not restoration of the old report candidates.

8. `80be38bce03528d4ba7f445481ce35a6da78de83`: restored current inputs and completed a fresh SDK230 chain. ST attempt1 remains FAIL due to49 generated compiler pyc; independently verified official-source caches were frozen into a new baseline and ST attempt2 passed41/111/85/58 plus controlled storage51/production-WASM12, ECHILD and0drift. One bare full28-feature ESM advanced229→230; fresh DTS emit/3fixtures/3strict consumers passed7/7. Final25files/43796288B. See [SDK230 report](reports/sdk230-build-and-declarations-20261027.md). APP230 is NOT_RUN at this build-report cutoff; these artifacts do not resolve APP/C20 acceptance.

Production source now includes the five-patch core, explicit identity/creation-capacity metadata and new89-row/756-word diagnostic schema; old87-row consumers are incompatible. The published ST/SDK228 reports record VERIFIED_LIMITED qualification; historical SDK229 execution was also reported as passing. Their former temporary artifacts must not be assumed present after reset. None of these build results proves the original strict APP release integration, which still requires its separate successful live run. No original APP fixture, baseline or threshold was changed.

## Next actions, in order

1. Verify the current checkout and preserve local changes. Establish one writer before local implementation begins; cloud and local must not write the same module concurrently.
2. Preserve the committed host/ST/SDK228 reports and their recorded qualification boundaries. Distinguish those recovered report bytes from unavailable temporary raw/artifacts; do not claim an absent cohort was replayed. New SDK build/declarations require fresh evidence, separate from APP qualification.
3. Preserve the limited host verification of same-world empty-storage reclamation and explicit event acknowledgement. Establish production caller quiescence, borrowed-view retirement and binding revision before integration under `empty-world-trim-design.md`; private injected event records are not APP dispatch evidence.
4. Verify the integrated production bridge/backend fault state, fixed metadata accounting row/schema and exact producer inventory. Preserve allocator, ID, stale-view and close semantics; do not replace the world or reset its step index.
5. Verify the integrated post-scene-destruction, post-cleanup release hook. Legal nonempty persistent worlds skip empty trimming; an eligible-empty failure must not produce a successful restoration receipt.
6. Preserve the new SDK230 fresh ST/ESM/DTS cohort and retained original receipts; do not reuse unavailable SDK229 artifacts or PASS identities. After the separate current runner/input lock is ready, run the original same-app/world 100-scene strict fixture without warmup/rebaselining. Complete full census and remaining original matrix/examples/gates.

## State rules

Record implementation and validation separately: SOURCE_ONLY, VERIFIED_LIMITED, FAIL, BLOCKED, DONE. A candidate may be committed to protect code while remaining SOURCE_ONLY and NOT_INTEGRATED. No native PASS, build-number reuse or whole-project progress percentage may be inferred from source tests.

For each next run record source/runtime/fixture identities, command, limits, stdout/stderr, exit and process-tree closure, before/after input hashes and artifact hashes. Use a new attempt directory; never overwrite a failed one. Keep code and tests in Git promptly, and store large artifacts only at an authorized persistent destination.

The Chinese handoff is an immutable time-of-handoff explanation; use this status and subsequent verified commits to identify later changes. The full task contract remains authoritative; this status does not reduce scope.
