/* r45n 写盘后回执：只读复算台账三件 + 复跑四条门禁（不改任何判定）。
 * 陷阱 46：退出码一律取子进程自身 status，不经管道。 */
const cp = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const DIR = REPO + 'docs/audits/global-quality-audit-2026-09-19/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const stamp = (rel) => { const b = fs.readFileSync(DIR + rel); return `${b.length} B / ${sha16(b)}`; };

const L = [];
L.push('# r45n 台账写盘回执（raw/gates/r45n-ledger-run.log）');
L.push('# 生成：' + new Date().toISOString() + '　工作树：' + cp.execSync('git rev-parse --short HEAD', { cwd: REPO, encoding: 'utf8' }).trim());
L.push('');
L.push('## 1. 一次性写盘判据（r45n-ledger.cjs）本次跑动回执原样');
L.push(fs.readFileSync('E:/AIProMax/cocosair-scratch/db-probe/r45n-ledger-write.log', 'utf8').trim());
L.push('');
L.push('## 2. 判据负控（r45n-ledger-nc.cjs，8 臂全在仓库外镜像目录）回执原样');
L.push(fs.readFileSync('E:/AIProMax/cocosair-scratch/db-probe/r45n-ledger-nc.log', 'utf8').trim());
L.push('');
L.push('## 3. 写后台账三件独立只读复算（读文件重算，不复用判据自报值）');
for (const f of ['findings.jsonl', 'evidence-index.json', 'verification-summary.md']) L.push(`  ${f}: ${stamp(f)}`);
const fl = fs.readFileSync(DIR + 'findings.jsonl', 'utf8').split('\n').filter(Boolean);
const ids = fl.map((l) => JSON.parse(l).findingId);
L.push(`  findings 行数 ${fl.length}（写前 136 ⇒ +1＝F-137）；F-132 状态含 r45n ${/r45n/.test(JSON.parse(fl[ids.indexOf('F-132')]).status)}；F-137 在册 ${ids.includes('F-137')}；重复 findingId ${JSON.stringify(ids.filter((v, i) => ids.indexOf(v) !== i))}（期望 []）`);
const idx = JSON.parse(fs.readFileSync(DIR + 'evidence-index.json', 'utf8'));
const row = idx.evidence[idx.evidence.length - 1];
L.push(`  index 行数 ${idx.evidence.length}（写前 83 ⇒ +1）；末行 id ${row.id}；该行 raw[] 逐件存在 ${row.raw.every((p) => fs.existsSync(DIR + p))}（${row.raw.length} 件）`);
const sum = fs.readFileSync(DIR + 'verification-summary.md', 'utf8');
L.push(`  summary Addendum 段数 ${(sum.match(/^## Addendum /gm) || []).length}（写前 18 ⇒ +1），末段为 r45n：${/## Addendum r45n/.test(sum.slice(sum.lastIndexOf('## Addendum ')))}`);
L.push('');
L.push('## 4. 写盘后门禁复跑（只读，逐条取子进程退出码）');
const cmds = [
  ['verify:doc-refs', 'npm run verify:doc-refs'],
  ['verify:v11-chain-face', 'npm run verify:v11-chain-face'],
  ['verify:test-inventory', 'npm run verify:test-inventory'],
  ['npx jest --silent', 'npx jest --silent'],
];
for (const [label, cmd] of cmds) {
  const [bin, ...args] = cmd.split(' ');
  const r = cp.spawnSync(bin, args, { cwd: REPO, encoding: 'utf8', shell: true });
  const out = (r.stdout || '') + (r.stderr || '');
  const tail = out.split(/\r?\n/).filter(Boolean).slice(-6).join(' | ');
  L.push(`  ${label}: EXIT=${r.status}`);
  L.push(`    ${tail}`);
  console.log(`[${label}] EXIT=${r.status}`);
}
L.push('');
L.push('## 5. 归档件字节账（scratch 原件 ↔ raw/gates 在册副本）');
for (const f of ['r45n-f132-retest.cjs', 'r45n-f132-retest.log', 'r45n-gates.log',
  'r45n-ledger.cjs', 'r45n-addendum.md', 'r45n-ledger-nc.cjs', 'r45n-ledger-nc.log', 'r45n-ledger-run.cjs']) {
  const a = fs.readFileSync('E:/AIProMax/cocosair-scratch/db-probe/' + f);
  const b = fs.readFileSync(DIR + 'raw/gates/' + f);
  L.push(`  ${f}: ${a.length} B / ${sha16(a)} ↔ ${b.length} B / ${sha16(b)} ⇒ 逐字节等 ${a.equals(b)}`);
}
L.push('  index 行 raw[] 六件逐件存在性已在第 3 节复核；r45n-ledger-run.cjs 与 r45n-ledger-run.log 是本轮运行脚本/回执 ⇒ 不入 raw[]。');
L.push('');
L.push('## 6. 本回执自身');
L.push('  本文件（r45n-ledger-run.log）由本次写盘之后的跑动产生 ⇒ 刻意不列入本轮 index 行 raw[]；第 2 节的负控回执 r45n-ledger-nc.log 同理由写盘前落 raw/gates/ 归档，但也不入 raw[]（判据要求 raw[] 只列「写盘前已在盘且与本轮结论直接相关」的件；两份运行回执在 index 行的 status 文本与本回执里互引）。');
L.push('');
L.push('## 7. 写盘后自我更正补记');
L.push('  ⑤ 写盘前的口头播报把 raw/gates/r45n-ledger-nc.cjs 的字节数复述成 9449，现读 9544（sha16 94cf641073cd4f28 两处一致 ⇒ 只是复述错数，副本没错）。该数字未进入任何在册件，在册字节账以本回执第 5 节现读为准（陷阱 39：数字一律现读，别凭记忆写）。');
fs.writeFileSync('E:/AIProMax/cocosair-scratch/db-probe/r45n-ledger-run.log', L.join('\n') + '\n');
console.log('receipt written');
