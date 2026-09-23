'use strict';
// r45i-2b：§4 护栏 bullet 追加 UPDATE（§2 现为十七条；「16 绿」的合成口径；§1 判定格已就地订正）
const fs = require('fs');
const crypto = require('crypto');
const P = 'E:/AIProMax/github/cocosair.js/docs/acceptance-report-v12.md';
const EXPECT = { bytes: 129595, sha16: '173dd7494ba50ebd' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
if (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16) {
    throw new Error(`前像锁不符：actual ${before.length} ${sha16(before)}，expected ${EXPECT.bytes} ${EXPECT.sha16}`);
}
let t = before.toString('utf8');
const ANCHOR = '护栏整体判定随 LV12-20 现判 **PARTIAL**。';
const HITS = t.split(ANCHOR).length - 1;
if (HITS !== 1) throw new Error(`锚点命中 ${HITS} 次（须恰 1）`);
if (t.includes('UPDATE-r45i2')) throw new Error('UPDATE-r45i2 已存在');
const ADD = '**UPDATE-r45i2（04:46Z，就地订正 §1 判定格 + 本段口径）**：① §1 的 LV12-20「代码回归」格原写「**verified**（当期全绿）」，与本 bullet 尾句自相矛盾（只扫表的人会读到假话）⇒ 已就地改为 **PARTIAL**，原话以引号保留在该格内并注明作废；② §2 护栏自 r45h4 起为 **十七条**（本段前文「现有 16 行」是 r45g-api 时点），当期读法 **16 绿 / 1 红**（红项仍只有第 10 条 `verify:api-coverage`＝owner #18），且「16 绿」＝ r45h 01:44–02:05Z 全量复跑 + r45h4 抽测 4 条的**合成口径**，不是本轮全量现读；③ 本轮 r45i/r45i-2 未复跑整表，只现读发布面两条（`verify:doc-refs` `EXIT=0` / `verify:consumer` `EXIT=1` 且 `failures` 恰 1 条＝ F-85）。';
t = t.replace(ANCHOR, ANCHOR + ADD);
const after = Buffer.from(t, 'utf8');
fs.writeFileSync(P, after);

const check = fs.readFileSync(P, 'utf8');
const res = {
    ok: check.includes(ADD) && Buffer.byteLength(check, 'utf8') === before.length + Buffer.byteLength(ADD, 'utf8'),
    anchorHits: HITS,
    before: { bytes: before.length, sha16: EXPECT.sha16 },
    after: { bytes: Buffer.byteLength(check, 'utf8'), sha16: sha16(check) },
    delta: Buffer.byteLength(check, 'utf8') - before.length,
    expectedDelta: Buffer.byteLength(ADD, 'utf8'),
    lines: check.split('\n').length,
};
console.log(JSON.stringify(res, null, 2));
if (!res.ok) throw new Error('替换后账不平');
