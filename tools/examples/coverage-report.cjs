/* V1.1 §27 — API Coverage Report：从 API Inventory + example.json apiClaims 生成覆盖矩阵。
 * 执行：node tools/examples/coverage-report.cjs
 * 产出：docs/api-coverage-report.json
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
const MANIFEST_PATH = path.join(REPO, 'examples', 'files.json');
const OUT_PATH = path.join(REPO, 'docs', 'api-coverage-report.json');

(function main() {
  var inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  var manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // Build set of all coverage units
  var allUnits = new Set();
  var unitInfo = {};
  for (var fq in inventory.classes) {
    var cls = inventory.classes[fq];
    allUnits.add(fq);
    unitInfo[fq] = { type: 'class' };
    cls.methods.forEach(function(m) {
      var key = fq + '.' + m;
      allUnits.add(key);
      unitInfo[key] = { type: 'method', parent: fq };
    });
    cls.staticMethods.forEach(function(m) {
      var key = fq + '.' + m;
      allUnits.add(key);
      unitInfo[key] = { type: 'static', parent: fq };
    });
  }
  for (var fn in inventory.functions) {
    allUnits.add(fn);
    unitInfo[fn] = { type: 'function' };
  }
  for (var cst in inventory.constants) {
    allUnits.add(cst);
    unitInfo[cst] = { type: 'constant' };
  }

  // Match apiClaims from examples to coverage units
  var covered = new Set();
  var coverage = [];
  for (var ex of manifest.examples) {
    var claims = ex.apiClaims || [];
    var matched = [];
    for (var claim of claims) {
      // Exact match or prefix match (e.g. GLTFLoader matches GLTFLoader.parseAsync)
      for (var unit of allUnits) {
        if (unit === claim || unit.startsWith(claim + '.') || claim.includes(unit)) {
          covered.add(unit);
          matched.push(unit);
        }
      }
    }
    coverage.push({ id: ex.id, title: ex.title, claims: claims, matched: matched });
  }

  // Categorize coverage
  var coreUnits = ['createAirApp', 'Scene', 'Node', 'MeshRenderer', 'Camera', 'DirectionalLight',
    'Vec3', 'Layers', 'GLTFLoader', 'GLTFAsset', 'GLTFInstance'];
  var coreCovered = coreUnits.filter(function(u) {
    return covered.has(u) || Array.from(covered).some(function(c) { return c.startsWith(u + '.'); });
  });
  var importantCovered = Array.from(covered).filter(function(c) {
    return /material|texture|animation|skeleton|input|tween/i.test(c);
  });

  var report = {
    generatedAt: new Date().toISOString(),
    totalCoverageUnits: allUnits.size,
    coveredUnits: covered.size,
    coverageRate: allUnits.size ? Math.round(covered.size / allUnits.size * 1000) / 1000 : 0,
    coreGate: {
      required: coreUnits.length,
      covered: coreCovered.length,
      rate: coreUnits.length ? Math.round(coreCovered.length / coreUnits.length * 1000) / 1000 : 0,
      pass: coreCovered.length / coreUnits.length >= 0.8,
    },
    examples: coverage,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log('[coverage] units=' + report.totalCoverageUnits + ' covered=' + report.coveredUnits +
    ' rate=' + report.coverageRate + ' core=' + report.coreGate.rate + ' → ' + path.relative(REPO, OUT_PATH));
})();
