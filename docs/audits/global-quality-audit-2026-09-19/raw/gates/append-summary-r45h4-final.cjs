'use strict';
// r45h4 收尾：verification-summary.md 文末纯追加 §10 的终读补记（⑤b）。
const fs = require('fs');
const crypto = require('crypto');
const FILE = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const LOCK_BYTES = 194699;
const LOCK_SHA16 = 'ec8ded0ffe5a4992';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(FILE);
if (before.length !== LOCK_BYTES || sha16(before) !== LOCK_SHA16) {
    throw new Error(`ASSERT 锁：现读 ${before.length} / ${sha16(before)} != ${LOCK_BYTES} / ${LOCK_SHA16}`);
}
const t = before.toString('utf8');
const ADD = `\n**⑤b 终读补记（03:39Z，即 §10 落盘与 \`docs/v12-upstream-regression.md\` ④b 口径订正之后）**：\`verify:doc-refs\` **EXIT=0**（\`refsChecked 1079\`，比 ⑤ 段的 1078 多 1 条＝新增引用的 \`tools/examples/spec-compliance-audit.cjs\` 解析成功；\`unresolvedCount 0\` / 棘轮 31 条全命中）；\`verify:consumer\` **EXIT=1**、\`failures\` 仍只有 F-85 一条、\`exportCount 574\`；tarball 10,347,496 → 10,352,297 → **10,352,450 B**。**两次上涨都只由 \`docs/*.md\` 的文字改动造成**（⑤ 段里那个 10,352,297 是同轮中间快照，别当终值——这正是 §10 ④b 说的「引用型计数只作快照」在本轮自己身上又应验一次）。新门禁终读与首跑逐字一致（\`raw/gates/r45h4-chain-face-run.log\`），三产物哈希见 ⑤，本轮零改产物。\n`;
if (t.includes('⑤b 终读补记')) throw new Error('ASSERT 防重复追加');
const after = t + ADD;
if (after.slice(0, t.length) !== t) throw new Error('ASSERT 纯追加：前缀不等');
if (Buffer.byteLength(after, 'utf8') !== before.length + Buffer.byteLength(ADD, 'utf8')) throw new Error('ASSERT 字节账');
fs.writeFileSync(FILE, Buffer.from(after, 'utf8'));
const disk = fs.readFileSync(FILE);
if (disk.length !== Buffer.byteLength(after, 'utf8') || sha16(disk) !== sha16(Buffer.from(after, 'utf8'))) throw new Error('ASSERT 落盘回读不一致');
console.log(JSON.stringify({ before: { bytes: before.length, sha16: sha16(before) }, after: { bytes: disk.length, sha16: sha16(disk), lines: disk.toString('utf8').split('\n').length }, added: Buffer.byteLength(ADD, 'utf8') }, null, 2));
