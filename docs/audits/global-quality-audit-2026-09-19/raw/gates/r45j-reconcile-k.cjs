'use strict';
/**
 * r45j-k 对账判据 v2：52 例 × {chromium 正典, firefox, webkit}。
 * 与 v1 的差别 = 引入**显式归因模型**，让判据双向反空转：
 *   · 白格（已归因的已知红）必须红、且只红在册的信号；意外翻绿 ⇒ STALE-ATTRIBUTION 翻红。
 *   · 黑格（未归因）任何一条红都是硬失败。
 *   · 产物失真只在「FAIL + attempts=2」格容忍（在册 F-133 模型），PASS 格零容忍。
 *   · 归因里的活体前提（工作树 NC、诊断复跑样本）每次现读，不成立即翻红。
 * 读入键＝仓库相对路径（陷阱 40：注入键与读取键同命名空间）；R45J_FILES 仅供负向对照。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const override = process.env.R45J_FILES ? JSON.parse(process.env.R45J_FILES) : {};
const readJson = (p) => {
    const abs = override[p] || REPO + p;
    return { j: JSON.parse(fs.readFileSync(abs, 'utf8')), abs };
};
const EXPECT_FP = '9fa85f88b968d5f1';
const EXPECT_IDS = 52;
const D = 'docs/evidence/v12/v11chain-r45j/';

const SOURCES = {
    chromium: ['docs/evidence/v11-examples-verified.json'],
    firefox: [
        'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json',
        D + 'v11-chain-firefox-chunkA.json',
        D + 'v11-chain-firefox-chunkB.json',
        D + 'v11-chain-firefox-mesh-torus.json',
    ],
    webkit: [
        'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json',
        D + 'v11-chain-webkit-chunkA.json',
        D + 'v11-chain-webkit-chunkB.json',
        D + 'v11-chain-webkit-mesh-torus.json',
    ],
};

/** 诊断复跑样本（结构性 vs 时序性判定的机读依据）；mode 必须与实测计数一致，否则翻红。 */
const DIAG = {
    'webkit/audio-basic': ['diag-audio-basic-wk-d1.json', 'diag-audio-basic-wk-d2.json', 'diag-audio-basic-wk-d3.json']
        .map((f) => D + f),
    'webkit/video-basic': ['diag-video-basic-wk-d1.json', 'diag-video-basic-wk-d2.json', 'diag-video-basic-wk-d3.json']
        .map((f) => D + f)
        .concat([D + 'diag-video-basic-wk-1.json', D + 'diag-video-basic-wk-2.json']),
};

/** 归因白名单：cell → 该格允许的唯一失败形态。 */
const ATTRIB = {
    'firefox/mesh-sphere': {
        why: '并行会话在工作树 examples/mesh-sphere/example.json 注入的假 validator（F-132 写盘语义的连带），非引擎差异',
        errors: ['not-a-real-validator'],
        unproven: null,
        crossDiff: ['specFp', 'srcFp'],
        liveCheck: 'nc-in-worktree',
    },
    'webkit/mesh-sphere': {
        why: '同 firefox/mesh-sphere：工作树并行 NC，非引擎差异',
        errors: ['not-a-real-validator'],
        unproven: null,
        crossDiff: ['specFp', 'srcFp'],
        liveCheck: 'nc-in-worktree',
    },
    'webkit/audio-basic': {
        why: '在册 F-100 在 V1.1 规格驱动链上的跨链显现：webkit 音频 DOM 分支（AudioPlayerDOM）拿不到 PCM ⇒ AudioPCMDataView/getData/playOneShot 恒不执行；3 次复跑 3/3 同签名 FAIL（STRUCTURAL），排除释放竞态',
        errors: ['resource-released', 'api-executed'],
        unproven: ['AudioPCMDataView', 'AudioPCMDataView.getData', 'AudioSource.playOneShot'],
        crossDiff: ['verified', 'attested', 'instr'],
        liveCheck: 'diag',
        mode: 'STRUCTURAL',
    },
    'webkit/video-basic': {
        why: 'F-135：webkit P3 播控段间歇抛断（5 次复跑 2 PASS/3 FAIL，签名恒定），非 F-100/F-103/F-107 在案形态',
        errors: ['resource-released', 'api-executed'],
        unproven: ['VideoPlayer.resume'],
        crossDiff: ['verified', 'instr'],
        liveCheck: 'diag',
        mode: 'INTERMITTENT',
    },
};

const hard = [];
const diagSeen = {};
const attributed = [];
const stale = [];
const notes = [];

const NC_FILE = process.env.R45J_LIVE_MESHSPHERE || 'examples/mesh-sphere/example.json';
const ncPresent = () => {
    const abs = path.isAbsolute(NC_FILE) ? NC_FILE : REPO + NC_FILE;
    return { hit: fs.readFileSync(abs, 'utf8').includes('not-a-real-validator'), readFrom: abs };
};

const diagResults = (cell) => {
    const list = [];
    for (const p of DIAG[cell]) {
        if (!fs.existsSync(REPO + p)) { hard.push(`${cell} 诊断样本缺失 ${p}`); continue; }
        const { j, abs } = readJson(p);
        if (j.browser !== cell.split('/')[0]) { hard.push(`${cell} 诊断样本 ${p} browser=${j.browser} 与归因引擎不符`); }
        if ((j.results || []).length !== 1) { hard.push(`${cell} 诊断样本 ${p} 记录数 ${(j.results || []).length} != 1`); continue; }
        list.push({ path: p, readFrom: abs, result: j.results[0].result, id: j.results[0].id });
        if (j.results[0].id !== cell.split('/')[1]) { hard.push(`${cell} 诊断样本 ${p} id=${j.results[0].id} 与归因例不符`); }
    }
    return list;
};

const engines = {};
for (const [eng, paths] of Object.entries(SOURCES)) {
    const byId = new Map();
    const files = [];
    for (const p of paths) {
        const { j, abs } = readJson(p);
        const buf = fs.readFileSync(abs);
        files.push({ path: p, readFrom: abs, bytes: buf.length, sha16: sha16(buf), browser: j.browser || 'chromium', measuredAt: j.measuredAt, runPass: j.runPass, runTotal: j.runTotal, subsetLen: Array.isArray(j.subset) ? j.subset.length : null, candidateFingerprint: j.candidateFingerprint, recordCount: (j.results || []).length });
        if (p.startsWith(D) && j.browser !== eng) { hard.push(`${eng} 源文件 ${p} browser=${j.browser} 与引擎不符`); }
        for (const r of j.results || []) {
            if (byId.has(r.id)) { hard.push(`${eng}/${r.id} DUPLICATE across sources`); continue; }
            byId.set(r.id, { r, src: p });
        }
    }
    engines[eng] = { byId, files };
    const ids = [...byId.keys()].sort();
    if (ids.length !== EXPECT_IDS) { hard.push(`${eng} id count ${ids.length} != ${EXPECT_IDS}（反空转/反漏项）`); }
}
const canonicalIds = readJson(SOURCES.chromium[0]).j.results.map((r) => r.id).sort();
for (const eng of Object.keys(engines)) {
    const ids = [...engines[eng].byId.keys()];
    const missing = canonicalIds.filter((i) => !ids.includes(i));
    const extra = ids.filter((i) => !canonicalIds.includes(i));
    if (missing.length) hard.push(`${eng} MISSING ids: ${missing.join(',')}`);
    if (extra.length) hard.push(`${eng} EXTRA ids: ${extra.join(',')}`);
}

const proof = (r) => {
    const t = { verified: 0, attested: 0, unproven: 0, other: 0, unprovenApis: [] };
    for (const a of r.apiProof || []) {
        if (a.proof in t) t[a.proof]++; else t.other++;
        if (a.proof === 'unproven') t.unprovenApis.push(a.api);
    }
    return t;
};

const table = {};
for (const id of canonicalIds) {
    const row = {};
    for (const eng of Object.keys(engines)) {
        const hit = engines[eng].byId.get(id);
        if (!hit) { row[eng] = null; continue; }
        const r = hit.r;
        const cell = `${eng}/${id}`;
        const a = ATTRIB[cell] || null;
        const s = proof(r);
        const p = [];
        if (r.candidateFingerprint !== EXPECT_FP) p.push(`candidateFingerprint=${r.candidateFingerprint} != 当期 ${EXPECT_FP}`);
        if (s.other !== 0) p.push(`otherProof=${s.other}`);
        if (!a) {
            if (eng !== 'chromium' && r.result !== 'PASS') p.push(`result=${r.result}（来源 ${hit.src}）`);
            if (eng !== 'chromium' && r.errors && r.errors.length) p.push(`errors=${JSON.stringify(r.errors)}`);
            if (s.unproven !== 0) p.push(`unproven=${s.unproven}:${s.unprovenApis.join(',')}`);
        } else {
            // 白格：必须红，且失败形态必须逐条命中在册信号
            if (r.result === 'PASS') stale.push(`${cell} 意外翻绿 ⇒ 归因已过期（${a.why}）`);
            const errs = r.errors || [];
            if (errs.length === 0) p.push(`白格无 errors 可比对`);
            for (const e of errs) if (!a.errors.some((sig) => e.includes(sig))) p.push(`errors 未在册: ${e}`);
            for (const sig of a.errors) if (!errs.some((e) => e.includes(sig))) p.push(`在册信号缺失: ${sig}（现读 errors=${JSON.stringify(errs)}）`);
            if (a.unproven) {
                const got = s.unprovenApis.slice().sort().join(',');
                const want = a.unproven.slice().sort().join(',');
                if (got !== want) p.push(`unproven 集合不符 got=${got || '∅'} want=${want}`);
            } else if (s.unproven !== 0) p.push(`在册 unproven=null 但实测 ${s.unproven}:${s.unprovenApis.join(',')}`);
            if (a.liveCheck === 'nc-in-worktree') {
                const nc = ncPresent();
                if (!nc.hit) stale.push(`${cell} 活体前提不成立：${nc.readFrom} 已无 not-a-real-validator ⇒ 归因过期`);
                else notes.push(`${cell} 活体前提现读命中（${nc.readFrom}）`);
            } else if (a.liveCheck === 'diag') {
                const dr = diagResults(cell);
                diagSeen[cell] = dr;
                const pass = dr.filter((x) => x.result === 'PASS').length;
                const fail = dr.length - pass;
                const mixed = pass > 0 && fail > 0;
                if (a.mode === 'INTERMITTENT' && !mixed) stale.push(`${cell} mode=INTERMITTENT 但诊断样本 ${pass}PASS/${fail}FAIL`);
                if (a.mode === 'STRUCTURAL' && fail !== dr.length) stale.push(`${cell} mode=STRUCTURAL 但诊断样本 ${pass}PASS/${fail}FAIL`);
                notes.push(`${cell} 诊断复跑 ${dr.length} 次 ⇒ ${pass} PASS / ${fail} FAIL（mode=${a.mode}）`);
            }
        }
        const art = r.artifact || {};
        let onDisk = 'none';
        if (!art.path) {
            p.push('has no artifact.path');
        } else if (!fs.existsSync(REPO + art.path)) {
            p.push(`artifact missing ${art.path}`);
        } else {
            const b = fs.readFileSync(REPO + art.path);
            onDisk = `${b.length}/${sha16(b)}`;
            const desync = b.length !== art.bytes || sha16(b) !== art.hash;
            if (desync) {
                if (r.result === 'PASS') p.push(`PASS 格产物失真 ${b.length}/${sha16(b)} != ${art.bytes}/${art.hash}`);
                else if (r.attempts !== 2) p.push(`FAIL 格产物失真但 attempts=${r.attempts}（F-133 模型要求 2）`);
                else {
                    attributed.push(`${cell} 产物失真（盘 ${b.length}B vs 记录 ${art.bytes}B）＝F-133 重试覆写，非本轮捕获缺陷`);
                    if (!(b.length > 512 && b[0] === 0x89 && b[1] === 0x50)) p.push(`${cell} 盘上 PNG 非法（${b.length}B）`);
                }
            }
        }
        if (p.length) hard.push(`${cell} ${p.join(' ; ')}`);  // 白格只豁免在册那一形态；其余一律硬失败（陷阱 41：判定列不裸奔）
        row[eng] = { src: hit.src, result: r.result, attempts: r.attempts || 1, specFp: r.specFingerprint, srcFp: r.sourceFingerprint, candFp: r.candidateFingerprint, verified: s.verified, attested: s.attested, unproven: s.unproven, units: (r.apiProof || []).length, gaps: JSON.stringify(r.expectationGaps), instr: JSON.stringify(r.instrumentation), shot: art.path, shotOnDisk: onDisk };
    }
    const c = row.chromium, f = row.firefox, w = row.webkit;
    if (c && f && w) {
        const allow = new Set([].concat(
            (ATTRIB['firefox/' + id] || {}).crossDiff || [],
            (ATTRIB['webkit/' + id] || {}).crossDiff || []));
        const used = new Set();
        for (const k of ['specFp', 'srcFp', 'candFp', 'verified', 'attested', 'units', 'gaps', 'instr']) {
            const same = c[k] === f[k] && f[k] === w[k];
            if (same) { if (allow.has(k)) { const staleCell = Object.keys(ATTRIB).find((cl) => cl.endsWith('/' + id) && (ATTRIB[cl].crossDiff || []).includes(k)); if (staleCell) stale.push(`${staleCell} 在册 crossDiff=${k} 但该键三引擎已相同 ⇒ 归因过期`); } continue; }
            if (allow.has(k)) { used.add(k); continue; }
            hard.push(`${id} cross-engine ${k} differs: cc=${String(c[k]).slice(0, 90)} ff=${String(f[k]).slice(0, 90)} wk=${String(w[k]).slice(0, 90)}`);
        }
        const shots = [c, f, w].map((x) => x.shotOnDisk);
        if (new Set(shots).size === 1) hard.push(`${id} 三引擎截图逐字节相同 ⇒ 可疑（捕获可能未换引擎）`);
    }
    table[id] = row;
}

const totals = {};
for (const [eng, v] of Object.entries(engines)) {
    totals[eng] = [...v.byId.values()].reduce((a, { r }) => {
        const s = proof(r);
        return { verified: a.verified + s.verified, attested: a.attested + s.attested, unproven: a.unproven + s.unproven, pass: a.pass + (r.result === 'PASS' ? 1 : 0), fail: a.fail + (r.result === 'FAIL' ? 1 : 0) };
    }, { verified: 0, attested: 0, unproven: 0, pass: 0, fail: 0 });
}
const threeEnginePass = canonicalIds.filter((id) => {
    const r = table[id];
    return r.chromium && r.firefox && r.webkit && ['chromium', 'firefox', 'webkit'].every((e) => r[e].result === 'PASS');
}).length;

const out = {
    ok: hard.length === 0,
    hardCount: hard.length,
    hard,
    staleCount: stale.length,
    stale,
    attributedCount: attributed.length,
    attributed,
    notes,
    expectIds: EXPECT_IDS,
    judgeInject: { r45jFilesArms: Object.keys(override), ncFile: NC_FILE },
    diagSeen,
    threeEnginePass,
    totals,
    cells: Object.fromEntries(Object.entries(ATTRIB).map(([k, v]) => [k, { why: v.why, mode: v.mode || null, errors: v.errors, unproven: v.unproven || null, crossDiff: v.crossDiff || [], result: (() => { const e = k.split('/'); const hit = engines[e[0]].byId.get(e[1]); return hit ? hit.r.result : 'MISSING'; })() }])),
    sources: Object.fromEntries(Object.entries(engines).map(([e, v]) => [e, v.files.map((f) => `${f.path} (${f.browser}, ${f.bytes}B ${f.sha16}, ${f.recordCount} 条) ⇒ ${f.readFrom}`)])),
    table,
};
const OUT_PATH = process.env.R45J_OUT || 'E:/AIProMax/cocosair-scratch/v12-logs/r45j-reconcile-k.json';
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: out.ok, hardCount: out.hardCount, hard: out.hard.slice(0, 20), staleCount: out.staleCount, stale: out.stale, attributedCount: out.attributedCount, notes: out.notes, threeEnginePass: out.threeEnginePass, totals: out.totals, cells: out.cells }, null, 2));
process.exit(hard.length || stale.length ? 1 : 0);
