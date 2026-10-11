'use strict';
// Read-only C02 closure. Algorithm/PNG checks belong to the collector; execution,
// complete scope and mutation evidence are checked independently here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('./shaders-film-neon-browser.cjs');
const ROOT = path.resolve(__dirname, '../..');
const ENGINES = ['chromium', 'firefox', 'webkit'];
const DIMENSIONS = ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
function fingerprint(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function screenshotsOf(report) {
    return report.engines.flatMap((e) => [
        ...e.captures.map((c) => c.png),
        e.temporal.a.png,
        e.temporal.b.png,
        e.resize.png,
    ]);
}
function scopeOf(functional, performance) {
    return {
        engines: functional.engines.length,
        dimensionRows: functional.engines.length * DIMENSIONS.length,
        visualCases: functional.engines.reduce((n, e) => n + e.captures.length, 0),
        boundaryCases: functional.engines.reduce((n, e) => n + e.boundaries.length, 0),
        malformedAtomicRejections: functional.engines.reduce((n, e) => n + e.invalids.length, 0),
        resourceCycles: functional.engines.reduce((n, e) => n + e.resources.rows.length, 0),
        liveResize: functional.engines.filter((e) => e.resize).length,
        screenshots: screenshotsOf(functional).length,
        performanceProfiles: performance.engines.reduce((n, e) => n + e.performance.length, 0),
    };
}
function validateReports(functional, performance) {
    const errors = [];
    try {
        for (const [phase, report] of [
            ['functional', functional],
            ['performance', performance],
        ]) {
            errors.push(...C.validateFiles(report).errors.map((e) => phase + ': ' + JSON.stringify(e)));
            if (
                report?.phase !== phase ||
                !same(report?.requestedEngines, ENGINES) ||
                !same(
                    report?.engines?.map((e) => e.engine),
                    ENGINES,
                )
            )
                errors.push(phase + ': exact three-engine scope');
            if (
                report?.scopePassed !== true ||
                report?.exitCode !== 0 ||
                report?.agentGate !== 'NOT_RUN' ||
                report?.subset !== true ||
                report?.completed !== false
            )
                errors.push(phase + ': measured subset status');
        }
        if (!same(functional.inputs, performance.inputs) || !same(functional.reference, performance.reference))
            errors.push('functional/performance identity mismatch');
        if (!(Date.parse(functional.endedAt) <= Date.parse(performance.startedAt)))
            errors.push('collection phases overlap');
        const counts = scopeOf(functional, performance);
        if (
            !same(counts, {
                engines: 3,
                dimensionRows: 18,
                visualCases: 39,
                boundaryCases: 342,
                malformedAtomicRejections: 18,
                resourceCycles: 300,
                liveResize: 3,
                screenshots: 48,
                performanceProfiles: 9,
            })
        )
            errors.push('frozen C02 scope mismatch');
    } catch (error) {
        errors.push('report structure: ' + error.message);
    }
    return { ok: errors.length === 0, errors };
}
function validateGate(gate) {
    const errors = [];
    try {
        if (!gate || typeof gate !== 'object' || Array.isArray(gate))
            return { ok: false, errors: ['gate object required'] };
        if (!Array.isArray(gate.bindings) || gate.bindings.length !== 2)
            return { ok: false, errors: ['two execution bindings required'] };
        const reports = {};
        for (const binding of gate.bindings) {
            for (const key of ['report', 'osReceipt', 'log', 'frozen'])
                if (!same(binding[key], fingerprint(binding[key].path))) errors.push(key + ': fingerprint drift');
            const report = read(binding.report.path),
                os = read(binding.osReceipt.path),
                frozen = read(binding.frozen.path);
            if (os.exitCode !== 0 || os.signal !== null || os.error !== null || os.inputsUnchanged !== true)
                errors.push('natural OS exit/input identity');
            if (
                os.output !== binding.report.path ||
                os.log !== binding.log.path ||
                os.cwd !== ROOT ||
                !Array.isArray(os.command) ||
                !os.command.includes('--out=' + binding.report.path) ||
                !os.command.includes('--browser=all') ||
                !os.command.includes('--phase=' + report.phase)
            )
                errors.push('OS command/output mismatch');
            if (!(
                Date.parse(os.startedAt) <= Date.parse(report.startedAt) &&
                Date.parse(report.endedAt) <= Date.parse(os.endedAt)
            ))
                errors.push('OS/report timestamps');
            if (
                !same(frozen, C.currentIdentity()) ||
                !same(frozen.inputs, report.inputs) ||
                !same(frozen.reference, report.reference)
            )
                errors.push('frozen/current/raw identity mismatch');
            if (Object.hasOwn(reports, report.phase)) errors.push('duplicate phase binding');
            reports[report.phase] = report;
        }
        errors.push(...validateReports(reports.functional, reports.performance).errors);
        if (!same(gate.counts, scopeOf(reports.functional, reports.performance))) errors.push('gate scope counts');
        if (
            gate.schemaVersion !== 'c02-film-neon-current-gate/1' ||
            gate.task !== 'Wave4/C02' ||
            gate.status !== 'PASS' ||
            gate.subset !== true ||
            gate.completed !== false ||
            gate.wave4Gate !== 'NOT_RUN' ||
            gate.agentGate !== 'NOT_RUN'
        )
            errors.push('leaf/Wave/Agent status isolation');
        for (const dimension of DIMENSIONS)
            if (gate.gates?.[dimension]?.status !== 'PASS') errors.push(dimension + ': measured pass');
        if (!same(gate.validatorInputs, C.currentIdentity())) errors.push('validator identity drift');
        if (
            gate.verifier?.path !== 'tools/verify/shaders-film-neon-gate.cjs' ||
            !same(gate.verifier, fingerprint(gate.verifier.path))
        )
            errors.push('verifier fingerprint');
        if (!same(gate.audit, fingerprint(gate.audit.path))) errors.push('audit fingerprint');
        const audit = read(gate.audit.path);
        if (
            audit.baselinesAccepted?.functional !== true ||
            audit.baselinesAccepted?.performance !== true ||
            audit.browserRunsAdded !== 0 ||
            !Array.isArray(audit.rows) ||
            audit.rows.length < 30 ||
            audit.rejected !== audit.rows.length ||
            audit.rows.some((r) => r.rejected !== true || !Array.isArray(r.errors) || !r.errors.length) ||
            new Set(audit.rows.map((r) => r.name)).size !== audit.rows.length ||
            !same(
                audit.inputs,
                gate.bindings.map((b) => b.report),
            )
        )
            errors.push('actual-report mutation evidence');
        if (!same(gate.gates.Visual.screenshots, screenshotsOf(reports.functional)))
            errors.push('visual screenshot scope');
        for (const attempt of gate.historicalAttempts || [])
            for (const key of ['report', 'osReceipt', 'log'])
                if (!same(attempt[key], fingerprint(attempt[key].path))) errors.push('historical artifact drift');
        const shader = fs.readFileSync(path.join(ROOT, 'examples/shader-film-neon/src/film-neon.frag'), 'utf8');
        const body = shader.slice(shader.indexOf('void main('));
        if (
            (body.match(/distanceField\(p\)/g) || []).length !== 1 ||
            (shader.slice(0, shader.indexOf('void main(')).match(/distanceField\(p\)/g) || []).length !== 0
        )
            errors.push('shared center SDF contract');
    } catch (error) {
        errors.push('gate structure: ' + error.message);
    }
    return { ok: errors.length === 0, errors };
}
module.exports = { fingerprint, scopeOf, screenshotsOf, validateReports, validateGate };
if (require.main === module) {
    const arg = process.argv.find((a) => a.startsWith('--verify='));
    let result;
    try {
        result = arg ? validateGate(read(arg.slice(9))) : { ok: false, errors: ['--verify=<gate.json> required'] };
    } catch (error) {
        result = { ok: false, errors: [error.message] };
    }
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
}
