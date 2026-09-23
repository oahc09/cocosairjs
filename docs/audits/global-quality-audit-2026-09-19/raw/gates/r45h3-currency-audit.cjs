const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ROOT = 'E:/AIProMax/github/cocosair.js';
const apiTrace = require(path.join(ROOT, 'tools/verify/api-trace.cjs'));
const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const file16 = (p) => sha16(fs.readFileSync(p));
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// 负向控制用覆盖口：--matrix= / --v11= / --out= 可指向仓库外副本（ROOT 不动，PNG 仍按仓库解析）
const arg = (name) => { const a = process.argv.find((s) => s.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const OVERRIDE_MATRIX = arg('matrix');
const OVERRIDE_V11 = arg('v11');
const OVERRIDE_OUT = arg('out') || 'E:/AIProMax/cocosair-scratch/v12-diag/r45h3-currency-readings.json';

const out = { round: 'r45h3-currency', measuredAt: new Date().toISOString(), overrides: { matrix: OVERRIDE_MATRIX, v11: OVERRIDE_V11 } };

// --- live anchors ---
const liveCandidate = apiTrace.candidateFingerprint();
out.live = {
  candidateFingerprint: liveCandidate,
  bundle: { bytes: fs.statSync(path.join(ROOT, 'build/cocosair.module.js')).size, sha16: file16(path.join(ROOT, 'build/cocosair.module.js')) },
  minBundle: { bytes: fs.statSync(path.join(ROOT, 'build/cocosair.module.min.js')).size, sha16: file16(path.join(ROOT, 'build/cocosair.module.min.js')) },
};

// --- V1.2 three-engine matrix ---
{
  const EV = OVERRIDE_MATRIX || path.join(ROOT, 'docs/evidence/v12/browser-matrix.json');
  const CON = path.join(ROOT, 'tools/v12/browser-matrix-contract.json');
  const j = readJson(EV);
  const contractSha = file16(CON);
  const contractEntries = Object.keys(readJson(CON)).length;
  let pngMissing = 0, pngHashMismatch = 0, pngSizeMismatch = 0, pngChecked = 0;
  const weak = [];
  for (const r of j.records || []) {
    if (!r.png) continue;
    const p = path.join(ROOT, r.png.replace(/\\/g, '/'));
    pngChecked++;
    if (!fs.existsSync(p)) { pngMissing++; continue; }
    const b = fs.readFileSync(p);
    if (b.length !== r.pngBytes) pngSizeMismatch++;
    if (sha16(b) !== r.pngSha256_16) pngHashMismatch++;
    if (r.result !== 'PASS' || !r.checks || Object.values(r.checks).some((v) => v !== true)) weak.push(r.example);
  }
  out.matrix = {
    evidenceBytes: fs.statSync(EV).size, evidenceSha16: file16(EV),
    completed: j.completed === true, runPass: j.runPass, runTotal: j.runTotal, measuredAt: j.measuredAt,
    records: (j.records || []).length, contractEntries,
    contractFingerprintMatchesLive: j.contractFingerprint === contractSha,
    recordedBundleMatchesLive: !!(j.bundle && j.bundle.sha256_16 === out.live.bundle.sha16),
    pngChecked, pngMissing, pngSizeMismatch, pngHashMismatch, weakRecords: weak,
  };
  out.matrix.verdict = (out.matrix.records > 0 && out.matrix.pngChecked === out.matrix.records && out.matrix.contractEntries > 0
    && out.matrix.completed && out.matrix.runPass === out.matrix.runTotal && out.matrix.contractFingerprintMatchesLive
    && out.matrix.recordedBundleMatchesLive && out.matrix.pngMissing === 0 && out.matrix.pngSizeMismatch === 0 && out.matrix.pngHashMismatch === 0 && weak.length === 0)
    ? 'CURRENT（逐记录 bundle/contract/PNG 字节与哈希现读复算全命中；PNG 本体仍是捕获时刻字节，未重采）' : 'STALE-or-PARTIAL';
}

// --- V1.1 browser chain ---
{
  const EV = OVERRIDE_V11 || path.join(ROOT, 'docs/evidence/v11-examples-verified.json');
  const j = readJson(EV);
  const recs = j.results || [];
  const byFp = {};
  let mismatch = 0;
  for (const r of recs) {
    const fp = r.candidateFingerprint;
    const k = String(fp);
    byFp[k] = (byFp[k] || 0) + 1;
    if (fp !== liveCandidate) mismatch++;
  }
  out.v11chain = {
    evidenceBytes: fs.statSync(EV).size, evidenceSha16: file16(EV),
    completed: j.completed === true, partial: j.partial, runPass: j.runPass, runTotal: j.runTotal, measuredAt: j.measuredAt,
    records: recs.length, fileCandidateFingerprint: j.candidateFingerprint, fileCandidateMatchesLive: j.candidateFingerprint === liveCandidate,
    apiProofTotals: j.apiProofTotals,
    recordsWithoutCandidateFpField: recs.filter((r) => !('candidateFingerprint' in r)).length,
    distinctCandidateFingerprints: byFp, recordsNotMatchingLiveCandidate: mismatch,
  };
  // 防空转：任一维度为 0/缺失就不许判 CURRENT
  const vacuous = recs.length === 0 || recs.filter((r) => 'candidateFingerprint' in r).length !== recs.length;
  out.v11chain.verdict = vacuous
    ? 'NOT-ASSERTABLE（记录缺 candidateFingerprint，离线无法逐条绑定 ⇒ 计数为 0 属空转不是绿）'
    : (mismatch === 0 && j.completed === true && j.partial === false && j.runPass === j.runTotal && out.v11chain.fileCandidateMatchesLive
      ? 'CURRENT（52/52 逐条候选指纹 == 现算值，文件级同值，completed 且非 partial）'
      : `STALE（${mismatch}/${recs.length} 条记录的候选指纹不等于现算值）`);
}

// --- V1.1 devtools + gallery artifact ---
for (const [key, rel] of [['devtools', 'docs/evidence/v11-devtools-examples.json'], ['gallery', 'docs/evidence/v11-gallery-artifact.json']]) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { out[key] = { missing: true }; continue; }
  const j = readJson(p);
  out[key] = {
    file: rel, bytes: fs.statSync(p).size, sha16: file16(p), measuredAt: j.measuredAt, completed: j.completed,
    candidateFingerprint: j.candidateFingerprint, matchesLive: j.candidateFingerprint === liveCandidate,
    topKeys: Object.keys(j).slice(0, 16),
  };
}

fs.mkdirSync(path.dirname('E:/AIProMax/cocosair-scratch/v12-diag/'), { recursive: true });
const dest = OVERRIDE_OUT;
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
