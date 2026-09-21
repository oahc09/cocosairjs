// F-75 全量对照：r20 磁盘证据 = 旧代码产物；同输入用新代码重放，凡 bound/proof 变化即该修复的真实影响。
const path = require('path');
const fs = require('fs');
const REPO = 'E:/AIProMax/github/cocosair.js';
const specCommon = require(path.join(REPO, 'tools/verify/v11-spec-common.cjs'));
const ev = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/evidence/v11-examples-verified.json'), 'utf8'));
const rows = ev.results || [];
let changedExamples = 0; let changedUnits = 0; let mismatchesUnexplained = 0;
for (const row of rows) {
  const id = row.id || row.exampleId || row.dir;
  const dir = path.join(REPO, 'examples', id);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'example.json'), 'utf8'));
  const traceUnits = {};
  for (const p of (row.apiProof || [])) {
    traceUnits[p.api] = { state: p.state, calls: p.calls || 0, reads: p.reads || 0, via: p.via, mechanism: p.mechanism };
  }
  const passAll = new Set((row.validatorResults || []).filter((v) => v.state === 'PASS').map((v) => v.validatorId));
  const now = specCommon.apiProofOf(spec, dir, traceUnits, passAll);
  const old = {}; for (const p of (row.apiProof || [])) { old[p.api] = p; }
  const diffs = [];
  for (const p of now) {
    const o = old[p.api];
    if (!o) { mismatchesUnexplained++; diffs.push(`${p.api}: NEW-UNIT bound=${p.bound}`); continue; }
    if (o.bound !== p.bound || o.proof !== p.proof) {
      diffs.push(`${p.api}: ${o.proof}/bound=${o.bound} -> ${p.proof}/bound=${p.bound} [validators=${JSON.stringify(p.bindings.map((b) => b.validator + ":" + b.passed + "/" + (b.line && b.line.ok)))}]`);
    }
  }
  if (diffs.length) {
    changedExamples++; changedUnits += diffs.length;
    console.log(`### ${id} (run=${row.result || row.state}, passSetHasNamespaced=${[...passAll].some((v) => v.includes(':'))})`);
    for (const d of diffs) console.log('    ' + d);
  }
}
console.log(`SUMMARY examples-with-diff=${changedExamples}/${rows.length} units-changed=${changedUnits} unexplained(new-unit/specrename)=${mismatchesUnexplained}`);
