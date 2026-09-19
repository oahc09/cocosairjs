import fs from 'node:fs';
const DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19';
const f38 = {
  findingId: 'F-38',
  requirementId: "PLAN §5 '过期截图证据' 负向控制 + §4 '仅 metadata 自报' 反模式 + 合同 '发布才强制 stable 图 current / 证据变化按内容依赖失效'",
  gate: 'negativeControls / exampleStableVerify evidence-binding (screenshot currency sub-claim)',
  category: 'isolated-copy fault injection, non-browser gate (E:/qoder-negctl2-2026-09-19/repo, full tree minus node_modules/.git)',
  blocking: true,
  location: "tools/examples/spec-compliance-audit.cjs:205-210 (S11-SCREENSHOT consumes only art.path existsSync + art.bytes truthiness) vs producer tools/verify/v11-examples-verify.cjs:111 which DOES write art.hash = sha256(png)[0..16)",
  repro: "In the copy: (1) control `node tools/examples/spec-compliance-audit.cjs` -> EXIT 0, '45 examples: 0 fail / 1 warn'. (2) NC-C1 `rm docs/evidence/examples/hello-cube.png` (real file 5847 B, sha fe6a5511883d40ab) -> EXIT 1 with [FAIL] hello-cube S11-SCREENSHOT ... （文件不存在）. (3) NC-C2 restore then overwrite the SAME path with 31 bytes of garbage (sha 3c9d820384074fc2, on-disk size 31 while the evidence record still says bytes=5847/hash=...) -> EXIT 0, '0 fail / 1 warn' i.e. NOT detected. File restored and re-hashed identical to the copy's original afterwards.",
  expected: "'Screenshot Current' must mean the artifact on disk is the one the PASS run produced: a stale, replaced or corrupted PNG (a screenshot of a different/earlier frame, a blank, or another example's image) must flip the gate RED.",
  actual: "Existence has teeth (NC-C1 detected with a clean structured FAIL message, unlike NC-B's crash). CONTENT does not: the gate never re-hashes or re-stats the file, so the recorded bytes/hash fields are self-reported metadata that no consumer verifies -> NC-C2 ships green. This is a residual §4 'metadata-only self-report' instance at the artifact layer and it is the exact §5 '过期截图证据' control the plan mandates. Note the fingerprint controls (F-33) bind spec<->evidence but not evidence<->PNG-bytes, so the anti-stale chain has an unbound last link.",
  evidence: 'raw/negctl/nc-c2-spec-compliance-control.log, nc-c2-screenshot-deleted-detected.log, nc-c2-screenshot-tampered-NOT-detected.log (the last two differ only in the tool verdict line: EXIT 1 + S11-SCREENSHOT fail vs EXIT 0 green)',
  impact: "MATERIAL for evidence credibility (process/tooling-side, not a wrong consumer artifact): every §11 stable screenshot claim is existence-backed, not content-backed, so a pasted-old or wrong-image screenshot cannot be caught by any current gate. Combined with F-37 this is the second demonstrated detection gap in the same gate family; negativeControls stays PARTIAL and blocking.",
  minimalRecommendation: "In spec-compliance-audit.cjs S11-SCREENSHOT, additionally require statSync(pngAbs).size === art.bytes AND sha256(readFileSync(pngAbs))[0..16) === art.hash (the producer already emits both), failing with an explicit 'screenshot bytes/hash ≠ recorded artifact' message. Optionally verify the PNG decodes and is non-blank offline. Two-line change, no thresholds/assertions/package edits, retroactively validates all 45 existing records.",
  retestScope: 'R7f [NEW]: re-run NC-C1/NC-C2 after the fix and expect EXIT 1 for both; add a positive control that a freshly captured current screenshot still passes. Re-run on the frozen candidate (R0) since evidence JSONs are hash-bound.',
  verificationOwner: 'QA/Tooling owner',
  verdict: 'FAIL (stale/tampered screenshot evidence NOT detected; only missing-file detected) -> negativeControls stays PARTIAL, screenshot-currency claims downgraded to existence-only'
};
fs.appendFileSync(DIR + '/findings.jsonl', JSON.stringify(f38) + '\n');
const lines = fs.readFileSync(DIR + '/findings.jsonl', 'utf8').trim().split('\n');
lines.forEach((l, i) => { try { JSON.parse(l); } catch { console.log('BAD', i + 1); process.exit(1); } });
console.log('findings OK lines=' + lines.length);
const v = JSON.parse(fs.readFileSync(DIR + '/global-verdict.json', 'utf8'));
v.gates.negativeControls = String(v.gates.negativeControls).replace("STILL NOT_RUN: browser-render injections", "F-38 screenshot control EXECUTED in a node_modules-bearing copy (supersedes F-37's NC-C inconclusive): existence HAS teeth (rm docs/evidence/examples/hello-cube.png -> EXIT 1 structured S11-SCREENSHOT fail) but CONTENT does not (same path overwritten with 31 garbage bytes while record says bytes=5847 -> EXIT 0 GREEN; tools/examples/spec-compliance-audit.cjs:205-210 only existsSync + truthiness, never compares the art.hash/art.bytes the producer at v11-examples-verify.cjs:111 writes) -> 'Screenshot Current' is existence-only, not content-bound. STILL NOT_RUN: browser-render injections");
v.screenshotCurrency = "EXISTENCE-ONLY (F-38): all 45 §11 stable screenshot claims are file-exists + self-reported bytes, not re-hashed; missing file detected, tampered/stale file not.";
if (!v.blockingForRelease.includes('screenshot-content-binding (F-38)')) v.blockingForRelease.push('screenshot-content-binding (F-38)');
fs.writeFileSync(DIR + '/global-verdict.json', JSON.stringify(v, null, 2) + '\n');
const idx = JSON.parse(fs.readFileSync(DIR + '/evidence-index.json', 'utf8'));
idx.evidence.push({
  id: 'NEGCTL-SCREENSHOT-2026-09-19',
  findings: ['F-38'],
  raw: ['raw/negctl/nc-c2-spec-compliance-control.log', 'raw/negctl/nc-c2-screenshot-deleted-detected.log', 'raw/negctl/nc-c2-screenshot-tampered-NOT-detected.log'],
  scratch: 'E:/qoder-negctl2-2026-09-19/repo (full-tree copy minus node_modules/.git, deleted after capture)',
  summary: 'Non-browser stale-screenshot control: deletion detected (EXIT 1) but content tampering silently green (EXIT 0) -> screenshot currency is existence-only'
});
fs.writeFileSync(DIR + '/evidence-index.json', JSON.stringify(idx, null, 2) + '\n');
console.log('verdict gates ok, evidence entries=' + idx.evidence.length);
