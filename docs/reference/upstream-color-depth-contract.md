# U03 color mathematics and depth-sampler audit

Scope: AIR-UPSTREAM-20261022, acceptance cases T10–T12. This work adds independent references, focused regressions and a runnable GPU probe. It does not change the default tone mapper, texture decoding, material alpha, sampler qualifiers or upstream engine/PAL files.

## Selected operator and source chain

The actual Cocos default is already an ACES-style **scalar fit**, not the matrix-based three.js ACES fitted operator. The production chain is:

1. Frozen MIT source at `vendor/builtin-source/editor/assets/chunks/common/color/{aces,tone-mapping,gamma}.chunk`, with `common/common-define.chunk` defining `TONE_MAPPING_ACES = 0`.
2. `tools/build/builtin-assets.cjs` generates `src/air/builtin/builtin-effects.ts` and `builtin-glsl4.ts`. Do not hand-edit generated source.
3. `registerBuiltinAirAssets()` in `src/air/builtin/register.ts` lowers layouts into ESSL 3.00 and registers the actual effects.
4. `ProgramLib.getGFXShader()` adds selected macros; `WebGL2Shader.initialize()` supplies backend stages; `WebGL2CmdFuncCreateShader()` prepends `#version 300 es` and calls `gl.shaderSource`.

The new source tests exercise steps 3–4 and record the exact final submitted strings using a GL recording stub. This is stronger than inspecting a template, but **not driver compilation, rendering or GPU evidence**. The opt-in browser probe records real driver submissions separately.

`ToneMappingType.DEFAULT` and a new scene's `postSettings.toneMappingType` are 0. For non-debug built-in forward/unlit output, with HDR enabled and float/RGBE output disabled, each already-linear, already-exposed RGB component uses:

- x = min(input, 8).
- mapped = (2.51 x² + 0.03 x) / (2.43 x² + 0.59 x + 0.14).
- output = sqrt(mapped).
- Input and output color matrices are identity. No hidden 1/0.6 exposure scale exists here. Alpha is unchanged.

`LINEAR = 1` bypasses the scalar fit but still takes the output square root. Disabling HDR likewise bypasses the fit. Float-output paths retain linear values; RGBE is a different encoding. The standard surface shader additionally considers transparency, forward/deferred and debug-view branches. The reference is not a claim that every pass uses one universal transform.

Exposure is not multiplied again in `CCFragOutput`. The standard lighting path uses `cc_exposure.w * cc_exposure.x`: camera exposure is `0.833333 / 2^EV100`, EV100 = log2(aperture² / shutterSeconds × 100 / ISO), and standard exposure is 1/38400. Default F16, 1/125 s, ISO100 yields a ratio of 0.9999996 because of the existing decimal constant. Unlit `colorScale` is already-linear input and does not receive lighting exposure. The GPU fixture uses that property rather than authored `mainColor` RGB conversion to supply exact controlled inputs.

The three.js denominator `v * (0.983729 * v + 0.4329510) + 0.238081`, its input/output matrices and its exposure scale belong to a different operator. They are deliberately not substituted into Cocos or used as its oracle.

## Independent numerical reference

`test/fixtures/upstream-color-contract/reference.cjs` is test-only binary64 arithmetic. It imports no engine, shader or production math function. `vectors.json` fixes black, 18% gray, white, HDR gray 2/4/8, values above the cap, saturated red/green/blue, mixed channels and tiny positives, including fractional alpha. Golden values were evaluated with 60-digit decimal polynomial arithmetic and square roots, separately from the JavaScript reference.

The tests compare those frozen goldens with the binary64 reference and a separately written, explicitly rounded float32 arithmetic path. The latter is a CPU numerical model, not shader execution. The frozen manifest bounds remain `1e-5` absolute for the controlled float calculation and `2/255` per channel for RGBA8 flat pixels. Float/half-float targets, edges, MSAA, BRDF differences and compositor output are not silently assigned this same error model. Pixel encoding is checked after RGBA8 storage clamps; the fit can slightly exceed 1 at its cap.

## Decode and alpha contracts

`validateAirTextureColorContract` is a pure, explicit preflight. It does not inspect texture bytes, select material macros or change rendering.

- Existing built-in `SRGBToLinear` is gamma-square; `LinearToSRGB` is square root. The names do not make these exact IEC sRGB functions.
- Hardware SRGB8_ALPHA8 decoding is the piecewise IEC sRGB transform on RGB. At encoded 0.5 it gives about 0.21404114, whereas gamma-square gives 0.25. These paths must not be claimed numerically interchangeable.
- Color in a linear GPU format may declare one shader decode. An sRGB GPU format already decodes RGB and must not add a second shader decode.
- Normal, roughness, metallic, occlusion and raw depth are linear data and must use no sRGB decode.
- Alpha remains linear under either decode. Premultiply only after decoding RGB for a controlled linear source-over calculation. Straight RGB uses SRC_ALPHA / ONE_MINUS_SRC_ALPHA; premultiplied RGB uses ONE / ONE_MINUS_SRC_ALPHA, with alpha factors ONE / ONE_MINUS_SRC_ALPHA in the controlled probe.

Those blend equations describe the custom linear probe, not a retroactive promise that all built-in techniques blend in linear space or share its alpha factors. The existing native alpha-blend technique and encoded render targets remain unchanged.

## Depth precision

Native standard shadow samplers `cc_shadowMap` and `cc_spotShadowMap`, plus shadow helper sampler parameters, retain explicit highp through the final submission chain. The opt-in raw-depth template likewise retains `uniform highp sampler2D sceneDepth` and manual `step(referenceDepth - bias, storedDepth)`. No blanket precision change is justified by this audit.

`precision highp float` does not establish sampler precision. `upstream-depth-source-audit.cjs` reads sampler declarations and their applicable sampler defaults. Negative controls remove or degrade the depth sampler qualifier while leaving float highp unchanged, and must fail. The audit rejects template-only source lacking the final WebGL version prefix.

The independent depth model and GPU probe use raw normalized depth24, conventional WebGL [0,1] depth and manual comparisons at 0.125, 0.5 and 0.875 with ±2^-20 offsets and 2^-19 bias. This resolution is intentional: a coarse 0.01 comparison cannot expose mediump-scale loss. The GPU probe allocates a real DEPTH_COMPONENT24 texture, disables compare mode and uses the production depth template. `sampler2DShadow` / hardware comparison remains explicitly unsupported by the current effect/backend contract. This is not Reverse-Z or PCF acceptance.

## Running and evidence boundaries

CPU/source regressions, without launching a browser:

```bash
NODE_OPTIONS=--max-old-space-size=3072 node node_modules/jest/bin/jest.js --runInBand \
  test/smoke/upstream-color-contract.test.ts \
  test/smoke/upstream-depth-precision.test.ts \
  test/smoke/upstream-color-evidence.test.ts
NODE_OPTIONS=--max-old-space-size=3072 node node_modules/typescript/bin/tsc \
  --noEmit
```

To retain CPU-intercepted final GLSL, set `UPSTREAM_COLOR_SOURCE_OUT` to a fresh attempt directory before running Jest. The files are content-addressed and must not be represented as GPU captures.

After a fresh main bundle and in an environment authorized and able to start real browsers:

```bash
node tools/verify/upstream-color-gpu.cjs --browser=chromium --out=output/upstream-color/chromium-01
node tools/verify/upstream-color-gpu.cjs --browser=firefox --out=output/upstream-color/firefox-01
node tools/verify/upstream-color-gpu.cjs --browser=webkit --out=output/upstream-color/webkit-01
```

The fixture is `/test/fixtures/upstream-color-contract/`; its control is `window.__upstreamColorProbe.run()`. `--url=<fixture-url>` can use an already authorized server instead of starting the read-only local server. `--out` accepts a new directory or a new JSON path with a new sibling artifact directory and refuses overwrite. `--help` does not launch or listen.

The collector validates 24 native color rows, three texture-decoding rows, two blend rows and nine depth-comparison rows against the independent reference. It preserves raw pixel arrays, actual submitted GLSL, real renderer/version, source/bundle/contract hashes, served bundle/probe/vector byte checks, page/browser logs, a diagnostic screenshot, browser child exit/signal/close status and collector exit code. Missing rows, wrong macros, stale fingerprints, GL errors, invalid pixels or degraded sampler precision fail closed. Each browser is a separate fresh attempt. A diagnostic screenshot is **not** compositor proof; the collector is not the full campaign shutdown supervisor or a canonical evidence publisher.

Current task environment: browser execution is **INFRA_BLOCKED**, based on the coordinator's retained browser-preflight evidence (denied shell socket setup, failed elevated setup and isolated cloud CDP). No new browser, socket bypass or deployment was attempted for this slice. CPU/source PASS does not mark T10, T11 or T12 browser dimensions PASS. Real Chromium/Firefox/WebKit, mobile GPU and driver evidence must be collected on the frozen candidate in a suitable authorized environment.

The only legacy assertion repair is the conditional GLSL uniform in `port-gap-effect-layout.test.ts`: the actual fail-closed diagnostic is `DECLARATION_UNSUPPORTED`, not the reflection-level `UNSUPPORTED`. Conditional reflected resources and array members still expect `UNSUPPORTED`; production validation is not weakened.
