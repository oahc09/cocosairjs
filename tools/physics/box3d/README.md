# Box3D fixed-core foundation

This directory contains a new, limited M1 foundation, not the lost implementation,
not a full community binding migration, and not a finished Cocos physics backend.
The original fixed core is unmodified. Read `abi-review.md` before extending it.

## Inputs and verification

- `versions.lock.json`: exact core/base/vendor revisions, candidate SDK, build
  contract and ABI schema hash. Toolchain observations were refreshed before the
  c Debug/Release builds. Official SDK 6.0.2 provenance and compiler identity are
  recorded; full browser/CSP/G1 qualification remains incomplete.
- `abi-schema.json`: explicit copied float32/uint32 wire representation.
- `native/air_box3d.c`: target-header C17 shim for ST worlds, bodies, box/sphere,
  snapshots, center impulse, velocity, closest ray and live counters.
- `src/air/physics/box3d/binding/facade.mjs`: static internal JS facade with ownership
  tokens, disposed/reentrancy guards and post-call heap-view refresh.
- `native/contract.c`: real fixed-core native diagnostic. It does not test JS/WASM.
- `wasm-contract.mjs`: real newly built WASM Node contract, including actual heap
  growth and copied snapshots. Both fresh c Debug/Release runs pass.
- `wasm-ownership-contract.mjs`: 122 rejected operations with exact before/after
  snapshots/counters, cross-owner/module/forged tokens, 128 same-world slot-reuse
  cycles and 128 world-lifetime cycles. Partial and failed runs retain raw records.
- `audit-artifacts.mjs`: checks a successful build against current input hashes,
  all 55 expected compile units, link flags, actual WASM imports/memory and artifact
  hashes. Writes one immutable `artifact-audit.raw.json` in the chosen build output.
- `native/layout_probe.c` and `layout-wasm.mjs`: separate measured host/WASM32
  old/target header layouts, not an old-core physics build.
- `compare-wasm-builds.mjs`: current-input Debug/Release physics and ownership
  comparison, with build-dependent memory footprints reported separately.

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
node tools/physics/box3d/audit-artifacts.mjs tools/physics/box3d/output/wasm-debug
node tools/physics/box3d/audit-artifacts.mjs tools/physics/box3d/output/wasm-release
node tools/physics/box3d/compare-wasm-builds.mjs tools/physics/box3d/output/wasm-debug tools/physics/box3d/output/wasm-release tools/physics/box3d/output/wasm-comparison
node tools/physics/box3d/layout-wasm.mjs tools/physics/box3d/output/wasm32-layout
```

These commands use `emcmake cmake` with the host project, compile sequentially with
`--parallel 1`, compile fixed core as a
subproject, inspect actual compile commands, reject dynamic JS execution/worker
constructors, inspect actual WASM memory limits, create a hash manifest, and run
the real Node WASM physics and ownership contracts. A missing SDK fails with BLOCKED
and a retained receipt. Audits/comparisons/layout probes also preserve previous
outputs and require a new path for a new attempt.
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
- Numeric body/shape IDs do not include the world generation. They can become
  valid again after world-slot reuse, or coincide across module instances. Only
  facade-issued object tokens carry the additional ownership/lifetime checks;
  never reconstruct a token from a raw query ID or serialize it as persistent identity.
- No complete C21/C22 contact/event adapter, cooked cache, joints, controller, recording/replay, MT,
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
- The a/b Release builds have unshared WASM memory with 264 initial pages and 32768 maximum
  pages. The unchanged WASM SHA256 is
  `148af5a2d48e23d3b6a78648c7b6232263954040aa8924985ba189a24ed5ac10`;
  only loader generation changes. The loader hash for b is
  `90636a612da5ef398b49bb13c2c5e15ed4b98b108c944d67bfe0ef91a4744aab`.
- The native sanitizer FAIL is unresolved and was not rerun in the WASM increment.
  Non-isolated browser, CSP, full loader matrix and complete T04–T07/G1 remain
  NOT_RUN or incomplete. No older PASS is promoted into those gates.

The historical local commands for b, using its frozen source revision, were:

```sh
source /workspace/scratch/62d43a81bbde/box3d-toolchain-20261022/use-toolchain.sh
node tools/physics/box3d/build.mjs --out tools/physics/box3d/output/wasm-st-20261022-b
node tools/physics/box3d/audit-artifacts.mjs tools/physics/box3d/output/wasm-st-20261022-b
```

On another machine, install the official pinned SDK described by the retained
`evidence/wasm-toolchain-provenance.json`, activate it in that shell, and select a
new output path. No local absolute path is a requirement of the library itself.

## Fresh Debug/Release and WASM32 increment

- `wasm-debug-20261022-c` and `wasm-release-20261022-c` are fresh builds under one
  updated lock and identical source inputs. Both actual Node contracts and their
  separate 54-unit artifact/link audits PASS. Debug uses enabled native assertions
  and Emscripten ASSERTIONS=2; Release uses NDEBUG and ASSERTIONS=1.
- The 60 freefall tick samples, all 122 rejected-operation before/after states,
  128 same-world slot-reuse samples and 128 world-lifetime samples match exactly
  between these two runs. This finite comparison does not prove cross-platform
  determinism or the complete physics acceptance matrix.
- `wasm-compare-20261022-c` preserves a failed comparison assumption: it required
  identical initial memory pages, but Debug has 265 and Release 264. The corrected
  comparison `wasm-compare-20261022-c2` compares physics/ownership exactly, reports
  both footprints and verifies both are unshared with maximum 32768 pages. It
  changes no physics fixture, numerical threshold or compiled artifact.
- In 127 world-recreation samples, a stale numeric body ID becomes valid again in
  the new world, while its facade token still rejects access without changing the
  new snapshot/counters. Within the sampled live-world slot-reuse sequence, old
  native IDs stay invalid. These tests do not prove that finite generations never
  wrap. Both independent modules return core live bytes to zero, which is not proof
  of zero JS allocations or a shrinking WASM heap.
- `wasm32-layout-20261022-c` compiles and executes the current header-only probe
  separately against each original pinned header set. Both report pointerBytes=4.
  No historical core physics binary is linked or substituted. See `abi-review.md`
  and the complete raw layout records for size/offset changes.
- Earlier a/b evidence is unchanged. Native ASan/UBSan FAIL remains unresolved;
  this increment does not run browsers, upload/deploy test pages, or bypass the
  recorded browser infrastructure restrictions. Full G1 remains incomplete.

## Staged patch identity increment (e)

The current build uses a strictly staged alignment patch, with upstream vendor
bytes preserved. See `patches/README.md` and `patches/lock.json`. The original
unpatched c and isolated-candidate d results remain historical evidence and are
not interchangeable with current artifacts. `patchChainSha256` is now required
by manifests and the static facade; missing, old or forged identities fail closed.
Wire ABI remains version 1. `build.mjs` stages the 111-file core in each fresh output
and CMake refuses direct use of the original vendor tree.

Lightweight intake and real stale-artifact rejection (no new physics build):

```sh
node tools/physics/box3d/patch-intake-contract.mjs tools/physics/box3d/output/<new-intake-run>
```

This checks patch/base/before/after hashes, exact hunks, closure tampering, and
rejection of actual historical unpatched/candidate modules. It requires the c/d
artifacts named in the fixture. Those artifacts are used only as negative inputs,
never as a substitute for a current physics build. Full ASan/LSan and browser/CSP
remain blocked/unrun independently of these passing narrow checks.

The fresh e runs now completed independently: staged native Debug PASS; staged
WASM Release and Debug PASS for the actual Node physics and finite ownership
contracts. Each WASM artifact audit checked all 54 compilation units, link flags,
staging hashes, runtime patch identity and unshared memory. Both builds used the
same 19 current input hashes; the finite physics/ownership comparison matched
exactly. The 26 intake checks include two positive checks and 24 expected
rejections, including real c/d stale modules. Four additional expected-manifest
identity rejections run in each fresh e module. These are not full G1 results.

## Additive copied snapshot increment (g)

The current schema adds batch body poses and immediate post-step copies of native
body/contact/sensor events plus touching raw manifolds. Wire ABI remains 1 and
all pre-existing symbols/layouts are unchanged; the exact new schema SHA is
`3aa11fe9d3d4b0269105bddbfebd8a1d09c9a3d162d88cb416d35d4304d1f30a`.
An actual older e module is rejected both with its original manifest and with a
forged current-schema manifest. The reviewed SSE2 patch chain is unchanged.
See [snapshot-contract.md](snapshot-contract.md) for ownership, wire scope and
exact fixed-core source references.

Fresh `wasm-snapshot-debug-20261022-g` and `wasm-snapshot-release-20261022-g`
builds each pass 55-unit artifact audits, the existing basic physics/ownership
fixtures, and seven new real snapshot groups under the same 21 input hashes:

- One native batch of 64 bodies exactly matches individual poses. Body move
  transforms match post-step pose samples. Same-step reads are immutable and do
  not consume events. Two actual heap grows leave copied data unchanged.
- Foreign/forged/stale world/body/contact tokens reject. A mixed-world native
  batch and insufficient native event/contact output capacity leave canaries
  unchanged. Failed operations do not invalidate a valid current snapshot.
- A real sphere/floor contact yields one begin, one hit and one fell-asleep event
  over 600 steps. The sleeping pair remains readable without new moves/begins.
  Actual body/shape slot reuse with changed generations is asserted; old end
  events retain invalid old identities rather than retargeting new objects.
- A slow, thick native sensor yields exactly one enter (tick 53) and one exit
  (tick 128), without contact response. This is not thin/transient CCD acceptance.
- Twelve real rotating, eccentric-COM contact snapshots retain raw normal,
  anchors, separations and impulses with pre/post origin, rotation and COM.
- All tested worlds return native core live bytes to zero. This is neither proof
  of no JS/whole-heap leak nor proof that generations can never wrap.

`wasm-contact-growth-contract.mjs` additionally holds simultaneous real contact,
body and sensor data through two actual heap grows and subsequent destruction.
Both new g2 runs pass. The original g supplemental reports retain an observation
bug: `beforeBytes` was read from an already detached old ArrayBuffer and is 0.
Their unchanged-snapshot assertions did run, but their size-before observations
must not be used. The corrected fixture reads the length before growing; both
old and corrected reports and exact fixture bytes are retained.

`compare-snapshot-builds.mjs` compares every new snapshot group and diagnostic
exactly between Debug and Release, separately reporting memory sizes. It also
records observational COM-plus-anchor hypotheses. In the rotating fixture the
pre-step hypothesis has 0–18.783 mm double-end coincidence gaps and the post-step
hypothesis 4.697–23.478 mm. Neither is a validated world-point reconstruction;
recycled cached-anchor epoch is not publicly exposed. `contactWorldPoints`
therefore throws `AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH`, never an empty success.
Full C21, C22, T07 and G1 are still incomplete. g adds no browser or sanitizer
qualification, and all earlier FAIL/BLOCKED evidence remains intact.

Additional commands, after building Debug and Release into new directories:

```sh
node tools/physics/box3d/wasm-contact-growth-contract.mjs <debug-build> <new-debug-growth-output>
node tools/physics/box3d/wasm-contact-growth-contract.mjs <release-build> <new-release-growth-output>
node tools/physics/box3d/compare-snapshot-builds.mjs <debug-build> <release-build> <debug-growth-output> <release-growth-output> <new-comparison-output>
```

## Geometry-only generation epoch candidate

The [generation geometry contract](geometry-epoch-contract.md) describes the later
strictly staged five-file core patch, separate 25-word wire, fail-closed uint64
exhaustion, copied geometry facade and independent sphere/finite-box oracle.
Earlier g raw fields and results above remain historical and unchanged. The new
`contact.geometry` extension can provide generation world/local points for its
admitted narrow families; it does not reinterpret current COM as an old anchor
basis, qualify arbitrary hull features/mesh/compound/heightfield, or close full C21.

Fresh Debug/Release builds run both `native/geometry_contract.c` as a separate
Node/WASM32 executable and `wasm-geometry-contract.mjs` against the actual product
module. `geometry-intake-contract.mjs <new-output>` verifies the second exact patch
and real stale-g/forged identity rejection. Artifact audit now hashes both geometry
raw reports and the qualification single-file CJS, separately from the product's
four artifacts. Failed setup/assertion attempts and their exact source variants
remain retained. Consult the new evidence summary for actual statuses, not this
capability description.
