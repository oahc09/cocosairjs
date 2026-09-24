// r45n 写盘后 Addendum 尾注：一次性、可重入、断言全部前置。跑完即可删除。
const fs = require('fs');
const cr = require('crypto');

const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MARKER = '> 尾注（r45n 写盘后·归档面）';

const stamp = (b) => `${b.length}B/${cr.createHash('sha256').update(b).digest('hex').slice(0, 16)}`;

const oldBuf = fs.readFileSync(FILE);
const old = oldBuf.toString('utf8');
const report = { applied: false, preImage: stamp(oldBuf) };

if (old.includes(MARKER)) {
  report.note = '尾注已在盘 ⇒ 幂等跳过';
  console.log(JSON.stringify(report));
  process.exitCode = 0;
} else {
  // ---- 断言全部前置（写之前不许有任何副作用）----
  const heads = old.split('\n').filter((l) => l.startsWith('## Addendum '));
  const last = heads[heads.length - 1];
  const expected = '## Addendum r45n（2026-09-24，未提交）— F-132 收口：正典发布证据只由绿跑写出 + 负控搬出共享工作树 + 同族缺陷泛化登记（F-137）';
  if (last !== expected) throw new Error(`末段不是 r45n：${last}`);
  if (!old.endsWith('\n')) throw new Error('文件末无换行 ⇒ 追加会粘连');

  const files = fs.readdirSync(GATES).filter((f) => f.startsWith('r45n-')).sort();
  if (files.length < 10) throw new Error(`r45n 归档件数现读 ${files.length} < 10`);
  for (const f of ['r45n-ledger-run.cjs', 'r45n-ledger-run.log', 'r45n-consumer-postwrite.log']) {
    if (!files.includes(f)) throw new Error(`缺件：${f}`);
  }

  const NOTE = [
    '',
    MARKER + '：上面第 7 点的「新增七件」是**写盘前**的归档面读数，写盘后本目录的 `r45n-*` 由七件增至**十件以上** —— 多出的三份是跑动自身的回执（`r45n-ledger-run.cjs` / `r45n-ledger-run.log` / `r45n-consumer-postwrite.log`），它们都入 `raw/gates/` 在册，但按 index 行的同一纪律**不入 `raw[]`**（一行不能引用只有自己这次跑动才存在的件）。写出本注的脚本随后也会归档 ⇒ 件数再 +1，故此处只登记**差值与理由**、不写终值（陷阱 39）。字节/哈希账以 `raw/gates/r45n-ledger-run.log` 第 5 节（八对逐字节等）与本注现读为准；写盘后 `verify:consumer` `EXIT=1` 且失败项恰为 F-85 一条、`exportCount 574`、tarball 10,367,278 B。',
    '> 本注为纯追加：只增不改，前像锁＝写盘前该文件字节/sha256 由 `raw/gates/r45n-ledger-run.log` 第 3 节登记（236,747 B / `bd858e275bb9c202`）；本注写出后的终值请一律复算，不在此写死（陷阱 39）。',
    '> 另：本段标题里的「未提交」与第 7 点里的门禁复跑读数都是**写盘时点**读数 —— 提交与否由 owner 逐次授权、不在台账里写终值（陷阱 39），引用前复算 `git log`/`git status`。',
    '',
  ].join('\n');

  if (/[A-Za-z]:[\\/]/.test(NOTE)) throw new Error('尾注含盘符绝对路径 ⇒ 台账发布面禁写');
  const newBuf = Buffer.from(old + NOTE, 'utf8');
  if (!newBuf.subarray(0, oldBuf.length).equals(oldBuf)) throw new Error('纯追加不变量被破坏');

  // ---- 写入 + 复读回证 ----
  fs.writeFileSync(FILE, newBuf);
  const back = fs.readFileSync(FILE);
  if (!back.equals(newBuf)) throw new Error('复读与预期字节不等');
  if (!back.toString('utf8').startsWith(old)) throw new Error('复读不以前像为前缀');
  report.applied = true;
  report.postImage = stamp(back);
  report.appendedBytes = back.length - oldBuf.length;
  report.files = files.length;
  console.log(JSON.stringify(report, null, 2));
}
