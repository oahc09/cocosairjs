'use strict';
/**
 * r45m：发布面就地当期化（锚点式纯插入）。
 * 沿用 r45l 落地的七项守卫（断言全部前置 + 写入侧可重入）：
 *   ① 写前锁（字节+sha16 必须等于 R45M_PRE 给定的现值，防半应用态被陈旧锁永久挡死）
 *   ② 锚点命中恰 1（replace 锚点不存在会静默空转，见陷阱 33）
 *   ③ 插入段禁含仓库外绝对路径（陷阱 33）
 *   ④ 已应用则 SKIP（可重入，多文件写入中途失败可重跑）
 *   ⑤ 还原判据：逐处反插入必须逐字节回前像
 *   ⑥ 字节账用 Buffer.byteLength（陷阱 34/36），且必须等于插入段合计
 *   ⑦ scratch 指针数零新增 + 反空转（applied=0 即抛）
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const B = (s) => Buffer.byteLength(s, 'utf8');
const SCRATCH_RE = /cocosair-scratch|[A-Za-z]:\/AIProMax\/(?!github\/cocosair\.js)/g;

const LOCK = JSON.parse(process.env.R45M_PRE || 'null');
if (!LOCK) throw new Error('必须提供 R45M_PRE={"<relpath>":{bytes,sha16}, ...}');

const E21 = '| 21 | **证据货币是否绑当期交付物 + 三引擎批次是否覆写正典**（r45m 补实体行：本编号自 r45h4 起被发布面六处引用——验收报告 §1 LV12-01 / §2 行 17 / §2.1 行 9 与其结论段、`docs/v12-upstream-regression.md` §7.9 边界段、`docs/evidence/v12/v11chain-r45j/README.md` 与 `pilot12-r45i/README.md`——而本表当时只有 #1–#18，属**悬空编号**。修法选「补行」而非「改六处引用」，因为那六句都是已发生轮次的原文，重写会把归因历史一起改掉。**#19 / #20 从未启用**，本行按既成引用号落在 #21） | 三问同桌，owner 可分别签：**(21-A)** `verify:v11-chain-face` 是否加断言「在册 `candidateFingerprint` == 当前树现算值」（r45h4 刻意没加，加了＝改任何 `src/` 都要重采 52 例才能解锁） **(21-B)** 三引擎铺开结果是否**覆写正典**（当前 52 例三引擎证据全在 `docs/evidence/v12/v11chain-r45j/` 与 `pilot12-r45i/`，非正典、`[skip-promote]`；覆写即让 firefox/webkit 参与晋级判定 ⇒ 需 runner 支持 per-engine 已知红名单，属改判定语义） **(21-C)** V1.2 三引擎矩阵那 36 记录批次是否重跑（重跑覆写 36 张在册 PNG） | **(21-A)** 代价＝每次 `src/` 改动逼一轮重采：批量口径 **≈14.1 s/例/引擎**（r45j 四腿 80 例·引擎 / 1,130 s），52 例 × 两引擎 ⇒ 约 **25 min/轮**；⚠️ 该口径**不可**套到单例补腿：r45m 实测单例腿墙钟 **120–125 s**（起服务 + 构建 traced bundle 是每腿一次性开销）。零改产物。 **(21-B)** 需先处置 `webkit/audio-basic`（F-100，3/3 同签名＝结构性）与 `webkit/video-basic`（F-135，间歇，按在册 retest 口径需连续 8 次全绿才销案）两格；`mesh-sphere` 两格**已不再是障碍**（r45m 在干净声明面下重采两引擎均 PASS，见 `docs/evidence/v12/mesh-sphere-r45m/README.md`）。覆写正典会改写 `docs/evidence/v11-examples-verified.json` 与 52 份 `example.json` 的 `promotion` ⇒ 触发 `verify:v11-chain-face`、`smoke-29`、`spec-compliance` 全链重跑。 **(21-C)** ≈38 min，覆写 36 张在册 PNG；其证据货币性已由 r45h3 离线复算证明**未过期** ⇒ 重跑只换捕获时刻、不换结论 | 建议：**(21-A) 维持不加**（绑定的收益可用「离线复算 + 现读」零成本拿到，配方在 `raw/gates/r45h3-*`）；**(21-B) 取 #15 的 (b3)**＝非正典批次作为 §12 补充证据入库，per-engine 红名单不动判定语义；**(21-C) 不重跑**，除非 owner 要新截图。⚠️ 三条无论批哪条都要现读复核：本行只登记事实与成本，**批复列留空由 owner 逐条签，不代签**（同 #15 口径） | |';

const EDITS = [
  { file: 'docs/v12-owner-decisions.md', anchor: '锚点应固定为 `candidateFingerprint 9fa85f88b968d5f1` | |', text: '\n' + E21 },
  { file: 'docs/v12-owner-decisions.md', anchor: '（F-135 间歇，需连续 8 次全绿才可销案）。', text: ' **UPDATE-r45m（2026-09-24，本行决策信息再更新：4 格红缩为 2 格）**：`firefox/mesh-sphere` 与 `webkit/mesh-sphere` 两格**已由重采结案**——r45k 提交把干净的 `examples/mesh-sphere/example.json` 固化进 HEAD ⇒ 在册归因的「活体前提」不再成立，且**该结论不是本会话口头宣布的，是 r45j 自家判据现读自报 STALE**（`raw/gates/r45m-r45j-judge-rerun.log`：`hardCount:0 staleCount:2`、`EXIT=1`，逐字「已无 not-a-real-validator ⇒ 归因过期」）。两腿按非正典重采后各 `1/1 PASS`，与 chromium 正典**逐字段相等**（`specFingerprint c0d64a28c555`、`sourceFingerprint cb85b55b88591609`、apiProof units 18、`candidateFingerprint 9fa85f88b968d5f1`），三引擎截图字节账互不相同 ⇒ 确证「非引擎差异」。⇒ (b1) 的读法随之变化：**firefox 腿现已 52/52 与 chromium 逐字段等**，(b2) 的障碍只剩 webkit 那两格。新证据与判据：`docs/evidence/v12/mesh-sphere-r45m/`（README 含命令原件、零回写锁值、成本订正）+ `raw/gates/r45m-recapture-reconcile.{cjs,json}` + 六臂负控 `raw/gates/r45m-negctl.log`。另：本行引用的待批 **#21** 此前是悬空编号（发布面六处引用、本表无实体行），r45m 已补为 #21 行。本行仍待批，本会话未晋升、未覆写正典。' },
  { file: 'docs/acceptance-report-v12.md', anchor: '明细、逐文件字节/sha、只读复核配方 `docs/evidence/v12/v11chain-r45j/README.md`。', text: ' **r45m 更新（2026-09-24 00:01–00:05Z，只新增证据文件 + 判据，零改判定阈值/契约/源码/产物、零覆写正典）**：r45j 那 4 格红里的 **mesh-sphere 两格已由重采结案**（归因前提随 r45k 提交消失 ⇒ 由 r45j 判据现读自报 `staleCount:2 / EXIT=1`，非本会话口头宣布；原件 `raw/gates/r45m-r45j-judge-rerun.log`）。重采落点 `docs/evidence/v12/mesh-sphere-r45m/`（非正典、`--out=` ⇒ 每腿一行 `[skip-promote]`）：firefox / webkit 各 `1/1 PASS`，与 chromium 正典逐字段相等（`specFp c0d64a28c555` / `srcFp cb85b55b88591609` / units 18 / 货币 `9fa85f88b968d5f1`），三引擎 PNG 字节账互异；对账判据 `raw/gates/r45m-recapture-reconcile.cjs`（当期 `ok:true hardCount:0 cellsCount:2`）+ 六臂负控 `r45m-negctl.log`（阳性臂 EXIT=0、五篡改臂各自命中自己的判定层）。⇒ 三引擎总账的**事实口径**由 49/52 变为「若以干净声明面重算则 50/52」，余 `webkit/audio-basic`（F-100 STRUCTURAL）与 `webkit/video-basic`（F-135 INTERMITTENT）。**本格仍不翻绿**：重采是补充证据不是晋升，晋升与否属 #15 的 (b1)/(b2)/(b3) 与本轮补上实体行的 **#21**（同时收口一处簿记缺陷：`#21` 自 r45h4 起被发布面六处引用却无实体行＝悬空编号，r45m 补行而非改写六处历史引用；#19/#20 从未启用）。另订正成本口径：**≈14.1 s/例/引擎只适用批量**，r45m 实测单例腿墙钟 120–125 s（一次性开销摊不开），两口径不得互套。' },
  { file: 'docs/evidence/v12/v11chain-r45j/README.md', anchor: '本仓库不代他人撤除该注入。', text: ' **UPDATE-r45m（2026-09-24）：该活体前提已失效 ⇒ 本行归因过期，两格已重采结案（原文保留不删）。** r45k 提交（`f2acf3e`）把干净声明面固化进 HEAD，本批次判据现读自报 `hardCount:0 staleCount:2 / EXIT=1`（`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45m-r45j-judge-rerun.log`）；重采结果与判据见 `docs/evidence/v12/mesh-sphere-r45m/README.md`。' },
  { file: 'docs/evidence/v12/v11chain-r45j/README.md', anchor: '- **三引擎同时 PASS 的例数：49 / 52。**', text: ' **UPDATE-r45m**：49 是「按 r45j 当时在册 4 格红」算出的轮次快照，其中 2 格（mesh-sphere × firefox/webkit）经重采确认为注入伪影 ⇒ 「以干净声明面重算」口径为 **50 / 52**（余 `webkit/audio-basic`＝F-100、`webkit/video-basic`＝F-135）。引用 49 时须同时说明口径，原文保留不删。' },
];

/* ①②③ 断言全部前置 */
const st = {};
for (const e of EDITS) {
  if (!st[e.file]) {
    if (!(e.file in LOCK)) throw new Error(`缺写前锁：${e.file}`);
    const buf = fs.readFileSync(REPO + e.file);
    const l = LOCK[e.file];
    if (buf.length !== l.bytes || sha16(buf) !== l.sha16)
      throw new Error(`写前锁不匹配 ${e.file}：现读 ${buf.length}/${sha16(buf)} 锁 ${l.bytes}/${l.sha16}`);
    st[e.file] = { before: buf.toString('utf8'), after: buf.toString('utf8'), inserted: 0 };
  }
  const hits = st[e.file].before.split(e.anchor).length - 1;
  if (hits !== 1) throw new Error(`锚点命中 ${hits}（需恰 1）：${e.file} :: ${e.anchor.slice(0, 30)}`);
  if (/cocosair-scratch|[A-Za-z]:\/AIProMax\/(?!github\/cocosair\.js)/.test(e.text))
    throw new Error(`插入段含仓库外绝对路径：${e.file} :: ${e.anchor.slice(0, 30)}`);
}

/* ④ 写入侧可重入 */
let applied = 0;
for (const e of EDITS) {
  const s = st[e.file];
  if (s.after.includes(e.anchor + e.text)) { console.log(`SKIP（已应用）: ${e.file} :: ${e.anchor.slice(0, 24)}`); continue; }
  s.after = s.after.replace(e.anchor, e.anchor + e.text);
  s.inserted += B(e.text);
  applied++;
}
if (applied === 0) throw new Error('零插入＝空转，判据未生效');

/* ⑤⑥⑦ 还原判据 + 字节账 + 指针数 */
const receipt = [];
for (const [f, s] of Object.entries(st)) {
  let restore = s.after;
  for (const e of EDITS.filter((x) => x.file === f).reverse()) {
    if (!restore.includes(e.anchor + e.text)) throw new Error(`反插入未命中 ${f} :: ${e.anchor.slice(0, 24)}`);
    restore = restore.replace(e.anchor + e.text, e.anchor);
  }
  if (restore !== s.before) throw new Error(`还原判据失败 ${f}：反插入后与前像不逐字节相同（差 ${B(restore) - B(s.before)} B）`);
  if (B(s.after) !== B(s.before) + s.inserted)
    throw new Error(`字节账不符 ${f}：${B(s.after)} != 前像 ${B(s.before)} + 插入合计 ${s.inserted}`);
  const ptr = (t) => (t.match(SCRATCH_RE) || []).length;
  if (ptr(s.after) !== ptr(s.before))
    throw new Error(`发布面 scratch 指针数变动 ${f}: ${ptr(s.before)} → ${ptr(s.after)}（本轮必须零新增）`);
  receipt.push({ file: f, pre: B(s.before), post: B(s.after), delta: B(s.after) - B(s.before), scratchPointers: { before: ptr(s.before), after: ptr(s.after) }, sha16: sha16(Buffer.from(s.after, 'utf8')) });
}
/* 全部判据通过后才落盘 */
for (const [f, s] of Object.entries(st)) {
  const edits = EDITS.filter((x) => x.file === f);
  const pending = edits.filter((e) => !s.before.includes(e.anchor + e.text)).length;
  if (pending) fs.writeFileSync(REPO + f, s.after, 'utf8');
  const r = receipt.find((x) => x.file === f);
  r.edits = edits.length;
  r.appliedEdits = pending;
  r.insertedBytes = s.inserted;
}
console.log(receipt.map((r) => JSON.stringify(r)).join('\n'));
console.log(JSON.stringify({ ok: true, mark: 'UPDATE-r45m', files: Object.keys(st).length, edits: EDITS.length, applied }));
