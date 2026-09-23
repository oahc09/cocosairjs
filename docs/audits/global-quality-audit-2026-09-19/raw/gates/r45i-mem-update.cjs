'use strict';
// r45i 记忆更新（v2：锚点全部先实测命中数）。写前锁 + 计划数守卫 + 回读。
const fs = require('fs');
const crypto = require('crypto');
const DIR = 'C:/Users/caosh/.qoder/projects/E--AIProMax-github-cocosair-js/memory/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const G = 'reference-v11-verification-gates.md';
const A = 'reference-global-quality-audit-2026-09-19.md';
const P = 'project-v12-regression-state.md';
const M = 'MEMORY.md';

const PATCH = [
  {
    file: G, label: 'G1 frontmatter 计数与第 40 条摘要', hits: 1,
    anchor: '判据脚本 EXIT=0 不等于子判据全成立——见 39 条）',
    into: '判据脚本 EXIT=0 不等于子判据全成立——见 39 条；注入式覆盖（env/CLI/副本路径）必须有一臂自证注入生效，否则负控只是给原始数据盖章——见 40 条）',
  },
  {
    file: G, label: 'G2 陷阱计数措辞', hits: 1, anchor: '三十九个取证陷阱', into: '四十个取证陷阱',
  },
  {
    file: G, label: 'G3 陷阱 40 正文', hits: 1,
    anchor: '否则要在句子里显式标"最近一轮全量 + 本轮抽测"的**合成口径**。',
    into: '否则要在句子里显式标"最近一轮全量 + 本轮抽测"的**合成口径**。\n40. **注入式覆盖必须有一臂自证"注入真的生效"（r45i，实测 2026-09-23 04:22Z）**：负向控制常把被测对象指向仓库外的篡改副本（env / `--files=` / CLI 覆盖）。本轮七个篡改臂各自 `EXIT=1` 却 `failCount 0`——根因不是守卫失灵，而是**键空间不匹配**：负控脚本按引擎名（`firefox`/`webkit`）写覆盖键，判据脚本按**仓库相对路径**取键 ⇒ 七臂全部在读正典，篡改从未被打开。修好键映射后 8/8（含反空转臂「清空 `results` 必须报 11 条 MISSING 而非"全过"」）。三条硬规则：① 覆盖键必须与读取键**同一命名空间**，并让判据脚本把**实际读到的路径**打印进输出（本轮 `fileLevel[*].readFrom` 就是这条的产物）；② 负控臂的判据是**"命中预期的那一层"**（`expect` 过滤器），不是 `EXIT≠0`——否则"因为别的原因红"也算过；③ **阳性对照（未改副本必须绿）与篡改臂缺一不可**：只有阳性臂能区分"数据本来就这样"与"我的注入没生效"。与 37/38/39 同族：都是"判据看起来在跑、实际不在跑"。',
  },
  {
    file: A, label: 'A1 r45i 段（纯追加）', hits: null,
    append: `
## r45i（2026-09-23 04:12–04:35Z，零提交）：LV12-01 取证半边＝Pilot-11 × firefox/webkit 非正典两腿

- **拿到了什么**：待批 #15 选项 (a) 字面 Pilot-12 的**可跑 11 例**（\`automation\` 被 \`requiresDevTools\` 结构性排除 ⇒ 不得读成 12 例）在两引擎各 **11/11 PASS**，落点 \`docs/evidence/v12/pilot12-r45i/\`（2 JSON + 22 PNG + 自带 README，204,899 B）；\`--out=\` 非当期路径 ⇒ \`[skip-promote]\` ⇒ 正典 \`v11-examples-verified.json\` 复核仍 631,722 \`49c81e5a1e4054e9\`、\`example.json\`/\`files.json\`/三产物零变。**三引擎对账** \`EXIT=0\`：33 条记录逐条 PASS ∧ \`errors []\` ∧ 指纹全 \`9fa85f88b968d5f1\` ∧ \`unproven 0\`；逐例 specFp/srcFp/apiProof 计数/\`expectationGaps\` 三引擎逐字段同；子集汇总三引擎同 \`{verified:139, attested:9, unproven:0}\`（148 units）。负控 **8/8**（含阳性与反空转臂）。
- **覆盖账（可复核）**：52 条 V1.1 记录 = **12** 例矩阵链 + **11** 例本批次规格链两腿 + **29** 例仍仅 chromium，三者两两不相交。
- **成本口径下修**：≈**19 s/例/引擎**（两腿串行 ≈7 min）⇒ #15 原估 63 s/例/引擎是 2 例摊不动一次性开销的上限；(b) 全量 52 例两腿从 ≈1.9 h 变 **≈17–18 min**。**改的是决策成本，不是范围、不是阈值**；#15/#21 仍待批，LV12-01 第三格**不翻绿**（非正典 ≠ 晋升）。
- **当前树 \`npm test\` 是红的，但不是本会话的**：\`npx jest\` 32/262 ⇒ **2 failed / 260 passed**，两条全在 \`smoke-29\`（§15 \`spec-validate --strict\` status 1；§11/§12 逐字 \`[FAIL] mesh-sphere S11-STALE-EVIDENCE: specFingerprint c0d64a28c555 ≠ 当前 6a2bfacb3483\`）。现读 \`git diff examples/mesh-sphere/example.json\` ⇒ 并行会话注入 \`not-a-real-validator\` ×2 未撤 ⇒ **F-132 后果升级**：并行 NC 会让**共享工作树的 \`npm test\` 对所有会话转红** ⇒ 在此树引用上一轮 jest 数字必然失真，**报绿必须现读**。本会话未撤他人 NC、未改 \`examples/**\`。同因 \`verify:test-inventory\` \`EXIT=1\`。
- **在册豁免的方向性（F-131 按设计抓到自家人）**：新目录先让 \`smoke-30\` 目录对账**精确转红**（\`Received ["pilot12-r45i"]\`），再在测试映射里加「登记 + 理由（指向该目录自带 README）」⇒ 38/38 绿。顺序＝**先红后登记**，不是放松阈值。
- **一处观察不开 F 号**：两腿日志各 1 次 \`[bench-404] /gltf-viewer/\`（\`tools/benchmark/runner/browser-runtime.cjs\` 第 197/202 行 stderr）而记录仍 PASS ⇒ V1.1 规格 runner **无** failed-request 维度（矩阵 runner 有 \`failedRequests\`）。不判红、也不擅自加维度（属判定面，同 #15/#21 那张桌子）。
- **发布面/台账终读（到本条为止，后续一律现读＝陷阱 39）**：报告 **129,400 \`dc6700e30b2fe866\`**（链 124,026 → 124,211 → 126,842 → 129,400）、owner-decisions **52,377 \`616b097d99eeb9c3\`**、notes 未动 \`c11245416974ce7e\`；\`evidence-index.json\` 76,715 \`4e899941e6e2ea95\` → **84,652 \`fc92627eb1578b3b\`（81 行**，新行 \`V12-LV1201-PILOT11-THREE-ENGINE-R45I\`，\`raw[]\` 18 / \`commands[]\` 5）、\`raw/gates/\` 120 → **138 件**、summary → **204,456 \`dd85c49b09e512b0\`（1,402 行，纯追加）**；\`findings.jsonl\` 未动（132 行 \`d8c865ff1d6381ac\`）。门禁：typecheck / smoke-30 / chain-face / doc-refs 全 \`EXIT=0\`，consumer \`EXIT=1\` 仍恰 F-85 一条（tarball 10,356,166 B、\`exportCount 574\`）。**新教训＝陷阱 40**（注入式覆盖要自证生效）。状态：r45i **PARTIAL 收口**，任务 #28 收口、#21 待批，提交数 0。
`,
  },
  {
    file: P, label: 'P1 r45i 两条（插在"未提交"行之前）', hits: 1,
    anchor: '- 本阶段未提交任何 commit（见 [[feedback-no-auto-commit-push]]）。',
    into: '- **r45i（04:12–04:35Z）LV12-01 取证半边**：Pilot-12 可跑 11 例 × {firefox, webkit} 各 11/11 PASS（非正典 `docs/evidence/v12/pilot12-r45i/`，`[skip-promote]` 零回写；三引擎 33 条记录对账 `EXIT=0`、apiProof 子集三引擎同 `{139,9,0}`、负控 8/8）⇒ **三引擎覆盖账 52 = 12 矩阵链 + 11 本批次 + 29 单引擎**；#15 成本从 63 s/例/引擎下修为 **≈19 s/例/引擎**（(b) 全量 ≈17–18 min）⇒ **LV12-01 第三格仍不翻绿**（非正典 ≠ 晋升，#15/#21 待批）。\n- **r45i 期当前树 `npm test` 现读为红（2 failed / 260 passed），归因＝并行会话 F-132 的 NC 未撤**（`examples/mesh-sphere/example.json` 的 `not-a-real-validator` ×2 ⇒ smoke-29 §15 + §11/§12 红）⇒ 本树**任何「jest 全绿」的陈述都必须现读**；本会话未撤他人 NC、未改 `examples/**`。r45i 自身面当期绿：smoke-30 38/38、typecheck、chain-face 52/52、doc-refs（31/31、0 断链）、consumer 只 F-85。\n- 本阶段未提交任何 commit（见 [[feedback-no-auto-commit-push]]）。',
  },
  { file: M, label: 'M1 陷阱计数', hits: 1, anchor: '三十九个取证陷阱', into: '四十个取证陷阱' },
  {
    file: M, label: 'M2 陷阱 40 摘要', hits: 1,
    anchor: '38＝批量落表的判据不得与被校验路径同源——恒等字节账查不出"整条漏落"，计划条数要用循环外常量，stdout 自报清单也是判据）',
    into: '38＝批量落表的判据不得与被校验路径同源——恒等字节账查不出"整条漏落"，计划条数要用循环外常量，stdout 自报清单也是判据；40＝注入式覆盖（env/CLI/副本路径）必须有一臂自证注入生效——负控按引擎名写键、判据按路径取键会**静默读回正典**，判据取"命中预期那一层"而非 `EXIT≠0`，阳性臂与篡改臂缺一不可）',
  },
  { file: M, label: 'M3 铺开成本', hits: 1, anchor: '≈63s/例/引擎', into: '≈19s/例/引擎（r45i 实测；63 s 是 2 例摊不开一次性开销的上限）' },
  {
    file: M, label: 'M4 台账段补 r45i', hits: 1,
    anchor: 'r45h4c 口径订正 + 陷阱 39（自指登记不写终值），台账链见该文件 r45h4c 段）',
    into: 'r45h4c 口径订正 + 陷阱 39（自指登记不写终值），台账链见该文件 r45h4c 段；r45i＝LV12-01 拿到 11 例三引擎**非正典**证据（覆盖账 52=12+11+29），当前树 jest 2 红归因 F-132 NC 未撤 ⇒ 报绿必现读，见该文件 r45i 段）',
  },
  {
    file: M, label: 'M5 状态段补 r45i', hits: 1,
    anchor: 'r45h4c：「16 绿」是「r45h 全量 + 本轮抽测 4 条」的**合成口径**，整体仍 PARTIAL**',
    into: 'r45h4c：「16 绿」是「r45h 全量 + 本轮抽测 4 条」的**合成口径**，整体仍 PARTIAL**；r45i：LV12-01 第三格＝52 例中 23 例有三引擎证据（11 例为本批次非正典）⇒ 仍不翻绿，#15/#21 待批；本树 `npm test` 现读 2 红（并行 NC），引用旧轮数字即失真',
  },
  {
    file: M, label: 'M6 completion-summary 索引补 27.11.12', hits: 1,
    anchor: '§27.11.11＝r45h4b/c 单条补齐配方 + 还原判据逐处报告 + 自指登记只写"格"不写"终值"）**',
    into: '§27.11.11＝r45h4b/c 单条补齐配方 + 还原判据逐处报告 + 自指登记只写"格"不写"终值"；§27.11.12＝r45i 三引擎对账配方（11 例 × 3 引擎逐字段比 + 在册 PNG 回读 + 负控键空间自证）**）',
  },
];

const EXPECTED_PLAN_COUNT = PATCH.length;
const files = [...new Set(PATCH.map((t) => t.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(DIR + f)]));
const lock = Object.fromEntries(files.map((f) => [f, { bytes: originals.get(f).length, sha16: sha16(originals.get(f)) }]));
let applied = 0;
const pending = new Map();
for (const t of PATCH) {
  const s = pending.get(t.file) ?? originals.get(t.file).toString('utf8');
  let out;
  if (t.hits === null) {
    out = s + t.append;
    if (!out.startsWith(s)) throw new Error(`ASSERT 纯追加 ${t.label}`);
  } else {
    const hits = s.split(t.anchor).length - 1;
    if (hits !== t.hits) throw new Error(`ASSERT 锚点 ${t.label}：hits=${hits} != ${t.hits}（写前抛错，零污染）`);
    out = s.split(t.anchor).join(t.into);
  }
  if (out === s) throw new Error(`ASSERT 替换无效：${t.label}`);
  pending.set(t.file, out);
  applied++;
}
if (applied !== EXPECTED_PLAN_COUNT) throw new Error(`ASSERT 应用数 ${applied} != ${EXPECTED_PLAN_COUNT}`);
for (const [f, text] of pending) fs.writeFileSync(DIR + f, Buffer.from(text, 'utf8'));
const after = Object.fromEntries(files.map((f) => { const b = fs.readFileSync(DIR + f); return [f, { bytes: b.length, sha16: sha16(b), delta: b.length - lock[f].bytes }]; }));
console.log(JSON.stringify({ applied, plan: EXPECTED_PLAN_COUNT, lock, after }, null, 2));
