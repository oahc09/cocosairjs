'use strict';
/**
 * r45j 发布面只读回执：验收报告 / 待批面 / 证据 README / F-131 门禁在册豁免 的现盘核对。
 * 纯读，不写任何仓库文件；数字全部现算，与登记值不符即抛错（exit 1）。
 */
const fs = require('fs');
const crypto = require('crypto');
const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const read = (p) => fs.readFileSync(REPO + p);

const out = { checks: [] };
const chk = (name, ok, detail) => { out.checks.push({ name, ok, detail }); if (!ok) throw new Error(`ASSERT ${name}: ${detail}`); };

// 1. 三处发布面文件均在盘、含 UPDATE-r45j / r45j 标识
const ACCEPT = 'docs/acceptance-report-v12.md';
const OWNER = 'docs/v12-owner-decisions.md';
const README = 'docs/evidence/v12/v11chain-r45j/README.md';
for (const [p, mark] of [[ACCEPT, 'r45j'], [OWNER, 'UPDATE-r45j'], [README, 'v11chain-r45j']]) {
    const buf = read(p);
    chk('mark:' + p, buf.toString('utf8').includes(mark), `${buf.length}B/${sha16(buf)}，标识 ${mark} 命中 ${buf.toString('utf8').split(mark).length - 1} 处`);
}

// 2. 判据收敛（发布面数字的来源仍在册）
const judge = JSON.parse(read('docs/audits/global-quality-audit-2026-09-19/raw/gates/r45j-reconcile-k.json').toString('utf8'));
chk('judge.converged', judge.hardCount === 0 && judge.staleCount === 0, `hard ${judge.hardCount}/stale ${judge.staleCount}/attributed ${judge.attributedCount}`);
chk('judge.currency', Object.values(judge.table).every((r) => Object.values(r).every((e) => e.candFp === '9fa85f88b968d5f1')), '52 例三引擎 candFp 全为当期交付指纹');

// 3. 发布面数字与判据现读一致（防「文档写完后数据又动了」）
const acceptTxt = read(ACCEPT).toString('utf8');
const REDC = Object.keys(judge.cells).length;
const REDN = new Set(Object.keys(judge.cells).map((k) => k.split('/').slice(1).join('/'))).size;
for (const s of [`${judge.threeEnginePass}/52`, `${judge.totals.firefox.pass}/52`, `${judge.totals.webkit.pass}/52`, '9fa85f88b968d5f1']) {
    chk('accept.contains:' + s, acceptTxt.includes(s), '验收报告需含现读数字');
}
const NEED = ['29 例仍仅 chromium」自 r45j 起**作废**', '「其余 29 例仅 chromium」作废', `${judge.threeEnginePass} 例三引擎同绿`, '≈14.1 s/例/引擎'];
for (const s of NEED) chk('accept.literal:' + s.slice(0, 18), acceptTxt.includes(s), '验收报告需含该现读/作废措辞');
const ownerTxt = read(OWNER).toString('utf8');
chk('owner.stale-63-marked', ownerTxt.includes('「≈63 s/例/引擎」的上限口径自 r45j 起停止引用'), '#15 的 63 s 上限口径须就地标注停止引用');
chk('owner.cells', ownerTxt.includes(`${REDN} 例 / ${REDC} 格`), `#15 需含现读红格账 ${REDN} 例 / ${REDC} 格`);

// 4. F-131 门禁：本批次目录已在 smoke-30 的在册豁免里
const testTxt = read('test/smoke/smoke-30-v12-regression.test.ts').toString('utf8');
chk('f131.accounted', testTxt.includes("'v11chain-r45j'"), 'smoke-30 的 ACCOUNTED 需含本批次目录键');

// 5. 证据目录现读：14 JSON / 90 记录 / 90 PNG，与 README 文件清单同口径
const DIR = 'docs/evidence/v12/v11chain-r45j/';
const jsons = fs.readdirSync(REPO + DIR).filter((f) => f.endsWith('.json'));
const pngDirs = fs.readdirSync(REPO + DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
const pngs = pngDirs.reduce((a, d) => a + fs.readdirSync(REPO + DIR + d.name).filter((f) => f.endsWith('.png')).length, 0);
let recs = 0;
for (const f of jsons) recs += JSON.parse(read(DIR + f).toString('utf8')).results.length;
chk('evidence.counts', jsons.length === 14 && recs === 90 && pngs === 90 && pngDirs.length === 14, `${jsons.length} JSON / ${recs} 记录 / ${pngDirs.length} 目录 / ${pngs} PNG`);

// 6. 发布面仓库外绝对路径（陷阱 33）：本轮插入段必须为 0；存量只报不掩。
//    注意 ACCEPT/OWNER 在本树**未跟踪**（HEAD 无此文件）⇒ 无法用 git 基线差分，只能逐段判插入体。
const scratchHits = (s) => s.split('\n').filter((l) => /E:[\\/]AIProMax[\\/]cocosair-scratch/.test(l)).length;
const segment = (txt, mark) => { const i = txt.indexOf(mark); if (i < 0) throw new Error('missing mark ' + mark); const e = txt.indexOf('\n', i); return txt.slice(i, e < 0 ? txt.length : e); };
const segAccept = segment(acceptTxt, '**r45j 更新');
const segOwner = segment(ownerTxt, '**UPDATE-r45j');
out.scratchLines = { acceptTotal: scratchHits(acceptTxt), ownerTotal: scratchHits(read(OWNER).toString('utf8')), r45jSegAccept: scratchHits(segAccept), r45jSegOwner: scratchHits(segOwner), readme: scratchHits(read(README).toString('utf8')) };
chk('r45j-segments-clean', out.scratchLines.r45jSegAccept === 0 && out.scratchLines.r45jSegOwner === 0 && out.scratchLines.readme === 0, JSON.stringify(out.scratchLines));

out.ok = true;
out.summary = { accept: { bytes: read(ACCEPT).length, sha16: sha16(read(ACCEPT)) }, owner: { bytes: read(OWNER).length, sha16: sha16(read(OWNER)) }, readme: { bytes: read(README).length, sha16: sha16(read(README)) }, judge: { hard: judge.hardCount, stale: judge.staleCount, attributed: judge.attributedCount, threeEnginePass: judge.threeEnginePass } };
console.log(JSON.stringify(out, null, 2));
