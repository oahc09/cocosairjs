'use strict';
// r45i 负向控制：证明 r45i-cross-engine-reconcile.cjs 不是空转（每臂只翻转自己那一层）。
const fs = require('fs');
const cp = require('child_process');
const SCR = 'E:/AIProMax/cocosair-scratch/db-probe/';
const REPO = 'E:/AIProMax/github/cocosair.js/';
const P = {
  chromium: REPO + 'docs/evidence/v11-examples-verified.json',
  firefox: REPO + 'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json',
  webkit: REPO + 'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json',
};
const REL = { chromium: 'docs/evidence/v11-examples-verified.json', firefox: 'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json', webkit: 'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json' };
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, o) => fs.writeFileSync(SCR + p, JSON.stringify(o));

function arm(name, build, expect) {
  const files = { 'docs/evidence/v11-examples-verified.json': P.chromium, 'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json': P.firefox, 'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json': P.webkit };
  for (const [key, mut] of Object.entries(build)) {
    const o = load(P[key === 'ff' ? 'firefox' : key === 'wk' ? 'webkit' : 'chromium']);
    mut(o);
    const f = `r45i-negctl-${name}-${key}.json`;
    write(f, o);
    files[REL[key === 'ff' ? 'firefox' : key === 'wk' ? 'webkit' : 'chromium']] = SCR + f;
  }
  const r = cp.spawnSync(process.execPath, [SCR + 'r45i-cross-engine-reconcile.cjs'], {
    env: { ...process.env, R45I_FILES: JSON.stringify(files) }, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { }
  const hits = j ? j.fail.filter(expect) : [];
  const passed = r.status === 1 && j && hits.length > 0 && (!j.ok);
  return { name, exit: r.status, ok: j && j.ok, failCount: j ? j.fail.length : null, expectHits: hits.length, sample: hits.slice(0, 2), verdict: passed ? 'PASS' : 'UNEXPECTED' };
}

const results = [];
// 阳性：三份原样副本 ⇒ 必须 EXIT=0 / ok true
{
  const files = { [REL.chromium]: SCR + 'r45i-pos-chromium.json', [REL.firefox]: SCR + 'r45i-pos-firefox.json', [REL.webkit]: SCR + 'r45i-pos-webkit.json' };
  write('r45i-pos-chromium.json', load(P.chromium)); write('r45i-pos-firefox.json', load(P.firefox)); write('r45i-pos-webkit.json', load(P.webkit));
  const r = cp.spawnSync(process.execPath, [SCR + 'r45i-cross-engine-reconcile.cjs'], { env: { ...process.env, R45I_FILES: JSON.stringify(files) }, encoding: 'utf8', maxBuffer: 1 << 28 });
  const j = JSON.parse(r.stdout);
  results.push({ name: 'P-positive-copy', exit: r.status, ok: j.ok, failCount: j.fail.length, verdict: r.status === 0 && j.ok && j.fail.length === 0 ? 'PASS' : 'UNEXPECTED' });
}
// N1 篡改 firefox 一张截图的在册哈希 ⇒ 只报 artifact hash
results.push(arm('n1-shothash', { ff: (o) => { o.results.find((r) => r.id === 'input').artifact.hash = 'f'.repeat(16); } }, (m) => m.includes('artifact hash')));
// N2 篡改 webkit 一条 specFingerprint ⇒ 只报 cross-engine specFp（截图哈希仍真）
results.push(arm('n2-specfp', { wk: (o) => { o.results.find((r) => r.id === 'input').specFingerprint = 'aaaaaaaaaaaa'; } }, (m) => m.includes('cross-engine specFp')));
// N3 删除 firefox 一条记录 ⇒ 报 MISSING（覆盖性有牙）
results.push(arm('n3-drop', { ff: (o) => { o.results = o.results.filter((r) => r.id !== 'input'); } }, (m) => m.includes('MISSING')));
// N4 firefox 一条改 FAIL ⇒ 报 result=FAIL
results.push(arm('n4-fail', { ff: (o) => { o.results.find((r) => r.id === 'input').result = 'FAIL'; } }, (m) => m.includes('result=FAIL')));
// N5 反空转：清空 firefox results ⇒ 必须 11 条 MISSING 而非"全过"
results.push(arm('n5-vacuous', { ff: (o) => { o.results = []; } }, (m) => m.includes('MISSING')));
// N6 篡改 firefox 一条 apiProof 计数（去掉一项）⇒ 报 cross-engine units
results.push(arm('n6-units', { ff: (o) => { o.results.find((r) => r.id === 'input').apiProof.pop(); } }, (m) => m.includes('cross-engine units')));
// N7 篡改 firefox 截图字节数 ⇒ 报 artifact bytes
results.push(arm('n7-bytes', { ff: (o) => { o.results.find((r) => r.id === 'input').artifact.bytes += 1; } }, (m) => m.includes('artifact bytes')));

const passCount = results.filter((r) => r.verdict === 'PASS').length;
console.log(JSON.stringify({ passCount, total: results.length, results }, null, 2));
process.exit(passCount === results.length ? 0 : 1);
