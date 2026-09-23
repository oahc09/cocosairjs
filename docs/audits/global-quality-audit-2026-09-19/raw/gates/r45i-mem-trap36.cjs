'use strict';
// r45i：向 memory 陷阱 36 追加「写后判据假红诱导重跑」子句（锚点式，写前抛；不改陷阱计数）
const fs = require('fs');
const crypto = require('crypto');
const P = 'C:/Users/caosh/.qoder/projects/E--AIProMax-github-cocosair-js/memory/reference-v11-verification-gates.md';
const EXPECT = { bytes: 53054, sha16: '5204e9323db43684' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
if (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16) {
    throw new Error(`前像锁不符：actual ${before.length} ${sha16(before)}，expected ${EXPECT.bytes} ${EXPECT.sha16}`);
}
let t = before.toString('utf8');

const ANCHOR = '`acc` 按字符长度少算 1,572 B）。';
const HITS = t.split(ANCHOR).length - 1;
if (HITS !== 1) throw new Error(`锚点命中 ${HITS} 次（须恰 1）`);
if (t.includes('同族复发（r45i，新形态）')) throw new Error('子句已存在');

const ADD = '**同族复发（r45i，形态不同＝写后判据）**：判据把 `Buffer.length`（字节）与字符串 `.length`（UTF-16 单元）相减 ⇒ 中文文档 133,402 B vs 90,268 字符，**写盘已成功却判红**（throw-after-write）。真危险不是判红，而是它诱导「重跑一次」——在有副作用的路径上重跑＝重复追加。三条：① 判据两侧必须同为字节；② 追加一律带**前像锁**，重跑在写盘前抛（实测 `RETRY_EXIT=1` 且文件逐字节未动）⇒ **幂等由锁保证，不由判据保证**；③ 判据与写盘分离成只读脚本，写盘脚本的退出码才只反映「追加是否成立」。通则：**假红判据比缺判据更危险**，因为它把操作者推向下一次写。';

t = t.replace(ANCHOR, ANCHOR + ADD);
const after = Buffer.from(t, 'utf8');
fs.writeFileSync(P, after);

const s = fs.readFileSync(P, 'utf8');
const res = {
    ok: s.includes(ADD) && Buffer.byteLength(s, 'utf8') === before.length + Buffer.byteLength(ADD, 'utf8'),
    anchorHits: HITS,
    before: { bytes: before.length, sha16: EXPECT.sha16 },
    after: { bytes: Buffer.byteLength(s, 'utf8'), sha16: sha16(s) },
    delta: Buffer.byteLength(s, 'utf8') - before.length,
    expectedDelta: Buffer.byteLength(ADD, 'utf8'),
    trapCountLine: (s.match(/四十个取证陷阱|三十九个取证陷阱/) || ['<none>'])[0],
};
console.log(JSON.stringify(res, null, 2));
if (!res.ok) throw new Error('替换后账不平');
