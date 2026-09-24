/* r45n 台账一次性写盘判据：findings.jsonl（F-132 就地改状态 + 追加 F-137 一行）
 * + evidence-index.json（追加 1 行）+ verification-summary.md（追加 Addendum r45n）。
 *
 * 纪律（沿用 r45m 配方）：
 *   - 三段前像锁必填（R45N_LEDGER_LOCK），任一不匹配即停手；**所有断言前置到第一次写盘之前**（陷阱 47）。
 *   - 可重入：三处各自判「已应用则跳过」，三处全已应用则整段抛错。
 *   - 只登记差值与前像锁，不登记写盘后的终值（陷阱 39）。
 *   - raw[] 只引用写盘前已在盘的件；本轮写盘回执 r45n-ledger-run.log 由写盘后产生 ⇒ 刻意不入 raw[]。
 *   - Addendum 正文从独立文本文件读入（脚本内不写 markdown 反引号，避开陷阱 43）。
 *   - R45N_LEDGER_DIR 可指向仓库外副本目录做注入臂（陷阱 40：臂必须自证注入生效）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REAL_DIR = 'E:/AIProMax/github/cocosair.js/docs/audits/global-quality-audit-2026-09-19/';
const DIR = process.env.R45N_LEDGER_DIR || REAL_DIR;
const INJECTED = process.env.R45N_LEDGER_DIR !== undefined;
if (INJECTED && !path.isAbsolute(DIR)) throw new Error('R45N_LEDGER_DIR 必须是绝对路径 ⇒ 否则写盘落在意料之外的地方');
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const LOCK = JSON.parse(process.env.R45N_LEDGER_LOCK || 'null');
if (!LOCK) throw new Error('必须提供 R45N_LEDGER_LOCK={"findings":{bytes,sha16},"index":{...},"summary":{...}}');
const DRY = process.env.R45N_DRYRUN === '1';

const T = {
  findings: { abs: DIR + 'findings.jsonl', lock: LOCK.findings },
  index: { abs: DIR + 'evidence-index.json', lock: LOCK.index },
  summary: { abs: DIR + 'verification-summary.md', lock: LOCK.summary },
};
const RAW = ['r45n-f132-retest.cjs', 'r45n-f132-retest.log', 'r45n-gates.log',
  'r45n-ledger.cjs', 'r45n-addendum.md', 'r45n-ledger-nc.cjs'];
/* raw[] 只列写盘前已在盘的判据原件；两份运行回执（r45n-ledger-nc.log / r45n-ledger-run.log）由跑动本身产生 ⇒ 同 r45m 纪律刻意不入 raw[]，只在 run 回执里互引。 */
for (const f of RAW) if (!fs.existsSync(DIR + 'raw/gates/' + f)) throw new Error('raw[] 引用了不在盘的件：raw/gates/' + f);

/* ---------- 写前快照 + 锁 ---------- */
const pre = {};
for (const k of Object.keys(T)) {
  const buf = fs.readFileSync(T[k].abs);
  if (buf.length !== T[k].lock.bytes || sha16(buf) !== T[k].lock.sha16) {
    throw new Error(k + ' 写前锁不匹配：现读 ' + buf.length + '/' + sha16(buf) + ' 锁 ' + T[k].lock.bytes + '/' + T[k].lock.sha16);
  }
  pre[k] = buf;
}

/* ---------- 新内容全部先在内存里做完 ---------- */
const WAVE = 'r45n';
const raw136 = pre.findings.toString('utf8');
const split = raw136.split('\n');
const lines = split[split.length - 1] === '' ? split.slice(0, -1) : split.slice();
if (lines.some((l) => !l.trim())) throw new Error('findings.jsonl 中间有空行 ⇒ 停手核对');
const parseId = (l) => { try { return JSON.parse(l).findingId; } catch (e) { return null; } };
const i132 = lines.findIndex((l) => parseId(l) === 'F-132');
if (i132 < 0) throw new Error('找不到 F-132 行');
const f132 = JSON.parse(lines[i132]);
const already132 = String(f132.status).includes(WAVE);
const already137 = lines.some((l) => parseId(l) === 'F-137');
if (already132 !== already137) throw new Error('F-132 状态与 F-137 行不同在（半应用态）⇒ 停手核对，别把半截当已应用');
const alreadyFindings = already132 && already137;

const F132_STATUS = 'FIXED-AND-PROVEN（r45n：修法 (a)+(b) 合并落地 + (c) 的消费端断言半边以五臂形式进 smoke-29；故意红态实测正典逐字节未动）';
const CLOSURE = {
  closure_r45n: {
    wave: 'r45n（2026-09-24）',
    preconditionLifted: 'r45h2 记的落地前置（并行会话正在用同一工具跑 NC、examples/mesh-sphere/example.json 带未提交假 validator）已解除：该假 validator 随 r45k（f2acf3e）收敛出盘，r45m 又以干净声明面重采确认那两格红＝注入伪影。⇒ 本轮动写盘语义不再踩别人的在写内容。',
    whatChanged: [
      '(b) 半边：tools/examples/spec-validate.cjs 的写盘改为「正典只由绿跑写出」——outIsCanonical && failed 时不再 writeFileSync，改打 [F-132] ... 拒绝覆写（现行数：判定 :314、反空转 :318、拒绝 :324-325、写盘 :327-328、退出码 :331 ⇒ 退出码判定与写盘解耦）。',
      '(a) 半边：新增 --out=（报告落点，仓库相对或绝对）与 --examples-dir=（被校验的 examples 根，供子集/仓库外副本）；后者缺前者直接 EXIT=2（:290-292），对齐 tools/v12/browser-matrix.cjs 既有的「非 chromium 必须显式 --out=」硬护栏。--out= 即便显式指向正典路径也按解析后路径判等（path.relative 为空）被拒 ⇒ 不靠「没写这个参数」这种脆弱前提。',
      '反空转半边：report.total === 0 判红。原实现扫到 0 例（目录拼错/空目录）会写出「total 0 / frozen 0」的洁净正典＝空集合恒真。',
      '(c) 半边：消费端断言落在 test/smoke/smoke-29-examples-spec.test.ts 新增用例「F-132 正典发布证据只由绿跑写出（红跑零覆写）」五臂——A 显式 --out 指正典 + 红 ⇒ 命中 [F-132] 且 EXIT=1；B 同红态落 scratch ⇒ 红报告确实写出（证明 A 的「未动」是定向拒绝而非空转）；C 绿态落 scratch ⇒ EXIT=0 且 issues 全空；D --examples-dir 缺 --out ⇒ EXIT=2；E 空目录 ⇒ 判红。五臂末了复核正典 bytes/sha256₁₆ 与用例开始时相同。',
      '负控落盘面：同文件原「§3/§10 篡改可检测」用例的注入点从真树改为 os.tmpdir() 下的 examples/mesh-sphere 副本，并删掉当年为绕开本缺陷写的 workaround（还原后必须再跑一次洁净校验把正典刷回）与真树还原用的 writeWithRetry ⇒ 共享工作树的 examples/** 与 docs/evidence/** 不再被本用例的假 issue 污染。',
    ],
    retest: {
      recipe: '在册回执：raw/gates/r45n-f132-retest.cjs（脚本原件）+ raw/gates/r45n-f132-retest.log（stdout 原样）。按原 retest 口径做：真树注入哨兵 ⇒ 以默认落点（完全不传 --out / --examples-dir）跑两臂（第二臂加 --strict），撤除后跑绿。⚠️ 该脚本会写 example.json（finally 逐字节还原）与正典 measuredAt（末了绿跑），非只读。',
      result: 'R1 / R2 均 EXIT=1 且命中 [F-132] 拒绝行；docs/evidence/v11-spec-validate.json 在两次红跑前后 5311/98c3e5c8316beb50 逐字节不变；examples/mesh-sphere/example.json 还原后与注入前 7332/850069498848e625 逐字节同（restored.exact true）；随后绿跑 EXIT=0 且正典正常刷新（5311/a9a776c2272c3450）⇒ 写盘纪律没把绿跑一起堵死。',
      currencyJudge: '正典 measuredAt 每次绿跑都变 ⇒ 不登记终值；当期性用可复跑判据：node tools/examples/spec-validate.cjs --strict 绿 + 现读 "issues": [] 计数 == 57。',
      jest: 'npx jest --silent 全量 32 套件 / 263 用例 / 0 failed / EXIT=0（raw/gates/r45n-gates.log）；node tools/verify/test-inventory.cjs 先红三条（逐字指向本用例：1 改名 + 2 新增）→ --update → 绿 totals {suites:32,tests:263,passed:263,failed:0}、failures: []。',
    },
    notCoveredByThisClosure: '本项只收口 spec-validate 一个写手。同形状仍有 5 处（含姐妹工具 spec-compliance-audit）⇒ 另立 F-137，本轮登记未修：spec-compliance-audit 的 --examples-dir 半边要先镜像 examples/gallery.html / files.json / 两份 runs 证据，否则副本注入出来的红是假红。',
    publishFaceUpdates: '发布面就地订正六处（原文保留 + 带日期注记）：docs/acceptance-report-v12.md §2 行 4b、§2 行 8、§2.1 行 1、§2.1 行 8、§2.1 行 11、§2.1 结论段；另 docs/v11-example-specs.md 增「写盘纪律（F-132）」规范条款。docs/v12-owner-decisions.md 全文不引 F-132 ⇒ 未动该表，批复列继续留空由 owner 逐条签。',
    evidence: [
      'raw/gates/r45n-f132-retest.cjs', 'raw/gates/r45n-f132-retest.log', 'raw/gates/r45n-gates.log',
      'test/smoke/smoke-29-examples-spec.test.ts（新增 F-132 五臂用例 + 原篡改用例改仓库外副本注入）',
      'tools/examples/spec-validate.cjs（写盘纪律 + 两个注入口 + 反空转）',
      'docs/evidence/v11-spec-validate.json 与 v11-spec-compliance.json（本轮绿跑自写，与 HEAD 只差 measuredAt 一行 ⇒ 内容结论未动）',
    ],
    sameRoundSelfCorrections: '① 发布面草稿把「issues.length > 0 即 failed」写成 :317，现读该行是注释、判定在 :314 ⇒ 同处订正。② 判据脚本首版把 raw[] 存在性检查与行内路径写成不同基（DIR+f vs raw/gates/<f>）⇒ 沿用 r45m 修法，一次通过。③ 陷阱 43 复发：Addendum 正文写在 JS 模板字面量里时反引号未转义 ⇒ 改为读独立文本文件 + 占位符替换，脚本内不再出现 markdown 反引号。',
  },
};

const f137 = {
  findingId: 'F-137',
  requirementId: '计划书 §12 护栏「发布证据不被静默改写」——F-132 的形状在其余写手上的残留（泛化项）',
  gate: '非命令门禁缺陷：现读逐文件「写盘行 vs 退出码行」行序 + grep -rl <证据名> test/ 五键逐个 0 命中',
  category: '红跑/负控同样覆写 canonical 发布证据，且多数无 --out= 注入口 ⇒ 想不覆写都办不到（与 F-132 同根；本轮只收口了 spec-validate）',
  blocking: false,
  status: 'OPEN（r45n 登记，本轮未修：动 5 个写手的写盘语义属铺面改动，且 spec-compliance-audit 的仓库外注入要先解决 gallery.html / files.json / runs 证据的镜像）',
  location: '五处「先无条件写正典、后设退出码」，行号 r45n 现读：tools/examples/spec-compliance-audit.cjs:412-413（mkdir + writeFileSync）→ :417（exitCode）；tools/verify/v06-lifecycle-gate.cjs:50 → :53（process.exit）；tools/verify/v06-catalog-gate.cjs:49-50 → :53；tools/verify/v06-report.cjs:33（json）与 :35（连发布文档 docs/v06-final-gate.md 一起覆写）→ :35；tools/verify/v08-iss-gate.cjs:58-59 → :62',
  repro: '① 读码：五处写盘行均在退出码判定之前，且除已修的 spec-validate 外无 --out= 参数（现读 grep -n "flagValue|--out" tools/examples/spec-compliance-audit.cjs → 0 命中）。② 实测配方（照 r45n 的 R1 臂改）：往被校验面注入一个假项 ⇒ 工具 EXIT=1 ⇒ 对 docs/evidence/<对应文件> 取 bytes/sha256₁₆ 前后差；差为 0 则本项在该写手不成立。v06/v08 是浏览器门禁，注入代价高，故其证据＝「读码臂 + 无 --out 参数」两判据。③ 消费面：grep -rl "v06-review-gate|v08-iss-runtime-gate|v06-catalog-runtime-gate|v06-lifecycle-gate|v11-spec-compliance" test/ → 逐个 0 命中。v11-spec-compliance 的**结论**由 smoke-29 以子进程当期 stdout 断言，但那是「当期重跑」而非「在册文件内容」⇒ 磁盘那份仍可被红跑改写而无人复核。',
  expected: '与 F-132 同：canonical 发布证据只由绿跑写出；需要红态报告的运行必须显式落到非正典路径（工具提供 --out=，且缺注入参数时拒绝写正典）。',
  actual: '五个写手红跑同样覆写各自正典。活链上最该先收的是 spec-compliance-audit：§2 行 8 / §2.1 行 8 引用其磁盘产出 docs/evidence/v11-spec-compliance.json，而 jest 只断子进程当期结论。v06/v08 四个是否仍算「发布证据」属 owner 口径（本项不擅自降级其地位）。',
  evidence: 'r45n 现读清单（本次登记时逐个 sed -n 复读行号）+ 同形状缺陷的原始观察与修法菜单见本台账 F-132 的 r45h / r45h2 / closure_r45n 三段。',
  minimalFix: '按性价比：(1) spec-compliance-audit 先只加 F-132 的 (b) 半边（summary.fail > 0 且非 --warn-ok ⇒ 拒写正典 + 打提示）与 --out=，不加 --examples-dir（副本镜像成本另计）；(2) smoke-29 加一条与 F-132 同形断言（红跑后 docs/evidence/v11-spec-compliance.json 字节不变）——建门禁前先按 F-137 的 repro ②证伪；(3) v06/v08：加 --out= 或停止写 docs/evidence/（先由 owner 定它们还算不算发布面）。',
  retest: '修好后：故意跑一次红 ⇒ 对应 docs/evidence/*.json 前后 sha256₁₆ 不变；jest 侧新增断言在**未修态应精确转红**（先证伪再建门禁），修后转绿；npx jest 全量保持 EXIT=0。',
  measuredAt: '2026-09-24（r45n）',
  scope_note: '来源＝F-132 收口时的同族扫描（收口一个写手就顺手把同形状的其余写手数出来），非新一轮取证。本轮主面：F-132 收口（工具 + 消费端断言 + 负控落盘面）＋ 发布面六处就地当期化。零改 src/、零改产物、零重建、未晋升任何证据、未覆写任何 canonical 运行证据（除本轮绿跑正常刷新两份 spec 证据的 measuredAt 行）。',
};

let nextLines = lines.slice();
if (!alreadyFindings) {
  const patched = Object.assign({}, f132, { status: F132_STATUS }, CLOSURE);
  for (const k of Object.keys(f132)) {
    if (k === 'status') continue;
    if (JSON.stringify(patched[k]) !== JSON.stringify(f132[k])) throw new Error('F-132 既有字段 ' + k + ' 被改写 ⇒ 停手');
  }
  nextLines[i132] = JSON.stringify(patched);
  nextLines = nextLines.concat([JSON.stringify(f137)]);
}
const findingsNextTxt = nextLines.join('\n') + '\n';

/* index */
const idxTxtOrig = pre.index.toString('utf8');
const idx = JSON.parse(idxTxtOrig);
if (JSON.stringify(idx, null, 2) + '\n' !== idxTxtOrig) throw new Error('index 非规范序列化形态 ⇒ 本轮拒绝改写');
const ROW = {
  id: 'F132-CLOSURE-R45N',
  findings: ['F-132', 'F-137'],
  createdBy: 'r45n（2026-09-24；F-132 写盘纪律收口：spec-validate 正典只由绿跑写出 + smoke-29 五臂消费端断言 + 负控改仓库外副本；零改判定阈值/契约/源码/产物）',
  status: 'ADMITTED — 代码与测试面：tools/examples/spec-validate.cjs（拒绝覆写 + --out= / --examples-dir= + total 0 判红）、test/smoke/smoke-29-examples-spec.test.ts（+1 用例 ⇒ jest 262 → 263）、docs/test-inventory.json、发布面六处就地当期化 + docs/v11-example-specs.md 新条款、两份 spec 正典证据由本轮绿跑自写（与 HEAD 只差 measuredAt 一行）。结论边界：LV12-20 仍 PARTIAL（唯一红仍是 verify:api-coverage ＝ 待批 #18），§2.1「3 处 NOT_RUN」只剩 2 处（行 1 采集、行 9 批次），未晋升任何证据、未跑矩阵、#15 / #21 仍待 owner 签。新开 F-137 ＝ 同形状余 5 写手（含姐妹工具 spec-compliance-audit），本轮登记未修。本轮未提交（提交需逐次授权）。',
  raw: RAW.map((f) => 'raw/gates/' + f),
  scratch: ['E:/AIProMax/cocosair-scratch/db-probe/（脚本运行副本与丢弃件，仓库外，引用勿当在册证据）'],
  measuredAt: new Date().toISOString(),
};
const alreadyRow = idx.evidence.some((e) => e.id === ROW.id);
const idxNext = alreadyRow ? idx : Object.assign({}, idx, { evidence: idx.evidence.concat([ROW]) });
const idxNextTxt = JSON.stringify(idxNext, null, 2) + '\n';
const closeIdx = idxTxtOrig.lastIndexOf(String.fromCharCode(10) + '  ]');
if (closeIdx === -1) throw new Error('index 找不到 evidence 数组收尾 ⇒ 停手核对');
if (!idxNextTxt.startsWith(idxTxtOrig.slice(0, closeIdx))) throw new Error('index 纯追加不变量失败：数组之前的既有行被改写');
if (!idxNextTxt.endsWith(idxTxtOrig.slice(closeIdx))) throw new Error('index 纯追加不变量失败：数组之后的键被重排');
if (!alreadyRow) {
  if (Buffer.byteLength(idxNextTxt, 'utf8') <= Buffer.byteLength(idxTxtOrig, 'utf8')) throw new Error('index 新文本未变长 ⇒ 追加未发生');
  if (typeof idxNext.rowShapesNote !== 'string' || idxNext.auditId !== idx.auditId) throw new Error('spread 丢了非末键');
}

/* summary：Addendum 正文从独立文件读，占位符填前像值 */
const sumTxtOrig = pre.summary.toString('utf8');
const MARK = '## Addendum r45n';
const alreadySum = sumTxtOrig.includes(MARK);
const ADD_SRC = path.join(__dirname, 'r45n-addendum.md');
const sumNext = (function () {
  if (alreadySum) return sumTxtOrig;
  let txt = fs.readFileSync(ADD_SRC, 'utf8');
  const fill = {
    '{{FINDINGS_BYTES}}': String(pre.findings.length),
    '{{FINDINGS_SHA}}': sha16(pre.findings),
    '{{FINDINGS_LINES}}': String(lines.length),
    '{{INDEX_BYTES}}': String(pre.index.length),
    '{{INDEX_SHA}}': sha16(pre.index),
    '{{INDEX_ROWS}}': String(idx.evidence.length),
    '{{SUMMARY_BYTES}}': String(pre.summary.length),
    '{{SUMMARY_SHA}}': sha16(pre.summary),
  };
  for (const [k, v] of Object.entries(fill)) {
    if (!txt.includes(k)) throw new Error('Addendum 缺占位符 ' + k);
    txt = txt.split(k).join(v);
  }
  if (/\{\{[A-Z_]+\}\}/.test(txt)) throw new Error('Addendum 残留未替换占位符');
  return sumTxtOrig + txt;
})();
if (!alreadySum) {
  if (!sumNext.startsWith(sumTxtOrig)) throw new Error('summary 非纯追加 ⇒ 停手核对');
  if (/[A-Za-z]:[\\/]/.test(sumNext.slice(sumTxtOrig.length))) throw new Error('Addendum 含盘符绝对路径 ⇒ 发布面禁写');
}

/* ---------- 断言全部已过：写入（可重入 ⇒ 已应用者跳过） ---------- */
const applied = { findings: !alreadyFindings, index: !alreadyRow, summary: !alreadySum };
if (!applied.findings && !applied.index && !applied.summary) throw new Error('三处均已应用 ⇒ 本轮应整段跳过，不重复追加');
const deltas = {
  findings: Buffer.byteLength(findingsNextTxt, 'utf8') - pre.findings.length,
  index: Buffer.byteLength(idxNextTxt, 'utf8') - pre.index.length,
  summary: Buffer.byteLength(sumNext, 'utf8') - pre.summary.length,
};
if (applied.findings && deltas.findings <= 0) throw new Error('findings 新文本未变长 ⇒ 追加未发生');
const receipt = { ok: true, applied, deltas, rawListed: RAW.length, injection: { dir: INJECTED, dirUsed: DIR } };

if (DRY) {
  console.log(JSON.stringify(Object.assign({ dryRun: true }, receipt), null, 2));
  process.exitCode = 0;
} else {
  fs.writeFileSync(T.findings.abs, findingsNextTxt);
  fs.writeFileSync(T.index.abs, idxNextTxt);
  fs.writeFileSync(T.summary.abs, sumNext);
  const after = {
    findings: fs.readFileSync(T.findings.abs),
    index: fs.readFileSync(T.index.abs),
    summary: fs.readFileSync(T.summary.abs),
  };
  if (after.findings.toString('utf8') !== findingsNextTxt) throw new Error('findings 读回不等');
  if (after.summary.toString('utf8').slice(0, sumTxtOrig.length) !== sumTxtOrig) throw new Error('summary 前缀读回不等');
  const idxBack = JSON.parse(after.index.toString('utf8'));
  if (idxBack.evidence.length !== idx.evidence.length + (applied.index ? 1 : 0)) throw new Error('index 行数读回不符');
  const fl = after.findings.toString('utf8').split('\n').filter(Boolean);
  if (fl.length !== lines.length + (applied.findings ? 1 : 0)) throw new Error('findings 行数读回不符：' + fl.length + ' vs ' + (lines.length + (applied.findings ? 1 : 0)));
  fl.forEach((l) => { JSON.parse(l); });
  if (fl[i132] !== nextLines[i132]) throw new Error('F-132 行读回不等');
  console.log(JSON.stringify(Object.assign(receipt, {
    post: {
      findings: { bytes: after.findings.length, sha16: sha16(after.findings), lines: fl.length },
      index: { bytes: after.index.length, sha16: sha16(after.index), rows: idxBack.evidence.length },
      summary: { bytes: after.summary.length, sha16: sha16(after.summary) },
    },
  }), null, 2));
}
