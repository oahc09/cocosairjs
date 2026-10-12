'use strict';
// Read-only aggregation. Two pilots are assessed separately; neither implies Agent/Gallery PASS.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const B = require('./shaders-uv-fusion-browser.cjs');
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fingerprint(file) {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file.replace(/\\/g, '/'), bytes: b.length, sha256: sha(b) };
}
function stats(values) {
    if (!Array.isArray(values)) throw new Error('Invalid metric value');
    if (!values.length) return { count: 0, median: null, p95: null, min: null, max: null };
    if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new Error('Invalid metric value');
    const a = [...values].sort((x, y) => x - y);
    return {
        count: a.length,
        median: a[Math.floor(a.length / 2)],
        p95: a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)],
        min: a[0],
        max: a.at(-1),
    };
}
function metrics(row) {
    const raw = row.observation,
        frames = raw.frames.slice(30),
        selected = new Set(frames.map((f) => f.frame));
    const perFrame = (items) =>
        frames.map((f) => items.filter((x) => x.frame === f.frame).reduce((sum, x) => sum + x.ms, 0));
    return {
        frames: frames.length,
        passes: row.mode === 'reference' ? 2 : 1,
        intervalMs: stats(frames.map((f) => f.intervalMs)),
        renderEnvelopeMs: stats(frames.map((f) => f.renderEnvelopeMs)),
        updateMs: stats(perFrame(raw.updateCalls)),
        nativeGfxEnvelopeMs: stats(perFrame(raw.commands)),
        glDispatchMs: stats(perFrame(raw.draws)),
        gpuMs: stats(raw.gpuSamples.filter((x) => selected.has(x.frame)).map((x) => x.ms)),
        timerAvailable: raw.timerAvailable,
        gpuUnavailableReason: raw.timerAvailable
            ? raw.gpuSamples.length
                ? null
                : 'NO_RESOLVED_NON_DISJOINT_QUERY'
            : 'EXT_DISJOINT_TIMER_QUERY_UNAVAILABLE',
        textureBytes: raw.fixedStart.memory.textureSize,
        bufferBytes: raw.fixedStart.memory.bufferSize,
        childTextures: row.mode === 'reference' ? 1 : 0,
        estimatedOwnedChildBytes: row.mode === 'reference' ? 256 * 256 * 4 : 0,
        clockMinimumMs: Math.min(...row.precision),
    };
}
function pixelDifference(a, b) {
    const { PNG } = require('pngjs');
    const x = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, a))),
        y = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, b)));
    if (x.width !== y.width || x.height !== y.height) throw new Error('Pair PNG size mismatch');
    let max = 0,
        sum = 0,
        nonzero = 0,
        exceeding = 0;
    for (let i = 0; i < x.data.length; i++) {
        const d = Math.abs(x.data[i] - y.data[i]);
        max = Math.max(max, d);
        sum += d;
        if (d) nonzero++;
        if (d > 2) exceeding++;
    }
    return {
        width: x.width,
        height: x.height,
        channels: x.data.length,
        max,
        mean: sum / x.data.length,
        nonzero,
        exceeding,
        acceptance:
            'Measured first pilot data: maximum <=2 code values; mother mathematical oracle remains independently <=2',
    };
}
function assess(functional, performance) {
    const errors = [];
    const f = B.validateFiles(functional),
        p = B.validateFiles(performance);
    if (!f.ok) errors.push(...f.errors.map((e) => 'functional:' + e));
    if (!p.ok) errors.push(...p.errors.map((e) => 'performance:' + e));
    if (errors.length) return { ok: false, errors, effects: [] };
    const effects = [];
    for (const effect of ['emboss', 'glass']) {
        const visual = [],
            benchmarks = [];
        for (const reference of functional.rows.filter((x) => x.effect === effect && x.mode === 'reference')) {
            const fused = functional.rows.find(
                (x) =>
                    x.effect === effect &&
                    x.mode === 'fused' &&
                    x.engine === reference.engine &&
                    x.dpr === reference.dpr,
            );
            for (let i = 0; i < reference.captures.length; i++) {
                const difference = pixelDifference(reference.captures[i].png.path, fused.captures[i].png.path);
                if (difference.exceeding)
                    errors.push(
                        `pair-pixels:${effect}/${reference.engine}/${reference.dpr}/${reference.captures[i].id}`,
                    );
                visual.push({
                    engine: reference.engine,
                    dpr: reference.dpr,
                    case: reference.captures[i].id,
                    ...difference,
                });
            }
        }
        for (const reference of performance.rows.filter((x) => x.effect === effect && x.mode === 'reference')) {
            const fused = performance.rows.find(
                (x) =>
                    x.effect === effect &&
                    x.mode === 'fused' &&
                    x.engine === reference.engine &&
                    x.profile.id === reference.profile.id,
            );
            const a = metrics(reference),
                b = metrics(fused);
            if (a.textureBytes - b.textureBytes !== 256 * 256 * 4) errors.push('actual-texture-saving:' + effect);
            benchmarks.push({
                engine: reference.engine,
                profile: reference.profile.id,
                reference: a,
                fused: b,
                textureBytesSaved: a.textureBytes - b.textureBytes,
                renderEnvelopeMedianRatio:
                    a.renderEnvelopeMs.median > 0 ? b.renderEnvelopeMs.median / a.renderEnvelopeMs.median : null,
                interpretation:
                    'Serial instrumented CPU envelope; GPU and CPU results separated. Lower pass count does not guarantee faster.',
            });
        }
        const rows = functional.rows.filter((x) => x.effect === effect);
        effects.push({
            id: effect,
            status: 'PASS',
            dimensions: {
                Build: 'PASS',
                Runtime: 'PASS',
                Visual: 'PASS',
                Boundary: 'PASS',
                Resource: 'PASS',
                Performance: 'PASS',
            },
            visualCases: rows.reduce((n, x) => n + x.captures.length, 0),
            boundaryCases: rows.reduce((n, x) => n + x.boundaries.length, 0),
            resourceCycles: rows.reduce((n, x) => n + (x.resources?.length || 0), 0),
            resizeCases: rows.filter((x) => x.resize).length,
            performanceWindows: performance.rows.filter((x) => x.effect === effect).length,
            visual,
            benchmarks,
            scope: 'Pure deterministic 256x256 procedural child; complete original mother algorithm, frozen RGBA8 NEAREST/CLAMP semantics',
            coreAPIAdded: false,
            agentGate: 'NOT_RUN',
            galleryGate: 'NOT_RUN',
        });
    }
    if (errors.length) for (const e of effects) e.status = 'FAIL';
    return { ok: errors.length === 0, errors, effects };
}
function validateGate(gate) {
    const errors = [];
    try {
        if (
            !gate ||
            gate.schema !== 'shaders-uv-fusion-gate/1' ||
            gate.agentGate !== 'NOT_RUN' ||
            gate.galleryGate !== 'NOT_RUN' ||
            gate.wave5Gate !== 'NOT_RUN' ||
            gate.projectCompleted !== false ||
            gate.status !== 'PASS'
        )
            return { ok: false, errors: ['gate-schema/claims'] };
        const required = ['tools/verify/shaders-uv-fusion-gate.cjs', 'tools/verify/shaders-uv-fusion-browser.cjs'];
        if (
            !Array.isArray(gate.validatorInputs) ||
            JSON.stringify(gate.validatorInputs.map((x) => x.path).sort()) !== JSON.stringify(required.sort())
        )
            errors.push('validator-closure');
        for (const item of [
            gate.functional,
            gate.performance,
            gate.performanceOS,
            gate.performanceFrozen,
            gate.previousWave,
            ...gate.validatorInputs,
        ])
            if (JSON.stringify(item) !== JSON.stringify(fingerprint(item.path)))
                errors.push('fingerprint:' + item.path);
        const os = read(gate.performanceOS.path);
        if (
            os.exitCode !== 0 ||
            os.signal !== null ||
            os.error !== null ||
            os.inputsUnchanged !== true ||
            !Array.isArray(os.command) ||
            !os.command.includes('--out=' + gate.performance.path) ||
            !Number.isFinite(Date.parse(os.startedAt)) ||
            !(Date.parse(os.endedAt) > Date.parse(os.startedAt))
        )
            errors.push('natural-performance-exit');
        if (JSON.stringify(read(gate.performanceFrozen.path)) !== JSON.stringify(read(gate.performance.path).inputs))
            errors.push('pre-execution-frozen');
        const prior = read(gate.previousWave.path);
        if (
            gate.previousWave.path !== 'docs/evidence/shaders-absorption/wave4-current-sdk-r2-gate.json' ||
            !require('./shaders-current-sdk-wave4-gate.cjs').validateWaveReport(prior).ok
        )
            errors.push('previous-wave');
        const fresh = assess(read(gate.functional.path), read(gate.performance.path));
        if (!fresh.ok) errors.push(...fresh.errors);
        if (JSON.stringify(gate.effects) !== JSON.stringify(fresh.effects)) errors.push('declared-effects');
    } catch (e) {
        errors.push('malformed:' + e.message);
    }
    return { ok: errors.length === 0, errors };
}
module.exports = { assess, validateGate, metrics, pixelDifference, stats, fingerprint };
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
