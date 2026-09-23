'use strict';
/**
 * r45j 归档第二批：发布面脚本 / 门禁日志 / 只读回执复制进 raw/gates/。
 * 与第一批同纪律：只新增、存在同名即抛错；manifest 既有条目逐条字节校验后才追加。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const FILES = [
    'db-probe/r45j-readme.cjs',
    'db-probe/r45j-accept-patch.cjs',
    'db-probe/r45j-owner-decisions-patch.cjs',
    'db-probe/r45j-publish-face-verify.cjs',
    'v12-logs/r45j-owner-decisions.log',
    'v12-logs/r45j-publish-face-verify.log',
    'v12-logs/r45j-docrefs-after.log',
    'v12-logs/r45j-consumer-chainface.log',
    'v12-logs/r45j-consumer-typecheck.log',
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const beforeCount = mf.files.length;
// 既有条目逐条与盘核对（缺文件或字节变了都不许写）
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p)) throw new Error(`既有归档条目失配（缺文件）：${e.archivedAs}`);
    if (fs.statSync(p).size !== e.bytes) throw new Error(`既有归档条目失配（字节）：${e.archivedAs}`);
    if (e.sha256 && sha(fs.readFileSync(p)) !== e.sha256) throw new Error(`既有归档条目失配（哈希）：${e.archivedAs}`);
}
const added = [];
for (const rel of FILES) {
    const src = SCRATCH + rel;
    if (!fs.existsSync(src)) throw new Error('missing scratch file: ' + rel);
    const base = path.basename(rel);
    if (fs.existsSync(GATES + base)) throw new Error('归档位已存在同名文件，拒绝覆盖: ' + base);
    const buf = fs.readFileSync(src);
    fs.writeFileSync(GATES + base, buf);
    const back = fs.readFileSync(GATES + base);
    if (back.length !== buf.length || sha(back) !== sha(buf)) throw new Error('copy verify failed: ' + base);
    added.push({ from: rel, archivedAs: base, bytes: back.length, sha256: sha(back) });
}
const outText = JSON.stringify({ ...mf, files: [...mf.files, ...added], updatedAt: new Date().toISOString(), note: mf.note + ' 第二批（r45j-archive-2.cjs）：发布面脚本、门禁日志与只读回执。' }, null, 2) + '\n';
fs.writeFileSync(MF, outText);
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== beforeCount + added.length) throw new Error(`manifest 行数 ${back.files.length} != ${beforeCount}+${added.length}`);
for (let i = 0; i < beforeCount; i++) if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`既有条目 ${i} 被改动`);
console.log(JSON.stringify({ ok: true, before: beforeCount, added: added.length, total: back.files.length, totalBytes: back.files.reduce((a, b) => a + b.bytes, 0) }, null, 2));
