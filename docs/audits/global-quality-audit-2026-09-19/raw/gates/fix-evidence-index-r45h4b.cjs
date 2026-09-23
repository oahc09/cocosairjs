'use strict';
// r45h4b（同轮就地更正）：evidence-index.json 的 r45h4 行里「42 篇」是我本轮写进行数时的错误口径。
// 判据：唯一命中 + 反向替换可还原 + 其余 79 行逐条 JSON 等值 + 文件仍可解析 + 行数 80 不变。
const fs = require('fs');
const crypto = require('crypto');
const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/evidence-index.json';
const LOCK_BYTES = 68528;
const LOCK_SHA16 = '6e8f5ab96a621c3e';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(FILE);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) {
    throw new Error(`ASSERT 锁：现读 ${before.length} / ${sha16(before)} != ${LOCK_BYTES} / ${LOCK_SHA16}`);
}
const t = before.toString('utf8');
const j = JSON.parse(t);
if (j.evidence.length !== 80) throw new Error(`ASSERT 行数：${j.evidence.length} != 80`);
const others = j.evidence.slice(0, 79).map((r) => JSON.stringify(r));

const PAIRS = [
    ['V1.1 证据链被 42 篇文档引用却零门禁', 'V1.1 证据链发布面 11 篇 / 25 处引用（r45h4 03:36Z 快照口径，含台账则 43 篇 / 102 处）却 test/ 下 0 断言'],
    ['这是 §7.12 第 2 条「锚点不存在会静默空转」的同族变体：这次锚点断言跑过了，漏在数据流（元素被 pop 出迭代数组）。',
     '这是 §7.12 第 2 条「锚点不存在会静默空转」的同族变体：这次锚点断言跑过了，漏在数据流（元素被 pop 出迭代数组）。同轮第二处更正：本行 result 初写的「42 篇引用」是无口径快照数字（现读 11 篇/25 处发布面、43 篇/102 处含台账），已按 r45h4b 就地订正并在 §7.13 补上可复算命令——引用数会因描述它这句话而涨，故只作快照不作货币（§7.12 第 3 条同族）。'],
];
let after = t;
let acc = 0;
for (const [from, to] of PAIRS) {
    const hits = after.split(from).length - 1;
    if (hits !== 1) throw new Error(`ASSERT 唯一命中：${JSON.stringify(from.slice(0, 20))} 实际 ${hits}`);
    acc += Buffer.byteLength(to, 'utf8') - Buffer.byteLength(from, 'utf8');
    after = after.replace(from, () => to);
}
const afterBuf = Buffer.from(after, 'utf8');
if (afterBuf.length !== before.length + acc) throw new Error(`ASSERT 字节账：${afterBuf.length} != ${before.length} + ${acc}`);
let recon = after;
for (const [from, to] of PAIRS.slice().reverse()) {
    if (recon.split(to).length - 1 !== 1) throw new Error('ASSERT 还原：替换文本不唯一');
    recon = recon.replace(to, () => from);
}
if (recon !== t) throw new Error('ASSERT 还原：反向替换 != 原文（本次不是可逆更正）');

const j2 = JSON.parse(after);
if (j2.evidence.length !== 80) throw new Error('ASSERT 更正后行数变化');
for (let i = 0; i < 79; i++) {
    if (JSON.stringify(j2.evidence[i]) !== others[i]) throw new Error(`ASSERT 其余行 ${i} 被连带改动`);
}
if (JSON.stringify(j2, null, 2) + '\n' !== after) throw new Error('ASSERT 结果不是规范的整文件重序列化');

fs.writeFileSync(FILE, afterBuf);
const disk = fs.readFileSync(FILE);
if (disk.length !== afterBuf.length || sha16(disk) !== sha16(afterBuf)) throw new Error('ASSERT 落盘回读不一致');
console.log(JSON.stringify({ before: { bytes: before.length, sha16: sha16(before) }, after: { bytes: disk.length, sha16: sha16(disk) }, deltaBytes: acc, pairs: PAIRS.length }, null, 2));
