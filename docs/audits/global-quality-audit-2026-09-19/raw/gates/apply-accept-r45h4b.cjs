'use strict';
// r45h4b：单独落地 apply-accept-r45h4.cjs 静默漏掉的第 4 处插入（§2.1 尾部 bullet）。
// 判据与上一轮的区别：本次插入条数由「字面量常量」钉死，字节账与还原都由独立表达式复核，
// 不再让「求和所用的数组」与「被校验的循环」共用同一个来源。
const fs = require('fs');
const crypto = require('crypto');

const FILE = 'E:/AIProMax/github/cocosair.js/docs/acceptance-report-v12.md';
const LOCK_BYTES = 123231;
const LOCK_SHA16 = '32ad69c1af9e21c3';
const EXPECTED_PLAN_COUNT = 1;

const before = fs.readFileSync(FILE);
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) {
    throw new Error(`ASSERT 锁：现读 ${before.length} / ${sha16(before)} != ${LOCK_BYTES} / ${LOCK_SHA16}`);
}
const t = before.toString('utf8');

const LINE_PREFIX = '- 现算锚点（同一轮）：dev bundle `6,081,668 B / 35496aebda066ab5`';
const BULLET = '\n- 本轮（r45h4）另新增第 17 条护栏 `npm run verify:v11-chain-face`（V1.1 证据链完整性，只读、V1–V7、十臂负控 `10 / 10`、首跑 `EXIT=0`）⇒ 上面「13 行实测 / 3 处未测」是 **r45h 那 16 行**的口径，新行属 r45h4，其当期读数记在 §2 行 17 与 `docs/v12-upstream-regression.md` §7.13；§2.1 的格数不因此回溯改写。';

// 锚点：整行原文（先定位再取行尾），必须唯一命中
const idx = t.indexOf(LINE_PREFIX);
if (idx < 0) throw new Error('ASSERT 锚点行前缀命中：实际 0');
if (t.slice(idx + 1).includes(LINE_PREFIX)) throw new Error('ASSERT 锚点行前缀唯一命中：实际 >1');
const eol = t.indexOf('\n', idx);
if (eol < 0) throw new Error('ASSERT 锚点行无行尾');
const anchorLine = t.slice(idx, eol);

if (t.includes(BULLET)) throw new Error('ASSERT 防重复追加：bullet 已在文');

const after = t.slice(0, eol) + BULLET + t.slice(eol);
const inserted = [BULLET];
if (inserted.length !== EXPECTED_PLAN_COUNT) throw new Error(`ASSERT 计划条数：${inserted.length} != ${EXPECTED_PLAN_COUNT}`);

const afterBuf = Buffer.from(after, 'utf8');
const sumBytes = inserted.reduce((a, s) => a + Buffer.byteLength(s, 'utf8'), 0);
if (afterBuf.length !== before.length + sumBytes) {
    throw new Error(`ASSERT 字节账（UTF-8）：${afterBuf.length} != ${before.length} + ${sumBytes}`);
}
let recon = after;
for (const s of inserted) {
    if (recon.split(s).length - 1 !== 1) throw new Error('ASSERT 还原：插入文本不唯一');
    recon = recon.replace(s, () => '');
}
if (recon !== t) throw new Error('ASSERT 还原：删除插入文本后 != 原文（本次不是纯追加）');

fs.writeFileSync(FILE, afterBuf, 'utf8');
const disk = fs.readFileSync(FILE);
if (disk.length !== afterBuf.length || sha16(disk) !== sha16(afterBuf)) throw new Error('ASSERT 落盘回读不一致');
console.log(JSON.stringify({
    before: { bytes: before.length, sha16: sha16(before) },
    after: { bytes: disk.length, sha16: sha16(disk) },
    insertedBytes: sumBytes,
    planCount: inserted.length,
    lines: `${t.split('\n').length} -> ${disk.toString('utf8').split('\n').length}`,
    anchorLine: anchorLine.slice(0, 40),
}, null, 2));
