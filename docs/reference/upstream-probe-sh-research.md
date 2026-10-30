# U08-C: probe capture and spherical-harmonic research

Decision: **BLOCKED** for T33. The independent CPU reference and native storage regressions execute without a GPU. The standalone serial/atlas WebGL2 fixture now has an executable three-browser collector but has **not** been run in the current environment. Neither passing CPU tests nor source availability is a light-probe baker, browser acceptance, performance result, or stable API addition. Runtime defaults and package exports remain unchanged.

## Actual source/data path

The source anchors and SHA-256s for the inspected checkout are emitted by `tools/verify/upstream-probe-research.cjs`:

1. [`Vertex`](../../src/cocos/gi/light-probe/delaunay.ts) serializes position, normal and `Vec3[] coefficients`. [`LightProbesData`](../../src/cocos/gi/light-probe/light-probe.ts) owns probe vertices and tetrahedra, initializes nine coefficient slots and barycentrically interpolates them. This is not a cubemap/mipmap asset.
2. [`LightProbeInfo.data`](../../src/cocos/scene-graph/scene-globals.ts) stores that data in scene globals and forwards it to the render-scene resource. Bake-finished notifications and data consumers do not establish a runtime capture/baking producer.
3. [`Model.updateSHUBOs`](../../src/cocos/render-scene/scene/model.ts) interpolates at the model bound center, applies ringing reduction, then calls `SH.updateUBOData`. [`CCSH`](../../src/cocos/rendering/define.ts) is seven vec4s, 28 floats/112 bytes, not nine vec4s.
4. [`SH`](../../src/cocos/gi/light-probe/sh.ts) separately implements uniform-sphere projection, cosine convolution, ringing reduction and UBO packing. The source search finds no production caller of `SH.project`/`SH.convolveCosine` in the retained `src/cocos`/`src/air` tree. This does not establish the behavior of an external Creator baker.
5. The generated [`SHEvaluate`](../../src/air/builtin/builtin-glsl4.ts) uses the packed polynomial. Its non-instanced branch includes quadratic terms; the instanced branch uses interpolated linear/constant terms. HDR exposure multiplication is a later shader step. CPU tests below exercise the non-instanced coefficient/UBO contract, not final shader compilation or all material variants.
6. [`ReflectionProbe.captureCubemap`](../../src/cocos/render-scene/scene/reflection-probe.ts) allocates six render textures and requests rendering. The examined [`ReflectionProbeFlow`](../../src/cocos/rendering/reflection-probe/reflection-probe-flow.ts) loops the faces serially, but its cube-capture route is under `EDITOR`; planar rendering is a different route. Do not describe this as an enabled Web light-probe baker or remove the guard to claim support.
7. [`TextureCube`](../../src/cocos/asset/assets/texture-cube.ts) contains six-face mip images. Ordinary/AUTO mipmaps, baked GGX reflection convolution, and diffuse SH are different operations. [`validateAirPrefilteredEnvironment`](../../src/air/rendering/color-contract.ts) validates a caller-attested offline GGX asset and its encoding; it neither computes SH nor renders probes, and it does not certify filtering quality.

## Frozen mathematical and orientation contract

The reference uses right-handed world directions, linear RGB **radiance**, exposure 1, no tone mapping or color encoding, and no cosine convolution on input. sRGB/RGBE inputs must be decoded exactly once before projection. Negative values are permitted for mathematical basis tests; the browser fixture radiance is nonnegative.

There are nine orthonormal real basis functions through l=2, with index `l²+l+m`, ordered:

- `Y00 = sqrt(1/(4π))`
- `Y1,-1 = sqrt(3/(4π)) y`, `Y10 = sqrt(3/(4π)) z`, `Y11 = sqrt(3/(4π)) x`
- `Y2,-2 = sqrt(15/(4π)) xy`, `Y2,-1 = sqrt(15/(4π)) yz`
- `Y20 = 3 sqrt(5/(16π)) (z²−1/3)`
- `Y21 = sqrt(15/(4π)) zx`, `Y22 = sqrt(15/(16π)) (x²−y²)`

The real-basis convention has positive x/y first-order terms. Integrate coefficients as `c_i = Σ L(ω_j) Y_i(ω_j) Ω_j`. For texel bounds `[u0,u1] × [v0,v1]`, the exact area is `A(u1,v1)−A(u0,v1)−A(u1,v0)+A(u0,v0)`, where `A(u,v)=atan2(uv,sqrt(1+u²+v²))`. Areas sum to 4π, but sampling radiance and basis at texel centers is still finite quadrature, not exact continuous integration. A deliberate N=1 higher-order counterexample is tested.

The reference's `webgl-cube` convention is `[+X,-X,+Y,-Y,+Z,-Z]`. At texel coordinates `u=2(x+0.5)/N−1`, `v=2(y+0.5)/N−1`, rows are **bottom-to-top `readPixels` storage**, not top-to-bottom image files. The normalized direction vectors are:

| Face | Direction before normalization |
| ---- | ------------------------------ |
| +X   | `(1,−v,−u)`                    |
| −X   | `(−1,−v,u)`                    |
| +Y   | `(u,1,v)`                      |
| −Y   | `(u,−1,−v)`                    |
| +Z   | `(u,−v,1)`                     |
| −Z   | `(−u,−v,−1)`                   |

Cocos texture upload indices `right,left,top,bottom,front,back = 0…5` become `TEXTURE_CUBE_MAP_POSITIVE_X + layer` in [`WebGL2 commands`](../../src/cocos/gfx/webgl2/webgl2-commands.ts). However, the reflection camera's Euler table and local forward −Z give center rays `+X,−X,+Y,−Y,−Z,+Z`, not that upload order's final two world axes. The separate `cocos-camera` helper records the exact pre-projection camera rays and is checked against native quaternion math and the actual source table. It does **not** assert the final rendered image transform: backend projection Y flips, readback/image row origin and upload paths must be calibrated with asymmetric, axis-labelled images in an actual engine capture. Do not silently swap front/back or apply an unverified flip.

## Explicit storage conversion

Canonical radiance coefficients convolve to canonical irradiance with band factors `A0=π`, `A1=2π/3`, `A2=π/4`. A constant radiance L therefore has radiance `c0=L sqrt(4π)`, irradiance `c0=π L sqrt(4π)`, and diffuse irradiance/π evaluates to L.

Cocos `basisOverPI` uses rounded decimal polynomial factors. `toCocosCoefficients` explicitly maps canonical radiance to values consumed by `SH.updateUBOData`:

`stored_i = radiance_i × A_l × exactBasisFactor_i / (π × cocosBasisOverPI_i)`.

This conversion compensates the rounded consumer basis; it does not reproduce a hypothetical external baker's rounding history or invent its asset metadata. Do not convolve its output a second time. `fromCocosCoefficients` is the inverse for this declared convention. The UBO adapter packs `[x,y,z,constant]` for each RGB channel, then `[xy,yz,z²,zx]` per channel, then the RGB `(x²−y²)` coefficient and padding. The constant subtracts one third of the z² coefficient. With ringing λ=0 and before exposure, native `SH.shaderEvaluate` agrees with canonical irradiance/π within the frozen absolute tolerance 1e−5. Existing external data whose convolution, world frame or normalization is unknown must not be passed through this converter by guesswork.

## Runnable CPU checks

From the repository root, with the existing installed dependencies:

```sh
node --test tools/verify/upstream-probe-sh-reference.test.cjs tools/verify/upstream-experiment-browser.test.cjs
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/smoke/upstream-probe-sh-storage.test.ts
node tools/verify/upstream-probe-research.cjs
```

The first command covers 4π area sums across resolutions, constant HDR RGB/DC and higher-order zeros, all nine basis Gram-matrix entries, a directional linear/quadratic environment under an arbitrary proper rotation, Cocos storage round-trip, finite-resolution counterexample and invalid input rejection. The second checks the actual native SH basis/convolution/packing/evaluation and source-bound camera orientations. These do not initialize a real browser/device. The final command emits read-only source fingerprints and numerical observations to stdout; it deliberately retains decision BLOCKED even when its CPU checks succeed. Preserve the output and logs under `output/upstream-update/m3-experiments/` without overwriting prior failed attempts.

## Prepared serial/atlas fixture and limits

Serve the repository with an authorized local static HTTP server and open [`upstream-probe-capture.html`](../../test/fixtures/upstream-probe-capture/upstream-probe-capture.html) in the intended real browser only after the environment blocker is resolved. No server or browser is started by the CPU tools. Click **Run reference capture**, then save the raw report. The window property `upstreamProbeCaptureReport` exposes the same data to the executable collector described below.

- Both paths render the same continuous analytic radiance at four distinct probe IDs, six faces at N=32, into linear RGBA32F, no depth/MSAA/mipmaps, alpha 1, no premultiplication or color transforms. This is deliberately a synthetic submission/readback test, not a Cocos scene traversal test.
- Serial uses 24 framebuffer/draw submissions. Atlas uses a 6-by-4 tile target and one instanced draw with bounded per-tile quads. No whole-screen oversized triangle crosses tile boundaries. Both allocate the same color-texel byte count; they differ in framebuffer/driver overhead which is not claimed measurable here.
- Both configurations remain resident to avoid allocation churn inside the measurement. One warmup per path precedes six alternating-order pairs. The raw report retains every pair, CPU submission, GPU query when non-disjoint, readback/repack, CPU SH and total capture-through-SH times. GPU query retrieval delay is outside the total. The first pair retains full raw face arrays. All pixels and SH coefficients are checked against independently sampled CPU radiance; invalid/non-finite readback fails rather than being converted into success.
- CPU scene traversal is explicitly null because this fixture has no scene graph. The allocation ledger is not observed peak/incremental driver VRAM. Missing GPU timers are recorded as blockers, never replaced with CPU time. The fixture always retains **BLOCKED** for T33, even if its limited reference checks execute successfully.
- Offscreen readPixels is not compositor-presentation evidence. Resource deletion calls are not physical browser-close proof. A successful standalone test would still not establish shipped Cocos support, mobile-GPU performance, or the upstream reported speedup.

## Executable capture and evidence boundaries

The shared U08 collector executes this existing fixture, rather than substituting its CPU reference for GPU capture:

```sh
node tools/verify/upstream-experiment-browser.cjs --browser=chromium --out=output/upstream-update/m3-experiments/new-chromium
```

Repeat with explicit `--browser=firefox` and `--browser=webkit`, each with a new directory, after the environment is authorized and ready. The invocation also runs the nine depth configurations described in [the depth protocol](upstream-depth-experiments.md#executable-browser-collection-protocol); there is no hidden subset that can be called a complete collection. It uses the shared example server and established browser launcher, a fresh page/context for this fixture, clicks its actual Run button, and waits for the real terminal report. Neither a CPU report writer nor the CLI's `--help`/`--record-not-run` path initializes a browser.

The retained probe artifacts include actual float readbacks from **every** warmup and paired capture as hash-bound binary files, the fixture report with its full first-pair face arrays, exact intercepted shader strings, actual framebuffer allocation observations, WebGL identity, all available query events, response bodies, page errors, resource deletion inventory and a diagnostic-page screenshot. The collector independently verifies the fixed linear-radiance/orientation inputs, each of the four probes' nine RGB SH coefficients, alpha and all first-pair raw face values against the reference. Missing, duplicate, reordered, nonfinite, flipped or out-of-bounds results fail, rather than being dropped.

The time fields have specific limits:

- `gpuMs` may be non-null only when a real timer query was observed available and non-disjoint. Its value must equal the intercepted query's nanoseconds divided by one million. Missing/disjoint/timeout observations remain explicit nulls/blockers; CPU elapsed time is never a substitute. The complete warmup/pair list remains intact.
- `cpuSHMs` measures JavaScript SH projection of the actual readbacks. It is **not GPU SH convolution**. No convolution shader or engine light-probe baker is introduced by this tool.
- Raw readback interception copies buffers inside the fixture's measured readback interval. Therefore CPU readback and total-capture timings include collection overhead and are marked instrumented; they are not uninstrumented performance comparisons or upstream-speedup evidence. GPU query values describe the fixture's synthetic render submissions, not full scene traversal/baking performance.
- Scene traversal and actual driver VRAM remain null. The equal texture allocation ledger is not peak/incremental physical memory. Mobile and production engine serial/atlas performance remain **BLOCKED**, including when a desktop software WebGL renderer completes all diagnostic checks.

The collector fingerprints source/build/fixtures/compiler/dependencies before and after, verifies served bytes against those inputs, and records bounded physical browser-close evidence. GL deletion calls, a child close event and a screenshot are kept distinct from driver memory reclamation, the canonical descendant-reaping protocol and compositor acceptance. A successful limited diagnostic collection leaves `acceptanceConclusion: BLOCKED`; it does not alter T33 or the frozen manifest. See the depth protocol for exact artifacts, unsupported-option rejection rules, no-launch blocked receipts and output retention.

## Required engine experiment and unblock conditions

The inherited environment preflight is `output/upstream-update/browser-preflight/same-exec-launch.log`: Chromium aborts with process-singleton `socket() failed: Operation not permitted` and crashpad database setup errors. This task did not retry the denied/unavailable browser action or switch to the user's machine.

To complete T33, obtain an authorized execution environment that permits browser processes/IPC and writable profile/crashpad storage, with matching browser binaries/dependencies. Confirm an actual GPU/backend, complete float targets and reliable nondisjoint GPU timing; record actual GPU/driver and distinguish software adapters. Then:

1. Freeze candidate source/build/tool/dependency hashes, browser version, backend and actual target/depth formats. Run the standalone fixture, preserve final shaders and raw observations, and calibrate actual Cocos camera/readback/upload orientation using labelled asymmetric axis images.
2. Implement an opt-in research adapter around the existing Cocos scene/camera/render-target APIs. No default changes, reflection/GGX relabelling or full-baker claim. Capture an identical fixed scene and probe positions serially and through atlas submission; keep dimensions, lighting, exposure, SH projection, work count and quality equivalent.
3. Measure real CPU scene traversal separately from submission, actual GPU work, total bake/readback/SH time, and incremental/peak GPU memory with an identified measurement method. Record allocations separately from physical driver VRAM; if the required measurement is unavailable, retain BLOCKED rather than presenting an estimate as measured evidence.
4. Preserve each warmup and paired run, final render state, raw linear faces, axis/rotation validation, all nine RGB SH coefficients, independent error bounds and resource cleanup. Repeat the acceptance manifest's Chromium/Firefox/WebKit WebGL2 dimensions; genuine device claims need genuine device runs. Invalid timer/disjoint cases are explicit failures/blockers, not dropped outliers.
5. Retain physical-close evidence and check current candidate identity before any conclusion. Only then select `ADOPT_EXPERIMENTAL`, `RETAIN_CURRENT`, `NOT_APPLICABLE_WITH_EVIDENCE`, or `BLOCKED` with sources, inputs and boundaries. No speedup target is inferred from an upstream report.
