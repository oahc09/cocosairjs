# C20APP memory capture: two retained failures — 2026-10-26

**Neither attempt qualifies C20.** Memory attempt 1 stopped before runtime with
`NOT_READY`. Attempt 2 ran the original scene fixture, then stopped at the first
strict byte-baseline failure: **0 qualified cycles**. Its separate diagnostic
result is also **FAIL: only 1 of 3 snapshots validated**.

## Actual attempt outcomes

| Memory attempt       | Runtime                                   | Strict result            | Memory diagnostic result                       |
| -------------------- | ----------------------------------------- | ------------------------ | ---------------------------------------------- |
| 1, fixture `6ac7d2e` | Not started; no lock, CPU suite or app    | NOT_RUN                  | No snapshots                                   |
| 2, fixture `3048ffe` | 1 app, 1 attempted scene, 58 public steps | FAIL, 0 qualified cycles | Initial succeeds; nonempty and released reject |

Attempt 1 paired an independent execution-source verifier with an external ST
root. Its exact compiled-source inventory check rejected the path mismatch.
Attempt 2 used the byte-identical full ready ST copy at its original relative
output location and the actual producer root through the product's supported
`provenanceRoot` option. The gate and original audit bytes were not weakened or
rewritten. Attempt 1 remains NOT_READY; it is not a later PASS.

Attempt 2's fresh freeze and **153/153 CPU controls passed** before its consumer
ran from **12:34:24.896 to 12:34:28.414 UTC**. These preconditions do not turn its
subsequent strict or diagnostic failure into success.

## Three reached points, only one returned diagnostic

The original `getNativeCounts()` snapshots and the new diagnostic getter are
separate observations:

| Public step / point | Bodies / shapes / contacts / joints | Original world capacity ledger | New diagnostic                               |
| ------------------- | ----------------------------------- | ------------------------------ | -------------------------------------------- |
| 0 / initial         | 0 / 0 / 0 / 0                       | 36,040 B                       | 87 rows returned and validated; sum 36,040 B |
| 7 / nonempty        | 50 / 50 / 0 / 1                     | 108,708 B                      | `AIR_E_BOX3D_ABI`; no payload returned       |
| 58 / released       | 0 / 0 / 0 / 0                       | 112,980 B                      | `AIR_E_BOX3D_ABI`; no payload returned       |

Both later errors report **“Native memory diagnostic accounting is
inconsistent.”** They occur inside the real SDK226 native-status handling before
returning categories, module bytes or bridge counters. Native status 13 is
inferred from the pinned facade's exact message mapping; it was not separately
recorded as a numeric raw field. No stale scratch, zeros, second module or
post-close query filled the missing values.

The raw `completeSceneSnapshotSets: [1]` field means the two scene hook names were
reached. It is **not** a successful three-point set: the explicit raw status is
`DIAGNOSTIC_FAILURE`, with 3 attempts and only 1 validated snapshot.

### Initial snapshot: facts at that point only

- World ID 65536; binding generation 1; native step 0; mutation revision 3.
- World ledger and the sum of its 87 rows: **36,040 B**.
- Module core tracked requested bytes: **167,320 B**.
- Native world bridge: **48 B / 1 allocation**; native global bridge:
  **48 B / 1 allocation**. These are separate counters, not extra ledger rows.
- Excluded worker-arena backing capacity: **131,072 B**, peak demand 0.
- Five live counts are zero; mesh cooks/destroys are zero; tracked mesh resources
  are empty. The JSON companion retains all 87 initial rows exactly.

These initial values do not explain later growth. **Three-point category deltas,
module/bridge deltas, and exact attribution of the 76,940 B difference are
unavailable in this capture.** A separate source investigation or future fix does
not retroactively supply those missing observations.

## Original strict result and lifecycle evidence

The one scene genuinely had 50 native bodies, 50 shapes, 1 fixed joint and
3 Terrain users sharing one cooked resource. The post-mount joint thresholds
read back as `1e8` before the first step. Qualified isolated primitive callbacks
were observed on both participants: each had **1 enter + 52 stay + 1 exit**,
108 callbacks total.

After one public scene release, four live counts were zero, tracked resources
were `[]`, scene/material were invalid, the old token was stale and copied events
remained unchanged. The same world diagnostic object was retained. The original
strict assertion then rejected **112,980 != 36,040 (+76,940 B)**, preserving that
primary error despite both observer errors. There was no second scene, warmup,
rebase, app reconstruction or automatic retry. Cross-scene generation isolation
is not qualified by this single attempted scene.

`liveBytes` here is `World_GetCounters.byteCount`: a **world capacity ledger**,
not module-global allocator bytes, WASM heap, RSS or only unreleased object
payload. Zero live counts do not satisfy its strict byte baseline. Conversely,
this mismatch alone does not establish either a leak or leak freedom.

## Close, physical closure and immutable inputs

- Attempt 2 made exactly one normal `app.close()`: released, no pending/failures,
  module/world cleanup reported released. Host closed without errors. This is
  not a post-close native-memory measurement or proof about untracked resources.
- Full descendant closure: subreaper, `ALL_CHILDREN_-1`, ECHILD true, zero remaining
  descendants/groups. Raw child exit was **1** because the attempt failed; the
  closure record therefore remains `FAIL`, not a rewritten exit-zero result.
- Main capture: **4.306413 s**, closing interval **0.001712 s**, sampled peak
  descendant RSS **459,866,112 B**; no budget violation. Sampling is not a kernel
  hard memory limit.
- Attempt 2 retained output including its final summary: **3,026,902 B**, verified
  against the raw directory. Budget remains CPU 30 s + consumer 300 s, main wall
  334 s, original close 4 s, RSS 2 GiB, main 56 MiB + preparation 8 MiB.
- **1,884 protected records / 1,868 distinct files**, zero reported and independently
  rechecked drift; consumer `inputsUnchanged: true`.
- Attempt 1 also reached ECHILD/zero descendants with no budget violation, but its
  freeze exited 2; 13,480 B retained. Its app and main runtime never started.

## Identity and qualification boundaries

The unchanged scene fixture originates at `f1380eb`; observer at `b8de6ce`.
Execution fixture commits are `6ac7d2e` (attempt 1) and `3048ffe` (attempt 2).
**Both ESM226 and native ST producer are `f3d7457`**, with actual DTS226 receipts;
the fixture/current branch is not substituted for those compilation identities.
Main schema is `bef78296f8fff850570799c65d6f4b0a47115cf38aed898a58cf88275348fd84`.
The original uninstrumented host/factory is retained.

Full C20, I05, I06, global native-handle/world census, post-close memory and leak
freedom remain unqualified/unavailable. Earlier SDK225 app failures remain
failures and are not precisely attributed by this initial-only SDK226 diagnostic.
No future corrected build or runtime result is assumed here.

## Retained originals, not a self-contained bundle

Paths below are relative to retained evidence root
`box3d-resume-20261025T1146`. Publishing these two reports does **not** bundle
SDK/ST binaries, raw journals or locks. The JSON companion contains the complete
artifact inventory, exact byte sizes and SHA256 values.

| Relative original                                                                                                     |  Bytes | SHA256                                                             |
| --------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `native-candidate-302935a/c20-app-memory-attempt-1-sdk226/result.json`                                                |    806 | `591b9f549db854e929cbb36d558aef49fcc0a2ff206a4ebf50b22ad076623304` |
| `native-candidate-302935a/c20-app-memory-attempt-1-sdk226/preparation/freeze/stderr.raw`                              |   7948 | `135aa774aae1ad351a3e29ac4581c8a6f62ea4866674c67e33c37b7269a2b868` |
| `native-candidate-302935a/c20-app-memory-attempt-2-sdk226-producer-root/preparation/input-lock.json`                  | 332066 | `327b8d970a7fa468fb02ab1522689069da73233b233230bd29cb0b54514c6128` |
| `native-candidate-302935a/c20-app-memory-attempt-2-sdk226-producer-root/main/run/result/consumer.raw.json`            | 149996 | `6dcb4d5076b0b40562b1233b72321c947fd321af78a5a35756d6326ceaa5c55f` |
| `native-candidate-302935a/c20-app-memory-attempt-2-sdk226-producer-root/main/run/result/memory-diagnostics.raw.jsonl` |  31115 | `cc009afcfe3e163aaf3ddb19f522854631e66acde149033f8a1cd3f3a7da530e` |
| `native-candidate-302935a/c20-app-memory-attempt-2-sdk226-producer-root/main/closure.json`                            |   2089 | `807e630cf0816ce466e92854b0ae07fc69e91615810dd4c4f26706037dfd2047` |
