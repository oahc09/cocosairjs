# Independent review of the owner-commit repair

## Verdict

**PASS within the isolated pure-protocol scope reviewed here. R1 is repaired.** This conclusion applies to source SHA-256 `fb1be9f19ab526e8b1c0785446a387324b4d51930b90d7bfb105127fe8255b06` only. It neither upgrades the original frozen candidate's BLOCKED verdict nor qualifies actual Cocos/World/WASM/native behavior.

The original review's payloads are frozen separately in `../original-review-manifest.json`. They were not modified during repair review. No main product tree edits, installation, full build or external service action were performed.

## Source review

The repaired source differs from the frozen original only by the new per-owner commit-state field/diagnostic and the corresponding commit-loop bookkeeping:

1. Initialize `commitState` to `not-entered`.
2. Check the transaction before each owner commit.
3. Mark effect entry and `entered-unknown` before invoking the owner actual-commit callback, including scalar no-change.
4. On normal callback return, record `returned` and increment `committedOwners` before checking for a caught-reentry latch.
5. Expose a frozen primitive-state-only `ownerCommitStates` array.

This aligns owner actual commit with the existing conservative native/cache effect accounting. A callback that throws remains unknown; a normal return is not erased merely because a subsequent latch check fails. `committedOwners` is a returned-callback fact, not a claim of whole-transaction success.

## Independent reproduction

The copied repair source was compiled independently using the existing TypeScript 4.9.5 and Node v24.19.0. No precompiled author output or author PASS receipt was used as the result.

- Candidate suite: 56/56 PASS.
- Original independent boundary suite: 13/13 PASS.
- Focused prepare/dispose/cache phase suite: 6/6 PASS.
- Additional repair boundary suite: 5/5 PASS.
- Concrete original-failure stimulus with required fail-stop assertions: PASS.

That is 80 counted controls plus the separately recorded concrete regression.

The concrete regression keeps the original two delegates and actual-commit mutation/throw-null stimulus unchanged. Only the post-failure exploit continuation is replaced with safety assertions so that correct rejection can be positively tested. Observations:

- The original null is preserved.
- Owner commit states are `returned`, `entered-unknown`; committedOwners is 1.
- Both original owner-generation leases are faulted; faultAttemptedOwners is 2.
- A subsequent `begin(asset)` is refused.
- Native setter calls remain 0.

The exact original exploit script is also preserved unmodified as `unchanged-original-probe.cjs`. Running it against the repair exits 1 at its attempted subsequent `begin`, with `Owner generation is stale or closed.` This is the expected fail-stop location, not a new failure or an assertion-based PASS. No continuation/native replay occurs. The positive regression separately verifies the relevant facts and exits 0.

The five additional tests verify original falsy commit failure through recovery-read/reporter/cleanup errors; no-change successful commits followed by cleanup caught-reentry; first owner returned commit followed by foreign-roster latch with later commit unentered; successful no-change retains subsequent valid execution; and pre-commit actual mismatch is not falsely labeled a committed effect.

## Evidence and repeatability

From this directory:

`python reproduce-repair.py`

Exact subprocess argv, working directories, expected/actual exits and raw logs are in `evidence/run.json`. Required safety observations are in `evidence/repaired-original-regression.json`. The unchanged-original fail-stop raw stack is in `evidence/unchanged-original-probe-failstop.log`.

The runner returns 0 only if compilation and all positive suites/regressions exit 0 and the unchanged original exploit exits exactly 1. The deliberate exploit-stop exit is documented separately and is not counted as a passing control. `repair-review-manifest.json` binds the explicit repair-review payloads. `verify-review-packages.py` verifies both original and repaired review manifests and writes `evidence/package-verification.json` outside the self-hash set.

## Remaining qualification boundary

No additional independent safety/lifecycle blocker was found in the tested pure module. Trusted delegate purity, actual private cache readers, original engine mutation guards, real shape and world liveness, authentic native teardown, multi-world singleton restrictions and complete legacy/backend membership still require integration evidence. A caller's `close('released')` assertion remains an externally established fact, not a native release performed by this module.

Formal required cells remain **2,128 NOT_RUN**. No Gate is promoted; shared-all-owner, staged/unified activation and S2/S3/S4 remain unqualified by this review.
