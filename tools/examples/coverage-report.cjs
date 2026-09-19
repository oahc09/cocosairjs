/* V1.1 F2 — API Coverage Report（claimed / verified 严格分离 + verified 门禁）。
 *
 * 覆盖语义（§12/§25）：
 *   claimed  — example.json 的 api.claims 与 inventory 精确匹配（声明）
 *   verified — claim 所属 example 在 v11-examples-verified.json 中 result=PASS，
 *              且 evidence.specFingerprint 与当前 example.json 哈希一致（防陈旧证据冒充）
 *
 * verified 门禁（§25 增补）：
 *   Core      — 100% verified
 *   Important — ≥ 90% verified
 *   Advanced  — ≥ 80% verified
 * 门禁未达标如实输出 FAIL（达标依赖 Wave 扩量，不得以 claimed 冒充）。
 *
 * 执行：node tools/examples/coverage-report.cjs
 * 产出：docs/api-coverage-report.json
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var REPO = path.resolve(__dirname, '..', '..');
var INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
var MANIFEST_PATH = path.join(REPO, 'examples', 'files.json');
var EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'v11-examples-verified.json');
var OUT_PATH = path.join(REPO, 'docs', 'api-coverage-report.json');

(function main() {
  var inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  var manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  var evidence = fs.existsSync(EVIDENCE_PATH) ? JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8')) : { results: [], measuredAt: null };

  // 运行验证结果：exampleId -> { result, specFingerprint }
  var runById = {};
  for (var r of evidence.results || []) { runById[r.id] = r; }

  function currentFingerprint (exampleDir) {
    // 规范化指纹：排除 status/promotionEvidence（与验证器 specFingerprintOf 一致）
    var file = path.join(REPO, 'examples', exampleDir, 'example.json');
    if (!fs.existsSync(file)) { return null; }
    var spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete spec.status;
    delete spec.promotionEvidence;
    return crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 12);
  }

  // 构建冻结清单（分 tier）
  var frozen = {};
  var units = inventory.units || {};
  for (var fq in units) {
    frozen[fq] = { tier: units[fq].tier, coverageRequired: units[fq].coverageRequired, kind: units[fq].kind };
  }

  // claimed / verified 覆盖映射
  var claimedBy = {};   // fqName -> [exampleId]
  var verifiedBy = {};  // fqName -> [exampleId]（PASS + fingerprint 一致）
  var staleEvidence = [];
  for (var ex of manifest.examples) {
    var claims = (ex.api && ex.api.claims) || ex.apiClaims || [];
    var run = runById[ex.id];
    var fp = currentFingerprint(ex.dir);
    var verified = !!run && run.result === 'PASS' && run.specFingerprint === fp;
    if (run && run.result === 'PASS' && run.specFingerprint !== fp) {
      staleEvidence.push(ex.id);
    }
    for (var claim of claims) {
      if (!frozen[claim]) { continue; }
      if (!claimedBy[claim]) claimedBy[claim] = [];
      claimedBy[claim].push(ex.id);
      if (verified) {
        if (!verifiedBy[claim]) verifiedBy[claim] = [];
        verifiedBy[claim].push(ex.id);
      }
    }
  }

  // 分层统计
  var tiers = {};
  for (var fq2 in frozen) {
    var tier = frozen[fq2].tier;
    if (!tiers[tier]) { tiers[tier] = { total: 0, claimed: 0, verified: 0 }; }
    tiers[tier].total++;
    if (claimedBy[fq2]) { tiers[tier].claimed++; }
    if (verifiedBy[fq2]) { tiers[tier].verified++; }
  }

  function rate (n, total) { return total ? Math.round((n / total) * 1000) / 1000 : 0; }
  var GATES = { core: { label: '100% verified', threshold: 1.0 }, important: { label: '≥ 90% verified', threshold: 0.9 }, advanced: { label: '≥ 80% verified', threshold: 0.8 } };
  var tierReport = {};
  for (var name of ['core', 'important', 'advanced']) {
    var t = tiers[name] || { total: 0, claimed: 0, verified: 0 };
    var vr = rate(t.verified, t.total);
    tierReport[name] = {
      total: t.total, claimed: t.claimed, verified: t.verified,
      claimedRate: rate(t.claimed, t.total), verifiedRate: vr,
      gate: GATES[name].label, threshold: GATES[name].threshold,
      pass: vr >= GATES[name].threshold,
    };
  }

  var report = {
    generatedAt: new Date().toISOString(),
    evidenceSource: { path: 'docs/evidence/v11-examples-verified.json', measuredAt: evidence.measuredAt || null, mode: evidence.mode || 'unknown' },
    semantics: {
      claimed: 'api.claims 与 inventory 精确匹配（声明）',
      verified: 'claim 所属 example 浏览器验证 PASS 且 specFingerprint 与当前 example.json 一致',
    },
    totalUnits: Object.keys(frozen).length,
    totalClaimed: Object.keys(claimedBy).length,
    totalVerified: Object.keys(verifiedBy).length,
    staleEvidenceExamples: staleEvidence,
    tiers: tierReport,
    verifiedList: Object.keys(verifiedBy).map(function (u) { return { unit: u, tier: frozen[u].tier, examples: verifiedBy[u] }; }),
    claimedNotVerified: Object.keys(claimedBy).filter(function (u) { return !verifiedBy[u]; }).map(function (u) { return { unit: u, tier: frozen[u].tier, examples: claimedBy[u] }; }),
    unclaimedCore: Object.keys(frozen).filter(function (u) { return frozen[u].tier === 'core' && !claimedBy[u]; }),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  for (var t2 of ['core', 'important', 'advanced']) {
    var tr = tierReport[t2];
    console.log('[coverage] ' + t2 + ': claimed ' + tr.claimed + '/' + tr.total + ' | verified ' + tr.verified + '/' + tr.total + ' (' + tr.verifiedRate + ')');
  }
  console.log('[coverage] Core gate (100% verified):', tierReport.core.pass ? 'PASS' : 'FAIL');
  console.log('[coverage] Important gate (>=90% verified):', tierReport.important.pass ? 'PASS' : 'FAIL');
  console.log('[coverage] Advanced gate (>=80% verified):', tierReport.advanced.pass ? 'PASS' : 'FAIL');
  if (staleEvidence.length) { console.log('[coverage] stale evidence (spec changed after run):', staleEvidence.join(',')); }
  console.log('[coverage] → ' + path.relative(REPO, OUT_PATH));
})();
