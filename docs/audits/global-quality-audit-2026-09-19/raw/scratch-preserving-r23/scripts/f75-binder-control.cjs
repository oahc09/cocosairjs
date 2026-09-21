// F-75 控制：用 r20 磁盘证据重放 apiProofOf，只对比 bound，不写任何文件。
// 步骤：1) 空集 must-FAIL 2) r20 原 PASS 集 must 等于 r20 记录 3) 去掉 interaction: 前缀 must 只点亮真 PASS 的
const path = require('path');
const fs = require('fs');
const REPO = 'E:/AIProMax/github/cocosair.js';
const specCommon = require(path.join(REPO, 'tools/verify/v11-spec-common.cjs'));
const ev = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/evidence/v11-examples-verified.json'), 'utf8'));
const rows = ev.examples || ev.results || ev.rows || [];
console.log('evidence keys:', Object.keys(ev).join(','), '| rows=', rows.length, '| measuredAt=', ev.measuredAt);

function proofOf (id, passedSet) {
  const dir = path.join(REPO, 'examples', id);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'example.json'), 'utf8'));
  const row = rows.find((r) => r.id === id || r.exampleId === id || r.dir === id);
  const traceUnits = {};
  for (const p of (row && row.apiProof) || []) {
    traceUnits[p.api] = { state: p.state, calls: p.calls || 0, reads: p.reads || 0, via: p.via, mechanism: p.mechanism };
  }
  return { row, spec, now: specCommon.apiProofOf(spec, dir, traceUnits, passedSet) };
}

function proven (proof) {
  const o = {};
  for (const p of proof) { o[p.api] = `${p.proof}/bound=${p.bound}`; }
  return o;
}

const ids = [];
for (const row of rows) {
  const id = row.id || row.exampleId || row.dir;
  const ns = ((row.validatorResults || []).map((v) => v.validatorId).filter((v) => v.includes(':')));
  if (ns.length) { ids.push(id); }
}
console.log('examples with namespaced check ids:', ids.length, ids.slice(0, 50).join(','));

let changedTotal = 0;
for (const id of ids.slice(0, 6)) {
  const row = rows.find((r) => (r.id || r.exampleId || r.dir) === id);
  const passAll = new Set((row.validatorResults || []).filter((v) => v.state === 'PASS').map((v) => v.validatorId));
  const a = proven(proofOf(id, new Set()).now);
  const b = proven(proofOf(id, passAll).now);
  const stripped = new Set(passAll);
  for (const v of passAll) { const i = v.indexOf(':'); if (i > 0) stripped.delete(v); }
  const c = proven(proofOf(id, stripped).now);
  console.log('=== ' + id + ' (run recorded ' + (row.result || row.state) + ', promotion=' + (row.promotion ? 'yes' : 'no') + ')');
  console.log('  step1 empty-set   :', JSON.stringify(a));
  console.log('  step2 r20-pass-set:', JSON.stringify(b));
  console.log('  step3 minus-prefix:', JSON.stringify(c));
  let diff = 0;
  for (const k of Object.keys(b)) { if (b[k] !== c[k]) { diff++; console.log('  CHANGED ' + k + ': ' + b[k] + ' -> ' + c[k]); } }
  changedTotal += diff;
  const r20 = {};
  for (const p of (row.apiProof || [])) { r20[p.api] = `${p.proof}/bound=${p.bound}`; }
  let mismatch = 0;
  for (const k of Object.keys(b)) { if (r20[k] !== b[k]) { mismatch++; console.log('  MISMATCH-vs-r20 ' + k + ': r20=' + r20[k] + ' replay=' + b[k]); } }
  console.log('  step2==r20 record? mismatches=' + mismatch + ' | step3 changed=' + diff);
}
console.log('CONTROL DONE, namespaced-only changes=' + changedTotal);
