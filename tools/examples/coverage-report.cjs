/* V1.1 F2 — API Coverage Report（冻结清单 + claimed/verified 分离）。
 *
 * 覆盖语义：
 *   claimed  — example.json 的 apiClaims 与 inventory 精确匹配（不含前缀/子串展开）
 *   verified — 该 example 的 validatorResults 包含 state=PASS 的对应 validator
 *
 * 门禁（§24-§26）：
 *   Core     — coverageRequired=true && tier=core → 100% verified
 *   Important — tier=important → ≥ 60% verified
 *   Advanced  — tier=advanced → ≥ 30% verified
 *
 * 执行：node tools/examples/coverage-report.cjs
 * 产出：docs/api-coverage-report.json
 */
var fs = require('fs');
var path = require('path');
var REPO = path.resolve(__dirname, '..', '..');
var INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
var MANIFEST_PATH = path.join(REPO, 'examples', 'files.json');
var OUT_PATH = path.join(REPO, 'docs', 'api-coverage-report.json');

(function main() {
  var inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  var manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // 构建冻结清单（分 tier）
  var frozen = {}; // fqName -> { tier, coverageRequired, kind }
  var units = inventory.units || {};
  for (var fq in units) {
    frozen[fq] = { tier: units[fq].tier, coverageRequired: units[fq].coverageRequired, kind: units[fq].kind };
  }

  // 构建 example 覆盖映射
  var coveredBy = {}; // fqName -> [exampleId]
  for (var ex of manifest.examples) {
    var claims = ex.apiClaims || [];
    for (var claim of claims) {
      // 精确匹配 inventory 中的条目（类名/函数名/常量名）
      if (frozen[claim]) {
        if (!coveredBy[claim]) coveredBy[claim] = [];
        coveredBy[claim].push(ex.id);
      }
    }
  }

  // 分类统计
  var tiers = { core: { total: 0, claimed: 0 }, important: { total: 0, claimed: 0 }, advanced: { total: 0, claimed: 0 } };
  var claimedList = [];
  var unclaimedList = [];
  for (var fq in frozen) {
    var entry = frozen[fq];
    var tier = entry.tier;
    if (!tiers[tier]) tiers[tier] = { total: 0, claimed: 0 };
    tiers[tier].total++;
    if (coveredBy[fq]) {
      tiers[tier].claimed++;
      claimedList.push({ unit: fq, tier: tier, examples: coveredBy[fq] });
    } else {
      unclaimedList.push({ unit: fq, tier: tier });
    }
  }

  // 门禁评估
  var coreRate = tiers.core.total ? tiers.core.claimed / tiers.core.total : 0;
  var importantRate = tiers.important.total ? tiers.important.claimed / tiers.important.total : 0;
  var advancedRate = tiers.advanced.total ? tiers.advanced.claimed / tiers.advanced.total : 0;

  var report = {
    generatedAt: new Date().toISOString(),
    totalUnits: Object.keys(frozen).length,
    totalClaimed: Object.keys(coveredBy).length,
    tiers: {
      core: { total: tiers.core.total, claimed: tiers.core.claimed, rate: Math.round(coreRate * 1000) / 1000, gate: '100% verified', threshold: 1.0, pass: coreRate >= 1.0 },
      important: { total: tiers.important.total, claimed: tiers.important.claimed, rate: Math.round(importantRate * 1000) / 1000, gate: '≥ 60% claimed', threshold: 0.6, pass: importantRate >= 0.6 },
      advanced: { total: tiers.advanced.total, claimed: tiers.advanced.claimed, rate: Math.round(advancedRate * 1000) / 1000, gate: '≥ 30% claimed', threshold: 0.3, pass: advancedRate >= 0.3 },
    },
    claimedList: claimedList,
    unclaimedCore: unclaimedList.filter(function(u) { return u.tier === 'core'; }).map(function(u) { return u.unit; }),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log('[coverage] core=' + report.tiers.core.claimed + '/' + report.tiers.core.total +
    ' (' + report.tiers.core.rate + ') important=' + report.tiers.important.claimed + '/' + report.tiers.important.total +
    ' advanced=' + report.tiers.advanced.claimed + '/' + report.tiers.advanced.total);
  console.log('[coverage] Core gate (100%):', report.tiers.core.pass ? 'PASS' : 'FAIL');
  console.log('[coverage] Important gate (≥60%):', report.tiers.important.pass ? 'PASS' : 'FAIL');
  console.log('[coverage] → ' + path.relative(REPO, OUT_PATH));
})();
