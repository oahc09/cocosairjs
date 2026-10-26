# Same-world empty-storage reclamation: design and bounded CPU proof

Status: **DESIGN / CPU MODEL ONLY. No core change, compiler, native execution or physics run is supplied here.**
The scope is the original same-app, same-world, 100-scene C20 lifecycle. This is not a new acceptance policy, a generic live-world compactor, an unbounded-handle guarantee, or a cross-world raw-ID repair.

## Evidence and goal

The SDK227 tree-ledger run observed world-ledger bytes `36040 -> 108708 -> 112980`; the released-minus-initial difference is `76940`. Its released live body/shape/contact/joint counts were zero and resource snapshots were empty. The original strict comparison still failed, with zero qualified cycles. The separate module requested-byte ledger was `167320 -> 239624 -> 243480`; native world/global bridge bytes were `48 -> 224 -> 48`. These are distinct accounting scopes, not terms to add into a total.

The retained run is `c20-app-memory-attempt-3-sdk227-tree-ledger`; its diagnostic journal SHA-256 is `6deacad0a720f6b59b96e5e3cc575077557f09cdc6060ad818dbac2523aa0727`. The outcome reports were published at `65730a3adb4c8fc588c7aa2c4a412ba9f891dc7c`. Earlier SDK225/226 failures remain failures and are not retroactively reclassified by this design.

The implementation goal is to release eligible storage after scene teardown, keeping the **same native world object, world ID/generation, application, factory and module**, with no extra step. Preserve configuration, callbacks/user contexts, `stepIndex`, and historical maximum-workload diagnostics. Compare release against that implementation's actual original pre-scene snapshot using the unchanged fixture assertion.

`36040` is a historical observation, not an adjustable budget. New fixed identity metadata must exist and be accounted for from initial world creation. Consequently a future correctly measured initial amount may differ. Do not alter the fixture, inject warm-up, replace the baseline, offset categories to hit `36040`, or hide retained identity storage outside the ledger. If literal historical `36040` is also required, compatibility is unproven; do not declare PASS by changing accounting.

## Source-grounded constraints

The pinned core is `efca0c184d40fd6a82016983f1601c4d23965867` plus the locked patch chain. Relevant source locations are the staged equivalents of:

- `src/physics_world.c`: `b3CreateWorld`, `b3DestroyWorld`, `b3GetWorldByteCount`, event getters, world/body/shape/joint/contact validity checks. There is no public world-wide trim/reset API. `b3World_RebuildStaticTree` is not one.
- `src/body.c`: create initializes a new slot then increments generation; destroy explicitly preserves the slot generation. `shape.c` and `joint.c` follow the same pattern.
- `src/contact.c`: contact generations are uint32, but current creation uses `int generation = contact->generation; ... generation + 1`. This conversion/addition is unsafe above the signed range and must be corrected, not copied.
- `src/id_pool.c`: `nextIndex` plus the free-ID array retain retired slots. Clearing the pool and slot arrays loses their generation history.
- `src/container.h` / `src/core.c`: `Reserve` only grows; `b3GrowAlloc` asserts `newSize > oldSize`. Neither is a shrink primitive. The allocator currently asserts on failure; it is not evidence of transactional OOM recovery.
- `src/solver_set.c`, `constraint_graph.c`, `broad_phase.c`, `dynamic_tree.c`, `verstable.h`: there are private component destruction/creation helpers and an empty-map shrink helper, not a complete safe-world reclamation operation.

A simple `memset`, destroy/recreate-world trick, or unguarded `Destroy + Reserve` of object slots is rejected. Core object IDs contain `world0` but not the world's generation. This proof applies only within one world lifetime; it intentionally makes **no claim about raw-ID ABA after destroying and recreating a world**.

## Identity invariant without changing ID widths

Use separate per-family state for body, shape, joint and contact. Body/shape/joint generations have maximum `2^16-1`; contact has maximum `2^32-1`. Use explicitly unsigned arithmetic of sufficient width, never signed intermediate increment or truncation.

For each family `k`, keep fixed-size world-owned metadata:

- `H[k]`: maximum generation ever successfully issued during this world lifetime;
- `F[k]`: generation floor used to initialize every new slot since the last successful reclamation.

Initially both are zero. Metadata is not a growing tombstone list. Its actual fixed footprint, plus any saved creation-capacity policy, must be visible from the initial accounting contract; final field layout/bytes remain an implementation decision. The CPU model's growing `issued` collection is **ghost proof history only**, forbidden as a hidden production allocation.

### Allocation

1. Before modifying any pool, array, solver set, graph or body linkage, determine the selected free/new slot and its current generation. This must include creations requiring a new sleeping solver set.
2. A new slot starts at `F[k]`, including slots at newly grown high indices. A recycled slot starts at its retained generation.
3. If the candidate is already MAX, refuse before increment. Otherwise issue `g = candidate + 1` using checked unsigned arithmetic, and set `H[k] = max(H[k], g)` only as part of successful commit.
4. Never wrap. Do not consume a globally unique counter for every individual object; unrelated slots may share a generation because the ID also contains the slot index.

### Empty-world reclamation

Preflight requires `H[k] < MAX[k]` for all four families. **H == MAX refuses before any mutation**, even if there are no live objects: a reclaimed world must be safely reusable.

Once all other preconditions below hold, set `F[k] = H[k]` and discard eligible retired slot/pool storage as one committed operation. Do not reset H. Every subsequently issued generation is greater than every generation issued before that boundary. During an epoch, repeated reuse of one slot strictly increments its generation. Therefore an old `(slot, generation)` pair cannot be issued again in the same world lifetime, until bounded exhaustion is explicitly refused.

A seed based only on the previous trim floor, only current live objects, or only low slots is insufficient. Scanning current generations at trim is insufficient unless all prior increments were already checked against wrap and lifetime H was preserved. Existing worlds cannot be silently migrated to this policy without such provenance.

### Failure and internal contacts

Public body/shape/joint creation must preflight generation exhaustion before its **first** mutation, or use an explicitly implemented staging/rollback transaction covering ID allocation, array growth, ownership, sims and links. Returning failure after consuming an ID or publishing an orphan is not allowed. The model demonstrates the desired publication contract, not that current C allocation helpers satisfy it.

Contact creation occurs inside a step and currently returns void. Contact exhaustion must propagate a dedicated fault to the world/step/bridge/backend, not silently skip collision creation or report a successful step. Previously completed parts of the step may already have mutated physics: do not claim whole-step rollback. Stop scheduling/finish outstanding tasks, reach a reliable unlocked teardown path, suppress publication of a successful partial snapshot, reject future simulation/creation, and retain destruction/close capability. The C implementation must prove this propagation before enabling reclamation in the app.

Allocation failure during reclamation likewise needs an explicit policy: preallocate replacements before commit with real cleanup on failure, or a documented fatal/fault path supported by the allocator. No recoverable-OOM guarantee follows from the present `b3Alloc` assertions. Precondition/exhaustion refusals must always be mutation-free.

## Quiescent boundary and events

The backend entry is not a public arbitrary-state mutation shortcut. It requires valid/unlocked world, no active/enqueued native work, no pending owner command or unresolved geometry operation, and an idle ready backend. Verify native pools and owned structures, not only copied four-count summaries:

- body/shape/contact/joint live counts zero; no sensors/compound shapes;
- no live island or sleeping-set ownership; all solver sim/state/contact-index/island arrays empty;
- all graph color contact/joint counts zero, manifold allocations zero;
- all three tree proxy counts and pair-set count zero;
- empty hull database and no outstanding world resource leases, borrows or bridge handles;
- no pending native event views or owner dispatch references.

Event reads are not acknowledgements. In the observed released world, `bodyMoveEvents` still had length/capacity 46 and one sensor-end buffer retained one record. The core clears move/begin/hit/joint events at step preparation and flips/clears one end-event buffer at step completion. Destruction can enqueue an end event into the other buffer. Thus “four live counts zero” does not establish “all events consumed.”

Integrate an explicit teardown acknowledgement after the backend has copied/delivered required events or discarded only the retiring scene's events under its documented lifecycle contract. Handle **both sensor-end buffers and both contact-end buffers**; do not deliver old-scene callbacks to a new scene, invent callbacks, or clear unrelated-world data. Previously published immutable JS copies remain unchanged. Define invalidation of native transient views/snapshot capabilities and advance the binding mutation revision where necessary; do not increment/reset the native step index.

The app hook belongs **after scope disposal, scene destruction and deferredDestroy completion, before the successful `releaseScene` receipt**. A scope disposer is too early. Do not add a dummy/zero-duration physics step. A refused or failed reclamation must remain visible; the release path must not claim successful memory restoration.

## Storage restoration plan

Targets come from the actual creation policy and initial `b3WorldDef.capacity`, never the observed byte delta or `GetMaxCapacity` history. Prefer shared core initialization helpers so constructor and restoration cannot drift. The eventual operation must account for every relevant ledger term, not just today's seven nonzero differences.

| Observed released ledger increase | Mechanism and required conditions                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| solver sets: 38656                | With every owned array empty, reclaim excess body sims/states, joint sims, contact indices and island sims; restore constructor reservations. Preserve reserved static/disabled/awake set indices 0/1/2. Do not call `b3DestroySolverSet` on these and leave their IDs freed.                                             |
| world arrays: 16512               | Island slots/links can be reset only after all internal references disappear. Body/shape tail slots require the generation-floor protocol. Joint/contact slot policies require the same protocol even though they did not grow in this run. Restore paired `fatAABBs` consistently.                                       |
| tree: 12348                       | With zero proxies and no traversal/task references, destroy/reinitialize empty tree storage at creation capacities. Clear internal node/proxy free lists coherently; reclaim swap/rebuild scratch. The ledger includes inactive leafBoxes/binIndices estimates, so this amount is not the physical freed allocation size. |
| graph: 7104                       | Empty per-color constraints permit reclaiming joint/contact arrays and restoring creation bitset reservations/empty contents. Preserve graph structural invariants.                                                                                                                                                       |
| events: 1848                      | Only after the explicit acknowledgement, release/re-reserve all event arrays according to constructor floors. Clear both end-buffer roles coherently without pretending a new step occurred.                                                                                                                              |
| ID free lists: 384                | Body/shape list reset is coupled to generation-safe slot reset; preserve reserved solver-set IDs. Internal island IDs need no public generation protocol but require all internal references cleared.                                                                                                                     |
| hull map: 88                      | With size zero and no references, existing `b3HullMap_shrink` can release buckets while preserving the map object. Never drop live hull keys or references.                                                                                                                                                               |

Also review initially unchanged ledger categories: sensor-owned arrays, manifold block allocators, task arrays/bitsets, debug bitsets and stack storage. Reclaim only unused storage and restore their actual creation floors. Keep last-step or historical diagnostic scalars where their contract requires it. Do not destroy scheduler/mutex/callback registrations, reset world lifetime identity, or free user-owned pointers.

Excluded allocations remain separate, truthful observations. Reclaim paired owned arrays such as `fatAABBs` consistently, but do not promise that module tracked bytes, worker arenas, generic malloc, WASM memory or RSS equal the world ledger or return to zero. Do not clear another world's shared mesh ownership. The initial/active/released journal must retain all scopes independently.

## Bounded CPU proof and limitations

Run from the repository root:

```sh
node --test tools/physics/box3d/empty-world-trim/generation-model.test.mjs
```

The model exhausts all reachable states in three finite domains: 2-bit/2-slot, 2-bit/3-slot, and 3-bit/2-slot, including create, free/reuse, trim and preflight/staging-failure transitions. It checks lifetime H, unique issued `(slot,generation)` pairs, pool consistency, unchanged world identity/step, and nonpublication on refusals. A state-limit hit fails; it is not reported as complete.

Separate tests cover 100 modeled empty releases, newly regrown high slots, locked/tasks/event-ack refusal, 16/32-bit arithmetic boundaries, contact fault with surviving-object teardown, and counterexamples for three wrong seed strategies. This is a per-ID-family proof; applying it to four families assumes separate correct family dispatch. IDs/worlds are not modeled as security capabilities.

The model does **not** run Box3D, C integer operations, allocators, threads, event dispatch, scene teardown, physics or real memory accounting. Its contact fault is an abstract publication rule, not proof of actual locked-step unwind. The 100 modeled releases are not C20 qualification. No cross-world raw-ID validity or generation-wrap recovery is proved.

## Minimal staged implementation and stop conditions

1. **Design/model (this change).** Review identity invariant, event acknowledgement and exact accounting contract. Deliver only this document and two pure CPU model files. No production gate inventory changes yet.
2. **Core identity safety.** Implement checked per-family creation generations, fixed H/F state and explicit accounting; repair contact signed intermediates and fault propagation. Native tests must prove initial/reused/high-index IDs, every overflow boundary, creation failure rollback and faulted teardown. Stop before adding reclamation if any path silently wraps, mutates on preflight refusal or loses contacts without a fault.
3. **Empty-storage operation.** Add the restricted core operation and native/ABI fixture. Test every precondition, both event-buffer roles, actual tree rebuild/contact/joint/mesh/sleeping-set lifecycles, repeated reclamation, same-world identity/step/configuration, stale raw IDs, and two-world isolation. Check complete classified sum against core and compare initial/released storage under the unchanged equality rule. Test actual allocation-failure behavior; do not infer it from the CPU model.
4. **Backend/app integration.** Wire the acknowledged post-destruction/pre-receipt hook, precise mutation revision, copied-view invalidation and release failure reporting. Add source/CPU lifecycle ordering tests, then build fresh native assets and SDK with new exact schema/source fingerprints. Update producer, audit, assets, source controls, command expectations and consumers together; preserve every prior required gate. No approximate counts or recycled old reports.
5. **Original C20 closure.** Run a new protected attempt with the original same-app/world 100-scene fixture and its strict original-pre-scene baseline assertion unchanged. Preserve initial/full/released diagnostics, all 100 qualified-cycle assertions, resource/ID/event checks, real app close and process closure. Stop on first failure, retain raw evidence, and diagnose; no warm-up, automatic retry, baseline replacement or replacement module. Success here does not establish broader C20/I05/I06 coverage or unavailable after-close module probes.

A smaller cleanup of only non-ID caches is possible, but cannot honestly promise exact initial-baseline restoration. The recommended complete route is the bounded identity-safe operation above. It is ordinary work in the authorized repository, not permission to expand into cross-world ID redesign, change acceptance, install tools, launch cloud jobs or run unapproved physics attempts.
