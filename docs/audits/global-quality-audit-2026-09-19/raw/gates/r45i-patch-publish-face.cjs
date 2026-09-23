'use strict';
// r45i 发布面落表：acceptance-report §1 LV12-01 两格 + §2 行 1 已在别处改；owner-decisions #15 成本口径下修。
// 纪律：锚点命中数先断言、写前抛错（零污染）、独立计划数守卫、写后回读。
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const REPORT = 'docs/acceptance-report-v12.md';
const DECISIONS = 'docs/v12-owner-decisions.md';

const EXPECTED_PLAN_COUNT = 3;
let applied = 0;

const R45I = '**r45i 更新（2026-09-23 04:12–04:25Z，只新增证据文件、零改判定阈值/契约/源码/产物）**：待批 #15 选项 **(a)** 的可跑半边已按**非正典**方式实测完成——Pilot-12 的 11 例（`automation` 因 `requiresDevTools` 被 runner 结构性排除 ⇒ **不得读成「12 例全绿」**）× {firefox, webkit} 各 **11/11 PASS**、`completed:true`、`partial:true`（子集）、两条腿 `FIREFOX_EXIT=0` / `WEBKIT_EXIT=0`，落点 `docs/evidence/v12/pilot12-r45i/`（`--out=` 非当期路径 ⇒ runner 自印 `[skip-promote]`，`example.json` / `files.json` / 正典 `docs/evidence/v11-examples-verified.json` **零回写**：复核仍 631,722 B / `49c81e5a1e4054e9`）。三引擎对账（chromium 侧取正典同 11 例）33 条记录全检 `EXIT=0`：逐条 `result PASS` ∧ `errors []` ∧ `candidateFingerprint` 全为 `9fa85f88b968d5f1`（= 当前交付产物 ⇒ 跨引擎与正典同一套证据货币）∧ `unproven == 0`；逐例 `specFingerprint` / `sourceFingerprint` / `apiProof` 三引擎逐字段相同，子集汇总三引擎同为 `{verified: 139, attested: 9, unproven: 0}`（148 units）；22 张本目录 PNG + 11 张正典 PNG 的在册字节与 sha256₁₆ 对**在盘回读**逐张一致。判据脚本与负控：`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45i-cross-engine-reconcile.cjs` + `r45i-negctl.cjs`（8 臂 `passCount 8 / 8`，含阳性对照与反空转臂 N5「清空 results 必须报 11 条 MISSING」）。⚠️ 负控首轮 **7 臂全部假绿**，根因是负控脚本把覆盖键写成引擎名而对账脚本按路径取键 ⇒ 篡改副本从未被读到；修好键映射后才得到上表 8/8 ⇒ 「EXIT=0 但每臂 failCount 全 0」本身就是红灯（新陷阱见台账）。**三引擎覆盖账（替换本行旧口径「三引擎只覆盖 11 例…其余 40 例仍只有单引擎」）**：52 = **12** 例矩阵链（`browser-matrix.json` 36/36，另一套验证器）+ **11** 例本批次 V1.1 规格链两腿 + **29** 例仍仅 chromium；两两不相交（实测交集为空）。⚠️ **本格不因此翻绿**：非正典捕获 ≠ 晋升，正式批次是否覆写正典与落点仍待 #15 / #21 批复。附带登记一处**验证器覆盖不对称**（不判红）：两腿日志各 1 次 `[bench-404] /gltf-viewer/` 而记录仍 PASS，因 V1.1 规格 runner 无 `noFailedRequest` 维度（矩阵 runner 有 `failedRequests`）。明细与边界 `docs/evidence/v12/pilot12-r45i/README.md`。';

const PATCH = [
  {
    file: REPORT,
    label: 'c1 第三列标签',
    anchor: '| LV12-01 | G0 基线对齐 | **verified**（16 组范围已实测闭合） | **in-progress** | 冻结点',
    expectHits: 1,
    apply: (s) => s.replace('| LV12-01 | G0 基线对齐 | **verified**（16 组范围已实测闭合） | **in-progress** | 冻结点',
      '| LV12-01 | G0 基线对齐 | **verified**（16 组范围已实测闭合） | **in-progress → 部分铺开（r45i：52 例中 23 例已有三引擎证据，其中 11 例是本批次新增的非正典两腿）** | 冻结点'),
  },
  {
    file: REPORT,
    label: 'c2 当期证据格追加 r45i',
    anchor: '的 `requiresDevTools` 过滤） |',
    expectHits: 1,
    apply: (s) => s.replace('的 `requiresDevTools` 过滤） |', '的 `requiresDevTools` 过滤）。' + R45I + ' |'),
  },
  {
    file: DECISIONS,
    label: '#15 行成本口径下修 + 半边已实测',
    anchor: '若 owner 认为「存量」应随仓库增长而重解释，则 (b)。(c) 不推荐（顶替的是另一套验证器） |',
    expectHits: 1,
    apply: (s) => s.replace('若 owner 认为「存量」应随仓库增长而重解释，则 (b)。(c) 不推荐（顶替的是另一套验证器） |',
      '若 owner 认为「存量」应随仓库增长而重解释，则 (b)。(c) 不推荐（顶替的是另一套验证器）。**UPDATE-r45i（2026-09-23 04:25Z：(a) 的可跑半边已实测完成 + 成本口径按实测下修，本行仍待批）**：11 例 × {firefox, webkit} 已以**非正典**方式采齐（各 11/11 PASS、三引擎 33 条记录对账 `EXIT=0`、负控 8/8，明细 `docs/evidence/v12/pilot12-r45i/README.md` 与验收报告 §1 LV12-01 的 r45i 格）⇒ 实测两腿串行 ≈7 min（本地时钟 12:12→12:19:14；首张→末张 PNG 跨度 firefox 70 s / webkit 82 s，每腿一次性启动开销 ≈40 s）＝ **≈19 s/例/引擎**，本行原估「≈63 s/例/引擎」是 r45f 用 2 例摊不动一次性开销得到的**上限**，据此 (a) 的实际成本 ≈7 min 两腿（本会话已花完）、(b) 全量 52 例两腿 ≈ **17–18 min**（原估 1.9 h 高估约 6 倍）。⚠️ 成本下修**不**改变待批性质：(a)(b) 的新证据要入库需提交授权，覆写正典与否、正式批次落点仍由 owner 定，本会话不擅自晋升。 |'),
  },
];

if (PATCH.length !== EXPECTED_PLAN_COUNT) throw new Error(`ASSERT 计划数：${PATCH.length} != ${EXPECTED_PLAN_COUNT}`);

const originals = new Map();
for (const f of [REPORT, DECISIONS]) originals.set(f, fs.readFileSync(REPO + f));
const lock = {};
for (const [f, buf] of originals) lock[f] = { bytes: buf.length, sha16: sha16(buf) };

const pending = new Map();
for (const t of PATCH) {
  const s = (pending.get(t.file) ?? originals.get(t.file).toString('utf8'));
  const hits = s.split(t.anchor).length - 1;
  if (hits !== t.expectHits) throw new Error(`ASSERT 锚点 ${t.label}：hits=${hits} != ${t.expectHits}（写前抛错，零污染）`);
  const out = t.apply(s);
  if (out === s) throw new Error(`ASSERT 替换无效：${t.label}`);
  pending.set(t.file, out);
  applied++;
}
if (applied !== EXPECTED_PLAN_COUNT) throw new Error(`ASSERT 应用数：${applied} != ${EXPECTED_PLAN_COUNT}`);

for (const [f, text] of pending) {
  fs.writeFileSync(REPO + f, Buffer.from(text, 'utf8'));
}
const after = {};
for (const f of [REPORT, DECISIONS]) {
  const b = fs.readFileSync(REPO + f);
  after[f] = { bytes: b.length, sha16: sha16(b), lines: b.toString('utf8').split('\n').length, delta: b.length - lock[f].bytes };
}
console.log(JSON.stringify({ applied, lock, after }, null, 2));
