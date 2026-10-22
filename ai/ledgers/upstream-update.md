# Upstream update execution ledger

Plan: [AIR-UPSTREAM-20261022](../plans/upstream-update.md). This is an implementation batch, not a release version.

## Scope and authorization

The user requested implementation on a separate branch and a pull request. This supersedes the supplied plan's old pending commit/push/PR authorization, but does not authorize merge, release, deployment, permission changes, credential extraction or model-route changes. No Box3D or acrylic experiment is included.

The live main branch was read on 2026-10-22 and still equals `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`. The independent branch is `feat/upstream-update-20261022`. The exact base commit and complete tree are verified; this is a partial, blob-verified local checkout, not a full authenticated clone. Unmaterialized historical evidence is not deleted or treated as current evidence.

## Milestones

| Milestone | Work packages                                               | State       |
| --------- | ----------------------------------------------------------- | ----------- |
| M0        | U00 scope, contracts, baseline and inventory                | complete    |
| M1        | U01 loading, U02 material contract, U06 consumer signatures | in_progress |
| M2        | U03 color/depth, U04 state isolation, U05 lifecycle         | not_started |
| M3        | U07 readiness, U08 experiments, U09 examples                | not_started |
| M4        | U10 integration and current-candidate evidence              | not_started |

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
