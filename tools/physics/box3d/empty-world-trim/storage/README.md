# Same-world empty-storage candidate

**Independent source/CPU candidate; production NOT_INTEGRATED. Native and WASM execution of these bytes are NOT_RUN until separately recorded.** The previous identity-only host 170/control 4 result is not evidence for this new patch. Neither a core-loop test nor host execution qualifies the original APP C20 fixture.

## Boundary and identity

This profile preserves the complete four-patch identity prefix (`2334e8948b294ec08c09cc5c7b0c0336bbd82d5eda0ae06acb481fcc85ef1932`) and appends one exact four-file patch. `profile.mjs` imports the original strict identity staging, authenticates its vendor/bridge inputs, and applies the new before/after hashes without fuzz. The original vendor, production locks, identity profile and old evidence are unchanged. The control is **identity-only**, not unpatched upstream.

`b3World_TrimEmptyStorage(world, acknowledgeRetiredEvents)` is a restricted core operation, not a production bridge export. It keeps the same native world address/ID/generation, module, configuration, scheduler, mutex, callbacks, step index, end-buffer role, public last-step state and lifetime maxima. It never calls CreateWorld, DestroyWorld or Step. No APP fixture, acceptance comparison or baseline is changed.

The world stores its creation `b3Capacity` (20 bytes), explicitly included in its ledger from creation alongside the existing 36-byte identity history. Both constructor and trim call the **same** storage initializer; no capacity is inferred from 76940 or any observed report. Default and nondefault capacities must compare release with their own actual initial snapshot. The historical WASM 36040 and identity host 37476 are not target budgets.

## Refusal and acknowledgement

All refusals precede locking, allocations, F changes, event clearing and frees: invalid/locked/faulted world; tasks or stack allocation/index/entries; moved-sibling or pending split-island work; active recording; nonempty public pools/sensors/compounds; exhausted H; inconsistent family history, retired slots, islands, three reserved solver sets, tree proxy counts, pair set, graph ownership, manifold allocations or worker layout. H == MAX refuses without resetting history. Successful commit sets each F to H and never changes H.

A false acknowledgement refuses if **any** of the nine event arrays has retained records, including both sensor-end and both contact-end buffers. True acknowledgement explicitly retires those arrays without dispatch, synthesis, step or role flip. This is permission from the caller, **not proof** that JS dispatch, event copies or borrowed native views are quiescent. The future backend must establish an exclusive safe point, retire all transient views, settle pending commands/resources, and account for the binding revision before using this operation.

Joined worker scratch (sensor hits/pair keys/bitsets/debug records) and graph stack-borrowed pointers may legitimately retain previous-step values. They are not treated as live entities; after the safe-point contract they are invalidated by storage replacement. A non-NULL graph scratch pointer alone is not a refusal. Names are independently owned and are released only with an empty world and no active recording; they are not forgotten just because body slots disappeared.

## Storage commit and accounting

Replacement storage is fully constructed before any old storage is released. Only an explicit list of 35 owned fields is transferred; the world itself is not overwritten. Cleanup covers nested solver/island storage, all ID free lists, trees and pair set, manifold blocks, hull map, paired fat AABBs, name strings/map, worker arrays/arena backing/overflow state, debug bitsets, event buffers and stack. Reserved solver set IDs 0/1/2 are recreated exactly by the constructor policy.

`stack.maxAllocation`, each arena's lifetime `peakDemand`, and the world's max-capacity/profile/inverse-step/task-count fields remain unchanged. Per-worker per-step profiling/debug scratch is retired; this is not an all-bits-unchanged operation. Stack growth on a later Step may use its preserved historical maximum and grow again, so trim does not promise permanent absence of later allocations. The fixture must exercise trim → later real creation/Step → release/trim. A changed public worker count is preserved, not silently restored to the creation count; exact old-baseline equality is qualified here only with fixed worker configuration.

World capacity ledger, actual module tracked requests, external mesh ownership and worker arenas are different scopes. Tests may verify their respective baseline equalities in an isolated fixture, but never sum or equate those metrics. No metadata is moved outside accounting, no history cache is hidden, and no general malloc/WASM-heap/RSS leak claim follows.

## OOM policy

The existing allocator was asserting/fatal on failure, not a recoverable transaction. This patch adds an unconditional `abort()` for NULL from both custom and platform allocation paths, including NDEBUG builds and a continuing assert handler. It does not return a success/failure enum from a half-restored world or claim rollback/close is available after fatal OOM. Normal allocations keep the same requested-byte definition and alignment.

The test-only `--oom` mode uses the public allocator hook from process start, creates and retires real objects, then returns NULL during replacement allocation while its assert handler returns zero. A host supervisor must retain actual stderr, require the armed/NULL markers and SIGABRT (not timeout/kill or an enum return), collect ECHILD and verify source drift. This is an intentional fatal subprocess, never a successful production process-close result. WASM requires separately captured abort semantics; host SIGABRT is not WASM qualification.

## Source validation and future execution

```sh
AIR_STORAGE_SOURCE_ROOT="$SOURCE_ROOT" node --test "$STORAGE/source-contract.test.mjs"
node "$STORAGE/stage.mjs" --stage "$SOURCE_ROOT" "$FRESH_CANDIDATE_CORE"
node "$STORAGE/stage.mjs" --verify "$SOURCE_ROOT" "$FRESH_CANDIDATE_CORE"
node "$STORAGE/stage.mjs" --stage-control "$SOURCE_ROOT" "$FRESH_CONTROL_CORE"
node "$STORAGE/stage.mjs" --verify-control "$SOURCE_ROOT" "$FRESH_CONTROL_CORE"
```

Staging refuses existing output and validates exact 111-file closure, sibling receipt and complete three-function identity bridge adapter. It is not compilation. The source controls and synthetic parser controls are not native/physics evidence. Continue to run the identity source controls and bounded generation model separately; their historical PASS is not reused.

The independent CMake entry requires single-config Debug and inherits the exact effective-NDEBUG forced header for every core/adapter/fixture translation unit. A future authorized runner must use fresh candidate/control directories and the same toolchain, record actual compile commands/identities, and preserve failure logs. Configure using `AIR_STORAGE_CORE`, `AIR_SOURCE_ROOT`, and `AIR_STORAGE_CONTROL=ON` only for the identity-only control. Build target: `air_box3d_empty_storage_contract`.

`native-contract.json` fixes the current source's natural 3661 assertion count/groups (identity-only control: 2), not a runtime PASS. The real lifecycle source covers default and nondefault creation capacities (one/two worker contexts with synchronous external tasks, not MT proof), 50 bodies, hull/sensor/joint contacts, 100 same-world core cycles and regrown high indices in all four ID families, caller-owned mesh reuse across worlds, sleeping/disabled solver sets, and readonly refusal integrity. A separate explicitly private-injection group tests all nine event arrays under both end-buffer roles; those injected records are not claimed as physics-generated events. `compare-results.mjs CANDIDATE_STDOUT CONTROL_STDOUT HOST_OOM_RECEIPT` checks exact identities/keys/groups, measured initial ledger delta 20, isolated post-close tracked bytes, 100 same-world **core** cycles and the distinct host fatal-OOM result. The OOM receipt has exactly `profile`, `exitCode`, `signal`, `stdout`, `stderr`, `physicalClose`. Normal stdout must be its single final JSON record; the supervising runner must separately require normal candidate/control exit 0, authentic source/toolchain binding and closed process trees. A parser cannot manufacture execution evidence.

## Still not supplied

Production metadata row/schema/layout and all exact inventories; full bridge/backend fault and resource/lease admission; JS event-copy/view revision; post-scope/disposal/scene/deferredDestroy release hook and failure receipt; WASM/SDK qualification; original strict same-app/world 100-scene C20. Legal nonempty persistent worlds must skip the empty operation without reporting restoration. Do not treat an eligible-empty refusal as successful release restoration. Cross-world raw-ID ABA, general recoverable OOM and live-world compaction remain out of scope.
