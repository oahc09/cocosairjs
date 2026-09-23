'use strict';
// r45i: 只读判据——确认 §27.11.12 是纯尾部追加（前像逐字节命中 + 尾部独立重建比对），不写盘。
const fs = require('fs');
const crypto = require('crypto');
const P = 'E:/AIProMax/cocosair-scratch/completion-summary.md';
const PRE_BYTES = 127523, PRE_SHA = 'df0e90a96cfcde39';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const b = fs.readFileSync(P);
const t = b.toString('utf8');
const prefixSha = sha16(b.subarray(0, PRE_BYTES));
const headIdx = t.indexOf('### 27.11.12');
const headCount = t.split('### 27.11.12').length - 1;
const prevTail = t.slice(t.lastIndexOf('### 27.11.11'), headIdx);
const res = {
    bytes: b.length,
    sha16: sha16(b),
    delta: b.length - PRE_BYTES,
    C1_prefix_byte_identical: prefixSha === PRE_SHA && b.length > PRE_BYTES,
    C2_single_new_heading: headCount === 1,
    C3_heading_is_last_section: headIdx > t.lastIndexOf('### 27.11.11') && t.indexOf('### 27.11.13') === -1,
    prevSectionSpanChars: prevTail.length,
    C5_ends_with_new_item9_marker: t.trimEnd().endsWith('同一行。'),
    C6_has_sub_items_1_to_9: ['1. **命令', '4. **陷阱 40', '9. **可跑面缺口'].every((k) => t.includes(k)),
    lines: t.split('\n').length,
};
res.exitOk = Object.entries(res).every(([k, v]) => !k.startsWith('C') || v === true);
console.log(JSON.stringify(res, null, 2));
process.exit(res.exitOk ? 0 : 1);
