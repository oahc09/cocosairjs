/* Synthetic tooling-contract fixtures only. No browser/effect PASS is claimed. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');

describe('shaders effect contract (synthetic data, not engine/browser evidence)', () => {
  let directory: string;
  let identity: any;
  const definition = {
    schemaVersion: 'shaders-effect-contract/1', name: 'synthetic-contract-only', version: '1',
    params: {
      amount: { type: 'number', defaultValue: 0.5, min: 0, max: 1, step: 0.1, unit: 'ratio', updateMode: 'uniform', description: 'Synthetic normalized value' },
      quality: { type: 'string', defaultValue: 'low', enum: ['low', 'high'], updateMode: 'structure', description: 'Synthetic quality' },
      enabled: { type: 'boolean', defaultValue: true, updateMode: 'pipeline', description: 'Synthetic switch' },
      color: { type: 'number-array', length: 3, defaultValue: [1, 0, 0], min: 0, max: 1, updateMode: 'resource', description: 'Synthetic tuple' },
      seed: { type: 'integer', defaultValue: 0, min: 0, max: 100, updateMode: 'structure', description: 'Synthetic seed' },
    },
  };
  const clone = (value: any) => JSON.parse(JSON.stringify(value));
  const params = () => ({ amount: 0.5, quality: 'low', enabled: true, color: [1, 0, 0], seed: 0 });
  const rules = (checked: any) => checked.errors.map((entry: any) => entry.rule);
  const pending = () => ({
    schemaVersion: 'shaders-engine-evidence/1', effect: { name: definition.name, version: definition.version, contractSha256: contract.sha256(contract.canonical(definition)) },
    identity: clone(identity), status: 'NOT_RUN', completed: false, subset: true, issues: [],
    gates: Object.fromEntries(contract.GATES.map((gate: string) => {
      const ids = gate === 'Build' ? ['typescript', 'bundle', 'shader'] : gate === 'Runtime' ? [...contract.LIFECYCLE] : [`${gate}-planned`];
      return [gate, { status: 'NOT_RUN', scope: { expectedCaseIds: ids }, cases: ids.map((caseId: string) => ({ caseId, status: 'NOT_RUN', reason: 'Synthetic schema fixture; not executed' })) }];
    })),
  });
  const execution = () => ({ command: 'not-executed-synthetic-fixture', cwd: directory, startedAt: '2026-10-09T00:00:00.000Z', endedAt: '2026-10-09T00:00:01.000Z', exitCode: 0, rawOutputs: [clone(identity.runner[0])] });
  const fixed = () => ({ viewport: { width: 1280, height: 720 }, dpr: 1, seed: 0, input: { source: 'synthetic' }, parameters: params(), timeSeconds: 0, simulationStep: 0 });
  const options = () => ({ definition, expectedIdentity: identity, verifyFiles: true, root: directory });
  const promote = (gate: string, observation: any) => {
    const report = pending();
    const row = report.gates[gate].cases[0];
    Object.assign(row, { status: 'PASS', method: 'REAL_BROWSER', browser: 'synthetic-no-real-browser', browserVersion: 'fixture-only', execution: execution(), fixed: fixed(), observation });
    report.gates[gate].status = report.gates[gate].cases.length === 1 ? 'PASS' : 'LIMITED';
    return report;
  };
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shaders-contract-'));
    const file = Buffer.from('Synthetic contract fixture: this is not execution evidence.');
    fs.writeFileSync(path.join(directory, 'raw.txt'), file);
    const record = { path: 'raw.txt', sha256: contract.sha256(file), bytes: file.length };
    identity = { source: [record], sdk: [record], runner: [record], reference: { repo: 'synthetic-fixture', commit: 'a'.repeat(40), license: 'synthetic-only', files: [record] } };
  });
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('accepts declared schema, defaults, tuples and inclusive numeric endpoints', () => {
    expect(contract.validateDefinition(definition)).toMatchObject({ ok: true });
    expect(contract.validateParameters(definition, {}, { defaults: true }).values).toEqual(params());
    expect(contract.validateParameters(definition, { ...params(), amount: 0 })).toMatchObject({ ok: true });
    expect(contract.validateParameters(definition, { ...params(), amount: 1 })).toMatchObject({ ok: true });
  });
  test.each([null, undefined, [], 'x', 0, false])('total invalid input %p', (value) => {
    expect(contract.validateParameters(definition, value).ok).toBe(false);
    expect(contract.validateDefinition(value).ok).toBe(false);
    expect(contract.validateEngineReport(value).ok).toBe(false);
    expect(contract.validateAgentReport(value).ok).toBe(false);
  });
  test('rejects unknown/missing/type/enum/range/integer/tuple violations without mutation', () => {
    for (const patch of [{ extra: 1 }, { amount: '0.5' }, { amount: -0.001 }, { amount: 1.001 }, { quality: 'medium' }, { enabled: 1 }, { seed: 0.5 }, { color: [1, 0] }, { color: [1, 0, 2] }]) {
      const input = { ...params(), ...patch };
      const before = clone(input);
      expect(contract.validateParameters(definition, input).ok).toBe(false);
      expect(input).toEqual(before);
    }
    expect(rules(contract.validateParameters(definition, {}))).toContain('PARAM_MISSING');
  });
  test.each([NaN, Infinity, -Infinity])('rejects nonfinite scalar and tuple %p', (value) => {
    expect(rules(contract.validateParameters(definition, { ...params(), amount: value }))).toContain('JSON_FINITE');
    expect(rules(contract.validateParameters(definition, { ...params(), color: [value, 0, 0] }))).toContain('JSON_FINITE');
  });
  test('rejects cycles, symbols, functions, accessors and nonplain values without invoking getter', () => {
    const cyclic: any = {}; cyclic.self = cyclic;
    const getter = jest.fn(() => { throw new Error('must not invoke'); });
    const access = Object.defineProperty({}, 'amount', { get: getter, enumerable: true });
    for (const value of [cyclic, { amount: () => 1 }, { [Symbol('x')]: 1 }, access, new Date(), new Map()]) expect(contract.validateParameters(definition, value).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  test('rejects invalid default, mode, unit, step, range, enum declaration and metadata typo', () => {
    const edits = [
      (d: any) => { d.params.amount.defaultValue = 2; },
      (d: any) => { d.params.amount.updateMode = 'rebuild-every-frame'; },
      (d: any) => { d.params.amount.unit = ''; },
      (d: any) => { d.params.amount.step = 0; },
      (d: any) => { d.params.amount.min = 2; },
      (d: any) => { d.params.quality.enum = []; },
      (d: any) => { d.params.quality.enum = ['low', 'low']; },
      (d: any) => { d.params.quality.enum = ['low', 1]; },
      (d: any) => { d.params.amount.defualtValue = 1; },
      (d: any) => { d.params.color.length = 0; },
    ];
    for (const edit of edits) { const value = clone(definition); edit(value); expect(contract.validateDefinition(value).ok).toBe(false); }
  });
  test('structure cache key binds all structure/pipeline parameters and source/sdk/reference/runner identity', () => {
    const first = contract.structureKey(definition, params(), identity);
    expect(first.ok).toBe(true);
    expect(first.structural).toEqual({ quality: 'low', enabled: true, seed: 0 });
    expect(contract.structureKey(definition, { ...params(), amount: 0.9 }, identity).key).toBe(first.key);
    expect(contract.structureKey(definition, { ...params(), color: [0, 1, 0] }, identity).key).toBe(first.key);
    for (const patch of [{ quality: 'high' }, { enabled: false }, { seed: 1 }]) expect(contract.structureKey(definition, { ...params(), ...patch }, identity).key).not.toBe(first.key);
    for (const group of ['source', 'sdk', 'runner']) {
      const changed = clone(identity); changed[group][0].sha256 = 'b'.repeat(64);
      expect(contract.structureKey(definition, params(), changed).key).not.toBe(first.key);
    }
    const changed = clone(identity); changed.reference.commit = 'b'.repeat(40);
    expect(contract.structureKey(definition, params(), changed).key).not.toBe(first.key);
    const reordered = Object.fromEntries(Object.entries(params()).reverse());
    expect(contract.structureKey(definition, reordered, identity).key).toBe(first.key);
  });
  test('documentation rejects missing/extra parameter or descriptor drift', () => {
    expect(contract.checkDocumentation(definition, definition.params).ok).toBe(true);
    const missing = clone(definition.params); delete missing.seed;
    expect(rules(contract.checkDocumentation(definition, missing))).toContain('DOC_PARAMETER_SET');
    expect(contract.checkDocumentation(definition, { ...definition.params, ghost: definition.params.amount }).ok).toBe(false);
    const drift = clone(definition.params); drift.seed.updateMode = 'uniform';
    expect(rules(contract.checkDocumentation(definition, drift))).toContain('DOC_DESCRIPTOR');
  });
  test('honest six-dimension NOT_RUN is structurally valid, with zero measured and no scope PASS', () => {
    expect(contract.validateEngineReport(pending(), options())).toMatchObject({ ok: true, measured: 0, skipped: 14, failed: 0, scopePassed: false });
  });
  test('empty scope, duplicate ids, omitted stage, unknown gate cannot pass', () => {
    for (const edit of [
      (r: any) => { r.gates.Build.scope.expectedCaseIds = []; r.gates.Build.cases = []; },
      (r: any) => { r.gates.Build.cases.push(clone(r.gates.Build.cases[0])); },
      (r: any) => { r.gates.Build.scope.expectedCaseIds.pop(); r.gates.Build.cases.pop(); },
      (r: any) => { r.gates.Agent = r.gates.Build; },
    ]) { const r = pending(); edit(r); expect(contract.validateEngineReport(r, options()).ok).toBe(false); }
  });
  test('subset/skipped report cannot claim complete PASS and engine/agent results cannot mix', () => {
    const r = pending(); r.status = 'PASS'; r.completed = true; r.subset = false;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('ENGINE_RESULT');
    const mixed: any = pending(); mixed.agentGate = { status: 'PASS' };
    expect(rules(contract.validateEngineReport(mixed, options()))).toContain('GATE_ISOLATION');
    expect(contract.validateAgentReport(pending()).ok).toBe(false);
  });
  test('file existence alone, corrupted bytes, missing pinned commit and self-frozen identity rejected', () => {
    const r = pending(); r.identity.sdk[0].sha256 = 'b'.repeat(64);
    expect(rules(contract.validateEngineReport(r, options()))).toContain('FILE_DRIFT');
    expect(rules(contract.validateEngineReport(r, options()))).toContain('IDENTITY_MISMATCH');
    r.identity.reference.commit = 'latest';
    expect(rules(contract.validateEngineReport(r, options()))).toContain('REFERENCE');
    r.identity.sdk[0].path = 'missing';
    expect(rules(contract.validateEngineReport(r, options()))).toContain('FILE_MISSING');
  });
  test('build PASS requires actual commands, raw outputs, correct exit and all units', () => {
    const r: any = pending();
    const row = r.gates.Build.cases[0];
    Object.assign(row, { status: 'PASS', method: 'NODE', execution: execution(), observation: { expectedUnits: 2, compiledUnits: 1, errors: [] } });
    r.gates.Build.status = 'LIMITED';
    expect(rules(contract.validateEngineReport(r, options()))).toContain('BUILD_RESULT');
    row.execution.exitCode = 1;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('PASS_EXIT');
    delete row.execution.command;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('EXECUTION');
    row.execution = execution(); row.execution.rawOutputs = [];
    expect(rules(contract.validateEngineReport(r, options()))).toContain('EXECUTION_RAW');
  });
  test('visual screenshot cannot substitute for algorithm oracle or independent pixel verification', () => {
    const r = promote('Visual', { screenshot: clone(identity.runner[0]), algorithm: { oracleId: 'synthetic', method: 'not-real', raw: [1] } });
    const checked = contract.validateEngineReport(r, options());
    expect(rules(checked)).toContain('ORACLE_NOT_CONFIGURED');
    expect(rules(checked)).toContain('PASS_FROZEN_SCOPE');
    delete r.gates.Visual.cases[0].observation.algorithm;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('ALGORITHM_DATA');
  });
  test('continuous finite seed is valid frozen state; NaN/Infinity are rejected', () => {
    const r = promote('Visual', { screenshot: clone(identity.runner[0]), algorithm: { oracleId: 'synthetic', method: 'contract-only', raw: [1] } });
    r.gates.Visual.cases[0].fixed.seed = 0.123456789;
    expect(rules(contract.validateEngineReport(r, options()))).not.toContain('FIXED_STATE');
    r.gates.Visual.cases[0].fixed.seed = -0.25;
    expect(rules(contract.validateEngineReport(r, options()))).not.toContain('FIXED_STATE');
    r.gates.Visual.cases[0].fixed.seed = Infinity;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('JSON_FINITE');
  });
  test('claimed compilation units alone do not pass without independent build/log/GPU oracle', () => {
    const r: any = pending();
    Object.assign(r.gates.Build.cases[0], { status: 'PASS', method: 'NODE', execution: execution(), observation: { expectedUnits: 1, compiledUnits: 1, errors: [] } });
    r.gates.Build.status = 'LIMITED';
    expect(rules(contract.validateEngineReport(r, options()))).toContain('ORACLE_NOT_CONFIGURED');
  });
  test('resource gate rejects 99 cycles, baseline growth, missing counters and nonzero released resources', () => {
    const zero = Object.fromEntries(contract.RESOURCE_KINDS.map((kind: string) => [kind, 0]));
    const cycles = () => Array.from({ length: 100 }, (_, index) => ({ index, before: clone(zero), created: { ...zero, texture: 1 }, after: clone(zero) }));
    const r = promote('Resource', { cycles: cycles(), gpuPhysicalMemory: { status: 'unavailable', reason: 'Synthetic fixture has no GPU' } });
    r.gates.Resource.cases[0].observation.cycles.pop();
    expect(rules(contract.validateEngineReport(r, options()))).toContain('RESOURCE_CYCLES');
    r.gates.Resource.cases[0].observation.cycles = cycles();
    r.gates.Resource.cases[0].observation.cycles[99].after.texture = 1;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('RESOURCE_BALANCE');
    r.gates.Resource.cases[0].observation.cycles = cycles();
    r.gates.Resource.cases[0].observation.cycles[1].before.texture = 1;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('RESOURCE_GROWTH');
    r.gates.Resource.cases[0].observation.cycles = cycles();
    delete r.gates.Resource.cases[0].observation.cycles[1].after.listener;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('RESOURCE_BALANCE');
  });
  test('100 fabricated all-zero counters cannot substitute for allocation/ref traces and resource oracle', () => {
    const zero = Object.fromEntries(contract.RESOURCE_KINDS.map((kind: string) => [kind, 0]));
    const cycles = Array.from({ length: 100 }, (_, index) => ({ index, before: clone(zero), created: clone(zero), after: clone(zero),
      allocations: [{ id: `fake-${index}`, kind: 'material', unit: 'refs', baseline: 0, allocated: 0, released: 0 }] }));
    const r = promote('Resource', { cycles, gpuPhysicalMemory: { status: 'unavailable', reason: 'Synthetic' } });
    expect(rules(contract.validateEngineReport(r, options()))).toEqual(expect.arrayContaining(['RESOURCE_OWNERSHIP', 'RESOURCE_NO_ALLOCATION', 'ORACLE_NOT_CONFIGURED']));
    cycles[0].allocations[0].allocated = 1; cycles[0].allocations[0].released = 1;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('RESOURCE_OWNERSHIP');
  });
  test('performance requires distinct CPU stages, samples, profiles, GPU timer disclosure and estimated VRAM', () => {
    const r = promote('Performance', { profile: '720p', cpuUpdateMs: [1], cpuEncodingMs: [0.1], cpuSubmissionMs: [0.1], frameMs: [16],
      frameCount: 1, durationSeconds: 1, device: 'synthetic', measurementMethod: 'contract-only', drawCalls: 1, passCount: 1, textureCount: 1, bufferCount: 1,
      gpuTimestamp: { status: 'unavailable', reason: 'no real GPU' }, vramEstimate: { bytes: 100, formula: 'synthetic', method: 'estimate' } });
    const o = r.gates.Performance.cases[0].observation;
    o.gpuTime = 2;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('AMBIGUOUS_GPU_TIME');
    delete o.gpuTime; delete o.cpuEncodingMs;
    expect(rules(contract.validateEngineReport(r, options()))).toContain('SAMPLES');
    o.cpuEncodingMs = [0.1, 0.1];
    expect(rules(contract.validateEngineReport(r, options()))).toContain('PERFORMANCE_SAMPLE_COUNT');
    o.vramEstimate.method = 'measured';
    expect(rules(contract.validateEngineReport(r, options()))).toContain('VRAM_ESTIMATE');
    expect(rules(contract.validateEngineReport(r, options()))).toContain('PERFORMANCE_MATRIX');
  });
  test('independent oracles must return numeric measurement count and errors, not PASS flags', () => {
    const r = promote('Visual', { screenshot: clone(identity.runner[0]), algorithm: { oracleId: 'synthetic', method: 'contract-only', raw: [1] } });
    expect(rules(contract.validateEngineReport(r, { ...options(), oracles: { visual: () => true } }))).toContain('ORACLE_REJECTED');
    expect(rules(contract.validateEngineReport(r, { ...options(), oracles: { visual: () => ({ errors: [], measurements: 0 }) } }))).toContain('ORACLE_REJECTED');
  });
  test('FAIL is not hidden by NOT_RUN and infrastructure failures are BLOCKED, not engine/agent failures', () => {
    const r: any = pending(); const row = r.gates.Runtime.cases[0];
    Object.assign(row, { status: 'FAIL', execution: execution(), classification: 'INFRA_FAILURE', reason: 'Synthetic infrastructure failure' });
    expect(rules(contract.validateEngineReport(r, options()))).toEqual(expect.arrayContaining(['GATE_FAILURE', 'ENGINE_FAILURE', 'INFRA_AS_ENGINE_FAILURE']));
    row.status = 'BLOCKED'; r.gates.Runtime.status = 'BLOCKED';
    expect(contract.validateEngineReport(r, options()).ok).toBe(true);
  });
  test('classification enum is exact and every finding needs a reason', () => {
    expect(contract.CLASSIFICATIONS).toHaveLength(9);
    const r: any = pending(); r.issues = [{ classification: 'TEST_GREEN', reason: 'x' }];
    expect(rules(contract.validateEngineReport(r, options()))).toContain('CLASSIFICATION');
  });
  test('Agent NOT_RUN is separate and Agent PASS refuses hidden reference or self-reported success', () => {
    const agentIdentity = clone(identity); delete agentIdentity.reference;
    const r: any = { schemaVersion: 'shaders-agent-evidence/1', identity: agentIdentity, effectName: 'synthetic', runId: 'fixture', agentId: 'fixture', status: 'NOT_RUN', completed: false, reason: 'Not executed' };
    expect(contract.validateAgentReport(r, { verifyFiles: true, root: directory }).ok).toBe(true);
    r.status = 'PASS'; r.completed = true; r.metrics = { first_run_success: true, final_success: true, compile_attempts: 1, runtime_attempts: 1,
      API_errors: [], documentation_lookup: [], manual_intervention: [], elapsedSeconds: 1, tokens: 10 };
    r.execution = execution(); r.compileAttempts = [execution()]; r.runtimeAttempts = [execution()];
    r.accessLog = [{ ...identity.runner[0], kind: 'reference-implementation', timestamp: '2026-10-09T00:00:00Z' }];
    expect(rules(contract.validateAgentReport(r, { verifyFiles: true, root: directory, expectedIdentity: agentIdentity }))).toContain('AGENT_ACCESS');
    expect(rules(contract.validateAgentReport(r, { verifyFiles: true, root: directory, expectedIdentity: agentIdentity }))).toContain('ORACLE_NOT_CONFIGURED');
    r.identity.reference = identity.reference;
    expect(rules(contract.validateAgentReport(r))).toContain('AGENT_REFERENCE');
  });
});
