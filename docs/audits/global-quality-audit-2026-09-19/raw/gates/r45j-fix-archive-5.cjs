'use strict';
/**
 * r45j 归档第五批（含一次受控替换）：
 *  - 替换 `r45j-append-ledger.cjs` 归档件：首版归档后脚本又被改了两处（`read(AUD+…)` 重复前缀 ⇒ ENOENT；
 *    未转义的 `${PIPESTATUS[0]}` ⇒ 模板插值 ReferenceError）。两次都在任何写盘之前抛出 ⇒ 台账未被污染
 *    （verification-summary 当时仍 211,448 B / 828615c57182a9db，已现读复核）。
 *  - 新增 `r45j-archive-4.cjs`（该脚本自身无法自归档）。
 * 纪律同前：既有条目逐条字节+哈希核对；被替换条目记 previousSha256 + 理由。
 */
const fs = require('fs');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const before = mf.files.length;
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p) || fs.statSync(p).size !== e.bytes || sha(fs.readFileSync(p)) !== e.sha256) throw new Error('既有归档条目失配：' + e.archivedAs);
}
const idx = mf.files.findIndex((e) => e.archivedAs === 'r45j-append-ledger.cjs');
if (idx < 0) throw new Error('append-ledger 条目缺失');
if (mf.note.includes('第五批')) throw new Error('第五批已应用过 ⇒ note 会二次追加，拒绝重跑（陷阱 47：多文件写入必须可重入）');
const srcNew = fs.readFileSync(SCRATCH + 'db-probe/r45j-append-ledger.cjs');
const prev = mf.files[idx];
const replaced = {
    ...prev,
    bytes: srcNew.length,
    sha256: sha(srcNew),
    previousSha256: prev.sha256,
    previousBytes: prev.bytes,
    replacementReason: '归档件是「带 bug 的中间版」：归档后本脚本又修三处 —— ① `read(AUD+…)` 重复拼 REPO 前缀 ⇒ ENOENT；② `${PIPESTATUS[0]}` 未转义 ⇒ 模板插值 ReferenceError；③ 多文件写入不是原子的：一次运行在写完 verification-summary 之后、写 evidence-index 之前抛错（`raw[]` 引用了当时尚未归档的 `r45j-archive-4.cjs`），留下「半应用」态 ⇒ 重构为「全部前置断言通过后才开始第一次写盘」+ summary 侧「已应用则复原前像并跳过写盘」的可重入守卫（新陷阱 47）。①② 都在写盘语句之前抛出，当场现读 verification-summary 仍 211,448 B / 828615c57182a9db ⇒ 台账零污染；③ 是唯一一次半应用，现读 summary 219,572 B / fff6b58888a3105d 且「丢弃 ADD 段 ⇒ 逐字节还原前像」成立 ⇒ 只追加了一次。归档必须与真正跑通的原件逐字节同，故受控替换。',
    replacedAt: new Date().toISOString(),
};
const files = mf.files.slice();
files[idx] = replaced;
const a4 = { from: 'db-probe/r45j-archive-4.cjs', archivedAs: 'r45j-archive-4.cjs' };
const a4buf = fs.readFileSync(SCRATCH + a4.from);
a4.bytes = a4buf.length; a4.sha256 = sha(a4buf);
fs.writeFileSync(GATES + 'r45j-append-ledger.cjs', srcNew);
fs.writeFileSync(GATES + 'r45j-archive-4.cjs', a4buf);
if (sha(fs.readFileSync(GATES + 'r45j-append-ledger.cjs')) !== replaced.sha256) throw new Error('替换件回读不符');
if (sha(fs.readFileSync(GATES + 'r45j-archive-4.cjs')) !== a4.sha256) throw new Error('新增件回读不符');
fs.writeFileSync(MF, JSON.stringify({ ...mf, files: [...files, a4], updatedAt: new Date().toISOString(), note: mf.note + ' 第五批（r45j-fix-archive-5.cjs）：受控替换 append-ledger 归档件 + 补档 archive-4。' }, null, 2) + '\n');
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== before + 1) throw new Error('manifest 计数不符');
for (let i = 0; i < before; i++) if (i === idx) continue; else if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`非目标条目 ${i} 被改动`);
console.log(JSON.stringify({ ok: true, before, total: back.files.length, replaced: { archivedAs: replaced.archivedAs, previousSha256: prev.sha256.slice(0, 16), sha256: replaced.sha256.slice(0, 16), previousBytes: prev.bytes, bytes: replaced.bytes }, added: a4.archivedAs, totalBytes: back.files.reduce((x, y) => x + y.bytes, 0) }, null, 2));
