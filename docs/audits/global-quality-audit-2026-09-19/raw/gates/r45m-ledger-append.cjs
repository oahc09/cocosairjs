'use strict';
/**
 * r45m：向共享台账 findings.jsonl 追加一条发现（F-136）＋纯追加不变量判据。
 * 规则（在册）：台账只追加，不回写他人条目；本轮追加的是**本会话自己新发现**的一行。
 * 判据：① 追加前现读行数/字节/sha16 必须等于给定锁（防并发写覆盖）② 前 N 行逐字节不变
 *       ③ 新行必须是合法 JSON 且 findingId 未被占用 ④ 字节差 == 新行字节。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const REL = 'docs/audits/global-quality-audit-2026-09-19/findings.jsonl';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const B = (s) => Buffer.byteLength(s, 'utf8');

const LOCK = JSON.parse(process.env.R45M_LEDGER_LOCK || 'null');
if (!LOCK) throw new Error('必须提供 R45M_LEDGER_LOCK={"lines":N,"bytes":N,"sha16":"…"}（追加前现读值）');

const before = fs.readFileSync(REPO + REL);
const text = before.toString('utf8');
const lines = text.split('\n');
const hadTrailingNL = text.endsWith('\n');
const body = hadTrailingNL ? lines.slice(0, -1) : lines;
if (body.length !== LOCK.lines) throw new Error(`行数不匹配：现读 ${body.length} != 锁 ${LOCK.lines}`);
if (before.length !== LOCK.bytes || sha16(before) !== LOCK.sha16)
  throw new Error(`字节/哈希不匹配：现读 ${before.length}/${sha16(before)} 锁 ${LOCK.bytes}/${LOCK.sha16}`);

const existing = body.map((l) => JSON.parse(l).findingId);
const id = 'F-136';
if (existing.includes(id)) throw new Error(`${id} 已在册，禁止重复追加（若为并发写 ⇒ 现读后另择编号）`);

const entry = {
  findingId: id,
  requirementId: '发布面自证质量：待批编号引用必须能在 `docs/v12-owner-decisions.md` §2 找到实体行（否则后续会话按不存在的编号去「等批复」，把开放项误记成已登记）',
  gate: '非命令门禁缺陷：`verify:doc-refs` 只管文件路径引用，对「待批 #N」这类**编号引用**结构性失明（与待批 #17 对仓库外绝对路径的失明同型）',
  category: '簿记/引用完整性（悬空编号）',
  blocking: false,
  status: 'FIXED-AND-PROVEN（r45m 补 #21 实体行；固化为门禁列为后续自办）',
  location: 'docs/v12-owner-decisions.md §2（r45l 期止于 #18）；引用点 docs/acceptance-report-v12.md:17/78(×2)/87、docs/v12-upstream-regression.md:1020、docs/evidence/v12/v11chain-r45j/README.md:115',
  repro: 'node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-decision-ref-check.cjs（当期 EXIT=0 / dangling 0）；负控两臂见同目录 r45m-decision-ref-check.log：R45M_DECISIONS 指向删掉 #21 行的副本 ⇒ EXIT=1 且报出全部 #21 引用点，删掉 #15 行 ⇒ 报 #15（证明判据不是只认一个编号）',
  expected: '凡发布面写「待批 #N」处，N 在 §2 有实体行；编号只增不改，缺号需显式声明「从未启用」',
  actual: '#21 自 r45h4 起被 6 个引用点 / 3 个文件引用，而 §2 只有 #1–#18 ⇒ 悬空。且该编号承载的是**两件不同的事**（是否把 `candidateFingerprint == 当前树现算值` 绑进门禁、三引擎批次是否覆写正典），旧文本把它们与 #15 的范围问题混在同一条引用里',
  evidence: 'docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-decision-ref-check.{cjs,log}（6 处引用点在删行副本上逐条报出 file:line）；补行后的 §2 现读 rows = 1..18,21（#19/#20 从未启用，行内已声明）；r45m 发布面插入回执 docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-publish-face-negctl.log（两臂负控）',
  minimalFix: '已做：在 §2 追加 #21 实体行（三问 21-A/21-B/21-C 分列，批复列留空由 owner 逐条签，不代签），并在行内说明为何选「补行」而非改写六处历史引用。后续（无需批复）：把本判据固化为只读门禁 `verify:decision-refs`，纳入 §2 护栏计数——注意它是**新增护栏**，不得读成 LV12 侧推进',
  retest: '固化后：① 正向 EXIT=0；② 删 #21 行副本 EXIT=1 且 dangling 含 #21；③ 新增一条指向不存在编号的引用（scratch 副本）EXIT=1；④ 反空转：把 §2 表解析成 0 行必须抛而非静默通过（脚本 `rows.size < 5` 守卫，实测删表头副本可触发）',
  measuredAt: new Date().toISOString(),
  scope_note: '本轮零改判定阈值/契约/源码/产物；台账只追加本会话新发现的一条，未回写任何他人条目。#21 的三问仍未获批复，LV12-01 第三格与 §2 护栏计数（16 绿 / 1 红）均不因本轮改变。',
};
const line = JSON.stringify(entry);
const out = (hadTrailingNL ? text : text + '\n') + line + '\n';
const after = Buffer.from(out, 'utf8');
/* 纯追加不变量：前缀必须逐字节相同 */
if (!after.subarray(0, before.length).equals(before)) throw new Error('纯追加不变量失败：前缀被改写');
if (after.length - before.length !== B(line) + 1) throw new Error(`字节账不符：差 ${after.length - before.length} != ${B(line)} + 1`);
const back = after.toString('utf8').split('\n').slice(0, body.length + 1);
if (JSON.parse(back[back.length - 1]).findingId !== id) throw new Error('回读末条不是新条目');
fs.writeFileSync(REPO + REL, after);
console.log(JSON.stringify({ ok: true, added: id, lines: { before: body.length, after: back.length }, bytes: { before: before.length, after: after.length }, sha16: { before: sha16(before), after: sha16(after) } }));
