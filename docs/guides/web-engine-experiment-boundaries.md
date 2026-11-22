# Web engine experiments: CPU and Three reference boundaries

## No-DOM Node feasibility

Run `node tools/verify/node-cpu-feasibility.cjs` against an existing workspace build, or pass
`--consumer=/path/to/offline-installed-consumer` to resolve the real installed package exports.
The consumer must already contain the installed package; the probe does not install, build, or edit it.
The fresh Node process removes `NODE_OPTIONS`, checks browser global absence, exercises math transforms,
and attempts the main module import. `IMPORT_ONLY` never counts toward scene functionality. Use
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
