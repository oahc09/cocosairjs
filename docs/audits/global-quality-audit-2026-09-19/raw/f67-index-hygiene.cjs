/* Ledger hygiene follow-up inside the same wave: one mislabeled evidence-index path (F-67). */
const fs = require('fs');
const path = require('path');
const A = 'docs/audits/global-quality-audit-2026-09-19';
const F = path.join(A, 'findings.jsonl');
const X = path.join(A, 'evidence-index.json');
const now = '2026-09-19T22:02:00.000+08:00';

const before = fs.readFileSync(F, 'utf8');
const rows = before.trimEnd().split(/\r?\n/).map((l) => JSON.parse(l));
if (rows.length !== 66 || rows[65].findingId !== 'F-66') { throw new Error('unexpected ledger state ' + rows.length); }
if (rows.some((r) => r.findingId === 'F-67')) { throw new Error('F-67 already exists'); }
const row = {
  findingId: 'F-67',
  requirementId: 'mandate step 10 - every ledger row must resolve to the evidence it names',
  gate: 'candidateIntegrity', category: 'audit-ledger self-check (third occurrence of this class; found while adding rows)',
  blocking: false,
  status: 'OPEN-FIXED-IN-INDEX (rows annotated, nothing deleted)',
  location: 'docs/audits/global-quality-audit-2026-09-19/evidence-index.json',
  repro: "node: group evidence[] rows by path; read raw/gates/v06-report-stdout-2026-09-19.log and grep for '\"status\"'",
  expected: 'one index row per captured artifact, and a row\'s description must match the bytes on disk',
  actual: 'Two rows share the path raw/gates/v06-report-stdout-2026-09-19.log: one describes the earlier BLOCKED stdout ("FAIL 30/30 recipe sourceHash mismatch; jest-binding null") and one the PASS stdout. The file now holds only the 13:39:07Z PASS capture (914 B, sha16 b53a5b8374bbd508), because the later run reused the filename - so the BLOCKED row described bytes that are no longer there. No information was actually lost: the BLOCKED stdout survives as raw/gates/reevidence-03-v06-blocked.log and the BLOCKED JSON is reachable in git history (git show 33b4281~1:docs/evidence/v06-review-gate.json -> status BLOCKED, 3 blockers, 30 evidenceFailures, measuredAt 2026-09-19T12:16:03Z). Second-order observation: the index mixes two row shapes (32 per-file rows with "path" resolving to 31 distinct values, and 16 per-experiment bundle rows with id/findings/raw[]), which is why a naive path-set count looks like 16 missing paths - my own first check also mis-resolved repo-root rows against the audit dir and reported 10 false danglers before being corrected. After correction, unresolved refs = 0 (plus the 3 rows already labelled DANGLING-SUPERSEDED / DESCRIPTOR and 1 glob).',
  evidence: 'raw/gates/f61-catalog-rerun-2026-09-19.log §10',
  minimalFix: 'Annotate both colliding rows with the content actually on disk now (done in this script); going forward give each capture a distinct filename (timestamp suffix) instead of overwriting a shared stdout path.',
  retest: 'regroup the index by path: no path may appear twice with descriptions that disagree with the file bytes; unresolved refs stay at 0.',
  measuredAt: now,
};
fs.appendFileSync(F, JSON.stringify(row) + '\n');
if (!fs.readFileSync(F, 'utf8').startsWith(before)) { throw new Error('FATAL: findings.jsonl not append-only'); }

const x = JSON.parse(fs.readFileSync(X, 'utf8'));
let touched = 0;
for (const e of x.evidence) {
  if (e.path !== 'raw/gates/v06-report-stdout-2026-09-19.log') { continue; }
  e.contentNowOnDisk = 'PASS capture only: measuredAt 2026-09-19T13:39:07.036Z, head 41b4c71, 914 B, sha16 b53a5b8374bbd508';
  if (/FAIL 30\/30/.test(String(e.result))) {
    e.status = 'SUPERSEDED-ON-DISK';
    e.note = (e.note ? e.note + ' ' : '') + '[2026-09-19 22:02 F-67] the BLOCKED stdout that this row described was overwritten in place by the later PASS capture (same filename). The BLOCKED state remains evidenced by raw/gates/reevidence-03-v06-blocked.log and by git show 33b4281~1:docs/evidence/v06-review-gate.json (3 blockers / 30 evidenceFailures / 12:16:03Z). Row kept and labelled rather than deleted.';
  } else {
    e.note = (e.note ? e.note + ' ' : '') + '[2026-09-19 22:02 F-67] second row for the same path; it is the capture the bytes actually correspond to.';
  }
  touched++;
}
if (touched !== 2) { throw new Error('expected 2 colliding rows, touched ' + touched); }
x.rowShapesNote = 'Two row shapes live in evidence[]: per-file rows carry "path"; per-experiment bundle rows carry {id, findings[], raw[], scratch} and no "path" (16 of 48). F-67.';
fs.writeFileSync(X, JSON.stringify(x, null, 2) + '\n');

fs.appendFileSync(path.join(A, 'raw/gates/f61-catalog-rerun-2026-09-19.log'), `
§10  Post-write self-check of this audit's own ledger (F-67)
    Re-grouped evidence-index.json by path: 48 rows total. 32 rows carry a "path" and those resolve to 31
    distinct values (one collision); the remaining 16 rows are per-experiment bundles
    ({id, findings[], raw[], scratch}) that carry no "path" field - two legitimate shapes in one file.
    One genuine collision: raw/gates/v06-report-stdout-2026-09-19.log is
    named by two rows, and only the later PASS capture (914 B, sha16 b53a5b8374bbd508, measuredAt
    2026-09-19T13:39:07.036Z, head 41b4c71) is on disk; the earlier BLOCKED stdout was overwritten because
    both runs reused the filename. Nothing lost: raw/gates/reevidence-03-v06-blocked.log holds the BLOCKED
    stdout and 'git show 33b4281~1:docs/evidence/v06-review-gate.json' still yields status BLOCKED /
    3 blockers / 30 evidenceFailures / 12:16:03Z. Both rows annotated (SUPERSEDED-ON-DISK + contentNowOnDisk);
    no row deleted.
    Correction of my own tooling in the same breath: the first dangling-ref sweep resolved every row against
    the audit directory and so falsely flagged 10 repo-root rows (docs/api-coverage-report.json,
    docs/evidence/license-audit.json, output/v06-review-jest.json, ...). Re-run with both bases: unresolved = 0
    apart from the 3 rows already labelled DANGLING-SUPERSEDED / DESCRIPTOR and 1 intentional glob.

§11  Non-regression checks after the .gitignore + ledger writes (offline, cheap)
    see raw/gates/f61-postwave-offline-checks-2026-09-19.log
`);
console.log('F-67 appended; index rows annotated:', touched);
