# Cocos4 TypeScript update integration

This source integration targets AIR `main` at `2dcdefdae37a4c602cf6faddcf3ede5b64a2e494` (including the explicit-mipmap fix; the only change after tested runtime base `217511f` is a README link deletion). It compares official Cocos4 `fffd9a514a83f93034e288c0b99308826f65c573` through `a56706c9adb6200cfa066a4648e4915288b2684b`: 33 commits, 15 containing TypeScript changes. It does not replace AIR's frozen extraction baseline or overwrite existing AIR fixes.

## Complete TypeScript scope

| Upstream PR                                     | AIR disposition                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [348](https://github.com/cocos/cocos4/pull/348) | Imported long-label/CHAR scaling fixes. Bold is preserved when rebuilding the CHAR descriptor.                                                                                                                                                                       |
| [354](https://github.com/cocos/cocos4/pull/354) | Imported SkinnedMeshBatchRenderer accessor forwarding without recursive decorated super access.                                                                                                                                                                      |
| [352](https://github.com/cocos/cocos4/pull/352) | Imported randomized two-value time/distance emission factors. Constant rates retain deterministic accumulation.                                                                                                                                                      |
| [356](https://github.com/cocos/cocos4/pull/356) | Imported Button component listener conveniences and original input-event delivery.                                                                                                                                                                                   |
| [359](https://github.com/cocos/cocos4/pull/359) | Imported uniform/texture/baked skinning resource rebindings. AIR validation, morph bounds and custom instanced values are preserved.                                                                                                                                 |
| [367](https://github.com/cocos/cocos4/pull/367) | Imported MaxDPR and startup `screen.maxDevicePixelRatio`; added a reproducible transform over the existing frozen MIT Web PAL. Explicit AIR `pixelRatioCap` wins, including existing positive fractional values.                                                     |
| [373](https://github.com/cocos/cocos4/pull/373) | Imported on-demand, grow-only Graphics allocations and constants.                                                                                                                                                                                                    |
| [379](https://github.com/cocos/cocos4/pull/379) | Imported MeshRenderData index-buffer destruction.                                                                                                                                                                                                                    |
| [381](https://github.com/cocos/cocos4/pull/381) | Adapted platform-touch duplicate suppression while retaining Web mouse-to-touch synthesis on touchscreen computers. AIR does not ship or certify WeChat.                                                                                                             |
| [382](https://github.com/cocos/cocos4/pull/382) | Imported font-family quoting/serialization and uncached readiness measurements. Retains upstream native branches without shipping a native backend; also corrects the touched EditBox placeholder `font-family` typo.                                                |
| [385](https://github.com/cocos/cocos4/pull/385) | Imported GPU max RenderTexture size, with the legacy resize fallback and permissive unknown-GPU deserialization validation.                                                                                                                                          |
| [322](https://github.com/cocos/cocos4/pull/322) | Imported Worker/WorkerPool logic and contracts; provided an AIR-owned browser adapter, tests, and default/public feature wiring. No private or retired engine-pal package is used.                                                                                   |
| [389](https://github.com/cocos/cocos4/pull/389) | Imported actual GL BUFFER_SIZE accounting, allocation retry and bounded UI/instance growth. AIR retains strict byte-range errors, typed-array/DataView subviews, iOS partial updates and UBO range/cache semantics. Zero-size resizes also update the GL allocation. |
| [394](https://github.com/cocos/cocos4/pull/394) | Imported emission-direction alignment in local/world simulation spaces and both particle renderer rotation paths. AIR's on-demand trail initialization remains intact.                                                                                               |
| [306](https://github.com/cocos/cocos4/pull/306) | Imported generic UIMesh, public data/segment types, accessor capacity queries and the `wasm` facade. UIMesh rejects nonfinite/fractional counts and releases producer references while retaining borrowed asset ownership.                                           |

The remaining 18 commits contain no TypeScript changes in this comparison. Native C++ fixes, native build/CI changes, Creator inspector/plugin packaging, engine version bumps, mini-game/native/Node Worker backends, and the retired PAL package upgrade are outside AIR's Web runtime boundary. The Web equivalents of all 15 TypeScript commits are accounted for above; these exclusions do not imply those other platforms are supported.

## Public use and compatibility

- `UIMesh`, `UIMeshData`, and `UIMeshSegment` are exported through the existing 2D entry. Vertices are node-local; the component owns upload/batching, not producer arrays, textures, or borrowed materials. It supports single-color 24-byte and two-color 28-byte vertices.
- `WorkerPool`, `createWorker`, worker capability helpers/types, and `wasm` are available from the main entry. Function tasks must be self-contained. Blob workers require browser Worker/Blob support and compatible CSP. A failed worker falls back only when a function/fallback was supplied; a script path without fallback rejects. Script workers must implement the documented request/reply protocol when used with a pool. Terminate workers/pools explicitly.
- `checkWorkerScript()` cannot synchronously prove fetch, MIME, CSP, or loading success. Browser construction and asynchronous worker errors remain authoritative. Mini-game/native capacity claims do not apply to AIR.
- `wasm` forwards the already shipped Web PAL functions. Relative URLs resolve against the emitted engine module; absolute URLs still require normal fetch/CORS/CSP permission. This does not add or enable another physics/Spine WASM backend.
- `screen.maxDevicePixelRatio` accepts finite numbers at least 1 and defaults to 2. Configure it before `createAirApp()`. Explicit `pixelRatioCap` takes precedence and retains AIR's finite-positive contract. Bootstrap first-frame sizing and the PAL use the same effective cap.
- The main feature set includes worker and wasm APIs. A custom build omitting the `air` feature may select their separate feature units; the always-on `cocos/misc/index.ts` does not force worker dependencies into unrelated custom builds.

## Provenance

Modified extracted files retain their copyright headers and existing mapping reasons. New files absent from the frozen baseline use explicit `sourceOrigin` repository/revision/path metadata in `upstream-file-map.json`, rather than pretending they were in that snapshot. Worker Web implementation is AIR-owned MIT code. The existing frozen `vendor/pal-source` tree is unchanged; `tools/build/pal-source.cjs --check` verifies reproducible generated PAL bytes.

## Validation

Validation is recorded against the final candidate below. Focused CPU/browser tests are not a full example campaign, native-platform certification, hardware performance claim, or release approval. Generated SDK outputs used for validation are not a new published release.

- Development and minified default-feature ESM builds, declaration build and published-artifact checks pass. The initial minified build did not finish; an isolated retry with a 3072 MiB Node heap completed.
- Source typecheck, reproducible frozen PAL check, Web-only dependency gate and the complete pinned-upstream file-map gate pass (1429 rows, 316 intentional modifications).
- 35 Jest suites pass 441 tests, including retained PR15 buffer and PR17 mipmap contracts. Two minified Worker bootstrap VM cases and 56 tooling regressions pass.
- An installed npm tarball passes all four TypeScript configurations: 4.9.5 node/node16 and 5.9.3 node16/bundler. There are 701 matching runtime/declaration exports and 36 negative type cases per configuration, including UIMesh, Worker and DPR additions. The package now includes Worker docs and the already-linked Box3D integration page.
- Chromium and WebKit each pass the development and minified runtime: real mouse/touch UI, UIMesh pixels/persistence/transforms/opacity, Graphics growth/reuse, long bold label pixels, Button events, GL buffer allocation and subview readback, narrow >2048 RenderTexture, Worker transfers/queue/fallback/termination and wasm execution. All four final attempts bind 1017 compiler-mapped sources before and after, with zero page errors and browser child closure code 0. These are focused probes, not complete browser or resource-leak certification.
- The full formatting gate remains red on five byte-identical base Box3D example files. Scoped formatting for changed/new files passes. These example files and their evidence fingerprints were not rewritten.
- The unchanged CI-contract unit test expects push/PR triggers but the base workflow is manual/call-only. No triggers were re-enabled. GitHub checks must be inspected separately on the published commit.
- The global license gate retains existing history/Spark blockers: retired PAL redistribution authorization and Spark WASM transitive dependencies. This integration adds no retired PAL bytes and does not alter Spark or mark those decisions accepted.

This publication contains source, tests and this result summary. Raw execution logs, browser reports, source-binding receipts and screenshots are retained locally and are not included in the PR. No raw report was edited to turn a failure into a pass. Generated SDK bundles also remain local validation outputs, not a new release.

## Reproduce the focused checks

Run from the repository root with the lockfile dependencies installed. The commands below generate local build and test outputs; they do not publish a release. `COCOS_UPSTREAM` must point to a separate official `cocos/cocos4` checkout at `fffd9a514a83f93034e288c0b99308826f65c573`. `MODERN_TSC` must point to the installed TypeScript 5.9.3 `bin/tsc`; the repository compiler is 4.9.5.

```sh
npm run typecheck
node tools/build/pal-source.cjs --check
npm run verify:web-only
COCOS_UPSTREAM="$COCOS_UPSTREAM" npm run verify:file-map
npm run build
NODE_OPTIONS=--max-old-space-size=3072 npm run build:min
npm run build:dts
node tools/build/prepare-package.cjs
node tools/verify/published-artifacts.cjs
node tools/verify/consumer-acceptance.cjs --modern-ts="$MODERN_TSC"
node --test tools/verify/worker-web-adapter.test.cjs
node --test tools/verify/ci-scope.test.cjs tools/verify/upstream-sdk-contracts.test.cjs
```

The 35 Jest suites are enumerated here so the reported subset can be reproduced independently of full Jest discovery:

```sh
npx jest --runInBand --runTestsByPath \
  test/smoke/upstream-emission-input.test.ts \
  test/smoke/upstream-skinning-rebind.test.ts \
  test/smoke/upstream-ui-font.test.ts \
  test/smoke/upstream-buffer-resize.test.ts \
  test/smoke/worker-timeout-recheck.test.ts \
  test/smoke/upstream-particle-alignment.test.ts \
  test/smoke/webgl2-gfx-buffer-contracts.test.ts \
  test/smoke/worker-lifecycle.test.ts \
  test/smoke/upstream-startup-dpr.test.ts \
  test/smoke/worker-web.test.ts \
  test/smoke/upstream-render-texture-limits.test.ts \
  test/smoke/worker-air-adapter.test.ts \
  test/smoke/worker-degradation.test.ts \
  test/smoke/worker-bootstrap-source.test.ts \
  test/smoke/upstream-skinning-instance-lifecycle.test.ts \
  test/smoke/texture2d-explicit-mipmaps.test.ts \
  test/smoke/smoke-example-evidence-integration.test.ts \
  test/smoke/audio-cancellation.test.ts \
  test/smoke/smoke-example-specialized-probes.test.ts \
  test/smoke/webgl2-gfx-command-contracts.test.ts \
  test/smoke/smoke-14-gltf-ktx2.test.ts \
  test/smoke/audio-readiness.test.ts \
  test/smoke/webgl2-state-audit.test.ts \
  test/smoke/hdr-post-process.test.ts \
  test/smoke/dynamic-atlas-ownership.test.ts \
  test/smoke/air-html-source.test.ts \
  test/smoke/effect-json-contract.test.ts \
  test/smoke/point-shapes.test.ts \
  test/smoke/dynamic-mesh-renderer-sync.test.ts \
  test/smoke/smoke-01-bootstrap.test.ts \
  test/smoke/shader-driver-diagnostics.test.ts \
  test/smoke/audio-cancellation-harness.test.ts \
  test/smoke/instance-batch-data.test.ts \
  test/smoke/smoke-03-runtime-asset.test.ts \
  test/smoke/smoke-02-scene.test.ts
```

For browser reproduction, install Playwright 1.62.1 with matching Chromium/WebKit binaries in your tooling setup and make its module resolvable (for example, through `NODE_PATH`). Use the existing `AIR_EVIDENCE_BROWSER_EXECUTABLE` override if required by that setup. On software-only Chromium hosts, set `AIR_CI_SOFTWARE_GL=1`. Run sequentially with exclusive browser/GPU use and a fresh output directory per attempt:

```sh
node tools/verify/cocos4-ts-update-browser.cjs --browser=chromium --out=output/cocos4-chromium-dev
node tools/verify/cocos4-ts-update-browser.cjs --browser=chromium --min --out=output/cocos4-chromium-min
node tools/verify/cocos4-ts-update-browser.cjs --browser=webkit --out=output/cocos4-webkit-dev
node tools/verify/cocos4-ts-update-browser.cjs --browser=webkit --min --out=output/cocos4-webkit-min
```

To inspect the separately disclosed baseline failures, run `npm run format:check`, `node --test tools/verify/upstream-ci-contract.test.cjs`, and `npm run verify:licenses`. These were not reported as passing.
