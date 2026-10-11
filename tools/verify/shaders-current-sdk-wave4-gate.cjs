'use strict';
const fs = require('node:fs');
const path = require('node:path');
const base = require('./shaders-wave4-gate.cjs');
const chain = require('./shaders-current-sdk-wave-chain.cjs');
const ROOT = path.resolve(__dirname, '../..');
const PRIOR = 'docs/evidence/shaders-absorption/wave3-current-sdk-r2-gate.json';
const PLAN = [
    ['C01', 'laser-card', 'c01-laser-card-current-sdk-r2-gate.json'],
    ['C02', 'film-neon', 'c02-film-neon-current-sdk-r2-gate.json'],
    ['C03', 'glass-trail', 'c03-glass-trail-current-sdk-r2-gate.json'],
    ['C04', 'input-dissolve', 'c04-input-dissolve-current-sdk-r2-gate.json'],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
function closureInputs() {
    return [
        'tools/verify/shaders-current-sdk-wave4-gate.cjs',
        'tools/verify/shaders-wave4-gate.cjs',
        'tools/verify/shaders-current-sdk-wave-chain.cjs',
    ].map(base.fingerprint);
}
function assess() {
    const currentSdk = chain.sdkFingerprints();
    const sdkPaths = currentSdk.map((s) => s.path);
    const effects = PLAN.map(([id, name, file]) => {
        const gatePath = 'docs/evidence/shaders-absorption/' + file;
        const verifierPath = 'tools/verify/shaders-' + name + '-gate.cjs';
        const gate = read(gatePath);
        return {
            id,
            gate: base.fingerprint(gatePath),
            verifier: base.fingerprint(verifierPath),
            validation: require(path.resolve(ROOT, verifierPath)).validateGate(gate),
            counts: gate.counts,
            sdk: gate.validatorInputs.inputs.filter((item) => sdkPaths.includes(item.path)),
        };
    });
    const counts = Object.fromEntries(
        Object.keys(effects[0].counts).map((key) => [key, effects.reduce((sum, e) => sum + e.counts[key], 0)]),
    );
    counts.engines = 3;
    counts.combinations = 4;
    const combinationGate = effects.every((e) => e.validation.ok && same(e.sdk, currentSdk)) ? 'PASS' : 'FAIL';
    const prior = read(PRIOR);
    const priorValidation = chain.validateWaveGate('wave3', prior);
    if (prior.status !== 'PASS' || prior.nextWaveEligible !== true) {
        priorValidation.ok = false;
        priorValidation.errors.push('current Wave3 predecessor is not eligible');
    }
    return {
        effects,
        counts,
        currentSdk,
        combinationGate,
        priorWave: {
            gate: base.fingerprint(PRIOR),
            verifier: base.fingerprint('tools/verify/shaders-current-sdk-wave-chain.cjs'),
            validation: priorValidation,
        },
        status: combinationGate === 'PASS' ? (priorValidation.ok ? 'PASS' : 'BLOCKED') : 'FAIL',
        nextWaveEligible: combinationGate === 'PASS' && priorValidation.ok,
        closureInputs: closureInputs(),
    };
}
function validateMeasuredReport(report, actual) {
    const errors = [];
    try {
        if (!object(report) || !object(actual))
            return { ok: false, errors: ['Wave4 report and measured state required'] };
        errors.push(...base.validateMeasuredReport(report, actual).errors);
        if (!same(report.closureInputs, actual.closureInputs)) errors.push('current closure fingerprint drift');
        if (!same(actual.closureInputs, closureInputs())) errors.push('measured closure fingerprint drift');
        if (actual.priorWave?.gate?.path !== PRIOR) errors.push('current Wave3 prerequisite required');
        if (
            actual.status !== 'PASS' ||
            actual.nextWaveEligible !== true ||
            actual.combinationGate !== 'PASS' ||
            actual.priorWave?.validation?.ok !== true ||
            !Array.isArray(actual.priorWave.validation.errors) ||
            actual.priorWave.validation.errors.length !== 0
        )
            errors.push('current SDK Wave1 through Wave4 are not all PASS');
        if (
            !Array.isArray(actual.effects) ||
            !same(
                actual.effects.map((e) => e.id),
                PLAN.map(([id]) => id),
            ) ||
            actual.effects.some((e) => e.validation?.ok !== true || !same(e.validation.errors, []))
        )
            errors.push('exact four independently validated combinations required');
    } catch (error) {
        errors.push('Wave4 current SDK structure: ' + error.message);
    }
    return { ok: errors.length === 0, errors };
}
function validateWaveReport(report) {
    try {
        return validateMeasuredReport(report, assess());
    } catch (error) {
        return { ok: false, errors: ['Wave4 current SDK assessment: ' + error.message] };
    }
}
module.exports = { PLAN, PRIOR, closureInputs, assess, validateMeasuredReport, validateWaveReport };
if (require.main === module) {
    try {
        const file = process.argv.find((a) => a.startsWith('--verify='))?.slice(9);
        const result = validateWaveReport(read(file));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
    } catch (error) {
        console.log(JSON.stringify({ ok: false, errors: [error.message] }));
        process.exitCode = 1;
    }
}
