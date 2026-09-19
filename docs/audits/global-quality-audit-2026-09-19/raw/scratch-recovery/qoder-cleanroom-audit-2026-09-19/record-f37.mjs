import fs from 'node:fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';

const f37 = {
  findingId: 'F-37',
  requirementId: "PLAN §5 '在隔离副本做关键负向控制：移除 decoder…排除必需测试…过期截图证据…验证测试真的会失败' + §4 测试真实执行清单",
  gate: 'negativeControls (3 controls executed: decoder-removal PASS-has-teeth, required-test-exclusion FAILS-to-detect, stale-screenshot INCONCLUSIVE) + testCredibility_jest (inventory completeness)',
  category: 'isolated-copy fault injection (repo minus node_modules at E:/qoder-negctl-audit-2026-09-19) + one CLI-flag-only jest run in the original tree (no file modified)',
  blocking: true,
  location: "tools/verify/decoder-audit.cjs (runs `npm pack` into build/.tmp-pack-audit-<ts>/package and requires the PACKED decoders); test/smoke/smoke-11-gltf-geometry.test.ts; tools/examples/spec-validate.cjs (requires '<repo>/node_modules/esbuild' by absolute path)",
  repro: "NC-B: in the copy, `node tools/verify/decoder-audit.cjs` -> EXIT 0, then `mv build/gltf-decoders/meshopt` away -> EXIT 1. NC-A: in the original tree, `jest --listTests` = 29 files; `node node_modules/jest/bin/jest.js --testPathIgnorePatterns smoke-11` -> 28 suites / 188 tests / EXIT 0 (207-188 = the 19 excluded tests). NC-C: in the copy, delete docs/evidence/examples/hello-cube.png then run tools/examples/spec-validate.cjs.",
  expected: "A required-test removal or a missing/stale visual evidence file must flip a mandatory gate RED, proving the gates are load-bearing rather than decorative",
  actual: "NC-B **PASS (has teeth)**: removing the vendored meshopt decoder makes decoder-audit EXIT 1 (failure mode is an unhandled MODULE_NOT_FOUND crash rather than a structured diagnostic -- usable but not clean). Bonus positive evidence: because decoder-audit loads decoders from a real `npm pack` output directory, the shipped tarball's decoders are proven require-able from the PACKAGE, narrowing F-20's 'offline decoder load from an installed package' from unknown to tool-level PASS. NC-A **FAIL (control not detected)**: excluding an entire required suite leaves jest fully GREEN (28/188, EXIT 0) -- nothing asserts the required test inventory (29 files / 207 tests is a convention; jest.config.js has no coverageThreshold/CI assertion), so a deleted or silently-skipped suite for any feature would pass CI as long as the remainder passes. NC-C **INCONCLUSIVE (my harness gap, not a project defect)**: spec-validate.cjs cannot run in my node_modules-less copy because it resolves esbuild via an absolute '<repo>/node_modules' path (MODULE_NOT_FOUND, and it then exits 1 for both control and injected) -> the screenshot control was NOT executed; it must be re-run in a copy that includes node_modules (the F-36 rebuild copy recipe works). FLAKINESS observed and disclosed: the FIRST identical NC-A run reported 'Test Suites: 2 failed, 26 passed, 171 tests' while the second reported 28 passed / EXIT 0 -> suite outcome is not reproducible while a parallel session mutates the tree, which is a direct consequence of the candidateIntegrity FAIL and means single-run green claims need re-running on a frozen candidate.",
  evidence: 'raw/negctl/nc-a-exclude-smoke11.log (the green run; the earlier flaky run exists only in the session transcript and is NOT in the retained log); this-run console capture of decoder-audit control EXIT 0 vs injected EXIT 1 (MODULE_NOT_FOUND on build/.tmp-pack-audit-*/package/build/gltf-decoders/meshopt/meshopt_decoder.cjs) and of the spec-validate esbuild failure; raw/negctl/nc-b-*.log + nc-c-*.log copied from scratch below',
  impact: "MATERIAL: §5's 'exclude a required test' control is NOT satisfied -> negativeControls stays PARTIAL and is now backed by a demonstrated detection gap (process/Engine-side, not INFRA). No consumer-facing artifact is wrong; the risk is that future regressions in a whole area could ship with a green test signal. apiCoverage/license/recipe/agent/benchmark/perf blockers unchanged.",
  minimalRecommendation: "Add an inventory assertion to the test gate: run jest with `--json` and fail unless the suite/test counts match a frozen expected manifest (or unless a required-suite list is fully present) -- e.g. assert 29 files / 207 tests and that each test/smoke/smoke-NN file reported a result; additionally turn decoder-audit's missing-decoder path into a structured FAIL message, and give spec-validate a resolvable esbuild (bare require or a documented toolchain path) so it can run in a copied tree.",
  retestScope: 'R7 (extended): after adding the inventory assertion, re-run `jest --testPathIgnorePatterns smoke-11` and expect the gate to flip RED; re-run NC-C (missing + stale screenshot) in a node_modules-bearing copy and expect the spec/manifest gate to reject; re-run NC-B on a frozen candidate and expect a clean structured FAIL. Repeat every green suite claim on the frozen candidate to exclude the observed flake.',
  verificationOwner: 'QA/Tooling owner',
  verdict: 'FAIL (required-test exclusion silently green) + PASS (decoder-removal detected) + NOT_RUN/INCONCLUSIVE (stale screenshot, my harness gap) -> negativeControls stays PARTIAL and blocks release'
};
fs.appendFileSync(DIR + '/findings.jsonl', JSON.stringify(f37) + '\n');

for (const [src, dst] of [['E:/qoder-negctl-audit-2026-09-19/ncb-control.log', 'nc-b-decoder-audit-control.log'],
  ['E:/qoder-negctl-audit-2026-09-19/ncb-inject.log', 'nc-b-decoder-audit-injected.log'],
  ['E:/qoder-negctl-audit-2026-09-19/ncc2-restored.log', 'nc-c-spec-validate-node_modules-missing.log'],
  ['E:/qoder-negctl-audit-2026-09-19/ncc-manifest.log', 'nc-c-generate-manifest-after-deletion.log'],
  ['E:/qoder-negctl-audit-2026-09-19/ncc-cov.log', 'nc-c-coverage-report-after-deletion.log']]) {
  if (fs.existsSync(src)) fs.copyFileSync(src, DIR + '/raw/negctl/' + dst);
}
console.log('raw/negctl:', fs.readdirSync(DIR + '/raw/negctl').join(', '));

const lines = fs.readFileSync(DIR + '/findings.jsonl', 'utf8').trim().split('\n');
lines.forEach((l, i) => { try { JSON.parse(l); } catch (e) { console.log('BAD', i + 1); process.exit(1); } });
console.log('findings OK lines=' + lines.length);

const v = JSON.parse(fs.readFileSync(DIR + '/global-verdict.json', 'utf8'));
v.gates.negativeControls = "PARTIAL (F-33 anti-stale fingerprint controls PASS + F-37 this-run fault injection: NC-B decoder removal IS detected (decoder-audit EXIT 0 control -> EXIT 1 after moving build/gltf-decoders/meshopt; failure is an unhandled MODULE_NOT_FOUND, and its npm-pack-based loading path proves the shipped tarball decoders are require-able -> narrows F-20 to tool-level PASS). NC-A 'exclude a required test' FAILS to be detected: jest --testPathIgnorePatterns smoke-11 -> 28 suites/188 tests EXIT 0 (GREEN) because no gate asserts the required inventory (29 files/207 tests is convention only, no coverageThreshold). NC-C stale/missing screenshot INCONCLUSIVE: spec-validate.cjs needs an absolute <repo>/node_modules/esbuild so it cannot run in my node_modules-less copy -> must re-run in a node_modules-bearing copy. FLAKE observed: the first identical NC-A run had 2 failed suites, the second was all-green -> single-run green claims must be re-taken on a frozen candidate. STILL NOT_RUN: browser-render injections (in-browser decoder removal / animation-stop / texture-ref break / stale screenshot at canvas / agent compile-fail / sacrifice isolation) -> R7)";
v.gates.testCredibility_jest = "PASS-with-GAP (29/29 files, 207/207, 0 only/skip/todo, no fixed-PASS/swallow/mock-main-path found by source reading; BUT F-37: inventory completeness is unenforced -> removing a whole required suite stays green, and one flaky run was observed under the mutating tree)";
if (!v.blockingForRelease.includes('negativeControls')) v.blockingForRelease.push('test-inventory-completeness (F-37)');
fs.writeFileSync(DIR + '/global-verdict.json', JSON.stringify(v, null, 2) + '\n');

const idx = JSON.parse(fs.readFileSync(DIR + '/evidence-index.json', 'utf8'));
idx.evidence.push({
  id: 'NEGCTL-2026-09-19',
  findings: ['F-37'],
  raw: ['raw/negctl/nc-a-exclude-smoke11.log', 'raw/negctl/nc-b-decoder-audit-control.log', 'raw/negctl/nc-b-decoder-audit-injected.log', 'raw/negctl/nc-c-spec-validate-node_modules-missing.log', 'raw/negctl/nc-c-generate-manifest-after-deletion.log', 'raw/negctl/nc-c-coverage-report-after-deletion.log'],
  scratch: 'E:/qoder-negctl-audit-2026-09-19/repo (isolated copy, deleted after the controls)',
  summary: 'Fault injection: decoder removal detected (EXIT 1) but required-test exclusion silently green (28/188 EXIT 0) -> negativeControls stays PARTIAL/blocking; screenshot-staleness control inconclusive (tool needs absolute node_modules)'
});
fs.writeFileSync(DIR + '/evidence-index.json', JSON.stringify(idx, null, 2) + '\n');
JSON.parse(fs.readFileSync(DIR + '/global-verdict.json', 'utf8'));
console.log('verdict + evidence-index updated, entries=' + idx.evidence.length);
