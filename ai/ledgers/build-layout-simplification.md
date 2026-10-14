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
