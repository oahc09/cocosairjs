# Skills token optimization: P1 acceptance

## Scope and source

This run implements phase one of `skills-token-optimization.md` only. The immutable source commit is `66d11fd0c3c189b7dfa6d20645222e237352f9f3`. The original skills manifest is `1e9c6637a512b819e822d8d06ea64d444c1e5640f35c48134f70fe80a5363e19` (191 files, 1,462,180 bytes). The original workspace source was recovered byte-for-byte after workspace loss; lost execution logs were not reconstructed. Current original B1/B2 and acceptance use the recovery run's frozen protocol.

Original path/distribution checks genuinely failed. The user approved the bounded prerequisite on 2026-10-18 at 06:51:17 UTC: four old references were repaired and a 5,526-byte skill-local Graphics/DOM verification page added. Its command blocks, prerequisites, write boundaries and historical limitations were independently checked. Original snapshot and FAIL reports remain unchanged. `prerequisite-proof.json` binds this exact adjustment; the repaired snapshot is `46a9449ad54586ae70a914a77992801ea732270ab7f14509f40bf3792ee22d9d`.

The preservation chain is original → explicitly approved prerequisite audit → formal prerequisite-to-candidate G4. The final G4 report does not claim a direct original-to-candidate automatic equivalence pass for the approved navigation replacement.

## Frozen candidate and local gates

Final skill snapshot: `7f246c153901eae7a31d0bd849904412b575e2cbd5d3cfc507eab502ff0ada41` (219 files, 1,550,761 bytes). Evidence paths below are relative to `ai/plans/skills-token-evidence/recovery/`.

| Gate | Local result | Evidence |
| --- | --- | --- |
| G1 metadata | PASS: all 22 valid YAML records, host fields retained | `final-meta.json` |
| G2 budgets | PASS: subsystems ≤4,000 B, router 4,196 B; all other hard budgets met | `final-meta.json`, `final-static.json` |
| G3 links/distribution | PASS: 764 local links; exact A-only isolated full-tree copy | `final-paths.json`, `a-only-final-manifest.json`, `a-only-final-paths.json` |
| G4 preservation | PASS: 3,265 source units, 381 explicit mappings, no issues | `final-lossless.json`, `ai/plans/skills-migration-ledger.json` |
| G5 routing/order | PASS: both views 44/44 Top1 and Top3; all 22 gold, 12 boundaries, 10 real errors pass | `s2p-attempt1.json`, all three S2b attempts, `final-route.json` |
| G6 generation | PASS: current indexes match; two clean directories produce identical bytes | `final-index.json`, `index-determinism.json` |
| G7 benefit | PASS: static and genuine same-protocol B1 thresholds met | `final-static.json`, `candidate-B1-diff.json` |
| G8 scope/restore | PASS locally: original actual restore reread exact; no runtime/build/manual/version changes | `original-final-reread.json`, `final-scope.json`, `local-ci-final.json` |

The complete local CI orchestrator passed, including a separate expected original-path FAIL, prerequisite reconstruction, safe actual restore, final gates and isolated full-tree distribution. The original tooling suite plus new orchestration safety cases passed 152/152; the unchanged path checker's 43 in-memory selftests also passed. Formatting covers all 78 changed skill Markdown/JSON files and focused tools/workflow/maintenance documentation. Remote PR checks must be checked on the actual final commit; local success does not substitute for their result.

## Actual measurements

| Metric | Original | Candidate | Change |
| --- | ---: | ---: | ---: |
| Host-minimal L0 Unicode characters / UTF-8 bytes | 19,646 / 19,646 | 4,504 / 4,504 | −77.07% characters |
| Host-minimal L0 rough token estimate | 5,170.00 | 1,185.26 | estimate only |
| 21 subsystem complete-entry mean UTF-8 bytes | 7,020.62 | 3,258.76 | −53.58% |
| B1 document-input characters C, including L0 | 85,260 | 59,114 | −30.67% |
| B1 UTF-8 input bytes | 85,456 | 59,310 | separate byte measure |
| B1 rough token estimate | 22,470.74 | 15,590.21 | estimate only |

Both original and candidate B1 used fresh independent readers, the same frozen question and protocol, full router charging, all actual reads, sealed answers and six completion checks. Candidate B1 read seven complete documents, without repeats or truncation. Its answer hash is `48ee9175602868d15fca5edaea4e5b06ebdd1a16554d9139f96232b92c7fa98d`. Costs are document inputs, not provider billing tokens. Do not extrapolate one fixed task's saving to a real-task weighted average.

Original B2 is retained at C=79,432 characters / 79,628 bytes / estimated 20,937.05 tokens. No P1 candidate B2 or phase-two benefit is claimed.

Whole-tree bytes increased by 88,581 bytes because complete displaced wording, historical inventory, new indexes and guidance remain available. The optimization reduces default metadata/entry reading overhead, not archival storage. Twenty-three giant original references remain intact; reference slicing and shared-content deduplication were not implemented.

## Sequence, failures and independent content review

S0a original bytes → six tools and three closure analyses → S0r actual isolated restore and disk reread → frozen questions/protocol and genuine original B1/B2 → fixed-five S2a → 16-question S2p with all 22 competitors → remaining 17 metadata → all-44 S2b → rendering pilot → remaining bodies → generated indexes → frozen candidate and genuine B1.

S2p passed in both views. S2b attempt1 failed because compressed owner descriptions lost meaningful domain terms; two allowed correction rounds retained natural source-supported wording and restored the experimental HTML-texture qualifier. Attempt3 passed both views 44/44 before any body migration. All original failures, correction notes, frozen manifests and exact stage bytes are retained. The final command's first invocation omitted candidate --root and failed against the original tree; `final-route-attempt1.json` remains an invocation failure, while explicit-root `final-route.json` is the final passing evidence.

The original raw B1/B2 aggregation failures caused by an omitted metric_version remain unchanged. Audited logs mechanically add only the already frozen version and retain raw hashes; answers/read payloads/receipts were not altered.

Independent review read all 22 compressed entries and the rendering/router preservation chains, checked exact frontmatter and original context prefixes, and reran full preservation, routing, budget, path and focused tests. It identified and closed three misleading-summary/navigation defects: rendering's second directional-light wording; router's moved “below” pointer; application's stale import-before-canvas warning. Historical source sentences/code remain preserved, with explicit current-contract context. Graphics experimental APIs retain their qualifier and point to the current main entry while its original wording remains archived. The technical audit establishes defined content/mapping checks and examined meaning; it is not a mathematical proof of semantic equivalence.

## Distribution and remaining boundaries

Three representative original closures each covered 22 skills / 190 of 191 files / 99.96984% of original bytes; A-only whole-tree distribution was selected. The repaired prerequisite closures pass at 191/192 files (99.96995% of bytes), and the final candidate closures pass at 217/219 files (99.65475%); `distribution-decision.json` retains all three stages separately. No single-skill bundle mode exists. The isolated candidate contains exactly the frozen skills tree, without borrowing repository files. Verification guidance is local, but the engine, examples, verification tools and browsers must still be available in a confirmed checkout when executing those commands.

The six fixed tools/scorer/parser were not altered after their baseline freeze. Added CI orchestration preserves the existing Code quality/browser smoke workflow. Directory identities, old index path and package version are unchanged; the legacy index stub keeps the first three historical rows and an on-demand full archive for at least two release cycles. Generated indexes have one source: frontmatter and Reference maps. External hosts' custom metadata/Chinese-field behavior remains unverified; name+description is the compatibility fallback.

Phase two remains unapproved. No `_shared/`, topic slicing, T2 model retrieval or M2 real-task collection was performed. Five working days and at least 20 complete real tasks, the demand criterion and separate approval remain necessary. The event guide describes future manual collection without importing private sessions or counting these acceptance exercises as demand.


### Lossless routing-report archive transport

Four large candidate routing reports are stored as `.json.gz`: `s2b-attempt2-route.json`, `s2b-attempt3-route.json`, `final-route.json`, and the historical failed `final-route-attempt1.json`. Their complete original JSON bytes, rankings and FAIL status are retained. The two original baseline JSON files remain uncompressed at their original paths.

`ai/plans/skills-token-evidence/recovery/compressed-route-reports.json` maps each original logical path to its archive and records original byte count, Git blob SHA, SHA256 and status. The recovery tool binds these records to the unchanged historical `publication-inventory.json` identity. Old review records and `local-ci-report-index.json` continue to identify the original logical JSON bytes; use the command below to restore those exact paths beneath a new isolated directory. Restoration is not a new execution or reading trial.

```bash
node tools/skills/restore-route-reports.cjs --check
node tools/skills/restore-route-reports.cjs --out /tmp/cocosair-route-reports
```

The output directory must not exist. The tool checks all four archives before writing and rejects missing, corrupt, altered, oversized or unsafe inputs. The 5,553,733 original bytes occupy 437,707 gzip bytes; independent decoding must reproduce every historical byte and hash. The historical publication inventory describes the uncompressed tree `6a60ee41d9c7d480ffef54f69908da0e596a4fdc`; adding archive transport creates a different final Git tree. Skill contents and their candidate snapshot hash `7f246c153901eae7a31d0bd849904412b575e2cbd5d3cfc507eab502ff0ada41` remain unchanged.
