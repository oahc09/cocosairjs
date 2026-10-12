'use strict';
// C04 input-dissolve production collector: functional (3 engines × 3 routes × frozen cases +
// DPR2) and performance (3 engines × 3 profiles × 3 routes = 27 serial windows). Lead-owned
// quiet windows only; this file never launches anything unless run with --authorization.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const EXAMPLE = 'examples/shader-input-dissolve';
const oracle = require('./shaders-input-dissolve-oracle.cjs');
const performanceOracle = require('./shaders-input-dissolve-performance.cjs');
const contract = require('./shaders-effect-contract.cjs');

const INPUTS = [
    `${EXAMPLE}/src/main.ts`,
    `${EXAMPLE}/src/parameters.ts`,
    `${EXAMPLE}/src/image-source.ts`,
    `${EXAMPLE}/src/effect.generated.ts`,
    `${EXAMPLE}/src/dissolve.frag`,
    `${EXAMPLE}/src/content.frag`,
    `${EXAMPLE}/parameters.json`,
    `${EXAMPLE}/index.html`,
    `${EXAMPLE}/generate-effect.cjs`,
    `${EXAMPLE}/example.json`,
    `${EXAMPLE}/assets/input-pattern.png`,
    'examples/shared/shader-blocks.js',
    'tools/verify/shaders-input-dissolve-oracle.cjs',
    'tools/verify/shaders-input-dissolve-browser.cjs',
    'tools/verify/shaders-native-reset-capture.cjs',
    'tools/verify/shaders-input-dissolve-performance.cjs',
    'tools/verify/shaders-input-dissolve.tsconfig.json',
    'tools/verify/shaders-browser-environment.cjs',
    'tools/verify/shaders-browser-launch.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'tools/verify/shaders-api-evidence.cjs',
    'tools/verify/shaders-effect-contract.cjs',
    'tools/examples/spec-evidence.cjs',
    'docs/example-api-inventory.json',
    'examples/shared/shader-lifecycle.ts',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
];
const SDK = ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'];
const REFERENCE = {
    repo: 'shader-effects-inc/shaders',
    commit: 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a',
    license: 'MIT',
    files: [
        'packages/core/src/shaders/NoiseDissolve/index.ts',
        'packages/core/src/std/effects/reveal.ts',
        'packages/core/src/std/paint/materials.ts',
    ],
};
// Frozen visual cases: (id, patch). All three routes × identity/mid/endpoints/invert/softness/
// disabled/seed/scale + background-light; DPR2 on a subset.
const CAPTURES = [
    ['image-default', { route: 'image' }],
    ['image-progress0', { route: 'image', progress: 0 }],
    ['image-progress1', { route: 'image', progress: 1 }],
    ['image-invert', { route: 'image', invert: 'on' }],
    ['image-softness0', { route: 'image', softness: 0 }],
    ['image-disabled', { route: 'image', dissolveEnabled: 'off' }],
    ['image-seed42', { route: 'image', seed: 42 }],
    ['image-scale10', { route: 'image', scale: 10 }],
    ['procedural-default', { route: 'procedural' }],
    ['procedural-progress0', { route: 'procedural', progress: 0 }],
    ['procedural-progress1', { route: 'procedural', progress: 1 }],
    ['procedural-invert', { route: 'procedural', invert: 'on' }],
    ['procedural-softness0', { route: 'procedural', softness: 0 }],
    ['procedural-disabled', { route: 'procedural', dissolveEnabled: 'off' }],
    ['rendered-default', { route: 'rendered' }],
    ['rendered-progress0', { route: 'rendered', progress: 0 }],
    ['rendered-progress1', { route: 'rendered', progress: 1 }],
    ['rendered-invert', { route: 'rendered', invert: 'on' }],
    ['rendered-softness0', { route: 'rendered', softness: 0 }],
    ['rendered-disabled', { route: 'rendered', dissolveEnabled: 'off' }],
    ['background-light', { route: 'image' }],
];
const DPR2 = [
    'image-default',
    'image-progress0',
    'procedural-default',
    'procedural-disabled',
    'rendered-default',
    'rendered-progress1',
];
const VISUAL_PLAN = [...CAPTURES.map(([id]) => ({ id, dpr: 1 })), ...DPR2.map((id) => ({ id, dpr: 2 }))].map(
    (entry) => ({ ...entry, patch: CAPTURES.find(([id]) => id === entry.id)[1] }),
);
const INVALID_CASES = [
    { kind: 'null', parameter: '$', code: 'INPUTDISSOLVE_PARAMETERS' },
    { kind: 'unknown', parameter: 'unknown', code: 'INPUTDISSOLVE_UNKNOWN_PARAMETER' },
    { kind: 'nan', parameter: 'progress', code: 'INPUTDISSOLVE_PARAMETER_TYPE' },
    { kind: 'infinity', parameter: 'scale', code: 'INPUTDISSOLVE_PARAMETER_TYPE' },
    { kind: 'route', parameter: 'route', code: 'INPUTDISSOLVE_PARAMETER_ENUM' },
    { kind: 'invert', parameter: 'invert', code: 'INPUTDISSOLVE_PARAMETER_ENUM' },
    { kind: 'range', parameter: 'progress', code: 'INPUTDISSOLVE_PARAMETER_RANGE' },
];
/** Frozen performance plan: 3 profiles × 3 routes = 9 windows per engine (27 total). */
const PERFORMANCE_PLAN = [];
for (const profile of [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
])
    for (const route of ['image', 'procedural', 'rendered']) PERFORMANCE_PLAN.push({ profile: { ...profile }, route });
const CAPTURE_TIME = 0.25;
const BACKGROUND = (id) => (id === 'background-light' ? [180, 160, 140] : [8, 9, 12]);
/** Route pass/draw contract: image = static texture → single dissolve pass; procedural =
 * content pass + dissolve; rendered = scene render + dissolve. */
const routePasses = (route) => (route === 'image' ? 1 : 2);

const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fileIdentity = (file) => {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, '/'),
        bytes: b.length,
        sha256: hash(b),
    };
};
function currentIdentity() {
    return {
        inputs: [...INPUTS, ...SDK].map(fileIdentity),
        reference: {
            ...REFERENCE,
            files: REFERENCE.files.map((f) => fileIdentity('output/shaders-absorption/reference/' + f)),
        },
    };
}
const same = (a, b) => contract.canonical(a) === contract.canonical(b);
function pngDimensions(file) {
    try {
        const { PNG } = require('pngjs');
        const png = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, file)));
        return { width: png.width, height: png.height };
    } catch (error) {
        return { error: String(error.message || error).split('\n')[0] };
    }
}
function checkPng(entry, label, errors, expectedSize) {
    try {
        const now = fileIdentity(entry.png.path);
        if (now.sha256 !== entry.png.sha256 || now.bytes !== entry.png.bytes)
            errors.push(`${label}: PNG identity drift`);
        const dims = pngDimensions(entry.png.path);
        if (dims.error) errors.push(`${label}: PNG unreadable ${dims.error}`);
        else if (
            (expectedSize && (dims.width !== expectedSize.width || dims.height !== expectedSize.height)) ||
            (!expectedSize && (dims.width <= 0 || dims.height <= 0))
        )
            errors.push(`${label}: PNG size ${dims.width}x${dims.height}`);
    } catch (error) {
        errors.push(`${label}: PNG ${String(error.message || error).split('\n')[0]}`);
    }
}
function validateBuild(report, errors) {
    const build = report.build;
    if (!build || typeof build !== 'object') {
        errors.push('build record required');
        return;
    }
    if (build.exitCode !== 0) errors.push('build exitCode must be 0');
    if (typeof build.bundleBytes !== 'number' || !Number.isFinite(build.bundleBytes) || build.bundleBytes <= 0)
        errors.push('build bundleBytes nonzero');
    try {
        const now = fileIdentity(build.raw.path);
        if (now.sha256 !== build.raw.sha256 || now.bytes !== build.raw.bytes) errors.push('build log identity');
        const text = fs.readFileSync(path.resolve(ROOT, build.raw.path), 'utf8');
        if (!text.includes('exitCode=0')) errors.push('build log content');
    } catch {
        errors.push('build log unreadable');
    }
}
function environmentPlan(profile) {
    return {
        viewport: profile.viewport,
        dpr: profile.dpr,
        backing: { w: profile.viewport.width * profile.dpr, h: profile.viewport.height * profile.dpr },
        crossOriginIsolated: true,
        headers: { coop: 'same-origin', coep: 'require-corp' },
    };
}
function expectedImageReceipt() {
    const { PNG } = require('pngjs');
    const png = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, EXAMPLE, 'assets/input-pattern.png')));
    const bytes = Buffer.alloc(png.data.length);
    for (let i = 0; i < bytes.length; i += 4) {
        const alpha = png.data[i + 3] / 255;
        for (let c = 0; c < 3; c++) {
            const srgb = png.data[i + c] / 255;
            const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
            bytes[i + c] = Math.round(linear * alpha * 255);
        }
        bytes[i + 3] = png.data[i + 3];
    }
    return {
        width: png.width,
        height: png.height,
        format: 'premultiplied-linear-rgba8',
        bytes: bytes.length,
        sha256: hash(bytes),
    };
}
function validateCaptureTuples(e, errors) {
    const captures = e.captures;
    if (!Array.isArray(captures) || captures.length !== VISUAL_PLAN.length) {
        errors.push(`${e.engine}: visual tuple count ${captures?.length} != ${VISUAL_PLAN.length}`);
        return;
    }
    for (const [index, plan] of VISUAL_PLAN.entries()) {
        const c = captures[index],
            label = `${e.engine}:capture[${index}]`;
        if (!c || typeof c !== 'object') {
            errors.push(`${label}: object required`);
            continue;
        }
        if (c.id !== plan.id || c.dpr !== plan.dpr) errors.push(`${label}: tuple ${c.id}@${c.dpr}`);
        const expectedParams = { ...oracle.defaults(), ...plan.patch };
        if (!same(c.params, expectedParams)) errors.push(`${label}: params not frozen defaults+patch`);
        if (c.time !== CAPTURE_TIME) errors.push(`${label}: time ${c.time} != frozen`);
        if (!same(c.presentation, { background: BACKGROUND(plan.id) })) errors.push(`${label}: presentation`);
        const snap = c.snapshot;
        if (!snap || typeof snap !== 'object') errors.push(`${label}: snapshot required`);
        else {
            if (!same(snap.params, expectedParams)) errors.push(`${label}: snapshot params`);
            if (!same(snap.viewport, { width: 640, height: 400 })) errors.push(`${label}: snapshot viewport`);
            if (snap.canvas?.width !== 640 * plan.dpr || snap.canvas?.height !== 400 * plan.dpr)
                errors.push(`${label}: snapshot backing`);
            if (snap.route !== expectedParams.route) errors.push(`${label}: route mismatch`);
            const snapPasses = snap.gpuReceipt?.renderPasses ?? snap.gpuReceipt?.drawCalls;
            if (snapPasses !== routePasses(expectedParams.route))
                errors.push(
                    `${label}: drawCalls ${snap.gpuReceipt?.drawCalls} != route contract ${routePasses(expectedParams.route)}`,
                );
            if (expectedParams.route === 'image' && !same(snap.imageRoute, expectedImageReceipt()))
                errors.push(`${label}: image route bytes evidence missing`);
            if (expectedParams.route !== 'image' && !snap.renderTargets?.source)
                errors.push(`${label}: RT source evidence missing`);
        }
        checkPng(c, label, errors, { width: 640 * plan.dpr, height: 400 * plan.dpr });
        try {
            const checked = oracle.pngAudit(
                path.resolve(ROOT, c.png.path),
                { ...c.params, __time: c.time },
                c.presentation,
            );
            if (checked.errors.length) errors.push({ capture: c.id, dpr: c.dpr, errors: checked.errors.slice(0, 3) });
        } catch (error) {
            errors.push(`${label}: pngAudit ${String(error.message || error).split('\n')[0]}`);
        }
        try {
            const probe = oracle.probeAudit(
                c.probe,
                { ...c.params, __time: c.time },
                { width: 640 * plan.dpr, height: 400 * plan.dpr },
            );
            errors.push(
                ...probe.errors.map((x) => ({
                    engine: e.engine,
                    capture: c.id,
                    dpr: c.dpr,
                    stage: 'linear-probe',
                    error: x,
                })),
            );
        } catch (error) {
            errors.push(`${label}: probeAudit ${String(error.message || error).split('\n')[0]}`);
        }
        if (
            !Number.isFinite(c.probe?.time) ||
            c.probe.time !== c.time ||
            c.probe.gpuReceipt?.time !== c.time ||
            !Number.isSafeInteger(c.probe?.frame) ||
            c.probe.frame !== c.probe.gpuReceipt?.frame + 1
        )
            errors.push(`${label}: raw probe frame/time binding`);
        const preserved = c.probe?.preserved;
        if (!preserved || preserved.instanceEqual !== true || preserved.framesEqual !== true)
            errors.push(`${label}: linear probe did not preserve instance`);
        if (c.probe?.tempRefs?.before !== 1 || c.probe?.tempRefs?.after !== 0)
            errors.push(`${label}: probe temp material refs not paired`);
        if (c.probe?.rendererRestored !== true) errors.push(`${label}: probe renderer pointer not restored`);
    }
    let previousParams = oracle.defaults();
    for (const [index, plan] of VISUAL_PLAN.entries()) {
        const c = captures[index],
            label = `${e.engine}:capture[${index}] set`;
        if (plan.dpr === 2 && VISUAL_PLAN[index - 1] && VISUAL_PLAN[index - 1].dpr === 1)
            previousParams = oracle.defaults();
        const set = c?.set;
        if (!set?.before || !set?.receipt || !c?.snapshot) {
            errors.push(`${label}: observation missing`);
            continue;
        }
        if (!same(set.before.params, previousParams)) errors.push(`${label}: before params chain`);
        const routeChanged = c.params.route !== set.before.params.route;
        if (routeChanged) {
            if (!set.receipt.retirement) errors.push(`${label}: route switch without rebuild receipt`);
            if (c.snapshot.instance === set.before.instance) errors.push(`${label}: route switch did not rebuild`);
        } else {
            if (set.receipt.retirement !== null) errors.push(`${label}: uniform update rebuilt`);
            if (c.snapshot.instance !== set.before.instance) errors.push(`${label}: uniform update rebuilt`);
        }
        previousParams = c.params;
    }
    if (e.dpr2PageClosed !== true) errors.push(`${e.engine}: dpr2 page not closed`);
}
function validateBoundaries(e, errors) {
    const plan = oracle.boundaryPlan(),
        rows = e.boundaries;
    if (!Array.isArray(rows) || rows.length !== plan.length) {
        errors.push(`${e.engine}: boundary exact set`);
        return;
    }
    const defaults = oracle.defaults();
    for (const row of rows) {
        const label = `boundary:${row.caseId}`;
        if (!row.before || !row.after || !row.receipt) {
            errors.push(`${label}: observation missing`);
            continue;
        }
        const valid = row.boundary !== 'invalid';
        const afterParams = valid ? { ...defaults, [row.parameter]: row.value } : defaults;
        if (row.boundary === 'invalid') {
            if (row.receipt.ok !== false || !Array.isArray(row.receipt.errors) || !row.receipt.errors.length)
                errors.push(`${label}: invalid accepted`);
            if (!same(row.after.params, row.before.params)) errors.push(`${label}: partial application`);
            if (row.after.instance !== row.before.instance) errors.push(`${label}: rebuild on rejection`);
        } else {
            if (row.receipt.ok !== true) errors.push(`${label}: valid rejected`);
            else if (!same(row.after.params, afterParams)) errors.push(`${label}: after params`);
            if (row.after.instance !== row.before.instance || row.receipt.retirement !== null)
                errors.push(`${label}: uniform update must not rebuild`);
        }
    }
}
function validateInvalids(e, errors) {
    const invalids = e.invalids;
    if (!Array.isArray(invalids) || invalids.length !== INVALID_CASES.length) {
        errors.push(`${e.engine}: invalid case count`);
        return;
    }
    for (const [index, frozen] of INVALID_CASES.entries()) {
        const row = invalids[index],
            label = `${e.engine}:invalid[${index}]`;
        if (row?.case?.kind !== frozen.kind || row?.case?.parameter !== frozen.parameter)
            errors.push(`${label}: frozen case`);
        if (row.receipt?.ok !== false || !Array.isArray(row.receipt?.errors) || !row.receipt.errors.length)
            errors.push(`${label}: accepted`);
        else if (!row.receipt.errors.some((x) => x?.code === frozen.code && x?.parameter === frozen.parameter))
            errors.push(`${label}: error code ${frozen.code}`);
        if (
            !row.before ||
            !row.after ||
            !same(row.before.params, row.after.params) ||
            row.before.instance !== row.after.instance ||
            row.before.updates !== row.after.updates
        )
            errors.push(`${label}: rejection partially applied`);
    }
}
function validateNormal(e, errors) {
    const n = e.normal;
    if (!n || typeof n !== 'object') {
        errors.push(`${e.engine}: native controls required`);
        return;
    }
    const param = n.parameter;
    if (!param?.before || !param?.after || param.after.params.progress === param.before.params.progress)
        errors.push(`${e.engine}: trusted parameter control`);
    if (!n.pause || n.pause.before.time !== n.pause.after.time) errors.push(`${e.engine}: pause clock`);
    if (!n.resume || n.resume.after.time <= n.resume.before.time) errors.push(`${e.engine}: resume clock`);
    if (!n.reset || !same(n.reset.params, oracle.defaults()) || n.reset.time !== 0)
        errors.push(`${e.engine}: reset state`);
    const events = Array.isArray(n.events) ? n.events : [];
    const order = ['parameter', 'pause', 'resume', 'reset', 'release'];
    let cursor = -1;
    const seenTypes = new Set();
    for (const event of events) {
        const prefix = event.type.split(':')[0];
        const at = order.indexOf(prefix);
        if (at >= 0) {
            if (at < cursor) errors.push(`${e.engine}: trusted event order`);
            cursor = at;
            seenTypes.add(prefix);
        }
        if (at >= 0 && event.isTrusted !== true) errors.push(`${e.engine}: untrusted ${prefix}`);
    }
    // EVERY trusted control type must be exercised — a final release alone does not cover them.
    for (const required of order)
        if (!seenTypes.has(required)) errors.push(`${e.engine}: trusted control coverage missing ${required}`);
    const release = n.release;
    if (
        !release ||
        !Array.isArray(release.retirement?.refs) ||
        !release.retirement.refs.length ||
        release.retirement.refs.some((r) => r?.before !== 1 || r?.after !== 0) ||
        release.retirement.renderersUnbound !== true ||
        release.retirement.nodesRemoved !== true ||
        release.sceneCleared !== true ||
        release.listenerAdds !== release.listenerRemoves ||
        release.ledger !== release.listenerAdds ||
        release.postReleaseDispatchSilent !== true
    )
        errors.push(`${e.engine}: owned release`);
}
function validateLifecycle(e, errors) {
    const l = e.lifecycle;
    if (!l || typeof l !== 'object') {
        errors.push(`${e.engine}: lifecycle required`);
        return;
    }
    const recreated = l.recreated;
    if (!recreated?.trace || !Array.isArray(recreated.trace.refs) || !recreated.trace.refs.length)
        errors.push(`${e.engine}: recreate retirement`);
    if (
        !Number.isSafeInteger(recreated?.trace?.id) ||
        recreated.trace.id <= 0 ||
        !Number.isSafeInteger(recreated?.snapshot?.instance) ||
        recreated.snapshot.instance <= 0 ||
        recreated.trace.id === recreated.snapshot.instance
    )
        errors.push(`${e.engine}: recreated instance not distinct`);
    if (l.samePromise !== true) errors.push(`${e.engine}: release promise identity`);
    if (l.terminalCode !== 'INPUTDISSOLVE_DISPOSED') errors.push(`${e.engine}: terminal guard code`);
    if (!l.release?.sceneCleared || l.release.listenerAdds !== l.release.listenerRemoves)
        errors.push(`${e.engine}: terminal cleanup`);
}
function validateResize(e, errors) {
    const rows = e.resizes;
    if (
        !Array.isArray(rows) ||
        rows.length !== 3 ||
        !same(rows.map((r) => r.route).sort(), ['image', 'procedural', 'rendered'])
    ) {
        errors.push(`${e.engine}: three-route resize set required`);
        return;
    }
    for (const row of rows) validateResizeRow(e, row, errors);
}
function validateResizeRow(e, r, errors) {
    const expected = { ...oracle.defaults(), route: r.route };
    if (!r || typeof r !== 'object') {
        errors.push(`${e.engine}: live resize required`);
        return;
    }
    if (!same(r.before?.canvas?.css, { width: 640, height: 400 }) || r.before?.canvas?.width !== 640)
        errors.push(`${e.engine}: resize start`);
    if (!same(r.after?.canvas?.css, { width: 480, height: 320 }) || r.after?.canvas?.width !== 480)
        errors.push(`${e.engine}: resize result`);
    for (const [label, snap] of [
        ['before', r.before],
        ['after', r.after],
    ]) {
        if (!same(snap?.params, expected)) errors.push(`${e.engine}: resize ${label} params`);
        if (
            r.route !== 'image' &&
            (snap?.renderTargets?.source?.width !== snap?.canvas?.width ||
                snap?.renderTargets?.source?.height !== snap?.canvas?.height ||
                snap?.renderTargets?.source?.attached !== true)
        )
            errors.push(`${e.engine}: resize ${label} RT backing`);
        if (!same(snap?.background, BACKGROUND('default'))) errors.push(`${e.engine}: resize ${label} background`);
    }
    if (
        r.route !== 'image' &&
        !(r.after?.renderTargets?.source?.generation > r.before?.renderTargets?.source?.generation)
    )
        errors.push(`${e.engine}: resize RT generation did not advance`);
    const frames = Array.isArray(r.resizeFrames) ? r.resizeFrames : [];
    if (frames.length < 3) errors.push(`${e.engine}: resize observation frames`);
    for (const [i, frame] of frames.entries()) {
        if (!frame?.canvas || frame.canvas.width !== 480 || frame.canvas.height !== 320)
            errors.push(`${e.engine}: resize frame ${i} backing`);
    }
    if (
        !Number.isFinite(r.probe?.time) ||
        r.probe.time !== r.before?.time ||
        r.probe?.gpuReceipt?.time !== r.before?.time
    )
        errors.push(`${e.engine}: resize raw probe time`);
    checkPng(r, `${e.engine}:resize`, errors, { width: 480, height: 320 });
    try {
        const gpu = oracle.probeAudit(r.probe, { ...expected, __time: r.before?.time }, { width: 480, height: 320 });
        if (gpu.errors.length) errors.push({ engine: e.engine, stage: 'resize-probe', errors: gpu.errors.slice(0, 3) });
        const checked = oracle.pngAudit(path.resolve(ROOT, r.png.path), {
            ...expected,
            __time: r.before?.time,
        });
        if (checked.errors.length)
            errors.push({ engine: e.engine, stage: 'live-resize-presentation', errors: checked.errors.slice(0, 3) });
    } catch (error) {
        errors.push(`${e.engine}: resize audit ${String(error.message || error).split('\n')[0]}`);
    }
}
function validateFilesInner(report) {
    const errors = [];
    if (!report || typeof report !== 'object') return { ok: false, errors: ['report object required'] };
    if (report.schemaVersion !== 'w4-c04-input-dissolve/1') return { ok: false, errors: ['schema'] };
    if (!Array.isArray(report.inputs) || !Array.isArray(report.engines) || !Array.isArray(report.requestedEngines))
        return { ok: false, errors: ['report structure'] };
    for (const f of report.inputs || []) {
        try {
            const now = fileIdentity(f.path);
            if (now.sha256 !== f.sha256 || now.bytes !== f.bytes) errors.push(`drift:${f.path}`);
        } catch {
            errors.push(`missing:${f.path}`);
        }
    }
    const closure = currentIdentity();
    const apiCheck = require('./shaders-api-evidence.cjs').validateAPIEvidence(path.join(ROOT, EXAMPLE));
    errors.push(...apiCheck.errors.map((error) => 'API evidence: ' + error));
    if (JSON.stringify(report.inputs) !== JSON.stringify(closure.inputs)) errors.push('input closure');
    if (!report.reference || JSON.stringify(report.reference) !== JSON.stringify(closure.reference))
        errors.push('reference closure');
    const engines = report.requestedEngines;
    if (
        !Array.isArray(engines) ||
        new Set(engines).size !== engines.length ||
        engines.some((e) => !['chromium', 'firefox', 'webkit'].includes(e))
    )
        errors.push('engine set');
    if (!['functional', 'performance'].includes(report.phase)) errors.push('phase');
    if (
        new Set(report.engines?.map((e) => e?.engine)).size !== engines?.length ||
        report.engines?.some((e) => !e || !engines.includes(e.engine) || !e.browserVersion)
    )
        errors.push('actual engine set');
    validateBuild(report, errors);
    for (const entry of report.engines || []) {
        if (!entry || typeof entry !== 'object') {
            errors.push('engine entry object required');
            continue;
        }
        const e = entry;
        if (e.error) errors.push(`${e.engine}: engine error`);
        if (!Array.isArray(e.pageErrors) || e.pageErrors.length !== 0) errors.push(`${e.engine}: pageErrors`);
        if (!Array.isArray(e.consoleErrors) || e.consoleErrors.length !== 0) errors.push(`${e.engine}: consoleErrors`);
        if (
            !Array.isArray(e.shaderCompile) ||
            !e.shaderCompile.length ||
            e.shaderCompile.some((x) => x?.compiled !== true)
        )
            errors.push(`${e.engine}: shader compile`);
        if (e.pageClosed !== true) errors.push(`${e.engine}: page not closed`);
        if (e.browserClosed !== true) errors.push(`${e.engine}: browser not closed`);
        if (report.phase === 'performance') {
            const rows = e.performance || [];
            if (rows.length !== PERFORMANCE_PLAN.length)
                errors.push(`${e.engine}: performance rows ${rows.length} != ${PERFORMANCE_PLAN.length}`);
            const tuples = rows.map((row) => `${row?.profile?.id}:${row?.route}`);
            if (new Set(tuples).size !== PERFORMANCE_PLAN.length)
                errors.push(`${e.engine}: duplicate or missing performance tuples`);
            for (const row of rows) {
                const p = PERFORMANCE_PLAN.find((q) => q.profile.id === row?.profile?.id && q.route === row?.route);
                if (!p) {
                    errors.push('unknown profile/route tuple');
                    continue;
                }
                if (!same(row.profile, p.profile) || row.route !== p.route)
                    errors.push(`${e.engine}: profile tuple mismatch`);
                const env = require('./shaders-browser-environment.cjs').validateEnvironmentReceipt(
                    row.environmentReceipt,
                    environmentPlan(p.profile),
                );
                errors.push(...env.errors.map((x) => `${e.engine}:environment:${x}`));
                const precision = row.precision,
                    values = precision?.allRaw;
                if (
                    !Array.isArray(values) ||
                    !values.length ||
                    values.some((v) => !Number.isFinite(v) || v <= 0) ||
                    precision.calls !== 25000 ||
                    precision.crossOriginIsolated !== true ||
                    precision.positiveCount !== values.length ||
                    precision.minimumPositiveDeltaMs !== Math.min(...values)
                )
                    errors.push(`${e.engine}: raw clock calibration`);
                if (
                    row.pageClosed !== true ||
                    !row.release?.sceneCleared ||
                    row.release?.retirement?.refs?.some((r) => r.before !== 1 || r.after !== 0)
                )
                    errors.push(`${e.engine}: performance release`);
                errors.push(
                    ...performanceOracle
                        .validatePerformance(row, p.profile, p.route)
                        .errors.map((x) => `${e.engine}:${p.profile.id}:${p.route}:${x}`),
                );
            }
        } else {
            validateCaptureTuples(e, errors);
            const resource = oracle.resourceAudit(e.resources);
            errors.push(...resource.errors.map((x) => `${e.engine}:resource:${x}`));
            validateBoundaries(e, errors);
            validateInvalids(e, errors);
            validateNormal(e, errors);
            validateLifecycle(e, errors);
            validateResize(e, errors);
        }
    }
    if (report.engines?.length !== engines?.length) errors.push('missing engine');
    if (report.phase === 'performance') {
        if (!report.cleanup?.proxyClosed || !report.cleanup?.serverClosed || report.cleanup?.errors?.length)
            errors.push('owned HTTP servers not closed');
        if (!report.authorization || !report.command?.includes('--authorization=' + report.authorization))
            errors.push('exclusive performance authorization missing');
        const total = report.engines.reduce((n, e) => n + (e?.performance?.length || 0), 0);
        if (total !== engines.length * PERFORMANCE_PLAN.length)
            errors.push(`performance tuple total ${total} != ${engines.length * PERFORMANCE_PLAN.length}`);
    } else {
        if (report.cleanup?.serverClosed !== true) errors.push('owned server not closed');
        if (report.cleanup?.proxyClosed !== true) errors.push('proxy closure flag');
        if (report.cleanup?.errors?.length) errors.push('cleanup errors');
    }
    if (report.agentGate !== 'NOT_RUN') errors.push('agentGate must be NOT_RUN');
    if (report.subset !== true) errors.push('subset must be true');
    if (report.completed !== false) errors.push('completed must be false');
    if (typeof report.command !== 'string' || !report.command.includes('shaders-input-dissolve-browser.cjs'))
        errors.push('command record');
    if (report.cwd !== ROOT) errors.push('cwd record');
    const started = Date.parse(report.startedAt),
        ended = Date.parse(report.endedAt);
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) errors.push('timestamp record');
    if (report.scopePassed === true && errors.length > 0) errors.push('scopePassed contradicts recomputed errors');
    if (report.exitCode !== undefined && report.exitCode !== (errors.length ? 1 : 0))
        errors.push('exitCode contradicts recomputed verdict');
    return { ok: errors.length === 0, errors };
}
function validateFiles(report) {
    try {
        return validateFilesInner(report);
    } catch (error) {
        return { ok: false, errors: ['validator total: ' + String(error && error.message ? error.message : error)] };
    }
}
async function main(args = process.argv.slice(2)) {
    const value = (key) =>
        args
            .find((x) => x.startsWith(`--${key}=`))
            ?.split('=')
            .slice(1)
            .join('=');
    if (value('verify')) {
        const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, value('verify')), 'utf8'));
        const result = validateFiles(report);
        console.log(JSON.stringify(result, null, 2));
        return result.ok ? 0 : 1;
    }
    const out = value('out');
    const phase = value('phase') ?? 'functional';
    const engineArg = value('browser') ?? 'all';
    const authorization = value('authorization');
    if (!out || !out.includes('worker-') === false) {
        if (!out) {
            console.error('--out=<new.json> is required (Lead wx path)');
            return 1;
        }
    }
    if (phase === 'performance' && !authorization) {
        console.error('performance requires --authorization=<exclusive window id>');
        return 1;
    }
    if (fs.existsSync(path.resolve(ROOT, out))) throw new Error('Output already exists: ' + out);
    const startedAt = new Date().toISOString();
    const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
    const engineList = Object.keys(require('./browser-engines.cjs').ENGINES);
    const engines = engineArg === 'all' ? engineList : engineArg.split(',').map((x) => x.trim());
    if (
        !['functional', 'performance'].includes(phase) ||
        engines.some((e) => !engineList.includes(e)) ||
        new Set(engines).size !== engines.length
    )
        throw new Error('Invalid phase/engine set');
    // Real strict-TS + bundle build records (same contract as the other shader collectors).
    const build = require('child_process').spawnSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-input-dissolve.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8' },
    );
    const artifacts = out.replace(/\.json$/, '-artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const buildLog = path.join(artifacts, 'build.log');
    fs.writeFileSync(
        buildLog,
        `command=node node_modules/typescript/bin/tsc -p tools/verify/shaders-input-dissolve.tsconfig.json\nexitCode=${build.status}\n${build.stdout}${build.stderr}`,
        { flag: 'wx' },
    );
    const report = {
        schemaVersion: 'w4-c04-input-dissolve/1',
        phase,
        authorization,
        requestedEngines: [...engines],
        startedAt,
        endedAt: '',
        command: `node tools/verify/shaders-input-dissolve-browser.cjs --phase=${phase} --browser=${engineArg} --out=${out}${authorization ? ` --authorization=${authorization}` : ''}`,
        cwd: ROOT,
        identity: null,
        inputs: null,
        reference: null,
        build: {
            command: 'node node_modules/typescript/bin/tsc -p tools/verify/shaders-input-dissolve.tsconfig.json',
            exitCode: build.status,
            raw: null,
            bundleBytes: 0,
        },
        engines: [],
        cleanup: { proxyClosed: false, serverClosed: false, errors: [] },
        agentGate: 'NOT_RUN',
        subset: true,
        completed: false,
    };
    const identitySnapshot = currentIdentity();
    report.identity = identitySnapshot;
    report.inputs = identitySnapshot.inputs;
    report.reference = identitySnapshot.reference;
    report.build.raw = fileIdentity(path.relative(ROOT, buildLog));
    if (build.status !== 0) throw new Error('Strict TS failed');
    const esbuild = require('esbuild');
    const bundled = esbuild.buildSync({
        entryPoints: [path.join(ROOT, EXAMPLE, 'src/main.ts')],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        external: ['cocosair'],
        write: false,
    });
    report.build.bundleBytes = bundled.outputFiles[0].contents.length;
    const { startExampleServer } = require('./competitive-example-server.cjs');
    const server = await startExampleServer(ROOT);
    let isolationProxy = null;
    // REAL cross-origin isolation for the performance phase (production helpers).
    try {
        if (phase === 'performance') {
            const { startIsolationProxy } = require('./shaders-browser-environment.cjs');
            isolationProxy = await startIsolationProxy(server);
        }
        const origin = isolationProxy ? isolationProxy.origin : server.origin;

        async function installProbe(page) {
            await page.addInitScript(() => {
                window.__inputdissolveCompile = [];
                const proto = WebGL2RenderingContext.prototype;
                const compile = proto.compileShader;
                proto.compileShader = function (shader) {
                    compile.call(this, shader);
                    window.__inputdissolveCompile.push({
                        compiled: this.getShaderParameter(shader, this.COMPILE_STATUS),
                        log: this.getShaderInfoLog(shader) || '',
                        source: this.getShaderSource(shader),
                    });
                };
            });
        }

        async function withPage(browser, engine, entry, fn) {
            const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
            const e = {
                engine,
                browserVersion: browser.version(),
                pageErrors: [],
                consoleErrors: [],
                shaderCompile: [],
            };
            page.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
            page.on('console', (x) => {
                if (x.type() === 'error') e.consoleErrors.push(x.text());
            });
            await installProbe(page);
            try {
                await page.goto(`${origin}/${EXAMPLE}/${entry}`);
                await page.waitForFunction(() => window.__inputdissolve?.ready, null, { timeout: 60000 });
                await fn(e, page);
            } finally {
                try {
                    e.shaderCompile.push(...(await page.evaluate(() => window.__inputdissolveCompile || [])));
                } catch {
                    /* page may be closed */
                }
                if (!page.isClosed()) await page.close();
                e.pageClosed = page.isClosed();
            }
            return e;
        }

        for (const engine of engines) {
            const browser = await require('playwright')[engine].launch(shaderLaunchOptions(engine));
            try {
                if (phase === 'functional') {
                    const e = await withPage(browser, engine, '?test=1', async (e, page) => {
                        // Visual matrix: frozen CAPTURES × DPR1 then DPR2 subset on a fresh page.
                        for (const dpr of [1, 2]) {
                            let capturePage = page;
                            if (dpr === 2) {
                                capturePage = await browser.newPage({
                                    viewport: { width: 640, height: 400 },
                                    deviceScaleFactor: 2,
                                });
                                capturePage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                                capturePage.on('console', (x) => {
                                    if (x.type() === 'error') e.consoleErrors.push(x.text());
                                });
                                await installProbe(capturePage);
                                await capturePage.goto(`${origin}/${EXAMPLE}/?test=1`);
                                await capturePage.waitForFunction(() => window.__inputdissolve?.ready, null, {
                                    timeout: 60000,
                                });
                            }
                            e.captures = e.captures || [];
                            for (const [id, patch] of CAPTURES) {
                                if (dpr === 2 && !DPR2.includes(id)) continue;
                                const params = { ...oracle.defaults(), ...patch };
                                const presentation = { background: BACKGROUND(id) };
                                await capturePage.evaluate(
                                    (p) => window.__inputdissolve.setPresentation(p),
                                    presentation,
                                );
                                const setBefore = await capturePage.evaluate(() => window.__inputdissolve.snapshot());
                                const setReceipt = await capturePage.evaluate(
                                    (p) => window.__inputdissolve.set(p),
                                    params,
                                );
                                await capturePage.evaluate((t) => window.__inputdissolve.setTime(t), CAPTURE_TIME);
                                const snapshot = await capturePage.evaluate(() => window.__inputdissolve.step(0));
                                await capturePage.waitForTimeout(30);
                                const png = path.join(artifacts, `${engine}-${id}-dpr${dpr}.png`);
                                await capturePage.screenshot({ path: png });
                                const probe = await capturePage.evaluate(() => window.__inputdissolve.linearProbe());
                                e.captures.push({
                                    id,
                                    dpr,
                                    params,
                                    time: CAPTURE_TIME,
                                    presentation,
                                    snapshot,
                                    set: { before: setBefore, receipt: setReceipt, after: snapshot },
                                    png: fileIdentity(path.relative(ROOT, png)),
                                    probe,
                                    audit: oracle.pngAudit(png, { ...params, __time: CAPTURE_TIME }, presentation),
                                    probeCheck: oracle.probeAudit(
                                        { ...probe, time: CAPTURE_TIME },
                                        { ...params, __time: CAPTURE_TIME },
                                        { width: 640 * dpr, height: 400 * dpr },
                                    ),
                                });
                            }
                            if (dpr === 2)
                                e.dpr2PageClosed =
                                    capturePage.isClosed() ||
                                    (await capturePage.close().then(
                                        () => true,
                                        () => false,
                                    ));
                        }
                        // Boundaries: frozen plan (valid + invalid).
                        e.boundaries = [];
                        for (const row of oracle.boundaryPlan()) {
                            const before = await page.evaluate(() => window.__inputdissolve.snapshot());
                            const input =
                                row.boundary === 'invalid'
                                    ? { ...oracle.defaults(), [row.parameter]: row.value }
                                    : { ...oracle.defaults(), [row.parameter]: row.value };
                            const receipt = await page.evaluate((p) => window.__inputdissolve.set(p), input);
                            const after = await page.evaluate(() => window.__inputdissolve.snapshot());
                            e.boundaries.push({ ...row, before, after, receipt });
                        }
                        // Invalid cases (typed-wrong inputs).
                        e.invalids = [];
                        for (const frozen of INVALID_CASES) {
                            const base = await page.evaluate(() => window.__inputdissolve.snapshot().params);
                            const badValue =
                                frozen.kind === 'null'
                                    ? null
                                    : frozen.kind === 'nan'
                                      ? NaN
                                      : frozen.kind === 'infinity'
                                        ? Infinity
                                        : frozen.kind === 'range'
                                          ? 5
                                          : 'wrong';
                            const mutated = badValue === null ? null : { ...base, [frozen.parameter]: badValue };

                            const before = await page.evaluate(() => window.__inputdissolve.snapshot());
                            const receipt = await page.evaluate((p) => window.__inputdissolve.set(p), mutated);
                            const after = await page.evaluate(() => window.__inputdissolve.snapshot());
                            e.invalids.push({
                                case: { kind: frozen.kind, parameter: frozen.parameter },
                                receipt,
                                before,
                                after,
                            });
                        }
                        // Trusted native controls on a SEPARATE NON-TEST page (test=1 hides the
                        // aside, so real button clicks need a normal page).
                        const normalPage = await browser.newPage({
                            viewport: { width: 640, height: 400 },
                            deviceScaleFactor: 1,
                        });
                        normalPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        normalPage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        await installProbe(normalPage);
                        await normalPage.goto(`${origin}/${EXAMPLE}/`);
                        await normalPage.waitForFunction(() => window.__inputdissolve?.ready, null, { timeout: 60000 });
                        await normalPage.waitForTimeout(250);
                        const parameterBefore = await normalPage.evaluate(() => window.__inputdissolve.snapshot());
                        await normalPage.locator('[data-parameter=progress]').focus();
                        await normalPage.keyboard.press('ArrowRight');
                        await normalPage.keyboard.press('ArrowUp');
                        const parameterAfter = await normalPage.evaluate(() => window.__inputdissolve.snapshot());
                        await normalPage.locator('#pause').click();
                        const pauseBefore = await normalPage.evaluate(() => window.__inputdissolve.snapshot());
                        await normalPage.evaluate(() => window.__inputdissolve.step(1 / 60));
                        const pauseAfter = await normalPage.evaluate(() => window.__inputdissolve.snapshot());
                        await normalPage.locator('#resume').click();
                        const resumeBefore = await normalPage.evaluate(() => window.__inputdissolve.snapshot());
                        await normalPage.evaluate(() => window.__inputdissolve.step(1 / 60));
                        const resumeAfter = await normalPage.evaluate(() => window.__inputdissolve.snapshot());
                        // Native-reset capture: a one-shot bubble listener freezes the post-reset
                        // snapshot (time===0) at the trusted click, before the native pacer advances.
                        const {
                            INSTALL_RESET_CAPTURE,
                            READ_RESET_CAPTURE,
                        } = require('./shaders-native-reset-capture.cjs');
                        const resetInstall = await normalPage.evaluate(INSTALL_RESET_CAPTURE, '__inputdissolve');
                        if (!resetInstall?.ok) throw Error('reset capture install failed: ' + resetInstall?.error);
                        await normalPage.locator('#reset').click();
                        const resetCapture = await normalPage.evaluate(READ_RESET_CAPTURE);
                        if (!resetCapture?.snapshot) throw Error('reset capture missing after click');
                        const reset = resetCapture.snapshot;
                        await normalPage.locator('#release').click();
                        const nativeRelease = await normalPage.evaluate(() => window.__inputdissolve.release());
                        const eventsAfterRelease = await normalPage.evaluate(
                            () => window.__inputdissolve.snapshot().events,
                        );
                        e.normal = {
                            parameter: { before: parameterBefore, after: parameterAfter },
                            pause: { before: pauseBefore, after: pauseAfter },
                            resume: { before: resumeBefore, after: resumeAfter },
                            reset,
                            events: eventsAfterRelease,
                            release: nativeRelease,
                        };
                        await normalPage.close();
                        // Lifecycle on a FRESH page: recreate, then terminal release.
                        const lifecyclePage = await browser.newPage({
                            viewport: { width: 640, height: 400 },
                            deviceScaleFactor: 1,
                        });
                        lifecyclePage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        lifecyclePage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        await installProbe(lifecyclePage);
                        await lifecyclePage.goto(`${origin}/${EXAMPLE}/?test=1`);
                        await lifecyclePage.waitForFunction(() => window.__inputdissolve?.ready, null, {
                            timeout: 60000,
                        });
                        const recreated = await lifecyclePage.evaluate(() => window.__inputdissolve.recreate());
                        const terminal = await lifecyclePage.evaluate(async () => {
                            const x = window.__inputdissolve.release(),
                                y = window.__inputdissolve.release();
                            return { first: await x, samePromise: x === y };
                        });
                        const terminalCode = await lifecyclePage
                            .evaluate(() =>
                                window.__inputdissolve.step(0).then(
                                    () => null,
                                    (error) => error?.code ?? String(error),
                                ),
                            )
                            .catch((error) => error?.code ?? String(error));
                        e.lifecycle = {
                            recreated,
                            samePromise: terminal.samePromise,
                            terminalCode,
                            release: {
                                sceneCleared: terminal.first?.sceneCleared,
                                listenerAdds: terminal.first?.listenerAdds,
                                listenerRemoves: terminal.first?.listenerRemoves,
                            },
                        };
                        await lifecyclePage.close();
                        // Resize page (fresh, defaults, image route): live viewport change + settle.
                        e.resizes = [];
                        for (const resizeRoute of ['image', 'procedural', 'rendered']) {
                            const resizePage = await browser.newPage({
                                viewport: { width: 640, height: 400 },
                                deviceScaleFactor: 1,
                            });
                            resizePage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                            resizePage.on('console', (x) => {
                                if (x.type() === 'error') e.consoleErrors.push(x.text());
                            });
                            await installProbe(resizePage);
                            await resizePage.goto(`${origin}/${EXAMPLE}/?test=1`);
                            await resizePage.waitForFunction(() => window.__inputdissolve?.ready, null, {
                                timeout: 60000,
                            });
                            await resizePage.evaluate((p) => window.__inputdissolve.setPresentation(p), {
                                background: BACKGROUND('default'),
                            });
                            await resizePage.evaluate((p) => window.__inputdissolve.set(p), {
                                ...oracle.defaults(),
                                route: resizeRoute,
                            });
                            const before = await resizePage.evaluate(() => window.__inputdissolve.snapshot());
                            await resizePage.setViewportSize({ width: 480, height: 320 });
                            await resizePage.waitForTimeout(250);
                            const resizeFrames = await resizePage.evaluate(async () => {
                                const rows = [];
                                for (let i = 0; i < 5; i++) rows.push(await window.__inputdissolve.step(0));
                                return rows;
                            });
                            const after = resizeFrames[resizeFrames.length - 1];
                            await resizePage.waitForTimeout(80);
                            const resizePng = path.join(artifacts, engine + '-' + resizeRoute + '-live-resize.png');
                            await resizePage.screenshot({ path: resizePng });
                            const resizeProbe = await resizePage.evaluate(() => window.__inputdissolve.linearProbe());
                            const resizeEntry = {
                                route: resizeRoute,
                                before,
                                after,
                                resizeFrames,
                                png: fileIdentity(path.relative(ROOT, resizePng)),
                                probe: resizeProbe,
                                presentationWaitMs: 80,
                            };
                            e.resizes.push(resizeEntry);
                            if (resizeRoute === 'image') e.resize = resizeEntry;
                            await resizePage.close();
                        }
                        // Resources: 100 create/retire cycles on a FRESH page.
                        const cyclesPage = await browser.newPage({
                            viewport: { width: 640, height: 400 },
                            deviceScaleFactor: 1,
                        });
                        cyclesPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        cyclesPage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        await installProbe(cyclesPage);
                        await cyclesPage.goto(`${origin}/${EXAMPLE}/?test=1`);
                        await cyclesPage.waitForFunction(() => window.__inputdissolve?.ready, null, { timeout: 60000 });
                        e.resources = await cyclesPage.evaluate(async () => window.__inputdissolve.cycles());
                        await cyclesPage.close();
                    });
                    report.engines.push(e);
                } else {
                    // Performance: 27 serial windows (3 profiles x 3 routes) per engine.
                    const e = {
                        engine,
                        browserVersion: browser.version(),
                        pageErrors: [],
                        consoleErrors: [],
                        shaderCompile: [],
                        performance: [],
                    };
                    for (const tuple of PERFORMANCE_PLAN) {
                        const perfPage = await browser.newPage({
                            viewport: { ...tuple.profile.viewport },
                            deviceScaleFactor: tuple.profile.dpr,
                        });
                        perfPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        perfPage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        await installProbe(perfPage);
                        const perfEntry = { profile: tuple.profile, route: tuple.route };
                        let timingStarted = false,
                            timingStopped = false;
                        try {
                            const { navigateWithDPRRepair } = require('./shaders-browser-environment.cjs');
                            const envReceipt = await navigateWithDPRRepair(
                                perfPage,
                                `${origin}/${EXAMPLE}/?_isolate=1`,
                                environmentPlan(tuple.profile),
                            );
                            if (!envReceipt.ok)
                                throw new Error('C04 environment: ' + JSON.stringify(envReceipt.errors));
                            await perfPage.waitForFunction(() => window.__inputdissolve?.ready, null, {
                                timeout: 60000,
                            });
                            await perfPage.waitForTimeout(250);
                            await perfPage.evaluate(
                                (r) =>
                                    window.__inputdissolve.set({
                                        ...window.__inputdissolve.snapshot().params,
                                        route: r,
                                    }),
                                tuple.route,
                            );
                            await perfPage.evaluate(() => window.__inputdissolve.step(0));
                            await perfPage.waitForTimeout(120);
                            const precision = await perfPage.evaluate(() => {
                                const raw = [];
                                let last = performance.now();
                                for (let i = 0; i < 25000; i++) {
                                    const now = performance.now();
                                    if (now !== last) raw.push(now - last);
                                    last = now;
                                }
                                const positives = raw.filter((x) => x > 0);
                                return {
                                    calls: 25000,
                                    crossOriginIsolated: !!window.crossOriginIsolated,
                                    positiveCount: positives.length,
                                    minimumPositiveDeltaMs: positives.length ? Math.min(...positives) : null,
                                    allRaw: raw,
                                };
                            });
                            await perfPage.evaluate(() => window.__inputdissolve.startPerformance());
                            timingStarted = true;
                            await perfPage.waitForTimeout(6000);
                            const metrics = await perfPage.evaluate(() => window.__inputdissolve.stopPerformance());
                            timingStopped = true;
                            Object.assign(perfEntry, metrics, { precision, environmentReceipt: envReceipt });
                        } catch (error) {
                            perfEntry.error = String(error.stack || error);
                            e.error = perfEntry.error;
                        } finally {
                            try {
                                if (timingStarted && !timingStopped)
                                    perfEntry.failureStop = await perfPage.evaluate(() =>
                                        window.__inputdissolve.stopPerformance(),
                                    );
                            } catch (error) {
                                e.pageErrors.push('failure stop: ' + String(error.stack || error));
                            }
                            try {
                                if (await perfPage.evaluate(() => !!window.__inputdissolve?.ready))
                                    perfEntry.release = await perfPage.evaluate(() => window.__inputdissolve.release());
                            } catch {}
                            try {
                                e.shaderCompile.push(
                                    ...(await perfPage.evaluate(() => window.__inputdissolveCompile || [])),
                                );
                            } catch (error) {
                                e.pageErrors.push(String(error));
                            }
                            await perfPage.close();
                            perfEntry.pageClosed = perfPage.isClosed();
                        }
                        e.performance.push(perfEntry);
                    }
                    report.engines.push(e);
                }
            } finally {
                await browser.close();
                const entry = report.engines.find((e) => e.engine === engine);
                if (entry) {
                    entry.browserClosed = !browser.isConnected();
                    if (phase === 'performance')
                        entry.pageClosed = entry.performance.every((r) => r.pageClosed === true);
                }
            }
        }
    } catch (error) {
        report.cleanup.errors.push(String(error.stack || error));
    } finally {
        if (isolationProxy) {
            try {
                await isolationProxy.close();
                report.cleanup.proxyClosed = isolationProxy.closed;
            } catch (error) {
                report.cleanup.errors.push('proxy close: ' + error);
            }
        } else report.cleanup.proxyClosed = true;
        try {
            await server.close();
            report.cleanup.serverClosed = true;
        } catch (error) {
            report.cleanup.errors.push('server close: ' + error);
        }
    }
    report.endedAt = new Date().toISOString();
    const result = validateFiles(report);
    report.validation = result;
    report.scopePassed = result.ok;
    report.exitCode = result.ok ? 0 : 1;
    fs.writeFileSync(path.resolve(ROOT, out), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ ok: result.ok, errors: result.errors.slice(0, 10), out }, null, 2));
    return result.ok ? 0 : 1;
}
module.exports = {
    main,
    expectedImageReceipt,
    environmentPlan,
    INPUTS,
    SDK,
    REFERENCE,
    CAPTURES,
    DPR2,
    VISUAL_PLAN,
    INVALID_CASES,
    PERFORMANCE_PLAN,
    currentIdentity,
    routePasses,
    validateFiles,
    validateCaptureTuples,
    validateBoundaries,
    validateInvalids,
    validateNormal,
    validateLifecycle,
    validateResize,
    validateBuild,
    CAPTURE_TIME,
    BACKGROUND,
};
if (require.main === module)
    main()
        .then((code) => (process.exitCode = code))
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
