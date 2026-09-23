const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = 'E:/AIProMax/github/cocosair.js';
const GATE = path.join(ROOT, 'tools/v12/verify-v11-chain-face.cjs');
const SRC = path.join(ROOT, 'docs/evidence/v11-examples-verified.json');
const ARM_DIR = 'E:/AIProMax/cocosair-scratch/v12-diag/v11-chain-face-arms';

const base = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const clone = () => JSON.parse(JSON.stringify(base));

const ARMS = [
  { name: 'P-positive-copy', why: '正向对照：仓库外副本 + --evidence= 覆盖口本身不改结论', expectLabel: null, mut: () => {} },
  { name: 'N1-completed-false', why: '删完整性标记 ⇒ V1 必须抓到（缺 completed 即 NOT_RUN）', expectLabel: 'V1', mut: (j) => { j.completed = false; } },
  { name: 'N2-partial-true', why: '子集跑不得当全量回归 ⇒ V1 抓到 partial', expectLabel: 'V1', mut: (j) => { j.partial = true; } },
  { name: 'N3-count-desync', why: 'total 与 results.length 脱钩 ⇒ V2 抓到计数不自洽', expectLabel: 'V2', mut: (j) => { j.total = j.total + 1; } },
  { name: 'N4-vacuous-empty', why: '清空 results、四个计数归零且把 apiProofTotals 一并归零（保持内部自洽）⇒ 只剩 V2 反空转守卫可判红（不得"0 条全过＝绿"）', expectLabel: 'V2', mut: (j) => { j.results = []; j.total = 0; j.runTotal = 0; j.runPass = 0; j.pass = 0; j.apiProofTotals = { verified: 0, attested: 0, unproven: 0 }; } },
  { name: 'N5-record-fail', why: '一条记录改 FAIL ⇒ V3 必须抓到（聚合字段没动，只有逐条面看得见）', expectLabel: 'V3', mut: (j) => { j.results[7].result = 'FAIL'; } },
  { name: 'N6-second-fingerprint', why: '一条记录掺入第二个候选指纹 ⇒ V4 必须抓到"一链两产物"', expectLabel: 'V4', mut: (j) => { j.results[3].candidateFingerprint = 'aaaaaaaaaaaaaaaa'; } },
  { name: 'N7-totals-lie', why: '文件级 apiProofTotals 少报 1 条 verified ⇒ V5 聚合对账必须抓到', expectLabel: 'V5', mut: (j) => { j.apiProofTotals.verified -= 1; } },
  { name: 'N8-runner-gone', why: '采集器脚本改成不存在的路径 ⇒ V6 必须抓到（证据来历不可证）', expectLabel: 'V6', mut: (j) => { j.runner = 'tools/verify/no-such-collector.cjs'; } },
  { name: 'N9-future-stamp', why: 'measuredAt 改成未来 ⇒ V7 必须抓到（挡手写时间戳）', expectLabel: 'V7', mut: (j) => { j.measuredAt = new Date(Date.now() + 86400000).toISOString(); } },
];

fs.rmSync(ARM_DIR, { recursive: true, force: true });
const arms = [];
for (const a of ARMS) {
  const dir = path.join(ARM_DIR, a.name);
  fs.mkdirSync(dir, { recursive: true });
  const evPath = path.join(dir, 'evidence.json');
  const j = clone();
  a.mut(j);
  fs.writeFileSync(evPath, JSON.stringify(j, null, 2) + '\n');
  const r = cp.spawnSync(process.execPath, [GATE, '--evidence=' + evPath], { encoding: 'utf8', cwd: ROOT });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout.trim().split('\n')[0]); } catch (e) { /* 保留原文 */ }
  arms.push({ arm: a.name, why: a.why, expectLabel: a.expectLabel, gateExit: r.status, ok: parsed ? parsed.ok : null, firstStdoutLine: (r.stdout || '').trim().split('\n')[0].slice(0, 300), stderr: (r.stderr || '').trim().split('\n').slice(0, 3) });
}

// 精确核：每臂的错误必须**只**落在自己那条不变量上（读 --json 报告的 errors[] 前缀）
for (let i = 0; i < ARMS.length; i += 1) {
  const a = ARMS[i];
  if (!a.expectLabel) continue;
  const dir = path.join(ARM_DIR, a.name);
  const evPath = path.join(dir, 'evidence.json');
  const r = cp.spawnSync(process.execPath, [GATE, '--evidence=' + evPath, '--json'], { encoding: 'utf8', cwd: ROOT });
  const rep = JSON.parse(r.stdout);
  const seen = new Set(rep.errors.map((e) => e.split(' ')[0]));
  a.errorLabels = [...seen];
  a.onlyOwnLayer = seen.size === 1 && seen.has(a.expectLabel);
  a.gateExit2 = r.status;
}

const verdicts = ARMS.map((a, i) => {
  const first = arms[i];
  if (!a.expectLabel) {
    return { arm: a.name, expect: 'ok=true / EXIT=0', errorLabels: [], onlyOwnLayer: first.ok === true && first.gateExit === 0, observed: `ok=${first.ok} exit=${first.gateExit}` };
  }
  return { arm: a.name, expect: `只报 ${a.expectLabel} 且 EXIT=1`, errorLabels: a.errorLabels, onlyOwnLayer: a.onlyOwnLayer && a.gateExit2 === 1, observed: `exit=${a.gateExit2}` };
});
const summary = {
  round: 'r45h4-v11-chain-face-negctl',
  measuredAt: new Date().toISOString(),
  gate: 'tools/v12/verify-v11-chain-face.cjs',
  note: '全部变异副本写在仓库外 v12-diag/v11-chain-face-arms/，门禁本身只读 ⇒ 零覆写 docs/evidence/**',
  perArm: verdicts,
  arms,
  passCount: verdicts.filter((v) => v.onlyOwnLayer).length,
  total: verdicts.length,
};
console.log(JSON.stringify(summary, null, 2));
