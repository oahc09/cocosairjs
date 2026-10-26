# Identity-safe same-world reclamation: independent qualification

Status: **independent source candidate; not activated in production; C/native/WASM NOT_RUN; trim and app unchanged.**

This is a new reconstruction after execution-environment loss, not recovery of the historical `42c3dad...` candidate. Its source, hashes, tests and receipts must be measured anew. The historical source-only review is not qualification for these bytes.

## Exact source boundary

The fixed upstream core is `efca0c184d40fd6a82016983f1601c4d23965867`. The complete ordered three-patch production prefix is `4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c`. `patch-lock.json` appends one candidate patch with exact file before/after hashes. `profile.mjs` reuses the existing `patch-intake.mjs` validators/application grammar, authenticates all 111 imported core files, and applies patches without fuzz, offsets or vendor edits. Nine core files change. This second batch leaves the already committed core patch and patch lock byte-identical and adds an independent executable qualification profile.

The source-input root must contain that reviewed production prefix, its facade identity and original source manifest. This profile is deliberately separate from `versions.lock.json`, production `patches/lock.json`, build schedule, schema and SDK. Its new chain identity must never be substituted into an old module manifest. Existing production 37/92/84/55 inventories and owned-files inventory are not updated or declared globally correct by this addition.

## Four-family invariant

The world owns fixed `uint32_t high[4]`, `floor[4]` and one sticky contact-fault word. Body, shape and joint generation width stays 16-bit; contact stays 32-bit. No production trim or floor setter exists in this batch, so normal floors start and remain zero.

`high` is monotone throughout this world lifetime. Every new slot, including a high index, starts from its family floor; a recycled slot retains its previous generation. Checked unsigned increment refuses `previous >= MAX`, invalid floor/history ordering, or an already faulted world. Commit updates high before an identity can escape. There is no rollback API. Once observed by a callback/cache/caller, an identity must never be made reusable by rolling back history. Creation also guards ID/edge-key integer range where needed.

Public generation-exhaustion refusal occurs before the first creation mutation: body before locking/sleeping-set allocation; shape before locking/cooking; joint before removal of contacts between its bodies. All nine joint constructors propagate a null pair. New shape slots preserve the floor if the pre-existing checked transformed-hull bake fails, so a later same-slot retry cannot start from zero.

This does not introduce a general OOM transaction: the existing allocator's fatal/asserting policy is unchanged. Existing invalid-geometry failures may retain slot/capacity storage without publishing an ID. The supplied native fixture requires that actual failure path; source matching alone does not prove that it executes successfully.

A future trim must reject H == MAX in every family before mutation, set floors from lifetime high-water, and retain high. Nothing here repairs raw-ID ABA across destroying and recreating a world.

## Internal contact fault

Contact creation no longer converts the generation to signed int. Exhaustion sets a sticky world fault before consuming an ID or attaching contact links. The deterministic pair loop stops, takes its normal two stack frees, and Step joins any outstanding tree task before unlocking. Previously committed contacts remain owned and destructible; there is no whole-step rollback. Collide, solve, sensors, end-buffer flip and successful state-hash recording are not performed on this exit. The existing attempted-Step input recording may already exist.

`b3World_HasIdentityFault` is an additive readonly query; invalid world also returns true. Step and object creation refuse a faulted world, while destruction remains available. The four core event getters return empty event views after fault. This does not freeze every raw-core mutator.

**Production integration is still missing.** The existing production `air_b3_world_step` remains untouched and returns OK after void Step. `identity-step-status-v1.candidate.patch` is separately before/after hash-bound to that exact source and changes its final return to `AIR_B3_CAPACITY` when `b3World_HasIdentityFault` is true. Staging extracts the complete patched `air_b3_world_step` and complete original `air_b3_world_valid` / `air_b3_world_unlocked` functions into a qualification-only adapter. No stub replaces these functions or the core step. All twelve bridge source/header inputs are hash-bound in `profile.json`.

This executable intentionally does **not** compile the remaining production bridge. Backend status mapping, ready/fault/close integration, full bridge ownership and production ABI/schema qualification remain untested and unintegrated. The adapter cannot qualify an SDK; a source-only result is not an end-to-end fault-propagation claim.

## Fixed accounting

`b3GetWorldByteCount` explicitly includes `sizeof(world->identity)` from creation. The intended struct footprint is 36 bytes, to be checked by native execution. It is embedded world-ledger storage, **not** a module allocator request. It is not hidden in a global tombstone table or offset against another category.

The old 87-row diagnostic ledger omits this metadata and is incompatible. Production activation requires a new explicit category, schema/layout/hash and complete exact build/audit/assets/qualification migration. A same-toolchain original-prefix control and candidate must eventually demonstrate the actual initial-ledger delta equals the measured fixed footprint. Do not force either initial value to historical 36040.

## Running source checks

From a verified source checkout, with `IDENTITY` naming this directory:

```sh
AIR_IDENTITY_SOURCE_ROOT="$SOURCE_ROOT" node --test "$IDENTITY/source-contract.test.mjs"
node "$IDENTITY/stage.mjs" --stage "$SOURCE_ROOT" "$NEW_CANDIDATE_STAGE"
node "$IDENTITY/stage.mjs" --verify "$SOURCE_ROOT" "$NEW_CANDIDATE_STAGE"
node "$IDENTITY/stage.mjs" --stage-control "$SOURCE_ROOT" "$NEW_CONTROL_STAGE"
node "$IDENTITY/stage.mjs" --verify-control "$SOURCE_ROOT" "$NEW_CONTROL_STAGE"
```

Staging writes only a fresh destination plus a sibling receipt and `.step-adapter.c` (empty for the control). Control mode records the actual original prefix identity, never the candidate identity. Verification rejects changed/missing/extra files, symlinks and overwritten prior staging. Tests mutate only their own temporary source fixtures; none compiles or runs C/physics. Source negative controls remove checked wrap/history, slot floor, metadata accounting, task settlement or unsigned contact assignment and must fail. Run the separately committed `generation-model.test.mjs` as bounded algorithm proof support, not C validation.

## Prepared native contract, execution still NOT_RUN

`native-contract.c` is an intrusive **test-only** executable, not a production mutation export. It injects boundary H/F and slot values; this is not trim and these values are not app measurements. Genuine constructors/destructors exercise high indices, reuse and stale IDs; a transformed-hull bake must fail after allocating its first shape slot (not merely reject at entry), preserve floor 59, and retry at generation 60. Global tracked bytes after close detect retained allocations but do not separately attribute in-world hull database capacity.

A real bridge Step creates one contact, then faults on an exhausted second slot. The actual core tree callback is deferred through the normal task API and must run exactly once at join. The fixture verifies unchanged successful step/event indices, stack/task settlement, creation refusal, no further successful step, a separate world's continued operation, destruction and return of tracked core bytes after close. Attempted-Step recording may already have happened; no claim is made that there was no attempted input recording or whole-step rollback.

The **new** successful-path assertion count is exactly 170, not the lost historical 171: body 31, shape 31, failed-hull floor 8, joint 40, contact high-index 26, contact unsigned/MAX 8, contact partial-step fault 20, main 6. The original-prefix control has 4. `profile.json` and `compare-ledgers.mjs` reject missing/extra fields, wrong identities, counts/groups, trim enabled, retained tracked bytes after close, and any initial-ledger difference other than the fixed 36-byte metadata. Module requests and embedded ledger bytes are never summed or asserted equal. Synthetic CPU parser fixtures are explicitly not native evidence.

## Hard qualification build boundary

The independent CMake entry rejects any build type other than single-config **Debug** before compiler identification, and passes all configured C/C++ and Debug flags through the same CPU-tested profile admission. A header is force-included for **every core, adapter and fixture translation unit** and emits `#error` if the compiler's effective `NDEBUG`, fast-math or Emscripten pthread macro is defined. It does not hide disallowed flags with `-UNDEBUG`. `BOX3D_VALIDATE=ON` is additional validation, not a substitute for active `B3_ASSERT`.

Only the reviewed GNU/Clang flag family is admitted; a future runner must still record and inspect actual `compile_commands.json`, compiler/toolchain versions and artifact identities. The intended build is single-threaded float32 SIMD (AVX2 off), with no profiling/sample/test dependency downloads. Core and control must use the same actual compiler/options and independent fresh stage/build/output directories. Do not execute these commands until native build/execution is separately authorized:

```sh
# Use the authorized toolchain's CMake wrapper when targeting Emscripten.
cmake -S "$IDENTITY" -B "$NEW_CANDIDATE_BUILD" -DCMAKE_BUILD_TYPE=Debug \
  -DAIR_SOURCE_ROOT="$SOURCE_ROOT" -DAIR_IDENTITY_CORE="$NEW_CANDIDATE_STAGE"
cmake -S "$IDENTITY" -B "$NEW_CONTROL_BUILD" -DCMAKE_BUILD_TYPE=Debug \
  -DAIR_SOURCE_ROOT="$SOURCE_ROOT" -DAIR_IDENTITY_CORE="$NEW_CONTROL_STAGE" -DAIR_IDENTITY_CONTROL=ON
cmake --build "$NEW_CANDIDATE_BUILD" --target air_box3d_identity_contract
cmake --build "$NEW_CONTROL_BUILD" --target air_box3d_identity_contract
# Retain both actual stdout/stderr and process exit status; execute the produced
# native binary, or run its .cjs with the same Node for an Emscripten build.
node "$IDENTITY/compare-ledgers.mjs" "$CANDIDATE_STDOUT" "$CONTROL_STDOUT"
```

The comparator expects each actual stdout file to contain its single final JSON record. Failure, abort, stderr or nonzero exit cannot be converted to PASS by extracting a record; the supervising runner must preserve and validate process completion as well. Comparator-only success does not authenticate native execution, toolchain equivalence or source provenance. All such runtime results remain **NOT_RUN** for this source/CPU batch.

## Remaining production work

After actual native identity qualification: implement empty-container restoration, acknowledge both event buffers at the real release tail, integrate versioned diagnostics/status/backend/app hooks, and run a fresh original strict same-app/world 100-scene C20 attempt. Keep original fixture/baseline and failed attempts unchanged. Do not force new initial ledger bytes to historical 36040. No floor setter, trim, cross-world raw-ID ABA repair, SDK activation, hidden identity storage, baseline exemption, warmup or acceptance relaxation is supplied here. Current C20 remains strict FAIL / zero qualified.
