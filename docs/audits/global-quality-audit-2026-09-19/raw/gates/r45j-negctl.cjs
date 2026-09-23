'use strict';
/**
 * r45j 判据负向控制（陷阱 40：注入必须自证生效，判据必须命中"预期的那一层"，不能只看 EXIT≠0）。
 * 键命名空间与被读侧一致＝仓库相对路径（R45J_FILES 的键 == judge 里 SOURCES/DIAG 的路径串）。
 * 每臂：把被改的那份源复制到仓库外 scratch → 组 R45J_FILES（其余源仍指仓库原件）→ 跑判据 → 读判据机读输出，
 *      断言 (a) 期望 marker 出现在 hard/stale 里，(b) 非期望层没有连带翻红（除显式允许的补充项）。
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const SCRATCH = 'E:/AIProMax/cocosair-scratch/r45j-negctl';
const JUDGE = 'E:/AIProMax/cocosair-scratch/db-probe/r45j-reconcile-k.cjs';
const REPO = 'E:/AIProMax/github/cocosair.js/';
const OUT = path.join(SCRATCH, 'judge-out.json');
fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const ALLSRC = [
    'docs/evidence/v11-examples-verified.json',
    'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json',
    'docs/evidence/v12/pilot12-r45i/v11-pilot12-webkit.json',
    'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json',
    'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkB.json',
    'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-mesh-torus.json',
    'docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkA.json',
    'docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkB.json',
    'docs/evidence/v12/v11chain-r45j/v11-chain-webkit-mesh-torus.json',
    'docs/evidence/v12/v11chain-r45j/diag-audio-basic-wk-d1.json',
    'docs/evidence/v12/v11chain-r45j/diag-audio-basic-wk-d2.json',
    'docs/evidence/v12/v11chain-r45j/diag-audio-basic-wk-d3.json',
    'docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-d1.json',
    'docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-d2.json',
    'docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-d3.json',
    'docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-1.json',
    'docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-2.json',
];
/** 惰性物化：在臂内才写盘，且每臂独立子目录，避免共用源的多臂互相覆盖（注入层串味）。 */
const tamper = (rel, mutate) => ({ rel, mutate });
const plain = (rel) => ({ [rel]: REPO + rel });
const NC_SRC = 'examples/mesh-sphere/example.json';

/** 通用取记录 */
const rec = (j, id) => {
    const r = j.results.find((x) => x.id === id);
    if (!r) throw new Error('record ' + id + ' not found');
    return r;
};

const ARMS = [
    { name: 'P 阳性对照（全部未改副本）', tamper: [], markers: [], wantExit: 0 },
    {
        name: 'N1 篡改一条 PASS 记录的截图字节数',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json', (j) => { const r = rec(j, 'anim-position'); r.artifact.bytes += 1; })],
        markers: ['PASS 格产物失真'], wantExit: 1,
    },
    {
        name: 'N2 把一条非白格 firefox 记录改成 FAIL',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json', (j) => { const r = rec(j, 'anim-position'); r.result = 'FAIL'; r.errors = ['boom']; })],
        markers: ['firefox/anim-position result=FAIL'], wantExit: 1,
    },
    {
        name: 'N3 删掉一条记录（漏例必须翻红，不得静默缩分母）',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkA.json', (j) => { j.results = j.results.filter((x) => x.id !== 'anim-rotation'); })],
        markers: ['webkit id count 51 != 52', 'webkit MISSING ids: anim-rotation'], wantExit: 1,
    },
    {
        name: 'N4 清空一份源的 results（反空转）',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkB.json', (j) => { j.results = []; })],
        markers: ['firefox id count', 'firefox MISSING ids'], wantExit: 1,
    },
    {
        name: 'N5 白格意外翻绿 ⇒ 归因过期必须红',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkB.json', (j) => { const r = rec(j, 'video-basic'); r.result = 'PASS'; r.errors = []; r.apiProof.forEach((a) => { if (a.api === 'VideoPlayer.resume') { a.proof = 'verified'; a.state = 'executed'; a.calls = 1; } }); })],
        markers: ['webkit/video-basic 意外翻绿'], wantExit: 1,
    },
    {
        name: 'N6 白格 unproven 集合漂移（归因只认在册那一组 API）',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkB.json', (j) => { const r = rec(j, 'video-basic'); const hit = r.apiProof.find((a) => a.api === 'VideoPlayer.pause'); hit.proof = 'unproven'; hit.state = 'not-observed'; hit.calls = 0; })],
        markers: ['unproven 集合不符'], wantExit: 1,
    },
    {
        name: 'N7 未在册的跨引擎字段漂移',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkA.json', (j) => { rec(j, 'anim-position').expectationGaps = { tampered: true }; })],
        markers: ['anim-position cross-engine gaps differs'], wantExit: 1,
    },
    {
        name: 'N8 白格活体前提撤销（工作树 NC 已不在）⇒ 归因过期必须红',
        tamper: [],
        nc: () => {
            const file = path.join(SCRATCH, 'mesh-sphere-no-nc.json');
            fs.writeFileSync(file, fs.readFileSync(REPO + NC_SRC, 'utf8').replace(/"not-a-real-validator"/g, '"removed-for-negctl"'));
            return file.replace(/\\/g, '/');
        },
        markers: ['活体前提不成立'], wantExit: 1,
        guard: (j) => j.hardCount === 0 && j.staleCount >= 2,
    },
    {
        name: 'N9 FAIL 格产物失真但 attempts 不是 2 ⇒ F-133 模型必须拒收',
        tamper: [tamper('docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkA.json', (j) => { rec(j, 'audio-basic').attempts = 1; })],
        markers: ['F-133 模型要求 2'], wantExit: 1,
    },
];

const results = [];
for (const [index, arm] of ARMS.entries()) {
    const dir = path.join(SCRATCH, `arm${index}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const inject = {};
    for (const t of arm.tamper) {
        if (!ALLSRC.includes(t.rel)) throw new Error(`arm ${index} tampers an unregistered source: ${t.rel}`);
        const j = JSON.parse(fs.readFileSync(REPO + t.rel, 'utf8'));
        t.mutate(j);
        const file = path.join(dir, t.rel.replace(/[\\/]/g, '_'));
        fs.writeFileSync(file, JSON.stringify(j));
        inject[t.rel] = file.replace(/\\/g, '/');
    }
    // 自证前置：注入后与仓库原件必须真的不同（否则"命中"可能是判据自己漂了）
    for (const [rel, file] of Object.entries(inject)) {
        if (fs.readFileSync(file, 'utf8') === fs.readFileSync(REPO + rel, 'utf8')) throw new Error(`arm ${index} injection is a no-op: ${rel}`);
    }
    const nc = typeof arm.nc === 'function' ? arm.nc() : arm.nc;
    const env = { ...process.env, R45J_FILES: JSON.stringify(inject), R45J_OUT: OUT };
    if (nc) env.R45J_LIVE_MESHSPHERE = nc;
    const r = cp.spawnSync(process.execPath, [JUDGE], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const j = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const blob = j.hard.join('\n') + '\n' + j.stale.join('\n');
    const missed = arm.markers.filter((m) => !blob.includes(m));
    const injectedKeys = Object.keys(inject);
    // 陷阱 40：注入臂必须自证"判据读到的就是我改的那一层"——判据输出的 readFrom 里必须出现注入文件
    const readFromList = [...Object.values(j.sources).flat(), ...Object.values(j.diagSeen || {}).flat().map((d) => d.readFrom), j.judgeInject.ncFile].map(String);
    const selfProof = nc ? readFromList.some((s) => s.includes(nc))
        : injectedKeys.length === 0 ? j.judgeInject.r45jFilesArms.length === 0
            : injectedKeys.every((k) => readFromList.some((s) => s.includes(inject[k])));
    const extraOk = arm.guard ? arm.guard(j) : true;
    const ok = r.status === arm.wantExit && missed.length === 0 && (arm.wantExit === 0 ? j.hardCount === 0 && j.staleCount === 0 : j.hardCount + j.staleCount > 0) && selfProof && extraOk;
    results.push({ arm: arm.name, exit: r.status, wantExit: arm.wantExit, hard: j.hardCount, stale: j.staleCount, missedMarkers: missed, injected: injectedKeys.length, selfProofOk: selfProof, guardOk: extraOk, ok });
    console.log(`${ok ? 'OK  ' : 'BAD '} ${arm.name}  EXIT=${r.status} hard=${j.hardCount} stale=${j.staleCount} missed=${JSON.stringify(missed)}`);
    if (!ok) console.log('     hard⇒ ' + j.hard.join(' ;; ').slice(0, 400) + '\n     stale⇒ ' + j.stale.join(' ;; ').slice(0, 200) + '\n     readFrom⇒ ' + JSON.stringify(Object.values(j.sources).flat().filter((s) => s.includes('negctl')).slice(0, 2)) + ' judgeInject=' + JSON.stringify(j.judgeInject));
}
const pass = results.filter((x) => x.ok).length;
console.log(JSON.stringify({ passCount: pass, arms: results.length, allOk: pass === results.length }, null, 2));
fs.writeFileSync(path.join(SCRATCH, 'negctl-summary.json'), JSON.stringify(results, null, 2));
process.exit(pass === results.length ? 0 : 1);
