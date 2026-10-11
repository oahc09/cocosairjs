'use strict';
// Small repository index; complete immutable real captures remain in output/.
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('./shaders-thin-film-evidence.cjs');
const contract = require('./shaders-effect-contract.cjs');
const ROOT = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const p50 = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function summarize(files, auditFile) {
  const engines = files.map(file => {
    const report = read(file), engine = report.gates.Visual.cases[0].browser;
    const raw = read(report.rawInputs.performance.path);
    const profiles = raw.engines.find(e => e.engine === engine).performance.map(p => {
      const result = evidence.checkPerformance(p, p.profile);
      return { requested: p.profile, observed: p.viewport,
        status: result.errors.length ? 'LIMITED' : 'PASS', reasons: result.errors,
        steadyFrames: result.measurements, warmupFrames: p.warmupFrames,
        afterDrawIntervalP50Ms: p50(result.frameMs), precision: p.precision,
        positiveSamples: Object.fromEntries(Object.entries(result.samples).map(([kind, rows]) =>
          [kind, { total: rows.length, positive: rows.filter(x => x > 0).length, zero: rows.filter(x => x === 0).length }])),
        gpuTimestamp: { status: p.timerAvailable ? 'measured' : 'unavailable',
          steadySamples: result.gpu.length, millisecondsP50: result.gpu.length ? p50(result.gpu.map(g => g.ms)) : null },
        window: p.window, readPixelsDuringWindow: p.readPixelsDuringWindow,
        isolation: { crossOriginIsolated: p.precision.crossOriginIsolated,
          responseCOOP: p.httpDocument.observedHeaders['cross-origin-opener-policy'],
          responseCOEP: p.httpDocument.observedHeaders['cross-origin-embedder-policy'] } };
    });
    return { engine, browserVersion: report.gates.Visual.cases[0].browserVersion,
      status: report.status, completed: report.completed, subset: report.subset,
      gates: Object.fromEntries(Object.entries(report.gates).map(([name, gate]) => [name, { status: gate.status,
        declared: gate.scope.expectedCaseIds.length, measured: gate.cases.filter(c => c.status === 'PASS').length,
        skipped: gate.cases.filter(c => c.status !== 'PASS').length }])),
      report: evidence.fingerprint(file), rawInputs: report.rawInputs,
      collectionExits: { functional: read(report.rawInputs.functional.path).exitCode, performance: raw.exitCode },
      issues: report.issues, performanceProfiles: profiles };
  });
  const audit = read(auditFile);
  return { schemaVersion: 'e02-thin-film-summary/1', task: 'Wave1/E02', executionChannel: 'native subagent',
    status: engines.every(e => e.status === 'PASS') ? 'PASS' : 'BLOCKED',
    completed: engines.every(e => e.completed), subset: !engines.every(e => e.completed),
    engineGate: engines.every(e => e.status === 'PASS') ? 'PASS' : 'BLOCKED', agentGate: 'NOT_RUN',
    upstreamCommit: 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a',
    validator: evidence.fingerprint(__filename), engines,
    audit: { report: evidence.fingerprint(auditFile), acceptedActualReports: audit.acceptedActualReports,
      rejectedMutations: audit.rejectedMutations, ok: audit.ok, browserRunsAdded: audit.browserRunsAdded },
    limitations: [
      'WebKit 26.6 same-page live-resize PNG exposes body while native framebuffer readback remains correct: Runtime BLOCKED; no GL/export compensation.',
      'Firefox mobile profile explicitly requested DPR2 but observed DPR1/backing390x844: scope unmet, Performance LIMITED, no substitution of requested state.',
      'CPU zero samples mean below the observed timer precision, not zero cost; Queue.submit is bookkeeping, not GPU command submission.',
      'Performance window ran sequential browsers/profiles with agent token; operating-system/background load was not isolated.',
      'Full data is in output/; schema-valid/scoped verifier exit0 is not an all-browser Engine Gate or Agent Gate PASS.',
      'Display path OETF plus display-space straight-alpha blend is distinct from the linear-straight RGBA core; not a physical interference model.'
    ] };
}

function validateSummary(summary) { try {
  if (summary?.schemaVersion !== 'e02-thin-film-summary/1' || summary.engines?.length !== 3 ||
      new Set(summary.engines.map(e => e.engine)).size !== 3 ||
      ['chromium', 'firefox', 'webkit'].some(engine => !summary.engines.some(e => e.engine === engine))) {
    return { ok: false, errors: ['summary exact engine scope'] };
  }
  const errors = [];
  for (const engine of summary.engines) {
    if (!evidence.checkFile(engine.report)) { errors.push('normalized report SHA drift'); continue; }
    const report = read(engine.report.path), files = { functional: report.rawInputs.functional.path, performance: report.rawInputs.performance.path };
    const result = evidence.validateEngine(report, read(files.functional), read(files.performance), engine.engine, files);
    if (!result.ok) errors.push(...result.errors);
  }
  if (!evidence.checkFile(summary.audit.report)) errors.push('audit SHA drift');
  else {
    const audit = read(summary.audit.report.path);
    if (!audit.ok || audit.acceptedActualReports !== 3 || audit.rejectedMutations !== 72 || audit.mutations.some(m => !m.rejected) ||
        contract.canonical(audit.inputs) !== contract.canonical(summary.engines.map(e => e.report))) errors.push('actual clone audit binding');
  }
  const expected = summarize(summary.engines.map(e => e.report.path), summary.audit.report.path);
  const payload = { ...summary }; delete payload.execution;
  if (contract.canonical(payload) !== contract.canonical(expected)) errors.push('summary independently reduced values/status/fixed identity mismatch');
  if (summary.execution?.purpose !== 'READ_ONLY_REAL_CAPTURE_SUMMARY' || summary.execution.exitCode !== 0 ||
      summary.execution.cwd !== ROOT || !Number.isFinite(Date.parse(summary.execution.startedAt)) ||
      !Number.isFinite(Date.parse(summary.execution.endedAt)) || summary.execution.endedAt < summary.execution.startedAt) errors.push('summary actual validation execution');
  return { ok: errors.length === 0, errors, effectStatus: expected.status, agentGate: expected.agentGate,
    measured: expected.engines.reduce((n, e) => n + Object.values(e.gates).reduce((n, g) => n + g.measured, 0), 0),
    skipped: expected.engines.reduce((n, e) => n + Object.values(e.gates).reduce((n, g) => n + g.skipped, 0), 0) };
} catch (error) { return { ok: false, errors: [`malformed summary: ${error.message}`] }; } }
module.exports = { summarize, validateSummary };

function main(args = process.argv.slice(2)) {
  const value = key => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  if (value('verify')) { const result = validateSummary(read(value('verify'))); console.log(JSON.stringify(result)); return result.ok ? 0 : 1; }
  const files = value('reports')?.split(','), audit = value('audit'), out = value('out');
  if (!files || files.length !== 3 || !audit || !out || fs.existsSync(out)) throw new Error('Explicit three --reports, --audit and new --out required');
  const startedAt = new Date().toISOString(), summary = summarize(files, audit);
  summary.execution = { purpose: 'READ_ONLY_REAL_CAPTURE_SUMMARY', command: [process.execPath, __filename, ...args].join(' '),
    cwd: ROOT, startedAt, endedAt: new Date().toISOString(), exitCode: 0 };
  const result = validateSummary(summary); if (!result.ok) { console.log(JSON.stringify(result)); return 1; }
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ out, ...result })); return 0;
}
if (require.main === module) { try { process.exitCode = main(); } catch (error) { console.error(error); process.exitCode = 1; } }
