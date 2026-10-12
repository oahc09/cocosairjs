'use strict';
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const oracle = require('./shaders-driver-pilot-oracle.cjs');
const P = require('./shaders-driver-pilot-performance.cjs');
const ENV = require('./shaders-browser-environment.cjs');
const EXAMPLE = 'examples/shader-driver-pilot';
const ENGINES = ['chromium', 'firefox', 'webkit'];
const CONSUMERS = ['holographic', 'neon'];
const CASES = [
    'pointer-x',
    'pointer-y',
    'pointer-position',
    'time',
    'auto-animate',
    'map-range-clamped',
    'map-range-extrapolate',
];
const PERFORMANCE_PLAN = CONSUMERS.flatMap((consumer) => P.PROFILES.map((profile) => ({ consumer, profile })));
const VISUAL_PLAN = CONSUMERS.flatMap((consumer) =>
    [1, 2].flatMap((dpr) => CASES.map((id) => ({ id, consumer, dpr }))),
);
const GESTURE = [
    { u: 0.35, v: 0.65, dt: 0.1 },
    { u: 0.85, v: 0.25, dt: 0.2 },
];
function boundaryPlan(consumer) {
    const fields =
        consumer === 'neon' ? ['rotation', 'intensity', 'tubeThickness'] : ['rotation', 'hueShift', 'foilScale'];
    const schema = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'examples/shader-' + consumer + '/parameters.json'), 'utf8'),
    ).params;
    return fields.flatMap((field) => {
        const p = schema[field],
            epsilon = (p.max - p.min) * 1e-6;
        return [
            ['default', p.defaultValue],
            ['min', p.min],
            ['max', p.max],
            ['near-min', p.min + epsilon],
            ['near-max', p.max - epsilon],
        ].map(([edge, value]) => ({
            id: field + '/' + edge,
            bindings: [
                {
                    target: consumer + '.' + field,
                    defaultValue: value,
                    binding: {
                        source: 'time',
                        inputMin: 0,
                        inputMax: 1,
                        outputMin: value,
                        outputMax: value,
                        clamp: true,
                    },
                },
            ],
        }));
    });
}
function bindingsFor(consumer, id) {
    const param = (key, binding, defaultValue) => ({ target: consumer + '.' + key, binding, defaultValue });
    const mapped = (source, axis, inputMin, inputMax, outputMin, outputMax, clamp = true) => ({
        source,
        ...(axis ? { axis } : {}),
        inputMin,
        inputMax,
        outputMin,
        outputMax,
        clamp,
    });
    if (id === 'pointer-position') return [param('position', { source: 'pointer', axis: 'uv' }, { x: 0.5, y: 0.5 })];
    if (id === 'pointer-y')
        return [
            param(
                consumer === 'neon' ? 'tubeThickness' : 'foilScale',
                mapped('pointer', 'y', 0, 1, consumer === 'neon' ? 0.01 : 0.6, consumer === 'neon' ? 0.07 : 3),
                consumer === 'neon' ? 0.03 : 1.5,
            ),
        ];
    if (id === 'time') return [param('rotation', mapped('time', null, 0, 1, 0, 360), 0)];
    if (id === 'auto-animate')
        return [
            param(
                consumer === 'neon' ? 'intensity' : 'hueShift',
                {
                    ...mapped('auto', null, -1, 1, consumer === 'neon' ? 0.3 : 30, consumer === 'neon' ? 2.3 : 330),
                    period: 4,
                    amplitude: 1,
                    phase: 0,
                },
                consumer === 'neon' ? 1.15 : 0,
            ),
        ];
    if (id === 'pointer-x') return [param('rotation', mapped('pointer', 'x', 0, 1, 0, 360), 0)];
    if (id.startsWith('map-range'))
        return [param('rotation', mapped('pointer', 'x', 0.25, 0.75, 60, 300, id.endsWith('clamped')), 0)];
    throw new Error('unknown frozen case');
}
function invalidPlan(consumer) {
    const good = { target: consumer + '.rotation', binding: { source: 'pointer', axis: 'x' }, defaultValue: 0 };
    return [
        { id: 'null', input: null, code: 'DRIVER_NULL' },
        { id: 'unknown-root', input: { bindings: [], ghost: 1 }, code: 'DRIVER_UNKNOWN_ROOT' },
        {
            id: 'unknown-binding',
            input: { bindings: [{ ...good, binding: { source: 'pointer', axis: 'x', ghost: 1 } }] },
            code: 'DRIVER_UNKNOWN_BINDING_KEY',
        },
        { id: 'duplicate', input: { bindings: [good, good] }, code: 'DRIVER_DUPLICATE_TARGET' },
        {
            id: 'partial-range',
            input: { bindings: [{ ...good, binding: { source: 'pointer', inputMin: 0 } }] },
            code: 'DRIVER_PARTIAL_RANGE',
        },
        { id: 'scalar-null', input: { bindings: [{ ...good, defaultValue: null }] }, code: 'DRIVER_NAN' },
        {
            id: 'unknown-target',
            input: { bindings: [{ ...good, target: consumer + '.imaginary' }] },
            code: 'DRIVER_UNKNOWN_TARGET',
        },
        { id: 'mother-range', input: { bindings: [{ ...good, defaultValue: 999 }] }, code: 'DRIVER_RANGE' },
    ];
}
const INVALID_CASES = invalidPlan('neon');
const INPUTS = [
    EXAMPLE + '/UPSTREAM.md',
    EXAMPLE + '/LICENSE.reference.txt',
    EXAMPLE + '/example.json',
    EXAMPLE + '/index.html',
    EXAMPLE + '/generate-defaults.cjs',
    ...fs
        .readdirSync(path.join(ROOT, EXAMPLE, 'src'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => EXAMPLE + '/src/' + f),
    'examples/shared/shader-lifecycle.ts',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
    ...CONSUMERS.flatMap((c) => [
        'examples/shader-' + c + '/src/effect.generated.ts',
        'examples/shader-' + c + '/parameters.json',
        'examples/shader-' + c + '/UPSTREAM.md',
        'tools/verify/shaders-' + c + '-oracle.cjs',
    ]),
    'tools/verify/shaders-driver-pilot-browser.cjs',
    'tools/verify/shaders-driver-pilot-oracle.cjs',
    'tools/verify/shaders-driver-pilot-performance.cjs',
    'tools/verify/shaders-driver-pilot.tsconfig.json',
    'tools/verify/shaders-browser-launch.cjs',
    'tools/verify/shaders-browser-environment.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
];
const SDK = ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'];
const fp = (file) => {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: file.replace(/\\/g, '/'),
        bytes: b.length,
        sha256: crypto.createHash('sha256').update(b).digest('hex'),
    };
};
const currentIdentity = () => ({ inputs: [...INPUTS, ...SDK].sort().map(fp) });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const int = (n) => Number.isSafeInteger(n) && n >= 0;
function close(a, b, t = 1e-7) {
    if (typeof a === 'number' || typeof b === 'number') return finite(a) && finite(b) && Math.abs(a - b) <= t;
    if (
        !a ||
        !b ||
        typeof a !== 'object' ||
        typeof b !== 'object' ||
        !equal(Object.keys(a).sort(), Object.keys(b).sort())
    )
        return a === b;
    return Object.keys(a).every((k) => close(a[k], b[k], t));
}
function retirement(r, errors) {
    if (
        !r ||
        !Array.isArray(r.refs) ||
        !equal(r.refs.map((x) => x?.kind).sort(), ['effect', 'material', 'mesh']) ||
        r.refs.some((x) => x.before !== 1 || x.after !== 0) ||
        r.renderersUnbound !== true ||
        r.nodesRemoved !== true ||
        r.registryRemoved !== true
    )
        errors.push('retirement');
}
function checkState(s, plan, bindings, errors, strictGesture = false) {
    if (
        !s ||
        s.selectedConsumer !== plan.consumer ||
        !int(s.currentInstance) ||
        s.currentInstance < 1 ||
        !int(s.frame) ||
        !finite(s.time) ||
        s.time < 0 ||
        s.oneCanvas !== 1 ||
        s.released !== false ||
        !equal(s.bindings, bindings) ||
        !equal(s.viewport, plan.viewport) ||
        s.dpr !== plan.dpr ||
        s.canvas?.width !== plan.viewport.width * plan.dpr ||
        s.canvas?.height !== plan.viewport.height * plan.dpr ||
        !equal(s.canvas.css, plan.viewport) ||
        !Array.isArray(s.shaders) ||
        s.shaders.length !== 1 ||
        s.shaders[0].compiled !== true
    )
        errors.push('state/frozen');
    if (!Array.isArray(s.pointerLog) || !Array.isArray(s.frameLedger) || !s.driver) {
        errors.push('driver raw chain');
        return;
    }
    for (const [i, e] of s.pointerLog.entries()) {
        if (
            !e ||
            e.isTrusted !== true ||
            e.isPrimary !== true ||
            e.sequence !== i + 1 ||
            e.generation !== s.driver.generation ||
            !int(e.frame) ||
            !finite(e.clientX) ||
            !finite(e.clientY) ||
            !finite(e.timeStamp) ||
            !finite(e.rect?.width) ||
            e.rect.width <= 0 ||
            !finite(e.rect.height) ||
            e.rect.height <= 0
        ) {
            errors.push('trusted pointer raw');
            continue;
        }
        if (!close(e.uv, oracle.pointerToUV(e.clientX, e.clientY, e.rect))) errors.push('pointer UV');
    }
    let time = 0,
        priorFrame = -1,
        pointer = { x: 0.5, y: 0.5 },
        outputs = {};
    if (strictGesture && s.frameLedger.length !== 2) errors.push('frozen gesture frames');
    for (const [i, f] of s.frameLedger.entries()) {
        if (
            !f ||
            !int(f.frame) ||
            f.frame <= priorFrame ||
            !finite(f.dt) ||
            f.dt <= 0 ||
            f.generation !== s.driver.generation ||
            !int(f.eventSequence) ||
            f.eventSequence > s.pointerLog.length ||
            !close(f.timeBefore, time)
        ) {
            errors.push('frame ledger');
            continue;
        }
        priorFrame = f.frame;
        pointer = f.eventSequence ? s.pointerLog[f.eventSequence - 1].uv : pointer;
        if (!close(f.pointer, pointer)) errors.push('raw event frame binding');
        if (strictGesture && (!close(f.pointer, { x: GESTURE[i]?.u, y: GESTURE[i]?.v }) || f.dt !== GESTURE[i]?.dt))
            errors.push('frozen gesture');
        time += f.dt;
        outputs = Object.fromEntries(
            bindings.map((p) => [p.target, oracle.computeBinding(p.binding, { time }, { pointer })]),
        );
        const used = oracle.consumed(plan.consumer, outputs);
        if (
            !close(f.outputs, outputs) ||
            !close(f.timeAfter, time) ||
            !close(f.nodePosition, used.position) ||
            !f.backing ||
            !int(f.backing.width) ||
            f.backing.width < 1 ||
            !int(f.backing.height) ||
            f.backing.height < 1 ||
            !close(f.materialUniforms, oracle.uniforms(plan.consumer, outputs, time, f.backing.width, f.backing.height))
        )
            errors.push('actual uniform ledger');
    }
    // dt0 presentation may recompute outputs; in all collected states it uses the last consumed pointer.
    outputs = Object.fromEntries(
        bindings.map((p) => [p.target, oracle.computeBinding(p.binding, { time }, { pointer: s.driver.pointer })]),
    );
    const used = oracle.consumed(plan.consumer, outputs);
    if (
        !close(s.time, time) ||
        !close(s.driver.time, time) ||
        !close(s.outputs, outputs) ||
        !close(s.motherParams, used.params) ||
        !close(s.nodePosition, used.position) ||
        !close(s.uniformReadback, oracle.uniforms(plan.consumer, outputs, time, s.canvas.width, s.canvas.height))
    )
        errors.push('actual consumer state');
}
function checkProbe(c, plan, errors) {
    const s = c.state,
        p = c.probe,
        points = oracle.points(plan.consumer, s.canvas.width, s.canvas.height);
    if (
        !p ||
        !p.state ||
        p.state.diagnostic !== true ||
        p.gpuReceipt?.frame + 1 !== p.state.frame ||
        p.gpuReceipt.time !== s.time ||
        p.gpuReceipt.glError !== 0 ||
        p.gpuReceipt.targetRGBA8 !== true ||
        p.gpuReceipt.transparentClear !== true ||
        p.gpuReceipt.detached !== true ||
        p.gpuReceipt.disposed !== true ||
        !equal(p.tempRefs, { before: 1, after: 0 }) ||
        p.rendererRestored !== true ||
        !p.preserved ||
        ['instanceEqual', 'timeEqual', 'framesEqual', 'outputsEqual'].some((k) => p.preserved[k] !== true) ||
        !equal(
            p.pixels?.map((x) => ({ x: x.x, y: x.y })),
            points,
        ) ||
        p.state.currentInstance !== s.currentInstance ||
        !close(p.state.outputs, s.outputs)
    )
        errors.push('probe structure/cleanup');
    for (const [i, v] of (p?.pixels || []).entries()) {
        if (!Array.isArray(v.rgba) || v.rgba.length !== 4 || v.rgba.some((x) => !int(x) || x > 255)) {
            errors.push('probe byte channels');
            continue;
        }
        const point = points[i];
        if (!point) {
            errors.push('probe point');
            continue;
        }
        const expected = oracle.linearBytes(
            oracle.pixel(plan.consumer, s.outputs, s.time, s.canvas.width, s.canvas.height, point.x, point.y),
        );
        if (v.rgba.some((x, k) => Math.abs(x - expected[k]) > 2))
            errors.push('GPU byte mismatch:' + point.x + ',' + point.y);
    }
}
function checkRelease(r, errors) {
    retirement(r?.retirement, errors);
    if (
        !r ||
        r.sceneCleared !== true ||
        r.postReleaseDispatchSilent !== true ||
        r.controlsDisabled !== true ||
        !int(r.listeners?.adds) ||
        r.listeners.adds !== r.listeners.removes
    )
        errors.push('release');
}
function validateData(report) {
    const errors = [];
    try {
        if (
            !report ||
            report.schemaVersion !== 'w5-driver-pilot/1' ||
            !['functional', 'performance'].includes(report.phase)
        )
            return { ok: false, errors: ['schema/phase'] };
        if (!equal(report.inputs, currentIdentity().inputs)) errors.push('source closure');
        if (
            !Array.isArray(report.requestedEngines) ||
            !report.requestedEngines.length ||
            report.requestedEngines.some((x) => !ENGINES.includes(x)) ||
            new Set(report.requestedEngines).size !== report.requestedEngines.length
        )
            errors.push('engine plan');
        if (
            report.agentGate !== 'NOT_RUN' ||
            report.galleryGate !== 'NOT_RUN' ||
            report.subset !== true ||
            report.completed !== false
        )
            errors.push('claims');
        if (report.build?.exitCode !== 0 || !int(report.build.bundleBytes) || report.build.bundleBytes < 1)
            errors.push('build');
        if (report.collectionError) errors.push('collection error:' + report.collectionError);
        const expected = report.requestedEngines.flatMap((engine) =>
            CONSUMERS.flatMap((consumer) =>
                (report.phase === 'functional' ? [1, 2] : P.PROFILES).map((p) =>
                    [engine, consumer, report.phase === 'functional' ? p : p.id].join('/'),
                ),
            ),
        );
        const seen = [];
        if (!Array.isArray(report.rows)) errors.push('rows');
        for (const row of report.rows || []) {
            const plan =
                report.phase === 'functional'
                    ? { consumer: row.consumer, viewport: { width: 640, height: 400 }, dpr: row.dpr }
                    : { ...row.profile, consumer: row.consumer };
            const key = [row.engine, row.consumer, report.phase === 'functional' ? row.dpr : row.profile?.id].join('/');
            seen.push(key);
            if (
                !expected.includes(key) ||
                !row.browserVersion ||
                !Array.isArray(row.pageErrors) ||
                row.pageErrors.length ||
                !Array.isArray(row.consoleErrors) ||
                row.consoleErrors.length ||
                row.pageClosed !== true ||
                row.browserClosed !== true
            )
                errors.push('row identity/errors/cleanup');
            if (report.phase === 'functional') {
                if (
                    !equal(
                        row.captures?.map((c) => c.id),
                        CASES,
                    )
                )
                    errors.push('capture exact set');
                for (const c of row.captures || []) {
                    const bindings = bindingsFor(row.consumer, c.id);
                    if (!c.setReceipt?.ok || !equal(c.setReceipt.values, bindings)) errors.push('set receipt');
                    checkState(c.state, plan, bindings, errors, true);
                    checkProbe(c, plan, errors);
                    if (!c.png?.path || !c.png.sha256 || !int(c.png.bytes) || c.png.bytes < 1)
                        errors.push('PNG required');
                }
                if (
                    !equal(
                        row.invalids?.map((x) => x.id),
                        invalidPlan(row.consumer).map((x) => x.id),
                    )
                )
                    errors.push('invalid exact set');
                for (const [i, r] of (row.invalids || []).entries())
                    if (
                        r.receipt?.ok !== false ||
                        r.receipt.errors?.[0]?.code !== invalidPlan(row.consumer)[i]?.code ||
                        !equal(r.before, r.after)
                    )
                        errors.push('invalid atomic');
                const boundaries = boundaryPlan(row.consumer);
                if (
                    !equal(
                        row.boundaries?.map((r) => r.id),
                        boundaries.map((r) => r.id),
                    )
                )
                    errors.push('boundary exact set');
                for (const [i, r] of (row.boundaries || []).entries()) {
                    if (r.receipt?.ok !== true || !equal(r.receipt.values, boundaries[i]?.bindings))
                        errors.push('boundary binding receipt');
                    checkState(r.state, plan, boundaries[i]?.bindings || [], errors);
                    if (r.state?.time !== 0 || r.state?.frameLedger?.length !== 0) errors.push('boundary fresh state');
                }
                const resource = row.resources;
                if (!resource || resource.rows?.length !== 100 || new Set(resource.rows.map((x) => x.id)).size !== 100)
                    errors.push('100 resources');
                for (const [i, r] of (resource?.rows || []).entries()) {
                    retirement(r.trace, errors);
                    if (
                        r.index !== i ||
                        r.repeat?.idempotent !== true ||
                        !equal(r.repeat.refs, r.trace.refs) ||
                        !equal(r.before, resource.baseline) ||
                        !equal(r.after, r.before) ||
                        r.created.bufferSize <= r.before.bufferSize ||
                        !equal(r.assetsValid, [false, false, false]) ||
                        r.nodeValid !== false
                    )
                        errors.push('resource observations');
                }
                if (
                    !row.resize ||
                    !equal(row.resize.before.viewport, { width: 640, height: 400 }) ||
                    !equal(row.resize.after.viewport, { width: 480, height: 320 }) ||
                    row.resize.after.currentInstance !== row.resize.before.currentInstance
                )
                    errors.push('live resize');
                if (row.resize) {
                    const resized = { ...plan, viewport: { width: 480, height: 320 } };
                    checkState(row.resize.after, resized, bindingsFor(row.consumer, 'pointer-x'), errors);
                    checkProbe({ state: row.resize.after, probe: row.resize.probe }, resized, errors);
                }
                if (row.dpr === 1) {
                    const n = row.normal;
                    if (
                        !n ||
                        !equal(
                            n.events?.map((x) => x.type),
                            ['pause', 'resume', 'reset', 'release'],
                        ) ||
                        n.events.some((x, i) => x.isTrusted !== true || x.sequence !== i + 1) ||
                        !close(n.pause.before.time, n.pause.after.time) ||
                        n.pause.after.driver.paused !== true ||
                        n.resume.after.time <= n.resume.before.time ||
                        n.resume.after.driver.paused !== false ||
                        n.reset.time !== 0 ||
                        n.reset.generation <= n.generationBefore ||
                        n.releaseIdentity !== true ||
                        n.terminalCode !== 'DRIVER_DISPOSED'
                    )
                        errors.push('normal trusted lifecycle');
                    checkRelease(n?.release, errors);
                }
                checkRelease(row.release, errors);
            } else {
                const raw = row.performance;
                errors.push(...P.validatePerformance(raw, row.profile, row.consumer).errors);
                checkState(raw.fixedStart, plan, bindingsFor(row.consumer, 'auto-animate'), errors);
                checkState(raw.fixedEnd, plan, bindingsFor(row.consumer, 'auto-animate'), errors);
                if (raw.fixedStart.frameLedger.length || raw.fixedStart.time !== 0)
                    errors.push('performance fresh session');
                for (const f of raw.fixedEnd.frameLedger)
                    if (raw.updateCalls.filter((x) => x.frame === f.frame).length !== 1)
                        errors.push('performance actual update binding');
                errors.push(
                    ...ENV.validateEnvironmentReceipt(row.environment, {
                        viewport: row.profile.viewport,
                        dpr: row.profile.dpr,
                        backing: {
                            w: row.profile.viewport.width * row.profile.dpr,
                            h: row.profile.viewport.height * row.profile.dpr,
                        },
                        crossOriginIsolated: true,
                        coop: 'same-origin',
                        coep: 'require-corp',
                    }).errors,
                );
                const precision = row.precision;
                if (
                    precision?.calls !== 25000 ||
                    !Array.isArray(precision.allRaw) ||
                    !precision.allRaw.length ||
                    precision.allRaw.some((x) => !finite(x) || x <= 0) ||
                    precision.positiveCount !== precision.allRaw.length ||
                    precision.minimumPositiveDeltaMs !== Math.min(...precision.allRaw) ||
                    precision.crossOriginIsolated !== true
                )
                    errors.push('clock calibration');
                checkRelease(row.release, errors);
            }
        }
        if (!equal([...seen].sort(), [...expected].sort())) errors.push('tuple exact coverage');
        if (
            report.cleanup?.serverClosed !== true ||
            report.cleanup.proxyClosed !== true ||
            report.cleanup.errors?.length !== 0
        )
            errors.push('global cleanup');
        if (typeof report.scopePassed === 'boolean' && report.scopePassed !== (errors.length === 0))
            errors.push('scope contradiction');
        if (report.exitCode !== undefined && report.exitCode !== (errors.length ? 1 : 0))
            errors.push('exit contradiction');
    } catch (e) {
        errors.push('malformed:' + String(e.message));
    }
    return { ok: errors.length === 0, errors };
}
function pngAudit(file, s, consumer) {
    const png = require('pngjs').PNG.sync.read(fs.readFileSync(path.resolve(ROOT, file)));
    const errors = [];
    if (png.width !== s.canvas.width || png.height !== s.canvas.height) errors.push('PNG dimensions');
    for (const pt of oracle.points(consumer, png.width, png.height)) {
        const offset = ((png.height - 1 - pt.y) * png.width + pt.x) * 4,
            actual = Array.from(png.data.subarray(offset, offset + 4));
        const expected = oracle.pixel(consumer, s.outputs, s.time, png.width, png.height, pt.x, pt.y).display;
        if (actual.some((x, i) => Math.abs(x - expected[i]) > 2)) errors.push('PNG oracle:' + pt.x + ',' + pt.y);
    }
    return errors;
}
function validateFiles(report) {
    const result = validateData(report),
        errors = [...result.errors];
    const check = (entry) => {
        try {
            if (!entry || !equal(fp(entry.path), entry)) errors.push('file fingerprint');
        } catch (e) {
            errors.push('file missing/malformed');
        }
    };
    try {
        check(report?.build?.log);
        if (report?.build?.log?.path) {
            const log = fs.readFileSync(path.resolve(ROOT, report.build.log.path), 'utf8');
            if (!log.includes('tsc exitCode=0') || !log.includes('bundle exitCode=0')) errors.push('actual build log');
        }
        for (const row of report?.rows || [])
            if (report.phase === 'functional') {
                for (const c of row.captures || []) {
                    check(c.png);
                    try {
                        errors.push(...pngAudit(c.png.path, c.state, row.consumer));
                    } catch (e) {
                        errors.push('PNG decode:' + e.message);
                    }
                }
                if (row.resize?.png) {
                    check(row.resize.png);
                    errors.push(...pngAudit(row.resize.png.path, row.resize.after, row.consumer));
                } else errors.push('resize PNG missing');
            }
    } catch (e) {
        errors.push('file validation malformed:' + e.message);
    }
    if (typeof report?.scopePassed === 'boolean' && report.scopePassed !== (errors.length === 0))
        errors.push('file scope contradiction');
    if (report?.exitCode !== undefined && report.exitCode !== (errors.length ? 1 : 0))
        errors.push('file exit contradiction');
    return { ok: errors.length === 0, errors };
}
async function main(args = process.argv.slice(2)) {
    const value = (key) => args.find((x) => x.startsWith('--' + key + '='))?.slice(key.length + 3);
    if (value('verify')) {
        const r = validateFiles(JSON.parse(fs.readFileSync(path.resolve(ROOT, value('verify')), 'utf8')));
        console.log(JSON.stringify(r));
        return r.ok ? 0 : 1;
    }
    const phase = value('phase') || 'functional',
        out = value('out'),
        requested = (value('browser') || 'all') === 'all' ? ENGINES : (value('browser') || '').split(',');
    if (
        !out ||
        !['functional', 'performance'].includes(phase) ||
        requested.some((x) => !ENGINES.includes(x)) ||
        !requested.length ||
        new Set(requested).size !== requested.length
    )
        throw new Error('invalid collection request');
    if (phase === 'performance' && !value('authorization')) throw new Error('Lead quiet-window authorization required');
    const abs = path.resolve(ROOT, out),
        artifacts = abs.replace(/\.json$/, '-artifacts');
    if (fs.existsSync(abs) || fs.existsSync(artifacts)) throw new Error('wx output already exists');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.mkdirSync(artifacts);
    const report = {
        schemaVersion: 'w5-driver-pilot/1',
        phase,
        requestedEngines: requested,
        inputs: currentIdentity().inputs,
        startedAt: new Date().toISOString(),
        command: [process.execPath, ...process.argv.slice(1)],
        cwd: ROOT,
        rows: [],
        cleanup: { serverClosed: false, proxyClosed: false, errors: [] },
        agentGate: 'NOT_RUN',
        galleryGate: 'NOT_RUN',
        subset: true,
        completed: false,
    };
    const built = spawnSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '-p', 'tools/verify/shaders-driver-pilot.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8', windowsHide: true },
    );
    const bundled = spawnSync(
        process.execPath,
        [
            '-e',
            "console.log(require('esbuild').buildSync({entryPoints:['examples/shader-driver-pilot/src/main.ts'],bundle:true,write:false,format:'esm',platform:'browser',external:['cocosair']}).outputFiles[0].contents.length)",
        ],
        { cwd: ROOT, encoding: 'utf8', windowsHide: true },
    );
    const log = abs.replace(/\.json$/, '-build.log');
    fs.writeFileSync(
        log,
        'tsc exitCode=' +
            built.status +
            '\n' +
            built.stdout +
            built.stderr +
            '\nbundle exitCode=' +
            bundled.status +
            '\n' +
            bundled.stdout +
            bundled.stderr,
        { flag: 'wx' },
    );
    report.build = {
        exitCode: built.status === 0 && bundled.status === 0 ? 0 : 1,
        bundleBytes: Number(bundled.stdout.trim()),
        log: fp(path.relative(ROOT, log)),
    };
    let server, proxy;
    const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
    const watch = (page, row) => {
        page.on('pageerror', (e) => row.pageErrors.push(String(e.stack || e)));
        page.on('console', (m) => {
            if (m.type() === 'error') row.consoleErrors.push(m.text());
        });
    };
    const ready = async (page) => {
        await page.waitForFunction(() => window.__driverpilot?.ready, null, { timeout: 60000 });
    };
    const settle = async (page) => {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(80);
    };
    const shot = async (page, name) => {
        await settle(page);
        const file = path.join(artifacts, name + '.png');
        await page.screenshot({ path: file });
        return fp(path.relative(ROOT, file));
    };
    async function gesture(page, consumer, id) {
        await page.evaluate(() => window.__driverpilot.__resetSession());
        const receipt = await page.evaluate(
            (p) => window.__driverpilot.setBindings({ bindings: p }),
            bindingsFor(consumer, id),
        );
        if (!receipt.ok) throw new Error('binding rejected:' + JSON.stringify(receipt));
        for (const g of GESTURE) {
            const rect = await page.locator('#GameCanvas').boundingBox();
            await page.mouse.move(rect.x + g.u * rect.width, rect.y + (1 - g.v) * rect.height);
            await page.evaluate((dt) => window.__driverpilot.step(dt), g.dt);
        }
        await page.evaluate(() => window.__driverpilot.step(0));
        return receipt;
    }
    async function capture(page, row, id, name) {
        const setReceipt = await gesture(page, row.consumer, id),
            state = await page.evaluate(() => window.__driverpilot.snapshot());
        const png = await shot(page, name),
            probe = await page.evaluate(
                (points) => window.__driverpilot.linearProbe(points),
                oracle.points(row.consumer, state.canvas.width, state.canvas.height),
            );
        return { id, setReceipt, state, png, probe };
    }
    try {
        if (report.build.exitCode !== 0) throw new Error('build failed');
        server = await require('./competitive-example-server.cjs').startExampleServer(ROOT);
        if (phase === 'performance') proxy = await ENV.startIsolationProxy(server);
        for (const engine of requested) {
            const browser = await require('playwright')[engine].launch(shaderLaunchOptions(engine)),
                engineRows = [];
            try {
                for (const consumer of CONSUMERS)
                    for (const profile of phase === 'functional'
                        ? [
                              { viewport: { width: 640, height: 400 }, dpr: 1 },
                              { viewport: { width: 640, height: 400 }, dpr: 2 },
                          ]
                        : P.PROFILES) {
                        const row = {
                            engine,
                            consumer,
                            browserVersion: browser.version(),
                            viewport: profile.viewport,
                            dpr: profile.dpr,
                            profile: phase === 'performance' ? profile : undefined,
                            pageErrors: [],
                            consoleErrors: [],
                        };
                        report.rows.push(row);
                        engineRows.push(row);
                        const page = await browser.newPage({
                            viewport: profile.viewport,
                            deviceScaleFactor: profile.dpr,
                        });
                        watch(page, row);
                        try {
                            const url =
                                (proxy || server).origin +
                                '/' +
                                EXAMPLE +
                                '/?test=1&consumer=' +
                                consumer +
                                (proxy ? '&_isolate=1' : '');
                            if (proxy)
                                row.environment = await ENV.navigateWithDPRRepair(page, url, {
                                    viewport: profile.viewport,
                                    dpr: profile.dpr,
                                    backing: {
                                        w: profile.viewport.width * profile.dpr,
                                        h: profile.viewport.height * profile.dpr,
                                    },
                                    crossOriginIsolated: true,
                                    coop: 'same-origin',
                                    coep: 'require-corp',
                                });
                            else await page.goto(url);
                            await ready(page);
                            if (phase === 'functional') {
                                row.captures = [];
                                for (const id of CASES)
                                    row.captures.push(
                                        await capture(
                                            page,
                                            row,
                                            id,
                                            engine + '-' + consumer + '-' + profile.dpr + '-' + id,
                                        ),
                                    );
                                row.invalids = [];
                                for (const item of invalidPlan(consumer))
                                    row.invalids.push(
                                        await page.evaluate((p) => {
                                            const before = window.__driverpilot.snapshot();
                                            const receipt = window.__driverpilot.setBindings(p.input);
                                            const after = window.__driverpilot.snapshot();
                                            return { id: p.id, before, receipt, after };
                                        }, item),
                                    );
                                row.boundaries = [];
                                for (const boundary of boundaryPlan(consumer)) {
                                    await page.evaluate(() => window.__driverpilot.__resetSession());
                                    const receipt = await page.evaluate(
                                        (bindings) => window.__driverpilot.setBindings({ bindings }),
                                        boundary.bindings,
                                    );
                                    await page.evaluate(() => window.__driverpilot.step(0));
                                    row.boundaries.push({
                                        id: boundary.id,
                                        receipt,
                                        state: await page.evaluate(() => window.__driverpilot.snapshot()),
                                    });
                                }
                                row.resources = await page.evaluate(() => window.__driverpilot.cycles());
                                await gesture(page, consumer, 'pointer-x');
                                const before = await page.evaluate(() => window.__driverpilot.snapshot());
                                await page.setViewportSize({ width: 480, height: 320 });
                                await page.waitForFunction((p) => {
                                    const s = window.__driverpilot.snapshot();
                                    return s.canvas.width === 480 * p && s.canvas.height === 320 * p;
                                }, profile.dpr);
                                await page.waitForTimeout(250);
                                for (let i = 0; i < 5; i++) await page.evaluate(() => window.__driverpilot.step(0));
                                const after = await page.evaluate(() => window.__driverpilot.snapshot());
                                row.resize = {
                                    before,
                                    after,
                                    png: await shot(page, engine + '-' + consumer + '-' + profile.dpr + '-resize'),
                                    probe: await page.evaluate(
                                        (p) => window.__driverpilot.linearProbe(p),
                                        oracle.points(consumer, after.canvas.width, after.canvas.height),
                                    ),
                                };
                                row.release = await page.evaluate(() => window.__driverpilot.release());
                            } else {
                                await page.evaluate(() => window.__driverpilot.__resetSession());
                                await page.evaluate(
                                    (p) => window.__driverpilot.setBindings({ bindings: p }),
                                    bindingsFor(consumer, 'auto-animate'),
                                );
                                await page.evaluate(() => window.__driverpilot.step(0));
                                row.precision = await page.evaluate(() => {
                                    const allRaw = [];
                                    let last = performance.now();
                                    for (let i = 0; i < 25000; i++) {
                                        const now = performance.now();
                                        if (now > last) allRaw.push(now - last);
                                        last = now;
                                    }
                                    return {
                                        calls: 25000,
                                        allRaw,
                                        positiveCount: allRaw.length,
                                        minimumPositiveDeltaMs: allRaw.length ? Math.min(...allRaw) : null,
                                        crossOriginIsolated,
                                    };
                                });
                                let active = false;
                                try {
                                    await page.evaluate(() => window.__driverpilot.startPerformance());
                                    active = true;
                                    await page.waitForTimeout(6000);
                                    row.performance = await page.evaluate(() => window.__driverpilot.stopPerformance());
                                    active = false;
                                } finally {
                                    if (active) await page.evaluate(() => window.__driverpilot.stopPerformance());
                                }
                                row.release = await page.evaluate(() => window.__driverpilot.release());
                            }
                        } catch (e) {
                            row.error = String(e.stack || e);
                            throw e;
                        } finally {
                            await page.close();
                            row.pageClosed = page.isClosed();
                        }
                        if (phase === 'functional' && profile.dpr === 1) {
                            const normal = await browser.newPage({ viewport: { width: 640, height: 400 } });
                            watch(normal, row);
                            try {
                                await normal.goto(server.origin + '/' + EXAMPLE + '/?consumer=' + consumer);
                                await ready(normal);
                                await normal.waitForTimeout(120);
                                await normal.locator('#pause').click();
                                const pBefore = await normal.evaluate(() => window.__driverpilot.snapshot());
                                await normal.waitForTimeout(100);
                                const pAfter = await normal.evaluate(() => window.__driverpilot.snapshot());
                                await normal.locator('#resume').click();
                                const rBefore = await normal.evaluate(() => window.__driverpilot.snapshot());
                                await normal.waitForTimeout(120);
                                const rAfter = await normal.evaluate(() => window.__driverpilot.snapshot());
                                const generationBefore = rAfter.driver.generation;
                                await normal.locator('#reset').click();
                                const reset = await normal.evaluate(() => window.__driverpilot.snapshot().resetReceipt);
                                await normal.locator('#release').click();
                                const release = await normal.evaluate(() => window.__driverpilot.release());
                                const identity = await normal.evaluate(
                                    () => window.__driverpilot.release() === window.__driverpilot.release(),
                                );
                                const terminalCode = await normal.evaluate(() => {
                                    try {
                                        window.__driverpilot.setBindings({ bindings: [] });
                                        return '';
                                    } catch (e) {
                                        return e.message;
                                    }
                                });
                                const events = await normal.evaluate(() => window.__driverpilot.snapshot().events);
                                row.normal = {
                                    pause: { before: pBefore, after: pAfter },
                                    resume: { before: rBefore, after: rAfter },
                                    generationBefore,
                                    reset,
                                    release,
                                    releaseIdentity: identity,
                                    terminalCode,
                                    events,
                                };
                            } finally {
                                await normal.close();
                            }
                        }
                    }
            } finally {
                await browser.close();
                for (const r of engineRows) r.browserClosed = true;
            }
        }
    } catch (e) {
        report.collectionError = String(e.stack || e);
    } finally {
        if (proxy)
            try {
                await proxy.close();
                report.cleanup.proxyClosed = true;
            } catch (e) {
                report.cleanup.errors.push(String(e));
            }
        else report.cleanup.proxyClosed = true;
        if (server)
            try {
                await server.close();
                report.cleanup.serverClosed = true;
            } catch (e) {
                report.cleanup.errors.push(String(e));
            }
    }
    report.endedAt = new Date().toISOString();
    const result = validateFiles(report);
    report.validation = result;
    report.scopePassed = result.ok;
    report.exitCode = result.ok ? 0 : 1;
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ scopePassed: result.ok, errors: result.errors, out }));
    return report.exitCode;
}
module.exports = {
    EXAMPLE,
    ENGINES,
    CONSUMERS,
    CASES,
    VISUAL_PLAN,
    INVALID_CASES,
    PERFORMANCE_PLAN,
    INPUTS,
    SDK,
    GESTURE,
    bindingsFor,
    boundaryPlan,
    invalidPlan,
    currentIdentity,
    validateData,
    validateFiles,
    checkState,
    checkProbe,
    retirement,
    checkRelease,
    pngAudit,
    main,
};
if (require.main === module)
    main()
        .then((c) => {
            process.exitCode = c;
        })
        .catch((e) => {
            console.error(e);
            process.exitCode = 1;
        });
