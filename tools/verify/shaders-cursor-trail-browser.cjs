'use strict';
// Native Cocos AIR CPU recorder -> RGBA16F Texture2D -> one material quad.
// --verify is read-only. Collection requires a NEW --out; timed windows require explicit authorization.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    cp = require('node:child_process');
const O = require('./shaders-cursor-trail-oracle.cjs');
const P = require('./shaders-cursor-trail-performance.cjs');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const ENV = require('./shaders-browser-environment.cjs');
const ROOT = path.resolve(__dirname, '../..'),
    EXAMPLE = 'examples/shader-cursor-trail';
const ENGINES = ['chromium', 'firefox', 'webkit'];
const INPUTS = [
    'tools/verify/shaders-api-evidence.cjs',
    'tools/examples/spec-evidence.cjs',
    'docs/example-api-inventory.json',
    ...[
        'index.html',
        'parameters.json',
        'generate-effect.cjs',
        'example.json',
        'files.json',
        'README.md',
        'UPSTREAM.md',
        'LICENSE.reference.txt',
        'src/main.ts',
        'src/recorder.ts',
        'src/parameters.ts',
        'src/trail.frag',
        'src/effect.generated.ts',
    ].map((p) => `${EXAMPLE}/${p}`),
    ...[
        'shaders-cursor-trail-browser.cjs',
        'shaders-cursor-trail-oracle.cjs',
        'shaders-cursor-trail-performance.cjs',
        'shaders-cursor-trail.tsconfig.json',
        'shaders-liquid-metal-performance.cjs',
        'shaders-browser-environment.cjs',
        'shaders-browser-launch.cjs',
        'browser-engines.cjs',
        'competitive-example-server.cjs',
    ].map((p) => `tools/verify/${p}`),
    ...['shader-blocks.js', 'shader-lifecycle.ts', 'asset-lifecycle.js', 'asset-lifecycle.d.ts'].map(
        (p) => `examples/shared/${p}`,
    ),
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'build/npm/cocosair.module.js',
];
const REFS = [
    ...['shaders/CursorTrail/index.ts', 'gpu/kit/agents.ts', 'gpu/kit/host/pointer.ts'].map(
        (p) => `output/shaders-absorption/reference/packages/core/src/${p}`,
    ),
    'output/shaders-absorption/worker-w3-e08-upstream-dataEncoding.ts',
    'output/shaders-absorption/worker-w3-e08-upstream-dataEncoding-fetch.json',
];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fingerprint = (p) => {
    const b = fs.readFileSync(path.resolve(ROOT, p));
    return { path: p.replace(/\\/g, '/'), bytes: b.length, sha256: hash(b) };
};
const currentIdentity = () => ({
    inputs: INPUTS.map(fingerprint),
    reference: {
        repo: 'shader-effects-inc/shaders',
        commit: 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a',
        license: 'MIT',
        files: REFS.map(fingerprint),
    },
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const line = Array.from({ length: 21 }, (_, i) => ({ x: 0.2 + (0.6 * i) / 20, y: 0.5 }));
const corner = Array.from({ length: 25 }, (_, i) =>
    i < 13 ? { x: 0.25 + i * 0.025, y: 0.5 } : { x: 0.55, y: 0.5 + (i - 12) * 0.025 },
);
const crossing = Array.from({ length: 32 }, (_, i) => ({
    x: 0.5 + 0.3 * Math.sin((i * Math.PI) / 15),
    y: 0.5 + 0.2 * Math.sin((i * Math.PI) / 7.5),
}));
const PLAN = [
    { id: 'line', path: line, dt: 1 / 60, patch: {}, ageSteps: 0 },
    { id: 'corner', path: corner, dt: 1 / 60, patch: {}, ageSteps: 0 },
    { id: 'crossing', path: crossing, dt: 1 / 60, patch: { length: 2 }, ageSteps: 0 },
    { id: 'fast', path: line, dt: 1 / 120, patch: {}, ageSteps: 0 },
    { id: 'slow', path: line, dt: 1 / 30, patch: { length: 2 }, ageSteps: 0 },
    { id: 'soft', path: line, dt: 1 / 60, patch: { softness: 0.8 }, ageSteps: 0 },
    { id: 'shrink-zero', path: line, dt: 1 / 60, patch: { shrink: 0 }, ageSteps: 0 },
    { id: 'aged', path: line, dt: 1 / 60, patch: { length: 2 }, ageSteps: 10 },
    { id: 'expired', path: line, dt: 1 / 60, patch: {}, ageSteps: 40 },
    { id: 'wide', path: line, dt: 1 / 60, patch: { radius: 2 }, ageSteps: 0 },
]
    .map((x) => ({ ...x, dpr: 1 }))
    .concat([
        { id: 'line', path: line, dt: 1 / 60, patch: {}, ageSteps: 0, dpr: 2 },
        { id: 'corner', path: corner, dt: 1 / 60, patch: {}, ageSteps: 0, dpr: 2 },
    ]);
function replay(snapshot) {
    const errors = [];
    const validBits = (b) =>
        Array.isArray(b) &&
        b.length === 256 &&
        b.every((x) => Number.isInteger(x) && x >= 0 && x <= 65535 && Number.isFinite(O.fromHalfFloat(x)));
    if (
        !snapshot ||
        !validBits(snapshot.packed) ||
        !Array.isArray(snapshot.updateHistory) ||
        !snapshot.updateHistory.length
    )
        return { errors: ['recorder history/packed required'] };
    const origin = snapshot.recorderOrigin;
    if (!origin || ![origin.x, origin.y].every(Number.isFinite)) return { errors: ['recorder origin'] };
    const recorder = O.makeOracleRecorder(origin);
    let last = -1,
        expected;
    for (const r of snapshot.updateHistory) {
        if (
            !r ||
            !r.pointer ||
            ![r.pointer.x, r.pointer.y, r.deltaTime, r.length, r.radius, r.aspect].every(Number.isFinite) ||
            r.deltaTime < 0 ||
            r.length <= 0 ||
            r.aspect <= 0 ||
            !Number.isSafeInteger(r.frame) ||
            r.frame <= last ||
            r.generation !== snapshot.generation
        ) {
            errors.push('host frame structure/order/generation');
            continue;
        }
        last = r.frame;
        expected = recorder.tick(r.pointer, r.deltaTime, r.length, r.radius, r.aspect);
        if (!same(Array.from(expected.texData), r.bits) || expected.count !== r.count)
            errors.push('independent host pack');
    }
    if (expected && (!same(Array.from(expected.texData), snapshot.packed) || expected.count !== snapshot.trail?.count))
        errors.push('final packed/count');
    if (
        snapshot.trail?.count > 0 &&
        (!snapshot.lastUpload || !same(snapshot.lastUpload.bits, snapshot.packed) || snapshot.lastUpload.bytes !== 512)
    )
        errors.push('actual upload receipt');
    return { errors, frames: snapshot.updateHistory.length };
}
function snapshotErrors(s, width, height, dpr, params) {
    const errors = [];
    if (
        !s ||
        !same(s.params, params) ||
        s.dpr !== dpr ||
        s.viewport?.width !== width ||
        s.viewport?.height !== height ||
        s.canvas?.width !== width * dpr ||
        s.canvas?.height !== height * dpr ||
        s.canvas?.css?.width !== width ||
        s.canvas?.css?.height !== height
    )
        errors.push('frozen params/viewport/DPR');
    if (
        s?.released !== false ||
        s?.oneCanvas !== 1 ||
        !Number.isFinite(s?.time) ||
        !Number.isSafeInteger(s?.frame) ||
        s?.gpuReceipt?.frame + 1 !== s?.frame ||
        s?.gpuReceipt?.time !== s?.time ||
        s?.gpuReceipt?.glError !== 0 ||
        s?.gpuReceipt?.canvas?.width !== width * dpr ||
        s?.gpuReceipt?.canvas?.height !== height * dpr ||
        s?.gpuReceipt?.defaultFramebuffer !== true ||
        s?.gpuReceipt?.cameraTargetTextureNull !== true
    )
        errors.push('frame/time/GPU/terminal');
    if (
        !Array.isArray(s?.shaderPasses) ||
        !s.shaderPasses.length ||
        s.shaderPasses.some((p) => p?.shaderCompiled !== true)
    )
        errors.push('shader compile');
    return errors;
}
function trustedAudit(raw) {
    const errors = [];
    const events = raw?.events;
    if (!Array.isArray(events)) return ['controls events required'];
    let cursor = -1;
    for (const action of ['parameter', 'pause', 'resume', 'reset', 'release']) {
        const i = events.findIndex((e, i) => i > cursor && e?.type?.split(':')[0] === action && e.isTrusted === true);
        if (i < 0) errors.push(`missing trusted ${action}`);
        else cursor = i;
    }
    const pointer = raw.pointer;
    if (!pointer || !Array.isArray(pointer.pointerLog) || pointer.pointerLog.length < 8)
        errors.push('trusted pointer sequence');
    else
        for (const row of pointer.pointerLog) {
            if (
                !row.isTrusted ||
                !Number.isFinite(row.timestamp) ||
                !Number.isSafeInteger(row.sequence) ||
                ![row.clientX, row.clientY, row.rect?.width, row.rect?.height].every(Number.isFinite)
            )
                errors.push('raw pointer receipt');
            else if (
                Math.abs(row.x - (row.clientX - row.rect.left) / row.rect.width) > 1e-12 ||
                Math.abs(row.y - (1 - (row.clientY - row.rect.top) / row.rect.height)) > 1e-12
            )
                errors.push('pointer CSS to UV');
        }
    if (pointer) {
        errors.push(...replay(pointer).errors);
        const log = pointer.pointerLog;
        if (Array.isArray(log)) {
            if (log.length !== line.length || pointer.inputSequence !== log.at(-1)?.sequence)
                errors.push('frozen trusted trace coverage');
            for (const [i, r] of log.entries()) {
                if (
                    !line[i] ||
                    r.type !== 'pointermove' ||
                    r.pointerType !== 'mouse' ||
                    Math.abs(r.x - line[i].x) > 1 / 640 ||
                    Math.abs(r.y - line[i].y) > 1 / 400
                )
                    errors.push('trusted trace not planned path');
            }
            for (let i = 0; i < log.length; i++) {
                const r = log[i];
                if (
                    r.sequence !== i + 1 ||
                    r.generation !== pointer.generation ||
                    (i && r.timestamp < log[i - 1].timestamp)
                )
                    errors.push('pointer sequence/generation');
            }
            for (const r of pointer.updateHistory || []) {
                const observed = log.findLast((p) => p.sequence === r.inputSequence && p.frame <= r.frame);
                if (
                    !observed ||
                    r.inputSequence > pointer.inputSequence ||
                    !same(r.pointer, { x: observed.x, y: observed.y })
                )
                    errors.push('frame did not consume real pointer');
            }
        }
    }
    if (raw.pause?.before.time !== raw.pause?.after.time || !same(raw.pause?.before.packed, raw.pause?.after.packed))
        errors.push('pause changed state');
    if (!(raw.resume?.after.time > raw.resume?.before.time)) errors.push('resume no advance');
    if (!(raw.reset?.after.generation > raw.reset?.before.generation) || raw.reset?.after.trail?.count !== 0)
        errors.push('reset barrier');
    if (raw.escape?.after.trail?.count !== 0 || !(raw.escape?.after.generation > raw.escape?.before.generation))
        errors.push('Escape barrier');
    if (raw.releaseIdentity !== true || raw.terminal !== 'TRAIL_DISPOSED' || raw.release?.sceneCleared !== true)
        errors.push('release terminal/identity');
    const refs = raw.release?.retirement?.refs;
    if (
        !Array.isArray(refs) ||
        !same(refs.map((r) => r?.kind).sort(), [...O.OWNED_KINDS].sort()) ||
        refs.some((r) => r.before !== 1 || r.after !== 0)
    )
        errors.push('release references');
    return errors;
}
function touchAuditUnsafe(snapshot) {
    const errors = [];
    if (!snapshot || !Array.isArray(snapshot.touchLog) || !Array.isArray(snapshot.pointerLog))
        return ['touch raw observations required'];
    // Playwright's genuine touch protocol emits primary PointerEvents on all target
    // browsers. Legacy TouchEvents are independent receipts, not a prerequisite.
    const starts = snapshot.pointerLog.filter((r) => r?.type === 'pointerdown' && r.pointerType === 'touch');
    const ends = snapshot.pointerLog.filter((r) => r?.type === 'pointerup' && r.pointerType === 'touch');
    if (starts.length !== line.length || ends.length !== line.length) errors.push('trusted tap plan coverage');
    if (snapshot.pointerLog.length !== line.length * 2) errors.push('touch event count');
    for (const [i, r] of starts.entries()) {
        const t = r,
            planned = line[i],
            end = ends[i];
        if (
            r.isTrusted !== true ||
            r.generation !== snapshot.generation ||
            !Number.isFinite(r.timestamp) ||
            !t ||
            !planned ||
            Math.abs(t.x - planned.x) > 1 / 390 ||
            Math.abs(t.y - planned.y) > 1 / 844
        )
            errors.push('touch plan/raw coordinates');
        if (
            t &&
            (Math.abs(t.x - (t.clientX - r.rect.left) / r.rect.width) > 1e-12 ||
                Math.abs(t.y - (1 - (t.clientY - r.rect.top) / r.rect.height)) > 1e-12)
        )
            errors.push('touch CSS to UV');
        if (
            !end ||
            end.sequence !== r.sequence + 1 ||
            end.type !== 'pointerup' ||
            !same({ x: end.x, y: end.y }, { x: r.x, y: r.y })
        )
            errors.push('touch down/up pairing');
    }
    if (!snapshot.pointerLog.some((r) => r.pointerType === 'touch'))
        errors.push('touch did not reach primary PointerEvent');
    let previousTimestamp = -1;
    for (const [i, r] of snapshot.pointerLog.entries()) {
        if (
            r.isTrusted !== true ||
            r.pointerType !== 'touch' ||
            r.generation !== snapshot.generation ||
            r.sequence !== i + 1 ||
            !Number.isSafeInteger(r.frame) ||
            r.frame < 0 ||
            !Number.isFinite(r.timestamp) ||
            r.timestamp < previousTimestamp ||
            ![r.x, r.y, r.clientX, r.clientY, r.rect?.left, r.rect?.top, r.rect?.width, r.rect?.height].every(
                Number.isFinite,
            ) ||
            r.rect.width !== 390 ||
            r.rect.height !== 844
        )
            errors.push('touch pointer receipt');
        previousTimestamp = r.timestamp;
    }
    if (snapshot.inputSequence !== line.length * 2 || snapshot.updateHistory?.length !== line.length)
        errors.push('touch consumed coverage');
    for (const [i, row] of (snapshot.updateHistory || []).entries()) {
        const p = snapshot.pointerLog.findLast((p) => p.sequence === row.inputSequence && p.frame <= row.frame);
        if (!p || row.inputSequence !== 2 * (i + 1) || !same(row.pointer, { x: p.x, y: p.y }))
            errors.push('touch pointer not consumed');
    }
    errors.push(...snapshotErrors(snapshot, 390, 844, 2, O.defaults()), ...replay(snapshot).errors);
    return errors;
}
function touchAudit(snapshot) {
    try {
        return touchAuditUnsafe(snapshot);
    } catch (e) {
        return ['Malformed touch receipt: ' + e.message];
    }
}
function validateFilesUnsafe(report) {
    const errors = require('./shaders-api-evidence.cjs').validateAPIEvidence(path.resolve(ROOT, EXAMPLE)).errors,
        check = (condition, message) => {
            if (!condition) errors.push(message);
        };
    if (!report || typeof report !== 'object' || Array.isArray(report)) return { ok: false, errors: ['report object'] };
    try {
        check(same(report.identity, currentIdentity()), 'input/reference identity drift');
    } catch (e) {
        errors.push('identity: ' + e.message);
    }
    check(report.schemaVersion === 'shaders-cursor-trail/1', 'schema');
    check(
        same(report.inputs, report.identity?.inputs) && same(report.reference, report.identity?.reference),
        'top-level identity binding',
    );
    check(report.subset === true && report.completed === false && report.agentGate === 'NOT_RUN', 'scope markers');
    check(['functional', 'performance'].includes(report.phase), 'phase');
    check(
        typeof report.command === 'string' &&
            !!report.command &&
            report.cwd === ROOT &&
            Number.isFinite(Date.parse(report.startedAt)) &&
            Number.isFinite(Date.parse(report.endedAt)) &&
            Date.parse(report.endedAt) >= Date.parse(report.startedAt),
        'execution metadata',
    );
    check(
        report.build?.exitCode === 0 &&
            report.build?.bundleBytes > 0 &&
            Array.isArray(report.build?.files) &&
            report.build.files.length === 1,
        'actual strict/build',
    );
    for (const f of report.build?.files || []) {
        try {
            check(same(f, fingerprint(f.path)), 'build log drift');
            check(/exitCode=0\s*$/.test(fs.readFileSync(path.resolve(ROOT, f.path), 'utf8')), 'strict log exit');
        } catch {
            errors.push('missing build log');
        }
    }
    const engines = report.engines;
    if (!Array.isArray(engines)) return { ok: false, errors: [...errors, 'engines array'] };
    const names = engines.map((e) => e?.engine);
    const browserOption =
        typeof report.command === 'string' ? report.command.match(/--browser=([^\s]+)/)?.[1] || 'all' : 'all';
    const expectedEngines = browserOption === 'all' ? ENGINES : [browserOption];
    check(same(names, expectedEngines) && same(report.requestedEngines, expectedEngines), 'requested engine coverage');
    check(
        names.length > 0 && new Set(names).size === names.length && names.every((e) => ENGINES.includes(e)),
        'engine set',
    );
    for (const e of engines) {
        if (!e || typeof e !== 'object') {
            errors.push('engine object');
            continue;
        }
        check(typeof e.browserVersion === 'string' && !!e.browserVersion, 'browser version');
        check(
            Array.isArray(e.pageErrors) &&
                e.pageErrors.length === 0 &&
                Array.isArray(e.consoleErrors) &&
                e.consoleErrors.length === 0,
            'runtime errors/arrays',
        );
        check(e.pageClosed === true && e.browserClosed === true, 'browser cleanup');
        if (report.phase === 'functional') {
            check(Array.isArray(e.captures) && e.captures.length === PLAN.length, 'visual tuple count');
            for (const [index, r] of (e.captures || []).entries()) {
                const plan = PLAN[index];
                if (!r || !plan) {
                    errors.push('capture structure');
                    continue;
                }
                check(r.id === plan.id && r.dpr === plan.dpr, 'visual tuple');
                const params = { ...O.defaults(), ...plan.patch };
                errors.push(
                    ...snapshotErrors(r.snapshot, 640, 400, plan.dpr, params),
                    ...replay(r.snapshot).errors,
                    ...replay(r.probe).errors,
                );
                if (r.probe && !same(r.snapshot.packed, r.probe.packed)) errors.push('diagnostic changed packed state');
                errors.push(
                    ...O.probeAudit(r.probe, r.probe?.packed, params, {
                        width: 640 * plan.dpr,
                        height: 400 * plan.dpr,
                        time: r.snapshot?.time,
                    }).errors,
                );
                try {
                    check(same(r.png, fingerprint(r.png.path)), 'PNG fingerprint');
                    const audit = O.pngAudit(path.resolve(ROOT, r.png.path), r.snapshot.packed, params);
                    errors.push(...audit.errors);
                    check(audit.width === 640 * plan.dpr && audit.height === 400 * plan.dpr, 'PNG dimensions');
                    if (plan.id !== 'expired')
                        check(
                            audit.points?.some((p) => !same(p.expected, [8, 9, 12, 255])),
                            'vacuous visible trail samples',
                        );
                    else check(r.snapshot.trail?.count === 0, 'expiry not cleared');
                } catch (err) {
                    errors.push('PNG: ' + err.message);
                }
                // Replay the frozen diagnostic script independently, not merely the self-reported history.
                const rec = O.makeOracleRecorder();
                let expected;
                expected = rec.tick({ x: 0.5, y: 0.5 }, 0, params.length, params.radius, 1.6);
                for (const p of plan.path) expected = rec.tick(p, plan.dt, params.length, params.radius, 1.6);
                for (let i = 0; i < plan.ageSteps; i++)
                    expected = rec.tick(plan.path.at(-1), 1 / 60, params.length, params.radius, 1.6);
                check(same(Array.from(expected.texData), r.snapshot.packed), 'frozen stroke differs');
            }
            errors.push(...O.resourceAudit(e.resources).errors, ...trustedAudit(e.normal));
            errors.push(...touchAudit(e.touch?.snapshot));
            try {
                check(same(e.touch.png, fingerprint(e.touch.png.path)), 'touch PNG drift');
                const audit = O.pngAudit(path.resolve(ROOT, e.touch.png.path), e.touch.snapshot.packed, O.defaults());
                errors.push(...audit.errors);
                check(
                    audit.points.some((p) => !same(p.expected, [8, 9, 12, 255])),
                    'vacuous touch pixels',
                );
                check(e.touch.pageClosed === true, 'touch page cleanup');
            } catch (err) {
                errors.push('touch PNG: ' + err.message);
            }
            try {
                check(same(e.normal.pointerPNG, fingerprint(e.normal.pointerPNG.path)), 'pointer PNG drift');
                const a = O.pngAudit(
                    path.resolve(ROOT, e.normal.pointerPNG.path),
                    e.normal.pointer.packed,
                    O.defaults(),
                );
                errors.push(...a.errors);
                check(
                    a.points.some((p) => !same(p.expected, [8, 9, 12, 255])),
                    'trusted pointer invisible',
                );
            } catch (err) {
                errors.push('pointer PNG ' + err.message);
            }
            const invalidIDs = ['null', 'unknown', 'nan', 'infinity', 'range', 'color'];
            check(Array.isArray(e.invalids) && e.invalids.length === invalidIDs.length, 'malformed atomic cases');
            for (const [i, row] of (Array.isArray(e.invalids) ? e.invalids : []).entries()) {
                check(
                    row?.id === invalidIDs[i] &&
                        row?.result?.ok === false &&
                        Array.isArray(row?.result?.errors) &&
                        row.result.errors.length > 0 &&
                        same(row.before.params, row.after.params) &&
                        row.before.instance === row.after.instance &&
                        row.before.updates === row.after.updates,
                    'malformed atomic rejection',
                );
            }
            const boundaries = O.boundaryPlan();
            check(Array.isArray(e.boundaries) && e.boundaries.length === boundaries.length, 'boundary set');
            for (const [i, row] of (e.boundaries || []).entries()) {
                const plan = boundaries[i];
                if (!row || !plan) {
                    errors.push('boundary structure');
                    continue;
                }
                check(row.caseId === plan.caseId, 'boundary tuple');
                if (plan.boundary === 'invalid')
                    check(
                        row.result?.ok === false &&
                            same(row.before.params, row.after.params) &&
                            row.before.instance === row.after.instance &&
                            row.before.updates === row.after.updates,
                        'boundary partial application',
                    );
                else
                    check(
                        row.result?.ok === true &&
                            same(row.after.params, { ...O.defaults(), [plan.parameter]: plan.value }),
                        'boundary applied params',
                    );
            }
            const resize = e.resize;
            if (!resize) errors.push('live resize missing');
            else {
                check(
                    resize.before.instance === resize.after.instance &&
                        resize.before.canvas.width === 640 &&
                        resize.after.canvas.width === 480 &&
                        resize.after.canvas.height === 320,
                    'same instance live resize',
                );
                errors.push(...snapshotErrors(resize.after, 480, 320, 1, O.defaults()), ...replay(resize.after).errors);
                try {
                    check(same(resize.png, fingerprint(resize.png.path)), 'resize PNG drift');
                    errors.push(
                        ...O.pngAudit(path.resolve(ROOT, resize.png.path), resize.after.packed, O.defaults()).errors,
                    );
                } catch (err) {
                    errors.push('resize PNG ' + err.message);
                }
            }
        } else {
            check(
                Array.isArray(e.performance) && e.performance.length === P.PROFILES.length,
                'performance tuple count',
            );
            for (const [i, row] of (e.performance || []).entries()) {
                const profile = P.PROFILES[i];
                if (!row || !profile) {
                    errors.push('performance structure');
                    continue;
                }
                check(same(row.profile, profile), 'frozen profile');
                const env = ENV.validateEnvironmentReceipt(row.environment, {
                    viewport: profile.viewport,
                    dpr: profile.dpr,
                    backing: { w: profile.viewport.width * profile.dpr, h: profile.viewport.height * profile.dpr },
                    headers: { coop: 'same-origin', coep: 'require-corp' },
                    crossOriginIsolated: true,
                });
                errors.push(...env.errors, ...P.validatePerformance(row.raw, profile).errors);
                const positives = row.precision?.allRaw;
                check(
                    Array.isArray(positives) &&
                        positives.length > 0 &&
                        positives.every((x) => Number.isFinite(x) && x > 0) &&
                        Math.min(...positives) === row.precision.minPositive &&
                        positives.length === row.precision.positiveCount,
                    'raw timing calibration',
                );
                const refs = row.release?.retirement?.refs;
                check(
                    Array.isArray(refs) &&
                        same(refs.map((r) => r.kind).sort(), [...O.OWNED_KINDS].sort()) &&
                        refs.every((r) => r.before === 1 && r.after === 0),
                    'performance owned refs',
                );
                check(row.pageClosed === true, 'performance page cleanup');
            }
        }
    }
    check(
        report.cleanup?.serverClosed === true &&
            (report.phase !== 'performance' || report.cleanup?.proxyClosed === true),
        'server/proxy cleanup',
    );
    const passed = errors.length === 0;
    check(report.scopePassed === passed && report.exitCode === (passed ? 0 : 1), 'self-reported status contradiction');
    return { ok: errors.length === 0, errors };
}
function validateFiles(report) {
    try {
        return validateFilesUnsafe(report);
    } catch (e) {
        return { ok: false, errors: ['Malformed report: ' + e.message] };
    }
}
async function present(page) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(80);
}
async function main(argv = process.argv.slice(2)) {
    const opts = Object.fromEntries(argv.map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
    if (opts.verify) {
        const r = validateFiles(JSON.parse(fs.readFileSync(opts.verify, 'utf8')));
        console.log(JSON.stringify(r));
        process.exitCode = r.ok ? 0 : 1;
        return r;
    }
    if (!opts.out || fs.existsSync(opts.out)) throw new Error('New --out required');
    const phase = opts.phase || 'functional';
    if (phase === 'performance' && !opts.authorization)
        throw new Error('Serialized performance requires --authorization');
    const selected = opts.browser && opts.browser !== 'all' ? [opts.browser] : ENGINES;
    if (selected.some((e) => !ENGINES.includes(e))) throw new Error('Unknown browser');
    const directory = path.resolve(ROOT, opts.out.replace(/\.json$/, '-artifacts'));
    fs.mkdirSync(directory, { recursive: true });
    const report = {
        schemaVersion: 'shaders-cursor-trail/1',
        phase,
        identity: currentIdentity(),
        inputs: currentIdentity().inputs,
        reference: currentIdentity().reference,
        requestedEngines: selected,
        startedAt: new Date().toISOString(),
        command: process.execPath + ' ' + process.argv.slice(1).join(' '),
        cwd: ROOT,
        subset: true,
        completed: false,
        agentGate: 'NOT_RUN',
        engines: [],
        cleanup: {},
    };
    const strict = cp.spawnSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-cursor-trail.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8' },
    );
    const buildLog = path.join(directory, 'strict.log');
    fs.writeFileSync(buildLog, `${strict.stdout}${strict.stderr}\nexitCode=${strict.status}\n`, { flag: 'wx' });
    const bundle = require('esbuild').buildSync({
        entryPoints: [`${EXAMPLE}/src/main.ts`],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        external: ['cocosair'],
        write: false,
    });
    report.build = {
        exitCode: strict.status,
        bundleBytes: bundle.outputFiles[0].contents.length,
        files: [fingerprint(path.relative(ROOT, buildLog).replace(/\\/g, '/'))],
    };
    const { startExampleServer } = require('./competitive-example-server.cjs');
    const server = await startExampleServer(ROOT);
    let proxy;
    try {
        if (phase === 'performance') proxy = await ENV.startIsolationProxy(server);
        for (const engine of selected) {
            const browser = await require('playwright')[engine].launch(shaderLaunchOptions(engine));
            const e = {
                engine,
                browserVersion: browser.version(),
                pageErrors: [],
                consoleErrors: [],
                captures: [],
                performance: [],
                pageClosed: false,
                browserClosed: false,
            };
            report.engines.push(e);
            let page;
            const newPage = async (viewport = { width: 640, height: 400 }, dpr = 1, hasTouch = false) => {
                const p = await browser.newPage({ viewport, deviceScaleFactor: dpr, hasTouch });
                p.on('pageerror', (err) => e.pageErrors.push(String(err)));
                p.on('console', (msg) => {
                    if (msg.type() === 'error') e.consoleErrors.push(msg.text());
                });
                return p;
            };
            const open = async (dpr) => {
                const p = await newPage(undefined, dpr);
                await p.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                await p.waitForFunction(() => window.__trail?.ready);
                return p;
            };
            const savePNG = async (p, id) => {
                const file = path.join(directory, `${engine}-${id}.png`);
                await p.screenshot({ path: file });
                return fingerprint(path.relative(ROOT, file).replace(/\\/g, '/'));
            };
            try {
                if (phase === 'functional') {
                    const touchPage = await newPage({ width: 390, height: 844 }, 2, true);
                    try {
                        await touchPage.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                        await touchPage.waitForFunction(() => window.__trail?.ready);
                        for (const point of line) {
                            await touchPage.touchscreen.tap(point.x * 390, (1 - point.y) * 844);
                            await touchPage.evaluate(() => window.__trail.step(1 / 60));
                        }
                        await present(touchPage);
                        e.touch = {
                            snapshot: await touchPage.evaluate(() => window.__trail.snapshot()),
                            png: await savePNG(touchPage, 'trusted-touch-dpr2'),
                            pageClosed: false,
                        };
                    } finally {
                        await touchPage.close();
                        if (e.touch) e.touch.pageClosed = touchPage.isClosed();
                    }
                    page = await open(1);
                    for (const plan of PLAN) {
                        let p = page;
                        if (plan.dpr === 2) p = await open(2);
                        try {
                            await p.evaluate(
                                async ({ plan, defaults }) => {
                                    await window.__trail.set({ ...defaults, ...plan.patch });
                                    window.__trail.resetTrail();
                                    await window.__trail.step(0);
                                    await window.__trail.scriptStroke(plan.path, plan.dt);
                                    for (let i = 0; i < plan.ageSteps; i++) await window.__trail.step(1 / 60);
                                },
                                { plan, defaults: O.defaults() },
                            );
                            await present(p);
                            const snapshot = await p.evaluate(() => window.__trail.snapshot());
                            const png = await savePNG(p, `${plan.id}-dpr${plan.dpr}`);
                            const probe = await p.evaluate(() => window.__trail.linearProbe());
                            e.captures.push({
                                id: plan.id,
                                dpr: plan.dpr,
                                method: 'DIAGNOSTIC_CPU_TRACE',
                                snapshot,
                                png,
                                probe,
                            });
                        } finally {
                            if (plan.dpr === 2) await p.close();
                        }
                    }
                    e.invalids = [];
                    for (const id of ['null', 'unknown', 'nan', 'infinity', 'range', 'color']) {
                        await page.evaluate((p) => window.__trail.set(p), O.defaults());
                        const before = await page.evaluate(() => window.__trail.snapshot());
                        const result = await page.evaluate(
                            ({ id, defaults }) => {
                                let value = { ...defaults };
                                if (id === 'null') value = null;
                                else if (id === 'unknown') value.unknown = 1;
                                else if (id === 'nan') value.radius = NaN;
                                else if (id === 'infinity') value.radius = Infinity;
                                else if (id === 'range') value.radius = 0.49;
                                else value.colorA = '#badxxx';
                                return window.__trail.set(value);
                            },
                            { id, defaults: O.defaults() },
                        );
                        const after = await page.evaluate(() => window.__trail.snapshot());
                        e.invalids.push({ id, before, result, after });
                    }
                    e.boundaries = [];
                    for (const plan of O.boundaryPlan()) {
                        await page.evaluate((p) => window.__trail.set(p), O.defaults());
                        const before = await page.evaluate(() => window.__trail.snapshot());
                        const result = await page.evaluate((p) => window.__trail.set(p), {
                            ...O.defaults(),
                            [plan.parameter]: plan.value,
                        });
                        const after = await page.evaluate(() => window.__trail.snapshot());
                        e.boundaries.push({ caseId: plan.caseId, before, result, after });
                    }
                    await page.evaluate((p) => window.__trail.set(p), O.defaults());
                    e.resources = await page.evaluate(() => window.__trail.cycles());
                    await page.evaluate(async (p) => {
                        window.__trail.resetTrail();
                        await window.__trail.step(0);
                        await window.__trail.scriptStroke(p);
                    }, line);
                    const before = await page.evaluate(() => window.__trail.snapshot());
                    await page.setViewportSize({ width: 480, height: 320 });
                    await page.waitForFunction(() => {
                        const c = document.querySelector('canvas');
                        return c.width === 480 && c.height === 320;
                    });
                    await present(page);
                    await page.evaluate(async () => {
                        await window.__trail.step(0);
                        await window.__trail.step(0);
                    });
                    await present(page);
                    const after = await page.evaluate(() => window.__trail.snapshot());
                    const png = await savePNG(page, 'live-resize');
                    e.resize = { before, after, png };
                    await page.close();
                    page = await newPage();
                    await page.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                    await page.waitForFunction(() => window.__trail?.ready);
                    for (const p of line) {
                        await page.mouse.move(p.x * 640, (1 - p.y) * 400);
                        await page.evaluate(() => window.__trail.step(1 / 60));
                    }
                    await present(page);
                    const pointer = await page.evaluate(() => window.__trail.snapshot());
                    const pointerPNG = await savePNG(page, 'trusted-pointer');
                    await page.evaluate(() => document.documentElement.classList.remove('test'));
                    await page.locator('[data-parameter="radius"]').focus();
                    await page.keyboard.press('ArrowRight');
                    await page.locator('#pause').click();
                    const pauseBefore = await page.evaluate(() => window.__trail.snapshot());
                    await page.evaluate(() => window.__trail.step(0.1));
                    const pauseAfter = await page.evaluate(() => window.__trail.snapshot());
                    await page.locator('#resume').click();
                    const resumeBefore = await page.evaluate(() => window.__trail.snapshot());
                    await page.evaluate(() => window.__trail.step(0.1));
                    const resumeAfter = await page.evaluate(() => window.__trail.snapshot());
                    const resetBefore = resumeAfter;
                    await page.locator('#reset').click();
                    await page.evaluate(() => window.__trail.step(0));
                    const resetAfter = await page.evaluate(() => window.__trail.snapshot());
                    const escapeBefore = resetAfter;
                    await page.keyboard.press('Escape');
                    await page.evaluate(() => window.__trail.step(0));
                    const escapeAfter = await page.evaluate(() => window.__trail.snapshot());
                    await page.locator('#release').click();
                    const released = await page.evaluate(async () => {
                        const a = window.__trail.release(),
                            b = window.__trail.release();
                        const release = await a;
                        let terminal;
                        try {
                            await window.__trail.step(0);
                        } catch (e) {
                            terminal = e.code;
                        }
                        return {
                            release,
                            releaseIdentity: a === b,
                            terminal,
                            events: window.__trail.snapshot().events,
                        };
                    });
                    e.normal = {
                        pointer,
                        pointerPNG,
                        pause: { before: pauseBefore, after: pauseAfter },
                        resume: { before: resumeBefore, after: resumeAfter },
                        reset: { before: resetBefore, after: resetAfter },
                        escape: { before: escapeBefore, after: escapeAfter },
                        ...released,
                    };
                } else {
                    for (const profile of P.PROFILES) {
                        const p = await newPage(profile.viewport, profile.dpr);
                        let row;
                        try {
                            const environment = await ENV.navigateWithDPRRepair(
                                p,
                                `${proxy.origin}/${EXAMPLE}/?test=1&_isolate=1`,
                                {
                                    ...profile,
                                    backing: {
                                        w: profile.viewport.width * profile.dpr,
                                        h: profile.viewport.height * profile.dpr,
                                    },
                                    crossOriginIsolated: true,
                                    headers: { coop: 'same-origin', coep: 'require-corp' },
                                },
                            );
                            await p.waitForFunction(() => window.__trail?.ready);
                            const precision = await p.evaluate(() => {
                                const allRaw = [];
                                let previous = performance.now();
                                for (let i = 0; i < 25000; i++) {
                                    const now = performance.now(),
                                        dt = now - previous;
                                    if (dt > 0) allRaw.push(dt);
                                    previous = now;
                                }
                                return {
                                    allRaw,
                                    minPositive: Math.min(...allRaw),
                                    positiveCount: allRaw.length,
                                    attempts: 25000,
                                };
                            });
                            await p.evaluate(async (defaults) => {
                                await window.__trail.set({ ...defaults, length: 2 });
                                window.__trail.resetTrail();
                                const path = Array.from({ length: 180 }, (_, i) => ({
                                    x: 0.5 + 0.35 * Math.cos((i / 60) * 14),
                                    y: 0.5 + 0.3 * Math.sin((i / 60) * 11),
                                }));
                                await window.__trail.scriptStroke(path);
                                window.__trail.setPerformancePath(true);
                            }, O.defaults());
                            await p.evaluate(() => window.__trail.startPerformance());
                            await p.waitForTimeout(6000);
                            const raw = await p.evaluate(() => window.__trail.stopPerformance());
                            const release = await p.evaluate(() => window.__trail.release());
                            row = { profile, environment, precision, raw, release, pageClosed: false };
                            e.performance.push(row);
                        } finally {
                            await p.close();
                            if (row) row.pageClosed = p.isClosed();
                        }
                    }
                }
            } finally {
                if (page && !page.isClosed()) await page.close();
                e.pageClosed = !page || page.isClosed();
                await browser.close();
                e.browserClosed = !browser.isConnected();
            }
        }
    } finally {
        if (proxy) {
            await proxy.close();
            report.cleanup.proxyClosed = true;
        }
        await server.close();
        report.cleanup.serverClosed = true;
    }
    report.endedAt = new Date().toISOString();
    report.scopePassed = true;
    report.exitCode = 0;
    let result = validateFiles(report);
    report.scopePassed = result.ok;
    report.exitCode = result.ok ? 0 : 1;
    result = validateFiles(report);
    report.validation = result;
    fs.writeFileSync(path.resolve(ROOT, opts.out), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ scopePassed: result.ok, errors: result.errors }));
    process.exitCode = result.ok ? 0 : 1;
    return report;
}
module.exports = { currentIdentity, fingerprint, replay, trustedAudit, touchAudit, validateFiles, PLAN, ENGINES, main };
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
