# EX05 · Box3D CCD range (review candidate)

Original T20/EX05 scope, not a game or a physics replacement. **Browser/real physics: NOT_RUN.**
No new engine build, WASM execution, or browser was used to prepare this candidate.

## Run later, after QA authorization

From the repository, using existing installed dependencies and an explicitly selected qualified SDK:

```sh
node --test examples/box3d-ccd-range/tests/*.test.mjs tools/verify/box3d/ccd-range/check-types.test.cjs
node tools/verify/box3d/ccd-range/check-types.cjs --dts /absolute/path/to/existing/runtime/cocosair.module.d.ts
BOX3D_RUNTIME=/absolute/path/to/existing/runtime node examples/box3d-ccd-range/serve.cjs
# Open http://127.0.0.1:7475/ using the approved browser tooling.
```

The typecheck requires the repository's installed TypeScript and an explicit existing SDK declaration
file. Missing/invalid arguments or a missing declaration file reject before loading TypeScript. It never
selects another SDK automatically and writes no compiled output.

The server is localhost-only, read-only, no watchers/build, transforms this example's TypeScript in memory.
`/identity.json` hashes runtime JS, native assets, and example sources. If dependencies are outside this
candidate directory, set NODE_PATH to the existing repository node_modules; do not install or rebuild.

## Controls and meaning

- 10 / 30 / 80 m/s, radius .05 m, spawn x=-2, zero gravity, fixed 1/60 s, solverSubSteps=4.
- Wall at x=0, adjustable .01–.5 m thickness; baseline .05 m. Low-speed and bullet targets move at -1 m/s.
- `useCCD` sets the real public RigidBody property (native bullet control), not an alternate world switch.
  False **does not disable all CCD**. Bullet–bullet and dual-high-speed behavior are outside the promise.
- Body mode records committed ray and real body motion. Sweep mode additionally records the actual
  projectile collider's committed convex cast. Neither ray nor sweep writes a pose or stops the body.
  Self ray hits remain labelled `self` in raw evidence; casts exclude only the supplied projectile collider.
- Native ticks, not render frames, produce 90 observations per trial. maxSubSteps=1 makes after-physics
  observation unambiguous; no independent step loop. Hit evidence is collision-enter, not query inference.
- Current-speed 30-trial button creates fresh scene bodies each trial with deterministic seed 0;
  static baseline counts are separate from non-promised observations. Exports retain interrupted trials.
- Reset stops the queue, disposes hooks, releases the old scene before creating new bodies; no runtime
  teleport. Close waits for pending release and records the app close receipt. User closing the browser
  tab is **not** proof of orderly app/browser shutdown; collector must explicitly use Close.

The UI never emits a full acceptance PASS. `OBSERVED_OK` means only local static-wall geometry/contact/
Node-pose observations; screenshots and actual compositor presentation remain external acceptance work.

## Executable acceptance procedure (NOT_RUN)

1. Freeze example + SDK/source/assets fingerprints; retain `/identity.json` and raw report on every retry.
2. Check initial scene, all controls, errors, labels and narrow viewport with screenshots; verify sphere is
   physically .05 m and renderer follows the actual body (no inflated visual hit geometry).
3. At thickness .05, wall target, body mode, bullet=true: choose each 10/30/80 and press **current-speed
   30 trials**. Export after each. Require exactly 30 completed observations per speed, zero crossing at
   any sampled tick, collision-enter retained, position AND quaternion agreement <=1e-4, all 90 native
   samples contiguous. Retain first-hit/final render captures; no console/runtime errors.
4. Repeat comparison with bullet=false, each speed, and sweep mode. Do not demand tunneling when false;
   world continuous remains default true. Compare query stamps/hits with the committed pre-step geometry,
   actual post-step trajectories and events. Query prediction is not a collision/stopping proof.
5. Exercise .01/.1/.5 walls and low-speed non-bullet/bullet targets. Keep these separate observation rows;
   bullet–bullet must not be counted as promised support. C28 dual-high-speed/sensor capacity/event flags
   and full C26 three-sweep/overlap edge matrix are separate contract tests, not covered by this UI.
6. Reset during a flight and between batch trials: ensure old generation stops, ABORTED rows preserved,
   no stale hook/contact reaches the next scene. Close during flight/release; retain release/close receipts,
   browser physical-close evidence and resource baselines. Reopen cleanly and verify no stale count.
7. World-continuous diagnostic toggle remains **BLOCKED** pending new public diagnostic API + newly
   built/qualified native assets. The disabled control is a gap, not EX05 full completion.

Associated C26–C28 inventory and cross-browser/ST/MT full matrix are **NOT_RUN**, not replaced by CPU tests.

## Failure-path review additions

The actual SDK223 declarations are checked with TypeScript `noEmit` (not only esbuild).
A pure lifecycle boundary used by the live page settles pending trial waits on faults and permits
explicit Close after fault; duplicate close is excluded and failed close may be retried. Before-step
errors are deferred to the idle cleanup path and rethrown to prevent committing a bad tick. Public
app diagnostics plus browser error/unhandled-rejection listeners preserve asynchronous faults rather
than waiting for an after-physics event that a failed step may never emit. They do not suppress errors.
CPU tests exercise these paths, but browser/native fault injection remains NOT_RUN.

Contact evidence must match live self/other collider object identities, then records example-owned
trial/projectile/target labels (not invented native IDs), callback-associated attempted tick, contact
count and copied public world point/normal. Policy rejects malformed/nonfinite, wrong-trial/body/target
or out-of-range tick contacts. Labels and CPU policy alone do not authenticate an externally edited report.
