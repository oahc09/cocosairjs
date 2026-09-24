'use strict';
/**
 * r45m：mesh-sphere 两格（firefox/webkit）重采对账判据。
 *
 * 要回答的问题：r45j 把这两格归因为「并行会话在工作树注入的假 validator」，而该前提在 r45k 提交后已消失
 * （r45j 自家判据本轮现读自报 STALE，见 r45m-r45j-judge-rerun.log）。⇒ 归因过期不等于结论翻绿，
 * 必须重采才知道这两格现在是什么。
 *
 * 判据设计（每条都是「不成立即硬失败」，不做静默豁免）：
 *   ① 写后只读锁：正典证据 / 声明面 / 清单四文件字节+sha16 必须与 R45M_LOCKS 逐字节相同 ⇒ 证明本轮零回写。
 *   ② 新捕获必须是「单例子集」口径（runTotal=1、subset 恰 mesh-sphere）⇒ 防止有人把这条读成整批证据。
 *   ③ 逐字段与 chromium 正典相等：result / errors / specFp / srcFp / candFp / apiProof 计数 / units /
 *      expectationGaps / instrumentation（字段集与 r45j 判据同源，不另立口径）。
 *   ④ 盘上产物回读：PASS 格零容忍（字节+sha16 与记录逐字节同），PNG 魔数校验。
 *   ⑤ 三引擎截图不得逐字节相同 ⇒ 反「捕获没换引擎」。
 *   ⑥ Δ 归因自证：r45j 那两条 FAIL 记录必须仍在、仍红、错误含在册信号，且其 specFp **既不等于正典也不等于新捕获**
 *      （若三者全同 ⇒ 「差异来自注入」这句就是假话，判据翻红）。
 *   ⑦ 反空转：参与对账的格必须恰为 2（多一格少一格都算判据失效）。
 *
 * 读入键＝仓库相对路径；R45M_FILES 仅供负向对照臂（陷阱 40：注入臂必须按同一命名空间取键，否则会静默读回正典）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'E:/AIProMax/github/cocosair.js/';
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const readJson = (rel) => JSON.parse(fs.readFileSync(overrideOf(rel), 'utf8'));
const override = process.env.R45M_FILES ? JSON.parse(process.env.R45M_FILES) : {};
function overrideOf (rel) { return override[rel] ? path.resolve(override[rel]) : REPO + rel; }

const EXPECT_FP = '9fa85f88b968d5f1';
const D_NEW = 'docs/evidence/v12/mesh-sphere-r45m/';
const D_OLD = 'docs/evidence/v12/v11chain-r45j/';
const SENTINEL = 'not-a-real-validator';
const CELLS = ['firefox', 'webkit'];
const SOURCES = {
  chromium: 'docs/evidence/v11-examples-verified.json',
  firefox: D_NEW + 'v11-chain-firefox-mesh-sphere.json',
  webkit: D_NEW + 'v11-chain-webkit-mesh-sphere.json',
};
const PRECEDENT = {
  firefox: D_OLD + 'v11-chain-firefox-chunkB.json',
  webkit: D_OLD + 'v11-chain-webkit-chunkB.json',
};

const hard = [];
const notes = [];
const fail = (m) => hard.push(m);

/* ① 写后只读锁：先于一切证据读取校验。
 *    刻意**不走** overrideOf() —— 锁的语义是「真实仓库里的正典没被写」，可注入就等于没锁。 */
const LOCKS = JSON.parse(process.env.R45M_LOCKS || 'null');
if (!LOCKS) throw new Error('必须提供 R45M_LOCKS={"<relpath>":{bytes,sha16}, …}（正典零回写的前提锁）');
const lockState = {};
for (const [rel, l] of Object.entries(LOCKS)) {
  const buf = fs.readFileSync(REPO + rel);
  lockState[rel] = { bytes: buf.length, sha16: sha16(buf), lock: `${l.bytes}/${l.sha16}` };
  if (buf.length !== l.bytes || sha16(buf) !== l.sha16)
    throw new Error(`写后锁不匹配 ${rel}：现读 ${buf.length}/${sha16(buf)} 锁 ${l.bytes}/${l.sha16}`);
  notes.push(`锁成立（零回写）：${rel} ${buf.length}B ${sha16(buf)}`);
}

const proof = (r) => {
  const t = { verified: 0, attested: 0, unproven: 0, other: 0, unprovenApis: [] };
  for (const a of r.apiProof || []) {
    if (a.proof in t) t[a.proof]++; else t.other++;
    if (a.proof === 'unproven') t.unprovenApis.push(a.api);
  }
  return t;
};
const shape = (r) => {
  const s = proof(r);
  return {
    result: r.result,
    errors: JSON.stringify(r.errors || []),
    specFp: r.specFingerprint,
    srcFp: r.sourceFingerprint,
    candFp: r.candidateFingerprint,
    verified: s.verified,
    attested: s.attested,
    unproven: s.unproven,
    other: s.other,
    units: (r.apiProof || []).length,
    gaps: JSON.stringify(r.expectationGaps),
    instr: JSON.stringify(r.instrumentation),
    shot: (r.artifact || {}).path || null,
  };
};

/* 正典 chromium 参照格（id 必须唯一，否则参照本身可疑） */
const canonBatch = readJson(SOURCES.chromium);
const canonRecs = (canonBatch.results || []).filter((r) => r.id === 'mesh-sphere');
if (canonRecs.length !== 1) throw new Error(`正典 mesh-sphere 记录数 ${canonRecs.length} != 1`);
const canon = shape(canonRecs[0]);
if (canon.candFp !== EXPECT_FP) fail(`正典 candidateFingerprint=${canon.candFp} != 当期 ${EXPECT_FP}`);
const DECL_REL = 'examples/mesh-sphere/example.json';
if (fs.readFileSync(overrideOf(DECL_REL), 'utf8').includes(SENTINEL))
  fail(`声明面现读仍含 ${SENTINEL} ⇒ 重采前提未成立，本轮结论无效（读自 ${overrideOf(DECL_REL)}）`);

const cells = {};
for (const eng of CELLS) {
  const batch = readJson(SOURCES[eng]);
  const recs = (batch.results || []).filter((r) => r.id === 'mesh-sphere');
  if (recs.length !== 1) { fail(`${eng} 新捕获 mesh-sphere 记录数 ${recs.length} != 1`); continue; }
  const r = recs[0];
  /* ② 子集口径 */
  if (batch.browser !== eng) fail(`${eng} 批次 browser=${batch.browser} 与引擎不符`);
  if (batch.runTotal !== 1 || batch.runPass !== 1) fail(`${eng} 批次 runPass/runTotal=${batch.runPass}/${batch.runTotal}，本判据只针对单例补采`);
  if (JSON.stringify(batch.subset) !== JSON.stringify(['mesh-sphere'])) fail(`${eng} subset=${JSON.stringify(batch.subset)} != ["mesh-sphere"]（会被读成整批证据）`);
  const c = shape(r);
  cells[eng] = c;
  /* ③ 与正典逐字段相等 */
  for (const k of ['result', 'errors', 'specFp', 'srcFp', 'candFp', 'verified', 'attested', 'unproven', 'other', 'units', 'gaps', 'instr']) {
    if (c[k] !== canon[k]) fail(`${eng}/mesh-sphere 字段 ${k} 与正典不符：${eng}=${String(c[k]).slice(0, 120)} cc=${String(canon[k]).slice(0, 120)}`);
  }
  if (c.result !== 'PASS') fail(`${eng}/mesh-sphere result=${c.result} ⇒ 归因过期后仍红，需按引擎差异新立案`);
  /* ④ 盘上产物回读（PASS 格零容忍） */
  const art = r.artifact || {};
  if (!art.path) { fail(`${eng}/mesh-sphere 无 artifact.path`); continue; }
  const abs = REPO + art.path;
  if (!fs.existsSync(abs)) { fail(`${eng}/mesh-sphere 产物缺失 ${art.path}`); continue; }
  const b = fs.readFileSync(abs);
  if (b.length !== art.bytes || sha16(b) !== art.hash)
    fail(`${eng}/mesh-sphere 产物失真：盘 ${b.length}/${sha16(b)} != 记录 ${art.bytes}/${art.hash}`);
  if (!(b.length > 512 && b[0] === 0x89 && b[1] === 0x50)) fail(`${eng}/mesh-sphere 盘上不是合法 PNG（${b.length}B）`);
  cells[eng].shotOnDisk = `${b.length}/${sha16(b)}`;
}

/* ⑦ 反空转 */
if (Object.keys(cells).length !== CELLS.length)
  throw new Error(`参与对账的格 ${Object.keys(cells).length} != ${CELLS.length} ⇒ 判据空转`);

/* ⑤ 三引擎截图互不相同（记录里的字节账，正典那份直接读盘） */
const shotSet = { chromium: `${(canonRecs[0].artifact || {}).bytes}/${(canonRecs[0].artifact || {}).hash}` };
for (const eng of CELLS) shotSet[eng] = cells[eng].shotOnDisk;
if (new Set(Object.values(shotSet)).size !== 3) fail(`三引擎截图字节账存在相同：${JSON.stringify(shotSet)} ⇒ 捕获可能未换引擎`);
notes.push(`三引擎截图互异：${JSON.stringify(shotSet)}`);

/* ⑥ Δ 归因自证（对 r45j 那两条 FAIL 记录） */
const precedent = {};
for (const eng of CELLS) {
  const batch = readJson(PRECEDENT[eng]);
  const r = (batch.results || []).find((x) => x.id === 'mesh-sphere');
  if (!r) { fail(`${eng} r45j 参照记录缺失 ⇒ 无法自证差异来源`); continue; }
  const p = shape(r);
  precedent[eng] = { result: p.result, specFp: p.specFp, srcFp: p.srcFp, errors: p.errors };
  if (p.result !== 'FAIL') fail(`${eng} r45j 参照应为 FAIL，现读 ${p.result}`);
  if (!p.errors.includes(SENTINEL)) fail(`${eng} r45j 参照 errors 未含在册信号 ${SENTINEL}：${p.errors}`);
  if (p.specFp === canon.specFp) fail(`${eng} r45j 参照 specFp ${p.specFp} 已等于正典 ⇒ 「差异来自注入」这句为假`);
  if (cells[eng].specFp !== canon.specFp) fail(`${eng} 新捕获 specFp 与正典不等（上面 ③ 已报，此处不重复计数）`);
}
notes.push(`Δ 自证：r45j specFp=${precedent.firefox && precedent.firefox.specFp} → 新捕获/正典 ${canon.specFp}（srcFp ${precedent.webkit && precedent.webkit.srcFp} → ${canon.srcFp}）`);

const out = {
  ok: hard.length === 0,
  hardCount: hard.length,
  hard,
  expectCells: CELLS.length,
  cellsCount: Object.keys(cells).length,
  judgeInject: { r45mFilesArms: Object.keys(override) },
  declarationReadFrom: overrideOf(DECL_REL),
  canonicalRef: canon,
  recaptured: cells,
  r45jPrecedent: precedent,
  shotSet,
  locks: lockState,
  notes,
  sources: Object.fromEntries(CELLS.concat('chromium').map((e) => [e, `${SOURCES[e]} ⇒ ${overrideOf(SOURCES[e])}`])),
};
const OUT_PATH = process.env.R45M_OUT || 'E:/AIProMax/cocosair-scratch/db-probe/r45m-recapture-reconcile.json';
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: out.ok, hardCount: out.hardCount, hard, cellsCount: out.cellsCount, shotSet, precedent: out.r45jPrecedent, notes }, null, 1));
process.exit(hard.length ? 1 : 0);
