'use strict';
// r45i-2 尾注：memory 落档（陷阱 36 子句 + 新陷阱 41）+ 归档计数；纯尾部追加
const fs = require('fs');
const crypto = require('crypto');
const PATH = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const EXPECT = { bytes: 209856, sha16: '26e160528daaf03d' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const b = fs.readFileSync(PATH);
if (b.length !== EXPECT.bytes || sha16(b) !== EXPECT.sha16) throw new Error(`前像锁不符：${b.length} ${sha16(b)}`);
const text = b.toString('utf8');
if (!text.endsWith('\n')) throw new Error('尾部非换行');
if (text.includes('r45i-2 尾注')) throw new Error('尾注已存在');
const lastH = text.lastIndexOf('\n## ');
if (!text.slice(lastH).includes('Addendum r45i-pilot11')) throw new Error('r45i addendum 非末节');

const ADD = `
**r45i-2 尾注（04:49Z，本 addendum 的最后一条，之后本轮不再追加）**

6. **memory 落档（跨会话载体，4 次写全部带前像锁 + 循环外计划计数）**：\`reference-v11-verification-gates.md\` 51,767 \`02700cfba9fd7d7f\` → 53,054 \`5204e9323db43684\`（陷阱 40 全文 + 计数）→ 53,813 \`cf07ee43c34177e0\`（陷阱 36 第⑨点补「写后判据假红」子句）→ 54,907 \`dc55cee6bfa0e589\`（**新陷阱 41** ＋ 摘要行同步）；\`MEMORY.md\` 5,593 → 6,411 → 6,559 \`7aabb1136fd028a4\`；\`reference-global-quality-audit-2026-09-19.md\` 48,378 → 52,043；\`project-v12-regression-state.md\` 10,890 → 11,893。三次写全部先跑禁写 dry-run 或带锁，锚点命中逐处报告（本轮 5/5 命中、计划计数取循环外常量 5）。
7. **陷阱 41（本轮定性为通用条目）**：历轮只往证据列 \`UPDATE-…\` 追加 ⇒ §1 判定格里被作废的「verified（当期全绿）」裸奔了十几轮，门禁不红、grep 不红、只有人读矩阵时才中招。收口动作＝**作废措辞必须回到它所在的判定单元就地订正**（原话加引号保留 + 注明作废）、**全文复扫同措辞**、**改发布面后重跑两条门禁**。
8. **归档计数让给现读**：\`docs/audits/global-quality-audit-2026-09-19/raw/gates\` 本条写盘时为 152 件（含 r45i 两份追加脚本、只读判据、memory 落档脚本、重跑抛错日志、r45i-2 三份脚本 + 四份门禁日志）；此后仍以 \`ls … | wc -l\` 现读为准，本条不写终值。**本轮全程零 stage / 零 commit / 零 push。**
`;

const after = Buffer.from(text + ADD, 'utf8');
fs.writeFileSync(PATH, after);
const chk = fs.readFileSync(PATH);
const s = chk.toString('utf8');
const res = {
    ok: s.startsWith(text) && chk.length === b.length + Buffer.byteLength(ADD, 'utf8') && sha16(chk.subarray(0, b.length)) === EXPECT.sha16,
    before: EXPECT, after: { bytes: chk.length, sha16: sha16(chk) },
    delta: chk.length - b.length, expectedDelta: Buffer.byteLength(ADD, 'utf8'), lines: s.split('\n').length,
};
console.log(JSON.stringify(res, null, 2));
if (!res.ok) throw new Error('纯追加不变量不成立');
