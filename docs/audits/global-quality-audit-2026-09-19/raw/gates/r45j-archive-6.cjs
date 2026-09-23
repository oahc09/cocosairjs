'use strict';
/**
 * r45j 归档第六批：补档 archive-5 脚本本身、本脚本自身（自归档：读自身字节写进 gates 并回读校验）、
 * 以及台账写盘前的最后一份只读门禁日志 r45j-docrefs-final.log。
 * 纪律同前：先逐条核对既有归档条目（字节 + sha256），全部通过后才写盘；同名在册即抛；
 *            manifest 的 note 有重复应用守卫；非目标条目逐条不得改动。
 */
const fs = require('fs');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const before = mf.files.length;
if (mf.note.includes('第六批')) throw new Error('第六批已应用过 ⇒ note 会二次追加，拒绝重跑（陷阱 47）');
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p) || fs.statSync(p).size !== e.bytes || sha(fs.readFileSync(p)) !== e.sha256) throw new Error('既有归档条目失配：' + e.archivedAs);
}

const SOURCES = [
    { from: 'db-probe/r45j-fix-archive-5.cjs', archivedAs: 'r45j-fix-archive-5.cjs' },
    { from: 'db-probe/r45j-archive-6.cjs', archivedAs: 'r45j-archive-6.cjs' },
    { from: 'v12-logs/r45j-docrefs-final.log', archivedAs: 'r45j-docrefs-final.log' },
];
for (const s of SOURCES) if (mf.files.some((e) => e.archivedAs === s.archivedAs)) throw new Error('已在册，拒绝覆盖：' + s.archivedAs);
const bufs = SOURCES.map((s) => {
    const b = fs.readFileSync(SCRATCH + s.from);
    if (!b.length) throw new Error('源文件为空：' + s.from);
    return b;
});
// docrefs 日志必须是本轮那份 exit 0 的只读门禁回执（写盘前先看内容，不看退出码传闻）
const doc = bufs[2].toString('utf8');
if (!/"ok":true,"docs":118,"refsChecked":1087/.test(doc) || !/DOCREFS_EXIT=0/.test(doc)) throw new Error('docrefs-final.log 形态异常：\n' + doc.slice(0, 200));

for (const [i, s] of SOURCES.entries()) {
    fs.writeFileSync(GATES + s.archivedAs, bufs[i]);
    const back = fs.readFileSync(GATES + s.archivedAs);
    if (back.length !== bufs[i].length || sha(back) !== sha(bufs[i])) throw new Error('copy verify failed: ' + s.archivedAs);
}
const added = SOURCES.map((s, i) => ({ from: s.from, archivedAs: s.archivedAs, bytes: bufs[i].length, sha256: sha(bufs[i]) }));
fs.writeFileSync(MF, JSON.stringify({ ...mf, files: [...mf.files, ...added], updatedAt: new Date().toISOString(), note: mf.note + ' 第六批（r45j-archive-6.cjs）：补档 archive-5 脚本 + 本脚本自归档 + 台账写盘前末次只读门禁日志。' }, null, 2) + '\n');
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== before + SOURCES.length) throw new Error('manifest 计数不符');
for (let i = 0; i < before; i++) if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`非目标条目 ${i} 被改动`);
console.log(JSON.stringify({ ok: true, before, total: back.files.length, added: added.map((a) => a.archivedAs), totalBytes: back.files.reduce((x, y) => x + y.bytes, 0) }, null, 2));
