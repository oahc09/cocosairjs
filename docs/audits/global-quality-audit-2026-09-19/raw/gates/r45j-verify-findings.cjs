'use strict';
/**
 * r45j 追加后的**只读**复核（不写台账）：证明 F-133/134/135 三条确为纯追加，且账面数字仍由盘上现算得出。
 * 存在理由：追加脚本真实运行时的 stdout 未 tee 落盘，故以「可重跑的等价回执」替代，而不是伪造一份运行日志。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const FILE = REPO + 'docs/audits/global-quality-audit-2026-09-19/findings.jsonl';
const D = REPO + 'docs/evidence/v12/v11chain-r45j/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const cur = fs.readFileSync(FILE);
const lines = cur.toString('utf8').split('\n').filter(Boolean);
const rows = lines.map((l) => JSON.parse(l));

// 纯追加证明：去掉尾部 3 行必须逐字节还原到登记预镜像（132 行 / 415620 B / d8c865ff1d6381ac）
const pre = Buffer.from(lines.slice(0, -3).join('\n') + '\n', 'utf8');
if (pre.length !== 415620 || sha16(pre) !== 'd8c865ff1d6381ac') throw new Error(`去尾 3 行未还原预镜像：${pre.length}B/${sha16(pre)}`);
if (!lines[lines.length - 3].startsWith('{"findingId":"F-133"') || !lines[lines.length - 1].startsWith('{"findingId":"F-135"')) throw new Error('尾部三行非 F-133…F-135');
const ids = rows.map((r) => r.findingId);
if (new Set(ids).size !== ids.length) throw new Error('findingId 重复');
if (rows.length !== 135) throw new Error(`行数 ${rows.length} != 135`);
const byId = Object.fromEntries(rows.map((r) => [r.findingId, r]));
for (const id of ['F-133', 'F-134', 'F-135']) {
    const r = byId[id];
    if (!r) throw new Error(id + ' 缺失');
    for (const k of ['requirementId', 'gate', 'category', 'status', 'location', 'repro', 'expected', 'actual', 'evidence', 'minimalFix', 'retest', 'measuredAt', 'scope_note']) {
        if (typeof r[k] !== 'string' || r[k].length === 0) throw new Error(`${id}.${k} 空/缺失`);
    }
    if (r.blocking !== false) throw new Error(`${id} blocking 应为 false（本轮未新增红门禁）`);
    if (/E:\/|C:\/|\\\\/.test(JSON.stringify(r))) throw new Error(`${id} 含仓库外绝对路径（发布面禁写）`);
    if (!/F-\d{2,3}\b/.test(r.scope_note + r.location + r.repro + r.expected + r.actual + r.evidence)) throw new Error(`${id} 无跨条引用锚`);
}

// 账面数字现算（与追加脚本同源逻辑）
const judge = JSON.parse(fs.readFileSync('E:/AIProMax/cocosair-scratch/v12-logs/r45j-reconcile-k.json', 'utf8'));
if (judge.hardCount !== 0 || judge.staleCount !== 0) throw new Error('判据未收敛');
const desync = judge.attributed.filter((l) => l.includes('产物失真'));
if (desync.length !== 4) throw new Error(`失真格 ${desync.length} != 4`);
if (byId['F-133'].actual.startsWith(`${desync.length} 格失真：` + desync.map((l) => l.split(' 产物失真')[0]).join(' / ') + '。') === false) throw new Error('F-133 actual 与盘上失真集合不再一致');
const diagScan = (prefix) => fs.readdirSync(D).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort().map((f) => {
    const r = JSON.parse(fs.readFileSync(D + f, 'utf8')).results[0];
    return { result: r.result, errors: r.errors || [], unproven: (r.apiProof || []).filter((a) => a.proof === 'unproven').map((a) => a.api) };
});
const norm = (s) => String(s).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:PORT');
const sig = (x) => x.errors.map(norm).join('|') + '#' + x.unproven.sort().join(',');
const audio = diagScan('diag-audio-basic-wk-d');
const video = diagScan('diag-video-basic-wk');
const vfail = video.filter((x) => x.result === 'FAIL');
if (audio.length !== 3 || audio.some((x) => x.result === 'PASS')) throw new Error('audio STRUCTURAL 前提已变');
if (new Set(audio.map(sig)).size !== 1) throw new Error('audio 签名分裂');
if (video.length !== 5 || video.filter((x) => x.result === 'PASS').length !== 2) throw new Error('video INTERMITTENT 前提已变');
if (new Set(vfail.map(sig)).size !== 1) throw new Error('video 失败签名分裂');

console.log(JSON.stringify({
    ok: true, file: 'docs/audits/global-quality-audit-2026-09-19/findings.jsonl',
    bytes: cur.length, sha16: sha16(cur), lines: rows.length,
    pureAppendProof: { preImageBytes: pre.length, preImageSha16: sha16(pre), matchesLedgerRegistration: true },
    added: ['F-133', 'F-134', 'F-135'],
    derived: {
        desyncCells: desync.length, desyncCellsList: desync.map((l) => l.split(' 产物失真')[0]),
        threeEnginePass: judge.threeEnginePass, totals: judge.totals,
        audio: { n: audio.length, pass: 0, sigs: 1 }, video: { n: video.length, pass: 2, fail: vfail.length, sigs: 1 },
    },
    verifiedAt: new Date().toISOString(),
}, null, 2));
