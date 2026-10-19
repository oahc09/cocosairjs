# Skills optimization recovery run

This directory records the current run after the assigned cloud workspace was found to have lost its unsubmitted task files on 2026-10-18. The remote main branch was checked again and still points to `66d11fd0c3c189b7dfa6d20645222e237352f9f3`.

## Source recovery

The official connected GitHub service supplied 204 source files. Every file was checked against the immutable commit's Git blob ID. The 191 skill files total 1,462,180 bytes; their sorted manifest hash is `1e9c6637a512b819e822d8d06ea64d444c1e5640f35c48134f70fe80a5363e19`, exactly matching the earlier recorded source-byte hash. The original suite can therefore be reconstructed exactly from this commit and the manifest.

This proves source-byte recovery, not restoration of the lost execution records. Earlier routing, restore and reading results are historical observations only. Current acceptance will use newly frozen or hash-verified recovered fixtures, a new actual restore, new baseline runs and fresh independent document readers. The original and candidate comparisons must use this run's same protocol. Lost B1/B2 answers or read logs are never reconstructed from summaries.

The workspace is a focused source materialization, not a claimed full Git clone. The untouched repository tree is preserved when publishing through the Git tree API. No runtime or generated artifact is rebuilt for this documentation/tooling task.

## Bounded prerequisite approval

On 2026-10-18 at 06:51:17 UTC, the user confirmed the proposal to repair four existing reference problems before optimization, retaining the original failing snapshot and reports rather than relabeling them as passes.

The bounded scope is two verification output-location references and two Graphics/DOM verification navigations. A skill-local reference will carry the required runnable-test and low-level-probe instructions, including prerequisites, write boundaries and historical limitations. The reviewed draft was 5,514 bytes. It does not bundle the engine, examples, tools, browsers or full manual. Any actual final byte difference must be reported. This approval does not authorize phase two or merging the PR.

## Checkpoint status

This first checkpoint preserves the recovered source manifest and recovery policy before new tool validation. Skill contents remain identical to the original commit. Tool reconstruction, genuine baseline collection, prerequisite validation and all candidate gates are still outstanding.

All subsequent source and evidence checkpoints are confined to the authorized task branch. A draft PR will describe the final verified scope and any remaining limitations; no merge is performed.

## Second checkpoint and current evidence

The preceding Checkpoint status is the historical first-checkpoint state, not the current result. Commit `6d1e7ca63e5d5c51b311c37254cc00889097e78e` now preserves the six tools, fixtures, fresh source restoration and independent original B1/B2 records, including real failed raw aggregations. The approved verification page is 5,526 bytes after formatting (not the 5,514-byte proposal), SHA-256 `282264335afb0903ddbbea81fbfb17d0a9c8dc6a5e750f9f55ae4aaaabc20509`. The original failing snapshot remains immutable. The prerequisite snapshot is `46a9449ad54586ae70a914a77992801ea732270ab7f14509f40bf3792ee22d9d`.

The two raw reading logs omitted metric_version because of the collection helper. They remain unchanged and fail aggregation. Each `events-audited.jsonl` is a documented mechanical derivative adding only the already frozen version, with original hash binding in `metric-version-audit.json`. Answers, receipts, actual reads and timestamps are not regenerated. The helper was corrected before any candidate reading.

S2a/S2p passed before the other 17 metadata files changed. S2b attempt1 failed; two allowed correction rounds are retained, and attempt3 passed both 44-question views before body migration. The immutable per-stage manifests and `stage-candidate-bytes.json` make the exact frozen metadata-stage trees recoverable from the prerequisite. Later body migration evidence is separate. An erroneous final route command without candidate --root re-evaluated the original tree and failed; `final-route-attempt1.json` is retained as that invocation failure, not as final acceptance.

## Historical recovery path audit

The initial recovery provenance records are immutable descriptions of their creation time. Their old `recovery-notes/` paths are not current portable artifact paths:

- `original-restore-recovery.json` maps to this directory's `original-restore.json`; its exact SHA-256 remains `6ce78b30f1dc02cebedc57abe129934ca07734fb45f73cd51186e32731f797b1`.
- `preservation-tests-recovery.tap` is no longer present. Its historical hash alone is not current execution evidence. Current focused runs are `tools-tests.tap` and the final named test report.
- `gen-index.test-before-recovery-hardening.cjs.txt` is no longer present. The old hash is provenance only; current committed tests and new execution evidence establish current behavior.

Early recovery source hashes describe the stage recorded by those reports. Final frozen scoring/parser/index hashes are bound in the actual route reports. Do not relabel an earlier reconstruction report as proof of later source bytes. The lost pre-recovery B1/B2 logs were not reconstructed; only this recovery run's original and candidate readings may be compared.


### Lossless routing-report archive transport

Four large candidate routing reports are stored as `.json.gz`: `s2b-attempt2-route.json`, `s2b-attempt3-route.json`, `final-route.json`, and the historical failed `final-route-attempt1.json`. Their complete original JSON bytes, rankings and FAIL status are retained. The two original baseline JSON files remain uncompressed at their original paths.

`ai/plans/skills-token-evidence/recovery/compressed-route-reports.json` maps each original logical path to its archive and records original byte count, Git blob SHA, SHA256 and status. The recovery tool binds these records to the unchanged historical `publication-inventory.json` identity. Old review records and `local-ci-report-index.json` continue to identify the original logical JSON bytes; use the command below to restore those exact paths beneath a new isolated directory. Restoration is not a new execution or reading trial.

```bash
node tools/skills/restore-route-reports.cjs --check
node tools/skills/restore-route-reports.cjs --out /tmp/cocosair-route-reports
```

The output directory must not exist. The tool checks all four archives before writing and rejects missing, corrupt, altered, oversized or unsafe inputs. The 5,553,733 original bytes occupy 437,707 gzip bytes; independent decoding must reproduce every historical byte and hash. The historical publication inventory describes the uncompressed tree `6a60ee41d9c7d480ffef54f69908da0e596a4fdc`; adding archive transport creates a different final Git tree. Skill contents and their candidate snapshot hash `7f246c153901eae7a31d0bd849904412b575e2cbd5d3cfc507eab502ff0ada41` remain unchanged.
