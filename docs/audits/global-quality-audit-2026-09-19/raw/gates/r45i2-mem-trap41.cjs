'use strict';
// r45i-2 memory：新增陷阱 41（追加式更正只落证据列 ⇒ 判定列裸奔）+ 两处计数与索引同步
const fs = require('fs');
const crypto = require('crypto');
const M = 'C:/Users/caosh/.qoder/projects/E--AIProMax-github-cocosair-js/memory/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const FILES = {
    gates: { p: M + 'reference-v11-verification-gates.md', bytes: 53813, sha16: 'cf07ee43c34177e0' },
    index: { p: M + 'MEMORY.md', bytes: 6411, sha16: '0aab246699d40874' },
};

const TRAP41 = '\n41. **追加式记账会让「判定列」留下已作废的假话（r45i-2，实测发布面自相矛盾）**：历轮更正一律以 `UPDATE-…` 追加到**证据列/正文尾部**，于是判定格里的原措辞（如 §1 的「**verified**（当期全绿）」）在右列已被宣告作废多轮之后仍然裸奔 —— **只扫矩阵判定列的读者读到的是假话**，而门禁、grep、复读都不会红。三条：① 每次以追加方式作废某措辞后，**必须回到该措辞所在的判定单元就地订正**（保留原话 + 加「＝假话／已作废」注记，不删历史）；② 订正后要**全文复扫同一措辞**（本轮扫 `当期全绿` / `全部 PASS` / 护栏条数）确认其余出处都带作废注解；③ 判定列改动属发布面 ⇒ 重跑受影响门禁（`verify:doc-refs` + `verify:consumer`），并记录哈希链。与 39 同族：39 管"自指行不要写终值"，本条管"被作废的断言不要留在结论位置"。\n';

const plan = [
    { file: 'gates', kind: 'replace', find: '四十个取证陷阱', put: '四十一个取证陷阱', expect: '>=1', note: '计数（frontmatter + 正文摘要行）' },
    { file: 'gates', kind: 'replace', find: '注入式覆盖（env/CLI/副本路径）必须有一臂自证注入生效，否则负控只是给原始数据盖章——见 40 条）', put: '注入式覆盖（env/CLI/副本路径）必须有一臂自证注入生效，否则负控只是给原始数据盖章——见 40 条；追加式更正只落证据列、判定列裸奔＝扫表读者读到已作废假话——见 41 条）', expect: 1 },
    { file: 'gates', kind: 'insertBefore', find: '\n相关：[[project-v11-spec-compliance-gaps]]', put: TRAP41, expect: 1 },
    { file: 'index', kind: 'replace', find: '→四十个取证陷阱', put: '→四十一个取证陷阱', expect: 1 },
    { file: 'index', kind: 'replace', find: '判据取"命中预期那一层"而非 `EXIT≠0`，阳性臂与篡改臂缺一不可）', put: '判据取"命中预期那一层"而非 `EXIT≠0`，阳性臂与篡改臂缺一不可；41＝追加式更正只落证据列、判定列裸奔 ⇒ 作废措辞必须回判定单元就地订正 + 全文复扫 + 重跑发布面门禁）', expect: 1 },
];
const EXPECT_PLAN_COUNT = 5;

const snap = {};
for (const k of Object.keys(FILES)) snap[k] = fs.readFileSync(FILES[k].p).toString('utf8');
for (const f of Object.keys(FILES)) {
    const b = Buffer.from(snap[f], 'utf8');
    if (b.length !== FILES[f].bytes || sha16(b) !== FILES[f].sha16) throw new Error(`${f} 前像锁不符：${b.length} ${sha16(b)}`);
}
if (snap.gates.includes('41. **追加式记账')) throw new Error('陷阱 41 已存在');
if (snap.index.includes('41＝追加式更正')) throw new Error('索引 41 已存在');

const work = { ...snap };
const hits = [];
let appliedCount = 0;
for (const e of plan) {
    const cur = work[e.file];
    const n = cur.split(e.find).length - 1;
    const okHits = typeof e.expect === 'number' ? n === e.expect : n >= parseInt(e.expect.replace('>=', ''), 10);
    if (!okHits) throw new Error(`锚点命中 ${n}（须 ${e.expect}）：${e.file} :: ${e.find.slice(0, 40)}`);
    work[e.file] = e.kind === 'insertBefore' ? cur.replace(e.find, e.put + e.find) : cur.split(e.find).join(e.put);
    hits.push({ file: e.file, hits: n, note: e.note || e.find.slice(0, 28) });
    appliedCount++;
}
if (appliedCount !== EXPECT_PLAN_COUNT) throw new Error(`已应用 ${appliedCount} != 计划 ${EXPECT_PLAN_COUNT}（判据不得与被校验路径同源）`);

const out = {};
for (const k of Object.keys(FILES)) {
    if (work[k] === snap[k]) throw new Error(`${k} 内容未变（静默空转）`);
    const buf = Buffer.from(work[k], 'utf8');
    fs.writeFileSync(FILES[k].p, buf);
    const chk = fs.readFileSync(FILES[k].p);
    out[k] = { before: Buffer.byteLength(snap[k], 'utf8'), after: chk.length, delta: chk.length - Buffer.byteLength(snap[k], 'utf8'), expectedDelta: Buffer.byteLength(work[k], 'utf8') - Buffer.byteLength(snap[k], 'utf8'), sha16: sha16(chk) };
    out[k].byteAccountOk = out[k].delta === out[k].expectedDelta;
}
console.log(JSON.stringify({ applied: appliedCount, plan: EXPECT_PLAN_COUNT, hits, out }, null, 2));
if (!Object.values(out).every((v) => v.byteAccountOk)) throw new Error('字节账不平');
