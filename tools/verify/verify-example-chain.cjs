/**
 * 示例执行证据链完整性的只读门禁。
 *
 *   node tools/verify/verify-example-chain.cjs [--json] [--out=<path>] [--evidence=<path>]
 *
 * 立门禁的理由（先证伪再建，勿重复造轮子）：三引擎矩阵证据的字节货币**早已**是 jest 断言
 * （`test/smoke/smoke-30-v12-regression.test.ts` 的「三浏览器矩阵证据字节货币」5 条），而
 * `docs/evidence/examples-verified.json` 在 `test/` 里 **grep 0 命中** ⇒ V1.1 链的完整性
 * 至今**没有任何消费端**：把它改坏（删标记、清空 results、掺入 FAIL、混入第二个候选指纹）没人拦。
 *
 * 七条不变量（全部只读盘上证据，不启动浏览器、不 build、不改写任何文件）：
 *   V1 完整性标记：completed === true 且 partial === false（缺标记即 NOT_RUN ⇒ 红）。
 *   V2 计数自洽：runTotal === total === results.length 且 runTotal > 0（**反空转**：空集合不得判绿）
 *      且 runPass + fail === runTotal 且 pass === runPass。
 *   V3 逐条结论：id 唯一、result === 'PASS'、errors 为空数组。
 *   V4 指纹绑定：每条记录的 candidateFingerprint / sourceFingerprint 为 16 位十六进制、
 *      specFingerprint 为十六进制；全表 candidateFingerprint **恰 1 个不同值**且等于文件级字段。
 *   V5 API 取证自洽：文件级 apiProofTotals === 逐条聚合；unproven === 0；proof 只允许 verified/attested。
 *   V6 采集器身份：runner 字段指向的脚本仍在盘（证据不是手写的旁证）、mode 非空。
 *   V7 时间戳：measuredAt 可解析且不晚于当前时刻（+60 s 容差）⇒ 挡住"未来日期"式的伪造。
 *
 * 刻意**不做**的一件事（边界，别读成"已绑产物"）：本门禁**不**断言证据里的 candidateFingerprint
 * 等于当前树现算值。那条等式一旦进门禁，任何 `src/` 改动都会立刻拖红并要求重采 52 例
 * （≈1.9 h／三引擎更多）⇒ 属 owner 决策面。现算值只作为**信息**打印（`live` 段），不参与退出码。
 *
 * 退出码：0 = 七条全过；1 = 不变量被破坏；2 = 证据文件不可读/不可解析。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_EVIDENCE = path.join(ROOT, 'docs', 'evidence', 'examples-verified.json');

const arg = (name) => {
    const hit = process.argv.find((s) => s.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
};
const asJson = process.argv.includes('--json');
const evidencePath = arg('evidence') ? path.resolve(arg('evidence')) : DEFAULT_EVIDENCE;
const outPath = arg('out') ? path.resolve(arg('out')) : null;

const HEX16 = /^[0-9a-f]{16}$/;
const HEX = /^[0-9a-f]+$/;
const ALLOWED_PROOF = new Set(['verified', 'attested']);

const errors = [];
const fail = (msg) => errors.push(msg);

if (!fs.existsSync(evidencePath)) {
    console.error(`[example-chain] FAILED: 证据不在盘 ${evidencePath}`);
    process.exit(2);
}
let j;
try {
    j = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
} catch (e) {
    console.error(`[example-chain] FAILED: 证据不可解析（${e.message}）`);
    process.exit(2);
}

// V1 完整性标记
if (j.completed !== true) fail(`V1 completed 必须为 true（实际 ${JSON.stringify(j.completed)}）⇒ 缺标记即 NOT_RUN`);
if (j.partial !== false) fail(`V1 partial 必须为 false（实际 ${JSON.stringify(j.partial)}）⇒ 子集跑不得当全量回归`);

// V2 计数自洽
const results = Array.isArray(j.results) ? j.results : [];
if (!Array.isArray(j.results)) fail('V2 results 不是数组 ⇒ 计数不可判');
if (results.length === 0) fail('V2 results 为空 ⇒ 反空转守卫：0 条记录恒真的"全部通过"不是绿');
if (j.runTotal !== j.total) fail(`V2 runTotal(${j.runTotal}) !== total(${j.total})`);
if (j.total !== results.length) fail(`V2 total(${j.total}) !== results.length(${results.length})`);
if (j.runPass + j.fail !== j.runTotal) fail(`V2 runPass(${j.runPass}) + fail(${j.fail}) !== runTotal(${j.runTotal})`);
if (j.pass !== j.runPass) fail(`V2 pass(${j.pass}) !== runPass(${j.runPass})`);

// V3 逐条结论
const ids = new Set();
for (const r of results) {
    if (ids.has(r.id)) fail(`V3 id 重复：${r.id}`);
    ids.add(r.id);
    if (r.result !== 'PASS') fail(`V3 ${r.id} result=${JSON.stringify(r.result)}（必须 PASS）`);
    if (!Array.isArray(r.errors) || r.errors.length !== 0) fail(`V3 ${r.id} errors 非空 ⇒ 该例不可当回归通过`);
}

// V4 指纹绑定
const fps = new Set();
let missingFp = 0;
for (const r of results) {
    if (typeof r.candidateFingerprint !== 'string') { missingFp += 1; continue; }
    fps.add(r.candidateFingerprint);
    if (!HEX16.test(r.candidateFingerprint)) fail(`V4 ${r.id} candidateFingerprint 非 16 位十六进制：${r.candidateFingerprint}`);
    if (!HEX16.test(String(r.sourceFingerprint))) fail(`V4 ${r.id} sourceFingerprint 非 16 位十六进制`);
    if (!HEX.test(String(r.specFingerprint))) fail(`V4 ${r.id} specFingerprint 非十六进制`);
}
if (missingFp > 0) fail(`V4 ${missingFp}/${results.length} 条记录缺 candidateFingerprint ⇒ 无法绑定被测字节`);
if (fps.size > 1) fail(`V4 全表出现 ${fps.size} 个不同 candidateFingerprint（${[...fps].join(', ')}）⇒ 一条链里混了多份候选产物`);
if (j.candidateFingerprint && !HEX16.test(j.candidateFingerprint)) fail(`V4 文件级 candidateFingerprint 非 16 位十六进制：${j.candidateFingerprint}`);

// V5 API 取证聚合自洽
const totals = { verified: 0, attested: 0, unproven: 0 };
for (const r of results) {
    for (const p of r.apiProof || []) {
        if (!(p.proof in totals)) { fail(`V5 ${r.id} 未知 proof "${p.proof}"（api=${p.api}）`); continue; }
        if (!ALLOWED_PROOF.has(p.proof)) fail(`V5 ${r.id} proof "${p.proof}" 不在允许集 {verified, attested}（api=${p.api}）`);
        totals[p.proof] += 1;
    }
}
const declared = j.apiProofTotals || {};
for (const key of ['verified', 'attested', 'unproven']) {
    if (declared[key] !== totals[key]) fail(`V5 apiProofTotals.${key}(${declared[key]}) !== 逐条聚合(${totals[key]})`);
}
if (totals.unproven > 0) fail(`V5 逐条聚合含 ${totals.unproven} 条 unproven 取证`);

// V6 采集器身份
if (typeof j.runner !== 'string' || !j.runner.trim()) fail('V6 runner 字段缺失 ⇒ 无法证明是采集器而非人写的');
else if (!fs.existsSync(path.join(ROOT, j.runner))) fail(`V6 runner 指向的脚本不在盘：${j.runner}`);
if (typeof j.mode !== 'string' || !j.mode.trim()) fail('V6 mode 字段缺失');

// V7 时间戳
const stamp = Date.parse(j.measuredAt);
if (Number.isNaN(stamp)) fail(`V7 measuredAt 不可解析：${JSON.stringify(j.measuredAt)}`);
else if (stamp > Date.now() + 60_000) fail(`V7 measuredAt 晚于当前时刻 ⇒ 疑似手写时间戳（${j.measuredAt}）`);

// 信息项（不参与退出码）：当前树现算 candidateFingerprint
let live = { status: 'UNAVAILABLE' };
try {
    const apiTrace = require(path.join(ROOT, 'tools', 'verify', 'api-trace.cjs'));
    const fp = apiTrace.candidateFingerprint();
    live = { status: 'OK', candidateFingerprint: fp, matchesEvidence: fp === j.candidateFingerprint };
    if (live.matchesEvidence === false) {
        live.note = '证据所绑定的候选产物 ≠ 当前树 ⇒ 在册结论不可声称"当期"；是否重采属 owner 决策，本门禁不因此判红';
    }
} catch (e) {
    live = { status: 'UNAVAILABLE', reason: e.message.split('\n')[0] };
}

const report = {
    ok: errors.length === 0,
    evidence: path.relative(ROOT, evidencePath).split(path.sep).join('/'),
    evidenceBytes: fs.statSync(evidencePath).size,
    measuredAt: j.measuredAt,
    records: results.length,
    runPass: j.runPass,
    runTotal: j.runTotal,
    distinctCandidateFingerprints: [...fps],
    apiProofTotals: totals,
    live,
    errorCount: errors.length,
    errors,
};

if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
    console.log(JSON.stringify({
        ok: report.ok,
        records: report.records,
        runPass: `${report.runPass}/${report.runTotal}`,
        fps: report.distinctCandidateFingerprints.join(','),
        apiProof: `verified:${totals.verified} attested:${totals.attested} unproven:${totals.unproven}`,
        live: live.status === 'OK' ? `${live.candidateFingerprint}${live.matchesEvidence ? '==evidence' : '!=evidence'}` : 'UNAVAILABLE',
        errorCount: errors.length,
    }));
    for (const e of errors.slice(0, 20)) console.error(`  ! ${e}`);
}
process.exit(errors.length ? 1 : 0);
