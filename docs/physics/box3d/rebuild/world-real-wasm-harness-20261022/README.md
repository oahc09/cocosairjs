# Real-WASM AIR/PhysicsSystem collector

## Current status

The collector source is prepared; syntax/type checks are not native physics acceptance. The frozen i8 artifact cannot qualify against the current native/facade inputs, which are being changed for the new world bridge. Its attempted collection is retained as `STALE_INPUT`, before WASM startup or application testing. It is neither a real-world PASS nor the intended missing-capability `EXPECTED_REJECTION`. The first stale receipt remains in `../world-real-wasm-i8-stale-20261022-a/`; a later attempt adds explicit inspected build-receipt/manifest hashes without overwriting the first.

A newly built, source-matching bridge artifact is required to execute the positive fixture. No native, AIR product, feature, registration, facade, or PhysicsSystem source was changed by this collector work. The default product still has no public Box3D adapter activation.

## Minimal execution architecture

1. `world-real-wasm.mjs` creates a new evidence directory, freezes named source hashes, and verifies every native build input against the current tree. It verifies manifest-listed artifact hashes and requires the built facade to match the current production facade. No historical fallback is automatic.
2. Only after qualification, official Node starts Jest with `world-real-wasm-preload.mjs` through `--import`. The preload uses native Node ESM imports for the actual loader, production facade, and generated Emscripten module. Exactly manifest/JS/WASM requests are served by a bounded filesystem transport using `.invalid` URLs; no socket, HTTP, browser or CSP behavior is tested.
3. `world-real-wasm-environment.cjs` extends the existing JSDOM environment and passes the real loader/recorder into the test realm. Existing engine setup files and TypeScript transforms remain in use. There is no mock PhysicsSystem, world, pose, snapshot, debug primitive, or native counter.
4. The fixture explicitly registers the real AIR adapter internally, then calls actual `createAirApp` with HEADLESS mode and Box3D, which executes actual `game.init`, preparation ownership and PhysicsSystem construction. It never calls `app.run` or introduces an accumulator/RAF. The only simulation calls are actual `PhysicsSystem.step` and `PhysicsSystem.postUpdate`.
5. A `createBinding` observation wrapper delegates to the real production factory. It records `createWorld`, `step`, `destroyWorld`, and `dispose` while forwarding original arguments, receiver, return value and thrown error. All other methods, including readbacks/counters, remain the original functions. The observed world capability is available only to this internal test to create real low-level bodies/shapes; no product token/pointer accessor is added.
6. Before binding disposal, the recorder independently reads actual core bytes and bridge-cache counters. Observation errors are recorded and cause the success assertions to fail; they do not replace the original disposal result/error. Input hashes are rechecked at every phase and at shutdown. The loader fallback cleanup is separately labelled, never substituted for successful app-owned close assertions.

The named-source fingerprint is not a complete transitive engine dependency closure. It includes all collector hooks, relevant AIR/PhysicsSystem sources, facade/loader, existing test configuration and package lock. Native build inputs join the per-phase source checks after initial qualification; the complete build receipt and manifest artifacts are requalified before accepting a completed run. Receipts state this scope explicitly.

## Intended positive assertions, pending a matching artifact

- Exactly one actual owned world at `game.init`, with a diagnostic-only `impl`.
- A real body falling from y=20 under a changed gravity of -6: 60 actual system steps, finite copied poses, y near 17, velocity near -6 and an exactly matching native completed-step count.
- Actual inherited and future shape material updates, preservation of explicit material, and failed invalid gravity/sleep/rolling-friction assignments leaving public cached state unchanged.
- Real, nonempty finite native wireframe/AABB snapshots for flags 1/4, supported mask 5, and explicit rejection of constraint bit 2. Joint-scale echo is only echo; `debugPresented` remains false. No renderer or constraint qualification is claimed.
- Actual PhysicsSystem accumulator behavior using exactly representable frame partitions, max-substep saturation, disabled/automatic/manual modes and rejected Cannon-style extra manual arguments. No new timer or accumulator exists in the fixture.
- A zero-gravity rest body producing a real sleep event, then actual global-sleep disable/readback and wake movement event.
- Real body/shape counts, one app-owned native world release, module cleanup, core bytes restored to the initial baseline and independent bridge-cache counters all zero. Double app close remains idempotent; disposed body/world access rejects.

The positive status is deliberately `PASS_LIMITED_NODE_WORLD`, not complete T09, B3U01, browser/GPU/CSP, rendered debug, all component/query support, all invalid-value transactions, or 2D/3D coexistence.

## Commands and output semantics

```sh
node tools/verify/box3d/world-real-wasm.mjs <new-current-artifact-directory> <new-evidence-directory>
node_modules/.bin/tsc -p tools/verify/box3d/world-real-wasm.tsconfig.json --pretty false
```

For an independently source-matching artifact that genuinely lacks the required world bridge, an explicit `--expect-unsupported` run may produce `EXPECTED_REJECTION` only after real module acquisition, actual AIR guard rejection before any world creation, and module cleanup. It cannot turn stale inputs into a successful negative test. A stale/failed run exits nonzero and retains its receipt/logs. Qualified positive and expected-rejection runs exit zero but have distinct statuses.

`receipt.json` records source/artifact identity, command/exit/signal and the exact native report hash. Child stdout/stderr are retained when the child runs. `native-and-app.raw.json` records actual native calls, app checkpoints and cleanup. A 180-second process timeout is a failed collection, not successful shutdown; it does not certify cleanup if the child failed to report it.
