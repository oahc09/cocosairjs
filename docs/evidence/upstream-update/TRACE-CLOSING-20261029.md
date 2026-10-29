# Closing diagnostic protocol repair — 2026-10-29

## Scope

This is a tools-only follow-up suitable for feature parent `c15aa8b2e61c3eba6ff72eb8c2e5cbfe405cfdc8`. No runtime source, generated build, example status, or main ref is changed. It does **not** publish or certify the separately retained main-synchronized candidate (`883b2105`, tree `800345a5`).

The two trace failures were reproduced on the unchanged feature tools: 46 tests, 37 passed, 2 failed, 7 explicitly opt-in live tests skipped. The rejected-stop fixture incorrectly retained a positional raw event instead of the modern start and closing boundaries; diagnostic code still assumed stop request 2 rather than 3.

## Repair

- Share strict pre-close validation between the full shutdown policy and CPU-only diagnostic classification. Bind the original start/closing events, exact worker identity, ACKs, frozen executable, functional original, healthy close authorization and original closing budget.
- Keep rejected stop (two acknowledged barriers) and delayed successful stop (three barriers) separate. Only an independently validated negative CPU rejection may retain the two specific missing-stop errors. Production success still requires the complete original stop/physical closure and remains rejected for these fixtures.
- Preserve all previous negative assertions; add twelve rehashed closing-proof mutations. Repair missing `stopComplete` handling to return structured rejection rather than throwing.
- Include the previously developed exact decimal device/inode wire representation and tests. Unsafe legacy numeric identities remain rejected. Preserve the no-op supervisor negative fixture correction.

## Fresh verification

The eight scoped tool files are byte-identical between the integrated candidate and an independently materialized **c15-based** tool snapshot. The latter retains c15's original campaign and browser-runtime dependencies, not main's versions.

| Check                                                                               | Result                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| c15 trace + shutdown policy                                                         | 54 passed, 0 failed, 7 existing opt-in live skips (61 tests) |
| Integrated trace + shutdown policy                                                  | 54 passed, 0 failed, 7 existing opt-in live skips (61 tests) |
| c15 targeted supervisor: malformed receipts, late stop, abort IPC, custody response | 14 passed, 0 failed, 0 skipped                               |
| c15 Python custodian protocol                                                       | 20 passed, 0 failed                                          |
| Formatting of changed JavaScript                                                    | Prettier 3.9.9 check passed                                  |

An independent reviewer verified the two original regression bodies and mutations, eight additional ACK/identity/time tampering controls, missing-stop rejection, and c15/integration byte parity.

All failed iterations are retained. In particular, the earlier file named `c15-final-focused.log` is **not the final patch result**: it was started before the last branch-specific fix and before esbuild restoration; 114 passed, 4 failed (including the parent suite), 7 skipped. Official esbuild 0.28.2 was subsequently restored in isolated tooling and its synchronous transform verified. The whole long supervisor suite was not rerun after this; the final affected supervisor subset above is explicitly partial. No claim of a fresh full CPU campaign is made.

The archive beside this report contains source hashes, test logs, exit codes, original CPU receipts and intermediate failures. Historical full-campaign failures, real-browser/strace, physical device/GPU and real provider acceptance remain unverified or blocked. These tools tests do not promote evidence, certify rendering, complete M4, or authorize a main merge.
