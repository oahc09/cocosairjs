# Native skybox linear-HDR regression

This fixture is asset-free. All six cubefaces contain the same generated Cocos RGBE texel `[244,122,61,143]`, whose linear decoded RGB is `[3.9970531503,1.9985265752,0.9992632876]`. A separate native mesh shader outputs exactly `[4,2,1]` without using the skybox. No reference-site assets, downloaded textures, third-party application code, or browser security exceptions are involved.

## Run

From the repository root, with the existing browser dependencies and a built SDK:

```sh
node tools/verify/hdr-skybox.cjs --out=output/hdr-skybox/new-attempt --bundle=build/cocosair.module.js --browser=chromium
```

`--out` must be a new directory. `--browser=webkit` selects WebKit. The runner uses the existing `browser-engines.cjs`, `loopback-browser-env.cjs` and `static-file-response.cjs` helpers. `AIR_EVIDENCE_BROWSER_EXECUTABLE` explicitly selects an installed browser; `AIR_CI_SOFTWARE_GL=1` enables the existing Chromium software-GL policy. Optional `--playwright=<module-path>` selects an already installed compatible Playwright package. The local server and browser are launched by the same Node process.

The runner writes raw JSON and eight compositor screenshots, then exits nonzero if any assertion fails. It does not install dependencies, rebuild the SDK, mutate source, update canonical evidence or change CI.

## Assertions

There are 22 assertions across these phases:

1. Ordinary camera before any HDR post-process handle.
2. Stock skybox captured into `createAirPostProcess.source`.
3. Ordinary camera rendered after the HDR camera, rather than before it.
4. Post-process disabled, then re-enabled.
5. Independent linear native mesh, with skybox disabled only for the HDR camera.
6. Stock skybox restored after the mesh control.
7. Post-process disposed and the camera target restored.

Skybox HDR capture must match decoded RGB within absolute `0.006` per channel; this allows the known RGBA16F rounding, not tone mapping. Independent mesh capture must retain `[4,2,1]` with the same bound. The unmarked ordinary camera must retain the native ACES-plus-square-root output within `0.004`, even when camera render order or post-process activation changes. Alpha, target restoration, disposal, WebGL error state, HTTP responses, console/page errors and unchanged test inputs are also recorded or checked.

`skyIllum * camera.exposure` is explicitly 1. The camera exposure is recorded, not assumed. The ordinary camera's target is RGBA32F solely for numeric inspection; it is not marked as a linear-HDR camera. Its expected output remains display-referred.

## Recorded focused results

Runner SHA-256: `ff1e47dac528da9bae17e3316201e628bcfd17dfacde90701b084a681ca90e69`.

- Old SDK `7dbca75c807a3ddd6b941dd3712ec0c53391902201614e51ad8d27a41d76fbad`, Chromium 141.0.7390.37: 18/22 pass, four intended failures. Stock skybox HDR source is `[0.98681640625,0.95654296875,0.896484375]`, already tone-mapped and gamma-encoded. Independent mesh source is `[4,2,1]`.
- Patched SDK `dedadf88b888e9f78f490d9b0b33735a3d55d219e17ae6786e1b434c7631c991`, Chromium 141.0.7390.37: 22/22 pass. Skybox source is `[3.99609375,1.998046875,0.9990234375]`; ordinary camera remains `[0.98659694,0.95643604,0.89646047]`; mesh source remains `[4,2,1]`.
- Same patched SDK, WebKit 26.5: 18/22 pass, four strict precision failures retained. Skybox source is `[3.9765625,1.98828125,0.994140625]`, outside `0.006`. Do not label this WebKit run PASS. The old SDK with an application-owned diagnostic material that only removes display conversion, retaining the original precision, gives the identical RGB. Thus this precision boundary predates the linear-output patch. Ordinary-camera isolation, mesh control and lifecycle assertions pass.
- Final SDK `1aa82350919d17a2dbe21b1e6ac3f4ecfa50b3672c4e658840583f128b672244`, adding precision promotion only for the stock skybox's `CC_AIR_LINEAR_HDR` variant: **22/22 pass on Chromium 141.0.7390.37 and 22/22 pass on WebKit 26.5**. Both source readbacks are `[3.99609375,1.998046875,0.9990234375]`. The fixture and runner hashes are unchanged from the old and intermediate attempts. No tolerance was relaxed.

Raw reports are in `output/hdr-skybox/old-sdk-chromium-final2/`, `patched-sdk-chromium-final/`, `patched-sdk-webkit-final/` and `old-webkit-precision-diagnostic/`. Earlier attempts are retained, including a runner startup failure that assumed optional source-map `sourcesContent` existed; the final runner uses the compiler's `.sources.json` binding manifest instead. It records the exact bundle/map hashes and whether the patched source matches the bundle's binding.

The ordinary skybox float/sampler precision behavior was not modified. Precision diagnostics do not weaken the regression assertion or turn the strict WebKit failure into a pass.

The old-SDK WebKit diagnostic that changes only the default float precision to highp still reads `[3.97265625,1.986328125,0.9931640625]`. Declaring highp float **and** highp samplerCube/sampler2D defaults in the application-owned diagnostic material restores `[3.99609375,1.998046875,0.9990234375]`. The latter raw report is in `output/hdr-skybox/old-webkit-sampler-precision-diagnostic/`. This isolates the pre-existing sampling/float precision boundary; it is not an engine change and must not be credited to the linear-output fix.

The final precision-scoped build is a subsequent change, with source binding SHA-256 `328639f66afffe423f53f9eab9c51115113db62b92ce2921b83ff52f5e7c67c1`. Its raw reports and screenshots are in `output/hdr-skybox/precision-patched-chromium-final/` and `precision-patched-webkit-final/`. `precision-patch-comparison.json` verifies **exact equality** of ordinary-camera RGBA against the intermediate build in all eight phases, separately for each browser. Final source bindings, bundle/map fingerprints, unchanged test inputs and WebGL error 0 all pass. Ordinary-camera output therefore remains unchanged by the precision promotion.

These are focused local runs, not a complete browser matrix or release campaign. Browser close was acknowledged. OS `ECHILD` / the canonical campaign physical-shutdown protocol was not measured and is not claimed.
