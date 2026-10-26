# C20APP v2 read-only memory observer — source-only v1

This small **library adapter is not an executable consumer/launcher**. It prepares
observation code while new ST/SDK artifacts are being produced. No SDK, native
physics, build, browser, installation or runtime acceptance was executed here.
The expected build number `226` is an admission requirement, **not an observed
compilation**. SDK225 and the old `ce98…` schema must not be used.

## Frozen inputs and unchanged acceptance

- Import the already published APP v2 `fixture.mjs` and its `contract.mjs` directly
  from the supplied source root; do not copy, patch or fork their implementation.
- `profile.mjs` pins the exact published v2 fixture, contract, host, consumer and
  inputs bytes from commit `f1380eb96809c3a24e7f2ec024f4cdeebefb327e`.
- The diagnostic schema is
  `bef78296f8fff850570799c65d6f4b0a47115cf38aed898a58cf88275348fd84`, from reviewed
  diagnostic source manifest
  `a1f456db669fa3005437798e0d8c4e6c3c07c7134d7d21a52cd62df0f9d67382`.
  The observer reads the 87 row definitions from those hash-verified schema bytes;
  it does not create another native layout or expose native pointers.
- One app, one public step clock, 100 scene cycles, 50 bodies / 50 shapes /
  3 Terrain users / 1 fixed joint, qualified isolated primitive events, original
  initial baseline and first-failure stop remain entirely in the original fixture.
  No warmup, trim, world rebuild, averaged baseline, private step or retry is added.
- The existing pre-mount construction failure cleanup limitation remains: normal
  app close is not proof that unattached/unowned scene objects were reclaimed.

## Three synchronous observation points

The new consumer adapter changes only the `record` function passed to
`runSceneCycles`. The primary record executes first, with its original objects,
then the observer reacts to exactly these existing record names:

| Original record                    | Original state                                                              | Diagnostic                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `original-pre-scene-baseline`      | Before scene construction and any step                                      | Same live world's initial snapshot                                   |
| `nonempty-native-scene`            | After completed public steps and committed original native snapshot         | Nonempty live counts, capacity rows, resource ownership              |
| `released-cycle-before-validation` | After awaited public release and original snapshot, before strict assertion | Released scene snapshot, even when the next original assertion fails |

No getter is called from event callbacks, during a step, from close records, or
once this adapter is sealed. The same backend object, world ID and binding
generation are required throughout. Native step/revision must not regress;
public step and native step are recorded separately, not silently equated. The
binding revision is a facade snapshot-invalidation revision, not a complete
allocation epoch; unchanged step/revision does not prove no allocation. Numeric
world IDs alone do not prove same-module identity: unchanged backend/factory and
the future exact producer receipts are also required. Initial native step zero
is a property of this fresh fixture, not a promise for every ready world.

`getNativeMemoryDiagnostics()` is called once per reached safe point. It neither
flushes nor steps. The copied observation must match the immediately preceding
original four counts, byte ledger and mesh resources; all 87 row IDs/names/units,
row byte sum and identity are validated. Bigints become exact base-10 JSON strings,
not JS Numbers. Valid and serializable invalid returns are retained in the
side journal/report, with observer errors separate from original fixture errors.

## Two independent results

`report.memoryDiagnostics.status` reports only side-observation coverage:

- `COMPLETE_REACHED_SCENE_SNAPSHOT_SETS`: initial baseline plus active/released
  snapshots for every reached observed scene, with no observer/journal error.
  This may be only **one** scene. It is not 100 cycles and not a C20 PASS.
- `PARTIAL`: no complete initial/active/released set.
- `DIAGNOSTIC_FAILURE`: getter, identity, accounting, ordering or side-journal
  failure. The original fixture still runs its unchanged assertions.

`preserveFixtureOutcome` returns the original fixture return value or propagates
its original Error object unchanged. It does not change `report.status`,
`report.profile`, `completedCycles` or any baseline. An original strict failure
and complete diagnostics therefore coexist. The future launcher must report the
strict result and diagnostic result independently; a diagnostic failure must not
be presented as a fully successful diagnostic attempt even if strict C20 passes.

The after-close observation is **UNAVAILABLE**: no private module access,
replacement factory, second module or post-close getter is allowed. Existing
normal-close and full descendant/ECHILD receipts remain separate evidence.

## Accounting boundaries

- `worldLedger`: original pinned world **capacity ledger**, not live object
  payload, module allocator total, WASM heap or RSS. Row storage lengths are not
  a global native-handle census.
- `moduleCoreTrackedRequestedBytes`: a separate same-module native counter;
  never substitute it for the original strict `liveBytes` assertion.
- `nativeWorldBridge` and `nativeGlobalBridge`: separate bridge accounting;
  neither is added into `worldLedger`.
- `excludedObservations.workerArenaBackingCapacityBytes`: explicitly outside the
  world ledger. Do not attribute a world-ledger difference to this number.
- Worker arena exclusions, unavailable observations, facade scratch and mesh
  lifecycle/resource details are retained as returned. A complete row sum is not
  proof of all native memory coverage or post-close leak freedom.
- New observations cannot precisely explain the older SDK225 v1/v2 attempts.
  Both historical failures, their raw evidence, and zero qualified cycles remain.
  This adapter does not establish full C20, I05 or I06.

## Integration still pending actual artifacts

The original `consumer.mjs` is not changed. A future separately reviewed consumer
will replace its single `runSceneCycles(...)` call with
`runObservedSceneCycles({ sourceRoot, sdk, app, report, record, appendDiagnostic })`.
`appendDiagnostic` must synchronously append JSON to a fresh exclusive
`memory-diagnostics.raw.jsonl`, separate from `observations.raw.jsonl`; preserve
and hash that journal even on strict failure. The existing create/close handling
and original fixture return callback remain in that consumer, not this adapter.

Before running, it still needs all of the following; no placeholder lock or
fake receipt is generated by this source-only candidate:

1. Real new-schema ST build/readiness and source-to-binary receipt, plus fresh
   ESM226 and corresponding DTS226 receipts. Verify new native diagnostic export
   and exact product/schema/source identities, not merely a claimed build number.
2. A new profile input lock that binds the original imported v2 bytes, these new
   adapter bytes, actual source/schema, SDK/ST bytes and producer receipts.
   Original v2 `inputs.mjs` hardcodes the old schema and cannot admit the new build.
3. Original uninstrumented host/factory; no test doubles or second module.
4. Source review/publication and explicit one-attempt runtime authorization.
5. Existing outer audited all-descendant supervisor: CPU 30 s + consumer 300 s,
   outer wall 334 s, original close 4 s, sampled descendant RSS 2 GiB, total output
   64 MiB (main 56 MiB + preparation 8 MiB). The side journal fits **inside** that
   same allowance. A budget/diagnostic failure never triggers automatic retry.

## CPU-only controls

Set `BOX3D_ORIGINAL_APP_SOURCE_ROOT` to the existing original source root,
`BOX3D_DIAGNOSTIC_SOURCE_ROOT` to the reviewed diagnostic candidate source, and
`BOX3D_APP_V2_FAILURE_JOURNAL` to the retained original v2
`run/result/observations.raw.jsonl`; then run Node22 `--test observer.test.mjs`.
These tests instantiate only JS mock diagnostic snapshots. They check exact
schema/original-file identities, SDK225 rejection, instrumentation rejection,
safe hooks, same-world/epoch checks, accounting/resource negatives, bigint
precision, incomplete diagnostics, no after-close queries, and preservation of
both primary and observer errors. A read-only CPU replay invokes the original
contract on the retained failed v2 row: `36040 != 112980` still fails. Mock values
and this replay are not a new physics run or an explanation of its byte delta.
