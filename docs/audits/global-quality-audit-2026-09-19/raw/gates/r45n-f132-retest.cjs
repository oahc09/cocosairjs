/* F-132 收口复测：在**默认落点**（完全不传 --out/--examples-dir）上跑一次真树红态，
 * 断言发布证据 docs/evidence/v11-spec-validate.json 逐字节未动，然后立即还原 example.json。
 * 只在 finally 里还原；还原后逐字节核对，任何偏差都抛错。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = 'E:/AIProMax/github/cocosair.js';
const SPEC = path.join(REPO, 'examples', 'mesh-sphere', 'example.json');
const CANON = path.join(REPO, 'docs', 'evidence', 'v11-spec-validate.json');
const SENTINEL = 'not-a-real-validator';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const stamp = (p) => { const b = fs.readFileSync(p); return `${b.length}/${sha(b)}`; };

function run (args) {
  try {
    const stdout = execFileSync('node', [path.join(REPO, 'tools/examples/spec-validate.cjs'), ...args], { cwd: REPO, encoding: 'utf8' });
    return { status: 0, stdout };
  } catch (e) { return { status: e.status ?? 1, stdout: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
}

const original = fs.readFileSync(SPEC);
if (original.toString('utf8').includes(SENTINEL)) throw new Error('真树基线已带哨兵 ⇒ 停手核对，别把它当洁净基线');
const canonBefore = stamp(CANON);
const specBefore = stamp(SPEC);
let report = { canonBefore, specBefore };
try {
  const tampered = JSON.parse(original.toString('utf8'));
  tampered.validation.functional.push(SENTINEL);
  fs.writeFileSync(SPEC, JSON.stringify(tampered, null, 2) + '\n');

  // R1：默认落点 + 真树红 ⇒ 期望 EXIT=1、命中 [F-132] 拒绝行、正典字节零变化
  const r1 = run([]);
  report.R1 = { exit: r1.status, hitF132: r1.stdout.includes('[F-132]'), tail: r1.stdout.trim().split('\n').pop(), canonAfter: stamp(CANON) };

  // R2：同一红态 + --strict ⇒ 同样拒绝（判定红与 flag 组合无关）
  const r2 = run(['--strict']);
  report.R2 = { exit: r2.status, hitF132: r2.stdout.includes('[F-132]'), canonAfter: stamp(CANON) };
} finally {
  fs.writeFileSync(SPEC, original);
  report.restored = { after: stamp(SPEC), exact: stamp(SPEC) === specBefore };
}
report.canonFinal = stamp(CANON);
report.verdict = {
  canonicalUntouched: report.canonFinal === canonBefore,
  r1Refused: report.R1 && report.R1.exit === 1 && report.R1.hitF132 === true,
  r2Refused: report.R2 && report.R2.exit === 1 && report.R2.hitF132 === true,
  treeRestored: report.restored.exact,
};
// 还原后跑一次绿，确认当期正典可刷新（写盘纪律未把绿跑一起堵死）
const green = run([]);
report.greenRun = { exit: green.status, line: green.stdout.trim().split('\n').pop(), canonAfterGreen: stamp(CANON) };
console.log(JSON.stringify(report, null, 2));
