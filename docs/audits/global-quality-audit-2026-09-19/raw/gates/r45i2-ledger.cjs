'use strict';
// r45i-2 收口：evidence-index 现有 r45i 行加 readings_r45i2（同轮自写行就地补字段）+ verification-summary 纯尾部追加
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const L = REPO + 'docs/audits/global-quality-audit-2026-09-19/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const EI = { path: L + 'evidence-index.json', bytes: 84652, sha16: 'fc92627eb1578b3b' };
const VS = { path: L + 'verification-summary.md', bytes: 207646, sha16: 'fd55aaf60e70bfe9' };
const applied = [];

// ---- (1) evidence-index ----
{
    const b = fs.readFileSync(EI.path);
    if (b.length !== EI.bytes || sha16(b) !== EI.sha16) throw new Error(`EI 前像锁不符：${b.length} ${sha16(b)}`);
    const text = b.toString('utf8');
    if (JSON.stringify(JSON.parse(text), null, 2) + '\n' !== text) throw new Error('EI 正典序列化等式不成立（禁止手改前）');
    const j = JSON.parse(text);
    const idx = j.evidence.findIndex((r) => r.id === 'V12-LV1201-PILOT11-THREE-ENGINE-R45I');
    if (idx < 0) throw new Error('找不到 r45i 行');
    if (j.evidence[idx].readings_r45i2) throw new Error('readings_r45i2 已存在');
    if (j.evidence.length !== 81) throw new Error(`行数 ${j.evidence.length} != 81`);
    j.evidence[idx].readings_r45i2 = {
        at: '2026-09-23T04:46-04:48Z',
        what: '同轮追加：验收报告两处诚实性订正（§1 LV12-20 判定格 verified（当期全绿）→ PARTIAL；§4 护栏 bullet 补 UPDATE-r45i2 十七条口径），未新增取证、未改阈值',
        reportHashChain: '129,400 dc6700e30b2fe866 → 129,595 173dd7494ba50ebd → 130,393 5d6148122ebc31b7（307 行不变）',
        gates: 'verify:doc-refs EXIT=0（refsChecked 1084 / unresolved 0 / 棘轮 31 命中）、verify:consumer EXIT=1（failures 恰 1 条＝ F-85，与改前同面），tarball 10,356,166 → 10,356,610 B',
        scope: '只动 docs/acceptance-report-v12.md（发布面）。零产品/产物改动，零回写正典证据（docs/evidence/v11-examples-verified.json 仍 631,722 B / 49c81e5a1e4054e9 / 52 records / 单指纹 9fa85f88b968d5f1）。',
    };
    const out = JSON.stringify(j, null, 2) + '\n';
    const after = Buffer.from(out, 'utf8');
    fs.writeFileSync(EI.path, after);
    const chk = fs.readFileSync(EI.path);
    if (JSON.stringify(JSON.parse(chk.toString('utf8')), null, 2) + '\n' !== chk.toString('utf8')) throw new Error('EI 写后正典等式破');
    if (JSON.parse(chk.toString('utf8')).evidence.length !== 81) throw new Error('EI 写后行数漂移');
    applied.push({ target: 'evidence-index.json', before: EI.bytes, after: chk.length, delta: chk.length - EI.bytes });
}

// ---- (2) verification-summary 纯尾部追加 ----
{
    const b = fs.readFileSync(VS.path);
    if (b.length !== VS.bytes || sha16(b) !== VS.sha16) throw new Error(`VS 前像锁不符：${b.length} ${sha16(b)}`);
    const text = b.toString('utf8');
    if (!text.endsWith('\n')) throw new Error('VS 尾部非换行');
    if (text.includes('r45i-2（同轮追加')) throw new Error('r45i-2 块已存在');
    const lastH = text.lastIndexOf('\n## ');
    if (!text.slice(lastH).includes('Addendum r45i-pilot11')) throw new Error('r45i addendum 非末节');
    const ADD = `
**r45i-2（同轮追加，04:45–04:48Z，零提交）**：收口时顺手发现自己写的**发布面自相矛盾**并就地修，不是新取证。

1. **缺陷**：\`docs/acceptance-report-v12.md\` §1 的 LV12-20「代码回归」格仍写「**verified**（当期全绿）」，而同行右列证据的 UPDATE-r45g-ledger 早已宣告该措辞作废（现判 PARTIAL）。追加式记账的副作用：**只扫矩阵判定列的读者读到的是假话**。同类风险面已复扫（\`当期全绿\` / \`全部 PASS\` / \`17 条\`）⇒ §4 L220 尾句、§2 L96 均已自带作废注解，只有 §1 判定格裸奔。
2. **修法**：判定格就地改为 **PARTIAL**，并把原话以引号保留 + 标注「＝假话／已作废」，不删历史；§4 护栏 bullet 末尾追加 UPDATE-r45i2（补 §2 自 r45h4 起为**十七条**、当期 16 绿 / 1 红、"16 绿"是 r45h 全量 + r45h4 抽测 4 条的合成口径）。哈希链：129,400 \`dc6700e30b2fe866\` → 129,595 \`173dd7494ba50ebd\` → 130,393 \`5d6148122ebc31b7\`（307 行不变）。
3. **发布面纪律复跑**：改 \`docs/*.md\` ⇒ 重跑 \`verify:doc-refs\`（**EXIT=0**，\`refsChecked 1084\` / \`unresolvedCount 0\` / 棘轮 31 全命中）与 \`verify:consumer\`（**EXIT=1**，\`failures\` 恰 1 条＝ F-85「README links to missing packaged file: docs/manual/index.md」，与改前**同一失败面**，tarball 10,356,166 → 10,356,610 B）。两条各跑两轮（每处编辑后一次）。
4. **零污染确认（现读）**：\`docs/evidence/v11-examples-verified.json\` 仍 631,722 B / \`49c81e5a1e4054e9\` / 52 records / 指纹集合单值 \`9fa85f88b968d5f1\`（＝登记值逐字节相同）；三产物 \`6,081,668 35496aebda066ab5\` / \`3,499,182 8795c8685ace28a1\` / d.ts 正名 \`build/cocosair.module.d.ts\` \`3,082,360 6d01c030d85bf86c\` 全部未动。⚠️ 本轮两次探路把 d.ts 猜成 \`build/cocosair.d.ts\`（ENOENT）⇒ **路径必须现读**，别凭记忆（与陷阱 32 同族：门禁/文件真名以盘上为准）。
5. **状态**：r45i 总判定仍 **PARTIAL**；LV12-20 仍 PARTIAL（红项 #18 未批复）；\`npm test\` 仍现读 2 红（并行 F-132 NC）；**提交数 0**（\`git diff --cached --name-only\` → 0）。
`;
    const after = Buffer.from(text + ADD, 'utf8');
    fs.writeFileSync(VS.path, after);
    const chk = fs.readFileSync(VS.path);
    const s = chk.toString('utf8');
    const ok = s.startsWith(text)
        && chk.length === b.length + Buffer.byteLength(ADD, 'utf8')
        && sha16(chk.subarray(0, b.length)) === VS.sha16;
    if (!ok) throw new Error('VS 纯追加不变量不成立');
    applied.push({ target: 'verification-summary.md', before: b.length, after: chk.length, delta: chk.length - b.length, lines: s.split('\n').length });
}

console.log(JSON.stringify({ applied, gates: { docrefs: 'EXIT=0 refsChecked 1084 unresolved 0 ratchet 31/31', consumer: 'EXIT=1 failures=[F-85]' }, staged: 0 }, null, 2));
