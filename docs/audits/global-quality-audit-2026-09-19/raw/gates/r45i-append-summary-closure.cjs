'use strict';
// r45i 收口块：向 verification-summary.md 的 r45i addendum 追加（纯尾部追加，写前抛，判据三段全等，字节账两侧同为字节）
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const P = REPO + 'docs/audits/global-quality-audit-2026-09-19/verification-summary.md';
const EXPECT = { bytes: 204456, sha16: 'dd85c49b09e512b0' };
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
if (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16) {
    throw new Error(`前像锁不符：actual ${before.length} ${sha16(before)}，expected ${EXPECT.bytes} ${EXPECT.sha16}`);
}
const text = before.toString('utf8');
if (!text.endsWith('\n')) throw new Error('尾部非换行');
if (text.includes('r45i 收口补记')) throw new Error('收口块已存在');
// 只允许追加到 r45i addendum 之内：确认它仍是最后一节
const lastHeading = text.lastIndexOf('\n## ');
if (!text.slice(lastHeading).includes('Addendum r45i-pilot11')) throw new Error('r45i addendum 不是末节，拒绝盲追加');

const ADD = `
**r45i 收口补记（同轮，04:39–04:45Z，零提交）**

1. **配方落档**：仓库外活文档 \`completion-summary.md\` §27.11.12 已写满 10 条（三引擎逐字段对账、在册 PNG 回读、成本口径 ≈19 s/例/引擎、非正典零回写、覆盖账 52=12+11+29 的开口写法、#15 只改决策成本、runner 无失败请求维度的观察＝未开号）。
2. **同轮自我更正（陷阱 36 复发，新形态）**：追加脚本的**写后**判据把 \`Buffer.length\`（字节）与字符串 \`.length\`（UTF-16 code unit）相减 —— 中文文档实测 133,402 字节 vs 90,268 字符 ⇒ **写盘已成功却判红**，属 throw-after-write。危险不在判红本身，而在它会诱导「重跑一次」→ 在有副作用的路径上就是重复追加。处置：① 判据两侧统一为字节；② 追加一律带**前像锁**，重跑在写盘前抛（\`E:/AIProMax/cocosair-scratch/v12-logs/r45i-append-retry.out\`，\`RETRY_EXIT=1\`，锁后现读文件仍 133,402 \`14ce7087d422c01e\`）⇒ **幂等由锁保证，不由判据保证**；③ 判据与写盘分离，另立只读脚本 \`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45i-verify-append.cjs\`（前缀逐字节命中 + 新标题恰 1 处 + 是末节 + 末行标记 + 子条在场，5/5 成立 \`JUDGE_EXIT=0\`）。
3. **门禁面影响＝零**：本轮收口只动 \`docs/audits/**\`、仓库外 memory 与 scratch。已现读确认 \`verify:doc-refs\` 的 \`defaultFiles()\` 只遍历 \`README.md\`/\`UPSTREAM.md\` + \`docs/*.md\` + \`docs/manual/*.md\`（非递归 ⇒ 不含 \`docs/audits/**\`），且 out-of-repo 绝对路径走 S3 只登记不判红 ⇒ 台账追加不可能自断链（陷阱 32 面）。tarball 与本节文字无涉，故 r45i 的 \`verify:doc-refs\` EXIT=0 / \`verify:consumer\` EXIT=1（仅 F-85）读数**未被本轮作废**。
4. **归档**：\`raw/gates/\` 上一格「120 → 138 件」是归档动作完成**前**的读数；本条补入 5 件（两份追加脚本、只读判据、memory 落档脚本、重跑抛错日志）后**现读 143 件**（终值以 \`ls docs/audits/global-quality-audit-2026-09-19/raw/gates | wc -l\` 现读为准，本条不写死）。
5. **memory 落档（4 文件，写前锁 → 写后差值）**：\`reference-v11-verification-gates.md\` 51,767 \`02700cfba9fd7d7f\` → +1,287（陷阱 40 正文 + 计数三十九→四十 + frontmatter）；\`reference-global-quality-audit-2026-09-19.md\` 48,378 \`10fadaeab81e8006\` → +3,665（\`## r45i\` 纯追加节）；\`project-v12-regression-state.md\` 10,890 \`838d1343957dc2e1\` → +1,003（两条 r45i 现读）；\`MEMORY.md\` 5,593 \`0eb8c97169a526b0\` → +818（6 处锚点索引，含把 \`≈63s/例/引擎\` 就地改为 \`≈19s/例/引擎（63 s 是 2 例摊不开一次性开销的上限）\`）。先跑禁写 dry-run 得 \`applied 11/11 / delta 0\` 再属真写 ⇒ 落档零意外扩散。
6. **本轮状态**：r45i 收口完成度＝**PARTIAL**（取证半边拿到；LV12-01 第三格不翻绿；\`verify:api-coverage\` 仍红＝owner #18；\`npm test\` 现读 2 红＝并行 F-132 NC 未撤，未认领未擅动）。**提交数 0**：未 \`git add\`、未 commit、未 push（本会话未获授权）。
`;

const after = Buffer.from(text + ADD, 'utf8');
fs.writeFileSync(P, after);

const check = fs.readFileSync(P);
const s = check.toString('utf8');
const res = {
    ok: s.startsWith(text)
        && check.length === before.length + Buffer.byteLength(ADD, 'utf8')
        && sha16(check.subarray(0, before.length)) === EXPECT.sha16,
    before: { bytes: before.length, sha16: EXPECT.sha16 },
    after: { bytes: check.length, sha16: sha16(check) },
    delta: check.length - before.length,
    expectedDelta: Buffer.byteLength(ADD, 'utf8'),
    lines: s.split('\n').length,
};
console.log(JSON.stringify(res, null, 2));
if (!res.ok) throw new Error('纯追加不变量不成立');
