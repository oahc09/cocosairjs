# Runtime performance: startup baseline

Separate from the frozen Agent benchmark. This first slice (G0 / G1 diagnostic)
measures an empty clear (S01) and a clickable unlit cube (S02) through a fresh
browser process, a loopback HTTP navigation, and a real production-bundled npm
consumer. The catalog reserves all 24 case IDs; only S01/S02 are implemented.
There is no hardware ranking or release gate in this tool.

## Reproduce

From an isolated, clean checkout with repo dependencies installed, run
`npm run build:all` (writes JS, declarations, npm copies and increments the
build counter). Pack with `npm pack --ignore-scripts --pack-destination <dir>`
only after that succeeds. If the build changed only the counter, restore that
counter in the isolated checkout before planning; retain the emitted SDK bytes and
the build log. Do not reset or stage generated artifacts.

Prepare three isolated npm installation roots under `<inputs>`: `air` with
the AIR tarball and `three-frozen`/`three-current` with the exact Three.js
tarballs 0.186.1 and 0.187.0 respectively. Use offline local installs with
`--ignore-scripts`; each directory must contain a lockfile and node_modules.
Use resolvable Playwright and pngjs (pngjs only for the correctness run).
Pass an installed browser executable if required; no flags relax its safety
settings. Plan, build and run do not download packages or browser binaries.

```sh
CLI=tools/benchmark/runtime-performance/cli.cjs
node "$CLI" plan --campaign startup-001 --out /tmp/startup-001.json
node "$CLI" build --manifest /tmp/startup-001.json --inputs <inputs> --out /tmp/startup-apps-001
node "$CLI" doctor --browser webkit --executable <WPE-wrapper> --out /tmp/startup-doctor-001.json
node "$CLI" run --manifest /tmp/startup-001.json --artifacts /tmp/startup-apps-001 \
  --browser webkit --executable <WPE-wrapper> --mode correctness --out /tmp/startup-correctness-001
node "$CLI" run --manifest /tmp/startup-001.json --artifacts /tmp/startup-apps-001 \
  --browser webkit --executable <WPE-wrapper> --samples 3 --out /tmp/startup-diagnostics-001
node --test tools/benchmark/runtime-performance/evidence.test.cjs
```

Each output path must be new. Artifacts carry the input package-lock and bundle
hashes. The production comparison uses the same esbuild target and options.
The AIR min-input arm explicitly picks the already shipped minified entry in
the same installed package. It does not change the package default. JS goes over
gzip on loopback with disk-cache reuse disabled; fresh browser instances do not
flush OS caches. Record raw per-attempt measurements, including failures.
The correctness mode takes independent pixel probes and verifies that a real
click changes the drawn silhouette. Do not use those screenshot-contaminated
timestamps as timing samples. The diagnostic mode does not take screenshots.
A renderer callback is not proof of content presentation; physical-present and
first-content metrics remain null. Device attestation, throttled/warm protocols,
formal A/A or paired statistics, S03–S07 and all runtime/lifecycle arms are open.

## First run: 2026-11-27

Baseline source `9ea3ea951b5b452f2809864ce76b7fca71f37fd6`. Rebuilt dev/min/SDK,
passed the package markers, then installed the resulting npm tarball offline.
WebKit 26.5 WPE, WebGL2 on a GPU-less Linux host; reported renderer string is not
hardware attestation. 8/8 correctness attempts and 24/24 diagnostic attempts
passed the local contracts. These are not physical GPU results or a speed ranking.

| Input            | Package entry raw bytes | Consumer raw bytes | Consumer gzip bytes | Consumer Brotli bytes |
| ---------------- | ----------------------: | -----------------: | ------------------: | --------------------: |
| AIR regular      |               9,191,403 |          5,551,862 |           1,171,424 |               933,162 |
| AIR min input    |               5,808,266 |          5,544,108 |           1,169,922 |               931,069 |
| Three.js 0.186.1 |                 662,772 |            529,155 |             132,708 |               123,086 |
| Three.js 0.187.0 |                 658,900 |            532,136 |             132,831 |               123,456 |

The AIR min bundle looks 37% smaller when compared as raw package entry
files, but the production consumer only saves 1,502 gzip bytes (0.13%).
Do not change the public package entry on the strength of raw file sizes.
Next: identify module and registration closure, then measure opt-in candidates
against this unchanged full entry. No engine optimization or Three.js victory
is claimed.

SHA-256 of the baseline npm tarball:
`e1b5bf3a0371c92996ea6486a18322e489d2edff7c21ad66bf939fcdc92976bf`.
Run manifest: `0e37f860d96a4c9c19cf1120b8e5bdc39fc9e1c7b91e57ec2b3227533626aeb1`.
Artifact index: `43b5912826cf3e677d55ff6ce3e7d9a3388185f1b470604dd38a349b587f6774`.

## Dependency closure and rejected experiments

```sh
node tools/benchmark/runtime-performance/closure.cjs build/cocosair.module.min.js <new-closure.json>
```

This uses the installed lockfile's source-map decoder and verifies the repository's
existing bundle/source binding before attributing emitted bytes. Counts are
estimated UTF-8 spans, not per-module download or JavaScript CPU costs.

1. The two embedded built-in shader tables account for about 1.98 MB of mapped
   generated bytes (1,549,954 and 425,331 bytes). Box2D accounts for another
   325,567 bytes.
2. An isolated min build removed eleven named features, including WebGPU, Video,
   WebView, Spine, DragonBones, tiled maps and Cannon, from the build request
   without editing the aggregate `air` entry. The same 1,028 sources were still
   emitted, including the supposedly excluded families; the gzip difference
   was only 65 bytes. Do not treat a feature-list change as a smaller closure.
   This comparison used the runtime build outputs, before packaging.
3. A separate local diagnostic tried memoizing GLSL conversion per built-in
   registration (100 stage sources, 73 distinct). It passed TypeScript and
   both scene checks, and the isolated conversion microprobe improved from
   6.41 to 5.54 ms. In eight alternating S01 browser pairs, median paired deltas
   candidate minus baseline were +12.5 ms for engine init, -3 ms from
   navigation to init, and +5.5 ms to the first draw callback. The effect did
   not survive end-to-end noise. The cache patch is intentionally not shipped.

Prioritize isolating an explicit render-only dependency graph and separating the
shader payload from eager startup assembly, with per-profile API and asset
identity checks. Keep the full runtime unchanged. This round does not establish
a production speedup.

### Four-effect startup probe

The generated builtin drift gate remains intact. A normal source build with
hand-edited generated tables failed that gate, as expected. Instead, this
reproducible diagnostic reads the full development ESM after verifying its
compiler receipt, finds the two exact original JSON initializers, and creates
an isolated copy that excludes four effects in matching metadata/shader pairs.
It does not change sources at runtime, alter the default package, or keep a
source map that no longer matches the transformed copy.

```sh
DIR=tools/benchmark/runtime-performance
node "$DIR/cli.cjs" plan --campaign shader-scope-001 --out <manifest.json>
node "$DIR/profile-probe.cjs" src/air/builtin <new-probe-dir> build/cocosair.module.js
node "$DIR/probe-consumer.cjs" <manifest.json> build/cocosair.module.js <new-control-dir>
node "$DIR/probe-consumer.cjs" <manifest.json> <new-probe-dir>/runtime-probe.mjs <new-profile-dir>
# Run cli.cjs run separately with each directory as --artifacts, --arm air,
# first --mode correctness and then alternate order for diagnostic samples.
node --test "$DIR"/*.test.cjs
```

The removed effects are terrain, bloom, deferred lighting and the built-in glTF
template. This deliberately decreases feature coverage; no unsupported app may
use this transformed runtime. Eighteen other effect rows remained, including
standard, unlit, stencil and sprite; presence does not prove every retained
effect renders correctly. The diagnostic only checks S01 and S02.

Using the same minified consumer build, gzip payload fell from 1,171,424 to
1,064,450 bytes (-106,974, -9.13%); Brotli fell from 933,162 to 919,852 bytes
(-1.43%). The browser independently reported the same gzip byte delta for all
six S02 pairs. WPE WebKit 26.5 passed four visual attempts; all three corresponding
screenshots matched byte for byte. The exploratory paired medians were -20.5 ms
to load the module (import duration), -28 ms in initialization, and -82.5 ms
to the first draw callback (range -128 to +11 ms). These are fresh per-attempt
software loopback measurements, not an attested device, a first-present
improvement, or same-feature victory. The experiment receipt SHA-256 is
`6d3666f4c57f63d7e55e001c3b6af4fdccf799a553b3d998ef0dbf3f0754e3a4`.

Next: replace omission with explicit, compatible on-demand registration and
prove the full first-frame import graph. Keep this narrower diagnostic distinct
from a supported profile and validate any future profile against same behavior.

### Deferred glTF template, without deleting model support

```sh
DIR=tools/benchmark/runtime-performance
node "$DIR/lazy-gltf-probe.cjs" build/cocosair.module.js <new-probe-dir>
node "$DIR/lazy-gltf-browser.cjs" build/cocosair.module.js <new-probe-dir> \
  <installed-WPE-wrapper> <new-browser-dir>
```

This is a **separate one-effect** diagnostic starting with the complete
source-bound ESM (not the preceding four-effect experiment). It leaves other
effects eager. It removes matching `air-gltf-template` metadata and GLSL rows,
then inserts an asynchronous readiness step between primitive preparation and
synchronous material building. The runtime pins its own data-only payload by
SHA-256 and uses the existing renderer's lowering and registration. A single
request/registration is shared, not tied to the model's abort signal; rejected
payload preparation can be retried. The normal generated-source validation and
default package remain untouched. Neither output is a published SDK.

Software WebKit checked the default-material primitive without a material
slot, physical clearcoat requested before the first startup draw, a held shared
request with two concurrent parses and one abort, and hash-mismatch rejection
followed by a valid retry. The equivalent control/profile PNGs matched exactly,
with 11,654 non-background pixels each. The surviving model and its mesh
were destroyed on release without destroying the registered template. The
abort check proves the cancelled caller returned no asset before shared
registration; this fixture has no textures and does not certify arbitrary
texture cleanup.

The direct full SDK transferred 1,568,277 gzip bytes. The deferred SDK
transferred 1,545,370 bytes before the cube (22,907 fewer), then made one
25,726-byte gzip request when it needed the effect. For a page that needs the
model immediately, these bodies total 1,571,096 bytes, **2,819 more than full**,
plus a request. Resource Timing confirms the bytes and delivery order; the
single software-browser timings in the raw attempts are not a speed
conclusion. Default package support, caching policy, real hardware, terrain,
and the exact `pipeline/bloom` and `pipeline/deferred-lighting` consumers
remain outside this probe.

## Optional Chromium visual calibration

Callbacks and standard FCP do not identify the first recognizable scene. Keep this **separate** from regular
diagnostic, correctness, and comparison runs. With sandboxed Chromium and resolvable Playwright, pngjs and
jpeg-js, run the loopback fixture first:

```sh
node tools/benchmark/runtime-performance/visual-trace-calibrate.cjs CHROMIUM NEW_DIR headless
```

It traces actual compositor snapshots in fresh browsers for an orange shape plus either a delayed teal
stand-in or no stand-in. The shell and canvas clear must not count as content. The recognizer must bracket
the delayed draw marker and never count the absent marker. This is a **synthetic** calibration, not a glTF
load or an engine benchmark. Same-device headed calibration and an instrumented/uninstrumented A/A overhead
check are still needed for a hardware campaign.

For a benchmark page already served at HTTP loopback, collect and analyze independently:

```sh
node tools/benchmark/runtime-performance/visual-trace-collect.cjs CHROMIUM URL NEW_TRACE.json 1800 headed
node tools/benchmark/runtime-performance/visual-trace.cjs NEW_TRACE.json ABSENT.png PRESENT.png 0.34,0.23,0.66,0.77 NEW_REPORT.json
```

Use independently captured, aligned reference frames from the intended workload at the same viewport aspect.
For S02 use an S01 grey clear and the settled orange cube, with the initial camera pose and no input.
For glTF, choose a distinct model ROI with cube-only and model-ready reference frames, then verify real
delayed and absent controls. Use a normalized ROI containing both stable foreground and stable background
points. Verify references and hold geometry/aspect fixed; this is not general object recognition.
The trace starts before navigation but times are relative to the injected main-document user timing mark,
**not** to navigation start or an existing callback. Unknown screenshots never become an absent bound.
A left-censored result (no absent snapshot), unstable result, or missing content is not a usable interval.
Report the endpoints and width rather than interpolating a point. No `displayPresentMs` is inferred:
hardware presentation would require joining the content-bearing frame to trustworthy compositor
presentation feedback on that same frame. The normal startup runner's metrics are untouched.

Initial headless software check (Chrome for Testing 148.0.7778.96, sandbox enabled): three synthetic control pairs
recognized the delayed marker only after its draw, and never recognized it in the absent arm. Delayed-marker
brackets were about 160–163 ms wide, so they cannot resolve smaller differences. An extra software check using
the actual AIR S01 and S02 scene setup and bound development SDK rejected S01 and recognized S02. The S02 trace
had no calibrated negative snapshot before the first cube snapshot and correctly returned `left-censored`.
No physical presentation timing, package ranking, or instrumented startup speed claim follows from these checks.
