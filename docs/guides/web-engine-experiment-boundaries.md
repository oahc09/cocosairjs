# Web engine experiments: CPU and Three reference boundaries

## No-DOM Node feasibility

Run `node tools/verify/node-cpu-feasibility.cjs` against an existing workspace build, or pass
`--consumer=/path/to/offline-installed-consumer` to resolve the real installed package exports.
The consumer must already contain the installed package; the probe does not install, build, or edit it.
Use Node 20 LTS or newer, or Node 18.19+ for installed mode.
The probe runs the math and main imports in separate fresh Node processes, with `NODE_OPTIONS` and
`NODE_PATH` removed. Installed mode checks that both bare specifiers resolve inside the consumer’s
physical installation. Run `tools/verify/math-tarball.cjs` after a full build for a real `npm pack`,
offline installation, this probe, and TypeScript checks. To run only the probe, install the retained
tarball offline in a fresh ESM consumer using `--ignore-scripts` and pass its directory.

The math process checks browser global absence and composes a parent and child matrix with a signed
parent scale. It transforms all eight cuboid corners, checks their numeric extrema, and checks that
moving the parent shifts both x extrema. Those are math results, not an engine bounds implementation.
`IMPORT_ONLY` never counts toward scene functionality. Use
`--require-scene` to fail closed while scene hierarchy, bounds and fixed-step behavior remain unvalidated.

The current main module is browser-only: HEADLESS chooses a device mode after importing browser PAL
bindings. Import can register Cocos globals before it fails; the probe records those in the isolated
process. The CPU-only math export verifies numerics, not scene hierarchy, bounds, or a simulation clock.
Future clean Node scene work needs actual headless input and update semantics, not synthetic DOM or fake
GPU, and must preserve the default browser bundle and CPU-only math API.

## Isolated Three experiment

[Experiment inputs](../../tools/benchmark/upstream/three-experiment-2026-11-18.json) pin the upstream
timestamp and lighting changes, including the first-parent control commits. Record the exact build digest
for each arm in separate, clean Three checkouts. This contract provides no renderer or measurement
results. Use the same workload, setup, and pixel regions within each matched arm. The indirect-specular
experiment identifies the transitional revision separately and includes a probe-only control because
the subsequent fix removed LightProbe from indirect specular. Neither revision defines Cocos semantics.

Keep CPU frame duration, disjoint GPU pass sum, elapsed GPU span, and actual display presentation
separate. A span can include gaps; never combine overlapping time ranges into a pass sum nor label
headless browser pacing as display presentation. When features, timestamps or presentation trace
are unavailable, record that status rather than imputing values.

The official Agent comparison remains three@0.186.1 and uses the existing frozen reference manifest.
Do not rewrite scoring, baseline checks, thresholds, or old golden captures. Experimental reports
and ROI images require separate new destinations and must not feed canonical scoring.

## Event-bearing crowd clips

Use `tools/verify/crowd-pose-events-browser.cjs <browser> <new.json> <workspace-ESM-bundle>`
to compare the scheduled marker trace for forward-looping clips against an exact,
source-bound build. Event-bearing clips keep full playback in the conservative
experiment lane. A camera-only skip control reaches the same total callback
count while delaying the first marker each loop; callback order and tick are
therefore part of the check. This does not establish optimized event dispatch,
off-camera shadow correctness, or frame-time savings.
