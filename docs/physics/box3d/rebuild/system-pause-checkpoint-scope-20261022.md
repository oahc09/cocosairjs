# Immediate System pause and evidence transport

This checkpoint is an incremental implementation, not a release or formal Gate. The complete v1.2 denominator remains 2,128 NOT_RUN cells and all nine Gates remain unpassed.

## Actual capability boundary

The private original PhysicsSystem source is observed by its actual Box3D world owner. An observed enable=false prepares and immediately pauses the logical queue; both System.step and direct world.step refuse before native advancement. Paused non-target body/component assembly remains a configuration operation. Re-enabling restores eligibility, not prior commands. autoSimulation=false is scheduling only and does not pause or clear the queue. The original single accumulator is preserved, with immediate post-BEFORE and between-tick scheduling rechecks. No second RAF, native loop, accumulator, public bypass flag or producer roster was added.

The owner has no producer instance yet. Producer pause preparation is separately exercised with nonempty pure fixtures, not falsely represented as connected. Public stagedCommandsSupported and unifiedTransactionsSupported remain false. Shared material propagation/subscription integrity, complete listener-entry coverage and persistent target-grant admission remain activation blockers. Game pause/manual StepClock ownership and T12 are not qualified by this System seam.

Raw source/mock and real-WASM attempts have independent receipts and frozen inputs. Actual source/mock controls are not physics qualification. An explicitly injected JS failure after a real prepared participant operation is not represented as a native defect. The preserved original bootstrap double-failure case is not rewritten when fixed. The real-WASM collector uses the current exact N4 Release artifact, checks every build input and artifact hash, observes genuine calls, and runs under Node/Jest/JSDOM, not a browser.

## Lossless evidence transport

Checkpoint34's original 16,388,019-byte JSON exceeded the connector's 16 MiB request-body limit once JSON framing was added. The failed blob was independently read as absent; no tree, commit or ref was made for that attempt. The original local c2fc043 commit and Library archive remain intact. A hash-addressed gzip retains the exact original bytes, and its small transport index records both original and semantically equivalent compact representations.

New inventories may use deterministic .json.gz. evidence-closure.py decompresses that representation and performs exactly the same explicit-file, ignored/untracked raw, manifest-reference, staged-byte, mode and committed-HEAD checks. Compression is not an evidence exception. The source backup and actual independent Library restore invoke that same gate. Corrupt gzip, lost raw, wrong references, overwrite and staged-only data are negative controls. Historical inventories are referenced by content identity rather than embedded recursively.

Recheck the current inventory with:

    python tools/verify/box3d/evidence-closure.py --manifest ai/ledgers/box3d-delivery-checkpoint-35.json.gz --require-commit

The inventory excludes only its exact self path and explicitly recorded regenerable Python caches; unique stdout/stderr/raw files are included even when .gitignore normally ignores *.log. External native artifacts and the official toolchain retain their separate Library identities and are not invented as source-bundle contents.
