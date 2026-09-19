/* Close out the wave: index the three remaining artifacts and append UPDATE-20b. */
const fs = require('fs');
const A = 'docs/audits/global-quality-audit-2026-09-19';
const now = '2026-09-19T22:05:00.000+08:00';
const x = JSON.parse(fs.readFileSync(A + '/evidence-index.json', 'utf8'));
const have = new Set(x.evidence.map((e) => e.path));
const add = [
  ['raw/f61-wave-ledger-update.cjs', 'audit-tool', 'append-only ledger writer for F-63..F-66 + verdict/index/markdown updates; asserts the 62-row prefix is unchanged before appending'],
  ['raw/f61-wave-closeout.cjs', 'audit-tool', 'this script: indexes the wave tools and appends UPDATE-20b'],
  ['raw/f67-index-hygiene.cjs', 'audit-tool', 'appends F-67 and annotates the two colliding evidence-index rows'],
  ['raw/gates/f61-postwave-offline-checks-2026-09-19.log', 'offline-checks', 'license-audit EXIT 1 with 3 issues (draco.glb + meshopt-khr.glb sidecars, build/examples) and spec-compliance EXIT 0 at 45 examples / 0 fail / 1 warn, after the .gitignore and ledger writes'],
];
let n = 0;
for (const [path, kind, note] of add) {
  if (have.has(path)) { continue; }
  x.evidence.push({ path, kind, note, createdBy: 'audit', measuredAt: now });
  n++;
}
fs.writeFileSync(A + '/evidence-index.json', JSON.stringify(x, null, 2) + '\n');

const md = `
### UPDATE-20b - same wave, three more self-checks (22:02-22:05)

- **F-67 opened** while indexing this wave: two \`evidence-index.json\` rows named
  \`raw/gates/v06-report-stdout-2026-09-19.log\`, but the file holds only the later PASS capture (914 B,
  sha16 \`b53a5b8374bbd508\`, 13:39:07Z, head \`41b4c71\`) because the second run reused the filename. Third
  occurrence of the "row does not match bytes" class, so the rule is now stated in the row itself: one
  filename per capture. Nothing was lost - the BLOCKED stdout is
  \`raw/gates/reevidence-03-v06-blocked.log\` and the BLOCKED JSON is \`git show 33b4281~1:docs/evidence/v06-review-gate.json\`
  (3 blockers / 30 evidenceFailures / 12:16:03Z). Both rows annotated, none deleted.
- **My dangling-ref sweep was wrong before it was right**: resolving every row against the audit directory
  flagged 10 repo-root rows as missing (\`docs/api-coverage-report.json\`, \`output/v06-review-jest.json\`, ...).
  Re-run against both bases: unresolved refs = 0, plus the 3 rows already labelled
  \`DANGLING-SUPERSEDED\`/\`DESCRIPTOR\` and 1 intentional glob. Also: 16 of the 48 rows are per-experiment
  bundles with no \`path\` field at all - a naive "unique paths vs row count" diff is not a dangler count.
- **True exit codes re-measured** (the first capture piped through \`tail\` and printed *tail's* status):
  \`license-audit.cjs\` **EXIT 1, issues=3** (\`draco.glb\`, \`meshopt-khr.glb\`, \`unexpected directory in build/:
  examples\`) - so the \`license\` gate stays FAIL and remains a release blocker;
  \`spec-compliance-audit.cjs --warn-ok\` **EXIT 0, 45 examples / 0 fail / 1 warn** - unchanged.
- **F-58 observed live rather than argued**: the compliance run rewrote
  \`docs/evidence/v11-spec-compliance.json\` for a \`measuredAt\`-only reason, which is exactly why a clean tree
  is unattainable after any verification pass. Relocation still awaits the owner's scope decision.
`;
const S = A + '/verification-summary.md';
if (!fs.readFileSync(S, 'utf8').includes('UPDATE-20b')) { fs.appendFileSync(S, md); }
console.log('index rows added', n, 'total', x.evidence.length);
