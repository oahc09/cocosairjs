# SDK preparation correction result

This is a subsequent, scoped correction to the blocked final candidate `e6f3a2eacdbd97eaf5f9fdfa5dc74ed3ee9fb0b9`, not a replacement for its historical full regression report. Tested implementation checkpoint: `1aa18be69b67b7fab0429b2573d863a5a3d4bef7`. The unchanged runtime package archives were consumed, not rebuilt.

## Corrected preparation

- Official `@types/three@0.186.0`, the existing `three@0.186.1`, six declaration dependencies, and the exact complete npm lock are frozen and byte-verified. The previously reported declaration-identity blocker was an implementation/preparation omission, not an unavailable environment or a user decision.
- Versioned contract `upstream-sdk-types/3` compares both engines under TS5.9.3 node16/bundler. Cocos independently retains TS4.9.5 node/node16.
- `paired-common/1` checks the published common business task through each engine's legal native APIs. Cocos main-control and candidate both use the same fixture: 21 original native negatives plus two type-only probes.
- The unchanged full Cocos fixture remains the separate `candidate-u06-extension/1`: 33 original negatives plus three type-only probes. Validators reject scope substitution even when a claimed result otherwise passes. No task, repetition, threshold, repair budget, or time budget was removed.

See [the original-contract correction analysis](THREE-DECLARATIONS-REVISION.md).

## Actual validation

The working implementation passed 112 upstream preparation/reference/collector contract tests and 71 SDK/DTS/gate tests. A new directory was then restored from Git packs and bundles, without copying project source from the working tree. All 5,410 materialized tracked project files matched; 75 retained built artifacts and 13,045 independently copied dependency entries also matched. Every materialized skip-worktree/assume-unchanged entry was included in this audit. The restored source then passed all 183 scoped tests, zero failures and zero skips.

Both the working and restored source executed the actual isolated npm consumers:

- Main-control Cocos: four modes, 23 exercised negatives per mode, zero diagnostics.
- Candidate Cocos common scope: four modes, 23 exercised negatives per mode, zero diagnostics.
- Candidate U06 extension: four modes, all 36 exercised negatives per mode, zero diagnostics.
- Three: modern two modes, seven exercised negatives per mode, zero diagnostics.

Every consumer's installed-package resolution, DOM-free math and Vite production build also passed. Compiler negatives were checked again with directives removed, not merely accepted as comments. These are CPU observations only. Browser/compositor checks were not run and no observation was promoted to a browser-validated reference.

The retained earlier control failure is expected absence of candidate-only request APIs: ten diagnostics per mode when the inappropriate extension fixture was used. It is not a failed common AU12 task or an Agent run. The missing-engine-config attempt, incomplete Vite-toolkit attempt, and the initial recovered test run with three explicit skips are retained; after restoring the required external inputs, the full scoped recovered suite passed 183/183 without skips.

## Unchanged blockers

Overall plan status remains BLOCKED. There are zero generated model runs. Required paired browser/compositor and physical-device/GPU evidence, real immutable provider/model/parameters/raw-I/O/cost/isolation, original pinned upstream license/source-map evidence, and remote-publication confirmation are still missing. No PR, merge, release or deployment occurred in this revision. The earlier full regression result belongs to its original snapshot and is not relabelled as a result for this revision.
