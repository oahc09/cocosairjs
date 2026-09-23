'use strict';
/**
 * r45j 台账收尾：verification-summary.md 追加 Addendum + evidence-index.json 追加第 82 行。
 * 纪律：写前锁（字节 + sha16，env 传入）；markdown 用「纯追加不变量」（去掉追加段必须还原前像）；
 *      JSON 用规范重序列化 + 历史行不变量；发布面数字一律现读，且必须与 r45j-publish-face-verify.log 回执一致。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const AUD = REPO + 'docs/audits/global-quality-audit-2026-09-19/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const LK = JSON.parse(process.env.R45J_LEDGER_PRE || '{}');
if (!LK.summary || !LK.index) throw new Error('必须提供 R45J_LEDGER_PRE={"summary":{bytes,sha16},"index":{bytes,sha16,rows}}');

/* ---------- 现读：本轮所有被引用的数字 ---------- */
const judge = JSON.parse(fs.readFileSync(AUD + 'raw/gates/r45j-reconcile-k.json', 'utf8'));
const negctl = JSON.parse(fs.readFileSync(AUD + 'raw/gates/negctl-summary.json', 'utf8'));
const pf = JSON.parse(fs.readFileSync(AUD + 'raw/gates/r45j-publish-face-verify.log', 'utf8'));
const mf = JSON.parse(fs.readFileSync(AUD + 'raw/gates/r45j-archive-manifest.json', 'utf8'));
const findings = fs.readFileSync(AUD + 'findings.jsonl');
const findingsLines = findings.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
const read = (p) => fs.readFileSync(REPO + p);
const F131 = read('test/smoke/smoke-30-v12-regression.test.ts').toString('utf8').includes("'v11chain-r45j'");
const jestLog = fs.readFileSync(AUD + 'raw/gates/r45j-jest-f131.log').toString('utf8');
const jestCounts = (jestLog.match(/Tests:\s+(\d+) skipped, (\d+) passed, (\d+) total/) || []).slice(1).map(Number);
if (jestCounts.length !== 3 || !/Test Suites: 1 passed/.test(jestLog)) throw new Error('F-131 门禁日志形态异常');
const docrefsRaw = fs.readFileSync(AUD + 'raw/gates/r45j-gates-after.log').toString('utf8');
const docrefs = JSON.parse(docrefsRaw.split('\n').filter((l) => l.trim().startsWith('{"ok":true,"docs"')).pop());
const docrefsExit = Number(docrefsRaw.match(/DOCREFS_EXIT=(\d)/)[1]);
if (docrefsExit !== 0 || docrefs.ok !== true) throw new Error('doc-refs 读数异常');
// 门禁读数一律取自 PIPESTATUS 正确取码的 r45j-gates-after.log（早前 `EXIT=$?` 跟在 `| tail` 后取的是 tail 的码 ⇒ 新陷阱 46）
const consumerTxt = fs.readFileSync(AUD + 'raw/gates/r45j-consumer-typecheck.log').toString('utf8');
const afterTxt = fs.readFileSync(AUD + 'raw/gates/r45j-gates-after.log').toString('utf8');
const consumerJson = JSON.parse(afterTxt.slice(afterTxt.indexOf('{\n  "ok"'), afterTxt.indexOf('CONSUMER_EXIT')));
const consumerExit = Number(afterTxt.match(/CONSUMER_EXIT=(\d)/)[1]);
const chainExit = Number(afterTxt.match(/CHAINFACE_EXIT=(\d)/)[1]);
const tscExit = Number(consumerTxt.match(/TSC_EXIT=(\d)/)[1]);
if (consumerExit !== 1 || chainExit !== 0) throw new Error(`门禁退出码与在册归因不符：consumer=${consumerExit} chain=${chainExit}`);
const chainLine = afterTxt.match(/^(\{"ok":.*"records".*)$/m);
if (!chainLine) throw new Error('未取到 chain-face JSON');
const chainJson = JSON.parse(chainLine[1]);
// 发布面现读 + 与回执逐字段一致（防「回执之后又有人改了发布面」）
for (const [p, key] of [['docs/acceptance-report-v12.md', 'accept'], ['docs/v12-owner-decisions.md', 'owner'], ['docs/evidence/v12/v11chain-r45j/README.md', 'readme']]) {
    const b = read(p);
    if (b.length !== pf.summary[key].bytes || sha16(b) !== pf.summary[key].sha16) throw new Error(`发布面与回执不一致：${p} 现读 ${b.length}/${sha16(b)} 回执 ${pf.summary[key].bytes}/${pf.summary[key].sha16}`);
}
const evDir = REPO + 'docs/evidence/v12/v11chain-r45j/';
const evJson = fs.readdirSync(evDir).filter((f) => f.endsWith('.json'));
const evRecords = evJson.reduce((a, f) => a + JSON.parse(fs.readFileSync(evDir + f, 'utf8')).results.length, 0);
const evPng = fs.readdirSync(evDir, { withFileTypes: true }).filter((e) => e.isDirectory()).reduce((a, d) => a + fs.readdirSync(evDir + d.name).filter((f) => f.endsWith('.png')).length, 0);

const videoNote = judge.notes.find((n) => n.includes('video-basic 诊断复跑'));
const audioNote = judge.notes.find((n) => n.includes('audio-basic 诊断复跑'));
if (!videoNote || !audioNote) throw new Error('判据 notes 缺 diag 复跑条目');
const A = {
    bytes: findings.length, sha: sha16(findings), rows: findingsLines.length,
    has133: findingsLines.some((r) => r.findingId === 'F-133'),
    has135: findingsLines.some((r) => r.findingId === 'F-135'),
    nonBlocking: findingsLines.filter((r) => /^F-13[345]$/.test(r.findingId)).every((r) => r.blocking === false),
};
if (!A.has133 || !A.has135 || !A.nonBlocking) throw new Error('F-133/134/135 未在册或 blocking 非 false');
const RED_CELLS = Object.keys(judge.cells).length;
const t = judge.totals;
// 成本现读：从批次 wrapper 时间戳 + 四腿记录数摊算（不手打）
const wrapper = read('docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-batch.out').toString('utf8');
const legStamps = [...wrapper.matchAll(/=== r45j (firefox|webkit) chunk-([AB]) start (\S+) ===/g)];
const doneAt = Date.parse(wrapper.match(/all legs done (\S+)/)[1]);
const legTotal = (doneAt - Date.parse(legStamps[0][3])) / 1000;
const legN = legStamps.reduce((a, m) => a + JSON.parse(read(`docs/evidence/v12/v11chain-r45j/v11-chain-${m[1]}-chunk${m[2]}.json`).toString('utf8')).results.length, 0);
const COST = (legTotal / legN).toFixed(1);

/* ---------- 阶段 1：只构造，不写盘（新陷阱 47：多文件写入必须「全部前置断言通过后才开始第一次写」且可重入） ---------- */
const SUM = AUD + 'verification-summary.md';
const IDX = AUD + 'evidence-index.json';
const sumCurrent = fs.readFileSync(SUM);
const sumText0 = sumCurrent.toString('utf8');
const ADD = `
## Addendum r45j-close（2026-09-23，零提交）：52 例三引擎对账的**簿记半边收口** —— 负控修好自己的假绿、三条 F 号落账、发布面三处当期化、F-131 先红后绿

1. **本轮主张**：r45j 的取证（41 例 × firefox/webkit 实采）已在上一段登记；本段只登记**收尾簿记**，不新增任何判定面改动。全程零 stage / 零 commit / 零 push。
2. **负控 6/10 → 10/10，根因在负控自身**：首轮四臂「未命中期望标记」。逐臂现读发现 \`r45j-negctl.cjs\` 在构造 \`ARMS\` 时**急求值** \`clone()\` ⇒ 共用同一源的多臂（N1/N3/N7 都改 \`v11-chain-firefox-chunkA.json\`）互相覆盖，注入层只剩最后一条。改为「臂内惰性物化 + 每臂独立子目录 + 注入必须与原件不同（no-op 即抛）+ 源必须在册」后 \`negctl-summary.json\` 现读 \`passCount ${negctl.passCount}/${negctl.arms}\`。**这是陷阱 40 的第二种失败形态**：上一轮是「注入键错配 ⇒ 全臂假绿」，这一轮是「注入彼此覆盖 ⇒ 部分臂假绿」；两次的共同征兆都是「判据没坏，取证工具坏了」。
3. **三条 F 号落账（纯追加）**：\`findings.jsonl\` 现读 **${A.rows} 行 / ${A.bytes.toLocaleString('en-US')} B / \`${A.sha}\`**（本轮前 132 行 / 415,620 B / \`d8c865ff1d6381ac\`，台账链见上一段登记的写前锁）。新增 **F-133**（runner 重试与 \`saveArtifact\` 固定同名互斥 ⇒ \`FAIL ∧ attempts=2\` 记录的截图与元数据不同源，\`v11-examples-verify.cjs:794-801\` × \`:193-197\`）、**F-134**（\`resource-released\` 只做长度差分 + 消息截 80 字符 ⇒ 示例序列内的异常被贴标「during release/reload」，与同记录 \`no-runtime-error=PASS\` 自相矛盾，\`:590\`、\`:609-611\`）、**F-135**（webkit \`video-basic\` P3 播控段间歇抛断，判据 diag 现读：\`${videoNote}\`；对照 \`${audioNote}\` ⇒ 前者间歇、后者结构性）。三条均 \`blocking:false\` 现读为真。
4. **归档**：\`raw/gates/\` 的 r45j 归档清单现读 **${mf.files.length} 件 / ${mf.totalBytes || mf.files.reduce((a, b) => a + b.bytes, 0).toLocaleString('en-US')} B**（六批：批次原件 → 发布面脚本与门禁日志 → F-131 日志与第二批脚本 → archive-4 → 受控替换 + 补档 → 归档脚本自身与末次只读门禁日志；两次原地覆盖均记 \`r45j-append-findings.cjs\`，其 \`previousSha256\` 与理由记在该条目上）。第二批之前先跑过只读回执 \`r45j-archive-3.cjs\` 的「既有条目逐条字节+哈希核对」，任何失配都不写盘。
5. **F-131 目录对账门禁：先红后绿（方向＝登记，不是放松）**：新目录 \`docs/evidence/v12/v11chain-r45j/\` 落盘后该用例转红（红态实测在案），把它加进 \`smoke-30\` 的 \`ACCOUNTED\` 白名单后 \`raw/gates/r45j-jest-f131.log\` 现读 \`Test Suites: 1 passed\`、\`Tests: ${jestCounts[0]} skipped, ${jestCounts[1]} passed, ${jestCounts[2]} total\`（\`-t 证据目录对账\` 单条）。同轮 \`verify:v11-chain-face\` 仍 \`ok:${chainJson.ok}\`（${chainJson.runPass}，\`${chainJson.fps}\` = 当期交付 bundle）——该门禁只管正典链，非正典目录入库不影响它。
6. **发布面三处当期化（写后现读，逐字段等于只读回执 \`raw/gates/r45j-publish-face-verify.log\` 的 ${pf.checks.length} 项全 OK）**：
   - \`docs/acceptance-report-v12.md\` **${pf.summary.accept.bytes.toLocaleString('en-US')} B / \`${pf.summary.accept.sha16}\`**（本轮前像 130,393 B / \`5d6148122ebc31b7\`，该前像由脚本 env 锁给出、**无 tee 原件**）；LV12-01 行末追加 r45j 段，并就地给旧句「29 例仍仅 chromium」打上作废标注（原文保留）。
   - \`docs/v12-owner-decisions.md\` **${pf.summary.owner.bytes.toLocaleString('en-US')} B / \`${pf.summary.owner.sha16}\`**（本轮前像 52,377 B / \`616b097d99eeb9c3\`，原件在 \`raw/gates/r45j-owner-decisions.log\`）；#15 追加 \`UPDATE-r45j\`：范围与成本两问按实测关闭（四腿 ${legN} 例·引擎 / ${(legTotal / 60).toFixed(0)} min ⇒ **≈${COST} s/例/引擎**，原估 17–18 min 兑现），只剩「落点 + 提交授权」，并把 **${RED_CELLS} 格 / ${new Set(Object.keys(judge.cells).map((k) => k.split('/').slice(1).join('/'))).size} 例**红格作为决策信息交给 owner（(b1) 只晋升 firefox／(b2) 需要 per-engine 已知红名单＝改判定语义，本会话不擅动／(b3) 建议默认＝维持非正典入库）。
   - \`docs/evidence/v12/v11chain-r45j/README.md\` **${pf.summary.readme.bytes.toLocaleString('en-US')} B / \`${pf.summary.readme.sha16}\`**：口径与边界、命令原件、结果账、逐格归因、F-133/134/135、逐文件字节+sha16、只读复核配方、「本批次未做」清单。生成器 \`r45j-readme.cjs\` 内置两条护栏：① 发布面若含仓库外绝对路径即拒绝写盘；② 受控重生成必须显式传入现件 sha16，否则拒绝覆盖。
7. **生成器自己被抓到两处错**（都属于「写文档时把没核过的话写进去」）：① 首版 README 把 \`NODE_PATH=E:/…\` 原样落进命令原件 ⇒ 撞发布面护栏，改指 \`<playwright 所在 node_modules>\`；② 首版把 \`[skip-promote]\` 说成逐例打印 ⇒ 现读 \`v11-examples-verify.cjs:809-815\` 与批次日志 \`skip-promote_lines_*=1\` 后订正为**每轮一次**（真实机制是 \`WRITES_CANONICAL\` 为假时整段跳过「证据晋级 + manifest 重生」）。
8. **改发布面后的门禁复跑（现读）**：\`verify:doc-refs\` → \`ok:${docrefs.ok}\`、docs ${docrefs.docs}、refsChecked ${docrefs.refsChecked}、baseline ${docrefs.baseline.entries}/${docrefs.baseline.hits}、unresolved ${docrefs.unresolvedCount}、stale ${docrefs.staleBaselineCount}；\`typecheck\` → \`TSC_EXIT=${tscExit}\`；\`verify:v11-chain-face\` 见第 5 条；\`verify:consumer\` → \`CONSUMER_EXIT=${consumerExit}\`，失败项**恰为 F-85 一条**（\`${consumerJson.failures[0]}\`），exportCount ${consumerJson.exportCount}、published-artifacts 4 markers × 2 bundles 0 fail。**该红不是本轮引入**：README.md:84（HEAD 内）已链到 \`docs/manual/index.md\`，而 \`package.json files[]\` 只有单层 \`docs/*.md\`/\`docs/*.json\` ⇒ 该文件根本不打进 tarball，HEAD 态即红 ⇒ 属 #12/#13/#14 同桌的发行姿态决策（是否把 \`docs/manual/\` 纳入发布面），本轮不擅改 \`files[]\`。
9. **一处存量债务现读入册（不新开 F 号，避免与 F-130/#17 重复计账）**：发布面文本中仍含仓库外 scratch 绝对路径的行数现读 = 验收报告 ${pf.scratchLines.acceptTotal} 行 / 待批面 ${pf.scratchLines.ownerTotal} 行，**本轮插入段为 ${pf.scratchLines.r45jSegAccept} / ${pf.scratchLines.r45jSegOwner} 行、新 README 为 ${pf.scratchLines.readme} 行**（即：本轮零新增，存量属 F-130 一族「收件人无法解析的指针」）。另现读一处结构性事实：\`docs/acceptance-report-v12.md\`、\`docs/v12-owner-decisions.md\`、\`test/smoke/smoke-30-v12-regression.test.ts\`、本批证据目录在 git 中均为 **UNTRACKED** ⇒ 发布面目前只存在于工作树，#12/#13 的提交授权未落地前，任何「已入库」表述都只到「工作树在册」为止。
10. **证据目录现读**：${evJson.length} 份 JSON / ${evRecords} 条记录 / ${evPng} 张 PNG，与 README 文件清单同口径；三引擎对账 \`hard ${judge.hardCount} / stale ${judge.staleCount} / attributed ${judge.attributedCount}\`、${t.chromium.pass}/${t.chromium.pass + t.chromium.fail}（chromium）、${t.firefox.pass}/${t.firefox.pass + t.firefox.fail}（firefox）、${t.webkit.pass}/${t.webkit.pass + t.webkit.fail}（webkit）、三引擎同绿 ${judge.threeEnginePass}/52。
11. **本轮新陷阱（42–47，共六条，全部可迁移）**：**42** 负控臂的副本若在构造期急求值 ⇒ 同源多臂互相覆盖，注入彼此串味（修：惰性 + 每臂独立目录 + no-op 注入即抛）；**43** 在 JS 模板字面量里写 markdown 反引号必须先转义，否则整脚本在 \`node --check\` 阶段就抛语法错（本轮三次触发：待批面补丁、台账追加脚本首版、以及**本条自身**——写下「必须先转义」这句时又漏了一处转义，\`node --check\` 当场挡下）；**44** 漏 tee 的运行日志**不得编造或事后伪造**，改以「可复跑的只读回执」替代并写清缺口（本轮 \`r45j-publish-face-verify.cjs\` 即为此写）；**45** 归因前先读 mtime：我先断言「批次 wrapper 报错是因为我边跑边改脚本」，mtime 现读（保存 04:56:12Z 早于启动 04:56:21Z）直接证伪 ⇒ 该解释删除，只保留可核事实，成因标注为「未钉死」；**46** 门禁日志里 \`echo "EXIT=$?"\` 紧跟在 \`cmd | tail\` 之后取的是 **\`tail\` 的退出码** ⇒ 本会话首版 \`r45j-consumer-chainface.log\` 把 \`verify:consumer\` 误记为 EXIT=0（真实为 1，F-85 在册）。该原件保留不改写，正确读数在 \`raw/gates/r45j-gates-after.log\`（取 \`\${PIPESTATUS[0]}\`）。凡以日志作证，先确认退出码取法。**47** 一个脚本写多个文件时，**任何**前置断言都必须排在**第一次写盘之前**，否则中途抛出会留下「半应用」态（本轮真实发生：summary 已追加、index 未追加，重跑又被写前锁挡下）；修法不是关掉锁，而是 ① 把 index 侧全部断言（锁/规范形态/历史行不变量/raw[] 在册/重序列化）上移到写盘前，② 给已应用侧加可重入分支（\`endsWith(ADD)\` ⇒ 反推前像并核对锁 ⇒ 跳过写盘），③ 归档 note 之类的「字符串追加」也要有重复应用守卫。
12. **归档计数让给现读**：\`raw/gates\` 目录件数以 \`ls | wc -l\` 现读为准（本条写盘时 r45j 清单为 ${mf.files.length} 件）；本条不写自身写盘后的终值（陷阱 39）。
`;
/* ---- 1a) summary：可重入解析（按 Addendum 标题锚点判定「已应用」⇒ 复原前像、核对锁、跳过写盘） ---- */
const MARK = '## Addendum r45j-close';
let sumText;
let ADD_MATCHES_APPLIED = true;
const sumAt = sumText0.indexOf(MARK);
const sumAlreadyApplied = sumAt >= 0;
if (sumAlreadyApplied) {
    const restored = sumText0.slice(0, sumAt - 1);
    if (Buffer.byteLength(restored, 'utf8') !== LK.summary.bytes || sha16(Buffer.from(restored, 'utf8')) !== LK.summary.sha16) throw new Error(`summary 已应用但前像不复原：现读 ${sumCurrent.length}/${sha16(sumCurrent)}，期望前像 ${LK.summary.bytes}/${LK.summary.sha16}`);
    if (sumText0[sumAt - 1] !== '\n') throw new Error('Addendum 锚点前非换行 ⇒ 锚点位置异常');
    sumText = restored;
    const appliedSection = sumText0.slice(sumAt);
    if (appliedSection.slice(0, appliedSection.indexOf('\n')) !== ADD.replace(/^\n+/, '').split('\n')[0]) throw new Error('已应用段的标题行与本脚本 ADD 不符 ⇒ 可能是他人段落，停');
    ADD_MATCHES_APPLIED = appliedSection === ADD.slice(1);
} else {
    if (sumCurrent.length !== LK.summary.bytes || sha16(sumCurrent) !== LK.summary.sha16) throw new Error(`summary 锁不匹配：${sumCurrent.length}/${sha16(sumCurrent)}`);
    sumText = sumText0;
    if (!(sumText + ADD).startsWith(sumText)) throw new Error('summary 非纯追加');
}

/* ---- 1b) index：写盘前的全部断言（一处不过 ⇒ 本轮零写入） ---- */
const idxBefore = fs.readFileSync(IDX);
if (idxBefore.length !== LK.index.bytes || sha16(idxBefore) !== LK.index.sha16) throw new Error(`index 锁不匹配：${idxBefore.length}/${sha16(idxBefore)}`);
const t0 = idxBefore.toString('utf8');
if (JSON.stringify(JSON.parse(t0), null, 2) + '\n' !== t0) throw new Error('index 非规范形态');
const j = JSON.parse(t0);
if (j.evidence.length !== LK.index.rows) throw new Error(`index 行数 ${j.evidence.length} != ${LK.index.rows}`);
const history = JSON.stringify(j.evidence);
const ROW = {
    id: 'V11-CHAIN-52-EXAMPLES-THREE-ENGINE-R45J',
    findings: ['F-133', 'F-134', 'F-135', 'F-131', 'F-100', 'F-132', 'F-85'],
    createdBy: `r45j（2026-09-23 04:56–05:46Z 采集，收尾簿记至当日；LV12-01 待批 #15 选项 (b) 全量口径的非正典铺开：余下 41 例 × {firefox, webkit} + 52 例三引擎对账，零改判定阈值/契约/源码/产物）`,
    status: `ADMITTED — 证据与文档已入库为工作树文件（未提交，提交需 #12/#13 授权）；LV12-01 第三格由「23/52 有三引擎证据」推进为「**52 例 V1.1 链三引擎已铺满，${judge.threeEnginePass}/52 同绿**」，本格仍不翻绿：非正典捕获 ≠ 晋升，且 ${RED_CELLS} 格红需 owner 决策（见 #15 UPDATE-r45j 的 (b1)/(b2)/(b3)）`,
    raw: [
        'raw/gates/r45j-batch.sh', 'raw/gates/r45j-batch.out', 'raw/gates/r45j-exits.txt',
        'raw/gates/r45j-firefox-chunkA-garbage.log', 'raw/gates/r45j-firefox-chunkA.log', 'raw/gates/r45j-firefox-chunkB.log',
        'raw/gates/r45j-webkit-chunkA.log', 'raw/gates/r45j-webkit-chunkB.log',
        'raw/gates/r45j-mesh-torus-firefox.log', 'raw/gates/r45j-mesh-torus-webkit.log',
        'raw/gates/r45j-webkit-determinism.sh', 'raw/gates/r45j-webkit-determinism.log', 'raw/gates/r45j-webkit-determinism.out',
        'raw/gates/r45j-videobasic-wk-repro.log',
        'raw/gates/r45j-reconcile.cjs', 'raw/gates/r45j-reconcile.json',
        'raw/gates/r45j-reconcile-k.cjs', 'raw/gates/r45j-reconcile-k.json', 'raw/gates/r45j-reconcile-k-pre.log', 'raw/gates/r45j-reconcile-k-final.log',
        'raw/gates/r45j-negctl.cjs', 'raw/gates/r45j-negctl.log', 'raw/gates/negctl-summary.json',
        'raw/gates/r45j-append-findings.cjs', 'raw/gates/r45j-verify-findings.cjs', 'raw/gates/r45j-verify-findings.log',
        'raw/gates/r45j-readme.cjs', 'raw/gates/r45j-accept-patch.cjs', 'raw/gates/r45j-owner-decisions-patch.cjs', 'raw/gates/r45j-owner-decisions.log',
        'raw/gates/r45j-publish-face-verify.cjs', 'raw/gates/r45j-publish-face-verify.log',
        'raw/gates/r45j-jest-f131.log', 'raw/gates/r45j-docrefs-after.log', 'raw/gates/r45j-consumer-chainface.log', 'raw/gates/r45j-consumer-typecheck.log',
        'raw/gates/r45j-gates-after.log', 'raw/gates/r45j-docrefs-final.log',
        'raw/gates/r45j-archive.cjs', 'raw/gates/r45j-fix-archive.cjs', 'raw/gates/r45j-archive-2.cjs', 'raw/gates/r45j-archive-3.cjs', 'raw/gates/r45j-archive-4.cjs', 'raw/gates/r45j-fix-archive-5.cjs', 'raw/gates/r45j-archive-6.cjs', 'raw/gates/r45j-archive-manifest.json',
    ],
    readings_r45j: {
        capture: `${evJson.length} 份 JSON / ${evRecords} 条记录 / ${evPng} 张 PNG 落 docs/evidence/v12/v11chain-r45j/（非正典、[skip-promote] 每轮一次、正典三件套零回写）；candidateFingerprint 逐条 ${judge.table[Object.keys(judge.table)[0]].chromium.candFp} = 当期交付 bundle`,
        threeEngine: `判据 raw/gates/r45j-reconcile-k.cjs EXIT=0：hard ${judge.hardCount} / stale ${judge.staleCount} / attributed ${judge.attributedCount} ⇒ chromium ${t.chromium.pass}/${t.chromium.pass + t.chromium.fail}（apiProof ${t.chromium.verified}/${t.chromium.attested}/${t.chromium.unproven}）、firefox ${t.firefox.pass}/${t.firefox.pass + t.firefox.fail}（${t.firefox.verified}/${t.firefox.attested}/${t.firefox.unproven}，与 chromium 逐字段相等）、webkit ${t.webkit.pass}/${t.webkit.pass + t.webkit.fail}（${t.webkit.verified}/${t.webkit.attested}/${t.webkit.unproven}）；三引擎同绿 ${judge.threeEnginePass}/52`,
        redCells: Object.entries(judge.cells).map(([k, v]) => `${k}＝${v.why}`),
        cost: '四腿 80 例·引擎 / 1,130 s ⇒ ≈14.1 s/例/引擎（分腿 12.8/13.5/15.5/14.7，口径＝相邻腿启动时刻之差 ÷ 该腿记录数，现读自 raw/gates/r45j-batch.out 时间戳）；#15 原估「≈63 s/例/引擎」是 2 例摊不开一次性开销的上限，自本轮起停止引用；r45i 的 ≈19 s 同数量级',
        negctl: `passCount ${negctl.passCount}/${negctl.arms} 全 OK。首轮 6/10 的根因在负控自身：ARMS 构造期急求值 clone() ⇒ 共用同一源的多臂互相覆盖；改惰性物化 + 每臂独立子目录 + no-op 注入即抛后收敛（新陷阱 42，与陷阱 40 同族第二种形态）`,
        findings: `findings.jsonl 现读 ${A.rows} 行 / ${A.bytes} B / ${A.sha}（本轮前 132 行 / 415,620 B / d8c865ff1d6381ac）；新增 F-133/F-134/F-135，三条 blocking 现读全 false；纯追加不变量由 r45j-verify-findings.cjs 逐行回读复算（丢弃末 3 行必须还原前像）`,
        publishFace: `acceptance-report ${pf.summary.accept.bytes} B/${pf.summary.accept.sha16}（前像 130,393/5d6148122ebc31b7，无 tee 原件 ⇒ 由 r45j-publish-face-verify 只读回执替代）· owner-decisions ${pf.summary.owner.bytes} B/${pf.summary.owner.sha16}（#15 UPDATE-r45j）· 证据 README ${pf.summary.readme.bytes} B/${pf.summary.readme.sha16}`,
        gatesAfter: `typecheck EXIT=${tscExit} · smoke-30「证据目录对账」1 passed/${jestCounts[2]} total（F-131 先红后绿）· verify:v11-chain-face ok:${chainJson.ok} ${chainJson.runPass} fps ${chainJson.fps} · verify:doc-refs ok:${docrefs.ok} docs ${docrefs.docs} refs ${docrefs.refsChecked} baseline ${docrefs.baseline.hits}/${docrefs.baseline.entries} unresolved ${docrefs.unresolvedCount} stale ${docrefs.staleBaselineCount}（台账写盘后又复跑一次：DOCREFS_EXIT=0、同 118/1087/31，见 raw/gates/r45j-docrefs-final.log）· verify:consumer EXIT=${consumerExit}，失败项恰为 F-85 一条（README→docs/manual/index.md 不在 tarball；HEAD 态即红，非本轮引入），exportCount ${consumerJson.exportCount}`,
        debtObserved: `发布面含仓库外 scratch 路径的行数现读：验收报告 ${pf.scratchLines.acceptTotal} / 待批面 ${pf.scratchLines.ownerTotal}，本轮插入段 ${pf.scratchLines.r45jSegAccept}/${pf.scratchLines.r45jSegOwner}、新 README ${pf.scratchLines.readme} ⇒ 本轮零新增，存量归 F-130/#17 一族。另：acceptance-report / owner-decisions / smoke-30 / 本批证据目录在 git 中均 UNTRACKED ⇒「入库」只到「工作树在册」为止`,
        archive: `raw/gates 的 r45j 归档清单现读 ${mf.files.length} 件 / ${(mf.totalBytes || mf.files.reduce((a, b) => a + b.bytes, 0))} B（六批：批次原件 → 发布面脚本与门禁日志 → F-131 日志 + 第二批脚本 → archive-4 → 受控替换 append-ledger 归档件 + 补档 archive-4 脚本 → archive-5/archive-6 脚本与本行写盘前的最后一份只读门禁日志；两次原地覆盖均记 previousSha256 + 理由，其余条目每批写盘前逐条字节+哈希复核）`,
        notClaimed: '不主张：晋升、覆写正典、#15/#21 已批复、webkit 已绿、build-dts 已复现。mesh-sphere 的并行 NC 注入本会话未代撤。',
    },
    commands: [
        { cmd: 'NODE_PATH=<playwright 所在 node_modules> node tools/verify/v11-examples-verify.cjs --ids=<chunk-A 21 例 / chunk-B 19 例 / mesh-torus> --browser=firefox|webkit --out=docs/evidence/v12/v11chain-r45j/... --artifact-dir=...', exit: '0/1/1/1', shows: '四腿 EXIT 语义＝该腿有无 FAIL 记录（:820），writeEvidence 仍 completed:true；[skip-promote] 每轮一次；缺 NODE_PATH 时首跑产 0/21 垃圾捕获（raw/gates/r45j-firefox-chunkA-garbage.log 保留、勿当结果）' },
        { cmd: 'node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.cjs', exit: 0, shows: `hard ${judge.hardCount}/stale ${judge.staleCount}/attributed ${judge.attributedCount} + 52 例逐格三引擎表（含每格读取层自报）` },
        { cmd: 'node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-negctl.cjs', exit: 0, shows: `10 臂全 OK（含阳性对照、反空转、注入自证、白格只豁免在册形态四臂专证）` },
        { cmd: 'node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-verify-findings.cjs && node docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-publish-face-verify.cjs', exit: 0, shows: `台账纯追加复原证明 + 发布面 ${pf.checks.length} 项只读回执（本轮未 tee 的写入 stdout 以可复跑回执替代，不编造日志）` },
        { cmd: 'R45J_LEDGER_PRE=<写前锁 JSON> node E:/AIProMax/cocosair-scratch/db-probe/r45j-append-ledger.cjs | tee E:/AIProMax/cocosair-scratch/v12-logs/r45j-append-ledger.log', exit: 0, shows: '本行与 verification-summary 的 Addendum 同轮落盘；首次运行在写完 summary 后因 raw[] 引用未归档件抛出 ⇒ 留下半应用态，重构为「前置断言全过再写盘 + 可重入」后重跑，summary 走 alreadyApplied 分支只补 index（新陷阱 47）。写后值一律现读，本行不自写终值。' },
    ],
    result: `LV12-01 的 V1.1 链三引擎取证面铺满（52 例 × 三引擎，${judge.threeEnginePass}/52 同绿，红格逐个归因 + 活体现读前提）；配套三条 runner/示例缺陷入册（F-133/134/135）；F-131 目录对账门禁由红转绿；发布面三处当期化并复跑四条相关门禁`,
    note: `本格只主张「这 52 例今天确实在三引擎上各跑过、证据互相自洽且与当期交付字节同货币」，不主张晋升。台账链：上一行 R45I 的写后值 = 本行写前锁（${LK.index.bytes} B / ${LK.index.sha16} / ${LK.index.rows} 行）⇒ 本行写盘后的当期值一律现读（陷阱 39：本行不得写自身终值）。`,
};
if (j.evidence.some((e) => e.id === ROW.id)) throw new Error('重复 id');
const j2 = JSON.parse(t0);
j2.evidence.push(ROW);
if (JSON.stringify(j2.evidence.slice(0, LK.index.rows)) !== history) throw new Error('历史行被改动');
const idxAfter = JSON.stringify(j2, null, 2) + '\n';
if (JSON.stringify(JSON.parse(idxAfter), null, 2) + '\n' !== idxAfter) throw new Error('index 规范重序列化失败');
for (const p of ROW.raw) if (!fs.existsSync(AUD + p)) throw new Error('raw[] 有文件不在盘：' + p);

/* ---- 2) 断言全通过后才开始写盘 ---- */
let sumBack;
if (sumAlreadyApplied) {
    sumBack = sumCurrent;
} else {
    const sumAfter = sumText + ADD;
    fs.writeFileSync(SUM, Buffer.from(sumAfter, 'utf8'));
    sumBack = fs.readFileSync(SUM);
    if (sumBack.length !== Buffer.byteLength(sumAfter, 'utf8')) throw new Error('summary 写后字节不符');
    if (sumBack.toString('utf8').slice(0, sumText.length) !== sumText) throw new Error('summary 写后前像不复原');
}
fs.writeFileSync(IDX, Buffer.from(idxAfter, 'utf8'));
const idxBack = fs.readFileSync(IDX);
if (idxBack.length !== Buffer.byteLength(idxAfter, 'utf8') || sha16(idxBack) !== sha16(Buffer.from(idxAfter, 'utf8'))) throw new Error('index 落盘回读不符');
if (JSON.parse(idxBack.toString('utf8')).evidence.length !== LK.index.rows + 1) throw new Error('index 行数不符');
console.log(JSON.stringify({
    ok: true,
    summary: { alreadyApplied: sumAlreadyApplied, addTextMatchesApplied: ADD_MATCHES_APPLIED, bytesBefore: LK.summary.bytes, shaBefore: LK.summary.sha16, bytesAfter: sumBack.length, shaAfter: sha16(sumBack), delta: sumBack.length - LK.summary.bytes },
    index: { bytesBefore: idxBefore.length, shaBefore: sha16(idxBefore), bytesAfter: idxBack.length, shaAfter: sha16(idxBack), rowsBefore: LK.index.rows, rowsAfter: JSON.parse(idxBack.toString('utf8')).evidence.length, rawChecked: ROW.raw.length },
}, null, 2));
