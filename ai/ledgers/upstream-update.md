# Upstream update execution ledger

Plan: [AIR-UPSTREAM-20261022](../plans/upstream-update.md). This is an implementation batch, not a release version.

## Scope and authorization

The user requested implementation on a separate branch and a pull request. This supersedes the supplied plan's old pending commit/push/PR authorization, but does not authorize merge, release, deployment, permission changes, credential extraction or model-route changes. No Box3D or acrylic experiment is included.

The live main branch was read on 2026-10-22 and still equals `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`. The independent branch is `feat/upstream-update-20261022`. The exact base commit and complete tree are verified; this is a partial, blob-verified local checkout, not a full authenticated clone. Unmaterialized historical evidence is not deleted or treated as current evidence.

## Milestones

| Milestone | Work packages                                               | State       |
| --------- | ----------------------------------------------------------- | ----------- |
| M0        | U00 scope, contracts, baseline and inventory                | complete    |
| M1        | U01 loading, U02 material contract, U06 consumer signatures | implemented |
| M2        | U03 color/depth, U04 state isolation, U05 lifecycle         | implemented |
| M3        | U07 readiness, U08 experiments, U09 examples                | implemented |
| M4        | U10 integration and current-candidate evidence              | in_progress |

Only one milestone is in progress. At most three non-conflicting workers are used. The coordinator owns public barrels, package metadata, shared manifests, CI and publication evidence.

## Frozen M0 decisions

- Preserve native Scene/Node/Material APIs, default WebGL2, explicit experimental WebGPU without fallback, single transmission capture, independent optional assets and existing lifecycle/session boundaries.
- Extend `GLTFLoaderOptions` additively with `request?: AirRequestPolicy`. Public policy fields are `priority?: 'high' | 'low' | 'auto'`, `httpCache?: RequestCache`, `credentials?: RequestCredentials`, and `headers?: HeadersInit`. Browser priority is a hint, not a promised completion order. HTTP cache is distinct from asset, in-flight and parse caches.
- Preserve the option-free native asset-manager route. Configured/cancellable requests must not enter URL-only native sharing with incompatible consumers. Use local isolation in the existing loader, not a replacement resource manager. Request-policy undefined fields inherit; explicit legal defaults are retained. Injected decoders remain caller-owned and are never silently reconfigured.
- Do not forward configured headers from a glTF origin to cross-origin dependencies by default. Tests use synthetic headers only. Cancellation must cover preflight, fetch, dependency/decode waits and the ownership handoff; late uncancellable work must be discarded, not claimed physically stopped.
- IOR schema is fixed to Khronos blob `2d8e06517f8ff7f0bdf10f34838b2f6eebd150f0`: finite IOR >= 1, default 1.3, no maximum. Thickness uses nanometers and the green texture channel; missing thickness texture means the maximum, independent of volume.
- Do not change the default tone mapper or blindly add sampler precision. Rendering changes require actual final-GLSL and browser evidence. Independent CPU math is the oracle, never a call into production functions.
- The frozen minimum is 36 scenarios in [acceptance-manifest.json](upstream-update/acceptance-manifest.json). CPU absolute tolerance is 1e-5, flat RGBA8 ROI tolerance is 2/255, AABB containment tolerance is 1e-5 times max(1, scene diagonal); no post-failure relaxation. Lifecycle stress uses 30 cycles.
- Repository organization overrides the plan's suggested date-directory: plan and ledger live under ai/plans and ai/ledgers, evidence under docs/evidence, tools under tools/verify. No script copies per release batch.
- Main has 188 example specifications, not a fixed 182. This inventory is not full live-manifest runtime coverage. Frozen benchmark inventory has 150 B fixtures; scripted A001 is explicitly not an LLM result.

## Known infrastructure and evidence limits at M0

- Node 24.19.0/npm 11.9.0 and locked dependencies installed. First npm attempt failed because its default cache path was not writable; retry with a worktree-external writable cache succeeded. No lockfile changes.
- Chromium 155 and Playwright 1.62.1 exist. No browser has yet been launched for this candidate. Firefox's matching binary is missing; WebKit's matching binary exists but its dependencies/startup are unverified. WebGL2 renderer, compositor and WebGPU adapter are UNKNOWN, not PASS.
- No authorized Android/USB/adb or physical GPU path is established. Real Android Chrome and two mobile GPU families are BLOCKED. Mobile viewport testing cannot replace them.
- `perf-lifecycle.cjs` and `tarball-browser-consumer.cjs` have Windows-only Chromium paths. Repairing configuration portability is allowed; weakening their assertions is not.
- Real Agent Gate is BLOCKED pending a frozen model/provider revision, input/output/token/cost observations, launch configuration, cohort inputs and execution route for 12 tasks x 3 repeats x 2 engines per configuration. Existing A001 copies reference answers. CB21 preparation has a different 24-pair protocol and external inputs and does not invoke a model. Neither can be relabelled as this plan's 36 pairs/72 runs. No credentials or model routes are changed to manufacture a score.
- These limitations do not prevent implementation or supported CPU/Chromium investigation. They do prevent claiming the full plan, Agent Gate, mobile gate or release is complete. All scenario results begin NOT_RUN; expected-negative PASS never implies positive capability support.

## Current evidence

Baseline/source/spec identities are in [source-map.json](upstream-update/source-map.json). Candidate runtime results will be collected only after source, tooling, dependencies, formatting and builds freeze. Historical evidence remains historical. No current Engine, Agent or release PASS is claimed.

## M1 implementation checkpoints (not final acceptance)

- `496ed900a64e498fca663e254f3dcda73fa7ba90`: U02 finite iridescence IOR >= 1 without an invented ceiling, strict malformed-input rejection, removed scalar shader clamp, native material-instance mutation contract. 31 focused tests passed after preserved red tests. GPU pixel equivalence remains unmeasured.
- `953a466412acd61dd95127aed533935555fedfcd`: U01 request policy, isolated configured loads, cancellation and late-result disposal, parser/handler cleanup at actual asset release. 15 glTF suites / 170 tests passed, including 24 new request/cancellation tests; typecheck and scoped formatting passed. These are CPU tests, not HTTP-cache/priority/browser acceptance.
- U06 verifier additions include actual installed-package strict-null cases, declaration/runtime value-export parity and isolated `/math` checking. The verifier's synthetic-package suite passed 6/6, including rejection of ten deliberately weakened type contracts. That harness result is not a candidate SDK result.
- The first `build:all` failed at Node's default heap limit; the failed log is retained. A retry with `NODE_OPTIONS=--max-old-space-size=6144` succeeded, producing dev build 202 and min build 203 plus declarations and package preparation. Compiler warnings are retained. Actual tarball consumer checks and full Jest regression are still running at this checkpoint. These M1 build identities will be superseded by any later source change and must not be used as final M4 fingerprints.

### Browser infrastructure result

The same shell invocation can start a loopback HTTP server and fetch its response. Chromium 155 launched by Playwright nevertheless exits with `process_singleton_posix.cc: socket() failed: Operation not permitted`. The supported elevated execution attempt failed before launch while creating the execution sandbox (`bwrap`, protected read-only sessions path); that protected path was not read or changed. The existing cloud CDP browser is available, but cannot reach the separately isolated shell service. Its URL policy also rejects `file:`; that route was stopped, not worked around. Therefore browser execution in this task is currently `INFRA_BLOCKED`, not proof that WebGL2/WebGPU is unsupported and not a GPU/browser PASS. No third-party deployment, browser-policy bypass, user-computer switch or credential access was performed.

### M1 SDK generator repair and current CPU result

The real installed consumer exposed 11 false declaration values and 39 missing runtime values. The source exports were not expanded to silence the check. The runtime and declaration builders now share the existing default feature list, the declaration bridge is scoped to one invocation, and the TypeScript entry surface restores type-only exports and already-public runtime exports without admitting the optional Spark unit. Installed dependencies and package output are never patched by the consumer. Generator failures fail closed; recovery is limited to a verified completed declaration stage followed by the known temporary-directory cleanup error.

On 2026-10-22, the final M1 `build:dts`, `prepare-package` and real npm tarball consumer all exited zero. TS 4.9.5 node/node16 and TS 5.9.3 node16/bundler passed 33 negative cases and 11 exact-type assertions per mode. Bidirectional value-export parity passed for 648 main and 47 math values. The isolated math and CPU lifecycle probes passed. Generator/cache tests passed 6/6 and verifier tests passed 6/6. These are CPU/package results; browser import maps, Vite runtime, GPU rendering, mobile and real Agent Gate remain unverified or blocked as stated above.

M1 is implemented, not a declaration of full acceptance. M2 is now the only active milestone. Final M4 builds and fingerprints must supersede M1 outputs after all source and tooling changes. The exploratory full Jest attempt was interrupted, so its 89 passing suites are not a full-suite PASS; prerequisite and legacy-fixture failures are retained for diagnosis.

## M2 implementation and evidence boundary

- U03 preserves the actual Cocos scalar ACES-style fit and gamma-square/sqrt shader encoding. Independent binary64/float32 vectors and final ProgramLib→WebGL2 shader-source boundary captures passed; existing native shadow and custom depth samplers retain highp. No unsupported blanket precision or tone-mapper change was made. Six focused suites / 56 tests passed, including 41 new tests. Root TypeScript checking and frozen builtin source verification passed.
- U04 tests actual native material instances and per-pass PSO keys, not the XOR-aggregated Material hash. Seven focused suites / 57 tests passed. Equal-size targets retain distinct framebuffer, camera and material bindings through A→B→A, resize and recreation in CPU command/allocation fixtures. Single-capture rejection and release/re-enable are retained. The new native browser fixture/collector is prepared, not run; transmission pixel/binding restoration is still a separate pending rendering check.
- U05 independently reproduced two defects: a morphed skinned vertex at y=1.875 exceeded the prior world AABB maxY=1.25; renderer-owned material instances retained passes after node teardown in all 30 cycles. Three minimal Cocos changes apply instance morph displacements before bounds, cache only the latest model weights without changing the shared base cache, and destroy only renderer-owned material instances. Expanded CPU regressions cover negative/large weights, multiple targets/submeshes, negative/nonuniform scales, borrowed instances and typed-array alignment. Twelve focused suites / 120 tests passed, plus 9/9 observation-validator unit tests. Native clone and glTF instantiate are tested independently. Browser frustum/vertex-color/morph rendering remains blocked.
- The two pre-existing test-fixture failures were corrected to their actual contracts: conditional GLSL declarations use DECLARATION_UNSUPPORTED; deferred asset settlement requires two increasing update/draw cycles with a microtask checkpoint. Production validation/lifecycle was not weakened.
- The upstream mapping records the three Cocos changes, preserving the frozen upstream baseline. The WASM closure deviation list adds only MeshRenderer, already justified in that mapping. Full verify:file-map exits 2 because the required original upstream snapshot is absent; this is not a successful byte-for-byte upstream comparison.

M2 is implemented with CPU evidence, not full Engine acceptance. The new color/state/skinning browser fixtures have not run. M3 alone is active. Final M4 collection must use a fresh SDK after these source changes. Remote publication after 96845622 is temporarily pending an authorization-review clarification; independent WIP recovery Git bundles are retained without claiming a pushed commit or PR.

## M3 partial implementation checkpoint

U07 verification-only first-frame observation separates engine, declared resources, pass inspection, actual submission and externally validated compositor presentation. It never ticks the engine or silently compiles passes; unknown inspection is BLOCKED. Ten CPU protocol tests and strict standalone browser-module TypeScript checking passed. All five real browser cases remain NOT_RUN due to the recorded infrastructure limitation.

U08 adds independent normal/reverse depth diagnostics, a native depth-texture path, independent SH math and explicit experimental capture fixtures with fail-closed observation validation. Twenty-six CPU/source tests passed. Existing transparency is sorted alpha, not OIT; reflection capture is editor-gated, not a production Web probe baker. T30–T33 remain BLOCKED pending the required actual GPU/performance evidence. No default projection, depth format, renderer or public runtime export changed.

U09 remains in progress. M3 is not complete. The partial U07/U08 checkpoint is preserved as a local Git recovery ref and incremental Library bundle, not a remotely pushed commit or PR.

## M3 implementation boundary and U09 candidate

U09 adds eight draft/draft entry points and a shared native material inspection scene: a fixed local two-joint glTF and original checker, three independent instances, twelve material templates/samples, a single transmission crystal and two same-size ordinary render targets. Native pointer/AABB selection, orbit, linear RGB, UV offset/scale/rotation, iridescence/IOR/thickness, morph, independent animation pause/sample, cancellation/retry and instance teardown/rebuild are wired to real APIs. The explicit 30-cycle control uses the existing update/draw/microtask lifecycle contract and records app-owned objects, models and listener registrations; total GPU memory remains unavailable. Research/readiness pages are opt-in separate diagnostics, not stable runtime features or default startup dependencies.

Twelve U09 CPU input/asset-hash/coordinate contracts passed. U07+U09 combined rerun passed 22 tests. Strict reproducible source/example checking with tools/verify/upstream-update.tsconfig.json and browser-module compilation passed; neither is a browser execution. The real three-profile pointer/DPR/container/pixel/cancellation/lifecycle collector is prepared and NOT_RUN.

All eight new example specifications pass static validation and remain unpromoted. The live manifest is minimally extended from 188 to 196; all 188 old objects, statuses and promotion fields are preserved. Full static specification validation still fails on seven existing batching source-line anchors. The source, affected specifications and prior manifest exactly match the pinned main Git blobs, so this is BASELINE_DOCUMENT_DRIFT, not a new source failure. The prior manifest also differs from current specifications in 184 promotion records and three statuses; no historical evidence was restamped to hide it.

M3 is implemented as an unverified browser candidate, not fully accepted. U08 GPU/performance decisions, all applicable browser/mobile gates and the real Agent Gate remain blocked. M4 is the only active milestone. All local changes remain separately recoverable while GitHub publication awaits the pending clarification.

## M4 integration checkpoint (in progress)

The independent Engine/Agent gate validator now rejects missing dimensions, stale source/artifact inventories, mismatched pairs, scripted/reference answers labelled as model output, unrecorded costs and incomplete campaigns. Its 27 synthetic unit checks validate the validator only; they are not an Engine/Agent score. The real model protocol remains BLOCKED and has no invented launch configuration. Focused Node source/validator/CI tests passed 73/73. CI preserves its existing scope and adds focused contracts plus one bounded native render-state probe; no new workflow was dispatched.

The eight draft examples remain unpromoted. Packaging prerequisites are now complete for the pinned main npm files list: 213 missing original documents were restored from local archives with exact Git blob hashes, without overwriting any edited document. A fresh current-source runtime/declaration build, real installed tarball checks and a complete isolated CPU inventory are next; no M1 build is treated as current evidence. Remote GitHub writes remain paused awaiting the pending clarification, while this independent M4 WIP is retained in a recovery Git bundle.

### M4 collector preparation checkpoint

Fresh current runtime development/minified/declaration builds and separate Spark build completed with retained raw logs. The 221-suite isolated CPU campaign is still in progress; no complete Jest PASS is claimed. Frozen original documentation and third-party reference inputs were restored using their original blob identities. Source-map and legacy reference prerequisites missing in the first CPU attempt are retained as failed evidence, not rewritten.

U01 now has an 18-case three-browser HTTP/cache/credential/header/concurrency/cancellation collection protocol. U02/U04 add ten IOR/texture mutation-versus-rebuild pairs, three texture-channel/volume-independence pairs and transmission disable/re-enable/recreate pixel/restoration pairs; 13 validator tests pass. These browser fixtures are prepared and unexecuted. U07 shader fault injection now uses normal native EffectAsset/Material construction observed at WebGL2 compileShader, not a standalone synthetic shader. Additional U05/U08 collectors are being completed.

The exact declaration export inventory now recognises explicitly exported type-only local classes without falsely claiming a runtime class value. This preserves Screen instance-method claims while keeping Screen absent from runtime-value parity. Three AST tests pass. Actual generated API inventory adds 27 required units rather than deleting missing coverage to make a gate pass. Existing example/browser evidence is not restamped.

### M4 implemented collector checkpoint

Current development/minified builds are 204/205. The real installed npm consumer passed again on these bytes: TS 4.9.5 and 5.9.3 strict positive/negative contracts, 648 main and 47 math value-export parity, standalone math and native CPU lifecycle. Complete focused Node tooling checks pass 153/153; strict source/example/observer/skinning-fixture checking passes without skipLibCheck. Full configured formatting passes. The optional public app.close signature is guarded by the fixture rather than weakened.

All U01/U02/U04/U05/U07/U08/U09 collection gaps identified during integration now have explicit executable browser protocols. U05 retains RGB/RGBA native pixels, compositor snapshots, independent bounds and 60 disposal cycles; U08 drives all ten declared configurations, retaining GPU render captures and CPU SH projection distinctly. Prepared collection is NOT execution: actual GPU, mobile, hardware performance and model generation remain blocked. Browser-owned child close is bounded and must be observed, not inferred from transport disconnect.

The first full CPU campaign retained 213/221 suite reports, 3170 passing and 258 failing assertions, with one eight-suite process terminated by an obsolete lifecycle test mock. It is FAIL/partial, never a full PASS. The unchanged production asset-lifecycle source exactly matches main blob e6979a8b995e82e0558c034ec1caebcc47bac7b4 and requires two increasing update→draw pairs with a microtask boundary; only the old tests were repaired. Sixty related tests pass, including draw-only, update-only, duplicate-frame, same-task, deadline and post-completion cleanup negative controls. The full 221-suite frozen retry is in progress independently; its result is not synthesized by merging prior PASS rows.

The Gallery scope test now derives the exact ordinary-ID and mode set from the live 196-entry manifest and separately requires all eight new entries to remain drafts, replacing an obsolete hard-coded 183 count. The existing mandatory specialized proof test exposed missing ordinary-CI supervisor/probe/receipt wiring; these CPU checks and failure-artifact retention were added without removing any old trigger, test or browser example. Current browser-campaign/release gates remain independent and incomplete.

### M4 complete CPU attempt and preparation correction (still in progress)

The second full CPU campaign completed all 221 suites with 3,702 assertions: 3,689 passed, 13 failed, zero skipped. It is FAIL, not a merged or inferred PASS. The raw 28 batches and per-assertion classification are retained. Seven failures concern unavailable original upstream source/current browser matrix; four concern static-spec/evidence prerequisites and pre-existing promotion drift; one is the missing original Recipe test input; one exposed an ordinary-CI scope regression.

The mistakenly added full supervisor CPU campaign was removed from ordinary CI, preserving the existing AGENTS/CI contract, all triggers and five browser examples. The old specialized test now distinguishes its focused ordinary CPU proof from the explicit manual supervisor campaign. Both affected suites pass 69 assertions; the prior conflicting failures remain.

Static specification freezing is not runtime promotion. After correcting seven baseline API line anchors and freezing only the eight new specStatus fields, all 196 strict static specifications pass with 4,714 evidence anchors checked without drift. The new runtime statuses remain draft, with no promotion; all 188 old manifest objects and all old runtime statuses/promotions are unchanged. The original main Recipe evidence was restored by exact Git blob solely as a historical CPU-test prerequisite, not as current browser success. Affected complete tests still need their new scoped rerun.

U10 preparation continues: exact three@0.186.1 and original/current knowledge inputs are being frozen, independent paired observation/reference adapters are being prepared, and a separate exact-main source control build is running. These are preparable tasks, distinct from the unavailable real provider/model route and browser/device execution. The first M4 snapshot and SDK artifacts remain immutable historical attempts; new preparation/source bytes require a new snapshot and all dependent checks. Remote writes remain paused.

### M4 correction and package-control checkpoint

The affected spec/recipes/CI rerun completed four suites, 82 assertions, 81 PASS and one FAIL. Static specification freezing is not runtime promotion: all 196 specifications pass, new eight examples remain draft, and all original 188 manifest entries retain their original runtime status/promotion. The remaining failure is the full current Gallery evidence-chain audit; baseline promotion drift and absent current browser evidence are not hidden. Original full 3,702/3,689/13 results remain immutable. Ordinary CI now follows the unchanged main AGENTS contract, retaining focused checks, five Chromium examples and failure artifacts; full supervisor collection remains manual.

A fixed-main control was rebuilt from 3,769 exact main source files plus 17 decoder inputs using the same installed locked toolchain. Its partial-input source snapshot has independent Git history and a Library bundle; it is not claimed as a full clone or original historical binary. Actual control, current candidate and fixed three@0.186.1 package archives are retained separately. The current candidate installed-package strict caller/type CPU checks passed with the task's explicit skipLibCheck:true contract. Browser consumption and model generation remain NOT_RUN.

U10 source preparation continues. Admission now reopens every protected reference receipt, validates frozen seed/task/engine/package identities, and applies the independent observation oracle to generated PASS claims. Self-attested booleans, matching arbitrary hashes or validator names alone cannot establish success. No model observations produce null performance metrics, never a fabricated 0% measurement. This checkpoint is WIP and not a remotely pushed commit, PR or accepted milestone.

### M4 type compatibility repair and prepared paired inputs (in progress)

Runtime value parity alone did not prove SDK compatibility. The exact main declaration blob was recovered and 30,697 legal type/member probes plus 3,293 erased constructor/static queries were exercised in four compiler/resolution modes. The initial narrowed declaration candidate broke legal Spark and generated private type imports. The first repair restored the all-feature type graph and Node16 self-reference precision but still moved 17 @engineInternal private names, producing 108 legal-caller diagnostics. Both failed candidates and every raw comparison remain retained.

The second repair derives the original private layout and current source-symbol identity in the same generator invocation, adding type aliases to the actual canonical target without fabricating runtime values or copying historical declaration code. A focused strict test covers same-named classes from distinct source files, generic and protected identity, Node16 resolution and non-runtime namespace rejection. This candidate requires the complete unchanged compatibility matrix before acceptance. Runtime builds 206/207 and Spark succeeded; the DTS-only repair succeeded. Full 221-suite CPU rerun and final installed-consumer audit are in progress.

The 12-task public-input bank has 61 immutable files, exact old/current knowledge identities, fixed three@0.186.1, common resource hashes and three predeclared seeds. Fifty-four protected reference source identities and all independent observation contracts are frozen; 76 CPU/real HTTP protocol tests passed. These are not model trials or browser results. The coordinator protocol binds four separate engine/knowledge configurations without enabling generation. Three matching declarations, physical paired browser reference receipts, real model/parameters and enforced generator isolation remain explicit prerequisites.

### M4 final local result and independent restoration (blocked, not complete)

The final full CPU campaign completed all 221 suites: 3,702 assertions, 3,694 PASS, eight FAIL and zero skipped. Five of the prior 13 failures were corrected. Remaining failures are the unavailable exact original upstream snapshot, six current three-browser evidence assertions, and full Gallery evidence/promotion drift. All original attempts remain immutable. The final Engine/Agent admission is BLOCKED, with all 102 frozen dimensions retained, zero generated runs and null Agent metrics.

The final 8ddc2e5e package passes all enumerated historical type/member/static queries in four compiler modes; removed API inventory entries were independently classified rather than justified by runtime value counts. Runtime builds 206/207, package checks, 275 focused tooling tests, source/fixture typing and 196 static specifications pass. Standalone Spark Node16 weakness and original upstream license evidence remain explicitly unresolved. See docs/evidence/upstream-update/FINAL.md for precise scope and prerequisites.

Recovery was checked in a separate new directory. The prior sparse-index WIP omission of three tests was corrected, all index flags were audited, exact unchanged base blobs were included in a new recovery-input pack, and the code bundle was unbundled independently. All frozen source/dependency/artifact bytes matched; the three omitted suites passed 136 assertions, all 276 restored tooling contracts passed with complete frozen external inputs, typechecks passed, and the real consumer repacked the exact 8ddc archive. Initial restoration/input failures are retained. This does not claim another full CPU campaign or a full historical clone. Final evidence-only additions retain the same frozen executable source identity. M4 remains blocked/in progress, with publication awaiting confirmation and no PR, merge, release or deployment performed.
