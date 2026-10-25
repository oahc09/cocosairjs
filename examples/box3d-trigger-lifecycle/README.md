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
  never select another backend, and leave Close enabled. Reset/release/close are serialized; a failed queued
  operation does not strand later Close. Duplicate close clicks are ignored, failed close may be retried.
  Native release promises remain native responsibilities; there is no fabricated timeout-success receipt.

## Thin-mode comparison — not complete sensor CCD support

Both thin modes freeze thickness=.01 m, speed=30 m/s, 24 ticks, sphere radius=.15 m. The other two zones
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
5. Run both thin modes separately. Freeze config; retain native callback sequences AND committed sweeps with
   matching hook epoch, actual post-step poses and screenshots. Fast-solid transient enter must not be deleted
   merely because end pose is outside; do not fabricate stay. Moving-sensor missing native hits are boundary
   observations, not a reason to synthesize events from sweep hits. No blanket expected hit count for unpromised paths.
6. Exercise reset during motion, close during release, duplicate close and injected public diagnostic/window
   errors. Ensure pending queue work settles, fresh mount is cancelled when closing, Close remains available,
   failed receipts remain failures, and final release receipt is retained. Confirm actual browser close and
   resource baselines externally; app Close alone is not browser physical-close evidence.
7. Run associated C21–C28 expanded inventory separately: C21-SNAPSHOT, C22-SENSOR-TRANSIENT, C23 channels,
   C24 reuse/rebuild, C25 bit31/filter matrix, C26 full ray/sweep/overlap edge matrix, C27 speed trials and
   C28 event-flags/occlusion/capacity/dual-speed. All are **NOT_RUN for this candidate**. This EX03 UI is not
   a replacement for their acceptance gates and never emits a full acceptance PASS.
