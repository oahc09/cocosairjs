'use strict';
// r45h4 收尾：把最后 6 件产物与终读补进本轮自己写的 r45h4 行（同轮自写行，就地扩充，不动历史行）。
const fs = require('fs');
const crypto = require('crypto');
const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/evidence-index.json';
const LOCK_BYTES = 68930;
const LOCK_SHA16 = '0b028d6ccb5145d1';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(FILE);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) {
    throw new Error(`ASSERT 锁：现读 ${before.length} / ${sha16(before)} != ${LOCK_BYTES} / ${LOCK_SHA16}`);
}
const t = before.toString('utf8');
if (JSON.stringify(JSON.parse(t), null, 2) + '\n' !== t) throw new Error('ASSERT 伪追加：原文件不是规范重序列化');
const j = JSON.parse(t);
if (j.evidence.length !== 80) throw new Error(`ASSERT 行数：${j.evidence.length} != 80`);
const othersBefore = JSON.stringify(j.evidence.slice(0, 79));
const orig = j.evidence[79];
if (orig.id !== 'V12-V11-CHAIN-FACE-GATE-R45H4') throw new Error(`ASSERT 末行不是 r45h4 行：${orig.id}`);

const row = JSON.parse(JSON.stringify(orig));
const ADDED_RAW = [
    'raw/gates/append-evidence-index-r45h4.cjs',
    'raw/gates/fix-evidence-index-r45h4b.cjs',
    'raw/gates/append-summary-r45h4.cjs',
    'raw/gates/append-summary-r45h4-final.cjs',
    'raw/gates/r45h4-docrefs-final.log',
    'raw/gates/r45h4-consumer-final.log',
];
for (const p of ADDED_RAW) {
    if (row.raw.includes(p)) throw new Error(`ASSERT 防重复：${p} 已在册`);
    row.raw.push(p);
}
if (row.raw.length !== 11) throw new Error(`ASSERT raw 计数：${row.raw.length} != 11`);
row.bytesAndHashes_r45h4.rawGatesDirFiles = '104 -> 115（+11：门禁负控/落表/台账脚本与各轮次日志，全部逐字复制）';
row.bytesAndHashes_r45h4.ledgerChain = 'evidence-index.json 63,117 7d2cc1f7a44d1b80 -> 68,528 6e8f5ab96a621c3e（追加本行）-> 68,930 0b028d6ccb5145d1（④b 口径订正）-> 本行扩充后的终值由脚本 stdout 给出；verification-summary.md 187,750 5d4e890eaba8c515 -> 194,699 ec8ded0ffe5a4992（§10）-> 195,527 50dbf2a98968d308（⑤b 终读补记）';
const ADDED_CMDS = [
    {
        cmd: 'node docs/audits/global-quality-audit-2026-09-19/raw/gates/append-evidence-index-r45h4.cjs',
        exit: 0,
        shows: '首跑 EXIT=1 于「新元素缩进」断言（成员应 6 空格，初版按 +4/+2 混算）⇒ 抛出点在写盘前 = 真零写盘（锁 sha 复读未变）。改整行统一 +4 后 EXIT=0：79 -> 80 行、+5,411 B、既有 79 行逐条 JSON.stringify 等值、结果 == 规范重序列化',
    },
    {
        cmd: 'npm run verify:doc-refs（台账写入与 §7.13 口径订正之后，raw/gates/r45h4-docrefs-final.log）',
        exit: 0,
        shows: '{"ok":true,"docs":118,"refsChecked":1079,"unresolvedCount":0,"staleBaselineCount":0,"skippedCounts":{"glob":54,"external":0,"outOfRepo":0}} —— 1078 -> 1079 的 +1 是新引用的 tools/examples/spec-compliance-audit.cjs 解析成功',
    },
    {
        cmd: 'npm run verify:consumer（同上终读，raw/gates/r45h4-consumer-final.log）',
        exit: 1,
        shows: 'failures 恰 1 条 = F-85、exportCount 574、published-artifacts 4 markers x 2 bundles 0 fail、tarball 10,352,297 -> 10,352,450 B ⇒ 本轮第二次 tarball 位移只由 docs/*.md 文字造成；tarball 数按快照引用，不作货币',
    },
];
row.commands.push(...ADDED_CMDS);
if (row.commands.length !== 9) throw new Error(`ASSERT commands 计数：${row.commands.length} != 9`);

const back = JSON.parse(JSON.stringify(row));
for (const p of ADDED_RAW) back.raw.pop();
back.commands.splice(-ADDED_CMDS.length, ADDED_CMDS.length);
back.bytesAndHashes_r45h4.rawGatesDirFiles = orig.bytesAndHashes_r45h4.rawGatesDirFiles;
back.bytesAndHashes_r45h4.ledgerChain = orig.bytesAndHashes_r45h4.ledgerChain;
if (JSON.stringify(back) !== JSON.stringify(orig)) throw new Error('ASSERT 可逆：剥掉本轮新增后 != 原行（本次扩充不是纯新增字段/元素）');

const j2 = JSON.parse(t);
j2.evidence[79] = row;
if (JSON.stringify(j2.evidence.slice(0, 79)) !== othersBefore) throw new Error('ASSERT 历史行被连带改动');
const after = JSON.stringify(j2, null, 2) + '\n';
if (JSON.stringify(JSON.parse(after), null, 2) + '\n' !== after) throw new Error('ASSERT 结果非规范重序列化');
if (Buffer.byteLength(after, 'utf8') <= before.length) throw new Error('ASSERT 字节账：扩充后应变大');

fs.writeFileSync(FILE, Buffer.from(after, 'utf8'));
const disk = fs.readFileSync(FILE);
if (disk.length !== Buffer.byteLength(after, 'utf8') || sha16(disk) !== sha16(Buffer.from(after, 'utf8'))) throw new Error('ASSERT 落盘回读不一致');
console.log(JSON.stringify({ before: { bytes: before.length, sha16: sha16(before) }, after: { bytes: disk.length, sha16: sha16(disk), rows: JSON.parse(disk.toString('utf8')).evidence.length }, addedBytes: disk.length - before.length, rawCount: row.raw.length, cmdCount: row.commands.length }, null, 2));
