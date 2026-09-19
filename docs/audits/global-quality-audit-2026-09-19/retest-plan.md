# Retest / remediation plan — global-quality-audit-2026-09-19

Ordered so cheap deterministic retests gate the expensive isolated ones.

## R0 — Freeze a candidate (BLOCKS everything) [CLOSED by F-43 on 2026-09-19, user-authorized]
- Produce an immutable candidate and re-run A0 to get a stable candidate ID.
- DONE: `E:/qoder-frozen-2026-09-19/candidate` + `candidate.tar` + `SHA256MANIFEST.txt` = 3234 files, manifest first-16 digest `677cce412ce454b4`, `HEAD=3a53957db6bdd009bbd85af8b7d589a0b48dba5b`, `dirty=111`, `node=v24.14.0`. Post-injection re-hash of all 3234 entries: mismatches=2, both differ only in `measuredAt`.
- What R0 still owes after the fix wave: re-freeze (new digest) and re-attribute the hash-bound gates; `candidateIntegrity` moved FAIL -> PARTIAL because the delivered tree is still uncommitted and `node_modules`/`.git` sit outside the digest.

## R1 — License (blocking)
- Add per-asset `.LICENSE.md` provenance for examples/gltf-draco/assets/draco.glb and examples/gltf-meshopt/assets/meshopt-khr.glb; decide keep/exclude for build/examples.
- Command: `node tools/verify/license-audit.cjs` expect exit 0; spot-check tarball notices via `npm pack`.

## R1b — Gallery-static self-containment (F-34, blocking; deterministic, no browser needed)
- Defect: `build/examples/gltf-meshopt/main.boot.js:95` keeps absolute `/build/gltf-decoders/meshopt/meshopt_decoder.mjs`; serving the artifact from its own root (no dev-server `/build/` mapping) returns 404 while the shipped relative `../gltf-decoders/...` returns 200.
- Root cause: `tools/verify/v11-gallery-artifact.cjs:46` rewrite guard `code.includes('/build/gltf-decoders/')` does not match the concatenated source form in `examples/gltf-meshopt/src/main.ts:34` (`'/build/gltf-decoders' + '/meshopt/...'`, no trailing slash).
- Minimal fix suggestion (needs approval — touches tools/ and examples/, not an auditor edit): make the artifact builder rewrite source-form-agnostic (match `/build/gltf-decoders` without requiring the trailing slash, and normalize after esbuild), or change the example to a single literal relative URL. Prefer fixing the builder so any future example form is caught.
- Add a gate assertion: after artifact build, scan EVERY shipped `main.boot.js` for absolute request URLs (`"/build/`, `"/__debug/` outside a guarded `requiresDevTools` example) and FAIL; then serve the artifact from its own root offline and assert 200 for each referenced decoder/asset/engine URL.
- Retest scope: rebuild artifact in scratch copy outside repo -> offline static serve -> URL 200 sweep over 45/45 boot.js -> re-run `v11-gallery-artifact.cjs` + gallery browser verify -> restore `galleryStandalone`/`exampleStableVerify` to PASS only on a frozen candidate (R0).

## R1c — Gallery-static vs DevTools profile split (F-35, blocking; contract decision + gate)
- 6 shipped stable examples (automation + rc-capture-frame/rc-create-node/rc-error-report/rc-inspect-scene) require the dev-server `/__debug/agent-session.js`; `automation` hardcodes it and rethrows. Decide: exclude `requiresDevTools` examples from the Gallery-STATIC certification set (and label them in the index), or have the Gallery product ship a static DevTools entry so they run offline.
- Also: `automation` should use the overridable base + a clean "requires DevTools" skip instead of an uncaught throw.
- Retest: absolute-URL sweep must show 0 unguarded hits and every requiresDevTools item either excluded from the static profile or resolvable offline; then a network-blocked gallery-static render sweep of the remaining examples.

## R2 — API Coverage (blocking; adjudicate before backfill)
- Confirm frozen tier denominators per §7.6 (is totalUnits 4729 with core 717 the approved denominator?). If yes -> verification backfill needed to reach Core 100%; if denominator mis-scoped -> document the correction with approval (not an auditor edit).
- Command: `node tools/examples/coverage-report.cjs`; recompute core/important/advanced verified vs totals.

## R3 — Browser tooling (unblocks example-stable/gallery/devtools/gltf-visual/perf/agent)
- Install/mount project-pinned Playwright (external NODE_PATH per project convention); record the real WebGL backend (note the GameViewer virtual display adapter).
- Commands: `node tools/verify/v11-examples-verify.cjs`, `v11-gallery-artifact.cjs`, `v11-devtools-examples.cjs`, `v08-browser-matrix.cjs`, `v06-catalog-gate.cjs`, `v06-lifecycle-gate.cjs`.

## R4 — Recipe evidence rebind (blocking, after R0) [PARTIALLY CLOSED by F-46 off-tree]
- `node tools/verify/v06-report.cjs` expect sourceHash match for all stable recipes with full scene/interaction/visual/lifecycle evidence.
- DONE in the frozen copy (F-46): `run-recipes-browser.cjs` → 30/30 PASS with `sourceHash` == the frozen digest `ac1b151596b36975`, and `v06-report` `evidenceFailures` 8 → 0. The 8 mismatches were correctly-detected staleness (commit 3a53957 rewrote `tools/benchmark/**` after the recorded run), not a defect.
- STILL OPEN: the delivered repo's `docs/evidence/v06-recipes.json` is untouched by this audit, so the in-place gate is still FAIL. Remaining two blockers are (a) `v06-golden-dual-track.json` + `v06-catalog-runtime-gate.json` still carry the pre-commit hash, (b) jest `output/v06-review-jest.json` must be produced in-step (one command, proven).
- New gate fixes to include with R4: assert `revision/baseRevision` equals current HEAD (F-46 OBS-4, decorative today) and make `benchmark-evidence.cjs` metadata() survive a missing `.git` (OBS-3). Do not weaken any existing check.

## R5 — Benchmark / Agent (blocking; isolated budget)
- `npm run verify:benchmark`; then a real generated-source Agent track run per §7.1 with fresh build/fresh page; recompute FinalSuccess/FirstCompile/repair from raw events (eligible includes compile-fail/timeout/refusal). Scripted solver excluded from LLM rate.

## R6 — Perf & lifecycle (blocking; serial, exclusive)
- BoxTextured 30-load median vs frozen same-env baseline (<=15%); >=50 load/instantiate/dispose; unmeasurable memory = unavailable; no concurrent load.

## R7 — Isolated consumers & negative controls (A3/A2)
- Clean-room build in a copy outside the repo; three consumers (Runtime-only, Runtime+DevTools, Gallery-static) with paths/importmap/symlink bypass forbidden; offline after install; negative controls (remove decoder / stop animation / break texture ref / stale screenshot / exclude required test / agent compile-fail / sacrificial isolation) must FAIL as expected.
- R7a [NEW, F-37 blocking] Test-inventory assertion: add a gate that runs jest with `--json` and fails unless the suite/test inventory matches a frozen manifest (29 files / 207 tests, every `test/smoke/smoke-NN` reported), or equivalently a required-suite list check. Retest: `node node_modules/jest/bin/jest.js --testPathIgnorePatterns smoke-11` must flip the gate RED (this run it is GREEN, 28/188 EXIT 0).
- R7b [CLOSED by F-38] NC-C re-run succeeded against `tools/examples/spec-compliance-audit.cjs` (no esbuild dependency) in a full-tree copy outside the repo: deletion DETECTED (EXIT 1, structured S11-SCREENSHOT fail), content tampering NOT detected (31-byte garbage PNG, gate GREEN) -> see R7f. The `spec-validate.cjs` absolute `<repo>/node_modules/esbuild` resolution is still worth fixing (R7b-i) because it blocks that tool from running in any copied tree.
- R7f [NEW, F-38 blocking] Bind screenshot content: in `spec-compliance-audit.cjs` S11-SCREENSHOT also require `statSync(png).size === art.bytes` and `sha256(readFileSync(png))[0..16) === art.hash` (producer `v11-examples-verify.cjs:111` already emits both). Retest: NC-C1 (delete) and NC-C2 (overwrite with garbage) must both EXIT 1, and a freshly captured current screenshot must still pass.
- R7c [NEW, F-37] Make decoder-audit's missing-decoder path a structured FAIL message (this run: unhandled MODULE_NOT_FOUND, correct exit code but noisy). NC-B itself already verified as having teeth.
- R7d [NEW, F-37] Re-take every "suite green" claim on the frozen candidate: the identical NC-A command produced 2-failed/171-passed then 28-passed/188/EXIT 0 under the live mutating tree, so no single-run green is reproducible until R0 lands.
- R7e Still NOT_RUN controls: in-browser decoder removal at render time, stale screenshot re-used at canvas level, agent compile-fail, correct-policy refusal, sacrificial-isolation breach. Executed so far: decoder removal (NC-B, detected), required-test exclusion (NC-A, NOT detected -> R7a), missing/tampered screenshot (F-38: existence detected, content NOT), break-asset-reference (F-39: NOT detected offline), **stop-animation (F-41, DETECTED: anim-position EXIT 0/PASS -> EXIT 1/FAIL when SineMover.setPosition is removed)**.
- R7f+ [F-41 positive result, guardrail] When implementing R7f/R7g, keep the frame-diff 400 ms two-frame contract and its thresholds exactly as they are — F-41 shows they already have teeth; weakening them to make a rebinding pass would destroy the only load-bearing visual check.
- R7i [NEW, F-42 blocking] Unblock the two policy controls by making the locked toolchain usable inside an audit copy: either allow a developer junction of `node_modules`, or add a documented `test:copy` jest entry that keeps `rootDir` at the copy while `modulePaths`/`NODE_PATH` point at the source repo's toolchain (no assertion, threshold or source change). Then run the three injections already scripted in `raw/negctl/nc-f-refusal-isolation-NOT-RUN.log`: (F1) neutralize the 4 `OUT_OF_SCOPE` throws in `tools/debug/agent-session.ts` → `smoke-22` must go RED, esp. the read-only-session test; (F2a) append the 5 `DEBUG_MARKERS` to the copy's `build/cocosair.module.js` → `smoke-23` test 1 RED; (F2b) append a static `import ... from '/__debug/agent-session.js'` to `examples/automation/main.js` → `smoke-23` test 3 RED; each must return GREEN after restore. Retest pairs with R7a, since both suites live inside the unprotected 29-file inventory.
- R7g [NEW, F-39 blocking] Bind asset content: S15-FREEZE in `spec-compliance-audit.cjs:234` must require size>0 + recorded content hash (shared helper with the R7f screenshot fix; hash captured by v11-examples-verify). Retest: 0-byte and garbage `BoxTextured.glb` in gltf-basic must each EXIT 1, healthy re-capture EXIT 0.
- R7h [NEW, F-40 non-blocking hygiene] Make `coverage-report.cjs` machine-enforceable (`process.exitCode` from the tier pass flags, or a `verify:api-coverage` wrapper + npm script) and name the authoritative entry point. Retest: with the current 6.8% Core it must EXIT non-zero, and after R2 backfill it must return to 0.

## R8 — Docs-as-consumption (A6)
- Execute Quick Start / glTF+decoder / DevTools / Gallery doc commands in each isolated consumer; confirm filenames/pkg/API/DOM-precondition/deploy-path/error-codes/support-state match artifacts.

Exit: overall release PASS only when R0-R7 mandatory gates are PASS on a frozen candidate with bound evidence and stated real backend.
