# Empty-scene HDR post regression

This asset-free fixture creates only a solid-color camera, with skybox disabled and no models. It installs draw diagnostics before scene startup and creates native `createAirPostProcess` before the first stepped frame. The ordinary step clock advances exactly three frames. No shader stripping, replacement materials, dummy model, or warm-up draw is allowed in the passing path.

Each draw retains active uniform blocks, indexed buffer bindings, and its immediately observed GL error. Readback errors and the final GL error are also retained. A zero final error cannot erase an earlier failed draw. The float source must match `[128/255, 64/255, 32/255, 1]` within half-float tolerance. Output must match independently calculated ACES followed by sRGB encoding, within two bytes per channel. Exactly three post draws, zero preceding draws, and no unbound active blocks are required.

Run from the repository root with a fresh output directory:

    node tools/verify/hdr-empty-post.cjs --browser=chromium --out=output/hdr-empty-post/chromium-attempt1
    node tools/verify/hdr-empty-post.cjs --browser=webkit --out=output/hdr-empty-post/webkit-attempt1

The shared browser launcher selects installed tooling. Use `--playwright=/absolute/path/to/playwright` and `AIR_EVIDENCE_BROWSER_EXECUTABLE` to explicitly select already-installed tooling when needed. `--bundle=<path>` permits testing an archived SDK; the original unused-CCLocal build must fail, not be relabeled as passing. Preserve every raw attempt.

The report fingerprints the SDK, collector and fixture, checks they did not change during collection, retains console errors/responses, and captures a compositor screenshot. This is focused subset evidence, not full release acceptance. Shutdown records acknowledged `browser.close()` only; it does not establish OS ECHILD or the full campaign physical-close contract.

## Recorded focused results

On 2026-11-06, the same unchanged strict collector and fixture produced:

- Old SDK `1aa82350919d17a2dbe21b1e6ac3f4ecfa50b3672c4e658840583f128b672244`: Chromium 141.0.7390.37 and WebKit 26.0 each **9/18 checks pass, 9 intended failures**. All three first draws return GL1282 with `CCLocal` binding 4 unbound. Source is `[0.501953125,0.2509765625,0.12548828125,1]`; output is `[0,0,0,255]`.
- New SDK `bae6449d30642cdc7d5d2bdeb8c7ecb54e1e0783ecb82b8f6b8cd8f319738b41`: both browsers **18/18 pass**, with no page/console errors or HTTP failures. The source is unchanged, output is `[206,165,115,255]` on all three frames, and every observed GL error is zero. `Constants` binding 11 is bound; unused camera/local blocks are absent. The source-binding manifest matches `screen-effect.ts` SHA-256 `a8debfa1296164f70f1f6063d1d96513bc3bd0bad9ebb4b3bfd9b781c8c54681`.
- Existing, unchanged `hdr-skybox` collector rerun against the new SDK: Chromium **22/22 pass**, WebKit **22/22 pass**, GL error zero and no page/console errors or HTTP failures. Stock skybox HDR source remains `[3.99609375,1.998046875,0.9990234375,1]`; the linear mesh control remains `[4,2,1,1]`. This does not replace or alter the earlier skybox verification record.

Raw attempts and screenshots are retained under `output/hdr-empty-post/old-chromium-attempt1/`, `old-webkit-attempt1/`, `new-chromium-attempt1/`, `new-webkit-attempt1/`, `skybox-chromium-attempt1/` and `skybox-webkit-attempt1/`. `verification.json` contains portable relative paths, report/screenshot hashes, source bindings, retained observations and checks. Raw output directories are local evidence and are not promised to be present in a source-only checkout.

The prior runtime-only shader-stripping experiment is diagnostic evidence under `output/hdr-empty-diagnostic/`, not part of this regression or its passing path. No failure was cleared or assertion relaxed. All results remain focused subset evidence with the shutdown limitations described above.

### Collector hardening and final rerun

The final collector gates the manifest's SDK and source-map hashes. For the default current SDK path, the recorded `screen-effect.ts` source hash must also match current source. Only an explicitly selected different archive path permits a historical source mismatch, recorded as `explicit-archived-bundle`; manifest integrity is still mandatory. Missing manifests and failed bindings cannot pass.

Timeout retains the original single 120-second budget and forcibly records `completed:false` and `passed:false`, including when browser close hangs after successful assertions. Browser/server close exceptions also persist failed status and a nonzero exit. Mocked failure-path tests verified six cases: browser-close exception, browser-close hang/timeout, server-close exception, mismatched SDK hash, mismatched map hash, and mismatched current-source hash. These are collector unit diagnostics, not additional browser acceptance runs.

After hardening, fresh `old-chromium-attempt2` and `old-webkit-attempt2` again produce 9/18 with the same nine expected failures; `new-chromium-attempt2` and `new-webkit-attempt2` pass 18/18 with unchanged pixels and zero GL errors. These four attempts supersede the first four empty-post attempts for current-collector claims; all prior raw reports remain intact. The two unchanged skybox attempts remain independent 22/22 evidence. The summary records each attempt's original collector hash instead of implying the latest collector produced historical runs.

### Reproduce collector failure-path unit diagnostics

From the repository root, with the current SDK, source map and binding manifest present:

    node test/fixtures/hdr-empty-post/collector-check.cjs

An optional second argument selects a new report path. The default creates a timestamped report under `output/hdr-empty-post/`; existing reports are never overwritten. The script executes the actual collector in a Node VM with mocked browser, server, timer and report writes, retaining real SDK/source reads. It launches no browser. The six cases and assertions are the same as the original output-local diagnostic script. The formatted portable script was run successfully with output `output/hdr-empty-post/collector-check-portable-attempt1.json`; this is independent unit evidence and does not replace any raw browser report.
