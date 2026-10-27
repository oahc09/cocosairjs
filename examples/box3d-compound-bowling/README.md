# EX02 · Compound bowling (source candidate)

**Acceptance: NOT_RUN.** This is original T20/EX02, not a replacement game or completion of C04/C06–C12/C18. CPU tests and strict declaration checks do not run physics. Browser rendering, native contacts, mass/COM behavior, impulse rotation, 20-reset leak qualification and gallery integration remain **NOT_RUN**. No static baked compound, hull/mesh or Sphere–Capsule event qualification is claimed.

## Scene and controls

- Ten upright pins in 1/2/3/4 rows. Each pin owns one dynamic RigidBody and two colliders **on the same Node**: box `.32 × .7 × .32` centered at `(0,-.25,0)`, sphere radius `.23` centered at `(0,.32,0)`. Visual child meshes do not carry physics components. Pin mass `.5 / 1 / 2 kg`; fixed surface friction `.35`, restitution `.05`.
- Dynamic 4 kg sphere ball, radius `.36`; a static approach lane and fallback floor; one kinematic platform moving laterally ±.35 m and rotating around Y ±.12 rad. Its exclusive public target lease is acquired after synchronous `app.run(scene)` mount. Subsequent targets are idle microtask requests, never body Node teleport. Requests and actual native platform poses are separately retained.
- **Start / fresh reset** releases the old scene, then constructs a new generation; **Stop and release** does not clear history. **Close** remains available following faults and serializes behind pending release. A preparation failure **before calling SDK `app.close()`** leaves preparation available for another attempt; this is not a promise of recovery. Once SDK Close is invoked, its permanently cached result is terminal even if failed: export evidence and reload, not “retry cleanup.” The existing runtime does not promise same-document reconstruction after Close: reload to restart.
- **Apply pin mass** changes only `RigidBody.mass`; captures all ten public shape configurations before/after, native committed shape proxies on the following before-step hook, and subsequent native body motion/mass. Initial mass is cached pre-mount; CCD and velocity methods run only after mount and record public getter readback. The public PhysicsSystem owner is enabled synchronously before velocity/target admission (paused owners reject these APIs); the hook is installed in that same stack before any later native frame.
- **Center / offset impulse** are mutually exclusive one-shot actions per generation. World impulse `(0,0,-24)` uses `RigidBody.applyImpulse(impulse, relativePoint)`. The public API defines `relativePoint` as a **world-oriented offset from the current COM**, not an absolute point. Center uses `(0,0,0)`, offset uses `(.2,0,0)`. The exported absolute display point is native `worldCOM + offset`; it is not passed to the API. Impulse requests and later angular velocity observations are distinct.
- Cyan markers use the public native `readBox3DBodyMotion().worldCOM` directly. They have no colliders and do not estimate COM from visuals. Export includes native `localCenter`, `worldCOM`, origin/rotation, mass, velocity, mass-pending/enabled flags, renderer pose error and native COM-frame consistency error. Crosshair arms extend beyond the opaque body; their intersection and dot are at the exact native COM. Exported coordinates remain the authority.
- Score latches a pin once `dot(native-rotated local +Y, world +Y) < .5` (>60° tilt). Upside-down counts; merely leaving the platform upright does not. This is a pose-based game rule, not a contact-event or physically isolated force assertion.
- Observation stops after 600 observed native fixed ticks. `fixedTimeStep=1/60`, native context must equal **`Math.fround(1/60)`**, solver substeps 4. Each actual context is copied **before** validation. No manual step, alternative backend, private adapter/native access, or synthetic event producer is used.

## Read-only serving (only when browser/physics execution is authorized)

Run from the repository root with an **existing explicitly qualified** runtime (SDK223 original baseline; SDK235 CPU declarations checked, browser acceptance still NOT_RUN) and installed project dependencies; do not build or install:

```sh
BOX3D_RUNTIME=/absolute/path/to/qualified-sdk223 PORT=7472 \
  node examples/box3d-compound-bowling/serve.cjs
```

If dependencies are outside the checkout, set `NODE_PATH=/absolute/path/to/existing/node_modules`; use the existing authorized Node binary. The server binds 127.0.0.1, transforms example TS in memory, and serves runtime read-only. It does not copy/modify the runtime, build engines, or install dependencies. `/identity.json` hashes runtime JS, ST manifest/module/WASM/facade/distribution receipt and example source. Retain it with the exported JSON and screenshots. Runtime source changes/new Terrain ABI are **not** part of SDK223. The shared route now additionally checks the selected ST manifest/receipt identity and asset hashes; this is integrity checking, not browser qualification. The server captures runtime bytes once so later file changes cannot silently mix responses with the recorded identity; restart the server to select new bytes.

## CPU / strict declarations (no runtime import)

```sh
node --test examples/box3d-compound-bowling/tests/*.test.mjs \
  tools/verify/box3d/compound-bowling/check-types.test.cjs
node tools/verify/box3d/compound-bowling/check-types.cjs \
  --dts /absolute/path/to/qualified-sdk223/cocosair.module.d.ts
```

The checker requires explicit existing `--dts`, uses `strict:true`, `noEmit:true`, and checks example TS against that exact SDK (`skipLibCheck` skips SDK internals only). Pure policy tests cover native float32 clock rejection, score boundary/invalid orientations, bounded mass, layout/target functions, stale/retired guards, queued failures, multi-click admission, retryable pre-close preparation versus terminal SDK-close failure, and two-phase owned-asset cleanup sequencing. Static source guardrails are **not** engine lifecycle tests. No browser, native build or physics simulation is executed by these commands.

## Deferred runtime acceptance procedure

1. Record code SHA, qualified SDK223 producer SHA `b089d223aad1bb4be4a81f187eceb341510d766a`, runtime/artifact identity, console errors, viewport/DPR and screenshots. Confirm real Box3D ST (one worker) initialization, all ten compound pins, ball, platform and COM markers. Do not silently fall back.
2. Start; inspect actual clocks (float32 1/60, solver 4) and contiguous hook/observation ticks. Review disabled/massPending flags, per-body renderer/native pose error, and `origin + rotate(native localCenter)` against native `worldCOM`. Consistency alone does not prove independent native mass correctness; review known compound mass/inertia expectations in the matrix.
3. Apply `.5`, `1`, `2` kg in a run. Match each idle request to later native mass frames and the next native geometry snapshot. All ten public dimensions/centers must be unchanged; compare native child dimensions and **body-relative** child geometry (world origins/rotations naturally change during simulation). Missing snapshots, wrong mass, stale readback or nonfinite values fail; do not infer success from the request. Geometry proxies are queried using a tiny positive sweep; its hits are discarded and are not collision evidence.
4. Separate fresh center and offset runs; export before request and next actual angular/linear frames. Ground friction/contact and moving-platform impacts also rotate bodies, so bowling observations do **not** replace isolated center/off-center impulse matrix tests. Record actual offset rotation rather than assuming it from the button click.
5. Observe lateral/rotational platform movement and actual native platform motion beside target requests. Source has no per-frame body teleport. Score must agree with native tilt; reset restores ten live identities with new generation labels and retains all old records.
6. Perform **20 actual full release/rebuild cycles**, including rapid clicks, reset during motion, Close while release is pending, and fault-then-Close. Capture every release/close receipt and engine resource measurements with baseline/final counts. `released` receipts alone do not prove no leaks; GPU memory is reported unavailable by current receipt API. Missing counters or any residual growth must be recorded as an evidence gap, not PASS. This candidate does not auto-promote its `reset20: NOT_RUN` label.
7. Review exported historical records for unchanged old generation identity and cancelled idle work. Verify no stale/retired native reads. Complete independent C04/C06–C12/C18 and presentation/gallery checks separately. **No acceptance status should be promoted solely because CPU tests pass.**

## Evidence boundaries

`requests` are authored requests with idle phase and hook association; `clocks` are native before-step contexts; `frames` contain real public native reads associated with after-physics; `geometry` distinguishes public configuration from copied native committed query geometry (world generation/native step/mutation stamps). Hook tick association is not a newly invented native event timestamp. No contact callbacks are used. Faults stop observation and retain evidence; Close preparation remains available only until the terminal SDK Close has been invoked; there is no success-on-error fallback.

## Public cleanup ordering (source-verified; runtime still NOT_RUN)

The initial review identified terminal-close and deferred-asset ownership issues. The old candidate/evidence is retained locally in `pre-lifecycle-review-v1`, not silently overwritten as runtime success.

- SDK223 compiled `cocosair.module.js` lines 143109–143165 (`src/air/app.ts` 214–277) clears its in-flight release Promise after every completed `releaseScene()` and **always** runs the final asset/deferred flush, including when there is no current scene. By contrast, compiled line 143168 / source 280–337 caches `close()` permanently. These are inspected code facts, not executed cleanup qualification.
- `releaseOwned` first destroys a still-valid candidate Scene **only if `app.getScene()` is not that Scene**, then awaits public `app.releaseScene()` to flush all scene/component destruction. Nodes join the candidate Scene immediately during construction, before later operations can throw; newly constructed owned materials are registered before initialization. This covers pre-mount construction failures, not just successful mounted scenes.
- Only after a `released` scene receipt and invalid candidate Scene does it request owned assets' public `destroy()`. It then awaits a **second public `releaseScene()`** to flush those newly deferred objects before pausing/reset completion or terminal `app.close()`. No example code calls private deferred destruction or private release-manager APIs. Public session `own()` was inspected but not used: its disposal result is cached, while this explicit resource ledger retains failed identities for diagnosis.
- Objects are removed from the owned-asset ledger only once their public `isValid` is false. Failed destroy attempts retain the object; successful destroy requests are still flushed. A `released` receipt without invalid assets does not pass this policy. This is not proof of GPU zero-leak behavior; measurements remain unavailable.
- Refused hook/target stop attempts are recorded without skipping other stop attempts or public scene/asset release. Such a failure blocks reset/rebuild; Close may proceed to final SDK owner teardown only after the public scene/asset flush policy succeeds. No stop failure is erased from the log.
- Close preparation must complete these public flushes **before** invoking terminal SDK Close. If preparation fails, it is recorded distinctly and SDK Close has not run. If SDK Close has run and fails, the Close control is disabled and the UI says the result is terminal/cached; there is no misleading re-invocation of the same Promise. CPU doubles test only this orchestration/state contract, never actual SDK destruction or retry success.

## Gallery draft entry (source/CPU contract only; browser NOT_RUN)

The Gallery entry is `draft`, with no promotion or runtime validator evidence. It does not qualify EX02 or alter existing examples' evidence. The API/evidence specification is deliberately not frozen; full strict specification/campaign acceptance remains pending.

The ordinary Gallery dev server now has an EX02-scoped runtime mount. It requires the same explicit runtime selection as standalone serving; it never substitutes `/build` for EX02:

```sh
BOX3D_RUNTIME=/absolute/path/to/qualified-runtime npm run dev -- --example box3d-compound-bowling
# Open http://127.0.0.1:7454/gallery.html#box3d-compound-bowling
```

Unlike the isolated `serve.cjs`, the ordinary dev server retains its existing build/watch behavior. Use standalone serving when a frozen, read-only runtime test is required. For Gallery, EX02 URLs are `/box3d-compound-bowling/identity.json` and `/box3d-compound-bowling/runtime/`; standalone keeps `/identity.json` and `/runtime/`. Both entry points use the same `runtime-route.cjs`, identical selected runtime bytes and identity fields. Missing or invalid runtime returns HTTP 503 on the scoped Gallery routes; unrelated Gallery examples are unaffected. The importmap, identity fetch, and ST asset URL are relative to the example, not the Gallery root.

```sh
node --test examples/box3d-compound-bowling/tests/*.test.mjs \
  examples/box3d-compound-bowling/tests/*.test.cjs \
  tools/verify/box3d/compound-bowling/check-types.test.cjs
```

Route tests use synthetic CPU fixtures and in-memory request/response calls (no browser or socket); fixture bytes are explicitly not native SDK artifacts. Separate read-only comparison with an actual selected SDK can establish route/hash consistency, never engine or visual behavior. The required moving Stop → fresh Start → twenty real release/rebuilds → Close during release sequence remains **NOT_RUN** until a real browser can execute it. Do not replace it with these tests.
