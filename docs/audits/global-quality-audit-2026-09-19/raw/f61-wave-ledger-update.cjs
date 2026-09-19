/* Ledger update for the 2026-09-19 21:44-21:56 F-54/F-61 wave. Append-only; asserts no history rewrite. */
const fs = require('fs');
const path = require('path');
const A = 'docs/audits/global-quality-audit-2026-09-19';
const F = path.join(A, 'findings.jsonl');
const V = path.join(A, 'global-verdict.json');
const X = path.join(A, 'evidence-index.json');
const S = path.join(A, 'verification-summary.md');
const P = path.join(A, 'retest-plan.md');
const now = '2026-09-19T21:56:00.000+08:00';

/* ---------- 1. findings.jsonl ---------- */
const before = fs.readFileSync(F, 'utf8');
const lines = before.trimEnd().split(/\r?\n/);
const rows = lines.map((l) => JSON.parse(l));
const ids = rows.map((r) => r.findingId);
if (rows.length !== 62 || ids[61] !== 'F-62') { throw new Error('unexpected ledger start: ' + rows.length + ' rows, last ' + ids[ids.length - 1]); }
for (const id of ['F-63', 'F-64', 'F-65', 'F-66']) { if (ids.includes(id)) { throw new Error(id + ' already exists'); } }
const mk = (o) => Object.assign({
  findingId: o.id, requirementId: o.req, gate: o.gate, category: o.cat, blocking: o.blocking,
  status: o.status, location: o.loc, repro: o.repro, expected: o.exp, actual: o.act, evidence: o.evi,
  minimalFix: o.fix, retest: o.retest, measuredAt: now,
}, {});
const add = [
  mk({
    id: 'F-63', req: 'mandate step 1 - candidate identity / repo hygiene of the tooling that pins it', gate: 'candidateIntegrity',
    cat: 'config defect discovered while editing .gitignore (read-only elsewhere; not fixed)', blocking: false,
    status: 'OPEN-DISCLOSED (audit did not change the pattern)',
    loc: '.gitignore:15', repro: "node -e 'print codepoints of line 15' ; git check-ignore -v .tmp-basis",
    exp: 'pattern ".tmp-basis" ignores that path', act: 'the line literally ends with a backslash + "n" (codepoints ...,92,110), so the pattern is inert: git check-ignore .tmp-basis EXIT 1 = not ignored',
    evi: 'raw/gates/f61-catalog-rerun-2026-09-19.log §4', fix: 'delete the stray "\\\\n" (one-character edit). Not done here: out of the authorized scope, and un-ignoring a path can surface a new untracked file for the parallel session.',
    retest: 'git check-ignore -v .tmp-basis returns a match on the intended pattern',
  }),
  mk({
    id: 'F-64', req: 'F-54 closure: raw audit evidence cited by the ledger must actually ship with the ledger', gate: 'candidateIntegrity',
    cat: 'fix executed on user instruction (".gitignore 为 docs/audits/**/raw/** 开例外")', blocking: false,
    status: 'CLOSED (F-54 resolved; verified two directions)',
    loc: '.gitignore:20-21 ("!docs/audits/**/raw/**")', repro: 'git check-ignore -v <a new .log under raw/> ; git check-ignore -v docs/evidence/v06-recipes.log ; git ls-files docs/audits | count .log vs on-disk count',
    exp: 'new raw logs under docs/audits/**/raw/** are tracked without git add -f, and the *.log rule still applies outside raw/',
    act: 'raw/.ignore-probe.log -> last match ".gitignore:21:!docs/audits/**/raw/**" (not ignored); docs/evidence/v06-recipes.log -> still ".gitignore:5:*.log" (ignored, no widening). This pass\' three new raw files (incl. two .log) appeared as "??" in git status without any -f. Ledger census: tracked 225 files / 84 .log, on-disk 227 / 85 (.log +1 is the in-flight stdout), tracked-but-missing 0.',
    evi: 'raw/gates/f61-catalog-rerun-2026-09-19.log §3, §7', fix: 'none needed', retest: 'git ls-files docs/audits | grep -c "\\.log$" must equal the on-disk .log count after the next commit',
  }),
  mk({
    id: 'F-65', req: 'F-61 fix attempt (option a): make the three V0.6 inputs name one revision', gate: 'v06FinalGate_recipe + catalogRuntimeBenchmark',
    cat: 'authorized re-run executed; measured premise break reported instead of a fake close', blocking: false,
    status: 'OPEN-CORRECTED (option (a) cannot succeed as specified; option (b) as originally worded would be wrong; residual is presentation only)',
    loc: 'docs/evidence/v06-catalog-runtime-gate.json, tools/verify/v06-report.cjs:19-22',
    repro: 'snapshot -> node tools/verify/v06-catalog-gate.cjs (NODE_PATH=playwright) -> node tools/verify/v06-report.cjs; then git log -1 --format=%h -- <each evidence file> and git merge-base --is-ancestor e06d298 HEAD',
    exp: 'revision.recorded collapses to a single value',
    act: 'catalog re-run EXIT 0: 100/100 (97 PASS + 3 EXPECTED_UNSUPPORTED, failureDomain DEVICE), sourceHash ac1b1515 unchanged, revision now 33b4281 = HEAD. v06-report EXIT 0: status PASS, blockers [], recipes 30/30/30, tests 29/207/207. BUT revision.recorded went [e06d298, 3a53957] -> [e06d298, 33b4281]: the lagging pair rotated instead of merging, because the dual-track + recipe evidence recorded e06d298 and were committed BY 33b4281 itself. A capture can only name the HEAD that predates its own commit, so "committed evidence whose recorded revision == HEAD" is unattainable by construction, and asserting it would produce a permanent non-actionable warn.',
    evi: 'raw/gates/f61-catalog-rerun-2026-09-19.log §2, §5, §6; raw/gates/f61-catalog-gate-stdout-2026-09-19.log; raw/gates/f61-postcatalog-v06-report-stdout-2026-09-19.log; pre-overwrite snapshot raw/gates/pre-f61reprocess-2144-v06-catalog-runtime-gate.json (sha16 43805b0bcbf2b221, byte-identical to the file it preserved, which is now a87f480f93c7ad8b)',
    fix: 'Either (i) leave the invariant alone - ancestor + identical sourceHash + per-run scenarioHash + artifact re-hash already report 0 failures and are the meaningful checks - and only change presentation: emit revision.perSource {goldenDualTrack, catalogRuntime, recipeBatch, recipeRuns} instead of a flat de-duplicated list so a reader sees which input came from which commit; or (ii) if a single recorded value is required cosmetically, re-run ALL THREE captures at one HEAD (dual-track + recipes + catalog), accepting that the value becomes "one commit behind" again on the next commit. Both touch tools/, so both need authorization.',
    retest: 'After (i): revision.perSource lists 3-4 labelled revisions, all ancestors of HEAD, all with sourceHash == current. After (ii): revision.recorded has exactly 1 element and v06-report stays PASS with blockers [].',
  }),
  mk({
    id: 'F-66', req: 'mandate step 9 - license/provenance census must be definition-explicit and reproducible', gate: 'license',
    cat: 'self-correction of the auditor own earlier number + re-verification of F-27 items at HEAD', blocking: false,
    status: 'OPEN (R1 still needs owner input; the number is now stated with its definition)',
    loc: 'examples/*/assets/**', repro: "walk examples/*/assets, split payloads vs '.LICENSE.md' sidecars, match sibling per payload; then existsSync the two F-27 payloads",
    exp: 'the report states payload-count and byte coverage under a named definition instead of a bare "x/y"',
    act: 'payloads 41, sidecars 24, payloads with a sibling 24, without 17; payload bytes 5,183,132, covered 5,165,599 (99.7 %), uncovered 17,533 B; gltf-viewer 10/50 files uncovered (13,878 B). My earlier note "provenance 25/65 files, 38.5 % of bytes" used all-files-including-sidecars as the denominator and therefore overstated the gap; the correct framing is "17 of 41 payloads (41 %) lack a sidecar but they are 0.3 % of the bytes". F-27 items 1 and 2 re-checked and still open: examples/gltf-draco/assets/draco.glb 992 B and examples/gltf-meshopt/assets/meshopt-khr.glb 1,428 B both have no sidecar. (My first probe in this pass also falsely reported that all 8 examples lacked a LICENSE.md, because it looked for examples/<d>/LICENSE.md; the real convention is per-asset <name>.LICENSE.md. Corrected before writing the ledger.)',
    evi: 'raw/gates/f61-catalog-rerun-2026-09-19.log §9', fix: 'Owner supplies upstream source/license statement for the 2 named .glb (the audit agent must not author license text), then a decision on whether the 17 derived sidecars (SHA256.json / SOURCES.md / *_geometry.bin) need sidecars too, or whether a directory-level provenance file is the contract.',
    retest: 'node tools/verify/license-audit.cjs EXIT 0 with 0 issues for the examples/* path set, and the census re-run reports uncovered payloads = 0 or a documented exemption list.',
  }),
];
fs.appendFileSync(F, add.map((r) => JSON.stringify(r)).join('\n') + '\n');
const after = fs.readFileSync(F, 'utf8');
if (!after.startsWith(before)) { throw new Error('FATAL: findings.jsonl was not append-only'); }
console.log('findings.jsonl: rows', rows.length, '->', after.trimEnd().split(/\r?\n/).length);

/* ---------- 2. global-verdict.json ---------- */
const v = JSON.parse(fs.readFileSync(V, 'utf8'));
const MARK = 'F61WAVE';
const note = (gate, text) => {
  if (String(v.gates[gate]).includes(MARK)) { return; }
  v.gates[gate] = String(v.gates[gate]).replace(/\s*$/, ' ') + ' [' + MARK + ' 2026-09-19 21:56 ' + text + ']';
};
note('candidateIntegrity', 'F-54 CLOSED via F-64 (.gitignore:21 "!docs/audits/**/raw/**", scope proven both ways, 84 tracked .log / 0 dangling). New non-blocking F-63: .gitignore:15 ".tmp-basis\\n" is an inert pattern (git check-ignore EXIT 1).');
note('catalogRuntimeBenchmark', 'Re-run at HEAD 33b4281 (F-65): 100/100, {PASS 97, EXPECTED_UNSUPPORTED 3}, failureDomain {NONE 97, DEVICE 3}, sourceHash ac1b1515 unchanged, revision 3a53957 -> 33b4281. Pre-overwrite snapshot preserved byte-identically.');
note('v06FinalGate_recipe', 'Still PASS (v06-report EXIT 0, blockers [], recipes 30/30/30, tests 29/207/207) after the catalog re-run, but F-61 was NOT closed: recorded revisions [e06d298, 3a53957] -> [e06d298, 33b4281] because evidence committed by 33b4281 can never record HEAD (F-65). F-60 (non-discriminating recipe frames) is unaffected and stays open.');
note('apiCoverage', 'Refreshed at HEAD via npm run verify:api-coverage (13:49Z): totalUnits 4729, claimed=verified=63, stale [], so claimed-without-proof is still zero; tiers core 49/717 6.8%, important 6/793 0.8%, advanced 8/3219 0.2% -> 3/3 gates FAIL. R2 remains an owner contract decision (F-65/F-66 do not change it).');
note('license', 'R1 census restated with definitions (F-66): 24/41 payloads have a per-asset .LICENSE.md sibling, 17 uncovered = 17,533 B = 0.3% of asset bytes; draco.glb (992 B) and meshopt-khr.glb (1,428 B) still missing sidecars.');
v.gitignoreAndRevisionWave_addendum = {
  measuredAt: now, headAtStart: '33b4281625fd2b0b6e5bad7922d8dfb4894c75dd', userAuthorized: [
    'F-61 option (a): re-run tools/verify/v06-catalog-gate.cjs',
    '.gitignore exception for docs/audits/**/raw/**',
  ],
  notAuthorizedSoNotDone: ['F-58 relocation of generated gate JSON to output/ (scope + which files + loss of in-repo evidence model need a decision)', 'R1/R1b/R1c/R2/R3/R5/R6/R8', 'any edit to tools/** or gate scripts'],
  repoFilesChangedByThisPass: ['.gitignore', 'docs/evidence/v06-catalog-runtime-gate.json', 'docs/evidence/v06-review-gate.json', 'docs/v06-final-gate.md', 'docs/api-coverage-report.json'],
  stagingOrCommitPerformed: false,
  blockingForReleaseCountBefore: 10, blockingForReleaseCountAfter: 10,
  overallChange: 'none - overall stays NOT_READY; one release blocker (v06 recipe track) remains cleared',
  foreignFileLeftAlone: '.tmp-frame-probe.cjs (21:42, untracked, written after the previous commit; ownership unconfirmed)',
};
fs.writeFileSync(V, JSON.stringify(v, null, 2) + '\n');

/* ---------- 3. evidence-index.json ---------- */
const x = JSON.parse(fs.readFileSync(X, 'utf8'));
const known = new Set(x.evidence.map((e) => e.path));
const rows2 = [
  { path: 'raw/gates/pre-f61reprocess-2144-v06-catalog-runtime-gate.json', kind: 'pre-overwrite-snapshot', note: 'byte-identical copy (sha16 43805b0bcbf2b221, 9,772 B) of the catalog evidence preserved before the F-61 re-run replaced it with a87f480f93c7ad8b', createdBy: 'audit', measuredAt: now },
  { path: 'raw/gates/f61-catalog-gate-stdout-2026-09-19.log', kind: 'gate-stdout', note: 'tools/verify/v06-catalog-gate.cjs at HEAD 33b4281: EXIT 0, 100/100', createdBy: 'audit', measuredAt: now },
  { path: 'raw/gates/f61-postcatalog-v06-report-stdout-2026-09-19.log', kind: 'gate-stdout', note: 'tools/verify/v06-report.cjs after the re-run: EXIT 0, status PASS, blockers [], recorded revisions [e06d298, 33b4281]', createdBy: 'audit', measuredAt: now },
  { path: 'raw/gates/f61-catalog-rerun-2026-09-19.log', kind: 'narrative-raw-log', note: 'sections 1-9: authorization scope, snapshot, .gitignore change + two-direction proof, F-63, catalog re-run, report re-run + premise break, dirty-tree inventory, R2 census, R1 census self-correction', createdBy: 'audit', measuredAt: now },
];
for (const r of rows2) { if (!known.has(r.path)) { x.evidence.push(r); } }
fs.writeFileSync(X, JSON.stringify(x, null, 2) + '\n');
console.log('evidence-index rows ->', x.evidence.length);

/* ---------- 4. verification-summary.md ---------- */
const upd = `
## UPDATE-20 - F-54 closed, F-61 re-run executed, premise break measured (2026-09-19 21:44-21:56 +08)

User authorized two things: re-run \`tools/verify/v06-catalog-gate.cjs\` so the three V0.6 inputs share a
revision, and add a \`.gitignore\` exception for \`docs/audits/**/raw/**\`. F-58's relocation and R1/R1b/R1c/
R2/R3/R5/R6/R8 were explicitly returned to the user as decisions; nothing under \`tools/\` was touched and
nothing was staged or committed.

1. **F-54 -> F-64 CLOSED.** \`.gitignore:21\` now reads \`!docs/audits/**/raw/**\`. Scope proven in both
   directions with \`git check-ignore -v\`: a new \`.log\` under \`raw/\` resolves to the negation (no longer
   ignored), while \`docs/evidence/v06-recipes.log\` still resolves to \`*.log\` (no accidental widening). The
   three new files this pass produced appeared as \`??\` with no \`git add -f\`, which is the behavioural proof.
   Ledger census: 225 tracked files under \`docs/audits\` of which 84 are \`.log\`; on disk 227 / 85 (the extra
   is this pass' in-flight stdout); tracked-but-missing 0.
2. **F-63 opened (non-blocking).** \`.gitignore:15\` contains the literal characters \`.tmp-basis\\n\`
   (backslash + n), so the pattern is inert - \`git check-ignore .tmp-basis\` exits 1. Left as-is: outside the
   authorized scope, and un-ignoring a path could hand the parallel session a new untracked file.
3. **F-61 re-run executed, and it produced a measurement rather than a close.** The catalog gate EXIT 0 at
   HEAD \`33b4281\`: 100/100, {PASS 97, EXPECTED_UNSUPPORTED 3}, failureDomain {NONE 97, DEVICE 3}, identical
   \`sourceHash ac1b1515\`, and its recorded revision moved \`3a53957 -> 33b4281\`. Re-running
   \`tools/verify/v06-report.cjs\` kept \`status=PASS / blockers=[] / recipes 30/30/30 / tests 29-207-207\`, but
   \`revision.recorded\` went from \`[e06d298, 3a53957]\` to \`[e06d298, 33b4281]\` - the lagging pair rotated
   instead of merging. Root cause, verified not argued: the dual-track and recipe evidence recorded
   \`e06d298\` **and were committed by \`33b4281\`** (\`git log -1 -- docs/evidence/v06-recipes.json\` ->
   \`33b4281 09-19 21:40\`), and \`git merge-base --is-ancestor e06d298 HEAD\` is true with 3 commits in
   between. A capture can only ever name the HEAD that predates its own commit, so the literal goal
   "committed evidence records HEAD" is unattainable, and turning it into a warn (option b as originally
   worded) would emit a permanent non-actionable warning. The invariant the gate already enforces -
   ancestor + identical \`sourceHash\` + per-run \`scenarioHash\` + artifact re-hash, currently 0 failures - is
   the meaningful one. Residual defect is presentation only: \`revision.recorded\` is a flat de-duplicated
   list, so a reader cannot tell which input came from which commit. Proposed fix (needs authorization,
   touches \`tools/verify/v06-report.cjs\`): \`revision.perSource {goldenDualTrack, catalogRuntime, recipeBatch,
   recipeRuns}\`. Alternative if a single value is wanted cosmetically: re-run all three captures at one HEAD.
4. **R2 refreshed at HEAD** (\`npm run verify:api-coverage\`, 13:49Z): \`totalUnits 4729\`,
   \`claimed = verified = 63\`, \`staleEvidenceExamples []\` - zero claimed-without-proof - while core
   49/717 (6.8 %), important 6/793 (0.8 %), advanced 8/3219 (0.2 %) all fail their 100/90/80 % thresholds,
   and \`unclaimedCore\` lists 668 units. Still an owner contract decision.
5. **R1 census corrected against my own earlier note** (F-66). Under the definition "payload = non-sidecar
   file under \`examples/*/assets/\`, covered = sibling \`<name>.LICENSE.md\` exists": 41 payloads, 24 covered,
   17 uncovered totalling 17,533 B, i.e. **99.7 % of asset bytes are proven**. My stored "25/65 files,
   38.5 % of bytes" used a denominator that counted the sidecars themselves and overstated the gap. Two
   concrete gaps from F-27 re-verified as still open: \`examples/gltf-draco/assets/draco.glb\` (992 B) and
   \`examples/gltf-meshopt/assets/meshopt-khr.glb\` (1,428 B) have no sidecar. Two self-corrections in one
   pass worth naming: my first census probe looked for \`examples/<d>/LICENSE.md\` and therefore wrongly
   reported all 8 examples as uncovered before I fixed the convention.
6. **Tree state.** 5 tracked modifications (\`.gitignore\`, the two regenerated V0.6 evidence/report files,
   \`docs/v06-final-gate.md\`, \`docs/api-coverage-report.json\`) plus this ledger, and one foreign untracked
   \`.tmp-frame-probe.cjs\` left alone. \`output/v06-review-jest.json\` was not re-run in this pass, so the
   \`tests\` block in the gate JSON is the 21:04 capture - consistent, but flagged for honesty.
   **Overall verdict unchanged: NOT_READY, 10 release blockers.**
`;
if (!fs.readFileSync(S, 'utf8').includes('UPDATE-20')) { fs.appendFileSync(S, upd); }

/* ---------- 5. retest-plan.md ---------- */
const rp = `
## F-54 CLOSED / F-61 RE-RUN -> CORRECTED (2026-09-19 21:44-21:56 +08, user-authorized)

- **F-54 -> CLOSED** by \`.gitignore:21 !docs/audits/**/raw/**\` (F-64). Retest now: \`git ls-files
  docs/audits | grep -c "\\.log$"\` = 84 with on-disk 85 (in-flight stdout) and 0 tracked-but-missing; the
  next commit needs no \`git add -f\` for raw logs.
- **F-61 -> corrected, not closed** (F-65). Executed option (a): catalog gate re-run at HEAD \`33b4281\` =
  100/100, same \`sourceHash ac1b1515\`, revision now equals HEAD. \`v06-report.cjs\` still PASS / blockers [].
  But \`revision.recorded\` = \`[e06d298, 33b4281]\`: re-running only the lagging source cannot merge the pair,
  because \`33b4281\` itself is the commit that recorded \`e06d298\`. Retest options for the owner:
  (i) label revisions per source (\`revision.perSource\`) and keep the ancestor + sourceHash assertions
  unchanged - recommended, presentation-only edit to one gate script; (ii) re-run all three captures at one
  HEAD to force a single recorded value, knowing it becomes "one behind" again at the next commit;
  (iii) close F-61 as won't-fix with the invariant documented. All three need authorization for \`tools/\`.
- **Unchanged by this pass**: F-60 (recipe frames), R1 (2 sidecars + provenance policy, census restated in
  F-66), R1b/R1c, R2 (3/3 tier gates FAIL), R3, R5, R6, R8, catalog \`assets[] hash\`, F-58, F-63.
`;
if (!fs.readFileSync(P, 'utf8').includes('F-54 CLOSED / F-61 RE-RUN')) { fs.appendFileSync(P, rp); }
console.log('ledger updated: findings +4, verdict gates +5, index +' + (x.evidence.length - known.size) + ', summary UPDATE-20, retest-plan section');
