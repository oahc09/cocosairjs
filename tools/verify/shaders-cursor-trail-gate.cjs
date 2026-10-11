'use strict';
// Lead's independent six-dimension gate. No browser launch, build or output writes.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const C = require('./shaders-cursor-trail-browser.cjs');
const ROOT = path.resolve(__dirname, '../..');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validateTimedWorkload(row) {
    const errors = [];
    const plan = require('./shaders-cursor-trail-performance.cjs').PROFILES.find((p) => p.id === row?.profile?.id);
    const raw = row?.raw;
    if (!plan || !equal(plan, row.profile) || !raw) return { ok: false, errors: ['frozen timed row required'] };
    for (const state of [raw.fixedStart, raw.fixedEnd]) {
        if (
            !state ||
            !equal(state.viewport, plan.viewport) ||
            state.dpr !== plan.dpr ||
            state.canvas?.width !== plan.viewport.width * plan.dpr ||
            state.canvas?.height !== plan.viewport.height * plan.dpr ||
            !equal(state.canvas?.css, plan.viewport) ||
            !equal(state.background, [8, 9, 12]) ||
            !Number.isSafeInteger(state.instance) ||
            state.instance <= 0 ||
            !Number.isSafeInteger(state.frame) ||
            state.frame < 0 ||
            !Number.isFinite(state.time) ||
            state.time < 0 ||
            !Array.isArray(state.shaderPasses) ||
            !state.shaderPasses.length ||
            state.shaderPasses.some((p) => p?.shaderCompiled !== true)
        )
            errors.push('actual timed state/profile/material mismatch');
    }
    if (raw.fixedStart?.instance !== raw.fixedEnd?.instance) errors.push('timed instance changed');
    if (raw.readPixelsDuringWindow !== 0) errors.push('readback entered timed window');
    if (!Array.isArray(raw.frames) || raw.frames.length <= 30)
        return { ok: false, errors: [...errors, 'steady frame observations required'] };
    for (const frame of raw.frames.slice(30)) {
        if (
            !Array.isArray(raw.commands) ||
            !raw.commands.some((c) => c?.frame === frame?.frame && c.operation === 'beginRenderPass')
        )
            errors.push('missing actual native render pass');
        if (
            !Array.isArray(raw.draws) ||
            !raw.draws.some(
                (c) =>
                    c?.frame === frame?.frame &&
                    ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'].includes(
                        c.operation,
                    ),
            )
        )
            errors.push('missing actual native draw dispatch');
    }
    return { ok: errors.length === 0, errors };
}
function validateReports(functional, performance) {
    const errors = [];
    for (const [phase, report] of [
        ['functional', functional],
        ['performance', performance],
    ]) {
        if (report?.phase !== phase) {
            errors.push('explicit phase ' + phase);
            continue;
        }
        errors.push(...C.validateFiles(report).errors);
        if (!equal(report.requestedEngines, C.ENGINES)) errors.push('complete three-engine leaf required');
        if (phase === 'performance')
            for (const engine of Array.isArray(report.engines) ? report.engines : [])
                for (const row of Array.isArray(engine?.performance) ? engine.performance : [])
                    errors.push(...validateTimedWorkload(row).errors);
    }
    if (!equal(functional?.identity, performance?.identity)) errors.push('functional/performance inputs differ');
    if (!(Date.parse(functional?.endedAt) <= Date.parse(performance?.startedAt)))
        errors.push('functional and timed collection overlap');
    return { ok: errors.length === 0, errors };
}
const fingerprint = (file) => {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') };
};
function scopeOf(functional, performance) {
    return {
        engines: functional.engines.length,
        dimensionRows: functional.engines.length * 6,
        visualCases: functional.engines.reduce((n, e) => n + e.captures.length, 0),
        boundaryCases: functional.engines.reduce((n, e) => n + e.boundaries.length, 0),
        malformedAtomicRejections: functional.engines.reduce((n, e) => n + e.invalids.length, 0),
        resourceCycles: functional.engines.reduce((n, e) => n + e.resources.rows.length, 0),
        liveResize: functional.engines.length,
        trustedPointerCases: functional.engines.length,
        trustedTouchCases: functional.engines.filter((e) => e.touch).length,
        screenshots: functional.engines.reduce((n, e) => n + e.captures.length + 3, 0),
        performanceProfiles: performance.engines.reduce((n, e) => n + e.performance.length, 0),
    };
}
function validateGate(gate) {
    const errors = [];
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return { ok: false, errors: ['gate object'] };
    try {
        const reports = {};
        if (!Array.isArray(gate.bindings) || gate.bindings.length !== 2) throw Error('two report bindings');
        for (const binding of gate.bindings) {
            for (const key of ['report', 'osReceipt', 'log', 'frozen'])
                if (!equal(binding[key], fingerprint(binding[key].path))) errors.push(key + ' fingerprint drift');
            const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.report.path), 'utf8'));
            const os = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.osReceipt.path), 'utf8'));
            const frozen = JSON.parse(fs.readFileSync(path.resolve(ROOT, binding.frozen.path), 'utf8'));
            if (!equal(frozen, report.identity) || !equal(frozen, C.currentIdentity()))
                errors.push('input/reference drift');
            if (
                os.exitCode !== 0 ||
                os.signal !== null ||
                os.error !== null ||
                os.inputsUnchanged !== true ||
                os.output !== binding.report.path ||
                os.log !== binding.log.path ||
                !os.command.includes('--browser=all') ||
                !os.command.includes('--phase=' + report.phase) ||
                os.cwd !== ROOT
            )
                errors.push('OS execution/report identity');
            if (reports[report.phase]) errors.push('duplicate phase');
            reports[report.phase] = report;
        }
        errors.push(...validateReports(reports.functional, reports.performance).errors);
        if (!equal(gate.counts, scopeOf(reports.functional, reports.performance)))
            errors.push('declared counts disagree with actual rows');
        if (!equal(gate.verifier, fingerprint('tools/verify/shaders-cursor-trail-gate.cjs')))
            errors.push('independent verifier drift');
        if (!equal(gate.audit, fingerprint(gate.audit.path))) errors.push('audit fingerprint drift');
        const audit = JSON.parse(fs.readFileSync(path.resolve(ROOT, gate.audit.path), 'utf8'));
        if (
            audit.browserRunsAdded !== 0 ||
            audit.baselinesAccepted?.functional !== true ||
            audit.baselinesAccepted?.performance !== true ||
            !Array.isArray(audit.rows) ||
            !audit.rows.length ||
            audit.rejected !== audit.rows.length ||
            audit.rows.some((row) => row.rejected !== true)
        )
            errors.push('actual accepted-baseline mutation audit');
        if (
            gate.task !== 'Wave3/E08' ||
            gate.status !== 'PASS' ||
            gate.subset !== true ||
            gate.completed !== false ||
            gate.wave3Gate !== 'NOT_RUN' ||
            gate.agentGate !== 'NOT_RUN'
        )
            errors.push('scope/status');
        for (const key of ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance'])
            if (gate.gates?.[key]?.status !== 'PASS') errors.push(key + ' not measured');
    } catch (e) {
        errors.push('malformed gate: ' + e.message);
    }
    return { ok: errors.length === 0, errors };
}
module.exports = { validateTimedWorkload, validateReports, validateGate, fingerprint, scopeOf };
if (require.main === module) {
    try {
        const arg = process.argv.find((a) => a.startsWith('--verify='));
        if (!arg) throw Error('--verify=<gate> required');
        const result = validateGate(JSON.parse(fs.readFileSync(arg.slice(9), 'utf8')));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    }
}
