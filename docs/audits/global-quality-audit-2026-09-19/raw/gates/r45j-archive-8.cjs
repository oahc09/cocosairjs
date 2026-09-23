'use strict';
/**
 * r45j 归档第八批（末次，只读回执）：台账写盘之后复跑的两份只读门禁回执 + 本脚本自归档 + 第七批归档件补档。
 * 纪律同前：既有 entries 逐条字节 + sha256 核对 → 全部通过才写盘；同名即抛；note 有重复应用守卫；非目标条目不得改动；写后回读。
 */
const fs = require('fs');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const before = mf.files.length;
if (mf.note.includes('第八批')) throw new Error('第八批已应用过 ⇒ note 会二次追加，拒绝重跑（陷阱 47）');
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p) || fs.statSync(p).size !== e.bytes || sha(fs.readFileSync(p)) !== e.sha256) throw new Error('既有归档条目失配：' + e.archivedAs);
}
const ADDS = [
    { from: 'v12-logs/r45j-docrefs-postledger.log', archivedAs: 'r45j-docrefs-postledger.log', must: ['"ok":true,"docs":118,"refsChecked":1087', 'DOCREFS_EXIT=0'] },
    { from: 'v12-logs/r45j-publish-face-verify-recheck.log', archivedAs: 'r45j-publish-face-verify-recheck.log', must: ['"ok": true', '"threeEnginePass": 49'] },
    { from: 'db-probe/r45j-archive-8.cjs', archivedAs: 'r45j-archive-8.cjs', must: null },
];
const todo = ADDS;
for (const s of todo) if (mf.files.some((e) => e.archivedAs === s.archivedAs)) throw new Error('已在册，拒绝覆盖：' + s.archivedAs);
const bufs = todo.map((s) => {
    const b = fs.readFileSync(SCRATCH + s.from);
    if (!b.length) throw new Error('源为空：' + s.from);
    if (s.must) for (const m of s.must) if (!b.toString('utf8').includes(m)) throw new Error(`回执缺期望标记 ${m}：${s.from}`);
    return b;
});
for (const [i, s] of todo.entries()) {
    fs.writeFileSync(GATES + s.archivedAs, bufs[i]);
    const back = fs.readFileSync(GATES + s.archivedAs);
    if (back.length !== bufs[i].length || sha(back) !== sha(bufs[i])) throw new Error('copy verify failed: ' + s.archivedAs);
}
const added = todo.map((s, i) => ({ from: s.from, archivedAs: s.archivedAs, bytes: bufs[i].length, sha256: sha(bufs[i]) }));
fs.writeFileSync(MF, JSON.stringify({ ...mf, files: [...mf.files, ...added], updatedAt: new Date().toISOString(), note: mf.note + ' 第八批（r45j-archive-8.cjs）：台账写盘后的末次只读回执（doc-refs + 发布面复核）+ 本脚本自归档。' }, null, 2) + '\n');
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== before + todo.length) throw new Error('manifest 计数不符');
for (let i = 0; i < before; i++) if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`非目标条目 ${i} 被改动`);
console.log(JSON.stringify({ ok: true, before, total: back.files.length, totalBytes: back.files.reduce((x, y) => x + y.bytes, 0), added: added.map((a) => a.archivedAs) }, null, 2));
