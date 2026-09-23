'use strict';
/**
 * r45l：把 r45k 提交（f2acf3e）证伪的发布面陈述就地订正（纯插入，原文全部保留）。
 * 纪律：① 断言全部前置 + 写入侧可重入（陷阱 47）；② 锚点命中数逐处断言（陷阱 33）；
 *      ③ 纯插入不变量：逐处删除插入段必须还原写前像（陷阱 35/39）；④ 字节账一律 Buffer.byteLength（陷阱 36）；
 *      ⑤ 发布面禁止新增仓库外绝对路径（陷阱 33 同族）；⑥ 本脚本不落自身终值（陷阱 39）。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const LOCK = JSON.parse(process.env.R45L_PRE || 'null');
if (!LOCK) throw new Error('必须提供 R45L_PRE={"<relpath>":{bytes,sha16}, ...}');
const MARK = 'UPDATE-r45k';
const NOSIGN = '（实现方只登记事实，**批复列留空由 owner 逐条追签，不代签**）';

const FACT = '现读（r45k 提交 `f2acf3e`，2026-09-24 07:33:38 +0800，工作树 clean）：'
    + '`git ls-files docs/evidence/v12` → **172**、`git ls-files docs/evidence` → **370**、'
    + '盘上 `find docs/evidence/v12 -type f` → **175**；差额 **3** 份是 `d10/*.log`，'
    + '被根 `.gitignore` 的 `*.log` 遮住且 `docs/evidence/**` 没有 `raw/**` 那样的例外规则。'
    + '提交前门禁现读：`typecheck` EXIT=0、`npm test` 32 套件 / 262 用例全绿、'
    + '十道只读门禁（file-map / licenses / web-only / v12-backends / doc-refs / custom-face / feature-face / '
    + 'v11-chain-face / test-inventory / decoders）全 EXIT=0、`verify:consumer` EXIT=1（失败项仍恰 F-85 一条）；'
    + '52 例 `example.json` 的 `promotion.candidate` 现读全部等于当期现算 `candidateFingerprint 9fa85f88b968d5f1`。**未 push**。';

const EDITS = [
    {
        file: 'docs/acceptance-report-v12.md',
        anchor: '⇒ 待批 #12 未闭。',
        text: ' **' + MARK + '（2026-09-24，就地作废末句）**：该「跟踪数现读仍 0」与「#12 未闭」是 r45g 快照，'
            + '自本句起作废 —— ' + FACT,
    },
    {
        file: 'docs/acceptance-report-v12.md',
        anchor: '#18（api-coverage 口径）。',
        text: ' **' + MARK + '（同轮，就地订正本格内三处失效陈述：「至今未纳入版本控制」「只存在于工作树」「证据未入库（待批 #12）」，原文保留）**：'
            + FACT + ' 于是本行前置五项的**提交半边（#12）已落地**，' + NOSIGN + '；'
            + '仍 in-progress 的是四项：该 3 份日志是否随证据走（#12 残留子问）、#13 命名例外的处置（该目录现读 `git ls-files` → 1，'
            + '已随提交进 HEAD ⇒ 若批 (a) 删除将成为「删已发布文件」，成本口径变了）、#9（D9 的 14 项残留分类）、#16、#17、#18。'
            + 'LV12-21 状态**不因本句翻绿**。',
    },
    {
        file: 'docs/acceptance-report-v12.md',
        anchor: '已记为 LV12-21 待补。',
        text: ' **' + MARK + ' 作废本句**：现读 `git ls-files docs/evidence/v12` → **172**（盘上 175，差额 3 份 `*.log` 仍被根忽略规则遮住）'
            + '⇒ 上文「该目录整体尚未纳入版本控制（r41 现读 → 0）」是当时快照，随 r45k 提交失效。',
    },
    {
        file: 'docs/v12-owner-decisions.md',
        anchor: '⇒ §12 取证层只存在于工作树',
        text: '。**' + MARK + '（2026-09-24，就地作废本格「至今未纳入版本控制 / 现读 → 0 / 只存在于工作树」三处陈述，原文保留）**：'
            + 'owner 当日下达「提交git」⇒ ' + FACT + ' 本行 (b) 的「随文件系统丢失」风险已消除；'
            + '本行残余只有那 3 份 `d10/*.log` 的归属（仍是 (a)/(b) 之外的独立一问）。' + NOSIGN,
    },
    {
        file: 'docs/v12-owner-decisions.md',
        anchor: '是从未 add 过。',
        text: ' **' + MARK + ' 作废本行**：现读 `git ls-files docs/evidence/v12` → **172** / `git ls-files docs/evidence` → **370** ⇒ '
            + '上文「→ 0」与「是从未 add 过」是 r45g 快照，提交 `f2acf3e` 后不再成立（残余 3 份 `*.log` 见 #12 行的 UPDATE）。',
    },
    {
        file: 'docs/v12-owner-decisions.md',
        anchor: '需按 F-133 口径读。',
        text: ' **' + MARK + '（只更新「落点 + 提交授权」一问，不改本行待批性质）**：'
            + '① 落点半边已成事实 —— r45j 非正典批次目录现读 `git ls-files docs/evidence/v12/v11chain-r45j` → **105** 已随 `f2acf3e` 进 HEAD，'
            + '故 (b3) 所要求的「只需 #12/#13 的提交授权」已在 r45k 兑现；但 owner 当时下达的是整体「提交git」，**未逐条点名 (b1)/(b2)/(b3)**，'
            + '本行仍按待批处理、建议默认 (b3) 由 owner 追认 ' + NOSIGN + '。'
            + '② 决策信息更新：上列「3 例 / 4 格红」里的 **mesh-sphere 两格已不再是契约缺陷**——现读 `examples/mesh-sphere/example.json` 的 '
            + '`promotion.candidate` 已回到当期货币 `9fa85f88b968d5f1`（与其余 51 例逐字段相同）、`npm test` 32 套件 / 262 例全绿 '
            + '⇒ 在册归因（并行会话注入的假 validator `not-a-real-validator`）所述根因已消失。⚠️ 但 `v11chain-r45j/` 里那两条记录**仍是 FAIL 字节**'
            + '（捕获于假 validator 在盘期间）⇒ 要晋升仍需**重采该两格**，只是不再需要先改示例契约。'
            + '③ 余下两格不变：`webkit/audio-basic`（F-100 结构性，3/3 同签名）、`webkit/video-basic`（F-135 间歇，需连续 8 次全绿才可销案）。',
    },
];

/* ---------- 断言阶段：全部前置，一次写盘都不做 ---------- */
const pres = {};
for (const e of EDITS) {
    if (!pres[e.file]) {
        const buf = fs.readFileSync(REPO + e.file);
        const l = LOCK[e.file];
        if (!l) throw new Error('缺写前锁：' + e.file);
        if (buf.length !== l.bytes || sha16(buf) !== l.sha16) throw new Error(`写前锁不匹配 ${e.file}：现读 ${buf.length}/${sha16(buf)} 锁 ${l.bytes}/${l.sha16}`);
        pres[e.file] = { buf, text: buf.toString('utf8') };
    }
    const hits = pres[e.file].text.split(e.anchor).length - 1;
    if (hits !== 1) throw new Error(`锚点命中 ${hits}（需恰 1）：${e.file} :: ${e.anchor.slice(0, 30)}`);
    if (/cocosair-scratch|[A-Za-z]:\/AIProMax\/(?!github\/cocosair\.js)/.test(e.text)) throw new Error('插入段含仓库外绝对路径：' + e.anchor.slice(0, 20));
}

/* ---------- 逐处插入（可重入：整段已存在则跳过，不重复插） ---------- */
const applied = {};
for (const f of Object.keys(pres)) applied[f] = [];
for (const e of EDITS) {
    const cur = pres[e.file].text;
    if (cur.includes(e.anchor + e.text)) { console.log('SKIP（已应用）: ' + e.anchor.slice(0, 24)); continue; }
    const idx = cur.indexOf(e.anchor);
    const next = cur.slice(0, idx + e.anchor.length) + e.text + cur.slice(idx + e.anchor.length);
    if (!next.includes(e.anchor + e.text)) throw new Error('插入未落在锚点后：' + e.anchor.slice(0, 24));
    pres[e.file].text = next;
    applied[e.file].push(e);
}

/* ---------- 纯插入不变量：逐处删除插入段必须逐字节还原前像 ---------- */
for (const f of Object.keys(pres)) {
    let restore = pres[f].text;
    for (const e of applied[f].slice().reverse()) {
        if (!restore.includes(e.anchor + e.text)) throw new Error('还原：找不到插入段 ' + e.anchor.slice(0, 24));
        restore = restore.replace(e.anchor + e.text, e.anchor);
    }
    if (restore !== pres[f].buf.toString('utf8')) throw new Error('还原判据失败：丢弃本轮插入未逐字节复原前像 ' + f);
    const back = Buffer.from(pres[f].text, 'utf8');
    const delta = back.length - pres[f].buf.length;
    const expect = applied[f].reduce((a, e) => a + Buffer.byteLength(e.text, 'utf8'), 0);
    if (delta !== expect) throw new Error(`字节账不符 ${f}：差 ${delta} ≠ 插入段合计 ${expect}`);
    const before = (pres[f].buf.toString('utf8').match(/cocosair-scratch/g) || []).length;
    const after = (pres[f].text.match(/cocosair-scratch/g) || []).length;
    if (after !== before) throw new Error(`发布面 scratch 指针数变动 ${before} → ${after}（本轮必须零新增）`);
    fs.writeFileSync(REPO + f, back);
    const rb = fs.readFileSync(REPO + f);
    if (rb.length !== back.length || sha16(rb) !== sha16(back)) throw new Error('写后回读不符：' + f);
    console.log(JSON.stringify({
        file: f, pre: pres[f].buf.length, post: rb.length, delta,
        inserted: applied[f].map((e) => ({ anchor: e.anchor.slice(0, 24), bytes: Buffer.byteLength(e.text, 'utf8'), hits: pres[f].text.split(e.anchor + e.text).length - 1 })),
        scratchPointers: { before, after }, sha16: sha16(rb),
    }));
}
const nApplied = Object.values(applied).reduce((a, v) => a + v.length, 0);
if (nApplied === 0) throw new Error('零插入＝空转，判据未生效');
console.log(JSON.stringify({ ok: true, mark: MARK, files: Object.keys(pres).length, edits: EDITS.length, applied: nApplied }));
