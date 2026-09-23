'use strict';
/**
 * r45j 归档第三批：F-131 门禁日志 + 第二批归档脚本自身。同纪律：只新增、既有条目逐条校验。
 * 注：r45j-archive-2.cjs 在本批之前已运行，其 scratch 原件此后未再改动（本脚本写盘前逐字节比对确认）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const ARCHIVE2 = SCRATCH + 'db-probe/r45j-archive-2.cjs';
const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const beforeCount = mf.files.length;
const e2 = mf.files.find((x) => x.archivedAs === 'r45j-archive-2.cjs');
if (e2) throw new Error('archive-2 已在册 ⇒ 本脚本前提失效，先复核');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha2 = sha(fs.readFileSync(ARCHIVE2));
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p) || fs.statSync(p).size !== e.bytes || sha(fs.readFileSync(p)) !== e.sha256) throw new Error('既有归档条目失配：' + e.archivedAs);
}
const FILES = ['v12-logs/r45j-jest-f131.log', 'db-probe/r45j-archive-2.cjs'];
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
if (sha(fs.readFileSync(ARCHIVE2)) !== sha2) throw new Error('archive-2 原件在本脚本运行期间发生变化');
fs.writeFileSync(MF, JSON.stringify({ ...mf, files: [...mf.files, ...added], updatedAt: new Date().toISOString(), note: mf.note + ' 第三批（r45j-archive-3.cjs）：F-131 门禁日志与第二批归档脚本。' }, null, 2) + '\n');
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== beforeCount + added.length) throw new Error('manifest 计数不符');
for (let i = 0; i < beforeCount; i++) if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`既有条目 ${i} 被改动`);
console.log(JSON.stringify({ ok: true, before: beforeCount, added: added.map((a) => a.archivedAs), total: back.files.length, totalBytes: back.files.reduce((x, y) => x + y.bytes, 0) }, null, 2));
