# AI First rendering iteration v1.3: W0 verification

This is a W0 preparation slice, not G0-E approval, a rendering API change, or
12 accepted scenes. The fixed baseline is
`9ea3ea951b5b452f2809864ce76b7fca71f37fd6`. The worktree started clean.
The SDK baseline at that exact revision built and passed the two-bundle package
marker check. Twelve selected existing Jest suites passed 92 tests (HDR,
screen-pass, multipass, attachments, depth, colors, rendering queue and glTF
transmission). These are targeted source tests, not hardware HDR evidence.

## Verify input

Use the v1.3 implementation ZIP supplied separately. Reference images and
assets are not published by this tool. It never extracts the archive or
executes a packaged script.

```sh
python3 tools/verify/rendering-iteration/intake.py --pack <v1.3-zip> --out <new-receipt.json>
(cd tools/verify/rendering-iteration && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v)
```

The actual ZIP (`a4afe721a849ca2dcad3986057ce8edd10aa7d800f654c9e7e87acd1e4173bce`)
matched 97 file identities and the R00–R17, AF00–AF07 and E01–E12 inventories.
There were 12 guides and 10 PNG candidates. E01 is pending art review, E09 is
a procedural draft, E02–E08 and E10 are blockouts in the ZIP, and E11/E12
have no per-scene image or asset directory in this package. Alternate concept art
must be pinned individually before target-specific tuning. No input becomes a
frozen target from a filename, color probe or successful hash verification.

## E12 independent static CPU reference

```sh
g++ -O3 -std=c++20 -Wall -Wextra -Werror \
  tools/verify/rendering-iteration/cornell-reference.cpp -o /tmp/e12-cornell
/tmp/e12-cornell <new-output-dir>
python3 tools/verify/rendering-iteration/audit_cornell.py <output-dir> --out <new-audit.json>
```

The finite-depth diffuse path tracer uses a fixed open-front Cornell box,
rectangular area light, neutral sphere and box, cosine-weighted continuation
and an explicit light visibility test. Linear RGB32F PFM files are the numeric
reference, not the clipped sRGB PPM previews. Same seed produces nested
1/16/64/256-spp checkpoints, plus a direct-only control with the same primary
samples. The independent auditor checks finite nonnegative radiance, decreasing
nested-checkpoint error and red/green bleed into two neutral back-wall regions.
It rejects the direct-only image substituted as the full result. These checks
do not constitute an independent noise estimate, temporal reference, art
approval, or proof of AIR global illumination.

Two attempts on the same compiler/host produced identical audited PFM hashes.
RMS to nested 256 spp was 0.22723, 0.04518, and 0.02173 respectively.
The 256-spp linear reference SHA-256 was
`b737feee4e4e0aec765fec599e2f9323389c7f43677d74bacbc0820311fb29fe`.
The left neutral patch gained 0.09144 red versus 0.04159 green; the right
gained 0.07797 green versus 0.04246 red. Cross-compiler bit identity is not
assumed.

## Remaining gates

- W0/G0-E is partial. WA-07 exact hardware HDR remains open; the software-only
  host cannot close it. U25 evidence is scoped and is not a replacement.
- Retain the existing API and reuse current Effect, render targets and timing
  capabilities before proposing new interfaces. Do not start dependent HDR
  feature work without its evidence.
- Real Agent baseline runs and per-scene VA approval remain outstanding.
  E12 needs the frozen art target, approved scene parameters, and a separate
  temporal reference. The CPU diagnostic does not release them.
- No default engine, package, historical evidence, Gallery catalog or hosted
  deployment changed.

### Scoped W0 runtime baseline

On the exact rebuilt baseline SDK, the existing interactive multipass collector
and its verifier passed the selected WPE WebKit 26.5 scope: five configurations
covering capture/native routes, RGBA8/RGBA16F, DPR 1/2 and 4× MSAA where supported,
15 controlled cases and two native-pacer cases. The full three-browser matrix
was not run. The recorded report SHA-256 is
`e59388e9ce88c9c30ac677e884db6373e56e5f6b483f3dc2ef6b037c91797c11`.
Verify the report with the exact rebuilt JS and declaration bytes; a different
checkout's stale generated bundle fails the evidence identity check.

The existing source/SDK baseline inventory observed 14 top-level exports and six
member declarations, with no runtime pass assigned by default. In the v1.3
workstream these support reuse investigations, not L5 claims. This is distinct
from WA-07 hardware HDR, Agent tasks and formal scene approvals.

### E12 temporal preflight

```sh
python3 tools/verify/rendering-iteration/temporal_reference.py generate --out <new-reference-dir>
python3 tools/verify/rendering-iteration/temporal_reference.py audit \
  --candidate <linear-RGB32F-frame-dir> --out <new-audit.json>
```

The CPU micro-fixture uses a fixed 16-frame sequence: a moving foreground disc,
a subpixel fence and a tiled backdrop, with a camera cut on frame 8. The checker
generates its own reference, requires every frame exactly once, and measures
newly revealed background separately from whole-image error. At the camera cut
it checks the 95th percentile of absolute channel errors across the frame.
The linear RGB32F format and thresholds apply only to this preflight.

All 16 reference frames passed. A deliberately localized history leak on
frame 4 produced 0.11787 disocclusion error even though whole-frame mean error
was below budget. A held frame across the cut produced 0.31 at the cut's 95th
percentile, also rejected. The reference manifest SHA-256 is
`e0fade54c7c187181a94889db66454f4e00131fa6af47727fc09ed8aa7a3762a`.
This is separate from the static Cornell transport truth. An AIR capture
adapter, approved temporal E12 scene and hardware validation are still open.

### AIR temporal capture adapter

```sh
node tools/verify/rendering-iteration/temporal-air-capture.cjs \
  <source-bound-full-sdk.js> <installed-WPE-wrapper> <new-capture-dir>
python3 tools/verify/rendering-iteration/temporal_reference.py audit \
  --candidate <capture-dir> --out <new-acceptance.json>
```

The adapter draws the orthographic scene with real AIR meshes, materials and
depth testing. No Python reference pixels are sent to the app. It requests a
specific scene state, waits for the engine's draw event and browser compositor,
then captures 640×384 without MSAA at DPR 1. It resolves 4×4 subpixels in
linear light and retains the raw PNG, linear pixels and SHA-256 per frame.

The source-bound full WebGL2 SDK passed all 16 captures on WPE WebKit 26.5,
with no page, console or network errors. Maximum whole-image mean error was
0.00112; maximum disocclusion mean error was 0.00108; camera-cut P95 channel
error was 0.00222. The unchanged micro-fixture budget is 0.035. Capture receipt
SHA-256: `d792eb67e9cf68ee2fbf9ddc21442aab6b3f0507981f9b59add690e1bdba5c13`.
The capture intentionally has no temporal filter; it validates the scene and
measurement route, not an implementation of TAA or full E12 acceptance.

### E12 native TAA graph negative control

The 16-frame supersampled capture above does not exercise the native custom-pipeline TAA effect. Run the separate
source-executed graph probe after installing the repository's TypeScript dependency:

```sh
node tools/verify/rendering-iteration/taa-graph-probe.cjs
```

This loads the checkout's actual `PostProcessBuilder` and `TAAPass` TypeScript and exercises their render methods for
two interleaved cameras over three frames. Math, non-TAA passes, and draw recording are stubs; in particular, no pixels
are drawn. The probe checks each camera's first-frame seed, the last history slot written by that camera, its previous
projection, the jitter actually applied versus the material value, and whether queued bindings survive scheduling the
second camera. Results include both source hashes and per-camera observations.

The original `31d3daf3` branch is a deliberate negative control: six camera invocations complete, with **5** wrong
history bindings, **5** wrong previous matrices at enqueue, **6** same-frame jitter mismatches, and **3** overwritten
bindings at simulated recording time. Exit status 1 means one or more invariants failed; the baseline is not a passing
test. Actual browser custom-pipeline draw, isolated camera cut, target replacement, and device validation are separate
gates, not implied by the CPU result.

A second collector runs the real Custom pipeline in WPE WebKit, using the repository's source-bound development SDK
and frozen effect/layout assets, with no engine edits. Set `NODE_PATH` if Playwright is installed outside this checkout:

```sh
node tools/verify/rendering-iteration/taa-native-probe.cjs <WPE-executable> <new-report.json> --expect-baseline
```

The script starts fresh pages for three tracks (TAA off, A only, A+B) with two differently colored, different-sized
render textures. It uses the engine's single step clock, captures real bindings, and hashes offscreen GPU readbacks.
The first three frames are the history-ownership oracle. The last two record an A-only camera move and then resize;
these are diagnostic observations, not passing cut/resize acceptance. `--expect-baseline` explicitly expects the
known graph failure; omit it to require clean dual-camera continuous-history checks. Neither mode marks E12 complete.

On WPE WebKit 26.4 with WebGL2 and `EXT_color_buffer_float`, the off/A-only controls had clean readbacks and correct
available history. With A+B, five of six continuous-frame history bindings were absent or incorrect, five previous
matrices were wrong, and A's uploaded material state changed after queueing in all three frames. The A-only resize in
that track also produced a GL texture/framebuffer feedback-loop error and one blocked readback. The five-frame
report was produced with a development SDK whose source receipt matched 1,030 files.
