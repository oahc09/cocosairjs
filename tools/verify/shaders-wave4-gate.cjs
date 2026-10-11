'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const PLAN = [
    ['C01', 'laser-card', 'c01-laser-card-current-sdk-gate.json'],
    ['C02', 'film-neon', 'c02-film-neon-current-sdk-gate.json'],
    ['C03', 'glass-trail', 'c03-glass-trail-current-sdk-gate.json'],
    ['C04', 'input-dissolve', 'c04-input-dissolve-current-gate.json'],
];
const SDK = ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
function fingerprint(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function assess() {
    const effects = PLAN.map(([id, name, file]) => {
        const gatePath = 'docs/evidence/shaders-absorption/' + file;
        const verifierPath = 'tools/verify/shaders-' + name + '-gate.cjs';
        const gate = read(gatePath);
        const validation = require(path.resolve(ROOT, verifierPath)).validateGate(gate);
        const sdk = gate.validatorInputs.inputs.filter((item) => SDK.includes(item.path));
        return {
            id,
            gate: fingerprint(gatePath),
            verifier: fingerprint(verifierPath),
            validation,
            counts: gate.counts,
            sdk,
        };
    });
    const counts = Object.fromEntries(
        Object.keys(effects[0].counts).map((key) => [key, effects.reduce((n, e) => n + e.counts[key], 0)]),
    );
    // Engine coverage is shared across combinations, not twelve distinct engines.
    counts.engines = 3;
    counts.combinations = effects.length;
    const currentSdk = SDK.map(fingerprint);
    const combinationGate = effects.every((e) => e.validation.ok && same(e.sdk, currentSdk)) ? 'PASS' : 'FAIL';
    const priorPath = 'docs/evidence/shaders-absorption/wave3-current-gate.json';
    const priorVerifier = 'tools/verify/shaders-wave3-closure.cjs';
    const priorValidation = require(path.resolve(ROOT, priorVerifier)).validateWaveReport(read(priorPath));
    return {
        effects,
        counts,
        currentSdk,
        combinationGate,
        priorWave: { gate: fingerprint(priorPath), verifier: fingerprint(priorVerifier), validation: priorValidation },
        status: combinationGate === 'PASS' ? (priorValidation.ok ? 'PASS' : 'BLOCKED') : 'FAIL',
        nextWaveEligible: combinationGate === 'PASS' && priorValidation.ok,
    };
}
function validateMeasuredReport(report, actual) {
    const errors = [];
    try {
        if (!report || typeof report !== 'object' || Array.isArray(report))
            return { ok: false, errors: ['wave report object required'] };
        for (const key of [
            'effects',
            'counts',
            'currentSdk',
            'combinationGate',
            'priorWave',
            'status',
            'nextWaveEligible',
        ])
            if (!same(report[key], actual[key])) errors.push(key + ': measured state mismatch');
        if (
            report.schemaVersion !== 'shaders-wave4-current-gate/1' ||
            report.wave !== 4 ||
            report.subset !== true ||
            report.projectCompleted !== false ||
            report.agentGate !== 'NOT_RUN' ||
            report.independentGalleryGate !== 'NOT_RUN' ||
            !Number.isFinite(Date.parse(report.createdAt))
        )
            errors.push('Wave/project/Agent/Gallery status isolation');
        if (!same(report.verifier, fingerprint('tools/verify/shaders-wave4-gate.cjs')))
            errors.push('verifier fingerprint drift');
        if (actual.combinationGate !== 'PASS') errors.push('current combination leaf gate failed');
        if (
            actual.counts.combinations !== 4 ||
            actual.counts.dimensionRows !== 72 ||
            actual.counts.performanceProfiles !== 54
        )
            errors.push('exact four-combination scope');
    } catch (error) {
        errors.push('wave structure: ' + error.message);
    }
    return { ok: errors.length === 0, errors, status: report?.status, nextWaveEligible: report?.nextWaveEligible };
}
function validateWaveReport(report) {
    try {
        return validateMeasuredReport(report, assess());
    } catch (error) {
        return { ok: false, errors: ['wave assessment: ' + error.message] };
    }
}
module.exports = { assess, fingerprint, validateMeasuredReport, validateWaveReport };
if (require.main === module) {
    let result;
    try {
        const arg = process.argv.find((a) => a.startsWith('--verify='));
        result = arg
            ? validateWaveReport(read(arg.slice(9)))
            : { ok: false, errors: ['--verify=<wave.json> required'] };
    } catch (error) {
        result = { ok: false, errors: [error.message] };
    }
    console.log(JSON.stringify(result));
    // Structurally honest BLOCKED reports verify successfully; this is not a Wave PASS.
    process.exitCode = result.ok ? 0 : 1;
}
