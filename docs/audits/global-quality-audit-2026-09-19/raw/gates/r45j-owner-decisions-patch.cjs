'use strict';
/** r45j：待批 #15 追加 UPDATE（纯插入 + 预镜像锁 + 回读） */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const FILE = REPO + 'docs/v12-owner-decisions.md';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const before = fs.readFileSync(FILE);
const EXPECT = JSON.parse(process.env.R45J_OD_PRE || '{}');
if (!EXPECT.bytes) throw new Error('必须提供 R45J_OD_PRE={bytes,sha16}');
if (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16) throw new Error(`预镜像锁不匹配：现读 ${before.length}B/${sha16(before)} != ${EXPECT.bytes}B/${EXPECT.sha16}`);
const text = before.toString('utf8');
const ANCHOR = '本会话不擅自晋升。 | |';
const count = (h, n) => h.split(n).length - 1;
if (count(text, ANCHOR) !== 1) throw new Error(`锚点命中 ${count(text, ANCHOR)} != 1`);

const judge = JSON.parse(fs.readFileSync(REPO + 'docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.json', 'utf8'));
if (judge.hardCount !== 0 || judge.staleCount !== 0) throw new Error('判据未收敛，不落待批面');
const t = judge.totals;
const wrapper = fs.readFileSync(REPO + 'docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-batch.out', 'utf8');
const legs = [...wrapper.matchAll(/=== r45j (firefox|webkit) chunk-([AB]) start (\S+) ===/g)];
if (legs.length !== 4) throw new Error(`wrapper 腿数 ${legs.length} != 4`);
const starts = legs.map((m) => Date.parse(m[3]));
const total = (Date.parse(wrapper.match(/all legs done (\S+)/)[1]) - starts[0]) / 1000;
if (!Number.isFinite(total) || total <= 0) throw new Error('wrapper 时间戳解析异常');
// 分腿时长＝相邻腿启动时刻之差（末腿到「all legs done」），不手打数字
const legSec = starts.map((s, i) => ((i < 3 ? starts[i + 1] : Date.parse(wrapper.match(/all legs done (\S+)/)[1])) - s) / 1000);
// 例·引擎数从盘上现读（四腿覆盖的 6 份批次 JSON 里属于 chunkA/chunkB 的四份）
const DIR = REPO + 'docs/evidence/v12/v11chain-r45j/';
const batchJson = ['v11-chain-firefox-chunkA.json', 'v11-chain-firefox-chunkB.json', 'v11-chain-webkit-chunkA.json', 'v11-chain-webkit-chunkB.json'];
const legCount = legs.map((m) => JSON.parse(fs.readFileSync(DIR + `v11-chain-${m[1]}-chunk${m[2]}.json`, 'utf8')).results.length);
const CELLS = batchJson.reduce((acc, f) => acc + JSON.parse(fs.readFileSync(DIR + f, 'utf8')).results.length, 0);
if (CELLS !== legCount.reduce((a, b) => a + b, 0)) throw new Error(`腿记录数合计 ${legCount.reduce((a, b) => a + b, 0)} != ${CELLS}`);
if (CELLS !== 80) throw new Error(`四腿记录数 ${CELLS} != 80 ⇒ 摊算分母需复核`);
const SEC = (total / CELLS).toFixed(1);
const PER_LEG = legCount.map((n, i) => (legSec[i] / n).toFixed(1)).join('/');
if (Number(SEC) <= 0 || Number(SEC) > 60) throw new Error(`摊算 ${SEC} s/例/引擎 异常`);
// 诊断复跑样本计数同样从盘上现读
const diagScan = (prefix_) => fs.readdirSync(DIR).filter((f) => f.startsWith(prefix_) && f.endsWith('.json')).sort().map((f) => {
    const r = JSON.parse(fs.readFileSync(DIR + f, 'utf8')).results[0];
    return { f, result: r.result, errors: r.errors || [], unproven: (r.apiProof || []).filter((a) => a.proof === 'unproven').map((a) => a.api) };
});
const audio = diagScan('diag-audio-basic-wk-d');
const video = diagScan('diag-video-basic-wk');
const cnt = (a, r) => a.filter((x) => x.result === r).length;
// 失败签名去重（与台账 F-134/135 同式：URL 端口归一 + errors + unproven 集）
const norm = (s) => String(s).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:PORT');
const sigOf = (x) => x.errors.map(norm).join('|') + '#' + x.unproven.sort().join(',');
const audioSigs = new Set(audio.map(sigOf)).size;
const videoSigs = new Set(video.filter((x) => x.result === 'FAIL').map(sigOf)).size;
if (audio.length !== 3 || video.length !== 5) throw new Error(`诊断样本数 audio=${audio.length}/video=${video.length} 异常`);
if (cnt(audio, 'PASS') !== 0 || audioSigs !== 1) throw new Error(`audio 形态变化（PASS ${cnt(audio, 'PASS')} / 签名 ${audioSigs} 种）⇒ 结构性归因需重判`);
if (videoSigs !== 1) throw new Error(`video 失败签名 ${videoSigs} 种 ⇒ 间歇但形态漂移，需重判`);

const redKeys = Object.keys(judge.cells);
const RED_IDS = [...new Set(redKeys.map((k) => k.split('/').slice(1).join('/')))];
if (redKeys.length !== t.firefox.fail + t.webkit.fail) throw new Error(`红格 ${redKeys.length} != FAIL 合计 ${t.firefox.fail + t.webkit.fail}`);
const cellN = (id) => redKeys.filter((k) => k.endsWith('/' + id)).length;

const INS = `**UPDATE-r45j（2026-09-23）：范围与成本两问已由实测关闭，只剩「落点 + 提交授权」。** 余下 41 例 × {firefox, webkit} 已按 (b) 的全量口径跑完（非正典落点 \`docs/evidence/v12/v11chain-r45j/\`），52 例三引擎对账判据 \`EXIT=0\`（\`hard ${judge.hardCount} / stale ${judge.staleCount} / attributed ${judge.attributedCount}\`）⇒ **${judge.threeEnginePass}/52 三引擎同绿**（chromium ${t.chromium.pass}、firefox ${t.firefox.pass}、webkit ${t.webkit.pass} 全 PASS）。实测摊算 **≈${SEC} s/例/引擎**（四腿 ${CELLS} 例·引擎 / ${total.toFixed(0)} s；分腿 ${PER_LEG} s，口径＝相邻腿启动时刻之差 ÷ 该腿记录数），本行原估 17–18 min 兑现。**新决策信息（本轮才拿得到，批复前必读）**：正式批次若覆写正典，当前会被 **${RED_IDS.length} 例 / ${redKeys.length} 格**挡住而非「跑一遍就行」（逐格归因现读自 \`raw/gates/r45j-reconcile-k.json\` 的 \`cells\`）——` +
    `\`${redKeys.filter((k) => k.includes('mesh-sphere')).join(' + ')}\`（${cellN('mesh-sphere')} 格，取决于并行会话写进工作树 \`examples/mesh-sphere/example.json\` 的假 validator 是否撤除，本会话不代撤）、` +
    `\`webkit/audio-basic\`（在册 F-100 在 V1.1 链上的跨链显现：${audio.length} 次复跑 ${cnt(audio, 'PASS')} PASS、去重签名 ${audioSigs} 种 ⇒ 结构性，要绿得先决定改不改示例契约）、` +
    `\`webkit/video-basic\`（新登记 F-135：${video.length} 次复跑 ${cnt(video, 'PASS')} PASS / ${cnt(video, 'FAIL')} FAIL 的间歇，失败签名恒定；按在册 retest 口径需连续 8 次全绿才可销案）。` +
    ` ⇒ 请在本条上顺手选定：**(b1)** 只晋升 firefox 腿（firefox 的 apiProof 合计与 chromium **逐字段相等** \`${t.firefox.verified}/${t.firefox.attested}/${t.firefox.unproven}\`，webkit 留作已知差）；**(b2)** 三引擎全晋升 ⇒ 需要 runner 支持 per-engine 已知红名单（**属改判定语义，本会话不擅动**）；**(b3)（建议默认）** 维持非正典，把本批证据作为 §12 的补充证据入库（只需 #12/#13 的提交授权，不动任何判定）。` +
    `另：本行「≈63 s/例/引擎」的上限口径自 r45j 起停止引用（已有 ${CELLS} 例·引擎的实测摊算），F-133/F-134 是铺开过程暴露的 runner 缺陷（均 \`blocking:false\`，详见台账），晋升批次不因此变红但 FAIL 格的截图与记录元数据不同源需按 F-133 口径读。`;

// ANCHOR = 「…不擅自晋升。 | |」；插入点在其句号与表格收尾之间，收尾 " | |" 原样保留。
const pos = text.indexOf(ANCHOR);
const cut = pos + ANCHOR.length - 4;                     // 句号之后
const prefix = text.slice(0, cut);
const tail = text.slice(cut);
const INSERTED = ' ' + INS;
const after = prefix + INSERTED + tail;
if (after.indexOf(INSERTED) !== prefix.length || after.lastIndexOf(INSERTED) !== prefix.length) throw new Error('插入体非唯一或位置异常');
if (after.slice(0, prefix.length) + after.slice(prefix.length + INSERTED.length) !== text) throw new Error('非纯插入：还原后与前像不逐字节相同');
const rowOf = (s) => { const st = s.lastIndexOf('\n', pos) + 1; const en = s.indexOf('\n', pos); return s.slice(st, en < 0 ? s.length : en); };
if (!rowOf(after).trimEnd().endsWith(' | |')) throw new Error('目标行收尾异常');
if (rowOf(after).includes('\n') || rowOf(text).endsWith(' | |') === false) throw new Error('锚点不在表格行内');
fs.writeFileSync(FILE, Buffer.from(after, 'utf8'));
const back = fs.readFileSync(FILE);
if (back.length !== Buffer.byteLength(after, 'utf8')) throw new Error('写后回读不符');
if (!back.toString('utf8').includes('UPDATE-r45j')) throw new Error('写后未见 UPDATE-r45j');
if (count(back.toString('utf8'), ' | |') !== count(text, ' | |')) throw new Error('「| |」收尾计数变化 ⇒ 表格结构被动过');
console.log(JSON.stringify({ ok: true, bytesBefore: before.length, shaBefore: sha16(before), bytesAfter: back.length, shaAfter: sha16(back), delta: back.length - before.length, insertedChars: INSERTED.length, secPerExampleEngine: SEC, totalSec: total, legSec: legSec.map((s) => +s.toFixed(1)), cells: CELLS }, null, 2));
