'use strict';
// r45j 对账判据：52 例 × {chromium 正典, firefox, webkit}，firefox/webkit 各由 3 个源文件合并
// （r45i pilot11 一份 + r45j chunkA/chunkB 两份）。判据＝语义字段三引擎逐字相同 + 在册截图回读磁盘对账。
// R45J_FILES 仅供负向控制：键为「仓库相对路径」（陷阱 40：注入键必须与读取键同命名空间），正典路径不动。
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const override = process.env.R45J_FILES ? JSON.parse(process.env.R45J_FILES) : {};
const open = (p) => {
    const abs = override[p] || REPO + p;
    return { j: JSON.parse(fs.readFileSync(abs, 'utf8')), abs };
};
const EXPECT_FP = '9fa85f88b968d5f1';
const EXPECT_IDS = 52;

const SOURCES = {
    chromium: ['docs/evidence/v11-examples-verified.json'],
    firefox: [
        'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json',
        'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json',
        'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkB.json',
    ],
    webkit: [
        'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json',
        'docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkA.json',
        'docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkB.json',
    ],
};
const canonicalIds = JSON.parse(fs.readFileSync(REPO + SOURCES.chromium[0], 'utf8')).results.map((r) => r.id).sort();

const fail = [];
const engines = {};
for (const [eng, paths] of Object.entries(SOURCES)) {
    const byId = new Map();
    const files = [];
    for (const p of paths) {
        const { j, abs } = open(p);
        files.push({ path: p, readFrom: abs, bytes: fs.statSync(abs).size, sha16: sha16(fs.readFileSync(abs)), browser: j.browser || 'chromium', measuredAt: j.measuredAt, runPass: j.runPass, runTotal: j.runTotal, total: j.total, failCount: j.fail, completed: j.completed, partial: j.partial, subsetLen: Array.isArray(j.subset) ? j.subset.length : null, candidateFingerprint: j.candidateFingerprint, apiProofTotals: j.apiProofTotals, recordCount: j.results.length });
        for (const r of j.results) {
            if (byId.has(r.id)) fail.push(`${eng}/${r.id} DUPLICATE across sources`);
            byId.set(r.id, { r, src: p });
        }
    }
    engines[eng] = { byId, files };
    const ids = [...byId.keys()].sort();
    if (ids.length !== EXPECT_IDS) fail.push(`${eng} id count ${ids.length} != ${EXPECT_IDS}（反空转/反漏项）`);
    const missing = canonicalIds.filter((i) => !byId.has(i));
    const extra = ids.filter((i) => !canonicalIds.includes(i));
    if (missing.length) fail.push(`${eng} MISSING ids: ${missing.join(',')}`);
    if (extra.length) fail.push(`${eng} EXTRA ids: ${extra.join(',')}`);
}

const sum = (r) => {
    const t = { verified: 0, attested: 0, unproven: 0, other: 0 };
    for (const a of r.apiProof || []) t[a.proof in t ? a.proof : 'other']++;
    return t;
};
const table = {};
for (const id of canonicalIds) {
    const row = {};
    for (const eng of Object.keys(engines)) {
        const hit = engines[eng].byId.get(id);
        if (!hit) { row[eng] = null; continue; }
        const r = hit.r;
        if (eng !== 'chromium') {
            if (r.result !== 'PASS') fail.push(`${eng}/${id} result=${r.result}（来源 ${hit.src}）`);
            if (r.errors && r.errors.length) fail.push(`${eng}/${id} errors=${JSON.stringify(r.errors)}`);
        }
        if (r.candidateFingerprint !== EXPECT_FP) fail.push(`${eng}/${id} candidateFingerprint=${r.candidateFingerprint} != 当期 ${EXPECT_FP}`);
        const s = sum(r);
        if (s.unproven !== 0) fail.push(`${eng}/${id} ${eng} unproven=${s.unproven}`);
        if (s.other !== 0) fail.push(`${eng}/${id} ${eng} otherProof=${s.other}`);
        const art = r.artifact || {};
        let onDisk = 'none';
        if (art.path) {
            const abs = REPO + art.path.replace(/\\/g, '/');
            if (!fs.existsSync(abs)) { fail.push(`${eng}/${id} artifact missing ${art.path}`); onDisk = 'MISSING'; }
            else {
                const b = fs.readFileSync(abs);
                onDisk = `${b.length}/${sha16(b)}`;
                if (b.length !== art.bytes) fail.push(`${eng}/${id} ${eng} artifact bytes ${b.length}!=${art.bytes}`);
                if (sha16(b) !== art.hash) fail.push(`${eng}/${id} ${eng} artifact hash ${sha16(b)}!=${art.hash}`);
            }
        } else fail.push(`${eng}/${id} ${eng} has no artifact.path`);
        row[eng] = { src: hit.src, result: r.result, specFp: r.specFingerprint, srcFp: r.sourceFingerprint, candFp: r.candidateFingerprint, verified: s.verified, attested: s.attested, units: (r.apiProof || []).length, nodeCount: r.nodeCount, gaps: JSON.stringify(r.expectationGaps), instr: JSON.stringify(r.instrumentation), shot: art.path, shotOnDisk: onDisk };
    }
    const c = row.chromium, f = row.firefox, w = row.webkit;
    if (c && f && w) {
        for (const k of ['specFp', 'srcFp', 'candFp', 'verified', 'attested', 'units', 'gaps', 'instr']) {
            if (!(c[k] === f[k] && f[k] === w[k])) fail.push(`${id} cross-engine ${k} differs: cc=${c[k]} ff=${f[k]} wk=${w[k]}`);
        }
        // 截图允许跨引擎不等（渲染差异），但必须三引擎各自在册可回读，且不能三份完全相同（相同＝捕获器没真换引擎）
        const shots = [c, f, w].map((x) => x.shotOnDisk);
        if (new Set(shots).size === 1) fail.push(`${id} 三引擎截图逐字节相同 ⇒ 可疑（捕获可能未换引擎）`);
    }
    table[id] = row;
}
const out = {
    ok: fail.length === 0,
    failCount: fail.length,
    fail,
    expectIds: EXPECT_IDS,
    coverage: Object.fromEntries(Object.entries(engines).map(([e, v]) => [e, { ids: v.byId.size, sources: v.files.map((f) => `${f.path} (${f.browser}, runPass ${f.runPass}/${f.runTotal}, ${f.bytes}B ${f.sha16}) ⇒ readFrom ${f.readFrom}`) }])),
    perEngineTotals: Object.fromEntries(Object.entries(engines).map(([e, v]) => [e, v.files.reduce((a, f) => ({ verified: a.verified + (f.apiProofTotals ? f.apiProofTotals.verified : 0), attested: a.attested + (f.apiProofTotals ? f.apiProofTotals.attested : 0), unproven: a.unproven + (f.apiProofTotals ? f.apiProofTotals.unproven : 0) }), { verified: 0, attested: 0, unproven: 0 })])),
    identicalShotIds: canonicalIds.filter((id) => { const r = table[id]; return r.chromium && r.firefox && r.webkit && r.chromium.shotOnDisk === r.firefox.shotOnDisk && r.firefox.shotOnDisk === r.webkit.shotOnDisk; }),
    table,
};
fs.writeFileSync('E:/AIProMax/cocosair-scratch/v12-logs/r45j-reconcile.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: out.ok, failCount: out.failCount, fail: out.fail.slice(0, 25), coverageIds: Object.fromEntries(Object.entries(engines).map(([e, v]) => [e, v.byId.size])), perEngineTotals: out.perEngineTotals }, null, 2));
process.exit(fail.length ? 1 : 0);
