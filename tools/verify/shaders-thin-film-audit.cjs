'use strict';
// Independent in-memory clones of actual captures. Does not launch a browser,
// alter raw reports, or treat schema validity as a full Engine Gate PASS.
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('./shaders-thin-film-evidence.cjs');
const oracle = require('./shaders-thin-film-oracle.cjs');
const ROOT = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));

function audit(reports) {
  const baselines = [], mutations = [];
  for (const file of reports) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const files = { functional: report.rawInputs.functional.path, performance: report.rawInputs.performance.path };
    const functional = JSON.parse(fs.readFileSync(path.resolve(ROOT, files.functional), 'utf8'));
    const performance = JSON.parse(fs.readFileSync(path.resolve(ROOT, files.performance), 'utf8'));
    const engine = report.gates.Visual.cases[0].browser;
    const checked = evidence.validateEngine(report, functional, performance, engine, files);
    baselines.push({ engine, schemaValid: checked.ok, effectStatus: report.status,
      gates: Object.fromEntries(Object.entries(report.gates).map(([gate, value]) => [gate, value.status])),
      collectionExits: { functional: functional.exitCode, performance: performance.exitCode }, errors: checked.errors });
    const variants = [
      ['visual-oracle-empty', r => r.gates.Visual.cases[0].observation.algorithm.raw = []],
      ['phase-wrong', r => r.gates.Visual.cases[0].observation.capture.params.phase = .25],
      ['source-drift', r => r.identity.source[0].sha256 = '0'.repeat(64)],
      ['sdk-drift', r => r.identity.sdk[0].sha256 = '0'.repeat(64)],
      ['runner-drift', r => r.identity.runner[0].sha256 = '0'.repeat(64)],
      ['refs-inflated', r => r.gates.Resource.cases[0].observation.cycles[0].allocations[0].released = 9],
      ['resource-all-zero', r => r.gates.Resource.cases[0].observation.cycles.forEach(c => c.created = clone(c.before))],
      ['resource-cycle-missing', r => r.gates.Resource.cases[0].observation.cycles.pop()],
      ['case-missing', r => r.gates.Visual.cases.pop()],
      ['case-duplicate', r => r.gates.Visual.cases[1] = clone(r.gates.Visual.cases[0])],
      ['fixed-time-wrong', r => r.gates.Visual.cases[0].fixed.timeSeconds = 99],
      ['collection-exit-rewritten', r => r.gates.Visual.cases[0].execution.collectionExecution.exitCode = 27],
      ['collection-command-rewritten', r => r.gates.Visual.cases[0].execution.collectionExecution.command = 'node invented'],
      ['scoped-command-rewritten', r => r.gates.Visual.cases[0].execution.command = 'node invented'],
      ['aggregate-forced-complete', r => { r.status = 'PASS'; r.completed = true; r.subset = false; r.issues = []; r.gates.Runtime.cases[0].observation.after.instance = -1; }],
      ['raw-sha-drift', r => r.rawInputs.functional.sha256 = '0'.repeat(64)],
      ['png-sha-drift', r => r.gates.Visual.cases[0].observation.screenshot.sha256 = '0'.repeat(64)],
      ['boundary-accepted-invalid', r => r.gates.Boundary.cases.find(c => c.observation.boundary === 'invalid').observation.actual.ok = true],
      ['performance-cost-rewritten', r => r.gates.Performance.cases[0].observation.cpuSubmissionMs[0] = -1],
    ];
    for (const [name, mutate] of variants) {
      const altered = clone(report); mutate(altered);
      const rejected = !evidence.validateEngine(altered, functional, performance, engine, files).ok;
      mutations.push({ engine, name, rejected });
    }
    if (engine === 'chromium') {
      const raw = performance.engines.find(e => e.engine === engine).performance[0];
      const variants = [
        ['gpu-only-warmup', p => p.gpuSamples = p.gpuSamples.slice(0, 1)],
        ['gpu-missing-deletion', p => p.queryEvents = p.queryEvents.filter(e => e.event !== 'deleted')],
        ['gpu-disjoint', p => p.queryEvents.find(e => e.event === 'resolved').disjoint = true],
        ['gpu-duplicate', p => p.gpuSamples.push(clone(p.gpuSamples[40]))],
        ['command-arbitrary', p => p.commands[40].operation = 'invented-method'],
        ['dispatch-arbitrary', p => p.draws[40].operation = 'invented-method'],
        ['dispatch-allzero', p => p.draws.forEach(r => r.ms = 0)],
        ['update-allzero', p => p.updateCalls.forEach(r => r.ms = 0)],
        ['cpu-nonfinite', p => p.commands[40].ms = NaN],
        ['readpixels-in-window', p => p.readPixelsDuringWindow = 1],
        ['coi-not-observed', p => p.precision.crossOriginIsolated = false],
        ['native-gfx-zero', p => p.gfxObjects.bufferCount = 0],
        ['profile-dpr-substituted', p => p.profile.dpr = 1.25],
        ['viewport-dpr-substituted', p => p.viewport.dpr = 2],
      ];
      for (const [name, mutate] of variants) {
        const altered = clone(raw); mutate(altered);
        mutations.push({ engine, name, rejected: evidence.checkPerformance(altered, altered.profile).errors.length > 0 });
      }
      const alteredResources = clone(functional.engines[0].resources);
      alteredResources.rows.forEach(r => { r.created = clone(r.before); r.refsBefore = [0, 0, 0]; });
      mutations.push({ engine, name: 'native-resource-no-allocation', rejected: oracle.resourceAudit(alteredResources).errors.length > 0 });
    }
  }
  return { ok: baselines.length === 3 && baselines.every(b => b.schemaValid) && mutations.every(m => m.rejected),
    executionChannel: 'native subagent', method: 'READ_ONLY_ACTUAL_CAPTURE_CLONE_AUDIT', browserRunsAdded: 0,
    baselines, mutations, acceptedActualReports: baselines.filter(b => b.schemaValid).length,
    rejectedMutations: mutations.filter(m => m.rejected).length,
    limitations: ['Schema acceptance is not effect PASS; Firefox Performance LIMITED and WebKit Runtime BLOCKED remain.',
      'Only raw immutable real captures are cloned; no synthetic browser results are introduced.'] };
}
module.exports = { audit };
function main(args = process.argv.slice(2)) {
  const value = key => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  const reports = value('reports')?.split(','), out = value('out');
  if (!reports || reports.length !== 3 || !out || fs.existsSync(out)) throw new Error('Three --reports and new explicit --out are required');
  const startedAt = new Date().toISOString(), result = audit(reports);
  result.execution = { command: [process.execPath, __filename, ...args].join(' '), cwd: ROOT,
    startedAt, endedAt: new Date().toISOString(), exitCode: result.ok ? 0 : 1 };
  result.inputs = reports.map(evidence.fingerprint);
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ out, ok: result.ok, acceptedActualReports: result.acceptedActualReports,
    rejectedMutations: result.rejectedMutations, failedMutations: result.mutations.filter(m => !m.rejected) }));
  return result.ok ? 0 : 1;
}
if (require.main === module) { try { process.exitCode = main(); } catch (error) { console.error(error); process.exitCode = 1; } }
