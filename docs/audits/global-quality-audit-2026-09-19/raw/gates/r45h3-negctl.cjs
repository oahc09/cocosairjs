const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'E:/AIProMax/github/cocosair.js';
const SCR = 'E:/AIProMax/cocosair-scratch/v12-diag/f132-nc-arms';
const AUDIT = 'E:/AIProMax/cocosair-scratch/db-probe/r45h3-currency-audit.cjs';
const MATRIX = path.join(ROOT, 'docs/evidence/v12/browser-matrix.json');
const V11 = path.join(ROOT, 'docs/evidence/v11-examples-verified.json');
fs.mkdirSync(SCR, { recursive: true });

const arms = [
  {
    name: 'P-positive-copy',
    why: '正向对照：证明「覆盖口 + 仓库外副本」本身不改结论',
    build: () => ({ matrix: fs.readFileSync(MATRIX), v11: fs.readFileSync(V11) }),
    expect: { matrix: 'CURRENT', v11: 'CURRENT' },
  },
  {
    name: 'N1-png-hash',
    why: '篡改一条记录的 pngSha256_16 ⇒ PNG 哈希复核必须抓到',
    build: () => {
      const m = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
      m.records[0].pngSha256_16 = 'deadbeefdeadbeef';
      const v = fs.readFileSync(V11);
      return { matrix: Buffer.from(JSON.stringify(m, null, 2) + '\n'), v11: v };
    },
    expect: { matrix: 'NOT-CURRENT', v11: 'CURRENT', field: 'pngHashMismatch>=1' },
  },
  {
    name: 'N2-recorded-bundle',
    why: '篡改文件级 bundle.sha256_16 ⇒ 记录与现盘 bundle 的绑定必须断',
    build: () => {
      const m = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
      m.bundle.sha256_16 = '0123456789abcdef';
      return { matrix: Buffer.from(JSON.stringify(m, null, 2) + '\n'), v11: fs.readFileSync(V11) };
    },
    expect: { matrix: 'NOT-CURRENT', v11: 'CURRENT', field: 'recordedBundleMatchesLive=false' },
  },
  {
    name: 'N3-contract-fp',
    why: '篡改 contractFingerprint ⇒ 契约漂移必须被抓（现盘契约 12 例）',
    build: () => {
      const m = JSON.parse(fs.readFileSync(MATRIX, 'utf8'));
      m.contractFingerprint = 'ffffffffffffffff';
      return { matrix: Buffer.from(JSON.stringify(m, null, 2) + '\n'), v11: fs.readFileSync(V11) };
    },
    expect: { matrix: 'NOT-CURRENT', v11: 'CURRENT', field: 'contractFingerprintMatchesLive=false' },
  },
  {
    name: 'N4-v11-candidate',
    why: '篡改一条 V1.1 记录的 candidateFingerprint ⇒ 逐条候选绑定必须抓到（这正是 F-82 类缺口）',
    build: () => {
      const v = JSON.parse(fs.readFileSync(V11, 'utf8'));
      v.results[3].candidateFingerprint = 'aaaabbbbccccdddd';
      return { matrix: fs.readFileSync(MATRIX), v11: Buffer.from(JSON.stringify(v, null, 2) + '\n') };
    },
    expect: { matrix: 'CURRENT', v11: 'NOT-CURRENT', field: 'recordsNotMatchingLiveCandidate>=1' },
  },
  {
    name: 'N5-v11-partial',
    why: '把 partial 由 false 改 true ⇒ 子集跑不得被判当期',
    build: () => {
      const v = JSON.parse(fs.readFileSync(V11, 'utf8'));
      v.partial = true;
      return { matrix: fs.readFileSync(MATRIX), v11: Buffer.from(JSON.stringify(v, null, 2) + '\n') };
    },
    expect: { matrix: 'CURRENT', v11: 'NOT-CURRENT', field: 'partial=true' },
  },
  {
    name: 'N6-vacuous-guard',
    why: '删掉全部 results ⇒ 记录数 0 必须落进 NOT-ASSERTABLE，不能因为「0 条不匹配」而恒真',
    build: () => {
      const v = JSON.parse(fs.readFileSync(V11, 'utf8'));
      v.results = [];
      return { matrix: fs.readFileSync(MATRIX), v11: Buffer.from(JSON.stringify(v, null, 2) + '\n') };
    },
    expect: { matrix: 'CURRENT', v11: 'NOT-ASSERTABLE' },
  },
];

const results = [];
for (const arm of arms) {
  const dir = path.join(SCR, arm.name);
  fs.mkdirSync(dir, { recursive: true });
  const { matrix, v11 } = arm.build();
  const mp = path.join(dir, 'matrix.json');
  const vp = path.join(dir, 'examples-verified.json');
  const op = path.join(dir, 'readings.json');
  fs.writeFileSync(mp, matrix);
  fs.writeFileSync(vp, v11);
  let code = 0;
  try {
    execFileSync(process.execPath, [AUDIT, `--matrix=${mp}`, `--v11=${vp}`, `--out=${op}`], { stdio: 'pipe' });
  } catch (e) { code = e.status === undefined ? -1 : e.status; }
  const r = JSON.parse(fs.readFileSync(op, 'utf8'));
  const mv = String(r.matrix.verdict);
  const vv = String(r.v11chain.verdict);
  const okMatrix = arm.expect.matrix === 'CURRENT' ? mv.startsWith('CURRENT') : (arm.expect.matrix === 'NOT-ASSERTABLE' ? mv.startsWith('NOT-ASSERTABLE') : !mv.startsWith('CURRENT'));
  const okV11 = arm.expect.v11 === 'CURRENT' ? vv.startsWith('CURRENT') : (arm.expect.v11 === 'NOT-ASSERTABLE' ? vv.startsWith('NOT-ASSERTABLE') : !vv.startsWith('CURRENT'));
  results.push({
    arm: arm.name, why: arm.why, auditExit: code,
    matrixVerdict: mv, v11Verdict: vv,
    signals: {
      pngMissing: r.matrix.pngMissing, pngSizeMismatch: r.matrix.pngSizeMismatch, pngHashMismatch: r.matrix.pngHashMismatch,
      recordedBundleMatchesLive: r.matrix.recordedBundleMatchesLive, contractFingerprintMatchesLive: r.matrix.contractFingerprintMatchesLive,
      v11NotMatching: r.v11chain.recordsNotMatchingLiveCandidate, v11Records: r.v11chain.records, v11Partial: r.v11chain.partial,
    },
    expected: arm.expect, pass: okMatrix && okV11,
  });
}
const summary = { round: 'r45h3-negctl', arms: results, passCount: results.filter((x) => x.pass).length, total: results.length };
fs.writeFileSync(path.join(SCR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exitCode = summary.passCount === summary.total ? 0 : 1;
