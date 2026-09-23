const fs = require('fs');
const crypto = require('crypto');
const P = 'E:/AIProMax/github/cocosair.js/docs/acceptance-report-v12.md';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(P);
const t = before.toString('utf8');
if (before.length !== 120607 || sha16(before) !== '110ad66928bc2b89') {
  throw new Error(`ASSERT 锁值：${before.length} ${sha16(before)} != 120607 110ad66928bc2b89`);
}

const ROW17 = '\n| 17 V1.1 证据链完整性（r45h4 新增，自办＝把「被大量引用却无人守档」的证据面变成门禁，判据全文 `docs/v12-upstream-regression.md` §7.13） | `npm run verify:v11-chain-face` | **EXIT=0**（r45h4 首跑现读） — `{"ok":true,"records":52,"runPass":"52/52","fps":"9fa85f88b968d5f1","apiProof":"verified:1004 attested:129 unproven:0","live":"9fa85f88b968d5f1==evidence","errorCount":0}`。七条只读不变量 **V1–V7**（`tools/v12/verify-v11-chain-face.cjs`）：V1 `completed true` ∧ `partial false`（缺标记即 NOT_RUN）；V2 计数自洽 `runTotal === total === results.length` ∧ **`> 0`（反空转：0 条记录的"全过"不判绿）** ∧ `runPass + fail === runTotal` ∧ `pass === runPass`；V3 `id` 唯一 ∧ 逐条 `result PASS` ∧ `errors []`；V4 逐条 16 位十六进制三指纹 ∧ 全表 `candidateFingerprint` **恰 1 个不同值**且 == 文件级；V5 文件级 `apiProofTotals` **==** 逐条聚合 ∧ `unproven === 0` ∧ `proof` 只允许 verified/attested；V6 `runner` 指向的采集脚本仍在盘 ∧ `mode` 非空（证据非手写的旁证）；V7 `measuredAt` 可解析且**不晚于当前时刻**（+60 s 容差，挡未来日期）。负向对照 **十臂 `passCount 10 / 10`**（`--evidence=` 指向仓库外副本，各臂 `EXIT=1` 且只报自己那一层；`N4` 刻意把 `apiProofTotals` 一并归零，否则 V5 会同时响、把反空转守卫掩盖掉）。**边界（不得读成"已绑当期产物"）**：本门禁**不**断言 `candidateFingerprint == 当前树现算值`——那条等式会把「改任何 `src/` 都要重采 52 例（三引擎 ≈1.9 h）」变成既成事实，属 owner 决策面（同 #15 / #21、F-132 (c) 那张桌子）；现算值只作信息打印在 `live` 段、不参与退出码 ⇒ 本行只主张「**在册证据不被静默改坏**」，「证据是否当期」另按 §2.1 的 UPDATE-r45h3 离线复算判 |';

const EDITS = [
  { id: '§2 新增行 17', anchor: '⇒ F-129 / 待批 #16 |', ins: ROW17 },
  {
    id: '§1 LV12-20 计数口径',
    anchor: '计划书 §13「全部 PASS」在 api-coverage 口径批复前**不成立**，本行不得记 verified。',
    ins: '。**UPDATE-r45h4（03:13–03:21Z）**：§2 护栏自本轮起 **十七条**（新增第 17 条 `verify:v11-chain-face`，只读、首跑 `EXIT=0`）⇒ 上句「十六条 = 15 绿 / 1 红」是 r45g-ledger 当时口径，对前 16 条仍成立；当期读法＝**16 绿 / 1 红**（唯一红项仍是第 10 条 #18），本行结论不变（仍 PARTIAL，且本行从未主张过"新增门禁＝推进"）',
  },
  {
    id: '§4 计数 bullet',
    anchor: '取证层 blocked **4** 项不变；合计仍 21。',
    ins: '。**UPDATE-r45h4**：§2 护栏计数随新增第 17 条换为**十七条**（16 绿 / 1 红，红项仍是 #18）；本 bullet 的 LV12 矩阵计数（16+1 / 4 / 0 / 4，合计 21）不受影响——新增的是护栏不是特性项，不得把它读成 LV12 侧推进',
  },
  {
    id: '§2.1 尾部 r45h4 段',
    anchor: '现算锚点（同一轮）：dev bundle `6,081,668 B / 35496aebda066ab5`',
    ins: null,
  },
];

// 第 4 处：在 §2.1 的 r45h3 配方清单末尾追加一条 bullet（锚点是该行整行，插入点在该行行尾）
const LIST_ROW = EDITS.pop();
{
  const linePrefix = '- 现算锚点（同一轮）：dev bundle `6,081,668 B / 35496aebda066ab5`';
  if (t.split(linePrefix).length - 1 !== 1) throw new Error(`ASSERT §2.1 锚点行前缀唯一命中：实际 ${t.split(linePrefix).length - 1}`);
  const idx = t.indexOf(linePrefix);
  const eol = t.indexOf('\n', idx);
  if (eol < 0) throw new Error('ASSERT §2.1 锚点行无行尾');
  LIST_ROW.anchor = t.slice(idx, eol);
  LIST_ROW.ins = '\n- 本轮（r45h4）另新增第 17 条护栏 `npm run verify:v11-chain-face`（V1.1 证据链完整性，只读、V1–V7、十臂负控 `10 / 10`、首跑 `EXIT=0`）⇒ 上面「13 行实测 / 3 处未测」是 **r45h 那 16 行**的口径，新行属 r45h4，其当期读数记在 §2 行 17 与 `docs/v12-upstream-regression.md` §7.13；§2.1 的格数不因此回溯改写。';
}

let after = t;
const plan = [];
for (const e of EDITS) {
  const hits = after.split(e.anchor).length - 1;
  if (hits !== 1) throw new Error(`ASSERT ${e.id} 锚点唯一命中：实际 ${hits}`);
  const marker = e.ins.replace(/^\n+/, '').slice(0, 24);
  if (after.includes(marker)) throw new Error(`ASSERT ${e.id} 尚未落过（防重复追加）`);
  const at = after.indexOf(e.anchor) + e.anchor.length;
  after = after.slice(0, at) + e.ins + after.slice(at);
  plan.push(e);
}

const afterBuf = Buffer.from(after, 'utf8');
const expectedBytes = Buffer.byteLength(t, 'utf8') + plan.reduce((a, e) => a + Buffer.byteLength(e.ins, 'utf8'), 0);
if (afterBuf.length !== expectedBytes) throw new Error(`ASSERT 字节账（UTF-8）：${afterBuf.length} != ${expectedBytes}`);
let recon = after;
for (const e of plan) {
  if (recon.split(e.ins).length - 1 !== 1) throw new Error(`ASSERT 还原：${e.id} 插入文本不唯一`);
  recon = recon.replace(e.ins, () => '');
}
if (recon !== t) throw new Error('ASSERT 非纯插入');

fs.writeFileSync(P, afterBuf);
const disk = fs.readFileSync(P);
if (!disk.equals(afterBuf)) throw new Error('ASSERT 磁盘 != 内存');
console.log(JSON.stringify({
  before: { bytes: before.length, sha16: sha16(before) },
  after: { bytes: disk.length, sha16: sha16(disk) },
  lines: `${t.split('\n').length} -> ${disk.toString('utf8').split('\n').length}`,
  edits: plan.map((e) => e.id),
  insertedBytes: disk.length - before.length,
}, null, 2));
