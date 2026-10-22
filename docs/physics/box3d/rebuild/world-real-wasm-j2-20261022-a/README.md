# j2 actual AIR/PhysicsSystem + real WASM result

## Result and identity

`PASS_LIMITED_NODE_WORLD`, collected on 2026-10-22 from 08:01:31.014Z to 08:01:52.102Z with official Node v24.19.0. The Jest process exited normally with code 0, no signal, and one sequential integration test passed. This is eight retained observation phases, not eight independent test suites.

The source collector ran unchanged from its [static-check receipt](../world-real-wasm-harness-20261022/final/static-checks.json). Its input was `tools/physics/box3d/output/world-wasm-release-20261022-j2`; the original build evidence was only read, never overwritten. All 29 native build inputs matched the current tree. Named AIR/PhysicsSystem sources, collector hooks, test configuration, package lock and native build inputs stayed unchanged through phase checks and shutdown; build receipt, manifest and listed artifacts were requalified after the test. This is a named-source hash scope, not a complete transitive engine dependency closure.

- Native build receipt SHA-256: `a9551bbc399c61eec276d601acd9506c72dd3e5b0b77a083f0e0a025106b3dc1`.
- WASM SHA-256: `b9b80482121b261303904485eb40bdcc4ea3c5016c83f1cb5ccbe3c29e7f753c` (525,356 bytes).
- Schema SHA-256: `1ceb8425e1e9c4d7c2752bd2dfe7315cd383ef7f3b44f1afbc62a6a47705d81c`, ABI 1, variant `st-simd`.
- Raw observation SHA-256: `22c13c0f8e7dc99239c112844166542eef78d6707dc84b6b73c72c081e7268e4`.
- Collector receipt SHA-256: `7ec04558b09202043d5274512000810ce79b18e738e6e2e6f7ce8fdb16c1f749`.

## What actually executed

The fixture imports actual TypeScript AIR bootstrap, preparation, adapter, world and original Cocos PhysicsSystem sources under the existing Jest/JSDOM setup. A native Node ESM preload loads the production ST loader/facade and generated Emscripten module. A bounded local-file transport supplies exactly the manifest, JS and WASM; it does not use a browser, network socket, GPU or runtime bundle rebuild. The custom environment only passes the real loader and recorder across the Node/JSDOM boundary.

Adapter registration is explicit and fixture-internal. Actual `createAirApp({ renderMode: 3, physics: 'box3d' })` executes real `game.init` and constructs one real owned world. Only the observation fixture retains the actual returned world capability for real low-level body/shape creation. No public raw token accessor, public feature activation, fake world or simulated native readback was added. The observation wrapper forwards original receiver, arguments, return values and exceptions; snapshots, debug geometry and counters come from the real binding.

The app never runs a scene loop. After initialization it is paused, and every native step originates in actual `PhysicsSystem.step` or `PhysicsSystem.postUpdate`. There is no second accumulator or RAF.

## Retained observations

1. Actual startup records prepared module/world ownership, one `createWorld`, native completed-step index 0 and a ready AIR world. The AIR `impl` is not the native capability.
2. After setting gravity to `[0, -6, 0]`, 60 actual manual system ticks of 1/60 produce copied finite poses. The body starts at y=20 and finishes at y=16.98749542236328, with y velocity -6.000013828277588. Native completed-step index is exactly 60.
3. Default material update sets inherited and subsequently registered shapes to friction 0.25/restitution 0.5, while explicit friction 0.75/restitution 0.125 remains unchanged. Invalid infinite gravity, non-boolean sleep and nonzero rolling friction throw without committing the corresponding public system caches; the AIR world remains ready.
4. Native wireframe flag 1 produces 216 finite line primitives. Native AABB flag 4 produces 3 finite bounds. The copied primitive collection is frozen and supported mask is 5. Constraint flag 2 rejects without changing the cached flag. Joint scale 0.5 is only validated echo, not constraint evidence. `debugPresented` remains false.
5. The actual PhysicsSystem fixed-step accumulator admits no tick for a partial interval, caps the next update at two ticks, and consumes one remaining tick on a zero-delta update. Disabled/automatic/manual modes and extra-manual-argument rejection leave the expected completed-step index at 64. No fixture clock supplies additional native steps.
6. A real zero-gravity resting body emits a sleep transition on tick 30. Disabling global sleep reads back false and the next real step emits a wake movement record. Final native index 95 exactly matches the 95 successfully forwarded step calls. Counts report 3 bodies, 4 shapes, 0 contacts and 0 joints.
7. One actual app close releases the world then module ownership. A second close returns the same receipt. There is one successful native world destruction and one binding disposal. Core live bytes return from an initial 0 to 0; independent bridge live bytes, live allocations, shape handles, primitive capacity and captured primitive count are all 0. The loader is disposed with no cleanup errors; disposed body/world operations reject. No fallback loader cleanup was needed.

The raw file contains eight checkpoints because wireframe and bounds have separate checkpoints. The summary above groups those two related phases.

## Limits and retained diagnostics

This run is not full T09 or B3U01 acceptance. It does not establish browser/GPU/CSP behavior, rendered debug, a complete component/query surface, collision response under Cocos components, all invalid-value transactions, fault injection after a native step, repeated app startup, packaging, performance or backend coexistence. Native body/shape fixture creation is not a Cocos collider implementation.

The unedited stdout includes the HEADLESS container warning and the existing `PhysicsSystem2D` missing-module diagnostic from the Jest source configuration. Therefore the passing Box3D assertions do not mean diagnostic-free startup or successful 2D/3D coexistence. Runtime/scheduler/builtin/shared asset caches remain retained by the ordinary app-close contract; zero Box3D core/bridge allocation counters are not proof of all engine or GPU resources being released.

The earlier i8 `STALE_INPUT` attempts remain unchanged in their separate directories. They were not converted into real-module rejection evidence. This j2 result is the first positive real-WASM execution of this collector.

## Reproduction

Use a new evidence directory; the collector refuses an existing one:

```sh
node tools/verify/box3d/world-real-wasm.mjs \
  tools/physics/box3d/output/world-wasm-release-20261022-j2 \
  <new-evidence-directory>
```

`receipt.json` binds the command, source/artifact hashes, child exit and raw report hash. `native-and-app.raw.json`, `jest.stdout.log` and `jest.stderr.log` are the unmodified outputs of the collection. `files.sha256` records this directory after the summary was formatted; it excludes itself.
