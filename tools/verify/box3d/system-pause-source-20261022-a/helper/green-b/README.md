# B2 actual-System source control, GREEN follow-up

Jest exited 0: **18/18 cases and 331/331 individual checks passed**, with every fixture cleanup CLOSED. The 424 actually loaded repository sources matched their before/during/after hashes. This is the frozen, uncommitted six-file working tree recorded in product-source-identities.json, not the content of base commit c2fc04359e70bdcff33bd15922befb5e4590585a. Five of the six files were actually loaded by Jest; command-producers.ts is deliberately still NOT_INTEGRATED and was not loaded.

## Original RED preservation

The original attempt-a has four product RED controls and two positive controls. All old raw/artifact hashes and the original four fixture/helper files remain unchanged. The original six test bodies were copied byte-for-byte; their block SHA is in original-six-assertion-identity.json. Those same assertions now all pass against the new actual System/world/owner sources. The original C02 disabled assembly is still a positive control, not relabelled as a historical RED. The green copy only changes import paths, truthful setup observation metadata and optional initial-enable setup, and appends new cases.

## Additional controls

- BEFORE autoSimulation=false adds and preserves backlog, emits normal AFTER, does not pause owner/queue, and permits manual step.
- Between-tick autoSimulation=false and enable=false both stop subsequent automatic ticks after one successful tick. Successful-tick accounting and remaining backlog are preserved; manual eligibility differs by owner pause. Re-enable drains retained backlog without reset. This uses an explicitly labelled harness scheduling injection immediately after the original syncAfterEvents returns, not a claim that a production callback producer is connected.
- An initially false private System flag installs a paused owner before real Node/RigidBody/BoxCollider assembly. Disabled scene preflight works, manual step refuses, and later resume allows one mock step.
- Strict-invalid enable/autoSimulation values do not coerce inputs, change either flag, call any mock-native API, leave a queue reservation, or leak owner/mutation scopes. Valid writes remain usable afterward.
- Explicit mock-native throws of undefined and zero reach the actual owner/world fault path with first-error identity intact. Subsequent step, postUpdate and setters reject with no additional mock-native calls.
- Closed actual world/owner rejects manual and automatic advancement. Teardown releases the System observer. No extra terminal-flag contract is invented after observation is removed.
- Both same-value and false writes inside an explicit mock solver callback hit the earliest actual System mutation guard before changing caches. Caught refusals do not claim to cancel the already-executing mock step.
- A thrown BEFORE callback preserves original error identity and already-added backlog, with no AFTER or step.

## Limits

This exercises actual PhysicsSystem, World, owner and component source with the explicitly instrumented mock binding from the original probe. No WASM, physical integration, app scheduler, browser, rendering, native grant, actual producer roster integration, or formal qualification is claimed. Components are unattached Nodes with original lifecycle methods invoked by the fixture. System stepping cases use empty worlds except the assembly control; synthetic mock movement is never used as physical evidence. All 2,128 formal cells remain NOT_RUN; stagedCommandsSupported and unifiedTransactionsSupported remain false; producer/target connections and T12 remain NOT_INTEGRATED/NOT_RUN.

## Artifacts and reproduction

- attempt-b/raw.json: all actual observations and loaded-source hashes.
- attempt-b/receipt.json: source-scope status, cleanup, exact artifact hashes, exit code.
- attempt-b/command.json, stdout.log, stderr.log, jest-results.json, source-before.json and fixture-before.json: original unmodified run records.
- original-red-preservation.json and original-six-assertion-identity.json: retained RED and unchanged assertion proof.
- product-source-identities.json: six frozen working-tree files, exact byte/SHA and loaded flags.

From workspace root, run python3 box3d-immediate-pause-probe-20261022/green-b/run-green.py NEW_UNIQUE_ATTEMPT. Do not rerun concurrently with another Jest/native control. The runner refuses an existing attempt directory.

The original fixture header mentioning intentionally failing RED is historical text retained in the green copy, not the outcome of this attempt. Actual outcome is only the recorded 18 passing rows and exit 0. The stderr retains existing headless frame/container and Box3D registration logs rather than treating logs as product failures.
