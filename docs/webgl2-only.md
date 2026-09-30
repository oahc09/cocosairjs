# Browser rendering requires WebGL 2

Owner decision: 2026-09-30. Cocos AIR's target environments formally drop WebGL 1 support.

The default runtime uses WebGL 2. An absent WebGL 2 implementation, a rejected context,
or failed device initialization rejects `createAirApp()` with error code `WEBGL2_REQUIRED`.
It must never silently substitute the non-rendering `EmptyDevice`. Explicit `renderMode: 3`
(`HEADLESS`) remains available for engine tests.

`gfx-webgl` is no longer a declared or default feature, and `WebGLDevice` is no longer
exported or registered. The `src/cocos/gfx/webgl/` source and retired export-module path
are retained for upstream extraction provenance; their presence does not establish support.
The `gfx.API.WEBGL` enum is retained as part of the original GFX vocabulary.

Builtin shader registration generates the supported `glsl3` source from upstream `glsl4`;
the WebGL 1 shader-lowering work is retired. W01 context-loss, W03 capture and G4 shader
positive probes now run on WebGL 2. Historical dual-backend results are historical only.

Regression commands (configured Playwright environment required):

```bash
npm run build:all
node tools/verify/webgl2-only.cjs
node tools/verify/context-loss.cjs
node tools/verify/capture.cjs
node tools/verify/shader-probe.cjs
```

The WebGL 2-only probe verifies both the development and minified npm bundles, actual
visible rendering, constructor absence while WebGL 1 is available, context-creation failure,
and HEADLESS. Evidence: `docs/evidence/webgl2-only.json`.

The 2026-09-30 focused verification passed all eight startup/rendering cases, W01
context-loss handling, both W03 DPR modes, fourteen G4 shader checks, and the installed
tarball browser consumer. The default minified development bundle is 3,595,641 bytes,
91,220 bytes smaller than the preceding dual-backend bundle (3,686,861 bytes).
W01/W03 accept `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using an existing Chromium
installation outside Playwright's default browser cache revision.

Changing the runtime invalidates old bundle-bound Gallery, API coverage and browser-matrix
evidence. Those release gates must be recollected for the new candidate; this policy and a
focused passing probe do not by themselves establish full release readiness.
