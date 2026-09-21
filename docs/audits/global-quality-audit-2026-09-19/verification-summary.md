# Cocos Air — Global Quality & Delivery Audit (verification-summary)
Audit ID: global-quality-audit-2026-09-19 · Role: independent global auditor (read-only)
Candidate: HEAD 3a53957 + 104 dirty/untracked files (104 file hashes in baseline.json) · Env: node v24.14.0, npm 11.11.1, win32 · GPU: RTX 4060 + AMD 890M + a "GameViewer Virtual Display Adapter"

## Overall: NOT_READY for an RC/1.0 / V1.1 release claim
Reasons (each a hard gate, not averaged): candidate is not a frozen snapshot; API-Coverage, License and Recipe-evidence gates FAIL; the entire browser-dependent verification layer (example-stable, glTF-21-visual, gallery, devtools, benchmark, agent, perf/lifecycle) is BLOCKED/NOT_RUN because project-pinned Playwright is absent in this environment. No remote publish/deploy is claimed.

## Verified PASS (this run, on current source)
- Full Jest suite: 29/29 files, 207/207 tests green (~93s). Discovery==executed==passed; 0 only/skip/todo masks found.
- verify:web-only: PASS. decoder-audit: PASS.
- Runtime delivery boundary: `npm pack` = 73 files / 6.3MB and EXCLUDES build/devtools & build/examples; offline `consumer-acceptance` imported 368 exports (no browser). "Runtime has no debug/gallery/benchmark" is satisfied in the shipped artifact.
- Example spec structure: `spec-validate` 45/45 frozen, 0 draft, 0 blocked.
- Coverage honesty: claimed==verified==63 (no inflation), consistent with commit "claimed=verified 零冒充".

## FAIL (blocking)
- API-Coverage vs contract: core 49/717 (6.8%) [req 100%], important 6/793 (0.8%) [req ≥90%], advanced 8/3219 (0.25%) [req ≥80%]. Denominator totalUnits 4729. Either backfill verification or formally re-adjudicate the frozen denominator (auditor must not lower it).
- License: `license-audit` exit 1, issues=3 — missing `.LICENSE.md` for draco.glb & meshopt-khr.glb; `build/examples` unexpected-dir hygiene note.
- Recipe evidence: `v06-report` exit 1 — 30/30 recipes `sourceHash mismatch`; blocker "本轮 Jest 结果尚未通过或缺失" (its own jest-binding not satisfied).
- Candidate integrity: parallel session mutates the tree (examples/mesh-sphere/example.json mtime <15min; user memory "Parallel audit session"), so evidence cannot bind → all hash gates read stale.

## NOT_RUN / BLOCKED (honest; not signed PASS)
- Example stable verification (0/40), Gallery standalone, DevTools examples, browser matrix, glTF 21-extension real-render/device evidence: BLOCKED — `Cannot find module 'playwright'`. Classified INFRA/BLOCKED, NOT Engine FAIL.
- Benchmark (≥100 pts, eligible/FinalSuccess/FirstCompile recompute from raw), real generated-source Agent track (fresh build/page, isolation, correct-refusal), BoxTextured 30-load median (≤15%) + ≥50 dispose lifecycle, clean-room three independent consumers, controlled negative controls, docs-as-consumption: NOT_RUN this pass (need isolated env + browser + exclusive resources/agent budget).

## Audit side effects (disclosed)
Running gates' own generators rewrote 3 deterministic evidence artifacts (pre→post hashes in baseline.json): api-coverage-report.json (4b507417→7f08f291), v11-spec-validate.json (df399503→7bfd3b9a), v11-spec-compliance.json (1ade1f8b→a0767007). No source/assertion/threshold/reference-image/license/package/credential touched. No stage/commit/push/publish/deploy. Owner may re-run the capture pipeline on a frozen snapshot to restore authoritative bytes.

## Deliverables in this folder
baseline.json · effective-requirements.json · traceability.json · contract-decisions.md · test-discovery.json · evidence-index.json · findings.jsonl (F-01..F-12) · global-verdict.json · retest-plan.md · this summary. Raw jest log retained. Private benchmark answers not referenced in public report.

---
## UPDATE — browser layer independently reproduced (Playwright wired via NODE_PATH)
Root cause of the earlier 0/40 was simply that Playwright lives outside the repo (`~/.workbuddy/binaries/node/workspace/node_modules`); the project convention is `NODE_PATH=<that dir>`. Re-ran the browser gates on real Chromium:
- Example stable verify: **40/40 PASS** (real render/validator, 0 promoted -> sources untouched). gltf-draco/gltf-meshopt PASS only under "decoder-required capability" expectation, NOT forward-decode proof.
- DevTools examples: **5/5 PASS** + runtime bundle boundary PASS.
- Gallery standalone: **13/13 PASS** (static 200s, list=45, nested deep-link /apps/gallery/mesh-sphere/, 0 page errors).
- Catalog runtime benchmark: **100/100** (v06-catalog-gate EXIT0).
Remaining true blockers (no longer browser-availability):
- **API Coverage FAIL**, **License FAIL (3)**, **V0.6 final/Recipe FAIL** — v06 computes one repo-wide sourceHash that must match golden-dual-track + catalog + 30 recipe evidences; re-capture did NOT fix it because the tree keeps drifting (parallel session) and golden dual-track evidence is stale.
- **v06-lifecycle-gate = INFRA** (pins chromium-1234, absent from cache 1193/1217/1228/1244) — not an engine regression.
- **Browser matrix 1/3** (Firefox/WebKit binaries not installed) -> FF/Safari support NOT claimed.
Still NOT_RUN: real Agent generated-source track, fresh golden Benchmark recompute, BoxTextured 30-load/50-dispose perf, controlled negative injections, isolated clean-room 3-consumer docs test.
Overall remains **NOT_READY**; browser reproduction strengthened rather than weakened the verdict.

---
## UPDATE 2 — executed negative controls (A2 §5) + runtime tarball byte audit (A3 §5.1/§5.3)
Both run in scratch dirs OUTSIDE the repo; original tree never modified (verified: no injection markers in any source example).

**A2 anti-stale negative controls (coverage gate is content-driven, not fixed PASS):**
- Pristine copy: verifiedUnits=63, stale=[].
- N1 tamper sole-verifier `camera-multi` (substantive field): verifiedUnits 63→62, `Layers.makeMaskInclude` de-verified, stale=[camera-multi]; restore → 63.
- P2 tamper only `status` field: fingerprint UNCHANGED (status/promotionEvidence excluded by design) → verified stays, no false invalidation.
- spec-validate --strict isolated control INCONCLUSIVE (my minimal copy lacked a sibling module → import error, not a real rejection); NOT counted as passed.
- Browser-dependent injections (decoder removal / stop animation / texture break / stale screenshot / agent compile-fail / sacrifice isolation) remain NOT_RUN.

**A3 runtime tarball byte audit (current build bytes; NOT a clean-room rebuild):**
- 73 entries. Boundary CLEAN: excludes build/devtools, build/examples, tools/, test/, src/.
- Ships: normal+min js, d.ts, js.map; build/gltf-decoders draco/basis/meshopt (js+wasm) each with LICENSE.md + MANIFEST.md + package.json; root LICENSE + THIRD_PARTY_LICENSES.
- Map hygiene: sourceRoot none, 571/571 sources relative ../src/..., **0 host absolute paths** → no leak. Note: sourcesContent embeds all 571 engine .ts (full engine source inside map) — size/disclosure choice, confirm intended.
- Sub-risk: `exports` maps only "."; no subpath for build/gltf-decoders/*; runtime resolves decoders via build-time `external:emscripten/…` (mesh-codec.ts:92-99). Offline decoder LOAD from an installed package is runtime URL/base-path behavior, unverifiable from the tarball → stays NOT_RUN pending isolated J01/J03 consumers.
- Gate moved PASS → **PARTIAL**; findings F-19, F-20 added (total 20). Overall remains **NOT_READY**.

---
## UPDATE 3 — raw recompute (Benchmark/Agent/Recipe) + §5.2 static boundaries (this pass, no side effects)
- **Recipe (F-21):** recomputed from RAW — 30 runs result=PASS, 30 json+30 png artifacts present with 0 missing/0 byte-hash mismatch, promoted=30 stable (≥20 RC floor). FAIL is *currency* only: run-level sourceHash=f5eb vs current tree ac1b (30/30 drift), not tampering nor engine defect. Clears with R0 freeze + R4 re-capture.
- **Benchmark/Agent (F-23):** recomputed over v06-golden-dual-track RAW = only **10 rows, single-attempt, bound to revision 'working-tree'**. §33-36 metrics honest (B051 device-unsupported correctly excluded → eligible=9, agentPass 9/9, FirstCompile restricted to Type-B, medianRepair 0, no engine-FAIL/INFRA/INVALID). But insufficient-by-construction for the Agent Gate (needs ≥100 pts × ≥3/≥5 reps pinned to frozen rev). 9/9 golden ≠ passing Agent Gate.
- **Runtime tarball (F-20):** 73 files, boundary clean (no devtools/examples/tools/test/src), decoders+LICENSE shipped, map has 0 host-absolute paths. Downgraded PASS→PARTIAL: package exports exposes no `gltf-decoders` subpath and offline decoder load / clean-room rebuild not yet executed.
- **Gallery §5.2 (F-24):** delivered `build/examples/` artifact is boundary-clean — 45 precompiled `main.boot.js` entries (no runtime TS compile), viewable src, relative engine/decoder static deps, **no `/__debug/` endpoint**. Repo dev-server's `.ts`-transform + `/__debug/` injection is dev-only and correctly excluded from the shipped gallery. → PASS (added to browser 13/13).
- **Docs (F-22):** static symbol check vs d.ts clean; AirNode/offline-importer grep hits are negating statements → contract-compliant. Consumer *execution* still NOT_RUN (R8).

Net: all audits executable read-only / without exclusive resources are complete. Overall remains **NOT_READY**. Remaining blockers require user authorization (R0 freeze, R2 frozen API-denominator approval) or unavailable environment (Firefox/WebKit, chromium-1234, exclusive perf, isolated clean-room consumers + network-block, real-LLM Agent budget).

---
## UPDATE 4 — reverse-scan + denominator-granularity evidence (F-28, read-only)
- **Reverse-scan (all example claims → inventory):** only 5 claims map to NO unit — all `DevToolsSession.*`. coverage-report skips them (`if(!frozen[claim]) continue`), consistent with the contract (DevTools is a separate explicit profile, outside the runtime denominator). Consequence: **DevToolsSession public surface has zero coverage accounting in any tier gate** — a genuine gap to close, not a drift/violation.
- **Denominator shape:** 4729 units derive from just **682 top-level owners (avg 6.9)** and are method-granular: ~4066 dotted method-level, **477 `.constructor`**, **136 underscore-private** members, each independently gated vs Core100/Imp90/Adv80.
- **Reading:** the aggregate "core 6.8%" cannot be treated as a like-for-like public-*class* API target until R2 confirms this unit granularity is the frozen intent. Auditor does NOT lower the denominator — flags it for formal adjudication (sharpens F-18). apiCoverage verdict unchanged (FAIL; scope UNRESOLVED).

---
## UPDATE 5 — two evidence UPGRADES from reading locked Jest (F-29, F-30)
Correcting earlier under-claims (these tests ran in the confirmed 207/207 green suite, 0 skip/only, real wasm/objects not metadata-only):
- **glTF decoder chain (F-29) -> forward-decode + error-recovery PASS:** smoke-11 uses REAL vendored wasm decoders (throws if WebAssembly absent) to forward-decode draco+meshopt to expected geometry, plus real encoder round-trips, and exhaustively asserts error paths (GLTF_DECODER_MISSING / GLTF_EXTENSION_INVALID / GLTF_DECODE_FAILED incl. oversized+truncated bounded-alloc / corrupt-bitstream GLTFError / accessor-count mismatch). Non-goals kept: browser external:emscripten resolution (F-20), on-device GPU, and **KHR_texture_basisu/KTX2 = 'decoder-required' UNIMPLEMENTED** -> 21-extension set NOT fully forward-supported.
- **Lifecycle chain (F-30) -> functional correctness PASS:** smoke-12 evidences load->shared-asset (EXT_mesh_gpu_instancing 3 instances share asset.meshes[0]) -> independent (two refs -> distinct components) -> dispose (instance.dispose()+asset.destroy()+_deferredDestroy), and runtime-asset-release example carries a resource-released lifecycle validator. The contract's SCALE bar (>=50 dispose loop, BoxTextured 30-load median <=15%, memory=unavailable) is NOT met by these single-shot tests -> perfLifecycle scale portion stays NOT_RUN (R6).
- **§4 test-credibility on the Agent-labelled suite (F-31):** smoke-22 `agent-session` is a legitimate, non-degenerate **harness/contract** test (all async awaited, negative paths genuinely expected): STALE_TARGET (destroyed node + scene swap), whitelist INVALID_ARGUMENT/OUT_OF_SCOPE/UNSUPPORTED_ACTION, atomic setTransform (no partial apply), setWorldScale correctness, requestId dedup in-flight AND in retain-window, SESSION_CLOSED, LOAD_FAILED preserving gltf cause, shared-asset-cache survives one session's close, captureFrame AFTER_DRAW controlled timing + **refuses to return a stale screenshot** (CAPTURE_FAILED on unreadable jsdom canvas / close-during-capture / scene-swap-during-capture), error ring-buffer 200/dropped=5, hook attach/detach + prelude-hub dedup. No fixed-PASS / swallow / mock-main-path. **BUT** it drives `AgentSessionImpl` in-process and never invokes a real LLM nor a fresh-build/fresh-page source loop, so per contract "scripted solver 不算 LLM 能力" it is necessary-not-sufficient and does **NOT** count toward Agent Gate -> agentGate stays NOT_RUN/INSUFFICIENT (R5). Its stale-screenshot refusal is, however, direct §4 evidence against the "expired screenshot impersonation" failure mode.

- **§6 clean-room pack + real consumer (F-32) -> runtime boundary EVIDENCED-PASS:** in an offline scratch OUTSIDE the repo (no importmap/symlink bypass), `npm pack` produced the real 73-file tarball (raw/cleanroom/pack-list.txt, 6.3 MB) containing ONLY `build/*` (+ draco/basis/meshopt each with `LICENSE.md`) + top-level `docs/*.md|json` + README/LICENSE/THIRD_PARTY_LICENSES/UPSTREAM. Forbidden scan: **no** `tools/`, `examples/`, `src/`, `__debug`, benchmark **runner**, `node_modules`, `.git`, `.env`/secret — and `docs/audits/**` (this report + private answers) is excluded -> contract "Runtime excludes debug/Gallery/Benchmark-runner" + "publish dir" confirmed from real bytes. `npm install --offline` of the local tarball succeeded with zero registry calls; the bare specifier resolved via `exports['.'].import` and Node24 parsed the ESM body (so NOT an interop SyntaxError); the shipped `.d.ts` typechecks a bare-specifier `nodenext` consumer (Scene/Node/createAirApp) EXIT 0. Honest limit: the entry runs eager top-level DOM (SystemInfo navigator/canvas + ScreenAdapter `document.body.appendChild`) so it is not importable in DOM-less Node/secondary-realm jsdom — which is exactly why jest-environment-jsdom (realm-as-global) and real Chromium (gallery 13/13) succeed. NOT covered: rebuild-from-src byte reproducibility (used current `build/`; R0) and DevTools/Gallery as separate installed PACKAGE consumers (intentionally absent from the runtime tarball -> itself the contract-satisfied finding; their artifact was validated in F-24).

Net: verdicts apiCoverage/license/recipe/candidateIntegrity unchanged (still blocking); gltf21ForwardVisual and the lifecycle-correctness sub-part strengthened with real evidence; §6 runtime-package boundary moved NOT_RUN->PASS. Overall **NOT_READY**.

---
## UPDATE 6 — F-34/F-35 Gallery-static clean-room (executed offline, artifact served from its OWN root)
Reproduced with a captured raw log (not a paraphrase): plain node http static server rooted at build/examples, no /build/ host route and no /__debug/ endpoint -> raw/gallery-static/offline-static-probe.txt:
- 200 /gltf-meshopt/main.boot.js | **404 /build/gltf-decoders/meshopt/meshopt_decoder.mjs** | 200 /gltf-decoders/meshopt/meshopt_decoder.mjs | 200 /gltf-meshopt/assets/meshopt-khr.glb | 200 /cocosair.module.js
So the meshopt decoder FILE ships but the compiled boot.js asks for a host-absolute URL -> **F-34 FAIL (blocking)**. Root cause is the artifact builder rewrite guard (v11-gallery-artifact.cjs:46 requires a trailing slash) vs the example's concatenated source literal. My earlier green 13/13 gallery run was a false negative: the dev server silently supplies /build/.
Full sweep of all 45 shipped main.boot.js (raw/gallery-static/absolute-url-scan.txt) -> exactly **2 unguarded absolute URLs, both in status=stable examples**: gltf-meshopt (/build/ decoder) and **automation (/__debug/agent-session.js, unconditional import + uncaught rethrow)**. 4 rc-* files use window.__debugBase || "/__debug".
- **F-35 self-correction:** F-34 first described all 5 rc-*/automation hits as "guarded = disclosed boundary, not a leak". Wrong for automation (no guard, rethrows), and the guard is only a base OVERRIDE (a host must inject __debugBase) — it does not make the dependency optional. Correct statement: 6 shipped examples are stable AND require the dev-server debug endpoint, so the Gallery-static artifact cannot self-execute them offline. This supersedes F-24's "no /__debug/ in shipped build/examples" clause.
Net: galleryStandalone PASS->PARTIAL, exampleStableVerify PASS->PARTIAL, blockingForRelease gains a gallery-static self-containment item. Overall stays **NOT_READY**. Runtime npm tarball result (F-32) is unaffected. Remediation + retest: R1b.

---
## UPDATE 7 — §6 clean-room REBUILD from source (F-36, executed in a full copy outside the repo)
- Copied the ENTIRE working tree (including all uncommitted files) to E:/qoder-rebuild-audit-2026-09-19/repo along with a copy of the repo's pinned `node_modules` (no tool downloads), recorded the shipped artifact hashes, **deleted `build/`**, then ran `tools/build/build.cjs --format esm`, `--format esm --min`, `tools/build/build-dts.cjs` -> all EXIT 0 (23.3s / ~12s).
- **All four shipped runtime artifacts came out byte-identical**: cocosair.module.js `c75d5961a6f8…`, .min.js `1c41316ba85a…`, .d.ts `ff987a513ddb…`, .js.map `ca3e56d50ef4…`; a third base build `cmp`-identical to run #2 -> deterministic and path-independent (different drive, no host-absolute paths leaked into the bundle). So the shipped `build/` is honestly derived from the current source; what R0 still blocks is *evidence hash-binding* while the parallel session mutates the tree, not fabricated artifacts.
- Non-blocking hygiene: `npm run build` alone emits only module.js/.map + package.json — min and .d.ts require the other two documented scripts, so no single command regenerates everything in `files`. The repo's `build/` holds 1520 files but the documented build regenerates 13; the rest are committed intermediates (`.dts-before-bundle` 787 files, three `.tmp-v03-site-<timestamp>/nested` dirs, `.tmp-rollup-cache`, plus the gallery `examples/`). The npm tarball is unaffected (F-32). `build:dts` prints `Failed to resolve type import('pal/input/…').InputSourcePosition …` warnings yet exits 0 with identical output -> pre-existing, non-material.
- Raw: raw/rebuild/{original-build-hashes.txt, build-before.txt, rebuild{,2,3}.log, rebuild-min.log, rebuild-dts.log, L1, L2}. Scratch copy deleted after hashing (7.1 GB reclaimed); the 73-file tarball scratch remains under E:/qoder-cleanroom-audit-2026-09-19.
- Method self-correction: my first two hash-comparison attempts mis-parsed `sha256sum` output (`hash *path`, binary marker) and printed false DIFF/SAME rows; the numbers above were re-derived with explicit full-hash comparison, and F-34's raw probe was likewise re-run from scratch after a Windows path-normalization bug made every URL 404 — both corrected before being recorded.

Overall remains **NOT_READY**: F-34/F-35 gallery-static defects plus the pre-existing blocking set are unchanged.

---
## UPDATE 8 — §5 negative controls by real fault injection (F-37, isolated copy + one CLI-flag-only run)
Three of the eight mandated controls were actually injected this pass; the honest split is **1 detected / 1 NOT detected / 1 inconclusive**.
- **NC-B remove decoder — PASS (gate has teeth).** In `E:/qoder-negctl-audit-2026-09-19/repo` (whole tree, no node_modules), `node tools/verify/decoder-audit.cjs` gave EXIT 0; after `mv build/gltf-decoders/meshopt` the same command gave **EXIT 1**. Quality caveat: the failure is an unhandled `MODULE_NOT_FOUND` crash, not a structured diagnostic. Bonus: because decoder-audit requires decoders out of a real `npm pack` output (`build/.tmp-pack-audit-<ts>/package/...`), this also proves the **shipped tarball's decoders are require-able from the package**, narrowing F-20's "offline decoder load from installed package" from unknown to tool-level PASS.
- **NC-A exclude a required test — FAIL (detection gap, Engine/process-side, not INFRA).** `jest --listTests` = 29 files; `node node_modules/jest/bin/jest.js --testPathIgnorePatterns smoke-11` in the original tree (file read-only, CLI flag only) returned **28 suites / 188 tests / EXIT 0 — fully GREEN**. 207−188 = the 19 excluded tests vanished with no gate complaining: the required inventory is convention, `jest.config.js` has no `coverageThreshold` and no suite-count assertion, so deleting or silently excluding any whole area still ships green. This is exactly the failure mode §5 exists to detect, so it is recorded as a real finding rather than a passed control.
- **NC-C stale/missing screenshot — INCONCLUSIVE (my harness gap, not a project defect).** After deleting `docs/evidence/examples/hello-cube.png` in the copy, `tools/examples/spec-validate.cjs` exited 1 for **both** control and injected runs because it resolves `'<repo>/node_modules/esbuild'` by absolute path and my copy had no node_modules → the comparison is void; re-run needed in a node_modules-bearing copy (the F-36 recipe works). What *did* run cleanly: `generate-manifest` and `coverage-report` after the deletion — captured in raw as the honest remainder of that control.
- **Flakiness disclosed (candidateIntegrity consequence).** The FIRST identical NC-A command reported `2 failed suites / 171 tests`; the second reported all-green EXIT 0. Only the green run has a retained raw log; both are stated. Under the live mutating tree single-run green claims are not reproducible and must be re-taken on a frozen candidate.
- Verdict moves: `negativeControls` stays **PARTIAL** (F-33 fingerprint controls + NC-B pass, NC-A fails), `testCredibility_jest` downgrades to **PASS-with-GAP**, and `blockingForRelease` gains **test-inventory-completeness (F-37)**. Not run at all this pass: stop-animation, break-texture-reference, agent compile-fail, sacrificial-isolation, and every browser-render injection → still R7.
- Overall remains **NOT_READY**.

---
## UPDATE 9 — §5 stale-screenshot control completed the right way (F-38, supersedes F-37 NC-C "inconclusive")
NC-C was re-run against a gate that does not need esbuild (`tools/examples/spec-compliance-audit.cjs`, i.e. the §11 "Screenshot Current" auditor) in a fresh full-tree copy outside the repo (`E:/qoder-negctl2-2026-09-19/repo`, 2.1 GB, node_modules/.git excluded).
- Control: EXIT 0, `45 examples: 0 fail / 1 warn`.
- **NC-C1 delete the PNG** (`docs/evidence/examples/hello-cube.png`, 5847 B, sha `fe6a5511883d40ab`) → **EXIT 1** with a clean structured `[FAIL] hello-cube S11-SCREENSHOT …（文件不存在）`. Existence checking has teeth.
- **NC-C2 overwrite the same path with 31 bytes of garbage** (on-disk sha `3c9d820384074fc2`, size 31, while the PASS record still claims `bytes=5847`) → **EXIT 0, still 0 fail. NOT DETECTED.** The file was then restored and re-hashed identical to the copy's original.
- Root cause is precise and two-lines-worth of fixing: the producer writes a content hash (`tools/verify/v11-examples-verify.cjs:111` → `art.hash = sha256(png)[0..16)`), but the consumer (`spec-compliance-audit.cjs:205-210`) only does `fs.existsSync(art.path) && art.bytes` truthiness — no `statSync().size` and no re-hash. So `art.hash` is written and never read: a residual §4 "metadata-only self-report" at the artifact layer, and the last unbound link of the anti-stale chain (F-33 binds spec↔evidence, nothing binds evidence↔PNG bytes).
- Consequence for this report: every §11 stable "Screenshot Current" claim is **existence-only**, so all 13/13 gallery and 40/40 example visual claims must be read as "a PNG is present where the PASS record says so", not "the captured frame is the one on disk". `negativeControls` stays PARTIAL/blocking and gains `screenshot-content-binding (F-38)`; `blockingForRelease` now has 13 items.
- Raw: raw/negctl/nc-c2-{spec-compliance-control,screenshot-deleted-detected,screenshot-tampered-NOT-detected}.log. Scratch copy deleted after capture.
- §5 controls still NOT_RUN after this update: stop-animation, break-asset/texture-reference (added as F-39 next), agent compile-fail, sacrificial-isolation breach, all browser-level injections.
Overall remains **NOT_READY**.

---
## UPDATE 10 — remaining §5 offline controls (F-39 break-asset-reference, F-40 gate exit semantics)
- Sparse isolated copy outside the repo (`E:/qoder-negctl3-2026-09-19/repo`, tools+docs+examples+package.json+build/cocosair.d.ts only) so I could re-run cheap injections without a 7 GB node_modules payload.
- **NC-D break asset reference → NOT DETECTED.** Target `examples/gltf-basic/assets/BoxTextured.glb` (status=stable, forward-decode supported, 5956 B): truncating it to **0 bytes** and then overwriting it with **garbage (invalid glTF magic)** both leave `spec-compliance-audit` at **EXIT 0, 45 examples 0 fail**, because S15-FREEZE only does `existsSync` (`spec-compliance-audit.cjs:234`). Fairness: re-running the browser verifier would catch it at capture time, so this is an offline registry gap, not evidence the engine mis-renders. `texture-basic`/`static-model` declare no on-disk asset, so gltf-basic is the strongest stable target available. Copy restored; the original repo file re-hashed identical afterwards.
- **F-40 gate enforcement is advisory.** `coverage-report.cjs` prints `Core gate (100% verified): FAIL` (and Important/Advanced FAIL) but contains **no `process.exit`** → EXIT 0, and it is not referenced by any npm script. The tool never inflates claimed→verified, so the audit blocks manually — but wiring it into CI as a gate would sail through at 6.8%. Non-blocking hygiene, distinct from the apiCoverage FAIL itself.
- Disclosure: the same raw log shows `license-audit` reporting 8 issues in my sparse copy; 6 of them (missing root LICENSE / THIRD_PARTY_LICENSES.md / UPSTREAM.md, missing decoder dirs draco/meshopt/basis) are **artifacts of my reduced copy, not project defects** — only the two example `.LICENSE.md` issues are real and already recorded as F-27. The log carries this caveat inline so it cannot be misread.
- Verdict moves: `negativeControls` stays PARTIAL with `asset-content-binding (F-39)` added to `blockingForRelease` (14 items); new `apiCoverageEnforcement` = ADVISORY note; findings = 40 lines, evidence index = 16 entries.
- §5 controls still NOT_RUN: stop-animation (browser-only), agent compile-fail, sacrificial-isolation breach, and the in-browser injections.

Overall remains **NOT_READY**.

---
## UPDATE 11 — §5 stop-animation control executed, and it HAS TEETH (F-41)
- Full isolated copy outside the source repo (`E:/qoder-animctl-2026-09-19/repo`, working tree + pinned `node_modules`, ~7 GB, deleted after capture; only the raw log is retained) so the browser verifier could run under the project convention (`NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules`) without touching the original.
- Target `examples/anim-position` (status **stable**, `validation.visual: [visible-frame, frame-diff]`, where frame-diff is a real dual-frame 400 ms pixel diff at `v11-examples-verify.cjs:275-282`). **CONTROL**: `--ids=anim-position` → runner **EXIT 0**, `result=PASS`, `1/1 PASS, 0 promoted to stable`. **INJECTED** (the `SineMover` `setPosition` line replaced by a comment, so the node never moves): same command → runner **EXIT 1**, `result=FAIL`, `0/1 PASS`. Source restored in the copy; the original file re-checked and still contains the `setPosition` line — the original repo was never written.
- This is the 2nd browser-side §5 control proven load-bearing (with F-37 NC-B decoder removal) and the first **positive** counterweight in the visual-evidence area: animation examples' stable claims are verified by real motion in real Chromium at capture time, not by "a PNG happens to exist". It also sharpens F-38/F-39 rather than softening them — the same claim that is load-bearing in the browser is **not** re-checkable offline, so a rotated or frozen artifact would pass `spec-compliance-audit` silently. That asymmetry is exactly what R7f/R7g fix, and F-41's recommendation is to reuse this run's proven contract (2-frame diff threshold must stay as-is; do not weaken it to make anything pass).
- Verdict moves: `negativeControls` stays **PARTIAL/blocking** (wording now records the DETECTED stop-animation control and shrinks its NOT_RUN list to in-browser decoder removal, texture/asset ref break at canvas, stale screenshot at canvas, agent compile-fail, correct-policy refusal, sacrifice isolation); `exampleStableVerify` keeps **PARTIAL** with the strengthened visual half noted; findings = 41 lines, evidence index = 17 entries, blocking items = 14. Overall remains **NOT_READY** — no gate improved past PARTIAL, and the two gates that could have benefited (candidate integrity, docs consumer) still need authorization/infrastructure.

---
## UPDATE 12 — last two §5 policy controls attempted and NOT RUN (F-42)
- I designed and aimed the two remaining executable §5 injections at the suites that actually own those contracts: **correct-policy refusal** → disable the `OUT_OF_SCOPE` guard throws in `tools/debug/agent-session.ts:686/704/714/818` and expect `smoke-22`'s "只读 session：写操作 OUT_OF_SCOPE" (`:222-227`) to flip RED; **sacrificial isolation breach** → plant the 5 `DEBUG_MARKERS` into the copy's `build/cocosair.module.js` and a static `import ... '/__debug/agent-session.js'` into `examples/automation/main.js`, expecting `smoke-23:28-34` / `:44-60` to flip RED.
- **NOT RUN — my harness, not the project.** A working-tree copy outside the repo (2.1 GB, no `node_modules`) cannot resolve the project-locked toolchain: `New-Item -ItemType Junction` → `NewItemCreateIOError`, `cmd mklink /J` → no link created, `cp -al` of `node_modules` → `Operation not permitted` on every file, so `node node_modules/jest/bin/jest.js` exits 1 `MODULE_NOT_FOUND`. The only recipe left is the F-41 one (tar-copy ~5 GB `node_modules`, >10 min), which did not fit the remaining turn budget. No PASS/FAIL is claimed for either control; `negativeControls` stays PARTIAL/blocking and `blockingForRelease` grows to 15 with an explicitly-attributed item.
- What the attempt did establish (read-only, and it does **not** substitute for execution): both suites are genuine — they assert on real engine-side guard throws and on real build-output bytes, with no fixed-PASS, no mocked refusal path, no metadata-only self-report. That is why they are the right targets, and why the residual risk is stated as "teeth unproven" rather than "tests are weak". It also compounds F-37: these two suites sit inside the 29-file inventory that no gate protects, so today nothing at all would notice if either were dropped.
- §5 tally after this update: executed 6 (decoder removal **detected**, stop-animation **detected**, screenshot existence **detected**, screenshot content **NOT detected**, asset content **NOT detected**, required-test exclusion **NOT detected**) + not run 3 (correct-policy refusal, sacrificial isolation, agent compile-fail). Minimal unblock is one line: let audit copies reuse the locked toolchain (developer junction, or a documented `test:copy` jest entry with `modulePaths`/`NODE_PATH` pointing at the source repo while `rootDir` is the copy); the three injections are then already scripted in `raw/negctl/nc-f-refusal-isolation-NOT-RUN.log`.
- Safety: 2.1 GB scratch copy deleted; original tree re-probed — 4 `OUT_OF_SCOPE` throws intact, 0 `if (false) throw`, 0 `NEGCTL` markers in the bundle, and `git status` reports none of the three injection targets as modified. Findings = 42, evidence = 18. Overall remains **NOT_READY**.

---
## SEALED 2026-09-19 — audit state as parked (for a cold resume)
- Self-consistency recomputed at park time: findings 42 (F-01…F-42, unique ids), evidence entries 18 with **0 referenced raw files missing**, 13 `raw/negctl/` logs, 22 gates = 9 PASS / 4 FAIL / 6 PARTIAL / 3 NOT_RUN, 15 blocking items, `overall: NOT_READY`.
- §5 ledger: executed 6 → decoder removal DETECTED · stop-animation DETECTED · screenshot-existence DETECTED · screenshot-content NOT detected · asset-content NOT detected · required-test-exclusion NOT detected; not run 3 → correct-policy refusal (F-42) · sacrificial-isolation breach (F-42) · agent compile-fail (needs R5).
- Original tree integrity at park: no source, assertion, reference image, threshold, license, package name, credential or permission was ever written by this audit; nothing staged, committed, pushed, published or deployed; all four fault injections happened only in copies outside the repo, and every copy was reclaimed (`E:/qoder-animctl-*`, `E:/qoder-isoctl-*` deleted; only small log dirs remain).
- Resume order that unblocks the most with the least: (1) R0 freeze the candidate, (2) R7i grant toolchain-in-copy (1 permission or 1 jest `modulePaths` config line) then run the 3 injections already scripted in `raw/negctl/nc-f-refusal-isolation-NOT-RUN.log`, (3) R7a inventory assertion, (4) R7f/R7g size+hash binding (keep frame-diff thresholds untouched per F-41), (5) R7c/R7h, then R1/R1b/R1c and the environment-gated R2-R6/R8.

---
## UPDATE 13 — authorization items 1+2 executed: R0 freeze + R7i toolchain graft (F-43, F-44)
User authorized exactly the two top resume items on 2026-09-19, then resumed. Both are now **executed**, and both closed their own blocking items.

**R0 / F-43 — candidate frozen.** `E:/qoder-frozen-2026-09-19/candidate` + `candidate.tar` + `SHA256MANIFEST.txt`: **3234 files hashed**, manifest first-16 digest `677cce412ce454b4`, 890880 KB, `HEAD=3a53957db6bdd009bbd85af8b7d589a0b48dba5b`, `branch=main`, `dirty=111`, `node=v24.14.0`. `node_modules`/`.git` excluded. This pass's numbers are now attributable to an immutable digest instead of a live tree a parallel session may mutate — the exact failure mode that produced the earlier flake observation.

**R7i / F-44 — the toolchain gap was audit-harness, not product.** Graft into the copy was 14 MB (`cp -r` of `node_modules/esbuild` + `@esbuild/win32-x64`, the only two packages an offline copy needs beyond the runner) and one env var. The working invocation, corrected after two failed recipes: `cd <copy> && NODE_PATH=<orig>/node_modules node <orig>/node_modules/jest/bin/jest.js --rootDir <copy> [substring]` — **`--modulePaths` does not satisfy jest's `preset: "ts-jest"` resolution (it yields `Validation Error: Preset ts-jest not found`) and also swallows a positional pattern; `NODE_PATH` does.** Junction/`mklink /J`/`cp -al` remain rejected on this host, so this is the recipe to record.

**Headline reproduction.** First off-tree run failed 2 tests in `smoke-29-examples-spec.test.ts:82:35`; cause classified as **INFRA, not a candidate regression** — `tools/examples/spec-validate.cjs:24` requires the absolute `<cwd>/node_modules/esbuild`, and that same gap is what made F-37's NC-C "inconclusive". After the graft: `[spec-validate] 45 examples: 45 frozen / 0 draft / 0 blocked` and the **full suite reproduced 29 suites / 207 tests PASS in 63.657 s outside the source repo**. First time the headline number has ever been verified off-tree.

**The two §5 policy controls are now DETECTED (with a GREEN control and a GREEN restore each).**
- C1 control, pristine copy: `smoke-22` 23/23, `smoke-23` 3/3.
- **F1 correct-policy refusal** — `sed` turned the 4 `throw new AgentSessionError('OUT_OF_SCOPE'` guard sites (`tools/debug/agent-session.ts:686/704/714/818`) into non-throwing constructions → `smoke-22` **3 failed / 20 passed**, including `只读 session：写操作 OUT_OF_SCOPE`. The agent write-scope refusal is genuinely asserted, not self-reported. (Two extra hook-lifecycle failures are a cascade: with the guard off, writes execute.)
- **F2a sacrificial isolation** — the 5 `DEBUG_MARKERS` appended to the copy's `build/cocosair.module.js` → `smoke-23` test 1 **RED**. Recorded honestly: this trips on a **text scan**, so the injection reproduces the marker signature rather than a genuine static re-inclusion of `tools/debug`.
- **F2b sacrificial isolation (the stronger one)** — a real static `import { __negctl } from '/__debug/agent-session.js';` appended to `examples/automation/main.ts` (the correct target; the earlier attempt aimed at a non-existent `main.js`) → `smoke-23` test 3 **RED**. Restore → GREEN for both.
- §5 ledger now: **8 executed / 1 NOT_RUN** (agent compile-fail, needs R5's Agent→fresh-build→verify chain). Three executed-and-**NOT**-detected gaps stay open: F-37 required-test exclusion, F-38 screenshot content, F-39 asset content.

**Process slip, self-reported.** The script's first F1 restore silently failed (backup written to MSYS `/tmp`, restore read from the copy dir), so the in-script re-verify still showed 3 failures. Caught by the post-run 3234-file re-hash and repaired from the read-only snapshot; `guards-restored=4`, `smoke-22` GREEN. Lesson kept: verify restores by hash, never by the exit code of the step that just ran.

**Post-run integrity.** `checked=3234 mismatches=2`, and a key-level diff shows the only differing field in both files is `measuredAt` (`docs/evidence/v11-spec-validate.json`, `docs/evidence/v11-spec-compliance.json`). So all three injections rolled back with zero other drift, the gates are reproducible out-of-tree, and — a side observation feeding F-38/F-39 — those two artifacts bind no candidate identity at all, so re-running only refreshes a timestamp.

**Verdict moves.** `candidateIntegrity` **FAIL → PARTIAL** (bound to a frozen digest; the tree itself is still uncommitted and dependencies are outside the digest). `negativeControls` **blocking item "policy+isolation negative controls unexecuted (F-42)" removed**, `F-42` downgraded from blocking; `testCredibility_jest` gains the off-tree reproduction. Gates 22 = **9 PASS / 3 FAIL / 7 PARTIAL / 3 NOT_RUN**, blocking items **15 → 14**, findings **44** (F-01…F-44, unique), evidence entries **20** with **0 missing raw pointers**. Overall remains **NOT_READY** — nothing rose to PASS that was previously blocked on release, and the two proven guards were never the release blockers.

**Safety.** Original repo written 0 times in this phase; nothing staged, committed, pushed or published. Scratch retained for now because it is the R0 evidence handle: `E:/qoder-frozen-2026-09-19` (958 MB) and `E:/qoder-r7i-2026-09-19/work` (frozen extract + 14 MB graft).

**Self-reported process incident (§8 of the raw log).** The report ledger itself is being shared with the parallel audit session: at 15:02 `findings.jsonl` was 45 lines including their `F-30b` and a `F-44` **specFingerprint reverse control** (control EXIT 0 → injected EXIT 1 `S13-PE-FINGERPRINT`, i.e. half of F-38's exposure surface closed), and my 16:06 non-atomic read-modify-write **dropped both**. Their entry text is preserved in `raw/ledger-recovery-2026-09-19.json`; their cited `raw/negctl/nc-h-specfingerprint-reverse-control.log` does not exist on disk, so **this audit does not count that control as attested** — the §5 count above (8 executed) excludes it, and `F-38` stays blocking. The id `F-44` is ambiguous between the two sessions until someone renumbers. This is the same lost-update pattern F-37/F-43 describe for evidence artifacts, now demonstrated on the audit's own ledger.

---
## UPDATE 14 — R7d 继续：全部确定性门禁 + Recipe 证据在冻结候选上离线重跑（F-45, F-46）
全部在 `E:/qoder-r7i-2026-09-19/work`（F-43 冻结快照 + 14 MB esbuild 嫁接 + 合成 `git init`）执行；**原工程写入 0 次**，6 个注入路径逐个与原仓库↔快照哈希比对全部 `same`。证据：`raw/gates/frozen-candidate-gate-sweep.log`。

- **确定性门禁在冻结候选上复现**：`license-audit` exit 1 / issues=3（draco.glb、meshopt-khr.glb 缺 `.LICENSE.md` + `build/examples` 意外目录，与活树完全一致）；`verify-web-only` PASS（797 files）；`decoder-audit` PASS（manifestFiles=16）；`spec-evidence --check` 772 条 0 drift；`coverage-report` 打印 **三条门禁全 FAIL 却 exit 0** —— F-40（无机器可强制退出码）在冻结候选上原样复现。
- **v06 的 `sourceHash mismatch` 从"无法解释的漂移"降级为"可精确归因 + 一条命令可修"（F-45）**：`sourceHash` = `tools/benchmark/**` + 2 个 gltf-viewer 资产 + `build/cocosair.module.js` + `.d.ts` 的内容哈希（`benchmark-evidence.cjs:5-21`）。它在**原仓库与冻结副本里算出同一个值** `ac1b151596b36975` → 说明不匹配不是拷贝伪影；记录的证据是 `f5ebd60f582a70c9`@09-18 17:43Z，而 commit `3a53957` 于 09-19 09:14 重写了大量 `tools/benchmark/**`（catalog-iss.ts +390、fixtures/B101-103…），另外未提交的 `runner/browser-runtime.cjs` 也参与（仅在副本里还原它 → `5687660e30f63a1b`，仍不等于记录值）。**即：门禁有牙，检出的是真过期。**
- **新的输入侧新鲜度缺口（同一族但方向相反，注入实证）**：往副本 `src/cocos/scene-graph/node.ts` 追加一行且**不重新构建** → `sourceHash` **完全不变**（`ac1b…` 前后一致；文件已还原并复哈希等于快照）。引擎源码不在哈希集合内，只绑构建产物字节 → 任何未重建的 `src/**` 改动（或 `build/` 比 `src/` 旧）都会让所有 `sourceHash` 消费者继续宣称"证据当期"。今天没有任何门禁检得出。建议（需批准，两选一）：把 `src/**` 纳入哈希集合，或另建 buildStamp 并断言其新鲜度；retest = 改 src 不重建必须让 `v06-report` 转红。
- **Recipe 证据在冻结候选上成功重绑（F-46）**：`run-recipes-browser.cjs` → **30/30 PASS**，新记录 `sourceHash = ac1b151596b36975`（正是冻结候选自己的哈希）、promoted 30/30 stable；随后 `jest --json --outputFile=output/v06-review-jest.json`（29 suites / 207 tests success=true，101.4 s）→ `v06-report` 的 `evidenceFailures` 由 **8 → 0**，只剩 2 个 blocker（dual-track + catalog 证据仍是 commit 前的哈希；Jest 那条已随 in-step 文件消失）。三步全程 `sourceHash` 不变（runner 只写 `docs/evidence`、`output/`）→ 证据再生自洽。**注意口径**：这是隔离副本里的复现，**交付树的 `docs/evidence` 未被本审计改写**，所以在原地重跑之前 `v06FinalGate_recipe` 仍记 FAIL/BLOCKED。
- **`revision` 是装饰字段（OBS-4，构造性证明）**：`run-recipes-browser.cjs:82,86` 写入 `baseRevision/revision`（取自 `git rev-parse HEAD`），但 `schema.ts` / `v06-report.cjs` 里**零断言**——我副本产出的被接受 30/30 证据带的 `baseRevision bb80eab…` 在真实仓库中根本不存在。危害有限（`sourceHash` 是内容派生且确实被校验），但"看起来像溯源"的字段没人核对，属于 claimed-vs-verified 同族缺口；最小修法：断言 `revision === 当前 HEAD`，或改名以免暗示绑定。
- **工装健壮性（OBS-3）**：无 `.git` 的副本里 recipe runner 在跑第一个 recipe 之前就 status 128 崩溃（`benchmark-evidence.cjs:24` 无 try/catch）→ 该门禁无法在 clean-room 或 npm 安装的源码包里复现；**响亮失败而非静默**，故记非阻断。合成 `git init` 后照常运行且不影响 `sourceHash`。
- 状态：gates 仍 22 个（本次未把任何门禁升到 PASS），`overall` 仍 **NOT_READY**；findings 增至 **F-46**，evidence 22 条、悬空指针 0。catalog(100) + golden dual-track 的重跑紧随其后。

---
## UPDATE 15 — V0.6 全链在冻结候选上离线跑到 PASS，但 Agent 维是 scripted（F-47）
紧接 UPDATE 14，在同一隔离副本里顺序补跑（每步单独跑，不与其它浏览器/CPU 批次并发，帧时序不被干扰）：

- `v06-catalog-gate.cjs` → **§51 100/100 PASS**，counts `{PASS:97, EXPECTED_UNSUPPORTED:3}`，0 条非 PASS，`source.sourceHash = ac1b151596b36975`（= 冻结候选自己的哈希）。
- `run-dual-track.cjs`（golden 10 双轨）→ 10 rows，Reference `PASS×6 + EXPECTED_UNSUPPORTED + PASS×3`，`referenceGatePass true`；从 raw 行独立重算指标 `{eligibleTrials 9, eligibleTypeBTrials 6, agentPass 9, agentFinalSuccessRate 1.0, firstCompileSuccessRate 1.0, medianRepairSuccessful 0, budgetExhaustionRate 0}`（1 个 trial 被排除，原因只体现为 `byDomain: DEVICE`）。
- jest in-step（29 suites / 207 tests，success=true）+ 上面三份证据重绑后：`node tools/verify/v06-report.cjs` → **`status: PASS`, `blockers: []`, `evidenceFailures: 0`, `recipes {30,30,30}`**。

结论两面都要说清。**好的一面**：V0.6 整链（100 catalog + golden-10 reference + 30 recipe + 207 jest）能在一个冻结摘要上仓库外复现全绿 ⇒ 交付树的 v06 FAIL 确证为"证据过期"，F-45 的归因端到端闭合，修复动作就是那 4 条命令。**必须打折的一面**：Agent 轨驱动是 `tools/benchmark/driver/manual-driver.ts` 的 `ManualAgentDriver`（profile A001，scripted，`driver/*.ts` 里没有任何 LLM 端点/取 key 代码），每行 `repairs=0 denials=[]`，所以 `agentFinalSuccessRate 1.0 / firstCompileSuccessRate 1.0` 量的是测试作者预先写好的补丁，不是模型。**"v06-report PASS" ≠ "Agent 能力已验证"**——这是本次审查里最典型的"门禁绿在代理指标上"。`agentGate` 继续 FAIL/BLOCKED（R5：真生成式 LLM 轨 + 全新 build/页面 + 保留全部重复）。交付树的 `docs/evidence/*` 本次未被本审计改写，原地仍报 3 条 stale blocker。

本次未提升任何门禁到 PASS（副本内复现不等于交付证据），gates 仍 22 = 9 PASS / 3 FAIL / 7 PARTIAL / 3 NOT_RUN，blocking 14，`overall` **NOT_READY**；findings **47**（F-01…F-47 唯一），evidence **23** 条、悬空指针 0。


---
## UPDATE 16 — authorized fix wave executed (R7a / R7c / R7f / R7g partial / R7h / OBS-3 / OBS-4)
- Everything was implemented and injected in an isolated copy first (`E:/qoder-r7i-2026-09-19/work`, the F-41/R7i toolchain recipe), then ported into the repo only after each target file was re-verified byte-identical to the F-43 frozen snapshot (`blocked=0`). The ported set is 10 tool/package files + 2 new files (`tools/verify/test-inventory.cjs`, `docs/test-inventory.json`). No `src/`, `examples/`, `test/`, `build/` file and no evidence JSON/PNG was written inside the repo; nothing staged, committed or pushed. Full log: `raw/gates/fixwave-r7-2026-09-19.log`.
- New or hardened assertions, each with a proven DETECTED injection: suite/test inventory (4 controls, incl. the exact `--testPathIgnorePatterns=smoke-11` retest R7a demanded, which `npm test` had passed GREEN); screenshot content binding (delete / same-size garbage / truncation); declared-asset content binding (0-byte / same-size garbage); coverage tiers now drive the exit code (FAIL at core 49/717, and a sacrificial threshold=0 probe proved EXIT 0 is reachable); recorded revisions must be commits reachable from HEAD (unreachable-revision injection -> BLOCKED, restore -> PASS); `metadata()` survives a missing `.git` (F-46 crash removed) instead of aborting a 30-recipe run.
- Nothing was weakened to get there: the frame-diff 400 ms two-frame contract and its thresholds are byte-unchanged (F-41 guardrail), and smoke-22 / smoke-23 were not touched (F-44 keeps their DETECTED status intact). The work copy is 29 suites / 207 tests PASS after all edits; the gltf-basic re-capture reproduced the identical 21695 B / 2111b65b8ff3af23 frame, which is why "the tightened gate is satisfiable by a real run, not by hand-editing evidence" can be claimed.
- Honest cost (F-49, blocking): the tightened gate is stricter than the *delivered* evidence, so against current repo content spec-compliance reports 11 fail / 1 warn - every one of them "evidence recorded before binding existed" (5 DevTools screenshots without hash, 6 example assets without assetDigests), with zero bytes/hash contradictions. Because smoke-29 asserts spec-compliance zero-fail, `npm test` in the repo is RED until the two example gates run in-repo. Those commands rewrite `docs/evidence/*.json` and `docs/evidence/examples/*.png`, all of which are uncommitted and being rewritten by the parallel session right now, so they were deliberately NOT run. In the copy the same chain closes at 0 fail / 1 warn.
- Gate movements: `testCredibility_jest` gap now machine-enforced (adoption into CI still open), `negativeControls` 8/8 executed controls now DETECTED (agent compile-fail still NOT_RUN), `exampleStableVerify` offline half no longer existence-only but pending re-evidence, `apiCoverage` enforced yet still FAIL at 6.8% Core, `v06FinalGate_recipe` attribution enforced and still FAIL in-repo (delivered recipe sourceHash f5ebd60f vs current ac1b1515). `blockingForRelease` 14 -> 12 (three binding items closed by code, one re-evidence item opened). Overall stays **NOT_READY**: no gate was promoted to PASS on the delivered candidate.
- R7g stays PARTIAL by design and is labelled as such: digests are recorded in EVIDENCE (not in `example.json`, which would churn every specFingerprint) and are taken from the same working tree as the run, so post-capture replacement is detectable while an already-wrong upstream asset still needs the R1 provenance/license work.
- Also surfaced (F-50, non-blocking): the 3234 -> 3587 file delta is entirely `build/.tmp-*` leftovers from earlier runs, invisible to git but inside any whole-tree candidate digest; and one full jest run in a partial copy flaked ("suite failed to execute: smoke-05", 204 tests) while the identical command immediately after was 207/207.


## UPDATE-17 (2026-09-19) — R7g binding scope completed off-tree; overall remains NOT_READY

The R7g fix wave bound only what `example.json` named. Measured: 8 stable examples ship 65 files / 4.9 MB under
`assets/`, of which 7 paths were declared. With the pre-widening code, truncating `SimpleSkin_geometry.bin` to 0 B
and replacing a `gltf-viewer` model with same-size garbage both left `spec-compliance-audit` at 0 fail / EXIT 0 —
the same "exists therefore true" class as F-38/F-39, one level deeper. Scope is now `spec.assets ∪ assets/**` in both
producer and consumer, plus a `S15-ASSET-ZERO` assertion. 7 injections DETECTED, each restored and hash-verified;
copy-vs-project asset integrity sweep 65 files / drift 0; a genuine 8/8 PASS Chromium re-capture returns the copy to
0 fail / 1 warn; jest 29 suites / 207 tests. Costs stated honestly: delivered evidence is now 70 fail / 1 warn
off-tree (F-53 supersedes F-49, re-evidence set grew to 8 browser + 5 DevTools ids), no in-repo run was performed
because those evidence paths are uncommitted and being rewritten by a parallel session; and a wrong-but-non-empty
asset at capture time still cannot be disproved offline (F-52). Two search-agent claims were checked and rejected
rather than repeated: "gltf-catalog ships 3 orphan .bin sidecars" (that example has no assets directory at all) and
"the §11 zero-fail assertion lives in smoke-29-project-knowledge.test.ts" (the file is smoke-29-examples-spec.test.ts).
Overall remains NOT_READY.

### UPDATE-18 (2026-09-19 12:14Z) — R7g re-evidence executed in-repo; F-53 cleared; two new findings

Authorization: "先提交git，可以授权继续完成剩余任务" (re-evidence pass + commit; push not authorized).

The widened `assetDigests` binding was closed end-to-end **without weakening itself**: the 70-fail
state over delivered evidence (F-53) was resolved by genuine re-capture, and the offline gate now
prints **0 fail / 1 warn** over 45 examples with the sole survivor being the deliberate
`gltf-draco` S25-LIFECYCLE BLOCKED warn. Numbers now measured, not remembered:
browser matrix **40/40 PASS, partial=false**; DevTools **5/5 PASS** with `artifact.hash` on all five;
**65/65** asset rows bound (6 declared + 59 undeclared sidecars), zero-byte rows **0**; full suite
**29 suites / 207 tests PASS**. Asset tree digest `9675f73069eae7b4` (65 files / 5,191,306 B) is
identical before and after, and `git status` shows **0** dirty paths under any `assets/` directory —
the audit touched no delivery asset.

Attribution discipline applied to two red items:
- `verify:v06-gate` **EXIT=1** is **not** this wave's doing (F-56): the golden dual-track evidence is
  dated 09-17 at `3ee7cafe` and the 30 Recipe runs 09-18 at `f5ebd60f`, while `sourceHash` has been
  `ac1b1515` since before this session and did not move during it; the catalog set was already
  re-run to `ac1b1515` on 09-19 05:07 and `v06-review-gate.json` was BLOCKED at 05:08, before any
  write by this audit.
- New finding **F-55**: three DevTools examples produce one byte-identical frame
  (`80cdb10343a2ac68`, 5254 B) after a fresh capture. Decoded pixels prove it is a real render, and
  the specs (`["visible-frame"]` only, shared `expectedGraph`) explain it. The hash binding still has
  teeth; the visual claim simply cannot discriminate between those three. Left as a spec decision.

Self-corrections recorded (log §10, §14): the repo declares **6** asset paths not 7; the DevTools
producer **does** call `assetDigestsOf` (its `[]` means "no assets/ tree", not "blind"); the 5 S11
screenshot failures needed no code change; and this audit's own `dangling=0` evidence-index check was
too weak (it never resolved paths) — re-run strictly it found **1** real dangling pointer
(`docs/audits-tmp-jest.log`, transient, now annotated DANGLING-SUPERSEDED) plus 3 stdout descriptors.

Commit boundary (log §12): this audit commits its own tooling and ledger only
(`tools/verify/v11-spec-common.cjs`, `tools/examples/spec-compliance-audit.cjs`, `docs/audits/**` with
raw logs force-added because `.gitignore` hides `*.log`). The regenerated `docs/evidence/**` stays in
the working tree with the 45 `example.json` it fingerprints, because splitting them across commits
would create a clean-checkout `S11-STALE-EVIDENCE` failure and committing them would land another
session's in-flight specs under an audit message.

**Overall remains NOT_READY** (11 blocking items: F-56 replaces the cleared F-53 slot).

## UPDATE-19 — 2026-09-19 21:00–21:12 +08: full V0.6 track re-run closes F-56 (R4)

User authorized exactly two things this pass: "1.授权跑 V0.6 全轨道 2.清理临时目录". The track was run **in the
repo working tree** (not an isolated copy) because the blocker was that the *delivered* evidence was stale; a
copy could not fix that. Starting state was a clean tree at `e06d2988`, and the 69 evidence files about to be
overwritten were snapshotted with full sha256 first.

**The gate is now PASS on its own terms.** `node tools/verify/v06-report.cjs` → EXIT 0,
`status=PASS`, `blockers=[]`, `referenceGatePass=true`, `catalogGatePass=true`,
`recipes={catalogTotal:30, validatedCount:30, stableCount:30}`, `evidenceFailures=[]`,
`coverageFailures=[]`, `revision.failures=[]`. Nothing was relaxed to get there — the same
`validateEvidenceSet` / `artifactExists` / `scenarioHash` / sourceHash-equality / revision-reachability code
that produced the 3 blockers (and 30 recipe `evidenceFailures`) in the 20:16 record produced this result after
genuine re-capture.

**I did not take the runners' PASS lines at face value.** Recomputed from RAW with my own code: all 60 recipe
artifacts re-hashed off disk → 0 unbound; one `sourceHash` (ac1b1515…) and one revision (`e06d2988`) across all
30 runs; 30 distinct `scenarioHash`; five sampled PNGs decoded through a hand-written zlib+unfilter path to
real 480×360 content (R001: 1,267 distinct colours) rather than blank fills.

**Re-running the track bought a finding, not just a green.** Hashing the 30 screenshots showed **24 distinct
hashes for 30 runs**: `R022=R023=R024=R025`, `R001=R006`, `R004=R010`, `R005=R009`. That upgrades F-55 from "an
rc-* pair happens to look alike" to **F-60**: every recipe record carries the identical coarse boolean bundle
`{scene, interaction, visual, lifecycle, noRuntimeErrors, capability, semantic}=true`, so `visual=true` carries
no per-claim signal — and for clearcoat / transmission / anisotropy / iridescence, four *different* claims,
the frame is literally one image. This is an assertion-strength gap and it survives the green gate; it needs an
owner decision (give the four extension recipes distinguishing visual targets, or stop calling the screenshot
extension proof). F-59 must not be read as contradicting it.

**Self-correction on my own tooling this pass.** (a) My first read of `docs/evidence/v11-spec-compliance.json`
iterated `examples[]` and reported "1 example, 0 fail, 1 warn" — wrong: that array holds only examples **with**
findings (`spec-compliance-audit.cjs:371`), so the honest numbers come from `summary` (45 audited / 0 fail /
1 warn). (b) The `blockingForRelease` list initially still carried the cleared `v06FinalGate_recipe` text, which
would have overstated the blocker count; it was moved to a new `blockingForReleaseResolved` array → 10 blocking
items. (c) F-61: the catalog evidence names commit `3a53957`, one commit behind HEAD; `sourceHash` is identical
so content currency holds, but the reachability check only asks "ancestor", never "is HEAD" — a real weakness in
attribution that I had previously counted as a strength. (d) Process: `git status` mid-capture broke git's index
refresh once ("unable to read sha1 file … fatal"); transient, retry clean, and I now keep git index operations
out of the capture window.

**Cost of honesty about the tree:** this pass left 19 generated paths dirty (4 V0.6 evidence files +
`docs/v06-final-gate.md` + 12 recipe artifacts + 2 timestamp-only V1.1 evidence files, restating F-58). Those
are **not** committed — commit authorization for this wave was not given. No `examples/*/example.json` changed,
so the 20:0x V1.1 binding (45 examples / 0 fail / 1 warn) still stands.

**Overall remains NOT_READY** (10 blocking items after F-56 cleared; `v06FinalGate_recipe` is now PASS).

## UPDATE-20 - F-54 closed, F-61 re-run executed, premise break measured (2026-09-19 21:44-21:56 +08)

User authorized two things: re-run `tools/verify/v06-catalog-gate.cjs` so the three V0.6 inputs share a
revision, and add a `.gitignore` exception for `docs/audits/**/raw/**`. F-58's relocation and R1/R1b/R1c/
R2/R3/R5/R6/R8 were explicitly returned to the user as decisions; nothing under `tools/` was touched and
nothing was staged or committed.

1. **F-54 -> F-64 CLOSED.** `.gitignore:21` now reads `!docs/audits/**/raw/**`. Scope proven in both
   directions with `git check-ignore -v`: a new `.log` under `raw/` resolves to the negation (no longer
   ignored), while `docs/evidence/v06-recipes.log` still resolves to `*.log` (no accidental widening). The
   three new files this pass produced appeared as `??` with no `git add -f`, which is the behavioural proof.
   Ledger census: 225 tracked files under `docs/audits` of which 84 are `.log`; on disk 227 / 85 (the extra
   is this pass' in-flight stdout); tracked-but-missing 0.
2. **F-63 opened (non-blocking).** `.gitignore:15` contains the literal characters `.tmp-basis\n`
   (backslash + n), so the pattern is inert - `git check-ignore .tmp-basis` exits 1. Left as-is: outside the
   authorized scope, and un-ignoring a path could hand the parallel session a new untracked file.
3. **F-61 re-run executed, and it produced a measurement rather than a close.** The catalog gate EXIT 0 at
   HEAD `33b4281`: 100/100, {PASS 97, EXPECTED_UNSUPPORTED 3}, failureDomain {NONE 97, DEVICE 3}, identical
   `sourceHash ac1b1515`, and its recorded revision moved `3a53957 -> 33b4281`. Re-running
   `tools/verify/v06-report.cjs` kept `status=PASS / blockers=[] / recipes 30/30/30 / tests 29-207-207`, but
   `revision.recorded` went from `[e06d298, 3a53957]` to `[e06d298, 33b4281]` - the lagging pair rotated
   instead of merging. Root cause, verified not argued: the dual-track and recipe evidence recorded
   `e06d298` **and were committed by `33b4281`** (`git log -1 -- docs/evidence/v06-recipes.json` ->
   `33b4281 09-19 21:40`), and `git merge-base --is-ancestor e06d298 HEAD` is true with 3 commits in
   between. A capture can only ever name the HEAD that predates its own commit, so the literal goal
   "committed evidence records HEAD" is unattainable, and turning it into a warn (option b as originally
   worded) would emit a permanent non-actionable warning. The invariant the gate already enforces -
   ancestor + identical `sourceHash` + per-run `scenarioHash` + artifact re-hash, currently 0 failures - is
   the meaningful one. Residual defect is presentation only: `revision.recorded` is a flat de-duplicated
   list, so a reader cannot tell which input came from which commit. Proposed fix (needs authorization,
   touches `tools/verify/v06-report.cjs`): `revision.perSource {goldenDualTrack, catalogRuntime, recipeBatch,
   recipeRuns}`. Alternative if a single value is wanted cosmetically: re-run all three captures at one HEAD.
4. **R2 refreshed at HEAD** (`npm run verify:api-coverage`, 13:49Z): `totalUnits 4729`,
   `claimed = verified = 63`, `staleEvidenceExamples []` - zero claimed-without-proof - while core
   49/717 (6.8 %), important 6/793 (0.8 %), advanced 8/3219 (0.2 %) all fail their 100/90/80 % thresholds,
   and `unclaimedCore` lists 668 units. Still an owner contract decision.
5. **R1 census corrected against my own earlier note** (F-66). Under the definition "payload = non-sidecar
   file under `examples/*/assets/`, covered = sibling `<name>.LICENSE.md` exists": 41 payloads, 24 covered,
   17 uncovered totalling 17,533 B, i.e. **99.7 % of asset bytes are proven**. My stored "25/65 files,
   38.5 % of bytes" used a denominator that counted the sidecars themselves and overstated the gap. Two
   concrete gaps from F-27 re-verified as still open: `examples/gltf-draco/assets/draco.glb` (992 B) and
   `examples/gltf-meshopt/assets/meshopt-khr.glb` (1,428 B) have no sidecar. Two self-corrections in one
   pass worth naming: my first census probe looked for `examples/<d>/LICENSE.md` and therefore wrongly
   reported all 8 examples as uncovered before I fixed the convention.
6. **Tree state.** 5 tracked modifications (`.gitignore`, the two regenerated V0.6 evidence/report files,
   `docs/v06-final-gate.md`, `docs/api-coverage-report.json`) plus this ledger, and one foreign untracked
   `.tmp-frame-probe.cjs` left alone. `output/v06-review-jest.json` was not re-run in this pass, so the
   `tests` block in the gate JSON is the 21:04 capture - consistent, but flagged for honesty.
   **Overall verdict unchanged: NOT_READY, 10 release blockers.**

### UPDATE-20b - same wave, three more self-checks (22:02-22:05)

- **F-67 opened** while indexing this wave: two `evidence-index.json` rows named
  `raw/gates/v06-report-stdout-2026-09-19.log`, but the file holds only the later PASS capture (914 B,
  sha16 `b53a5b8374bbd508`, 13:39:07Z, head `41b4c71`) because the second run reused the filename. Third
  occurrence of the "row does not match bytes" class, so the rule is now stated in the row itself: one
  filename per capture. Nothing was lost - the BLOCKED stdout is
  `raw/gates/reevidence-03-v06-blocked.log` and the BLOCKED JSON is `git show 33b4281~1:docs/evidence/v06-review-gate.json`
  (3 blockers / 30 evidenceFailures / 12:16:03Z). Both rows annotated, none deleted.
- **My dangling-ref sweep was wrong before it was right**: resolving every row against the audit directory
  flagged 10 repo-root rows as missing (`docs/api-coverage-report.json`, `output/v06-review-jest.json`, ...).
  Re-run against both bases: unresolved refs = 0, plus the 3 rows already labelled
  `DANGLING-SUPERSEDED`/`DESCRIPTOR` and 1 intentional glob. Also: 16 of the 48 rows are per-experiment
  bundles with no `path` field at all - a naive "unique paths vs row count" diff is not a dangler count.
- **True exit codes re-measured** (the first capture piped through `tail` and printed *tail's* status):
  `license-audit.cjs` **EXIT 1, issues=3** (`draco.glb`, `meshopt-khr.glb`, `unexpected directory in build/:
  examples`) - so the `license` gate stays FAIL and remains a release blocker;
  `spec-compliance-audit.cjs --warn-ok` **EXIT 0, 45 examples / 0 fail / 1 warn** - unchanged.
- **F-58 observed live rather than argued**: the compliance run rewrote
  `docs/evidence/v11-spec-compliance.json` for a `measuredAt`-only reason, which is exactly why a clean tree
  is unattainable after any verification pass. Relocation still awaits the owner's scope decision.

### UPDATE-20c - F-68: my provenance number had the wrong unit attached (22:12)

F-66 explained the old "25/65 / 38.5 % of bytes" figure as a sidecar-inclusive denominator. That explanation
was wrong, so it is superseded by F-68 rather than edited away. Re-measured: the two upstream manifests live
only under `examples/gltf-viewer/assets/` and name 25 files (9 + 16), which resolve to 33 on-disk files
carrying **99.4 % of the 5,191,306 B** asset payload - so 38.5 % was the *file-count* share (25/65) that my
note had labelled "bytes". The separate `.LICENSE.md` sidecar channel covers 24/41 payloads = 99.7 % of
payload bytes. Both numbers are high on bytes and low on file count, which is precisely why every provenance
claim now has to state channel + denominator + unit. R1's substance is unchanged: 7 of 8 examples have no
upstream manifest, 17 payloads lack a sidecar (`draco.glb` 992 B and `meshopt-khr.glb` 1,428 B among them),
and `license-audit.cjs` still exits 1 with issues=3.

---

## 追加波次 r21/r22（2026-09-19 19:0x–19:3xZ，总审查 item 1–4 收口）

候选身份（本波现读，勿与历史口径混用）：`candidateFingerprint 5612c4c2746f395b`（`build/cocosair.module.js` + `examples/shared` 字节），
`inventoryFingerprint 2d10b49ee9c22d24`（`docs/example-api-inventory.json` 4729 单元），HEAD 见 `git log`（工作树含本波未提交改动）。
本波证据全部在 `raw/gates/*-r21.log` / `*-r22.log`，逐条退出码由 `${PIPESTATUS}` 之外的直接重定向捕获（不再出现"管道后取 EXIT"的 F-16 类错误）。

### 门禁结果（退出码为真值）

| 门禁 | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 结构冻结 | `node tools/examples/spec-validate.cjs` | 45 例 0 issue（经 jest smoke-29 复验） | 0 |
| 证据链符合性 | `node tools/examples/spec-compliance-audit.cjs` | 45 例 **0 fail / 1 warn**（warn = gltf-draco 诚实 BLOCKED） | 0 |
| 浏览器矩阵（示例） | `NODE_PATH=<pw> node tools/verify/v11-examples-verify.cjs` | **39/40 PASS，1 promoted / 0 demoted**；apiProof 合计 667 verified / 15 attested / 1 unproven；stale 0 | 1（material-unlit 真缺陷 F-70） |
| DevTools 会话 | `... tools/verify/v11-devtools-examples.cjs` | **4/5 PASS**，rc-create-node `transform-equals` FAIL（F-74） | 1 |
| Gallery 部署物 | `... tools/verify/v11-gallery-artifact.cjs verify` | **70/76 PASS**（修 F-76 竞态前 68/76）；残留 = 2 条门禁自身误设（F-78）+ 4 条真实交付缺陷（F-79） | 1 |
| API 覆盖率 | `node tools/examples/coverage-report.cjs` | core **46/717 = 6.4%**[call 44/read 2]，important **6/793 = 0.8%**[call 4/read 2]，advanced **NOT_APPLICABLE**（required 0/3219）→ 门禁 FAIL | 1 |
| V0.8 浏览器矩阵 | `... tools/verify/v08-browser-matrix.cjs` | **1/3 PASS**（chromium 全绿；firefox-1532 / webkit-2311 可执行文件缺失 = NOT_INSTALLED，属 R3） | 1 |
| Jest 全量 | `npx jest --ci` | **29 suites / 208 tests PASS**（修 F-77 前为 1 failed / 207 passed） | 0 |
| License | `node tools/verify/license-audit.cjs` | issues=3（draco.glb / meshopt-khr.glb 缺 sidecar；`build/` 里多出 `examples/`） | 1 |

### item 1–4 的处置

1. **verified 口径（不再由示例级 PASS 推导）**：`verified = executed ∧ bound ∧ lineOk` 三条件在
   `v11-spec-common.apiProofOf` 一处实现，浏览器/DevTools/覆盖率三方共用；`sourceFingerprint` 现覆盖
   example.json（排除 runner 自写字段）+ index.html + 入口源码 + 整棵 `assets/`，故源码改动必然使证据失配
   （F-73 三门控制：晋级写回幂等 / 期望值编辑 DETECTED / 源码字节编辑 DETECTED）。
2. **validator 名实相符**：`asset-loaded / material-property / transform-equals` 全部改为
   `validationExpectations` 逐节点驱动 + 覆盖合同（作用域内每个节点要么给期望值，要么给带源码出处的豁免），
   无期望值即 FAIL。因此 40/40 变成 39/40：唯一红是 `builtin-unlit-material` 从未注册（F-70），
   它此前被"存在材质即可"的弱口径掩盖。45 个 stable 标记复核结果：**42 stable**，非 stable 3 个
   （gltf-catalog 无 claims/无插桩、material-unlit F-70、rc-create-node F-74）。
   本波另发现并修复 F-75（`interaction:` / `lifecycle:` 前缀使 `api.evidence[].validator` 永远解不开 bound）。
3. **静态交付深度**：Gallery 门禁实际执行 76 项（解码器集、40 张缩略图、深链、源码查看、11 条生命周期释放合同、
   绝对路径/agent 端点字节扫描、0 page error），非"13 项"。但结论仍是 PARTIAL：F-78/F-79 未修，
   且 gltf-draco/meshopt 浏览器例只到 capability-gated，正向解码证明仍在锁定的 jest smoke-11。
4. **统计合同**：分母 = `coverageRequired=true`（1510；advanced 全 false → NOT_APPLICABLE），
   比例强制绑定 `inventoryFingerprint` + `candidateFingerprint` + `measuredAt`，call/read 通道分开披露，
   inventory 自身计数（totalUnits/tierSummary/coverageRequiredUnits）不一致即 FAIL，
   不在 inventory 的 claim 显式列进 `claimsNotInInventory`（当前 5 个 `DevToolsSession.*`）。
   **天花板事实**：45 份规格合计只 claim 67 个 unit（其中可入门禁分母的 ≤55），
   所以 120 stable 也补不齐 1510 分母——覆盖率必须逐 API 做 claims+evidence，不能靠加示例数。
   documented-only 门禁 **BLOCKED**：inventory 4729 个 unit 的字段只有
   `{kind,tier,coverageRequired,parent}`，`documented` 填充数 **0**，仓库内无任何生产者；
   先决条件是最小机器合同 `documented:{source,line,text}` 并按 provenance 同款方式验出处。

### 并行会话安全（F-81）

同工作树内另一会话的 r18 结论未被采纳：其 `candidateFingerprint 7903e764a1678115` ≠ 本波复算 `5612c4c2746f395b`，
`measuredAt 2026-09-20T09:59:00Z` 当时比墙钟超前约 15 小时，其"core 718/718=100%"与本波复算 46/717 冲突，
其引用的 `examples/gltf-{anisotropy,iridescence,sheen}` 与 `docs/evidence/visual/` 在本仓库不存在（该会话后已自行撤回）。

## UPDATE-23 — 授权修复波执行完毕，交回 owner 重跑浏览器门禁（2026-09-20）

授权范围（owner 原话）："提交git。授权引擎修 F-70（注册 builtin-unlit-material）与 F-74（解析真实目标节点 + 统一 duplicate 码），修后我重跑 r22 矩阵 + DevTools 门禁。授权 F-72 产证原子化（tmp+rename + completed:true，消费端缺标记按 NOT_RUN 处理）。"

### 执行结果

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 提交 | DONE | `0773058`（r21/r22 审计波次 117 文件，**未 push**）。修复波本身仍在工作树，未获提交授权。 |
| F-70 | 修复已落地 / 验证待 owner 重跑 | `src/air/builtin/register.ts` 第 3 步补注册 `builtin-unlit-material`（`initialize({effectName:'builtin-unlit', defines:{USE_TEXTURE:false}})` + `builtinResMgr.addAsset`）。tsc/build 退出 0，产物含该 uuid，候选 `d705a2c8b8eadd68`。 |
| F-74 | 修复已落地 / 验证待 owner 重跑 | 三层：示例代码真解析（`snapshot.nodes[0]` 取根、解包 `{ok,result}`、`inspectNode` 回读、`duplicateCode`/`stableCode` 观察而非硬编码）+ `example.json` 文案与 4 处行号引用重算（L62/L77/L73、rc-error-report L64）+ 门禁补真探针（自发 duplicate requestId + `session-self-report-codes` 页内外码一致核对）。 |
| F-72 | 已实现 + 离线证伪通过 | `writeJsonAtomic`（唯一 `.writing-<pid>-<rand>` tmp + EPERM/EACCES/EBUSY 有界重试，放弃前清自己 tmp）+ `completed:true` 只在完整跑通路径盖章；三个生产者与 `promoteFromEvidence` 全走原子写，`coverage-report`/`spec-compliance-audit` 两个消费端走 `readEvidence`。 |

### F-72 离线对照（`E:/AIProMax/cocosair-fp-scratch/f72-atomic-control.cjs`，仓库外）
［2026-09-20 UPDATE-25：scratch 已回收，该脚本现位于 `raw/scratch-preserving-r23/scripts/f72-atomic-control.cjs`，从新路径重跑仍 11/11 PASS］

C1–C7：完整证据被采纳 / 缺 `completed`、`completed:false`、JSON 截断、文件缺失四种形态一律 NOT_RUN；C6 SIGKILL 打断写入；C7 双进程并发写同一目标。
日志：`raw/gates/f72-atomic-control-r23.log`。**首次 3 连跑中 run 3 FAIL**：

```
FAIL C6 target never shadowed by tmp :: e2e.json,e2e.json.writing-38848-ra3lnd
```

归因：这条断言测的是错的性质。SIGKILL 之后不可能回收 tmp，而残留 tmp 里恰好是**写完整的一代**（含 `completed:true`），读起来就是 COMPLETE。真正的安全性是"tmp 名既不等于目标路径、也不以 `.json/.png` 结尾，因此精确路径消费端与扩展名式目录扫描都命中不了；目标永远是完整代次"。核对过仓库内三个目录扫描式读者（`benchmark-evidence.cjs` 只走 `tools/benchmark`、`v11-gallery-artifact.cjs:109` 用 `endsWith('.png')`、`spec-evidence.cjs:180` 走示例目录名），均不会命中。改断言口径后 8 连跑全 `REAL_EXIT=0`，其中 3 次真的留下 tmp（`tmp leftovers=1`），断言非空洞。**这是控制脚本口径修正，不是把断言调松换取绿灯**——新断言额外要求名字匹配 `.writing-\d+-[a-z0-9]+`。

### 消费端端到端证据（离线，非浏览器门禁）

- `raw/gates/coverage-r23.log`：`verified 0`，两份已提交证据以 `status:"NOT_RUN" + reason:"completed!==true"` 被拒，`core/important gate FAIL`。
- `raw/gates/spec-compliance-r23.log`：45 例 151 fail，含 2 条全局 `S11-EVIDENCE-NOT-RUN`（逐一点名文件与生产者）。

### 本次必须如实标注的中间红

已提交的 `v11-examples-verified.json` / `v11-devtools-examples.json` 早于 `completed` 契约，**在新消费端下必然按 NOT_RUN 处理**，于是覆盖率与合规门禁当前红。这是设计出来的过渡红，不是回归；**不得靠手写 `completed:true` 抹平**（那等于伪造盖章），只能由 owner 重跑产生。

### 交回

r22 全量矩阵（40 id）与 DevTools 门禁（5 id）归 owner 执行（我方尝试运行被会话策略拦截，且其已声明"修后我重跑"）。重跑后需要：候选仍为 `d705a2c8b8eadd68`、`material-unlit` 的 `material-property` 回读 `UnlitCube.effect==='builtin-unlit'`、`dispatch:duplicate-requestId` + `session-self-report-codes` 为真观察 PASS、两份证据带 `completed:true`、`coverage-report` 与 `spec-compliance-audit` 的 NOT_RUN 归零。台账 F-70/F-72/F-74 已改为上述处置状态。


### 更正：本波修复已提交（同日晚，owner 追加授权「提交当前修复到 git」）

- 提交为 `3692554`（25 文件，**未 push**；`git remote -v` 仍为空）。上表「修复波留在工作树 / 未获提交授权」只对提交前成立。
- 提交前自查额外发现并修掉一处：`build/cocosair.module.min.js` 停在 2026-09-17、**不含 F-70 修复**，而它列在 `package.json` 的 `files` 发布清单里 → 跑 `npm run build:min` + `build:dts`（各退出 0）后一并入库，min 现含 `builtin-unlit-material`。`npm run build` 单条命令从不产出 min（F-36(a) 早有记录），所以这条陈旧不是本波引入，但本波让它从「陈旧」变成「与源码矛盾」，必须一起提交。
- 候选指纹仍为 `d705a2c8b8eadd68`（其定义域 = module.js + .d.ts + examples/shared，不含 min）。
- 未 staged 的仍是并行会话的 42 个路径：`ai/*.md`、`tools/dev/dev-server.cjs`、`docs/manual/**`、`docs/evidence/manual*`、`tools/verify/manual-*.cjs`、`.tmp-*`。
- jest 两次运行尝试被会话策略拦截，因此本次提交前检查用的是离线集合：`node --check` ×6、`tsc`/`build`/`build:min`/`build:dts` 退出 0、F-72 C1–C7 对照 8/8、两个消费端端到端。smoke-29 / smoke-03 未在本次真实跑过 → 不宣称绿灯。

## UPDATE-24 — V0.6 三轨道在新 bundle 上重采 + F-82 修复落地（2026-09-20，owner 点名放行 jest / V0.6 / F-82）

放行范围（点名）：全量 jest、V0.6 三轨道重采、F-82 修法（`build:all` + 一条离线绑定断言）。r22 40 例矩阵与 DevTools 5 例门禁仍归 owner，未执行。

### 起因：`3692554` 把 V0.6 弄红了（正确的红）

`benchmark-evidence.sourceHash()` 的定义域含 `build/cocosair.module.js` + `.d.ts`，F-70 重建 bundle 后它从 `ac1b151596b36975` 变成 `4e4fd374e33166ce` → `v06-report.cjs` 立刻 EXIT 1 / blockers 2（运行证据哈希不一致 + R001–R008 recipe sourceHash mismatch）。这是货币性失效，不是内容损坏；覆盖前已把三份 v06 证据连 sha256 快照进 `raw/pre-v06-recapture-001210/`（`474ff2bbd3b5c02d` / `a87f480f93c7ad8b` / `2a6e5391c5a8b749`）。

### 重采结果（全部真实浏览器执行，退出码为真值）

| 轨道 | 命令 | 结果 |
|---|---|---|
| golden dual-track | `NODE_PATH=<playwright> node tools/benchmark/run-dual-track.cjs` | EXIT 0，10 refs PASS，agent eligible 9/9、firstCompile 1.0 |
| recipes | `... node tools/benchmark/recipes/run-recipes-browser.cjs` | EXIT 0，**30/30 PASS**，semantic/lifecycle 全通过 |
| catalog runtime | `... node tools/verify/v06-catalog-gate.cjs` | EXIT 0，**100/100 PASS** |
| jest | `npx jest --ci --json --outputFile=output/v06-review-jest.json` | EXIT 1，29 套件 / **207 通过 / 1 失败** |
| v06-report | `node tools/verify/v06-report.cjs` | EXIT 1，`evidenceFailures []`、`coverageFailures []`，blockers 只剩 1 条：「本轮 Jest 结果尚未通过或缺失」 |

三份证据现绑 `4e4fd374e33166ce`（`measuredAt` 13:38:24Z / 13:40:22Z / 13:43:08Z）。

### 唯一 jest 失败的归因（不是回归）

`smoke-29-examples-spec` 的「§11/§12 证据链符合性零 fail」收到 45 例 `S11-NO-EVIDENCE` + `S11-PROMOTION-DRIFT`。原因只有一条：F-72 之后 `readEvidence` 把没有 `completed:true` 的旧浏览器证据整份判为 NOT_RUN。**链条闭合：owner 重跑 r22 + DevTools → 两份证据带章 → smoke-29 绿 → `npm test` 绿 → `v06-report` blockers 归零。** 在这之前 `npm test` 与 `verify:v06-gate` 在 HEAD 就是红的，这是事实，不做任何抹平（不手写盖章、不动阈值）。

其余 207 例全绿，包含读我改过脚本的 `smoke-03-runtime-asset`、以及加载 `build/cocosair.module.js` 的 `smoke-23-debug-isolation` → 本波 bundle 变更没有弄坏任何既有行为断言。

### F-82 处置（已按授权实现）

- 新增 `tools/verify/published-artifacts.cjs`：期望集从 `src/air/builtin/register.ts` 的 `builtin-*` 字面量推导（**不是 bundle 互比**，因此两份产物同时陈旧也能抓到），要求 `package.json` `files[]` 里每个 `build/*.js` 都含之；作为 `verify:consumer` 的第 0 步（打包前）执行，并串进新的 `npm run build:all`（esm + min + dts + 该检查）。
- 负控（仓库外 stub `E:/AIProMax/cocosair-fp-scratch/f82-copy`）：A) 新 source + 新 module.js + 从 `3692554^` 取回的旧 min → `FAIL cocosair.module.min.js: missing registered builtin "builtin-unlit-material"`，EXIT 1；B) 同树换上重建后的 min → `4 markers x 2 bundles: PASS`，EXIT 0。仓库内实跑 PASS。

### 顺手复核的既有条目

- **F-60 未变**：重采后 30 张 recipe 截图仍是 **24 个不同哈希**，重复组一字不差（`R001=R006`、`R004=R010`、`R005=R009`、`R022=R023=R024=R025`）。新增数据点：**6 张（R002/R012/R016/R026/R027/R028）在只换 bundle 的重采中改了字节却全部 PASS** → recipe 视觉容差会在不报任何异常的情况下吸收真实像素移动，这是 F-60 缺口的又一面。
- 待办不变：F-70/F-74 结案、覆盖率 `verified` 复算，全部等 owner 的两次重跑。

## UPDATE-25 · 2026-09-20 15:10Z · 清理无用产物文件（用户授权），并开 F-83

**动作与结果**

- 仓库外：`E:/AIProMax/cocosair-fp-scratch`（5.8 MB）回收。**5 个对照脚本先搬进台账再删目录**
  （`raw/scratch-preserving-r23/scripts/`，逐文件 sha256 见 `raw/scratch-preserving-r23/MANIFEST.txt`：
  PRESERVED 5 / DISCARDED 17 files 519,795 B）。回收助手本身（`E:/AIProMax/github/cocosair-recycle-r23.cjs`）随后删除。
  搬移后从**新路径**重跑 F-72 原子性对照：`node docs/audits/.../scripts/f72-atomic-control.cjs` → **11/11 PASS / EXIT 0**，
  即"保留不是归档尸体，仍可复现"。
- 仓库内：`build/.tmp-dev-*` ×6 + `build/.tmp-min-*` ×2 = **84,563,750 B**（每个目录只有一个 `cc.js.map`，
  未跟踪且 gitignore；最旧 09-19 22:11 本地，最新一个已空闲 73 分钟，删除瞬间无构建在跑）。
  删除前落清单 `raw/gates/r23-tmp-build-dirs-manifest.txt`（size + sha256_16；
  其中 07:41 与 21:49 两次 dev 构建的 map 摘要相同 `a74c170e07f437e4`，即两次构建产物未变；
  两次 min 同为 `e8bfdc010c087f7b`）。**清理过程中并行会话又起了一次构建**，新出现的
  `.tmp-dev-1789916465781` 与它改写中的 `build/cocosair.module.*` 一律不动、不提交。
- 明确**保留**：`build/.tmp-rollup-cache`（94 MB 增量缓存，删了下次构建变全量——代价已在 F-62 披露过一次）、
  `output/`（gitignore，但 `v06-review-jest.json` 是 `v06-report.cjs:26` 的输入，门禁要读）。

**新 finding F-83（非阻断，构建工具链）**：`tools/build/build.cjs:38` 为每次构建开唯一 `tmpOut`
（刻意为之，见 :36-37 注释：避开本机 safe-delete shim 对批量删除的拦截），但搬走 bundle、改写 map 之后
**从不回收该目录**，于是每次 `npm run build` / `build:min` 泄漏 9-11 MB。只泄漏字节、不影响正确性：
`candidateFingerprint` 与 `package.json files[]` 都不读 `build/.tmp-*`，真正的"陈旧产物上网"是 F-82（已修）。
最小修法与复测写在该条 finding 里；本轮**未改源码**（改动需 owner 授权）。

**台账指针一致性**：`evidence-index.json` 3 处 + `global-verdict.json` 1 处指向 scratch 的字符串已加
`DANGLING-SUPERSEDED (2026-09-20 r23 cleanup):` 前缀并给出新落点，**没有删任何历史行**；
`findings.jsonl` 仍 append-only（82 → 83 行，前缀逐行比对通过）。唯一未保留的是 `f82-copy`（一次性 stub 树，
重建配方在 `raw/gates/f82-published-artifacts-control-r23.log`），指针里如实写明 NOT PRESERVED 而不是假装仍在。
另：`evidence-index.json` 的 `rowShapesNote` 原写 "16 of 48"，实际已 69→70 行——计数会腐烂，已改成"用现读命令重算"。

Overall remains **NOT_READY**（本次清理不改变任何门禁 verdict）。

## UPDATE-26 · 2026-09-20 15:20Z · "是否全部解决"→ 按当前树现读一遍，不复用台账结论

用户问核查问题是否全部解决。台账里的 gate 文本是**各自那一波的冻结读数**，所以全部改成对当前工作树现读：

| 命令（离线） | 现读 | 相对台账的变化 |
|---|---|---|
| `node tools/verify/v06-report.cjs` | **EXIT 1 / blockers 3** | r23b 收尾是 1 条 → 并行会话 15:01–15:13Z 重建使 `sourceHash` 移动（live `430dcd0c…` vs 记录 `4e4fd374…`），R001-R030 集体 `sourceHash mismatch` |
| `node tools/examples/spec-compliance-audit.cjs` | **EXIT 1 / 151 fail, 1 warn** | 与 r23 同因（两份浏览器证据 `completed!==true` → 整份 NOT_RUN），不是 151 个独立缺陷 |
| `node tools/verify/license-audit.cjs` | **EXIT 1 / issues=3** | 不变：两个 `.glb` 缺 sidecar + `build/examples/` |
| `node tools/verify/published-artifacts.cjs` | **EXIT 0 / 4 markers x 2 bundles** | F-82 断言在并行重建之后依然成立（这条是本轮唯一"越动越可信"的） |
| `docs/api-coverage-report.json`（15:08Z 由并行会话重算） | claimed 62 / **verified 0** / stale 0 / claimsNotInInventory 5 | 63→0 的塌缩正是 F-72 生效的表现，不是计数回退 |

**候选身份已移动，必须写在所有结论前面**：审计冻结的 `d705a2c8b8eadd68`（208 tests / 4729 units）已被当前工作树的
`cdba413e50ab6065`（inventory `152b912918b78a9d`、210 tests、4730 units）取代；HEAD 仍是 `8f5bc76`，差值全是并行会话未提交的
manual/示例工作。因此凡"PASS 于 d705a2c8"的表述现在都是**历史读数**，不是当期证据。

**回答：没有全部解决。** 口径先说清（三种计数会互相矛盾，别混用）：`findings.jsonl` 共 **83 行**；行内自述明确写成
CLOSED/FIXED/CLEARED 的 **22 行**（F-24/26/29/44/48/49/51/52/57/58/59/61/62/63/64/67/72/73/75/76/77/82）；
行内文字仍含 open / partial / NOT_RUN / FAIL 语义的 **35 行**（其中 15 行带 `blocking=true` 标记）——
早期 F-01…F-23 那批用 `verdict` 字段冻结在发现波，从不在行内回写，所以真正的权威口径是
`global-verdict.json` 的 **10 个发布阻断门禁格**（多条 finding 汇入同一格）。`overall = NOT_READY`。四类缺口：

1. **只差 owner 在冻结候选上跑两次浏览器门禁**（引擎侧修复已落并离线证伪通过）：F-70、F-74、F-72 的浏览器证据、
   随之 `npx jest --ci` 210/210、`v06-report` 归零、覆盖率 `verified` 回升。
2. **缺环境/授权**：F-16（Firefox/WebKit 未装）、R6 独占环境 perf、R5 真 LLM Agent 轨道、`npm run verify:consumer`（F-82 新第 0 步从未在真实 consumer 跑里执行过）、F-83（构建泄漏，修法已给，改源码需授权）［r23d 已授权并修完，见 UPDATE-27］。
3. **需 owner 决策的内容/口径缺陷**（不许靠改断言凑绿）：F-34/F-35/F-79 Gallery 交付自足、F-78 两条门禁误设、
   F-27 license sidecar、F-80/R2 覆盖率分母粒度与 120-stable 天花板、F-60/F-55 视觉不可判别、F-81 共树证据碰撞。
4. **本来就是长期缺口**：documented-only 0/4730、13 个 `button-click` validator、F-69/F-71 API 面。

**本轮没有为了变绿而碰任何断言、阈值、参考图或 `completed` 字段。** 明细见 `global-verdict.json` 的 `liveReread_r23c`。

## UPDATE-27 · 2026-09-21 13:04Z · r23d：F-83 修复落地 + 新开 F-84（HEAD 自洽 / 门禁盲区）

owner 指令「先清理，然后提交，最后把未完成的加入任务列表，逐个执行。」在 `1ffe3eb` 之后继续执行的第一波。

### F-83 已修并验证（`tools/build/build.cjs`）

成功路径末尾加 `fs.rmSync(tmpOut, {recursive:true, force:true, maxRetries:5, retryDelay:100})`；失败路径（`:78 process.exit(1)`）**故意**保留中间目录以便诊断；`build/.tmp-rollup-cache` 是另一套持久缓存，不在本域内。

| 复测 | 结果 |
|---|---|
| `npm run build:all` | **EXIT 0 端到端**（该脚本历史上第一次跑通），`[published-artifacts] 4 markers x 2 bundles: PASS` |
| `npm run build` | 打印 `[build] cleaned: build\.tmp-dev-1789995728481`；跑完后 `build/` 下 `.tmp-*` 只剩 `.tmp-rollup-cache` |
| 发布字节 | `cocosair.module.js` `ca099f3483d67194` (3,736,205 B)、`.min.js` `3794077b58006fe9` (2,129,898 B) 修复前后**逐字节相同**——本修复没动过任何一个 consumer 会拿到的字节 |
| `npx jest --ci` | 209/210，唯一失败仍是 `smoke-29-examples-spec.test.ts:46` 期望 `0 fail`（F-72 NOT_RUN 级联，等 owner 两次浏览器重跑），与本修复无关 |

**自曝一次工具误用**：写本节时把带反引号的正文塞进 `node -e "…"`，bash 把反引号当命令替换，实际多跑了一次 `npm run build` / `npm run build:all`（14:54Z）。后果核对：两个 bundle 仍是 `ca099f3483d67194` / `3794077b58006fe9`，`published-artifacts.cjs` EXIT 0，`build/` 无遗留 `.tmp-*`——即 F-83 的确定性**额外被复现了第三次**，没有污染任何已记录的数，`.map`/`output/v06-review-jest.json` 等未被这次误跑改写。记录在此是因为这类"我自己触发的构建"正是 F-81（共树 last-writer-wins）的成因，审计方也要留痕。

**副作用已披露**：并行会话未提交的 `build/*.map` 与 `.d.ts` 在本次重建后差一行文档注释。归因：那批字节产于 f0b5925（2026-09-20T15:24:41Z 改 `src/air/app.ts`）之前，本来就是 pre-final-src；重建严格更新，所以**没有回滚覆盖**他们的工作，快照留在 `output/f83-pre-build-backup/`（gitignored）+ 清单可核对。

### F-84 新开（blocking，gate `candidateIntegrity`）

只读 git 对象库证明（`raw/gates/f84-head-vs-worktree-airversion.txt`）：`HEAD:build/cocosair.module.js` / `.min.js` / `.d.ts` 里 `AIR_VERSION` 命中数 = **0**，`HEAD:src/air/app.ts` = **1**，工作树 = 2/1/1。两个事实分层：

1. **瞬态**：干净 checkout 该提交会在 smoke-01 上红，作者把重建产物提交后自愈——不夸大严重性，但也不豁免：候选自洽就是按 checkout 判定的。
2. **持久缺口**：没有任何东西把已提交 src 绑定到已提交 `build/`。F-82 新断言按构造看不见它——`published-artifacts.cjs:18-21` 的期望集只来自 `src/air/builtin/register.ts` 里的 `'builtin-[a-z0-9-]+'` 字面量，且只读工作树。新导出符号（`AIR_VERSION`）与"提交了源码没提交产物字节"这两类它都判不出来。

修法方向是**加强**断言（不许反向）：期望集扩到入口 re-export 表；再加 `--head` 模式对 `HEAD:src` vs `HEAD:build` 跑同一断言，使"工作树绿、checkout 红"不再可能。

### 计数口径（不可与 UPDATE-26 的"22 行"混用）

`findings.jsonl` 现 **84 行**（F-84 已 append）。本轮只按 `status`/`verdict` 字段文本重算：含 FIXED/CLOSED/CLEARED = **20 行**（含新收的 F-83）；并上自述 RESOLVED/PASS 且行内无红/开字样 = 并集 **25 行**；`blocking=true` 标记 **34 行**。UPDATE-26 的 22 行是当时的跨字段枚举，口径不同，**不要引用它做进度百分比**。权威口径仍是 `global-verdict.json` 的 **10 个 `blockingForRelease` 门禁格**（多条 finding 汇入同一格），本轮长度不变：F-84 挂在本来就红的 `candidateIntegrity` 上。

证据：`raw/gates/f83-fix-verification-r23d.txt`、`raw/gates/f84-head-vs-worktree-airversion.txt`；索引行 `F83-FIX-AND-F84-R23D`；结论格 `global-verdict.json` 的 `f83FixAndF84_r23d`。**本轮同样没有为了变绿而碰任何断言、阈值、参考图或 `completed` 字段。**

## UPDATE-28 · 2026-09-21 15:02Z · r23e：verify:consumer 首次真实端到端 → 新开 F-85

任务 #42 针对的就是"F-82 新加的第 0 步从未在真实 consumer 跑里执行过"。这次真跑 `npm run verify:consumer`
（日志 `raw/gates/r23e-verify-consumer.log`，启动 14:57:29Z / 落盘 15:02:46Z）：

| 阶段 | 结果 |
|---|---|
| 0 published-artifacts（F-82 断言） | **PASS 4 markers x 2 bundles, 0 fail** —— 首次在真实 consumer 流程内执行 |
| 1-2 pack + install | tarball 6,321,041 B / 74 文件；消费者目录在系统 tmp，装完不改包体 |
| 3 安装树断言 | 无 `src/test/tools/output` 泄漏；`build/package.json` 确实声明 `{"type":"module"}` |
| 4 真实 `import()`（jsdom 全局域） | **exportCount 369**，14 个具名导出全在 |
| 5 消费者 TS 编译 | strict + node16 解析对已发布 `.d.ts` 通过 |
| 6 README 相对链接 | **FAIL 1 条**：`README links to missing packaged file: docs/manual/index.md` |

`EXIT=1`，唯一红项就是那条链接 → 新开 **F-85（`blocking:false`）**：`README.md:84` 的手册链接随 8a1658b 手册波进来，
而 `package.json` 的 `files` 对 docs 只 glob 一层（`docs/*.md` + `docs/*.json`：实 pack 45 个 md / 4 个 json，
`docs/manual` 命中 **0**）。文件在仓库里存在且已跟踪，只是没被打进包。

**为什么不顺手改掉**：`files` 决定发布内容，属 owner 决策；`docs/manual/**` 是并行会话的在飞工作（台账已列为不可动）。
而且这里有第二层坑：门禁第 6 步只走 README.md。手册 61 篇 `.md` 内部共 426 条相对链接，其中 **40 条超出 `.md` 集合**
（39 条指向 `docs/manual/examples/manual-*/`，1 条指向 `../../README.md`）。所以"只 ship `docs/manual/*.md`"会把
1 条可见坏链换成 39 条无门禁覆盖的坏链——修法必须与门禁深度一起加强（F-85 `minimalFix` 给了 (a1)/(a2)/(b) 三选项）。

顺带钉掉两处过时表述：`publishedArtifacts_addendum.notRun` 的"step 0 从未在真实 consumer 跑里执行"、
`liveReread_r23c.answerToTheQuestion` 的"缺授权：npm run verify:consumer"，均已就地标 `SUPERSEDED`。
**没有为变绿而碰任何断言、阈值、`files`、README 或参考图。**

## UPDATE-29 · 2026-09-21 15:13Z · r23f：Gallery 部署物离线复读 → F-34 结案、F-86 开门

任务 #43 的口径是"部署物离线自足"。这次把 `build/examples` 用静态服务挂在**它自己的根**上
（无 `/build/` 路由、无 `/__debug/`、无 dev server）**只读**复跑（`build` 模式开头是
`fs.rmSync(build/examples)`，那目录是并行会话的在飞产物，所以没重建）：

| 检查 | 结果 |
|---|---|
| `GET /gltf-meshopt/main.boot.js` | 200，字面量已是 `../gltf-decoders/meshopt/meshopt_decoder.mjs` |
| 按文档基解析后的解码器 URL | **200**（老绝对形态 `/build/gltf-decoders/...` → 404，且 45 个 boot.js 里绝对 `/build/` 命中数 = 0） |
| `GET /gltf-meshopt/assets/meshopt-khr.glb` | 200 |
| `GET /__debug/agent-session.js` | **404** —— 5 个 boot.js 仍引它（automation 无守卫 + rethrow，4 个 `rc-*` 走 `__debugBase` 兜底） |

⇒ **F-34 关闭**：守卫修复（前缀匹配、两种引号）早已随 0773058 提交，这一次是对**交付字节**的证伪通过，
不是对源码的推断。**F-35 保持原样**：它是 owner 的合同口径问题（requiresDevTools 的 6 个 stable 示例
到底算不算静态认证集），不许我用弱化断言的方式"解决"。

**新开 F-86（`blocking:false`，证据货币类）**：`sha256_16` 实测 artifact 内引擎 `5527b1fa87ea3a36`
（3,735,922 B，mtime 2026-09-19T14:17:58Z）vs 实时 `build/cocosair.module.js` `ca099f3483d67194`
（3,736,205 B）——而这个门禁的 evidence 对象**没有任何 hash/指纹字段**，`mode verify` 又允许只读盘上现成字节，
于是最后一次 70/76 的读数认证的是 **F-70 之前的引擎**，且与新鲜读数在字节层面不可区分。
这是 F-82（发布 bundle vs 源码）、F-84（已提交 src vs 已提交 build/）之后同一家族的第三例。
F-72 的 `completed:true` 只证明"跑完了"，不证明"测的是哪份字节"——这条缺口正是它管不到的地方。
修法（加强方向，写在 F-86 `minimalFix`）：evidence 里记两个引擎 sha256 + 候选指纹，
并加 `artifact:engine-copy-current` 断言，两条 hash 不等就 FAIL 并打印双方。
没动手改这个脚本：它与并行会话共用，且它的 build 模式会删 `build/examples`。

**顺带纠一处口径**：那份 70/76 读数里 6 条红的归属已逐条核清——2 条属 F-78（`draco/draco_decoder.js`
全仓零生产零消费；meshopt 的 wasm 是内嵌编码串，永远不会有独立 `.wasm` 请求），4 条属 F-79
（gltf-catalog 不装 `window.__airApp`、source-view 探 3 条不存在的路径、36 次 raw.githubusercontent 请求），
另外该文件本身没有 `completed` 字段（写于原子生产者之前），消费端按 NOT_RUN 处理，属 F-72 已知效果。
