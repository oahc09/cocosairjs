import fs from 'node:fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';

const f39 = {
  findingId: 'F-39',
  requirementId: "PLAN §5 '断开纹理/资产引用' 负向控制 + 合同 §15 Assets complete / 证据按内容依赖失效",
  gate: 'negativeControls / exampleSpecStructure (§15 Assets complete credibility)',
  category: 'fault injection in a SPARSE isolated copy outside the repo (E:/qoder-negctl3-2026-09-19/repo: tools+docs+examples+package.json+build/cocosair.d.ts only)',
  blocking: true,
  location: 'tools/examples/spec-compliance-audit.cjs:234 -- S15-FREEZE uses only fs.existsSync(exampleDir/asset)',
  repro: 'Target examples/gltf-basic/assets/BoxTextured.glb (status=stable, forward-decode supported, 5956 B). (1) control spec-compliance EXIT 0, "45 examples: 0 fail / 1 warn". (2) truncate the .glb to 0 B -> EXIT 0. (3) overwrite with 27 bytes of garbage (invalid glTF magic) -> EXIT 0. Restored in copy byte-identical; the ORIGINAL repo file verified byte-identical afterwards (untouched). texture-basic and static-model declare no on-disk asset in their spec, so gltf-basic is the strongest stable target available.',
  expected: 'Destroying the bytes of an asset that a stable example PASS depends on must invalidate that example evidence (the model cannot load, so the scene/render claim is false) -- §5 requires the tests to really fail.',
  actual: 'NOT DETECTED by any offline deterministic gate: the asset is checked with existsSync only (no size, magic, MIME, or content hash), and nothing binds example.json assets to the captured evidence, so the stale PASS record keeps asserting "Assets complete" after the asset is destroyed. Fairness note: the browser runner does capture failures at run time (a corrupt glb would fail visible-frame / asset-loaded checks when v11-examples-verify.cjs is re-run in Chromium), so this is an offline registry/gate gap, not proof the engine mis-renders.',
  evidence: 'raw/negctl/nc-d-asset-content-injection.log  [CAUTION disclosed in the log itself: the license-audit section lists 8 issues, of which 6 (missing root LICENSE / THIRD_PARTY_LICENSES.md / UPSTREAM.md and missing decoder dirs draco/meshopt/basis) are artifacts of MY sparse copy, NOT new project defects; only the two example .LICENSE.md issues are real and already recorded as F-27]',
  impact: 'MATERIAL for evidence credibility, same class as F-38: the last link (spec / PASS record <-> actual asset bytes) is unbound, so an example can remain stable with a zero-byte asset. negativeControls stays PARTIAL and gains blocking item asset-content-binding.',
  minimalRecommendation: 'In spec-compliance-audit.cjs S15-FREEZE replace existsSync with existsSync && statSync().size > 0 && sha256(asset) === hash recorded at capture time in v11-examples-verified.json (share one helper with the F-38 screenshot fix); at minimum require size > 0 plus a format magic check (glTF "glTF" header, PNG signature). No thresholds or assertions changed.',
  retestScope: 'R7g [NEW]: after the fix re-run NC-D1 (0 B) and NC-D2 (garbage) expecting EXIT 1 each, and a healthy re-captured asset expecting EXIT 0; re-run on the frozen candidate (R0).',
  verificationOwner: 'QA/Tooling owner',
  verdict: 'FAIL (§5 break-asset-reference control not detected offline) -> negativeControls stays PARTIAL/blocking',
};

const f40 = {
  findingId: 'F-40',
  requirementId: "结果要求 '逐 Gate PASS/FAIL，任何必需失败阻断整体 PASS' + 合同 Core verified=100%",
  gate: 'apiCoverage (gate enforcement mechanics)',
  category: 'exit-code semantics inspection + this-run execution',
  blocking: false,
  location: 'tools/examples/coverage-report.cjs:129-131 prints "Core gate (100% verified): FAIL"; occurrences of process.exit in that file = 0; package.json has no script entry for coverage-report',
  repro: 'node tools/examples/coverage-report.cjs -> stdout prints Core/Important/Advanced all FAIL while the process exits 0 (see the CONTROL coverage-report section of raw/negctl/nc-d-asset-content-injection.log).',
  expected: 'A mandatory gate that reports FAIL should be machine-enforceable (non-zero exit, or consumed by something that blocks).',
  actual: 'Report-only. The tool is honest (prints FAIL, never inflates claimed into verified -- F-26) and this audit blocks manually, but any && CI chain or npm script treating it as a gate would pass at Core 6.8%.',
  evidence: 'raw/negctl/nc-d-asset-content-injection.log',
  impact: 'Hygiene; non-blocking by itself because apiCoverage already FAILS as a gate in this report. Becomes material the moment coverage-report is wired into CI as if it enforced something.',
  minimalRecommendation: 'Set process.exitCode = allTiersPass ? 0 : 1 at the end of coverage-report.cjs, or add a verify wrapper / npm script verify:api-coverage that reads docs/api-coverage-report.json and exits non-zero; document which tool is the authoritative gate. No threshold changes.',
  retestScope: 'R2-adjacent: after the denominator adjudication (R2) and verification backfill, CI must go RED until Core 100% / Important >=90% / Advanced >=80% without a human reading stdout.',
  verificationOwner: 'QA/Tooling owner',
  verdict: 'FAIL-as-advisory (non-blocking hygiene; the apiCoverage gate itself remains FAIL)',
};

fs.appendFileSync(DIR + '/findings.jsonl', JSON.stringify(f39) + '\n' + JSON.stringify(f40) + '\n');
const lines = fs.readFileSync(DIR + '/findings.jsonl', 'utf8').trim().split('\n');
lines.forEach((l, i) => { try { JSON.parse(l); } catch { console.log('BAD', i + 1); process.exit(1); } });
console.log('findings OK lines=' + lines.length);

const v = JSON.parse(fs.readFileSync(DIR + '/global-verdict.json', 'utf8'));
v.gates.negativeControls = String(v.gates.negativeControls).replace(
  'STILL NOT_RUN: browser-render injections',
  'F-39 asset-content control EXECUTED in a sparse copy outside the repo: zero-byte AND garbage BoxTextured.glb inside a status=stable example both leave spec-compliance-audit EXIT 0 (S15-FREEZE is existsSync-only, tools/examples/spec-compliance-audit.cjs:234) -> "Assets complete" is existence-only as well, though a re-run browser verify would catch it at capture time. STILL NOT_RUN: browser-render injections');
v.apiCoverageEnforcement = 'ADVISORY (F-40): coverage-report prints Core/Important/Advanced FAIL yet contains no process.exit -> EXIT 0, and it is not wired into package.json scripts, so nothing machine-blocks a 6.8% Core. apiCoverage itself stays FAIL regardless.';
if (!v.blockingForRelease.includes('asset-content-binding (F-39)')) v.blockingForRelease.push('asset-content-binding (F-39)');
fs.writeFileSync(DIR + '/global-verdict.json', JSON.stringify(v, null, 2) + '\n');

const idx = JSON.parse(fs.readFileSync(DIR + '/evidence-index.json', 'utf8'));
idx.evidence.push({
  id: 'NEGCTL-ASSET-2026-09-19',
  findings: ['F-39', 'F-40'],
  raw: ['raw/negctl/nc-d-asset-content-injection.log'],
  scratch: 'E:/qoder-negctl3-2026-09-19/repo (sparse copy outside the repo, deleted after capture)',
  summary: 'Break-asset-reference control: zero-byte + garbage glTF silently green offline (S15 existence-only); coverage-report reports gate FAIL but exits 0 (advisory). Original repo files verified untouched after injection.',
});
fs.writeFileSync(DIR + '/evidence-index.json', JSON.stringify(idx, null, 2) + '\n');
console.log('blocking(' + v.blockingForRelease.length + '): ' + v.blockingForRelease.join(', '));
console.log('evidence entries=' + idx.evidence.length);
