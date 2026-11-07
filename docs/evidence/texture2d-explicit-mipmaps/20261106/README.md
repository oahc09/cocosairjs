# Explicit mip chain regression: focused evidence

Base: `652db1557821453c86baf2c9e3a56a01426124a9`.

- The unmodified source fails five of nine new CPU cases. The same cases with the patch plus adjacent WebGL2 texture contracts pass 48/48.
- The unchanged baseline browser bundle fails four of ten Chromium GPU cases: configuring LINEAR before buffer, DOM, packed ImageAsset, or partial-chain upload overwrites the supplied lower levels with red base data. Configuring it afterward preserves the supplied colors.
- A candidate with exactly the source predicate change applied to that baseline bundle passes 10/10 on Chromium and 10/10 on WebKit. Each level reads every actual GPU pixel with an exact RGBA8 comparison. Explicit levels retain red/green/blue; a single base image still generates red levels.
- `candidate-receipt.json` records the exact substitution and baseline/candidate/source hashes. This is an isolated diagnostic candidate, **not a fresh full runtime build**, and no generated SDK files are changed by this patch. The later fresh-build validation below supersedes this diagnostic candidate for the patched source; the initial evidence remains unchanged.
- The raw browser reports and original CPU stdout are retained. Each browser close was acknowledged and its root process exited with code 0 within 59 ms. Full descendant ECHILD was not measured. These are focused non-canonical probes, not full release, compositor, browser-matrix or lifecycle certification.
- The checked-in collector is a portable version of the focused probe; these initial raw browser reports were collected with its local predecessor. The portable collector was subsequently run against the fresh full build as described below.

## Fresh full-build validation

A subsequent default-feature ESM build from the patched source completed successfully with `NODE_OPTIONS=--max-old-space-size=4096 AIR_OUT_DIR=<isolated-output> npm run build` (49.2 seconds in ccbuild). This was a complete default-feature compile, not a string-patched bundle. Generated runtime files are kept outside this source-only PR.

- Runtime SHA-256: `b6361611cea83fc764b921f150987c91041296858dceb643c0d32ebc1cd60fc8`.
- Compiler source-binding receipt SHA-256: `7f0acca2afdabdb79d13b5099e5f610722f56de235c8d2c55898797541af9a4e`.
- All 1009 mapped source files matched before and after each browser run, along with runtime/map hashes. The final collector rejects an unbound diagnostic bundle before launching a browser.
- Chromium 141.0.7390.37 and WebKit 26.5 each passed all ten cases with zero page errors. Raw results are in `fresh-chromium/report.json` and `fresh-webkit/report.json`.
- Both browser roots exited with code 0 within the original four-second close budget (151 ms and 71 ms). Full descendant ECHILD remains unmeasured; these results are still focused non-canonical GPU evidence, not full-engine release or hardware certification.
- Minified runtime/declarations, full Jest, full upstream-byte gate and broader browser/lifecycle matrices were not run for this patch. No published SDK files or default feature flags are changed.

Commands for the final source:

```sh
npx jest --runInBand --runTestsByPath test/smoke/texture2d-explicit-mipmaps.test.ts test/smoke/webgl2-gfx-texture-contracts.test.ts
node tools/verify/texture2d-explicit-mipmaps.cjs --browser=chromium --bundle=<fresh-runtime.js> --out=<new-attempt-directory>
node tools/verify/texture2d-explicit-mipmaps.cjs --browser=webkit --bundle=<fresh-runtime.js> --out=<another-new-attempt-directory>
```

The whole upstream byte gate requires the pinned upstream checkout, unavailable in this workspace. The mapping entry and modified count were checked locally; this is not a claim that `verify:file-map` passed.
