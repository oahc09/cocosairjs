# Identity-safe same-world reclamation: source foundation

Status: **independent source candidate; not activated in production; C/native/WASM NOT_RUN; trim and app unchanged.**

This is a new reconstruction after execution-environment loss, not recovery of the historical `42c3dad...` candidate. Its source, hashes, tests and receipts must be measured anew. The historical source-only review is not qualification for these bytes.

## Exact source boundary

The fixed upstream core is `efca0c184d40fd6a82016983f1601c4d23965867`. The complete ordered three-patch production prefix is `4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c`. `patch-lock.json` appends one candidate patch with exact file before/after hashes. `profile.mjs` reuses the existing `patch-intake.mjs` validators/application grammar, authenticates all 111 imported core files, and applies patches without fuzz, offsets or vendor edits. Nine core files change.

The source-input root must contain that reviewed production prefix, its facade identity and original source manifest. This profile is deliberately separate from `versions.lock.json`, production `patches/lock.json`, build schedule, schema and SDK. Its new chain identity must never be substituted into an old module manifest. Existing production 37/92/84/55 inventories and owned-files inventory are not updated or declared globally correct by this addition.

## Four-family invariant

The world owns fixed `uint32_t high[4]`, `floor[4]` and one sticky contact-fault word. Body, shape and joint generation width stays 16-bit; contact stays 32-bit. No production trim or floor setter exists in this batch, so normal floors start and remain zero.

`high` is monotone throughout this world lifetime. Every new slot, including a high index, starts from its family floor; a recycled slot retains its previous generation. Checked unsigned increment refuses `previous >= MAX`, invalid floor/history ordering, or an already faulted world. Commit updates high before an identity can escape. There is no rollback API. Once observed by a callback/cache/caller, an identity must never be made reusable by rolling back history. Creation also guards ID/edge-key integer range where needed.

Public generation-exhaustion refusal occurs before the first creation mutation: body before locking/sleeping-set allocation; shape before locking/cooking; joint before removal of contacts between its bodies. All nine joint constructors propagate a null pair. New shape slots preserve the floor if the pre-existing checked transformed-hull bake fails, so a later same-slot retry cannot start from zero.

This does not introduce a general OOM transaction: the existing allocator's fatal/asserting policy is unchanged. Existing invalid-geometry failures may retain slot/capacity storage without publishing an ID. The later native fixture must exercise that actual failure path; source matching alone does not prove it.

A future trim must reject H == MAX in every family before mutation, set floors from lifetime high-water, and retain high. Nothing here repairs raw-ID ABA across destroying and recreating a world.

## Internal contact fault

Contact creation no longer converts the generation to signed int. Exhaustion sets a sticky world fault before consuming an ID or attaching contact links. The deterministic pair loop stops, takes its normal two stack frees, and Step joins any outstanding tree task before unlocking. Previously committed contacts remain owned and destructible; there is no whole-step rollback. Collide, solve, sensors, end-buffer flip and successful state-hash recording are not performed on this exit. The existing attempted-Step input recording may already exist.

`b3World_HasIdentityFault` is an additive readonly query; invalid world also returns true. Step and object creation refuse a faulted world, while destruction remains available. The four core event getters return empty event views after fault. This does not freeze every raw-core mutator.

**Production bridge integration is still missing in this batch.** Existing production `air_b3_world_step` calls void Step and returns OK; it must not be linked against this candidate without a reviewed status bridge. The next independent fixture increment must test the actual patched bridge function returning non-OK after `HasIdentityFault`, plus backend failure/close integration before production activation. No source-only result here is an end-to-end fault-propagation claim.

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

Staging writes only a fresh destination plus a sibling receipt. Control mode records the actual original prefix identity, never the candidate identity. Verification rejects changed/missing/extra files, symlinks and overwritten prior staging. Tests mutate only their own temporary source fixtures; none compiles or runs C/physics. Source negative controls remove checked wrap/history, slot floor, metadata accounting, task settlement or unsigned contact assignment and must fail. Run the separately committed `generation-model.test.mjs` as bounded algorithm proof support, not C validation.

## Next bounded increment, still required

Prepare a separately gated native executable and the minimal exact bridge-status patch. Native coverage must include all four families, high index/reuse/stale IDs, MAX boundaries and contact crossing INT_MAX, actual failed transformed-hull bake then same-slot retry, and a real Step that creates one contact before a second exhausted slot faults. Use a real deferred tree callback to prove join/unlock, preserve prior issued identities, reject further simulation/creation, isolate another world and destroy/close with tracked global bytes back to the pre-test value. Test-only injections must never become production exports.

Lock Debug and inspect actual compilation commands for absence of NDEBUG: BOX3D_VALIDATE alone is not proof that B3_ASSERT is enabled. No compiler or native contract is supplied as executed evidence in this source batch. The previous lost 171-assert fixture specification is a reconstruction requirement, not an executed result or a substitute for current source review.

After native identity qualification: implement empty-container restoration, acknowledge both event buffers at the real release tail, integrate versioned diagnostics/status/backend/app hooks, then run a fresh original strict same-app/world 100-scene C20 attempt. Keep original fixture/baseline and failed attempts unchanged. Current C20 remains strict FAIL / zero qualified.
