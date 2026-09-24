/* r45n 台账判据脚本的负控臂：全部跑在仓库外镜像目录，真树在跑动前后必须逐字节不变。
 * 陷阱 48：每臂的锁按「该臂当前镜像内容」现算，否则共享的写前锁会把臂静默短路在锁层。
 * 陷阱 40：注入臂必须自证注入生效（镜像变了 + 真树没变）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const REAL = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/';
const SCRIPT = 'E:/AIProMax/cocosair-scratch/db-probe/r45n-ledger.cjs';
const BASE = 'E:/AIProMax/cocosair-scratch/r45n-ledger-nc';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const FILES = ['findings.jsonl', 'evidence-index.json', 'verification-summary.md'];
const RAWS = (function crossSourceRawList () {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const m = src.match(/const RAW = \[([\s\S]*?)\];/);
  if (!m) throw new Error('无法从判据脚本解析出 RAW 清单 ⇒ 跨源核对失败，停手');
  const list = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (!list.length) throw new Error('判据脚本 RAW 为空 ⇒ 负控无从构造');
  return list;
})();

function snapshot (dir) {
  const o = {};
  for (const f of FILES) { const b = fs.readFileSync(dir + f); o[f] = `${b.length}/${sha16(b)}`; }
  return o;
}
function lockOf (dir) {
  const l = {};
  for (const [f, key] of [['findings.jsonl', 'findings'], ['evidence-index.json', 'index'], ['verification-summary.md', 'summary']]) {
    const b = fs.readFileSync(dir + f);
    l[key] = { bytes: b.length, sha16: sha16(b) };
  }
  return JSON.stringify(l);
}
function newMirror (name) {
  const dir = `${BASE}/${name}/`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir + 'raw/gates', { recursive: true });
  for (const f of FILES) fs.copyFileSync(REAL + f, dir + f);
  for (const f of RAWS) fs.copyFileSync(REAL + 'raw/gates/' + f, dir + 'raw/gates/' + f);
  return dir;
}
function run (dir, extraEnv) {
  const env = Object.assign({}, process.env, { R45N_LEDGER_DIR: dir, R45N_LEDGER_LOCK: lockOf(dir) }, extraEnv || {});
  const r = cp.spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const realBefore = snapshot(REAL);
const arms = [];
function arm (id, expect, judge) {
  let verdict;
  try { verdict = judge(); } catch (e) { verdict = { ok: false, why: '臂自身抛错：' + e.message }; }
  arms.push(Object.assign({ id, expect }, verdict));
  console.log(`${verdict.ok ? 'PASS' : 'FAIL'} ${id} :: expect=${expect} :: ${verdict.actual}`);
}

/* N0：注入臂自证——镜像写盘成功，三段都变长 */
let mirrorN0 = null;
arm('N0-injection-selfproof', '镜像 applied 三段 true + 注入生效', () => {
  mirrorN0 = newMirror('n0');
  const before = snapshot(mirrorN0);
  const r = run(mirrorN0);
  const j = JSON.parse(r.out);
  const after = snapshot(mirrorN0);
  const grew = FILES.every((f) => after[f] !== before[f]);
  const ok = r.code === 0 && j.dryRun === undefined && j.injection.dir === true &&
    j.applied.findings && j.applied.index && j.applied.summary && grew;
  return { ok, actual: `EXIT=${r.code} injection.dir=${j.injection.dir} applied=${JSON.stringify(j.applied)} 三段全变=${grew} rawListed=${j.rawListed}` };
});

/* N1：锁假 → 锁层红，镜像不动 */
arm('N1-false-lock', 'EXIT!=0 + "写前锁不匹配" + 镜像逐字节不变', () => {
  const dir = newMirror('n1');
  const before = snapshot(dir);
  const lock = JSON.parse(lockOf(dir));
  lock.findings.bytes = lock.findings.bytes + 1;
  const r = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8',
    env: Object.assign({}, process.env, { R45N_LEDGER_DIR: dir, R45N_LEDGER_LOCK: JSON.stringify(lock) }) });
  const out = r.stdout + r.stderr;
  return { ok: r.status !== 0 && out.includes('写前锁不匹配') && JSON.stringify(snapshot(dir)) === JSON.stringify(before),
    actual: `EXIT=${r.status} 命中锁层=${out.includes('写前锁不匹配')} 镜像未动=${JSON.stringify(snapshot(dir)) === JSON.stringify(before)}` };
});

/* N2：raw[] 引用缺件 → 建锁之前即红，镜像不动 */
arm('N2-raw-missing-file', 'EXIT!=0 + "raw[] 引用了不在盘的件"', () => {
  const dir = newMirror('n2');
  const before = snapshot(dir);
  fs.rmSync(dir + 'raw/gates/r45n-gates.log');
  const r = run(dir);
  const hit = r.out.includes('raw[] 引用了不在盘的件：raw/gates/r45n-gates.log');
  return { ok: r.code !== 0 && hit && JSON.stringify(snapshot(dir)) === JSON.stringify(before),
    actual: `EXIT=${r.code} 命中=${hit} 镜像未动=${JSON.stringify(snapshot(dir)) === JSON.stringify(before)}` };
});

/* N3：index 非规范序列化（4 空格缩进，仍是合法 JSON）→ 序列化层红，而非锁层 */
arm('N3-noncanonical-serialization', 'EXIT!=0 + "index 非规范序列化形态"', () => {
  const dir = newMirror('n3');
  const txt = fs.readFileSync(dir + 'evidence-index.json', 'utf8');
  fs.writeFileSync(dir + 'evidence-index.json', JSON.stringify(JSON.parse(txt), null, 4) + '\n');
  const before = snapshot(dir);
  const r = run(dir);
  const hit = r.out.includes('index 非规范序列化形态');
  return { ok: r.code !== 0 && hit && JSON.stringify(snapshot(dir)) === JSON.stringify(before),
    actual: `EXIT=${r.code} 命中序列化层=${hit}（非锁层：${r.out.includes('写前锁不匹配') ? '错' : '锁已按改后内容现算'}）镜像未动=${JSON.stringify(snapshot(dir)) === JSON.stringify(before)}` };
});

/* N4：三处均已应用 → 整段抛错，不重复追加 */
arm('N4-all-applied-throws', 'EXIT!=0 + "三处均已应用" + 二次跑镜像不变', () => {
  const dir = mirrorN0;
  const before = snapshot(dir);
  const r = run(dir);
  const hit = r.out.includes('三处均已应用');
  return { ok: r.code !== 0 && hit && JSON.stringify(snapshot(dir)) === JSON.stringify(before),
    actual: `EXIT=${r.code} 命中=${hit} 镜像未动=${JSON.stringify(snapshot(dir)) === JSON.stringify(before)}` };
});

/* N5：半应用态（F-132 已改状态但 F-137 行被删）→ 必须抛错而非静默补 */
arm('N5-half-applied-detected', 'EXIT!=0 + "半应用态"', () => {
  const dir = newMirror('n5');
  const lines = fs.readFileSync(dir + 'findings.jsonl', 'utf8').split('\n').filter(Boolean);
  const patched = JSON.parse(lines.find((l) => JSON.parse(l).findingId === 'F-132'));
  patched.status = 'FIXED-AND-PROVEN（r45n：…）';
  lines[lines.findIndex((l) => JSON.parse(l).findingId === 'F-132')] = JSON.stringify(patched);
  fs.writeFileSync(dir + 'findings.jsonl', lines.join('\n') + '\n');
  const before = snapshot(dir);
  const r = run(dir);
  const hit = r.out.includes('半应用态');
  return { ok: r.code !== 0 && hit && JSON.stringify(snapshot(dir)) === JSON.stringify(before),
    actual: `EXIT=${r.code} 命中=${hit} 镜像未动=${JSON.stringify(snapshot(dir)) === JSON.stringify(before)}` };
});

/* N6：部分重入（只 index 已应用）→ 跳过 index、追加 findings/summary，行数不重复 */
arm('N6-partial-reentrancy', 'applied.index=false 且行数 +1 不 +2', () => {
  const dir = newMirror('n6');
  const applied = run(dir);
  const j1 = JSON.parse(applied.out);
  // 只把 findings / summary 还原成原始，index 保留已应用态
  for (const f of ['findings.jsonl', 'verification-summary.md']) fs.copyFileSync(REAL + f, dir + f);
  const idxRowsBefore = JSON.parse(fs.readFileSync(dir + 'evidence-index.json', 'utf8')).evidence.length;
  const r = run(dir);
  const j2 = JSON.parse(r.out);
  const idxRowsAfter = JSON.parse(fs.readFileSync(dir + 'evidence-index.json', 'utf8')).evidence.length;
  const fl = fs.readFileSync(dir + 'findings.jsonl', 'utf8').split('\n').filter(Boolean);
  const dupRow = JSON.stringify(JSON.parse(fs.readFileSync(dir + 'evidence-index.json', 'utf8')).evidence.map((e) => e.id))
    .split('"F132-CLOSURE-R45N"').length - 1;
  const ok = r.code === 0 && j2.applied.index === false && j2.applied.findings === true && j2.applied.summary === true
    && idxRowsBefore === idxRowsAfter && dupRow === 1 && fl.length === 137 && j1.applied.findings === true;
  return { ok, actual: `EXIT=${r.code} applied=${JSON.stringify(j2.applied)} 行数 ${idxRowsBefore}→${idxRowsAfter} 重复行=${dupRow} findings=${fl.length}` };
});

/* N7：相对路径注入 → 注入守卫层红 */
arm('N7-relative-injection-rejected', 'EXIT!=0 + "必须是绝对路径"', () => {
  const dir = 'r45n-ledger-nc/relative';
  const r = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: BASE,
    env: Object.assign({}, process.env, { R45N_LEDGER_DIR: dir, R45N_LEDGER_LOCK: lockOf(REAL) }) });
  const out = r.stdout + r.stderr;
  return { ok: r.status !== 0 && out.includes('R45N_LEDGER_DIR 必须是绝对路径'), actual: `EXIT=${r.status} 命中=${out.includes('R45N_LEDGER_DIR 必须是绝对路径')}` };
});

const realAfter = snapshot(REAL);
const realUntouched = JSON.stringify(realBefore) === JSON.stringify(realAfter);
console.log(JSON.stringify({ armsPassed: arms.filter((a) => a.ok).length, armsTotal: arms.length,
  realTree: { before: realBefore, after: realAfter, untouched: realUntouched } }, null, 2));
if (!realUntouched) throw new Error('负控泄漏：真树台账被改 ⇒ 立刻 git/备份核对');
if (arms.some((a) => !a.ok)) process.exitCode = 1;
