'use strict';
/**
 * 修正归档：raw/gates/r45j-append-findings.cjs 首次归档的是**修复前**版本（模板字符串反引号未转义，node --check 即抛
 * SyntaxError ⇒ 从未也永远无法运行）。归档必须等于实际运行件，故只允许覆盖这一个文件，并把 old/new sha 写进 manifest 留痕。
 * 同时补归档「只读复核件」：追加脚本当时的真实 stdout 未 tee 落盘，以可重跑的等价回执（r45j-verify-findings.*）替代，不伪造日志。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const DEST = REPO + 'docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const MF = DEST + 'r45j-archive-manifest.json';
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const verifyLog = fs.readFileSync(SCRATCH + 'v12-logs/r45j-verify-findings.log', 'utf8');
const jv = JSON.parse(verifyLog);
if (!jv.ok || jv.pureAppendProof.preImageSha16 !== 'd8c865ff1d6381ac' || jv.sha16 !== 'a9608165949a3748' || jv.lines !== 135) {
    throw new Error('未见「F-133/134/135 已纯追加且盘上复核通过」的回执，拒绝替换归档');
}

const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
function put(relSrc, archivedAs, allowReplace, reason) {
    const buf = fs.readFileSync(SCRATCH + relSrc);
    const target = DEST + archivedAs;
    const existing = fs.existsSync(target) ? fs.readFileSync(target) : null;
    let entry = mf.files.find((f) => f.archivedAs === archivedAs);
    if (existing && !allowReplace) throw new Error('归档位已存在同名文件，拒绝覆盖: ' + archivedAs);
    if (existing && allowReplace) {
        if (!entry || entry.sha256 !== sha(existing)) throw new Error(`manifest 与盘上归档不符：${archivedAs}`);
        entry.previousSha256 = entry.sha256;
        entry.previousBytes = entry.bytes;
        entry.replacedAt = new Date().toISOString();
        entry.replacementReason = reason;
    }
    fs.writeFileSync(target, buf);
    const back = fs.readFileSync(target);
    if (back.length !== buf.length || sha(back) !== sha(buf)) throw new Error('copy verify failed: ' + archivedAs);
    if (entry) { entry.sha256 = sha(back); entry.bytes = back.length; }
    else {
        entry = { from: relSrc, archivedAs, bytes: back.length, sha256: sha(back) };
        mf.files.push(entry);
    }
    return entry;
}
const rep = put('db-probe/r45j-append-findings.cjs', 'r45j-append-findings.cjs', true,
    '首次归档件为修复前版本（SyntaxError，无法运行）；替换为实际追加 F-133/134/135 的版本，其效果由只读复核件 r45j-verify-findings.log 现盘证明（纯追加、预镜像还原一致）。');
put('db-probe/r45j-verify-findings.cjs', 'r45j-verify-findings.cjs', false);
put('v12-logs/r45j-verify-findings.log', 'r45j-verify-findings.log', false);
put('db-probe/r45j-archive.cjs', 'r45j-archive.cjs', false);
put('db-probe/r45j-fix-archive.cjs', 'r45j-fix-archive.cjs', false);
mf.files.sort((a, b) => (a.archivedAs < b.archivedAs ? -1 : 1));
mf.updatedAt = new Date().toISOString();
mf.note = 'r45j 批次归档。raw/gates 内文件为本轮 scratch 原件的逐字节副本；覆盖仅发生一次（r45j-append-findings.cjs），理由与该条 previousSha256 记在对应条目上。';
fs.writeFileSync(MF, JSON.stringify(mf, null, 2) + '\n');
const reread = JSON.parse(fs.readFileSync(MF, 'utf8'));
if (reread.files.length !== mf.files.length) throw new Error('manifest 回读条目数不符');
for (const name of ['r45j-append-findings.cjs', 'r45j-verify-findings.cjs', 'r45j-verify-findings.log', 'r45j-archive.cjs', 'r45j-fix-archive.cjs']) {
    const e = reread.files.find((f) => f.archivedAs === name);
    if (!e) throw new Error('manifest 缺条目 ' + name);
    if (sha(fs.readFileSync(DEST + name)) !== e.sha256) throw new Error('manifest sha 与盘上不符 ' + name);
}
console.log(JSON.stringify({ ok: true, manifestFiles: reread.files.length, replaced: { archivedAs: rep.archivedAs, oldSha: rep.previousSha256, newSha: rep.sha256, oldBytes: rep.previousBytes, newBytes: rep.bytes } }));
