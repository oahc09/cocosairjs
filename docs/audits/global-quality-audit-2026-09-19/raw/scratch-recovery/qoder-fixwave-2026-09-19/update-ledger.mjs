import fs from 'fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';
const V = DIR + '/global-verdict.json';
const E = DIR + '/evidence-index.json';
const S = DIR + '/verification-summary.md';
const R = DIR + '/retest-plan.md';
const LOG = 'raw/gates/fixwave-r7-2026-09-19.log';

/* ---- 1. evidence index: append one entry, keep everything else byte-preserved ---- */
const idx = JSON.parse(fs.readFileSync(E, 'utf8'));
if (idx.evidence.some((x) => x.id === 'FIXWAVE-R7-2026-09-19')) { console.log('evidence entry exists, skip'); }
else {
  idx.evidence.push({
    id: 'FIXWAVE-R7-2026-09-19',
    findings: ['F-48', 'F-49', 'F-50'],
    raw: [LOG],
    scratch: 'E:/qoder-r7i-2026-09-19/work (implement + inject) and E:/qoder-fixwave-2026-09-19/verify-current (ported gates re-run against current repo content, outside the repo)',
    summary: 'R7a inventory gate (4 injections DETECTED incl. --testPathIgnorePatterns=smoke-11), R7c structured decoder failure, R7h coverage exit code both directions, OBS-3 no-git metadata, OBS-4 revision-reachable-from-HEAD assertion, R7f screenshot bytes+hash binding (delete / same-size garbage / truncation DETECTED; identical frame reproduced by a real Chromium re-capture), R7g assetDigests binding partial (0-byte + same-size garbage DETECTED). Copy reaches spec-compliance 0 fail after re-evidence; current delivered evidence yields 11 fail / 1 warn, all pre-binding rows.',
  });
  fs.writeFileSync(E, JSON.stringify(idx, null, 2) + '\n');
}
const idx2 = JSON.parse(fs.readFileSync(E, 'utf8'));
const missing = idx2.evidence.flatMap((x) => (x.raw || []).filter((p) => !fs.existsSync(DIR + '/' + p)).map((p) => x.id + ' -> ' + p));
console.log('evidence entries', idx2.evidence.length, '| dangling raw pointers:', missing.length ? missing : 'none');

/* ---- 2. verdict: mutate only the keys this wave owns ---- */
const v = JSON.parse(fs.readFileSync(V, 'utf8'));
const g = v.gates;
g.testCredibility_jest += ' | F-48 addendum (fix wave): inventory completeness is now MACHINE-ENFORCED by tools/verify/test-inventory.cjs (jest --json, committed docs/test-inventory.json, non-passing status = FAIL). Retest from R7a passes: the same --testPathIgnorePatterns=smoke-11 exclusion that left npm test GREEN 28/188 EXIT 0 now returns EXIT 1 with "required suite not executed", plus 3 more DETECTED injections (suite removed, test title renamed, test.skip). npm test itself is unchanged - the gate is a separate entry point (npm run verify:test-inventory), so adoption into the release checklist is still open.';
g.negativeControls += ' | F-48/F-49 addendum: three of the previously EXECUTED-BUT-NOT-DETECTED controls now flip to DETECTED after remediation, re-proven in isolated copies: required-test exclusion (R7a gate), screenshot content (delete / same-size garbage / truncation, R7f), asset content (0-byte / same-size garbage, R7g). §5 tally: 8 of 9 executed and 8 detected, 1 NOT_RUN (agent compile-fail, needs R5 infrastructure). No existing assertion was weakened; the F-41 frame-diff 400 ms two-frame contract and its thresholds are byte-unchanged.';
g.exampleStableVerify += ' | F-49 addendum: the offline re-check is no longer existence-only - S11-SCREENSHOT requires on-disk bytes == evidence bytes and sha256(png)[0..16) == evidence hash, and stable rows whose evidence carries no hash now FAIL. Consequence stated plainly: against the delivered evidence the audit reports 11 fail / 1 warn (5 DevTools screenshots without hash + 6 example assets without assetDigests; 0 bytes/hash contradictions), so in-repo smoke-29 is RED until those two example gates re-run in-repo (blocked on authorization: the target evidence files are uncommitted and being rewritten by the parallel session). In the isolated copy the same chain reaches 0 fail / 1 warn after genuine re-capture, and the gltf-basic re-capture reproduced the identical 21695 B / 2111b65b8ff3af23 frame.';
g.apiCoverage += ' | F-48 addendum (R7h): coverage-report.cjs now sets process.exitCode from the three tier pass flags and package.json exposes npm run verify:api-coverage as the authoritative entry point. Verified in both directions: current truth (core 49/717) EXIT 1, sacrificial threshold=0 probe EXIT 0, restore EXIT 1. The gate is still FAIL - enforcement was the gap, the 93% Core shortfall is untouched.';
g.v06FinalGate_recipe += ' | F-48 addendum (OBS-3/OBS-4): benchmark-evidence.metadata() no longer aborts outside a git working tree (baseRevision null + gitAvailable false), and v06-report now BLOCKS unless every recorded revision (dual/catalog/recipe batch + all 30 run.revision) is reachable from HEAD - proven by an unreachable-revision injection (EXIT 1 BLOCKED) and restored control (EXIT 0 PASS), with the real c2e71bb / 3a53957 / 30e97e3 resolving true against repo history. Delivered recipe evidence still carries sourceHash f5ebd60f... vs the current tree ac1b1515..., so the in-repo chain remains FAIL while the off-tree 30/30 rebind stands.';
g.decoderAudit = String(g.decoderAudit) + ' | F-48 addendum (R7c): the missing-decoder path is now a structured FAIL (3 named failures, 0 bytes of stderr) instead of an unhandled MODULE_NOT_FOUND trace; exit code unchanged (1).';
g.candidateIntegrity += ' | F-50 re-freeze: current working tree after the ported wave = HEAD fbf5ae2774174086af6897cbba3e3a3a37a78242, 3587 files, whole-tree digest 7d1f7e11f5bee3bf (formula: sha256 over sorted "<hash>  ./<path>" rows, excluding node_modules, .git and SHA256MANIFEST.txt; NOT numerically comparable to F-43 677cce412ce454b4, which used a different row format - the per-file diff is the reproducible statement: 0 removed, 14 changed (9 = this wave tools, 5 = this audit own docs), 353 added, every added path under build/.tmp-* leftovers). sourceHash scope unchanged (ac1b1515...), so this wave invalidated no browser/recipe/catalog evidence.';
const drop = ['test-inventory-completeness (F-37)', 'screenshot-content-binding (F-38)', 'asset-content-binding (F-39)'];
v.blockingForRelease = v.blockingForRelease.filter((x) => !drop.includes(x));
const rebind = 'delivered-example-evidence-not-rebound-after-R7f/R7g-binding (F-49, needs authorization: rewrites uncommitted docs/evidence)';
if (!v.blockingForRelease.includes(rebind)) v.blockingForRelease.push(rebind);
v.candidateFreeze.refreeze_afterFixWave = {
  head: 'fbf5ae2774174086af6897cbba3e3a3a37a78242',
  filesHashed: 3587,
  digestFormula: 'sha256 over sorted "<hash>  ./<path>", excludes node_modules/.git/SHA256MANIFEST.txt',
  manifestDigest16: '7d1f7e11f5bee3bf',
  vsFrozenF43: '0 removed / 14 changed (9 tools this wave, 5 audit docs) / 353 added, all build/.tmp-* leftovers',
  sourceHash: 'ac1b151596b3697554fdaa31d384714f91062562c646ceb103ffc2a8bc7b0bfa (unchanged)',
  inRepoSideEffects: '11 files written (10 tool/package ports + 1 new manifest, all byte-verified against the frozen snapshot first); 0 evidence/source/test/build files touched; nothing staged, committed or pushed',
  evidence: LOG,
};
v.overall = 'NOT_READY';
fs.writeFileSync(V, JSON.stringify(v, null, 2) + '\n');
const v2 = JSON.parse(fs.readFileSync(V, 'utf8'));
console.log('gates', Object.keys(v2.gates).length, '| blocking', v2.blockingForRelease.length, '| overall', v2.overall);

/* ---- 3. summary + retest plan: append-only ---- */
const sum = '\n\n---\n## UPDATE 16 — authorized fix wave executed (R7a / R7c / R7f / R7g partial / R7h / OBS-3 / OBS-4)\n' +
  '- Everything was implemented and injected in an isolated copy first (`E:/qoder-r7i-2026-09-19/work`, the F-41/R7i toolchain recipe), then ported into the repo only after each target file was re-verified byte-identical to the F-43 frozen snapshot (`blocked=0`). The ported set is 10 tool/package files + 2 new files (`tools/verify/test-inventory.cjs`, `docs/test-inventory.json`). No `src/`, `examples/`, `test/`, `build/` file and no evidence JSON/PNG was written inside the repo; nothing staged, committed or pushed. Full log: `' + LOG + '`.\n' +
  '- New or hardened assertions, each with a proven DETECTED injection: suite/test inventory (4 controls, incl. the exact `--testPathIgnorePatterns=smoke-11` retest R7a demanded, which `npm test` had passed GREEN); screenshot content binding (delete / same-size garbage / truncation); declared-asset content binding (0-byte / same-size garbage); coverage tiers now drive the exit code (FAIL at core 49/717, and a sacrificial threshold=0 probe proved EXIT 0 is reachable); recorded revisions must be commits reachable from HEAD (unreachable-revision injection -> BLOCKED, restore -> PASS); `metadata()` survives a missing `.git` (F-46 crash removed) instead of aborting a 30-recipe run.\n' +
  '- Nothing was weakened to get there: the frame-diff 400 ms two-frame contract and its thresholds are byte-unchanged (F-41 guardrail), and smoke-22 / smoke-23 were not touched (F-44 keeps their DETECTED status intact). The work copy is 29 suites / 207 tests PASS after all edits; the gltf-basic re-capture reproduced the identical 21695 B / 2111b65b8ff3af23 frame, which is why "the tightened gate is satisfiable by a real run, not by hand-editing evidence" can be claimed.\n' +
  '- Honest cost (F-49, blocking): the tightened gate is stricter than the *delivered* evidence, so against current repo content spec-compliance reports 11 fail / 1 warn - every one of them "evidence recorded before binding existed" (5 DevTools screenshots without hash, 6 example assets without assetDigests), with zero bytes/hash contradictions. Because smoke-29 asserts spec-compliance zero-fail, `npm test` in the repo is RED until the two example gates run in-repo. Those commands rewrite `docs/evidence/*.json` and `docs/evidence/examples/*.png`, all of which are uncommitted and being rewritten by the parallel session right now, so they were deliberately NOT run. In the copy the same chain closes at 0 fail / 1 warn.\n' +
  '- Gate movements: `testCredibility_jest` gap now machine-enforced (adoption into CI still open), `negativeControls` 8/8 executed controls now DETECTED (agent compile-fail still NOT_RUN), `exampleStableVerify` offline half no longer existence-only but pending re-evidence, `apiCoverage` enforced yet still FAIL at 6.8% Core, `v06FinalGate_recipe` attribution enforced and still FAIL in-repo (delivered recipe sourceHash f5ebd60f vs current ac1b1515). `blockingForRelease` 14 -> 12 (three binding items closed by code, one re-evidence item opened). Overall stays **NOT_READY**: no gate was promoted to PASS on the delivered candidate.\n' +
  '- R7g stays PARTIAL by design and is labelled as such: digests are recorded in EVIDENCE (not in `example.json`, which would churn every specFingerprint) and are taken from the same working tree as the run, so post-capture replacement is detectable while an already-wrong upstream asset still needs the R1 provenance/license work.\n' +
  '- Also surfaced (F-50, non-blocking): the 3234 -> 3587 file delta is entirely `build/.tmp-*` leftovers from earlier runs, invisible to git but inside any whole-tree candidate digest; and one full jest run in a partial copy flaked ("suite failed to execute: smoke-05", 204 tests) while the identical command immediately after was 207/207.\n';
fs.appendFileSync(S, sum);
const ret = '\n\n---\n## FIX-WAVE STATUS 2026-09-19 (F-48 / F-49 / F-50, evidence `raw/gates/fixwave-r7-2026-09-19.log`)\n' +
  '- R7a CLOSED: `tools/verify/test-inventory.cjs` + `docs/test-inventory.json` + `npm run verify:test-inventory`. Recorded retest satisfied: `-- --testPathIgnorePatterns=smoke-11` -> EXIT 1 "required suite not executed" (was GREEN 28/188). Three further injections DETECTED (suite removed, title renamed, test.skip).\n' +
  '- R7c CLOSED: missing decoder -> 3 structured failures, stderr 0 bytes, EXIT 1 (control EXIT 0).\n' +
  '- R7f CLOSED: S11-SCREENSHOT now binds on-disk bytes + sha256[0..16) to the evidence record; DevTools producer now records the hash like the browser producer. NC-C1 (delete), NC-C2 (same-size garbage -> hash branch), NC-C2b (truncation -> bytes branch) all EXIT 1; fresh real-Chromium re-capture reproduces the same frame and passes.\n' +
  '- R7g PARTIAL: `assetDigestsOf()` recorded by all three producers + S15-ASSET-BIND enforced; 0-byte and same-size garbage DETECTED. Still open: provenance of an asset that was already wrong at capture time (needs R1), and in-repo re-evidence (F-49).\n' +
  '- R7h CLOSED: exit code from tier flags + `npm run verify:api-coverage` named as the authoritative entry; both directions proven. The underlying Core 100% shortfall is R2 work, untouched.\n' +
  '- F-46 OBS-3 CLOSED (`.git` tolerated, `gitAvailable` reported) and OBS-4 CLOSED with a deliberate contract choice: revision is ATTRIBUTION (must be a commit reachable from HEAD), not freshness - demanding `revision == HEAD` was rejected as it would force a 30-recipe browser re-run per unrelated commit; the recorded-vs-HEAD delta is printed in `docs/v06-final-gate.md` instead.\n' +
  '- R4/R0 consequence: `sourceHash` (ac1b1515...) unchanged by this wave, so the F-45/F-46/F-47 off-tree rebinds remain valid; the re-freeze is recorded in `candidateFreeze.refreeze_afterFixWave`.\n' +
  '- NEW blocking item for the plan: re-run `v11-examples-verify --ids=gltf-draco,gltf-meshopt,gltf-morph,gltf-skin,runtime-asset-release` + `v11-devtools-examples` in-repo (needs authorization; rewrites uncommitted evidence), then `verify:v06-gate`. Until then `npm test` is RED via smoke-29 by design, not by accident.\n';
fs.appendFileSync(R, ret);
console.log('summary + retest-plan appended (bytes):', sum.length, ret.length);
