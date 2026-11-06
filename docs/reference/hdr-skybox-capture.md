# Skybox in camera-scoped linear HDR capture

`createAirPostProcess(camera)` owns a linear RGBA16F source target. Native skybox samples must reach this source after environment intensity/exposure, but before display tone mapping, sRGB encoding, or RGBE output packing. The post-process output applies the selected display transform once.

The stock skybox returns a color directly rather than calling `CCFragOutput`. Previously, the camera-scoped output adapter covered standard/unlit helpers and surface shaders, but left this direct skybox output converted to display color. A constant RGBE environment representing approximately `[3.997053, 1.998527, 0.999263]` consequently reached the HDR target as approximately `[0.986816, 0.956543, 0.896484]` instead. A custom linear native skybox and an independent `[4, 2, 1]` mesh established that exposure and the render target were not the cause.

The adapter now returns the skybox's exposure-scaled linear color when `CC_AIR_LINEAR_HDR` is active. Ordinary cameras retain the prior RGBE/output and tone-mapping paths. The bridge supports GLSL3 and GLSL4, is idempotent, and upgrades a shader that already contains an older helper bridge. It matches the stock skybox radiance expression rather than arbitrary RGBE effects. No frozen vendor shader or global pipeline macro is changed. The HDR-only skybox variant also uses high-precision float and sampler defaults. A WebKit control demonstrated that the original mediump/default-sampler combination introduced about 0.51% RGBE radiance error even after bypassing display conversion; raising float precision alone was insufficient. Ordinary-camera precision remains unchanged.

## Focused reproduction

Build the runtime normally, then run:

```
npm test -- --runInBand test/smoke/hdr-post-process.test.ts test/smoke/effect-json-contract.test.ts
node tools/verify/hdr-skybox.cjs --out=output/hdr-skybox-attempt
```

The browser runner accepts `--bundle=<candidate.js>` to compare a previously built runtime. Use a new output directory for each attempt. It creates a six-face constant RGBE cube in memory; no reference-site assets or network resources are needed. The source pixel expectation includes RGBE and half-float quantization, not a weakened display-color tolerance. It also checks a separate ordinary camera, post-process enable/disable and disposal, and a direct linear mesh control.

These are focused rendering regressions. They do not certify the complete browser matrix, all examples, performance, or the water reconstruction's visual fidelity. Generated runtime bundles and example campaign evidence are not part of this source patch; build and test the candidate in the selected environment.

## Empty-scene fullscreen startup

The same HDR integration exposed a separate first-frame issue in `createAirScreenEffect`. Its clip-space vertex shader declared unused camera and model-local uniform blocks. Both Chromium and WebKit retained `CCLocal` as active, so a fullscreen post draw before any model draw failed with an unbound local UBO and left the output black. Later model draws could mask the issue.

Fullscreen effects now omit those unused declarations and builtin metadata. Their material Constants and sampler bindings are unchanged. The asset-free `hdr-empty-post` fixture creates no model or skybox, retains every draw's GL error, and validates the first three source/output readbacks. The original SDK fails nine of eighteen checks in each browser; the corrected SDK passes eighteen of eighteen, without shader stripping, dummy draws, error clearing or relaxed tolerances. The skybox fixture also remains twenty-two of twenty-two in both browsers. See its portable verification summary for fingerprints and the acknowledged-close limitation.
