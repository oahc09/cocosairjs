'use strict';
// Pure read-only leaf assessment. This gate never promotes Agent, Gallery or the full Wave5.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const B = require('./shaders-driver-pilot-browser.cjs');
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fingerprint(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: file.replace(/\\/g, '/'),
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
}
function stats(values) {
    if (!Array.isArray(values) || values.some((v) => !Number.isFinite(v) || v < 0))
        throw new Error('finite metric values required');
    if (!values.length) return { count: 0, median: null, p95: null };
    const a = [...values].sort((a, b) => a - b);
    return {
        count: a.length,
        median: a[Math.floor(a.length / 2)],
        p95: a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)],
    };
}
function metrics(row) {
    const raw = row.performance,
        frames = raw.frames.slice(30),
        selected = new Set(frames.map((f) => f.frame));
    const perFrame = (items) =>
        frames.map((f) => items.filter((x) => x.frame === f.frame).reduce((sum, x) => sum + x.ms, 0));
    return {
        engine: row.engine,
        consumer: row.consumer,
        profile: row.profile.id,
        steadyFrames: frames.length,
        passCount: 1,
        drawCount: 1,
        frameIntervalMs: stats(frames.map((x) => x.intervalMs)),
        renderEnvelopeMs: stats(frames.map((x) => x.renderEnvelopeMs)),
        driverUpdateMs: stats(perFrame(raw.updateCalls)),
        nativeGfxEnvelopeMs: stats(perFrame(raw.commands)),
        glDispatchMs: stats(perFrame(raw.draws)),
        gpuTimestampMs: stats(raw.gpuSamples.filter((x) => selected.has(x.frame)).map((x) => x.ms)),
        gpuUnavailableReason: raw.timerAvailable
            ? raw.gpuSamples.length
                ? null
                : 'NO_RESOLVED_NON_DISJOINT_QUERY'
            : 'EXT_DISJOINT_TIMER_QUERY_UNAVAILABLE',
        clockMinimumMs: row.precision.minimumPositiveDeltaMs,
        memory: raw.fixedStart.memory,
        vram: {
            status: 'UNAVAILABLE',
            note: 'WebGL does not expose total process VRAM; engine byte counters are separate.',
        },
        instrumentation: raw.methods.instrumentation,
    };
}
function assess(functional, performance, verifier = B) {
    const errors = [];
    try {
        for (const [phase, report] of [
            ['functional', functional],
            ['performance', performance],
        ]) {
            if (report?.phase !== phase || !equal(report.requestedEngines, B.ENGINES))
                errors.push('full three-engine phase:' + phase);
            errors.push(...verifier.validateFiles(report).errors);
        }
        if (!equal(functional.inputs, performance.inputs)) errors.push('cross-phase input drift');
        if (!(Date.parse(performance.startedAt) >= Date.parse(functional.endedAt))) errors.push('serial phase order');
        const counts = {
            engines: 3,
            consumers: 2,
            dimensions: 18,
            visualCases: functional.rows.reduce((n, r) => n + r.captures.length, 0),
            boundaryCases: functional.rows.reduce((n, r) => n + r.boundaries.length, 0),
            malformedAtomicRejections: functional.rows.reduce((n, r) => n + r.invalids.length, 0),
            resourceCycles: functional.rows.reduce((n, r) => n + r.resources.rows.length, 0),
            liveResize: functional.rows.length,
            screenshots: functional.rows.reduce((n, r) => n + r.captures.length + 1, 0),
            performanceWindows: performance.rows.length,
            steadyFrames: performance.rows.reduce((n, r) => n + r.performance.frames.length - 30, 0),
        };
        const benchmarks = performance.rows.map(metrics);
        return { ok: errors.length === 0, errors, counts, benchmarks };
    } catch (e) {
        return { ok: false, errors: [...errors, 'malformed:' + e.message] };
    }
}
function closure() {
    return [
        'tools/verify/shaders-driver-pilot-gate.cjs',
        'tools/verify/shaders-driver-pilot-browser.cjs',
        'tools/verify/shaders-driver-pilot-performance.cjs',
        'tools/verify/shaders-driver-pilot-oracle.cjs',
    ].map(fingerprint);
}
function validateGate(gate) {
    const errors = [];
    try {
        if (
            !gate ||
            gate.schema !== 'shaders-driver-pilot-gate/1' ||
            gate.status !== 'PASS' ||
            gate.agentGate !== 'NOT_RUN' ||
            gate.galleryGate !== 'NOT_RUN' ||
            gate.wave5Gate !== 'NOT_RUN' ||
            gate.projectCompleted !== false ||
            gate.coreAPIAdded !== false ||
            gate.subset !== true
        )
            return { ok: false, errors: ['gate schema/claims'] };
        if (!equal(gate.validatorInputs, closure())) errors.push('validator closure');
        if (!equal(gate.audit, fingerprint(gate.audit?.path))) errors.push('audit binding');
        const audit = read(gate.audit.path);
        if (
            audit.baselinesAccepted?.functional !== true ||
            audit.baselinesAccepted?.performance !== true ||
            !Array.isArray(audit.rows) ||
            audit.rows.length !== 34 ||
            new Set(audit.rows.map((r) => r.name)).size !== 34 ||
            audit.rows.some((r) => r.accepted !== false || !Array.isArray(r.errors) || !r.errors.length)
        )
            errors.push('actual audit contract');
        let verifier = B,
            candidateRoot = ROOT;
        if (gate.candidate) {
            candidateRoot = path.resolve(ROOT, gate.candidate.root);
            const allowed = path.resolve(ROOT, 'output/shaders-absorption') + path.sep;
            if (
                !fs.realpathSync(candidateRoot).startsWith(allowed) ||
                gate.candidate.mode !== 'immutable-sdk' ||
                !equal(gate.candidate.manifest, fingerprint(gate.candidate.manifest.path))
            )
                throw new Error('candidate boundary/manifest');
            const manifest = read(gate.candidate.manifest.path);
            if (
                manifest.mirrorRoot !== candidateRoot ||
                manifest.canonicalRoot !== ROOT ||
                !Array.isArray(manifest.files) ||
                manifest.files.length < 32
            )
                throw new Error('candidate manifest shape');
            for (const item of manifest.files) {
                const absolute = path.resolve(candidateRoot, item.path);
                if (!absolute.startsWith(candidateRoot + path.sep)) throw new Error('candidate file boundary');
                const bytes = fs.readFileSync(absolute);
                if (
                    item.bytes !== bytes.length ||
                    item.sha256 !== crypto.createHash('sha256').update(bytes).digest('hex')
                )
                    throw new Error('candidate file drift:' + item.path);
                if (item.path.endsWith('.cjs') && item.path.startsWith('tools/verify/')) {
                    const trusted = fs.readFileSync(path.resolve(ROOT, item.path));
                    if (crypto.createHash('sha256').update(trusted).digest('hex') !== item.sha256)
                        throw new Error('candidate verifier source drift:' + item.path);
                }
            }
            verifier = require(path.join(candidateRoot, 'tools/verify/shaders-driver-pilot-browser.cjs'));
            for (const entry of verifier.currentIdentity().inputs) {
                if (
                    !equal(
                        entry,
                        manifest.files.find((f) => f.path === entry.path),
                    )
                )
                    throw new Error('candidate closure missing:' + entry.path);
            }
            if (!equal(manifest.sdkSnapshot, gate.candidate.sdk))
                throw new Error('candidate SDK manifest disagreement');
            if (
                !equal(
                    gate.candidate.sdk,
                    verifier.currentIdentity().inputs.filter((f) => verifier.SDK.includes(f.path)),
                )
            )
                errors.push('frozen SDK mismatch');
        }
        const reports = {};
        for (const phase of ['functional', 'performance']) {
            const bound = gate.bindings?.[phase];
            for (const key of ['report', 'os', 'frozen', 'log']) {
                if (!equal(bound?.[key], fingerprint(bound?.[key]?.path))) errors.push('binding:' + phase + ':' + key);
            }
            const report = read(bound.report.path),
                os = read(bound.os.path),
                frozen = read(bound.frozen.path);
            if (
                os.exitCode !== 0 ||
                os.signal !== null ||
                os.error !== null ||
                os.inputsUnchanged !== true ||
                os.cwd !== candidateRoot ||
                !Array.isArray(os.command) ||
                !os.command.some(
                    (x) =>
                        x.startsWith('--out=') &&
                        path.resolve(os.cwd, x.slice(6)) === path.resolve(ROOT, bound.report.path),
                ) ||
                !os.command.includes('--phase=' + phase) ||
                !Number.isFinite(Date.parse(os.startedAt)) ||
                !(Date.parse(os.endedAt) > Date.parse(os.startedAt))
            )
                errors.push('natural OS exit:' + phase);
            if (!equal(frozen.inputs, report.inputs)) errors.push('pre-execution frozen:' + phase);
            reports[phase] = report;
        }
        const result = assess(reports.functional, reports.performance, verifier);
        errors.push(...result.errors);
        if (!equal(gate.counts, result.counts) || !equal(gate.benchmarks, result.benchmarks))
            errors.push('declared measurements');
        if (
            !equal(
                gate.sdk,
                verifier.currentIdentity().inputs.filter((f) => verifier.SDK.includes(f.path)),
            )
        )
            errors.push('SDK fingerprint');
        if (
            !equal(gate.dimensions, {
                Build: 'PASS',
                Runtime: 'PASS',
                Visual: 'PASS',
                Boundary: 'PASS',
                Resource: 'PASS',
                Performance: 'PASS',
            })
        )
            errors.push('six dimensions');
    } catch (e) {
        errors.push('malformed:' + e.message);
    }
    return { ok: errors.length === 0, errors };
}
module.exports = { fingerprint, stats, metrics, assess, closure, validateGate };
if (require.main === module) {
    const file = process.argv.find((x) => x.startsWith('--verify='))?.slice(9);
    if (!file) {
        console.error('Use --verify=<gate.json>');
        process.exitCode = 2;
    } else {
        const result = validateGate(read(file));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
    }
}
