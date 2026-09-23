'use strict';
/**
 * r45j 归档第七批（台账写盘后）：
 *  - 受控替换 `r45j-append-ledger.cjs` 归档件 —— 第五批归档后脚本又改了 4 处（锚点式可重入判定取代 endsWith(ADD)、
 *    标题行比对修正（ADD 以换行起始）、ADD_MATCHES_APPLIED 比较基准、补记用的措辞/转义与计数订正），
 *    真正的运行件＝本次归档的这份（写盘回执见 r45j-append-ledger.log）。
 *  - 新增 `r45j-ledger-corollary.cjs` + 两份运行日志 + 本脚本自归档。
 * 纪律同前：既有 entries 逐条字节 + sha256 核对；note 有重复应用守卫；非目标条目不得改动；写后回读。
 */
const fs = require('fs');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const before = mf.files.length;
if (mf.note.includes('第七批')) throw new Error('第七批已应用过 ⇒ note 会二次追加，拒绝重跑（陷阱 47）');
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p) || fs.statSync(p).size !== e.bytes || sha(fs.readFileSync(p)) !== e.sha256) throw new Error('既有归档条目失配：' + e.archivedAs);
}
const idx = mf.files.findIndex((e) => e.archivedAs === 'r45j-append-ledger.cjs');
if (idx < 0) throw new Error('append-ledger 条目缺失');
const prev = mf.files[idx];

const RUN = fs.readFileSync(SCRATCH + 'db-probe/r45j-append-ledger.cjs');
const runReceipt = JSON.parse((() => { const t = fs.readFileSync(SCRATCH + 'v12-logs/r45j-append-ledger.log', 'utf8'); return t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1); })());
if (runReceipt.ok !== true || runReceipt.index.rowsAfter !== 82) throw new Error('运行回执不是成功态 ⇒ 不得据其替换归档');
if (sha(RUN) !== prev.sha256 && RUN.length === prev.bytes) throw new Error('同字节却不同哈希：不可能，停');

const ADDS = [
    { from: 'db-probe/r45j-ledger-corollary.cjs', archivedAs: 'r45j-ledger-corollary.cjs' },
    { from: 'v12-logs/r45j-append-ledger.log', archivedAs: 'r45j-append-ledger.log' },
    { from: 'v12-logs/r45j-ledger-corollary.log', archivedAs: 'r45j-ledger-corollary.log' },
    { from: 'db-probe/r45j-archive-7.cjs', archivedAs: 'r45j-archive-7.cjs' },
];
for (const s of ADDS) if (mf.files.some((e) => e.archivedAs === s.archivedAs)) throw new Error('已在册，拒绝覆盖：' + s.archivedAs);
const bufs = ADDS.map((s) => { const b = fs.readFileSync(SCRATCH + s.from); if (!b.length) throw new Error('源为空：' + s.from); return b; });
// 日志必须是本轮真跑出来的：append-ledger 走 alreadyApplied 分支、corollary 走首写分支
if (!/"alreadyApplied": true/.test(bufs[1].toString('utf8'))) throw new Error('append-ledger 日志无 alreadyApplied:true ⇒ 不是那次收敛运行');
if (!/"alreadyApplied": false/.test(bufs[2].toString('utf8'))) throw new Error('corollary 日志无 alreadyApplied:false ⇒ 不是首写运行');

const replaced = {
    ...prev,
    bytes: RUN.length,
    sha256: sha(RUN),
    previousSha256: prev.sha256,
    previousBytes: prev.bytes,
    replacementReason: '第五批归档的是「已修 ①②③ 但尚未改成锚点式可重入」的中间版：其 endsWith(ADD) 判据在 ADD 文本随后订正（陷阱 42–47 计数、六批归档、转义修复）后永久失效 ⇒ 重跑被自家锁挡下。最终版改按 Addendum 标题锚点反推前像并核对写前锁，另修标题行比对（ADD 以换行起始）与比较基准。真正跑通并写出第 82 行的字节＝本件（回执 raw/gates/r45j-append-ledger.log：alreadyApplied:true + index 81→82 行）。',
    replacedAt: new Date().toISOString(),
};
fs.writeFileSync(GATES + 'r45j-append-ledger.cjs', RUN);
if (sha(fs.readFileSync(GATES + 'r45j-append-ledger.cjs')) !== replaced.sha256) throw new Error('替换件回读不符');
for (const [i, s] of ADDS.entries()) {
    fs.writeFileSync(GATES + s.archivedAs, bufs[i]);
    const back = fs.readFileSync(GATES + s.archivedAs);
    if (back.length !== bufs[i].length || sha(back) !== sha(bufs[i])) throw new Error('copy verify failed: ' + s.archivedAs);
}
const added = ADDS.map((s, i) => ({ from: s.from, archivedAs: s.archivedAs, bytes: bufs[i].length, sha256: sha(bufs[i]) }));
const files = mf.files.slice();
files[idx] = replaced;
fs.writeFileSync(MF, JSON.stringify({ ...mf, files: [...files, ...added], updatedAt: new Date().toISOString(), note: mf.note + ' 第七批（r45j-archive-7.cjs）：受控替换 append-ledger 为真正跑通版 + 补档 corollary 脚本与两份运行日志。' }, null, 2) + '\n');
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== before + ADDS.length) throw new Error('manifest 计数不符');
for (let i = 0; i < before; i++) {
    if (i === idx) continue;
    if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`非目标条目 ${i} 被改动`);
}
if (JSON.stringify(back.files[idx]) === JSON.stringify(prev)) throw new Error('目标条目未替换');
console.log(JSON.stringify({ ok: true, before, total: back.files.length, totalBytes: back.files.reduce((x, y) => x + y.bytes, 0), replaced: { archivedAs: replaced.archivedAs, previousBytes: prev.bytes, bytes: replaced.bytes, previousSha256_16: prev.sha256.slice(0, 16), sha256_16: replaced.sha256.slice(0, 16) }, added: added.map((a) => a.archivedAs) }, null, 2));
