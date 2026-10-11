'use strict';
/** E07 Liquid Metal native collector; no SDK build, installed dependencies, extra canvas or standalone GL rendering. */
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    cp = require('node:child_process');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const { startIsolationProxy, navigateWithDPRRepair } = require('./shaders-browser-environment.cjs');
const contract = require('./shaders-effect-contract.cjs'),
    oracle = require('./shaders-liquid-metal-oracle.cjs'),
    performanceOracle = require('./shaders-liquid-metal-performance.cjs');
const ROOT = path.resolve(__dirname, '../..'),
    EXAMPLE = 'examples/shader-liquid-metal';
const INPUTS = [
    `${EXAMPLE}/src/main.ts`,
    `${EXAMPLE}/src/parameters.ts`,
    `${EXAMPLE}/src/liquid.frag`,
    `${EXAMPLE}/src/effect.generated.ts`,
    `${EXAMPLE}/parameters.json`,
    `${EXAMPLE}/index.html`,
    `${EXAMPLE}/generate-effect.cjs`,
    `${EXAMPLE}/example.json`,
    `${EXAMPLE}/README.md`,
    `${EXAMPLE}/UPSTREAM.md`,
    `${EXAMPLE}/LICENSE.reference.txt`,
    'examples/shared/shader-blocks.js',
    'tools/verify/shaders-liquid-metal-oracle.cjs',
    'tools/verify/shaders-liquid-metal-browser.cjs',
    'tools/verify/shaders-native-reset-capture.cjs',
    'tools/verify/shaders-liquid-metal.tsconfig.json',
    'tools/verify/shaders-liquid-metal-performance.cjs',
    'tools/verify/shaders-browser-environment.cjs',
    'tools/verify/shaders-browser-launch.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'tools/verify/shaders-effect-contract.cjs',
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
        'packages/core/src/shaders/LiquidMetal/index.ts',
        'packages/core/src/std/paint/materials.ts',
        'packages/core/src/gpu/kit/noise.ts',
        'packages/core/src/gpu/kit/lighting.ts',
        // Shared parts verified at E03 (Lead-fetched pinned originals + receipts).
        'output/shaders-absorption/lead-w2-e03-upstream-materialParts.ts',
        'output/shaders-absorption/lead-w2-e03-upstream-materialParts-fetch.json',
        // E07: bevel.ts fetched from the pinned commit by the worker (receipt alongside).
        'output/shaders-absorption/worker-w3-e07-upstream-bevel.ts',
        'output/shaders-absorption/worker-w3-e07-upstream-bevel-fetch.json',
    ].map((f) => (f.startsWith('output/') ? f : 'output/shaders-absorption/reference/' + f)),
};
const CAPTURES = [
    ['default', {}],
    ['box', { shape: 'rounded-box' }],
    ['turbulence-zero', { turbulence: 0 }],
    ['warp-zero', { warp: 0 }],
    ['quality-low', { quality: 'low' }],
    ['dispersion-zero', { dispersion: 0 }],
    ['env-rotation-90', { envRotation: 90 }],
    ['machined-bevel', { bevelShape: 1 }],
    ['wide-bevel', { bevelWidth: 0.2 }],
    ['seed-2', { seed: 2 }],
    ['background-light', {}],
];
const DPR2 = ['default', 'box'];
const CAPTURE_TIME = 0.25;
const BACKGROUND = (id) => (id === 'background-light' ? [180, 160, 140] : [8, 9, 12]);
const VISUAL_PLAN = [...CAPTURES.map(([id]) => ({ id, dpr: 1 })), ...DPR2.map((id) => ({ id, dpr: 2 }))].map(
    (entry) => {
        const [, patch] = CAPTURES.find(([id]) => id === entry.id);
        return { ...entry, patch };
    },
);
const INVALID_CASES = [
    { kind: 'null', parameter: '$', code: 'LIQUID_PARAMETERS' },
    { kind: 'unknown', parameter: 'unknown', code: 'LIQUID_UNKNOWN_PARAMETER' },
    { kind: 'nan', parameter: 'turbulence', code: 'LIQUID_PARAMETER_TYPE' },
    { kind: 'infinity', parameter: 'turbulence', code: 'LIQUID_PARAMETER_TYPE' },
    { kind: 'shape', parameter: 'shape', code: 'LIQUID_PARAMETER_ENUM' },
    { kind: 'seed', parameter: 'seed', code: 'LIQUID_PARAMETER_RANGE' },
];
/** Frozen performance plan: 3 profiles × 2 quality tiers = 6 windows per engine, 18 total. */
const PERFORMANCE_PLAN = [
    { profile: { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 }, quality: 'high' },
    { profile: { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 }, quality: 'low' },
    { profile: { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 }, quality: 'high' },
    { profile: { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 }, quality: 'low' },
    { profile: { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 }, quality: 'high' },
    { profile: { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 }, quality: 'low' },
];
const profiles = [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
];
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
        reference: { ...REFERENCE, files: REFERENCE.files.map(fileIdentity) },
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
    } catch (error) {
        errors.push('build log unreadable');
    }
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
        if (c.id !== plan.id || c.dpr !== plan.dpr)
            errors.push(`${label}: tuple ${c.id}@${c.dpr} != frozen ${plan.id}@${plan.dpr}`);
        const expectedParams = { ...oracle.defaults(), ...plan.patch };
        if (!same(c.params, expectedParams)) errors.push(`${label}: params not frozen defaults+patch`);
        if (Object.values(c.params ?? {}).some((v) => typeof v === 'number' && !Number.isFinite(v)))
            errors.push(`${label}: non-finite param`);
        if (c.time !== CAPTURE_TIME) errors.push(`${label}: time ${c.time} != frozen ${CAPTURE_TIME}`);
        if (!same(c.presentation, { background: BACKGROUND(plan.id), linearDiagnostic: false }))
            errors.push(`${label}: presentation not frozen`);
        const snap = c.snapshot;
        if (!snap || typeof snap !== 'object') errors.push(`${label}: snapshot required`);
        else {
            if (!same(snap.params, expectedParams)) errors.push(`${label}: snapshot params`);
            if (snap.time !== CAPTURE_TIME) errors.push(`${label}: snapshot time`);
            if (!same(snap.viewport, { width: 640, height: 400 })) errors.push(`${label}: snapshot viewport`);
            if (snap.canvas?.width !== 640 * plan.dpr || snap.canvas?.height !== 400 * plan.dpr)
                errors.push(`${label}: snapshot backing ${snap.canvas?.width}x${snap.canvas?.height}`);
            if (snap.dpr !== plan.dpr) errors.push(`${label}: snapshot dpr`);
        }
        checkPng(c, label, errors, { width: 640 * plan.dpr, height: 400 * plan.dpr });
        try {
            const checked = oracle.pngAudit(path.resolve(ROOT, c.png.path), c.params, c.time, c.presentation);
            if (checked.errors.length) errors.push({ capture: c.id, dpr: c.dpr, errors: checked.errors.slice(0, 3) });
        } catch (error) {
            errors.push(`${label}: pngAudit ${String(error.message || error).split('\n')[0]}`);
        }
        try {
            const probe = oracle.probeAudit(c.probe, c.params, c.time, {
                width: 640 * plan.dpr,
                height: 400 * plan.dpr,
            });
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
    }
    // Per-set rebuild contract, judged from the actual shape change; probe retire/recreate stays
    // separate (it happens after these observations).
    let previousParams = oracle.defaults();
    for (const [index, plan] of VISUAL_PLAN.entries()) {
        const c = captures[index],
            label = `${e.engine}:capture[${index}] set`;
        if (plan.dpr === 2 && VISUAL_PLAN[index - 1] && VISUAL_PLAN[index - 1].dpr === 1)
            previousParams = oracle.defaults(); // fresh DPR2 page restarts from loaded defaults
        const set = c?.set;
        if (!set?.before || !set?.receipt || !c?.snapshot) {
            errors.push(`${label}: observation missing`);
            continue;
        }
        if (!same(set.before.params, previousParams)) errors.push(`${label}: before params chain`);
        const shapeChanged = c.params.shape !== set.before.params.shape;
        if (shapeChanged) {
            if (!set.receipt.retirement) errors.push(`${label}: shape switch without rebuild receipt`);
            if (set.receipt.retirement?.refs?.length !== 3) errors.push(`${label}: rebuild retirement refs`);
            if (c.snapshot.instance === set.before.instance) errors.push(`${label}: shape switch did not rebuild`);
        } else {
            if (set.receipt.retirement !== null) errors.push(`${label}: uniform update rebuilt (retirement)`);
            if (c.snapshot.instance !== set.before.instance) errors.push(`${label}: uniform update rebuilt (instance)`);
        }
        previousParams = c.params;
    }
    if (e.dpr2PageClosed !== true) errors.push(`${e.engine}: dpr2 page not closed`);
}
function validateTemporal(e, errors) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
        errors.push('temporal engine object required');
        return;
    }
    const t = e.temporal;
    if (!t || typeof t !== 'object') {
        errors.push(e.engine + ': temporal observation required');
        return;
    }
    if (!same(t.params, oracle.defaults())) errors.push(e.engine + ': temporal params not defaults');
    const a = t.a,
        b = t.b;
    if (!a?.snapshot || !b?.snapshot || a.time !== CAPTURE_TIME || b.time !== 0.27) {
        errors.push(e.engine + ': temporal times not frozen plan');
        return;
    }
    const planned = oracle.auditPoints(640, 400);
    /** Structural pixel-scope gate: exact frozen point set, valid byte channels — this runs
     * BEFORE any arithmetic so NaN/Inf or wrong coordinates can never slip through a comparison. */
    const pixelScope = (snap, label) => {
        if (!snap || typeof snap !== 'object') {
            errors.push(e.engine + ': temporal ' + label + ' snapshot required');
            return null;
        }
        const pixels = snap.pixels;
        if (!Array.isArray(pixels) || pixels.length !== planned.length) {
            errors.push(e.engine + ': temporal ' + label + ' pixel count ' + pixels?.length + ' != ' + planned.length);
            return null;
        }
        for (const [i, point] of planned.entries()) {
            const row = pixels[i];
            if (!row || row.x !== point.x || row.y !== point.y) {
                errors.push(e.engine + ': temporal ' + label + ' point ' + i + ' not frozen plan');
                return null;
            }
            if (!oracle.byteChannels(row.rgba)) {
                errors.push(
                    e.engine + ': temporal ' + label + ' malformed byte channels at ' + point.x + ',' + point.y,
                );
                return null;
            }
        }
        return pixels;
    };
    const bindSnapshot = (snap, label, expected) => {
        if (!snap || typeof snap !== 'object') {
            errors.push(e.engine + ': temporal ' + label + ' snapshot required');
            return;
        }
        if (!same(snap.params, expected.params)) errors.push(e.engine + ': temporal ' + label + ' params binding');
        if (snap.time !== expected.time) errors.push(e.engine + ': temporal ' + label + ' time binding');
        if (!same(snap.viewport, { width: 640, height: 400 }))
            errors.push(e.engine + ': temporal ' + label + ' viewport');
        if (snap.dpr !== 1) errors.push(e.engine + ': temporal ' + label + ' dpr');
        if (snap.seed !== expected.params.seed) errors.push(e.engine + ': temporal ' + label + ' seed binding');
        if (!same(snap.background, BACKGROUND('default')))
            errors.push(e.engine + ': temporal ' + label + ' background');
        if (
            !Number.isSafeInteger(snap.frame) ||
            snap.frame < 0 ||
            !snap.gpuReceipt ||
            !Number.isSafeInteger(snap.gpuReceipt.frame) ||
            snap.gpuReceipt.frame < 0 ||
            // Director emits AFTER_DRAW, then advances totalFrames before step() resolves.
            snap.gpuReceipt.frame + 1 !== snap.frame ||
            snap.gpuReceipt.time !== snap.time
        )
            errors.push(e.engine + ': temporal ' + label + ' receipt frame/time binding');
        if (Array.isArray(snap.pixels)) {
            for (const [i, point] of planned.entries()) {
                const actual = snap.pixels[i];
                if (!actual || !oracle.byteChannels(actual.rgba)) continue;
                const expectedPixel = oracle.model(point.x, point.y, 640, 400, expected.params, expected.time).display;
                if (actual.rgba.some((value, c) => Math.abs(value - expectedPixel[c]) > oracle.BYTE_TOLERANCE))
                    errors.push(
                        e.engine + ': temporal ' + label + ' oracle pixel mismatch at ' + point.x + ',' + point.y,
                    );
            }
        }
    };
    bindSnapshot(a.snapshot, 'a', { params: t.params, time: CAPTURE_TIME });
    bindSnapshot(b.snapshot, 'b', { params: t.params, time: 0.27 });
    const gpuA = pixelScope(a.snapshot, 'a'),
        gpuB = pixelScope(b.snapshot, 'b');
    for (const [label, entry] of [
        ['a', a],
        ['b', b],
    ]) {
        try {
            const probe = oracle.probeAudit(entry.probe, t.params, entry.time, { width: 640, height: 400 });
            errors.push(
                ...probe.errors.map((x) => ({ engine: e.engine, stage: 'temporal-' + label + '-probe', error: x })),
            );
        } catch (error) {
            errors.push(e.engine + ': temporal ' + label + ' probe ' + String(error.message || error).split('\n')[0]);
        }
        checkPng({ png: entry.png }, e.engine + ':temporal-' + label, errors, { width: 640, height: 400 });
        try {
            const audited = oracle.pngAudit(path.resolve(ROOT, entry.png.path), t.params, entry.time);
            if (audited.errors.length)
                errors.push({
                    engine: e.engine,
                    stage: 'temporal-' + label + '-png',
                    errors: audited.errors.slice(0, 3),
                });
        } catch (error) {
            errors.push(
                e.engine + ': temporal ' + label + ' png audit ' + String(error.message || error).split('\n')[0],
            );
        }
    }
    // Determinism: the recreate must be a DIFFERENT instance under the SAME frozen state, and the
    // raw pixels must match a byte-for-byte — the equal flag alone proves nothing.
    const det = t.determinism;
    const detPixels = pixelScope(det?.snapshot, 'det');
    if (det?.snapshot) {
        bindSnapshot(det.snapshot, 'det', { params: t.params, time: CAPTURE_TIME });
        if (
            det.snapshot.instance === undefined ||
            a.snapshot.instance === undefined ||
            det.snapshot.instance === a.snapshot.instance
        )
            errors.push(e.engine + ': temporal determinism instance not rebuilt');
        if (gpuA && detPixels) {
            let identical = true;
            for (const [i, point] of planned.entries()) {
                for (let c = 0; c < 4; c++)
                    if (detPixels[i].rgba[c] !== gpuA[i].rgba[c]) {
                        errors.push(
                            e.engine + ': temporal determinism byte mismatch at ' + point.x + ',' + point.y + '/' + c,
                        );
                        identical = false;
                        break;
                    }
            }
            // The self-reported flag must agree with the recomputed verdict, not replace it.
            if (det.equal !== identical) errors.push(e.engine + ': temporal determinism flag contradicts raw data');
        }
    } else errors.push(e.engine + ': temporal determinism snapshot required');
    // Speed-0 freeze: params.speed must be 0, both frozen absolute times correct, and the raw
    // pixels identical across the two times (independently of any self-reported flag).
    const sz = t.speedZero;
    const szA = pixelScope(sz?.a, 'speedZeroA'),
        szB = pixelScope(sz?.b, 'speedZeroB');
    if (sz) {
        const zeroParams = { ...oracle.defaults(), speed: 0 };
        if (!same(sz.params, zeroParams)) errors.push(e.engine + ': temporal speedZero frozen params');
        bindSnapshot(sz.a, 'speedZeroA', { params: zeroParams, time: CAPTURE_TIME });
        bindSnapshot(sz.b, 'speedZeroB', { params: zeroParams, time: 5.5 });
        if (sz.a?.time !== CAPTURE_TIME || sz.b?.time !== 5.5)
            errors.push(e.engine + ': temporal speedZero times not frozen plan');
        if (gpuA && szA) {
            // The oracle's own speed-0 model must be time-invariant at these points too.
            for (const [i, point] of planned.entries()) {
                const cpuA = oracle.model(point.x, point.y, 640, 400, sz.params, sz.a.time).display;
                const cpuB = oracle.model(point.x, point.y, 640, 400, sz.params, sz.b.time).display;
                for (let c = 0; c < 3; c++)
                    if (cpuA[c] !== cpuB[c]) {
                        errors.push(
                            e.engine + ': temporal speedZero oracle not time-invariant at ' + point.x + ',' + point.y,
                        );
                        break;
                    }
            }
        }
        if (szA && szB) {
            let identical = true;
            for (const [i, point] of planned.entries()) {
                for (let c = 0; c < 4; c++)
                    if (szA[i].rgba[c] !== szB[i].rgba[c]) {
                        errors.push(
                            e.engine + ': temporal speedZero byte mismatch at ' + point.x + ',' + point.y + '/' + c,
                        );
                        identical = false;
                        break;
                    }
            }
            if (sz.equal !== identical) errors.push(e.engine + ': temporal speedZero flag contradicts raw data');
        }
    } else errors.push(e.engine + ': temporal speedZero observation required');
    // Adjacent-time drift: SIGNED channel deltas recomputed from the raw bytes against the
    // independent CPU display-chain prediction (frozen <= 3 codes CPU-side).
    if (gpuA && gpuB) {
        for (const [i, point] of planned.entries()) {
            const cpuA = oracle.model(point.x, point.y, 640, 400, t.params, a.time).display;
            const cpuB = oracle.model(point.x, point.y, 640, 400, t.params, b.time).display;
            for (let c = 0; c < 3; c++) {
                const cpuDelta = cpuB[c] - cpuA[c];
                if (Math.abs(cpuDelta) > 3)
                    errors.push('temporal CPU drift exceeds frozen threshold at ' + point.x + ',' + point.y + '/' + c);
                const gpuDelta = gpuB[i].rgba[c] - gpuA[i].rgba[c];
                if (Math.abs(gpuDelta - cpuDelta) > oracle.BYTE_TOLERANCE + 3)
                    errors.push('temporal GPU drift disagrees with CPU at ' + point.x + ',' + point.y + '/' + c);
            }
        }
    }
}

function validateBoundaries(e, errors) {
    const plan = oracle.boundaryPlan(),
        rows = e.boundaries;
    if (
        !Array.isArray(rows) ||
        rows.length !== plan.length ||
        new Set(rows.map((b) => b.caseId)).size !== plan.length ||
        plan.some(
            (b) =>
                !rows.some(
                    (row) =>
                        row.caseId === b.caseId &&
                        row.parameter === b.parameter &&
                        row.boundary === b.boundary &&
                        row.value === b.value,
                ),
        )
    ) {
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
        const frozenInput = { ...defaults, [row.parameter]: row.value };
        if (row.boundary === 'invalid') {
            if (row.receipt.ok !== false || !Array.isArray(row.receipt.errors) || row.receipt.errors.length === 0)
                errors.push(`${label}: invalid accepted`);
            if (!same(row.after.params, row.before.params)) errors.push(`${label}: partial parameter application`);
            if (row.after.instance !== row.before.instance) errors.push(`${label}: rebuild on rejection`);
            if (row.after.updates !== row.before.updates) errors.push(`${label}: update on rejection`);
        } else {
            if (row.receipt.ok !== true) errors.push(`${label}: valid rejected`);
            else if (!same(row.after.params, frozenInput)) errors.push(`${label}: after params not frozen input`);
            if (Object.values(row.after.params ?? {}).some((v) => typeof v === 'number' && !Number.isFinite(v)))
                errors.push(`${label}: non-finite after param`);
            if (row.parameter === 'shape' && row.boundary === 'default') {
                if (row.after.instance !== row.before.instance) errors.push(`${label}: default rebuild`);
            } else if (row.after.instance !== row.before.instance || row.receipt.retirement !== null)
                errors.push(`${label}: uniform update must not rebuild`);
        }
    }
}
function validateInvalids(e, errors) {
    const invalids = e.invalids;
    if (!Array.isArray(invalids) || invalids.length !== INVALID_CASES.length) {
        errors.push(`${e.engine}: invalid case count ${invalids?.length} != ${INVALID_CASES.length}`);
        return;
    }
    for (const [index, frozen] of INVALID_CASES.entries()) {
        const row = invalids[index],
            label = `${e.engine}:invalid[${index}]`;
        if (!row || typeof row !== 'object') {
            errors.push(`${label}: object required`);
            continue;
        }
        if (row.case?.kind !== frozen.kind || row.case?.parameter !== frozen.parameter)
            errors.push(`${label}: frozen case ${row.case?.kind}/${row.case?.parameter}`);
        if (row.receipt?.ok !== false || !Array.isArray(row.receipt?.errors) || row.receipt.errors.length === 0)
            errors.push(`${label}: accepted`);
        else if (!row.receipt.errors.some((x) => x?.code === frozen.code && x?.parameter === frozen.parameter))
            errors.push(`${label}: error code ${frozen.code}/${frozen.parameter}`);
        if (row.before && row.after) {
            if (!same(row.after.params, row.before.params)) errors.push(`${label}: partial application`);
            if (row.after.instance !== row.before.instance) errors.push(`${label}: rebuild`);
            if (row.after.updates !== row.before.updates) errors.push(`${label}: update leak`);
        } else errors.push(`${label}: before/after observation`);
    }
}
function validateNormal(e, errors) {
    const n = e.normal;
    if (!n || typeof n !== 'object') {
        errors.push(`${e.engine}: native controls required`);
        return;
    }
    const param = n.parameter;
    if (
        !param?.before ||
        !param?.after ||
        param.after.params.turbulence === param.before.params.turbulence ||
        param.after.instance !== param.before.instance
    )
        errors.push(`${e.engine}: trusted parameter control`);
    if (!n.pause || n.pause.before.time !== n.pause.after.time) errors.push(`${e.engine}: pause clock`);
    if (!n.resume || n.resume.after.time <= n.resume.before.time) errors.push(`${e.engine}: resume clock`);
    if (!n.reset || !same(n.reset.params, oracle.defaults()) || n.reset.time !== 0)
        errors.push(`${e.engine}: reset state`);
    const events = Array.isArray(n.events) ? n.events : [];
    const order = ['parameter', 'pause', 'resume', 'reset', 'release'];
    let cursor = -1;
    for (const event of events) {
        const prefix = event.type.split(':')[0];
        const at = order.indexOf(prefix);
        if (at >= 0) {
            if (at < cursor) errors.push(`${e.engine}: trusted event order`);
            cursor = at;
        }
        if (at >= 0 && event.isTrusted !== true) errors.push(`${e.engine}: untrusted ${prefix}`);
    }
    if (cursor !== order.length - 1) errors.push(`${e.engine}: trusted control coverage`);
    const release = n.release;
    if (
        !release ||
        release.retirement?.refs?.length !== 3 ||
        JSON.stringify(release.retirement?.refs?.map((r) => r.kind)?.sort()) !==
            JSON.stringify([...oracle.OWNED_KINDS].sort()) ||
        release.retirement.refs.some((r) => r.before !== 1 || r.after !== 0) ||
        release.retirement.rendererUnbound !== true ||
        release.retirement.nodeRemoved !== true ||
        release.sceneCleared !== true ||
        release.listenerAdds !== release.listenerRemoves
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
    if (
        !recreated?.trace ||
        recreated.trace.refs?.length !== 3 ||
        recreated.trace.refs.some((r) => r.before !== 1 || r.after !== 0)
    )
        errors.push(`${e.engine}: recreate retirement`);
    if (recreated?.trace?.id !== undefined && recreated?.snapshot?.instance !== undefined) {
        if (recreated.trace.id === recreated.snapshot.instance)
            errors.push(`${e.engine}: recreated instance not distinct`);
        if (recreated.trace.idempotent !== false) errors.push(`${e.engine}: recreate trace idempotence flag`);
    }
    if (l.samePromise !== true) errors.push(`${e.engine}: release promise identity`);
    if (l.terminalCode !== 'LIQUID_DISPOSED') errors.push(`${e.engine}: terminal guard code`);
    if (!l.release?.sceneCleared || l.release.listenerAdds !== l.release.listenerRemoves)
        errors.push(`${e.engine}: terminal cleanup`);
}
function validateResize(e, errors) {
    const r = e.resize;
    if (!r || typeof r !== 'object') {
        errors.push(`${e.engine}: live resize required`);
        return;
    }
    if (!same(r.before?.canvas?.css, { width: 640, height: 400 }) || r.before?.canvas?.width !== 640)
        errors.push(`${e.engine}: resize start 640x400`);
    if (!same(r.after?.canvas?.css, { width: 480, height: 320 }) || r.after?.canvas?.width !== 480)
        errors.push(`${e.engine}: resize result 480x320`);
    // The resize phase must run under the frozen default presentation — no background-light
    // pollution from the visual phase. Verified on both snapshots and both GPU receipts.
    for (const [label, snap] of [
        ['before', r.before],
        ['after', r.after],
    ]) {
        if (!same(snap?.params, oracle.defaults())) errors.push(`${e.engine}: resize ${label} params not defaults`);
        if (snap?.linearDiagnostic !== false) errors.push(`${e.engine}: resize ${label} linearDiagnostic`);
        if (!same(snap?.background, BACKGROUND('default'))) errors.push(`${e.engine}: resize ${label} background`);
        if (!same(snap?.gpuReceipt?.background, BACKGROUND('default')))
            errors.push(`${e.engine}: resize ${label} gpuReceipt background`);
    }
    const frames = Array.isArray(r.resizeFrames) ? r.resizeFrames : [];
    if (frames.length < 3) errors.push(`${e.engine}: resize observation frames`);
    for (const [i, frame] of frames.entries()) {
        if (!frame?.canvas || frame.canvas.width !== 480 || frame.canvas.height !== 320)
            errors.push(`${e.engine}: resize frame ${i} backing`);
        if (i && frame.simulationStep <= frames[i - 1].simulationStep)
            errors.push(`${e.engine}: resize frame ${i} not advancing`);
    }
    checkPng(r, `${e.engine}:resize`, errors, { width: 480, height: 320 });
    try {
        const gpu = oracle.probeAudit(r.probe, oracle.defaults(), r.after.time, { width: 480, height: 320 });
        if (gpu.errors.length) errors.push({ engine: e.engine, stage: 'resize-probe', errors: gpu.errors.slice(0, 3) });
        const checked = oracle.pngAudit(path.resolve(ROOT, r.png.path), oracle.defaults(), r.after.time);
        if (checked.errors.length)
            errors.push({ engine: e.engine, stage: 'live-resize-presentation', errors: checked.errors.slice(0, 3) });
    } catch (error) {
        errors.push(`${e.engine}: resize audit ${String(error.message || error).split('\n')[0]}`);
    }
}
function validateFilesInner(report) {
    const errors = [];
    if (!report || typeof report !== 'object') return { ok: false, errors: ['report object required'] };
    if (report.schemaVersion !== 'e07-liquid-metal/1') return { ok: false, errors: ['schema'] };
    if (
        !Array.isArray(report.inputs) ||
        !Array.isArray(report.engines) ||
        !Array.isArray(report.requestedEngines) ||
        report.requestedEngines.length === 0
    )
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
        if (!Array.isArray(e.pageErrors) || e.pageErrors.length !== 0)
            errors.push(`${e.engine}: pageErrors must be an explicit empty array`);
        if (!Array.isArray(e.consoleErrors) || e.consoleErrors.length !== 0)
            errors.push(`${e.engine}: consoleErrors must be an explicit empty array`);
        if (
            !Array.isArray(e.shaderCompile) ||
            !e.shaderCompile.length ||
            e.shaderCompile.some((s) => s?.compiled !== true)
        )
            errors.push(`${e.engine}: shader compile`);
        if (e.pageClosed !== true) errors.push(`${e.engine}: page not closed`);
        if (e.browserClosed !== true) errors.push(`${e.engine}: browser not closed`);
        if (report.phase === 'performance') {
            const rows = e.performance || [];
            if (rows.length !== PERFORMANCE_PLAN.length)
                errors.push(`${e.engine}: performance rows ${rows.length} != ${PERFORMANCE_PLAN.length}`);
            for (const row of rows) {
                const p = profiles.find((q) => q.id === row?.profile?.id);
                if (!p) {
                    errors.push('unknown profile');
                    continue;
                }
                if (!same(row.profile, p)) errors.push(`${e.engine}: profile tuple mismatch`);
                errors.push(
                    ...performanceOracle.validatePerformance(row, p).errors.map((x) => `${e.engine}:${p.id}:${x}`),
                );
            }
        } else {
            validateCaptureTuples(e, errors);
            const resource = oracle.resourceAudit(e.resources);
            errors.push(...resource.errors.map((x) => `${e.engine}:resource:${x}`));
            validateTemporal(e, errors);
            validateBoundaries(e, errors);
            validateInvalids(e, errors);
            validateNormal(e, errors);
            validateLifecycle(e, errors);
            validateResize(e, errors);
        }
    }
    if (report.engines?.length !== engines?.length) errors.push('missing engine');
    if (report.phase === 'performance') {
        errors.push(...validatePerformanceEnvironment(report));
        const total = report.engines.reduce((n, e) => n + (e?.performance?.length || 0), 0);
        if (total !== engines.length * PERFORMANCE_PLAN.length)
            errors.push(`performance tuple total ${total} != ${engines.length * PERFORMANCE_PLAN.length}`);
        // Exact 6-tuple plan per engine: {profile, quality} pairs, quality bound to the frozen
        // tierStart snapshot (params.quality), no duplicates, no missing tiers.
        for (const e of report.engines || []) {
            if (!e || typeof e !== 'object') continue;
            const rows = e.performance || [];
            const seen = new Set();
            for (const row of rows) {
                const key = `${row?.profile?.id}/${row?.quality}`;
                if (seen.has(key)) errors.push(`${e.engine}: duplicate performance tuple ${key}`);
                seen.add(key);
                if (row?.tierStart?.params?.quality !== row?.quality)
                    errors.push(`${e.engine}: performance ${key} observed quality not frozen`);
                if (!same(row?.tierStart?.params, { ...row?.tierStart?.params, quality: row?.quality }))
                    errors.push(`${e.engine}: performance ${key} tierStart params inconsistent`);
            }
            const expectedKeys = PERFORMANCE_PLAN.map((row) => `${row.profile.id}/${row.quality}`).sort();
            if (JSON.stringify([...seen].sort()) !== JSON.stringify(expectedKeys))
                errors.push(`${e.engine}: performance plan tuples ${[...seen].sort()} != ${expectedKeys}`);
        }
    } else {
        if (report.cleanup?.serverClosed !== true) errors.push('owned server not closed');
        if (report.cleanup?.proxyClosed !== true) errors.push('proxy closure flag');
        if (report.cleanup?.errors?.length) errors.push('cleanup errors');
    }
    if (report.agentGate !== 'NOT_RUN') errors.push('agentGate must be NOT_RUN');
    if (report.subset !== true) errors.push('subset must be true');
    if (report.completed !== false) errors.push('completed must be false');
    if (typeof report.command !== 'string' || !report.command.includes('shaders-liquid-metal-browser.cjs'))
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
function validatePerformanceEnvironment(report) {
    const errors = [],
        environment = require('./shaders-browser-environment.cjs');
    if (!report.cleanup?.proxyClosed || !report.cleanup?.serverClosed || report.cleanup?.errors?.length)
        errors.push('owned HTTP servers not closed');
    if (!report.authorization || !report.command?.includes('--authorization=' + report.authorization))
        errors.push('exclusive performance authorization missing');
    for (const e of report.engines) {
        if (!e || typeof e !== 'object') continue;
        const rows = e.performance || [];
        if (rows.length !== PERFORMANCE_PLAN.length)
            errors.push(e.engine + ': performance rows != ' + PERFORMANCE_PLAN.length);
        for (const row of rows) {
            const tier = PERFORMANCE_PLAN.find((q) => q.profile.id === row?.profile?.id && q.quality === row?.quality);
            if (!tier) errors.push(e.engine + ': unknown performance tuple ' + row?.profile?.id + '/' + row?.quality);
        }
        for (const row of rows) {
            const p = profiles.find((q) => q.id === row?.profile?.id);
            if (!p) {
                errors.push('unknown profile');
                continue;
            }
            if (contract.canonical(row.profile) !== contract.canonical(p)) errors.push('profile tuple mismatch');
            const expected = {
                viewport: p.viewport,
                dpr: p.dpr,
                backing: { w: p.viewport.width * p.dpr, h: p.viewport.height * p.dpr },
                crossOriginIsolated: true,
                headers: { coop: 'same-origin', coep: 'require-corp' },
            };
            const check = environment.validateEnvironmentReceipt(row.environmentReceipt, expected);
            errors.push(...check.errors.map((x) => e.engine + ':' + p.id + ':' + x));
            const precision = row.precision,
                raw = precision?.allRaw;
            if (
                !Array.isArray(raw) ||
                !raw.length ||
                raw.some((v) => !Number.isFinite(v) || v <= 0) ||
                precision.positiveCount !== raw.length ||
                !Number.isFinite(precision.minimumPositiveDeltaMs) ||
                Math.abs(Math.min(...raw) - precision.minimumPositiveDeltaMs) > 1e-9 ||
                precision.crossOriginIsolated !== true ||
                precision.calls !== 25000
            )
                errors.push('complete clock calibration invalid');
            if (
                !row.release?.sceneCleared ||
                row.release.listenerAdds !== row.release.listenerRemoves ||
                row.release.retirement?.refs?.length !== 3 ||
                row.release.retirement.refs.some((r) => r.before !== 1 || r.after !== 0) ||
                row.release.retirement.rendererUnbound !== true ||
                row.release.retirement.nodeRemoved !== true ||
                row.pageClosed !== true
            )
                errors.push('performance owned release not observed');
            for (const [label, rs] of [
                ['update', row.updateCalls],
                ['command', row.commands],
                ['dispatch', row.draws],
            ])
                if (!Array.isArray(rs) || !rs.some((r) => r?.ms > 0))
                    errors.push(label + ' below observable resolution');
            if (
                row.httpDocument?.status !== row.environmentReceipt?.responseStatus ||
                row.httpDocument?.url !== row.environmentReceipt?.url
            )
                errors.push('HTTP receipt mismatch');
            // Single-pass contract: EVERY steady frame must show >= 1 beginRenderPass and the
            // native draw count must be >= 1. Missing command rows or zero-pass frames reject —
            // no length-based bypass.
            const steadyFrames = Array.isArray(row.frames) ? row.frames : [];
            const steadyIds = new Set((row.steadyFrameIds || []).map((x) => x));
            const passByFrame = new Map(),
                drawByFrame = new Map();
            for (const c of Array.isArray(row.commands) ? row.commands : []) {
                if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.frame)) {
                    errors.push('command row structure');
                    continue;
                }
                if (c.operation === 'beginRenderPass') passByFrame.set(c.frame, (passByFrame.get(c.frame) || 0) + 1);
            }
            for (const d of Array.isArray(row.draws) ? row.draws : []) {
                if (!d || typeof d !== 'object' || !Number.isSafeInteger(d.frame)) continue;
                drawByFrame.set(d.frame, (drawByFrame.get(d.frame) || 0) + (d.ms >= 0 ? 1 : 0));
            }
            const windowIds = steadyIds.size ? [...steadyIds] : steadyFrames.map((f) => f.frame);
            if (!windowIds.length) errors.push('steady window missing');
            for (const frame of windowIds) {
                if ((passByFrame.get(frame) || 0) < 1) errors.push(`frame ${frame} missing beginRenderPass`);
                if ((drawByFrame.get(frame) || 0) < 1) errors.push(`frame ${frame} missing native draw`);
            }
        }
    }
    return errors;
}
async function main(args = process.argv.slice(2)) {
    const value = (key) =>
        args
            .find((x) => x.startsWith(`--${key}=`))
            ?.split('=')
            .slice(1)
            .join('=');
    if (value('verify')) {
        const r = JSON.parse(fs.readFileSync(value('verify'), 'utf8'));
        const result = validateFiles(r);
        console.log(JSON.stringify(result));
        return result.ok ? 0 : 1;
    }
    const out = value('out');
    if (!out || fs.existsSync(out)) throw new Error('Explicit new --out required');
    const phase = value('phase') || 'functional',
        selected = value('browser') || 'all';
    if (
        !['functional', 'performance'].includes(phase) ||
        !['all', 'chromium', 'firefox', 'webkit'].includes(selected) ||
        args.some((a) => !a.startsWith('--'))
    )
        throw new Error('Invalid phase/browser/argument');
    if (phase === 'performance' && !value('authorization')) throw new Error('Exclusive --authorization required');
    const requestedEngines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected],
        startedAt = new Date().toISOString();
    const identity = currentIdentity();
    const report = {
        schemaVersion: 'e07-liquid-metal/1',
        phase,
        requestedEngines,
        startedAt,
        authorization: value('authorization') || null,
        command: [process.execPath, ...process.argv.slice(1)].join(' '),
        cwd: ROOT,
        identity,
        inputs: identity.inputs,
        reference: identity.reference,
        engines: [],
        agentGate: 'NOT_RUN',
        subset: true,
        completed: false,
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const artifacts = `${out.replace(/\.json$/, '')}-artifacts`;
    fs.mkdirSync(artifacts, { recursive: true });
    const buildLog = path.join(artifacts, 'build.log');
    const build = cp.spawnSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-liquid-metal.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8' },
    );
    fs.writeFileSync(
        buildLog,
        `command=node node_modules/typescript/bin/tsc -p tools/verify/shaders-liquid-metal.tsconfig.json\nexitCode=${build.status}\n${build.stdout}${build.stderr}`,
        { flag: 'wx' },
    );
    report.build = {
        command: 'node node_modules/typescript/bin/tsc -p tools/verify/shaders-liquid-metal.tsconfig.json',
        exitCode: build.status,
        raw: fileIdentity(buildLog),
    };
    const esbuild = require('esbuild'),
        { startExampleServer } = require('./competitive-example-server.cjs');
    const bundled = esbuild.buildSync({
        entryPoints: [path.join(ROOT, EXAMPLE, 'src/main.ts')],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        external: ['cocosair'],
        write: false,
    });
    report.build.bundleBytes = bundled.outputFiles[0].contents.length;
    if (build.status !== 0) throw new Error('Strict TS failed');
    const server = await startExampleServer(ROOT);
    let isolationProxy = null;
    async function installProbe(page) {
        await page.addInitScript(() => {
            window.__liquidCompile = [];
            const proto = WebGL2RenderingContext.prototype,
                original = proto.compileShader;
            proto.compileShader = function (shader) {
                original.call(this, shader);
                window.__liquidCompile.push({
                    compiled: this.getShaderParameter(shader, this.COMPILE_STATUS),
                    log: this.getShaderInfoLog(shader) || '',
                    source: this.getShaderSource(shader),
                });
            };
            const live = { buffer: new Set(), texture: new Set() },
                identities = new WeakMap(),
                events = [];
            let id = 0;
            for (const [kind, create, destroy] of [
                ['buffer', 'createBuffer', 'deleteBuffer'],
                ['texture', 'createTexture', 'deleteTexture'],
            ]) {
                const oldCreate = proto[create],
                    oldDestroy = proto[destroy];
                proto[create] = function (...args) {
                    const object = oldCreate.apply(this, args);
                    if (object) {
                        const ownID = ++id;
                        identities.set(object, ownID);
                        live[kind].add(ownID);
                        events.push({ kind, operation: create, id: ownID });
                    }
                    return object;
                };
                proto[destroy] = function (object) {
                    const ownID = object && identities.get(object);
                    const result = oldDestroy.call(this, object);
                    if (ownID) {
                        live[kind].delete(ownID);
                        events.push({
                            kind,
                            operation: destroy,
                            id: ownID,
                            nativeAliveAfter: kind === 'buffer' ? this.isBuffer(object) : this.isTexture(object),
                        });
                    }
                    return result;
                };
            }
            window.__liquidGfx = () => ({
                bufferCount: live.buffer.size,
                textureCount: live.texture.size,
                events: [...events],
                scope: 'all native GL objects in the single Cocos context since pre-import prototype instrumentation',
            });
        });
    }
    try {
        if (phase === 'performance') isolationProxy = await startIsolationProxy(server);
        for (const engine of requestedEngines) {
            const browser = await require('playwright')[engine].launch({
                ...shaderLaunchOptions(engine),
                headless: true,
            });
            const e = {
                engine,
                browserVersion: browser.version(),
                pageErrors: [],
                consoleErrors: [],
                captures: [],
                boundaries: [],
                performance: [],
                pageClosed: false,
                dpr2PageClosed: false,
                browserClosed: false,
            };
            report.engines.push(e);
            const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
            page.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
            page.on('console', (x) => {
                if (x.type() === 'error') e.consoleErrors.push(x.text());
            });
            await installProbe(page);
            try {
                if (phase === 'performance') {
                    await page.close();
                    e.pageClosed = page.isClosed();
                    for (const planEntry of PERFORMANCE_PLAN) {
                        const profile = planEntry.profile;
                        const perfPage = await browser.newPage({
                            viewport: profile.viewport,
                            deviceScaleFactor: profile.dpr,
                        });
                        const perfEntry = { profile, quality: planEntry.quality };
                        e.performance.push(perfEntry);
                        let ready = false,
                            timingStarted = false,
                            timingStopped = false;
                        perfPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        perfPage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        try {
                            await installProbe(perfPage);
                            const expected = {
                                viewport: profile.viewport,
                                dpr: profile.dpr,
                                backing: {
                                    w: profile.viewport.width * profile.dpr,
                                    h: profile.viewport.height * profile.dpr,
                                },
                                crossOriginIsolated: true,
                                headers: { coop: 'same-origin', coep: 'require-corp' },
                            };
                            const envReceipt = await navigateWithDPRRepair(
                                perfPage,
                                isolationProxy.origin + '/' + EXAMPLE + '/?test=1&_isolate=1',
                                expected,
                            );
                            perfEntry.environmentReceipt = envReceipt;
                            if (!envReceipt.ok) throw Error('Environment: ' + envReceipt.errors.join('; '));
                            await perfPage.waitForFunction(() => window.__liquid?.ready, null, { timeout: 60000 });
                            ready = true;
                            const precision = await perfPage.evaluate(() => {
                                const start = performance.now();
                                let previous = start,
                                    minimum = Infinity;
                                const positives = [];
                                for (let i = 0; i < 25000; i++) {
                                    const now = performance.now(),
                                        delta = now - previous;
                                    if (delta > 0) {
                                        positives.push(delta);
                                        minimum = Math.min(minimum, delta);
                                    }
                                    previous = now;
                                }
                                return {
                                    crossOriginIsolated,
                                    calls: 25000,
                                    startedAtMs: start,
                                    endedAtMs: performance.now(),
                                    minimumPositiveDeltaMs: Number.isFinite(minimum) ? minimum : null,
                                    positiveCount: positives.length,
                                    allRaw: positives,
                                    clock: 'performance.now wall-clock quantization',
                                    zeroMeaning:
                                        'Zero observed durations are below observable timer precision, not zero cost',
                                };
                            });
                            // Freeze the tier for THIS window and observe the actual state
                            // (params snapshot) before the timed window starts.
                            await perfPage.evaluate(
                                (quality) => window.__liquid.set({ ...window.__liquid.snapshot().params, quality }),
                                planEntry.quality,
                            );
                            await perfPage.evaluate(() => window.__liquid.step(0));
                            perfEntry.tierStart = await perfPage.evaluate(() => window.__liquid.snapshot());
                            await perfPage.evaluate(() => window.__liquid.startPerformance());
                            timingStarted = true;
                            await perfPage.waitForTimeout(6000);
                            const metrics = await perfPage.evaluate(() => window.__liquid.stopPerformance());
                            timingStopped = true;
                            const gfxObjects = await perfPage.evaluate(() => window.__liquidGfx());
                            Object.assign(perfEntry, {
                                ...metrics,
                                gfxObjects,
                                precision,
                                httpDocument: {
                                    url: envReceipt.url,
                                    status: envReceipt.responseStatus,
                                    deliveredHeaders: envReceipt.deliveredHeaders,
                                    method: 'Real HTTP isolation proxy; exact source bytes; no route.fulfill',
                                },
                            });
                            e.shaderCompile = [
                                ...(e.shaderCompile || []),
                                ...(await perfPage.evaluate(() => window.__liquidCompile)),
                            ];
                        } catch (error) {
                            perfEntry.error = String(error.stack || error);
                            e.error = perfEntry.error;
                        } finally {
                            try {
                                if (timingStarted && !timingStopped)
                                    perfEntry.failureStop = await perfPage.evaluate(() =>
                                        window.__liquid.stopPerformance(),
                                    );
                            } catch (error) {
                                e.pageErrors.push('failure stop: ' + String(error.stack || error));
                            }
                            try {
                                const constructed = ready || (await perfPage.evaluate(() => !!window.__liquid?.ready));
                                if (constructed)
                                    perfEntry.release = await perfPage.evaluate(() => window.__liquid.release());
                            } catch (error) {
                                e.pageErrors.push('release: ' + String(error.stack || error));
                            }
                            await perfPage.close();
                            perfEntry.pageClosed = perfPage.isClosed();
                        }
                    }
                } else {
                    const normalPage = await browser.newPage({
                        viewport: { width: 640, height: 400 },
                        deviceScaleFactor: 1,
                    });
                    normalPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                    normalPage.on('console', (x) => {
                        if (x.type() === 'error') e.consoleErrors.push(x.text());
                    });
                    await normalPage.goto(`${server.origin}/${EXAMPLE}/`);
                    await normalPage.waitForFunction(() => window.__liquid?.ready);
                    await normalPage.waitForTimeout(250);
                    const parameterBefore = await normalPage.evaluate(() => window.__liquid.snapshot());
                    await normalPage.locator('[data-parameter=turbulence]').focus();
                    await normalPage.keyboard.press('ArrowRight');
                    const parameterAfter = await normalPage.evaluate(() => window.__liquid.snapshot());
                    await normalPage.keyboard.press('Home');
                    await normalPage.locator('#pause').click();
                    const pauseBefore = await normalPage.evaluate(() => window.__liquid.snapshot());
                    await normalPage.waitForTimeout(160);
                    const pauseAfter = await normalPage.evaluate(() => window.__liquid.snapshot());
                    await normalPage.locator('#resume').click();
                    const resumeBefore = await normalPage.evaluate(() => window.__liquid.snapshot());
                    await normalPage.waitForTimeout(200);
                    const resumeAfter = await normalPage.evaluate(() => window.__liquid.snapshot());
                    // Native-reset capture: a one-shot bubble listener freezes the post-reset
                    // snapshot (time===0) at the trusted click, before the native pacer advances.
                    const { INSTALL_RESET_CAPTURE, READ_RESET_CAPTURE } = require('./shaders-native-reset-capture.cjs');
                    const resetInstall = await normalPage.evaluate(INSTALL_RESET_CAPTURE, '__liquid');
                    if (!resetInstall?.ok) throw Error('reset capture install failed: ' + resetInstall?.error);
                    await normalPage.locator('#reset').click();
                    const resetCapture = await normalPage.evaluate(READ_RESET_CAPTURE);
                    if (!resetCapture?.snapshot) throw Error('reset capture missing after click');
                    const reset = resetCapture.snapshot;
                    // Real trusted release: click the button, await the page's cached release
                    // promise (the same instance the click handler started), read events after.
                    await normalPage.locator('#release').click();
                    const nativeRelease = await normalPage.evaluate(() => window.__liquid.release());
                    const eventsAfterRelease = await normalPage.evaluate(() => window.__liquid.snapshot().events);
                    e.normal = {
                        parameter: { before: parameterBefore, after: parameterAfter },
                        pause: { before: pauseBefore, after: pauseAfter },
                        resume: { before: resumeBefore, after: resumeAfter },
                        reset,
                        events: eventsAfterRelease,
                        release: nativeRelease,
                    };
                    await normalPage.close();
                    await page.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                    await page.waitForFunction(() => window.__liquid?.ready);
                    let dpr2Page = null;
                    try {
                        for (const [dpr, ids] of [
                            [1, CAPTURES.map(([id]) => id)],
                            [2, DPR2],
                        ]) {
                            let capturePage = page;
                            if (dpr === 2) {
                                // DPR 2 functional set runs on a fresh page with deviceScaleFactor 2.
                                dpr2Page = capturePage = await browser.newPage({
                                    viewport: { width: 640, height: 400 },
                                    deviceScaleFactor: 2,
                                });
                                capturePage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                                capturePage.on('console', (x) => {
                                    if (x.type() === 'error') e.consoleErrors.push(x.text());
                                });
                                await installProbe(capturePage);
                                await capturePage.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                                await capturePage.waitForFunction(() => window.__liquid?.ready, null, {
                                    timeout: 60000,
                                });
                            }
                            for (const id of ids) {
                                const [, patch] = CAPTURES.find(([captureId]) => captureId === id),
                                    params = { ...oracle.defaults(), ...patch },
                                    presentation = { background: BACKGROUND(id), linearDiagnostic: false };
                                await capturePage.evaluate((p) => window.__liquid.setPresentation(p), presentation);
                                const setBefore = await capturePage.evaluate(() => window.__liquid.snapshot());
                                const setReceipt = await capturePage.evaluate((p) => window.__liquid.set(p), params);
                                await capturePage.evaluate((t) => window.__liquid.setTime(t), CAPTURE_TIME);
                                const snapshot = await capturePage.evaluate(() => window.__liquid.step(0));
                                await capturePage.waitForTimeout(30);
                                const png = path.join(artifacts, `${engine}-${id}-dpr${dpr}.png`);
                                await capturePage.screenshot({ path: png });
                                const probe = await capturePage.evaluate(() => window.__liquid.linearProbe());
                                const audit = oracle.pngAudit(png, params, CAPTURE_TIME, presentation);
                                const probeCheck = oracle.probeAudit(probe, params, CAPTURE_TIME, {
                                    width: 640 * dpr,
                                    height: 400 * dpr,
                                });
                                e.captures.push({
                                    id,
                                    dpr,
                                    params,
                                    time: CAPTURE_TIME,
                                    presentation,
                                    snapshot,
                                    set: { before: setBefore, receipt: setReceipt, after: snapshot },
                                    png: fileIdentity(png),
                                    probe,
                                    audit,
                                    probeCheck,
                                });
                                console.log(
                                    JSON.stringify({
                                        engine,
                                        capture: id,
                                        dpr,
                                        errors: [...audit.errors, ...probeCheck.errors].slice(0, 2),
                                    }),
                                );
                            }
                        }
                    } finally {
                        if (dpr2Page) {
                            await dpr2Page.close().catch(() => {});
                            e.dpr2PageClosed = dpr2Page.isClosed();
                        } else e.dpr2PageClosed = true;
                    }
                    // GPU temporal evidence on the same page: determinism (retire/recreate,
                    // same seed/params/time), adjacent-time drift against the CPU prediction,
                    // and the speed-0 freeze. Raw readPixels come from the AFTER_DRAW receipt.
                    await page.evaluate((p) => window.__liquid.setPresentation(p), {
                        background: BACKGROUND('default'),
                        linearDiagnostic: false,
                    });
                    await page.evaluate((p) => window.__liquid.set(p), oracle.defaults());
                    await page.evaluate((t) => window.__liquid.setTime(t), CAPTURE_TIME);
                    await page.evaluate(() => window.__liquid.step(0));
                    const temporalA = await page.evaluate(() => window.__liquid.snapshot());
                    const temporalPngA = path.join(artifacts, engine + '-temporal-a.png');
                    // A submitted frame is not necessarily presented yet. Keep simulation time
                    // frozen while waiting for the compositor, as in the live-resize capture.
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: temporalPngA });
                    const temporalProbeA = await page.evaluate(() => window.__liquid.linearProbe());
                    // Determinism: retire + recreate, re-freeze the same state, re-read.
                    await page.evaluate(() => window.__liquid.recreate());
                    await page.evaluate((p) => window.__liquid.set(p), oracle.defaults());
                    await page.evaluate((t) => window.__liquid.setTime(t), CAPTURE_TIME);
                    const temporalDet = await page.evaluate(() => window.__liquid.step(0));
                    const determinismEqual = await page.evaluate(
                        (a) => JSON.stringify(a) === JSON.stringify(window.__liquid.snapshot().pixels),
                        temporalA.pixels,
                    );
                    // Adjacent time: t = 0.27.
                    await page.evaluate((t) => window.__liquid.setTime(t), 0.27);
                    const temporalB = await page.evaluate(() => window.__liquid.step(0));
                    const temporalPngB = path.join(artifacts, engine + '-temporal-b.png');
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: temporalPngB });
                    const temporalProbeB = await page.evaluate(() => window.__liquid.linearProbe());
                    // Speed-0 freeze: two very different times must render identically.
                    await page.evaluate((p) => window.__liquid.set(p), { ...oracle.defaults(), speed: 0 });
                    await page.evaluate((t) => window.__liquid.setTime(t), CAPTURE_TIME);
                    const speedZeroA = await page.evaluate(() => window.__liquid.step(0));
                    await page.evaluate((t) => window.__liquid.setTime(t), 5.5);
                    const speedZeroB = await page.evaluate(() => window.__liquid.step(0));
                    const speedZeroEqual = await page.evaluate(
                        (a) => JSON.stringify(a) === JSON.stringify(window.__liquid.snapshot().pixels),
                        speedZeroA.pixels,
                    );
                    e.temporal = {
                        params: oracle.defaults(),
                        a: {
                            time: CAPTURE_TIME,
                            snapshot: temporalA,
                            presentationWaitMs: 80,
                            png: fileIdentity(temporalPngA),
                            probe: temporalProbeA,
                        },
                        b: {
                            time: 0.27,
                            snapshot: temporalB,
                            presentationWaitMs: 80,
                            png: fileIdentity(temporalPngB),
                            probe: temporalProbeB,
                        },
                        determinism: { equal: determinismEqual, snapshot: temporalDet },
                        speedZero: {
                            params: { ...oracle.defaults(), speed: 0 },
                            a: speedZeroA,
                            b: speedZeroB,
                            equal: speedZeroEqual,
                        },
                    };
                    await page.evaluate((p) => window.__liquid.set(p), oracle.defaults());
                    await page.evaluate(() => window.__liquid.step(0));
                    for (const b of oracle.boundaryPlan()) {
                        const params = { ...oracle.defaults(), [b.parameter]: b.value };
                        const before = await page.evaluate(() => window.__liquid.snapshot());
                        const receipt = await page.evaluate((p) => window.__liquid.set(p), params);
                        if (receipt.ok) await page.evaluate(() => window.__liquid.step(0));
                        const after = await page.evaluate(() => window.__liquid.snapshot());
                        e.boundaries.push({ ...b, params, before, receipt, after });
                    }
                    const invalids = await page.evaluate(async () => {
                        const base = window.__liquid.snapshot().params;
                        const cases = [
                            { kind: 'null', parameter: '$', input: null },
                            { kind: 'unknown', parameter: 'unknown', input: { ...base, unknown: 1 } },
                            { kind: 'nan', parameter: 'turbulence', input: { ...base, turbulence: NaN } },
                            { kind: 'infinity', parameter: 'turbulence', input: { ...base, turbulence: Infinity } },
                            { kind: 'shape', parameter: 'shape', input: { ...base, shape: 'triangle' } },
                            { kind: 'seed', parameter: 'seed', input: { ...base, seed: 9 } },
                        ];
                        const before = window.__liquid.snapshot();
                        const receipts = await Promise.all(cases.map((c) => window.__liquid.set(c.input)));
                        const after = window.__liquid.snapshot();
                        return cases.map((c, i) => ({
                            case: { kind: c.kind, parameter: c.parameter },
                            receipt: receipts[i],
                            before,
                            after,
                        }));
                    });
                    e.invalids = invalids;
                    // The background-light capture leaves a light presentation behind; the
                    // resource/resize phase runs under the frozen default presentation.
                    await page.evaluate((p) => window.__liquid.setPresentation(p), {
                        background: BACKGROUND('default'),
                        linearDiagnostic: false,
                    });
                    await page.evaluate((p) => window.__liquid.set(p), oracle.defaults());
                    await page.evaluate(() => window.__liquid.step(0));
                    e.resources = await page.evaluate(() => window.__liquid.cycles());
                    const before = await page.evaluate(() => window.__liquid.snapshot());
                    await page.setViewportSize({ width: 480, height: 320 });
                    await page.waitForTimeout(250);
                    const resizeFrames = await page.evaluate(async () => {
                        const rows = [];
                        for (let i = 0; i < 5; i++) rows.push(await window.__liquid.step(0));
                        return rows;
                    });
                    const after = resizeFrames.at(-1);
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    const resizePng = path.join(artifacts, `${engine}-live-resize.png`);
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: resizePng });
                    const resizeProbe = await page.evaluate(() => window.__liquid.linearProbe());
                    const resizeAudit = oracle.pngAudit(resizePng, oracle.defaults(), before.time);
                    const resizeProbeCheck = oracle.probeAudit(resizeProbe, oracle.defaults(), before.time, {
                        width: 480,
                        height: 320,
                    });
                    e.resize = {
                        before,
                        after,
                        resizeFrames,
                        png: fileIdentity(resizePng),
                        probe: resizeProbe,
                        audit: resizeAudit,
                        probeCheck: resizeProbeCheck,
                        presentationWaitMs: 80,
                    };
                    const recreated = await page.evaluate(() => window.__liquid.recreate());
                    const terminal = await page.evaluate(async () => {
                        const x = window.__liquid.release(),
                            y = window.__liquid.release();
                        const release = await x;
                        let terminalCode;
                        try {
                            await window.__liquid.step(0);
                        } catch (error) {
                            terminalCode = error.code;
                        }
                        return { release, samePromise: x === y, terminalCode };
                    });
                    e.lifecycle = { recreated, ...terminal };
                    e.shaderCompile = await page.evaluate(() => window.__liquidCompile);
                }
            } catch (error) {
                e.error = String(error.stack || error);
            } finally {
                await page.close().catch(() => {});
                e.pageClosed = page.isClosed();
                await browser.close();
                e.browserClosed = !browser.isConnected();
            }
        }
    } finally {
        report.cleanup = { proxyClosed: phase !== 'performance', serverClosed: false, errors: [] };
        try {
            if (isolationProxy) {
                await isolationProxy.close();
                report.cleanup.proxyClosed = isolationProxy.closed;
            }
        } catch (error) {
            report.cleanup.errors.push(String(error.stack || error));
        }
        try {
            await server.close();
            report.cleanup.serverClosed = true;
        } catch (error) {
            report.cleanup.errors.push(String(error.stack || error));
        }
        report.endedAt = new Date().toISOString();
        report.validation = validateFiles(report);
        report.scopePassed = report.validation.ok;
        report.exitCode = report.scopePassed ? 0 : 1;
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify({ out, scopePassed: report.scopePassed, errors: report.validation.errors.slice(0, 5) }),
        );
    }
    return report.exitCode;
}
module.exports = {
    main,
    validateTemporal,
    PERFORMANCE_PLAN,
    validateFiles,
    validatePerformanceEnvironment,
    INPUTS,
    SDK,
    REFERENCE,
    CAPTURES,
    DPR2,
    VISUAL_PLAN,
    INVALID_CASES,
    profiles,
    currentIdentity,
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
