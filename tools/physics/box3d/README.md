# Box3D fixed-core foundation

This directory contains a new, limited M1 foundation, not the lost implementation,
not a full community binding migration, and not a finished Cocos physics backend.
The original fixed core is unmodified. Read `abi-review.md` before extending it.

## Inputs and verification

- `versions.lock.json`: exact core/base/vendor revisions, candidate SDK, build
  contract and ABI schema hash. Its status fields retain the initial pre-toolchain
  snapshot; current results are in `evidence/index.json`. The 6.0.2 candidate now
  passes the narrow Node contract, not full browser or G1 acceptance.
- `abi-schema.json`: explicit copied float32/uint32 wire representation.
- `native/air_box3d.c`: target-header C17 shim for ST worlds, bodies, box/sphere,
  snapshots, center impulse, velocity, closest ray and live counters.
- `src/air/physics/box3d/binding/facade.mjs`: static internal JS facade with ownership
  tokens, disposed/reentrancy guards and post-call heap-view refresh.
- `native/contract.c`: real fixed-core native diagnostic. It does not test JS/WASM.
- `wasm-contract.mjs`: real newly built WASM Node contract, including actual heap
  growth and copied snapshots. The recorded `wasm-st-20261022-b` run passes.
- `audit-artifacts.mjs`: checks a successful build against current input hashes,
  all 54 expected compile units, link flags, actual WASM imports/memory and artifact
  hashes. Writes one immutable `artifact-audit.raw.json` in the chosen build output.
- `native/layout_probe.c`: host-only old/target header layout comparison.

Read-only checks, from repository root:

```sh
node tools/physics/box3d/verify-sources.mjs
node tools/physics/box3d/review-abi.mjs
```

The source verifier rejects missing, changed and extra imported source files and
requires the complete selected core source closure. `review-abi.mjs --write`
regenerates `abi-diff.json`; it is a source review aid, not binary ABI proof.

## Build commands and write behavior

Every build writes a new output directory with command stdout/stderr, exit codes,
input hashes and a final receipt. Existing output directories are rejected, so
failed attempts are not overwritten. Run only one compiler build at a time in the
shared environment. No command here changes npm configuration or the default backend.

```sh
node tools/physics/box3d/build.mjs --native --debug --out tools/physics/box3d/output/native-debug
node tools/physics/box3d/build.mjs --native --out tools/physics/box3d/output/native-release
node tools/physics/box3d/build.mjs --native --debug --sanitize --out tools/physics/box3d/output/native-sanitized
```

The native diagnostic uses available GCC directly, one file at a time, because this
host initially lacked CMake. It compiles all target core C sources with upstream
C17 GNU extensions, AVX2 disabled, no fast math and FP contraction off. This path is
not a substitute for the host CMake/Emscripten build or browser verification.

When an explicitly reviewed SDK is available on PATH:

```sh
node tools/physics/box3d/build.mjs --debug --out tools/physics/box3d/output/wasm-debug
node tools/physics/box3d/build.mjs --out tools/physics/box3d/output/wasm-release
node tools/physics/box3d/audit-artifacts.mjs tools/physics/box3d/output/wasm-release
```

These commands use `emcmake cmake` with the host project, compile sequentially with
`--parallel 1`, compile fixed core as a
subproject, inspect actual compile commands, reject dynamic JS execution/worker
constructors, inspect actual WASM memory limits, create a hash manifest, and run
the real Node WASM contract. A missing SDK fails with BLOCKED and a retained receipt.
Build success still leaves non-isolated browser, strict-CSP, contact sampling,
loader concurrency/failure cases and full T04–T07/G1 requirements outstanding.

`output/` is ignored build/raw storage, not durable backup. Small unmodified raw
results and receipts are copied into `evidence/`; the parent checkpoint must archive
source, logs and necessary artifacts before considering the work recoverable.

## Boundaries

- Only ST SIMD is a WASM build target. No pthread/shared memory/pool, old WASM,
  scalar substitute, Jolt, XPBD or mock physics is used.
- Box/sphere shape density is native density, not the future public RigidBody.mass
  mapping. Dynamic bodies must receive valid geometry before stepping. This is a
  trusted internal foundation, not a complete validation layer for arbitrary inputs.
- Snapshot floats, uint32 halves and bigint counters are documented in the schema;
  the API does not expose borrowed native buffers. Full raw pointer safety is not
  offered to untrusted callers.
- No contact/event ABI, cooked cache, joints, controller, recording/replay, MT,
  application loader/prepare transaction, public adapter or legacy-backend change
  is implied. Source/native success does not make any complete plan gate PASS.

## Recorded outcomes and scope

- GCC 14.2 Debug and Release: the narrow real-native contract passes; final freefall
  y is 14.9791698 m and vy is -10.0000029 m/s; c=1 damping gives 3.68639231 m/s
  versus 3.68644528857 expected; settled sphere height is 0.499929637 m;
  native live bytes return from zero to zero after the tested lifecycle cycles.
- Full ASan/UBSan variant: FAIL in upstream SSE2 `b3LoadV`, not hidden by the
  ordinary passes. An isolated patch candidate and failing original repro remain
  under review; the pinned original core has not been changed.
- Initial Emscripten preflights: BLOCKED because `emcc` was absent. Those historical
  failures remain in evidence. The official 6.0.2 SDK is now available in a local,
  shell-scoped toolchain, with no global PATH change.
- `wasm-st-20261022-a`: real fixed-core ST WASM compilation passes, but Node aborts
  before physics because `wasmBinary` was not declared in `INCOMING_MODULE_JS_API`.
  The failed receipt and original stderr are retained without editing.
- `wasm-st-20261022-b`: compilation, Node physics contract and separate artifact
  audit PASS. The CMake change declares only `wasmBinary` and `locateFile`, matching
  the explicit runtime-input contract in Emscripten 6.0.2 `src/settings.js`.
  No `onRuntimeInitialized`, arbitrary callback, dynamic code or worker input was
  added. The Node fixture exercises `wasmBinary`; browser URL loading is not tested.
- The successful Node run records every one of 60 freefall ticks, with final
  y=14.979169845581055 and vy=-10.00000286102295. It also checks mass/impulse response,
  invalid arguments, copied snapshots, actual heap growth, closest raycast, stale
  handles and native live-byte return to zero. This is not the full physical matrix.
- Both builds have unshared WASM memory with 264 initial pages and 32768 maximum
  pages. The unchanged WASM SHA256 is
  `148af5a2d48e23d3b6a78648c7b6232263954040aa8924985ba189a24ed5ac10`;
  only loader generation changes. The loader hash for b is
  `90636a612da5ef398b49bb13c2c5e15ed4b98b108c944d67bfe0ef91a4744aab`.
- The native sanitizer FAIL is unresolved and was not rerun in the WASM increment.
  Non-isolated browser, CSP, full loader matrix and complete T04–T07/G1 remain
  NOT_RUN or incomplete. No older PASS is promoted into those gates.

The precise local reproduction commands for b were:

```sh
source /workspace/scratch/62d43a81bbde/box3d-toolchain-20261022/use-toolchain.sh
node tools/physics/box3d/build.mjs --out tools/physics/box3d/output/wasm-st-20261022-b
node tools/physics/box3d/audit-artifacts.mjs tools/physics/box3d/output/wasm-st-20261022-b
```

On another machine, install the official pinned SDK described by the retained
`evidence/wasm-toolchain-provenance.json`, activate it in that shell, and select a
new output path. No local absolute path is a requirement of the library itself.
