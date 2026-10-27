# Box3D closure status

Updated: 2026-10-27 05:32 UTC. Branch: `feat/box3d-rebuild-20261022`.

## Current outcome

- Project: **NOT COMPLETE**. Original 35-task / 91-category / 9-example / G0–G8 scope remains.
- Last published strict C20 APP result: **FAIL, 0/100 qualified**. SDK227 capture has three complete diagnostic snapshots, but released world ledger remains 112980 versus initial 36040. The SDK228 build evidence below does not supersede this APP verdict; fresh APP execution is recorded separately.
- C20 lowlevel: observed 100×50 native subset passed; full global world/all-handle census remains NOT_QUALIFIED.
- SDK227 and historical full raw bundles were generated and reported, but their former temporary workspace copies are unavailable. Repository reports remain; do not treat old absolute paths as present artifacts.

## Tonight's checkpoint sequence

1. `4af73894a2dad78994c89121e832791fc2d6d8fe`: Chinese local handoff at `delivery/local-handoff-20261026.md`.
2. `6b31b113b6d9f1ec4d15223635d114d70458af4e`: rebuilt isolated identity core patch and exact source staging. 11 source CPU plus 13 model tests passed. This is new reconstructed code, not restoration of lost historical manifest `42c3dad...`.
3. The accompanying identity qualification sources add a real native fixture, non-OK step adapter subset, exact control/candidate comparison, and enforced Debug/no-NDEBUG guards. **Source preparation is not native execution.** Current expected native count is 170, control count 4; historical 171 is not reused. A subsequent independent host-native run of producer `f66809c1d9bc8351e130bc07bd4dc1926de6fcdc` passed candidate170/control4: initial ledger37440→37476 (+36 embedded bytes), tracked module bytes returned to0 after close, Debug/no-NDEBUG actual commands verified, ECHILD and no input drift. See [host qualification report](reports/identity-host-qualification-20261026.md). This is VERIFIED_LIMITED host evidence, not WASM or production integration.

4. `f55843f6add3b21fec2858080814d78a8d0168be`: isolated empty-storage core candidate. Fresh host attempt 2 passed 3661 candidate assertions, 2 identity-only control assertions and the separate expected fatal-OOM SIGABRT contract; 100 same-world core cycles, creation-capacity ledger delta +20 bytes, isolated close tracked bytes 0, no source drift and this attempt ECHILD. Attempt 1 remains UNKNOWN_TRANSPORT_INTERRUPTED without closure proof; it is not relabelled. See [empty-storage host report](reports/empty-storage-host-qualification-20261027.md). This does not qualify the original APP C20 or production/WASM integration.

5. `fb825da65c8cd259ee8912adb24b7caaa0a64b6a`: production source integration plus CMake v2 route fix. Fresh ST attempt3 passed full41-command/111-input/85-unit/58-evidence build→audit→consumer gates, including controlled storage51 and production-WASM12 checks. Earlier ST source failure and supervisor failure are retained separately, both closed; the older host attempt1 remains UNKNOWN. See [ST qualification report](reports/empty-storage-st-qualification-20261027.md).

6. The same `fb825da65c8cd259ee8912adb24b7caaa0a64b6a` producer now has fresh SDK228 ESM plus declarations: one successful full28-feature bare Node24 build advanced227→228, 23ESM files/995map sources; fresh emit, three fixtures and three strict consumers passed7/7, two declarations promoted exclusively. Final25files/43784478B, both process trees closed and all protected inputs unchanged. See [SDK228 build/declaration report](reports/sdk228-build-and-declarations-20261027.md). This is VERIFIED_LIMITED build evidence, not APP qualification.

Production source now includes the five-patch core, explicit identity/creation-capacity metadata and new89-row/756-word diagnostic schema; old87-row consumers are incompatible. Low-level ST trim is VERIFIED_LIMITED. Fresh complete ESM/DTS qualification is now VERIFIED_LIMITED; it does not prove the original strict APP release integration, which requires its separate live run. No original APP fixture, baseline or threshold was changed.

## Next actions, in order

1. Verify the current checkout and preserve local changes. Establish one writer before local implementation begins; cloud and local must not write the same module concurrently.
2. Preserve the completed isolated host-native qualification and its exact source/toolchain binding. Preserve the additional limited ST/WASM evidence separately; new SDK build/declarations are verified separately while actual APP integration remains outside this build qualification.
3. Preserve the limited host verification of same-world empty-storage reclamation and explicit event acknowledgement. Establish production caller quiescence, borrowed-view retirement and binding revision before integration under `empty-world-trim-design.md`; private injected event records are not APP dispatch evidence.
4. Verify the integrated production bridge/backend fault state, fixed metadata accounting row/schema and exact producer inventory. Preserve allocator, ID, stale-view and close semantics; do not replace the world or reset its step index.
5. Verify the integrated post-scene-destruction, post-cleanup release hook. Legal nonempty persistent worlds skip empty trimming; an eligible-empty failure must not produce a successful restoration receipt.
6. Preserve the fresh production ST3/SDK228/DTS cohort; run the original same-app/world 100-scene strict fixture without warmup/rebaselining. Complete full census and remaining original matrix/examples/gates.

## State rules

Record implementation and validation separately: SOURCE_ONLY, VERIFIED_LIMITED, FAIL, BLOCKED, DONE. A candidate may be committed to protect code while remaining SOURCE_ONLY and NOT_INTEGRATED. No native PASS, build-number reuse or whole-project progress percentage may be inferred from source tests.

For each next run record source/runtime/fixture identities, command, limits, stdout/stderr, exit and process-tree closure, before/after input hashes and artifact hashes. Use a new attempt directory; never overwrite a failed one. Keep code and tests in Git promptly, and store large artifacts only at an authorized persistent destination.

The Chinese handoff is an immutable time-of-handoff explanation; use this status and subsequent verified commits to identify later changes. The full task contract remains authoritative; this status does not reduce scope.
