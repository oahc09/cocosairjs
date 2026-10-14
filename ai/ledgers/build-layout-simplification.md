# Build layout and safe startup: rev 3 implementation ledger

Baseline: `f76257fc6805f2e9cd722f376d50afc402afe074`. Date: 2026-10-14.

## Approved scope and revised contract

This record supersedes the rev 2 task's conflicting instructions. It is an implementation ledger, not evidence of checks that have not run.

- A-01/A-02 are cancelled: all existing official source maps, development/minified bundles and the Spark variant remain tracked. Regenerate from source and commit the matching JS/map pair. No generated output is edited by hand. There is no Git history, checkout size or npm size reduction claim.
- A-03 clarifies one recommended full browser entry and two optional lightweight entries. All four npm JavaScript copies remain: main, minified main, bootstrap and html-source. Their public package paths remain under `build/npm/`; source-map-free publish copies are prepared without recompiling or incrementing the build number.
- A-04 is revised to preserve the dedicated engine-free HTML entry and the lazy bootstrap entry. HTML capability helpers are also re-exported by the main and bootstrap barrels. There is no breaking subpath alias migration and no assumption that version 1.0.0 means unpublished.
- A-05 stays cancelled. Keep generated legacy declarations and their single-source exports; modern and TS4.9 consumers must resolve each public subpath independently.
- A-06/A-07 are deferred: no decoder, fflate or DevTools directory migration. Existing development, Gallery, tarball and license paths remain valid. Correct the independently identified DevTools installed-runtime path.
- B is a startup lifecycle change, independently committed after the publishing/documentation stage. Main remains browser-only, not SSR-compatible. Both lightweight entries retain no-DOM import compatibility and bootstrap retains an independent deferred runtime chunk.
- Frozen vendor sources are immutable. PAL adaptations use checked generator transformations, then `pal-source --write` and `--check`. No new unregistered PAL output and no edits to extracted `src/cocos` are planned.
- A single registry owns admission and the exact initialization promise across main/bootstrap calls. Normalize and admit before mutation; validate ownership before selecting canvas/DPR; prepare wrappers before binding screen/input; initialize the engine only once. Failed startup requires reload, closed apps cannot restart.
- Screen DOM lookup/wrapping, resize/fullscreen/DPR listeners and keyboard/mouse/touch listeners move to an explicit startup binding point, including import-time Input singletons. Getter-only changes are insufficient.
- Default/minified and Spark builds are regenerated, including maps. Spark output must use the correct Spark map name. Default output must remain Spark-free.

## Required verification

1. Publication: all recursive exports condition targets exist in the installed real tarball; all four JavaScript copies have no map URL. Verify clean publish-copy generation and upgrade regeneration without deleting unrelated files.
2. Real consumption: isolated imports for main/bootstrap/html-source, HTML/bootstrap no-DOM imports, actual esbuild splitting, independent TS4.9 Node16 and modern Node16/Bundler subpath consumers; retain classic main resolution.
3. Startup: import before canvas, options-only custom canvas and DPR cap, fractional/high DPR, first drawing buffer and resize, wrappers/container, one-time mouse/keyboard/touch binding, custom-canvas audio unlock binding, invalid/conflicting options with no ownership mutation, mixed-entry concurrent calls, failure and close.
4. Regressions: focused Jest, types, format, PAL, file-map, licenses, decoders, feature/custom exports, web-only, Spark generation/assets, Gallery byte identity and DevTools. Browser checks require serialized GPU access and real process cleanup receipts. Report any infrastructure failure or skipped suite explicitly; focused tests are not full Jest certification.

## Progress

- Created isolated `refactor/build-layout-safe-start` worktree from the baseline. No changes to main, CI-fix branch or exhibition SDK.
- Implementation and verification results will be appended after each stage; no push or PR is authorized.

## Implementation checkpoint (before GPU acceptance)

- Default/dev + min + declarations + all four npm copies rebuilt successfully; Spark rebuilt from the full default feature set plus spark through the new --spark option. The first default attempt hit the process heap limit (exit 134); the 4 GiB retry passed. Its stale isolated-worktree lock was moved only after the failed process had exited.
- PAL --write/--check, typecheck, full file-map (official pinned cocos/cocos4 557b06f7 snapshot), licenses, decoders, custom/feature exports, web-only and Spark asset checks passed. Spark subtree was genuinely regenerated and its check passed; the initial check correctly reported the absent ignored manifest.
- Real tarball acceptance passed 13 checks: clean/upgrade npm copies, every exports condition target, four map-free JS copies, isolated Node lightweight imports, actual bundler isolation/splitting, each subpath in TS4.9 Node16 and TS5.9.3 Node16/Bundler. Fixture-only failures (calling a canvas-required helper without an argument and modern definite assignment) were corrected and retained in prior logs.
- Ten focused Jest suites passed; new standalone suites now contain 8 passing tests including exact admission promise/terminal states, custom-canvas audio gesture routing and DevTools positive/negative controls. Inventory additions are generated from passing JSON plus full real discovery, preserve 188 existing suites, and explicitly do not certify a current full Jest run.
- DevTools old installed path was corrected to build/npm. Its old SESSION_CLOSED substring incorrectly matched baseline AIR_E_SESSION_CLOSED; exact tool signatures plus valid-runtime / injected-tool / real-tool controls replace that false positive. Runtime-only and runtime-plus-DevTools consumer checks passed.
- Full Gallery build is blocked by unchanged pre-existing responsive-board-recipes imports (tools/recipes, /build/bootstrap and unavailable legacy baseline). The full-build failure is retained; a separately labelled affected-entry subset will be checked. No claim of full Gallery/release certification.
- CPU supervisor normal exit and forced timeout recovery have real exit+close receipts and no owned running processes. Browser acceptance is pending the shared GPU window, not claimed passed here.

## Review corrections and final-source checkpoint

- Partial native inner wrappers are wrapped by GameDiv, rather than accidentally nesting GameDiv inside Cocos3dGameContainer. Both AIR container preparation and the generated PAL transformation follow the same ordering. A real failing pre-fix regression is retained outside Git.
- Independent review found that default container inference changed after wrappers were created. Repeated requests now reuse the initially admitted host. An inner wrapper explicitly selected as the host rejects before DOM or ownership mutation. Independent CPU review verified these fixes and the original frozen-source transformation anchors.
- Ten focused suites now pass 49 tests. The two new suites contain 13 passing tests; complete Jest discovery finds 190 suites and the generated inventory preserves all 188 existing suite entries. The 2,985 inventory titles are discovery/bookkeeping, not a full execution claim.
- Earlier WebKit verification passed its eight-scenario scope before the final container fixes. Its real process exit/close evidence is retained, but final browser acceptance must use rebuilt artifacts and a new tarball. Chromium could not start because the sandbox denied its process-singleton socket; no Chromium rendering claim is made.

## Source-map composition correction

- Independent review found four bare CR characters inside Cannon CRCRLF sequences. Rollup's LF-based generated-map positions diverged from ECMAScript parser/stack positions, affecting development, Spark and minified maps. The same defect exists in the baseline; URL/file checks alone had missed it.
- The build now canonicalizes module line endings before the parser and map pipeline, preserving every logical line and original embedded source bytes. Frozen dependencies are unchanged. Its identity map is generated against canonical logical lines, and the plugin participates in the incremental cache key. No generated map is patched manually.
- Mixed CR and Unicode line separators are explicitly rejected by this transformation rather than risking string-value changes. The verification gate proves the current emitted graph has no Unicode separators, uses real VM stack lines and ECMAScript line counting, tests corrupted mappings negatively, checks multiple AIR source files, and preserves the prior relocation/source-presence assertions.
- The detached-HEAD baseline-contract test was independently reproduced as 26 passing/1 failing on d1c053a5; that unrelated existing CI fix remains on its separate branch. The example metadata suite passed all six checks here.

## Final acceptance (2026-10-14 UTC)

- Runtime/source-map freeze: c77673da. Independent review passed 21 actual token mappings across five JS/map pairs, 10 focused suites/49 tests, PAL and admission probes, and real tarball/TypeScript consumption (13 checks).
- Independent clean rebuild from c77673da removed 14 generated files and four npm copies, then passed build:all and all 13 consumer checks using Node 22.23.3 with a 4 GiB heap. Its Spark bundle remained the already regenerated c776 variant; that clean build does not claim to regenerate Spark. The implementation separately regenerated Spark successfully.
- Final WebKit r5 passed ten positive scenarios and the original no-canvas negative control. It includes a genuine bootstrap-only first import: initialization is not registered before the first createAirApp request, and that request dynamically loads the runtime. Real installed/bundled/default/Spark bytes, first buffer, pixels, input, resize, container reuse, failure and close were verified. Runtime c77673da; functional probe 5300eca1; tarball SHA-256 b7a85a2c9313c8564e768c2cb5039c7206256eebdd8afdcb3cc29dd707169034.
- WebKit r5 ran 12:26:56.410–12:27:14.094 UTC, browser and worker exit/close codes were zero, and all owned groups were empty. The outer startup watchdog is 15 seconds; the allotted overall window was 180 seconds.
- Chromium remains an environment startup GAP. Firefox ordinary headless launch timed out before any page; its first attempt has empty owned groups and terminal worker receipts but lacks the browser IPC exit/close receipt. This is explicitly not a pass. A subsequent CPU-only late-close regression verifies the corrected failure-teardown path (861fd718) with real child exit/close before disconnect; Firefox was not silently reclassified or rerun without a new GPU slot.
- All final publication/feature/license/PAL/file-map/Spark checks passed; 419 documentation/skill files and 3,315 references passed the expanded reference check. Optional generated report filenames are described as generated outputs rather than existing links.
- Remaining boundaries: no full Jest execution, full Gallery remains blocked by unchanged baseline imports, no cross-browser certification, no full Spark visual matrix, no claim that terminal app close removes engine-lifetime DOM listeners or proves zero GPU resources. No push/PR or exhibition SDK changes.

## Authorized PR preparation after main synchronization

- Publication was subsequently authorized. PR #1 was independently confirmed merged as 761f1802506bf6c3952252b218ac84447d4fbcc0; this branch was rebased onto that main without conflicts. The prior local checkpoint remains on a backup branch. The runtime/PAL/build source is unchanged by that synchronization, and all 188 existing test-inventory entries plus the two new suites remain intact.
- Post-rebase validation passed 12 focused suites/82 tests, including the now-merged actual-Git-state baseline contract and example metadata checks. CI inventory/video runner CPU controls, types, format, example-chain, document references, PAL and pinned-upstream file-map checks passed. Full remote CI is still pending at this checkpoint.
- Development/minified/Spark and declaration artifacts were regenerated. A shared node_modules symlink initially leaked the worktree sibling name into private declaration identifiers; using a real isolated dependency directory and the unchanged declaration generator restored canonical node_modules-based names. No dependency source or generated declaration was hand-edited.
- The canonical API inventory was genuinely regenerated to include the two main-barrel HTML helpers; repeat generation was byte-identical. Final real tarball/TS checks passed all 13 cases, and all five JS/map pairs passed actual-position checks. Final compilation counters are 107/108/109 for development/minified/Spark respectively.
- This PR remains separate from the merged CI fix and from exhibition/Vulkan work. Historical local browser evidence retains its original binary hashes; newly stamped outputs are not relabelled as that earlier run. Remote checks will provide the new PR's CI result.

## Remote CI follow-through

- PR #2 was opened as a draft at 191f1738. Its first run (38583845567, job 115920458167) exited 134 during build:all: the log records a roughly 2 GiB V8 heap ceiling and an allocation failure while producing the full build. Browser and Jest stages did not execute in that attempt.
- The build step now uses the same 4 GiB Node heap as the successful local and independent clean builds. This is step-scoped; it does not skip generation, alter source maps, increase browser waits or weaken any assertion. The original failure remains available in the remote run and local submission logs. The next run must establish its own result.

- The 4 GiB retry (38584850813 at 5b111b76) passed build:all, canonical API inventory, documentation references and example-chain before reaching browser setup. Build-only resource diagnostics now record actual runner memory/heap and concurrent process RSS, plus GNU time maximum RSS when available. The build documentation states that 4 GiB heap requires additional system/native memory headroom; this is not a blanket minimum-machine-memory claim.

- Full remote Jest at 5b111b76 actually completed: 188 suites / 2,975 tests passed, two native PAL-chain suites / ten tests failed because their isolated internal graphs dispatched DOM events without the new explicit binding stage. The browser matrix independently passed all 78 cases. Raw failure logs are retained; neither result was silently relabelled.
- Those two internal fixtures now explicitly model canvas binding, with pre-bind zero input and raw engine-event counts after repeated binding (not merely reducer deduplication). All ten original cases and titles remain. Public createAirApp already binds the PAL before engine initialization; the documented native-adapter example awaits that public entry. The native-input manual now makes this prerequisite explicit, without asking applications to call the internal PAL method. Global Jest setup and production binding behavior are unchanged.
