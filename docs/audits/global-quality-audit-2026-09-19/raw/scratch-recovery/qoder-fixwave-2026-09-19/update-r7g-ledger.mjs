/* Append-only ledger update for the R7g completion.
 * Backs up all four ledger files first, then re-reads and verifies that earlier
 * records are untouched (lossless under shared-worktree risk). */
const fs = require('fs');
const path = require('path');
const A = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';
const BAK = 'E:/qoder-fixwave-2026-09-19/pre-r7g-ledger';
fs.mkdirSync(BAK, { recursive: true });

const files = ['findings.jsonl', 'evidence-index.json', 'global-verdict.json', 'retest-plan.md', 'verification-summary.md'];
const before = {};
for (const f of files) {
  const abs = path.join(A, f);
  before[f] = fs.readFileSync(abs, 'utf8');
  fs.writeFileSync(path.join(BAK, f), before[f]);
}

// --- findings ---
const findings = before['findings.jsonl'].trim().split(/\r?\n/).map((l) => JSON.parse(l));
const now = new Date().toISOString();
const add = [
  {
    findingId: 'F-51',
    requirementId: 'mandate step 5 (asset-content negative controls must really fail) + retest-plan R7g',
    gate: 'exampleStableVerify + negativeControls',
    category: 'R7g binding scope: the evidence bound only the paths example.json chooses to name, so undeclared sidecars and whole asset corpora were unbound by construction; upstream provenance is now cross-checked where the delivery carries it',
    blocking: false,
    status: 'FIXED-AND-PROVEN (offline), off-tree only',
    location: 'tools/verify/v11-spec-common.cjs (listAssetTree + widened assetDigestsOf), tools/examples/spec-compliance-audit.cjs (S15 union scope, S15-ASSET-ZERO, bound-but-absent branch, S15-ASSET-PROVENANCE)',
    repro: 'see raw/negctl/nc-r7g-asset-content-binding.log sections 3 (pre-fix NOT detected), 5 (59 newly-in-scope unbound rows), 7 (NC-E1..E5 DETECTED), 8 (NC-E6/E7), 8b (NC-E8 pre-capture tamper), 9 (jest 29/207 twice)',
    expected: 'a stable example must not be able to lose, empty or silently swap any file it ships under assets/, whether or not spec.assets names it; and an asset already wrong before capture must be detectable where an upstream digest exists',
    actual: 'PRE-FIX BLIND: SimpleSkin_geometry.bin -> 0 B and gltf-viewer/assets/BoxTextured.glb -> same-size garbage both left spec-compliance at 0 fail / EXIT 0 (raw/negctl/r7g-01-NOT-detected.log). POST-FIX DETECTED: NC-E1 truncate (0B != 168B), NC-E2 same-size garbage (4362f5bf != 35f0ca6b), NC-E3 garbage in a ZERO-declared example, NC-E4 bound file moved out of the delivery, NC-E5 unbound new file injected, NC-E7a/E7b zero-byte on disk and zero-byte in the record, NC-E8 pre-capture garbage provenance (140f5c64 != upstream b510eca2) which the browser gate also rejected as FAIL {material-property,resource-released}. Copy returns to 0 fail / 1 warn after genuine 8/8 PASS Chromium re-captures; integrity sweep copy-vs-project 65 files drift 0; jest 29 suites / 207 tests twice (once with provenance enabled).',
    evidence: 'R7G-ASSET-BINDING-2026-09-19',
    minimalFix: 'already delivered in the two tool files; no example.json field added on purpose (a spec.assets edit would move specFingerprint and mass-invalidate valid evidence)',
    retest: 'node tools/examples/spec-compliance-audit.cjs after the re-evidence run of step 10; plus re-run NC-E1/NC-E3 in a copy',
    measuredAt: now,
  },
  {
    findingId: 'F-52',
    requirementId: 'mandate step 5 (provenance of captured bytes)',
    gate: 'exampleStableVerify + negativeControls',
    category: 'residual, non-blocking: digests are computed from the same working tree as the run, so an asset that was ALREADY wrong (but non-empty) at capture time cannot be disproved offline',
    blocking: false,
    status: 'DISCLOSED-LIMITATION',
    location: 'tools/verify/v11-spec-common.cjs assetDigestsOf; test/smoke/smoke-29-examples-spec.test.ts; examples/gltf-viewer',
    repro: 'raw/negctl/nc-r7g-asset-content-binding.log section 8 NC-E6 Probe B',
    expected: 'a PASS record should mean every delivered asset of that example is loadable',
    actual: 'gltf-viewer with assets/AnimatedMorphCube.glb truncated to 0 B still reported PASS on all 7 validators (its contract loads a different model), so capture-time PASS is not per-asset proof. The zero-byte case is now asserted offline (S15-ASSET-ZERO); a wrong-but-non-empty model is only coverable by upstream provenance (R1 license/origin work) or per-asset load coverage.',
    evidence: 'R7G-ASSET-BINDING-2026-09-19',
    minimalFix: 'either per-asset load coverage in the catalog example, or record asset origin + upstream hash in the spec (R1)',
    retest: 'R1 provenance decision',
    measuredAt: now,
  },
  {
    findingId: 'F-53',
    requirementId: 'mandate step 7 (claimed-stable examples must carry current evidence) + supersedes F-49 scope',
    gate: 'exampleStableVerify + candidateIntegrity',
    category: 'delivered evidence predates the widened binding, so the in-repo chain is RED until re-evidenced; scope is larger than F-49 stated',
    blocking: true,
    status: 'OPEN-NEEDS-AUTHORIZATION',
    location: 'docs/evidence/v11-examples-verified.json, docs/evidence/v11-devtools-examples.json, docs/evidence/examples/*.png',
    repro: 'cd E:/qoder-fixwave-2026-09-19/verify-current (repo content, off-tree) ; node tools/examples/spec-compliance-audit.cjs -> raw/negctl/r7g-06-repo-delivered-evidence.log',
    expected: 'F-49 said 11 fail / 1 warn over 6 declared paths + 5 DevTools frames',
    actual: 'with the widened scope the delivered evidence yields 70 fail / 1 warn (65 S15-ASSET-BIND + 5 S11-SCREENSHOT; gltf-viewer alone is 50). Re-evidence set corrected to 8 browser ids + the 5 DevTools ids + verify:v06-gate. Not executed in the repo: those exact paths are uncommitted and being rewritten by a parallel session. npm test stays RED via smoke-29 by design until then.',
    evidence: 'R7G-ASSET-BINDING-2026-09-19',
    minimalFix: 'one authorized re-evidence pass on a quiet tree (no code change)',
    retest: 'raw/negctl/nc-r7g-asset-content-binding.log section 10 command list',
    measuredAt: now,
  },
];
const ids = new Set(findings.map((f) => f.findingId));
for (const f of add) { if (!ids.has(f.findingId)) { findings.push(f); } }
fs.writeFileSync(path.join(A, 'findings.jsonl'), findings.map((f) => JSON.stringify(f)).join('\n') + '\n');

// --- evidence index ---
const evIndex = JSON.parse(before['evidence-index.json']);
if (!evIndex.evidence.some((e) => e.id === 'R7G-ASSET-BINDING-2026-09-19')) {
  evIndex.evidence.push({
    id: 'R7G-ASSET-BINDING-2026-09-19',
    findings: ['F-51', 'F-52', 'F-53'],
    raw: [
      'raw/negctl/nc-r7g-asset-content-binding.log',
      'raw/negctl/r7g-00-baseline.log',
      'raw/negctl/r7g-01-NOT-detected.log',
      'raw/negctl/r7g-02-widened-unbound.log',
      'raw/negctl/r7g-03-recapture.log',
      'raw/negctl/r7g-04-after-widened-recapture.log',
      'raw/negctl/r7g-06-repo-delivered-evidence.log',
    ],
    scratch: 'E:/qoder-r7i-2026-09-19/work (injections + genuine 8/8 Chromium re-capture + jest) and E:/qoder-fixwave-2026-09-19/verify-current (widened gate over delivered evidence, off-tree)',
    summary: 'Binding scope widened from spec.assets to spec.assets + assets/** (65 files / 4.9 MB across 8 stable examples; only 7 paths were declared). Pre-fix injections NOT detected (0 fail / EXIT 0); post-fix NC-E1..E7 all DETECTED with restore verified and copy-side integrity sweep drift 0. Copy reaches 0 fail / 1 warn after a genuine re-capture; jest 29 suites / 207 tests. Delivered evidence now 70 fail / 1 warn off-tree (F-53), re-evidence needs authorization.',
  });
}
fs.writeFileSync(path.join(A, 'evidence-index.json'), JSON.stringify(evIndex, null, 2) + '\n');

// --- verdict ---
const verdict = JSON.parse(before['global-verdict.json']);
const g = verdict.gates;
g.exampleStableVerify += ' | R7g scope fix 2026-09-19 (F-51/F-53): binding now covers spec.assets + assets/** (65 files, only 7 were declared); delivered evidence consequently 70 fail / 1 warn off-tree, re-evidence set = 8 browser ids + 5 DevTools ids + verify:v06-gate.';
g.negativeControls += ' | F-51 adds 7 executed asset-content controls (0-byte / same-size garbage / bound-file-removed / unbound-injected / zero-byte-on-disk / zero-byte-in-record), all DETECTED; F-52 discloses the one control that no offline hash can prove (asset already wrong at capture).';
verdict.blockingForRelease = verdict.blockingForRelease.map((b) => (
  String(b).startsWith('delivered-example-evidence-not-rebound')
    ? 'delivered-example-evidence-not-rebound-after-R7f/R7g-widened-binding (F-53 supersedes F-49: 70 fail / 1 warn off-tree, re-evidence = 8 browser ids + 5 DevTools ids + verify:v06-gate; needs authorization because those evidence paths are uncommitted and owned by a parallel session)'
    : b
));
verdict.candidateFreeze.refreeze_afterFixWave_r7g = 'tools/verify/v11-spec-common.cjs + tools/examples/spec-compliance-audit.cjs changed again after the fix-wave freeze; re-freeze before any candidate claim.';
fs.writeFileSync(path.join(A, 'global-verdict.json'), JSON.stringify(verdict, null, 2) + '\n');

// --- retest plan ---
const retestAdd = [
  '',
  '## R7g COMPLETION STATUS 2026-09-19 (asset content binding, F-51/F-52/F-53)',
  '',
  '- R7g **CLOSED for the offline surface, with a disclosed limit**: binding scope is now `spec.assets ∪ assets/**`',
  '  (65 files / 4.9 MB over 8 stable examples; only 7 paths were declared). Producer records',
  '  `{path, declared, bytes, hash, present}`; consumer asserts zero-byte (`S15-ASSET-ZERO`), bound-but-absent,',
  '  unbound-new-file and bytes/hash mismatch. Evidence: `raw/negctl/nc-r7g-asset-content-binding.log`.',
  '- **Corrected command list** (supersedes the 5/6-id lists in the fix-wave log §9/§9b):',
  '  `node tools/verify/v11-examples-verify.cjs --ids=static-model,gltf-viewer,gltf-basic,gltf-draco,gltf-meshopt,gltf-morph,gltf-skin,runtime-asset-release`',
  '  then `node tools/verify/v11-devtools-examples.cjs` then `npm run verify:v06-gate`.',
  '- R7g-limitation (new, non-blocking, = F-52): per-asset loadability at capture time is not proven for catalog-style',
  '  examples (gltf-viewer PASSed all 7 validators with one 0-byte model). Unlock = R1 provenance or per-asset coverage.',
  '- New R-item to keep in view: `docs/evidence/v06-catalog-runtime-gate.json` lists assets with `path/bytes/usage` but',
  '  **no hash** — same content-binding gap in the v06 catalog gate, not covered by `run.assetDigests`.',
  '',
].join('\n');
fs.writeFileSync(path.join(A, 'retest-plan.md'), before['retest-plan.md'].replace(/\s*$/, '\n') + '\n' + retestAdd);

// --- verification summary ---
const summaryAdd = [
  '',
  '## UPDATE-17 (2026-09-19) — R7g binding scope completed off-tree; overall remains NOT_READY',
  '',
  'The R7g fix wave bound only what `example.json` named. Measured: 8 stable examples ship 65 files / 4.9 MB under',
  '`assets/`, of which 7 paths were declared. With the pre-widening code, truncating `SimpleSkin_geometry.bin` to 0 B',
  'and replacing a `gltf-viewer` model with same-size garbage both left `spec-compliance-audit` at 0 fail / EXIT 0 —',
  'the same "exists therefore true" class as F-38/F-39, one level deeper. Scope is now `spec.assets ∪ assets/**` in both',
  'producer and consumer, plus a `S15-ASSET-ZERO` assertion. 7 injections DETECTED, each restored and hash-verified;',
  'copy-vs-project asset integrity sweep 65 files / drift 0; a genuine 8/8 PASS Chromium re-capture returns the copy to',
  '0 fail / 1 warn; jest 29 suites / 207 tests. Costs stated honestly: delivered evidence is now 70 fail / 1 warn',
  'off-tree (F-53 supersedes F-49, re-evidence set grew to 8 browser + 5 DevTools ids), no in-repo run was performed',
  'because those evidence paths are uncommitted and being rewritten by a parallel session; and a wrong-but-non-empty',
  'asset at capture time still cannot be disproved offline (F-52). Two search-agent claims were checked and rejected',
  'rather than repeated: "gltf-catalog ships 3 orphan .bin sidecars" (that example has no assets directory at all) and',
  '"the §11 zero-fail assertion lives in smoke-29-project-knowledge.test.ts" (the file is smoke-29-examples-spec.test.ts).',
  'Overall remains NOT_READY.',
  '',
].join('\n');
fs.writeFileSync(path.join(A, 'verification-summary.md'), before['verification-summary.md'].replace(/\s*$/, '\n') + '\n' + summaryAdd);

// --- lossless verification ---
const afterFindings = fs.readFileSync(path.join(A, 'findings.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
const beforeLines = before['findings.jsonl'].trim().split(/\r?\n/);
let lost = 0;
beforeLines.forEach((l, i) => { if (JSON.stringify(afterFindings[i]) !== JSON.stringify(JSON.parse(l))) { lost++; console.log('CHANGED-UNEXPECTED at ' + i); } });
console.log('findings before=' + beforeLines.length + ' after=' + afterFindings.length + ' unique=' + new Set(afterFindings.map((f) => f.findingId)).size + ' lostOrMutated=' + lost);
console.log('evidence entries=' + JSON.parse(fs.readFileSync(path.join(A, 'evidence-index.json'), 'utf8')).evidence.length);
const v2 = JSON.parse(fs.readFileSync(path.join(A, 'global-verdict.json'), 'utf8'));
console.log('blocking=' + v2.blockingForRelease.length + ' overall=' + v2.overall);
console.log('blocking item text: ' + v2.blockingForRelease.filter((b) => String(b).includes('F-53')).join(''));
const dangling = JSON.parse(fs.readFileSync(path.join(A, 'evidence-index.json'), 'utf8')).evidence.flatMap((e) => e.raw || []).filter((r) => !fs.existsSync(path.join(A, r)));
console.log('dangling raw refs=' + dangling.length + (dangling.length ? ' ' + dangling.join(',') : ''));
