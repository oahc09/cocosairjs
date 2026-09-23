'use strict';
// r45i: 三引擎对账（11 例 × chromium 正典 / firefox / webkit 本轮非正典捕获）。只读仓库，不写正典证据。
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const IDS = ['camera', 'gltf-catalog', 'gltf-viewer', 'hello-cube', 'input', 'material-basic', 'skinned-animation', 'starter', 'static-model', 'transform', 'tween-basic'];
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const read = (p) => JSON.parse(fs.readFileSync(REPO + p, 'utf8'));

// R45I_FILES 仅用于负向控制：把某引擎的 JSON 指向仓库外篡改副本，正典路径不动。
const override = process.env.R45I_FILES ? JSON.parse(process.env.R45I_FILES) : {};
const open = (p) => JSON.parse(fs.readFileSync(override[p] || REPO + p, 'utf8'));
const files = {
  chromium: { path: 'docs/evidence/v11-examples-verified.json', j: open('docs/evidence/v11-examples-verified.json') },
  firefox: { path: 'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json', j: open('docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json') },
  webkit: { path: 'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json', j: open('docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json') },
};
const fail = [], notes = [];
const sum = (r) => {
  const t = { verified: 0, attested: 0, unproven: 0, other: 0 };
  for (const a of r.apiProof || []) t[a.proof in t ? a.proof : 'other']++;
  return t;
};
const table = {};
for (const id of IDS) {
  const row = { id };
  for (const [eng, f] of Object.entries(files)) {
    const r = f.j.results.find((x) => x.id === id);
    if (!r) { fail.push(`${eng}/${id} MISSING`); continue; }
    if (r.result !== 'PASS') fail.push(`${eng}/${id} result=${r.result}`);
    if (r.errors && r.errors.length) fail.push(`${eng}/${id} errors=${JSON.stringify(r.errors)}`);
    if (r.candidateFingerprint !== '9fa85f88b968d5f1') fail.push(`${eng}/${id} fp=${r.candidateFingerprint}`);
    const s = sum(r);
    if (s.unproven !== 0) fail.push(`${eng}/${id} unproven=${s.unproven}`);
    if (s.other !== 0) fail.push(`${eng}/${id} otherProof=${s.other}`);
    const art = r.artifact || {};
    let onDisk = null;
    if (art.path) {
      const abs = REPO + art.path;
      onDisk = fs.existsSync(abs) ? (() => { const b = fs.readFileSync(abs); return { bytes: b.length, sha16: sha16(b) }; })() : 'MISSING';
      if (onDisk === 'MISSING') fail.push(`${eng}/${id} artifact missing ${art.path}`);
      else {
        if (onDisk.bytes !== art.bytes) fail.push(`${eng}/${id} artifact bytes ${onDisk.bytes}!=${art.bytes} (${art.path})`);
        if (onDisk.sha16 !== art.hash) fail.push(`${eng}/${id} artifact hash ${onDisk.sha16}!=${art.hash} (${art.path})`);
      }
    }
    row[eng] = {
      result: r.result,
      specFp: r.specFingerprint,
      srcFp: r.sourceFingerprint,
      candFp: r.candidateFingerprint,
      verified: s.verified, attested: s.attested, unproven: s.unproven,
      units: (r.apiProof || []).length,
      nodeCount: r.nodeCount,
      gaps: JSON.stringify(r.expectationGaps),
      shot: art.path, shotBytes: art.bytes, shotHash: art.hash, shotOnDisk: onDisk === 'MISSING' ? 'MISSING' : `${onDisk.bytes}/${onDisk.sha16}`,
    };
  }
  const c = row.chromium, f2 = row.firefox, w = row.webkit;
  if (c && f2 && w) {
    for (const k of ['specFp', 'srcFp', 'candFp', 'verified', 'attested', 'unproven', 'units', 'gaps']) {
      if (!(c[k] === f2[k] && f2[k] === w[k])) fail.push(`${id} cross-engine ${k} differs: cc=${c[k]} ff=${f2[k]} wk=${w[k]}`);
    }
  }
  table[id] = row;
}
const fileLevel = {};
for (const [eng, f] of Object.entries(files)) {
  const j = f.j;
  const abs = override[f.path] || REPO + f.path;
  fileLevel[eng] = { path: f.path, readFrom: abs, bytes: fs.statSync(abs).size, sha16: sha16(fs.readFileSync(abs)), browser: j.browser, mode: j.mode, measuredAt: j.measuredAt, completed: j.completed, partial: j.partial, subset: j.subset, runPass: j.runPass, runTotal: j.runTotal, total: j.total, pass: j.pass, failCount: j.fail, apiProofTotals: j.apiProofTotals, candidateFingerprint: j.candidateFingerprint, runner: j.runner, instrument: j.instrumentation, recordCount: j.results.length };
}
if (fileLevel.chromium.runTotal !== 52) notes.push('chromium file is canonical full-run (runTotal 52), subset check uses only the 11 ids');
console.log(JSON.stringify({ ok: !fail.length, fail, notes, fileLevel, perEngineTotals: { firefox: files.firefox.j.apiProofTotals, webkit: files.webkit.j.apiProofTotals }, table }, null, 2));
process.exit(fail.length ? 1 : 0);
