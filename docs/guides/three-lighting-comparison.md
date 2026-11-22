# Pinned Three.js lighting comparison (WebGL2 control)

This optional test compares exact Three.js source revisions from the
[isolated experiment lock](../../tools/benchmark/upstream/three-experiment-2026-11-18.json).
It builds only tracked Three.js source into a fresh output directory. It does not use the
checked-in upstream bundles, vendor Three source, change the protected Three.js 0.186.1
baseline, update screenshots, run in default CI, or contribute to Agent scores.

## Run

Prepare three clean Three.js source checkouts at the lock's exact revisions. A shallow
partial fetch of the official repository is sufficient: fetch the three SHAs with
`git fetch --depth=1 --filter=blob:none` and check out each in its own Git worktree.
For a sparse checkout, retain `/src/` and `/package.json`. Install the Cocos AIR dev
dependencies and make the Playwright package and its matching WebKit executable
available. If needed, `AIR_EVIDENCE_BROWSER_EXECUTABLE` can identify an installed,
compatible WebKit launcher.

```sh
node tools/benchmark/upstream/three-lighting-comparison.cjs \
  --before=/path/to/three-before \
  --transition=/path/to/three-transition \
  --rollback=/path/to/three-rollback \
  --out=output/three-lighting-new
```

The revisions, in order, are `3ee9e49e90941c2ed45303ab492d3eb48b5cc63c`,
`6efa5af0b8e6bbde573cf231a0e882d902d374f8` ([#35580](https://github.com/mrdoob/three.js/pull/35580)),
and `282d7567de65c063a8657e20e88daad238b688e4` ([#35614](https://github.com/mrdoob/three.js/pull/35614)).
Use a new output path with an existing parent. The summary binds the fixture,
source trees, bundles, raw 3×3 readbacks, and furnace screenshots to the result.
The collector checks every consumed source blob against Git and hashes the bundle
response each browser page actually loaded.

## Interpret

Compare each revision against the other revisions on the **same** rendering path:
`WebGPURenderer(forceWebGL: true)` using its real WebGL2 backend, or classic
`WebGLRenderer`. Both use a fixed camera, 640×320, DPR 1, sRGB output, Reinhard tone
mapping at exposure 1, and no antialiasing. The isolated white AmbientLight furnace
uses eleven roughness values for both a dielectric and a pure metal. The separate
LightProbe control switches a constant diffuse SH probe and a fixed linear
environment texture independently for two roughness values.

In the WebKit WPE run, pure-metal furnace centers were 0 → 188 → 188 across
both backends. With the environment off, LightProbe-only metal centers were
0 → 124 → 0; with the environment on, enabling the probe changed the transition arm
from 124 to 156 and left the other two arms at 124. The dielectric probe response
remained after the rollback. The classic WebGL clear path produced background 255
with these fixture settings, while the WebGL2 backend for WebGPURenderer produced 188.
Compare material pixels, not those two backgrounds.

These are rendering correctness controls, not evidence of native WebGPU or Cocos
semantics. No native adapter was available in this run. The standalone HemisphereLight
control and the timestamp comparison still need their own evidence. GPU pass sum,
elapsed GPU span, CPU frame time, and physical presentation are not measured here.
