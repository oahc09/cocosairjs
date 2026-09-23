'use strict';
// r45h4：向证据台账 evidence-index.json 纯追加一行（V1.1 链完整性门禁）。
// 判据（沿用 §7.12/r45h3 的三段全等 + 伪追加守卫），并加两条本轮新增的独立判据：
//   (1) 计划条数由循环外字面量常量断言（r45h4b 教训：共用来源的字节账查不出漏项）
//   (2) 追加前逐条比对既有 79 行的 JSON 序列化，等值才允许写
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/evidence-index.json';
const LOCK_BYTES = 63117;
const LOCK_SHA16 = '7d2cc1f7a44d1b80';
const EXPECTED_ROWS_BEFORE = 79;
const EXPECTED_PLAN_COUNT = 1;
const ANCHOR = '\n  ],\n  "rowShapesNote"';

const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const before = fs.readFileSync(FILE);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) {
    throw new Error(`ASSERT 锁：现读 ${before.length} / ${sha16(before)} != ${LOCK_BYTES} / ${LOCK_SHA16}`);
}
const t = before.toString('utf8');
if (t.split(ANCHOR).length - 1 !== 1) throw new Error('ASSERT 锚点唯一命中失败');

const parsed = JSON.parse(t);
if (parsed.evidence.length !== EXPECTED_ROWS_BEFORE) throw new Error(`ASSERT 既有行数：${parsed.evidence.length} != ${EXPECTED_ROWS_BEFORE}`);
const beforeSerialized = parsed.evidence.map((r) => JSON.stringify(r));

const anchorIdx = t.indexOf(ANCHOR);
if (anchorIdx < 0) throw new Error('ASSERT 锚点找不到');
const cut = anchorIdx - 1;
if (t[cut] !== '}') throw new Error(`ASSERT 切点前一行末应为末元素收尾的 }，实际 ${JSON.stringify(t[cut])}`);
const head = t.slice(0, cut + 1);
const tail = t.slice(cut + 1);
if (!tail.startsWith(ANCHOR)) throw new Error(`ASSERT 切点对账：tail 不以锚点开头（实际 ${JSON.stringify(tail.slice(0, 24))}）`);
if (head.length + tail.length !== t.length) throw new Error('ASSERT 头尾拼接不等于原文');

const ROW = {
    id: 'V12-V11-CHAIN-FACE-GATE-R45H4',
    findings: ['F-82', 'F-132'],
    createdBy: 'r45h4-v11-chain-face-gate',
    status: 'SHIPPED（未提交：本会话零 stage / 零 commit / 零 push）',
    raw: [
        'raw/gates/r45h4-chain-negctl.cjs',
        'raw/gates/r45h4-chain-negctl.log',
        'raw/gates/r45h4-chain-face-run.log',
        'raw/gates/apply-accept-r45h4.cjs',
        'raw/gates/apply-accept-r45h4b.cjs',
    ],
    bytesAndHashes_r45h4: {
        'tools/v12/verify-v11-chain-face.cjs': '8795 B d405520568b21224（仓库内新门禁）',
        'raw/gates/r45h4-chain-negctl.cjs': '4835 B',
        'raw/gates/r45h4-chain-negctl.log': '7583 B',
        'raw/gates/r45h4-chain-face-run.log': '170 B',
        'raw/gates/apply-accept-r45h4.cjs': '6123 B',
        'raw/gates/apply-accept-r45h4b.cjs': '3286 B',
        rawGatesDirFiles: '104 -> 109（+5，与 raw[] 计数一致）',
        reportChain: 'docs/acceptance-report-v12.md 120607 110ad66928bc2b89 -> 123231 32ad69c1af9e21c3 -> 123613 84674600b552777e（305 -> 307 行，四处纯插入：前三处 2624 B、漏落的第四处 382 B 由 r45h4b 单条脚本补齐，两跑还原校验均通过）',
        notesChain: 'docs/v12-upstream-regression.md §7.13 现读 122938 B 7aafdd2b712e9d1c（含 r45h4b 自我更正段）',
        canonicalEvidenceUntouched: [
            'docs/evidence/v12/browser-matrix.json 2134220 1a18400038575e46',
            'docs/evidence/v11-examples-verified.json 631722 49c81e5a1e4054e9',
            'build/cocosair.module.js 6081668 35496aebda066ab5 / build/cocosair.module.min.js 3499182 8795c8685ace28a1 / build/cocosair.module.d.ts 3082360 6d01c030d85bf86c（三产物逐字节未变 ⇒ 本轮零改 src、零改产物兑现）',
        ],
    },
    commands: [
        {
            cmd: 'node tools/v12/verify-v11-chain-face.cjs',
            exit: 0,
            shows: '{"ok":true,"records":52,"runPass":"52/52","fps":"9fa85f88b968d5f1","apiProof":"verified:1004 attested:129 unproven:0","live":"9fa85f88b968d5f1==evidence","errorCount":0} —— 首跑与报告落表后复跑读数逐字一致；live 段只信息打印、不参与退出码（边界：不逼重采）',
        },
        {
            cmd: 'node E:/AIProMax/cocosair-scratch/db-probe/r45h4-chain-negctl.cjs',
            exit: 0,
            shows: 'passCount 10 / total 10：P 仓库外原样副本 EXIT=0；N1..N9 各 EXIT=1 且只报自己那一层（V1..V7）；N4 清空 results 并同步归零 apiProofTotals ⇒ 只剩反空转守卫可红。首轮曾 9/10（N4 同响 V2+V5），改的是臂不是门禁',
        },
        {
            cmd: 'node E:/AIProMax/cocosair-scratch/db-probe/apply-accept-r45h4.cjs',
            exit: 0,
            shows: 'EXIT=0 但 stdout 的 edits 只有 3 项 != 计划 4 项 ⇒ §2.1 尾部 bullet 静默漏落（EDITS.pop() 后未放回被迭代数组；锚点断言/字节账/还原校验与执行循环同源，恒等式查不出漏项）。发现即停：grep -c 复测该 bullet = 0 命中',
        },
        {
            cmd: 'node E:/AIProMax/cocosair-scratch/db-probe/apply-accept-r45h4b.cjs',
            exit: 0,
            shows: '单条更正脚本，计划条数由循环外常量 EXPECTED_PLAN_COUNT=1 断言、锁 123231 32ad69c1af9e21c3、Buffer.byteLength 字节账 382 B、删除还原 == 原文 ⇒ 报告 123613 84674600b552777e（306 -> 307 行）',
        },
        {
            cmd: 'npm run verify:doc-refs（§7.13 + 报告改后现读）',
            exit: 0,
            shows: '{"ok":true,"docs":118,"refsChecked":1078,"skippedCounts":{"glob":54,"external":0,"outOfRepo":0},"baseline":{"entries":31,"hits":31},"unresolvedCount":0,"staleBaselineCount":0} ⇒ 新门禁路径 tools/v12/verify-v11-chain-face.cjs 的文档引用被解析成功，零断链',
        },
        {
            cmd: 'npm run verify:consumer（发布面文档改后现读）',
            exit: 1,
            shows: 'failures 恰 1 条 = F-85（README links to missing packaged file: docs/manual/index.md）、exportCount 574、tarball 10347496 -> 10352297 B（docs/*.md 在 files[] ⇒ 每次文档改动都要重跑）；未新增失败',
        },
    ],
    result: '把「V1.1 证据链被 42 篇文档引用却零门禁」变成第 17 条只读护栏：V1–V7 七条内部自洽不变量 + 十臂负控 10/10，落点 package.json + tools/v12/verify-v11-chain-face.cjs + docs/v12-upstream-regression.md §7.13 + 报告 §2 行 17。**刻意不含**「证据 == 当期产物」的绑定（那会把 52 例 × 三引擎 ≈1.9 h 重采变成每次改 src 的既成事实，属 owner 决策面 #15/#21/F-132(c)）⇒ F-82 类「绑定当期交付物」缺口在 V1.1 链侧仍未闭合，本行不主张闭合。LV12-20 维持 PARTIAL；唯一红护栏仍是 verify:api-coverage（#18）。',
    note: '方法学收获（写进 §7.13 的自我更正段）：批量落表的「独立性」必须来自判据与执行路径不同源——计划条数要用循环外常量钉死，否则「插入后字节 == 插入前 + sum(实际插入)」对漏项零判别力。这是 §7.12 第 2 条「锚点不存在会静默空转」的同族变体：这次锚点断言跑过了，漏在数据流（元素被 pop 出迭代数组）。',
};

const newElem = JSON.stringify(ROW, null, 2).split('\n').map((l) => '    ' + l).join('\n');
const after = head + ',\n' + newElem + tail;
if (!newElem.startsWith('    {') || !newElem.includes('\n      "id"')) throw new Error('ASSERT 新元素缩进不符文件风格（元素 4 空格、成员 6 空格）');

const insertedText = ',\n' + newElem;
const toInsert = [ROW];
if (toInsert.length !== EXPECTED_PLAN_COUNT) throw new Error(`ASSERT 计划条数：实际 ${toInsert.length} != 常量 ${EXPECTED_PLAN_COUNT}`);
if (Buffer.byteLength(after, 'utf8') !== before.length + Buffer.byteLength(insertedText, 'utf8')) {
    throw new Error(`ASSERT 字节账（UTF-8）：${Buffer.byteLength(after, 'utf8')} != ${before.length} + ${Buffer.byteLength(insertedText, 'utf8')}`);
}
if (!after.startsWith(head)) throw new Error('ASSERT 三段全等：head');
if (!after.endsWith(tail)) throw new Error('ASSERT 三段全等：tail');

const reparsed = JSON.parse(after);
if (reparsed.evidence.length !== EXPECTED_ROWS_BEFORE + 1) throw new Error(`ASSERT 行数：${reparsed.evidence.length}`);
for (let i = 0; i < EXPECTED_ROWS_BEFORE; i++) {
    if (JSON.stringify(reparsed.evidence[i]) !== beforeSerialized[i]) throw new Error(`ASSERT 既有行 ${i} 被改动`);
}
if (JSON.stringify(reparsed, null, 2) + '\n' !== after) throw new Error('ASSERT 伪追加：结果不是规范的整文件重序列化');

fs.writeFileSync(FILE, Buffer.from(after, 'utf8'));
const disk = fs.readFileSync(FILE);
const expectedBytes = Buffer.byteLength(after, 'utf8');
if (disk.length !== expectedBytes || sha16(disk) !== sha16(Buffer.from(after, 'utf8'))) throw new Error(`ASSERT 落盘回读不一致：${disk.length} != ${expectedBytes}`);
console.log(JSON.stringify({
    before: { bytes: before.length, sha16: sha16(before), rows: EXPECTED_ROWS_BEFORE },
    after: { bytes: disk.length, sha16: sha16(disk), rows: reparsed.evidence.length },
    insertedBytes: Buffer.byteLength(insertedText, 'utf8'),
    newRowId: ROW.id,
}, null, 2));
