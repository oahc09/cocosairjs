# Manifest-aware Box3D 223 cohort (candidate profile v2)

This dedicated profile executes only the original complete 22-case same-runtime
Node/JSDOM/ST set. It does not promote formal cells/Gates or add browser, MT,
full EX09, build, or native-solver coverage. Expected faults remain separate from
positive limited results (16 positive cases and 6 expected-fault cases).

## Status

This revision is a candidate until independent review and a real fixture/docs
commit. No fixtureCommit may be fabricated. Old v1-v6 inputs and SDK223 receipts
remain unchanged. All new inputs require fresh snapshots and attempts.

## Input model

The new lock uses `box3d-same-build-cohort-manifest-v2`; unsupported profiles and
legacy downgrade are rejected. Runtime producer b089 and the later genuine
regression fixture commit are distinct Git-verified identities. The complete
original 17696-row manifest is retained byte-for-byte, including 56 symlinks.
Git source, installed dependencies and the exact 1241 external inputs are
separately proven; source provenance has no wildcard/non-Git fallback.

Original symlink row SHA/bytes describe referent content; symlinkTarget describes
link identity. Both are checked, and each referent must have an independent row.
Only the build-counter path may have an explicit regular-file prebuild projection;
its bytes must still match the original manifest and true runtime Git blob.
The live postbuild source is not changed. Added DTS outputs are not substituted
for or added to the original prebuild input set.

The P2P document is mandatory from the real fixture/docs commit, explicitly not
an old recovered b089 document. No historical qualification is inherited.

## Reviewed execution interface

Do not run these merely to finish preparing a candidate. After root approval,
fill a freeze config with real Git repositories/commits, original evidence file
locations, the committed provenance-policy path, source root and optional exact
counter projection. The config schema is `box3d-manifest-cohort-freeze-config-v2`.

```
node runner.cjs freeze-manifest CONFIG_JSON NEW_LOCK
node runner.cjs batch COMPLETE_22_CASE_PLAN NEW_OUTPUT_DIRECTORY
```

Plan schema remains box3d-campaign-batch-v1 with requireSameBuild:true, the exact
22 cohort IDs, and identical artifacts/lock/sourceRoot options for every case.
Only a new output directory is accepted. The existing per-case 180-second timeout
and independent result importer remain; there is no claim of a general process
supervisor or whole-batch memory/disk/time bound.

## Non-physics verification

```
node --test manifest-inputs.test.cjs
```

These tests use deliberately synthetic tiny manifests and genuine synthetic Git
objects only. They are not physics evidence. Historical runner integrated tests
remain with the unchanged historical runner, not silently skipped here. The
machine diff allowlist verifies all original consumer physics bodies, numerical
thresholds, query/trigger/SKU oracles, registry and classifier bytes unchanged.
