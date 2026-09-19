/* V1.1 Example Specification 门禁（§15 Spec Freeze / §3 API Bind / §12 Evidence）。
 *
 * 校验每个 examples/<id>/example.json 是否构成完整、可机器验收的 Example Specification：
 *   - §24 完整 schema（learning/effect/api/scene/interaction/ready/validation/coverage/screenshot/license）
 *   - §3/§14 API 精确绑定：primary/supporting/claims 必须逐字存在于 docs/example-api-inventory.json
 *   - §4 primary 1~3 个（1 个 Example 1 个主要教学目标）
 *   - §9 Ready Contract + §10 Validation Contract（validator id 必须是真实 runtime validator）
 *   - §12 apiEvidence：source 文件存在、sourceLocation 行号上确能找到该 API symbol
 *
 * 执行：node tools/examples/spec-validate.cjs [--strict]
 *   --strict 时任何 specStatus != frozen 视为失败。
 * 产出：docs/evidence/v11-spec-validate.json
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..', '..');
const EXAMPLES_DIR = path.join(REPO, 'examples');
const INVENTORY_PATH = path.join(REPO, 'docs', 'example-api-inventory.json');
const OUT_PATH = path.join(REPO, 'docs', 'evidence', 'v11-spec-validate.json');
const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));

function loadTs (file) {
  const built = esbuild.buildSync({ entryPoints: [path.join(REPO, file)], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node18' });
  const mod = new Module(file, module);
  mod.paths = module.paths;
  mod._compile(built.outputFiles[0].text, file);
  return mod.exports;
}

const { VALIDATORS } = loadTs('tools/benchmark/validators/index.ts');
const { CATALOG_BENCHMARKS } = loadTs('tools/benchmark/catalog/catalog100.ts');
const { RECIPES } = loadTs('tools/benchmark/recipes/recipes30.ts');
const VALIDATOR_IDS = new Set(Object.keys(VALIDATORS));
const BENCHMARK_IDS = new Set(CATALOG_BENCHMARKS.map((b) => b.id));
const RECIPE_IDS = new Set(RECIPES.map((r) => r.id));

const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const INVENTORY_UNITS = new Set(Object.keys(inventory.units));
// V0.5.1 DevTools Session Contract（E012：非 Runtime Public API Coverage，走冻结的 session 接口）
const DEVTOOLS_SESSION_UNITS = new Set([
  'DevToolsSession.inspectScene', 'DevToolsSession.inspectNode', 'DevToolsSession.inspectAsset',
  'DevToolsSession.dispatch', 'DevToolsSession.captureFrame', 'DevToolsSession.getRuntimeErrors',
]);
const IN_UNITS = new Set([...INVENTORY_UNITS, ...DEVTOOLS_SESSION_UNITS]);

const SPEC_TOKEN_HINTS = {
  'math.Vec3': 'Vec3',
  'math.Color': 'Color',
};

function evidenceToken (unit) {
  if (SPEC_TOKEN_HINTS[unit]) { return SPEC_TOKEN_HINTS[unit]; }
  const parts = unit.split('.');
  return parts[parts.length - 1];
}

function findSymbolLine (exampleDir, sourceFile, unit) {
  const file = path.join(exampleDir, sourceFile);
  if (!fs.existsSync(file)) { return { error: `source ${sourceFile} not found` }; }
  const token = evidenceToken(unit);
  const callLike = /^[a-z]/.test(token); // method/function 小写开头 → 按调用形态匹配，避免 playOnLoad 误配 play
  const callRe = new RegExp(`\\b${token}\\s*\\(`);
  const wordRe = new RegExp(`\\b${token}\\b`);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const re of [callLike ? callRe : wordRe, wordRe]) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\b|^\s*}\s*from\s+['"]/.test(lines[i])) { continue; }
      if (re.test(lines[i])) { return { line: i + 1 }; }
    }
  }
  return { error: `symbol "${token}" (${unit}) not found in ${sourceFile}` };
}

function validateExample (dirName, spec) {
  const issues = [];
  const exampleDir = path.join(EXAMPLES_DIR, dirName);
  const needStr = (v, field) => { if (typeof v !== 'string' || !v.trim()) { issues.push(`${field} required`); } };
  const needArr = (v, field, min) => { if (!Array.isArray(v) || v.length < (min ?? 0)) { issues.push(`${field} must be array${min ? ' >= ' + min : ''}`); return []; } return v; };

  if (spec.id !== dirName) { issues.push(`id "${spec.id}" != directory "${dirName}"`); }
  needStr(spec.title, 'title'); needStr(spec.category, 'category');
  if (!['draft', 'validated', 'stable'].includes(spec.status)) { issues.push(`bad status ${spec.status}`); }
  if (!['draft', 'frozen', 'blocked'].includes(spec.specStatus)) { issues.push(`bad specStatus ${spec.specStatus}`); }

  // §5 Learning Goal + §19 What you'll learn
  if (!spec.learning || typeof spec.learning !== 'object') { issues.push('learning required'); }
  else {
    needStr(spec.learning.goal, 'learning.goal');
    const points = needArr(spec.learning.points, 'learning.points', 1);
    if (points.some((p) => typeof p !== 'string' || !p.trim())) { issues.push('learning.points items must be non-empty strings'); }
  }

  // §6 Effect Contract
  if (!spec.effect || typeof spec.effect !== 'object') { issues.push('effect required'); }
  else { needStr(spec.effect.functional, 'effect.functional'); needStr(spec.effect.visual, 'effect.visual'); }

  // §3/§4/§12 API 绑定与证据（ui-shell 目录页不承载 Runtime API 教学，绑定走 DOM 合同）
  const uiShell = spec.bench && spec.bench.mode === 'ui-shell';
  if (!spec.api || typeof spec.api !== 'object') { issues.push('api required'); }
  else {
    const primary = needArr(spec.api.primary, 'api.primary', uiShell ? 0 : 1);
    const supporting = needArr(spec.api.supporting, 'api.supporting');
    const claims = needArr(spec.api.claims, 'api.claims', uiShell ? 0 : 1);
    const forbidden = needArr(spec.api.forbiddenShortcut, 'api.forbiddenShortcut', 1);
    if (!uiShell && primary.length > 3) { issues.push(`api.primary has ${primary.length} units (§5: 1 goal + 1~3 primary API)`); }
    for (const [label, arr] of [['primary', primary], ['supporting', supporting], ['claims', claims]]) {
      for (const unit of arr) {
        if (typeof unit !== 'string' || !IN_UNITS.has(unit)) { issues.push(`${label} API "${unit}" not in example-api-inventory (§3: exact binding)`); }
      }
    }
    for (const unit of new Set([...primary, ...supporting])) {
      if (!claims.includes(unit)) { issues.push(`api.claims must include ${label2(unit)} "${unit}"`); }
    }
    if (forbidden.some((f) => typeof f !== 'string' || !f.trim())) { issues.push('forbiddenShortcut items must be strings'); }

    const evidence = needArr(spec.api.evidence, 'api.evidence', uiShell ? 0 : 1);
    for (const ev of evidence) {
      if (!ev || typeof ev !== 'object') { issues.push('api.evidence entries must be objects'); continue; }
      if (!claims.includes(ev.api)) { issues.push(`evidence api "${ev.api}" not in api.claims`); }
      needStr(ev.source, 'evidence.source');
      if (!/^L\d+(-L\d+)?$/.test(ev.sourceLocation || '')) { issues.push(`evidence.sourceLocation bad format: ${ev.sourceLocation}`); }
      if (!VALIDATOR_IDS.has(ev.validator)) { issues.push(`evidence.validator "${ev.validator}" is not a runtime validator`); }
      if (ev.api && ev.source && !ev.sourceLocation) {
        // 缺行号时给出定位（不打断，让 spec-evidence.cjs 回填）
        const found = findSymbolLine(exampleDir, ev.source, ev.api);
        if (found.error) { issues.push(found.error); }
      } else if (ev.api && ev.source && ev.sourceLocation) {
        const found = findSymbolLine(exampleDir, ev.source, ev.api);
        const start = parseInt(String(ev.sourceLocation).replace(/^L/, '').split('-')[0], 10);
        if (!found.error && found.line !== start) { issues.push(`evidence drift: ${ev.api} @ ${ev.source} claimed ${ev.sourceLocation} but symbol at L${found.line}`); }
        if (found.error) { issues.push(found.error); }
      }
    }
  }

  // §7 Scene Structure Contract
  const graphNodes = spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.nodes;
  const allowEmptyGraph = spec.scene && spec.scene.expectedGraph && spec.scene.expectedGraph.allowEmpty === true;
  if (!Array.isArray(graphNodes) || (graphNodes.length === 0 && !allowEmptyGraph)) {
    issues.push('scene.expectedGraph.nodes required');
  }

  // §8/§10 Interaction Contract 一致性
  const steps = needArr(spec.interaction && spec.interaction.steps, 'interaction.steps');
  const interactionValidators = needArr(spec.validation && spec.validation.interaction, 'validation.interaction');
  if (steps.length > 0 !== interactionValidators.length > 0) {
    issues.push('interaction.steps and validation.interaction must be both set or both empty');
  }
  for (const step of steps) {
    if (!step || typeof step !== 'object' || !String(step.action || '').trim() || !String(step.expected || '').trim()) {
      issues.push('interaction.steps entries need {action, expected}');
      break;
    }
  }

  // §9 Ready Contract
  const readyValidators = needArr(spec.ready && spec.ready.validators, 'ready.validators', 1);
  for (const v of readyValidators) { if (!VALIDATOR_IDS.has(v)) { issues.push(`ready validator "${v}" is not a runtime validator`); } }

  // §10 Validation Contract
  const validation = spec.validation || {};
  for (const key of ['functional', 'interaction', 'visual', 'lifecycle', 'capability']) {
    const arr = needArr(validation[key], `validation.${key}`);
    for (const v of arr) { if (!VALIDATOR_IDS.has(v)) { issues.push(`validation.${key} validator "${v}" is not a runtime validator`); } }
  }

  // assets 存在性
  for (const asset of needArr(spec.assets, 'assets')) {
    if (!fs.existsSync(path.join(exampleDir, asset))) { issues.push(`asset missing: ${asset}`); }
  }

  // Coverage 引用可解析
  const coverage = spec.coverage || {};
  for (const b of needArr(coverage.benchmarkRefs, 'coverage.benchmarkRefs')) {
    if (!BENCHMARK_IDS.has(b)) { issues.push(`coverage.benchmarkRefs unknown benchmark "${b}"`); }
  }
  for (const r of needArr(coverage.recipeRefs, 'coverage.recipeRefs')) {
    if (!RECIPE_IDS.has(r)) { issues.push(`coverage.recipeRefs unknown recipe "${r}"`); }
  }

  if (!spec.screenshot || typeof spec.screenshot !== 'object') { issues.push('screenshot object required'); }
  if (!spec.license || typeof spec.license !== 'object') { issues.push('license object required'); }

  return issues;
}

function label2 (unit) { return unit.includes('.') ? 'member' : 'unit'; }

(function main () {
  const strict = process.argv.includes('--strict');
  const dirs = fs.readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'shared' && e.name !== 'node_modules')
    .map((e) => e.name)
    .sort();
  const report = { measuredAt: new Date().toISOString(), total: 0, frozen: 0, draft: 0, blocked: 0, examples: [] };
  let failed = false;
  for (const dir of dirs) {
    const file = path.join(EXAMPLES_DIR, dir, 'example.json');
    if (!fs.existsSync(file)) { continue; }
    report.total++;
    let spec;
    try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { report.examples.push({ id: dir, specStatus: 'invalid', issues: [`invalid JSON: ${e.message}`] }); failed = true; continue; }
    const issues = validateExample(dir, spec);
    if (spec.specStatus === 'frozen') { report.frozen++; } else if (spec.specStatus === 'blocked') { report.blocked++; } else { report.draft++; }
    if (spec.specStatus === 'frozen' && issues.length > 0) { failed = true; }
    if (strict && spec.specStatus !== 'frozen') { issues.push('specStatus must be frozen (--strict)'); failed = true; }
    if (issues.length > 0) { failed = true; }
    report.examples.push({ id: dir, specStatus: spec.specStatus || 'missing', issues });
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n');
  for (const ex of report.examples) {
    for (const issue of ex.issues) { console.log(`[${ex.id}] ${issue}`); }
  }
  console.log(`[spec-validate] ${report.total} examples: ${report.frozen} frozen / ${report.draft} draft / ${report.blocked} blocked → ${path.relative(REPO, OUT_PATH)}`);
  process.exitCode = failed ? 1 : 0;
})();
