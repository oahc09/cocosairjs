'use strict';
/**
 * r45j 追加 F-133 / F-134 / F-135 三行到 findings.jsonl（纯追加，不改任何既有行）。
 * 纪律：写前抛错式预镜像锁（字节 + sha16）；数字一律从盘上现算，不手打进文本；
 *      写后回读逐行 JSON.parse + 行数 + id 唯一性断言。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const FILE = REPO + 'docs/audits/global-quality-audit-2026-09-19/findings.jsonl';
const D = REPO + 'docs/evidence/v12/v11chain-r45j/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const before = fs.readFileSync(FILE);
const EXPECT = { bytes: 415620, sha16: 'd8c865ff1d6381ac', lines: 132 };
if (before.length !== EXPECT.bytes || sha16(before) !== EXPECT.sha16) {
    throw new Error(`预镜像锁不匹配：现读 ${before.length}B / ${sha16(before)}（登记 ${EXPECT.bytes}B / ${EXPECT.sha16}）⇒ 有并行写入，先复核`);
}
const rows = before.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (rows.length !== EXPECT.lines) throw new Error(`行数 ${rows.length} != ${EXPECT.lines}`);
if (rows.some((r) => ['F-133', 'F-134', 'F-135'].includes(r.findingId))) throw new Error('F-133/134/135 已存在 ⇒ 拒绝重复追加');

// —— 盘上现算：F-133 的四格产物失真 ——
const judge = JSON.parse(fs.readFileSync('E:/AIProMax/cocosair-scratch/v12-logs/r45j-reconcile-k.json', 'utf8'));
if (judge.hardCount !== 0 || judge.staleCount !== 0) {
    throw new Error(`判据未收敛（hard ${judge.hardCount} / stale ${judge.staleCount}）⇒ 不追加归因类结论，先修判据`);
}
const desync = judge.attributed.filter((l) => l.includes('产物失真'));
if (desync.length !== 4) throw new Error(`失真格数 ${desync.length} != 4`);
const engCount = (e) => desync.filter((l) => l.startsWith(e + '/')).length;
const totals = judge.totals;
const threePass = judge.threeEnginePass;

// —— 盘上现算：F-134 / F-135 的诊断复跑样本计数 ——
const diagScan = (prefix) => {
    const list = fs.readdirSync(D).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
    const out = list.map((f) => {
        const j = JSON.parse(fs.readFileSync(D + f, 'utf8'));
        const r = j.results[0];
        return { f, result: r.result, errors: r.errors || [], unproven: (r.apiProof || []).filter((a) => a.proof === 'unproven').map((a) => a.api), cand: r.candidateFingerprint, attempts: r.attempts };
    });
    const pass = out.filter((x) => x.result === 'PASS').length;
    return { n: out.length, pass, fail: out.length - pass, out };
};
const audio = diagScan('diag-audio-basic-wk-d');
const video = diagScan('diag-video-basic-wk');
if (audio.n !== 3) throw new Error(`audio 诊断样本 ${audio.n} != 3`);
if (video.n !== 5) throw new Error(`video 诊断样本 ${video.n} != 5`);
const norm = (s) => String(s).replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:PORT');
const sigOf = (x) => x.errors.map(norm).join('|') + '#' + x.unproven.sort().join(',');
const audioSigs = [...new Set(audio.out.map(sigOf))];
const videoSigs = [...new Set(video.out.filter((x) => x.result === 'FAIL').map(sigOf))];
// P3 播控三兄弟的调用计数（现算，不手打）：正典 chromium / firefox 同采 / webkit 首采 / webkit FAIL 样本
const p3counts = (label, file, id) => {
    const r = JSON.parse(fs.readFileSync(REPO + file, 'utf8')).results.find((x) => x.id === id);
    const g = (api) => { const a = (r.apiProof || []).find((u) => u.api === api); return a ? `${a.calls}/${a.proof}` : 'absent'; };
    return `${label}=${g('VideoPlayer.play')}/${g('VideoPlayer.pause')}/${g('VideoPlayer.resume')}`;
};
const p3line = [
    p3counts('chromium', 'docs/evidence/v11-examples-verified.json', 'video-basic'),
    p3counts('firefox', 'docs/evidence/v12/v11chain-r45j/v11-chain-firefox-chunkB.json', 'video-basic'),
    p3counts('webkit-FAIL 首采', 'docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkB.json', 'video-basic'),
    p3counts('webkit-PASS 复跑', 'docs/evidence/v12/v11chain-r45j/' + video.out.find((x) => x.result === 'PASS').f, 'video-basic'),
].join(' ｜ ');
if (video.pass === 0) throw new Error('无 PASS 样本可取 p3 计数');
if (audio.pass !== 0) throw new Error(`audio 诊断出现 PASS ${audio.pass}/3 ⇒ STRUCTURAL 归因需重判，不得追加`);
if (audioSigs.length !== 1) throw new Error(`audio 三次失败签名不一致（${audioSigs.length} 种）⇒ 结构性判定不成立`);
if (video.pass === 0 || video.fail === 0) throw new Error(`video 诊断 ${video.pass}PASS/${video.fail}FAIL ⇒ 间歇性判定需重判`);
if (videoSigs.length !== 1) throw new Error(`video 失败签名 ${videoSigs.length} 种 ⇒ 间歇但形态漂移，需重判`);
// （无未用变量：签名去重已在上面的抛错式断言里消费）

const NOW = new Date().toISOString();
const GATES = 'docs/audits/global-quality-audit-2026-09-19/raw/gates';
const NEW = [
    {
        findingId: 'F-133',
        requirementId: '计划书 §12「示例 Browser Matrix（三引擎）+ 截图入 docs/evidence/v12/」——截图必须与其所属记录同源可自证',
        gate: '非命令门禁缺陷：tools/verify/v11-examples-verify.cjs 重试路径的产物一致性',
        category: 'evidence-producer integrity defect',
        blocking: false,
        status: 'OPEN（r45j 登记；未擅改 runner 判定面，修因与最小修在案）',
        location: 'tools/verify/v11-examples-verify.cjs:794-801（FAIL 整例重试：重试仍 FAIL 时 `Object.assign(result, {attempts:2})` 保留**首跑**记录）× :193-197（`saveArtifact` 固定写 `<artifact-dir>/<example.dir>.png`，第二次跑原地覆盖同名文件）',
        repro: `node ${GATES}/r45j-reconcile-k.cjs（52 例 × 三引擎对账判据；判据把「失真 ⇔ result=FAIL ∧ attempts=2」当模型断言：PASS 格零容忍、FAIL+attempts=2 格计入在册、FAIL 但 attempts!=2 的失真直接判硬失败）`,
        expected: '记录里的 `artifact.bytes/hash` 必须指向盘上那张 PNG；重试不得覆盖已被在册记录引用的证据文件（同名落不同 attempt 路径，或整体保持同源）',
        actual: `${desync.length} 格失真：${desync.map((l) => l.split(' 产物失真')[0]).join(' / ')}。156 条记录（52 正典 + ${totals.firefox.pass + totals.firefox.fail} firefox + ${totals.webkit.pass + totals.webkit.fail} webkit）里 **PASS 格零失真**，失真全部落在 \`result=FAIL ∧ attempts=2\` ⇒ 模型成立：失真不是捕获环境抖动，而是重试原地覆盖 PNG、记录却仍写首跑的元数据。附带后果：FAIL 记录的截图与其 \`visible-frame\`/\`errors\` 来自两次不同的运行，人工复核 FAIL 时看到的画面并非判红那一次的画面。`,
        evidence: `docs/evidence/v12/v11chain-r45j/（四格记录 + 盘上 PNG）｜判据机读输出 ${GATES}/r45j-reconcile-k.json（` + sha16(fs.readFileSync('E:/AIProMax/cocosair-scratch/v12-logs/r45j-reconcile-k.json')) + `）｜判据源码 ${GATES}/r45j-reconcile-k.cjs｜重试代码现读 sed -n '794,801p' tools/verify/v11-examples-verify.cjs 与 sed -n '193,197p' 同文件`,
        minimalFix: '三选一，都不改判定阈值：(a) 重试的截图落 `<id>.attempt2.png` 并把该路径写回记录；(b) `Object.assign(retried…)` 之外，FAIL 分支同样取「与所记录字段同一次 attempt」的 artifact（即重试前先把首跑 PNG 定存）；(c) saveArtifact 检测目标已存在则拒绝原地覆盖并报错。建议 (b)：改动面最小且保持每条记录自证一次运行。',
        retest: '强制制造一次重试（临时把某例的一次性判定改红，跑完回滚），断言该 FAIL 记录 `attempts=2` 且 `artifact.bytes/hash` 与盘上 PNG 逐字节一致；再跑本判据看 `attributedCount` 归零。',
        measuredAt: NOW,
        scope_note: '本轮（r45j）铺开 52 例 × firefox/webkit 时才暴露：正典 chromium 批次 52 条全 PASS，历史上没有一条 FAIL 记录被回读过，所以该失真此前不可见。与 F-72（同一 runner 的证据文件整体原子性）同族不同点。',
    },
    {
        findingId: 'F-134',
        requirementId: '计划书 §12 三引擎取证：红格必须可归因（缺陷可见性/归因质量）',
        gate: '非命令门禁缺陷：tools/verify/v11-examples-verify.cjs 的 `resource-released` 错误窗口与消息截断',
        category: '验证缺口/归因误导',
        blocking: false,
        status: 'OPEN（r45j 登记；本轮被迫用二次复跑绕过，未擅改 runner 判定面）',
        location: 'tools/verify/v11-examples-verify.cjs:590 与 :609-611（`errorsAfter.slice(errorsBefore.length)` —— 只做列表长度差分，不辨时间/来源）+ :611 `String(newErrors[0].message || \x27\x27).slice(0, 80)`（webkit 的 pageerror message 含栈，80 字符后连错误类型都不剩）',
        repro: `同签名两例现读：docs/evidence/v12/v11chain-r45j/v11-chain-webkit-chunkA.json（audio-basic）与同目录 v11-chain-webkit-chunkB.json（video-basic）——两条记录的 \`no-runtime-error\` 均为 PASS、\`resource-released\` 均为 FAIL 且文案写死 "runtime errors during release/reload"`,
        expected: '释放/重载窗口的错误应与示例自身异步序列的错误可区分（按时间戳或序号取窗口内增量）；至少保留完整 `name + message + stack` 前两帧，供归因',
        actual: `示例序列内部（页面尚未进入生命周期阶段）抛出的异常被贴标成「during release/reload」：audio-basic 的栈顶是 \`${(audio.out[0].errors[0].match(/main\.js:\d+:\d+/) || ['（截断，无行号）'])[0]}\`（examples/audio-basic/main.js:438，P8 序列中段），video-basic 的栈顶指向 examples/video-basic/main.js 的 p3Controls——两者都发生在序列里，不是释放动作造成的；而跑在序列之前的 \`no-runtime-error\` 同记录 PASS，形成「同一份证据里一条说干净、一条说释放时炸」的自相矛盾。判读后果真实存在：本轮先把 webkit/audio-basic 归到在册 F-100，再靠 3 次复跑才把它与「释放竞态」分开。`,
        evidence: `diag 复跑 3 份 docs/evidence/v12/v11chain-r45j/diag-audio-basic-wk-d{1,2,3}.json（${audio.n} 次全 FAIL、失败签名去重后 ${audioSigs.length} 种）｜diag-video-basic-wk-d{1,2,3}.json（${video.pass} PASS / ${video.fail} FAIL）｜代码现读 sed -n '588,616p' tools/verify/v11-examples-verify.cjs`,
        minimalFix: '两处纯诊断改动（不动判定语义）：① 增量按错误条目自带的序号/时间过滤出 `__lifecycle()` 调用窗口内的部分，窗口外的另立 `errors-during-sequence` 标签；② `slice(0, 80)` 放宽到 400 并优先输出 `error.name + error.message`，栈另放一字段。',
        retest: '造一条序列内抛错、释放干净的样例（scratch 副本即可），断言 `resource-released=PASS` 且新增标签捕获该错误；反向造释放期抛错样例，断言只有它进 `resource-released`。',
        measuredAt: NOW,
        scope_note: '不新增红门禁、不改判据：本轮所有 FAIL/PASS 计数仍按 runner 原语义记账，只是不再照抄它的「during release/reload」措辞。',
    },
    {
        findingId: 'F-135',
        requirementId: '计划书 LV12-04 video-basic × 三引擎（V1.1 规格驱动链）',
        gate: 'node tools/verify/v11-examples-verify.cjs --ids=video-basic --browser=webkit（正典链口径）',
        category: '示例稳定性/引擎差异（间歇性）',
        blocking: false,
        status: 'OPEN（r45j 登记；机制未钉死，已给复现配方与排除项）',
        location: 'examples/video-basic/main.js:343-365（P3 播控段 play→pause→resume）× webkit；判定入口 tools/verify/v11-examples-verify.cjs 的 `api-executed` 与 `resource-released`',
        repro: `NODE_PATH=<playwright 所在 node_modules> node tools/verify/v11-examples-verify.cjs --ids=video-basic --browser=webkit --out=docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-<n>.json --artifact-dir=docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-<n>（n=1..3；r45j 实测命令原件 ${GATES}/r45j-webkit-determinism.sh）`,
        expected: '三引擎同构：P3 段 `VideoPlayer.resume` 必然被执行，序列内不抛异常 ⇒ `resource-released` / `api-executed` 两维在 webkit 上与 chromium/firefox 同绿',
        actual: `webkit 间歇红：本次 ${video.n} 次独立复跑 = ${video.pass} PASS / ${video.fail} FAIL（连同 r45j 首采的 v11-chain-webkit-chunkB.json 一起计 ${video.fail + 1} 红 / ${video.pass} 绿）。每次失败形态完全一致（去重签名 ${videoSigs.length} 种）：\`api-executed: 1/37 claimed APIs never executed: VideoPlayer.resume\` + \`resource-released: 1 runtime errors … p3Controls@…/main.js:365:20\`。P3 段 play/pause/resume 的调用计数现算＝${p3line} ⇒ 失败格确实停在 pause 之后、resume 之前。firefox 同例同链全绿、chromium 正典全绿 ⇒ 只在 webkit 出现。`,
        evidence: `docs/evidence/v12/v11chain-r45j/diag-video-basic-wk-{1,2}.json（1 PASS / 1 FAIL，早期两跑）+ diag-video-basic-wk-d{1,2,3}.json + v11-chain-webkit-chunkB.json｜三引擎对账 ${GATES}/r45j-reconcile-k.json（现读 firefox ${totals.firefox.pass}/${totals.firefox.pass + totals.firefox.fail} PASS、webkit ${totals.webkit.pass}/${totals.webkit.pass + totals.webkit.fail} PASS、三引擎同时 PASS 的例数 ${threePass}/52）｜日志 E 盘 scratch 已归档件 ${GATES}/r45j-webkit-determinism.log`,
        minimalFix: '先归因后修：把 `api-executed` 未执行集与栈行号一并落证据（F-134 的第 ② 项即可给出错误类型），再判定是 (a) webkit 在 `pause()` 之后状态机不进 PAUSED ⇒ `waitFor(…, 1500)` 超时后紧接的 `resume()` 路径与释放抢次序，还是 (b) 示例 P3 段的等待预算对 webkit 过薄（与 F-107 同类的时序预算问题）。二者修法不同，本轮不猜着改示例契约。',
        retest: 'webkit 连续 8 次跑该例（正典链口径、`--out` 非正典落点），按 PASS 率给结论：8/8 绿才可销案；若仍间歇，把 P3 的等待改成条件化轮询后同法复采。',
        measuredAt: NOW,
        scope_note: `与 F-107 的区别照实登记：F-107 是 webkit \`p8Loop.wrappedBelowSeekTarget\` 布尔量的竞态（回绕 vs 回跳抢次序），本条是 webkit **P3 播控段整段被抛断**、\`VideoPlayer.resume\` 一次都没执行——同一示例、不同维、不同签名，故另立编号不并案。与 F-103（全屏路径的 TypeError）也不同：本条栈顶在 p3Controls，不在 screen/fullscreen 调用链上。`,
    },
];

const text = before.toString('utf8');
const ADD = NEW.map((r) => JSON.stringify(r)).join('\n') + '\n';
const outBuf = Buffer.from(text + ADD, 'utf8');
if (outBuf.length !== before.length + Buffer.byteLength(ADD, 'utf8')) throw new Error('字节账不平');
if (!outBuf.toString('utf8').startsWith(text)) throw new Error('非纯追加');
fs.writeFileSync(FILE, outBuf);

const after = fs.readFileSync(FILE);
const lines = after.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (lines.length !== EXPECT.lines + 3) throw new Error(`写后行数 ${lines.length} != ${EXPECT.lines + 3}`);
const ids = lines.map((l) => l.findingId);
if (new Set(ids).size !== ids.length) throw new Error('findingId 重复');
if (ids[ids.length - 3] !== 'F-133' || ids[ids.length - 1] !== 'F-135') throw new Error('新行未追加到尾部');
console.log(JSON.stringify({
    ok: true, bytesBefore: before.length, shaBefore: sha16(before), bytesAfter: after.length, shaAfter: sha16(after),
    delta: after.length - before.length, linesAfter: lines.length, added: ['F-133', 'F-134', 'F-135'],
    derived: { desyncCells: desync.length, perEngine: { firefox: engCount('firefox'), webkit: engCount('webkit') }, audio: { n: audio.n, pass: audio.pass, sigs: audioSigs.length }, video: { n: video.n, pass: video.pass, fail: video.fail, sigs: videoSigs.length }, totals, threePass },
}, null, 2));
