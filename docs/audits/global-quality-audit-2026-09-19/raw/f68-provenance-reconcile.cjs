/* F-68: reconcile the two provenance channels; corrects F-66's explanation (append-only). */
const fs = require('fs');
const A = 'docs/audits/global-quality-audit-2026-09-19';
const F = A + '/findings.jsonl';
const before = fs.readFileSync(F, 'utf8');
const rows = before.trimEnd().split(/\r?\n/).map((l) => JSON.parse(l));
if (rows.length !== 67 || rows[66].findingId !== 'F-67') { throw new Error('unexpected state ' + rows.length); }
if (rows.some((r) => r.findingId === 'F-68')) { throw new Error('F-68 exists'); }
const row = {
  findingId: 'F-68',
  requirementId: 'mandate step 10 + license gate: provenance numbers must name their channel and their unit',
  gate: 'license', category: 'self-correction of F-66 (my own explanation was wrong, the measurement was not)',
  blocking: false,
  status: 'OPEN-CORRECTED (F-66 stays as written for the audit trail; this row supersedes its explanation)',
  location: 'examples/*/assets/**, examples/gltf-viewer/assets/SHA256.json, examples/gltf-viewer/assets/official/manifest.json',
  repro: "node: read both manifests (9 + 16 entries), union of 25 names, resolve them against the 65 files under examples/*/assets, compare bytes; separately count '.LICENSE.md' siblings per payload",
  expected: 'one provenance number per channel, each with an explicit unit (file count vs bytes)',
  actual: 'There are TWO independent provenance channels and F-66 conflated them. (1) Upstream manifests exist only for gltf-viewer: 9 + 16 entries = 25 unique names, which resolve to 33 files on disk = 5,161,326 B of the 5,191,306 B under examples/*/assets = 99.4 % BYTES but only 33/65 = 50.8 % of files, and 0 of the other 7 examples. My stored note read "25/65 files, 38.5 % of bytes" - the 38.5 % is 25/65, i.e. a FILE-COUNT share that got written with the word "bytes"; the byte share is actually 99.4 %. (2) Per-asset .LICENSE.md sidecars: 24 of 41 payloads covered, 99.7 % of payload bytes, uncovered payloads total 17,533 B. F-66\'s guess that "25/65 came from counting sidecars in the denominator" is therefore wrong and is superseded here; F-66\'s own measurements (41/24/17, 17,533 B, draco.glb + meshopt-khr.glb missing) are all re-confirmed. What genuinely remains open for R1: 7 of 8 examples have no upstream manifest at all, 17 payloads have no sidecar (draco.glb 992 B and meshopt-khr.glb 1,428 B included), and license-audit.cjs still EXITs 1 with issues=3.',
  evidence: 'raw/gates/f61-catalog-rerun-2026-09-19.log §12',
  minimalFix: 'Owner decision for R1 unchanged: supply the upstream statement for the 2 named .glb, then choose whether the contract is per-payload sidecar, per-example manifest, or both. Reporting rule for the audit itself: always state channel + unit.',
  retest: 'license-audit.cjs EXIT 0; and any future provenance claim in this ledger quotes channel, denominator and unit in the same sentence.',
  measuredAt: '2026-09-19T22:12:00.000+08:00',
};
fs.appendFileSync(F, JSON.stringify(row) + '\n');
if (!fs.readFileSync(F, 'utf8').startsWith(before)) { throw new Error('FATAL not append-only'); }
fs.appendFileSync(A + '/raw/gates/f61-catalog-rerun-2026-09-19.log', `
§12  F-68: provenance channels reconciled (corrects F-66's explanation, not its numbers)
    Channel 1 - upstream manifests (examples/gltf-viewer only):
      SHA256.json 9 entries + official/manifest.json 16 entries = 25 unique names
      -> resolve to 33 files on disk, 5,161,326 B of 5,191,306 B under examples/*/assets
      -> 99.4 % BYTES, 50.8 % of files, 0 coverage for the other 7 examples.
      My stored phrasing "25/65 files ~ 38.5 % of bytes" is a unit error: 38.5 % = 25/65 is a COUNT share.
    Channel 2 - per-asset '.LICENSE.md' sidecars (all 8 examples):
      41 payloads / 24 covered / 17 uncovered = 17,533 B -> 99.7 % of payload bytes covered.
    Gate unchanged and still red: node tools/verify/license-audit.cjs EXIT 1, issues=3.
    Net for R1: the byte-level story is much better than my earlier wording implied; the real gaps are
    (a) 7 of 8 examples have no upstream manifest, (b) 17 payloads lack a sidecar, incl. the two F-27 .glb.
`);
fs.appendFileSync(A + '/verification-summary.md', `
### UPDATE-20c - F-68: my provenance number had the wrong unit attached (22:12)

F-66 explained the old "25/65 / 38.5 % of bytes" figure as a sidecar-inclusive denominator. That explanation
was wrong, so it is superseded by F-68 rather than edited away. Re-measured: the two upstream manifests live
only under \`examples/gltf-viewer/assets/\` and name 25 files (9 + 16), which resolve to 33 on-disk files
carrying **99.4 % of the 5,191,306 B** asset payload - so 38.5 % was the *file-count* share (25/65) that my
note had labelled "bytes". The separate \`.LICENSE.md\` sidecar channel covers 24/41 payloads = 99.7 % of
payload bytes. Both numbers are high on bytes and low on file count, which is precisely why every provenance
claim now has to state channel + denominator + unit. R1's substance is unchanged: 7 of 8 examples have no
upstream manifest, 17 payloads lack a sidecar (\`draco.glb\` 992 B and \`meshopt-khr.glb\` 1,428 B among them),
and \`license-audit.cjs\` still exits 1 with issues=3.
`);
console.log('F-68 appended; rows', fs.readFileSync(F, 'utf8').trimEnd().split(/\r?\n/).length);
