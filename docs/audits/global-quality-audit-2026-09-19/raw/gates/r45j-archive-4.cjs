'use strict';
/**
 * r45j 归档第四批：正确取码的门禁日志 + 第三批归档脚本 + 台账追加脚本。
 * 关键在册事实（不改写历史）：第三批之前的 `r45j-consumer-chainface.log` 用 `EXIT=$?` 取的是
 * 管道尾 `tail` 的退出码 ⇒ 其 consumer 段被误记为 EXIT=0（实为 1）。该原件保留不删不改，
 * 正确读数以本批 `r45j-gates-after.log`（PIPESTATUS 取码）为准。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const GATES = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = GATES + 'r45j-archive-manifest.json';
const FILES = ['v12-logs/r45j-gates-after.log', 'db-probe/r45j-archive-3.cjs', 'db-probe/r45j-append-ledger.cjs'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const before = mf.files.length;
for (const e of mf.files) {
    const p = GATES + e.archivedAs;
    if (!fs.existsSync(p) || fs.statSync(p).size !== e.bytes || sha(fs.readFileSync(p)) !== e.sha256) throw new Error('既有归档条目失配：' + e.archivedAs);
}
if (mf.files.some((e) => e.archivedAs === 'r45j-gates-after.log')) throw new Error('本批已在册');
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
const bad = 'r45j-consumer-chainface.log';
const badEntry = mf.files.find((e) => e.archivedAs === bad);
if (!badEntry) throw new Error('缺既有原件条目 ⇒ 前提不成立');
added[0].supersedesNote = `${bad} 的 EXIT_* 行取的是管道尾 \`tail\` 的退出码（\`echo EXIT=$?\` 跟在 \`| tail\` 之后），非门禁自身退出码 ⇒ 其 consumer 段不可用作判定依据；原件保留不改写，判定读数以本件（PIPESTATUS 取码）为准。该原件自身仍带一处正确的 CONSUMER_EXIT（另一批次日志），不冲突。`;
fs.writeFileSync(MF, JSON.stringify({ ...mf, files: [...mf.files, ...added], updatedAt: new Date().toISOString(), note: mf.note + ' 第四批（r45j-archive-4.cjs）：PIPESTATUS 正确取码的门禁日志 + 第三/四批脚本本体；并声明 r45j-consumer-chainface.log 的 EXIT 行口径。' }, null, 2) + '\n');
const back = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (back.files.length !== before + added.length) throw new Error('manifest 计数不符');
for (let i = 0; i < before; i++) if (JSON.stringify(back.files[i]) !== JSON.stringify(mf.files[i])) throw new Error(`既有条目 ${i} 被改动`);
console.log(JSON.stringify({ ok: true, before, added: added.map((a) => a.archivedAs), total: back.files.length, totalBytes: back.files.reduce((x, y) => x + y.bytes, 0), supersedes: bad }, null, 2));
