'use strict';
// Independent Leaf closure, read-only. The collector owns GPU/PNG math; this owns
// execution identity, counts, phase order and actual-report mutation evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const B = require('./shaders-wave3-gate.cjs');
const C = require('./shaders-glass-browser.cjs');
const ROOT = path.resolve(__dirname, '../..');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
function fingerprint(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function validateReports(functional, performance) {
    try {
        const errors = [...B.validateEffectReports('E09', functional, performance).errors];
        if (!same(functional?.inputs, performance?.inputs) || !same(functional?.reference, performance?.reference))
            errors.push('functional/performance inputs differ');
        if (!(Date.parse(functional?.endedAt) <= Date.parse(performance?.startedAt)))
            errors.push('timed collection overlaps functional');
        return { ok: errors.length === 0, errors };
    } catch (error) {
        return { ok: false, errors: ['raw closure: ' + error.message] };
    }
}
function scopeOf(functional, performance) {
    return {
        engines: functional.engines.length,
        dimensionRows: functional.engines.length * 6,
        visualCases: functional.engines.reduce((n, e) => n + e.captures.length, 0),
        boundaryCases: functional.engines.reduce((n, e) => n + e.boundaries.length, 0),
        malformedAtomicRejections: functional.engines.reduce((n, e) => n + e.invalids.length, 0),
        resourceCycles: functional.engines.reduce((n, e) => n + e.resources.rows.length, 0),
        liveResize: functional.engines.length,
        screenshots: functional.engines.reduce((n, e) => n + e.captures.length + 1, 0),
        performanceProfiles: performance.engines.reduce((n, e) => n + e.performance.length, 0),
    };
}
function validateGate(gate) {
    try {
        const errors = [...B.validateGate(gate).errors];
        const reports = Object.fromEntries(
            gate.bindings.map((b) => {
                const r = read(b.report.path);
                return [r.phase, r];
            }),
        );
        errors.push(...validateReports(reports.functional, reports.performance).errors);
        if (!same(gate.counts, scopeOf(reports.functional, reports.performance))) errors.push('scope counts drift');
        if (!same(gate.validatorInputs, C.currentIdentity())) errors.push('current closure drift');
        if (gate.task !== 'Wave3/E09' || gate.wave3Gate !== 'NOT_RUN') errors.push('leaf/wave status');
        if (
            gate.verifier?.path !== 'tools/verify/shaders-glass-gate.cjs' ||
            !same(gate.verifier, fingerprint(gate.verifier.path))
        )
            errors.push('verifier drift');
        if (!same(gate.audit, fingerprint(gate.audit.path))) errors.push('audit drift');
        const audit = read(gate.audit.path);
        if (
            audit.baselinesAccepted?.functional !== true ||
            audit.baselinesAccepted?.performance !== true ||
            audit.browserRunsAdded !== 0 ||
            !Array.isArray(audit.rows) ||
            audit.rows.length < 30 ||
            audit.rejected !== audit.rows.length ||
            audit.rows.some((r) => r.rejected !== true || !r.errors?.length) ||
            new Set(audit.rows.map((r) => r.name)).size !== audit.rows.length ||
            !same(
                audit.inputs,
                gate.bindings.map((b) => b.report),
            )
        )
            errors.push('actual mutation audit');
        const screenshots = reports.functional.engines.flatMap((e) => [...e.captures.map((c) => c.png), e.resize.png]);
        if (!same(gate.gates.Visual.screenshots, screenshots)) errors.push('screenshot scope');
        for (const attempt of gate.historicalAttempts || [])
            for (const key of ['report', 'osReceipt', 'log'])
                if (!same(attempt[key], fingerprint(attempt[key].path))) errors.push('historical fingerprint drift');
        return { ok: errors.length === 0, errors };
    } catch (error) {
        return { ok: false, errors: ['leaf closure: ' + error.message] };
    }
}
module.exports = { fingerprint, scopeOf, validateReports, validateGate };
if (require.main === module) {
    const arg = process.argv.find((a) => a.startsWith('--verify='));
    const result = arg ? validateGate(read(arg.slice(9))) : { ok: false, errors: ['--verify=<gate.json> required'] };
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
}
