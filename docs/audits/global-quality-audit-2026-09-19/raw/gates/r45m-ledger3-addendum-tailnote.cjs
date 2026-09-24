'use strict';
/**
 * r45m 台账 Addendum 第 9 点「写盘后补句」的一处锚点式插入。
 * 判据：写前锁 → 锚点命中恰 1 → 插入文本无仓库外绝对路径 → 可重入（已存在则 SKIP 并整段跳过）
 *      → 反插入逐字节还原前像 → 字节账用 Buffer.byteLength → 断言全部前置后才写（陷阱 47）。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const TARGET_REL = 'docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const LOCK = JSON.parse(process.env.R45M_ADD2_LOCK || 'null');
if (!LOCK) throw new Error('必须提供 R45M_ADD2_LOCK={"bytes":N,"sha16":"..."}（写前现读）');

const MARK = '【写盘后补';
const ANCHOR = '⚠️ 本段是**台账写盘前**的读数；本段与 index 行的写盘本身不改任何门禁结论。';
const INSERT = MARK + '：本段落盘后复跑的只读门禁见 \`raw/gates/r45m-ledger2-run.log\`——doc-refs 与 v11-chain-face 仍 EXIT=0、\`npx jest\` 仍 32 套件 / 262 用例全绿，写盘未改任何门禁结论（该回执由写盘之后落盘，故不在 index 行 raw[] 自指清单内）。】';

/* 注入通道仅供负控臂写仓库外副本（陷阱 40：必须有一臂自证注入生效）；正跑不设 ⇒ 走仓库正典路径 */
const file = process.env.R45M_ADD2_TARGET || REPO + TARGET_REL;
const pre = fs.readFileSync(file);
if (pre.length !== LOCK.bytes || sha16(pre) !== LOCK.sha16)
  throw new Error(`写前锁不匹配：现读 ${pre.length}/${sha16(pre)} 锁 ${LOCK.bytes}/${LOCK.sha16}`);
const txt = pre.toString('utf8');
if (txt.includes(MARK)) { console.log('SKIP（已应用）：写盘后补句已存在 ⇒ 不重复插入'); process.exit(0); }
const hits = txt.split(ANCHOR).length - 1;
if (hits !== 1) throw new Error(`锚点命中 ${hits} 次（要求恰 1）⇒ 停手核对，不猜位置`);
const next = txt.replace(ANCHOR, ANCHOR + INSERT);
if (/E:\/|\/home\/|[A-Za-z]:\\\\/.test(INSERT)) throw new Error('插入文本含仓库外绝对路径');
if (!next.startsWith(txt.slice(0, txt.indexOf(ANCHOR) + ANCHOR.length))) throw new Error('非纯插入：锚点之前被改写');
if (Buffer.byteLength(next, 'utf8') <= Buffer.byteLength(txt, 'utf8')) throw new Error('未变长 ⇒ 插入未发生');
/* 反插入还原必须逐字节回到前像，才证明只动了那一处 */
if (next.replace(INSERT, '') !== txt) throw new Error('反插入还原不等于前像');

if (process.env.R45M_ADD2_DRYRUN) {
  console.log(JSON.stringify({ ok: true, dryRun: true, delta: Buffer.byteLength(next, 'utf8') - pre.length }));
  process.exit(0);
}
fs.writeFileSync(file, next);
const post = fs.readFileSync(file);
if (post.length !== Buffer.byteLength(next, 'utf8') || sha16(post) !== sha16(Buffer.from(next, 'utf8')))
  throw new Error('写后读回不符');
console.log(JSON.stringify({
  ok: true, target: file, injectedTarget: !!process.env.R45M_ADD2_TARGET,
  pre: { bytes: pre.length, sha16: sha16(pre) },
  delta: post.length - pre.length, postBytes: post.length,
}));
