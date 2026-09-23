'use strict';
/**
 * r45j 台账补记：把「Addendum r45j-close 段写盘之后才发生的事」以**纯追加**方式登记（不改写已落盘的段落）。
 * 触发原因＝新陷阱 47：首版 r45j-append-ledger.cjs 是多文件写入且断言未全部前置 ⇒ summary 已追加、index 未追加的半应用态。
 * 纪律：写前锁 env 传入；已应用 ⇒ 复原前像核对锁并跳过写盘；写后回读；被引用数字一律现读。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const AUD = REPO + 'docs/audits/global-quality-audit-2026-09-19/';
const SUM = AUD + 'verification-summary.md';
const IDX = AUD + 'evidence-index.json';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const LK = JSON.parse(process.env.R45J_COR_PRE || '{}');
if (!LK.summary || !LK.index) throw new Error('必须提供 R45J_COR_PRE={"summary":{bytes,sha16},"index":{"bytes","sha16","rows"}}');

/* ---- 现读全部被引数字（写盘前） ---- */
const idx = JSON.parse(fs.readFileSync(IDX).toString('utf8'));
const row = idx.evidence.find((e) => e.id === 'V11-CHAIN-52-EXAMPLES-THREE-ENGINE-R45J');
if (!row) throw new Error('第 82 行未在册 ⇒ 补记不得先于本体');
const ib = fs.readFileSync(IDX);
if (ib.length !== LK.index.bytes || sha16(ib) !== LK.index.sha16) throw new Error(`index 锁不匹配：${ib.length}/${sha16(ib)}`);
if (idx.evidence.length !== LK.index.rows) throw new Error(`index 行数 ${idx.evidence.length} != ${LK.index.rows}`);
if (JSON.stringify(idx, null, 2) + '\n' !== ib.toString('utf8')) throw new Error('index 非规范形态');
const rawOnDisk = row.raw.filter((p) => fs.existsSync(AUD + p)).length;
if (rawOnDisk !== row.raw.length) throw new Error(`raw[] 有失盘条目：${rawOnDisk}/${row.raw.length}`);
const mf = JSON.parse(fs.readFileSync(AUD + 'raw/gates/r45j-archive-manifest.json', 'utf8'));
const mfBytes = mf.files.reduce((a, b) => a + b.bytes, 0);
const negctl = JSON.parse(fs.readFileSync(AUD + 'raw/gates/negctl-summary.json', 'utf8'));
const ledgerLog = fs.readFileSync('E:/AIProMax/cocosair-scratch/v12-logs/r45j-append-ledger.log', 'utf8');
const ledgerOut = JSON.parse(ledgerLog.slice(ledgerLog.indexOf('{')));
if (ledgerOut.ok !== true || ledgerOut.index.rowsAfter !== LK.index.rows) throw new Error('append-ledger 运行回执形态异常');

/* ---- 构造补记段（只追加，不回写已落盘文字） ---- */
const MARK2 = '13. **补记 r45j-close-B';
const COROLLAIRE = `
### 13. **补记 r45j-close-B（同日，零提交）：上面那段 Addendum 落盘之后才发生的事 —— 半应用事故、陷阱 47、归档第 5–7 批**

上面第 1–12 条写盘时，\`r45j-append-ledger.cjs\` 的一次运行**只完成了一半**：\`verification-summary.md\` 已追加，\`evidence-index.json\` 第 82 行未追加，因为它在写盘之后才做的断言（\`raw[]\` 引用了当时尚未归档的 \`r45j-archive-4.cjs\`）抛出。首版重跑又被自己的写前锁挡下 ⇒ 暴露「锁保护了单文件、却没保护多文件事务」。修法不是关掉锁：

- **① 断言全部前置**：index 侧的锁 / 规范形态 / 历史行不变量 / \`raw[]\` 在册 / 规范重序列化全部上移到第一次写盘之前。
- **② 可重入**：按 Addendum 标题锚点判定「已应用」，从锚点反推前像并核对锁（现读复原值 ${ledgerOut.summary.bytesBefore} B / \`${ledgerOut.summary.shaBefore}\`，与登记的写前锁逐字节同）⇒ 命中即跳过写盘，只补 index。锚点前必须是换行、标题行必须与本脚本一致，否则视为「他人段落」直接停。
- **③ 副作用也要守卫**：归档清单的 \`note\` 字符串追加同样加「重复应用即抛」。

于是本轮真实写序为：summary 段（第 1–12 条）→ 抛错半应用 → 重构 → 本次重跑仅补 index ⇒ \`evidence-index.json\` 现读 **${ib.length.toLocaleString('en-US')} B / \`${sha16(ib)}\` / ${idx.evidence.length} 行**（写前 ${ledgerOut.index.bytesBefore.toLocaleString('en-US')} B / \`${ledgerOut.index.shaBefore}\` / ${ledgerOut.index.rowsBefore} 行），第 82 行 \`raw[]\` ${rawOnDisk} 条逐条在盘。⚠️ 第 4 条写的「三批 / ${mf.files.length - 3} 件」与第 11 条的「四条陷阱」是**该段写盘时值**，其后又推进了三批 ⇒ 以本补记为准：\`raw/gates\` 的 r45j 清单现读 **${mf.files.length} 件 / ${mfBytes.toLocaleString('en-US')} B**（含两次带 \`previousSha256\` + 理由的受控替换：\`r45j-append-findings.cjs\` 与 \`r45j-append-ledger.cjs\`——后者归档的是「带 bug 的中间版」，必须与真正跑通的原件逐字节同）。新陷阱编号续到 **47**（多文件写入的原子性与可重入），43（模板字面量里的 markdown 反引号）本轮第三次触发即由 \`node --check\` 当场挡下。负控读数不变：\`${negctl.passCount}/${negctl.arms}\`。

本补记与上面那段之间的差额即「已应用段 ≠ 生成器当前 ADD 文本」的差（生成器在事故后修过 4 处措辞/计数），登记为事实而非抹平：\`addTextMatchesApplied=${ledgerOut.summary.addTextMatchesApplied}\`。台账写盘后复跑的 \`verify:doc-refs\` 见 \`raw/gates/r45j-docrefs-final.log\`（\`DOCREFS_EXIT=0\`、docs 118 / refsChecked 1087 / baseline 31/31 / unresolved 0 / stale 0）。本条不写自身写盘后的终值（陷阱 39）；第 5–7 批归档件（\`r45j-fix-archive-5.cjs\`、\`r45j-archive-6.cjs\`、\`r45j-archive-7.cjs\`、\`r45j-ledger-corollary.cjs\` 及两份运行日志）由紧随其后的第七批登记，其计数让给现读。
`;

/* ---- 全部断言过后再写盘 ---- */
const cur = fs.readFileSync(SUM);
const curText = cur.toString('utf8');
let already = curText.includes(MARK2);
if (already) {
    const at = curText.indexOf(COROLLAIRE.replace(/^\n+/, ''));
    if (at < 0) throw new Error('检测到补记标题却找不到补记正文 ⇒ 疑他人内容，停');
    const restored = curText.slice(0, at - 1);
    if (Buffer.byteLength(restored, 'utf8') !== LK.summary.bytes || sha16(Buffer.from(restored, 'utf8')) !== LK.summary.sha16) throw new Error(`补记已在但前像不复原：现读 ${cur.length}/${sha16(cur)}`);
} else {
    if (cur.length !== LK.summary.bytes || sha16(cur) !== LK.summary.sha16) throw new Error(`summary 锁不匹配：${cur.length}/${sha16(cur)}`);
}
let back;
if (!already) {
    const after = curText + COROLLAIRE;
    if (!after.startsWith(curText)) throw new Error('非纯追加');
    fs.writeFileSync(SUM, Buffer.from(after, 'utf8'));
    back = fs.readFileSync(SUM);
    if (back.toString('utf8').slice(0, curText.length) !== curText) throw new Error('写后前像不复原');
    if (!back.toString('utf8').endsWith(COROLLAIRE)) throw new Error('写后尾部不是本补记');
} else {
    back = cur;
}
console.log(JSON.stringify({ ok: true, alreadyApplied: already, summary: { bytesBefore: LK.summary.bytes, shaBefore: LK.summary.sha16, bytesAfter: back.length, shaAfter: sha16(back), delta: back.length - LK.summary.bytes }, indexUnchanged: { bytes: ib.length, sha16: sha16(ib), rows: idx.evidence.length } }, null, 2));
