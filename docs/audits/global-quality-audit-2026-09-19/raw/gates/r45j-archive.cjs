'use strict';
/**
 * r45j 归档：把本轮 scratch 脚本 / 日志 / 判据输出按字节复制进 raw/gates/，逐文件校验 sha256 一致后才记账。
 * 只新增，不覆盖同名既有归档（存在即抛错）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/';
const DEST = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/raw/gates/';
const FILES = [
    'db-probe/r45j-batch.sh',
    'db-probe/r45j-reconcile.cjs',
    'db-probe/r45j-fail-detail.cjs',
    'db-probe/r45j-reconcile-k.cjs',
    'db-probe/r45j-negctl.cjs',
    'db-probe/r45j-negctl-dbg.cjs',
    'db-probe/r45j-append-findings.cjs',
    'db-probe/r45j-webkit-determinism.sh',
    'v12-logs/r45j-remaining-ids.json',
    'v12-logs/r45j-preflight.log',
    'v12-logs/r45j-preflight-firefox.json',
    'v12-logs/r45j-firefox-chunkA-garbage.log',
    'v12-logs/r45j-firefox-chunkA.log',
    'v12-logs/r45j-firefox-chunkB.log',
    'v12-logs/r45j-webkit-chunkA.log',
    'v12-logs/r45j-webkit-chunkB.log',
    'v12-logs/r45j-mesh-torus-firefox.log',
    'v12-logs/r45j-mesh-torus-webkit.log',
    'v12-logs/r45j-batch.out',
    'v12-logs/r45j-exits.txt',
    'v12-logs/r45j-reconcile.json',
    'v12-logs/r45j-reconcile-k-pre.log',
    'v12-logs/r45j-reconcile-k-final.log',
    'v12-logs/r45j-reconcile-k.json',
    'v12-logs/r45j-videobasic-wk-repro.log',
    'v12-logs/r45j-webkit-determinism.log',
    'v12-logs/r45j-webkit-determinism.out',
    'v12-logs/r45j-negctl.log',
    'r45j-negctl/negctl-summary.json',
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const manifest = [];
for (const rel of FILES) {
    const src = SCRATCH + rel;
    if (!fs.existsSync(src)) throw new Error('missing scratch file: ' + rel);
    const base = path.basename(rel);
    const out = DEST + base;
    if (fs.existsSync(out)) throw new Error('归档位已存在同名文件，拒绝覆盖: ' + base);
    const buf = fs.readFileSync(src);
    fs.writeFileSync(out, buf);
    const back = fs.readFileSync(out);
    if (back.length !== buf.length || sha(back) !== sha(buf)) throw new Error('copy verify failed: ' + base);
    manifest.push({ from: rel, archivedAs: base, bytes: back.length, sha256: sha(back) });
}
const mf = DEST + 'r45j-archive-manifest.json';
if (fs.existsSync(mf)) throw new Error('manifest already exists');
fs.writeFileSync(mf, JSON.stringify({ createdAt: new Date().toISOString(), dest: 'docs/audits/global-quality-audit-2026-09-19/raw/gates/', files: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, count: manifest.length, totalBytes: manifest.reduce((a, b) => a + b.bytes, 0) }, null, 2));
