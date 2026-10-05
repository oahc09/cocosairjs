/* V1.1 Example Specification 门禁（§15 Spec Freeze / §3 API Bind / §12 Evidence）。
 *
 * 校验每个 examples/<id>/example.json 是否构成完整、可机器验收的 Example Specification：
 *   - §24 完整 schema（learning/effect/api/scene/interaction/ready/validation/coverage/screenshot/license）
 *   - §3/§14 API 精确绑定：primary/supporting/claims 必须逐字存在于 docs/example-api-inventory.json
 *   - §4 primary 1~3 个（1 个 Example 1 个主要教学目标）
 *   - §9 Ready Contract + §10 Validation Contract（validator id 必须是真实 runtime validator）
 *   - §64 Capability Contract：声明 capability-status 必须有 capabilityExpectations（扩展名 + 合法状态集）
 *   - §52 DevTools 边界：使用 DevToolsSession 单元的示例必须 requiresDevTools
 *   - §12 apiEvidence：source 文件存在、sourceLocation 行号上确能找到该 API symbol
 *
 * 执行：node tools/examples/spec-validate.cjs [--strict] [--out=<path>] [--examples-dir=<path>]
 *   --strict        任何 specStatus != frozen 视为失败。
 *   --out=          报告落点（仓库相对或绝对）；默认写发布证据正典。
 *   --examples-dir= 被校验的 examples 目录（负控/子集用）；必须与 --out= 同时给出。
 * 产出：docs/evidence/spec-validation.json
 *
 * F-132 写盘纪律：发布证据正典**只由绿跑写出**。任何 issue（含故意负控、--strict 下的 draft）
 * 一律不落正典，红态报告必须显式 --out= 到非正典路径。
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const REPO = path.resolve(__dirname, '..', '..');
const CANONICAL_EXAMPLES_DIR = path.join(REPO, 'examples');
const INVENTORY_PATH = process.env.COCOSAIR_API_INVENTORY || path.join(REPO, 'docs', 'example-api-inventory.json');
const CANONICAL_OUT = path.join(REPO, 'docs', 'evidence', 'spec-validation.json');
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

// §12 行号定位与 spec-evidence 回填共用同一实现（含注释/多行 import 过滤），
// 否则「冻结门禁」比回填器更松，evidence 可以指向注释行仍算 frozen 合规。
const { findSymbolLine, declaredValidatorSet } = require(path.join(__dirname, 'spec-evidence.cjs'));

function validateExample (examplesDir, dirName, spec) {
  const issues = [];
  const exampleDir = path.join(examplesDir, dirName);
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
      const dup = arr.filter((v, i, a) => a.indexOf(v) !== i);
      if (dup.length) { issues.push(`api.${label} has duplicate units: ${[...new Set(dup)].join(', ')} (§3: exact binding, no double counting)`); }
    }
    for (const unit of new Set([...primary, ...supporting])) {
      if (!claims.includes(unit)) { issues.push(`api.claims must include ${label2(unit)} "${unit}"`); }
    }
    if (forbidden.some((f) => typeof f !== 'string' || !f.trim())) { issues.push('forbiddenShortcut items must be strings'); }

    const evidence = needArr(spec.api.evidence, 'api.evidence', uiShell ? 0 : 1);
    const evDup = evidence.map((e) => e && e.api).filter((v, i, a) => v && a.indexOf(v) !== i);
    if (evDup.length) { issues.push(`api.evidence has duplicate entries: ${[...new Set(evDup)].join(', ')}`); }
    // §12：claim=声明 / evidence+PASS=verified —— 无 evidence 的 claim 不得进入 frozen；
    // evidence 绑定的 validator 必须是本示例 ready/validation 真正声明的，否则永不执行。
    const declaredValidators = declaredValidatorSet(spec);
    for (const claim of new Set(claims)) {
      if (!evidence.some((e) => e && e.api === claim)) { issues.push(`§12: claim "${claim}" has no apiEvidence (apiClaims=声明, apiEvidence+PASS=verified)`); }
    }
    for (const ev of evidence) {
      if (!ev || typeof ev !== 'object') { issues.push('api.evidence entries must be objects'); continue; }
      if (!claims.includes(ev.api)) { issues.push(`evidence api "${ev.api}" not in api.claims`); }
      needStr(ev.source, 'evidence.source');
      if (!/^L\d+(-L\d+)?$/.test(ev.sourceLocation || '')) { issues.push(`evidence.sourceLocation bad format: ${ev.sourceLocation}`); }
      if (!VALIDATOR_IDS.has(ev.validator)) { issues.push(`evidence.validator "${ev.validator}" is not a runtime validator`); }
      else if (!declaredValidators.has(ev.validator)) { issues.push(`§12: evidence "${ev.api}" validator "${ev.validator}" 未被本示例 ready/validation 声明（detached evidence，运行期不会执行）`); }
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

  // §64 Capability Contract：声明 capability-status 必须给出机器可读的期望状态
  const EXT_STATUSES = ['supported', 'decoder-required', 'device-dependent', 'fallback', 'unsupported'];
  const declaresCapability = [...(validation.functional || []), ...(validation.capability || [])].includes('capability-status');
  const expectations = validation.capabilityExpectations;
  if (declaresCapability) {
    const list = needArr(expectations, 'validation.capabilityExpectations', 1);
    for (const exp of list) {
      if (!exp || typeof exp !== 'object') { issues.push('capabilityExpectations entries must be objects'); continue; }
      if (typeof exp.extension !== 'string' || !exp.extension.trim()) { issues.push('capabilityExpectations[].extension required'); }
      if (!Array.isArray(exp.statuses) || exp.statuses.length === 0) { issues.push(`capabilityExpectations[${exp.extension}].statuses must be non-empty array`); continue; }
      for (const s of exp.statuses) { if (!EXT_STATUSES.includes(s)) { issues.push(`capabilityExpectations[].statuses "${s}" is not a GLTFExtensionStatus`); } }
    }
  } else if (expectations !== undefined) {
    issues.push('validation.capabilityExpectations present but capability-status not declared');
  }

  // §65 期望值合同（item 2 的静态镜像）：声明了"值合同"validator 就必须给出结构可判定的期望，
  // 豁免必须落在源码派生行上。运行期才检查会把著述错误/行漂移拖到 40 例浏览器矩阵才暴露。
  const expChecks = require(path.join(REPO, 'tools', 'verify', 'expectation-checks.cjs'));
  const EXPECTATION_BOUND = ['transform-equals', 'material-property', 'asset-loaded'];
  const allDeclared = new Set([...(validation.functional || []), ...(validation.interaction || []), ...(validation.capability || [])]);
  const specExpectations = spec.validationExpectations || {};
  for (const id of EXPECTATION_BOUND) {
    const exp = specExpectations[id];
    const hasExp = !!exp && Object.keys(exp).length > 0;
    if (!allDeclared.has(id)) {
      if (hasExp) { issues.push(`validationExpectations["${id}"] present but validator not declared（死期望，运行期不会执行）`); }
      continue;
    }
    if (!hasExp) {
      const excl = (spec.expectationExclusions || {})[id];
      issues.push(`validation declares "${id}" but validationExpectations["${id}"] is missing${excl ? '（只有豁免不构成合同）' : ''}：validator 名承诺的行为无人比对`);
      continue;
    }
    if (id === 'asset-loaded') {
      const paths = Array.isArray(exp.paths) ? exp.paths : [];
      const kinds = exp.kinds && Object.keys(exp.kinds).length;
      if (!paths.length && !kinds) {
        issues.push('validationExpectations["asset-loaded"] 既无 paths 也无 kinds（结构上空判）');
      }
      for (const p of paths) {
        if (!p || !(Array.isArray(p.provenance) ? p.provenance.length : p.provenance)) {
          issues.push(`validationExpectations["asset-loaded"].path "${p && p.path}" 缺出处（该路径未绑定到源码 load 调用行）`);
        }
      }
      if (kinds && !paths.length && !(Array.isArray(exp.provenance) && exp.provenance.length)) {
        issues.push('validationExpectations["asset-loaded"].kinds 需要 entry provenance（kind 计数出自源码哪一行无从核对）');
      }
      continue;
    }
    for (const [node, entry] of Object.entries(exp)) {
      if (node === 'handAuthored') { continue; }
      if (!entry || typeof entry !== 'object') { issues.push(`validationExpectations["${id}"].${node} must be object`); continue; }
      const comparable = id === 'transform-equals'
        ? ['position', 'rotationEuler', 'scale'].some((k) => entry[k] !== undefined)
        : (Array.isArray(entry.slots) && entry.slots.length > 0) || entry.props || entry.effect || entry.materialName;
      if (!comparable) { issues.push(`validationExpectations["${id}"].${node} 无可比对字段（结构上空判）`); }
      const propList = Object.values(entry.props || {});
      const propsProvenanced = propList.length > 0 && propList.every((p) => p && p.provenance);
      const slotsProvenanced = (entry.slots || []).length > 0 && (entry.slots || []).every((s) => s && Object.values(s.props || {}).length > 0 && Object.values(s.props || {}).every((p) => p && p.provenance));
      const carriesProof = Array.isArray(entry.provenance) && entry.provenance.length > 0;
      const namedOnly = !propList.length && !(entry.slots || []).length && !!(entry.effect || entry.materialName);
      if (!carriesProof && !propsProvenanced && !slotsProvenanced && !namedOnly) {
        issues.push(`validationExpectations["${id}"].${node} 缺出处（entry provenance 或 prop provenance）`);
      }
      if (Array.isArray(entry.slots)) {
        const seen = new Set();
        for (const s of entry.slots) {
          if (!s || typeof s.slot !== 'number') { issues.push(`validationExpectations["${id}"].${node}.slots[] 每项需要数字 slot（否则默认槽会重复比对同一个材质）`); continue; }
          if (seen.has(s.slot)) { issues.push(`validationExpectations["${id}"].${node} slot ${s.slot} 重复`); }
          seen.add(s.slot);
        }
      }
    }
  }
  for (const [id, block] of Object.entries(spec.expectationExclusions || {})) {
    if (!allDeclared.has(id)) { issues.push(`expectationExclusions["${id}"] present but validator not declared`); }
    for (const [node, e] of Object.entries(block || {})) {
      const verdict = expChecks.groundingVerdict(exampleDir, e);
      if (verdict !== true) { issues.push(`expectationExclusions[${id}].${node}: ${verdict}`); }
    }
  }
  // 出处逐条可核对：文件定位不到 / 行不存在 / 指向注释 / 引文与行号打脸，一律静态红。
  issues.push(...expChecks.provenanceIssues(exampleDir, spec));

  // §52 DevTools 边界：使用 Session Contract 单元的示例必须声明 requiresDevTools
  const apiUnits = [...((spec.api && spec.api.primary) || []), ...((spec.api && spec.api.supporting) || []), ...((spec.api && spec.api.claims) || [])];
  if (apiUnits.some((u) => DEVTOOLS_SESSION_UNITS.has(u)) && spec.requiresDevTools !== true) {
    issues.push('uses DevToolsSession units but requiresDevTools is not true (§52)');
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
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const flagValue = (name) => {
    const prefix = `--${name}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit === undefined ? undefined : hit.slice(prefix.length);
  };
  const outArg = flagValue('out');
  const examplesArg = flagValue('examples-dir');
  const examplesDir = path.resolve(REPO, examplesArg ?? 'examples');
  const outPath = path.resolve(REPO, outArg ?? CANONICAL_OUT);
  const outIsCanonical = path.relative(outPath, CANONICAL_OUT) === '';

  if (examplesArg !== undefined && outArg === undefined) {
    console.log('[spec-validate] --examples-dir 是子集/外部运行 ⇒ 必须同时给出 --out=<非正典路径>，不得写发布证据');
    process.exitCode = 2; return;
  }
  if (!fs.existsSync(examplesDir)) {
    console.log(`[spec-validate] --examples-dir 不存在：${examplesDir}`);
    process.exitCode = 2; return;
  }
  const dirs = fs.readdirSync(examplesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'shared' && e.name !== 'node_modules')
    .map((e) => e.name)
    .sort();
  const report = { measuredAt: new Date().toISOString(), total: 0, frozen: 0, draft: 0, blocked: 0, examples: [] };
  let failed = false;
  for (const dir of dirs) {
    const file = path.join(examplesDir, dir, 'example.json');
    if (!fs.existsSync(file)) { continue; }
    report.total++;
    let spec;
    try { spec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { report.examples.push({ id: dir, specStatus: 'invalid', issues: [`invalid JSON: ${e.message}`] }); failed = true; continue; }
    const issues = validateExample(examplesDir, dir, spec);
    if (spec.specStatus === 'frozen') { report.frozen++; } else if (spec.specStatus === 'blocked') { report.blocked++; } else { report.draft++; }
    if (spec.specStatus === 'frozen' && issues.length > 0) { failed = true; }
    if (strict && spec.specStatus !== 'frozen') { issues.push('specStatus must be frozen (--strict)'); failed = true; }
    if (issues.length > 0) { failed = true; }
    report.examples.push({ id: dir, specStatus: spec.specStatus || 'missing', issues });
  }
  // 反空转：扫到 0 例（目录拼错/空目录）不是「全绿」，否则空集合恒真会把「没校验任何东西」写成洁净证据。
  if (report.total === 0) { failed = true; }
  const issueCount = report.examples.reduce((n, e) => n + e.issues.length, 0);
  for (const ex of report.examples) {
    for (const issue of ex.issues) { console.log(`[${ex.id}] ${issue}`); }
  }
  // F-132：正典发布证据只由绿跑写出。红跑（含故意负控）保留上一份洁净证据，绝不覆写。
  if (outIsCanonical && failed) {
    console.log(`[spec-validate] [F-132] ${report.total} examples / ${issueCount} issue(s) ⇒ 本轮判定红，拒绝覆写 ${path.relative(REPO, CANONICAL_OUT)}（红态报告请显式 --out=<非正典路径>）`);
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`[spec-validate] ${report.total} examples: ${report.frozen} frozen / ${report.draft} draft / ${report.blocked} blocked → ${path.relative(REPO, outPath)}`);
  }
  process.exitCode = failed ? 1 : 0;
})();
