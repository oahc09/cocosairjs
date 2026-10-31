# Gradient material: real WebKit validation

2026-10-30. These are real WebGL 2 render/readPixels tests, not source inspection or CPU substitutes. Playwright 1.62.1 drove official WebKit 26.5 / revision 2336 WPE in the existing execution environment. Browser defaults were retained: no sandbox-disabling flags or security-setting changes. A same-origin, exact-path route whitelist fulfilled local bytes; all unmatched requests were aborted. No additional server or external network was used.

## Focused collector

From the repository root, with Playwright and its browser installed:

```sh
node tools/verify/gradient-effect-browser.cjs --browser webkit \
  --runtime build/npm/cocosair.module.js --out tmp/gradient-normal
node tools/verify/gradient-effect-browser.cjs --browser webkit \
  --runtime build/npm/cocosair.module.min.js --out tmp/gradient-min
```

`--executable /path/to/wpe-wrapper` supports an existing official WPE setup with local shared libraries. `PLAYWRIGHT_MODULE` can identify an already-installed Playwright module. Chromium is also selectable, but is **not** certified by these WebKit results. The collector consumes public exports from the indicated runtime; it does not adapt or inject the new effect implementation. The example's TypeScript is transpiled, while its HTML, import map, scene setup and DOM handlers remain unchanged.

## Assertions

34 rendered checks cover local-Y sample coordinates; scale, offset, smoothness 0/2/20; extrapolation above one; translation and rotation stability; alpha property and endpoint-color alpha blending; native hemisphere and directional lighting (front/away/disabled, up/down/side normals); optional historical squared response; optional explicit sRGB encoding; XZ-plane local-Y invariance; independent effect/material instances and destroy/recreate; and five blue/black reference samples. The example separately checks five interactions, including actual select control and keyboard-driven range controls. The final collector pauses native pacing with public `createStepClock.begin()`, advances exactly one frame per observation with `step(1/60)`, retains AFTER_DRAW frame receipts, and restores native pacing with `end()` before screenshots/close. Readbacks are not counted as API executions. The earlier module-integration stage used native EVENT_AFTER_DRAW synchronization and is retained only as preliminary evidence.

The reference uses an XY quad with local Y -0.5..0.5, blue top, black bottom, offset .5, scale 1, smoothness 1, white native hemisphere, and `AIR_GRADIENT_BABYLON_RESPONSE=true`. Five pixel-center local Y values produce blue bytes **3, 23, 63, 124, 205**, exactly matching `round(255 * (localY + .5)^2)`.

`AIR_GRADIENT_SRGB_OUTPUT=false` means raw shader RGB written to the default WebGL framebuffer; no implicit display encoding is assumed in the numeric comparison. A separate explicit encoding check maps linear .25 to byte 137. The browser context is opaque (`alpha=false`), so output framebuffer alpha is 255; alpha behavior is verified by RGB blending against the known background, not by misinterpreting framebuffer alpha.

## Final fresh-bundle results

All four freshly built/published variants passed the same public-API collector in WebKit 26.5. Each had **34/34 fixture assertions + 5/5 actual example interactions**, zero console/page errors, 35 fixture frame receipts and 5 example frame receipts, and native pacing restored in both pages. This totals 156 successful assertions across four independently loaded bundles, **not** 156 distinct API claims.

| Runtime | Fixture | Example | SHA-256 |
| --- | --- | --- | --- |
| `build/cocosair.module.js` | 34/34 | 5/5 | `284c7458c36e33f295c8761374aea0ad233af095bc6853a225b6c83b7e31beb1` |
| `build/cocosair.module.min.js` | 34/34 | 5/5 | `224495d4532843574eff06d1d05efb819d399701be026e501f42dcfa5d234d71` |
| `build/npm/cocosair.module.js` | 34/34 | 5/5 | `96b7eb1c92a9260a9027670c03eb036ce7cf0276b5250d310060091bd5b64f41` |
| `build/npm/cocosair.module.min.js` | 34/34 | 5/5 | `23128e898e71671395d8eacad4e22c85460af445e1da628db0f3662fae3e32a2` |

See `normal-result.json`, `min-result.json`, `npm-normal-result.json`, and `npm-min-result.json` for raw numeric observations, per-resource hashes, frame receipts, browser version, collector hash and effect-source hash. The fresh effect-source SHA is `2129ec570b17e3b9f572dd5fd4f07885d0118ddf5eccd56646f7777413810433`.

`reference-gradient.png` and `example-interaction.png` are actual fresh-normal browser compositor screenshots, visually inspected after capture; they are separate from readPixels evidence. The example screenshot shows the end of the native interaction sequence (unlit, offset 1), while the reference screenshot retains the historical blue-to-black squared gradient.

## Earlier module-integration stage and recovered bug

Earlier local module-integration checks (34/34 fixture, 5/5 example) used the new helper plus the pinned existing main `ed10a370` min runtime, with explicit type-erasure/import adaptation. Their raw logs remain local and are **not** represented as rebuilt SDK evidence; only the final public-API collector results establish fresh-bundle acceptance.

`manual-before-fix.json` preserves the initial real example failure: reference midpoint was blue 17 instead of 64. The example initially changed only the active pipeline's HDR flag; scene activation did not retain the intended LDR setup. Setting `scene.globals.skybox.useHDR=false` before configuring the ambient values fixed the actual page. The revised example renders 64 in historical mode and 128 in unlit mode, with all five interactions passing.

## Scope limits

This is offline browser integration evidence, not production HTTP deployment, physical mobile-device coverage, hardware-GPU performance certification, or full Gallery certification. It does not certify unsupported skinning/morphing/instancing, shadows, fog, extra lights, WebGL 1, or WebGPU.
