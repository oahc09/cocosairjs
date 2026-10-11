'use strict';

// Optional, Node-side tooling. Not a CocosAirJS runtime or shader library.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const UPDATE_MODES = Object.freeze(['uniform', 'resource', 'pipeline', 'structure']);
const STATUSES = Object.freeze(['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED', 'LIMITED']);
const CLASSIFICATIONS = Object.freeze([
  'ENGINE_BUG', 'API_GAP', 'API_DX', 'DOC_GAP', 'EXAMPLE_GAP', 'AGENT_FAILURE',
  'REFERENCE_ERROR', 'INFRA_FAILURE', 'PERFORMANCE_GAP',
]);
const GATES = Object.freeze(['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance']);
const LIFECYCLE = Object.freeze(['create', 'update', 'resize', 'pause', 'resume', 'destroy', 'recreate']);
const RESOURCE_KINDS = Object.freeze(['texture', 'buffer', 'material', 'listener', 'raf', 'gpuResource']);
const PERFORMANCE_PROFILES = Object.freeze(['720p', '1080p', 'mobile-dpr']);
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function issue(errors, rule, at, message) { errors.push({ rule, path: at, message }); }
function result(errors, extra = {}) { return { ok: errors.length === 0, errors, ...extra }; }

// Total JSON validation, including in-memory values that JSON.parse cannot produce.
function jsonErrors(value, at = '$', ancestors = new Set(), errors = []) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return errors;
  if (typeof value === 'number') {
    if (!finite(value)) issue(errors, 'JSON_FINITE', at, 'Numbers must be finite');
    return errors;
  }
  if (!Array.isArray(value) && !plain(value)) {
    issue(errors, 'JSON_TYPE', at, 'Only plain JSON data is accepted'); return errors;
  }
  if (ancestors.has(value)) { issue(errors, 'JSON_CYCLE', at, 'Cyclic data is not accepted'); return errors; }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !own(descriptor, 'value')) {
      issue(errors, 'JSON_PROPERTY', at, 'Symbols and accessors are not accepted'); continue;
    }
    if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) {
      issue(errors, 'JSON_ARRAY_PROPERTY', `${at}.${key}`, 'Arrays must not have custom properties'); continue;
    }
    jsonErrors(descriptor.value, `${at}.${key}`, ancestors, errors);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!own(value, i)) issue(errors, 'JSON_HOLE', `${at}.${i}`, 'Sparse array');
  }
  ancestors.delete(value);
  return errors;
}

function safely(fn) {
  try { return fn(); } catch (error) {
    return result([{ rule: 'INVALID_DATA', path: '$', message: String(error.message || error) }]);
  }
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function validateValue(descriptor, value, at, errors) {
  const types = {
    number: () => finite(value), integer: () => Number.isSafeInteger(value),
    boolean: () => typeof value === 'boolean', string: () => typeof value === 'string',
    'number-array': () => Array.isArray(value) && value.length === descriptor.length && value.every(finite),
  };
  if (!types[descriptor.type] || !types[descriptor.type]()) {
    issue(errors, 'PARAM_TYPE', at, `Expected ${descriptor.type}`); return;
  }
  if (own(descriptor, 'enum') && !descriptor.enum.some((entry) => canonical(entry) === canonical(value))) {
    issue(errors, 'PARAM_ENUM', at, 'Value is not in enum');
  }
  const values = Array.isArray(value) ? value : [value];
  for (const entry of values) {
    if (finite(entry) && ((own(descriptor, 'min') && entry < descriptor.min)
      || (own(descriptor, 'max') && entry > descriptor.max))) issue(errors, 'PARAM_RANGE', at, 'Value is outside declared bounds');
  }
}

function validateDefinition(definition) {
  return safely(() => {
    const errors = jsonErrors(definition);
    if (errors.length) return result(errors);
    if (!plain(definition)) return result([{ rule: 'DEFINITION', path: '$', message: 'Expected plain definition' }]);
    if (definition.schemaVersion !== 'shaders-effect-contract/1') issue(errors, 'DEFINITION_VERSION', '$.schemaVersion', 'Unsupported contract');
    if (!text(definition.name) || !text(definition.version)) issue(errors, 'DEFINITION_ID', '$', 'name and version are required');
    if (!plain(definition.params)) issue(errors, 'PARAM_SCHEMA', '$.params', 'params must be a plain record');
    for (const [name, d] of Object.entries(definition.params || {})) {
      const at = `$.params.${name}`;
      if (!text(name) || ['__proto__', 'prototype', 'constructor'].includes(name)) issue(errors, 'PARAM_NAME', at, 'Unsafe parameter name');
      if (!plain(d)) { issue(errors, 'PARAM_DESCRIPTOR', at, 'Descriptor must be plain'); continue; }
      const fields = ['type', 'defaultValue', 'min', 'max', 'step', 'enum', 'unit', 'updateMode', 'description', 'length'];
      for (const key of Object.keys(d)) if (!fields.includes(key)) issue(errors, 'DESCRIPTOR_UNKNOWN', `${at}.${key}`, 'Unknown descriptor key');
      if (!['number', 'integer', 'boolean', 'string', 'number-array'].includes(d.type)) issue(errors, 'DESCRIPTOR_TYPE', at, 'Unsupported explicit type');
      if (!own(d, 'defaultValue')) issue(errors, 'DESCRIPTOR_DEFAULT', at, 'defaultValue is required');
      if (!UPDATE_MODES.includes(d.updateMode)) issue(errors, 'DESCRIPTOR_MODE', at, 'Invalid updateMode');
      if (!text(d.description)) issue(errors, 'DESCRIPTOR_DESCRIPTION', at, 'Description is required');
      if (own(d, 'unit') && !text(d.unit)) issue(errors, 'DESCRIPTOR_UNIT', at, 'unit must be a nonempty string');
      if (d.type === 'number-array' && (!count(d.length) || d.length < 1)) issue(errors, 'DESCRIPTOR_LENGTH', at, 'Numeric tuple requires positive integer length');
      if (d.type !== 'number-array' && own(d, 'length')) issue(errors, 'DESCRIPTOR_LENGTH', at, 'length is only valid for numeric tuples');
      for (const k of ['min', 'max', 'step']) if (own(d, k) && !finite(d[k])) issue(errors, 'DESCRIPTOR_RANGE', `${at}.${k}`, 'Range values must be finite');
      if ((own(d, 'min') || own(d, 'max') || own(d, 'step')) && !['number', 'integer', 'number-array'].includes(d.type)) issue(errors, 'DESCRIPTOR_RANGE_TYPE', at, 'Bounds are numeric only');
      if (d.min > d.max || (own(d, 'step') && d.step <= 0)) issue(errors, 'DESCRIPTOR_RANGE', at, 'min <= max and step > 0 required');
      if (own(d, 'enum')) {
        if (!Array.isArray(d.enum) || !d.enum.length) issue(errors, 'DESCRIPTOR_ENUM', at, 'enum must be nonempty');
        else {
          if (new Set(d.enum.map(canonical)).size !== d.enum.length) issue(errors, 'DESCRIPTOR_ENUM', at, 'Duplicate enum entries');
          const withoutEnum = Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'enum'));
          for (const entry of d.enum) validateValue(withoutEnum, entry, at, errors);
        }
      }
      // Omit enum from the enum-entry type checker; check the actual default against it.
      if (own(d, 'defaultValue') && (!own(d, 'enum') || Array.isArray(d.enum))) validateValue(d, d.defaultValue, `${at}.defaultValue`, errors);
    }
    return result(errors);
  });
}

function validateParameters(definition, input, options = {}) {
  return safely(() => {
    if (!plain(options)) return result([{ rule: 'PARAM_OPTIONS', path: '$', message: 'Expected plain options' }]);
    const defaults = options.defaults === true;
    const checked = validateDefinition(definition);
    if (!checked.ok) return checked;
    const errors = jsonErrors(input);
    if (!plain(input)) issue(errors, 'PARAM_INPUT', '$', 'Parameters must be a plain record');
    if (errors.length) return result(errors);
    for (const name of Object.keys(input)) if (!own(definition.params, name)) issue(errors, 'PARAM_UNKNOWN', `$.${name}`, 'Unknown parameter');
    const values = Object.create(null);
    for (const [name, descriptor] of Object.entries(definition.params)) {
      if (!own(input, name) && !defaults) { issue(errors, 'PARAM_MISSING', `$.${name}`, 'Parameter is missing'); continue; }
      const value = own(input, name) ? input[name] : descriptor.defaultValue;
      validateValue(descriptor, value, `$.${name}`, errors);
      values[name] = JSON.parse(JSON.stringify(value));
    }
    return result(errors, { values: errors.length ? undefined : values });
  });
}

function validateIdentity(identity, errors, options = {}, at = '$.identity', referenceRequired = true) {
  if (!plain(identity)) { issue(errors, 'IDENTITY', at, 'Identity record required'); return; }
  for (const group of ['source', 'sdk', 'runner']) {
    if (!Array.isArray(identity[group]) || !identity[group].length) issue(errors, 'IDENTITY_GROUP', `${at}.${group}`, 'Nonempty file identity group required');
    else {
      if (new Set(identity[group].map((entry) => entry && entry.path)).size !== identity[group].length) issue(errors, 'IDENTITY_DUPLICATE', `${at}.${group}`, 'Duplicate identity paths');
      for (const entry of identity[group]) fileIdentity(entry, errors, options, `${at}.${group}`);
    }
  }
  if (referenceRequired) {
    const reference = identity.reference;
    if (!plain(reference) || !text(reference.repo) || !COMMIT.test(reference.commit)
      || !text(reference.license) || !Array.isArray(reference.files) || !reference.files.length) issue(errors, 'REFERENCE', `${at}.reference`, 'Pinned upstream commit/license/files required');
    else for (const entry of reference.files) fileIdentity(entry, errors, options, `${at}.reference.files`);
  } else if (own(identity, 'reference')) issue(errors, 'AGENT_REFERENCE', at, 'Agent report must not contain private reference identities');
  if (options.expectedIdentity && canonical(identity) !== canonical(options.expectedIdentity)) issue(errors, 'IDENTITY_MISMATCH', at, 'Recorded identity differs from externally frozen identity');
}

function fileIdentity(entry, errors, options, at) {
  if (!plain(entry) || !text(entry.path) || !SHA.test(entry.sha256) || !count(entry.bytes) || entry.bytes === 0) {
    issue(errors, 'FILE_IDENTITY', at, 'Nonempty file path, positive bytes, sha256 required'); return;
  }
  if (options.verifyFiles) {
    try {
      const bytes = fs.readFileSync(path.resolve(options.root || process.cwd(), entry.path));
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) issue(errors, 'FILE_DRIFT', at, `Bytes/hash mismatch: ${entry.path}`);
    } catch (error) { issue(errors, 'FILE_MISSING', at, `${entry.path}: ${error.code || error.message}`); }
  }
}

function structureKey(definition, parameters, identity) {
  return safely(() => {
    const checked = validateParameters(definition, parameters);
    if (!checked.ok) return checked;
    const errors = jsonErrors(identity);
    if (!errors.length) validateIdentity(identity, errors);
    if (errors.length) return result(errors);
    const structural = Object.fromEntries(Object.entries(definition.params)
      .filter(([, descriptor]) => ['structure', 'pipeline'].includes(descriptor.updateMode))
      .map(([name]) => [name, checked.values[name]]));
    const payload = { definition, identity, structural };
    return result(errors, { key: sha256(canonical(payload)), structural });
  });
}

function checkDocumentation(definition, documentedParameters) {
  return safely(() => {
    const checked = validateDefinition(definition);
    if (!checked.ok) return checked;
    const errors = jsonErrors(documentedParameters);
    if (!plain(documentedParameters)) issue(errors, 'DOC_PARAMETERS', '$', 'Expected descriptor record from documentation');
    if (errors.length) return result(errors);
    for (const name of new Set([...Object.keys(definition.params), ...Object.keys(documentedParameters)])) {
      if (!own(definition.params, name) || !own(documentedParameters, name)) issue(errors, 'DOC_PARAMETER_SET', `$.${name}`, 'Missing or extra documented parameter');
      else if (canonical(definition.params[name]) !== canonical(documentedParameters[name])) issue(errors, 'DOC_DESCRIPTOR', `$.${name}`, 'Documented descriptor differs from source');
    }
    return result(errors);
  });
}

function execution(record, errors, options, at) {
  if (!plain(record) || !text(record.command) || !text(record.cwd)
    || !Number.isSafeInteger(record.exitCode) || !text(record.startedAt) || !text(record.endedAt)
    || !Number.isFinite(Date.parse(record.startedAt)) || !Number.isFinite(Date.parse(record.endedAt))
    || Date.parse(record.endedAt) < Date.parse(record.startedAt)) {
    issue(errors, 'EXECUTION', at, 'Actual command/cwd/ordered timestamps/integer exitCode required'); return;
  }
  if (!Array.isArray(record.rawOutputs) || !record.rawOutputs.length) issue(errors, 'EXECUTION_RAW', at, 'Raw output identities required');
  else record.rawOutputs.forEach((entry) => fileIdentity(entry, errors, options, `${at}.rawOutputs`));
}

function fixedState(state, errors, at) {
  if (!plain(state) || !plain(state.viewport) || !count(state.viewport.width) || !count(state.viewport.height)
    || state.viewport.width < 1 || state.viewport.height < 1 || !finite(state.dpr) || state.dpr <= 0
    || !finite(state.seed) || !own(state, 'input') || !plain(state.parameters)
    || !finite(state.timeSeconds) || state.timeSeconds < 0 || !count(state.simulationStep)) issue(errors, 'FIXED_STATE', at, 'viewport/DPR/seed/input/parameters/time/step required');
}
function samples(values, errors, at) {
  if (!Array.isArray(values) || !values.length || !values.every((v) => finite(v) && v >= 0)) issue(errors, 'SAMPLES', at, 'Nonempty finite nonnegative raw sample array required');
}
function independentOracle(kind, value, errors, options, at) {
  const oracle = options.oracles && options.oracles[kind];
  if (typeof oracle !== 'function') { issue(errors, 'ORACLE_NOT_CONFIGURED', at, `Independent ${kind} oracle required for PASS`); return; }
  try {
    const checked = oracle(value);
    // Explicit errors and measured counts; never accept a bare true/pass flag.
    if (!plain(checked) || !Array.isArray(checked.errors) || checked.errors.length
      || !count(checked.measurements) || checked.measurements < 1) issue(errors, 'ORACLE_REJECTED', at, `Independent ${kind} oracle rejected data`);
  } catch (error) { issue(errors, 'ORACLE_REJECTED', at, String(error.message || error)); }
}

function observation(gate, row, errors, options, at) {
  const o = row.observation;
  if (!plain(o)) { issue(errors, 'OBSERVATION', at, 'Actual raw observation record required'); return; }
  if (gate !== 'Build') {
    if (row.method !== 'REAL_BROWSER' || !text(row.browser) || !text(row.browserVersion)) issue(errors, 'BROWSER_METHOD', at, 'Real browser and version required');
    fixedState(row.fixed, errors, `${at}.fixed`);
    if (options.definition && row.fixed && row.fixed.parameters) {
      const checked = validateParameters(options.definition, row.fixed.parameters);
      checked.errors.forEach((entry) => issue(errors, entry.rule, `${at}.fixed.parameters${entry.path.slice(1)}`, entry.message));
    }
  }
  if (gate === 'Build') {
    if (!['typescript', 'bundle', 'shader'].includes(row.caseId)) issue(errors, 'BUILD_STAGE', at, 'Unknown build stage');
    if (!count(o.expectedUnits) || o.expectedUnits < 1 || o.compiledUnits !== o.expectedUnits
      || !Array.isArray(o.errors) || o.errors.length || row.execution.exitCode !== 0) issue(errors, 'BUILD_RESULT', at, 'Expected compilation units must all compile without errors');
    if (row.caseId === 'shader' && (row.method !== 'REAL_BROWSER' || !text(row.browserVersion))) issue(errors, 'SHADER_GPU', at, 'Shader compilation needs real browser observations');
    if (row.caseId !== 'shader' && row.method !== 'NODE') issue(errors, 'BUILD_METHOD', at, 'TS/bundle require NODE execution');
    independentOracle('build', row, errors, options, at);
  }
  if (gate === 'Runtime') {
    if (!LIFECYCLE.includes(row.caseId) || !plain(o.before) || !plain(o.after)
      || !Array.isArray(o.pageErrors) || o.pageErrors.length) issue(errors, 'RUNTIME_DATA', at, 'Lifecycle before/after and zero page errors required');
    independentOracle('runtime', row, errors, options, at);
  }
  if (gate === 'Visual') {
    if (!plain(o.algorithm) || !text(o.algorithm.oracleId) || !text(o.algorithm.method)
      || !Array.isArray(o.algorithm.raw) || !o.algorithm.raw.length) issue(errors, 'ALGORITHM_DATA', at, 'Algorithm oracle and raw numeric/semantic observations required separately from screenshot');
    if (!plain(o.screenshot)) issue(errors, 'SCREENSHOT', at, 'Screenshot identity required');
    else fileIdentity(o.screenshot, errors, options, `${at}.screenshot`);
    if (own(o, 'similarity') && (!plain(o.similarity) || !finite(o.similarity.threshold)
      || !plain(o.similarity.pilot))) issue(errors, 'PILOT_THRESHOLD', at, 'Similarity thresholds require pilot evidence');
    if (o.similarity && o.similarity.pilot) fileIdentity(o.similarity.pilot, errors, options, `${at}.similarity.pilot`);
    independentOracle('visual', row, errors, options, at);
  }
  if (gate === 'Boundary') {
    if (!text(o.parameter) || !['default', 'min', 'max', 'near-min', 'near-max', 'invalid'].includes(o.boundary)
      || !own(o, 'input') || !own(o, 'actual') || (o.boundary === 'invalid' && !text(o.errorCode))) issue(errors, 'BOUNDARY_DATA', at, 'Parameter/input/actual/boundary required; invalid must carry real error code');
    independentOracle('boundary', row, errors, options, at);
  }
  if (gate === 'Resource') {
    if (!Array.isArray(o.cycles) || o.cycles.length < 100) issue(errors, 'RESOURCE_CYCLES', at, 'At least 100 create/destroy cycles required');
    else {
      if (new Set(o.cycles.map((cycle) => cycle.index)).size !== o.cycles.length) issue(errors, 'RESOURCE_INDEX', at, 'Duplicate cycles');
      o.cycles.forEach((cycle, index) => {
        if (!plain(cycle) || cycle.index !== index || !plain(cycle.before) || !plain(cycle.created) || !plain(cycle.after)) { issue(errors, 'RESOURCE_CYCLE', at, 'Ordered raw before/created/after counters required'); return; }
        for (const resource of RESOURCE_KINDS) {
          const before = cycle.before[resource], created = cycle.created[resource], after = cycle.after[resource];
          if (!count(before) || !count(created) || !count(after) || created < before || after !== before) issue(errors, 'RESOURCE_BALANCE', `${at}.${index}.${resource}`, 'Each resource counter must return to baseline');
        }
        if (!RESOURCE_KINDS.some((kind) => cycle.created[kind] > cycle.before[kind])) issue(errors, 'RESOURCE_NO_ALLOCATION', `${at}.${index}`, 'All-zero/no-growth creation counters are not resource-cycle evidence');
        if (!Array.isArray(cycle.allocations) || !cycle.allocations.length) issue(errors, 'RESOURCE_ALLOCATION', `${at}.${index}`, 'Nonempty native allocation/ref ownership trace required');
        else {
          if (new Set(cycle.allocations.map((allocation) => allocation && allocation.id)).size !== cycle.allocations.length) issue(errors, 'RESOURCE_ALLOCATION_ID', `${at}.${index}`, 'Duplicate allocation id');
          cycle.allocations.forEach((allocation) => {
            if (!plain(allocation) || !text(allocation.id) || !RESOURCE_KINDS.includes(allocation.kind)
              || !['refs', 'objects', 'bytes'].includes(allocation.unit) || !count(allocation.baseline)
              || !count(allocation.allocated) || allocation.allocated <= allocation.baseline
              || allocation.released !== allocation.baseline) issue(errors, 'RESOURCE_OWNERSHIP', `${at}.${index}`, 'Native allocation must increase and release exactly its owned refs/count/bytes');
          });
        }
      });
      const baseline = canonical(o.cycles[0].before);
      if (o.cycles.some((cycle) => canonical(cycle.before) !== baseline)) issue(errors, 'RESOURCE_GROWTH', at, 'Baseline may not continuously grow');
    }
    if (!plain(o.gpuPhysicalMemory) || o.gpuPhysicalMemory.status !== 'unavailable' || !text(o.gpuPhysicalMemory.reason)) issue(errors, 'GPU_MEMORY', at, 'Physical GPU memory is unavailable unless separately measured; disclose reason');
    independentOracle('resource', row, errors, options, at);
  }
  if (gate === 'Performance') {
    if (!PERFORMANCE_PROFILES.includes(o.profile)) issue(errors, 'PERFORMANCE_PROFILE', at, '720p/1080p/mobile-dpr profile required');
    const width = row.fixed && row.fixed.viewport.width, height = row.fixed && row.fixed.viewport.height;
    if ((o.profile === '720p' && (width !== 1280 || height !== 720)) || (o.profile === '1080p' && (width !== 1920 || height !== 1080))
      || (o.profile === 'mobile-dpr' && (!row.fixed || row.fixed.dpr <= 1 || !text(o.device)))) issue(errors, 'PERFORMANCE_VIEWPORT', at, 'Profile viewport/device/DPR mismatch');
    for (const field of ['cpuUpdateMs', 'cpuEncodingMs', 'cpuSubmissionMs', 'frameMs']) {
      samples(o[field], errors, `${at}.${field}`);
      if (Array.isArray(o[field]) && o[field].length !== o.frameCount) issue(errors, 'PERFORMANCE_SAMPLE_COUNT', `${at}.${field}`, 'One raw sample per measured frame required');
    }
    if (own(o, 'gpuTime')) issue(errors, 'AMBIGUOUS_GPU_TIME', at, 'gpuTime is ambiguous; use gpuTimestamp');
    if (!plain(o.gpuTimestamp) || !['measured', 'unavailable'].includes(o.gpuTimestamp.status)) issue(errors, 'GPU_TIMESTAMP', at, 'Explicit GPU timestamp availability required');
    else if (o.gpuTimestamp.status === 'unavailable') { if (!text(o.gpuTimestamp.reason)) issue(errors, 'GPU_TIMESTAMP', at, 'Unavailable reason required'); }
    else { samples(o.gpuTimestamp.milliseconds, errors, `${at}.gpuTimestamp`); if (o.gpuTimestamp.disjoint !== false || !text(o.gpuTimestamp.extension)) issue(errors, 'GPU_TIMESTAMP', at, 'Non-disjoint measured timer extension required'); }
    for (const field of ['drawCalls', 'passCount', 'textureCount', 'bufferCount']) if (!count(o[field])) issue(errors, 'PERFORMANCE_COUNTS', `${at}.${field}`, 'Finite integer count required');
    if (!plain(o.vramEstimate) || !count(o.vramEstimate.bytes) || !text(o.vramEstimate.formula)
      || o.vramEstimate.method !== 'estimate') issue(errors, 'VRAM_ESTIMATE', at, 'VRAM bytes/formula must be explicitly estimated, not measured');
    if (!count(o.frameCount) || o.frameCount < 1 || !finite(o.durationSeconds) || o.durationSeconds <= 0
      || !text(o.device) || !text(o.measurementMethod)) issue(errors, 'PERFORMANCE_WINDOW', at, 'Actual device, window and measurement method required');
    independentOracle('performance', row, errors, options, at);
  }
}

function validateEngineReport(report, options = {}) {
  return safely(() => {
    const errors = jsonErrors(report);
    if (errors.length) return result(errors);
    if (!plain(report) || report.schemaVersion !== 'shaders-engine-evidence/1') return result([{ rule: 'ENGINE_SCHEMA', path: '$', message: 'Expected independent engine schema' }]);
    if (own(report, 'agent') || own(report, 'agentGate')) issue(errors, 'GATE_ISOLATION', '$', 'Agent results cannot satisfy Engine Gate');
    validateIdentity(report.identity, errors, options);
    if (!plain(report.effect) || !text(report.effect.name) || !text(report.effect.version) || !SHA.test(report.effect.contractSha256)) issue(errors, 'EFFECT_IDENTITY', '$.effect', 'Effect and contract identity required');
    if (!STATUSES.includes(report.status)) issue(errors, 'STATUS', '$.status', 'Invalid status');
    if (!Array.isArray(report.issues)) issue(errors, 'ISSUES', '$.issues', 'Classified issue list required');
    else report.issues.forEach((item) => {
      if (!plain(item) || !CLASSIFICATIONS.includes(item.classification) || !text(item.reason)) issue(errors, 'CLASSIFICATION', '$.issues', 'Unknown or missing classification/reason');
    });
    if (!plain(report.gates)) { issue(errors, 'GATES', '$.gates', 'Six separate gates required'); return result(errors); }
    for (const extra of Object.keys(report.gates)) if (!GATES.includes(extra)) issue(errors, 'GATE_UNKNOWN', '$.gates', extra);
    let allPass = true;
    let measured = 0, skipped = 0, failed = 0;
    for (const gate of GATES) {
      const record = report.gates[gate], at = `$.gates.${gate}`;
      if (!plain(record) || !STATUSES.includes(record.status) || !plain(record.scope)
        || !Array.isArray(record.scope.expectedCaseIds) || !record.scope.expectedCaseIds.length
        || !record.scope.expectedCaseIds.every(text) || new Set(record.scope.expectedCaseIds).size !== record.scope.expectedCaseIds.length
        || !Array.isArray(record.cases)) { issue(errors, 'GATE_SCOPE', at, 'Nonempty unique scope and cases required'); allPass = false; continue; }
      const expected = record.scope.expectedCaseIds;
      const actual = record.cases.map((row) => row && row.caseId);
      if (new Set(actual).size !== actual.length || canonical([...expected].sort()) !== canonical([...actual].sort())) issue(errors, 'CASE_SET', at, 'Exactly one case per frozen scope id required, including skipped cases');
      const required = gate === 'Build' ? ['typescript', 'bundle', 'shader'] : gate === 'Runtime' ? LIFECYCLE : null;
      if (required && canonical([...required].sort()) !== canonical([...expected].sort())) issue(errors, 'REQUIRED_CASES', at, 'Mandatory stages cannot be omitted');
      if (record.status === 'PASS') {
        if (!options.verifyFiles) issue(errors, 'PASS_VERIFY_FILES', at, 'PASS validation requires disk bytes/hash verification');
        if (!options.expectedIdentity) issue(errors, 'PASS_FROZEN_IDENTITY', at, 'Externally frozen identity required for PASS');
        if (!required && (!options.expectedScope || !Array.isArray(options.expectedScope[gate])
          || canonical([...options.expectedScope[gate]].sort()) !== canonical([...expected].sort()))) issue(errors, 'PASS_FROZEN_SCOPE', at, 'Effect-specific scope must match independently frozen expectedScope');
      }
      let gatePass = true;
      for (const row of record.cases) {
        if (!plain(row) || !STATUSES.includes(row.status)) { issue(errors, 'CASE_STATUS', at, 'Invalid case'); gatePass = false; continue; }
        if (row.status === 'PASS' || row.status === 'FAIL') {
          measured++; execution(row.execution, errors, options, at);
          if (row.status === 'FAIL') {
            failed++;
            if (!CLASSIFICATIONS.includes(row.classification) || !text(row.reason)) issue(errors, 'FAILURE_CLASS', at, 'Failure classification/reason required');
            // Infrastructure failures are blocked runs, not evidence of engine failure.
            if (row.classification === 'INFRA_FAILURE') issue(errors, 'INFRA_AS_ENGINE_FAILURE', at, 'Infrastructure failure must be BLOCKED');
          } else if (plain(row.execution)) {
            if (row.execution.exitCode !== 0) issue(errors, 'PASS_EXIT', at, 'PASS requires actual exitCode 0');
            observation(gate, row, errors, options, at);
          }
        } else {
          skipped++;
          if (!text(row.reason)) issue(errors, 'SKIP_REASON', at, 'Non-PASS/FAIL requires reason');
          if (own(row, 'classification') && !CLASSIFICATIONS.includes(row.classification)) issue(errors, 'CLASSIFICATION', at, 'Invalid skipped classification');
        }
        gatePass = gatePass && row.status === 'PASS';
      }
      if (record.status === 'PASS' !== gatePass) issue(errors, 'GATE_RESULT', at, 'PASS requires every required case to be PASS');
      if (record.cases.some((row) => row && row.status === 'FAIL') && record.status !== 'FAIL') issue(errors, 'GATE_FAILURE', at, 'Recorded FAIL cannot be hidden by a non-FAIL summary');
      if (gate === 'Performance' && gatePass) {
        const profiles = record.cases.map((row) => row.observation && row.observation.profile);
        if (PERFORMANCE_PROFILES.some((p) => !profiles.includes(p))) issue(errors, 'PERFORMANCE_MATRIX', at, 'All three required profiles must be covered; additional quality cases may be frozen in expectedScope');
      }
      if (gate === 'Boundary' && gatePass) {
        if (!options.definition || !validateDefinition(options.definition).ok) issue(errors, 'BOUNDARY_DEFINITION', at, 'Actual source parameter definition required');
        else for (const [name, descriptor] of Object.entries(options.definition.params)) {
          const needed = ['default', 'invalid'];
          if (own(descriptor, 'min')) needed.push('min', 'near-min');
          if (own(descriptor, 'max')) needed.push('max', 'near-max');
          for (const boundary of needed) if (!record.cases.some((row) => row.observation && row.observation.parameter === name && row.observation.boundary === boundary)) issue(errors, 'BOUNDARY_MATRIX', at, `Missing ${name}/${boundary}`);
        }
      }
      allPass = allPass && gatePass;
    }
    if (report.status === 'PASS' !== allPass) issue(errors, 'ENGINE_RESULT', '$.status', 'Engine PASS requires all six gates');
    if (failed > 0 && report.status !== 'FAIL') issue(errors, 'ENGINE_FAILURE', '$.status', 'Recorded engine FAIL must remain FAIL');
    if (allPass && (!options.definition || !validateDefinition(options.definition).ok)) issue(errors, 'PASS_DEFINITION', '$', 'Full engine PASS requires source definition');
    if (report.completed !== allPass || report.subset !== !allPass) issue(errors, 'COMPLETION', '$', 'completion/subset must reflect all six gates, not file existence');
    if (options.definition && validateDefinition(options.definition).ok && plain(report.effect)
      && (report.effect.name !== options.definition.name || report.effect.version !== options.definition.version
        || report.effect.contractSha256 !== sha256(canonical(options.definition)))) issue(errors, 'CONTRACT_DRIFT', '$.effect', 'Source contract identity mismatch');
    return result(errors, { measured, skipped, failed, scopePassed: allPass && !errors.length });
  });
}

function validateAgentReport(report, options = {}) {
  return safely(() => {
    const errors = jsonErrors(report);
    if (errors.length) return result(errors);
    if (!plain(report) || report.schemaVersion !== 'shaders-agent-evidence/1') return result([{ rule: 'AGENT_SCHEMA', path: '$', message: 'Expected independent agent schema' }]);
    if (own(report, 'gates') || own(report, 'engineGate')) issue(errors, 'GATE_ISOLATION', '$', 'Engine success cannot satisfy Agent Gate');
    if (!STATUSES.includes(report.status)) issue(errors, 'STATUS', '$', 'Invalid status');
    if (own(report, 'classification') && !CLASSIFICATIONS.includes(report.classification)) issue(errors, 'CLASSIFICATION', '$', 'Invalid classification');
    validateIdentity(report.identity, errors, options, '$.identity', false);
    if (!text(report.effectName) || !text(report.runId) || !text(report.agentId)) issue(errors, 'AGENT_ID', '$', 'Effect/run/agent identity required');
    if (report.status !== 'PASS') {
      if (!text(report.reason)) issue(errors, 'AGENT_REASON', '$', 'Reason required for incomplete agent run');
      if (report.completed !== false) issue(errors, 'AGENT_COMPLETE', '$', 'Incomplete run cannot be completed');
      if (report.classification === 'INFRA_FAILURE' && report.status === 'FAIL') issue(errors, 'INFRA_AS_AGENT_FAILURE', '$', 'Infrastructure failure must be BLOCKED');
      if (report.status === 'FAIL') {
        execution(report.execution, errors, options, '$.execution');
        if (!CLASSIFICATIONS.includes(report.classification)) issue(errors, 'AGENT_FAILURE_CLASS', '$', 'Actual failed attempt requires classified reason');
      }
      return result(errors, { scopePassed: false });
    }
    const kinds = ['task', 'public-doc', 'example', 'recipe', 'declaration', 'public-tool'];
    if (!options.verifyFiles || !options.expectedIdentity) issue(errors, 'AGENT_FROZEN_INPUTS', '$', 'PASS requires verified file bytes and externally frozen identity');
    if (!Array.isArray(report.accessLog) || !report.accessLog.length) issue(errors, 'AGENT_ACCESS', '$', 'Audited public-only access log required');
    else report.accessLog.forEach((entry) => {
      if (!plain(entry) || !kinds.includes(entry.kind) || !text(entry.timestamp) || !Number.isFinite(Date.parse(entry.timestamp))) issue(errors, 'AGENT_ACCESS', '$', 'Forbidden/unknown input kind or timestamp');
      else fileIdentity(entry, errors, options, '$.accessLog');
    });
    execution(report.execution, errors, options, '$.execution');
    const metrics = report.metrics;
    if (!plain(metrics)) { issue(errors, 'AGENT_METRICS', '$', 'Agent metrics required'); return result(errors); }
    for (const stage of ['compile', 'runtime']) {
      const attempts = report[`${stage}Attempts`];
      if (!Array.isArray(attempts) || !attempts.length) issue(errors, 'AGENT_ATTEMPTS', '$', `${stage} attempts required`);
      else {
        attempts.forEach((attempt) => execution(attempt, errors, options, `$.${stage}Attempts`));
        if (metrics[`${stage}_attempts`] !== attempts.length || attempts.at(-1).exitCode !== 0) issue(errors, 'AGENT_ATTEMPTS', '$', 'Count/terminal attempt mismatch');
      }
    }
    for (const field of ['API_errors', 'documentation_lookup', 'manual_intervention']) if (!Array.isArray(metrics[field])) issue(errors, 'AGENT_METRICS', '$', `${field} must preserve raw event records`);
    if (!finite(metrics.elapsedSeconds) || metrics.elapsedSeconds <= 0 || !count(metrics.tokens)) issue(errors, 'AGENT_COST', '$', 'Actual finite elapsed time and token count required');
    const first = report.compileAttempts && report.compileAttempts[0] && report.compileAttempts[0].exitCode === 0
      && report.runtimeAttempts && report.runtimeAttempts[0] && report.runtimeAttempts[0].exitCode === 0;
    if (metrics.first_run_success !== first || metrics.final_success !== true || report.completed !== true
      || !plain(report.execution) || report.execution.exitCode !== 0) issue(errors, 'AGENT_RESULT', '$', 'First/final success must match actual attempts and terminal validation');
    independentOracle('agentAccess', report, errors, options, '$.accessLog');
    independentOracle('agentResult', report, errors, options, '$');
    return result(errors, { scopePassed: errors.length === 0 });
  });
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--selftest') {
    const assert = require('node:assert/strict');
    const definition = { schemaVersion: 'shaders-effect-contract/1', name: 'synthetic-selftest', version: '1',
      params: { x: { type: 'number', defaultValue: 0, min: 0, max: 1, unit: 'ratio', updateMode: 'uniform', description: 'Synthetic value' } } };
    const checks = [
      () => assert.equal(validateDefinition(definition).ok, true),
      () => assert.equal(validateParameters(definition, { x: 1 }).ok, true),
      () => assert.equal(validateParameters(definition, { x: NaN }).ok, false),
      () => assert.equal(validateParameters(definition, { x: 2 }).ok, false),
      () => assert.equal(validateParameters(definition, { x: 0, ghost: 1 }).ok, false),
      () => assert.equal(validateParameters(definition, null).ok, false),
      () => assert.equal(checkDocumentation(definition, {}).ok, false),
      () => assert.equal(validateEngineReport({ schemaVersion: 'shaders-engine-evidence/1', status: 'PASS' }).ok, false),
    ];
    checks.forEach((check) => check());
    process.stdout.write(`${JSON.stringify({ ok: true, passed: checks.length, method: 'SYNTHETIC_CONTRACT_ONLY', browserRunsAdded: 0 })}\n`);
    return 0;
  }
  const selected = argv.find((arg) => arg.startsWith('--file='));
  if (!selected || argv.some((arg) => !arg.startsWith('--file=') && arg !== '--verify-files')) {
    process.stderr.write('Usage: node tools/verify/shaders-effect-contract.cjs --file=<json> [--verify-files] | --selftest\n'); return 2;
  }
  try {
    const input = JSON.parse(fs.readFileSync(selected.slice(7), 'utf8'));
    const options = { verifyFiles: argv.includes('--verify-files') };
    const checked = input.schemaVersion === 'shaders-effect-contract/1' ? validateDefinition(input)
      : input.schemaVersion === 'shaders-engine-evidence/1' ? validateEngineReport(input, options)
        : validateAgentReport(input, options);
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`); return checked.ok ? 0 : 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); return 1; }
}

module.exports = {
  UPDATE_MODES, STATUSES, CLASSIFICATIONS, GATES, LIFECYCLE, RESOURCE_KINDS, PERFORMANCE_PROFILES,
  validateDefinition, validateParameters, structureKey, checkDocumentation,
  validateEngineReport, validateAgentReport, canonical, sha256, main,
};
if (require.main === module) process.exitCode = main();
