# Present-only controlled APP capture — v3

This is a compatibility revision of the retained v2 runner. It changes only the
new SDK/diagnostic/native-receipt cohort, diagnostic v2 layout, and the explicitly
unavailable historical replay dependency. Original APP v2 fixture/contract/host,
strict baseline, lifecycle and budgets are unchanged. No SDK/APP result exists yet.

## Files and identities

The fresh lock covers all 12 v3 files, ten exact original APP v2 files, the existing
byte-pinned all-descendant supervisor, full declared runtime source trees, exact
25 SDK files and eight ST files, and actual producer receipts. Original imports
are checked both under execution source and relative to the statically imported
runner. No dependency, source, SDK, native or historical file is edited by capture.

Required provenance schema is `box3d-c20app-memory-producer-inputs-v3`, with explicit
`runtimeBuildNumber: 228`, `runtimeProducerCommit`, `nativeProducerCommit`,
`fixtureCommit`, and four `receipts` records: `esm`, `dts`, `dtsGates`, `native`.
Each receipt record contains canonical evidence-root-relative `path`, byte count
and SHA256. Never put planned output, current branch HEAD or a synthesized receipt
into these fields. Native producer and actual result hash are fixed in profile.mjs;
new ESM/DTS identities must be read from the actual successful future artifacts.

ESM must be `PASS_FRESH_ESM228_BUILD`, exit 0, no abort/drift, physically closed,
with 23 exact non-declaration files, new native producer/READY and all five ST
transport bytes. DTS must be `PASS_FRESH_DTS228_SEVEN_GATES`, same source producer,
normal closure/no drift, two exact declarations, successful real seven-gate receipt
and matching ESM receipt. Missing/old/failed/partial evidence is NOT_READY.

Native input uses the actual new result schema, not a fabricated old `budget/cwd`
receipt. It requires `PASS_LIMITED_ST_BUILD_AND_STORAGE_QUALIFICATION`, fixed producer,
ECHILD, empty inputDrift, exact 41/111/85/58 and 51/12 counts, one successful actual
build-ready command, current identity and exact four completion-file records.
Its full result SHA is fixed before parsing; status labels alone are insufficient.
The unchanged production `verifySTBuild` still validates its own entire gate set.

The source-contained ST must be a complete byte-identical copy at
`tools/physics/box3d/output/production-st-fb825da-attempt-3`. The original native
producer root is derived from the hash-bound actual command output path after
checking that exact suffix. `verifySTBuild` gets the execution root as its normal
ROOT and the original producer root as `provenanceRoot`; compiler/audit absolute
paths are never normalized or rewritten. Copy and hash the complete ST directory,
not just eight runtime files, before freeze. Producer receipt identity never becomes
runner source identity. Old attempts and their NOT_READY/FAIL remain immutable.

## Historical raw is not a new producer

The previous required `historicalV2Journal` is removed from this new provenance
schema because its raw bytes are unavailable. It is not accepted as a fake, blank
or replacement receipt. The known original hash and UNAVAILABLE state are instead
fixed in `HISTORICAL_REPLAY`, checked in the lock and surfaced separately in all
reports. This does not close a historical replay/full-project evidence requirement.
Current strict fixture and complete current producer checks are not weakened.

## Bounded execution, only after authorization

```sh
H=tools/physics/box3d/c20-app-memory-diagnostics/v3
python3 "$H/execute-once.py" --execute-authorized-once   NODE EXECUTION_SOURCE SDK228 SOURCE_CONTAINED_READY_ST   EVIDENCE_ROOT PROVENANCE_RELATIVE_PATH FRESH_ATTEMPT_DIRECTORY
```

The flag is an accident guard, not permission. The wrapper first performs a fresh
present-only freeze. An absent producer prevents lock creation and any consumer
start. It then runs the exact original APP contract/constraint-source CPU tests
and new observer/input controls for 30 seconds, followed only on success by the
single real production consumer for 300 seconds. Original app.close runs once.
No native execution is involved in preparation/CPU/export inspection.

Outer main wall remains 334 seconds plus the original four-second close interval;
RSS limit 2 GiB, main output 56 MiB, preparation output 8 MiB, total 64 MiB.
Freeze has its separate original 60-second/2-MiB bound within preparation. The
original maximum is 7400 public fixed steps, 2000 ms per step within total wall.
No warmup, private step, fixture weakening, retry, after-close getter or second app.

The byte-pinned supervisor is
`tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py`, SHA256
`d721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e`.
Qualification requires real subreaper ALL_CHILDREN -1 waitpid ECHILD, no remaining
descendants and no group members, not PGID-only disappearance. Input hashes before
and after, partial journals, normal close and physical closure are separate facts.
Failures preserve the first primary error and partial rows; no automatic rerun.

Preparation CPU invocation (no SDK import):

```sh
BOX3D_ORIGINAL_APP_SOURCE_ROOT=SOURCE BOX3D_DIAGNOSTIC_SOURCE_ROOT=SOURCE node --test "$H/observer.test.mjs" "$H/inputs.test.mjs"
```

Full pre-consumer CPU also needs the already locked existing TypeScript dependency
for unchanged `constraint-source.test.mjs`; no dependency installation is performed
by this runner. Actual Node/runtime identity is recorded, not assumed to be Node22.
