# U05 skinning, instancing, morph and lifecycle contract

This is the AIR-UPSTREAM-20261022 implementation slice, not a release or GPU acceptance claim.
The upstream baseline remains unchanged.

## Reproduced defects and narrow fixes

1. A skinned position-morph vertex escaped the model's world AABB. The fixed local two-joint fixture
   produced world `y = 1.875` while the old bound ended at `y = 1.25`; the negative-scale case also failed.
   The same fixture with zero morph passed. `Mesh.getBoneSpaceBounds` now optionally applies actual
   per-submesh target weights to positions **before** inverse-bind transformation. It validates finite
   weights, float counts and absolute buffer alignment. Its existing shared, weak-keyed base cache is
   not populated with instance-specific results.
2. After each of 30 create/dispose cycles, the removed renderer's material instance retained one pass.
   Nodes, models and source-asset references had already settled correctly. `MeshRenderer.onDestroy`
   now destroys only instances whose `owner` is that renderer, after model teardown. Shared materials
   and externally owned material instances are not destroyed. `MaterialInstance.isValid` intentionally
   remains true after its immediate `destroy()`; the meaningful resource predicate is empty passes,
   not changing the native object flag.

`SkinningModel` keeps one latest instance bounds result. A weight or base-bound generation change
recomputes it; binding replacement and destruction clear it. The result is conservatively unioned with
the undeformed bounds, then uses the existing joint/world transform pipeline. It is finite rather than
an infinite culling bypass, and may be larger than the tight skinned vertex AABB. The union also avoids
relying on private morph-resource enable/disable timing.

The three production files are `src/cocos/3d/assets/mesh.ts`,
`src/cocos/3d/models/skinning-model.ts`, and `src/cocos/3d/framework/mesh-renderer.ts`.
There is no `GLTFAsset.instantiate` rewrite or deep copy of shared Mesh/Texture/Clip resources.

## CPU coverage and limits

- A programmatically built native skeleton uses native `instantiate` to produce three distinct roots,
  remapped skinning-root references and independent animation states, while sharing mesh, skeleton,
  material and clip. This is distinct from the glTF path; neither result is extrapolated to the other.
- `test/fixtures/upstream-skinning/rig.gltf` is an original, fixed, self-contained MIT fixture: two joints,
  blended skin weights, two RGB/RGBA primitives, a position target, native animation channels and a
  one-pixel PNG texture. No network assets or third-party model downloads are required.
- Three glTF instances receive independent animation times, root-bone positions, nonuniform and
  negative ancestor scales, rotations and morph weights. Source mesh bytes/document metadata and
  shared clips/textures remain unchanged.
- The independent scalar oracle composes local quaternion/TRS transformations and weighted vertex
  positions without engine matrices, AABB transforms, bone-bound caches or shader helpers. It has
  hand-calculated self-tests. Containment tolerance is `1e-5 * max(1, sceneDiagonal)`.
- Weight values `0`, `1`, `-1`, `2`, `-3`, animated intermediate values, multiple targets and different
  submesh weights are exercised. Nonfinite weights and misaligned Uint8Array storage fail with named
  diagnostics. Weighted inputs are not clamped to `[0, 1]` merely to make bounds pass.
- Thirty lifecycle cycles return instance references and render-scene model counts to baseline and
  leave no retained renderer-owned passes. Two surviving instances keep sampling independently.
  Source destroy is idempotent, rejects new instances and waits until its last existing instance is
  released. Direct scene-owned root destruction also releases that ownership.
- Integration tests advance actual headless director updates/draws, with a microtask checkpoint
  between increasing frames. No arbitrary sleeps or private destruction-queue flushes substitute for
  these cycles. The legacy lifecycle predicate unit test now simulates the required event protocol
  rather than firing every timer, including the eight-second deadline. Separate negative controls
  reject draw-only, repeated-frame and same-task shortcuts, and retain timeout failures.

The Jest environment is EmptyDevice/jsdom. Its local data-URI transport and PNG decode are explicit
fixtures; actual ImageAsset/Texture2D construction and resource ownership still execute. These tests
do **not** prove browser PNG decoding, GPU allocation release, shader compilation, framebuffer pixels,
compositor presentation or real frustum culling. Existing headless startup diagnostics are retained in
raw logs, not suppressed.

### CPU cost

Changing position-morph weights requires a traversal of the affected mesh's vertices, target
displacements and skin influences to rebuild bone bounds. Unchanged weights reuse the latest model
result; only the latest entry is retained, not an accumulating history per animation sample. Shared
base bounds remain separately cached. A small five-sample `updateTransform` observation records
elapsed CPU time on this three-vertex/two-primitive fixture without a threshold. It is not a production
model benchmark, performance acceptance gate, GPU measurement or evidence of no performance cost.

### Color and morph capability matrix

| Capability                         | Evidence in this slice                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| RGB vertex colors                  | Loader packing verifies alpha defaults to 1. Browser rendering remains unverified.                             |
| RGBA vertex colors                 | Loader packing preserves explicit alpha. Browser rendering remains unverified.                                 |
| POSITION morph + realtime skinning | Instance state and independent CPU bounds verified; GPU output remains unverified.                             |
| COLOR_0 morph                      | Explicitly unsupported and rejected as `unsupported morph attribute COLOR_0`. No claim of color morph support. |
| Baked-animation morph bounds       | Not covered by this fix; glTF instances and the new native rig use realtime skinning.                          |

## Executable browser collector, execution currently INFRA_BLOCKED

`test/fixtures/upstream-skinning/index.html` and `main.ts` prepare a real WebGL2 fixture. The dedicated
`tools/verify/upstream-skinning-browser.cjs` collector compiles only the fixture and independent scalar
oracle in memory, resolves `cocosair` to the existing fresh `build/cocosair.module.js`, and serves a
four-resource allowlist on loopback. It never builds the runtime. The page exposes
`window.__upstreamSkinning.run(checkpoint?)` and `close()`.
It uses the single `createStepClock`, pauses native pacing for observations and restores pacing after
completion. It loads the same local glTF with real image decoding, isolates RGB and RGBA primitives,
records three independent instances, crosses a fixed camera's frustum and returns GPU readbacks plus
30-cycle lifecycle observations for each color mode.

The read-only validator `tools/verify/upstream-skinning-observations.cjs` accepts retained observations
with `--input=<file.json>`. It rejects missing modes/cycles, blank expected-visible frames, unexpected
outside pixels, AABB escapes, shared-state contamination and retained material passes. Its synthetic
unit tests prove validator behavior only. Pixel counts are visibility smoke checks, not a full
independent color-reference or alpha-blending regression.

The dedicated collector implements the additional evidence contract:

- Select exactly one of `--browser=chromium|firefox|webkit` per invocation using the existing
  `browser-engines.cjs` launcher options. Each attempt requires a new output directory. There is no
  retry, alternate executable after failure, remote URL, deployment, install or canonical publication.
- Freeze hashes of all runtime source, fixture inputs, runtime bundle, collector/validator/launcher and
  lockfile. Compile captured fixture bytes, not a later reread. Retain the actual served HTML, compiled
  module, glTF and runtime bytes and compare their hashes against actual browser response bodies.
  Retain Playwright/browser versions, executable hash, options, real WebGL2 renderer identity, console,
  page errors, network failures and server finish receipts. Source drift or missing receipts fail closed. A final artifact hash index binds the report,
  observations, logs, native readbacks, screenshots and all other retained attempt files.
- Observe 206 ordered checkpoints: two combined scenes, 24 frustum positions and before/live/disposed
  boundaries for all 30 lifecycle cycles in each RGB/RGBA mode. A checkpoint only observes an already
  stepped state. It does not drive another engine render, replace a fixture result or bypass native
  pacing. `createStepClock` remains the only engine stepping mechanism.
- Retain the 26 native `readPixels` RGBA8 byte buffers as `.rgba` files, with dimensions, call sequence,
  byte counts and SHA-256. Independently recompute their channel sums and visible-pixel counts and
  compare them to the observations. The raw bytes are bottom-to-top WebGL rows, not PNG screenshots.
- Separately retain and hash 26 compositor canvas PNGs after presentation callbacks, checking visible
  and outside-frustum states independently of GPU readback. These are visibility checks, not an exact
  color/alpha reference, image-quality approval or real-device acceptance.
- Instrument native WebGL2 create/delete/draw/readback calls before runtime import. Every wrapper
  invokes the real method exactly once and preserves its return value and exceptions. Weakly keyed
  resource identities distinguish newly retained handles from unchanged counts. Every temporary
  instance must allocate and delete native buffers; no newly created resource handle may remain after
  its disposal boundary. These are native API/handle observations, not portable VRAM measurements or
  proof that the driver physically freed all memory. Existing runtime/builtin caches may remain.
- Require the independent observation validator, complete checkpoint inventory, native handle checks,
  actual readbacks, screenshots and explicit native app-close receipt. Application success is separate
  from physical browser/server closure. One original four-second shared close budget requires the
  launched child process's actual `close` event with exit code 0/no signal, server close acknowledgment
  and no remaining server sockets. Timeout, signal, failed cleanup or missing acknowledgment cannot
  become PASS. A bounded cleanup attempt preserves the original failure. This focused collector does
  not claim the full campaign's process-tree/ECHILD shutdown proof.

`--record-not-run=<verified-blocker>` records fingerprints and an explicitly unexecuted NOT_RUN report
without loading Playwright/esbuild, listening or launching. It exits nonzero and cannot produce browser
PASS. The collector's synthetic Node tests exercise protocol/negative controls only; they are not a
substitute for running the three real browsers.

The current coordinated environment cannot launch/reach the required browser fixture: socket setup
was denied, elevated setup failed, the cloud browser cannot reach the local service, and file URLs
were denied. This slice made no additional browser launch, deployment or isolation-bypass attempt.
Chromium/Firefox/WebKit WebGL2 acceptance remains **INFRA_BLOCKED**, including T19 and GPU portions
of T17/T18/T20/T21. The frozen acceptance manifest must not be promoted from these CPU results.

## Reproduction

Run the focused suites without a bundle rebuild:

```sh
NODE_OPTIONS=--max-old-space-size=3072 node node_modules/jest/bin/jest.js --runInBand \
  test/smoke/upstream-skinning-instance-lifecycle.test.ts \
  test/smoke/upstream-skinning-oracle.test.ts \
  test/smoke/upstream-lifecycle-settlement-protocol.test.ts \
  test/smoke/competitive-asset-lifecycle-contract.test.ts
node --test tools/verify/upstream-skinning-observations.test.cjs \
  tools/verify/upstream-skinning-browser.test.cjs
```

In an authorized environment with a fresh runtime build and matching installed Playwright binaries,
collect each browser into a distinct, nonexistent attempt directory:

```sh
node tools/verify/upstream-skinning-browser.cjs --browser=chromium --out=output/u05-chromium-new
node tools/verify/upstream-skinning-browser.cjs --browser=firefox --out=output/u05-firefox-new
node tools/verify/upstream-skinning-browser.cjs --browser=webkit --out=output/u05-webkit-new
```

For a previously verified infrastructure blocker, record an explicitly unexecuted attempt instead of
retrying a denied browser or socket operation:

```sh
node tools/verify/upstream-skinning-browser.cjs --browser=chromium --out=output/u05-not-run-new \
  --record-not-run="Verified browser/socket access denied; no further launch authorized"
```

The last command intentionally exits 1. Do not run it merely to create a status badge, or treat a
single browser's result as the full Chromium/Firefox/WebKit acceptance matrix.

Raw development attempts, original failures, the final expanded CPU run, source diff and fingerprint
receipt are under `output/upstream-update/m2-lifecycle/`. The coordinator owns durable publication,
upstream mapping and release-status updates. Compilation of the prepared browser fixture is recorded
separately from browser execution.
