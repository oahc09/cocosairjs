import fs from 'fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';
const FILE = DIR + '/findings.jsonl';
const LOG = 'raw/gates/fixwave-r7-2026-09-19.log';
const before = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/);
const ids = before.map((l) => JSON.parse(l).findingId);
const add = [
  {
    findingId: 'F-48',
    requirementId: 'mandate step 5 (key negative controls must really fail) + step 10 (minimal fix suggestions), retest-plan R7a/R7c/R7f/R7h and F-46 OBS-3/OBS-4',
    gate: 'testCredibility_jest + negativeControls + apiCoverageVerified + v06FinalGate_recipe',
    category: 'authorized fix wave executed: four unenforced gates made machine-enforceable, each proven with inject->RED->restore->GREEN in an isolated copy',
    blocking: false,
    location: 'tools/verify/test-inventory.cjs (new), docs/test-inventory.json (new), tools/examples/coverage-report.cjs, tools/verify/decoder-audit.cjs, tools/verify/benchmark-evidence.cjs, tools/verify/v06-report.cjs, package.json (verify:test-inventory / verify:api-coverage)',
    repro: 'cd E:/qoder-r7i-2026-09-19/work ; NODE_PATH=<orig>/node_modules node tools/verify/test-inventory.cjs [-- --testPathIgnorePatterns=smoke-11] ; node tools/examples/coverage-report.cjs ; node tools/verify/decoder-audit.cjs ; node tools/verify/v06-report.cjs ; full detail in ' + LOG + ' section 2-5',
    expected: 'every new assertion must be satisfied by a healthy candidate and must flip RED on a targeted injection, without weakening any existing assertion (F-41 guardrail)',
    actual: 'R7a inventory gate: CONTROL 29 suites/207 tests EXIT 0; DETECTED on 4 injections (suite excluded via --testPathIgnorePatterns -> "required suite not executed"; suite file removed -> "suite set drifted (manifest 29, on disk 28)"; test title renamed -> missing+new pair; test.skip -> "test not passed (pending)"). R7h: EXIT 1 at core 49/717 (0.068) and EXIT 0 with a sacrificial threshold=0 probe, so the code tracks the tier flags rather than hardcoding. R7c: missing decoder now yields 3 structured failures + 0 bytes of stderr (was an unhandled MODULE_NOT_FOUND trace). OBS-3: metadata() with .git renamed returns baseRevision null / gitAvailable false without throwing (F-46 crash gone). OBS-4: v06-report now requires every recorded revision (dual/catalog/recipe batch/30 run.revision) to be reachable from HEAD - DETECTED by injecting an unreachable deadbeef revision (EXIT 1, BLOCKED), GREEN after restore, and true for the real c2e71bb / 3a53957 / 30e97e3. Full suite after all edits: 29/207 PASS in the work copy. sourceHash unchanged (ac1b1515...), so no existing evidence was invalidated by the wave.',
    impact: 'the two audit-verified blind spots that were cheapest to close are closed with demonstrated teeth, and the revision field stops being decorative. npm test still cannot notice a dropped suite.',
    minimalRecommendation: 'none outstanding for these four items; wire verify:test-inventory into the release checklist entry point (do not add it to npm test, which already owns jest runtime).',
    retestScope: 'run verify:test-inventory + verify:api-coverage + verify:decoders + verify:v06-gate on every future frozen candidate; re-prove one injection per release as a standing negative control.',
    verificationOwner: 'audit agent (executed) / release owner (adopt into checklist)',
    verdict: 'FIXED-AND-PROVEN (off-tree controls); adoption into CI/release checklist still open',
    evidence: [LOG],
  },
  {
    findingId: 'F-49',
    requirementId: 'mandate step 5/7 (11 Screenshot Current and 15 Assets complete must be checkable offline) + retest-plan R7f/R7g',
    gate: 'exampleStableVerify + negativeControls + candidateIntegrity',
    category: 'screenshot and declared-asset content are now bound to evidence bytes+hash; delivered evidence predates the binding, so the in-repo chain is RED until re-evidenced',
    blocking: true,
    location: 'tools/examples/spec-compliance-audit.cjs (S11-SCREENSHOT hash/bytes branch, new S15-ASSET-BIND branch), tools/verify/v11-spec-common.cjs (assetDigestsOf), tools/verify/v11-examples-verify.cjs + tools/verify/v11-devtools-examples.cjs (result records)',
    repro: 'cd E:/qoder-fixwave-2026-09-19/verify-current (current repo content, outside the repo) ; NODE_PATH=<orig>/node_modules node tools/examples/spec-compliance-audit.cjs ; and in E:/qoder-r7i-2026-09-19/work: the NC-C1/NC-C2/NC-C2b/NC-D1/NC-D2 injections in ' + LOG + ' section 6-7',
    expected: 'F-38 (garbage screenshot accepted) and F-39 (0-byte / garbage asset accepted) must both flip RED, and a genuine fresh capture must still pass',
    actual: 'DETECTED: deleted png, same-size garbage png (hash branch: 731bcb86 != 2111b65b), 31-byte truncated png (bytes branch), 0-byte BoxTextured.glb, same-size garbage glb (fc722a72 != b510eca2). FRESH CAPTURE STILL PASSES: real Chromium re-run of gltf-basic reproduced the identical 21695 B / 2111b65b8ff3af23 frame, and after re-capturing the 6 asset examples + re-running the DevTools gate the audit reached "45 examples: 0 fail / 1 warn" EXIT 0 in the copy. Against CURRENT delivered evidence the gate reports 11 fail / 1 warn, all of the form "evidence produced before binding existed" (5 DevTools screenshots without hash, 6 example assets without assetDigests) and zero bytes/hash contradictions - i.e. the delivered frames do not contradict their records, they simply were never bound. Because smoke-29 asserts spec-compliance zero-fail, npm test in the repo is RED until those two example gates run in-repo. Asset binding stays PARTIAL: digests come from the same working tree as the run, so post-capture replacement is detectable while an already-wrong upstream asset is not (needs the R1 license/provenance work).',
    impact: 'closes the offline half of F-38/F-39 (a rotated or frozen artifact no longer passes silently) at the cost of one re-evidence run that currently collides with the parallel session uncommitted evidence files.',
    minimalRecommendation: 'with explicit authorization (it rewrites docs/evidence/*.json + docs/evidence/examples/*.png, all of them uncommitted): node tools/verify/v11-examples-verify.cjs --ids=gltf-draco,gltf-meshopt,gltf-morph,gltf-skin,runtime-asset-release then node tools/verify/v11-devtools-examples.cjs, then npm run verify:v06-gate; alternatively let the parallel session finish and re-run the whole example chain once on a quiet tree.',
    retestScope: 'after re-evidence: spec-compliance must reach 0 fail in-repo, smoke-29 GREEN, and one NC-C2-style garbage-frame injection must stay RED (the new assertions must keep teeth after rebinding).',
    verificationOwner: 'user decision (authorization) + dev agent (re-run), audit agent re-verifies',
    verdict: 'FIXED (assertions in place, controls proven) / DELIVERED EVIDENCE NOT YET REBOUND - in-repo chain RED',
    evidence: [LOG],
  },
  {
    findingId: 'F-50',
    requirementId: 'mandate step 1 (non-driftable candidate identity) + step 5 (harness honesty)',
    gate: 'candidateIntegrity + testCredibility_jest',
    category: 'two harness-level observations surfaced by the fix wave',
    blocking: false,
    location: 'build/.tmp-v03-site-*/ (78 files x 3), build/.tmp-cache-test-*/, build/.tmp-dev-*/, build/.tmp-rollup-cache/; jest suite execution in copied trees',
    repro: 'node E:/qoder-fixwave-2026-09-19/freeze.cjs <root> <out> (walks all files except node_modules/.git/SHA256MANIFEST.txt) ; then diff against E:/qoder-frozen-2026-09-19/candidate',
    expected: 'the candidate digest should cover a tree whose churn has an owner, and a full-suite run should not fail intermittently for reasons unrelated to the candidate',
    actual: 'frozen 3234 files -> current 3587 files: 0 removed, 14 changed (9 = this wave tools, 5 = this audit own docs), 353 added and every added path lives under build/.tmp-* scratch directories left by earlier dev/verify runs. They are git-ignored so no one sees them, yet they sit inside any whole-tree freeze digest, so the "candidate identity" moves with unrelated leftovers. Separately, one full jest run in a partial copy reported "suite failed to execute: smoke-05" with 204 tests while the same suite passed standalone and the next identical run was 207/207 - a copy-side execution flake that the new inventory gate surfaces as a structured failure.',
    impact: 'candidate digests are noisier than they need to be; the green-vs-flaky distinction has to be made manually until the temp dirs are owned/cleaned.',
    minimalRecommendation: '(a) name an owner for the build/.tmp-* leftovers or scope the freeze walk to git-tracked + untracked-but-not-ignored paths; (b) if the smoke-05 flake reappears in a real repo run, treat it as a test-infrastructure defect, not as noise to retry away.',
    retestScope: 're-freeze on a cleaned tree and confirm the added-file count returns to the real change set; re-run the full suite twice in-repo after R0-style quiescence.',
    verificationOwner: 'release owner (cleanup) / audit agent (re-freeze)',
    verdict: 'OBSERVATION (non-blocking)',
    evidence: [LOG],
  },
];
const newIds = add.map((a) => a.findingId);
const clash = newIds.filter((i) => ids.includes(i));
if (clash.length) { console.error('ID COLLISION, abort:', clash); process.exit(1); }
fs.appendFileSync(FILE, add.map((a) => JSON.stringify(a)).join('\n') + '\n');
const after = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/);
const afterIds = after.map((l) => JSON.parse(l).findingId);
console.log('lines', before.length, '->', after.length, '| unique', new Set(afterIds).size, '| dupes:', afterIds.filter((x, i) => afterIds.indexOf(x) !== i).join(',') || 'none');
console.log('preserved earlier ledger:', afterIds.slice(0, before.length).join(',') === ids.join(','));
console.log('tail:', afterIds.slice(-5).join(' '));
