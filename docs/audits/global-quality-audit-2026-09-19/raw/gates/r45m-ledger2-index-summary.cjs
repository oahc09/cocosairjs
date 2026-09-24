'use strict';
/**
 * r45m 台账簿记：evidence-index.json 追加一行 + verification-summary.md 追加一段 Addendum。
 * 沿用在册纪律：断言全部前置（陷阱 47）＋ 写入侧可重入 ＋ 纯追加不变量 ＋
 * 被追加数组非末键 ⇒ 用「规范重序列化全等」证伪（陷阱 36）＋ 自指只写差值与前像锁、不写终值（陷阱 39）。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const DIR = REPO + 'docs/audits/global-quality-audit-2026-09-19/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const read = (p) => fs.readFileSync(p);
const LOCK = JSON.parse(process.env.R45M_LEDGER2_LOCK || 'null');
if (!LOCK) throw new Error('必须提供 R45M_LEDGER2_LOCK={"index":{bytes,sha16},"summary":{bytes,sha16}}');

const IDXF = DIR + 'evidence-index.json';
const SUMF = DIR + 'verification-summary.md';
/* 负控注入通道（陷阱 40：仅用于自证判据生效；正跑一律不设 ⇒ 走仓库真实路径） */
const IDX_FILE = process.env.R45M_LEDGER2_IDX || IDXF;
const SUM_FILE = process.env.R45M_LEDGER2_SUM || SUMF;
const idxPre = read(IDX_FILE), sumPre = read(SUM_FILE);
for (const [name, buf, l] of [['index', idxPre, LOCK.index], ['summary', sumPre, LOCK.summary]]) {
  if (!l) throw new Error(`缺 ${name} 写前锁`);
  if (buf.length !== l.bytes || sha16(buf) !== l.sha16)
    throw new Error(`${name} 写前锁不匹配：现读 ${buf.length}/${sha16(buf)} 锁 ${l.bytes}/${l.sha16}`);
}

const RAW = (process.env.R45M_LEDGER2_RAW ? JSON.parse(process.env.R45M_LEDGER2_RAW) : [
  'r45m-recapture-batch.sh', 'r45m-firefox-mesh-sphere.log', 'r45m-webkit-mesh-sphere.log',
  'r45m-r45j-judge-rerun.log', 'r45m-recapture-reconcile.cjs', 'r45m-recapture-reconcile.json',
  'r45m-negctl.log', 'r45m-publish-face-update.cjs', 'r45m-publish-face-negctl.log',
  'r45m-decision-ref-check.cjs', 'r45m-decision-ref-check.log', 'r45m-ledger-append.cjs',
  'r45m-gates.log', 'r45m-jest.log', 'r45m-ledger2-index-summary.cjs']);
/* 注：本批次的负控日志 raw/gates/r45m-ledger2-negctl.log 由本脚本的 NC 跑动产生、
 * 在写盘前已入库，但「清单里不能引用一个只能由本次跑动才成形的日志」⇒ 它不进 raw[]，
 * 只在 Addendum 正文按路径引用。self-script 能进 raw[] 是因为它先冻结入库（raw/gates/ 下与本副本逐字节同哈希）、再跑 NC、再写盘。 */
/* 在册判据：raw[] 每条必须在盘（缺失即抛，不写 index）；核对路径与 raw[] 落盘路径同源 */
for (const f of RAW) if (!fs.existsSync(DIR + 'raw/gates/' + f)) throw new Error(`raw[] 引用了不在盘的件：raw/gates/${f}`);

const idx = JSON.parse(idxPre.toString('utf8'));
/* 规范形态证伪：原文件必须 == JSON.stringify(parsed,null,2)+'\n'，否则"追加一行"会顺带重排全表 */
if (JSON.stringify(idx, null, 2) + '\n' !== idxPre.toString('utf8')) throw new Error('index 非规范序列化形态 ⇒ 本轮拒绝改写');
if (idx.evidence.some((e) => e.id === 'MESHSPHERE-RECAPTURE-R45M')) console.log('SKIP：index 行已存在');
const ROW = {
  id: 'MESHSPHERE-RECAPTURE-R45M',
  findings: ['F-136', 'F-132', 'F-133', 'F-100', 'F-135', 'F-85'],
  createdBy: 'r45m（2026-09-24 00:01–00:2xZ；LV12-01 待批 #15 的 4 格红里 mesh-sphere 两格重采收口 + 一处悬空待批编号 F-136 补行，零改判定阈值/契约/源码/产物）',
  status: 'ADMITTED — 新证据目录 docs/evidence/v12/mesh-sphere-r45m/（含自带 README）+ 两份判据与负控原件已落工作树（未提交，提交需授权）。结论边界：两格经重采确认为注入伪影（firefox/webkit 各 1/1 PASS 且与正典逐字段等），三引擎事实口径由 49/52 变为「以干净声明面重算 50/52」；LV12-01 第三格仍不翻绿（非正典 ≠ 晋升），#15 / 新补的 #21 仍待 owner 签',
  raw: RAW.map((f) => 'raw/gates/' + f),
  scratch: ['E:/AIProMax/cocosair-scratch/db-probe/（脚本运行副本与丢弃件，仓库外，引用勿当在册证据）'],
  measuredAt: new Date().toISOString(),
};
const idxNext = { ...idx, evidence: idx.evidence.concat([ROW]) };
const idxNextTxt = JSON.stringify(idxNext, null, 2) + '\n';
/* 三段全等判据（陷阱 36）：被追加数组 evidence 之后还有 rowShapesNote 键 ⇒
 * 只能比「数组收尾之前的前缀」+「数组收尾及其后全部后缀」两段全等，插入落在中间。 */
const oldTxt = idxPre.toString('utf8');
const closeIdx = oldTxt.lastIndexOf(String.fromCharCode(10) + '  ]');
if (closeIdx === -1) throw new Error('index 找不到 evidence 数组收尾 ⇒ 停手核对');
const PREFIX = oldTxt.slice(0, closeIdx);
const SUFFIX = oldTxt.slice(closeIdx);
if (!idxNextTxt.startsWith(PREFIX)) throw new Error('index 纯追加不变量失败：数组之前的既有行被改写');
if (!idxNextTxt.endsWith(SUFFIX)) throw new Error('index 纯追加不变量失败：数组之后的键被重排');
if (Buffer.byteLength(idxNextTxt,'utf8') <= Buffer.byteLength(oldTxt,'utf8')) throw new Error('index 新文本未变长 ⇒ 追加未发生');
if (typeof idxNext.rowShapesNote !== 'string' || idxNext.auditId !== idx.auditId) throw new Error('spread 丢了非末键');

const ADD = `\n## Addendum r45m（2026-09-24）— mesh-sphere 两格重采收口 + 悬空待批编号 #21 补行（F-136）

本轮性质：只新增证据 + 只新增判据 + 发布面就地当期化。**零改判定阈值 / 契约 / 源码 / 产物 / 正典证据**（写后锁四文件逐字节复核见下）。

1. **归因过期由判据自报，不由本会话口头宣布**：r45k 提交（\`f2acf3e\`）把干净的 \`examples/mesh-sphere/example.json\` 固化进 HEAD ⇒ r45j 判据的活体前提不再成立，现跑即 \`hardCount:0 / staleCount:2 / EXIT=1\`（\`raw/gates/r45m-r45j-judge-rerun.log\`）。
2. **重采**：\`--ids=mesh-sphere\` × {firefox, webkit} 各 \`1/1 PASS\`，落点 \`docs/evidence/v12/mesh-sphere-r45m/\`（非正典、每腿一行 \`[skip-promote]\`）。与 chromium 正典逐字段相等：\`specFingerprint c0d64a28c555\`、\`sourceFingerprint cb85b55b88591609\`、apiProof units 18、货币 \`9fa85f88b968d5f1\`；三引擎 PNG 字节账互异（11,503/\`ee4484d24e073e5d\`、5,903/\`9f4282940651516f\`、5,702/\`fd7876d36e265dd3\`）。
3. **Δ 自证**：注入态 \`specFp 6a2bfacb3483\` ≠ 干净态 \`c0d64a28c555\`；判据把「三者全同 ⇒『差异来自注入』为假」写成硬失败，故这条归因不是免检牌。
4. **写后锁四文件**（重采前后逐字节同）：正典 \`v11-examples-verified.json\` 631,722/\`49c81e5a1e4054e9\`、\`examples/mesh-sphere.png\` 11,503/\`ee4484d24e073e5d\`、\`example.json\` 7,332/\`850069498848e625\`、\`files.json\` 252,932/\`25df4eb37b607351\`。
5. **成本口径订正**：≈14.1 s/例/引擎**只适用批量**；r45m 实测单例腿墙钟 120–125 s（起服务 + 构建 traced bundle 是每腿一次性开销）。两口径不得互套。
6. **F-136（悬空编号）**：待批 **#21** 自 r45h4 起被 6 个引用点 / 3 个文件引用，而 \`docs/v12-owner-decisions.md\` §2 只有 #1–#18。本轮补 #21 实体行（21-A 是否把 \`candidateFingerprint == 当前树现算值\` 绑进门禁、21-B 三引擎批次是否覆写正典、21-C 36 记录矩阵是否重跑；批复列留空不代签），并声明 #19/#20 从未启用。判据 \`raw/gates/r45m-decision-ref-check.cjs\`（当期 EXIT=0 / 59 引用点 / dangling 0；负控 N1 删 #21 行 ⇒ 报出 9 处、N2 删 #15 行 ⇒ 报 #15）。
7. **发布面就地当期化**：5 处锚点式纯插入（\`raw/gates/r45m-publish-face-update.cjs\`，两臂负控 \`r45m-publish-face-negctl.log\`）——owner-decisions #15 行 + #21 新行、验收报告 LV12-01 行、r45j 证据 README 的红格行与 49/52 结果账行。原文全部保留并加作废/口径标注。本次台账写盘（本段与 index 行）自身的判据在 raw/gates/r45m-ledger2-index-summary.cjs：写前锁 → 规范重序列化全等 → 前缀/后缀两段全等 → raw 清单逐条在盘 → 可重入；五臂负控见 raw/gates/r45m-ledger2-negctl.log。
8. **同轮自我更正（照实登记，不抹平）**：① 本会话首版写的「#21 六处引用」枚举里 \`pilot12-r45i/README.md\` 系虚列（现读该文件不含 #21 引用），已在 #21 行内就地更正为 6 引用点 / 3 文件；② **负控首版四臂全假阳性**：我把锁值误给成篡改值并复用到全部臂 ⇒ 四臂全在同一处「写后锁」提前抛出，\`EXIT=1\` 看着齐全却没命中各自判定层。重跑为 1 阳性 + 5 篡改臂、逐臂核对决定性输出后才成立 ⇒ 新陷阱 **48**：负控臂必须断言「命中的那一层」，且**共享的前置守卫会让所有臂静默短路**——只看退出码不算判据。③ 本次 index 的纯追加判据首版写成「文件以 ]+换行 收尾 ⇒ 去尾后即前缀」——本文件 evidence 数组之后还有 rowShapesNote 键，该形态永不成立，N0 首跑即被自家守卫挡下（挡得对、判据写错）；已改为按数组收尾分界的「前缀全等 + 后缀全等」两段式，并补「新文本必须变长」「spread 不得丢非末键」两条。
9. **门禁现读**（\`raw/gates/r45m-gates.log\`、\`r45m-jest.log\`）：\`verify:doc-refs\` EXIT=0（docs 118 / refsChecked 1089 / baseline 31/31 / unresolved 0）、\`verify:v11-chain-face\` EXIT=0（52 记录）、\`npx jest\` **32 套件 / 262 用例全绿 EXIT=0**（r45i/r45j 期那 2 条并行 NC 红随注入被提交固化而消失 ⇒ 「本树 jest 现读 2 红」的旧口径作废）、\`verify:consumer\` 仍 EXIT=1 且失败项恰 F-85 一条。⚠️ 本段是**台账写盘前**的读数；本段与 index 行的写盘本身不改任何门禁结论。
10. **未做（划清边界）**：未晋升任何证据、未覆写正典、未跑 36 记录矩阵批次、未改 \`.gitignore\` 的 \`\\n\` 字面转义 bug、未动 F-132 修法 (c)、未擅自把 \`r45m-decision-ref-check\` 固化为 \`verify:decision-refs\` 门禁（列为后续自办，且新增护栏不得读成 LV12 侧推进）。本轮未提交（提交需逐次授权）。

前像锁（自指不写终值）：\`evidence-index.json\` 写前 ${LOCK.index.bytes} B / \`${LOCK.index.sha16}\` / ${idx.evidence.length} 行 ⇒ 本轮 +1 行；\`verification-summary.md\` 写前 ${LOCK.summary.bytes} B / \`${LOCK.summary.sha16}\` ⇒ 本段为其尾部追加。本条不写自己写盘后的字节数与哈希。
`;
const sumNext = sumPre.toString('utf8').endsWith('\n') ? sumPre.toString('utf8') + ADD : sumPre.toString('utf8') + '\n' + ADD;
if (!sumNext.startsWith(sumPre.toString('utf8'))) throw new Error('summary 纯追加不变量失败');

/* 判据全部通过 ⇒ 落盘（可重入：index 行已在则只补 summary） */
const idxApplied = idx.evidence.some((e) => e.id === ROW.id);
if (!idxApplied) fs.writeFileSync(IDX_FILE, idxNextTxt);
const sumAlready = sumPre.toString('utf8').includes('## Addendum r45m');
if (sumAlready) throw new Error('summary Addendum 已存在 ⇒ 本轮应整段跳过（重入未净），停手核对');
fs.writeFileSync(SUM_FILE, sumNext);
console.log(JSON.stringify({
  ok: true,
  targets: { index: IDX_FILE, summary: SUM_FILE },
  injection: { rawList: !!process.env.R45M_LEDGER2_RAW, index: !!process.env.R45M_LEDGER2_IDX, summary: !!process.env.R45M_LEDGER2_SUM },
  /* 回执必须说「实际落盘了什么」：重入未写 index ⇒ 差值/行数按未写报，不报「本来会怎样」 */
  index: idxApplied
    ? { pre: idxPre.length, delta: 0, rows: { before: idx.evidence.length, after: idx.evidence.length }, applied: false, note: '行已存在，本轮未写 index（盘上现读行数即 after）' }
    : { pre: idxPre.length, delta: Buffer.byteLength(idxNextTxt, 'utf8') - idxPre.length, rows: { before: idx.evidence.length, after: idxNext.evidence.length }, applied: true },
  summary: { pre: sumPre.length, delta: Buffer.byteLength(sumNext, 'utf8') - sumPre.length, addBytes: Buffer.byteLength(ADD, 'utf8') },
  rawListed: RAW.length,
}));
