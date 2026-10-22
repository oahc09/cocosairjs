# Immediate System pause: original-source RED probe

Run: 2026-10-22. Product source read from `../box3d-rebuild-20261022`, identified at preparation as local checkpoint `4e1cb31336dee13c549d8ec94ab71e64072e93e2`.

This independent directory is the only write destination. Product files, the main tree's verification directory, Git, build outputs and native artifacts were not changed by this probe. No runtime/native build was performed.

## Result

`attempt-a/receipt.json`: **PRODUCT_CONTRACT_RED**. Jest exit **1**, with **4 failed product-contract controls and 2 passing source controls**. There were no fixture setup errors, unclassified execution errors or cleanup errors. All six cleanup receipts report closed. All **423 actually loaded engine/test source files** match their pre-run and post-run SHA-256 fingerprints.

- **P01, RED:** after original `PhysicsSystem.enable=false`, original `System.step(1/60)` returned normally and reached the explicit mock binding's step once. The mock native index became 1. It emitted no automatic BEFORE/AFTER events and did not change the automatic accumulator.
- **P02, RED:** the original BEFORE_PHYSICS listener set enable=false, but `postUpdate(2.5/60)` still performed two mock-native steps. The accumulator became `0.008333333333333331`, about half a tick, rather than preserving the already-added `2.5/60`. BEFORE and normal AFTER each fired once. The public false cache did commit.
- **P03 enable, RED:** each of `0`, `1`, `null`, `undefined` and an object was accepted into the real System cache without throwing.
- **P03 autoSimulation, RED:** the same five invalid values were accepted into the real scheduling cache. Per-input raw cache values are retained; resetting the fixture property to true afterward does not erase those observations.
- **C01, PASS_SOURCE_WITH_MOCK_BINDING:** enable=true plus autoSimulation=false suppresses automatic stepping but permits one explicit manual step. The `0.75/60` accumulator remains unchanged, BEFORE/AFTER stay absent, and extra Cannon-style manual accumulator arguments reject without a second step.
- **C02, PASS_SOURCE_WITH_MOCK_BINDING:** while enable=false, real Node/Component lifecycle functions assemble one owned body and two components without fault; disabled postUpdate performs one scene preflight and no solver step or accumulated-time addition. This is a positive baseline, not a pause-policy RED.

The invalid-boolean cases have an actual registered Box3D World/command owner and its material observer lease. **System-control observation itself is not integrated.** These are missing-wiring contract RED cases, not a claim that an existing System-control observer malfunctioned. Producer and target owner connections are **NOT_INTEGRATED**, not passed through an empty roster.

## Evidence scope and limitations

The fixture imports the original PhysicsSystem, Director events, selector, Box3D World/owner, preparation and component classes. It never replaces System setters, System.step or System.postUpdate. The native interface is an **explicit in-memory mock**, copied from the existing source-control fixture and fingerprinted. It is not WASM or a physical solver. Its generic step helper has synthetic body movement; the two advancement RED cases intentionally use empty worlds, and no result here claims physical motion correctness.

For component assembly, original onLoad/onEnable callbacks are invoked manually on an unattached Node, as in the existing owner-source fixture. This is not a browser, full app scheduler, game.init or real scene lifecycle qualification. `sceneSyncCalls` and the mock native index are diagnostic observations, not physical proof.

The frozen lifecycle decisions §6 remain unchanged. All **2,128 formal required cells remain NOT_RUN**. Public staged commands and unified transactions remain false. No producer, target grant, shared-material integrity, application/background pause or T12 acceptance is established.

## Retained files and reproduction

- `pause-control.test.ts`: authored actual-source cases, preserving failed contract assertions.
- `mock-native-binding.ts`: explicitly mock native interface adapted from the current `tools/verify/box3d/owner-checkpoint-a-control.test.ts`; the original helper's source hash is in `source-before.json`.
- `pause-control.jest.cjs`: focused single-file Jest configuration; its cache lives only here.
- `run-probe.py`: creates a new attempt directory, records input hashes and command, captures stdout/stderr/exit, and classifies setup, execution, cleanup, source drift and product-contract failure independently.
- `attempt-a/command.json`, `stdout.log`, `stderr.log`, `exit-code.txt`, `jest-results.json`, `raw.json`, `receipt.json`: exact attempt evidence.
- `attempt-a/source-before.json`: pre-run source SHA-256/size inventory, including contract and original plan.
- `attempt-a/fixture-before.json`: exact fixture/config/runner fingerprints used by the attempt.
- `attempt-a/raw.json` contains original observed values, individual expected/actual checks, System/World diagnostics, cleanup receipts and 423 loaded-source hashes.

Run `python3 run-probe.py attempt-b` from this directory for an explicitly new attempt. Existing attempts are never overwritten. A nonzero Jest exit caused by these assertions is retained as product RED; the wrapper does not turn it into a feature PASS. Reproduction against later product source must be separately identified by its captured hashes, not relabeled as this original run.

## Candidate addition: immediate automatic-scheduling stop

**PROPOSED, NOT FROZEN, NOT IMPLEMENTED AND NOT TESTED HERE.** The frozen contract says autoSimulation=false is scheduling-only, but explicitly requires mid-frame rechecks only for owner pause. The following would clarify scheduling behavior without redefining pause:

1. For an observed Box3D owner, automatic tick admission requires both owner-executable and current autoSimulation=true. Recheck after BEFORE_PHYSICS and before each actual tick, alongside the pause check.
2. Setting autoSimulation=false in BEFORE prevents automatic ticks in that frame and preserves all already-added accumulator/backlog. Normal AFTER still runs. If false then true occurs within the same BEFORE dispatch, the final current flag determines automatic eligibility; unlike enable=false, neither transition clears accepted input.
3. Setting false at an idle boundary between completed ticks stops subsequent automatic ticks. Completed ticks remain deducted; the unspent remainder remains. It does not retroactively cancel the completed tick.
4. During collection, solver, writeback, dispatch or another protected transition, scheduling changes still reject at the existing earliest mutation guard, even for same-value writes. No hidden mid-transaction scheduling bypass is introduced.
5. False does not pause the owner, clear queue/targets, disable continuous handles, revoke grants, reset time or block an explicit manual step while enable=true. It does not resume an enable-paused owner.
6. While automatic scheduling is false, later postUpdate calls do not add automatic accumulated time. Explicit manual steps retain the original independent accumulator semantics: they neither drain nor reset the preexisting automatic backlog. Returning to auto mode resumes that backlog; an explicit resetAccumulator remains a distinct operation.
7. Unobserved and other-backend behavior remains original. No second loop/clock, public flag or game-pause inference is added.

This candidate must be explicitly frozen by the lead before a new mid-frame autoSimulation behavior is labeled a product-contract RED. The current probe does not convert that unchosen behavior into a failure or modify the lifecycle document.
