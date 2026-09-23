'use strict';
// r45i-2：把验收报告 §1 的 LV12-20 判定格由「verified（当期全绿）」就地改为 PARTIAL（右侧 UPDATE 已宣告原话作废）
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const P = REPO + 'docs/acceptance-report-v12.md';
const EXPECT = { bytes: 129400, sha16: 'dc6700e30b2fe866' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
if (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16) {
    throw new Error(`前像锁不符：actual ${before.length} ${sha16(before)}，expected ${EXPECT.bytes} ${EXPECT.sha16}`);
}
let t = before.toString('utf8');

const ANCHOR = '| LV12-20 | 回归护栏 | **verified**（当期全绿） | — |';
const HITS = t.split(ANCHOR).length - 1;
if (HITS !== 1) throw new Error(`锚点命中 ${HITS} 次（须恰 1）`);

const REPL = '| LV12-20 | 回归护栏 | **PARTIAL**（r45i-2 就地订正：本格原写「**verified**（当期全绿）」＝**假话**，右列 UPDATE-r45g-ledger 已宣告其作废；当期读法 16 绿 / 1 红，唯一红项＝`verify:api-coverage`（#18）） | — |';

t = t.replace(ANCHOR, REPL);
const after = Buffer.from(t, 'utf8');
fs.writeFileSync(P, after);

const check = fs.readFileSync(P, 'utf8');
const res = {
    ok: !check.includes(ANCHOR) && check.includes(REPL)
        && Buffer.byteLength(check, 'utf8') === before.length + Buffer.byteLength(REPL, 'utf8') - Buffer.byteLength(ANCHOR, 'utf8'),
    anchorHits: HITS,
    before: { bytes: before.length, sha16: EXPECT.sha16 },
    after: { bytes: Buffer.byteLength(check, 'utf8'), sha16: sha16(check) },
    delta: Buffer.byteLength(check, 'utf8') - before.length,
    expectedDelta: Buffer.byteLength(REPL, 'utf8') - Buffer.byteLength(ANCHOR, 'utf8'),
    // 只应改这一处：其余判定格的原话必须仍在
    stillPresent: ['| LV12-01 | G0 基线对齐 | **verified**', '| LV12-19 |', '| LV12-21 |'].map((k) => check.includes(k)),
    lines: check.split('\n').length,
};
console.log(JSON.stringify(res, null, 2));
if (!res.ok) throw new Error('替换后账不平');
