# EX03 · Box3D trigger lifecycle

T20 / original `box3d-trigger-lifecycle` scope. **Review candidate, browser / real physics NOT_RUN.**
This candidate was checked only with CPU tests and strict TypeScript `noEmit` against the explicitly
selected existing SDK223 declarations. No physics, WASM, browser, native build, installation, or remote
execution was performed. Earlier cohort results are background contracts, not results of this example.

## Reproduce CPU checks

From the repository root, using its already installed dependencies:

```sh
node --test examples/box3d-trigger-lifecycle/tests/*.test.mjs tools/verify/box3d/trigger-lifecycle/check-types.test.cjs
node tools/verify/box3d/trigger-lifecycle/check-types.cjs --dts /absolute/path/to/qualified-sdk/cocosair.module.d.ts
```

The declaration path is mandatory; there is no SDK auto-selection, installation or emitted output.
If dependencies live outside the candidate, `NODE_PATH` may point to the existing source's node_modules.
Do not mix current unqualified Terrain ABI source with the old SDK223 runtime.

## Run only after browser/native QA authorization

```sh
BOX3D_RUNTIME=/absolute/path/to/qualified-sdk node examples/box3d-trigger-lifecycle/serve.cjs
# Then use the authorized browser at http://127.0.0.1:7473/
```

The server binds localhost, serves read-only files, transpiles example TypeScript in memory, and hashes
runtime JS/native assets/example sources at `/identity.json`. It neither rebuilds nor installs. Retain this
identity with every export and do not overwrite failed attempts.

## Scene and controls

- Lifecycle mode: a real sphere visitor (r=.15 m, 1 m/s, no gravity) traverses three 1×1×.8 m primitive
  zones at x=-2/0/2 from x=-4. Count zone increments on actual enter; door zone requests the actual
  kinematic door's open target; spawn zone creates a primitive cube, visible for 30 observed ticks before
  idle destruction. The observation window is 480 fixed ticks.
- Toggle count-zone trigger, mask 0/-1, or component enabled while running. These execute at idle, not
  inside native dispatch. The UI displays read-back settings. Native exits are never invented to match a
  toggle. Solid collision/contact snapshots are not evaluated by this trigger-only reducer.
- Arm **Callback destroy** before enter: that callback requests visitor destruction at idle. Its
  application identity is retired before Node destruction. Late callbacks are recorded as rejected, never
  applied to a new visitor. Start creates fresh scene/application identities; reset releases the scene and
  retains historical evidence. Generated-cube lifecycle and visitor retirement have separate log records.
- Fixed authored timestep 1/60; hook contract **exact** `Math.fround(1/60)` and solverSubSteps=4;
  maxSubSteps=1. Every attempted clock is recorded before assertion. Physics is app-owned, never manually stepped.
- `app.run(scene)` performs synchronous onLoad before useCCD and velocity access. Actual CCD and velocity
  getters are recorded before validation; CPU call-order doubles reject premature access or mismatched readbacks.
- Public diagnostics, window errors and unhandled rejections are retained. Faults stop the observation,
  never select another backend, and leave Close enabled until the SDK close is invoked. Reset/release/close
  are serialized; preparation failures retain owned identities and may retry preparation. Duplicate clicks
  are ignored. **SDK223 permanently caches close(): after invocation, failure is terminal, not retryable.**
  The page then disables Close and instructs export/reload; a cached failed receipt is never called success.
  Native release promises remain native responsibilities; there is no fabricated timeout-success receipt.

## Public lifecycle cleanup (source/CPU checked; native fault injection NOT_RUN)

Actual SDK223 `AirAppImpl` matches the referenced source: completed `releaseScene()` clears its in-flight
Promise and performs the final deferred flush even without a current scene; `close()` permanently caches
its Promise. This candidate invokes **releaseScene → owned assets destroy → second awaited releaseScene →
close**, with no private flush. Both receipts and remaining live allocations are retained and checked.

Every Scene, Node, Material and Mesh allocation is tracked immediately, before component setup, material
initialization or mesh creation into the tracked Mesh. Construction/onLoad failure immediately attempts
public cleanup: an unowned candidate Scene and orphan Nodes receive public destroy requests, followed by
releaseScene flush. An app-owned Scene is left to public release. Assets are destroyed only after the first
receipt and invalid-scene/node checks; second release flushes asset destruction before final SDK close.
Failure retains identities and original/cleanup errors rather than dropping them. Refused handle disposal
is recorded but cannot skip the other stops or public teardown attempts. No engine `_deferredDestroy` or
other private method is called. All of this still requires actual native fault/lifecycle QA.

## Thin-mode comparison — not complete sensor CCD support

**New controlled diagnostics and full CPU/source derivation:** [TRANSIENT-PROOF.md](TRANSIENT-PROOF.md).
The sealed 3b/30 m/s results remain historical, not evidence for this new source revision.
Two additional explicitly named 120 m/s modes use x₀=-8.25; they do not overwrite the original defaults.
Every new mode remains browser/native **NOT_RUN**. Actual before/after endpoint/velocity/config/geometry qualification, including initial conditions,
committed origin/rotation and a failure latch across the run, is separate from native callbacks and never declares CCD PASS.

Original baseline modes:

Both original baseline modes freeze thickness=.01 m, speed=30 m/s, 24 ticks, sphere radius=.15 m.
They are explicitly endpoint/substep-confounded and cannot establish pure transient CCD. The other two zones
remain visible in a separate lane z=-2 and do not intersect this experiment.

| Mode | Moving source | Stationary target | Meaning |
|---|---|---|---|
| fast-solid | dynamic sphere x=-2, useCCD=true | count-zone sensor x=0 | Observe limited native solid→sensor continuous hits, including transient enter/exit |
| moving-sensor | kinematic count-zone x=-2, +.5 m nominal per tick via public target lease | static sphere x=0 | Observe moving-sensor boundary; **no promised native hit** |

Moving-sensor targets use exact float32 timestep displacement; no per-frame Node teleport. At each
before-step callback, the real source collider is swept against the **committed** world using the same
translation/epoch. UI/report keep native callbacks and sweep predictions separate. Query results retain
worldGeneration/tickIndex/attemptId/nativeStepIndex/nativeMutationRevision and copied hits. Prediction never
creates enter/stay/exit, changes pose, or counts as native detection. No blanket “sensors have no CCD” claim;
no event-flags, occlusion, >8-candidate capacity, dual-fast, hull or mesh support claim. False useCCD is not
world continuous=false. SDK or capability errors fail closed, rather than synthesizing a positive outcome.

## Fixed control-window diagnostics

The three visible **New run · in-zone … round trip** presets retain original lifecycle physics. A real
accepted count-zone enter anchors one sequence at +2/+4 hook ticks, applied through the same idle mutation
path as manual controls. They record requested/due/actual tick, public getters and real visitor pose/intersection.
Reset/Close/retirement cancel pending work; re-entry cannot rearm; conflicting manual controls are disabled.
Trigger→solid can change the physical path, so restoration never promises a new enter. See the proof document
for exact semantics and the fresh-run acceptance requirements. No browser script injection or manual step API.

## Event identity and evidence

Listeners are on zones only, so one physical pair is not double-counted by opposite-side callbacks.
selfCollider/otherCollider are matched to actual live object references. Self/other IDs and generation are
**application-owned labels**, never native IDs. `hookTick`/`hookAttempt` associate a callback with the most
recent attempted before-step context; **they are not native event timestamps**. No `event.impl` fields are
read. Committed-query native stamp fields are genuine public query outputs and remain in the separate pane.

The ledger rejects wrong generation, retired/unknown identities, duplicate enter/events, out-of-order ticks,
orphan stay/exit and malformed clocks. Policy errors fail closed. Intentional retirement records invalidate
application pairs without emitting fake exits; rejected late events remain visible. Counters are derived
from the same accepted rows shown in the UI/export. Renderer/body-pose equality and compositor visibility
are not established by CPU tests or by exported body motion alone.

## Executable acceptance plan — all NOT_RUN

1. Freeze SDK/source/asset hashes and `/identity.json`; capture initial/narrow viewport, statuses and all controls.
   Run lifecycle mode to its 480-tick observation boundary. Export and retain raw events/clocks/frames/mutations.
   Confirm three visible zones, exactly corresponding count increments, actual door movement and cube lifecycle.
2. Join native callbacks by application generation/self/other and hook association. Check enter→stay→exit,
   no orphan/duplicate/old-generation application updates; compare UI totals to accepted export rows. Retain
   screenshots while each zone is active. Do not interpret the association as an authenticated native timestamp.
3. Fresh runs: while inside count zone toggle trigger→solid→trigger, mask -1→0→-1 and disable→enable.
   Verify native lifecycle ordering against raw SDK evidence. C23 solid/contact channel assertions and C21
   contact snapshot consistency require their separate fixtures; this example does not substitute them.
4. Arm callback destruction before enter, repeat resets and fresh starts; verify deferred idle retirement,
   no post-retirement accepted stay/exit, no identity reuse, and no stale callbacks counted in a new generation.
   Observe spawned cube creation and 30-tick retirement separately. C24 full self/other/rebuild/reused-index
   engine matrix remains separate, not proven by application IDs alone.
5. Run both original 30 m/s baselines and both explicitly named 120 m/s diagnostics separately.
   For the new diagnostics require 24/24 endpoint qualification rows, inspect both-object poses/velocities,
   committed geometry and same-epoch sweep stamps. Any mismatch is INCONCLUSIVE, not eligible transient evidence.
   The CPU/source substep model is not a direct native substep measurement. Freeze config; retain native callback sequences AND committed sweeps with
   matching hook epoch, actual post-step poses and screenshots. Fast-solid transient enter must not be deleted
   merely because end pose is outside; do not fabricate stay. Moving-sensor missing native hits are boundary
   observations, not a reason to synthesize events from sweep hits. No blanket expected hit count for unpromised paths.
6. Exercise reset during motion, close during release, duplicate close and injected public diagnostic/window
   errors. Ensure pending queue work settles, fresh mount is cancelled when closing, Close remains available
   before SDK invocation (terminal SDK failure requires export/reload, never retry),
   failed receipts remain failures, and final release receipt is retained. Confirm actual browser close and
   resource baselines externally; app Close alone is not browser physical-close evidence.
7. Run associated C21–C28 expanded inventory separately: C21-SNAPSHOT, C22-SENSOR-TRANSIENT, C23 channels,
   C24 reuse/rebuild, C25 bit31/filter matrix, C26 full ray/sweep/overlap edge matrix, C27 speed trials and
   C28 event-flags/occlusion/capacity/dual-speed. All are **NOT_RUN for this candidate**. This EX03 UI is not
   a replacement for their acceptance gates and never emits a full acceptance PASS.
