# U08-A/B: depth diagnostics and transparency applicability

Decision: **BLOCKED** for T30, T31 and the required T32 depth-texture experiment. This is research tooling, not a runtime feature. The default engine projection, depth state, shadows, package exports and public APIs are unchanged. All browser/GPU runs remain **INFRA_BLOCKED** in the task environment. Passing CPU/source tests is not a browser PASS. An executable, opt-in collector now drives the existing real fixtures; its implementation and CPU tests do not imply that a browser run occurred.

Related: [probe/SH research](upstream-probe-sh-research.md), [U03 final-sampler audit](upstream-color-depth-contract.md), [U04 state isolation](upstream-state-isolation.md), frozen `ai/ledgers/upstream-update/acceptance-manifest.json` T30–T33. Neither the manifest nor the shared ledger is rewritten by these tools.

## Traced conventions

`node tools/verify/upstream-experiments.cjs --out=<new-report.json>` emits exact source paths, line anchors, SHA-256s and source-only diagnostics for the current checkout. It never builds, starts a server/browser, publishes evidence or updates the acceptance manifest.

- `Camera.update` calls `Mat4.perspective`/`Mat4.ortho` using the device's clip-space minimum, then recomputes inverse projection/view-projection matrices. World/view coordinates are right handed; view forward is −Z. Normal perspective maps the near plane to minimum clip Z and the far plane to 1. WebGL2 inherits minimum −1; WebGPU uses 0. The depth buffer is [0,1]. The CPU tests exercise **actual** perspective and orthographic functions against independent endpoint/matrix expectations for both clip conventions.
- Camera clear depth initializes and resets to 1. The default `DepthStencilState` and tested built-in opaque-unlit pass use LESS with depth writes. Ordinary `AirRenderTarget` and `RenderTexture` default to depth/stencil, not float depth. An explicit experimental option never changes those defaults.
- WebGL2 maps GFX `DEPTH` to `DEPTH_COMPONENT32F`, and `DEPTH_STENCIL` to `DEPTH24_STENCIL8`, allocating texture storage through `texStorage2D`. A swapchain's logical format is inferred from reported depth/stencil bits and does not establish physical float storage. WebGPU maps GFX `DEPTH` to `depth24plus`, and `DEPTH_STENCIL` to `depth24plus-stencil8`; these names do not promise float32 storage.
- `RenderWindow` gives ordinary offscreen depth textures sampled usage. `AirRenderTarget` accepts WebGL2, explicit color formats, and only `none`/`depth24-stencil8`; its borrowed `depthTexture` view uses nearest filtering. `bindDepth` validates an active scalar sampler2D, preserves the previous material binding, rebinds on resize and detaches during disposal. MSAA resolves are a separate existing path, not silently included in this experiment.
- Shadow flow is different: it renders sampled shadow depth into an R32F **color** target when available, or packed RGBA8 color, with a separate depth/stencil attachment. Its projection, bias, clear, packing and comparisons are not automatically reversed by changing a scene depth function. `shadow-map.chunk` includes normal-depth NDC remapping, perspective/orthographic reconstruction and bias helpers; `coordinates.chunk` maps negative view Z into linear depth. U03 tests already audit final standard shadow/spot samplers and helper arguments as highp.
- Water's current native depth-texture consumer reconstructs through inverse view-projection after `depth * 2 − 1`, including its oblique projection. It is not an OIT pass. The new native fixture uses an ordinary perspective inverse expression, not the water oblique formula; no unverified claim is made about reversing water, shadows, transmission or arbitrary custom shaders.

## Why this is not OIT

The default startup selects the legacy pipeline. `ForwardStage.initInfo` declares an opaque front-to-back queue and a transparent back-to-front queue; insertion classifies transparency from the first blend target's blend flag. `transparentCompareFn` orders by model priority, pass/submodel hash, then descending depth, then shader ID. Thus it is **priority-constrained sorted alpha blending**, not a universal pure distance sort and not order-independent transparency. The pass is recorded after opaque/additive/planar queues.

A bounded source scan of `src/cocos/rendering` and `src/air/rendering` covers 110 TypeScript files in this checkout and finds no OIT, weighted-blended, depth-peeling or revealage implementation markers. This negative search is supporting evidence; the positive startup/queue/draw trace establishes the actual default algorithm. It is not proof about arbitrary externally supplied custom render pipelines.

**NOT_APPLICABLE_WITH_EVIDENCE**, narrowly: copying the plan's BabylonJS OIT-specific change into a nonexistent default OIT pipeline. No new OIT renderer is introduced just to apply it. The actual native depth precision experiment remains required and **BLOCKED**; the narrow non-applicability does not erase T32, its frozen browser dimensions, or shader precision testing. Ordinary alpha blending is intentionally order dependent. Existing U04 tests retain explicit source-over order expectations rather than asserting arbitrary layer permutations produce equal pixels. Float/half-float OIT targets, depth peeling, weighted accumulation and MSAA OIT matrices are unsupported here, not feature passes.

## Independent depth math

`test/fixtures/upstream-depth-experiments/model.mjs` has no engine imports. For positive view distance z, near n and finite far f:

- Normal depth: `f (z−n) / [z (f−n)]`; inverse: `nf / [f−d(f−n)]`.
- Reverse depth: `n (f−z) / [z (f−n)]`; inverse: `nf / [n+d(f−n)]`.
- Projection is computed from desired near/far NDC endpoints, rather than toggling a comparison alone. Isolated reverse mode changes projection, clear 1→0, LESS→GREATER, and reconstruction together. A negative CPU control proves compare-only reversal either rejects all fragments with clear 1 or chooses the far surface with clear 0 and a normal projection.
- Fixed16/fixed24 models round to the corresponding normalized grid; float32 uses IEEE binary32 rounding. These are **storage-only** models. They do not simulate GPU vertex arithmetic, raster interpolation or the [−1,1] clip-to-window conversion. In particular, WebGL2's clip-space cancellation may erase an ideal float Reverse-Z advantage. No WebGPU/mobile speed or precision benefit is inferred from them.
- Near/far pairs are (0.1,1000), (1,100000), (10,10000000). Each has near, geometric-middle and far distances, each tested with a 1% separated plane and a close plane at relative separation 2^-20, in both draw orders. The reference supports clip ranges −1 and 0 for mathematical checks, but the browser diagnostic only implements actual WebGL2.

`validateExperiment` rejects unknown options, unknown formats, WebGPU, MSAA, shadows and unsupported native Reverse-Z/float-depth choices. It cannot silently fall back or make a partial switch look supported.

## Executable browser collection protocol

`tools/verify/upstream-experiment-browser.cjs` is a browser collector, unlike the source-only `upstream-experiments.cjs` report writer. After the browser restriction is resolved and the authorized candidate bundle is freshly built, run each required browser into a distinct **new** directory:

```sh
node tools/verify/upstream-experiment-browser.cjs --browser=chromium --out=output/upstream-update/m3-experiments/new-chromium
node tools/verify/upstream-experiment-browser.cjs --browser=firefox --out=output/upstream-update/m3-experiments/new-firefox
node tools/verify/upstream-experiment-browser.cjs --browser=webkit --out=output/upstream-update/m3-experiments/new-webkit
```

Each invocation uses the existing `browser-engines.cjs` launcher options and the shared read-only `competitive-example-server.cjs`. The shared server serves `.mjs` with JavaScript MIME and transforms the native fixture's `effect-layout.js` import from TypeScript in memory. It now rejects denied `listen` operations rather than raising an unhandled server error. The collector does not build, deploy, retry a failed launch, accept remote URLs, switch executables after failure, or publish/update any manifest or ledger. Existing attempt directories are rejected atomically; all failure artifacts remain in that attempt.

The frozen local plan consists of eight explicit isolated normal/reverse × depth16/depth24/depth32f/depth24-stencil8 runs, one native normal-Z D24S8 run, and one standalone probe serial/atlas run. Each gets a fresh browser context and page. It invokes the depth fixtures' existing `run` hooks and the probe fixture's actual Run button. No default engine state or fixture implementation is replaced by a collector-owned simulation.

Before the valid native run, the collector calls the actual native fixture with reverse depth, float depth, WebGPU, MSAA and reversed-shadow requests. Only an exact expected rejection with **no new GL contexts or objects** earns `NOT_APPLICABLE_WITH_EVIDENCE`, narrowly for that current unsupported option. A generic error, browser failure, unimplemented collector branch or source assertion cannot earn this result. The isolated Reverse-Z runs remain required; the native rejection does not waive T31, T32, an actual WebGPU implementation/device run, or an MSAA experiment.

A new attempt retains:

- Before/after source, fixture, tool, manifest, lockfile and SDK hashes; actual installed Playwright, Playwright-core and esbuild package bytes; compiler and selected browser executable hashes; browser version and exact launcher options. Drift fails collection. Source-to-build provenance still requires the separately frozen build receipt; an SDK hash alone does not certify a fresh build.
- Browser-received response bodies and hashes, including HTML and all required module dependencies. The transformed helper is compared against the same pinned in-memory compiler transformation and its original TypeScript hash. No requested resource can silently come from a remote origin.
- An init-script trace of actual `shaderSource` strings, immutable allocations, framebuffer checks, WebGL errors and resource create/delete calls. Submitted source fields in the fixture report must match the intercepted calls. Final shader files are retained separately with hashes.
- Every typed-array `readPixels` destination as exact raw binary bytes, format/type/dimensions, view length, destination offset, native byte order and a hash. This includes all probe warmups and paired runs, not only the fixture report's first raw pair. An unhandled PBO destination is explicit failure, not fabricated capture.
- Real WebGL vendor/renderer/version/context information, with driver revision left unknown when unavailable, unmodified fixture reports, independent depth/probe validation, console/network errors and a screenshot per attempted page. The screenshot shows diagnostic UI after offscreen work, not a compositor-equivalence or default-scene image proof.
- Exact created/deleted/outstanding GL object inventories after fixture cleanup. Outstanding objects fail the focused collector rather than being called released. Physical browser close is separate: one pre-close boundary and one original four-second close budget await both launcher close and the child `close` event. Raw exit code/signal are retained; forced cleanup never changes failure to PASS. This is not the full campaign's descendant-reaping/ECHILD shutdown proof.

`PASS` and exit 0 mean only that this selected-browser diagnostic collection and its limited validation completed. `acceptanceConclusion` remains **BLOCKED** for U08. Missing mobile transport, real-device observations, full-scene/shadow compatibility, uninstrumented GPU performance and measured driver VRAM stay **BLOCKED**. No evidence row is copied into canonical acceptance.

For recording an already verified restriction **without** loading Playwright, listening or launching, use a new output directory and `--record-not-run="<verified blocker>"`. This preserves all ten rows as `NOT_RUN`, sets collection status `INFRA_BLOCKED`, and exits nonzero. `--help` is also side-effect-free. Neither mode is a browser attempt or a capability rejection result.

## Runnable controlled experiments

Only run browser work after the verified environment restriction is resolved. No browser, server, deployment or user-computer retry was attempted in this task.

1. Serve the repository through the normal authorized development server. Open `test/fixtures/upstream-depth-experiments/index.html`. This standalone diagnostic needs no SDK bundle. Choose one explicit mode and format, then click **Run isolated diagnostic** and **Save raw report**. Collect all eight normal/reverse × depth16/depth24/depth32f/depth24-stencil8 configurations in fresh output attempts for each required browser. Incomplete framebuffer/allocation or unsupported choices fail explicitly rather than downgrading a format.
2. After M4 has rebuilt the current candidate, open `test/fixtures/upstream-experiments-transparency/index.html`. This uses actual `createAirApp` → native Camera/MeshRenderer → `AirRenderTarget` depth attachment → `bindDepth` → production highp sampler template → independent output target. Click **Run native depth experiment once**, save the report, then use a fresh page for any retry. A source build from before M2 changes is not current evidence. The existing read-only development fixture server must transpile `tools/debug/effect-layout.ts` for its `.js` module URL, as other toolkit fixtures already require.
3. Validate each retained raw report with `node tools/verify/upstream-experiments-observations.cjs <report.json>`. Its PASS means only complete diagnostic row integrity and the declared mathematical comparisons. It always leaves the overall acceptance conclusion **BLOCKED**: row validation alone cannot satisfy default-scene, shadow, full-device or performance contracts.

Both fixtures capture the exact strings supplied to `shaderSource`, requested format and actual framebuffer depth/stencil bit sizes/component type, renderer/vendor/version information where exposed, and all raw outputs. WebGL2 cannot query a texture's native internal format with desktop `getTexLevelParameter`; the standalone report records the successful immutable-storage sized-format argument plus actual attachment observations. The native report adds the backend texture's chosen internal format. Driver revision remains explicitly unknown when the API does not expose it, not guessed from the renderer string.

The isolated diagnostic renders each plane separately and in both orders, records color winners, samples depth through a highp raw sampler and reconstructs distance in the shader. Float bits are packed into RGBA8 with explicit highp integer precision, no blending/dithering and a distinct output framebuffer, then decoded independently. Fixed-grid ties legitimately preserve the first draw under strict LESS/GREATER and are retained as measured precision loss, not deleted. Reconstruction errors are recorded; no new error threshold is invented after running a GPU.

The native fixture keeps engine normal-Z and D24S8, uses nine plane/range cases, captures exact sampled/reconstructed float bits and tests manual comparisons at ±2^-18 with a 2^-17 bias. It changes the depth texture producer/consumer while retaining native binding and rendering paths, not a fabricated color-depth upload. It has no animation, physics updates or business callbacks; controlled zero-time rendering is not a claim that arbitrary application warmup is side-effect-free. A native page is used once because engine close does not promise same-page recreation. No full OIT or native Reverse-Z implementation is claimed.

For provenance, retain before/after source, fixture, compiler, dependency, SDK and manifest hashes; verify served bytes match them. Save actual browser/version/GPU/driver/backend, final shaders, raw observations, page/GL errors, screenshots and physical browser-close evidence in fresh attempt directories. The provided interactive download alone is not an automated campaign collector, compositor proof, served-byte proof or process-close proof; the automated collector above retains these focused artifacts when executed in an authorized environment, but does not satisfy the complete canonical campaign. Do not promote either a download or a focused collector PASS into canonical acceptance.

## CPU checks and evidence

```sh
node --test tools/verify/upstream-depth-experiments.test.cjs tools/verify/upstream-experiments-observations.test.cjs tools/verify/upstream-experiment-browser.test.cjs
NODE_OPTIONS=--max-old-space-size=2048 node node_modules/jest/bin/jest.js --runInBand test/smoke/upstream-experiments-contract.test.ts
node tools/verify/upstream-experiments.cjs --out=output/upstream-update/m3-experiments/<new-source-report>.json
```

The Jest tests compare actual engine math/default state and the actual sorted comparator, and exercise the native effect through real ProgramLib/WebGL2 source lowering with a recording GL stub. They do not claim real driver compilation or pixels. Node validator tests use explicitly synthetic unit-test records; those are never persisted or represented as real observations. Missing/duplicate rows, modified projection/clear/format, blank pixels, malformed comparisons and degraded sampler/int precision fail closed. Collector CPU tests additionally cover the fixed ten-run inventory, atomic fresh output, exact rejection classification, full probe raw-face validation, shader/query binding, readback byte preservation, cleanup accounting, bounded close, mocked server MIME/listen denial, and a no-browser/no-socket blocked receipt. These mock/synthetic records are unit-test inputs only, not persisted browser evidence.

Raw attempts remain under `output/upstream-update/m3-experiments`. The initial compare-only negative-control test chose a nearly symmetric depth value, then was corrected to an off-center distance rather than relaxing its threshold. The initial Jest load failed because esbuild's typed-array invariant does not hold across jsdom realms; the fixture loader now uses a bounded TypeScript syntax transform. Initial source-anchor string mismatches were corrected against actual source text. These failed attempts are retained, not overwritten. Formatting must precede final source fingerprints and reruns.

## ADR and remaining acceptance

- **RETAIN_CURRENT**: retain default normal-Z, sorted alpha blending and native render-target restrictions. Current CPU/source evidence supports these contracts; it does not establish unchanged browser images.
- **NOT_APPLICABLE_WITH_EVIDENCE**: only the OIT-specific patch on the absent default OIT pipeline, not the whole U08-B task.
- **BLOCKED**: required T30 browser comparison; T31 actual normal/reverse depth/format/device observations and any native integration; T32 native depth-sampling runs; and all real mobile/WebGPU outcomes. No unsupported combination is counted as feature support.

The inherited browser evidence is `output/upstream-update/browser-preflight/same-exec-launch.log`: Chromium's process-singleton socket creation was denied and launch aborted. The coordinator separately verified failed supported elevation and inaccessible isolated localhost/file routes from cloud CDP. A usable authorized browser environment, matching browser dependencies, fresh M4 native bundle, frozen/served fingerprints and real device transports are required to unblock. Shadow, oblique-depth, scene reconstruction and custom-shader compatibility need separate native integration tests before adopting any engine-wide reverse-depth setting. Do not deploy, bypass access restrictions, or switch to the user's PC to manufacture evidence.
