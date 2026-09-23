'use strict';
// r45i: 向 §27.11.12 追加第 10 条（同轮自我更正：陷阱 36 字节账复发 + 幂等性实证）。纯尾部追加。
const fs = require('fs');
const crypto = require('crypto');
const P = 'E:/AIProMax/cocosair-scratch/completion-summary.md';
const EXPECT_PRE = { bytes: 133402, sha16: '14ce7087d422c01e' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
if (before.length !== EXPECT_PRE.bytes || sha16(before) !== EXPECT_PRE.sha16) {
    throw new Error(`前像锁不符：actual ${before.length} ${sha16(before)}，expected ${EXPECT_PRE.bytes} ${EXPECT_PRE.sha16}`);
}
const text = before.toString('utf8');
if (!text.endsWith('\n')) throw new Error('文件尾不以换行结束');
if (text.includes('10. **同轮自我更正')) throw new Error('第 10 条已存在，拒绝重复追加');

const ADD = `10. **同轮自我更正（陷阱 36 的字节账我又犯了一次，形态不同）**：追加脚本的写后判据写成 \`check.length === text.length + Buffer.byteLength(ADD)\` —— 左边是**字节**，\`text.length\` 是 **UTF-16 code unit 数**，中文文档下必不等 ⇒ 判据假红，而**写盘已经成功**。这是 throw-after-write，与「写前抛」纪律相反：真污染风险是「据此重跑 → 重复追加」。两条处置：① 判据两侧统一为字节（\`check.length === before.length + Buffer.byteLength(ADD)\`），并且**不拿字符串长度参与字节账**；② 追加脚本自带**前像锁**，重跑在写盘之前即抛 \`RETRY_EXIT=1\`（\`E:/AIProMax/cocosair-scratch/v12-logs/r45i-append-retry.out\`），随后现读文件仍为 133,402 \`14ce7087d422c01e\` ⇒ **幂等性由锁保证，不由判据保证**。另立一条只读判据脚本 \`r45i-verify-append.cjs\`（前缀逐字节 sha16 命中 + 新标题恰 1 处 + 是末节 + 末行标记 + 子条 1/4/9 在场，5/5 成立，\`JUDGE_EXIT=0\`）：**判据与写盘分离**，写盘脚本的退出码才只反映"追加是否成立"。通则：**假红判据比缺判据更危险**——它会把操作者推向"重跑一次"，而重跑在有副作用的路径上就是重复写入。

`;

const after = Buffer.from(text + ADD, 'utf8');
fs.writeFileSync(P, after);

const check = fs.readFileSync(P);
const s = check.toString('utf8');
const res = {
    ok: s.startsWith(text)
        && check.length === before.length + Buffer.byteLength(ADD, 'utf8')
        && sha16(check.subarray(0, before.length)) === EXPECT_PRE.sha16,
    before: { bytes: before.length, sha16: EXPECT_PRE.sha16 },
    after: { bytes: check.length, sha16: sha16(check) },
    delta: check.length - before.length,
    expectedDelta: Buffer.byteLength(ADD, 'utf8'),
    stringLengthVsBytes: { textStringLen: text.length, textBytes: before.length },
    lines: s.split('\n').length,
};
console.log(JSON.stringify(res, null, 2));
if (!res.ok) throw new Error('纯追加不变量不成立');
