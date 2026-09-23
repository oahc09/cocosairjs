'use strict';
/**
 * r45j 发布面补丁：docs/acceptance-report-v12.md 的 LV12-01 格
 *   ① 就地标记上一轮「29 例仅 chromium」的覆盖账作废（不删原文，防引用旧数字）
 *   ② 追加 r45j 更新块
 * 纪律：预镜像字节/sha16 锁 + 每锚点命中数断言 + 纯插入判据（删掉插入文本必须逐字节还原）+ 写后回读。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const FILE = REPO + 'docs/acceptance-report-v12.md';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const before = fs.readFileSync(FILE);
const EXPECT = JSON.parse(process.env.R45J_ACCEPT_PRE || '{}');
if (EXPECT.bytes && (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16)) {
    throw new Error(`预镜像锁不匹配：现读 ${before.length}B/${sha16(before)} != 登记 ${EXPECT.bytes}B/${EXPECT.sha16} ⇒ 有并行写入，先复核`);
}
if (!EXPECT.bytes) throw new Error('必须通过 R45J_ACCEPT_PRE 提供 {bytes,sha16} 预镜像锁');
const text = before.toString('utf8');

const ANCHOR_STALE = '两两不相交（实测交集为空）。';
const ANCHOR_END = '明细与边界 `docs/evidence/v12/pilot12-r45i/README.md`。 |';
const count = (hay, needle) => hay.split(needle).length - 1;
if (count(text, ANCHOR_STALE) !== 1) throw new Error(`锚点①命中 ${count(text, ANCHOR_STALE)} != 1`);
if (count(text, ANCHOR_END) !== 1) throw new Error(`锚点②命中 ${count(text, ANCHOR_END)} != 1`);

const INS1 = '【r45j 就地订正：本句的「29 例仍仅 chromium」自 r45j 起**作废**（V1.1 链 52 例三引擎已铺满），新账见本行末 r45j 更新；原文保留不删，防引用旧数字。】';
const judge = JSON.parse(fs.readFileSync(REPO + 'docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.json', 'utf8'));
if (judge.hardCount !== 0 || judge.staleCount !== 0) throw new Error('判据未收敛，不落发布面');
const rd = fs.readFileSync(REPO + 'docs/evidence/v12/v11chain-r45j/README.md', 'utf8');
for (const need of ['≈14.1 s/例/引擎', '49 / 52', '1004 / 129 / 0', '999 / 130 / 4']) {
    if (!rd.includes(need)) throw new Error('证据 README 与发布面口径不一致：缺 ' + need);
}
const t = judge.totals;
// 分母一律现盘读取（57 = files.json 示例数；52 = 正典链 id 数；12 = 矩阵契约键数；5 = 差值现算）
const N57 = JSON.parse(fs.readFileSync(REPO + 'examples/files.json', 'utf8')).examples.length;
const N52 = new Set(JSON.parse(fs.readFileSync(REPO + 'docs/evidence/v11-examples-verified.json', 'utf8')).results.map((r) => r.id)).size;
const N12 = Object.keys(JSON.parse(fs.readFileSync(REPO + 'tools/v12/browser-matrix-contract.json', 'utf8'))).length;
if (N57 !== 57 || N52 !== 52 || N12 !== 12) throw new Error(`分母现读漂移：${N57}/${N52}/${N12}`);
if (judge.expectIds && judge.expectIds !== N52) throw new Error(`判据分母 ${judge.expectIds} != 正典链 ${N52}`);
const NOUT = N57 - N52;
const CHAIN = 'docs/evidence/v12/v11chain-r45j/';
const chainJsons = fs.readdirSync(REPO + CHAIN).filter((f) => f.endsWith('.json'));
const chainRecords = chainJsons.reduce((a, f) => a + JSON.parse(fs.readFileSync(REPO + CHAIN + f, 'utf8')).results.length, 0);
const chainPngs = fs.readdirSync(REPO + CHAIN).filter((f) => fs.statSync(REPO + CHAIN + f).isDirectory())
    .reduce((a, d) => a + fs.readdirSync(REPO + CHAIN + d).filter((f) => f.endsWith('.png')).length, 0);
const PILOT = JSON.parse(fs.readFileSync(REPO + 'docs/evidence/v12/pilot12-r45i/v11-pilot12-firefox.json', 'utf8'));
const NPilot = new Set(PILOT.results.map((r) => r.id)).size;
const NNEW = N52 - NPilot;
const N156 = Object.values(t).reduce((a, x) => a + x.pass + x.fail, 0);
const REDCELLS = t.firefox.fail + t.webkit.fail;
const REDIDS = N52 - judge.threeEnginePass;
if (NNEW !== 41 || chainRecords !== 90 || chainPngs !== 90 || N156 !== 156 || REDIDS !== 3 || REDCELLS !== 4) {
    throw new Error(`现读量与拟写文本不符：${JSON.stringify({ NNEW, chainRecords, chainPngs, N156, REDIDS, REDCELLS })}`);
}
const INS2 = `**r45j 更新（2026-09-23 04:56–05:46Z，仍 in-progress、本格不翻绿；只新增证据文件 + 文档，零改判定阈值/契约/源码/产物）**：V1.1 规格链**余下 ${NNEW} 例**（chunk-A 21 + chunk-B 19 + mesh-torus 1；第 ${NNEW} 例是首版分区 21+19=40 漏掉的一格，补腿后判据「每引擎 ${N52} 个 id」才成立）× {firefox, webkit} 已实采，落点 \`docs/evidence/v12/v11chain-r45j/\`（现盘 ${chainJsons.length} 份 JSON / ${chainRecords} 条记录 / ${chainPngs} 张 PNG，\`candidateFingerprint\` 逐条 \`9fa85f88b968d5f1\` = 当期交付 bundle），\`--out=\` ⇒ runner 的 \`WRITES_CANONICAL\` 为假、整段跳过「证据晋级 + manifest 重生」⇒ 正典三件套（\`example.json\`/\`files.json\`/\`v11-examples-verified.json\`）**零回写**。**三引擎对账**（判据 \`docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.cjs\`，\`EXIT=0\`、\`hard ${judge.hardCount} / stale ${judge.staleCount} / attributed ${judge.attributedCount}\`）：chromium **${t.chromium.pass}/${N52} PASS**（apiProof \`${t.chromium.verified}/${t.chromium.attested}/${t.chromium.unproven}\`）、firefox **${t.firefox.pass}/${N52}**（\`${t.firefox.verified}/${t.firefox.attested}/${t.firefox.unproven}\`，与 chromium **逐字段相等**）、webkit **${t.webkit.pass}/${N52}**（\`${t.webkit.verified}/${t.webkit.attested}/${t.webkit.unproven}\`）⇒ **${judge.threeEnginePass} 例三引擎同绿**。**覆盖账（替换上一轮口径）**：${N57} 例 = **${N52}** 例 V1.1 链三引擎已铺满（${judge.threeEnginePass} 绿 + ${REDIDS} 例红／${REDCELLS} 格，逐个归因）+ **${N12}** 例 V1.2 矩阵链三引擎（与前 52 例交集为空）+ **${NOUT}** 例结构性不参与（\`automation\` + 4 个 \`rc-*\`，\`requiresDevTools\`）；**「其余 29 例仅 chromium」作废**。**3 个红格逐个归因**（判据机器化；白格只豁免在册那一形态，其它偏差一律硬失败）：\`firefox/mesh-sphere\` + \`webkit/mesh-sphere\` ＝ 并行会话在工作树 \`examples/mesh-sphere/example.json\` 注入的假 validator（F-132 写盘语义的连带），判据每轮**活体现读**该文件 ∧ \`specFp\`/\`srcFp\` 必须与正典**确实不同**，相同即判归因过期；\`webkit/audio-basic\` ＝ 在册 **F-100** 在 V1.1 规格链上的跨链显现，3 次独立复跑 **3/3 同签名 FAIL** ⇒ STRUCTURAL（据此排除「释放竞态」解释），\`unproven\` 精确等于 \`AudioPCMDataView\`/\`AudioPCMDataView.getData\`/\`AudioSource.playOneShot\`；\`webkit/video-basic\` ＝ 新登记 **F-135**，5 次复跑 **2 PASS / 3 FAIL** 且失败签名恒定，P3 播控段调用计数现算显示序列确实停在 \`pause()\` 之后、\`resume()\` 之前。**新在册缺陷两条**（均 \`blocking:false\`，未擅改 runner）：**F-133** —— 整例重试与 \`saveArtifact\` 固定同名互斥（\`v11-examples-verify.cjs:794-801\` × \`:193-197\`）⇒ \`FAIL ∧ attempts=2\` 记录的截图与元数据不同源，${N156} 条里 **PASS 格零失真**即模型成立的正证，本批 ${judge.attributedCount} 格失真全落在该形态；**F-134** —— \`resource-released\` 错误窗口只做长度差分 + 消息截 80 字符（\`:590\`、\`:609-611\`）⇒ 示例自身异步序列内抛的异常被贴标为「during release/reload」，与同记录 \`no-runtime-error=PASS\` 自相矛盾 ⇒ 红格归因**不得照抄**该措辞，须二次复跑定结构性/间歇。**成本现读替换旧口径**：四腿 80 例·引擎 / 1,130 s ⇒ **≈14.1 s/例/引擎**（分腿 12.8/13.5/15.5/14.7），r45i 的 ≈19 s 同数量级；「≈63 s/例/引擎」是 2 例摊不开一次性开销的**上限**，本行前半段保留原文但不再作为规划数引用。**负控 10 臂 \`10/10\`**（阳性对照 + 反空转 + 注入自证 + 4 臂专证白格只豁免在册形态）；首轮 6/10 的根因在负控自身：臂的副本在数组构造期**急求值** ⇒ 共用同一源的臂互相覆盖，改惰性 + 每臂独立子目录后收敛（新陷阱入台账）。⚠️ 一处踩坑在册：playwright 不在本仓库依赖内，缺 \`NODE_PATH\` 时首跑产出 0/21 PASS 的垃圾捕获（\`raw/gates/r45j-firefox-chunkA-garbage.log\` 保留但**勿当结果引用**），批次脚本已加 \`exit 8\` 前置守卫。**F-131 目录对账门禁先红后绿**：红时实测 \`received ["v11chain-r45j"]\`，登记在册豁免后 \`npx jest test/smoke/smoke-30-v12-regression.test.ts -t 证据目录对账\` **PASS**，同轮 \`npm run verify:v11-chain-face\` 复跑仍 \`ok:true\`（该门禁只管正典链，非正典目录入库不影响它）。明细、逐文件字节/sha、只读复核配方 \`docs/evidence/v12/v11chain-r45j/README.md\`。`;

const after = text
    .replace(ANCHOR_STALE, () => ANCHOR_STALE + INS1)
    .replace(ANCHOR_END, () => ANCHOR_END.slice(0, -2) + ' ' + INS2 + '|');
// 纯插入判据：删掉两段插入文本必须逐字节还原前像
const revert = after.replace(INS1, '').replace(INS2, '');
if (revert !== text) throw new Error('非纯插入：还原后与前像不逐字节相同');
if (Buffer.byteLength(after, 'utf8') !== before.length + Buffer.byteLength(INS1, 'utf8') + Buffer.byteLength(INS2, 'utf8')) throw new Error('字节账不平');
fs.writeFileSync(FILE, Buffer.from(after, 'utf8'));
const back = fs.readFileSync(FILE, 'utf8');
if (Buffer.byteLength(back, 'utf8') !== Buffer.byteLength(after, 'utf8')) throw new Error('写后回读字节不符');
if (!back.includes(INS1) || !back.includes(INS2)) throw new Error('写后回读缺插入段');
console.log(JSON.stringify({
    ok: true, bytesBefore: before.length, shaBefore: sha16(before),
    bytesAfter: Buffer.byteLength(back, 'utf8'), shaAfter: sha16(Buffer.from(back, 'utf8')),
    delta: Buffer.byteLength(back, 'utf8') - before.length, linesAfter: back.split('\n').length,
    inserted: { correction: Buffer.byteLength(INS1, 'utf8'), r45jBlock: Buffer.byteLength(INS2, 'utf8') },
}, null, 2));
