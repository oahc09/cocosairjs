# C20APP SDK227 — complete three-point capture, strict baseline FAIL

## Result

One authorized SDK227 attempt on 2026-10-26 produced **three validated 87-row
memory snapshots**, while the unchanged original C20APP strict baseline still
**failed on the first cycle: 0 qualified cycles out of 100 configured**.

- `strictStatus: FAIL`; `memoryDiagnosticStatus: COMPLETE_REACHED_SCENE_SNAPSHOT_SETS`.
- 1 app, 1 public step clock, 1 mounted scene attempted, 58 actual steps and
  108 real trigger callbacks. No warmup, rebasing, trimming, second app/world,
  private step, after-close probe or automatic retry.
- Original baseline ledger: **36,040 → 112,980 bytes, +76,940** after release.
  This is a strict assertion failure, not by itself a leak/no-leak verdict.
- Normal app close and all-descendant `waitpid(-1)` / ECHILD closure completed;
  no budget violation, host error or input drift.
- Diagnostic completeness is not C20 acceptance or a 100-cycle result.
  Full C20, I05 and I06 remain **NOT_QUALIFIED**.

The [machine-readable companion](c20-app-memory-diagnostics-sdk227-capture-20261026.json)
contains all 87 row comparisons, exact raw error, closure records, identities and
100 original artifact path/size/SHA records. This publication is an evidence
index and analysis, **not a self-contained raw bundle**.

## Identity and method

| Role                                    | Actual identity                                                    |
| --------------------------------------- | ------------------------------------------------------------------ |
| Published runner / observer profile v2  | `a14ce32567166b8b0c124ffaadfe0d92b8db0ee7`                         |
| Unchanged original APP v2 scene fixture | `f1380eb96809c3a24e7f2ec024f4cdeebefb327e`                         |
| Native ST and ESM / DTS227 producer     | `117d6af86f96ff15e0d734745b47a8b0b19a9c5f`                         |
| Main schema                             | `3a1c552650979c205898c90c4d862483810b66dc5c875f155c80e92fb15618da` |
| Wire layout                             | 87 rows / 740 words                                                |
| Fresh input lock SHA256                 | `cb42dd6750c97f3aaf6e41d446086fe4cbd87b2b80b3befe12a04f8cccd6a77f` |

The independent execution-source snapshot is not relabelled as the compiler
source or current branch HEAD. The full ready ST copy retained its original
relative OUT path, and all **948 files / 51,969,274 bytes** matched the native
producer. The supported producer-root binding, real ESM227 / fresh DTS227
receipts, 25 SDK files and fresh readiness lock were checked before the consumer.
All **161 CPU controls passed** in the bounded execution before runtime startup.
The original JSDOM HEADLESS host and production module factory were unchanged.

The observer called the backend getter only at the three existing synchronous
record points. Each getter's four live counts, ledger total and tracked mesh
resources matched the original fixture snapshot at that point. All rows sum
exactly to the native core-reported world ledger. The same backend object was
retained; world ID `65536` and binding generation `1` were unchanged. Numeric IDs
alone do not establish same-module identity. Mutation revisions `3 / 709 / 911`
are snapshot-validity labels, not allocation epochs.

## Three actual snapshots

All three have `OBSERVED_VALIDATED` status, at public/native steps **0 / 7 / 58**.

| Metric                                     |       Initial |        Nonempty | Released before validation |
| ------------------------------------------ | ------------: | --------------: | -------------------------: |
| World capacity ledger / classified row sum |        36,040 |         108,708 |                    112,980 |
| Live body / shape / contact / joint        | 0 / 0 / 0 / 0 | 50 / 50 / 0 / 1 |              0 / 0 / 0 / 0 |
| Module core tracked requested bytes        |       167,320 |         239,624 |                    243,480 |
| Native world bridge tracked bytes          |            48 |             224 |                         48 |
| Native global bridge tracked bytes         |            48 |             224 |                         48 |
| Each bridge allocation count               |             1 |               5 |                          1 |
| Module mesh successful cooks / destroys    |         0 / 0 |           4 / 3 |                      4 / 4 |
| Tracked mesh resource snapshots            |             0 |               1 |                          0 |
| Excluded worker arena backing bytes        |       131,072 |         131,072 |                    131,072 |

The nonempty resource has **1 native cache lease / 3 native shape borrows** for
three Terrain users, with 416 core mesh bytes. JavaScript `users: 3` is auxiliary,
not a replacement for native lease/borrow diagnostics. Release returned the
tracked resource list to `[]`. Primitive event participation was isolated from
unsupported Terrain/Hull event pairs: sensor and visitor each received
**1 enter + 52 stay + 1 exit**. The fixed joint was connected with public
`breakForce` and `breakTorque` both `1e8`, read back at step 0 before the first
actual step.

Scene and material were invalid after release, current scene was null, old scope
token stale and copied events unchanged. These normal-path facts do not widen
qualification to orphaned objects from pre-mount construction failures.

## Exact world-ledger difference for this SDK227 attempt

The following seven category differences sum exactly to **+76,940 bytes**.
Other categories have zero net initial-to-released difference. The companion
includes all categories and all 87 rows, including transient allocations that
returned to zero.

| World-ledger category           |    Initial |    Nonempty |    Released | Released − initial |
| ------------------------------- | ---------: | ----------: | ----------: | -----------------: |
| `solverSet`                     |      9,152 |      40,704 |      47,808 |            +38,656 |
| `worldArray`                    |     12,064 |      28,576 |      28,576 |            +16,512 |
| `tree`                          |      4,848 |      17,196 |      17,196 |            +12,348 |
| `graph`                         |        184 |       7,288 |       7,288 |             +7,104 |
| `event`                         |      1,040 |       2,888 |       2,888 |             +1,848 |
| `idFreeList`                    |        768 |         768 |       1,152 |               +384 |
| `hulls` (retained `map` term)   |         16 |       1,496 |         104 |                +88 |
| **Total across all categories** | **36,040** | **108,708** | **112,980** |        **+76,940** |

The full ledger rises by 72,668 while nonempty and by a further net 4,272 by the
released checkpoint. Row `count` is a native storage length/field, not a live
object count: for example, addressable body slots can remain 50 while live bodies
are zero. Retained capacities and free-list entries must not be presented as
unreleased live bodies or handles.

**The ledger includes 1,932 bytes of unallocated-backing estimates** at both
nonempty and released points: `tree.dynamic.leafBoxes: 1,656` and
`tree.dynamic.binIndices: 276`. Across all six schema-designated estimate rows,
the totals are `0 / 1,932 / 1,932`. These are shared `rebuildCapacity` estimates in
the pinned core ledger; the schema explicitly identifies their backing as
unallocated for pinned `B3_TREE_HEURISTIC=0`. They are not actual backing-memory
allocations and must not be counted as such. Their presence is part of the
unchanged core ledger being diagnosed, not permission to change the baseline.

The world ledger is neither a module-global allocator total nor WASM heap/RSS or
live-object payload. **Module core requested bytes independently increased by
76,160**, not 76,940. These partly overlapping scopes must not be equated or
added. This report does not assign their 780-byte net-difference to one category.
World/global bridge each returned to its 48-byte initial value (**net zero**);
they are also not additive to each other. The arena backing stayed 131,072 and
is explicitly excluded from the world ledger: it does not explain ledger growth
in this capture.

This comparison completely classifies the **observed world-ledger difference**
for this run; it does not prove reclamation legality, full leak freedom, or that
the strict original contract may accept these retained capacities. No baseline
or acceptance condition was changed.

## Closure, integrity and retained evidence

- Wrapper interval: `2026-10-26T13:14:25.670096+00:00` through
  `2026-10-26T13:14:31.761052+00:00`.
- Main outer elapsed 4.70580784699996 s; close 0.001784785999916494 s;
  sampled peak descendant RSS 450,830,336 bytes. Main raw return code **1**
  preserves the strict failure, independently of successful physical closure.
- Limits remained CPU 30 s, consumer 300 s, main outer 334 s, close 4 s,
  sampled descendant RSS 2 GiB, main output 56 MiB plus preparation 8 MiB.
  Separate non-runtime freeze limits remained 60 s / 2 GiB / 2 MiB within prep.
  RSS sampling is not a kernel hard limit.
- Main retained output 2,266,012 bytes; all output including summary
  **3,169,070 bytes**, below 64 MiB; no budget violation.
- Freeze and main both report subreaper enabled, `ALL_CHILDREN_-1`, ECHILD,
  no remaining descendants or process-group members, and no supervisor errors.
- **1,884 protected records / 1,868 unique paths**, zero post-run drift;
  independent read-only rehash also found zero current drift. These are input
  records, not a claimed native-handle census.
- App normal close reports scene null, pending/failures empty, and physics
  module/world cleanup released. Host closed with no host errors.
  No after-close getter, module inspection, replacement factory or second module
  was used. Close is not a measurement of zero post-close module bytes.

All paths in the companion artifact index are relative to the retained
`box3d-resume-20261025T1146` evidence root. Principal raw files are under
`native-candidate-302935a/c20-app-memory-attempt-3-sdk227-tree-ledger/`:

| Original                                       |   Bytes | SHA256                                                             |
| ---------------------------------------------- | ------: | ------------------------------------------------------------------ |
| `main/run/result/consumer.raw.json`            | 232,688 | `3da62412a4f288929a37245addc1da1e1004091e2069ffa622348740cc4781a7` |
| `main/run/result/observations.raw.jsonl`       | 673,614 | `23a045b645827dd9bce67acce7ffc58672504bce405c3e281680e0667b0ddc00` |
| `main/run/result/memory-diagnostics.raw.jsonl` |  81,974 | `6deacad0a720f6b59b96e5e3cc575077557f09cdc6060ad818dbac2523aa0727` |
| `main/closure.json`                            |   2,091 | `952d1464d9746cfddce510d230484f0d0782d0da9a58277bb0b6ec794ad824b7` |

## Historical and qualification boundaries

This SDK227 run does **not** backfill missing SDK226 snapshots or precisely
attribute earlier SDK225/226 byte differences. Their original failures and zero
qualified cycles remain recorded in the
[earlier memory-capture report](c20-app-memory-diagnostics-failures-20261026.md)
and [original strict-baseline report](c20-app-strict-baseline-failures-20261026.md).

Backend diagnostic APIs are real native-backed observations, not stable
`IPhysicsWorld` API guarantees. All-handle/global-world/global-mesh-lease censuses,
after-close module observation, browser qualification and complete leak freedom
remain unavailable or unqualified. No future reclamation implementation, second
capture or 100-cycle pass is asserted here.
