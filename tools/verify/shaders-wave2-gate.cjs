'use strict';

// Independent Wave 2 aggregation. Empty observed error arrays and missing observations
// are different states; per-effect collectors must not turn the latter into success.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const EFFECTS = Object.freeze({ E03: 'holographic', E04: 'neon', E05: 'emboss' });

function validateObservedErrors(engine) {
    const errors = [];
    if (!engine || typeof engine !== 'object' || Array.isArray(engine))
        return { ok: false, errors: ['engine observation object required'] };
    for (const key of ['pageErrors', 'consoleErrors']) {
        if (!Array.isArray(engine[key])) errors.push(`${key}: explicit observed array required`);
        else if (engine[key].length) errors.push(`${key}: nonempty observed errors`);
    }
    return { ok: errors.length === 0, errors };
}

function validateEffectReports(effectId, functional, performance) {
    const errors = [];
    if (!Object.hasOwn(EFFECTS, effectId)) return { ok: false, errors: ['unknown effect'] };
    let collector;
    try {
        collector = require(`./shaders-${EFFECTS[effectId]}-browser.cjs`);
    } catch (error) {
        return { ok: false, errors: [`collector unavailable: ${error.message}`] };
    }
    for (const [phase, report] of [
        ['functional', functional],
        ['performance', performance],
    ]) {
        if (!report || report.phase !== phase) {
            errors.push(`${phase}: explicit report required`);
            continue;
        }
        try {
            errors.push(...collector.validateFiles(report).errors.map((error) => `${phase}: ${JSON.stringify(error)}`));
        } catch (error) {
            errors.push(`${phase}: validation failed: ${error.message}`);
        }
        if (JSON.stringify(report.requestedEngines) !== JSON.stringify(['chromium', 'firefox', 'webkit']))
            errors.push(`${phase}: all three engines required`);
        if (!Array.isArray(report.engines) || report.engines.length !== 3)
            errors.push(`${phase}: three engine rows required`);
        for (const engine of Array.isArray(report.engines) ? report.engines : []) {
            const check = validateObservedErrors(engine);
            errors.push(...check.errors.map((error) => `${phase}/${engine?.engine}: ${error}`));
        }
        if (report.scopePassed !== true || report.exitCode !== 0)
            errors.push(`${phase}: successful measured verdict required`);
        if (report.agentGate !== 'NOT_RUN' || report.subset !== true || report.completed !== false)
            errors.push(`${phase}: isolated subset/Agent status required`);
    }
    return { ok: errors.length === 0, errors };
}

function fingerprint(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function validateGate(gate) {
    const errors = [];
    if (!gate || typeof gate !== 'object' || Array.isArray(gate))
        return { ok: false, errors: ['gate object required'] };
    if (!gate.bindings || gate.bindings.length !== 2)
        return { ok: false, errors: ['two raw report bindings required'] };
    const reports = {};
    for (const binding of gate.bindings) {
        try {
            for (const key of ['report', 'osReceipt', 'log', 'frozen']) {
                const recorded = binding[key];
                const current = fingerprint(recorded.path);
                if (current.bytes !== recorded.bytes || current.sha256 !== recorded.sha256)
                    errors.push(`${key}: fingerprint drift`);
            }
            const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.report.path), 'utf8'));
            const os = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.osReceipt.path), 'utf8'));
            const frozen = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.frozen.path), 'utf8'));
            if (os.exitCode !== 0 || os.signal !== null || os.error !== null || os.inputsUnchanged !== true)
                errors.push('OS execution did not succeed without input drift');
            if (
                os.output !== binding.report.path ||
                !Array.isArray(os.command) ||
                !os.command.includes('--out=' + binding.report.path) ||
                !os.command.includes('--browser=all') ||
                !os.command.includes('--phase=' + raw.phase) ||
                os.cwd !== ROOT
            )
                errors.push('OS command/report identity mismatch');
            if (
                JSON.stringify(frozen.inputs) !== JSON.stringify(raw.inputs) ||
                JSON.stringify(frozen.reference) !== JSON.stringify(raw.reference)
            )
                errors.push('frozen inputs/reference mismatch');
            if (Object.hasOwn(reports, raw.phase)) errors.push('duplicate raw phase');
            reports[raw.phase] = raw;
        } catch (error) {
            errors.push(`binding: ${error.message}`);
        }
    }
    const effect = String(gate.task || '')
        .split('/')
        .at(-1);
    errors.push(...validateEffectReports(effect, reports.functional, reports.performance).errors);
    if (gate.status !== 'PASS' || gate.subset !== true || gate.completed !== false || gate.agentGate !== 'NOT_RUN')
        errors.push('effect gate status/scope');
    for (const dimension of ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance'])
        if (gate.gates?.[dimension]?.status !== 'PASS') errors.push(`${dimension}: measured pass required`);
    return { ok: errors.length === 0, errors };
}

function validateWave(gates) {
    if (!Array.isArray(gates) || gates.length !== 3) return { ok: false, errors: ['three effect gates required'] };
    const errors = [];
    const ids = gates.map((gate) =>
        String(gate?.task || '')
            .split('/')
            .at(-1),
    );
    if (new Set(ids).size !== 3 || Object.keys(EFFECTS).some((id) => !ids.includes(id)))
        errors.push('exact E03/E04/E05 coverage required');
    for (const gate of gates) errors.push(...validateGate(gate).errors);
    return { ok: errors.length === 0, errors };
}

function waveScope(gates) {
    const raw = gates.flatMap((gate) =>
        gate.bindings.map((binding) => JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.report.path), 'utf8'))),
    );
    const functional = raw.filter((report) => report.phase === 'functional').flatMap((report) => report.engines);
    const performance = raw.filter((report) => report.phase === 'performance').flatMap((report) => report.engines);
    return {
        effectCount: gates.length,
        dimensionRows: gates.length * 3 * 6,
        measuredDimensions: gates.length * 3 * 6,
        skippedDimensions: 0,
        visualCases: functional.reduce((sum, engine) => sum + engine.captures.length, 0),
        boundaryCases: functional.reduce((sum, engine) => sum + engine.boundaries.length, 0),
        malformedAtomicRejections: functional.reduce((sum, engine) => sum + engine.invalids.length, 0),
        resourceCycles: functional.reduce((sum, engine) => sum + engine.resources.rows.length, 0),
        liveResizeCases: functional.filter((engine) => engine.resize).length,
        performanceProfiles: performance.reduce((sum, engine) => sum + engine.performance.length, 0),
    };
}

function validateWaveReport(report) {
    const errors = [];
    if (!report || typeof report !== 'object' || Array.isArray(report))
        return { ok: false, errors: ['wave report object required'] };
    if (!Array.isArray(report.effects) || report.effects.length !== 3)
        return { ok: false, errors: ['three effect fingerprints required'] };
    const gates = [];
    try {
        for (const recorded of [...report.effects, report.previousWave, report.verifier]) {
            const current = fingerprint(recorded.path);
            if (current.sha256 !== recorded.sha256 || current.bytes !== recorded.bytes)
                errors.push('wave input fingerprint drift: ' + recorded.path);
        }
        if (report.verifier.path !== 'tools/verify/shaders-wave2-gate.cjs') errors.push('wave verifier identity');
        for (const recorded of report.effects)
            gates.push(JSON.parse(fs.readFileSync(path.resolve(ROOT, recorded.path), 'utf8')));
        errors.push(...validateWave(gates).errors);
        const previous = JSON.parse(fs.readFileSync(path.resolve(ROOT, report.previousWave.path), 'utf8'));
        const checked = require('./shaders-wave1-gate.cjs').validateReport(previous);
        errors.push(...checked.errors.map((error) => 'previous Wave: ' + JSON.stringify(error)));
        if (previous.status !== 'PASS' || checked.ok !== true) errors.push('previous Wave must pass');
        if (JSON.stringify(report.scope) !== JSON.stringify(waveScope(gates))) errors.push('wave scope count mismatch');
    } catch (error) {
        errors.push('wave input: ' + error.message);
    }
    if (
        report.schemaVersion !== 'shaders-wave2/1' ||
        report.status !== 'PASS' ||
        report.waveCompleted !== true ||
        report.nextWaveEligible !== true ||
        report.projectCompleted !== false ||
        report.agentGate !== 'NOT_RUN' ||
        report.subset !== true
    )
        errors.push('wave/project/Agent status mismatch');
    return { ok: errors.length === 0, errors };
}

module.exports = {
    validateObservedErrors,
    validateEffectReports,
    validateGate,
    validateWave,
    waveScope,
    validateWaveReport,
};
if (require.main === module) {
    const files = process.argv
        .slice(2)
        .filter((arg) => arg.startsWith('--verify='))
        .map((arg) => arg.slice(9));
    try {
        const wave = process.argv.slice(2).find((arg) => arg.startsWith('--verify-wave='));
        if (wave) {
            const result = validateWaveReport(JSON.parse(fs.readFileSync(wave.slice(14), 'utf8')));
            console.log(JSON.stringify(result));
            process.exitCode = result.ok ? 0 : 1;
        } else {
            if (!files.length) throw new Error('--verify=<gate.json> required (repeat for full Wave 2)');
            const gates = files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
            const result = files.length === 1 ? validateGate(gates[0]) : validateWave(gates);
            console.log(JSON.stringify(result));
            process.exitCode = result.ok ? 0 : 1;
        }
    } catch (error) {
        console.log(JSON.stringify({ ok: false, errors: [error.message] }));
        process.exitCode = 1;
    }
}
