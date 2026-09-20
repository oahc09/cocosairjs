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


---
## FIX-WAVE STATUS 2026-09-19 (F-48 / F-49 / F-50, evidence `raw/gates/fixwave-r7-2026-09-19.log`)
- R7a CLOSED: `tools/verify/test-inventory.cjs` + `docs/test-inventory.json` + `npm run verify:test-inventory`. Recorded retest satisfied: `-- --testPathIgnorePatterns=smoke-11` -> EXIT 1 "required suite not executed" (was GREEN 28/188). Three further injections DETECTED (suite removed, title renamed, test.skip).
- R7c CLOSED: missing decoder -> 3 structured failures, stderr 0 bytes, EXIT 1 (control EXIT 0).
- R7f CLOSED: S11-SCREENSHOT now binds on-disk bytes + sha256[0..16) to the evidence record; DevTools producer now records the hash like the browser producer. NC-C1 (delete), NC-C2 (same-size garbage -> hash branch), NC-C2b (truncation -> bytes branch) all EXIT 1; fresh real-Chromium re-capture reproduces the same frame and passes.
- R7g PARTIAL: `assetDigestsOf()` recorded by all three producers + S15-ASSET-BIND enforced; 0-byte and same-size garbage DETECTED. Still open: provenance of an asset that was already wrong at capture time (needs R1), and in-repo re-evidence (F-49).
- R7h CLOSED: exit code from tier flags + `npm run verify:api-coverage` named as the authoritative entry; both directions proven. The underlying Core 100% shortfall is R2 work, untouched.
- F-46 OBS-3 CLOSED (`.git` tolerated, `gitAvailable` reported) and OBS-4 CLOSED with a deliberate contract choice: revision is ATTRIBUTION (must be a commit reachable from HEAD), not freshness - demanding `revision == HEAD` was rejected as it would force a 30-recipe browser re-run per unrelated commit; the recorded-vs-HEAD delta is printed in `docs/v06-final-gate.md` instead.
- R4/R0 consequence: `sourceHash` (ac1b1515...) unchanged by this wave, so the F-45/F-46/F-47 off-tree rebinds remain valid; the re-freeze is recorded in `candidateFreeze.refreeze_afterFixWave`.
- NEW blocking item for the plan: re-run `v11-examples-verify --ids=gltf-draco,gltf-meshopt,gltf-morph,gltf-skin,runtime-asset-release` + `v11-devtools-examples` in-repo (needs authorization; rewrites uncommitted evidence), then `verify:v06-gate`. Until then `npm test` is RED via smoke-29 by design, not by accident.


## R7g COMPLETION STATUS 2026-09-19 (asset content binding, F-51/F-52/F-53)

- R7g **CLOSED for the offline surface, with a disclosed limit**: binding scope is now `spec.assets ∪ assets/**`
  (65 files / 4.9 MB over 8 stable examples; only 7 paths were declared). Producer records
  `{path, declared, bytes, hash, present}`; consumer asserts zero-byte (`S15-ASSET-ZERO`), bound-but-absent,
  unbound-new-file and bytes/hash mismatch. Evidence: `raw/negctl/nc-r7g-asset-content-binding.log`.
- **Corrected command list** (supersedes the 5/6-id lists in the fix-wave log §9/§9b):
  `node tools/verify/v11-examples-verify.cjs --ids=static-model,gltf-viewer,gltf-basic,gltf-draco,gltf-meshopt,gltf-morph,gltf-skin,runtime-asset-release`
  then `node tools/verify/v11-devtools-examples.cjs` then `npm run verify:v06-gate`.
- R7g-limitation (new, non-blocking, = F-52): per-asset loadability at capture time is not proven for catalog-style
  examples (gltf-viewer PASSed all 7 validators with one 0-byte model). Unlock = R1 provenance or per-asset coverage.
- New R-item to keep in view: `docs/evidence/v06-catalog-runtime-gate.json` lists assets with `path/bytes/usage` but
  **no hash** — same content-binding gap in the v06 catalog gate, not covered by `run.assetDigests`.

## R7g-5 RE-EVIDENCE EXECUTED (2026-09-19 12:01-12:14Z, user-authorized)

| step | command | result |
|---|---|---|
| pre-write snapshot | 149 files + MANIFEST.txt in `E:/qoder-fixwave-2026-09-19/pre-reevidence-200119` | done before any overwrite |
| pilot | `node tools/verify/v11-examples-verify.cjs --ids=static-model` | PASS (proves NODE_PATH playwright works in-repo) |
| subset | same, 7 remaining browser ids | 7/7 PASS |
| full | `node tools/verify/v11-examples-verify.cjs` (no --ids) | **40/40 PASS, partial=false** (chosen so the committed claim is not a subset merge) |
| DevTools | `node tools/verify/v11-devtools-examples.cjs` | **5/5 PASS**, runtime bundle boundary PASS, artifact.hash present on all 5 |
| R7g gate | `node tools/examples/spec-compliance-audit.cjs` | **45 examples: 0 fail / 1 warn**, EXIT=0 |
| suite | `npx jest --ci` | **29 suites / 207 tests PASS**, 62.4 s |
| V0.6 | `node tools/verify/v06-report.cjs` | **EXIT=1** - pre-existing, see F-56 |

Status changes: **F-53 cleared (recorded as F-57)**, F-51 already fixed, new **F-55** (three identical
DevTools frames; spec decision, not tooling) and new **F-56** (golden dual-track + 30 recipe runs stale
against current `sourceHash`).

### Open R-items after this pass
- **R0** frozen-candidate browser forensics — still NOT_RUN (copy lacks the grafted toolchain).
- **R-NEW (from F-56)** V0.6 track re-run: `run-recipes-browser.cjs` + golden dual-track + jest --json into
  `output/v06-review-jest.json`, then `v06-report.cjs` until status=PASS. Independent of R7g.
- **R-NEW (from F-55)** replace bare `visible-frame` with an example-distinguishing visual validator.
- **R1** two example `.LICENSE.md` files + extend upstream provenance manifests (only 25/65 asset files,
  38.5% of bytes, are provable against a shipped manifest today).
- **R1b** gltf-meshopt absolute decoder path; **R1c** Gallery-static vs DevTools profiles (F-34/F-35).
- **R2** API denominator (Core 49/717); **R3** Firefox/WebKit; **R5** real-LLM Agent track; **R6** perf/≥50
  dispose exclusive run; **R8** docs-as-run consumers.
- **v06 catalog `assets[]` has `path/bytes/usage` but no `hash`** — the same class of hole R7g closed for
  examples; still open for recipes.

## R4 / F-56 CLOSED — full V0.6 track re-run in the repo (2026-09-19 21:00–21:12 +08, user-authorized)

Evidence: `raw/gates/v06-fulltrack-2026-09-19.log`; pre-overwrite hash manifest
`E:/qoder-fixwave-2026-09-19/pre-v06-13-00-23/MANIFEST.json` (69 files).

- Started from a **clean tree at e06d2988**; nothing relaxed: `validateEvidenceSet`, `artifactExists`,
  `scenarioHash`, the `sourceHash` equality and the revision-reachability assertion all ran unchanged.
- `run-dual-track.cjs` EXIT 0 → 10 rows (9 PASS + B051 EXPECTED_UNSUPPORTED), agent metrics
  Type-B 6 / first-compile 1.0 / final 1.0 / median repairs 0.
- `run-recipes-browser.cjs` EXIT 0 → **30/30 PASS**, 30 distinct `scenarioHash`, single revision `e06d2988`.
- `npx jest --ci --json --outputFile=output/v06-review-jest.json` → success, 29 suites / 207 tests.
- `node tools/verify/v06-report.cjs` → **EXIT 0, status=PASS, blockers=[]**. Immediately before this pass
  (recorded 2026-09-19T12:16:03Z in git) it was `BLOCKED` with **3 blockers** and **30** recipe
  `evidenceFailures`; the 4-blocker figure in the earlier fix-wave log was a different, still-older state.
- Independent RAW recompute by the auditor: 60/60 recipe artifacts re-hashed off disk with 0 unbound.
- **`v06FinalGate_recipe` removed from `blockingForRelease` (11 → 10).**
- Two NEW non-blocking findings came out of the same run and stay open:
  - **F-60** — recipe `visual` assertion is non-discriminating: 24 distinct PNG hashes for 30 runs;
    `R022=R023=R024=R025` (clearcoat/transmission/anisotropy/iridescence share one frame), plus
    `R001=R006`, `R004=R010`, `R005=R009`. Retest = the 4 extension recipes must yield 4 distinct artifact
    hashes, or their specs must stop claiming per-extension visual proof. Needs an owner decision.
  - **F-61** — `v06-catalog-runtime-gate.json` still records revision `3a53957` (sourceHash matches, so it
    passes the ancestor test). Retest = re-run `tools/verify/v06-catalog-gate.cjs` so all three V0.6 inputs
    name one revision, or make `v06-report.cjs` warn on per-source revision drift.
- Still open from before, unchanged by this pass: **R1** licenses/provenance, **R1b/R1c** Gallery
  self-containment, **R2** API denominator, **R3** Firefox/WebKit, **R5** real-LLM Agent, **R6** exclusive
  perf, **R8** docs-as-run, and the catalog `assets[]` **missing `hash`** (recipe-side twin of the R7g hole).
- Process note (F-61 §8c): never run `git status` while a capture runner is writing `docs/evidence/**` —
  it broke git's index refresh once here.

## F-54 CLOSED / F-61 RE-RUN -> CORRECTED (2026-09-19 21:44-21:56 +08, user-authorized)

- **F-54 -> CLOSED** by `.gitignore:21 !docs/audits/**/raw/**` (F-64). Retest now: `git ls-files
  docs/audits | grep -c "\.log$"` = 84 with on-disk 85 (in-flight stdout) and 0 tracked-but-missing; the
  next commit needs no `git add -f` for raw logs.
- **F-61 -> corrected, not closed** (F-65). Executed option (a): catalog gate re-run at HEAD `33b4281` =
  100/100, same `sourceHash ac1b1515`, revision now equals HEAD. `v06-report.cjs` still PASS / blockers [].
  But `revision.recorded` = `[e06d298, 33b4281]`: re-running only the lagging source cannot merge the pair,
  because `33b4281` itself is the commit that recorded `e06d298`. Retest options for the owner:
  (i) label revisions per source (`revision.perSource`) and keep the ancestor + sourceHash assertions
  unchanged - recommended, presentation-only edit to one gate script; (ii) re-run all three captures at one
  HEAD to force a single recorded value, knowing it becomes "one behind" again at the next commit;
  (iii) close F-61 as won't-fix with the invariant documented. All three need authorization for `tools/`.
- **Unchanged by this pass**: F-60 (recipe frames), R1 (2 sidecars + provenance policy, census restated in
  F-66), R1b/R1c, R2 (3/3 tier gates FAIL), R3, R5, R6, R8, catalog `assets[] hash`, F-58, F-63.

## r23 — authorised fix wave landed, browser gates handed back (2026-09-20)

Candidate under test: `d705a2c8b8eadd68` (build/cocosair.module.js + .d.ts + examples/shared). Fixes are **committed as `3692554`** (no push) after the owner added "提交当前修复到 git"; `build/cocosair.module.min.js` was stale-at-2026-09-17 and missing the F-70 uuid while sitting in package.json `files`, so it was rebuilt in the same commit (candidate fingerprint unaffected).

Owner re-run (the runs I must not perform) and the machine-checkable expectations afterwards:

- `node tools/verify/v11-examples-verify.cjs` (40 ids) → `material-unlit` PASS with `material-property`
  readback `UnlitCube.effect === 'builtin-unlit'`; evidence carries `completed:true`; no threshold touched.
- `node tools/verify/v11-devtools-examples.cjs` (5 ids) → new checks `dispatch:duplicate-requestId`
  (nodeCount unchanged, no shadow node) and `session-self-report-codes` (in-page observed code === gate
  observed code) PASS for rc-create-node / rc-error-report.
- `node tools/examples/coverage-report.cjs` + `node tools/examples/spec-compliance-audit.cjs` → zero
  `NOT_RUN` / `S11-EVIDENCE-NOT-RUN` rows; `S11-NO-EVIDENCE` and `S15-ASSET-BIND` cascades clear; verified
  count recomputed from the fresh apiProof (interim `verified 0` is a contract effect, not a regression).
- Retest for F-72 itself: run the matrix, kill it mid-flight, and confirm the previous complete evidence
  file is adopted unchanged (`readEvidence` → COMPLETE on the old generation, target never torn).
- If `material-unlit` still FAILs `material-property`, the residual suspect is the effect-name readback path
  in the runtime (`Material.effectAsset` naming), not the validator — do not soften the validator.

Still open and unchanged by this pass: F-78 (decoder/worker gate expectation vs vendored bytes — owner
decision), F-79 (clean-room delivery defects), F-69/F-71 (API surface), F-60, F-63 (`.gitignore:15`),
F-81 (shared-worktree evidence collision — now also visible as last-writer-wins between two atomic
producers), R1/R1b/R1c/R2/R3/R5/R6/R8, 13th `button-click` validator, `visible-frame` discrimination,
documented-only gate (0/4729).

## r23b 更新（2026-09-20）：V0.6 已在新 bundle 上重采，剩一条 jest 货币红

- dual-track / recipes / catalog 已在 `sourceHash 4e4fd374e33166ce` 上重采（EXIT 0，10 refs / 30 / 100）。`v06-report.cjs` blockers 由 2 → **1**：「本轮 Jest 结果尚未通过或缺失」。
- `npx jest --ci` = 207/208，唯一失败 `smoke-29`（§11 证据链）45 例 `S11-NO-EVIDENCE`/`S11-PROMOTION-DRIFT` → 与 r23 的 `S11-EVIDENCE-NOT-RUN` 同一因。**owner 重跑 r22 矩阵 + DevTools 门禁后复测**：`npx jest --ci` 必须 208/208，`node tools/verify/v06-report.cjs` 必须 PASS/blockers=[]，`node tools/examples/coverage-report.cjs` 的 `verified` 必须从 0 回升且 `evidenceSources[*].status=COMPLETE`。
- 新增复测项 F-82：`node tools/verify/published-artifacts.cjs`（现在 EXIT 0）；副本里把 min 换回 `3692554^` 的字节 → EXIT 1 并点名 uuid。
- 期间不做：为转绿手写 `completed:true`、调 recipe 视觉容差、弱化 `material-property`。
